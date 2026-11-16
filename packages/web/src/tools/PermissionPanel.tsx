import type { PendingPermission, SubagentAsker } from "@agent86-web/acp-client";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { formatCost, formatUsd } from "../thread/format.ts";
import { parseApprovalText } from "./approval.ts";
import { showCard } from "./cardLink.ts";
import { DetailView } from "./DetailView.tsx";
import { FileDiffs } from "./DiffView.tsx";

/** agent86's own line on a sub-agent's request, which the asker block below says better. */
const ASKED_BY = /^Asked by the '[^']*' sub-agent\.?$/;

/**
 * Which sub-agent asks (agent86 1.0.21): its name and a link to its delegation card, the worktree
 * it works in, and its spend beside the turn's and the cap. All amounts are US dollars.
 */
function Asker({ asker }: { asker: SubagentAsker }) {
  const depth = asker.depth ?? 1;
  return (
    <div
      data-testid="asker"
      className="space-y-1 rounded border border-border bg-panel-2 p-2 text-xs"
      aria-label="Who asks"
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span>
          Asked by the sub-agent{" "}
          <span className="font-mono font-semibold" data-testid="asker-name">
            {asker.agent ?? "(unnamed)"}
          </span>
          {depth > 1 && <span className="text-muted"> (nested {depth} deep)</span>}
        </span>
        <button
          type="button"
          onClick={() => showCard(asker.card)}
          className="rounded px-1 text-accent hover:underline"
        >
          show its card
        </button>
      </div>
      {asker.worktree && (
        <div data-testid="asker-worktree" title={asker.worktree.path}>
          Works in an isolated worktree
          {asker.worktree.branch && (
            <>
              {" "}
              on <span className="font-mono">{asker.worktree.branch}</span>
            </>
          )}
        </div>
      )}
      <div className="text-muted" data-testid="asker-spend">
        its spend {formatUsd(asker.costUsd)}
        {asker.steps !== undefined && ` (${asker.steps} model call${asker.steps === 1 ? "" : "s"})`}
        {" · "}turn {formatUsd(asker.turnCostUsd)}
        {asker.costCapUsd !== null && ` of a ${formatCost(asker.costCapUsd)} cap`}
      </div>
    </div>
  );
}

/**
 * The approval for one tool call (docs/UI_DESIGN.md §4). It is styled unlike anything the model
 * can write (docs/SECURITY.md T13). Number keys pick an option, Esc rejects. Focus moves to the
 * panel, not to a button, so a stray Enter approves nothing.
 */
export function PermissionPanel({
  request,
  name,
  summary,
  onChoose,
  onReject,
}: {
  request: PendingPermission;
  name: string;
  summary: string;
  onChoose: (optionId: string) => void;
  onReject: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const parsed = parseApprovalText(request.text, name);
  const { detail } = parsed;
  const warning =
    request.asker && parsed.warning && ASKED_BY.test(parsed.warning.trim())
      ? undefined
      : parsed.warning;

  useEffect(() => {
    const active = document.activeElement;
    const typing = active instanceof HTMLTextAreaElement && active.value.length > 0;
    if (!typing) ref.current?.focus({ preventScroll: false });
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onReject();
      return;
    }
    const index = Number(event.key) - 1;
    const option = Number.isInteger(index) ? request.options[index] : undefined;
    if (option) {
      event.preventDefault();
      event.stopPropagation();
      onChoose(option.optionId);
    }
  }

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-label={`Approval needed: ${name}`}
      onKeyDown={onKeyDown}
      className="mt-2 space-y-3 rounded-md border-2 border-warn bg-panel p-3 outline-none focus:ring-2 focus:ring-warn/40"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-warn">
        <span aria-hidden>⚠</span>
        <span>
          agent86 wants to run <span className="font-mono">{name}</span>
          {summary && <span className="font-mono font-normal text-text"> {summary}</span>}
        </span>
      </div>
      {request.asker && <Asker asker={request.asker} />}
      {warning && (
        <div role="note" className="rounded border border-warn bg-warn/10 p-2 text-sm">
          <strong>Warning:</strong> {warning}
        </div>
      )}
      {/* agent86 1.0.19 sends a write's change as `diff` items; its text is then the same change. */}
      {request.diffs?.length ? <FileDiffs diffs={request.diffs} /> : <DetailView detail={detail} />}
      <div className="flex flex-wrap items-center gap-2">
        {request.options.map((option, i) => {
          const allow = option.kind.startsWith("allow");
          return (
            <button
              key={option.optionId}
              type="button"
              onClick={() => onChoose(option.optionId)}
              className={
                allow
                  ? "rounded bg-accent px-3 py-1 text-sm font-medium text-bg hover:opacity-90"
                  : "rounded border border-border px-3 py-1 text-sm hover:border-error hover:text-error"
              }
            >
              <span className="mr-1.5 font-mono text-xs opacity-70">{i + 1}</span>
              {option.name}
            </button>
          );
        })}
        <span className="ml-auto text-xs text-muted">Esc rejects</span>
      </div>
    </div>
  );
}
