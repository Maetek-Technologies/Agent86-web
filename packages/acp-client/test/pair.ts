import type { AnyMessage, Stream } from "@agentclientprotocol/sdk";

/** Two in-memory ends of one ACP connection. */
export function streamPair(): { client: Stream; agent: Stream } {
  const toAgent = new TransformStream<AnyMessage, AnyMessage>();
  const toClient = new TransformStream<AnyMessage, AnyMessage>();
  return {
    client: { readable: toClient.readable, writable: toAgent.writable },
    agent: { readable: toAgent.readable, writable: toClient.writable },
  };
}
