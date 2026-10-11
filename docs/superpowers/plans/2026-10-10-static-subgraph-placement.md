# Static Subgraph Placement Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for scoped work and reviews.

**Goal:** Allow all ordinary workflow operations in static subgraphs while preserving the enclosing run's capabilities and behavior.

**Architecture:** Reuse trusted static composition eligibility. Carry full instance addresses through native activation, actor and memory capability dispatch, Recall registration/provenance, and final settlement. Keep graph boundary structure and repeated-helper authority checks.

**Tech Stack:** JavaScript ES modules, Node test runner, Svelte, Playwright.

**Spec:** User-approved audit and request: fix all remaining placement exclusions; grouping preserves execution behavior and permissions.

## Global Constraints

- Preserve concurrent workspace edits; do not commit, push, or replace the checkout.
- Static grouping must not create capabilities for public runners, manual generation previews, or For Each helpers.
- One owned On Send activation and native generation per run; existing review and accepted settlement rules apply at any nesting depth.
- Private actor material, source freshness and file/memory authority checks remain effective.
- Exact immutable definition pins and legacy semantic hashes remain compatible.

## Review Focus

- Same node IDs in sibling definitions must not collide in Recall shortcuts, source provenance or memory intent identity.
- Disabled nested systems contribute no activation, hotkey registration or settlement.
- Manual previews must not generate native replies or commit state.
- Nested legacy source/output definitions must preserve phase contracts.
- Unpack, undo and portable round trips preserve connections and execution behavior.

## Task 1: Authoring eligibility

Files: system-capabilities.js, graph-validation.js, composition-transform.js, ui/controller.js and focused authoring tests.

- [x] Add failing extraction and UI tests for each formerly excluded operation, including implicit State.
- [x] Extend trusted static eligibility and remove conflicting hard-coded placement gates; keep boundaries and iteration contracts.
- [x] Run authoring, definition identity and composition tests.

## Task 2: Address-aware Recall

Files: native-recall.js, Recall UI projection/controller integration where necessary, and Recall regression tests.

- [x] Add failing nested Recall and shortcut tests with duplicate local node IDs, disabled wrappers and cancellation.
- [x] Discover and key nested shortcuts by full address, preserve queue command freshness and retained artifact provenance.
- [x] Run Recall queue, registration, activation and source-freshness tests.

## Task 3: Owned execution and settlement

Files: runtime.js, resolve.js, host.js, lifecycle-nodes.js, introspection/nodes.js and host regression tests.

- [x] Add failing tests for nested full Send-to-Review paths, context sources, actor context and memory read/recall/commit.
- [x] Route static host operations through the existing owned adapter, preserve public/iteration restrictions, and remove canvas-depth assumptions.
- [x] Key memory intent identity and scene provenance by full address and settle nested terminals under the existing owner.
- [x] Verify disabled systems, duplicate activation/generation/commits, private material and preview behavior.

## Task 4: Integration and documentation

- [x] Review scoped changes independently and resolve findings.
- [x] Update user documentation to describe static composition and remaining structural/repeated-helper constraints.
- [x] Run focused suites, types, build, assets, browser authoring/runtime checks, then one full Node suite after changes stabilize.


## Review outcome

Authoring review approved with 78 passing tests. Runtime and Recall review approved with 93 passing focused tests after repairing long-path Scene Context source identities. Owned execution and generation regressions pass 27/27. Fresh browser checks pass 23/23; types, build and assets pass. Final full Node pass completed successfully: 309/309 test files, exit 0. Final type check reports zero errors and warnings.
