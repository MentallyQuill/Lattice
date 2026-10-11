# Workflow file handling implementation

The approved document model is implemented on `codex/workflow-files` in the managed `workflow-files` worktree. The original checkout remains untouched.

## Product behavior

- File owns New, Open, Open Recent, Open Examples, Save and Save As. The header displays the filename and document status. Recent lists ten real file handles and rereads their current contents; Clear Recent leaves the files intact.
- Browser-native file access supplies operating-system dialogs where available. Other browsers expose Open and Download JSON. A downloaded copy does not clear the disk-save checkpoint or authorize discarding a draft.
- All replacements share Save / Don't Save / Cancel. Invalid files, failed writes, external edits and stale completions preserve the current draft. Closing the workbench retains its document and cancels pending replacement.
- Send uses the open document with the existing Arm gate. Opening never arms or runs a workflow. Legacy pre/post documents and their manual execution remain supported.
- Editable `lattice-document` JSON preserves local connection IDs, supported controls, pinned definitions, local ownership and workspace presentation. Portable sharing export remains separate and removes local bindings. Runtime results, chat and credentials remain outside the authoring file.
- Settings retain preferences, reusable subgraphs and one recovery draft. Previous collections are migrated into separate recovery choices, including invalid originals and issue descriptions.

## Removed debt

Removed the workflow selector and its view contracts/CSS, collection Duplicate/Delete actions, Workflows assignment menu/status, assigned-ID runtime lookup, per-tab Save, New-only prompt, settings graph/view registries, and competing controller save maps. Examples are detached document factories. Public document activation replaces selector-driven test fixtures. Document authority and history remain coherent across public and versioned module URLs.

Updated the current operator guides and example setup instructions. Regenerated examples preserve their prior nodes, connection bindings and pinned definition hashes: all 94 changed generated fields are descriptions, and all 70 generated outputs reproduce deterministically.

## Review and verification

Independent reviews covered storage/codec/session and integrated state/runtime/controller/UI. Addressed malformed recovery presentation, optional portable document IDs, malformed JSON envelope results, and previously silent Recent persistence failures. The controller also protects edits arriving during a save and pending replacements during close.

Full browser verification exposed shelf menus being dismissed by equal document/camera refreshes. A mounted regression now verifies preserved menu/focus for equal inputs and dismissal for actual scope, catalog or read-only changes. Updated existing interaction fixtures for the removed selector and current menu labels while preserving their behavior assertions.

The Introspection fixture pressed Escape after an incompatible drag had already ended. It now verifies zero wires and an open workspace before continuing its real typed connections and JSON round trip. A separate active-drag diagnostic exposed Canvas and the controller consuming the same Escape twice. The controller now respects an already-consumed Escape; new tests exercise the actual Canvas/controller handlers for pan, native connections and idle Close.

Native File browser regressions pass for Save As, same-file Save, dirty/cancel/discard guards, re-reading Recent, clearing the list, history reset, external-change protection and camera/close behavior. Normal and narrow File-menu screenshots were visually inspected. Native picker and writable boundaries are mocked in automated browser tests; these checks do not launch operating-system dialogs on each platform.

Final verification uses private lockfile-installed dependencies in the isolated worktree:

- The complete Node suite passed all 253 test files after the Escape fix (`npm run test`, exit 0).
- Type checking passed with zero errors and zero warnings. The shipped UI was rebuilt, and the asset check verified 508 versioned imports, a self-contained Svelte UI and one native domain module.
- The full browser sweep passed 268 of 270 cases. The two corrected Introspection cases then passed with `playwright test --last-failed` (2/2). Eight focused Introspection/Escape browser checks also passed after the production fix; no known browser failure remains.
- The new Canvas/controller Escape regression and three related Node files passed all 37 checks. An actual browser pin-drag diagnostic confirmed one cancellation and an open workspace after Escape.
- Installation smoke verification passed using a fresh copy without development UI sources or dependency files: the workspace mounted, public helpers and shared graph worked, launchers remained available, and no missing files, browser errors or provider requests were observed.

The work remains reviewable in the attached `workflow-files` worktree on `codex/workflow-files`; it has not been merged into the original checkout.
