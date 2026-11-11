/** Ranges of characters a reviewer could not see: controls (but newline and tab), zero-width and
 * bidirectional formatting characters, and the byte-order mark. */
const INVISIBLE: [number, number][] = [
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x7f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

const hex = (n: number) => `\\u${n.toString(16).padStart(4, "0")}`;
const PATTERN = new RegExp(`[${INVISIBLE.map(([a, b]) => `${hex(a)}-${hex(b)}`).join("")}]`, "g");

/**
 * Make invisible characters visible, as ⟨U+XXXX⟩. The file's author chose every byte, so the
 * review shows them all, as agent86's own trust question does.
 */
export function showControls(text: string): string {
  return text.replace(
    PATTERN,
    (c) => `⟨U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}⟩`,
  );
}
