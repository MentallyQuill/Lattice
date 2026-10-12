# Reference tools and reusable workflows

[Documentation](README.md) · [Operator’s manual](operators-manual.md) · [Example workflows](examples.md)

Use a reference to adjust style, formatting, or terminology, or use cleanup tools to inspect repeated wording. Read the proposed changes before applying them: matching a phrase does not establish that it is unsuitable for your scene.

## Transpose

Transpose works on Text or a completed reply Draft. Text input returns Text; Draft input proposes exact patches for validation and review.

| Operation | Reference | Output | Extra model requests |
| --- | --- | --- | --- |
| **Style Transfer** | Prose or structured reference; optional Context | Text or Patches | At most 1 Prose request |
| **Format Transfer** | Example text or structured template; optional Context | Text or Patches | At most 1 Prose request |
| **Terminology Map** | Structured glossary | Text or Patches | 0 |

Choose **Input type → Text** for Text → Text, or **Input type → Draft** in Response for Draft → Patches. New shelf nodes default to Text. Older saved nodes without this setting retain Draft behavior. Text transformations can run in either stage and inside subgraphs; reply-specific tools still need the matching reply context.

For Style Transfer, choose narration, character voice, rhythm, or register in Details. Narration is the default edit scope. To target dialogue, set **Mode → Character voice** and **Scope → Dialogue** separately. Changing Mode retains Scope. Strength, instructions, and protected wording are independent settings.

Format Transfer works with facts already in the source. A Data template can include `requiredContent`, an array of exact strings that must be present; missing content stops before a model request. References guide expression and structure rather than supplying new story facts.

Terminology Map accepts Data such as:

```json
{"entries":[{"from":"Captain","to":"Commander"}]}
```

Choose word/phrase matching and case sensitivity. Replacements happen together: A → B does not then become C through a B → C entry. Compose → JSON Decode can supply the glossary; Compose Text can supply a prose reference. Disconnect or replace an incompatible connection before changing a reference input from Text to Data.

Draft patches are intermediate results. A current unified workflow must carry its final Draft to **Review / Publish** for publication.

## One cleanup operation, three modes

Repair offers these modes alongside repair/scan. Select the categories and text scope independently of the mode.

| Mode | Behavior | Extra model requests |
| --- | --- | --- |
| **Inspect** | Report literal matches while preserving the original. | 0 |
| **Contextual Cleanup** | Ask for revision of formulaic uses while retaining meaningful events and voice. | At most 1 Prose request |
| **Strict Avoidance** | Ask for alternatives within permitted text and report remaining or uneditable matches. | At most 1 Prose request |

The policy contains 14 categories, 273 source occurrences, 271 unique entries, 17 templates, and 2 behavioral policies. Repeated entries retain their category membership. An empty category selection uses all categories. Choose narration, dialogue, or whole scope separately. The `authorized` option uses the Draft’s existing editing permissions. Legacy repair/scan also retain those permissions; the extra scope, categories, case matching, and Context controls belong to the three cleanup modes.

Literal matching respects Unicode word boundaries: `adequate` does not match inside `inadequate`. Straight/curly quotes keep source offsets accurate. Inspect identifies literal occurrences; templates and behavioral policies still need interpretation. It does not claim a semantic diagnosis without a model.

A cleanup request receives the selected policies and optional Context. Preserving facts, actions, chronology, refusals, voice, and player agency remains an instruction to the model and a review task for you. Local checks enforce source identity, editing spans, and protected wording; they do not certify meaning.

Strict Avoidance distinguishes uneditable original wording from matches remaining in the candidate. Lattice does not retry to force a change. Empty editing permissions make no request. Failed, incomplete, ambiguous, or cancelled output supplies no valid patch proposal.

## Reusable packages

These saved subgraphs demonstrate common context and cleanup jobs.

| Subgraph | Inputs → output | Default request limit |
| --- | --- | --- |
| **Context Lens** | Context → Context | 0; compression adds 1 Analysis request. |
| **Scene Compass** | Context → Guidance | 1 Analysis request; compression adds 1. |
| **Literal Cleanup** | Draft → Draft (`filtered-draft`) | 0; one branch choice per reply. |
| **Formatting Cleanup** | Draft → Candidate | 0. |
| **Prose Cleanup** | Draft and optional Context → Candidate | 1 Prose request; Inspect or empty permissions uses 0. |

Find them in [examples/library/subgraphs](../examples/library/subgraphs/). Save a wrapper with **Add to Subgraphs**, then place saved entries from the shelf. Entries retain exact saved definitions and dependencies. The shelf shows the latest version you explicitly saved; placed copies do not update silently. Configure model connections before running model-backed packages.

These five definitions retain older stage-specific contracts. Their standalone library root wrappers are retired. Reuse compatible processing in a current unified workflow and retain Review / Publish as the final publication step. Their Candidate outputs are diagnostic; they do not grant Apply authority.

**Literal Cleanup** detects `the words hung in the air`, `the tension was palpable`, and `something unreadable` in narration. Pattern → Branch chooses once per reply. Filter Text removes matching paragraphs; Join bypasses no-hit replies unchanged. Its Draft output can reach Review / Publish, with no extra model requests.

A paragraph crossing dialogue, editing spans, protected text, or exemptions blocks as a whole. Pattern leaves Draft permissions unchanged; it does not prepare editable spans for Repair. Filter Text checks each whole deletion independently.

**Formatting Cleanup** defaults to CRLF → LF with whole scope. Existing permissions and protected text still narrow the edit. **Prose Cleanup** defaults to contextual/narration. Inspect both before accepting.

Draft Text Rules needs existing permissions or an explicit scope setup. It translates the edit back to the original source. Whole scope cannot expand permissions already present, including an empty span list.

## Categories and maintenance

The category editor takes source category IDs, one per line. The [canonical policy](../data/ai-slop-policy.json) lists labels and entries. Its wording is data; the browser policy module is generated from it and checked against the source.

The [Introspection guide](introspection-package.md#native-workflow-examples) covers character reflection, experience internalization, and state tracks in current unified workflows. Static subgraphs can use the enclosing workflow’s authorized Memory operations. **For Each** helpers need explicit State snapshots and cannot run Memory operations.

Click a node’s **?** button for an illustrated explanation of its controls and connections.
