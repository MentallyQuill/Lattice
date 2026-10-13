# Examples and workflow loading latency audit

Date: 2026-10-13  
Audited release: Lattice 0.27.2, Git HEAD 69c07fecd8b2b79ae086b79507f537df9a3bbdc5  
Environment: Windows, Ryzen 7 5800X, headless Chromium 151.0.7922.34, 1440 × 1000, device scale 1.

## Findings and recommended order

The reported delay is reproducible. The largest opportunities are:

1. **Give document activation one UI refresh owner.** Two production listeners currently prepare the same workspace twice. Each refresh also renders the canvas twice.
2. **Compute iteration helper choices once per workspace preparation.** The same choices are rebuilt for every composition view, repeatedly admitting and hashing the complete definition table. This is especially expensive for nested systems.
3. **Put the examples cache before catalog admission, under an explicit immutability/revision contract.** Warm opens currently reparse and validate all 30 lessons before the thumbnail cache can be used.
4. **Generate lightweight thumbnail data ahead of the click and mount fewer thumbnail elements.** Cold opens use full editor preparation for every thumbnail; all 30 detailed SVGs are remounted on every reopen.
5. **Reuse privately owned checked artifacts and definition registries through the loading transaction.** There are more repeated validation, cloning, status and recovery passes to remove after the first changes.

These are measured CPU/preparation costs. Network caching and canvas layout optimization are lower priorities for the paths exercised here.

No production runtime code was changed. Experiments substituted source responses only inside disposable browser contexts.

## Measured baseline

Durations below run from the actual UI handler's synthetic DOM click to three animation-frame callbacks, including the example's deferred fit. They are an approximation of a settled interaction, not a pixel presentation timestamp. “Cold” means the first catalog access in a fresh page after application startup; it does not mean a cold browser, filesystem or network cache.

| Interaction | Median | Observed range | Samples |
|---|---:|---:|---:|
| First Examples open, fresh catalog | 1,184 ms | 1,083–1,217 ms | 3 |
| Warm Examples reopen | 484 ms | 402–669 ms | 52 |
| Lesson 1: Follow a reply from Send to Review | 167 ms | 150–180 ms | 3 |
| Lesson 25: Award experience from confirmed progress | 396 ms | 367–501 ms | 3 |
| Lesson 27: The broken wand | 724 ms | 584–735 ms | 3 |
| Lesson 28: The soul-stealing sword | 418 ms | 399–483 ms | 3 |
| Lesson 29: One kiss, two private perspectives | 507 ms | 430–546 ms | 3 |
| Lesson 30: A relationship that changes slowly over weeks | 468 ms | 417–486 ms | 3 |
| File/Open, synthetic 100-node workflow | 301 ms | 300–333 ms | 3 |
| File/Open, synthetic 250-node workflow | 601 ms | 599–667 ms | 3 |
| File/Open, combined systems document | 3,416 ms | 3,316–3,671 ms | 3 |
| Close/reopen workspace, combined systems document | 1,412 ms | 1,403–1,421 ms | 2 |

Every lesson was opened at least once. The repeated lesson subset covers a small lesson, advanced lessons and all four capstones. Lesson 29 has the largest root at 67 nodes/93 wires; lesson 27 has 29 root nodes/30 wires and two definitions, and was slower. Definition structure matters in addition to root size.

The combined systems document is only 79,790 bytes, with 9 root nodes/9 wires and 5 definitions containing 66 direct nodes/70 wires. It has three root subgraph instances and four composition views; no nested subgraphs are needed to trigger the multiplier. Its measured load is much slower than the 250-node flat fixture. This points to repeated definition processing, not simply file size or root DOM size.

A 4× CPU-throttling sensitivity run amplified the same problems: first catalog opening was 5.45–6.71 s, lesson 27 loading 3.11–3.34 s, and combined document loading about 19.1–19.4 s. These are artificial throttled results, not predictions for a particular device.

## Examples picker

### The popup waits for catalog work before it can appear

The path is File menu → Workbench local command → refreshExamples → projectWorkflowExamples → popup mount. In ui/Workbench.svelte:96, refreshExamples runs before the overlay is assigned and before tick. The user receives no visible popup during the expensive synchronous part.

Source boundaries:

- ui/workspace-menu-model.ts:24 defines the command.
- ui/Workbench.svelte:88–106 handles popup opening and example choice.
- src/ui/controller.js:708 calls projectWorkflowExamples.
- src/ui/example-catalog.js:19–31 admits the catalog, computes its key, then checks the cache.

### Warm caching skips the thumbnails, but not admission

projectWorkflowExamples always calls listWorkflowExampleResults first. The latter admits all 30 packages. Each package is serialized, parsed and structurally checked, then validated/resolved again. Only after this does the projection serialize its full admitted catalog to compare the thumbnail cache key.

The catalog contains 446 authored root nodes, 462 wires, about 444,530 package JSON characters, and a 536,825-character projected cache key including lesson metadata.

One separately profiled warm opening spent approximately:

| Synchronous stage | Time |
|---|---:|
| listWorkflowExampleResults, all 30 admissions | 286 ms |
| projectWorkflowExamples, including admission and key | 288 ms |
| refreshExampleCatalog | 289 ms |

The key serialization itself was only a few milliseconds in this profile. Optimizing the stringify alone would leave almost all of the delay. The important change is avoiding unchanged catalog admission.

**Safe recommendation:** make the shipped catalog privately immutable and versioned, or place every catalog mutation behind an API that increments an explicit generation. Cache frozen admitted templates and frozen tile projections by that generation. Retry should invalidate/rebuild the affected catalog generation.

An unconditional early return based on object identity is unsafe today. The generated arrays and graphs are mutable, and tests intentionally mutate an operation and require refresh to detect the malformed entry and then repair it. Preserve that behavior with an explicit injected/mutable catalog seam or revision API. Relevant coverage: tests/ui-example-catalog.test.mjs:68–86 and tests/browser/examples.spec.mjs:193–245. A raw public graph must not gain authority from an object-identity cache.

### Cold thumbnails do much more than thumbnail geometry

src/ui/example-catalog.js:34 calls prepareWorkspaceViews for each lesson. That prepares planners, composition views, workflow projections, editor cards, bindings, idle run rows and preview choices, although the picker only needs root miniature geometry.

One cold profiled opening measured:

| Sibling stage | Inclusive time |
|---|---:|
| Catalog admission | 311 ms |
| All 30 thumbnail projections | 412 ms |
| Entire catalog projection | 725 ms |

Full workspace preparation was 375 ms **inside** the thumbnail stage; these nested values must not be added.

**Recommendation:** generate validated thumbnail geometry and compact lesson/search metadata during example authoring/build. Retain theme roles in the SVG data so live themes still work. Keep package admission for the selected workflow and explicit diagnostics/retry. An alternative is a dedicated root-only thumbnail projector using one checked catalog template rather than full editor preparation.

Prewarming can move the cost earlier, but it should happen at idle time or on user intent and should yield between bounded batches. Doing the same long synchronous preparation immediately after app startup just relocates the freeze.

### The complete SVG grid is recreated on every reopen

The overlay is conditionally mounted in ui/Workbench.svelte:170–175. Closing destroys ExamplesBrowser; keyed loops cannot retain nodes across that destruction.

The picker creates 7,222 DOM descendants, including 7,012 SVG descendants. It renders all 30 previews with 416 cards, 462 wires and 1,071 pins, even though many tiles are outside the scroll viewport. The Advanced filter happens after that initial mount.

A separate matched experiment pass measured warm opens:

| Measurement-only variant | Median, 4 samples |
|---|---:|
| Current code | 384 ms |
| Return cached tiles before admission | 117 ms |
| Empty thumbnail internals, admission retained | 275 ms |
| Early cache plus empty thumbnail internals | 50 ms |

The early-cache variant bypasses the present invalidation contract. Empty thumbnails are a diagnostic savings bound, not a proposed product design. These numbers show the separate admission and DOM-creation costs; they do not promise a 50 ms complete picker.

**Recommendation:** retain the mounted picker between opens if its memory cost is acceptable, or retain all accessible tile shells and lazily mount detailed thumbnail internals near the scroll viewport. Preserve tab order, focus trapping, restored scroll, filtering and lesson details. The previews are already aria-hidden, so deferring preview internals can preserve the accessible lesson buttons.

content-visibility:auto may reduce offscreen layout/painting, but it does not remove Svelte's element-creation work. It is a supplementary experiment, not a replacement for reducing mount work. See [MDN content-visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility).

Precomputing searchText would avoid rebuilding/lowercasing lesson JSON on each filter update (ui/ExamplesBrowser.svelte:15–20). This is useful cleanup after the larger costs.

## Workflow activation

### Two listeners rebuild the same workspace

index.js:105–107 registers onWorkflowActivated and calls UI.refreshIfOpen. The UI also registers its own onWorkflowActivated callback at src/ui/controller.js:609–612. Both call the expensive workspace refresh path.

refreshIfOpen (controller.js:1443) sees the incoming graph and invokes setCanvasGraph. The UI activation listener invokes it again. In real menu-driven loads the instrumentation recorded:

- prepareWorkspaceDocument: 2 calls
- prepareWorkspaceViews: 2 calls
- createGraphViewSession: 2 calls
- Canvas.setGraph: 2 calls
- renderAll: 2 calls
- Canvas renderScene: 4 calls

This happens for both examples and File/Open. The DOM custom event pc-document-activated is not the cause.

**First implementation:** keep the activation snapshot/send-bar responsibilities in index.js, and let the controller own document UI activation. Remove the redundant UI.refreshIfOpen from the index activation listener. Keep unrelated host/chat refresh behavior.

### Every refresh also renders an already rendered graph

Canvas.setGraph renders the scene immediately (src/canvas.js:169–205). renderAll then calls canvas.render again unless canvasReady is true (controller.js:898–905). Initial workspace opening already uses that flag; the activation listener does not.

After setCanvasGraph, call renderAll({canvasReady:true}) when the normal or fallback scene has been published. This reduces one activation from two scene renders to one.

A separately profiled experiment pass, with the same lesson sequence in each variant:

| Load | Current median | Single refresh and render | Observed reduction |
|---|---:|---:|---:|
| Lesson 1 | 124 ms | 94 ms | 24% |
| Lesson 27 | 445 ms | 318 ms | 29% |
| Lesson 29 | 364 ms | 269 ms | 26% |
| Lesson 30 | 311 ms | 248 ms | 20% |
| Combined systems, 2 samples/variant | 3,005 ms | 1,690 ms | 44% |

The counts changed from two preparations/four scenes to one preparation/one scene. The redundant render alone had little measurable effect on the combined document; preparation is its dominant cost. Passes were ordered and small, so percentages are directional estimates, not statistical guarantees. Compare within a table, not across different measurement passes.

### Identical iteration helper choices are rebuilt for every view

In src/ui/workspace-preparation.js:47–60, iterationHelperChoices(root, helperProfiles) is called inside composition.data.views.map, with identical arguments for every view.

iterationHelperChoices (src/ui/configured-node-creation.js:48) inspects the root's definitions. inspectDefinitionGraph routes through inspectDefinition, which creates a fresh snapshot table and prepares a new registry (src/workflow/graph-validation.js:278–296). That repeats admission, canonical identity/hash work and closure inspection.

The combined document profile showed:

- 83 prepareDefinitionRegistry calls
- 2,169 ms inclusive in inspectSnapshots
- 2,638 ms in the two prepareWorkspaceViews calls
- Only about 18 ms across the four canvas scenes

“Self time” here is exclusive only of the selected instrumented descendants; uninstrumented calls are included.

**Second implementation:** compute iterationHelperChoices once before the view map and clone its small DTO for each view. This preserves per-view detachment without repeated definition inspection. Then change helper preparation to consume the already owned registry/planner and use inspectPreparedDefinition.

A separate helper-hoisting experiment measured:

| Combined document variant | Median, 3 samples | Registry calls in first sample |
|---|---:|---:|
| Current code | 2,969 ms | 83 |
| Helper choices computed once per preparation | 1,607 ms | 41 |
| Hoisting plus one activation refresh/render | 960 ms | 25 |

The combined reduction was approximately 68% in this pass. The remaining 25 registry preparations show additional reuse is possible.

### Further transaction-level work

The selected example is admitted, validated, cloned, ID-remapped, cloned/validated again, serialized/admitted by the document controller, and admitted again by state activation. In one lesson 27 sample there were 6 cloneWorkflowDocument calls, 18 validateGraphStructure calls, 24 inspectExpandedGraph calls and 5 document serializations. These counts include supporting activation/persistence work within the measured window.

Key boundaries: src/workflow/examples.js:11–56,83–96; src/ui/document-controller.js:47–64; src/workflow/document-file.js:126–150; src/state.js:362–390.

Caching an admitted immutable template saves unchanged-source admission, but the independent-copy ID transformation changes the graph. Keep validation of the final transformed candidate. Carry privately owned checked artifacts through call-local boundaries rather than globally trusting mutable graph identity.

Other opportunities, after the small changes:

- **Registry/planner reuse:** prepareWorkflowPlanner creates a fresh planner despite reusable graph artifacts. Composition views are cached by planner identity, so repeated preparation misses. Cache by owned artifact plus host/profile/configuration inputs, with exact invalidation.
- **Status work:** paintSendbar calls sendWorkflowState, which validates/resolves the active workflow (index.js:59–66; src/run.js:29–37). pc-state snapshots also fingerprint the workflow. Reuse an owned current-content result for repeated status paints.
- **Inactive view preparation:** all composition and library views are materialized eagerly, and all non-library views receive a new search catalog (controller.js:242–267). Prepare navigation eagerly; materialize inactive drawing/binding DTOs on first view open. This needs a view-session contract change because its current cache requires complete navigation coverage.
- **Search catalog templates:** scope-independent choices can be shared by phase, in-definition status and shelf revision; retain a small privately branded per-view command wrapper. Avoid reselecting every shelf closure per view.
- **Recovery batching:** preserve the outgoing document's recovery boundary, but batch redundant incoming view/recovery serialization. Do not simply delay all recovery writes across replacement or pagehide.
- **DTO ownership:** createGraphViewSession clones/freezes every prepared view again. Canvas descriptor-checks the active draw DTO before rendering. A private producer capability can avoid duplicated checks for internally owned data while keeping the raw/public API validation fallback.
- **Deferred fit:** examples fit after two rAF callbacks. This adds a visible settling step and can move the camera after first paint. Reuse prepared bounds/geometry to determine the initial camera when feasible; measure after the higher-impact changes.

## Making the interaction feel immediate

Actual work reduction and early visual feedback should be implemented together.

For Examples, show the dialog shell and search/lesson metadata before optional preview preparation. For lesson choice, publish an “Opening…” state before expensive preparation, keep the existing workspace until the candidate is admitted, and allow cancellation where the transaction supports it.

await tick flushes Svelte updates but is not a guarantee that pixels have been presented. Awaiting an already resolved promise continues as a microtask and does not split a long main-thread task. Use bounded batches and a task yield, with a scheduler.yield feature check/fallback. Do not put an entire expensive batch into one rAF callback: it runs before paint and can still block that frame. See [web.dev long-task guidance](https://web.dev/articles/optimize-long-tasks).

The corrected benchmark observed roughly 766 ms and 344 ms main-thread tasks on cold and warm catalog opens, respectively, in its quick verification pass. This explains why feedback can remain invisible despite state updates.

For File/Open, invoke the native picker in the initiating click's turn before yielding, preserving its user-activation requirement and the document guard.

Workers are a later option for pure parsing/validation/thumbnail preparation. They can free the main thread, but messages clone ordinary object graphs and private WeakMap capability brands cannot be transported as authority. A worker design needs clear ownership, cancellation and current-document checks. Measure startup and transfer costs before choosing it. See [MDN worker messaging](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage). Removing the repeated work is a simpler first step.

## Implementation and validation sequence

| Step | Scope | Evidence to require |
|---|---|---|
| 1 | One activation refresh; reuse already rendered scene | One workspace preparation and one scene publication per activation; file/example/closed-editor correctness |
| 2 | Hoist helper choices; reuse checked definition registry | Once-per-preparation helper generation; unchanged choices and detached view DTOs; combined/nested document timing |
| 3 | Immutable/versioned catalog cache and admitted templates | Warm open skips unchanged admission; malformed-entry repair and Retry still work; independent example IDs |
| 4 | Build-time/lightweight previews; retain or lazily mount thumbnail DOM | Authored positions/pins/theme roles preserved; 30 accessible lesson buttons; focus/scroll/filter/details behavior |
| 5 | Private artifact/status/recovery reuse; inactive view preparation | Exact-content and stale-context guarantees retained; recovery boundaries; nested navigation/editing tests |
| 6 | Progressive feedback and bounded yielding | Popup/loading feedback can paint promptly; cancellation and native-picker activation preserved |

Useful follow-up targets, to validate rather than promise: warm picker first-frame opportunity below 100 ms on this machine, no avoidable action task above 50 ms, and substantial reductions in nested-definition loading. Count-based regression checks are less machine-sensitive than hard wall-clock assertions; keep separate browser benchmarks for distributions and slow-device sensitivity.

Relevant existing correctness coverage includes tests/browser/open-workspace.spec.mjs, examples.spec.mjs, example-curriculum.spec.mjs, example-layout.spec.mjs, accessible-themes.spec.mjs, document-controller tests and graph-artifact/graph-view-session tests.

## Artifacts, reproducibility and limits

Saved raw measurements under benchmark-results/examples-latency:

- audit.json: 209 picker/example/reopen samples
- general-workflows.json: 75 file/reopen samples
- experiments.json: 101 controlled cache/render/activation samples
- iteration-helpers.json: 9 combined-document helper samples

These are local ignored benchmark artifacts. The committed audit/tool can reproduce the investigation. The corrected reusable tool writes to benchmark-results/workflow-loading-benchmark:

    npm run build
    node tools/benchmark-workflow-loading.mjs
    node tools/benchmark-workflow-loading.mjs --general
    node tools/benchmark-workflow-loading.mjs --experiments
    node tools/benchmark-workflow-loading.mjs --helpers

Add --quick for shorter verification.

Verification completed: current UI build passed; 20 existing catalog/document-controller tests passed; all four original measurement runs completed without page errors or provider calls; saved tool syntax and --experiments --quick passed with 17 samples, explicit cold/warm/context labels, scene-count assertions and corrected long-task interval matching.

Limits:

- The harness uses mock SillyTavern host services and clean document replacement. It excludes OS picker, disk/network read, model calls, dirty-guard user decisions and real host extension contention.
- DOM clicks invoke actual handlers, but do not measure browser input queue delay or a user's physical click.
- Three rAF callbacks capture the current in-memory activation and deferred fit, not a pixel-level presentation guarantee or all later autosave work.
- CDP counters include surrounding measurement/bookkeeping work; use them as supporting diagnostics, not exact action-only totals.
- Function instrumentation covers selected synchronous declarations/methods. Inclusive values overlap and cannot be summed arbitrarily. Older primitive microtimings were instrumented and are not used for the conclusions.
- Original long-task fields used an incorrect start-window filter and are not evidence of “no long tasks.” The saved tool corrects the overlap filter; its verified results are reported separately above.
- Original fresh-page and warm rows have ambiguous repeat numbers; this report classified cold rows by run order/context construction. The reusable tool adds explicit context and catalog-state labels.
- Earlier empty-thumbnail tests altered only the cache-hit return. The later experiment pass and saved tool alter both returns; the warm comparison above uses the later pass.
- Sample order, prior workflow, JIT and machine load affect timings. Small A/B runs support prioritization and confirmed call-count reductions, not a production latency SLA. The first baseline pass was slower than later passes, so comparisons above stay within each experiment pass.

A real SillyTavern performance trace on representative slower hardware remains the best final validation after implementing the first changes. The audit already isolates avoidable production call paths and reproduces the reported latency locally.
