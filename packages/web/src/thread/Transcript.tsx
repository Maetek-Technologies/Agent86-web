import type {
  AgentEntry,
  Entry,
  NoticeEntry,
  ThoughtEntry,
  TurnEndEntry,
  UserEntry,
} from "@agent86-web/acp-client";
import { memo, useState } from "react";
import { Markdown } from "../markdown/Markdown.tsx";
import { ToolCard } from "../tools/ToolCard.tsx";
import { formatChars, formatDuration, useElapsed } from "./useElapsed.ts";

function UserMessage({ entry }: { entry: UserEntry }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[85%] whitespace-pre-wrap rounded-lg border border-border bg-panel-2 px-3 py-2"
        aria-label="You"
      >
        {entry.text}
      </div>
    </div>
  );
}

const AgentMessage = memo(function AgentMessage({ entry }: { entry: AgentEntry }) {
  return (
    <div aria-label="agent86">
      <Markdown text={entry.text} />
    </div>
  );
});

/**
 * Reasoning, dimmed. Open while it streams and before the answer starts, then collapsed
 * (docs/UI_DESIGN.md §4). Once the user toggles it, their choice wins.
 */
function ThinkingBlock({ entry }: { entry: ThoughtEntry }) {
  const streaming = entry.endedAt === undefined;
  const [userOpen, setUserOpen] = useState<boolean | undefined>(undefined);
  const open = userOpen ?? streaming;
  const seconds = useElapsed(entry.startedAt, streaming);
  const label = streaming
    ? `Thinking… ${seconds}s`
    : `Thought for ${formatDuration((entry.endedAt ?? entry.startedAt) - entry.startedAt)} · ${formatChars(entry.text.length)}`;
  return (
    <div className="text-sm text-muted" data-testid="thought">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
        className="flex items-center gap-1.5 rounded px-1 hover:text-text"
      >
        <span aria-hidden>∴</span>
        <span>{label}</span>
        <span aria-hidden className="text-xs">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="mt-1 whitespace-pre-wrap border-l-2 border-border pl-3 italic opacity-80">
          {entry.text}
        </div>
      )}
    </div>
  );
}

function Notice({ entry }: { entry: NoticeEntry }) {
  const color =
    entry.level === "error" ? "text-error" : entry.level === "warning" ? "text-warn" : "text-muted";
  return (
    <div role={entry.level === "error" ? "alert" : "note"} className={`text-sm ${color}`}>
      <div className="whitespace-pre-wrap break-words">{entry.text}</div>
      {entry.hint && <div className="mt-1 font-mono text-xs text-muted">{entry.hint}</div>}
    </div>
  );
}

function TurnEnd({ entry }: { entry: TurnEndEntry }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
      <div className="h-px flex-1 bg-border" />
      <span>{formatDuration(entry.durationMs)}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function EntryView({ entry }: { entry: Entry }) {
  switch (entry.kind) {
    case "user":
      return <UserMessage entry={entry} />;
    case "agent":
      return <AgentMessage entry={entry} />;
    case "thought":
      return <ThinkingBlock entry={entry} />;
    case "tool":
      return <ToolCard entry={entry} />;
    case "notice":
      return <Notice entry={entry} />;
    case "turn-end":
      return <TurnEnd entry={entry} />;
  }
}

export function Transcript({ entries }: { entries: Entry[] }) {
  return (
    <div className="space-y-4" aria-live="polite" aria-relevant="additions">
      {entries.map((entry) => (
        <EntryView key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
