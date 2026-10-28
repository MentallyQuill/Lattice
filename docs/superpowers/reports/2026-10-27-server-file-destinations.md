# Server file destinations implementation

## Result

New file-owning nodes accept a path and filename in Details → File. The installed Lattice file service performs filesystem access in SillyTavern's server process, without native browser file APIs or flags. Relative paths use the user's files/lattice directory; administrators may configure absolute paths outside their user-data root. Nonadministrators remain subject to checked user-root containment and all accounts to OS permissions.

Configuration creates only server binding/journal metadata. Document creation and overwrite remain part of accepted Apply. Existing browser grants keep their original backend; no legacy target is silently redirected. Missing service installation has an actual setup-guide link and a retry action that preserves entered settings. Successful own-file configuration clears Setup Required, including in the browser regression with native APIs removed.

Workflow → Configure → Legacy chat data and the global dialog/controller actions were removed at the user's explicit follow-up request. Saved canonical documents, receipts, private data, history validation and per-node migration remain intact. Current documentation points to per-node settings and the new server installation guide.

## Implementation

- `server-plugin/index.mjs` registers authenticated status/configure/load/CAS/history/adoption routes as the `lattice-files` plugin.
- `server-plugin/filesystem.mjs` adapts real paths to the existing checked journal, persists metadata per user, uses bounded UTF-8 reads and checked atomic replacement, and pins/rechecks opened file and parent identities.
- `src/ui/server-file-access.js` implements the existing backend contract over same-origin HTTP with captured user, binding generation and workflow freshness; uncertain writes are not automatically retried.
- `src/ui/node-file-service.js` routes new server files and retained native grants separately. Backend readiness is checked per captured target, including recovery after a missing service is installed.
- Path intent is optional for existing semantic defaults. Local authoring retains paths; portable exports strip machine paths and binding authority, including nested overrides.
- `tools/install-server-plugin.mjs` registers the installed extension's server component without altering config.yaml or overwriting an unknown plugin. `docs/server-files.md` covers enabling the standard server-plugin option and restarting SillyTavern.

## Review and regressions

Independent review identified unused-server readiness blocking native grants, stale initial readiness after a successful retry, combined transport envelopes incorrectly reducing the document limit, and filesystem paths changing between validation and IO. These were fixed with regressions. Transport admits separately bounded previous/next documents within a 2 MiB envelope; individual document admission remains 262,144 bytes.

Real temporary-file tests cover Unicode paths, empty replacements, missing parent creation, user isolation, symlink substitution before reads/writes, external-edit conflicts, legacy metadata adoption, restart receipts and lost HTTP replies. The lost-reply test confirms one append and one durable receipt; retry reconciles the receipt without another CAS or publication. Preview, rejection and configuration leave document bytes unchanged.

## Verification

- All **426 unit test files** verified: the final full run passed 425 files; its sole obsolete global-dialog source-extraction assertion was updated for removal and its nine-test file reran successfully. The earlier smoke dependency-closure adjustment passed in that final full run.
- All **532 browser scenarios** verified: the final full run passed 531 scenarios; its remaining obsolete Configure-menu assertion was updated to require absence and reran successfully. A prior filename-focus expectation was updated to the new primary File path field and passed.
- Missing legacy menu/dialog, preserved saved data, Recall tools and keyboard navigation also passed a focused 16-scenario browser run.
- `npm run check:types`: zero errors and warnings.
- `npm run build`: production JS/CSS regenerated; removed legacy dialog is absent from the compiled component tree.
- `npm run check:assets`: 871 versioned imports verified.
- `npm run check:examples-memory`: no changed generated examples.
- Whitespace checks passed. Visual inspection confirmed a configured server path and filename with no Setup Required banner or badge.

Evidence logs are retained in the ignored `.tmp/node-file-destinations/` directory. Tests used Node 24 and Chromium on Windows with actual temporary filesystem IO; no live story files, host settings or paid model requests were modified.

## Installation and limits

Pushing the extension does not install or enable a server plugin in an existing SillyTavern process. The operator runs the included installer, enables `enableServerPlugins` if needed, then restarts SillyTavern. No experimental browser settings are needed.

One service process serializes its operations and persists pending intent before bytes. Portable Node filesystem APIs cannot completely exclude an external process racing inside a rename; detected changes or uncertain writes remain held for reconciliation. Multiple host processes must not write the same destinations concurrently. Existing active history bounds remain 32 clock turns and 256 receipts; creating further history checkpoints is not exposed by the File panel. Existing archived history is retained.
