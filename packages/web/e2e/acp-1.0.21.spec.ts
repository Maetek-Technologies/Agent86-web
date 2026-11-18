// agent86 1.0.21's ACP additions in the browser: who asks on a sub-agent's approval, the approval
// inbox, session/resume on reconnect, and a session that survives agent86 stopping mid-turn; and
// agent86 1.0.20, which has none of it.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

const box = (page: Page) => page.getByRole("textbox", { name: "Message Agent 86" });
const replies = (page: Page) => page.getByLabel("Agent 86", { exact: true });
const inbox = (page: Page) => page.getByRole("complementary", { name: "Approval inbox" });
const panel = (page: Page) => page.getByRole("group", { name: "Approval needed: write_file" });

async function send(page: Page, text: string) {
  await box(page).fill(text);
  await box(page).press("Enter");
}

async function idle(page: Page) {
  await expect(box(page)).toBeEditable();
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
}

/** The methods agent86 received, in order (the mock records them). */
const methods = (bridge: Bridge) => bridge.recorded().map((m) => m.method);

let bridge: Bridge;

// Playwright requires the fixtures argument to be an object pattern, even when unused.
// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
  await bridge?.stop();
  if (testInfo.status !== testInfo.expectedStatus) {
    writeFileSync(testInfo.outputPath("bridge.log"), bridge?.stderr() ?? "");
  }
});

test.describe("with the mock agent as agent86 1.0.21", () => {
  test.beforeEach(async () => {
    bridge = await startBridge(mockAgent86(), {
      MOCK_AGENT86_VERSION: "1.0.21",
      MOCK_AGENT86_COST_CAP: "0.5",
      MOCK_AGENT86_RECORD: recordFile(),
    });
    writeFileSync(join(bridge.workspace, "README.md"), "Teh quick brown fox\n");
  });

  test("lists the queued approvals, and says which sub-agent asks, where, and what it spent", async ({
    page,
  }) => {
    await openThread(page, bridge.url);
    await send(page, "parallel writers");
    const items = inbox(page).getByTestId("inbox-item");
    await expect(items).toHaveCount(2);
    await expect(inbox(page).getByTestId("inbox-count")).toHaveText("2");
    await expect(items.first()).toHaveAttribute("data-position", "asking");
    await expect(items.first()).toContainText("writer");
    await expect(items.nth(1)).toContainText("waiting #1");

    const asker = panel(page).getByTestId("asker");
    await expect(asker.getByTestId("asker-name")).toHaveText("writer");
    await expect(asker.getByTestId("asker-worktree")).toHaveText(
      "Works in an isolated worktree on agent86/writer-1",
    );
    await expect(asker.getByTestId("asker-spend")).toContainText("of a $0.50 cap");
    await panel(page)
      .getByRole("button", { name: /Allow once/ })
      .click();

    // The next question follows straight on; the first is no longer listed.
    await expect(items).toHaveCount(1);
    await expect(panel(page).getByTestId("asker-worktree")).toHaveCount(0);
    await expect(panel(page).getByTestId("asker-name")).toHaveText("writer");
    await panel(page)
      .getByRole("button", { name: /Allow once/ })
      .click();

    await expect(inbox(page)).toHaveCount(0);
    await idle(page);
    await expect(replies(page).last()).toContainText("Both writers are done.");
    expect(existsSync(join(bridge.workspace, "one.txt"))).toBe(true);
    expect(existsSync(join(bridge.workspace, "two.txt"))).toBe(true);
  });

  test("empties the inbox when the turn is stopped", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "parallel writers");
    await expect(inbox(page).getByTestId("inbox-item")).toHaveCount(2);
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(inbox(page)).toHaveCount(0);
    await idle(page);
    await expect(page.getByText("Cancelled.")).toBeVisible();
    await expect(inbox(page)).toHaveCount(0);
    expect(existsSync(join(bridge.workspace, "two.txt"))).toBe(false);
  });

  test("after agent86 stops mid-turn, resumes the session and offers to continue", async ({
    page,
  }) => {
    await openThread(page, bridge.url);
    await send(page, "crash after reading");
    const note = page.getByTestId("turn-interrupted");
    await expect(note).toContainText("Interrupted: Agent 86 stopped partway through this turn");
    // The transcript the tab had is kept, not replayed: the read step, the partial answer.
    await expect(page.getByLabel("You", { exact: true })).toHaveText(["crash after reading"]);
    await expect(page.getByTestId("tool-card").first()).toHaveAttribute("data-state", "done");
    await expect(replies(page).last()).toContainText("Halfway through the answer");
    expect(methods(bridge).filter((m) => m === "session/resume")).toHaveLength(1);
    expect(methods(bridge)).not.toContain("session/load");

    await note.getByRole("button", { name: "Continue" }).click();
    await expect(replies(page).last()).toHaveText(
      'Continuing from "crash after reading" with the earlier tool result in view.',
    );
    await expect(note.getByRole("button", { name: "Continue" })).toHaveCount(0);
  });

  test("reconnects to a new agent86 with session/resume, keeping the transcript", async ({
    page,
  }) => {
    await openThread(page, bridge.url);
    await send(page, "hello, then exit after replying");
    await expect(replies(page).last()).toContainText("You said: hello, then exit after replying");
    await expect.poll(() => methods(bridge).filter((m) => m === "session/resume")).toHaveLength(1);
    await idle(page);
    await expect(page.getByTestId("turn-interrupted")).toHaveCount(0);
    await expect(page.getByLabel("You", { exact: true })).toHaveCount(1);
    expect(methods(bridge)).not.toContain("session/load");
    await send(page, "still there?");
    await expect(replies(page).last()).toContainText("You said: still there?");
  });

  test("a reload, with no transcript in the tab, still loads the session", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "hello");
    await idle(page);
    await page.reload();
    await expect(replies(page).last()).toContainText("You said: hello");
    expect(methods(bridge)).toContain("session/load");
    expect(methods(bridge)).not.toContain("session/resume");
  });
});

test.describe("with the mock agent as agent86 1.0.20 (none of it)", () => {
  test.beforeEach(async () => {
    bridge = await startBridge(mockAgent86(), {
      MOCK_AGENT86_VERSION: "1.0.20",
      MOCK_AGENT86_RECORD: recordFile(),
    });
    writeFileSync(join(bridge.workspace, "README.md"), "Teh quick brown fox\n");
  });

  test("asks as before: no inbox, no asker, agent86's own line on the approval", async ({
    page,
  }) => {
    await openThread(page, bridge.url);
    await send(page, "parallel writers");
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole("note")).toContainText("Asked by the 'writer' sub-agent.");
    await expect(panel(page).getByTestId("asker")).toHaveCount(0);
    await expect(inbox(page)).toHaveCount(0);
    await panel(page)
      .getByRole("button", { name: /Allow once/ })
      .click();
    await panel(page)
      .getByRole("button", { name: /Allow once/ })
      .click();
    await idle(page);
    await expect(inbox(page)).toHaveCount(0);
  });

  test("reopens with session/load after agent86 stops, with nothing marked interrupted", async ({
    page,
  }) => {
    await openThread(page, bridge.url);
    await send(page, "hello");
    await idle(page);
    await send(page, "crash after reading");
    await expect.poll(() => methods(bridge)).toContain("session/load");
    await idle(page);
    expect(methods(bridge)).not.toContain("session/resume");
    await expect(page.getByTestId("turn-interrupted")).toHaveCount(0);
    await expect(replies(page).first()).toContainText("You said: hello");
  });
});

test.describe("with the real agent86", () => {
  test.skip(!process.env.AGENT86_BIN, "set AGENT86_BIN to run against a real agent86");
  test.skip(
    () => !realAgentAtLeast("1.0.21"),
    "the real agent86 is older than 1.0.21, which added the inbox and session/resume",
  );
  let model: Awaited<ReturnType<typeof scriptedModel>> | undefined;
  test.afterEach(async () => {
    await model?.stop();
  });

  test.beforeEach(async () => {
    model = await scriptedModel({ pricing: true });
    const agents = join(model.env.HOME!, ".agent86", "agents");
    mkdirSync(agents, { recursive: true });
    // As agent86's own tests: a user specialist that may only write files.
    writeFileSync(
      join(agents, "writer.md"),
      "---\nname: writer\ndescription: Writes files.\ntools: write_file\n---\nWrite what you are asked to.\n",
    );
    bridge = await startBridge(process.env.AGENT86_BIN!, model.env);
    writeFileSync(join(bridge.workspace, "README.md"), "Teh quick brown fox\n");
  });

  test("two writers at once: one asked, one waiting, each saying who asks", async ({ page }) => {
    await openThread(page, bridge.url);
    await send(page, "parallel writers");
    const items = inbox(page).getByTestId("inbox-item");
    await expect(items).toHaveCount(2, { timeout: 20_000 });
    await expect(panel(page).getByTestId("asker-name")).toHaveText("writer");
    await expect(panel(page).getByTestId("asker-spend")).toContainText("of a $0.50 cap");
    await panel(page)
      .getByRole("button", { name: /Allow once/ })
      .click();
    await expect(items).toHaveCount(1);
    await expect(panel(page).getByTestId("asker-name")).toHaveText("writer");
    await panel(page)
      .getByRole("button", { name: /Allow once/ })
      .click();
    await expect(inbox(page)).toHaveCount(0);
    await idle(page);
    expect(existsSync(join(bridge.workspace, "one.txt"))).toBe(true);
    expect(existsSync(join(bridge.workspace, "two.txt"))).toBe(true);
  });

  test("killed mid-turn: the session reopens with its finished step, and continues", async ({
    page,
  }) => {
    await openThread(page, bridge.url);
    await send(page, "crash after reading");
    await expect(page.getByTestId("tool-card").first()).toHaveAttribute("data-state", "done", {
      timeout: 20_000,
    });
    await expect(replies(page).last()).toContainText("word3");
    const pids = [...bridge.stderr().matchAll(/agent86 pid (\d+)/g)].map((m) => Number(m[1]));
    expect(pids).toHaveLength(1);
    process.kill(pids[0]!);

    const note = page.getByTestId("turn-interrupted");
    await expect(note).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("tool-card").first()).toHaveAttribute("data-state", "done");
    await note.getByRole("button", { name: "Continue" }).click();
    await expect(replies(page).last()).toHaveText(
      'Continuing from "crash after reading" with the earlier tool result in view.',
      { timeout: 20_000 },
    );
  });
});
