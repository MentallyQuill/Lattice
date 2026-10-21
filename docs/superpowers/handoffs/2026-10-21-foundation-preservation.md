# Restore the preserved full-memory build

This is a recoverable development snapshot, not a verified product release. Keep this entire preservation directory before archiving or removing the original memory-examples-028 worktree. Nothing here needs credentials, a model call, a live chat, or SillyTavern execution.

## What to retain

- `full-memory-checkpoint.bundle`: standalone Git bundle with all history needed by ref `codex/memory-build-preserved-20261021` at commit `5f1e2c4ca3a727ec95c8b7dca9e1facb3a38bcd7`.
- `preserved-files.zip` and `preserved-files-manifest.json`: exact-byte owned source and selected ignored evidence, deduplicated by SHA256. This protects original line endings as well as semantic Git content.
- `frozen-assets-supplement.zip` and its manifest:53 verification assets omitted by the initial text-extension filter, including editor Svelte files. This supplement is required.
- `checkpoint.json`, `restore-verification.json`, `restore.py`, `ARTIFACTS.sha256`, inventory/index/patch files and this guide.

The original source branch remained `codex/memory-examples-028`, HEAD5b2ae796f59209665e48a43240d42db3c6ecd488. Capture used an alternate index and a separate ref, preserving the original Git index and working state. The archive includes2039 owned source files and12666 supplementary evidence files across the main archive and supplement. Browser profiles, node_modules, credentials and unrelated personal-chat artifacts were outside the selected evidence scope. A credential-pattern scan reported no matches in selected source/evidence; it is not a comprehensive security audit.

## Check integrity

From this directory, inspect `ARTIFACTS.sha256`. Each line is `sha256  relative-filename`; compare with `Get-FileHash -Algorithm SHA256`. The restore program also checks the bundle and both data archive hashes against the recorded metadata before accessing a destination.

## Restore independently

Use Git and Python3.12+ on Windows. Choose a destination that does not exist. For example, from this preservation directory:

```powershell
python .\restore.py --destination 'C:\Users\Keptin\.codex\worktrees\restored-memory-build\SillyCanvas'
```

The program clones the local bundle, restores exact archived bytes including selected ignored evidence and the required supplement, validates all14705 file entries, and checks the frozen source/archive/fixture hashes. It refuses an existing destination instead of overwriting one. It does not install dependencies, start the application, modify another checkout, or run tests/models.

To recheck the existing verified restoration without rewriting or recloning:

```powershell
python .\restore.py --destination '.\restored-checkout' --verify-only
```

Expected: `status: RESTORE_VERIFIED`, checkpoint5f1e2c4...,14705 verified entries,1437 baseline rows,35 archive overlays,0 hash failures. `last-restore-result.json` records the latest check. Relative destinations resolve against the shell's current directory.

## Continue development safely

The bundle creates a standalone repository at the chosen destination. Create a new development branch before editing. Reinstall locked dependencies with the project's supported Node.js runtime (Node24+); node_modules and browser engines were deliberately not archived. Consult the preserved research, plans and progress notes to distinguish passing component evidence, rejected candidates and known failing full-process source recovery. Do not treat this checkpoint as a release or assume the ultimate systems pass end-to-end.

The ignored archive is local evidence, not material for public release packages. Preserve concise sanitized findings and exact artifact hashes in repository reports. Keep the original development line available until the foundation release and later continuation are secured.
