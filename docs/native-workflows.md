# LATTICE model connections and host integration

For editor operation, graph tabs, subgraphs, node controls, and recorded previews, use the [operator's manual](operators-manual.md). The [node reference](node-reference.md) lists all operations and their contracts. This guide covers model connections, reply review and actor memory settlement. For one graph spanning preparation, native generation and response processing, start with the [unified workflow guide](unified-workflows.md).

Install from the repository's default branch using the steps below.

## Start with a unified example

Open a unified example, choose each ordinary model node’s connection in its grey profile bar and configure For Each helper roles in Details. Automatic Workflow Data presets need no setup; authorize custom targets through **Workflow → Configure → Workflow Data…**. Select **Enable Lattice** while that document is open. Start its native generation with ordinary SillyTavern **Send**. It resumes from the completed native Draft and exposes **Review / Publish · Host result** in Preview. Apply preserves the original and adds the chosen new swipe before settling its staged effects. Manual Run to here inspects supported nodes without accepting writes. The [unified guide](unified-workflows.md#apply-an-example-to-story-2) walks through Story-2 on default-user.

A fresh workspace starts with **Unified story workflow**. Opening a graph makes it the active document without changing **Enable Lattice**. Each auxiliary model has an independent connection; Generate Reply uses SillyTavern’s ordinary main connection. Decision uses the same ordinary connection controls as other model nodes.

## Configure model connections

Install from `https://github.com/MentallyQuill/Lattice` using SillyTavern's Extensions menu, then reload. Update existing installations through Manage Extensions and reload after updating.

Choose an ordinary model node's connection in its grey profile bar. **Active SillyTavern model** follows the host's current connection; a saved profile fixes that node's route and sampler preset. The profile's model is the default. Use **Details → Advanced model settings → Model mode → Override** only when the operation needs a different identifier. For Each helper roles have separate bindings in Details.

Requests use the operation's own instructions and supplied context. LATTICE does not activate a profile globally or copy the native main prompt into every auxiliary request. Credentials remain in SillyTavern's secret store. Run to here can spend tokens when its dependencies contain model operations; a later Send executes its own preparation rather than reusing a diagnostic result.

## Model-backed examples

The picker contains [30 independent unified lessons](examples.md). **Plan, write, polish, and annotate one reply** uses different model nodes for revision, extraction and enrichment. **Give one present character their own direction** uses verified actor presence and Character Direction. **Give every clue its own explanation** uses separately bound model helpers with a finite iteration limit. Configure each selected model and helper role before enabling Lattice and using Send.

The ordinary SillyTavern reply is an additional request. Deterministic selection, context already within budget and empty edit permissions can avoid auxiliary calls. Results report actual requests against the selected bound; failed attempts may still cost tokens. There are no implicit retries.

Wires determine dependency order. Nodes usable in both stages expose **Stage → Preparation / Response**. Transpose Text processing works in either stage; Draft processing belongs to Response. Disabled operations block validation. Reusable subgraphs retain exact pinned definitions and their stage-specific contracts.

## Shape scene context

Scene Context takes bounded recent messages and selected character fields already available to the host. Set **Context visibility → public** for general public narrative processing. Its default actor-perspective view is not blanket permission to send private material to a general model; use [Actor Context](unified-workflows.md#character-specific-direction-and-private-reflections) for an authorized character’s own private branch. It does not run a new lore scan or reproduce the final native prompt. Omitted or unsupported material appears in the report.

Smart Compactor's **target tokens** measures the resulting context artifact. Its defaults are a 1,200-token target, two recent messages kept verbatim, and a 1,024-token completion cap. **Select** removes older flexible messages deterministically without a model. **Compress** makes at most one summary request if needed, labels the summary as derived, and keeps the original material for inspection.

Add exact **protected literal pins** to preserve every source message containing a matching literal verbatim. Matching is case-sensitive. A missing pin reports `PIN_MISSING`; pinned/recent material that cannot fit reports `PIN_BUDGET_EXCEEDED`. Increase the target or reduce protected material. Protected text is never cut to make it fit. The preservation report lists retained, removed, summarized, and omitted input message IDs. Over-budget or cut-off summaries fail without another attempt.

Response Plan proposes direction, actor intentions, constraints, and possible next beats. Its defaults are a 768-token completion cap and a 768-token guidance-artifact budget. Proposals are optional guidance, not established events. Adjust the operation's instructions to preserve the choices you want the user to make.

On an enabled Send, owned guidance is installed before native budgeting and cleared after generation, failure, Stop or a chat switch. A preparation failure holds its owned workflow continuation. Workflows do not replace the main prompt. Quiet/background, dry-run, and impersonation generations are skipped.

## Review a reply repair

A unified workflow resumes after its owned completed text-only native reply. Auxiliary response operations can revise its Draft, but publication requires the final **Review / Publish · Host result** and explicit Apply.

Pattern Scan, Repair, Text Rules and Transpose retain source-bound diagnostic processing. Repair requests patches within identified spans; validation rejects malformed patches, unknown indices, blank replacements, edits outside selected spans and removed protected wording. Unselected text is restored exactly. These intermediate outputs and Apply Reply diagnostics do not authorize publication.

After Send completes, select **Review / Publish · Host result** in Preview and compare the original, proposed text, notes, changes and model trace. **Apply reviewed candidate** rechecks the owned source and creates a new swipe preserving the original. **Reject candidate** leaves it alone. A chat/actor/source swipe change, foreign edit, changed workflow or new generation can invalidate a result; generate a fresh result against current sources.

Apply reports local publication separately from persistence. The host verifies freshly loaded metadata where supported; a resolving save wrapper alone does not prove disk durability. Inspect [accepted effects and recovery](unified-workflows.md#keep-acceptance-and-saving-distinct). Other extensions may already have consumed the original reply; edit/swipe events do not guarantee their memory was re-extracted.

## Actor memory and state

The [Introspection guide](introspection-package.md) covers Reflect, Internalize, Express, Context, Memory and State. Model-backed reflection and internalization create proposals; deterministic State creates values, curves and distinct-event tracks. None persists by itself.

Memory Read, Recall and Commit can run at the root or inside static subgraphs under the enclosing workflow's host authority. Native memory uses the active chat and host-selected character; group chats require an active actor. Settled public selected-message text supplies evidence, excluding private reasoning and unfinished/system/tool/intermediate/media content. Scope, store version and source revisions accompany records. Edits, swipes, deletion, actor/chat switches or cancellation can invalidate them.

Memory Commit takes proposal Data and stages its effect for the exact accepted **Review / Publish** result. Run to here, public runner calls, dry-runs, previews and failures never write. State may use the enclosing workflow's scoped Memory capture inside a static body. For Each requires an explicit State snapshot and cannot run Memory operations. Arbitrary private Express or Compose output is not a native guidance grant: Generate Reply accepts the authorized selected actor's exact live Character Direction or Recall output.

Settlement rechecks evidence, scope and prior version before compare-and-swap, preserving unrelated namespaces and recording an idempotency receipt. Identical receipt replay applies nothing twice; changed content with the same key fails. State Track does not count a settled event ID twice.

Local application and durable saving are separate. The public metadata wrapper gives no positive durability acknowledgment. **Memory updated; save unconfirmed** or **PERSISTENCE_UNKNOWN** requires fresh confirmed metadata containing the receipt before further affected writes. Positively acknowledged adapters report confirmed saving.

## Share JSON

Current [remastered examples](../examples/remastered/) are portable schema-3/runtime-2 workflows. **File → Open workflow…** validates the file and replaces the active document after guarding modified work; **Import into graph…** reviews an additive edit. Portable exports retain pinned definitions and supported controls, while omitting local saved-profile IDs and credentials, including helper overrides. Recipients rebind fixed connections and helper roles. The Active SillyTavern model option follows the recipient's host connection.

Five stage-specific [library subgraphs](../examples/library/subgraphs/) remain reusable processing definitions. Their pre/post body contracts do not make a standalone executable root. Unsupported roots, package versions, dependencies, cycles and incompatible wires fail before settings change.

Retired roots live in a cold recovery archive containing their original graphs, bindings and active selection. **File → Export archived workflows** saves a copy as JSON; it cannot execute or import as a current workflow. Rebuild needed logic in a new unified graph. Recovery performs no conversion or model requests.

## Costs, limits, and troubleshooting

Token counts identify their method: host tokenizer or character estimate. Artifact budgets exclude provider framing, and even a host tokenizer count is not exact provider context usage. Reported usage/finish reasons appear only where the provider and host expose them. A thinking model may spend much of its completion allowance on reasoning; reaching the limit rejects the auxiliary result. Increase an explicit cap or choose another bound model before a deliberate rerun.

| Issue | What to do |
| --- | --- |
| Missing binding/profile/preset | Choose an available fixed Connection Manager profile and its existing sampler preset; confirm the effective model in the inspector. |
| Unsupported binding | Use a supported direct route. The current host wrappers for Claude, Gemini/Makersuite, Vertex AI, and InfermaticAI discard completion evidence; named/inherited reverse proxies fail when the selected route can use them, as does cross-provider text-completion sampler conversion. NanoGPT keeps its fixed provider endpoint and ignores unused proxy selections. |
| Endpoint missing | Configure the endpoint in the bound Connection Manager profile or its sampler preset. |
| Budget exceeded or output cut off | Review the report, then change the target, protected material, or explicit completion cap. A failed run never silently removes pins or retries. |
| No verified completion evidence | Use a route whose host response preserves a recognized completion reason. The original is retained. |
| Invalid repair patches | Inspect the output and operation instructions. Repair requires a raw patches JSON object without Markdown fences. Correct the format or binding before a deliberate rerun; the original is retained. |
| Apply unavailable/stale | Use a fresh owned Send and inspect its Review / Publish result. Do not reuse a candidate after the source changed. |
| Preparation holds | Inspect the visible preparation report and fix the selected binding/context before the next Send. |
| Changes missing after reload | Local Apply is separate from durable saving; inspect SillyTavern's save/network status. |
| Memory updated; save unconfirmed / `PERSISTENCE_UNKNOWN` | The local update succeeded without a durability acknowledgment. Reload confirmed metadata and verify its receipt before another write; do not blindly retry. |
| Actor required / invalid memory evidence | Select an active group actor and use current settled public message evidence. Run again after source edits, swipes or deletion; inspect historical invalidation reports. |
| Memory idempotency conflict / stale version | A custom key was reused for changed content, or state changed after the proposal. Read fresh state and use a key for the intended transaction; the default native key derives from the exact proposal. |
| Old assets after an update | Hard reload SillyTavern with Ctrl+Shift+R so all versioned modules load together. |
