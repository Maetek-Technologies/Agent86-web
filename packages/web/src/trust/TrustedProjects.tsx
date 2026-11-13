import { useCallback, useEffect, useState } from "react";
import { listTrusted, revokeTrust, type TrustRecord } from "../api.ts";

/** The projects trusted from this browser, with a way to take trust back. */
export function TrustedProjects() {
  const [records, setRecords] = useState<TrustRecord[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const reload = useCallback(() => {
    listTrusted().then(setRecords, (e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, []);
  useEffect(reload, [reload]);
  return (
    <section aria-label="Trusted projects" className="mt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Trusted projects</h3>
      {records?.length === 0 && (
        <p className="mt-1 text-sm text-muted">
          None yet. If a project's <span className="font-mono">.agent86/config.toml</span> has
          settings that need trust, its thread shows a banner where you can review and trust it.
        </p>
      )}
      <ul className="mt-1 space-y-1">
        {records?.map((r) => (
          <li key={r.path} className="flex items-center gap-3 text-sm">
            <span
              className="min-w-0 flex-1 truncate font-mono"
              title={`${r.path}\nsha256 ${r.sha256}`}
            >
              {r.path}
            </span>
            <span className="shrink-0 text-xs text-muted">
              {new Date(r.trustedAt).toLocaleDateString()}
            </span>
            <button
              type="button"
              onClick={() => revokeTrust(r.path).then(reload, (e: unknown) => setError(String(e)))}
              className="rounded border border-border px-2 py-0.5 text-xs hover:border-error hover:text-error"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-error">{error}</p>}
    </section>
  );
}
