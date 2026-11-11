import type { ToolEntry } from "@agent86-web/acp-client";
import { useState, type ReactNode } from "react";
import { Highlight } from "../highlight/Highlight.tsx";
import { useThread } from "../thread/ThreadContext.ts";
import { argumentSummary, parseApprovalText, splitResult, toolName } from "./approval.ts";
import { DetailView } from "./DetailView.tsx";
import { DiffView } from "./DiffView.tsx";
import { PermissionPanel } from "./PermissionPanel.tsx";

type Display = "awaiting" | "running" | "done" | "failed" | "declined";

function display(entry: ToolEntry, awaiting: boolean): Display {
  if (awaiting) return "awaiting";
  if (entry.decision === "rejected" || entry.decision === "cancelled") return "declined";
  if (entry.status === "failed" && entry.output.startsWith("Not executed: declined"))
    return "declined";
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
};

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
  const { session, permissions, expandAll } = useThread();
  const request = permissions.find((p) => p.toolCallId === entry.toolCallId);
  const name = toolName(entry);
  const summary = argumentSummary(name, entry.rawInput);
  const state = display(entry, !!request);
  const badge = BADGE[state];
  const [userOpen, setUserOpen] = useState<boolean | undefined>(undefined);
  const open = userOpen ?? expandAll;
  const result = splitResult(entry.output);
  const firstLine = result.message.split("\n")[0] ?? "";

  return (
    <div
      className={`rounded-md border bg-panel ${state === "failed" ? "border-error/60" : state === "awaiting" ? "border-warn" : "border-border"}`}
      data-testid="tool-card"
      data-state={state}
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
        <span className="shrink-0 font-semibold">{name}</span>
        <span className="min-w-0 truncate text-muted">{summary}</span>
        <span className={`ml-auto shrink-0 font-sans text-xs ${badge.className}`}>
          {badge.label}
        </span>
      </button>

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
          {entry.preview && !request && !result.diff && (
            <Section
              title={
                entry.decision === "allowed"
                  ? "Approved change"
                  : entry.decision
                    ? "Declined change"
                    : "Requested change"
              }
            >
              <DetailView detail={parseApprovalText(entry.preview, name).detail} />
            </Section>
          )}
          {entry.output && (
            <Section title="Result">
              {result.message && (
                <pre className="max-h-80 overflow-auto rounded border border-border bg-panel-2 p-2 font-mono text-xs whitespace-pre-wrap">
                  {result.message}
                </pre>
              )}
              {result.diff && <DiffView diff={result.diff} />}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
