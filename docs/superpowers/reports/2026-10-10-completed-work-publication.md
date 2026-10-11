# Completed work publication — 2026-10-10

The publication gathers completed changes from the primary Main checkout after auditing all recent branches and registered worktrees. The user explicitly chose to publish completed work first; implementation on `codex/readable-node-workflows` remains outside this integration.

## Source accounting

All 21 original local branch tips are ancestors of the starting Main commit `e46c4ba7b85d890fdb821adf1c644901ea216a9d`. Eleven linked checkouts were clean. The dirty `workflow-files` checkout matches its previously preserved manifest exactly: 175 existing files and one deletion. Its useful changes were already reconciled in the [previous integration](2026-10-10-combined-main-integration.md); replaying that older implementation would undo subsequent work.

The completed readable-workflow planning documents were committed separately as `664187dabc69d71ba8b0359ef7ff5b597c01450c` during this audit. This publication retains that commit and integrates the remaining static-subgraph and nested Recall work, preview targeting, bracket zoom shortcuts, node-guide and example-layout improvements, beta documentation, screenshots, animations, and rebuilt distribution.

Existing branches, checkouts, and historical measurement artifacts are preserved. A before-integration all-ref bundle, binary patch, and exact-byte snapshots of 180 initially pending paths remain in `.tmp/integration-final-2026-10-10/` in the primary checkout. The detailed inventory is `.tmp/integration-2026-10-10-inventory.md`.

## Review corrections

- Nested native Review / Publish handles now retain their complete instance address through the session, projection, menu navigation, and Apply/Reject controls. Current run, document, candidate, enabled inventory, and matching-view checks remain effective. Tests reject manual-preview authority, stale or forged handles, unrelated child views, and library inspection.
- Recall status and selection projection reuse the admitted workspace inventory. The focused 300-node regression changed six projections from 7,584 structured clones to zero. A real browser regression changed six whole-graph clones to zero while preserving selection and Details.

Independent workflow review found no material runtime issue. Independent UI review reproduced both integration gaps and approved the corrections after focused tests. Real browser regressions cover nested native publication, rejection, and menu navigation with zero auxiliary model requests.

## Validation

- Full unit suite: 310/310 test files pass.
- Full browser suite: 389/389 cases pass.
- Svelte/TypeScript: zero errors and warnings.
- Production build and asset check: pass; 627 versioned local imports.
- Installed-package smoke: pass without development files; zero API/model requests and no page errors or missing resources.
- Documentation: 13 documents, 283 local links, 74 operations, 39 screenshots, and five animations pass validation.

The tested candidate tree before this receipt is `0910f5251f74ebd277f8ad696f1c586688b8eb0d`. Verification logs and production-source hashes remain in `.tmp/integration-final-2026-10-10/`. The receipt adds documentation only; source and distribution are checked against the tested tree before publication.
