// ACP messages recorded from the real agent86 1.0.21 (`agent86 acp` against the scripted model
// server, packages/mock-agent/src/mock-openai.js, with a `writer` user specialist that may only
// write_file, approval mode ask, and a $0.50 cap), on 2026-11-16. The workspace path is replaced by
// /work (and Windows separators after it by /) and the session ids by s1; nothing else is changed.
//
// - PARALLEL_TURN: "parallel writers", two writer sub-agents delegated in one step, each asking to
//   write a file; both requests allowed. Note the order: a `questions` event naming a call comes
//   before that call's `tool_call`, and the second question's call is announced only once the
//   first is answered.
// - CANCELLED_TURN: the same, with `session/cancel` sent when the first request arrived.
// - CRASH_TURN: "crash after reading", a read_file step, then agent86 killed while it streamed.
//   Then a new process resumed the session (RESUME_RESULT, no replay) and a later one loaded it
//   (CRASH_LOAD_REPLAY: the finished read_file step is there).
export const RECORDED_1021 = {
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
      },
    },
    agentInfo: {
      name: "agent86",
      title: "agent86",
      version: "1.0.21",
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
  notInitialized: {
    jsonrpc: "2.0",
    id: 1,
    error: {
      code: -32600,
      message: "Not initialized: call initialize first",
    },
  },
  unknownSession: {
    jsonrpc: "2.0",
    id: 5,
    error: {
      code: -32002,
      message: "Session not found: no-such-session",
    },
  },
  resumeResult: {
    jsonrpc: "2.0",
    id: 2,
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
  parallelResponse: {
    jsonrpc: "2.0",
    id: 4,
    result: {
      stopReason: "end_turn",
    },
  },
  cancelledResponse: {
    jsonrpc: "2.0",
    id: 3,
    result: {
      stopReason: "cancelled",
    },
  },
} as const;

export const PARALLEL_TURN = [
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          {
            name: "mode",
            description: "Show or set the approval mode for this session",
            input: {
              hint: "ask, auto, or deny",
            },
          },
          {
            name: "model",
            description: "Show or switch the model for this session",
            input: {
              hint: "provider:model",
            },
          },
          {
            name: "thinking",
            description: "Show or set how much of the model's reasoning is shown",
            input: {
              hint: "full, summary, or hidden",
            },
          },
          {
            name: "toolview",
            description: "Show or set how much of each tool call is shown",
            input: {
              hint: "full, summary, or hidden",
            },
          },
          {
            name: "resume",
            description: "List saved sessions, or continue one in this thread",
            input: {
              hint: "session id (or its first characters)",
            },
          },
          {
            name: "secret",
            description:
              "List the secrets available to the agent (never their values), or forget one",
            input: {
              hint: "forget NAME",
            },
          },
          {
            name: "rename",
            description: "Show or set this session's name",
            input: {
              hint: "new title",
            },
          },
          {
            name: "cost",
            description: "Show token usage and cost this session",
          },
          {
            name: "tools",
            description: "List the tools the agent can use",
          },
          {
            name: "skills",
            description: "List the skills, and how to run each",
          },
          {
            name: "agents",
            description: "List the specialist sub-agents, or show one",
            input: {
              hint: "name (optional)",
            },
          },
          {
            name: "skill",
            description: "Run a skill now, with an optional task",
            input: {
              hint: "skill name, then the task (optional)",
            },
          },
          {
            name: "agent",
            description: "Run a specialist sub-agent on a task now",
            input: {
              hint: "[--with-context] name, then the task",
            },
          },
        ],
      },
    },
  },
  {
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.0621345,
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1794849720061_0",
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1794849720061_1",
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720061_0",
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.0632522,
        kind: "subagent",
        phase: "started",
        card: "call_1794849720061_0",
        run: 1,
        agent: "writer",
        depth: 1,
        task: "writer-task-one: write the file",
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720061_1",
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.0638957,
        kind: "subagent",
        phase: "started",
        card: "call_1794849720061_1",
        run: 2,
        agent: "writer",
        depth: 1,
        task: "writer-task-two: write the file",
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.1174624,
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
        card: "call_1794849720061_1",
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.117507,
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
        card: "call_1794849720061_0",
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720061_1",
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720061_0",
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.1202807,
        kind: "questions",
        asking: {
          kind: "approval",
          tool: "write_file",
          call: "call_1794849720061_0/1",
          agent: "writer",
          card: "call_1794849720061_0",
        },
        waiting: [],
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1794849720061_0/1",
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.1204681,
        kind: "questions",
        asking: {
          kind: "approval",
          tool: "write_file",
          call: "call_1794849720061_0/1",
          agent: "writer",
          card: "call_1794849720061_0",
        },
        waiting: [
          {
            kind: "approval",
            tool: "write_file",
            call: "call_1794849720061_1/1",
            agent: "writer",
            card: "call_1794849720061_1",
          },
        ],
      },
    },
  },
  {
    jsonrpc: "2.0",
    id: 0,
    method: "session/request_permission",
    params: {
      sessionId: "s1",
      toolCall: {
        toolCallId: "call_1794849720061_0/1",
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
          card: "call_1794849720061_0",
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.4265585,
        kind: "questions",
        asking: {
          kind: "approval",
          tool: "write_file",
          call: "call_1794849720061_1/1",
          agent: "writer",
          card: "call_1794849720061_1",
        },
        waiting: [],
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1794849720061_1/1",
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
    jsonrpc: "2.0",
    id: 1,
    method: "session/request_permission",
    params: {
      sessionId: "s1",
      toolCall: {
        toolCallId: "call_1794849720061_1/1",
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
          card: "call_1794849720061_1",
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720061_0/1",
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720061_0",
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.4866428,
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
        card: "call_1794849720061_0",
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.4869843,
        kind: "subagent",
        phase: "finished",
        card: "call_1794849720061_0",
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.7411473,
        kind: "questions",
        asking: null,
        waiting: [],
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720061_1/1",
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720061_1",
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.8064067,
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
        card: "call_1794849720061_1",
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.8066275,
        kind: "subagent",
        phase: "finished",
        card: "call_1794849720061_1",
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720061_0",
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720061_1",
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.8664434,
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
];

export const CANCELLED_TURN = [
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          {
            name: "mode",
            description: "Show or set the approval mode for this session",
            input: {
              hint: "ask, auto, or deny",
            },
          },
          {
            name: "model",
            description: "Show or switch the model for this session",
            input: {
              hint: "provider:model",
            },
          },
          {
            name: "thinking",
            description: "Show or set how much of the model's reasoning is shown",
            input: {
              hint: "full, summary, or hidden",
            },
          },
          {
            name: "toolview",
            description: "Show or set how much of each tool call is shown",
            input: {
              hint: "full, summary, or hidden",
            },
          },
          {
            name: "resume",
            description: "List saved sessions, or continue one in this thread",
            input: {
              hint: "session id (or its first characters)",
            },
          },
          {
            name: "secret",
            description:
              "List the secrets available to the agent (never their values), or forget one",
            input: {
              hint: "forget NAME",
            },
          },
          {
            name: "rename",
            description: "Show or set this session's name",
            input: {
              hint: "new title",
            },
          },
          {
            name: "cost",
            description: "Show token usage and cost this session",
          },
          {
            name: "tools",
            description: "List the tools the agent can use",
          },
          {
            name: "skills",
            description: "List the skills, and how to run each",
          },
          {
            name: "agents",
            description: "List the specialist sub-agents, or show one",
            input: {
              hint: "name (optional)",
            },
          },
          {
            name: "skill",
            description: "Run a skill now, with an optional task",
            input: {
              hint: "skill name, then the task (optional)",
            },
          },
          {
            name: "agent",
            description: "Run a specialist sub-agent on a task now",
            input: {
              hint: "[--with-context] name, then the task",
            },
          },
        ],
      },
    },
  },
  {
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.9615242,
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1794849720960_0",
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1794849720960_1",
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720960_0",
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720960_1",
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.96245,
        kind: "subagent",
        phase: "started",
        card: "call_1794849720960_0",
        run: 1,
        agent: "writer",
        depth: 1,
        task: "writer-task-one: write the file",
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849720.9624681,
        kind: "subagent",
        phase: "started",
        card: "call_1794849720960_1",
        run: 2,
        agent: "writer",
        depth: 1,
        task: "writer-task-two: write the file",
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849721.027045,
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
        turn_cost_usd: 0.000072,
        cost_cap_usd: 0.5,
        card: "call_1794849720960_0",
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720960_0",
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849721.0271204,
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
        turn_cost_usd: 0.000108,
        cost_cap_usd: 0.5,
        card: "call_1794849720960_1",
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720960_1",
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849721.0284653,
        kind: "questions",
        asking: {
          kind: "approval",
          tool: "write_file",
          call: "call_1794849720960_0/1",
          agent: "writer",
          card: "call_1794849720960_0",
        },
        waiting: [],
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1794849720960_0/1",
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
          },
        ],
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849721.0285532,
        kind: "questions",
        asking: {
          kind: "approval",
          tool: "write_file",
          call: "call_1794849720960_0/1",
          agent: "writer",
          card: "call_1794849720960_0",
        },
        waiting: [
          {
            kind: "approval",
            tool: "write_file",
            call: "call_1794849720960_1/1",
            agent: "writer",
            card: "call_1794849720960_1",
          },
        ],
      },
    },
  },
  {
    jsonrpc: "2.0",
    id: 0,
    method: "session/request_permission",
    params: {
      sessionId: "s1",
      toolCall: {
        toolCallId: "call_1794849720960_0/1",
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
            oldText: "written by one\n",
            newText: "written by one\n",
          },
          {
            type: "content",
            content: {
              type: "text",
              text: "Warning: Asked by the 'writer' sub-agent.\n\none.txt is already exactly this content (no change).",
            },
          },
        ],
        locations: [
          {
            path: "/work/one.txt",
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
          card: "call_1794849720960_0",
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720960_0/1",
        status: "failed",
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: "Not executed: declined by user.",
            },
          },
        ],
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849721.0288413,
        kind: "questions",
        asking: null,
        waiting: [],
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720960_0",
        status: "in_progress",
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: 'writer started\nwrite_file({"path": "one.txt", "content": "written by one\\n"})\n✗ write_file: error: Not executed: declined by user.',
            },
          },
        ],
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720960_1",
        status: "in_progress",
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: 'writer started\nwrite_file({"path": "two.txt", "content": "written by two\\n"})\n✗ write_file: error: Not executed: declined by user.',
            },
          },
        ],
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849721.0296638,
        kind: "subagent",
        phase: "finished",
        card: "call_1794849720960_0",
        run: 1,
        agent: "writer",
        depth: 1,
        ok: true,
        input_tokens: 12,
        output_tokens: 0,
        cost_usd: 0.000036,
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849721.0296748,
        kind: "subagent",
        phase: "finished",
        card: "call_1794849720960_1",
        run: 2,
        agent: "writer",
        depth: 1,
        ok: true,
        input_tokens: 12,
        output_tokens: 0,
        cost_usd: 0.000036,
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720960_0",
        status: "completed",
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: "[sub-agent 'writer' cancelled]",
            },
          },
        ],
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849720960_1",
        status: "completed",
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: "[sub-agent 'writer' cancelled]",
            },
          },
        ],
      },
    },
  },
  {
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "usage_update",
        used: 36,
        size: 8192,
        cost: {
          amount: 0.000108,
          currency: "USD",
        },
      },
    },
  },
];

export const CRASH_TURN = [
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          {
            name: "mode",
            description: "Show or set the approval mode for this session",
            input: {
              hint: "ask, auto, or deny",
            },
          },
          {
            name: "model",
            description: "Show or switch the model for this session",
            input: {
              hint: "provider:model",
            },
          },
          {
            name: "thinking",
            description: "Show or set how much of the model's reasoning is shown",
            input: {
              hint: "full, summary, or hidden",
            },
          },
          {
            name: "toolview",
            description: "Show or set how much of each tool call is shown",
            input: {
              hint: "full, summary, or hidden",
            },
          },
          {
            name: "resume",
            description: "List saved sessions, or continue one in this thread",
            input: {
              hint: "session id (or its first characters)",
            },
          },
          {
            name: "secret",
            description:
              "List the secrets available to the agent (never their values), or forget one",
            input: {
              hint: "forget NAME",
            },
          },
          {
            name: "rename",
            description: "Show or set this session's name",
            input: {
              hint: "new title",
            },
          },
          {
            name: "cost",
            description: "Show token usage and cost this session",
          },
          {
            name: "tools",
            description: "List the tools the agent can use",
          },
          {
            name: "skills",
            description: "List the skills, and how to run each",
          },
          {
            name: "agents",
            description: "List the specialist sub-agents, or show one",
            input: {
              hint: "name (optional)",
            },
          },
          {
            name: "skill",
            description: "Run a skill now, with an optional task",
            input: {
              hint: "skill name, then the task (optional)",
            },
          },
          {
            name: "agent",
            description: "Run a specialist sub-agent on a task now",
            input: {
              hint: "[--with-context] name, then the task",
            },
          },
        ],
      },
    },
  },
  {
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_thought_chunk",
        content: {
          type: "text",
          text: " read_file.",
        },
      },
    },
  },
  {
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
    jsonrpc: "2.0",
    method: "_com.maetek.agent86/session/event",
    params: {
      sessionId: "s1",
      event: {
        ts: 1794849721.13143,
        tool_calls: ["read_file"],
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
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1794849721130_0",
        title: 'read_file({"path": "README.md"})',
        name: "read_file",
        kind: "read",
        status: "pending",
        rawInput: {
          path: "README.md",
        },
        locations: [
          {
            path: "/work/README.md",
          },
        ],
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849721130_0",
        status: "completed",
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: "Teh quick brown fox\n",
            },
          },
        ],
        locations: [
          {
            path: "/work/README.md",
          },
        ],
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_thought_chunk",
        content: {
          type: "text",
          text: "Taking",
        },
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_thought_chunk",
        content: {
          type: "text",
          text: " my",
        },
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_thought_chunk",
        content: {
          type: "text",
          text: " time.",
        },
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "word0 ",
        },
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "word1 ",
        },
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "word2 ",
        },
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "word3 ",
        },
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "word4 ",
        },
      },
    },
  },
];

export const CRASH_LOAD_REPLAY = [
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "text",
          text: "crash after reading",
        },
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1794849721130_0",
        title: 'read_file({"path": "README.md"})',
        name: "read_file",
        kind: "read",
        status: "pending",
        rawInput: {
          path: "README.md",
        },
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call_1794849721130_0",
        status: "completed",
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: "Teh quick brown fox\n",
            },
          },
        ],
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "text",
          text: "Continue where you left off.",
        },
      },
    },
  },
  {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: 'Continuing from "crash after reading" with the earlier tool result in view.',
        },
      },
    },
  },
];
