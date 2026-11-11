# Security design (phase 1)

The bridge is a local web server that can make agent86 edit files and run commands. Any web page the user visits can try to talk to a server on `localhost`, so the bridge must be treated as remote-code-execution-adjacent and locked down. This document is the threat model and the required protections. M5 includes a review against it.

## 1. Assets

- The user's files and shell, reachable through agent86's tools (sandboxed, but writing the workspace is the point)
- API keys in the OS keyring and the environment
- Session history and memory (`~/.agent86/memory.db`), which may contain code and secrets the model saw

## 2. Trust boundaries

```
 Other web pages ✗──▶ │ bridge (127.0.0.1) │ ──▶ agent86 acp ──▶ sandbox / disk / network
 Other local users ✗─▶│                    │
 The SPA (trusted) ──▶│                    │
```

- The **SPA** that the bridge itself served, holding the session cookie, is trusted.
- **Everything else** is untrusted: other origins in the same browser, other processes and users on the machine, and the network.
- **Model output** is untrusted content (prompt injection). It is rendered, never executed, by the client.

## 3. Threats and required controls

| # | Threat | Control |
|---|---|---|
| T1 | **Network exposure:** someone on the LAN connects | Bind to `127.0.0.1` (or `::1`) only. Refuse any other `--host` in phase 1. |
| T2 | **Cross-site WebSocket hijacking:** `evil.com` opens `ws://127.0.0.1:PORT/acp/...` | Check that the WebSocket `Origin` equals the bridge's own origin exactly. Require the session cookie. Browsers send `SameSite=Strict` cookies only on same-site requests. |
| T3 | **DNS rebinding:** `evil.com` resolves to 127.0.0.1 | Allow only these `Host` header values: `127.0.0.1:PORT`, `localhost:PORT`, and `[::1]:PORT`. Reject everything else with 403. |
| T4 | **CSRF on REST endpoints** | Cookie is `SameSite=Strict`. State-changing routes require `POST` with a custom header (`X-Agent86-Web: 1`) and the origin check. No CORS headers are ever sent. |
| T5 | **Port scanning or guessing by a local process or page** | A per-launch 256-bit token is needed to obtain the cookie. It is passed in the URL fragment (never sent to the server in logs or as a referrer), exchanged once at `POST /api/login`, then removed from the address bar. The token expires once used, or 5 minutes after launch. |
| T6 | **Other local users** on a shared machine | The token protects the server. The bridge may also write the URL to a file readable only by its owner (`0600`) instead of printing it when `--no-open` is used. |
| T7 | **Browser chooses a working directory outside the allowed roots** | Resolve `cwd` with symlinks followed (`realpath`), and require it to be inside a `--root`. The directory listing API applies the same jail, lists names only, and skips dotfiles by default. |
| T8 | **Browser injects an MCP server** (`session/new.mcpServers` runs commands as the user) | Strip `mcpServers` from client messages in phase 1. |
| T9 | **Browser claims fs or terminal capabilities** | Force `clientCapabilities` to `{fs: {readTextFile:false, writeTextFile:false}, terminal:false}`. |
| T10 | **XSS from model output, tool output, or file names** | Render Markdown with raw HTML disabled, sanitize links (`http`, `https`, and `mailto` only, with `rel=noopener noreferrer`), and never use `dangerouslySetInnerHTML` on untrusted content. Serve a strict CSP: `default-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'`. |
| T11 | **Clickjacking the approval dialog** | `frame-ancestors 'none'` and `X-Frame-Options: DENY` |
| T12 | **Resource exhaustion** | Limits on frame size (e.g. 8 MiB), live agents (`--max-agents`), and message rate. Idle processes are reaped. |
| T13 | **Approval spoofing:** the model writes text that looks like an approval dialog | Approvals come only from `session/request_permission`, in a visually distinct UI element that model output cannot produce. |
| T14 | **Leaking secrets into the browser** | agent86 already redacts secret values to `${secret:NAME}` before anything reaches the protocol. The bridge does not log message bodies by default. stderr shown in the UI is agent86's own notes, already redacted. |
| T16 | **Trust without informed consent:** the user trusts a project without seeing what it does, or a page trusts it for them | Trust needs the dialog showing the file's full contents (control characters made visible), with Cancel as the default. `POST /api/trust` needs the cookie, the origin check, the custom header, and the exact hash of the file the user saw. |
| T17 | **Trust carried over to a changed file** (e.g. after a `git pull`) | Trust is keyed by realpath plus SHA-256, and the file is re-hashed right before each spawn. A mismatch runs the thread restricted and shows the banner again. The remaining hash-to-read window is documented in ADR 0004. |
| T18 | **A page that has gone still answers for agent86**, or a new page receives replies meant for the old one | Request ids are rewritten per socket generation, and replies for an old generation are dropped. Requests agent86 makes while no page is attached (permission requests included) are declined by the bridge, never approved. |
| T15 | **Supply chain:** a malicious npm dependency | Few runtime dependencies (the bridge needs about two), a committed lockfile, `pnpm audit` in CI, pinned GitHub Actions by SHA (as agent86 does), and npm provenance when publishing. |

## 4. What stays agent86's responsibility

The bridge does not weaken any agent86 protection, and does not duplicate them either:

- The approval gate and modes, with every outcome other than "allow once" declining
- The workspace jail for file tools, the sandboxed executor, and the scrubbed environment
- The guardrails (ingress, egress, observation) and SSRF protection for `web_fetch`
- Project-file trust (risky project settings are ignored over ACP until trusted). The bridge adds one path to trust, the browser dialog, under the controls in T16 and T17, and records it only in its own file.
- Secret redaction

## 5. Explicit phase 1 limits

- **No remote access.** Using the UI from another device means an SSH tunnel (`ssh -L`) to the bridge, as the README documents. The `Host` allowlist already accepts `127.0.0.1:PORT` on the forwarded side. Exposing the bridge to a network is out of scope until phase 2 has real authentication.
- **No authentication beyond the launch token.** Anyone who can read the URL while the token is valid, or who has the cookie, controls the agent.

## 6. Checklist for M5 review

Reviewed 2026-11-11 against `packages/bridge` at M5. Each item names where it is tested.

- [x] Every route checks `Host` (all HTTP and the WebSocket), the session cookie (every `/api/*` route but login, and the WebSocket), and `Origin` plus the CSRF header (login, trust changes, and the WebSocket). Static files need only `Host`: they are the public app. A cross-site `GET /api/*` carries no cookie (`SameSite=Strict`) and cannot read the answer (no CORS). (`server.test.ts`, `trust.test.ts`)
- [x] Tests: wrong Origin, wrong Host, missing cookie, reused token (`server.test.ts`, e2e `handshake.spec.ts`), expired token (`auth.test.ts`)
- [x] `cwd` jail: `..` (`server.test.ts`, `policy.test.ts`), symlinks out of a root, refused as a workspace, a session `cwd`, a listed folder, a walked file, or the project config (`security.test.ts`, POSIX only, since Windows runners cannot always create links). Case-insensitive file systems: paths are compared after `realpath`, and a mismatch refuses, so the check fails closed.
- [x] `mcpServers` and capabilities are filtered (`policy.test.ts`, `server.test.ts`)
- [x] CSP header present (`server.test.ts`), no inline script, style, or handler in the built page (`scripts/check-dist.mjs`, run in CI's package job and before publishing), and no CSP errors in the browser (e2e `handshake.spec.ts`)
- [x] Markdown renderer XSS test corpus (web `markdown.test.tsx`, `blocks.test.ts`)
- [x] Message bodies are not logged: the bridge logs agent86's stderr, process starts and stops, and the reason it refused a message, never the message (`security.test.ts`)
- [x] Trust: no record without the dialog, a stale hash is refused, a changed file runs restricted, revoke works, and the records file has mode `0600` (`trust.test.ts`, e2e `trust.spec.ts`)
- [x] Requests from agent86 with no page attached are declined (`threads.test.ts`)

### Findings fixed in the review

1. **A project config that is a symlink was readable.** `.agent86/config.toml` linking to a file outside the workspace (a key, say) would have been read and shown in the trust dialog, to the user's own browser only. Now a config that is not a regular file inside the workspace is ignored (`trust.ts`, `security.test.ts`).
2. **No message rate limit (T12).** A socket that sends more than 500 frames in 10 seconds is now closed with code 1008.
3. **Session lists were not bounded (T12).** Each `GET /api/sessions` started an agent86 process. Concurrent requests for a workspace now share one, and an answer is reused for 3 seconds.

### Residual risks, accepted for v0.1

- Anyone who can read the printed link within five minutes, or who has the cookie, controls the agent: the token is the authentication (T5, T6).
- On Windows, a bare `--agent86` name is started through the shell (npm's `.cmd` shim), so an argument passed with `--agent-arg` must not contain spaces. These arguments come from the user's own command line.
- The bridge trusts agent86 to be agent86. It checks the version, but whatever binary `--agent86` names runs as the user.
