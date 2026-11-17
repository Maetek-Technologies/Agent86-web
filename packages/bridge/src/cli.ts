#!/usr/bin/env node
// agent86-web: a browser interface for agent86. See docs/ARCHITECTURE.md §3.1.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Agent86Error, detectAgent86 } from "./agent86.ts";
import { parseDuration } from "./duration.ts";
import { portProblem, resolvePort, SettingsStore } from "./settings.ts";
import { updateCheckDisabled } from "./updates.ts";
import { BRIDGE_VERSION, startBridge } from "./server.ts";
import { realpath } from "./workspaces.ts";

const HELP = `agent86-web ${BRIDGE_VERSION}: a browser interface for agent86

Usage: agent86-web [options]

Options:
  --root <dir>         A directory threads may run in (repeatable; default: the current directory)
  --port <n>           Port to listen on (default: AGENT86_WEB_PORT, else the saved port,
                       else any free port; 0 means any free port)
  --save-port          Remember --port for every later start (--port 0 forgets it)
  --host <addr>        Loopback address to bind: 127.0.0.1 (default), ::1, or localhost
  --agent86 <path>     The agent86 command (default: agent86 on PATH)
  --agent-arg=<arg>    An argument for agent86, placed before \`acp\` (repeatable),
                       e.g. --agent-arg=--model --agent-arg=openrouter:<model>
  --no-open            Print the URL instead of opening the browser
  --max-agents <n>     The most agent86 processes running at once (default: 8)
  --idle-timeout <d>   Stop an agent86 with no tab and no turn after this long: 90s, 15m, 1h
                       (default: 15m)
  --no-update-check    Don't check npm for newer agent86 or agent86-web releases
                       (also AGENT86_WEB_NO_UPDATE_CHECK=1)
  --dev-origin <url>   Also allow this origin (the Vite dev server, for development)
  --static <dir>       Serve the web client from this directory
  -h, --help           Show this help
  -v, --version        Show the version
`;

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", '""', url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true, windowsHide: true });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // Opening the browser is a convenience; the URL is printed either way.
  }
}

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        root: { type: "string", multiple: true },
        port: { type: "string" },
        "save-port": { type: "boolean", default: false },
        host: { type: "string", default: "127.0.0.1" },
        agent86: { type: "string", default: "agent86" },
        "agent-arg": { type: "string", multiple: true },
        "no-open": { type: "boolean", default: false },
        "max-agents": { type: "string" },
        "idle-timeout": { type: "string" },
        "no-update-check": { type: "boolean", default: false },
        "dev-origin": { type: "string" },
        static: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (error) {
    process.stderr.write(`agent86-web: ${(error as Error).message}\n\n${HELP}`);
    return 2;
  }
  const { values } = parsed;
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (values.version) {
    process.stdout.write(`agent86-web ${BRIDGE_VERSION}\n`);
    return 0;
  }

  // The bridge's own state (settings, trusted projects); AGENT86_WEB_STATE_DIR moves it (tests).
  const stateDir = process.env.AGENT86_WEB_STATE_DIR || undefined;
  // Every relayed ACP message, for debugging (secret values hidden; docs/SECURITY.md T22).
  const transcript = process.env.AGENT86_WEB_TRANSCRIPT || undefined;
  const settings = new SettingsStore(stateDir);
  if (values["save-port"]) {
    if (values.port === undefined) {
      process.stderr.write("agent86-web: --save-port needs --port <n>\n");
      return 2;
    }
    const chosen = resolvePort(values.port, undefined, undefined);
    if ("error" in chosen) {
      process.stderr.write(`agent86-web: ${chosen.error}\n`);
      return 2;
    }
    try {
      settings.update({ port: chosen.port === 0 ? null : chosen.port });
    } catch (error) {
      process.stderr.write(
        `agent86-web: could not save the port in ${settings.file}: ${(error as Error).message}\n`,
      );
      return 1;
    }
    process.stdout.write(
      chosen.port === 0
        ? "Forgot the saved port; agent86-web will use any free port.\n"
        : `Saved port ${chosen.port} in ${settings.file}.\n`,
    );
  }
  const chosen = resolvePort(values.port, process.env.AGENT86_WEB_PORT, settings.read().port);
  if ("error" in chosen) {
    process.stderr.write(`agent86-web: ${chosen.error}\n`);
    return 2;
  }
  const { port, source } = chosen;

  const maxAgents = values["max-agents"] === undefined ? undefined : Number(values["max-agents"]);
  if (maxAgents !== undefined && (!Number.isInteger(maxAgents) || maxAgents < 1)) {
    process.stderr.write("agent86-web: --max-agents must be a whole number of at least 1\n");
    return 2;
  }
  const idleTimeoutMs =
    values["idle-timeout"] === undefined ? undefined : parseDuration(values["idle-timeout"]);
  if (idleTimeoutMs === null) {
    process.stderr.write("agent86-web: --idle-timeout must look like 90s, 15m, or 1h\n");
    return 2;
  }

  const roots: string[] = [];
  for (const root of values.root ?? [process.cwd()]) {
    try {
      roots.push(realpath(root));
    } catch {
      process.stderr.write(`agent86-web: --root ${root} does not exist\n`);
      return 2;
    }
  }

  let version: string;
  try {
    version = await detectAgent86(values.agent86);
  } catch (error) {
    if (error instanceof Agent86Error) {
      process.stderr.write(`agent86-web: ${error.message}\n`);
      return 1;
    }
    throw error;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const publicDir = values.static ?? join(here, "public");

  let stopRequested: () => void = () => undefined;
  const stopped = new Promise<"signal" | "browser">((resolve) => {
    process.once("SIGINT", () => resolve("signal"));
    process.once("SIGTERM", () => resolve("signal"));
    stopRequested = () => resolve("browser");
  });

  let bridge;
  try {
    bridge = await startBridge({
      roots,
      host: values.host,
      port,
      agent86: { command: values.agent86, version, args: values["agent-arg"] ?? [] },
      publicDir,
      stateDir,
      ...(transcript ? { transcript } : {}),
      devOrigin: values["dev-origin"],
      maxAgents,
      idleTimeoutMs,
      updateCheck: !values["no-update-check"] && !updateCheckDisabled() && !values["dev-origin"],
      onShutdownRequested: () => stopRequested(),
      log: (line) => process.stderr.write(`${line}\n`),
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EADDRINUSE" || code === "EACCES") {
      process.stderr.write(`agent86-web: ${portProblem(port, source, code, settings.file)}\n`);
      return 1;
    }
    throw error;
  }

  process.stdout.write(
    `agent86-web ${BRIDGE_VERSION} (agent86 ${version})\n` +
      `Workspaces: ${roots.join(", ")}\n` +
      `Open: ${bridge.url}\n` +
      `The link works once and expires in 5 minutes. Press Ctrl+C (or Quit in the page) to stop.\n`,
  );
  if (!values["no-open"]) openBrowser(bridge.url);

  if ((await stopped) === "browser") process.stdout.write("Stopped from the browser.\n");
  await bridge.close();
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `agent86-web: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  },
);
