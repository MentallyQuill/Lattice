# Unified workflows in Lattice

[Documentation](README.md) · [Quick start](lattice-workspace.md) · [Operator’s manual](operators-manual.md) · [Model setup](native-workflows.md)

A unified workflow prepares guidance, lets SillyTavern write its usual reply, and processes that reply in one connected graph. **Preparation** runs before reply writing; **Response** processes the completed reply. You keep one workflow open rather than switching between separate graphs.

Your usual SillyTavern connection writes the main reply. Other model tools can plan, judge, revise, extract, or enrich material with their own connections. Preview lets you inspect their results. A **Draft** is the reply being processed; **Guidance** is advice connected to the main reply model.

## Apply an example to your story

1. Open your SillyTavern chat and select the character who will reply. User, chat, and character selection determine live sources and private stores.
2. Open Lattice beside the chat bar, or enter `/lattice`. A fresh workspace opens **Unified story workflow** with Lattice disabled. Existing installations restore a recovery draft; **File → Recover previous workflows** offers previous unified documents.
3. Choose **File → Open examples…** and read a lesson’s requirements. Opening creates an editable copy, makes no model request, and does not change **Enable Lattice**.
4. Replace sample instructions, actor/item identities, and document targets with your story’s values. Loaded character IDs normally use `character:<avatar filename>`; a display name alone is not a live actor identity.
5. Click each model tool’s grey bar and choose **Active SillyTavern model** or a saved Connection Manager profile. Leave **Advanced model settings → Model mode → Use profile model** unless that tool needs a different identifier. Configure any **For Each → Helper model bindings** separately.
6. Automatic Story Clock, Read File, and Outcome Commit sources need no setup. Authorize named lesson targets in **Workflow → Configure → Workflow Data…** and resolve validation or connection issues.
7. Select **Enable Lattice** with this document open. Switching between Main and its subgraph tabs changes your view, not the workflow used by Send.
8. Send your player message normally. Lattice prepares connected guidance, continues from the completed reply, and records its response processing. A generated swipe can use the same workflow when its sources and policies permit it.
9. Select **Review / Publish → Host result** in Preview. Compare the original, proposed reply, appended notes, model trace, and staged changes. Choose **Apply reviewed reply** or **Reject reply**.

Apply adds a new assistant swipe preserving the original, then accepts the effects attached to that exact result. Reject does not accept pending file, clock, outcome, or accepted-policy Recall effects. A completed proposal still needs your choice.

**Run to here** tests supported steps without accepting changes or starting another main reply. A test that includes model tools can make requests. See [the lessons guide](examples.md) for setup and request budgets.

## Pick a concrete starting flow

For a planner and editor around the normal reply, open **Plan, write, polish, and annotate one reply**. Edit its Compose guidance, then configure Revise Draft, Extract, and Enrich. Revise Draft polishes narration; Extract records source-quoted items; Enrich adds labeled suggestions; Render Notes → Append adds an expandable section. Review the reply and notes together.

| Example | Configure first |
| --- | --- |
| **The broken wand: stable randomness with a wild branch** | Player/item identities, effect library, outcome document, and confirmation/effect-author helper roles. |
| **Give one present character their own direction** | Loaded actor ID, participation evidence, Character Direction connection, and instructions. |
| **Let an item remind its actual holder** | Item aliases, prior ownership, ordered confirmed events, and the holder’s private memory branch. |
| **One kiss, two private perspectives** | Both actors’ IDs, Decision connection, separate reflection permissions, actor contexts, and private documents. |
| **Recall a memory with a hotkey or a story trigger** | Selected actor, authorized records, matching memory-set IDs, and queue policy. |
| **The soul-stealing sword: an event ledger and a threshold** | Canonical soul list, confirmed kills, threshold, and keyed document update. |
| **A relationship that changes slowly over weeks** | Directional actor scope, progression/decay rules, story clock, and private state document. |

Use each lesson’s description for its exact starting data and helper setup. The [story systems guide](story-systems.md) explains the possibilities in roleplay terms.

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

Connect On Send’s activation to Generate Reply’s required activation input. Connect planning Guidance to its optional guidance input. Its Draft is the completed reply for this generation and can feed several response branches. Its metadata describes the generation; it does not permit publication of another reply.

A unified workflow has one native generation boundary. Generate Reply uses the main SillyTavern connection, with no second profile selector. Its guidance budget limits the advice Lattice supplies. Quiet/background, impersonation, unsupported media/tool continuations, and overlapping generations do not supply interchangeable Drafts.

Connections decide dependencies. A Preparation label alone does not put text into the main prompt: connect it to guidance or another required preparation input. A response branch must reach a selected terminal or consumed output to run. Canvas position does not determine order. Cycles, incompatible types, invalid pins, and unsupported helper nodes fail validation.

Tools that support both stages expose **Stage → Preparation / Response**. A skipped optional branch can be omitted by Join. An unresolved required branch holds its dependents; uncertainty is not automatically false.

## Detect and filter a reply

Enter Pattern rules through **Rules → Terms / CSV**. `Elara` creates one rule; `1, 2, 3` and `["1", "2", "3"]` create three string rules. Quote CSV phrases containing commas, such as `"red, blue", green`. Choose Plain text for one literal phrase containing separators. Save validates the entire edit without running it. Regex uses expression rows.

**Readable** shows retained prose, separate captured messages where available, and counted reports. **Source** shows the retained diagnostic data, with privacy filtering and omission notices. A generated Draft does not include prior private context; inspect the separately captured Context for that material. Switching views, copying, expanding, and pinning does not run or publish anything.

Open [Detect, route and filter a reply](../examples/pattern-filter-reply.lattice.json) in a practice chat with its [synthetic source](../examples/remastered/fixtures/pattern-filter-reply.txt). Pattern matches whole words, leaves the Draft unchanged, and reports Matched and Matches:

1. Connect Pattern `out` to Branch `in`, and `matched` to Branch `condition`.
2. Connect Branch `yes` to Filter Text `in`, and Pattern `matches` to Filter Text `matches`.
3. Connect Filter `out` and Branch `no` to optional Draft inputs on Join.
4. Connect Join `out` to Review / Publish `draft`.

Repeated hits choose the branch once per reply; a matching paragraph is removed once. Filter can remove matching units or keep them by removing nonmatching units. Lines use actual separators; paragraphs retain original blank-line delimiters.

Each selected unit must fit completely inside permitted editing spans and avoid protected or exempt text. A blocked unit holds output without a partial deletion. An empty resulting reply also holds review. Incomplete detection is unresolved; an ordinary no-hit report takes the unchanged bypass. Pattern and Filter Text use no model requests.

Copying a report does not make it valid evidence for deletion. Review the retained reports and final Draft before accepting.

## Combine editable systems in one Main

Keep one **On Send → Generate Reply → Review / Publish** path. It can cross static subgraphs: the connections become typed inputs and outputs while the enclosing workflow still owns one activation and reply.

Package item effects, weather, or relationship state as separate bodies. Choose **Workflow → Add system…**, select a saved body, bind inputs and destinations, and **Preview connections** before adding. It targets Main even when a body tab is focused. For Guidance, choose an existing Compose merge or create one when Generate Reply’s guidance input is empty. Occupied inputs require an explicit choice. A state-only system can stage changes without adding prompt text.

Compose combines Guidance sections in your chosen order. Each row’s **Kind**, **Required input**, and **Skipped source** controls its behavior. Use optional Guidance with **Omit section** when a system may skip. Completed connected material replaces the Text fallback; an unconnected optional input retains it. Required or unresolved sources keep their dependency rules. An omitted `{{section:Name}}` renders empty in a template.

**Token budget** caps the complete composition; 0 adds no Compose cap. Overflow holds rather than shortening the text. Generate Reply still checks its final budget. Preview records the rendered text and ordered contributions. Merging the selected actor’s original Character Direction or Recall Guidance preserves its permission; mixing private Text or Data into Compose does not grant private prompting access.

Select a wrapper and use **Details → Run this system** to include or skip the whole body, including reads, model calls, changes, and automatic data setup. Closing its tab only changes the view. Save/Open retains Main, definitions, instance settings, and tabs. Portable export keeps the composition and its saved dependencies.

Ordinary nodes, including native sources, Memory, State, Recall, and the reply lifecycle, can run inside static bodies. Their actor, target, and source checks still apply. State can use the enclosing workflow’s captured memory. Nested Memory Commit waits for acceptance, and Recall distinguishes reused instances. **For Each** has a separate helper contract: it cannot run host operations, and State needs an explicit snapshot.

Try the [combined wand, weather, and relationship example](combined-system-example.md). It uses one clock, public item/weather guidance, and private relationship state. The eight-hour wait is an agreed story action. Apply stages three independent saves; Reject and Preview leave the saved starting data intact. It is separate from the 30 lessons.

## Choose a different model for each job

Configure Model Call, Decision, Revise Draft, Extract, Enrich, Character Direction, and other model tools independently. New ordinary text-model nodes use **Active SillyTavern model**; existing saved bindings remain.

The grey bar opens a searchable connection picker. Search matches profile name, API label, and model; the active option stays first. Details has advanced overrides, binding information, errors, and reset. A saved profile supplies its provider route, sampler preset, and model. The active option follows the host at request time. Lattice does not change the main connection globally.

**Model Call** accepts a Text prompt and optional Context/Data, returning Text or schema-checked Data. **Revise Draft** produces a revision of the source reply; choose its editable scope and protected wording. **Extract** produces records; **Enrich** adds bounded details. **Render Notes → Append** can add public notes, but cannot expose hidden or private records.

For iteration, open **For Each → Helper model bindings**. Configure each model role used by the saved helper. You can retain its saved choice, follow Active SillyTavern model, use a local profile, or supply a custom model identifier. Imported helpers can be bound here without editing their bodies.

An outer role override reaches nested helpers, but explicit nested choices take precedence. Details reports these exceptions. A helper with no model calls needs no model profile. Keep iteration and per-item request limits finite; exceeding one holds the run rather than processing a partial list. Helpers use exact saved versions, so updating the library does not silently update placed copies.

Portable exports omit local saved-profile identifiers and credentials, including helper overrides. Recipients reselect fixed local profiles. Active SillyTavern model stays portable. Check any retained model names against the new route.

## Decision and confidence

**Decision** asks keyed questions with three types: `noul` for yes/no/unresolved, `choice` for authored alternatives, and `score` for an ordered rubric. A noul answer exposes `answers.<id>.accepted` as true, false, or null.

Select that field with **Select Fields**, then route it through **Branch** or **Confirm Events**. Null does not mean acceptance. Model-written confirmation prose alone does not establish an event.

**Confidence Gate** applies authored acceptance and rejection thresholds to a numeric metric, with an unresolved middle range. A score or successful request does not save state: continue through confirmation and the accepted-effect path.

## Triggers need a source and an event policy

Use **Player Event Source** for a rule responding to the current player message before generation. Repeated reads retain that turn’s identity; a later identical message is a new turn. Restricted native text is held rather than exposed publicly.

For a completed reply, connect its Draft through **Draft Event Source** and declare the actors/items and scope. It reads the narrative body, excluding appended notes. **Item Mention Trigger** matches declared aliases in its watched source. A mention can start a reminder; it does not establish use, ownership, or a kill.

**Item Use Trigger** checks supplied interpretations or makes one bounded extraction request. **Event Normalize** handles other declared event types. Decision and **Confirm Events** distinguish actual occurrences from attempts, negation, hypothetical, quoted, or remembered actions. Preserve exact quoted evidence and declared identities.

**Current Holder** applies ordered confirmed events to explicit prior ownership. It does not choose the nearest named character. A holder-memory path can connect:

```text
Player Event Source → Item Use Trigger → confirmation helper → Collection flatten
                                                               ↓
prior holder state ───────────────────────────────────→ Current Holder
                                                               ↓
verified Scene Presence ──────────────────────────────→ Prompted Memory
                                                               ↓
                                         private proposal → Write to File
```

Prompted Memory needs both the configured actor’s verified live presence and unchanged confirmed holder event. **Recall**, **Create**, and **Recall-or-create** are separate modes. Creation also requires `allowCreate`; created memory stays a proposal until its authorized save is accepted. Connect the branch to a selected terminal.

## Character-specific direction and private reflections

Use scene evidence to identify current participants with canonical actor IDs and quoted participation. **Scene Presence** reports one actor as present, absent, or unresolved. A literal or imported cast label cannot grant access to private character data.

Connect verified presence to **Character Direction**. It calls its model only when that actor is present; absence skips and unresolved participation holds. The request uses that actor’s authorized card, scene context, and memories. Its optional **Data** input accepts public values or State/file values authorized for that same actor. Mixed private scopes hold before a request.

Character Direction’s system prompt stays literal. Its private Guidance can reach Generate Reply only for the selected native actor through that exact live output. A generic private Model Call → Compose branch cannot replace this authorization.

**Actor Context** makes no request and supplies a character’s authorized private material. Two present loaded actors can have separate contexts, requests, and documents. Keep their private inputs on separate branches and out of public notes. Use public Scene Context for a general narrative model.

**One kiss, two private perspectives** confirms actual shared evidence before reflection. Missing evidence holds before Review. A false Decision skips reflections and leaves the ordinary reply reviewable; null holds Confirm Events before Review. Both actors must be verified present. Absence skips both private branches; unresolved participation holds.

The `rowan-permission-text` and `iris-permission-text` values each start with `allowModelAuthoredReflection: false`. Enable them separately with the actor’s authoring permission, especially for a player-controlled character. Set each Read File and Write to File to **Actor scope → presence**, with that actor’s ID and exact Scene Presence input.

Saved `sharedQuote` and `sceneEvidence` retain the shared observation. `reflection` and Recall-compatible `text` contain private model interpretation, labeled `reflectionOrigin: "model-authored"`. The stable record ID derives from the event. Each document has its own save receipt; one successful save does not guarantee the other.

Native generation has one selected actor. Separate Actor Context branches do not let another actor’s private direction guide that selected actor or automatically generate a group’s private prompts.

## Authorize Workflow Data and preserve its structure

New **Story Clock**, **Read File**, and **Outcome Commit** nodes select automatic sources: **Chat clock**, empty plain-text **Chat notes**, and an empty JSON **Chat outcomes** list. A unified run makes only the referenced defaults available in the active user/chat. Change starting values or content in Details; use **Advanced** for source, Format, and Visibility. Clock and outcomes require JSON. Changing settings retains saved content.

The default clock is shared across Main and systems. Default notes and outcomes inside separate systems have stable separate sources; explicit named targets keep their selected sharing. Disabled systems do not create unused defaults. Use one final writer for a shared source: two staged writes to one target are rejected.

**Workflow → Configure → Workflow Data…** manages custom targets for the current user and chat. A name such as `souls.json` identifies a scoped story document stored in chat metadata; it is not a computer file path.

Supply a unique target ID, display name, format, visibility, and initial template. Formats are **JSON**, **JSON Lines**, **CSV**, **Plain text**, and **Markdown**. CSV needs declared columns. Actor-private documents also need the canonical actor ID. Changing a label does not expose Hidden data to public models or notes.

Initial templates seed unsaved content. Updating a template does not overwrite saved data. For an existing authorization, use **Load initial template** before editing that template. **Remove authorization** revokes workflow access.

Automatic-source nodes can be placed directly. Other tools may open **Configure node** for required controls, stage, or saved helper. Cancel leaves the graph unchanged. You can edit remaining controls in Details. Connect a valid node where its output is needed for it to run.

**Read File** returns serialized Text, parsed Data, and a live reference. Connect that exact reference to Write to File for the same target and actor scope. A filename or copied reference cannot authorize a save. Use JSON Decode, Select Fields, or Collection to choose a nested list.

**Format** validates records or parses raw JSON, maps fields, and serializes the chosen format. It does not infer records from arbitrary prose; use Extract or schema-guided Model Call first. JSON shape **records** produces a list. **single** requires one object and keeps state documents object-shaped.

| Write mode | Change |
| --- | --- |
| **append** | Add Text to a text/Markdown document with the chosen separator. |
| **add** | Add records to a collection. |
| **add-unique** | Add records whose identity key is absent. |
| **upsert** | Insert a missing keyed record or merge/replace an existing one. |
| **update-fields** | Change only declared fields of existing keyed records. |
| **replace** | Replace the whole document with supplied serialized Text. |

For nested JSON, set **Collection JSON Pointer**, such as `/souls`, and **Missing collection → error/create**. Keyed modes need an Identity field; update-fields also needs an allowed field list. JSON Lines and CSV support Add and Replace. Validation checks the supported combinations and proposed shape. Append does not paste raw JSON onto a JSON array.

**Project Document** computes the same changes without saving. For example, project a new soul record, count `/souls`, and test a threshold. It returns projected Text/Data and a proposed receipt. Connect the final formatted content to Write to File with the original live reference. Freshness and version checks protect reading and updating the same target.

## Keep acceptance and saving distinct

File, Memory Commit, Clock Commit, Outcome Commit, and accepted-policy Recall effects wait for acceptance. Preview, Run to here, failures, and ordinary model results do not accept them. The response must reach a fresh reviewed result, and its effects must pass checks before publication.

Apply checks the source message/swipe, current user/chat/actor, workflow, target references, and relevant versions. Source changes, foreign edits, cancellation, or changed private visibility can invalidate the proposal. Read fresh data and regenerate.

Publication and several saves are not one atomic transaction. Preview reports each effect separately. If one target saves and another fails, the confirmed result is retained. **Retry failed saves**, when supported, resumes unconfirmed saves without another model request, swipe, draw, or confirmed write. The same rule applies to effects inside reusable systems.

**PERSISTENCE_UNKNOWN**, **save unconfirmed**, or an unknown receipt requires reconciliation before later affected writes. A host save finishing alone may not acknowledge durable storage; Lattice checks freshly loaded metadata where supported. Do not change a transaction key to turn an ambiguous save into a duplicate event.

State and projection receipts shown before Apply are proposed diagnostics. Save the canonical JSON shape your rules require. A generic writer does not change an arbitrary nested `acceptance: "pending"` string into accepted truth; consult the effect receipt.

## Story time: midnight, 14:00 and eight-hour intervals

Story time uses authored integer minutes, separately from wall-clock time and message count. **Story Clock** defaults to **Chat clock**, Day 1 at midnight, with a 24-hour day. Change **Starting values** in Details; **Advanced** contains source, Visibility, JSON Format, and calendar settings. Saved time stays intact.

Nodes selecting the same source share its timeline. Use **+** beside the source for an independent named clock. Separate clocks do not synchronize automatically. Story Clock reads accepted time when the workflow runs.

For a custom target, **Workflow → Configure → Workflow Data… → Story clock template** supplies a valid starting schema. Its `clockId` must match the target. This example starts Day 1 at midnight:

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

Give **Advance Time** an explicit proposal such as `{"kind":"duration","minutes":120}` or `{"kind":"destination","absoluteMinute":840}`. A model can extract a stated duration; “a while later” does not automatically establish time. Estimated evidence needs an explicit supported acceptance policy.

**Time Trigger** schedules can be daily, interval, or delay. Midnight is `minuteOfDay: 0`, 14:00 is `840`, and eight-hour intervals use `intervalMinutes: 480` with an authored anchor. Give schedules stable identities and revisions. Each crossing includes its exact due minute; viewing an old swipe does not consume it again.

Advance Time accepts authored schedules directly or through its schedules input:

- **interrupt** stops at the earliest unconsumed event and returns the remaining duration. A two-hour journey from 13:00 stops at a 14:00 curse with one hour left. Resume with the projected clock and retained remainder when appropriate.
- **catch-up** lists due events across the full interval in order, within a finite limit. Overflow holds the whole projection.

The projected clock and events are proposals. **Clock Commit** stages the actual retained Advance Time report; Apply accepts movement and consumes due IDs. Copied JSON cannot authorize a clock write. Use projected time for progression before acceptance, retaining the calendar and timestamps.

## Generic values: XP, souls and relationship pacing

Use **State → progression** for numeric story values. Supply existing values, a versioned rule table, and confirmed events. Rules support **add**, **set**, or **clamp**, numeric bounds, and authored identity fields. The ledger prevents an already consumed event from advancing a value again.

**Collection → count/sum/threshold/rule-lookup** and **Condition** provide totals, level tables, and thresholds. For a soul-stealing sword, confirm an actual kill, add its unique victim/event record, count the projected collection, and check 100 souls. A mention or future plan awards none.

For XP, use stable objective/completion identities when one achievement should award once across rewrites or regenerations. A new prose source ID is not automatically a new quest completion. Save a deliberately formatted state document through Write to File, preserving unrelated fields.

Relationships can be directed: Mara toward Elias is separate from Elias toward Mara. Set scene/day positive caps, cooldowns, diminishing factors, event-consumption rules, and subject/object scope. Positive caps do not erase separately authorized negative consequences. Private values guide portrayal; they do not establish feelings, consent, or player choices.

**State → time-decay** uses the effective clock and authored baselines, rates, and bounds. Temporary excitement can settle over story minutes while another value remains steady. Persist its proposal through an accepted save path; messages and real-world waiting do not advance it.

## Queue memories manually or recall them automatically

**Recall** selects existing checked records from an authorized Read File or native Memory source. Records need distinct `id`, matching `actorId`, and nonempty `text`; optional fields include revision, partners, tags, event identity, recency, and source references. Whole records are selected within result, character, and token budgets. Model-rewritten or invented records do not inherit live-read access.

For a file memory set, authorize actor-private JSON, read it in the correct scope, and connect the list to Recall’s `records` input. Set the same actor and `memorySetId` on Recall and **Recall Shortcut**. Connect Recall Guidance to Generate Reply for a reminder before writing. Verify participation separately. Keyword triggers use Player Event Source; event triggers need confirmed occurrences. A response-stage trigger cannot change the main prompt that already ran.

Queue from a Recall/Recall Shortcut context menu, a selection, or **Details → Memory recall**. Green badges show available queued requests; amber shows reservations or results awaiting acceptance. Click a badge for its policy. Queue and Cancel make no model request and do not modify the workflow file.

**Workflow → Memory recall** includes selected/all-node commands and **Memory recall overview…**. Matching nodes share one memory-set request. Repeated Queue preserves remaining uses and pending generation; Cancel removes that manual request and its pending claims. Automatic triggers retain their conditions.

| Setting | Meaning |
| --- | --- |
| Reply / Generated swipe / Reply and generated swipe | Eligible newly generated operations. Viewing an existing swipe spends no use. |
| Next matching generation | One eligible use. |
| Once for each generation type | One reply allowance and one generated-swipe allowance. |
| Until cancelled | Repeat until cancelled. |
| Successful completion | Spend after the full workflow succeeds. Later rejection does not refund it. |
| Accepted result | Spend when the reviewed reply is accepted. Stop, failure, and Reject release its reservation. |

Shortcuts default to **Control+Shift+M** and use physical keys. Letters/digits need Control, Alt, or Meta; function keys work too. R and modified R combinations are reserved for Run to here. Shortcuts skip typing, composition, repeats, and focused menus. Duplicate active combinations need different keys.

Matching Shortcuts must agree on target, repetition, and consumption. Different keys can share a request. Automatic-only Recall nodes are excluded from manual queue commands. Use different memory-set IDs for independent selections; the first successful matching Recall supplies that generation’s selection.

Queues are private session state, excluded from saved workflows, exports, Undo, and modified status. Meaningful graph changes or opening/replacing a document revoke obsolete requests, even with identical contents. Scope switches hide unrelated queues; returning to the same unchanged document may reveal an unspent request. Disabling Lattice hides badges and controls; re-enabling may reveal the same unspent queue.

Native Recall serves the selected actor. Other present actors can have separate private processing, but cannot supply their private Recall Guidance to that actor. Private selections do not become public through Render Notes.

## Move an existing pre/post setup

Retired native-pre/native-post workflows remain in a recovery archive with their original graphs, bindings, and active selection. Unified documents remain recovery drafts. If an old retired document was active, Lattice opens a unified document or starter with integration disabled. Archived roots cannot run, open as current documents, or import into a current workflow.

**File → Export archived workflows** saves a JSON recovery copy without conversion or model requests. Preserve it while rebuilding:

1. Place context and guidance upstream of Generate Reply, with explicit stages.
2. Connect bounded Guidance to Generate Reply.
3. Process that generation’s owned Draft in Response.
4. Finish at Review / Publish. Patch diagnostics alone do not publish.
5. Group ordinary nodes in static subgraphs as useful. Keep one activation/reply path; For Each retains its restricted helper contract.
6. Reconfigure connections, authorize documents, inspect supported steps, and enable the open workflow before Send.

Current imports retain saved definitions and supported controls; additive imports check types and stages. There is no automatic converter for retired roots.

## When a run holds

| Symptom | Check |
| --- | --- |
| Manual inspection cannot generate | Use normal SillyTavern Send with the configured document open and Lattice enabled. |
| Model tool lacks a connection | Configure that node and each selected helper role; inspect effective profile/model and nested overrides. |
| Condition is unresolved | Inspect missing fields, null answers, or the confidence middle range; choose an explicit unresolved policy. |
| Character call did not run | Check actual participation and the loaded actor’s exact ID. Absence deliberately skips. |
| Private material cannot reach a model or notes | Use public scene context or the actor’s own authorized private branch. |
| Document unavailable | Authorize the target in the current user/chat, choose the actor scope, and retain the live Read File reference. |
| Time step holds | Check forward integer minutes, calendar, schedule, and due-event limit. |
| Apply is stale | Return to the unchanged owned source or generate a fresh result. |
| Partial Apply failed | Inspect each receipt. Supported retry resumes saves; an unknown outcome needs reconciliation first. |
| Recall did not activate | Check Enable Lattice, selected actor, presence, source/records, budgets, queue policy, and pending claims. |

See [model setup](native-workflows.md) for provider and budget limits, or click a node’s **?** guide for its controls. The complete [node reference](node-reference.md) supplies detailed contracts. [Design records](README.md#workflow-design-records) retain broader proposals and open choices.
