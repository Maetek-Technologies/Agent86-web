// The open threads: each is one agent86 session over its own bridge connection (one agent86
// process per thread, docs/ARCHITECTURE.md §3.3). Framework-free; React subscribes to it.
import {
  Agent86Client,
  TurnRunningError,
  webSocketStream,
  type AgentSession,
} from "@agent86-web/acp-client";
import { acpUrl } from "../api.ts";
import { newThreadId } from "../token.ts";
import { KEYS, load, save } from "./storage.ts";

export interface ThreadMeta {
  id: string;
  workspace: string;
  /** The agent86 session, once there is one; reopened with `session/load` after a reload. */
  sessionId?: string;
  title: string;
}

export type ThreadPhase =
  | "connecting"
  | "starting"
  | "loading"
  | "waiting-turn"
  | "ready"
  | "reconnecting"
  | "taken"
  | "failed";

export interface ThreadSnapshot {
  meta: ThreadMeta;
  phase: ThreadPhase;
  error?: string;
  /** "starting" when agent86 could not start a session (usually a missing model key). */
  failedAt?: "starting" | "loading" | "connecting";
  client?: Agent86Client;
  session?: AgentSession;
}

/** Close codes the bridge uses (packages/bridge/src/agent-process.ts and threads.ts). */
const REPLACED = 4000;
const TOO_MANY = 1013;
const RECONNECT_MAX_MS = 10_000;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener(
      "close",
      (event) =>
        reject(
          new Error(
            event.reason ||
              "The bridge refused the connection. If agent86-web was restarted, open its new link.",
          ),
        ),
      { once: true },
    );
  });
}

export class ThreadHandle {
  private snapshot: ThreadSnapshot;
  private socket: WebSocket | undefined;
  private closedByUs = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    meta: ThreadMeta,
    private readonly changed: () => void,
  ) {
    this.snapshot = { meta, phase: "connecting" };
  }

  get id(): string {
    return this.snapshot.meta.id;
  }

  getSnapshot(): ThreadSnapshot {
    return this.snapshot;
  }

  private update(next: Partial<ThreadSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.changed();
  }

  /** Rename the thread (its first prompt names it). */
  setTitle(title: string): void {
    if (title && title !== this.snapshot.meta.title) {
      this.update({ meta: { ...this.snapshot.meta, title } });
    }
  }

  /**
   * Connect, then start or reopen the session. `fresh` asks the bridge for a new agent86 process
   * (after trusting the project, so its settings take effect).
   */
  async connect(fresh = false): Promise<void> {
    clearTimeout(this.retryTimer);
    this.closedByUs = false;
    this.snapshot.client?.close();
    const meta = this.snapshot.meta;
    this.update({
      phase: this.attempt > 0 ? "reconnecting" : "connecting",
      error: undefined,
      failedAt: undefined,
    });
    let socket: WebSocket;
    try {
      socket = await openSocket(acpUrl(meta.id, meta.workspace, fresh));
    } catch (error) {
      return this.failOrRetry(message(error), "connecting");
    }
    this.socket = socket;
    socket.addEventListener("close", (event) => this.onClose(socket, event));
    try {
      const client = await Agent86Client.connect(webSocketStream(socket));
      if (!client.compatibility.ok) {
        this.update({ client, phase: "failed", error: client.compatibility.problems.join(" ") });
        return;
      }
      this.update({ client });
      let session: AgentSession;
      if (meta.sessionId) {
        this.update({ phase: "loading" });
        session = await client.loadSession(meta.sessionId, meta.workspace, {
          waitForTurn: true,
          onWaiting: () => this.update({ phase: "waiting-turn" }),
        });
      } else {
        this.update({ phase: "starting" });
        try {
          session = await client.newSession(meta.workspace);
        } catch (error) {
          this.update({ phase: "failed", error: message(error), failedAt: "starting" });
          return;
        }
      }
      this.attempt = 0;
      this.update({
        session,
        phase: "ready",
        meta: { ...this.snapshot.meta, sessionId: session.id },
      });
    } catch (error) {
      if (error instanceof TurnRunningError) return this.failOrRetry(message(error), "loading");
      if (this.socket !== socket) return;
      this.update({ phase: "failed", error: message(error), failedAt: "loading" });
    }
  }

  private onClose(socket: WebSocket, event: CloseEvent): void {
    if (this.socket !== socket || this.closedByUs) return;
    this.socket = undefined;
    if (event.code === REPLACED) {
      this.update({ phase: "taken", error: "This thread was opened in another tab or window." });
      return;
    }
    if (event.code === TOO_MANY) {
      this.update({ phase: "failed", error: event.reason, failedAt: "connecting" });
      return;
    }
    this.failOrRetry(event.reason || "The connection to the bridge closed.", "connecting");
  }

  /** Try again with backoff, unless the bridge is gone for good (the page then says so). */
  private failOrRetry(error: string, failedAt: ThreadSnapshot["failedAt"]): void {
    if (this.closedByUs) return;
    this.attempt++;
    if (this.attempt > 8) {
      this.update({ phase: "failed", error, ...(failedAt ? { failedAt } : {}) });
      return;
    }
    this.update({ phase: "reconnecting", error });
    const delay = Math.min(RECONNECT_MAX_MS, 500 * 2 ** (this.attempt - 1));
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }

  /** Disconnect. The bridge keeps agent86 running until its idle timeout. */
  close(): void {
    this.closedByUs = true;
    clearTimeout(this.retryTimer);
    this.snapshot.client?.close();
    this.socket?.close(1000, "thread closed");
    this.socket = undefined;
  }
}

export interface ManagerSnapshot {
  threads: ThreadSnapshot[];
  activeId: string | undefined;
}

/** All open threads, remembered across reloads. */
export class ThreadManager {
  private handles: ThreadHandle[] = [];
  private activeId: string | undefined;
  private snapshot: ManagerSnapshot = { threads: [], activeId: undefined };
  private readonly listeners = new Set<() => void>();

  /** Reopen the threads this browser had open. */
  restore(): void {
    const saved = load<{ threads: ThreadMeta[]; activeId?: string }>(KEYS.threads, { threads: [] });
    for (const meta of saved.threads) this.add(meta, false);
    this.activeId =
      saved.activeId && this.handles.some((h) => h.id === saved.activeId)
        ? saved.activeId
        : this.handles[0]?.id;
    this.emit();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): ManagerSnapshot => this.snapshot;

  handle(id: string): ThreadHandle | undefined {
    return this.handles.find((h) => h.id === id);
  }

  /** A new thread with a new session in `workspace`. */
  openNew(workspace: string): string {
    const id = newThreadId();
    this.add({ id, workspace, title: "New thread" }, true);
    return id;
  }

  /** Open a saved session, or switch to its tab if it is already open. */
  openSession(workspace: string, sessionId: string, title: string): string {
    const open = this.handles.find((h) => h.getSnapshot().meta.sessionId === sessionId);
    if (open) {
      this.activate(open.id);
      return open.id;
    }
    const id = newThreadId();
    this.add({ id, workspace, sessionId, title }, true);
    return id;
  }

  activate(id: string): void {
    if (this.activeId === id) return;
    this.activeId = id;
    this.emit();
  }

  closeThread(id: string): void {
    const index = this.handles.findIndex((h) => h.id === id);
    if (index < 0) return;
    this.handles[index]!.close();
    this.handles.splice(index, 1);
    if (this.activeId === id) this.activeId = (this.handles[index] ?? this.handles[index - 1])?.id;
    this.emit();
  }

  closeAll(): void {
    for (const handle of this.handles) handle.close();
  }

  private add(meta: ThreadMeta, activate: boolean): void {
    const handle = new ThreadHandle(meta, () => this.emit());
    this.handles.push(handle);
    if (activate) this.activeId = handle.id;
    this.emit();
    void handle.connect();
  }

  private emit(): void {
    const threads = this.handles.map((h) => h.getSnapshot());
    this.snapshot = { threads, activeId: this.activeId };
    save(KEYS.threads, { threads: threads.map((t) => t.meta), activeId: this.activeId });
    for (const listener of this.listeners) listener();
  }
}
