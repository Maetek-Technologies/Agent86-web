import type { Agent86Client, AgentSession } from "@agent86-web/acp-client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDefaultMode } from "../threads/defaultMode.ts";
import { contextPercent, formatCost, formatTokens } from "./format.ts";
import { SpendMeter } from "./Spend.tsx";

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

/**
 * The context window and the session's cost, from ACP `usage_update` (agent86 1.0.20). Nothing
 * until one arrives; an unpriced model's cost reads "n/a", never $0.00.
 */
function UsageMeter({
  usage,
}: {
  usage: NonNullable<ReturnType<AgentSession["getState"]>["usage"]>;
}) {
  const percent = contextPercent(usage.used, usage.size);
  const tone = percent >= 90 ? "bg-error" : percent >= 75 ? "bg-warn" : "bg-accent";
  return (
    <span className="flex items-center gap-2 font-mono text-muted" data-testid="usage">
      <span
        className="flex items-center gap-1.5"
        title={`Context: ${usage.used.toLocaleString()} of ${usage.size.toLocaleString()} tokens used by the last request`}
      >
        ctx
        <span
          role="meter"
          aria-label="Context window used"
          aria-valuemin={0}
          aria-valuemax={usage.size}
          aria-valuenow={usage.used}
          className="inline-block h-1.5 w-14 overflow-hidden rounded bg-panel-2"
        >
          <span className={`block h-full ${tone}`} style={{ width: `${percent}%` }} />
        </span>
        {formatTokens(usage.used)}/{formatTokens(usage.size)}
      </span>
      <span
        data-testid="session-cost"
        title={usage.cost ? "This session's cost so far" : "agent86 has no price for this model"}
      >
        {usage.cost ? formatCost(usage.cost.amount, usage.cost.currency) : "cost n/a"}
      </span>
    </span>
  );
}

/** The thread's settings and tools: model, approval mode, cost, logs (docs/UI_DESIGN.md §3.3). */
export function ThreadHeader({
  session,
  client,
  busy,
  onCost,
  panel,
  onPanel,
}: {
  session: AgentSession;
  client: Agent86Client;
  busy: boolean;
  onCost: () => void;
  /** The side panel open now, if any. */
  panel?: "memory" | "secrets" | undefined;
  /** Open or close the memory or secrets panel (shown only when agent86 offers it). */
  onPanel?: (kind: "memory" | "secrets") => void;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const logs = useSyncExternalStore(client.subscribeLogs, client.getLogs);
  const [error, setError] = useState<string | undefined>(undefined);
  const [showLogs, setShowLogs] = useState(false);
  const order = ["model", "mode"];
  const options = [...state.configOptions].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  );

  const defaults = useDefaultMode();
  const mode = state.configOptions.find((o) => o.id === "mode");
  const currentMode = mode && "currentValue" in mode ? String(mode.currentValue) : undefined;
  const [confirmAuto, setConfirmAuto] = useState(false);
  const saveDefault = (value: string) => {
    setConfirmAuto(false);
    setError(undefined);
    defaults
      .set?.(value)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  // auto asks first, as in Settings: every new thread would run tools without asking.
  const makeDefault = () => {
    if (!currentMode) return;
    if (currentMode === "auto") setConfirmAuto(true);
    else saveDefault(currentMode);
  };

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
        {state.routedModel && (
          <span
            className="font-mono text-xs text-muted"
            data-testid="routed-model"
            title="The model triage routing chose for this turn"
          >
            routed: {state.routedModel}
          </span>
        )}
        {currentMode &&
          defaults.set &&
          (currentMode === defaults.mode ? (
            <span
              className="text-xs text-muted"
              title="New threads start in this mode (Settings & about)"
            >
              (default)
            </span>
          ) : (
            <button
              type="button"
              onClick={makeDefault}
              title={`Start new threads in ${currentMode} mode, in every browser`}
              className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-panel-2 hover:text-text"
            >
              make default
            </button>
          ))}
        <div className="ml-auto flex items-center gap-2 text-xs">
          {busy && state.turnSpend && (
            <span className="text-muted">
              <SpendMeter spend={state.turnSpend} />
            </span>
          )}
          {state.usage && <UsageMeter usage={state.usage} />}
          <button
            type="button"
            onClick={onCost}
            disabled={busy}
            className="rounded px-1.5 py-0.5 text-muted hover:bg-panel-2 hover:text-text disabled:opacity-50"
          >
            $ cost
          </button>
          {onPanel && client.features.memory && (
            <button
              type="button"
              aria-pressed={panel === "memory"}
              onClick={() => onPanel("memory")}
              title="What agent86 has learned: list, pin, and forget"
              className={`rounded px-1.5 py-0.5 hover:bg-panel-2 hover:text-text ${panel === "memory" ? "bg-panel-2 text-text" : "text-muted"}`}
            >
              memory
            </button>
          )}
          {onPanel && client.features.secrets && (
            <button
              type="button"
              aria-pressed={panel === "secrets"}
              onClick={() => onPanel("secrets")}
              title="Secrets for this session: the model sees only their names"
              className={`rounded px-1.5 py-0.5 hover:bg-panel-2 hover:text-text ${panel === "secrets" ? "bg-panel-2 text-text" : "text-muted"}`}
            >
              secrets
            </button>
          )}
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
      {confirmAuto && currentMode === "auto" && (
        <div
          role="alertdialog"
          aria-label="Confirm auto mode"
          className="mx-auto mb-1.5 flex max-w-3xl flex-wrap items-center gap-2 px-4 text-xs"
        >
          <span>
            Start every new thread in <span className="font-mono">auto</span> mode? agent86 will
            edit files and run commands without asking.
          </span>
          <button
            type="button"
            autoFocus
            onClick={() => setConfirmAuto(false)}
            className="rounded border border-border px-2 py-0.5 hover:border-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveDefault("auto")}
            className="rounded border border-warn px-2 py-0.5 font-medium text-warn hover:bg-warn/10"
          >
            Use auto
          </button>
        </div>
      )}
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
