# Node Capability Improvements Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement the assigned tasks with focused review. Steps use checkbox syntax.

**Goal:** Deliver the approved audit improvements and existing corrections, preserve source/privacy/replay checks, verify the UI against the user's flat Gaea 2 references, and push the complete result to origin/main.

**Architecture:** Extend existing version-1 node contracts with additive controls/pins and unchanged compatibility defaults. Keep native history checkpointing in the existing authorized document lifecycle; it must preserve state values and reject retired replay rather than silently prune active histories.

**Tech Stack:** Existing JavaScript engines, TypeScript declarations, Svelte 5 control editors, Node test host, Playwright and Vite. No new dependency.

**Spec:** docs/research/2026-10-14-node-capability-audit.md (A1–A7, E1–E3 and N1); user approved addressing these on 2026-10-14. N1 gets a separate concrete design before implementation.

## Global Constraints

- No new node family, expression language, provider request, implicit retry, or automatic save/publication.
- Existing saved nodes retain current defaults: literal Extract remains case-sensitive substring matching.
- Preserve exact UTF-16 quotes/positions, actor-private visibility and source-bound write references.
- Use the existing flat Gaea 2 surfaces, control rows, typed-value editor and dialogs; avoid new styling systems.
- Test one behavior at a time through red/green; run the normal host import directly if the aggregate runner cannot spawn in the sandbox.
- Workers own their assigned files, coordinate shared files with the controller, and do not revert others' changes.
- No worker commits or pushes. Controller reviews/commits and pushes to the explicit origin repository MentallyQuill/Lattice; GitHub CLI calls use network permission.

## Review Focus

- No-match is a legitimate skipped optional result; permission/stale/model errors still hold.
- Wired recall queries validate as Text without treating them as record Data or granting actor access.
- Unicode matching preserves original quote/offsets, including case changes and adjacent Unicode letters.
- Existing string Collection values, Extract modes, Read File outputs and saved Repair modes remain compatible.
- Checkpointed old turns/events/intents cannot be replayed into duplicate progress, time, outcomes or writes.

## Task 1: Memory selection and query inputs

**Own:** src/workflow/operations/event-nodes.js; src/workflow/introspection/nodes.js and nodes.d.ts; relevant event/introspection/recall tests. Coordinate guide/reference docs with controller.

**Interfaces:** Prompted Memory accepts exactly a no-match result and returns skipped out with a bounded reason/report. Memory Recall has optional query Text; a wired query overrides the bounded existing control.

- [ ] Add one no-match test with authorized unrelated memories; establish failure, implement the strict result, then run event tests.
- [ ] Add one wired query test using actual recall service; establish failure, add optional Recall-only pin and Text validation/dispatch, then run introspection/native privacy tests.
- [ ] Add invalid/missing/empty/stale query and malformed no-match cases individually; preserve existing unresolved authorization and creation checks.
- [ ] Review full diff and report precise verification.

## Task 2: Literal extraction controls and typed Collection values

**Own:** src/workflow/operations/model-nodes.js (Extract only), model-nodes.d.ts; src/workflow/operations/collection-nodes.js and collection-nodes.d.ts; relevant tests. Controller owns shared UI projections/editors.

**Interfaces:** Extract uses caseSensitive=true and match=substring defaults, with optional word matching; returned records quote actual source substrings. Collection Value accepts bounded typed JSON, retaining wired Match precedence and existing comparisons.

- [ ] Add capitalization/boundary regression, establish failure, implement bounded literal matching with original offsets, and run model tests.
- [ ] Add Unicode edge cases individually and keep literal regex metacharacters literal.
- [ ] Add numeric Collection constant regression, establish failure, adopt bounded JSON value validation/descriptor, and run collection/control tests.
- [ ] Verify old string defaults, wired Match precedence and invalid own-data shapes; report diff and tests.

## Task 3: Parsed Read File output

**Own:** src/workflow/operations/file-nodes.js and file-nodes.d.ts; tests/workflow-file-nodes.test.mjs. Avoid persistence backend changes.

**Interfaces:** Add optional output value Data containing the already checked parsed value for structured formats. Existing text/document/reference pins remain unchanged; text/Markdown value output is explicitly skipped.

- [ ] Add direct structured value test, establish failure, implement descriptor/output/privacy preservation, and run file tests.
- [ ] Add textual-format skipped output and private material tests individually.
- [ ] Verify copied value cannot authorize writing; report diff/tests.

## Task 4: Budget and formatting contracts, existing corrections

**Own/controller:** src/workflow/compactor.js; operations/reference-transfer.js; catalog.js new-node defaults; tools/remastered example source; generated example packages; node-reference/docs and relevant tests.

- [ ] Add compression request remaining-budget regression, establish failure, communicate conservative measured allowance/report; retain one request, completion cap and final overflow check.
- [ ] Add Format Transfer dropped required literal regression, establish failure, validate aligned result before success.
- [ ] Add lesson 15 order regression, correct source builder and regenerate current authoritative examples.
- [ ] Set only newly created Repair nodes to Inspect using creation defaults; do not reinterpret existing saved Repair nodes.
- [ ] Correct Current Holder loss documentation and update related guidance.

## Task 5: Native history lifecycle

**Own:** Assigned after read-only design research; existing native state/file backend/progression history and Workflow Data action paths only.

- [ ] Write concrete design identifying replay fence, current values retained, archive/preview semantics and capacity diagnostics.
- [ ] Review design against real source identities and compare-and-swap behavior before edits.
- [ ] Add one capacity/checkpoint test at a time; implement smallest host-owned explicit lifecycle.
- [ ] Test retained current state and refusal of pre-checkpoint replay, stale review candidates, duplicate intents and private scope.
- [ ] Use the existing Workflow Data dialog for preview/action; browser-test cancel and successful checkpoint.

## Task 6: UI and curriculum integration

**Own/controller:** ui/DetailControlEditor.svelte and existing typed editor/projections as needed; node guide content/fixtures; docs/examples and bounded browser tests.

- [ ] Reuse descriptor-driven controls for matching options and the typed Value editor for Collection.
- [ ] Update guides and relevant lessons to show wired recall/direct file value without unnecessary model requests.
- [ ] Inspect desktop/narrow controls and checkpoint dialog against actual Gaea references; test keyboard/save/cancel and error feedback.

## Task 7: Final integration and publication

- [ ] Run all repository-required tests, type checking, build, assets and browser checks with fresh evidence.
- [ ] Independent review of the complete changes, with attention to privacy, replay and compatibility.
- [ ] Fix actionable findings and rerun affected checks.
- [ ] Verify origin/main freshness, integrate without overwriting unrelated work, commit and push to origin/main.
- [ ] Verify remote SHA and report delivered features and any material limitations.

