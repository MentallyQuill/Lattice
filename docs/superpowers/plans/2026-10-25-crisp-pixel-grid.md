# Crisp Pixel Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both progress meters paint perfectly even square cells and gaps at fractional display scaling.

**Architecture:** Preserve the existing statuses, percentage, animations and fade. Use a shared SVG layout helper with integer device-pixel cell/gap geometry and crisp edges. Observe display-scale changes without polling. The native DOM chat meter and Svelte workbench meter share this geometry.

**Tech Stack:** Existing JavaScript/Svelte, SVG, DOM observers, Playwright screenshot raster assertions.

**Spec:** User request to improve sub-pixel spacing and reuse the Recursion precedent; precise design below.

## Design and constraints

- Recursion commit `d26561fa3ffadd8bb1715fc156e2feb1eee9adb7` removed cell scaling and adopted square block cells with fixed 4px sizes and 2px gaps, animated by opacity/shadow only. Lattice already avoids scale animation. At fractional DPR, its CSS gaps and rounded edges still rasterize unevenly.
- Keep nominal 4 CSS-pixel cells, 2 CSS-pixel gaps and column-major three-row order. Round cell and gap independently to the nearest whole device pixel. SVG crisp-edge rasterization handles fractional parent origins; do not change chat control positioning.
- Preserve all status colors, theme overrides, tooltips, running pulse, stage counting, 36-cell overflow behavior and three-second completion fade.
- No new dependencies, workflow execution changes, network service or edits to Recursion. Leave work uncommitted.

## Review focus

- DPR/zoom changes must update an active grid without a workflow event.
- Observer and display listeners must clean up on meter disposal/unmount.
- Empty grids and overflow remain bounded; shared geometry must not alter run state.
- Signal theme failure diamonds retain their intended meaning and centered rotation.
- Raster tests must inspect painted pixels rather than trust CSS dimensions.

### Task 1: Reproduce fractional raster unevenness

- [x] Add `tests/browser/pixel-grid.spec.mjs` using both real meters after completing a 36-stage run.
- [x] Observe baseline failure at 1.25x display scale: solid painted cell rows are reduced by rounded/antialiased edges.

### Task 2: Shared physical-pixel grid

**Files:** Create `src/ui/pixel-grid.js`; modify `src/ui/chat-progress.js`, `ui/RunMeter.svelte`, `style.css`, and `tests/ui-run-meter.test.mjs`.

**Interface:** `alignPixelGrid(svg)` returns `{update(), destroy()}`; updates physical rect geometry and SVG viewport/CSS size. Use it as a Svelte action and explicitly update/destroy it in the DOM presenter.

- [x] Implement the shared layout and scale-change lifecycle; retain existing pixel selectors and status data.
- [x] Apply square SVG fill rules to both meters and theme overrides.
- [x] Run presenter/component tests and type checking, then build the installed UI and validate assets.

### Task 3: Verify and review

- [x] Verify screenshot raster equality at display scales 1, 1.25, 1.5, 1.75, 2 and 2.625, including a fractional parent origin.
- [x] Verify live DPR changes, existing progress/fade behavior, theme rendering and mobile placement.
- [x] Inspect screenshots, run appropriate checks and obtain an independent scoped review.

## Verification record

- Added a one-device-pixel transparent SVG guard after raster tests demonstrated clipping at fractional viewport edges. Cells retain their integer positions; guard dimensions are included in the viewBox and CSS size.
- Browser checks: 20 passed, including exact RGB raster runs for equal horizontal/vertical gaps and square cells in both meters at all six display scales, live scale changes, automatic Send, restart during fade, 320px layout, Ember and Signal themes.
- Presenter/component/style checks: 22 passed. Helper geometry and subscription lifecycle were observed red before implementation and green afterward.
- Type checking: zero errors/warnings. Production build, 822 versioned asset imports and diff whitespace checks passed.
- Updated the theme style fixture from spans to the real SVG/rect geometry; independent review found no remaining source or test issues.
- The full suite's initial install-path check scanned an ignored app attachment cache. Confirmed no cache files are tracked; excluded `.codex-remote-attachments` alongside the other local-only directories. The corrected install-path test and style test rerun passed 11/11 checks.
- Full suite completed: 383/387 test files passed in that run. The initial attachment-cache failure above was corrected and its targeted rerun passed. The three remaining failures are outside pixel rendering: `ui-node-guide-content.test.mjs` missing help for `review-publish/autoApply`, `workflow-combined-systems.test.mjs` saved-example `autoApply` defaults, and `workflow-guidance-injection-compat.test.mjs` pinned definition hashes. These belong to concurrent workflow changes and are not changed by this task.

## Integration verification

The user authorized merging this work to main. The pixel-grid changes were isolated from commit 176bf71 so concurrent workflow edits were excluded. The exact merge candidate passed all 387 test files and all 20 browser checks, plus type checking, production build, 822 versioned asset imports, and whitespace validation.
