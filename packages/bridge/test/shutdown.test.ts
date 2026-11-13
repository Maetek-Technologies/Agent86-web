import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startBridge, type RunningBridge } from "../src/server.ts";
import { mockAgentCommand } from "./helpers.ts";

describe("POST /api/shutdown", () => {
  let base: string;
  let bridge: RunningBridge;
  let origin: string;
  let cookie: string;
  let requested: number;

  async function start(withCallback = true) {
    base = realpathSync.native(mkdtempSync(join(tmpdir(), "agent86-web-shutdown-")));
    requested = 0;
    bridge = await startBridge({
      roots: [base],
      host: "127.0.0.1",
      port: 0,
      agent86: { command: mockAgentCommand(), version: "1.0.17", args: [] },
      publicDir: base,
      stateDir: join(base, "state"),
      ...(withCallback ? { onShutdownRequested: () => requested++ } : {}),
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

  const shutdown = (headers: Record<string, string>, method = "POST") =>
    fetch(`${origin}/api/shutdown`, { method, headers });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  beforeEach(() => start());
  afterEach(() => bridge.close());

  it("asks the CLI to stop, after answering", async () => {
    const res = await shutdown({ cookie, origin, "x-agent86-web": "1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stopping: true });
    await settle();
    expect(requested).toBe(1);
  });

  it("is refused without a session, the origin, or the custom header", async () => {
    expect((await shutdown({ origin, "x-agent86-web": "1" })).status).toBe(401);
    expect(
      (await shutdown({ cookie, origin: "http://evil.example", "x-agent86-web": "1" })).status,
    ).toBe(403);
    expect((await shutdown({ cookie, origin })).status).toBe(403);
    expect((await shutdown({ cookie, origin, "x-agent86-web": "1" }, "GET")).status).toBe(405);
    await settle();
    expect(requested).toBe(0);
  });

  it("is refused when the bridge has no way to stop", async () => {
    await bridge.close();
    await start(false);
    expect((await shutdown({ cookie, origin, "x-agent86-web": "1" })).status).toBe(501);
  });
});
