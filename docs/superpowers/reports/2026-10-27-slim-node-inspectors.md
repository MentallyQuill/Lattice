# Slim node inspectors

Branch: `codex/slim-node-inspectors`. Base: `437622c`.

The acceptance criteria are a slim details sidebar with clear controls, easy
navigation, and complete supported behavior. The implementation uses the
existing Lattice theme tokens and node metadata. Canvas nodes, symbols, icons,
and theme definitions are unchanged.

## Delivered

- Schema fields, list definitions, and typed JSON children expand inline.
  Long editors have bounded keyboard-accessible scrolling. Deep values retain
  usable controls at 220 and 258 pixels without accumulating indentation.
- Schema editing uses a type choice, contextual constraints, field presence,
  and an advanced exact-JSON editor. Rules irrelevant to the current type,
  unknown literal keys, source formatting, false/null/zero, and invalid drafts
  remain preserved.
- Dense settings use purpose groups. Repeated records, questions, and schedules
  have compact summaries. Groups retain their open state for each qualified
  selection through accepted edits. Read-only bodies permit inspection while
  mutation fields remain disabled.
- Save and Discard appear for drafts. Saves retain the existing acknowledgment,
  stale-response, rejected-edit, and newer-draft protections. Advanced model
  overrides, inheritance distinctions, diagnostics, and canonical guides remain
  available.
- Model Call output/schema changes use one qualified transaction and preserve
  wires or reject the candidate. Inactive saved schemas and unfinished drafts
  survive Plain text/JSON data changes. Deliberately cleared schemas stay empty.
- Workflow stage shows the real supported options and provenance. No automatic
  reset authoring action was introduced. Literal Extract hides unused model
  settings while retaining active schema validation.
- Additional attempts accepts integers 0–5 and reports the true maximum of six
  calls. Rejected slider edits return to the saved count. Retry eligibility and
  cancellation/authorization handling retain their existing contracts.

## Coverage

Schema consumers: JSON Decode, Extract, Model Call, Format, Read File, Write File,
and Project Document. Structured editors also cover Pattern, Compose, Text Rules,
Select Fields, State, Join, Collect, Decision, Advance Time, and Context Join.
Typed-value and dense-setting coverage includes Chunk, Condition, Time Trigger,
Collection, Recall, Style Transfer, Enrich, and Revise Draft.

The production browser inventory exercises 25 operation families and widths
220/258/380/520. Tests use fictional fixtures and make no live provider requests.
Runtime retry tests exercise the physical six-call bound with deterministic
failures; live-provider behavior is outside this UI verification.

## Independent review

A fresh read-only reviewer inspected the whole branch and subsequent fixes.
The review found no remaining code blockers after four reproduced issues were
fixed: read-only nested navigation, deep value overflow, rejected retry counts,
and duplicate accessibility IDs after record reorder. Each has regression
coverage. The reviewer independently ran 56 component/runtime tests and the
asset check, and inspected the 50-test production browser pass.

The large-payload regression also verifies that typed row input performs no
whole-list JSON parsing or serialization.

## Final verification

- Complete production browser suite: **518/518 passed** (9.8 minutes), including
  all 25 affected operation families, narrow/deep editors, theme changes,
  readonly bodies, rejection, Undo, draft retention, and workspace behavior.
- Final affected Node suites: **22/22 files passed**, including creation forms,
  schemas, typed values, structured/question/schedule editors, large payloads,
  qualified drafts, atomic edits, and runtime retry bounds.
- The full Node run covered **399 files**. It completed 398/399 before the
  group-key performance fix; the sole failure was subsequently corrected and
  passed in the final 22-file run. The original baseline was 396/396.
- Svelte/TypeScript: **0 errors, 0 warnings**.
- Production build passed; committed UI/CSS regenerated. Asset verification
  passed with **827 versioned local imports**.
- Memory example freshness passed: **2 lessons, 10 files, no changes**.
- Production screenshots inspected in Lattice and Ash and at narrow widths.

Implementation is committed in the managed worktree and ready for review.
Integration into another branch and deployment remain separate actions.
