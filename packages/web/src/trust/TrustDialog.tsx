import type { Untrusted } from "@agent86-web/acp-client";
import { useEffect, useRef, useState } from "react";
import { getTrust, trustProject, type ProjectConfig } from "../api.ts";
import { showControls } from "./showControls.ts";

/**
 * Review a project's agent86 config file before trusting it (docs/adr/0004). The whole file is
 * shown, with control characters made visible, and Cancel has the focus: trusting takes a
 * deliberate click (docs/SECURITY.md T16).
 */
export function TrustDialog({
  workspace,
  untrusted,
  onTrusted,
  onCancel,
}: {
  workspace: string;
  untrusted: Untrusted | undefined;
  onTrusted: () => void;
  onCancel: () => void;
}) {
  const [config, setConfig] = useState<ProjectConfig | null | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    getTrust(workspace)
      .then((r) => live && setConfig(r.config))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [workspace]);

  useEffect(() => {
    cancel.current?.focus();
  }, [config]);

  async function trust() {
    if (!config) return;
    setBusy(true);
    setError(undefined);
    try {
      await trustProject(workspace, config.sha256);
      onTrusted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // The file may have changed: show what it is now.
      getTrust(workspace).then(
        (r) => setConfig(r.config),
        () => undefined,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review and trust this project's agent86 settings"
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <div className="w-full max-w-2xl rounded-lg border-2 border-warn bg-panel shadow-xl">
        <div className="space-y-2 border-b border-border px-4 py-3">
          <h2 className="font-semibold">Trust this project's agent86 settings?</h2>
          <p className="text-sm">
            <strong className="text-warn">
              Trusting lets these settings run programs on your machine and change where your keys
              are sent.
            </strong>{" "}
            agent86 ignores them until you trust the file. Only trust a file you have read and
            expect.
          </p>
          {untrusted && (
            <p className="text-sm text-muted">
              Ignored now ({untrusted.count}):{" "}
              <span className="font-mono">{untrusted.keys.join(", ")}</span>
            </p>
          )}
        </div>
        <div className="space-y-2 px-4 py-3">
          {config === undefined && !error && (
            <p className="text-sm text-muted">Reading the file…</p>
          )}
          {config === null && (
            <p className="text-sm text-muted">This workspace has no .agent86/config.toml.</p>
          )}
          {config && (
            <>
              <div className="font-mono text-xs text-muted">
                <div className="truncate" title={config.path}>
                  {config.path}
                </div>
                <div>sha256 {config.sha256}</div>
              </div>
              <pre
                aria-label="Project config file"
                className="max-h-80 overflow-auto rounded border border-border bg-panel-2 p-3 font-mono text-xs whitespace-pre-wrap"
              >
                {showControls(config.contents)}
              </pre>
              <p className="text-xs text-muted">
                Trust given here applies to threads agent86-web starts. agent86 at a terminal keeps
                its own record and will still ask. If the file changes, it needs trust again.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <button
            ref={cancel}
            type="button"
            onClick={onCancel}
            className="rounded border border-border px-3 py-1 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!config || busy}
            onClick={() => void trust()}
            className="ml-auto rounded border-2 border-warn px-3 py-1 text-sm font-medium text-warn hover:bg-warn/10 disabled:opacity-40"
          >
            Trust this file
          </button>
        </div>
      </div>
    </div>
  );
}
