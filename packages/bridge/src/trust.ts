// Project trust from the browser (docs/adr/0004-project-trust-from-the-browser.md).
//
// agent86 ignores a project file's riskier settings until the user trusts the file. Over ACP it
// never asks, and `--trust-project` trusts for one run without remembering. So the bridge keeps
// its own record of what the user trusted here, by the file's real path and the SHA-256 of its
// bytes, and passes `--trust-project` when it starts agent86 for a project whose file still
// matches. Any change to the file needs trust again. The bridge never writes agent86's own record.
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { realpath } from "./workspaces.ts";

/** The largest project file shown for review. A config file is small; anything bigger is refused. */
export const MAX_CONFIG_BYTES = 256 * 1024;

export interface ProjectConfig {
  /** The real path of `<workspace>/.agent86/config.toml`. */
  path: string;
  contents: string;
  sha256: string;
}

export interface TrustRecord {
  path: string;
  sha256: string;
  trustedAt: string;
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The project's agent86 config file, if it has one (read-only, for review and hashing). */
export function readProjectConfig(workspace: string): ProjectConfig | undefined {
  let path: string;
  try {
    path = realpath(join(workspace, ".agent86", "config.toml"));
  } catch {
    return undefined;
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    return undefined;
  }
  if (bytes.length > MAX_CONFIG_BYTES) return undefined;
  return { path, contents: bytes.toString("utf8"), sha256: sha256(bytes) };
}

export class TrustStore {
  readonly file: string;

  /** `dir` is the bridge's own state directory (default `~/.agent86-web`). */
  constructor(dir: string = join(homedir(), ".agent86-web")) {
    this.file = join(dir, "trusted-projects.json");
  }

  list(): TrustRecord[] {
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as { projects?: TrustRecord[] };
      return Array.isArray(parsed.projects) ? parsed.projects : [];
    } catch {
      return [];
    }
  }

  /** Whether the workspace's config file, as it is now, was trusted here. */
  isTrusted(workspace: string): boolean {
    const config = readProjectConfig(workspace);
    if (!config) return false;
    return this.list().some((r) => r.path === config.path && r.sha256 === config.sha256);
  }

  /**
   * Trust the workspace's config file, if it still has the hash the user reviewed. Returns false
   * when the file is gone or has changed since (the user must review it again).
   */
  trust(workspace: string, reviewedSha256: string): boolean {
    const config = readProjectConfig(workspace);
    if (!config || config.sha256 !== reviewedSha256) return false;
    const records = this.list().filter((r) => r.path !== config.path);
    records.push({ path: config.path, sha256: config.sha256, trustedAt: new Date().toISOString() });
    this.write(records);
    return true;
  }

  revoke(path: string): boolean {
    const records = this.list();
    const kept = records.filter((r) => r.path !== path);
    if (kept.length === records.length) return false;
    this.write(kept);
    return true;
  }

  /** Written atomically, readable only by the user (docs/SECURITY.md T16, T17). */
  private write(records: TrustRecord[]): void {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ projects: records }, null, 2)}\n`, {
      mode: 0o600,
    });
    renameSync(temporary, this.file);
    try {
      chmodSync(this.file, 0o600);
    } catch {
      // Windows: permissions are by ACL; the user profile directory already restricts it.
    }
  }
}
