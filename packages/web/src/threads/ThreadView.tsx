import { Thread } from "../thread/Thread.tsx";
import type { ThreadHandle, ThreadSnapshot } from "./manager.ts";

const PHASE_TEXT: Record<string, string> = {
  connecting: "Starting agent86…",
  starting: "Starting a session…",
  loading: "Reopening the session…",
  "waiting-turn":
    "agent86 is finishing a turn started before the page reloaded. The session reopens when it ends…",
  reconnecting: "Reconnecting…",
};

/** agent86 refuses to start a session without a usable model, usually a missing key. */
function ModelHelp() {
  return (
    <div className="space-y-2 rounded border border-border bg-panel-2 p-3 text-sm">
      <p>agent86 could not start a session. Usually its model has no API key yet. At a terminal:</p>
      <pre className="overflow-x-auto font-mono text-xs">
        {"agent86 keys set <provider>      # e.g. anthropic, openai, openrouter\n" +
          "agent86                          # or: /config model, to pick a provider and model"}
      </pre>
      <p className="text-muted">Model setup is terminal-only for now. Then choose Try again.</p>
    </div>
  );
}

/** One open thread: its conversation once ready, else where its connection stands. */
export function ThreadView({
  thread,
  handle,
  active,
  onSessionsChanged,
}: {
  thread: ThreadSnapshot;
  handle: ThreadHandle;
  active: boolean;
  onSessionsChanged: () => void;
}) {
  if (thread.phase === "ready" && thread.session && thread.client) {
    return (
      <Thread
        session={thread.session}
        client={thread.client}
        active={active}
        onReconnect={() => void handle.connect()}
        onTrusted={() => void handle.connect(true)}
        onPrompt={(text) => {
          if (thread.meta.title === "New thread")
            handle.setTitle(text.split("\n")[0]!.slice(0, 40));
          // The session list shows titles and times; refresh it after this prompt is saved.
          setTimeout(onSessionsChanged, 1500);
        }}
      />
    );
  }
  const failed = thread.phase === "failed" || thread.phase === "taken";
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <section className="rounded-lg border border-border bg-panel p-4">
        <h2 className="mb-1 font-semibold">{thread.meta.title}</h2>
        <p className="mb-3 font-mono text-xs text-muted">{thread.meta.workspace}</p>
        {failed ? (
          <div role="alert" className="space-y-3">
            <p className="text-error">{thread.error}</p>
            {thread.failedAt === "starting" && <ModelHelp />}
            <button
              type="button"
              onClick={() => void handle.connect()}
              className="rounded border border-border bg-panel-2 px-3 py-1 text-sm hover:border-accent"
            >
              {thread.phase === "taken" ? "Use it here" : "Try again"}
            </button>
          </div>
        ) : (
          <p role="status" aria-label="Thread status" className="flex items-center gap-2 text-sm">
            <span aria-hidden className="animate-pulse text-accent">
              ●
            </span>
            {PHASE_TEXT[thread.phase] ?? thread.phase}
            {thread.phase === "reconnecting" && thread.error && (
              <span className="text-muted">({thread.error})</span>
            )}
          </p>
        )}
      </section>
    </div>
  );
}
