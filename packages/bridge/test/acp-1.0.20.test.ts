// The bridge and agent86 1.0.19/1.0.20's ACP additions: the opt-ins pass `initialize`'s filter,
// everything agent86 sends is relayed as it is, and the session list's folder marker is read.
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { clientCapabilities, filterClientMessage } from "../src/policy.ts";
import { startBridge, type RunningBridge } from "../src/server.ts";
import { cwdKnown, workspaceSessions } from "../src/sessions.ts";
import { mockAgentCommand } from "./helpers.ts";

const ctx = { workspace: "/work", realpath: (p: string) => p };
const initialize = (clientCapabilities: unknown) =>
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: 1, clientCapabilities },
  });
const forwardedCaps = (raw: string) => {
  const verdict = filterClientMessage(raw, ctx);
  if (verdict.action !== "forward") throw new Error(verdict.reason);
  return (verdict.message.params as { clientCapabilities: unknown }).clientCapabilities;
};

describe("initialize's capabilities", () => {
  it("passes the compaction and state opt-ins, with files and terminal still off", () => {
    expect(
      forwardedCaps(
        initialize({
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
          session: { compaction: {} },
          _meta: { "com.maetek.agent86/state": true },
        }),
      ),
    ).toEqual({
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
      session: { compaction: {} },
      _meta: { "com.maetek.agent86/state": true },
    });
  });

  it("drops every other claim, and anything inside the opt-ins", () => {
    expect(
      forwardedCaps(
        initialize({
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
          auth: { terminal: true },
          elicitation: {},
          session: { compaction: { anything: 1 }, configOptions: {}, notices: {} },
          _meta: { "com.maetek.agent86/state": { version: 9 }, "other.vendor/x": true },
        }),
      ),
    ).toEqual({
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
      session: { compaction: {} },
      _meta: { "com.maetek.agent86/state": true },
    });
  });

  it("leaves the opt-ins out when they are malformed or absent", () => {
    const forced = { fs: { readTextFile: false, writeTextFile: false }, terminal: false };
    expect(clientCapabilities(undefined)).toEqual(forced);
    expect(clientCapabilities({ session: { compaction: true } })).toEqual(forced);
    expect(clientCapabilities({ _meta: { "com.maetek.agent86/state": "yes" } })).toEqual(forced);
    expect(clientCapabilities({ session: "all", _meta: [] })).toEqual(forced);
  });
});

describe("the session list's folder marker", () => {
  const known = { sessionId: "s-known", cwd: "/work", title: "known folder" };
  const markedNew = {
    sessionId: "s-new",
    cwd: "/where/agent86/started",
    _meta: { agent86: { cwdKnown: false }, "com.maetek.agent86/cwdKnown": false },
  };
  const markedOld = { sessionId: "s-old", cwd: "/where", _meta: { agent86: { cwdKnown: false } } };

  it("reads the namespaced key first, then the old one", () => {
    expect(cwdKnown(known)).toBe(true);
    expect(cwdKnown(markedNew)).toBe(false);
    expect(cwdKnown(markedOld)).toBe(false);
    // The namespaced key wins over the old one.
    expect(
      cwdKnown({ _meta: { "com.maetek.agent86/cwdKnown": true, agent86: { cwdKnown: false } } }),
    ).toBe(true);
    expect(cwdKnown({ _meta: { agent86: "odd" } })).toBe(true);
  });

  it("leaves sessions of unknown folder out of a workspace's list", () => {
    expect(workspaceSessions([known, markedNew, markedOld]).map((s) => s.sessionId)).toEqual([
      "s-known",
    ]);
    expect(workspaceSessions(undefined)).toEqual([]);
    expect(workspaceSessions([{ cwd: "/no-id" }, known])).toEqual([known]);
  });
});

describe("relaying agent86 1.0.20", () => {
  let bridge: RunningBridge;
  let root: string;
  let record: string;

  beforeEach(async () => {
    const base = realpathSync.native(mkdtempSync(join(tmpdir(), "agent86-web-1020-")));
    root = base;
    record = join(base, "record.jsonl");
    process.env.MOCK_AGENT86_VERSION = "1.0.20";
    process.env.MOCK_AGENT86_RECORD = record;
    process.env.MOCK_AGENT86_DB = join(base, "sessions.json");
    bridge = await startBridge({
      roots: [root],
      host: "127.0.0.1",
      port: 0,
      agent86: { command: mockAgentCommand(), version: "1.0.20", args: [] },
      publicDir: base,
      stateDir: join(base, "state"),
    });
  });

  afterEach(async () => {
    await bridge.close();
    delete process.env.MOCK_AGENT86_VERSION;
    delete process.env.MOCK_AGENT86_RECORD;
    delete process.env.MOCK_AGENT86_DB;
  });

  it("passes the opt-ins to agent86 and relays usage and state events unchanged", async () => {
    const origin = `http://127.0.0.1:${bridge.port}`;
    const token = new URL(bridge.url).hash.replace("#token=", "");
    const login = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "x-agent86-web": "1" },
      body: JSON.stringify({ token }),
    });
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]!;
    const ws = new WebSocket(
      `ws://127.0.0.1:${bridge.port}/acp/t1?workspace=${encodeURIComponent(root)}`,
      { headers: { origin, cookie } },
    );
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    const frames: string[] = [];
    ws.on("message", (data) => frames.push(data.toString()));
    const reply = (id: number) =>
      new Promise<Record<string, unknown>>((resolve) => {
        const check = () => {
          const found = frames.map((f) => JSON.parse(f)).find((m) => m.id === id);
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
      params: {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          session: { compaction: {} },
          _meta: { "com.maetek.agent86/state": true },
        },
      },
    });
    const init = await reply(1);
    expect(init.result).toMatchObject({
      agentCapabilities: { _meta: { "com.maetek.agent86/state": { version: 1 } } },
    });
    send({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: root, mcpServers: [] } });
    const sessionId = ((await reply(2)).result as { sessionId: string }).sessionId;
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "hello" }] },
    });
    await reply(3);
    ws.close();

    // agent86 got the opt-ins, and files and terminal stayed off.
    const asked = readFileSync(record, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { method: string; params: { clientCapabilities?: unknown } })
      .find((m) => m.method === "initialize");
    // (The mock records what its ACP library parsed, which fills in defaults such as `auth`.)
    expect(asked?.params.clientCapabilities).toMatchObject({
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
      session: { compaction: {} },
      _meta: { "com.maetek.agent86/state": true },
    });

    // The new messages reach the browser as agent86 wrote them, unknown fields and kinds included.
    type Frame = {
      method?: string;
      params: {
        update?: { sessionUpdate?: string };
        event: { kind: string; some_future_field?: unknown };
      };
    };
    const messages = frames.map((f) => JSON.parse(f) as Frame);
    const usage = messages.find((m) => m.params?.update?.sessionUpdate === "usage_update");
    expect(usage?.params.update).toEqual({
      sessionUpdate: "usage_update",
      used: 1200,
      size: 200000,
      cost: { amount: 0.0125, currency: "USD" },
    });
    const events = messages.filter((m) => m.method === "_com.maetek.agent86/session/event");
    expect(events.map((e) => e.params.event.kind)).toEqual([
      "a_kind_from_the_future",
      "model_call",
    ]);
    expect(events[1]!.params.event.some_future_field).toEqual({ ignored: true });
  });
});
