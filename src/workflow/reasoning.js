/** Saved keys are provider independent; the selected route determines their meaning. */
export const REASONING_EFFORTS = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'enabled', 'adaptive', 'custom']);
const labels = { none: 'None', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max', enabled: 'Enabled', adaptive: 'Adaptive', custom: 'Custom' };
const disabled = () => ({ include_reasoning: false, reasoning_effort: '' });
const fail = (code, message) => ({ ok: false, error: { code, message } });
const routeProvider = target => target.api === 'textgenerationwebui' ? 'text' : String(target.source ?? target.api ?? '').toLowerCase();
const customRoute = target => routeProvider(target) === 'custom';
const modelName = target => String(target.model ?? '').toLowerCase().split('/').at(-1);
function customProvider(target) {
    // Endpoints are optional hints. Never inspect URLs with credentials or query data.
    try {
        const url = new URL(target.endpoint);
        if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash) {
            const hosts = { 'openrouter.ai': 'openrouter', 'nano-gpt.com': 'nanogpt', 'api.nano-gpt.com': 'nanogpt', 'api.openai.com': 'openai', 'api.anthropic.com': 'claude', 'api.deepseek.com': 'deepseek', 'api.z.ai': 'zai', 'open.bigmodel.cn': 'zai', 'api.x.ai': 'xai', 'api.groq.com': 'groq', 'api.moonshot.ai': 'moonshot', 'api.moonshot.cn': 'moonshot', 'generativelanguage.googleapis.com': 'makersuite' };
            if (Object.hasOwn(hosts, url.hostname)) return hosts[url.hostname];
        }
    } catch { /* Model families provide a second public hint. */ }
    const model = modelName(target);
    if (/^(?:gpt-[56]|o[134](?:-|$))/.test(model)) return 'openai';
    if (/^claude-/.test(model)) return 'claude';
    if (/^gemini-/.test(model)) return 'makersuite';
    if (/^deepseek-/.test(model)) return 'deepseek';
    if (/^glm-/.test(model)) return 'zai';
    if (/^grok-/.test(model)) return 'xai';
    if (/^kimi-/.test(model)) return 'moonshot';
    return 'custom';
}
const providerOf = target => customRoute(target) ? customProvider(target) : routeProvider(target);
const gatewayEfforts = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
// The installed host maps these keys in the opposite direction before sending.
const nanoHostEfforts = { none: 'min', minimal: 'low', low: 'medium', medium: 'high', high: 'max' };
// Public installed SillyTavern constants: native OpenAI/Azure drops other models' efforts.
const openAiHostModels = new Set([
    'o1', 'o3-mini', 'o3-mini-2025-01-31', 'o4-mini', 'o4-mini-2025-04-16', 'o3', 'o3-2025-04-16',
    'gpt-5', 'gpt-5-2025-08-07', 'gpt-5-mini', 'gpt-5-mini-2025-08-07', 'gpt-5-nano', 'gpt-5-nano-2025-08-07',
    'gpt-5.1', 'gpt-5.1-2025-11-13', 'gpt-5.1-chat-latest', 'gpt-5.2', 'gpt-5.2-2025-12-11', 'gpt-5.2-chat-latest',
    'gpt-5.3-chat-latest', 'gpt-5.4', 'gpt-5.4-2026-03-05', 'gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17',
    'gpt-5.4-nano', 'gpt-5.4-nano-2026-03-17', 'gpt-5.5', 'gpt-5.5-2026-04-23',
    'gpt-5.6', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-6-astra',
]);
const isOpenAi = provider => ['openai', 'azure', 'azure_openai'].includes(provider);
const xaiHostEfforts = target => /grok-(?:3-mini|4\.[5-9])/.test(target.model ?? '') ? ['low', 'high'] : [];
const toggleProvider = provider => ['zai', 'moonshot'].includes(provider);
const mandatoryToggle = target => providerOf(target) === 'zai' && /(?:^|\/)glm-5\.3(?:-|$)/.test(target.model ?? '') || providerOf(target) === 'moonshot' && /kimi-k2-thinking/.test(target.model ?? '');
function deepSeekEfforts(target) {
    const supported = target.metadata?.effort?.supported_levels;
    return Array.isArray(supported) ? gatewayEfforts.filter(effort => effort !== 'none' && supported.includes(effort)) : /deepseek-(?:v4|flash)/.test(target.model ?? '') ? ['low', 'high', 'max'] : [];
}
function claudeContract(target) {
    const model = target.model ?? '';
    const adaptive = /^claude-(?:opus-4-[78]|fable|opus-5|sonnet-5)/.test(model);
    const supported = /^claude-(?:3-7|opus-4|sonnet-4|haiku-4-5|fable|opus-5|sonnet-5)/.test(model);
    return { supported, adaptive, efforts: adaptive ? ['low', 'medium', 'high', 'max', 'adaptive'] : ['enabled', 'low', 'medium', 'high', 'max'] };
}
const isGemini = provider => ['makersuite', 'vertexai', 'gemini', 'google'].includes(provider);
function geminiContract(target) {
    const model = target.model ?? '';
    if (/gemini-3[.\d]*-pro/.test(model)) return { supported: true, levels: true, minimum: 'low', efforts: ['low', 'high', 'adaptive'], help: 'This model always reasons. None requests low thinking; Pro supports low or high. Adaptive uses the model default.' };
    if (/gemini-3[.\d]*-flash/.test(model)) {
        const noMinimal = /gemini-3\.[78]-flash/.test(model);
        return { supported: true, levels: true, minimum: noMinimal ? 'low' : 'min', efforts: [...(noMinimal ? [] : ['minimal']), 'low', 'medium', 'high', 'adaptive'], help: `This model always reasons. None requests ${noMinimal ? 'low' : 'minimal'} thinking. Adaptive uses the model default.` };
    }
    if (/^gemini-2\.5-(?:flash|pro)/.test(model) && !/-image(?:-preview)?$/.test(model)) {
        const pro = /pro/.test(model), lite = /flash-lite/.test(model);
        return { supported: true, levels: false, minimum: 'min', efforts: ['enabled', 'adaptive', 'low', 'medium', 'high', 'max'], help: `${pro ? 'This model always reasons. None requests the minimum 128-token thinking budget. ' : lite ? 'The installed adapter clamps this model to at least 512 thinking tokens, including None. ' : 'None disables thinking. '}Enabled/Adaptive use a dynamic budget; low/medium/high/max are host budget presets. Custom numeric budgets cannot be represented by the installed adapter.` };
    }
    return { supported: false, levels: false, minimum: '', efforts: [], help: '' };
}
function openAiEfforts(model = '') {
    if (model === 'gpt-5.3-chat-latest') return ['medium'];
    if (/^gpt-6(?:\.|-|$)/.test(model)) return ['low', 'medium', 'high', 'xhigh', 'max'];
    if (/^gpt-5\.6(?:-|$)/.test(model)) return ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
    if (/^gpt-5\.[2-5](?:-|$)/.test(model)) return ['none', 'low', 'medium', 'high', 'xhigh'];
    if (/^gpt-5\.1(?:-|$)/.test(model)) return ['none', 'low', 'medium', 'high'];
    if (/^gpt-5(?:-|$)/.test(model)) return ['minimal', 'low', 'medium', 'high'];
    if (/^o[134](?:-|$)/.test(model)) return ['low', 'medium', 'high'];
    return [];
}
function gatewayContract(target) {
    const metadata = target.metadata?.reasoning;
    const inferred = inferredModel(target);
    let supported = metadata?.supported_efforts === null ? gatewayEfforts : Array.isArray(metadata?.supported_efforts) ? gatewayEfforts.filter(effort => metadata.supported_efforts.includes(effort)) : inferred.supported;
    if (providerOf(target) === 'nanogpt' && !customRoute(target)) supported = supported.filter(effort => Object.hasOwn(nanoHostEfforts, effort));
    const mandatory = typeof metadata?.mandatory === 'boolean' ? metadata.mandatory : inferred.mandatory;
    const lowest = supported.find(effort => effort !== 'none') ?? '';
    return { supported, mandatory, lowest };
}
function inferredModel(target) {
    const model = modelName(target), openai = openAiEfforts(model);
    if (openai.length) return { supported: openai, mandatory: !openai.includes('none') };
    if (/gemini-3/.test(model)) {
        const gemini = geminiContract({ model });
        return { supported: gemini.efforts.filter(value => value !== 'adaptive'), mandatory: true };
    }
    if (/^gemini-4(?:[.-]|$)/.test(model)) return { supported: ['low', 'medium', 'high'], mandatory: true };
    if (/gemini-2\.5/.test(model)) return { supported: ['none', 'low', 'medium', 'high'].filter(value => value !== 'none' || !/pro/.test(model)), mandatory: /pro/.test(model) };
    if (/^glm-5\.3/.test(model)) return { supported: ['low', 'high', 'max'], mandatory: true };
    if (/^glm-5\.2/.test(model)) return { supported: ['none', 'high', 'max'], mandatory: /:thinking$/.test(model) };
    if (/^claude-/.test(model)) {
        const claude = claudeContract({ model });
        return { supported: [...(claude.adaptive ? [] : ['none']), 'low', 'medium', 'high', ...(/opus/.test(model) ? ['max'] : [])], mandatory: claude.adaptive };
    }
    if (/^deepseek-(?:v4|flash)/.test(model)) return { supported: ['none', 'low', 'high', 'max'], mandatory: false };
    if (/^grok-(?:3-mini|4)/.test(model)) return { supported: /3-mini/.test(model) ? ['low', 'high'] : ['low', 'medium', 'high', ...(/4\.[6-9]/.test(model) ? ['xhigh'] : [])], mandatory: true };
    if (/^(?:gpt-oss|muse-spark)/.test(model)) return { supported: ['low', 'medium', 'high', ...(/muse-spark/.test(model) ? ['xhigh'] : [])], mandatory: true };
    if (/^qwen3\.8/.test(model)) return { supported: ['none', 'low', 'medium', 'high'], mandatory: false };
    return { supported: [], mandatory: /(?:deepseek-(?:r1|reasoner)|kimi-k2-thinking|:thinking$)/.test(model) };
}
function customEfforts(target) {
    const provider = providerOf(target), normalized = { ...target, model: modelName(target) };
    if (['openrouter', 'nanogpt'].includes(provider)) return gatewayContract(target).supported;
    if (isOpenAi(provider)) return openAiEfforts(normalized.model);
    if (provider === 'claude') return claudeContract(normalized).supported ? claudeContract(normalized).efforts : [];
    if (isGemini(provider)) {
        const contract = geminiContract(normalized);
        return contract.supported ? contract.efforts : inferredModel(target).supported;
    }
    if (provider === 'deepseek') return [...deepSeekEfforts(target), 'enabled'];
    if (provider === 'zai') return /glm-5\.3/.test(normalized.model) ? ['low', 'high', 'max', 'enabled'] : ['enabled'];
    if (provider === 'moonshot') return ['enabled'];
    if (['xai', 'groq'].includes(provider)) return inferredModel(target).supported;
    return [];
}
function customRequest(target, selected, effort) {
    const provider = providerOf(target), normalized = { ...target, model: modelName(target) };
    const efforts = customEfforts(target);
    if (selected !== 'none' && selected !== 'custom' && !efforts.includes(effort)) return fail('REASONING_UNSUPPORTED', 'This custom endpoint has no known native effort at this level. Use Custom to pass its exact effort.');
    let value = effort, body = {};
    if (selected === 'none' && ['xai', 'groq', 'claude', 'makersuite', 'vertexai'].includes(provider)) {
        const contract = inferredModel(target);
        value = contract.mandatory ? contract.supported[0] ?? '' : 'none';
    }
    if (selected === 'none' && isOpenAi(provider)) value = openAiEfforts(normalized.model)[0] ?? '';
    if (selected === 'none' && ['openrouter', 'nanogpt'].includes(provider)) {
        const contract = gatewayContract(target);
        value = contract.mandatory ? contract.lowest : 'none';
    }
    if (['openrouter', 'nanogpt'].includes(provider)) body = value ? { reasoning: { effort: value } } : {};
    else if (['zai', 'moonshot', 'deepseek'].includes(provider)) {
        const mandatory = mandatoryToggle(normalized) || provider === 'deepseek' && /deepseek-reasoner/.test(normalized.model);
        body = { thinking: { type: selected === 'none' && !mandatory ? 'disabled' : 'enabled' } };
        if (selected === 'none' && mandatory && provider === 'zai') value = inferredModel(target).supported[0] ?? '';
        if (value && !['none', 'enabled'].includes(value)) body.reasoning_effort = value;
    } else if (provider === 'custom' && selected === 'none') body = {};
    else if (value) body = { reasoning_effort: value };
    return { ok: true, data: { include_reasoning: selected !== 'none', reasoning_effort: '', custom_include_body: Object.keys(body).length ? JSON.stringify(body) : '' } };
}

/** Describe the efforts the installed adapter can represent for this route. */
export function reasoningOptions(target = {}) {
    if (customRoute(target)) {
        const efforts = customEfforts(target);
        const { mandatory, supported } = ['openrouter', 'nanogpt'].includes(providerOf(target)) ? gatewayContract(target) : inferredModel(target);
        return { options: ['none', ...efforts.filter(value => value !== 'none'), 'custom'].map(value => ({ value, label: labels[value] })), help: `${mandatory ? `This model always reasons. None requests ${supported[0] || 'the provider default'}. ` : ''}The custom chat endpoint receives native reasoning fields directly. ${efforts.length ? 'Levels are inferred from the public endpoint or model name; confirm support for this endpoint. ' : ''}Custom is forwarded exactly as a string.` };
    }
    if (providerOf(target) === 'xai' && xaiHostEfforts(target).length) return { options: ['none', ...xaiHostEfforts(target), 'custom'].map(value => ({ value, label: labels[value] })), help: 'This model always reasons. None requests low effort. The installed xAI adapter preserves only low and high; medium, xhigh and other custom levels cannot be represented.' };
    if (providerOf(target) === 'groq') return { options: ['none', 'custom'].map(value => ({ value, label: labels[value] })), help: `${inferredModel(target).mandatory ? 'This model always reasons at its provider default. ' : ''}The installed Groq adapter does not forward reasoning effort; custom effort cannot be represented. A custom chat endpoint can forward native efforts directly.` };
    if (isGemini(providerOf(target)) && geminiContract(target).supported) {
        const { efforts, help } = geminiContract(target);
        return { options: ['none', ...efforts, 'custom'].map(value => ({ value, label: labels[value] })), help };
    }
    if (providerOf(target) === 'claude' && claudeContract(target).supported) {
        const { adaptive, efforts } = claudeContract(target);
        return { options: ['none', ...efforts, 'custom'].map(value => ({ value, label: labels[value] })), help: adaptive ? 'This model always reasons. None requests low adaptive effort. The installed adapter supports low, medium, high, max; Adaptive uses high. Other native efforts and custom budgets cannot be represented.' : 'Enabled requests the minimum thinking budget. Low/medium/high/max are host budget presets; Claude 4.6 adaptive behavior depends on the host setting. None disables optional thinking. Custom token budgets cannot be represented by the installed adapter.' };
    }
    if (providerOf(target) === 'deepseek') return { options: ['none', ...deepSeekEfforts(target), 'enabled', 'custom'].map(value => ({ value, label: labels[value] })), help: `${/deepseek-reasoner/.test(target.model ?? '') ? 'This model always reasons. None keeps mandatory thinking enabled. ' : ''}DeepSeek supports a thinking switch; current models also accept their native effort levels. Custom effort is forwarded exactly.` };
    if (toggleProvider(providerOf(target))) return { options: ['none', 'enabled', 'custom'].map(value => ({ value, label: labels[value] })), help: `${mandatoryToggle(target) ? 'This model always reasons. None keeps its mandatory thinking enabled. ' : ''}The installed adapter supports only enabled/disabled thinking; it cannot forward native effort levels or custom budgets.` };
    if (isOpenAi(providerOf(target)) && openAiHostModels.has(target.model)) {
        const efforts = openAiEfforts(target.model);
        return { options: ['none', ...efforts.filter(value => value !== 'none'), 'custom'].map(value => ({ value, label: labels[value] })), help: efforts.includes('none') ? 'Reasoning efforts depend on the selected OpenAI model.' : `This model always reasons. None requests the lowest supported effort (${efforts[0]}).` };
    }
    if (providerOf(target) === 'nanogpt') {
        const { supported, mandatory, lowest } = gatewayContract(target);
        return { options: ['none', ...supported.filter(value => value !== 'none'), 'custom'].map(value => ({ value, label: labels[value] })), help: `${mandatory ? `This model always reasons. None requests ${lowest || 'the provider default'}. ` : ''}The installed NanoGPT adapter preserves five native efforts: none, minimal, low, medium, high. Native xhigh, max, and other custom values cannot be represented. Choices depend on known model support.` };
    }
    if (providerOf(target) === 'openrouter') {
        const { supported, mandatory, lowest } = gatewayContract(target);
        return { options: ['none', ...supported.filter(value => value !== 'none'), 'custom'].map(value => ({ value, label: labels[value] })), help: mandatory ? `This model always reasons. None requests the lowest supported effort (${lowest || 'provider default'}).` : 'OpenRouter forwards the exact effort. Availability depends on the selected model and provider.' };
    }
    return { options: ['none', 'custom'].map(value => ({ value, label: labels[value] })), help: `${inferredModel(target).mandatory ? 'This model always reasons at its provider default. None cannot disable its reasoning through this adapter. ' : ''}This provider or model has no reasoning controls supported by the installed adapter. Custom requires an adapter that preserves the value.` };
}

/** Produce only owned SillyTavern request overrides, without changing host settings. */
export function reasoningRequestOverrides(target = {}, controls = {}) {
    const selected = controls.reasoningEffort ?? 'none';
    if (selected === 'custom' && (typeof controls.reasoningCustom !== 'string' || !controls.reasoningCustom.trim() || controls.reasoningCustom.length > 128)) {
        return fail('INVALID_REASONING_CUSTOM', 'Custom reasoning must contain 1–128 characters.');
    }
    if (target.api === 'textgenerationwebui') return controls.reasoningEffort && controls.reasoningEffort !== 'none'
        ? fail('REASONING_UNSUPPORTED', 'The installed text completion adapter has no reasoning control.')
        : { ok: true, data: {} };
    const effort = selected === 'custom' ? controls.reasoningCustom : selected;
    if (customRoute(target)) return customRequest(target, selected, effort);
    if (providerOf(target) === 'xai' && xaiHostEfforts(target).length) {
        if (selected !== 'none' && !xaiHostEfforts(target).includes(effort)) return fail('REASONING_UNSUPPORTED', 'The installed xAI adapter preserves only low and high effort.');
        return { ok: true, data: { include_reasoning: selected !== 'none', reasoning_effort: selected === 'none' ? 'low' : effort } };
    }
    if (isGemini(providerOf(target)) && geminiContract(target).supported) {
        const { levels, minimum, efforts } = geminiContract(target);
        if (selected === 'custom' && (!levels || !efforts.filter(value => value !== 'adaptive').includes(effort)) || selected !== 'custom' && effort !== 'none' && !efforts.includes(effort)) return fail('REASONING_UNSUPPORTED', 'The installed Gemini adapter cannot preserve this custom effort or token budget.');
        return { ok: true, data: { include_reasoning: effort !== 'none', reasoning_effort: effort === 'none' ? minimum : effort === 'minimal' ? 'min' : ['enabled', 'adaptive'].includes(effort) ? 'auto' : effort } };
    }
    if (providerOf(target) === 'claude' && claudeContract(target).supported) {
        const { adaptive, efforts } = claudeContract(target);
        if (selected === 'custom' && (!adaptive || !['low', 'medium', 'high', 'max'].includes(effort)) || selected !== 'custom' && effort !== 'none' && !efforts.includes(effort)) return fail('REASONING_UNSUPPORTED', 'The installed Claude adapter cannot preserve this custom effort or token budget.');
        return { ok: true, data: { include_reasoning: effort !== 'none', reasoning_effort: effort === 'none' ? adaptive ? 'low' : 'auto' : effort === 'enabled' ? 'min' : effort === 'adaptive' ? 'high' : effort } };
    }
    if (providerOf(target) === 'deepseek') {
        if (selected !== 'custom' && !['none', 'enabled', ...deepSeekEfforts(target)].includes(effort)) return fail('REASONING_UNSUPPORTED', 'This effort is not available for the selected DeepSeek model.');
        return { ok: true, data: { include_reasoning: selected === 'custom' || /deepseek-reasoner/.test(target.model ?? '') || effort !== 'none', reasoning_effort: selected !== 'custom' && ['none', 'enabled'].includes(effort) ? '' : effort } };
    }
    if (toggleProvider(providerOf(target))) {
        if (selected === 'custom' ? !['enabled', 'disabled'].includes(effort) || mandatoryToggle(target) && effort === 'disabled' : !['none', 'enabled'].includes(effort)) return fail('REASONING_UNSUPPORTED', 'The installed adapter supports a thinking toggle, not custom effort levels or budgets.');
        return { ok: true, data: { include_reasoning: mandatoryToggle(target) || effort === 'enabled', reasoning_effort: '' } };
    }
    if (isOpenAi(providerOf(target)) && openAiHostModels.has(target.model)) {
        const efforts = openAiEfforts(target.model);
        if (effort === 'none' || selected === 'custom' || efforts.includes(effort)) {
            if (selected === 'custom' && (effort === 'min' || effort === 'none' && !efforts.includes('none'))) return fail('REASONING_UNSUPPORTED', 'The installed OpenAI adapter would rewrite this custom effort. Use a native spelling supported by this model.');
            if (selected === 'custom' && target.model === 'gpt-5.3-chat-latest' && effort !== 'medium') return fail('REASONING_UNSUPPORTED', 'The installed adapter fixes this model to medium reasoning.');
            return { ok: true, data: { include_reasoning: effort !== 'none', reasoning_effort: effort === 'none' ? efforts[0] : effort } };
        }
    }
    if (providerOf(target) === 'nanogpt') {
        const { supported, mandatory, lowest } = gatewayContract(target);
        if (selected !== 'none' && (!Object.hasOwn(nanoHostEfforts, effort) || selected !== 'custom' && !supported.includes(effort))) return fail('REASONING_UNSUPPORTED', 'The installed NanoGPT adapter cannot preserve this native effort. Supported values are none, minimal, low, medium, high, subject to model support.');
        const native = selected === 'none' && mandatory ? lowest : effort;
        return { ok: true, data: { include_reasoning: selected !== 'none', reasoning_effort: nanoHostEfforts[native] ?? '' } };
    }
    if (providerOf(target) === 'openrouter') {
        const { supported, mandatory, lowest } = gatewayContract(target);
        if (selected === 'custom' || selected === 'none' || supported.includes(selected)) {
            return { ok: true, data: { include_reasoning: selected !== 'none', reasoning_effort: selected === 'custom' ? controls.reasoningCustom : selected === 'none' && mandatory ? lowest : selected } };
        }
    }
    if (selected !== 'none') return fail('REASONING_UNSUPPORTED', 'The installed adapter cannot represent this reasoning value.');
    return { ok: true, data: disabled() };
}
