// The 0.2.0 shell features (docs/PROJECT_PLAN.md, M6): resizing the sessions panel, renaming
// threads, the default approval mode, the logs drawer, and Quit.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  mockAgent86,
  openThread,
  recordFile,
  scriptedModel,
  startBridge,
  type Bridge,
} from "./bridge.ts";

/** Whether the real agent86 (AGENT86_BIN) is at least `version`. */
function realAgentAtLeast(version: string): boolean {
  const bin = process.env.AGENT86_BIN;
  if (!bin) return false;
  const out = execFileSync(bin, ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const found = /(\d+)\.(\d+)\.(\d+)/.exec(out)?.slice(1).map(Number) ?? [0, 0, 0];
  const wanted = version.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (found[i]! !== wanted[i]!) return found[i]! > wanted[i]!;
  }
  return true;
}

const box = (page: Page) => page.getByRole("textbox", { name: "Message agent86" });
const visible = (page: Page) => page.getByRole("tabpanel").filter({ visible: true });
const status = (page: Page) => visible(page).getByRole("status", { name: "Agent status" });
const sessions = (page: Page) => page.getByRole("navigation", { name: "Sessions" });

async function send(page: Page, text: string) {
  await box(page).filter({ visible: true }).fill(text);
  await box(page).filter({ visible: true }).press("Enter");
  const replies = visible(page).getByLabel("agent86", { exact: true });
  await expect(replies.last()).toContainText(`You said: ${text}`);
  await expect(status(page)).toBeHidden();
}

/** Wait for a session row, refreshing the list (the bridge reuses a list for a few seconds). */
async function listed(page: Page, name: RegExp) {
  const row = sessions(page).getByRole("button", { name });
  await expect(async () => {
    await sessions(page).getByTitle("Refresh").click();
    await expect(row.first()).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

/** The session titles agent86 keeps (the mock's database). */
function savedTitles(bridge: Bridge): Record<string, string | undefined> {
  const db = JSON.parse(readFileSync(bridge.db, "utf8")) as Record<string, { title?: string }>;
  return Object.fromEntries(Object.entries(db).map(([id, saved]) => [id, saved.title]));
}

function withBridge(version: string) {
  let bridge: Bridge;
  test.beforeEach(async () => {
    bridge = await startBridge(mockAgent86(), {
      MOCK_AGENT86_RECORD: recordFile(),
      MOCK_AGENT86_VERSION: version,
    });
  });
  // eslint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    await bridge.stop();
    if (testInfo.status !== testInfo.expectedStatus) {
      writeFileSync(testInfo.outputPath("bridge.log"), bridge.stderr());
    }
  });
  return () => bridge;
}

test.describe("with agent86 1.0.17", () => {
  const bridge = withBridge("1.0.17");

  test("shows AGENT86 in the header", async ({ page }) => {
    await page.goto(bridge().url);
    await expect(page.getByRole("banner")).toContainText("AGENT86");
  });

  test("renames a thread from its tab, and agent86 keeps the name", async ({ page }) => {
    await openThread(page, bridge().url);
    await send(page, "hello there");
    const tab = page.getByRole("tab", { selected: true });
    await expect(tab).toContainText("hello there");
    await tab.getByRole("button", { name: "hello there", exact: true }).dblclick();
    const input = page.getByRole("textbox", { name: "Thread name" });
    await input.fill("Release prep");
    await input.press("Enter");
    await expect(tab).toContainText("Release prep");
    await expect.poll(() => Object.values(savedTitles(bridge()))).toContain("Release prep");
    // The command does not show in the conversation.
    await expect(visible(page).getByLabel("You", { exact: true })).toHaveCount(1);
    await expect(visible(page)).not.toContainText("/rename");
    // The logs say so, and the sessions list shows the name.
    await visible(page).getByRole("button", { name: /^logs/ }).click();
    await expect(visible(page).getByLabel("agent86 logs")).toContainText(
      "renamed the session in agent86: Release prep",
    );
    await listed(page, /^Release prep/);
    // A later prompt does not take the name back.
    await send(page, "and more");
    await expect(tab).toContainText("Release prep");
  });

  test("renames a saved session from the sessions list", async ({ page }) => {
    await openThread(page, bridge().url);
    await send(page, "first topic");
    await page
      .getByRole("tab", { selected: true })
      .getByRole("button", { name: /^Close/ })
      .click();
    await listed(page, /first topic/);
    await sessions(page).getByRole("button", { name: "Rename first topic" }).click();
    const input = page.getByRole("textbox", { name: "Session name" });
    await input.fill("Renamed in the list");
    await input.press("Enter");
    const row = sessions(page).getByRole("button", { name: /^Renamed in the list/ });
    await expect(row).toBeVisible();
    // Not open: agent86 gets the name when the session is next opened.
    await row.click();
    await expect(page.getByRole("tab", { selected: true })).toContainText("Renamed in the list");
    await expect.poll(() => Object.values(savedTitles(bridge()))).toContain("Renamed in the list");
  });

  test("lists only the workspace's own sessions", async ({ page }) => {
    // A session saved at a terminal before 1.0.17 has no recorded directory.
    writeFileSync(
      bridge().db,
      JSON.stringify({
        "mock-terminal": {
          title: "from an unknown directory",
          updatedAt: new Date().toISOString(),
          mode: "ask",
          model: "mock:test-model",
          turns: [{ user: "hi", agent: "hello" }],
        },
      }),
    );
    await page.goto(bridge().url);
    await expect(sessions(page).getByText("No saved sessions yet.")).toBeVisible();
  });

  test("starts new threads in the preferred approval mode", async ({ page }) => {
    await page.goto(bridge().url);
    await page.getByRole("button", { name: /^agent86 1\.0\.17/ }).click();
    const settings = page.getByRole("region", { name: "Settings" });
    await settings.getByRole("combobox").selectOption("auto");
    // auto asks first; Cancel leaves the preference alone.
    await settings.getByRole("button", { name: "Cancel" }).click();
    await expect(settings.getByRole("combobox")).toHaveValue("default");
    await settings.getByRole("combobox").selectOption("auto");
    await settings.getByRole("button", { name: "Use auto" }).click();
    await expect(settings.getByRole("combobox")).toHaveValue("auto");
    await page.getByRole("button", { name: "Close", exact: true }).click();

    await page
      .getByRole("main")
      .getByRole("button", { name: /^New thread in / })
      .click();
    const mode = visible(page).getByRole("combobox", { name: "Approval mode" });
    await expect(mode).toHaveValue("auto");
    // A thread already opened keeps the mode chosen in it, across a reload.
    await mode.selectOption("ask");
    await expect(mode).toHaveValue("ask");
    await page.reload();
    await expect(visible(page).getByRole("combobox", { name: "Approval mode" })).toHaveValue("ask");
  });

  test("shows connection events in the logs drawer, with a copy button", async ({ page }) => {
    await openThread(page, bridge().url);
    await visible(page).getByRole("button", { name: /^logs/ }).click();
    const logs = visible(page).getByLabel("agent86 logs");
    await expect(logs).toContainText("[agent86-web]");
    await expect(logs).toContainText("connected to agent86 1.0.17");
    await expect(logs).toContainText("started session");
    await expect(logs.getByRole("button", { name: "copy" })).toBeVisible();
  });

  test("resizes the sessions panel and remembers its width", async ({ page }) => {
    await page.goto(bridge().url);
    const panel = sessions(page);
    const handle = page.getByRole("separator", { name: "Resize sessions panel" });
    const before = (await panel.boundingBox())!.width;
    const grip = (await handle.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 200);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 120, grip.y + 200, { steps: 5 });
    await page.mouse.up();
    const after = (await panel.boundingBox())!.width;
    expect(after).toBeGreaterThan(before + 100);
    await page.reload();
    expect(Math.abs((await sessions(page).boundingBox())!.width - after)).toBeLessThan(2);
    // Arrow keys resize too, and a double-click resets.
    await handle.focus();
    await page.keyboard.press("ArrowLeft");
    expect((await sessions(page).boundingBox())!.width).toBeLessThan(after);
    await handle.dblclick();
    await expect.poll(async () => (await sessions(page).boundingBox())!.width).toBe(256);
  });

  test("Quit stops agent86-web", async ({ page }) => {
    await openThread(page, bridge().url);
    await page.getByRole("button", { name: "Quit agent86-web" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Quit agent86-web?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Quit agent86-web" }).click();
    await page
      .getByRole("alertdialog", { name: "Quit agent86-web?" })
      .getByRole("button", { name: "Quit", exact: true })
      .click();
    expect(await bridge().exited()).toBe(0);
    expect(bridge().stdout()).toContain("Stopped from the browser.");
    // The browser may refuse to close the tab; then the page says agent86-web has stopped.
    if (!page.isClosed()) {
      await expect(page.getByRole("heading", { name: "agent86-web has stopped" })).toBeVisible();
    }
  });
});

test.describe("with agent86 1.0.15", () => {
  const bridge = withBridge("1.0.15");

  test("keeps a thread's name in the browser", async ({ page }) => {
    await openThread(page, bridge().url);
    await send(page, "older agent86");
    const tab = page.getByRole("tab", { selected: true });
    await tab.getByRole("button", { name: "older agent86", exact: true }).dblclick();
    await page.getByRole("textbox", { name: "Thread name" }).fill("Local name");
    await page.getByRole("textbox", { name: "Thread name" }).press("Enter");
    await expect(tab).toContainText("Local name");
    expect(Object.values(savedTitles(bridge()))).not.toContain("Local name");
    expect(
      bridge()
        .recorded()
        .some((m) => JSON.stringify(m.params).includes("/rename")),
    ).toBe(false);
    await page.reload();
    await expect(page.getByRole("tab", { selected: true })).toContainText("Local name");
    await listed(page, /^Local name/);
  });

  test("says which features need agent86 1.0.17", async ({ page }) => {
    await page.goto(bridge().url);
    await page.getByRole("button", { name: /^agent86 1\.0\.15/ }).click();
    await expect(page.getByText(/agent86 1\.0\.17 or later keeps thread names/)).toBeVisible();
  });
});

test.describe("with the real agent86", () => {
  test.skip(!process.env.AGENT86_BIN, "set AGENT86_BIN to run against a real agent86");
  // /rename arrived in agent86 1.0.17; CI runs the oldest supported agent86.
  test.skip(
    () => !realAgentAtLeast("1.0.17"),
    "the real agent86 is older than 1.0.17, which added /rename",
  );
  let model: Awaited<ReturnType<typeof scriptedModel>>;
  let bridge: Bridge;
  test.beforeEach(async () => {
    model = await scriptedModel();
    bridge = await startBridge(process.env.AGENT86_BIN!, model.env);
  });
  // eslint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    await bridge.stop();
    await model.stop();
    if (testInfo.status !== testInfo.expectedStatus) {
      writeFileSync(testInfo.outputPath("bridge.log"), bridge.stderr());
    }
  });

  test("renames a thread, and agent86's session list shows the name", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "hello there");
    const tab = page.getByRole("tab", { selected: true });
    await tab.getByRole("button", { name: "hello there", exact: true }).dblclick();
    await page.getByRole("textbox", { name: "Thread name" }).fill("Real rename");
    await page.getByRole("textbox", { name: "Thread name" }).press("Enter");
    await visible(page).getByRole("button", { name: /^logs/ }).click();
    await expect(visible(page).getByLabel("agent86 logs")).toContainText(
      "renamed the session in agent86: Real rename",
    );
    await expect(visible(page)).not.toContainText("/rename");
    // Clear the browser's copy, so the list can only show agent86's own title.
    await page.evaluate(() => localStorage.removeItem("agent86web.titles.v1"));
    await page.reload();
    await listed(page, /^Real rename/);
  });
});
