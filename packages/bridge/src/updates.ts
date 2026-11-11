// A notice when a newer agent86 or agent86-web is out (docs/OPEN_QUESTIONS.md Q10). At most one
// check a day, against the npm registry, never blocking startup; any failure means no notice.
// Turned off with --no-update-check or AGENT86_WEB_NO_UPDATE_CHECK=1.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { compareVersions } from "./agent86.ts";

export const PACKAGES = { agent86: "agent86", agent86Web: "agent86-web" } as const;
export type Product = keyof typeof PACKAGES;
export type Updates = Partial<Record<Product, string>>;

const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 5_000;

interface Cache {
  checkedAt: number;
  latest: Updates;
}

export interface UpdateCheckOptions {
  /** The versions running now. */
  current: Record<Product, string>;
  stateDir?: string;
  now?: () => number;
  /** The latest published version of an npm package; injected in tests. */
  latestVersion?: (pkg: string) => Promise<string | undefined>;
}

/** Whether the environment turns the check off. */
export function updateCheckDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.AGENT86_WEB_NO_UPDATE_CHECK?.trim().toLowerCase();
  return !!value && value !== "0" && value !== "false";
}

async function npmLatest(pkg: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return undefined;
    const version = ((await res.json()) as { version?: unknown }).version;
    return typeof version === "string" ? version : undefined;
  } catch {
    return undefined;
  }
}

/** The products with a newer release than the one running, by their latest version. */
export async function checkForUpdates(options: UpdateCheckOptions): Promise<Updates> {
  const now = (options.now ?? Date.now)();
  const file = join(options.stateDir ?? join(homedir(), ".agent86-web"), "update-check.json");
  let latest: Updates | undefined;
  try {
    const cache = JSON.parse(readFileSync(file, "utf8")) as Cache;
    if (now - cache.checkedAt < DAY_MS) latest = cache.latest;
  } catch {
    // No cache yet.
  }
  if (!latest) {
    const lookup = options.latestVersion ?? npmLatest;
    const [agent86, agent86Web] = await Promise.all([
      lookup(PACKAGES.agent86),
      lookup(PACKAGES.agent86Web),
    ]);
    latest = {};
    if (agent86) latest.agent86 = agent86;
    if (agent86Web) latest.agent86Web = agent86Web;
    try {
      mkdirSync(join(file, ".."), { recursive: true, mode: 0o700 });
      writeFileSync(file, JSON.stringify({ checkedAt: now, latest } satisfies Cache));
    } catch {
      // Not cached; asked again next start.
    }
  }
  const updates: Updates = {};
  for (const product of Object.keys(PACKAGES) as Product[]) {
    const version = latest[product];
    if (version && compareVersions(version, options.current[product]) > 0)
      updates[product] = version;
  }
  return updates;
}
