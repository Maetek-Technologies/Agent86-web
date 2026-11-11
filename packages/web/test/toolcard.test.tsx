// @vitest-environment jsdom
import type { AgentSession, PendingPermission, ToolEntry } from "@agent86-web/acp-client";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadContext } from "../src/thread/ThreadContext.ts";
import { ToolCard } from "../src/tools/ToolCard.tsx";

afterEach(cleanup);

const DIFF =
  "--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-Teh quick brown fox\n+The quick brown fox";

const entry = (over: Partial<ToolEntry> = {}): ToolEntry => ({
  kind: "tool",
  id: 1,
  toolCallId: "t1",
  title: 'edit_file({"path": "README.md"})',
  name: "edit_file",
  toolKind: "edit",
  status: "pending",
  rawInput: { path: "README.md", old_string: "Teh", new_string: "The" },
  output: "",
  ...over,
});

const request = (text = DIFF): PendingPermission => ({
  id: 9,
  toolCallId: "t1",
  title: "edit_file(...)",
  toolKind: "edit",
  text,
  options: [
    { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
    { optionId: "reject-once", name: "Reject", kind: "reject_once" },
  ],
});

function renderCard(tool: ToolEntry, permissions: PendingPermission[] = [], expandAll = false) {
  const session = { respond: vi.fn(), reject: vi.fn() };
  render(
    <ThreadContext.Provider
      value={{ session: session as unknown as AgentSession, permissions, expandAll }}
    >
      <ToolCard entry={tool} />
    </ThreadContext.Provider>,
  );
  return session;
}

describe("ToolCard with a permission request", () => {
  it("shows the diff and the options in agent86's order", () => {
    renderCard(entry(), [request()]);
    const panel = screen.getByRole("group", { name: "Approval needed: edit_file" });
    expect(panel.textContent).toContain("agent86 wants to run edit_file README.md");
    const rows = panel.querySelectorAll("tr[data-kind]");
    expect([...rows].map((r) => r.getAttribute("data-kind"))).toEqual(["hunk", "del", "add"]);
    expect(rows[1]?.textContent).toContain("Teh quick brown fox");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toContain("1Allow once");
    expect(screen.getByTestId("tool-card").getAttribute("data-state")).toBe("awaiting");
  });

  it("focuses the panel, not a button, so Enter approves nothing", () => {
    const session = renderCard(entry(), [request()]);
    const panel = screen.getByRole("group");
    expect(document.activeElement).toBe(panel);
    fireEvent.keyDown(panel, { key: "Enter" });
    expect(session.respond).not.toHaveBeenCalled();
  });

  it("answers with number keys and the buttons, and rejects on Esc", () => {
    const session = renderCard(entry(), [request()]);
    const panel = screen.getByRole("group");
    fireEvent.keyDown(panel, { key: "2" });
    expect(session.respond).toHaveBeenLastCalledWith(9, "reject-once");
    fireEvent.click(screen.getByRole("button", { name: /Allow once/ }));
    expect(session.respond).toHaveBeenLastCalledWith(9, "allow-once");
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(session.reject).toHaveBeenCalledWith(9);
    fireEvent.keyDown(panel, { key: "7" });
    expect(session.respond).toHaveBeenCalledTimes(2);
  });

  it("shows agent86's warning above the detail", () => {
    renderCard(entry({ name: "write_file" }), [
      request(
        "Warning: This writes agent86's own configuration.\n\nnew file: .agent86/x (1 lines)\nhi\n",
      ),
    ]);
    expect(screen.getByRole("note").textContent).toContain("agent86's own configuration");
    expect(screen.getByText("new file: .agent86/x (1 line)")).toBeTruthy();
  });

  it("shows a command for run_command", () => {
    renderCard(entry({ name: "run_command", rawInput: { command: "echo hi" } }), [
      request("echo hi"),
    ]);
    expect(screen.getByText("command")).toBeTruthy();
    expect(screen.getByRole("group").textContent).toContain("echo hi");
  });
});

describe("ToolCard after the call", () => {
  it("shows a declined call as declined, not failed", () => {
    renderCard(
      entry({
        status: "failed",
        decision: "rejected",
        output: "Not executed: declined by user.",
        preview: DIFF,
      }),
    );
    expect(screen.getByTestId("tool-card").getAttribute("data-state")).toBe("declined");
    expect(screen.getByText("declined")).toBeTruthy();
  });

  it("shows a real failure as failed", () => {
    renderCard(entry({ status: "failed", output: "Error: old_string not found" }));
    expect(screen.getByTestId("tool-card").getAttribute("data-state")).toBe("failed");
    expect(screen.getByText("⎿ Error: old_string not found")).toBeTruthy();
  });

  it("expands to the arguments, the approved change, and the result with its diff", async () => {
    renderCard(
      entry({
        status: "completed",
        decision: "allowed",
        preview: DIFF,
        output: `Edited README.md (1 replacement).\n${DIFF}`,
      }),
    );
    expect(screen.getByText("⎿ Edited README.md (1 replacement).")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("Arguments")).toBeTruthy();
    // The result carries the diff, so the approved change is not repeated.
    expect(screen.queryByText("Approved change")).toBeNull();
    expect(screen.getByText("Result")).toBeTruthy();
    expect(screen.getAllByTestId("diff")).toHaveLength(1);
    // Highlighting loads lazily, then the JSON arguments are coloured.
    await waitFor(() => expect(document.querySelector(".hljs-attr")).not.toBeNull());
  });

  it("shows a declined change when there is no result diff", () => {
    renderCard(
      entry({
        status: "failed",
        decision: "rejected",
        output: "Not executed: declined by user.",
        preview: DIFF,
      }),
      [],
      true,
    );
    expect(screen.getByText("Declined change")).toBeTruthy();
    expect(screen.getAllByTestId("diff")).toHaveLength(1);
  });

  it("opens every card when expand-all is on", () => {
    renderCard(entry({ status: "completed", output: "ok" }), [], true);
    expect(screen.getByText("Arguments")).toBeTruthy();
  });
});
