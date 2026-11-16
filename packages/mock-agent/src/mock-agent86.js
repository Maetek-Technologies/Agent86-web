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
//
// As 1.0.21 (MOCK_AGENT86_VERSION=1.0.21): `session/resume`, the questions queue and who asks on a
// sub-agent's permission request (to a client that asks for the state events), and a turn saved
// after every step. The prompt "parallel writers" delegates to two `writer` sub-agents whose
// approvals queue up; "crash" runs a read_file step, then exits partway through the next one;
// "exit after replying" answers, then exits while idle.
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
/** @param {number} at */
const since = (at) => major > 1 || (major === 1 && (minor > 0 || patch >= at));
const v1017 = since(17);
/** agent86 1.0.19 sends file changes as ACP `diff` content, `locations`, and the `search` kind. */
const v1019 = since(19);
/**
 * agent86 1.0.20 sends `usage_update`, `compaction_update` to a client that advertises
 * `session.compaction`, and its state events to a client that asks (`_meta`).
 */
const v1020 = since(20);
/**
 * agent86 1.0.21: `session/resume`, the questions queue and who asks (state clients only), and a
 * session saved after every step, so a turn cut off partway keeps the steps it finished.
 */
const v1021 = since(21);
const STATE = "com.maetek.agent86/state";
/** Dollars per call for the priced model; `mock:cheap-model` has no price, as unknown models do. */
const CALL_COST = 0.0125;
/** `[limits] max_cost_usd`, as MOCK_AGENT86_COST_CAP (none by default). */
const COST_CAP = process.env.MOCK_AGENT86_COST_CAP
  ? Number(process.env.MOCK_AGENT86_COST_CAP)
  : null;
/** What the client asked for in `initialize`. */
const wants = { compaction: false, state: false };
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
/**
 * Tool call ids are unique within a session, even across processes (agent86 keeps a resumed
 * session's ids reserved), so each process numbers its calls under its own tag.
 */
const callTag = randomBytes(2).toString("hex");
const newCallId = () => `call_${callTag}_${nextCall++}`;

// Sessions, kept in a file like agent86's database, so another process can list and load them.
const DB = process.env.MOCK_AGENT86_DB ?? join(tmpdir(), "mock-agent86-sessions.json");
/**
 * @typedef {{ id: string; title: string; kind: string; output: string }} SavedTool
 * @typedef {{ user: string; agent: string; tools?: SavedTool[] }} Turn
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
/** agent86's starting settings: `--approval <mode>` (before `acp`), else ask. */
function defaultSettings() {
  const at = args.indexOf("--approval");
  const mode =
    at >= 0 && ["ask", "auto", "deny"].includes(args[at + 1] ?? "") ? args[at + 1] : "ask";
  return { mode: /** @type {string} */ (mode), model: DEFAULT_MODEL };
}
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
      const line = before.slice(0, before.indexOf(args.old_string)).split("\n").length;
      const diff = before
        .split("\n")
        .map((line, i) => [line, after.split("\n")[i]])
        .filter(([a, b]) => a !== b)
        .map(([a, b]) => `-${a}\n+${b}`)
        .join("\n");
      const text = `--- a/${args.path}\n+++ b/${args.path}\n@@ -1 +1 @@\n${diff}`;
      return {
        approval: text,
        diff: { path, oldText: before, newText: after },
        line,
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
      const old = existsSync(path) ? readFileSync(path, "utf8") : null;
      return {
        diff: { path, oldText: old, newText: String(args.content) },
        line: 1,
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
    case "search_files":
      return {
        approval: undefined,
        run: () => ({ ok: true, text: "README.md:1: The quick brown fox" }),
      };
    case "find_files":
      return { approval: undefined, run: () => ({ ok: true, text: "README.md" }) };
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
  ...(v1019 ? { search_files: "search", find_files: "search" } : {}),
});
/** The file tools carry `locations` from 1.0.19. */
const FILE_TOOLS = new Set(["read_file", "write_file", "edit_file"]);
/** What each session has cost so far, for `usage_update`; undefined once a call was unpriced. */
const spent = /** @type {Map<string, number | undefined>} */ (new Map());
/** The turn's spend, for the state events. */
const turnSpent = /** @type {Map<string, number>} */ (new Map());
/** Sessions whose running turn was asked to stop. */
const cancelled = new Set();
/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const app = agent({ name: "mock-agent86" })
  .onRequest(methods.agent.initialize, ({ params }) => {
    remember("initialize", params);
    const caps = /** @type {any} */ (params.clientCapabilities ?? {});
    wants.compaction = v1020 && !!caps.session?.compaction;
    wants.state = v1020 && !!caps._meta?.[STATE];
    return {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: { list: {}, ...(v1021 ? { resume: {} } : {}) },
        promptCapabilities: { image: false, audio: false, embeddedContext: false },
        mcpCapabilities: { http: true, sse: true },
        ...(v1020 ? { _meta: { [STATE]: { version: 1 } } } : {}),
      },
      agentInfo: { name, title: name, version },
      authMethods: [],
    };
  })
  .onRequest(methods.agent.session.new, ({ params, client }) => {
    remember("session/new", params);
    const sessionId = `mock-${randomBytes(4).toString("hex")}`;
    const settings = defaultSettings();
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
    // Like agent86 (checked against 1.0.18): a reopened session starts from the defaults, not the
    // mode and model it last had.
    const settings = defaultSettings();
    open.set(params.sessionId, settings);
    for (const turn of saved.turns) {
      await client.notify(methods.client.session.update, {
        sessionId: params.sessionId,
        update: { sessionUpdate: "user_message_chunk", content: { type: "text", text: turn.user } },
      });
      // Replayed calls come as text, as agent86 replays them.
      for (const tool of turn.tools ?? []) {
        await client.notify(methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: tool.id,
            title: tool.title,
            kind: /** @type {any} */ (tool.kind),
            status: "pending",
          },
        });
        await client.notify(methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: tool.id,
            status: "completed",
            content: [{ type: "content", content: { type: "text", text: tool.output } }],
          },
        });
      }
      if (turn.agent) {
        await client.notify(methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: turn.agent },
          },
        });
      }
    }
    advertise(client, params.sessionId);
    return { configOptions: configOptions(settings) };
  })
  // As agent86 1.0.21: the session reopened without a replay, then the commands, as after a load.
  .onRequest(methods.agent.session.resume, ({ params, client }) => {
    remember("session/resume", params);
    if (!v1021) throw new RequestError(-32601, `Method not found: session/resume`);
    if (!loadDb()[params.sessionId])
      throw new RequestError(-32002, `Session not found: ${params.sessionId}`);
    const settings = defaultSettings();
    open.set(params.sessionId, settings);
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
    turnSpent.set(sessionId, 0);
    let step = 0;
    /** @param {Record<string, unknown>} event */
    const emit = (event) =>
      wants.state
        ? client.notify("_com.maetek.agent86/session/event", {
            sessionId,
            event: { ts: Date.now() / 1000, ...event },
          })
        : Promise.resolve();
    /**
     * One model call, as agent86 1.0.20 reports it: `usage_update` to everyone, and the state
     * event to a client that asked. `sub` makes it a sub-agent's call on that card.
     * @param {string[]} toolCalls @param {{ card: string; agent: string; run: number }} [sub]
     */
    const modelCall = async (toolCalls, sub) => {
      if (!v1020) return 0;
      step += 1;
      const priced = settings.model === DEFAULT_MODEL;
      const cost = priced ? CALL_COST : undefined;
      const before = spent.has(sessionId) ? spent.get(sessionId) : 0;
      const total = before === undefined || cost === undefined ? undefined : before + cost;
      spent.set(sessionId, total);
      const turn = (turnSpent.get(sessionId) ?? 0) + (cost ?? 0);
      turnSpent.set(sessionId, turn);
      await client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "usage_update",
          used: 1200 * step,
          size: 200000,
          ...(total !== undefined ? { cost: { amount: total, currency: "USD" } } : {}),
        },
      });
      await emit({
        kind: "model_call",
        step,
        model: settings.model.replace(/^mock:/, ""),
        input_tokens: 1000,
        output_tokens: 200,
        cost_usd: cost ?? 0,
        stop_reason: toolCalls.length ? "tool_use" : "end_turn",
        tool_calls: toolCalls,
        priced,
        turn_cost_usd: turn,
        cost_cap_usd: COST_CAP,
        some_future_field: { ignored: true },
        ...(sub ? { agent: sub.agent, depth: 1, run: sub.run, card: sub.card } : {}),
      });
      return cost ?? 0;
    };

    /** This turn's finished calls, saved with it. @type {SavedTool[]} */
    const savedTools = [];
    let turnSaved = false;
    /** Save the turn so far, replacing what an earlier step saved of it. */
    const saveTurn = () =>
      saveSession(sessionId, (saved) => {
        saved.title ??= text.split("\n")[0]?.slice(0, 60);
        if (turnSaved) saved.turns.pop();
        saved.turns.push({
          user: text,
          agent: reply,
          ...(savedTools.length ? { tools: savedTools } : {}),
        });
        turnSaved = true;
      });
    /** Save the turn, as agent86 does whether the turn finished or not. @param {"end_turn" | "cancelled"} stopReason */
    const finish = (stopReason) => {
      saveTurn();
      return { stopReason };
    };

    /** @param {Record<string, unknown>} update */
    const notify = (update) =>
      client.notify(methods.client.session.update, {
        sessionId,
        update: /** @type {any} */ (update),
      });

    /**
     * Two `writer` sub-agents delegated in one step, each asking to write a file, as agent86 1.0.21
     * sends it (checked against a recording): the questions are asked one at a time, in arrival
     * order; a state client gets each change of the queue (the first before its call's card, the
     * next straight after an answer) and, on each request, who asks. Cancelling declines what
     * waits without asking it.
     */
    const parallelWriters = async () => {
      await say("agent_thought_chunk", "I will use delegate, delegate.");
      await modelCall(["delegate", "delegate"]);
      const writers = ["one", "two"].map((name, i) => {
        const card = newCallId();
        return {
          name,
          run: i + 1,
          card,
          call: `${card}/1`,
          task: `writer-task-${name}: write the file`,
          args: { path: `${name}.txt`, content: `written by ${name}\n` },
          // The first works in a git worktree, so its approval says so.
          worktree:
            i === 0
              ? {
                  path: join(process.cwd(), ".agent86", "worktrees", "writer-1"),
                  branch: "agent86/writer-1",
                }
              : null,
          spent: 0,
          output: "",
        };
      });
      for (const w of writers) {
        await notify({
          sessionUpdate: "tool_call",
          toolCallId: w.card,
          title: `writer: ${w.task}`,
          name: "delegate",
          kind: "other",
          status: "pending",
          rawInput: { agent: "writer", task: w.task },
        });
      }
      for (const w of writers) {
        await notify({
          sessionUpdate: "tool_call_update",
          toolCallId: w.card,
          status: "in_progress",
          content: [{ type: "content", content: { type: "text", text: "writer started" } }],
        });
        await emit({
          kind: "subagent",
          phase: "started",
          card: w.card,
          run: w.run,
          agent: "writer",
          depth: 1,
          task: w.task,
        });
      }
      for (const w of writers)
        w.spent += await modelCall(["write_file"], { card: w.card, agent: "writer", run: w.run });

      /** @param {(typeof writers)[number]} w */
      const question = (w) => ({
        kind: "approval",
        tool: "write_file",
        call: w.call,
        agent: "writer",
        card: w.card,
      });
      const asking = settings.mode === "ask";
      /** @param {(typeof writers)[number] | null} now @param {typeof writers} behind */
      const queue = (now, behind) =>
        v1021 && asking
          ? emit({
              kind: "questions",
              asking: now ? question(now) : null,
              waiting: behind.map(question),
            })
          : Promise.resolve();

      for (const [i, w] of writers.entries()) {
        const behind = writers.slice(i + 1);
        if (i === 0) await queue(w, []);
        const title = `[writer] write_file(${JSON.stringify(w.args)})`;
        const file = join(process.cwd(), w.args.path);
        await notify({
          sessionUpdate: "tool_call",
          toolCallId: w.call,
          title,
          name: "write_file",
          kind: "edit",
          status: "pending",
          rawInput: w.args,
          ...(v1019 ? { locations: [{ path: file, line: 1 }] } : {}),
        });
        await queue(w, behind);
        const { approval, diff, run } = describe({ name: "write_file", arguments: w.args });
        let allowed = settings.mode === "auto";
        if (asking) {
          /** @type {import("@agentclientprotocol/sdk").RequestPermissionResponse} */
          const answer = await client.request(methods.client.session.requestPermission, {
            sessionId,
            toolCall: {
              toolCallId: w.call,
              title,
              kind: "edit",
              status: "pending",
              rawInput: w.args,
              content: [
                ...(v1019 && diff ? [{ type: /** @type {const} */ ("diff"), ...diff }] : []),
                {
                  type: "content",
                  content: {
                    type: "text",
                    text: `Warning: Asked by the 'writer' sub-agent.\n\n${approval}`,
                  },
                },
              ],
              ...(v1019 ? { locations: [{ path: file, line: 1 }] } : {}),
            },
            options: [
              { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
              { optionId: "reject-once", name: "Reject", kind: "reject_once" },
            ],
            ...(v1021 && wants.state
              ? {
                  _meta: {
                    "com.maetek.agent86/subagent": {
                      card: w.card,
                      run: w.run,
                      agent: "writer",
                      depth: 1,
                      worktree: w.worktree,
                      steps: 1,
                      cost_usd: w.spent,
                      turn_cost_usd: turnSpent.get(sessionId) ?? 0,
                      cost_cap_usd: COST_CAP,
                    },
                  },
                }
              : {}),
          });
          remember("permission answer", answer);
          allowed =
            answer.outcome.outcome === "selected" && answer.outcome.optionId === "allow-once";
        }
        const outcome = allowed ? run() : { ok: false, text: "Not executed: declined by user." };
        w.output = outcome.text;
        await notify({
          sessionUpdate: "tool_call_update",
          toolCallId: w.call,
          status: outcome.ok ? "completed" : "failed",
          content: [{ type: "content", content: { type: "text", text: outcome.text } }],
        });
        if (cancelled.has(sessionId)) {
          // What waits is declined without being asked; the queue ends empty.
          await queue(null, []);
          for (const other of writers) {
            await emit({
              kind: "subagent",
              phase: "finished",
              card: other.card,
              run: other.run,
              agent: "writer",
              depth: 1,
              ok: true,
            });
            await notify({
              sessionUpdate: "tool_call_update",
              toolCallId: other.card,
              status: "completed",
              content: [
                {
                  type: "content",
                  content: { type: "text", text: "[sub-agent 'writer' cancelled]" },
                },
              ],
            });
          }
          return finish("cancelled");
        }
      }
      await queue(null, []);
      for (const w of writers) {
        w.spent += await modelCall([], { card: w.card, agent: "writer", run: w.run });
        await emit({
          kind: "subagent",
          phase: "finished",
          card: w.card,
          run: w.run,
          agent: "writer",
          depth: 1,
          ok: true,
          input_tokens: 2000,
          output_tokens: 400,
          cost_usd: w.spent,
        });
        await notify({
          sessionUpdate: "tool_call_update",
          toolCallId: w.card,
          status: "completed",
          content: [
            { type: "content", content: { type: "text", text: `Tool result: ${w.output}` } },
          ],
        });
      }
      await modelCall([]);
      await say("agent_message_chunk", "Both writers are done.");
      return finish("end_turn");
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
    if (v1020 && /\bcompact\b/i.test(text)) {
      // As agent86 1.0.20: a compaction is a `compaction_update` for a client that advertised
      // `session.compaction`, else one ordinary message.
      await modelCall([]);
      const failed = /\bfail/i.test(text);
      const summary = "Summary: the user fixed a typo in README.md and asked for notes.";
      if (wants.compaction) {
        await client.notify(methods.client.session.update, {
          sessionId,
          update: failed
            ? {
                sessionUpdate: "compaction_update",
                compactionId: `cmp-${nextCall}`,
                status: "failed",
                error: "the summary request failed: HTTP 500",
              }
            : {
                sessionUpdate: "compaction_update",
                compactionId: `cmp-${nextCall}`,
                status: "completed",
                summary: [{ type: "text", text: summary }],
              },
        });
        nextCall++;
      } else {
        await say(
          "agent_message_chunk",
          failed ? "Compaction failed." : `Context compacted. ${summary}`,
        );
      }
      return finish("end_turn");
    }
    const delegate = /^\/agent\s+(\S+)\s+([\s\S]+)$/.exec(text);
    if (delegate) {
      // As agent86: a delegation is one card; 1.0.20 reports the sub-agent in its state events.
      const agentName = String(delegate[1]);
      const task = String(delegate[2]);
      const card = `agent-${agentName}-${nextCall++}`;
      const run = nextCall;
      await client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: card,
          title: `${agentName}: ${task}`,
          name: "agent",
          kind: "other",
          status: "pending",
          rawInput: { agent: agentName, task },
        },
      });
      await client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: card,
          status: "in_progress",
          content: [{ type: "content", content: { type: "text", text: `${agentName} started` } }],
        },
      });
      await emit({
        kind: "subagent",
        phase: "started",
        card,
        run,
        agent: agentName,
        depth: 1,
        task,
      });
      await modelCall([], { card, agent: agentName, run });
      await modelCall([], { card, agent: agentName, run });
      const priced = settings.model === DEFAULT_MODEL;
      await emit({
        kind: "subagent",
        phase: "finished",
        card,
        run,
        agent: agentName,
        depth: 1,
        ok: true,
        input_tokens: 2000,
        output_tokens: 400,
        cost_usd: priced ? 2 * CALL_COST : 0,
      });
      await client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: card,
          status: "completed",
          content: [
            { type: "content", content: { type: "text", text: `${agentName}: done (${task})` } },
          ],
        },
      });
      return finish("end_turn");
    }
    if (/^Continue where you left off/i.test(text)) {
      // As the scripted model: what it sees of the earlier turns.
      const earlier = loadDb()[sessionId]?.turns ?? [];
      await modelCall([]);
      await say(
        "agent_message_chunk",
        `Continuing from "${earlier[0]?.user ?? ""}"` +
          (earlier.some((t) => t.tools?.length)
            ? " with the earlier tool result in view."
            : " with no earlier tool result."),
      );
      return finish("end_turn");
    }
    if (/\bcrash\b/i.test(text)) {
      // A read_file step that finishes, then agent86 dies partway through the next. From 1.0.21
      // the finished step is saved; before, nothing of the turn is.
      const toolCallId = newCallId();
      const title = `read_file({"path": "README.md"})`;
      await say("agent_thought_chunk", "I will use read_file.");
      await modelCall(["read_file"]);
      await client.notify(methods.client.session.update, {
        sessionId,
        update: { sessionUpdate: "tool_call", toolCallId, title, kind: "read", status: "pending" },
      });
      const output = describe({ name: "read_file", arguments: { path: "README.md" } }).run().text;
      await client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: "completed",
          content: [{ type: "content", content: { type: "text", text: output } }],
        },
      });
      savedTools.push({ id: toolCallId, title, kind: "read", output });
      if (v1021) saveTurn();
      await say("agent_thought_chunk", "Taking my time.");
      for (const word of ["Halfway", " through", " the", " answer"]) {
        await say("agent_message_chunk", word);
        await sleep(20);
      }
      process.stderr.write("mock-agent86: crashing partway through the turn\n");
      setTimeout(() => process.exit(70), 50);
      return new Promise(() => undefined);
    }
    if (/\bparallel writers\b/i.test(text)) return parallelWriters();
    if (/ignore all previous instructions/i.test(text)) {
      await emit({
        kind: "guardrail",
        stage: "ingress_input",
        findings: "injection:override-instructions, injection:prompt-extraction",
      });
    }
    if (/\broute\b/i.test(text)) await emit({ kind: "route", model: "mock:cheap-model" });
    await emit({ kind: "a_kind_from_the_future", detail: 1 });
    if (/fail/i.test(text)) {
      // agent86 sends a model failure as a bare -32603 with the provider's message.
      throw new RequestError(
        -32603,
        'HTTP 400: {"error":{"message":"The mock model refuses: you asked it to fail."}}',
      );
    }
    const tool = toolFor(text);
    if (tool) {
      const toolCallId = newCallId();
      const title = `${tool.name}(${JSON.stringify(tool.arguments)})`;
      const kind = KINDS[/** @type {keyof typeof KINDS} */ (tool.name)] ?? "other";
      await say("agent_thought_chunk", `I will use ${tool.name}.`);
      await modelCall([tool.name]);
      const { approval, run, diff, line } = describe(tool);
      const file =
        v1019 && FILE_TOOLS.has(tool.name) && typeof tool.arguments.path === "string"
          ? join(process.cwd(), tool.arguments.path)
          : undefined;
      await client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId,
          title,
          kind,
          status: "pending",
          rawInput: tool.arguments,
          ...(file ? { locations: [{ path: file }] } : {}),
        },
      });
      /** As agent86 1.0.19: a write's change as `diff` content, ahead of the same text. */
      const diffItems = v1019 && diff ? [{ type: "diff", ...diff }] : [];
      const located = file ? { locations: [{ path: file, ...(line ? { line } : {}) }] } : {};
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
            content: [...diffItems, { type: "content", content: { type: "text", text: approval } }],
            ...(diff ? located : {}),
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
          content: [
            ...(outcome.ok ? diffItems : []),
            { type: "content", content: { type: "text", text: outcome.text } },
          ],
          ...(outcome.ok && diff ? located : {}),
        },
      });
      if (cancelled.has(sessionId)) return finish("cancelled");
      await modelCall([]);
      await say("agent_message_chunk", `Tool result: ${outcome.text.slice(0, 300)}`);
      return finish("end_turn");
    }
    await modelCall([]);
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
    // "exit after replying": the process ends once the turn is answered, as if agent86 were
    // stopped while idle, so a test can see the thread reconnect.
    if (/\bexit after replying\b/i.test(text)) setTimeout(() => process.exit(0), 100);
    return finish(cancelled.has(sessionId) ? "cancelled" : "end_turn");
  });

const stream = ndJsonStream(
  /** @type {WritableStream<Uint8Array>} */ (Writable.toWeb(process.stdout)),
  /** @type {ReadableStream<Uint8Array>} */ (Readable.toWeb(process.stdin)),
);
const connection = app.connect(stream);
await connection.closed;
