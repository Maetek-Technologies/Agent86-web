# Project plan

**Status:** M5 done except publishing: v0.1.0 is packaged, reviewed, and ready; publishing needs an npm token and a tag
**Last updated:** 2026-11-10
**Upstream baseline:** agent86 v1.0.15 (`Maetek-Technologies/agent86@fef902d`)

This document is the source of truth for what agent86-web is, what it is not, and the order it will be built in. Update it whenever a milestone lands or a decision changes.

## 1. Vision

agent86 is an agentic harness that runs on the command line. Its interactive interface is a well-crafted terminal UI, but a terminal limits some things: long diffs, many threads side by side, browsing past sessions, rich Markdown, and using the agent from a tablet or another machine.

agent86-web is a **browser interface for the agent86 you already run**. It shows the same conversation, the same approvals, and the same sessions in a web page, while agent86 keeps doing the work with your config, keys, sandbox, and memory.

## 2. Decisions so far

| Question | Decision | Record |
|---|---|---|
| Where does the agent run? | **Phased.** Phase 1 drives a local agent86 through a bridge. Phase 2 adds a hosted backend later. | [ADR 0001](adr/0001-acp-over-websocket.md) |
| Who is it for? | **A personal developer tool**, for people who already use agent86 locally. | — |
| Frontend stack | **React + TypeScript + Vite**, with Tailwind and shadcn/ui | [ADR 0002](adr/0002-react-vite-spa.md) |
| Does this repo change agent86? | **No.** A web client plus a standalone bridge, talking only to `agent86 acp`. | [ADR 0003](adr/0003-standalone-bridge.md) |
| Can the browser trust a project? | **Yes**, after showing the file's contents. The bridge remembers the decision by the file's hash and starts trusted threads with `--trust-project`. | [ADR 0004](adr/0004-project-trust-from-the-browser.md) |
| Name, branding, license | Published as `agent86-web` on npm. A Maetek Technologies project (repository `Maetek-Technologies/Agent86-web`), using the agent86 name, logo, and mascot. MIT license, copyright Maetek Technologies. | [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md#decided) |
| Remote access in phase 1 | SSH port forwarding only. The bridge stays on loopback. | [SECURITY.md](SECURITY.md#5-explicit-phase-1-limits) |

## 3. Goals and non-goals

### Goals (phase 1)

- **The conversation:** a streaming reply rendered as Markdown, a thinking model's reasoning (collapsible), and every tool call with its arguments and result.
- **Approvals:** side-effecting calls are approved in the browser, with the diff or the command in view. The approval mode (`ask`, `auto`, `deny`) can be switched per thread.
- **Sessions:** list, open, and continue saved agent86 sessions, including ones started at the terminal. A thread started in the browser can be continued with `agent86 --resume <id>`.
- **Models:** pick the model per thread from agent86's configured models and each provider's live list.
- **Workspaces:** choose the project directory a thread runs in, limited to the roots the user allowed when starting the bridge.
- **Several threads at once**, in tabs or a sidebar, each running independently.
- **Cancel** a turn at its next safe point.
- **Slash commands** that agent86 offers over ACP (`/mode`, `/model`, `/thinking`, `/toolview`, `/resume`, `/secret`, `/cost`, `/tools`).
- **Project trust:** review and trust a project's `.agent86/config.toml` from the browser ([ADR 0004](adr/0004-project-trust-from-the-browser.md)).
- **Safe by default:** the bridge listens only on loopback, needs a per-launch token, and rejects foreign origins (see [SECURITY.md](SECURITY.md)).
- **One-command install:** `npx agent86-web`.

### Non-goals (phase 1)

- Changing agent86 or depending on its internals (database schema, trace files, Rust code).
- Re-implementing the agent loop, tools, or providers in the browser.
- Configuration management screens (`/config model`, `/config mcp`). These stay in the terminal for now, because ACP has no messages for them. See [FEATURE_PARITY.md](FEATURE_PARITY.md).
- Entering secrets in the browser. ACP forbids an agent asking for a password or key through a form, and agent86 does not offer `request_secret` over ACP. Secrets remembered for a project at the terminal still work. See [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md#q3-secrets).
- Multi-user accounts, remote access beyond SSH port forwarding, and mobile apps. These are phase 2 or later.
- Pixel-matching the terminal interface. The web UI follows the terminal's information and behavior, not its look.

## 4. Phases and milestones

### Phase 1: local bridge

| # | Milestone | Outcome | Exit criteria |
|---|---|---|---|
| M0 ✅ | **Planning** | These documents | Plan reviewed, open questions triaged |
| M1 ✅ | **Skeleton** | pnpm monorepo (`web`, `bridge`, `acp-client`), CI (lint, typecheck, test), the bridge serves the SPA and relays one `initialize` round trip to `agent86 acp` | `pnpm dev` shows agent86's handshake answer (version, capabilities) in the browser |
| M2 ✅ | **Chat** | `session/new`, `session/prompt`, streaming `agent_message_chunk` and `agent_thought_chunk` rendered as Markdown, `session/cancel`, error display | A full text-only conversation against a real model, plus cancel |
| M3 ✅ | **Tools and approvals** | Tool-call cards (`tool_call`, `tool_call_update`), `session/request_permission` dialog with a diff viewer for file edits and a command view for `run_command` | Edit a file in a test project through the browser with an approval, and decline one |
| M4 ✅ | **Sessions, models, workspaces** | Session sidebar (`session/list`, `session/load` replay), workspace picker limited to `--root`, mode and model pickers (`session/set_config_option`, `config_option_update`), slash-command menu (`available_commands_update`), several threads at once, the project trust banner and dialog | Resume a session started at the terminal; switch model mid-thread; run two threads in parallel; trust a project and see its MCP servers start |
| M5 | **Hardening and release** | Security review of the bridge, reconnect handling, the agent86 version check, packaging (`npx agent86-web` with the built SPA embedded), end-to-end tests in CI, user docs | v0.1.0 published to npm |
| M6 | **0.2.0: shell polish** | Resizable sessions panel, thread rename, a Quit button, a more useful logs drawer, a default approval mode, the `AGENT86` wordmark, clearer trust wording, and support for agent86 1.0.17 (session lists per workspace, `/rename`). Details below. | v0.2.0 published to npm |

Milestones are vertical slices: each one leaves a usable app. Details for each are in [ARCHITECTURE.md](ARCHITECTURE.md) and [UI_DESIGN.md](UI_DESIGN.md).

### M6: agent86-web 0.2.0

Feature requests gathered after M5, on 2026-11-13, and built the same day. No bridge workarounds for agent86 behavior: where agent86 is the cause, the fix is requested upstream for agent86 1.0.17 (see §5), and agent86-web uses it once it is there.

**6.1 Resizable sessions panel** (web)
- A 4 px drag handle on the sidebar's right edge (`role="separator"`, `aria-orientation="vertical"`, `aria-valuenow`) replaces the fixed `w-64` width.
- The width is limited to 180–560 px. Double-clicking the handle resets it to 256 px, and Left and Right arrow keys resize it when the handle has focus.
- The width and the existing shown/hidden state (not remembered today) are kept in localStorage under a new key in `threads/storage.ts`.
- Tests: a unit test for the width limits, and a Playwright test for dragging and keeping the width across a reload.

**6.2 Rename threads** (web, using agent86 1.0.17 when available)
- Double-click a tab's title, or use the pencil shown when hovering over a sidebar row, to edit the name in place. Enter saves, Esc cancels, and empty names are refused. Names are trimmed to one line of at most 200 characters.
- `ThreadMeta` gains `renamed: true`, so the first prompt no longer overwrites a name the user chose (`ThreadView.tsx`, `onPrompt`).
- Custom names are kept per session ID in localStorage (`agent86web.titles.v1`). The sidebar and reopened tabs show them, with agent86's title in the tooltip.
- With agent86 1.0.17 or later, which lists `/rename` in its commands (`available_commands_update`), the name is also saved in agent86's database, so `/resume` at a terminal and other browsers see it. The name is saved locally at once and sent to agent86 when the session is open and idle (agent86 refuses requests during a turn). A rename made from the sidebar for a session that is not open is sent the next time it is opened. The command must not appear in the transcript or the prompt history.
- With older agent86 versions, the name stays local to this browser, and the rename UI says so.

**6.3 Quit button** (web, plus one new bridge endpoint)
- A power button in the header asks for confirmation, warns if any thread has a turn running or an approval waiting, closes the threads, then calls `POST /api/shutdown`.
- Bridge: the endpoint needs the session cookie, the origin check, and the `x-agent86-web` header, like `POST /api/trust`. It replies, then runs the same shutdown as Ctrl+C (stops every agent86, closes the server). `startBridge` takes an `onShutdownRequested` callback that `cli.ts` hooks into its SIGINT wait, and the terminal prints "Stopped from the browser."
- The page calls `window.close()`. Browsers allow that only for tabs a script opened or tabs with a single history entry, which the tab agent86-web opens at launch usually is. Otherwise the page is replaced by "agent86-web has stopped. You can close this tab." A `BroadcastChannel` tells other open tabs of the app to show the same screen.
- Security: a new SECURITY.md row. The worst a signed-in page can do with it is stop agent86-web. The endpoint is refused without the cookie or the header.
- Tests: bridge tests (refused without a session, the origin, or the header; shuts down otherwise), and a Playwright test.

**6.4 A more useful logs drawer** (web)
- agent86 writes to stderr only for problems and notable events (memory, sandbox, MCP servers that fail, model lists that fail, ignored untrusted settings, save failures), so the drawer of a healthy thread is empty. That is expected, not an ACP limitation: ACP has no log channel, and the bridge forwards stderr itself as `_agent86web/stderr`.
- The client adds its own connection events, marked `[agent86-web]`: connected, session started or reopened, reconnecting (with the reason), restarted with the project's settings after trust, and closed (the close reason includes agent86's exit status).
- A copy button and a notice badge when the untrusted-settings note arrives, both described in UI_DESIGN.md §3.5 but not built in M4.
- The button reads `logs (0)`, dimmed, while there is nothing to show.
- Tests: a Playwright test with the mock agent's untrusted-settings note, which shows the badge and the line.

**6.5 Default approval mode** (web)
- A browser preference with the choices "agent86's default" (the default), `ask`, `auto`, and `deny`. After a thread starts or reopens, if agent86 offers the chosen value for its `mode` option and the current value differs, the client sets it with `session/set_config_option`.
- It sits in the About panel, renamed "Settings & about".
- Choosing `auto` asks for confirmation once, since it turns off approvals in every new thread. The thread header already shows the current mode. A SECURITY.md note covers it.
- Already possible without this, and documented in the README: `AGENT86_APPROVAL=auto` in the environment that starts agent86-web, or `approval = "auto"` under `[guardrails]` in `~/.agent86/config.toml` (which the terminal also uses).

**6.6 Wordmark**
- The header shows `AGENT86` instead of `AGENT 86` (`App.tsx`), keeping the monospace upper-case style. UI_DESIGN.md follows.

**6.7 Trust wording**
- The empty trusted-projects list says: "None yet. If a project's `.agent86/config.toml` has settings that need trust, its thread shows a banner where you can review and trust it." The banner itself is unchanged (built in M4); it appears only when agent86 reports ignored settings.

**6.8 agent86 1.0.17**
- Session lists: with 1.0.17, agent86 records the directory of terminal sessions and stops reporting unknown ones under every workspace. agent86-web needs no change, only the FEATURE_PARITY note. Sessions saved before 1.0.17 that were never opened from a directory stop showing in the sidebar. Resuming one at a terminal (`agent86 --resume <id>`) in the right directory brings it back.
- Rename: see 6.2.
- 1.0.17 is recommended, not required. `MIN_AGENT86_VERSION` stays where it is, and the About panel notes which features need 1.0.17.

### Phase 2: hosted (sketch)

Phase 2 is not scheduled. It starts only after phase 1 has been used for real. [HOSTED.md](HOSTED.md) sketches it: sign-in, an isolated container per session that runs `agent86 acp`, keys kept in a secrets store, workspaces cloned from Git, and a gateway that speaks the same WebSocket-plus-ACP protocol as the local bridge. If phase 1 keeps the client independent of the transport, the client needs no rewrite.

| # | Milestone | Outcome |
|---|---|---|
| H1 | Gateway and container runner | One user, one container per session, same client |
| H2 | Accounts and keys | OIDC sign-in, per-user key storage injected as environment variables |
| H3 | Workspaces | Clone from GitHub, push results back, persistent `~/.agent86` per user |
| H4 | Limits and operations | Quotas, idle reaping, observability, billing if needed |

## 5. Upstream dependencies and wishlist

Phase 1 uses only what `agent86 acp` offers today. Some terminal features have no ACP equivalent. These are listed here so they can be raised with agent86's maintainers later. This repository will not patch agent86 ([ADR 0003](adr/0003-standalone-bridge.md)).

| Wish | Why the web UI wants it | Workaround until then |
|---|---|---|
| Usage and cost updates per turn (e.g. ACP `session_info_update` or a `_meta` field) | A live status line like the terminal's | Run `/cost` on demand |
| Remembered permission choices ("always allow") | Fewer prompts in long sessions | Switch the thread to `auto` mode |
| ACP `terminal/*` | Live command output in a terminal widget | Command output arrives as text in the tool result |
| A safe way to enter secrets | `request_secret` in the browser | `/secret NAME` at a terminal, remembered for the project |
| `agent86 trust <path>`, or trust over ACP | Record browser trust in agent86's own file, so the terminal honors it too and the hash-to-spawn race goes away | The bridge keeps its own record and passes `--trust-project` ([ADR 0004](adr/0004-project-trust-from-the-browser.md)) |
| Plans (`plan` updates) | A to-do view of the agent's plan | None |
| Images in prompts | Paste screenshots | None |
| ✅ **Done in agent86 1.0.17:** record each session's directory, terminal sessions included, and leave sessions with no known directory out of `session/list` results filtered by `cwd` | Before, a terminal session was reported in the directory the listing process started in, so the bridge saw it under every workspace | Before 1.0.17, none (decided 2026-11-13: no bridge workaround) |
| ✅ **Done in agent86 1.0.17:** rename a session (`/rename <title>`, at the terminal and over ACP) | Thread names that the terminal and other browsers see too | Before 1.0.17, browser-local names (M6, 6.2) |

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A localhost server that can run commands is attacked from a web page (CSRF, DNS rebinding, cross-site WebSocket hijacking) | Remote code execution on the user's machine | Loopback-only bind, a per-launch token, `Host` and `Origin` allowlists, no CORS, CSP. See [SECURITY.md](SECURITY.md). |
| agent86's ACP surface changes | The client breaks | Pin a minimum agent86 version, check `initialize`'s `agentInfo` and capabilities, validate messages against the ACP schema in tests |
| ACP itself evolves (v2) | Protocol drift | Keep protocol code in `packages/acp-client`; type it from the published schema |
| One turn at a time per agent86 connection | No parallel threads in one process | One agent86 process per thread (see [ARCHITECTURE.md](ARCHITECTURE.md#process-model)) |
| Many processes, each loading the embedding model | Memory use with many threads | Idle processes are stopped and restarted on demand with `session/load`; a cap on live processes |
| The terminal UI and the web UI drift apart in behavior | Confusing differences | [FEATURE_PARITY.md](FEATURE_PARITY.md) is kept current |

## 7. Status log

| Date | Change |
|---|---|
| 2026-11-10 | M0 started: initial plan, architecture, parity, security, UI, testing, hosted sketch, and ADRs 0001–0003 |
| 2026-11-10 | Decided: trust from the browser (ADR 0004), `agent86-web` npm name, agent86 branding with permission, MIT license, SSH forwarding for remote use |
| 2026-11-10 | **M1 done.** pnpm monorepo (`bridge`, `web`, `acp-client`, `mock-agent`). The bridge has the version check, launch token and session cookie, Host, Origin, and CSRF checks, CSP, the static SPA, one `agent86 acp` per WebSocket, and the policy filter (method allowlist, forced capabilities, cwd pinned to the workspace, `mcpServers` stripped). The web client signs in, removes the token from the URL, and shows the `initialize` answer with a compatibility check. 73 unit and integration tests, plus 6 Playwright tests, one of them against the real agent86 1.0.15. CI covers lint, format, typecheck, `pnpm audit`, tests on Linux, macOS, and Windows, and end-to-end tests on Node 20 and 22. Q6 decided: the official ACP SDK. |
| 2026-11-10 | **M2 done.** `acp-client` has a session model: a pure reducer folding `session/update` into a transcript (user, reasoning, reply, tool, notice, end of turn), plus `Agent86Client` and `AgentSession` (prompt, cancel, subscribe). The web client has a thread view: streamed Markdown (react-markdown and GFM, raw HTML skipped, links limited to http, https, and mailto, images shown as links, finished blocks memoized), reasoning that folds once the answer starts, a phase line with elapsed time, Esc and a Stop button to cancel, errors with the trace hint, and model-setup help when `session/new` fails. The exit criterion was checked against the real agent86 1.0.15 talking to a scripted OpenAI-compatible server (`mock-openai.js`); no hosted model's key was available. 128 unit and component tests (including an XSS corpus) and 20 Playwright tests, half of them against the real agent86. Found: agent86 refuses `session/new` when its model has no key, though `initialize` succeeds; and it appends its own `[cancelled]` marker, which the client drops in favor of its notice. Code highlighting moved to M3, alongside the diff viewer. |
| 2026-11-11 | **M3 done.** Permission requests are part of the session state (`PendingPermission`, answered with `respond`, `reject`, or `cancelled` on cancel and on close, as ACP requires). Tool calls render as cards (status, argument summary, expandable arguments, change, and result; declined calls show as declined, not failed). The approval panel shows agent86's warning, a unified diff with line numbers, a new file, or the command or code, with numbered options. Number keys answer, Esc rejects, focus goes to the panel (not a button), and the tab title flags a waiting approval. Ctrl+O expands every card. Syntax highlighting (lowlight, rendered through hast, never innerHTML) covers Markdown code, diffs, and arguments, loaded lazily as its own chunk. Found: agent86 sends approval detail as one text block (an optional `Warning:` paragraph, then a unified diff, `new file: …`, or the command), not ACP's structured `diff` content, so the client parses that format. The exit criterion was checked against the real agent86 1.0.15, which edited a real file once approved and left it unchanged once declined. 154 unit and component tests and 34 Playwright tests, half against the real agent86. |
| 2026-11-11 | **M4 done.** Bridge: a thread registry where a process outlives its socket (per-generation request ids, agent requests declined when no page can answer, agent86's first `initialize` answer reused for a reattached page, `?fresh=1` restart, `--idle-timeout`, `--max-agents` with LRU eviction), agent86's stderr forwarded as `_agent86web/stderr` notifications, and `/api/sessions`, `/api/workspaces`, `/api/files`, and `/api/trust`. Client: `loadSession` (waiting out a running turn), `setConfigOption`, file links in prompts, and the logs store with agent86's untrusted-settings note. Web: a shell with a session sidebar per workspace, threads in tabs remembered across reloads, a workspace picker, model and mode selectors (Shift+Tab cycles the mode), the `/` command menu, `@` file mentions, per-workspace prompt history, the logs drawer, and the trust banner, review dialog, and trusted-projects list (ADR 0004). All four exit criteria pass end to end against the real agent86 1.0.15: a session started with `agent86 run` resumes in the browser, the model switches mid-thread, two threads run at once, and trusting a project starts its MCP server (`mcp__demo__mock_echo` appears in `/tools`). Found: agent86 refuses every request during a turn, `initialize` included; `/tools`-style commands are not saved in the session; sessions started at a terminal are listed under every workspace; the npm `agent86` launcher costs about 45 MB per thread on top of agent86's own 15–18 MB. 200 unit and component tests and 60 Playwright tests. |
| 2026-11-11 | **M5 (up to publishing).** Packaging: `agent86-web` 0.1.0 with a user README and LICENSE, no source maps (333 KB tarball, one runtime dependency, `ws`), and `check-dist.mjs` before publishing (web client present, no inline script, style, or handler). CI's new package job packs the tarball, installs it into an empty project on Node 20, and runs the browser tests against the installed command. Security review (SECURITY.md §6): all items checked and tested; fixed a project config symlinked outside the workspace being readable in the trust dialog, added a frame rate limit (500 per 10 s), and shared session-list processes. Update notices (Q10): a daily npm check, shown in the header and About, turned off with `--no-update-check`. Release: `.github/workflows/release.yml` publishes the packed tarball with provenance when a `v0.1.0` tag is pushed, using an `NPM_TOKEN` secret, and creates the GitHub release from `docs/releases/v0.1.0.md`. Remaining for the exit criterion: add the secret and push the tag. |
| 2026-11-11 | The repository moved to `Maetek-Technologies/Agent86-web`. The package's repository URLs, the license (copyright Maetek Technologies), and the credits follow. |
| 2026-11-13 | **M6 planned** (0.2.0): resizable sidebar, thread rename, Quit button, logs drawer improvements, default approval mode, `AGENT86` wordmark, trust wording. Two agent86 changes requested for 1.0.17 (session directories, `/rename`). Decided: no bridge workaround for the session-list problem. |
| 2026-11-13 | **M6 built (up to publishing).** agent86 1.0.17 shipped both requested changes. Client: `session_info_update` titles, `AgentSession.command()` for quiet slash commands (kept out of the transcript), `Agent86Client.note()` for agent86-web's own log lines. Bridge: `POST /api/shutdown` (cookie, origin, and header checks) and the CLI's "Stopped from the browser." Web: resizable, remembered sessions panel; rename from tabs and the sidebar, saved in agent86 with `/rename` when it is offered and kept in the browser otherwise; ⏻ Quit with a confirmation, `window.close()`, a stopped screen, and a `BroadcastChannel` for other tabs; connection events, a copy button, and the untrusted badge in the logs drawer; the default approval mode under Settings & about (with a confirmation for `auto`); the `AGENT86` wordmark; the trust wording. The mock agent answers like 1.0.17 when `MOCK_AGENT86_VERSION=1.0.17`. Tests: 223 unit and component tests (11 new), and 11 new Playwright tests, one against the real agent86 1.0.17 (a rename reaches agent86's own session list). Found: the bridge's 3-second session-list cache can show the previous list right after a change. Remaining: bump the version, tag `v0.2.0`. |
