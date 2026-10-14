# Native History Checkpoint Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Work in the current codex/node-capability-improvements branch. Steps use checkbox syntax.

**Goal:** Add one explicit scoped history checkpoint that permits continued stories while retaining replay, privacy, current values and save acknowledgement.

**Architecture:** Immutable per-target archive pages plus a constant-size active history epoch/head. Existing native services query only archived identities relevant to the operation; current state/pacing stays active. Existing Workflow Data dialog previews counts and applies through opaque native handles.

**Tech Stack:** Existing JavaScript/TypeScript/Svelte and test-host tooling; no dependency.

**Spec:** docs/superpowers/specs/2026-10-14-native-history-checkpoint-design.md, approved by the user on 2026-10-14.

## Global Constraints

- No new node, provider request, implicit checkpoint, silent pruning, quota-only workaround or generic framework.
- Current values, budgets, cooldowns, repetitions, decayTimes, accepted clock/calendar/remainder remain exact.
- Missing history header is epoch0/headnull. Each archive page obeys current plain JSON limits.
- Opaque preview handles are private; DTO counts/markers never grant archive/write authority.
- Archive privacy includes checkpoint-time restrictions even after catalog visibility changes.
- Existing reviewed handles fail after epoch changes; fresh exact archived replay retains current idempotency semantics.
- Save application and durable acknowledgement stay separate; unverified application installs the native barrier.
- Use current Gaea2 flat dialog/control styles; no new global menu or styling system.
- Workers do not commit/push/revert concurrent work. Controller performs final review and authorized main push.

## Review Focus

- Old stable intent ID recreated in a fresh capture still checks archived fingerprint/conflict.
- Arbitrary authored progression identityFields and event-ID conflicts work after checkpoint.
- Unknown future clock consumed IDs are retained instead of guessed away.
- Missing/cyclic/corrupt/private archives fail closed without leaking payload in preview.
- Scope or metadata change during preview/save invalidates the operation; local unverified save remains barred.

## Task 1: Shared immutable archive functions

**Files:** Create src/workflow/document-history.js/.d.ts; test tests/workflow-document-history.test.mjs.

**Interfaces:** checked history header schemaVersion/epoch/head; checked pages schemaVersion/pageId/targetId/scope/visibility/epoch/checkpointId/previous/kind/payload. Shared retirement projection produces active content plus per-kind retired records and counts; lookup traverses checked linked pages and returns only requested receipt/turn/outcome/progression matches.

- [x] Write one linked-history lookup test with receipt identity/fingerprint; prove red, implement page/header admission and controlled lookup.
- [x] Test packing boundaries and missing/cyclic/scope-mismatched pages individually.
- [x] Test known clock/outcome/progression retirement; preserve active values/pacing exactly.
- [x] Test arbitrary ledger-named JSON remains an ordinary receipt-only document and ambiguous known schemas refuse retirement.

## Task 2: Authorized checkpoint and file replay

**Files:** file-store.js/.d.ts; native-settlement.js/.d.ts; native-persistence.js/.d.ts; focused file-store/native persistence tests.

**Interfaces:** backend load exposes optional history header; internal lookupHistory(targetId,query) returns checked matching records plus epoch/visibility. previewCheckpoint creates private handle and bounded view; applyCheckpoint checks capture, installs pages+active packet, increments revision/epoch, saves once and returns applied/acknowledged separately.

- [x] Test 256 receipts then checkpoint then another save; prove red and add preview/apply lifecycle.
- [x] Test no mutation on preview/cancel, stale capture and scope change.
- [x] Test old prepared file handle rejects new epoch before cached success.
- [x] Test fresh duplicated intent searches archived receipt and preserves same-fingerprint acknowledgement/conflicting-fingerprint rejection.
- [x] Test metadata application with unverified durable acknowledgement installs the existing barrier and keeps affected target blocked.
- [x] Test archive visibility cannot weaken to today's public catalog policy.

## Task 3: Native clock/outcome and progression identity integration

**Files:** native-story-state.js/.d.ts; progression.js/.d.ts; operations/progression-nodes.js/.d.ts; host.js and introspection adapter only as necessary; time-nodes.js capacity diagnostics; focused native story/progression tests.

**Interfaces:** shared progression query derivation uses the reducer's existing identityFor/eventIdentityFor rules. Pure reducer takes optional checked retired identity matches; a historyCheckpoint marker without authorized matches fails explicitly. Native runtime validates marker target/epoch and inherited archive privacy before supplying matches.

- [x] Test 32 accepted clock turns then explicit checkpoint then next advance; prove red and integrate archived turn lookup.
- [x] Test exact archived clock replay no-ops; changed projection conflict remains.
- [x] Test canonical past consumed IDs retire and opaque/future IDs retain.
- [x] Test archived accepted outcome is reused without redrawing; library/stakes conflicts remain.
- [x] Test progression checkpoint then new event progresses while archived authored identity duplicate does not; verify event-ID conflict.
- [x] Test all pacing fields retained and offline unverified marker refused.
- [x] Preserve bounded native capacity errors rather than generic Clock Commit failures.

## Task 4: Host API and existing Workflow Data UI

**Core API/controller worker:** Native controller exposes previewStoryHistoryCheckpoint(targetId), applyStoryHistoryCheckpoint(handle), inspectStoryHistory(targetId) using current catalog/actor authorization. Core worker owns native implementation and tests.

**UI/controller root:** src/ui/controller.js; ui/StoryDocuments.svelte; ui/storage-setup-types.ts; existing setup types if needed; focused UI/browser tests.

- [x] Connect selected-target preview action to native API; count/reason view only.
- [x] Show Apply/Cancel in existing dialog action area with pending/diagnostic/status handling and immutable archive metadata listing.
- [x] Recheck UI identity before installing awaited results; successful apply cancels stale workflow review/session.
- [x] Browser-test preview no mutation, cancel, Apply acknowledgement/unverified feedback, keyboard and narrow layout.

## Task 5: Review and integration

- [x] Run focused tests, then full repository tests/type/build/assets/browser checks.
- [x] Independent complete storage review: replay, marker bypass, visibility, CAS, archives and acknowledgement.
- [x] Correct actionable findings, rerun affected checks, update public lifecycle guidance.
- [x] Controller combines with the seven node improvements, commits and pushes verified work to origin/main.
