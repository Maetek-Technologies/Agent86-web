// Showing agent86's absolute paths compactly, relative to the thread's workspace.

/** `path` relative to `cwd` when it is inside it, else as it is. Works for `/` and `\` paths. */
export function relativePath(path: string, cwd: string | undefined): string {
  if (!cwd) return path;
  const windows = /\\/.test(path) || /^[A-Za-z]:/.test(path);
  const norm = (p: string) => (windows ? p.replace(/\//g, "\\").toLowerCase() : p);
  const base = norm(cwd).replace(/[\\/]+$/, "");
  const full = norm(path);
  const sep = windows ? "\\" : "/";
  if (full.startsWith(base + sep)) return path.slice(base.length + 1);
  return path;
}

/** `path:line` (line optional), relative to the workspace. */
export function locationLabel(location: { path: string; line?: number }, cwd?: string): string {
  const shown = relativePath(location.path, cwd);
  return location.line ? `${shown}:${location.line}` : shown;
}
