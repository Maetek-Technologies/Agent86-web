// agent86's state events, an ACP extension (agent86 docs/ACP.md, "agent86's state").
//
// agent86 1.0.20 advertises it in `initialize` as
// `agentCapabilities._meta["com.maetek.agent86/state"] = { version: 1 }`. A client that asks for it
// (`clientCapabilities._meta["com.maetek.agent86/state"]: true`) gets one notification per event:
// `_com.maetek.agent86/session/event` with `{ sessionId, event: { kind, ts, ... } }`.
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

export type Agent86Event = ModelCallEvent | SubagentEvent | GuardrailEvent | RouteEvent;

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
    default:
      return undefined;
  }
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
