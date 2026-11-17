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
| Coloured diff for file edits | permission `toolCall.content`: ACP `diff` items (the whole file before and after) since agent86 1.0.19, a unified diff as text before (and for files over 256 KiB and replayed sessions) | A diff built from the whole file, with hunks and "whole file", in the approval and on the card; the text diff without `diff` items | ✅ (inline; side-by-side later) | M3, M8 |
| The file a call works on | ACP `locations` (agent86 1.0.19) | The file and first changed line on the card, relative to the workspace, with copy | ✅ (no file view to open it in) | M8 |
| Command preview for `run_command` / `python_exec` | permission request content | Highlighted command block | ✅ | M3 |
| Warning for writes into agent86's own config or skills | permission request content | Shown prominently above the detail | ✅ | M3 |
| Which sub-agent asks (the terminal's sub-agent approval panel) | `_meta["com.maetek.agent86/subagent"]` on the request (agent86 1.0.21, state extension) | The sub-agent's name with a link to its delegation card, its git worktree and branch, and its spend beside the turn's and the cap, in the approval | ✅ (with 1.0.21) | M9 |
| Parallel sub-agents' approvals, one at a time in arrival order | agent86's `questions` events (1.0.21, state extension) | An approval inbox beside the thread: the question asked and those waiting, with a count and card links; answered one at a time on the card, emptied on cancel. Since 0.4.2 a secret the model asks for is listed too (by name once its request arrives, with "enter it"), and a limit question by the limit | ✅ (with 1.0.21) | M9, M10 |
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
| `/sessions`, `/resume` picker | `session/list`, `session/load` (replay) | Sidebar of sessions per workspace, newest first, resizable. With agent86 1.0.17, each workspace lists its own sessions; before 1.0.17, sessions started at a terminal have no recorded directory, so agent86 lists them under every workspace | ✅ | M4, M6 |
| `/rename` (agent86 1.0.17) | slash command, answered without a turn, then `session_info_update` | Rename from the tab (double-click or F2) or the sidebar. Sent to agent86 quietly when the session is idle; with older agent86 versions, kept in the browser | ✅ | M6 |
| `--resume <id>` continues an ACP thread, and the reverse | shared session database | Works both ways. The UI shows the session ID with a copy button. | ✅ | M4 |
| Working directory in the input border | `cwd` on `session/new` | Workspace in the input border, chosen with the workspace picker (folders under `--root`) | ✅ | M4 |
| `/clear` | — | "New thread" in the same workspace | 🟡 New session, not cleared in place | M4 |
| Several conversations at once | one turn per connection | One agent86 process per thread, shown in tabs (a dot shows working or waiting for approval) | ✅ | M4 |
| Surviving a reload | `session/load` | Open threads are remembered in the browser; a reload reattaches to the same agent86 and reopens each session, waiting for a running turn to end first | ✅ | M4 |
| Reconnecting without a replay | `session/resume` (agent86 1.0.21, `sessionCapabilities.resume`) | When the tab still has the whole conversation (a dropped connection while idle, a new agent86 after trust or a crash, and since 0.4.2 agent86-web itself restarted, its new link opened in the same tab), the session is resumed and nothing is replayed; `session/load` otherwise | ✅ (with 1.0.21) | M9, M10 |
| A session cut off mid-turn (`agent86 --resume` goes on from the finished steps) | saved after every step (agent86 1.0.21) | After agent86 exits mid-turn, the thread reconnects with the finished steps, marks the turn interrupted, and offers Continue (a short message; continuing the turn itself is planned for agent86 1.0.24) | 🟡 (Continue sends a message) | M9 |

## Information commands

| Terminal | ACP | Web UI | Status |
|---|---|---|---|
| `/cost` | slash command; `usage_update` (agent86 1.0.20) | Command, plus a "cost" button in the header; the session's cost live in the header with agent86 1.0.20 ("cost n/a" when unpriced) | ✅ (live with 1.0.20) |
| `/tools` | slash command | Command | ✅ |
| `/help` | — | Local help panel listing the available commands | ✅ |
| `agent86 memory list`, `pin`, `unpin`, `forget` (facts and episodes) | `_com.maetek.agent86/memory/list`, `pin`, `forget` (agent86 1.0.22, advertised in `initialize`) | A memory panel from the thread header: facts and episodes, newest first, 20 a page with "Load more", a pinned-only filter, pin and unpin, forget with a confirmation; it waits while a turn runs | ✅ (with 1.0.22) | M10 |
| `/skills`, `/memory`, `/limits` | not in agent86's ACP set | — | ⛔ (wishlist) |
| `/update`, update notice | not over ACP | The bridge checks npm daily for newer agent86 and agent86-web releases; the header and About show a notice with the install command | ✅ M5 (installing is left to you) |
| `/exit` | — | Close the tab or thread. ⏻ Quit stops agent86-web | ✅ (Quit: M6) |

## Status line

| Segment | Source | Web UI | Status |
|---|---|---|---|
| Model | config option | Header | ✅ |
| Phase (thinking, running a tool) | derived from updates | Spinner plus a label | ✅ |
| Approval mode | config option | Header | ✅ |
| Sandbox type | not over ACP | — | ⛔ |
| Tokens, context use, cost | `usage_update` (agent86 1.0.20); per call, agent86's state events | A context meter and the session cost in the header; each turn's model calls and spend against the cap at its end | ✅ M8 (with 1.0.20) |
| Compaction notice | `compaction_update` (agent86 1.0.20, opt-in) | One collapsed "Context compacted" entry with the summary | ✅ M8 |
| Sub-agent progress and cost | agent86's state events (`subagent`, `model_call` with `card`) | Status, model calls, and cost on the delegation card | ✅ M8 |
| Guardrail findings | agent86's state events (`guardrail`) | One quiet line in the thread, findings on request | ✅ M8 |
| Routed model | agent86's state events (`route`) | "routed: <model>" in the header | ✅ M8 |

## Secrets, trust, configuration

| Terminal feature | ACP | Web UI | Status |
|---|---|---|---|
| `request_secret` masked prompt | `_com.maetek.agent86/secret/request` (agent86 1.0.23, to a client that claims a masked entry; agent86-web does) | A masked prompt over the conversation with the model's reason, a note when it replaces a value, and "remember for this project" (pre-checked when remembered, only with a keyring); Decline, Esc, ✕, Stop, and the turn ending all decline. The value goes straight to agent86 and is kept nowhere in the page | ✅ (with 1.0.23); before 1.0.23 ⛔ ([Q3](OPEN_QUESTIONS.md#q3-secrets)) | M10 |
| `/secret NAME` (enter one, remember it for the project) | `_com.maetek.agent86/secret/set`, `list`, `forget` (agent86 1.0.23) | A secrets panel from the thread header: names with a "remembered" badge, a masked entry with remember (only with a keyring), forget with a confirmation, and agent86's warnings. `/secret <text>` typed in the message box is not sent (it would stay in the thread); the panel opens instead. Before 1.0.23: explains how to remember the secret at the terminal; remembered secrets load automatically | ✅ (with 1.0.23) | M10 |
| `/secret` (list names) | slash command | Command | ✅ |
| Project trust question | never asked over ACP | A banner, then a review dialog showing the file. The bridge records trust by hash and passes `--trust-project` ([ADR 0004](adr/0004-project-trust-from-the-browser.md)). | ✅ M4. Browser trust is not seen by the terminal. |
| `/config mcp` | none | Terminal only | ⛔ |
| `/limits` and the offer to raise a reached limit | none | Terminal only | ⛔ |

## Things the web UI adds

These are presentation features with no terminal counterpart. None of them changes agent behavior.

- Several threads side by side, and a persistent session sidebar
- Rich diffs, collapsible sections, copy buttons, and links to files
- A log drawer showing agent86's stderr notes for each thread, plus agent86-web's own connection events
- Reconnect after a reload while the agent keeps working
