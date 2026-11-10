// One `agent86 acp` process and its relay to one WebSocket (docs/ARCHITECTURE.md §3.3–3.4).
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { WebSocket } from "ws";
import { needsShell } from "./agent86.ts";
import { filterClientMessage } from "./policy.ts";

/** The largest message relayed in either direction (docs/SECURITY.md T12). */
export const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
/** How many stderr lines are kept for the logs drawer. */
export const STDERR_LINES = 500;
/** Pause agent86's stdout while this many frames wait to be sent to the browser. */
const MAX_PENDING_SENDS = 256;

export interface AgentProcessOptions {
  command: string;
  /** Arguments placed before `acp` (`--agent-arg`). */
  args: readonly string[];
  /** The workspace's real path; the process starts here. */
  workspace: string;
  realpath: (path: string) => string;
  log?: (line: string) => void;
}

export class AgentProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly stderr: string[] = [];
  readonly exited: Promise<number | null>;
  private stdoutBuffer = "";
  private socket: WebSocket | undefined;
  private pendingSends = 0;

  constructor(private readonly options: AgentProcessOptions) {
    this.child = spawn(options.command, [...options.args, "acp"], {
      cwd: options.workspace,
      stdio: ["pipe", "pipe", "pipe"],
      shell: needsShell(options.command),
      windowsHide: true,
    });
    this.exited = new Promise((resolve) => {
      this.child.on("error", (error) => {
        this.note(`could not start agent86: ${error.message}`);
        resolve(null);
      });
      this.child.on("exit", (code) => resolve(code));
    });
    this.child.stdout.setEncoding("utf8").on("data", (chunk: string) => this.onStdout(chunk));
    this.child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) if (line) this.note(line);
    });
    // A write to a process that has exited fails with EPIPE; the exit is handled elsewhere.
    this.child.stdin.on("error", () => undefined);
  }

  /** Relay between this process and `socket` until either ends. */
  attach(socket: WebSocket): void {
    this.socket = socket;
    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        socket.close(1003, "binary frames are not accepted");
        return;
      }
      const verdict = filterClientMessage(data.toString(), {
        workspace: this.options.workspace,
        realpath: this.options.realpath,
      });
      if (verdict.action === "reject") {
        this.note(`bridge refused a message: ${verdict.reason}`);
        if (verdict.error) this.send(JSON.stringify(verdict.error));
        return;
      }
      if (!this.child.stdin.write(`${JSON.stringify(verdict.message)}\n`)) {
        socket.pause();
        this.child.stdin.once("drain", () => socket.resume());
      }
    });
    socket.on("close", () => this.stop());
    void this.exited.then((code) => {
      if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) {
        socket.close(1011, `agent86 exited (status ${code ?? "unknown"})`);
      }
    });
  }

  stop(): void {
    this.socket = undefined;
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.stdin.end();
      const timer = setTimeout(() => this.child.kill(), 2_000);
      void this.exited.then(() => clearTimeout(timer));
    }
  }

  private note(line: string): void {
    this.stderr.push(line);
    if (this.stderr.length > STDERR_LINES) this.stderr.shift();
    this.options.log?.(line);
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newline: number;
    while ((newline = this.stdoutBuffer.indexOf("\n")) >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.send(line);
    }
    if (this.stdoutBuffer.length > MAX_MESSAGE_BYTES) {
      this.note("agent86 sent a message larger than the bridge's limit; stopping it");
      this.stdoutBuffer = "";
      this.child.kill();
    }
  }

  private send(frame: string): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== socket.OPEN) return;
    this.pendingSends++;
    if (this.pendingSends >= MAX_PENDING_SENDS) this.child.stdout.pause();
    socket.send(frame, () => {
      this.pendingSends--;
      if (this.pendingSends < MAX_PENDING_SENDS / 2) this.child.stdout.resume();
    });
  }
}
