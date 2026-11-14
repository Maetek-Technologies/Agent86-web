// A thread's approval mode and model across reopening. agent86 keeps neither with the session
// (checked against 1.0.18: `session/load` reports its defaults), so the thread remembers them and
// sets them again on the session agent86 reopens: after a reload, an idle restart, or a new bridge.
import type { AgentSession } from "@agent86-web/acp-client";

/** The session settings a thread keeps, by agent86 config option id. */
export interface ThreadSettings {
  mode?: string;
  model?: string;
}

/** Restored in this order: the model first, so the mode is the last word on approvals. */
const KEPT = ["model", "mode"] as const;
type Kept = (typeof KEPT)[number];

/** How long to wait for a model from a provider's live list to be offered before giving up. */
export const MODEL_LIST_WAIT_MS = 20_000;

type ConfigOption = ReturnType<AgentSession["getState"]>["configOptions"][number];

function currentOf(session: AgentSession, id: string): string | undefined {
  const option = session.getState().configOptions.find((o) => o.id === id);
  return option && "currentValue" in option ? String(option.currentValue) : undefined;
}

/** Whether a select option offers `value`, flat or in a group. */
export function offers(option: ConfigOption | undefined, value: string): boolean {
  if (!option || !("options" in option)) return false;
  return (option.options as ({ value?: string } | { options?: { value?: string }[] })[]).some(
    (o) =>
      ("value" in o && o.value === value) ||
      ("options" in o && (o.options ?? []).some((c) => c.value === value)),
  );
}

function offered(session: AgentSession, id: string, value: string): boolean {
  return offers(
    session.getState().configOptions.find((o) => o.id === id),
    value,
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Restores a thread's settings on a session, then reports every change to them (from the header,
 * Shift+Tab, or `/mode`) so the thread can remember it.
 */
export class SettingsKeeper {
  private settings: ThreadSettings = {};
  /** A model still to be restored; until then the thread keeps it rather than the stand-in. */
  private pendingModel: string | undefined;
  private unsubscribe: (() => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(
    private readonly session: AgentSession,
    private readonly changed: (settings: ThreadSettings) => void,
    private readonly modelWaitMs = MODEL_LIST_WAIT_MS,
  ) {}

  /**
   * Set `wanted` on the session. Resolves once the mode is set, so no turn runs under the wrong
   * approvals. A model agent86 does not offer yet (one from a provider's live list, filled in the
   * background) is set when it is offered, unless the user picks a model first. Returns what it
   * changed, such as `mode auto`.
   */
  async restore(wanted: ThreadSettings): Promise<string[]> {
    this.settings = { ...wanted };
    const changed: string[] = [];
    let later: string | undefined;
    for (const id of KEPT) {
      const value = wanted[id];
      if (!value || currentOf(this.session, id) === value) continue;
      if (id === "model" && !offered(this.session, id, value)) {
        later = value;
        continue;
      }
      if (await this.apply(id, value)) changed.push(`${id} ${value}`);
    }
    if (this.stopped) return changed;
    this.pendingModel = later;
    const modelBefore = currentOf(this.session, "model");
    this.unsubscribe = this.session.subscribe(() => this.onChange(modelBefore));
    if (later) {
      this.timer = setTimeout(() => this.giveUpOnModel(), this.modelWaitMs);
      this.onChange(modelBefore);
    } else this.record();
    return changed;
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.unsubscribe?.();
  }

  private onChange(modelBefore: string | undefined): void {
    const model = this.pendingModel;
    if (model) {
      if (currentOf(this.session, "model") !== modelBefore) {
        // Picked meanwhile (or agent86 changed it): that choice stands.
        this.settled();
      } else if (offered(this.session, "model", model)) {
        this.settled();
        void this.apply("model", model);
        return;
      }
    }
    this.record();
  }

  private giveUpOnModel(): void {
    const model = this.pendingModel;
    if (!model || this.stopped) return;
    this.settled();
    const now = currentOf(this.session, "model");
    this.session.notice(
      "warning",
      `agent86 does not offer ${model}, this thread's model, any more. It is using ${now ?? "its default"}.`,
    );
    this.record();
  }

  private settled(): void {
    this.pendingModel = undefined;
    clearTimeout(this.timer);
  }

  private async apply(id: Kept, value: string): Promise<boolean> {
    try {
      await this.session.setConfigOption(id, value);
      return true;
    } catch (error) {
      if (this.stopped) return false;
      const now = currentOf(this.session, id);
      this.session.notice(
        "warning",
        `Could not set this thread's ${id} back to ${value}: ${errorText(error).replace(/[.!?]?$/, ".")}` +
          (now ? ` It is using ${now}.` : ""),
      );
      return false;
    }
  }

  private record(): void {
    if (this.stopped) return;
    const next: ThreadSettings = { ...this.settings };
    for (const id of KEPT) {
      if (id === "model" && this.pendingModel) continue;
      const value = currentOf(this.session, id);
      if (value) next[id] = value;
    }
    if (next.mode === this.settings.mode && next.model === this.settings.model) return;
    this.settings = next;
    this.changed(next);
  }
}
