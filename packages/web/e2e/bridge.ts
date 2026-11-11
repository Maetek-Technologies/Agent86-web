// Starts the built bridge (packages/bridge/dist) for an end-to-end test.
import { spawn, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../bridge/dist/cli.js", import.meta.url));
const MOCK = fileURLToPath(new URL("../../mock-agent/src/mock-agent86.js", import.meta.url));
const MOCK_OPENAI = new URL("../../mock-agent/src/mock-openai.js", import.meta.url).href;

export interface Bridge {
  url: string;
  origin: string;
  workspace: string;
  /** The mock agent's session store for this bridge. */
  db: string;
  /** The environment agent86 runs with (for running `agent86 run` at a "terminal" in tests). */
  env: Record<string, string>;
  /** What the mock agent received, if MOCK_AGENT86_RECORD was set. */
  recorded: () => { method: string; params: Record<string, unknown> }[];
  stderr: () => string;
  stop: () => Promise<void>;
}

/** A single-executable command that runs the mock agent, as `agent86` would be run. */
export function mockAgent86(): string {
  const dir = mkdtempSync(join(tmpdir(), "agent86-web-e2e-mock-"));
  if (process.platform === "win32") {
    const command = join(dir, "agent86.cmd");
    writeFileSync(command, `@"${process.execPath}" "${MOCK}" %*\r\n`);
    return command;
  }
  const command = join(dir, "agent86");
  writeFileSync(command, `#!/bin/sh\nexec "${process.execPath}" "${MOCK}" "$@"\n`);
  chmodSync(command, 0o755);
  return command;
}

export async function startBridge(
  agent86: string,
  env: Record<string, string> = {},
  extraArgs: string[] = [],
): Promise<Bridge> {
  const workspace = realpathSync.native(mkdtempSync(join(tmpdir(), "agent86-web-e2e-ws-")));
  mkdirSync(join(workspace, "project"));
  // Each bridge gets its own mock session store, so tests do not see each other's sessions.
  const db = join(mkdtempSync(join(tmpdir(), "agent86-web-e2e-db-")), "sessions.json");
  const child: ChildProcess = spawn(
    process.execPath,
    [CLI, "--root", workspace, "--agent86", agent86, "--no-open", ...extraArgs],
    { env: { ...process.env, MOCK_AGENT86_DB: db, ...env }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`bridge did not start:\n${stdout}\n${stderr}`)),
      20_000,
    );
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
      const match = /Open: (\S+)/.exec(stdout);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`bridge exited with ${code}:\n${stdout}\n${stderr}`));
    });
  });
  return {
    url,
    origin: new URL(url).origin,
    workspace,
    db,
    env: { MOCK_AGENT86_DB: db, ...env },
    recorded: () => {
      const file = env.MOCK_AGENT86_RECORD;
      if (!file) return [];
      try {
        return readFileSync(file, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { method: string; params: Record<string, unknown> });
      } catch {
        return [];
      }
    },
    stderr: () => stderr,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      }),
  };
}

/** A file for the mock agent to record what it receives. */
export function recordFile(): string {
  return join(mkdtempSync(join(tmpdir(), "agent86-web-e2e-rec-")), "record.jsonl");
}

/**
 * For the real agent86: a scripted OpenAI-compatible server (packages/mock-agent/src/mock-openai.js)
 * and a home directory whose agent86 config points at it, so a turn needs no key or network.
 */
export async function scriptedModel(
  options: { config?: string } = {},
): Promise<{ env: Record<string, string>; stop: () => Promise<void> }> {
  const { createMockOpenAI } = (await import(MOCK_OPENAI)) as {
    createMockOpenAI: () => import("node:http").Server;
  };
  const server = createMockOpenAI();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const home = realpathSync.native(mkdtempSync(join(tmpdir(), "agent86-web-e2e-home-")));
  mkdirSync(join(home, ".agent86"));
  writeFileSync(
    join(home, ".agent86", "config.toml"),
    options.config ??
      [
        "[model]",
        'default = "mock:test-model"',
        "",
        // A second configured model, so the picker can switch to it.
        "[model.route]",
        'cheap = "mock:cheap-model"',
        "",
        "[providers.mock]",
        `base_url = "http://127.0.0.1:${port}/v1"`,
        "",
        "[memory]",
        'embeddings = "hash:384"',
        "",
      ].join("\n"),
  );
  return {
    env: { HOME: home, USERPROFILE: home },
    // agent86 keeps its connection to the model open; close it, or close() waits for it.
    stop: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

/** Open the page and start a thread in the default workspace from the home screen. */
export async function openThread(
  page: import("@playwright/test").Page,
  url: string,
): Promise<void> {
  await page.goto(url);
  await page
    .getByRole("main")
    .getByRole("button", { name: /^New thread in / })
    .click();
  await page.getByRole("textbox", { name: "Message agent86" }).waitFor();
}
