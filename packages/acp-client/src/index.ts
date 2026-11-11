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
  AgentSession,
  MAX_LOG_LINES,
  parseUntrusted,
  STDERR_METHOD,
  TurnRunningError,
  type Agent86ClientOptions,
  type Clock,
  type FileLink,
  type LogState,
  type Untrusted,
} from "./agent86-client.ts";
export * from "./session-state.ts";
export type {
  AvailableCommand,
  InitializeResponse,
  StopReason,
  SessionUpdate,
} from "@agentclientprotocol/sdk";
