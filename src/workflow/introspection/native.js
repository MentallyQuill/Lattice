/** Native envelope adaptation; the portable engines receive only their declared settings. */
import { INTROSPECTION_OPERATIONS, describeIntrospection } from './nodes.js?v=0.27.3';
import { ownData } from './contracts.js?v=0.27.3';

const failure = (code, message) => ({ ok: false, error: { code, message } });
const finiteBounds = { min: -Number.MAX_VALUE, max: Number.MAX_VALUE, step: 'any' };
const integerBounds = {
    maxTokens: [1, 65536], targetTokens: [1, 65536], keepRecent: [0, 1000], inputCount: [2, 16], limit: [1, 64], steps: [1, 64],
};
const labels = {
    mode: 'Mode', maxTokens: 'Output tokens', instructions: 'Instructions', inputCount: 'Inputs', actorId: 'Actor ID', method: 'Method', targetTokens: 'Target tokens', keepRecent: 'Keep recent', pins: 'Pins', purpose: 'Purpose',
    view: 'View', query: 'Query', limit: 'Results', idempotencyKey: 'Commit key', updates: 'Values', min: 'Minimum', max: 'Maximum', curveId: 'Curve ID', steps: 'Steps', decay: 'Decay', baseline: 'Baseline', durations: 'Phase durations', trackId: 'Track ID',
};
const seeds = { 'context:perspective': { actorId: 'character' }, 'memory:commit': { idempotencyKey: 'lattice-memory-commit' } };
const presets = Object.fromEntries(INTROSPECTION_OPERATIONS.map(operation => [operation.id, Object.fromEntries(operation.modes.map(mode => {
    const result = describeIntrospection({ type: 'workflow', operation: operation.id, operationVersion: 1, mode, ...(seeds[`${operation.id}:${mode}`] ?? {}) });
    if (!result.ok) throw new Error(`Invalid native Introspection preset: ${operation.id}:${mode}`);
    return [mode, result.data];
}))]));

/** Detached semantic defaults for one mode; changing modes never carries old mode controls. */
export function introspectionDefaults(operation, mode = INTROSPECTION_OPERATIONS.find(entry => entry.id === operation)?.modes[0]) {
    if (!Object.hasOwn(presets, operation) || !Object.hasOwn(presets[operation], mode)) throw new Error('Unknown Introspection operation or mode.');
    return structuredClone(presets[operation][mode].descriptor.defaults);
}

/** Project a full native node without executing accessors or passing presentation/bindings.
 * @param {unknown} value
 * @returns {import('../types').Result<import('./nodes').IntrospectionNode>}
 */
export function projectIntrospectionNode(value) {
    try {
        if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return failure('INVALID_SETTINGS', 'Use plain native Introspection metadata.');
        const properties = Object.getOwnPropertyDescriptors(value);
        if (Reflect.ownKeys(properties).some(key => typeof key !== 'string' || !properties[key].enumerable || !Object.hasOwn(properties[key], 'value'))) return failure('INVALID_SETTINGS', 'Native Introspection metadata requires enumerable own data properties.');
        const own = key => properties[key]?.value;
        const operation = own('operation');
        if (own('type') !== 'workflow' || typeof operation !== 'string' || !Object.hasOwn(presets, operation)) return failure('UNKNOWN_OPERATION', 'Unknown Introspection operation.');
        if (own('operationVersion') !== undefined && own('operationVersion') !== 1) return failure('UNKNOWN_OPERATION', 'Unknown Introspection operation version.');
        const mode = own('mode') ?? INTROSPECTION_OPERATIONS.find(entry => entry.id === operation).modes[0];
        if (typeof mode !== 'string' || !Object.hasOwn(presets[operation], mode)) return failure('INVALID_SETTINGS', 'Select a supported Introspection mode.');
        const preset = presets[operation][mode].descriptor;
        const settings = Object.fromEntries(preset.controls.flatMap(key => {
            const value=own(key)===undefined?preset.defaults[key]:own(key);
            return value===undefined?[]:[[key,value]];
        }));
        const projected = ownData({ type: 'workflow', operation, operationVersion: 1, ...(own('id') !== undefined ? { id: own('id') } : {}), ...settings });
        if (!projected.ok) return failure('INVALID_SETTINGS', 'Introspection controls require bounded plain own data.');
        const checked = describeIntrospection(projected.data);
        return checked.ok ? { ok: true, data: projected.data } : checked;
    } catch { return failure('INVALID_SETTINGS', 'Native Introspection metadata could not be projected.'); }
}

function controlDescriptor(key, source, defaults, operation, phase) {
    const value = defaults[key];
    const type = key === 'pins' ? { type: 'array', items: 'string', max: 64 }
        : ['updates', 'durations'].includes(key) ? { type: 'object', max: key === 'updates' ? 32 : 5, editor: 'json' }
        : source.type === 'enum' ? { type: 'enum', values: source.values.filter(value => !(operation === 'memory' && phase === 'pre' && key === 'mode' && value === 'commit')) }
        : Object.hasOwn(integerBounds, key) ? { type: 'integer', min: integerBounds[key][0], max: integerBounds[key][1] }
        : typeof value === 'number' ? { type: 'number', ...(key === 'decay' ? { min: 0, max: 1, step: 0.01 } : finiteBounds) }
        : { type: 'string' };
    return { ...type, default: structuredClone(value === undefined ? source.default : value), label: labels[key] ?? key };
}

function nativeDescription(description, phase) {
    const source = description.descriptor;
    return { descriptor: { ...source, ...(phase ? { phase } : {}),
        ...(source.id === 'state' ? { requiresStateInDefinition: true } : {}),
        // A commit intent is host diagnostic output, never a routable artifact.
        output: source.terminal ? null : source.output,
        controlDescriptors: Object.fromEntries(source.controls.map(key => [key, controlDescriptor(key, source.controlDescriptors[key], source.defaults, source.id, phase)])),
    }, ports: description.ports.filter(port => !source.terminal || port.direction !== 'output').map(port => ({ ...port })) };
}

/** Native metadata always carries the actual containing phase, including package 'both'.
 * @param {unknown} node
 * @param {{phase?: 'pre'|'post'}} [options]
 * @returns {import('../types').Result<import('../types').OperationDescription>}
 */
export function describeNativeIntrospection(node, options = {}) {
    const checkedOptions = ownData(options);
    if (!checkedOptions.ok || !checkedOptions.data || typeof checkedOptions.data !== 'object' || Array.isArray(checkedOptions.data) || Object.keys(checkedOptions.data).some(key => key !== 'phase')) return failure('INVALID_SETTINGS', 'Use plain native Introspection phase options.');
    const phase = checkedOptions.data.phase ?? 'pre';
    const projected = projectIntrospectionNode(node);
    if (!projected.ok) return projected;
    const result = describeIntrospection(projected.data, { phase });
    return result.ok ? { ok: true, data: nativeDescription(result.data, phase) } : result;
}

/** Registration defaults retain 'both'; checked descriptions resolve the native graph phase. */
export const INTROSPECTION_NATIVE_OPERATIONS = Object.fromEntries(INTROSPECTION_OPERATIONS.map(operation => [operation.id, nativeDescription(presets[operation.id][operation.modes[0]]).descriptor]));
