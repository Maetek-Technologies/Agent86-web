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
import { appendFileSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import { agent, methods, ndJsonStream, RequestError } from "@agentclientprotocol/sdk";
import { script } from "./mock-openai.js";

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
