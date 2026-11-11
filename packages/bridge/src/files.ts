// Directory and file names for the workspace picker and @ mentions. Names only: the bridge never
// reads a file's contents for the browser (docs/SECURITY.md T7).
import { readdirSync, type Dirent } from "node:fs";
import { join, relative, sep } from "node:path";

/** Directories never listed or walked. */
const SKIPPED = new Set(["node_modules", "target", "__pycache__"]);
const hidden = (name: string) => name.startsWith(".") || SKIPPED.has(name);

function entries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** The subdirectories of `dir`, by name, without hidden ones. */
export function listDirectories(dir: string): { name: string; path: string }[] {
  return entries(dir)
    .filter((entry) => entry.isDirectory() && !hidden(entry.name))
    .map((entry) => ({ name: entry.name, path: join(dir, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const MAX_WALK = 5000;
const MAX_DEPTH = 8;

/** Workspace-relative paths of files under `root` (breadth first, bounded), with `/` separators. */
export function walkFiles(root: string): string[] {
  const files: string[] = [];
  let level = [root];
  for (let depth = 0; depth < MAX_DEPTH && level.length > 0 && files.length < MAX_WALK; depth++) {
    const next: string[] = [];
    for (const dir of level) {
      for (const entry of entries(dir)) {
        if (hidden(entry.name)) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) next.push(path);
        else if (entry.isFile()) files.push(relative(root, path).split(sep).join("/"));
        if (files.length >= MAX_WALK) break;
      }
    }
    level = next;
  }
  return files;
}

/** Files matching `query`, best first: a file name that starts with it, then one containing it. */
export function matchFiles(files: readonly string[], query: string, limit = 50): string[] {
  const q = query.toLowerCase();
  const scored: [number, string][] = [];
  for (const file of files) {
    const lower = file.toLowerCase();
    const base = lower.slice(lower.lastIndexOf("/") + 1);
    const score = !q
      ? 2
      : base.startsWith(q)
        ? 0
        : base.includes(q)
          ? 1
          : lower.includes(q)
            ? 2
            : -1;
    if (score >= 0) scored.push([score, file]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length || a[1].localeCompare(b[1]));
  return scored.slice(0, limit).map(([, file]) => file);
}
