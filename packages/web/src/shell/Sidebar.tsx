import { useCallback, useEffect, useState } from "react";
import { listSessions, type SessionSummary } from "../api.ts";

function basename(path: string): string {
  return (
    path
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() || path
  );
}

function when(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString();
}

/** One workspace's saved sessions, from agent86 (docs/UI_DESIGN.md §2). */
function WorkspaceSessions({
  workspace,
  refresh,
  openSessionIds,
  onOpen,
  onNew,
}: {
  workspace: string;
  refresh: number;
  openSessionIds: ReadonlySet<string>;
  onOpen: (session: SessionSummary) => void;
  onNew: () => void;
}) {
  const [sessions, setSessions] = useState<SessionSummary[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let live = true;
    listSessions(workspace)
      .then((s) => live && (setSessions(s), setError(undefined)))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [workspace, refresh]);

  return (
    <section aria-label={`Sessions in ${workspace}`}>
      <div className="flex items-center gap-1 px-3 pt-3 pb-1">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          title={workspace}
          className="min-w-0 flex-1 truncate text-left text-xs font-semibold uppercase tracking-wide text-muted hover:text-text"
        >
          {expanded ? "▾" : "▸"} {basename(workspace)}
        </button>
        <button
          type="button"
          onClick={onNew}
          title={`New thread in ${workspace}`}
          aria-label={`New thread in ${basename(workspace)}`}
          className="rounded px-1.5 text-muted hover:bg-panel-2 hover:text-text"
        >
          +
        </button>
      </div>
      {expanded && (
        <ul className="text-sm">
          {sessions?.map((s) => (
            <li key={s.sessionId}>
              <button
                type="button"
                onClick={() => onOpen(s)}
                className="flex w-full items-baseline gap-2 px-3 py-1 text-left hover:bg-panel-2"
                title={`agent86 --resume ${s.sessionId}`}
              >
                <span
                  className={`min-w-0 flex-1 truncate ${openSessionIds.has(s.sessionId) ? "text-accent" : ""}`}
                >
                  {s.title || s.sessionId}
                </span>
                <span className="shrink-0 text-xs text-muted">{when(s.updatedAt)}</span>
              </button>
            </li>
          ))}
          {sessions && sessions.length === 0 && (
            <li className="px-3 py-1 text-xs text-muted">No saved sessions yet.</li>
          )}
          {!sessions && !error && <li className="px-3 py-1 text-xs text-muted">Loading…</li>}
          {error && <li className="px-3 py-1 text-xs text-error">{error}</li>}
        </ul>
      )}
    </section>
  );
}

export function Sidebar({
  workspaces,
  openSessionIds,
  refresh,
  onOpen,
  onNew,
  onChooseWorkspace,
}: {
  workspaces: string[];
  openSessionIds: ReadonlySet<string>;
  refresh: number;
  onOpen: (workspace: string, session: SessionSummary) => void;
  onNew: (workspace: string) => void;
  onChooseWorkspace: () => void;
}) {
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return (
    <nav
      aria-label="Sessions"
      className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-panel"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Sessions</span>
        <button
          type="button"
          onClick={reload}
          title="Refresh"
          className="ml-auto rounded px-1 text-muted hover:text-text"
        >
          ↻
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {workspaces.map((workspace) => (
          <WorkspaceSessions
            key={workspace}
            workspace={workspace}
            refresh={refresh + tick}
            openSessionIds={openSessionIds}
            onOpen={(s) => onOpen(workspace, s)}
            onNew={() => onNew(workspace)}
          />
        ))}
      </div>
      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={onChooseWorkspace}
          className="w-full rounded border border-border px-2 py-1 text-sm hover:border-accent"
        >
          Open a workspace…
        </button>
      </div>
    </nav>
  );
}
