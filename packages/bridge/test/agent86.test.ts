import { describe, expect, it } from "vitest";
import { Agent86Error, compareVersions, detectAgent86, parseVersion } from "../src/agent86.ts";
import { mockAgentCommand } from "./helpers.ts";

describe("parseVersion", () => {
  it.each([
    ["agent86 1.0.15\n", "1.0.15"],
    ["agent86 v1.2.3", "1.2.3"],
    ["agent86 1.0.16-rc.1", "1.0.16-rc.1"],
    ["something else 1.0.0", undefined],
  ])("%j → %s", (output, expected) => {
    expect(parseVersion(output)).toBe(expected);
  });
});

describe("compareVersions", () => {
  it("orders numerically", () => {
    expect(compareVersions("1.0.9", "1.0.15")).toBe(-1);
    expect(compareVersions("1.0.15", "1.0.15")).toBe(0);
    expect(compareVersions("1.1.0", "1.0.15")).toBe(1);
  });
});

describe("detectAgent86", () => {
  it("accepts a supported version", async () => {
    await expect(detectAgent86(mockAgentCommand())).resolves.toBe("1.0.15");
  });

  it("refuses an old version and says how to update", async () => {
    const command = mockAgentCommand();
    process.env.MOCK_AGENT86_VERSION = "1.0.14";
    try {
      await expect(detectAgent86(command)).rejects.toThrow(
        /too old.*npm install -g agent86@latest/,
      );
    } finally {
      delete process.env.MOCK_AGENT86_VERSION;
    }
  });

  it("explains a missing agent86", async () => {
    const error = await detectAgent86("agent86-does-not-exist-xyz").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Agent86Error);
    expect((error as Error).message).toMatch(/not found|exited/);
  });
});
