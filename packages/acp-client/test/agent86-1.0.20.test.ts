// agent86 1.0.19 and 1.0.20's ACP additions, from recorded messages: file diffs, locations, the
// search kind, usage and cost, compaction, agent86's state events, and their absence.
import type { AnyMessage } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  advertisesState,
  Agent86Client,
  applyEvent,
  applyUpdate,
  CLIENT_CAPABILITIES,
  endTurn,
  initialState,
  parseEvent,
  parseEventParams,
  startTurn,
  type SessionState,
  type ToolEntry,
} from "../src/index.ts";
import { RECORDED } from "./fixtures/agent86-1.0.20.ts";
import { DOCUMENTED } from "./fixtures/agent86-documented.ts";
import { streamPair } from "./pair.ts";

type Note = { params: { update: unknown } };
const fold = (state: SessionState, ...notes: Note[]) =>
  notes.reduce((s, n) => applyUpdate(s, n.params.update as never, 0), state);
const event = (note: { params: unknown }) => parseEventParams(note.params)!.event;
const tool = (state: SessionState) => state.entries.find((e) => e.kind === "tool") as ToolEntry;

describe("file diffs and locations (agent86 1.0.19)", () => {
  it("keeps a write's diff apart from its text, with the location and first changed line", () => {
    let state = fold(initialState("s1", "/work"), RECORDED.editToolCall);
    expect(tool(state).locations).toEqual([{ path: "/work/README.md" }]);
    expect(tool(state).diffs).toBeUndefined();
    state = fold(state, RECORDED.editCompleted);
    expect(tool(state).diffs).toEqual([
      {
        path: "/work/README.md",
        oldText: "Teh quick brown fox\n",
        newText: "The quick brown fox\n",
      },
    ]);
    expect(tool(state).locations).toEqual([{ path: "/work/README.md", line: 1 }]);
    // The text item is still the result, without a stray "diff <path>" line.
    expect(tool(state).output).toMatch(/^Edited README\.md \(1 replacement\)\.\n--- a\/README\.md/);
    expect(tool(state).output).not.toMatch(/^diff /m);
  });

  it("keeps a new file's diff with no old text", () => {
    const state = fold(initialState("s1", "/work"), {
      params: {
        update: {
          ...RECORDED.writeCompleted.params.update,
          sessionUpdate: "tool_call",
          title: "write_file",
        },
      },
    });
    expect(tool(state).diffs).toEqual([
      { path: "/work/notes.txt", oldText: null, newText: "first line\nsecond line\n" },
    ]);
  });

  it("falls back to the text for a replayed session (no diff items, no locations)", () => {
    const state = fold(
      initialState("s1", "/work"),
      RECORDED.replayedEditToolCall,
      RECORDED.replayedEditCompleted,
    );
    expect(tool(state).diffs).toBeUndefined();
    expect(tool(state).locations).toBeUndefined();
    expect(tool(state).output).toContain("+++ b/README.md");
  });

  it("reports search tools with their own kind", () => {
    const state = fold(initialState("s1", "/work"), RECORDED.searchToolCall, RECORDED.findToolCall);
    const kinds = state.entries.map((e) => (e as ToolEntry).toolKind);
    expect(kinds).toEqual(["search", "search"]);
  });

  it("drops a location with no usable path, and a line that is not a positive whole number", () => {
    const state = fold(initialState("s1", "/work"), {
      params: {
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "t",
          title: "read_file",
          locations: [{ path: "/work/a", line: 0 }, { line: 3 }, { path: "/work/b", line: 7 }],
        },
      },
    });
    expect(tool(state).locations).toEqual([{ path: "/work/a" }, { path: "/work/b", line: 7 }]);
  });
});

describe("usage_update (agent86 1.0.20)", () => {
  it("keeps the context window and the session's cost, the latest winning", () => {
    let state = fold(initialState("s1", "/work"), RECORDED.usagePriced);
    expect(state.usage).toEqual({
      used: 12,
      size: 8192,
      cost: { amount: 0.000156, currency: "USD" },
    });
    state = fold(state, RECORDED.usagePricedLater);
    expect(state.usage?.cost?.amount).toBe(0.000192);
  });

  it("has no cost when agent86 has no price for the model (left out, or null)", () => {
    let state = fold(initialState("s1", "/work"), RECORDED.usagePriced, DOCUMENTED.usageUnpriced);
    expect(state.usage).toEqual({ used: 53000, size: 200000 });
    state = fold(state, DOCUMENTED.usageNullCost);
    expect(state.usage).toEqual({ used: 61000, size: 200000 });
  });

  it("keeps a currency other than dollars", () => {
    const state = fold(initialState("s1", "/work"), DOCUMENTED.usageEuro);
    expect(state.usage?.cost).toEqual({ amount: 0.045, currency: "EUR" });
  });
});

describe("compaction_update (agent86 1.0.20, opt-in)", () => {
  it("shows a completed compaction as one entry with its summary", () => {
    const state = fold(initialState("s1", "/work"), DOCUMENTED.compactionCompleted);
    expect(state.entries).toMatchObject([
      {
        kind: "compaction",
        compactionId: "cmp-1",
        status: "completed",
        summary: "The user fixed a typo in README.md.",
      },
    ]);
  });

  it("shows a failed one with why", () => {
    const state = fold(initialState("s1", "/work"), DOCUMENTED.compactionFailed);
    expect(state.entries).toMatchObject([
      { kind: "compaction", status: "failed", error: "the summary request failed: HTTP 500" },
    ]);
  });

  it("keys updates and streamed chunks by compactionId, so a compaction stays one entry", () => {
    const state = fold(
      initialState("s1", "/work"),
      DOCUMENTED.compactionInProgress,
      DOCUMENTED.compactionChunk,
      {
        params: {
          update: {
            sessionUpdate: "compaction_update",
            compactionId: "cmp-3",
            status: "completed",
          },
        },
      },
    );
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({ status: "completed", summary: "Streamed summary." });
  });
});

describe("agent86's state events (1.0.20)", () => {
  it("reads the advertisement only in the version this client knows", () => {
    expect(advertisesState(RECORDED.initialize.agentCapabilities)).toBe(true);
    expect(advertisesState({ loadSession: true })).toBe(false);
    expect(advertisesState({ _meta: { "com.maetek.agent86/state": { version: 2 } } })).toBe(false);
    expect(advertisesState({ _meta: { "com.maetek.agent86/state": true } })).toBe(false);
  });

  it("asks for compaction and the state events in initialize", () => {
    expect(CLIENT_CAPABILITIES).toMatchObject({
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
      session: { compaction: {} },
      _meta: { "com.maetek.agent86/state": true },
    });
  });

  it("collects the main agent's calls and the turn's spend against the cap", () => {
    let state = startTurn(initialState("s1", "/work"), "fix the typo", 0);
    state = applyEvent(state, event(RECORDED.modelCallMain), 0);
    state = applyEvent(state, event(RECORDED.modelCallMainAfterTool), 0);
    expect(state.turnSpend).toMatchObject({ priced: true, capUsd: 0.5, spentUsd: 0.000087 });
    expect(state.turnSpend?.calls).toEqual([
      expect.objectContaining({
        step: 1,
        model: "test-model",
        costUsd: 0.000036,
        toolCalls: ["edit_file"],
      }),
      expect.objectContaining({ step: 2, costUsd: 0.000051, stopReason: "end_turn" }),
    ]);
    // The turn's end keeps it; the next turn starts afresh.
    state = endTurn(state, "end_turn", 10);
    expect(state.entries.at(-1)).toMatchObject({ kind: "turn-end", spend: { spentUsd: 0.000087 } });
    expect(startTurn(state, "next", 20).turnSpend).toBeUndefined();
  });

  it("reads an unpriced call as unknown, not free", () => {
    const parsed = event(DOCUMENTED.modelCallUnpriced);
    expect(parsed).toMatchObject({ kind: "model_call", priced: false, costCapUsd: null });
    expect("costUsd" in parsed).toBe(false);
    const state = applyEvent(initialState("s1", "/work"), parsed, 0);
    expect(state.turnSpend).toMatchObject({ priced: false, capUsd: null });
  });

  it("puts a sub-agent's status, calls, and cost on its delegation card", () => {
    let state = fold(initialState("s1", "/work"), RECORDED.delegationToolCall);
    state = applyEvent(state, event(RECORDED.subagentStarted), 0);
    expect(state.subagents["agent-helper-1"]).toMatchObject({
      agent: "helper",
      task: "say hello",
      status: "running",
      calls: [],
    });
    state = applyEvent(state, event(RECORDED.modelCallSubagent), 0);
    expect(state.subagents["agent-helper-1"]?.calls).toHaveLength(1);
    // A sub-agent's call is on its card, not in the main agent's list.
    expect(state.turnSpend?.calls).toEqual([]);
    state = applyEvent(state, event(RECORDED.subagentFinished), 0);
    expect(state.subagents["agent-helper-1"]).toMatchObject({
      status: "done",
      costUsd: 0.000171,
      inputTokens: 12,
      outputTokens: 9,
    });
  });

  it("matches a sub-agent's call that arrives before its start", () => {
    const state = applyEvent(initialState("s1", "/work"), event(RECORDED.modelCallSubagent), 0);
    expect(state.subagents["agent-helper-1"]).toMatchObject({ agent: "helper", status: "running" });
  });

  it("adds a guardrail notice, from findings as a string or a list", () => {
    let state = applyEvent(initialState("s1", "/work"), event(RECORDED.guardrail), 0);
    state = applyEvent(state, event(DOCUMENTED.guardrailList), 0);
    expect(state.entries).toMatchObject([
      {
        kind: "guardrail",
        stage: "ingress_input",
        findings: ["injection:override-instructions", "injection:prompt-extraction"],
      },
      { kind: "guardrail", stage: "egress", findings: ["secret:aws-key", "pii:email"] },
    ]);
  });

  it("keeps the routed model, until the next turn", () => {
    const state = applyEvent(initialState("s1", "/work"), event(DOCUMENTED.route), 0);
    expect(state.routedModel).toBe("openrouter:qwen/qwen3-coder");
    expect(startTurn(state, "again", 1).routedModel).toBeUndefined();
  });

  it("ignores unknown kinds, unknown fields, and malformed events", () => {
    expect(parseEvent({ kind: "something_new", ts: 1 })).toBeUndefined();
    expect(parseEvent({ kind: "subagent", phase: "paused", card: "c" })).toBeUndefined();
    expect(parseEvent({ kind: "route" })).toBeUndefined();
    expect(parseEvent("model_call")).toBeUndefined();
    expect(parseEventParams({ event: { kind: "route", model: "m" } })).toBeUndefined();
    expect(parseEventParams(null)).toBeUndefined();
    const extra = parseEvent({ kind: "route", model: "m", colour: "blue", ts: "soon" });
    expect(extra).toEqual({ kind: "route", model: "m" });
  });
});

/** A scripted agent86 that writes the given messages as they are, so nothing validates them. */
function rawAgent(initResult: unknown) {
  const pair = streamPair();
  const writer = pair.agent.writable.getWriter();
  const received: AnyMessage[] = [];
  const send = (message: unknown) => writer.write(message as AnyMessage);
  void (async () => {
    const reader = pair.agent.readable.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      received.push(value);
      const m = value as { id?: number; method?: string };
      if (m.method === "initialize") await send({ jsonrpc: "2.0", id: m.id, result: initResult });
      if (m.method === "session/new")
        await send({ jsonrpc: "2.0", id: m.id, result: { sessionId: "s1", configOptions: [] } });
      if (m.method === "session/request_permission") continue;
    }
  })();
  return { stream: pair.client, send, received };
}

/** Let the client read what was sent. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("Agent86Client with agent86 1.0.20", () => {
  it("sends the opt-ins in initialize, and turns the state events on when advertised", async () => {
    const agent = rawAgent(RECORDED.initialize);
    const client = await Agent86Client.connect(agent.stream);
    const init = agent.received.find((m) => (m as { method?: string }).method === "initialize") as {
      params: { clientCapabilities: unknown };
    };
    expect(init.params.clientCapabilities).toMatchObject({
      session: { compaction: {} },
      _meta: { "com.maetek.agent86/state": true },
    });
    expect(client.features.state).toBe(true);
    const session = await client.newSession("/work");
    await agent.send(RECORDED.modelCallMain);
    await agent.send(RECORDED.guardrail);
    await settle();
    expect(session.getState().turnSpend?.calls).toHaveLength(1);
    expect(session.getState().entries.map((e) => e.kind)).toEqual(["guardrail"]);
    client.close();
  });

  it("ignores state events when agent86 does not advertise them (an older agent86)", async () => {
    const { _meta: _ignored, ...plain } = RECORDED.initialize.agentCapabilities;
    const agent = rawAgent({ ...RECORDED.initialize, agentCapabilities: plain });
    const client = await Agent86Client.connect(agent.stream);
    expect(client.features.state).toBe(false);
    const session = await client.newSession("/work");
    await agent.send(RECORDED.modelCallMain);
    await agent.send(RECORDED.guardrail);
    await settle();
    expect(session.getState().turnSpend).toBeUndefined();
    expect(session.getState().entries).toEqual([]);
    client.close();
  });

  it("skips an update kind it does not know, an event it cannot read, and carries on", async () => {
    const agent = rawAgent(RECORDED.initialize);
    const client = await Agent86Client.connect(agent.stream);
    const session = await client.newSession("/work");
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      await agent.send({
        jsonrpc: "2.0",
        method: "session/update",
        params: { sessionId: "s1", update: { sessionUpdate: "hologram_update", depth: 3 } },
      });
      await agent.send({
        jsonrpc: "2.0",
        method: "_com.maetek.agent86/session/event",
        params: { sessionId: "s1", event: { kind: "from_the_future" } },
      });
      await agent.send({ jsonrpc: "2.0", method: "_com.maetek.agent86/session/event", params: 7 });
      await agent.send(RECORDED.usagePriced);
      await settle();
    } finally {
      console.error = original;
    }
    expect(session.getState().usage?.used).toBe(12);
    expect(session.getState().entries).toEqual([]);
    client.close();
  });

  it("keeps the diff and location of a permission request, and falls back to text without them", async () => {
    const agent = rawAgent(RECORDED.initialize);
    const client = await Agent86Client.connect(agent.stream);
    const session = await client.newSession("/work");
    await agent.send(RECORDED.editToolCall);
    await agent.send({ ...RECORDED.editPermission, id: 101 });
    await settle();
    const [request] = session.getState().permissions;
    expect(request?.diffs).toEqual([
      {
        path: "/work/README.md",
        oldText: "Teh quick brown fox\n",
        newText: "The quick brown fox\n",
      },
    ]);
    expect(request?.locations).toEqual([{ path: "/work/README.md", line: 1 }]);
    expect(request?.text).toContain("--- a/README.md");
    session.reject(request!.id);

    // A file over 256 KiB: the text item only.
    await agent.send({
      ...RECORDED.editPermission,
      id: 102,
      params: {
        ...RECORDED.editPermission.params,
        toolCall: {
          ...RECORDED.editPermission.params.toolCall,
          content: DOCUMENTED.bigEditPermissionContent,
        },
      },
    });
    await settle();
    const [big] = session.getState().permissions;
    expect(big?.diffs).toBeUndefined();
    expect(big?.text).toContain("+++ b/big.txt");
    client.close();
  });
});
