export const ACTIVE_PROFILE_ID = 'lattice:active-sillytavern';
export const ACTIVE_PROFILE_NAME = 'Active SillyTavern model';
const TEXT_MODELS = {ooba:'custom_model',generic:'generic_model',mancer:'mancer_model',togetherai:'togetherai_model',infermaticai:'infermaticai_model',dreamgen:'dreamgen_model',openrouter:'openrouter_model',vllm:'vllm_model',aphrodite:'aphrodite_model',ollama:'ollama_model',featherless:'featherless_model',tabby:'tabby_model',llamacpp:'llamacpp_model'};
const LABELS = {nanogpt:'NanoGPT',claude:'Claude',openai:'OpenAI',custom:'Custom',openrouter:'OpenRouter',ollama:'Ollama'};
const text = value => typeof value === 'string' && value.trim() ? value : null;
/** Display-only host metadata. It carries neither captured settings nor request authority. */
export function activeModelMetadata(context) {
    try {
        context = typeof context === 'function' ? context() : context;
        const chat = context?.mainApi === 'openai', completion = context?.mainApi === 'textgenerationwebui';
        if (!chat && !completion) return null;
        const settings = chat ? context.chatCompletionSettings : context.textCompletionSettings;
        const api = text(chat ? settings?.chat_completion_source : settings?.type);
        if (!api) return null;
        const route = Object.values(context.CONNECT_API_MAP ?? {}).find(route => route.selected === context.mainApi && (chat ? route.source : route.type) === api);
        const model = chat ? context.getChatCompletionModel?.(settings) : api === 'huggingface' ? 'tgi' : settings?.[TEXT_MODELS[api]];
        return {api,...(completion ? {transport:'textgenerationwebui'} : {}),apiLabel:text(route?.label) ?? text(route?.name) ?? LABELS[api] ?? api,model:text(model)};
    } catch { return null; }
}
