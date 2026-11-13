import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { listSessions, type SessionSummary } from "../api.ts";
import {
  clampSidebar,
  localTitles,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
} from "../threads/storage.ts";
import { InlineRename } from "./InlineRename.tsx";

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

/** One saved session: opens on click; the pencil renames it in place. */
function SessionRow({
  session,
  title,
  open,
  onOpen,
  onRename,
}: {
  session: SessionSummary;
  title: string;
  open: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div className="flex px-3 py-0.5">
        <InlineRename
          initial={title}
          label="Session name"
          className="flex-1"
          onSave={(next) => {
            setEditing(false);
            onRename(next);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }
  return (
    <div className="group flex items-center hover:bg-panel-2">
      <button
        type="button"
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "F2") {
            event.preventDefault();
            setEditing(true);
          }
        }}
        className="flex min-w-0 flex-1 items-baseline gap-2 py-1 pl-3 text-left"
        title={
          title === (session.title || session.sessionId)
            ? `agent86 --resume ${session.sessionId}`
            : `${title}\nagent86's name: ${session.title ?? "(none)"}\nagent86 --resume ${session.sessionId}`
        }
      >
        <span className={`min-w-0 flex-1 truncate ${open ? "text-accent" : ""}`}>{title}</span>
        <span className="shrink-0 text-xs text-muted">{when(session.updatedAt)}</span>
      </button>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Rename ${title}`}
        title="Rename (F2)"
        className="shrink-0 px-2 text-xs text-muted opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-text"
      >
        ✎
      </button>
    </div>
  );
}

/** One workspace's saved sessions, from agent86 (docs/UI_DESIGN.md §2). */
function WorkspaceSessions({
  workspace,
  refresh,
  openSessionIds,
  onOpen,
  onRename,
  onNew,
}: {
  workspace: string;
  refresh: number;
  openSessionIds: ReadonlySet<string>;
  onOpen: (session: SessionSummary, title: string) => void;
  onRename: (sessionId: string, title: string) => void;
  onNew: () => void;
}) {
  const [sessions, setSessions] = useState<SessionSummary[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState(true);
  const local = useSyncExternalStore(localTitles.subscribe, localTitles.getSnapshot);

  useEffect(() => {
    let live = true;
    listSessions(workspace)
      .then((s) => {
        if (!live) return;
        for (const session of s) localTitles.seen(session.sessionId, session.title);
        setSessions(s);
        setError(undefined);
      })
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
          {sessions?.map((s) => {
            const title = local[s.sessionId]?.title ?? (s.title || s.sessionId);
            return (
              <li key={s.sessionId}>
                <SessionRow
                  session={s}
                  title={title}
                  open={openSessionIds.has(s.sessionId)}
                  onOpen={() => onOpen(s, title)}
                  onRename={(next) => onRename(s.sessionId, next)}
                />
              </li>
            );
          })}
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

/** The sessions panel's right edge: drag, arrow keys, or double-click to reset. */
function ResizeHandle({ width, onResize }: { width: number; onResize: (width: number) => void }) {
  const drag = useRef<{ x: number; width: number } | undefined>(undefined);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sessions panel"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        onResize(clampSidebar(drag.current.width + event.clientX - drag.current.x));
      }}
      onPointerUp={(event) => {
        drag.current = undefined;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onDoubleClick={() => onResize(SIDEBAR_DEFAULT)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 48 : 16;
        if (event.key === "ArrowLeft") onResize(clampSidebar(width - step));
        else if (event.key === "ArrowRight") onResize(clampSidebar(width + step));
        else if (event.key === "Home") onResize(SIDEBAR_MIN);
        else if (event.key === "End") onResize(SIDEBAR_MAX);
        else return;
        event.preventDefault();
      }}
      className="absolute top-0 -right-0.5 z-10 h-full w-1.5 cursor-col-resize hover:bg-accent/50 focus-visible:bg-accent/70 focus-visible:outline-none"
    />
  );
}

export function Sidebar({
  workspaces,
  openSessionIds,
  refresh,
  width,
  onResize,
  onOpen,
  onRename,
  onNew,
  onChooseWorkspace,
}: {
  workspaces: string[];
  openSessionIds: ReadonlySet<string>;
  refresh: number;
  width: number;
  onResize: (width: number) => void;
  onOpen: (workspace: string, session: SessionSummary, title: string) => void;
  onRename: (sessionId: string, title: string) => void;
  onNew: (workspace: string) => void;
  onChooseWorkspace: () => void;
}) {
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return (
    <nav
      aria-label="Sessions"
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-r border-border bg-panel"
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
            onOpen={(s, title) => onOpen(workspace, s, title)}
            onRename={onRename}
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
      <ResizeHandle width={width} onResize={onResize} />
    </nav>
  );
}
