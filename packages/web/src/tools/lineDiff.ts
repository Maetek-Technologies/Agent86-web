// A line diff between two texts, for file changes agent86 sends whole (ACP `diff` content: the
// file before and after). The result has the shape DiffView already draws for a unified diff.
import type { DiffLine, ParsedDiff } from "./approval.ts";

/** Lines of context kept around each change when folding unchanged lines. */
export const CONTEXT_LINES = 3;
/**
 * The most differences searched for before a change is shown as one replaced block. Bounds the
 * work (and memory, about MAX_EDITS² numbers) for a file that is almost entirely rewritten.
 */
export const MAX_EDITS = 2000;

type Op = { kind: "same" | "del" | "add"; text: string };

/** A text's lines. A final newline ends the last line rather than starting an empty one. */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/** Myers' O(ND) diff of two line lists, as a list of operations. */
function myers(a: string[], b: string[]): Op[] | undefined {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d] holds v[k] for k in -d..d after step d.
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    if (d > MAX_EDITS) return undefined;
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        trace.push(v.slice(offset - d, offset + d + 1));
        return backtrack(trace, a, b);
      }
    }
    trace.push(v.slice(offset - d, offset + d + 1));
  }
  return undefined;
}

function backtrack(trace: Int32Array[], a: string[], b: string[]): Op[] {
  const ops: Op[] = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d - 1]!;
    const at = (k: number) => prev[k + (d - 1)]!;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ kind: "same", text: a[--x]! });
      y--;
    }
    if (down) ops.push({ kind: "add", text: b[--y]! });
    else ops.push({ kind: "del", text: a[--x]! });
  }
  while (x > 0 && y > 0) {
    ops.push({ kind: "same", text: a[--x]! });
    y--;
  }
  return ops.reverse();
}

/** The operations turning `before` into `after`, unchanged lines included. */
export function diffLines(before: string[], after: string[]): Op[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end++;
  const a = before.slice(start, before.length - end);
  const b = after.slice(start, after.length - end);
  const middle = myers(a, b) ?? [
    ...a.map((text) => ({ kind: "del" as const, text })),
    ...b.map((text) => ({ kind: "add" as const, text })),
  ];
  return [
    ...before.slice(0, start).map((text) => ({ kind: "same" as const, text })),
    ...middle,
    ...before.slice(before.length - end).map((text) => ({ kind: "same" as const, text })),
  ];
}

/** Show a carriage return at a line's end as nothing; it is compared, not drawn. */
const shown = (text: string) => text.replace(/\r$/, "");

/**
 * A file change as numbered diff lines: hunks with CONTEXT_LINES of context, or every line with
 * `full`. `oldText` null is a new file.
 */
export function fileDiff(
  path: string,
  oldText: string | null,
  newText: string,
  options: { full?: boolean } = {},
): ParsedDiff {
  const ops = diffLines(splitLines(oldText ?? ""), splitLines(newText));
  const numbered: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.kind === "same") {
      numbered.push({
        kind: "context",
        text: shown(op.text),
        oldLine: oldLine++,
        newLine: newLine++,
      });
    } else if (op.kind === "del") {
      numbered.push({ kind: "del", text: shown(op.text), oldLine: oldLine++ });
      removed++;
    } else {
      numbered.push({ kind: "add", text: shown(op.text), newLine: newLine++ });
      added++;
    }
  }
  if (oldText !== null && oldText !== "" && !oldText.endsWith("\n") && newText.endsWith("\n")) {
    numbered.push({ kind: "meta", text: "\\ The old file had no newline at its end" });
  } else if (newText !== "" && !newText.endsWith("\n") && (oldText ?? "").endsWith("\n")) {
    numbered.push({ kind: "meta", text: "\\ No newline at end of file" });
  }
  const base = { oldPath: path, newPath: path, added, removed };
  if (options.full || added + removed === 0) return { ...base, lines: numbered };
  return { ...base, lines: fold(numbered) };
}

/** Keep the changed lines and CONTEXT_LINES around them, under `@@` headers. */
function fold(lines: DiffLine[]): DiffLine[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, i) => {
    if (line.kind === "context") return;
    for (
      let j = Math.max(0, i - CONTEXT_LINES);
      j <= Math.min(lines.length - 1, i + CONTEXT_LINES);
      j++
    )
      keep[j] = true;
  });
  const out: DiffLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!keep[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && keep[j]) j++;
    const hunk = lines.slice(i, j);
    const firstOld = hunk.find((l) => l.oldLine !== undefined)?.oldLine;
    const firstNew = hunk.find((l) => l.newLine !== undefined)?.newLine;
    const oldCount = hunk.filter((l) => l.kind === "context" || l.kind === "del").length;
    const newCount = hunk.filter((l) => l.kind === "context" || l.kind === "add").length;
    out.push({
      kind: "hunk",
      text: `@@ -${oldCount ? (firstOld ?? 0) : 0},${oldCount} +${newCount ? (firstNew ?? 0) : 0},${newCount} @@`,
    });
    out.push(...hunk);
    i = j;
  }
  return out;
}
