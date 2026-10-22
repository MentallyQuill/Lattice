# Lattice 0.28.0 validation fixes

Date: 2026-10-21 (America/Denver). Branch: `codex/lattice-028-validation-fixes`, based on `7057a5fe59e58c96029446bfa7a70f614ed72a97`.

The observed fix list is addressed. Validation used the production executors, the built UI, and a disposable SillyTavern fixture with Lattice installed through its Git extension manager. The unpublished extraction module was overlaid into that installed fixture. These results describe the local candidate branch; they do not mean the published extension has been updated.

## Changes and decisions

| Finding | Change and evidence | Decision and remaining limit |
| --- | --- | --- |
| Three browser assertions expected 30 lessons after the two memory lessons were added. | Expect 32 visible lessons. Both new lessons are Composition; the existing Foundations and Capstone expectations remain valid. Focused tests went from three failures to 10/10 passing. | Correct the stale expectations using the authored catalog, retaining category, independent-copy, lazy-loading and zero-call checks. |
| GLM returned an extraction quote whose exclusive end offset extended into punctuation. | State zero-based UTF-16 inclusive-start/exclusive-end indexing explicitly, require substring equality, and supply a hand-checked astral-character example. Add a prompt regression and retain the captured invalid response as an atomic rejection regression. | Improve the request contract. Keep exact evidence validation and proposed status; do not repair offsets or publish records automatically. A valid live sample is evidence of the changed path, not a guarantee that every future model answer will be valid. |
| Revision isolation failed while native chat startup was still changing state. | Boundary snapshots first exposed welcome-chat loading, then delayed `timedWorldInfo` initialization. An idle control reproduced the latter without any model request or Lattice executor. The harness now waits for native readiness, creates and reloads its own chat, and waits for that metadata initialization before taking its baseline. | Repair the test preconditions. Retain exact full chat and metadata equality checks; a future product write would still fail them. No revision executor change was justified by the idle control. |
| Deep Windows Git checkout failed on research artifact filenames. | Rename nine evidence files to `results.json`, update their references and generator, and add a repository path-length regression. All nine SHA-256 hashes are unchanged. Commit `889f4c1` cloned successfully into the original deep path with `core.longpaths=false`. | Fix tracked path lengths without changing global Git settings. The successful checkout used local Git transport of the candidate commit; the candidate has not been published. |
| Review: the native checker could attach to an unrelated service already listening on its port. | Refuse an occupied loopback port before launching; wait for the owned child's listening marker, reject child exit, and close its browser context when the child exits. A real occupied-port regression verifies no connection to the listener. | Accept and fix the important ownership issue. |
| Review: a provider endpoint denylist omitted vector and other proxy routes. | Replace it with an explicit local API/static-resource allowlist. Only the separately reserved exact generation payload can use the generation endpoint. Unit tests cover vector, provider, proxy and unknown API refusal; both final native replays pass. | Accept and fix the important request-boundary issue. Unknown routes fail closed. |
| Review: the replay reader did not accept the checker's own ledger wrapper. | Accept both legacy attempt arrays and `{ attempts: [...] }`; reject missing, unsuccessful, truncated or unbounded responses before starting the server. Replay both final cases from the checker's own ledgers. | Reclassify the review's minor label as an important functional issue and fix it: saved outputs must be reproducible. No review finding was deferred. |

The native checker permits one explicitly enabled NanoGPT `z-ai/glm-5.2:thinking` request per live run, records its reservation before transport, and makes no automatic retry. Replay makes no provider requests. Review fixes were verified with failing-then-passing regressions and native replay rather than another review round.

## Fresh verification

| Check | Result |
| --- | --- |
| Full Node suite | 376/376 test files pass; also repeated with four independent file processes. |
| Full browser suite | 498/498 pass (9.6 minutes). |
| Model executor regressions | 31/31 pass, including valid Unicode offsets and refusal of captured invalid evidence. |
| Provider and native boundary regressions | 23/23 pass. |
| Windows path regression | Pass; deep Git clone succeeds with long-path support explicitly disabled. |
| Types, production build and asset imports | Pass; zero type errors/warnings and 810 imports checked. |
| Documentation and generated memory examples | Pass; local links and both generated lessons are consistent. |
| Hardened extraction replay | Pass; one replayed response, zero provider calls, chat and metadata unchanged. |
| Hardened revision replay | Pass; one replayed response, zero provider calls, chat and metadata unchanged, protected literals and original revision source retained. |

## Real NanoGPT calls during this fix round

All four calls used GLM-5.2 thinking through the actual SillyTavern adapter. Failed attempts remain in the evidence; each run had its own one-attempt reservation.

| Case | Completion cap | Result |
| --- | --- | --- |
| Extraction probe | 1,024 | Refused `TRUNCATED_OUTPUT`; reasoning exhausted the cap. |
| Extraction at the normal default | 2,048 | Pass: `brass key` has exact offsets 15 through exclusive end 24, remains proposed, and native chat/metadata are unchanged. |
| Revision at the normal default | 2,048 | Refused `TRUNCATED_OUTPUT`; reasoning exhausted the cap. |
| Revision with an explicit larger cap | 4,096 | Pass: `Mira approached the blue harbor lantern.`, protected literals and original-parent authority retained, and native chat/metadata unchanged. |

The production default remains 2,048. Thinking-model reasoning consumption varies, so operators may need a larger configured budget. Truncated output continues to fail safely. These bounded samples do not establish a general model success rate.

## Evidence and cleanup

Detailed logs, snapshots, attempt ledgers, the idle control, red/green regressions, full-suite results and rename hashes are retained locally in `.tmp/validation-fixes/` and copied to the validation artifact's `fix-evidence/` directory. They use synthetic story/chat data. The temporary NanoGPT credential copy is removed after the last test server stops; the original credential and ordinary user data are untouched.

The dirty primary checkout and the other development checkout were preserved. The fix branch is retained for integration.
