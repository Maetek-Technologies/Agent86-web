# Phase 2: hosted backend (design sketch)

**Status:** sketch only. Nothing here is scheduled. Revisit after phase 1 has real use.

## 1. Goal

Let a signed-in user open agent86-web in a browser with nothing installed, run threads against their repositories, and come back later. The UI and the protocol are the same as in phase 1.

## 2. Shape

```
Browser (same SPA) ──WSS + OIDC session──▶ Gateway ──▶ Session runner ──▶ container: agent86 acp
                                            │  auth, routing,   │ schedules,     │  /workspace (git clone)
                                            │  ACP policy filter│ reaps idle     │  /home/agent/.agent86 (volume)
                                            ▼                   ▼                │  keys as env vars
                                       Postgres (users, threads, workspaces)     │  egress policy
                                       Secrets store (provider keys)             ▼
                                                                          model providers
```

- **Gateway:** terminates TLS and authenticates the user (OIDC, e.g. GitHub sign-in). It maps `/acp/<threadId>` to the thread's container. It applies the **same policy filter as the phase 1 bridge** (cwd jail, MCP stripping, capability forcing), so the policy code is shared, not rewritten.
- **Session runner:** starts one container per active thread (or per user, see open questions), from an image with a pinned agent86 version. It runs `agent86 acp` with stdio attached to the gateway, stops containers when idle, and restores them with `session/load`.
- **Container:**
  - A non-root user and a read-only root file system, except `/workspace` and the user's agent86 home.
  - agent86's sandbox runs inside, in subprocess mode. Docker-in-Docker is not used.
  - CPU, memory, disk, and process limits apply.
  - Egress is limited to model providers and allowed hosts, which keeps `web_fetch` useful while limiting exfiltration.
- **Persistence:** each user has a volume for `~/.agent86` (config, `memory.db`, sessions, traces), so sessions and memory survive container restarts. Workspaces are Git clones. Results are pushed to a branch, not left on disk.
- **Keys:** users add provider keys in a settings page. Keys are stored encrypted in a secrets manager and injected as provider environment variables (`OPENROUTER_API_KEY` etc.) when a container starts, which is a source agent86 already reads. The OS keyring is unavailable in a container.

## 3. What changes in the client

| Concern | Phase 1 | Phase 2 |
|---|---|---|
| Transport | `WebSocketTransport` to `ws://127.0.0.1` | Same class, to `wss://…`, with a session cookie |
| Auth | Launch token → cookie | OIDC → cookie (an `Auth` implementation) |
| `BackendApi` | `/api/info`, `/api/workspaces` (local directories) | `/api/info`, `/api/workspaces` (Git repositories), `/api/keys` |
| New screens | — | Sign-in, key management, repository connection, usage |

The ACP layer, transcript, approvals, and pickers stay the same.

## 4. Features hosting makes possible

- **Secrets entry:** with a server-side settings page outside the ACP conversation, secrets can be entered safely and injected as environment variables. This partly solves the ACP secret limitation (see [OPEN_QUESTIONS.md Q3](OPEN_QUESTIONS.md#q3-secrets)).
- **Model configuration:** a settings page can write `~/.agent86/config.toml` in the user's volume, which covers `/config model` and `/config mcp` for the hosted case.
- **Scheduled jobs:** when agent86 ships `agent86 schedule daemon` (planned upstream), the runner could host it.

## 5. Hard problems to solve before building

1. **Isolation strength:** containers versus gVisor or Firecracker microVMs for running untrusted code from many users.
2. **Cost:** an idle agent86 process loads an embedding model. Measure memory per container, and consider `[memory]` settings or the hashing embedder for hosted use.
3. **Abuse:** sign-up limits, egress controls, and quotas on compute and model spend (BYO keys reduce, but do not remove, the risk).
4. **Data protection:** session databases hold code and conversation. This raises questions of encryption at rest, retention, deletion on request, and region.
5. **agent86 upgrades:** roll image versions without breaking resumed sessions. The session database stays compatible across agent86 versions, which helps.
6. **Licensing and naming:** whether a hosted service may use the agent86 name and logo. See [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md#q7-branding).

## 6. Rough milestones

- **H1:** single-tenant prototype. One container per thread on a single host, behind the gateway, using the phase 1 client.
- **H2:** OIDC sign-in, per-user volumes, and key storage.
- **H3:** GitHub repository connection (clone, then push a branch, then open a PR).
- **H4:** quotas, idle reaping, metrics and alerts, and data deletion.
