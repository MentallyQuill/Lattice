import { validateDecisionQuestions } from '../workflow/decision.js?v=0.27.3';
import { compileScheduleRows, validateScheduleMetadata } from './schedule-authoring.js?v=0.27.3';
import { validIterationRoleOverrides } from '../workflow/operations/control-nodes.js?v=0.27.3';
import { validateCleanupSettings } from '../workflow/operations/prose-cleanup.js?v=0.27.3';
import { introspectionDefaults } from '../workflow/introspection/native.js?v=0.27.3';
import { resolveThresholds } from '../workflow/progression.js?v=0.27.3';
import { OPERATIONS, operationFor } from '../workflow/catalog.js?v=0.27.3';
import { validateJsonSchema } from '../workflow/operations/json-decode.js?v=0.27.3';
import { cloneJsonValue } from '../workflow/operations/json-data.js?v=0.27.3';
import { parseDelimitedInput } from './delimited-input.js?v=0.27.3';
const fail = (code, message, location = {}) => ({ ok: false, error: { code, message, ...location } });
const good = data => ({ ok: true, data });
const bytes = text => new TextEncoder().encode(text).byteLength;
const declarations = new Map();
const declare = (grammar, keys) => keys.split(' ').forEach(key => declarations.set(key, grammar));
declare('list', 'smart-compactor.pins pattern.exemptions pattern.protectedLiterals repair.categories repair.protectedLiterals text-rules.protectedLiterals style-transfer.protectedLiterals format-transfer.protectedLiterals terminology-map.protectedLiterals revise-draft.protectedLiterals format.columns read-file.columns write-file.fields write-file.columns project-document.fields project-document.columns item-mention-trigger.aliases recall.keywords recall.eventTypes recall.partnerIds recall.tags recall.recordIds context.pins memory.pins time-trigger.consumedIds advance-time.consumedIds filter-text.protectedLiterals');
declare('path', 'condition.path confidence-gate.metricPath collection.collectionPath collection.fieldPath collection.identityPath select-fields.path format.path');
declare('rows', 'compose.sections text-rules.rules select-fields.fields format.fields context-join.inputs join.inputs collect.inputs state.updates state.durations');
declare('questions', 'decision.questions');
declare('schedules', 'advance-time.schedules');
declare('value', 'time-trigger.metadata');
declare('schema', 'json-decode.schema extract.schema model-call.schema format.schema read-file.schema write-file.schema project-document.schema');
declare('value', 'condition.value collection.value select-fields.default format.default');
declare('helper', 'for-each.helper for-each.roleOverrides');
declare('hotkey', 'hotkey-arm.hotkey');
declare('numbers', 'collection.thresholds');
declare('pattern', 'pattern.rules');
declare('extract', 'extract.patterns');
// Engine element budgets not represented by the catalog's array descriptors.
const listStringBounds = new Map();
const listBound = (limit, keys) => keys.split(' ').forEach(key => listStringBounds.set(key, limit));
listBound(2048, 'pattern.exemptions pattern.protectedLiterals repair.protectedLiterals text-rules.protectedLiterals style-transfer.protectedLiterals format-transfer.protectedLiterals terminology-map.protectedLiterals revise-draft.protectedLiterals item-mention-trigger.aliases filter-text.protectedLiterals');
listBound(256, 'recall.keywords recall.eventTypes recall.partnerIds recall.tags recall.recordIds write-file.fields project-document.fields');
listBound(4096, 'context.pins time-trigger.consumedIds advance-time.consumedIds');
const listFormats = ['auto', 'plain', 'csv', 'json', 'rows'];
export function resolveControlInputSpec({ operation, controls = {}, key, descriptor }) {
    const base = operation + '.' + key;
    const grammar = declarations.get(base);
    if (!grammar && (['array', 'object', 'json-value'].includes(descriptor.type) || descriptor.editor === 'json')) throw new TypeError('Declare an input contract for ' + base + '.');
    const editor = grammar === 'numbers' ? 'list' : ['pattern', 'extract'].includes(grammar) ? 'rows' : grammar ?? (descriptor.type === 'string' ? 'text' : 'value');
    const storage = grammar === 'numbers' || grammar === 'schema' ? 'json-text' : editor === 'text' ? 'text' : 'json-value';
    const id = base + (grammar === 'pattern' ? ':' + (controls.mode ?? 'literal') : ['state', 'context', 'memory'].includes(operation) ? ':' + (controls.mode ?? 'default') : '');
    const limits = { maxBytes: 262144 };
    if (descriptor.max !== undefined && ['array', 'object'].includes(descriptor.type)) limits.maxItems = descriptor.max;
    if (descriptor.maxLength !== undefined) limits.maxStringLength = descriptor.maxLength;
    if (listStringBounds.has(base)) limits.maxStringLength = Math.min(limits.maxStringLength ?? Infinity, listStringBounds.get(base));
    if (base === 'repair.protectedLiterals') limits.maxItems = Math.min(limits.maxItems ?? Infinity, 128);
    if (base === 'repair.categories') limits.maxItems = Math.min(limits.maxItems ?? Infinity, 14);
    if (grammar === 'numbers') limits.maxItems = 256;
    if (grammar === 'pattern') { limits.maxItems = descriptor.max ?? 128; limits.maxStringLength = descriptor.maxLength ?? 2048; }
    if (grammar === 'extract') { limits.maxItems = descriptor.max ?? 64; limits.maxStringLength = descriptor.maxLength ?? 2048; }
    const spec = { id, version: 1, editor, formats: ['list', 'path', 'numbers', 'pattern', 'extract'].includes(grammar) ? listFormats : editor === 'text' ? ['auto', 'plain', 'json'] : ['auto', 'json', 'rows'], storage, limits };
    return spec;
}
function recordGrammar(spec) { return spec.id.startsWith('pattern.rules:') ? 'pattern' : spec.id === 'extract.patterns' ? 'extract' : null; }
function compileRecords(spec, entries, currentValue) {
    const kind = recordGrammar(spec), field = kind === 'pattern' ? 'pattern' : 'literal';
    if (!Array.isArray(entries) || entries.length > spec.limits.maxItems) return fail('CONTROL_ITEM_LIMIT', 'Use a bounded list of records.');
    if (entries.every(entry => typeof entry === 'string')) {
        const checked = currentValue === undefined ? good({ value: [] }) : cloneJsonValue(currentValue);
        if (!checked.ok) return checked;
        if (!Array.isArray(checked.data.value)) return fail('INVALID_CONTROL_SHAPE', 'Current records must be an array.');
        const previous = checked.data.value, reserved = new Set(previous.map(row => row?.id)), used = new Set();
        // Reserve every unchanged row before an edit can reuse its position.
        const exactMatches = entries.map(text => {
            const match = previous.find(row => row?.[field] === text && !used.has(row.id));
            if (match) used.add(match.id);
            return match;
        });
        entries = entries.map((text, index) => {
            const match = exactMatches[index] ?? (previous[index] && !used.has(previous[index].id) ? previous[index] : undefined);
            if (match) { used.add(match.id); return { ...match, [field]: text }; }
            let suffix = 1; while (reserved.has('pattern-' + suffix)) suffix++;
            const id = 'pattern-' + suffix; reserved.add(id); used.add(id);
            return { id, [field]: text, ...(kind === 'extract' ? { label: '' } : {}) };
        });
    }
    const ids = new Set();
    for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(key => !['id', field, 'label'].includes(key)) || typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > 128 || ids.has(entry.id) || typeof entry[field] !== 'string' || !entry[field].trim() || entry[field].length > (spec.limits.maxStringLength ?? 2048) || (kind === 'extract' || Object.hasOwn(entry, 'label')) && (typeof entry.label !== 'string' || entry.label.length > (kind === 'pattern' ? 128 : 2048))) return fail('INVALID_CONTROL_RECORD', 'Use unique IDs and bounded text in the current record shape.', { row: index + 1, path: [index] });
        if (kind === 'pattern' && spec.id.endsWith(':regex')) { try { new RegExp(entry.pattern, 'u'); } catch { return fail('INVALID_CONTROL_RECORD', 'Use a valid Unicode regular expression.', {row:index + 1, path:[index,'pattern']}); } }
        ids.add(entry.id);
    }
    return good({ value: entries });
}
/** Intrinsic field checks: sibling ranges, identity and scope are checked at Save. */
function independentFieldCheck(base, value) {
    const invalid = message => fail('INVALID_CONTROL_VALUE', message);
    if (declarations.get(base) === 'list') {
        const nonblank = base === 'pattern.exemptions' || base.endsWith('.protectedLiterals') || base.startsWith('recall.') || base.endsWith('.fields') || base === 'item-mention-trigger.aliases';
        const limit = listStringBounds.get(base) ?? Infinity;
        if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string' || !(nonblank ? entry.trim().length : entry.length) || entry.length > limit)) return invalid('Use bounded nonempty entries for this list.');
        if ((base.startsWith('recall.') || base.endsWith('.fields') || base.endsWith('.columns')) && new Set(value).size !== value.length) return invalid('This identifier or column list requires distinct entries.');
        if (base === 'repair.categories') return validateCleanupSettings({ categories: value });
        return good({ value });
    }
    if (base === 'state.updates') {
        if (Object.entries(value).some(([key, entry]) => !key.trim() || key.length > 128 || typeof entry !== 'number' || !Number.isFinite(entry))) return invalid('Use bounded named finite numeric updates.');
        return good({ value });
    }
    if (base === 'for-each.roleOverrides') return validIterationRoleOverrides(value) ? good({ value }) : invalid('Use supported sparse role bindings.');
    if (base === 'time-trigger.metadata') return validateScheduleMetadata(value);
    if (base === 'decision.questions') return validateDecisionQuestions(value);
    if (base === 'advance-time.schedules') return compileScheduleRows(value);
    if (base === 'hotkey-arm.hotkey') {
        // Match the intrinsic physical-key rules in validateRecallQueueProposal.
        const keys = ['code', 'ctrl', 'alt', 'shift', 'meta'];
        if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)) || typeof value.code !== 'string' || !/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2]))$/u.test(value.code) || keys.slice(1).some(key => typeof value[key] !== 'boolean')) return invalid('Select a physical key and explicit modifier states.');
        if (value.code === 'KeyR') return fail('RECALL_HOTKEY_CONFLICT', 'R is reserved for Run to here. Choose a different key.');
        if (!value.ctrl && !value.alt && !value.meta && !/^F/u.test(value.code)) return invalid('Select Control, Alt or Meta, or a function key.');
        return good({ value });
    }
    return undefined;
}
function finish(spec, value, warnings = [], sourceText, currentValue) {
    if (spec.id === 'collection.thresholds') {
        const thresholds = resolveThresholds(0, 0, value); if (!thresholds.ok) return thresholds;
    }
    if (spec.editor === 'schema' && value !== '') {
        const schema = validateJsonSchema(value);
        if (!schema.ok) return schema;
        // Schema-node depth differs from generic JSON depth through properties maps.
        // Admission already bounds each enum/const; retain the bounded text storage.
        value = sourceText ?? JSON.stringify(schema.data.schema);
    }
    const kind = recordGrammar(spec);
    if (kind) {
        const records = compileRecords(spec, value, currentValue); if (!records.ok) return records; value = records.data.value;
    }
    const checked = cloneJsonValue(value); if (!checked.ok) return checked; value = checked.data.value;
    if ((Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : 0) > (spec.limits.maxItems ?? Infinity)) return fail('CONTROL_ITEM_LIMIT', 'Input exceeds the item limit.');
    if (['list', 'path'].includes(spec.editor) && spec.id !== 'collection.thresholds' && (!Array.isArray(value) || value.some(cell => typeof cell !== 'string' && !(['select-fields.path', 'format.path'].includes(spec.id) && Number.isSafeInteger(cell) && cell >= 0)))) return fail('INVALID_CONTROL_SHAPE', 'Enter a JSON string array.');
    if (Array.isArray(value) && value.some(cell => typeof cell === 'string' && cell.length > (spec.limits.maxStringLength ?? Infinity))) return fail('CONTROL_STRING_LIMIT', 'An entry exceeds the string limit.');
    if (spec.storage === 'json-text' && spec.editor !== 'schema') value = sourceText ?? JSON.stringify(value);
    if (typeof value === 'string' && value.length > (spec.limits.maxStringLength ?? Infinity)) return fail('CONTROL_STRING_LIMIT', 'Text exceeds the string limit.');
    const [base, mode] = spec.id.split(':'), dot = base.indexOf('.'), operation = base.slice(0, dot), key = base.slice(dot + 1);
    const registration = OPERATIONS[operation];
    const dynamic = ['state', 'context', 'memory'].includes(operation);
    const defaults = dynamic ? introspectionDefaults(operation, mode === 'default' ? undefined : mode) : registration?.defaults;
    const controls = defaults && { ...defaults, ...(mode && mode !== 'default' ? { mode } : {}) };
    const effective = controls && operationFor({ type: 'workflow', operation, ...controls });
    const reconstructed = registration && { operation, key, controls, descriptor: effective?.controlDescriptors[key] ?? registration.controlDescriptors[key] };
    if (dynamic && !effective?.controlDescriptors[key]) return fail('INVALID_CONTROL_CONTRACT', 'Choose a control declared by this operation mode.');
    const context = reconstructed;
    if (context?.descriptor) {
        const { operation, controls, key, descriptor } = context;
        if (spec.editor === 'text' && typeof value !== 'string') return fail('INVALID_CONTROL_SHAPE', 'Enter a text value.');
        if (declarations.get(base) !== 'value') {
            if (descriptor.type === 'boolean' && typeof value !== 'boolean' || descriptor.type === 'enum' && !descriptor.values.includes(value) || descriptor.type === 'integer' && !Number.isSafeInteger(value) || ['integer', 'number'].includes(descriptor.type) && (typeof value !== 'number' || value < descriptor.min || value > descriptor.max)) return fail('INVALID_CONTROL_SHAPE', 'Use the declared scalar type and bounds.');
        }
        if (descriptor.type === 'array' && (!Array.isArray(checked.data.value) || checked.data.value.length < (descriptor.min ?? 0)) || descriptor.type === 'object' && (!checked.data.value || typeof checked.data.value !== 'object' || Array.isArray(checked.data.value))) return fail('INVALID_CONTROL_SHAPE', 'Use the declared control shape.');
        const node = { type: 'workflow', operation, ...controls, [key]: value };
        const independent = independentFieldCheck(base, value); if (independent && !independent.ok) return independent;
        if (base === 'advance-time.schedules') value = independent.data.value;
        if (!independent && ['rows', 'helper', 'hotkey', 'path', 'list'].includes(spec.editor) && !operationFor(node, { phase: operation === 'context-join' ? 'pre' : undefined })) return fail('INVALID_CONTROL_VALUE', 'The value does not satisfy this operation’s control contract.');
    }
    const stored = cloneJsonValue(value); if (!stored.ok) return stored;
    if (bytes(JSON.stringify(stored.data.value)) > (spec.limits.maxBytes ?? 262144)) return fail('CONTROL_INPUT_LIMIT', 'Value exceeds the byte limit.');
    return good({ value: stored.data.value, warnings, ...(sourceText !== undefined ? { sourceText } : {}), ...(kind ? { displayItems: checked.data.value.map(row => row[kind === 'pattern' ? 'pattern' : 'literal']) } : spec.editor === 'list' && Array.isArray(checked.data.value) ? { displayItems: checked.data.value.map(String) } : {}) });
}
export function parseControlInput(spec, input) {
    try {
        if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail('INVALID_CONTROL_INPUT', 'Use own input fields.');
        const captured = {};
        for (const key of Reflect.ownKeys(input)) {
            const property = Object.getOwnPropertyDescriptor(input, key);
            if (!['format', 'text', 'value', 'currentValue'].includes(key) || !property?.enumerable || !Object.hasOwn(property, 'value')) return fail('INVALID_CONTROL_INPUT', 'Use own input fields.');
            if (key === 'value' || key === 'currentValue') {
                if(key === 'value' && spec?.editor === 'schema' && property.value !== '') {
                    const checked=validateJsonSchema(property.value); if(!checked.ok)return checked; captured[key]=checked.data.schema;
                } else {const checked = cloneJsonValue(property.value); if (!checked.ok) return checked; captured[key] = checked.data.value;}
            } else captured[key] = property.value;
        }
        input = captured;
        if (!spec || spec.version !== 1 || !input || typeof input !== 'object' || !spec.formats.includes(input.format)) return fail('UNSUPPORTED_CONTROL_FORMAT', 'Choose a supported input format.');
        if (input.format === 'rows' || Object.hasOwn(input, 'value')) {
            if (!Object.hasOwn(input, 'value')) return fail('INVALID_CONTROL_INPUT', 'Supply an own JSON value.');
            return finish(spec, input.value, [], undefined, input.currentValue);
        }
        if (typeof input.text !== 'string' || bytes(input.text) > Math.min(spec.limits.maxBytes ?? 262144, 262144)) return fail('CONTROL_INPUT_LIMIT', 'Input exceeds the text byte limit.');
        if (spec.editor === 'text' && input.format !== 'json') return finish(spec, input.text);
        if (spec.editor === 'schema' && input.text === '') return finish(spec, '', [], '');
        const apparent = spec.id !== 'pattern.rules:regex' && spec.editor !== 'text' && /^[\[{]/.test(input.text.trimStart());
        if (input.format === 'json' || input.format === 'auto' && (apparent || spec.editor === 'value')) {
            let value; try { value = JSON.parse(input.text); } catch { return fail('INVALID_CONTROL_JSON', 'Enter valid JSON or choose Plain text.'); }
            return finish(spec, value, [], spec.storage === 'json-text' ? input.text : undefined, input.currentValue);
        }
        if (!['list', 'path', 'text'].includes(spec.editor) && !recordGrammar(spec)) return fail('INVALID_CONTROL_JSON', 'Use typed rows or Advanced JSON for this control.');
        let cells;
        if (input.format === 'plain' || spec.editor === 'path' && input.format === 'auto') cells = [input.text];
        else if (spec.id === 'pattern.rules:regex' && input.format === 'auto') cells = input.text.split(/\r\n|\r|\n/);
        else {
            const parsed = parseDelimitedInput(input.text, ','); if (!parsed.ok) return parsed;
            cells = parsed.data.rows.flat();
        }
        const entries = cells.filter(cell => cell.trim().length), ignored = cells.length - entries.length;
        let value = entries;
        if (spec.id === 'collection.thresholds') {
            value = entries.map(Number);
            if (value.some(number => !Number.isFinite(number))) return fail('INVALID_CONTROL_NUMBER', 'Use finite numbers.');
        }
        return finish(spec, value, ignored ? [ignored + ' blank entries ignored.'] : [], undefined, input.currentValue);
    } catch { return fail('INVALID_CONTROL_INPUT', 'Use bounded own input data.'); }
}

/** Export only representations that preserve the canonical value on re-import. */
export function formatControlInput(spec, value, format) {
    try {
        if (!spec.formats.includes(format) || format === 'rows') return fail('UNSUPPORTED_CONTROL_FORMAT', 'Choose a supported text export format.');
        const checked = cloneJsonValue(value); if (!checked.ok) return checked; value = checked.data.value;
        let authored = value;
        if (spec.storage === 'json-text') {
            if (typeof value !== 'string') return fail('INVALID_CONTROL_SHAPE', 'Stored JSON text must be a string.');
            const parsed = parseControlInput(spec, { format: 'json', text: value }); if (!parsed.ok) return parsed;
            if (format === 'json') return good(value);
            authored = JSON.parse(value);
        }
        if (format === 'json') {
            const parsed = parseControlInput(spec, { format: 'json', text: JSON.stringify(authored) }); if (!parsed.ok) return parsed;
            return good(JSON.stringify(authored));
        }
        if (spec.editor === 'text') {
            const parsed = parseControlInput(spec, { format: 'plain', text: value }); if (!parsed.ok) return parsed;
            return good(value);
        }
        const kind = recordGrammar(spec);
        let items = kind ? authored.map(row => row[kind === 'pattern' ? 'pattern' : 'literal']) : authored;
        if (!Array.isArray(items) || items.some(item => typeof item !== 'string' && !(spec.id === 'collection.thresholds' && typeof item === 'number'))) return fail('NONREPRESENTABLE_CONTROL_FORMAT', 'This value needs Advanced JSON.');
        items = items.map(String);
        let text;
        if (format === 'plain') {
            if (items.length !== 1) return fail('NONREPRESENTABLE_CONTROL_FORMAT', 'Plain text represents one entry.');
            text = items[0];
        } else if (spec.id === 'pattern.rules:regex' && format === 'auto') text = items.join('\n');
        else text = items.map(cell => '"' + cell.replaceAll('"', '""') + '"').join(',');
        const parsed = parseControlInput(spec, { format, text });
        if (!parsed.ok || JSON.stringify(parsed.data.value) !== JSON.stringify(value)) return fail('NONREPRESENTABLE_CONTROL_FORMAT', 'This export would drop or change authored values; use Advanced JSON.');
        return good(text);
    } catch { return fail('INVALID_CONTROL_INPUT', 'Use bounded own input data.'); }
}
