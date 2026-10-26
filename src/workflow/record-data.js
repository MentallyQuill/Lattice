/** Hook-free plain diagnostic data utilities. No runtime/host authority enters here. */
const encoder = new TextEncoder();
export const TOTAL_RECORD_BYTES = 4194304;
export const ARTIFACT_RECORD_BYTES = 262144;
export const RENDERED_TEXT_BYTES = 65536;

export function own(value, key) {
    try { const descriptor = Object.getOwnPropertyDescriptor(value, key); return descriptor && 'value' in descriptor ? descriptor.value : undefined; } catch { return undefined; }
}
export function plain(value) {
    try { return value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); } catch { return false; }
}
export function dense(value, max = 20000) {
    try {
        if (!Array.isArray(value)) return false;
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Array.prototype && prototype !== null) return false;
        const length = own(value, 'length');
        if (!Number.isSafeInteger(length) || length < 0 || length > max) return false;
        const keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
        if (keys.length !== length + 1) return false;
        for (let i = 0; i < length; i++) if (!Object.hasOwn(descriptors[i] ?? {}, 'value')) return false;
        return true;
    } catch { return false; }
}
export function freeze(value) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) if ('value' in descriptor) freeze(descriptor.value);
        Object.freeze(value);
    }
    return value;
}
/** Unlike JSON.stringify(input), this encoder never looks up toJSON or invokes a getter. */
export function encode(value) {
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
    if (typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        const length = own(value, 'length');
        const parts = [];
        for (let i = 0; i < length; i++) parts.push(encode(own(value, String(i))));
        return '[' + parts.join(',') + ']';
    }
    if (plain(value)) {
        const parts = [];
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) if (descriptor.enumerable && 'value' in descriptor && descriptor.value !== undefined) parts.push(JSON.stringify(key) + ':' + encode(descriptor.value));
        return '{' + parts.join(',') + '}';
    }
    return 'null';
}
export const bytes = value => encoder.encode(encode(value)).byteLength;
export const textBytes = value => encoder.encode(value).byteLength;
/** Bound escaped JSON string bytes, never split a Unicode scalar or escape sequence. */
export function boundedText(value, limit) {
    if (typeof value !== 'string') return undefined;
    // Avoid first encoding an arbitrarily large original merely to discover it cannot fit.
    if (value.length <= limit && bytes(value) <= limit) return value;
    let low = 0, high = Math.min(value.length, Math.max(0, limit));
    while (low < high) {
        let middle = Math.ceil((low + high) / 2);
        if (middle < value.length && middle > 0 && /[\uD800-\uDBFF]/.test(value[middle - 1]) && /[\uDC00-\uDFFF]/.test(value[middle])) middle--;
        if (middle <= low) break;
        if (bytes(value.slice(0, middle)) <= limit) low = middle; else high = middle - 1;
    }
    if (low > 0 && /[\uD800-\uDBFF]/.test(value[low - 1]) && /[\uDC00-\uDFFF]/.test(value[low])) low--;
    return value.slice(0, low);
}
export const errorResult = (code, message) => freeze({ ok: false, error: { code, message } });
export const successResult = data => freeze({ ok: true, data });
export function safeError(raw, inventory, fallbackAddress) {
    if (!plain(raw) || typeof own(raw, 'code') !== 'string' || typeof own(raw, 'message') !== 'string') return undefined;
    const code = boundedText(own(raw, 'code'), 128), message = boundedText(own(raw, 'message'), 2048);
    const result = { code, message, ...(code !== own(raw, 'code') || message !== own(raw, 'message') ? { truncated: true } : {}) };
    if (code === 'UNSUPPORTED_NATIVE_SOURCE') {
        const details = own(raw, 'details');
        if (plain(details)) {
            const generationType = own(details, 'generationType'), sourceReason = own(details, 'sourceReason');
            const allowed = generationType === 'normal' ? sourceReason === 'USER_MESSAGE_REQUIRED' : generationType === 'swipe' && ['ASSISTANT_REPLY_REQUIRED', 'ASSISTANT_REPLY_INCOMPLETE', 'ASSISTANT_TEXT_REQUIRED', 'TOOL_REPLY_UNSUPPORTED', 'MEDIA_REPLY_UNSUPPORTED', 'SWIPE_HISTORY_REQUIRED'].includes(sourceReason);
            if (allowed) result.details = { generationType, sourceReason };
        }
    }
    const explicit = nodeAddress(own(raw, 'address')), fallback = nodeAddress(fallbackAddress);
    const admitted = address => !inventory || [...inventory.units, ...inventory.hierarchy.filter(entry => entry.kind === 'instance')].some(entry => entry.included && addressKey(entry.address) === addressKey(address));
    const address = explicit && admitted(explicit) ? explicit : fallback && admitted(fallback) ? fallback : null;
    if (address) {
        result.address = address; result.nodeId = address.nodeId;
        const port = own(raw, 'inputPortId');
        const entry = inventory && [...inventory.units, ...inventory.hierarchy].find(entry => entry.included && addressKey(entry.address) === addressKey(address));
        // A foreign explicit cause cannot transfer its pin onto the executing fallback.
        if ((!explicit || addressKey(explicit) === addressKey(address)) && typeof port === 'string' && port && (!inventory || entry?.inputPorts?.includes(port))) result.inputPortId = port;
    }
    return result;
}
/** Port state is mandatory metadata; bound its reason within each reserved recording row. */
export function safePortState(raw) {
    if(!plain(raw)||!['completed','skipped','unresolved'].includes(own(raw,'status')))return undefined;
    const reason=safeError(own(raw,'reason'));
    const message=reason&&boundedText(reason.message,128);
    return {status:own(raw,'status'),...(reason?{reason:{code:reason.code,message,...(reason.truncated||message!==reason.message?{truncated:true}:{})}}:{})};
}
/** Exact bounded helper identity accompanies aggregated requests without exposing bindings. */
export function safeIteration(raw) {
    if(!plain(raw))return undefined;
    const index=own(raw,'index'),helper=own(raw,'helper'),id=own(helper,'id'),version=own(helper,'version'),semanticHash=own(helper,'semanticHash');
    if(!Number.isSafeInteger(index)||index<0||index>=128||!plain(helper)||typeof id!=='string'||!id||id.length>128||!Number.isSafeInteger(version)||version<1||typeof semanticHash!=='string'||!/^sha256:[0-9a-f]{64}$/.test(semanticHash))return undefined;
    const child=nodeAddress(own(raw,'childAddress'));
    const validChild=child&&child.workflowId.length<=128&&child.nodeId.length<=128&&child.instancePath.every(id=>id.length<=128);
    return {index,helper:{id,version,semanticHash},...(validChild?{childAddress:child}:own(raw,'childAddress')===undefined?{}:{childOmitted:true})};
}
export function safeBinding(raw) {
    if (!plain(raw)) return undefined;
    const result = {};
    for (const key of ['role', 'profileId', 'model', 'fingerprint', 'connectionId', 'capability', 'provider']) {
        const value = own(raw, key);
        if (key === 'capability' && !['text-completion','typed-decision'].includes(value) || key === 'provider' && !['jev','laya','compatible'].includes(value)) continue;
        if (typeof value === 'string') { result[key] = boundedText(value, 256); if (value !== result[key]) result.truncated = true; }
        else if (value === null && (key === 'model' || key === 'profileId')) result[key] = null;
    }
    return result;
}
/** Numeric provider-reported token summaries only; absent/unknown usage stays unknown. */
export function safeUsage(raw) {
    if (raw === null) return null;
    if (!plain(raw)) return undefined;
    const result = {};
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'promptTokens', 'completionTokens', 'input_tokens', 'output_tokens', 'total_tokens', 'prompt_tokens', 'completion_tokens', 'cached_tokens', 'reasoning_tokens']) {
        const value = own(raw, key); if (typeof value === 'number' && Number.isFinite(value) && value >= 0) result[key] = value;
    }
    return result;
}
export function safeSource(raw, depth = 0, traversal = { remaining: 128 }) {
    if (!plain(raw) || traversal.remaining-- <= 0) return undefined;
    const result = {};
    for (const key of ['kind', 'phase', 'chatId', 'characterId', 'groupId', 'messageIndex', 'swipeId', 'revision']) {
        const value = own(raw, key);
        if (typeof value === 'string') { result[key] = boundedText(value, 256); if (value !== result[key]) result.truncated = true; }
        else if (value === null && ['chatId', 'characterId', 'groupId'].includes(key)) result[key] = null;
        else if (Number.isSafeInteger(value) && (['chatId', 'characterId', 'groupId'].includes(key) || value >= 0)) result[key] = value;
    }
    for (const key of ['source', 'block', 'form', 'mainApi', 'override', 'promptId', 'orderScope']) {
        const value = own(raw, key);
        if (typeof value === 'string') { result[key] = boundedText(value, 256); if (value !== result[key]) result.truncated = true; }
    }
    const enabled = own(raw, 'enabled');
    if (typeof enabled === 'boolean' || enabled === null) result.enabled = enabled;
    // Context Join stores source scopes here; preserve safe per-pin provenance, never source tokens.
    if (own(raw, 'operation') === 'context-join' && depth < 8) {
        result.operation = 'context-join';
        const inputs = own(raw, 'inputs');
        if (dense(inputs, 16)) {
            result.inputs = [];
            for (let i = 0; i < inputs.length; i++) {
                const input = own(inputs, String(i)), portId = own(input, 'portId'), source = safeSource(own(input, 'source'), depth + 1, traversal);
                if (plain(input) && typeof portId === 'string' && source) result.inputs.push({ portId: boundedText(portId, 256), source });
                else result.truncated = true;
            }
        }
    }
    while (bytes(result) > 4096 && result.inputs?.length) { result.inputs.pop(); result.truncated = true; }
    return result;
}
export function nodeAddress(raw) {
    if (!plain(raw)) return null;
    const workflowId = own(raw, 'workflowId'), nodeId = own(raw, 'nodeId'), path = own(raw, 'instancePath');
    if (typeof workflowId !== 'string' || !workflowId || typeof nodeId !== 'string' || !nodeId || !dense(path, 8)) return null;
    const instancePath = [];
    for (let i = 0; i < path.length; i++) { const id = own(path, String(i)); if (typeof id !== 'string' || !id) return null; instancePath.push(id); }
    return { workflowId, instancePath, nodeId };
}
export const addressKey = address => encode([address.workflowId, address.instancePath, address.nodeId]);
/** Expand exact interned identities only for view/navigation consumers. */
export function expandRecordAddress(record, index) {
    const tables = own(record, 'identities'), addresses = own(tables, 'addresses'), paths = own(tables, 'paths'), strings = own(tables, 'strings');
    const tuple = own(addresses, String(index)); if (!Array.isArray(tuple)) return null;
    const workflowId = own(strings, String(own(tuple, '0'))), nodeId = own(strings, String(own(tuple, '2'))), instancePath = [];
    let pathIndex = own(tuple, '1'), depth = 0;
    while (pathIndex !== 0 && depth++ < 8) {
        const path = own(paths, String(pathIndex)); if (!Array.isArray(path)) return null;
        instancePath.unshift(own(strings, String(own(path, '1')))); pathIndex = own(path, '0');
    }
    return pathIndex === 0 ? nodeAddress({ workflowId, nodeId, instancePath }) : null;
}
export function targetAddress(raw) {
    if (!plain(raw)) return null;
    if (own(raw, 'kind') === 'terminal') { const address = nodeAddress(own(raw, 'address')); return address && { kind: 'terminal', address }; }
    const address = nodeAddress(raw), portId = own(raw, 'portId');
    return address && typeof portId === 'string' && portId ? { ...address, portId } : null;
}
/** Parse only the safe inventory, never copy the producer's executable nodes/bindings. */
export function parseRunPlan(raw) {
    if (!plain(raw)) return null;
    const workflowId = own(raw, 'workflowId'), phase = own(raw, 'phase'), mode = own(raw, 'mode');
    if (typeof workflowId !== 'string' || !workflowId || !['pre', 'post', 'unified'].includes(phase) || !['root', 'target'].includes(mode)) return null;
    const unitData = own(raw, 'units'), hierarchyData = own(raw, 'hierarchy'), terminalData = own(raw, 'terminals'), callBound = own(raw, 'callBound');
    if (!dense(unitData, 1000) || !dense(hierarchyData, 9000) || !dense(terminalData, 1000) || !Number.isSafeInteger(callBound) || callBound < 0) return null;
    const units = [], hierarchy = [], terminals = [], identities = new Set();
    for (let i = 0; i < unitData.length; i++) {
        const rawUnit = own(unitData, String(i)); if (!plain(rawUnit)) return null;
        const address = nodeAddress(own(rawUnit, 'address')), included = own(rawUnit, 'included'), operation = own(rawUnit, 'operation'), requestBound = own(rawUnit, 'requestBound');
        if (!address || address.workflowId !== workflowId || identities.has(addressKey(address)) || typeof included !== 'boolean' || typeof operation !== 'string' || !Number.isSafeInteger(requestBound) || requestBound < 0) return null;
        identities.add(addressKey(address));
        const dependencies = [], dependencyData = own(rawUnit, 'dependencies');
        if (!dense(dependencyData, 2000)) return null;
        for (let j = 0; j < dependencyData.length; j++) { const dependency = nodeAddress(own(dependencyData, String(j))); if (!dependency || dependency.workflowId !== workflowId) return null; dependencies.push(dependency); }
        const unitPhase = own(rawUnit, 'phase');
        if (unitPhase !== undefined && !['pre', 'post'].includes(unitPhase) || phase === 'unified' && unitPhase === undefined) return null;
        const unit = { address, included, operation: boundedText(operation, 256), ...(unitPhase === undefined ? {} : { phase: unitPhase }), dependencies, requestBound, inputPorts: [], outputPorts: [] };
        for (const direction of ['inputPorts', 'outputPorts']) {
            const ports = own(rawUnit, direction); if (!dense(ports, 1000)) return null;
            for (let j = 0; j < ports.length; j++) { const id = own(ports, String(j)); if (typeof id !== 'string' || !id || unit[direction].includes(id)) return null; unit[direction].push(id); }
        }
        const label = own(rawUnit, 'label'); if (typeof label === 'string') unit.label = boundedText(label, 512);
        if (unit.operation !== operation || (typeof label === 'string' && unit.label !== label)) unit.metadataTruncated = true;
        units.push(unit);
    }
    for (const unit of units) if (unit.dependencies.some(address => !identities.has(addressKey(address)))) return null;
    for (let i = 0; i < hierarchyData.length; i++) {
        const entry = own(hierarchyData, String(i)), address = nodeAddress(own(entry, 'address')), kind = own(entry, 'kind');
        if (!plain(entry) || !address || address.workflowId !== workflowId || !['instance', 'primitive'].includes(kind)) return null;
        const parentRaw = own(entry, 'parent'), parent = parentRaw === undefined ? undefined : nodeAddress(parentRaw);
        if (parentRaw !== undefined && (!parent || parent.workflowId !== workflowId)) return null;
        const inputPorts = own(entry, 'inputPorts');
        if (inputPorts !== undefined && (!dense(inputPorts, 1000) || inputPorts.some(port => typeof port !== 'string' || !port))) return null;
        hierarchy.push({ address, kind, ...(parent ? { parent } : {}), included: own(entry, 'included') === true, ...(inputPorts ? { inputPorts: [...inputPorts] } : {}) });
    }
    for (let i = 0; i < terminalData.length; i++) { const target = targetAddress(own(terminalData, String(i))); if (!target || target.kind !== 'terminal' || !identities.has(addressKey(target.address))) return null; terminals.push(target); }
    const result = { workflowId, phase, mode, units, hierarchy, terminals, callBound };
    for (const key of ['target', 'resolvedTarget']) { const rawTarget = own(raw, key); if (rawTarget !== undefined) { const target = targetAddress(rawTarget); if (!target) return null; result[key] = target; } }
    if (mode === 'target' && !result.target) return null;
    return freeze(result);
}
