// The bridge's REST surface (docs/ARCHITECTURE.md §3.2).
import { readLaunchToken } from "./token.ts";

export interface BridgeInfo {
  bridge: { version: string };
  agent86: { command: string; version: string; minVersion: string };
  roots: string[];
  defaultWorkspace: string;
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

/** The WebSocket URL for one thread's ACP channel. */
export function acpUrl(threadId: string, workspace: string): string {
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}/acp/${threadId}?workspace=${encodeURIComponent(workspace)}`;
}
