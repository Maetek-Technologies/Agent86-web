import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { mockAgent86, scriptedModel, startBridge, type Bridge, openThread } from "./bridge.ts";

async function send(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: "Message agent86" });
  await box.fill(text);
  await box.press("Enter");
}

const status = (page: Page) => page.getByRole("status", { name: "Agent status" });
const replies = (page: Page) => page.getByLabel("agent86", { exact: true });
const card = (page: Page) => page.getByTestId("tool-card").last();

/** The approval flows: run against the mock agent and the real agent86. */
function approvalFlows(start: () => Promise<Bridge>) {
  let bridge: Bridge;
  let readme: string;
  test.beforeEach(async () => {
    bridge = await start();
    readme = join(bridge.workspace, "README.md");
    writeFileSync(readme, "Teh quick brown fox\n");
  });
  test.afterEach(async () => {
    await bridge.stop();
  });

  test("approves an edit with its diff in view, and the file changes", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "fix the typo");
    const panel = page.getByRole("group", { name: "Approval needed: edit_file" });
    await expect(panel).toBeVisible();
    await expect(panel.locator('tr[data-kind="del"]')).toContainText("Teh quick brown fox");
    await expect(panel.locator('tr[data-kind="add"]')).toContainText("The quick brown fox");
    await expect(status(page)).toContainText("Waiting for your approval");
    await expect(page).toHaveTitle("(!) Approval needed · agent86 web");
    await expect(panel).toBeFocused();

    await page.keyboard.press("1");
    await expect(card(page)).toHaveAttribute("data-state", "done");
    await expect(replies(page).last()).toContainText("Edited README.md");
    expect(readFileSync(readme, "utf8")).toBe("The quick brown fox\n");
    await expect(page).toHaveTitle("agent86 web");
  });

  test("rejects an edit, and the file stays as it was", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "fix the typo");
    await page.getByRole("button", { name: /Reject/ }).click();
    await expect(card(page)).toHaveAttribute("data-state", "declined");
    await expect(replies(page).last()).toContainText("declined by user");
    await expect(status(page)).toBeHidden();
    expect(readFileSync(readme, "utf8")).toBe("Teh quick brown fox\n");
  });

  test("Esc rejects a waiting approval without cancelling the turn", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "fix the typo");
    await expect(page.getByRole("group", { name: "Approval needed: edit_file" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card(page)).toHaveAttribute("data-state", "declined");
    await expect(replies(page).last()).toContainText("declined by user");
    await expect(page.getByRole("note").filter({ hasText: "Cancelled." })).toHaveCount(0);
    expect(readFileSync(readme, "utf8")).toBe("Teh quick brown fox\n");
  });

  test("Stop while an approval waits cancels the turn and declines the call", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "fix the typo");
    await expect(page.getByRole("group", { name: "Approval needed: edit_file" })).toBeVisible();
    await page.getByRole("button", { name: "■ Stop" }).click();
    await expect(page.getByRole("note").filter({ hasText: "Cancelled." })).toBeVisible();
    await expect(card(page)).toHaveAttribute("data-state", "declined");
    expect(readFileSync(readme, "utf8")).toBe("Teh quick brown fox\n");
  });

  test("shows the command for run_command, and its output once allowed", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "run a command");
    const panel = page.getByRole("group", { name: "Approval needed: run_command" });
    await expect(panel).toContainText("echo hello-from-agent86");
    await panel.getByRole("button", { name: /Allow once/ }).click();
    await expect(card(page)).toHaveAttribute("data-state", "done");
    await expect(replies(page).last()).toContainText("hello-from-agent86");
  });

  test("shows agent86's warning for a write into its own skills", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "add a skill");
    const panel = page.getByRole("group", { name: "Approval needed: write_file" });
    await expect(panel.getByRole("note")).toContainText("agent86's own configuration or skills");
    await expect(panel).toContainText("new file: .agent86/skills/demo/SKILL.md");
    await page.keyboard.press("2");
    await expect(card(page)).toHaveAttribute("data-state", "declined");
    expect(existsSync(join(bridge.workspace, ".agent86", "skills", "demo", "SKILL.md"))).toBe(
      false,
    );
  });

  test("runs a read without asking, and Ctrl+O expands the card", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "read the readme");
    await expect(card(page)).toHaveAttribute("data-state", "done");
    await expect(card(page)).toContainText("⎿ Teh quick brown fox");
    await expect(page.getByRole("group")).toHaveCount(0);
    await page.keyboard.press("Control+o");
    await expect(card(page).getByText("Arguments")).toBeVisible();
    await expect(card(page).getByText("Result")).toBeVisible();
  });
}

test.describe("approvals with the mock agent", () => {
  approvalFlows(() => startBridge(mockAgent86()));
});

test.describe("approvals with the real agent86", () => {
  test.skip(!process.env.AGENT86_BIN, "set AGENT86_BIN to run against a real agent86");
  let model: Awaited<ReturnType<typeof scriptedModel>> | undefined;
  test.afterEach(async () => {
    await model?.stop();
  });
  approvalFlows(async () => {
    model = await scriptedModel();
    return startBridge(process.env.AGENT86_BIN!, model.env);
  });
});
