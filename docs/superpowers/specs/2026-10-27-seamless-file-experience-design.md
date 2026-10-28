# Seamless file experience

**Status:** Approved for planning and implementation on 2026-10-27, following confirmation of decisions D1–D5. The user authorized implementation without further approval requests. Engineering rulings and verification are tracked in [the implementation plan](../plans/2026-10-27-seamless-file-experience.md).

**Date:** 2026-10-27.

**Baseline:** Lattice commit `e272abc`, including the server file component and removal of the global Legacy chat data interface.

**Audience:** Product design and implementation engineers. The intended user has no technical knowledge of filesystems, formats, server plugins, JSON or storage identifiers.

## 1. Intent

A new user should install Lattice, open a workflow, use it, close it and return later with their work and story state preserved. Normal operation should require no storage configuration.

File handling should become visible when the user imports something, downloads or shares something, chooses a different destination, restores earlier work, or must resolve a genuine problem. Useful control remains available without making technical decisions mandatory.

Each node retains ownership of its file configuration. Its ordinary setting should be **Automatic — managed by Lattice**, with explicit overrides when wanted. The removed global Workflow Data / Legacy chat data configuration screen must not return as a prerequisite.

### Decision status

- **Confirmed requirements** below come from the user's requests.
- **Supporting defaults and behavior** are the recommendations incorporated into the approved design; their precise implementation is covered by the plan.
- **Confirmed product decisions D1–D5** are recorded in section 15 and incorporated throughout the design. They replace the earlier tentative recommendations.
- **Remaining engineering/design details** are identified separately and must not be confused with unanswered D1–D5 choices.
- Requirements written as “must” describe the proposed product's acceptance criteria, not claims about the current implementation.

## 2. Confirmed requirements

1. Users with zero technical skill must be able to pick up Lattice and use it. Defaults are part of the design, not an optional later improvement.
2. File-related nodes must present consistent control over their source or destination and name. Configuration belongs to the node rather than a required universal Workflow Data catalog.
3. Normal use must not require experimental browser flags or depend on native browser filesystem APIs being available.
4. Filesystem writes may run in the SillyTavern server process. Paths refer to the machine running SillyTavern, which may differ from the browser's device.
5. Users expect a Browse / Choose file action across Windows, macOS and Linux. Manual path entry should not be the sole way to choose a location.
6. Users should not need to understand or type `.txt`, `.json`, `.csv` or other suffixes. Lattice should keep content, format and filename consistent automatically.
7. Installation should feel like installing Lattice, without users coordinating a separately presented file service.
8. The old Workflow → Configure → Legacy chat data menu and dialog stay removed. Previously stored data must remain preserved.
9. On first installation, check whether compatible server file support is accessible, then offer **Save only inside SillyTavern** or **Save anywhere on this computer**. Choosing the latter starts a small guided setup wizard when the component is needed.
10. Every file-saving node offers **File handling: Replace / Append**, with Replace as the default for new nodes. Existing configured behavior is preserved.
11. A saved workflow is one shared document: saving an edit updates that workflow everywhere it is used. Users choose **Save As** to create an independent workflow for a particular chat. Per-chat execution data remains isolated.

## 3. Current implementation and gaps

The current implementation supports server paths, checked saves, per-user binding authority, migration and interrupted-write receipts. It also retains previously granted browser files. This is useful infrastructure, but its interface is not the target experience.

Current friction includes:

- Installing file support requires a command, a server setting and a restart.
- Node panels expose path, filename, format, missing-file policy, initial contents, visibility and sometimes actor identifiers before a first save.
- Path and filename duplicate one another. Format and suffix can disagree.
- New output/state nodes can immediately show Setup Required even when sensible defaults are possible.
- Workflow documents still use a different browser-file/download save model. A downloaded copy may leave a workflow marked Modified and complicate switching documents.
- Save acknowledgements, recoverable drafts and exported files are not explained through one consistent status model.
- Current active history limits can interrupt a long-running story. A pending-write journal is not a versioned backup system.
- Examples, help and some fallback guidance still describe older file setup flows. They require a complete consistency pass.

Existing behavior and installation are documented in [the server setup guide](../../server-files.md) and [the implementation report](../reports/2026-10-27-server-file-destinations.md). Neither should be mistaken for this proposed design.

## 4. Selected installation experience and deployment constraint

SillyTavern's normal extension installer clones a browser extension and reads its manifest. It does not execute a backend installation hook. Server plugins use a different startup loader and are disabled by default. Bundling backend source inside an extension does not activate it.

Primary references inspected during the discussion:

- [Official extension installer](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/src/endpoints/extensions.js#L92).
- [Official server-plugin loader](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/src/plugin-loader.js#L40).
- [Official built-in file API](https://github.com/SillyTavern/SillyTavern/blob/06bde939fb1e9c4c8d8641d810f0a916b5bce127/src/endpoints/files.js#L28).

### First-run storage choice

Use SillyTavern's ordinary extension installation as the entry point. On first use after installation, perform a non-mutating capability check and present two choices:

| Choice | User experience | Storage consequence |
| --- | --- | --- |
| **Save only inside SillyTavern** | Continue immediately with automatic destinations and no server-component installation. | Workflow documents and internal state use host-managed storage. Explicit file outputs create actual files in an automatically managed location within the user's SillyTavern storage. |
| **Save anywhere on this computer** | Use compatible existing support immediately, or open the guided setup wizard. | Allow custom locations on the machine running SillyTavern, subject to the authenticated user's authorization and OS permissions. Managed defaults remain available. |

The second label must identify the correct machine. For a remote installation use wording such as **Choose locations on the SillyTavern server**, with a short explanation that this does not grant access to the browser device's filesystem. “Anywhere” describes the location choice, not permission to bypass OS or host access restrictions.

The capability check must verify the expected component/protocol version, supported operations and the current user's access; detecting an arbitrary responding endpoint is insufficient. Distinguish ready, missing/incompatible, access denied and temporarily unreachable states. An unreachable host must not be reported as a missing installation. Recheck after setup and on demand.

Remember the choice for the authenticated user and host. Offer a later **File storage** setting to enable wider location support or rerun setup; this setting is not a global catalog of node files. Choosing either option must not move existing data, rewrite node destinations or reset bindings. Returning users should not see the first-run choice repeatedly, and a working existing component must not be reinstalled unnecessarily.

### Guided setup for custom locations

When the user chooses wider location access and compatible support is unavailable, the wizard must:

1. Explain in plain language that SillyTavern requires an additional server component to save outside its own storage, and that Lattice includes that component.
2. Identify the relevant SillyTavern host and check whether the current user can perform setup. For a remote/shared host, explain any host-owner action without requesting administrator credentials from an ordinary user.
3. Guide installation or updating through a supported installer/host integration, requesting any required server-setting change and restart explicitly. Preserve unrelated configuration and existing plugins.
4. Retain progress across a restart and verify that the compatible component and required permissions are accessible before reporting completion.
5. Allow cancellation, retry or **Continue saving inside SillyTavern** without losing configuration or work. Failed optional setup must not disable working internal storage.

The wizard is part of Lattice's experience; users must not coordinate a separately presented file-service product. A mandatory standalone Lattice installer was considered but is not the selected entry point. The existing command-line registration procedure may remain an advanced fallback, not the ordinary wizard journey.

**Engineering constraint:** a browser extension cannot use an absent backend to install that backend. The plan must identify a concrete, supported bootstrap mechanism for each supported local/remote deployment before promising automated wizard steps. Where host-owner involvement is unavoidable, the wizard must explain and resume that action truthfully. Fork-specific administration endpoints cannot be assumed to exist in standard SillyTavern. Do not silently enable server execution or weaken host permissions.

### Managed documents and real files

A managed document stored with SillyTavern's saved data is distinct from a standalone filesystem file. The UI must describe the actual result accurately.

The confirmed default mapping is managed storage for workflow configuration and internal state, and actual files for explicit file outputs. **Write to File** produces an actual file with an automatic name and default location inside SillyTavern; choosing a custom location uses the optional wider-access capability. A host-managed document is presented as a saved document, with Download / Export creating a standalone copy.

The built-in file API confines files to the user's file directory and has no expected-revision/CAS operation or directory browser. Its empty-data guard rejects canonical empty-base64 uploads, although Node accepts nonempty padding-only base64 that decodes to zero bytes; verify that behavior against the host endpoint before relying on it.

**Verified platform limitation:** host-only persistence cannot provide the optional server component's serialized checked writes across independent clients. Use read/check/write/verify with preserved recovery copies, advertise the provider as a verified-write provider, and label its acknowledgement **Saved in SillyTavern**. Explain the concurrent-client limitation in storage details; never describe it as atomic cross-device CAS. Uncertain or conflicting responses retain the attempted contents and require reconciliation. The optional component retains its stronger same-service checks, subject to external filesystem races. This constraint was reported during planning and is recorded explicitly rather than hidden by a fallback.

## 5. Defaults and supporting behavior

| Area | Ordinary default | Explicit user choice |
| --- | --- | --- |
| Workflow documents | Autosave validated edits to one shared saved document and restore the last open workflow. Every chat using that document sees saved changes. | Rename, Save As an independent workflow, open another workflow, download or share. |
| New output | Allocate managed ownership, a collision-safe destination and a readable suggested name automatically. | Change destination, use an existing file, or change the friendly name. |
| Clock, outcomes and internal state | Initialize valid state from the node's schema; retain existing canonical values on reopening or migration. | Change meaningful story settings, not paste storage JSON or identifiers. |
| Connected writers | Inherit the exact source reference and its format/location. | Deliberately choose an independent output. |
| Standalone writers | Use their own managed destination without requiring a separate reader node. | Link an existing resource or select a custom location. |
| File handling | Replace the same owned file on accepted save by default. Every file-saving node exposes Replace / Append. | Choose Append to retain existing contents and add new material. Existing configured modes are preserved during migration. |
| Missing new managed file | Create it and required managed folders on the first accepted save. | Custom external creation rules under Advanced. |
| Missing previously saved data | Restore a verified recoverable version when possible; otherwise retain work and explain the problem. | Choose a replacement or resolve the conflict. Never silently reset existing story state to an empty template. |
| Input file | Use a known connected/managed source when the node's purpose identifies it. Otherwise offer Choose file. | Choose the actual input; Lattice cannot guess which unrelated personal file is intended. |
| Format and suffix | Resolve from the node's declared purpose/output and attach the suffix automatically. | Friendly export choices or Advanced format controls. |
| Access | Preserve inherited restrictions and existing authorized character context. | Select a character by name if needed; explicitly widen sharing. Never type an actor ID in ordinary use. |
| Maintenance | Reconcile interrupted saves and archive history before active limits interrupt normal use. | Restore a version or resolve a genuinely ambiguous/destructive conflict. |

The installation, storage mapping, independent state ownership, Replace / Append choice and shared saved-workflow identity are confirmed in section 15. The plan specifies the detailed recovery, maintenance and interaction policies.

## 6. Automatic formats and suffixes

Users enter a friendly name such as **Scene Context**. Lattice owns the physical filename and extension for newly managed files.

| Declared output | Friendly type | Canonical suffix |
| --- | --- | --- |
| Ordinary text | Text document | `.txt` |
| Story clock, outcomes or general structured data | Lattice data / structured data, according to context | `.json` |
| Explicit Markdown output | Markdown document | `.md` |
| Spreadsheet export | Spreadsheet | `.csv` |
| Explicit line-oriented JSON output | Advanced format | `.jsonl` |

### Resolution rules

1. A fixed-schema node determines its own format. Clock/outcome schemas remain JSON and receive valid initial data automatically.
2. A writer using an exact connected file reference inherits that resource's format. Automatic naming cannot redirect or convert that reference.
3. An explicit serialization/export node supplies its declared format. The implementation must carry this information through the pipeline where necessary.
4. Otherwise, textual output defaults to UTF-8 plain text and structured data to JSON. A table is exported to CSV when spreadsheet export is requested.
5. Prose that happens to resemble JSON or contain Markdown syntax does not change type. Resolve from declared configuration and connections, not from changing model output on each run.
6. Resolve and retain the format before execution and validate the actual produced content against it. Ordinary saves must not alternate types or create a new destination every run.

### Naming rules

- Suggest the name from the node's purpose or user label. Keep storage identity independent of mutable labels.
- A new managed filename receives exactly one canonical suffix. Recognized terminal suffixes entered in the friendly-name field are normalized before the canonical suffix is added; `SceneContext.txt` must not become `SceneContext.txt.txt`.
- Preserve meaningful interior periods and unrecognized endings, such as the version marker in `Scene.v2`.
- Normalize unsupported path characters according to the destination's rules, show the resulting friendly name, and prevent collisions without overwriting an unrelated file.
- Reusing the same managed output updates that resource. Ordinary runs do not create timestamped copies indefinitely.
- Opening an existing file preserves its name and location. Do not silently rename a user's file to “fix” its extension.
- Changing a suffix is never treated as conversion. A format change affecting an existing resource requires a valid conversion/new-copy path, preserving the previous resource and its history.
- Automatic naming must not rename or move existing files merely because the workflow, chat or node was relabeled.

Normal controls show **Name** and a read-only friendly **Type: Automatic · Text document** where useful. Raw suffixes and serialization settings belong in Advanced or technical details. File pickers preselect friendly type filters and suggest the correct name automatically.

### File handling: Replace / Append

Every node that saves file contents, including specialized file-saving nodes, exposes a consistent **File handling** control with **Replace** and **Append**. Replace is the default for new nodes. This choice belongs in the ordinary File section, not behind a technical format setting.

- **Replace:** update the same destination with the new accepted contents, retaining normal recovery protection.
- **Append:** preserve existing contents and add the new accepted material once. Retries must not add it again.
- Both modes retain the resource's identity and correct type. Appending to structured data must preserve a valid document and the consuming node's schema; concatenating complete JSON documents into an invalid `.json` file is not a supported interpretation.
- The implementation design must specify type-aware append rules, including text separators, structured records and fixed-schema state. It must make both advertised choices meaningful without corrupting canonical state, silently switching modes or mislabeling a separate history export as an append to the selected file.
- Internal workflow authoring autosave updates its shared workflow document. It is distinct from a file-saving node's output handling control.

## 7. Everyday interface

An ordinary output should need only its friendly name, **File handling: Replace / Append**, status and relevant actions: **Open**, **Change…**, **Download copy**, and **Advanced**. Every file-saving node retains the handling control; other actions may be omitted when they have no meaningful effect in the current state.

- Remove duplicated editable File path and Filename fields from normal use.
- Remove the independent Save file settings step. Valid configuration changes autosave; incomplete drafts stay editable without losing the last valid configuration.
- New managed nodes are Ready with working defaults. Use a calm **Choose file** prompt when genuine source input is missing.
- Reserve setup cautions for unresolved choices that actually prevent the node from working. A default that is already usable is configured.
- Show installation/capability issues once at application level. Optional custom-location support being absent must not make all otherwise working managed nodes appear broken.
- Report readable document/node names in save results. Internal target IDs, revisions, receipts and storage backend names belong in technical details.
- Keep Advanced available for custom locations, explicit formats, creation policy, access overrides and specialized write details beyond the ordinary Replace / Append choice. Advanced settings must retain their meaning across reopening and migration.

The old global data configuration screen stays removed. A simple saved-items or recovery view may help users find and restore their own work; it must not become another required authorization/catalog setup workflow.

## 8. Choosing, importing and exporting files

### Choose / Browse

- Provide an actual Choose / Browse action across Windows, macOS and Linux. Manual path entry remains an advanced fallback.
- Choosing from the user's device may use the ordinary browser file dialog to import a managed copy. Explain that changing the original file later does not update that copy.
- Choosing an existing Lattice item uses a friendly library/file chooser.
- Custom server locations need a chooser for the filesystem of the SillyTavern machine. Use a native OS dialog only when supported in a suitable local desktop context. Remote/headless installations need a supported in-app server file browser.
- Never open a dialog on an unseen remote desktop and imply it appeared on the user's device. Never claim an upload grants a persistent writable local path.
- Cancellation leaves prior bindings and data unchanged. Selecting a destination never overwrites its document bytes during configuration.

### Download / Export / Share

- Download creates a copy on the browser's device and follows the browser's supported save behavior. Native Save As may be used when available, with a working download fallback.
- A download being initiated is not evidence that a local file was durably saved. It must not replace the acknowledgement of a managed save.
- Use friendly export choices such as Text document or Spreadsheet. Lattice supplies the extension and real encoding.
- Sharing a workflow excludes credentials, machine paths, writable binding authority and private story data by default. Including sample inputs/data must be deliberate and clearly described.
- A backup/export retaining the user's own complete work is distinct from a portable sharing copy. Neither operation deletes or redirects the live originals.

## 9. Persistence lifecycle and status

Two save lifecycles remain distinct:

1. **Authoring:** validated workflow and node configuration autosaves to the shared workflow document without executing the workflow, spending model requests or creating output document bytes. An acknowledged autosave is a save and therefore propagates the edit everywhere that workflow is used.
2. **Execution:** preview prepares results without output writes. The existing acceptance policy determines when staged effects may be saved. Autosave does not enable automatic acceptance or change an existing review policy.

New managed ownership and names can be prepared automatically through trusted host context. Actual state initialization/output creation occurs only at the appropriate accepted write boundary. Initial templates must never overwrite existing canonical content.

Proposed user-facing states:

| State | Meaning |
| --- | --- |
| Ready — saves with accepted results | Configuration is usable; no output save is being claimed yet. |
| Saving… | A managed save is in progress. |
| Saved | The relevant storage acknowledgement/verification succeeded. |
| Saved in SillyTavern | The host-only provider verified the persisted contents and retained recovery information; this does not claim atomic conflict exclusion across independent clients. |
| Saved on this device — waiting to sync | A durable local recovery copy exists but host persistence is pending. Do not show this without a proven local copy. |
| Save needs attention | Work is retained, but safe automatic recovery cannot finish the operation. Offer a concrete next action. |

Configuration and output statuses must not be conflated. A saved workflow configuration does not mean its output node has executed. Unsupported browsers must not be sent through the current “download a copy, then choose Don't Save” workaround to continue ordinary managed authoring.

### Shared saved workflow semantics

- Chats reference one stable saved workflow identity. Opening the same workflow in another chat does not silently create a working copy.
- Saving an edit changes that workflow everywhere it is used. Notify/refresh other open views after a confirmed save, preserving any local unsaved edits and detecting stale-save conflicts rather than losing an editor's work.
- **Save As** creates a new workflow identity. The new workflow can be selected for one chat and changed independently of the original. Downloading a copy is a separate export action.
- Each execution and pending review captures a saved workflow revision. A save elsewhere must not mutate an in-flight run; later executions resolve the latest confirmed saved revision. This revision boundary does not pin a chat permanently to an old workflow.
- Changes to shared node configuration propagate with the workflow. Runtime state and writable bindings remain scoped to the chat/workflow/node unless sharing of a particular resource is deliberately configured.

## 10. Ownership, privacy and document lifecycle

- Give saved workflow documents stable opaque identities within the authenticated user's library, independent of the chat using them. Scope managed execution resources to the authenticated user, chat, workflow and qualified node. Friendly names are presentation, not authority.
- Keep separate chats isolated. Explicit connections and deliberate “use existing data” choices preserve intended sharing within a graph.
- Workflow authoring is shared wherever the same saved document is used. Execution state and write authority remain independent across chats. Separate workflows within one chat also own independent state by default, with explicit sharing through exact connections or a deliberate use-existing-data choice.
- Never derive write authority from model-generated text, an imported path, a filename or a display label.
- Renaming a chat, workflow or node preserves its bindings and saved data.
- A copied/imported workflow must not accidentally write into the original's resources. Rebuild intended internal connections while assigning safe new managed ownership where appropriate.
- A story branch needs a trusted state-copy/rebase policy: preserve the state at the branch point without granting write authority to the original branch or breaking accepted-history checks.
- Removing a node or workflow does not automatically delete external files. Managed data remains recoverable according to the approved retention policy.
- Preserve inherited privacy and actor restrictions through saves, migration, copies, backups, history maintenance and export. Ask for a familiar character selection when scope is ambiguous; never guess a private actor or widen access silently.
- Preserve the distinction between user/chat ownership and which workflow/character may consume an artifact. Labels such as Public must not imply internet publication.

The shared workflow identity and independent state defaults are confirmed in section 15. Detailed branch rebasing and migration mechanics remain implementation-design work.

## 11. Recovery, backups and long-running stories

Normal operation must not require users to understand journals, receipts, checkpoints or reconciliation.

- Retain interrupted edits and acknowledge saves truthfully. Never discard unsaved work when the host disconnects or a write fails.
- Reconcile an uncertain write by checking its durable identity before retrying. Retrying must not duplicate an append, a published reply, a clock advance or an outcome.
- Detect external changes and preserve both the user's work and the external version. Offer plain actions such as Save a copy, Choose another file, or Restore an earlier version when a choice is needed.
- Keep versioned recovery snapshots; the pending-write journal alone is insufficient backup.
- Automatically checkpoint/archive active history before current clock/receipt limits interrupt routine operation. Preserve replay prevention, current story values, original draws, source bindings and private history.
- Maintenance must not invalidate a pending review or overwrite a concurrently changed resource. Schedule it at a safe lifecycle boundary.
- Partition/rotate metadata as needed rather than merely increasing a single journal limit. Never silently discard canonical state or replay identities to regain space.
- Define bounded snapshot retention and a clear disk-full/quota experience before shipping. A real capacity failure may require a user's choice; an internal maintenance threshold should not.

Current limits include 32 retained clock turns, 256 active save receipts and a bounded server journal. These are implementation constraints to handle automatically, not ordinary user tasks. Separate semantic bounds within one proposed operation remain enforceable.

## 12. Architecture boundaries

Reuse the existing backend-independent file-store, checked references, scoped authorization, acceptance lifecycle and history validation where they meet the new requirements.

Conceptually separate:

1. **User intent:** friendly name, Automatic/connected/custom source or destination, meaningful save behavior and explicit export choices.
2. **Resolution policy:** declared format, canonical suffix, collision handling, scoped managed ownership and selected capabilities.
3. **Persistence provider:** host-managed storage, real managed files, retained native grants or custom server paths. Provider details and authority stay out of ordinary node forms and model output.
4. **Lifecycle services:** workflow autosave, accepted output writes, history maintenance, recovery and portable export.

All providers must state what their acknowledgements and concurrency checks actually guarantee. The selected host-only mode uses the explicitly described verified-write status above; it must not be advertised as atomic CAS. Existing server/native bindings must not silently fall back to a weaker provider. Check required capability before starting a workflow path that could incur paid work.

Keep existing external path ownership, OS permission and user isolation checks. Portable filesystem APIs cannot completely exclude an independent process racing a directory/file replacement; detected uncertainty must remain recoverable rather than being reported as a confirmed save.

## 13. Migration and discoverability

- Preserve existing filenames, formats, append/update behavior, bindings, canonical data, archives and privacy. New defaults apply to new managed resources; they do not silently reinterpret existing workflows.
- Existing native grants and server paths remain available until explicitly migrated. Changing defaults must not redirect them automatically.
- Preserve distinct existing workflow identities; do not merge documents merely because their names or contents match. Once chats reference the same saved workflow identity, acknowledged edits propagate to all of them. Save As creates an independent identity and safe new managed ownership rather than accidentally cloning write authority.
- Prefer saved content over old initial templates when migrating. Validate state/schema identities internally.
- Migrate supported old storage quietly and retain originals until a confirmed new save. Surface a migration choice only when intent is ambiguous or an overwrite could lose work.
- Update all node guides, examples, menus, statuses, errors and active documentation together. Remove obsolete global Workflow Data instructions from current user journeys.
- Examples should prepare valid sample state automatically in an isolated scope. They must not require manual JSON or file-template setup, write into a real story unexpectedly, or make paid requests during configuration.
- Users must be able to find saved outputs, open them, rename friendly labels, download a copy and restore earlier work without locating hidden folders manually.

## 14. Acceptance scenarios

1. On first installation, check compatible server capability and offer the two storage choices. Saving inside SillyTavern works without a terminal, YAML editing, technical identifiers or browser flags. Choosing wider access uses existing compatible support or opens the wizard; cancellation, denial and temporary unreachability preserve working internal saves. Remember the choice and verify setup after restart.
2. A new workflow autosaves, closes and reopens with its configuration intact. The same saved workflow used in two chats reflects acknowledged edits in both, while story state stays separate. Save As creates an independently editable workflow. Changing browsers retains access to the user's host-managed workflow library.
3. A new standalone output, clock or outcomes node has usable defaults and does not demand a path, suffix, format, JSON template or actor ID.
4. An unconfigured external reader offers Choose file; cancellation preserves the previous source and all stored data.
5. Entering `Scene Context` or `SceneContext.txt` creates a correctly encoded newly managed text file with one `.txt` suffix. Structured state receives `.json` automatically. Version-like interior periods survive.
6. A changing model response does not change the selected file type or destination. Explicit format changes preserve the earlier resource through a safe conversion/copy flow.
7. Every file-saving node offers Replace / Append and new nodes default to Replace. Repeated accepted saves update the same owned output; Append retains existing material and adds the new material once per accepted intent. Structured outputs remain valid and readable. Preview, rejection and configuration make no output writes.
8. Existing source references remain exact. A writer inheriting a file cannot silently redirect it to an automatically allocated destination.
9. Local and remotely hosted SillyTavern work with clear device/server targeting. Browse never depends on a dialog appearing on an unseen remote desktop.
10. Imported/shared workflows cannot reuse another user's paths, bindings or private story state. Copies avoid unintended shared writes; intended connections inside a copy remain coherent.
11. A lost save response, reload or server restart recovers without duplicate appends, publication or story effects. Conflicting external edits preserve both versions and require a clear decision when needed.
12. At least 100 accepted story turns and 1,000 ordinary accepted saves complete without manual history maintenance, while archived replay checks and private data remain correct.
13. Removing a node leaves external files untouched and managed data recoverable. Renaming nodes/workflows/chats does not break bindings.
14. The normal panels expose readable names and statuses, with technical controls under Advanced. Keyboard, narrow layout, light/dark themes and accessibility labels remain usable.
15. The global Legacy chat data / Workflow Data configuration UI remains absent; migration and recovery protections remain tested.
16. No storage operation reports Saved based only on a picker closing, download initiation, queued request or unverified response. Ordinary configuration never makes model calls.
17. A shared workflow save cannot alter a running execution or pending review. The next execution uses the latest confirmed revision. Concurrent editors preserve unsaved changes and handle stale-save conflicts without silently overwriting one another.
18. In inside-SillyTavern mode, an explicit Write to File output produces an actual file in the automatically selected SillyTavern location. It requires no custom-location component setup and never substitutes an in-memory document while reporting a file save.

## 15. Confirmed product decisions and remaining details

The user resolved all five product decisions on 2026-10-27:

| ID | Topic | Confirmed decision |
| --- | --- | --- |
| D1 | Installation and storage choice | On first installation, check compatible server file support and offer save-inside-SillyTavern or wider OS location access. The second choice uses accessible support or guides installation in a small wizard. A separate mandatory standalone installer is not the default entry point. |
| D2 | Managed documents versus actual files | Use managed storage for workflow configuration/internal state. Explicit file outputs create actual files with automatic names and default locations, with custom locations available after setup. |
| D3 | State sharing between workflows | Independent state ownership by default; users deliberately share through connections or choosing existing data. Preserve existing configured sharing on migration. |
| D4 | File handling | Update the same file with Replace by default. Every file-saving node offers a File handling choice of Append or Replace. Preserve existing configured behavior. |
| D5 | Workflow edits across chats | One saved workflow is shared wherever used. Saved edits change it everywhere. Save As creates a separate workflow when a chat needs independent edits. Keep execution data separate per chat. |

Remaining details for the implementation design are the concrete wizard bootstrap mechanism across supported hosts; proof of host-only real-file persistence/concurrency guarantees; valid append semantics for each structured/fixed-schema file type; shared-document revision/conflict handling; and bounded backup retention/quota behavior. These details must satisfy the confirmed choices above. If a platform constraint makes a confirmed behavior impossible, report that specific conflict before changing the product contract.

## 16. Implementation handoff

The approved implementation plan covers: first-run capability detection and the two storage choices; the optional setup wizard and verified host-only file provider; stable managed ownership and schema initialization; automatic format/naming and Replace / Append resolution; shared workflow autosave/library and Save As identity; minimal node controls and cross-platform choosing; recovery/maintenance; migration; and complete documentation/example updates.

Builders may choose module boundaries, internal property names, debounce timings, provider adapters and platform helpers within the approved requirements. They may not replace the selected first-run experience with mandatory external setup, weaken persistence guarantees, fabricate a native dialog capability, hide the requested Append / Replace control, silently copy a shared workflow per chat, restore the global configuration screen, or change existing resource ownership/write behavior silently.

This design supersedes the manual-setup/default assumptions in [the earlier node-file design](2026-10-27-node-file-destinations-design.md) and [the server-file design](2026-10-27-server-file-destinations.md). Those records remain useful history and describe the current foundation.
