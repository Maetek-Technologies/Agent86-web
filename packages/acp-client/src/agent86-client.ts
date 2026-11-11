// One ACP connection to agent86, and the sessions on it.
import {
  client,
  methods,
  PROTOCOL_VERSION,
  type ClientConnection,
  type InitializeResponse,
  type RequestPermissionRequest,
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
  addPermission,
  applyUpdate,
  endTurn,
  failTurn,
  initialState,
  markClosed,
  requestCancel,
  resolvePermission,
  startTurn,
  type PermissionDecision,
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
  /** How to answer each pending permission request, by its local id. */
  private readonly answers = new Map<number, (response: RequestPermissionResponse) => void>();

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
      this.cancelPermissions();
      this.set(endTurn(this.state, result.stopReason, this.now()));
    } catch (error) {
      this.cancelPermissions();
      if (this.state.closed) return;
      this.set(failTurn(this.state, errorMessage(error), this.now()));
    }
  }

  /**
   * Ask agent86 to stop the turn at its next safe point. The prompt then ends as `cancelled`.
   * Any permission request still open is answered `cancelled`, as ACP requires.
   */
  async cancel(): Promise<void> {
    if (!this.state.turn.running || this.state.turn.cancelRequested) return;
    this.set(requestCancel(this.state));
    this.cancelPermissions();
    await this.connection.agent.notify(methods.agent.session.cancel, { sessionId: this.id });
  }

  /**
   * Answer a permission request with one of its options. Only an `allow_*` option allows the
   * call; agent86 declines on anything else.
   */
  respond(permissionId: number, optionId: string): void {
    const request = this.state.permissions.find((p) => p.id === permissionId);
    const answer = this.answers.get(permissionId);
    const option = request?.options.find((o) => o.optionId === optionId);
    if (!request || !answer || !option) return;
    this.answers.delete(permissionId);
    const decision: PermissionDecision = option.kind.startsWith("allow") ? "allowed" : "rejected";
    this.set(resolvePermission(this.state, permissionId, decision));
    answer({ outcome: { outcome: "selected", optionId } });
  }

  /** Decline a permission request: its reject option if it has one, else `cancelled`. */
  reject(permissionId: number): void {
    const request = this.state.permissions.find((p) => p.id === permissionId);
    if (!request) return;
    const option =
      request.options.find((o) => o.kind === "reject_once") ??
      request.options.find((o) => o.kind.startsWith("reject"));
    if (option) {
      this.respond(permissionId, option.optionId);
      return;
    }
    this.answers.get(permissionId)?.({ outcome: { outcome: "cancelled" } });
    this.answers.delete(permissionId);
    this.set(resolvePermission(this.state, permissionId, "cancelled"));
  }

  private cancelPermissions(): void {
    for (const request of this.state.permissions) {
      this.answers.get(request.id)?.({ outcome: { outcome: "cancelled" } });
      this.answers.delete(request.id);
      this.set(resolvePermission(this.state, request.id, "cancelled"));
    }
  }

  /** @internal Called by the client for this session's updates. */
  handleUpdate(notification: SessionNotification): void {
    this.set(applyUpdate(this.state, notification.update, this.now()));
  }

  /**
   * @internal Called by the client for this session's permission requests. Resolves when the
   * user answers, the turn is cancelled, or the connection closes.
   */
  requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    if (this.state.turn.cancelRequested || this.state.closed) {
      return Promise.resolve({ outcome: { outcome: "cancelled" } });
    }
    const { toolCall } = params;
    const text = (toolCall.content ?? [])
      .map((item) =>
        item.type === "content" && item.content.type === "text" ? item.content.text : "",
      )
      .filter(Boolean)
      .join("\n");
    const { state, id } = addPermission(
      this.state,
      {
        toolCallId: toolCall.toolCallId,
        title: toolCall.title ?? toolCall.toolCallId,
        ...(toolCall.kind ? { toolKind: toolCall.kind } : {}),
        ...(toolCall.rawInput !== undefined ? { rawInput: toolCall.rawInput } : {}),
        text,
        options: params.options,
      },
      this.now(),
    );
    return new Promise((resolve) => {
      this.answers.set(id, resolve);
      this.set(state);
    });
  }

  /** @internal */
  markClosed(reason: string): void {
    this.cancelPermissions();
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
        return session?.requestPermission(params) ?? { outcome: { outcome: "cancelled" as const } };
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
