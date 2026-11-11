import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startBridge, type BridgeOptions, type RunningBridge } from "../src/server.ts";
import { parseDuration } from "../src/duration.ts";
import { mockAgentCommand } from "./helpers.ts";

let bridge: RunningBridge;
let root: string;
let origin: string;
let cookie: string;
let logs: string[];

async function start(extra: Partial<BridgeOptions> = {}) {
  logs = [];
  bridge = await startBridge({
    roots: [root],
    host: "127.0.0.1",
    port: 0,
    agent86: { command: mockAgentCommand(), version: "1.0.15", args: [] },
    publicDir: root,
    log: (line) => logs.push(line),
    ...extra,
  });
  origin = `http://127.0.0.1:${bridge.port}`;
  const token = new URL(bridge.url).hash.replace("#token=", "");
  const res = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-agent86-web": "1" },
    body: JSON.stringify({ token }),
  });
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
}

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), "agent86-web-threads-")));
  process.env.MOCK_AGENT86_DB = join(root, "sessions.json");
});

afterEach(async () => {
  await bridge?.close();
  delete process.env.MOCK_AGENT86_DB;
});

// Frames are untyped JSON from the wire; `any` keeps these assertions readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Message = Record<string, any>;

/** A socket that collects every frame, and helpers to wait for one. */
async function connect(
  thread: string,
  query = "",
): Promise<{
  ws: WebSocket;
  frames: Message[];
  next: (match: (m: Message) => boolean) => Promise<Message>;
}> {
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/acp/${thread}${query}`, {
    headers: { origin, cookie },
  });
  const frames: Message[] = [];
  const waiters: { match: (m: Message) => boolean; resolve: (m: Message) => void }[] = [];
  ws.on("message", (data) => {
    const message = JSON.parse(data.toString()) as Message;
    frames.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.match(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  const next = (match: (m: Message) => boolean) =>
    new Promise<Message>((resolve) => {
      const seen = frames.find(match);
      if (seen) return resolve(seen);
      waiters.push({ match, resolve });
    });
  return { ws, frames, next };
}

const request = (ws: WebSocket, id: number, method: string, params: unknown) =>
  ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
const reply = (id: number) => (m: Message) => m.id === id && m.method === undefined;
const closed = (ws: WebSocket) =>
  new Promise<{ code: number; reason: string }>((resolve) =>
    ws.once("close", (code, reason) => resolve({ code, reason: reason.toString() })),
  );

async function newSession(
  ws: WebSocket,
  next: (match: (m: Message) => boolean) => Promise<Message>,
) {
  request(ws, 0, "initialize", { protocolVersion: 1 });
  await next(reply(0));
  request(ws, 1, "session/new", { cwd: root, mcpServers: [] });
  return (await next(reply(1))).result.sessionId as string;
}

describe("threads", () => {
  it("forwards agent86's stderr as notifications, and replays them to a new socket", async () => {
    await start();
    const first = await connect("t1");
    const note = await first.next((m) => m.method === "_agent86web/stderr");
    expect(note.params.line).toMatch(/^mock-agent86 1\.0\.15: started in /);
    first.ws.close();
    await closed(first.ws);

    const second = await connect("t1");
    const replayed = await second.next((m) => m.method === "_agent86web/stderr");
    expect(replayed.params.line).toBe(note.params.line);
    expect(logs.filter((l) => l.includes("starting agent86"))).toHaveLength(1);
    second.ws.close();
  });

  it("reattaches a reload to the same agent86, which still knows the session", async () => {
    await start();
    const first = await connect("t1");
    const sessionId = await newSession(first.ws, first.next);
    first.ws.close();
    await closed(first.ws);

    const second = await connect("t1");
    // The new page starts its ids from zero again; the bridge keeps them apart.
    request(second.ws, 0, "initialize", { protocolVersion: 1 });
    expect((await second.next(reply(0))).result.agentInfo.name).toBe("agent86");
    request(second.ws, 1, "session/set_config_option", {
      sessionId,
      configId: "mode",
      value: "auto",
    });
    const answer = await second.next(reply(1));
    expect(answer.result.configOptions[0].currentValue).toBe("auto");
    expect(logs.filter((l) => l.includes("starting agent86"))).toHaveLength(1);
    second.ws.close();
  });

  it("replaces an older socket on the same thread", async () => {
    await start();
    const first = await connect("t1");
    const firstClosed = closed(first.ws);
    const second = await connect("t1");
    expect(await firstClosed).toMatchObject({ code: 4000 });
    second.ws.close();
  });

  it("drops a reply meant for a socket that has gone, and declines what agent86 asks with no socket", async () => {
    await start();
    const first = await connect("t1");
    const sessionId = await newSession(first.ws, first.next);
    // A permission request arrives, and the page goes away without answering.
    request(first.ws, 2, "session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: "fix the typo" }],
    });
    await first.next((m) => m.method === "session/request_permission");
    first.ws.close();
    await closed(first.ws);

    const second = await connect("t1");
    request(second.ws, 0, "initialize", { protocolVersion: 1 });
    await second.next(reply(0));
    // Give the declined turn time to finish; its reply (id 2 on the old socket) must not arrive here.
    await new Promise((resolve) => setTimeout(resolve, 300));
    request(second.ws, 1, "session/load", { sessionId, cwd: root, mcpServers: [] });
    await second.next(reply(1));
    expect(second.frames.some((m) => m.id === 2)).toBe(false);
    const replayed = second.frames
      .filter((m) => m.method === "session/update")
      .map((m) => m.params.update.content?.text);
    expect(replayed).toContain("Tool result: Not executed: declined by user.");
    second.ws.close();
  });

  it("restarts the thread's agent86 when asked for a fresh one", async () => {
    await start();
    const first = await connect("t1");
    const firstClosed = closed(first.ws);
    const second = await connect("t1", "?fresh=1");
    await firstClosed;
    expect(logs.filter((l) => l.includes("starting agent86"))).toHaveLength(2);
    second.ws.close();
  });

  it("stops an idle, detached agent86 after the timeout", async () => {
    await start({ idleTimeoutMs: 200 });
    const first = await connect("t1");
    first.ws.close();
    await closed(first.ws);
    for (let i = 0; i < 50 && !logs.some((l) => l.includes("idle, stopping")); i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(logs.some((l) => l.includes("thread t1: idle, stopping agent86"))).toBe(true);
  });

  it("caps the agents, making room by stopping an idle one, and refuses when none is idle", async () => {
    await start({ maxAgents: 1 });
    const first = await connect("t1");
    first.ws.close();
    await closed(first.ws);
    const second = await connect("t2");
    expect(logs.some((l) => l.includes("thread t1: stopping agent86 to make room"))).toBe(true);

    const third = await connect("t3");
    expect(await closed(third.ws)).toMatchObject({
      code: 1013,
      reason: expect.stringContaining("--max-agents"),
    });
    second.ws.close();
  });
});

describe("REST", () => {
  const get = (path: string) => fetch(`${origin}${path}`, { headers: { cookie } });

  it("lists sessions for a workspace from agent86", async () => {
    await start();
    const { ws, next } = await connect("t1");
    const sessionId = await newSession(ws, next);
    request(ws, 2, "session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: "hello there" }],
    });
    await next(reply(2));
    ws.close();

    const res = await get(`/api/sessions?workspace=${encodeURIComponent(root)}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { sessions: unknown[] }).sessions).toEqual([
      expect.objectContaining({ sessionId, cwd: root, title: "hello there" }),
    ]);
    expect((await get(`/api/sessions?workspace=${encodeURIComponent(tmpdir())}`)).status).toBe(403);
  });

  it("browses directories under the roots only, without hidden ones", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(root, "app", "src"), { recursive: true });
    mkdirSync(join(root, ".git"));
    mkdirSync(join(root, "node_modules"));
    await start();
    expect(await (await get("/api/workspaces")).json()).toEqual({
      path: null,
      parent: null,
      dirs: [{ name: root, path: root }],
    });
    const top = await (await get(`/api/workspaces?path=${encodeURIComponent(root)}`)).json();
    expect(top).toEqual({
      path: root,
      parent: null,
      dirs: [{ name: "app", path: join(root, "app") }],
    });
    const app = (await (
      await get(`/api/workspaces?path=${encodeURIComponent(join(root, "app"))}`)
    ).json()) as { parent: string };
    expect(app.parent).toBe(root);
    expect((await get(`/api/workspaces?path=${encodeURIComponent(tmpdir())}`)).status).toBe(403);
    expect((await get(`/api/workspaces?path=${encodeURIComponent(join(root, ".."))}`)).status).toBe(
      403,
    );
  });

  it("finds files for @ mentions, best match first, skipping hidden directories", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, "README.md"), "x");
    writeFileSync(join(root, "src", "readme-helper.ts"), "x");
    writeFileSync(join(root, "src", "app.ts"), "x");
    writeFileSync(join(root, ".git", "readme"), "x");
    await start();
    const res = (await (
      await get(`/api/files?workspace=${encodeURIComponent(root)}&q=readme`)
    ).json()) as { files: string[] };
    expect(res.files).toEqual(["README.md", "src/readme-helper.ts"]);
    expect((await get("/api/files?workspace=/etc&q=passwd")).status).toBe(403);
  });
});

describe("parseDuration", () => {
  it.each([
    ["90s", 90_000],
    ["15m", 900_000],
    ["1h", 3_600_000],
    ["30", 30_000],
    ["0.5m", 30_000],
    ["0s", null],
    ["soon", null],
    ["-5m", null],
  ])("%s → %s", (text, ms) => {
    expect(parseDuration(text)).toBe(ms);
  });
});
