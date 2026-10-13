# Workflow loading performance implementation plan

Goal: implement the approved latency-audit improvements in this worktree, with LOD1-style examples previews and measured before/after results.
Spec: docs/benchmarks/examples-workflow-latency-audit.md plus user approval on 2026-10-13.

Constraints: preserve schema/runtime and public graph admission; independent example copies; malformed-entry diagnostics and repair; document replacement/save/cancel guards; theme roles, authored card/pin/wire geometry; accessible lesson buttons, filtering, details, scroll, focus. No new dependencies. Preserve main checkout.

Execution: independent ownership permits parallel implementation, followed by integration and independent review. Each worker uses one failing test at a time, verifies RED, implements, verifies GREEN, and records evidence. Root owns builds, complete checks and browser benchmarks. Workers do not commit shared files; root stages the final reviewed change.

## Task 1: activation
Files: index.js, src/ui/controller.js, tests/browser/open-workspace.spec.mjs and a dedicated activation regression test if useful.
Remove redundant index activation UI refresh; keep its snapshot/send-bar responsibilities. Publish one prepared scene per activation, using canvasReady after setCanvasGraph. Regression: real example/File Open activation prepares one workspace and publishes one scene; preserve document guards, new document activation, initial open, closed edits, selection/camera and status.

## Task 2: preparation
Files: src/ui/workspace-preparation.js, src/ui/configured-node-creation.js and its declaration, tests/ui-workspace-preparation.test.mjs and dedicated helper tests.
Hoist identical helper-choice computation outside view map with detached per-view DTOs; reuse owned prepared definition registry when feasible. Export prepareWorkflowThumbnail(root, options={}) -> Result<drawBase> for Task 3: root drawing only, same card/pin geometry, without full workspace/panel/helper/library/search preparation. Keep public malformed graph admission and existing full editor preparation behavior.

## Task 3: examples
Files: src/workflow/examples.js and .d.ts, src/ui/example-catalog.js and .d.ts, ui/ExamplesBrowser.svelte, ui/Workbench.svelte, ui/types.ts, examples unit/browser tests.
Cache catalog before repeated admission with a getter-free source fingerprint or explicit equivalent invalidation; retain raw-source mutation detection and Retry. Cache privately admitted templates with detached return values and fresh remapped IDs. Use prepareWorkflowThumbnail for light root geometry. Render LOD1 overview thumbnails: retain footprint/titles/typed pin cues/wires/groups/comments, omit tiny pin labels and ordinary large detail icons instead of only CSS-hiding them. Precompute search text. Publish Examples shell/loading state before slow cold work, guarding closure/cancellation and preserving immediate native file picker invocation. Avoid unbounded synchronous prewarming.

## Task 4: integration and verification (root)
Adapt benchmark to current production path, retain historical audit evidence. Run focused checks, complete npm test/type/build/assets/browser gates, independent review, and corrected before/after benchmark on normal CPU. Update report with actual improvement and remaining limits. Keep the completed worktree for review.

Review focus: catalog corruption/repair and failed reload; newly copied and nested definitions; closed/replaced editor stale authority; picker focus/scroll/filter/retry; asynchronous opening cancelled or interrupted by document prompts.
