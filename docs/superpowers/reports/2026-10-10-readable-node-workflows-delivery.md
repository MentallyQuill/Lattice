# Readable node workflows: integration delivery

**Status: implementation, reviews and verification complete; ready for Git delivery to `main`, October 11, 2026.** Final corrected code passed a fresh complete `npm run check`: 330/330 Node files, zero type errors or warnings, build/assets and 445/445 browser cases. Fresh clean-install smoke also passed. The final whole-branch R1 finding is addressed in `a660ef2`, with independent source Spec/Quality PASS and no introduced findings or parked behavior. Earlier failed commands remain recorded below. Root performs the Git integration next; this report does not claim merge or push has already happened.

## Reviewed implementation checkpoints

| Scope | Commits | Review outcome |
| --- | --- | --- |
| N1 contracts | `ab3acc6`, `b401041`, fix `5f2cfbe` | Spec and quality PASS. |
| N2 shared forms | `483cdf3`, fix `8fbfe98`; main reconciliation `ce6962a` | PASS after draft, picker and UTF-8 corrections. |
| N3 friendly rows | `236a271`, `e00418c`, fix `11c92bf` | PASS after candidate-retention and authoring-mode corrections. |
| N4 typed values and paths | `0cf26a8`, `a07933d`, fix `64fa3db`; reviewed integration boundary fixes `f5f1b41`, `acd3cc6` | PASS with actual Save, overrides, own-key JSON/pinned admission and invalid-path remount evidence. |
| N5 schema consumers | `8252c8c`, `c7a59d9`, fix `c6de4ab` | PASS with disabled-state, retained-draft and schema-authority evidence. |
| N6 Decision and time controls | `983c4d0`, `8f58168`, fix `11930e6` | PASS with actual question/schedule forms, Time Metadata and leaf-state authority evidence. |
| N7 import and remaining covered creation | `4aa5d69`, `665a92f`, fix `f25b98b` | PASS after invalid-parent Cancel correction. Actual import and final configured-route matrix delivered. |
| V1 retained projection | `464ca25`, fix `30d5888` | Spec and quality PASS. |
| V2 safe rendering | `e38602c`, fixes `00e1361`, `f1750d5` | PASS after escaped-NBSP and aggregate HTML-budget corrections; 21 focused cases. |
| V3 modes and copy | `8217304`, `16749ad` | PASS; focused 4/4 files and browser 8/8. |
| V4 typed reports | `8e47207` | PASS; browser 10/10 plus focused checks. |
| P1 detection | `3dae9e4`, `f7ae4c3`, `c69d0ac` | PASS after scope/empty-permission corrections. |
| P2 exact Draft deletion | `2c61044` | Spec and quality PASS. |
| P3 Filter Text | `72b1940`, fix `1d2b830` | PASS after empty-kept-unit fail-closed correction. |
| P4 runtime and component | `26a45bb`, `3e69c18` | PASS; 9 focused cases include exact runtime invocation evidence. |
| P5 examples and docs | `8e98e7e`; guide/icon follow-up `2b76724` | PASS. First full I gate found real Filter Text guide/icon gaps; the original owner corrected both, with fresh spec/quality PASS and 10 guide + 4 icon cases. |

## I checkpoints and verification history

Owned checkpoints: browser foundation `c7f8e16`; six public documentation/report files `2caff80`; actual prefilled Read File creation `48149dd`; meaningful configured Compose creation expectation `51e3933`; retained diagnostic preview DTO `5a18fb9`; final fixture/distribution checkpoint `90b2b5f` (17 explicit owned paths: 12 fixture files, report and four distribution files). Factual pre-R1 evidence addendum: `08f8d07`. These earlier bounded checkpoints did not claim final post-R1 verification. Their original Pattern/Compose creation REDs are GREEN in both later complete browser runs. The table records the pre-R1 history; fresh final verification follows it.

| Actual command | Result and limit |
| --- | --- |
| `node tools/build-remastered-examples.mjs` | Exit 0, 30 lessons. |
| `node tools/build-unified-examples.mjs` | Exit 0, 32 recipes. |
| `node tools/build-combined-system-example.mjs`, then the same command with `--check` | Both exit 0; portable/editable Main, three body tabs and five resource seeds verified. Generated outputs have no substantive diff; existing LF-only changes remain unstaged. No manual definition-hash changes. |
| `node tools/check-documentation.mjs` | Exit 0: 13 documents, 292 local links, 75 operations, 39 screenshots, 5 animations. |
| Required active-identifier scan | Historical research/spec/plan/audit references and explicit negative no-alias assertions remain. One obsolete active test comment was corrected; no executable `pattern-scan` alias was introduced. |
| Recorded 37-file stream-focused runner subset | Initial 36/37 files passed. Only stale search catalog expectations failed; final 28 covered configured routes restored all original phase/pin/no-identity assertions. Named `ui-native-search-catalog.test.mjs` rerun: 25/25 cases passed. |
| `node tools/test-all.mjs ui-control-import-integration workflow-slop-policies` | Exit 0, 2/2 files. |
| `npm run build` | Exit 0, 314 modules. Built UI, CSS and two self-contained worker assets. This preceded the separately reviewed guide/icon follow-up; later complete gates rebuilt the distribution. |
| Combined five-spec Playwright gate, `LATTICE_TEST_PORT=4187`, `CI=1` | Exit 0, 64/64 cases: node entry 36, preview 5, I acceptance 9, Read File creation 2, workspace 12. All required creation acceptance GREEN. |
| First `npm run check`, same env | Exit 1 at full Node phase: 323/330 files passed. Downstream types/build/assets/all-browser phases did not execute. Original log retained unchanged. |
| Stable full-check retry, same env | Exit 1 at Node: 329/330 files passed; all original seven failures GREEN. The qualified-edit preparation-work budget failed (7 clones). Downstream phases did not execute; separate retry log retained. |
| Third full check on frozen `acd3cc6`, same env | Node 330/330 PASS; types 0 errors/0 warnings; build 314 modules PASS; assets 695 versioned imports PASS. Browser 426/441 PASS, 15 stale fixture failures, so command exit 1. This failed full command is not relabeled successful. |
| Six reconciled browser specs, same env | Exit 0, 53/53 cases in 1.5 minutes. All 15 observed REDs GREEN. |
| Complete `npm run test:browser`, same env, frozen `90b2b5f` | Exit 0, **441/441 passed in 13.3 minutes**, one worker. At this pre-R1 checkpoint, source/distribution matched its successful Node/types/build/assets/install phases. |
| Pre-R1 `npm run smoke:install` on third-run distribution (root executed once) | Exit 0. Actual temporary installation without node_modules or developer UI source: 181 requests, no errors/missing files, apiRequests 0/providerCalls 0; fresh, mounted, sharedGraph, publicHelpers and launchers true. |

Browser acceptance uses actual native authoring transactions, runtime operations, generation/interceptor and host publication adapters. Plain Elara creates and edits one stable rule, finds four occurrences in two paragraphs, removes each paragraph once with exact CRLF retention and reviews the joined Draft. CSV and JSON controls produce equivalent rules and counts 12/0/2 (14 total), one completed Branch/Filter recording and the joined Draft. Runtime onStage tests provide complementary exact invocation counts; provider attempts are not an execution counter. Pattern/Filter make zero model requests.

No-hit bypass, protected/empty-body holds, stale-source Apply prevention, display/copy/pin/occurrence expansion without new effects and one-step Undo pass. Manual Scene Context retains three separate ordered messages and its artifact-wide diagnostic envelope. Automatic reply artifacts preserve the private-host boundary; final joined Draft Source is inspected separately without reconstructing omitted context. Source remains the retained privacy-projected payload under the existing 4 MiB recording, 256 KiB artifact and 64 KiB preview-text limits.

## First full-check failure inventory and reconciliation

| Failed file | Cause/evidence | Current disposition |
| --- | --- | --- |
| `introspection-native-ui.test.mjs` | Stale raw diagnostic-code and Readable-envelope assertions. Current local admission stops invalid drafts before extra edit callbacks; safe diagnostic copy remains private. Actual prepare still rejects INVALID_SETTINGS. Envelope assertions belong to actual Source; Readable keeps inner payload. | Root-approved fixture correction; named 8/8 cases GREEN. |
| `ui-file-input.test.mjs` | Injected fake descriptors/defaults no longer override canonical Prompt Source projection. Actual system/prompt-entry keys and raw Form/help apply. | Root-approved canonical fixture correction, preserving hidden File Snapshot coverage; named runner GREEN with wire file. |
| `ui-native-wire-bridge.test.mjs` | Test adapter sent configured catalog marker directly to strict connection prepare, bypassing validated Configure node Apply. | Root-approved actual configured-session adapter; preserves opaque capture, phase/port/placement, async/cancel and one Undo. Named 2/2 files GREEN with file-input. No unchecked marker deletion or relaxed producer. |
| `ui-node-guide-content.test.mjs` | Operation count changed, plus real missing Filter Text guide/control explanations. | Original P5 owner fixed and committed `2b76724`; fresh reviews PASS. |
| `ui-node-palette-icons.test.mjs` | Operation count changed, plus real fallback Filter Text purpose icon. | Same reviewed P5 follow-up; 10 guide + 4 icon cases GREEN. |
| `workflow-runtime.test.mjs` | Stale JSON-patch mock response conflicts with the reviewed contextual cleanup contract, which consumes complete prose. | Root-approved one-response correction to `We explore.`; all candidate/call-count/immutable-source assertions preserved. Named 4/4 cases GREEN. |
| `workflow-state-transactions.test.mjs` | Real N4 regression: qualified-instance admission clones the root graph as definition data and rejects legitimate root recording before definition lookup. | Original N4 owner committed `f5f1b41`: three sites clone qualified root through existing prepareGraphArtifacts admission/detachment. Original fixture/recording preserved. Owner reports focused 13/13, guards 2/2 and types 0 errors/0 warnings; fresh strong spec/quality review PASS; original state fixture passes in later full runs. |

The second full run exposed qualified-root preparation repeating work: workflow-preparation-work-counts.test.mjs counted seven structured clones instead of reusing the admitted base. Original N4 owner corrected cache reuse in `acd3cc6`; the unchanged bound now observes five clones (at most six), create eight/connect six. Focused 21/21, guards 2/2, types 0/0 and fresh strong spec/quality review PASS; the measured-work file also passes in the third full run. No broad compatibility, identity/hash bypass or source/privacy relaxation was introduced.

The third full command reached every phase but failed 15 browser cases. Bounded six-file fixture corrections use actual UI: context-menu (3 cases) and workspace (1) now inspect Readable prose, preserving run/pin and downstream divider/camera/selection/card assertions; input-sources (2) combines meaningful Readable text with exact retained Source JSON text `First line\nCafé 🙂\n`; introspection (3), reference-tools (5) and shelf-canonical (1) submit actual prefilled Configure node forms before reading committed IDs. Requested enabled stages are selected, locked Repair Response is asserted, immediate Reflect/Memory/Reroute paths remain. The old direct phase/touchGraph/refresh workaround is removed. Existing Details, canonical controls/pins, typed wires, roundtrips, Undo/Redo, asynchronous authority and zero-provider assertions remain. These six specs pass all 53 cases. The pre-R1 complete browser rerun passed 441/441 in 13.3 minutes and certified that checkpoint with its then-unchanged distribution. Subsequent whole-branch review found the ordinary next-edit grammar issue below; the corrected UI was rebuilt and freshly verified through every full-command phase and clean-install smoke. Every earlier failed full command remains described as failed.

## Final R1 correction and fresh verification

Strong whole-branch review identified one Important issue: restoring a local Plain Pattern/Extract draft remounted it as a structured JSON editor, while its next edit still retained Plain grammar. Actual subsequent native Save could therefore accept the complete JSON source as a literal under the old ID instead of saving explicit ID `new-rule` and pattern/phrase `Mara`; malformed JSON could likewise become literal text. Untouched Save had retained the grammar, so this required ordinary navigation followed by an actual next edit and Save.

Fix `a660ef23669a899d0a442b130be49a5cf5132e4d` owns three shared Svelte components and two existing test files. NodeDetails and ConfigureNode now retain terms/rows as navigation metadata alongside the existing draft contract, independent of pristine canonical values. Structured edits explicitly choose JSON grammar; valid term-to-row conversion compiles the chosen grammar, and lossless row-to-term export preserves identity/metadata or retains canonical JSON. Invalid drafts remain exact and cannot silently change interpretation. Confirmed imports use canonical rows/JSON; Cancel and current-draft Add authority remain intact. No parser, runtime, graph admission or transaction authority changed.

Meaningful pre-production RED: mounted-parent/native-transaction integration returned 8 passed/8 failed, including expected explicit ID/Mara versus actual old ID/JSON-source literal. Final integration passed 18/18, covering both Pattern and Extract restored Plain with commas/brackets, next canonical JSON Save/explicit ID, invalid JSON blocking/retention, return-to-terms and Configure Plain/CSV/form remount with phase and one Undo. Eight original import/Add/Cancel/revision/pending/controller cases remain. Scoped Node passed 15/15 files, types 0/0, build 314 modules, fresh R1 browser 4/4 and covering browser 58/58. The mixed old/new build attempt described by the fixer is excluded from gate evidence.

Independent final scoped source re-review (`final-scoped-rereview-report.md`): **R1 ADDRESSED; Spec PASS; Quality PASS; no introduced findings or parked behavior.** The earlier I authored and closing reviews passed. The whole-branch finding is resolved by this inspected correction; implementation/source reviews are complete.

Fresh final gates on frozen `a660ef2`, with `LATTICE_TEST_PORT=4187` and `CI=1`:

| Actual command | Final result |
| --- | --- |
| `npm run check` | **Exit 0**. Node **330/330 files**, Svelte/types **0 errors/0 warnings**, build **314 modules**, assets **695 versioned local imports**, full browser **445/445 cases in 13.2 minutes**, one worker. All four added grammar regressions and every existing acceptance case pass. |
| `npm run smoke:install` (root executed once against the fresh rebuilt UI) | **Exit 0**. Isolated temporary installation `lattice-install-AvX8H9`, no node_modules or developer UI source; **181 requests**, empty errors/missing lists, **API/provider calls 0**; fresh/mounted/sharedGraph/publicHelpers/launchers true. |

Source, fixtures and report stayed frozen during the full gate. The successful build produced the final corrected distribution; install smoke inspected that same unmodified distribution. Example emitters and canonical definition inputs were unchanged by R1, so the already verified regeneration was not repeated. Final I packaging stages only the mechanically changed `dist/lattice-ui.js` and this factual report; existing LF-only example changes and fixer-owned source/tests remain unstaged by I. Git delivery target is `main`; main/origin were last checked equal at `68e6734`, with original-main release-media preserved.

## Deliberately deferred features

Natural-language Draft settings assistance, autonomous keyword watchers, arbitrary spreadsheet import for every schema, model repair improvements, generic execution wires and unrelated runtime refactoring remain deferred. Runtime/provider JSON parsing stays strict. CSV applies only to declared authoring controls. Existing source/revision authority, scope/protection/privacy checks, recording/display budgets and explicit review/publication remain binding.

## Recorded rulings

The following unique lines are retained from all four execution ledgers in chronological first-occurrence order, including rationale and cost if wrong.

Ruling: Parallelize independent tasks under exclusive file ownership — developer requires useful parallel delegation; shared mutations remain sequential — cost if wrong: conflict resolution/rework.

Ruling: Run focused checks per task and full npm run check once on integrated code — independent workers change the shared tree concurrently; delivery plan requires stabilized full check — cost if wrong: delayed discovery of cross-stream regression.

Ruling: Implement against committed main baseline and reconcile concurrent main work at integration — copying unrelated dirty work would compromise ownership — cost if wrong: adaptation work when main is reconciled.

Ruling: Permit prototype-like own keys only in declared canonical JSON value payload slots during graph/definition admission, keeping metadata and secret/privacy restrictions — typed-value spec requires faithful own-key round trips beyond local editor callbacks — cost if wrong: unintended metadata admission or extra validator/classifier rework; focused negative and pinned-definition tests plus final review required.

Ruling: Open actual configured creation for covered structured/typed friendly controls even when defaults validate — spec requires friendly entry during both creation and editing; current valid-default path skips the form — cost if wrong: extra add-node clicks and browser fixture updates.

## Retained command evidence and ownership

Actual logs remain in `.superpowers/sdd/2026-10-10-readable-node-workflows/`: `i-remastered.log`, `i-unified.log`, `i-combined.log`, `i-combined-check.log`, `i-documentation.log`, `i-active-identifiers.log`, `i-active-identifiers-final.log`, `i-focused.log`, `i-search-catalog-rerun.log`, `i-import-policy-focused.log`, `i-build.log`, `i-browser-focused.log`, `i-full-check.log`, `i-full-check-rerun.log`, `i-full-check-final.log`, `i-browser-reconciliation.log`, `i-browser-final.log`, `root-install-smoke-final.log`, `i-introspection-ui-rerun.log` (intermediate failed attempt), `i-introspection-ui-rerun-final.log`, `i-file-wire-rerun.log`, `i-workflow-runtime-rerun.log`, `i-post-r1-full-check.log`, and `i-post-r1-install-smoke.log`. This tracked report preserves their material outcomes before eventual ignored-record cleanup.

I owns observed fixture adaptations, current public docs/report and final distribution assets. Original P5 owns its separately reviewed four-file guide/icon fix; the final grammar fixer owns `a660ef2` source/tests. Other stream edits, generated LF-only files and original-main release-media remain preserved. I authored/closing reviews passed; strong whole-branch R1 is addressed with independent source Spec/Quality PASS. Fresh complete verification and install smoke are recorded above. Implementation, reviews and verification are complete; Git delivery to `main` is the next coordinator action. No merge/push is claimed here.
