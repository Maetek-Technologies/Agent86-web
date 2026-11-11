// Reading what agent86 shows for a tool call. agent86 sends a permission request's detail as one
// text block (not ACP's structured diff): an optional "Warning: …" paragraph, then a unified diff
// (an edit), "new file: <path> (N lines)" and the content, a command, code, or the arguments.

export type Detail =
  | { type: "diff"; diff: string }
  | { type: "new-file"; path: string; lines: number; content: string }
  | { type: "code"; language: string; code: string }
  | { type: "text"; text: string };

export interface ApprovalText {
  warning?: string;
  detail: Detail;
}

const WARNING = /^Warning: ([\s\S]*?)\n\n/;
const NEW_FILE = /^new file: (.+) \((\d+) lines?\)\n?/;

/** Whether `text` begins like a unified diff. */
export function isUnifiedDiff(text: string): boolean {
  return /^--- .*\n\+\+\+ .*\n@@ /.test(text);
}

function detailFor(text: string, toolName: string | undefined): Detail {
  if (isUnifiedDiff(text)) return { type: "diff", diff: text };
  const newFile = NEW_FILE.exec(text);
  if (newFile) {
    return {
      type: "new-file",
      path: newFile[1]!,
      lines: Number(newFile[2]),
      content: text.slice(newFile[0].length),
    };
  }
  if (toolName === "run_command") return { type: "code", language: "bash", code: text };
  if (toolName === "python_exec") return { type: "code", language: "python", code: text };
  return { type: "text", text };
}

export function parseApprovalText(text: string, toolName: string | undefined): ApprovalText {
  const warning = WARNING.exec(text);
  const rest = warning ? text.slice(warning[0].length) : text;
  const detail = detailFor(rest, toolName);
  return warning ? { warning: warning[1]!, detail } : { detail };
}

/**
 * Split a tool result into its message and a diff after it, as agent86's edit and write results
 * read ("Edited README.md (1 replacement).\n--- a/README.md\n…").
 */
export function splitResult(output: string): { message: string; diff?: string } {
  const at = output.search(/\n--- .*\n\+\+\+ /);
  if (at < 0) return { message: output };
  const diff = output.slice(at + 1);
  return isUnifiedDiff(diff) ? { message: output.slice(0, at), diff } : { message: output };
}

export interface DiffLine {
  kind: "add" | "del" | "context" | "hunk" | "meta";
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface ParsedDiff {
  oldPath?: string;
  newPath?: string;
  lines: DiffLine[];
  added: number;
  removed: number;
}

const stripPrefix = (path: string) => path.replace(/^[ab]\//, "").replace(/\t.*$/, "");

/** Parse a unified diff into numbered lines. */
export function parseUnifiedDiff(diff: string): ParsedDiff {
  const result: ParsedDiff = { lines: [], added: 0, removed: 0 };
  let oldLine = 0;
  let newLine = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("--- ") && result.oldPath === undefined) {
      result.oldPath = stripPrefix(line.slice(4));
      continue;
    }
    if (line.startsWith("+++ ") && result.newPath === undefined) {
      result.newPath = stripPrefix(line.slice(4));
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      result.lines.push({ kind: "hunk", text: line });
    } else if (line.startsWith("+")) {
      result.lines.push({ kind: "add", text: line.slice(1), newLine: newLine++ });
      result.added++;
    } else if (line.startsWith("-")) {
      result.lines.push({ kind: "del", text: line.slice(1), oldLine: oldLine++ });
      result.removed++;
    } else if (line.startsWith("\\")) {
      result.lines.push({ kind: "meta", text: line });
    } else if (line.startsWith(" ") || (line === "" && result.lines.length > 0)) {
      result.lines.push({
        kind: "context",
        text: line.slice(1),
        oldLine: oldLine++,
        newLine: newLine++,
      });
    }
  }
  // A trailing newline in the diff text is not a context line.
  const last = result.lines.at(-1);
  if (last?.kind === "context" && last.text === "" && diff.endsWith("\n")) result.lines.pop();
  return result;
}

/** A one-line summary of a call's arguments, for the card header. */
export function argumentSummary(name: string | undefined, rawInput: unknown): string {
  if (typeof rawInput !== "object" || rawInput === null) return "";
  const input = rawInput as Record<string, unknown>;
  const first = (value: unknown) => (typeof value === "string" ? (value.split("\n")[0] ?? "") : "");
  switch (name) {
    case "run_command":
      return first(input.command);
    case "python_exec":
      return first(input.code);
    case "web_fetch":
      return first(input.url);
    default:
      if (typeof input.path === "string") return input.path;
      if (typeof input.query === "string") return input.query;
      return JSON.stringify(input);
  }
}

/** The tool name for a call agent86 reported: its `name`, or the start of its title. */
export function toolName(entry: { name?: string; title: string }): string {
  return entry.name ?? /^([\w.-]+)\(/.exec(entry.title)?.[1] ?? entry.title;
}
