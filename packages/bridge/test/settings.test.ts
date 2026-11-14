// agent86-web's own settings: the saved port and the default approval mode.
import { createServer } from "node:net";
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
import { startBridge, type RunningBridge } from "../src/server.ts";
import { portProblem, resolvePort, SettingsStore } from "../src/settings.ts";
import { mockAgentCommand } from "./helpers.ts";

let base: string;
let stateDir: string;

beforeEach(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), "agent86-web-settings-")));
  stateDir = join(base, "state");
});

describe("SettingsStore", () => {
  it("reads nothing before anything is saved", () => {
    expect(new SettingsStore(stateDir).read()).toEqual({});
  });

  it("saves and forgets the port and the default mode", () => {
    const store = new SettingsStore(stateDir);
    expect(store.update({ port: 4321 })).toEqual({ port: 4321 });
    expect(store.update({ defaultMode: "deny" })).toEqual({ port: 4321, defaultMode: "deny" });
    expect(new SettingsStore(stateDir).read()).toEqual({ port: 4321, defaultMode: "deny" });
    expect(store.update({ port: null })).toEqual({ defaultMode: "deny" });
    expect(store.update({ defaultMode: null })).toEqual({});
  });

  it("refuses values that are not a port or a mode", () => {
    const store = new SettingsStore(stateDir);
    expect(() => store.update({ port: 0 })).toThrow(/port/);
    expect(() => store.update({ port: 70000 })).toThrow(/port/);
    expect(() => store.update({ defaultMode: "yolo" as "ask" })).toThrow(/mode/);
    expect(store.read()).toEqual({});
  });

  it("ignores a damaged file and values out of range", () => {
    const store = new SettingsStore(stateDir);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(store.file, "{ not json");
    expect(store.read()).toEqual({});
    writeFileSync(store.file, JSON.stringify({ port: "4321", defaultMode: "everything" }));
    expect(store.read()).toEqual({});
    writeFileSync(store.file, JSON.stringify({ port: 1.5, defaultMode: "auto" }));
    expect(store.read()).toEqual({ defaultMode: "auto" });
  });

  it.skipIf(process.platform === "win32")("writes the file readable only by the user", () => {
    const store = new SettingsStore(stateDir);
    store.update({ port: 4321 });
    expect(statSync(store.file).mode & 0o777).toBe(0o600);
  });
});

describe("resolvePort", () => {
  it("prefers --port, then AGENT86_WEB_PORT, then the saved port, then any free port", () => {
    expect(resolvePort("5000", "6000", 7000)).toEqual({ port: 5000, source: "--port" });
    expect(resolvePort(undefined, "6000", 7000)).toEqual({
      port: 6000,
      source: "AGENT86_WEB_PORT",
    });
    expect(resolvePort(undefined, "", 7000)).toEqual({ port: 7000, source: "settings" });
    expect(resolvePort(undefined, undefined, undefined)).toEqual({ port: 0, source: "default" });
  });

  it("lets --port 0 ask for any free port over a saved one", () => {
    expect(resolvePort("0", undefined, 7000)).toEqual({ port: 0, source: "--port" });
  });

  it("refuses values that are not ports", () => {
    expect(resolvePort("http", undefined, undefined)).toEqual({
      error: "--port must be a number from 0 to 65535",
    });
    expect(resolvePort(undefined, "70000", undefined)).toEqual({
      error: "AGENT86_WEB_PORT must be a number from 0 to 65535",
    });
    expect(resolvePort(" ", undefined, undefined)).toHaveProperty("error");
  });
});

describe("portProblem", () => {
  it("says where a busy port came from and how to get past it", () => {
    const saved = portProblem(
      4321,
      "settings",
      "EADDRINUSE",
      "/home/me/.agent86-web/settings.json",
    );
    expect(saved).toContain("port 4321 (saved in /home/me/.agent86-web/settings.json)");
    expect(saved).toContain("already in use");
    expect(saved).toContain("--port 0");
    expect(saved).toContain("agent86-web --port 0 --save-port");
    const flag = portProblem(4321, "--port", "EADDRINUSE", "x");
    expect(flag).toContain("(from --port)");
    expect(flag).not.toContain("--save-port");
  });
});

describe("the bridge", () => {
  let bridge: RunningBridge | undefined;
  let origin: string;
  let cookie: string;

  const start = async (port = 0) => {
    bridge = await startBridge({
      roots: [base],
      host: "127.0.0.1",
      port,
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
  };

  afterEach(async () => {
    await bridge?.close();
    bridge = undefined;
  });

  const info = async () =>
    (await (await fetch(`${origin}/api/info`, { headers: { cookie } })).json()) as {
      settings: { defaultMode: string | null; port: number | null };
    };

  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${origin}/api/settings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie,
        "x-agent86-web": "1",
        ...headers,
      },
      body: JSON.stringify(body),
    });

  it("saves the default mode from the page and reports it in /api/info", async () => {
    await start();
    expect((await info()).settings).toEqual({ defaultMode: null, port: null });
    const res = await post({ defaultMode: "auto" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ defaultMode: "auto" });
    expect((await info()).settings).toEqual({ defaultMode: "auto", port: null });
    expect(JSON.parse(readFileSync(join(stateDir, "settings.json"), "utf8"))).toEqual({
      defaultMode: "auto",
    });
    expect(await (await post({ defaultMode: null })).json()).toEqual({ defaultMode: null });
    expect((await info()).settings).toEqual({ defaultMode: null, port: null });
  });

  it("reports the saved port, for the Settings section", async () => {
    new SettingsStore(stateDir).update({ port: 4321 });
    await start(); // On port 0: the CLI, not startBridge, reads the saved port.
    expect((await info()).settings).toEqual({ defaultMode: null, port: 4321 });
  });

  it("refuses an unknown mode, and the port, from the page", async () => {
    await start();
    expect((await post({ defaultMode: "everything" })).status).toBe(400);
    expect((await post({ port: 80 })).status).toBe(400);
    expect(new SettingsStore(stateDir).read()).toEqual({});
  });

  it("refuses to change settings without the sign-in cookie, our Origin, or the CSRF header", async () => {
    await start();
    expect((await post({ defaultMode: "auto" }, { cookie: "" })).status).toBe(401);
    expect((await post({ defaultMode: "auto" }, { origin: "http://evil.example" })).status).toBe(
      403,
    );
    expect((await post({ defaultMode: "auto" }, { "x-agent86-web": "" })).status).toBe(403);
    expect(new SettingsStore(stateDir).read()).toEqual({});
  });

  it("fails to start on a port that is in use, with EADDRINUSE", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const taken = (blocker.address() as { port: number }).port;
    try {
      await expect(start(taken)).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });
});
