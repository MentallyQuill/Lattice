# Quiet authoring and run-scoped diagnostics

User approved implementation, rendering-latency preservation, merge to main and push on 2026-10-15.

## User experience
A placed node is a working draft. Missing connections do not produce an Input Required badge, amber card/pin treatment, or input-warning group count. Keep genuine Setup Required configuration indicators, model metadata and profile controls. Required port information can remain ordinary Details metadata. An unattempted selected node shows the normal empty-output Preview, without a red static completeness banner. Only current attempted failures receive error emphasis; selecting an unrelated orphan does not inherit another branch's error.

After a requested execution fails, paint the causal node outline red and, only when structured failure metadata identifies an actual input, ring that input. Keep artifact color and geometry unchanged. Provide the error code/message in accessible tooltip/Details. Provider/configuration/ambiguous errors get a node outline only. Downstream blocked nodes remain distinct from failed nodes; unselected drafts stay quiet. Never infer a port from message text.

Current diagnostic paint belongs to the exact attempted document, semantic revision, run id, workflow id and instance path. Clear it for a new attempt, cancellation, semantic edits, document replacement and incompatible view ownership. Pan/zoom/drag/selection do not invalidate it. Run Details retain historical failure data.

## Execution ownership
Root workflows persist optional schema-3 metadata `runTargets: Array<{instancePath:string[];nodeId:string}>`. Entries identify existing terminal primitives by full path. Root execution selects these endpoints and their upstream artifact closure only. Stage ordering cannot expand that closure. New documents use an empty array. Creating/pasting/wiring nodes never enrolls a terminal implicitly. Provide positive enrollment/removal actions and a discoverable workflow-output management menu; missing targets has a clear actionable empty-state error. Run to Here explicitly selects its target and upstream closure independently of enrollment and preserves native execution restrictions.

Legacy missing metadata is materialized before graph edits/export: enroll only a uniquely identifiable Review / Publish downstream of one valid On Send -> Generate Reply native chain. Do not infer auxiliary Write File, Memory Commit or independent terminal islands. Ambiguous/no primary graphs require choosing workflow outputs and execute zero effects. Once metadata exists, including [], never infer again. Built-in starters/examples explicitly enroll their intended endpoints. Existing independent legacy effects need explicit enrollment; safety takes precedence over silently replaying historical drafts.

Preserve target metadata in validation/import/export/semantic identity. Prune deleted targets, remap nested addresses through extract/inline, and do not copy enrollment on paste. Invalid metadata fails safely rather than executing a broader graph. Enforce execution cardinality rules within selected closure; retain hard structural/admission validation for the full document.

## Interfaces
Domain adds `prepareWorkflowAttempt(root, options = {}) -> Result<{selection:ResolvedPlan;preflight:Result<ResolvedPlan>}>`. Outer failure means no trustworthy selection (invalid structure/target/no outputs). A selected incomplete closure returns an admitted selection plus a preflight error with known location. Strict `resolveWorkflow` delegates and returns preflight; no source/binding/model/file/state effects occur until it succeeds. Cached planner adds `policy(target?)`, returning selected callBound, requiredBindingAddresses and requiresNativeGeneration independently of completeness. Existing summarize remains strict.

WorkflowError retains existing address and adds optional `inputPortId:string`. Preserve explicit cause address/input through runtime failure, settlement, reducer, recordings and UI. Descriptor-safe parsing must validate exact cause against selected inventory, including known wrapper inputs; reject invalid/foreign/output-pin identities. Keep bounded mandatory causal identity when recording payload budgets omit optional text/artifacts. Never invoke accessors, leak host authority or guess identities.

UI exposes diagnostics separately from authored ports/layout. Full address key is JSON.stringify([workflowId,instancePath,nodeId]). Dynamic paint must not enter cardLayoutKey or trigger graph expansion, node/pin measurement, or DOM replacement. Scope filtering happens before publishing to canvas.

## Verification and performance
Use existing JS/.d.ts/Svelte architecture; no new dependency or broad subsystem rewrite. Meaningful regression tests start red: quiet idle nodes, exact preflight input with zero effects, connected malformed input, node-only error, nested same-id isolation, stale/cancel clearing, unselected wired terminal island, explicit target enrollment/persistence/remap, Run to Here policy. Existing authoring/security/privacy/budget/typed-wire behavior remains covered.

Matched production viewport benchmark baseline/final: 3840x2160, 10/250/500 nodes, pan/zoom/drag, 3 repeats. Preserve cached geometry and interaction handler latency. Investigate material regression (both >10% and >2ms) using repeated affected cases; do not optimize unrelated release-sync costs. Add a focused diagnostic-paint check showing no card/pin remeasurement or retained DOM replacement.
