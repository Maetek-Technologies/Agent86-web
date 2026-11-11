// The transcript of one ACP session as plain, serializable state, and the pure functions that
// fold agent86's updates into it. React subscribes to this; tests assert on it without a DOM.
import type {
  AvailableCommand,
  ContentBlock,
  PermissionOption,
  SessionConfigOption,
  SessionUpdate,
  StopReason,
  ToolCallContent,
  ToolCallStatus,
  ToolKind,
} from "@agentclientprotocol/sdk";

export interface UserEntry {
  kind: "user";
  id: number;
  text: string;
}

export interface AgentEntry {
  kind: "agent";
  id: number;
  text: string;
}

export interface ThoughtEntry {
  kind: "thought";
  id: number;
  text: string;
  startedAt: number;
  /** Set once the reasoning is over: the answer, a tool call, or the end of the turn began. */
  endedAt?: number;
}

export interface ToolEntry {
  kind: "tool";
  id: number;
  toolCallId: string;
  title: string;
  name?: string;
  toolKind?: ToolKind;
  status: ToolCallStatus;
  rawInput?: unknown;
  /** The text content the agent reported for the call (its result, for agent86). */
  output: string;
  /** What the call would do, as shown when approval was asked: a diff, a command, the arguments. */
  preview?: string;
  /** How the approval for this call was answered, if one was asked. */
  decision?: PermissionDecision;
}

/** How a permission request was answered. Anything but "allowed" declines the call. */
export type PermissionDecision = "allowed" | "rejected" | "cancelled";

/** A permission request agent86 is waiting on (`session/request_permission`). */
export interface PendingPermission {
  /** Local id, for answering. */
  id: number;
  toolCallId: string;
  title: string;
  toolKind?: ToolKind;
  rawInput?: unknown;
  /** The detail the user decides on (agent86 sends a diff, a command, or the arguments). */
  text: string;
  /** The choices, in the agent's order. */
  options: PermissionOption[];
}

export interface NoticeEntry {
  kind: "notice";
  id: number;
  level: "info" | "warning" | "error";
  text: string;
  /** A hint shown under the text, such as how to see the trace. */
  hint?: string;
}

export interface TurnEndEntry {
  kind: "turn-end";
  id: number;
  stopReason: StopReason | "error";
  durationMs: number;
}

export type Entry = UserEntry | AgentEntry | ThoughtEntry | ToolEntry | NoticeEntry | TurnEndEntry;

/** An entry before it has an id. `Omit` over a union would merge the members, so distribute it. */
export type NewEntry = Entry extends infer E ? (E extends Entry ? Omit<E, "id"> : never) : never;

export interface TurnState {
  running: boolean;
  startedAt?: number;
  cancelRequested: boolean;
}

export interface SessionState {
  sessionId: string;
  cwd: string;
  entries: Entry[];
  turn: TurnState;
  configOptions: SessionConfigOption[];
  commands: AvailableCommand[];
  /** Permission requests waiting for an answer, oldest first. */
  permissions: PendingPermission[];
  /** Why the connection ended, once it has. */
  closed?: string;
  nextId: number;
}

export function initialState(
  sessionId: string,
  cwd: string,
  configOptions: SessionConfigOption[] = [],
): SessionState {
  return {
    sessionId,
    cwd,
    entries: [],
    turn: { running: false, cancelRequested: false },
    configOptions,
    commands: [],
    permissions: [],
    nextId: 1,
  };
}

/** The text of a content block; non-text blocks get a short placeholder. */
export function contentText(block: ContentBlock): string {
  switch (block.type) {
    case "text":
      return block.text;
    case "resource_link":
      return `[${block.name}](${block.uri})`;
    case "image":
      return "[image]";
    case "audio":
      return "[audio]";
    case "resource":
      return "text" in block.resource ? block.resource.text : `[${block.resource.uri}]`;
    default:
      return "";
  }
}

function toolOutput(content: ToolCallContent[] | null | undefined): string | undefined {
  if (!content) return undefined;
  return content
    .map((item) => {
      if (item.type === "content") return contentText(item.content);
      if (item.type === "diff") return `diff ${item.path}`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function withEntry(state: SessionState, entry: NewEntry): SessionState {
  return {
    ...state,
    entries: [...state.entries, { ...entry, id: state.nextId } as Entry],
    nextId: state.nextId + 1,
  };
}

function replaceLast(state: SessionState, entry: Entry): SessionState {
  return { ...state, entries: [...state.entries.slice(0, -1), entry] };
}

/** Mark an open thought as finished. */
function endThought(state: SessionState, now: number): SessionState {
  const last = state.entries.at(-1);
  if (last?.kind === "thought" && last.endedAt === undefined) {
    return replaceLast(state, { ...last, endedAt: now });
  }
  return state;
}

/** The user sent a prompt: show it and start the turn. */
export function startTurn(state: SessionState, text: string, now: number): SessionState {
  const next = withEntry(state, { kind: "user", text });
  return { ...next, turn: { running: true, startedAt: now, cancelRequested: false } };
}

export function requestCancel(state: SessionState): SessionState {
  if (!state.turn.running || state.turn.cancelRequested) return state;
  return { ...state, turn: { ...state.turn, cancelRequested: true } };
}

const STOP_NOTICES: Partial<Record<StopReason, { level: NoticeEntry["level"]; text: string }>> = {
  cancelled: { level: "warning", text: "Cancelled." },
  max_turn_requests: {
    level: "warning",
    text: "Stopped: the turn reached agent86's step limit. Send another message to carry on.",
  },
  max_tokens: { level: "warning", text: "Stopped: the reply reached the model's output limit." },
  refusal: { level: "warning", text: "The model refused to continue." },
};

/**
 * agent86 ends a cancelled reply with its own `[cancelled]` notice (as its terminal does). The
 * stop reason already says so, and the transcript shows a notice for it, so drop the marker.
 */
function dropCancelMarker(state: SessionState): SessionState {
  const last = state.entries.at(-1);
  if (last?.kind !== "agent") return state;
  const text = last.text.replace(/\s*\[cancelled\]\s*$/, "");
  if (text === last.text) return state;
  if (text === "") return { ...state, entries: state.entries.slice(0, -1) };
  return replaceLast(state, { ...last, text });
}

/** The prompt returned with a stop reason. */
export function endTurn(state: SessionState, stopReason: StopReason, now: number): SessionState {
  let next = endThought(stopReason === "cancelled" ? dropCancelMarker(state) : state, now);
  const notice = STOP_NOTICES[stopReason];
  if (notice) next = withEntry(next, { kind: "notice", ...notice });
  next = withEntry(next, {
    kind: "turn-end",
    stopReason,
    durationMs: now - (state.turn.startedAt ?? now),
  });
  return { ...next, turn: { running: false, cancelRequested: false } };
}

/** The prompt failed: agent86 reported an error (a model error, for example). */
export function failTurn(state: SessionState, message: string, now: number): SessionState {
  let next = endThought(state, now);
  next = withEntry(next, {
    kind: "notice",
    level: "error",
    text: message,
    hint: `For details, run: agent86 trace show -s ${state.sessionId}`,
  });
  next = withEntry(next, {
    kind: "turn-end",
    stopReason: "error",
    durationMs: now - (state.turn.startedAt ?? now),
  });
  return { ...next, turn: { running: false, cancelRequested: false } };
}

export function markClosed(state: SessionState, reason: string, now: number): SessionState {
  if (state.closed) return state;
  let next: SessionState = { ...endThought(state, now), closed: reason };
  if (state.turn.running) next = { ...next, turn: { running: false, cancelRequested: false } };
  return next;
}

function updateTool(
  state: SessionState,
  toolCallId: string,
  change: (entry: ToolEntry) => ToolEntry,
): SessionState {
  const index = state.entries.findIndex((e) => e.kind === "tool" && e.toolCallId === toolCallId);
  if (index < 0) return state;
  const entries = [...state.entries];
  entries[index] = change(entries[index] as ToolEntry);
  return { ...state, entries };
}

/** agent86 asked for permission. The call's card shows the request until it is answered. */
export function addPermission(
  state: SessionState,
  request: Omit<PendingPermission, "id">,
  now: number,
): { state: SessionState; id: number } {
  const id = state.nextId;
  let next: SessionState = {
    ...state,
    permissions: [...state.permissions, { ...request, id }],
    nextId: id + 1,
  };
  // agent86 reports the call before it asks; if a client ever sees the ask first, add the card.
  const known = next.entries.some((e) => e.kind === "tool" && e.toolCallId === request.toolCallId);
  if (!known) {
    next = withEntry(endThought(next, now), {
      kind: "tool",
      toolCallId: request.toolCallId,
      title: request.title,
      status: "pending",
      output: "",
      ...(request.toolKind ? { toolKind: request.toolKind } : {}),
      ...(request.rawInput !== undefined ? { rawInput: request.rawInput } : {}),
    });
  }
  next = updateTool(next, request.toolCallId, (entry) => ({ ...entry, preview: request.text }));
  return { state: next, id };
}

/** A permission request was answered (or cancelled, or the connection went). */
export function resolvePermission(
  state: SessionState,
  id: number,
  decision: PermissionDecision,
): SessionState {
  const request = state.permissions.find((p) => p.id === id);
  if (!request) return state;
  const next = { ...state, permissions: state.permissions.filter((p) => p.id !== id) };
  return updateTool(next, request.toolCallId, (entry) => ({ ...entry, decision }));
}

/** Fold one `session/update` into the state. Unknown kinds are ignored. */
export function applyUpdate(state: SessionState, update: SessionUpdate, now: number): SessionState {
  const last = state.entries.at(-1);
  switch (update.sessionUpdate) {
    case "user_message_chunk": {
      const text = contentText(update.content);
      if (last?.kind === "user") return replaceLast(state, { ...last, text: last.text + text });
      return withEntry(endThought(state, now), { kind: "user", text });
    }
    case "agent_message_chunk": {
      const text = contentText(update.content);
      if (last?.kind === "agent") return replaceLast(state, { ...last, text: last.text + text });
      return withEntry(endThought(state, now), { kind: "agent", text });
    }
    case "agent_thought_chunk": {
      const text = contentText(update.content);
      if (last?.kind === "thought" && last.endedAt === undefined) {
        return replaceLast(state, { ...last, text: last.text + text });
      }
      return withEntry(state, { kind: "thought", text, startedAt: now });
    }
    case "tool_call": {
      const next = endThought(state, now);
      const entry: Omit<ToolEntry, "id"> = {
        kind: "tool",
        toolCallId: update.toolCallId,
        title: update.title,
        status: update.status ?? "pending",
        output: toolOutput(update.content) ?? "",
      };
      if (update.name) entry.name = update.name;
      if (update.kind) entry.toolKind = update.kind;
      if (update.rawInput !== undefined) entry.rawInput = update.rawInput;
      return withEntry(next, entry);
    }
    case "tool_call_update": {
      const index = state.entries.findIndex(
        (entry) => entry.kind === "tool" && entry.toolCallId === update.toolCallId,
      );
      if (index < 0) return state;
      const entry = state.entries[index] as ToolEntry;
      const updated: ToolEntry = { ...entry };
      if (update.status) updated.status = update.status;
      if (update.title) updated.title = update.title;
      if (update.kind) updated.toolKind = update.kind;
      if (update.rawInput !== undefined) updated.rawInput = update.rawInput;
      const output = toolOutput(update.content);
      if (output !== undefined) updated.output = output;
      const entries = [...state.entries];
      entries[index] = updated;
      return { ...state, entries };
    }
    case "available_commands_update":
      return { ...state, commands: update.availableCommands };
    case "config_option_update":
      return { ...state, configOptions: update.configOptions };
    default:
      return state;
  }
}

/** What the agent is doing now, for the phase line (docs/UI_DESIGN.md §3.3). */
export function phase(state: SessionState): string | undefined {
  if (!state.turn.running) return undefined;
  if (state.turn.cancelRequested) return "Cancelling…";
  if (state.permissions.length > 0) return "Waiting for your approval";
  for (let i = state.entries.length - 1; i >= 0; i--) {
    const entry = state.entries[i]!;
    if (entry.kind === "tool" && (entry.status === "pending" || entry.status === "in_progress")) {
      return `Running ${entry.name ?? entry.title}…`;
    }
    if (entry.kind === "user") break;
  }
  const last = state.entries.at(-1);
  if (last?.kind === "agent") return "Writing…";
  return "Thinking…";
}
