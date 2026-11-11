import { phase, type AgentSession } from "@agent86-web/acp-client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PhaseLine } from "./PhaseLine.tsx";
import { PromptInput } from "./PromptInput.tsx";
import { ThreadContext } from "./ThreadContext.ts";
import { Transcript } from "./Transcript.tsx";

/** Keep the view pinned to the bottom while new output arrives, unless the user scrolled up. */
function useStickToBottom(dependency: unknown) {
  const pinned = useRef(true);
  useEffect(() => {
    const onScroll = () => {
      const distance = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      pinned.current = distance < 80;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    if (pinned.current) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [dependency]);
}

export function Thread({
  session,
  onReconnect,
}: {
  session: AgentSession;
  onReconnect: () => void;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const current = phase(state);
  const [expandAll, setExpandAll] = useState(false);
  useStickToBottom(state.entries);
  const pending = state.permissions[0];

  // Keys, as in the terminal: Esc rejects a waiting approval, else interrupts the turn; a number
  // picks an approval option (when not typing); Ctrl+O expands every tool card.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const target = event.target as HTMLElement | null;
      const editing = !!target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT");
      if (event.key === "Escape") {
        if (pending) {
          event.preventDefault();
          session.reject(pending.id);
        } else if (state.turn.running) {
          event.preventDefault();
          void session.cancel();
        }
        return;
      }
      if (event.key.toLowerCase() === "o" && event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        setExpandAll((value) => !value);
        return;
      }
      if (pending && !editing && /^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey) {
        const option = pending.options[Number(event.key) - 1];
        if (option) {
          event.preventDefault();
          session.respond(pending.id, option.optionId);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, state.turn.running, pending]);

  // The tab title says when agent86 is waiting on you.
  useEffect(() => {
    document.title = pending ? "(!) Approval needed · agent86 web" : "agent86 web";
  }, [pending]);

  const context = useMemo(
    () => ({ session, permissions: state.permissions, expandAll }),
    [session, state.permissions, expandAll],
  );

  return (
    <div className="flex min-h-[calc(100vh-61px)] flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {state.entries.length === 0 ? (
          <div className="py-16 text-center text-muted">
            <p className="text-lg">What should agent86 do?</p>
            <p className="mt-2 text-sm">
              It works in <span className="font-mono">{state.cwd}</span>. Try a question, or a
              command such as <span className="font-mono">/cost</span> or{" "}
              <span className="font-mono">/tools</span>.
            </p>
          </div>
        ) : (
          <ThreadContext.Provider value={context}>
            <Transcript entries={state.entries} />
          </ThreadContext.Provider>
        )}
      </div>
      <div className="sticky bottom-0 border-t border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-3">
          {current && (
            <PhaseLine
              label={current}
              startedAt={state.turn.startedAt}
              cancelling={state.turn.cancelRequested}
              onStop={() => void session.cancel()}
            />
          )}
          {state.closed && (
            <div role="alert" className="flex items-center gap-3 text-sm text-error">
              <span>{state.closed}</span>
              <button
                type="button"
                onClick={onReconnect}
                className="rounded border border-border px-2 py-0.5 text-text hover:border-accent"
              >
                Start a new session
              </button>
            </div>
          )}
          <PromptInput
            workspace={state.cwd}
            busy={state.turn.running}
            disabled={!!state.closed}
            onSend={(text) => void session.prompt(text)}
          />
        </div>
      </div>
    </div>
  );
}
