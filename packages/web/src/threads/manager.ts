// The open threads: each is one agent86 session over its own bridge connection (one agent86
// process per thread, docs/ARCHITECTURE.md §3.3). Framework-free; React subscribes to it.
import {
  Agent86Client,
  TurnRunningError,
  webSocketStream,
  type AgentSession,
  type SessionState,
} from "@agent86-web/acp-client";
import { acpUrl, saveDefaultMode } from "../api.ts";
import { newThreadId } from "../token.ts";
import { SettingsKeeper, type ThreadSettings } from "./settings.ts";
import { cleanTitle, KEYS, load, localTitles, save } from "./storage.ts";

export type { ThreadSettings } from "./settings.ts";

export interface ThreadMeta {
  id: string;
  workspace: string;
  /** The agent86 session, once there is one; reopened with `session/load` after a reload. */
  sessionId?: string;
  title: string;
  /** The user named the thread, so its first prompt does not. */
  renamed?: boolean;
  /**
   * The thread's approval mode and model, as last seen. agent86 keeps neither with the session, so
   * they are set again whenever the session is reopened (a reload, an idle restart, a new bridge).
   */
  settings?: ThreadSettings;
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
/** agent86's process ended; the bridge starts a new one when the thread reconnects. */
const AGENT_EXITED = 1011;
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

/** A line for the logs drawer, from agent86-web itself rather than agent86. */
function event(text: string): string {
  const time = new Date().toLocaleTimeString([], { hour12: false });
  return `[agent86-web] ${time} ${text}`;
}

const MAX_EVENTS = 200;

export class ThreadHandle {
  private snapshot: ThreadSnapshot;
  private socket: WebSocket | undefined;
  private closedByUs = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** agent86-web's own notes for this thread, replayed into each new connection's logs. */
  private readonly events: string[] = [];
  /** Stops watching the current session. */
  private unwatch: (() => void) | undefined;
  /** A name being sent to agent86 with `/rename`, or one agent86 refused on this connection. */
  private renaming = false;
  private renameRefused: string | undefined;
  /** Keeps the current session's mode and model in the thread. */
  private keeper: SettingsKeeper | undefined;
  /** The last connection closed because agent86's process ended (see `connect`). */
  private agentExited = false;
  /** Another tab took the thread over, so this tab's transcript may be out of date. */
  private copyStale = false;
  /** Counts connection attempts, so only the latest goes on once its socket opens. */
  private connecting = 0;

  constructor(
    meta: ThreadMeta,
    private readonly changed: () => void,
    /** The approval mode new threads start in, if the user chose one. */
    private readonly defaultMode: () => string | undefined = () => undefined,
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

  private setMeta(next: Partial<ThreadMeta>): void {
    this.update({ meta: { ...this.snapshot.meta, ...next } });
  }

  /** Add a line to the thread's logs drawer. */
  private log(text: string): void {
    const line = event(text);
    this.events.push(line);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    this.snapshot.client?.note(line);
  }

  /** Name the thread after its first prompt, unless the user has named it. */
  setTitle(title: string): void {
    const meta = this.snapshot.meta;
    if (title && !meta.renamed && title !== meta.title) this.setMeta({ title });
  }

  /**
   * The user renamed the thread. The name is kept in this browser at once, and given to agent86
   * with `/rename` when it offers the command and the session is idle.
   */
  rename(text: string): void {
    const title = cleanTitle(text);
    if (!title) return;
    this.setMeta({ title, renamed: true });
    const sessionId = this.snapshot.meta.sessionId;
    if (sessionId) {
      this.renameRefused = undefined;
      localTitles.set(sessionId, title);
      this.syncTitle();
    }
  }

  /** Send a name agent86 does not have yet, if it can take it now. */
  private syncTitle(): void {
    const session = this.snapshot.session;
    const sessionId = this.snapshot.meta.sessionId;
    if (!session || !sessionId || this.renaming) return;
    const title = localTitles.pending(sessionId);
    if (!title || title === this.renameRefused) return;
    const state = session.getState();
    if (state.turn.running || state.closed || !session.hasCommand("rename")) return;
    this.renaming = true;
    session
      .command(`/rename ${title}`)
      .then(
        () => {
          localTitles.synced(sessionId, title);
          this.log(`renamed the session in Agent 86: ${title}`);
        },
        (error: unknown) => {
          this.renameRefused = title;
          this.log(`Agent 86 did not take the name (kept in this browser): ${message(error)}`);
        },
      )
      .finally(() => {
        this.renaming = false;
        this.syncTitle();
      });
  }

  /** Follow a ready session: names agent86 announces, renames waiting for an idle moment. */
  private watch(session: AgentSession): void {
    this.unwatch?.();
    let announced = session.getState().title;
    const check = () => {
      const state = session.getState();
      if (state.title && state.title !== announced) {
        announced = state.title;
        const sessionId = this.snapshot.meta.sessionId;
        if (!sessionId || !localTitles.pending(sessionId)) this.setMeta({ title: state.title });
      }
      this.syncTitle();
    };
    this.unwatch = session.subscribe(check);
    check();
  }

  /**
   * Put the thread's mode and model back on the session agent86 just opened, which always starts
   * from agent86's defaults. A thread with no remembered mode starts in the default mode. Resolves
   * once the mode is set, so no turn runs under the wrong approvals.
   */
  private async restoreSettings(session: AgentSession): Promise<void> {
    this.keeper?.stop();
    const fallback = this.defaultMode();
    const wanted: ThreadSettings = {
      ...(fallback ? { mode: fallback } : {}),
      ...this.snapshot.meta.settings,
    };
    const remembered = !!this.snapshot.meta.settings?.mode;
    const keeper = new SettingsKeeper(session, (settings) => this.setMeta({ settings }));
    this.keeper = keeper;
    const changed = await keeper.restore(wanted);
    if (changed.length)
      this.log(
        `set ${changed.join(" and ")} (${remembered ? "as this thread had it" : "the default for new threads"})`,
      );
  }

  private stopKeeping(): void {
    this.keeper?.stop();
    this.keeper = undefined;
  }

  /**
   * Connect, then start or reopen the session. `fresh` asks the bridge for a new agent86 process
   * (after trusting the project, so its settings take effect).
   */
  async connect(fresh = false): Promise<void> {
    clearTimeout(this.retryTimer);
    this.closedByUs = false;
    // The transcript this tab still has, if any, and how its connection ended.
    const previous = this.snapshot.session?.getState();
    this.unwatch?.();
    this.unwatch = undefined;
    this.stopKeeping();
    this.snapshot.client?.close();
    const meta = this.snapshot.meta;
    this.update({
      phase: this.attempt > 0 ? "reconnecting" : "connecting",
      error: undefined,
      failedAt: undefined,
    });
    if (fresh) this.log("restarting Agent 86 with this project's settings");
    else this.log(this.attempt > 0 ? `reconnecting (attempt ${this.attempt})` : "connecting");
    // A newer attempt (reconnectNow, while this one waited for its socket) supersedes this one.
    const attempt = ++this.connecting;
    let socket: WebSocket;
    try {
      socket = await openSocket(acpUrl(meta.id, meta.workspace, fresh));
    } catch (error) {
      if (attempt !== this.connecting) return;
      return this.failOrRetry(message(error), "connecting");
    }
    if (attempt !== this.connecting || this.closedByUs) {
      socket.close(1000, "superseded");
      return;
    }
    this.socket = socket;
    socket.addEventListener("close", (event) => this.onClose(socket, event));
    try {
      const client = await Agent86Client.connect(webSocketStream(socket));
      for (const line of this.events) client.note(line);
      if (!client.compatibility.ok) {
        this.update({ client, phase: "failed", error: client.compatibility.problems.join(" ") });
        this.log(`Agent 86 is not compatible: ${client.compatibility.problems.join(" ")}`);
        return;
      }
      this.update({ client });
      this.log(`connected to Agent 86 ${client.init.agentInfo?.version ?? "(unknown version)"}`);
      let session: AgentSession;
      if (meta.sessionId) {
        this.update({ phase: "loading" });
        session = await this.reopen(client, meta.sessionId, meta.workspace, previous);
      } else {
        this.update({ phase: "starting" });
        try {
          session = await client.newSession(meta.workspace);
        } catch (error) {
          this.update({ phase: "failed", error: message(error), failedAt: "starting" });
          this.log(`Agent 86 could not start a session: ${message(error)}`);
          return;
        }
        this.log(`started session ${session.id}`);
      }
      if (this.socket !== socket) return;
      this.agentExited = false;
      this.copyStale = false;
      this.setMeta({ sessionId: session.id });
      await this.restoreSettings(session);
      if (this.socket !== socket) return;
      this.attempt = 0;
      const local = localTitles.get(session.id);
      const renamed = this.snapshot.meta.renamed;
      // A name given before the session existed, or from the sessions list, waits for agent86.
      if (renamed && !local && !meta.sessionId)
        localTitles.set(session.id, this.snapshot.meta.title);
      this.update({
        session,
        phase: "ready",
        meta: {
          ...this.snapshot.meta,
          sessionId: session.id,
          ...(local ? { title: local, renamed: true } : {}),
        },
      });
      this.watch(session);
    } catch (error) {
      if (error instanceof TurnRunningError) return this.failOrRetry(message(error), "loading");
      if (this.socket !== socket) return;
      this.update({ phase: "failed", error: message(error), failedAt: "loading" });
      this.log(`could not open the session: ${message(error)}`);
    }
  }

  /**
   * Reopen the thread's saved session. With a transcript in this tab that is still complete, and
   * an agent86 that offers `session/resume` (1.0.21), resume it: nothing is replayed and the tab
   * carries on from what it shows. Otherwise load it, which replays the history. The copy is
   * incomplete when a turn was running as the connection dropped while agent86 lived on (it went
   * on without this tab), or another tab took the thread over.
   *
   * When agent86's process ended partway through a turn, 1.0.21 kept the steps it finished: the
   * turn is shown as interrupted, with a way to continue.
   */
  private async reopen(
    client: Agent86Client,
    sessionId: string,
    workspace: string,
    previous: SessionState | undefined,
  ): Promise<AgentSession> {
    const options = {
      waitForTurn: true,
      onWaiting: () => this.update({ phase: "waiting-turn" as const }),
    };
    const cut = !!previous && (previous.turn.running || !!previous.closedDuringTurn);
    const startedAt = previous?.turn.startedAt ?? previous?.closedDuringTurn?.startedAt;
    const interrupted = cut && this.agentExited;
    const copy =
      previous?.sessionId === sessionId && !this.copyStale && (!cut || interrupted)
        ? previous
        : undefined;
    let session: AgentSession | undefined;
    if (copy && client.features.resume) {
      try {
        session = await client.resumeSession(sessionId, workspace, copy, options);
        this.log(`resumed session ${session.id} (nothing replayed)`);
      } catch (error) {
        if (error instanceof TurnRunningError) throw error;
        this.log(`could not resume the session (${message(error)}); reopening it instead`);
      }
    }
    if (!session) {
      session = await client.loadSession(sessionId, workspace, options);
      this.log(`reopened session ${session.id}`);
    }
    if (interrupted && client.features.resume) {
      session.markInterrupted(startedAt);
      this.log("Agent 86 stopped partway through a turn; the steps it finished are kept");
    }
    return session;
  }

  private onClose(socket: WebSocket, event: CloseEvent): void {
    if (this.socket !== socket || this.closedByUs) return;
    this.socket = undefined;
    this.log(`connection closed (${event.code}${event.reason ? `: ${event.reason}` : ""})`);
    if (event.code === AGENT_EXITED) this.agentExited = true;
    if (event.code === REPLACED) {
      this.copyStale = true;
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
      this.log(`gave up: ${error}`);
      return;
    }
    this.update({ phase: "reconnecting", error });
    const delay = Math.min(RECONNECT_MAX_MS, 500 * 2 ** (this.attempt - 1));
    this.log(`${error} Trying again in ${(delay / 1000).toFixed(1)} s.`);
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }

  /**
   * Reconnect now rather than at the next retry (agent86-web was restarted and this tab signed in
   * again). A thread that is connected, or was taken over by another tab, is left alone.
   */
  reconnectNow(): void {
    const { phase } = this.snapshot;
    if (phase === "ready" || phase === "taken" || this.closedByUs) return;
    this.attempt = Math.max(this.attempt, 1);
    void this.connect();
  }

  /** Disconnect. The bridge keeps agent86 running until its idle timeout. */
  close(): void {
    this.closedByUs = true;
    clearTimeout(this.retryTimer);
    this.unwatch?.();
    this.unwatch = undefined;
    this.stopKeeping();
    this.snapshot.client?.close();
    this.socket?.close(1000, "thread closed");
    this.socket = undefined;
  }
}

export interface ManagerSnapshot {
  threads: ThreadSnapshot[];
  activeId: string | undefined;
  /** The approval mode new threads start in; undefined leaves it to agent86. */
  defaultMode: string | undefined;
}

/** All open threads, remembered across reloads. */
export class ThreadManager {
  private handles: ThreadHandle[] = [];
  private activeId: string | undefined;
  private snapshot: ManagerSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(
    private defaultMode: string | undefined = undefined,
    /** Saves the default with the bridge (replaced in tests). */
    private readonly saveDefault: (mode: string | null) => Promise<string | null> = saveDefaultMode,
  ) {
    this.snapshot = { threads: [], activeId: undefined, defaultMode };
  }

  /** Start new threads in `mode` from now on, in every browser (`null`: agent86's default). */
  async setDefaultMode(mode: string | null): Promise<void> {
    const saved = await this.saveDefault(mode);
    this.defaultMode = saved ?? undefined;
    this.emit();
  }

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
    const local = localTitles.get(sessionId);
    this.add(
      { id, workspace, sessionId, title: local ?? title, ...(local ? { renamed: true } : {}) },
      true,
    );
    return id;
  }

  /** Rename an open thread. */
  rename(id: string, title: string): void {
    this.handle(id)?.rename(title);
  }

  /**
   * Rename a saved session from the sessions list: through its tab if it is open, otherwise kept
   * here and given to agent86 the next time the session is opened.
   */
  renameSession(sessionId: string, title: string): void {
    const open = this.handles.find((h) => h.getSnapshot().meta.sessionId === sessionId);
    if (open) {
      open.rename(title);
      return;
    }
    const clean = cleanTitle(title);
    if (clean) localTitles.set(sessionId, clean);
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

  /** Reconnect every thread that is not connected, now (see `ThreadHandle.reconnectNow`). */
  reconnectAll(): void {
    for (const handle of this.handles) handle.reconnectNow();
  }

  private add(meta: ThreadMeta, activate: boolean): void {
    const handle = new ThreadHandle(
      meta,
      () => this.emit(),
      () => this.defaultMode,
    );
    this.handles.push(handle);
    if (activate) this.activeId = handle.id;
    this.emit();
    void handle.connect();
  }

  private emit(): void {
    const threads = this.handles.map((h) => h.getSnapshot());
    this.snapshot = { threads, activeId: this.activeId, defaultMode: this.defaultMode };
    save(KEYS.threads, { threads: threads.map((t) => t.meta), activeId: this.activeId });
    for (const listener of this.listeners) listener();
  }
}
