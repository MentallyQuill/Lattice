# Targeted node capability delivery — 14 October 2026

Scope: the approved A1–A7, E1–E3 and N1 improvements from the [node audit](2026-10-14-node-capability-audit.md). Implementation uses existing version-1 nodes, descriptors, controls and Workflow Data. No new node family, dependency or automatic checkpoint was added.

## Delivered behavior

| Gap | Result |
| --- | --- |
| A1 Prompted Memory | An exact checked no-match result skips the optional branch. Missing authorization, unavailable memories, stale sources and model failures still hold. |
| A2 Memory Recall | Optional wired Text query overrides the query control, including an intentional empty query, within the selected actor’s memory scope. |
| A3 Extract | Literal mode supports case sensitivity and substring/word matching. Defaults remain case-sensitive substring; quotes and UTF-16 positions use the original source. |
| A4 Collection | Authored comparison Value supports bounded typed JSON. Wired Match retains precedence. |
| A5 Read File | Parsed Data value is available for JSON, JSON Lines and CSV. Existing document, text and live reference outputs retain their roles; text/Markdown skip value. |
| A6 Smart Compactor | The compression prompt reports measured reserved context/framing and the remaining summary allowance. Request count, completion limit and final overflow checks remain bounded. |
| A7 Format Transfer | Successful alignment also retains every declared required literal. Style Transfer keeps its separate review wording. |
| E1–E3 | Lesson 15 preserves chronology; new Repair nodes start in Inspect while saved modes retain their meaning; Current Holder documentation describes transfers/use accurately. |
| N1 History | Explicit Preview/Apply/Cancel in Workflow Data archives accepted history, preserves current values/pacing and exact replay identities, and provides authorized metadata inspection and read-only save verification. |

Lessons 18, 22, 25 and 30 explain the revised memory/file behavior. Affected remastered and combined examples were regenerated from their authoritative builders. UI controls reuse the existing flat charcoal surfaces, toggles, segmented choices and typed-value editor; desktop and narrow checkpoint screenshots were inspected against the supplied Gaea 2 references.

## Implementation decisions and costs

1. New file-intent fingerprints describe semantic operation, destination, checked authored mutation and evidence, independently of the changing document projection, capture revision or counts. CAS fences remain separate. Earlier fingerprints retain conflict protection; a legacy replay can require reconciliation instead of acknowledgement.
2. Native history is bounded to 4,096 pages and 30 MB per user, with existing per-page JSON limits. Large stories eventually receive an explicit capacity diagnostic rather than unbounded storage.
3. Existing Details controls and Workflow Data provide the UI. This limits visual customization while keeping the product’s established controls and behavior.
4. Canonical saved-outcome validation runs in the async native backend; pure identity helpers and State execution remain synchronous. Validation failure holds the operation rather than returning partial matches.
5. Checkpoint saving and verification cover the target’s complete linked archive, including earlier pages. Larger histories take longer to verify, but metadata replacement during saving cannot erase old replay protection and still acknowledge success.
6. Combined portable/editable examples were regenerated because revised defaults/ports change pinned helper identities. Generated diffs are larger than the authored lesson edits, and reproducibility checks cover them.

## Review and verification

Independent review covered the complete implementation. Three important findings were reproduced and corrected: long valid clock occurrence IDs, canonical validation of malformed archived outcomes, and missing progression markers in damaged canonical metadata. Each regression failed before its fix. Earlier safety review also covered stale captures, archived actor privacy, immutable metadata and post-save aliasing.

Complete repository verification passed **341/341 Node test files** and **474/474 browser tests**. Type checking reported zero errors and warnings; production build and asset verification passed (705 versioned imports). The final actor-session correction also passed 116 focused tests, all 16 affected native test files, and all 12 feature UI checks.

Regressions cover authored append retries after later entries, native file access while checkpoint saving is pending, and a nonselected present actor’s private State/accepted save after checkpointing. That last lookup reuses the already-authorized Read File session and rechecks target permission; no new authoring input or privilege is introduced. UI checks include keyboard Apply, cancel, unverified save reconciliation and narrow layout.

Implementation commit `3d1d9dc` was fast-forwarded to main and pushed to `MentallyQuill/Lattice` origin/main. GitHub CLI verified that remote main matched the implementation commit. The accompanying completion record closes both approved plans.
