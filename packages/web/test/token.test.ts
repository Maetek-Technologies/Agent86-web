import { describe, expect, it } from "vitest";
import { newThreadId, readLaunchToken } from "../src/token.ts";

describe("readLaunchToken", () => {
  it("reads a token from the fragment", () => {
    const token = "Ab3_-".repeat(9);
    expect(readLaunchToken(`#token=${token}`)).toBe(token);
    expect(readLaunchToken(`token=${token}`)).toBe(token);
  });

  it.each([
    "",
    "#",
    "#token=",
    "#token=short",
    "#token=has spaces in it ok",
    "#other=abcdefghijklmnopqrstu",
  ])("ignores %j", (hash) => {
    expect(readLaunchToken(hash)).toBeUndefined();
  });
});

describe("newThreadId", () => {
  it("makes ids the bridge accepts", () => {
    expect(newThreadId(() => "123e4567-e89b-12d3-a456-426614174000")).toBe(
      "123e4567-e89b-12d3-a456-426614174000",
    );
    expect(newThreadId(() => "a/b?c#d")).toBe("abcd");
    expect(newThreadId()).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });
});
