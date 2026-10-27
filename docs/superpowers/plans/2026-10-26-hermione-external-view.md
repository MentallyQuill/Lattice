# Hermione External View Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Persist Hermione's fictional inner state while keeping ordinary story prose external, without adding an ordinary model call.

**Architecture:** Extend the current Assessment schema and the existing source-bound document. Change Development to a constrained portrayal result, format that result into native guidance, and add a chat-specific perspective rule.

**Tech Stack:** Existing Lattice JSON workflow nodes, JavaScript ESM authoring scripts, real native-host synthetic integration fixture.

**Spec:** `docs/superpowers/specs/2026-10-26-hermione-external-view-design.md`

## Global Constraints

- Preserve existing shared checkout edits and current saved graph/profiles/retry allowances.
- Two ordinary model calls; no revision pass or paid validation.
- Human-author inspectability is retained; do not mark this generic narrator workflow actor-private.
- Raw internal state has no generation-guidance wire; explicit current OOC interior requests are the sole portrayal exception.
- Old scene-only document reads remain valid; invalidation initializes empty internal state.
- Back up before activation and retain every story-message byte.

## Review Focus

- Private-state canary values must reach Development and storage but not ordinary native guidance.
- Invalid Development rationale fields must hold before native generation and save.
- Existing scene-only data must initialize state without being discarded or misclassified as an invalid document.
- Covered source edits must clear both state and scene while append preserves them.
- Activation must preserve current profiles, retry limits, foundations, existing source bindings and unrelated settings.

### Task 1: Persistent state

**Files:** New private authoring and verification files under ignored `work/hermione-external-view/`.

- [x] Capture fresh saved graph and chat metadata; use that graph, not the earlier builder.
- [x] Write a native-host verification case expecting an authored internal state to persist beside scene context; observe failure on the old graph.
- [x] Add the bounded state schema, assessment instructions, backward-compatible read schema, expanded save selection and empty template; verify success.

### Task 2: Outward portrayal boundary

- [x] Write a native-host case where Development supplies an unsupported internal-rationale field; observe the old text output accepting it.
- [x] Enforce Development data schema, add zero-call portrayal formatter, and replace only the Development → guidance edge.
- [x] Add external narration instructions to workflow guidance and this chat's Author's Note; retain explicit current OOC exception.
- [x] Verify clean portrayal, rejected fields, append continuity, source-edit reset, round trips, two normal requests and unchanged native swipes.

### Task 3: Review and activate

- [x] Obtain one focused independent review of workflow/configuration and synthetic boundary tests; resolve material findings.
- [x] Verify against installed runtime as well as shared source where possible; avoid deploying unrelated engine changes.
- [x] Guard current graph and document identity, back up settings/chat, update only workflow and capsule template plus chat perspective note.
- [x] Verify saved graph/template and byte-identical story messages; inspect the live UI without generating a reply.
- [x] Record exact verification limits and activation result.

## Verification and activation record

- Activated the saved `hermione-independent-agency-v1` graph and capsule template in default-user; appended the external-viewpoint rule to this Story chat's existing Author's Note.
- Verified both repository and installed Lattice runtime with deterministic synthetic responses: persistence, actual installed guidance canary exclusion, unsupported rationale rejection, explicit-interior output shape, append continuity, covered-source-edit reset, legacy scene-only migration and export/import round trips.
- Normal execution still makes two planner requests. Both existing maximum-retry values remain 2, so the displayed worst-case auxiliary request allowance remains 6. No provider requests or story generations were made during validation.
- One independent review completed with no blockers. No engine files were deployed or changed by activation.
- Activation used current-file hash guards and full local settings/chat backups under ignored `work/hermione-external-view/`. Verified story-message bytes, foundations, saved scene packets, model profiles and retries remain unchanged.
- Reloaded SillyTavern and inspected the live enabled graph: the backstage assessment, structured outward portrayal, portrayal formatter and source-bound state document are present. The portrayal node shows data output, enabled schema and its preserved retry limit. Re-ran activation verification after UI inspection successfully.
- The tests establish schema, routing, storage and invalidation behavior. They do not establish that arbitrary model-generated prose can never disclose an internal rationale. Actual provider prose quality and semantic recognition of OOC requests remain to be evaluated during normal use. Backstage records remain visible to the human author in Lattice; they are excluded from ordinary generation guidance rather than protected by actor-isolated storage.
- Editable workflow: `work/hermione-external-view/hermione-external-view.lattice.json`. Verification log: `work/hermione-external-view/verification.log`. Activation checks: `work/hermione-external-view/activation-manifest.json`. UI capture: `work/hermione-external-view/activated-workflow.png`.
