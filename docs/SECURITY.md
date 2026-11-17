# Security design (phase 1)

The bridge is a local web server that can make agent86 edit files and run commands. Any web page the user visits can try to talk to a server on `localhost`, so the bridge must be treated as remote-code-execution-adjacent and locked down. This document is the threat model and the required protections. M5 includes a review against it.

## 1. Assets

- The user's files and shell, reachable through agent86's tools (sandboxed, but writing the workspace is the point)
- API keys in the OS keyring and the environment
- Session history and memory (`~/.agent86/memory.db`), which may contain code and secrets the model saw
- Secret values the user types into agent86-web (since 0.4.2, with agent86 1.0.23), on their way to agent86

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
| T8 | **Browser injects an MCP server** (`session/new.mcpServers` runs commands as the user) | Strip `mcpServers` from client messages in phase 1 (`session/new`, `session/load`, and since 0.4.1 `session/resume`, which takes the same params and gets the same `cwd` check as T7). |
| T9 | **Browser claims fs or terminal capabilities** | Force `clientCapabilities` to `{fs: {readTextFile:false, writeTextFile:false}, terminal:false}`. Since 0.4.0 two opt-ins pass, rebuilt by the bridge rather than copied: `session.compaction: {}` and `_meta["com.maetek.agent86/state"]: true`. Both only change how agent86 reports (a compaction as `compaction_update`; extra notifications), never what it can do or read. Every other claim is dropped. The diffs and events they bring stay in memory with the session, like tool output, and are never logged or stored. Since 0.4.2 a third is passed when the page makes it: `_meta["com.maetek.agent86/secrets"]: true` (agent86 1.0.23), the page's promise of a masked entry, which lets the model ask the user for a secret; it gives agent86 nothing the user does not type (T22). |
| T10 | **XSS from model output, tool output, or file names** | Render Markdown with raw HTML disabled, sanitize links (`http`, `https`, and `mailto` only, with `rel=noopener noreferrer`), and never use `dangerouslySetInnerHTML` on untrusted content. Serve a strict CSP: `default-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'`. |
| T11 | **Clickjacking the approval dialog** | `frame-ancestors 'none'` and `X-Frame-Options: DENY` |
| T12 | **Resource exhaustion** | Limits on frame size (e.g. 8 MiB), live agents (`--max-agents`), and message rate. Idle processes are reaped. |
| T13 | **Approval spoofing:** the model writes text that looks like an approval dialog | Approvals come only from `session/request_permission`, in a visually distinct UI element that model output cannot produce. |
| T14 | **Leaking secrets into the browser** | agent86 already redacts secret values to `${secret:NAME}` before anything reaches the protocol (tool output, the model's text, state events, memory entries, the saved session). The bridge does not log message bodies by default. stderr shown in the UI is agent86's own notes, already redacted. A value the user types into agent86-web travels the other way, under T22. |
| T16 | **Trust without informed consent:** the user trusts a project without seeing what it does, or a page trusts it for them | Trust needs the dialog showing the file's full contents (control characters made visible), with Cancel as the default. `POST /api/trust` needs the cookie, the origin check, the custom header, and the exact hash of the file the user saw. |
| T17 | **Trust carried over to a changed file** (e.g. after a `git pull`) | Trust is keyed by realpath plus SHA-256, and the file is re-hashed right before each spawn. A mismatch runs the thread restricted and shows the banner again. The remaining hash-to-read window is documented in ADR 0004. |
| T18 | **A page that has gone still answers for agent86**, or a new page receives replies meant for the old one | Request ids are rewritten per socket generation, and replies for an old generation are dropped. Requests agent86 makes while no page is attached (permission requests included) are declined by the bridge, never approved. A `secret/request` (0.4.2) with no page is answered `{"outcome": "declined"}`. |
| T19 | **A page stops agent86-web** (`POST /api/shutdown`, the Quit button, 0.2.0) | The endpoint needs the session cookie, the origin check, and the custom header, like `POST /api/trust`, so another site cannot call it. A signed-in page can already run commands through agent86, so stopping the bridge gives it nothing more. The page asks for confirmation and names running turns and waiting approvals first. |
| T20 | **A stored preference silently turns approvals off** (the default approval mode, 0.2.0; kept by the bridge since 0.3.0) | It defaults to agent86's own default, and `auto` needs a separate confirmation that says what it does, in Settings and in the thread header. It is changed only by `POST /api/settings`, behind the cookie, the origin check, and the custom header, and only to `ask`, `auto`, or `deny`; it is stored in `~/.agent86-web/settings.json`, written atomically and readable only by the user. A new thread starts in it; an existing thread keeps the mode it last had, set again whenever its session is reopened, so a reload cannot loosen a thread's approvals. The thread header always shows the current mode. agent86's own controls (guarded calls still ask in `auto`) are unchanged. |
| T21 | **The saved port** is used to point the browser at something else | The port is set only at the terminal (`--save-port`), never from the page, and the bridge still binds loopback only. A port in use stops the bridge with a message instead of falling back, so a different process on that port is never mistaken for agent86-web; the browser still needs the new launch token to sign in. |
| T22 | **A secret's value leaks from agent86-web** (0.4.2: values typed for `_com.maetek.agent86/secret/set`, and for the model's `secret/request`) | The value goes from a masked, uncontrolled input (`type=password`, no `name`, autofill and spellcheck off) straight into the request and the input is cleared: it is never React state, rendered, logged, put in the thread, its prompt history, `localStorage`, the URL, or the browser history. `/secret <text>` typed in the message box is caught and not sent or kept in the history (agent86 would store nothing, but the text would stay in the thread). The bridge relays the request and the reply unchanged (agent86 needs the value), never logs or stores message bodies, and anything it records goes through `redactSecrets` first (`params.value` on `secret/set`, `result.value` on a `secret/request` reply, as `<hidden>`, as agent86's transcript writes it): the opt-in transcript `AGENT86_WEB_TRANSCRIPT` is the only such record. The request is declined, never left open, on Decline, Esc, closing the prompt, Stop, the turn ending, the connection closing, an unreadable request, and when no page is attached (T18). The page claims the masked entry (T9) only because it keeps these promises. agent86 never repeats a value in a reply or error. Remembering a secret writes agent86's OS keyring entry for the project, as the terminal's `/secret NAME` does. |
| T23 | **The page reads or destroys agent86's memory** (0.4.2: `_com.maetek.agent86/memory/list`, `pin`, `forget`, agent86 1.0.22) | The methods are on the bridge's allowlist and passed unchanged: each takes the `sessionId` of a session open on that thread's own agent86, which agent86 checks, so the page reaches the memory store its thread already uses (the model's own recall reads the same store). Entries arrive redacted (T14). Forgetting deletes for good, so the page asks first; pinning only stops pruning. The three secret requests (`set`, `list`, `forget`) are allowed on the same terms; `list` returns names only. agent86 refuses all six while a turn runs. |
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

### Reviewed for 0.4.2 (M10)

- [x] The six memory and secret methods are allowed and passed unchanged, and look-alikes (`secret/request` from the page, `memory/prune`, a missing underscore) are refused (`policy.test.ts`)
- [x] The secrets claim passes as `true` or an object and nothing else; every other `_meta` key is still dropped (`policy.test.ts`, `acp-1.0.23.test.ts`)
- [x] `redactSecrets` hides `params.value` on `secret/set` and `result.value` on a `secret/request` reply, and leaves the message itself alone (`policy.test.ts`)
- [x] No typed value is in the bridge's log, its state directory, or its transcript, which holds both values as `<hidden>` (bridge `acp-1.0.23.test.ts`; e2e `acp-1.0.23.spec.ts` also checks the page's storage, address, and console)
- [x] A `secret/request` with no page attached is declined (bridge `acp-1.0.23.test.ts`); in the client, declining is the default on every path but a typed value (`agent86-1.0.23.test.ts`)

### Findings fixed in the review

1. **A project config that is a symlink was readable.** `.agent86/config.toml` linking to a file outside the workspace (a key, say) would have been read and shown in the trust dialog, to the user's own browser only. Now a config that is not a regular file inside the workspace is ignored (`trust.ts`, `security.test.ts`).
2. **No message rate limit (T12).** A socket that sends more than 500 frames in 10 seconds is now closed with code 1008.
3. **Session lists were not bounded (T12).** Each `GET /api/sessions` started an agent86 process. Concurrent requests for a workspace now share one, and an answer is reused for 3 seconds.

### Residual risks, accepted for v0.1

- Anyone who can read the printed link within five minutes, or who has the cookie, controls the agent: the token is the authentication (T5, T6).
- On Windows, a bare `--agent86` name is started through the shell (npm's `.cmd` shim), so an argument passed with `--agent-arg` must not contain spaces. These arguments come from the user's own command line.
- The bridge trusts agent86 to be agent86. It checks the version, but whatever binary `--agent86` names runs as the user.
