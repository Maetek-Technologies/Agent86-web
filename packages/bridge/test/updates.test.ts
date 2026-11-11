import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { startBridge } from "../src/server.ts";
import { checkForUpdates, updateCheckDisabled } from "../src/updates.ts";
import { mockAgentCommand } from "./helpers.ts";

const state = () => mkdtempSync(join(tmpdir(), "agent86-web-updates-"));
const current = { agent86: "1.0.15", agent86Web: "0.1.0" };

describe("checkForUpdates", () => {
  it("reports only products with a newer release", async () => {
    const latestVersion = vi.fn(async (pkg: string) => (pkg === "agent86" ? "1.0.16" : "0.1.0"));
    expect(await checkForUpdates({ current, stateDir: state(), latestVersion })).toEqual({
      agent86: "1.0.16",
    });
    expect(latestVersion).toHaveBeenCalledWith("agent86");
    expect(latestVersion).toHaveBeenCalledWith("agent86-web");
  });

  it("asks the registry at most once a day", async () => {
    const dir = state();
    let now = 1_000_000;
    const latestVersion = vi.fn(async () => "9.9.9");
    await checkForUpdates({ current, stateDir: dir, latestVersion, now: () => now });
    now += 60 * 60 * 1000;
    expect(
      await checkForUpdates({ current, stateDir: dir, latestVersion, now: () => now }),
    ).toEqual({
      agent86: "9.9.9",
      agent86Web: "9.9.9",
    });
    expect(latestVersion).toHaveBeenCalledTimes(2); // both packages, once
    now += 24 * 60 * 60 * 1000;
    await checkForUpdates({ current, stateDir: dir, latestVersion, now: () => now });
    expect(latestVersion).toHaveBeenCalledTimes(4);
  });

  it("says nothing when the registry cannot be reached or the cache is broken", async () => {
    const dir = state();
    writeFileSync(join(dir, "update-check.json"), "{not json");
    expect(
      await checkForUpdates({ current, stateDir: dir, latestVersion: async () => undefined }),
    ).toEqual({});
  });

  it("is turned off by AGENT86_WEB_NO_UPDATE_CHECK", () => {
    expect(updateCheckDisabled({ AGENT86_WEB_NO_UPDATE_CHECK: "1" })).toBe(true);
    expect(updateCheckDisabled({ AGENT86_WEB_NO_UPDATE_CHECK: "true" })).toBe(true);
    expect(updateCheckDisabled({ AGENT86_WEB_NO_UPDATE_CHECK: "0" })).toBe(false);
    expect(updateCheckDisabled({})).toBe(false);
  });
});

describe("/api/info", () => {
  it("carries the updates the background check found", async () => {
    const bridge = await startBridge({
      roots: [tmpdir()],
      host: "127.0.0.1",
      port: 0,
      agent86: { command: mockAgentCommand(), version: "1.0.15", args: [] },
      publicDir: tmpdir(),
      stateDir: state(),
      updateCheck: true,
      latestVersion: async (pkg) => (pkg === "agent86-web" ? "0.2.0" : "1.0.15"),
    });
    try {
      const origin = `http://127.0.0.1:${bridge.port}`;
      const token = new URL(bridge.url).hash.replace("#token=", "");
      const login = await fetch(`${origin}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, "x-agent86-web": "1" },
        body: JSON.stringify({ token }),
      });
      const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]!;
      let info: { updates: Record<string, string> } = { updates: {} };
      for (let i = 0; i < 50 && !info.updates.agent86Web; i++) {
        info = (await (
          await fetch(`${origin}/api/info`, { headers: { cookie } })
        ).json()) as typeof info;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(info.updates).toEqual({ agent86Web: "0.2.0" });
    } finally {
      await bridge.close();
    }
  });
});
