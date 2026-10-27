# Workflow Failure Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the three approved global failure behaviors and verify recovery without breaking workflow dependency or host ownership rules.
**Architecture:** A pure shared policy module defines the enum and copy. Settings/UI save the preference; each host run captures it. Runtime recovery preserves complete artifacts and evaluates remaining dependencies, while the host decides whether native generation may continue or must stop.
**Tech Stack:** JavaScript ES modules, Svelte, Node test runner, jsdom, Playwright, Vite.
**Spec:** docs/superpowers/specs/2026-10-27-workflow-failure-policy-design.md

## Global Constraints
- Exact label: When a node fails.
- Exact choices: Fall back to SillyTavern; Stop all generation; Continue where possible.
- Values: native-fallback, stop, continue-available. Default: native-fallback.
- Capture per run. No workflow serialization or provider calls. Do not modify the original checkout.
- Recovery cannot turn unresolved/cancelled/stale/privacy failures into optional absence.
- Preserve required-input, accepted-effect, source freshness and host ownership contracts.
- Use one failing test, minimal implementation and passing focused test per behavior.

## Review Focus
- Optional failed versus ordinary unresolved input: runtime tests.
- Group/automatic continuation stop and reentrant stop events: host tests.
- Nested dependency addresses and iteration atomicity: runtime recovery tests.
- Preference change during a run and late old-run errors: host tests.
- Recovered result retention, review/effects and notice privacy: integration tests.

### Task 1: Global policy and settings select
**Files:** Create src/workflow/failure-policy.js and .d.ts; modify src/state.js, index.js, style.css; add tests/workflow-failure-settings.test.mjs; extend tests/lattice-launcher.test.mjs.
**Interfaces:** Export WorkflowFailurePolicy = 'native-fallback' | 'stop' | 'continue-available'; isWorkflowFailurePolicy(value), normalizeWorkflowFailurePolicy(value), WORKFLOW_FAILURE_OPTIONS (value,label,description). State exports getWorkflowFailurePolicy(), setWorkflowFailurePolicy(value). Setter validates, saves with recovery:false and updates pc-state. No src/run.js edits.
- [x] Test missing/default/admitted/rejected preferences, setter save and import preservation; run red.
- [x] Implement smallest shared policy and state integration; run focused green.
- [x] Test actual launcher select labels, saved selection/help and repaint; run red, implement, run green.

### Task 2: Dependency-aware runtime recovery
**Files:** Own src/workflow/runtime.js, resolve.js if necessary, run-state.js, recording.js, record-data.js, types.d.ts and their focused recovery tests. Do not edit host.js, src/run.js or global settings.
**Interfaces:** WorkflowRunOptions.failurePolicy uses shared policy enum. Host passes captured policy. Recovered success returns ok:true, recovered:true, failures (bounded safe node errors), and explicit partial recording/run settlement. Failures are retained without artifacts; existing skipped port states with failure cause may be reused. Ordinary unresolved is preserved. Non-recovery policies preserve fail-fast runtime behavior.
- [x] Add a failing independent-branch recovery test, implement minimal continuation and recording support, run green.
- [x] Incrementally test required dependency blocking and optional Compose/Join boundaries, stage barrier, failed required output, nested addresses and ordinary unresolved conditions.
- [x] Incrementally test retries, iteration atomicity, fatal cancellations/scope/freshness, unavailable bindings and selected-output completion.
- [x] Run runtime, recording, reducer, retry, control/compose and stage-barrier suites.

### Task 3: Native host failure disposition and notifications
**Files:** Own src/workflow/host.js, src/run.js, src/ui/failure-notification.js, src/workflow/diagnostic-history.js if needed, and focused host/notice tests. Coordinate shared types with Task 2.
**Interfaces:** Inject getFailurePolicy() and stopGeneration() into createNativeWorkflowController. start captures failurePolicy. execute passes failurePolicy to runtime. Add actual failureDisposition metadata, retaining failurePolicy/recovered fields. Native stop must be owned, once-only and reentrancy-safe. Safe fallback stays default. Recovered results retain review handles and clear failed-branch proposals.
- [x] Add one strict preparation failure test; run red; implement owned stop/disposition; run green.
- [x] Test post-completion failures, safety abort precedence, replacement-run ownership, setting capture and reentrant stop diagnostics incrementally.
- [x] Add recovered notice/host fixture integration and partial-result retention tests, implement and run green.
- [x] Update public facade to inject the real native stop helper and display captured outcome notices.

### Task 4: Integration, documentation and verification
**Files:** docs/native-workflows.md, docs/unified-workflows.md, docs/developer-guide.md as needed; built dist/lattice-ui.js only if build changes it; integration/browser tests as needed.
- [x] Run 3-of-5 guidance scenario through the native controller with synthetic transport, verify exact successful guidance and errors.
- [x] Document the global setting and when recovery can/cannot proceed.
- [x] Run npm run check, inspect actual launcher select in browser and perform a fresh whole-branch review.
- [x] Fix review findings, rerun affected checks, preserve the worktree for user review and report evidence.
