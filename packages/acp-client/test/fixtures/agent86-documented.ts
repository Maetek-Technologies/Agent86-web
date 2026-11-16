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
