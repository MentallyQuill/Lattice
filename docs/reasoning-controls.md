# Per-node reasoning controls

Select a model node and open **Details → Limits & retries → Reasoning**.
**None** is the default. **Custom** accepts a provider effort string of up to
128 characters. Changing the connection, model, or effort keeps the saved custom
text. Configure the actual model node inside a helper or subgraph.

Choices refresh from the effective connection and model. Current production
callers use known model-family rules; this feature does not fetch live provider
catalogs. The shared contract also accepts supplied capability metadata,
including OpenRouter effort lists and DeepSeek supported levels.

## Installed host adapter behavior

Provider support and SillyTavern adapter support are distinct. The control shows
the choices the installed adapter can carry and explains its limits.

| Route | Behavior |
| --- | --- |
| OpenRouter | Model-dependent effort choices; exact Custom strings. |
| NanoGPT | Corrects the host's translated labels to preserve native None, Minimal, Low, Medium, High. Higher or unfamiliar native values produce an error. |
| z.AI / Moonshot | Native routes expose thinking switches. Unsupported effort names or budgets produce an error. |
| DeepSeek | Thinking switch, known native effort levels, and exact Custom effort strings. |
| OpenAI / Azure | Model-dependent effort choices, constrained by the installed host's model allowlist. Custom spellings that the host rewrites are rejected. |
| Anthropic / Claude | Host budget presets or adaptive effort, depending on model. Arbitrary numeric budgets are unavailable through the native adapter. |
| Google Gemini | Host thinking budgets or model-dependent levels. Some models require reasoning; the host also imposes model-specific minimum budgets. |
| xAI | Native host adapter preserves Low and High. Direct custom endpoints can carry further native levels. |
| Groq | Native host adapter omits effort. An OpenAI-compatible custom endpoint can carry native values. |
| Custom chat endpoint | Uses known endpoint/model hints and inserts exact reasoning fields into the custom request body. Unknown endpoints offer None and Custom. |

None disables optional thinking where supported. A model that always reasons
uses its supported minimum or provider default, explained beside the selector.
Hiding reasoning text is distinct from disabling reasoning computation.

Generate Reply applies reasoning through the owned final chat settings event.
It preserves unrelated JSON/YAML custom body additions and rejects exclusions
that would remove its reasoning fields. A host without that event cannot apply
an enabled override. Native text completion remains controlled by its host;
Lattice reports an unsupported override or a skipped None.

Existing auxiliary restrictions remain: direct Claude, Google AI Studio, and
Vertex adapters that discard completion evidence cannot run auxiliary Lattice
requests. This feature does not change that completion verification policy.

## Provider references

Provider semantics were checked against the official documentation on
2026-10-27. Host mappings were checked against the locally installed SillyTavern
source. New host or model versions may need updated capability rules.

- [OpenRouter reasoning and capability metadata](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- [NanoGPT extended thinking](https://docs.nano-gpt.com/api-reference/miscellaneous/extended-thinking)
- [z.AI thinking mode](https://docs.z.ai/guides/capabilities/thinking-mode)
- [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/)
- [OpenAI reasoning](https://developers.openai.com/api/docs/guides/reasoning)
- [Claude effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking)
- [xAI reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning)
- [Groq reasoning](https://console.groq.com/docs/reasoning)
