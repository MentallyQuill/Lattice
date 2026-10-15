# Quiet run diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Execute tasks with focused red/green verification.

**Goal:** Quiet draft nodes, isolate root execution, show exact attempted failures while preserving interactive rendering latency.
**Architecture:** Explicit persisted root endpoints and a prepared selection/preflight split; structured causal errors; separate cached runtime paint; controller enrollment and ownership integration.
**Tech Stack:** Existing JavaScript/.d.ts, Svelte 5, Node tests, Playwright/Vite; no new dependencies.
**Spec:** docs/superpowers/specs/2026-10-15-quiet-run-diagnostics-design.md

## Global Constraints
- Implement the approved spec, preserving immediate placement, genuine Setup Required and model/profile UI.
- Full addresses include workflowId, instancePath and nodeId. Never infer failed pins from text.
- Root execution follows explicit targets; unselected draft islands have zero effects.
- Strict preflight precedes source/binding/provider/file/state effects; native manual execution restrictions remain.
- Diagnostic paint must not enter authored ports/layout keys or add geometry work on camera/drag/hover.
- Use existing safe boundaries, privacy budgets and dependency versions.
- Work only in the isolated codex/quiet-run-diagnostics worktree. Shared ownership is disjoint; never revert colleagues' edits.
- User authorized implementation, merge main and push origin main. GitHub CLI uses elevated network permission.

## Review Focus
- Legacy workflow with a legitimate primary and independent wired side-effect island.
- Two nested instances with the same child id and wrapper-input failures.
- Incomplete native target bypassing manual-preview restrictions.
- Cancellation/edit/view switch racing late settlement while historical Details remain useful.
- Full recording budgets dropping text while compact causal identity survives.

### Task 1: Explicit workflow outputs and attempt planning
Ownership: src/workflow/resolve.js/.d.ts, graph-validation.js, new run-targets.js/.d.ts, types.d.ts RootWorkflow/run-target declarations ONLY, document-file.js, graph identity/serialization/composition/state/starter modules, built-in example JSONs and their related tests. Do not edit runtime.js, host.js, record-data.js, recording.js, run-state.js, operation executors, UI, or WorkflowError declaration (Task 2 owns these).
Read the spec first. Audit actual serialization and composition pathways; preserve existing helpers and safe boundary patterns.
Produce prepareWorkflowAttempt(root,options={}) -> Result<{selection:ResolvedPlan;preflight:Result<ResolvedPlan>}> and planner.policy(target?). resolveWorkflow remains strict and summarize remains strict. Export enrollment helpers from run-targets.js: workflowRunTargets(root) -> Result<WorkflowRunTarget[]> (safe legacy inference); setWorkflowRunTargets(root,targets) -> Result<RootWorkflow> (owned immutable updated document). Entries are {instancePath:string[],nodeId:string}, existing terminal primitives only, deduplicated, exact path.
Selection is enrolled targets plus upstream closure. New empty docs explicit []; built-in intended endpoints explicit; legacy ONLY unique valid native ReviewPublish chain, never side effects. Materialize legacy before authoring mutation so adding a draft cannot change inferred enrollment. Document-file must export materialized metadata. Targeted runs ignore enrollment. Stage ordering cannot include other branches. Move execution-only multiplicity checks (Memory Commit etc.) into closure. Hard structural checks remain.
Coordinate Task 2 about preflight cause and exact selection DTO; missing input errors include explicit inputPortId and correct consumer address, wrapper required inputs use wrapper address/port. Include all required inventory for validating causes without misclassifying wrappers as executed units.
- [x] Add regression tests for explicit roots, no-target zero effects, legacy primary with wired draft terminal island, imported ambiguous legacy, nested addresses, semantic identity, extract/inline/delete/paste.
- [x] Run new tests RED before implementation.
- [x] Implement small coherent domain changes and migrate intentional terminal test fixtures explicitly (preserve expectations).
- [x] Run focused domain/doc/composition/native-stage checks GREEN, inspect own diff. Do not weaken existing tests/security.
Report requirements: exact changes/files/interfaces, red+green commands/results, remaining integrations, concerns. Write .superpowers/sdd/quiet-run-diagnostics/task-1-report.md. Do not commit while parallel edits are in progress; root will make reviewed commits.

### Task 2: Structured causal failures and current attempt ownership
Ownership: src/workflow/runtime.js, host.js if necessary, plan.js if needed (coordinate Task 1), record-data.js/.d.ts, recording.js/.d.ts, run-state.js/.d.ts, WorkflowError declaration ONLY in types.d.ts, operation input-validation adapters, src/ui/workflow-surface.js/.d.ts plus new current-diagnostic bridge module, and focused tests. No resolve/graph-validation/enrollment, controller, canvas, or Svelte edits.
Read spec. Consume Task 1 prepareWorkflowAttempt(root, options={}) -> Result<{selection:ResolvedPlan;preflight:Result<ResolvedPlan>}> and planner.policy(target?). This API is being implemented concurrently; coordinate direct messages and avoid inventing alternate contracts.
Preserve existing WorkflowError.address plus optional inputPortId through safe parsing/runtime/preflight/run settlement/result/reducer/recordings/UI. Accept only actual included node or selected wrapper input in admitted inventory, exact full addresses; node-only on ambiguity. No message parsing. Known operation single-input errors can tag inputPortId; do not tag provider/config/tokenizer/unknown errors falsely. Handle context-join portId explicitly at adapter.
Allow selection inventory/policy to exist before strict completeness fails, while guaranteeing zero source/binding/provider/effect work until preflight passes. Host prepare failures need a current-attempt envelope even if runtime did not start; historical run storage remains accurate. Never fabricate successful/executed child state.
Surface summary must separate attemptability/native policy from completeness so Run to Here can surface actionable missing input while respecting native restrictions. Add a documented method/projection for controller current diagnostics based on exact document/revision/run ownership; semantic invalidation clears preparationError and paint, cancellation clears, layout-only changes retain. Give Task 3 canonical DTO contract before implementation: {attemptId,documentKey,nodes:[{key,address,error,inputPortId?}]} or equivalent small documented shape. Errors carry code/message plus address/inputPortId; no artifact payload in canvas.
- [x] New red tests: exact preflight pin and zero effects, runtime invalid input pin vs ambiguous provider node-only, nested same-id isolation/wrapper inputs, safe getter/foreign pin rejection, recording budget causal preservation, semantic edit/cancel/document ownership.
- [x] Implement, run focused runtime/reducer/recording/surface/privacy tests green, self-review.
Write .superpowers/sdd/quiet-run-diagnostics/task-2-report.md with exact evidence/API/concerns. No commits during parallel edits.

### Task 3: Quiet authoring and geometry-neutral diagnostic paint
Ownership: src/ui/canvas.js/.d.ts, src/ui/canvas/*, canvas-run-diagnostics.js/.d.ts new, workspace-preparation.js/.d.ts, ui/NodeCard.svelte, NodeProfilePicker.svelte, GroupCard.svelte, CanvasLayer.svelte, NodeDetails.svelte, ui/entry.ts, ui types/detail-types as required, style.css, focused UI/canvas tests and browser tests. No controller.js or workflow domain edits.
Read spec. Remove idle Input Required badge/card/pin amber styling/input group counts; preserve genuine Setup Required (including setup group summary), model labels/profile controls. Required pin metadata in Details ordinary, no ambient warnings.
Coordinate Task 2 DTO immediately: prefer {attemptId,documentKey,nodes:[{key,address,error,inputPortId?}]}; full key JSON.stringify([workflowId,instancePath,nodeId]). Build separate safe projection/setRunDiagnostics or equivalent dedicated update path. Do not put runtime classes in card.ports or retained geometry key. Controller (later task) filters workflow/instance path before publishing paint.
Red causal outline + ring on known input only, preserve artifact colors; node-only diagnostic accessible tooltip/Details. No new status/model rows above cards, no layout change. Blocked/downstream/skipped distinct. Scope/cancellation/semantic ownership clearing is supplied by surface/controller; canvas must reliably clear stale classes when DTO changes/remounts.
- [x] New RED quiet-idle tests and paint test proving no retained node replacement/card/pin geometry work on updates; same-id scope isolation tests at projection.
- [x] Implement concise cached projection, minimal changed mounted slot update. Hot camera/hover/drag paths cannot add expansion/measurements/graph scans for diagnostics. Existing host geometry reads allowed; avoid unrelated perf rewrites.
- [x] Update affected UI/browser expectations for absent input badges; add runtime paint/browser screenshot coverage. Run focused UI/canvas/browser checks green.
Write .superpowers/sdd/quiet-run-diagnostics/task-3-report.md with API for controller, evidence and concerns. No commits during parallel edits.

### Task 4: Controller integration and workflow-output controls
Ownership: src/ui/controller.js, command/menu integration (workspace-menu-model.ts, UI action types only after Task 3 finishes), relevant integration/browser tests.
Consume Task 1 workflowRunTargets/setWorkflowRunTargets, planner.policy, prepareWorkflowAttempt; Task 2 surface current diagnostics; Task 3 separate canvas diagnostic paint API.
Expose discoverable Workflow outputs menu listing addressed terminal endpoints and positive Run with workflow / Remove from workflow run context action. No permanent card badge needed. Explicit output management must be usable for graphs with no selected outputs/legacy ambiguous graphs. Disabled/missing/unselected drafts must not execute. Changes are semantic, undoable and persisted. Nested targets use full paths; library view cannot mutate running document accidentally.
Remove completeness guard that blocks an attempted Run to Here before diagnostic creation; preserve busy/native/policy/ownership guards independently of completeness. Filter current paint and trace by workflowId+instancePath rather than bare nodeId, clear on view ownership change. Details receive current diagnostic without invalidating authored-control cache; accessible cause text. No per-camera/hover replan.
- [x] RED tests for Run to Here missing input, native restriction even with missing input, root draft-island isolation, enrollment controls/persistence/undo, nested same-id paint, semantic clearing versus layout retention.
- [x] Implement, run focused integration/browser tests green and self-review.
Write .superpowers/sdd/quiet-run-diagnostics/task-4-report.md. Root schedules after producer interfaces settle; no broad full suite here.

### Task 5: Verification, independent review and authorized integration
- [x] Review task diffs for spec compliance and quality using fresh reviewers; resolve material findings.
- [x] Run complete Node suite, type checks, production build/assets and complete browser suite once stable.
- [x] Run serial matched viewport benchmark and focused diagnostic geometry benchmark; inspect UI captures.
- [x] Broad independent review of branch; address findings with focused tests and scoped re-review.
- [ ] Post-commit release gate: recheck main cleanliness/remote, fast-forward the tested change into main, push origin main and verify exact remote SHA via explicit origin repo GitHub CLI. The session goal records completion after this committed plan snapshot; do not pre-claim the push.

### Task 6: Supporting intentional fixture migration (before Task 5)
- [x] Reproduce old root-terminal assumptions without changing production policy.
- [x] Explicitly enroll intended secondary fixture endpoints, preserve two-handle/privacy/Apply assertions, and select a manual output for composition-only helper inspections.
- [x] Preserve multi-Memory-Commit safety as selected execution validation while allowing unselected drafts during structural authoring.
- [x] Run affected fixtures: 68/68 pass. Review together with the Task 1 domain gate.
- [x] Verify all remaining fixtures in the final stable complete suite.

Verification and performance results: [2026-10-15 report](../../performance/2026-10-15-quiet-run-diagnostics.md). All implementation and verification steps are complete; the authorized post-commit integration gate follows.
