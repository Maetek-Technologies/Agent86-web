import type { AvailableCommand, FileLink } from "@agent86-web/acp-client";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { findFiles } from "../api.ts";
import { loadHistory, pushHistory } from "../threads/storage.ts";

/** A stable default: a new array each render would re-run the menu effect forever. */
const NO_COMMANDS: AvailableCommand[] = [];

interface MenuItem {
  key: string;
  label: string;
  detail?: string;
  /** The text that replaces the token being completed. */
  insert: string;
}

/** The token at the caret: a slash command at the very start, or an @ mention anywhere. */
export function tokenAt(
  text: string,
  caret: number,
): { kind: "command" | "mention"; query: string; start: number } | undefined {
  const before = text.slice(0, caret);
  const command = /^\/(\S*)$/.exec(before);
  if (command) return { kind: "command", query: command[1]!, start: 0 };
  const mention = /(^|\s)@(\S*)$/.exec(before);
  if (mention)
    return { kind: "mention", query: mention[2]!, start: caret - mention[2]!.length - 1 };
  return undefined;
}

/** The files a prompt mentions, as links for agent86: each `@path` the user picked from the menu. */
export function mentionedLinks(
  text: string,
  picked: ReadonlySet<string>,
  workspace: string,
): FileLink[] {
  const links: FileLink[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/(?:^|\s)@(\S+)/g)) {
    const path = match[1]!;
    if (!picked.has(path) || seen.has(path)) continue;
    seen.add(path);
    const base = workspace.replace(/[\\/]+$/, "").replace(/\\/g, "/");
    const absolute = `${base.startsWith("/") ? "" : "/"}${base}/${path}`;
    links.push({ name: path, uri: `file://${encodeURI(absolute)}` });
  }
  return links;
}

/**
 * The input box. Enter sends, Shift+Enter adds a line. `/` at the start offers agent86's commands,
 * `@` offers workspace files, and Up and Down walk this workspace's prompt history. While a turn
 * runs the text can still be typed, but not sent (docs/UI_DESIGN.md §3.3).
 */
export function PromptInput({
  workspace,
  busy,
  disabled,
  commands = NO_COMMANDS,
  onSend,
}: {
  workspace: string;
  busy: boolean;
  disabled: boolean;
  commands?: AvailableCommand[];
  onSend: (text: string, links: FileLink[]) => void;
}) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  /** Files for the @ token, with the token they were found for. */
  const [files, setFiles] = useState<{ key: string; items: MenuItem[] }>({ key: "", items: [] });
  /** The highlighted row, with the token it belongs to (a new token starts at the top). */
  const [highlight, setHighlight] = useState<{ key: string; index: number }>({ key: "", index: 0 });
  const [dismissed, setDismissed] = useState<string | undefined>(undefined);
  const picked = useRef(new Set<string>());
  const history = useRef<{ entries: string[]; index: number; draft: string }>({
    entries: [],
    index: -1,
    draft: "",
  });
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    history.current = { entries: loadHistory(workspace), index: -1, draft: "" };
  }, [workspace]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [busy]);

  const token = tokenAt(text, caret);
  const tokenKey = token ? `${token.kind}:${token.start}:${token.query}` : undefined;

  const commandItems = useMemo<MenuItem[]>(() => {
    if (token?.kind !== "command") return [];
    const q = token.query.toLowerCase();
    return commands
      .filter((c) => c.name.toLowerCase().startsWith(q))
      .map((c) => ({
        key: c.name,
        label: `/${c.name}`,
        detail: c.input?.hint ? `${c.description} (${c.input.hint})` : c.description,
        insert: `/${c.name} `,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tokenKey captures the token.
  }, [tokenKey, commands]);

  // Ask the bridge for files matching the @ token, after a short pause in typing.
  useEffect(() => {
    if (token?.kind !== "mention" || !tokenKey) return;
    let live = true;
    const timer = setTimeout(() => {
      findFiles(workspace, token.query)
        .then((found) => {
          if (live) {
            setFiles({
              key: tokenKey,
              items: found.slice(0, 12).map((f) => ({ key: f, label: f, insert: `@${f} ` })),
            });
          }
        })
        .catch(() => live && setFiles({ key: tokenKey, items: [] }));
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tokenKey captures the token.
  }, [tokenKey, workspace]);

  const items =
    token?.kind === "command" ? commandItems : token && files.key === tokenKey ? files.items : [];
  const selected =
    highlight.key === tokenKey ? Math.min(highlight.index, Math.max(0, items.length - 1)) : 0;
  const menuOpen = !!token && items.length > 0 && dismissed !== tokenKey;

  const canSend = !busy && !disabled && text.trim().length > 0;

  function send() {
    if (!canSend) return;
    const message = text.trim();
    onSend(message, mentionedLinks(message, picked.current, workspace));
    history.current = { entries: pushHistory(workspace, message), index: -1, draft: "" };
    picked.current = new Set();
    setText("");
    setCaret(0);
  }

  function choose(item: MenuItem) {
    if (!token) return;
    const end = token.start + 1 + token.query.length;
    const next = text.slice(0, token.start) + item.insert + text.slice(end);
    if (token.kind === "mention") picked.current.add(item.key);
    setText(next);
    const position = token.start + item.insert.length;
    setCaret(position);
    requestAnimationFrame(() => ref.current?.setSelectionRange(position, position));
  }

  function recall(step: -1 | 1): boolean {
    const h = history.current;
    if (h.entries.length === 0) return false;
    if (h.index === -1 && step === 1) return false;
    if (h.index === -1) h.draft = text;
    const index = h.index === -1 ? h.entries.length - 1 : h.index + step;
    if (index < 0) return true;
    if (index >= h.entries.length) {
      h.index = -1;
      setText(h.draft);
      return true;
    }
    h.index = index;
    setText(h.entries[index]!);
    return true;
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (menuOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setHighlight({
          key: tokenKey ?? "",
          index: (selected + step + items.length) % items.length,
        });
        return;
      }
      const item = items[selected]!;
      // A command typed out in full runs on Enter, as at the terminal; otherwise Enter completes.
      const complete = event.key === "Enter" && item.insert.trim() === text.trim();
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey && !complete)) {
        event.preventDefault();
        choose(item);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setDismissed(tokenKey);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
      return;
    }
    const el = event.currentTarget;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === text.length;
    if (event.key === "ArrowUp" && (atStart || text === "" || history.current.index !== -1)) {
      if (recall(-1)) event.preventDefault();
    } else if (event.key === "ArrowDown" && (atEnd || history.current.index !== -1)) {
      if (recall(1)) event.preventDefault();
    }
  }

  return (
    <div className="relative rounded-lg border border-border bg-panel focus-within:border-accent">
      {menuOpen && (
        <ul
          role="listbox"
          aria-label={token?.kind === "command" ? "Commands" : "Files"}
          className="absolute bottom-full left-0 mb-2 max-h-72 w-full overflow-auto rounded-lg border border-border bg-panel py-1 shadow-lg"
        >
          {items.map((item, i) => (
            <li
              key={item.key}
              role="option"
              aria-selected={i === selected}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(item);
              }}
              className={`flex cursor-pointer gap-3 px-3 py-1 text-sm ${i === selected ? "bg-panel-2" : ""}`}
            >
              <span className="shrink-0 font-mono">{item.label}</span>
              {item.detail && <span className="truncate text-muted">{item.detail}</span>}
            </li>
          ))}
        </ul>
      )}
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
          onChange={(event) => {
            setText(event.target.value);
            setCaret(event.target.selectionStart);
            setDismissed(undefined);
            history.current.index = -1;
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          placeholder={
            disabled
              ? "Disconnected"
              : busy
                ? "agent86 is working… (type ahead)"
                : "Message agent86 (/ for commands, @ for files)"
          }
          aria-label="Message agent86"
          aria-autocomplete="list"
          aria-expanded={menuOpen}
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
