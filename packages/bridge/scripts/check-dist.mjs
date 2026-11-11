// Run before publishing: refuse a package without the web client, or with a page the bridge's
// Content-Security-Policy would break (an inline script or style).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const problems = [];

for (const file of ["cli.js", "server.js", join("public", "index.html")]) {
  if (!existsSync(join(dist, file)))
    problems.push(`dist/${file} is missing; run \`pnpm build\` at the repository root`);
}

const index = join(dist, "public", "index.html");
if (existsSync(index)) {
  const html = readFileSync(index, "utf8");
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\bsrc=/.test(tag))
      problems.push(`index.html has an inline script (${tag}), which the CSP blocks`);
  }
  if (/<style\b/i.test(html))
    problems.push("index.html has an inline <style>, which the CSP blocks");
  if (/\son[a-z]+=/i.test(html))
    problems.push("index.html has an inline event handler, which the CSP blocks");
}

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
if (existsSync(dist)) {
  for (const file of walk(dist))
    if (file.endsWith(".map")) problems.push(`${file} should not be published`);
}

if (!readFileSync(join(dist, "cli.js"), "utf8").startsWith("#!/usr/bin/env node")) {
  problems.push("dist/cli.js lost its #!/usr/bin/env node line");
}

if (problems.length) {
  console.error(`Not publishing:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("dist is ready to publish.");
