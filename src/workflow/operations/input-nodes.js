import { freeze } from '../record-data.js?v=0.27.1';
/** Source operations emit saved Text; host Prompt Source dispatch lives in the runtime. */
const registration = (id, title, defaults, controlDescriptors, extra = {}) => ({
    id, title, family: 'Input', phase: 'both', operationVersion: 1,
    minimumSchema: 3, minimumRuntime: 2, input: null, output: 'text',
    controls: Object.keys(defaults), defaults, controlDescriptors,
    requestBound: 0, modelRole: null, terminal: false, dynamicPorts: true, ...extra,
});
export const INPUT_OPERATIONS = {
    text: registration('text', 'Text', { text: '' }, {
        text: { type: 'string', label: 'Text', editor: 'text', default: '', multiline: true, maxLength: 100000 },
    }),
    'file-input': registration('file-input', 'File Input', { fileName: '', content: '', loaded: false }, {
        fileName: { type: 'string', label: 'File name', default: '', maxLength: 255, hidden: true, exposable: false },
        content: { type: 'string', label: 'Content', default: '', maxLength: 100000, hidden: true, exposable: false },
        loaded: { type: 'boolean', label: 'Loaded', default: false, hidden: true, exposable: false },
    }),
    'prompt-source': registration('prompt-source', 'Prompt Source', { source: 'system', promptId: 'main', form: 'raw' }, {
        source: { type: 'enum', label: 'Source', values: ['system', 'prompt-entry'], default: 'system' },
        promptId: { type: 'string', label: 'Prompt ID', default: 'main', maxLength: 200, visibleWhen: { key: 'source', value: 'prompt-entry' } },
        form: { type: 'enum', label: 'Form', values: ['raw', 'resolved'], default: 'raw', help: 'Raw keeps the template. Resolved expands pure name and formatting macros; use Raw for structured text with braces or broader macro syntax.' },
    }, { rootOnly: true }),
};
freeze(INPUT_OPERATIONS);
const failure = (code, message) => ({ ok: false, error: { code, message } });

function plainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function ownValue(value, key, fallback) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property) return fallback;
    if (!property.enumerable || !Object.hasOwn(property, 'value')) throw new Error('Use own enumerable data properties.');
    return property.value;
}
function resolveInput(node, options) {
    try {
        if (!plainObject(node) || !plainObject(options)) return failure('INVALID_SETTINGS', 'Input node and options must be plain objects.');
        const operation = ownValue(node, 'operation');
        const version = ownValue(node, 'operationVersion');
        const type = ownValue(node, 'type');
        if (typeof operation !== 'string' || !Object.hasOwn(INPUT_OPERATIONS, operation) || version !== undefined && version !== 1 || type !== undefined && type !== 'workflow') return failure('UNKNOWN_OPERATION', 'Unknown Input operation or version.');
        const nodePhase = ownValue(node, 'phase');
        const suppliedPhase = ownValue(options, 'phase');
        const phase = suppliedPhase === undefined ? nodePhase : suppliedPhase;
        if (!['pre', 'post'].includes(phase) || nodePhase !== undefined && nodePhase !== phase) return failure('INVALID_PHASE', 'An effective matching pre or post phase is required.');
        const base = INPUT_OPERATIONS[operation];
        const settings = Object.fromEntries(base.controls.map(key => [key, ownValue(node, key, base.defaults[key])]));
        for (const [key, control] of Object.entries(base.controlDescriptors)) {
            if (control.type === 'enum' ? !control.values.includes(settings[key]) : typeof settings[key] !== control.type || control.type === 'string' && settings[key].length > control.maxLength) return failure('INVALID_SETTINGS', 'Use supported Input controls and bounded values.');
        }
        if (base.id === 'prompt-source' && !settings.promptId.trim()) return failure('INVALID_SETTINGS', 'Prompt Source requires a nonblank stable prompt identifier.');
        return { ok: true, data: {
            descriptor: { ...base, phase },
            ports: [{ id: 'out', label: 'Text', direction: 'output', kind: 'text', required: false, cardinality: 'one' }],
            settings,
        } };
    } catch { return failure('INVALID_SETTINGS', 'Use plain Input settings with own data properties.'); }
}
/** @returns {import('../types').Result<import('../types').OperationDescription>} */
export function describeInput(node, options = {}) {
    const result = resolveInput(node, options);
    if (!result.ok) return result;
    const { descriptor, ports } = result.data;
    return { ok: true, data: { descriptor, ports } };
}

/** @returns {import('./input-nodes').InputExecutionResult} */
export function executeInput(node, options = {}) {
    const result = resolveInput(node, options);
    if (!result.ok) return result;
    if (result.data.descriptor.id === 'prompt-source') return failure('HOST_SOURCE_REQUIRED', 'Prompt Source requires an active host template snapshot.');
    if (result.data.descriptor.id === 'file-input' && !result.data.settings.loaded) return failure('FILE_UNAVAILABLE', 'Load a file snapshot before executing File Input.');
    return { ok: true, artifact: { kind: 'text', text: result.data.descriptor.id === 'file-input' ? result.data.settings.content : result.data.settings.text }, reports: [] };
}
