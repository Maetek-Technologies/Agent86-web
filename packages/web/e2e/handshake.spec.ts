import { expect, test } from "@playwright/test";
import { mockAgent86, startBridge, type Bridge } from "./bridge.ts";

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
    await expect(page.getByRole("status")).toHaveText("✓ Connected to agent86 1.0.15");
    expect(page.url()).toBe(`${bridge.origin}/`);
    await expect(page.getByText("text, file links")).toBeVisible();
    await expect(page.getByText(bridge.workspace)).toBeVisible();
    // No CSP violations or other errors.
    expect(errors).toEqual([]);
    expect(bridge.stderr()).toMatch(/starting agent86 in /);
  });

  test("keeps working after a reload, on the session cookie", async ({ page }) => {
    await page.goto(bridge.url);
    await expect(page.getByRole("status")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("status")).toHaveText("✓ Connected to agent86 1.0.15");
  });

  test("refuses the same link in a second browser", async ({ page, browser }) => {
    await page.goto(bridge.url);
    await expect(page.getByRole("status")).toBeVisible();

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
    await expect(page.getByRole("alert")).toContainText('The agent is "impostor", not agent86.');
  } finally {
    await bridge.stop();
  }
});

// Against the real binary: set AGENT86_BIN (CI installs agent86 from npm). No model or key is
// needed for the handshake.
test("handshake with the real agent86", async ({ page }) => {
  const agent86 = process.env.AGENT86_BIN;
  test.skip(!agent86, "set AGENT86_BIN to run against a real agent86");
  const bridge = await startBridge(agent86!);
  try {
    await page.goto(bridge.url);
    await expect(page.getByRole("status")).toContainText("✓ Connected to agent86");
  } finally {
    await bridge.stop();
  }
});
