import { diagnosticCopy } from './diagnostic-copy.js?v=0.30.0';

const own = (value, key) => {
    try { const field = Object.getOwnPropertyDescriptor(value, key); return field && 'value' in field ? field.value : undefined; }
    catch { return undefined; }
};
const plain = value => {
    try { return !!value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
    catch { return false; }
};
const array = value => {
    try { return Array.isArray(value); }
    catch { return false; }
};
const text = (value, limit = 4096) => typeof value === 'string' ? value.slice(0, limit) : '';
const safeLabel = value => {
    const label = text(value, 160).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    return /(?:api[_ -]?key|authorization|bearer\s|password|secret\s*[=:]|sk-[\w-]+)/i.test(label) ? '' : label;
};
const schemaMessages = {
    type: ['The value has the wrong type.', /^Expected (?:null|array|object|boolean|number|integer|string); got (?:null|array|object|boolean|number|string)\.$/],
    enum: ['Value is not in enum.', /^Value is not in enum\.$/],
    const: ['Value does not equal const.', /^Value does not equal const\.$/],
    required: ['Required field is missing.', /^Required field is missing\.$/],
    additionalProperties: ['Additional field is not allowed.', /^Additional field is not allowed\.$/],
    minimum: ['Number is below minimum.', /^Expected a number at least -?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?\.$/],
    maximum: ['Number is above maximum.', /^Expected a number at most -?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?\.$/],
    minItems: ['Array has fewer than minimum items.', /^Expected at least \d{1,16} items; got \d{1,16}\.$/],
    maxItems: ['Array has more than maximum items.', /^Expected at most \d{1,16} items; got \d{1,16}\.$/],
    minLength: ['String is shorter than minimum.', /^Expected at least \d{1,16} characters; got \d{1,16}\.$/],
    maxLength: ['String is longer than maximum.', /^Expected at most \d{1,16} characters; got \d{1,16}\.$/],
};
function readFindings(input, code) {
    if (code !== 'SCHEMA_MISMATCH') return undefined;
    const findings = own(input, 'findings') ?? own(own(input, 'details'), 'findings');
    if (!array(findings)) return undefined;
    const sourceLength = own(findings, 'length');
    if (!Number.isSafeInteger(sourceLength) || sourceLength < 0) return undefined;
    const result = [], length = Math.min(sourceLength, 20);
    for (let index = 0; index < length; index++) {
        const finding = own(findings, String(index));
        if (!plain(finding)) continue;
        const path = own(finding, 'path'), keyword = own(finding, 'keyword'), message = own(finding, 'message');
        if (typeof keyword !== 'string' || !Object.hasOwn(schemaMessages, keyword) || typeof path !== 'string' || path.length > 256 || (path !== '' && !path.startsWith('/')) || /[\u0000-\u001f\u007f]/.test(path)) continue;
        const [fallback, grammar] = schemaMessages[keyword];
        result.push({ path, keyword, message: typeof message === 'string' && message.length <= 256 && grammar.test(message) ? message : fallback });
    }
    return result.length ? result : undefined;
}
/** Sanitize findings at UI boundaries, including already-presented diagnostic DTOs. */
export function diagnosticSchemaFindings(input) {
    if (!plain(input)) return [];
    return readFindings(input, own(input, 'code') ?? own(own(input, 'technical'), 'code')) ?? [];
}
function readInput(input) {
    if (typeof input === 'string') {
        const message = text(input), coded = /^([A-Z][A-Z0-9_]{0,63}):\s*(.*)$/s.exec(message);
        return { code: coded?.[1] || '', message: coded?.[2] ?? message, nodeId: '' };
    }
    if (!plain(input)) return { code: '', message: '', nodeId: '' };
    const code = own(input, 'code');
    return { code: typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : '', message: text(own(input, 'message')), nodeId: text(own(input, 'nodeId'), 256), address: readAddress(own(input, 'address')), findings: readFindings(input, code) };
}
function readAddress(address) {
    if (!plain(address)) return undefined;
    const workflowId = own(address, 'workflowId'), nodeId = own(address, 'nodeId'), path = own(address, 'instancePath');
    const length = own(path, 'length');
    if (typeof workflowId !== 'string' || !workflowId || workflowId.length > 256 || typeof nodeId !== 'string' || !nodeId || nodeId.length > 256 || !array(path) || !Number.isSafeInteger(length) || length < 0 || length > 8) return undefined;
    const instancePath = [];
    for (let index = 0; index < length; index++) {
        const id = own(path, String(index));
        if (typeof id !== 'string' || !id || id.length > 256) return undefined;
        instancePath.push(id);
    }
    return { workflowId, instancePath, nodeId };
}
function readContext(context) {
    if (!plain(context)) return {};
    const result = {};
    for (const key of ['operation', 'nodeTitle', 'inputLabel', 'outputType', 'inputType', 'action']) result[key] = safeLabel(own(context, key));
    result.enabled = own(context, 'enabled') === true;
    return result;
}
const causeKey = source => JSON.stringify([source.code, source.message, source.address ?? source.nodeId, source.findings]);
function stableId(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(36);
}
/** Present a diagnostic without executing code or exposing unknown source text. */
export function presentDiagnostic(input, context = {}) {
    const source = readInput(input), copy = diagnosticCopy(source, readContext(context));
    return { id: `${copy.id}-${stableId(causeKey(source))}`, severity: copy.severity, title: copy.title, message: copy.message,
        technical: source.code ? { code: source.code, message: copy.id === 'unknown' ? 'No safe technical description is available for this error.' : copy.technical ?? copy.message } : null,
        ...(source.address ? { address: source.address } : {}), ...(source.findings ? { findings: source.findings } : {}) };
}

export function diagnosticText(input, context = {}) {
    return presentDiagnostic(input, context).message;
}

export function presentDiagnostics(inputs, context = {}) {
    if (!array(inputs)) return [];
    const sourceLength = own(inputs, 'length');
    if (!Number.isSafeInteger(sourceLength) || sourceLength < 0) return [];
    const result = [], seen = new Set(), length = Math.min(sourceLength, 1000);
    for (let index = 0; index < length; index++) {
        const input = own(inputs, String(index)), key = causeKey(readInput(input));
        if (!seen.has(key)) { seen.add(key); result.push(presentDiagnostic(input, context)); }
    }
    return result;
}
