import type { InboxItem } from "@agent86-web/acp-client";
import { focusSecretPrompt } from "../secrets/SecretPrompt.tsx";
import { showCard } from "../tools/cardLink.ts";

/**
 * What a question is about: the tool; for a specialty, the project specialist to approve; for a
 * limit, the limit; for a secret, its name once the request has arrived (the question has none).
 */
function subjectOf(item: InboxItem): string {
  const q = item.question;
  if (q.kind === "specialty") return `run the project specialist ${q.subject ?? "(unnamed)"}`;
  if (q.kind === "limit") return `raise the limit ${q.subject ?? ""}`.trim();
  if (q.kind === "secret") return item.secret ? `a secret: ${item.secret.name}` : "a secret";
  return q.tool ?? "a tool call";
}

/**
 * The approval inbox (agent86 1.0.21): the question agent86 is asking and those waiting behind it,
 * in the order they will be asked. agent86 asks one at a time, so only the open request (on its
 * card in the thread) is answerable; this list shows what is coming and links to the cards.
 */
export function Inbox({ items, className = "" }: { items: InboxItem[]; className?: string }) {
  return (
    <aside
      aria-label="Approval inbox"
      data-testid="inbox"
      className={`shrink-0 bg-panel text-sm ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 font-semibold">
        <span aria-hidden className="text-warn">
          ⚠
        </span>
        <span>Approvals</span>
        <span
          data-testid="inbox-count"
          aria-label={`${items.length} question${items.length === 1 ? "" : "s"}`}
          className="rounded-full bg-warn px-1.5 text-xs font-bold text-bg"
        >
          {items.length}
        </span>
      </div>
      <ol className="divide-y divide-border">
        {items.map((item, i) => {
          const q = item.question;
          const asking = item.position === "asking";
          const card = q.card ?? (item.hasCard ? q.call : undefined);
          const place = items.slice(0, i + 1).filter((x) => x.position === "waiting").length;
          return (
            <li
              key={q.call ?? `${item.position}-${i}`}
              data-testid="inbox-item"
              data-position={item.position}
              data-call={q.call}
              className={`space-y-1 px-3 py-2 ${asking ? "bg-warn/10" : ""}`}
            >
              <div className="flex items-baseline gap-2">
                <span className={`text-xs ${asking ? "font-semibold text-warn" : "text-muted"}`}>
                  {asking ? "asking now" : `waiting #${place}`}
                </span>
                <span className="font-mono" data-testid="inbox-agent">
                  {q.agent ?? "main agent"}
                </span>
              </div>
              <div className="font-mono text-xs break-words" data-testid="inbox-subject">
                {subjectOf(item)}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {card && (
                  <button
                    type="button"
                    onClick={() => showCard(card)}
                    className="rounded px-1 text-accent hover:underline"
                  >
                    {q.card ? `${q.agent ?? "sub-agent"}'s card` : "its card"}
                  </button>
                )}
                {asking && q.kind === "secret" && item.secret?.toolCallId && (
                  <button
                    type="button"
                    onClick={() => showCard(item.secret!.toolCallId!)}
                    className="rounded px-1 text-accent hover:underline"
                  >
                    its card
                  </button>
                )}
                {asking &&
                  q.kind === "secret" &&
                  (item.secret ? (
                    <button
                      type="button"
                      onClick={focusSecretPrompt}
                      className="rounded px-1 text-accent hover:underline"
                    >
                      enter it
                    </button>
                  ) : (
                    <span className="text-muted">the request is on its way…</span>
                  ))}
                {asking &&
                  q.kind !== "secret" &&
                  (item.request ? (
                    <button
                      type="button"
                      onClick={() => q.call && showCard(q.call)}
                      className="rounded px-1 text-accent hover:underline"
                    >
                      answer it
                    </button>
                  ) : (
                    <span className="text-muted">the request is on its way…</span>
                  ))}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="px-3 py-2 text-xs text-muted">agent86 asks one at a time, in this order.</p>
    </aside>
  );
}
