# Open questions

Each question has a recommendation. Settle each one before the milestone listed and record the answer here (and in an ADR if it is architectural). Settled questions stay listed, marked **Decided**, so the reasoning is kept.

## Decided

### Q1. Package and repository names
**Decided 2026-11-10:** the npm package and the command are both `agent86-web`, unscoped. Before the first publish (M5), check that the name is still free on npm. If it has been taken, use a scope and record it here.

### Q2. Project trust
**Decided 2026-11-10, built in M4:** the browser may trust a project, through a "Trust this project" confirmation. The design is in [ADR 0004](adr/0004-project-trust-from-the-browser.md): the dialog shows the project's `.agent86/config.toml`, the bridge remembers the decision by the file's SHA-256 hash and asks again when the file changes, and trusted threads are started with `--trust-project`. The banner appears when agent86's stderr says it ignored settings that need trust.

### Q7. Branding
**Decided 2026-11-10:** agent86-web may use the agent86 name, logo, and mascot. Credit agent86 and Maetek Technologies in the README and the About dialog, and link to the upstream repository.

### Q8. License for this repository
**Decided 2026-11-10:** MIT, matching agent86. See [LICENSE](../LICENSE).

### Q9. Remote access in phase 1
**Decided 2026-11-10:** SSH port forwarding only. The bridge stays bound to loopback, and the README documents `ssh -L`. Real remote access waits for phase 2's authentication.

### Q6. ACP library
**Decided 2026-11-10 (M1):** use the official [`@agentclientprotocol/sdk`](https://www.npmjs.com/package/@agentclientprotocol/sdk) (Apache-2.0), pinned to an exact version, wrapped in `packages/acp-client`. It is built on Web Streams, so it runs in the browser unchanged. It plays both the client role (the web UI) and the agent role (the mock agent), bundles the v1 schema, and validates messages with zod. The browser transport is a small adapter (`webSocketStream`). The cost is bundle size: the M1 client is about 108 kB gzipped, mostly the SDK and zod. Revisit if that matters, for example by lazy-loading or importing narrower entry points.

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
**Recommendation:** one process per thread, with `--max-agents` and idle reaping. Built that way in M4.
**Measured (M4, Linux, hash embedder):** an idle `agent86 acp` uses 15–18 MB. The npm-installed `agent86` command is a Node launcher that adds about 45 MB per process, so `--agent86 <path to the native binary>` saves most of the cost per thread. Not yet measured: the default sentence-transformers embedder, which loads a model into each process. Revisit if eight threads prove heavy.

### Q10. Update notices
**Needed by:** M5
The minimum version part is done in M1: the bridge refuses agent86 older than 1.0.15 at startup (`agent86 --version`), and the client checks `initialize`'s `agentInfo` again.
**Recommendation:** show a non-blocking notice when a newer agent86 or agent86-web release exists. It needs one GitHub or npm call a day and can be turned off, as agent86's own check can.

### Q11. Distribution beyond npm
**Needed by:** after M5
Possible options: a desktop wrapper (Tauri) for a native window and tray icon, or a Homebrew formula.
**Recommendation:** npm only for v0.1.
