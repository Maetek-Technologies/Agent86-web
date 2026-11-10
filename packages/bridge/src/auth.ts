// Launch-token login, the session cookie, and the Host and Origin checks.
// See docs/SECURITY.md T2–T6.
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export const COOKIE_NAME = "agent86web_session";
export const CSRF_HEADER = "x-agent86-web";
export const TOKEN_LIFETIME_MS = 5 * 60 * 1000;

function secret(): string {
  return randomBytes(32).toString("base64url");
}

function same(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export interface AuthOptions {
  /** The port the bridge listens on, for the Host allowlist. */
  port: number;
  /** An extra origin to allow, for the Vite dev server (`--dev-origin`). */
  devOrigin?: string | undefined;
  now?: () => number;
}

export class Auth {
  /** The one-time launch token, or undefined once it has been used or has expired. */
  private token: string | undefined = secret();
  private readonly issuedAt: number;
  private readonly sessions = new Set<string>();
  private readonly now: () => number;
  readonly allowedHosts: ReadonlySet<string>;
  readonly allowedOrigins: ReadonlySet<string>;

  constructor(private readonly options: AuthOptions) {
    this.now = options.now ?? Date.now;
    this.issuedAt = this.now();
    const { port } = options;
    this.allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
    const origins = [...this.allowedHosts].map((host) => `http://${host}`);
    if (options.devOrigin) origins.push(new URL(options.devOrigin).origin);
    this.allowedOrigins = new Set(origins);
  }

  /** The launch token, for the URL the bridge prints. */
  get launchToken(): string {
    if (!this.token) throw new Error("the launch token has already been used");
    return this.token;
  }

  /** Exchange the launch token for a session id. The token works once, within its lifetime. */
  login(candidate: unknown): string | undefined {
    const token = this.token;
    if (!token || typeof candidate !== "string") return undefined;
    if (this.now() - this.issuedAt > TOKEN_LIFETIME_MS) {
      this.token = undefined;
      return undefined;
    }
    if (!same(candidate, token)) return undefined;
    this.token = undefined;
    const session = secret();
    this.sessions.add(session);
    return session;
  }

  /** Whether a request carries a valid session cookie. */
  hasSession(req: IncomingMessage): boolean {
    const value = readCookie(req.headers.cookie, COOKIE_NAME);
    if (!value) return false;
    for (const session of this.sessions) if (same(value, session)) return true;
    return false;
  }

  /** DNS rebinding defence (T3): only our own loopback names. */
  hostAllowed(req: IncomingMessage): boolean {
    const host = req.headers.host;
    return typeof host === "string" && this.allowedHosts.has(host.toLowerCase());
  }

  /** Cross-site defence (T2, T4): the Origin must be exactly ours. */
  originAllowed(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    return typeof origin === "string" && this.allowedOrigins.has(origin);
  }

  /** The CSRF header every state-changing request must carry (T4). */
  static hasCsrfHeader(req: IncomingMessage): boolean {
    return req.headers[CSRF_HEADER] === "1";
  }

  static sessionCookie(session: string): string {
    return `${COOKIE_NAME}=${session}; HttpOnly; SameSite=Strict; Path=/`;
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}
