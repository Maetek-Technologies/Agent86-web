// ACP messages agent86 1.0.19 and 1.0.20 send that the recorded run (agent86-1.0.20.ts) did not
// produce: written from agent86's docs/ACP.md and ACP's schema/v1/schema.json.

export const DOCUMENTED = {
  /** `usage_update` for a model agent86 has no price for: `cost` is left out (unknown, not zero). */
  usageUnpriced: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: { sessionUpdate: "usage_update", used: 53000, size: 200000 },
    },
  },
  /** The schema allows `cost: null` too. */
  usageNullCost: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: { sessionUpdate: "usage_update", used: 61000, size: 200000, cost: null },
    },
  },
  usageEuro: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "usage_update",
        used: 53000,
        size: 200000,
        cost: { amount: 0.045, currency: "EUR" },
      },
    },
  },
  compactionCompleted: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "compaction_update",
        compactionId: "cmp-1",
        status: "completed",
        summary: [{ type: "text", text: "The user fixed a typo in README.md." }],
      },
    },
  },
  compactionFailed: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "compaction_update",
        compactionId: "cmp-2",
        status: "failed",
        error: "the summary request failed: HTTP 500",
      },
    },
  },
  /** The schema's streamed form, which agent86 does not send today. */
  compactionInProgress: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: { sessionUpdate: "compaction_update", compactionId: "cmp-3", status: "in_progress" },
    },
  },
  compactionChunk: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "compaction_summary_chunk",
        compactionId: "cmp-3",
        content: { type: "text", text: "Streamed summary." },
      },
    },
  },
  route: {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: { kind: "route", ts: 1763258000.1, model: "openrouter:qwen/qwen3-coder" },
    },
  },
  /** A model call agent86 has no price for: `priced: false`, so `cost_usd` means nothing. */
  modelCallUnpriced: {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        kind: "model_call",
        ts: 1763258001.2,
        step: 1,
        model: "openrouter:unknown/model",
        input_tokens: 900,
        output_tokens: 40,
        cost_usd: 0,
        stop_reason: "end_turn",
        tool_calls: [],
        priced: false,
        turn_cost_usd: 0,
        cost_cap_usd: null,
      },
    },
  },
  /** A guardrail event with findings as a list (1.0.20 sends a comma-separated string). */
  guardrailList: {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        kind: "guardrail",
        ts: 1763258002.3,
        stage: "egress",
        findings: [{ kind: "secret:aws-key" }, "pii:email"],
      },
    },
  },
  /** A diff item over 256 KiB is not sent: only the text item comes. */
  bigEditPermissionContent: [
    {
      type: "content",
      content: {
        type: "text",
        text: "--- a/big.txt\n+++ b/big.txt\n@@ -1 +1 @@\n-old\n+new",
      },
    },
  ],
  sessionListMarkedNew: {
    sessionId: "s-new",
    cwd: "/where/agent86/started",
    title: "unknown folder, 1.0.20",
    _meta: { agent86: { cwdKnown: false }, "com.maetek.agent86/cwdKnown": false },
  },
  sessionListMarkedOld: {
    sessionId: "s-old",
    cwd: "/where/agent86/started",
    title: "unknown folder, before 1.0.20",
    _meta: { agent86: { cwdKnown: false } },
  },
  sessionListKnown: {
    sessionId: "s-known",
    cwd: "/work",
    title: "known folder",
  },
} as const;

/**
 * agent86 1.0.22 and 1.0.23 shapes the recorded run (agent86-1.0.23.ts) did not produce, written
 * from agent86's docs/ACP.md ("agent86's memory" and "agent86's secrets"). The recording ran with
 * AGENT86_ACP_SECRETS=off, so a keyring, a remembered secret, and a keyring warning are here.
 */
export const DOCUMENTED_1023 = {
  /** An advertisement in a version this client does not read: neither feature is used. */
  futureVersions: {
    loadSession: true,
    _meta: {
      "com.maetek.agent86/memory": { version: 2 },
      "com.maetek.agent86/secrets": { version: 2 },
    },
  },
  /** An episode archiving a compaction, pinned, from another session, with a field from later. */
  compactionEpisode: {
    kind: "episode",
    id: 7,
    text: "refactor the parser",
    storedAt: "2026-11-16T10:00:00Z",
    pinned: true,
    pinnedAt: "2026-11-16T11:00:00Z",
    category: "compaction",
    outcome: "Summary: moved the tokenizer into its own module.",
    sessionId: "s-older",
    score: 0.93,
  },
  /** `[memory] enabled = false`. */
  memoryOff: { error: { code: -32600, message: "Memory is off for this session" } },
  /** A keyring is there, and one secret is remembered for the project. */
  secretListWithKeyring: {
    secrets: [
      { name: "STRIPE_KEY", remembered: true },
      { name: "GITHUB_TOKEN", remembered: false },
    ],
    canRemember: true,
  },
  secretSetRemembered: { name: "STRIPE_KEY", remembered: true },
  secretForgetWarning: {
    forgotten: true,
    warning: "the keyring refused to delete it; remove it with your OS's credential manager",
  },
  /** The doc's example, with a value already remembered under the name. */
  secretRequestRemembered: {
    jsonrpc: "2.0",
    id: 4,
    method: "_com.maetek.agent86/secret/request",
    params: {
      sessionId: "s1",
      name: "STRIPE_KEY",
      reason: "to create the webhook",
      replacing: true,
      canRemember: true,
      remembered: true,
      hint: "a field from a later version",
    },
  },
  /** A limit question (the terminal's; listed by the doc among the kinds). */
  questionsLimit: {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        kind: "questions",
        ts: 1794875700,
        asking: { kind: "limit", subject: "max_steps" },
        waiting: [{ kind: "secret" }],
      },
    },
  },
} as const;
