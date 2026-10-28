# Workflow failure policy design

Approved in chat on 2026-10-27. Build in an isolated worktree.

## Intent
Offer a global setting under **Lattice → Workflow → When a node fails**, using a checked submenu with exactly three choices:
- **Fall back to SillyTavern** (`native-fallback`, default): end workflow processing and allow ordinary native generation.
- **Stop all generation** (`stop`): stop the workflow and generation associated with the current Send, including group speakers and automatic continuation.
- **Continue where possible** (`continue-available`): retain completed node outputs, continue independent branches, and allow authored optional boundaries to omit failed contributions or use their configured fallback.

Help text: End the workflow and allow normal SillyTavern generation. / Stop the workflow and all generation for this Send. / Keep successful results and continue branches whose required inputs are available.

## Contracts
The preference is top-level extension settings, outside workflow files, captured once per run. Missing preferences retain fallback behavior; malformed explicit preferences are rejected. Changing the checked submenu choice affects the next run.
Recovery begins only after node-local retries finish. Failed nodes remain visibly failed. Outputs from failed nodes carry no artifact; optional Compose and Join inputs reuse existing skipped-source rules. Required failed inputs block their consumers. Unrelated work continues. Ordinary unresolved conditions do not become false/empty/skipped.
The preparation stage barrier distinguishes settled failed optional branches from required data dependencies. Native generation still needs valid activation, authorized guidance and valid budgets. Recover only complete validated node artifacts; iterations and multi-request nodes remain atomic.
Structural, cancellation, source freshness, scope/privacy and capability failures remain fatal. Recovery must not bypass existing mandatory aborts or freshness checks. Failed branches cannot publish writes. Surviving terminal proposals keep existing acceptance/settlement checks.
Report recovered runs explicitly as partial completion, retaining node errors and blocked/skipped statuses; do not silently report full success. Preserve original failure diagnostics across reentrant GENERATION_STOPPED events.
After native completion, retain the completed reply and never issue another fallback request. Stop further requests for unrecoverable failures under stop/recovery policies.

## Approaches
A boolean handles only the first two behaviors and is superseded by the approved third option. A global enum plus dependency-aware runtime recovery is selected. Per-node recovery flags and automatic concatenation of arbitrary model output are excluded.

## Implementation decisions
If recovery cannot produce the required native/selected output, stop this Send rather than silently discarding the partial workflow. Keep existing fallback as the default. These decisions preserve required-input meaning and make the fallback choice explicit.
'All generation' means work belonging to this Send/run, not unrelated background calls or another chat. A late old run must never stop a replacement generation.
'Partial' run completion is distinct from partial persistence: persistence semantics remain unchanged.
'Continue where possible' may proceed with unconnected guidance, or completed guidance produced by explicit optional Compose/Join boundaries. A connected failed guidance producer blocks Generate Reply even though its guidance pin is normally optional.
'Continue' is not permission to salvage internal requests from a failed node.

## Verification
Use synthetic transports and host fixtures; no provider requests or user-data mutations. Test five independent contributions with two failures, required dependency blocking, retries, nested addresses, ordinary unresolved states, cancellation/freshness, strict group/continuation stop semantics, post failure, saved-setting admission, Workflow submenu selection, notices and complete product checks.
