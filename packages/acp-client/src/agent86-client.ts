// One ACP connection to agent86, and the sessions on it.
import {
  client,
  methods,
  PROTOCOL_VERSION,
  type ClientConnection,
  type ContentBlock,
  type InitializeResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type ResumeSessionResponse,
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
  advertisesResume,
  advertisesState,
  parseAsker,
  parseEventParams,
  STATE_EVENT_METHOD,
  type Agent86Event,
} from "./agent86-events.ts";
import {
  advertisesMemory,
  advertisesSecrets,
  MEMORY_FORGET_METHOD,
  MEMORY_LIST_METHOD,
  MEMORY_PIN_METHOD,
  parseMemoryEntry,
  parseMemoryPage,
  parseSecretForget,
  parseSecretList,
  parseSecretRequest,
  parseSecretSet,
  SECRET_FORGET_METHOD,
  SECRET_LIST_METHOD,
  SECRET_REQUEST_METHOD,
  SECRET_SET_METHOD,
  type MemoryEntry,
  type MemoryKind,
  type MemoryPage,
  type MemoryQuery,
  type SecretAnswer,
  type SecretForgetResult,
  type SecretList,
  type SecretRequest,
  type SecretSetResult,
} from "./agent86-extensions.ts";
import {
  addNotice,
  addSecretRequest,
  applyEvent,
  addPermission,
  applyUpdate,
  continueState,
  endTurn,
  failTurn,
  initialState,
  interruptTurn,
  markClosed,
  requestCancel,
  resolvePermission,
  resolveSecretRequest,
  startTurn,
  toolDiffs,
  toolLocations,
  type PermissionDecision,
  type SessionState,
} from "./session-state.ts";

export type Clock = () => number;

/** The bridge's notification carrying a line of agent86's stderr (see packages/bridge). */
export const STDERR_METHOD = "_agent86web/stderr";

/** agent86's words when a project file's riskier settings were left out for lack of trust. */
const UNTRUSTED = /^project config: ignored (\d+) settings? that needs? trust \((.*?)\)\./;

export interface Untrusted {
  count: number;
  /** The first few keys agent86 names ("mcp.servers.x", …), plus "and N more" if it says so. */
  keys: string[];
}

export interface LogState {
  /** agent86's notes for this connection, oldest first (at most `MAX_LOG_LINES`). */
  lines: string[];
  /** Set when agent86 says it ignored project settings that need trust. */
  untrusted?: Untrusted;
}

export const MAX_LOG_LINES = 500;

/** Parse agent86's note about ignored project settings. */
export function parseUntrusted(line: string): Untrusted | undefined {
  const match = UNTRUSTED.exec(line);
  if (!match) return undefined;
  return { count: Number(match[1]), keys: match[2]!.split(/,\s*/).filter(Boolean) };
}

/** agent86 refuses every other request while a prompt turn runs. */
export class TurnRunningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnRunningError";
  }
}

/** A file mentioned in a prompt, sent as an ACP resource link. */
export interface FileLink {
  /** As the user sees it, relative to the workspace. */
  name: string;
  /** Absolute `file://` URI. */
  uri: string;
}

/**
 * agent86 refused one of its extension requests (memory, secrets): -32002 an unknown session or
 * id, -32600 memory off or a turn running, -32602 bad params. The message never holds a secret.
 */
export class Agent86RequestError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
  ) {
    super(message);
    this.name = "Agent86RequestError";
  }
}

function errorCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

const DECLINED: SecretAnswer = { outcome: "declined" };

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
  /** How to answer each pending secret request, by its local id. */
  private readonly secretAnswers = new Map<number, (answer: SecretAnswer) => void>();

  constructor(
    private readonly connection: ClientConnection,
    sessionId: string,
    cwd: string,
    configOptions: SessionState["configOptions"],
    private readonly now: Clock,
    private readonly features: Agent86Features = NO_FEATURES,
    /** A transcript to carry on from (a session reopened with `session/resume`). */
    from?: SessionState,
  ) {
    this.state = from ? continueState(from) : initialState(sessionId, cwd, configOptions);
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

  /**
   * Send a prompt and resolve when the turn ends, however it ends. Mentioned files go as resource
   * links, which agent86 shows the model as "name (uri)".
   */
  async prompt(text: string, links: FileLink[] = []): Promise<void> {
    if (this.state.turn.running) throw new Error("A turn is already running.");
    if (this.state.closed) throw new Error("The connection to agent86 is closed.");
    // agent86 refuses a prompt while a quiet command is still being answered.
    if (this.quiet) {
      await this.quiet.done.catch(() => undefined);
      if (this.state.turn.running) throw new Error("A turn is already running.");
    }
    this.set(startTurn(this.state, text, this.now()));
    try {
      const prompt: ContentBlock[] = [
        { type: "text", text },
        ...links.map((link): ContentBlock => ({
          type: "resource_link",
          name: link.name,
          uri: link.uri,
        })),
      ];
      const result = await this.connection.agent.request(methods.agent.session.prompt, {
        sessionId: this.id,
        prompt,
      });
      this.cancelPermissions();
      this.set(endTurn(this.state, result.stopReason, this.now()));
    } catch (error) {
      this.cancelPermissions();
      // The connection went (agent86 exited, the bridge went away): not the turn's own error.
      // markClosed records that it ended during a turn, whichever of the two is seen first.
      if (this.state.closed || this.connection.signal.aborted) return;
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

  /**
   * Change a session setting (the model, the approval mode). Resolves with agent86's answer, all
   * the options as they now are; rejects with agent86's message, e.g. for a model it does not list.
   */
  async setConfigOption(configId: string, value: string): Promise<void> {
    const result = await this.connection.agent.request(methods.agent.session.setConfigOption, {
      sessionId: this.id,
      configId,
      value,
    });
    this.set({ ...this.state, configOptions: result.configOptions });
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

  /** Decline every open permission and secret request (cancel, turn end, connection gone). */
  private cancelPermissions(): void {
    for (const request of this.state.permissions) {
      this.answers.get(request.id)?.({ outcome: { outcome: "cancelled" } });
      this.answers.delete(request.id);
      this.set(resolvePermission(this.state, request.id, "cancelled"));
    }
    for (const request of this.state.secrets ?? []) this.declineSecret(request.id);
  }

  /**
   * @internal Called by the client for this session's `secret/request` (agent86 1.0.23). Resolves
   * with the user's answer, or declined when the turn is cancelled, ends, or the connection goes.
   */
  requestSecret(request: SecretRequest): Promise<SecretAnswer> {
    if (!this.state.turn.running || this.state.turn.cancelRequested || this.state.closed) {
      return Promise.resolve(DECLINED);
    }
    const { state, id } = addSecretRequest(this.state, {
      name: request.name,
      reason: request.reason,
      replacing: request.replacing,
      canRemember: request.canRemember,
      remembered: request.remembered,
    });
    return new Promise((resolve) => {
      this.secretAnswers.set(id, resolve);
      this.set(state);
    });
  }

  /**
   * Answer a secret request with what the user typed. The value goes to agent86 and nowhere else:
   * it is not kept in the session state. An empty value declines.
   */
  answerSecret(id: number, value: string, remember: boolean): void {
    const answer = this.secretAnswers.get(id);
    if (!answer) return;
    this.secretAnswers.delete(id);
    this.set(resolveSecretRequest(this.state, id));
    answer(value ? { outcome: "entered", value, remember } : DECLINED);
  }

  /** Decline a secret request; the model is told. */
  declineSecret(id: number): void {
    const answer = this.secretAnswers.get(id);
    this.secretAnswers.delete(id);
    this.set(resolveSecretRequest(this.state, id));
    answer?.(DECLINED);
  }

  /**
   * One of agent86's extension requests. agent86 refuses them while a turn runs, so this does too,
   * before asking; a quiet command (such as `/rename`) counts as a turn.
   */
  private async extension(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.state.closed)
      throw new Agent86RequestError("The connection to agent86 is closed.", undefined);
    if (this.state.turn.running || this.quiet)
      throw new Agent86RequestError("agent86 is busy with a turn; try again when it ends.", -32600);
    try {
      return await this.connection.agent.request(method, { sessionId: this.id, ...params });
    } catch (error) {
      throw new Agent86RequestError(errorMessage(error), errorCode(error));
    }
  }

  private need(feature: "memory" | "secrets"): void {
    if (!this.features[feature])
      throw new Agent86RequestError(
        `This agent86 does not offer its ${feature} to clients.`,
        undefined,
      );
  }

  /** One page of agent86's memory, newest first (agent86 1.0.22). */
  async listMemory(query: MemoryQuery = {}): Promise<MemoryPage> {
    this.need("memory");
    const params: Record<string, unknown> = { kind: query.kind ?? "fact" };
    if (query.limit !== undefined) params.limit = query.limit;
    if (query.cursor !== undefined) params.cursor = query.cursor;
    if (query.pinned) params.pinned = true;
    return parseMemoryPage(await this.extension(MEMORY_LIST_METHOD, params));
  }

  /** Pin (or with `pinned` false, unpin) a fact or episode, so pruning never removes it. */
  async pinMemory(kind: MemoryKind, id: number, pinned = true): Promise<MemoryEntry> {
    this.need("memory");
    const result = (await this.extension(MEMORY_PIN_METHOD, { kind, id, pinned })) as {
      entry?: unknown;
    } | null;
    const entry = parseMemoryEntry(result?.entry);
    if (!entry) throw new Agent86RequestError("agent86 sent back no entry.", undefined);
    return entry;
  }

  /** Delete a fact or episode. */
  async forgetMemory(kind: MemoryKind, id: number): Promise<void> {
    this.need("memory");
    await this.extension(MEMORY_FORGET_METHOD, { kind, id });
  }

  /** The names of the secrets this session holds, never their values (agent86 1.0.23). */
  async listSecrets(): Promise<SecretList> {
    this.need("secrets");
    return parseSecretList(await this.extension(SECRET_LIST_METHOD, {}));
  }

  /**
   * Hand agent86 a secret for this session, and with `remember` keep it in the keyring for the
   * project. Setting a remembered name without `remember` takes it out of the keyring.
   */
  async setSecret(name: string, value: string, remember = false): Promise<SecretSetResult> {
    this.need("secrets");
    return parseSecretSet(await this.extension(SECRET_SET_METHOD, { name, value, remember }), name);
  }

  /** Drop a secret from the session and the keyring. */
  async forgetSecret(name: string): Promise<SecretForgetResult> {
    this.need("secrets");
    return parseSecretForget(await this.extension(SECRET_FORGET_METHOD, { name }));
  }

  /** Whether agent86 offers the slash command `name` (without the slash) in this session. */
  hasCommand(name: string): boolean {
    return this.state.commands.some((command) => command.name === name);
  }

  /**
   * Run one of agent86's own slash commands (such as `/rename`) without showing it in the
   * transcript: agent86 answers these without a model turn and does not save them. Resolves with
   * agent86's reply text. Refuses while a turn or another command is running.
   */
  async command(text: string): Promise<string> {
    if (this.state.turn.running || this.quiet) throw new Error("agent86 is busy.");
    if (this.state.closed) throw new Error("The connection to agent86 is closed.");
    const quiet = { reply: "", done: Promise.resolve() };
    this.quiet = quiet;
    const request = this.connection.agent.request(methods.agent.session.prompt, {
      sessionId: this.id,
      prompt: [{ type: "text", text }],
    });
    quiet.done = request.then(() => undefined);
    try {
      await request;
      return quiet.reply.trim();
    } finally {
      this.quiet = undefined;
    }
  }

  /** The quiet command being answered, whose message chunks are kept out of the transcript. */
  private quiet: { reply: string; done: Promise<void> } | undefined;

  /** @internal Called by the client for this session's updates. */
  handleUpdate(notification: SessionNotification): void {
    const { update } = notification;
    if (this.quiet) {
      if (update.sessionUpdate === "agent_message_chunk") {
        this.quiet.reply += update.content.type === "text" ? update.content.text : "";
        return;
      }
      if (
        update.sessionUpdate === "user_message_chunk" ||
        update.sessionUpdate === "agent_thought_chunk"
      )
        return;
    }
    this.set(applyUpdate(this.state, update, this.now()));
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
    const diffs = toolDiffs(toolCall.content);
    const locations = toolLocations(toolCall.locations);
    // Who asks: only read when agent86 offers its state events, as the rest of the extension.
    const asker = this.features.state ? parseAsker(params._meta) : undefined;
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
        ...(diffs?.length ? { diffs } : {}),
        ...(locations?.length ? { locations } : {}),
        ...(asker ? { asker } : {}),
      },
      this.now(),
    );
    return new Promise((resolve) => {
      this.answers.set(id, resolve);
      this.set(state);
    });
  }

  /** Show a note from the client in the transcript (agent86 never sees it). */
  notice(level: "info" | "warning" | "error", text: string, hint?: string): void {
    this.set(addNotice(this.state, level, text, hint));
  }

  /** @internal Called by the client for agent86's state events, when agent86 offers them. */
  handleEvent(event: Agent86Event): void {
    this.set(applyEvent(this.state, event, this.now()));
  }

  /**
   * agent86 stopped partway through a turn (its process ended; see the thread manager). Mark that
   * turn interrupted; `startedAt` is when it began, if known.
   */
  markInterrupted(startedAt?: number): void {
    this.set(interruptTurn(this.state, this.now(), startedAt));
  }

  /** @internal After a load: the replayed history is in; keep the session's settings. */
  handleLoaded(configOptions: SessionState["configOptions"]): void {
    this.set({ ...this.state, configOptions });
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

/** What this agent86 offers beyond the core protocol, from its `initialize` answer. */
export interface Agent86Features {
  /** agent86's memory (`com.maetek.agent86/memory`, version 1; agent86 1.0.22). */
  memory: boolean;
  /**
   * agent86's secrets (`com.maetek.agent86/secrets`, version 1; agent86 1.0.23): set, list, and
   * forget, and `secret/request` (this client claims a masked entry).
   */
  secrets: boolean;
  /**
   * agent86's state events (`com.maetek.agent86/state`, version 1), with, from 1.0.21, the
   * questions queue and who asks on a sub-agent's permission request.
   */
  state: boolean;
  /** `session/resume` (`sessionCapabilities.resume`, agent86 1.0.21): reopen without replay. */
  resume: boolean;
}

const NO_FEATURES: Agent86Features = { state: false, resume: false, memory: false, secrets: false };

/** How to wait out a turn that a page which has since gone started. */
export interface ReopenOptions {
  waitForTurn?: boolean;
  retryMs?: number;
  onWaiting?: () => void;
  signal?: AbortSignal;
}

/** An initialized ACP connection to agent86. */
export class Agent86Client {
  private readonly sessions = new Map<string, AgentSession>();
  private logs: LogState = { lines: [] };
  private readonly logListeners = new Set<() => void>();

  /** agent86's notes for this connection. A new object after every change. */
  readonly getLogs = (): LogState => this.logs;

  readonly subscribeLogs = (listener: () => void): (() => void) => {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  };

  /** Add a line of the client's own to the logs (connection events, for example). */
  note(line: string): void {
    this.addLog(line);
  }

  private addLog(line: string): void {
    const lines = [...this.logs.lines, line].slice(-MAX_LOG_LINES);
    const untrusted = parseUntrusted(line) ?? this.logs.untrusted;
    this.logs = untrusted ? { lines, untrusted } : { lines };
    for (const listener of this.logListeners) listener();
  }

  /** What agent86 offers beyond the core protocol, detected from its `initialize` answer. */
  readonly features: Agent86Features;

  private constructor(
    readonly connection: ClientConnection,
    readonly init: InitializeResponse,
    readonly compatibility: Compatibility,
    private readonly now: Clock,
  ) {
    this.features = {
      state: advertisesState(init.agentCapabilities),
      resume: advertisesResume(init.agentCapabilities),
      memory: advertisesMemory(init.agentCapabilities),
      secrets: advertisesSecrets(init.agentCapabilities),
    };
    void connection.closed.then(
      () => this.closeAll("The connection to agent86 closed."),
      (error: unknown) => this.closeAll(errorMessage(error)),
    );
  }

  /** Open an ACP connection over `stream` and run `initialize`. */
  static async connect(stream: Stream, options: Agent86ClientOptions = {}): Promise<Agent86Client> {
    const now = options.now ?? Date.now;
    let self: Agent86Client | undefined;
    // Notes that arrive before initialize returns (the bridge replays them on attach).
    const early: string[] = [];
    const app = client({ name: CLIENT_INFO.name })
      .onNotification(methods.client.session.update, ({ params }) => {
        self?.sessions.get(params.sessionId)?.handleUpdate(params);
      })
      .onNotification(
        STDERR_METHOD,
        (params: unknown) => {
          const line = (params as { line?: unknown } | null)?.line;
          return { line: typeof line === "string" ? line : "" };
        },
        ({ params }) => {
          if (params.line) {
            if (self) self.addLog(params.line);
            else early.push(params.line);
          }
        },
      )
      .onNotification(
        STATE_EVENT_METHOD,
        // Lenient: an event this client cannot read is dropped here, never an error.
        (params: unknown) => parseEventParams(params) ?? null,
        ({ params }) => {
          if (!params || !self?.features.state) return;
          self.sessions.get(params.sessionId)?.handleEvent(params.event);
        },
      )
      .onRequest(
        SECRET_REQUEST_METHOD,
        // Lenient: params this client cannot read are declined, never an error.
        (params: unknown) => parseSecretRequest(params) ?? null,
        async ({ params }): Promise<SecretAnswer> => {
          if (!params || !self?.features.secrets) return DECLINED;
          const session = self.sessions.get(params.sessionId);
          if (!session) return DECLINED;
          try {
            return await session.requestSecret(params);
          } catch {
            return DECLINED;
          }
        },
      )
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
      for (const line of early) self.addLog(line);
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
      this.features,
    );
    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Reopen a saved session: agent86 replays its history as updates, then answers. While a turn
   * started before (by a page that has since reloaded) is still running, agent86 refuses; with
   * `waitForTurn`, this tries again every `retryMs` until the turn ends.
   */
  async loadSession(
    sessionId: string,
    cwd: string,
    options: ReopenOptions = {},
  ): Promise<AgentSession> {
    return this.reopen("load", sessionId, cwd, undefined, options);
  }

  /**
   * Reopen a saved session without a replay (`session/resume`, agent86 1.0.21), carrying on from
   * `from`, the transcript the client still has. Only when `features.resume` is set: the spec
   * forbids it otherwise. agent86 answers an unknown session with -32002.
   */
  async resumeSession(
    sessionId: string,
    cwd: string,
    from: SessionState | undefined,
    options: ReopenOptions = {},
  ): Promise<AgentSession> {
    if (!this.features.resume) throw new Error("This agent86 cannot resume sessions.");
    return this.reopen("resume", sessionId, cwd, from, options);
  }

  private async reopen(
    how: "load" | "resume",
    sessionId: string,
    cwd: string,
    from: SessionState | undefined,
    options: ReopenOptions,
  ): Promise<AgentSession> {
    for (;;) {
      // A fresh session each attempt, so a refused attempt leaves no half-replayed history.
      const session = new AgentSession(
        this.connection,
        sessionId,
        cwd,
        [],
        this.now,
        this.features,
        from?.sessionId === sessionId ? from : undefined,
      );
      this.sessions.set(sessionId, session);
      try {
        // Both take the same params: an absolute cwd and the full MCP server list again.
        const result: ResumeSessionResponse =
          how === "resume"
            ? await this.connection.agent.request(methods.agent.session.resume, {
                sessionId,
                cwd,
                mcpServers: [],
              })
            : await this.connection.agent.request(methods.agent.session.load, {
                sessionId,
                cwd,
                mcpServers: [],
              });
        session.handleLoaded(result.configOptions ?? []);
        return session;
      } catch (error) {
        if (this.sessions.get(sessionId) === session) this.sessions.delete(sessionId);
        const message = errorMessage(error);
        const busy = /prompt turn is running/i.test(message);
        if (!busy) throw error;
        if (!options.waitForTurn) throw new TurnRunningError(message);
        options.onWaiting?.();
        await new Promise((resolve) => setTimeout(resolve, options.retryMs ?? 1000));
        if (options.signal?.aborted) throw new TurnRunningError(message);
      }
    }
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
