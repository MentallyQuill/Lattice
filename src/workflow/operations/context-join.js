/** Pure schema-3 Context composition. No host, tokenizer, model or graph effects. */
import { inspectContextData, parseRuntimeContext, canonicalContextData, freezeContextData } from './context-data.js?v=0.27.2';
/**
 * @typedef {{id:string,label:string}} ContextJoinSlot
 * @typedef {{type:'workflow',operation:'context-join',operationVersion:1,inputs:ContextJoinSlot[]}} ContextJoinNode
 * @typedef {'INVALID_CONTEXT'|'INVALID_SETTINGS'|'MISSING_INPUT'|'CONTEXT_ID_CONFLICT'|'CONTEXT_JOIN_LIMIT'} ContextJoinErrorCode
 * @typedef {{code:ContextJoinErrorCode,message:string,portId?:string,messageId?:string,portIds?:string[],material?:'messages'|'original'}} ContextJoinError
 * @typedef {{portId:string,inputCount:number,retainedCount:number,deduplicatedCount:number,originalInputCount:number,originalRetainedCount:number,originalDeduplicatedCount:number}} ContextJoinCounts
 * @typedef {{code:'CONTEXT_JOIN',inputs:ContextJoinCounts[],outputCount:number,originalCount:number,duplicateIds:string[],originalDuplicateIds:string[],duplicateIdsOmitted?:number,originalDuplicateIdsOmitted?:number}} ContextJoinReport
 * @typedef {{code:'COMPACTED_CONTEXT_REINTRODUCED',inputs:{compactedPortId:string,reintroducedPortId:string,count:number,messageIds:string[],messageIdsOmitted?:number}[]}} ContextJoinWarning
 * @typedef {{ok:true,artifact:import('./context-data').RuntimeContext,reports:(ContextJoinReport|ContextJoinWarning)[]}|{ok:false,error:ContextJoinError}} ContextJoinResult
 */
const DEFAULT_INPUTS = [{ id: 'context-1', label: 'Context 1' }, { id: 'context-2', label: 'Context 2' }];
const failure = (code, message, details = {}) => freezeContextData({ ok: false, error: { code, message, ...details } });
function parseSettings(node) {
    if (!inspectContextData(node).ok) return null;
    try { node = structuredClone(node); }
    catch { return null; }
    if (!node || Array.isArray(node) || typeof node !== 'object' || !Object.hasOwn(node, 'inputs')) return null;
    if (!['type', 'operation', 'operationVersion'].every(key => Object.hasOwn(node, key)) || node.type !== 'workflow' || node.operation !== 'context-join' || node.operationVersion !== 1) return null;
    if (!Array.isArray(node.inputs) || node.inputs.length < 2 || node.inputs.length > 16) return null;
    const ids = new Set();
    for (const slot of node.inputs) {
        if (!slot || typeof slot !== 'object' || Array.isArray(slot) || Object.keys(slot).length !== 2 || !Object.hasOwn(slot, 'id') || !Object.hasOwn(slot, 'label')) return null;
        if (typeof slot.id !== 'string' || !slot.id.trim() || slot.id === 'out' || slot.id.length > 128 || ids.has(slot.id) || typeof slot.label !== 'string' || slot.label.length > 80) return null;
        ids.add(slot.id);
    }
    return node;
}

/**
 * @param {unknown} node Validated and parsed into a ContextJoinNode internally.
 * @param {{phase?: 'pre'|'post'}} [options]
 * @returns {import('../types').Result<{descriptor: object, ports: import('../types').PortDescriptor[]}>}
 */
export function describeContextJoin(node, options = {}) {
    try { return describeContextJoinData(node, options); }
    catch { return failure('INVALID_SETTINGS', 'Context Join settings could not be consumed as plain data.'); }
}
function describeContextJoinData(node, options) {
    node = parseSettings(node);
    if (!node || !inspectContextData(options).ok) return failure('INVALID_SETTINGS', 'Context Join requires pre phase and 2–16 unique bounded Context slots.');
    options = structuredClone(options);
    if (!options || Array.isArray(options) || typeof options !== 'object' || (Object.hasOwn(options, 'phase') && options.phase !== 'pre')) return failure('INVALID_SETTINGS', 'Context Join requires pre phase and 2–16 unique bounded Context slots.');
    const ports = node.inputs.map(slot => ({ ...slot, kind: 'context', direction: 'input', required: true, cardinality: 'one' }));
    ports.push({ id: 'out', label: 'Context', kind: 'context', direction: 'output', required: false, cardinality: 'one' });
    return freezeContextData({ ok: true, data: { descriptor: {
        id: 'context-join', title: 'Context Join', family: 'Shaping', phase: 'pre', minimumSchema: 3,
        input: 'context', output: 'context', requestBound: 0, modelRole: null, terminal: false,
        controls: ['inputs'], defaults: { inputs: structuredClone(DEFAULT_INPUTS) },
        controlDescriptors: { inputs: { type: 'array', items: 'context-slot', min: 2, max: 16, default: structuredClone(DEFAULT_INPUTS) } },
    }, ports } });
}

/**
 * @param {unknown} node Persisted ordered inputs, parsed into owned data internally.
 * @param {unknown} namedInputs Plain own-property map of Context artifacts keyed by stable pin ID.
 * @returns {ContextJoinResult} Deeply frozen success or explicit failure, never a partial artifact.
 */
export function executeContextJoin(node, namedInputs) {
    try { return executeContextJoinData(node, namedInputs); }
    catch { return failure('INVALID_CONTEXT', 'Context Join inputs could not be consumed as plain data.'); }
}
function executeContextJoinData(node, namedInputs) {
    node = parseSettings(node);
    if (!node) return failure('INVALID_SETTINGS', 'Context Join requires 2–16 unique bounded Context slots.');
    if (!namedInputs || Array.isArray(namedInputs) || typeof namedInputs !== 'object') return failure('INVALID_CONTEXT', 'Expected a plain named-input map.');
    let properties;
    try {
        const prototype = Object.getPrototypeOf(namedInputs);
        if (prototype !== Object.prototype && prototype !== null) return failure('INVALID_CONTEXT', 'Expected a plain named-input map.');
        properties = Object.getOwnPropertyDescriptors(namedInputs);
        const slotIds = new Set(node.inputs.map(slot => slot.id));
        for (const key of Reflect.ownKeys(properties)) {
            if (typeof key !== 'string' || !slotIds.has(key) || !properties[key].enumerable || !Object.hasOwn(properties[key], 'value')) return failure('INVALID_CONTEXT', 'Named inputs must be own enumerable Context pin values.');
        }
    } catch { return failure('INVALID_CONTEXT', 'Named inputs could not be inspected as plain data.'); }
    const inputs = new Map();
    for (const slot of node.inputs) {
        if (!Object.hasOwn(properties, slot.id)) return failure('MISSING_INPUT', 'A required Context input is missing.', { portId: slot.id });
        const parsed = parseRuntimeContext(properties[slot.id].value);
        if (!parsed.ok) return failure(parsed.error.code, parsed.error.message, { portId: slot.id });
        inputs.set(slot.id, parsed.data);
    }
    const messages = [], original = [], sources = [], origins = [], counts = [], duplicateIds = [], originalDuplicateIds = [];
    const messageOrigins = new Map(), originalOrigins = new Map();
    const inputMaterial = [];
    const merge = (items, scope, portId, output, known, duplicates, material) => {
        const retained = [];
        let deduplicated = 0;
        for (const item of items) {
            const payload = canonicalContextData(item), previous = known.get(item.id);
            if (previous && (previous.payload !== payload || previous.scope !== scope)) return failure('CONTEXT_ID_CONFLICT', 'A Context message ID has conflicting payload or source scope.', { messageId: item.id, portIds: [previous.portId, portId], material });
            if (previous && previous.payload === payload && previous.scope === scope) {
                deduplicated++;
                if (!duplicates.includes(item.id)) duplicates.push(item.id);
            } else {
                output.push(structuredClone(item));
                retained.push(item.id);
                known.set(item.id, { payload, scope, portId });
            }
        }
        return { retained, deduplicated };
    };
    let derived = false;
    for (const slot of node.inputs) {
        const input = inputs.get(slot.id), originals = Object.hasOwn(input, 'original') ? input.original : input.messages;
        const source = Object.hasOwn(input, 'source') ? input.source : null;
        const scope = canonicalContextData(source);
        inputMaterial.push({ portId: slot.id, scope, originals,
            current: new Map(input.messages.map(item => [item.id, canonicalContextData(item)])) });
        const current = merge(input.messages, scope, slot.id, messages, messageOrigins, duplicateIds, 'messages');
        if (current.ok === false) return current;
        const preserved = merge(originals, scope, slot.id, original, originalOrigins, originalDuplicateIds, 'original');
        if (preserved.ok === false) return preserved;
        sources.push({ portId: slot.id, source: structuredClone(source) });
        origins.push({ portId: slot.id, messageIds: current.retained, originalMessageIds: preserved.retained });
        counts.push({ portId: slot.id, inputCount: input.messages.length, retainedCount: current.retained.length, deduplicatedCount: current.deduplicated,
            originalInputCount: originals.length, originalRetainedCount: preserved.retained.length, originalDeduplicatedCount: preserved.deduplicated });
        if (Object.hasOwn(input, 'derived') && input.derived === true) derived = true;
    }
    const artifact = { kind: 'context', messages, original,
        source: { operation: 'context-join', inputs: sources },
        provenance: { operation: 'context-join', version: 1, origins },
        ...(derived ? { derived: true } : {}),
    };
    const output = parseRuntimeContext(artifact);
    if (!output.ok) return failure(output.error.code, output.error.message);
    // Diagnostic samples preserve exact IDs; oversized IDs are omitted, never altered.
    let diagnosticCharacters = 0;
    const sampleIds = ids => {
        const sampled = [];
        for (const id of ids) {
            if (sampled.length >= 64 || diagnosticCharacters + id.length > 8192) continue;
            sampled.push(id);
            diagnosticCharacters += id.length;
        }
        return { sampled, omitted: ids.length - sampled.length };
    };
    const duplicates = sampleIds(duplicateIds), originalDuplicates = sampleIds(originalDuplicateIds);
    const reports = [{ code: 'CONTEXT_JOIN', inputs: counts, outputCount: messages.length, originalCount: original.length,
        duplicateIds: duplicates.sampled, originalDuplicateIds: originalDuplicates.sampled,
        ...(duplicates.omitted ? { duplicateIdsOmitted: duplicates.omitted } : {}),
        ...(originalDuplicates.omitted ? { originalDuplicateIdsOmitted: originalDuplicates.omitted } : {}),
    }];
    const warnings = [];
    for (const compacted of inputMaterial) {
        const omitted = compacted.originals.filter(item => !compacted.current.has(item.id));
        for (const other of inputMaterial) {
            if (other === compacted || other.scope !== compacted.scope) continue;
            const messageIds = omitted.filter(item => other.current.get(item.id) === canonicalContextData(item)).map(item => item.id);
            if (messageIds.length) {
                const sample = sampleIds(messageIds);
                warnings.push({ compactedPortId: compacted.portId, reintroducedPortId: other.portId, count: messageIds.length, messageIds: sample.sampled,
                    ...(sample.omitted ? { messageIdsOmitted: sample.omitted } : {}) });
            }
        }
    }
    if (warnings.length) reports.push({ code: 'COMPACTED_CONTEXT_REINTRODUCED', inputs: warnings });
    const diagnostics = inspectContextData(reports);
    if (!diagnostics.ok) return failure(diagnostics.error.code, diagnostics.error.message);
    return freezeContextData({ ok: true, artifact, reports });
}
