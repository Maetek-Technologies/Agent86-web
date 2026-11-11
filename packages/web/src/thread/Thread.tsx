import {
  phase,
  type Agent86Client,
  type AgentSession,
  type FileLink,
} from "@agent86-web/acp-client";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { PhaseLine } from "./PhaseLine.tsx";
import { PromptInput } from "./PromptInput.tsx";
import { ThreadContext } from "./ThreadContext.ts";
import { ThreadHeader } from "./ThreadHeader.tsx";
import { TrustBanner } from "../trust/TrustBanner.tsx";
import { Transcript } from "./Transcript.tsx";

/** Keep a scroll container pinned to the bottom as output arrives, unless the user scrolled up. */
function useStickToBottom(ref: RefObject<HTMLDivElement | null>, dependency: unknown) {
  const pinned = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.clientHeight - el.scrollTop < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [ref, dependency]);
}

export function Thread({
  session,
  client,
  onReconnect,
  onPrompt,
  active = true,
  onTrusted,
}: {
  session: AgentSession;
  client: Agent86Client;
  onReconnect: () => void;
  /** Called with each prompt sent (the first one names the thread). */
  onPrompt?: (text: string) => void;
  /** Only the visible thread answers keys and sets the tab title. */
  active?: boolean;
  /** After the project was trusted: restart agent86 so its settings take effect. */
  onTrusted?: () => void;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const current = phase(state);
  const [expandAll, setExpandAll] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  useStickToBottom(scroller, state.entries);
  const pending = state.permissions[0];

  // Keys, as in the terminal: Esc rejects a waiting approval, else interrupts the turn; a number
  // picks an approval option (when not typing); Ctrl+O expands every tool card.
  useEffect(() => {
    if (!active) return;
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
      // Shift+Tab in the input cycles the approval mode, as in the terminal.
      if (event.key === "Tab" && event.shiftKey && target?.tagName === "TEXTAREA") {
        const mode = session.getState().configOptions.find((o) => o.id === "mode");
        if (mode && "options" in mode && !state.turn.running) {
          event.preventDefault();
          const values = (mode.options as { value?: string }[])
            .map((o) => o.value)
            .filter(Boolean) as string[];
          const at = values.indexOf(String(mode.currentValue));
          void session
            .setConfigOption("mode", values[(at + 1) % values.length]!)
            .catch(() => undefined);
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
  }, [session, state.turn.running, pending, active]);

  // The tab title says when agent86 is waiting on you.
  useEffect(() => {
    if (active) document.title = pending ? "(!) Approval needed · agent86 web" : "agent86 web";
  }, [pending, active]);

  const send = (text: string, links: FileLink[]) => {
    onPrompt?.(text);
    void session.prompt(text, links);
  };

  const context = useMemo(
    () => ({ session, permissions: state.permissions, expandAll }),
    [session, state.permissions, expandAll],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ThreadHeader
        session={session}
        client={client}
        busy={state.turn.running}
        onCost={() => send("/cost", [])}
      />
      <TrustBanner client={client} workspace={state.cwd} onTrusted={() => onTrusted?.()} />
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto" data-testid="transcript">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
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
      </div>
      <div className="border-t border-border bg-bg">
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
            commands={state.commands}
            onSend={send}
          />
        </div>
      </div>
    </div>
  );
}
