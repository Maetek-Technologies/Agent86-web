# Open questions

Each question has a recommendation. Settle each one before the milestone listed and record the answer here (and in an ADR if it is architectural). Settled questions stay listed, marked **Decided**, so the reasoning is kept.

## Decided

### Q1. Package and repository names
**Decided 2026-11-10:** the npm package and the command are both `agent86-web`, unscoped. Before the first publish (M5), check that the name is still free on npm. If it has been taken, use a scope and record it here.

### Q2. Project trust
**Decided 2026-11-10:** the browser may trust a project, through a "Trust this project" confirmation. The design is in [ADR 0004](adr/0004-project-trust-from-the-browser.md): the dialog shows the project's `.agent86/config.toml`, the bridge remembers the decision by the file's SHA-256 hash and asks again when the file changes, and trusted threads are started with `--trust-project`. Lands in M4.

### Q7. Branding
**Decided 2026-11-10:** agent86-web may use the agent86 name, logo, and mascot. Credit agent86 and Maetek Technologies in the README and the About dialog, and link to the upstream repository.

### Q8. License for this repository
**Decided 2026-11-10:** MIT, matching agent86. See [LICENSE](../LICENSE).

### Q9. Remote access in phase 1
**Decided 2026-11-10:** SSH port forwarding only. The bridge stays bound to loopback, and the README documents `ssh -L`. Real remote access waits for phase 2's authentication.

## Open

### Q3. Secrets
**Needed by:** M4 (docs), phase 2 (feature)
ACP forbids an agent asking for passwords or keys through a form, so agent86 doesn't offer `request_secret` over ACP. A browser-side secret prompt would need either a change in agent86 or the bridge writing into agent86's keyring layout directly, which couples to agent86 internals and is ruled out by ADR 0003.
**Recommendation:** phase 1 documents the terminal workflow (`/secret NAME`, remembered for the project, then it loads into web threads automatically). Phase 2 offers environment-variable injection from a settings page. Raise a protocol-level secret request with agent86 and ACP upstream.

### Q4. Model and MCP configuration screens
**Needed by:** after M5
`/config model` and `/config mcp` have no ACP messages. The bridge could edit `~/.agent86/config.toml` itself, but that duplicates agent86's comment-preserving writer and its secret guard.
**Recommendation:** not in phase 1. Link to terminal instructions instead. Revisit if agent86 adds a non-interactive config command (e.g. `agent86 config set`) the bridge could call.

### Q5. Process per thread versus a shared process
**Needed by:** M4
One agent86 process per thread allows parallel turns but costs memory (each may load the embedding model). One process with several sessions is lighter but allows only one turn at a time across all of them.
**Recommendation:** one process per thread, with `--max-agents` and idle reaping. Measure memory in M4 and revisit.

### Q6. ACP library
**Needed by:** M1
Use the ACP project's official TypeScript library, or hand-write a small client typed from the JSON schema?
**Recommendation:** evaluate the official library in M1, checking browser compatibility (no Node-only stream dependencies), bundle size, and support for the client role over a custom transport. Use it if it fits. Otherwise hand-write, as agent86 did on the agent side.

### Q10. Minimum agent86 version and update notices
**Needed by:** M1
**Recommendation:** require agent86 ≥ 1.0.15. The bridge checks the version at startup and in `initialize`. Show a non-blocking notice when a newer agent86 release exists, which needs one GitHub API call a day and can be turned off, as agent86's own check can.

### Q11. Distribution beyond npm
**Needed by:** after M5
Possible options: a desktop wrapper (Tauri) for a native window and tray icon, or a Homebrew formula.
**Recommendation:** npm only for v0.1.
