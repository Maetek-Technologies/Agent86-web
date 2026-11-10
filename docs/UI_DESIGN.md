# UI design

The web UI keeps the terminal interface's information and behavior (see [FEATURE_PARITY.md](FEATURE_PARITY.md)), and uses the screen space a browser offers. It does not imitate the terminal's look, but nods to agent86's identity: the detective mascot, the `AGENT 86` wordmark, and a monospace accent.

## 1. Principles

1. **The conversation is the product.** Everything else is a sidebar, a header, or a drawer.
2. **Approvals are unmistakable.** They look unlike anything the model can produce and always show the exact change.
3. **Keyboard first.** Every common action has a shortcut that mirrors the terminal: Enter, Esc, `/`, `@`, number keys, and Shift+Tab.
4. **Honest about what's missing.** When a feature lives only in the terminal, say so and show the command to run.
5. **Calm when idle, clear while working.** A turn's phase is always visible.

## 2. Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 🕵 AGENT 86 web   [~/code/app ▾]   ● 2 agents running        agent86 1.0.15│  top bar
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

- **Header:** the model selector (grouped: Configured first, then each provider as its list arrives, with a spinner per group while loading), the mode selector (`ask` / `auto` / `deny` with a short explanation of each), a cost button (runs `/cost`), the session ID (copy, plus a hint: `agent86 --resume <id>`), and a logs drawer toggle.
- **Transcript** (the message types are in §4)
- **Phase line,** shown while a turn runs: a spinner, a label (`Thinking…`, `Running <tool>…`, `Waiting for approval`, `Cancelling…`), elapsed time, and Stop.
- **Input:** an auto-growing textarea with the workspace in its border. `/` opens the command menu (from `available_commands_update` plus local commands). `@` opens a file menu. Up and Down arrows recall history when the caret is at the start or end. The input is disabled while a turn runs, but text can be typed ahead.

### 3.4 Logs drawer

agent86's stderr notes for this thread's process: MCP startup, ignored untrusted settings, memory notes. They show monospace, newest at the bottom, with a copy button. A notice badge appears on the drawer when an untrusted-settings note is seen.

## 4. Transcript elements

| Element | Source | Presentation |
|---|---|---|
| User message | sent prompt / `user_message_chunk` on replay | Right-aligned or labeled "You", with file-link chips |
| Assistant message | `agent_message_chunk` | Markdown (GFM tables, task lists), highlighted code with copy, links sanitized |
| Thinking | `agent_thought_chunk` | Dimmed and collapsible, labeled `∴ Thinking (Ns · N chars)`. Expanded while streaming and before the answer starts, collapsed after (configurable). |
| Tool call | `tool_call` / `tool_call_update` | A card showing the tool name, a one-line argument summary, a status icon (pending, running, done, failed, declined), the first line of the result, and an expander for the full arguments (JSON) and result. Failed cards have a red edge. |
| Permission request | `session/request_permission` | The card for the call switches to approval mode. It shows the diff or command, the warning if present, and one button per option, in agent86's order, with number shortcuts. The page title and favicon show a badge while an approval waits. An optional browser notification can fire if the tab is hidden. |
| Notice / error | message text, prompt result | A compact system line. Errors are red and include the trace hint (`agent86 trace show -s <id>`). |
| Turn end | `stopReason` | A subtle divider. `cancelled`, `max_tokens`, and refusals are labeled. |

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
- **Brand assets:** use agent86's logo only as its license allows and with attribution. See [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md#q7-branding).

## 7. Component inventory

`AppShell`, `TopBar`, `WorkspacePicker`, `SessionSidebar`, `ThreadTabs`, `ThreadHeader`, `ModelSelect`, `ModeSelect`, `Transcript`, `UserMessage`, `AssistantMessage`, `MarkdownView`, `CodeBlock`, `ThinkingBlock`, `ToolCallCard`, `PermissionPanel`, `DiffView`, `CommandPreview`, `PhaseLine`, `PromptInput`, `CommandMenu`, `MentionMenu`, `LogsDrawer`, `ConnectionBanner`, `EmptyState`, `HelpDialog`, `QuickSwitcher`.
