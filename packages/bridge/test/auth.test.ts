import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { Auth, COOKIE_NAME, TOKEN_LIFETIME_MS, readCookie } from "../src/auth.ts";

const req = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage;

describe("Auth", () => {
  it("exchanges the launch token once for a session", () => {
    const auth = new Auth({ port: 8686 });
    const token = auth.launchToken;
    expect(auth.login("wrong")).toBeUndefined();
    const session = auth.login(token);
    expect(session).toMatch(/^[\w-]{43}$/);
    expect(auth.login(token)).toBeUndefined();
    expect(() => auth.launchToken).toThrow();
    expect(auth.hasSession(req({ cookie: `other=1; ${COOKIE_NAME}=${session}` }))).toBe(true);
    expect(auth.hasSession(req({ cookie: `${COOKIE_NAME}=nope` }))).toBe(false);
    expect(auth.hasSession(req({}))).toBe(false);
  });

  it("refuses the token after its lifetime", () => {
    let now = 1_000;
    const auth = new Auth({ port: 8686, now: () => now });
    const token = auth.launchToken;
    now += TOKEN_LIFETIME_MS + 1;
    expect(auth.login(token)).toBeUndefined();
  });

  it("refuses a token that is not a string", () => {
    const auth = new Auth({ port: 8686 });
    expect(auth.login(undefined)).toBeUndefined();
    expect(auth.login({ token: auth.launchToken })).toBeUndefined();
  });

  it("allows only its own loopback hosts", () => {
    const auth = new Auth({ port: 8686 });
    for (const host of ["127.0.0.1:8686", "localhost:8686", "[::1]:8686", "LOCALHOST:8686"]) {
      expect(auth.hostAllowed(req({ host }))).toBe(true);
    }
    for (const host of ["evil.com", "127.0.0.1:8687", "evil.com:8686", "127.0.0.1"]) {
      expect(auth.hostAllowed(req({ host }))).toBe(false);
    }
    expect(auth.hostAllowed(req({}))).toBe(false);
  });

  it("allows only its own origins, plus the dev origin if given", () => {
    const auth = new Auth({ port: 8686, devOrigin: "http://localhost:5173/" });
    for (const origin of [
      "http://127.0.0.1:8686",
      "http://localhost:8686",
      "http://localhost:5173",
    ]) {
      expect(auth.originAllowed(req({ origin }))).toBe(true);
    }
    for (const origin of [
      "https://127.0.0.1:8686",
      "http://evil.com",
      "null",
      "http://localhost:5174",
    ]) {
      expect(auth.originAllowed(req({ origin }))).toBe(false);
    }
    expect(auth.originAllowed(req({}))).toBe(false);
  });

  it("builds a strict session cookie", () => {
    expect(Auth.sessionCookie("abc")).toBe(`${COOKIE_NAME}=abc; HttpOnly; SameSite=Strict; Path=/`);
  });
});

describe("readCookie", () => {
  it("finds a cookie among others", () => {
    expect(readCookie("a=1; b=2;c=3", "b")).toBe("2");
    expect(readCookie("a=1", "b")).toBeUndefined();
    expect(readCookie(undefined, "b")).toBeUndefined();
  });
});
