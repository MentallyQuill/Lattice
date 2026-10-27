# Slim, understandable node inspectors

The approved goal is to implement the new details-bar design across all nodes
affected by bloated shared editors. The explicit UX focus is a **slim UI that
is easy to use, understand, and navigate**. Reduce redundant controls, visual
noise, and unnecessary nesting without hiding meaningful state or inventing
capabilities. The approved Model Call Svelte design is the visual/interaction
reference. This document records the user's existing approval for implementation.

## Scope and behavior

- Preserve the default Lattice theme, node designs, icons, connections, and
  execution semantics. Work in the isolated `node-inspector-ui` worktree.
- Apply shared improvements to every consumer of schema, structured-record,
  typed-value, and scalar detail controls, rather than special-casing one node.
- Schema fields and list definitions expand downward inline. Use a bounded,
  keyboard-accessible scroll area and retain exact keys and unfinished drafts.
- One schema type selector; no separate Enable schema or Edit Structure layer.
  Optional schema absence remains available through Any JSON. Preserve existing
  schema metadata, supported constraints, explicit falsy values, and raw source.
- Field type and required/optional state share a compact row. Expose relevant
  constraints through Add constraint; retain advanced rules and raw JSON access.
- Use clear action labels, compact boolean controls, and purpose-based groups.
  Keep specialized controls, inherited state, blockers, and errors accessible.
- Model controls use Instructions, Output, and Limits & retries where applicable.
  Show None–5 additional attempts with the true total-call bound. Update the
  existing retry contracts consistently; preserve eligible-failure policy.
- Keep stage authoring in the details bar where supported. Display effective
  stage accurately and retain graph validation, fixed-stage restrictions, and
  explicit choices. Do not add an unsupported Automatic/reset authoring action.
- Output/schema changes that must be coupled use one qualified transaction.
  Preserve wires and expose rejections. Preserve production selection/revision,
  acknowledgment, pending, read-only, alias capability, undo, and draft cache.
- Use actual diagnostics and canonical help. Routine explanatory text may be
  disclosed; provenance, safety-relevant limits, and errors remain visible.

## Acceptance criteria

1. A user can identify a control's purpose and current value without deciphering
   multiple enable checkboxes, generic buttons, or repeated instructions.
2. Common settings are visible; advanced and repeated detail is disclosed in
   place without forcing Back navigation or concealing unavailable capabilities.
3. All affected operation/control families are inventoried and exercised, with
   the full supported setting set reachable after the layout changes.
4. Invalid and newer drafts survive collapse, selection changes, pending/rejected
   edits, and raw/field mode changes according to the production cache contract.
5. The production harness is checked at 220/258/380/520px, with keyboard controls,
   readonly inspection, errors, and existing themes. No horizontal clipping.
6. Relevant unit/component/browser regressions and the repository's required
   checks pass; generated distribution assets are rebuilt for the feature branch.

## Approach

Use the existing shared detail-control projection and production controller as
the integration boundary. Port the approved schema editor into SchemaControl,
reuse the existing transaction/draft machinery, and improve common controls and
record rows. Keep specialized node editors rather than replacing them with a
universal form. A wholesale prototype replacement would lose controller state;
node-by-node copies would drift. Shared components give consistent behavior.
