// Jump to a tool call's card in the transcript (the approval inbox and the approval panel link to
// a sub-agent's delegation card this way). Cards carry `data-tool-call-id`.

const FLASH = ["ring-2", "ring-accent"];

/** The card for `toolCallId`, if the thread shows it. */
export function findCard(toolCallId: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-tool-call-id="${CSS.escape(toolCallId)}"]`);
}

/** Scroll the card into view and flash it. Returns false when the thread does not show it yet. */
export function showCard(toolCallId: string): boolean {
  const card = findCard(toolCallId);
  if (!card) return false;
  card.scrollIntoView?.({ block: "center", behavior: "smooth" });
  card.classList.add(...FLASH);
  setTimeout(() => card.classList.remove(...FLASH), 1500);
  return true;
}
