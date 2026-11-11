import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  mockAgent86,
  openThread,
  recordFile,
  scriptedModel,
  startBridge,
  type Bridge,
} from "./bridge.ts";

const box = (page: Page) => page.getByRole("textbox", { name: "Message agent86" });
const visible = (page: Page) => page.getByRole("tabpanel").filter({ visible: true });
const replies = (page: Page) => visible(page).getByLabel("agent86", { exact: true });
const status = (page: Page) => visible(page).getByRole("status", { name: "Agent status" });

async function send(page: Page, text: string) {
  await box(page).filter({ visible: true }).fill(text);
  await box(page).filter({ visible: true }).press("Enter");
}

interface Flavor {
  name: string;
  start: (env?: Record<string, string>) => Promise<Bridge>;
  /** Make a session the way a terminal user would, outside the browser. */
  terminalSession: (bridge: Bridge, text: string) => Promise<void> | void;
}

function threadFlows(flavor: Flavor) {
  let bridge: Bridge;
  test.beforeEach(async () => {
    bridge = await flavor.start();
    writeFileSync(join(bridge.workspace, "README.md"), "Teh quick brown fox\n");
  });
  // Playwright requires the fixtures argument to be an object pattern, even when unused.
  // eslint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    await bridge.stop();
    // The bridge's log explains most failures (which agent86 started, stopped, or said what).
    if (testInfo.status !== testInfo.expectedStatus) {
      writeFileSync(testInfo.outputPath("bridge.log"), bridge.stderr());
    }
  });

  test("lists a session started at the terminal, and reopens it with its history", async ({
    page,
  }) => {
    await flavor.terminalSession(bridge, "hello from the terminal");
    await page.goto(bridge.url);
    const sessions = page.getByRole("navigation", { name: "Sessions" });
    await sessions.getByRole("button", { name: /hello from the terminal/ }).click();
    await expect(visible(page).getByLabel("You", { exact: true })).toHaveText(
      "hello from the terminal",
    );
    await expect(replies(page)).toContainText("You said: hello from the terminal");
    // And it carries on in the browser.
    await send(page, "and from the browser");
    await expect(replies(page).last()).toContainText("You said: and from the browser");
  });

  test("switches the model mid-thread", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "hello");
    await expect(replies(page)).toHaveText("Hello from the mock model. You said: hello");
    await visible(page).getByRole("combobox", { name: "Model" }).selectOption("mock:cheap-model");
    await expect(visible(page).getByRole("combobox", { name: "Model" })).toHaveValue(
      "mock:cheap-model",
    );
    await send(page, "hello again");
    await expect(replies(page).last()).toContainText("[cheap-model] Hello from the mock model");
  });

  test("runs two threads at once", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "go slow");
    await expect(status(page)).toContainText("Writing…");
    await page.keyboard.press("Alt+n");
    await expect(page.getByRole("tab")).toHaveCount(2);
    await expect(box(page).filter({ visible: true })).toBeEditable();
    await send(page, "hello");
    // The second thread answers while the first is still writing.
    await expect(replies(page)).toHaveText("Hello from the mock model. You said: hello");
    const first = page.getByRole("tab").first();
    await expect(first.getByLabel("working")).toBeVisible();
    await first.getByRole("button", { name: "go slow", exact: true }).click();
    await expect(status(page)).toContainText("Writing…");
    await page.keyboard.press("Escape");
    await expect(visible(page).getByRole("note").filter({ hasText: "Cancelled." })).toBeVisible();
  });

  test("keeps its threads across a reload, reopening each session", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "remember me");
    await expect(replies(page)).toContainText("You said: remember me");
    await page.reload();
    await expect(page.getByRole("tab", { name: /remember me/ })).toBeVisible();
    await expect(replies(page)).toContainText("You said: remember me");
  });

  test("after a reload mid-turn, waits for the turn and then reopens the session", async ({
    page,
  }) => {
    await openThread(page, bridge.url);
    await send(page, "go slow");
    await expect(status(page)).toContainText("Writing…");
    await page.reload();
    // agent86 refuses to reopen the session until the turn ends; then the whole reply is there.
    await expect(replies(page)).toContainText("word199", { timeout: 40_000 });
    await expect(box(page).filter({ visible: true })).toBeEditable();
  });

  test("auto mode runs an edit without asking; deny mode refuses it", async ({ page }) => {
    await openThread(page, bridge.url);
    await visible(page).getByRole("combobox", { name: "Approval mode" }).selectOption("auto");
    await expect(visible(page).getByRole("combobox", { name: "Approval mode" })).toHaveValue(
      "auto",
    );
    await send(page, "fix the typo");
    await expect(replies(page).last()).toContainText("Edited README.md");
    await expect(page.getByRole("group", { name: /Approval needed/ })).toHaveCount(0);

    await visible(page).getByRole("combobox", { name: "Approval mode" }).selectOption("deny");
    await expect(visible(page).getByRole("combobox", { name: "Approval mode" })).toHaveValue(
      "deny",
    );
    await send(page, "write some notes");
    await expect(replies(page).last()).toContainText("blocked by approval policy");
    await expect(visible(page).getByTestId("tool-card").last()).toHaveAttribute(
      "data-state",
      "declined",
    );
  });

  test("offers agent86's commands on /, and runs one typed in full", async ({ page }) => {
    await openThread(page, bridge.url);
    await box(page).filter({ visible: true }).fill("/co");
    await expect(page.getByRole("listbox", { name: "Commands" })).toContainText("/cost");
    await box(page).filter({ visible: true }).press("Tab");
    await expect(box(page).filter({ visible: true })).toHaveValue("/cost ");
    await box(page).filter({ visible: true }).press("Enter");
    await expect(replies(page)).toContainText("cost n/a");
  });

  test("mentions a file with @, and agent86 gets a link to it", async ({ page }) => {
    await openThread(page, bridge.url);
    await box(page).filter({ visible: true }).fill("summarize @READ");
    const files = page.getByRole("listbox", { name: "Files" });
    await expect(files).toContainText("README.md");
    await files.getByRole("option", { name: "README.md" }).click();
    await expect(box(page).filter({ visible: true })).toHaveValue("summarize @README.md ");
    await box(page).filter({ visible: true }).press("Enter");
    // agent86 shows the model a link as "name (uri)"; the scripted model repeats what it was told.
    await expect(replies(page)).toContainText(
      `README.md (file://${join(bridge.workspace, "README.md")})`,
    );
  });

  test("shows agent86's notes in the logs drawer", async ({ page }) => {
    await openThread(page, bridge.url);
    await visible(page).getByRole("button", { name: /^logs/ }).click();
    await expect(visible(page).getByLabel("agent86 logs")).not.toBeEmpty();
  });

  test("opens a thread in a folder chosen from the workspace picker", async ({ page }) => {
    mkdirSync(join(bridge.workspace, "sub"));
    await page.goto(bridge.url);
    await page.getByRole("main").getByRole("button", { name: "Choose a workspace…" }).click();
    const picker = page.getByRole("dialog", { name: "Choose a workspace" });
    await picker.getByRole("button", { name: /sub/ }).click();
    await picker.getByRole("button", { name: "Use this folder" }).click();
    await expect(box(page).filter({ visible: true })).toBeEditable();
    await expect(visible(page).getByText("What should agent86 do?")).toBeVisible();
    await expect(visible(page)).toContainText(join(bridge.workspace, "sub"));
    await expect(
      page.getByRole("region", { name: `Sessions in ${join(bridge.workspace, "sub")}` }),
    ).toBeVisible();
  });
}

test.describe("threads with the mock agent", () => {
  threadFlows({
    name: "mock",
    start: (env) => startBridge(mockAgent86(), { MOCK_AGENT86_RECORD: recordFile(), ...env }),
    terminalSession: (bridge, text) => {
      // A session agent86 saved at a terminal has no recorded directory.
      writeFileSync(
        bridge.db,
        JSON.stringify({
          "mock-terminal": {
            title: text,
            updatedAt: new Date().toISOString(),
            mode: "ask",
            model: "mock:test-model",
            turns: [{ user: text, agent: `Hello from the mock model. You said: ${text}` }],
          },
        }),
      );
    },
  });
});

test.describe("threads with the real agent86", () => {
  test.skip(!process.env.AGENT86_BIN, "set AGENT86_BIN to run against a real agent86");
  let model: Awaited<ReturnType<typeof scriptedModel>> | undefined;
  test.afterEach(async () => {
    await model?.stop();
  });
  threadFlows({
    name: "real",
    start: async () => {
      model = await scriptedModel();
      return startBridge(process.env.AGENT86_BIN!, model.env);
    },
    // Asynchronously: the scripted model runs in this process and must answer agent86 meanwhile.
    terminalSession: async (bridge, text) => {
      await promisify(execFile)(process.env.AGENT86_BIN!, ["run", text], {
        cwd: bridge.workspace,
        env: { ...process.env, ...bridge.env },
        shell: process.platform === "win32",
        timeout: 30_000,
      });
    },
  });
});
