# Unified workflows in LATTICE

[Documentation](README.md) · [Quick start](lattice-workspace.md) · [Node reference](node-reference.md) · [Model connections](native-workflows.md)

A unified workflow prepares guidance, waits for SillyTavern to generate its ordinary reply, and then processes that reply in the same graph. The one open workflow document supplies both stages when Arm is enabled. Preparation and response remain useful stages inside it.

The normal SillyTavern connection writes the main reply. Other model nodes have their own connections and can plan, judge, revise, extract or enrich material. Their outputs become graph artifacts that you can inspect before applying the final result.

## Apply an example to Story-2

1. In SillyTavern, select **default-user**, open **Story-2**, and select the character who will produce the native reply. User, chat and character selection determine the workflow's live sources and private stores.
2. Open LATTICE beside the chat's Send button, or enter `/lattice`. A fresh workspace opens **Unified story workflow** with **Arm** off. Existing installations restore their current document from a recovery draft; earlier collections remain available through **File → Recover previous workflows**.
3. Choose **File → Open examples…**. Open a unified example whose goal fits your story. Each opening makes a new editable copy the active document after offering to save unsaved changes. Opening preserves Arm and makes no request. The example's description contains its setup and inspection instructions.
4. Adapt its literal instructions, actor/item identities, schemas and document targets. Example names and actors are authored demonstration material. A loaded character's canonical ID is normally `character:<avatar filename>`; a display name alone is not a live actor identity.
5. Choose every ordinary text-model node’s connection in its grey profile bar or **Details → Connection profile**. Use **Active SillyTavern model** to follow the current host connection/model, or choose a saved Connection Manager profile for a fixed connection. Leave **Model mode → Use profile model** unless that particular node needs an explicit model identifier. Configure any **For Each → Helper model bindings** as well; assigning the extraction node's profile does not assign its confirmation helper.
6. If the example reads or writes documents, authorize its named targets in **Tools → Story documents…** first. If it uses Fast Decision, configure **Tools → Fast connections…** and select that connection in the node. Resolve the graph's validation and binding issues before sending.
7. Keep this unified workflow open and enable **Arm**. Send uses the active document; switching to another file or example changes the workflow used by subsequent sends while preserving Arm.
8. Return to SillyTavern and **Send** your next player message normally. The workflow runs the necessary preparation, resumes from the completed native Draft, and records its response-stage results. A generated swipe can run the same open workflow when its configured sources and target policies permit it.
9. Open Preview and select the desired **Review / Publish · Host result**. Compare the original, proposed body, appended sections, model trace and staged consequences. Choose **Apply reviewed candidate** or **Reject candidate**.

Apply creates a new assistant swipe and preserves the native original. It then settles the effects associated with that exact reviewed root result. Reject leaves the original and does not accept its pending file, clock, random-outcome or accepted-policy Recall effects. A completed candidate is still a proposal until you apply it.

Save your configured workflow with **File → Save workflow**, or use **Save As…** for a new JSON file. Native saving retains local bindings and workspace views; **Open Recent** reopens previously used files. If the browser lacks native file saving, **Download JSON…** offers a copy without confirming that the current file was saved. LATTICE's recovery draft in SillyTavern is separate from these files.

Use **Run to here** to inspect supported preparation or source operations without accepting changes. A full unified workflow containing Generate Reply needs an owned SillyTavern generation; a manual Run does not secretly start another main reply. Legacy pre/post tools still support their existing explicit Run behavior.

## Pick a concrete starting flow

For the guidance/prose/items idea, open **Guide, revise and annotate a scene**. Edit its literal Compose guidance for Story-2, then choose local profiles on **Revise Draft**, **Extract** and **Enrich**. The native reply still uses SillyTavern’s active main connection. Revise Draft polishes narration, Extract keeps source-quoted items, Enrich adds labeled suggestions, and Render Notes → Append adds the expandable section. Inspect the final body and notes together before Apply.

| Example title in the picker | What to configure first |
| --- | --- |
| **A broken wand with a genuinely wild branch** | Current player-use entities, checked effect library, accepted outcome target and For Each confirmation/effectAuthor roles. |
| **A separate prompt for the character in this scene** | Loaded canonical actor identity, source-backed participation and the Character Direction connection/system prompt. |
| **An item recalls a memory for its actual holder** | Item aliases/entities, confirmed ordered holder state and that actor’s private document/Prompted Memory branch. |
| **A kiss leaves two separate private memories** | Both actors’ actual IDs, the configured typed Fast connection/gate, explicit permission to author both reflections, separate Actor Context models and private targets. |
| **Recall private moments on a hotkey or scene trigger** | Selected actor, authorized record set, matching Recall/Hotkey memory-set IDs and the visible arm policy. |
| **A soul-stealing sword levels up at 100** | Canonical soul list, confirmed kill identities, projected count/threshold and authorized keyed write. |
| **Slow-burn directed relationship pacing** | Directed actor scope, authored progression/decay rules, effective story clock and private state target. |

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

Nodes usable in either stage expose **Stage → Preparation / Response** in Details. Those settings place an operation around the generation boundary without introducing another workflow selector. Conditions and branch outcomes distinguish **completed**, **skipped** and **unresolved**. A skipped optional contribution can be omitted by Join; an unresolved required contribution holds its dependents rather than treating uncertainty as false.

## Choose a different model for each job

Ordinary model operations can follow **Active SillyTavern model** or use a fixed local Connection Manager profile. Configure Model Call, Decision, Revise Draft, Extract, Enrich, Character Direction and other model-backed nodes independently. New ordinary text-model nodes select the active option; existing fixed and inherited bindings remain. The grey bar below a model node opens a searchable picker: keywords match a saved profile’s name, API label and model, while the active option stays first. Details also exposes Connection profile and an optional model override. A fixed profile supplies its provider route, sampler preset and model; the active option follows the host’s configured route/model at request time. LATTICE does not switch SillyTavern’s active main connection globally.

A **Model Call** accepts a Text prompt and optional Context/Data evidence, returning Text or schema-checked Data. **Revise Draft** returns a source-bound Draft revision. Select its editable scope and protected literals explicitly. **Extract** produces records, while **Enrich** adds bounded details to supplied records. A subsequent **Render Notes → Append** can add a public notes dropdown to the reviewed reply. Render Notes accepts player-visible records; private memories and hidden material cannot become public notes merely through formatting.

For a real reusable iteration, select **For Each** and inspect **Helper model bindings**. Each text-model role used by the exact pinned helper has its own friendly Connection profile and Model mode selector. You can use the helper's saved connection, choose **Active SillyTavern model**, choose a local profile and its model, retain a helper model choice, or enter a custom model identifier. Imported helpers with unassigned roles can be configured here without editing or repinning their bodies.

An explicit outer role override reaches recursive helpers. Explicit choices in a nested For Each, wrapper or primitive node take precedence; Details reports these exceptions. A helper without text-model calls needs no text profile. Fast Decision’s typed connection and optional explicit fallbackProfileId remain separate settings on the authored Fast node; a fallback connection is not an ordinary helper text role. Keep the helper's iteration limit and per-item request bound large enough for the authored path, but finite: exceeding a bound holds the run instead of silently processing a partial list. The helper pin includes its exact ID, version and semantic hash; updating a library entry does not silently change placed copies.

Portable exports omit local saved-profile identifiers and credentials, including local helper-role overrides. After importing on another installation, choose its fixed local profiles again where needed. **Active SillyTavern model** remains a portable selection and follows the recipient’s configured host connection/model. Portable model names may remain, so confirm they are valid for the newly selected route.

## Decision, Fast Decision and confidence

**Decision** uses an ordinary text-model connection to answer keyed typed questions. The available question types are `noul` (yes/no/unresolved), `choice` (authored alternatives) and `score` (an ordered rubric). A noul text answer exposes `answers.<id>.accepted` as true, false or null. Model-generated confirmation-looking prose is not a canonical event by itself.

**Fast Decision** uses a configured typed Jev, Laya or compatible SystemOne connection. It does not turn an arbitrary chat model into a typed provider or install a local server automatically.

1. Open **Tools → Fast connections…** and create a named connection ID.
2. For **Jev API**, enter the typed model and session API key. The endpoint is fixed to `https://api.typesafe.ai/v1/systemone`.
3. For **Laya** or **Compatible typed API**, enter the complete `/v1/systemone` endpoint, using HTTPS or HTTP on localhost. Start and configure that service separately. A session key is optional for an unauthenticated local service.
4. Save, select the Fast Decision node, and choose its **Fast connection**. Session keys are not exported or saved in workflow JSON; re-enter them after restarting SillyTavern.
5. Define the question IDs and rubrics. Connect the output to a **Confidence Gate** with an explicit metric path and acceptance/rejection thresholds.

For a kiss check, a noul question named `kiss` could ask whether the supplied reply establishes an actual kiss between the two named actors, excluding a wish, suggestion or recollection. Its Fast metric path is `["answers", "kiss", "noul"]`. For example, a higher-is-better gate with `acceptMin: 0.9` and `rejectMax: 0.1` routes the middle range to **unresolved**. These numbers are your policy, not a guarantee that the provider is correct. Gate output wraps the decision and supplies an explicit `accepted` result on its accepted/rejected routes.

A Fast Decision fallback is opt-in. **Allow Decision fallback** requires a separately selected text connection and an explicit list of supported error codes. The extra request is included in the node's bound. Cancellation and changed bindings never authorize a fallback. Fallback returns the ordinary Decision answer shape, including `accepted` rather than a typed `noul` probability. Inspect `source`/`fallback` and route or adapt it explicitly; a missing probability leaves a probability gate unresolved. A probability, confidence score or successful request does not alone permit a state write: use the confirmed-event and accepted-effect path appropriate to the consequence.

## Triggers need a source and an event policy

Use **Player Event Source** when a rule responds to the actual player message before generation. It supplies bounded current-turn text and host source identity. Repeated reads of the same turn retain that identity; a later identical message is another turn. Restricted native text is held rather than exposed as a public trigger source.

For the completed narrative, connect Generate Reply's Draft through **Draft Event Source** with an authored entity/scope table. Its source describes the narrative body, excluding appended notes. **Item Mention Trigger** matches declared aliases in a declared watch source. A mention can activate a reminder; it does not establish item use, ownership or a kill.

**Item Use Trigger** either normalizes supplied candidate interpretations or makes one bounded extraction request. Use **Event Normalize** for other authored event types. Then use Decision/Fast Decision and **Confirm Events** to distinguish actual occurrences from attempted, negated, hypothetical, quoted or remembered actions. Keep exact quoted source spans and closed actor/item identities. **Current Holder** applies the confirmed event sequence to an explicit holder state; it does not guess ownership from the nearest name.

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

Connect the exact verified presence to **Character Direction** to apply a separate `systemPrompt` only when that character is present. Absence skips its model call; unresolved participation holds it. The request receives that actor's authorized card fields, scene context and stored memories. Its output is actor-private Guidance. Generate Reply accepts that exact live guidance only for the currently selected native actor.

Use **Actor Context** for a character's own Model Call. It makes no request and returns authorized card/context/memory material with actor-private visibility. Two present loaded actors can have separate Actor Context branches, separate model requests and separate private file targets. Do not join their private inputs into a common request or append their reflections to public scene notes. Public Scene Context can supply observable narrative to a general model; the default actor-perspective Scene Context is not a substitute for a grant-backed Actor Context.

A paired memorable-moment workflow can confirm an actual kiss in the completed body, gate it, then request one reflection per actor. The published kiss example defaults `reflection-authorship-text.allowModelAuthoredFeelings` to `false`: both private reflection calls and writes are skipped while ordinary reply review remains available. Set it to `true` only with explicit author permission to portray both actors’ private feelings, especially a player-controlled character. Configure each Read File and Write to File with **Actor scope → presence**, that actor's canonical ID, and its exact Scene Presence input. Keep each actor's records and model Context on its own leg. Each saved record keeps `sceneSummary` as the exact canonical kiss quote and `sceneEvidence` as its source/span. `reflection` and Recall-compatible `text` contain model-authored interpretation, explicitly marked by `reflectionOrigin: "model-authored"`; stable `id`, `eventId` and `sourceRefs` come from the canonical evidence. Both staged writes can belong to the same reviewed root result. If the second target conflicts after the first was saved, the first remains confirmed and retry resumes the remaining persistence work.

Native generation currently has one selected actor. Actor Context allows separate present-actor processing; it does not authorize another actor's private direction as the selected actor's native guidance. Group generation and automatic multi-character native prompting are not implied by a public cast list.

## Authorize Story Documents and preserve their structure

**Tools → Story documents…** manages logical targets for the actual user and chat. A target such as `souls.json` is a scoped story-document identifier, not an arbitrary operating-system file path. Canonical document content lives in LATTICE's chat metadata store.

Create an authorization with a unique target ID, display name, format, visibility and initial template. Formats are **JSON**, **JSON Lines**, **CSV**, **Plain text** and **Markdown**. CSV needs declared columns. Actor-private authorization also needs its canonical actor ID. Hidden documents cannot be exposed to public model/notes branches by changing a graph label.

The initial template defines the structure used before canonical content exists. Updating an authorization or its template leaves existing canonical document content intact. For an existing authorization, explicitly choose **Load initial template** before editing that template. **Remove authorization** revokes access; it is not a graph instruction to delete a filesystem file.

Adding nodes with required controls opens **Configure node**. Pick the Preparation/Response stage, authorized target or exact pinned Data helper where offered, and complete the declared controls. Cancel leaves the graph unchanged. Other controls remain editable in Details. A node can be valid without making its branch selected: connect its result where it is needed.

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

An unknown save outcome is different from a retryable failure. **PERSISTENCE_UNKNOWN**, **save unconfirmed** or an unknown receipt holds later affected writes until fresh confirmed metadata reconciles the receipt. Do not turn an ambiguous save into a duplicate event by changing an idempotency key. The native host verifies freshly loaded metadata where available; a save wrapper resolving by itself is not a positive durability acknowledgment.

State and projection receipts shown before Apply remain proposed diagnostics. Accepted file content uses the schema you authored. A generic JSON writer does not automatically promote every nested `acceptance: "pending"` string in an arbitrary document to canonical truth; author the canonical event/state shape deliberately and consult the accepted effect receipt.

Legacy Memory Commit retains its documented immediate full-root Post settlement. Unified memory effects join the accepted root result. Review the workflow mode before treating a full Run as a harmless memory preview.

## Story time: midnight, 14:00 and eight-hour intervals

Story time is an authored clock measured in integer minutes. It is separate from your computer's wall clock and the number of messages sent. **Story Clock** reads the accepted scoped clock document. In Story documents' JSON editor, **Story clock template** creates a valid starting schema: minute 0 is midnight on day one, with a 1,440-minute day and an explicit calendar identity.

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

## Arm memories manually or recall them automatically

A **Recall** node reads checked stored records through an authorized Read File or native Memory source. Records have distinct `id`, the matching canonical `actorId`, nonempty `text`, and optional revision, partner IDs, tags, event ID, recency and source references. Whole matching records are selected within result, character and token budgets. A model rewrite or invented default record does not inherit live file-read authority.

For a file memory set, create an actor-private JSON target, Read File it in the correct actor scope, and route the record list to Recall's `records` pin. Set the same actor and `memorySetId` on Recall and **Hotkey Arm**. Wire Recall's Guidance causally into Generate Reply for a pre-generation reminder. Verify the actor's live presence independently. For keyword activation, connect the current Player Event Source to Recall's source pin; for event activation, supply genuine confirmed occurrences. A reply-stage trigger can affect response processing or a later generation, not the native prompt that already ran.

Open **Tools → Recall arms…** with the unified workflow open and LATTICE enabled. It shows the live user/chat/actor, each configured memory set, its shortcut, remaining reply/swipe eligibility and pending generations. Use **Arm** and **Disarm** here, or the configured shortcut. An armed badge opens the same panel. Running Hotkey Arm in Preview does not arm it.

Hotkeys use physical key codes, such as Control+Shift+R. They require Control, Alt or Meta for letter/digit keys, or a function key. They do not fire while typing in inputs, textareas, selects or editable text, during composition or key repeat. Duplicate active shortcuts require different combinations.

| Policy | Behavior |
| --- | --- |
| **target: reply / swipe / both** | Eligible next native reply, newly generated swipe, or either; browsing an existing swipe is not generation. |
| **uses: next-match** | Consume one eligible matching generation. |
| **uses: one-per-type** | Keep one reply allowance and one swipe allowance. |
| **uses: until-disarmed** | Continue matching eligible generations until disarmed. |
| **consumeOn: success** | Consume after the complete workflow succeeds, even if its later candidate is rejected. |
| **consumeOn: accepted** | Consume only when the exact reviewed result is accepted. Stop, failure and rejection preserve unspent eligibility. |

Arms are ephemeral session state, not portable workflow data. User/chat/workflow/actor changes prevent an unrelated scope from using them; changing the workflow signature revokes its old arm and shortcut. Returning to a retained original scope can expose its unspent arm again. Inspect the current panel after switching, and re-arm if needed.

Native Recall currently serves the selected native actor. Multiple present actors may have independent Actor Context/private file branches, but a second actor's Recall cannot be injected as private guidance for the selected actor. Recall guidance and diagnostic selections stay actor-private; Render Notes does not declassify them.

## Move an existing pre/post setup

Saved **native-pre** and **native-post** workflows remain openable with **File → Open workflow…** or **File → Recover previous workflows** for the former settings collection. Legacy tools run manually through **Graph → Run workflow**. With Arm enabled, an open Pre document also adds guidance before Send; an open Post document remains manual. Opening a legacy document replaces the active unified document, so only the open document participates in Send.

There is no automatic legacy converter. Create a new unified workflow or open an updated example, then reuse suitable operations or pinned subgraphs explicitly:

1. Keep preparation Context/Text/Guidance logic upstream of Generate Reply.
2. Replace the legacy host Guidance terminal with a wire to Generate Reply's guidance pin.
3. Replace a latest-reply Snapshot dependency with the owned Generate Reply Draft where the response process needs this generation's reply.
4. Keep compatible patch validation where useful, or use Revise Draft for direct source-bound Draft revisions. End the final Draft in Review / Publish.
5. Keep native sources, Memory, file references, Recall, clocks and publication at the root when their contracts require it. Reusable pure processing belongs in subgraphs.
6. Rebind local model and helper connections, authorize documents, inspect the graph, save the document, then keep it open and enable Arm.

Imports and exports preserve pinned definition identities and supported saved controls. Adding a fragment is a reviewed edit with phase/type checks, not an implicit conversion between workflow modes. Preserve the original legacy graph while adapting a copy.

## When a run holds

| Symptom | Check |
| --- | --- |
| A unified Run cannot generate | Start with ordinary SillyTavern Send while the unified document is open and Arm is enabled; manual Run to here only tests supported dependencies. |
| A model branch has no usable connection | Configure that node and each selected For Each helper role; inspect the effective profile/model and explicit nested overrides. |
| Fast Decision cannot connect | Verify the typed connection/model, full endpoint and session credential; a text profile is not a SystemOne capability. |
| A condition is unresolved | Inspect the missing path, null Decision answer or confidence middle range; wire an explicit unresolved policy. |
| No character call occurred | Confirm genuine current-scene presence and exact loaded canonical identity; absent actors deliberately skip. |
| Private material cannot reach a general model or notes | Use public Scene Context for observable narrative or an actor's grant-backed Actor Context for its own private leg. |
| A file target/reference is unavailable | Authorize it in the current user/chat, select the correct actor scope, and use the actual Read File reference. |
| A time step holds | Supply explicit forward integer minutes, matching calendar, valid schedules and a sufficient bounded due-event limit. |
| Apply is stale | Return to the unchanged owned message/swipe or generate a fresh result; an edited graph/source cannot authorize the old candidate. |
| A partial Apply failed | Inspect per-effect receipts; supported retry resumes persistence, while an unknown save requires reconciliation first. |
| Recall did not activate | Check Arm, active selected actor, presence, source/record ancestry, target/use policy, budgets and pending claims in Recall arms. |

For provider route and token-budget limitations, use [Model connections and host integration](native-workflows.md). For exact ports and controls, use the [node reference](node-reference.md). The [design documents](README.md#workflow-design-records) retain the broader proposals and open choices; this guide describes the authoring and host behavior implemented in the workspace.
