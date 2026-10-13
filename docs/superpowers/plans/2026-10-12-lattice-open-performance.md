# Lattice Opening Performance Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow one failing test, one minimal fix, then verification for each behavior.

**Goal:** Reduce first-open and repeated-overlay latency while retaining precise pin alignment, current document contents and fresh editor write authority.

**Architecture:** Batch layout-sensitive pin measurements across dirty cards and retain qualified geometry when an overlay is hidden and reopened. Consolidate redundant opening publications and defer built-in example preparation until requested. Use the existing prepared-document and edit-authority boundaries; do not introduce revision-only caching of publicly mutable roots.

**Tech Stack:** JavaScript, Svelte 5, Node 24, Playwright, existing production bundle.

**Spec:** The four measured recommendations approved in the October 12, 2026 conversation. Diagnostic findings are in C:/Users/Keptin/.codex/visualizations/2026/10/13/01a13309-5481-7290-970c-a4bb0af0063d/lattice-open-findings.md.

## Global Constraints

- Work only in the attached lattice-open-performance worktree, based on ae526c5; preserve the primary checkout's existing edits.
- Keep precise lettering alignment and wire anchors for wrapped labels, zoom, font changes and DPR.
- Every reopening must issue fresh write authority. Closed captures, same-ID replaced documents and changed content must never reuse stale edit permissions.
- Defer hidden-card measurement; handle changed fonts, theme, dimensions and content on showing again.
- No new dependency, provider/model calls, unrelated refactors, or unsafe admission shortcuts.
- Workers own disjoint files. They do not build, stage or commit; root owns integrated builds, commits and verification.
- Add real behavioral/work-count regressions before fixes, in incremental red-green cycles. Do not add source-string checks.
- Benchmark cold opening separately from warm reopening; record source/build identity, sample count and synthetic-host limitations.

## Review Focus

- Overlay closure or cancelled gestures must not overwrite retained geometry with zero-sized hidden boxes.
- Changed/same-ID documents, libraries and undo/redo must show current data when reopened.
- Theme, font, width, zoom and compact/wrapped pins must still produce aligned hit targets and wires.
- Fresh edit capture and read-only permissions must survive geometry reuse.
- Examples must remain accessible and errors/retry behavior must remain available after deferring preparation.

### Task 1: Canvas measurement and geometry lifecycle

**Ownership:** src/canvas/pin-alignment.js, src/canvas.js, relevant canvas unit tests, tests/browser/open-geometry.spec.mjs. Do not edit controller, Workbench, generated dist or another worker's tests.

**Interfaces:** Preserve alignCardPins(card, zoom) for existing callers; add an internal/exported batch form if needed. Canvas must batch across dirty cards in a measurement pass, not merely within each card. Canvas setGraph may accept a separate geometry identity through options while edit viewKey stays fresh; coordinate with Task 2 only if necessary. Prefer deriving valid geometry retention from card layout keys and editor scope rather than retaining unsafe prepared root authority.

- [x] Add one failing behavior/work-count regression proving measurement work scales by passes rather than pin count.
- [x] Implement phased probe writes, reads, cleanup and style updates. Preserve exact wrapped-line metrics and standalone card API.
- [x] Add and observe failing hidden/reopen geometry regression, then retain valid geometry and invalidate on actual content/layout changes.
- [x] Verify existing canvas tests and artifact-pin browser checks plus stale capture and changed-document integration where relevant.
- [x] Write task-1-report.md including red/green commands and any limitations.

### Task 2: Opening orchestration and deferred examples

**Ownership:** src/ui/controller.js, src/ui/example-catalog.js only if needed, tests/browser/open-workspace.spec.mjs, appropriate controller/example unit tests. Do not edit Canvas, pin alignment, Workbench or generated dist.

**Interfaces:** Existing public open/close/toggle and example refresh actions remain intact. Task 1 preserves fresh view authority and may independently retain Canvas geometry. Consolidate redundant open rendering/projections only where document/run/status freshness remains correct. Geometry optimization must not depend on caching public mutable authored roots by revision alone.

- [x] Add one failing real-opening regression proving examples are prepared on explicit Examples opening rather than ordinary overlay opening.
- [x] Remove eager example-thumbnail preparation; preserve explicit load, retry and errors.
- [x] Add one failing redundant-opening work-count regression, then consolidate publications and canvas render without breaking selection, initial camera, runtime activity, Recall or host status.
- [x] Cover reopening after closed document changes and fresh edit authority; retain normal rebuild admission unless qualified safe reuse is proven necessary.
- [x] Verify focused controller/example tests and write task-2-report.md with red/green evidence.

### Task 3: Reproducible opening benchmark

**Ownership:** tools/benchmark-lattice-open.mjs, docs/research/2026-10-12-lattice-open-performance.md, benchmark-specific tests if needed. Do not edit product files, generated dist, or other workers' tests.

**Interfaces:** A CLI accepts source, output, sizes and repeats, serves the production controller/bundle under the disabled synthetic host, and measures ordinary first open plus unchanged and changed warm reopening. Baseline snapshot is .tmp/lattice-open-baseline within the worktree; dependencies are available from its parent worktree. Do not rebuild benchmark sources automatically.

- [x] Create a bounded tool using existing harness patterns. Record errors, source/build hashes, browser, viewport, samples, synchronous/settle times and relevant geometry/layout work counts in separate instrumented cases.
- [x] Measure clean baseline against the snapshot before implementation edits; save ignored JSON artifacts.
- [x] After root freezes the final build, measure the same workload serially and document results/limitations without claiming physical paint or authenticated-host latency.
- [x] Include real correctness checks around unchanged and changed reopening, and exact provider-call count zero.
- [x] Write task-3-report.md with commands and baseline status; ask root for final freeze before final timings.

## Integrated Verification

- [x] Full unit suite, Svelte type check, build and asset checks.
- [x] Full browser suite against a fresh server, independent reviewer, fix and focused re-review for findings.
- [x] Serial matched baseline/final measurements after correctness tests stop.
- [x] Preserve worktree with a reviewable commit and report measured gains and remaining limitations.
