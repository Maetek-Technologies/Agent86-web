# agent86-web

A browser interface for [agent86](https://github.com/Maetek-Technologies/agent86), the agentic command-line harness.

agent86-web runs a small server on your machine (loopback only) and opens a page in your browser. Each thread you open there is your own `agent86` running in a project folder, with your config, keys, sandbox, memory, and sessions. The browser gives you:

- **Conversations** with streamed Markdown and the model's reasoning, which you can fold away.
- **Approvals**, with the diff or command in view. With agent86 1.0.21, a sub-agent's approval says which sub-agent asks, where it works, and what it has spent, and an inbox lists the approvals waiting behind it.
- **Saved sessions**, including ones started at a terminal (and `agent86 --resume <id>` continues a browser session at a terminal).
- **Several threads at once**, which reconnect by themselves. With agent86 1.0.21, a thread survives agent86 stopping partway through a turn: it comes back with the steps agent86 finished and offers to continue, and after agent86-web restarts, opening its new link in the same tab brings the threads back without replaying them.
- **Memory** (agent86 1.0.22): see the facts and episodes agent86 has stored, pin the ones that matter, and forget the wrong ones.
- **Secrets** (agent86 1.0.23): hand agent86 an API key or token through a masked entry, remembered for the project if you like, and answer the model in a masked prompt when it asks for one. The model only ever sees the name.
- **Model and approval-mode pickers**, `/` commands, and `@` file mentions.
- **Thread names** you choose (saved in agent86 with 1.0.17 or newer), a resizable sessions panel, and a **Quit** button.

## Requirements

- Node.js 20.19 or newer
- [agent86](https://github.com/Maetek-Technologies/agent86) 1.0.15 or newer on your `PATH` (1.0.17 or newer recommended: it keeps thread names you give in the browser and lists each workspace's own sessions), with a model it can use:

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

| Option               | Default                            | Meaning                                                                                                             |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--root <dir>`       | the current directory              | A folder that threads may run in, or in folders under it. Repeat for more.                                          |
| `--port <n>`         | the saved port, else any free port | The port to listen on. `0` means any free port. Also `AGENT86_WEB_PORT`.                                            |
| `--save-port`        | —                                  | Remember `--port` for later starts (`--port 0 --save-port` forgets it)                                              |
| `--host <addr>`      | `127.0.0.1`                        | A loopback address: `127.0.0.1`, `::1`, or `localhost`                                                              |
| `--agent86 <path>`   | `agent86` on `PATH`                | The agent86 to run. Pointing at the native binary instead of npm's launcher saves about 45 MB per thread.           |
| `--agent-arg=<arg>`  | —                                  | An argument for agent86, placed before `acp`. Repeatable, e.g. `--agent-arg=--model --agent-arg=openrouter:<model>` |
| `--max-agents <n>`   | `8`                                | The most agent86 processes running at once                                                                          |
| `--idle-timeout <d>` | `15m`                              | Stop an agent86 that has no open tab and no running turn after this long (`90s`, `15m`, `1h`)                       |
| `--no-open`          | —                                  | Print the link without opening the browser                                                                          |
| `--no-update-check`  | —                                  | Don't check npm for newer agent86 or agent86-web releases (also `AGENT86_WEB_NO_UPDATE_CHECK=1`)                    |

## Things to know

- **Workspaces.** A thread runs in one folder under a `--root`. Pick it with _Open a workspace…_. To work in another folder, open a new thread there.
- **Project settings need trust.** agent86 ignores the riskier settings in a project's `.agent86/config.toml`, such as MCP servers, providers, and approvals, until you trust the file. When it does, the thread shows a banner. _Review and trust_ shows the whole file. agent86-web remembers your decision for that exact file in `~/.agent86-web/trusted-projects.json`, and asks again if the file changes. Revoke it under _Settings & about_ (the agent86 version button in the top bar).
- **The approval mode new threads start in.** Choose it under _Settings & about_, or with _make default_ next to a thread's mode. agent86-web keeps it in `~/.agent86-web/settings.json`, so it holds in every browser and across restarts. Each thread keeps its own mode and model, even after a reload or a restart. To change agent86's own default everywhere, terminal included, set `approval = "auto"` (or `ask`, `deny`) under `[guardrails]` in `~/.agent86/config.toml`, or start agent86-web with `AGENT86_APPROVAL=auto` in its environment.
- **The same port every time.** `agent86-web --port 8686 --save-port` saves the port in `~/.agent86-web/settings.json`; later starts use it, and the browser keeps your open threads and prompt history across restarts. If the port is in use, agent86-web says so and stops. `--port` and `AGENT86_WEB_PORT` override it for one run.
- **Stopping.** Press Ctrl+C in the terminal, or use ⏻ (Quit) in the top bar. Either way, every agent86 it started stops; sessions are saved.
- **Model setup stays at the terminal.** Add keys with `agent86 keys set <provider>` or `/config model`.
- **Secrets.** With agent86 1.0.23, use _secrets_ in the thread header, or answer the masked prompt when the model asks. Don't type a secret after `/secret` in the message box: agent86-web won't send it, and opens the secrets panel instead. A secret you don't remember for the project lasts only as long as that agent86 process (agent86-web stops an idle one after `--idle-timeout`). With an older agent86, enter secrets with `/secret NAME` in `agent86` at a terminal, choosing to remember them for the project; browser threads then use them.
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
- A secret you type goes from a masked entry straight to agent86; agent86-web never shows, stores, or logs it. `AGENT86_WEB_TRANSCRIPT=<file>` records every relayed message for debugging, with secret values written as `<hidden>`; it holds your prompts and file contents, so delete it when done.

agent86's own approval gate, sandbox, and guardrails apply unchanged. The threat model is in [docs/SECURITY.md](https://github.com/Maetek-Technologies/Agent86-web/blob/main/docs/SECURITY.md).

## Troubleshooting

- **"agent86 was not found"**: install it (`npm install -g agent86`), or pass `--agent86 /path/to/agent86`.
- **"This sign-in link has already been used or has expired"**: run `agent86-web` again for a new link.
- **"agent86 could not start a session"**: its model has no API key. Run `agent86 keys set <provider>`, then choose _Try again_.
- **A project's MCP servers don't start**: trust the project from the banner in its thread.
- **agent86's own notes**: open _logs_ in the thread's header.

## License

MIT, © 2026 Maetek Technologies. agent86-web is a Maetek Technologies project, a browser interface for agent86. agent86 and its name, logo, and mascot belong to Maetek Technologies.
