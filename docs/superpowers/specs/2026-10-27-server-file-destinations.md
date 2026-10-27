# Server file destinations

Approved in chat: replace browser-only file writes with paths handled by SillyTavern's server, including an installable Lattice server component. Push the verified result to main.

Each file-owning node configures its file path, format, creation policy, initial contents and visibility. Relative paths resolve beneath that user's `files/lattice` directory; absolute paths refer to the server machine. Administrators may configure arbitrary paths. Other accounts remain confined to their own data root, including through symlinks. No experimental browser APIs or browser flags are required.

The server component is an ordinary SillyTavern server plugin, ID `lattice-files`. An explicit installer registers the installed extension's plugin entry; documentation explains enabling server plugins and restarting SillyTavern. The client detects the component and reports missing installation truthfully. It never changes host configuration automatically.

Reuse the existing checked file journal/backend on the server with Node filesystem handles and durable per-user metadata. Binding IDs are server-owned capabilities issued by explicit node configuration, never derived from model output or portable paths. Preserve reviewed Apply, captured revisions, stale-scope checks, actor privacy, histories, migration and interrupted-write reconciliation. Configuration and preview never write document bytes. Atomic replacement and checked rereads protect observed revisions; independent external editors cannot be atomically locked by Node rename alone.

API under `/api/plugins/lattice-files`: GET `status` returns `{apiVersion:1,userId,basePath,platform,canUseAbsolutePaths,bindings}` inside the existing `{ok,data}` result. Binding views include `bindingId,name,format,path,generation,status,storage:'server'`. POST `configure` accepts `{userId,path,name,format,mode,bindingId?}`; blank path uses name in the default folder; otherwise path is the complete filename. It returns the configured binding view. POST `load`, `cas`, `history`, `adopt` accept `{userId,scope,definition,generation}` plus `update`, `query`, or `request`, and return the corresponding existing backend Result. User and scope must match the authenticated host profile. Each request rechecks path containment and binding generation. All server mutations serialize, persist pending intent before bytes, and confirm resulting bytes.

Existing native file bindings remain recoverable and are never silently redirected. New configuration uses server paths. Portable exports remove binding IDs and machine paths; recipients explicitly configure their own destination.

Verification covers real temporary filesystem overwrite/empty/missing/Unicode paths, user isolation and symlink escape, stale binding and external edits, restart recovery, HTTP client freshness/cancellation, disconnected own-file setup, inherited destinations, no native picker APIs, and accepted Apply only.

Follow-up approved during implementation: remove the Workflow → Configure → Legacy chat data menu and dialog. Preserve stored data, native history/replay validation and migration through per-node File settings. Do not retain a second global file configuration UI.
