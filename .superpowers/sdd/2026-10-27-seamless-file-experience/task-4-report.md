# Task 4 report — optional setup and authorized server chooser

## Result and integration contracts

Implemented standalone setup state/components, API-v1 compatible chooser transport, read-only bounded browsing, a downloadable self-contained setup ZIP, and explicit local installation. Task 7 still owns application/controller wiring; no run/state/controller/Workbench/types/native/host adapter files were edited by this task.

`createFileStorageSetup({access, preferences, getHost, downloadSetup})`:

- `access`: ServerFileAccess, with `refresh()` and authenticated `serviceVersion`.
- `preferences`: raw HostFileStore-compatible `read(name)` / verified `write({name, expectedRevision, content, intentId})`. Setup never sends host settings payloads. Names hash hostId+userId and the raw store further scopes to the authenticated user. Only acknowledged writes advance the preference revision.
- `getHost()`: `{hostId:string,userId:string,local?:boolean}|null`. Call `check()` after identity changes; startup and reopening always reverify capability.
- `downloadSetup()`: injected async callback that downloads the installed extension's `assets/lattice-file-setup.zip`. The integrated controller supplies it.
- Returns `ready`, `view()`, `subscribe(listener)`, `open()`, `choose('inside'|'anywhere')`, `check()`, `cancel()`, `next()`, `back()`, `download()`, `dispose()`.
- View: `{open,choice:null|'inside'|'anywhere',effectiveMode:'inside'|'anywhere',status:'checking'|'ready'|'missing'|'incompatible'|'denied'|'unreachable',step:'choice'|'download'|'install'|'restart'|'verify'|'complete',hostId,userId,local,error,preferenceError}`.
- Compatible existing support skips download/install. Cancel retains progress; effectiveMode remains inside until an anywhere choice has verified compatible support. Saved choices suppress repeat first-run prompts. Host/user switches restore separate preferences.

`FileStorageSetup.svelte` props: `{setup:FileStorageSetup,onclose?:()=>void}`. It renders while `view.open`; `setup.open()` reopens settings and checks capability. Remote wording identifies the server and explains host-owner involvement.

`ServerFileChooser.svelte` props: `{access:ServerFileAccess,mode?:'open'|'save',name?:string,onselect:(path:string)=>void,oncancel:()=>void}`. Completion yields a path only. The caller must use the existing configure/choose operation to validate and issue the scoped binding. The chooser itself never creates/overwrites a file.

`ServerFileAccess` adds:

- `serviceVersion`: `{apiVersion:1,chooserVersion:0|1}|null`. Existing API-v1 services remain usable for checked files; chooserVersion 1 also requires advertised configure/load/cas/history/adopt/roots/browse operations. The optional wizard requests the matching chooser capability.
- `roots()` → Result `{chooserVersion:1,roots:{name,path}[]}`.
- `browse({path})` → Result `{chooserVersion:1,path,parent:string|null,truncated:boolean,entries:{name,path,kind:'directory'|'file'}[]}`.
- HTTP 401/403 → FILE_SERVICE_DENIED; unsupported protocol → FILE_SERVICE_INCOMPATIBLE; 404 status → FILE_SERVICE_REQUIRED; connection failures remain unavailable. Chooser replies are bounded and validated before display; every request captures the current authenticated user and uses host request headers/same-origin credentials.

The server advertises API1/chooser1 and registers authenticated POST roots/browse in the supplied host router. It reuses ownerFor/checkedPath/physicalPath authority. Listings stream at most 400 candidates and return at most 200 authorized regular entries. No writes, no bindings, no symbolic-link entries, metadata exclusions, denied lexical parent traversal and non-admin root confinement. Admins get the current filesystem root and can enter other drive/mount roots explicitly.

## Setup bundle and installer

`node tools/build-server-setup.mjs` builds `assets/lattice-file-setup.zip` (84 entries at fixture verification; 85 at the final regeneration after concurrent runtime additions). It packages the matching component and complete discovered static/dynamic literal JS runtime imports, package.json type:module, SHA256 runtime manifest, installer/helpers, local setup HTML/server, README and Windows/macOS/Linux launchers. No new dependencies.

The installer copies runtime modules into `plugins/lattice-files/runtime` and uses a relative plugin entry. It verifies the manifest when present, verifies copied bytes and imports the installed entry. It does not depend on an extracted Downloads location. Importing installer/setup modules has no launch/mutation side effect.

`installServerFilePlugin({sillyTavernPath,extensionPath?,enableServerPlugins?:boolean})` returns `{pluginDirectory,entry,enabled,configBackup:null|string,requiresRestart:true,verified:true}`. Enablement requires explicit `true` or CLI `--enable-server-plugins`. It preserves other config entries/comments/newlines/plugins, retains an exclusive config backup, refuses ambiguous flags/aliases/duplicates/nested/quoted keys/flow-root config and refuses symbolic-link destinations or unmanaged existing plugin directories. Repeat setup is supported. The host owner restarts SillyTavern explicitly.

`startSetupServer({openBrowser?:boolean})` returns `{url,token,address,close()}`. It binds only IPv4 127.0.0.1 on an ephemeral port. Mutations require a random 256-bit token, exact local Host and permitted Origin, JSON and bounded bodies. The fragment token is cleared from the URL after loading. No CORS permission is given. Setup expires after 15 minutes. Folder dialogs run only from an explicit authenticated local button; launch commands use fixed executables and argument arrays without a shell. Tests set `openBrowser:false` and never request the folder-dialog endpoint.

## TDD evidence

1. Setup state tests first failed with missing exported factory; implementation passed installed/missing/incompatible/denied/offline, cancel, restart, host/user isolation and unacknowledged preference cases (3 tests).
2. Browse tests first failed FILE_OPERATION_UNKNOWN instead of roots/listing/denial; implementation passed read-only bounded listings, metadata/traversal denial, user mismatch and symlink escape (2 tests).
3. Adapter tests first failed missing serviceVersion and FILE_SERVICE_RESPONSE instead of denied; implementation passed capability negotiation, authenticated chooser requests, older API1 support and denied/incompatible statuses alongside 15 existing adapter tests (17 tests).
4. Installer tests first failed the old external file-URL entry, absent explicit flag change and accepted symlink destination; implementation passed stable runtime imports, config backup, unrelated-plugin preservation, idempotence and unsafe path/config rejection (3 tests). A subsequent flow-root config rejection test failed before the guard was added and then passed.
5. Bundle/local setup tests first failed missing buildServerSetup/startSetupServer exports. Actual PowerShell Expand-Archive extraction into a TEMP folder, install into a fake TEMP host, extraction deletion, and stable plugin import passed. Loopback/token/origin and explicit config-change test passed without launching a GUI (1 each).
6. Svelte component tests first failed missing components, then caught redundant accessibility roles; roles were removed. The tests passed remote-machine first-run choices/cancel and browsed file selection returning only a path (2 tests).
7. Focused suite caught the preexisting exact route list assertion after roots/browse were added; the assertion now includes the two authenticated routes and passes.

## Fresh verification

- `node tools/test-all.mjs server-file file-storage server-setup`: **10/10 test files passed**. Includes new setup/component/browse/bundle/local tests and existing adapter/installer/portable/service/workflow-server integration tests.
- `npm run check:types`: **0 errors, 0 warnings**, with Vite loading normally under process permission.
- `git diff --check -- <owned tracked paths>`: clean (only Git's informational LF/CRLF conversion warnings).
- ZIP fixture initially encountered sandbox spawnSync powershell.exe EPERM; rerun with process permission succeeded. Every test host/extraction folder was temporary and cleaned; no real SillyTavern instance/configuration/story was changed, no GUI launched and no paid calls made.
- Full project suite/build/browser wiring remain the parent integration gate after concurrent runtime changes settle, as instructed by the parent. No full-suite success is claimed here.

## Rulings, self-review and actual platform limits

- Ruling: inject the already verified raw host store rather than writing host settings. This gives authenticated host/user persistence and acknowledges real saves without partial settings payloads.
- Ruling: retain compatibility with older API1 for existing file operations, while requiring explicit chooserVersion/operation advertisement for first-run wider-location readiness. Detecting an arbitrary status endpoint is insufficient.
- Ruling: refuse uncommon/ambiguous YAML rather than ship a partial YAML parser or add a dependency. The host owner can make the single standard top-level boolean edit and resume.
- Source/module copy and extracted-bundle import were executed on Windows only. macOS/Linux launcher contents and argument construction were inspected; those desktop launchers and native dialogs were not executed on this Windows host. Node 20+ must be on PATH (and meet the actual SillyTavern release requirement); the repository tests ran on the supplied Node runtime. Linux native selection needs Zenity; manual folder selection remains available otherwise. macOS may require normal downloaded-script approval/execution permission.
- Remote/headless/container setup truthfully requires the host owner or persistent deployment volume. No browser-to-remote-desktop dialog is promised. OS permissions and host administrator restrictions remain authoritative.
- The manifest checks source consistency/corruption, not independent cryptographic publisher authenticity; the bundle comes from the installed Lattice extension.
- The setup installer should be run while preparing a host restart; it does not offer a transactional live reload of an executing plugin. Normal host-only saves continue while optional setup is pending.
- ZIP must be regenerated after final shared runtime edits (especially Task6) and before release. Parent has been notified to integrate the builder into the release/build sequence and supply the extension-relative download callback.
- Self-review covered identity capture, no output writes during chooser/configuration, bounded directory/transport data, metadata/symlink confinement, token/Origin/Host checks, non-shell launchers, config backups, unmanaged-plugin preservation, runtime independence from Downloads, and explicit restart completion check.

Shared server-plugin/index.mjs and src/ui/server-file-access.js/.d.ts are released to Task6 after this scoped commit; no further edits to those files by Task4.

## Review fix round 1 — scoped changes after 0bca2f8

Read `task-4-review.md` and reproduced all three P2 findings against the owned installer/state/component paths. Shared server-plugin/index.mjs and server-file-access files were not changed in this round.

1. **Actual configuration line:** added `explicit enablement changes the active config line and preserves matching examples in comments`. Its first form accidentally used different comment/active suffixes and passed, so it was corrected to the review's exact repeated active-text scenario before changing production code. `node tests/server-file-installer.test.mjs` then failed with the example comment changed to true and active flag still false. The installer now records the validated line index, updates only that line while preserving CRLF/comments, validates the generated active flag and verifies the saved flag. The same command then passed 4/4 tests.
2. **Failed update recovery:** added `an invalid source update leaves the previous working runtime, entry and configuration intact`. `node tests/server-file-installer.test.mjs` failed because the installed runtime contained `export const info = ;` after the rejected update. Installation now builds the complete package/runtime/entry in a separate unique sibling staging directory, verifies copied bytes and imports that staged plugin before moving the previous plugin. Publication retains the old whole directory until the new plugin and explicit config change succeed; failures restore the old directory. Config publication uses a prepared temporary file and rename, with its existing backup retained. The same command then passed 5/5 tests.
   - Added fault injection covering staging write failure, staging-to-plugin publication failure and configuration publication failure. All retain/restore exact previous runtime/entry/config bytes.
   - Self-review found that a failure during rollback could trigger old-backup cleanup. Added `a failed rollback retains the prior plugin backup for host-owner recovery`, observed ENOENT for the previous backup with `node tests/server-file-installer.test.mjs`, then gated previous-directory cleanup on successful completion. The command passed 7/7 tests. Failed rollback reports an AggregateError naming retained previous-plugin/configuration backup locations.
   - Every recursive staging/previous cleanup resolves and validates an absolute direct child of this host's `plugins` folder, checks its fixed generated slot name and rejects symlink destinations before the native Node filesystem operation. No shell-based deletion/moving is used. Publication/rollback moves also validate both absolute slots.
3. **Reopen storage choices:** added `reopening completed setup offers both choices and can switch back to inside saving` using the real state controller and compiled component. `node --import ./tools/node-test-host.mjs tests/file-storage-components.test.mjs` failed because the completed settings rendered no inside-choice button. `open()` now waits for initial readiness, reopens completed setup on the choice step and rechecks capability without replacing that visible choice step with completion. Pending wizard steps remain unchanged. Component test now selects inside, verifies effectiveMode/closed state and the persisted inside preference. Added an assertion that reopening an unfinished restart step preserves it.

Exact final covering verification:

- `node tests/server-file-installer.test.mjs`: **7/7 tests passed** (comment update, invalid source, injected write/publication/config failures, failed rollback backup, existing preservation/idempotence/config/symlink checks).
- `node --import ./tools/node-test-host.mjs tests/file-storage-components.test.mjs`: **3/3 passed**.
- `node tests/file-storage-setup.test.mjs`: **3/3 passed**.
- `node tools/test-all.mjs server-file-installer server-setup file-storage` with process permission: **5/5 test files passed**. This includes actual TEMP ZIP extraction and install/import with the fixed installer and local token/Origin tests. No actual GUI or live host was used.
- `npm run check:types` with process permission: **0 errors, 0 warnings**.
- `git diff --check -- tools/install-server-plugin.mjs src/ui/file-storage-setup.js tests/file-storage-components.test.mjs tests/file-storage-setup.test.mjs tests/server-file-installer.test.mjs`: clean except informational Git LF/CRLF warnings.

The checked-in `assets/lattice-file-setup.zip` is intentionally **stale pending Task7 final regeneration**. The TEMP ZIP extraction test rebuilt and verified the installer from current source, but this fix commit does not capture concurrently uncommitted Task6 runtime modules in the distributed binary. Parent must run `node tools/build-server-setup.mjs` after the final runtime snapshot, before release. The failed-update recovery transaction does not promise live hot reload of modules already imported by a running host; the host restart requirement remains.
