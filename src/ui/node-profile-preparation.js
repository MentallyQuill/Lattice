import { ACTIVE_PROFILE_ID, ACTIVE_PROFILE_NAME, activeModelMetadata } from '../workflow/model-profiles.js?v=0.27.2';
const profileName = value => typeof value === 'string' ? value : '';
const text = value => typeof value === 'string' ? value.slice(0, 256) : '';
/** Public display metadata only; never a saved profile, endpoint or request binding. */
export function prepareNodeProfileOptions(profiles = [], activeModel = null) {
    const options = [{ value: ACTIVE_PROFILE_ID, label: ACTIVE_PROFILE_NAME, apiLabel: text(activeModel?.apiLabel), model: text(activeModel?.model), active: true }], seen = new Set([ACTIVE_PROFILE_ID]);
    for (const profile of profiles) {
        const value = text(profile?.id); if (!value || seen.has(value)) continue; seen.add(value);
        options.push({ value, label: profileName(profile.name) || value, apiLabel: text(profile.apiLabel) || text(profile.api), model: text(profile.model), active: false });
    }
    return options;
}
/** Detect fixed-profile display metadata even when execution policy disallows it. */
export function readNodeProfileMetadata(context, profiles = []) {
    return profiles.map(profile => {
        const route = context.CONNECT_API_MAP?.[profile.api]; let model = text(profile.model);
        if (!model && route?.selected === 'openai') {
            try {
                const manager = profile.preset && context.getPresetManager?.('openai');
                let preset = manager?.getCompletionPresetByName?.(profile.preset);
                if (preset === undefined && manager) {
                    const list = manager.getPresetList?.(), names = list?.preset_names;
                    const index = Array.isArray(names) ? names.indexOf(profile.preset) : names?.[profile.preset];
                    preset = index !== undefined && index >= 0 ? list?.presets?.[index] : null;
                }
                if (!profile.preset || preset) model = text(context.getChatCompletionModel?.({ ...context.chatCompletionSettings, ...preset, chat_completion_source: route.source }));
            } catch { /* Unknown metadata remains absent; execution decides availability. */ }
        }
        if (!model && route?.selected === 'textgenerationwebui' && context.textCompletionSettings?.type === route.type) {
            model = text(activeModelMetadata({ mainApi: 'textgenerationwebui', textCompletionSettings: context.textCompletionSettings, CONNECT_API_MAP: context.CONNECT_API_MAP })?.model);
        }
        return { id: text(profile.id), name: profileName(profile.name), api: text(profile.api), apiLabel: text(route?.label) || text(route?.name) || text(route?.source) || text(route?.type) || text(profile.api), model };
    });
}

/** Cheap public display dependencies; unchanged settings saves avoid host resolution. */
export function nodeProfileMetadataKey(context, profiles = []) {
    const models = settings => Object.entries(settings ?? {}).filter(([key, value]) => (key === 'type' || key === 'chat_completion_source' || /(?:^|_)model$/.test(key)) && (value === null || ['string', 'number', 'boolean'].includes(typeof value))).sort(([left], [right]) => left.localeCompare(right));
    const routes = Object.entries(context.CONNECT_API_MAP ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([id, route]) => [id, route?.selected, route?.source, route?.type, route?.label, route?.name]);
    return JSON.stringify([context.mainApi, models(context.chatCompletionSettings), models(context.textCompletionSettings), routes, profiles.map(profile => [profile?.id, profile?.name, profile?.api, profile?.model, profile?.preset, profile?.instruct])]);
}
