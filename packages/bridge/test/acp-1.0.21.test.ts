// The bridge and agent86 1.0.21: `session/resume` is relayed under the same rules as
// `session/load`, and an agent86 that dies partway through a turn closes the page's socket as
// "agent86 exited" (1011), after which the thread's next connection starts a new agent86.
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startBridge, type RunningBridge } from "../src/server.ts";
import { mockAgentCommand } from "./helpers.ts";

describe("relaying agent86 1.0.21", () => {
  let bridge: RunningBridge;
  let root: string;
  let record: string;
  const logs: string[] = [];

  beforeEach(async () => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), "agent86-web-1021-")));
    record = join(root, "record.jsonl");
    process.env.MOCK_AGENT86_VERSION = "1.0.21";
    process.env.MOCK_AGENT86_RECORD = record;
    process.env.MOCK_AGENT86_DB = join(root, "sessions.json");
    logs.length = 0;
    cookie = undefined;
    bridge = await startBridge({
      roots: [root],
      host: "127.0.0.1",
      port: 0,
      agent86: { command: mockAgentCommand(), version: "1.0.21", args: [] },
      publicDir: root,
      stateDir: join(root, "state"),
      log: (line) => logs.push(line),
    });
  });

  afterEach(async () => {
    await bridge.close();
    delete process.env.MOCK_AGENT86_VERSION;
    delete process.env.MOCK_AGENT86_RECORD;
    delete process.env.MOCK_AGENT86_DB;
  });

  /** The session cookie; the launch token signs in once. */
  let cookie: string | undefined;

  async function connect() {
    const origin = `http://127.0.0.1:${bridge.port}`;
    if (!cookie) {
      const token = new URL(bridge.url).hash.replace("#token=", "");
      const login = await fetch(`${origin}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, "x-agent86-web": "1" },
        body: JSON.stringify({ token }),
      });
      cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]!;
    }
    const ws = new WebSocket(
      `ws://127.0.0.1:${bridge.port}/acp/t1?workspace=${encodeURIComponent(root)}`,
      { headers: { origin, cookie } },
    );
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    const frames: Record<string, unknown>[] = [];
    ws.on("message", (data) => frames.push(JSON.parse(data.toString())));
    const closed = new Promise<{ code: number; reason: string }>((resolve) =>
      ws.once("close", (code, reason) => resolve({ code, reason: reason.toString() })),
    );
    const reply = (id: number) =>
      new Promise<Record<string, unknown>>((resolve) => {
        const check = () => {
          const found = frames.find((m) => m.id === id);
          if (found) resolve(found);
          else setTimeout(check, 10);
        };
        check();
      });
    const send = (m: unknown) => ws.send(JSON.stringify(m));
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: 1, clientCapabilities: {} },
    });
    const init = await reply(1);
    return { ws, frames, closed, reply, send, init };
  }

  it("relays session/resume with cwd pinned and MCP servers stripped", async () => {
    const first = await connect();
    expect(first.init.result).toMatchObject({
      agentCapabilities: { sessionCapabilities: { resume: {} } },
    });
    first.send({
      jsonrpc: "2.0",
      id: 2,
      method: "session/new",
      params: { cwd: root, mcpServers: [] },
    });
    const sessionId = ((await first.reply(2)).result as { sessionId: string }).sessionId;
    first.send({
      jsonrpc: "2.0",
      id: 3,
      method: "session/resume",
      params: {
        sessionId,
        cwd: root,
        mcpServers: [{ name: "evil", command: "/bin/sh", args: [], env: [] }],
      },
    });
    expect((await first.reply(3)).result).toMatchObject({ configOptions: expect.any(Array) });
    first.send({
      jsonrpc: "2.0",
      id: 4,
      method: "session/resume",
      params: { sessionId, cwd: tmpdir(), mcpServers: [] },
    });
    expect((await first.reply(4)).error).toMatchObject({ code: -32602 });
    const resumes = readFileSync(record, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { method: string; params: Record<string, unknown> })
      .filter((m) => m.method === "session/resume");
    expect(resumes).toEqual([
      expect.objectContaining({ params: { sessionId, cwd: root, mcpServers: [] } }),
    ]);
    first.ws.close();
  });

  it("closes the socket as agent86 exited when it dies mid-turn; the next connection starts a new one", async () => {
    const first = await connect();
    first.send({
      jsonrpc: "2.0",
      id: 2,
      method: "session/new",
      params: { cwd: root, mcpServers: [] },
    });
    const sessionId = ((await first.reply(2)).result as { sessionId: string }).sessionId;
    first.send({
      jsonrpc: "2.0",
      id: 3,
      method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "crash after reading" }] },
    });
    const { code, reason } = await first.closed;
    expect(code).toBe(1011);
    expect(reason).toMatch(/^agent86 exited/);
    expect(logs.filter((l) => /agent86 pid \d+$/.test(l))).toHaveLength(1);

    const second = await connect();
    second.send({
      jsonrpc: "2.0",
      id: 2,
      method: "session/resume",
      params: { sessionId, cwd: root, mcpServers: [] },
    });
    expect((await second.reply(2)).result).toMatchObject({ configOptions: expect.any(Array) });
    expect(logs.filter((l) => /agent86 pid \d+$/.test(l))).toHaveLength(2);
    second.ws.close();
  });
});
