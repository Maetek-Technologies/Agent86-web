export { webSocketStream, InvalidFrameError, type WebSocketLike } from "./websocket-stream.ts";
export {
  checkCompatibility,
  compareVersions,
  CLIENT_CAPABILITIES,
  CLIENT_INFO,
  MIN_AGENT86_VERSION,
  type Compatibility,
} from "./handshake.ts";
export {
  Agent86Client,
  Agent86RequestError,
  AgentSession,
  MAX_LOG_LINES,
  parseUntrusted,
  STDERR_METHOD,
  TurnRunningError,
  type Agent86ClientOptions,
  type Agent86Features,
  type ReopenOptions,
  type Clock,
  type FileLink,
  type LogState,
  type Untrusted,
} from "./agent86-client.ts";
export * from "./session-state.ts";
export * from "./agent86-events.ts";
export * from "./agent86-extensions.ts";
export type {
  AvailableCommand,
  InitializeResponse,
  StopReason,
  SessionUpdate,
} from "@agentclientprotocol/sdk";
