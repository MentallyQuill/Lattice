# Task 5 implementation report

## Scope and result

Implemented the node File panel, pure display projection, qualified configuration actions, narrow NodeDetails duplicate-control filtering, current file-node guide copy and readable save results. No controller/run/state/Workbench/host/core-policy/adapters/server files were edited by this task. The implementation consumes Task 1 provider metadata and Task 2 managed intent; rendering never calls ensureManaged or writes output contents.

The ordinary panel presents a friendly name, read-only automatic type, status, and Replace / Append for every saving node, including inherited connected writers and Clock Commit. Advanced contains destination, specialized mutation, custom path/format/creation/access details and capability guidance. Initial schema templates remain automatic; the separate Save file settings button, ordinary raw formats/paths/initial JSON and actor IDs are removed. Existing explicit file grants and working legacy catalog/chat data are preserved. Existing saved files are not renamed or converted by editing a label/type/path. Managed friendly labels autosave independently of the original physical name; format changes and external physical-name/path changes require an explicit new destination.

Configuration autosaves after 280 ms of valid quiet input. Inputs retain focus and remain editable while an acknowledgement is pending. Incomplete and selection-switched drafts remain local. Settings changed elsewhere pause a retained draft rather than overwrite the newer destination; Use current settings explicitly discards that draft. Async feedback is scoped to the selected document/node. No output-byte API is called by this panel or saveNodeFile.

Character-private selection uses trusted familiar names. An existing private actor missing from the current list remains selected as Previously selected character (unavailable); it never silently becomes public. Existing specialized mutations remain in Advanced, while generic duplicate fileHandling/mode/destination/actor identity controls are filtered only when a File view owns them.

Accepted save consequences use targetLabel/name when supplied, with a neutral File N fallback. Technical target/receipt IDs are inside collapsed Details. Recorded staging receipts present Ready to save and explain Apply, retaining their exact diagnostic payload inside Details and Source.

## Observed red/green work

- Managed projection test first failed on missing managed/friendlyName/type/status fields; implementation passed. A working legacy-source expectation was deliberately updated from mandatory migration setup to Ready.
- Managed-intent autosave first failed validation; it now saves only managed/name/format/missing/visibility and strips binding/path/content authority. External rename now returns FILE_COPY_REQUIRED without committing.
- Ordinary panel test first failed because File type did not exist; panel implementation passed for writer, clock, outcomes, pick and inherited Clock Commit handling.
- Debounce/draft test first failed when an incomplete old-node name leaked into a new selection; isolated draft restoration fixed it. Separate later tests observed and fixed overwriting a remotely changed destination, both while selected and after returning to a cached draft.
- Migration-helper test first failed because the helper did not exist; its trusted-absence guards now pass.
- File-control/content-caution test first failed on missing exports. Writer Text xor Records caution is now separate from healthy file-storage readiness.
- Readable settlement and staging-receipt tests each first failed on missing readable result markup; Details-backed presentation passed.
- Device-import affordance first failed on its missing button; explicit click-only import hook passed without native/custom support.
- Real native-selection name validation first exposed that an unnamed generic reader could not choose; a safe picker hint now permits opening and preserves the actual chosen filename.
- Provider availability test first failed because host support incorrectly made an existing native grant appear supported; provider-specific capability projection fixed it.
- Self-review added two related authority regressions observed failing together: a display-only resolved server path retired its original grant, and primary-host selection lost explicit native routing. Both are fixed and pass.
- Returning to a configured own destination first failed because the panel replaced its saved grant with managed intent; ownFileConfigured now preserves it.
- Existing guide coverage exposed missing fileHandling help; the new description passes all operation/mode guide checks.

## Task 7 integration contracts

### Projection inputs

projectNodeFile(node,state) accepts trusted providers (service.providers), hostSupported/managedSupported, nativeSupported, serverSupported, provider availability, bindings, actors: [{id,label}], workflowId and qualified address. Supply declared inputFormat/inputKind/inputColumns for the selected writer; infer format from declared ports/configuration, never model prose. Host availability is independent of native availability. Managed projection uses pure resolveManagedFileNode only; display fallback workflow identity is not execution authority.

nodeFileContentIssue(view) returns {code:'MISSING_INPUT',field:'text',category:'connection',message} when a new fileHandling writer has neither Text nor Records, or both. Integrate it into workspace readiness as a connection caution. nodeFileSetupIssue remains storage setup only, so a managed destination can be Ready while its content connection needs attention.

managedNodeFileMigration(node,{hasCanonicalData:false}) returns a managed fileTarget intent or null. The false must be established by trusted catalog/chat/runtime state. It adopts only eligible own writers/specialized nodes with no grant, no nonempty external path and no nonempty template, preserving name/format/missing/privacy. Unknown/present canonical data, grants, real paths and nonempty templates prevent adoption. Apply its result through the normal qualified authoring/runtime migration boundary before displaying it as managed; projection does not falsely mark an unapplied migration Ready.

### Actions and chooser/import boundaries

NodeFileActions now includes createNodeFileCopy(selection,settings), openNodeFile(selection), downloadNodeFile(selection), importNodeFile(selection) and setupNodeFiles(), alongside chooseNodeFile, saveNodeFile, editControls and refreshNodeFiles. Advanced itself is a native disclosure, not a global mount. All human picker/import callbacks begin synchronously in the button click.

createNodeFileActions ports:

- choosePath({mode:'open'|'save',name,path?,format}) -> Promise<Result<{path:string}>>. Called for host/server selection before access.choose, so Task 7 can mount Task 4 ServerFileChooser, invoke optional setup, return the selected authorized path or cancellation, and preserve the captured selection. A chosen server path routes through the composite provider; existing native grants explicitly route native.
- openFile(captured,selection), downloadFile(captured,selection), importFile(captured,selection) -> DetailEditResponse. These are trusted host/UI boundaries; export/open inspect the actual authorized file. Import must prompt for the input file, validate its declared format, store an authorized input copy, check the captured current selection and commit without embedding private file bytes in shared/portable workflow authoring. The panel exposes Import from device with the explicit independent-copy warning, regardless of native or custom server capability.
- capture/isCurrent/commit/access retain their existing qualified contracts. Returned action hooks cannot replace capture/commit freshness checks at these host boundaries.

Supply receipt targetLabel/name from trusted resource metadata for meaningful settlement labels. Without it the readable result says File N; raw target/intent IDs still remain available in Details.

## Verification

Final focused results:

- node-file-projection: 21/21 passing.
- node-file-actions: 13/13 passing.
- node-file-panel (compiled actual Svelte tree): 9/9 passing.
- ui-preview-tabs (compiled actual OutputPreview tree): 11/11 passing.
- ui-node-guide-content: 10/10 passing.
- Additional covering checks: ui-node-guide-preview 13/13, node-file-canvas 2/2, workflow-node-file-integration 17/17.
- npm run check:types: 0 errors / 0 warnings.
- npm run build: successful. Generated dist assets deliberately remain for the parent’s final integrated build/commit, outside this owned-file commit.
- npx playwright test tests/browser/node-file-settings.spec.mjs: final 5/5 passing against the rebuilt application bundle. Covers real qualified reader choice/name preservation with no output writes, inherited handling, external-name copy protection, unsupported-browser Advanced guidance, keyboard disclosure and 220/340 px dark/light layouts. Narrow and light screenshots were visually inspected and have no horizontal overflow.

Node --test and initial npm/Playwright subprocess launching hit sandbox spawn EPERM; direct in-process node fixture runs worked, and permitted process escalation allowed the checker/build/browser harness. No dependencies, live SillyTavern configuration/data, paid calls, network or GitHub actions were used.

The first browser run used an old generated bundle and was not accepted as evidence. After rebuilding, one test incorrectly expected Advanced to stay closed after deliberately clicking a readiness shortcut that opens its target; selecting the card normally corrected the test. The final rebuilt run passes all five journeys.

## Material limits and remaining integration

Task 5 is an implementation segment, not a claim that the new application host flows are wired. Task 7 still must supply/mount the trusted host/provider, chooser/setup, import/open/download/copy actions, actor list, declared writer input hints, safe old-node adoption and content-caution readiness. Managed host allocation, cross-chat persistence, actual imported-copy bytes, host open/download and conversion acceptance need integrated journeys after those ports are wired; no mocks are claimed as completion evidence for those flows.

Existing tests/browser/workflow-data-details.spec.mjs still encodes the removed Filename/Actor ID/Initial content/Save file settings and forced-migration journeys. Task 7 owns migration of those full legacy application fixtures and the stable full-suite final run. The parent has been notified.

No output files or private data were changed or deleted. Other agents’ files and the shared index are not staged or reverted. Self-review covered provider selection, explicit grants, managed-intent stripping, privacy, stale drafts/selection, inherited handling, original-resource preservation and result identifiers.

## Task 5 fix round 1 — reviewed P1 autosave acknowledgement race

Addressed the P1 in task-5-review.md. The original pending !== save exemption accepted every incoming configuration while saving. The actual-component regression starts a managed writer save for Local first, types Local newer while that promise is pending, publishes Remote destination.txt with hidden visibility, and then resolves the older acknowledgement. Before the fix, running `node --import ./tools/node-test-host.mjs tests/node-file-panel.test.mjs` produced **9 pass / 1 fail**: the new test observed **2 saves instead of 1**, with the assertion identifying the unwanted public-visibility overwrite.

NodeFile now records the exact submitted settings with the captured selected-node scope and epoch before invoking saveNodeFile. A stable settings key compares binding, canonical managed name, path, type, missing-file policy, initial template and exact visibility/actor identity. Managed suffix normalization is the only name normalization; unrelated binding/path/privacy changes are not treated as acknowledgements merely because an operation is pending. The action still receives the captured selection revision through its existing qualified contract. An incoming configuration exempts conflict detection only when it exactly matches this scoped submission; any other change pauses the dirty draft. A successful older response cannot mark a conflicted draft clean or delete its retained local work. Failed requests and selection changes invalidate their expected acknowledgement, and an observed configuration transition consumes it.

A positive actual-component regression publishes the exact own canonical Local first.txt configuration while Local newer remains edited. It confirms that the own acknowledgement does not create a false conflict and that only this legitimate case permits the next Local newer autosave. Current saveNodeFile configuration autosave does not allocate or replace grants; an unexpected server-binding change therefore pauses for reconciliation instead of receiving a blanket pending-save exception. No action or host-boundary contract changed.

Self-review found an adjacent way for the same conflict to be lost: editing a paused draft updated its cache baseline, then switching selections restored it without the pause. A separate component test was observed **red (1 unwanted save instead of 0)** before adding the explicit stale flag to retained draft snapshots. The cache now preserves a remote conflict through further editing and selection switches, while exact own acknowledgements advance a non-conflicted draft baseline safely.

Final commands and results for this fix:

- `node --import ./tools/node-test-host.mjs tests/node-file-panel.test.mjs` — **12/12 pass**, including the requested pending-two-edits/hidden-remote/old-ack regression, the exact-own-ack positive case and cached-conflict retention.
- `node --import ./tools/node-test-host.mjs tests/node-file-actions.test.mjs` — **13/13 pass**.
- `node --import ./tools/node-test-host.mjs tests/node-file-projection.test.mjs` — **21/21 pass**.
- `npm run check:types` — **0 errors / 0 warnings**, using the previously permitted local process escalation for Vite/esbuild.
- `git diff --check -- ui/NodeFile.svelte tests/node-file-panel.test.mjs` — exit 0 (line-ending notices only).

Only ui/NodeFile.svelte, tests/node-file-panel.test.mjs and this report changed in the fix. No controller/run/adapters, generated assets, dependencies, live host data, paid calls or external network/GitHub activity were touched. Parent Task 7 retains the integrated build/browser/full-suite final verification. Re-review this fix from a82b9db using the scoped owned-file diff.
