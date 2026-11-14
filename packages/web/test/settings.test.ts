import type { AgentSession } from "@agent86-web/acp-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offers, SettingsKeeper, type ThreadSettings } from "../src/threads/settings.ts";

/**
 * A session as agent86 1.0.18 reopens one: in its default mode and model, whatever the session had
 * before. Only what SettingsKeeper uses: getState, subscribe, setConfigOption, notice.
 */
class FakeSession {
  mode = "ask";
  model = "or:default";
  models = ["or:default", "or:other"];
  calls: [string, string][] = [];
  notices: string[] = [];
  refuse = new Set<string>();
  private listeners = new Set<() => void>();
  private state = this.build();

  private build() {
    return {
      closed: undefined,
      configOptions: [
        {
          id: "model",
          name: "Model",
          type: "select",
          currentValue: this.model,
          options: [
            {
              group: "configured",
              name: "Configured",
              options: this.models.map((value) => ({ value, name: value })),
            },
          ],
        },
        {
          id: "mode",
          name: "Approval mode",
          type: "select",
          currentValue: this.mode,
          options: ["ask", "auto", "deny"].map((value) => ({ value, name: value })),
        },
      ],
    };
  }

  /** agent86 changed something (a config_option_update, or a set). */
  changed() {
    this.state = this.build();
    for (const listener of this.listeners) listener();
  }

  readonly getState = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly setConfigOption = async (id: string, value: string) => {
    this.calls.push([id, value]);
    await Promise.resolve();
    if (this.refuse.has(value)) throw new Error(`'${value}' is not one of the listed models`);
    if (id === "mode") this.mode = value;
    else this.model = value;
    this.changed();
  };
  readonly notice = (_level: string, text: string) => {
    this.notices.push(text);
  };
}

function keep(session: FakeSession, waitMs = 1000) {
  const seen: ThreadSettings[] = [];
  const keeper = new SettingsKeeper(
    session as unknown as AgentSession,
    (settings) => seen.push(settings),
    waitMs,
  );
  return { keeper, seen };
}

describe("SettingsKeeper", () => {
  let keepers: SettingsKeeper[] = [];
  beforeEach(() => {
    keepers = [];
  });
  afterEach(() => {
    for (const keeper of keepers) keeper.stop();
    vi.useRealTimers();
  });

  it("sets the remembered mode and model back on a reopened session", async () => {
    const session = new FakeSession();
    const { keeper, seen } = keep(session);
    keepers.push(keeper);
    await keeper.restore({ mode: "auto", model: "or:other" });
    // The model first, so the mode is the last word on approvals.
    expect(session.calls).toEqual([
      ["model", "or:other"],
      ["mode", "auto"],
    ]);
    expect(session.mode).toBe("auto");
    expect(seen).toEqual([]); // Nothing new to remember.
  });

  it("has the mode in place when restore resolves", async () => {
    const session = new FakeSession();
    const { keeper } = keep(session);
    keepers.push(keeper);
    const restoring = keeper.restore({ mode: "deny" });
    expect(session.mode).toBe("ask");
    await restoring;
    expect(session.mode).toBe("deny");
  });

  it("sends nothing when the session already has the settings", async () => {
    const session = new FakeSession();
    const { keeper } = keep(session);
    keepers.push(keeper);
    await keeper.restore({ mode: "ask", model: "or:default" });
    expect(session.calls).toEqual([]);
  });

  it("remembers what a new thread starts with, then every change", async () => {
    const session = new FakeSession();
    const { keeper, seen } = keep(session);
    keepers.push(keeper);
    await keeper.restore({});
    expect(seen).toEqual([{ mode: "ask", model: "or:default" }]);
    await session.setConfigOption("mode", "auto"); // The header, Shift+Tab, or /mode.
    expect(seen.at(-1)).toEqual({ mode: "auto", model: "or:default" });
  });

  it("says so when agent86 refuses a remembered setting, and remembers what it uses", async () => {
    const session = new FakeSession();
    session.refuse.add("auto");
    const { keeper, seen } = keep(session);
    keepers.push(keeper);
    await keeper.restore({ mode: "auto" });
    expect(session.notices).toEqual([
      "Could not set this thread's mode back to auto: 'auto' is not one of the listed models. It is using ask.",
    ]);
    expect(seen.at(-1)).toMatchObject({ mode: "ask" });
  });

  it("waits for a model from a provider's live list, keeping it remembered meanwhile", async () => {
    const session = new FakeSession();
    const { keeper, seen } = keep(session);
    keepers.push(keeper);
    await keeper.restore({ mode: "auto", model: "or:live" });
    expect(session.calls).toEqual([["mode", "auto"]]);
    expect(seen.every((s) => s.model === "or:live")).toBe(true);
    // agent86 fills in the provider's list in the background.
    session.models = [...session.models, "or:live"];
    session.changed();
    await vi.waitFor(() => expect(session.model).toBe("or:live"));
    expect(session.calls.at(-1)).toEqual(["model", "or:live"]);
  });

  it("lets a model the user picks meanwhile stand", async () => {
    const session = new FakeSession();
    const { keeper, seen } = keep(session);
    keepers.push(keeper);
    await keeper.restore({ model: "or:live" });
    await session.setConfigOption("model", "or:other");
    session.models = [...session.models, "or:live"];
    session.changed();
    await Promise.resolve();
    expect(session.model).toBe("or:other");
    expect(seen.at(-1)).toMatchObject({ model: "or:other" });
  });

  it("gives up on a model agent86 no longer offers, and says so", async () => {
    vi.useFakeTimers();
    const session = new FakeSession();
    const { keeper, seen } = keep(session, 5000);
    keepers.push(keeper);
    await keeper.restore({ model: "or:gone" });
    vi.advanceTimersByTime(5000);
    expect(session.notices).toEqual([
      "agent86 does not offer or:gone, this thread's model, any more. It is using or:default.",
    ]);
    expect(seen.at(-1)).toMatchObject({ model: "or:default" });
  });

  it("stops listening once stopped", async () => {
    const session = new FakeSession();
    const { keeper, seen } = keep(session);
    await keeper.restore({});
    keeper.stop();
    const before = seen.length;
    await session.setConfigOption("mode", "deny");
    expect(seen).toHaveLength(before);
  });
});

describe("offers", () => {
  it("finds a value in flat and grouped choices", () => {
    const session = new FakeSession();
    const [model, mode] = session.getState().configOptions as unknown as Parameters<
      typeof offers
    >[0][];
    expect(offers(model, "or:other")).toBe(true);
    expect(offers(model, "or:nope")).toBe(false);
    expect(offers(mode, "deny")).toBe(true);
    expect(offers(undefined, "deny")).toBe(false);
  });
});
