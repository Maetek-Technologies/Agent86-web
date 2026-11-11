// The policy filter: the bridge's checks on messages from the browser to agent86.
// See docs/ARCHITECTURE.md §3.4 and docs/SECURITY.md (T7, T8, T9).
//
// The filter only ever narrows what the browser can do. It never rewrites messages from agent86.

/** Methods the browser may call on the agent. Anything else is refused. */
export const ALLOWED_CLIENT_METHODS: ReadonlySet<string> = new Set([
  "initialize",
  "session/new",
  "session/load",
  "session/list",
  "session/prompt",
  "session/cancel",
  "session/set_config_option",
  "session/set_mode",
  "$/cancel_request",
]);

/** The capabilities the browser is allowed to claim: none that hand it files or terminals. */
export const FORCED_CLIENT_CAPABILITIES = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
} as const;

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
      const next = { ...params, clientCapabilities: FORCED_CLIENT_CAPABILITIES };
      return { action: "forward", message: { ...message, params: next } };
    }
    case "session/new":
    case "session/load": {
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
