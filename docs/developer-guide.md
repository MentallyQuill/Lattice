# Developer guide: understand and reuse Lattice

[Documentation](README.md) · [Build and contribute](development.md) · [Introspection contracts](introspection-package.md)

Lattice is a SillyTavern extension, but much of its workflow, text, state, and canvas code can also be useful in another roleplay tool. You can run the whole extension, adapt the editor, or reuse a small function such as text composition. This guide explains which parts need the host and where an integration must supply its own services.

The repository uses the [MIT license](../LICENSE). Preserve its copyright and permission notice when copying or distributing copies or substantial portions of the software. Read the license itself for its terms.

## Architecture

A workflow moves through six layers. Following one node through these layers is a useful way to find the code you need.

1. **The UI collects an editing action.** Svelte components in [ui/](../ui/) render the shelf, Details, canvas, Preview, and review controls. [controller.js](../src/ui/controller.js) translates actions into domain commands; components receive display data and callbacks.
2. **The editor prepares and commits a change.** [graph-view-session.js](../src/ui/graph-view-session.js) owns the selected root or subgraph view. Domain editing modules prepare a candidate rather than changing the live graph immediately. [transactions.js](../src/workflow/transactions.js) checks the captured document, view, signatures, and edit revision before committing. [state.js](../src/state.js) coordinates document activation, history, settings, and persistence.
3. **Preparation validates the graph and makes projections.** [graph-validation.js](../src/workflow/graph-validation.js) checks controls, typed ports, wires, exact subgraph snapshots, cycles, and traversal limits. [graph-artifacts.js](../src/workflow/graph-artifacts.js) retains a privately owned checked snapshot. [resolve.js](../src/workflow/resolve.js) expands subgraphs and selects the dependency closure for a root or target run. [workspace-preparation.js](../src/ui/workspace-preparation.js) builds editor cards and panels from those checked contracts.
4. **The runner executes operations.** [catalog.js](../src/workflow/catalog.js) describes each node's controls, ports, phase, request bound, and model role. [runtime.js](../src/workflow/runtime.js) executes dependencies, injects bounded request services, propagates completed/skipped/unresolved port states, and records diagnostics. Most operation engines live in [operations/](../src/workflow/operations/) and [introspection/](../src/workflow/introspection/).
5. **The native host supplies live authority.** [run.js](../src/run.js) connects the extension to SillyTavern. [host.js](../src/workflow/host.js) captures chat, actor, prompt, model, document, and generation state. A unified root can pause at Generate Reply while SillyTavern produces its ordinary reply, then continue processing that captured Draft. Trusted host operations can stage effects under the enclosing run's authority.
6. **Review accepts a narrative and settles its effects.** Review / Publish retains the proposed reply and staged effects. [native-settlement.js](../src/workflow/native-settlement.js) and [staged-effects.js](../src/workflow/staged-effects.js) recheck the accepted final narrative, current sources, scope, and versions before settlement. A successful diagnostic run alone does not accept or persist those changes.

The [unified workflow guide](unified-workflows.md#read-the-graph-as-one-generation) describes this same lifecycle from the author's perspective. [types.d.ts](../src/workflow/types.d.ts) is the shared map of graph, port, plan, result, recording, and host interfaces.

## Reuse the source

The current [package.json](../package.json) is `private: true` and has no published SDK exports. Direct imports are source integration points in this checkout, not a promised stable npm API. Pin a tested Git revision in your project and record it alongside your copied or vendored source. On updates, compare the implementations and contracts and rerun your integration checks.

| What you want | Start with | What your application supplies |
| --- | --- | --- |
| Assemble a prompt or scene text deterministically | [composeText](../src/workflow/operations/compose.js), [types](../src/workflow/operations/compose.d.ts) | Plain named sections, JSON data, and an optional template |
| Make and reduce actor-state proposals | [contracts.js](../src/workflow/introspection/contracts.js), [types](../src/workflow/introspection/contracts.d.ts) | Chat/actor scope, store version, and exact source revisions |
| Read and settle actor memory | [memory.js](../src/workflow/introspection/memory.js), [backend contracts](../src/workflow/introspection/memory.d.ts) | Load, settled event reads, source validation, atomic compare-and-swap, persistence acknowledgement |
| Run a Reflect, Internalize, Express, Context, Memory, or State operation | [nodes.js](../src/workflow/introspection/nodes.js), [ExecutionPorts](../src/workflow/introspection/nodes.d.ts) | Named artifacts and, where needed, resolved model transport, tokenizer, signal, or scoped memory |
| Execute an admitted graph without native effects | [runWorkflow](../src/workflow/runtime.js), [WorkflowRunOptions](../src/workflow/types.d.ts) | Source snapshots and the required model/token services; native host nodes still need their owned host adapter |
| Reuse canvas mechanics | [camera](../src/canvas/camera.js), [frame scheduler](../src/canvas/frame.js), [geometry cache](../src/canvas/geometry.js), [retained slots](../src/canvas/retained-scene.js), [connection routes](../src/canvas/connection-route.js) | Your renderer, positions, endpoints, and lifecycle cleanup |
| Adapt the whole editor | [Canvas](../src/canvas.js), [CanvasLayer.svelte](../ui/CanvasLayer.svelte), [UI types](../ui/types.ts) | DOM, prepared display/gesture contracts, Svelte rendering, styles, and your own host integration |

Start small. Run the [source examples](developer-examples/) from the repository root with Node.js 24 or later:

```powershell
node docs/developer-examples/compose.mjs
node docs/developer-examples/state-and-memory.mjs
node docs/developer-examples/introspection.mjs
```

These scripts import the real source, use synthetic story data, and fail if their expected behavior changes. They make no provider requests. The third script supplies a deterministic completion through the same `request` contract a real model adapter would implement. [introspection-package.md](introspection-package.md#run-the-source-examples) explains what to replace in each example.

To move an example into another project, keep the source modules it imports and their transitive imports together, or update their paths deliberately. The source uses ESM and versioned import queries for extension asset loading. Copying a single file without its imports is usually insufficient. Preserve the license notice. An alternative is to keep a pinned checkout beside your application and import from it while you establish your own wrapper API.

For the complete extension, follow [installation](../README.md#install-and-try-it) and [development setup](development.md#build-and-check). The committed production bundle lets installed users run without a development toolchain; it does not replace the source contracts for an application integration.

## Data and artifacts

An authored workflow is plain data. The current graph uses `schema: 3`, `runtime: 2`, and `mode: 'native-unified'` for executable roots. It has `nodes` and `wires` maps keyed by IDs, with optional roles, portals, groups, and bundled definitions. A workflow node normally declares `type: 'workflow'`, its `operation`, and `operationVersion: 1` plus that operation's controls. Use the catalog's descriptor/default functions and validators instead of guessing fields.

Wires name both endpoints: `from`, `fromPort`, `to`, and `toPort`. A portal wire names a local portal source. Inputs accept one binding; outputs can feed several consumers. A runtime node address is `{workflowId, instancePath, nodeId}`; an artifact address adds `portId`. The path distinguishes two instances of the same saved definition. A terminal target is explicitly tagged and has no routable output pin.

| Artifact | Meaning and relevant contract |
| --- | --- |
| Text | `{kind: 'text', text}`; deterministic text operations validate their own bounds |
| Context | Structured messages with IDs, roles, text, optional revisions and visibility; [context-data.js](../src/workflow/operations/context-data.js) validates the runtime shape |
| Guidance | Optional direction; privacy and provenance can restrict which actor/model may receive it |
| Data | `{kind: 'data', value}` with bounded JSON; a specialized operation may require a stronger record schema |
| Draft | A captured or derived narrative with source/revision identity; [draft-revisions.js](../src/workflow/draft-revisions.js) preserves its relationship to the original |
| Patches / Candidate | Proposed edits and a checked resulting narrative; [repair.js](../src/workflow/repair.js) validates patch application |

Introspection Data is a specialized versioned record, not any JSON object. Its envelope contains `schemaVersion`, `recordType`, `scope`, `store`, `sourceRefs`, and `payload`. Read the [Introspection data contract](introspection-package.md#data-and-provenance) before constructing one. Other systems such as progression have their own Data contracts.

Portable workflow JSON wraps the graph as `{kind: 'lattice-workflow', schema: 2, minRuntime: 2, graph}`. Subgraph packages use `{kind: 'lattice-subgraph', schema: 1, minRuntime: 2, definition, definitions}`. The outer package schema and inner graph schema are different versions. [packages.js](../src/workflow/packages.js) exports and parses these envelopes, bounds them to 2,000,000 UTF-8 bytes, and strips local model connections and authoring ownership. Root import admits unified workflows; retained stage-specific bodies can still be reused as fragments or subgraphs.

A subgraph reference pins `{id, version, semanticHash}` to an exact immutable snapshot and its complete dependency closure. Parameter and binding overrides produce effective instance settings. Editing a local copy creates a new checked revision; changing a shelf entry does not silently replace every existing instance. [definition-data.js](../src/workflow/definition-data.js), [composition-edit.js](../src/workflow/composition-edit.js), and [definition-library.js](../src/workflow/definition-library.js) contain these rules.

Recordings are bounded historical diagnostics. [recording.js](../src/workflow/recording.js) can truncate or omit retained artifact content; [recorded-preview.js](../src/ui/recorded-preview.js) formats that retained material. A preview can explain what happened, but it is not a complete backup of all inputs or a handle that can authorize a new write.

## Authority and settlement

Three different identities matter: the editor document/view, the execution's captured sources, and the storage version. Keep each check when adapting the code.

- **Editor revision:** a prepared edit belongs to its captured document, active view, and revision. One-shot checked-candidate handles are held in private maps. Serializing, cloning, or fabricating the visible DTO does not transfer admission. Prepare again after the document or view changes.
- **Run revision:** `workflowSignature` measures semantic execution content. Camera movement, card positions, and presentation do not invalidate execution merely because they changed. A change to execution settings or sources can make a run stale. Native review also checks the active document token and original reply/swipe identity.
- **Storage revision:** memory and document writes compare the captured prior version/revision and evidence with current storage immediately before mutation. Repeating a read-modify-write with no coordinated compare-and-swap breaks this guarantee.

The public runner deliberately exposes injected memory `read` and `recall` without passing a `commit` capability. `executeIntrospection` in Memory Commit mode constructs a commit-intent record; it does not write it. The native host privately retains the intended transaction and stages it for accepted Review / Publish. Public execution, Run to here, preview, dry runs, cancellation, and failed branches do not settle native effects. Static systems receive only the capabilities delegated by their enclosing trusted root; arbitrary repeated helpers do not gain that authority.

Visibility is also an execution contract. [artifact-privacy.js](../src/workflow/artifact-privacy.js) propagates restrictions; [native-actor-context.js](../src/workflow/native-actor-context.js) owns actor grants and their checks. Context Perspective filters messages using explicit `visibleTo` arrays and an actor ID. JSON saying `actorId` or `actor-private` is descriptive data, not a grant to access that actor. Generate Reply accepts private guidance through its selected actor's authorized live producer; an arbitrary private Express output cannot replace that grant. Filter all material you separately add to prompts too.

Storage has several purposes:

| Store | What it retains |
| --- | --- |
| Extension settings/document session | Workflow authoring data, shelf definitions, workspace presentation, bindings, and enablement; see [state.js](../src/state.js) and [document-session.js](../src/ui/document-session.js) |
| Workflow story documents | Logical chat-scoped documents selected through the document catalog, with visibility, structure, revisions, and receipts; see [file-store contracts](../src/workflow/file-store.d.ts) |
| Introspection metadata | Actor state and commit receipts under `chatMetadata.latticeIntrospection[storeId][actorId]`; see [memory backend contracts](../src/workflow/introspection/memory.d.ts) |
| Native story state / Recall | Story-clock and outcome state, retained/queued recall evidence, and their source freshness; see [native-story-state.js](../src/workflow/native-story-state.js) and [native-recall.js](../src/workflow/native-recall.js) |

Read File and Write to File refer to those logical chat documents. They do not give workflows arbitrary filesystem access. File references, actor grants, prepared intent handles, and review handles depend on private object identity and current host scope; serialized copies do not recreate their authority.

Acceptance, local application, and acknowledged persistence are separate results. An adapter must only report an acknowledged save when it knows persistence succeeded. An unknown save can leave a local change applied with saving unverified; the native host holds affected follow-up writes until fresh persisted metadata confirms the receipt. Never interpret a timeout as proof that nothing was written, or blindly replay the transaction. See [accepted effects and saving](unified-workflows.md#keep-acceptance-and-saving-distinct).

Memory receipts bind an idempotency key to a canonical full intent fingerprint. An identical replay returns unchanged; using the key for different content fails. Receipt and evidence histories are bounded and need explicit reconciliation or summarization as they fill. [The memory guide](introspection-package.md#inject-your-host-services) describes the host's responsibilities.

## Requests, budgets, and cancellation

The plan computes a `callBound` from included operations, including bounded repeated helpers. The runtime enforces both each node's request bound and the run's total; `actualCalls` counts dispatched attempts. A role/profile/model choice is resolved locally through [connections.js](../src/workflow/connections.js). Authenticated transport objects stay outside plain graph and recording data.

Inject a tokenizer with the request transport where the runner requires one. Token budgets limit actual prompt/output or Guidance artifacts; graph limits and JSON limits are separate. Request completion needs a recognized successful finish reason. Missing, truncated, malformed, stale, or cancelled results fail rather than quietly becoming authoritative output. The small Introspection engine makes at most one request per inference operation and does not retry or select a provider itself.

Pass an `AbortSignal` through awaited services and storage adapters. Cancellation closes request scopes and prevents later output/settlement. The runner and host recheck freshness around awaited work and immediately before dispatch or mutation. Your adapter must honor the signal and repeat its final scope/source/version check after any prewrite await. Cancellation cannot undo an external mutation that has already happened; a storage receipt and truthful acknowledgement remain necessary.

## How the canvas stays responsive

The renderer avoids repeated preparation and layout work during gestures. The mechanisms are useful independently, but their benefits depend on card content, browser, and hardware.

- [frame.js](../src/canvas/frame.js) combines bursts of mouse/wheel work into one animation-frame update, merges dirty flags, and permits a final synchronous flush. Its cancel/destroy path rejects old callbacks.
- [canvas.js](../src/canvas.js) applies a shared viewport translation/scale to cards, comments, and wires. [camera.js](../src/canvas/camera.js) uses the same camera math for graph coordinates and pointer-anchored zoom. Camera frames do not require relaying out each card.
- [retained-scene.js](../src/canvas/retained-scene.js) reuses unchanged detached card/wire values. [CanvasLayer.svelte](../ui/CanvasLayer.svelte) keeps keyed card slots and updates local slot values, preserving DOM for unchanged membership/order.
- [geometry.js](../src/canvas/geometry.js) caches unscaled card dimensions and local named-pin centers. Layout/content/resize changes refresh that cache; camera movement uses it. Drag position updates reroute incident wires using the incident index rather than rebuilding every connection.
- CSS overview detail starts below zoom `0.5` and restores full detail at `0.6`. [style.css](../style.css) hides some labels/bodies/icons with `visibility` and removes some shadows while retaining card and pin geometry; selected, hovered, or focused cards keep useful detail.
- [connection-route.js](../src/canvas/connection-route.js) builds routes from the two local endpoints, with fixed horizontal leads and smooth turns. It needs no whole-scene obstacle scan. The middle span may pass behind cards; this is not obstacle avoidance.

The current implementation has no general viewport culling. It also avoids publishing every numeric camera movement into camera-dependent Workbench menus, and skips camera-path profile projection when there are no profile rows.

The validator currently caps both local and expanded graphs at 1,000 nodes and 2,000 wires, with additional plain-data budgets. These admission limits are not a performance guarantee. The largest retained current high-resolution measurement used **500 cards**. At a 3840 × 2160 synthetic Chromium viewport, camera-publication and empty-profile guards reduced pan/zoom scripting medians by **29.0–70.7%** against the recorded baseline. Total task time was mixed; frame tails and dragging did not improve consistently. Those runs used SwiftShader software rendering and do not establish smooth rendering for thousands of cards or a physical GPU frame-rate gain.

See the [full measurements, limits, and paired reproduction commands](research/2026-10-11-high-resolution-canvas-performance.md). [benchmark-viewport-performance.mjs](../tools/benchmark-viewport-performance.mjs) records browser/runtime/source/build provenance and checks retained DOM and geometry. Use fresh output directories, matched prepared builds, serial measurements, and the same fixtures when comparing a change. Focused regression coverage lives in [canvas event bursts](../tests/canvas-event-bursts.test.mjs), [retained scenes](../tests/canvas-retained-scene.test.mjs), [camera profile work](../tests/canvas-camera-profile-work.test.mjs), and [browser camera coverage](../tests/browser/canvas-native-bridge-integration.spec.mjs).

## Add a node

There is no external plug-in registration API for arbitrary workflow nodes. Adding a built-in operation is a source change across its contract, engine, and discovery presentation.

1. Define the smallest deterministic engine or injected service boundary in [operations/](../src/workflow/operations/). Use bounded plain inputs, return a Result failure on invalid input, and keep host side effects in an explicit host adapter. [compose.js](../src/workflow/operations/compose.js) and its [tests](../tests/workflow-compose.test.mjs) are a small example.
2. Add the descriptor/defaults/controls and named ports in [catalog.js](../src/workflow/catalog.js) or the appropriate operation-family descriptor module. Declare phase, model role, request capability/bound, terminal behavior, root restrictions, and skipped-input behavior accurately. Add a matching `.d.ts` contract where the family exposes typed source APIs.
3. Wire the engine into [runtime.js](../src/workflow/runtime.js) and its family's executor. Validate actual input/output kinds and per-port states. A host operation also needs capture, freshness, delegated authority, preview, and accepted settlement in [host.js](../src/workflow/host.js); setting `hostOperation` alone grants nothing.
4. Update [native-search-catalog.js](../src/ui/native-search-catalog.js), [node-guide-content.js](../src/ui/node-guide-content.js), [node-guide-examples.js](../src/workflow/node-guide-examples.js), and the [node reference](node-reference.md) as applicable. Keep one public shelf entry per operation, with modes in Details and aliases in search. Check that changed controls/ports preserve or explicitly diagnose saved configurations and connected wires.
5. Verify the engine's success and failure boundaries, graph admission/ports, root and subgraph execution, and the actual UI flow. Model-backed or mutating nodes also need meaningful tests for cancellation, limits, stale evidence, privacy, replay, and preview isolation. Run the [required build and checks](development.md#build-and-check); commit the generated UI bundle when source presentation changes.

Useful realistic source consumers are [introspection-consumer.ts](../tests/fixtures/introspection-consumer.ts), [introspection.mjs](../tests/fixtures/introspection.mjs), and the [prepared workflow fixture](../tests/fixtures/workflow-prepared-fixture.mjs). Start from the matching tests rather than treating a minimal illustration as a complete host implementation.
