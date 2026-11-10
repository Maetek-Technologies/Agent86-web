// One ACP connection to agent86, and the sessions on it.
import {
  client,
  methods,
  PROTOCOL_VERSION,
  type ClientConnection,
  type InitializeResponse,
  type RequestPermissionResponse,
  type SessionNotification,
  type Stream,
} from "@agentclientprotocol/sdk";
import {
  CLIENT_CAPABILITIES,
  CLIENT_INFO,
  checkCompatibility,
  type Compatibility,
} from "./handshake.ts";
import {
  applyUpdate,
  endTurn,
  failTurn,
  initialState,
  markClosed,
  requestCancel,
  startTurn,
  type SessionState,
} from "./session-state.ts";

export type Clock = () => number;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/** A session on an agent86 connection: its transcript, plus prompt and cancel. */
export class AgentSession {
  private state: SessionState;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly connection: ClientConnection,
    sessionId: string,
    cwd: string,
    configOptions: SessionState["configOptions"],
    private readonly now: Clock,
  ) {
    this.state = initialState(sessionId, cwd, configOptions);
  }

  get id(): string {
    return this.state.sessionId;
  }

  /** The current state. A new object after every change, so it works with `useSyncExternalStore`. */
  readonly getState = (): SessionState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: SessionState): void {
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  /** Send a prompt and resolve when the turn ends, however it ends. */
  async prompt(text: string): Promise<void> {
    if (this.state.turn.running) throw new Error("A turn is already running.");
    if (this.state.closed) throw new Error("The connection to agent86 is closed.");
    this.set(startTurn(this.state, text, this.now()));
    try {
      const result = await this.connection.agent.request(methods.agent.session.prompt, {
        sessionId: this.id,
        prompt: [{ type: "text", text }],
      });
      this.set(endTurn(this.state, result.stopReason, this.now()));
    } catch (error) {
      if (this.state.closed) return;
      this.set(failTurn(this.state, errorMessage(error), this.now()));
    }
  }

  /** Ask agent86 to stop the turn at its next safe point. The prompt then ends as `cancelled`. */
  async cancel(): Promise<void> {
    if (!this.state.turn.running || this.state.turn.cancelRequested) return;
    this.set(requestCancel(this.state));
    await this.connection.agent.notify(methods.agent.session.cancel, { sessionId: this.id });
  }

  /** @internal Called by the client for this session's updates. */
  handleUpdate(notification: SessionNotification): void {
    this.set(applyUpdate(this.state, notification.update, this.now()));
  }

  /**
   * @internal Called by the client for this session's permission requests. The approval panel
   * arrives in M3; until then every request is declined.
   */
  requestPermission(): RequestPermissionResponse {
    return { outcome: { outcome: "cancelled" } };
  }

  /** @internal */
  markClosed(reason: string): void {
    this.set(markClosed(this.state, reason, this.now()));
  }
}

export interface Agent86ClientOptions {
  now?: Clock;
}

/** An initialized ACP connection to agent86. */
export class Agent86Client {
  private readonly sessions = new Map<string, AgentSession>();

  private constructor(
    readonly connection: ClientConnection,
    readonly init: InitializeResponse,
    readonly compatibility: Compatibility,
    private readonly now: Clock,
  ) {
    void connection.closed.then(
      () => this.closeAll("The connection to agent86 closed."),
      (error: unknown) => this.closeAll(errorMessage(error)),
    );
  }

  /** Open an ACP connection over `stream` and run `initialize`. */
  static async connect(stream: Stream, options: Agent86ClientOptions = {}): Promise<Agent86Client> {
    const now = options.now ?? Date.now;
    let self: Agent86Client | undefined;
    const app = client({ name: CLIENT_INFO.name })
      .onNotification(methods.client.session.update, ({ params }) => {
        self?.sessions.get(params.sessionId)?.handleUpdate(params);
      })
      .onRequest(methods.client.session.requestPermission, ({ params }) => {
        const session = self?.sessions.get(params.sessionId);
        return session?.requestPermission() ?? { outcome: { outcome: "cancelled" } };
      });
    const connection = app.connect(stream);
    try {
      const init = await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: CLIENT_CAPABILITIES,
        clientInfo: CLIENT_INFO,
      });
      self = new Agent86Client(connection, init, checkCompatibility(init), now);
      return self;
    } catch (error) {
      connection.close(error);
      throw error;
    }
  }

  /** Start a new agent86 session in `cwd` (the bridge requires the thread's workspace). */
  async newSession(cwd: string): Promise<AgentSession> {
    const result = await this.connection.agent.request(methods.agent.session.new, {
      cwd,
      mcpServers: [],
    });
    const session = new AgentSession(
      this.connection,
      result.sessionId,
      cwd,
      result.configOptions ?? [],
      this.now,
    );
    this.sessions.set(session.id, session);
    return session;
  }

  close(): void {
    this.connection.close();
  }

  /** The connection's lifetime, for callers that want to know when it ends. */
  get closed(): Promise<void> {
    return this.connection.closed;
  }

  private closeAll(reason: string): void {
    for (const session of this.sessions.values()) session.markClosed(reason);
  }
}
