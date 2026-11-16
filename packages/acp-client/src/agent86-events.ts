// agent86's state events, an ACP extension (agent86 docs/ACP.md, "agent86's state").
//
// agent86 1.0.20 advertises it in `initialize` as
// `agentCapabilities._meta["com.maetek.agent86/state"] = { version: 1 }`. A client that asks for it
// (`clientCapabilities._meta["com.maetek.agent86/state"]: true`) gets one notification per event:
// `_com.maetek.agent86/session/event` with `{ sessionId, event: { kind, ts, ... } }`.
//
// agent86 1.0.21 adds the `questions` event (the approval inbox) and, on a sub-agent's permission
// request, `_meta["com.maetek.agent86/subagent"]` (who asks), both only for a client that asked.
//
// Reading is lenient on purpose: unknown kinds, unknown fields, and fields of the wrong type are
// skipped, never an error. Older agent86 never sends any of this.

/** The extension's key in `_meta`, both ways. */
export const STATE_EXTENSION = "com.maetek.agent86/state";
/** The notification that carries one event. */
export const STATE_EVENT_METHOD = "_com.maetek.agent86/session/event";
/** The extension version this client reads. A different version could break a reader. */
export const STATE_EXTENSION_VERSION = 1;

/** One model call, the main agent's or a sub-agent's. */
export interface ModelCall {
  step?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** The call's cost in US dollars; undefined when agent86 has no price for the model. */
  costUsd?: number;
  stopReason?: string;
  toolCalls: string[];
}

export interface ModelCallEvent extends ModelCall {
  kind: "model_call";
  ts?: number;
  /** Whether the cost is known. `false` reads as unknown, not free. */
  priced: boolean;
  /** The turn's spend so far, sub-agents included. */
  turnCostUsd?: number;
  /** `[limits] max_cost_usd`; null when there is no cap. */
  costCapUsd: number | null;
  /** Set for a sub-agent's call: the tool call id of its delegation's card. */
  card?: string;
  agent?: string;
  depth?: number;
  run?: number;
}

export interface SubagentEvent {
  kind: "subagent";
  ts?: number;
  phase: "started" | "finished";
  card: string;
  agent?: string;
  depth?: number;
  run?: number;
  task?: string;
  ok?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface GuardrailEvent {
  kind: "guardrail";
  ts?: number;
  stage: string;
  /** What was flagged. agent86 1.0.20 sends a comma-separated string; a list is accepted too. */
  findings: string[];
}

export interface RouteEvent {
  kind: "route";
  ts?: number;
  model: string;
}

/**
 * A question agent86 asks or will ask (agent86 1.0.21). Over ACP only two kinds occur: `approval`
 * (a tool call; its permission request names `call`) and `specialty` (the one-time approval of a
 * project specialist, `subject`, whose request offers one `allow_always` option).
 */
export interface Question {
  kind: "approval" | "specialty";
  /** The tool asking about; `delegate` for a specialty. */
  tool?: string;
  /** The tool call id its permission request will name. */
  call?: string;
  /** The sub-agent asking; absent when the main agent asks. */
  agent?: string;
  /** The tool call id of that sub-agent's delegation card. */
  card?: string;
  /** For a specialty: the project specialist to be approved. */
  subject?: string;
}

/**
 * The questions queue changed (agent86 1.0.21): the one being asked and those behind it, in the
 * order they will be asked. agent86 asks one at a time, first in, first out.
 */
export interface QuestionsEvent {
  kind: "questions";
  ts?: number;
  asking: Question | null;
  waiting: Question[];
}

export type Agent86Event =
  ModelCallEvent | SubagentEvent | GuardrailEvent | RouteEvent | QuestionsEvent;

/** The key in a permission request's `_meta` that says which sub-agent asks (agent86 1.0.21). */
export const SUBAGENT_META = "com.maetek.agent86/subagent";

/** Who asks for a permission, when a sub-agent does (agent86 1.0.21, with the state extension). */
export interface SubagentAsker {
  /** The tool call id of the delegation's card. */
  card: string;
  /** The per-spawn number, as `run` in the state events. */
  run?: number;
  /** The specialist or role name. */
  agent?: string;
  /** 1 when the main agent delegated it; deeper when nested. */
  depth?: number;
  /** The git worktree it works in, if it runs in one. */
  worktree?: { path: string; branch?: string };
  /** Its model calls so far. */
  steps?: number;
  /** Its spend so far in US dollars, including anything it delegated. */
  costUsd?: number;
  /** The whole turn's spend so far. */
  turnCostUsd?: number;
  /** `[limits] max_cost_usd`; null when off. */
  costCapUsd: number | null;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Copy the defined values only, so an optional field is absent rather than undefined. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function findings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" ? item : isObject(item) ? str(item.kind) : undefined,
      )
      .filter((item): item is string => !!item);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

/** One event, or undefined for an unknown kind or one missing what it needs. */
export function parseEvent(raw: unknown): Agent86Event | undefined {
  if (!isObject(raw)) return undefined;
  const ts = num(raw.ts);
  switch (raw.kind) {
    case "model_call": {
      const priced = raw.priced !== false;
      return defined<ModelCallEvent>({
        kind: "model_call",
        ts,
        step: num(raw.step),
        model: str(raw.model),
        inputTokens: num(raw.input_tokens),
        outputTokens: num(raw.output_tokens),
        costUsd: priced ? num(raw.cost_usd) : undefined,
        stopReason: str(raw.stop_reason),
        toolCalls: Array.isArray(raw.tool_calls)
          ? raw.tool_calls.filter((t): t is string => typeof t === "string")
          : [],
        priced,
        turnCostUsd: num(raw.turn_cost_usd),
        costCapUsd: num(raw.cost_cap_usd) ?? null,
        card: str(raw.card),
        agent: str(raw.agent),
        depth: num(raw.depth),
        run: num(raw.run),
      });
    }
    case "subagent": {
      const card = str(raw.card);
      if (!card || (raw.phase !== "started" && raw.phase !== "finished")) return undefined;
      return defined<SubagentEvent>({
        kind: "subagent",
        ts,
        phase: raw.phase,
        card,
        agent: str(raw.agent),
        depth: num(raw.depth),
        run: num(raw.run),
        task: str(raw.task),
        ok: typeof raw.ok === "boolean" ? raw.ok : undefined,
        inputTokens: num(raw.input_tokens),
        outputTokens: num(raw.output_tokens),
        costUsd: num(raw.cost_usd),
      });
    }
    case "guardrail": {
      const stage = str(raw.stage);
      if (!stage) return undefined;
      return defined<GuardrailEvent>({
        kind: "guardrail",
        ts,
        stage,
        findings: findings(raw.findings),
      });
    }
    case "route": {
      const model = str(raw.model);
      if (!model) return undefined;
      return defined<RouteEvent>({ kind: "route", ts, model });
    }
    case "questions": {
      // `asking` must be there (a question or null); a question of a kind this client does not
      // know is left out, as the extension asks.
      if (!("asking" in raw)) return undefined;
      const waiting = Array.isArray(raw.waiting) ? raw.waiting : [];
      return defined<QuestionsEvent>({
        kind: "questions",
        ts,
        asking: parseQuestion(raw.asking) ?? null,
        waiting: waiting.map(parseQuestion).filter((q): q is Question => !!q),
      });
    }
    default:
      return undefined;
  }
}

/** One question, or undefined for an unknown kind. Omitted fields stay absent. */
export function parseQuestion(raw: unknown): Question | undefined {
  if (!isObject(raw) || (raw.kind !== "approval" && raw.kind !== "specialty")) return undefined;
  return defined<Question>({
    kind: raw.kind,
    tool: str(raw.tool),
    call: str(raw.call),
    agent: str(raw.agent),
    card: str(raw.card),
    subject: str(raw.subject),
  });
}

/**
 * Who asks, from a permission request's `_meta`, or undefined when the main agent asks (agent86
 * sends nothing then) or the entry is unusable.
 */
export function parseAsker(meta: unknown): SubagentAsker | undefined {
  if (!isObject(meta)) return undefined;
  const raw = meta[SUBAGENT_META];
  if (!isObject(raw)) return undefined;
  const card = str(raw.card);
  if (!card) return undefined;
  const tree = isObject(raw.worktree) ? raw.worktree : undefined;
  const path = tree ? str(tree.path) : undefined;
  return defined<SubagentAsker>({
    card,
    run: num(raw.run),
    agent: str(raw.agent),
    depth: num(raw.depth),
    worktree: path ? defined({ path, branch: str(tree!.branch) }) : undefined,
    steps: num(raw.steps),
    costUsd: num(raw.cost_usd),
    turnCostUsd: num(raw.turn_cost_usd),
    costCapUsd: num(raw.cost_cap_usd) ?? null,
  });
}

/**
 * Whether `initialize`'s result offers `session/resume` (`sessionCapabilities.resume`, agent86
 * 1.0.21). The spec forbids calling it otherwise.
 */
export function advertisesResume(agentCapabilities: unknown): boolean {
  if (!isObject(agentCapabilities) || !isObject(agentCapabilities.sessionCapabilities))
    return false;
  return isObject(agentCapabilities.sessionCapabilities.resume);
}

/** The notification's params, or undefined when they are not an event for a session. */
export function parseEventParams(
  params: unknown,
): { sessionId: string; event: Agent86Event } | undefined {
  if (!isObject(params)) return undefined;
  const sessionId = str(params.sessionId);
  const event = parseEvent(params.event);
  return sessionId && event ? { sessionId, event } : undefined;
}

/** Whether `initialize`'s result advertises the state extension in a version this client reads. */
export function advertisesState(agentCapabilities: unknown): boolean {
  if (!isObject(agentCapabilities) || !isObject(agentCapabilities._meta)) return false;
  const entry = agentCapabilities._meta[STATE_EXTENSION];
  return isObject(entry) && entry.version === STATE_EXTENSION_VERSION;
}
