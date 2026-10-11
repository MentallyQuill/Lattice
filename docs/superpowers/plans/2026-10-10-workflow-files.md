# Workflow Files Implementation Plan

> **For agentic workers:** Use test-driven implementation for each owned segment and independently review the integrated feature. Steps use checkbox syntax for tracking.

**Goal:** Replace settings-owned workflow selection with file-owned documents, preserving editing, recovery and runtime behavior.

**Architecture:** A document session owns the root, source and save checkpoint. File access and editable JSON encoding are independent modules. UI/controller integration routes all replacements through a shared guard; settings retain recovery/preferences rather than an authoring collection.

**Tech Stack:** JavaScript ES modules, Svelte 5/TypeScript view contracts, IndexedDB, File System Access API, Node tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-workflow-files.md`

## Global Constraints

- Send follows the open document when Arm is enabled. Opening a document never arms or runs it.
- Native file handles never enter SillyTavern settings.
- No settings snapshots masquerade as files.
- A failed/cancelled write never marks clean or replaces the source.
- Legacy pre/post documents remain openable and manually runnable; retirement of their engines is outside this change.
- Keep unrelated work in the original checkout untouched.

## Review Focus

- Changing the graph during an asynchronous save must keep newer edits dirty.
- Reopening a different file with the same graph ID must clear old history and authority.
- External edits and revoked permissions must preserve the current draft.
- Local files must preserve nested binding/ownership data without capturing runtime results.
- Migration must keep old documents accessible without putting them in Open Recent.

## Task 1: Document foundations

**Files:** create `src/workflow/document-file.js`, `src/ui/document-session.js`, `src/ui/workflow-file-access.js` and dedicated Node tests/types as needed.

**Interfaces:** codec `serializeWorkflowDocument(graph, workspaceViews)` returns Result<{json}>; `parseWorkflowDocument(json)` returns Result<{graph, workspaceViews}> and accepts editable/portable formats. Session `createWorkflowDocumentSession()` provides activate/current/source/capture/stillCurrent/snapshot/dirty/markSaved/change listener. File access `createWorkflowFileAccess(options)` provides native/open/save/readRecent/recents/clearRecent/removeRecent with Result data and cancelled failures; open/read return `{text, source}`, save returns `{source, downloaded}`. The file access agent may refine exact signatures before integration, notifying the controller.

- [x] Write and observe failing behavioral tests for local fidelity, unsafe/transient data, dirty checkpoints, stale tokens, cancellation/write failure, conflicts, recent persistence and duplicate identities.
- [x] Implement the pure codec/session and injected file service.
- [x] Run their targeted tests and record results.

## Task 2: Active-document state and runtime

**Files:** `src/state.js`, `src/history.js`, `src/run.js`, `src/workflow/examples.js`, `src/ui/workflow-surface.js`, `index.js`; affected Node tests and `tests/mock.js`.

**Interfaces:** export state `activeWorkflow()`, `activateWorkflow(graph, options)`, `recoveredWorkflows()`, `documentSession`; preserve `settings/save/touchGraph/commitGraphEdit/stepGraphHistory/groupMembers`. Create returns a detached document. Recovery remains separately enumerable for migration. Reset history on activation. Runtime's phase lookup returns the active document only when its mode matches; current Send mode is unified or legacy pre. Public activation sends a lifecycle event for cancellation and controller refresh.

- [x] Write failing tests for active-document execution, migration and same-ID history reset.
- [x] Implement the state/runtime replacement and detached example creation; preserve legacy engines and shelf ownership.
- [x] Port affected tests off assignment/collection assumptions and run targeted checks.

## Task 3: Document UI

**Files:** `ui/Toolbar.svelte`, `ui/WorkspaceMenus.svelte`, `ui/Workbench.svelte`, `ui/NewWorkflowPrompt.svelte` (replace with generalized prompt), `ui/GraphTabs.svelte`, `ui/types.ts`, `ui/view-types.ts`, `style.css`; component/menu tests.

**Interfaces:** Workbench `document?:{name:string,dirty:boolean,busy:boolean,native:boolean,status?:string,recents:{id:string,name:string}[],recovery:{id:string,name:string,issue?:string}[]}`; command IDs `new/open-workflow/save/save-as/download-document/open-recent:<id>/clear-recent/recover-workflow:<id>`. `documentPrompt?:{name:string}` with `documentPrompt.choose(save|discard|cancel)`. No selector/pickGraph/assignment interface. Keep graphId for graph identity where needed, content rename, fragment import, subgraph export and Run/Stop.

- [x] Write failing component tests for File commands, keyboard/nested recent menu, document status and shared prompt.
- [x] Replace collection controls and misleading help/status; keep subgraph navigation and accessibility.
- [x] Run component tests and type checks; notify controller of any interface refinement.

## Task 4: Controller integration and migration flow

**Files:** `src/ui/controller.js`, `tests/ui-file-commands.test.mjs`, `tests/browser/harness.js`, affected browser specs; documentation.

- [x] Write failing integration tests for guarded New/Open/Recent/Examples, successful/failed Save, recovery selection and current Send.
- [x] Integrate Tasks 1-3, serialize view state, keep active graph/save checkpoint consistent, and remove old selector/CRUD/save maps. Implement conflict feedback, honest download fallback and shortcuts.
- [x] Port fixtures to public activation/file-service injection and update expectations to the approved product behavior.
- [x] Run `npm run check`, regenerate `dist/lattice-ui.js`, inspect real browser screenshots and fix any regression.
- [x] Independently review the integrated diff, resolve actionable findings, and record final verification and remaining platform limitations.

## Execution record

The user explicitly approved building the recommended sequence. Proceed through implementation and review without requesting repeated design/plan authorization. Separate independent foundation/UI/state ownership permits parallel work; controller integration remains sequential.
