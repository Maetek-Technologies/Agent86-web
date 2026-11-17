# UI design

The web UI keeps the terminal interface's information and behavior (see [FEATURE_PARITY.md](FEATURE_PARITY.md)), and uses the screen space a browser offers. It does not imitate the terminal's look, but nods to agent86's identity: the detective mascot, the `AGENT86` wordmark, and a monospace accent.

## 1. Principles

1. **The conversation is the product.** Everything else is a sidebar, a header, or a drawer.
2. **Approvals are unmistakable.** They look unlike anything the model can produce and always show the exact change.
3. **Keyboard first.** Every common action has a shortcut that mirrors the terminal: Enter, Esc, `/`, `@`, number keys, and Shift+Tab.
4. **Honest about what's missing.** When a feature lives only in the terminal, say so and show the command to run.
5. **Calm when idle, clear while working.** A turn's phase is always visible.

## 2. Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 🕵 AGENT86 web    [~/code/app ▾]   ● 2 agents running     agent86 1.0.17 ⏻│  top bar
├──────────────┬─────────────────────────────────────────────────────────────┤
│ SESSIONS     │ [fix readme ×] [refactor auth ×] [+]                        │  thread tabs
│ ~/code/app   ├─────────────────────────────────────────────────────────────┤
│ ▸ fix readme │ model: openrouter:… ▾   mode: ask ▾   $ cost   ⋯  logs     │  thread header
│   refactor…  ├─────────────────────────────────────────────────────────────┤
│   2026-11-09 │ ▌You                                                         │
│   …          │   fix the typo in README                                    │
│              │                                                              │
│ ~/code/lib   │ ∴ Thinking (4s)                                         ▸   │  collapsed
│   …          │ ┌ read_file  README.md                         ✓ 1.2 KB ┐    │  tool card
│              │ └────────────────────────────────────────────────────────┘   │
│              │ ┌ edit_file  README.md               ⏳ awaiting approval ┐  │
│              │ │  - Teh quick brown fox                                  │  │
│              │ │  + The quick brown fox                                  │  │
│              │ │  [1 Allow once]  [2 Reject]                     Esc=reject│  │
│              │ └─────────────────────────────────────────────────────────┘  │
│              │                                                              │
│              │ ✻ Running edit_file… 14s                         [■ Stop]   │  phase line
│              ├─────────────────────────────────────────────────────────────┤
│ [+ New]      │ ╭───────────────────────────────────────── ~/code/app ─╮    │
│              │ │ > _                                                  │    │  input
│              │ ╰──────────────────────────────────────────────────────╯    │
└──────────────┴─────────────────────────────────────────────────────────────┘
```

On narrow screens (under about 768 px), the sidebar collapses into a drawer and the tabs become a dropdown.

- **Sessions panel:** drag its right edge to resize it (180–560 px; arrow keys when the edge has focus, double-click to reset to 256 px). Its width and whether it is shown are remembered in the browser.
- **Renaming:** double-click a tab's name (or press F2 on it), or use the pencil on a session row. With agent86 1.0.17 or later the name is saved in agent86 with `/rename`, sent quietly when the session is idle and kept out of the transcript; with older versions it is kept in the browser.
- **Top bar:** the version button opens **Settings & about** (versions, update notices, the approval mode for new threads, the saved port, trusted projects). ⏻ quits agent86-web after a confirmation that names running turns and waiting approvals; the tab then closes, or says that agent86-web has stopped.

## 3. Screens

### 3.1 First run and connection

- **Connecting:** the SPA exchanges the URL token for a cookie, then calls `/api/info`.
- **agent86 missing or too old:** a full-page message with the install command (`npm install -g agent86`) and the minimum version.
- **No model configured or key missing:** the first prompt fails with agent86's own message. The UI adds a "How to set up a model" panel with `agent86 keys set <provider>` and `/config model` (terminal).
- **Token invalid or expired:** "Open the link printed by `agent86-web` again."

### 3.2 Home

- **Workspaces:** the allowed roots and recently used projects. A folder browser (names only) picks a subdirectory.
- **Recent sessions** across workspaces (from `session/list` per workspace), with title, time, and workspace.
- **New thread** button for the selected workspace.

### 3.3 Thread

- **Header:** the model selector (grouped: Configured first, then each provider as its list arrives, with a spinner per group while loading), the routed model when triage routing chose one, the mode selector (`ask` / `auto` / `deny` with a short explanation of each) with _make default_ beside it (or `(default)` when it is the default; `auto` asks first), the turn's spend against the cap while it runs, a context meter and the session's cost (from `usage_update`; "cost n/a" when unpriced; absent with an older agent86), a cost button (runs `/cost`), the session ID (copy, plus a hint: `agent86 --resume <id>`), and a logs drawer toggle.
- **Transcript** (the message types are in §4)
- **Approval inbox** (agent86 1.0.21), beside the transcript on wide screens and below it on narrow ones, shown while agent86's questions queue holds anything: a header with a count badge, then the question being asked and those waiting in the order agent86 will ask them, each with the sub-agent (or "main agent"), the tool (or, for a specialty, the project specialist to approve), a link to its card, and for the one asked "answer it" (or "the request is on its way…" when the queue named it before the request arrived). It is not answerable out of order; the open request on its card is. Stopping the turn empties it. A secret the model asks for (agent86 1.0.23) is listed as "a secret: NAME" (agent86's question names neither the secret nor a call, so the name comes from the open request) with "enter it", which focuses the secret prompt; a limit question as "raise the limit <name>".
- **Memory and secrets panels** (agent86 1.0.22 and 1.0.23), opened from `memory` and `secrets` in the thread header (shown only when agent86 offers them), in the same column as the inbox. Memory: Facts and Episodes tabs, a pinned-only filter, entries newest first (text, an episode's outcome, id, time, a "pinned" badge) with pin or unpin and forget (an inline "Forget for good?" with Keep as the first choice), and "Load more". Secrets: the names held, a "remembered" badge, forget (with a confirmation that says when it also leaves the keyring), and a form with a name, a masked value, and "Remember it for this project" when there is a keyring; agent86's warnings show below. Both say when they wait for a turn to end.
- **Secret prompt** (agent86 1.0.23), over the conversation (Stop, the inbox, and the panels stay usable): "agent86 asks for the secret NAME", the model's reason, a note when a value is already held, a masked input focused at once, "Remember it for this project" (only with a keyring; on when it is remembered), and Decline and Enter. Esc and ✕ decline. Styled like an approval, unlike anything the model can write.
- **Phase line,** shown while a turn runs: a spinner, a label (`Thinking…`, `Running <tool>…`, `Waiting for approval`, `Cancelling…`), elapsed time, and Stop.
- **Input:** an auto-growing textarea with the workspace in its border. `/` opens the command menu (from `available_commands_update` plus local commands). `@` opens a file menu. Up and Down arrows recall history when the caret is at the start or end. The input is disabled while a turn runs, but text can be typed ahead.

### 3.4 Project trust

- **Banner,** shown at the top of a thread when the workspace's `.agent86/config.toml` is not trusted: "This project's agent86 settings (MCP servers, providers, approvals …) are being ignored until you trust them." Its actions are **Review and trust** and **Dismiss**.
- **Review dialog:**
  - The file path and SHA-256 hash, and the full file in a monospace, read-only, scrollable view with control characters made visible
  - The settings that need trust, highlighted
  - A plain warning: "Trusting lets these settings run programs on your machine and change where your keys are sent."
  - Buttons: **Cancel** (default and focused) and **Trust this file**. Nothing happens on Enter alone.
- **After trusting:** "Restarting agent86 with this project's settings…", then the thread continues (`session/load`).
- **Settings → Trusted projects:** a list of records (path, hash, date) with Revoke.
- Trust given here is not seen by agent86 at the terminal, and the dialog says so.

### 3.5 Logs drawer

agent86's stderr notes for this thread's process: MCP startup, ignored untrusted settings, memory notes. agent86 writes these only for problems and notable events, so agent86-web adds its own connection events, dimmed and marked `[agent86-web]` (connected, session started or reopened, reconnecting and why, restarted after trust, renamed, mode and model set again). They show monospace, newest at the bottom, with a copy button. The toggle shows the line count, dimmed at zero, and a notice badge when an untrusted-settings note is seen.

## 4. Transcript elements

| Element | Source | Presentation |
|---|---|---|
| User message | sent prompt / `user_message_chunk` on replay | Right-aligned or labeled "You", with file-link chips |
| Assistant message | `agent_message_chunk` | Markdown (GFM tables, task lists), highlighted code with copy, links sanitized |
| Thinking | `agent_thought_chunk` | Dimmed and collapsible, labeled `∴ Thinking (Ns · N chars)`. Expanded while streaming and before the answer starts, collapsed after (configurable). |
| Tool call | `tool_call` / `tool_call_update` | A card showing a kind icon (search has its own), the tool name, a one-line argument summary, a status icon (pending, running, done, failed, declined), the file and first changed line (ACP `locations`, with copy), the first line of the result, and an expander for the full arguments (JSON) and result. A file change shows once: a diff built from ACP `diff` items when there are any ("whole file" shows the unchanged lines), else the text diff. A delegation card shows its sub-agent's status, model calls, and cost (agent86's state events). Failed cards have a red edge. |
| Permission request | `session/request_permission` | The card for the call switches to approval mode. It shows the diff or command, the warning if present, and one button per option, in agent86's order, with number shortcuts. The page title and favicon show a badge while an approval waits. An optional browser notification can fire if the tab is hidden. A sub-agent's request (agent86 1.0.21) also says who asks: the sub-agent's name and "show its card", "Works in an isolated worktree on <branch>" when it does, and its spend (and model calls) beside the turn's spend and the cap; agent86's own "Asked by the '<agent>' sub-agent." warning is then left out. |
| Notice / error | message text, prompt result | A compact system line. Errors are red and include the trace hint (`agent86 trace show -s <id>`). |
| Turn end | `stopReason` | A subtle divider. `cancelled`, `max_tokens`, and refusals are labeled. With agent86's state events it also shows the turn's model calls (expandable: step, model, tokens, cost) and its spend against the cap. A turn cut off by agent86 exiting (agent86 1.0.21) ends in an amber "Interrupted: agent86 stopped partway through this turn … The steps it finished are kept." note with **Continue** while it is the last entry; calls it left pending or running show "↯ interrupted". |
| Compaction | `compaction_update` | One collapsed entry, "Context compacted" (or failed, with why), opening to the summary |
| Guardrail | agent86's `guardrail` event | One dimmed line naming what was flagged, findings on request |

## 5. Keyboard shortcuts

| Key | Action | Terminal equivalent |
|---|---|---|
| Enter / Shift+Enter | Send / new line | same |
| Esc | Cancel the turn. In an approval, reject. | Esc / Ctrl+C |
| `1`…`9` | Pick an approval option | numbered choices |
| Shift+Tab | Cycle the approval mode | Shift+Tab |
| `/` (in empty input) | Command menu | same |
| `@` | File mention menu | same |
| Ctrl+O | Expand or collapse all tool cards | Ctrl+O transcript |
| Ctrl+T | Cycle the thinking display | Ctrl+T |
| Ctrl+K | Quick switcher for threads and sessions | — |
| Alt+N | New thread | `/clear` |

## 6. Visual design

- **Themes:** dark (default) and light, using CSS variables (shadcn/ui tokens). Follows `prefers-color-scheme` with a toggle.
- **Type:** a system UI font for prose. A monospace font for code, tool cards, the input border label, and the wordmark accent.
- **Colour:** neutral greys. One accent drawn from the agent86 logo. Semantic colours for diff additions and removals, errors, and approval (amber).
- **Motion:** minimal. A spinner and a gentle stream-in, both disabled under `prefers-reduced-motion`.
- **Brand assets:** agent86-web is a Maetek Technologies project and uses the agent86 name, logo, and detective mascot. Use the mascot in the top bar, the empty states, and the favicon. Credit agent86 and Maetek Technologies in the About dialog.

## 7. Component inventory

`AppShell`, `TopBar`, `WorkspacePicker`, `SessionSidebar`, `ThreadTabs`, `ThreadHeader`, `ModelSelect`, `ModeSelect`, `Transcript`, `UserMessage`, `AssistantMessage`, `MarkdownView`, `CodeBlock`, `ThinkingBlock`, `ToolCallCard`, `PermissionPanel`, `DiffView`, `CommandPreview`, `PhaseLine`, `PromptInput`, `CommandMenu`, `MentionMenu`, `LogsDrawer`, `ConnectionBanner`, `EmptyState`, `HelpDialog`, `QuickSwitcher`, `TrustBanner`, `TrustDialog`, `TrustedProjectsSettings`, `AboutDialog`.
