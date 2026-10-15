# Place every node immediately and show setup readiness on the canvas

Date: 2026-10-14
Status: Approved design and pre-change audit. Implementation and verification are tracked in `docs/superpowers/plans/2026-10-14-node-placement-readiness.md`.

## Intended outcome

People should be able to lay out a workflow, connect nodes, and fill in settings in the order that makes sense to them. Choosing a node commits its placement immediately. Missing configuration becomes a visible, actionable state on the placed node.

The governing rule is: **node availability determines whether a node can be placed; node readiness determines whether it can execute.** Graph-scope restrictions still determine which operations are available. Required settings, model selection, document authorization, and helper selection must never become prerequisites for placing an available node.

This brief expands the requested red border and Wrench / **Setup Required** treatment into a consistent authoring and execution contract. It includes primitive nodes, preset variants, and saved-system instances.

## Original problem and audit evidence

The audited catalog contains 75 primitive operation types. Before this change, 39 canonical choices opened Configure Node before placement:

- 28 explicitly force configuration even though their default operation settings pass `describeOperation`.
- 11 have genuinely incomplete default settings.
- 22 preset variant commands inherit the same gates; these are variants of the 39 types, not another 22 types.
- Story Clock and Outcome Commit also enter configuration when supplied custom or invalid controls.
- Add system has a separate settings-and-connection-preview gate before inserting an instance.

This interrupts graph construction and produces inconsistent behavior: choosing Compose opens setup, while pasting plain text already creates Compose immediately. Valid defaults do not establish complete wiring, model availability, permissions, or runtime success; those concerns belong to readiness and execution checks.

The modal is also masking a broader architectural constraint. Creation rejects incomplete operation descriptions, and ordinary graph transactions validate every existing node. In the audit, adding Text beside an unfinished Prompted Memory failed with `INVALID_SETTINGS: Select a canonical actor identity.` Details edits similarly cannot progressively complete a node when the existing node must already validate.

Removing the catalog flag or hiding the modal alone therefore cannot deliver the requested behavior.

## Product behavior

### 1. Immediate placement through every entry point

Shelf selection, canvas search, wire-drag search, preset selection, pasted fragments, duplication, and saved-system insertion must follow the same authoring rules.

On choosing an available node:

1. Create it at the intended graph position with the operation's actual defaults and selected preset values.
2. Select it and keep the canvas interaction available. Reuse the ordinary Details selection behavior; do not open a setup dialog.
3. Apply the existing phase rules directly: fixed phases and containing helper restrictions remain effective; origin/context supplies the stage for operations that permit a choice. Stage can be edited afterward where permitted.
4. Show declared pins that can be determined from the operation, supported mode, and current authored controls.
5. In wire-drag placement, connect only the exact known compatible pin selected by search. Unconfigured settings do not authorize guessed pin identities or incompatible connections.
6. Commit insertion and any requested initial connection as one transaction and one Undo step.

Creation allocates ordinary node/row identities where appropriate. It must not invent actor IDs, item IDs, schedule identities, memory sets, document grants, helper references, or model credentials to satisfy a validator.

A modal that selects what to insert is acceptable when the choice is not yet known, such as selecting a saved system revision or a file to import. Once that choice is known, completing node settings is never a condition of placement.

### 2. A small, explicit readiness vocabulary

Readiness describes the current effective document revision. Run history and enabled/disabled state are independent.

| Authoring state | Meaning | Canvas treatment |
| --- | --- | --- |
| Ready | No blocking configuration, reference, binding, or input issue is known within the current evaluation context | Ordinary card; no permanent Ready badge |
| Setup Required | Required settings are missing/invalid, a configured helper/reference is unavailable, or an effective required model/document binding is known to be unavailable | Red border plus Wrench and **Setup Required** |
| Input Required | Configuration is valid, but a required graph input has no compatible connected source | Amber plug/input icon plus **Input Required** |

If setup and wiring are both incomplete, Setup Required is the primary readiness badge. Details lists all known reasons, and missing input pins remain identifiable. Optional fields, optional inputs, an ordinary not-yet-run node, intentionally skipped execution, and a previous request failure do not produce Setup Required.

Only actual requirements for the effective operation mode count. Do not turn the current 39-popup list into a list of nodes that always receive a wrench. The 28 default-valid operations start without a setup warning unless another real requirement is missing.

Check model and document availability only in a context where those resources can actually be evaluated. An unavailable check is deferred, not a claim that the resource has been verified; Details identifies live requirements that have not been evaluated, and executable preparation always checks the actual run context. Static guides and library previews must not acquire setup errors merely because they have no active chat or live connection. Placement never requests permissions, reads a document, starts a model request, arms a shortcut, or commits host effects. Existing documented automatic document defaults remain automatic.

In a standalone library definition, declared required interface inputs, exposed caller parameters, and inherited model-role contracts are external requirements. Evaluate internal wiring and settings against those declarations instead of treating the missing caller as a setup failure. Required internal pins that are not connected to their declared boundary/source still receive input diagnostics. Once instantiated, evaluate the effective occurrence's actual caller bindings and overrides.

### 3. Setup is completed on the placed node

Wrench activation selects the node, opens its existing Details panel, and focuses the first actionable setting. Hover and keyboard focus expose the actual missing requirements, for example **Choose an actor and memory set** or **Select a pinned helper**.

Reuse the existing friendly control editors, schema editors, reference selectors, model/profile selectors, and Advanced JSON routes. Configuration must not be duplicated in a second competing form.

Validly parsed edits can be saved progressively even when other required fields are incomplete. For example, Recall must accept an Actor ID save while Memory Set ID is still missing. The badge then reports the remaining requirement.

Malformed in-progress text or JSON stays in the existing local editor draft with field feedback. That draft is distinct from the admitted authored document. Canceling an edit preserves its prior saved setting; closing Details never deletes the placed node. Removing the node remains an explicit Delete or Undo action.

Readiness updates immediately after a successful edit, wire change, helper change, override change, or relevant resource-availability change. It is derived data, not a persisted `setupRequired` boolean that can become stale.

### 4. One layout for everything above nodes

Current model identifiers already occupy the space above model nodes. Preview-target circles and compact modifier counts occupy the upper-right corner. Recall indicators occupy the lower-right interior. Runtime statuses currently use card paint rather than upper text labels.

Introduce one decoration stack for all nodes, including deterministic nodes:

| Position | Content |
| --- | --- |
| Upper stack row | Model identifier, when applicable |
| Lower stack row, nearest the card | One primary readiness badge |
| Reserved upper-right corner | Existing preview-target and compact modifier badges |

The stack uses normal row layout, ending at least 12 graph pixels above the card. Model text is limited to two lines, with the full identifier available on hover/focus. Narrow and compact nodes have explicit overflow handling. Setup and model text must not be separately positioned at the same negative offset.

Keep the card and pin coordinates stable when readiness changes. Measure decorations separately and include their visual bounds in automatic placement, Fit View, selection framing, and open-group frame/header calculations. Bounds include the upper stack, corner badges, below-card connection picker, and compact alias. Existing fixed padding is not a collision solution for wrapped identifiers.

At overview zoom, the Wrench or plug may be icon-only; hover, focus, or selection reveals its label and reasons. Compact nodes retain an identifiable indicator. Collapsed groups and instance wrappers summarize both setup and input issues, for example **2 need setup · 1 needs input**, and let the user navigate to their sources. Counts use distinct full node addresses and each node's primary readiness category; multiple field issues count once, and an aggregate wrapper does not duplicate the descendant it summarizes.

The red setup border is separate from failed-run styling and never applies failure dimming. Selection/focus uses its own outer outline, disabled state keeps its dashed/striped treatment, and current execution emphasis uses a separate layer. Editing a node invalidates obsolete run paint according to revision freshness. This change does not add another row of runtime text badges.

Badge interaction must isolate canvas dragging, wiring, context-menu, and keyboard shortcut handling. Supply an accessible name and diagnostic association; color alone cannot communicate readiness. Revalidation must not repeatedly announce unchanged issues.

### 5. Saved systems use the same rule

Add system becomes a saved-system chooser. Selecting a revision places its editable instance using its declared interface and default exposed values. The insertion retains its exact bundled definition closure and local-copy ownership and remains one Undo step.

Exposed parameter edits, input bindings, output destinations, and optional guidance merge configuration move to the placed instance's Details or an explicitly invoked connection-assistance action. A successful connection preview is no longer required to insert the instance.

Missing required connections show Input Required; incomplete effective settings show Setup Required. Connecting outputs or merging guidance remains explicit. Placing an instance does not replace an occupied destination or implicitly inject guidance. Later connection assistance previews and commits its own stale-checked transaction.

## Architectural direction

### Separate authoring admission, readiness, and executable preparation

These are three distinct contracts:

1. **Authoring admission** accepts bounded, recognized, well-formed workflow data that may contain incomplete settings. It supports editing, save/open, clipboard, history, and canvas projection.
2. **Readiness inspection** reports addressed configuration, reference, binding, and required-input issues without requiring an executable plan or performing host work.
3. **Executable preparation** strictly validates the selected execution dependency closure and all referenced execution bodies before issuing executable capabilities or starting source/model/host work.

Preserve hard rejection for malformed or unsafe data, unknown operations/versions, unsupported modes, invalid pin/reference shapes, incompatible wire kinds, cycles, identity collisions, invalid ownership, and hash tampering. Missing semantic configuration is an addressed readiness issue rather than a reason to reject an otherwise admissible editing document.

Use the current node types and control representation. There is no fake placeholder operation. Readiness does not become executable authority, and an authoring artifact must never be accepted where an executable prepared artifact is required.

### Make descriptors and pins available before executable validation

The registered operation and supported mode must provide authoring title, controls, phase behavior, and determinable pins independently of a successful executable description. Reuse and consolidate the current deferred-description knowledge rather than maintaining a separate hardcoded setup-node inventory.

Dynamic pins come from current canonical controls. Pins requiring undeclared slots/content appear only once that content exists. Unsupported settings never produce guessed ports. A control change that removes or changes a connected pin uses the existing explicit changed-port handling; rejected changes preserve the previous document and its wires.

The same descriptor must drive semantic signatures, document serialization, clipboard, definition hashing, and UI controls. Currently an incomplete operation can cause `operationFor` to fail and semantic-control projection to omit its settings. Fixing that is required so edits to incomplete settings still mark the document changed and invalidate stale work.

### Let every ordinary edit operate on an incomplete document

Update both baseline and candidate admission for transactions. Creation, progressive Details saves, moving, grouping, wiring, deleting, duplication, Undo/Redo, file save/open, portable authoring round trips, and local helper edits must work with incomplete nodes present.

Keep existing revision captures, ownership checks, and stale-candidate protections. Relaxing readiness must not permit a candidate to commit against a different document revision.

For Each's unselected helper control is an admitted incomplete authoring value. Its existing empty selection (`{id:'',version:1,semanticHash:''}`) must yield Setup Required rather than a hard reference-shape failure. A selected helper that claims a real pinned identity requires a valid exact reference and matching bundled content. Ordinary subgraph instance definition pins always require real bundled references; do not insert a subgraph wrapper with a fabricated empty pin.

Local editable definition bodies may be incomplete in an authored workflow. Their real contents still participate in exact identity/hash checks. Shared pinned definitions remain immutable; editing continues through the established owned local-copy route. Opening/importing an authored workflow, including portable authoring content and clipboard fragments, can retain incomplete local snapshots. Publishing/installing into the reusable library still requires valid internal configuration after accounting for declared caller parameters, model roles, and external interface inputs. Those declared external requirements do not require a live host or caller when publishing.

### Validate only the requested run, before any effects

Build an authoring inventory that includes incomplete nodes and their known interfaces, then determine the requested dependency closure. For a root run, start from its selected terminals; for Run to here, start from the chosen output/terminal, preserving existing phase and lifecycle rules.

An incomplete node outside that closure cannot block a valid run. An incomplete included node, effective instance, or For Each helper blocks the whole requested run before prepare hooks, source reads, requests, shortcut activation, or host effects begin. Never silently skip an incomplete included node or execute upstream work before discovering the missing setting.

Unavailable helper contents must not be expanded speculatively. If the requested closure reaches that helper, preflight reports its setup issue. Unused bundled snapshots retain structural, ownership, closure, and hash checks without imposing unrelated execution-readiness requirements.

Keep execution-time authorization and freshness checks even when the canvas currently says Ready. A context/profile/document change after preparation must still prevent stale effects.

### Prepare addressed diagnostics once and render them cheaply

Readiness inspection returns structured issues keyed by full workflow/instance/node address, with a control key or port ID when applicable. Include a stable code, concise explanation, and an actionable location. Aggregate independent missing fields rather than returning only the first failure.

Use effective instance settings, inherited model bindings, parameter overrides, and scoped helper bindings. An issue in one occurrence must not mark every instance of its definition.

Recompute on relevant document/resource changes and reuse prepared projections for rendering. Canvas pan, zoom, hover, and selection do not trigger graph expansion, model discovery, authorization requests, or full validation. Group/instance summaries derive from these same addressed issues.

## Implementation areas

| Area | Required change |
| --- | --- |
| Creation/search | Remove unconditional configuration gates from `src/ui/configured-node-creation.js`, `native-search-catalog.js`, and `controller.js`; preserve direct stage and exact wire selection behavior |
| Catalog/contracts | Separate authoring descriptors/pins from strict `describeOperation`; split document admission and executable readiness in `catalog.js`, `graph-validation.js`, `contracts.js`, and `resolve.js` |
| Transactions/history | Make `checked-candidate.js`, graph artifacts, `ports.js`, and definition/control edits admit incomplete authored baselines and candidates without weakening currentness checks |
| Document/definitions | Preserve incomplete canonical settings through document files, clipboard, semantic signatures, hashing, local copies, and nested authoring views |
| Details | Support progressive saves and addressed setup diagnostics using existing control editors |
| Canvas | Add readiness DTOs and shared decorations through workspace preparation, NodeCard/profile UI, CanvasLayer, canvas geometry, groups, and styles |
| Saved systems | Remove the connection-preview insertion prerequisite from AddSystem/controller; expose later explicit configuration and connection assistance |
| Docs/examples | Update node creation instructions, screenshots, examples, and tests that currently require Configure Node before placement |

These areas are coupled by the admission contract. Deliver them as one coherent behavior change rather than shipping a cosmetic badge while incomplete nodes still break editing or execution isolation.

## Acceptance criteria

| Scenario | Required result |
| --- | --- |
| Choose any of the 75 primitive operation types where available | Node places without a configuration dialog |
| Choose a current forced preset variant | Preset values are retained; placement is immediate |
| Place Prompted Memory without an Actor ID | Red border and Setup Required; declared pins and Details are available |
| Place a valid-default Compose/Pattern node | No setup badge solely because it used to require a modal |
| Place an incomplete node, then place/move/delete an unrelated node | All edits work normally |
| Save Recall Actor ID while Memory Set ID remains empty | Save succeeds; remaining setup reason is shown |
| Enter malformed JSON in Details | Local draft and error remain; existing document settings are preserved |
| Save/open or copy/paste an incomplete workflow | Canonical values, layout, identities, and setup reasons survive; derived statuses are recomputed |
| Undo placement, Redo placement, or duplicate an incomplete node | Ordinary transaction/history behavior, with correct remapped graph identities |
| Configure the last missing setting while a required input is still absent | Setup clears and Input Required becomes the primary issue |
| Change a setting that alters connected pins | Existing explicit changed-port policy applies; no silent wire loss |
| Run a complete independent target beside an incomplete node | Run succeeds without including the incomplete branch |
| Run a complete target with an unused incomplete local snapshot or excluded incomplete instance/helper bundled in the document | Run succeeds; unrelated snapshot configuration does not block the selected closure |
| Run a target/root whose dependencies include an incomplete node/helper | Entire request fails preflight with an actionable addressed issue; zero source/model/host effects |
| Two instances of one definition have different effective overrides | Only the affected occurrence receives setup issues; wrapper summaries point to it |
| Place a node inside an owned local helper body | Placement and later edits work while incomplete; hash/currentness integrity is preserved |
| Save/open/export/import/copy an incomplete local definition | Authored contents and exact references survive; publishing it to the reusable library reports internal setup issues |
| Edit one partial field while other required settings remain missing | Semantic signature and dirty checkpoint change; stale work is invalidated; owned definition hashes update; Undo restores prior authored state |
| Inspect a standalone library definition with declared required caller inputs/model roles | External requirements are shown as contracts; missing caller/live host does not create false setup or input errors |
| Place a document/model node without an active live context | Placement succeeds without requesting authorization; actionable readiness is evaluated in the appropriate context |
| Select a saved system | Instance places before configuring connections or previewing a merge |
| Configure a placed saved system | Exposed values and connection assistance are reachable; cancel retains the instance; stale previews commit nothing; successful assistance has its own Undo step |
| Long model ID + setup + preview target + compact modifier count | Decorations remain distinct; complete text is accessible |
| Compact/full cards at zoom 0.25, 0.5, and 1.0 | Indicator remains identifiable and usable; focus and diagnostic access work |
| Collapse/expand a group containing incomplete nodes | Accurate aggregate indicator; child issues are discoverable |
| Auto-place nodes or size groups with wrapped metadata | Placement/group calculations clear decoration extents; pins and existing wires stay anchored |
| Fit an existing layout containing wrapped metadata | All visual bounds fit the viewport; Fit does not rearrange an already-overlapping layout |
| Select, disable, or inspect a previously failed incomplete node | Readiness, focus, disabled treatment, and current run history remain distinguishable |
| Change a model/document binding after readiness/preparation | Readiness refreshes and execution still enforces current authorization |
| Import unsafe data, tampered hashes, invalid ownership, cycles, or incompatible wires | Existing hard structural protections continue to reject it |

Verification should include catalog-wide admission coverage, domain tests for incomplete-document edits and closure preflight, document/definition round trips, and browser tests for placement, Details, status combinations, zoom, groups, and decoration geometry. Run the repository's Node tests, type checks, build, asset checks, and browser suite before declaring implementation complete.

## Audited popup inventory

### Forced despite default settings passing operation validation: 28

| Node | Operation |
| --- | --- |
| Decision | `decision` |
| Advance Time | `advance-time` |
| JSON Decode | `json-decode` |
| Extract | `extract` |
| Model Call | `model-call` |
| Format | `format` |
| Read File | `read-file` |
| Write to File | `write-file` |
| Project Document | `project-document` |
| Smart Compactor | `smart-compactor` |
| Pattern | `pattern` |
| Filter Text | `filter-text` |
| Repair | `repair` |
| Compose | `compose` |
| Text Rules | `text-rules` |
| Select Fields | `select-fields` |
| Style Transfer | `style-transfer` |
| Format Transfer | `format-transfer` |
| Terminology Map | `terminology-map` |
| Context | `context` |
| State | `state` |
| Condition | `condition` |
| Join | `join` |
| Collect | `collect` |
| Confidence Gate | `confidence-gate` |
| Revise Draft | `revise-draft` |
| Collection | `collection` |
| Context Join | `context-join` |

### Forced with incomplete defaults: 11

| Node | Operation | Missing default configuration |
| --- | --- | --- |
| For Each | `for-each` | Exact pinned helper reference |
| Time Trigger | `time-trigger` | Schedule ID |
| Actor Context | `actor-context` | Actor ID |
| Prompted Memory | `prompted-memory` | Actor ID |
| Item Mention Trigger | `item-mention-trigger` | Actor ID, item ID, aliases |
| Item Use Trigger | `item-use-trigger` | Item ID |
| Scene Presence | `scene-presence` | Actor ID |
| Character Direction | `character-direction` | Actor ID |
| Effect Library | `parse-effect-library` | Library ID, revision, item ID |
| Recall | `recall` | Actor ID, memory-set ID |
| Recall Shortcut | `hotkey-arm` | Actor ID, memory-set ID |

Story Clock (`story-clock`) and Outcome Commit (`commit-outcomes`) were conditional cases. Add system was the additional saved-instance flow. There was no independent pre-placement model-profile popup; For Each embedded helper model bindings in its Configure Node modal.

## Evidence and existing contracts at baseline `916cc01`

- Forced creation policy: `src/ui/configured-node-creation.js:32-38`.
- Shared shelf/search gate and stage/document capture: `src/ui/controller.js:1894-1924`.
- Creation rejects incomplete settings: `src/workflow/connection-edits.js:167`.
- Baseline and candidate both require graph artifacts: `src/workflow/checked-candidate.js:7-10`.
- Graph admission rejects an invalid operation description: `src/workflow/graph-validation.js:90-91`.
- Semantic-control and actual-pin projection: `src/workflow/catalog.js:219-259`.
- Execution currently expands globally before selecting a closure: `src/workflow/resolve.js:103-107`.
- Model text currently positioned above the node: `ui/NodeProfilePicker.svelte:103-104,130`.
- Preview-target, compact modifier, and Recall indicators: `ui/NodeCard.svelte:18-39`.
- Add system's required preview: `ui/AddSystem.svelte:19,39`; `src/ui/controller.js:2095-2117`.
- Existing friendly-entry contracts: `docs/superpowers/specs/2026-10-10-node-entry-design.md`.
- Existing system insertion contract, whose pre-placement requirement this proposal changes: `docs/superpowers/specs/2026-10-10-workflow-system-subgraphs-design.md`.
