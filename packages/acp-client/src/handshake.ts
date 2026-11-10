import {
  PROTOCOL_VERSION,
  type ClientCapabilities,
  type Implementation,
  type InitializeResponse,
} from "@agentclientprotocol/sdk";

/** The oldest agent86 whose ACP server agent86-web is built against. */
export const MIN_AGENT86_VERSION = "1.0.15";

export const CLIENT_INFO: Implementation = {
  name: "agent86-web",
  title: "agent86 web",
  version: "0.0.0",
};

/**
 * What agent86-web advertises. The browser does not own the files or a terminal, so both are off
 * and agent86's tools use the disk (the bridge forces the same values; see docs/SECURITY.md T9).
 */
export const CLIENT_CAPABILITIES: ClientCapabilities = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
};

export interface Compatibility {
  ok: boolean;
  problems: string[];
}

/** Compare dotted numeric versions; a pre-release or build suffix is ignored. */
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

/** Whether the agent that answered `initialize` is an agent86 this client supports. */
export function checkCompatibility(init: InitializeResponse): Compatibility {
  const problems: string[] = [];
  if (init.protocolVersion !== PROTOCOL_VERSION) {
    problems.push(
      `The agent speaks ACP version ${init.protocolVersion}; agent86-web speaks version ${PROTOCOL_VERSION}.`,
    );
  }
  const info = init.agentInfo;
  if (!info || info.name !== "agent86") {
    problems.push(`The agent is ${info ? `"${info.name}"` : "unnamed"}, not agent86.`);
  } else if (compareVersions(info.version, MIN_AGENT86_VERSION) < 0) {
    problems.push(
      `agent86 ${info.version} is older than ${MIN_AGENT86_VERSION}. Update it with: npm install -g agent86@latest`,
    );
  }
  if (!init.agentCapabilities?.loadSession) {
    problems.push("The agent cannot reopen saved sessions (loadSession).");
  }
  return { ok: problems.length === 0, problems };
}
