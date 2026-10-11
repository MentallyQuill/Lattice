# Unified workflows in LATTICE

[Documentation](README.md) · [Quick start](lattice-workspace.md) · [Node reference](node-reference.md) · [Model connections](native-workflows.md)

A unified workflow prepares guidance, waits for SillyTavern to generate its ordinary reply, and then processes that reply in the same graph. You work in one open unified workflow document. Preparation and response remain useful stages inside it; they no longer require switching between two graphs.

The normal SillyTavern connection writes the main reply. Other model nodes have their own connections and can plan, judge, revise, extract or enrich material. Their outputs become graph artifacts that you can inspect before applying the final result.

## Apply an example to Story-2

1. In SillyTavern, select **default-user**, open **Story-2**, and select the character who will produce the native reply. User, chat and character selection determine the workflow's live sources and private stores.
2. Open LATTICE beside the chat's Send button, or enter `/lattice`. A fresh workspace starts with **Unified story workflow** and Lattice disabled. Existing installations restore their unified recovery draft; previous unified documents are available through **File → Recover previous workflows**. Retired pre/post roots move to the cold archive described below.
3. Choose **File → Open examples…**. Open a unified example whose goal fits your story. Each opening makes an independent editable copy the active document; it makes no model request and does not change **Enable Lattice**. The example's description contains its setup and inspection instructions.
4. Adapt its literal instructions, actor/item identities, schemas and document targets. Example names and actors are authored demonstration material. A loaded character's canonical ID is normally `character:<avatar filename>`; a display name alone is not a live actor identity.
5. Choose every ordinary text-model node’s connection in its grey profile bar. Use **Active SillyTavern model** to follow the current host connection/model, or choose a saved Connection Manager profile for a fixed connection. Leave **Details → Advanced model settings → Model mode → Use profile model** unless that particular node needs an explicit model identifier. Configure any **For Each → Helper model bindings** as well; assigning the extraction node's profile does not assign its confirmation helper.
6. Automatic Story Clock, Read File and Outcome Commit defaults need no setup. If the example names custom targets, authorize them in **Workflow → Configure → Workflow Data…** first. Resolve the graph's validation and binding issues before sending.
7. Select **Enable Lattice** while the configured document is open. Send uses this active root document; switching between its root and subgraph tabs does not change that choice.
8. Return to SillyTavern and **Send** your next player message normally. The workflow runs the necessary preparation, resumes from the completed native Draft, and records its response-stage results. A generated swipe can run the same open workflow when its configured sources and target policies permit it.
9. Open Preview and select the desired **Review / Publish · Host result**. Compare the original, proposed body, appended sections, model trace and staged consequences. Choose **Apply reviewed candidate** or **Reject candidate**.

Apply creates a new assistant swipe and preserves the native original. It then settles the effects associated with that exact reviewed root result. Reject leaves the original and does not accept its pending file, clock, random-outcome or accepted-policy Recall effects. A completed candidate is still a proposal until you apply it.

Use **Run to here** to inspect supported preparation or source operations without accepting changes. Full execution needs the owned SillyTavern generation; Run to here does not start another main reply.

See [Thirty example workflows](examples.md) for the numbered curriculum and safe setup.

## Pick a concrete starting flow

For the guidance/prose/items idea, open **Plan, write, polish, and annotate one reply**. Edit its literal Compose guidance for Story-2, then choose local profiles on **Revise Draft**, **Extract** and **Enrich**. The native reply still uses SillyTavern’s active main connection. Revise Draft polishes narration, Extract keeps source-quoted items, Enrich adds labeled suggestions, and Render Notes → Append adds the expandable section. Inspect the final body and notes together before Apply.

| Example title in the picker | What to configure first |
| --- | --- |
| **The broken wand: stable randomness with a wild branch** | Current player-use entities, checked effect library, accepted outcome target and For Each confirmation/effectAuthor roles. |
| **Give one present character their own direction** | Loaded canonical actor identity, source-backed participation and the Character Direction connection/system prompt. |
| **Let an item remind its actual holder** | Item aliases/entities, confirmed ordered holder state and that actor’s private document/Prompted Memory branch. |
| **One kiss, two private perspectives** | Both actors’ actual IDs, an ordinary Decision connection and explicit accepted answer, explicit permission to author both reflections, separate Actor Context models and private targets. |
| **Recall a memory with a hotkey or a story trigger** | Selected actor, authorized record set, matching Recall/Recall Shortcut memory-set IDs and the visible queue policy. |
| **The soul-stealing sword: an event ledger and a threshold** | Canonical soul list, confirmed kill identities, projected count/threshold and authorized keyed write. |
| **A relationship that changes slowly over weeks** | Directed actor scope, authored progression/decay rules, effective story clock and private state target. |

The picker’s description supplies the exact initial target shape and helper setup for each copy. Adapt its demonstration identities deliberately rather than treating the sample cast as your live Story-2 actors.

## Read the graph as one generation

```text
On Send ────────────────────────────→ Generate Reply · SillyTavern
                                             │ Draft
Scene Context → planning model → Guidance ────┘
                                             ↓
                                       Revise Draft
                                             ↓
                      Extract → Enrich → Render Notes
                                             │ Text
                          revised Draft ──→ Append
                                             ↓
                                      Review / Publish
```

Connect the planning Guidance to Generate Reply's optional `guidance` pin, and On Send's activation to its required `activation` pin. The Draft pin is the completed native reply captured for this generation. It can feed several response branches. Generate Reply's metadata is descriptive generation information, not permission to publish a different reply.

There is one native generation boundary in a unified root workflow. Generate Reply is not an auxiliary model call and does not have a second Connection profile. Its guidance budget caps the material LATTICE supplies to the ordinary native prompt. Quiet/background, impersonation, unsupported media/tool continuations and overlapping generations do not become interchangeable native Drafts.

Wires determine dependencies. A preparation label on an independent node does not make its output reach the native prompt: wire it into guidance or another required preparation input. A response branch must reach a selected terminal or consumed output to run. Canvas position does not impose order. Cycles, incompatible types, invalid pins and unsupported root-only nodes in a helper are rejected.

Nodes usable in either stage expose **Stage → Preparation / Response** in Details. Those settings place an operation around the generation boundary within the same workflow document. Conditions and branch outcomes distinguish **completed**, **skipped** and **unresolved**. A skipped optional contribution can be omitted by Join; an unresolved required contribution holds its dependents rather than treating uncertainty as false.

## Combine editable systems in one Main

Keep one **On Send → Generate Reply → Review / Publish** path in the workflow. Any part of that path, including On Send and Review / Publish, can sit inside a static subgraph. Crossing connections become typed inputs and outputs; the enclosing workflow still owns one activation and native generation. Package the item's effect, weather rules and relationship state as separate static bodies. **Workflow → Add system…** chooses a saved body, binds its typed inputs and destinations, previews the connections and adds an editable instance. It targets Main even when a body tab is focused. For a preparation Guidance output, choose an existing Compose Guidance merge or create one when the generator's guidance input is empty. Occupied destination pins require an explicit choice and are not replaced automatically. A state-only system can stage effects without contributing prompt text.

Main's Compose can receive original Guidance sections in the order you authored. Each row's **Kind**, **Required input** and **Skipped source** control the contract. Choose optional Guidance with **Omit section** for a system that may skip. A completed source overrides the Text fallback; an unconnected optional source keeps it. Skipped optional sources may omit or fall back, while required and unresolved paths retain their dependency rules. In template mode, an omitted `{{section:Name}}` is empty.

**Token budget** can cap the complete composition; 0 adds no Compose cap. Overflow holds without truncation, and Generate Reply still checks its final budget. Preview records the exact rendered text and reports ordered contributions. Original selected-actor Character Direction or Recall Guidance retains its live authorization after merging. Private Text/Data or copied labels cannot obtain that permission through Compose.

Connections govern execution. Body tabs retain your editing view, not a separate story attachment or generation. **Details → Run this system** on the wrapper controls the entire body; off skips its reads, model calls, effects and default provisioning. Closing its tab leaves the connected system active. Save/Open retains Main, definitions, overrides and open tabs; portable export retains the same composition and pinned closure.

All ordinary workflow nodes can run inside static bodies, including native context sources, Guidance, Memory, State, Recall, Recall Shortcut and the native lifecycle. Their live target references, selected/present actor scope and source checks still apply. Implicit State reads the enclosing workflow's Memory capture. Nested Memory Commit waits for acceptance, and Recall queues and shortcuts distinguish reused instances. For Each keeps its separate bounded contract: host operations remain unavailable, and State requires an explicit snapshot.

Try the [combined wand, weather and relationship example](combined-system-example.md). It uses one shared source clock, public item/weather guidance and state-only private relationship progression. Its agreed eight-hour wait is an authored story action. It stages three independent saves on Apply; Reject, Cancel and Preview retain their initial data. This direct-file example is separate from the thirty numbered lessons.

## Choose a different model for each job

Ordinary model operations can follow **Active SillyTavern model** or use a fixed local Connection Manager profile. Configure Model Call, Decision, Revise Draft, Extract, Enrich, Character Direction and other model-backed nodes independently. New ordinary text-model nodes select the active option; existing fixed and inherited bindings remain. The grey bar below a model node opens a searchable picker: keywords match a saved profile’s name, API label and model, while the active option stays first. Details provides collapsed advanced model settings for overrides, role provenance, errors and reset. A fixed profile supplies its provider route, sampler preset and model; the active option follows the host’s configured route/model at request time. LATTICE does not switch SillyTavern’s active main connection globally.

A **Model Call** accepts a Text prompt and optional Context/Data evidence, returning Text or schema-checked Data. **Revise Draft** returns a source-bound Draft revision. Select its editable scope and protected literals explicitly. **Extract** produces records, while **Enrich** adds bounded details to supplied records. A subsequent **Render Notes → Append** can add a public notes dropdown to the reviewed reply. Render Notes accepts player-visible records; private memories and hidden material cannot become public notes merely through formatting.

For a real reusable iteration, select **For Each** and inspect **Helper model bindings**. Each text-model role used by the exact pinned helper has its own friendly Connection profile and Model mode selector. You can use the helper's saved connection, choose **Active SillyTavern model**, choose a local profile and its model, retain a helper model choice, or enter a custom model identifier. Imported helpers with unassigned roles can be configured here without editing or repinning their bodies.

An explicit outer role override reaches recursive helpers. Explicit choices in a nested For Each, wrapper or primitive node take precedence; Details reports these exceptions. A helper without text-model calls needs no text profile. Keep the helper's iteration limit and per-item request bound large enough for the authored path, but finite: exceeding a bound holds the run instead of silently processing a partial list. The helper pin includes its exact ID, version and semantic hash; updating a library entry does not silently change placed copies.

Portable exports omit local saved-profile identifiers and credentials, including local helper-role overrides. After importing on another installation, choose its fixed local profiles again where needed. **Active SillyTavern model** remains a portable selection and follows the recipient’s configured host connection/model. Portable model names may remain, so confirm they are valid for the newly selected route.

## Decision and confidence

**Decision** uses an ordinary text-model connection to answer keyed typed questions. The available question types are `noul` (yes/no/unresolved), `choice` (authored alternatives) and `score` (an ordered rubric). A noul text answer exposes `answers.<id>.accepted` as true, false or null. Model-generated confirmation-looking prose is not a canonical event by itself.

Use **Select Fields** to expose `answers.<id>.accepted`, then **Branch** or **Confirm Events** to preserve its true, false or null meaning. An unresolved answer does not establish acceptance. **Confidence Gate** remains available for an authored numeric metric, with explicit acceptance and rejection thresholds and an unresolved middle range. A score or successful request alone does not permit a state write; follow the confirmed-event and accepted-effect path.

Retired Fast workflows and reusable helpers remain available through File’s archived recovery export. They cannot become executable documents. Recovery exports remove local connection selectors while preserving authored identities and pins.

## Triggers need a source and an event policy

Use **Player Event Source** when a rule responds to the actual player message before generation. It supplies bounded current-turn text and host source identity. Repeated reads of the same turn retain that identity; a later identical message is another turn. Restricted native text is held rather than exposed as a public trigger source.

For the completed narrative, connect Generate Reply's Draft through **Draft Event Source** with an authored entity/scope table. Its source describes the narrative body, excluding appended notes. **Item Mention Trigger** matches declared aliases in a declared watch source. A mention can activate a reminder; it does not establish item use, ownership or a kill.

**Item Use Trigger** either normalizes supplied candidate interpretations or makes one bounded extraction request. Use **Event Normalize** for other authored event types. Then use Decision and **Confirm Events** to distinguish actual occurrences from attempted, negated, hypothetical, quoted or remembered actions. Keep exact quoted source spans and closed actor/item identities. **Current Holder** applies the confirmed event sequence to an explicit holder state; it does not guess ownership from the nearest name.

An actual holder-memory path is:

```text
Player Event Source → Item Use Trigger → For Each confirmation → Collection flatten
                                                        ↓
                   prior holder state ───────────→ Current Holder
                                                        ↓
                  verified Scene Presence ────→ Prompted Memory
                                                        ↓
                                actor-private proposal → Write to File
```

Wire the branch to a selected terminal. Prompted Memory needs both genuine live presence and the unchanged confirmed current-holder event for its configured actor. **Recall**, **Create**, and **Recall-or-create** are separate modes; creation also requires the explicit `allowCreate` control. A created memory is a proposal until an authorized persistence path accepts it.

## Character-specific direction and private reflections

A source-backed interpretation of the current scene provides a bounded cast with canonical actor IDs and quoted participation evidence. **Scene Presence** projects one actor's present/absent/unresolved status. Literal or imported cast labels do not authorize native access to a character's private data.

Connect the exact verified presence to **Character Direction** to apply a separate `systemPrompt` only when that character is present. Absence skips its model call; unresolved participation holds it. The request receives that actor's authorized card fields, scene context and stored memories. Its optional **Data** input can add projected bounded State or file values that are public or authorized by that same exact actor grant; another actor's private data or mixed scopes hold before the request. The separate system prompt remains literal. Its output is actor-private Guidance. Generate Reply accepts that exact live guidance only for the currently selected native actor. A generic private Model Call → Compose branch does not authorize private native Guidance.

Use **Actor Context** for a character's own Model Call. It makes no request and returns authorized card/context/memory material with actor-private visibility. Two present loaded actors can have separate Actor Context branches, separate model requests and separate private file targets. Do not join their private inputs into a common request or append their reflections to public scene notes. Public Scene Context can supply observable narrative to a general model; the default actor-perspective Scene Context is not a substitute for a grant-backed Actor Context.

The **One kiss, two private perspectives** lesson confirms actual shared kiss evidence and uses an ordinary Decision before requesting private reflections. Missing kiss evidence deliberately holds with no Review handle or reflection writes. A false answer skips reflection while preserving the ordinary reviewed Draft; a null answer holds Confirm Events before Review with no private writes. Both actors must be genuinely present before either reflection; absence skips both private legs and unresolved participation holds. Separate `rowan-permission-text` and `iris-permission-text` values default `allowModelAuthoredReflection` to `false`; permit each independently only with explicit author permission, especially for a player-controlled character. Configure each Read File and Write to File with **Actor scope → presence**, that actor's canonical ID, and its exact Scene Presence input. Keep each actor's records and model Context on its own leg. Each saved record keeps `sharedQuote` and `sceneEvidence` as exact canonical shared evidence. `reflection` and Recall-compatible `text` contain private model-authored interpretation, marked by `reflectionOrigin: "model-authored"`; its stable `id` comes from the canonical event. Both staged writes can belong to the same reviewed root result. Each file has its own receipt: if one persistence leg fails after the other is saved, inspect the confirmed partial result and supported retry rather than assuming an atomic rollback.

Native generation currently has one selected actor. Actor Context allows separate present-actor processing; it does not authorize another actor's private direction as the selected actor's native guidance. Group generation and automatic multi-character native prompting are not implied by a public cast list.

## Authorize Workflow Data and preserve its structure

New **Story Clock**, **Read File** and **Outcome Commit** nodes need no prior Workflow Data setup. They select **Chat clock**, empty plain-text **Chat notes** and an empty JSON **Chat outcomes** list respectively. A unified run makes only its referenced presets available in the active user/chat. Adjust initial values or content in the node’s Details, and open **Advanced** for its source, Format and Visibility. Clock and outcomes sources keep their required JSON format. Existing saved content is retained when settings change.

The default Chat clock is shared across Main and systems. Default notes and outcomes inside each system have stable separate sources for that workflow and full instance path; explicit named targets keep the selected shared identity. A disabled system does not provision its unused defaults. Connect one accepted clock to all bodies that need it and keep one final writer for that source. Two staged writes to one target are rejected.

**Workflow → Configure → Workflow Data…** manages custom logical targets for the actual user and chat, including named recipe targets. A target such as `souls.json` is a scoped workflow data document identifier, not an arbitrary operating-system file path. Canonical document content lives in LATTICE's chat metadata store.

For a custom target, create an authorization with a unique target ID, display name, format, visibility and initial template. Formats are **JSON**, **JSON Lines**, **CSV**, **Plain text** and **Markdown**. CSV needs declared columns. Actor-private authorization also needs its canonical actor ID. Hidden documents cannot be exposed to public model/notes branches by changing a graph label.

The initial template defines the structure used before canonical content exists. Updating an authorization or its template leaves existing canonical document content intact. For an existing authorization, explicitly choose **Load initial template** before editing that template. **Remove authorization** revokes access; it is not a graph instruction to delete a filesystem file.

Nodes with automatic Workflow Data presets are added directly to the canvas. Operations that need additional authored controls still open **Configure node**. Pick the Preparation/Response stage or exact pinned Data helper where offered, and complete the declared controls. Cancel leaves the graph unchanged. Other controls remain editable in Details. A node can be valid without making its branch selected: connect its result where it is needed.

**Read File** returns serialized Text, parsed document Data and a live reference. The exact reference must feed Write to File for the same authorized target and actor scope. A filename string or copied reference cannot replace it. Use JSON Decode, Select Fields or Collection to select a nested list explicitly.

**Format** validates structured records or parses raw JSON text, maps chosen fields, and serializes the supported format. It does not infer a reliable schema from arbitrary prose. To convert prose into JSON, first use Extract/Model Call with a record schema, then Format. JSON shape **records** serializes a record list; **single** requires one object and preserves an object-shaped state document. Use declared CSV columns and JSON schema checks when their structure matters.

| Write mode | Intended mutation |
| --- | --- |
| **append** | Add Text to a text/Markdown destination using the selected separator policy. |
| **add** | Add record entries to the selected collection. |
| **add-unique** | Add records whose authored identity key is absent; repeated matching records do not accumulate. |
| **upsert** | Insert a missing keyed record or update an existing one using merge/replace field policy. |
| **update-fields** | Update only declared fields of existing keyed records. |
| **replace** | Replace the complete destination with explicitly supplied serialized Text. |

For a nested JSON collection, configure **Collection JSON Pointer**, for example `/souls`, and **Missing collection → error/create**. Keyed modes need an Identity field such as `id`; update-fields also needs its explicit allowed field list. Schema checks apply to the proposed result. Keyed mutations target JSON collections; JSON Lines and CSV support Add and Replace. Exact supported combinations are validated; append is not an instruction to paste raw JSON into the end of a JSON array.

**Project Document** uses the same mutation policies on a serialized source and produces projected Text/Data plus a proposed receipt, without any file authority or write. This lets a sword workflow project a new soul record, count the resulting `/souls` collection, test a threshold, and propose a level update before acceptance. Connect the final formatted proposal to Write to File using the original live reference. Reading and writing one target in the same graph is supported; source freshness and version checks protect the read-modify-write operation.

## Keep acceptance and saving distinct

During a unified Send, File, Clock Commit, Outcome Commit and accepted-policy Recall effects are staged. Preview, Run to here, failed branches and ordinary auxiliary results do not accept them. A full response stage must produce an owned fresh reviewed candidate, and the chosen candidate's effects must pass preflight before its publication.

Apply checks the original message/swipe, current user/chat/actor, graph signature, file references and applicable versions. It preserves the original native swipe and applies the chosen revision once. Chat changes, foreign edits, source swipe changes, canceled generations or changed private card/visibility labels can invalidate the proposal. Read again and regenerate rather than reusing stale private data.

Persistence is reported per effect. Publication and several stores are not one atomic disk transaction. If one confirmed target saves and a later target fails or conflicts, Preview records the partial result. A supported retry of that accepted bundle resumes its unconfirmed persistence steps without requesting models again, publishing another swipe or rewriting an already confirmed target.

The same acceptance rule covers proposals retained inside static systems. Apply uses Main's exact reviewed result, then confirms each file, clock and outcome target independently. Repeated Apply adds no model requests, random draws or already-confirmed saves.

An unknown save outcome is different from a retryable failure. **PERSISTENCE_UNKNOWN**, **save unconfirmed** or an unknown receipt holds later affected writes until fresh confirmed metadata reconciles the receipt. Do not turn an ambiguous save into a duplicate event by changing an idempotency key. The native host verifies freshly loaded metadata where available; a save wrapper resolving by itself is not a positive durability acknowledgment.

State and projection receipts shown before Apply remain proposed diagnostics. Accepted file content uses the schema you authored. A generic JSON writer does not automatically promote every nested `acceptance: "pending"` string in an arbitrary document to canonical truth; author the canonical event/state shape deliberately and consult the accepted effect receipt.

Memory Commit stages its effects for the accepted root Review / Publish result. Diagnostic execution never settles memory.

## Story time: midnight, 14:00 and eight-hour intervals

Story time is an authored clock measured in integer minutes. It is separate from your computer's wall clock and the number of messages sent. Add **Story Clock** to use the automatic **Chat clock**, starting at midnight on Day 1 with a 24-hour day. Select the node and use **Details → Starting values** to adjust its starting day, time and hours per day. **Advanced** contains the source, Visibility, required JSON Format and calendar settings. Changing these initial values leaves existing saved time intact.

Nodes choosing the same clock source share its saved timeline. Use **+** beside the Clock source in Advanced to create a named, independent clock; separate clocks do not synchronize automatically. **Story Clock** reads the accepted scoped clock document when the workflow runs.

For an explicit custom clock target, **Workflow → Configure → Workflow Data… → Story clock template** in the JSON editor remains available. It creates a valid starting schema whose internal `clockId` must match that target. This custom-target example uses minute 0 for midnight on Day 1, a 1,440-minute day and an explicit calendar identity:

```json
{
  "schemaVersion": 1,
  "clockId": "story-clock",
  "calendarId": "story-calendar",
  "dayLengthMinutes": 1440,
  "absoluteMinute": 0,
  "revision": 1,
  "unit": "minute",
  "originMinute": 0,
  "originDay": 1,
  "timeEvidence": { "kind": "explicit" }
}
```

Feed **Advance Time** an explicit proposal such as `{"kind":"duration","minutes":120}` or `{"kind":"destination","absoluteMinute":840}`. A model may help extract a stated duration, but vague prose such as “a while later” does not become an established duration automatically. Estimate evidence needs the explicit authored acceptance policy supported by the clock contract.

A **Time Trigger** schedule uses **daily** with minuteOfDay `0` for midnight or `840` for 14:00, **interval** with intervalMinutes `480` and an authored anchor for every eight hours, or **delay** for one due minute. Give each schedule a stable identity and revision. Each crossing has its own identity, including the exact due minute; selecting an old swipe does not consume another occurrence.

Advance Time can take authored schedules directly or through its schedules input. **interrupt** stops at the earliest unconsumed due event and returns the unprocessed duration on `remainder`. For example, a two-hour journey beginning at 13:00 stops at the 14:00 curse with an hour remaining. Feed the projected clock and retained remainder into a later Advance Time step only when the story should resume that journey. **catch-up** enumerates all due events across the whole interval, in deterministic order, within the configured limit. A limit overflow holds the whole projection.

The output clock and due occurrences are proposals. **Clock Commit** stages the genuine retained Advance Time report for acceptance; due IDs become consumed through that accepted clock path. A model or copied JSON report cannot manufacture the host's clock-write authority. Use the effective projected clock for time-based progression before acceptance, and preserve its calendar and occurrence timestamps.

## Generic values: XP, souls and relationship pacing

There is no dedicated XP or lust node. Use **State → progression** with explicit state values, a versioned authored rule table and confirmed occurrences. Rules address named existing values and support **add**, **set** or **clamp**, numeric bounds and authored identity fields. The ledger prevents an already consumed event identity from advancing the value again.

Use **Collection → count/sum/threshold/rule-lookup** and **Condition** for derived totals, level tables and consequences. For a soul-stealing sword, confirm an actual kill, preserve the victim/event identity, add-unique its canonical soul record, count the projected collection, and test the 100-soul threshold. A proposed future kill or mere mention of the sword supplies no settled soul.

For experience, choose stable authored objective/completion identities when one achievement should award once across rewrites or regenerations. A fresh prose source ID alone is not a universal quest-completion identity. Save the projected state with an explicit canonical JSON shape and authorized Write to File. Preserve unrelated fields when projecting a state update.

A slow-burn relationship can have directed values such as Mara's attraction toward Elias, separate from Elias's attraction toward Mara. Authored rules can apply scene/day positive caps, cooldowns, diminishing factors, zero-delta consumption policy and subject/object scope. A positive cap does not erase separately authorized negative consequences. Private values remain actor-private; numbers are authored story mechanics rather than proof of a person's feelings or consent.

**State → time-decay** uses the effective Story Clock and authored baseline/rate/bounds rules. It can reduce a temporary value over elapsed story minutes without changing an enduring relationship value. It does not use message count, real elapsed time or a model's guess of emotional truth. A proposed State result must still reach the appropriate accepted persistence path.

## Queue memories manually or recall them automatically

A **Recall** node reads checked stored records through an authorized Read File or native Memory source. Records have distinct `id`, the matching canonical `actorId`, nonempty `text`, and optional revision, partner IDs, tags, event ID, recency and source references. Whole matching records are selected within result, character and token budgets. A model rewrite or invented default record does not inherit live file-read authority.

For a file memory set, create an actor-private JSON target, Read File it in the correct actor scope, and route the record list to Recall's `records` pin. Set the same actor and `memorySetId` on Recall and **Recall Shortcut**. Wire Recall's Guidance causally into Generate Reply for a pre-generation reminder. Verify the actor's live presence independently. For keyword activation, connect the current Player Event Source to Recall's source pin; for event activation, supply genuine confirmed occurrences. A reply-stage trigger can affect response processing or a later generation, not the native prompt that already ran.

Queue recall from the right-click menu on a matching Recall or Recall Shortcut node, from a selection of those nodes, or from the Memory recall section in Details. A green recall-with-clock badge shows an available manual request; amber shows a reservation or a result awaiting acceptance. Click a badge to inspect its policy. Queue and Cancel do not run a model or change the workflow file.

**Workflow → Memory recall** offers commands for the selected nodes and all eligible nodes, plus **Memory recall overview…**. The overview groups matching nodes into one row per memory set. Several selected cards can represent one request. Repeating Queue preserves its remaining uses and pending generation; Cancel removes that shared manual request and its pending claims. Automatic triggers keep their own conditions.

| Setting | Meaning |
| --- | --- |
| Reply / Generated swipe / Reply and generated swipe | Which newly generated operations may use recall. Navigating an existing swipe does not consume a use. |
| Next matching generation | Spend one eligible use. |
| Once for each generation type | Keep one reply allowance and one generated-swipe allowance. |
| Until cancelled | Repeat until explicitly cancelled. |
| Successful completion | Spend only after the full workflow completes successfully. Later rejection does not refund it. |
| Accepted result | Spend when the reviewed candidate is accepted. Stop, failure and Reject release the pending reservation without spending it. |

Recall Shortcuts default to Control+Shift+M and use physical key codes. Letter and digit shortcuts require Control, Alt or Meta; function keys also work. R and every modified R combination are reserved for Run to here. Shortcuts skip typing in inputs, textareas, selects or editable text, composition, key repeat and focused menus. Duplicate active combinations require different keys.

Matching Shortcuts must agree on target, repetition and consumption settings. Different physical keys can share a request. A Recall without a matching Shortcut explains how to add one. Automatic-only Recall nodes are excluded from manual queue actions. For independently requested retrieval selections, use different memory-set IDs; the first successful matching Recall supplies the selection for a given generation.

Queues are private ephemeral session state. They are excluded from workflow files, exports, settings, Undo and modified-file status. Changing the semantic graph or opening/replacing a document revokes obsolete queues and shortcuts, even if the replacement has identical contents. Switching user/chat/actor hides unrelated queues; returning to the same unchanged document and scope may reveal an unspent request. Disabling Lattice hides active badges and makes controls unavailable; re-enabling the same document may reveal an unspent queue.

Native Recall serves the selected native actor. Other present actors can have independent Actor Context/private file branches, but their Recall cannot supply private guidance for the selected actor. Recall guidance and diagnostic selections stay actor-private; Render Notes does not declassify them.

## Move an existing pre/post setup

Saved native-pre and native-post roots are retired. Migration preserves their original graphs, bindings and active selection in a cold archive. Existing unified documents remain available as recovery drafts. If the previous active document is retired, Lattice opens a unified document or starter with integration disabled. Archived roots cannot execute, open as current documents, or import into current workflows.

**File → Export archived workflows** saves a copy of the recovery archive as JSON. This recovery action makes no model requests and does not convert the contents. Preserve that saved copy while rebuilding a needed process in a new unified workflow or updated example:

1. Place preparation Context/Text/Guidance logic upstream of Generate Reply and set explicit stages.
2. Wire bounded Guidance into Generate Reply's guidance pin.
3. Use the owned Generate Reply Draft for processing this generation's response.
4. End the final Draft in Review / Publish. Patch tools retain diagnostic utility but do not grant publication authority.
5. Group ordinary nodes freely into static bodies, including sources, Memory, Recall and native lifecycle nodes. Keep one owned On Send → Generate Reply path; For Each keeps its restricted helper contract.
6. Rebind local model/helper connections, authorize documents, inspect supported outputs with Run to here, then keep the unified document open and select **Enable Lattice**.

Current imports preserve pinned identities and controls; additive imports use stage/type checks. There is no automatic converter or production compatibility starter for a retired root.

## When a run holds

| Symptom | Check |
| --- | --- |
| A unified Run cannot generate | Start with ordinary SillyTavern Send with the configured document open and Lattice enabled; manual Run to here only tests supported dependencies. |
| A model branch has no usable connection | Configure that node and each selected For Each helper role; inspect the effective profile/model and explicit nested overrides. |
| A condition is unresolved | Inspect the missing path, null Decision answer or confidence middle range; wire an explicit unresolved policy. |
| No character call occurred | Confirm genuine current-scene presence and exact loaded canonical identity; absent actors deliberately skip. |
| Private material cannot reach a general model or notes | Use public Scene Context for observable narrative or an actor's grant-backed Actor Context for its own private leg. |
| A file target/reference is unavailable | Authorize it in the current user/chat, select the correct actor scope, and use the actual Read File reference. |
| A time step holds | Supply explicit forward integer minutes, matching calendar, valid schedules and a sufficient bounded due-event limit. |
| Apply is stale | Return to the unchanged owned message/swipe or generate a fresh result; an edited graph/source cannot authorize the old candidate. |
| A partial Apply failed | Inspect per-effect receipts; supported retry resumes persistence, while an unknown save requires reconciliation first. |
| Recall did not activate | Check Enable Lattice, active selected actor, presence, source/record ancestry, target/use policy, budgets and pending claims in Memory recall. |

For provider route and token-budget limitations, use [Model connections and host integration](native-workflows.md). For exact ports and controls, use the [node reference](node-reference.md). The [design documents](README.md#workflow-design-records) retain the broader proposals and open choices; this guide describes the authoring and host behavior implemented in the workspace.
