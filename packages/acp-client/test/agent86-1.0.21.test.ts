// agent86 1.0.21's ACP additions, from messages recorded against the real agent86 1.0.21: who asks
// on a sub-agent's permission request, the questions queue (the approval inbox), `session/resume`,
// and a session that survives agent86 stopping partway through a turn; and their absence.
import type { AnyMessage } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  advertisesResume,
  Agent86Client,
  applyEvent,
  continueState,
  inboxItems,
  initialState,
  interruptTurn,
  markClosed,
  parseAsker,
  parseEvent,
  parseQuestion,
  requestCancel,
  startTurn,
  type AgentSession,
  type SessionState,
  type ToolEntry,
} from "../src/index.ts";
import { RECORDED } from "./fixtures/agent86-1.0.20.ts";
import {
  CANCELLED_TURN,
  CRASH_LOAD_REPLAY,
  CRASH_TURN,
  PARALLEL_TURN,
  RECORDED_1021,
} from "./fixtures/agent86-1.0.21.ts";
import { streamPair } from "./pair.ts";

type Message = { id?: number | string; method?: string; params?: Record<string, unknown> };

/**
 * A scripted agent86 that answers the session requests from `answers` and otherwise writes what
 * the test sends, as it is. `end()` closes its side, as agent86 exiting would.
 */
function scriptedAgent(initResult: unknown, answers: Record<string, unknown> = {}) {
  const pair = streamPair();
  const writer = pair.agent.writable.getWriter();
  const received: Message[] = [];
  const send = (message: unknown) => writer.write(message as AnyMessage);
  void (async () => {
    const reader = pair.agent.readable.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      const m = value as Message;
      received.push(m);
      if (m.method === "initialize") await send({ jsonrpc: "2.0", id: m.id, result: initResult });
      else if (m.method === "session/new")
        await send({ jsonrpc: "2.0", id: m.id, result: { sessionId: "s1", configOptions: [] } });
      else if (m.method && m.method in answers) {
        const answer = answers[m.method];
        await send(
          answer && typeof answer === "object" && "error" in answer
            ? { ...answer, jsonrpc: "2.0", id: m.id }
            : { jsonrpc: "2.0", id: m.id, result: answer },
        );
      }
    }
  })();
  return {
    stream: pair.client,
    send,
    received,
    sent: (method: string) => received.filter((m) => m.method === method),
    end: () => writer.close(),
  };
}

/** Let the client read what was sent. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const LEGACY_INIT = RECORDED.initialize;
const INIT = RECORDED_1021.initialize;

/** Start a turn whose prompt agent86 has not answered yet. */
async function startedTurn(
  agent: ReturnType<typeof scriptedAgent>,
  session: AgentSession,
  text: string,
) {
  const done = session.prompt(text);
  await settle();
  const prompt = agent.sent("session/prompt").at(-1)!;
  return {
    done,
    answer: (stopReason: string) =>
      agent.send({ jsonrpc: "2.0", id: prompt.id, result: { stopReason } }),
  };
}

async function play(agent: ReturnType<typeof scriptedAgent>, messages: readonly unknown[]) {
  for (const message of messages) await agent.send(message);
  await settle();
}

describe("detecting agent86 1.0.21", () => {
  it("offers session/resume only when sessionCapabilities.resume is an object", () => {
    expect(advertisesResume(INIT.agentCapabilities)).toBe(true);
    expect(advertisesResume(LEGACY_INIT.agentCapabilities)).toBe(false);
    expect(advertisesResume({ sessionCapabilities: { resume: null } })).toBe(false);
    expect(advertisesResume({ sessionCapabilities: { resume: true } })).toBe(false);
    expect(advertisesResume(undefined)).toBe(false);
  });

  it("reports both features from initialize, and neither from agent86 1.0.20's resume", async () => {
    const client = await Agent86Client.connect(scriptedAgent(INIT).stream);
    expect(client.features).toEqual({ state: true, resume: true });
    client.close();
    const legacy = await Agent86Client.connect(scriptedAgent(LEGACY_INIT).stream);
    expect(legacy.features).toEqual({ state: true, resume: false });
    legacy.close();
  });
});

describe("who asks (a sub-agent's permission request)", () => {
  const permission = PARALLEL_TURN.find((m) => m.method === "session/request_permission")!;

  it("reads the recorded asker", () => {
    expect(parseAsker(permission.params._meta)).toEqual({
      card: "call_1794849720061_0",
      run: 1,
      agent: "writer",
      depth: 1,
      steps: 1,
      costUsd: 0.000036,
      turnCostUsd: 0.000108,
      costCapUsd: 0.5,
    });
  });

  it("reads a worktree, a nested depth, no cap, and keeps redacted values as they are", () => {
    expect(
      parseAsker({
        "com.maetek.agent86/subagent": {
          card: "call_abc",
          run: 3,
          agent: "writer",
          depth: 2,
          worktree: { path: "/work/.agent86/worktrees/${secret:NAME}", branch: "agent86/writer-3" },
          steps: 2,
          cost_usd: 0.036,
          turn_cost_usd: 0.108,
          cost_cap_usd: null,
          from_the_future: true,
        },
      }),
    ).toEqual({
      card: "call_abc",
      run: 3,
      agent: "writer",
      depth: 2,
      worktree: { path: "/work/.agent86/worktrees/${secret:NAME}", branch: "agent86/writer-3" },
      steps: 2,
      costUsd: 0.036,
      turnCostUsd: 0.108,
      costCapUsd: null,
    });
  });

  it("is the main agent when the entry is absent or unusable", () => {
    expect(parseAsker(undefined)).toBeUndefined();
    expect(parseAsker({})).toBeUndefined();
    expect(parseAsker({ "com.maetek.agent86/subagent": { agent: "writer" } })).toBeUndefined();
    expect(parseAsker({ "com.maetek.agent86/subagent": "writer" })).toBeUndefined();
  });

  it("keeps the asker on the pending request, and none for the main agent", async () => {
    const agent = scriptedAgent(INIT);
    const client = await Agent86Client.connect(agent.stream);
    const session = await client.newSession("/work");
    await startedTurn(agent, session, "parallel writers");
    await play(agent, PARALLEL_TURN.slice(0, 21));
    const [request] = session.getState().permissions;
    expect(request?.toolCallId).toBe("call_1794849720061_0/1");
    expect(request?.asker?.agent).toBe("writer");
    expect(request?.asker?.card).toBe("call_1794849720061_0");
    // The main agent's own request: no _meta, no asker.
    session.respond(request!.id, "allow-once");
    await agent.send(RECORDED.editToolCall);
    await agent.send({ ...RECORDED.editPermission, id: 99 });
    await settle();
    expect(session.getState().permissions.at(-1)?.asker).toBeUndefined();
    client.close();
  });

  it("ignores who asks when agent86 does not offer its state events", async () => {
    const { _meta: _ignored, ...plain } = INIT.agentCapabilities;
    const agent = scriptedAgent({ ...INIT, agentCapabilities: plain });
    const client = await Agent86Client.connect(agent.stream);
    const session = await client.newSession("/work");
    await startedTurn(agent, session, "parallel writers");
    await play(agent, PARALLEL_TURN.slice(0, 21));
    expect(session.getState().permissions[0]?.asker).toBeUndefined();
    expect(session.getState().questions).toBeUndefined();
    client.close();
  });
});

describe("the questions queue", () => {
  const questions = PARALLEL_TURN.filter(
    (m) => m.method === "_com.maetek.agent86/session/event" && m.params.event?.kind === "questions",
  ).map((m) => parseEvent(m.params.event));

  it("reads the recorded events: asking, waiting behind it, the next, then empty", () => {
    expect(questions).toEqual([
      {
        kind: "questions",
        ts: 1794849720.1202807,
        asking: {
          kind: "approval",
          tool: "write_file",
          call: "call_1794849720061_0/1",
          agent: "writer",
          card: "call_1794849720061_0",
        },
        waiting: [],
      },
      expect.objectContaining({
        waiting: [
          {
            kind: "approval",
            tool: "write_file",
            call: "call_1794849720061_1/1",
            agent: "writer",
            card: "call_1794849720061_1",
          },
        ],
      }),
      expect.objectContaining({
        asking: expect.objectContaining({ call: "call_1794849720061_1/1" }),
        waiting: [],
      }),
      expect.objectContaining({ asking: null, waiting: [] }),
    ]);
  });

  it("reads a main agent's question and a specialty, leaving omitted fields absent", () => {
    expect(parseQuestion({ kind: "approval", tool: "run_command", call: "call_9" })).toEqual({
      kind: "approval",
      tool: "run_command",
      call: "call_9",
    });
    expect(
      parseQuestion({ kind: "specialty", tool: "delegate", call: "call_7", subject: "reviewer" }),
    ).toEqual({ kind: "specialty", tool: "delegate", call: "call_7", subject: "reviewer" });
  });

  it("skips question kinds and fields it does not know, and an event without `asking`", () => {
    expect(
      parseEvent({
        kind: "questions",
        asking: { kind: "secret", subject: "TOKEN" },
        waiting: [
          { kind: "limit", subject: "steps" },
          { kind: "approval", call: "c", hue: 3 },
        ],
        colour: "blue",
      }),
    ).toEqual({ kind: "questions", asking: null, waiting: [{ kind: "approval", call: "c" }] });
    expect(parseEvent({ kind: "questions", waiting: [] })).toBeUndefined();
    expect(parseEvent({ kind: "questions", asking: null, waiting: "x" })).toEqual({
      kind: "questions",
      asking: null,
      waiting: [],
    });
  });

  it("follows the queue through the recorded turn, the event before its request and card", async () => {
    const agent = scriptedAgent(INIT);
    const client = await Agent86Client.connect(agent.stream);
    const session = await client.newSession("/work");
    await startedTurn(agent, session, "parallel writers");

    // The first question is announced before its tool_call.
    await play(agent, PARALLEL_TURN.slice(0, 18));
    let items = inboxItems(session.getState());
    expect(items).toEqual([expect.objectContaining({ position: "asking", hasCard: false })]);
    expect(items[0]!.request).toBeUndefined();

    // Then the card, the second question waiting behind it, and the request.
    await play(agent, PARALLEL_TURN.slice(18, 21));
    items = inboxItems(session.getState());
    expect(items.map((i) => [i.position, i.question.call, i.hasCard, !!i.request])).toEqual([
      ["asking", "call_1794849720061_0/1", true, true],
      ["waiting", "call_1794849720061_1/1", false, false],
    ]);

    // Answered here: left out until agent86 moves on, without an empty event in between.
    session.respond(items[0]!.request!.id, "allow-once");
    expect(inboxItems(session.getState()).map((i) => i.question.call)).toEqual([
      "call_1794849720061_1/1",
    ]);
    await play(agent, PARALLEL_TURN.slice(21, 24));
    items = inboxItems(session.getState());
    expect(items.map((i) => [i.position, i.question.call, !!i.request])).toEqual([
      ["asking", "call_1794849720061_1/1", true],
    ]);
    session.respond(items[0]!.request!.id, "allow-once");

    await play(agent, PARALLEL_TURN.slice(24));
    expect(session.getState().questions).toBeUndefined();
    expect(inboxItems(session.getState())).toEqual([]);
    client.close();
  });

  it("empties when the turn is cancelled, and stays empty", async () => {
    const agent = scriptedAgent(INIT);
    const client = await Agent86Client.connect(agent.stream);
    const session = await client.newSession("/work");
    const turn = await startedTurn(agent, session, "parallel writers");
    await play(agent, CANCELLED_TURN.slice(0, 21));
    expect(inboxItems(session.getState())).toHaveLength(2);
    await session.cancel();
    expect(session.getState().questions).toBeUndefined();
    expect(agent.received.at(-1)).toMatchObject({ result: { outcome: { outcome: "cancelled" } } });
    expect(agent.sent("session/cancel")).toHaveLength(1);
    // A late event listing them again changes nothing; agent86's last one is empty anyway.
    await play(agent, [PARALLEL_TURN[19], ...CANCELLED_TURN.slice(21)]);
    expect(inboxItems(session.getState())).toEqual([]);
    await turn.answer("cancelled");
    await turn.done;
    expect(session.getState().questions).toBeUndefined();
    client.close();
  });

  it("clears at the end of a turn, on an error, and when the connection closes", () => {
    const running = startTurn(initialState("s1", "/work"), "go", 0);
    const queued = applyEvent(running, questions[1]!, 0);
    expect(queued.questions?.waiting).toHaveLength(1);
    expect(requestCancel(queued).questions).toBeUndefined();
    expect(markClosed(queued, "gone", 1).questions).toBeUndefined();
    // Outside a turn, an event is ignored.
    expect(applyEvent(initialState("s1", "/work"), questions[1]!, 0).questions).toBeUndefined();
  });
});

describe("session/resume", () => {
  const resumed = { ...RECORDED_1021.resumeResult.result };

  it("reopens with no replay, carrying on from the client's transcript", async () => {
    const first = scriptedAgent(INIT);
    const client = await Agent86Client.connect(first.stream);
    const session = await client.newSession("/work");
    const turn = await startedTurn(first, session, "parallel writers");
    await play(first, PARALLEL_TURN.slice(0, 21));
    session.respond(session.getState().permissions[0]!.id, "allow-once");
    await play(first, PARALLEL_TURN.slice(21, 24));
    session.respond(session.getState().permissions[0]!.id, "allow-once");
    await play(first, PARALLEL_TURN.slice(24));
    await turn.answer("end_turn");
    await turn.done;
    client.close();
    await settle();
    const before = session.getState();

    const second = scriptedAgent(INIT, { "session/resume": resumed });
    const again = await Agent86Client.connect(second.stream);
    const reopened = await again.resumeSession("s1", "/work", before);
    expect(second.sent("session/resume")).toEqual([
      expect.objectContaining({ params: { sessionId: "s1", cwd: "/work", mcpServers: [] } }),
    ]);
    expect(second.sent("session/load")).toEqual([]);
    const state = reopened.getState();
    expect(state.entries).toEqual(before.entries);
    expect(state.closed).toBeUndefined();
    expect(state.turn.running).toBe(false);
    expect(state.configOptions.map((o) => o.id)).toEqual(["mode", "model"]);
    expect(state.subagents).toEqual(before.subagents);
    // New updates carry on after the old entries, with fresh entry ids.
    await second.send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hi" } },
      },
    });
    await settle();
    const last = reopened.getState().entries.at(-1)!;
    expect(last).toMatchObject({ kind: "agent", text: "Hi" });
    expect(last.id).toBeGreaterThan(Math.max(...before.entries.map((e) => e.id)));
    again.close();
  });

  it("is refused locally when agent86 does not offer it, and passes agent86's errors on", async () => {
    const legacy = await Agent86Client.connect(scriptedAgent(LEGACY_INIT).stream);
    await expect(legacy.resumeSession("s1", "/work", undefined)).rejects.toThrow(/cannot resume/);
    legacy.close();
    const agent = scriptedAgent(INIT, { "session/resume": RECORDED_1021.unknownSession });
    const client = await Agent86Client.connect(agent.stream);
    await expect(client.resumeSession("no-such-session", "/work", undefined)).rejects.toThrow(
      /Session not found/,
    );
    client.close();
  });

  it("waits out a running turn, as a load does", async () => {
    const agent = scriptedAgent(INIT);
    const client = await Agent86Client.connect(agent.stream);
    const waiting: string[] = [];
    const pending = client.resumeSession("s1", "/work", undefined, {
      waitForTurn: true,
      retryMs: 10,
      onWaiting: () => waiting.push("waiting"),
    });
    for (let i = 0; i < 50 && agent.sent("session/resume").length === 0; i++) await settle();
    const [first] = agent.sent("session/resume");
    await agent.send({
      jsonrpc: "2.0",
      id: first!.id,
      error: { code: -32600, message: "A prompt turn is running; wait for its response" },
    });
    for (let i = 0; i < 50 && agent.sent("session/resume").length < 2; i++) await settle();
    const [, second] = agent.sent("session/resume");
    await agent.send({ jsonrpc: "2.0", id: second!.id, result: resumed });
    await pending;
    expect(waiting).toEqual(["waiting"]);
    client.close();
  });
});

describe("a session that survives agent86 stopping mid-turn", () => {
  const tool = (state: SessionState) =>
    state.entries.find((e) => e.kind === "tool") as ToolEntry | undefined;

  it("records that the connection closed during a turn, without calling it the turn's error", async () => {
    const agent = scriptedAgent(INIT);
    const client = await Agent86Client.connect(agent.stream);
    const session = await client.newSession("/work");
    const turn = await startedTurn(agent, session, "crash after reading");
    await play(agent, CRASH_TURN);
    const startedAt = session.getState().turn.startedAt;
    await agent.end();
    await turn.done;
    await settle();
    const state = session.getState();
    expect(state.closed).toBeTruthy();
    expect(state.closedDuringTurn).toEqual({ startedAt });
    expect(state.entries.some((e) => e.kind === "notice" && e.level === "error")).toBe(false);
    expect(state.entries.some((e) => e.kind === "turn-end")).toBe(false);
    expect(tool(state)?.status).toBe("completed");
  });

  it("resumes on a new agent86, the turn marked interrupted and its finished step kept", async () => {
    const agent = scriptedAgent(INIT);
    const client = await Agent86Client.connect(agent.stream);
    const session = await client.newSession("/work");
    const turn = await startedTurn(agent, session, "crash after reading");
    // A call still running when agent86 stopped.
    await play(agent, [
      ...CRASH_TURN,
      {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "call_late",
            title: "read_file",
            status: "in_progress",
          },
        },
      },
    ]);
    await agent.end();
    await turn.done;
    await settle();
    const before = session.getState();

    const next = scriptedAgent(INIT, { "session/resume": RECORDED_1021.resumeResult.result });
    const again = await Agent86Client.connect(next.stream);
    const reopened = await again.resumeSession("s1", "/work", before);
    reopened.markInterrupted(before.closedDuringTurn?.startedAt);
    const state = reopened.getState();
    const end = state.entries.at(-1);
    expect(end).toMatchObject({ kind: "turn-end", stopReason: "interrupted" });
    expect(tool(state)).toMatchObject({ toolCallId: "call_1794849721130_0", status: "completed" });
    expect(tool(state)?.interrupted).toBeUndefined();
    expect(
      state.entries.find((e) => e.kind === "tool" && e.toolCallId === "call_late"),
    ).toMatchObject({ interrupted: true });
    expect(
      state.entries.filter((e) => e.kind === "user").map((e) => (e as { text: string }).text),
    ).toEqual(["crash after reading"]);
    again.close();
  });

  it("or loads it, when the client has no copy: the finished step is replayed", async () => {
    const agent = scriptedAgent(INIT);
    const client = await Agent86Client.connect(agent.stream);
    const pending = client.loadSession("s1", "/work");
    for (let i = 0; i < 50 && agent.sent("session/load").length === 0; i++) await settle();
    await play(agent, CRASH_LOAD_REPLAY);
    await agent.send({
      jsonrpc: "2.0",
      id: agent.sent("session/load")[0]!.id,
      result: RECORDED_1021.resumeResult.result,
    });
    const session = await pending;
    session.markInterrupted();
    const kinds = session.getState().entries.map((e) => e.kind);
    expect(kinds).toEqual(["user", "tool", "user", "agent", "turn-end"]);
    expect(tool(session.getState())?.status).toBe("completed");
    client.close();
  });

  it("drops the old connection's requests, queue, and closed state when carried on", () => {
    let state = startTurn(initialState("s1", "/work"), "go", 5);
    state = applyEvent(state, { kind: "questions", asking: { kind: "approval" }, waiting: [] }, 6);
    state = markClosed(state, "agent86 exited", 7);
    const carried = continueState(state);
    expect(carried.closed).toBeUndefined();
    expect(carried.closedDuringTurn).toBeUndefined();
    expect(carried.questions).toBeUndefined();
    expect(carried.permissions).toEqual([]);
    const ended = interruptTurn(carried, 17, 5);
    expect(ended.entries.at(-1)).toMatchObject({ stopReason: "interrupted", durationMs: 12 });
  });
});
