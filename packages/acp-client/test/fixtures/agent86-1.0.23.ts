// ACP messages recorded from the real agent86 1.0.23 (`agent86 acp` against the scripted model
// server, packages/mock-agent/src/mock-openai.js, with a `writer` user specialist that may only
// write_file, approval mode ask, a $0.50 cap, memory on, and AGENT86_ACP_SECRETS=off so no OS
// keyring was touched), on 2026-11-16. The workspace path is replaced by /work (and Windows
// separators after it by /), the session id by s1, and every value the recording client typed as a
// secret by <hidden>; nothing else is changed. `dir` marks direction where both are kept: C> the
// client, A> agent86.
//
// - memory: "remember that the build uses pnpm" and "remember that tests run with vitest" stored
//   two facts (ids 1, 2) and two episodes; then paging (limit 1), the episode list, pin, the pinned
//   filter, unpin, an episode pin, forget, and the refusals. afterResume is a new process.
// - secrets: set, refusals (no error repeats the value), remember with no keyring (a warning),
//   list, forget. Held for the session only: afterResume (a new process) holds none.
// - enteredTurn, declinedTurn, cancelledTurn: "ask for a secret" (request_secret for STRIPE_KEY),
//   answered entered, declined, and with session/cancel while it waited (agent86 declined by itself
//   and never needed the reply). The secret question has only `kind`: no name, call, or tool.
// - slashSecretTurn: "/secret <value>" typed in the box, answered with no model turn.
// - parallelTurn: two writer sub-agents' approvals queued, with who asks on each request.
// - withoutClaim: a client without clientCapabilities._meta["com.maetek.agent86/secrets"].
export const RECORDED_1023 = {
  initialize: {
    protocolVersion: 1,
    agentCapabilities: {
      loadSession: true,
      sessionCapabilities: {
        list: {},
        resume: {},
      },
      promptCapabilities: {
        image: false,
        audio: false,
        embeddedContext: false,
      },
      mcpCapabilities: {
        http: true,
        sse: true,
      },
      _meta: {
        "com.maetek.agent86/state": {
          version: 1,
        },
        "com.maetek.agent86/memory": {
          version: 1,
        },
        "com.maetek.agent86/secrets": {
          version: 1,
        },
      },
    },
    agentInfo: {
      name: "agent86",
      title: "agent86",
      version: "1.0.23",
    },
    authMethods: [
      {
        id: "terminal-setup",
        name: "Set up a provider and API key",
        description: "Choose a model provider and store its API key in the OS keyring.",
        type: "terminal",
        args: ["auth"],
      },
    ],
  },
  memory: {
    unknownSession: {
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32002,
        message: "Session not found: nope",
      },
    },
    empty: {
      jsonrpc: "2.0",
      id: 4,
      result: {
        entries: [],
      },
    },
    firstPage: {
      request: {
        jsonrpc: "2.0",
        id: 8,
        method: "_com.maetek.agent86/memory/list",
        params: {
          sessionId: "s1",
          limit: 1,
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 8,
        result: {
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
        },
      },
    },
    secondPage: {
      request: {
        jsonrpc: "2.0",
        id: 9,
        method: "_com.maetek.agent86/memory/list",
        params: {
          sessionId: "s1",
          limit: 1,
          cursor: "1",
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 9,
        result: {
          entries: [
            {
              kind: "fact",
              id: 1,
              text: "the build uses pnpm",
              storedAt: "2026-11-17T00:34:01Z",
              pinned: false,
              category: "fact",
            },
          ],
        },
      },
    },
    episodes: {
      request: {
        jsonrpc: "2.0",
        id: 10,
        method: "_com.maetek.agent86/memory/list",
        params: {
          sessionId: "s1",
          kind: "episode",
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 10,
        result: {
          entries: [
            {
              kind: "episode",
              id: 2,
              text: "remember that tests run with vitest",
              storedAt: "2026-11-17T00:34:01Z",
              pinned: false,
              outcome: "Tool result: Remembered.",
              sessionId: "s1",
            },
            {
              kind: "episode",
              id: 1,
              text: "remember that the build uses pnpm",
              storedAt: "2026-11-17T00:34:01Z",
              pinned: false,
              outcome: "Tool result: Remembered.",
              sessionId: "s1",
            },
          ],
        },
      },
    },
    pin: {
      request: {
        jsonrpc: "2.0",
        id: 11,
        method: "_com.maetek.agent86/memory/pin",
        params: {
          sessionId: "s1",
          kind: "fact",
          id: 2,
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 11,
        result: {
          entry: {
            kind: "fact",
            id: 2,
            text: "tests run with vitest",
            storedAt: "2026-11-17T00:34:01Z",
            pinned: true,
            pinnedAt: "2026-11-17T00:34:01Z",
            category: "fact",
          },
        },
      },
    },
    pinnedOnly: {
      request: {
        jsonrpc: "2.0",
        id: 12,
        method: "_com.maetek.agent86/memory/list",
        params: {
          sessionId: "s1",
          pinned: true,
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 12,
        result: {
          entries: [
            {
              kind: "fact",
              id: 2,
              text: "tests run with vitest",
              storedAt: "2026-11-17T00:34:01Z",
              pinned: true,
              pinnedAt: "2026-11-17T00:34:01Z",
              category: "fact",
            },
          ],
        },
      },
    },
    unpin: {
      request: {
        jsonrpc: "2.0",
        id: 13,
        method: "_com.maetek.agent86/memory/pin",
        params: {
          sessionId: "s1",
          kind: "fact",
          id: 2,
          pinned: false,
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 13,
        result: {
          entry: {
            kind: "fact",
            id: 2,
            text: "tests run with vitest",
            storedAt: "2026-11-17T00:34:01Z",
            pinned: false,
            category: "fact",
          },
        },
      },
    },
    pinEpisode: {
      request: {
        jsonrpc: "2.0",
        id: 14,
        method: "_com.maetek.agent86/memory/pin",
        params: {
          sessionId: "s1",
          kind: "episode",
          id: 2,
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 14,
        result: {
          entry: {
            kind: "episode",
            id: 2,
            text: "remember that tests run with vitest",
            storedAt: "2026-11-17T00:34:01Z",
            pinned: true,
            pinnedAt: "2026-11-17T00:34:01Z",
            outcome: "Tool result: Remembered.",
            sessionId: "s1",
          },
        },
      },
    },
    forget: {
      request: {
        jsonrpc: "2.0",
        id: 15,
        method: "_com.maetek.agent86/memory/forget",
        params: {
          sessionId: "s1",
          kind: "fact",
          id: 2,
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 15,
        result: {},
      },
    },
    forgetAgain: {
      request: {
        jsonrpc: "2.0",
        id: 16,
        method: "_com.maetek.agent86/memory/forget",
        params: {
          sessionId: "s1",
          kind: "fact",
          id: 2,
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 16,
        error: {
          code: -32002,
          message: "No fact with id 2",
        },
      },
    },
    badKind: {
      request: {
        jsonrpc: "2.0",
        id: 17,
        method: "_com.maetek.agent86/memory/list",
        params: {
          sessionId: "s1",
          kind: "nonsense",
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 17,
        error: {
          code: -32602,
          message: 'Invalid params: kind must be "fact" or "episode"',
        },
      },
    },
    badLimit: {
      request: {
        jsonrpc: "2.0",
        id: 18,
        method: "_com.maetek.agent86/memory/list",
        params: {
          sessionId: "s1",
          limit: 500,
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 18,
        error: {
          code: -32602,
          message: "Invalid params: limit must be an integer from 1 to 200",
        },
      },
    },
    duringTurn: {
      jsonrpc: "2.0",
      id: 33,
      error: {
        code: -32600,
        message: "A prompt turn is running; wait for its response",
      },
    },
    afterResume: {
      jsonrpc: "2.0",
      id: 38,
      result: {
        entries: [
          {
            kind: "fact",
            id: 1,
            text: "the build uses pnpm",
            storedAt: "2026-11-17T00:34:01Z",
            pinned: false,
            category: "fact",
          },
        ],
      },
    },
  },
  secrets: {
    unknownSession: {
      jsonrpc: "2.0",
      id: 2,
      error: {
        code: -32002,
        message: "Session not found: nope",
      },
    },
    empty: {
      jsonrpc: "2.0",
      id: 5,
      result: {
        secrets: [],
        canRemember: false,
      },
    },
    tooShort: {
      request: {
        jsonrpc: "2.0",
        id: 19,
        method: "_com.maetek.agent86/secret/set",
        params: {
          sessionId: "s1",
          name: "STRIPE_KEY",
          value: "short",
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 19,
        error: {
          code: -32602,
          message:
            "Invalid params: value must have at least 6 characters, or hiding it would rewrite ordinary text wherever those characters appear",
        },
      },
    },
    badName: {
      request: {
        jsonrpc: "2.0",
        id: 20,
        method: "_com.maetek.agent86/secret/set",
        params: {
          sessionId: "s1",
          name: "1BAD",
          value: "<hidden>",
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 20,
        error: {
          code: -32602,
          message: "Invalid params: name must be a string matching ^[A-Za-z_][A-Za-z0-9_]*$",
        },
      },
    },
    set: {
      request: {
        jsonrpc: "2.0",
        id: 21,
        method: "_com.maetek.agent86/secret/set",
        params: {
          sessionId: "s1",
          name: "STRIPE_KEY",
          value: "<hidden>",
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 21,
        result: {
          name: "STRIPE_KEY",
          remembered: false,
        },
      },
    },
    rememberWithoutKeyring: {
      request: {
        jsonrpc: "2.0",
        id: 22,
        method: "_com.maetek.agent86/secret/set",
        params: {
          sessionId: "s1",
          name: "API_TOKEN",
          value: "<hidden>",
          remember: true,
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 22,
        result: {
          name: "API_TOKEN",
          remembered: false,
          warning: "no keyring is available to remember it, so it is set for this session only",
        },
      },
    },
    list: {
      jsonrpc: "2.0",
      id: 23,
      result: {
        secrets: [
          {
            name: "STRIPE_KEY",
            remembered: false,
          },
          {
            name: "API_TOKEN",
            remembered: false,
          },
        ],
        canRemember: false,
      },
    },
    forget: {
      request: {
        jsonrpc: "2.0",
        id: 24,
        method: "_com.maetek.agent86/secret/forget",
        params: {
          sessionId: "s1",
          name: "API_TOKEN",
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 24,
        result: {
          forgotten: true,
        },
      },
    },
    forgetUnknown: {
      request: {
        jsonrpc: "2.0",
        id: 25,
        method: "_com.maetek.agent86/secret/forget",
        params: {
          sessionId: "s1",
          name: "NEVER_SET",
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 25,
        result: {
          forgotten: false,
        },
      },
    },
    duringTurn: {
      jsonrpc: "2.0",
      id: 34,
      error: {
        code: -32600,
        message: "A prompt turn is running; wait for its response",
      },
    },
    afterResume: {
      jsonrpc: "2.0",
      id: 39,
      result: {
        secrets: [],
        canRemember: false,
      },
    },
  },
  enteredTurn: [
    {
      dir: "C>",
      jsonrpc: "2.0",
      id: 27,
      method: "session/prompt",
      params: {
        sessionId: "s1",
        prompt: [
          {
            type: "text",
            text: "ask for a secret",
          },
        ],
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: "I",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " will",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " use",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " request_secret.",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "usage_update",
          used: 12,
          size: 8192,
          cost: {
            amount: 0.00021,
            currency: "USD",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875641.8623753,
          tool_calls: ["request_secret"],
          kind: "model_call",
          step: 1,
          model: "test-model",
          input_tokens: 12,
          output_tokens: 0,
          cost_usd: 0.000036,
          stop_reason: "tool_use",
          priced: true,
          turn_cost_usd: 0.000036,
          cost_cap_usd: 0.5,
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_1794875641861_0",
          title: 'request_secret({"name": "STRIPE_KEY", "reason": "to create the webhook"})',
          name: "request_secret",
          kind: "other",
          status: "pending",
          rawInput: {
            name: "STRIPE_KEY",
            reason: "to create the webhook",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875641.862557,
          kind: "questions",
          asking: {
            kind: "secret",
          },
          waiting: [],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      id: 0,
      method: "_com.maetek.agent86/secret/request",
      params: {
        sessionId: "s1",
        name: "STRIPE_KEY",
        reason: "to create the webhook",
        replacing: true,
        canRemember: false,
        remembered: false,
      },
    },
    {
      dir: "C>",
      jsonrpc: "2.0",
      id: 0,
      result: {
        outcome: "entered",
        value: "<hidden>",
        remember: false,
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875641.8657033,
          kind: "questions",
          asking: null,
          waiting: [],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1794875641861_0",
          status: "completed",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: 'The secret STRIPE_KEY is set. Use it as the environment variable STRIPE_KEY in run_command and python_exec ($STRIPE_KEY in sh, %STRIPE_KEY% in cmd.exe, os.environ["STRIPE_KEY"] in Python), and write ${secret:STRIPE_KEY} in write_file or edit_file to put it in a file. Its value is hidden from you; tool output shows ${secret:STRIPE_KEY} where it would appear.',
              },
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: "The",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " tool",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " finished.",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: 'Tool result: The secret STRIPE_KEY is set. Use it as the environment variable STRIPE_KEY in run_command and python_exec ($STRIPE_KEY in sh, %STRIPE_KEY% in cmd.exe, os.environ["STRIPE_KEY"] in Python), and write ${secret:STRIPE_KEY} in write_file or edit_file to put it in a file. Its value is hidden from you; to',
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "usage_update",
          used: 12,
          size: 8192,
          cost: {
            amount: 0.000261,
            currency: "USD",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875641.9239697,
          tool_calls: [],
          kind: "model_call",
          step: 2,
          model: "test-model",
          input_tokens: 12,
          output_tokens: 1,
          cost_usd: 0.000051,
          stop_reason: "end_turn",
          priced: true,
          turn_cost_usd: 0.000087,
          cost_cap_usd: 0.5,
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      id: 27,
      result: {
        stopReason: "end_turn",
      },
    },
  ],
  declinedTurn: [
    {
      dir: "C>",
      jsonrpc: "2.0",
      id: 28,
      method: "session/prompt",
      params: {
        sessionId: "s1",
        prompt: [
          {
            type: "text",
            text: "ask for a secret",
          },
        ],
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: "I",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " will",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " use",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " request_secret.",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "usage_update",
          used: 12,
          size: 8192,
          cost: {
            amount: 0.000297,
            currency: "USD",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875641.985167,
          tool_calls: ["request_secret"],
          kind: "model_call",
          step: 1,
          model: "test-model",
          input_tokens: 12,
          output_tokens: 0,
          cost_usd: 0.000036,
          stop_reason: "tool_use",
          priced: true,
          turn_cost_usd: 0.000036,
          cost_cap_usd: 0.5,
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_1794875641984_0",
          title: 'request_secret({"name": "STRIPE_KEY", "reason": "to create the webhook"})',
          name: "request_secret",
          kind: "other",
          status: "pending",
          rawInput: {
            name: "STRIPE_KEY",
            reason: "to create the webhook",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875641.9852765,
          kind: "questions",
          asking: {
            kind: "secret",
          },
          waiting: [],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      id: 1,
      method: "_com.maetek.agent86/secret/request",
      params: {
        sessionId: "s1",
        name: "STRIPE_KEY",
        reason: "to create the webhook",
        replacing: true,
        canRemember: false,
        remembered: false,
      },
    },
    {
      dir: "C>",
      jsonrpc: "2.0",
      id: 1,
      result: {
        outcome: "declined",
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875641.9866638,
          kind: "questions",
          asking: null,
          waiting: [],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1794875641984_0",
          status: "failed",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: "The user declined to enter the secret STRIPE_KEY.",
              },
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: "The",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " tool",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " finished.",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "Tool result: The user declined to enter the secret STRIPE_KEY.",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "usage_update",
          used: 12,
          size: 8192,
          cost: {
            amount: 0.000348,
            currency: "USD",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.0466802,
          tool_calls: [],
          kind: "model_call",
          step: 2,
          model: "test-model",
          input_tokens: 12,
          output_tokens: 1,
          cost_usd: 0.000051,
          stop_reason: "end_turn",
          priced: true,
          turn_cost_usd: 0.000087,
          cost_cap_usd: 0.5,
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      id: 28,
      result: {
        stopReason: "end_turn",
      },
    },
  ],
  cancelledTurn: [
    {
      dir: "C>",
      jsonrpc: "2.0",
      id: 30,
      method: "session/prompt",
      params: {
        sessionId: "s1",
        prompt: [
          {
            type: "text",
            text: "ask for a secret",
          },
        ],
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: "I",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " will",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " use",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " request_secret.",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "usage_update",
          used: 12,
          size: 8192,
          cost: {
            amount: 0.000384,
            currency: "USD",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.1087277,
          tool_calls: ["request_secret"],
          kind: "model_call",
          step: 1,
          model: "test-model",
          input_tokens: 12,
          output_tokens: 0,
          cost_usd: 0.000036,
          stop_reason: "tool_use",
          priced: true,
          turn_cost_usd: 0.000036,
          cost_cap_usd: 0.5,
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_1794875642108_0",
          title: 'request_secret({"name": "STRIPE_KEY", "reason": "to create the webhook"})',
          name: "request_secret",
          kind: "other",
          status: "pending",
          rawInput: {
            name: "STRIPE_KEY",
            reason: "to create the webhook",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.1088438,
          kind: "questions",
          asking: {
            kind: "secret",
          },
          waiting: [],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      id: 2,
      method: "_com.maetek.agent86/secret/request",
      params: {
        sessionId: "s1",
        name: "STRIPE_KEY",
        reason: "to create the webhook",
        replacing: false,
        canRemember: false,
        remembered: false,
      },
    },
    {
      dir: "C>",
      jsonrpc: "2.0",
      method: "session/cancel",
      params: {
        sessionId: "s1",
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.2261622,
          kind: "questions",
          asking: null,
          waiting: [],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1794875642108_0",
          status: "failed",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: "The user declined to enter the secret STRIPE_KEY.",
              },
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "\n[cancelled]\n",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      id: 30,
      result: {
        stopReason: "cancelled",
      },
    },
  ],
  slashSecretTurn: [
    {
      dir: "C>",
      jsonrpc: "2.0",
      id: 31,
      method: "session/prompt",
      params: {
        sessionId: "s1",
        prompt: [
          {
            type: "text",
            text: "/secret abcdefgh12345",
          },
        ],
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "nothing was stored. Don't type a secret here: it would stay in this thread. Use this client's own secret entry, which hands it to agent86 without the thread seeing it; /secret forget NAME removes one.",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "config_option_update",
          configOptions: [
            {
              id: "mode",
              name: "Approval mode",
              category: "mode",
              type: "select",
              currentValue: "ask",
              options: [
                {
                  value: "ask",
                  name: "ask",
                },
                {
                  value: "auto",
                  name: "auto",
                },
                {
                  value: "deny",
                  name: "deny",
                },
              ],
              description:
                "ask: confirm each change; auto: run without asking; deny: refuse changes",
            },
            {
              id: "model",
              name: "Model",
              category: "model",
              type: "select",
              currentValue: "mock:test-model",
              options: [
                {
                  value: "mock:test-model",
                  name: "mock:test-model",
                },
                {
                  value: "ollama:llama3.1",
                  name: "ollama:llama3.1",
                },
                {
                  value: "anthropic:claude-opus-4-8",
                  name: "anthropic:claude-opus-4-8",
                },
              ],
              description:
                "provider:model; /model switches to any other, for example one not listed",
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      id: 31,
      result: {
        stopReason: "end_turn",
      },
    },
  ],
  parallelTurn: [
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: "I",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " will",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " use",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " delegate, delegate.",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "usage_update",
          used: 12,
          size: 8192,
          cost: {
            amount: 0.00042,
            currency: "USD",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.7234354,
          tool_calls: ["delegate", "delegate"],
          kind: "model_call",
          step: 1,
          model: "test-model",
          input_tokens: 12,
          output_tokens: 0,
          cost_usd: 0.000036,
          stop_reason: "tool_use",
          priced: true,
          turn_cost_usd: 0.000036,
          cost_cap_usd: 0.5,
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_1794875642722_0",
          title: "writer: writer-task-one: write the file",
          name: "delegate",
          kind: "other",
          status: "pending",
          rawInput: {
            agent: "writer",
            task: "writer-task-one: write the file",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_1794875642722_1",
          title: "writer: writer-task-two: write the file",
          name: "delegate",
          kind: "other",
          status: "pending",
          rawInput: {
            agent: "writer",
            task: "writer-task-two: write the file",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1794875642722_0",
          status: "in_progress",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: "writer started",
              },
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.7238889,
          kind: "subagent",
          phase: "started",
          card: "call_1794875642722_0",
          run: 1,
          agent: "writer",
          depth: 1,
          task: "writer-task-one: write the file",
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1794875642722_1",
          status: "in_progress",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: "writer started",
              },
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.723976,
          kind: "subagent",
          phase: "started",
          card: "call_1794875642722_1",
          run: 2,
          agent: "writer",
          depth: 1,
          task: "writer-task-two: write the file",
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.7847955,
          tool_calls: ["write_file"],
          kind: "model_call",
          agent: "writer",
          depth: 1,
          run: 2,
          step: 1,
          model: "test-model",
          input_tokens: 12,
          output_tokens: 0,
          cost_usd: 0.000036,
          stop_reason: "tool_use",
          priced: true,
          turn_cost_usd: 0.000072,
          cost_cap_usd: 0.5,
          card: "call_1794875642722_1",
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.7848134,
          tool_calls: ["write_file"],
          kind: "model_call",
          agent: "writer",
          depth: 1,
          run: 1,
          step: 1,
          model: "test-model",
          input_tokens: 12,
          output_tokens: 0,
          cost_usd: 0.000036,
          stop_reason: "tool_use",
          priced: true,
          turn_cost_usd: 0.000108,
          cost_cap_usd: 0.5,
          card: "call_1794875642722_0",
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1794875642722_1",
          status: "in_progress",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: 'writer started\nwrite_file({"path": "two.txt", "content": "written by two\\n"})',
              },
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1794875642722_0",
          status: "in_progress",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: 'writer started\nwrite_file({"path": "one.txt", "content": "written by one\\n"})',
              },
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.7865355,
          kind: "questions",
          asking: {
            kind: "approval",
            tool: "write_file",
            call: "call_1794875642722_0/1",
            agent: "writer",
            card: "call_1794875642722_0",
          },
          waiting: [],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_1794875642722_0/1",
          title: '[writer] write_file({"path": "one.txt", "content": "written by one\\n"})',
          name: "write_file",
          kind: "edit",
          status: "pending",
          rawInput: {
            path: "one.txt",
            content: "written by one\n",
          },
          locations: [
            {
              path: "/work/one.txt",
              line: 1,
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      id: 3,
      method: "session/request_permission",
      params: {
        sessionId: "s1",
        toolCall: {
          toolCallId: "call_1794875642722_0/1",
          title: '[writer] write_file({"path": "one.txt", "content": "written by one\\n"})',
          kind: "edit",
          status: "pending",
          rawInput: {
            path: "one.txt",
            content: "written by one\n",
          },
          content: [
            {
              type: "diff",
              path: "/work/one.txt",
              oldText: null,
              newText: "written by one\n",
            },
            {
              type: "content",
              content: {
                type: "text",
                text: "Warning: Asked by the 'writer' sub-agent.\n\nnew file: one.txt (1 line)\nwritten by one\n",
              },
            },
          ],
          locations: [
            {
              path: "/work/one.txt",
              line: 1,
            },
          ],
        },
        options: [
          {
            optionId: "allow-once",
            name: "Allow once",
            kind: "allow_once",
          },
          {
            optionId: "reject-once",
            name: "Reject",
            kind: "reject_once",
          },
        ],
        _meta: {
          "com.maetek.agent86/subagent": {
            card: "call_1794875642722_0",
            run: 1,
            agent: "writer",
            depth: 1,
            worktree: null,
            steps: 1,
            cost_usd: 0.000036,
            turn_cost_usd: 0.000108,
            cost_cap_usd: 0.5,
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.786917,
          kind: "questions",
          asking: {
            kind: "approval",
            tool: "write_file",
            call: "call_1794875642722_0/1",
            agent: "writer",
            card: "call_1794875642722_0",
          },
          waiting: [
            {
              kind: "approval",
              tool: "write_file",
              call: "call_1794875642722_1/1",
              agent: "writer",
              card: "call_1794875642722_1",
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.787836,
          kind: "questions",
          asking: {
            kind: "approval",
            tool: "write_file",
            call: "call_1794875642722_1/1",
            agent: "writer",
            card: "call_1794875642722_1",
          },
          waiting: [],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_1794875642722_1/1",
          title: '[writer] write_file({"path": "two.txt", "content": "written by two\\n"})',
          name: "write_file",
          kind: "edit",
          status: "pending",
          rawInput: {
            path: "two.txt",
            content: "written by two\n",
          },
          locations: [
            {
              path: "/work/two.txt",
              line: 1,
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      id: 4,
      method: "session/request_permission",
      params: {
        sessionId: "s1",
        toolCall: {
          toolCallId: "call_1794875642722_1/1",
          title: '[writer] write_file({"path": "two.txt", "content": "written by two\\n"})',
          kind: "edit",
          status: "pending",
          rawInput: {
            path: "two.txt",
            content: "written by two\n",
          },
          content: [
            {
              type: "diff",
              path: "/work/two.txt",
              oldText: null,
              newText: "written by two\n",
            },
            {
              type: "content",
              content: {
                type: "text",
                text: "Warning: Asked by the 'writer' sub-agent.\n\nnew file: two.txt (1 line)\nwritten by two\n",
              },
            },
          ],
          locations: [
            {
              path: "/work/two.txt",
              line: 1,
            },
          ],
        },
        options: [
          {
            optionId: "allow-once",
            name: "Allow once",
            kind: "allow_once",
          },
          {
            optionId: "reject-once",
            name: "Reject",
            kind: "reject_once",
          },
        ],
        _meta: {
          "com.maetek.agent86/subagent": {
            card: "call_1794875642722_1",
            run: 2,
            agent: "writer",
            depth: 1,
            worktree: null,
            steps: 1,
            cost_usd: 0.000036,
            turn_cost_usd: 0.000108,
            cost_cap_usd: 0.5,
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.7888775,
          kind: "questions",
          asking: null,
          waiting: [],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1794875642722_0/1",
          status: "completed",
          content: [
            {
              type: "diff",
              path: "/work/one.txt",
              oldText: null,
              newText: "written by one\n",
            },
            {
              type: "content",
              content: {
                type: "text",
                text: "Wrote 15 bytes to one.txt (new file).\nnew file, 1 line",
              },
            },
          ],
          locations: [
            {
              path: "/work/one.txt",
              line: 1,
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1794875642722_0",
          status: "in_progress",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: 'writer started\nwrite_file({"path": "one.txt", "content": "written by one\\n"})\n  ↳ Wrote 15 bytes to one.txt (new file).',
              },
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1794875642722_1/1",
          status: "completed",
          content: [
            {
              type: "diff",
              path: "/work/two.txt",
              oldText: null,
              newText: "written by two\n",
            },
            {
              type: "content",
              content: {
                type: "text",
                text: "Wrote 15 bytes to two.txt (new file).\nnew file, 1 line",
              },
            },
          ],
          locations: [
            {
              path: "/work/two.txt",
              line: 1,
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1794875642722_1",
          status: "in_progress",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: 'writer started\nwrite_file({"path": "two.txt", "content": "written by two\\n"})\n  ↳ Wrote 15 bytes to two.txt (new file).',
              },
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.8463595,
          tool_calls: [],
          kind: "model_call",
          agent: "writer",
          depth: 1,
          run: 1,
          step: 2,
          model: "test-model",
          input_tokens: 12,
          output_tokens: 1,
          cost_usd: 0.000051,
          stop_reason: "end_turn",
          priced: true,
          turn_cost_usd: 0.000159,
          cost_cap_usd: 0.5,
          card: "call_1794875642722_0",
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.8464472,
          tool_calls: [],
          kind: "model_call",
          agent: "writer",
          depth: 1,
          run: 2,
          step: 2,
          model: "test-model",
          input_tokens: 12,
          output_tokens: 1,
          cost_usd: 0.000051,
          stop_reason: "end_turn",
          priced: true,
          turn_cost_usd: 0.00020999999999999998,
          cost_cap_usd: 0.5,
          card: "call_1794875642722_1",
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.8466246,
          kind: "subagent",
          phase: "finished",
          card: "call_1794875642722_0",
          run: 1,
          agent: "writer",
          depth: 1,
          ok: true,
          input_tokens: 24,
          output_tokens: 1,
          cost_usd: 0.000087,
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.846706,
          kind: "subagent",
          phase: "finished",
          card: "call_1794875642722_1",
          run: 2,
          agent: "writer",
          depth: 1,
          ok: true,
          input_tokens: 24,
          output_tokens: 1,
          cost_usd: 0.000087,
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1794875642722_0",
          status: "completed",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: "Tool result: Wrote 15 bytes to one.txt (new file).\nnew file, 1 line",
              },
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1794875642722_1",
          status: "completed",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: "Tool result: Wrote 15 bytes to two.txt (new file).\nnew file, 1 line",
              },
            },
          ],
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: "The",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " tool",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: " finished.",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "Tool result: Tool result: Wrote 15 bytes to two.txt (new file).\nnew file, 1 line",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "usage_update",
          used: 12,
          size: 8192,
          cost: {
            amount: 0.0006450000000000001,
            currency: "USD",
          },
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      method: "_com.maetek.agent86/session/event",
      params: {
        sessionId: "s1",
        event: {
          ts: 1794875642.9081266,
          tool_calls: [],
          kind: "model_call",
          step: 2,
          model: "test-model",
          input_tokens: 12,
          output_tokens: 1,
          cost_usd: 0.000051,
          stop_reason: "end_turn",
          priced: true,
          turn_cost_usd: 0.000261,
          cost_cap_usd: 0.5,
        },
      },
    },
    {
      dir: "A>",
      jsonrpc: "2.0",
      id: 35,
      result: {
        stopReason: "end_turn",
      },
    },
  ],
  resume: {
    request: {
      jsonrpc: "2.0",
      id: 37,
      method: "session/resume",
      params: {
        sessionId: "s1",
        cwd: "/work",
        mcpServers: [],
      },
    },
    reply: {
      jsonrpc: "2.0",
      id: 37,
      result: {
        configOptions: [
          {
            id: "mode",
            name: "Approval mode",
            category: "mode",
            type: "select",
            currentValue: "ask",
            options: [
              {
                value: "ask",
                name: "ask",
              },
              {
                value: "auto",
                name: "auto",
              },
              {
                value: "deny",
                name: "deny",
              },
            ],
            description: "ask: confirm each change; auto: run without asking; deny: refuse changes",
          },
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "mock:test-model",
            options: [
              {
                value: "mock:test-model",
                name: "mock:test-model",
              },
              {
                value: "ollama:llama3.1",
                name: "ollama:llama3.1",
              },
              {
                value: "anthropic:claude-opus-4-8",
                name: "anthropic:claude-opus-4-8",
              },
            ],
            description: "provider:model; /model switches to any other, for example one not listed",
          },
        ],
      },
    },
  },
  withoutClaim: {
    initialize: {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: {
          list: {},
          resume: {},
        },
        promptCapabilities: {
          image: false,
          audio: false,
          embeddedContext: false,
        },
        mcpCapabilities: {
          http: true,
          sse: true,
        },
        _meta: {
          "com.maetek.agent86/state": {
            version: 1,
          },
          "com.maetek.agent86/memory": {
            version: 1,
          },
          "com.maetek.agent86/secrets": {
            version: 1,
          },
        },
      },
      agentInfo: {
        name: "agent86",
        title: "agent86",
        version: "1.0.23",
      },
      authMethods: [
        {
          id: "terminal-setup",
          name: "Set up a provider and API key",
          description: "Choose a model provider and store its API key in the OS keyring.",
          type: "terminal",
          args: ["auth"],
        },
      ],
    },
    askTurn: [
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "agent_thought_chunk",
            content: {
              type: "text",
              text: "I",
            },
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "agent_thought_chunk",
            content: {
              type: "text",
              text: " will",
            },
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "agent_thought_chunk",
            content: {
              type: "text",
              text: " use",
            },
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "agent_thought_chunk",
            content: {
              type: "text",
              text: " request_secret.",
            },
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "usage_update",
            used: 12,
            size: 8192,
            cost: {
              amount: 0.000036,
              currency: "USD",
            },
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "_com.maetek.agent86/session/event",
        params: {
          sessionId: "s1",
          event: {
            ts: 1794875665.9613743,
            tool_calls: ["request_secret"],
            kind: "model_call",
            step: 1,
            model: "test-model",
            input_tokens: 12,
            output_tokens: 0,
            cost_usd: 0.000036,
            stop_reason: "tool_use",
            priced: true,
            turn_cost_usd: 0.000036,
            cost_cap_usd: 0.5,
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "call_1794875665960_0",
            title: 'request_secret({"name": "STRIPE_KEY", "reason": "to create the webhook"})',
            name: "request_secret",
            kind: "other",
            status: "pending",
            rawInput: {
              name: "STRIPE_KEY",
              reason: "to create the webhook",
            },
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: "call_1794875665960_0",
            status: "failed",
            content: [
              {
                type: "content",
                content: {
                  type: "text",
                  text: "Unknown tool 'request_secret'. Available: delegate, edit_file, find_files, list_dir, python_exec, read_file, recall, remember, run_command, search_files, web_fetch, write_file.",
                },
              },
            ],
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "agent_thought_chunk",
            content: {
              type: "text",
              text: "The",
            },
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "agent_thought_chunk",
            content: {
              type: "text",
              text: " tool",
            },
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "agent_thought_chunk",
            content: {
              type: "text",
              text: " finished.",
            },
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "Tool result: Unknown tool 'request_secret'. Available: delegate, edit_file, find_files, list_dir, python_exec, read_file, recall, remember, run_command, search_files, web_fetch, write_file.",
            },
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "usage_update",
            used: 12,
            size: 8192,
            cost: {
              amount: 0.000087,
              currency: "USD",
            },
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "_com.maetek.agent86/session/event",
        params: {
          sessionId: "s1",
          event: {
            ts: 1794875666.0232964,
            tool_calls: [],
            kind: "model_call",
            step: 2,
            model: "test-model",
            input_tokens: 12,
            output_tokens: 1,
            cost_usd: 0.000051,
            stop_reason: "end_turn",
            priced: true,
            turn_cost_usd: 0.000087,
            cost_cap_usd: 0.5,
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        id: 6,
        result: {
          stopReason: "end_turn",
        },
      },
    ],
    slashSecretTurn: [
      {
        dir: "C>",
        jsonrpc: "2.0",
        id: 7,
        method: "session/prompt",
        params: {
          sessionId: "s1",
          prompt: [
            {
              type: "text",
              text: "/secret abcdefgh12345",
            },
          ],
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "nothing was stored. Don't type a secret here: it would stay in this thread. Enter it at a terminal in this project with agent86 and /secret NAME, choose to remember it, and sessions here will have it; /secret forget NAME removes one.",
            },
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "config_option_update",
            configOptions: [
              {
                id: "mode",
                name: "Approval mode",
                category: "mode",
                type: "select",
                currentValue: "ask",
                options: [
                  {
                    value: "ask",
                    name: "ask",
                  },
                  {
                    value: "auto",
                    name: "auto",
                  },
                  {
                    value: "deny",
                    name: "deny",
                  },
                ],
                description:
                  "ask: confirm each change; auto: run without asking; deny: refuse changes",
              },
              {
                id: "model",
                name: "Model",
                category: "model",
                type: "select",
                currentValue: "mock:test-model",
                options: [
                  {
                    value: "mock:test-model",
                    name: "mock:test-model",
                  },
                  {
                    value: "ollama:llama3.1",
                    name: "ollama:llama3.1",
                  },
                  {
                    value: "anthropic:claude-opus-4-8",
                    name: "anthropic:claude-opus-4-8",
                  },
                ],
                description:
                  "provider:model; /model switches to any other, for example one not listed",
              },
            ],
          },
        },
      },
      {
        dir: "A>",
        jsonrpc: "2.0",
        id: 7,
        result: {
          stopReason: "end_turn",
        },
      },
    ],
    set: {
      request: {
        jsonrpc: "2.0",
        id: 8,
        method: "_com.maetek.agent86/secret/set",
        params: {
          sessionId: "s1",
          name: "API_TOKEN",
          value: "<hidden>",
        },
      },
      reply: {
        jsonrpc: "2.0",
        id: 8,
        result: {
          name: "API_TOKEN",
          remembered: false,
        },
      },
    },
  },
} as const;
