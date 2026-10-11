# Workflow files and document lifecycle

Approved direction: a single open JSON workflow document; native File New, Open, Open Recent, Open Examples, Save and Save As; removal of the workflow dropdown and collection management. Send follows the open document when Arm is enabled. Opening a document never arms or runs it. Browser-native file access is preferred, with an honest Open/download fallback where unavailable.

## Document behavior

- Show the filename (Untitled for new/examples) and modified/save status separately from runtime status.
- Save writes the current file; Save As chooses a destination and adopts it only after successful completion. A first Save uses Save As. A failed/cancelled write never marks clean or replaces the source.
- New, Open, Recent, Examples and document replacement share a Save / Don't Save / Cancel guard. Closing the workbench retains the session; it does not discard the document.
- Read and validate candidates before replacing the document. Cancellation, malformed files, missing files, revoked permissions and stale completions preserve current work. Detect external file changes before overwriting and offer Save As rather than overwriting silently.
- Open Recent lists actual files opened or saved, rereads disk, persists up to ten handles in origin-local IndexedDB, and supports Clear Recent without deleting files. No settings snapshots masquerade as files. Unsupported browsers provide Open and Download JSON; they cannot promise same-file Save or reopening by path.
- Editable JSON uses a distinct versioned local authoring envelope, preserving all supported authoring controls, local connection references, definition ownership and optional workspace presentation. Exclude credentials and transient runtime/chat/results. Accept existing portable workflow packages when opening; portable sharing exports continue removing local connection references.
- Camera/navigation changes do not create document Undo steps or modified status. Subgraph edits and authored presentation retain existing undo/freshness behavior. Reopening a document resets history even if its graph ID matches an earlier file.

## Storage and migration

- The active document session owns authored content, source and the last successful save checkpoint. Native file handles never enter SillyTavern settings.
- Keep preferences, provider configuration, reusable subgraph shelf, story documents and chat memory in their existing stores. SillyTavern may retain a clearly identified single recovery draft; recovery is not a disk save.
- Preserve old settings-owned graphs and views in migration recovery. Surface them through File > Recover previous workflows, validate entries independently and allow Save As. Preserve unreadable original data for recovery, report failures, and never reset it silently.
- Replace runtime assigned-ID lookup with current-document lookup, preserving mode validation, Arm gating, cancellation and object/signature freshness. Remove assignment UI and registry-specific cancellation watchers. Legacy pre/post documents remain openable and manually runnable; retirement of their engines is outside this change.
- Examples open detached documents. Companion examples remain reachable through the example UI/recovery choices rather than fake recents.

## UI and cleanup

- File owns document commands and shortcuts (Ctrl/Cmd N, O, S; Shift S for Save As). Remove workflow selector contracts, collection Duplicate/Delete actions, redundant root-tab Save, duplicate Examples and assignment controls. Preserve content/subgraph naming, graph tabs, breadcrumbs, fragment insertion review and subgraph export.
- Remove selector-specific CSS/unused focus helpers. Retire old collection CRUD from production after migration and replacement callers exist. Update guide/launcher copy and supported harness activation; never retain a hidden selector for tests.

## Verification

Exercise local serialization fidelity, forbidden runtime data, native picker/write cancellation/failure, same-file saves, external conflicts, dirty edits during a save, stale reads, permissions, recents persistence/removal, migration, history resets, current-document Send, and keyboard/focus behavior. Run the project test, type, build, asset and browser checks; regenerate the shipped UI bundle. Inspect the actual File menu and document status at normal and narrow widths. Keep unrelated work in the original checkout untouched.
