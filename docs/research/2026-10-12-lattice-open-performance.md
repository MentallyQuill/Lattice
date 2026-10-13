# Lattice opening performance, October 12, 2026

The frozen final build reduced 250-node median first-open settle time from **2548.4 to 561.5 ms (4.54×)**, unchanged reopen from **1322.7 to 248.5 ms (5.32×)**, and changed reopen from **1392.1 to 263.6 ms (5.28×)** in the disabled synthetic host. These are serial matched measurements after correctness tests and reviewers stopped, with five repeats per case. They measure the public opening call and three animation-frame opportunities; they do not establish authenticated-host latency or physical paint time.

## Matched ordinary measurements

| Nodes | Case | Sync baseline → final ms | Settle baseline → final ms | Settle speedup | Settle reduction | Renderer layouts baseline → final |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 25 | cold | 784.9 → 115.1 | 851.3 → 152.6 | 5.58× | 82.1% | 905 → 13 |
| 25 | unchanged | 76.7 → 42.5 | 114.5 → 49.6 | 2.31× | 56.7% | 453 → 2 |
| 25 | changed | 71.2 → 47.0 | 99.0 → 65.2 | 1.52× | 34.1% | 453 → 5 |
| 100 | cold | 962.8 → 206.5 | 1230.9 → 287.6 | 4.28× | 76.6% | 2705 → 11 |
| 100 | unchanged | 258.1 → 105.2 | 381.8 → 131.6 | 2.90× | 65.5% | 1803 → 2 |
| 100 | changed | 246.8 → 107.5 | 367.2 → 131.4 | 2.79× | 64.2% | 1803 → 5 |
| 250 | cold | 1518.0 → 387.6 | 2548.4 → 561.5 | 4.54× | 78.0% | 6755 → 11 |
| 250 | unchanged | 781.7 → 214.5 | 1322.7 → 248.5 | 5.32× | 81.2% | 4503 → 2 |
| 250 | changed | 828.3 → 232.1 | 1392.1 → 263.6 | 5.28× | 81.1% | 4503 → 5 |

Both ordinary captures completed all 45 samples. Both separate diagnostic captures also completed all 45 samples: 180 total captured openings, of which 90 ordinary openings support the timing comparison. Every run recorded stable source/build identity and exactly zero page/console errors, failed HTTP responses, prohibited requests and provider calls. All sampled card counts, DOM/Canvas titles, authored and detached Canvas section contents, fresh edit scopes and finite pin coordinates passed.

## Reproduce

Run from the attached worktree `C:/Users/Keptin/.codex/worktrees/lattice-open-performance/SillyCanvas`. Baseline is the clean ae526c5 snapshot under `.tmp/lattice-open-baseline`; final is the frozen worktree and supplied production bundle. The tool never builds or edits production modules. Use already-built, content-matched sources and stop tests, builds and other heavy work before capture. These commands ran in the order shown, each process completing before the next started:

```powershell
node tools/benchmark-lattice-open.mjs --source=.tmp/lattice-open-baseline --output=.tmp/lattice-open-measurements/matched-baseline --sizes=25,100,250 --repeats=5
node tools/benchmark-lattice-open.mjs --source=. --output=.tmp/lattice-open-measurements/matched-final --sizes=25,100,250 --repeats=5
node tools/benchmark-lattice-open.mjs --source=.tmp/lattice-open-baseline --output=.tmp/lattice-open-measurements/matched-baseline --sizes=25,100,250 --repeats=5 --instrument
node tools/benchmark-lattice-open.mjs --source=. --output=.tmp/lattice-open-measurements/matched-final --sizes=25,100,250 --repeats=5 --instrument
```

The tool accepts bounded source/output/sizes/repeats options. Defaults are sizes 25,100,250 and five repeats. `--instrument` writes a separate result file and must not supply ordinary timing comparisons.

## Provenance and raw artifacts

Capture starts (UTC): baseline ordinary 2026-10-13T02:58:14.998Z; final ordinary 2026-10-13T02:59:19.166Z; baseline instrumentation 2026-10-13T03:00:11.994Z; final instrumentation 2026-10-13T03:01:29.293Z. Browser Chromium 151.0.7922.34, Playwright 1.62.1, Node v24.16.0; Windows, viewport 1440×1000, DPR 1, reduced motion, CPU throttling rate 1. JSON additionally records CPU models, logical CPUs, memory, platform, architecture, complete commands, source path, git/snapshot reference, all raw samples, per-file SHA-256 and runtime metadata.

| Identity | Clean baseline | Frozen final |
| --- | --- | --- |
| sourceSha256 | `3cb59803c2e2dfe75f55ec638e057fb5e5ed5718a96cd994fac862e8d025acce` | `5935be899eb8697620d70280ee25043b96587ba6fa03060d7bf35225183df4d2` |
| buildSha256 | `b979d459bff8b95f0772b54a0e6a4773955d31d263fb59b71bd650c00ea5bd9e` | `57c3f952779c834ddda5e38bb686d2ead3308a33e74690da056acb137f3be767` |
| bundleSha256 | `1b3d733aa12e174a24c8946b1922a3dc0210feda5028ea517fdc868370b05176` | `2742856bc45aa0caef7edb1675edc9f624288a53fe3e3489c1d26e5308c2cac7` |

All four captures used measurement-script SHA-256 `e38893050fc53db9b34b3f93d7bf065899a18ada05dfc4bbfd47506d8e4d3b9c`. The exact measured bytes are preserved in [measured-benchmark-lattice-open.mjs](../../.tmp/lattice-open-measurements/measured-benchmark-lattice-open.mjs). During packaging, only surplus blank lines at EOF were removed from the current CLI, whose SHA-256 is now `7f5cd3cdaa69e1928b321d471ea1fb8ea73997fed0b069fa3ae88ce77f4c7d94`. The preserved and current scripts have identical bodies after ignoring trailing whitespace; the cleanup occurred after captures and requires no timing rerun. Exact current-script byte matching was verified at capture, before this formatting cleanup. Source hashes cover the served product source, UI source, fixture/harness and relevant manifests; build hashes cover all dist files. Bundle hashes identify `dist/lattice-ui.js`. Each capture compares these content identities at start/end; post-capture verification also confirmed both frozen sources still match. Final uncommitted content is identified by hashes, rather than relying only on Git HEAD.

Raw JSON files remain ignored local artifacts with full precision, per-sample correctness and CDP metrics:

- [matched-baseline/lattice-open-results.json](../../.tmp/lattice-open-measurements/matched-baseline/lattice-open-results.json)
- [matched-final/lattice-open-results.json](../../.tmp/lattice-open-measurements/matched-final/lattice-open-results.json)
- [matched-baseline/lattice-open-instrumented.json](../../.tmp/lattice-open-measurements/matched-baseline/lattice-open-instrumented.json)
- [matched-final/lattice-open-instrumented.json](../../.tmp/lattice-open-measurements/matched-final/lattice-open-instrumented.json)

## Separate diagnostic work counts

| 250-node case | Canvas geometry.measure median (range), baseline → final | Element rectangle reads median, baseline → final | getComputedStyle median, baseline → final | Public Canvas render calls, baseline → final |
| --- | ---: | ---: | ---: | ---: |
| cold | 750 (750–750) → 750 (750–1000) | 12003 → 12003 | 5258 → 3009 | 2 → 0 |
| unchanged | 500 (500–500) → 0 (0–0) | 8000 → 0 | 3509 → 7 | 2 → 0 |
| changed | 500 (500–500) → 1 (1–1) | 8000 → 16 | 3509 → 11 | 2 → 0 |

Each 250-node case makes one public setGraph call in both builds. An omitted instrument counter means zero calls. The final unchanged reopen makes no measured geometry.measure or rectangle-read calls; the changed reopen measures the one changed card. Cold opening still measures every card and may receive another complete ResizeObserver/layout pass: its final geometry count is 750–1000 versus baseline 750. Its large latency reduction therefore comes from layout phasing and reduced preparation/publication work, rather than fewer raw card measurements. Ordinary 250-node renderer layout medians fall from 6755 to 11 on cold opening and 4503 to 2/5 on unchanged/changed reopening. These renderer counters include all layouts; they do not count pin-specific forced layouts.

The diagnostic harness wraps public Canvas setGraph/render, its geometry.measure boundary, Element/Range rectangle reads and getComputedStyle. Production source modules and supplied bundle are served byte-for-byte. These primitive wrappers change measurement conditions; their timings are excluded from the comparison above. Raw diagnostic JSON retains work counts for all sizes, including any run-to-run ResizeObserver variation.

## Measurement boundary and correctness

Each repeat creates a fresh browser context, loads the disabled synthetic host, imports production modules and admits a native Compose text-chain fixture while the overlay is closed. Module loading and document.fonts.ready settle before the first controller open. Fixtures use a ten-column grid and one wire between successive cards. The next two cases close/reopen that document: first unchanged, then after mutating the same publicly authored root's first-card title and section text while closed. Cases run cold, unchanged, changed, at each size, serially.

Synchronous time covers `window.lattice.open()`. Settled time covers that call and three requestAnimationFrame opportunities. CDP renderer duration/counter deltas bracket opening and settling plus protocol collection boundaries. Correctness inspection occurs afterward. It checks exact graph/DOM card count, actual DOM and Canvas title, current authored and detached Canvas section content, a changed Canvas edit scope, finite measured pin coordinates, a disabled host and exactly zero provider calls. The stale-section verifier has a red→green regression: current title/current authored content with stale detached content is rejected. Fresh-scope checks complement the dedicated stale-capture regressions; this benchmark does not attempt stale captured edits.

Page or console errors, failed HTTP responses and prohibited requests fail the run. Service workers are blocked; requests are restricted to local GET/HEAD, with provider stubs that count and reject every invocation. Served-harness adaptations suppress its initial automatic open, preserve independent setGraph options in older snapshot wrappers, and add instrumentation only in diagnostic runs. Local compatibility responses for `/script.js` and `/scripts/user.js` follow the established synthetic host pattern.

## Ordinary raw timing samples

Values below are milliseconds rounded to one decimal for reading; JSON preserves full precision.

| Source | Nodes | Case | Sync samples ms | Settle samples ms |
| --- | ---: | --- | --- | --- |
| baseline | 25 | cold | 812.1, 797.3, 772.7, 774.0, 784.9 | 896.9, 850.1, 851.3, 850.3, 864.5 |
| baseline | 25 | unchanged | 76.7, 75.3, 77.9, 75.6, 78.4 | 114.5, 98.5, 114.5, 114.9, 115.6 |
| baseline | 25 | changed | 72.8, 70.8, 71.2, 71.0, 74.4 | 98.9, 98.4, 103.5, 103.0, 99.0 |
| baseline | 100 | cold | 965.7, 956.3, 960.7, 968.0, 962.8 | 1235.7, 1218.9, 1227.3, 1231.9, 1230.9 |
| baseline | 100 | unchanged | 258.4, 258.1, 269.2, 248.0, 249.4 | 381.9, 381.8, 398.1, 368.1, 367.3 |
| baseline | 100 | changed | 258.7, 246.8, 286.9, 240.7, 241.3 | 382.7, 365.1, 432.4, 348.6, 367.2 |
| baseline | 250 | cold | 1509.7, 1508.5, 1518.0, 1657.7, 1575.5 | 2529.9, 2548.4, 2529.0, 2745.3, 2616.3 |
| baseline | 250 | unchanged | 780.7, 762.5, 782.5, 829.8, 781.7 | 1335.3, 1309.8, 1313.4, 1391.8, 1322.7 |
| baseline | 250 | changed | 842.3, 792.3, 809.9, 828.3, 886.5 | 1399.4, 1308.7, 1355.9, 1392.1, 1487.6 |
| final | 25 | cold | 113.1, 123.3, 119.3, 114.4, 115.1 | 157.8, 166.9, 150.0, 151.9, 152.6 |
| final | 25 | unchanged | 40.2, 43.6, 45.4, 42.5, 41.7 | 49.1, 64.3, 65.2, 48.6, 49.6 |
| final | 25 | changed | 44.9, 58.4, 47.0, 47.2, 44.8 | 65.6, 63.8, 65.5, 65.2, 64.5 |
| final | 100 | cold | 205.8, 206.5, 222.9, 210.2, 197.9 | 265.4, 267.3, 325.1, 287.6, 288.5 |
| final | 100 | unchanged | 105.2, 103.9, 107.2, 106.6, 102.3 | 131.5, 132.7, 131.8, 131.6, 116.1 |
| final | 100 | changed | 107.5, 106.6, 113.7, 103.8, 108.4 | 115.5, 131.4, 131.4, 130.5, 131.6 |
| final | 250 | cold | 384.2, 380.4, 387.6, 394.8, 403.8 | 606.7, 539.7, 600.9, 551.1, 561.5 |
| final | 250 | unchanged | 218.6, 213.0, 214.1, 223.5, 214.5 | 267.2, 247.8, 248.1, 265.5, 248.5 |
| final | 250 | changed | 239.4, 229.2, 227.4, 251.6, 232.1 | 263.6, 249.6, 247.9, 282.4, 265.7 |

## Exploratory baseline retained

Earlier ordinary and diagnostic results under `.tmp/lattice-open-measurements/baseline/` each completed 45 samples with stable source/build identity and zero failures. Those runs overlapped the baseline unit suite and used the earlier content assertion/script hash, so they are exploratory and excluded from all final comparisons. They were preserved; matched captures used the revised detached-content assertion and the recorded measured-script hash above.

## Limitations

This is one Windows desktop and one headless Chromium version in a synthetic disabled host. Cold means first overlay opening after modules initialize, rather than cold application/network startup. Idle Compose fixtures do not represent authenticated connection metadata, actual host activity, live generation, Recall history or arbitrary custom cards. Three animation-frame opportunities are a reproducible settle boundary, not proof of the last physical display paint or INP. Detailed font/wrap/zoom/DPR alignment and stale-write rejection belong to the dedicated regression suites.

Five repeats expose each sample but do not establish a population confidence interval. Warm cases follow cold in the same context, changed always follows unchanged, and baseline cohorts precede final cohorts, so cache/order effects and machine variation remain. Measurements show a substantial improvement for these exact workloads; they do not establish universal end-user speedup. Unchanged reopen still takes 214.5 ms synchronously at 250 nodes, reflecting retained document preparation/publication work despite geometry reuse. Dedicated integrated validation is reported separately by root.

## Integrated validation

The clean baseline passed 331/331 unit test files. The implemented full unit run passed 332/333 files; the remaining extracted-controller fixture lacked the newly introduced private opening flag. Its one-line fixture default preserved all assertions, and the identical test command then passed independently for worker and root. All 333 unit files are therefore covered by the full run plus that corrected-fixture rerun. After the visibility review fix, root reran all 23 Canvas-related unit files successfully.

The final rebuilt production bundle passed the complete 454-test Playwright browser suite. Svelte checking reported zero errors and warnings; the build and 695 versioned asset-import checks passed. Independent task reviews, the whole-branch review and scoped correction reviews finished with no open findings. Font, theme, wrapped-label, zoom, DPR, hidden/reveal, changed/replaced-document, stale-write, Examples and Recall checks are covered by the focused and integrated regressions.

Root independently verified all four matched captures: nine cases and five samples each, stable identities, zero errors/prohibited requests/provider calls, identical measurement-script hashes, matching plain/diagnostic product hashes, and no mismatch against current final per-file hashes. Benchmark results precede the local commit; recorded content hashes identify the measured build regardless of its Git commit metadata. Raw captures and the baseline snapshot remain in the preserved worktree.
