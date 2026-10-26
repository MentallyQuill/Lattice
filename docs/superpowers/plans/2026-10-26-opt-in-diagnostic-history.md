# Opt-in Diagnostic History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an off-by-default persistent diagnostic history for reviewing failed JSON, schema mismatches, and every retry.

**Architecture:** A separate optional private runtime sink captures bounded auxiliary completion/validation data. A host-owned capture receives an immutable user/chat/workflow origin before observers, and a dedicated IndexedDB service persists plain diagnostic summaries. A separate Run details history view exposes toggle, inspect, export and clear without granting workflow authority.

**Tech Stack:** Existing JavaScript ESM, `.d.ts` contracts, Svelte 5, IndexedDB, Node tests, Playwright. No dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-opt-in-diagnostic-history-design.md`

## Global Constraints

- Off by default; explicit boolean per-user preference. Preserve unrelated checkout changes.
- Browser-local only; 50 runs / 5 MiB per user, 256 KiB/run, 32 KiB/completion, 32 findings/error.
- Owner opt-in permits authorized private completion text in that exact user/chat; hidden/unknown scope omitted. No prompts, credentials, hidden reasoning or transport objects.
- No real provider requests or mutation of real chats. No deployment, commit or push in this task.
- Save settlement only; logging errors never affect workflow execution. Capture revocation on off/clear defeats late writes.

## Review Focus

- Origin captured before observer-induced scope changes (Task 4 host tests).
- Clear/off races with queued writes and async UI/export (Tasks 1/4 tests).
- Recovered retries retain error findings and failed output (Tasks 1/2 integration tests).
- Byte budgets preserve Unicode and explicit omission markers (Task 1 tests).
- Private output labels, hidden omission, and lack of prompt/authority leakage (Tasks 1/2 tests).

## Shared interfaces

`createDiagnosticHistory({store?, indexedDB?, onChange?})` in `src/workflow/diagnostic-history.js` returns:

- `begin(origin): DiagnosticCapture | null` (invalid origin yields null).
- `list(scope): Promise<Result<{entries: DiagnosticLog[]}>>`, newest first.
- `clear(scope): Promise<Result<unknown>>`, invalidating captures predating the clear.
- `export(scope): Promise<Result<{text:string,fileName:string}>>`.
- `discardActive():void`, `subscribe(listener):()=>void`, `status():{persistent:boolean|null,issue:string}`.

`DiagnosticCapture` has `event(event):void`, `model(event):void`, `finish(result):Promise<Result<unknown>>`, `discard():void`.

`origin` is `{userId:string,chatId:string|number,characterId?:string|number|null,groupId?:string|number|null,workflowId:string,workflowName:string,runId:string,mode:'root'|'target',native:boolean,startedAt:number}`. Scope compares user/chat/character/group, not chat name alone.

`DiagnosticLog` is `{version:1,id:string,origin,endedAt:number,status:string,error?,actualCalls:number,callBound:number,attempts:DiagnosticAttempt[],truncated?:boolean}`.

Attempts contain `{address,attempt,status?,startedAt?,durationMs?,finish?,usage?,binding?,response?:{text?:string,truncated?:boolean,omitted?:string,visibility:'public'|'actor-private'|'hidden',actorId?:string},error?,validationError?,retry?:{reasonCode:string,delayMs:number,nextAttempt:number}}`.

Runtime optional `ports.onDiagnostic(event)` receives `{type:'response'|'validation',address,attempt,text?,visibility?:{kind:'public'|'actor-private'|'hidden',actorId?:string},error?,finish?,usage?}`. This is separate from normal onEvent/recordings and never contains prompts or raw transport envelopes. Callback failures are passive. Host passes this to capture.model and regular progress to capture.event before external observers.

UI `DiagnosticHistoryView` contains `{scopeKey:string,enabled:boolean,loading:boolean,issue:string,entries:DiagnosticLog[],selectedId:string|null}`. Actions are `setEnabled(enabled)`, `select(id)`, `export(scopeKey)`, `clear(scopeKey)`; actions recheck current scope. Archived entries have no jump/apply/run actions.

## Task 1: Bounded history and IndexedDB persistence

**Owner:** storage worker. Create diagnostic-history.js/.d.ts, diagnostic-store.js/.d.ts and tests/diagnostic-history.test.mjs.

- [x] One failing test at a time, then minimal implementation: begin/finish/list with injected storage; attempts/retries; safe projections and findings; private labels/hidden omission; limits and corrupt envelopes; off/clear races; persistence failures.
- [x] Implement atomic per-user IndexedDB read/update transactions with no dependency, read/clear/export and explicit storage issue.
- [x] Run focused tests and report red/green evidence.

## Task 2: Runtime completion/validation diagnostics

**Owner:** runtime worker. Modify runtime.js, operations/model-retry.js and model-nodes.js as needed, record-data.js and workflow/types.d.ts. Add tests/workflow-diagnostic-capture.test.mjs and focused schema finding regressions.

- [x] One failing test then fix for each: separate optional raw response sink; corrected retry preserves original validation; terminal JSON/schema errors retain bounded findings; hidden/actor-private trusted marks; no sink when absent and passive sink failure; truncated response diagnosis without retry changes.
- [x] Keep public progress payloads free of raw output. Preserve existing workflow, retry, binding, actor and request budgets.
- [x] Run runtime, retry, recording, privacy and new focused tests.

## Task 3: Run details presentation

**Owner:** UI worker. Create ui/DiagnosticHistory.svelte and ui/diagnostic-history-types.ts; modify ui/RunDetails.svelte, ui/Workbench.svelte and ui/types.ts only. Add focused presentation tests/browser coverage as practical.

- [x] One failing UI assertion then implement the toggle (available with no run), explicit local/private notice, history list, per-attempt text/findings, export and clear actions. Use shared interfaces above.
- [x] Render all text escaped, no raw HTML, and clear selection across scope changes. History has no workflow navigation/apply authority.
- [x] Validate Svelte/type checks and component tests; root performs full integrated browser check.

## Task 4: Host, preference and UI orchestration

**Owner:** root. Modify host.js, run.js, state.js and src/ui/controller.js; add a small src/ui/diagnostic-history-controller.js/.d.ts if needed. Add host/setting/controller tests and integrated browser coverage.

- [x] Prove origin before observer and no capture by default with failing tests; capture scope and optional service before callbacks; forward progress/private diagnostics safely and finish exactly once.
- [x] Admit persisted boolean preference, stop/discard captures immediately when disabled, and initialize history lazily without workspace-open dependency.
- [x] Expose service and render a separate history DTO to Workbench. Guard late reads/export/clear by exact scope and generation, using existing local download patterns.
- [x] Browser test synthetic JSON failure, reload, inspect/export/clear, private notice, off state, and no provider requests.

## Task 5: Review, documentation and final verification

**Owner:** root plus fresh reviewer.

- [x] Review all task results against spec, fix findings with tests, document the toggle and local retention in operator/developer docs.
- [x] Run the full check pipeline (examples, all unit files, types, production build, asset checks and browser suite); resolve failures caused by this change.
- [x] Inspect the built history UI using synthetic data; record validation and any baseline/environment limitations.
- [x] Update plan completion and report user-facing location, verification, default-off behavior, and deployment status.

## Execution ledger

- Ruling: execute in the shared checkout and preserve all prior edits, as approved in the spec; no commits/push or live installation. A separate worktree would omit the already modified host/UI basis this feature must integrate with.
- Ruling: use independent workers for storage, runtime and presentation, with root owning host/UI orchestration and final review. Proceed under the user's explicit approval of the design.
- Storage: history/IndexedDB/revocation/retention tests passed; independent review prompted request accounting, native error detail validation, sticky write-warning and post-transform disable regressions, all fixed with red/green evidence. Default IndexedDB aborts pending transactions; injected adapters get bounded selective rollback that respects clear revisions. Final focused storage suites: 26/26 passed.
- Runtime: 244 expanded regressions and 32 final connection/capture checks passed. Authorized Character Direction scope regression changed hidden to correctly labeled actor-private, with 29 focused checks passing. Implicit actor state without a trusted scope remains omitted.
- UI: 8 new component checks, 47 detail-panel checks, 11 diagnostic message checks passed. Integrated browser test passed reload/export/private scope/escape/clear and geometry checks; production bundle rebuilt. Root visually inspected narrow private output screenshot.
- Integration: default-off reading of existing settings must not materialize a setting or trigger a save; it uses strict `=== true`. No unsolicited migration was retained. Saved history publishes independently of cached live canvas projection. Initial full unit failures in these areas were reproduced and affected suites passed after fixes.
- Ruling: reserve at most 512 KiB for one serialized eviction rollback and limit a user's active captures to 18, keeping these buffers within the 5 MiB allowance. An adapter that honors abort needs no rollback; fallback restoration gives newer completed records retention priority.
- Independent reviewer rechecked all four findings after fixes: no remaining blocking findings; 30 focused history/store/UI-controller tests passed.
- Final verification: fresh `npm run test` passed **396/396 test files**; full `npm run test:browser` passed **509/509 tests**; the diagnostic-history browser test passed again after the final storage fixes. `check:examples-memory`, `check:types` (0 errors/warnings), `build`, `check:assets` (827 versioned imports), documentation checks and `git diff --check` passed. The full check pipeline's constituent commands were run separately so build/browser verification could overlap independent unit work.
- Final state: implementation, review, documentation, production UI assets and verification complete in the repository. No commits, pushes, provider requests or live SillyTavern installation changes were made. Existing unrelated checkout edits were preserved.
