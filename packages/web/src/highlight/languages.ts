/** A highlight.js language name for a file path, by extension. */
export function languageForPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const name = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return EXTENSIONS[ext];
}

const EXTENSIONS: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  py: "python",
  rs: "rust",
  go: "go",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  css: "css",
  scss: "scss",
  less: "less",
  html: "xml",
  xml: "xml",
  svg: "xml",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  sql: "sql",
  lua: "lua",
  pl: "perl",
  r: "r",
  diff: "diff",
  patch: "diff",
};

/** Normalize a Markdown fence's language to a highlight.js name. */
export function normalizeLanguage(language: string | undefined): string | undefined {
  if (!language) return undefined;
  const lower = language.toLowerCase();
  return ALIASES[lower] ?? EXTENSIONS[lower] ?? lower;
}

const ALIASES: Record<string, string> = {
  shell: "bash",
  console: "bash",
  sh: "bash",
  zsh: "bash",
  py: "python",
  js: "javascript",
  ts: "typescript",
  rs: "rust",
  yml: "yaml",
  html: "xml",
  toml: "ini",
};
