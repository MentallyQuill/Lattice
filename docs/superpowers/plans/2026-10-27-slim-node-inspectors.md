# Slim Node Inspectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver a slim, understandable and easy-to-navigate real details bar
across all nodes affected by bloated shared editors, preserving supported behavior.

**Architecture:** Evolve shared controls and projection metadata in place. Reuse
qualified transactions, revision/acknowledgment handling, diagnostic and guide
components. Port the approved inline schema UI through its existing draft API.

**Tech Stack:** Svelte 5, TypeScript, existing JavaScript workflow engine,
Node component tests and Playwright production harness.

**Spec:** `docs/superpowers/specs/2026-10-27-slim-node-inspectors-design.md`

## Global Constraints

- Slim UI, clear labels, easy navigation; preserve every supported capability.
- Existing theme, node icons/designs and canonical guides remain authoritative.
- No implicit connection deletion, execution, or successful-save assumptions.
- Preserve exact schemas/keys, inactive and invalid drafts, source formatting.
- Native read-only and presentation capabilities remain independently enforced.
- None–5 retries means a maximum of six requests; failure eligibility unchanged.
- Existing checkout's unrelated uncommitted changes are outside this worktree.

## Review Focus

- Schema rules whose relevance differs from the currently selected type remain
  reachable and preserved, including absent versus explicit true/false/null.
- Old acknowledgments cannot clear newer drafts or affect another qualified node.
- Output changes preserve connections and either commit atomically or reject.
- Large/deep editors stay keyboard-accessible and bounded at narrow widths.
- Inherited/read-only settings expose capabilities accurately without offering
  unsupported resets or hiding actionable blockers.

---

### Task 1: Shared inline schema editor

**Files:** `ui/SchemaControl.svelte`, `src/ui/schema-authoring.d.ts`, schema
component/integration tests and browser details tests.

**Interfaces:** Consume existing SchemaControl props and SchemaDraftState;
extend optional view-state fields, keeping old cached drafts compatible.

- [x] Add failing tests for inline expansion, no redundant enable toggle,
  read-only navigation, exact source/key preservation and invalid draft recovery.
- [x] Port the approved Svelte editor with production-relative imports; retain
  contextual constraints, advanced JSON/rules and one bounded scroll region.
- [x] Adapt existing interaction tests to the approved controls and run schema
  authoring, integration and production browser checks.
- [x] Commit the independently verified shared schema change.

### Task 2: Real inspector grouping and atomic authoring

**Files:** `src/ui/node-control-projection.js`, `ui/NodeDetails.svelte`,
`ui/DetailControl.svelte`, `ui/detail-types.ts`, `src/ui/controller.js`,
`src/ui/workspace-preparation.js`, relevant projection/command/draft tests.

**Interfaces:** Preserve NodeDetailsActions; add an acknowledged atomic controls
action only for coupled changes. Keep existing single-control callers working.

- [x] Add failing projection/transaction/component tests for Model Call and
  other schema consumers, rejected output/stage edits, stale acknowledgments,
  readonly settings and presentation independence.
- [x] Group common settings by purpose, integrate output/schema atomically,
  retain truthful phase controls/context and reduce repeated helper chrome.
- [x] Show save/discard controls only for authored drafts and pending/errors;
  retain canonical diagnostics, guide access and advanced model overrides.
- [x] Run relevant component and production browser checks and commit.

### Task 3: Compact reusable controls and record/value editors

**Files:** `ui/DetailControl.svelte`, `ui/StructuredControl.svelte`,
`ui/JsonValueControl.svelte` and specialized editors where inventory finds the
same redundant chrome; matching component/browser tests.

**Interfaces:** Keep current typed values, callbacks, draft admission, exact
key semantics, operation-specific record schemas and available actions.

- [x] Inventory every affected operation/editor family in the execution ledger.
  Add failing tests for compact rows, inline navigation, hidden advanced detail,
  retained actions and accessible narrow/keyboard behavior.
- [x] Apply progressive disclosure to repeated records and typed children;
  use compact native boolean/scalar controls without removing settings.
- [x] Run existing structured/value/decision/schedule tests, fix affected
  interaction expectations, and exercise representatives in the real harness.
- [x] Commit the verified shared-control changes.

### Task 4: Retry range and complete integration verification

**Files:** Retry descriptors/validators/help and tests across existing model
operations, browser coverage, developer docs and generated `dist/lattice-ui.js`.

**Interfaces:** Keep `maxRetries` integer; widen supported range consistently
from 0–2 to 0–5, preserve request bound `1 + maxRetries` and retry eligibility.

- [x] Add failing boundary tests (0/5 accepted, 6/noninteger rejected) for every
  runtime retry contract and a real slider/undo browser interaction.
- [x] Implement the range and accurate None/count/total-call labeling.
- [x] Run full unit suite, Svelte type checks, build/assets/examples checks and
  browser suite. Inspect production screenshots at required widths/themes.
- [x] Obtain the required fresh whole-branch review, address material findings
  with regression tests, rebuild assets and prepare the worktree for review.
