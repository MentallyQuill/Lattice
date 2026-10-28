# Automatic file initialization delivery

Design: [selected behavior](../specs/2026-10-28-file-initialization-design.md). Plan: [implementation tasks](../plans/2026-10-28-file-initialization.md).

## Work log

- User confirmed generation from conversation and character for absent saved state.
- Isolated managed worktree: `file-initialization`, base `0370498eec26b133bbebfb976f4d69dbb3c67fdd`.
- Baseline: 74 file policy, host, UI panel/projection and integration tests passed before implementation.
- Contracts worker owns managed intent, file initialization generator, Read File descriptor, planner preparation and scoped contract tests.
- Runtime worker owns engine input preparation, lazy binding, host virtual contents and accepted persistence, plus integration tests.
- UI worker owns panel, readiness, settings preservation, file guides and browser/panel tests.
- Parent owns coordination, compatibility fixes, full verification and independent review.

## Rulings

- Generate mode permits one initialization request, with no automatic retries; the completion limit defaults to 2,048 tokens and is editable up to 65,536.
- Existing explicit paths/bindings are never replaced automatically, including revoked or unavailable destinations.
- Existing catalog state may replace stray unbound default settings only while preserving any authored private/hidden restriction.
- Initialization targets are managed resources owned by workflow/node/chat; generated contents remain run-local until acceptance.
- Verification uses mocked providers and temporary/in-memory files. The installed extension and live user chat remain unchanged.

## Final verification

Implemented and independently reviewed. All actionable review findings were fixed with regression coverage: qualified schema inference inside systems, document shapes for record mutations, exact actor context for private initialization, and preservation of inherited model selections while retaining Active fallback for unbound legacy readers.

| Check | Result |
| --- | --- |
| Full unit run | Fresh 0.30.0 release run passed 463/463 files. The new installation-smoke test file was added after inventory capture and passed its two tests separately. |
| Final initialization/compatibility unit run | 11/11 files passed, covering initialization, real host-provider reload, examples, legacy defaults, actor context and nested systems. |
| Final File/settings/workspace unit run | 22/22 files passed. |
| Final initialization/model-binding/freshness unit run | 6/6 files passed after the last binding fix. |
| Complete combined-system example suite | 14/14 tests passed against regenerated artifacts. |
| Final browser journeys | 22/22 passed across document files, file experience, node file settings and Workflow Data details for 0.30.0, using dedicated port 4189. |
| Type check | Zero errors and zero warnings. |
| Production build | Passed; rebuilt the UI and matching 87-file optional setup bundle. |
| Packaged imports | 957 versioned local imports verified. |
| Generated memory examples | Two lessons and ten files unchanged. |
| Standard installation smoke | Passed in a temporary installed copy without development dependencies; zero provider calls, page errors or missing assets. |
| Installation host-boundary regression | Two tests passed: expected optional-host missing resources are accepted; an injected required stylesheet 404 still fails. |
| Whitespace check | No errors. |

Ordinary programmatic/legacy Read File defaults retain their prior semantics. New editor-created managed readers initialize automatically. Authors can select **Require a file** for reference inputs; the combined-system example explicitly uses this for its effect library, holders and relationship rules.

The installed Lattice copy, live settings, chat messages and user files were not changed. Verification made no live model-provider requests. The implementation and rebuilt assets remain in the attached managed worktree for review and installation.

The optional `--foundation-lesson=34` and `--foundation-lesson=35` installation journeys were also attempted. Their synthetic host lacks the file-upload persistence mock needed by workflow autosave, so those optional journeys stop before their later assertions. The standard installation smoke and its required-asset negative regression pass; the broader optional fixture migration is outside this release change.
