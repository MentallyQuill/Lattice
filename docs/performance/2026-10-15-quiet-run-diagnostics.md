# Quiet authoring and run diagnostics: verification

Date: 2026-10-15. Baseline: `1babea047ad8d26b202de87ae96fedb8848b1fa5` (0.27.4). This report describes the verified source and generated production bundle before the authorized integration commit.

## Result

Draft nodes have no Input Required badge, amber missing-input decoration, input-warning group count, or static red Preview completeness banner. Genuine Setup Required indicators, model IDs, profiles, artifact colors and input hit areas remain. Current attempted failures outline the exact causal node and ring an input only when validated structured metadata identifies it. Historical Run Details retain actual execution statuses; they do not independently repaint noncausal nodes red.

Root runs start from explicit workflow outputs and their upstream dependencies. Creating, pasting or wiring nodes does not enroll them. Manage enrollment through **Workflow > Workflow outputs**, or a terminal's **Run with workflow** context action. Run to Here selects its own upstream closure and keeps native execution restrictions. Orphan nodes and unselected internally connected draft islands produce no execution effects.

Legacy documents without enrollment infer only one unambiguous native Review / Publish primary. Independent legacy file, memory and other side effects require explicit enrollment. Ambiguous or empty enrollment gives actionable output-selection guidance before any source, binding, provider or effect work. Built-in examples explicitly enroll their intended outputs.

## Verification

- Complete Node run: **351/351 test files passed**.
- Complete browser run: **492/492 tests passed** against the production build, including existing authoring, guide, authority and geometry coverage.
- The final independent whole-change review found two P2 issues: oversized navigation identity could alias an existing prefix, and historical failed traces could color an executing noncausal node. Both were reproduced, fixed in one bounded wave, and independently re-reviewed as addressed with no material new breakage.
- After that final two-file product hardening: **127/127 focused Node tests across 13 files**, and **17/17 browser tests against the rebuilt final production UI**. These include the new exact-identity browser regression, real runtime-to-mounted-canvas causal attribution, wrapper scopes, current-attempt retirement, safe diagnostic boundaries, trace-cache ownership, retained geometry, setup/model spacing and native Preview policy. The complete suites above preceded this bounded hardening; they were not claimed as a second complete run afterward.
- Final `npm run check:types`: **0 errors, 0 warnings**. `npm run build` and `npm run check:assets` passed; **720 versioned local imports**, self-contained Svelte bundle. `git diff --check` passed.
- Focused diagnostic-paint instrumentation: **zero card/pin geometry reads**, identical retained card/pin objects and endpoint coordinates, unchanged artifact colors and hit-area dimensions. The failed input ring is an **18px** pointer-transparent pseudo-element.
- The existing connection-edit clone bound remains **6 <= 6**. Diagnostic paint stays outside authored ports and layout keys. Stable row and diagnostic references skip trace rescans; no graph expansion or geometry measurement was added to camera, hover or drag paths.
- Visually inspected quiet unattempted Preview, current causal input, and final model/setup/ring captures.

## Matched rendering measurements

Production controller and supplied production bundle in the synthetic browser host, Chromium, 3840×2160, DPR 1, no CPU throttling, 10/250/500 idle Compose nodes, one warmup and three timed repeats per case. Each repeat dispatches six events per frame for 45 animation frames. Baseline and final builds ran serially after CPU-heavy verification ended. All 27 final samples retained node/pin DOM and cached geometry. Pan/zoom layout time was **0 ms in every sample**. No provider calls, external requests, blocked requests or browser errors occurred.

Values are **baseline → final**, milliseconds. Frame p95 uses animation-frame intervals; these are paint-opportunity estimates, not INP. Total script and release sync include existing gesture settlement and document work, rather than only the live event handler.

| Nodes | Motion | Frame p95 | Handler p95 | Total script median | Release sync median |
| ---: | --- | ---: | ---: | ---: | ---: |
| 10 | pan | 16.70 → 16.80 | 0.20 → 0.10 | 10.83 → 9.86 | 2.30 → 2.20 |
| 10 | zoom | 16.70 → 16.70 | 0.20 → 0.20 | 10.72 → 10.50 | — → — |
| 10 | drag | 16.80 → 16.80 | 0.20 → 0.10 | 23.64 → 20.76 | 9.60 → 7.80 |
| 250 | pan | 16.80 → 16.80 | 0.10 → 0.10 | 34.40 → 38.60 | 25.90 → 29.30 |
| 250 | zoom | 33.40 → 33.40 | 0.20 → 0.20 | 10.19 → 10.68 | — → — |
| 250 | drag | 16.80 → 16.80 | 0.20 → 0.20 | 144.46 → 144.34 | 96.30 → 94.20 |
| 500 | pan | 16.80 → 16.80 | 0.10 → 0.20 | 56.33 → 58.65 | 48.50 → 49.40 |
| 500 | zoom | 33.40 → 33.40 | 0.20 → 0.20 | 10.72 → 10.44 | — → — |
| 500 | drag | 33.30 → 33.30 | 0.20 → 0.10 | 269.08 → 269.56 | 187.60 → 188.40 |

The initial 250-node pan total-script/release medians exceeded the investigation threshold (both >10% and >2 ms), while frame and handler latency stayed unchanged. Repeated **only that affected case**, five repeats on the frozen baseline followed by five on the final build:

| 250-node pan, five repeats | Baseline | Final |
| --- | ---: | ---: |
| Frame p95 | 16.80 | 16.80 |
| Handler p95 | 0.10 | 0.10 |
| Total script median | 33.66 | 32.82 |
| Release sync median | 25.50 | 24.90 |

The increase did not reproduce. No material regression was found in the measured interaction, script, layout or release medians. Existing large-graph release settlement costs remain visible in the table; this change does not claim to eliminate them. These synthetic results cover this machine and fixture, rather than guaranteeing absolute latency for every graph or host.

Reproduce with:

```text
node tools/benchmark-viewport-performance.mjs --source=<baseline-or-final-build> --output=<results> --sizes=10,250,500 --width=3840 --height=2160 --repeats=3 --motion-modes=pan,zoom,drag
```

Baseline bundle SHA-256: `f8be709f21f757f6b27f5dcae6212ef14760e0606ef9e2eb42bbbe24826aa49d`.

Final bundle SHA-256: `6de7a0871c3ad2a522b040d2c427e7ce099ad792e01e9be04d5de781e2bfbda0`.

Raw JSON contains source-file and measurement hashes, hardware/browser provenance, individual timings, retained DOM/geometry checks, traffic counters and summary metrics. Raw measurements, check logs, review reports and screenshots are retained in the task's local evidence archive.

## Decisions and tradeoffs

- Reused the clean attached managed worktree and isolated branch; mistakes remain recoverable as ordinary branch changes.
- Existing user approval covers implementation, merge and push. The integration gate verifies the actual origin main SHA rather than asking for another approval.
- Legacy inference enrolls only a unique native primary. Independent historical effects need one-time explicit enrollment; this is the approved cost of keeping draft islands inert.
- Parallel implementers had separate source ownership and published interface contracts; integration risks were checked with fresh task reviews and the whole-change review.
- Root execution identity includes normalized effective enrollment, so changing output selection makes historical root results stale. Archived definition bodies/hashes remain exact and independent of root enrollment.
- Causal input identity comes only from admitted structured metadata. Ambiguous/provider/configuration failures get node-only emphasis, and oversized navigation addresses are rejected without changing exact canvas paint.

## Integration

The user authorized merge and push to main. This report is committed with the verified change; the post-commit release gate checks a clean main, fast-forwards the tested branch, pushes origin main, and verifies the exact remote SHA through GitHub CLI against `MentallyQuill/Lattice`. The session goal records that final outcome after it occurs.
