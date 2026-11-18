// @vitest-environment jsdom
// What the thread shows for agent86 1.0.22 and 1.0.23: the memory panel, the secrets panel, the
// masked prompt for the model's `secret/request`, a secret question in the approval inbox, and a
// value typed after /secret kept out of the thread; and that a typed value is never rendered,
// stored, or logged.
import {
  Agent86RequestError,
  type AgentSession,
  type InboxItem,
  type MemoryEntry,
  type MemoryPage,
  type MemoryQuery,
  type PendingSecret,
  type SecretList,
} from "@agent86-web/acp-client";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryPanel } from "../src/memory/MemoryPanel.tsx";
import { SecretPrompt } from "../src/secrets/SecretPrompt.tsx";
import { SecretsPanel } from "../src/secrets/SecretsPanel.tsx";
import { Inbox } from "../src/thread/Inbox.tsx";
import { PromptInput, typedSecret } from "../src/thread/PromptInput.tsx";

afterEach(cleanup);

const TYPED = "sk_typed_in_a_unit_test_5521";

const REQUEST: PendingSecret = {
  id: 3,
  name: "STRIPE_KEY",
  reason: "to create the webhook",
  replacing: false,
  canRemember: true,
  remembered: false,
  toolCallId: "call_9",
};

/** Everything a value could leak into from the page: the DOM, storage, and the console. */
function leaked(spies: ReturnType<typeof vi.spyOn>[]): string {
  const calls = spies.flatMap((spy) => spy.mock.calls.map((c: unknown[]) => JSON.stringify(c)));
  return [
    document.body.outerHTML,
    JSON.stringify({ ...localStorage }),
    JSON.stringify({ ...sessionStorage }),
    window.location.href,
    ...calls,
  ].join("\n");
}

function consoleSpies() {
  return (["log", "info", "warn", "error", "debug"] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => undefined),
  );
}

describe("the secret prompt (secret/request)", () => {
  it("shows the name, the reason, and the remember choice, and sends what is typed once", () => {
    const spies = consoleSpies();
    const onEnter = vi.fn();
    const onDecline = vi.fn();
    render(<SecretPrompt request={REQUEST} onEnter={onEnter} onDecline={onDecline} />);
    const dialog = screen.getByRole("dialog", { name: "Agent 86 asks for the secret STRIPE_KEY" });
    expect(within(dialog).getByTestId("secret-prompt-reason").textContent).toMatch(
      "to create the webhook",
    );
    const input = within(dialog).getByLabelText("Value for STRIPE_KEY") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.name).toBe("");
    expect(input.getAttribute("autocomplete")).toBe("new-password");
    expect(document.activeElement).toBe(input);
    const remember = within(dialog).getByRole("checkbox") as HTMLInputElement;
    expect(remember.checked).toBe(false);
    fireEvent.click(remember);

    fireEvent.input(input, { target: { value: TYPED } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enter" }));
    expect(onEnter).toHaveBeenCalledWith(TYPED, true);
    expect(onDecline).not.toHaveBeenCalled();
    // Cleared at once; not in the DOM, storage, the address, or the console.
    expect(input.value).toBe("");
    expect(leaked(spies)).not.toContain(TYPED);
    for (const spy of spies) spy.mockRestore();
  });

  it("starts remember on when it is remembered, notes a replacement, and hides remember with no keyring", () => {
    const { unmount } = render(
      <SecretPrompt
        request={{ ...REQUEST, remembered: true, replacing: true }}
        onEnter={vi.fn()}
        onDecline={vi.fn()}
      />,
    );
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("note").textContent).toMatch("what you enter replaces it");
    unmount();
    render(
      <SecretPrompt
        request={{ ...REQUEST, canRemember: false }}
        onEnter={vi.fn()}
        onDecline={vi.fn()}
      />,
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("dialog").textContent).toMatch("held for this session only");
  });

  it("never remembers when agent86 cannot, whatever the checkbox said", () => {
    const onEnter = vi.fn();
    render(
      <SecretPrompt
        request={{ ...REQUEST, canRemember: false, remembered: true }}
        onEnter={onEnter}
        onDecline={vi.fn()}
      />,
    );
    fireEvent.input(screen.getByLabelText("Value for STRIPE_KEY"), { target: { value: TYPED } });
    fireEvent.submit(screen.getByRole("dialog"));
    expect(onEnter).toHaveBeenCalledWith(TYPED, false);
  });

  it.each([
    [
      "Decline",
      (dialog: HTMLElement) =>
        fireEvent.click(within(dialog).getByRole("button", { name: "Decline" })),
    ],
    [
      "the close button",
      (dialog: HTMLElement) =>
        fireEvent.click(within(dialog).getByRole("button", { name: "Close and decline" })),
    ],
    ["Esc", (dialog: HTMLElement) => fireEvent.keyDown(dialog, { key: "Escape" })],
  ])("declines with %s, clearing anything typed", (_label, act) => {
    const onEnter = vi.fn();
    const onDecline = vi.fn();
    render(<SecretPrompt request={REQUEST} onEnter={onEnter} onDecline={onDecline} />);
    const input = screen.getByLabelText("Value for STRIPE_KEY") as HTMLInputElement;
    fireEvent.input(input, { target: { value: TYPED } });
    act(screen.getByRole("dialog"));
    expect(onDecline).toHaveBeenCalledOnce();
    expect(onEnter).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("asks for a value rather than sending an empty one", () => {
    const onEnter = vi.fn();
    render(<SecretPrompt request={REQUEST} onEnter={onEnter} onDecline={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter" }));
    expect(onEnter).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch("Type a value, or decline.");
  });
});

describe("a secret question in the approval inbox", () => {
  it("names the secret once its request has arrived, and links to the prompt and the card", () => {
    const items: InboxItem[] = [
      { question: { kind: "secret" }, position: "asking", secret: REQUEST, hasCard: false },
      { question: { kind: "limit", subject: "max_steps" }, position: "waiting", hasCard: false },
    ];
    render(<Inbox items={items} />);
    const [secret, limit] = screen.getAllByTestId("inbox-item");
    expect(within(secret!).getByTestId("inbox-subject").textContent).toMatch(
      "a secret: STRIPE_KEY",
    );
    expect(within(secret!).getByRole("button", { name: "enter it" })).toBeTruthy();
    expect(within(secret!).getByRole("button", { name: "its card" })).toBeTruthy();
    expect(within(limit!).getByTestId("inbox-subject").textContent).toMatch(
      "raise the limit max_steps",
    );
  });

  it("says the request is on its way before it arrives", () => {
    render(
      <Inbox items={[{ question: { kind: "secret" }, position: "asking", hasCard: false }]} />,
    );
    expect(screen.getByTestId("inbox-subject").textContent).toMatch(/^a secret$/);
    expect(screen.getByText("the request is on its way…")).toBeTruthy();
  });
});

describe("a value typed after /secret in the message box", () => {
  it("recognizes /secret with something after it, but not /secret alone or forget", () => {
    expect(typedSecret("/secret sk_live_123456")).toBe(true);
    expect(typedSecret("/secret STRIPE_KEY")).toBe(true);
    expect(typedSecret("/secret")).toBe(false);
    expect(typedSecret("/secret forget STRIPE_KEY")).toBe(false);
    expect(typedSecret("/secrets are fun")).toBe(false);
    expect(typedSecret("tell me a /secret x")).toBe(false);
  });

  it("is neither sent nor kept in the history when agent86 takes secrets from this client", () => {
    localStorage.clear();
    const onSend = vi.fn();
    const onSecretTyped = vi.fn();
    render(
      <PromptInput
        workspace="/work"
        busy={false}
        disabled={false}
        onSend={onSend}
        onSecretTyped={onSecretTyped}
      />,
    );
    const box = screen.getByRole("textbox", { name: "Message Agent 86" });
    fireEvent.change(box, { target: { value: `/secret ${TYPED}` } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    expect(onSecretTyped).toHaveBeenCalledOnce();
    expect((box as HTMLTextAreaElement).value).toBe("");
    expect(JSON.stringify({ ...localStorage })).not.toContain(TYPED);

    fireEvent.change(box, { target: { value: "/secret forget STRIPE_KEY" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("/secret forget STRIPE_KEY", []);
  });

  it("goes to agent86 as before when it does not (an older agent86 answers it itself)", () => {
    const onSend = vi.fn();
    render(<PromptInput workspace="/work" busy={false} disabled={false} onSend={onSend} />);
    const box = screen.getByRole("textbox", { name: "Message Agent 86" });
    fireEvent.change(box, { target: { value: "/secret abcdefgh" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("/secret abcdefgh", []);
  });
});

/** A session with just the extension methods, backed by arrays. */
function fakeSession(
  options: { facts?: number; secrets?: SecretList; canRemember?: boolean } = {},
) {
  const entries: MemoryEntry[] = Array.from({ length: options.facts ?? 0 }, (_, i) => ({
    kind: "fact" as const,
    id: i + 1,
    text: `fact number ${i + 1}`,
    storedAt: "2026-11-16T10:00:00Z",
    pinned: false,
  }));
  let secrets: SecretList = options.secrets ?? { secrets: [], canRemember: true };
  const calls: { method: string; args: unknown[] }[] = [];
  const session = {
    listMemory: vi.fn(async (query: MemoryQuery = {}): Promise<MemoryPage> => {
      calls.push({ method: "listMemory", args: [query] });
      const all = entries
        .filter((e) => e.kind === (query.kind ?? "fact") && (!query.pinned || e.pinned))
        .sort((a, b) => b.id - a.id);
      const from = Number(query.cursor ?? 0);
      const limit = query.limit ?? 50;
      const page = all.slice(from, from + limit);
      return from + limit < all.length
        ? { entries: page, nextCursor: String(from + limit) }
        : { entries: page };
    }),
    pinMemory: vi.fn(async (kind: string, id: number, pinned = true) => {
      calls.push({ method: "pinMemory", args: [kind, id, pinned] });
      const entry = entries.find((e) => e.id === id)!;
      entry.pinned = pinned;
      return { ...entry };
    }),
    forgetMemory: vi.fn(async (kind: string, id: number) => {
      calls.push({ method: "forgetMemory", args: [kind, id] });
      entries.splice(
        entries.findIndex((e) => e.id === id),
        1,
      );
    }),
    listSecrets: vi.fn(async () => secrets),
    setSecret: vi.fn(async (name: string, _value: string, remember = false) => {
      secrets = {
        ...secrets,
        secrets: [
          ...secrets.secrets.filter((s) => s.name !== name),
          { name, remembered: remember },
        ],
      };
      return remember && !secrets.canRemember
        ? { name, remembered: false, warning: "no keyring" }
        : { name, remembered: remember };
    }),
    forgetSecret: vi.fn(async (name: string) => {
      secrets = { ...secrets, secrets: secrets.secrets.filter((s) => s.name !== name) };
      return { forgotten: true };
    }),
  };
  return { session: session as unknown as AgentSession, fake: session, calls, entries };
}

describe("the memory panel", () => {
  it("lists facts a page at a time, newest first, and loads more", async () => {
    const { session, fake } = fakeSession({ facts: 25 });
    render(<MemoryPanel session={session} busy={false} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId("memory-item")).toHaveLength(20));
    expect(screen.getAllByTestId("memory-text")[0]!.textContent).toMatch("fact number 25");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByTestId("memory-item")).toHaveLength(25));
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(fake.listMemory).toHaveBeenLastCalledWith({
      kind: "fact",
      limit: 20,
      pinned: false,
      cursor: "20",
    });
  });

  it("pins, filters to pinned, unpins, and forgets only after a confirmation", async () => {
    const { session, fake } = fakeSession({ facts: 3 });
    render(<MemoryPanel session={session} busy={false} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId("memory-item")).toHaveLength(3));
    const first = () => screen.getAllByTestId("memory-item")[0]!;
    fireEvent.click(within(first()).getByRole("button", { name: "pin" }));
    await waitFor(() => expect(within(first()).getByTestId("pinned")).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: "pinned only" }));
    await waitFor(() => expect(screen.getAllByTestId("memory-item")).toHaveLength(1));
    fireEvent.click(within(first()).getByRole("button", { name: "unpin" }));
    await waitFor(() => expect(screen.queryAllByTestId("memory-item")).toHaveLength(0));
    fireEvent.click(screen.getByRole("checkbox", { name: "pinned only" }));
    await waitFor(() => expect(screen.getAllByTestId("memory-item")).toHaveLength(3));

    fireEvent.click(within(first()).getByRole("button", { name: "forget" }));
    const confirm = screen.getByRole("alertdialog", { name: "Forget fact 3?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Keep" }));
    expect(fake.forgetMemory).not.toHaveBeenCalled();
    fireEvent.click(within(first()).getByRole("button", { name: "forget" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Forget" }),
    );
    await waitFor(() => expect(screen.getAllByTestId("memory-item")).toHaveLength(2));
    expect(fake.forgetMemory).toHaveBeenCalledWith("fact", 3);
  });

  it("switches to episodes, and waits while a turn runs", async () => {
    const { session, fake } = fakeSession({ facts: 2 });
    const { rerender } = render(<MemoryPanel session={session} busy={true} onClose={vi.fn()} />);
    expect(screen.getByTestId("memory-busy")).toBeTruthy();
    expect(fake.listMemory).not.toHaveBeenCalled();
    rerender(<MemoryPanel session={session} busy={false} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId("memory-item")).toHaveLength(2));
    for (const button of within(screen.getAllByTestId("memory-item")[0]!).getAllByRole("button"))
      expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: "Episodes" }));
    await waitFor(() => expect(screen.getByText("No episodes.")).toBeTruthy());
    rerender(<MemoryPanel session={session} busy={true} onClose={vi.fn()} />);
    expect((screen.getByRole("tab", { name: "Facts" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows agent86's refusal", async () => {
    const { session, fake } = fakeSession();
    fake.listMemory.mockRejectedValueOnce(new Agent86RequestError("Memory is off", -32600));
    render(<MemoryPanel session={session} busy={false} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch("Memory is off"));
  });
});

describe("the secrets panel", () => {
  it("lists names with a remembered badge, never values", async () => {
    const { session } = fakeSession({
      secrets: {
        secrets: [
          { name: "STRIPE_KEY", remembered: true },
          { name: "GITHUB_TOKEN", remembered: false },
        ],
        canRemember: true,
      },
    });
    render(<SecretsPanel session={session} busy={false} onClose={vi.fn()} />);
    const items = await screen.findAllByTestId("secret-item");
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("STRIPE_KEY"),
      expect.stringContaining("GITHUB_TOKEN"),
    ]);
    expect(within(items[0]!).getByText("remembered")).toBeTruthy();
    expect(within(items[1]!).queryByText("remembered")).toBeNull();
  });

  it("adds a secret through the masked entry, remembering it, and clears the entry", async () => {
    const spies = consoleSpies();
    const { session, fake } = fakeSession();
    render(<SecretsPanel session={session} busy={false} onClose={vi.fn()} />);
    await waitFor(() => expect(fake.listSecrets).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Secret name"), { target: { value: "API_TOKEN" } });
    const value = screen.getByLabelText("Secret value") as HTMLInputElement;
    expect(value.type).toBe("password");
    fireEvent.input(value, { target: { value: TYPED } });
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Set secret" }));
    await screen.findByText("API_TOKEN");
    expect(fake.setSecret).toHaveBeenCalledWith("API_TOKEN", TYPED, true);
    expect(value.value).toBe("");
    expect(leaked(spies)).not.toContain(TYPED);
    for (const spy of spies) spy.mockRestore();
  });

  it("refuses a bad name before touching the value, and a short value", async () => {
    const { session, fake } = fakeSession();
    render(<SecretsPanel session={session} busy={false} onClose={vi.fn()} />);
    await waitFor(() => expect(fake.listSecrets).toHaveBeenCalled());
    const value = screen.getByLabelText("Secret value") as HTMLInputElement;
    fireEvent.change(screen.getByLabelText("Secret name"), { target: { value: "1BAD" } });
    fireEvent.input(value, { target: { value: TYPED } });
    fireEvent.click(screen.getByRole("button", { name: "Set secret" }));
    expect((await screen.findByRole("alert")).textContent).toMatch("digit");
    expect(value.value).toBe(TYPED);
    fireEvent.change(screen.getByLabelText("Secret name"), { target: { value: "OK" } });
    fireEvent.input(value, { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Set secret" }));
    expect((await screen.findByRole("alert")).textContent).toMatch("at least 6");
    expect(fake.setSecret).not.toHaveBeenCalled();
  });

  it("shows agent86's warning, and offers no remember choice without a keyring", async () => {
    const { session } = fakeSession({ secrets: { secrets: [], canRemember: false } });
    render(<SecretsPanel session={session} busy={false} onClose={vi.fn()} />);
    expect(await screen.findByText(/No keyring is available/)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("forgets after a confirmation, and waits while a turn runs", async () => {
    const { session, fake } = fakeSession({
      secrets: { secrets: [{ name: "STRIPE_KEY", remembered: true }], canRemember: true },
    });
    const { rerender } = render(<SecretsPanel session={session} busy={false} onClose={vi.fn()} />);
    const item = await screen.findByTestId("secret-item");
    fireEvent.click(within(item).getByRole("button", { name: "forget" }));
    const confirm = screen.getByRole("alertdialog", { name: "Forget STRIPE_KEY?" });
    expect(confirm.textContent).toMatch("remove from the keyring");
    fireEvent.click(within(confirm).getByRole("button", { name: "Forget" }));
    await waitFor(() => expect(screen.queryAllByTestId("secret-item")).toHaveLength(0));
    expect(fake.forgetSecret).toHaveBeenCalledWith("STRIPE_KEY");

    rerender(<SecretsPanel session={session} busy={true} onClose={vi.fn()} />);
    expect(screen.getByTestId("secrets-busy")).toBeTruthy();
    expect((screen.getByLabelText("Secret value") as HTMLInputElement).disabled).toBe(true);
    await act(async () => undefined);
  });

  it("explains why it opened when a value was typed in the message box", async () => {
    const { session } = fakeSession();
    render(
      <SecretsPanel session={session} busy={false} note="Nothing was sent." onClose={vi.fn()} />,
    );
    expect(screen.getByRole("note").textContent).toMatch("Nothing was sent.");
    await act(async () => undefined);
  });
});
