# Introspection workflows and package

[Documentation](README.md) · [Developer guide](developer-guide.md) · [Node reference](node-reference.md#introspection)

Introspection gives a fictional character a structured way to assess a scene, propose a change, and express possible behavior. It keeps evidence, interpretation, and possibility distinct. A character can remain guarded after an apology, for example, while proposing a temporary reduction in anger. The assessment and proposal remain candidates until the owning application accepts and settles a transaction.

There are two ways to use this code: author nodes in the installed extension, or import the source engines into your own application. The repository's package is `private: true`; “package” here names the source modules, not a published SDK with stable npm exports. Pin the revision you integrate and verify your consumers when updating. The [source-reuse guide](developer-guide.md#reuse-the-source) explains the dependencies and MIT notice requirement.

Reflect, Internalize, Express, Context, Memory and State are registered native operations. Open the **Introspection** shelf family to choose one of these six nodes directly, or find it through contextual pin search. Their modes are selected in **Details → Mode**. Editable controls and typed named pins follow the chosen mode. Existing saved modes remain intact. They participate in the normal native validator, runner, model bindings, recorded Preview, and workflow import/export. The [node reference](node-reference.md#introspection) lists the native pin contracts.

| Entry | Modes | Output | Requests |
| --- | --- | --- | --- |
| Reflect | Character, Recall, Scene | Reflection Data | 1 Analysis |
| Internalize | Experience, Pattern, Recovery | State proposal Data | 1 Analysis |
| Express | Behavior, Attention, Inner Voice | Guidance, Guidance, Text | 0, 0, 1 Prose |
| Context | Assemble, Perspective, Focus | Context | 0; Focus compression 1 Analysis |
| Memory | Read, Recall, Commit | State/events/episodes Data; native Commit Host result | 0 |
| State | Value, Curve, Track | Actor snapshot or state-proposal Data | 0 |
| State | Progression, Time Decay | Generic progression Data and proposals; [separate contract](../src/workflow/operations/progression-nodes.d.ts) | 0 |

Reflect, Internalize and State produce candidate records. Express Behavior/Attention renders optional guidance without a model; Inner Voice is fictional authored text, not access to private model reasoning. Model operations receive supplied evidence with observation/interpretation/possibility labels and instructions to preserve player agency. Proposals never write by themselves, and multiple proposals do not merge without a version/evidence check.

A typical actor-memory flow is: read the current state and settled events; Reflect or Internalize using that evidence; inspect the resulting assessment/proposal; optionally Express guidance; stage Memory Commit; accept the narrative; then let the host revalidate and settle. You can omit inference entirely when a deterministic State update is sufficient.

## Native workflow examples

**File → Open examples…** contains current unified lessons for accepted progression, actor-private moments and Recall. Each opens as an independent editable active document without provider requests or changing **Enable Lattice**. Configure ordinary model connections and helper roles before Send. The [unified guide](unified-workflows.md) explains the owned generation and review path.

Reflect and Internalize create evidence-backed proposals; Express renders diagnostics without writing. Generate Reply accepts private guidance only from its selected actor's authorized live Character Direction or Recall producer. General private Express output is not a substitute for that grant.

Memory Read, Recall and Commit can run at the root or inside static subgraphs under the enclosing workflow's host authority. Commit stages its exact proposal for the accepted Review / Publish result. Target execution, previews, cancellation, failed branches and public runner calls never settle it. Native memory uses the active chat and host-selected actor, excludes unsupported or unfinished sources, and rechecks evidence and versions before writing.

The original manifest executor and example manifests have been retired. Current canvas roots are unified workflow packages. Five pinned stage-specific utility subgraphs remain reusable; their body contracts are independent of root admission.

Local application and saving remain distinct. An unknown save acknowledgment holds affected writes until fresh persisted metadata confirms the receipt. See [memory settlement and save status](native-workflows.md#actor-memory-and-state).

## Calling the package

Import `describeIntrospection` and `executeIntrospection` from [nodes.js](../src/workflow/introspection/nodes.js). `describeIntrospection` tells you which named inputs and controls a mode accepts; `executeIntrospection` runs one operation with the services you inject. Nodes use the existing flat workflow shape. This complete example reads a detached actor snapshot without a model or storage write; run it from the repository root in an ESM script or with `node --input-type=module`:

```js
import {createActorState} from './src/workflow/introspection/contracts.js';
import {executeIntrospection} from './src/workflow/introspection/nodes.js';

const initialized = createActorState({chatId: 'demo-chat', actorId: 'mara'});
if (!initialized.ok) throw new Error(initialized.error.message);
const result = await executeIntrospection(
    {type: 'workflow', operation: 'state', operationVersion: 1, mode: 'value'},
    {state: initialized.data},
);
if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
console.log(result.artifact.value.store.version); // 0: no commit occurred
```

Descriptions return named ports, mode-specific controls, output kind, role and request bound. Reflect consumes `context` plus optional `state`/`episodes`. Internalize requires `state` and `events`. Express consumes `assessment` plus optional supporting records. Context Assemble has `in1` through its configured `inputCount` (2–16); Perspective/Focus take `context`. State Value/Curve/Track take optional `state`, falling back to scoped Memory Read; Track also requires `events`. Memory Commit consumes `proposal`. The original actor modes describe an `out` pin, including commit-intent Data; the native adapter exposes Commit as a terminal without a routable output pin. Progression/Time Decay have their own named-port contract.

Inject `request({messages,maxTokens,signal})`, returning `{ok:true,data:{text,finish}}`, with a verified finish such as `stop`. The package makes at most one request per inference node and does not resolve profiles/providers or retry. Focus additionally needs `countTokens(text) -> {tokens,method}` and a resolved `binding` for compression. Never use model output as a host storage authority.

Check `ok` before consuming `data` or `artifact`. Pure constructors/reducers return `{ok:true,data}`; operation execution returns `{ok:true,artifact,reports}` for the original actor modes. Failures return `{ok:false,error:{code,message}}` and no successful artifact. The generic progression modes can return named `outputs`; their separate contract describes those ports. Do not turn an unverified failure or unfinished completion into a state update.

## Run the source examples

The following executable examples use the actual source and synthetic roleplay data. They require Node.js 24 or later, make no provider requests, and assert the behavior described here:

```powershell
node docs/developer-examples/compose.mjs
node docs/developer-examples/state-and-memory.mjs
node docs/developer-examples/introspection.mjs
```

| Example | What it demonstrates | What to adapt |
| --- | --- | --- |
| [compose.mjs](developer-examples/compose.mjs) | Named scene sections and JSON-pointer data become one deterministic text result | Your scene text, actor data, and template |
| [state-and-memory.mjs](developer-examples/state-and-memory.mjs) | A proposal leaves the prior state unchanged; an accepted commit advances version 0 to 1; an identical replay has `applied: false` | Scope, settled evidence, transaction key, acceptance UI, and durable backend |
| [introspection.mjs](developer-examples/introspection.mjs) | Perspective excludes another actor's secret; Reflect makes one injected completion; Express Behavior makes none | Explicit visibility, state/context snapshots, and your resolved model transport |

The inference example's `request` function is an offline fixture returning raw JSON with `finish: 'stop'`. A real transport must return that Result shape, report the provider's actual completion status, and honor cancellation. The example passes the original visible context into Express along with the assessment and state, so its provenance can be verified. Do the same when supplying optional supporting evidence in your integration.

The memory example explicitly calls the owned service after its simulated acceptance point. It illustrates the application boundary; it does not implement a complete native-review host. In the installed extension, Memory Commit stages its intent and the native controller owns acceptance and settlement. A caller choosing `root: true` in its own source integration must also supply its own trusted application policy and storage adapter.

See [introspection-consumer.ts](../tests/fixtures/introspection-consumer.ts) for a checked TypeScript consumer, [introspection.mjs](../tests/fixtures/introspection.mjs) for realistic record fixtures, and [nodes.d.ts](../src/workflow/introspection/nodes.d.ts), [analysis.d.ts](../src/workflow/introspection/analysis.d.ts), and [contracts.d.ts](../src/workflow/introspection/contracts.d.ts) for the complete source contracts.

## Data and provenance

Actor Introspection Data is `{kind:'data',value:record}`, where the record is `{schemaVersion:1,recordType,scope:{chatId,actorId},store:{id,version},sourceRefs:[{id,revision}],payload}`. `recordType` distinguishes actor-state, state-proposal, reflection, events, episodes, and commit-intent. Use `createActorState`, `makeRecord`, and `parseRecord` from [contracts.js](../src/workflow/introspection/contracts.js) rather than accepting arbitrary model JSON as an envelope. Boundaries clone plain own data without reading getters. They reject unsafe keys, cycles, inherited fields, sparse arrays and oversized structures. Maximums: 262,144 UTF-8 bytes, depth 32, 10,000 values, IDs 128 characters, text 4,096 characters, 64 source refs, 64 collection items, 32 changes and 32 map keys. These actor-record limits differ from general workflow graph and JSON limits.

Actor state separates enduring `traits` from `beliefs`, `goals`, `relationships`, `conflicts`, temporary `conditions`, and `episodes`; `values`, `curves` and `tracks` carry deterministic state. Internalize cannot rewrite traits. Items retain classification and source references. A possibility remains a possibility when stored. Context message evidence requires an explicit `revision`; no invented revision makes unversioned scene text commit-worthy. Recalled episode IDs must refer to supplied episodes.

`applyStateProposal` is a pure candidate reducer. It validates scope/store/prior version and produces a detached state without increasing the version or changing the input. The memory service increases the version on an applied commit; in the installed extension that happens through accepted host settlement. Historical evidence is retained; missing or changed sources produce invalidation reports and block new stale commits. Edit/swipe/delete semantics belong to the injected event/source adapter, not an inferred rollback of story canon.

## Inject your host services

The engines accept application services as explicit function ports. Their constructors do not read host globals or create storage effects. Your application owns provider selection, authorization, visibility of separately assembled prompt material, event freshness, and persistence. Read [memory.d.ts](../src/workflow/introspection/memory.d.ts) when implementing a backend.

### Scoped memory adapters

`createMemoryService` takes `{scope,storeId,load,readEvents,validateSources,compareAndSwap}`. Use `createInMemoryBackend(initialState,eventsDataOrCallback)` for deterministic tests. Use `createChatMetadataBackend({scope,storeId,getContext,saveMetadata,readEvents,validateSources,initialState?})` for host integration. Construction has no effects.

Ports:

- `load()` -> Result of `{state:Data,receipts:Receipt[]}`.
- `readEvents()` -> Result of scoped settled-events Data.
- `validateSources(refs)` -> `Result<void>`; reject any current revision mismatch or unsettled source.
- `compareAndSwap({expectedVersion,state,receipt},{signal,sourceRefs})` -> Result of `{acknowledged:boolean}`. Check chat, source validity, version and cancellation immediately before the atomic write. An adapter with awaited work must recheck before saving. External writers must use the same CAS contract.

Metadata is explicitly namespaced under `chatMetadata.latticeIntrospection[storeId][actorId] = {state,receipts}`. `getContext` returns a plain `{chatId,chatMetadata}` snapshot; adapt the host's larger context to this shape. `saveMetadata` receives the proposed detached snapshot and must return `true` only for acknowledged persistence. The native adapter in `host-memory.js` bridges the public SillyTavern context/save API, serializes writes, merges fresh unrelated metadata, and checks actor/chat/source/version after awaited work. Package integrations must provide the same coordination. Memory event reads use the loaded state version in the envelope, preserving exact event IDs, revisions, text and settled classification across turns.

`commit(intent,{root:true,signal,preview:false,dryRun:false})` serializes transactions within that service and revalidates evidence/current state before one CAS. Cross-service or external writers still need the same backend coordination. Receipt fingerprints are canonical full intent JSON; replaying a key with identical content returns `applied:false`, while changed content fails. Unknown acknowledgment is explicitly returned as `acknowledged:false`; confirm durable storage before reporting it as saved or retrying. A per-service guard blocks an unresolved replay without a stored receipt. Receipt capacity is 64; there is no silent eviction. The host must explicitly reconcile/archive history to extend bounded capacity. Evidence and track histories are also bounded, requiring deliberate summarization rather than silent truncation.

`preflight(intent,{root:true,signal})` checks the same scope, version, sources, and proposal without writing, returning `ready` or `unchanged`. The final commit repeats its checks; a preflight result does not reserve the version or prevent another writer from changing storage.

Pass an `AbortSignal` to pending model and memory work. Cancelled or changed inputs cannot produce a successful authoritative result. `executeIntrospection` rechecks the named input snapshot after awaited work; storage adapters must recheck chat, actor, source revisions, expected version, and the signal after their own awaits and immediately before mutation. A preview flag is a prohibition on commit, not a different storage destination.

## Controls

Reflect/Internalize/Express use `mode`, `maxTokens` (default 2,048), and `instructions`. Memory Read uses `view:state|events|episodes`; Recall uses `query` and `limit` (default 8); Commit requires a stable nonblank `idempotencyKey` unique to the intended event transaction. The native host derives its default key from the workflow, producer address, and exact proposal, so a replay describes the same intended transaction. Model controls appear only for request-making modes; changing Express from Behavior to Inner Voice changes `out` from Guidance to Text and requires a Prose binding.

Context Perspective requires `actorId` and explicit `message.visibleTo` arrays. Unmarked messages are omitted. Native Scene Context marks public chat and selected character material as provided to the active host actor, preserving existing visibility exclusions. That annotation describes supplied material, not knowledge of in-world events. Imported Context still requires its own explicit visibility. The output strips nested input metadata that might reintroduce omitted text; reports expose bounded omitted IDs. This controls the returned artifact, not separately assembled prompt material. Focus uses `method:select|compress`, `targetTokens`, `maxTokens`, `keepRecent`, `pins`, and `purpose`.

State Value reads when `updates` is absent; configured updates form a numeric proposal checked against `min`/`max` (default 0..1). In Details, **Values** is a JSON object such as `{"trust":0.35}`. Arrays are invalid; numeric values and finite Minimum/Maximum may be fractional. Curve uses `curveId`, `steps` (1..64), `decay` (0..1), `baseline`, and positive integer durations (1..64) for onset/peak/plateau/decline/aftermath. **Phase durations** is a JSON object such as `{"onset":2,"peak":1,"plateau":3,"decline":2,"aftermath":1}`. Decay and Baseline support fractions. Save the JSON control before running. Curve deterministically approaches baseline and does not infer emotional truth. Track uses `trackId` and distinct settled event IDs; repeats do not advance its count. Progression and Time Decay use the [generic progression system](unified-workflows.md#generic-values-xp-souls-and-relationship-pacing) rather than this actor-state envelope.
