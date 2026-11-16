// ACP messages recorded from the real agent86 1.0.20 (`agent86 acp` against the scripted model
// server, packages/mock-agent/src/mock-openai.js), on 2026-11-15. The workspace path is replaced by
// /work and the session id by s1; nothing else is changed. Shapes agent86 did not send in that run
// are in DOCUMENTED below, written from agent86's docs/ACP.md and ACP's schema/v1/schema.json.
export const RECORDED = {
  initialize: {
    protocolVersion: 1,
    agentCapabilities: {
      loadSession: true,
      sessionCapabilities: {
        list: {},
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
      },
    },
    agentInfo: {
      name: "agent86",
      title: "agent86",
      version: "1.0.20",
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
  editToolCall: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1794802235672",
        title: 'edit_file({"path": "README.md", "old_string": "Teh", "new_string": "The"})',
        name: "edit_file",
        kind: "edit",
        status: "pending",
        rawInput: {
          path: "README.md",
          old_string: "Teh",
          new_string: "The",
        },
        locations: [
          {
            path: "/work/README.md",
          },
        ],
      },
    },
  },
  editPermission: {
    jsonrpc: "2.0",
    id: 0,
    method: "session/request_permission",
    params: {
      sessionId: "s1",
      toolCall: {
        toolCallId: "call_1794802235672",
        title: 'edit_file({"path": "README.md", "old_string": "Teh", "new_string": "The"})',
        kind: "edit",
        status: "pending",
        rawInput: {
          path: "README.md",
          old_string: "Teh",
          new_string: "The",
        },
        content: [
          {
            type: "diff",
            path: "/work/README.md",
            oldText: "Teh quick brown fox\n",
            newText: "The quick brown fox\n",
          },
          {
            type: "content",
            content: {
              type: "text",
              text: "--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-Teh quick brown fox\n+The quick brown fox",
            },
          },
        ],
        locations: [
          {
            path: "/work/README.md",
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
    },
  },
  editCompleted: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794802235672",
        status: "completed",
        content: [
          {
            type: "diff",
            path: "/work/README.md",
            oldText: "Teh quick brown fox\n",
            newText: "The quick brown fox\n",
          },
          {
            type: "content",
            content: {
              type: "text",
              text: "Edited README.md (1 replacement).\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-Teh quick brown fox\n+The quick brown fox",
            },
          },
        ],
        locations: [
          {
            path: "/work/README.md",
            line: 1,
          },
        ],
      },
    },
  },
  writePermission: {
    jsonrpc: "2.0",
    id: 1,
    method: "session/request_permission",
    params: {
      sessionId: "s1",
      toolCall: {
        toolCallId: "call_1794802235811",
        title: 'write_file({"path": "notes.txt", "content": "first line\\nsecond line\\n"})',
        kind: "edit",
        status: "pending",
        rawInput: {
          path: "notes.txt",
          content: "first line\nsecond line\n",
        },
        content: [
          {
            type: "diff",
            path: "/work/notes.txt",
            oldText: null,
            newText: "first line\nsecond line\n",
          },
          {
            type: "content",
            content: {
              type: "text",
              text: "new file: notes.txt (2 lines)\nfirst line\nsecond line\n",
            },
          },
        ],
        locations: [
          {
            path: "/work/notes.txt",
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
    },
  },
  writeCompleted: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794802235811",
        status: "completed",
        content: [
          {
            type: "diff",
            path: "/work/notes.txt",
            oldText: null,
            newText: "first line\nsecond line\n",
          },
          {
            type: "content",
            content: {
              type: "text",
              text: "Wrote 23 bytes to notes.txt (new file).\nnew file, 2 lines",
            },
          },
        ],
        locations: [
          {
            path: "/work/notes.txt",
            line: 1,
          },
        ],
      },
    },
  },
  searchToolCall: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1794802235934",
        title: 'search_files({"pattern": "quick", "path": "."})',
        name: "search_files",
        kind: "search",
        status: "pending",
        rawInput: {
          pattern: "quick",
          path: ".",
        },
      },
    },
  },
  findToolCall: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1794802236057",
        title: 'find_files({"pattern": "*.md"})',
        name: "find_files",
        kind: "search",
        status: "pending",
        rawInput: {
          pattern: "*.md",
        },
      },
    },
  },
  usagePriced: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "usage_update",
        used: 12,
        size: 8192,
        cost: {
          amount: 0.000156,
          currency: "USD",
        },
      },
    },
  },
  usagePricedLater: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "usage_update",
        used: 12,
        size: 8192,
        cost: {
          amount: 0.000192,
          currency: "USD",
        },
      },
    },
  },
  modelCallMain: {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794802235.67363,
        tool_calls: ["edit_file"],
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
  modelCallMainAfterTool: {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794802235.7351997,
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
  delegationToolCall: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "agent-helper-1",
        title: "helper: say hello",
        name: "agent",
        kind: "other",
        status: "pending",
        rawInput: {
          agent: "helper",
          task: "say hello",
        },
      },
    },
  },
  subagentStarted: {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794802236.1268065,
        kind: "subagent",
        phase: "started",
        card: "agent-helper-1",
        run: 2,
        agent: "helper",
        depth: 1,
        task: "say hello",
      },
    },
  },
  modelCallSubagent: {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794802236.3512268,
        tool_calls: [],
        kind: "model_call",
        agent: "helper",
        depth: 1,
        run: 2,
        step: 1,
        model: "test-model",
        input_tokens: 12,
        output_tokens: 9,
        cost_usd: 0.000171,
        stop_reason: "end_turn",
        priced: true,
        turn_cost_usd: 0.000171,
        cost_cap_usd: 0.5,
        card: "agent-helper-1",
      },
    },
  },
  subagentFinished: {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794802236.351394,
        kind: "subagent",
        phase: "finished",
        card: "agent-helper-1",
        run: 2,
        agent: "helper",
        depth: 1,
        ok: true,
        input_tokens: 12,
        output_tokens: 9,
        cost_usd: 0.000171,
      },
    },
  },
  guardrail: {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794802236.3597465,
        findings: "injection:override-instructions, injection:prompt-extraction",
        kind: "guardrail",
        stage: "ingress_input",
      },
    },
  },
  replayedEditToolCall: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1794802235672",
        title: 'edit_file({"path": "README.md", "old_string": "Teh", "new_string": "The"})',
        name: "edit_file",
        kind: "edit",
        status: "pending",
        rawInput: {
          path: "README.md",
          old_string: "Teh",
          new_string: "The",
        },
      },
    },
  },
  replayedEditCompleted: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794802235672",
        status: "completed",
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: "Edited README.md (1 replacement).\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-Teh quick brown fox\n+The quick brown fox",
            },
          },
        ],
      },
    },
  },
} as const;
