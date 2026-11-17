#!/usr/bin/env node
// A scripted OpenAI-compatible chat completions server, so a real agent86 can run a turn in tests
// with no key and no network. The last user message picks the script:
//
//   contains "fail"      HTTP 400 with an OpenAI-style error body
//   contains "slow"      a long reply streamed slowly (for cancel tests)
//   contains "markdown"  a reply exercising headings, lists, code, a table, and links
//   contains "typo"      calls edit_file on README.md ("Teh" → "The")
//   contains "write"     calls write_file to create notes.txt
//   contains "command"   calls run_command (echo)
//   contains "python"    calls python_exec
//   contains "read"      calls read_file on README.md (no approval needed)
//   contains "search"    calls search_files for "quick" (no approval needed)
//   contains "find"      calls find_files for "*.md" (no approval needed)
//   contains "skill"     calls write_file into .agent86/skills (agent86 warns about it)
//   "parallel writers"   delegates to the `writer` specialist twice in one step; each writer's
//                        task ("writer-task-<name>") calls write_file on <name>.txt, so two
//                        approvals queue up (agent86 1.0.21's approval inbox)
//   contains "crash"     calls read_file, then streams its answer slowly, so a test can stop
//                        agent86 partway through the turn, after one finished step
//   "ask for a secret"   calls request_secret for STRIPE_KEY ("to create the webhook"), which agent86
//                        1.0.23 sends to a client with a masked entry as `secret/request`
//   "remember that <x>"  calls remember with <x>, so agent86 1.0.22 stores a fact
//   "Continue where you left off"  says what it sees of the earlier turn (its first prompt, and
//                        whether a tool result is in the history), so a test can check that a
//                        resumed session kept its finished steps
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

/** @typedef {{ name: string; arguments: Record<string, unknown> }} ToolCall */

/** The tool calls a prompt asks for, all in one step; empty for none. */
/** @param {string} prompt @returns {ToolCall[]} */
export function toolsFor(prompt) {
  const writer = /\bwriter-task-(\w+)/.exec(prompt);
  if (writer)
    return [
      {
        name: "write_file",
        arguments: { path: `${writer[1]}.txt`, content: `written by ${writer[1]}\n` },
      },
    ];
  if (/\bparallel writers\b/i.test(prompt))
    return ["one", "two"].map((name) => ({
      name: "delegate",
      arguments: { agent: "writer", task: `writer-task-${name}: write the file` },
    }));
  if (/\bcrash\b/i.test(prompt)) return [{ name: "read_file", arguments: { path: "README.md" } }];
  if (/\bask for a secret\b/i.test(prompt))
    return [
      {
        name: "request_secret",
        arguments: { name: "STRIPE_KEY", reason: "to create the webhook" },
      },
    ];
  const fact = /\bremember that (.+)$/i.exec(prompt);
  if (fact) return [{ name: "remember", arguments: { text: String(fact[1]).trim() } }];
  const tool = toolFor(prompt);
  return tool ? [tool] : [];
}

/** The tool call a prompt asks for, if any. */
/** @param {string} prompt @returns {ToolCall | undefined} */
export function toolFor(prompt) {
  if (/\btypo\b/i.test(prompt))
    return {
      name: "edit_file",
      arguments: { path: "README.md", old_string: "Teh", new_string: "The" },
    };
  if (/\bskill\b/i.test(prompt)) {
    return {
      name: "write_file",
      arguments: {
        path: ".agent86/skills/demo/SKILL.md",
        content: "---\nname: demo\ndescription: A demo skill.\n---\nSay hi.\n",
      },
    };
  }
  if (/\bwrite\b/i.test(prompt))
    return {
      name: "write_file",
      arguments: { path: "notes.txt", content: "first line\nsecond line\n" },
    };
  if (/\bcommand\b/i.test(prompt))
    return { name: "run_command", arguments: { command: "echo hello-from-agent86" } };
  if (/\bpython\b/i.test(prompt))
    return { name: "python_exec", arguments: { code: "print(6 * 7)" } };
  if (/\bread\b/i.test(prompt)) return { name: "read_file", arguments: { path: "README.md" } };
  if (/\bsearch\b/i.test(prompt))
    return { name: "search_files", arguments: { pattern: "quick", path: "." } };
  if (/\bfind\b/i.test(prompt)) return { name: "find_files", arguments: { pattern: "*.md" } };
  return undefined;
}

/**
 * The pieces of one streamed reply.
 * @param {string} prompt
 * @param {string} [model]
 * @returns {{ reasoning: string[]; content: string[]; delayMs: number }}
 */
export function script(prompt, model = "test-model") {
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
  // A model other than the default says which it is, so a test can see a switch take effect.
  const who = model === "test-model" ? "" : `[${model}] `;
  const reply = `${who}Hello from the mock model. You said: ${prompt}`;
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
      res.end(
        JSON.stringify({
          object: "list",
          data: [
            { id: "test-model", object: "model" },
            { id: "cheap-model", object: "model" },
          ],
        }),
      );
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

    // After a tool ran, agent86 sends its result back: answer with it, so a test can see it.
    const last = messages.at(-1);
    const tools = last?.role === "user" ? toolsFor(prompt) : [];
    const first = textOf(users[0]?.content).trim();
    const { reasoning, content, delayMs } =
      last?.role === "tool" && /\bcrash\b/i.test(prompt)
        ? // Slow, so a test can stop agent86 partway through this second step.
          script("slow")
        : last?.role === "tool"
          ? {
              reasoning: ["The", " tool", " finished."],
              content: [`Tool result: ${textOf(last.content).slice(0, 300)}`],
              delayMs: 5,
            }
          : tools.length
            ? {
                reasoning: ["I", " will", " use", ` ${tools.map((t) => t.name).join(", ")}.`],
                content: [],
                delayMs: 5,
              }
            : /^Continue where you left off/i.test(prompt)
              ? {
                  reasoning: ["Picking", " up."],
                  content: [
                    `Continuing from "${first}"`,
                    messages.some((m) => m.role === "tool")
                      ? " with the earlier tool result in view."
                      : " with no earlier tool result.",
                  ],
                  delayMs: 5,
                }
              : script(prompt, String(request.model ?? "test-model"));
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
    if (tools.length) {
      send({
        tool_calls: tools.map((tool, index) => ({
          index,
          id: `call_${Date.now()}_${index}`,
          type: "function",
          function: { name: tool.name, arguments: JSON.stringify(tool.arguments) },
        })),
      });
      send({}, "tool_calls");
    } else {
      send({}, "stop");
    }
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
