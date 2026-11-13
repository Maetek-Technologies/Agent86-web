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
  sidebar: "agent86web.sidebar.v1",
  titles: "agent86web.titles.v1",
  prefs: "agent86web.prefs.v1",
} as const;

/** The sessions panel: its width in pixels and whether it is shown. */
export interface SidebarLayout {
  width: number;
  shown: boolean;
}

export const SIDEBAR_DEFAULT = 256;
export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 560;

export function clampSidebar(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT;
  return Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)));
}

export function loadSidebar(): SidebarLayout {
  const saved = load<Partial<SidebarLayout>>(KEYS.sidebar, {});
  return {
    width: clampSidebar(typeof saved.width === "number" ? saved.width : SIDEBAR_DEFAULT),
    shown: saved.shown !== false,
  };
}

export function saveSidebar(layout: SidebarLayout): void {
  save(KEYS.sidebar, layout);
}

/** The longest thread name, as agent86 caps it. */
export const TITLE_MAX = 200;

/** Controls, zero-width, and bidirectional formatting characters, as agent86 strips them. */
const INVISIBLE_RANGES: [number, number][] = [
  [0x00, 0x1f],
  [0x7f, 0x7f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];
/** A `\uXXXX` escape for the pattern (built from numbers so the source holds no such characters). */
const hex = (n: number) => `${String.fromCharCode(92)}u${n.toString(16).padStart(4, "0")}`;
const INVISIBLE = new RegExp(
  `[${INVISIBLE_RANGES.map(([a, b]) => `${hex(a)}-${hex(b)}`).join("")}]`,
  "g",
);

/** A name as agent86 1.0.17 keeps it: one line, no control characters, trimmed, capped. */
export function cleanTitle(text: string): string {
  const firstLine = text.replace(/^\s+/, "").split(/\r?\n/)[0] ?? "";
  return firstLine.replace(INVISIBLE, "").trim().slice(0, TITLE_MAX).trim();
}

/** A name the user gave a session; `syncedAt` once agent86 has taken it. */
export interface LocalTitle {
  title: string;
  syncedAt?: number;
}

/** How long a name agent86 has taken still overrides an older session list (its cache). */
const SYNC_GRACE_MS = 10_000;

/**
 * Names the user gave sessions: kept here until agent86 takes them with `/rename` (1.0.17 and
 * later), and shown until agent86's own list carries them. With older versions, kept for good.
 */
class LocalTitles {
  private titles: Record<string, LocalTitle> = load<Record<string, LocalTitle>>(KEYS.titles, {});
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): Readonly<Record<string, LocalTitle>> => this.titles;

  /** The name to show for a session, if the user gave one agent86's list may not have yet. */
  get(sessionId: string): string | undefined {
    return this.titles[sessionId]?.title;
  }

  /** A name agent86 has not taken yet. */
  pending(sessionId: string): string | undefined {
    const entry = this.titles[sessionId];
    return entry && entry.syncedAt === undefined ? entry.title : undefined;
  }

  set(sessionId: string, title: string): void {
    const entry = this.titles[sessionId];
    if (entry?.title === title && entry.syncedAt === undefined) return;
    this.titles = { ...this.titles, [sessionId]: { title } };
    this.changed();
  }

  /** agent86 took the name with `/rename`. */
  synced(sessionId: string, title: string, now = Date.now()): void {
    if (this.titles[sessionId]?.title !== title) return;
    this.titles = { ...this.titles, [sessionId]: { title, syncedAt: now } };
    this.changed();
  }

  /**
   * agent86 listed the session as `listed`: a name it has taken is no longer needed here once its
   * list shows it, or once the list is clearly newer (it was renamed again elsewhere).
   */
  seen(sessionId: string, listed: string | undefined, now = Date.now()): void {
    const entry = this.titles[sessionId];
    if (entry?.syncedAt === undefined) return;
    if (listed === entry.title || now - entry.syncedAt > SYNC_GRACE_MS) this.delete(sessionId);
  }

  private delete(sessionId: string): void {
    const { [sessionId]: _, ...rest } = this.titles;
    this.titles = rest;
    this.changed();
  }

  private changed(): void {
    save(KEYS.titles, this.titles);
    for (const listener of this.listeners) listener();
  }
}

export const localTitles = new LocalTitles();

/** The approval mode new threads start in; "default" leaves agent86's own default. */
export type ModePreference = "default" | "ask" | "auto" | "deny";

export interface Preferences {
  mode: ModePreference;
}

const MODES: readonly ModePreference[] = ["default", "ask", "auto", "deny"];

export function loadPreferences(): Preferences {
  const saved = load<Partial<Preferences>>(KEYS.prefs, {});
  return { mode: MODES.includes(saved.mode as ModePreference) ? saved.mode! : "default" };
}

export function savePreferences(prefs: Preferences): void {
  save(KEYS.prefs, prefs);
}

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
