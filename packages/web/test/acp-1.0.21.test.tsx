// @vitest-environment jsdom
// What the thread shows for agent86 1.0.21's additions, from recorded messages: who asks on a
// sub-agent's approval, the approval inbox, and a turn interrupted by agent86 stopping; and what
// it shows without them.
import {
  addPermission,
  applyEvent,
  applyUpdate,
  inboxItems,
  initialState,
  interruptTurn,
  parseAsker,
  parseEventParams,
  startTurn,
  type AgentSession,
  type InboxItem,
  type PendingPermission,
  type SessionState,
  type ToolEntry,
} from "@agent86-web/acp-client";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PARALLEL_TURN } from "../../acp-client/test/fixtures/agent86-1.0.21.ts";
import { Inbox } from "../src/thread/Inbox.tsx";
import { ThreadContext } from "../src/thread/ThreadContext.ts";
import { CONTINUE_PROMPT, Transcript } from "../src/thread/Transcript.tsx";
import { ToolCard } from "../src/tools/ToolCard.tsx";

afterEach(cleanup);

type Recorded = (typeof PARALLEL_TURN)[number];

/** A permission request as the client keeps it, `withAsker` as for a state client. */
function pending(message: Recorded, withAsker = true): Omit<PendingPermission, "id"> {
  const params = message.params as unknown as {
    toolCall: {
      toolCallId: string;
      title: string;
      content: { type: string; content?: { text: string } }[];
    };
    options: PendingPermission["options"];
    _meta?: unknown;
  };
  const asker = withAsker ? parseAsker(params._meta) : undefined;
  return {
    toolCallId: params.toolCall.toolCallId,
    title: params.toolCall.title,
    text: params.toolCall.content
      .filter((c) => c.type === "content")
      .map((c) => c.content!.text)
      .join("\n"),
    options: params.options,
    ...(asker ? { asker } : {}),
  };
}

/** Fold the recorded turn up to `count` messages, as the client would, the turn running. */
function played(count: number, withAsker = true): SessionState {
  let state = startTurn(initialState("s1", "/work"), "parallel writers", 0);
  for (const message of PARALLEL_TURN.slice(0, count)) {
    if (message.method === "session/update")
      state = applyUpdate(state, (message.params as unknown as { update: never }).update, 0);
    else if (message.method === "_com.maetek.agent86/session/event")
      state = applyEvent(state, parseEventParams(message.params)!.event, 0);
    else if (message.method === "session/request_permission")
      state = addPermission(state, pending(message, withAsker), 0).state;
  }
  return state;
}

const toolOf = (state: SessionState, id: string) =>
  state.entries.find((e) => e.kind === "tool" && e.toolCallId === id) as ToolEntry;

function renderCard(entry: ToolEntry, state: SessionState) {
  render(
    <ThreadContext.Provider
      value={{
        session: { respond: vi.fn(), reject: vi.fn() } as unknown as AgentSession,
        permissions: state.permissions,
        expandAll: false,
        cwd: "/work",
        subagents: state.subagents,
      }}
    >
      <ToolCard entry={entry} />
    </ThreadContext.Provider>,
  );
}

describe("who asks, on a sub-agent's approval (agent86 1.0.21)", () => {
  it("names the sub-agent, links its card, and shows its spend beside the turn's and the cap", () => {
    const state = played(21);
    const request = state.permissions[0]!;
    renderCard(toolOf(state, request.toolCallId), state);
    const asker = screen.getByTestId("asker");
    expect(within(asker).getByTestId("asker-name")!.textContent).toContain("writer");
    expect(within(asker).getByTestId("asker-spend")!.textContent).toContain(
      "its spend <$0.0001 (1 model call) · turn $0.0001 of a $0.50 cap",
    );
    expect(within(asker).queryByTestId("asker-worktree")).toBeNull();
    // agent86's own "Asked by the 'writer' sub-agent." line is said better above.
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByText(/written by one/)).toBeTruthy();
  });

  it("says when the sub-agent works in an isolated worktree, and when it is nested", () => {
    const state = played(21);
    const request: PendingPermission = {
      ...state.permissions[0]!,
      asker: {
        card: "call_1794849720061_0",
        agent: "writer",
        depth: 2,
        worktree: { path: "/work/.agent86/worktrees/writer-1", branch: "agent86/writer-1" },
        costUsd: 0.036,
        turnCostUsd: 0.108,
        costCapUsd: null,
      },
    };
    renderCard(toolOf(state, request.toolCallId), { ...state, permissions: [request] });
    expect(screen.getByTestId("asker-worktree")!.textContent).toContain(
      "Works in an isolated worktree on agent86/writer-1",
    );
    expect(screen.getByTestId("asker-worktree")!.getAttribute("title")).toBe(
      "/work/.agent86/worktrees/writer-1",
    );
    expect(screen.getByTestId("asker")!.textContent).toContain("nested 2 deep");
    expect(screen.getByTestId("asker-spend")!.textContent).toContain(
      "its spend $0.04 · turn $0.11",
    );
    expect(screen.getByTestId("asker-spend")!.textContent).not.toContain("cap");
  });

  it("jumps to the delegation card", () => {
    const state = played(21);
    const card = document.createElement("div");
    card.dataset.toolCallId = "call_1794849720061_0";
    card.scrollIntoView = vi.fn();
    document.body.append(card);
    renderCard(toolOf(state, state.permissions[0]!.toolCallId), state);
    fireEvent.click(screen.getByRole("button", { name: "show its card" }));
    expect(card.scrollIntoView).toHaveBeenCalled();
    expect(card.className).toContain("ring-2");
    card.remove();
  });

  it("looks as before without the state events: agent86's warning, no asker", () => {
    const state = played(21, false);
    renderCard(toolOf(state, state.permissions[0]!.toolCallId), state);
    expect(screen.queryByTestId("asker")).toBeNull();
    expect(screen.getByRole("note")!.textContent).toContain("Asked by the 'writer' sub-agent.");
  });
});

describe("the approval inbox (agent86 1.0.21)", () => {
  const renderInbox = (items: InboxItem[]) => render(<Inbox items={items} />);

  it("shows the question asked before its request arrives", () => {
    renderInbox(inboxItems(played(18)));
    const [item] = screen.getAllByTestId("inbox-item");
    expect(item!.getAttribute("data-position")).toBe("asking");
    expect(item!.textContent).toContain("asking now");
    expect(item!.textContent).toContain("writer");
    expect(item!.textContent).toContain("write_file");
    expect(item!.textContent).toContain("the request is on its way…");
    expect(screen.getByTestId("inbox-count")!.textContent).toContain("1");
  });

  it("lists the one asked, then those waiting in order, each with its card", () => {
    renderInbox(inboxItems(played(21)));
    const items = screen.getAllByTestId("inbox-item");
    expect(items.map((i) => i.dataset.position)).toEqual(["asking", "waiting"]);
    expect(items.map((i) => i.dataset.call)).toEqual([
      "call_1794849720061_0/1",
      "call_1794849720061_1/1",
    ]);
    expect(items[0]!.textContent).toContain("answer it");
    expect(items[1]!.textContent).toContain("waiting #1");
    expect(within(items[1]!).getByRole("button", { name: "writer's card" })).toBeTruthy();
    expect(screen.getByTestId("inbox-count")!.textContent).toContain("2");
    expect(screen.getByTestId("inbox-count").getAttribute("aria-label")).toBe("2 questions");
  });

  it("names a project specialist waiting for its one-time approval, and the main agent", () => {
    renderInbox([
      {
        question: { kind: "approval", tool: "run_command", call: "call_9" },
        position: "asking",
        hasCard: true,
      },
      {
        question: { kind: "specialty", tool: "delegate", call: "call_7", subject: "reviewer" },
        position: "waiting",
        hasCard: false,
      },
    ]);
    const [main, specialty] = screen.getAllByTestId("inbox-item");
    expect(main!.textContent).toContain("main agent");
    expect(within(main!).getByRole("button", { name: "its card" })).toBeTruthy();
    expect(specialty!.textContent).toContain("run the project specialist reviewer");
    expect(within(specialty!).queryByRole("button")).toBeNull();
  });

  it("is empty once agent86's queue empties, and without the events", () => {
    expect(inboxItems(played(PARALLEL_TURN.length))).toEqual([]);
    const plain = { ...played(21), questions: undefined };
    expect(inboxItems(plain)).toEqual([]);
  });
});

describe("an interrupted turn (agent86 1.0.21)", () => {
  function renderTranscript(state: SessionState, busy = false) {
    const send = vi.fn();
    render(
      <ThreadContext.Provider value={{ permissions: [], expandAll: false, send, busy }}>
        <Transcript entries={state.entries} />
      </ThreadContext.Provider>,
    );
    return send;
  }

  const interrupted = () => {
    let state = startTurn(initialState("s1", "/work"), "crash after reading", 1_000);
    state = applyUpdate(
      state,
      { sessionUpdate: "tool_call", toolCallId: "c1", title: "read_file", status: "in_progress" },
      1_000,
    );
    return interruptTurn(state, 13_000, 1_000);
  };

  it("says so, marks the call cut off, and offers to continue with a short message", () => {
    const send = renderTranscript(interrupted());
    expect(screen.getByTestId("turn-interrupted")!.textContent).toContain(
      "Interrupted: agent86 stopped partway through this turn (after 12s). The steps it finished are kept.",
    );
    expect(screen.getByTestId("tool-card")!.getAttribute("data-state")).toBe("interrupted");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(send).toHaveBeenCalledWith(CONTINUE_PROMPT);
  });

  it("offers it only on the last entry, and not while busy", () => {
    const state = interrupted();
    renderTranscript(state, true);
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    cleanup();
    renderTranscript(startTurn(state, "something else", 14_000));
    expect(screen.getByTestId("turn-interrupted")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });
});
