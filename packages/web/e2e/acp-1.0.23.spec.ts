// agent86 1.0.22 and 1.0.23 in the browser: the memory panel, the secrets panel, the masked prompt
// for the model's secret/request, and a secret that never reaches anything agent86-web writes; a
// bridge restart that resumes the open thread (falling back to a load against agent86 1.0.20);
// and an older agent86, which has none of the panels.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  mockAgent86,
  openThread,
  realAgentAtLeast,
  recordFile,
  scriptedModel,
  startBridge,
  type Bridge,
} from "./bridge.ts";

const visible = (page: Page) => page.getByRole("tabpanel").filter({ visible: true });
const box = (page: Page) => visible(page).getByRole("textbox", { name: "Message Agent 86" });
const replies = (page: Page) => visible(page).getByLabel("Agent 86", { exact: true });
const prompts = (page: Page) => visible(page).getByLabel("You", { exact: true });
const inbox = (page: Page) => page.getByRole("complementary", { name: "Approval inbox" });
const memory = (page: Page) => page.getByRole("complementary", { name: "Memory" });
const secrets = (page: Page) => page.getByRole("complementary", { name: "Secrets" });
const ask = (page: Page) =>
  page.getByRole("dialog", { name: "Agent 86 asks for the secret STRIPE_KEY" });

/** Values typed as secrets here; none may reach anything agent86-web or the page keeps. */
const SET_VALUE = "sk_e2e_SET_value_8b1f2c";
const ENTERED_VALUE = "sk_e2e_ENTERED_value_3d9a7e";

async function send(page: Page, text: string) {
  await box(page).fill(text);
  await box(page).press("Enter");
}

async function idle(page: Page) {
  await expect(box(page)).toBeEditable();
  await expect(visible(page).getByRole("button", { name: "Stop" })).toHaveCount(0);
}

const methods = (bridge: Bridge) => bridge.recorded().map((m) => m.method);

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** agent86's memory for the mock, as its database would hold it. */
function seedMemory(bridge: Bridge, facts: number) {
  const entries = [
    ...Array.from({ length: facts }, (_, i) => ({
      kind: "fact",
      id: i + 1,
      text: `seeded fact ${i + 1}`,
      storedAt: `2026-11-16T10:${String(i).padStart(2, "0")}:00Z`,
      category: "fact",
    })),
    {
      kind: "episode",
      id: 1,
      text: "fix the typo",
      storedAt: "2026-11-16T09:00:00Z",
      outcome: "Edited README.md",
      sessionId: "older-session",
    },
  ];
  writeFileSync(
    `${bridge.db}.memory.json`,
    JSON.stringify({ next: { fact: facts + 1, episode: 2 }, entries }),
  );
}

let bridges: Bridge[] = [];

// Playwright requires the fixtures argument to be an object pattern, even when unused.
// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
  for (const [i, bridge] of bridges.entries()) {
    await bridge.stop();
    if (testInfo.status !== testInfo.expectedStatus)
      writeFileSync(testInfo.outputPath(`bridge-${i}.log`), bridge.stderr());
  }
  bridges = [];
});

async function start(...args: Parameters<typeof startBridge>): Promise<Bridge> {
  const bridge = await startBridge(...args);
  bridges.push(bridge);
  writeFileSync(join(bridge.workspace, "README.md"), "Teh quick brown fox\n");
  return bridge;
}

test.describe("with the mock agent as agent86 1.0.23", () => {
  let bridge: Bridge;
  let transcript: string;

  test.beforeEach(async () => {
    transcript = join(recordFile(), "..", "transcript.log");
    bridge = await start(mockAgent86(), {
      MOCK_AGENT86_VERSION: "1.0.23",
      MOCK_AGENT86_COST_CAP: "0.5",
      MOCK_AGENT86_RECORD: recordFile(),
      AGENT86_WEB_TRANSCRIPT: transcript,
    });
  });

  test("the memory panel: pages, the pinned filter, pin, unpin, and forget with a confirmation", async ({
    page,
  }) => {
    seedMemory(bridge, 25);
    await openThread(page, bridge.url);
    await visible(page).getByRole("button", { name: "memory", exact: true }).click();
    const items = memory(page).getByTestId("memory-item");
    await expect(items).toHaveCount(20);
    await expect(items.first()).toContainText("seeded fact 25");
    await memory(page).getByRole("button", { name: "Load more" }).click();
    await expect(items).toHaveCount(25);
    await expect(memory(page).getByRole("button", { name: "Load more" })).toHaveCount(0);

    await items.first().getByRole("button", { name: "pin", exact: true }).click();
    await expect(items.first().getByTestId("pinned")).toBeVisible();
    await memory(page).getByRole("checkbox", { name: "pinned only" }).check();
    await expect(items).toHaveCount(1);
    await items.first().getByRole("button", { name: "unpin" }).click();
    await expect(items).toHaveCount(0);
    await memory(page).getByRole("checkbox", { name: "pinned only" }).uncheck();
    await expect(items).toHaveCount(20);

    await items.first().getByRole("button", { name: "forget" }).click();
    await memory(page).getByRole("alertdialog").getByRole("button", { name: "Keep" }).click();
    await expect(items.first()).toContainText("seeded fact 25");
    await items.first().getByRole("button", { name: "forget" }).click();
    await memory(page).getByRole("alertdialog").getByRole("button", { name: "Forget" }).click();
    await expect(items.first()).toContainText("seeded fact 24");
    expect(methods(bridge)).toContain("memory/forget");

    await memory(page).getByRole("tab", { name: "Episodes" }).click();
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("fix the typo");
    await expect(items.first()).toContainText("Edited README.md");

    // A fact the model stores shows once the turn is over; during a turn the panel waits.
    await memory(page).getByRole("tab", { name: "Facts" }).click();
    await send(page, "slow");
    await expect(memory(page).getByTestId("memory-busy")).toBeVisible();
    await expect(memory(page).getByRole("tab", { name: "Episodes" })).toBeDisabled();
    await visible(page).getByRole("button", { name: "Stop" }).click();
    await idle(page);
    await send(page, "remember that the build uses pnpm");
    await idle(page);
    await expect(items.first()).toContainText("the build uses pnpm");
  });

  test("the secrets panel: set (remembered), list, forget; a value after /secret is not sent", async ({
    page,
  }) => {
    await openThread(page, bridge.url);
    await visible(page).getByRole("button", { name: "secrets", exact: true }).click();
    await expect(secrets(page)).toContainText("This session holds no secrets.");
    await secrets(page).getByLabel("Secret name").fill("API_TOKEN");
    await secrets(page).getByLabel("Secret value").fill(SET_VALUE);
    await secrets(page)
      .getByRole("checkbox", { name: /Remember it/ })
      .check();
    await secrets(page).getByRole("button", { name: "Set secret" }).click();
    const item = secrets(page).getByTestId("secret-item");
    await expect(item).toHaveCount(1);
    await expect(item).toContainText("API_TOKEN");
    await expect(item).toContainText("remembered");
    await expect(secrets(page).getByLabel("Secret value")).toHaveValue("");

    // The model is told only the name; a command's output shows the placeholder.
    await item.getByRole("button", { name: "forget" }).click();
    await secrets(page).getByRole("alertdialog").getByRole("button", { name: "Forget" }).click();
    await expect(item).toHaveCount(0);
    expect(methods(bridge)).toEqual(expect.arrayContaining(["secret/set", "secret/forget"]));

    // Typed in the message box, a value never leaves it.
    await secrets(page).getByRole("button", { name: "Close secrets" }).click();
    await send(page, `/secret ${SET_VALUE}`);
    await expect(secrets(page).getByRole("note")).toContainText("Nothing was sent.");
    await expect(box(page)).toHaveValue("");
    await expect(prompts(page)).toHaveCount(0);
    expect(methods(bridge)).not.toContain("session/prompt");
  });

  test("the model asks for a secret: the masked prompt, the inbox, and enter", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "ask for a secret");
    await expect(ask(page)).toBeVisible();
    await expect(ask(page)).toContainText("to create the webhook");
    await expect(inbox(page).getByTestId("inbox-subject")).toHaveText("a secret: STRIPE_KEY");
    await expect(page).toHaveTitle("(!) Secret requested · Agent 86 web");
    await inbox(page).getByRole("button", { name: "enter it" }).click();
    await expect(ask(page).getByLabel("Value for STRIPE_KEY")).toBeFocused();
    await page.keyboard.type(ENTERED_VALUE);
    await page.keyboard.press("Enter");
    await expect(ask(page)).toHaveCount(0);
    await expect(inbox(page)).toHaveCount(0);
    await idle(page);
    await expect(replies(page).last()).toContainText("The secret STRIPE_KEY is set.");

    // Its value in a command's output reaches the page as the placeholder.
    await send(page, "use the secret");
    await idle(page);
    await expect(replies(page).last()).toContainText("${secret:STRIPE_KEY}");
    await expect(visible(page)).not.toContainText(ENTERED_VALUE);

    // Asked again, it says a value is held, and the panel lists the name.
    await send(page, "ask for a secret");
    await expect(ask(page).getByRole("note")).toContainText("what you enter replaces it");
    await ask(page).getByRole("button", { name: "Decline", exact: true }).click();
    await idle(page);
    await visible(page).getByRole("button", { name: "secrets", exact: true }).click();
    await expect(secrets(page).getByTestId("secret-item")).toContainText("STRIPE_KEY");
  });

  test("the model asks for a secret: declined by Decline, by Esc, and by Stop", async ({
    page,
  }) => {
    await openThread(page, bridge.url);
    const answers = () =>
      bridge
        .recorded()
        .filter((m) => m.method === "secret answer")
        .map((m) => (m.params as { outcome: string }).outcome);

    await send(page, "ask for a secret");
    await ask(page).getByRole("button", { name: "Decline", exact: true }).click();
    await idle(page);
    await expect(replies(page).last()).toContainText("The user declined to enter the secret");

    await send(page, "ask for a secret");
    await ask(page).getByLabel("Value for STRIPE_KEY").fill("typed-then-escaped");
    await page.keyboard.press("Escape");
    await expect(ask(page)).toHaveCount(0);
    await idle(page);

    await send(page, "ask for a secret");
    await expect(ask(page)).toBeVisible();
    await visible(page).getByRole("button", { name: "Stop" }).click();
    await expect(ask(page)).toHaveCount(0);
    await idle(page);
    await expect(page.getByText("Cancelled.")).toBeVisible();
    // On Stop the page declines the open request as it cancels; whichever reaches agent86 first,
    // it is refused, and nothing was entered.
    const [first, second, third] = answers();
    expect([first, second]).toEqual(["declined", "declined"]);
    expect(["declined", "cancelled"]).toContain(third);
  });

  test("the approval inbox with two sub-agents asking at once", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "parallel writers");
    const items = inbox(page).getByTestId("inbox-item");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toHaveAttribute("data-position", "asking");
    await expect(items.nth(1)).toContainText("waiting #1");
    const panel = visible(page).getByRole("group", { name: "Approval needed: write_file" });
    await expect(panel.getByTestId("asker-name")).toHaveText("writer");
    await panel.getByRole("button", { name: /Allow once/ }).click();
    await expect(items).toHaveCount(1);
    await panel.getByRole("button", { name: /Allow once/ }).click();
    await expect(inbox(page)).toHaveCount(0);
    await idle(page);
  });

  test("no secret value reaches the bridge's log, state, transcript, or the page's storage", async ({
    page,
  }) => {
    const consoleLines: string[] = [];
    page.on("console", (message) => consoleLines.push(message.text()));
    await openThread(page, bridge.url);
    await visible(page).getByRole("button", { name: "secrets", exact: true }).click();
    await secrets(page).getByLabel("Secret name").fill("API_TOKEN");
    await secrets(page).getByLabel("Secret value").fill(SET_VALUE);
    await secrets(page)
      .getByRole("checkbox", { name: /Remember it/ })
      .check();
    await secrets(page).getByRole("button", { name: "Set secret" }).click();
    await expect(secrets(page).getByTestId("secret-item")).toHaveCount(1);
    await send(page, "ask for a secret");
    await ask(page).getByLabel("Value for STRIPE_KEY").fill(ENTERED_VALUE);
    await ask(page).getByRole("button", { name: "Enter" }).click();
    await idle(page);
    await send(page, "use the secret");
    await idle(page);
    await send(page, `/secret ${ENTERED_VALUE}`);
    await expect(secrets(page).getByRole("note")).toContainText("Nothing was sent.");

    // (Strings, as the e2e code is typed for Node, without the DOM.)
    const storage = await page.evaluate<string>(
      "JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href })",
    );
    const history = await page.evaluate<number>("history.length");
    await bridges[0]!.stop();

    const written = [
      bridge.stderr(),
      bridge.stdout(),
      ...filesUnder(bridge.stateDir).map((file) => readFileSync(file, "utf8")),
      readFileSync(transcript, "utf8"),
      storage,
      consoleLines.join("\n"),
    ].join("\n");
    for (const value of [SET_VALUE, ENTERED_VALUE]) expect(written).not.toContain(value);
    // The transcript recorded both messages that carried a value, as <hidden>.
    const lines = readFileSync(transcript, "utf8");
    expect(lines).toMatch(/C> .*secret\/set.*"value":"<hidden>"/);
    expect(lines).toMatch(/C> .*"outcome":"entered","value":"<hidden>"/);
    expect(history).toBeLessThan(5);
  });
});

test.describe("a bridge restart while the tab shows a thread", () => {
  for (const [version, how] of [
    ["1.0.23", "session/resume"],
    ["1.0.20", "session/load"],
  ] as const) {
    test(`agent86 ${version}: reopens with ${how}, with no message shown twice`, async ({
      page,
    }) => {
      const port = await freePort();
      const record = recordFile();
      const env = { MOCK_AGENT86_VERSION: version, MOCK_AGENT86_RECORD: record };
      const first = await start(mockAgent86(), env, ["--port", String(port)]);
      await openThread(page, first.url);
      await send(page, "hello before the restart");
      await expect(replies(page).last()).toContainText("You said: hello before the restart");
      await idle(page);

      await first.stop();
      const second = await start(
        mockAgent86(),
        { ...env, AGENT86_WEB_STATE_DIR: first.stateDir, MOCK_AGENT86_DB: first.db },
        ["--port", String(port)],
        { workspace: first.workspace },
      );
      // The new launch link, opened in the same tab: it signs in again without a reload.
      await page.goto(second.url);
      await expect.poll(() => methods(second)).toContain(how);
      await idle(page);
      await expect(prompts(page)).toHaveCount(1);
      await expect(replies(page)).toHaveCount(1);
      if (how === "session/resume") expect(methods(second)).not.toContain("session/load");
      await send(page, "and after it");
      await expect(replies(page).last()).toContainText("You said: and after it");
      await expect(prompts(page)).toHaveCount(2);
    });
  }
});

test.describe("with the mock agent as agent86 1.0.21 (no memory or secrets)", () => {
  test("shows neither panel, and /secret goes to agent86 as before", async ({ page }) => {
    const bridge = await start(mockAgent86(), {
      MOCK_AGENT86_VERSION: "1.0.21",
      MOCK_AGENT86_RECORD: recordFile(),
    });
    await openThread(page, bridge.url);
    await expect(visible(page).getByRole("button", { name: "$ cost" })).toBeVisible();
    await expect(visible(page).getByRole("button", { name: "memory", exact: true })).toHaveCount(0);
    await expect(visible(page).getByRole("button", { name: "secrets", exact: true })).toHaveCount(
      0,
    );
    await send(page, "/secret abcdefgh");
    await expect(prompts(page)).toHaveText(["/secret abcdefgh"]);
    expect(methods(bridge)).toContain("session/prompt");
  });
});

test.describe("with the real agent86", () => {
  test.skip(!process.env.AGENT86_BIN, "set AGENT86_BIN to run against a real agent86");
  test.skip(
    () => !realAgentAtLeast("1.0.23"),
    "the real agent86 is older than 1.0.23, which added memory and secrets for clients",
  );
  let model: Awaited<ReturnType<typeof scriptedModel>> | undefined;
  test.afterEach(async () => {
    await model?.stop();
  });

  test("memory and a secret the model asks for, with no keyring touched", async ({ page }) => {
    model = await scriptedModel();
    mkdirSync(join(model.env.HOME!, ".agent86"), { recursive: true });
    const bridge = await start(process.env.AGENT86_BIN!, {
      ...model.env,
      // No OS keyring: a test must not write to the user's real one.
      AGENT86_ACP_SECRETS: "off",
    });
    await openThread(page, bridge.url);
    await send(page, "remember that the build uses pnpm");
    await expect(replies(page).last()).toContainText("Remembered", { timeout: 20_000 });
    await idle(page);
    await visible(page).getByRole("button", { name: "memory", exact: true }).click();
    await expect(memory(page).getByTestId("memory-item").first()).toContainText(
      "the build uses pnpm",
    );

    await send(page, "ask for a secret");
    await expect(ask(page)).toBeVisible({ timeout: 20_000 });
    await expect(ask(page).getByRole("checkbox")).toHaveCount(0);
    await ask(page).getByLabel("Value for STRIPE_KEY").fill(ENTERED_VALUE);
    await ask(page).getByRole("button", { name: "Enter" }).click();
    await expect(replies(page).last()).toContainText("The secret STRIPE_KEY is set.", {
      timeout: 20_000,
    });
    await idle(page);
    await page.getByRole("button", { name: "Close memory" }).click();
    await visible(page).getByRole("button", { name: "secrets", exact: true }).click();
    await expect(secrets(page).getByTestId("secret-item")).toContainText("STRIPE_KEY");
    await expect(secrets(page)).toContainText("No keyring is available");
  });
});
