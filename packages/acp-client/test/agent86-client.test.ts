import { agent, methods, type AgentContext } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { Agent86Client, type SessionState } from "../src/index.ts";
import { streamPair } from "./pair.ts";

const INIT = {
  protocolVersion: 1,
  agentCapabilities: { loadSession: true },
  agentInfo: { name: "agent86", version: "1.0.15" },
};

const say = (
  ctx: AgentContext,
  sessionId: string,
  kind: "agent_message_chunk" | "agent_thought_chunk",
  text: string,
) =>
  ctx.notify(methods.client.session.update, {
    sessionId,
    update: { sessionUpdate: kind, content: { type: "text", text } },
  });

/** A scripted agent: replies to each prompt, honours cancel, and fails on "fail". */
function scriptedAgent() {
  const cancelled = new Set<string>();
  const received: { method: string; params: unknown }[] = [];
  let clock = 0;
  const app = agent({ name: "scripted" })
    .onRequest(methods.agent.initialize, () => INIT)
    .onRequest(methods.agent.session.new, ({ params }) => {
      received.push({ method: "session/new", params });
      return {
        sessionId: "s1",
        configOptions: [
          {
            id: "mode",
            name: "Approval mode",
            type: "select" as const,
            currentValue: "ask",
            options: [{ value: "ask", name: "ask" }],
          },
        ],
      };
    })
    .onNotification(methods.agent.session.cancel, ({ params }) => {
      received.push({ method: "session/cancel", params });
      cancelled.add(params.sessionId);
    })
    .onRequest(methods.agent.session.prompt, async ({ params, client: ctx }) => {
      const text = params.prompt.map((b) => (b.type === "text" ? b.text : "")).join("");
      received.push({ method: "session/prompt", params });
      if (text === "fail") throw new Error("HTTP 400: the model refuses");
      if (text === "edit") {
        await ctx.notify(methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "t1",
            title: "edit_file(a)",
            kind: "edit",
            status: "pending",
          },
        });
        const answer = await ctx.request(methods.client.session.requestPermission, {
          sessionId: params.sessionId,
          toolCall: {
            toolCallId: "t1",
            title: "edit_file(a)",
            kind: "edit",
            content: [{ type: "content", content: { type: "text", text: "--- a/x\n+++ b/x" } }],
          },
          options: [
            { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
            { optionId: "reject-once", name: "Reject", kind: "reject_once" },
          ],
        });
        received.push({ method: "permission answer", params: answer });
        const allowed =
          answer.outcome.outcome === "selected" && answer.outcome.optionId === "allow-once";
        await ctx.notify(methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: "t1",
            status: allowed ? "completed" : "failed",
            content: [
              {
                type: "content",
                content: {
                  type: "text",
                  text: allowed ? "Edited x" : "Not executed: declined by user.",
                },
              },
            ],
          },
        });
        return {
          stopReason: cancelled.has(params.sessionId)
            ? ("cancelled" as const)
            : ("end_turn" as const),
        };
      }
      if (text === "slow") {
        for (let i = 0; i < 1000 && !cancelled.has(params.sessionId); i++) {
          await say(ctx, params.sessionId, "agent_message_chunk", `${i} `);
          await new Promise((resolve) => setTimeout(resolve, 2));
        }
        return {
          stopReason: cancelled.has(params.sessionId)
            ? ("cancelled" as const)
            : ("end_turn" as const),
        };
      }
      await say(ctx, params.sessionId, "agent_thought_chunk", "Thinking.");
      await say(ctx, params.sessionId, "agent_message_chunk", "You said: ");
      await say(ctx, params.sessionId, "agent_message_chunk", text);
      return { stopReason: "end_turn" as const };
    });
  return { app, received, now: () => ++clock };
}

async function setup() {
  const pair = streamPair();
  const mock = scriptedAgent();
  const agentConnection = mock.app.connect(pair.agent);
  const client = await Agent86Client.connect(pair.client, { now: mock.now });
  const session = await client.newSession("/work");
  return { client, session, mock, agentConnection };
}

const kinds = (s: SessionState) => s.entries.map((e) => e.kind);

describe("AgentSession", () => {
  it("creates a session with no MCP servers and keeps its config options", async () => {
    const { client, session, mock, agentConnection } = await setup();
    expect(mock.received[0]).toEqual({
      method: "session/new",
      params: { cwd: "/work", mcpServers: [] },
    });
    expect(session.id).toBe("s1");
    expect(session.getState().configOptions[0]?.id).toBe("mode");
    client.close();
    agentConnection.close();
  });

  it("runs a turn and notifies subscribers as it streams", async () => {
    const { client, session, agentConnection } = await setup();
    let notified = 0;
    const unsubscribe = session.subscribe(() => notified++);
    await session.prompt("hello");
    const state = session.getState();
    expect(kinds(state)).toEqual(["user", "thought", "agent", "turn-end"]);
    expect(state.entries[2]).toMatchObject({ text: "You said: hello" });
    expect(state.entries[3]).toMatchObject({ stopReason: "end_turn" });
    expect(notified).toBeGreaterThanOrEqual(5);
    unsubscribe();
    client.close();
    agentConnection.close();
  });

  it("refuses a second prompt while one runs", async () => {
    const { client, session, agentConnection } = await setup();
    const first = session.prompt("slow");
    await expect(session.prompt("again")).rejects.toThrow("already running");
    await session.cancel();
    await first;
    client.close();
    agentConnection.close();
  });

  it("cancels a running turn", async () => {
    const { client, session, mock, agentConnection } = await setup();
    const turn = session.prompt("slow");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await session.cancel();
    expect(session.getState().turn.cancelRequested).toBe(true);
    await turn;
    const state = session.getState();
    expect(mock.received.some((r) => r.method === "session/cancel")).toBe(true);
    expect(state.entries.at(-2)).toMatchObject({ kind: "notice", text: "Cancelled." });
    expect(state.entries.at(-1)).toMatchObject({ kind: "turn-end", stopReason: "cancelled" });
    expect(state.turn.running).toBe(false);
    client.close();
    agentConnection.close();
  });

  it("does nothing on cancel when no turn runs", async () => {
    const { client, session, mock, agentConnection } = await setup();
    await session.cancel();
    expect(mock.received.some((r) => r.method === "session/cancel")).toBe(false);
    client.close();
    agentConnection.close();
  });

  it("shows agent86's error and lets the next turn run", async () => {
    const { client, session, agentConnection } = await setup();
    await session.prompt("fail");
    expect(session.getState().entries[1]).toMatchObject({
      kind: "notice",
      level: "error",
      hint: "For details, run: agent86 trace show -s s1",
    });
    await session.prompt("ok");
    expect(session.getState().entries.at(-1)).toMatchObject({
      kind: "turn-end",
      stopReason: "end_turn",
    });
    client.close();
    agentConnection.close();
  });

  it("marks the session closed when the connection ends", async () => {
    const { client, session, agentConnection } = await setup();
    const turn = session.prompt("slow");
    await new Promise((resolve) => setTimeout(resolve, 10));
    agentConnection.close();
    client.close();
    await turn;
    expect(session.getState().closed).toBeTruthy();
    expect(session.getState().turn.running).toBe(false);
    await expect(session.prompt("x")).rejects.toThrow("closed");
  });
});

describe("permission requests", () => {
  async function waitForPermission(session: Awaited<ReturnType<typeof setup>>["session"]) {
    for (let i = 0; i < 200 && session.getState().permissions.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const request = session.getState().permissions[0];
    if (!request) throw new Error("no permission request arrived");
    return request;
  }

  it("waits for the user, then allows", async () => {
    const { client, session, mock, agentConnection } = await setup();
    const turn = session.prompt("edit");
    const request = await waitForPermission(session);
    expect(request).toMatchObject({ toolCallId: "t1", text: "--- a/x\n+++ b/x" });
    expect(session.getState().entries[1]).toMatchObject({
      kind: "tool",
      preview: "--- a/x\n+++ b/x",
    });
    session.respond(request.id, "allow-once");
    await turn;
    expect(mock.received.find((r) => r.method === "permission answer")?.params).toEqual({
      outcome: { outcome: "selected", optionId: "allow-once" },
    });
    expect(session.getState().entries[1]).toMatchObject({
      status: "completed",
      decision: "allowed",
      output: "Edited x",
    });
    client.close();
    agentConnection.close();
  });

  it("rejects with the reject option", async () => {
    const { client, session, mock, agentConnection } = await setup();
    const turn = session.prompt("edit");
    session.reject((await waitForPermission(session)).id);
    await turn;
    expect(mock.received.find((r) => r.method === "permission answer")?.params).toEqual({
      outcome: { outcome: "selected", optionId: "reject-once" },
    });
    expect(session.getState().entries[1]).toMatchObject({ status: "failed", decision: "rejected" });
    client.close();
    agentConnection.close();
  });

  it("answers an open request `cancelled` when the turn is cancelled", async () => {
    const { client, session, mock, agentConnection } = await setup();
    const turn = session.prompt("edit");
    await waitForPermission(session);
    await session.cancel();
    await turn;
    expect(mock.received.find((r) => r.method === "permission answer")?.params).toEqual({
      outcome: { outcome: "cancelled" },
    });
    const state = session.getState();
    expect(state.permissions).toEqual([]);
    expect(state.entries[1]).toMatchObject({ decision: "cancelled" });
    expect(state.entries.at(-1)).toMatchObject({ kind: "turn-end", stopReason: "cancelled" });
    client.close();
    agentConnection.close();
  });

  it("ignores an answer with an option that was not offered", async () => {
    const { client, session, agentConnection } = await setup();
    const turn = session.prompt("edit");
    const request = await waitForPermission(session);
    session.respond(request.id, "allow-always");
    expect(session.getState().permissions).toHaveLength(1);
    session.respond(request.id, "allow-once");
    await turn;
    client.close();
    agentConnection.close();
  });
});
