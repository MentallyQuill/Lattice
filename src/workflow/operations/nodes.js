import { freeze } from '../record-data.js?v=0.27.2';
import { preserveArtifactPrivacy, validVisibilityMetadata } from '../artifact-privacy.js?v=0.27.2';
import { resolveComposeContributions } from '../compose-guidance.js?v=0.27.2';
import { composeText } from './compose.js?v=0.27.2';
import { selectFields } from './select-fields.js?v=0.27.2';
import { cloneJsonValue } from './json-data.js?v=0.27.2';
import { decodeJson } from './json-decode.js?v=0.27.2';
import { applyTextRules, createDraftRulePatches } from './text-rules.js?v=0.27.2';

const enumControl = (key, label, options) => ({ key, label, type: 'enum', options });
const textControl = (key, label) => ({ key, label, type: 'text' });
const jsonControl = (key, label) => ({ key, label, type: 'json' });
const registration = (id, title, family, input, output, defaults, controlDescriptors) => ({
    id, title, family, phase: 'both', input, output, controls: Object.keys(defaults), controlDescriptors,
    defaults, requestBound: 0, modelRole: null, terminal: false, dynamicPorts: true,
});

/** Static integration metadata; effective mode and phase are resolved by describePrimitive. */
export const PRIMITIVE_OPERATIONS = {
    compose: registration('compose', 'Compose', 'Shaping', null, 'text',
        { mode: 'join', outputKind: 'text', template: '', sections: [], separator: '\n\n', budgetTokens: 0 },
        [enumControl('mode', 'Mode', ['join', 'template']), enumControl('outputKind', 'Output', ['text', 'guidance']), textControl('template', 'Template'), jsonControl('sections', 'Sections'), textControl('separator', 'Separator'), { key: 'budgetTokens', label: 'Token budget', type: 'integer', minimum: 0, maximum: 8192 }]),
    'text-rules': registration('text-rules', 'Text Rules', 'Surface', 'text', 'text',
        { inputKind: 'text', mode: 'replace', rules: [], separator: '\n', scope: 'authorized', protectedLiterals: [] },
        [enumControl('inputKind', 'Input', ['text', 'draft']), enumControl('mode', 'Mode', ['replace', 'extract']), jsonControl('rules', 'Rules'), textControl('separator', 'Separator'), enumControl('scope', 'Draft scope', ['authorized', 'whole', 'narration', 'dialogue']), jsonControl('protectedLiterals', 'Protected Draft wording')]),
    'json-decode': registration('json-decode', 'JSON Decode', 'Derive', 'text', 'data',
        { mode: 'parse', schema: '' }, [enumControl('mode', 'Mode', ['parse', 'check']), jsonControl('schema', 'Schema')]),
    'select-fields': registration('select-fields', 'Select Fields', 'Derive', 'data', 'data',
        { fields: [] }, [jsonControl('fields', 'Fields')]),
};
freeze(PRIMITIVE_OPERATIONS);
const failure = (code, message) => ({ ok: false, error: { code, message } });
function plainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function ownValue(value, key, fallback) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property) return fallback;
    if (!Object.hasOwn(property, 'value') || !property.enumerable) throw new Error('Use own enumerable data properties.');
    return property.value;
}
const port = (id, label, direction, kind, required = false) => ({ id, label, direction, kind, required, cardinality: 'one' });

function ownRecord(value, allowed, preservePrototype = false) {
    if (!plainObject(value)) throw new Error('Use a plain object.');
    const output = Object.create(preservePrototype ? Object.getPrototypeOf(value) : null);
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string' || (allowed && !allowed.includes(key))) throw new Error('Unsupported field.');
        Object.defineProperty(output, key, { value: ownValue(value, key), enumerable: true, writable: true, configurable: true });
    }
    return output;
}
function ownArray(value, limit, map) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error('Use a dense array.');
    const length = Object.getOwnPropertyDescriptor(value, 'length').value;
    if (length > limit || Reflect.ownKeys(value).length !== length + 1) throw new Error('Array exceeds its limit or contains extra fields.');
    return Array.from({ length }, (_, index) => {
        if (!Object.hasOwn(value, String(index))) throw new Error('Use a dense array.');
        return map(ownValue(value, String(index)));
    });
}
function validateSettings(operation, settings) {
    const invalid = () => failure('INVALID_SETTINGS', 'Use supported primitive controls and bounded values.');
    if (operation === 'compose') {
        if (!['join', 'template'].includes(settings.mode) || !['text', 'guidance'].includes(settings.outputKind) || typeof settings.template !== 'string' || settings.template.length > 100000) return invalid();
        if (!Number.isSafeInteger(settings.budgetTokens) || settings.budgetTokens < 0 || settings.budgetTokens > 8192) return invalid();
        // Read sections through descriptors; validation must never run a section getter.
        settings.sections = ownArray(settings.sections, 64, section => { const parsed = ownRecord(section, ['name', 'text', 'kind', 'required', 'onSkipped']); if (!['text', 'guidance'].includes(ownValue(parsed, 'kind', 'text')) || typeof (ownValue(parsed, 'required', false)) !== 'boolean' || !['fallback', 'omit'].includes(ownValue(parsed, 'onSkipped', 'fallback'))) throw new Error('Invalid section controls.'); return parsed; });
        const checked = composeText({ template: '', sections: settings.sections.map(({ name, text }) => ({ name, text })), separator: settings.separator });
        if (!checked.ok) return checked;
    } else if (operation === 'text-rules') {
        if (!['text', 'draft'].includes(settings.inputKind) || !['replace', 'extract'].includes(settings.mode) || typeof settings.separator !== 'string' || settings.separator.length > 100000) return invalid();
        if (!['authorized', 'whole', 'narration', 'dialogue'].includes(settings.scope)) return invalid();
        settings.protectedLiterals = ownArray(settings.protectedLiterals, 128, pin => {
            if (typeof pin !== 'string' || !pin.trim() || pin.length > 2048) throw new Error('Invalid protected literal.');
            return pin;
        });
        settings.rules = ownArray(settings.rules, 64, value => {
            const rule = ownRecord(value, ['kind', 'pattern', 'replacement', 'flags']);
            const flags = Object.hasOwn(rule, 'flags') ? rule.flags : '';
            if (!['literal', 'regex'].includes(rule.kind) || typeof rule.pattern !== 'string' || !rule.pattern.length || rule.pattern.length > 2048 || typeof flags !== 'string' || [...flags].some(flag => !(rule.kind === 'regex' ? 'imsu' : 'iu').includes(flag)) || new Set(flags).size !== flags.length || (Object.hasOwn(rule, 'replacement') && (typeof rule.replacement !== 'string' || rule.replacement.length > 100000))) throw new Error('Invalid rule.');
            return rule;
        });
    } else if (operation === 'json-decode') {
        if (!['parse', 'check'].includes(settings.mode) || typeof settings.schema !== 'string') return invalid();
        if (settings.schema !== '') {
            if (settings.schema.length > 262144 || new TextEncoder().encode(settings.schema).byteLength > 262144) return failure('SCHEMA_LIMIT', 'Schema JSON exceeds 262,144 UTF-8 bytes.');
            try { settings.parsedSchema = JSON.parse(settings.schema); }
            catch { return failure('INVALID_SCHEMA', 'Schema must be raw JSON text.'); }
            const checked = decodeJson(null, { mode: 'check', schema: settings.parsedSchema });
            if (!checked.ok && checked.error.code !== 'SCHEMA_MISMATCH') return checked;
        }
    } else {
        const checked = selectFields(null, { fields: settings.fields });
        if (!checked.ok && checked.error.code !== 'MISSING_FIELD') return checked;
    }
    return { ok: true };
}

/** Describe effective named ports without importing shared graph/runtime contracts. */
function resolvePrimitive(node, options = {}) {
    try {
        if (!plainObject(node) || !plainObject(options)) return failure('INVALID_SETTINGS', 'Node and options must be plain objects.');
        const operation = ownValue(node, 'operation');
        if (typeof operation !== 'string' || !Object.hasOwn(PRIMITIVE_OPERATIONS, operation)) return failure('UNKNOWN_OPERATION', 'Unknown primitive operation.');
        const base = PRIMITIVE_OPERATIONS[operation];
        const settings = Object.fromEntries(base.controls.map(key => [key, ownValue(node, key, base.defaults[key])]));
        const validated = validateSettings(operation, settings);
        if (!validated.ok) return validated;
        const fixedPhase = operation === 'compose' && settings.outputKind === 'guidance' ? 'pre' : operation === 'text-rules' && settings.inputKind === 'draft' ? 'post' : undefined;
        const nodePhase = ownValue(node, 'phase');
        const suppliedPhase = ownValue(options, 'phase');
        const phase = suppliedPhase === undefined ? nodePhase === undefined ? fixedPhase : nodePhase : suppliedPhase;
        if (!['pre', 'post'].includes(phase)) return failure('INVALID_PHASE', 'An effective pre or post phase is required.');
        if ((fixedPhase !== undefined && fixedPhase !== phase) || (nodePhase !== undefined && nodePhase !== phase)) return failure('INVALID_PHASE', 'The supplied phase conflicts with this node.');
        if (operation === 'text-rules' && settings.inputKind === 'draft' && settings.mode === 'extract') return failure('INVALID_SETTINGS', 'Draft rules only support replace mode.');
        const input = operation === 'text-rules' ? settings.inputKind : operation === 'json-decode' ? settings.mode === 'check' ? 'data' : 'text' : base.input;
        const output = operation === 'compose' ? settings.outputKind : operation === 'text-rules' && input === 'draft' ? 'patches' : base.output;
        const descriptor = { ...base, phase, input, output };
        let ports;
        if (operation === 'compose') {
            ports = [port('data', 'Data', 'input', 'data'), ...settings.sections.map(section => port('section.' + section.name, section.name, 'input', section.kind ?? 'text', section.required ?? false))];
        } else ports = [port('in', 'Input', 'input', input, true)];
        ports.push(port('out', 'Output', 'output', output));
        return { ok: true, data: { descriptor, ports, settings } };
    } catch { return failure('INVALID_SETTINGS', 'Use plain settings with own data properties.'); }
}

export function describePrimitive(node, options = {}) {
    const result = resolvePrimitive(node, options);
    if (!result.ok) return result;
    const { descriptor, ports } = result.data;
    return { ok: true, data: { descriptor, ports } };
}

function validateInputs(namedInputs, ports) {
    const inputs = ownRecord(namedInputs);
    const effective = ports.filter(item => item.direction === 'input');
    for (const key of Object.keys(inputs)) {
        const expected = effective.find(item => item.id === key);
        if (!expected) return failure('UNSUPPORTED_INPUT', 'Unsupported or stale input: ' + key);
        const artifact = ownRecord(inputs[key], undefined, true);
        if (!Object.hasOwn(artifact, 'kind') || artifact.kind !== expected.kind) return failure('INVALID_INPUT', 'Input ' + key + ' requires ' + expected.kind + '.');
        if (['text', 'guidance'].includes(expected.kind) && (!Object.hasOwn(artifact, 'text') || typeof artifact.text !== 'string' || artifact.text.length > 100000)) return failure('INVALID_INPUT', 'Text input must contain at most 100,000 UTF-16 units.');
        if (expected.kind === 'data') {
            if (!Object.hasOwn(artifact, 'value')) return failure('INVALID_INPUT', 'Data input requires an own value.');
            const cloned = cloneJsonValue(artifact.value);
            if (!cloned.ok) return cloned;
            artifact.value = cloned.data.value;
        }
        inputs[key] = artifact;
    }
    for (const expected of effective) if (expected.required && !Object.hasOwn(inputs, expected.id)) return failure('MISSING_INPUT', 'Required input is missing: ' + expected.id);
    return { ok: true, data: { inputs } };
}

function adapterExecution(execution) {
    try {
        const options = ownRecord(execution, ['phase', 'signal', 'createWorker', 'timeoutMs', 'inputStates', 'countTokens']);
        if ((options.countTokens !== undefined && typeof options.countTokens !== 'function') || (options.createWorker !== undefined && typeof options.createWorker !== 'function') || (options.signal !== undefined && !(options.signal instanceof AbortSignal)) || (Object.hasOwn(options, 'timeoutMs') && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 2000))) throw new Error('Invalid execution option.');
        return { ok: true, data: { options } };
    } catch { return failure('INVALID_EXECUTION', 'Use phase, inputStates, countTokens, AbortSignal, createWorker and an integer 100..2,000 ms timeout.'); }
}

/** Execute a deterministic primitive and wrap its successful value in a native artifact. */
async function executePrimitiveRaw(node, namedInputs, execution = {}) {
    try {
        const checkedExecution = adapterExecution(execution);
        if (!checkedExecution.ok) return checkedExecution;
        const { options: executionOptions } = checkedExecution.data;
        const result = resolvePrimitive(node, { phase: executionOptions.phase });
        if (!result.ok) return result;
        const { descriptor, settings, ports } = result.data;
        const plan = descriptor.id === 'compose' ? resolveComposeContributions(settings, namedInputs, executionOptions.inputStates ?? {}) : null;
        if (plan && !plan.ok) return plan;
        const checkedInputs = validateInputs(namedInputs, ports);
        if (!checkedInputs.ok) return checkedInputs;
        const { inputs } = checkedInputs.data;
        if (descriptor.id === 'text-rules') {
            const apply = settings.inputKind === 'draft' ? createDraftRulePatches : applyTextRules;
            const transformed = await apply(settings.inputKind === 'draft' ? inputs.in : inputs.in.text, { mode: settings.mode, rules: settings.rules, separator: settings.separator, ...(settings.inputKind === 'draft' ? { scope: settings.scope, protectedLiterals: settings.protectedLiterals } : {}) }, {
                workerFactory: executionOptions.createWorker, signal: executionOptions.signal, timeoutMs: executionOptions.timeoutMs,
            });
            if (!transformed.ok) return transformed;
            return { ok: true, artifact: settings.inputKind === 'draft' ? transformed.data.artifact : { kind: 'text', text: transformed.data.text }, reports: transformed.data.report };
        }
        if (descriptor.id === 'json-decode' || descriptor.id === 'select-fields') {
            const transformed = descriptor.id === 'json-decode'
                ? decodeJson(settings.mode === 'parse' ? inputs.in.text : inputs.in.value, { mode: settings.mode, ...(Object.hasOwn(settings, 'parsedSchema') ? { schema: settings.parsedSchema } : {}) })
                : selectFields(inputs.in.value, { fields: settings.fields });
            if (!transformed.ok) return transformed;
            return { ok: true, artifact: { kind: 'data', value: transformed.data.value }, reports: transformed.data.report };
        }
        if (descriptor.id !== 'compose') return failure('UNKNOWN_OPERATION', 'Primitive is not implemented.');
        const options = {
            sections: plan.data.sections,
            separator: settings.separator,
        };
        if (settings.mode === 'template') options.template = settings.template;
        if (Object.hasOwn(inputs, 'data')) options.data = inputs.data.value;
        const composed = composeText(options);
        if (!composed.ok) return composed;
        let budgetReport = [];
        if (settings.budgetTokens > 0) {
            if (typeof executionOptions.countTokens !== 'function') return failure('TOKENIZER_REQUIRED', 'A tokenizer is required for a Compose token budget.');
            let measured; try { measured = await executionOptions.countTokens(composed.data.text); } catch { return failure('TOKEN_COUNT_FAILED', 'Compose could not measure the rendered text.'); }
            if (executionOptions.signal?.aborted) return failure('ABORTED', 'Compose was stopped.');
            let tokens; try { tokens = ownValue(ownRecord(measured), 'tokens'); } catch { return failure('TOKEN_COUNT_FAILED', 'Compose tokenizer returned an invalid count.'); }
            if (!Number.isSafeInteger(tokens) || tokens < 0) return failure('TOKEN_COUNT_FAILED', 'Compose tokenizer returned an invalid count.');
            if (tokens > settings.budgetTokens) return failure('COMPOSE_OVERFLOW', 'Rendered Compose output exceeds its token budget.');
            budgetReport = [{ code: 'COMPOSE_BUDGET', tokens, budget: settings.budgetTokens }];
        }
        return { ok: true, artifact: { kind: descriptor.output, text: composed.data.text }, reports: [...(settings.sections.some(section => ['kind', 'required', 'onSkipped'].some(key => Object.hasOwn(section, key))) || Object.keys(executionOptions.inputStates ?? {}).length ? plan.data.contributions : composed.data.report), ...budgetReport] };
    } catch { return failure('INVALID_INPUTS', 'Use named inputs with own data properties.'); }
}

export async function executePrimitive(node,namedInputs,execution = {}) { return preserveArtifactPrivacy(await executePrimitiveRaw(node,namedInputs,execution),namedInputs); }
