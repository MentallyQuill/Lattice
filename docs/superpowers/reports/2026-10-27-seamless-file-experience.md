# Seamless file experience delivery report

Design: [approved specification](../specs/2026-10-27-seamless-file-experience-design.md). Execution: [implementation plan](../plans/2026-10-27-seamless-file-experience.md).

Status: implemented, reviewed and verified in the managed worktree on `codex/seamless-file-experience`.

## Delivered behavior

- First use checks optional server support and offers saving inside SillyTavern or choosing wider locations. Inside saving works without browser file APIs or experimental flags. The included setup bundle guides optional installation and verification; the server folder chooser works without a remote desktop dialog.
- File nodes use friendly names, automatic suffixes and valid defaults. Every saver offers Replace and Append. Configuration and preview do not create output bytes; accepted writes produce actual files. Explicit input import creates a checked copy outside workflow JSON.
- Shared workflow identities, initial and subsequent autosaves, independent Save As, retained conflicting drafts, and execution/review revision boundaries replace global file setup. Runtime reconciles each chat's saved selection before execution, including with the editor closed. A conflicting recovery draft is retained and requires a visible choice before execution.
- Legacy data, existing grants, external paths, actor restrictions and replay history remain protected. Registered examples prepare isolated sample state through authenticated provenance rather than imported graph text.
- Automatic history maintenance retains replay authority separately from twenty prior content versions. Confirmed recovery preserves current privacy and replay protection. Branching selects an exact verified publication point and never silently substitutes later state.
- Current guides, examples, menus and compatibility fixtures describe the new controls. The retired global Workflow Data / Legacy chat data configuration remains absent.

## Verification

| Gate | Result |
| --- | --- |
| `npm test` | Passed, 460/460 test files. |
| `npm run test:browser -- --workers=3` | Passed, 539/539 tests against the final rebuilt UI in 4.3 minutes. |
| `npm run check:types` | Passed, zero errors and zero warnings. |
| `npm run build` | Passed; rebuilt UI and the 87-file optional server setup bundle. |
| `npm run check:assets` | Passed, 943 versioned local imports and one native domain module graph. |
| `npm run check:examples-memory` | Passed; two lessons and ten files unchanged. |
| Combined workflow portable roundtrip | Passed after regenerating both combined examples. |

Per-task checks include actual mock-host file persistence, interrupted-save recovery, concurrent backends, actor privacy, exact branch rebasing, 100 story turns and 1,000 accepted saves, installer failure/rollback fixtures, shared workflow conflicts, and browser journeys with native browser file APIs absent. These checks use temporary or in-memory fixtures, without live stories or paid model calls.

Every component passed its scoped specification and quality reviews. The final whole-branch review found startup/closed-editor selection reconciliation, stale chat activation, and the final autosave busy notification issues. The final fix wave and its closed-workspace prompt refinement passed the scoped re-review with no material residuals. New regressions cover rapid chat switching, delayed reads, acknowledged recovery, retained conflicting drafts, and an editor that was previously opened and then closed.

The complete unit run preceded the last chooser fix. That browser-discovered regression allowed a parent status refresh to reset an open chooser to its root folder. The fix preserves navigation for the same adapter and still rejects obsolete responses after an actual adapter change. All five component tests and 23 related setup/access/browse tests passed afterward, along with file-action tests, zero-error type checks and the rebuild. The original browser case passed five repeated runs, and its full two-case file passed. The additional scoped review found no material residuals.

The server's 50-page, approximately 2.6 MB recovery read/adopt/reread fixture improved from 124.9 seconds to 6.28 seconds after bounded transfer sessions removed repeated full-history reads. Four/eight-page archive opens scale linearly: reads 12/24, adoption 32/64. Scoped review independently checked token ownership, scope, binding generation, expiry, quotas, completion release and mutation invalidation.

## Platform limits

- The upstream host file API provides verified writes, not atomic conflict exclusion between independent clients. Status and storage details state this; recovery information remains available when reconciliation is needed.
- The optional component serializes checked writes through the same service process. An unrelated OS process can still race portable filesystem operations; no external-process or cross-device atomicity is claimed.
- Optional installation requires access to the SillyTavern host and a restart. A remote host owner may need to run setup. The browser does not install an absent server component through a nonexistent API.
- Verification ran on Windows. The POSIX permission fixture is skipped there; macOS/Linux launchers and Windows ACL preservation have not been independently exercised on those platforms.
- Exact branch recovery requires a verified publication stamp and a retained matching content version. If unavailable, Lattice reports that condition and preserves both branches instead of guessing. Archive traversal remains bounded at 4,096 pages; real capacity failures remain actionable.
- Denied cleanup can retain generated physical recovery files until deletion becomes available. Replay archives are not pruned with content backups. Workflow backup downloads contain authoring configuration, not the complete contents and history of every input/output file.

## Engineering rulings and their costs

1. Use truthful verified-write acknowledgements for the host provider because upstream has no atomic expected-revision API. Residual cost: independent simultaneous writers can require reconciliation.
2. Encode a truly empty upload with padding-only base64 and verify zero bytes. Cost if a host changes its decoder: report a failed verification rather than substitute content.
3. Retain twenty prior content versions separately from replay archives. Cost: older content may be unavailable for recovery or branching, while replay metadata still consumes storage.
4. Treat launcher mechanics and valid structured append as implementation decisions within the five approved product choices. Cost: platform behavior requires separate verification; no unsupported native-dialog claim is made.
5. Permit automatic allocation only through a trusted managed-intent control. Cost: an unavailable explicit destination requires reconnection instead of being silently redirected.
6. Require a non-null verified publication stamp for a branch point, without falling back to business-source metadata. Cost: unstamped legacy states cannot be automatically branched until separately verified.
7. Derive previous sample-clock ownership from authenticated normalization context, never editable node IDs. Cost: missing trusted context preserves an older reference rather than guessing a replacement.

No user files, live server configuration, dependencies or paid provider calls were changed during implementation verification.
