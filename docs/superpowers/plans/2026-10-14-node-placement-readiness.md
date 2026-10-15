# Immediate Node Placement and Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Place every available node immediately, retain incomplete authored workflows, show actionable readiness, and validate only requested execution dependencies before effects.

**Architecture:** Separate bounded authoring admission and declared operation shape from executable settings validation. Prepared authoring inventories carry addressed setup issues; execution closure preflight remains strict. Readiness is prepared display data, rendered in one measured decoration stack alongside model identifiers.

**Tech Stack:** Existing JavaScript ES modules, Svelte 5, TypeScript declarations, Node >=24, Node tests, Playwright, Vite. No new runtime dependencies.

**Spec:** `docs/research/2026-10-14-node-placement-readiness-issue.md` (approved by the user, including implementation, merge to main, and push to main).

## Global Constraints

- Required settings, model selection, document authorization, and helper selection never gate placement of an available operation.
- Preserve existing malformed-data, scope, phase, bounds, ownership, hash, wire-type, cycle, and currentness protections.
- Never fabricate semantic actor/item/schedule/helper/document identities or authorization.
- Keep malformed field text in local editor drafts; admit canonical incomplete control values progressively.
- Use existing node types/control storage and declared exact definition references. Readiness is derived, not persisted authority.
- Preserve selected-closure execution semantics and validate all included settings/helpers/bindings before source/model/host effects.
- Selection, disabled state, runtime feedback, model IDs, target/modifier badges, and authoring readiness remain distinguishable.
- Work only in the managed feature worktree. Final integration and pushing main are explicitly authorized.

## Review Focus

1. An incomplete unused local snapshot must not block a complete independent target; test in Task 1.
2. Partial edits must change semantic signatures and local definition hashes while remaining incomplete; test in Task 1.
3. A library's external input/model-role contract must not be mistaken for missing internal setup; test in Tasks 1 and 2.
4. Long model IDs, compact nodes, corner badges, and lower profile controls must fit measured bounds; test in Task 2.
5. Canceled/stale post-placement system assistance must retain the instance and commit no connection changes; test in Task 4.

## Ownership and Interfaces

- Task 1 owns `src/workflow/**` and domain tests. It exports `describeAuthoredOperation(graph,node)` from `catalog.js`: the normal Result envelope, with `data.descriptor`, `data.ports`, and `data.setupIssues`. Issues have `code`, `message`, and optional `field`/`portId`. Strict `describeOperation` remains the execution-settings validator. It also supplies an authoring inventory usable by UI/planners and strict selected-closure preflight. Public declarations must match.
- Task 2 owns `src/ui/workspace-preparation.js`, new readiness/decoration projection modules, `src/canvas.js`, Svelte NodeCard/profile/group/canvas components, related UI types/styles, and dedicated UI/browser tests. It consumes `describeAuthoredOperation`; it does not edit controller or graph admission files.
- Task 3/root owns `src/ui/controller.js`, `configured-node-creation.js`, `native-search-catalog.js`, node-control projection/Details integration where needed, and placement/integration tests.
- Task 4/root owns AddSystem/system-authoring UI/controllers and their tests. Changes in controller are sequential with Task 3.
- Root integrates shared interfaces, documentation, required check updates, review fixes, commits, and final main integration.
- Workers are not alone in the worktree; never revert others' edits or commit another owner's unfinished changes.

## Task 1: Incomplete authored documents and strict execution closures

**Files:** `src/workflow/catalog.js`, `graph-validation.js`, `graph-artifacts.js`, `contracts.js`, `resolve.js`, `connection-edits.js`, `ports.js`, definition/clipboard/package/document modules and declarations as required; `tests/workflow-authoring-readiness.test.mjs` and related domain regressions.

**Produces:** `describeAuthoredOperation(graph,node)` Result described above; incomplete-aware authoring snapshots and editable transaction baselines; strict execution preflight for selected dependencies.

- [x] Write one regression placing default Prompted Memory through `prepareNativeConnectionEdit`, asserting success, real empty actor setting, declared pins, and strict `describeOperation` rejection.
- [x] Run `node --test tests/workflow-authoring-readiness.test.mjs`; observe failure for incomplete settings admission.
- [x] Introduce the authoring description/admission contract. Validate safe shape, registered modes/control types/phase; record missing semantic settings without fabricated identities. Keep all structural protections.
- [x] Make creation, existing/candidate transaction checks, Details control changes, and semantic/control projections use authoring descriptions where appropriate. Preserve stale captures and explicit pin-change disconnection policy.
- [x] Incrementally add/run regressions for Recall actor-then-memory-set saves, unrelated edits beside incomplete nodes, semantic signatures, save/open/clipboard/package round trips, nested owned local definitions, hash/currentness integrity, and unselected For Each helpers.
- [x] Prepare authoring inventories for views/planners without pretending unresolved helper request bounds are executable. Resolve requested closures before strict settings checks. Validate included helper bodies before prepare/source/model hooks; reject missing included settings with full addresses.
- [x] Incrementally test complete independent targets beside incomplete nodes, unused snapshots/excluded instances, included invalid helpers, root runs, disabled dependencies, and zero preflight effects. Preserve publication/install validation for reusable definitions.
- [x] Run targeted domain suites followed by `npm test`; report changed old expectations only when the approved contract changed them.
- [x] Self-review and report owned files, interface choices, red/green evidence, and unresolved integration needs. Root performs a fresh task review before completion.

## Task 2: Prepared readiness and collision-free canvas decorations

**Files:** `src/ui/workspace-preparation.js`; new readiness/geometry modules with `.d.ts`; `src/canvas.js`; `ui/NodeCard.svelte`, `NodeProfilePicker.svelte`, `GroupCard.svelte`, `CanvasLayer.svelte`, UI types; `style.css`; dedicated projection/component/browser tests.

**Consumes:** Task 1 authoring description and inventory; existing binding metadata and full instance addresses.

- [x] Write/run a failing projection test for incomplete Prompted Memory: visible card/pins, field-addressed Setup Required, and normal valid-default operations without false setup flags.
- [x] Prepare readiness outside rendering: setup issues, missing required inputs, known resource/binding failures, and context-appropriate external library contracts. Setup takes primary priority. Aggregate by unique source node address for groups/instances.
- [x] Expose readiness to Node Details and a keyboard-accessible action selecting the node and relevant setting. Coordinate any required controller callback with root.
- [x] Write/run a failing component test for model + readiness stacking and distinct corner badges, then implement one normal-flow all-node decoration layout. Limit model labels to two lines; preserve full accessible text.
- [x] Implement red setup vs amber input treatment, independent selection/disabled/run paint, icon-only compact/overview behavior, and group/instance summaries.
- [x] Measure upper/lower decorations separately from unchanged card/pins. Share visual bounds with placement (root integration if needed), Fit, group frames/header clearance, and selection framing.
- [x] Incrementally test two differently overridden instances, standalone library/guide context, model+setup+target+modifier combinations, group aggregation, zoom 0.25/0.5/1, wire-anchor stability, and all lower profile/alias bounds.
- [x] Run targeted UI/component/browser suites and `npm run check:types`; report interface needs and evidence. Root performs a fresh task review.

## Task 3: Immediate creation and progressive Details integration

**Files:** `src/ui/controller.js`, `configured-node-creation.js`, `native-search-catalog.js`, `node-control-projection.js`; Details integration files only if required; placement/search/profile/schema integration tests.

- [x] Write/run a failing controller/integration test: choosing Prompted Memory calls direct preparation with no Configure Node publication and normal stage/position semantics.
- [x] Remove forced creation configuration metadata and the controller modal gate. Retain direct stage inference and exact selected compatible pin behavior. Existing real automatic targets remain defaults without acquiring authorization at placement.
- [x] Update configuration-specific creation tests to assert direct creation plus existing post-placement field editors. Do not weaken input parsing or runtime authorization tests.
- [x] Connect the readiness action to existing node selection/Details and the actionable control. Ensure incomplete controls use authoring descriptors and progressive canonical saves.
- [x] Test all 75 operation choices and preset packets, shelf/blank-space/wire search, one Undo insertion+connection, stage-restricted definitions, unavailable chat/profile, and stale capture rejection.
- [x] Run targeted creation/Details/search suites, types, and relevant browser tests. Commit/review the integrated deliverable when Task 1 interfaces are ready.

## Task 4: Place saved systems before configuring connections

**Files:** `ui/AddSystem.svelte`, `ui/system-authoring-types.ts`, controller system commands, system insertion helpers/tests.

- [x] Write/run a failing test inserting a chosen exact saved system without connection preview, retaining its local editable closure and exposed defaults.
- [x] Make Add system a chooser that inserts immediately after revision selection. Expose later configuration/connection assistance from the placed instance using existing explicit preview and stale-checked commit facilities.
- [x] Keep exact scoped refs/local ownership, occupied input protections, explicit guidance merging, and separate Undo for later assisted connections.
- [x] Incrementally test required-input/setup indications, parameter access, assistance cancellation, stale preview, successful separate Undo, and no implicit output effects.
- [x] Run targeted system authoring and browser suites; root reviews the complete flow.

## Task 5: Whole-change verification, review, documentation, and main integration

**Files:** user/operator docs, creation imagery/examples where applicable, approved brief and this plan, final review fixes.

- [x] Update user instructions and obsolete pre-placement configuration assertions to the current behavior; keep every meaningful structural/security regression.
- [x] Run `npm test`, `npm run check:types`, `npm run build`, `npm run check:assets`, and `npm run test:browser`. Fix substantive failures and rerun affected checks; record evidence.
- [x] Inspect browser screenshots for long metadata, statuses, compact/overview, groups, and post-placement system setup. Confirm no hidden nodes or shifting pin anchors.
- [x] Obtain fresh whole-branch review against the approved brief and regression matrix. Address substantive findings and run affected checks again.
- [x] Commit only completed owned changes using the repository's conventions; check diff whitespace, branch status, and main's latest remote state.
- [x] Merge into local main without discarding unrelated work, rerun integration checks required by any merge changes, and push main to origin. Use GitHub CLI only with network permission enabled; prompt reauthentication if its token expires.
- [x] Verify remote main equals the delivered commit. Mark the goal complete only when implementation, required verification/review, merge, and push are all complete.

## Progress

- Planning: complete; execution authorized by the user's goal/merge/push instruction. Subagent-driven execution selected using the active delegation preference.
- Baseline: unchanged main passed all 341 test files.
- Task 1: implemented and independently reviewed, including publication/package boundary fixes; 411 affected domain checks and type checks pass.
- Task 2: implemented; focused Node/browser checks, visual inspection, nine production readiness regressions and actual group-title dragging pass. The supported-stage projection correction is independently reviewed.
- Task 3: implemented with all 75 immediate operation choices and progressive Details. Navigation, focus, quarter-zoom placement and supported-stage review fixes pass focused checks and independent review.
- Task 4: implemented; 41 Node checks, two system browser checks and 44 entry/capability browser checks pass. Documentation and actual UI captures are updated.
- Task 5: all 347 Node test files and 483 browser tests pass. Independent domain/UI reviews are clear, including camera measurement and placement clearance fixes. Types (zero errors/warnings), build, assets, documentation and whitespace checks pass. Committed as `3c8c79d`, fast-forward merged into main, pushed to origin/main, and verified through the GitHub main reference.

## Verification evidence

- `npm test`: 347/347 test files passed, exit 0.
- `npm run test:browser`: 483 passed, exit 0, in 8.9 minutes.
- Camera follow-up: 36 affected Node tests passed after the final geometry correction; the unchanged browser assertion still requires zero intrinsic card/pin reads during camera work.
- `npm run check:types`: zero errors and warnings.
- `npm run build` and `npm run check:assets`: passed; 708 versioned local imports verified.
- `node tools/check-documentation.mjs`: 15 documents, 487 links, 75 operations, 54 screenshots and five animations verified.
- Independent domain and whole-change reviews: no remaining substantive findings after reproducing and correcting their findings.

## Delivery

Implementation commit: `3c8c79d0574e05797269adbe66096d5fe6058ee1`. Main was fast-forward merged and pushed; GitHub reported this exact commit. Pre-existing local shelf edits were preserved, hash-checked, and rebuilt successfully after integration.
