import { useEffect, useState } from "react";

/** Seconds since `since`, updated every second while `active`. */
export function useElapsed(since: number | undefined, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return since === undefined ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function formatChars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k chars` : `${n} chars`;
}
