import { cloneJsonValue } from './json-data.js?v=0.27.1';
import { own, plain, freeze } from '../record-data.js?v=0.27.1';
const failure = () => ({ ok: false, error: { code: 'INVALID_PATTERN_SETTINGS', message: 'Use bounded canonical Pattern rules, literal lists, scope, policy and execution limits.' } });
export const PATTERN_DEFAULTS = freeze({ mode: 'whole-word', scope: 'whole', caseSensitive: false, rules: [], exemptions: [], protectedLiterals: [], matchPolicy: 'any', minOccurrences: 1, regexFlags: '', timeoutMs: 1000 });
const enumeration = (key, values) => ({ type: 'enum', values, default: PATTERN_DEFAULTS[key] });
export const PATTERN_OPERATION = {
    id: 'pattern', title: 'Pattern', family: 'Derive', phase: 'post', minimumSchema: 3, input: 'draft', output: 'draft', controls: Object.keys(PATTERN_DEFAULTS), defaults: PATTERN_DEFAULTS, requestBound: 0, modelRole: null, terminal: false, dynamicPorts: true,
    controlDescriptors: {
        mode: enumeration('mode', ['literal', 'whole-word', 'regex']), scope: enumeration('scope', ['authorized', 'whole', 'narration', 'dialogue']), caseSensitive: { type: 'boolean', default: false },
        rules: { type: 'array', items: 'record', max: 128, default: [], editor: 'json' }, exemptions: { type: 'array', items: 'string', max: 128, default: [] }, protectedLiterals: { type: 'array', items: 'string', max: 128, default: [] }, matchPolicy: enumeration('matchPolicy', ['any', 'all']), minOccurrences: { type: 'integer', min: 1, max: 4096, default: 1 }, regexFlags: { type: 'string', default: '', maxLength: 2 }, timeoutMs: { type: 'integer', min: 100, max: 2000, default: 1000 },
    },
};
export function validatePatternSettings(input = {}) {
    try {
        if (!plain(input) || Reflect.ownKeys(input).some(key => !Object.hasOwn(PATTERN_DEFAULTS, key))) return failure();
        const checked = cloneJsonValue(input); if (!checked.ok) return failure();
        const settings = { ...PATTERN_DEFAULTS, ...checked.data.value };
        if (!['literal', 'whole-word', 'regex'].includes(settings.mode) || !['authorized', 'whole', 'narration', 'dialogue'].includes(settings.scope) || typeof settings.caseSensitive !== 'boolean' || !['any', 'all'].includes(settings.matchPolicy) || !Number.isSafeInteger(settings.minOccurrences) || settings.minOccurrences < 1 || settings.minOccurrences > 4096 || !Number.isSafeInteger(settings.timeoutMs) || settings.timeoutMs < 100 || settings.timeoutMs > 2000 || typeof settings.regexFlags !== 'string' || [...settings.regexFlags].some(flag => !'ms'.includes(flag)) || new Set(settings.regexFlags).size !== settings.regexFlags.length) return failure();
        if (!Array.isArray(settings.rules) || settings.rules.length > 128 || settings.rules.some(rule => !plain(rule) || Object.keys(rule).some(key => !['id', 'pattern', 'label'].includes(key)) || typeof rule.id !== 'string' || !rule.id.trim() || rule.id.length > 128 || typeof rule.pattern !== 'string' || !rule.pattern.length || rule.pattern.length > 2048 || rule.label !== undefined && (typeof rule.label !== 'string' || rule.label.length > 128)) || new Set(settings.rules.map(rule => rule.id)).size !== settings.rules.length) return failure();
        for (const key of ['exemptions', 'protectedLiterals']) if (!Array.isArray(settings[key]) || settings[key].length > 128 || settings[key].some(pin => typeof pin !== 'string' || !pin.trim() || pin.length > 2048)) return failure();
        return { ok: true, data: freeze(settings) };
    } catch { return failure(); }
}
export function patternSettingsForNode(node) {
    try {
        if (!plain(node)) return failure();
        const settings = {};
        for (const key of PATTERN_OPERATION.controls) {
            const property = Object.getOwnPropertyDescriptor(node, key);
            if (property && (!property.enumerable || !Object.hasOwn(property, 'value'))) return failure();
            if (property) settings[key] = property.value;
        }
        return validatePatternSettings(settings);
    } catch { return failure(); }
}
export function describePattern(node) {
    if (own(node, 'operation') !== 'pattern' || own(node, 'operationVersion') !== undefined && own(node, 'operationVersion') !== 1) return failure();
    if (own(node, 'phase') !== undefined && own(node, 'phase') !== 'post') return { ok: false, error: { code: 'INVALID_PHASE', message: 'Pattern requires post phase.' } };
    const settings = patternSettingsForNode(node); if (!settings.ok) return settings;
    const pin = (id, label, kind, direction, required = false) => ({ id, label, kind, direction, required, cardinality: 'one' });
    return { ok: true, data: { descriptor: PATTERN_OPERATION, ports: [pin('in', 'Draft', 'draft', 'input', true), pin('out', 'Draft', 'draft', 'output'), pin('matched', 'Matched', 'data', 'output'), pin('matches', 'Matches', 'data', 'output')] } };
}
