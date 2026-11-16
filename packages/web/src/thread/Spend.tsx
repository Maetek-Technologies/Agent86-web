import type { ModelCall, TurnSpend } from "@agent86-web/acp-client";
import { formatTokens, formatUsd } from "./format.ts";

/**
 * A turn's spend against `[limits] max_cost_usd`, from agent86's state events. With no cap, just
 * the spend. A turn that used an unpriced model shows its spend as "at least".
 */
export function SpendMeter({ spend }: { spend: TurnSpend }) {
  const spent = spend.spentUsd;
  const prefix = spend.priced ? "" : "≥ ";
  const label = spent === undefined ? "cost n/a" : `${prefix}${formatUsd(spent)}`;
  if (spend.capUsd === null || spend.capUsd <= 0) {
    return (
      <span className="font-mono" data-testid="turn-spend" title="This turn's model calls">
        turn {label}
      </span>
    );
  }
  const share = spent === undefined ? 0 : Math.min(1, spent / spend.capUsd);
  const tone = share >= 0.9 ? "bg-error" : share >= 0.7 ? "bg-warn" : "bg-accent";
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono"
      data-testid="turn-spend"
      title={`This turn's spend against the cap ([limits] max_cost_usd)${spend.priced ? "" : "; an unpriced model's calls are not counted"}`}
    >
      turn {label} / {formatUsd(spend.capUsd)}
      <span
        role="meter"
        aria-label="Turn spend against the cap"
        aria-valuemin={0}
        aria-valuemax={spend.capUsd}
        aria-valuenow={spent ?? 0}
        className="inline-block h-1.5 w-16 overflow-hidden rounded bg-panel-2"
      >
        <span className={`block h-full ${tone}`} style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
    </span>
  );
}

/** One line per model call: step, model, tokens, cost. */
export function ModelCalls({ calls }: { calls: ModelCall[] }) {
  return (
    <ol className="space-y-0.5 font-mono text-xs text-muted" aria-label="Model calls">
      {calls.map((call, i) => (
        <li key={i}>
          step {call.step ?? i + 1} · {call.model ?? "model"} ·{" "}
          {formatTokens(call.inputTokens ?? 0)} in / {formatTokens(call.outputTokens ?? 0)} out ·{" "}
          {formatUsd(call.costUsd)}
          {call.toolCalls.length > 0 && ` → ${call.toolCalls.join(", ")}`}
        </li>
      ))}
    </ol>
  );
}
