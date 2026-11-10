import type { ReactNode } from "react";
import { useHandshake, type Step } from "./useHandshake.ts";

const STEPS: { step: Step; label: string }[] = [
  { step: "signing-in", label: "Sign in to the bridge" },
  { step: "reading-info", label: "Read the bridge's settings" },
  { step: "connecting", label: "Start agent86 acp" },
  { step: "initializing", label: "Initialize ACP" },
];

function Header({ version }: { version?: string | undefined }) {
  return (
    <header className="flex items-center gap-3 border-b border-border bg-panel px-4 py-3">
      <img src="/agent86-logo.png" alt="" width={36} height={36} className="rounded-full" />
      <div className="font-mono text-lg font-bold tracking-widest">
        AGENT 86{" "}
        <span className="font-sans text-sm font-normal tracking-normal text-muted">web</span>
      </div>
      {version && <div className="ml-auto font-mono text-xs text-muted">agent86 {version}</div>}
    </header>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
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

function Progress({ current }: { current: Step }) {
  const index = STEPS.findIndex((s) => s.step === current);
  const done = current === "ready";
  return (
    <ol className="space-y-1 text-sm">
      {STEPS.map((s, i) => {
        const state = done || i < index ? "done" : i === index ? "active" : "todo";
        const failed = current === "failed";
        return (
          <li key={s.step} className="flex items-center gap-2">
            <span
              aria-hidden
              className={
                state === "done"
                  ? "text-ok"
                  : state === "active" && !failed
                    ? "animate-pulse text-accent"
                    : "text-muted"
              }
            >
              {state === "done" ? "✓" : state === "active" ? "●" : "○"}
            </span>
            <span className={state === "todo" ? "text-muted" : ""}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function App() {
  const { step, info, handshake, error, closed, retry } = useHandshake();
  const init = handshake?.init;
  const compatibility = handshake?.compatibility;

  return (
    <div className="min-h-screen">
      <Header version={info?.agent86.version} />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <Card title="Connection">
          {step !== "ready" && step !== "failed" && <Progress current={step} />}

          {step === "failed" && (
            <div role="alert" className="space-y-3">
              <p className="text-error">{error}</p>
              <button
                type="button"
                onClick={retry}
                className="rounded border border-border bg-panel-2 px-3 py-1 text-sm hover:border-accent"
              >
                Try again
              </button>
            </div>
          )}

          {step === "ready" && compatibility && (
            <div className="space-y-2" data-testid="handshake">
              {compatibility.ok ? (
                <p className="text-ok" role="status">
                  ✓ Connected to {init?.agentInfo?.title ?? "agent86"} {init?.agentInfo?.version}
                </p>
              ) : (
                <div role="alert" className="text-warn">
                  <p>Connected, but this agent is not supported:</p>
                  <ul className="ml-5 list-disc">
                    {compatibility.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {closed && <p className="text-sm text-muted">{closed}</p>}
            </div>
          )}
        </Card>

        {init && (
          <Card title="Agent">
            <dl>
              <Row label="Name">{init.agentInfo?.name ?? "—"}</Row>
              <Row label="Version">{init.agentInfo?.version ?? "—"}</Row>
              <Row label="ACP protocol version">{init.protocolVersion}</Row>
              <Row label="Reopens saved sessions">
                {init.agentCapabilities?.loadSession ? "yes" : "no"}
              </Row>
              <Row label="Lists sessions">
                {init.agentCapabilities?.sessionCapabilities?.list ? "yes" : "no"}
              </Row>
              <Row label="Prompt content">
                {["text", "file links"]
                  .concat(init.agentCapabilities?.promptCapabilities?.image ? ["images"] : [])
                  .concat(init.agentCapabilities?.promptCapabilities?.audio ? ["audio"] : [])
                  .join(", ")}
              </Row>
              <Row label="MCP transports">
                {["stdio"]
                  .concat(init.agentCapabilities?.mcpCapabilities?.http ? ["http"] : [])
                  .concat(init.agentCapabilities?.mcpCapabilities?.sse ? ["sse"] : [])
                  .join(", ")}
              </Row>
            </dl>
          </Card>
        )}

        {info && (
          <Card title="Bridge">
            <dl>
              <Row label="agent86-web">{info.bridge.version}</Row>
              <Row label="agent86 command">{info.agent86.command}</Row>
              <Row label="Minimum agent86">{info.agent86.minVersion}</Row>
              <Row label="Workspaces">{info.roots.join(", ")}</Row>
            </dl>
          </Card>
        )}

        <p className="text-center text-xs text-muted">
          A browser interface for{" "}
          <a
            className="underline"
            href="https://github.com/Maetek-Technologies/agent86"
            rel="noopener noreferrer"
          >
            agent86
          </a>{" "}
          by Maetek Technologies. Milestone M1: the handshake. Chat arrives in M2.
        </p>
      </main>
    </div>
  );
}
