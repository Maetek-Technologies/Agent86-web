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
            result?: { sessions?: SessionSummary[] };
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
          else resolve(message.result?.sessions ?? []);
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
