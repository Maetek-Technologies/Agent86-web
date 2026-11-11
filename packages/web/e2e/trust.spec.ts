import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { mockAgent86, openThread, scriptedModel, startBridge, type Bridge } from "./bridge.ts";

const MCP = fileURLToPath(new URL("../../mock-agent/src/mock-mcp.js", import.meta.url));
const box = (page: Page) =>
  page.getByRole("textbox", { name: "Message agent86" }).filter({ visible: true });
const visible = (page: Page) => page.getByRole("tabpanel").filter({ visible: true });
const replies = (page: Page) => visible(page).getByLabel("agent86", { exact: true });
const banner = (page: Page) => visible(page).getByRole("region", { name: "Project trust" });

async function tools(page: Page): Promise<string> {
  await box(page).fill("/tools");
  await box(page).press("Enter");
  await expect(replies(page).last()).toContainText("tools:");
  return (await replies(page).last().textContent()) ?? "";
}

/** A project whose agent86 config starts an MCP server: a setting that needs trust. */
function writeProjectConfig(workspace: string, command = process.execPath) {
  mkdirSync(join(workspace, ".agent86"), { recursive: true });
  writeFileSync(
    join(workspace, ".agent86", "config.toml"),
    `[mcp.servers.demo]\ncommand = ${JSON.stringify(command)}\nargs = [${JSON.stringify(MCP)}]\n`,
  );
}

function trustFlows(start: () => Promise<Bridge>) {
  let bridge: Bridge;
  test.beforeEach(async () => {
    bridge = await start();
    writeProjectConfig(bridge.workspace);
  });
  test.afterEach(async () => {
    await bridge.stop();
  });

  test("ignores the project's MCP server until trusted, then starts it", async ({ page }) => {
    await openThread(page, bridge.url);
    await expect(banner(page)).toContainText("mcp_servers.demo.command");
    await box(page).fill("hello");
    await box(page).press("Enter");
    await expect(replies(page)).toContainText("You said: hello");
    expect(await tools(page)).not.toContain("mcp__demo__mock_echo");

    await banner(page).getByRole("button", { name: "Review and trust" }).click();
    const dialog = page.getByRole("dialog", { name: /Review and trust/ });
    await expect(dialog.getByLabel("Project config file")).toContainText("[mcp.servers.demo]");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await dialog.getByRole("button", { name: "Trust this file" }).click();

    // agent86 restarts with the project's settings, and the conversation continues.
    await expect(banner(page)).toHaveCount(0);
    await expect(box(page)).toBeEditable();
    // The session's turns are replayed (slash commands are not saved, as in agent86).
    await expect(visible(page).getByLabel("You", { exact: true }).first()).toHaveText("hello");
    expect(await tools(page)).toContain("mcp__demo__mock_echo");

    // Remembered across a reload, for this file as it is.
    await page.reload();
    await expect(box(page)).toBeEditable();
    expect(await tools(page)).toContain("mcp__demo__mock_echo");
    await expect(banner(page)).toHaveCount(0);
  });

  test("needs trust again once the file changes, and trust can be revoked", async ({ page }) => {
    await openThread(page, bridge.url);
    await banner(page).getByRole("button", { name: "Review and trust" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Trust this file" }).click();
    await expect(banner(page)).toHaveCount(0);

    writeProjectConfig(bridge.workspace, "/usr/bin/env");
    await page.keyboard.press("Alt+n");
    await expect(banner(page)).toContainText("mcp_servers.demo.command");

    await page.getByRole("button", { name: /^agent86 \d/ }).click();
    const trusted = page.getByRole("region", { name: "Trusted projects" });
    await expect(trusted).toContainText(join(bridge.workspace, ".agent86", "config.toml"));
    await trusted.getByRole("button", { name: "Revoke" }).click();
    await expect(trusted).toContainText("None.");
  });

  test("Cancel leaves the project untrusted", async ({ page }) => {
    await openThread(page, bridge.url);
    await banner(page).getByRole("button", { name: "Review and trust" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(banner(page)).toBeVisible();
    expect(await tools(page)).not.toContain("mcp__demo__mock_echo");
  });
}

test.describe("trust with the mock agent", () => {
  trustFlows(() => {
    // The bridge keeps its trust records under HOME; give each test its own.
    const home = mkdtempSync(join(tmpdir(), "agent86-web-e2e-home-"));
    return startBridge(mockAgent86(), { HOME: home, USERPROFILE: home });
  });
});

test.describe("trust with the real agent86", () => {
  test.skip(!process.env.AGENT86_BIN, "set AGENT86_BIN to run against a real agent86");
  let model: Awaited<ReturnType<typeof scriptedModel>> | undefined;
  test.afterEach(async () => {
    await model?.stop();
  });
  trustFlows(async () => {
    model = await scriptedModel();
    return startBridge(process.env.AGENT86_BIN!, model.env);
  });
});
