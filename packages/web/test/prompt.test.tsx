// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mentionedLinks, PromptInput, tokenAt } from "../src/thread/PromptInput.tsx";
import { choicesOf } from "../src/thread/ThreadHeader.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => window.localStorage.clear());

const COMMANDS = [
  {
    name: "mode",
    description: "Show or set the approval mode",
    input: { hint: "ask, auto, or deny" },
  },
  { name: "model", description: "Show or switch the model" },
  { name: "cost", description: "Show the session's cost" },
];

function box() {
  return screen.getByRole("textbox") as HTMLTextAreaElement;
}

function type(value: string) {
  const el = box();
  fireEvent.change(el, { target: { value, selectionStart: value.length } });
  el.setSelectionRange(value.length, value.length);
  fireEvent.select(el);
}

describe("tokenAt", () => {
  it("finds a command at the start and a mention anywhere", () => {
    expect(tokenAt("/mo", 3)).toEqual({ kind: "command", query: "mo", start: 0 });
    expect(tokenAt("/mode ask", 9)).toBeUndefined();
    expect(tokenAt("look at @src/ap", 15)).toEqual({ kind: "mention", query: "src/ap", start: 8 });
    expect(tokenAt("@", 1)).toEqual({ kind: "mention", query: "", start: 0 });
    expect(tokenAt("mail me@x", 9)).toBeUndefined();
  });
});

describe("mentionedLinks", () => {
  it("links only picked files, once each, as file URIs", () => {
    const links = mentionedLinks(
      "see @README.md and @src/a b.ts and @README.md and @typed",
      new Set(["README.md", "src/a"]),
      "/home/me/app",
    );
    expect(links).toEqual([
      { name: "README.md", uri: "file:///home/me/app/README.md" },
      { name: "src/a", uri: "file:///home/me/app/src/a" },
    ]);
    expect(mentionedLinks("@x", new Set(["x"]), "C:\\work\\app")).toEqual([
      { name: "x", uri: "file:///C:/work/app/x" },
    ]);
  });
});

describe("the / menu", () => {
  it("offers agent86's commands and completes the chosen one", async () => {
    render(
      <PromptInput
        workspace="/w"
        busy={false}
        disabled={false}
        commands={COMMANDS}
        onSend={vi.fn()}
      />,
    );
    type("/mo");
    const list = await screen.findByRole("listbox", { name: "Commands" });
    expect([...list.querySelectorAll("[role=option]")].map((o) => o.textContent)).toEqual([
      "/modeShow or set the approval mode (ask, auto, or deny)",
      "/modelShow or switch the model",
    ]);
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(box().value).toBe("/model ");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on Esc without sending", async () => {
    const onSend = vi.fn();
    render(
      <PromptInput
        workspace="/w"
        busy={false}
        disabled={false}
        commands={COMMANDS}
        onSend={onSend}
      />,
    );
    type("/c");
    await screen.findByRole("listbox");
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("the @ menu", () => {
  it("offers workspace files from the bridge and sends picked ones as links", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ files: ["README.md", "src/readme.ts"] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSend = vi.fn();
    render(<PromptInput workspace="/home/me/app" busy={false} disabled={false} onSend={onSend} />);
    type("fix @read");
    const list = await screen.findByRole("listbox", { name: "Files" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files?workspace=%2Fhome%2Fme%2Fapp&q=read",
      expect.anything(),
    );
    expect(list.textContent).toContain("src/readme.ts");
    fireEvent.mouseDown(screen.getByRole("option", { name: "README.md" }));
    expect(box().value).toBe("fix @README.md ");
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("fix @README.md", [
      { name: "README.md", uri: "file:///home/me/app/README.md" },
    ]);
  });
});

describe("history", () => {
  it("recalls this workspace's earlier prompts with Up and Down", async () => {
    const onSend = vi.fn();
    const { unmount } = render(
      <PromptInput workspace="/w" busy={false} disabled={false} onSend={onSend} />,
    );
    for (const text of ["first", "second"]) {
      type(text);
      fireEvent.keyDown(box(), { key: "Enter" });
    }
    unmount();
    // Remembered across a reload.
    render(<PromptInput workspace="/w" busy={false} disabled={false} onSend={onSend} />);
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    expect(box().value).toBe("second");
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    expect(box().value).toBe("first");
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(box().value).toBe("second");
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    await waitFor(() => expect(box().value).toBe(""));
  });

  it("keeps workspaces apart", () => {
    window.localStorage.setItem("agent86web.history.v1:/other", JSON.stringify(["elsewhere"]));
    render(<PromptInput workspace="/w" busy={false} disabled={false} onSend={vi.fn()} />);
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    expect(box().value).toBe("");
  });
});

describe("choicesOf", () => {
  it("separates grouped and flat choices, as agent86 sends them", () => {
    const model = {
      id: "model",
      name: "Model",
      type: "select",
      currentValue: "mock:test-model",
      options: [
        {
          group: "configured",
          name: "Configured",
          options: [{ value: "mock:test-model", name: "mock:test-model" }],
        },
        {
          group: "openrouter",
          name: "openrouter",
          options: [{ value: "openrouter:x", name: "x" }],
        },
      ],
    } as Parameters<typeof choicesOf>[0];
    expect(choicesOf(model).groups.map((g) => g.name)).toEqual(["Configured", "openrouter"]);
    const mode = {
      id: "mode",
      name: "Approval mode",
      type: "select",
      currentValue: "ask",
      options: [{ value: "ask", name: "ask" }],
    } as Parameters<typeof choicesOf>[0];
    expect(choicesOf(mode)).toEqual({ groups: [], flat: [{ value: "ask", name: "ask" }] });
  });
});
