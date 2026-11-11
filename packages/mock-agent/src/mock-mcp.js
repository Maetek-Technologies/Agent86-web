#!/usr/bin/env node
// A minimal MCP server on stdio, for tests: one tool, `mock_echo`. A project's agent86 config can
// name it under [mcp.servers.*], which agent86 only starts once the project is trusted.
import { createInterface } from "node:readline";

/** @param {unknown} message */
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

const TOOL = {
  name: "mock_echo",
  description: "Echo the text back (agent86-web's test MCP server).",
  inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
};

createInterface({ input: process.stdin }).on("line", (line) => {
  /** @type {{ id?: number | string; method?: string; params?: any }} */
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = message;
  if (id === undefined) return; // notifications (initialized, cancelled) need no answer
  switch (method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "mock-mcp", version: "0.0.0" },
        },
      });
      break;
    case "tools/list":
      send({ jsonrpc: "2.0", id, result: { tools: [TOOL] } });
      break;
    case "tools/call":
      send({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: String(params?.arguments?.text ?? "") }] },
      });
      break;
    case "ping":
      send({ jsonrpc: "2.0", id, result: {} });
      break;
    default:
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } });
  }
});
