# Foundation release execution evidence

Date:2026-10-21. Status: **active; release not complete**. The user adopted the [foundation proposal](../specs/2026-10-21-foundation-release-proposal.md) for execution through an active goal. The [implementation plan](../plans/2026-10-21-foundation-release.md) owns bounded delivery steps. This supersedes the all 46 scope only for this release; the full memory program remains preserved and incomplete.

## Scope

Proposed0.28 release: exactly 32 visible lessons, preserving existing 30 and adding stable lesson 34/35; Chunk plus the complete necessary reader/runtime/singleton-editor/packaging closure. New maintenance/Job/retrieval/history-replacement/multi-root systems and other new lessons remain unreleased. Existing supported behavior, including Recall/search, remains a compatibility requirement.

## Preservation: verified

- Original source branch:codex/memory-examples-028, HEAD5b2ae796f59209665e48a43240d42db3c6ecd488. Inventory168modified+346untracked=514ownedchanges,12874957changedbytes.
- Independent preservation ref:codex/memory-build-preserved-20261021, commit5f1e2c4ca3a727ec95c8b7dca9e1facb3a38bcd7, tree7a9367f1fadd91f7cc13bf81e0e4190df75f69bc.
- Standalone Git bundle verified. Alternate index kept the original source branch/index/working state unchanged during capture.
- Exact-byte owned source:2039files. Selected ignored evidence:12613files plus53 explicit frozen verification assets in a required supplement. Credential-pattern scan found0matches; browser profiles/dependencies/unrelated personal-chat artifacts were excluded from the evidence policy.
- Independent local clone restored14705entries, including1437frozen source rows and35archive overlays,0missingfiles/0hashfailures. Fixture/host/UI/extra checks also pass. Reusable restore program verify-only check passes. These are restoration checks, not runtime or release tests.
- First restore exposed the suffix-filter omission of53verification assets including editorSvelte files. A checksummed supplement closes this; both archives are required for exact restore.

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| full-memory-checkpoint.bundle | 37825141 | 0fb5a13e1c84c39701282c409058d078af2000588ec5c2f654daf2e4afb83e3c |
| preserved-files.zip | 57562772 | 758cad01b7f8cb5fd1232c7d706210a3d40ea59c66444a4a72f4815cef0956bf |
| frozen-assets-supplement.zip | 430036 | d7da11cc77190ef7ac8ed5ca9d9f84c311ed106337bc480d75839531146f3303 |

Supplementary artifacts stay local at `C:/Users/Keptin/.codex/worktrees/memory-examples-028/SillyCanvas/.tmp/foundation-preservation-2026-10-21/`. Keep this directory intact before archiving/removing the source worktree. It contains ARTIFACTS.sha256, the manifests/index, RESTORE.md, restore.py, inventory/index/patches, native evidence and restoration reports. [Restore guide](../handoffs/2026-10-21-foundation-preservation.md).

## Extraction audit: preliminary

GitHub CLI authenticated successfully; remote mainc0a994ba2b250d24ca8c7114a4e77865e03ab855 matched localorigin/main on2026-10-21 and identifies package0.27.5. Native managed worktreefoundation-release-028 created at that exact revision; new branchcodex/foundation-release-028. Foreign dirtyF:/git/SillyCanvas is untouched.

A static transitive import audit of historicald7ba79e catalog/host/runtime found94JSfiles,0missingimports and0new maintenance/Job/embedding/index/search/history-policy domain imports. This provides a plausible extraction reference; it does not prove current contract behavior, correct later fix transfer, baseline tests, or foundation readiness. Relevant historical references:7542a40Text Chunk,d7ba79esource-backedChunk,46c42f2record transforms. A preliminary transfer map now records 180 source/type paths: 140 retain-main, 22 existing-file ports and 18 new files needing review. Fifty paths differ in the later full-memory build and require scoped correctness review where relevant. The bounded transfers below are implemented and verified. Singleton document/catalog/packaging decisions and relevant later deltas remain under review.

Locked dependency installation succeeded (97 packages; package/lock inputs unchanged). Six focused existing test files passed: workflow contracts, unified contracts, package round trips, scoped examples, catalog freshness and node-guide examples. Application type check passed with zero errors and zero warnings. A legacy baseline records 95 artifact/data-file hashes, 30 visible catalog entries and 32 hidden compatibility entries. These are clean-base results, not acceptance of the future foundation implementation.

## Acceptance status

| Gate | Current evidence |
| --- | --- |
| F01 preservation/restore | PASS as scoped above; retain all required local archive artifacts |
| F02 scope/dependency inventory | Explicit34/35manifest and bounded maintenance-free closure implemented; final later-delta/installed audit remains |
| F03 legacy compatibility |95legacy artifact hashes unchanged;32visible/32hidden; final release compatibility check remains |
| F04 package/document lifecycle | Both compiled installed UI journeys pass save/reopen/export/reimport against a synthetic host |
| F05 inert open | Startup/open/catalog/preview make0modelcalls; source save/readback occurs only through explicit setup in35 |
| F06/F07 lessons | Component and installed synthetic journeys pass; real-host acceptance remains open |
| F08 isolation | Focused private-proof/currentness/cancellation/source-setup checks pass; real-host verification remains |
| F09 editor | Runtime3edit guards and source-control projection fixed through actual failures; desktop/narrow synthetic UI verified |
| F10 native generation | Real-host/provider smoke remains open; previous local8000host is offline |
| F11 deferred surface | Catalog/runtime/import fences and focused cases pass; final installed audit remains |
| F12 catalog/guides |32visible and two selected generated lessons/embedded fixture downloads; focused consumer checks pass |
| F13 build/package | Current0.27.5development candidate builds;802versionedimports and cleaninstall pass;0.28finalcandidate not yet packaged |
| F14 regressions | Affected focused checks pass; required release sweep remains |
| F15 latency/cost | Synthetic installed34prepare128ms/35prepare517ms;35setup69ms with1save/1readback;0paidcalls. Real-host Send unmeasured |
| F16 final review | Not started; foundation goal remains active |

The earlier full-memory component tests, latest14native locator/ACK checks, declaration/app type checks and2checkpoint evidence remain preserved. They do not substitute for foundation installed acceptance. Paid calls0; native foundation lesson proofs0; capstone soaks are deferred. A bounded Text Chunk transfer is verified below. No version bump, release package, whole-branch review closure or main push has been performed.

## First bounded capability: Text Chunk

Transferred only historical Text Chunk/runtime-3 change7542a40 and source DTO dependency385e520, including directly affected authoring/package/control tests. No new maintenance, Job, embedding, retrieval or history-replacement domain was transferred.

A genuine new foundation regression first failed UNKNOWN_OPERATION (1fail/1pass). After transfer, both the actual Chunk catalog/runtime/portable-package handoff and deferred-operation absence checks pass; raw chunks retain exact snapshot offsets, no invented native source references, and zero model calls. Twelve focused affected test files passed in8seconds. Application types report0errors/0warnings. All95 legacy artifact/data-file hashes remain unchanged.

This closes the first Text Chunk handoff only. Live native source grouping, later relevant correctness fixes, singleton lesson packaging/catalog/guides, complete34/35 user journeys, installed assets and the full release acceptance matrix remain unfinished. No latency or readiness claim is inferred for those paths.

## Native source component and foundation admission fences

The actual native controller fixture first failed because setupSources was absent. The audited maintenance-free source/reader/proof closure from d7ba79e now groups the oldest three verified assistant/user pairs in a thirteen-turn fixture, protects the newest ten, retains six exact source references and makes zero model calls. The focused case passed in about436ms, with one explicit setup metadata save and one verification read. This is component evidence; generated lesson35 and installed-browser/provider proof remain pending.

The central foundation-release selection now declares lessons34/35, Chunk, deferred operations and settings, supported recent/before-window readers and no multi-root examples. Event/cursor/range/frontier controls reject before native IO. The reader producer omits the cursor from its original branded result, preserving exact identity rather than cloning a pointer-shaped replacement. Direct and retained-snapshot File/history controls refuse through the shared catalog admission path.

The original immutable-parent fix5dfa394 was reproduced (caller mutation could remove freshness checks), then applied and verified. Relevant later native persistence behavior was ported without importing the maintenance-store/actor IO framework: the original actual receiver and cancellation state are checked immediately before native save/header/fetch dispatch. Five genuine receiver/cancellation RED cases plus two preexisting controls become7/7PASS; unchanged actual receivers still acknowledge.

Ten focused source/Chunk/proof/registry/persistence test files pass. The scoped host suite passes53cases, including current-source/actor/user changes after awaited callbacks, native swipe handling, final transport mutation, accessors and privacy. Eight affected admission/package/editor compatibility files pass. Application types remain0errors/0warnings; all95legacy artifact/data hashes match. Static catalog/host/runtime import closure is95JSfiles, with0missingimports and0deferred-domain imports.

Historical event/frontier/cursor host assertions were adapted to this release's explicit refusals, preserving ordinary missing-input/legacy behavior. The old-source final-transport mutation tests retain their original physical callback and zero-send assertions, selecting the same first pair with a supported bounded before-window page. Recording lookup in the new fixture uses the existing interned-address decoder. A retained-definition fixture initially normalized away its forbidden flag during export; the raw packet now explicitly retains that flag and asserts the fixture precondition before checking rejection.

The full original tests and advanced implementations remain in the preservation checkpoint. These checks do not close singleton packaging, editor source-setup UI, lesson34/35 installed user journeys, future-dependency review, clean installation, provider smoke, release review or publication. Paid calls remain0.

## Singleton document core: verified

The existing singleton path now uses schema2/minRuntime3 for graph4/runtime3, preserves the actual runtime3 source controls during local and portable projection, and includes those controls in dirty tracking. Runtime3 helper interface semanticShape is retained without changing exact semantic pins. Legacy document/version pairs remain unchanged; crossed version floors reject.

Four genuine regressions were observed before the implementation: wrong document floor, dropped protected-window export settings, missed dirty changes, and helper DEFINITION_HASH after local projection stripped semanticShape. All four now pass. A second four-case regression established that local document save/import could normalize away forbidden File/history controls, including a retained helper. A shared descriptor-only reserved-control check now rejects those before projection, with an explicit unsupported-foundation error and no getter-based control read.

Nine document cases and nine affected document/session/controller/package/admission test files pass. Application types report zero errors/warnings; all95legacy artifact/data hashes remain unchanged. This extends the existing singleton serializer/session route and imports no multi-root system or maintenance framework.

The actual two-lesson generator, example metadata/fixtures, merged32entry catalog, addressed Chunk guides, visible source-setup action, complete installed user journeys and release acceptance remain pending. The document core results do not claim F04/F09 complete by themselves.

## Singleton lessons and catalog component verification

The foundation branch now generates only stable lessons34/35. The visible catalog contains32entries; all32hidden compatibility entries remain available. New portable/editable files retain descriptive lesson metadata and exact checkpoints through install ID remapping, save/reopen and recovery. Installed fixture bytes are embedded and downloadable in lesson details. Ten focused catalog/guide/generation testfiles and19document/state/package testfiles pass; types have0errors/0warnings. Generation `--check` reports no drift and95legacy hashes remain unchanged. These are component checks: actual installed native journeys, explicit source/tokenizer setup, provider smoke and release packaging remain open.

## Explicit source and tokenizer setup boundary

Scene Context details now exposes explicit chat source setup, saved verification and reconciliation. Display performs no IO; the current action uses the actual native controller save/readback. Controls reject a replaced document/chat and cancellation aborts pending delivery. Chunk details identifies a supplied exact tokenizer or reports its absence with UTF-16 as the available choice. The native handoff carries only the supplied exact capability, never the ordinary guidance estimator. Component checks:10focused files PASS8.1s, types0/0,95legacy hashes unchanged. Real installed journeys and paid smoke remain unverified; the former local host8000is offline and installation location has been requested.

## Installed production UI: lesson34

A clean installed distribution with no developer UI or node_modules completes lesson34 through ordinary catalog, Run to here, overlap edit, Save As/download, Open, portable export and independent reimport. Four default passages become five with overlap16; record IDs survive deterministic rerun and both file roundtrips. Preparation128ms/rerun94ms; zero model/APIcalls, pageerrors or missingassets. This uses an explicitly synthetic host, so it does not replace the required real-host/provider smoke. The run exposed and fixed four runtime3 editor admission gaps with4RED-to-GREEN cases;9affected files pass, types0/0 and95legacy hashes remain unchanged. Production assetcheck also required separating pure Chunk controls from private execution imports; the self-contained UI check now passes with802versioned installed imports.

## Installed production UI: lesson35

The second clean-install journey uses the actual native controller/registry/verifier against an explicitly synthetic disposable host backend. Source setup is inert until the UI action, then performs one save/readback in69ms. Preparation517ms selects three older pairs and preserves the newest ten raw; changing the window to eight produces groups3/2, and changing passage size to two with the original window produces2/1. Six exact source references, graph values and record identities survive both editable and portable file roundtrips. Raw history is unchanged and modelcalls0. Narrow review caught the static Scene-control projection gap; admitted runtime3 descriptors now expose selection/protected turns and omit inapplicable recent/root-only controls. Thirteen affected UItestfiles pass, types0/0, and95legacy hashes remain unchanged. Real-host/provider verification remains open.
