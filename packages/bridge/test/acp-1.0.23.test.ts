// The bridge and agent86 1.0.22 and 1.0.23: the memory and secret requests are relayed, the
// browser's secrets claim reaches agent86, agent86's `secret/request` and its answer get through,
// one that no page can answer is declined, and no secret's value is written anywhere the bridge
// writes: its log, its state directory, or its opt-in transcript (where it is `<hidden>`).
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startBridge, type RunningBridge } from "../src/server.ts";
import { mockAgentCommand } from "./helpers.ts";

/** Values typed as secrets in these tests; none may appear in anything the bridge wrote. */
const SET_VALUE = "sk_bridge_test_SET_4f1d9a";
const ENTERED_VALUE = "sk_bridge_test_ENTERED_7c2e0b";

type Frame = Record<string, unknown>;

/** Every file under `dir`, recursively. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("relaying agent86 1.0.22 and 1.0.23", () => {
  let bridge: RunningBridge;
  let root: string;
  let record: string;
  let transcript: string;
  let stateDir: string;
  const logs: string[] = [];

  beforeEach(async () => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), "agent86-web-1023-")));
    // The mock's own files (its sessions, memory, and stand-in keyring) are agent86's, not the
    // bridge's, so they live apart from the workspace and the bridge's state.
    const agentFiles = mkdtempSync(join(tmpdir(), "agent86-web-1023-agent-"));
    record = join(agentFiles, "record.jsonl");
    transcript = join(mkdtempSync(join(tmpdir(), "agent86-web-1023-tx-")), "transcript.log");
    stateDir = mkdtempSync(join(tmpdir(), "agent86-web-1023-state-"));
    process.env.MOCK_AGENT86_VERSION = "1.0.23";
    process.env.MOCK_AGENT86_RECORD = record;
    process.env.MOCK_AGENT86_DB = join(agentFiles, "sessions.json");
    logs.length = 0;
    cookie = undefined;
    bridge = await startBridge({
      roots: [root],
      host: "127.0.0.1",
      port: 0,
      agent86: { command: mockAgentCommand(), version: "1.0.23", args: [] },
      publicDir: root,
      stateDir,
      transcript,
      log: (line) => logs.push(line),
    });
  });

  afterEach(async () => {
    await bridge.close();
    delete process.env.MOCK_AGENT86_VERSION;
    delete process.env.MOCK_AGENT86_RECORD;
    delete process.env.MOCK_AGENT86_DB;
  });

  let cookie: string | undefined;

  async function connect(clientCapabilities: Frame) {
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
    const frames: Frame[] = [];
    ws.on("message", (data) => frames.push(JSON.parse(data.toString()) as Frame));
    const waitFor = (match: (m: Frame) => boolean) =>
      new Promise<Frame>((resolve) => {
        const check = () => {
          const found = frames.find(match);
          if (found) resolve(found);
          else setTimeout(check, 10);
        };
        check();
      });
    const reply = (id: number) => waitFor((m) => m.id === id && m.method === undefined);
    let nextId = 1;
    const send = (m: unknown) => ws.send(JSON.stringify(m));
    const request = async (method: string, params: Frame) => {
      const id = nextId++;
      send({ jsonrpc: "2.0", id, method, params });
      return reply(id);
    };
    const init = await request("initialize", { protocolVersion: 1, clientCapabilities });
    return { ws, frames, send, request, waitFor, init };
  }

  const recorded = () =>
    readFileSync(record, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { method: string; params: Frame });

  it("passes the secrets claim to agent86, and agent86's advertisements back unchanged", async () => {
    const page = await connect({
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
      _meta: {
        "com.maetek.agent86/state": true,
        "com.maetek.agent86/secrets": { maskedEntry: true },
        "com.example/other": true,
      },
    });
    expect(page.init.result).toMatchObject({
      agentCapabilities: {
        _meta: {
          "com.maetek.agent86/memory": { version: 1 },
          "com.maetek.agent86/secrets": { version: 1 },
        },
      },
    });
    const init = recorded().find((m) => m.method === "initialize")!;
    // (The SDK on agent86's side fills in defaults such as `auth`; the bridge sent only these.)
    const caps = init.params.clientCapabilities as Frame;
    expect(caps).toMatchObject({
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    });
    expect(caps._meta).toEqual({
      "com.maetek.agent86/state": true,
      "com.maetek.agent86/secrets": true,
    });
    page.ws.close();
  });

  it("relays memory list, pin, and forget, and agent86's refusal during a turn", async () => {
    const page = await connect({ _meta: { "com.maetek.agent86/state": true } });
    const created = await page.request("session/new", { cwd: root, mcpServers: [] });
    const sessionId = (created.result as { sessionId: string }).sessionId;
    expect((await page.request("_com.maetek.agent86/memory/list", { sessionId })).result).toEqual({
      entries: [],
    });
    await page.request("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: "remember that the build uses pnpm" }],
    });
    const listed = await page.request("_com.maetek.agent86/memory/list", { sessionId });
    const entries = (listed.result as { entries: { id: number; text: string }[] }).entries;
    expect(entries).toEqual([
      expect.objectContaining({ kind: "fact", text: "the build uses pnpm", pinned: false }),
    ]);
    const id = entries[0]!.id;
    const pinned = await page.request("_com.maetek.agent86/memory/pin", {
      sessionId,
      kind: "fact",
      id,
    });
    expect(pinned.result).toMatchObject({ entry: { id, pinned: true } });
    expect(
      (await page.request("_com.maetek.agent86/memory/forget", { sessionId, kind: "fact", id }))
        .result,
    ).toEqual({});
    expect(
      (await page.request("_com.maetek.agent86/memory/forget", { sessionId, kind: "fact", id }))
        .error,
    ).toMatchObject({ code: -32002 });

    // During a turn agent86 refuses; the bridge relays the refusal, it does not invent one.
    page.send({
      jsonrpc: "2.0",
      id: 90,
      method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "slow" }] },
    });
    await page.waitFor((m) => m.method === "session/update");
    const busy = await page.request("_com.maetek.agent86/memory/list", { sessionId });
    expect(busy.error).toMatchObject({ code: -32600 });
    page.send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } });
    await page.waitFor((m) => m.id === 90);
    page.ws.close();
  });

  it("relays secrets both ways and writes no value to its log, state, or transcript", async () => {
    const page = await connect({
      _meta: { "com.maetek.agent86/state": true, "com.maetek.agent86/secrets": true },
    });
    const created = await page.request("session/new", { cwd: root, mcpServers: [] });
    const sessionId = (created.result as { sessionId: string }).sessionId;

    const set = await page.request("_com.maetek.agent86/secret/set", {
      sessionId,
      name: "API_TOKEN",
      value: SET_VALUE,
    });
    expect(set.result).toEqual({ name: "API_TOKEN", remembered: false });
    // A refused value is not repeated in the error either (agent86's rule, relayed as is).
    const short = await page.request("_com.maetek.agent86/secret/set", {
      sessionId,
      name: "API_TOKEN",
      value: "short",
    });
    expect(short.error).toMatchObject({ code: -32602 });
    expect(JSON.stringify(short)).not.toContain('short"');

    // The model asks; the page answers with what the user typed.
    page.send({
      jsonrpc: "2.0",
      id: 50,
      method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "ask for a secret" }] },
    });
    const ask = await page.waitFor((m) => m.method === "_com.maetek.agent86/secret/request");
    expect(ask.params).toEqual({
      sessionId,
      name: "STRIPE_KEY",
      reason: "to create the webhook",
      replacing: false,
      canRemember: true,
      remembered: false,
    });
    page.send({
      jsonrpc: "2.0",
      id: ask.id,
      result: { outcome: "entered", value: ENTERED_VALUE, remember: false },
    });
    expect((await page.waitFor((m) => m.id === 50 && m.method === undefined)).result).toEqual({
      stopReason: "end_turn",
    });
    // agent86 got the answer (the mock records it with the value hidden).
    expect(recorded().find((m) => m.method === "secret answer")?.params).toEqual({
      outcome: "entered",
      value: "<hidden>",
      remember: false,
    });

    // Its output shows the placeholder, never the value.
    page.send({
      jsonrpc: "2.0",
      id: 51,
      method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "use the secret" }] },
    });
    await page.waitFor((m) => m.id === 51 && m.method === undefined);
    const echoed = page.frames.filter((m) => JSON.stringify(m).includes("${secret:STRIPE_KEY}"));
    expect(echoed.length).toBeGreaterThan(0);

    const listed = await page.request("_com.maetek.agent86/secret/list", { sessionId });
    expect(listed.result).toEqual({
      secrets: [
        { name: "API_TOKEN", remembered: false },
        { name: "STRIPE_KEY", remembered: false },
      ],
      canRemember: true,
    });
    expect(
      (await page.request("_com.maetek.agent86/secret/forget", { sessionId, name: "API_TOKEN" }))
        .result,
    ).toEqual({ forgotten: true });
    page.ws.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Everything the bridge wrote: its log lines, its state directory, and the transcript.
    const written = [
      logs.join("\n"),
      ...filesUnder(stateDir).map((file) => readFileSync(file, "utf8")),
      readFileSync(transcript, "utf8"),
    ].join("\n");
    for (const value of [SET_VALUE, ENTERED_VALUE]) expect(written).not.toContain(value);
    // The transcript has both messages that carried a value, with it hidden.
    const lines = readFileSync(transcript, "utf8").trim().split("\n");
    expect(lines.some((l) => /^t1 C> .*secret\/set.*"value":"<hidden>"/.test(l))).toBe(true);
    expect(lines.some((l) => /^t1 C> .*"outcome":"entered","value":"<hidden>"/.test(l))).toBe(true);
    expect(logs.join("\n")).toContain("writing an ACP transcript");
  });

  it("declines a secret request when no page is there to answer it", async () => {
    const page = await connect({
      _meta: { "com.maetek.agent86/state": true, "com.maetek.agent86/secrets": true },
    });
    const created = await page.request("session/new", { cwd: root, mcpServers: [] });
    const sessionId = (created.result as { sessionId: string }).sessionId;
    page.send({
      jsonrpc: "2.0",
      id: 60,
      method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "ask for a secret" }] },
    });
    await page.waitFor((m) => m.method === "_com.maetek.agent86/secret/request");
    page.ws.close();
    for (let i = 0; i < 100 && !recorded().some((m) => m.method === "secret answer"); i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    expect(recorded().find((m) => m.method === "secret answer")?.params).toEqual({
      outcome: "declined",
    });
  });
});
