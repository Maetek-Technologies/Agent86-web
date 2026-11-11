#!/usr/bin/env node
// A stand-in for the `agent86` binary, for agent86-web's tests.
//
//   mock-agent86 --version     prints "agent86 <version>", as agent86 does
//   mock-agent86 [...] acp     speaks ACP v1 on stdio, answering like agent86 1.0.15
//
// Environment:
//   MOCK_AGENT86_VERSION   the version to report (default 1.0.15)
//   MOCK_AGENT86_NAME      the agentInfo name to report (default agent86)
//   MOCK_AGENT86_RECORD    a file to append every received message to, one JSON per line
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable, Writable } from "node:stream";
import { agent, methods, ndJsonStream, RequestError } from "@agentclientprotocol/sdk";
import { script, toolFor } from "./mock-openai.js";

const version = process.env.MOCK_AGENT86_VERSION ?? "1.0.15";
const name = process.env.MOCK_AGENT86_NAME ?? "agent86";
const record = process.env.MOCK_AGENT86_RECORD;
const args = process.argv.slice(2);

if (args.includes("--version")) {
  process.stdout.write(`agent86 ${version}\n`);
  process.exit(0);
}

if (args.at(-1) !== "acp") {
  process.stderr.write("mock-agent86: only `--version` and `acp` are supported\n");
  process.exit(2);
}

/** @param {string} method @param {unknown} params */
function remember(method, params) {
  if (record)
    appendFileSync(record, `${JSON.stringify({ method, params, args, cwd: process.cwd() })}\n`);
}

// agent86 writes its notes to stderr; the bridge shows them in the logs drawer.
process.stderr.write(`mock-agent86 ${version}: started in ${process.cwd()}\n`);

let nextSession = 1;
let nextCall = 1;

/**
 * What agent86 would show for a call (its approval text) and do with it, in agent86's own formats:
 * a unified diff for an edit, "new file: …" for a new file, the command or code for exec tools, and
 * a warning paragraph for writes into agent86's own config or skills.
 * @param {{ name: string; arguments: Record<string, any> }} tool
 */
function describe(tool) {
  const args = tool.arguments;
  const path = typeof args.path === "string" ? join(process.cwd(), args.path) : "";
  switch (tool.name) {
    case "edit_file": {
      const before = existsSync(path) ? readFileSync(path, "utf8") : "";
      const after = before.replace(args.old_string, args.new_string);
      const diff = before
        .split("\n")
        .map((line, i) => [line, after.split("\n")[i]])
        .filter(([a, b]) => a !== b)
        .map(([a, b]) => `-${a}\n+${b}`)
        .join("\n");
      const text = `--- a/${args.path}\n+++ b/${args.path}\n@@ -1 +1 @@\n${diff}`;
      return {
        approval: text,
        run: () => {
          if (!before.includes(args.old_string))
            return { ok: false, text: `Error: old_string not found in ${args.path}` };
          writeFileSync(path, after);
          return { ok: true, text: `Edited ${args.path} (1 replacement).\n${text}` };
        },
      };
    }
    case "write_file": {
      const lines = String(args.content).split("\n").filter(Boolean).length;
      const body = `new file: ${args.path} (${lines} lines)\n${args.content}`;
      const guarded = String(args.path).startsWith(".agent86/");
      return {
        approval: guarded
          ? `Warning: This writes agent86's own configuration or skills (${args.path}), which changes what agent86 runs or is told from now on. Asked even in auto mode.\n\n${body}`
          : body,
        run: () => {
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, args.content);
          return {
            ok: true,
            text: `Wrote ${Buffer.byteLength(args.content)} bytes to ${args.path} (new file).`,
          };
        },
      };
    }
    case "run_command":
      return {
        approval: args.command,
        run: () => ({
          ok: true,
          text: `exit code: 0\nstdout:\n${String(args.command).replace(/^echo /, "")}\n`,
        }),
      };
    case "python_exec":
      return {
        approval: args.code,
        run: () => ({ ok: true, text: "exit code: 0\nstdout:\n42\n" }),
      };
    default:
      return {
        approval: undefined,
        run: () => ({
          ok: true,
          text: existsSync(path) ? readFileSync(path, "utf8") : `Error: ${args.path} not found`,
        }),
      };
  }
}

const KINDS = /** @type {const} */ ({
  edit_file: "edit",
  write_file: "edit",
  run_command: "execute",
  python_exec: "execute",
  read_file: "read",
});
/** Sessions whose running turn was asked to stop. */
const cancelled = new Set();
/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const app = agent({ name: "mock-agent86" })
  .onRequest(methods.agent.initialize, ({ params }) => {
    remember("initialize", params);
    return {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: { list: {} },
        promptCapabilities: { image: false, audio: false, embeddedContext: false },
        mcpCapabilities: { http: true, sse: true },
      },
      agentInfo: { name, title: name, version },
      authMethods: [],
    };
  })
  .onRequest(methods.agent.session.new, ({ params }) => {
    remember("session/new", params);
    return { sessionId: `mock-session-${nextSession++}` };
  })
  .onNotification(methods.agent.session.cancel, ({ params }) => {
    remember("session/cancel", params);
    cancelled.add(params.sessionId);
  })
  // Turns follow the same scripts as mock-openai.js, so a test reads the same against either.
  .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
    remember("session/prompt", params);
    const { sessionId } = params;
    cancelled.delete(sessionId);
    const text = params.prompt
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    /** @param {"agent_message_chunk" | "agent_thought_chunk"} kind @param {string} chunk */
    const say = (kind, chunk) =>
      client.notify(methods.client.session.update, {
        sessionId,
        update: { sessionUpdate: kind, content: { type: "text", text: chunk } },
      });

    if (text === "/cost") {
      await say("agent_message_chunk", "steps 0  in 0  out 0 tok  cost n/a (unpriced model)");
      return { stopReason: "end_turn" };
    }
    if (/fail/i.test(text)) {
      // agent86 sends a model failure as a bare -32603 with the provider's message.
      throw new RequestError(
        -32603,
        'HTTP 400: {"error":{"message":"The mock model refuses: you asked it to fail."}}',
      );
    }
    const tool = toolFor(text);
    if (tool) {
      const toolCallId = `call_${nextCall++}`;
      const title = `${tool.name}(${JSON.stringify(tool.arguments)})`;
      const kind = KINDS[/** @type {keyof typeof KINDS} */ (tool.name)] ?? "other";
      await say("agent_thought_chunk", `I will use ${tool.name}.`);
      await client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId,
          title,
          kind,
          status: "pending",
          rawInput: tool.arguments,
        },
      });
      const { approval, run } = describe(tool);
      let allowed = true;
      if (approval !== undefined) {
        /** @type {import("@agentclientprotocol/sdk").RequestPermissionResponse} */
        const answer = await client.request(methods.client.session.requestPermission, {
          sessionId,
          toolCall: {
            toolCallId,
            title,
            kind,
            status: "pending",
            rawInput: tool.arguments,
            content: [{ type: "content", content: { type: "text", text: approval } }],
          },
          options: [
            { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
            { optionId: "reject-once", name: "Reject", kind: "reject_once" },
          ],
        });
        remember("permission answer", answer);
        allowed = answer.outcome.outcome === "selected" && answer.outcome.optionId === "allow-once";
      }
      const outcome = allowed ? run() : { ok: false, text: "Not executed: declined by user." };
      await client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: outcome.ok ? "completed" : "failed",
          content: [{ type: "content", content: { type: "text", text: outcome.text } }],
        },
      });
      if (cancelled.has(sessionId)) return { stopReason: "cancelled" };
      await say("agent_message_chunk", `Tool result: ${outcome.text.slice(0, 300)}`);
      return { stopReason: "end_turn" };
    }
    const { reasoning, content, delayMs } = script(text);
    for (const [kind, pieces] of /** @type {const} */ ([
      ["agent_thought_chunk", reasoning],
      ["agent_message_chunk", content],
    ])) {
      for (const piece of pieces) {
        if (cancelled.has(sessionId)) return { stopReason: "cancelled" };
        await say(kind, piece);
        await sleep(delayMs);
      }
    }
    return { stopReason: cancelled.has(sessionId) ? "cancelled" : "end_turn" };
  });

const stream = ndJsonStream(
  /** @type {WritableStream<Uint8Array>} */ (Writable.toWeb(process.stdout)),
  /** @type {ReadableStream<Uint8Array>} */ (Readable.toWeb(process.stdin)),
);
const connection = app.connect(stream);
await connection.closed;
