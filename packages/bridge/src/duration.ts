/** `90s`, `15m`, `1h` (or a bare number of seconds) in milliseconds; null when unreadable. */
export function parseDuration(text: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*(s|m|h)?$/.exec(text.trim());
  if (!match) return null;
  const unit = { s: 1_000, m: 60_000, h: 3_600_000 }[(match[2] ?? "s") as "s" | "m" | "h"];
  const ms = Number(match[1]) * unit;
  return ms > 0 ? ms : null;
}
