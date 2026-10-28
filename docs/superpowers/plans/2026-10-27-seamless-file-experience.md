# Seamless File Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ordinary workflow/file saving work with sensible defaults, optional guided filesystem setup, and one shared saved workflow identity across chats.

**Architecture:** Use a host-only file provider for ordinary SillyTavern storage and retain the checked server/native providers for existing/custom destinations. Resolve managed identities and formats through trusted runtime policy, separate shared authored workflows from chat-scoped execution data, and keep preview distinct from accepted persistence. Integrate independent provider, runtime and library work through the existing controller rather than introduce a parallel application.

**Tech Stack:** Existing JavaScript ES modules, TypeScript declarations, Svelte 5, Node.js, node:test and Playwright; no new runtime dependencies.

**Spec:** [Approved design](../specs/2026-10-27-seamless-file-experience-design.md). Product decisions D1–D5 are approved. The user authorized planning followed by implementation without further approval requests.

**Status:** Complete. See the [delivery report](../reports/2026-10-27-seamless-file-experience.md) for verification, review results and platform limits.

## Global Constraints

- Normal use must not require experimental browser flags or depend on native browser filesystem APIs being available.
- Every file-saving node offers **File handling: Replace / Append**, with Replace as the default for new nodes. Existing configured behavior is preserved.
- A saved workflow is one shared document: saving an edit updates that workflow everywhere it is used. Users choose **Save As** to create an independent workflow for a particular chat. Per-chat execution data remains isolated.
- Preview, rejection and configuration make no output writes; authoring saves may persist workflow/configuration metadata.
- Actual file outputs must produce actual files; preserve existing file authority, exact references, privacy, canonical state, receipt/history checks and migration data.
- Paths refer to the machine running SillyTavern. Respect host authorization and OS permissions on Windows, macOS and Linux.
- No new package dependencies, live-host configuration changes, real story mutations or paid model calls during implementation/verification.
- GitHub interactions use `gh` with network permission enabled. Work in the existing managed worktree on a `codex/` branch; do not alter the primary checkout.

## Verified Platform Limits and Implementation Rulings

1. Standard SillyTavern supports authenticated actual-file upload and reads, but no server-serialized expected-revision write or directory enumeration. Host-only persistence must advertise `concurrency: 'verified-write'`; the server provider advertises its actual checked/serialized behavior. Use read/check/write/verify, immutable attempted-write recovery copies and same-origin serialization, and report uncertainty rather than claim atomic cross-device CAS. A pre/post conflict check cannot exclude all cross-device races. This limitation must remain documented and visible in storage details; it is not permission to label optimistic writes atomic.
2. Host-only zero-byte files use the endpoint-supported nonempty base64 representation `=` (Node decodes it to zero bytes). Pin this against a host-equivalent endpoint fixture. If a host rejects it, retain recovery data and report unsupported empty saving rather than substitute nonempty contents.
3. A missing server component cannot install itself through its own API. The optional wizard downloads a self-contained setup bundle with Windows/macOS/Linux launchers, guides host-folder selection, explicit server-plugin enablement/restart, and rechecks capability. Headless/remote owners receive truthful resumable instructions. Test installers against temporary host trees only.
4. Shared workflows use stable library IDs, acknowledged autosave revisions and explicit Save As. Run/review snapshots retain their captured revision; remote refresh waits for idle/settlement and happens before later execution.
5. Structured Append is schema-aware. Generic JSON arrays append records; outcomes retain/add unique accepted records; clock Append retains accepted advances. Replace for specialized state checkpoints retired active history while preserving canonical current values and replay identity. Never concatenate full JSON documents.
6. Keep up to 20 prior recovery content versions per resource, preserving a last known good version. Replay archives are separate and never pruned by content-backup retention. Capacity failures preserve the live/attempted versions and return an actionable result.

## Review Focus

- Lost responses or two browsers saving the same file: retain attempted/previous bytes, detect conflicts, do not double append or claim atomic cross-device exclusion (Tasks 1, 3, 6).
- A workflow edited in another chat during execution/review: finish the captured revision, then use the newest saved definition without leaking chat data (Tasks 3, 7).
- Imported, copied, renamed and branched workflows with private state: preserve existing grants while issuing fresh managed authority where needed (Tasks 2, 6, 7).
- Optional setup absent, incompatible, denied or disconnected: internal saving remains usable and setup can be cancelled/resumed (Tasks 1, 4, 5).
- Structured Append/Replace and long histories: remain parseable, preserve replay checks, and pass 100 turns / 1,000 accepted saves without preview writes (Tasks 2, 6).

## File Ownership and Interfaces

Each task owns the files listed below and its tests. Other workers must not revert those changes. Cross-task changes to `src/run.js`, `src/ui/controller.js`, `ui/Workbench.svelte` and `ui/types.ts` belong to Task 7; workers supply exported hooks instead of editing them concurrently.

### Task 1: Host-only actual files and truthful capability routing

**Files:** Create `src/ui/host-file-store.js/.d.ts`, `src/ui/host-file-access.js/.d.ts`; modify `src/ui/node-file-service.js/.d.ts`, `src/ui/node-file-access.js/.d.ts`, `src/ui/server-file-access.js/.d.ts`; tests `host-file-store.test.mjs`, `host-file-access.test.mjs`, `node-file-service-selection.test.mjs`.

**Interfaces:**

- `createHostFileStore({fetch, getRequestHeaders, getUserId})` exposes `read(name)`, `write({name, expectedRevision, content, intentId})`, and `capabilities`; results carry content hash revision, actual host path and verified acknowledgement. Recovery object names are generated, never accepted as authority from model/import text.
- `createHostFileAccess({store, getUserId})` follows `NodeFileAccess`, with `storage:'host'`, `choose(settings)`, `snapshot()`, `backend(definitions, controls)`, subscription and ready/refresh. Persist bindings and interrupted-write records in authenticated host storage, not browser-only handles.
- `ensureManaged(definition,{scope,isCurrent})` returns a resolved definition/binding from trusted target/user/chat identity without opening a picker or creating output bytes. Route this through the composite service for Task 2's preparation; display policy may consider a resolvable managed intent Ready before its binding metadata is allocated.
- `createNodeFileService({host,server,native,getStorageMode})` preserves existing binding ownership, defaults new managed files to host storage, and routes custom choices to the enabled provider. Expose provider capability/status separately from native API availability.
- Library Task 3 consumes the raw store; runtime Tasks 2/6 consume the existing backend contract.

- [x] Add one failing host-equivalent upload/read test proving a new managed file actually exists and an accepted empty replacement has zero bytes; run it with `node --import ./tools/node-test-host.mjs tests/host-file-store.test.mjs`.
- [x] Implement authenticated no-store reads, bounded UTF-8 upload, safe ASCII physical names with separate friendly labels, exact returned-path validation and generated per-intent recovery objects; verify the test passes.
- [x] Add/run a failing conflict/retry test, then implement expected-hash checks, response verification, preserved attempts and deduplication without overstating cross-device guarantees.
- [x] Add/run a failing adapter reload test, then persist/reconstruct trusted bindings and checked metadata (reusing native backend machinery where appropriate); verify user isolation and lost-response recovery.
- [x] Extend routing tests for host default, existing native/server grants, offline versus missing service and differing provider guarantees. Run focused tests and declaration checks; report changed APIs and commit owned files only.

### Task 2: Automatic managed resources, formats and file handling

**Files:** Create `src/workflow/managed-file-policy.js/.d.ts`; modify `src/workflow/node-file-targets.js/.d.ts`, `workflow-data-defaults.js/.d.ts`, `host.js`, `operations/file-nodes.js`, `operations/time-nodes.js`, `operations/random-outcomes.js`, corresponding declarations, catalog/control descriptors and `native-story-state.js`; focused target/default/runtime tests.

**Interfaces:**

- `canonicalFileName(name, format)` returns one OS-safe canonical suffix while retaining useful interior periods.
- `resolveManagedFileNode(node,{workflowId,address,legacyDocuments,actorId})` returns a runtime copy/definition with stable scoped logical ID and valid initial contents; it does not grant imported binding authority or mutate the authored graph. IDs fit existing ≤128-character catalog rules.
- `prepareManagedNodeFiles(nodes, context)` provisions trusted defaults before `captureNodeFileTargets`, including qualified helpers; explicit legacy settings/grants remain authoritative.
- Authored managed intent is explicit and validated. Generated new writers own their automatic destination; legacy imports with omitted connected mode retain prior semantics.
- `fileHandling:'replace'|'append'` maps onto existing typed mutations and trusted clock/outcome callbacks. Existing configured mutation behavior remains valid.

- [x] Write/run a failing policy test for `SceneContext.txt` → exactly one `.txt`, JSON schema default, stable IDs through rename, and independent workflow/node IDs; implement one behavior at a time and rerun.
- [x] Write/run failing new own-writer/clock/outcomes preparation tests; provision defaults through trusted catalog/file definitions and ensure no output bytes are created during preparation.
- [x] Write/run failing format-aware append tests for text and JSON records; implement typed mutation mapping preserving exact connected references.
- [x] Write/run failing specialized handling tests; thread controls through trusted callbacks and preserve valid clock/outcome schema and history. Coordinate checkpoint support with Task 6 instead of dropping replay identities.
- [x] Verify existing explicit legacy IDs, privacy, actor selection and imported untrusted IDs cannot widen authority. Run focused suites and types; commit owned files only.

### Task 3: Shared workflow library, acknowledged autosave and Save As

**Files:** Create `src/ui/workflow-library.js/.d.ts`, `workflow-autosave.js/.d.ts`, `workflow-library-controller.js/.d.ts`; modify `src/ui/document-session.js`, `document-controller.js`, `src/state.js` and necessary tests/declarations. Supply integration hooks rather than editing Task 7 files.

**Interfaces:**

- `createWorkflowLibrary({store,serialize,parse,createId})` exposes `list()`, `read(id)`, `save({id,expectedRevision,json})`, `saveAs({json,name})`, `subscribe(listener)` with stable user-library IDs and hash revisions. Keep the library index and document versions in host storage; recover conflicting snapshots and never send partial settings payloads to the host.
- `createWorkflowAutosave({session,library,isBusy,activate,onStatus})` exposes `changed()`, `flush()`, `refresh()`, `dispose()`. Mark only acknowledged captured snapshots saved, preserve subsequent edits/conflicting drafts, and defer external replacement during run/review.
- Workflow sources support `{kind:'library',id,name,revision}`; export a library controller with `openSaved(id)`, `save()`, `saveAs(name)`, `downloadCopy()`, `beforeRun()`, view/subscription and per-chat selected identity hooks.
- Use existing host/user persistence for selection only with a verified acknowledgement; library documents are not embedded in per-chat authoring copies. Save As reuses portable-copy safety for managed data/grants.

- [x] Write/run a failing test: two chats opening one library ID see the same saved definition but retain separate selected state; implement stable shared identity/read/save.
- [x] Write/run a failing Save As test: new identity, independent edits and no accidental copied writable authority; implement copy serialization and migration adoption without merging matching names.
- [x] Write/run failing autosave tests for edits arriving during write, failed/lost acknowledgement, stale revision and user/chat switches; implement captured-token reconciliation and recovery.
- [x] Write/run a failing busy-refresh test: external revision is deferred during review/run and read before the next run; implement preflight hooks without weakening host freshness checks.
- [x] Run document/session/state/library focused suites and type checks; report hooks for Task 7 and commit owned files only.

### Task 4: Optional setup wizard bootstrap and authorized server chooser

**Files:** Create `src/ui/file-storage-setup.js/.d.ts`, `ui/FileStorageSetup.svelte`, `ui/ServerFileChooser.svelte`, `server-plugin/browse.mjs`, `tools/build-server-setup.mjs`, `tools/server-setup/*`; modify `tools/install-server-plugin.mjs`, `server-plugin/index.mjs`, `src/ui/server-file-access.js/.d.ts` after Task 1 relinquishes those files; installer/service/setup tests and `docs/server-files.md`.

**Interfaces:**

- `createFileStorageSetup({access,preferences,getHost,downloadSetup})` exposes view/subscribe, `choose('inside'|'anywhere')`, `check()`, `cancel()`, step navigation; version/access states include ready, missing, incompatible, denied and unreachable. Persist choice/progress by authenticated host/user and reverify after restart.
- Setup bundle includes the matching component and imported runtime modules, installer, platform launchers and a loopback-only authenticated setup UI. Folder selection/registration/config change requires explicit local user action. No arbitrary shell interpolation, remote exposed setup listener or automatic live-host mutation during tests.
- Server actions `roots` and `browse({path})` return bounded authorized directory/file entries without writes. Adapter exports matching methods and capability version. Chooser completion returns a selected path, not write authority; existing configure endpoint grants the scoped binding after validation.

- [x] Write/run a failing setup-state test for preinstalled/missing/denied/offline support and cancellation; implement state transitions and preference isolation.
- [x] Write/run installer tests against temporary SillyTavern trees for explicit enablement, existing unrelated plugin preservation, idempotent setup, config conflict and resume/restart guidance. Build/install the self-contained bundle in a temp tree and import its plugin entry.
- [x] Write/run failing browse tests for roots, parent traversal, symlink escape, metadata directories, non-admin access and entry limits; implement bounded authorized traversal and transport.
- [x] Build the Svelte wizard/chooser with clear local/server wording, working cancellation and keyboard labels. Provide standalone components/hooks for Task 7.
- [x] Run focused tests and types; document actual launcher prerequisites/platform limits and commit owned files only.

### Task 5: Minimal automatic node File panel and save results

**Files:** Modify `ui/NodeFile.svelte`, `ui/node-file-types.ts`, `src/ui/node-file-projection.js/.d.ts`, `src/ui/node-file-actions.js/.d.ts`, control/guide projections, `ui/OutputPreview.svelte` and related tests. Task 7 owns controller port/mount changes.

**Interfaces:** Consume Task 2 policy and Task 1 access capabilities. Extend File view with managed/custom destination, friendly type/status, readable name and File handling. Actions expose autosaved valid intent plus explicit choosing/import/export; never execute writes from a form change.

- [x] Write/run a failing panel/projection test showing a new managed writer Ready with automatic name/type and no technical setup fields; implement projection using trusted availability and policy.
- [x] Write/run a failing debounce/stale-selection test; implement configuration autosave with retained incomplete drafts, no separate Save file settings button, and stable focus.
- [x] Write/run tests showing Replace / Append on every saving node, inherited destination controls, advanced formats/path/access, and preserving existing file names when selecting files; integrate chooser/setup actions supplied by Task 7.
- [x] Replace ordinary actor IDs with familiar character selection, hide internal target/receipt IDs in readable results, and update current guidance. Preserve advanced details and privacy.
- [x] Run unit/component tests and narrow/light/dark/keyboard browser coverage after Task 7 wiring; commit owned files only.

### Task 6: Accepted-boundary history maintenance, backups and branch safety

**Files:** Modify `src/workflow/document-history.js/.d.ts`, `file-store.js/.d.ts`, `native-settlement.js`, `native-story-state.js` after Task 2 relinquishes it; native/server/host persistence adapters after owners relinquish them. Create focused recovery/history helpers and tests as needed; do not restructure unrelated modules.

**Interfaces:** Generalize checked checkpoint preparation/application behind backend `compareAndSwap` or a post-accepted safe transaction, retaining existing lookup/adopt contracts. Expose version listing/restore through dedicated recovery hooks for Task 7; never restore through untrusted graph/model input.

- [x] Write/run a failing 100-accepted-clock-turn test; compact active history near 24 retained turns at accepted commit, preserving current values and archived replay authority without preview writes.
- [x] Write/run a failing 1,000-accepted-save test with duplicate retries; checkpoint receipts before 256 and outcome records before their limit, preserving exact source/actor identity and archive lookup.
- [x] Write/run a failing recovery test; retain up to 20 prior content versions, verify scope/revision on restore and retain uncertain attempts separately. Never prune replay archives with backup rotation.
- [x] Write/run failing branch/copy/private-history tests; copy trusted branch-point state with fresh write authority, preserve existing migrations and do not delete external files on node/workflow removal.
- [x] Verify maintenance is deferred safely around pending review and concurrency changes; run focused native/server/host tests and commit owned files only.

### Task 7: Application integration, library/setup/recovery UI and complete verification

**Files:** `src/run.js`, `src/ui/controller.js`, `src/workflow/host.js` preflight hooks after Task 2 relinquishes it, `ui/Workbench.svelte`, `ui/types.ts`, `ui/Toolbar.svelte`, `ui/workspace-menu-model.ts`, new `ui/WorkflowLibrary.svelte`/recovery components; current guides/examples, fixture builders and browser tests.

**Interfaces:** Wire Task 1 provider/preferences, Task 3 library controller/autosave and preflight, Task 4 setup/chooser, Task 5 actions, Task 6 recovery. The parent coordinates adapter signatures before dispatch; do not create duplicate state owners.

- [x] Write/run failing browser tests for the first-run two-choice experience with native file APIs absent. Wire automatic host saving, optional setup and remembered preferences; keep setup issues at application level.
- [x] Write/run failing library/menu tests for New/Open saved/Import/Save/Save As/Download and acknowledged status. Mount library, setup, server chooser and recovery UI; keep the legacy global configuration absent.
- [x] Write/run shared-chat tests: save updates shared definitions, Save As stays independent, conflicting local drafts survive, external save is deferred through run/review and latest saved definition is used before paid work.
- [x] Exercise input import-copy explanation, output Open/Download, format-safe names, stable bindings on rename, portable share exclusions, isolated automatic examples, private state and cancellation.
- [x] Update active documentation/examples/help to the actual new experience, with truthful provider limitations and advanced fallback setup only. Rebuild generated examples/assets through existing tools.
- [x] Run `npm test`, `npm run check:types`, `npm run build`, `npm run check:assets`, `npm run check:examples-memory` and `npm run test:browser`; use process-spawn permission where the sandbox requires it. Inspect failures and fix meaningful regressions; do not weaken unchanged contracts to green the suite.
- [x] Obtain a fresh whole-branch review against the spec, fix material findings, rerun affected verification, and write `docs/superpowers/reports/2026-10-27-seamless-file-experience.md` with evidence/remaining platform limits. Mark the goal complete only when required work is complete.

### Task 8: Extracted example defaults and sample guides

**Execution amendment:** This is the independently owned examples/documentation portion of Task 7, extracted during integration so application wiring and safe sample preparation can proceed in parallel. It adds no product scope beyond spec section 13.

**Files:** `src/workflow/example-file-defaults.js/.d.ts`, generated `example-file-fixture-data.js`, narrow `managed-file-policy.js/.d.ts` context extensions, remastered source builders/catalog/generated examples, `ui/ExamplesBrowser.svelte`, and `docs/examples.md`, `docs/story-systems.md`, `docs/combined-system-example.md`.

**Interfaces:** `prepareExampleFileDefaults({exampleId,nodes,workflowId,actorBindings?,canonicalDocuments?,legacyDocuments?})` returns `{nodes,initialTemplates,fileOwners,actorChoices}`. Keys use `JSON.stringify([address.workflowId,address.instancePath,address.nodeId])`. Only registered explicit-open provenance may supply bundled literal templates and qualified managed ownership aliases. Application provenance is an authenticated per-library sidecar, never an imported graph ID. Private allocation uses validated host actor availability and the exact definition actor scope; public resources remain actorless.

- [x] Add a failing registered-sample virtual-read test, then implement bounded bundled templates, derived clock identities and canonical-data precedence without output writes.
- [x] Add failing shared reader/Pick/For Each/Commit reload coverage; resolve only compatible trusted managed owners and retain runtime outcome proof. Preserve explicit grants, paths, custom templates and narrower privacy.
- [x] Add failing private unavailable/remapped/swapped-role tests, then provide familiar character choices without manufacturing presence, memory or event authority.
- [x] Replace obsolete global-manager/manual-ID/JSON-paste lesson instructions, regenerate examples through existing tools and verify curriculum execution/layout. Standalone portable imports retain explicit source choice rather than gain authority from imported text.
- [x] Run focused helper/policy/curriculum suites and types, commit owned files and obtain a fresh scoped review. Parent handles current general user guides, existing browser fixture migration and final whole-branch gates.

### Task 9: Close the initial autosave integration gap

**Execution amendment:** Integration verification found that new drafts required a first manual Save before automatic shared-library saving began. This task closes the existing authoring requirement in spec section 9 and acceptance scenario 2; it adds no product scope.

**Files:** `src/ui/workflow-autosave.js`, `src/ui/workflow-library-controller.js`, narrowly required library/application orchestration changes, focused unit tests, and `tests/browser/file-experience.spec.mjs`.

- [x] Prove a newly edited, structurally valid unfinished workflow saves automatically without a manual Save and reopens from the host library.
- [x] Assign one acknowledged library identity, retain newer drafts and uncertain creation recovery, and preserve configured local bindings on ordinary adoption.
- [x] Flush/adopt before execution while preserving busy reviews, captured user/chat/document scope, shared identities, and independent Save As behavior.
- [x] Run focused tests and a real browser journey, commit owned paths, and obtain a scoped review before the final integrated gates.

## Execution Order and Coverage

Tasks 1–3 can proceed independently against the interfaces above. Task 4 follows Task 1 for shared server-adapter ownership. Task 5 follows Task 2 policy; Task 6 follows Task 2 and coordinates adapter ownership. Tasks 7 and 8 may integrate independently released interfaces while remaining reviews continue; Task 9 closes the observed initial-adoption gap. Final completion waits for all task review gates and integrated verification. Each task has a fresh implementer and a scoped spec/quality review; commits include only its owned files.

Spec sections 1–5 map to Tasks 1–4/7; section 6 to Tasks 2/5; sections 7–8 to Tasks 4/5/7; sections 9–10 to Tasks 2/3/6/7; section 11 to Tasks 1/6; sections 12–13 to all provider/migration integration; all 18 acceptance scenarios are verified by Task 7 with specialized long-run evidence from Task 6.
