// The session list for a workspace, from a short-lived `agent86 acp` (docs/ARCHITECTURE.md §3.3).
// The bridge never reads agent86's database itself (docs/adr/0003-standalone-bridge.md).
import { spawn } from "node:child_process";
import { needsShell } from "./agent86.ts";

export interface SessionSummary {
  sessionId: string;
  cwd: string;
  title?: string;
  updatedAt?: string;
}

/**
 * Whether agent86 knows the session's folder. An unknown one is marked in `_meta` with a stand-in
 * `cwd`: since agent86 1.0.20 as `"com.maetek.agent86/cwdKnown": false`, before that (and for a
 * while beside it) as `"agent86": {"cwdKnown": false}`. The namespaced key is read first.
 */
export function cwdKnown(entry: unknown): boolean {
  const meta = (entry as { _meta?: unknown } | null)?._meta;
  if (typeof meta !== "object" || meta === null) return true;
  const record = meta as Record<string, unknown>;
  const namespaced = record["com.maetek.agent86/cwdKnown"];
  if (typeof namespaced === "boolean") return namespaced;
  const old = record.agent86 as { cwdKnown?: unknown } | undefined;
  return typeof old?.cwdKnown === "boolean" ? old.cwdKnown : true;
}

/**
 * A workspace's sessions from agent86's answer: its folder is not known for a marked one, so it
 * belongs to no workspace and is left out (agent86 docs/ACP.md, "Session list"). A filtered list
 * from agent86 1.0.17 or later has none; this keeps it so if that changes.
 */
export function workspaceSessions(sessions: unknown): SessionSummary[] {
  if (!Array.isArray(sessions)) return [];
  return sessions.filter(
    (s): s is SessionSummary =>
      typeof s === "object" &&
      s !== null &&
      typeof (s as SessionSummary).sessionId === "string" &&
      cwdKnown(s),
  );
}

export async function listSessions(
  command: string,
  args: readonly string[],
  workspace: string,
  timeoutMs = 20_000,
): Promise<SessionSummary[]> {
  const child = spawn(command, [...args, "acp"], {
    cwd: workspace,
    stdio: ["pipe", "pipe", "ignore"],
    shell: needsShell(command),
    windowsHide: true,
  });
  child.stdin.on("error", () => undefined);
  const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
  try {
    return await new Promise<SessionSummary[]>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("agent86 did not list its sessions in time")),
        timeoutMs,
      );
      let buffer = "";
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", () => {
        clearTimeout(timer);
        reject(new Error("agent86 exited before listing its sessions"));
      });
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        buffer += chunk;
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          let message: {
            id?: unknown;
            result?: { sessions?: unknown };
            error?: { message?: string };
          };
          try {
            message = JSON.parse(line) as typeof message;
          } catch {
            continue;
          }
          if (message.id === 0) {
            // Initialized: now ask for the list.
            send({ jsonrpc: "2.0", id: 1, method: "session/list", params: { cwd: workspace } });
            continue;
          }
          if (message.id !== 1) continue;
          clearTimeout(timer);
          if (message.error)
            reject(new Error(message.error.message ?? "agent86 refused to list sessions"));
          else resolve(workspaceSessions(message.result?.sessions));
        }
      });
      send({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: 1 } });
    });
  } finally {
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 2_000);
    child.once("exit", () => clearTimeout(timer));
  }
}
