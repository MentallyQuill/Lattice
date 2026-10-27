# Node file destinations design

Approved in chat on 2026-10-27. Work is isolated from the dirty main checkout.

## Intent
Replace required global Workflow Data setup with a consistent File section in the nodes that read or persist documents. Use actual user-selected disk files. A missing destination or filename produces the existing clickable Setup Required decoration above the node. Reads show their source and writes show their destination. Format/Project Document remain pure.

## Approach
Reuse the backend-independent createFileStore, native authorization and staged Apply lifecycle. A browser-local file access service owns granted native handles and a durable intent journal; portable node controls contain file settings, never handles. A captured composite catalog/backend routes configured targets to files and retains legacy chat metadata as a non-destructive migration source. The global Workflow Data dialog becomes legacy recovery, rather than required setup. The alternative of merely moving the old chat-document UI does not provide real files; a server plugin would add deployment and path authority that are unnecessary for the existing native picker model.

## Behavior
- A prominent node File section contains choose/open destination, filename, format, create/error policy, initial contents and visibility.
- Write to File supports connected-reference mode and independently configured destination mode. A connected live reference remains authoritative and is never silently redirected.
- Story Clock owns its file; Clock Commit inherits its captured destination. Outcome Commit owns its ledger; Random Pick can bind a persistent ledger. Their logical target IDs remain distinct from handle binding IDs.
- Clicking Setup Required opens the File section. Fresh nodes require explicit setup. Unavailable/revoked bindings remain actionable; execution validates access before model calls.
- Selection, preview and rejection do not write document contents. Apply checks the observed version before persisting, records per-file outcomes and blocks ambiguous writes. Persist a pending intent before writing bytes to survive a crash between file and receipt persistence.
- Imported/shared workflows keep suggested names and formats but lose local binding authority. Local authoring saves retain binding identifiers, with handles only in origin-local IndexedDB.
- Existing chat documents and history are preserved. Node migration starts from saved contents where present, without deleting or silently replacing existing files.
- Unsupported native file access is reported explicitly, without pretending a download provides durable repeated writes.

## Verification
Exercise picker cancellation/permissions, absent binding, cancelled/stale selection, filename validation, semantic serialization, portable stripping, repeated Apply, external file edits, failed/uncertain writes, interrupted intent recovery, same-file mappings, migration, inherited destinations and badge focus. Run unit suite, type check, production build, asset checks and focused browser tests with injected native file handles.
