import { recognizeRecordedText } from './retained-text.js?v=0.27.3';
import { createRunState, reduceRunState } from './run-state.js?v=0.27.3';
import { addressKey, nodeAddress, own, plain, dense, parseRunPlan, freeze, encode, bytes, textBytes, boundedText, safeSource, safeBinding, safeError, safePortState, safeUsage, errorResult, successResult, TOTAL_RECORD_BYTES, ARTIFACT_RECORD_BYTES, RENDERED_TEXT_BYTES } from './record-data.js?v=0.27.3';

export { TOTAL_RECORD_BYTES, ARTIFACT_RECORD_BYTES, RENDERED_TEXT_BYTES };
/** @template T @typedef {{ok:true,data:T}|{ok:false,error:{code:string,message:string}}} Result */

function internPlan(plan, runId) {
    const strings = [], paths = [null], addresses = [], stringIndexes = new Map(), pathIndexes = new Map(), addressIndexes = new Map();
    const string = value => { if (!stringIndexes.has(value)) { stringIndexes.set(value, strings.length); strings.push(value); } return stringIndexes.get(value); };
    function address(value) {
        const key = addressKey(value); if (addressIndexes.has(key)) return addressIndexes.get(key);
        const workflow = string(value.workflowId); let path = 0;
        for (const id of value.instancePath) { const instance = string(id), pathKey = path + ':' + instance; if (!pathIndexes.has(pathKey)) { pathIndexes.set(pathKey, paths.length); paths.push([path, instance]); } path = pathIndexes.get(pathKey); }
        const index = addresses.length; addresses.push([workflow, path, string(value.nodeId)]); addressIndexes.set(key, index); return index;
    }
    for (const unit of plan.units) address(unit.address);
    const units = plan.units.map(unit => ({ address: address(unit.address), included: unit.included, ...(unit.phase?{phase:unit.phase}:{}), dependencies: unit.dependencies.map(address), requestBound: unit.requestBound,
        status: unit.included ? 'waiting' : 'not-run', subphase: null, attempts: 0, startedAt: null, settledAt: null, durationMs: null,
        ports: [...unit.inputPorts.map(portId => ({ direction: 'input', port: string(portId), artifact: null })), ...unit.outputPorts.map(portId => ({ direction: 'output', port: string(portId), artifact: null }))] }));
    const target = value => value.kind === 'terminal' ? { kind: 'terminal', address: address(value.address) } : { address: address(value), port: string(value.portId) };
    const compactPlan = { workflowId: string(plan.workflowId), phase: plan.phase, mode: plan.mode, callBound: plan.callBound };
    for (const key of ['target', 'resolvedTarget']) if (plan[key]) compactPlan[key] = target(plan[key]);
    const hierarchy = plan.hierarchy.map(entry => ({ address: address(entry.address), kind: entry.kind, included: entry.included, ...(entry.parent ? { parent: address(entry.parent) } : {}) }));
    const terminals = plan.terminals.map(terminal => ({ ...target(terminal), artifact: null }));
    return { version: 1, runId, lastSeq: 0, status: 'waiting', at: null, elapsedMs: 0, plan: compactPlan, identities: { strings, paths, addresses }, units, hierarchy, terminals, artifacts: [] };
}

/** Pure mandatory metadata admission. Call before snapshot/binding/provider dispatch.
 * @param {unknown} rawPlan @param {unknown} options @returns {Result<object>}
 */
export function admitRunPlan(rawPlan, options) {
    try {
        const runId = own(options, 'runId'); if (!plain(options) || typeof runId !== 'string' || !runId) return errorResult('RUN_ID_REQUIRED', 'An explicit run ID is required.');
        const plan = parseRunPlan(rawPlan); if (!plan) return errorResult('INVALID_RUN_PLAN', 'The safe run inventory is invalid.');
        const record = internPlan(plan, runId);
        // Reserve finite-number timing growth on every row and the lifecycle envelope.
        if (bytes(record) + mandatoryReserve(record) > TOTAL_RECORD_BYTES) return errorResult('RUN_METADATA_LIMIT', 'The exact run identity and mandatory diagnostic metadata exceed the recording budget.');
        return successResult(record);
    } catch { return errorResult('INVALID_RUN_PLAN', 'The safe run inventory could not be inspected.'); }
}

const mandatoryReserve = record => 512 + record.units.length * 128 + (record.units.reduce((count, unit) => count + unit.ports.length, 0) + record.terminals.length) * 384;
function retentionBudget(skeleton) {
    const mandatoryBytes = bytes(skeleton) + mandatoryReserve(skeleton);
    const metadataAllowance = Math.min(524288, TOTAL_RECORD_BYTES - mandatoryBytes);
    return { mandatoryBytes, metadataAllowance, payloadAllowance: TOTAL_RECORD_BYTES - mandatoryBytes - metadataAllowance };
}

/** Inspect immutable identity without invoking JSON hooks or trusting a shallow freeze. */
function deeplyImmutable(raw) {
    let count = 0; const active = new Set();
    function visit(value, depth) {
        if (++count > 20000 || depth > 40) return false;
        if (value === null || typeof value !== 'object') return ['string', 'number', 'boolean'].includes(typeof value) || value === null;
        if (active.has(value) || !Object.isFrozen(value) || (!plain(value) && !dense(value))) return false;
        active.add(value);
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
            if (Array.isArray(value) && key === 'length') continue;
            if (!('value' in descriptor) || !visit(descriptor.value, depth + 1)) return false;
        }
        active.delete(value); return true;
    }
    try { return visit(raw, 0); } catch { return false; }
}

function safeReports(raw) {
    if (!dense(raw, 1000)) return undefined;
    const reports = [];
    for (let i = 0; i < Math.min(raw.length, 8); i++) {
        const report = own(raw, String(i)); if (!plain(report)) continue;
        const code = boundedText(own(report, 'code'), 128), message = boundedText(own(report, 'message'), 1024), row = {};
        if (code !== undefined) row.code = code;
        if (message !== undefined) row.message = message;
        for (const key of ['portId', 'severity']) { const value = boundedText(own(report, key), 128); if (value !== undefined) row[key] = value; }
        for (const key of ['inputCount', 'retainedCount', 'deduplicatedCount', 'originalInputCount', 'originalRetainedCount', 'originalDeduplicatedCount', 'tokens', 'targetTokens', 'omitted']) { const value = own(report, key); if (typeof value === 'number' && Number.isFinite(value) && value >= 0) row[key] = value; }
        if (code !== own(report, 'code') || message !== own(report, 'message')) row.truncated = true;
        if (Object.keys(row).length) reports.push(row);
    }
    const sample = () => reports.length < raw.length ? [...reports, { code: 'REPORTS_OMITTED', omitted: raw.length - reports.length }] : reports;
    while (bytes(sample()) > 4096 && reports.length) reports.pop();
    return sample();
}

/** Stream a bounded diagnostic prefix. Never materialize the full candidate or an unbounded clone. */
function diagnosticJSON(raw) {
    let entries = 0, length = 0;
    const active = new Set(), parts = [], limit = ARTIFACT_RECORD_BYTES - 512, overflow = {}, invalid = {};
    function append(text) {
        const size = textBytes(text);
        if (length + size > limit) throw overflow;
        parts.push(text); length += size;
    }
    function quoted(value) {
        const remaining = limit - length;
        const prefix = boundedText(value, remaining);
        if (prefix === value) append(encode(value));
        else { const encoded = encode(prefix); if (textBytes(encoded) <= remaining) append(encoded.slice(0, -1)); throw overflow; }
    }
    function visit(value, depth, artifactEnvelope = false) {
        if (++entries > 20000 || depth > 40) throw overflow;
        if (typeof value === 'string') { quoted(value); return; }
        if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) { append(encode(value)); return; }
        if (typeof value !== 'object' || active.has(value)) throw invalid;
        active.add(value);
        if (Array.isArray(value)) {
            if (!dense(value, 20000)) throw invalid;
            append('['); for (let i = 0; i < value.length; i++) { if (i) append(','); visit(own(value, String(i)), depth + 1); } append(']');
        } else {
            if (!plain(value) || Reflect.ownKeys(value).length > 20000) throw invalid;
            append('{'); let first = true;
            for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
                if (!descriptor.enumerable || !('value' in descriptor)) throw invalid;
                if (artifactEnvelope && ['calls', 'trace', 'reports', 'binding', 'providerResponse', 'applyHandle', 'candidateHandle', 'sourceToken'].includes(key)) continue;
                const item = artifactEnvelope && key === 'source' ? safeSource(descriptor.value)
                    : artifactEnvelope && key === 'error' ? safeError(descriptor.value)
                    : artifactEnvelope && key === 'usage' ? safeUsage(descriptor.value) : descriptor.value;
                if (item === undefined) continue;
                if (!first) append(','); first = false; quoted(key); append(':');
                visit(item, depth + 1, artifactEnvelope && ['context', 'draft'].includes(key));
            }
            append('}');
        }
        active.delete(value);
    }
    try { visit(raw, 0, true); return { text: parts.join(''), complete: true }; }
    catch (error) { if (error === overflow) return { text: parts.join(''), complete: false }; throw invalid; }
}

function candidateArtifact(raw) {
    const kind = boundedText(own(raw, 'kind'), 128) ?? 'unknown';
    try {
        if (!plain(raw) || typeof own(raw, 'kind') !== 'string') throw new Error('Artifact envelope required');
        const projection = diagnosticJSON(raw);
        if (projection.complete) {
            const entry = { kind, format: 'structured', value: JSON.parse(projection.text) };
            if (bytes(entry) <= ARTIFACT_RECORD_BYTES - 256) return freeze(entry);
        }
        const prefix = boundedText(projection.text, ARTIFACT_RECORD_BYTES - 512);
        return freeze({ kind, format: 'json-prefix-text', text: prefix, truncated: true });
    } catch { return freeze({ kind, format: 'omitted', reason: 'invalid-diagnostic-data' }); }
}

/** Diagnostic recorder: retains only detached bounded projections, never Apply handles.
 * Invalid factory options return a failure Result without invoking option getters.
 * @param {unknown} options
 */
export function createRunRecorder(options) {
    const runId = own(options, 'runId');
    if (!plain(options) || typeof runId !== 'string' || !runId) return errorResult('RUN_ID_REQUIRED', 'An explicit run ID is required.');
    if (bytes(runId) + 4096 > TOTAL_RECORD_BYTES) return errorResult('RUN_METADATA_LIMIT', 'The exact run ID exceeds the diagnostic metadata budget.');
    let state = createRunState(runId), skeleton = null, finished = null;
    const captures = new Map(), metadata = new Map(), omittedMetadata = new Set(), candidates = new Map(), immutableIds = new WeakMap(); let nextIdentity = 0, budget = null;
    const orderedCaptures = () => [...captures.entries()].sort(([, a], [, b]) => a.unitIndex - b.unitIndex || a.portRank - b.portRank);
    function captureMetadata(raw, unitIndex, portRank) {
        const entry = metadata.get(unitIndex) ?? {}, values = { source: safeSource(own(raw, 'source')), binding: safeBinding(own(raw, 'binding')), reports: safeReports(own(raw, 'reports')) };
        const quota = Math.max(0, Math.floor(budget.metadataAllowance / state.nodes.length) - 64);
        if (quota < 192) { if (Object.values(values).some(value => value !== undefined)) omittedMetadata.add(unitIndex); return; }
        const fieldQuota = Math.max(32, Math.floor(quota / 3) - 48);
        for (const [key, value] of Object.entries(values)) {
            if (value === undefined || (entry[key] && entry[key].rank <= portRank)) continue;
            entry[key] = bytes(value) <= fieldQuota ? { rank: portRank, value } : { rank: portRank, omitted: true };
        }
        metadata.set(unitIndex, entry);
    }
    function boundPending() {
        let pendingBytes = 0, prefixEnded = false; const seen = new Set();
        for (const [, capture] of orderedCaptures()) {
            if(capture.identity===null)continue;
            if (seen.has(capture.identity)) continue; seen.add(capture.identity);
            // Keep a canonical prefix rather than packing around gaps. The bounded scalar cost
            // survives payload eviction, so a deleted middle entry still ends that prefix.
            if (!prefixEnded && candidates.has(capture.identity) && pendingBytes + capture.size <= budget.payloadAllowance) pendingBytes += capture.size;
            else { prefixEnded = true; candidates.delete(capture.identity); }
        }
        return pendingBytes;
    }
    function accept(event) {
        if (finished) return errorResult('RUN_FINISHED', 'This diagnostic recorder is finished.');
        const next = reduceRunState(state, event);
        if (next === state) return successResult(state);
        if (!state.plan && next.plan) {
            const admitted = admitRunPlan(next.plan, { runId }); if (!admitted.ok) return admitted;
            skeleton = admitted.data;
            budget = retentionBudget(skeleton);
        }
        state = next; return successResult(state);
    }
    function capture(raw) {
        try {
            if (finished) return errorResult('RUN_FINISHED', 'This diagnostic recorder is finished.');
            if (!skeleton || !plain(raw)) return errorResult('CAPTURE_NOT_PLANNED', 'Capture requires an admitted run plan.');
            if (['cancelling', 'cancelled', 'failed', 'completed', 'unresolved', 'invalid', 'stale'].includes(state.status)) return errorResult('RUN_CLOSED', 'Late diagnostic captures cannot reopen a closed run.');
            const address = nodeAddress(own(raw, 'address')), direction = own(raw, 'direction'), portId = own(raw, 'portId');
            const unitIndex = address ? state.plan.units.findIndex(unit => addressKey(unit.address) === addressKey(address)) : -1;
            if (unitIndex < 0 || !state.plan.units[unitIndex].included) return errorResult('CAPTURE_NOT_PLANNED', 'The capture address is outside the selected plan.');
            const unit = state.plan.units[unitIndex]; let portRank;
            if (direction === 'terminal') {
                if (portId !== undefined || !state.plan.terminals.some(terminal => addressKey(terminal.address) === addressKey(address))) return errorResult('INVALID_CAPTURE_PORT', 'Host terminal results have no output pin.');
                portRank = unit.inputPorts.length + unit.outputPorts.length;
            } else {
                if (!['input', 'output'].includes(direction) || typeof portId !== 'string') return errorResult('INVALID_CAPTURE_PORT', 'Capture requires a real named port.');
                const portIndex = unit[direction === 'input' ? 'inputPorts' : 'outputPorts'].indexOf(portId);
                if (portIndex < 0) return errorResult('INVALID_CAPTURE_PORT', 'The named capture port is not in the plan.');
                portRank = portIndex + (direction === 'output' ? unit.inputPorts.length : 0);
            }
            const key = unitIndex + ':' + portRank; if (captures.has(key)) return successResult(undefined);
            const rawState=own(raw,'state'),status=rawState===undefined?'completed':own(rawState,'status');
            if(!['completed','skipped','unresolved'].includes(status))return errorResult('INVALID_CAPTURE_STATE','Capture requires a valid port state.');
            const portState=safePortState(rawState??{status:'completed'});if(!portState)return errorResult('INVALID_CAPTURE_STATE','Capture requires plain port state.');
            if(status!=='completed'){if(own(raw,'artifact')!==undefined)return errorResult('INVALID_CAPTURE_STATE','Only completed ports contain artifacts.');captures.set(key,{unitIndex,portRank,direction,portId,identity:null,state:portState});return successResult(undefined);}
            const artifact = own(raw, 'artifact'); let identity = 'capture:' + nextIdentity++;
            if (artifact && typeof artifact === 'object' && deeplyImmutable(artifact)) { if (!immutableIds.has(artifact)) immutableIds.set(artifact, identity); identity = immutableIds.get(artifact); }
            const kind = boundedText(own(artifact, 'kind'), 128) ?? 'unknown';
            if (!candidates.has(identity)) candidates.set(identity, candidateArtifact(artifact));
            captures.set(key, { unitIndex, portRank, direction, portId, identity, kind, state:portState, size: bytes(candidates.get(identity)) + 256 });
            captureMetadata(raw, unitIndex, portRank);
            boundPending();
            return successResult(undefined);
        } catch { return errorResult('INVALID_CAPTURE', 'The diagnostic capture could not be inspected.'); }
    }
    function snapshot() {
        if (finished) return finished;
        if (!skeleton) return freeze({ version: 1, runId, lastSeq: state.lastSeq, status: state.status, at: state.at, elapsedMs: state.elapsedMs, plan: null, identities: { strings: [], paths: [null], addresses: [] }, units: [], hierarchy: [], terminals: [], artifacts: [], ...(state.error ? { error: state.error } : {}) });
        const record = JSON.parse(encode(skeleton));
        record.lastSeq = state.lastSeq; record.status = state.status; record.at = state.at; record.elapsedMs = state.elapsedMs;
        const optional = state.nodes.map(node => ({ operation: node.operation, ...(node.label !== undefined ? { label: node.label } : {}), ...(node.metadataTruncated ? { metadataTruncated: true } : {}), ...(node.request ? { request: node.request } : {}), ...(node.error ? { error: node.error } : {}), ...(node.reason?{reason:node.reason}:{}), ...(node.binding ? { binding: node.binding } : {}) }));
        const runOptional = state.error ? { error: state.error } : {};
        state.nodes.forEach((node, index) => {
            for (const key of ['status', 'subphase', 'attempts', 'startedAt', 'settledAt', 'durationMs']) record.units[index][key] = node[key];
        });
        const ordered = orderedCaptures(), retained = new Map();
        for (const [unitIndex, extra] of metadata) {
            const unit = optional[unitIndex];
            if (extra.source?.value) unit.source = extra.source.value; if (extra.binding?.value) unit.binding = { ...unit.binding, ...extra.binding.value }; if (extra.reports?.value) unit.reports = extra.reports.value;
            if (Object.values(extra).some(field => field.omitted)) unit.metadataOmitted = true;
        }
        for (const unitIndex of omittedMetadata) optional[unitIndex].metadataOmitted = true;
        let metadataSize = bytes({ run: runOptional, units: optional });
        for (let i = optional.length - 1; metadataSize > budget.metadataAllowance && i >= 0; i--) { optional[i] = { metadataOmitted: true }; metadataSize = bytes({ run: runOptional, units: optional }); }
        if (metadataSize > budget.metadataAllowance) { delete runOptional.error; runOptional.metadataOmitted = true; }
        Object.assign(record, runOptional); optional.forEach((extra, index) => Object.assign(record.units[index], extra));
        for (const [key, capture] of ordered) {
            const unit = record.units[capture.unitIndex];
            if(capture.direction!=='terminal')unit.ports[capture.portRank].state=capture.state;
            if(capture.identity===null)continue;
            if (!retained.has(capture.identity)) {
                const id = record.artifacts.length;
                const origin = { address: unit.address, direction: capture.direction, ...(capture.direction !== 'terminal' ? { port: unit.ports[capture.portRank].port } : {}) };
                const candidate = candidates.get(capture.identity) ?? { kind: capture.kind, format: 'omitted', reason: 'canonical-prefix-limit' };
                record.artifacts.push({ id, origin, ...candidate }); retained.set(capture.identity, id);
            }
            const id = retained.get(capture.identity);
            if (capture.direction === 'terminal') { for (const terminal of record.terminals) if (terminal.address === unit.address) terminal.artifact = id; }
            else unit.ports[capture.portRank].artifact = id;
        }
        record.retention = { policy: 'canonical-prefix', payloadAllowance: budget.payloadAllowance, pendingBytes: boundPending(), metadataAllowance: budget.metadataAllowance, pendingMetadataBytes: [...metadata.values()].reduce((total, item) => total + bytes(item), 0) };
        for (let i = record.artifacts.length - 1; bytes(record) > TOTAL_RECORD_BYTES && i >= 0; i--) { const entry = record.artifacts[i]; record.artifacts[i] = { id: entry.id, origin: entry.origin, kind: entry.kind, format: 'omitted', reason: 'recording-byte-limit' }; }
        return freeze(record);
    }
    function finish() { if (!finished) { finished = snapshot(); captures.clear(); metadata.clear(); omittedMetadata.clear(); candidates.clear(); } return finished; }
    return freeze({ accept, capture, snapshot, finish });
}

/** Bounded display text; no parsed partial JSON and no authoritative artifact reference. */
export function formatRecordedArtifact(raw) {
    try {
        const format = own(raw, 'format');
        if (format === 'omitted') return freeze({ format: 'omitted', text: 'Artifact omitted: ' + (boundedText(own(raw, 'reason'), 256) ?? 'unavailable'), truncated: false });
        let text = format === 'json-prefix-text' ? own(raw, 'text') : encode(own(raw, 'value'));
        if (typeof text !== 'string') text = '';
        // Escaped JSON string bounding is stricter than raw UTF-8; the measured display still fits.
        const rendered = boundedText(text, RENDERED_TEXT_BYTES - 2);
        return freeze({ format: format === 'json-prefix-text' ? 'json-prefix-text' : 'structured-text', text: rendered, truncated: own(raw, 'truncated') === true || rendered !== text });
    } catch { return freeze({ format: 'omitted', text: 'Artifact omitted: invalid diagnostic data', truncated: false }); }
}

/** Complete retained Text source for deterministic local previews; never authority or a fresh run.
 * @param {unknown} raw
 * @returns {readonly Omit<import('./types').RecordedPreviewSection, 'readable' | 'collapsed' | 'notices'>[]}
 */
export function formatRecordedTextModifiers(raw) {
    try {
        const retained = recognizeRecordedText(raw); if (!retained) return freeze([]);
        const { text, rawText, trace, hasModifiers } = retained;
        const section=(label,kind,content)=>{const bounded=boundedText(content,RENDERED_TEXT_BYTES-2);return {label,kind,format:'structured-text',text:bounded,truncated:bounded!==content};};
        const sections=[{...section('Output','text',text),recordedRawText:rawText,recordedModifierTrace:trace}];
        if(hasModifiers)sections.push(section('Raw output','text',rawText),section('Modifier trace','diagnostic',encode(trace)));
        return freeze(sections);
    } catch {return freeze([]);}
}
