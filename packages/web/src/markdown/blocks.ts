/**
 * Split Markdown into top-level blocks at blank lines that are not inside a fenced code block.
 * While a reply streams, every block but the last is finished, so only the last needs parsing
 * again on each chunk (docs/ARCHITECTURE.md §6).
 */
export function splitBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | undefined;
  for (const line of markdown.split("\n")) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
    }
    if (!fence && line.trim() === "" && current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
      continue;
    }
    if (line.trim() === "" && current.length === 0) continue;
    current.push(line);
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

/** Only these link schemes are clickable (docs/SECURITY.md T10). */
export function safeUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  // A relative link or fragment is harmless, but means nothing here: show it as text.
  return undefined;
}
