# 0004. Projects can be trusted from the browser

## Status

Accepted (2026-11-10). Amends [ADR 0003](0003-standalone-bridge.md) for one read-only file.

## Context

A project's `.agent86/config.toml` can hold settings that start programs, send keys elsewhere, or loosen approvals: MCP servers, providers, guardrails, and the sandbox. agent86 ignores those settings until the user trusts the file. At a terminal, agent86 asks `Trust this file? [y/N]` and remembers a yes by the file's SHA-256 hash in `~/.agent86/trusted-projects.json`. Over ACP it never asks, so a project that was never trusted at a terminal runs in the browser with those settings silently dropped.

The user decided that the web UI should be able to trust a project itself, rather than send people to a terminal.

agent86 v1.0.15 offers `--trust-project` (and `AGENT86_TRUST_PROJECT`) to force trust for one run. Forced trust is **not recorded**: only a yes at the terminal is (`trust::decide` calls `record` only when it asked). agent86 has no command that records trust non-interactively. ADR 0003 rules out writing agent86's own files.

## Decision

- **Detect.** The bridge reads `<workspace>/.agent86/config.toml` read-only, if it exists, along with agent86's stderr notes about ignored untrusted settings. A thread whose project file is untrusted shows a banner: "This project's agent86 settings are being ignored until you trust them."
- **Review.** "Review and trust" opens a dialog showing the file's full contents, with control characters made visible (as agent86 does). It also shows the file's path and hash, and states what trust allows: "these settings can run programs on your machine and change where your keys are sent." The default button is **Cancel**. Trusting needs an explicit click on "Trust this file".
- **Remember.** On a yes, the bridge records `{realpath of the config file, SHA-256 of its bytes, time}` in its own file, `~/.agent86-web/trusted-projects.json` (mode `0600`). It never writes agent86's `trusted-projects.json`.
- **Apply.** When the bridge starts a process for a workspace, it hashes the current file. If the path and hash match a record, it adds `--trust-project` before `acp`. If the file changed, the record no longer matches, so the thread runs restricted and the banner returns, which mirrors agent86's own rule.
- **Restart.** Trusting a project restarts that thread's process with `--trust-project` and calls `session/load`, so the conversation continues with the settings in force.
- **Revoke.** Settings → "Trusted projects" lists the records and removes them.
- **Race.** The file is hashed when the process is spawned. A change between the hash and agent86 reading the file is a known, small window. agent86 may then read a changed file under forced trust. This is documented, and kept small by hashing right before the spawn.

## Consequences

- Untrusted projects can be fixed without leaving the browser, and the decision is informed by the exact file contents.
- Trust given in the browser applies only to threads the bridge starts. agent86 at a terminal will still ask, because the bridge doesn't write agent86's record. Trust given at a terminal is honored automatically, because agent86 checks its own record and the bridge never needs to pass the flag.
- The bridge now reads one file in the workspace, the project's config file, for display and hashing. This is the only exception to ADR 0003's rule that the bridge never reads agent86's files.
- The trust dialog is a security-critical UI element. Its tests and the threats it addresses are in `SECURITY.md` (T16, T17).
- Upstream wish: an `agent86 trust <path>` command, or trust over ACP, would let the browser record trust in agent86's own file and remove the race.
