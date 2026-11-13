import { useState, useSyncExternalStore } from "react";
import type { ThreadSnapshot } from "../threads/manager.ts";
import { InlineRename } from "./InlineRename.tsx";

const NONE = () => () => undefined;

/** Whether the thread's agent86 is working or waiting on the user, for the tab's dot. */
function useActivity(thread: ThreadSnapshot): "idle" | "running" | "approval" {
  const session = thread.session;
  const state = useSyncExternalStore(session?.subscribe ?? NONE, () => session?.getState());
  if (state?.permissions.length) return "approval";
  if (state?.turn.running) return "running";
  return "idle";
}

function Tab({
  thread,
  active,
  onActivate,
  onClose,
  onRename,
}: {
  thread: ThreadSnapshot;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
  onRename: (title: string) => void;
}) {
  const activity = useActivity(thread);
  const [editing, setEditing] = useState(false);
  return (
    <div
      role="tab"
      aria-selected={active}
      className={`group flex max-w-56 shrink-0 items-center gap-1.5 border-r border-border px-3 py-1.5 text-sm ${active ? "bg-bg" : "bg-panel text-muted hover:text-text"}`}
    >
      <span
        aria-label={
          activity === "approval"
            ? "waiting for approval"
            : activity === "running"
              ? "working"
              : undefined
        }
        className={`h-2 w-2 shrink-0 rounded-full ${activity === "approval" ? "bg-warn" : activity === "running" ? "animate-pulse bg-accent" : "bg-transparent"}`}
      />
      {editing ? (
        <InlineRename
          initial={thread.meta.title}
          label="Thread name"
          className="w-40"
          onSave={(title) => {
            setEditing(false);
            onRename(title);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button
          type="button"
          onClick={onActivate}
          onDoubleClick={() => setEditing(true)}
          onKeyDown={(event) => {
            if (event.key === "F2") {
              event.preventDefault();
              setEditing(true);
            }
          }}
          className="min-w-0 truncate"
          title={`${thread.meta.workspace}\nDouble-click or F2 to rename`}
        >
          {thread.meta.title}
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${thread.meta.title}`}
        className="rounded px-1 text-muted opacity-60 hover:bg-panel-2 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

export function Tabs({
  threads,
  activeId,
  onActivate,
  onClose,
  onRename,
  onNew,
}: {
  threads: ThreadSnapshot[];
  activeId: string | undefined;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onNew: () => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Open threads"
      className="flex shrink-0 overflow-x-auto border-b border-border bg-panel"
    >
      {threads.map((thread) => (
        <Tab
          key={thread.meta.id}
          thread={thread}
          active={thread.meta.id === activeId}
          onActivate={() => onActivate(thread.meta.id)}
          onClose={() => onClose(thread.meta.id)}
          onRename={(title) => onRename(thread.meta.id, title)}
        />
      ))}
      <button
        type="button"
        onClick={onNew}
        aria-label="New thread"
        title="New thread (Alt+N)"
        className="px-3 text-muted hover:text-text"
      >
        +
      </button>
    </div>
  );
}
