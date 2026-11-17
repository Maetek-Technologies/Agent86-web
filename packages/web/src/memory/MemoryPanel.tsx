import type { AgentSession, MemoryEntry, MemoryKind } from "@agent86-web/acp-client";
import { useEffect, useState } from "react";

/** Entries per page. agent86 allows up to 200; a short page keeps the panel quick. */
export const MEMORY_PAGE = 20;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * What agent86 has learned (agent86 1.0.22): facts (what `remember` keeps) and episodes (one per
 * finished turn, recalled into similar later tasks), newest first, a page at a time. Pinning keeps
 * an entry from ever being pruned; forgetting deletes it, after a confirmation. agent86 refuses
 * these while a turn runs, so the panel waits.
 */
export function MemoryPanel({
  session,
  busy,
  onClose,
  className = "",
}: {
  session: AgentSession;
  busy: boolean;
  onClose: () => void;
  className?: string;
}) {
  const [kind, setKind] = useState<MemoryKind>("fact");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [entries, setEntries] = useState<MemoryEntry[] | undefined>(undefined);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState<number | undefined>(undefined);

  // The first page, whenever what to list changes or a turn ends (agent86 refuses during one).
  useEffect(() => {
    if (busy) return;
    let live = true;
    session.listMemory({ kind, limit: MEMORY_PAGE, pinned: pinnedOnly }).then(
      (page) => {
        if (!live) return;
        setEntries(page.entries);
        setCursor(page.nextCursor);
        setError(undefined);
      },
      (e: unknown) => live && setError(message(e)),
    );
    return () => {
      live = false;
    };
  }, [session, busy, kind, pinnedOnly]);

  async function more() {
    if (!cursor) return;
    setWorking(true);
    try {
      const page = await session.listMemory({
        kind,
        limit: MEMORY_PAGE,
        pinned: pinnedOnly,
        cursor,
      });
      setEntries((current) => [...(current ?? []), ...page.entries]);
      setCursor(page.nextCursor);
      setError(undefined);
    } catch (e) {
      setError(message(e));
    } finally {
      setWorking(false);
    }
  }

  async function pin(entry: MemoryEntry) {
    setWorking(true);
    try {
      const updated = await session.pinMemory(entry.kind, entry.id, !entry.pinned);
      setEntries((current) => {
        const next = (current ?? []).map((e) => (e.id === entry.id ? updated : e));
        // Unpinned under the pinned filter: it no longer belongs in the list.
        return pinnedOnly ? next.filter((e) => e.pinned) : next;
      });
      setError(undefined);
    } catch (e) {
      setError(message(e));
    } finally {
      setWorking(false);
    }
  }

  async function forget(entry: MemoryEntry) {
    setConfirming(undefined);
    setWorking(true);
    try {
      await session.forgetMemory(entry.kind, entry.id);
      setEntries((current) => (current ?? []).filter((e) => e.id !== entry.id));
      setError(undefined);
    } catch (e) {
      setError(message(e));
    } finally {
      setWorking(false);
    }
  }

  const disabled = busy || working;
  const noun = kind === "fact" ? "fact" : "episode";

  return (
    <aside
      aria-label="Memory"
      data-testid="memory-panel"
      className={`flex min-h-0 flex-col bg-panel text-sm ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 font-semibold">
        <span aria-hidden>🧠</span>
        <span>Memory</span>
        <button
          type="button"
          aria-label="Close memory"
          onClick={onClose}
          className="ml-auto rounded px-1 text-muted hover:text-text"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <div role="tablist" aria-label="What to list" className="flex gap-1">
          {(["fact", "episode"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              disabled={busy}
              onClick={() => {
                setConfirming(undefined);
                setKind(k);
              }}
              className={`rounded px-2 py-0.5 ${kind === k ? "bg-panel-2 font-semibold text-text" : "text-muted hover:text-text"} disabled:opacity-50`}
            >
              {k === "fact" ? "Facts" : "Episodes"}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1">
          <input
            type="checkbox"
            checked={pinnedOnly}
            disabled={busy}
            onChange={(event) => {
              setConfirming(undefined);
              setPinnedOnly(event.target.checked);
            }}
          />
          pinned only
        </label>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {busy && (
          <p className="text-xs text-muted" data-testid="memory-busy">
            agent86 is busy with a turn; its memory can be read and changed when it ends.
          </p>
        )}
        <p className="text-xs text-muted">
          {kind === "fact"
            ? "Facts are what the agent keeps with remember."
            : "Episodes are one per finished turn; agent86 recalls them into similar later tasks."}{" "}
          Pinned entries are never pruned.
        </p>
        {entries && entries.length === 0 && (
          <p className="text-xs text-muted">
            No {pinnedOnly ? "pinned " : ""}
            {noun}s.
          </p>
        )}
        {entries && entries.length > 0 && (
          <ul className="space-y-1.5" data-testid="memory-list">
            {entries.map((entry) => (
              <li
                key={`${entry.kind}-${entry.id}`}
                data-testid="memory-item"
                data-id={entry.id}
                className="space-y-1 rounded border border-border bg-panel-2 p-2"
              >
                <div className="break-words whitespace-pre-wrap" data-testid="memory-text">
                  {entry.text}
                </div>
                {entry.outcome !== undefined && (
                  <div className="text-xs break-words text-muted">→ {entry.outcome}</div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-mono">#{entry.id}</span>
                  <span title={entry.storedAt}>{when(entry.storedAt)}</span>
                  {entry.category && entry.category !== "fact" && (
                    <span className="rounded bg-panel px-1">{entry.category}</span>
                  )}
                  {entry.pinned && (
                    <span className="rounded bg-accent/20 px-1 text-accent" data-testid="pinned">
                      pinned
                    </span>
                  )}
                  {confirming === entry.id ? (
                    <span
                      role="alertdialog"
                      aria-label={`Forget ${noun} ${entry.id}?`}
                      className="ml-auto flex items-center gap-1"
                    >
                      Forget for good?
                      <button
                        type="button"
                        onClick={() => setConfirming(undefined)}
                        className="rounded border border-border px-1.5 text-text hover:border-accent"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => void forget(entry)}
                        className="rounded border border-error px-1.5 text-error hover:bg-error/10"
                      >
                        Forget
                      </button>
                    </span>
                  ) : (
                    <span className="ml-auto flex gap-1">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void pin(entry)}
                        className="rounded px-1.5 hover:text-text disabled:opacity-50"
                      >
                        {entry.pinned ? "unpin" : "pin"}
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setConfirming(entry.id)}
                        className="rounded px-1.5 hover:text-error disabled:opacity-50"
                      >
                        forget
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void more()}
            className="w-full rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
          >
            Load more
          </button>
        )}
        {error && (
          <p role="alert" className="text-xs text-error">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}
