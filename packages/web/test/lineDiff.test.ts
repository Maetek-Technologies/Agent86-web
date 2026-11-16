import { describe, expect, it } from "vitest";
import { diffLines, fileDiff, MAX_EDITS, splitLines } from "../src/tools/lineDiff.ts";

const kinds = (d: ReturnType<typeof fileDiff>) => d.lines.map((l) => `${l.kind[0]}${l.text}`);

describe("splitLines", () => {
  it("treats a final newline as the end of the last line", () => {
    expect(splitLines("")).toEqual([]);
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\nb")).toEqual(["a", "b"]);
    expect(splitLines("\n")).toEqual([""]);
  });
});

describe("fileDiff", () => {
  it("shows an edit as a removed and an added line, numbered", () => {
    const d = fileDiff("/w/README.md", "Teh quick brown fox\n", "The quick brown fox\n");
    expect(d).toMatchObject({ newPath: "/w/README.md", added: 1, removed: 1 });
    expect(kinds(d)).toEqual(["h@@ -1,1 +1,1 @@", "dTeh quick brown fox", "aThe quick brown fox"]);
    expect(d.lines[1]).toMatchObject({ oldLine: 1 });
    expect(d.lines[2]).toMatchObject({ newLine: 1 });
  });

  it("shows a new file (no old text) as all added", () => {
    const d = fileDiff("/w/notes.txt", null, "first line\nsecond line\n");
    expect(d).toMatchObject({ added: 2, removed: 0 });
    expect(kinds(d)).toEqual(["h@@ -0,0 +1,2 @@", "afirst line", "asecond line"]);
  });

  it("has nothing to show for identical texts", () => {
    const d = fileDiff("/w/a", "x\ny\n", "x\ny\n");
    expect(d).toMatchObject({ added: 0, removed: 0 });
    expect(d.lines.every((l) => l.kind === "context")).toBe(true);
  });

  it("folds unchanged lines into hunks with three lines of context, or shows all with full", () => {
    const before = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const after = [...before];
    after[1] = "changed 2";
    after[25] = "changed 26";
    const d = fileDiff("/w/a", before.join("\n") + "\n", after.join("\n") + "\n");
    const hunks = d.lines.filter((l) => l.kind === "hunk").map((l) => l.text);
    expect(hunks).toEqual(["@@ -1,5 +1,5 @@", "@@ -23,7 +23,7 @@"]);
    expect(d.lines.filter((l) => l.kind === "context")).toHaveLength(4 + 6);
    const full = fileDiff("/w/a", before.join("\n") + "\n", after.join("\n") + "\n", {
      full: true,
    });
    expect(full.lines.filter((l) => l.kind === "hunk")).toHaveLength(0);
    expect(full.lines.filter((l) => l.kind === "context")).toHaveLength(28);
  });

  it("finds the smallest change in the middle of a file", () => {
    const ops = diffLines(["a", "b", "c", "d", "e"], ["a", "c", "x", "d", "e"]);
    expect(ops.map((o) => `${o.kind[0]}${o.text}`)).toEqual(["sa", "db", "sc", "ax", "sd", "se"]);
  });

  it("compares carriage returns but does not draw them", () => {
    const d = fileDiff("/w/a", "one\r\ntwo\r\n", "one\ntwo\r\n");
    expect(kinds(d)).toEqual(["h@@ -1,2 +1,2 @@", "done", "aone", "ctwo"]);
  });

  it("notes a change to the final newline", () => {
    expect(kinds(fileDiff("/w/a", "a\n", "a")).at(-1)).toBe(
      String.raw`m\ No newline at end of file`,
    );
  });

  it("shows a near-total rewrite of a large file as one replaced block, quickly", () => {
    const n = MAX_EDITS * 2;
    const before = Array.from({ length: n }, (_, i) => `old ${i}`).join("\n");
    const after = Array.from({ length: n }, (_, i) => `new ${i}`).join("\n");
    const started = Date.now();
    const d = fileDiff("/w/big", before, after);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(d).toMatchObject({ added: n, removed: n });
  });
});
