import { expect, test, type Page } from "@playwright/test";
import {
  mockAgent86,
  recordFile,
  scriptedModel,
  startBridge,
  type Bridge,
  openThread,
} from "./bridge.ts";

async function send(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: "Message agent86" });
  await box.fill(text);
  await box.press("Enter");
}

const status = (page: Page) => page.getByRole("status", { name: "Agent status" });
const replies = (page: Page) => page.getByLabel("agent86", { exact: true });

/** The flows every agent must pass: run against the mock agent and the real agent86. */
function chatFlows(start: () => Promise<Bridge>, sessionHint: RegExp) {
  let bridge: Bridge;
  test.beforeEach(async () => {
    bridge = await start();
  });
  test.afterEach(async () => {
    await bridge.stop();
  });

  test("streams a reply, with the reasoning folded once the answer starts", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "hello");
    await expect(page.getByLabel("You", { exact: true })).toHaveText("hello");
    await expect(replies(page)).toHaveText("Hello from the mock model. You said: hello");
    await expect(status(page)).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Message agent86" })).toBeFocused();
    const thought = page.getByTestId("thought");
    await expect(thought.getByRole("button")).toContainText("Thought for");
    await expect(thought).not.toContainText("Let me think about that.");
    await thought.getByRole("button").click();
    await expect(thought).toContainText("Let me think about that.");
  });

  test("renders Markdown safely", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "show me markdown");
    const reply = replies(page);
    await expect(reply.getByRole("heading", { name: "Mock report" })).toBeVisible();
    await expect(reply.locator("pre code")).toHaveText("export const answer: number = 42;");
    await expect(reply.getByRole("cell", { name: "read_file" })).toBeVisible();
    await expect(reply.getByRole("link", { name: "link" })).toHaveAttribute(
      "rel",
      "noopener noreferrer nofollow",
    );
    await expect(reply.getByRole("link", { name: "[image: pixel]" })).toBeVisible();
    await expect(status(page)).toBeHidden();
    expect(await reply.locator("img, script").count()).toBe(0);
  });

  test("Esc cancels a turn at its next safe point", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "go slow");
    await expect(status(page)).toContainText("Writing…");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("note").filter({ hasText: "Cancelled." })).toBeVisible();
    await expect(status(page)).toBeHidden();
    await expect(replies(page).first()).toContainText("word0");
    await expect(replies(page).first()).not.toContainText("[cancelled]");
    // The thread carries on.
    await send(page, "hello again");
    await expect(replies(page).last()).toHaveText(
      "Hello from the mock model. You said: hello again",
    );
  });

  test("the Stop button cancels too", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "slow please");
    await expect(status(page)).toContainText("Writing…");
    await page.getByRole("button", { name: "■ Stop" }).click();
    await expect(page.getByRole("note").filter({ hasText: "Cancelled." })).toBeVisible();
  });

  test("shows a model error with the trace hint, and the next turn works", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "please fail");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("HTTP 400");
    await expect(alert).toContainText("The mock model refuses");
    await expect(alert).toContainText(sessionHint);
    await send(page, "hello");
    await expect(replies(page).last()).toHaveText("Hello from the mock model. You said: hello");
  });

  test("answers a slash command without the model", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "/cost");
    await expect(replies(page)).toContainText("cost n/a");
  });
}

test.describe("chat with the mock agent", () => {
  let record = "";
  chatFlows(async () => {
    record = recordFile();
    return startBridge(mockAgent86(), { MOCK_AGENT86_RECORD: record });
  }, /agent86 trace show -s mock-[0-9a-f]+/);
});

// Against the real binary, which calls a scripted OpenAI-compatible server instead of a model.
test.describe("chat with the real agent86", () => {
  test.skip(!process.env.AGENT86_BIN, "set AGENT86_BIN to run against a real agent86");
  let model: Awaited<ReturnType<typeof scriptedModel>> | undefined;
  test.afterEach(async () => {
    await model?.stop();
  });
  chatFlows(async () => {
    model = await scriptedModel();
    return startBridge(process.env.AGENT86_BIN!, model.env);
  }, /agent86 trace show -s \w+/);
});

test("the mock agent receives session/cancel on Esc", async ({ page }) => {
  const record = recordFile();
  const bridge = await startBridge(mockAgent86(), { MOCK_AGENT86_RECORD: record });
  try {
    await openThread(page, bridge.url);
    await send(page, "go slow");
    await expect(status(page)).toContainText("Writing…");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("note").filter({ hasText: "Cancelled." })).toBeVisible();
    // The sidebar's session list runs its own short-lived agent86; leave its messages out.
    const methods = bridge
      .recorded()
      .map((m) => m.method)
      .filter((m) => m !== "initialize" && m !== "session/list");
    expect(methods).toEqual(["session/new", "session/prompt", "session/cancel"]);
    expect(bridge.recorded().find((m) => m.method === "session/new")?.params).toMatchObject({
      cwd: bridge.workspace,
      mcpServers: [],
    });
  } finally {
    await bridge.stop();
  }
});
