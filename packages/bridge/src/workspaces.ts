// The --root jail for workspaces (docs/SECURITY.md T7).
import { realpathSync } from "node:fs";
import { sep } from "node:path";

export function realpath(path: string): string {
  return realpathSync.native(path);
}

/** Whether `path` (already a real path) is `root` or inside it. */
export function within(path: string, root: string): boolean {
  if (path === root) return true;
  const prefix = root.endsWith(sep) ? root : root + sep;
  return path.startsWith(prefix);
}

/** The real path of `requested` if it exists and lies inside one of `roots`, else undefined. */
export function resolveWorkspace(requested: string, roots: readonly string[]): string | undefined {
  let real: string;
  try {
    real = realpath(requested);
  } catch {
    return undefined;
  }
  return roots.some((root) => within(real, root)) ? real : undefined;
}
