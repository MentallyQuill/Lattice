# Automatic Scene Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Automatically maintain grounded scene context using the existing two-call Hermione workflow.

**Architecture:** User-authored story foundations and a source-bound scene capsule feed Assessment. Assessment returns a retrospective capsule separately from its next-turn plan; zero-call nodes stage its replacement. Opt-in effects-only acceptance saves it without changing the native reply.

**Tech Stack:** Existing JavaScript ESM, Node assert/test tooling, SillyTavern host adapter, Svelte UI descriptors.

**Spec:** `docs/superpowers/specs/2026-10-26-automatic-scene-context-design.md`

## Global Constraints

- Exactly two auxiliary model calls; no post-generation revision or paid validation calls.
- `autoApplyEffects` and `bindToChat` default false and preserve existing workflow compatibility.
- Keep generated future plans separate from persisted retrospective scene context.
- Source-bound reads preserve the actual stored snapshot/reference for CAS even when emitting reset content.
- No duplicate native swipe for effect-only acceptance; retain persistence recovery and source checks.
- Back up installed files/settings/chat before activation; private story material stays in ignored `work/`.

## Review Focus

- Swiping or editing any covered prefix invalidates derived context; appending does not.
- Cancellation, foreign writes and slow persistence cannot accept a stale effect bundle.
- Copied/new-chat metadata cannot grant foreign scope or reuse stale scene truth.
- Unchanged content and retries cannot create duplicate swipes or writes.
- Long-lived per-turn saves remain bounded and do not erase uncertain persistence receipts.

### Task 1: Automatic effects-only acceptance

**Files:** `src/workflow/host.js` acceptance/publication region; lifecycle descriptors/types/compatibility and relevant guide content; focused host tests.

**Interfaces:** New `review-publish.autoApplyEffects:boolean=false`. It selects effect-only acceptance for unchanged drafts independently of revised-reply autoApply. Reuse existing settlement source checking and recovery; expose the result as accepted/automatically applied in existing UI state.

- [x] Write one failing host test for unchanged text + staged file save + no duplicate swipe; run red.
- [x] Implement minimum effects-only acceptance; run green.
- [x] Incrementally cover default/manual compatibility, no effects, ambiguity, cancellation, stale source, persistence failure/retry and type/round-trip compatibility.
- [x] Run focused automatic publication/host/session/UI tests.

### Task 2: Source-bound derived documents

**Files:** File operation descriptors/executor, native file session/backend, a focused chat-prefix binding helper, types and focused file/host tests. Host edits limited to imports/file-session/file-operation regions, separate from Task 1.

**Interfaces:** New `read-file.bindToChat:boolean=false`. Host supplies authentic pre-generation source identity; file reads may return a distinct view snapshot while retaining the raw live snapshot. Writes through that exact reference carry trusted binding metadata. Stale data emits initial-template content for rebuilding, never as accepted truth.

- [x] Write one failing integration test for reset after a covered message edit; run red, implement, run green.
- [x] Add append-valid, swipe/delete-invalid, missing binding, copied-chat scope, malformed binding and CAS-conflict cases incrementally.
- [x] Ensure per-turn saves use bounded existing receipt/history maintenance without weakening persistence checks.
- [x] Run focused file-store/file-node/native settlement tests.

### Task 3: Expand and verify the live story workflow

**Files:** Ignored `work/automatic-scene-context/` builder, backup, generated editable workflow, story foundations and initial scene data; bounded synthetic integration tests where useful; operator documentation.

**Interfaces:** Read foundations.value and capsule.value -> Collect -> Assessment.data; existing context and anchors inputs retained. Assessment.out -> Development -> Guidance -> Generate -> Review. Assessment.out -> Select Fields(sceneCapsule) -> Format(json,single) -> Write(replace); exact Read.reference -> Write.reference. Both review and writer in runTargets.

- [x] Capture fresh saved workflow and ensure its identity and two-call form match expectations.
- [x] Author concise grounded foundations and a conservative capsule seed; extend Assessment schema/instructions and Development's consumption contract.
- [x] Enable `autoApplyEffects` on the terminal and `bindToChat` on capsule read only.
- [x] Verify actual resolver, editable/portable round trips, two deterministic model responses, capsule persistence and unchanged native text/swipe identity.

### Task 4: Integrate, review and activate

- [x] Run project tests, type checks, build/assets/install smoke; obtain independent diff review and fix material findings.
- [x] Back up installed extension files, settings and chat, then install only verified changes and activate the generated graph/documents with freshness guards.
- [x] Verify saved graph/settings/data and installed asset consistency; use read-only live inspection without generating or changing story messages.
- [x] Record verification, activation and any limitations in this plan and report concisely.

## Verification and activation record

Implemented on `codex/automated-scene-context` in the clean existing checkout. No repository commit or remote push was requested. Independent review found one stale source-marker issue on ordinary unbound writes; it was fixed and re-reviewed with no remaining blockers.

The full project run initially exposed guide-help and additive-default compatibility issues; both were fixed in production code without weakening tests or regenerating golden examples. The later full run passed 396/397 inventoried files; its sole failure was the guide file loaded before the correction. Final focused verification passed all 13 files, including the repaired guide and the newly added source-binding/compatibility files. Combined-system golden round trips passed unchanged. Type checks report zero errors and warnings. Production build, asset verification, memory-example checks and packaged-install smoke pass; the smoke test made zero provider calls.

The generated live graph resolves to 17 nodes, 15 executable stages and two auxiliary calls. Three deterministic full-host runs verified automatic scene persistence, source append validity, covered-edit reset, retrospective-only storage and unchanged native reply/swipe identity. No real model requests were used. These checks establish routing and persistence, not the prose quality of future model replies.

Installed 14 verified runtime/bundle files with a complete backup of replaced files, settings and the target chat in ignored `work/automatic-scene-context/`. Activated the saved graph and two scoped Workflow Data documents. The source-bound capsule starts empty and initializes on the next ordinary Send. The user-maintained foundations have no model writer. Reopened the actual local story and Lattice UI: enabled, maximum two requests, automatic story acceptance checked. Verified installed file hashes and saved graph after opening; all story-message bytes remain identical. The source capsule rebuilds from available foundations and recent accepted conversation after invalidation; unavailable older detail stays unknown.