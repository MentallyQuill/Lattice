# Model setup and troubleshooting

[Documentation](README.md) · [Operator’s manual](operators-manual.md) · [Unified workflows](unified-workflows.md)

Your usual SillyTavern connection writes the main reply. Lattice’s model tools can use that connection or saved profiles for separate jobs. This guide explains the setup, request limits, reply review, and save status.

## Start with a unified example

If you have not installed Lattice, follow the [quick start](lattice-workspace.md). A fresh workspace opens **Unified story workflow** with Lattice disabled.

Choose **File → Open examples…** and read the lesson’s setup. Configure its model tools and any **For Each** helper roles. Automatic Workflow Data sources need no setup; authorize custom story documents through **Workflow → Configure → Workflow Data…**.

Keep that document open, select **Enable Lattice**, and Send normally in SillyTavern. After the reply finishes, select **Review / Publish → Host result** in Preview. Apply adds the reviewed version as a new swipe and accepts its staged effects. **Run to here** only tests supported steps. See [applying an example to your story](unified-workflows.md#apply-an-example-to-your-story).

Opening a workflow makes it active without changing Enable Lattice. Switching between its Main and subgraph tabs changes the view, not the active workflow.

## Configure model connections

Click the grey connection bar on an ordinary model node:

- **Active SillyTavern model** follows the host’s current connection and model.
- A saved **Connection Manager profile** fixes that tool’s route, sampler preset, and default model.
- **Details → Advanced model settings → Model mode → Override** supplies a different model identifier when needed.

Configure **For Each → Helper model bindings** separately. Choosing a connection for an extraction tool does not assign the helper’s confirmation model.

Each request uses the tool’s own instructions and connected material. Lattice does not switch SillyTavern’s main connection globally or copy the main prompt into every extra request. Credentials stay in SillyTavern’s secret store.

**Run to here** can spend tokens when the tested path includes model tools. A later Send runs its own preparation; it does not reuse that diagnostic result. Update the extension through **Manage Extensions**, then reload.

## Model-backed examples

The [30 lessons](examples.md) explain their additional request budgets. **Plan, write, polish, and annotate one reply** connects editorial jobs. **Give one present character their own direction** checks participation before private portrayal. **Give every clue its own explanation** runs a model helper over a list with a finite limit.

The normal SillyTavern reply is an additional request. Fixed selection, context already within budget, or an edit with no permitted text can avoid extra requests. Inspect the trace for actual requests; failed attempts may still spend tokens. Lattice does not retry implicitly.

Connections determine execution order. Tools that support both stages expose **Stage → Preparation / Response**. Text transformations can work in either stage; editing the reply Draft belongs to Response. Disabled operations block validation. Saved subgraphs retain their exact definitions and stage requirements.

## Shape scene context

**Scene Context** reads a bounded set of recent messages and selected character fields available to SillyTavern. Choose **Context visibility → public** for a general planner or public narrative processing. The actor-perspective view does not grant a general model access to any character’s private material. Use [Actor Context](unified-workflows.md#character-specific-direction-and-private-reflections) for a character’s own authorized branch.

Scene Context does not run another lore scan or recreate the final SillyTavern prompt. Its report identifies omitted or unsupported material.

**Smart Compactor** budgets the resulting context. Defaults are a 1,200-token target, two recent messages kept verbatim, and a 1,024-token completion cap.

| Mode | Behavior |
| --- | --- |
| **Select** | Remove older flexible messages without a model request. |
| **Compress** | Make at most one summary request when needed, label it as derived, and retain the source for inspection. |

Use exact **protected literal pins** to keep every message containing that case-sensitive wording verbatim. Missing wording reports `PIN_MISSING`. Protected or recent material that cannot fit reports `PIN_BUDGET_EXCEEDED`; increase the target or reduce the protected set. Protected text is never shortened to fit. The report lists retained, removed, summarized, and omitted messages. A summary that is over budget or cut off fails without another attempt.

**Response Plan** proposes direction, intentions, constraints, and possible next beats. Its defaults are a 768-token completion cap and a 768-token guidance budget. These are suggestions, not established events. Write its instructions to preserve the choices you want the player to make.

On an enabled Send, Lattice supplies connected guidance before SillyTavern’s prompt budgeting and clears it after generation, failure, Stop, or a chat switch. A preparation failure holds the workflow. Quiet/background, dry-run, and impersonation generations are skipped.

## Review a reply repair

A workflow continues from the completed text-only reply produced by its own Send. Response tools can revise that Draft, but the final **Review / Publish → Host result** needs explicit Apply.

**Pattern** reports matches while leaving its Draft unchanged. **Filter Text** uses the current report to remove permitted lines or paragraphs as whole units. Repair, Text Rules, and Transpose can propose exact text patches for inspection. Patch validation rejects malformed edits, unknown indices, blank replacements, edits outside permitted spans, and removed protected wording. Unselected text is restored exactly.

Patch or candidate diagnostics are intermediate checks. The final Draft must reach Review / Publish to publish the reviewed reply.

In Preview, compare the original, proposed text, notes, changes, model trace, and staged effects. **Apply reviewed reply** checks the current source and adds a new swipe preserving the original. **Reject reply** leaves the original available. Changing chat, actor, source swipe, source text, workflow, or generation can make a result stale; generate a fresh result against the current inputs.

Reply publication and saved story changes have separate statuses. A host save finishing does not always confirm durable storage. Inspect [accepted effects and recovery](unified-workflows.md#keep-acceptance-and-saving-distinct). Other extensions may already have used the original reply; edit and swipe events do not guarantee that their memories are extracted again.

## Actor memory and state

The [Introspection guide](introspection-package.md) covers Reflect, Internalize, Express, Context, Memory, and State. Model reflection and internalization propose changes. State computes authored values and event tracks. None saves by itself.

Memory Read, Recall, and Commit can run in Main or static subgraphs under the workflow’s host permissions. Native memory uses the active chat and selected character; group chats need an active actor. Evidence comes from settled public selected-message text, excluding private reasoning and unfinished, system, tool, intermediate, or media content. Edits, swipes, deletion, scope changes, and cancellation can invalidate it.

**Memory Commit** stages a proposal for that exact accepted Review / Publish result. Preview, Run to here, dry-runs, public runner calls, and failed runs never write. State can read the enclosing workflow’s captured memory in a static body. **For Each** helpers need an explicit State snapshot and cannot run Memory operations.

Generate Reply accepts private guidance from the selected actor’s exact live Character Direction or Recall output. Private Express or Compose text alone does not grant that access.

Before saving, Lattice checks current evidence, scope, source revisions, and the prior store version. It preserves unrelated memory and records a receipt. Repeating the identical receipt does not apply a change twice; reusing its key with different content fails. State Track does not count a settled event ID twice.

**Memory updated; save unconfirmed** or **PERSISTENCE_UNKNOWN** means the local change lacks a positive save acknowledgment. Further affected writes wait for freshly confirmed saved metadata containing its receipt. A supported adapter can report confirmed saving; the public host wrapper alone cannot.

## Share JSON

Use **File → Open workflow…** to validate and replace the active document after handling unsaved work. **Import into graph…** previews an additive edit. The [remastered examples](../examples/remastered/) use portable schema-3/runtime-2 workflows.

Portable exports preserve saved definitions and supported controls while omitting local profile identifiers and credentials, including helper overrides. Recipients reselect fixed profiles and helper roles. **Active SillyTavern model** remains portable and follows the recipient’s connection. Confirm that any retained custom model name is valid for that route.

The five [library subgraphs](../examples/library/subgraphs/) remain reusable processing definitions. Their older stage contracts do not make them standalone executable workflows. Unsupported roots, package versions, dependencies, cycles, and incompatible connections fail validation before settings change.

Retired pre/post roots remain in a recovery archive. **File → Export archived workflows** saves a copy of their original graphs and bindings; it makes no requests or automatic conversion. Rebuild useful parts in a current unified workflow.

## Costs, limits, and troubleshooting

Token counts identify whether they use SillyTavern’s tokenizer or a character estimate. Content budgets exclude provider framing; even tokenizer counts are not exact provider context usage. Usage and completion reasons appear only when the provider and host expose them.

A thinking model may spend much of its completion allowance on reasoning. Reaching the limit rejects the extra result. Change an explicit cap or select another model before deliberately rerunning.

| Issue | What to check |
| --- | --- |
| Missing connection, profile, or preset | Select an available Connection Manager profile with its sampler preset. Confirm the effective model in Details. |
| Unsupported connection | Use a supported direct route. Current host wrappers for Claude, Gemini/Makersuite, Vertex AI, and InfermaticAI discard completion evidence. Named or inherited reverse proxies fail when the route can use them, as does cross-provider text-completion sampler conversion. NanoGPT keeps its fixed endpoint and ignores unused proxy selections. |
| Endpoint missing | Set the endpoint in the chosen profile or sampler preset. |
| Budget exceeded or output cut off | Inspect the report, then change the context target, protected set, or explicit completion cap. Lattice does not silently remove protections or retry. |
| No verified completion evidence | Use a route whose host response preserves a recognized completion reason. The original reply stays available. |
| Invalid repair patches | Inspect the output and instructions. Repair requires a raw patches JSON object without Markdown fences. Correct the format or connection before rerunning. |
| Apply unavailable or stale | Send again with the current workflow and inspect its fresh Review / Publish result. |
| Preparation holds | Read its report and fix the connection or context before the next Send. |
| Changes missing after reload | Inspect the per-effect save status and SillyTavern’s save/network status. Local Apply and durable saving are separate. |
| Memory updated; save unconfirmed / `PERSISTENCE_UNKNOWN` | Confirm fresh saved metadata containing the receipt before another affected write. Do not blindly retry or change the receipt key. |
| Actor required or invalid memory evidence | Select the active group actor. Use current settled public text and extract fresh evidence after edits, swipes, or deletion. |
| Receipt conflict or stale version | Read fresh state. Use a transaction key for the intended proposal rather than reusing one for changed content. |
| Old assets after an update | Hard reload SillyTavern with **Ctrl+Shift+R** so versioned modules load together. |
