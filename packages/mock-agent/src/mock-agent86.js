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
import { agent, methods, ndJsonStream } from "@agentclientprotocol/sdk";

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
  });

const stream = ndJsonStream(
  /** @type {WritableStream<Uint8Array>} */ (Writable.toWeb(process.stdout)),
  /** @type {ReadableStream<Uint8Array>} */ (Readable.toWeb(process.stdin)),
);
const connection = app.connect(stream);
await connection.closed;
