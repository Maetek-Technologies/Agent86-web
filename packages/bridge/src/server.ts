// The bridge's HTTP and WebSocket server (docs/ARCHITECTURE.md §3.2).
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname } from "node:path";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { AgentProcess, MAX_MESSAGE_BYTES } from "./agent-process.ts";
import { MIN_AGENT86_VERSION } from "./agent86.ts";
import { Auth } from "./auth.ts";
import { listDirectories, matchFiles, walkFiles } from "./files.ts";
import { listSessions } from "./sessions.ts";
import { serveStatic } from "./static.ts";
import { ThreadRegistry } from "./threads.ts";
import { realpath, resolveWorkspace, within } from "./workspaces.ts";

export const BRIDGE_VERSION: string = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

export const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; " +
    "base-uri 'none'; form-action 'self'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
};

export interface BridgeOptions {
  /** Real paths of the directories threads may run in. The first is the default. */
  roots: string[];
  host: string;
  port: number;
  agent86: { command: string; version: string; args: string[] };
  /** The built web client. */
  publicDir: string;
  /** An extra allowed origin, for the Vite dev server. */
  devOrigin?: string | undefined;
  /** The most agent86 processes alive at once (default 8). */
  maxAgents?: number;
  /** Stop a detached, idle process after this long (default 15 minutes). */
  idleTimeoutMs?: number;
  log?: (line: string) => void;
}

export const DEFAULT_MAX_AGENTS = 8;
export const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export interface RunningBridge {
  port: number;
  /** The URL to open, with the launch token in the fragment. */
  url: string;
  close(): Promise<void>;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function refuseUpgrade(socket: Duplex, status: number, reason: string): void {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export async function startBridge(options: BridgeOptions): Promise<RunningBridge> {
  if (!LOOPBACK.has(options.host)) {
    throw new Error(
      `--host ${options.host} is refused: agent86-web listens only on loopback in this version. ` +
        "To use it from another device, forward the port over SSH (see the README).",
    );
  }
  if (options.roots.length === 0) throw new Error("at least one --root is needed");

  const log = options.log ?? (() => undefined);
  const agentArgs = (_workspace: string): string[] => [...options.agent86.args];
  const threads = new ThreadRegistry({
    maxAgents: options.maxAgents ?? DEFAULT_MAX_AGENTS,
    idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
    log,
    spawn: (thread, workspace) => {
      log(`thread ${thread}: starting agent86 in ${workspace}`);
      const agent = new AgentProcess({
        command: options.agent86.command,
        args: agentArgs(workspace),
        workspace,
        realpath,
        log: (line) => log(`thread ${thread}: ${line}`),
      });
      void agent.exited.then((code) =>
        log(`thread ${thread}: agent86 exited (status ${code ?? "unknown"})`),
      );
      return agent;
    },
  });
  /** Workspace file lists for @ mentions, briefly cached. */
  const fileCache = new Map<string, { at: number; files: string[] }>();
  // Set once the port is known (after listen); requests before that are refused.
  let auth: Auth | undefined = undefined;

  const server: Server = createServer((req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    void handle(req, res).catch((error: unknown) => {
      log(`request failed: ${String(error)}`);
      if (!res.headersSent) json(res, 500, { error: "internal" });
      else res.end();
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!auth?.hostAllowed(req)) {
      json(res, 403, { error: "host_not_allowed" });
      return;
    }
    const url = new URL(req.url ?? "/", "http://bridge.invalid");

    if (url.pathname === "/api/login") {
      if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
      if (!auth.originAllowed(req) || !Auth.hasCsrfHeader(req)) {
        return json(res, 403, { error: "origin_not_allowed" });
      }
      let token: unknown;
      try {
        token = (JSON.parse(await readBody(req, 4096)) as { token?: unknown }).token;
      } catch {
        return json(res, 400, { error: "bad_request" });
      }
      const session = auth.login(token);
      if (!session) return json(res, 401, { error: "token_invalid" });
      res.setHeader("set-cookie", Auth.sessionCookie(session));
      return json(res, 200, { ok: true });
    }

    if (url.pathname.startsWith("/api/")) {
      if (!auth.hasSession(req)) return json(res, 401, { error: "not_signed_in" });
      if (url.pathname === "/api/info" && req.method === "GET") {
        return json(res, 200, {
          bridge: { version: BRIDGE_VERSION },
          agent86: {
            command: options.agent86.command,
            version: options.agent86.version,
            minVersion: MIN_AGENT86_VERSION,
          },
          roots: options.roots,
          defaultWorkspace: options.roots[0],
        });
      }
      if (url.pathname === "/api/workspaces" && req.method === "GET") {
        const requested = url.searchParams.get("path");
        if (!requested) {
          return json(res, 200, {
            path: null,
            parent: null,
            dirs: options.roots.map((root) => ({ name: root, path: root })),
          });
        }
        const dir = resolveWorkspace(requested, options.roots);
        if (!dir) return json(res, 403, { error: "outside_roots" });
        const parentDir = dirname(dir);
        const parent = options.roots.some((root) => root !== dir && within(parentDir, root))
          ? parentDir
          : null;
        return json(res, 200, { path: dir, parent, dirs: listDirectories(dir) });
      }
      if (url.pathname === "/api/sessions" && req.method === "GET") {
        const workspace = resolveWorkspace(url.searchParams.get("workspace") ?? "", options.roots);
        if (!workspace) return json(res, 403, { error: "outside_roots" });
        try {
          const sessions = await listSessions(
            options.agent86.command,
            agentArgs(workspace),
            workspace,
          );
          return json(res, 200, { sessions });
        } catch (error) {
          return json(res, 502, { error: "agent86_failed", message: (error as Error).message });
        }
      }
      if (url.pathname === "/api/files" && req.method === "GET") {
        const workspace = resolveWorkspace(url.searchParams.get("workspace") ?? "", options.roots);
        if (!workspace) return json(res, 403, { error: "outside_roots" });
        let cached = fileCache.get(workspace);
        if (!cached || Date.now() - cached.at > 10_000) {
          cached = { at: Date.now(), files: walkFiles(workspace) };
          fileCache.set(workspace, cached);
        }
        return json(res, 200, { files: matchFiles(cached.files, url.searchParams.get("q") ?? "") });
      }
      return json(res, 404, { error: "not_found" });
    }

    if (url.pathname.startsWith("/acp/")) return json(res, 426, { error: "websocket_required" });

    if (req.method !== "GET" && req.method !== "HEAD")
      return json(res, 405, { error: "method_not_allowed" });
    serveStatic(options.publicDir, url.pathname, res);
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://bridge.invalid");
    if (!auth?.hostAllowed(req)) return refuseUpgrade(socket, 403, "Forbidden");
    if (!auth.originAllowed(req)) return refuseUpgrade(socket, 403, "Forbidden");
    if (!auth.hasSession(req)) return refuseUpgrade(socket, 401, "Unauthorized");
    const match = /^\/acp\/([A-Za-z0-9_-]{1,64})$/.exec(url.pathname);
    if (!match) return refuseUpgrade(socket, 404, "Not Found");

    const requested = url.searchParams.get("workspace") ?? options.roots[0]!;
    const workspace = resolveWorkspace(requested, options.roots);
    if (!workspace) return refuseUpgrade(socket, 403, "Forbidden");

    const fresh = url.searchParams.get("fresh") === "1";
    wss.handleUpgrade(req, socket, head, (ws) => {
      const result = threads.attach(match[1]!, workspace, ws, fresh);
      if (!result.ok) ws.close(1013, result.reason.slice(0, 120));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  auth = new Auth({ port, devOrigin: options.devOrigin });

  const host =
    options.host === "::1" ? "[::1]" : options.host === "localhost" ? "127.0.0.1" : options.host;
  const base = options.devOrigin ? new URL(options.devOrigin).origin : `http://${host}:${port}`;

  return {
    port,
    url: `${base}/#token=${auth.launchToken}`,
    async close() {
      await threads.stopAll();
      for (const client of wss.clients) client.terminate();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
