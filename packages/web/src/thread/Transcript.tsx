import type {
  AgentEntry,
  CompactionEntry,
  Entry,
  GuardrailEntry,
  NoticeEntry,
  ThoughtEntry,
  TurnEndEntry,
  UserEntry,
} from "@agent86-web/acp-client";
import { memo, useState } from "react";
import { Markdown } from "../markdown/Markdown.tsx";
import { ToolCard } from "../tools/ToolCard.tsx";
import { ModelCalls, SpendMeter } from "./Spend.tsx";
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

/** The end of a turn: how long it took, and with agent86's state events, what it cost. */
function TurnEnd({ entry }: { entry: TurnEndEntry }) {
  const [open, setOpen] = useState(false);
  const spend = entry.spend;
  if (!spend) {
    return (
      <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
        <div className="h-px flex-1 bg-border" />
        <span>{formatDuration(entry.durationMs)}</span>
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  }
  return (
    <div className="text-xs text-muted" data-testid="turn-end">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded px-1 hover:text-text"
        >
          <span>{formatDuration(entry.durationMs)}</span>
          <span aria-hidden>·</span>
          <span>
            {spend.calls.length} model call{spend.calls.length === 1 ? "" : "s"}
          </span>
          <span aria-hidden>·</span>
          <SpendMeter spend={spend} />
          <span aria-hidden>{open ? "▾" : "▸"}</span>
        </button>
        <div className="h-px flex-1 bg-border" />
      </div>
      {open && spend.calls.length > 0 && (
        <div className="mx-auto mt-1 w-fit">
          <ModelCalls calls={spend.calls} />
        </div>
      )}
    </div>
  );
}

/** A compaction of the session into a summary, one entry per compaction, collapsed. */
function Compaction({ entry }: { entry: CompactionEntry }) {
  const [open, setOpen] = useState(false);
  const failed = entry.status === "failed";
  const running = entry.status === "in_progress";
  const label = failed
    ? "Compaction failed"
    : running
      ? "Compacting the conversation…"
      : entry.status === "cancelled"
        ? "Compaction cancelled"
        : "Context compacted";
  return (
    <div
      className={`rounded border px-3 py-1.5 text-sm ${failed ? "border-error/60" : "border-border"}`}
      data-testid="compaction"
      data-status={entry.status}
    >
      <button
        type="button"
        aria-expanded={open}
        disabled={!entry.summary && !entry.error}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 text-left ${failed ? "text-error" : "text-muted"} hover:text-text disabled:hover:text-muted`}
      >
        <span aria-hidden>{failed ? "✗" : running ? "◐" : "⇊"}</span>
        <span>{label}</span>
        {(entry.summary || entry.error) && (
          <span aria-hidden className="ml-auto text-xs">
            {open ? "▾" : "▸"}
          </span>
        )}
      </button>
      {open && entry.error && (
        <div className="mt-1 whitespace-pre-wrap text-xs text-error">{entry.error}</div>
      )}
      {open && entry.summary && (
        <div className="mt-1 border-l-2 border-border pl-3 text-muted">
          <Markdown text={entry.summary} />
        </div>
      )}
    </div>
  );
}

const STAGES: Record<string, string> = {
  ingress_input: "your message",
  egress: "the reply",
  egress_tool_args: "a tool's arguments",
  observation: "a tool's result",
};

/** A guardrail finding: visible, but one quiet line until opened. */
function Guardrail({ entry }: { entry: GuardrailEntry }) {
  const [open, setOpen] = useState(false);
  const where = STAGES[entry.stage] ?? entry.stage;
  const count = entry.findings.length;
  return (
    <div className="text-xs text-warn/80" role="note" data-testid="guardrail">
      <button
        type="button"
        aria-expanded={open}
        disabled={count === 0}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded px-1 hover:text-warn"
      >
        <span aria-hidden>⛨</span>
        <span>
          Guardrail flagged {where}
          {count > 0 && ` (${count} finding${count === 1 ? "" : "s"})`}
        </span>
        {count > 0 && <span aria-hidden>{open ? "▾" : "▸"}</span>}
      </button>
      {open && (
        <ul className="ml-6 list-disc font-mono text-muted">
          {entry.findings.map((finding, i) => (
            <li key={i}>{finding}</li>
          ))}
        </ul>
      )}
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
    case "compaction":
      return <Compaction entry={entry} />;
    case "guardrail":
      return <Guardrail entry={entry} />;
    default:
      return null;
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
