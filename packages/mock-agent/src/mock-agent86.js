#!/usr/bin/env node
// A stand-in for the `agent86` binary, for agent86-web's tests.
//
//   mock-agent86 --version     prints "agent86 <version>", as agent86 does
//   mock-agent86 [...] acp     speaks ACP v1 on stdio, answering like agent86 1.0.15 (or 1.0.17, with
//                              MOCK_AGENT86_VERSION=1.0.17: /rename, per-directory lists)
//
// Environment:
//   MOCK_AGENT86_VERSION   the version to report (default 1.0.15)
//   MOCK_AGENT86_NAME      the agentInfo name to report (default agent86)
//   MOCK_AGENT86_RECORD    a file to append every received message to, one JSON per line
//   MOCK_AGENT86_DB        the JSON file sessions are kept in (default: one in the temp directory),
//                          so a later process can list and reload them, as agent86's database allows
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable, Writable } from "node:stream";
import { agent, methods, ndJsonStream, RequestError } from "@agentclientprotocol/sdk";
import { script, toolFor } from "./mock-openai.js";

const version = process.env.MOCK_AGENT86_VERSION ?? "1.0.15";
const name = process.env.MOCK_AGENT86_NAME ?? "agent86";
/** agent86 1.0.17 added `/rename` and stopped listing sessions of unknown directory under every one. */
const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
const v1017 = major > 1 || (major === 1 && (minor > 0 || patch >= 17));
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

// The project file's MCP servers, which agent86 starts only when the file is trusted. Like
// agent86, say which settings were ignored, and leave the servers' tools out.
const trusted = args.includes("--trust-project");
/** @type {string[]} */
const mcpServers = [];
/** @type {string[]} */
const untrustedKeys = [];
try {
  const projectConfig = readFileSync(join(process.cwd(), ".agent86", "config.toml"), "utf8");
  let section = "";
  for (const raw of projectConfig.split("\n")) {
    const line = raw.trim();
    const header = /^\[mcp\.servers\.([\w-]+)\]$/.exec(line);
    if (header) {
      section = header[1] ?? "";
      mcpServers.push(section);
      continue;
    }
    if (line.startsWith("[")) section = "";
    const key = /^([\w-]+)\s*=/.exec(line)?.[1];
    if (section && key) untrustedKeys.push(`mcp_servers.${section}.${key}`);
  }
} catch {
  // No project file.
}
if (!trusted && untrustedKeys.length > 0) {
  const count = untrustedKeys.length;
  process.stderr.write(
    `project config: ignored ${count} setting${count === 1 ? "" : "s"} that need${count === 1 ? "s" : ""} trust (${untrustedKeys.slice(0, 5).join(", ")}). ` +
      "Start agent86 at a terminal to review the file, or pass --trust-project (or set AGENT86_TRUST_PROJECT=1).\n",
  );
}
const TOOLS = [
  "delegate",
  "edit_file",
  "list_dir",
  ...(trusted ? mcpServers.map((name) => `mcp__${name}__mock_echo`) : []),
  "python_exec",
  "read_file",
  "recall",
  "remember",
  "run_command",
  "web_fetch",
  "write_file",
].sort();

let nextCall = 1;

// Sessions, kept in a file like agent86's database, so another process can list and load them.
const DB = process.env.MOCK_AGENT86_DB ?? join(tmpdir(), "mock-agent86-sessions.json");
/**
 * @typedef {{ user: string; agent: string }} Turn
 * @typedef {{ cwd?: string; title?: string; updatedAt: string; mode: string; model: string; turns: Turn[] }} Saved
 */
/** @returns {Record<string, Saved>} */
function loadDb() {
  try {
    return JSON.parse(readFileSync(DB, "utf8"));
  } catch {
    return {};
  }
}
/** @param {string} id @param {(saved: Saved) => void} change */
function saveSession(id, change) {
  const db = loadDb();
  const saved = db[id] ?? {
    updatedAt: new Date().toISOString(),
    mode: "ask",
    model: DEFAULT_MODEL,
    turns: [],
  };
  change(saved);
  saved.updatedAt = new Date().toISOString();
  db[id] = saved;
  writeFileSync(DB, JSON.stringify(db, null, 2));
}

const DEFAULT_MODEL = "mock:test-model";
const MODELS = [DEFAULT_MODEL, "mock:cheap-model"];
/** Sessions this process has open, with their settings. */
const open = /** @type {Map<string, { mode: string; model: string }>} */ (new Map());

/** The slash commands agent86 offers over ACP. */
const COMMANDS = [
  {
    name: "mode",
    description: "Show or set the approval mode for this session",
    input: { hint: "ask, auto, or deny" },
  },
  {
    name: "model",
    description: "Show or switch the model for this session",
    input: { hint: "provider:model" },
  },
  { name: "cost", description: "Show what this session has cost" },
  { name: "tools", description: "List the tools the model can use" },
  ...(v1017
    ? [
        {
          name: "rename",
          description: "Name this session",
          input: { hint: "title" },
        },
      ]
    : []),
];

/** Tell the client which commands the session offers, as agent86 does after new and load. */
/** @param {import("@agentclientprotocol/sdk").AgentContext} client @param {string} sessionId */
function advertise(client, sessionId) {
  setTimeout(() => {
    void client.notify(methods.client.session.update, {
      sessionId,
      update: { sessionUpdate: "available_commands_update", availableCommands: COMMANDS },
    });
  }, 0);
}

/** The session's settings as agent86 offers them: the approval mode and the model, grouped. */
/** @param {{ mode: string; model: string }} settings */
function configOptions(settings) {
  return [
    {
      id: "mode",
      name: "Approval mode",
      category: "mode",
      type: /** @type {const} */ ("select"),
      currentValue: settings.mode,
      options: ["ask", "auto", "deny"].map((value) => ({ value, name: value })),
      description: "ask: confirm each change; auto: run without asking; deny: refuse changes",
    },
    {
      id: "model",
      name: "Model",
      category: "model",
      type: /** @type {const} */ ("select"),
      currentValue: settings.model,
      options: [
        {
          group: "configured",
          name: "Configured",
          options: MODELS.map((value) => ({ value, name: value })),
        },
      ],
    },
  ];
}

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
  .onRequest(methods.agent.session.new, ({ params, client }) => {
    remember("session/new", params);
    const sessionId = `mock-${randomBytes(4).toString("hex")}`;
    const settings = { mode: "ask", model: DEFAULT_MODEL };
    open.set(sessionId, settings);
    saveSession(sessionId, (saved) => (saved.cwd = params.cwd));
    advertise(client, sessionId);
    return { sessionId, configOptions: configOptions(settings) };
  })
  .onRequest(methods.agent.session.list, ({ params }) => {
    remember("session/list", params);
    const sessions = Object.entries(loadDb())
      // Like agent86 before 1.0.17, a session with no recorded directory is listed under this
      // one; from 1.0.17 it is left out of a filtered list.
      .filter(
        ([, saved]) =>
          saved.turns.length > 0 &&
          (!params.cwd || (saved.cwd ?? (v1017 ? undefined : process.cwd())) === params.cwd),
      )
      .sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))
      .map(([sessionId, saved]) => ({
        sessionId,
        cwd: saved.cwd ?? process.cwd(),
        updatedAt: saved.updatedAt,
        ...(saved.title ? { title: saved.title } : {}),
      }));
    return { sessions };
  })
  .onRequest(methods.agent.session.load, async ({ params, client }) => {
    remember("session/load", params);
    const saved = loadDb()[params.sessionId];
    if (!saved) throw new RequestError(-32002, `Unknown session: ${params.sessionId}`);
    const settings = { mode: saved.mode, model: saved.model };
    open.set(params.sessionId, settings);
    for (const turn of saved.turns) {
      for (const [sessionUpdate, text] of /** @type {const} */ ([
        ["user_message_chunk", turn.user],
        ["agent_message_chunk", turn.agent],
      ])) {
        await client.notify(methods.client.session.update, {
          sessionId: params.sessionId,
          update: { sessionUpdate, content: { type: "text", text } },
        });
      }
    }
    advertise(client, params.sessionId);
    return { configOptions: configOptions(settings) };
  })
  .onRequest(methods.agent.session.setConfigOption, ({ params }) => {
    remember("session/set_config_option", params);
    const settings = open.get(params.sessionId);
    if (!settings) throw new RequestError(-32602, `Unknown session: ${params.sessionId}`);
    const value = String(params.value);
    if (params.configId === "model") {
      if (!MODELS.includes(value))
        throw new RequestError(-32602, `'${value}' is not one of the listed models`);
      settings.model = value;
    } else if (params.configId === "mode") {
      if (!["ask", "auto", "deny"].includes(value))
        throw new RequestError(-32602, `'${value}' is not a mode`);
      settings.mode = value;
    } else {
      throw new RequestError(-32602, `Unknown option: ${params.configId}`);
    }
    saveSession(params.sessionId, (saved) => Object.assign(saved, settings));
    return { configOptions: configOptions(settings) };
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
    const settings = open.get(sessionId) ?? { mode: "ask", model: DEFAULT_MODEL };
    // A file link is shown to the model as "name (uri)", as agent86 does.
    const text = params.prompt
      .map((block) =>
        block.type === "text"
          ? block.text
          : block.type === "resource_link"
            ? `${block.name} (${block.uri})`
            : "",
      )
      .join("\n")
      .trim();
    let reply = "";
    /** @param {"agent_message_chunk" | "agent_thought_chunk"} kind @param {string} chunk */
    const say = (kind, chunk) => {
      if (kind === "agent_message_chunk") reply += chunk;
      return client.notify(methods.client.session.update, {
        sessionId,
        update: { sessionUpdate: kind, content: { type: "text", text: chunk } },
      });
    };
    /** Save the turn, as agent86 does whether the turn finished or not. @param {"end_turn" | "cancelled"} stopReason */
    const finish = (stopReason) => {
      saveSession(sessionId, (saved) => {
        saved.title ??= text.split("\n")[0]?.slice(0, 60);
        saved.turns.push({ user: text, agent: reply });
      });
      return { stopReason };
    };

    if (text === "/cost") {
      await say("agent_message_chunk", "steps 0  in 0  out 0 tok  cost n/a (unpriced model)");
      return { stopReason: "end_turn" };
    }
    const rename = v1017 ? /^\/rename(?:\s+([\s\S]*))?$/.exec(text) : null;
    if (rename) {
      // As agent86 1.0.17: answered without a turn, not saved in the conversation.
      const title = (rename[1] ?? "").split("\n")[0]?.trim().slice(0, 200) ?? "";
      if (!title) {
        await say(
          "agent_message_chunk",
          `session: ${loadDb()[sessionId]?.title ?? "(no name yet)"} (usage: /rename <title>)`,
        );
        return { stopReason: "end_turn" };
      }
      saveSession(sessionId, (saved) => (saved.title = title));
      await say("agent_message_chunk", `renamed session to: ${title}`);
      await client.notify(methods.client.session.update, {
        sessionId,
        update: { sessionUpdate: "session_info_update", title },
      });
      return { stopReason: "end_turn" };
    }
    if (text === "/tools") {
      await say("agent_message_chunk", `tools: ${TOOLS.join(", ")}`);
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
      const guarded = approval?.startsWith("Warning:") ?? false;
      if (approval !== undefined && settings.mode === "deny") {
        allowed = false;
      } else if (approval !== undefined && (settings.mode === "ask" || guarded)) {
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
      const outcome = allowed
        ? run()
        : {
            ok: false,
            text:
              settings.mode === "deny"
                ? "Not executed: blocked by approval policy (deny)."
                : "Not executed: declined by user.",
          };
      await client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: outcome.ok ? "completed" : "failed",
          content: [{ type: "content", content: { type: "text", text: outcome.text } }],
        },
      });
      if (cancelled.has(sessionId)) return finish("cancelled");
      await say("agent_message_chunk", `Tool result: ${outcome.text.slice(0, 300)}`);
      return finish("end_turn");
    }
    const { reasoning, content, delayMs } = script(text, settings.model.replace(/^mock:/, ""));
    for (const [kind, pieces] of /** @type {const} */ ([
      ["agent_thought_chunk", reasoning],
      ["agent_message_chunk", content],
    ])) {
      for (const piece of pieces) {
        if (cancelled.has(sessionId)) return finish("cancelled");
        await say(kind, piece);
        await sleep(delayMs);
      }
    }
    return finish(cancelled.has(sessionId) ? "cancelled" : "end_turn");
  });

const stream = ndJsonStream(
  /** @type {WritableStream<Uint8Array>} */ (Writable.toWeb(process.stdout)),
  /** @type {ReadableStream<Uint8Array>} */ (Readable.toWeb(process.stdin)),
);
const connection = app.connect(stream);
await connection.closed;
