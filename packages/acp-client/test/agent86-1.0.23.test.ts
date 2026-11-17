// agent86 1.0.22 and 1.0.23's ACP additions, from messages recorded against the real agent86
// 1.0.23: its memory (list, pin, forget), secrets from the client (set, list, forget), and the
// model's `secret/request`, which this client answers from a masked entry, declining on anything
// but a typed value; and their absence.
import type { AnyMessage } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  advertisesMemory,
  advertisesSecrets,
  Agent86Client,
  Agent86RequestError,
  CLIENT_CAPABILITIES,
  inboxItems,
  parseEvent,
  parseMemoryEntry,
  parseMemoryPage,
  parseSecretRequest,
  phase,
  secretProblem,
  type AgentSession,
} from "../src/index.ts";
import { RECORDED_1021 } from "./fixtures/agent86-1.0.21.ts";
import { RECORDED_1023 } from "./fixtures/agent86-1.0.23.ts";
import { DOCUMENTED_1023 } from "./fixtures/agent86-documented.ts";
import { streamPair } from "./pair.ts";

type Message = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
};

const INIT = RECORDED_1023.initialize;
const INIT_1021 = RECORDED_1021.initialize;
/** Typed into the masked entry in these tests. */
const TYPED = "sk_typed_in_the_test_93ad";

/**
 * A scripted agent86: answers `initialize` and `session/new`, answers each method in `answers`
 * (a reply object, or a function of the request), and otherwise writes what the test sends.
 */
function scriptedAgent(
  initResult: unknown,
  answers: Record<string, unknown | ((m: Message) => unknown)> = {},
) {
  const pair = streamPair();
  const writer = pair.agent.writable.getWriter();
  const received: Message[] = [];
  const send = (message: unknown) => writer.write(message as AnyMessage);
  void (async () => {
    const reader = pair.agent.readable.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      const m = value as Message;
      received.push(m);
      if (m.method === "initialize") await send({ jsonrpc: "2.0", id: m.id, result: initResult });
      else if (m.method === "session/new")
        await send({ jsonrpc: "2.0", id: m.id, result: { sessionId: "s1", configOptions: [] } });
      else if (m.method && m.method in answers) {
        const entry = answers[m.method];
        const reply = (typeof entry === "function" ? entry(m) : entry) as Record<string, unknown>;
        await send({ ...reply, jsonrpc: "2.0", id: m.id });
      }
    }
  })();
  return {
    stream: pair.client,
    send,
    received,
    sent: (method: string) => received.filter((m) => m.method === method),
    /** The client's reply to agent86's request `id`. */
    replyTo: (id: number | string) =>
      received.find(
        (m) => m.method === undefined && m.id === id && ("result" in m || "error" in m),
      ),
    end: () => writer.close(),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function setup(init: unknown = INIT, answers = {}) {
  const agent = scriptedAgent(init, answers);
  const client = await Agent86Client.connect(agent.stream);
  const session = await client.newSession("/work");
  return { agent, client, session };
}

/** Start a turn whose prompt agent86 has not answered yet. */
async function startedTurn(agent: ReturnType<typeof scriptedAgent>, session: AgentSession) {
  const done = session.prompt("ask for a secret");
  await settle();
  const prompt = agent.sent("session/prompt").at(-1)!;
  return {
    done,
    answer: (stopReason: string) =>
      agent.send({ jsonrpc: "2.0", id: prompt.id, result: { stopReason } }),
  };
}

/** agent86's messages of a recorded turn, without its prompt's own answer. */
const agentSide = (turn: readonly { dir: string }[]) =>
  turn
    .filter((m) => m.dir === "A>")
    .map(({ dir: _dir, ...m }) => m as Message)
    .filter((m) => !("result" in m && (m.result as { stopReason?: string }).stopReason));

async function play(agent: ReturnType<typeof scriptedAgent>, messages: readonly Message[]) {
  for (const message of messages) await agent.send(message);
  await settle();
}

describe("detecting agent86 1.0.22 and 1.0.23", () => {
  it("reads both advertisements, and neither in another version or from 1.0.21", () => {
    expect(advertisesMemory(INIT.agentCapabilities)).toBe(true);
    expect(advertisesSecrets(INIT.agentCapabilities)).toBe(true);
    expect(advertisesMemory(INIT_1021.agentCapabilities)).toBe(false);
    expect(advertisesSecrets(INIT_1021.agentCapabilities)).toBe(false);
    expect(advertisesMemory(DOCUMENTED_1023.futureVersions)).toBe(false);
    expect(advertisesSecrets(DOCUMENTED_1023.futureVersions)).toBe(false);
    expect(advertisesMemory({ _meta: { "com.maetek.agent86/memory": true } })).toBe(false);
    expect(advertisesSecrets(undefined)).toBe(false);
  });

  it("reports every feature from 1.0.23, and claims the masked entry in initialize", async () => {
    const { agent, client } = await setup();
    expect(client.features).toEqual({ state: true, resume: true, memory: true, secrets: true });
    expect(CLIENT_CAPABILITIES._meta).toEqual({
      "com.maetek.agent86/state": true,
      "com.maetek.agent86/secrets": true,
    });
    expect(agent.sent("initialize")[0]!.params!.clientCapabilities).toMatchObject({
      _meta: { "com.maetek.agent86/secrets": true },
    });
    client.close();
  });
});

describe("memory (agent86 1.0.22)", () => {
  const m = RECORDED_1023.memory;

  it("parses the recorded entries: facts, episodes, paging, and pins", () => {
    expect(parseMemoryPage(m.firstPage.reply.result)).toEqual({
      entries: [
        {
          kind: "fact",
          id: 2,
          text: "tests run with vitest",
          storedAt: "2026-11-17T00:34:01Z",
          pinned: false,
          category: "fact",
        },
      ],
      nextCursor: "1",
    });
    expect(parseMemoryPage(m.secondPage.reply.result).nextCursor).toBeUndefined();
    const episodes = parseMemoryPage(m.episodes.reply.result).entries;
    expect(episodes.map((e) => [e.kind, e.id, e.sessionId, e.outcome])).toEqual([
      ["episode", 2, "s1", "Tool result: Remembered."],
      ["episode", 1, "s1", "Tool result: Remembered."],
    ]);
    expect(parseMemoryEntry(m.pin.reply.result.entry)).toMatchObject({
      pinned: true,
      pinnedAt: "2026-11-17T00:34:01Z",
    });
    expect(parseMemoryEntry(m.unpin.reply.result.entry)).not.toHaveProperty("pinnedAt");
  });

  it("ignores unknown fields and skips an entry without kind, id, or text", () => {
    expect(parseMemoryEntry(DOCUMENTED_1023.compactionEpisode)).toEqual({
      kind: "episode",
      id: 7,
      text: "refactor the parser",
      storedAt: "2026-11-16T10:00:00Z",
      pinned: true,
      pinnedAt: "2026-11-16T11:00:00Z",
      category: "compaction",
      outcome: "Summary: moved the tokenizer into its own module.",
      sessionId: "s-older",
    });
    expect(
      parseMemoryPage({
        entries: [{ kind: "note", id: 1, text: "x" }, { kind: "fact", text: "x" }, "x"],
        nextCursor: 5,
      }),
    ).toEqual({ entries: [] });
  });

  it("sends list, pin, and forget with the session id, as recorded", async () => {
    const { agent, session } = await setup(INIT, {
      "_com.maetek.agent86/memory/list": m.firstPage.reply,
      "_com.maetek.agent86/memory/pin": m.pin.reply,
      "_com.maetek.agent86/memory/forget": m.forget.reply,
    });
    const page = await session.listMemory({ limit: 1 });
    expect(page.nextCursor).toBe("1");
    await session.listMemory({ kind: "episode", cursor: "1", pinned: true });
    expect(agent.sent("_com.maetek.agent86/memory/list").map((x) => x.params)).toEqual([
      { sessionId: "s1", kind: "fact", limit: 1 },
      { sessionId: "s1", kind: "episode", cursor: "1", pinned: true },
    ]);
    expect((await session.pinMemory("fact", 2)).pinned).toBe(true);
    await session.pinMemory("episode", 2, false);
    expect(agent.sent("_com.maetek.agent86/memory/pin").map((x) => x.params)).toEqual([
      { sessionId: "s1", kind: "fact", id: 2, pinned: true },
      { sessionId: "s1", kind: "episode", id: 2, pinned: false },
    ]);
    await session.forgetMemory("fact", 2);
    expect(agent.sent("_com.maetek.agent86/memory/forget")[0]!.params).toEqual({
      sessionId: "s1",
      kind: "fact",
      id: 2,
    });
  });

  it.each([
    ["an unknown id", m.forgetAgain.reply, -32002],
    ["bad params", m.badLimit.reply, -32602],
    ["memory off", DOCUMENTED_1023.memoryOff, -32600],
    ["a turn running", m.duringTurn, -32600],
  ])("reports agent86's refusal for %s with its code", async (_label, reply, code) => {
    const { session } = await setup(INIT, { "_com.maetek.agent86/memory/forget": reply });
    const error = await session.forgetMemory("fact", 2).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Agent86RequestError);
    expect((error as Agent86RequestError).code).toBe(code);
    expect((error as Error).message).toBe((reply.error as { message: string }).message);
  });

  it("asks nothing while a turn runs, nor of an agent86 that does not offer it", async () => {
    const { agent, session } = await setup();
    const turn = await startedTurn(agent, session);
    await expect(session.listMemory()).rejects.toMatchObject({ code: -32600 });
    await turn.answer("end_turn");
    await turn.done;
    const old = await setup(INIT_1021);
    await expect(old.session.listMemory()).rejects.toThrow(/does not offer its memory/);
    await expect(old.session.listSecrets()).rejects.toThrow(/does not offer its secrets/);
    expect(agent.sent("_com.maetek.agent86/memory/list")).toEqual([]);
    expect(old.agent.sent("_com.maetek.agent86/memory/list")).toEqual([]);
  });
});

describe("secrets from the client (agent86 1.0.23)", () => {
  const s = RECORDED_1023.secrets;

  it("lists names, sets, and forgets, reading warnings and the keyring flag", async () => {
    const { agent, session } = await setup(INIT, {
      "_com.maetek.agent86/secret/list": { result: DOCUMENTED_1023.secretListWithKeyring },
      "_com.maetek.agent86/secret/set": s.rememberWithoutKeyring.reply,
      "_com.maetek.agent86/secret/forget": { result: DOCUMENTED_1023.secretForgetWarning },
    });
    expect(await session.listSecrets()).toEqual(DOCUMENTED_1023.secretListWithKeyring);
    expect(await session.setSecret("API_TOKEN", TYPED, true)).toEqual({
      name: "API_TOKEN",
      remembered: false,
      warning: "no keyring is available to remember it, so it is set for this session only",
    });
    expect(agent.sent("_com.maetek.agent86/secret/set")[0]!.params).toEqual({
      sessionId: "s1",
      name: "API_TOKEN",
      value: TYPED,
      remember: true,
    });
    expect(await session.forgetSecret("STRIPE_KEY")).toEqual(DOCUMENTED_1023.secretForgetWarning);
    // Nothing of it is kept in the session's state.
    expect(JSON.stringify(session.getState())).not.toContain(TYPED);
  });

  it("parses the recorded replies, and passes on a refusal, which never holds the value", async () => {
    const { session } = await setup(INIT, {
      "_com.maetek.agent86/secret/list": s.list,
      "_com.maetek.agent86/secret/set": s.tooShort.reply,
    });
    expect(await session.listSecrets()).toEqual({
      secrets: [
        { name: "STRIPE_KEY", remembered: false },
        { name: "API_TOKEN", remembered: false },
      ],
      canRemember: false,
    });
    const error = await session.setSecret("STRIPE_KEY", "short").catch((e: unknown) => e);
    expect(error).toMatchObject({ code: -32602 });
    expect((error as Error).message).not.toContain('short"');
  });

  it("checks a name and a value the way agent86 does", () => {
    expect(secretProblem("STRIPE_KEY", "sk_123456")).toBeUndefined();
    expect(secretProblem("_x9", "123456")).toBeUndefined();
    expect(secretProblem("1BAD", "sk_123456")).toMatch(/digit/);
    expect(secretProblem("BAD-NAME", "sk_123456")).toMatch(/letters/);
    expect(secretProblem("OK", "12345")).toMatch(/at least 6/);
  });
});

describe("the model asks for a secret (secret/request, agent86 1.0.23)", () => {
  const entered = agentSide(RECORDED_1023.enteredTurn);
  const ask = entered.find((m) => m.method === "_com.maetek.agent86/secret/request")!;
  const before = entered.slice(0, entered.indexOf(ask));
  const after = entered.slice(entered.indexOf(ask) + 1);

  it("shows the request with its card, in the inbox, and holds no value", async () => {
    const { agent, session } = await setup();
    const turn = await startedTurn(agent, session);
    await play(agent, [...before, ask]);
    const state = session.getState();
    const card = state.entries.find((e) => e.kind === "tool" && e.name === "request_secret");
    expect(state.secrets).toEqual([
      {
        id: expect.any(Number),
        name: "STRIPE_KEY",
        reason: "to create the webhook",
        replacing: true,
        canRemember: false,
        remembered: false,
        toolCallId: card && "toolCallId" in card ? card.toolCallId : "missing",
      },
    ]);
    expect(phase(state)).toBe("Waiting for a secret");
    // The recorded question is only `{kind: "secret"}`; the inbox pairs it with the open request.
    expect(inboxItems(state)).toEqual([
      {
        question: { kind: "secret" },
        position: "asking",
        secret: state.secrets![0],
        hasCard: false,
      },
    ]);

    session.answerSecret(state.secrets![0]!.id, TYPED, false);
    await settle();
    expect(agent.replyTo(ask.id!)!.result).toEqual({
      outcome: "entered",
      value: TYPED,
      remember: false,
    });
    await play(agent, after);
    await turn.answer("end_turn");
    await turn.done;
    const done = session.getState();
    expect(done.secrets).toBeUndefined();
    expect(inboxItems(done)).toEqual([]);
    expect(JSON.stringify(done)).not.toContain(TYPED);
  });

  it("declines when the user declines, and an empty value is a decline", async () => {
    for (const choose of [
      (session: AgentSession, id: number) => session.declineSecret(id),
      (session: AgentSession, id: number) => session.answerSecret(id, "", true),
    ]) {
      const { agent, session } = await setup();
      await startedTurn(agent, session);
      await play(agent, [...before, ask]);
      choose(session, session.getState().secrets![0]!.id);
      await settle();
      expect(agent.replyTo(ask.id!)!.result).toEqual({ outcome: "declined" });
    }
  });

  it("declines on cancel, at the turn's end, and when the connection closes", async () => {
    // Cancel: agent86 declines by itself too (recorded); the client answers declined anyway.
    const a = await setup();
    await startedTurn(a.agent, a.session);
    await play(a.agent, [...before, ask]);
    await a.session.cancel();
    await settle();
    expect(a.agent.replyTo(ask.id!)!.result).toEqual({ outcome: "declined" });
    expect(a.session.getState().secrets).toBeUndefined();

    const b = await setup();
    const turn = await startedTurn(b.agent, b.session);
    await play(b.agent, [...before, ask]);
    await turn.answer("end_turn");
    await turn.done;
    await settle();
    expect(b.agent.replyTo(ask.id!)!.result).toEqual({ outcome: "declined" });

    const c = await setup();
    await startedTurn(c.agent, c.session);
    await play(c.agent, [...before, ask]);
    c.agent.end();
    await settle();
    expect(c.session.getState().secrets).toBeUndefined();
  });

  it("declines one it cannot read, one outside a turn, and any from an agent86 not offering it", async () => {
    expect(parseSecretRequest({ sessionId: "s1", name: "1BAD" })).toBeUndefined();
    expect(parseSecretRequest({ name: "OK" })).toBeUndefined();
    expect(parseSecretRequest(DOCUMENTED_1023.secretRequestRemembered.params)).toEqual({
      sessionId: "s1",
      name: "STRIPE_KEY",
      reason: "to create the webhook",
      replacing: true,
      canRemember: true,
      remembered: true,
    });

    const { agent, session } = await setup();
    await play(agent, [{ ...ask, id: 900 }]);
    expect(agent.replyTo(900)!.result).toEqual({ outcome: "declined" });
    await startedTurn(agent, session);
    await play(agent, [
      { ...ask, id: 901, params: { ...ask.params, name: "NOT-A-NAME" } },
      { ...ask, id: 902, params: { ...ask.params, sessionId: "other" } },
    ]);
    expect(agent.replyTo(901)!.result).toEqual({ outcome: "declined" });
    expect(agent.replyTo(902)!.result).toEqual({ outcome: "declined" });
    expect(session.getState().secrets).toBeUndefined();

    const old = await setup(INIT_1021);
    await startedTurn(old.agent, old.session);
    await play(old.agent, [{ ...ask, id: 903 }]);
    expect(old.agent.replyTo(903)!.result).toEqual({ outcome: "declined" });
  });

  it("starts the remember choice from what agent86 says", async () => {
    const { agent, session } = await setup();
    await startedTurn(agent, session);
    await play(agent, [DOCUMENTED_1023.secretRequestRemembered as unknown as Message]);
    expect(session.getState().secrets?.[0]).toMatchObject({
      canRemember: true,
      remembered: true,
      replacing: true,
    });
  });
});

describe("questions of every kind (agent86 1.0.23)", () => {
  it("reads secret and limit questions", () => {
    const secret = RECORDED_1023.enteredTurn.find(
      (m) =>
        "method" in m &&
        m.method === "_com.maetek.agent86/session/event" &&
        (m.params as { event: { kind: string } }).event.kind === "questions",
    ) as { params: { event: unknown } };
    expect(parseEvent(secret.params.event)).toMatchObject({
      kind: "questions",
      asking: { kind: "secret" },
      waiting: [],
    });
    expect(parseEvent(DOCUMENTED_1023.questionsLimit.params.event)).toMatchObject({
      asking: { kind: "limit", subject: "max_steps" },
      waiting: [{ kind: "secret" }],
    });
  });

  it("still reads who asks on 1.0.23's sub-agent approvals", async () => {
    const { agent, session } = await setup();
    const done = session.prompt("parallel writers");
    await settle();
    const firstAsk = RECORDED_1023.parallelTurn.find(
      (m) => "method" in m && m.method === "session/request_permission",
    )!;
    const upTo = RECORDED_1023.parallelTurn.slice(
      0,
      RECORDED_1023.parallelTurn.indexOf(firstAsk) + 1,
    );
    await play(
      agent,
      upTo.map(({ dir: _dir, ...m }) => m as Message),
    );
    const request = session.getState().permissions[0]!;
    expect(request.asker).toMatchObject({ agent: "writer", depth: 1, costCapUsd: 0.5 });
    expect(inboxItems(session.getState())[0]).toMatchObject({
      position: "asking",
      question: { kind: "approval", agent: "writer" },
    });
    void done;
  });

  it("resumes without a replay, and a resumed session holds no session-only secret", () => {
    expect(RECORDED_1023.resume.reply.result).toHaveProperty("configOptions");
    expect(RECORDED_1023.secrets.afterResume.result).toEqual({ secrets: [], canRemember: false });
  });
});

describe("without the masked-entry claim (recorded)", () => {
  it("is offered no request_secret, and /secret points to the terminal", () => {
    const failed = RECORDED_1023.withoutClaim.askTurn.find(
      (m) =>
        "params" in m &&
        (m.params as { update?: { sessionUpdate?: string } }).update?.sessionUpdate ===
          "tool_call_update",
    );
    expect(JSON.stringify(failed)).toContain("Unknown tool 'request_secret'");
    expect(JSON.stringify(RECORDED_1023.withoutClaim.slashSecretTurn)).toContain(
      "Enter it at a terminal",
    );
    expect(JSON.stringify(RECORDED_1023.slashSecretTurn)).toContain(
      "this client's own secret entry",
    );
  });
});
