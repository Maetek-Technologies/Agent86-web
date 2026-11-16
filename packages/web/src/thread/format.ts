// Numbers as the thread shows them: costs, token counts, and the context window.

/** A cost in a currency, with enough digits for small amounts ($0.0042, not $0.00). */
export function formatCost(amount: number, currency = "USD"): string {
  const digits = amount !== 0 && Math.abs(amount) < 0.01 ? 4 : 2;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    // A currency code Intl does not know: show it as given.
    return `${amount.toFixed(digits)} ${currency}`;
  }
}

/** A dollar cost that may be unknown: "n/a" rather than $0.00. */
export function formatUsd(amount: number | undefined): string {
  return amount === undefined ? "n/a" : formatCost(amount, "USD");
}

/** A token count: 950, 12.3k, 1.2M. */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/** The share of the context window used, 0 to 100. */
export function contextPercent(used: number, size: number): number {
  if (size <= 0) return 0;
  return Math.min(100, Math.round((used / size) * 100));
}
