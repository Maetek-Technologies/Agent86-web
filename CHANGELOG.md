# Changelog

All notable changes to agent86-web. Release notes for each version are in [docs/releases/](docs/releases/).

## 0.4.2 (2026-11-16)

agent86 1.0.22's memory and 1.0.23's secrets over ACP, each detected from what agent86 advertises, so an older agent86 looks as before. See [docs/releases/v0.4.2.md](docs/releases/v0.4.2.md) and M10 in [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md#m10-agent86-web-042).

- A memory panel (agent86 1.0.22): facts and episodes, a page at a time, a pinned-only filter, pin and unpin, and forget with a confirmation.
- A secrets panel (agent86 1.0.23): the names held, a "remembered" badge, a masked entry with remember-for-this-project (when there is a keyring), forget, and agent86's warnings.
- A masked prompt when the model asks for a secret, with its reason; anything but Enter declines. The approval inbox lists it, and lists a limit question by its limit.
- `/secret <text>` in the message box is kept out of the thread when agent86 takes secrets from agent86-web; the secrets panel opens instead.
- A new launch link opened in a tab that is still open signs it in again without a reload, so a restarted agent86-web resumes the open threads instead of replaying them.
- The bridge: the six memory and secret requests allowed, the masked-entry claim passed to agent86, a secret request with no tab declined, and `AGENT86_WEB_TRANSCRIPT=<file>` to record relayed messages with secret values hidden.

## 0.4.1 (2026-11-16)

agent86 1.0.21's ACP additions, each detected from what agent86 advertises or sends, so an older agent86 looks and reconnects as before. See [docs/releases/v0.4.1.md](docs/releases/v0.4.1.md) and M9 in [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md#m9-agent86-web-041).

- A sub-agent's approval says which sub-agent asks (with a link to its delegation card), the git worktree it works in, and its spend beside the turn's and the cap.
- An approval inbox beside the thread: the question being asked and those waiting behind it, in agent86's order, with a count; it empties when the turn is stopped.
- Reconnecting reopens the session with `session/resume` when agent86 offers it and the tab still has the conversation, so nothing is replayed; `session/load` otherwise.
- A turn cut off by agent86 stopping is shown as interrupted once the thread reconnects with the steps agent86 kept, with a Continue button.
- A cost under $0.0001 shows as "<$0.0001"; the bridge logs each agent86's process id.

## 0.4.0 (2026-11-15)

agent86 1.0.19 and 1.0.20's ACP additions, each detected from what agent86 sends or advertises, so an older agent86 looks as before. See [docs/releases/v0.4.0.md](docs/releases/v0.4.0.md) and M8 in [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md#m8-agent86-web-040).

- File edits as real diffs, built from the whole file before and after (agent86 1.0.19's ACP `diff` content), in the approval and on the finished card, with "whole file". Fixed: a stray `diff <path>` line above an edit's result with agent86 1.0.19.
- The file and first changed line on file tool cards (ACP `locations`), and an icon of its own for search tools.
- A context meter and the session's cost in the thread header (ACP `usage_update`, agent86 1.0.20); "cost n/a" when agent86 has no price.
- A compaction as one collapsed entry with its summary (ACP `compaction_update`, opt-in).
- With agent86's state events (1.0.20, opt-in): each turn's model calls and spend against the cost cap, a sub-agent's status, calls, and cost on its delegation card, guardrail notices, and the routed model.
- The session list reads agent86 1.0.20's namespaced folder marker, falling back to the old one.

## 0.3.0 (2026-11-14)

Settings that last. See [docs/releases/v0.3.0.md](docs/releases/v0.3.0.md) and M7 in [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md#m7-agent86-web-030).

- Fixed: the default approval mode was forgotten whenever agent86-web restarted (it lived in the browser, per port), and a thread fell back to agent86's default mode after a reload, an idle restart, or trusting a project. The default is now kept by agent86-web in `~/.agent86-web/settings.json`, and each thread keeps its own mode and model.
- "make default" next to a thread's mode selector.
- A saved port: `agent86-web --port <n> --save-port` opens on the same port every time (also `AGENT86_WEB_PORT`). A port in use is reported, not swapped for another.
- Opening a new launch link in an old tab of the same port signs it in again.

## 0.2.0 (2026-11-13)

Shell polish and agent86 1.0.17 support. See [docs/releases/v0.2.0.md](docs/releases/v0.2.0.md) and M6 in [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md#m6-agent86-web-020).

- The sessions panel can be resized by dragging its edge, and its width and shown/hidden state are remembered.
- Threads can be renamed from their tab or the sessions list. With agent86 1.0.17, the name is saved in agent86 too.
- A Quit button stops agent86-web and closes the tab.
- The logs drawer shows connection events, has a copy button, and flags ignored project settings.
- A default approval mode for new threads, in Settings & about.
- The header reads `AGENT86`.
- Clearer wording in the trusted-projects list.
- With agent86 1.0.17, each workspace lists only its own sessions.

## 0.1.0 (2026-11-10)

First release: chat, tool approvals with diffs, several threads, saved sessions (including terminal ones), workspace, model, and mode pickers, `/` commands, `@` mentions, project trust, and update notices. See [docs/releases/v0.1.0.md](docs/releases/v0.1.0.md).
