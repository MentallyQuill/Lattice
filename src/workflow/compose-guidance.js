import { plain, dense, own } from './record-data.js?v=0.27.2';

const field = (value, key, fallback) => Object.hasOwn(value, key) ? own(value, key) : fallback;
const failure = (code, message) => ({ ok: false, error: { code, message } });
function record(value) {
    if (!plain(value)) throw Error('Plain record required.');
    const fields = Object.setPrototypeOf(Object.getOwnPropertyDescriptors(value), null);
    if (Reflect.ownKeys(value).some(key => typeof key !== 'string') || Object.values(fields).some(field => !field.enumerable || !Object.hasOwn(field, 'value'))) throw Error('Own data required.');
    return fields;
}
/** Resolve adapter sections without copying original artifact identities or invoking getters. */
export function resolveComposeContributions(settings, inputs = {}, inputStates = {}) {
    try {
        record(settings); const artifacts = record(inputs), states = record(inputStates);
        for (const [portId, descriptor] of Object.entries(states)) {
            const state = descriptor.value; record(state);
            if (!['completed', 'skipped', 'unresolved'].includes(own(state, 'status'))) throw Error('Invalid input state.');
            if (own(state, 'status') === 'unresolved') return failure('INPUT_UNRESOLVED', 'Connected Compose source is unresolved: ' + portId);
        }
        const source = own(settings, 'sections') ?? [];
        if (!dense(source, 64)) return failure('INVALID_SETTINGS', 'Use at most 64 dense Compose sections.');
        const sections = [], contributions = [], originals = [];
        const names = new Set(), allowed = new Set(['data']);
        for (let index = 0; index < source.length; index++) {
            const section = source[index]; record(section);
            if (Object.keys(section).some(key => !['name', 'text', 'kind', 'required', 'onSkipped'].includes(key))) throw Error('Invalid section.');
            const name = own(section, 'name'), fallback = own(section, 'text'), kind = field(section, 'kind', 'text'), required = field(section, 'required', false), onSkipped = field(section, 'onSkipped', 'fallback');
            if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name) || names.has(name) || typeof fallback !== 'string' || fallback.length > 100000 || !['text', 'guidance'].includes(kind) || typeof required !== 'boolean' || !['fallback', 'omit'].includes(onSkipped)) throw Error('Invalid section.');
            names.add(name); const portId = 'section.' + name; allowed.add(portId);
            const state = states[portId]?.value;
            const status = own(state ?? {}, 'status');
            if (required && status === 'skipped') return failure('INPUT_SKIPPED', 'Required Compose source was skipped: ' + portId);
            const artifact = artifacts[portId]?.value;
            let text = fallback, contribution = 'fallback';
            if (status === 'skipped' && onSkipped === 'omit') { text = ''; contribution = 'omitted'; }
            else if (artifact !== undefined) {
                record(artifact);
                if (own(artifact, 'kind') !== kind || typeof own(artifact, 'text') !== 'string' || own(artifact, 'text').length > 100000) return failure('INVALID_INPUT', 'Compose source requires bounded ' + kind + ': ' + portId);
                text = own(artifact, 'text'); contribution = 'completed';
            } else if (required || status === 'completed') return failure('MISSING_INPUT', 'Required or completed Compose source is missing: ' + portId);
            if (contribution !== 'omitted' || own(settings, 'mode') === 'template') sections.push({ name, text });
            contributions.push({ portId, name, kind, status: contribution, length: text.length });
        }
        for (const key of [...Object.keys(artifacts), ...Object.keys(states)]) if (!allowed.has(key)) return failure('UNSUPPORTED_INPUT', 'Unsupported or stale input: ' + key);
        for (const key of [...contributions.map(contribution => contribution.portId), 'data']) if (Object.hasOwn(artifacts, key)) { const artifact = artifacts[key].value; record(artifact); originals.push(artifact); }
        return { ok: true, data: { sections, contributions, originals } };
    } catch { return failure('INVALID_INPUTS', 'Use plain Compose records with own data properties.'); }
}
