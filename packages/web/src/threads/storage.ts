// Per-browser conveniences in localStorage: the open threads, recent workspaces, prompt history.
// Storage can be missing or throw (private windows, blocked site data), so every access is
// guarded and the app works without it.

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

export const KEYS = {
  threads: "agent86web.threads.v1",
  workspaces: "agent86web.workspaces.v1",
  history: (workspace: string) => `agent86web.history.v1:${workspace}`,
} as const;

const HISTORY_SIZE = 100;

/** The prompts sent in a workspace, newest last. */
export function loadHistory(workspace: string): string[] {
  return load<string[]>(KEYS.history(workspace), []);
}

export function pushHistory(workspace: string, text: string): string[] {
  const history = loadHistory(workspace).filter((entry) => entry !== text);
  history.push(text);
  const trimmed = history.slice(-HISTORY_SIZE);
  save(KEYS.history(workspace), trimmed);
  return trimmed;
}
