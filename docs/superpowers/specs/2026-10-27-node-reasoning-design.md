# Reasoning controls for model nodes

The requested behavior is a per-node Reasoning selector, defaulting to None,
with options matching the selected provider/model and a Custom text value.
Include the native Generate Reply boundary and auxiliary model nodes, including
conditional modes, retries, and nodes inside helpers and subgraphs.

## Approach

Use shared native-envelope controls (`reasoningEffort`, `reasoningCustom`), a
provider/model capability projection, and one request translation module.
This avoids duplicating provider translations across individual node engines.
A universal effort list would advertise unavailable settings; separate custom
editors per node would duplicate persistence and editing behavior.

Defaults remain additive: omit None and empty custom text from existing
definition identities. Preserve authored custom text when profiles, models,
or deterministic/model modes change. Deterministic modes hide the controls.
Resolve inspector options from effective binding metadata after cached static
fields, so host model changes immediately refresh the options.

## Request behavior and limits

Apply overrides after sampler conversion, to each request alone. Nested helper
calls keep the child node's settings, and retries repeat those settings. Native
Generate Reply uses its owned final settings event; saved host settings are
never mutated. Preserve unrelated native custom request additions.

None disables thinking where the provider and installed host adapter support
it. For models that require reasoning, explain the limitation and avoid an
invalid disabling value. Custom is bounded text, translated without arbitrary
payload injection; adapters that cannot preserve a value report an error.
Host restrictions on completion evidence remain in force.

Cover OpenRouter, NanoGPT, z.AI, DeepSeek, OpenAI, Anthropic, and Gemini, with
additional provider routes where verified. Prefer supplied model capability
metadata over model-name fallbacks. This change adds no provider discovery
requests, credentials, or external dependencies.

## Verification

Check declared controls, validation and document round trips; existing semantic
identities; effective profile/model refresh; Custom editing and undo/redo;
payload isolation; helper/retry propagation; native ownership and cancellation.
Run the Node suite, type checks, build, generated assets checks, and browser
coverage without making provider requests.
