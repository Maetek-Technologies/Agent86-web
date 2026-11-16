// @vitest-environment jsdom
// What the thread shows for agent86 1.0.19 and 1.0.20's additions, from recorded messages, and
// what it shows without them (an older agent86).
import {
  applyEvent,
  applyUpdate,
  endTurn,
  initialState,
  parseEventParams,
  startTurn,
  type Agent86Client,
  type AgentSession,
  type Entry,
  type PendingPermission,
  type SessionState,
  type ToolEntry,
} from "@agent86-web/acp-client";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RECORDED } from "../../acp-client/test/fixtures/agent86-1.0.20.ts";
import { DOCUMENTED } from "../../acp-client/test/fixtures/agent86-documented.ts";
import { ThreadContext } from "../src/thread/ThreadContext.ts";
import { ThreadHeader } from "../src/thread/ThreadHeader.tsx";
import { Transcript } from "../src/thread/Transcript.tsx";
import { ToolCard } from "../src/tools/ToolCard.tsx";

afterEach(cleanup);

type Note = { params: { update: unknown } };
const fold = (state: SessionState, ...notes: Note[]) =>
  notes.reduce((s, n) => applyUpdate(s, n.params.update as never, 0), state);
const event = (note: { params: unknown }) => parseEventParams(note.params)!.event;
const tool = (state: SessionState) => state.entries.find((e) => e.kind === "tool") as ToolEntry;

function renderCard(
  entry: ToolEntry,
  options: { permissions?: PendingPermission[]; state?: SessionState; expandAll?: boolean } = {},
) {
  const session = { respond: vi.fn(), reject: vi.fn() };
  render(
    <ThreadContext.Provider
      value={{
        session: session as unknown as AgentSession,
        permissions: options.permissions ?? [],
        expandAll: options.expandAll ?? false,
        cwd: "/work",
        subagents: options.state?.subagents ?? {},
      }}
    >
      <ToolCard entry={entry} />
    </ThreadContext.Provider>,
  );
}

const permission = (toolCall: {
  toolCallId: string;
  title: string;
  content: readonly unknown[];
  locations?: readonly { path: string; line?: number }[];
}): PendingPermission => {
  const text = toolCall.content
    .map((c) => c as { type: string; content?: { text?: string } })
    .filter((c) => c.type === "content")
    .map((c) => c.content?.text ?? "")
    .join("\n");
  const diffs = toolCall.content
    .filter((c) => (c as { type: string }).type === "diff")
    .map((c) => c as { path: string; oldText: string | null; newText: string })
    .map(({ path, oldText, newText }) => ({ path, oldText, newText }));
  return {
    id: 9,
    toolCallId: toolCall.toolCallId,
    title: toolCall.title,
    toolKind: "edit",
    text,
    ...(diffs.length ? { diffs } : {}),
    ...(toolCall.locations ? { locations: [...toolCall.locations] } : {}),
    options: [
      { optionId: "allow", name: "Allow once", kind: "allow_once" },
      { optionId: "reject", name: "Reject", kind: "reject_once" },
    ],
  };
};

describe("file diffs (agent86 1.0.19)", () => {
  it("shows the approval as one diff built from the whole file, not the text again", () => {
    const state = fold(initialState("s1", "/work"), RECORDED.editToolCall);
    renderCard(tool(state), { permissions: [permission(RECORDED.editPermission.params.toolCall)] });
    const panel = screen.getByRole("group", { name: "Approval needed: edit_file" });
    const diffs = within(panel).getAllByTestId("diff");
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.textContent).toContain("README.md");
    const rows = [...diffs[0]!.querySelectorAll("tr[data-kind]")].map((r) =>
      r.getAttribute("data-kind"),
    );
    expect(rows).toEqual(["hunk", "del", "add"]);
  });

  it("shows a new file's approval as all added lines", () => {
    renderCard(
      {
        ...tool(fold(initialState("s1", "/work"), RECORDED.editToolCall)),
        title: "write_file",
        toolCallId: RECORDED.writePermission.params.toolCall.toolCallId,
      },
      { permissions: [permission(RECORDED.writePermission.params.toolCall)] },
    );
    const diff = screen.getByTestId("diff");
    expect(diff.textContent).toContain("new file");
    const rows = [...diff.querySelectorAll("tr[data-kind]")].map((r) =>
      r.getAttribute("data-kind"),
    );
    expect(rows).toEqual(["hunk", "add", "add"]);
    expect(diff.textContent).not.toContain("new file: notes.txt (2 lines)");
  });

  it("shows the finished card's change once, from the diff item, below agent86's message", () => {
    const state = fold(initialState("s1", "/work"), RECORDED.editToolCall, RECORDED.editCompleted);
    renderCard(
      { ...tool(state), preview: "--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-Teh\n+The" },
      {
        expandAll: true,
      },
    );
    expect(screen.getAllByTestId("diff")).toHaveLength(1);
    expect(screen.getByText("Edited README.md (1 replacement).")).toBeTruthy();
    expect(screen.queryByText(/^diff \/work/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "whole file" }));
    expect(screen.getByRole("button", { name: "changes only" })).toBeTruthy();
  });

  it("falls back to the text diff without diff items (replayed, or an older agent86)", () => {
    const state = fold(
      initialState("s1", "/work"),
      RECORDED.replayedEditToolCall,
      RECORDED.replayedEditCompleted,
    );
    renderCard(tool(state), { expandAll: true });
    const diff = screen.getByTestId("diff");
    expect(
      [...diff.querySelectorAll("tr[data-kind]")].map((r) => r.getAttribute("data-kind")),
    ).toEqual(["hunk", "del", "add"]);
    expect(screen.queryByTestId("tool-location")).toBeNull();
    expect(screen.queryByRole("button", { name: "whole file" })).toBeNull();
  });

  it("falls back to the text in the approval for a file too big for a diff item", () => {
    const state = fold(initialState("s1", "/work"), RECORDED.editToolCall);
    renderCard(tool(state), {
      permissions: [
        permission({
          ...RECORDED.editPermission.params.toolCall,
          content: DOCUMENTED.bigEditPermissionContent,
        }),
      ],
    });
    expect(screen.getByTestId("diff").textContent).toContain("big.txt");
  });
});

describe("locations and the search kind (agent86 1.0.19)", () => {
  it("shows the file and first changed line, relative to the workspace, with a copy button", () => {
    const state = fold(initialState("s1", "/work"), RECORDED.editToolCall, RECORDED.editCompleted);
    renderCard(tool(state));
    expect(screen.getByTestId("tool-location").textContent).toBe("README.md:1");
    expect(screen.getByRole("button", { name: "copy" }).getAttribute("title")).toBe("Copy path");
  });

  it("gives search tools their own icon and label", () => {
    renderCard(tool(fold(initialState("s1", "/work"), RECORDED.searchToolCall)));
    const kind = screen.getByTestId("tool-kind");
    expect(kind.textContent).toContain("⌕");
    expect(kind.textContent).toContain("search");
    expect(screen.getByTestId("tool-card").getAttribute("data-kind")).toBe("search");
  });

  it("shows no kind icon for a kind it does not know", () => {
    renderCard({
      ...tool(fold(initialState("s1", "/work"), RECORDED.searchToolCall)),
      toolKind: "other",
    });
    expect(screen.queryByTestId("tool-kind")).toBeNull();
  });
});

describe("sub-agents on their delegation card (agent86 1.0.20 state events)", () => {
  const delegation = () => {
    let state = fold(initialState("s1", "/work"), RECORDED.delegationToolCall);
    state = applyEvent(state, event(RECORDED.subagentStarted), 0);
    state = applyEvent(state, event(RECORDED.modelCallSubagent), 0);
    return state;
  };

  it("shows the sub-agent running, then done with its model calls and cost", () => {
    let state = delegation();
    renderCard(tool(state), { state });
    expect(screen.getByTestId("subagent").textContent).toMatch(
      /helper.*running.*1 model call.*cost \$0\.0002/,
    );
    cleanup();
    state = applyEvent(state, event(RECORDED.subagentFinished), 0);
    renderCard(tool(state), { state, expandAll: true });
    expect(screen.getByTestId("subagent").textContent).toMatch(
      /helper.*done.*1 model call.*cost \$0\.0002/,
    );
    expect(screen.getByRole("list", { name: "Model calls" }).textContent).toContain(
      "step 1 · test-model",
    );
  });

  it("says n/a for a sub-agent that used an unpriced model", () => {
    const base = fold(initialState("s1", "/work"), RECORDED.delegationToolCall);
    const unpriced = {
      ...DOCUMENTED.modelCallUnpriced,
      params: {
        ...DOCUMENTED.modelCallUnpriced.params,
        event: {
          ...DOCUMENTED.modelCallUnpriced.params.event,
          card: "agent-helper-1",
          agent: "helper",
        },
      },
    };
    const state = applyEvent(base, event(unpriced), 0);
    renderCard(tool(state), { state });
    expect(screen.getByTestId("subagent").textContent).toContain("cost n/a");
  });

  it("shows nothing extra without the state events (an older agent86)", () => {
    const state = fold(initialState("s1", "/work"), RECORDED.delegationToolCall);
    renderCard(tool(state), { state });
    expect(screen.queryByTestId("subagent")).toBeNull();
  });
});

describe("the transcript's new entries", () => {
  const show = (entries: Entry[]) => render(<Transcript entries={entries} />);

  it("shows a compaction as one collapsed entry that opens to its summary", () => {
    show(fold(initialState("s1", "/work"), DOCUMENTED.compactionCompleted).entries);
    const entry = screen.getByTestId("compaction");
    expect(entry.textContent).toContain("Context compacted");
    expect(entry.textContent).not.toContain("fixed a typo");
    fireEvent.click(within(entry).getByRole("button"));
    expect(entry.textContent).toContain("The user fixed a typo in README.md.");
  });

  it("shows a failed compaction and why", () => {
    show(fold(initialState("s1", "/work"), DOCUMENTED.compactionFailed).entries);
    const entry = screen.getByTestId("compaction");
    expect(entry.textContent).toContain("Compaction failed");
    fireEvent.click(within(entry).getByRole("button"));
    expect(entry.textContent).toContain("HTTP 500");
  });

  it("shows a guardrail as one quiet line, with the findings on request", () => {
    show(applyEvent(initialState("s1", "/work"), event(RECORDED.guardrail), 0).entries);
    const note = screen.getByTestId("guardrail");
    expect(note.textContent).toContain("Guardrail flagged your message (2 findings)");
    expect(note.textContent).not.toContain("injection:");
    fireEvent.click(within(note).getByRole("button"));
    expect(note.textContent).toContain("injection:override-instructions");
  });

  it("puts the turn's model calls and spend against the cap on its end", () => {
    let state = startTurn(initialState("s1", "/work"), "fix the typo", 0);
    state = applyEvent(state, event(RECORDED.modelCallMain), 0);
    state = applyEvent(state, event(RECORDED.modelCallMainAfterTool), 0);
    state = endTurn(state, "end_turn", 1500);
    show(state.entries);
    const end = screen.getByTestId("turn-end");
    expect(end.textContent).toContain("2 model calls");
    expect(screen.getByTestId("turn-spend").textContent).toBe("turn $0.0001 / $0.50");
    expect(screen.getByRole("meter", { name: "Turn spend against the cap" })).toBeTruthy();
    fireEvent.click(within(end).getByRole("button"));
    expect(screen.getByRole("list", { name: "Model calls" }).textContent).toContain("→ edit_file");
  });

  it("shows a turn with an unpriced model as n/a, with no cap meter when there is no cap", () => {
    let state = startTurn(initialState("s1", "/work"), "hello", 0);
    state = applyEvent(state, event(DOCUMENTED.modelCallUnpriced), 0);
    show(endTurn(state, "end_turn", 10).entries);
    expect(screen.getByTestId("turn-spend").textContent).toBe("turn ≥ $0.00");
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("keeps the plain turn end without the state events", () => {
    show(endTurn(startTurn(initialState("s1", "/work"), "hi", 0), "end_turn", 10).entries);
    expect(screen.queryByTestId("turn-end")).toBeNull();
  });
});

describe("the thread header (agent86 1.0.20)", () => {
  function renderHeader(state: SessionState) {
    const session = { subscribe: () => () => {}, getState: () => state };
    const logs = { lines: [] };
    const client = { subscribeLogs: () => () => {}, getLogs: () => logs };
    render(
      <ThreadHeader
        session={session as unknown as AgentSession}
        client={client as unknown as Agent86Client}
        busy={false}
        onCost={() => {}}
      />,
    );
  }

  it("shows the context meter and the session's cost", () => {
    renderHeader(fold(initialState("s1", "/work"), RECORDED.usagePriced));
    const meter = screen.getByRole("meter", { name: "Context window used" });
    expect(meter.getAttribute("aria-valuenow")).toBe("12");
    expect(meter.getAttribute("aria-valuemax")).toBe("8192");
    expect(screen.getByTestId("session-cost").textContent).toBe("$0.0002");
  });

  it("says cost n/a, never $0.00, when agent86 has no price", () => {
    renderHeader(fold(initialState("s1", "/work"), DOCUMENTED.usageUnpriced));
    expect(screen.getByTestId("session-cost").textContent).toBe("cost n/a");
    expect(screen.getByTestId("usage").textContent).toContain("53k/200k");
  });

  it("shows a cost in its own currency", () => {
    renderHeader(fold(initialState("s1", "/work"), DOCUMENTED.usageEuro));
    expect(screen.getByTestId("session-cost").textContent).toBe("€0.05");
  });

  it("shows the routed model", () => {
    renderHeader(applyEvent(initialState("s1", "/work"), event(DOCUMENTED.route), 0));
    expect(screen.getByTestId("routed-model").textContent).toBe(
      "routed: openrouter:qwen/qwen3-coder",
    );
  });

  it("shows neither without usage updates or state events (an older agent86)", () => {
    renderHeader(initialState("s1", "/work"));
    expect(screen.queryByTestId("usage")).toBeNull();
    expect(screen.queryByTestId("routed-model")).toBeNull();
    expect(screen.getByRole("button", { name: "$ cost" })).toBeTruthy();
  });
});
