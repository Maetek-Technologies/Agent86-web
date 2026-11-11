import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { COOKIE_NAME } from "../src/auth.ts";
import { startBridge, type RunningBridge } from "../src/server.ts";
import { mockAgentCommand } from "./helpers.ts";

let bridge: RunningBridge;
let root: string;
let outside: string;
let record: string;
let origin: string;

beforeEach(async () => {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), "agent86-web-test-")));
  root = join(base, "code");
  outside = join(base, "elsewhere");
  mkdirSync(join(root, "app"), { recursive: true });
  mkdirSync(outside);
  const publicDir = join(base, "public");
  mkdirSync(join(publicDir, "assets"), { recursive: true });
  writeFileSync(join(publicDir, "index.html"), "<!doctype html><title>agent86 web</title>");
  writeFileSync(join(publicDir, "assets", "app.js"), "console.log(1)");
  writeFileSync(join(base, "secret.txt"), "do not serve");
  record = join(base, "record.jsonl");
  process.env.MOCK_AGENT86_RECORD = record;
  process.env.MOCK_AGENT86_DB = join(base, "sessions.json");

  bridge = await startBridge({
    roots: [root],
    host: "127.0.0.1",
    port: 0,
    agent86: { command: mockAgentCommand(), version: "1.0.15", args: ["--model", "mock:model"] },
    publicDir,
  });
  origin = `http://127.0.0.1:${bridge.port}`;
});

afterEach(async () => {
  await bridge.close();
  delete process.env.MOCK_AGENT86_RECORD;
  delete process.env.MOCK_AGENT86_DB;
});

const token = () => new URL(bridge.url).hash.replace("#token=", "");

async function login(value = token(), headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-agent86-web": "1", ...headers },
    body: JSON.stringify({ token: value }),
  });
}

async function cookie(): Promise<string> {
  const res = await login();
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=Strict");
  return setCookie.split(";")[0]!;
}

function openSocket(path: string, headers: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}${path}`, { headers });
    ws.once("open", () => resolve(ws));
    ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.once("error", reject);
  });
}

/** The next message that is not one of the bridge's stderr notifications. */
function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const onMessage = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      if (message.method === "_agent86web/stderr") return;
      ws.off("message", onMessage);
      resolve(message);
    };
    ws.on("message", onMessage);
  });
}

const recorded = () =>
  readFileSync(record, "utf8")
    .trim()
    .split("\n")
    .map(
      (line) =>
        JSON.parse(line) as {
          method: string;
          params: Record<string, unknown>;
          args: string[];
          cwd: string;
        },
    );

describe("login", () => {
  it("sets a session cookie once, and refuses the token afterwards", async () => {
    await cookie();
    expect((await login()).status).toBe(401);
  });

  it("refuses a wrong token, a foreign origin, and a missing CSRF header", async () => {
    expect((await login("wrong")).status).toBe(401);
    expect((await login(token(), { origin: "http://evil.com" })).status).toBe(403);
    expect((await login(token(), { "x-agent86-web": "" })).status).toBe(403);
    // None of those used up the token.
    expect((await login()).status).toBe(200);
  });
});

describe("HTTP", () => {
  it("needs the session cookie for /api/info", async () => {
    expect((await fetch(`${origin}/api/info`)).status).toBe(401);
    const res = await fetch(`${origin}/api/info`, { headers: { cookie: await cookie() } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      agent86: { version: "1.0.15", minVersion: "1.0.15" },
      roots: [root],
      defaultWorkspace: root,
    });
  });

  it("refuses a foreign Host header (DNS rebinding)", async () => {
    const { request } = await import("node:http");
    const status = await new Promise<number>((resolve) => {
      request(
        { host: "127.0.0.1", port: bridge.port, path: "/", headers: { host: "evil.com" } },
        (res) => resolve(res.statusCode ?? 0),
      ).end();
    });
    expect(status).toBe(403);
  });

  it("serves the app with security headers and an SPA fallback, and nothing outside it", async () => {
    const index = await fetch(`${origin}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(index.headers.get("x-frame-options")).toBe("DENY");
    expect(await (await fetch(`${origin}/t/some-thread`)).text()).toContain("agent86 web");
    expect((await fetch(`${origin}/assets/app.js`)).headers.get("cache-control")).toContain(
      "immutable",
    );
    expect((await fetch(`${origin}/assets/missing.js`)).status).toBe(404);
    expect((await fetch(`${origin}/..%2fsecret.txt`)).status).toBe(404);
    expect((await fetch(`${origin}/%2e%2e/secret.txt`)).status).toBe(404);
  });
});

describe("ACP WebSocket", () => {
  it("refuses a socket without the cookie, from a foreign origin, or outside the roots", async () => {
    const session = await cookie();
    await expect(openSocket("/acp/t1", { origin })).rejects.toThrow("401");
    await expect(
      openSocket("/acp/t1", { origin: "http://evil.com", cookie: session }),
    ).rejects.toThrow("403");
    await expect(openSocket("/acp/t1", { cookie: session })).rejects.toThrow("403");
    await expect(
      openSocket(`/acp/t1?workspace=${encodeURIComponent(outside)}`, { origin, cookie: session }),
    ).rejects.toThrow("403");
    await expect(
      openSocket(`/acp/t1?workspace=${encodeURIComponent(join(root, "..", "elsewhere"))}`, {
        origin,
        cookie: session,
      }),
    ).rejects.toThrow("403");
    await expect(openSocket("/acp/../x", { origin, cookie: session })).rejects.toThrow();
  });

  it("relays the handshake to agent86 acp in the workspace, with capabilities forced off", async () => {
    const workspace = join(root, "app");
    const ws = await openSocket(`/acp/t1?workspace=${encodeURIComponent(workspace)}`, {
      origin,
      cookie: await cookie(),
    });
    const answer = nextMessage(ws);
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: 1,
          clientCapabilities: { fs: { readTextFile: true }, terminal: true },
        },
      }),
    );
    expect(await answer).toMatchObject({
      id: 0,
      result: { protocolVersion: 1, agentInfo: { name: "agent86", version: "1.0.15" } },
    });

    const [init] = recorded();
    expect(init?.method).toBe("initialize");
    expect(init?.params.clientCapabilities).toMatchObject({
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    });
    expect(init?.args).toEqual(["--model", "mock:model", "acp"]);
    expect(init?.cwd).toBe(workspace);
    ws.close();
  });

  it("answers a refused request itself, without reaching agent86", async () => {
    const ws = await openSocket("/acp/t2", { origin, cookie: await cookie() });
    const answer = nextMessage(ws);
    ws.send(JSON.stringify({ jsonrpc: "2.0", id: 5, method: "authenticate", params: {} }));
    expect(await answer).toMatchObject({ id: 5, error: { code: -32601 } });

    const initialized = nextMessage(ws);
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: 1 },
      }),
    );
    await initialized;

    const created = nextMessage(ws);
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 6,
        method: "session/new",
        params: { cwd: root, mcpServers: [{ name: "x", command: "/bin/sh", args: [], env: [] }] },
      }),
    );
    expect(await created).toMatchObject({
      id: 6,
      result: { sessionId: expect.stringMatching(/^mock-/) },
    });
    expect(recorded().map((m) => m.method)).toEqual(["initialize", "session/new"]);
    expect(recorded()[1]?.params.mcpServers).toEqual([]);
    ws.close();
  });

  it("stops the agent86 process when the socket closes", async () => {
    const ws = await openSocket("/acp/t3", { origin, cookie: await cookie() });
    const closed = new Promise((resolve) => ws.once("close", resolve));
    ws.close();
    await closed;
    // bridge.close() in afterEach waits for every process to exit; a leak would time out.
  });

  it("uses the cookie name the docs promise", () => {
    expect(COOKIE_NAME).toBe("agent86web_session");
  });
});
