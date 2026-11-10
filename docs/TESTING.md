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

`packages/mock-agent` is a small Node program that speaks ACP on stdio like `agent86 acp`. It is driven by scenario files:

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

- Install a pinned agent86 version in CI (`npm install -g agent86@<pinned>`).
- Point it at a local OpenAI-compatible mock server that replays canned completions, so no key or network is needed. Configure it with a `[providers.mock] base_url` block and `--trust-project` in a temporary workspace.
- Flows: start a thread, stream a reply, perform a tool call with an approval, cancel, list sessions, load a session.
- A nightly job runs the same flows against the latest agent86 release, to catch ACP changes early.

## 4. Flows covered end to end

1. First run: token login, info shown, token removed from the URL
2. Wrong origin, host, or expired token: refused
3. New thread → prompt → streamed Markdown → end of turn
4. Thinking block streams, then collapses
5. Tool call with approval: allow → file changed on disk. Reject → file unchanged, and the model is told.
6. Cancel during streaming, and cancel during a pending approval
7. Mode switch to `auto` → no approval asked. `deny` → refused without asking.
8. Model switch from the picker, including provider lists that arrive late
9. Session list → load → transcript replayed → continue
10. Two threads running at once
11. Reload during a turn → reattach → no lost messages
12. Idle reap → reopen → `session/load` restores
13. agent86 missing or too old → explanatory page
14. Untrusted project → banner → review → trust → process restarts with `--trust-project` → project MCP server tools appear. Edit the file → restricted again.

## 5. Quality gates

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm e2e` must all pass. Warnings count as errors.
- Coverage targets: `acp-client` and bridge policy code ≥ 90% of lines. UI coverage is measured but not gated.
- Accessibility: axe checks in Playwright for the main screens.
