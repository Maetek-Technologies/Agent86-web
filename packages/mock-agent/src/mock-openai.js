#!/usr/bin/env node
// A scripted OpenAI-compatible chat completions server, so a real agent86 can run a turn in tests
// with no key and no network. The last user message picks the script:
//
//   contains "fail"      HTTP 400 with an OpenAI-style error body
//   contains "slow"      a long reply streamed slowly (for cancel tests)
//   contains "markdown"  a reply exercising headings, lists, code, a table, and links
//   anything else        a short reasoning trace, then "Hello from the mock model. You said: <text>"
//
//   mock-openai [--port <n>]    prints "listening on <port>" once ready
import { createServer } from "node:http";

/** @param {unknown} content */
function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("");
  }
  return "";
}

const MARKDOWN = [
  "# Mock report",
  "",
  "Here is a **bold** claim, some `inline code`, and a [link](https://example.com).",
  "",
  "- first item",
  "- second item",
  "",
  "```ts",
  "export const answer: number = 42;",
  "```",
  "",
  "| tool | result |",
  "| --- | --- |",
  "| read_file | ok |",
  "",
  "An image that must not load: ![pixel](https://example.com/pixel.png)",
  "",
  "<script>alert('xss')</script> raw HTML stays text.",
].join("\n");

/**
 * The pieces of one streamed reply.
 * @param {string} prompt
 * @returns {{ reasoning: string[]; content: string[]; delayMs: number }}
 */
export function script(prompt) {
  if (/slow/i.test(prompt)) {
    return {
      reasoning: ["Taking", " my", " time."],
      content: Array.from({ length: 200 }, (_, i) => `word${i} `),
      delayMs: 100,
    };
  }
  if (/markdown/i.test(prompt)) {
    return {
      reasoning: ["Formatting", " a", " report."],
      content: MARKDOWN.match(/[\s\S]{1,12}/g) ?? [],
      delayMs: 5,
    };
  }
  const reply = `Hello from the mock model. You said: ${prompt}`;
  return {
    reasoning: ["Let", " me", " think", " about", " that."],
    content: reply.match(/\S+\s*/g) ?? [reply],
    delayMs: 10,
  };
}

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createMockOpenAI() {
  return createServer(async (req, res) => {
    if (req.method === "GET" && req.url?.endsWith("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: "test-model", object: "model" }] }));
      return;
    }
    if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    /** @type {{ role: string; content: unknown }[]} */
    const messages = request.messages ?? [];
    const users = messages.filter((m) => m.role === "user");
    const prompt = textOf(users.at(-1)?.content).trim();

    if (/fail/i.test(prompt)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message: "The mock model refuses: you asked it to fail.",
            type: "invalid_request_error",
          },
        }),
      );
      return;
    }

    const { reasoning, content, delayMs } = script(prompt);
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    let aborted = false;
    res.on("close", () => (aborted = true));
    const id = `chatcmpl-mock-${Date.now()}`;
    /** @param {Record<string, unknown>} delta @param {string | null} [finish] */
    const send = (delta, finish = null) =>
      res.write(
        `data: ${JSON.stringify({ id, object: "chat.completion.chunk", model: request.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
      );
    send({ role: "assistant", content: "" });
    for (const piece of reasoning) {
      if (aborted) return;
      send({ reasoning_content: piece });
      await sleep(delayMs);
    }
    for (const piece of content) {
      if (aborted) return;
      send({ content: piece });
      await sleep(delayMs);
    }
    send({}, "stop");
    res.write(
      `data: ${JSON.stringify({ id, object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 12, completion_tokens: content.length, total_tokens: 12 + content.length } })}\n\n`,
    );
    res.end("data: [DONE]\n\n");
  });
}

if (process.argv[1]?.endsWith("mock-openai.js")) {
  const portIndex = process.argv.indexOf("--port");
  const port = portIndex > 0 ? Number(process.argv[portIndex + 1]) : 0;
  const server = createMockOpenAI();
  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    process.stdout.write(
      `listening on ${typeof address === "object" && address ? address.port : port}\n`,
    );
  });
}
