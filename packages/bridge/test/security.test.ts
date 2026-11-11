// The checklist in docs/SECURITY.md §6, for the parts not already covered by server, threads, and
// trust tests.
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { listDirectories, walkFiles } from "../src/files.ts";
import { filterClientMessage } from "../src/policy.ts";
import { startBridge, type RunningBridge } from "../src/server.ts";
import { readProjectConfig, TrustStore } from "../src/trust.ts";
import { realpath, resolveWorkspace } from "../src/workspaces.ts";
import { mockAgentCommand } from "./helpers.ts";

// Making symlinks on Windows needs a privilege CI runners may not have.
const posix = process.platform !== "win32";

let base: string;
let root: string;
let outside: string;

beforeEach(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), "agent86-web-sec-")));
  root = join(base, "root");
  outside = join(base, "outside");
  mkdirSync(root);
  mkdirSync(outside);
  writeFileSync(join(outside, "secret.txt"), "PRIVATE KEY MATERIAL");
});

describe.runIf(posix)("symlinks out of a root (T7)", () => {
  beforeEach(() => {
    symlinkSync(outside, join(root, "escape"), "dir");
    symlinkSync(join(outside, "secret.txt"), join(root, "secret-link.txt"), "file");
  });

  it("are refused as a workspace", () => {
    expect(resolveWorkspace(join(root, "escape"), [root])).toBeUndefined();
    // As the browser would send it: the file system resolves ".." after following the link.
    expect(resolveWorkspace(`${root}/escape/..`, [root])).toBeUndefined();
    expect(resolveWorkspace(root, [root])).toBe(root);
  });

  it("are not listed in the workspace picker, and not walked for @ mentions", () => {
    mkdirSync(join(root, "real"));
    writeFileSync(join(root, "real", "a.txt"), "a");
    expect(listDirectories(root).map((d) => d.name)).toEqual(["real"]);
    expect(walkFiles(root)).toEqual(["real/a.txt"]);
  });

  it("cannot become a session's cwd through the policy filter", () => {
    const ctx = { workspace: root, realpath };
    const result = filterClientMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "session/new",
        params: { cwd: join(root, "escape"), mcpServers: [] },
      }),
      ctx,
    );
    expect(result.action).toBe("reject");
  });

  it("are never read as the project's config file", () => {
    mkdirSync(join(root, ".agent86"));
    symlinkSync(join(outside, "secret.txt"), join(root, ".agent86", "config.toml"), "file");
    expect(readProjectConfig(root)).toBeUndefined();
    const store = new TrustStore(join(base, "state"));
    expect(store.trust(root, "anything")).toBe(false);
    expect(store.isTrusted(root)).toBe(false);
  });
});

describe("a project config that is a directory", () => {
  it("is not read", () => {
    mkdirSync(join(root, ".agent86", "config.toml"), { recursive: true });
    expect(readProjectConfig(root)).toBeUndefined();
  });
});

describe("over a running bridge", () => {
  let bridge: RunningBridge;
  let origin: string;
  let cookie: string;
  let logs: string[];
  let record: string;

  beforeEach(async () => {
    logs = [];
    record = join(base, "record.jsonl");
    process.env.MOCK_AGENT86_RECORD = record;
    process.env.MOCK_AGENT86_DB = join(base, "sessions.json");
    bridge = await startBridge({
      roots: [root],
      host: "127.0.0.1",
      port: 0,
      agent86: { command: mockAgentCommand(), version: "1.0.15", args: [] },
      publicDir: base,
      stateDir: join(base, "state"),
      log: (line) => logs.push(line),
    });
    origin = `http://127.0.0.1:${bridge.port}`;
    const token = new URL(bridge.url).hash.replace("#token=", "");
    const res = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "x-agent86-web": "1" },
      body: JSON.stringify({ token }),
    });
    cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  });

  afterEach(async () => {
    await bridge.close();
    delete process.env.MOCK_AGENT86_RECORD;
    delete process.env.MOCK_AGENT86_DB;
  });

  const open = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/acp/t1`, {
      headers: { origin, cookie },
    });
    await new Promise((resolve) => ws.once("open", resolve));
    return ws;
  };

  it("closes a socket that floods the bridge with messages (T12)", async () => {
    const ws = await open();
    const closed = new Promise<number>((resolve) => ws.once("close", (code) => resolve(code)));
    const cancel = JSON.stringify({
      jsonrpc: "2.0",
      method: "session/cancel",
      params: { sessionId: "x" },
    });
    for (let i = 0; i < 600; i++) ws.send(cancel);
    expect(await closed).toBe(1008);
    expect(logs.some((l) => l.includes("too many messages"))).toBe(true);
  });

  it("shares one agent86 between concurrent session-list requests (T12)", async () => {
    const get = () =>
      fetch(`${origin}/api/sessions?workspace=${encodeURIComponent(root)}`, {
        headers: { cookie },
      });
    const answers = await Promise.all([get(), get(), get(), get()]);
    expect(answers.map((a) => a.status)).toEqual([200, 200, 200, 200]);
    const lists = readFileSync(record, "utf8")
      .trim()
      .split("\n")
      .filter((line) => JSON.parse(line).method === "session/list");
    expect(lists).toHaveLength(1);
  });

  it("never writes what the browser sends into its log (§6)", async () => {
    const ws = await open();
    const secret = "sk-test-DO-NOT-LOG-0123456789";
    const reply = new Promise((resolve) =>
      ws.on("message", (data) => {
        if (JSON.parse(data.toString()).id === 1) resolve(undefined);
      }),
    );
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: 1 },
      }),
    );
    // A refused method, whose reason the bridge does log, carrying the secret in its params.
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "fs/read_text_file",
        params: { path: secret },
      }),
    );
    await reply;
    ws.close();
    expect(logs.some((l) => l.includes("bridge refused a message"))).toBe(true);
    expect(logs.join("\n")).not.toContain(secret);
  });
});
