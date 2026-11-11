import type { PendingPermission } from "@agent86-web/acp-client";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { parseApprovalText } from "./approval.ts";
import { DetailView } from "./DetailView.tsx";

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
  const { warning, detail } = parseApprovalText(request.text, name);

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
      {warning && (
        <div role="note" className="rounded border border-warn bg-warn/10 p-2 text-sm">
          <strong>Warning:</strong> {warning}
        </div>
      )}
      <DetailView detail={detail} />
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
