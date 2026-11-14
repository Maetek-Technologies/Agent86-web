// The bridge's own state files under ~/.agent86-web (trusted projects, settings).
import { chmodSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Write JSON atomically, readable only by the user (docs/SECURITY.md T16, T17). */
export function writePrivateJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows: permissions are by ACL; the user profile directory already restricts it.
  }
}
