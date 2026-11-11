# agent86-web

A browser interface for [agent86](https://github.com/Maetek-Technologies/agent86), the agentic command-line harness.

agent86-web runs a small server on your machine (loopback only) and opens a page in your browser. Each thread you open there is your own `agent86` running in a project folder, with your config, keys, sandbox, memory, and sessions. The browser gives you:

- **Conversations** with streamed Markdown and the model's reasoning, which you can fold away.
- **Approvals**, with the diff or command in view.
- **Saved sessions**, including ones started at a terminal (and `agent86 --resume <id>` continues a browser session at a terminal).
- **Several threads at once.**
- **Model and approval-mode pickers**, `/` commands, and `@` file mentions.

## Requirements

- Node.js 20.19 or newer
- [agent86](https://github.com/Maetek-Technologies/agent86) 1.0.15 or newer on your `PATH`, with a model it can use:

```sh
npm install -g agent86
agent86 keys set openrouter      # or anthropic, openai, …; or set the provider's environment variable
```

## Run it

```sh
npx agent86-web --root ~/code
```

It prints a link and opens it in your browser. The link signs the browser in. It works once and expires after five minutes. Run the command again for a new one.

To install the command instead:

```sh
npm install -g agent86-web
agent86-web --root ~/code
```

## Options

| Option | Default | Meaning |
|---|---|---|
| `--root <dir>` | the current directory | A folder that threads may run in, or in folders under it. Repeat for more. |
| `--port <n>` | any free port | The port to listen on |
| `--host <addr>` | `127.0.0.1` | A loopback address: `127.0.0.1`, `::1`, or `localhost` |
| `--agent86 <path>` | `agent86` on `PATH` | The agent86 to run. Pointing at the native binary instead of npm's launcher saves about 45 MB per thread. |
| `--agent-arg=<arg>` | — | An argument for agent86, placed before `acp`. Repeatable, e.g. `--agent-arg=--model --agent-arg=openrouter:<model>` |
| `--max-agents <n>` | `8` | The most agent86 processes running at once |
| `--idle-timeout <d>` | `15m` | Stop an agent86 that has no open tab and no running turn after this long (`90s`, `15m`, `1h`) |
| `--no-open` | — | Print the link without opening the browser |
| `--no-update-check` | — | Don't check npm for newer agent86 or agent86-web releases (also `AGENT86_WEB_NO_UPDATE_CHECK=1`) |

## Things to know

- **Workspaces.** A thread runs in one folder under a `--root`. Pick it with *Open a workspace…*. To work in another folder, open a new thread there.
- **Project settings need trust.** agent86 ignores the riskier settings in a project's `.agent86/config.toml`, such as MCP servers, providers, and approvals, until you trust the file. When it does, the thread shows a banner. *Review and trust* shows the whole file. agent86-web remembers your decision for that exact file in `~/.agent86-web/trusted-projects.json`, and asks again if the file changes. Revoke it under *About*.
- **Model setup and secrets stay at the terminal.** Add keys with `agent86 keys set <provider>` or `/config model`, and enter secrets with `/secret NAME` in `agent86`, choosing to remember them for the project. Browser threads then use them. The protocol agent86-web speaks does not allow asking for secrets in a form.
- **Using it from another device.** agent86-web listens only on loopback. Forward the port over SSH:
  ```sh
  ssh -L 8686:127.0.0.1:8686 you@dev-machine   # on dev-machine: agent86-web --port 8686 --no-open
  ```
  Then open the printed link on the device.

## Security

agent86-web can make agent86 edit files and run commands, so it is locked down:

- It listens only on loopback.
- The browser signs in with a one-time token, then holds an `HttpOnly`, `SameSite=Strict` cookie.
- Every request is checked for the `Host` header, which stops DNS rebinding.
- Every WebSocket and change is checked for its `Origin` and a CSRF header.
- A strict Content-Security-Policy applies to the page.
- Threads can only run under the `--root` folders.
- A page cannot add MCP servers.

agent86's own approval gate, sandbox, and guardrails apply unchanged. The threat model is in [docs/SECURITY.md](https://github.com/tdfleming/Agent86-web/blob/main/docs/SECURITY.md).

## Troubleshooting

- **"agent86 was not found"**: install it (`npm install -g agent86`), or pass `--agent86 /path/to/agent86`.
- **"This sign-in link has already been used or has expired"**: run `agent86-web` again for a new link.
- **"agent86 could not start a session"**: its model has no API key. Run `agent86 keys set <provider>`, then choose *Try again*.
- **A project's MCP servers don't start**: trust the project from the banner in its thread.
- **agent86's own notes**: open *logs* in the thread's header.

## License

MIT. agent86-web is a separate client for agent86. agent86 and its name, logo, and mascot belong to Maetek Technologies and are used with permission.
