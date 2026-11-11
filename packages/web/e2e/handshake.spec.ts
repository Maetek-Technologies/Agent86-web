import { expect, test } from "@playwright/test";
import { mockAgent86, openThread, scriptedModel, startBridge, type Bridge } from "./bridge.ts";

const newThread = (page: import("@playwright/test").Page) =>
  page
    .getByRole("main")
    .getByRole("button", { name: /^New thread in / })
    .click();

test.describe("handshake with the mock agent", () => {
  let bridge: Bridge;
  test.beforeEach(async () => {
    bridge = await startBridge(mockAgent86());
  });
  test.afterEach(async () => {
    await bridge.stop();
  });

  test("signs in, removes the token from the URL, and shows the handshake", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto(bridge.url);
    await expect(page.getByText("What should agent86 work on?")).toBeVisible();
    expect(page.url()).toBe(`${bridge.origin}/`);
    await page.getByRole("button", { name: "agent86 1.0.15" }).click();
    await expect(page.getByRole("definition").filter({ hasText: bridge.workspace })).toBeVisible();
    await newThread(page);
    await expect(page.getByText("What should agent86 do?")).toBeVisible();
    // No CSP violations or other errors.
    expect(errors).toEqual([]);
    expect(bridge.stderr()).toMatch(/starting agent86 in /);
  });

  test("keeps working after a reload, on the session cookie", async ({ page }) => {
    await page.goto(bridge.url);
    await expect(page.getByText("What should agent86 work on?")).toBeVisible();
    await page.reload();
    await expect(page.getByText("What should agent86 work on?")).toBeVisible();
  });

  test("refuses the same link in a second browser", async ({ page, browser }) => {
    await page.goto(bridge.url);
    await expect(page.getByText("What should agent86 work on?")).toBeVisible();

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(bridge.url);
    await expect(otherPage.getByRole("alert")).toContainText("already been used or has expired");
    await other.close();
  });

  test("tells a browser without the link to open it", async ({ page }) => {
    await page.goto(bridge.origin);
    await expect(page.getByRole("alert")).toContainText("Open the link that agent86-web printed");
  });
});

test("warns about an agent that is not agent86", async ({ page }) => {
  const bridge = await startBridge(mockAgent86(), { MOCK_AGENT86_NAME: "impostor" });
  try {
    await page.goto(bridge.url);
    await newThread(page);
    await expect(page.getByRole("alert")).toContainText('The agent is "impostor", not agent86.');
  } finally {
    await bridge.stop();
  }
});

// Against the real binary: set AGENT86_BIN (CI installs agent86 from npm).
test.describe("the real agent86", () => {
  test.skip(!process.env.AGENT86_BIN, "set AGENT86_BIN to run against a real agent86");

  test("connects and starts a session", async ({ page }) => {
    const model = await scriptedModel();
    const bridge = await startBridge(process.env.AGENT86_BIN!, model.env);
    try {
      await openThread(page, bridge.url);
      await expect(page.getByText("What should agent86 do?")).toBeVisible();
    } finally {
      await bridge.stop();
      await model.stop();
    }
  });

  test("without a model key, explains how to set one up", async ({ page }) => {
    // An empty home: agent86's default model (Anthropic) and no key for it.
    const empty = await scriptedModel({ config: "" });
    const env: Record<string, string> = { ...empty.env, ANTHROPIC_API_KEY: "" };
    const bridge = await startBridge(process.env.AGENT86_BIN!, env);
    try {
      await page.goto(bridge.url);
      await newThread(page);
      const alert = page.getByRole("alert");
      await expect(alert).toContainText("No Anthropic API key found");
      await expect(alert).toContainText("agent86 keys set");
    } finally {
      await bridge.stop();
      await empty.stop();
    }
  });
});
