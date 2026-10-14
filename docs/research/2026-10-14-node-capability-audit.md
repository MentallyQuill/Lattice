# Node capability audit — 14 October 2026

Scope: Lattice 0.27.3 at 0f736c2, all 75 catalogued operations, the three structural subgraph node types, all 30 remastered lessons, relevant node guides, implementations and existing tests. This is a capability review and proposed prioritization, not an implementation spec. Product code and examples were left unchanged.

The lessons use 60 of the 75 operations. The other 15 retain useful tested purposes; lack of use in the curriculum is not evidence that they need more features.

The library already expresses the examples' mechanics. The strongest improvements are clearer outcomes, usable typed inputs/outputs and tighter existing contracts. No new node family is justified by this audit.

## Selection criteria

A proposal must serve a named lesson or an ordinary variation of its goal, stay inside the node's named responsibility, and remove a concrete limitation. Existing composition comes first. Preserve finite request budgets, exact evidence, actor privacy, source identity and explicit acceptance. Do not trade those guarantees for a shorter graph.

Priorities below separate existing authoring corrections, small extensions, and the one shared persistence issue that needs its own design.

## Correct existing authoring first

**E1 — Lesson 15: repair context order.** Recent(3) feeds Context Join's first slot; wider(12) feeds its second. Join preserves slot order and deduplicates later repeats, so chronological message IDs 0–11 become 9,10,11,0–8. Smart Compactor protects the tail as recent; a constrained reproduction retained 7,8 rather than 10,11. Feed the wider source first and recent source second. Explain that Join's declared order determines downstream recency. Do not add automatic sorting to the generic join.

Evidence: examples/remastered/15-keep-useful-context-within-a-budget.lattice.json:193; src/workflow/operations/context-join.js:106; src/workflow/compactor.js:37.

**E2 — Repair: make the starting mode usable on a raw Draft.** New nodes default to legacy Repair, which expects authorized spans already on the Draft. Reply Snapshot supplies a raw Draft, and Pattern deliberately does not create edit permissions. The working guide starts in existing Inspect mode. Prefer Inspect for new nodes and explain the span prerequisite for legacy repair/scan. Retain saved modes and existing permission checks.

Evidence: src/workflow/catalog.js:41; src/workflow/host.js:182; src/workflow/repair.js:135; src/workflow/node-guide-examples.js:87.

**E3 — Current Holder: correct the loss claim.** Documentation says transfers/loss/use, but canonical event kinds and the ownership fold support transfers and use attribution, not a loss transition. Correct the documentation. A future confirmed drop/loss that clears ownership would fit this node, but no current lesson requires it.

Evidence: docs/node-reference.md:582; src/workflow/operations/event-data.js:10,124.

## Recommended small improvements

| ID | Node | Targeted change | Example benefit |
| --- | --- | --- | --- |
| A1 | Prompted Memory | An explicit no-match selection result | 22: an item can fail to recall a relevant memory without forcing an unrelated one |
| A2 | Memory, Recall mode | Optional wired Text query | 18: search terms can change with the scene instead of manual editing |
| A3 | Extract, literal mode | Case sensitivity and substring/word-boundary controls | 8: item observations match ordinary capitalization without matching inside unrelated words |
| A4 | Collection | Typed authored comparison Value | 25/27/30 variations: compare numeric rules, weights or state without manufacturing a Match input |
| A5 | Read File | Additive checked parsed-value Data output | 25/30: feed state directly without reparsing serialized JSON |
| A6 | Smart Compactor | State the remaining summary budget in the model request/report | 15: make the single compression call more likely to fit its target |
| A7 | Format Transfer | Check explicit requiredContent literals against the aligned result | Reference-driven formatting: retain required names/labels while allowing reordering |

### A1 — Prompted Memory can legitimately find nothing

The current model response must be recalled or invented. If authorized memories exist but none suits the item, recall mode still forces a supplied ID; invention is forbidden. An empty authorized memory list is handled separately, but an irrelevant nonempty list has no legitimate no-match result.

Accept a bounded response such as {"kind":"no-match"} and emit a skipped optional result with a clear report. Keep unresolved authorization, stale evidence and failed model responses distinct. An optional branch can then retain the ordinary reply; a required consumer still enforces its declared policy. Do not create fallback history or alter creation permission.

Evidence: src/workflow/operations/event-nodes.js:221–240; example 22:657. An injected authorized-memory probe rejected no-match as INVALID_MEMORY_RESPONSE.

### A2 — Memory Recall needs changing search terms

Lesson 18 uses the literal control query "current scene", then asks the author to change it to "lighthouse". The recall service tokenizes the control text; "current scene" does not mean the captured scene's content. Memory exposes no query input.

Add an optional Text query input in Recall mode only. Wired text overrides the existing control, using the same bounds and deterministic lexical retrieval. Authors can prepare a query with existing Text/Compose or an explicit model when interpretation is needed. Do not add embeddings, implicit scene extraction or cross-actor retrieval.

Evidence: src/workflow/introspection/nodes.js:57,144; src/workflow/introspection/memory.js:163; example 18:120. A stored lighthouse episode matched "lighthouse" and did not match "current scene".

### A3 — Literal Extract needs matching controls

Literal extraction uses exact case-sensitive substring search. A read-only probe of "Map in the roadmap beside a MAP and lantern." returned the "map" substring inside "roadmap", omitted standalone Map/MAP, and correctly found lantern.

Add case-sensitive/case-insensitive and substring/word matching options. Keep current matching as the compatibility default. Every hit must retain its exact original quote and UTF-16 positions. Reuse established Unicode boundary rules where appropriate; retain occurrence-level evidence and proposal classification. Regex scanning already belongs to Pattern/Text Rules; semantic item use belongs to event nodes.

Evidence: src/workflow/operations/model-nodes.js:207–215; example 8's exact lantern/map patterns. Pattern and Terminology Map already demonstrate bounded word/case controls.

### A4 — Collection's literal Value should have a type

Collection declares a string-only authored Value, yet at-least/at-most require numeric operands. Even a constant comparison against 10 therefore requires connected numeric Match Data. Equality against a boolean has the same authoring mismatch.

Use the existing typed-value editing pattern for bounded JSON comparison values. Preserve the connected Match override and current operator rules. Keep existing strings unchanged; do not coerce strings into numbers or add an expression language.

Evidence: src/workflow/operations/collection-nodes.js:16,31,58. Existing Condition already accepts typed JSON comparison values.

### A5 — Read File already has the parsed value

Read File emits serialized Text, a checked document envelope containing the parsed value, and its live write reference. Lessons 25 and 30 nevertheless send Text through JSON Decode to obtain the state object expected downstream.

Add a parsed-value Data output for structured formats, preserving privacy/provenance. Retain the existing document envelope and exact live reference. This removes a redundant conversion and supports varying state shapes without manually enumerating every field. A copied parsed value must not acquire write authority.

Evidence: src/workflow/operations/file-nodes.js:248; example 25:290,312,788; example 30:364,386,775. This is an output-shape improvement, not a new reading capability.

### A6 — Communicate the compaction budget before paying for the summary

Smart Compactor measures mandatory material and checks the final result, but its compression prompt only says "concise". It does not tell the model the target or space remaining after protected/recent messages. Lesson 15 has a 700-token target and a 1,024-token completion cap.

Give the request a conservative summary allowance based on measured mandatory content, with framing overhead accounted for, and record it in the report. Keep the completion cap separate and the final tokenizer check authoritative. Do not introduce retries, silent truncation or removal of protected content. Tightening the completion cap alone can yield rejected truncated responses.

Evidence: src/workflow/compactor.js:39,44,73; example 15:141.

### A7 — Verify explicit literal requirements after Format Transfer

Format Transfer checks requiredContent literals against the source, then asks the model to preserve them. The result is aligned and validated for immutable regions without checking those literals again. The current report explicitly leaves template requirements to review; this proposal strengthens that behavior rather than claiming it already guarantees completeness.

Check the aligned candidate for every authored required literal before success and report missing literals. A probe with source "Title Body", requiredContent ["Title"], and model result "Body" currently yields valid patches. Protected literals can preserve wording today, but ordered immutable anchors can obstruct legitimate reformatting. Exact output layouts already belong to Compose.

Evidence: src/workflow/operations/reference-transfer.js:82,99,127,158; src/workflow/operations/reference-draft.js:172. Check exact strings only; do not claim semantic completeness or make corrective model calls.

## Shared persistence issue: long-running stories need a supported history lifecycle

**N1 — Clock Commit, Write to File, Outcome Commit and persistent State.** Native clock history retains at most 32 distinct accepted player turns per clock document. This differs from the separate 32-link same-turn advance chain and the 1,000 consumed time-event ID limit. The native file backend stops at 256 stored save receipts; outcome reads admit at most 256 outcomes. These fixed histories eventually obstruct repeated time advances, journals, item outcomes and long-running relationship systems.

No supported checkpoint/archive operation was found in Workflow Data setup. Exporting retired workflows is unrelated. Replacing document content through Write to File does not retire its backend save receipts. Raising quotas merely postpones the limit.

Design an explicit host-owned history checkpoint/archive action for existing authorized stores, with a concrete preview and replay fences or equivalent durable identity records. It must preserve duplicate detection, rejected/accepted distinctions, stale-source checks and existing effect receipts. Never silently prune IDs. Expose controlled capacity reasons before failure; Clock Commit currently collapses CLOCK_LEDGER_FULL into generic CLOCK_COMMIT_FAILED.

This is the highest-impact longevity gap, but it needs a separate design across the shared persistence layer. It should not become independent archive switches on every node.

Evidence: src/workflow/native-story-state.js:43,58,83,86,101; src/workflow/file-store.js:179; src/workflow/progression.js:21; src/workflow/operations/time-nodes.js:225; src/ui/story-document-setup.js:6,21. Lesson 30's sustained story-time use and lesson 27's repeated wand uses make this relevant.

## A useful follow-up, after the first batch

**B1 — Render Notes: explicitly mapped ordinary records.** It accepts only extraction/enrichment record envelopes. Lesson 14 produces an array of clue records {id,quote,interpretation}, then displays the array through Compose's JSON rendering inside a disclosure section. A simple mapped-row presentation mode would let authors select label/text fields, with explicit interpretation/proposal labels, rather than dumping JSON or creating extraction-shaped envelopes solely for presentation.

Preserve the existing evidence-aware mode and all public visibility checks. Escape display text and produce presentation-only provenance. Do not let a mapping turn arbitrary records into observations or canonical evidence, suppress their uncertainty labels, or execute arbitrary HTML/templates.

Evidence: src/workflow/operations/model-nodes.js:147,174–183; examples/remastered/14-give-every-clue-its-own-explanation.lattice.json:149,310–334. A plain public record array currently returns INVALID_RECORDS.

## Defer or solve through composition

- Scene Context character-field whitelist: plausible within scope, but current lessons deliberately disable card material; demand is weaker than the proposals above.
- For Each shared input: a read-only common snapshot could be useful, but projected-state can already carry shared Data through a helper. Do not add another interface until an example demonstrates substantial friction.
- State rule-entry UI: improve editing of existing rule schemas; do not add relationship, XP or soul-specific modes or duplicate rules sources by default.
- Current Holder drop/loss: a finite transition to no holder fits the name, but it is not needed by the existing recipes.
- Deterministic Express private injection: removing lesson 18's Character Direction call requires a new native authorization path. Treat that as a separate privacy design, not a renderer option.
- Interrupted time: exact remainder chaining already exists; document next-turn use of the accepted pendingTimeAdvance.
- Scheduled events: Advance Time already returns ordered occurrences. Teach direct consumption when lesson 24's separate Time Trigger branches are unnecessary.
- Batch confirmation, filter/reduce chains, threshold bands and reroll selection: existing For Each, Collection, Select Fields and Branch cover these.
- Append/Combine: keep their existing explicit section behavior. Do not add speculative merge modes to differentiate two names.
- Generic model nodes: current independent instructions, model binding, schemas, context/evidence inputs and scoped revision are enough. No automatic retries, fallbacks or automatic canonization are justified.

## Complete node coverage

The table records every catalogued operation once. “Sufficient” means no additional capability is justified by this audit, not an exhaustive proof against every possible bug. A dash in Lessons means the operation is outside the 30-lesson curriculum; its implementation/guides/tests were still considered.

| Operation | Node | Lessons | Assessment |
| --- | --- | --- | --- |
| scene-context | Scene Context | 3, 12, 15, 18, 21, 26, 30 | Sufficient: message window, character inclusion and public filtering; field-level card selection is deferred. |
| reply-snapshot | Reply Snapshot | 8 | Sufficient: frozen completed reply and source identity; historical editing would broaden its purpose. |
| smart-compactor | Smart Compactor | 15 | A6: communicate remaining summary budget; E1: correct lesson 15 input order. |
| response-plan | Response Plan | 3, 12, 15 | Sufficient: bounded scene guidance; other structured planning jobs use Model Call and Compose. |
| pattern | Pattern | — | Sufficient: scoped literal/word/regex detection, aggregate tests and exact live reports. |
| filter-text | Filter Text | — | Sufficient: atomic scoped line/paragraph filtering with live Pattern evidence. |
| repair | Repair | — | E2: improve the new-node default using existing Inspect mode. |
| validate-patches | Validate Patches | — | Sufficient: source-bound validation and protected wording; retain review. |
| guidance | Guidance | — | Sufficient: guidance exposure and budget enforcement. |
| review-gate | Review Gate | — | Sufficient: explicit review requirement on a Candidate. |
| apply-reply | Apply Reply | — | Sufficient as candidate diagnostics; owned publication belongs to Review / Publish. |
| reroute | Reroute | — | Sufficient: exact typed passthrough and live artifact identity. |
| compose | Compose | 2, 4, 5, 6, 7, 9, 11, 13, 14, 16, 19, 20, 23, 24, 25, 27 | Sufficient: join/template, typed sections, skipped policies and final budget. |
| text-rules | Text Rules | — | Sufficient: bounded literal/regex edits and extraction; Draft scope/protections. |
| json-decode | JSON Decode | 6, 9, 13, 14, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30 | Sufficient: strict parsing/checking and the documented bounded schema subset. |
| select-fields | Select Fields | 6, 10, 11, 13, 17, 19, 20, 22, 25, 27, 28, 29, 30 | Sufficient: key/index mappings, optional fields and typed defaults. |
| style-transfer | Style Transfer | — | Sufficient: scoped reference-driven style adaptation and reviewed output. |
| format-transfer | Format Transfer | — | A7: verify explicit requiredContent literals against the result. |
| terminology-map | Terminology Map | — | Sufficient: simultaneous canonical substitutions, word/phrase and case controls. |
| reflect | Reflect | 18 | Sufficient: character/recall/scene appraisal from scoped evidence. |
| internalize | Internalize | 18 | Sufficient: evidence-backed experience/pattern/recovery proposals. |
| express | Express | 18 | Sufficient: behavior/attention and inner-voice outputs; retain native private guidance boundaries. |
| context | Context | — | Sufficient: assembly, actor perspective and budgeted focus. |
| memory | Memory | 18 | A2: optional wired query for Recall mode; existing read/commit remain adequate. |
| state | State | 25, 30 | Sufficient mechanics: value/curve/track/progression/time-decay; N1: eventual history capacity; rule-entry UX deferred. |
| text | Text | 2, 4, 7, 9, 11, 13, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30 | Sufficient: bounded literal multiline text and portable instructions. |
| file-input | File Input | 6 | Sufficient: imported UTF-8 snapshot; live documents belong to Read File. |
| prompt-source | Prompt Source | 5 | Sufficient: stable prompt selectors and original/resolved views. |
| condition | Condition | 9, 22, 27, 28, 29, 30 | Sufficient: explicit comparisons; avoid adding an expression language. |
| branch | Branch | 9, 10, 11, 22, 27, 28, 29, 30 | Sufficient: typed yes/no/unresolved routing without guessed decisions. |
| join | Join | 9, 10, 11, 27, 28 | Sufficient: declared first/last surviving contribution with skipped/unresolved distinction. |
| collect | Collect | 18, 24, 25, 27, 28, 29 | Sufficient: declared ordered contributions without implicit object merging. |
| confidence-gate | Confidence Gate | — | Sufficient: explicit numeric thresholds and unresolved band; confidence remains self-reported. |
| for-each | For Each | 14, 19, 20, 25, 27, 28, 30 | Sufficient: bounded pinned map/projected-state helpers and role bindings; shared input is deferred. |
| decision | Decision | 10, 11, 19, 20, 25, 27, 28, 29, 30 | Sufficient: keyed yes/no/choice/score questions, strict output and unresolved answers. |
| combine | Combine | — | Sufficient: existing explicit append behavior; do not invent merge modes to distinguish it. |
| append | Append | 8, 9, 10, 11, 12, 13, 14, 19, 25, 27 | Sufficient: stable replaceable presentation sections and retained Draft authority. |
| render-notes | Render Notes | 8, 10, 12 | B1: consider mapped ordinary record presentation after the first batch. |
| enrich | Enrich | 12 | Sufficient: generated additions retain record identity/evidence and proposal labels. |
| draft-text | Draft Text | 10 | Sufficient: body/assembled views with provenance and without publication authority. |
| extract | Extract | 8, 10, 12, 17 | A3: case and boundary controls for literal matching. |
| model-call | Model Call | 4, 14, 18, 19, 21, 22, 25, 26, 28, 29, 30 | Sufficient: independent instructions, Text/Data output, schema and evidence/context inputs. |
| revise-draft | Revise Draft | 7, 12, 27, 28 | Sufficient: scoped revision, protected literals and optional references/context. |
| player-event-source | Player Event Source | 20, 26, 27, 30 | Sufficient: actual captured player turn with stable native identity. |
| on-send | On Send | 1–30 | Sufficient: the owned Send activation; no general event bus needed. |
| generate-reply | Generate Reply · SillyTavern | 1–30 | Sufficient: native boundary, budget and existing injection role/position/depth controls. |
| review-publish | Review / Publish | 1–30 | Sufficient: explicit reviewed result and accepted staged effects; N1 belongs to storage lifecycle. |
| format | Format | 17, 19, 20, 25, 27, 28, 29, 30 | Sufficient: explicit record mappings and JSON/JSONL/CSV/text/Markdown serialization. |
| read-file | Read File | 16, 17, 20, 22, 25, 26, 27, 28, 29, 30 | A5: expose already checked parsed value directly, alongside envelope/reference. |
| write-file | Write to File | 17, 22, 25, 28, 29, 30 | Sufficient mutations and accepted staging; N1: durable receipt capacity. |
| project-document | Project Document | 17, 28 | Sufficient: checked pure projection and before/after mutation receipt. |
| commit-clock | Clock Commit | 23, 24 | N1: safe retained-history lifecycle and actionable capacity diagnostics. |
| story-clock | Story Clock | 23, 24, 30 | Sufficient: explicit accepted calendar/minute source; N1 affects continued use. |
| time-trigger | Time Trigger | 24 | Sufficient: daily/interval/one-time crossings with consumed identity checks. |
| advance-time | Advance Time | 23, 24 | Sufficient: explicit duration/destination, interruption/catch-up and remainder. |
| actor-context | Actor Context | 29 | Sufficient: exact actor presence/grant and scoped card/messages/memories. |
| draft-event-source | Draft Event Source | 19, 22, 25, 28, 29 | Sufficient: genuine Draft-derived narrative source, excluding annotations. |
| event-normalize | Event Normalize | 19, 25, 28, 29, 30 | Sufficient: checked candidates and generic progression adaptation. |
| prompted-memory | Prompted Memory | 22 | A1: explicit no-match selection result. |
| item-mention-trigger | Item Mention Trigger | 22 | Sufficient: bounded aliases, word matching, case control and activation policies. |
| item-use-trigger | Item Use Trigger | 20, 27 | Sufficient: candidate/model extraction with exact evidence; confirmation stays separate. |
| confirm-events | Confirm Events | 19, 20, 25, 27, 28, 29, 30 | Sufficient: checked explicit decisions; For Each already supports batches. |
| current-holder | Current Holder | 20, 22, 27 | Sufficient for confirmed transfers/uses; E3: remove unsupported loss claim; drop transition deferred. |
| scene-presence | Scene Presence | 18, 21, 22, 26, 29, 30 | Sufficient: present/absent/unresolved participation tied to current evidence. |
| character-direction | Character Direction | 18, 21, 30 | Sufficient: present-actor private portrayal guidance with a literal system prompt. |
| parse-effect-library | Effect Library | 27 | Sufficient: authored weighted libraries and explicit fixed/generated branches. |
| random-pick | Random Pick | 27 | Sufficient: confirmed holder use, weighted retained draw and deliberate reroll. |
| commit-outcomes | Outcome Commit | 27 | Sufficient acceptance/idempotency; N1: eventual retained outcome/receipt capacity. |
| saved-outcome | Saved Outcome | 27 | Sufficient: checked replay and explicit found/absent outcome. |
| effect-author | Effect Author | 27 | Sufficient: one bounded generated-effect request and retained successful invention. |
| stage-outcome | Stage Outcome | 27 | Sufficient: fixed resolution or explicit accepted generated novelty. |
| collection | Collection | 17, 19, 20, 22, 24, 25, 27, 28, 29, 30 | A4: typed authored comparison Value; existing reducers/operators remain sufficient. |
| recall | Recall | 26 | Sufficient: authorized manual/authored triggers, filtering and whole-record budget. |
| hotkey-arm | Recall Shortcut | 26 | Sufficient: queued recall shortcut policies and explicit consumption. |
| context-join | Context Join | 15 | Sufficient: explicit ordered deduplicated merge; E1 is a lesson wiring correction. |


## Structural nodes

Subgraph instance, Input boundary and Output boundary already provide pinned reusable bodies, typed interfaces, exposed parameters, model-role overrides and system enablement. Static systems can retain host operations under the enclosing workflow; For Each helpers remain bounded processors. These distinctions support lessons 13/14 and the system examples. No new structural node or extra native generation owner is recommended.

Evidence: docs/node-reference.md, Subgraph nodes; src/workflow/iteration-helpers.js:89–94,119; src/workflow/runtime.js:183.

## Verification and limits

- Enumerated the current operation catalog and recursively inspected operation usage in all 30 portable lesson files: 75 catalogued, 60 used.
- Reviewed node implementations, related engines, guides and example wiring in parallel by family.
- Ran 31 relevant existing test files with the normal node-test-host import: all passed. Coverage included model/control/decision, iteration, input, primitives, transpose, introspection, file/store, progression, recall, random, time, story events, context joining/compaction/reference transfer, and unified/scoped/story-flow examples.
- Ran read-only/injected behavior probes for literal extraction, plain-record notes, missing Condition operator symmetry, lesson 15 recency, Format Transfer literal loss, Prompted Memory no-match and lexical Memory queries.
- The ordinary aggregate test launcher could not spawn Node children in the sandbox; the selected files were executed directly instead. No product regression failure was observed.
- No live SillyTavern/provider calls, browser QA, new tests, product changes, commits or GitHub changes were made. Storage capacity findings are grounded in current admission checks; the safe archive design remains future work.

Recommended sequence: correct E1–E3; design N1 separately; implement A1–A5 as individually reviewable additions; tighten A6–A7; then reassess whether B1 warrants a presentation change.

