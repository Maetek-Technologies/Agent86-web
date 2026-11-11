// Serves the built web client. Paths are confined to the public directory.
import { createReadStream, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Serve `pathname` from `root`, or the SPA's index.html for client-side routes. */
export function serveStatic(root: string, pathname: string, res: ServerResponse): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (decoded.includes("\0")) {
    res.writeHead(400).end();
    return;
  }
  const candidate = normalize(join(root, decoded));
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    res.writeHead(404).end();
    return;
  }

  let file = candidate;
  if (!isFile(file)) {
    // A path with an extension is a missing asset; anything else is a route in the SPA.
    if (extname(decoded)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    file = join(root, "index.html");
    if (!isFile(file)) {
      res
        .writeHead(503, { "content-type": "text/plain; charset=utf-8" })
        .end("The web client has not been built. Run `pnpm build`.");
      return;
    }
  }

  const immutable = file.startsWith(join(root, "assets") + sep);
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  });
  createReadStream(file).pipe(res);
}
