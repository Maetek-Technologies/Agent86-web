import { describe, expect, it } from "vitest";
import {
  applyUpdate,
  endTurn,
  failTurn,
  initialState,
  markClosed,
  phase,
  requestCancel,
  startTurn,
  type SessionState,
  type SessionUpdate,
} from "../src/index.ts";

const text = (
  sessionUpdate: "agent_message_chunk" | "agent_thought_chunk" | "user_message_chunk",
  t: string,
) => ({ sessionUpdate, content: { type: "text", text: t } }) as SessionUpdate;

function run(state: SessionState, updates: SessionUpdate[], start = 100): SessionState {
  return updates.reduce((s, u, i) => applyUpdate(s, u, start + i), state);
}

const fresh = () => initialState("s1", "/work");

describe("a turn", () => {
  it("merges chunks into one thought and one answer, and closes the thought when the answer starts", () => {
    let s = startTurn(fresh(), "hi", 0);
    expect(phase(s)).toBe("Thinking…");
    s = run(s, [text("agent_thought_chunk", "Let me"), text("agent_thought_chunk", " think.")]);
    expect(phase(s)).toBe("Thinking…");
    s = run(s, [text("agent_message_chunk", "Hello"), text("agent_message_chunk", " there")], 200);
    expect(phase(s)).toBe("Writing…");
    s = endTurn(s, "end_turn", 500);

    expect(s.entries).toEqual([
      { kind: "user", id: 1, text: "hi" },
      { kind: "thought", id: 2, text: "Let me think.", startedAt: 100, endedAt: 200 },
      { kind: "agent", id: 3, text: "Hello there" },
      { kind: "turn-end", id: 4, stopReason: "end_turn", durationMs: 500 },
    ]);
    expect(s.turn).toEqual({ running: false, cancelRequested: false });
    expect(phase(s)).toBeUndefined();
  });

  it("closes an unfinished thought at the end of the turn", () => {
    let s = startTurn(fresh(), "hi", 0);
    s = run(s, [text("agent_thought_chunk", "hmm")]);
    s = endTurn(s, "end_turn", 300);
    expect(s.entries[1]).toMatchObject({ kind: "thought", endedAt: 300 });
  });

  it("starts a new thought after an answer", () => {
    let s = startTurn(fresh(), "hi", 0);
    s = run(s, [
      text("agent_thought_chunk", "a"),
      text("agent_message_chunk", "b"),
      text("agent_thought_chunk", "c"),
    ]);
    expect(s.entries.map((e) => e.kind)).toEqual(["user", "thought", "agent", "thought"]);
  });

  it("shows a cancel as a notice, and the phase while it is pending", () => {
    let s = startTurn(fresh(), "hi", 0);
    s = requestCancel(s);
    expect(s.turn.cancelRequested).toBe(true);
    expect(phase(s)).toBe("Cancelling…");
    expect(requestCancel(s)).toBe(s);
    s = endTurn(s, "cancelled", 50);
    expect(s.entries.slice(1)).toEqual([
      { kind: "notice", id: 2, level: "warning", text: "Cancelled." },
      { kind: "turn-end", id: 3, stopReason: "cancelled", durationMs: 50 },
    ]);
  });

  it("drops agent86's own [cancelled] marker, since the notice says it", () => {
    let s = startTurn(fresh(), "hi", 0);
    s = run(s, [
      text("agent_message_chunk", "word0 word1"),
      text("agent_message_chunk", " [cancelled]"),
    ]);
    s = endTurn(s, "cancelled", 50);
    expect(s.entries[1]).toMatchObject({ kind: "agent", text: "word0 word1" });

    let only = startTurn(fresh(), "hi", 0);
    only = run(only, [text("agent_message_chunk", "[cancelled]")]);
    only = endTurn(only, "cancelled", 50);
    expect(only.entries.map((e) => e.kind)).toEqual(["user", "notice", "turn-end"]);

    // Only on a cancel, and only at the end.
    let kept = startTurn(fresh(), "hi", 0);
    kept = run(kept, [text("agent_message_chunk", "write [cancelled] here")]);
    kept = endTurn(kept, "end_turn", 50);
    expect(kept.entries[1]).toMatchObject({ text: "write [cancelled] here" });
  });

  it("explains the step limit", () => {
    const s = endTurn(startTurn(fresh(), "hi", 0), "max_turn_requests", 10);
    expect(s.entries[1]).toMatchObject({
      kind: "notice",
      text: expect.stringContaining("step limit"),
    });
  });

  it("shows an error with the trace hint", () => {
    const s = failTurn(startTurn(fresh(), "hi", 0), "HTTP 400: bad", 10);
    expect(s.entries.slice(1)).toEqual([
      {
        kind: "notice",
        id: 2,
        level: "error",
        text: "HTTP 400: bad",
        hint: "For details, run: agent86 trace show -s s1",
      },
      { kind: "turn-end", id: 3, stopReason: "error", durationMs: 10 },
    ]);
    expect(s.turn.running).toBe(false);
  });

  it("ends a running turn when the connection closes", () => {
    const s = markClosed(startTurn(fresh(), "hi", 0), "gone", 5);
    expect(s.closed).toBe("gone");
    expect(s.turn.running).toBe(false);
    expect(markClosed(s, "again", 6)).toBe(s);
  });
});

describe("tool calls", () => {
  it("adds a call and updates it by id, and shows it in the phase", () => {
    let s = startTurn(fresh(), "list files", 0);
    s = run(s, [
      text("agent_thought_chunk", "I'll look."),
      {
        sessionUpdate: "tool_call",
        toolCallId: "t1",
        title: "list_dir .",
        name: "list_dir",
        kind: "read",
        status: "pending",
        rawInput: { path: "." },
      } as SessionUpdate,
    ]);
    expect(s.entries[1]).toMatchObject({ kind: "thought", endedAt: 101 });
    expect(phase(s)).toBe("Running list_dir…");
    s = applyUpdate(
      s,
      {
        sessionUpdate: "tool_call_update",
        toolCallId: "t1",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "a.txt\nb.txt" } }],
      } as SessionUpdate,
      300,
    );
    expect(s.entries[2]).toMatchObject({
      kind: "tool",
      toolCallId: "t1",
      name: "list_dir",
      toolKind: "read",
      status: "completed",
      rawInput: { path: "." },
      output: "a.txt\nb.txt",
    });
    expect(phase(s)).toBe("Thinking…");
  });

  it("ignores an update for an unknown call", () => {
    const s = fresh();
    expect(
      applyUpdate(s, { sessionUpdate: "tool_call_update", toolCallId: "nope" } as SessionUpdate, 0),
    ).toBe(s);
  });
});

describe("other updates", () => {
  it("replays a loaded session's user messages", () => {
    const s = run(fresh(), [
      text("user_message_chunk", "first "),
      text("user_message_chunk", "question"),
      text("agent_message_chunk", "answer"),
    ]);
    expect(s.entries.map((e) => [e.kind, "text" in e ? e.text : ""])).toEqual([
      ["user", "first question"],
      ["agent", "answer"],
    ]);
  });

  it("keeps the commands and config options", () => {
    let s = applyUpdate(
      fresh(),
      {
        sessionUpdate: "available_commands_update",
        availableCommands: [{ name: "cost", description: "Show cost" }],
      },
      0,
    );
    expect(s.commands).toEqual([{ name: "cost", description: "Show cost" }]);
    const options = [
      { id: "mode", name: "Approval mode", type: "select", currentValue: "ask", options: [] },
    ] as unknown as SessionState["configOptions"];
    s = applyUpdate(s, { sessionUpdate: "config_option_update", configOptions: options }, 0);
    expect(s.configOptions).toBe(options);
  });

  it("ignores update kinds it does not know", () => {
    const s = fresh();
    expect(applyUpdate(s, { sessionUpdate: "plan", entries: [] } as SessionUpdate, 0)).toBe(s);
  });
});
