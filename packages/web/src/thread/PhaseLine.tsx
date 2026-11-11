import { useElapsed } from "./useElapsed.ts";

export function PhaseLine({
  label,
  startedAt,
  cancelling,
  onStop,
}: {
  label: string;
  startedAt: number | undefined;
  cancelling: boolean;
  onStop: () => void;
}) {
  const seconds = useElapsed(startedAt, true);
  return (
    <div className="flex items-center gap-2 text-sm" role="status" aria-label="Agent status">
      <span aria-hidden className="animate-pulse text-accent">
        ✻
      </span>
      <span>{label}</span>
      <span className="text-muted">
        ({seconds}s · esc to {cancelling ? "wait" : "interrupt"})
      </span>
      <button
        type="button"
        onClick={onStop}
        disabled={cancelling}
        className="ml-auto rounded border border-border px-2 py-0.5 text-xs hover:border-error hover:text-error disabled:opacity-50"
      >
        ■ Stop
      </button>
    </div>
  );
}
