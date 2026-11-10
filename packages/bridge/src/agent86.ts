// Finding agent86 and checking its version. The bridge talks to agent86 only through
// `agent86 --version` and `agent86 acp` (docs/adr/0003-standalone-bridge.md).
import { spawn } from "node:child_process";

export const MIN_AGENT86_VERSION = "1.0.15";

/**
 * npm installs `agent86` as a `.cmd` shim on Windows, which only a shell can start (Node refuses
 * to spawn a `.cmd` or `.bat` file directly). A bare name there may resolve to such a shim, so it
 * also goes through the shell. The shell joins the arguments, so on Windows an argument for
 * agent86 must not contain spaces.
 */
export function needsShell(command: string): boolean {
  if (process.platform !== "win32") return false;
  return /\.(cmd|bat)$/i.test(command) || !/[\\/]/.test(command);
}

export class Agent86Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Agent86Error";
  }
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .split(/[-+]/)[0]!
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

/** Parse `agent86 --version` output, e.g. `agent86 1.0.15`. */
export function parseVersion(output: string): string | undefined {
  return /\bagent86\s+v?(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/.exec(output)?.[1];
}

/** Run `<command> --version` and check it is an agent86 we support. */
export async function detectAgent86(command: string, timeoutMs = 15_000): Promise<string> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(command, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: needsShell(command),
      windowsHide: true,
    });
    let out = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (out += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (out += chunk));
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Agent86Error(`\`${command} --version\` did not answer within ${timeoutMs / 1000}s.`),
      );
    }, timeoutMs);
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        new Agent86Error(
          error.code === "ENOENT"
            ? `agent86 was not found (looked for \`${command}\`). Install it with: npm install -g agent86`
            : `Could not run \`${command}\`: ${error.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else
        reject(
          new Agent86Error(`\`${command} --version\` exited with status ${code}: ${out.trim()}`),
        );
    });
  });

  const version = parseVersion(output);
  if (!version) {
    throw new Agent86Error(
      `\`${command} --version\` printed ${JSON.stringify(output.trim())}, not an agent86 version.`,
    );
  }
  if (compareVersions(version, MIN_AGENT86_VERSION) < 0) {
    throw new Agent86Error(
      `agent86 ${version} is too old; agent86-web needs ${MIN_AGENT86_VERSION} or newer. Update it with: npm install -g agent86@latest`,
    );
  }
  return version;
}
