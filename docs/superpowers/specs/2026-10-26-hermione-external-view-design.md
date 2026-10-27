# Hermione internal state and external narration

The user approved extending the current live workflow after discussing persistent fictional emotions and competing pressures, an outward portrayal brief, and narration limited to the player's observable viewpoint. Explicit current out-of-character requests may authorize a bounded interior passage.

## Behavior

Assessment maintains `hermioneState` beside the existing retrospective `sceneCapsule`. It contains short fictional appraisals: emotions, competing wants, relevant pressures, unspoken matters and uncertainties. These are authored NPC state, not observations of another real mind, model chain-of-thought, future events or a prescribed romantic outcome. State changes proportionately with accepted interaction and circumstances; it may remain unexpressed.

Development consumes the assessment and foundations, then returns structured portrayal direction. Its schema admits only narration mode, outward contribution, dialogue direction, observable behavior and pacing. A zero-call formatter exposes only that portrayal object to native generation. Raw assessment/state is never wired into generation guidance. Unsupported extra rationale fields hold preparation rather than passing through as text.

The native guidance and this chat's Author's Note establish external narration by default: no NPC thought reports, motive explanations, emotional labels as omniscient truth, or gestures decoded by an authoritative narrator. The character may disclose something through speech or choices. No emotion owes the player a visible tell. Only a current explicit OOC request can authorize a limited interior passage; earlier omniscient replies or older OOC requests do not keep that permission active.

The existing source-bound document saves both scene and internal state. Keep its existing target, live reference, automatic acceptance, neutral invalidation template, history and persistence safeguards. Backward-compatible reads permit an older scene-only record; every new write contains both fields. User-maintained foundations have no model writer. Backstage data remains inspectable by the human author in Lattice, and is not an actor-isolated engine security boundary.

## Scope and constraints

Use the current saved graph as the source, preserving local profiles, current retry/token settings and unrelated changes. Two ordinary planning calls remain; existing retry allowances remain intact (currently two retries per planner, maximum six requests on repeated failure). No engine changes, global preset edits, new dependencies or paid validation calls. Preserve all story message and swipe bytes; back up settings and chat before activating metadata/workflow changes.

The simpler approach of giving the writer full internal state plus an external-style instruction is less selective. The chosen approach limits its new input to portrayal direction and reinforces perspective at the chat boundary. Full actor-private isolation would require a different narrator/actor architecture and is outside scope.
