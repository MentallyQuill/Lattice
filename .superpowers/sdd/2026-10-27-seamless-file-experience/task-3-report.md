# Task 3 — shared workflow library and autosave

Implemented in the existing managed worktree. No dependencies, network, GitHub, live data, paid calls, or Task 7 integration files changed.

## APIs and integration hooks

- `createWorkflowLibrary({store,serialize?,parse?,createId?,getScope?})` exposes `list`, `read`, `save`, `adopt`, `saveAs`, `recovery`, `subscribe`, and `capabilities`. Use Task 1's raw host store. `getScope()` must return the stable authenticated user identity; it protects multi-request document/index operations beyond the store's per-operation checks. Library logical names are `workflow-library-index.json` and `workflow-<id>.json` within the provider's trusted per-user namespace. The index is host file data, never a partial extension-settings write.
- `adopt({json,name?})` establishes a first library identity while preserving the admitted local authoring configuration, existing explicit bindings, model profiles, and root graph identity. Ordinary Save on New/import/recovery uses adoption. Matching names never merge identities.
- `saveAs({json,name?})` generates a distinct library ID and graph ID, removes existing file binding IDs and machine paths in primitive and nested definition targets/qualified overrides, preserves model profiles/roles and privacy/actor restrictions, rehashes rewritten definition pins, remaps example metadata and retained presentation identities, and saves the new copy. Existing graph/resources remain untouched. Managed runtime ownership must use the new trusted library ID rather than imported graph fields.
- Results include `{id,name,revision,json,graph,workspaceViews,exampleMetadata?,source:{kind:'library',id,name,revision}}`. Only acknowledged writes return save success. `recovery()` exposes attempted drafts only for the current captured user scope. Raw provider recovery objects retain attempted/previous persisted bytes across reloads; the library adds in-memory attempted document recovery and never replaces a conflicting draft automatically.
- Capabilities deliberately report `{persistent:true,actualFiles:true,verifiedAcknowledgement:true,concurrency:'verified-write',crossDeviceCAS:false}`. Standard SillyTavern cannot provide atomic cross-device compare-and-swap. Document and index writes are separate acknowledged operations; a failed index update reports the saved document ID/revision with `documentAcknowledged:true` and retains the draft so the saved-but-unlisted document is recoverable. Conflict retries reread/merge the index. Provider uncertainty is never labeled atomic.
- `createWorkflowAutosave({session,library,isBusy?,activate?,onStatus?,getContext?,delay?})` exposes `changed`, `flush`, `refresh`, `view`, `recovery`, `dispose`. `getContext()` must return a stable chat/user context identity. Capture the graph activation token, context, source revision, authoring snapshot and serialized JSON before any write. Only acknowledge that exact checkpoint. Later edits remain dirty and get a follow-up debounce. Missing/lost acknowledgement and stale revision leave drafts intact. Outgoing drafts are hidden from another chat/user. Refresh reads latest host bytes, refuses to overwrite dirty edits, and defers replacement while `isBusy()` indicates execution/review. `view()` includes provider capabilities and the label `Saved in SillyTavern`.
- `createWorkflowLibraryController(env)` exposes `openSaved`, `save`, `saveAs`, `downloadCopy`, `beforeRun`, `changed`, `refresh`, `flush`, `reloadList`, `restoreSelection`, `getWorkflowIdentity`, `view`, `recovery`, `subscribe`, `dispose`. Optional ports are `getContext`, `isBusy`, `activate`, `persistSelection`, `getSelection`, `replace`, `downloadCopy`, `prompt`, `changed`, and `delay`. The download port receives portable JSON projected through existing `exportWorkflow` so writable authority is stripped. `beforeRun()` flushes captured authoring changes then reads/replaces with the latest saved revision, returning failures rather than running stale conflicting work; busy/review preflight refuses replacement. Captured active runs retain their existing token/revision until settlement. Call `refresh()` after settlement/visibility changes as appropriate.
- Supply `replace:(load,clean)=>documentController.replace(load,clean)` to reuse native/import/example replacement guards. Supply `libraryController:()=>libraryController` to `createWorkflowDocumentController`; its existing Save delegates to acknowledged library saving. `replace` is now exported by the document controller. A first-adoption activation returns its new token/snapshot so the guard can finish replacing without mistaking that authorized save for an unrelated activation. Native open/recent/import/export behavior remains available.
- `session.workflowIdentity()` and controller `getWorkflowIdentity()` return the current library source ID or the exact activation's `draftNamespace`. Task 7 should thread this through Task 2's trusted `ports.getWorkflowIdentity` hook; never use an imported `graph.id` as independent file authority.
- `createWorkflowChatSelection({getContext?,saveAndVerify})` in `state.js` exposes `get` and `persist(value,capturedContext?)`. It stores only `chatMetadata.latticeWorkflowSelection={kind:'library',id}`. It captures the chat metadata identity and chat/character/group IDs, tolerates fresh host context wrapper objects, rolls back an unacknowledged local pointer, and requires `saveAndVerify(capturedContext,{key,value}) -> Result<{acknowledged:true}>`. The existing debounce settings/metadata APIs do not count as verified acknowledgement. Wire `getSelection:()=>selection.get()` and `persistSelection:(value)=>selection.persist(value)` into the library controller; pass its independently captured stable chat/user key through `getContext`. No library graph is embedded in per-chat selection data.
- Task 7 must wire graph touch notifications to controller `changed()`, busy/run/review status to `isBusy`, run preflight to `beforeRun`, selected chat restoration to `restoreSelection`, application saved-items view to `reloadList()/view()`, and storage details to the truthful capabilities. No Task 7 files were edited here.

## Red → green evidence

1. Shared library identity test failed with missing module, then passed after host-index/read/save implementation. Separate library instances read edits to one shared ID.
2. Save As retained-presentation test failed with missing copied views, then passed after root identity/presentation remapping. Matching friendly names stay independent.
3. Autosave capture test failed with missing module, then passed after captured JSON/checkpoint reconciliation.
4. Debounce-during-write regression failed with one write instead of two, then passed after acknowledged dirty snapshots reschedule the later edit.
5. Outgoing private draft exposure failed when replacement context could see it, then passed after context-qualified recovery projection.
6. Library-controller shared-chat test failed with missing module, then passed with independent per-chat selected identities and shared authored definitions/pre-run refresh.
7. Dirty imported draft replacement test failed when first library adoption invalidated the old guard token, then passed with the returned authorized activation token/checkpoint.
8. Chat selection test failed with missing exported helper, then passed with verified acknowledgement and rollback.
9. Same-user Save As profile test failed because the general portable export removed custom profile bindings, then passed with a narrow file-authority copy transformation. Nested definition configuration/grant detachment and valid rewritten pins also pass.
10. First-adoption test failed with missing `adopt`, then passed while preserving the original explicit file binding and local profile configuration.
11. Same-captured-draft retry test failed because every retry used a new provider intent, then passed after retaining/reusing the original durable intent. The provider can now confirm a lost response without reapplying a write.
12. First-adoption retry test failed because a lost acknowledgement generated a second library identity, then passed after keeping the pending creation identity until successful acknowledgement. Explicit failed Save As retries use the same protection.

Additional assertions cover failed/missing acknowledgements, stale save revisions, user/chat switches during pending writes, retained conflict drafts, review-time refresh deferral, latest revision before a later run, graph/presentation copy independence, exact existing native replacement behavior, and no copied writable file grant.

## Verification

All ten focused suites executed independently with exit 0 using `node --import ./tools/node-test-host.mjs tests/<name>.test.mjs`:

- `workflow-saved-library`
- `workflow-autosave`
- `workflow-library-controller`
- `workflow-chat-selection`
- `document-session`
- `document-controller` (14 tests)
- `state-recovery-lifecycle` (10 tests)
- `state-document-notification` (5 tests)
- `workflow-active-document` (10 tests)
- `workflow-library-state`

Declaration-only TypeScript check passed: `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler src/ui/workflow-library.d.ts src/ui/workflow-autosave.d.ts src/ui/workflow-library-controller.d.ts`.

`npm run check:types` exited 0 with `svelte-check found 0 errors and 0 warnings`; Vite emitted the existing sandbox config-load warning. `git diff --check` passed for owned tracked edits. No full suite was run while other workers edited shared code; parent owns stable integration/full verification.

## Remaining platform/application work

Task 7 wiring/UI is intentionally reserved. Provider recovery/version retention remains owned by Tasks 1/6. Host verified writes cannot rule out every cross-device race; expose that residual limitation in storage details. A lost index acknowledgement may leave an acknowledged document unlisted and a retained draft, deliberately avoiding a false fully-saved checkpoint. The current controller provides explicit refresh/pre-run freshness hooks rather than an unbounded background poll.

## Review fixes — round 1 of 5

Read `task-3-review.md` and reproduced each finding with one incremental regression before changing behavior:

- Same-ID reopen through the delegated replacement guard failed with active text `chat a authored` instead of `saved during reopen true`. `documentController.replace(load,clean,{reloadAfterSave:true})` now reloads/revalidates the candidate after a successful guard Save and before activation. The extra read is guarded by the activation token, replacement epoch and saved snapshot, so edits arriving during it remain open. `openSaved` requests this option. Its standalone fallback also rereads after a successful Save and refuses replacement if newer edits arrive. The regression covers both delegated and fallback paths and asserts active saved text, matching current host revision and a clean checkpoint.
- Busy-transition preflight failed with `blockedRun.ok === true` after `library.read()` changed run/review state to busy. `beforeRun()` now awaits refresh, rechecks captured context and busy state, and rejects deferred freshness as `WORKFLOW_BUSY`. Background `refresh()` retains its deferred-success contract. The regression checks that execution cannot be authorized by that deferred read.
- Chat cache projection failed with cached `id-1` in chat B instead of its persisted `chat-b-selection`. Successful selection now captures `{value,context}`; `view().selected` uses it only in that captured context, otherwise projecting the current chat's `getSelection()` or null. The regression covers both another selected chat and a chat without a selection.

**Task 7 hook update:** Forward all three replacement arguments: `replace:(...args)=>documentController.replace(...args)` (or explicitly forward `options`). Omitting the optional third argument loses the library's required reload-after-guard-save behavior. Native picker commands retain the default and never reopen a picker for this check. Updated the controller declaration accordingly.

Exact covering commands and final results (each independently exited 0):

- `node --import ./tools/node-test-host.mjs tests/workflow-library-controller.test.mjs` — shared identity/chat selection, first adoption, delegated/fallback same-ID reopen, busy-transition preflight, scoped-selection assertions all passed.
- `node --import ./tools/node-test-host.mjs tests/workflow-autosave.test.mjs` — passed; captured snapshots, debounce follow-up, conflict/ack failures, context isolation and busy-refresh checks remain green.
- `node --import ./tools/node-test-host.mjs tests/workflow-saved-library.test.mjs` — passed; identity/copy/configuration/retry assertions remain green.
- `node --import ./tools/node-test-host.mjs tests/document-controller.test.mjs` — all 14 existing native/import/replacement regression tests passed, 0 failures.
- `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler src/ui/workflow-library.d.ts src/ui/workflow-autosave.d.ts src/ui/workflow-library-controller.d.ts` — passed, no diagnostics.
- `git diff --check -- src/ui/document-controller.js src/ui/workflow-library-controller.js src/ui/workflow-library-controller.d.ts tests/workflow-library-controller.test.mjs` — passed, no whitespace errors (only repository LF/CRLF normalization notices).

No UI integration files, provider code, dependencies, external services or live data were changed. No full suite was run while other tasks edit shared code.
