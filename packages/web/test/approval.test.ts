import { describe, expect, it } from "vitest";
import {
  argumentSummary,
  isUnifiedDiff,
  parseApprovalText,
  parseUnifiedDiff,
  splitResult,
  toolName,
} from "../src/tools/approval.ts";
import { languageForPath, normalizeLanguage } from "../src/highlight/languages.ts";

// The texts below are what agent86 1.0.15 sends, recorded from the real binary.
const EDIT =
  "--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-Teh quick brown fox\n+The quick brown fox";
const SKILL =
  "Warning: This writes agent86's own configuration or skills (.agent86/skills/demo/SKILL.md), which changes what agent86 runs or is told from now on. Asked even in auto mode.\n\nnew file: .agent86/skills/demo/SKILL.md (5 lines)\n---\nname: demo\ndescription: A demo skill.\n---\nSay hi.\n";

describe("parseApprovalText", () => {
  it("reads an edit as a diff", () => {
    expect(parseApprovalText(EDIT, "edit_file")).toEqual({ detail: { type: "diff", diff: EDIT } });
  });

  it("reads the warning and a new file", () => {
    expect(parseApprovalText(SKILL, "write_file")).toEqual({
      warning: expect.stringContaining("agent86's own configuration or skills"),
      detail: {
        type: "new-file",
        path: ".agent86/skills/demo/SKILL.md",
        lines: 5,
        content: "---\nname: demo\ndescription: A demo skill.\n---\nSay hi.\n",
      },
    });
  });

  it("reads commands and code by tool", () => {
    expect(parseApprovalText("echo hi", "run_command").detail).toEqual({
      type: "code",
      language: "bash",
      code: "echo hi",
    });
    expect(parseApprovalText("print(1)", "python_exec").detail).toEqual({
      type: "code",
      language: "python",
      code: "print(1)",
    });
    expect(parseApprovalText('{"url": "x"}', "web_fetch").detail).toEqual({
      type: "text",
      text: '{"url": "x"}',
    });
  });

  it("does not take a warning-like line that is not a paragraph", () => {
    expect(parseApprovalText("Warning: inline only", "run_command").warning).toBeUndefined();
  });
});

describe("parseUnifiedDiff", () => {
  it("numbers lines and counts changes", () => {
    const parsed = parseUnifiedDiff(
      "--- a/src/x.ts\n+++ b/src/x.ts\n@@ -3,3 +3,4 @@\n keep\n-old\n+new\n+added\n tail\n\\ No newline at end of file\n",
    );
    expect(parsed.oldPath).toBe("src/x.ts");
    expect(parsed.newPath).toBe("src/x.ts");
    expect(parsed.added).toBe(2);
    expect(parsed.removed).toBe(1);
    expect(parsed.lines).toEqual([
      { kind: "hunk", text: "@@ -3,3 +3,4 @@" },
      { kind: "context", text: "keep", oldLine: 3, newLine: 3 },
      { kind: "del", text: "old", oldLine: 4 },
      { kind: "add", text: "new", newLine: 4 },
      { kind: "add", text: "added", newLine: 5 },
      { kind: "context", text: "tail", oldLine: 5, newLine: 6 },
      { kind: "meta", text: "\\ No newline at end of file" },
    ]);
  });
});

describe("splitResult", () => {
  it("separates agent86's edit message from its diff", () => {
    expect(splitResult(`Edited README.md (1 replacement).\n${EDIT}`)).toEqual({
      message: "Edited README.md (1 replacement).",
      diff: EDIT,
    });
    expect(splitResult("exit code: 0\nstdout:\nhi\n")).toEqual({
      message: "exit code: 0\nstdout:\nhi\n",
    });
    expect(isUnifiedDiff("--- not a diff")).toBe(false);
  });
});

describe("summaries and names", () => {
  it("summarizes arguments by tool", () => {
    expect(argumentSummary("run_command", { command: "ls -la\nsecond" })).toBe("ls -la");
    expect(argumentSummary("python_exec", { code: "print(1)" })).toBe("print(1)");
    expect(argumentSummary("edit_file", { path: "README.md", old_string: "a" })).toBe("README.md");
    expect(argumentSummary("web_fetch", { url: "https://x.test" })).toBe("https://x.test");
    expect(argumentSummary("other", { a: 1 })).toBe('{"a":1}');
    expect(argumentSummary("other", undefined)).toBe("");
  });

  it("takes the tool name from the entry or its title", () => {
    expect(toolName({ name: "edit_file", title: "x" })).toBe("edit_file");
    expect(toolName({ title: 'run_command({"command": "ls"})' })).toBe("run_command");
    expect(toolName({ title: "plain" })).toBe("plain");
  });

  it("maps paths and fence names to languages", () => {
    expect(languageForPath("src/app.tsx")).toBe("typescript");
    expect(languageForPath("Dockerfile")).toBe("dockerfile");
    expect(languageForPath("README")).toBeUndefined();
    expect(normalizeLanguage("Shell")).toBe("bash");
    expect(normalizeLanguage("rust")).toBe("rust");
    expect(normalizeLanguage(undefined)).toBeUndefined();
  });
});
