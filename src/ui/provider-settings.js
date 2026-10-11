import { cloneJsonValue } from '../workflow/operations/json-data.js?v=0.26.0';
const fail = (code, message) => ({ ok: false, error: { code, message } });
const fallbackCodes = ['REQUEST_FAILED', 'SERVICE_UNAVAILABLE', 'RATE_LIMITED', 'PROVIDER_OVERLOADED', 'AUTH_MISSING', 'HTTP_ERROR', 'INVALID_FAST_RESPONSE'];
/** Selectors retain no routes, credentials or request authority. */
export function fastConnectionChoices(snapshot) {
    const checked = cloneJsonValue(snapshot);
    if (!checked.ok || checked.data.value?.ok !== true || !Array.isArray(checked.data.value.data?.connections)) return [];
    return checked.data.value.data.connections.flatMap(item => typeof item?.id === 'string' && typeof item?.model === 'string' && ['jev', 'laya', 'compatible'].includes(item.provider) ? [{ value: item.id, label: [item.label || item.id, item.provider, item.model].join(' · ') }] : []);
}
export function fastFallbackAllowed(node, response) {
    return node.fallbackEnabled === true && fallbackCodes.includes(response?.error?.code) && Array.isArray(node.fallbackAllowedCodes) && node.fallbackAllowedCodes.includes(response.error.code);
}
/** Match runtime's separately selected fallback profile and its default model. */
export const fastFallbackNode = node => ({ ...node, modelRole: 'decision', profileId: node.fallbackProfileId, model: null });
export function checkFastSettingsScope(registry, expectedUserId) {
    try {
        const current = registry?.snapshot();
        return current?.ok && typeof expectedUserId === 'string' && current.data.userId === expectedUserId ? current : fail('FAST_SCOPE_CHANGED', 'The active user changed. Reopen Fast connections before editing.');
    } catch { return fail('FAST_SETTINGS_UNAVAILABLE', 'Fast connection settings are unavailable.'); }
}
export function fastSettingsPersistence(saved, confirmed, unconfirmed) {
    if (saved?.ok !== true && saved?.error?.code === 'BINDING_CHANGED') return fail('BINDING_CHANGED', 'Fast connection settings changed while saving. Reopen this panel to review the current configuration.');
    return { ok: true, data: { message: saved?.ok === true && saved.data?.acknowledged === true ? confirmed : unconfirmed } };
}
/** Configuration and the optional password remain separate; only setCredential receives the key. */
export async function saveFastConnection(registry, configuration, sessionKey = '', expectedUserId) {
    try {
        const scoped = checkFastSettingsScope(registry, expectedUserId); if (!scoped.ok) return scoped;
        const updated = registry.upsert(configuration); if (!updated?.ok) return fail('INVALID_FAST_CONNECTION', 'Choose a named model and a valid HTTPS or loopback /v1/systemone route.');
        if (sessionKey !== '') {
            const scopedKey = checkFastSettingsScope(registry, expectedUserId); if (!scopedKey.ok) return scopedKey;
            const keyed = registry.setCredential(configuration.id, sessionKey); if (!keyed?.ok) return fail('INVALID_CREDENTIAL', 'The session API key could not be applied. Enter a nonempty key without line breaks.');
        }
        const saved = await registry.save();
        const current = checkFastSettingsScope(registry, expectedUserId); if (!current.ok) return current;
        const persistence = fastSettingsPersistence(saved, 'Configuration saved in SillyTavern. API keys remain in this session.', 'Configuration applied locally; SillyTavern save is unconfirmed. API keys remain in this session.');
        return persistence.ok ? { ok: true, data: { state: current.data, ...persistence.data } } : persistence;
    } catch { return fail('FAST_SETTINGS_FAILED', 'Fast connection settings could not be updated.'); }
}
