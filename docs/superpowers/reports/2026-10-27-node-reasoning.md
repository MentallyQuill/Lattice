# Per-node reasoning delivery

Implemented native-envelope reasoning controls on every potentially model-calling
operation and Generate Reply. None is implicit by default. Provider/model rules
decorate the effective inspector after static field caching. Custom text is
bounded, retained across model/mode changes, and translated by the selected
adapter without silently accepting unsupported values.

Auxiliary overrides apply after preset conversion. Retries and nested helpers
retain the originating node's controls. The native final settings hook preserves
ownership, cancellation, JSON/YAML additions, and unrelated host settings.
Default controls preserve pinned definition identities and checked-in examples.

## Verification

- Full Node run exercised 410 files: 405 passed initially. Five integration
  failures were fixed (conditional Custom visibility expectations, field cache
  identity, cleanup execution envelope, missing guide explanations, and default
  fields changing generated examples). All five passed in a final 10/10 file
  rerun that also included every new reasoning test file.
- Final provider contract: 22/22 tests passed; UI regression: 12/12;
  native reasoning: 13/13; auxiliary/runtime reasoning: 8/8.
- 23 focused browser tests passed. The final reasoning browser flow was rerun
  against the final distribution build and passed.
- Type checking: zero errors and warnings. Production build, asset check,
  generated memory examples check, and `git diff --check` passed.
- Independent review found no remaining actionable findings after fixes.
- No live provider requests, host setting changes, deployment, or commits.

The tests cover effective provider refresh, Custom persistence, unrelated schema
draft preservation, readonly/instance bindings, implicit None identity, document
round trips, native exclusions/YAML, missing hooks, helper calls, and retries.

See [provider behavior and limits](../../reasoning-controls.md). Production uses
known model-family rules; optional capability metadata is supported by the shared
contract, without adding live catalog discovery or new credentials.
