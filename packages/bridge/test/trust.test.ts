import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startBridge, type RunningBridge } from "../src/server.ts";
import { readProjectConfig, sha256, TrustStore } from "../src/trust.ts";
import { mockAgentCommand } from "./helpers.ts";

let base: string;
let workspace: string;
let stateDir: string;

function writeConfig(text: string) {
  mkdirSync(join(workspace, ".agent86"), { recursive: true });
  writeFileSync(join(workspace, ".agent86", "config.toml"), text);
}

beforeEach(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), "agent86-web-trust-")));
  workspace = join(base, "project");
  stateDir = join(base, "state");
  mkdirSync(workspace);
});

describe("TrustStore", () => {
  it("trusts the file the user reviewed, by path and hash", () => {
    writeConfig('[mcp.servers.demo]\ncommand = "node"\n');
    const store = new TrustStore(stateDir);
    const config = readProjectConfig(workspace)!;
    expect(config.sha256).toBe(sha256(Buffer.from('[mcp.servers.demo]\ncommand = "node"\n')));
    expect(store.isTrusted(workspace)).toBe(false);
    expect(store.trust(workspace, config.sha256)).toBe(true);
    expect(store.isTrusted(workspace)).toBe(true);
    expect(store.list()).toEqual([
      { path: config.path, sha256: config.sha256, trustedAt: expect.any(String) },
    ]);
  });

  it("refuses a hash the file no longer has, and forgets trust when the file changes", () => {
    writeConfig("a = 1\n");
    const store = new TrustStore(stateDir);
    const reviewed = readProjectConfig(workspace)!.sha256;
    writeConfig("a = 2\n");
    expect(store.trust(workspace, reviewed)).toBe(false);
    expect(store.trust(workspace, readProjectConfig(workspace)!.sha256)).toBe(true);
    writeConfig("a = 3\n# changed after trust\n");
    expect(store.isTrusted(workspace)).toBe(false);
  });

  it("has nothing to trust without a config file", () => {
    const store = new TrustStore(stateDir);
    expect(readProjectConfig(workspace)).toBeUndefined();
    expect(store.trust(workspace, "x")).toBe(false);
    expect(store.isTrusted(workspace)).toBe(false);
  });

  it("keeps its records readable only by the user, and revokes", () => {
    writeConfig("a = 1\n");
    const store = new TrustStore(stateDir);
    store.trust(workspace, readProjectConfig(workspace)!.sha256);
    if (process.platform !== "win32") expect(statSync(store.file).mode & 0o777).toBe(0o600);
    expect(store.revoke(readProjectConfig(workspace)!.path)).toBe(true);
    expect(store.revoke("/nowhere")).toBe(false);
    expect(store.isTrusted(workspace)).toBe(false);
    expect(JSON.parse(readFileSync(store.file, "utf8"))).toEqual({ projects: [] });
  });
});

describe("trust over the API", () => {
  let bridge: RunningBridge;
  let origin: string;
  let cookie: string;
  let record: string;

  beforeEach(async () => {
    record = join(base, "record.jsonl");
    process.env.MOCK_AGENT86_RECORD = record;
    process.env.MOCK_AGENT86_DB = join(base, "sessions.json");
    bridge = await startBridge({
      roots: [workspace],
      host: "127.0.0.1",
      port: 0,
      agent86: { command: mockAgentCommand(), version: "1.0.15", args: [] },
      publicDir: base,
      stateDir,
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

  const call = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${origin}/api/trust${method === "GET" && typeof body === "string" ? body : ""}`, {
      method,
      headers: {
        cookie,
        origin,
        "x-agent86-web": "1",
        "content-type": "application/json",
        ...headers,
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    });

  const recorded = (): { args: string[] }[] => {
    try {
      return readFileSync(record, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { args: string[] });
    } catch {
      return [];
    }
  };

  /** Start a new thread's agent86 and return the arguments it was started with. */
  async function argsOfNextAgent(): Promise<string[]> {
    const before = recorded().length;
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/acp/t${Date.now()}`, {
      headers: { origin, cookie },
    });
    await new Promise((resolve) => ws.once("open", resolve));
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: 1 },
      }),
    );
    for (let i = 0; i < 100 && recorded().length <= before; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    ws.close();
    const latest = recorded().at(-1);
    if (recorded().length <= before || !latest) throw new Error("the agent recorded nothing");
    return latest.args;
  }

  it("shows the file for review, trusts it, and then starts agent86 with --trust-project", async () => {
    writeConfig('[mcp.servers.demo]\ncommand = "node"\n');
    const review = (await (
      await call("GET", `?workspace=${encodeURIComponent(workspace)}`)
    ).json()) as {
      config: { path: string; contents: string; sha256: string };
      trusted: boolean;
    };
    expect(review.trusted).toBe(false);
    expect(review.config.contents).toContain("[mcp.servers.demo]");
    expect(await argsOfNextAgent()).toEqual(["acp"]);

    expect((await call("POST", { workspace, sha256: review.config.sha256 })).status).toBe(200);
    expect(await argsOfNextAgent()).toEqual(["--trust-project", "acp"]);

    // A changed file is untrusted again: agent86 starts without the flag.
    writeConfig('[mcp.servers.demo]\ncommand = "evil"\n');
    expect(await argsOfNextAgent()).toEqual(["acp"]);
    expect((await call("POST", { workspace, sha256: review.config.sha256 })).status).toBe(409);
  });

  it("lists and revokes trust", async () => {
    writeConfig("a = 1\n");
    const config = readProjectConfig(workspace)!;
    await call("POST", { workspace, sha256: config.sha256 });
    const listed = (await (await call("GET")).json()) as { projects: { path: string }[] };
    expect(listed.projects.map((p) => p.path)).toEqual([config.path]);
    const revoked = await call("DELETE", { path: config.path });
    expect(revoked.status).toBe(200);
    expect(((await revoked.json()) as { projects: unknown[] }).projects).toEqual([]);
  });

  it("refuses trust from a foreign origin, without the CSRF header, or outside the roots", async () => {
    writeConfig("a = 1\n");
    const { sha256: hash } = readProjectConfig(workspace)!;
    expect(
      (await call("POST", { workspace, sha256: hash }, { origin: "http://evil.com" })).status,
    ).toBe(403);
    expect((await call("POST", { workspace, sha256: hash }, { "x-agent86-web": "" })).status).toBe(
      403,
    );
    expect((await call("POST", { workspace: tmpdir(), sha256: hash })).status).toBe(403);
    expect((await call("GET", `?workspace=${encodeURIComponent(tmpdir())}`)).status).toBe(403);
    expect(new TrustStore(stateDir).isTrusted(workspace)).toBe(false);
  });
});
