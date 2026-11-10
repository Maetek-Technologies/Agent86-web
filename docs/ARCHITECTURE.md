# Architecture

This document describes phase 1, the local bridge. Phase 2 is in [HOSTED.md](HOSTED.md). The decisions behind it are in the [ADRs](adr/).

## 1. Overview

```
┌──────────────────────────── user's machine ─────────────────────────────┐
│                                                                          │
│  Browser tab                    agent86-web bridge          agent86      │
│  ┌──────────────────┐   WS      ┌───────────────────┐ stdio ┌──────────┐ │
│  │ React SPA        │◀────────▶ │ HTTP: static SPA, │◀────▶ │ acp      │ │
│  │  acp-client      │ JSON-RPC  │   /api/* (REST)   │ NDJSON│ (thread1)│ │
│  │  thread store    │  (ACP v1) │ WS: /acp/<thread> │       └──────────┘ │
│  └──────────────────┘           │ process manager   │◀────▶ ┌──────────┐ │
│                                 │ policy filter     │       │ acp      │ │
│                                 └───────────────────┘       │ (thread2)│ │
│                                   127.0.0.1 only            └──────────┘ │
│                                                                  │       │
│                         ~/.agent86 (config, memory.db, keyring) ◀┘       │
└──────────────────────────────────────────────────────────────────────────┘
```

There are three parts:

1. **Web client** (`packages/web`): a React single-page app. It is an ACP *client*, like an editor. It renders the conversation and answers the agent's requests.
2. **ACP client library** (`packages/acp-client`): framework-free TypeScript that implements the client side of ACP v1 over any message transport. Both the web client and the tests use it.
3. **Bridge** (`packages/bridge`): a Node.js command-line program. It serves the built SPA, starts and stops `agent86 acp` processes, relays JSON-RPC between WebSockets and their stdio, and enforces the security policy.

agent86 is unchanged. Everything it does (models, tools, the sandbox, approvals, guardrails, memory, sessions, traces) happens inside `agent86 acp`, exactly as it does for Zed.

## 2. Repository layout (planned)

```
agent86-web/
├── README.md
├── docs/                      # this plan
├── package.json               # pnpm workspace root
├── pnpm-workspace.yaml
├── packages/
│   ├── acp-client/            # ACP v1 client: types, JSON-RPC, session state machine
│   │   ├── src/
│   │   │   ├── schema/        # types generated from ACP's schema/v1/schema.json
│   │   │   ├── jsonrpc.ts     # request/response correlation, notifications, errors
│   │   │   ├── client.ts      # initialize, session/*, handlers for agent→client requests
│   │   │   └── transport.ts   # Transport interface; WebSocketTransport
│   │   └── test/
│   ├── web/                   # React + Vite SPA
│   │   ├── src/
│   │   │   ├── app/           # routes, layout, providers
│   │   │   ├── features/      # threads, sessions, approvals, pickers, commands
│   │   │   ├── components/    # Markdown, DiffView, ToolCallCard, CodeBlock …
│   │   │   └── state/         # stores (Zustand) fed by acp-client events
│   │   └── e2e/               # Playwright
│   ├── bridge/                # Node CLI: `agent86-web`
│   │   ├── src/
│   │   │   ├── cli.ts         # flags, startup, open browser
│   │   │   ├── server.ts      # HTTP + WS, static files, /api
│   │   │   ├── auth.ts        # token, Host/Origin checks, cookie
│   │   │   ├── processes.ts   # spawn/stop agent86 acp, idle reaping
│   │   │   ├── relay.ts       # NDJSON ⇄ WS framing, backpressure
│   │   │   └── policy.ts      # inspects client→agent messages (cwd jail, MCP)
│   │   └── test/
│   └── mock-agent/            # scripted ACP agent for tests (no model, no network)
└── .github/workflows/ci.yml
```

## 3. The bridge

### 3.1 Command line

```
agent86-web [--root <dir>]... [--port <n>] [--host 127.0.0.1]
            [--agent86 <path>] [--agent-arg <arg>]... [--no-open]
            [--max-agents <n>] [--idle-timeout <dur>]
```

| Flag | Default | Meaning |
|---|---|---|
| `--root` | the current directory | A directory threads may run in (they may also run in its subdirectories). Repeatable. |
| `--port` | `0` (any free port) | The port to listen on |
| `--host` | `127.0.0.1` | Bind address. Anything other than a loopback address is refused in phase 1. |
| `--agent86` | `agent86` on `PATH` | The agent86 binary |
| `--agent-arg` | — | Extra arguments placed before `acp`, e.g. `--agent-arg --model --agent-arg openrouter:x` |
| `--no-open` | off | Print the URL instead of opening the browser |
| `--max-agents` | `8` | The most agent86 processes alive at once |
| `--idle-timeout` | `15m` | Stop an agent86 process whose thread has been idle this long |

At startup the bridge:

1. Finds agent86 and runs `agent86 --version`. It refuses to start below the minimum supported version.
2. Generates a 256-bit random token.
3. Listens on loopback and prints or opens `http://127.0.0.1:<port>/#token=<token>`.

### 3.2 HTTP surface

| Route | Purpose |
|---|---|
| `GET /` and static assets | The built SPA, with a strict CSP |
| `POST /api/login` | Exchanges the URL token for an `HttpOnly`, `SameSite=Strict` session cookie. The SPA then removes the token from the URL. |
| `GET /api/info` | Bridge version, agent86 version and path, roots, limits |
| `GET /api/workspaces?path=` | Lists directories under a root, for the workspace picker. It never reads file contents. |
| `GET /acp/<threadId>` (WebSocket upgrade) | Opens or reattaches to the ACP channel for one thread |

Every route checks the cookie, the `Host` header, and (for the WebSocket) the `Origin` header. See [SECURITY.md](SECURITY.md).

### 3.3 Process model

agent86's ACP server runs **one turn at a time per connection**: a second `session/prompt` while one runs is refused. To let threads run in parallel, the bridge gives **each thread its own `agent86 acp` process**:

- A thread is a browser-side ID mapped to one process, which holds one ACP session.
- The WebSocket for a thread can drop and reattach (a reload, a sleeping laptop) while the process keeps running. The bridge buffers outgoing messages for a short grace period, then replays them in order on reattach.
- An idle process is stopped after `--idle-timeout`. Reopening the thread starts a new process and calls `session/load` with the saved session ID, which agent86 replays from its database.
- `--max-agents` caps the live processes. When the cap is reached, the least recently used idle process is stopped first. If all are busy, the new thread is refused with a clear message.
- The process is started in the thread's workspace directory, because agent86 reads `./.agent86/config.toml` from where it starts.
- Its stderr (agent86's notes) is captured to a ring buffer and shown in a "logs" drawer in the UI.

Read-only screens (the session list, the workspace browser) use a short-lived **utility process** that answers `initialize` and `session/list` and is then stopped.

### 3.4 Relay and policy

The relay is almost transparent. agent86 writes newline-delimited JSON-RPC on stdout. The bridge sends each line as one WebSocket text frame, and writes each incoming frame to stdin followed by a newline. Backpressure is respected in both directions.

The bridge inspects messages from the client to the agent for a short list of fields. It does not rewrite agent messages.

| Message | Check |
|---|---|
| `session/new`, `session/load` `cwd` | Must resolve (with symlinks followed) inside a `--root`, and must match the directory the process was started in |
| `session/new` `mcpServers` | Stripped in phase 1. A browser-supplied MCP server would be a command run as the user, so the browser does not get to choose one. agent86's configured `[mcp.servers.*]` still apply. |
| `initialize` `clientCapabilities.fs` / `terminal` | Forced off. The browser does not own the files, so agent86's file tools use the disk. |
| Frames that are not JSON, are larger than the limit, or have an unknown method | Dropped, with a JSON-RPC error |

## 4. The ACP client library

`packages/acp-client` keeps the protocol out of React:

- **Transport interface:** `send(msg)`, `onMessage`, `onClose`, `close()`. `WebSocketTransport` is used in the browser. The tests use an in-memory pair, and phase 2 can add an authenticated gateway transport.
- **JSON-RPC core:** correlates request IDs, routes notifications, handles timeouts, and maps errors.
- **Client:** typed methods for `initialize`, `session/new`, `session/load`, `session/list`, `session/prompt`, `session/cancel`, and `session/set_config_option`. Handlers are registered for the agent's requests: `session/request_permission` (and `fs/*`, answered "not supported" because it is never advertised).
- **Session model:** folds `session/update` notifications into a plain, serializable state: messages, thought blocks, tool calls by ID with status, available commands, and config options. React subscribes to it, and unit tests assert on it without a DOM.
- **Types:** generated from ACP's `schema/v1/schema.json` and checked in, with the schema version recorded. Whether to use the ACP project's official TypeScript library or a hand-written layer is decided in M1 ([OPEN_QUESTIONS.md](OPEN_QUESTIONS.md#q6-acp-library)).

## 5. A turn, end to end

```
User types "fix the typo in README" and presses Enter
  web ── session/prompt {sessionId, prompt:[{type:text}]} ─────▶ bridge ──▶ agent86
  agent86 ── session/update agent_thought_chunk … ─────────────────────────▶ web  (dimmed, collapsible)
  agent86 ── session/update tool_call {read_file README.md} ──────────────▶ web  (card: pending)
  agent86 ── session/update tool_call_update {completed, content} ────────▶ web  (card: done)
  agent86 ── session/request_permission {edit_file, diff, options} ───────▶ web  (approval dialog)
  web ── result {outcome: selected, optionId: allow-once} ──────────────────────▶ agent86
  agent86 ── session/update tool_call_update {completed} ─────────────────▶ web
  agent86 ── session/update agent_message_chunk "Fixed the typo…" ────────▶ web  (Markdown, streamed)
  agent86 ── result of session/prompt {stopReason: end_turn} ─────────────▶ web  (turn ends, input re-enabled)

Esc during the turn:
  web ── session/cancel {sessionId} ────────────────────────────────────────────▶ agent86
  (any open permission request is answered "cancelled", as ACP requires)
  agent86 ── result of session/prompt {stopReason: cancelled} ────────────▶ web
```

## 6. Web client structure

- **State:** one Zustand store per thread, fed by the session model in `acp-client`. A global store holds the thread list, bridge info, and preferences, with preferences in `localStorage`.
- **Routing:** `/` (home: workspaces and recent sessions) and `/t/:threadId` (a thread). Several open threads appear as tabs.
- **Rendering:** streamed Markdown is rendered incrementally (only the last block is re-parsed). Code is highlighted lazily. Long tool output is virtualized.
- **Diffs:** the permission request's `diff` content is rendered side by side or unified, with syntax highlighting.
- **Accessibility:** keyboard-first (Enter sends, Shift+Enter adds a newline, Esc cancels, `/` opens commands, number keys pick approval options, like the terminal's numbered choices), ARIA live regions for streamed text, and a dark theme and a light theme.

See [UI_DESIGN.md](UI_DESIGN.md) for screens.

## 7. Packaging

- `pnpm build` builds the SPA into `packages/bridge/dist/public`, and the bridge serves it with `sirv` or similar.
- The npm package `agent86-web` contains only the bridge plus the static assets. Its only runtime dependencies are `ws` and a small static server.
- `npx agent86-web` works with Node 20 or newer. agent86 itself is installed separately (`npm install -g agent86`). The bridge explains how to install it if it is missing.

## 8. Phase 2 seams

The design keeps these boundaries so a hosted backend can be added:

- The client depends only on `Transport` and on ACP, never on the bridge's process model.
- Bridge-specific REST (`/api/workspaces`, `/api/info`) sits behind a small `BackendApi` interface in the web client. The hosted gateway implements the same interface.
- The URL-token login is one implementation of an `Auth` interface. OIDC replaces it in phase 2.
