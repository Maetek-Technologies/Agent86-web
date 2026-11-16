import type { FileLocation, SubagentInfo, ToolEntry } from "@agent86-web/acp-client";
import { useState, type ReactNode } from "react";
import { Highlight } from "../highlight/Highlight.tsx";
import { formatUsd } from "../thread/format.ts";
import { ModelCalls } from "../thread/Spend.tsx";
import { useThread } from "../thread/ThreadContext.ts";
import { argumentSummary, parseApprovalText, splitResult, toolName } from "./approval.ts";
import { DetailView } from "./DetailView.tsx";
import { DiffView, FileDiffs } from "./DiffView.tsx";
import { locationLabel } from "./paths.ts";
import { PermissionPanel } from "./PermissionPanel.tsx";

type Display = "awaiting" | "running" | "done" | "failed" | "declined" | "interrupted";

function display(entry: ToolEntry, awaiting: boolean): Display {
  if (awaiting) return "awaiting";
  // Still pending or running when agent86 stopped partway through the turn.
  if (entry.interrupted) return "interrupted";
  if (entry.decision === "rejected" || entry.decision === "cancelled") return "declined";
  // agent86's words for a call it did not run: "declined by user", "blocked by approval policy".
  if (entry.status === "failed" && entry.output.startsWith("Not executed:")) return "declined";
  if (entry.status === "failed") return "failed";
  if (entry.status === "completed") return "done";
  return "running";
}

const BADGE: Record<Display, { icon: string; label: string; className: string }> = {
  awaiting: { icon: "⚠", label: "awaiting approval", className: "text-warn" },
  running: { icon: "◐", label: "running", className: "text-accent animate-pulse" },
  done: { icon: "✓", label: "done", className: "text-ok" },
  failed: { icon: "✗", label: "failed", className: "text-error" },
  declined: { icon: "⊘", label: "declined", className: "text-muted" },
  interrupted: { icon: "↯", label: "interrupted", className: "text-warn" },
};

/** An icon per ACP tool kind; `search` (agent86 1.0.19) has its own. Unknown kinds get none. */
const KIND: Record<string, { icon: string; label: string }> = {
  read: { icon: "▤", label: "read" },
  edit: { icon: "✎", label: "edit" },
  delete: { icon: "⌫", label: "delete" },
  move: { icon: "⇄", label: "move" },
  search: { icon: "⌕", label: "search" },
  execute: { icon: "❯", label: "run" },
  fetch: { icon: "⇣", label: "fetch" },
  think: { icon: "∴", label: "think" },
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded px-1 text-muted hover:bg-panel-2 hover:text-text"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

/** The files a call works on (ACP `locations`), relative to the workspace, with line. */
function Locations({ locations, cwd }: { locations: FileLocation[]; cwd: string | undefined }) {
  const shown = locations.slice(0, 3);
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-3 px-3 pb-1 pl-9 font-mono text-xs text-muted"
      aria-label="Files"
    >
      {shown.map((location, i) => {
        const label = locationLabel(location, cwd);
        const full = location.line ? `${location.path}:${location.line}` : location.path;
        return (
          <span key={`${full}:${i}`} className="flex min-w-0 items-center gap-1" title={full}>
            <span aria-hidden>↳</span>
            <span className="truncate" data-testid="tool-location">
              {label}
            </span>
            <CopyButton text={full} label="path" />
          </span>
        );
      })}
      {locations.length > shown.length && <span>+{locations.length - shown.length} more</span>}
    </div>
  );
}

const RUN_STATUS: Record<SubagentInfo["status"], { text: string; className: string }> = {
  running: { text: "running", className: "text-accent" },
  done: { text: "done", className: "text-ok" },
  failed: { text: "failed", className: "text-error" },
};

/** A delegation's sub-agent, from agent86's state events: status, model calls, cost. */
function SubagentSummary({ info, open }: { info: SubagentInfo; open: boolean }) {
  const status = RUN_STATUS[info.status];
  const spent =
    info.costUsd ??
    (info.priced && info.calls.length
      ? info.calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0)
      : undefined);
  return (
    <div className="px-3 pb-2 pl-9 text-xs" data-testid="subagent">
      <div className="flex flex-wrap items-center gap-x-3 text-muted">
        <span className="font-mono text-text">{info.agent ?? "sub-agent"}</span>
        <span className={status.className}>{status.text}</span>
        <span>
          {info.calls.length} model call{info.calls.length === 1 ? "" : "s"}
        </span>
        <span title={info.priced ? undefined : "agent86 has no price for a model it used"}>
          cost {formatUsd(spent)}
        </span>
      </div>
      {open && info.calls.length > 0 && (
        <div className="mt-1">
          <ModelCalls calls={info.calls} />
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
      {children}
    </div>
  );
}

/** A tool call: its status, its arguments, what it would do, and what came back. */
export function ToolCard({ entry }: { entry: ToolEntry }) {
  const { session, permissions, expandAll, cwd, subagents } = useThread();
  const subagent = subagents?.[entry.toolCallId];
  const kind = entry.toolKind ? KIND[entry.toolKind] : undefined;
  const request = permissions.find((p) => p.toolCallId === entry.toolCallId);
  const name = toolName(entry);
  const summary = argumentSummary(name, entry.rawInput);
  const state = display(entry, !!request);
  const badge = BADGE[state];
  const [userOpen, setUserOpen] = useState<boolean | undefined>(undefined);
  const open = userOpen ?? expandAll;
  const result = splitResult(entry.output);
  const firstLine = result.message.split("\n")[0] ?? "";
  // agent86 1.0.19 sends a write's change as `diff` items beside its text; show the change once,
  // from the items when there are any, else from the text.
  const resultDiffs = entry.diffs?.length ? entry.diffs : undefined;
  const resultHasChange = !!resultDiffs || !!result.diff;

  return (
    <div
      className={`rounded-md border bg-panel ${state === "failed" ? "border-error/60" : state === "awaiting" ? "border-warn" : "border-border"}`}
      data-testid="tool-card"
      data-tool-call-id={entry.toolCallId}
      data-state={state}
      data-kind={entry.toolKind}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
        className="flex w-full min-w-0 items-baseline gap-2 px-3 py-2 text-left font-mono text-sm"
      >
        <span aria-hidden className={badge.className}>
          {badge.icon}
        </span>
        {kind && (
          <span className="shrink-0 text-muted" title={kind.label} data-testid="tool-kind">
            <span aria-hidden>{kind.icon}</span>
            <span className="sr-only">{kind.label}</span>
          </span>
        )}
        <span className="shrink-0 font-semibold">{name}</span>
        <span className="min-w-0 truncate text-muted">{summary}</span>
        <span className={`ml-auto shrink-0 font-sans text-xs ${badge.className}`}>
          {badge.label}
        </span>
      </button>

      {entry.locations?.length ? <Locations locations={entry.locations} cwd={cwd} /> : null}

      {subagent && <SubagentSummary info={subagent} open={open} />}

      {!open && !request && firstLine && (
        <div className="truncate px-3 pb-2 pl-9 font-mono text-xs text-muted">⎿ {firstLine}</div>
      )}

      {request && session && (
        <div className="px-3 pb-3">
          <PermissionPanel
            request={request}
            name={name}
            summary={summary}
            onChoose={(optionId) => session.respond(request.id, optionId)}
            onReject={() => session.reject(request.id)}
          />
        </div>
      )}

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {entry.rawInput !== undefined && (
            <Section title="Arguments">
              <pre className="max-h-64 overflow-auto rounded border border-border bg-panel-2 p-2 font-mono text-xs">
                <code>
                  <Highlight code={JSON.stringify(entry.rawInput, null, 2)} language="json" />
                </code>
              </pre>
            </Section>
          )}
          {/* An edit's result repeats its diff; show the change once. */}
          {entry.preview && !request && !resultHasChange && (
            <Section
              title={
                entry.decision === "allowed"
                  ? "Approved change"
                  : entry.decision
                    ? "Declined change"
                    : "Requested change"
              }
            >
              {entry.previewDiffs?.length ? (
                <FileDiffs diffs={entry.previewDiffs} />
              ) : (
                <DetailView detail={parseApprovalText(entry.preview, name).detail} />
              )}
            </Section>
          )}
          {(entry.output || resultDiffs) && (
            <Section title="Result">
              {result.message && (
                <pre className="max-h-80 overflow-auto rounded border border-border bg-panel-2 p-2 font-mono text-xs whitespace-pre-wrap">
                  {result.message}
                </pre>
              )}
              {resultDiffs ? (
                <FileDiffs diffs={resultDiffs} />
              ) : (
                result.diff && <DiffView diff={result.diff} />
              )}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
