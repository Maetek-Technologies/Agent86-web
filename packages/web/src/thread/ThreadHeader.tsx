import type { Agent86Client, AgentSession } from "@agent86-web/acp-client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type ConfigOption = ReturnType<AgentSession["getState"]>["configOptions"][number];
type Choice = { value: string; name: string };
type Group = { group: string; name: string; options: Choice[] };

/** A select option's choices, flat or grouped (agent86 groups models: Configured, then providers). */
export function choicesOf(option: ConfigOption): { groups: Group[]; flat: Choice[] } {
  const raw = ("options" in option ? option.options : []) as (Choice | Group)[];
  const groups = raw.filter((o): o is Group => "group" in o);
  const flat = raw.filter((o): o is Choice => "value" in o);
  return { groups, flat };
}

function ConfigSelect({
  option,
  disabled,
  onChange,
}: {
  option: ConfigOption;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { groups, flat } = choicesOf(option);
  const current = String("currentValue" in option ? option.currentValue : "");
  const known =
    flat.some((c) => c.value === current) ||
    groups.some((g) => g.options.some((c) => c.value === current));
  return (
    <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
      <span className="shrink-0">{option.id === "mode" ? "mode" : option.name.toLowerCase()}</span>
      <select
        aria-label={option.name}
        title={
          "description" in option && option.description ? String(option.description) : option.name
        }
        value={current}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 max-w-[16rem] truncate rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-xs text-text disabled:opacity-50"
      >
        {!known && <option value={current}>{current}</option>}
        {flat.map((c) => (
          <option key={c.value} value={c.value}>
            {c.name}
          </option>
        ))}
        {groups.map((g) => (
          <optgroup key={g.group} label={g.name}>
            {g.options.map((c) => (
              <option key={`${g.group}:${c.value}`} value={c.value}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function CopyLogs({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="absolute top-1 right-6 rounded border border-border bg-panel px-1.5 text-xs text-muted hover:text-text"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

/** agent86's notes, with agent86-web's own events dimmed; newest at the bottom, kept in view. */
function LogLines({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);
  return (
    <pre
      ref={ref}
      className="max-h-48 overflow-auto rounded border border-border bg-panel-2 p-2 font-mono text-xs whitespace-pre-wrap"
    >
      {lines.length === 0
        ? "Nothing yet. agent86 writes notes here only about problems and notable events (MCP servers, memory, ignored project settings), so a healthy thread is usually quiet."
        : lines.map((line, i) => (
            <div key={i} className={line.startsWith("[agent86-web]") ? "text-muted" : ""}>
              {line}
            </div>
          ))}
    </pre>
  );
}

/** The thread's settings and tools: model, approval mode, cost, logs (docs/UI_DESIGN.md §3.3). */
export function ThreadHeader({
  session,
  client,
  busy,
  onCost,
}: {
  session: AgentSession;
  client: Agent86Client;
  busy: boolean;
  onCost: () => void;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const logs = useSyncExternalStore(client.subscribeLogs, client.getLogs);
  const [error, setError] = useState<string | undefined>(undefined);
  const [showLogs, setShowLogs] = useState(false);
  const order = ["model", "mode"];
  const options = [...state.configOptions].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  );

  const change = (id: string, value: string) => {
    setError(undefined);
    session
      .setConfigOption(id, value)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="border-b border-border bg-panel/60">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5">
        {options.map((option) => (
          <ConfigSelect
            key={option.id}
            option={option}
            disabled={busy}
            onChange={(v) => change(option.id, v)}
          />
        ))}
        <div className="ml-auto flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={onCost}
            disabled={busy}
            className="rounded px-1.5 py-0.5 text-muted hover:bg-panel-2 hover:text-text disabled:opacity-50"
          >
            $ cost
          </button>
          <button
            type="button"
            aria-expanded={showLogs}
            onClick={() => setShowLogs((v) => !v)}
            title={
              logs.untrusted
                ? "agent86 ignored some of this project's settings"
                : "agent86's notes and connection events"
            }
            className={`rounded px-1.5 py-0.5 hover:bg-panel-2 hover:text-text ${logs.lines.length ? "text-muted" : "text-muted/50"}`}
          >
            logs <span className="font-mono">({logs.lines.length})</span>
            {logs.untrusted && (
              <span
                aria-label="ignored project settings"
                className="ml-1 inline-block h-2 w-2 rounded-full bg-warn align-middle"
              />
            )}
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="mx-auto max-w-3xl px-4 pb-1.5 text-xs text-error">
          {error}
        </div>
      )}
      {showLogs && (
        <div className="relative mx-auto max-w-3xl px-4 pb-2" aria-label="agent86 logs">
          {logs.lines.length > 0 && <CopyLogs text={logs.lines.join("\n")} />}
          <LogLines lines={logs.lines} />
        </div>
      )}
    </div>
  );
}
