# agent86-web

A browser interface for [agent86](https://github.com/Maetek-Technologies/agent86), the agentic command-line harness.

agent86-web gives you agent86's conversation, tool calls, approvals, and saved sessions in a browser tab. The agent itself does not change. agent86 still runs on your machine, with your config, keys, sandbox, memory, and sessions. The website is a different way to drive it.

> **Status: planning.** There is no code yet. This repository holds the plan, and the documents under [`docs/`](docs/) describe what will be built and in what order.

## How it will work

```
 Browser (React SPA)  ──WebSocket──▶  agent86-web bridge (Node)  ──stdio──▶  agent86 acp
   chat, diffs,           JSON-RPC         serves the UI, checks           the real agent:
   approvals, sessions    (ACP v1)         origin and token, spawns        models, tools,
                                           one agent86 per thread          sandbox, memory
```

agent86 already speaks the [Agent Client Protocol](https://agentclientprotocol.com) (ACP), the protocol editors like Zed use to drive coding agents (`agent86 acp`). agent86-web is an ACP client that runs in the browser. A small local **bridge** carries ACP between a WebSocket and agent86's standard input and output, so the UI can do what an ACP editor can do, and agent86 needs no changes.

The work is planned in two phases:

1. **Local (phase 1):** `npx agent86-web` starts the bridge on `127.0.0.1`, opens your browser, and drives the `agent86` binary already installed on your machine.
2. **Hosted (phase 2, later):** the same UI and the same protocol, with the bridge replaced by a server that runs agent86 in an isolated container for each session. Phase 1 is designed so this can be added without rewriting the client.

## Planned usage (phase 1)

```sh
npm install -g agent86          # agent86 itself, if you don't have it
agent86 keys set openrouter     # a key in the OS keyring, as usual

npx agent86-web --root ~/code   # opens http://127.0.0.1:<port>/#token=…
```

Then pick a project under `~/code`, start a thread, and chat.

## Documentation

| Document | What it covers |
|---|---|
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) | Goals, scope, phases, milestones, and current status (the source of truth) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, repository layout, data flow, and how a turn travels end to end |
| [docs/FEATURE_PARITY.md](docs/FEATURE_PARITY.md) | Each agent86 terminal feature, the ACP message behind it, and how the web UI covers it |
| [docs/UI_DESIGN.md](docs/UI_DESIGN.md) | Screens, layout, components, and interaction details |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model and protections for a localhost bridge that can run commands |
| [docs/HOSTED.md](docs/HOSTED.md) | Phase 2 design sketch: a multi-user hosted backend |
| [docs/TESTING.md](docs/TESTING.md) | Test strategy: mock agent, protocol schema checks, end-to-end runs |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | Decisions still to make |
| [docs/adr/](docs/adr/) | Architecture decision records |

## Planned tech stack

- **Web client:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, a Markdown renderer with syntax highlighting, and a diff viewer
- **Bridge:** Node.js 20+, TypeScript, `ws`, published to npm as one package that contains the built web client
- **Protocol:** ACP v1 (JSON-RPC 2.0), typed from the protocol's published schema
- **Tooling:** pnpm workspaces, Vitest, Playwright, ESLint, and Prettier

## Relationship to agent86

This is an independent client for agent86. It talks to agent86 only through its public `agent86 acp` interface, never by importing its code or reading its database directly. Phase 1 targets agent86 **v1.0.15** or newer, the version whose ACP server was checked against the protocol's v1 schema.

## License

To be decided. MIT would match agent86; see [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md).
