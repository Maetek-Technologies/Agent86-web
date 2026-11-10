import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MOCK_AGENT = fileURLToPath(
  new URL("../../mock-agent/src/mock-agent86.js", import.meta.url),
);

/**
 * A command that runs the mock agent, the way `agent86` is run: a single executable name.
 * On POSIX it is a small shell script; on Windows a .cmd file.
 */
export function mockAgentCommand(): string {
  const dir = mkdtempSync(join(tmpdir(), "agent86-web-mock-"));
  if (process.platform === "win32") {
    const command = join(dir, "agent86.cmd");
    writeFileSync(command, `@"${process.execPath}" "${MOCK_AGENT}" %*\r\n`);
    return command;
  }
  const command = join(dir, "agent86");
  writeFileSync(command, `#!/bin/sh\nexec "${process.execPath}" "${MOCK_AGENT}" "$@"\n`);
  chmodSync(command, 0o755);
  return command;
}
