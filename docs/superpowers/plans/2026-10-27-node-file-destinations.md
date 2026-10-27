# Node file destinations implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver node-owned real file configuration with actionable cautions and reviewed persistence.
**Architecture:** An origin-local handle service and durable CAS backend feed the existing captured file store through a composite catalog. A shared node File panel edits declared fileTarget controls; legacy data stays available for migration.
**Tech Stack:** Existing JavaScript ES modules, .d.ts contracts, Svelte 5, Node test runner and Playwright. No new dependency.
**Spec:** docs/superpowers/specs/2026-10-27-node-file-destinations-design.md

## Global Constraints
- Keep main checkout and unrelated reasoning edits untouched.
- Never write user file contents before accepted root Apply.
- Native handles never enter graph JSON, previews or portable exports.
- Retain old chat documents/history; imported workflows never receive local file authority.
- Preserve exact live references, privacy, version checks and per-file save receipts.

## Review Focus
- Crash between disk write and durable receipt must reconcile rather than append twice.
- Export/import must not authorize local files by copied binding IDs.
- A renamed/replaced binding invalidates pending runs and stale UI edits.
- Two nodes referring to one target cannot disagree on file format or handle.
- Legacy migration must start from saved bytes, not only the initial template.

### Task 1: Native node file service
**Files:** src/ui/node-file-access.js and .d.ts; tests/node-file-access.test.mjs.
**Interfaces:** createNodeFileAccess(options) exposes ready, snapshot(), choose({mode,bindingId?,name,format}), backend(definitions,{scope,isCurrent,signal}), onChange callback. choose returns Result<{bindingId,name}>. snapshot returns plain records keyed by bindingId. Definitions are {targetId,bindingId,name,format,content,missing,visibility}. Backend exposes load,compareAndSwap,lookupHistory compatible with createFileStore. No backend operation prompts for permission.
- [x] Test picker configuration without any content writes; RED then GREEN.
- [x] Test permission/error and CAS conflicts; RED then GREEN individually.
- [x] Test durable pending journal reconciliation/replay and failure barriers; RED then GREEN individually.

### Task 2: Declared file settings and runtime routing
**Files:** src/workflow/node-file-targets.js and .d.ts; operation file/time/random modules; catalog/packages; native-settlement.js; host.js; tests/node-file-targets.test.mjs and native file integration tests.
**Interfaces:** fileTarget object defaults {}. Nonempty own target: {bindingId,name,format,missing:'create'|'error',content,visibility}; bindingId empty represents unconfigured portable intent. Logical target IDs remain existing targetId/clockId/ledgerId. Composite lease merges configured definitions and routes their targets through the disk backend. Write File destination mode is connected (default) or own.
- [x] Test validation/semantic identity/portable stripping; RED then GREEN individually.
- [x] Test own-file Write and inherited references/clock/outcome sessions; RED then GREEN individually.
- [x] Test disk persistence only after Apply, conflict and external edit handling; RED then GREEN individually.

### Task 3: Node File UI and setup cautions
**Files:** ui/NodeFile.svelte; ui/detail-types.ts; ui/NodeDetails.svelte; src/ui/controller.js; workspace-preparation.js; new projection helper; node guide/menu copy; browser/unit UI tests.
**Interfaces:** NodeFileView includes operation,targetId,fileTarget,binding status,legacy content, inherited state. NodeDetailsActions.chooseNodeFile(selection,{mode,name,format,...settings}) and saveNodeFile(selection,settings) are qualified reversible edits. Picker result is discarded when selection/revision changed. Setup field is fileTarget.
- [x] Test unconfigured/new/legacy/bound views and badges; RED then GREEN individually.
- [x] Implement prominent reusable panel, picker actions and migration from saved content.
- [x] Test badge focus, inherited destination, stale picker completion and portable import.

### Task 4: Verification and documentation
- [x] Run full unit suite, types, build, assets and focused browser checks.
- [x] Update docs with node File usage, migration and native access limitations.
- [x] Request fresh whole-branch review and fix material findings with regression tests.
- [x] Preserve reviewable worktree and report exact validation and limitations.
