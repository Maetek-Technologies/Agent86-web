import type { Agent86Client, AgentSession } from "@agent86-web/acp-client";
import { useState, useSyncExternalStore } from "react";

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
            className="rounded px-1.5 py-0.5 text-muted hover:bg-panel-2 hover:text-text"
          >
            logs
            {logs.lines.length > 0 && <span className="ml-1 font-mono">({logs.lines.length})</span>}
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="mx-auto max-w-3xl px-4 pb-1.5 text-xs text-error">
          {error}
        </div>
      )}
      {showLogs && (
        <div className="mx-auto max-w-3xl px-4 pb-2" aria-label="agent86 logs">
          <pre className="max-h-48 overflow-auto rounded border border-border bg-panel-2 p-2 font-mono text-xs whitespace-pre-wrap">
            {logs.lines.length ? logs.lines.join("\n") : "agent86 has not written any notes."}
          </pre>
        </div>
      )}
    </div>
  );
}
