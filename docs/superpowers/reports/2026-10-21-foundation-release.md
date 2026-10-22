# Foundation release execution evidence

Date:2026-10-21. Status: **foundation release verified and published to main**. The user adopted the [foundation proposal](../specs/2026-10-21-foundation-release-proposal.md) for execution through an active goal. The [implementation plan](../plans/2026-10-21-foundation-release.md) owns bounded delivery steps. This supersedes the all 46 scope only for this release; the full memory program remains preserved and incomplete.

## Scope

Candidate 0.28.0 release: exactly 32 visible lessons, preserving existing 30 and adding stable lesson 34/35; Chunk plus the complete necessary reader/runtime/singleton-editor/packaging closure. New maintenance/Job/retrieval/history-replacement/multi-root systems and other new lessons remain unreleased. Existing supported behavior, including Recall/search, remains a compatibility requirement.

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

## Current candidate and dependency audit

The isolated branch `codex/foundation-release-028` starts at published main `c0a994ba2b250d24ca8c7114a4e77865e03ab855` (0.27.5). The unrelated dirty `F:/git/SillyCanvas` checkout and original full-memory worktree remain untouched. GitHub main was reverified through network-enabled `gh` at that same base before final review preparation.

The candidate is version **0.28.0**. One central release policy selects lessons 34/35, Chunk, supported recent/before-window sources, and singleton generation documents. Deferred operations, controls, nested definitions and raw package fields fail admission before IO. Exactly 32 visible lessons and all 32 hidden compatibility IDs remain available; all 95 baseline artifact/data-file hashes are unchanged. Ten generated outputs plus their ownership manifest are deterministic. The generator refuses modified owned exports and unexpected manifest ownership.

The runtime import inventory from index/catalog/host/runtime/controller has **198 JavaScript files, zero missing imports and zero deferred domain files**. The file-level transfer map records retained-main, cache-version-only, selected semantic, and new dependency decisions. Historical references 7542a40, 385e520 and d7ba79e supplied the narrow Chunk/source foundation. Relevant later immutable-parent, actual receiver and final-cancellation guards were reproduced and transferred separately. No durable maintenance or multi-root framework was imported. Inventory counts are static closure evidence, not a claim of complete native acceptance.

## Acceptance status

| Gate | Current evidence |
| --- | --- |
| F01 preservation/restore | PASS: independently restored 14,705 entries, zero missing/hash failures; retain all three local archives |
| F02 scope/dependency inventory | PASS: bounded198-file runtime closure and file-level decisions reviewed; no missing/deferred-domain imports |
| F03 legacy compatibility | 95 exact hashes unchanged; original 30 lessons and 32 hidden IDs retained; affected compatibility checks pass |
| F04 document lifecycle | Both installed compiled UI journeys pass editable Save As/Open and portable export/independent reimport on a synthetic host |
| F05 inert open | Startup/open/catalog/preview make zero model calls; source save/readback requires explicit setup |
| F06/F07 lessons | Both actual SillyTavern1.19.0 full edit/save/reopen/export/reimport journeys pass after native chat loading; lesson35 native captured-response completion also passes |
| F08 isolation | 53 source-host cases pass after review fixes; actual source setup/readback and native completion preserve the original history; exact guards retained |
| F09 editor | Runtime3 editing, canonical source controls, explicit setup, keyboard/narrow and document browser checks pass |
| F10 native generation | Complementary proof: one actual NanoGPT request completes; initial continuation failure is diagnosed and corrected; final actual-host captured-response Native Send completes with one review handle and zero auxiliary requests. No second paid Send is claimed |
| F11 deferred surface | PASS: shared catalog/import/runtime fences, nested retention and mixed-library compatibility; fresh review and full regressions closed |
| F12 catalog/guides | Exactly 32 visible lessons; Chunk guide and two selected lessons have embedded downloadable practice files |
| F13 build/package | PASS: final0.28.0 types/build/assets,810imports;505-file ZIP independently extracted/rehashed and both actual native Send replays pass from that exact install |
| F14 regressions | PASS: one final frozen run375/375Node files and51/51affected browser checks; initial failure lineage retained below |
| F15 latency/cost | PASS: archive native preparation110ms/555ms; explicit35setup259ms(save8.41ms/read3.79ms); actual provider1288ms; archive Native Send replay1077ms/1416ms. Separate measurements on the disposable fixture; ten seconds remains best effort |
| F16 final review/integration | PASS: fresh review and fixes closed;375/51checks and exact archive smoke green; source release published normally and all504package inputs/95legacy blobs verified remotely |

The foundation goal is complete. The broader memory program is preserved and incomplete. The final archive is built and verified. The [source release commit](https://github.com/MentallyQuill/Lattice/commit/a4f4eaf32f3063d6a62f9f585e098acea09b3395) is published on main through a normal fast-forward with force=false. Synthetic installed-host evidence is not counted as actual native/provider proof. The real-provider transport and current native replay are reported separately.

## Product behavior and verified fixes

**Chunk and native sources.** Text passages preserve exact offsets and deterministic identities. Before-window selection groups the oldest three verified user/assistant pairs in the supplied 13-turn fixture while preserving the newest ten as raw history. The branded original SourceReader output owns pairing authority; copied JSON or IDs cannot recreate it. The supported producer omits the deferred cursor instead of cloning a branded output. Currentness checks retain source, actor, user, physical receiver and late cancellation boundaries.

**Singleton documents.** Exact graph3/runtime2 and graph4/runtime3 pairs use their existing singleton serializers with appropriate portable/editable version floors. Runtime3 source fields participate in projection and dirty tracking; helper semantic shapes retain exact pins. Bounded own-JSON example metadata is descriptive, includes precise checkpoints and remaps root IDs/references on installation. Portable invalid checkpoints refuse; ordinary local topology edits prune obsolete descriptive checkpoints. Invalid activation preserves the current document and history.

**Source and tokenizer setup.** Scene details exposes explicit setup, verification and reconciliation using the actual native controller. Display is inert. Captured document/chat/revision ownership and AbortController reject stale actions and late delivery. Chunk accepts only an identified exact tokenizer capability, forwarded into the runtime. The standard host supplies no exact binding by default, so details truthfully reports it unavailable and offers UTF-16; the guidance estimator never substitutes for exact token counts. The accepted proposal section5 permits this clear unavailable/error boundary.

**Editor/runtime closure.** Four runtime2-only guards caused an actual installed overlap edit failure; shared exact-version admission fixed them without weakening ownership or pins. An initial generic draw-descriptor override then hid Prompt Source Form. The final fix derives graph-specific canonical metadata only for runtime3 Scene; other operations retain canonical controls. Twelve affected UI files and types pass.

**Mixed saved library.** The shelf validates supported revisions using the appropriate runtime, quarantines only explicitly deferred rows and their dependents, and keeps raw unavailable definitions/heads unchanged through supported edits. Cold rows grant no identity or execution authority. Revision floors include retained versions, Save New ID checks retained IDs, and deleting a supported dependency pinned by unavailable data refuses before writes. Ordinary corruption still fails. Four new regressions and ten affected files pass, including all 32 hidden-ID installs. Library-view Save As preserves its actual schema/runtime.

**Installed module identity.** Chunk's pure authoring contract is separate from its executor, keeping the UI bundle self-contained and the native proof domain singular. Version tooling migrates static, lazy and numeric URL-constructor imports while preserving intentional isolation markers. Actual RED/GREEN regressions cover both missing migration forms. The final installed asset audit covers 810 versioned imports.

## Verification lineage

The completed broad Node run is recorded as `release-028-node-all.log`: 368 of 374 files initially passed. The six failures were one real Prompt Source control projection regression, a close-fixture cancellation dependency, two stale catalog expectations and two stale explicit proof-observer URL versions. Final focused evidence: `release-028-regression-fixes-focused.log` seven files pass; `release-028-source-host-final.log` all 53 cases pass; `release-028-canonical-controls-final.log` 12 files pass. This does not claim a same-run 374/374 result. The unchanged existing geometry/execution files completed in the broad run and were not repeatedly rerun.

The affected browser suite completed 50/51 in `release-028-browser-final.log`; the remaining narrow picker assertion expected lesson30's old graph name after successfully activating35. Its corrected literal lesson35 graph name passes in `release-028-browser-picker-recheck.log`. Other document/file-menu/details/guide/input-source journeys pass. Final type check has zero errors/warnings; build and asset checks pass.

## Installed production-bundle journeys

`release-028-final-installed34.log` installs the distribution without developer UI or node_modules, opens lesson34 through the catalog, downloads the fixture, produces four default passages and five with overlap16, reruns deterministically, and completes editable and portable file roundtrips. Preparation127ms/rerun94ms; zero host API/model calls, page errors or missing assets. The public curriculum screenshot was captured from this actual 32-entry picker.

`release-028-final-installed35.log` uses the actual native source controller/registry/verifier against an explicitly synthetic disposable backend. Explicit setup makes exactly one save and one readback in67ms. Preparation518ms yields groups[3]; protected-window8 yields[3,2]; passage size2 with the original window yields[2,1]. Six exact source references, graph values, record identities and raw history survive both file roundtrips. Zero model calls, page errors or missing assets.

Desktop and 390px source/tokenizer controls have been visually checked. These installed journeys prove production packaging and UI handoffs, but do not substitute for the real-host/provider gate. The previously used localhost8000 was offline. Actual-host validation now uses SillyTavern1.19.0 at `F:/SillyTavern/SillyTavern` with a disposable data directory and no copied personal chats. No personal chat or capstone campaign is authorized by this release scope.

## Fresh review and actual native closure

One read-only fresh-context reviewer examined the whole branch c0a994b..18bde55. Three important findings were witnessed failing and fixed: ordinary Send invalidated an otherwise valid source acknowledgement; legacy runtime2 Scene helpers used the root runtime3 reader; and deleting a descriptive checkpoint left stale portable-export metadata. Six focused regressions cover those fixes, repeated Send and cancellation. Eighteen affected files and types pass. The fix preserves actual save/readback for a tightly bounded owned append, carries the admitted containing runtime into dispatch, and prunes current local metadata without weakening external portable validation. No critical or minor findings were reported; every deferred-judgment item has a ledger ruling.

The real-host source fixture is saved and reloaded through SillyTavern's actual chat loader before enrollment. Both complete native lessons now pass the same ordinary catalog/edit/file paths used by the installed synthetic checks, with108ms/561ms preparation and unchanged raw history. The earlier first native continuation correctly refused an older unnormalized fixture reply whose swipe_id changed from absent to0 during rendering. A disposable-only diagnostic confirmed all user/document/graph/owner/reference checks remained valid and isolated that prefix change. The diagnostic was removed; no source guard was relaxed.

The one bounded real provider request used NanoGPT `z-ai/glm-5.2:thinking`, cap1024, with a persisted reservation before transport and no retry. It returned a complete stop reply in1288ms, using1131prompt/44completion tokens. Its initial full native continuation failed as described above. An additional real-host event trace exposed a separate post-reply dry-run inspection race. Two genuine regressions first failed, then passed after keeping inspection separate from actual generation ownership and returning before clearing owned guidance. All28native lifecycle cases and the affected53source cases pass.

The current uninstrumented release then completes ordinary Send on the actual normalized host using that captured provider reply:1410ms,28messages, all26original messages preserved, one review handle, zero auxiliary requests, and zero additional paid calls. This is a deterministic external-response replay, not another real-provider call on final source. The unchanged provider transport was exercised once; the local ownership correction is verified through regressions and actual native replay. The plan permits deterministic external transport where appropriate, and the ledger records this complementary-evidence ruling and its limits.

## Versioned distribution

The local archive `.tmp/releases/lattice-0.28.0-foundation.zip` contains505files/4813690bytes with SHA256 `f6ee4c3e5abbff6be033d92f58ef76f6f43d67dc09099267e47062687845e079`. Its canonical content digest is `851033db9cdbe2fc11a3db38f632220993bd45b383a6b8ce7b69ab05e23e4bee`. Runtime sources, compiled UI/assets, manifest/license/notices and preserved/included examples passed this original package’s installation smoke. A later packaging audit found missing linked manuals and a reference asset. The final release distribution adds those files, refreshed README media and approachable release notes while preserving the tested runtime bytes. Every ZIP entry has been independently extracted and rehashed; all95baseline hashes match. Developer tools/tests/dependencies, scratch evidence and credentials are excluded. Both34/35 now complete ordinary actual-host Native Send from this exact extraction using the captured real-provider reply, with zero additional paid requests, no missing assets/page errors, one review handle each and unchanged original history. Setup35takes259ms, including observed chat save8.41ms/readback3.79ms; preparation110ms/555ms and replay completions1077ms/1416ms. These replay timings exclude a new provider transport.

## Delivery and continuation

The foundation release is complete. Main was advanced normally through GitHub CLI with `force=false` to source commit [`a4f4eaf`](https://github.com/MentallyQuill/Lattice/commit/a4f4eaf32f3063d6a62f9f585e098acea09b3395). GitHub's published manifest is0.28.0. All504tracked package inputs match the published source tree, and all95legacy blobs match the reviewed main baseline. This evidence closeout changes documentation only; the tested product bytes and ZIP remain unchanged.

The larger memory program remains incomplete and independently recoverable at the checkpoint and local archive paths above. Future work must incorporate the foundation compatibility/currentness fixes and use actual native chat loading before enrollment, then resume deferred lifecycle, retrieval and capstones in bounded steps. No advanced capability or extra lesson was silently shipped to finish this release. No second paid provider call was made; the real-provider capture and final native replay evidence remain explicitly separate.

## Release documentation and media

The [0.28.0 release notes](../../releases/0.28.0.md) explain the release in the same story-first voice as the README. Its current UI screenshots and two walkthroughs were captured with fictional practice material and zero provider requests. [Capture evidence](../../release-media/2026-10-21/README.md) records the commands and hashes. The node reference now includes Chunk, and the documentation checker covers the new release guide. These are documentation and packaging changes; the product runtime, compiled UI and lesson files are unchanged from the tested source. The 505-file ZIP above remains historical runtime-smoke evidence rather than the final documentation-complete distribution.
