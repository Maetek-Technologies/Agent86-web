// @vitest-environment jsdom
import type { Entry } from "@agent86-web/acp-client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptInput } from "../src/thread/PromptInput.tsx";
import { Transcript } from "../src/thread/Transcript.tsx";

afterEach(cleanup);

describe("Transcript", () => {
  it("shows reasoning while it streams, and folds it once it is over", () => {
    const streaming: Entry[] = [
      { kind: "user", id: 1, text: "hi" },
      { kind: "thought", id: 2, text: "Let me think.", startedAt: Date.now() },
    ];
    const { rerender } = render(<Transcript entries={streaming} />);
    expect(screen.getByText("Let me think.")).toBeTruthy();
    expect(screen.getByRole("button", { expanded: true }).textContent).toContain("Thinking…");

    const done: Entry[] = [
      { kind: "user", id: 1, text: "hi" },
      { kind: "thought", id: 2, text: "Let me think.", startedAt: 0, endedAt: 4000 },
      { kind: "agent", id: 3, text: "**Hello**" },
    ];
    rerender(<Transcript entries={done} />);
    expect(screen.queryByText("Let me think.")).toBeNull();
    const toggle = screen.getByRole("button", { expanded: false });
    expect(toggle.textContent).toContain("Thought for 4s · 13 chars");
    expect(screen.getByText("Hello").tagName).toBe("STRONG");

    fireEvent.click(toggle);
    expect(screen.getByText("Let me think.")).toBeTruthy();
  });

  it("shows user text literally, not as Markdown", () => {
    render(<Transcript entries={[{ kind: "user", id: 1, text: "**not bold** <b>x</b>" }]} />);
    expect(screen.getByText("**not bold** <b>x</b>")).toBeTruthy();
  });

  it("shows an error with its hint", () => {
    render(
      <Transcript
        entries={[{ kind: "notice", id: 1, level: "error", text: "HTTP 400", hint: "run this" }]}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("HTTP 400");
    expect(screen.getByRole("alert").textContent).toContain("run this");
  });

  it("shows a tool call with its first result line, and the rest on demand", () => {
    render(
      <Transcript
        entries={[
          {
            kind: "tool",
            id: 1,
            toolCallId: "t",
            title: "list_dir .",
            name: "list_dir",
            status: "completed",
            output: "a.txt\nb.txt",
          },
        ]}
      />,
    );
    expect(screen.getByText("⎿ a.txt")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/a\.txt\s+b\.txt/)).toBeTruthy();
  });
});

describe("PromptInput", () => {
  it("sends on Enter, adds a line on Shift+Enter, and clears after sending", () => {
    const onSend = vi.fn();
    render(<PromptInput workspace="/w" busy={false} disabled={false} onSend={onSend} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "  hello  " } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("hello");
    expect(box.value).toBe("");
  });

  it("keeps typed text but does not send while a turn runs", () => {
    const onSend = vi.fn();
    render(<PromptInput workspace="/w" busy disabled={false} onSend={onSend} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "next" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    expect(box.value).toBe("next");
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not send empty text", () => {
    const onSend = vi.fn();
    render(<PromptInput workspace="/w" busy={false} disabled={false} onSend={onSend} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });
});
