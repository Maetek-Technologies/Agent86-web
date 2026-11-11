# Feature parity: terminal interface → web UI

This table maps each feature of agent86's interactive terminal interface (v1.0.15) to the ACP message that carries it, if any, and says how the web UI covers it.

**Legend**

- ✅ **Phase 1:** covered through ACP as agent86 offers it today
- 🟡 **Partial:** covered with a limitation or a workaround
- ⛔ **Not in phase 1:** ACP has no message for it, or it is deliberately left out. The upstream wishlist is in [PROJECT_PLAN.md §5](PROJECT_PLAN.md#5-upstream-dependencies-and-wishlist).

Keep this table current. A behavior difference that is not listed here is a bug.

## Conversation

| Terminal feature | ACP | Web UI | Status | Milestone |
|---|---|---|---|---|
| Streaming reply rendered as Markdown | `session/update` `agent_message_chunk` | Incremental Markdown (only the last block re-parsed), with highlighted, copyable code blocks | ✅ | M2, M3 |
| Thinking model's reasoning, dimmed | `agent_thought_chunk` | A collapsible "thinking" block, collapsed by default once the answer starts | ✅ | M2 |
| `/thinking full\|summary\|hidden`, Ctrl+T | slash command over ACP | The slash command, from the `/` menu (agent86 changes what it sends) | 🟡 No Ctrl+T or local toggle yet | M4 |
| Tool call blocks `⏺ name(args)` / `⎿ result` | `tool_call`, `tool_call_update` | Cards with status, arguments, and an expandable result | ✅ | M3 |
| `/toolview full\|summary\|hidden` | slash command over ACP | The slash command, from the `/` menu | ✅ | M4 |
| Ctrl+O full transcript with every call expanded | — (the client has all the data) | Ctrl+O toggles every card open | ✅ | M3 |
| Esc / Ctrl+C cancels at the next safe point | `session/cancel` → `stopReason: cancelled` | Esc key and a Stop button | ✅ | M2 |
| Turn summary line, errors, trace hint | prompt result plus message text | Errors with `agent86 trace show -s <id>`, and a divider showing the turn's duration | 🟡 Usage figures are not sent over ACP | M2 |
| `[cancelled]` after a cancelled reply | `agent_message_chunk` text, then `stopReason: cancelled` | A "Cancelled." notice; agent86's trailing marker is dropped so the cancel shows once | ✅ | M2 |
| No key for the model | `session/new` error | agent86's message, plus help: `agent86 keys set <provider>` or `/config model` at a terminal | ✅ | M2 |
| `@file` mentions with path completion | prompt `resource_link` blocks | `@` menu backed by the bridge's `/api/files` (names only, hidden folders skipped), sent as file links | 🟡 The terminal puts the file's contents in the message; over ACP agent86 shows the model the link (`name (uri)`) and the model reads the file with `read_file` | M4 |
| Prompt history (Up arrow) | — | Per-workspace history in `localStorage` | 🟡 Not shared with the terminal's history file | M4 |
| Multi-line input | — | Shift+Enter | ✅ | M2 |
| Images in the prompt | not accepted by agent86 | — | ⛔ | — |

## Approvals

| Terminal feature | ACP | Web UI | Status | Milestone |
|---|---|---|---|---|
| Approval panel with numbered choices | `session/request_permission` | An inline panel in the call's card, number keys and buttons, Esc rejects, and the tab title flags it | ✅ | M3 |
| Coloured diff for file edits | permission `toolCall.content` text: agent86 sends a unified diff as text, not ACP's `diff` type | Unified diff viewer with line numbers and highlighting; a new file is shown as its content | ✅ (unified only; side-by-side later) | M3 |
| Command preview for `run_command` / `python_exec` | permission request content | Highlighted command block | ✅ | M3 |
| Warning for writes into agent86's own config or skills | permission request content | Shown prominently above the detail | ✅ | M3 |
| Approval mode `ask`/`auto`/`deny`, Shift+Tab, `/mode` | `session/set_config_option`, `config_option_update` | A mode selector in the thread header | ✅ | M4 |
| "Always allow" | not offered by agent86 | — | ⛔ | — |

## Models

| Terminal feature | ACP | Web UI | Status | Milestone |
|---|---|---|---|---|
| `/model` picker with the providers' live lists | config option `model`, filled in the background (`config_option_update`) | A grouped model selector (Configured, then each provider); only models agent86 lists can be chosen | ✅ (not searchable yet) | M4 |
| `/models` | slash command (not in agent86's ACP set) | Covered by the selector | 🟡 | M4 |
| Triage router (`[model] router`) | agent-side | Unchanged; the selector shows the configured routes | ✅ | — |
| `/config model` (provider, key, model, saved to config) | none | Terminal only. The UI links to instructions. | ⛔ | — |

## Sessions and workspaces

| Terminal feature | ACP | Web UI | Status | Milestone |
|---|---|---|---|---|
| `/sessions`, `/resume` picker | `session/list`, `session/load` (replay) | Sidebar of sessions per workspace, newest first. Sessions started at a terminal have no recorded directory, so agent86 lists them under every workspace | ✅ | M4 |
| `--resume <id>` continues an ACP thread, and the reverse | shared session database | Works both ways. The UI shows the session ID with a copy button. | ✅ | M4 |
| Working directory in the input border | `cwd` on `session/new` | Workspace in the input border, chosen with the workspace picker (folders under `--root`) | ✅ | M4 |
| `/clear` | — | "New thread" in the same workspace | 🟡 New session, not cleared in place | M4 |
| Several conversations at once | one turn per connection | One agent86 process per thread, shown in tabs (a dot shows working or waiting for approval) | ✅ | M4 |
| Surviving a reload | `session/load` | Open threads are remembered in the browser; a reload reattaches to the same agent86 and reopens each session, waiting for a running turn to end first | ✅ | M4 |

## Information commands

| Terminal | ACP | Web UI | Status |
|---|---|---|---|
| `/cost` | slash command | Command, plus a "cost" button in the header | 🟡 On demand, not live |
| `/tools` | slash command | Command | ✅ |
| `/help` | — | Local help panel listing the available commands | ✅ |
| `/skills`, `/memory`, `/limits` | not in agent86's ACP set | — | ⛔ (wishlist) |
| `/update`, update notice | not over ACP | The bridge reports the agent86 version; a newer-version notice is optional ([OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)) | 🟡 |
| `/exit` | — | Close the tab or thread | ✅ |

## Status line

| Segment | Source | Web UI | Status |
|---|---|---|---|
| Model | config option | Header | ✅ |
| Phase (thinking, running a tool) | derived from updates | Spinner plus a label | ✅ |
| Approval mode | config option | Header | ✅ |
| Sandbox type | not over ACP | — | ⛔ |
| Tokens, context use, cost | not over ACP | `/cost` on demand | ⛔ (wishlist) |

## Secrets, trust, configuration

| Terminal feature | ACP | Web UI | Status |
|---|---|---|---|
| `request_secret` masked prompt, `/secret NAME` | not offered (ACP forbids forms for secrets) | Explains how to remember the secret for the project at the terminal. Remembered secrets load automatically. | ⛔ ([Q3](OPEN_QUESTIONS.md#q3-secrets)) |
| `/secret` (list names) | slash command | Command | ✅ |
| Project trust question | never asked over ACP | A banner, then a review dialog showing the file. The bridge records trust by hash and passes `--trust-project` ([ADR 0004](adr/0004-project-trust-from-the-browser.md)). | ✅ M4. Browser trust is not seen by the terminal. |
| `/config mcp` | none | Terminal only | ⛔ |
| `/limits` and the offer to raise a reached limit | none | Terminal only | ⛔ |

## Things the web UI adds

These are presentation features with no terminal counterpart. None of them changes agent behavior.

- Several threads side by side, and a persistent session sidebar
- Rich diffs, collapsible sections, copy buttons, and links to files
- A log drawer showing agent86's stderr notes for each thread
- Reconnect after a reload while the agent keeps working
