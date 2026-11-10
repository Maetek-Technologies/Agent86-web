# 0002. React, TypeScript, and Vite single-page app

## Status

Accepted (2026-11-10)

## Context

The UI is a highly interactive, single-user, real-time app: streamed Markdown, many updating tool cards, modal approvals, and pickers. In phase 1 it is served from localhost by a small bridge, so server-side rendering, SEO, and edge functions bring no benefit. It must build to static files that ship inside an npm package.

Alternatives considered: Next.js (its SSR and server features are unused locally, and it is heavier to embed), SvelteKit (lighter, smaller ecosystem for the components we need), and Rust/WASM with Leptos (could share types with agent86, but agent86 is not consumed as a library, and the ecosystem is smaller).

## Decision

- **React 18** with **TypeScript** (strict) and **Vite**, built to static assets
- **Tailwind CSS** and **shadcn/ui** (Radix primitives) for accessible components and theming
- **Zustand** for state. The protocol state lives in the framework-free `acp-client` package.
- A Markdown renderer with raw HTML disabled, lazy syntax highlighting, and a diff viewer component, each chosen in M2 or M3 for bundle size and safety
- **pnpm** workspaces, **Vitest**, **Playwright**, ESLint, and Prettier

## Consequences

- Wide hiring and contributor familiarity, with mature components for Markdown, diffs, virtualization, and accessibility.
- Static output embeds easily in the bridge package, and a hosted phase 2 can serve the same build from a CDN.
- If marketing or docs pages are wanted later, they live in a separate site, not in this SPA.
