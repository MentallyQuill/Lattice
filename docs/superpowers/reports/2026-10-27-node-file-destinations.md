# Node file destinations

Implemented in `codex/node-file-destinations`, based on `8e091ad`, in the isolated managed worktree. The main checkout's reasoning-control changes were not modified.

## Result

File-related nodes expose a prominent File section in Details. Users choose the actual file/destination through a native picker, name the file, choose a format and creation policy, and configure initial content and visibility. Missing names, destinations, permissions and conflicting shared settings surface through the existing above-node Setup Required mechanism. Clicking it focuses the missing field. Configured filenames remain visible above the canvas card.

Read File owns its source; Write to File supports a connected exact reference or its own destination without a separate reader. Story Clock owns its JSON file and Clock Commit shows the inherited destination. Outcome Commit owns its JSON ledger. Optional Random Pick persistence uses its selected ledger. File Input remains an imported snapshot; Format and Project Document remain pure.

The former global dialog remains as **Workflow → Configure → Legacy chat data…** for existing authorizations/history and recovery. It is no longer required to configure new file nodes.

## Persistence and migration

Native handles, scoped receipts and pending-write journals stay in origin-local IndexedDB. Node settings contain file intent and a local binding reference; portable exports strip local authority while retaining suggested names/formats. Imported clocks reconnect without replacing their authored clock identity. Independent nodes selecting one physical file share a coherent destination; choosing a different file for one separates its logical target.

Selection, setting edits, previews and rejection never write document contents. Root Apply retains the existing authorization, visibility, exact reference and version checks. A durable pending intent precedes byte writes; successful receipt recovery prevents duplicate append and clears only its matching native barrier. External modifications invalidate captured results.

Legacy migration begins with saved contents, not the old initial template. When the selected effective bytes exactly match a same-scope saved legacy document, validated scoped receipts, source binding and archived history are adopted into the local file journal. They are never exported in node settings, and unrelated files with the same logical ID do not inherit that authority. Original chat data and archives remain intact.

## Review

A fresh independent review identified six material issues. Regression fixes cover legacy canonical history/receipt adoption, imported clock identity, shared destination splitting, explicit format reconfiguration, native barrier recovery and restored permission verification without self-cancel. Additional full-suite fixes retain exact semantic/example/default serialization and avoid extra cold-opening projections.

## Validation

- Complete unit suite: **412/412 test files passed**, using the same repository test-host command per file in four isolated processes.
- Complete browser suite: **525/525 passed**, through `npm run test:browser -- --workers=4`.
- `npm run check:types`: zero errors and warnings.
- `npm run build`: production bundle regenerated.
- `npm run check:assets`: 857 versioned local imports verified; self-contained UI and one native domain graph.
- `npm run check:examples-memory`: unchanged generated fixtures.
- `git diff --check`: clean.
- Visual QA confirmed the File panel and configured filename decoration. Focused browser checks cover dark/light and narrow layouts.

Earlier full runs exposed compatibility and old-UI expectation failures; those were repaired, then the complete final suites above ran green. No live model calls or real user-file writes were used for validation.

## Limits

Native browser file access and durable origin-local storage are required. Native handles may need user re-selection after permission changes. File bytes and the local journal are separate storage systems; the pending journal reconciles interrupted saves but browser APIs cannot atomically exclude an independent desktop editor.

Disk histories currently retain at most 32 active clock turns and 256 active save receipts. Migrated archives/replay identities remain available; creating additional disk-history checkpoints is outside this change. Existing legacy chat-document checkpoint actions remain available in recovery.
