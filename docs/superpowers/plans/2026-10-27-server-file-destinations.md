# Server File Destinations Implementation Plan

> For agentic workers: use subagent-driven development for independent server, client and UI segments.

**Goal:** Configure paths per node, save through SillyTavern's server, and push the verified fix to main.

**Architecture:** An installed `lattice-files` server plugin reuses the existing checked journal with Node filesystem handles. A same-origin HTTP adapter implements NodeFileAccess and the existing backend contract. Node configuration owns the explicit path; imported workflows cannot grant bindings.

**Tech stack:** Existing JavaScript/Svelte/TypeScript contracts, Node standard filesystem/crypto, SillyTavern's supplied router; no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-27-server-file-destinations.md`.

## Constraints and review focus

- No native picker/experimental browser setting required for new file nodes.
- User isolation, symlink containment and opaque binding authority checked server-side.
- Configuration/preview/rejection do not write file bytes; accepted Apply does.
- Empty files, Unicode paths, Windows/Mac/Linux path rules and absent parent folders behave explicitly.
- Network uncertainty and external modifications must preserve the existing pending-write/review protections.

## Tasks

- [x] Server: regression first, implement `server-plugin/index.mjs` plus filesystem adapter using existing journal; test authenticated routes, real file IO, scope and restart. Own `server-plugin/**`, `tests/server-file-service.test.mjs`.
- [x] HTTP client: regression first, implement `src/ui/server-file-access.js/.d.ts` and `tests/server-file-access.test.mjs` against the specified API. Preserve request freshness and recovery interfaces.
- [x] UI/contracts: regression first, add path intent, explicit path configuration and installation guidance to node File section; retain legacy native adapters. Own node-file target/actions/projection/types/panel modules and their tests.
- [x] Integration: select HTTP service by default with trusted host headers/user, preserve native binding routing, add installer/docs and browser end-to-end fixture without native APIs.
- [x] Remove the legacy global Configure menu/dialog and controller wiring while preserving saved documents, archives and migration; update active guides and tests.
- [x] Verify changed segments, request independent review, run complete unit and browser suites, types/build/assets/examples. Resolve integration failures without weakening assertions.
- [ ] Commit, merge latest main safely, push main using GitHub CLI authentication, verify remote revision.
