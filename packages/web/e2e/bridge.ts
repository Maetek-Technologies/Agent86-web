// Starts the built bridge (packages/bridge/dist) for an end-to-end test.
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../bridge/dist/cli.js", import.meta.url));
const MOCK = fileURLToPath(new URL("../../mock-agent/src/mock-agent86.js", import.meta.url));

export interface Bridge {
  url: string;
  origin: string;
  workspace: string;
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
): Promise<Bridge> {
  const workspace = realpathSync.native(mkdtempSync(join(tmpdir(), "agent86-web-e2e-ws-")));
  mkdirSync(join(workspace, "project"));
  const child: ChildProcess = spawn(
    process.execPath,
    [CLI, "--root", workspace, "--agent86", agent86, "--no-open"],
    { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] },
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
    stderr: () => stderr,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      }),
  };
}
