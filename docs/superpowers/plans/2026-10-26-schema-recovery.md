# Schema recovery implementation plan

> **For agentic workers:** Use test-driven development for each behavior, then independent review. Track progress in `work/schema-mismatch-investigation/progress.md`.

**Goal:** Recover once from schema-invalid model JSON, explain exact field failures, and retain failure metadata without enabling completion-text logging.

**Architecture:** Extend existing bounded retry, validator, diagnostic history and Details presentation. The current assessment workflow opts into one retry; other workflows keep their existing request limits. Full completion text remains opt-in. Persist failed/unresolved/invalid runs in metadata mode; omit successful runs and response contents.

**Tech stack:** JavaScript ESM, existing declarations, Node tests, Svelte, IndexedDB.

**Approved specification:** User's “Apply your fixes and improvements” accepts the recommendation in `work/schema-mismatch-investigation/findings.md` and the preceding chat response. Provider-native structured output is a follow-up, outside this change.

## Global constraints

- Preserve strict JSON/schema validation, verified completion, cancellation, scope/privacy checks and the existing maximum of one JSON/schema correction.
- Retry feedback is bounded data under fixed trusted instructions. Never place model content or findings in a system instruction; never use persisted diagnostic history as model input.
- No automatic retry-budget change for existing graphs. An unset/zero assessment opts into `maxRetries: 1`; preserve any existing nonzero user budget. The saved graph was found to have `maxRetries: 2` on both model nodes before deployment, so its declared maximum remains six requests.
- Metadata logging stores no completion text or prompt content. Full-response logging remains explicitly opt-in; clearing history and toggling text logging revoke pending captures.
- Preserve unrelated changes already present on `codex/automated-scene-context`. Work in place because they are prerequisites of the currently installed workflow and are already under development; no resets, staging, commits or publication.
- Update the running local installation only after validation, with backups and before-hash checks. Do not change accepted chat messages.

## Review focus

1. Malicious/oversized/getter-bearing findings must not become privileged instructions or escape bounds.
2. Correction and transport retries share the physical request budget; a second invalid completion remains terminal.
3. Logging off must never persist raw response text, including failed, private, cancelled or late attempts.
4. Clear/toggle/scope races must revoke pending captures without deleting another chat's history.
5. Error Details must display escaped field paths and expected/actual counts without leaking completion values.

## Task 1: Validation-guided correction

**Owner files:** `src/workflow/operations/model-retry.js`, `model-nodes.js`, `json-decode.js`, relevant declarations and retry/JSON tests.

- [x] Add a failing test where a schema-invalid completion is followed by a valid completion only when the request carries specific field feedback as user-level data.
- [x] Implement bounded feedback under a fixed correction system message; omit rejected completion text. Keep original task/evidence/schema unchanged.
- [x] Incrementally test Unicode limits, required/type/count failures, untrusted findings, cancellation, retry caps and terminal second failure.
- [x] Enrich validator finding messages with expected/actual types or bounds; never include response values.
- [x] Run related test files and report red/green evidence.

## Task 2: Failure metadata with response logging off

**Owner files:** `src/run.js`, `src/workflow/diagnostic-history.js`, its declaration, related host/history/settings tests.

- [x] Add a failing integration/history test for a failed run retained without response text when full logging is off.
- [x] Add explicit capture options to `begin(origin, options)` (default existing full behavior for compatibility). Host uses full capture only when preference is on, otherwise metadata-only failures.
- [x] In metadata mode, ignore response bodies before reading/copying them, retain bounded errors/findings/attempt counts and omit successful/cancelled/stale runs. Retain failed/invalid/unresolved runs only.
- [x] Preserve cancellation/discard/clear and exact user/chat scoping; test privacy, successful runs, toggles and pending writes incrementally.
- [x] Run related history/host tests and report red/green evidence.

## Task 3: Details, active assessment and installation

**Owner files:** Root coordinates UI diagnostic presentation/components/tests, docs, local workflow artifacts and deployment tooling.

- [x] Expose the first bounded schema finding in Details and explain that failure metadata is retained while response logging is off.
- [x] Fix assessment instructions: empty arrays except `responseOptions`, which needs one plausible move; emphasize per-field character caps. Enable one retry if unset/zero in local workflow artifacts and the active saved recovery graph; preserve existing nonzero budgets.
- [x] Verify actual modified workflow validity and increased request bound; preserve profile bindings and all other settings/chat content.
- [x] Run full unit suite, type check, production build, relevant browser tests and installed smoke check as appropriate.
- [x] Independently review the combined diff; address findings and re-run affected checks.
- [x] Back up and update only changed installed runtime/assets and approved assessment settings, checking original hashes immediately before writes; verify byte hashes and graph validity afterward.

## Execution notes

The primary agent implements Task 3 while independent workers own Tasks 1 and 2. Only non-overlapping files are edited concurrently. A shared ledger records verification and any rulings. No GitHub operation is needed; if one becomes necessary, use `gh` with network permission as instructed.
