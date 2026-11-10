# Open questions

Each question has a recommendation. Settle each one before the milestone listed and record the answer here (and in an ADR if it is architectural).

## Q1. Package and repository names
**Needed by:** M1
The npm name `agent86-web` and the binary `agent86-web` are assumed. Check that the npm name is free, and decide whether to publish under a scope (e.g. `@<owner>/agent86-web`).
**Recommendation:** an unscoped `agent86-web` if it is available and the agent86 maintainers don't object. Otherwise use a scope.

## Q2. Project trust
**Needed by:** M4
Over ACP, agent86 never asks the trust question, so an untrusted project's risky settings (MCP servers, providers, approval changes) are silently ignored. Options:
- (a) Show the "ignored untrusted settings" notes from stderr as a banner telling the user to run `agent86` once in that project at a terminal.
- (b) Offer a "Trust this project" button that restarts the thread's process with `--trust-project`. This is convenient, but the UI would then make a security decision that agent86 deliberately keeps at the terminal, and the bridge would have to show what is being trusted.
**Recommendation:** (a) in phase 1. Consider (b) later, with a confirmation that shows the project's config file contents.

## Q3. Secrets
**Needed by:** M4 (docs), phase 2 (feature)
ACP forbids an agent asking for passwords or keys through a form, so agent86 doesn't offer `request_secret` over ACP. A browser-side secret prompt would need either a change in agent86 or the bridge writing into agent86's keyring layout directly, which couples to agent86 internals and is ruled out by ADR 0003.
**Recommendation:** phase 1 documents the terminal workflow (`/secret NAME`, remembered for the project, then it loads into web threads automatically). Phase 2 offers environment-variable injection from a settings page. Raise a protocol-level secret request with agent86 and ACP upstream.

## Q4. Model and MCP configuration screens
**Needed by:** after M5
`/config model` and `/config mcp` have no ACP messages. The bridge could edit `~/.agent86/config.toml` itself, but that duplicates agent86's comment-preserving writer and its secret guard.
**Recommendation:** not in phase 1. Link to terminal instructions instead. Revisit if agent86 adds a non-interactive config command (e.g. `agent86 config set`) the bridge could call.

## Q5. Process per thread versus a shared process
**Needed by:** M4
One agent86 process per thread allows parallel turns but costs memory (each may load the embedding model). One process with several sessions is lighter but allows only one turn at a time across all of them.
**Recommendation:** one process per thread, with `--max-agents` and idle reaping. Measure memory in M4 and revisit.

## Q6. ACP library
**Needed by:** M1
Use the ACP project's official TypeScript library, or hand-write a small client typed from the JSON schema?
**Recommendation:** evaluate the official library in M1, checking browser compatibility (no Node-only stream dependencies), bundle size, and support for the client role over a custom transport. Use it if it fits. Otherwise hand-write, as agent86 did on the agent side.

## Q7. Branding
**Needed by:** M2 (UI), phase 2 (hosting)
May agent86-web use the agent86 name, logo, and mascot? What license covers the logo image?
**Recommendation:** ask the agent86 maintainers. Until then, use the name descriptively ("a web interface for agent86") and a neutral icon.

## Q8. License for this repository
**Needed by:** M1
**Recommendation:** MIT, matching agent86.

## Q9. Remote access in phase 1
**Needed by:** M5
Some users will want to use the UI from a tablet or another computer. Binding beyond loopback needs real authentication and TLS.
**Recommendation:** document SSH port forwarding only. Real remote access waits for phase 2's authentication.

## Q10. Minimum agent86 version and update notices
**Needed by:** M1
**Recommendation:** require agent86 ≥ 1.0.15. The bridge checks the version at startup and in `initialize`. Show a non-blocking notice when a newer agent86 release exists, which needs one GitHub API call a day and can be turned off, as agent86's own check can.

## Q11. Distribution beyond npm
**Needed by:** after M5
Possible options: a desktop wrapper (Tauri) for a native window and tray icon, or a Homebrew formula.
**Recommendation:** npm only for v0.1.
