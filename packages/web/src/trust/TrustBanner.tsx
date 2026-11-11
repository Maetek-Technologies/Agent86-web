import type { Agent86Client } from "@agent86-web/acp-client";
import { useState, useSyncExternalStore } from "react";
import { TrustDialog } from "./TrustDialog.tsx";

/** Shown when agent86 says it ignored the project's riskier settings (docs/UI_DESIGN.md §3.4). */
export function TrustBanner({
  client,
  workspace,
  onTrusted,
}: {
  client: Agent86Client;
  workspace: string;
  onTrusted: () => void;
}) {
  const logs = useSyncExternalStore(client.subscribeLogs, client.getLogs);
  const [dismissed, setDismissed] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  if (!logs.untrusted || dismissed) return null;
  return (
    <div role="region" aria-label="Project trust" className="border-b border-warn bg-warn/10">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <span className="min-w-0 flex-1">
          This project's agent86 settings (
          <span className="font-mono">{logs.untrusted.keys.slice(0, 3).join(", ")}</span>
          {logs.untrusted.count > 3 ? ", …" : ""}) are being ignored until you trust them.
        </span>
        <button
          type="button"
          onClick={() => setReviewing(true)}
          className="rounded border border-warn px-2 py-0.5 font-medium text-warn hover:bg-warn/10"
        >
          Review and trust
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded px-2 py-0.5 text-muted hover:text-text"
        >
          Dismiss
        </button>
      </div>
      {reviewing && (
        <TrustDialog
          workspace={workspace}
          untrusted={logs.untrusted}
          onCancel={() => setReviewing(false)}
          onTrusted={() => {
            setReviewing(false);
            onTrusted();
          }}
        />
      )}
    </div>
  );
}
