import type { AnyMessage, Stream } from "@agentclientprotocol/sdk";

/** The part of the browser's `WebSocket` this module uses, so tests can pass a fake. */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(
    type: "close",
    listener: (event: { code: number; reason: string }) => void,
  ): void;
  addEventListener(type: "error", listener: (event: unknown) => void): void;
}

const OPEN = 1;

/** Raised on the readable side when the socket sends something that is not one JSON object. */
export class InvalidFrameError extends Error {
  constructor(detail: string) {
    super(`The bridge sent a frame that is not a JSON-RPC message: ${detail}`);
    this.name = "InvalidFrameError";
  }
}

/**
 * Adapts an open WebSocket to the ACP SDK's `Stream`: one JSON-RPC message per text frame,
 * which is how the agent86-web bridge relays agent86's newline-delimited stdio.
 */
export function webSocketStream(socket: WebSocketLike): Stream {
  let closed = false;

  const readable = new ReadableStream<AnyMessage>({
    start(controller) {
      socket.addEventListener("message", (event) => {
        if (closed) return;
        if (typeof event.data !== "string") {
          closed = true;
          controller.error(new InvalidFrameError("binary frame"));
          return;
        }
        let message: unknown;
        try {
          message = JSON.parse(event.data);
        } catch {
          closed = true;
          controller.error(new InvalidFrameError("not JSON"));
          return;
        }
        if (typeof message !== "object" || message === null || Array.isArray(message)) {
          closed = true;
          controller.error(new InvalidFrameError("not an object"));
          return;
        }
        controller.enqueue(message as AnyMessage);
      });
      socket.addEventListener("close", () => {
        if (closed) return;
        closed = true;
        controller.close();
      });
      socket.addEventListener("error", () => {
        if (closed) return;
        closed = true;
        controller.error(new Error("The connection to the bridge failed."));
      });
    },
    cancel() {
      closed = true;
      socket.close(1000, "client closed");
    },
  });

  const writable = new WritableStream<AnyMessage>({
    write(message) {
      if (socket.readyState !== OPEN) {
        throw new Error("The connection to the bridge is closed.");
      }
      socket.send(JSON.stringify(message));
    },
    close() {
      socket.close(1000, "client closed");
    },
    abort() {
      socket.close(1000, "client closed");
    },
  });

  return { readable, writable };
}
