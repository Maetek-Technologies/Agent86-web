# 0001. The web UI is an ACP client, reaching agent86 over WebSocket

## Status

Accepted (2026-11-10)

## Context

We want a browser interface for agent86. Some component has to run the agent loop: the model calls, the tools, the sandbox, approvals, memory, and sessions. The options were:

1. **Re-implement the agent in the browser** (TypeScript, or agent86 compiled to WASM). This works with no install. But it has no shell, no Python, no sandbox, and no OS keyring, file access is limited to the File System Access API, and it would diverge from agent86's behavior.
2. **A hosted service** that runs agent86 in server-side containers. This needs no install, but brings accounts, isolation, key custody, and cost, which is a large first step.
3. **Drive the user's local agent86** from the browser through a local process.

For option 3, agent86 already has a machine interface that does most of what a UI needs: `agent86 acp`, an Agent Client Protocol v1 server on stdio. It streams replies and reasoning, reports tool calls, asks permission with diffs, lists and loads sessions, offers mode and model pickers and slash commands, and supports cancel. It has been checked against the ACP schema and is used by Zed.

The user chose a phased approach: local first, with hosting possible later. The audience is people who already run agent86 locally.

## Decision

- The web UI is an **ACP v1 client**. It speaks ACP to `agent86 acp`, exactly as an editor does.
- In the browser, ACP messages travel over a **WebSocket**, one JSON-RPC message per text frame. A bridge maps them to and from agent86's newline-delimited stdio.
- The client's protocol code depends on a `Transport` interface, not on the bridge, so a hosted gateway (phase 2) can carry the same protocol.

## Consequences

- Every agent86 behavior (tools, guardrails, the sandbox, approvals, memory, sessions, traces) comes for free and stays identical to the terminal and to editors. Sessions move freely between the web UI, the terminal, and editors.
- The UI is limited to what agent86 offers over ACP. Terminal-only features (config screens, secret prompts, the live cost status line, `/limits`, `/skills`, `/memory`) are not available in phase 1. They are tracked in `FEATURE_PARITY.md` and the upstream wishlist.
- The client must follow ACP's evolution. Types are generated from the published schema, and messages are validated in tests.
- Phase 2 reuses the client, and the hosting work is backend-only.
