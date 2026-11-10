# 0003. A standalone Node bridge; agent86 is not modified

## Status

Accepted (2026-11-10)

## Context

A browser cannot spawn processes or read stdio, so something local must carry ACP between a WebSocket and `agent86 acp`. Options:

1. **Add `agent86 serve` to agent86** (Rust): it would serve the UI embedded in the binary and speak ACP over WebSocket internally. This is the neatest result, but it means contributing to and depending on another project's release schedule and review.
2. **A standalone bridge** in this repository, which spawns `agent86 acp` and relays.

The user chose to keep agent86 untouched.

## Decision

- The bridge is a **Node.js + TypeScript** command-line program (`agent86-web`). It uses the same toolchain as the web client, is distributed on npm like agent86 itself, and needs Node only (which agent86's npm install already requires).
- It talks to agent86 **only** through `agent86 --version` and `agent86 acp`. It never reads agent86's database, config, keyring, or traces, and never imports its code.
- It is intentionally thin: static file serving, authentication and origin checks, process management, the relay, and a small **policy filter** on client-to-agent messages (cwd jail, stripping `mcpServers`, forcing capabilities off). It does not reinterpret agent messages.
- Gaps that need agent86 changes are recorded as an upstream wishlist in `PROJECT_PLAN.md`, not patched here.

## Consequences

- No coordination with agent86 releases is required. Any agent86 ≥ the minimum version works.
- One extra process and one extra hop, which costs little next to model latency.
- Users install two packages (`agent86` and `agent86-web`). The bridge detects a missing or old agent86 and explains how to fix it.
- If agent86 later adds a native WebSocket or `serve` mode, the bridge can become optional. The client is unaffected, because it depends only on ACP over a `Transport`.
- The policy filter means the bridge parses messages from the client. It must stay small and well tested, as it is part of the security boundary (`SECURITY.md`).
