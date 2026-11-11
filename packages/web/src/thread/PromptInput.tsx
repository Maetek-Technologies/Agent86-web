import { useEffect, useRef, useState, type KeyboardEvent } from "react";

/**
 * The input box. Enter sends, Shift+Enter adds a line. While a turn runs the text can still be
 * typed, but not sent (docs/UI_DESIGN.md §3.3).
 */
export function PromptInput({
  workspace,
  busy,
  disabled,
  onSend,
}: {
  workspace: string;
  busy: boolean;
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [busy]);

  const canSend = !busy && !disabled && text.trim().length > 0;

  function send() {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  return (
    <div className="relative rounded-lg border border-border bg-panel focus-within:border-accent">
      <div className="pointer-events-none absolute -top-2.5 right-3 max-w-[60%] truncate bg-bg px-1 font-mono text-xs text-muted">
        {workspace}
      </div>
      <div className="flex items-end gap-2 p-2">
        <span aria-hidden className="pb-1.5 pl-1 font-mono text-accent">
          &gt;
        </span>
        <textarea
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            disabled
              ? "Disconnected"
              : busy
                ? "agent86 is working… (type ahead)"
                : "Message agent86"
          }
          aria-label="Message agent86"
          className="max-h-60 min-h-8 flex-1 resize-none bg-transparent py-1 outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className="rounded bg-accent px-3 py-1 text-sm font-medium text-bg disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
