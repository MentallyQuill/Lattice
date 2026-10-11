# Introspection workflows and package

Reflect, Internalize, Express, Context, Memory and State are registered native operations. Open the **Introspection** shelf family to choose one of these six nodes directly, or find it through contextual pin search. Their eighteen modes are selected in **Details → Mode**; they are not separate shelf entries. Editable controls and typed named pins follow the chosen mode. Existing saved modes remain intact. They participate in the normal native validator, runner, model bindings, recorded Preview, and workflow import/export. The [node reference](node-reference.md#introspection) lists the native pin contracts.

| Entry | Modes | Output | Requests |
| --- | --- | --- | --- |
| Reflect | Character, Recall, Scene | Reflection Data | 1 Analysis |
| Internalize | Experience, Pattern, Recovery | State proposal Data | 1 Analysis |
| Express | Behavior, Attention, Inner Voice | Guidance, Guidance, Text | 0, 0, 1 Prose |
| Context | Assemble, Perspective, Focus | Context | 0; Focus compression 1 Analysis |
| Memory | Read, Recall, Commit | State/events/episodes Data; native Commit Host result | 0 |
| State | Value, Curve, Track | Snapshot or state-proposal Data | 0 |

Reflect, Internalize and State produce candidate records. Express Behavior/Attention renders optional guidance without a model; Inner Voice is fictional authored text, not access to private model reasoning. Model operations receive supplied evidence with observation/interpretation/possibility labels and instructions to preserve player agency. Proposals never write by themselves, and multiple proposals do not merge without a version/evidence check.

## Native workflow examples

**File → Open examples…** contains current unified lessons for accepted progression, actor-private moments and Recall. Each opens as an independent editable active document without provider requests or changing **Enable Lattice**. Configure ordinary model connections and helper roles before Send. The [unified guide](unified-workflows.md) explains the owned generation and review path.

Reflect and Internalize create evidence-backed proposals; Express renders diagnostics without writing. Generate Reply accepts private guidance only from its selected actor's authorized live Character Direction or Recall producer. General private Express output is not a substitute for that grant.

Memory Read, Recall and Commit can run at the root or inside static subgraphs under the enclosing workflow's host authority. Commit stages its exact proposal for the accepted Review / Publish result. Target execution, previews, cancellation, failed branches and public runner calls never settle it. Native memory uses the active chat and host-selected actor, excludes unsupported or unfinished sources, and rechecks evidence and versions before writing.

The original manifest executor and example manifests have been retired. Current canvas roots are unified workflow packages. Five pinned stage-specific utility subgraphs remain reusable; their body contracts are independent of root admission.

Local application and saving remain distinct. An unknown save acknowledgment holds affected writes until fresh persisted metadata confirms the receipt. See [memory settlement and save status](native-workflows.md#actor-memory-and-state).

## Calling the package

Import `describeIntrospection` and `executeIntrospection` from `src/workflow/introspection/nodes.js`. Nodes use the existing flat workflow shape:

```js
const node = {type:'workflow',operation:'express',operationVersion:1,mode:'behavior'};
const result = await executeIntrospection(node,{assessment:reflection},{root:true});
```

Descriptions return named ports, mode-specific controls, output kind, role and request bound. Reflect consumes `context` plus optional `state`/`episodes`. Internalize requires `state` and `events`. Express consumes `assessment` plus optional supporting records. Context Assemble has `in1` through its configured `inputCount` (2–16); Perspective/Focus take `context`. State takes optional `state`, falling back to scoped Memory Read; Track also requires `events`. Memory Commit consumes `proposal`. Package engine outputs use `out`, including commit-intent Data; the native adapter exposes Commit as a terminal without a routable output pin.

Inject `request({messages,maxTokens,signal})`, returning `{ok:true,data:{text,finish}}`, with a verified finish such as `stop`. The package makes at most one request per inference node and does not resolve profiles/providers or retry. Focus additionally needs `countTokens(text) -> {tokens,method}` and a resolved `binding` for compression. Never use model output as a host storage authority.



## Data and provenance

Data is a versioned record: `{schemaVersion:1,recordType,scope:{chatId,actorId},store:{id,version},sourceRefs:[{id,revision}],payload}`. Boundaries clone plain own data without reading getters. They reject unsafe keys, cycles, inherited fields, sparse arrays and oversized structures. Maximums: 262144 UTF-8 bytes, depth32, 10000 values, IDs128 characters, text4096, source refs64, collection items64, changes32 and map keys32.

Actor state separates enduring `traits` from `beliefs`, `goals`, `relationships`, `conflicts`, temporary `conditions`, and `episodes`; `values`, `curves` and `tracks` carry deterministic state. Internalize cannot rewrite traits. Items retain classification and source references. A possibility remains a possibility when stored. Context message evidence requires an explicit `revision`; no invented revision makes unversioned scene text commit-worthy. Recalled episode IDs must refer to supplied episodes.

`applyStateProposal` is a pure candidate reducer. It validates scope/store/prior version and produces a detached state without increasing the version. Only successful host settlement increases the version. Historical evidence is retained; missing or changed sources produce invalidation reports and block new stale commits. Edit/swipe/delete semantics belong to the injected event/source adapter, not an inferred rollback of story canon.

## Scoped memory adapters

`createMemoryService` takes `{scope,storeId,load,readEvents,validateSources,compareAndSwap}`. Use `createInMemoryBackend(initialState,eventsDataOrCallback)` for deterministic tests. Use `createChatMetadataBackend({scope,storeId,getContext,saveMetadata,readEvents,validateSources,initialState?})` for host integration. Construction has no effects.

Ports:

- `load()` -> Result of `{state:Data,receipts:Receipt[]}`.
- `readEvents()` -> Result of scoped settled-events Data.
- `validateSources(refs)` -> `Result<void>`; reject any current revision mismatch or unsettled source.
- `compareAndSwap({expectedVersion,state,receipt},{signal,sourceRefs})` -> Result of `{acknowledged:boolean}`. Check chat, source validity, version and cancellation immediately before the atomic write. An adapter with awaited work must recheck before saving. External writers must use the same CAS contract.

Metadata is explicitly namespaced under `chatMetadata.latticeIntrospection[storeId][actorId] = {state,receipts}`. `getContext` returns a plain `{chatId,chatMetadata}` snapshot; adapt the host's larger context to this shape. `saveMetadata` receives the proposed detached snapshot and must return `true` only for acknowledged persistence. The native adapter in `host-memory.js` bridges the public SillyTavern context/save API, serializes writes, merges fresh unrelated metadata, and checks actor/chat/source/version after awaited work. Package integrations must provide the same coordination. Memory event reads use the loaded state version in the envelope, preserving exact event IDs, revisions, text and settled classification across turns.

`commit(intent,{root:true,signal,preview:false,dryRun:false})` serializes transactions and revalidates evidence/current state before one CAS. Receipt fingerprints are canonical full intent JSON; replaying a key with identical content returns `applied:false`, while changed content fails. Unknown acknowledgment is explicitly returned as `acknowledged:false`; confirm durable storage before reporting it as saved or retrying. A per-service guard blocks an unresolved replay without a stored receipt. Receipt capacity is64; there is no silent eviction. The host must explicitly reconcile/archive history to extend bounded capacity. Evidence and track histories are also bounded, requiring deliberate summarization rather than silent truncation.

## Controls

Reflect/Internalize/Express use `mode`, `maxTokens` (default2048), and `instructions`. Memory Read uses `view:state|events|episodes`; Recall uses `query` and `limit` (default8); Commit requires a stable nonblank `idempotencyKey` unique to the intended event transaction. Native defaults use the host-derived key described above. Model controls appear only for request-making modes; changing Express from Behavior to Inner Voice changes `out` from Guidance to Text and requires a Prose binding.

Context Perspective requires `actorId` and explicit `message.visibleTo` arrays. Unmarked messages are omitted. Native Scene Context marks public chat and selected character material as provided to the active host actor, preserving existing visibility exclusions. That annotation describes supplied material, not knowledge of in-world events. Imported Context still requires its own explicit visibility. The output strips nested input metadata that might reintroduce omitted text; reports expose bounded omitted IDs. This controls the returned artifact, not separately assembled prompt material. Focus uses `method:select|compress`, `targetTokens`, `maxTokens`, `keepRecent`, `pins`, and `purpose`.

State Value reads when `updates` is absent; configured updates form a numeric proposal checked against `min`/`max` (default0..1). In Details, **Values** is a JSON object such as `{"trust":0.35}`. Arrays are invalid; numeric values and finite Minimum/Maximum may be fractional. Curve uses `curveId`, `steps` (1..64), `decay` (0..1), `baseline`, and positive integer durations (1..64) for onset/peak/plateau/decline/aftermath. **Phase durations** is a JSON object such as `{"onset":2,"peak":1,"plateau":3,"decline":2,"aftermath":1}`. Decay and Baseline support fractions. Save the JSON control before running. Curve deterministically approaches baseline and does not infer emotional truth. Track uses `trackId` and distinct settled event IDs; repeats do not advance its count.
