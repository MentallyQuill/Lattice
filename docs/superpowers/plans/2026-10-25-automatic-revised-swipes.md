# Automatic revised swipes

The user confirmed that successful post-processing should create and select a revised SillyTavern swipe automatically. The original reply must remain available. The saved Hermione workflow already runs its conditional revision path; its current terminal only prepares a manual review candidate. Seven of its 21 stages precede native generation, explaining the 33% handoff.

Use an opt-in `autoApply` boolean on Review / Publish, defaulting to false. After a successful owned Send run fully settles, apply its changed final candidate through the existing acceptance and swipe-publication path. This retains source checks, staged-effect validation, persistence, rollback and duplicate-application protection. Unchanged text does not produce an automatic duplicate swipe. Manual previews and failed/cancelled runs never publish automatically. More than one automatic terminal must not select an arbitrary result.

Compared approaches: changing publication globally would change existing manual workflows; a preference in the workflow terminal keeps the behavior with the workflow that owns the reply. The latter is the implementation choice. The user's current saved workflow will explicitly opt in after verification.

- [x] Add descriptor controls, validation and concise usage help.
- [x] Write failing integration tests for automatic revised publication, unchanged output, manual default, failure, cancellation, multiple terminals and staged consequences.
- [x] Implement automatic application after the owned runtime completes, using existing publication safeguards.
- [x] Run targeted tests, the project unit suite and type checks; review the final diff.
- [x] Update the installed extension and enable the option on the saved workflow, with a backup and verification.

Existing unrelated progress-grid edits in the shared checkout must be preserved.

Verification: 11 automatic-publication tests, 30 unified-host tests, 20 session tests, 12 compiled Preview integration tests and 4 new compatibility tests pass. Replayed the exact saved workflow with synthetic schema-valid responses: keep branch uses 3 calls and keeps swipe 0; revision branch uses 4 calls and automatically selects swipe 1. Type checks have no errors or warnings; production build, packaged-install smoke, asset checks and generated memory-example checks pass. No real model requests or chat changes were used for these checks. The full 388-file unit run passed 385 files; its three failures identified a missing guide explanation and additive-default compatibility issues. After correction, all three complete files passed the final project-runner recheck (3/3), including all 13 combined-system tests. Logs are in `.tmp/automatic-revised-swipes-*.log`. Final independent review found no remaining blockers.

Review found and fixed overlapping Send while automatic saving: new generation is aborted with BUSY, and a late old save cannot overwrite a newer result. Review also requires the UI to treat an automatically accepted candidate as applied, preserving persistence recovery where needed, so Reject cannot misleadingly claim to undo an already selected revised swipe.

Deployment uses a temporary copy of the installed UI with just this feature overlaid, so unrelated progress-grid work in the shared checkout is not deployed with it. Existing installed files are backed up before replacement.

Installed ten verified files in `F:/SillyTavern/SillyTavern/data/default-user/extensions/Lattice`, with originals in `.tmp/automatic-revised-swipes-install-backup`. All eight patched source files match the working tree; the installed bundle was built from the prior installed UI plus these changes. Enabled `review.autoApply` through the live Lattice Details control. Verified it is true in saved settings for `hermione-independent-agency-v1` and remains checked after a browser reload.
