# Shelf browsing performance — 2026-10-15

Repeated family browsing now reuses prepared catalog entries, the actual family row DOM, and valid drawer measurements. In the matched browser benchmark, warm drawer readiness improved by about one third across both fixture sizes and CPU settings.

## Implementation

- Derive canonical display entries when catalog props change. Insertion, drag start, and saved-subgraph actions still validate current choices rather than trusting cached display data.
- Lazily render a family once, then retain its rows in a disconnected container when inactive. Only the active family is connected to the menu, keeping focus traversal and menu queries unchanged. The pool is bounded by the eight shelf families and destroyed with the component.
- Cache measured dimensions and intrinsic first-row offsets. Warm switching reads anchor and pane bounds before updating state; it neither measures the drawer nor defers positioning through `tick()`.
- Invalidate measurements for catalog/context/read-only changes, theme/font events, window resizing, or changed pane/anchor dimensions. Compact back-row transitions are remeasured. Different families start at scrollTop zero.

## Measurements

The baseline is the saved working bundle from this chat after the earlier transform-positioning improvement, on top of `49197e301e0f7a46bbe5a2c5245f79363ba5f81f`. It is not an inferred Git baseline. Both variants used the same frozen controller, CSS, fonts, synthetic host, and authored fixture. The existing scoped CSS selectors match both bundles; the added container rule applies only to the candidate.

Three serial ABBA blocks per node-count/CPU case used fresh contexts in one Chromium process: 48 contexts, 96 timed phases, 1,728 timed switches, and 48 separate work passes. Viewport was 1440×1000, DPR 1. Values below are medians of context medians. Script work includes the shared probe and validation.

| Nodes | Renderer CPU | Warm ready before → after | Improvement | Script per switch before → after |
| ---: | ---: | ---: | ---: | ---: |
| 3 | 1× | 1.775 → 1.175 ms | 33.8% | 0.871 → 0.347 ms |
| 3 | 4× throttled | 8.675 → 5.925 ms | 31.7% | 4.263 → 1.474 ms |
| 250 | 1× | 1.800 → 1.200 ms | 33.3% | 0.909 → 0.445 ms |
| 250 | 4× throttled | 9.625 → 6.325 ms | 34.3% | 4.940 → 1.997 ms |

First-visit readiness was comparable: 3.000 → 2.950 ms and 12.200 → 12.600 ms for the small fixture, and 2.475 → 2.250 ms and 14.575 → 13.325 ms for the large fixture, at 1×/4× respectively. The benefit is concentrated in repeated browsing.

In each separate 14-switch warm work pass, the baseline introduced 106 previously unseen row objects; the candidate introduced zero and reused those 106 row observations. A browser regression also verified that 14 warm switches dropped drawer/row rectangle reads from 28 to zero. Both still need browser layout to display the active content. DOM attachment counts include moves and must not be called allocation counts.

Readiness here means committed menu content with stable position and validated geometry, measured before waiting for a frame. Validation itself can force layout. This is synthetic handler/DOM readiness, not physical paint, OS input delivery, INP, or an authenticated SillyTavern measurement. Real-pointer browser regressions separately exercise traversal and interaction behavior.

## Evidence and verification

- [Results and per-context evidence](artifacts/shelf-browsing-2026-10-15/results.json); full local raw switch data remains in `benchmark-results/shelf-browsing-final/shelf-browsing-results.json`.
- Reproduce with `node tools/benchmark-shelf-browsing.mjs --baseline=.tmp/shelf-start-2026-10-15.js --output=benchmark-results/shelf-browsing-final`. The saved starting bundle is local; its SHA-256 and the candidate/tool/source identities are recorded in the results.
- Regressions were observed failing before the corresponding changes: repeated metadata reads, replaced row identities, repeated drawer measurements, and retained scroll position.
- All 347 unique unit-test files passed across four isolated batches; the existing filename-substring filters overlap slightly, and coverage was checked against the complete current manifest. All 43 relevant browser checks passed across the shelf/workspace and subgraph runs. Types report zero errors/warnings; build and asset validation pass. Independent review found no actionable issues.
