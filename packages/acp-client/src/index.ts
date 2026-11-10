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
  type Agent86ClientOptions,
  type Clock,
} from "./agent86-client.ts";
export * from "./session-state.ts";
export type { InitializeResponse, StopReason, SessionUpdate } from "@agentclientprotocol/sdk";
