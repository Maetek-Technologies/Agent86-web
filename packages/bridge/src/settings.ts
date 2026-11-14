// agent86-web's own settings, in ~/.agent86-web/settings.json: the port to listen on and the
// approval mode new threads start in. They live with the bridge, not in the browser, because the
// browser's storage belongs to one origin (one port) and one browser. agent86's own config.toml is
// never written (docs/OPEN_QUESTIONS.md Q4).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writePrivateJson } from "./state-file.ts";

/** agent86's approval modes, as its `mode` config option lists them. */
export const MODES = ["ask", "auto", "deny"] as const;
export type Mode = (typeof MODES)[number];

export interface Settings {
  /** The port to listen on when neither --port nor AGENT86_WEB_PORT is given. */
  port?: number;
  /** The approval mode a new thread starts in; absent means agent86's own default. */
  defaultMode?: Mode;
}

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

/** A TCP port the bridge may be told to use: 1 to 65535 (0, "any free port", is never saved). */
export function isPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

export class SettingsStore {
  readonly file: string;

  /** `dir` is the bridge's own state directory (default `~/.agent86-web`). */
  constructor(dir: string = join(homedir(), ".agent86-web")) {
    this.file = join(dir, "settings.json");
  }

  /** The saved settings. A missing or damaged file, or a value out of range, reads as unset. */
  read(): Settings {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(readFileSync(this.file, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
    if (!raw || typeof raw !== "object") return {};
    const settings: Settings = {};
    if (isPort(raw.port)) settings.port = raw.port;
    if (isMode(raw.defaultMode)) settings.defaultMode = raw.defaultMode;
    return settings;
  }

  /** Change some settings; `null` removes one. Returns the settings as saved. */
  update(change: { port?: number | null; defaultMode?: Mode | null }): Settings {
    const next = this.read();
    if (change.port === null) delete next.port;
    else if (change.port !== undefined) {
      if (!isPort(change.port)) throw new Error("port must be a whole number from 1 to 65535");
      next.port = change.port;
    }
    if (change.defaultMode === null) delete next.defaultMode;
    else if (change.defaultMode !== undefined) {
      if (!isMode(change.defaultMode)) throw new Error(`mode must be one of ${MODES.join(", ")}`);
      next.defaultMode = change.defaultMode;
    }
    writePrivateJson(this.file, next);
    return next;
  }
}

export type PortSource = "--port" | "AGENT86_WEB_PORT" | "settings" | "default";

/**
 * The port to listen on: --port, then AGENT86_WEB_PORT, then the saved setting, then 0 (any free
 * port). `--port 0` forces any free port even when one is saved. Returns an error message for a
 * value that is not a port.
 */
export function resolvePort(
  flag: string | undefined,
  env: string | undefined,
  saved: number | undefined,
): { port: number; source: PortSource } | { error: string } {
  const parse = (text: string, name: string) => {
    const port = Number(text);
    return text.trim() !== "" && Number.isInteger(port) && port >= 0 && port <= 65535
      ? port
      : { error: `${name} must be a number from 0 to 65535` };
  };
  if (flag !== undefined) {
    const port = parse(flag, "--port");
    return typeof port === "number" ? { port, source: "--port" } : port;
  }
  if (env !== undefined && env !== "") {
    const port = parse(env, "AGENT86_WEB_PORT");
    return typeof port === "number" ? { port, source: "AGENT86_WEB_PORT" } : port;
  }
  if (saved !== undefined) return { port: saved, source: "settings" };
  return { port: 0, source: "default" };
}

/** Why the chosen port could not be used, and what to do about it. */
export function portProblem(
  port: number,
  source: PortSource,
  code: "EADDRINUSE" | "EACCES",
  settingsFile: string,
): string {
  const from =
    source === "--port"
      ? "from --port"
      : source === "AGENT86_WEB_PORT"
        ? "from AGENT86_WEB_PORT"
        : source === "settings"
          ? `saved in ${settingsFile}`
          : "";
  const what =
    code === "EADDRINUSE"
      ? `port ${port}${from ? ` (${from})` : ""} is already in use. Another agent86-web may be running: open its link, or stop it.`
      : `port ${port}${from ? ` (${from})` : ""} is not allowed for this user.`;
  return `${what} To use any free port this time, start with --port 0.${
    source === "settings" ? " To forget the saved port: agent86-web --port 0 --save-port" : ""
  }`;
}
