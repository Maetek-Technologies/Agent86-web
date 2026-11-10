export { webSocketStream, InvalidFrameError, type WebSocketLike } from "./websocket-stream.ts";
export {
  checkCompatibility,
  compareVersions,
  connectAndInitialize,
  CLIENT_CAPABILITIES,
  CLIENT_INFO,
  MIN_AGENT86_VERSION,
  type Compatibility,
  type Handshake,
} from "./handshake.ts";
export type { InitializeResponse } from "@agentclientprotocol/sdk";
