import { describe, expect, it } from "vitest";
import { InvalidFrameError, webSocketStream, type WebSocketLike } from "../src/index.ts";

type Listener = (event: never) => void;

class FakeSocket implements WebSocketLike {
  readyState = 1;
  sent: string[] = [];
  closedWith: number | undefined;
  private listeners = new Map<string, Listener[]>();

  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
  }
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never);
  }
}

describe("webSocketStream", () => {
  it("writes one JSON message per frame", async () => {
    const socket = new FakeSocket();
    const writer = webSocketStream(socket).writable.getWriter();
    await writer.write({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(socket.sent).toEqual(['{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}']);
  });

  it("reads messages and ends when the socket closes", async () => {
    const socket = new FakeSocket();
    const reader = webSocketStream(socket).readable.getReader();
    socket.emit("message", { data: '{"jsonrpc":"2.0","id":1,"result":{}}' });
    socket.emit("close", { code: 1000, reason: "" });
    expect(await reader.read()).toEqual({
      done: false,
      value: { jsonrpc: "2.0", id: 1, result: {} },
    });
    expect(await reader.read()).toEqual({ done: true, value: undefined });
  });

  it.each([
    ["not JSON", "{oops"],
    ["not an object", "[1,2]"],
    ["binary frame", new Uint8Array([1])],
  ])("fails on a frame that is %s", async (_label, data) => {
    const socket = new FakeSocket();
    const reader = webSocketStream(socket).readable.getReader();
    socket.emit("message", { data });
    await expect(reader.read()).rejects.toBeInstanceOf(InvalidFrameError);
  });

  it("refuses to write once the socket is closed", async () => {
    const socket = new FakeSocket();
    socket.readyState = 3;
    const writer = webSocketStream(socket).writable.getWriter();
    await expect(writer.write({ jsonrpc: "2.0", method: "x" })).rejects.toThrow("closed");
  });
});
