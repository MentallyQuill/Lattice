# Lattice 0.28.0 README media

Captured 2026-10-21 from the production compiled UI with fictional practice material. No personal chats were loaded and no model-provider requests were made. These are direct browser captures of the running editor. The static Lattice logo banner remains the existing brand asset.

The README shows the combined story workspace, a successful passage-preparation result with Chunk settings, the examples browser filtered to the two new lessons, and the reply-review controls. Its two refreshed animations show searching and placing a tool, and turning a selected sequence into a reusable subgraph. The reply shown in the review still is supplied demonstration text.

## Reproduce

Use the locked project dependencies, Playwright Chromium and FFmpeg, then run:

```powershell
node tools/capture-beta-documentation.mjs --only=release
node tools/capture-beta-documentation.mjs --only=shelf
node tools/capture-beta-documentation.mjs --only=subgraph
$env:LATTICE_DOC_SHOTS = 'review-candidate'
node tools/capture-documentation.mjs
node tools/check-documentation.mjs
```

The capture tools start and stop their own local servers, block external requests, use the real menus and controls, and verify the demonstrated actions. The release take checks the 32-lesson catalog and successful zero-call passage preparation. Its pinned preview shows the composed passage text while Chunk settings remain visible. Preview is enlarged through the real pane divider. [Capture evidence](capture-evidence.json) records the checks and hashes of the selected six media files.
