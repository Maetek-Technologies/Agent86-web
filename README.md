# agent86-web

A browser interface for [agent86](https://github.com/Maetek-Technologies/agent86), the agentic command-line harness.

agent86-web gives you agent86's conversation, tool calls, approvals, and saved sessions in a browser tab. The agent itself does not change. agent86 still runs on your machine, with your config, keys, sandbox, memory, and sessions. The website is a different way to drive it.

> **Status: v0.1.0 ready to publish (milestone M5).** All of phase 1 is built, reviewed, and packaged. Once it's on npm, `npx agent86-web` will run it. Until then, run it from this repository (see _Development_). User documentation: [packages/bridge/README.md](packages/bridge/README.md). The plan: [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md).

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

## Usage

```sh
npm install -g agent86          # agent86 itself, if you don't have it
agent86 keys set openrouter     # a key in the OS keyring, as usual

npx agent86-web --root ~/code   # opens http://127.0.0.1:<port>/#token=…
                                # --max-agents 8, --idle-timeout 15m by default
```

Then pick a project under `~/code`, start a thread, and chat.

## Documentation

| Document                                         | What it covers                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md)     | Goals, scope, phases, milestones, and current status (the source of truth)             |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)     | Components, repository layout, data flow, and how a turn travels end to end            |
| [docs/FEATURE_PARITY.md](docs/FEATURE_PARITY.md) | Each agent86 terminal feature, the ACP message behind it, and how the web UI covers it |
| [docs/UI_DESIGN.md](docs/UI_DESIGN.md)           | Screens, layout, components, and interaction details                                   |
| [docs/SECURITY.md](docs/SECURITY.md)             | Threat model and protections for a localhost bridge that can run commands              |
| [docs/HOSTED.md](docs/HOSTED.md)                 | Phase 2 design sketch: a multi-user hosted backend                                     |
| [docs/TESTING.md](docs/TESTING.md)               | Test strategy: mock agent, protocol schema checks, end-to-end runs                     |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | Decisions still to make                                                                |
| [docs/adr/](docs/adr/)                           | Architecture decision records                                                          |

## Planned tech stack

- **Web client:** React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, a Markdown renderer with syntax highlighting, and a diff viewer
- **Bridge:** Node.js 20+, TypeScript, `ws`, published to npm as one package that contains the built web client
- **Protocol:** ACP v1 (JSON-RPC 2.0) through the official [`@agentclientprotocol/sdk`](https://www.npmjs.com/package/@agentclientprotocol/sdk)
- **Tooling:** pnpm workspaces, Vitest, Playwright, ESLint, and Prettier

## Development

You need Node.js 22.12 or newer, pnpm 10 (`corepack enable`), and agent86 1.0.15 or newer on your `PATH` (`npm install -g agent86`). The published bridge itself runs on Node 20.19 or newer.

```sh
pnpm install
pnpm dev          # the bridge on :8686 and Vite on :5173; open the printed link
pnpm test         # unit and integration tests (Vitest)
pnpm e2e          # build, then Playwright end-to-end tests against the mock agent
AGENT86_BIN=agent86 pnpm e2e   # ...and against the real agent86 too
pnpm lint && pnpm format:check && pnpm typecheck
```

To run the built bridge as users will:

```sh
pnpm build
node packages/bridge/dist/cli.js --root ~/code
```

| Package                                      | What it is                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`packages/bridge`](packages/bridge)         | `agent86-web`, the published CLI: HTTP and WebSocket server, auth, policy filter, agent86 processes |
| [`packages/web`](packages/web)               | The React SPA, built into the bridge's `dist/public`                                                |
| [`packages/acp-client`](packages/acp-client) | The browser side of ACP: a WebSocket transport and the agent86 handshake                            |
| [`packages/mock-agent`](packages/mock-agent) | `mock-agent86`, a scripted stand-in for agent86 used by the tests                                   |

## Relationship to agent86

This is an independent client for agent86. It talks to agent86 only through its public `agent86 acp` interface, never by importing its code or reading its database directly. Phase 1 targets agent86 **v1.0.15** or newer, the version whose ACP server was checked against the protocol's v1 schema.

## Using it from another device

The bridge listens only on `127.0.0.1`. To use it from a laptop or tablet, forward the port over SSH from that device:

```sh
ssh -L 8686:127.0.0.1:8686 you@dev-machine   # then, on dev-machine: npx agent86-web --port 8686 --no-open
```

Open the printed URL (with its `#token=…`) on the device as `http://127.0.0.1:8686/…`. Binding to other addresses is refused until phase 2 brings real authentication.

## Credits

agent86 and its name, logo, and mascot belong to [Maetek Technologies](https://github.com/Maetek-Technologies/agent86) and are used with permission. agent86-web is a separate client for it.

## License

MIT. See [LICENSE](LICENSE).
