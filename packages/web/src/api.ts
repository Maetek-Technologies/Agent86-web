// The bridge's REST surface (docs/ARCHITECTURE.md §3.2).
import { readLaunchToken } from "./token.ts";

export interface BridgeInfo {
  bridge: { version: string };
  agent86: { command: string; version: string; minVersion: string };
  roots: string[];
  defaultWorkspace: string;
  /** Newer releases found by the bridge's daily check, if any. */
  updates?: { agent86?: string; agent86Web?: string };
}

export class BridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

const MESSAGES: Record<string, string> = {
  token_invalid:
    "This sign-in link has already been used or has expired. Open the link that agent86-web printed again, or restart agent86-web for a new one.",
  not_signed_in:
    "This browser is not signed in to agent86-web. Open the link that agent86-web printed in your terminal.",
  origin_not_allowed: "The bridge refused this page's origin.",
  host_not_allowed: "The bridge refused this address. Open it as http://127.0.0.1:<port>/.",
};

async function failure(res: Response): Promise<BridgeError> {
  let code = `http_${res.status}`;
  try {
    code = ((await res.json()) as { error?: string }).error ?? code;
  } catch {
    // Not JSON; keep the status.
  }
  return new BridgeError(code, MESSAGES[code] ?? `The bridge answered ${res.status} (${code}).`);
}

let signingIn: Promise<void> | undefined;

/**
 * Exchange the launch token in the URL for a session cookie, once per page load, then remove the
 * token from the address bar (docs/SECURITY.md T5). Without a token, an existing cookie is used.
 */
export function signIn(): Promise<void> {
  signingIn ??= (async () => {
    const token = readLaunchToken(window.location.hash);
    if (!token) return;
    history.replaceState(null, "", window.location.pathname + window.location.search);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent86-web": "1" },
      body: JSON.stringify({ token }),
      credentials: "same-origin",
    });
    if (!res.ok) throw await failure(res);
  })();
  return signingIn;
}

export async function getInfo(): Promise<BridgeInfo> {
  const res = await fetch("/api/info", { credentials: "same-origin" });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as BridgeInfo;
}

/** The WebSocket URL for one thread's ACP channel; `fresh` asks for a new agent86 process. */
export function acpUrl(threadId: string, workspace: string, fresh = false): string {
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  const query = `workspace=${encodeURIComponent(workspace)}${fresh ? "&fresh=1" : ""}`;
  return `${scheme}//${window.location.host}/acp/${threadId}?${query}`;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
}

export interface SessionSummary {
  sessionId: string;
  cwd: string;
  title?: string;
  updatedAt?: string;
}

/** agent86's saved sessions for a workspace, newest first. */
export async function listSessions(workspace: string): Promise<SessionSummary[]> {
  const body = await getJson<{ sessions: SessionSummary[] }>(
    `/api/sessions?workspace=${encodeURIComponent(workspace)}`,
  );
  return body.sessions;
}

export interface DirectoryListing {
  path: string | null;
  parent: string | null;
  dirs: { name: string; path: string }[];
}

/** Directories under the bridge's roots; with no path, the roots themselves. */
export function listDirectories(path?: string): Promise<DirectoryListing> {
  return getJson(`/api/workspaces${path ? `?path=${encodeURIComponent(path)}` : ""}`);
}

/** Workspace-relative file paths matching `query`, for @ mentions. */
export async function findFiles(workspace: string, query: string): Promise<string[]> {
  const body = await getJson<{ files: string[] }>(
    `/api/files?workspace=${encodeURIComponent(workspace)}&q=${encodeURIComponent(query)}`,
  );
  return body.files;
}

export interface ProjectConfig {
  path: string;
  contents: string;
  sha256: string;
}

export interface TrustRecord {
  path: string;
  sha256: string;
  trustedAt: string;
}

/** The workspace's agent86 config file, for review, and whether the bridge trusts it as it is. */
export function getTrust(
  workspace: string,
): Promise<{ config: ProjectConfig | null; trusted: boolean }> {
  return getJson(`/api/trust?workspace=${encodeURIComponent(workspace)}`);
}

async function sendJson(method: "POST" | "DELETE", path: string, body: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json", "x-agent86-web": "1" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  if (!res.ok) {
    let text = `The bridge answered ${res.status}.`;
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      text = data.message ?? data.error ?? text;
    } catch {
      // Keep the status.
    }
    throw new BridgeError(`http_${res.status}`, text);
  }
  return res.json();
}

/** Trust the workspace's config file as reviewed (by its hash). */
export async function trustProject(workspace: string, sha256: string): Promise<void> {
  await sendJson("POST", "/api/trust", { workspace, sha256 });
}

export async function listTrusted(): Promise<TrustRecord[]> {
  return (await getJson<{ projects: TrustRecord[] }>("/api/trust")).projects;
}

export async function revokeTrust(path: string): Promise<void> {
  await sendJson("DELETE", "/api/trust", { path });
}
