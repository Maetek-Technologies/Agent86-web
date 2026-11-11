import { describe, expect, it } from "vitest";
import { safeUrl, splitBlocks } from "../src/markdown/blocks.ts";

describe("splitBlocks", () => {
  it("splits at blank lines", () => {
    expect(splitBlocks("# Title\n\nPara one\nstill one\n\n\n- a\n- b")).toEqual([
      "# Title",
      "Para one\nstill one",
      "- a\n- b",
    ]);
  });

  it("keeps a fenced code block with blank lines together, even unfinished", () => {
    const md = "Intro\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nAfter";
    expect(splitBlocks(md)).toEqual(["Intro", "```ts\nconst a = 1;\n\nconst b = 2;\n```", "After"]);
    expect(splitBlocks("```\nopen\n\nstill open")).toEqual(["```\nopen\n\nstill open"]);
  });

  it("only closes a fence with the same marker", () => {
    expect(splitBlocks("~~~\n```\n\n~~~\n\nx")).toEqual(["~~~\n```\n\n~~~", "x"]);
  });

  it("returns nothing for empty text", () => {
    expect(splitBlocks("")).toEqual([]);
    expect(splitBlocks("\n\n")).toEqual([]);
  });
});

describe("safeUrl", () => {
  it.each([
    ["https://example.com", "https://example.com"],
    ["http://x.test/a?b", "http://x.test/a?b"],
    ["mailto:a@b.c", "mailto:a@b.c"],
    ["javascript:alert(1)", undefined],
    ["JAVASCRIPT:alert(1)", undefined],
    ["data:text/html,<script>", undefined],
    ["vbscript:x", undefined],
    ["/relative", undefined],
    ["", undefined],
  ])("%s → %s", (url, expected) => {
    expect(safeUrl(url)).toBe(expected);
  });
});
