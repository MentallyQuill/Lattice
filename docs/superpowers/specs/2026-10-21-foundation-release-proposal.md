# Lattice 0.28 foundation release proposal

Date: 2026-10-21  
Status: **Adopted for execution through the active foundation-release goal.** The published base and preserved development build identify themselves as 0.27.5. This is the accepted smaller 0.28 release boundary; the release is not complete. See the [execution report](../reports/2026-10-21-foundation-release.md) for current evidence. The original all-46 design remains the destination of the preserved development line.

## 1. Recommendation

Finish a small, useful foundation release while preserving the complete memory-system build as a separate development line.

The recommended public scope is:

- Preserve the existing 30 lessons, their stable identities, and their supported behavior.
- Add **lesson 34, Split a lore chapter into useful passages**, and **lesson 35, Group replies into three-turn passages**.
- Release the **Chunk** node and the minimum reader, runtime, editor, packaging, and diagnostics support needed to make those two lessons complete.
- Keep the new background maintenance, durable Job, embedding/retrieval, repair, history replacement, and capstone systems out of this release's public capability set.

That is a proposed catalog of **32 visible lessons**, not an unfinished 46-lesson catalog. Keep lesson IDs `lesson-34` and `lesson-35`; do not rename them to 31 and 32 or reuse the reserved identities of deferred lessons. Catalog counts must describe the actual release. The original curriculum retains its historical numbering and broader design.

This is deliberately smaller than shipping all eight proposed nodes or all fourteen focused memory lessons. Those would retain much of the lifecycle and integration work that has made the current task difficult to finish.

**The release promise:** a user can import either included exercise, configure its real source, inspect correctly segmented passages and their source relationships, edit and save the workflow, reopen it, and use the result through the ordinary generation path. Opening or inspecting it never starts background memory processing.

**The preservation promise:** no completed implementation, test, authored example, or important research result is discarded merely because it is excluded from this release. Unreleased work remains recoverable and described accurately.

## 2. Why reduce the scope here?

The original target combines several independent products and infrastructure layers:

1. Eight reusable memory nodes and changes to existing nodes.
2. Runtime-3 authoring, installation, resource binding, and editor behavior.
3. Fourteen focused lessons and two complete capstone systems.
4. Durable background execution, source freshness, acknowledgements, restart recovery, and repair.
5. Live model quality checks, broad chat regressions, packaging, and release integration.

A problem in the deepest lifecycle layer currently holds up every user-facing deliverable. A correct component test is valuable, but it does not establish that the complete installed system can recover after interruption or maintain memory correctly.

The deeper Summaryception review also found that the summary algorithm is not the only source of latency. Its ordinary upstream path generally makes one summarizer request, updates metadata, and saves the chat. Our installed path adds durable coordination and repeatedly validates shared graph/source state. A small no-model diagnostic already incurred substantial enqueue and checkpoint time. Optimizing prompts alone cannot remove that overhead.

For this proposal, ten seconds remains a best-effort target. We record representative timings, but do not make a speculative optimization program a release dependency. Responsiveness, cancellation, and freedom from hangs still matter.

See the [runtime and latency comparison](../../research/2026-10-21-summaryception-runtime-latency-comparison.md). It distinguishes source inspection, deterministic fixture results, installed measurements, and unmeasured real-provider behavior.

## 3. Why these two lessons?

**Positioning:** call this memory preparation and source-preserving segmentation. It does not deliver persistent memory, summarization, retrieval, or history replacement.

Both are singleton native generation workflows with read-only preparation. They teach a useful operation without requiring a background worker, a derived memory database, an acknowledged processing frontier, or a multi-root system installation.

| Included exercise | User outcome | Required new capability | Deliberately absent |
| --- | --- | --- | --- |
| 34: lore passages | Split a real selected lore snapshot into inspectable passages, with explicit size/overlap and tokenizer settings where applicable | Chunk text segmentation and its source/derivation reporting | Import Job, automatic indexing, durable memory writes |
| 35: three-turn passages | Group older verified assistant/user turns while preserving the recent raw window | Chunk assistant-turn grouping and the genuine Scene Context pairing/source path | Summarization, processing cursor, background scheduling, history omission |

The included lessons use the existing generation boundary when the user explicitly sends a reply. Read-only preparation has no auxiliary text-completion, embedding, or index request. Optional native Send is a separate disclosed generation request. Real source setup may use the host's existing source-enrollment metadata; read-only preparation does not mean that ordinary setup/settings can never persist local state. The workflow itself creates no derived document, index, or Job checkpoint.

Lesson 34 preserves exact offsets within the supplied snapshot text. Plain text Chunk output can correctly have empty source references and an unmapped status; exact snapshot offsets must not be advertised as live native history coverage. The UI and lesson must make that distinction clear.

Lesson 35 is not a text-only substitute for the native reader. It must still obtain the real selected chat's current source and pairing proof, reject stale inputs, and respect the protected window. Copying JSON or inventing fixture authority is not an acceptable shortcut.

The current curriculum specifies the exact exercises and bounds. This release proposal narrows which lessons ship; it does not silently weaken the included lesson contracts. See the [focused curriculum](../../design/memory-workflow-contracts/examples-curriculum.md) and [Chunk contract](../../design/memory-workflow-contracts/chunk.md).

### Why not include lessons 31 and 32 immediately?

Their session-log and every-third-reply outcomes look small, but introduce event subscriptions, accepted-reply semantics, derived writes, cadence ownership, and acknowledgement/failure handling. They are good candidates for a later maintenance release after that complete user journey is proven. Adding them now would reopen the boundary this proposal is intended to close.

## 4. Public scope and exclusions

| Area | Foundation release decision | Completion obligation |
| --- | --- | --- |
| Existing lessons 1–30 | Include | Preserve stable IDs and portable package bytes; verify affected behavior and compatibility |
| Chunk | Include | Every exposed mode/control must honor its contract, including bounded output, exact settings, tokenizer requirements, source mapping, and errors |
| Scene Context and selected lore snapshot support | Include the support required by 34/35 | Genuine current selection, pairing, source boundaries, and revocation; no fabricated authority |
| Existing collection/rendering/formatting operations used by the lessons | Include their required integration | Exact input/output compatibility and truthful source relationships |
| Singleton runtime-3 document/package support | Include the minimum complete path | Import, validation, editing, wire review, save, reopen, export, and independent reimport |
| Multi-root example systems | Defer as a new public feature | No capstone system installer or root-activation promise in this release |
| New On Event and Cadence surfaces | Defer | Preserve existing shipped acceptance/event behavior; do not advertise the new maintenance system |
| New durable Job surface | Defer | No public long-import, restart-resume, or background-processing promise |
| New Embed, Index, and Search surfaces | Defer | Preserve previously shipped Recall/search behavior; do not expose this new retrieval stack |
| New History Policy/history replacement | Defer | Ordinary raw-history behavior remains; Chunk output never authorizes omission |
| Lessons 31–33 and 36–44 | Defer | Keep sources, tests, specifications, and stable IDs on the development line |
| Lessons 45 and 46 | Defer | Preserve the full editable Summaryception and VectFox work; exclude from public examples/downloads |
| Ten-second performance target | Best effort | Measure included workflows; address hangs, avoidable repeated work, and cancellation failures |

The node names above refer to the **new memory expansion**. They are not instructions to remove already shipped features with related names or to change existing user workflows.

A dependency may remain internally only when its presence is necessary, reviewed, and unable to activate an excluded feature. Physical source inclusion and public execution are separate questions: an entire shared module cannot be removed just because its most visible feature is deferred.

If a required dependency would pull the unfinished durable lifecycle back into the release, stop and reassess the extraction. Do not solve that by relabeling the entire stack as foundation.

## 5. What “complete” means for this smaller release

Each included workflow must have a complete, ordinary user journey:

1. Find the exercise in the catalog and read what it does and what it costs.
2. Import it without executing nodes, changing the generation owner unexpectedly, subscribing to events, or creating background work.
3. Resolve any missing real source, local profile, or tokenizer through a visible setup path.
4. Inspect the selected source and Chunk output with the normal read-only controls.
5. Change supported settings and handle incompatible wires through the existing atomic wire-review flow.
6. Save, close, reopen, export, and independently reimport with the same supported semantics.
7. Optionally use the inspected preparation through the ordinary native Send path.
8. Encounter an understandable empty, unavailable, stale, or invalid result without partial publication or hidden work.

For lesson 34, verify empty versus whitespace-only input, actual paragraph boundaries, overlap, deterministic identities, explicit token sizing, and oversized indivisible input. Missing tokenizer support must give a clear setup/error outcome; approximate character division must not masquerade as exact token counting.

For lesson 35, use a disposable 13-assistant-turn chat with paired user messages. The initial protected-window exercise must select the older three turns and leave the newest ten raw. Verify the explicitly allowed smaller final group, no eligible history, missing pairing, protected/system/tool inputs, and source mutation after capture. Grouping must not manufacture processing or omission coverage.

If a Chunk mode remains publicly selectable, it belongs to the release's supported surface even when neither default exercise selects it. Hiding an unfinished mode requires explicit admission, UI, import, and documentation decisions; it cannot remain accidentally executable.

## 6. Preserve the larger build before extracting anything

Preservation is a release task with a verifiable result, not an assumption that the working directory will still be present later.

### 6.1 Capture a recoverable development checkpoint

Inventory the isolated `codex/memory-examples-028` checkout before creating a release branch. Include owned tracked changes and non-ignored untracked implementation files, authored factories, generated example sources, fixtures, tests, and research. Record the base revision and the checkpoint revision.

An ordinary commit does not preserve ignored `.tmp` evidence. Retain important ignored evidence in a separate checksummed local archive, and promote concise sanitized findings into durable repository reports. Preserve actual candidate/adoption distinctions and the exact source/test hashes used by important checks. Exclude credentials and unrelated personal data from the archive and repository.

The preservation deliverable must contain:

- A recoverable Git checkpoint for the full owned development state.
- A manifest for supplementary evidence not held in Git, including required ignored progress/handoff notes and selected `test-results` artifacts. Do not assume `.tmp`, `.superpowers`, logs, or test reports are captured by an ordinary commit or untracked-file stash.
- A short restore guide, including dependency/runtime assumptions.
- An evidence index separating passed component checks, rejected experiments, known failures, and unrun release acceptance.
- A restore verification in a separate checkout, demonstrating that required files and fixture inputs are present.

Keep the original development checkout intact while doing the extraction. Never reset, stash, or clean the unrelated dirty checkout at `F:/git/SillyCanvas` as part of this work.

### 6.2 Create a separate foundation release line

Start the release candidate from an explicitly reviewed base and transfer the approved capability groups with their tests. Use dependency-level decisions, because many commits and shared files contain both necessary foundation work and advanced memory work.

Do not assume that an earlier commit automatically represents a finished subset. Do not copy the entire dirty worktree and rely only on a menu filter. Run subset generation only in the isolated foundation checkout: the current generator can remove previously owned outputs when a smaller manifest replaces the full one. Preserve deferred outputs first, inspect the removal list, and verify that anything being removed is still an unmodified generated artifact rather than an edited user export. Keep a transfer ledger recording what was included, what was excluded, what shared behavior was retained, and what evidence supports each decision.

The original branch remains the continuation point for the larger system. Future work can compare against the foundation release and incorporate its fixes without reconstructing discarded code.

### 6.3 Keep future work actionable

For every deferred area, retain one short closure note: intended user outcome, implemented pieces, latest evidence, first known failing boundary, and the next acceptance milestone. Preserve the original full-system requirements rather than rewriting historical documents to make unfinished work appear complete.

The current source-bearing Job process-resume rejection, promotion Prior gap, complete capstone execution, both real GLM soaks, and selected-chat regressions remain explicit deferred work. Completed locator and acknowledgement controls remain useful evidence; they do not mean that full process recovery has been finished.

## 7. Make the release boundary enforceable

A hidden catalog tile is insufficient. Deferred operations are currently registered in shared runtime/catalog surfaces, and the normal memory-example generator defaults to all sixteen new lessons. The release needs one authoritative capability and example selection that reaches all public entry points.

The implementation must demonstrate the following:

| Boundary | Required foundation behavior |
| --- | --- |
| Catalog and Add Node | Only included new capabilities and examples are offered as runnable |
| Graph validation and execution admission | A package using an excluded operation is rejected before model, write, subscription, or worker work |
| Nested definitions and imported closures | Excluded operations cannot be smuggled through a helper, pinned body, example-set member, clipboard entry, or retained library snapshot |
| Import and document open | Unsupported packages give a clear incompatibility result without partially installing or arming a system |
| Export and generated artifacts | The release exports only its declared supported example set and complete required definition closure |
| Guides, search, counts, and downloads | No stale links advertise deferred lessons as available; visible count is 32 |
| Host startup and resource setup | No excluded worker, subscription, inference service, or durable store is provisioned simply by opening Lattice or an included exercise |
| Shipping source and bundles | Retained shared code has an explained dependency; unused advanced assets and stale generated outputs do not leak into the distributable |
| Legacy compatibility | Existing supported packages, hidden compatibility IDs, and native generation continue to work |

Use one explicit release manifest or equivalent central source of truth. Do not maintain unrelated hand-written allowlists in the UI, validator, generator, and archive builder. Admission must be checked at the actual execution boundary, not just the palette. The capability decision must include settings, modes, ports, and resource access on existing operation IDs; rejecting new operation names alone would leave new File effect modes or history-policy inputs reachable.

Mixed saved libraries require an explicit non-destructive compatibility policy. An unsupported deferred definition must never be silently deleted or rewritten to a different semantic pin. Report incompatibility and preserve the original data; do not claim the shelf is usable until supported existing definitions can still be accessed without granting execution to unsupported ones.

The existing `buildMemoryExampleOutputs(sources)` supports explicit subsets for injected callers, but its normal CLI still invokes the full curriculum factory. That is **not** an already implemented foundation-release mode. Subset generation, deterministic checking, owned-output cleanup, guide generation, and distributable assembly need a supported path before release. Generation must never delete user exports or unrelated files.

Generated files also need actual consumers. The inspected `src/workflow/examples.js` and `src/workflow/node-guide-examples.js` still use the remastered dataset for the public catalog and guide selection; the generated memory modules are not yet wired into those paths. Include real listing, lookup, installation, revision, guide insertion, and fixture access for 34/35. Merely putting two JSON files in an output directory is not completion.

The installed distribution has a separate boundary. The current build includes an embedding-runtime step, asset checks require embedding assets, and the install smoke copies complete source/assets trees rather than a release subset. Preserve anything required by already shipped Recall/search; exclude new embedding capabilities without breaking those dependencies. Do not prune advanced files until remaining versioned imports and build/asset checks are coherent. The smoke copy does not currently include the `examples` directory, so installed exercise fixtures must be embedded or explicitly distributed and verified. Verify the repository-installed source tree as well as the UI bundle; tree shaking does not remove the native module graph.

## 8. Evidence we have, and what it does not establish

The current development line contains substantial implementation and test work. It is worth preserving. It is not equivalent to a verified foundation release.

| Existing evidence as inspected on 2026-10-21 | What it establishes | What remains unproven |
| --- | --- | --- |
| Reviewed source enqueue/checkpoint locator candidate: one genuine native two-checkpoint test passed in about 157 seconds, zero model calls | Exact original transition references can be retained through that installed lifecycle | Full process recovery, capstone correctness, or release packaging |
| Applied source-path compatibility group: 14 native cases passed in about five minutes, including final/partial lost ACK and descriptor controls; saved freeze check found no drift | The applied change preserved those bounded native handoffs | A complete source-bearing Job can resume after a fresh process restart |
| Applied IO planner group: 14 tests passed; strict locator declaration check exited successfully | Those finite accounting and declaration checks passed | Complete release integration or acceptable end-to-end latency |
| Application type check: zero errors and zero warnings | The inspected working build passed that static check | Correct native user journeys or release packaging |
| Chunk lesson factories and focused authored/component tests exist | There is concrete reusable work from which to extract the foundation | Both lessons pass the new release's installed acceptance matrix |
| Summaryception comparison and known source-recovery/prompt gaps are documented | The current cost and functionality gaps have identified boundaries | Full capstone correctness, model quality, real-model soak, or a ten-second target |

No real GLM soak has passed in this task, and the inspected ledger records zero paid model calls. Do not present deterministic transport responses as provider-quality evidence.

The evidence index at preservation time should copy the relevant sanitized result summaries and hashes into a durable report. The current local logs live under `.tmp/continuation-root-source-locator-*` and are not automatically preserved in Git. Earlier reports remain useful but must not override later scoped evidence or known failures.

## 9. Acceptance gates for the foundation candidate

These are proposed checks to perform on the extracted release, not passed results.

| ID | Gate | Required result |
| --- | --- | --- |
| F01 | Preservation and restore | Full development checkpoint and supplementary evidence can be restored independently |
| F02 | Scope inventory | Explicit 32-lesson manifest; included capability dependencies accounted for; no accidental advanced feature activation |
| F03 | Legacy examples | Existing 30 stable IDs/order/package bytes retained; previously hidden compatibility IDs remain importable |
| F04 | Package/document lifecycle | Both new singleton packages and editable documents import, save, reopen, export, and independently reimport with complete closure |
| F05 | No execution on open | Open, preview, navigation, and import create no inference request, subscription, Job, derived write, or history omission |
| F06 | Lesson 34 behavior | Real selected snapshot, segmentation/overlap/identities/tokenizer semantics, emptiness, and bounded atomic errors match the contract |
| F07 | Lesson 35 behavior | Genuine native pairing, older-three/newest-ten selection, partial final grouping, empty history, and protected-message rules match the contract |
| F08 | Currentness and isolation | Edit, swipe/selection change, chat/branch/user switch, cancellation, and stale delivery refuse affected work without reviving old authority |
| F09 | Editor usability | Mode changes and wire review are atomic; controls, errors, keyboard use, and narrow layouts remain usable; saved values survive reopening |
| F10 | Native generation | Included preparation reaches ordinary Send correctly; cancellation and normal completion work; raw history remains intact |
| F11 | Deferred-feature rejection | Direct/nested imported excluded operations and settings/ports fail before dispatch; mixed retained libraries preserve data and supported access; palette hiding is not the sole guard |
| F12 | Catalog and guide integrity | Public listing/lookup/install actually consume 34/35; exactly the supported entries appear; guides and installed fixtures resolve; deferred downloads and misleading counts are absent |
| F13 | Build and package | Deterministic generation/check, safe owned-output removal, types, required regression checks, asset/import closure, fixture availability, and clean-install smoke pass on the actual distributable |
| F14 | Existing product regressions | Affected ordinary generation, document handling, existing Recall/search, and enabled/disabled startup remain correct |
| F15 | Responsiveness and cost disclosure | Record setup, preparation, local persistence where applicable, and optional Send separately; no unexplained hangs or hidden requests |
| F16 | Release review | Every included feature has a closed acceptance record; shipped limitations and deferred work match the product |

A bounded live native Send smoke through a supported provider is appropriate for the included integration. It does not require a Summaryception/VectFox campaign soak. Use an isolated disposable chat and record actual requests and results. Do not copy or run existing personal campaign chats just to validate segmentation.

The complete application still needs its normal release regression checks once the candidate is assembled. Small scope reduces the acceptance surface; it does not justify releasing shared runtime regressions.

## 10. Work sequence and stopping rules

### Milestone A: preserve and map

Deliver the recoverable checkpoint, evidence index, restore proof, capability dependency map, and explicit release manifest. Resolve whether required source/reader support can be separated from the unfinished lifecycle without broad rewriting.

**Stop condition:** if the dependency map shows the two exercises require the unfinished durable source Job chain, do not expand the release to finish that chain. Reassess the included exercise or keep the current stable release while preserving the larger build.

### Milestone B: extract the smallest working candidate

Transfer required Chunk/reader/runtime/singleton-editor changes and tests to the foundation line. Make the release capability boundary consistent across admission, UI, generation, and packaging. Keep the original development line unchanged apart from deliberate shared fixes tracked in the ledger.

**Deliverable:** both included examples run through the real installed host, and excluded operations are rejected before any effect. This is the first meaningful vertical completion point.

### Milestone C: close each exercise independently

Complete lesson 34 and its immediate import/editor/Send handoff first. Preserve its passing evidence. Then complete lesson 35 and its real reader/pairing/currentness handoff. Fix failures at their first observed boundary.

Do not repeatedly run the whole memory stack. Re-run passing groups when shared code changes affect their assumptions or a new failure gives a reason. Use one root-owned dynamic test process at a time when shared fixtures, servers, or frozen candidate files could interfere.

### Milestone D: verify and package once

Assemble the distributable from the approved manifest, run required broader regressions and clean-install checks, review the actual contents and limitations, then prepare the versioned release and normal integration. Preserve a recoverable release-candidate state before publishing.

No new lesson, backend mode, automatic repair path, performance architecture project, or capstone joins this release midway because it appears almost finished. Adding scope requires an explicit change to this proposal and its acceptance matrix.

## 11. Relative effort and remaining uncertainty

The highest uncertainty is extraction of shared runtime and source-reader changes, not writing two new lesson descriptions. The examples already have authored sources; that does not eliminate integration work.

| Work | Expected relative effort | Main uncertainty |
| --- | --- | --- |
| Preserve and document the current build | Low to moderate | Owned untracked files and ignored evidence must be captured correctly |
| Define and extract the capability boundary | Highest and least predictable | Shared imports, validators, host setup, and generated assets may couple included and deferred features |
| Close the two user journeys | Moderate | Real selected-source pairing, editor/document lifecycle, and native Send integration |
| Regression review and packaging | Moderate | Existing product behavior and distributable contents must match the smaller manifest |
| Deferred capstones | Excluded from this estimate | They remain separate development work |

A defensible calendar estimate should follow Milestone A. Giving a precise completion date before that audit would hide the largest uncertainty. If extraction costs approach finishing the original build, prefer preserving the development checkpoint and maintaining the stable release over inventing another large framework to achieve a small release.

## 12. Later releases, with independent completion boundaries

No later version number is promised by this proposal.

| Later increment | Useful complete outcome | Entry gate |
| --- | --- | --- |
| Accepted maintenance | Session log and every-third-reply recap, corresponding to lessons 31/32 | Complete accepted-event, write, cadence, stop/failure, and acknowledgement behavior |
| Durable imports and repair | A long import can stop/restart/resume and reconcile changed source safely | Full fresh-process source recovery, unknown-outcome handling, truthful status, and stable ownership |
| Retrieval foundation | Explicit embedding/index preparation and useful dense/hybrid retrieval | Complete provider/storage capability path, seed/update/delete lifecycle, isolation, and actual retrieval integration |
| History replacement | Only current acknowledged covered history is replaced | Final native assembly proof, raw fallback, and edit/invalidation handling |
| Summaryception | Complete editable layered memory with correct promotion context and lifecycle | All required durable/source/prompt/repair gates, full workflow validation, then its real-model soak |
| VectFox | Complete editable structured event memory and retrieval | Extraction, zero-event processing, retrieval, packing/repair gates, full workflow validation, then its real-model soak |

These are development increments with their own user outcomes. They are not a promise to ship an arbitrary intermediate state. A complete increment may legitimately be released before the next one is implemented.

## 13. Decision record and document handoff

The proposed decision is: **existing 30 lessons plus lessons 34/35 and their complete dependency closure; all other new memory systems stay unreleased.** The historical all-46 design remains the destination for the preserved development line.

This proposal is more conservative than simply removing the two capstones. Lessons 36 and 43 directly promise recovery/repair, lessons 37–42 bring a retrieval stack, lesson 44 promises safe omission, and lessons 31/32 introduce background maintenance. Keeping all of them as release requirements would leave most of the original complexity in place.

After this boundary is adopted, write the extraction implementation plan against the audited file/dependency map. Update the active release report and acceptance requirements to refer to this smaller release, while retaining the original capstone contracts and evidence. Do not quietly edit old counts or mark the full memory program complete.

No product files, generated examples, version numbers, or published releases were changed in preparing this proposal. The recovery checkpoint, extraction, new acceptance results, and release package are future deliverables described here.

## 14. Engineering reference map

| Existing source | Relevance to extraction |
| --- | --- |
| [Original expansion design](2026-10-16-memory-examples-expansion-design.md) | Historical all-46 scope, compatibility and teaching requirements |
| [Current implementation evidence report](../reports/2026-10-16-memory-examples-expansion.md) | Broad development evidence; individual entries have their own verification scope |
| [Focused curriculum](../../design/memory-workflow-contracts/examples-curriculum.md) | Exact lesson identities, outcomes, fixtures, and costs |
| [Chunk contract](../../design/memory-workflow-contracts/chunk.md) | Full publicly exposed Chunk behavior and failure rules |
| [Memory generator](../../../tools/build-memory-examples.mjs) and [factory dispatch](../../../tools/memory-examples/curriculum.mjs) | Currently default to the full curriculum; require an explicit supported release subset path |
| [Operation catalog](../../../src/workflow/catalog.js) and [graph validation](../../../src/workflow/graph-validation.js) | Deferred operation registration and runtime admission boundary |
| [Example catalog](../../../src/workflow/examples.js), [guide selection](../../../src/workflow/node-guide-examples.js), [definition library](../../../src/library.js), and [node palette](../../../src/ui/node-palette.js) | Add real subset catalog/guide integration; public discoverability and mixed-library handling must agree with admission |
| [Example-set support](../../../src/workflow/example-sets.js) and [document support](../../../src/workflow/example-set-document.js) | Distinguish required singleton runtime-3 support from deferred multi-root systems |
| [Install smoke](../../../tools/smoke-install.mjs), [asset checks](../../../tools/check-assets.mjs), and [build scripts](../../../package.json) | Installed source, fixtures, legacy embedding dependencies, and release assets must agree |
| [Source-process recovery plan](../plans/2026-10-21-native-source-process-recovery.md) | Open durable recovery work preserved outside this release |
| [Summaryception latency comparison](../../research/2026-10-21-summaryception-runtime-latency-comparison.md) | Performance attribution and measured versus unmeasured claims |

Success for the foundation release is a small set of complete, supported user journeys, a verified distributable, and a recoverable continuation point for everything deferred.
