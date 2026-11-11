import { useEffect, useState } from "react";
import { listDirectories, type DirectoryListing } from "../api.ts";

/** Browse the directories under the bridge's roots and choose one as a workspace. */
export function WorkspacePicker({
  initial,
  onChoose,
  onCancel,
}: {
  initial?: string;
  onChoose: (path: string) => void;
  onCancel: () => void;
}) {
  const [path, setPath] = useState<string | undefined>(initial);
  const [listing, setListing] = useState<DirectoryListing | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let live = true;
    listDirectories(path)
      .then((l) => live && (setListing(l), setError(undefined)))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [path]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a workspace"
      className="fixed inset-0 z-30 flex items-start justify-center bg-black/50 p-4 pt-24"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-panel shadow-xl">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Choose a workspace</h2>
          <p className="mt-1 truncate font-mono text-xs text-muted">
            {listing?.path ?? "Allowed roots"}
          </p>
        </div>
        <ul className="max-h-80 overflow-auto py-1 text-sm">
          {listing?.path && (
            <li>
              <button
                type="button"
                className="w-full px-4 py-1.5 text-left text-muted hover:bg-panel-2"
                onClick={() => setPath(listing.parent ?? undefined)}
              >
                ↑ {listing.parent ? ".." : "All roots"}
              </button>
            </li>
          )}
          {listing?.dirs.map((dir) => (
            <li key={dir.path}>
              <button
                type="button"
                className="w-full truncate px-4 py-1.5 text-left font-mono hover:bg-panel-2"
                onClick={() => setPath(dir.path)}
              >
                📁 {dir.name}
              </button>
            </li>
          ))}
          {listing && listing.dirs.length === 0 && (
            <li className="px-4 py-1.5 text-muted">No folders here.</li>
          )}
          {error && (
            <li role="alert" className="px-4 py-1.5 text-error">
              {error}
            </li>
          )}
        </ul>
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border px-3 py-1 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!listing?.path}
            onClick={() => listing?.path && onChoose(listing.path)}
            className="ml-auto rounded bg-accent px-3 py-1 text-sm font-medium text-bg disabled:opacity-40"
          >
            Use this folder
          </button>
        </div>
      </div>
    </div>
  );
}
