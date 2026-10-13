import { diagnosticCopy } from './diagnostic-copy.js?v=0.27.3';

const own = (value, key) => {
    try { const field = Object.getOwnPropertyDescriptor(value, key); return field && 'value' in field ? field.value : undefined; }
    catch { return undefined; }
};
const plain = value => {
    try { return !!value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
    catch { return false; }
};
const text = (value, limit = 4096) => typeof value === 'string' ? value.slice(0, limit) : '';
const safeLabel = value => {
    const label = text(value, 160).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    return /(?:api[_ -]?key|authorization|bearer\s|password|secret\s*[=:]|sk-[\w-]+)/i.test(label) ? '' : label;
};
function readInput(input) {
    if (typeof input === 'string') {
        const message = text(input), coded = /^([A-Z][A-Z0-9_]{0,63}):\s*(.*)$/s.exec(message);
        return { code: coded?.[1] || '', message: coded?.[2] ?? message, nodeId: '' };
    }
    if (!plain(input)) return { code: '', message: '', nodeId: '' };
    const code = own(input, 'code');
    return { code: typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : '', message: text(own(input, 'message')), nodeId: text(own(input, 'nodeId'), 256), address: readAddress(own(input, 'address')) };
}
function readAddress(address) {
    if (!plain(address)) return undefined;
    const workflowId = text(own(address, 'workflowId'), 256), nodeId = text(own(address, 'nodeId'), 256), path = own(address, 'instancePath');
    const length = own(path, 'length');
    if (!workflowId || !nodeId || !Array.isArray(path) || !Number.isSafeInteger(length) || length > 8) return undefined;
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
const causeKey = source => JSON.stringify([source.code, source.message, source.address ?? source.nodeId]);
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
        ...(source.address ? { address: source.address } : {}) };
}

export function diagnosticText(input, context = {}) {
    return presentDiagnostic(input, context).message;
}

export function presentDiagnostics(inputs, context = {}) {
    if (!Array.isArray(inputs)) return [];
    const result = [], seen = new Set(), length = Math.min(own(inputs, 'length') || 0, 1000);
    for (let index = 0; index < length; index++) {
        const input = own(inputs, String(index)), key = causeKey(readInput(input));
        if (!seen.has(key)) { seen.add(key); result.push(presentDiagnostic(input, context)); }
    }
    return result;
}
