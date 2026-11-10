/** The launch token from a URL fragment like `#token=abc`, if there is one. */
export function readLaunchToken(hash: string): string | undefined {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const token = params.get("token");
  return token && /^[\w-]{16,128}$/.test(token) ? token : undefined;
}

/** A new thread id the bridge accepts (`[A-Za-z0-9_-]{1,64}`). */
export function newThreadId(random: () => string = () => crypto.randomUUID()): string {
  return random()
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 64);
}
