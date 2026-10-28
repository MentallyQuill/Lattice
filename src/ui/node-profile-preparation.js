import { ACTIVE_PROFILE_ID, ACTIVE_PROFILE_NAME, activeModelMetadata } from '../workflow/model-profiles.js?v=0.29.1';
import { reasoningProviderHint } from '../workflow/reasoning.js?v=0.29.1';
const profileName = value => typeof value === 'string' ? value : '';
const text = value => typeof value === 'string' ? value.slice(0, 256) : '';
/** Public display metadata only; never a saved profile, endpoint or request binding. */
export function prepareNodeProfileOptions(profiles = [], activeModel = null) {
    const options = [{ value: ACTIVE_PROFILE_ID, label: ACTIVE_PROFILE_NAME, api: text(activeModel?.transport) || text(activeModel?.api), source: text(activeModel?.source) || text(activeModel?.api), ...(activeModel?.reasoningProvider ? {reasoningProvider:activeModel.reasoningProvider} : {}), apiLabel: text(activeModel?.apiLabel), model: text(activeModel?.model), active: true }], seen = new Set([ACTIVE_PROFILE_ID]);
    for (const profile of profiles) {
        const value = text(profile?.id); if (!value || seen.has(value)) continue; seen.add(value);
        options.push({ value, label: profileName(profile.name) || value, api: text(profile.api), source: text(profile.source) || text(profile.api), ...(profile.reasoningProvider ? {reasoningProvider:profile.reasoningProvider} : {}), apiLabel: text(profile.apiLabel) || text(profile.api), model: text(profile.model), active: false });
    }
    return options;
}
function profilePreset(context, profile) {
    if (!profile.preset) return {};
    try {
        const manager = context.getPresetManager?.('openai');
        let preset = manager?.getCompletionPresetByName?.(profile.preset);
        if (preset === undefined && manager) {
            const list = manager.getPresetList?.(), names = list?.preset_names;
            const index = Array.isArray(names) ? names.indexOf(profile.preset) : names?.[profile.preset];
            preset = index !== undefined && index >= 0 ? list?.presets?.[index] : null;
        }
        return preset;
    } catch { return null; }
}
function profileReasoningProvider(context, profile, route, preset) {
    if (route?.selected !== 'openai' || route.source !== 'custom') return undefined;
    return reasoningProviderHint(profile['api-url'] || (preset ?? profilePreset(context,profile))?.custom_url || context.chatCompletionSettings?.custom_url);
}
/** Detect fixed-profile display metadata even when execution policy disallows it. */
export function readNodeProfileMetadata(context, profiles = []) {
    return profiles.map(profile => {
        const route = context.CONNECT_API_MAP?.[profile.api]; let model = text(profile.model), preset;
        if (route?.selected === 'openai' && (!model || route.source === 'custom')) {
            try {
                preset = profilePreset(context,profile);
                if (!model && (!profile.preset || preset)) model = text(context.getChatCompletionModel?.({ ...context.chatCompletionSettings, ...preset, chat_completion_source: route.source }));
            } catch { /* Unknown metadata remains absent; execution decides availability. */ }
        }
        if (!model && route?.selected === 'textgenerationwebui' && context.textCompletionSettings?.type === route.type) {
            model = text(activeModelMetadata({ mainApi: 'textgenerationwebui', textCompletionSettings: context.textCompletionSettings, CONNECT_API_MAP: context.CONNECT_API_MAP })?.model);
        }
        const reasoningProvider = profileReasoningProvider(context,profile,route,preset);
        return { id: text(profile.id), name: profileName(profile.name), api: text(route?.selected) || text(profile.api), source: text(route?.source) || text(route?.type) || text(profile.api), ...(reasoningProvider ? {reasoningProvider} : {}), apiLabel: text(route?.label) || text(route?.name) || text(route?.source) || text(route?.type) || text(profile.api), model };
    });
}

/** Cheap public display dependencies; unchanged settings saves avoid host resolution. */
export function nodeProfileMetadataKey(context, profiles = []) {
    const models = settings => Object.entries(settings ?? {}).filter(([key, value]) => (key === 'type' || key === 'chat_completion_source' || /(?:^|_)model$/.test(key)) && (value === null || ['string', 'number', 'boolean'].includes(typeof value))).sort(([left], [right]) => left.localeCompare(right));
    const routes = Object.entries(context.CONNECT_API_MAP ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([id, route]) => [id, route?.selected, route?.source, route?.type, route?.label, route?.name]);
    const activeReasoningProvider = context.chatCompletionSettings?.chat_completion_source === 'custom' ? reasoningProviderHint(context.chatCompletionSettings.custom_url) : undefined;
    return JSON.stringify([context.mainApi, models(context.chatCompletionSettings), models(context.textCompletionSettings), routes, activeReasoningProvider, profiles.map(profile => [profile?.id, profile?.name, profile?.api, profile?.model, profile?.preset, profile?.instruct, profileReasoningProvider(context,profile,context.CONNECT_API_MAP?.[profile?.api])])]);
}
