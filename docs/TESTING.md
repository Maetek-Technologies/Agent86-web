# Testing strategy

The aim is to test the protocol, the bridge's security, and the UI without needing a real model, with a smaller set of end-to-end checks against the real agent86.

## 1. Layers

| Layer | Tool | What it covers | Runs in CI |
|---|---|---|---|
| `acp-client` unit | Vitest | JSON-RPC correlation, timeouts, errors, folding `session/update` into session state, permission handling, and cancellation semantics (an open permission request is answered `cancelled`) | yes |
| Protocol conformance | Vitest + Ajv | Every message the client sends, and every message in recorded transcripts, validates against ACP's `schema/v1/schema.json` (vendored with its version) | yes |
| Bridge unit and integration | Vitest + `ws` | Token login, Host, Origin, and cookie checks, cwd jail (`..`, symlinks, case), `mcpServers` stripping, capability forcing, frame limits, process lifecycle (spawn, idle reap, cap, reattach replay) | yes |
| Web components | Vitest + Testing Library | Markdown sanitization (XSS corpus), tool cards, the permission panel, the diff view, keyboard shortcuts | yes |
| End to end (mock agent) | Playwright | Full flows in a real browser against the bridge with `packages/mock-agent` instead of agent86 | yes |
| End to end (real agent86) | Playwright | Smoke flows against the real `agent86 acp` with a scripted model endpoint | yes (Linux), optional elsewhere |
| Manual | checklist | Real models, long sessions, reconnects, Safari and Firefox | before each release |

## 2. Mock agent

`packages/mock-agent` holds two test doubles:

- **`mock-agent86.js`** speaks ACP on stdio like `agent86 acp`, and answers `--version` like agent86. It records what it receives when `MOCK_AGENT86_RECORD=<file>` is set.
- **`mock-openai.js`** is an OpenAI-compatible chat completions server that streams scripted replies, with reasoning in `reasoning_content`. A real agent86 is pointed at it, so a full turn runs with no key or network.

As built in M2, both pick a script from keywords in the prompt, and they share the scripts, so a test reads the same against either: `fail` gives an HTTP 400 model error, `slow` gives a long reply for cancel tests, `markdown` gives a reply exercising GFM and the XSS cases, and anything else gives a short reasoning trace and `Hello from the mock model. You said: <text>`. The mock agent also answers `/cost` without a model, as agent86 does.

As built in M3, both also run tool calls: `typo` (edit_file on README.md), `write` (write_file), `command` (run_command), `python` (python_exec), `read` (read_file, no approval), and `skill` (write_file into `.agent86/skills`, which agent86 warns about). The mock agent sends permission requests in agent86's exact text formats and really edits the file once allowed. `e2e/approvals.spec.ts` runs the approval flows against both.

If the scripts outgrow keywords, the plan is scenario files:

```yaml
# scenarios/edit-with-approval.yaml
on_prompt:
  - thought: "I should read the README first."
  - tool_call: { id: t1, title: read_file, kind: read, rawInput: { path: README.md } }
  - tool_call_update: { id: t1, status: completed, content: "Teh quick brown fox" }
  - request_permission:
      toolCall: { id: t2, title: edit_file, kind: edit,
                  content: [{ type: diff, path: README.md, oldText: "Teh", newText: "The" }] }
      options: [{ optionId: allow, name: Allow once, kind: allow_once },
                { optionId: reject, name: Reject, kind: reject_once }]
      on_allow:  [ { tool_call_update: { id: t2, status: completed } }, { message: "Fixed it." } ]
      on_reject: [ { tool_call_update: { id: t2, status: failed } },    { message: "Okay, left it." } ]
  - stop: end_turn
```

The bridge accepts `--agent86 <path-to-mock>`, so the same code path is tested. Scenarios are modeled on real agent86 transcripts, recorded with `AGENT86_ACP_TRANSCRIPT=<file>` (the variable agent86's own ACP tests use), so the mock stays faithful to what agent86 actually sends.

## 3. Real agent86 smoke tests

- Install a pinned agent86 version in CI (`npm install -g agent86@<pinned>`), and set `AGENT86_BIN=agent86` for the Playwright run.
- Point it at `mock-openai.js`, so no key or network is needed. As built in M2, `e2e/bridge.ts` (`scriptedModel()`) starts the server and writes a temporary home directory (`HOME` and `USERPROFILE`) whose `~/.agent86/config.toml` sets `[model] default = "mock:test-model"`, a `[providers.mock] base_url`, and the hash embedder. The user file needs no project trust.
- The chat flows in `e2e/chat.spec.ts` run once against the mock agent and once against the real agent86.
- Flows: start a thread, stream a reply, cancel, see a model error, run a slash command (M2). Later: a tool call with an approval, list sessions, load a session.
- A nightly job runs the same flows against the latest agent86 release, to catch ACP changes early.

## 4. Flows covered end to end

Status as of M4: ✅ covered in `packages/web/e2e/` (against the mock agent and, with `AGENT86_BIN`, the real agent86), 🧪 covered by bridge or client tests only, ⬜ not yet.

1. ✅ First run: token login, the token removed from the URL, the About panel
2. ✅ Wrong origin, host, or expired token: refused (🧪 in the bridge tests; ✅ for a reused link)
3. ✅ New thread → prompt → streamed Markdown → end of turn
4. ✅ Thinking block streams, then collapses
5. ✅ Tool call with approval: allow → file changed on disk. Reject → file unchanged, and the model is told.
6. ✅ Cancel during streaming, and cancel during a pending approval
7. ✅ Mode switch to `auto` → no approval asked. `deny` → refused without asking.
8. ✅ Model switch from the picker (🧪 provider lists that arrive late)
9. ✅ Session list → load → transcript replayed → continue, including a session started at the terminal with `agent86 run`
10. ✅ Two threads running at once
11. ✅ Reload during a turn → reattach → wait for the turn → the whole reply is there
12. 🧪 Idle reap and the agent cap (`threads.test.ts`); ⬜ in a browser
13. ✅ agent86 not agent86 or too old → explanatory page (🧪 too old, in the bridge tests)
14. ✅ Untrusted project → banner → review → trust → process restarts with `--trust-project` → the project's MCP server's tool appears. Edit the file → restricted again. Revoke.
15. ✅ `/` command menu, `@` file mentions sent as links, logs drawer, workspace picker
16. ✅ Reload keeps the open threads

The test MCP server is `packages/mock-agent/src/mock-mcp.js` (one tool, `mock_echo`; agent86 lists it as `mcp__demo__mock_echo`).

## 5. Quality gates

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm e2e` must all pass. Warnings count as errors.
- Coverage targets: `acp-client` and bridge policy code ≥ 90% of lines. UI coverage is measured but not gated.
- Accessibility: axe checks in Playwright for the main screens.
