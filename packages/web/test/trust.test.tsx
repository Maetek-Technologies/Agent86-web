// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { showControls } from "../src/trust/showControls.ts";
import { TrustDialog } from "../src/trust/TrustDialog.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("showControls", () => {
  it("makes control and bidirectional characters visible, keeping newlines and tabs", () => {
    expect(showControls("a\tb\nc")).toBe("a\tb\nc");
    expect(showControls("x\u0007y")).toBe("x⟨U+0007⟩y");
    expect(showControls('command = "safe‮"')).toBe('command = "safe⟨U+202E⟩"');
    expect(showControls("﻿key = 1​")).toBe("⟨U+FEFF⟩key = 1⟨U+200B⟩");
  });
});

const CONFIG = {
  path: "/w/.agent86/config.toml",
  contents: '[mcp.servers.demo]\ncommand = "node‮"\n',
  sha256: "ab".repeat(32),
};

function stubBridge(trustStatus = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify({ config: CONFIG, trusted: false }));
      }
      return trustStatus === 200
        ? new Response(JSON.stringify({ trusted: true }))
        : new Response(
            JSON.stringify({
              error: "config_changed",
              message: "The file changed since you reviewed it.",
            }),
            {
              status: trustStatus,
            },
          );
    }),
  );
  return calls;
}

describe("TrustDialog", () => {
  it("shows the whole file with its path and hash, and focuses Cancel", async () => {
    stubBridge();
    render(
      <TrustDialog
        workspace="/w"
        untrusted={{ count: 1, keys: ["mcp_servers.demo.command"] }}
        onTrusted={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const file = await screen.findByLabelText("Project config file");
    expect(file.textContent).toBe('[mcp.servers.demo]\ncommand = "node⟨U+202E⟩"\n');
    expect(screen.getByText(`sha256 ${CONFIG.sha256}`)).toBeTruthy();
    expect(screen.getByText("mcp_servers.demo.command")).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Cancel"));
  });

  it("trusts with the reviewed hash", async () => {
    const calls = stubBridge();
    const onTrusted = vi.fn();
    render(
      <TrustDialog workspace="/w" untrusted={undefined} onTrusted={onTrusted} onCancel={vi.fn()} />,
    );
    await screen.findByLabelText("Project config file");
    fireEvent.click(screen.getByRole("button", { name: "Trust this file" }));
    await waitFor(() => expect(onTrusted).toHaveBeenCalled());
    const post = calls.find((c) => c.init?.method === "POST")!;
    expect(post.url).toBe("/api/trust");
    expect(JSON.parse(String(post.init!.body))).toEqual({ workspace: "/w", sha256: CONFIG.sha256 });
    expect((post.init!.headers as Record<string, string>)["x-agent86-web"]).toBe("1");
  });

  it("says so when the file changed since it was shown", async () => {
    stubBridge(409);
    const onTrusted = vi.fn();
    render(
      <TrustDialog workspace="/w" untrusted={undefined} onTrusted={onTrusted} onCancel={vi.fn()} />,
    );
    await screen.findByLabelText("Project config file");
    fireEvent.click(screen.getByRole("button", { name: "Trust this file" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "changed since you reviewed it",
    );
    expect(onTrusted).not.toHaveBeenCalled();
  });

  it("cancels on Esc", async () => {
    stubBridge();
    const onCancel = vi.fn();
    render(
      <TrustDialog workspace="/w" untrusted={undefined} onTrusted={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });
});
