# Workflow loading performance results

Date: 2026-10-13. Branch: `codex/workflow-loading-performance`.
Baseline: pristine commit `69c07fecd8b2b79ae086b79507f537df9a3bbdc5` (Lattice 0.27.2).
Environment: Windows, Ryzen 7 5800X, Chromium 151.0.7922.34, 1440 × 1000, device scale 1.

The approved changes substantially reduce repeated Examples work and nested workflow loading. Warm picker opens are about 80% faster in this harness; combined-systems File/Open is about 75% faster. The Examples dialog shell now reaches its first animation-frame callback in about 15 ms while its cold preparation continues.

## Matched before/after measurements

Both revisions were measured sequentially after the correctness suites finished. The baseline was exported with `git archive` into an isolated local fixture, because unrelated work in the main checkout changed during this task. The same benchmark implementation, viewport, readiness checks and mock host served both revisions; only its server root, output directory and baseline revision metadata differed. No production source substitutions were used.

Each revision produced 106 unprofiled example/picker/reopen samples and 25 unprofiled File/Open/reopen samples. Every lesson was opened; repeated lessons include the small first lesson and advanced/capstone examples. Function profiling ran separately from the latency samples. These measurements supersede the historical audit timings for this implementation comparison: machine/JIT conditions differ from that earlier pass.

The table uses median **settled interaction time**: verified readiness followed by two more animation-frame callbacks to cover deferred fitting. Picker readiness requires all 30 lesson buttons, no loading state, and card content in every thumbnail intersecting the grid viewport. Document readiness requires a fresh document activation and the expected rendered node-card count.

| Interaction | Before | After | Reduction | Samples per revision | Observed before → after range |
|---|---:|---:|---:|---:|---|
| Cold Examples | 793 ms | 499 ms | 37% | 3 | 782–798 → 495–515 ms |
| Warm Examples | 333 ms | 65 ms | 80% | 52 | 315–365 → 62–66 ms |
| Lesson 1 | 105 ms | 73 ms | 30% | 3 | 105–106 → 50–78 ms |
| Lesson 25 | 265 ms | 156 ms | 41% | 3 | 262–271 → 151–161 ms |
| Lesson 27: The broken wand | 401 ms | 233 ms | 42% | 3 | 396–414 → 225–245 ms |
| Lesson 28: The soul-stealing sword | 290 ms | 182 ms | 37% | 3 | 274–291 → 176–184 ms |
| Lesson 29: One kiss, two private perspectives | 331 ms | 218 ms | 34% | 3 | 322–336 → 212–227 ms |
| Lesson 30: A relationship that changes slowly over weeks | 291 ms | 185 ms | 36% | 3 | 290–305 → 179–192 ms |
| File/Open, 100-node fixture | 260 ms | 178 ms | 31% | 3 | 254–280 → 170–205 ms |
| File/Open, 250-node fixture | 527 ms | 367 ms | 30% | 3 | 504–563 → 347–409 ms |
| File/Open, combined-systems document | 2,927 ms | 736 ms | 75% | 3 | 2,900–2,966 → 731–757 ms |
| Combined workspace close/reopen | 1,268 ms | 389 ms | 69% | 2 | 1,251–1,284 → 382–396 ms |

The first rendering opportunity for the picker changed from 771 to 15 ms cold, and 302 to 15 ms warm. Cold catalog readiness is still 457 ms; visible-thumbnail readiness is 491 ms. Warm catalog readiness is 32 ms and visible-thumbnail readiness is 35 ms. All 55 updated picker samples had their dialog shell at the first callback and verified visible thumbnail content at readiness.

Cold preparation still produced a long main-thread task in all three samples, with a maximum of 444 ms. None of the 52 warm samples recorded an overlapping long task. This does not imply all workflow loading tasks are short.

## Implemented changes

- One activation refresh owner and one canvas scene publication. The launcher retains snapshot and send-bar updates; the controller prepares the workspace once and reuses the already published canvas scene for the rest of its UI refresh.
- Iteration helper choices are computed once per workspace preparation, using one owned definition registry for their inspections. Each composition view retains its own detached, frozen helper DTOs.
- A root-only thumbnail preparation path shares authored editor card/pin geometry without preparing helper choices, subgraph workspace views, library panels, bindings, search or run state.
- The catalog cache is checked before unchanged packages are reparsed. Its exact, bounded source revision accepts only plain value-only JSON trees; dynamic accessors, unusual prototypes and unsupported shapes bypass the cache. Mutable source corruption, repair and Retry remain observable.
- Privately cached admitted templates are frozen. Public catalog graphs and installations remain independent copies with fresh IDs, and transformed installations still pass validation.
- LOD1 previews omit tiny pin-label elements and ordinary detail icons. They retain card footprints, titles, compact identity icons, typed pin cues, wires, groups, comments and theme roles. `IntersectionObserver` mounts detailed SVG contents near the scroll viewport and removes them when they leave it.
- Examples opens and retries through a painted loading shell. Lesson selection yields before expensive replacement work. Opaque controller authority binds deferred work to its original workspace/editor/document; close, reopen, overlay supersession or external document replacement cancels it. Native File/Open still invokes the OS picker from the initiating event.

Picker descendant counts fell from 7,222 to 1,185 on cold opens and a median 797 on warm opens, about 84% and 89% fewer respectively. SVG descendants fell from 7,012 to 975 cold and 587 warm. Counts include observer prefetch content and can vary with scroll position and callback timing; all 30 accessible lesson buttons and preview shells remain present.

Separate profiling confirmed a warm catalog open calls `projectWorkflowExamples` once (about 8 ms in the profiled sample), with zero package admission, parsing or thumbnail-preparation calls. A cold open still admits 30 packages and prepares 30 lightweight thumbnails. Its profiled catalog admission was about 295 ms and thumbnail preparation about 108 ms; inclusive function durations overlap and must not be summed indiscriminately.


Matched instrumented combined File/Open samples also confirmed the mechanism:

| Count per activation | Before | After |
|---|---:|---:|
| Workspace preparation | 2 | 1 |
| Canvas scene publication | 4 | 1 |
| Iteration helper generation | 8 | 1 |
| Definition registry preparation across all boundaries | 83 | 21 |

The baseline and updated helper-generation inclusive times were about 1,941 ms and 93 ms in the representative profiled samples. The whole-workspace inclusive times were about 2,354 ms and 322 ms. These profiled timings explain the improvement; the unprofiled table above remains the user-latency comparison.
## Remaining opportunities

1. Cold catalog admission is now the dominant picker CPU cost. The dialog responds promptly, but the catalog is still built synchronously after that paint boundary. Bounded idle preparation, staged catalog/thumbnail batches, or build-generated preview data can reduce that pause further. A worker can move pure admission/projection work off the main thread, provided its results are re-admitted and stale document authority is checked on the main thread.
2. Nested workflow loads still repeat definition validation across independent admission, editor/status, recovery and file boundaries. Transaction-owned reuse of exact checked artifacts/registries is the next substantial target. A measured combined File/Open still performs 21 registry preparations, while reopen performs 11; preserve exact-content and ownership checks when eliminating those passes.
3. Large flat workflows still incur card construction/layout and a deferred fit. Reusing prepared bounds for the initial camera, reducing offscreen card materialization and measuring layout separately are the next rendering targets after validation reuse.

These are follow-up opportunities, not additional changes included in this branch.

## Verification and reproduction

- Full unit suite: **336/336 test files passed**. After the final lifecycle review fix, an integrated focused run of every changed source path passed **53/53 tests**.
- Final clean browser suite: **466/466 passed**, including all examples, capstone layouts, themes, focus/scroll/filtering, file save/replacement guards, subgraph editing, scene-count assertions and the new editor-close/external-replacement regressions.
- `npm run check:types`: 0 errors and 0 warnings. Production build succeeded. `npm run check:assets`: 695 versioned imports verified. `git diff --check`: clean.
- Independent task and whole-branch reviews completed. The helper JSON compatibility issue, cache source-freshness issue, deferred selection lifecycle race and benchmark visible-content readiness issue found during implementation/review were fixed and rechecked.
- Desktop and narrow picker screenshots inspected. Benchmark runs completed without page errors or provider calls.

The first broad browser run encountered two empty-picker timeouts while the source controller was being updated but the UI bundle was still the previous version. The synchronized rebuild and clean full rerun passed; no timeout was dismissed as a flaky product failure.

Current production-path benchmark commands:

```powershell
npm run build
node tools/benchmark-workflow-loading.mjs
node tools/benchmark-workflow-loading.mjs --general
node tools/benchmark-workflow-loading.mjs --quick --profile
node tools/benchmark-workflow-loading.mjs --general --quick --profile
```

Add `--throttled` for an artificial 4× CPU sensitivity pass; it was not used for the implementation numbers above. The exact historical base can be reconstructed with `git archive 69c07fecd8b2b79ae086b79507f537df9a3bbdc5`, then served by the same benchmark with its root/output/revision metadata pointed to that pristine fixture.

Local ignored artifacts are in `benchmark-results/workflow-loading-baseline/` and `benchmark-results/workflow-loading-benchmark/`. They include matched `examples.json` / `general.json`, separate profiled results, `comparison.json`, and picker screenshots. The committed tool records browser/CPU/revision/worktree metadata, explicit cold/warm labels, expected/mounted visible-preview counts and corrected long-task overlap matching.

Limits: this mock SillyTavern harness excludes OS picker and disk/network delays, user decisions in dirty-document prompts, model calls and real host-extension contention. DOM clicks invoke the real handlers but exclude physical input-queue delay. Animation-frame callbacks indicate rendering opportunities, not guaranteed pixel presentation. Small repeated subsets establish direction and call-count reductions rather than a production latency SLA; sample ordering and JIT still affect results. A real-host trace on slower hardware remains useful final validation.
