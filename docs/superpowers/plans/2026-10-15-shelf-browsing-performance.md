# Shelf Browsing Performance Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for the UI changes; independent agents own the browser regression and benchmark tool.

**Goal:** Make repeated shelf family browsing reuse catalog preparation, rendered rows, and valid geometry, and demonstrate reduced browser work and hover readiness time.

**Architecture:** Keep lazily rendered family row containers alive and detach inactive containers from the document using a Svelte action. Derive display entries from catalog props, but validate insertion and saved-subgraph actions against current choices. Cache measured drawer geometry by family and pane/anchor dimensions; invalidate it on catalog, context, lock, theme, and font changes. Read anchor/pane bounds before changing the active family on the warm path.

**Tech Stack:** Svelte 5, TypeScript, Node test runner/jsdom, Playwright/Chromium CDP.

**Spec:** User's shelf responsiveness requests in this chat and the active goal. Preserve existing visible behavior, search aliases/canonical choices, disabled choices, keyboard navigation, drag/drop, and compact drawer bounds. No new dependencies or Git publication.

## Review Focus

- An old rendered row must never insert a choice removed or disabled since rendering.
- Detached rows must stay out of focus traversal, accessibility, and live menu queries.
- Close, Escape, same-family reopening, and teardown must cleanly handle retained DOM.
- Compact back rows, pane resizing, theme/font changes, and subgraph group headers must not reuse stale geometry.
- Equal catalog refreshes must preserve open menus and focus.

## Task 1: Prepare and retain family drawers

**Files:** `ui/NodeShelf.svelte`, `tests/ui-node-shelf.test.mjs`, `tests/browser/shelf-browsing.spec.mjs`.

- [x] Add and observe a failing regression for row identity across family changes and reopening.
- [x] Derive canonical display entries once per catalog change, retaining fresh action validation.
- [x] Render visited families once; detach inactive wrappers through a Svelte action and reuse the active wrapper in the normal menu.
- [x] Verify shelf component tests, browser traversal, drag, placement, search, saved-subgraph actions, and compact geometry.

## Task 2: Reuse valid geometry and measure the result

**Files:** `ui/NodeShelf.svelte`, `tests/browser/shelf-browsing.spec.mjs`, `tools/benchmark-shelf-browsing.mjs`, generated `dist/lattice-ui.js`.

- [x] Add and observe a failing regression for repeated drawer measurement after warm-up and invalidation after geometry-affecting changes.
- [x] Cache family measurements; read clean pane/anchor geometry before state writes; invalidate affected cached measurements when inputs change.
- [x] Rebuild and run the targeted tests, types, assets, and full unit suite once after the final change; request an independent diff review.
- [x] Compare the saved starting bundle with the final bundle in alternating matched browser runs. Report timing and work counters separately from paint claims; preserve the report under `docs/research` if useful.

## Completed evidence

See `docs/research/2026-10-15-shelf-browsing-performance.md` and its linked results. All 347 unique unit files and 43 relevant browser checks passed. The 48-context matched benchmark found 31.7–34.3% lower warm readiness times and zero new warm row identities. Types/build/assets passed; independent review found no actionable issues.

## Verification commands

- `npm test -- ui-node-shelf ui-shelf-placement ui-subgraph-shelf-actions`
- `npm run check:types`, `npm run build`, `npm run check:assets`
- Dedicated-port Playwright shelf/compact/keyboard/workspace tests.
- `npm test` (partition if the execution environment terminates a long run; retain exact per-file results).
- `node tools/benchmark-shelf-browsing.mjs --baseline=.tmp/shelf-start-2026-10-15.js`
