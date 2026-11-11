// The live agent86 processes, one per thread (docs/ARCHITECTURE.md §3.3).
//
// A thread's process survives its socket, so a reload reattaches to it. A process with no socket
// and no running turn is stopped after the idle timeout. At most `maxAgents` run at once; when a
// new thread needs room, the least recently used idle, detached process is stopped first.
import type { WebSocket } from "ws";
import type { AgentProcess } from "./agent-process.ts";

export interface ThreadRegistryOptions {
  maxAgents: number;
  idleTimeoutMs: number;
  /** Start agent86 for a thread in `workspace`. */
  spawn: (thread: string, workspace: string) => AgentProcess;
  log?: (line: string) => void;
  now?: () => number;
}

export type AttachResult = { ok: true; reused: boolean } | { ok: false; reason: string };

export class ThreadRegistry {
  private readonly threads = new Map<string, AgentProcess>();
  private readonly now: () => number;
  private readonly sweeper: NodeJS.Timeout;

  constructor(private readonly options: ThreadRegistryOptions) {
    this.now = options.now ?? Date.now;
    this.sweeper = setInterval(() => this.sweep(), Math.min(30_000, options.idleTimeoutMs));
    this.sweeper.unref();
  }

  get size(): number {
    return this.threads.size;
  }

  /**
   * Attach `socket` to the thread's process, starting one if there is none, if it runs in another
   * workspace, or if `fresh` asks for a restart (after the project was trusted, for example).
   */
  attach(thread: string, workspace: string, socket: WebSocket, fresh = false): AttachResult {
    const existing = this.threads.get(thread);
    if (existing && existing.alive && existing.workspace === workspace && !fresh) {
      existing.attach(socket);
      return { ok: true, reused: true };
    }
    if (existing) this.stop(thread, existing, "agent86 restarted for this thread");

    if (this.threads.size >= this.options.maxAgents && !this.evictOne()) {
      return {
        ok: false,
        reason: `${this.options.maxAgents} agents are already running, all busy or open in a tab. Close a thread, or start agent86-web with a higher --max-agents.`,
      };
    }

    const agent = this.options.spawn(thread, workspace);
    this.threads.set(thread, agent);
    void agent.exited.then(() => {
      if (this.threads.get(thread) === agent) this.threads.delete(thread);
    });
    agent.attach(socket);
    return { ok: true, reused: false };
  }

  /** Stop idle, detached processes that have been quiet for longer than the timeout. */
  sweep(): void {
    const cutoff = this.now() - this.options.idleTimeoutMs;
    for (const [thread, agent] of this.threads) {
      if (!agent.attached && !agent.busy && agent.lastActivity <= cutoff) {
        this.options.log?.(`thread ${thread}: idle, stopping agent86`);
        this.stop(thread, agent);
      }
    }
  }

  stopAll(): Promise<unknown> {
    clearInterval(this.sweeper);
    const agents = [...this.threads.values()];
    for (const [thread, agent] of this.threads) this.stop(thread, agent);
    return Promise.all(agents.map((agent) => agent.exited));
  }

  private stop(thread: string, agent: AgentProcess, reason?: string): void {
    this.threads.delete(thread);
    agent.stop(reason);
  }

  /** Make room by stopping the least recently used idle, detached process. */
  private evictOne(): boolean {
    let oldest: [string, AgentProcess] | undefined;
    for (const entry of this.threads) {
      const agent = entry[1];
      if (agent.attached || agent.busy) continue;
      if (!oldest || agent.lastActivity < oldest[1].lastActivity) oldest = entry;
    }
    if (!oldest) return false;
    this.options.log?.(`thread ${oldest[0]}: stopping agent86 to make room`);
    this.stop(oldest[0], oldest[1]);
    return true;
  }
}
