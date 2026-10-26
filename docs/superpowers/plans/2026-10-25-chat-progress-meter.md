# Chat Progress Meter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show live pixel stage progress above the chat launcher and fade it out over three seconds after settlement.

**Architecture:** Multicast existing native controller runtime events from the run facade. A small DOM presenter retains the existing run-state reducer independently of the optional launcher DOM. The launcher mounts it once and CSS handles appearance and the three-second fade.

**Tech Stack:** JavaScript ES modules, existing run-state reducer, native DOM, Node tests/JSDOM, Playwright.

**Spec:** docs/superpowers/specs/2026-10-25-chat-progress-meter-design.md

## Global Constraints

- No new dependencies or workflow execution changes.
- Percentage counts completed or skipped included primitives; running is at most 99%, successful settlement is 100%.
- Fade all terminal states over exactly three seconds; never retain an idle meter.
- Preserve unrelated working-tree changes and leave changes uncommitted.
- GitHub operations, if needed, use gh with network permission enabled.

## Review Focus

- A prior run's late events or fade timer cannot obscure the current run.
- Skips and nested stages count once; retries do not inflate progress.
- Cancellation may clear busy before its final runtime event.
- Hiding/remounting the shortcut retains current progress and fade deadline.
- Narrow chat layouts retain usable controls and focus behavior.

### Task 1: DOM progress presenter

**Files:** Create src/ui/chat-progress.js and tests/ui-chat-progress.test.mjs.

**Interfaces:** `createChatProgress({document, subscribeActivity, subscribeEvents})` returns `{mount(buttonOrNull), dispose()}`. Both subscription callbacks return unsubscribe functions. Events use the existing runtime schema; activity contains busy/runId or null. Presenter emits `.pc-chat-progress`, `.pc-chat-progress-pixels`, `.pc-chat-progress-pixel[data-status]`, `.pc-chat-progress-percent`, `data-status`, and `.pc-chat-progress-fading` for CSS. Root element is hidden at idle; percent text is `—` before plan and `N%` afterward. At most 36 display pixels using root projectRunRows aggregation (matching existing meter), while percentage counts primitive state nodes. Accessible role/status text identifies finished/total stages, skipped count, and terminal outcome. Timers use normal global setTimeout/clearTimeout.

- [x] Write and run one failing test at a time for active rendering, skipped stages and settlement, three-second removal, restart/stale events, cancellation ordering, remounts, and overflow.
- [x] Implement the smallest presenter using createRunState/reduceRunState/projectRunRows.
- [x] Run `node --import ./tools/node-test-host.mjs tests/ui-chat-progress.test.mjs` until green.

### Task 2: Launcher integration and visual verification

**Files:** Modify src/run.js, index.js, style.css, tests/lattice-launcher.test.mjs; create tests/browser/chat-progress.spec.mjs.

**Interfaces:** `subscribeWorkflowRunEvents(listener)` in src/run.js returns unsubscribe; the controller's onEvent multicasts without allowing observers to affect execution. Launcher boot creates one presenter before native initialization, mounts/remounts it with the button, detaches on shortcut removal, and disposes on unload.

- [x] Add a failing launcher test asserting meter mounting/detaching while normal click/toggle behavior remains intact, then implement the integration.
- [x] Add compact anchored styling and three-second opacity transition, reusing existing pixel colors. Keep content inside mobile viewport and prevent pointer interception of neighboring controls.
- [x] Add a browser test using real controller events to check idle absence, active pixels and percentage, settlement fade at its midpoint, removal at three seconds, and immediate restart.
- [x] Run targeted tests, `npm test`, `npm run check:types`, `npm run build`, `npm run check:assets`, and relevant browser tests. Inspect desktop and narrow screenshots.
- [x] Review only this feature's delta against the saved working-tree baseline, fix actionable findings, and record verification.

## Verification record

Selection verification on 2026-10-25 against the clean 0.28.0 worktree:

- Reproduced the expected pre-port failures: missing presenter, missing launcher mount, and the retry guide explanation gap.
- Presenter tests: 8 passed; launcher tests: 8 passed; node guide tests: 10 passed (3 of 3 focused files).
- Browser tests: 3 passed on an isolated local harness port. Coverage includes actual facade manual execution, automatic Send while the editor is closed, midpoint opacity, three-second hiding, restart during fade, and a 320px viewport without shifting controls.
- Preserved the 0.28.0 foundation and persistent failure notices. The port does not include unfinished memory work or private workflow data.
- Broader release checks are recorded by the integration task; these focused results alone do not assert a full-suite pass. Live SillyTavern themes and real screen-reader announcements remain outside the mock-host verification.
