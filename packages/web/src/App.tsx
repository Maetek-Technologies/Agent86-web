import { useState, type ReactNode } from "react";
import { Thread } from "./thread/Thread.tsx";
import { useAgent, type AgentState, type Step } from "./useAgent.ts";

const STEPS: { step: Step; label: string }[] = [
  { step: "signing-in", label: "Sign in to the bridge" },
  { step: "reading-info", label: "Read the bridge's settings" },
  { step: "connecting", label: "Start agent86 acp" },
  { step: "initializing", label: "Initialize ACP" },
  { step: "starting-session", label: "Start a session" },
];

function CopyText({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded px-1 font-mono hover:bg-panel-2"
    >
      {copied ? "copied" : text}
    </button>
  );
}

function Header({ state, onShowDetails }: { state: AgentState; onShowDetails: () => void }) {
  const sessionId = state.session?.id;
  return (
    <header className="sticky top-0 z-10 flex h-[61px] items-center gap-3 border-b border-border bg-panel px-4">
      <img src="/agent86-logo.png" alt="" width={36} height={36} className="rounded-full" />
      <div className="font-mono text-lg font-bold tracking-widest">
        AGENT 86{" "}
        <span className="font-sans text-sm font-normal tracking-normal text-muted">web</span>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-3 text-xs text-muted">
        {sessionId && (
          <span
            className="hidden truncate sm:inline"
            title={`Continue at a terminal: agent86 --resume ${sessionId}`}
          >
            session <CopyText text={sessionId} label="session id" />
          </span>
        )}
        {state.info && (
          <button type="button" onClick={onShowDetails} className="font-mono hover:text-text">
            agent86 {state.info.agent86.version}
          </button>
        )}
      </div>
    </header>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 py-1 text-sm">
      <dt className="w-44 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-all font-mono">{children}</dd>
    </div>
  );
}

function Details({ state, onClose }: { state: AgentState; onClose: () => void }) {
  const init = state.client?.init;
  const caps = init?.agentCapabilities;
  return (
    <div className="border-b border-border bg-panel-2">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <div className="mb-2 flex items-center">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Connection</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-sm text-muted hover:text-text"
          >
            Close
          </button>
        </div>
        <dl>
          {init && (
            <>
              <Row label="Agent">
                {init.agentInfo?.name} {init.agentInfo?.version}
              </Row>
              <Row label="ACP protocol version">{init.protocolVersion}</Row>
              <Row label="Reopens saved sessions">{caps?.loadSession ? "yes" : "no"}</Row>
              <Row label="Prompt content">
                {["text", "file links"]
                  .concat(caps?.promptCapabilities?.image ? ["images"] : [])
                  .concat(caps?.promptCapabilities?.audio ? ["audio"] : [])
                  .join(", ")}
              </Row>
            </>
          )}
          {state.info && (
            <>
              <Row label="agent86-web">{state.info.bridge.version}</Row>
              <Row label="agent86 command">{state.info.agent86.command}</Row>
              <Row label="Workspaces">{state.info.roots.join(", ")}</Row>
            </>
          )}
          {state.session && <Row label="Session">{state.session.id}</Row>}
        </dl>
        <p className="mt-3 text-xs text-muted">
          A browser interface for{" "}
          <a
            className="underline"
            href="https://github.com/Maetek-Technologies/agent86"
            target="_blank"
            rel="noopener noreferrer"
          >
            agent86
          </a>{" "}
          by Maetek Technologies.
        </p>
      </div>
    </div>
  );
}

/** agent86 refuses to start a session without a usable model, usually a missing key. */
function ModelHelp() {
  return (
    <div className="space-y-2 rounded border border-border bg-panel-2 p-3 text-sm">
      <p>agent86 could not start a session. Usually its model has no API key yet. At a terminal:</p>
      <pre className="overflow-x-auto font-mono text-xs">
        {"agent86 keys set <provider>      # e.g. anthropic, openai, openrouter\n" +
          "agent86                          # or: /config model, to pick a provider and model"}
      </pre>
      <p className="text-muted">
        Model setup is terminal-only for now (docs/FEATURE_PARITY.md). Then choose Try again.
      </p>
    </div>
  );
}

function Connecting({ state, onRetry }: { state: AgentState; onRetry: () => void }) {
  const index = STEPS.findIndex((s) => s.step === state.step);
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <section className="rounded-lg border border-border bg-panel p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Connecting
        </h2>
        {state.step === "failed" ? (
          <div role="alert" className="space-y-3">
            <p className="text-error">{state.error}</p>
            {state.failedAt === "starting-session" && <ModelHelp />}
            <button
              type="button"
              onClick={onRetry}
              className="rounded border border-border bg-panel-2 px-3 py-1 text-sm hover:border-accent"
            >
              Try again
            </button>
          </div>
        ) : (
          <ol className="space-y-1 text-sm">
            {STEPS.map((s, i) => (
              <li key={s.step} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={
                    i < index ? "text-ok" : i === index ? "animate-pulse text-accent" : "text-muted"
                  }
                >
                  {i < index ? "✓" : i === index ? "●" : "○"}
                </span>
                <span className={i > index ? "text-muted" : ""}>{s.label}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

export function App() {
  const state = useAgent();
  const [details, setDetails] = useState(false);
  return (
    <div className="min-h-screen">
      <Header state={state} onShowDetails={() => setDetails((d) => !d)} />
      {details && <Details state={state} onClose={() => setDetails(false)} />}
      {state.step === "ready" && state.session ? (
        <Thread key={state.session.id} session={state.session} onReconnect={state.restart} />
      ) : (
        <Connecting state={state} onRetry={state.restart} />
      )}
    </div>
  );
}
