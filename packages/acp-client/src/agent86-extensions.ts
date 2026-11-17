// agent86's memory (1.0.22) and secrets (1.0.23) extensions (agent86 docs/ACP.md, "agent86's
// memory (an extension)" and "agent86's secrets (an extension)").
//
// Both are advertised in `initialize` as `agentCapabilities._meta[<key>] = { version: 1 }`. Memory
// and the three secret requests are requests the client makes when it wants to; the one request
// the other way, `secret/request`, is sent only to a client that claims
// `clientCapabilities._meta["com.maetek.agent86/secrets"]`, which promises a masked entry and that
// the typed value stays out of its thread, history, and logs.
//
// Reading is lenient, as for the state events: unknown fields are ignored, and an entry missing
// what it needs is skipped.

/** The memory extension's key in `agentCapabilities._meta`. */
export const MEMORY_EXTENSION = "com.maetek.agent86/memory";
/** The secrets extension's key, in `agentCapabilities._meta` and `clientCapabilities._meta`. */
export const SECRETS_EXTENSION = "com.maetek.agent86/secrets";
/** The version of both extensions this client reads. */
export const EXTENSION_VERSION = 1;

export const MEMORY_LIST_METHOD = "_com.maetek.agent86/memory/list";
export const MEMORY_PIN_METHOD = "_com.maetek.agent86/memory/pin";
export const MEMORY_FORGET_METHOD = "_com.maetek.agent86/memory/forget";
export const SECRET_SET_METHOD = "_com.maetek.agent86/secret/set";
export const SECRET_LIST_METHOD = "_com.maetek.agent86/secret/list";
export const SECRET_FORGET_METHOD = "_com.maetek.agent86/secret/forget";
/** agent86 → client: the model's `request_secret`. */
export const SECRET_REQUEST_METHOD = "_com.maetek.agent86/secret/request";

/** The most entries one `memory/list` page may ask for. */
export const MEMORY_PAGE_MAX = 200;
/** A secret's name, as agent86 checks it. */
export const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** The shortest value agent86 takes (shorter would rewrite ordinary text wherever it appears). */
export const SECRET_MIN_CHARS = 6;

/** Facts are what `remember` keeps; episodes are one per finished turn. Numbered separately. */
export type MemoryKind = "fact" | "episode";

export interface MemoryEntry {
  kind: MemoryKind;
  id: number;
  /** The fact, or the episode's task. A secret's value is already `${secret:NAME}`. */
  text: string;
  /** ISO 8601, UTC. */
  storedAt: string;
  pinned: boolean;
  pinnedAt?: string;
  /** A fact's kind: `fact`, or `compaction` for an episode archiving a compaction. */
  category?: string;
  /** An episode's outcome. */
  outcome?: string;
  /** The session an episode came from. */
  sessionId?: string;
}

export interface MemoryPage {
  /** Newest first. */
  entries: MemoryEntry[];
  /** Pass back as `cursor` for the next page; absent on the last. */
  nextCursor?: string;
}

export interface MemoryQuery {
  kind?: MemoryKind;
  /** 1 to 200; agent86's default is 50. */
  limit?: number;
  cursor?: string;
  /** Pinned entries only. */
  pinned?: boolean;
}

export interface SecretInfo {
  name: string;
  /** Kept in the OS keyring for this project folder. */
  remembered: boolean;
}

export interface SecretList {
  /** Names only; agent86 never sends a value. */
  secrets: SecretInfo[];
  /** A keyring is there, so a secret can be remembered. */
  canRemember: boolean;
}

export interface SecretSetResult {
  name: string;
  remembered: boolean;
  /** When the keyring did not do as asked (the secret is then held for the session). */
  warning?: string;
}

export interface SecretForgetResult {
  forgotten: boolean;
  warning?: string;
}

/** The model asks for a secret (`request_secret`). Never carries a value. */
export interface SecretRequest {
  sessionId: string;
  name: string;
  /** The model's words, with any value already held replaced by its placeholder. */
  reason: string;
  /** A value is held under the name already. */
  replacing: boolean;
  canRemember: boolean;
  /** It is remembered for the project, so a remember choice should start on. */
  remembered: boolean;
}

/** The answer to a `secret/request`. Anything but `entered` with a value declines. */
export type SecretAnswer =
  { outcome: "entered"; value: string; remember: boolean } | { outcome: "declined" };

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Whether `initialize`'s result advertises `key` in a version this client reads. */
function advertises(agentCapabilities: unknown, key: string): boolean {
  if (!isObject(agentCapabilities) || !isObject(agentCapabilities._meta)) return false;
  const entry = agentCapabilities._meta[key];
  return isObject(entry) && entry.version === EXTENSION_VERSION;
}

/** agent86 1.0.22: list, pin, and forget its memory. */
export function advertisesMemory(agentCapabilities: unknown): boolean {
  return advertises(agentCapabilities, MEMORY_EXTENSION);
}

/** agent86 1.0.23: secrets set, listed, and forgotten by the client, and asked for by the model. */
export function advertisesSecrets(agentCapabilities: unknown): boolean {
  return advertises(agentCapabilities, SECRETS_EXTENSION);
}

/** One memory entry, or undefined when it lacks a kind, id, or text. */
export function parseMemoryEntry(raw: unknown): MemoryEntry | undefined {
  if (!isObject(raw)) return undefined;
  const kind = raw.kind === "fact" || raw.kind === "episode" ? raw.kind : undefined;
  const id = typeof raw.id === "number" && Number.isInteger(raw.id) ? raw.id : undefined;
  const text = str(raw.text);
  if (!kind || id === undefined || text === undefined) return undefined;
  const entry: MemoryEntry = {
    kind,
    id,
    text,
    storedAt: str(raw.storedAt) ?? "",
    pinned: raw.pinned === true,
  };
  const pinnedAt = str(raw.pinnedAt);
  if (pinnedAt) entry.pinnedAt = pinnedAt;
  const category = str(raw.category);
  if (category) entry.category = category;
  const outcome = str(raw.outcome);
  if (outcome !== undefined) entry.outcome = outcome;
  const sessionId = str(raw.sessionId);
  if (sessionId) entry.sessionId = sessionId;
  return entry;
}

export function parseMemoryPage(raw: unknown): MemoryPage {
  if (!isObject(raw)) return { entries: [] };
  const entries = (Array.isArray(raw.entries) ? raw.entries : [])
    .map(parseMemoryEntry)
    .filter((e): e is MemoryEntry => !!e);
  const nextCursor = str(raw.nextCursor);
  return nextCursor ? { entries, nextCursor } : { entries };
}

export function parseSecretList(raw: unknown): SecretList {
  if (!isObject(raw)) return { secrets: [], canRemember: false };
  const secrets = (Array.isArray(raw.secrets) ? raw.secrets : [])
    .map((s): SecretInfo | undefined => {
      if (!isObject(s)) return undefined;
      const name = str(s.name);
      return name ? { name, remembered: s.remembered === true } : undefined;
    })
    .filter((s): s is SecretInfo => !!s);
  return { secrets, canRemember: raw.canRemember === true };
}

export function parseSecretSet(raw: unknown, name: string): SecretSetResult {
  const r = isObject(raw) ? raw : {};
  const result: SecretSetResult = {
    name: str(r.name) ?? name,
    remembered: r.remembered === true,
  };
  const warning = str(r.warning);
  if (warning) result.warning = warning;
  return result;
}

export function parseSecretForget(raw: unknown): SecretForgetResult {
  const r = isObject(raw) ? raw : {};
  const result: SecretForgetResult = { forgotten: r.forgotten === true };
  const warning = str(r.warning);
  if (warning) result.warning = warning;
  return result;
}

/**
 * A `secret/request`'s params, or undefined when they lack a session or a valid name (the client
 * then declines). Unknown fields are ignored; a value, which agent86 never sends, is not read.
 */
export function parseSecretRequest(raw: unknown): SecretRequest | undefined {
  if (!isObject(raw)) return undefined;
  const sessionId = str(raw.sessionId);
  const name = str(raw.name);
  if (!sessionId || !name || !SECRET_NAME.test(name)) return undefined;
  return {
    sessionId,
    name,
    reason: str(raw.reason) ?? "",
    replacing: raw.replacing === true,
    canRemember: raw.canRemember === true,
    remembered: raw.remembered === true,
  };
}

/** Why agent86 would refuse a secret before it is sent, or undefined when it looks acceptable. */
export function secretProblem(name: string, value: string): string | undefined {
  if (!SECRET_NAME.test(name))
    return "A name is letters, digits, and underscores, and does not start with a digit.";
  if ([...value].length < SECRET_MIN_CHARS)
    return `A secret needs at least ${SECRET_MIN_CHARS} characters.`;
  return undefined;
}
