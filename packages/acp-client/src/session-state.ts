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
import type { Agent86Event, ModelCall, Question, SubagentAsker } from "./agent86-events.ts";

/**
 * A file change as agent86 1.0.19 sends it (ACP `diff` content): the whole file before (null for a
 * new file) and after. Files over 256 KiB on either side, and replayed sessions, come as text only.
 */
export interface FileDiff {
  path: string;
  oldText: string | null;
  newText: string;
}

/** A file a tool call works on (ACP `locations`); `line` is 1-based, the first changed line. */
export interface FileLocation {
  path: string;
  line?: number;
}

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
  /** The file changes in the call's latest content, when agent86 sends them as `diff` items. */
  diffs?: FileDiff[];
  /** The files the call works on, from agent86's latest `locations`. */
  locations?: FileLocation[];
  /** What the call would do, as shown when approval was asked: a diff, a command, the arguments. */
  preview?: string;
  /** The file changes shown when approval was asked, when agent86 sent them as `diff` items. */
  previewDiffs?: FileDiff[];
  /** How the approval for this call was answered, if one was asked. */
  decision?: PermissionDecision;
  /** The call was still pending or running when agent86 stopped partway through the turn. */
  interrupted?: boolean;
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
  /** The change as `diff` items (agent86 1.0.19 and later); `text` is then the same change. */
  diffs?: FileDiff[];
  locations?: FileLocation[];
  /** The choices, in the agent's order. */
  options: PermissionOption[];
  /** The sub-agent asking (agent86 1.0.21, with its state events); absent when the main agent asks. */
  asker?: SubagentAsker;
}

/**
 * The model asks for a secret (agent86 1.0.23's `secret/request`). The state holds what was asked,
 * never what is typed: the value goes from the masked entry straight to agent86.
 */
export interface PendingSecret {
  /** Local id, for answering. */
  id: number;
  name: string;
  /** The model's words. */
  reason: string;
  /** A value is held under this name already; entering one replaces it. */
  replacing: boolean;
  /** A keyring is there, so it can be remembered for the project. */
  canRemember: boolean;
  /** It is remembered now, so the remember choice starts on. */
  remembered: boolean;
  /** The `request_secret` call's card, when it is in the thread. */
  toolCallId?: string;
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
  /** `interrupted`: agent86 stopped (its process ended) partway through; finished steps are kept. */
  stopReason: StopReason | "error" | "interrupted";
  durationMs: number;
  /** What the turn's model calls cost, when agent86 sent its state events. */
  spend?: TurnSpend;
}

/** A compaction of the session into a summary (ACP `compaction_update`), keyed by its id. */
export interface CompactionEntry {
  kind: "compaction";
  id: number;
  compactionId: string;
  /** `in_progress`, `completed`, `failed`, `cancelled`, or a later status. */
  status: string;
  summary: string;
  error?: string;
}

/** A guardrail flagged something (agent86's state events). */
export interface GuardrailEntry {
  kind: "guardrail";
  id: number;
  stage: string;
  findings: string[];
}

export type Entry =
  | UserEntry
  | AgentEntry
  | ThoughtEntry
  | ToolEntry
  | NoticeEntry
  | TurnEndEntry
  | CompactionEntry
  | GuardrailEntry;

/** The context window and the session's cost, from ACP `usage_update` (agent86 1.0.20). */
export interface Usage {
  /** Tokens of the context window the last request used. */
  used: number;
  size: number;
  /** What the session has cost so far. Absent when agent86 has no price: unknown, not zero. */
  cost?: { amount: number; currency: string };
}

/** The current turn's model calls and spend, from agent86's state events. */
export interface TurnSpend {
  /** The main agent's calls; a sub-agent's are on its delegation (`subagents`). */
  calls: ModelCall[];
  /** The turn's spend so far, sub-agents included, as agent86 reports it. */
  spentUsd?: number;
  /** False once any call (a sub-agent's too) had no price: the spend is then a lower bound. */
  priced: boolean;
  /** `[limits] max_cost_usd`, or null when there is no cap. */
  capUsd: number | null;
}

/** A sub-agent run on a delegation card, from agent86's state events. */
export interface SubagentInfo {
  card: string;
  agent?: string;
  depth?: number;
  run?: number;
  task?: string;
  status: "running" | "done" | "failed";
  calls: ModelCall[];
  inputTokens?: number;
  outputTokens?: number;
  /** The run's total cost; absent while running or when unknown. */
  costUsd?: number;
  /** False once one of its calls had no price. */
  priced: boolean;
}

/** The questions agent86 is asking and will ask, from its `questions` events (agent86 1.0.21). */
export interface QuestionQueue {
  asking: Question | null;
  /** In the order they will be asked. */
  waiting: Question[];
}

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
  /** The session's title, once agent86 announces one (`session_info_update`, e.g. after `/rename`). */
  title?: string;
  /** Permission requests waiting for an answer, oldest first. */
  permissions: PendingPermission[];
  /** The latest `usage_update`, if agent86 sends them. */
  usage?: Usage;
  /** The running or last turn's spend, if agent86 sends its state events. */
  turnSpend?: TurnSpend;
  /** Sub-agent runs by the tool call id of their delegation card. */
  subagents: Record<string, SubagentInfo>;
  /** The model triage routing picked for the latest turn. */
  routedModel?: string;
  /** The questions queue while a turn runs, when agent86 sends it; absent when empty. */
  questions?: QuestionQueue;
  /** Secrets the model asked for that wait for an answer, oldest first; absent when none. */
  secrets?: PendingSecret[];
  /** Why the connection ended, once it has. */
  closed?: string;
  /** Set when the connection ended while a turn was running: when that turn started. */
  closedDuringTurn?: { startedAt?: number };
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
    subagents: {},
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

/** The text items of a call's content. `diff` items are kept apart (see toolDiffs). */
function toolOutput(content: ToolCallContent[] | null | undefined): string | undefined {
  if (!content) return undefined;
  return content
    .map((item) => (item.type === "content" ? contentText(item.content) : ""))
    .filter(Boolean)
    .join("\n");
}

/** The `diff` items of a call's content: undefined when there is no content, else maybe none. */
export function toolDiffs(content: ToolCallContent[] | null | undefined): FileDiff[] | undefined {
  if (!content) return undefined;
  return content
    .filter((item) => item.type === "diff" && typeof item.newText === "string")
    .map((item) => {
      const diff = item as Extract<ToolCallContent, { type: "diff" }>;
      return { path: diff.path, oldText: diff.oldText ?? null, newText: diff.newText };
    });
}

/** ACP `locations`, keeping only what is usable. */
export function toolLocations(locations: unknown): FileLocation[] | undefined {
  if (!Array.isArray(locations)) return undefined;
  return locations
    .filter(
      (l): l is { path: string; line?: unknown } =>
        typeof l === "object" && l !== null && typeof (l as { path?: unknown }).path === "string",
    )
    .map((l) =>
      typeof l.line === "number" && Number.isInteger(l.line) && l.line > 0
        ? { path: l.path, line: l.line }
        : { path: l.path },
    );
}

/** Set or clear an optional list on an entry: an empty list clears it. */
function withList<T extends object, K extends keyof T>(
  entry: T,
  key: K,
  list: unknown[] | undefined,
): T {
  if (list === undefined) return entry;
  const next = { ...entry };
  if (list.length) (next as Record<K, unknown>)[key] = list;
  else delete next[key];
  return next;
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
  const { turnSpend: _spent, routedModel: _routed, questions: _questions, ...rest } = next;
  return { ...rest, turn: { running: true, startedAt: now, cancelRequested: false } };
}

/** Leave out the questions queue. */
function withoutQuestions(state: SessionState): SessionState {
  if (!state.questions) return state;
  const { questions: _questions, ...rest } = state;
  return rest;
}

/** Cancelling declines every waiting question without asking it, so the inbox empties at once. */
export function requestCancel(state: SessionState): SessionState {
  if (!state.turn.running || state.turn.cancelRequested) return state;
  return { ...withoutQuestions(state), turn: { ...state.turn, cancelRequested: true } };
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
    ...(state.turnSpend ? { spend: state.turnSpend } : {}),
  });
  return { ...withoutQuestions(next), turn: { running: false, cancelRequested: false } };
}

/** A note from the client itself (not from agent86), such as a setting it could not restore. */
export function addNotice(
  state: SessionState,
  level: NoticeEntry["level"],
  text: string,
  hint?: string,
): SessionState {
  return withEntry(state, { kind: "notice", level, text, ...(hint ? { hint } : {}) });
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
    ...(state.turnSpend ? { spend: state.turnSpend } : {}),
  });
  return { ...withoutQuestions(next), turn: { running: false, cancelRequested: false } };
}

export function markClosed(state: SessionState, reason: string, now: number): SessionState {
  if (state.closed) return state;
  let next: SessionState = { ...withoutQuestions(endThought(state, now)), closed: reason };
  if (state.turn.running) {
    next = {
      ...next,
      turn: { running: false, cancelRequested: false },
      closedDuringTurn:
        state.turn.startedAt !== undefined ? { startedAt: state.turn.startedAt } : {},
    };
  }
  return next;
}

/**
 * A session reopened with `session/resume` (agent86 1.0.21), which replays nothing: carry on from
 * the transcript the client already has. agent86 keeps the old tool call ids reserved, so they
 * never clash with new calls. What belonged to the old connection (open requests, the running
 * turn, the closed state, the queue) is dropped.
 */
export function continueState(previous: SessionState): SessionState {
  const {
    closed: _closed,
    closedDuringTurn: _cut,
    questions: _questions,
    secrets: _secrets,
    ...rest
  } = previous;
  return { ...rest, permissions: [], turn: { running: false, cancelRequested: false } };
}

/**
 * agent86 stopped partway through a turn (its process ended). Since 1.0.21 the steps it finished
 * are saved. Calls of that turn still pending or running are marked interrupted, and the turn ends
 * as `interrupted`, so the thread can offer to continue.
 */
export function interruptTurn(
  state: SessionState,
  now: number,
  startedAt: number | undefined,
): SessionState {
  let lastUser = -1;
  for (let i = state.entries.length - 1; i >= 0; i--) {
    if (state.entries[i]!.kind === "user") {
      lastUser = i;
      break;
    }
  }
  const entries = state.entries.map((entry, i) =>
    i > lastUser &&
    entry.kind === "tool" &&
    (entry.status === "pending" || entry.status === "in_progress")
      ? { ...entry, interrupted: true }
      : entry,
  );
  const next = withEntry(endThought({ ...state, entries }, now), {
    kind: "turn-end",
    stopReason: "interrupted",
    durationMs: startedAt !== undefined ? Math.max(0, now - startedAt) : 0,
    ...(state.turnSpend ? { spend: state.turnSpend } : {}),
  });
  return { ...withoutQuestions(next), turn: { running: false, cancelRequested: false } };
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
  next = updateTool(next, request.toolCallId, (entry) => {
    let updated: ToolEntry = { ...entry, preview: request.text };
    updated = withList(updated, "previewDiffs", request.diffs ?? []);
    if (request.locations?.length) updated.locations = request.locations;
    return updated;
  });
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

/**
 * The model asked for a secret. Its `request_secret` card (announced just before) is linked, so
 * the inbox can point at it.
 */
export function addSecretRequest(
  state: SessionState,
  request: Omit<PendingSecret, "id" | "toolCallId">,
): { state: SessionState; id: number } {
  const id = state.nextId;
  let toolCallId: string | undefined;
  for (let i = state.entries.length - 1; i >= 0; i--) {
    const entry = state.entries[i]!;
    if (entry.kind === "user") break;
    if (
      entry.kind === "tool" &&
      entry.name === "request_secret" &&
      (entry.status === "pending" || entry.status === "in_progress") &&
      (entry.rawInput as { name?: unknown } | undefined)?.name === request.name
    ) {
      toolCallId = entry.toolCallId;
      break;
    }
  }
  const pending: PendingSecret = { ...request, id, ...(toolCallId ? { toolCallId } : {}) };
  return {
    state: { ...state, secrets: [...(state.secrets ?? []), pending], nextId: id + 1 },
    id,
  };
}

/** A secret request was answered, declined, or dropped. */
export function resolveSecretRequest(state: SessionState, id: number): SessionState {
  if (!state.secrets?.some((s) => s.id === id)) return state;
  const secrets = state.secrets.filter((s) => s.id !== id);
  if (secrets.length) return { ...state, secrets };
  const { secrets: _secrets, ...rest } = state;
  return rest;
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
      const diffs = toolDiffs(update.content);
      if (diffs?.length) entry.diffs = diffs;
      const locations = toolLocations(update.locations);
      if (locations?.length) entry.locations = locations;
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
      const withDiffs = withList(updated, "diffs", toolDiffs(update.content));
      const withPlaces = withList(withDiffs, "locations", toolLocations(update.locations));
      const entries = [...state.entries];
      entries[index] = withPlaces;
      return { ...state, entries };
    }
    case "usage_update": {
      const usage: Usage = { used: update.used, size: update.size };
      const cost = update.cost;
      if (cost && typeof cost.amount === "number" && typeof cost.currency === "string") {
        usage.cost = { amount: cost.amount, currency: cost.currency };
      }
      return { ...state, usage };
    }
    case "compaction_update": {
      const summary = (update.summary ?? []).map(contentText).join("");
      return upsertCompaction(endThought(state, now), update.compactionId, (entry) => {
        const next: CompactionEntry = { ...entry, status: String(update.status) };
        if (update.summary) next.summary = summary;
        if (typeof update.error === "string" && update.error) next.error = update.error;
        return next;
      });
    }
    case "compaction_summary_chunk":
      return upsertCompaction(endThought(state, now), update.compactionId, (entry) => ({
        ...entry,
        summary: entry.summary + contentText(update.content),
      }));
    case "available_commands_update":
      return { ...state, commands: update.availableCommands };
    case "config_option_update":
      return { ...state, configOptions: update.configOptions };
    case "session_info_update":
      return typeof update.title === "string" && update.title
        ? { ...state, title: update.title }
        : state;
    default:
      return state;
  }
}

/** Find a compaction's entry by its id, or add one, and change it. */
function upsertCompaction(
  state: SessionState,
  compactionId: string,
  change: (entry: CompactionEntry) => CompactionEntry,
): SessionState {
  const index = state.entries.findIndex(
    (e) => e.kind === "compaction" && e.compactionId === compactionId,
  );
  if (index >= 0) {
    const entries = [...state.entries];
    entries[index] = change(entries[index] as CompactionEntry);
    return { ...state, entries };
  }
  const fresh: CompactionEntry = {
    kind: "compaction",
    id: state.nextId,
    compactionId,
    status: "in_progress",
    summary: "",
  };
  return { ...state, entries: [...state.entries, change(fresh)], nextId: state.nextId + 1 };
}

function callOf(event: Extract<Agent86Event, { kind: "model_call" }>): ModelCall {
  const {
    kind: _kind,
    ts: _ts,
    priced: _p,
    turnCostUsd: _t,
    costCapUsd: _c,
    card: _card,
    agent: _a,
    depth: _d,
    run: _r,
    ...call
  } = event;
  return call;
}

/** Fold one of agent86's state events into the state. Unknown kinds never reach here. */
export function applyEvent(state: SessionState, event: Agent86Event, now: number): SessionState {
  switch (event.kind) {
    case "model_call": {
      const current: TurnSpend = state.turnSpend ?? { calls: [], priced: true, capUsd: null };
      const spend: TurnSpend = {
        ...current,
        capUsd: event.costCapUsd,
        priced: current.priced && event.priced,
        ...(event.turnCostUsd !== undefined ? { spentUsd: event.turnCostUsd } : {}),
      };
      if (!event.card) {
        return { ...state, turnSpend: { ...spend, calls: [...current.calls, callOf(event)] } };
      }
      const run = state.subagents[event.card] ?? {
        card: event.card,
        status: "running" as const,
        calls: [],
        priced: true,
      };
      const updated: SubagentInfo = {
        ...run,
        calls: [...run.calls, callOf(event)],
        priced: run.priced && event.priced,
      };
      if (event.agent && !updated.agent) updated.agent = event.agent;
      return {
        ...state,
        turnSpend: spend,
        subagents: { ...state.subagents, [event.card]: updated },
      };
    }
    case "subagent": {
      const known = state.subagents[event.card];
      const base: SubagentInfo =
        event.phase === "started" || !known
          ? { card: event.card, status: "running", calls: [], priced: true }
          : known;
      const info: SubagentInfo = {
        ...base,
        ...(event.agent !== undefined ? { agent: event.agent } : {}),
        ...(event.depth !== undefined ? { depth: event.depth } : {}),
        ...(event.run !== undefined ? { run: event.run } : {}),
        ...(event.task !== undefined ? { task: event.task } : {}),
      };
      if (event.phase === "finished") {
        info.status = event.ok === false ? "failed" : "done";
        if (event.inputTokens !== undefined) info.inputTokens = event.inputTokens;
        if (event.outputTokens !== undefined) info.outputTokens = event.outputTokens;
        if (event.costUsd !== undefined && info.priced) info.costUsd = event.costUsd;
      }
      return { ...state, subagents: { ...state.subagents, [event.card]: info } };
    }
    case "guardrail":
      return withEntry(endThought(state, now), {
        kind: "guardrail",
        stage: event.stage,
        findings: event.findings,
      });
    case "route":
      return { ...state, routedModel: event.model };
    case "questions": {
      // Only while a turn runs; once a cancel is asked for, agent86 declines whatever waits.
      if (!state.turn.running || state.turn.cancelRequested) return withoutQuestions(state);
      if (!event.asking && event.waiting.length === 0) return withoutQuestions(state);
      return { ...state, questions: { asking: event.asking, waiting: event.waiting } };
    }
    default:
      return state;
  }
}

/** One line of the approval inbox. */
export interface InboxItem {
  question: Question;
  /** `asking`: the question agent86 is asking now; `waiting`: behind it, in order. */
  position: "asking" | "waiting";
  /** The open permission request for it, once it has arrived (it may come after the event). */
  request?: PendingPermission;
  /** Whether the call's card is in the thread yet (agent86 announces it just before asking). */
  hasCard: boolean;
  /** For a `secret` question being asked: the open request, once it has arrived. */
  secret?: PendingSecret;
}

/**
 * The approval inbox: the question being asked, then those waiting, keyed by `call` and
 * reconciled with the permission requests and cards as they arrive, in whatever order. A question
 * already answered here (its card has a decision) is left out until agent86's next event.
 */
export function inboxItems(state: SessionState): InboxItem[] {
  const queue = state.questions;
  if (!queue || state.turn.cancelRequested) return [];
  const tools = new Map<string, ToolEntry>();
  for (const entry of state.entries) if (entry.kind === "tool") tools.set(entry.toolCallId, entry);
  const items: InboxItem[] = [];
  const add = (question: Question, position: InboxItem["position"]) => {
    if (question.kind === "secret") {
      // agent86 names no call for a secret; the one being asked is the open request, if any.
      const secret = position === "asking" ? state.secrets?.[0] : undefined;
      items.push({ question, position, ...(secret ? { secret } : {}), hasCard: false });
      return;
    }
    const tool = question.call ? tools.get(question.call) : undefined;
    const request = question.call
      ? state.permissions.find((p) => p.toolCallId === question.call)
      : undefined;
    if (tool?.decision && !request) return;
    items.push({ question, position, ...(request ? { request } : {}), hasCard: !!tool });
  };
  if (queue.asking) add(queue.asking, "asking");
  for (const question of queue.waiting) add(question, "waiting");
  return items;
}

/** What the agent is doing now, for the phase line (docs/UI_DESIGN.md §3.3). */
export function phase(state: SessionState): string | undefined {
  if (!state.turn.running) return undefined;
  if (state.turn.cancelRequested) return "Cancelling…";
  if (state.permissions.length > 0) return "Waiting for your approval";
  if (state.secrets?.length) return "Waiting for a secret";
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
