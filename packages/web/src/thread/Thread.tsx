import { phase, type AgentSession } from "@agent86-web/acp-client";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { PhaseLine } from "./PhaseLine.tsx";
import { PromptInput } from "./PromptInput.tsx";
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
  useStickToBottom(state.entries);

  // Esc interrupts the turn, as in the terminal.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state.turn.running && !event.isComposing) {
        event.preventDefault();
        void session.cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, state.turn.running]);

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
          <Transcript entries={state.entries} />
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
