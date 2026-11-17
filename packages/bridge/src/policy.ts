// The policy filter: the bridge's checks on messages from the browser to agent86.
// See docs/ARCHITECTURE.md §3.4 and docs/SECURITY.md (T7, T8, T9, T22).
//
// The filter only ever narrows what the browser can do. It never rewrites messages from agent86.

/** Methods the browser may call on the agent. Anything else is refused. */
export const ALLOWED_CLIENT_METHODS: ReadonlySet<string> = new Set([
  "initialize",
  "session/new",
  "session/load",
  "session/resume",
  "session/list",
  "session/prompt",
  "session/cancel",
  "session/set_config_option",
  "session/set_mode",
  "$/cancel_request",
  // agent86 1.0.22's memory: list, pin, and forget what it has learned (T7).
  "_com.maetek.agent86/memory/list",
  "_com.maetek.agent86/memory/pin",
  "_com.maetek.agent86/memory/forget",
  // agent86 1.0.23's secrets: hand one over, list the names, forget one (T7, T22).
  "_com.maetek.agent86/secret/set",
  "_com.maetek.agent86/secret/list",
  "_com.maetek.agent86/secret/forget",
]);

/** agent86 1.0.23: the client-to-agent request that carries a secret's value in `params.value`. */
export const SECRET_SET_METHOD = "_com.maetek.agent86/secret/set";
/** agent86 1.0.23: the agent-to-client request whose reply carries a value in `result.value`. */
export const SECRET_REQUEST_METHOD = "_com.maetek.agent86/secret/request";
/** What a secret's value is written as anywhere the bridge records a message, as agent86 does. */
export const HIDDEN = "<hidden>";

/**
 * A copy of `message` that is safe to record: a secret's value becomes `<hidden>`, as in agent86's
 * own transcript. `answering` is the method of the agent86 request a reply answers, when known (a
 * reply carries no method of its own). The message itself is never changed.
 */
export function redactSecrets(message: unknown, answering?: string): unknown {
  if (!isObject(message)) return message;
  if (message.method === SECRET_SET_METHOD && isObject(message.params) && "value" in message.params)
    return { ...message, params: { ...message.params, value: HIDDEN } };
  if (
    message.method === undefined &&
    answering === SECRET_REQUEST_METHOD &&
    isObject(message.result) &&
    "value" in message.result
  )
    return { ...message, result: { ...message.result, value: HIDDEN } };
  return message;
}

/** The capabilities the browser is allowed to claim: none that hand it files or terminals. */
export const FORCED_CLIENT_CAPABILITIES = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
} as const;

/** agent86's state events (agent86 docs/ACP.md): an opt-in that only adds notifications. */
export const STATE_EXTENSION = "com.maetek.agent86/state";
/**
 * agent86's secrets (1.0.23): the client promises a masked entry, so agent86 offers the model
 * `request_secret` and asks the client for a value, which only the user can give (T22).
 */
export const SECRETS_EXTENSION = "com.maetek.agent86/secrets";

/**
 * The browser's capabilities as agent86 will see them: files and terminal forced off, plus the
 * opt-ins copied when present: `session.compaction` (ACP `compaction_update`) and agent86's state
 * events, which only change how agent86 reports, and agent86's secrets, which lets the model ask
 * the user for a secret (never anything it could do without the user typing one). Anything else
 * the browser claims is dropped.
 */
export function clientCapabilities(claimed: unknown): Record<string, unknown> {
  const caps: Record<string, unknown> = { ...FORCED_CLIENT_CAPABILITIES };
  if (!isObject(claimed)) return caps;
  if (isObject(claimed.session) && isObject(claimed.session.compaction)) {
    caps.session = { compaction: {} };
  }
  if (isObject(claimed._meta)) {
    const meta: Record<string, unknown> = {};
    for (const key of [STATE_EXTENSION, SECRETS_EXTENSION]) {
      const value = claimed._meta[key];
      if (value === true || isObject(value)) meta[key] = true;
    }
    if (Object.keys(meta).length) caps._meta = meta;
  }
  return caps;
}

export interface PolicyContext {
  /** The real path the thread's agent86 process was started in. */
  workspace: string;
  /** Resolves a path the way the file system will (symlinks followed); throws if it does not exist. */
  realpath: (path: string) => string;
}

export type PolicyResult =
  | { action: "forward"; message: Record<string, unknown> }
  | { action: "reject"; error: Record<string, unknown> | undefined; reason: string };

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reject(id: unknown, code: number, reason: string): PolicyResult {
  const hasId = typeof id === "string" || typeof id === "number";
  return {
    action: "reject",
    reason,
    // A notification gets no answer, as JSON-RPC requires.
    error: hasId
      ? { jsonrpc: "2.0", id, error: { code, message: `agent86-web bridge: ${reason}` } }
      : undefined,
  };
}

function cwdAllowed(cwd: unknown, ctx: PolicyContext): boolean {
  if (typeof cwd !== "string" || cwd.length === 0) return false;
  try {
    return ctx.realpath(cwd) === ctx.workspace;
  } catch {
    return false;
  }
}

/** Decide what to do with one frame the browser sent. */
export function filterClientMessage(raw: string, ctx: PolicyContext): PolicyResult {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return reject(null, INVALID_REQUEST, "the message is not JSON");
  }
  if (!isObject(message) || message.jsonrpc !== "2.0") {
    return reject(null, INVALID_REQUEST, "the message is not a JSON-RPC 2.0 object");
  }

  const { id, method } = message;

  // A response to a request agent86 made (a permission answer, for example): pass it on.
  if (method === undefined) {
    if (("result" in message || "error" in message) && id !== undefined) {
      return { action: "forward", message };
    }
    return reject(null, INVALID_REQUEST, "the message is neither a request nor a response");
  }

  if (typeof method !== "string" || !ALLOWED_CLIENT_METHODS.has(method)) {
    return reject(id, METHOD_NOT_FOUND, `the method ${JSON.stringify(method)} is not allowed`);
  }

  const params = message.params;
  if (params !== undefined && !isObject(params)) {
    return reject(id, INVALID_PARAMS, "params must be an object");
  }

  switch (method) {
    case "initialize": {
      const next = {
        ...params,
        clientCapabilities: clientCapabilities(params?.clientCapabilities),
      };
      return { action: "forward", message: { ...message, params: next } };
    }
    // session/resume (agent86 1.0.21) reopens without a replay; same params, so the same rules.
    case "session/new":
    case "session/load":
    case "session/resume": {
      if (!cwdAllowed(params?.cwd, ctx)) {
        return reject(id, INVALID_PARAMS, "cwd must be the workspace this thread was opened in");
      }
      // A browser-supplied MCP server would be a program run as the user (T8).
      const next = { ...params, cwd: ctx.workspace, mcpServers: [] };
      return { action: "forward", message: { ...message, params: next } };
    }
    case "session/list": {
      if (params?.cwd !== undefined && !cwdAllowed(params.cwd, ctx)) {
        return reject(id, INVALID_PARAMS, "cwd must be the workspace this thread was opened in");
      }
      return { action: "forward", message };
    }
    default:
      return { action: "forward", message };
  }
}
