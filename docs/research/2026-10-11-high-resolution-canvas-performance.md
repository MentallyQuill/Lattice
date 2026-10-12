# High-resolution canvas performance — 2026-10-11

At a 3840 × 2160 browser viewport, the final camera-publication and empty-profile guards reduced pan/zoom scripting medians by **29.0–70.7%** versus the frozen Main-equivalent baseline. Total browser task time was mixed; frame tails and dragging did not improve consistently. The offscreen-card paint experiment was tested and removed from the final implementation. All 331 unit files and 446 browser tests passed.

## Final guard-only results

The final serial pair measured the frozen baseline first, then the implementation with only the camera-publication and empty-profile guards. Both cohorts completed all nine cases: 45 measured gestures and 1,980 frame intervals each. They used the current probe hash `a8d8d19903c6d6135e21c8d223f3d75beafa55cc6d82aacac3e1b039e5da9972` and the same production UI bundle.

Task / script medians are milliseconds. A positive reduction means less measured work; a negative value means more work. Frame P95 pools 220 intervals per case.

| Cards | Interaction | Baseline task / script | Final guards task / script | Task / script reduction | Frame P95 baseline → guards (ms) |
| ---: | --- | ---: | ---: | ---: | ---: |
| 10 | pan | 64.88 / 33.58 | 44.22 / 10.44 | 31.8% / 68.9% | 16.8 → 33.3 |
| 10 | zoom | 63.29 / 32.51 | 44.45 / 10.64 | 29.8% / 67.3% | 33.3 → 33.3 |
| 10 | drag | 62.61 / 21.01 | 64.91 / 21.10 | -3.7% / -0.4% | 16.8 → 16.7 |
| 250 | pan | 223.02 / 57.70 | 236.09 / 35.78 | -5.9% / 38.0% | 33.4 → 33.4 |
| 250 | zoom | 215.32 / 34.66 | 206.36 / 10.29 | 4.2% / 70.3% | 50.0 → 33.4 |
| 250 | drag | 426.65 / 150.64 | 451.61 / 152.43 | -5.8% / -1.2% | 16.8 → 33.3 |
| 500 | pan | 332.32 / 89.74 | 329.37 / 63.70 | 0.9% / 29.0% | 33.4 → 33.4 |
| 500 | zoom | 286.81 / 35.60 | 271.35 / 10.43 | 5.4% / 70.7% | 50.0 → 50.0 |
| 500 | drag | 668.44 / 288.97 | 691.56 / 292.21 | -3.5% / -1.1% | 33.3 → 33.4 |

Pan/zoom scripting medians decreased **29.0–70.7%**. The fully visible 10-card fixture still benefited, reducing pan scripting by 68.9% and zoom scripting by 67.3%, because these guards remove controller and empty-overlay work regardless of graph visibility.

Total task duration was mixed: the 10-card pan/zoom medians decreased 31.8% and 29.8%, while 250-card pan increased 5.9% despite 38.0% less scripting. Other pan/zoom task reductions ranged from 0.9% to 5.4%. These data support a scripting improvement, not a general reduction in total browser task time.

There was no consistent frame-tail improvement. Frame medians stayed approximately 16.7 ms for pan/drag and 33.3 ms for larger zoom fixtures. The 10-card pan P95 increased from 16.8 to 33.3 ms, with intervals above 25 ms changing from 7/220 to 13/220. The 250-card drag P95 likewise crossed 16.8 to 33.3 ms with only 10/220 to 12/220 slow intervals, illustrating the percentile boundary. The 250-card zoom P95 decreased from 50.0 to 33.4 ms, while the 500-card zoom P95 remained 50.0 ms. These are observed tails in one serial pair under uncontrolled background load; they do not establish a durable frame-rate gain. Historical reverse-order repeats also showed variability, but measured the prototype rather than the final guards.

Dragging did not improve measurably: its scripting medians increased 0.4–1.2% and task medians increased 3.5–5.8% in this pair. Large-graph release work remains substantial. Synchronous release and release-through-two-settling-frames are separate measurements:

| Drag cards | Release synchronous median (ms), baseline → guards | Release synchronous P95 (ms), baseline → guards | Release settled median (ms), baseline → guards |
| ---: | ---: | ---: | ---: |
| 10 | 7.7 → 7.1 | 9.6 → 8.5 | 37.9 → 37.2 |
| 250 | 101.9 → 100.0 | 102.9 → 105.5 | 116.1 → 116.7 |
| 500 | 203.3 → 197.8 | 209.1 → 228.4 | 216.5 → 217.0 |

The 500-card synchronous release median decreased 203.3 to 197.8 ms, but settled release stayed approximately 217 ms and synchronous release P95 increased. The guards therefore do not resolve the large-graph drag-release cost.

**Conclusion:** retain the two small guards for their clear pan/zoom scripting reduction. The tested offscreen-paint implementation is excluded because its incremental evidence was mixed. Further work on frame consistency and drag release requires a separate measured change; the current evidence does not promise a physical-GPU FPS improvement.

Final raw evidence: [paired baseline](artifacts/high-resolution-2026-10-11/final-baseline-4k/viewport-performance-results.json) and [guard-only implementation](artifacts/high-resolution-2026-10-11/final-guards-4k/viewport-performance-results.json).

Across the final pair and seven historical clean cohorts, **265 measured gestures, 11,660 frame intervals and 49 warmups** completed with zero provider calls, page errors, HTTP errors or blocked external requests, and passing retained-DOM/geometry checks. Failed diagnostics are excluded from these totals.

## Proposed final implementation

- The controller publishes camera state to the Workbench when its interaction mode changes. Numeric camera coordinates and zoom still update graph views and persistence; camera commits keep their existing behavior. This avoids rebuilding camera-dependent menus for each numeric movement.
- Camera transforms skip node-profile projection and publication when no profile rows exist. Explicitly setting an empty profile list still clears previously rendered rows.

Relevant final implementation: [canvas](../../src/canvas.js) and [controller](../../src/ui/controller.js). The final proposal does not contain offscreen-card visibility bookkeeping or paint suppression. Its benchmark must compare those two guards with the frozen baseline, rather than treating a prototype run with painting disabled as the final implementation.

## Method and limits

The [probe](../../tools/benchmark-viewport-performance.mjs) mounts the production controller and supplied built Svelte UI in a synthetic local browser host. Fixtures are enabled but idle Compose cards connected as a Text chain: 10 cards in a compact 5-by-2 grid, and 250 or 500 cards in a 10-column grid. The 10-card pan case asserts that every card stays fully visible before, during and after motion. The larger fixtures have offscreen cards.

The requested browser viewport is 3840 × 2160 at DPR 1, with reduced motion and no CPU throttling. Application chrome leaves a measured canvas host of 3550 × 1766. These runs used Chromium with ANGLE Vulkan **SwiftShader software rendering**. They do not establish a physical-GPU FPS gain.

Each initial cohort has nine cases: three sizes and three interactions. One warmup precedes five measured gestures per case. Each gesture sends six synthetic DOM mouse or wheel events in 45 animation-frame batches, yielding 44 recorded intervals. Each full cohort therefore has 45 measured gestures and 1,980 intervals, plus nine warmups. Focused repeats use ten measured gestures per case. These intervals estimate frame opportunities; they are not INP, real pointer-device input latency, or proof that a physical display presented a frame.

CDP task, script, layout and style duration deltas cover gesture down, live motion, release and two settling animation frames. **Final camera-commit and host-save waiting occurs after this timing window**, including zoom's debounced final commit. Release timing is recorded separately for pan and drag. A host save submission confirms submission to the synthetic host, not disk acknowledgement.

Post-timing checks require intended camera or node movement, retained card and pin DOM, stable cached local geometry, graph endpoints following the dragged node, and a final save submission. Provider calls, external requests, HTTP errors and page errors fail a cohort. Background operating-system processes were uncontrolled; authenticated SillyTavern operation, provider execution and arbitrary card content were not measured. Lower task or script duration provides evidence of less browser work under these conditions, not necessarily smoother frames.

All displayed quantiles are recomputed from raw samples with the probe's nearest-rank rule. Task and script figures are medians across gestures; frame P95 pools the recorded intervals within each case. Percent reductions from different changes are not additive.

## Verification

The final guard-only `npm run check` passed with **331/331 unit test files**, **zero type errors and warnings**, production build, asset checks and **446/446 browser tests**; the browser suite completed in 13.6 minutes. The [complete final check log](artifacts/high-resolution-2026-10-11/final-validation-check.txt) is retained.

After that check, the 48 source-path comments were normalized and asserted byte-identical to Main before measuring the final pair; the [normalization record](artifacts/high-resolution-2026-10-11/final-bundle-normalization.txt) and passing [asset recheck](artifacts/high-resolution-2026-10-11/final-asset-recheck.txt) are retained. A subsequent change only clarified the unit-test assertion message to `empty profiles require no camera-path DOM measurements`; the focused profile test passed again, as recorded in the [profile recheck](artifacts/high-resolution-2026-10-11/final-profile-recheck.txt). The camera-publication/persistence and explicit-profile-clearing regression tests remain in the final proposal. Independent review audited all final raw samples, recomputed quantiles and counts, and confirmed motion, save, retained geometry, errors and matched probe/bundle/hardware provenance.

The historical three-change prototype separately passed **332/332 unit test files**, zero type errors and warnings, production build, asset checks, and **453/453 browser tests**. Its [check log](artifacts/high-resolution-2026-10-11/validation-check.txt) and [asset recheck](artifacts/high-resolution-2026-10-11/asset-recheck.txt) are retained as historical evidence. Prototype coverage included retained DOM and geometry, focus, selection, pin-menu exceptions, envelope boundaries, graph replacement, host/card resizing and moved-card updates. Independent static review found no prototype product correctness or lifecycle defects; its save-boundary finding was corrected before measurements.

## Provenance

The frozen baseline source is `F:/git/SillyCanvas/.tmp/performance-regression-2026-10-11/current`, snapshot reference **`e740a6fd65594497668ff4e394c94ef04d82228e`**. Its executable product tree was verified identical to Main **`6cebe8be7860ec46e3dcdd647e7cd88594508be1`**. The snapshot reference and Main commit are different provenance identifiers.

The prototype is preserved on branch `codex/offscreen-card-paint-experiment` at [commit b7101740680fc8af2ae5f34fec2972e3d1c9e64c](https://github.com/MentallyQuill/Lattice/commit/b7101740680fc8af2ae5f34fec2972e3d1c9e64c). Historical result records identify the base Main HEAD plus modified source files, because they were measured before that prototype commit. Their captured source hashes identify the measured implementation. The final guard-only work remains on `codex/high-resolution-performance`. Its paired result records identify the prototype commit as HEAD plus modified sources that remove culling; the captured file hashes identify the actual measured guard-only implementation.

The measured production UI bundle SHA-256 is `8f6b05dbbc5e331ef9e91fd941e58fdc5de479981bf414a0cf632a4e636ed3a0`. Historical cohorts record probe SHA-256 `95a9f241dd398552ed3fd8e2c1e5596f33ad4a902660a649c2e962b0ee3f1699`; the current script SHA-256 is `a8d8d19903c6d6135e21c8d223f3d75beafa55cc6d82aacac3e1b039e5da9972`, differing only by removal of five terminal newline bytes (hex `0A 0A 0A 0D 0A`). Appending those bytes reconstructs the historical hash exactly; executable content is unchanged.

The fresh final build changed exactly 48 `//#region` source-path comments: the dependency junction expanded their `node_modules/` prefix to `F:/git/SillyCanvas/.tmp/performance-regression-2026-10-11/current/node_modules/`. Before the final paired benchmarks, normalizing only that prefix was asserted to reconstruct a `dist/lattice-ui.js` byte-identical to Main, then those comment paths were restored. There was no executable-code difference. The [bundle-normalization record](artifacts/high-resolution-2026-10-11/final-bundle-normalization.txt) confirms the restored SHA-256, and the subsequent [asset recheck](artifacts/high-resolution-2026-10-11/final-asset-recheck.txt) passed. The historical build received the same comment-path restoration and passed its separate retained [asset recheck](artifacts/high-resolution-2026-10-11/asset-recheck.txt).

The final pair has two behavioral product changes, in `src/canvas.js` and `src/ui/controller.js`, plus CSS line-ending normalization. The frozen `style.css` is 57,213 bytes with 684 CRLF pairs (SHA-256 `55bc57b9034d66527f366fedfaee9b21d0f6f1535878d3690f096a1322da3244`); the final file is 56,529 bytes with 684 LF lines (SHA-256 `c735d322169f057300c8c145c1b2d2901bfab8904b84784fdc0e688540326787`). Converting only the baseline CRLF pairs to LF reconstructs the final hash exactly. No visual or styling behavior changed, and the net Git style diff against Main is empty.

Each result also records the actual command, source and built-UI hashes, browser and Playwright versions, runtime, GPU information, viewport, DPR and hardware. A later branch commit is not automatically the measured revision. Sources must already contain their built production UI; the probe neither builds nor modifies them.

## Historical offscreen-paint experiment

The three-change prototype also assigned `pc-offscreen` to native cards outside a viewport padded by 512 CSS pixels. Zero opacity suppressed painting while retaining card and pin DOM and cached geometry. A 256-pixel reuse envelope and cached aggregate bounds reduced rescanning; steady dragging classified moved cards only. Geometry, graph and host-size changes invalidated caches. Selection, focus, active gesture participants and pin menus preserved painting. Wires and overlays retained their existing rendering.

At the start of each large-fixture sample, 80 cards intersected the viewport. The 250-card fixture had 170 geometrically offscreen cards, of which 140 were suppressed; the 500-card fixture had 420 offscreen cards, of which 390 were suppressed. The padded margin kept the remaining nearby cards painted. No cards were suppressed in the fully visible 10-card fixture.

## Historical prototype results

The initial serial order was baseline, prototype, then prototype with paint suppression disabled. The disabled diagnostic forces every card to opacity 1 outside the timing window, while leaving visibility bookkeeping and both guards enabled. It isolates the incremental painting effect within the prototype; it is not a guard-only run.

Task / script medians are in milliseconds. Frame P95 columns use the same baseline / prototype / painting-disabled order.

| Cards | Interaction | Baseline task / script | Prototype task / script | Painting disabled task / script | Frame P95: baseline / prototype / disabled |
| ---: | --- | ---: | ---: | ---: | ---: |
| 10 | pan | 64.45 / 33.61 | 44.85 / 11.10 | 43.84 / 11.20 | 16.8 / 33.3 / 33.2 |
| 10 | zoom | 62.87 / 31.89 | 44.40 / 10.97 | 44.04 / 10.88 | 33.3 / 33.3 / 33.3 |
| 10 | drag | 58.61 / 20.19 | 62.73 / 21.48 | 61.60 / 21.81 | 16.8 / 16.7 / 16.7 |
| 250 | pan | 247.01 / 59.45 | 220.50 / 35.96 | 213.90 / 34.57 | 33.4 / 33.4 / 33.4 |
| 250 | zoom | 216.38 / 33.36 | 206.76 / 10.29 | 188.30 / 10.36 | 33.4 / 33.4 / 33.4 |
| 250 | drag | 437.05 / 150.91 | 406.76 / 150.48 | 422.46 / 152.04 | 16.8 / 16.8 / 16.8 |
| 500 | pan | 352.90 / 86.95 | 332.50 / 65.02 | 321.43 / 68.79 | 33.4 / 33.4 / 33.4 |
| 500 | zoom | 319.30 / 36.87 | 259.19 / 10.45 | 267.50 / 10.40 | 33.5 / 50.0 / 33.5 |
| 500 | drag | 733.74 / 299.59 | 674.37 / 293.58 | 682.69 / 293.72 | 33.3 / 33.3 / 33.4 |

Against the baseline, prototype pan/zoom scripting medians decreased by approximately 25–72%. Drag scripting changed little on larger fixtures, and the 10-card drag median increased. Painting's incremental task effect was mixed: enabling suppression increased the 250-card zoom task median by 9.8% compared with the disabled diagnostic, while decreasing the 500-card zoom median by 3.1%. Pan task medians were also higher with suppression enabled. Frame P95 did not consistently improve, despite 140 or 390 suppressed cards.

Two focused pairs then reversed source order: prototype first, baseline second, with ten measured gestures per source. Both pairs completed:

| Case | Baseline task / script (ms) | Prototype task / script (ms) | Frame P95 (ms), baseline → prototype | Intervals >25 ms, baseline → prototype |
| --- | ---: | ---: | ---: | ---: |
| 10 pan | 66.68 / 34.14 | 42.70 / 10.68 | 33.3 → 16.8 | 45/440 → 20/440 |
| 500 zoom | 285.22 / 37.69 | 241.49 / 11.49 | 50.0 → 50.0 | 292/440 → 290/440 |

The fully visible 10-card pan repeat reduced scripting by 68.7% and task duration by 36.0%, with no suppressed cards. Its frame-tail direction reversed relative to the initial cohort, demonstrating measurement variability. The completed 500-card zoom repeat reduced scripting by 69.5% and task duration by 15.3%, while **both sources had 50.0 ms frame P95**. This supports further investigation of the guards but does not isolate their final performance or demonstrate a durable frame improvement.

Taken together, the prototype evidence did not justify shipping its additional culling bookkeeping. The final proposal removes that experiment; its direct paired guard-only comparison is reported above. Historical 500-card drag release synchronous medians were 205.0 ms for baseline, 198.6 ms for prototype and 199.6 ms with painting disabled; that release cost remains substantial.

All seven historical cohorts completed with **175 measured gestures and 7,700 frame intervals**, zero provider calls, page errors, HTTP errors or blocked external requests, and passing retained-DOM/geometry checks.

Historical raw evidence:

- Initial cohorts: [baseline](artifacts/high-resolution-2026-10-11/baseline-4k/viewport-performance-results.json), [prototype](artifacts/high-resolution-2026-10-11/optimized-4k/viewport-performance-results.json), [prototype with painting disabled](artifacts/high-resolution-2026-10-11/optimized-no-culling-4k/viewport-performance-results.json).
- Reverse-order 10-card pan: [prototype](artifacts/high-resolution-2026-10-11/repeat-small-pan-optimized/viewport-performance-results.json), [baseline](artifacts/high-resolution-2026-10-11/repeat-small-pan-baseline/viewport-performance-results.json).
- Reverse-order 500-card zoom: [prototype](artifacts/high-resolution-2026-10-11/repeat-large-zoom-optimized/viewport-performance-results.json), [completed baseline](artifacts/high-resolution-2026-10-11/repeat-large-zoom-baseline/viewport-performance-results.json).

## Excluded diagnostic runs

An initial 1,000-card full-default Compose document exceeded the production `safeWorkflowData` budget of 20,000 visited values and failed admission before rendering. The revised 500-card fixture passes production validation. This document-data budget is distinct from the separate 1,000-node structural limit; 500 is not an overall product node cap. The [admission diagnostic](artifacts/high-resolution-2026-10-11/diagnostic-1000-admission.json) also records a missing synthetic host module.

A subsequent [host-module diagnostic](artifacts/high-resolution-2026-10-11/diagnostic-host-module.json) failed on a 404 for `/scripts/user.js`. The synthetic host response was corrected and clean cohorts were restarted. Both failed diagnostics are preserved for provenance and excluded from all tables, counts and comparisons above.

## Reproduce

From the final worktree, with locked dependencies and both source builds prepared, run the final paired cohorts sequentially in PowerShell:

```powershell
node tools/benchmark-viewport-performance.mjs --source=F:/git/SillyCanvas/.tmp/performance-regression-2026-10-11/current --output=docs/research/artifacts/high-resolution-2026-10-11/final-baseline-4k --sizes=10,250,500 --width=3840 --height=2160 --repeats=5 --motion-modes=pan,zoom,drag
node tools/benchmark-viewport-performance.mjs --source=. --output=docs/research/artifacts/high-resolution-2026-10-11/final-guards-4k --sizes=10,250,500 --width=3840 --height=2160 --repeats=5 --motion-modes=pan,zoom,drag
```

For the historical prototype, prepare a separate checkout of commit `b7101740680fc8af2ae5f34fec2972e3d1c9e64c` with its locked dependencies and built UI. Set `$prototypeSource` to that checkout, then run from the final worktree using the same probe:

```powershell
$baselineSource = 'F:/git/SillyCanvas/.tmp/performance-regression-2026-10-11/current'
$prototypeSource = 'C:/path/to/prepared-prototype-checkout'
node tools/benchmark-viewport-performance.mjs --source=$baselineSource --output=docs/research/artifacts/high-resolution-2026-10-11/baseline-4k --sizes=10,250,500 --width=3840 --height=2160 --repeats=5 --motion-modes=pan,zoom,drag
node tools/benchmark-viewport-performance.mjs --source=$prototypeSource --output=docs/research/artifacts/high-resolution-2026-10-11/optimized-4k --sizes=10,250,500 --width=3840 --height=2160 --repeats=5 --motion-modes=pan,zoom,drag
node tools/benchmark-viewport-performance.mjs --source=$prototypeSource --output=docs/research/artifacts/high-resolution-2026-10-11/optimized-no-culling-4k --sizes=10,250,500 --width=3840 --height=2160 --repeats=5 --motion-modes=pan,zoom,drag --disable-culling
node tools/benchmark-viewport-performance.mjs --source=$prototypeSource --output=docs/research/artifacts/high-resolution-2026-10-11/repeat-small-pan-optimized --sizes=10 --width=3840 --height=2160 --repeats=10 --motion-modes=pan
node tools/benchmark-viewport-performance.mjs --source=$baselineSource --output=docs/research/artifacts/high-resolution-2026-10-11/repeat-small-pan-baseline --sizes=10 --width=3840 --height=2160 --repeats=10 --motion-modes=pan
node tools/benchmark-viewport-performance.mjs --source=$prototypeSource --output=docs/research/artifacts/high-resolution-2026-10-11/repeat-large-zoom-optimized --sizes=500 --width=3840 --height=2160 --repeats=10 --motion-modes=zoom
node tools/benchmark-viewport-performance.mjs --source=$baselineSource --output=docs/research/artifacts/high-resolution-2026-10-11/repeat-large-zoom-baseline --sizes=500 --width=3840 --height=2160 --repeats=10 --motion-modes=zoom
```

These output paths reproduce the evidence layout and overwrite existing JSON in those directories; use fresh directories to retain original measurements.
