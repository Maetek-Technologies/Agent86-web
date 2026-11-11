// Compiles the bridge and copies the built web client into dist/public.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, rmSync, chmodSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const web = join(root, "..", "web", "dist");

rmSync(dist, { recursive: true, force: true });
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
execFileSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], {
  cwd: root,
  stdio: "inherit",
});
chmodSync(join(dist, "cli.js"), 0o755);

if (existsSync(web)) {
  // Source maps stay out of the package: they are large and point at sources it does not ship.
  cpSync(web, join(dist, "public"), {
    recursive: true,
    filter: (source) => !source.endsWith(".map"),
  });
} else {
  console.warn(
    "warning: packages/web/dist not found; run `pnpm --filter @agent86-web/web build` first",
  );
}
