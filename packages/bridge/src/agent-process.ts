// One `agent86 acp` process, and its relay to whichever WebSocket is attached to its thread
// (docs/ARCHITECTURE.md §3.3–3.4).
//
// A process outlives its socket: a reload or a dropped connection reattaches to the same process.
// Each attached socket is a new generation. Request ids from the browser are rewritten per
// generation, so a reply meant for a socket that has gone is dropped instead of reaching the next
// one, whose ids start again from zero. A request from agent86 that no socket can answer (a
// permission request while detached) is declined.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { WebSocket } from "ws";
import { needsShell } from "./agent86.ts";
import { filterClientMessage } from "./policy.ts";

/** The largest message relayed in either direction (docs/SECURITY.md T12). */
export const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
/** How many stderr lines are kept for the logs drawer. */
export const STDERR_LINES = 500;
/** The bridge's own notification carrying one line of agent86's stderr (an ACP extension method). */
export const STDERR_METHOD = "_agent86web/stderr";
/** Pause agent86's stdout while this many frames wait to be sent to the browser. */
const MAX_PENDING_SENDS = 256;

type JsonRpcId = string | number;
type Message = Record<string, unknown>;

export interface AgentProcessOptions {
  command: string;
  /** Arguments placed before `acp` (`--agent-arg`, and `--trust-project` for a trusted project). */
  args: readonly string[];
  /** The workspace's real path; the process starts here. */
  workspace: string;
  realpath: (path: string) => string;
  log?: (line: string) => void;
  now?: () => number;
}

function isId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || typeof value === "number";
}

export class AgentProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly stderr: string[] = [];
  readonly exited: Promise<number | null>;
  /** When the browser or agent86 last sent anything, for idle reaping. */
  lastActivity: number;
  private stdoutBuffer = "";
  private socket: WebSocket | undefined;
  private generation = 0;
  private nextId = 0;
  private pendingSends = 0;
  /** Browser requests agent86 has not answered yet, by their rewritten id. */
  private readonly inflight = new Map<
    string,
    { generation: number; id: JsonRpcId; method: string }
  >();
  /** agent86's requests the attached socket has not answered yet. */
  private readonly asked = new Map<JsonRpcId, string>();
  private readonly now: () => number;

  constructor(private readonly options: AgentProcessOptions) {
    this.now = options.now ?? Date.now;
    this.lastActivity = this.now();
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
    void this.exited.then((code) => {
      const socket = this.socket;
      if (
        socket &&
        (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING)
      ) {
        socket.close(1011, `agent86 exited (status ${code ?? "unknown"})`);
      }
    });
  }

  get workspace(): string {
    return this.options.workspace;
  }

  get alive(): boolean {
    return this.child.exitCode === null && this.child.signalCode === null;
  }

  get attached(): boolean {
    return this.socket !== undefined;
  }

  /** Whether a prompt turn is running (agent86 refuses other requests until it ends). */
  get busy(): boolean {
    for (const request of this.inflight.values())
      if (request.method === "session/prompt") return true;
    return false;
  }

  /** Relay between this process and `socket`, replacing any socket attached before. */
  attach(socket: WebSocket): void {
    const previous = this.socket;
    if (previous) {
      this.detach(previous);
      previous.close(4000, "replaced by a newer connection to this thread");
    }
    this.generation++;
    this.socket = socket;
    this.lastActivity = this.now();
    // The new page has not seen agent86's notes; replay them.
    for (const line of this.stderr) this.send(this.stderrFrame(line));

    socket.on("message", (data, isBinary) => {
      if (this.socket !== socket) return;
      if (isBinary) {
        socket.close(1003, "binary frames are not accepted");
        return;
      }
      this.fromClient(data.toString());
    });
    socket.on("close", () => this.detach(socket));
  }

  /**
   * End the process: close its input, then kill it if it has not exited after a grace period. An
   * attached socket is closed with `reason`, so its page knows to reconnect.
   */
  stop(reason = "agent86 was stopped"): void {
    const socket = this.socket;
    if (socket) {
      this.detach(socket);
      socket.close(4001, reason);
    }
    if (this.alive) {
      this.child.stdin.end();
      const timer = setTimeout(() => this.child.kill(), 2_000);
      void this.exited.then(() => clearTimeout(timer));
    }
  }

  private detach(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.socket = undefined;
    this.lastActivity = this.now();
    // Whatever agent86 asked that socket can no longer be answered by it: decline.
    for (const [id, method] of this.asked) this.declineRequest(id, method);
    this.asked.clear();
  }

  private fromClient(raw: string): void {
    this.lastActivity = this.now();
    const verdict = filterClientMessage(raw, {
      workspace: this.options.workspace,
      realpath: this.options.realpath,
    });
    if (verdict.action === "reject") {
      this.note(`bridge refused a message: ${verdict.reason}`);
      if (verdict.error) this.send(JSON.stringify(verdict.error));
      return;
    }
    const message = verdict.message;
    if (typeof message.method === "string" && isId(message.id)) {
      const rewritten = `w${this.generation}.${this.nextId++}`;
      this.inflight.set(rewritten, {
        generation: this.generation,
        id: message.id,
        method: message.method,
      });
      this.write({ ...message, id: rewritten });
      return;
    }
    if (message.method === undefined && isId(message.id)) {
      // The answer to one of agent86's requests.
      if (!this.asked.delete(message.id)) return;
    }
    this.write(message);
  }

  private write(message: Message): void {
    if (!this.child.stdin.write(`${JSON.stringify(message)}\n`)) {
      const socket = this.socket;
      socket?.pause();
      this.child.stdin.once("drain", () => socket?.resume());
    }
  }

  private fromAgent(line: string): void {
    this.lastActivity = this.now();
    let message: Message;
    try {
      message = JSON.parse(line) as Message;
    } catch {
      this.note("agent86 wrote a line that is not JSON; dropped");
      return;
    }
    const { id, method } = message;

    if (method === undefined && typeof id === "string" && this.inflight.has(id)) {
      // A reply: restore the browser's id, or drop it if its socket has gone.
      const request = this.inflight.get(id)!;
      this.inflight.delete(id);
      if (request.generation !== this.generation || !this.socket) return;
      this.send(JSON.stringify({ ...message, id: request.id }));
      return;
    }

    if (typeof method === "string" && isId(id)) {
      // A request from agent86, such as a permission request.
      if (!this.socket) {
        this.declineRequest(id, method);
        return;
      }
      this.asked.set(id, method);
    }
    this.send(line);
  }

  /** Answer one of agent86's requests on the browser's behalf, declining it. */
  private declineRequest(id: JsonRpcId, method: string): void {
    const reply =
      method === "session/request_permission"
        ? { jsonrpc: "2.0", id, result: { outcome: { outcome: "cancelled" } } }
        : {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: "No browser is connected to answer." },
          };
    this.write(reply);
  }

  private stderrFrame(line: string): string {
    return JSON.stringify({ jsonrpc: "2.0", method: STDERR_METHOD, params: { line } });
  }

  private note(line: string): void {
    this.stderr.push(line);
    if (this.stderr.length > STDERR_LINES) this.stderr.shift();
    this.options.log?.(line);
    this.send(this.stderrFrame(line));
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newline: number;
    while ((newline = this.stdoutBuffer.indexOf("\n")) >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.fromAgent(line);
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
