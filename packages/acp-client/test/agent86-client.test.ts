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
