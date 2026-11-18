// A thread's approval mode across reloads and restarts, the default mode for new threads, and a
// saved port. The mock agent, like agent86 1.0.18, reopens a session in its default mode.
import { writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import { mockAgent86, openThread, scriptedModel, startBridge, type Bridge } from "./bridge.ts";

const box = (page: Page) => page.getByRole("textbox", { name: "Message Agent 86" });
const visible = (page: Page) => page.getByRole("tabpanel").filter({ visible: true });
const replies = (page: Page) => visible(page).getByLabel("Agent 86", { exact: true });
const mode = (page: Page) => visible(page).getByRole("combobox", { name: "Approval mode" });

async function send(page: Page, text: string) {
  await box(page).filter({ visible: true }).fill(text);
  await box(page).filter({ visible: true }).press("Enter");
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

let bridges: Bridge[] = [];

// Playwright requires the fixtures argument to be an object pattern, even when unused.
// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
  for (const bridge of bridges) {
    await bridge.stop();
    if (testInfo.status !== testInfo.expectedStatus) {
      writeFileSync(testInfo.outputPath(`bridge-${bridges.indexOf(bridge)}.log`), bridge.stderr());
    }
  }
  bridges = [];
});

async function start(...args: Parameters<typeof startBridge>): Promise<Bridge> {
  const bridge = await startBridge(...args);
  bridges.push(bridge);
  writeFileSync(`${bridge.workspace}/README.md`, "Teh quick brown fox\n");
  return bridge;
}

test("a thread keeps its approval mode across a reload", async ({ page }) => {
  const bridge = await start(mockAgent86());
  await openThread(page, bridge.url);
  await mode(page).selectOption("auto");
  await expect(mode(page)).toHaveValue("auto");

  await page.reload();
  await expect(mode(page)).toHaveValue("auto");
  // agent86 really is in auto mode again: the edit runs without asking.
  await send(page, "fix the typo");
  await expect(replies(page).last()).toContainText("Edited README.md");
  await expect(page.getByRole("group", { name: /Approval needed/ })).toHaveCount(0);
});

test("new threads start in the default mode, until it is reset", async ({ page }) => {
  const bridge = await start(mockAgent86());
  await openThread(page, bridge.url);
  await expect(mode(page)).toHaveValue("ask");
  await mode(page).selectOption("deny");
  await visible(page).getByRole("button", { name: "make default" }).click();
  await expect(visible(page).getByText("(default)")).toBeVisible();

  await page.getByTitle("New thread (Alt+N)").click();
  await expect(mode(page)).toHaveValue("deny");
  await expect(visible(page).getByText("(default)")).toBeVisible();

  // Making auto the default asks first; Cancel leaves the default alone.
  await mode(page).selectOption("auto");
  await visible(page).getByRole("button", { name: "make default" }).click();
  await visible(page)
    .getByRole("alertdialog", { name: "Confirm auto mode" })
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(visible(page).getByRole("button", { name: "make default" })).toBeVisible();

  // The default lives with the bridge, so a reload keeps it; Settings shows it and can reset it.
  await page.reload();
  await page.getByRole("button", { name: /^agent86 \d/ }).click();
  const settings = page.getByRole("region", { name: "Settings" });
  await expect(settings.getByRole("combobox")).toHaveValue("deny");
  await settings.getByRole("combobox").selectOption("default");
  await expect(settings.getByRole("combobox")).toHaveValue("default");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByTitle("New thread (Alt+N)").click();
  await expect(mode(page)).toHaveValue("ask");
});

test("a saved port: a restart opens on it, and threads come back with their modes", async ({
  page,
}) => {
  const port = await freePort();
  const first = await start(mockAgent86(), {}, ["--port", String(port), "--save-port"]);
  expect(new URL(first.url).port).toBe(String(port));
  await openThread(page, first.url);
  await mode(page).selectOption("auto");
  await expect(mode(page)).toHaveValue("auto");

  // While it runs, a second agent86-web on the saved port is refused, saying why.
  await expect(
    startBridge(mockAgent86(), { AGENT86_WEB_STATE_DIR: first.stateDir }),
  ).rejects.toThrow(/port \d+ \(saved in .*settings\.json\) is already in use/);

  await first.stop();
  const second = await start(
    mockAgent86(),
    { AGENT86_WEB_STATE_DIR: first.stateDir, MOCK_AGENT86_DB: first.db },
    [],
    { workspace: first.workspace },
  );
  expect(new URL(second.url).port).toBe(String(port));
  // Same origin, so the browser still has the open thread; agent86 reopens it in ask mode.
  await page.goto(second.url);
  await expect(mode(page)).toHaveValue("auto");
});

test.describe("with the real agent86", () => {
  test.skip(!process.env.AGENT86_BIN, "set AGENT86_BIN to run against a real agent86");
  let model: Awaited<ReturnType<typeof scriptedModel>> | undefined;
  test.afterEach(async () => {
    await model?.stop();
  });

  test("a thread keeps its approval mode and model across a reload", async ({ page }) => {
    model = await scriptedModel();
    const bridge = await start(process.env.AGENT86_BIN!, model.env);
    await openThread(page, bridge.url);
    await visible(page).getByRole("combobox", { name: "Model" }).selectOption("mock:cheap-model");
    await mode(page).selectOption("auto");
    await expect(mode(page)).toHaveValue("auto");

    await page.reload();
    await expect(mode(page)).toHaveValue("auto");
    await expect(visible(page).getByRole("combobox", { name: "Model" })).toHaveValue(
      "mock:cheap-model",
    );
    await send(page, "fix the typo");
    await expect(replies(page).last()).toContainText("Edited README.md", { timeout: 20_000 });
    await expect(page.getByRole("group", { name: /Approval needed/ })).toHaveCount(0);
  });
});
