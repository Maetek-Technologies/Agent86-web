# Changelog

All notable changes to agent86-web. Release notes for each version are in [docs/releases/](docs/releases/).

## 0.3.0 (unreleased)

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
