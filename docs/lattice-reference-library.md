# Reference tools and reusable workflows

Transpose applies an example or convention to Text or a completed reply Draft. New nodes accept and return Text in either phase. Draft edits produce source-bound Patches for validation and candidate diagnostics. Publishing an owned final Draft requires Review / Publish in a unified root. Opening a workflow makes it the active document without a model request or changing **Enable Lattice**.

## Transpose

| Operation | Inputs | Output | Calls |
| --- | --- | --- | --- |
| Style Transfer | Text or Draft, reference Text or Data; optional Context | Text or Patches | At most 1 Prose |
| Format Transfer | Text or Draft, example Text or Data template; optional Context | Text or Patches | At most 1 Prose |
| Terminology Map | Text or Draft, Data glossary | Text or Patches | 0 |

The Transpose family opens directly to these three nodes. Choose **Input type → Text** for Text → Text, or **Input type → Draft** in the Response stage for Draft → Patches. New shelf/search nodes default to Text; existing saved nodes without Input type retain Draft behavior. Text transformations can run in Preparation or Response stages and inside reusable subgraphs. Host reply sources and application nodes retain their own context restrictions.

Style modes are narration, character voice, rhythm and register, selected in Details. Narration is the default editing scope. To target dialogue, choose **Mode → Character voice** and **Scope → Dialogue** separately. Changing Mode keeps the current Scope. Mode, Scope, Strength, instructions and protected wording are independent controls.

Format Transfer uses material already present. Data templates can include `requiredContent`, an array of exact strings that must occur in the input text. Missing content fails before a request. References supply expression and structure, not additional story facts.

Terminology Map consumes Data such as `{"entries":[{"from":"Captain","to":"Commander"}]}`. Choose word/phrase matching and case sensitivity. Replacements are simultaneous: A-to-B does not cascade into B-to-C. Compose -> JSON Decode can supply Data; Compose Text can supply a prose reference. An occupied Text reference pin cannot silently become Data: explicitly disconnect or replace the incompatible wire.

## One cleanup operation, three modes

Repair retains repair/scan and adds:

Legacy repair/scan use the incoming Draft's existing permissions. Scope, policy categories, case matching and the optional Context pin appear for the three cleanup modes below.

| Mode | Behavior | Calls |
| --- | --- | --- |
| Inspect | Report source-offset literal matches; preserve the original | 0 |
| Contextual Cleanup | Revise formulaic uses while preserving meaningful events and deliberate voice | At most 1 Prose |
| Strict Avoidance | Request alternatives within permitted text and report remaining/uneditable literal matches | At most 1 Prose |

All use the complete policy: 14 categories, 273 source occurrences, 271 unique entries, 17 templates and 2 behavioral policies. Duplicate entries retain their category memberships. Empty categories selects all; categories and narration/dialogue/whole scope are independent of mode. `authorized` uses existing permissions without constructing raw snapshot permissions.

Literal inspection respects Unicode word boundaries, so `adequate` does not match inside `inadequate`. Straight/curly apostrophes and quotes retain original UTF-16 offsets. An occurrence is a match, not a semantic defect. Inspect reports that templates and behaviors need semantic assessment; it does not claim to diagnose them without a model.

The prose writer receives selected typed policies and optional Context. Preserving facts, actions, chronology, refusals, voice and user agency is a model instruction and review responsibility. Local checks enforce source identity, permission windows and protected wording; they do not certify meaning. Strict reports distinguish original uneditable wording from remaining candidate matches. No retry forces an edit. Empty permissions makes no request; failed, incomplete, ambiguous or cancelled output produces no authoritative proposal.

## Reusable packages

| Subgraph | Interface | Default bound |
| --- | --- | --- |
| Context Lens | Context -> Context | 0; compression adds 1 Analysis |
| Scene Compass | Context -> Guidance | 1 Analysis; compression adds 1 |
| Literal Cleanup | Draft -> Draft (`filtered-draft`) | 0; one branch decision per reply |
| Formatting Cleanup | Draft -> Candidate | 0 |
| Prose Cleanup | Draft and optional Context -> Candidate | 1 Prose; Inspect/empty permissions means 0 |

Packages in [examples/library/subgraphs](../examples/library/subgraphs/) illustrate reusable typed interfaces. Save a wrapper through **Add to Subgraphs** and insert saved definitions from the Subgraphs shelf. Definitions have verified identities and pinned dependencies; the shelf shows the latest explicitly saved entry for each reusable item. Model bindings remain unresolved until configured. Reusable bodies contain neither root sources nor Apply authority.

The five canonical definitions remain available for reuse and inspection. Their pinned bodies retain pre/post stage contracts; standalone library root wrappers have been retired. Choose a current unified recipe, place compatible processing in its intended stage, and retain Review / Publish as the root publication authority.

Literal Cleanup detects canonical rules for `the words hung in the air`, `the tension was palpable`, and `something unreadable`, in narration. Pattern → Branch selects once; Filter Text removes matching paragraphs with explicit narration scope and Join bypasses no-hit replies. Its output is `filtered-draft` (Draft), with zero model requests; send it to Review / Publish. A unit crossing dialogue, permissions, protections or exemptions blocks atomically. Formatting Cleanup defaults to CRLF -> LF with explicit whole scope; supplied permissions and protected wording still narrow it. Prose Cleanup defaults to contextual/narration. Inspect changes before accepting them.

Pattern passes the Draft and its permissions unchanged while reporting occurrences. It does not prepare editable spans for Repair. Filter Text independently enforces whole-unit deletion permission and retained scan protections/exemptions. Draft Text Rules requires existing permissions or explicit scope construction and reconstructs original parent patches. Whole scope cannot expand permissions already present, including an empty span list.

## Categories and maintenance

The category editor accepts source category IDs, one per line. See [the canonical policy](../data/ai-slop-policy.json) for labels and entries. Source wording is data. The browser policy module is generated from the JSON and checked for equality by tests.

The **Introspection** family is available alongside these tools. Its [package guide](introspection-package.md#native-workflow-examples) covers character reflection, experience internalization and deterministic tracks in current unified workflows. Memory access stays in the root graph; reusable State bodies need an explicit snapshot input.
