# LATTICE model connections and host integration

For editor operation, graph tabs, subgraphs, node controls, and recorded previews, use the [operator's manual](operators-manual.md). The [node reference](node-reference.md) lists all operations and their contracts. This guide covers model connections, legacy tools, reply review and actor memory settlement. For one graph spanning preparation, native generation and response processing, start with the [unified workflow guide](unified-workflows.md).

Install from the repository's default branch using the steps below.

## Start with a unified example

Open a unified example, choose each ordinary model node’s connection in its grey profile bar or Details and configure For Each helper roles in Details, authorize any Story Documents, then keep that document open and enable **Arm**. Start its native generation with ordinary SillyTavern **Send**. It resumes from the completed native Draft and exposes **Review / Publish · Host result** in Preview. Apply preserves the original and adds the chosen new swipe before settling its staged effects. Manual Run to here inspects supported nodes without accepting writes. The [unified guide](unified-workflows.md#apply-an-example-to-story-2) walks through Story-2 on default-user.

A fresh workspace opens **Unified story workflow** with **Arm** off. LATTICE keeps one active workflow document. Opening another document replaces it after offering to save unsaved changes and preserves the Arm preference. Each auxiliary model has an independent connection; Generate Reply uses SillyTavern’s ordinary main connection. Fast Decision requires its configured typed connection in **Tools → Fast connections…**, with explicit threshold and fallback policy.

## Start with a legacy example

1. Open SillyTavern's **Extensions → Install extension**. Enter repository URL `https://github.com/MentallyQuill/Lattice`, leave **Branch or tag name (optional)** blank to install the default branch, click **Install** (or **Install just for me**), then reload. Open LATTICE beside Send or with `/lattice`.
2. Open **File → Open examples…** and choose a lesson, or open [Scene guidance](../workflows/native-guidance.json) or [Reviewed AI De-slop](../workflows/reviewed-de-slop.json) with **File → Open workflow…**. Each opening makes an editable copy the active document. Opening, importing, and editing preserve Arm and make no model call.
3. Choose a model-calling node’s connection in the grey bar below its card, or in **Details → Connection profile**. The bar opens a searchable list of current SillyTavern Connection Manager profiles; keywords match the name, API label and model. **Active SillyTavern model** always appears first and follows the host’s current connection and model. Newly created ordinary text-model nodes select it; existing fixed profiles and role inheritance retain their bindings. Scene guidance has separate Smart Compactor and Response Plan connections; repair has its own connection. Each node uses its chosen connection’s model by default. Choose **Model mode → Override** only when that node needs a different model identifier.
4. Keep the legacy document you want to use open. A missing/deleted profile or unsupported route blocks the run with a useful issue. Arm controls Send separately from manual runs.
5. Use **Graph → Run workflow** to inspect the workflow's result. To use the open Pre document on normal sends, enable **Arm** and send as usual. For repair, wait for a completed assistant reply before running, then compare the candidate with the original.

For an existing installation, update it in **Manage Extensions** and reload. If you need to change branches, select the desired branch in **Manage Extensions → Switch branch**, click **Switch**, then reload. Install URLs use the repository address above without a `/tree/` suffix.

**Run can spend model tokens.** In a legacy pre workflow, a manual guidance run computes guidance without publishing it. A later Send runs the open Pre workflow again when Arm is enabled, with up to two more auxiliary requests; the manual result is not cached for Send.

Saved-profile connections stay fixed to your bindings; the active-model option follows SillyTavern at request time. Lattice does not activate a profile globally. Auxiliary requests contain the operation's own instructions and supplied context. They use the bound profile's route and sampler preset, without copying the native main prompt's system text into every request. Credentials stay in SillyTavern's secret store.

## Model-backed examples

| Example | Operations | Maximum auxiliary requests |
| --- | --- | --- |
| Scene guidance | Scene Context → Smart Compactor → Response Plan → Guidance | 2: one compression, one plan |
| Reviewed AI De-slop | Reply Snapshot → Pattern Scan → Repair → Validate Patches → Review Gate → Apply Reply | 1: repair |
| Reflect and express | Scene Context → Context Focus Select → Reflect Character → Express Behavior → Guidance; Memory Read State feeds Reflect | 1 Analysis: reflection |
| Internalize and commit | Memory Read State + Memory Read Events → Internalize Experience → Memory Commit | 1 Analysis: state proposal |
| Consequence clock | Memory Read State + Memory Read Events → State Track → Memory Commit | 0 |

The normal SillyTavern reply is an additional request. Selection-only compaction, context already within budget, and literal scan-only repair can avoid their respective model calls. Results show actual requests against the configured bound; failed attempts can still cost tokens. There are no implicit retries.

Native graph wires determine execution order. Moving a card does not change message order. The shelf groups operations by family, including Input, Shaping, Surface, Transpose, Introspection, Derive, Events, Randomness, Collections, Recall and Output. Transpose accepts ordinary Text in either stage, with Draft edits restricted to the response/Post stage. Introspection modes are selected in Details; State also supports generic progression and time-decay. Disabled native operations block validation rather than silently bypassing.

The **AI De-slop** formation is an ordinary group of three editable operations: Pattern Scan, Repair, and Validate Patches. Use **Open group** on its collapsed card, or double-click the group, to reveal its nodes. Reusable subgraphs instead open in graph tabs, and their pinned definitions do not silently update.

## Shape scene context

Scene Context takes bounded recent messages and selected character fields already available to the host. Set **Context visibility → public** for general public narrative processing. Its default actor-perspective view is not blanket permission to send private material to a general model; use [Actor Context](unified-workflows.md#character-specific-direction-and-private-reflections) for an authorized character’s own private branch. It does not run a new lore scan or reproduce the final native prompt. Omitted or unsupported material appears in the report.

Smart Compactor's **target tokens** measures the resulting context artifact. Its defaults are a 1,200-token target, two recent messages kept verbatim, and a 1,024-token completion cap. **Select** removes older flexible messages deterministically without a model. **Compress** makes at most one summary request if needed, labels the summary as derived, and keeps the original material for inspection.

Add exact **protected literal pins** to preserve every source message containing a matching literal verbatim. Matching is case-sensitive. A missing pin reports `PIN_MISSING`; pinned/recent material that cannot fit reports `PIN_BUDGET_EXCEEDED`. Increase the target or reduce protected material. Protected text is never cut to make it fit. The preservation report lists retained, removed, summarized, and omitted input message IDs. Over-budget or cut-off summaries fail without another attempt.

Response Plan proposes direction, actor intentions, constraints, and possible next beats. Its defaults are a 768-token completion cap and a 768-token guidance-artifact budget. Proposals are optional guidance, not established events. Adjust the operation's instructions to preserve the choices you want the user to make.

With Arm enabled, Send follows the open document. Owned guidance is installed before native budgeting and cleared after the generation, failure, stop, or chat switch. In legacy pre mode, a preparation failure clears guidance and leaves SillyTavern’s ordinary generation available, with a visible failure report. A unified preparation failure holds its owned workflow continuation instead of silently accepting a partial pipeline. Workflows do not replace the main prompt. Quiet/background, dry-run, and impersonation generations are skipped.

## Review a reply repair

A legacy post repair supports the **latest completed text-only assistant reply**. Older replies, unfinished generations, tool/intermediate messages, and media replies cannot be redirected to another message for repair. Legacy post repair runs manually. In a unified workflow, response dependencies can run automatically after its owned native generation completes; their candidate still requires explicit Apply.

Pattern Scan uses your literal preferences, exemptions, protected wording, and case policy. Defaults are examples such as “a testament to,” “delve,” and “tapestry”; they are editable preferences, not a universal banned-word list. Scope can be the whole reply, narration, or dialogue. Dialogue is text inside paired straight or curly double quotes; apostrophes and single quotes are ordinary text. Unmatched double quotes block narration/dialogue scanning with a report.

Repair asks for JSON patches within the identified spans, with a default 2,048-token completion cap. Strength and instructions guide the model; they are not a measured preservation guarantee. Validation rejects malformed patches, unknown/duplicate indices, blank replacements, changes outside selected spans, and removed protected wording. Unselected text is restored exactly from the original. Rejected output leaves the original in place and is not retried as a whole-reply rewrite.

After **Graph → Run workflow**, select the root **Apply Reply · Host result** entry in **Preview output**. Inspect the original and proposed reply in the available artifact tabs: reviewed AI repair records separate **original** and **candidate** text tabs; Literal cleanup shows `original` and `text` in its structured **candidate** artifact. Review the recorded findings, changes, selected model and request trace too. **Apply reviewed candidate** rechecks source freshness and adds a new assistant swipe while keeping the original. **Reject candidate** preserves the original without applying. Intermediate outputs and **Run to here** are diagnostic previews. Switching chat/swipe, editing the source, replacing the message, or starting generation can invalidate the candidate; run again against the current reply.

Apply reports local publication separately from persistence. The native adapter verifies freshly loaded metadata where supported; the public save wrapper resolving alone does not prove the revision reached disk. An unconfirmed or unknown outcome is reported explicitly. See [accepted effects and recovery](unified-workflows.md#keep-acceptance-and-saving-distinct). Other memory extensions may already have consumed the original reply. Edit/swipe events do not guarantee they re-extract it; review those extensions separately if needed.

## Actor memory and state

Open [Reflect and express](../examples/introspection/native/reflect-and-express.json), [Internalize and commit](../examples/introspection/native/internalize-and-commit.json) or [Consequence clock](../examples/introspection/native/consequence-clock.json) with **File → Open workflow…**. Opening makes an editable copy the active workflow document and preserves Arm. Choose a connection profile in Details for Reflect or Internalize; the deterministic Consequence clock requires no connection. The [Introspection guide](introspection-package.md) covers all modes, typed records and controls.

Reflect Character makes one bounded assessment request; Express Behavior renders its hints as Guidance without another request. Context Focus defaults to Select, so the Pre starter's bound is one Analysis call. Graph → Run workflow previews its guidance; Send runs the same open Pre document again when Arm is enabled. Internalize Experience makes one Analysis request to propose supported actor updates. State Track proposes a count of distinct settled event IDs without a model. Neither proposal persists on its own.

Memory Read, Recall and Commit require the root graph. Memory uses the active chat and host-selected character; group chats require an active actor. It reads settled selected public message text, excluding private reasoning and unsupported unfinished/system/tool/intermediate/media content. Scope, store, prior version and source revisions accompany each record. A source edit, swipe, deletion, actor/chat switch, changed settings or cancellation can invalidate a pending commit.

**In a legacy post workflow, a successful full root Run ending in Memory Commit may write immediately.** There is no separate reply-review action for this legacy memory terminal. In a unified workflow, memory effects join the owned accepted-root bundle and wait for the chosen Review / Publish result. Commit takes `proposal` Data and has no output pin. One Commit is allowed, and all independent branches must succeed before it settles. Run to here, target execution, dry-run, public runner calls and failed runs never write. In reusable subgraphs, supply State's `state` input explicitly and keep Memory in the parent root.

Settlement rechecks fresh sources, active scope and store version before one compare-and-swap update, preserving other metadata namespaces. The default Commit key `lattice-memory-commit` becomes a native key for that graph, terminal and exact proposal. A custom key must identify a single transaction. Identical receipt replay applies nothing again; changed content using the same key fails. State Track never counts a repeated settled event ID twice.

Memory's local application and durable saving are separate. The public SillyTavern metadata save wrapper returns no durability acknowledgment. When local application succeeds, the result is `memoryCommit: { applied: true, acknowledged: false, version: ... }`, and Preview shows **Memory updated; save unconfirmed**. Save rejection can also leave an unknown outcome. Confirm a fresh metadata load containing the receipt before retrying; subsequent writes stay blocked while that outcome is unknown. Positively acknowledged adapters report `acknowledged: true`.

## Share JSON

Use **File → Save workflow** to write the active document to its current JSON file, or **Save As…** to choose another destination. Native file saving retains local connections and workspace views. **File → Open Recent** reopens a previously used file when the browser supports native file access. Other browsers offer **Download JSON…**; a downloaded copy does not confirm that the current file was saved. SillyTavern retains a recovery draft separately, and **File → Recover previous workflows** exposes workflows preserved from the old settings collection.

The complete portable examples include [native-guidance.json](../workflows/native-guidance.json), [reviewed-de-slop.json](../workflows/reviewed-de-slop.json), and the zero-call examples in [the workspace guide](lattice-workspace.md). Use **File → Open workflow…** to open a workflow, or **Import into graph…** to review an addition to the current graph. Export uses a versioned `lattice-workflow` package; composed workflows include their pinned subgraph definitions. Individual subgraphs export as their own JSON packages. Exports omit local saved-profile IDs and credentials, including local For Each helper overrides; recipients rebind those fixed connections in the node bar or Details and helper roles in Details before running. **Active SillyTavern model** survives portable export and follows the recipient’s configured host connection and model.

The three [native Introspection examples](../examples/introspection/native/) are portable schema-3/runtime-2 workflows. The version-1 manifests directly under `examples/introspection/` are package-harness inputs requiring injected services; use the native directory for canvas import. Both formats have synthetic fixture coverage without API calls.

Do not paste API keys into workflow JSON, instructions, or model overrides. Unsupported package versions, dependencies, graph cycles, incompatible artifacts, and dangling wires are rejected before the open document changes.

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
| Apply unavailable/stale | Finish generation, return to the latest text-only reply, and run repair again. Do not reuse a candidate after the source changed. |
| Main reply proceeded after legacy pre failure | This is the legacy native fallback. Inspect the visible preparation report and fix the binding/context before the next send. |
| Changes missing after reload | Local Apply is separate from durable saving; inspect SillyTavern's save/network status. |
| Memory updated; save unconfirmed / `PERSISTENCE_UNKNOWN` | The local update succeeded without a durability acknowledgment. Reload confirmed metadata and verify its receipt before another write; do not blindly retry. |
| Actor required / invalid memory evidence | Select an active group actor and use current settled public message evidence. Run again after source edits, swipes or deletion; inspect historical invalidation reports. |
| Memory idempotency conflict / stale version | A custom key was reused for changed content, or state changed after the proposal. Read fresh state and use a key for the intended transaction; the default native key derives from the exact proposal. |
| Old assets after an update | Hard reload SillyTavern with Ctrl+Shift+R so all versioned modules load together. |
