# Automatic story and scene context

Approved in the chat on 2026-10-26: automate persistent story foundations and a changing scene record while retaining the existing two auxiliary model calls. Post-generation review/revision stays removed.

## Intent

Keep the scene's purpose distinct from its immediate topic, retain important scenario facts and user corrections beyond the recent-message window, and stop answered or deferred topics from repeatedly taking over the story. Scene purpose is guidance rather than a required outcome or compulsory introspection.

## Design

- A user-maintained `story-foundations` JSON document contains established facts, character knowledge limits, lasting corrections, relationship context, and authorship boundaries. No model writer targets it.
- A `scene-capsule` JSON document contains a compact retrospective scene record: purpose, activity, active topic, open/answered/deferred threads, background pressures, and uncertainty. Assessment reconciles it with foundations and accepted conversation. Proposed future action remains in separate planning fields.
- Existing Assessment and Development remain the only two auxiliary model calls. Read File, Collect, Select Fields, Format, and Write to File supply and stage context without model requests. Development receives the updated capsule and chooses a natural next contribution.
- A new opt-in Review / Publish boolean `autoApplyEffects`, default false, accepts staged consequences against an unchanged selected native reply without creating a duplicate swipe. Existing `autoApply` behavior and manual defaults remain compatible. Failed, cancelled, preview, stale and ambiguous runs cannot automatically save.
- An opt-in Read File boolean `bindToChat`, default false, associates derived documents with a host-authored fingerprint of their accepted source prefix. Appending conversation preserves validity; changing/removing/swiping covered source messages invalidates it. A stale record presents its initial template for rebuilding, retaining the actual live file reference and revision for conflict-safe replacement. User/chat scope remains enforced.
- Source metadata is computed by the host, never copied from model output. It excludes the reply currently being generated, so the next run catches up with that reply. Persistent source metadata contains hashes and bounded identity, not another transcript.
- Continuous scene updates must preserve file settlement acknowledgements and bounded receipt/history storage. Reuse existing history mechanisms rather than silently discarding uncertain writes.

## Approaches considered

Manual acceptance uses existing lifecycle behavior but adds an operation after every turn. The approved automatic approach adds effect-only settlement and source binding; it costs some additional input/output tokens but no additional model calls. Restoring revision passes or upgrading the entire workflow runtime is outside scope.

## Verification and activation

Use real host/file-store integration tests with deterministic model responses. Verify two-call routing, unchanged reply/swipe identity, correct document persistence and retry, context invalidation, and rejection of stale or unaccepted sources. Verify the full project suite, types, production build and packaged install. Back up the installed extension, settings and target chat before activating. Preserve native story text and existing local connection profiles; do not make paid model requests for validation.

Implementation choices: work on a new feature branch in the existing clean checkout; use bounded synthetic fixtures for repository tests, and keep private story-specific artifacts in ignored `work/`.
