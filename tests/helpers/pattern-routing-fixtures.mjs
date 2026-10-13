import assert from 'node:assert/strict';
import { computeDefinitionIdentity, definitionRefKey } from '../../src/workflow/definitions.js?v=0.27.3';
import { expandRecordAddress } from '../../src/workflow/record-data.js?v=0.27.3';

export const draft = text => ({ kind: 'draft', text, source: { originalText: text } });
export const data = value => ({ kind: 'data', value });
export const node = (id, operation, settings = {}) => ({ id, type: 'workflow', operation, phase: 'post', ...settings });
export const wire = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
export const slots = (...ids) => ids.map(id => ({ id, label: id, required: false }));
export const settings = extra => ({ mode: 'whole-word', scope: 'whole', caseSensitive: false, rules: ['1', '2', '3'].map((pattern, i) => ({ id: String(i), pattern })), exemptions: [], protectedLiterals: [], matchPolicy: 'any', minOccurrences: 1, regexFlags: '', timeoutMs: 1000, ...extra });
export const fourteen = 'First.\n\n' + '1 '.repeat(12) + '3 3\n\nLast.';
export const rootGraph = (nodes, edges, definitions = {}) => ({ id: 'pattern-routing', schema: 3, runtime: 2, mode: 'native-unified', nodes, wires: Object.fromEntries(edges.map(edge => [edge.id, edge])), definitions, portals: {}, roles: {} });
export const target = (nodeId, portId = 'out', instancePath = []) => ({ workflowId: 'pattern-routing', instancePath, nodeId, portId });
export const unit = (result, nodeId, instancePath = []) => result.recording.units.find(row => { const at = expandRecordAddress(result.recording, row.address); return at.nodeId === nodeId && JSON.stringify(at.instancePath) === JSON.stringify(instancePath); });
export const retained = (outputs, nodeId, portId = 'out', instancePath = []) => outputs.find(row => row.address.nodeId === nodeId && row.portId === portId && JSON.stringify(row.address.instancePath) === JSON.stringify(instancePath))?.artifact;
export const recorded = (result, nodeId, portId = 'out', instancePath = []) => { const row = unit(result, nodeId, instancePath), pin = row?.ports.find(pin => pin.direction === 'output' && result.recording.identities.strings[pin.port] === portId); return pin?.artifact == null ? undefined : result.recording.artifacts[pin.artifact].value; };

export function routingGraph(pattern = {}, filter = {}) {
    return rootGraph({
        send: node('send', 'on-send', { phase: 'pre' }), generate: node('generate', 'generate-reply', { phase: 'pre' }),
        pattern: node('pattern', 'pattern', settings(pattern)), branch: node('branch', 'branch', { artifactKind: 'draft' }),
        filter: node('filter', 'filter-text', { action: 'remove', unit: 'paragraph', scope: 'whole', protectedLiterals: [], ...filter }),
        join: node('join', 'join', { artifactKind: 'draft', inputs: slots('filtered', 'bypass') }), review: node('review', 'review-publish'),
    }, [wire('activation', 'send', 'activation', 'generate', 'activation'), wire('source', 'generate', 'draft', 'pattern', 'in'), wire('payload', 'pattern', 'out', 'branch', 'in'), wire('condition', 'pattern', 'matched', 'branch', 'condition'), wire('selected', 'branch', 'yes', 'filter', 'in'), wire('report', 'pattern', 'matches', 'filter', 'matches'), wire('filtered', 'filter', 'out', 'join', 'filtered'), wire('bypass', 'branch', 'no', 'join', 'bypass'), wire('review', 'join', 'out', 'review', 'draft')]);
}

export function hostHarness(text, extraDraft = {}) {
    const effects = { workers: 0, captures: 0, requests: 0, commits: 0, bindings: 0, tokens: 0, filters: 0, prepares: 0 }, outputs = [], settlements = [];
    return { effects, outputs, settlements, ports: {
        snapshot() { effects.captures++; return draft(text); },
        createWorker() { effects.workers++; throw Error('Unexpected Worker'); },
        resolveBinding() { effects.bindings++; throw Error('Unexpected binding'); }, countTokens() { effects.tokens++; throw Error('Unexpected tokenizer'); }, request() { effects.requests++; throw Error('Unexpected model request'); },
        onStage(current) { if (current.operation === 'filter-text') effects.filters++; },
    }, hooks: {
        prepare() { effects.prepares++; },
        executeHostOperation(current) { if (current.operation === 'on-send') return { ok: true, outputs: { activation: data({}) } }; if (current.operation === 'generate-reply') { effects.captures++; return { ok: true, outputs: { draft: { ...draft(text), ...extraDraft }, metadata: data({}) } }; } throw Error('Unexpected host operation'); },
        retainScopedOutput(payload) { outputs.push(payload); return { ok: true, data: { retained: true } }; },
        settle(payload) { settlements.push({ ...payload, terminals: [...payload.terminals] }); if (payload.terminals.length) effects.commits++; return { ok: true }; },
    } };
}

const pin = (id, kind, direction, boundaryNodeId) => ({ id, label: id, kind, direction, required: direction === 'input', cardinality: 'one', boundaryNodeId });
const finalize = value => { const result = computeDefinitionIdentity(value); assert.equal(result.ok, true, JSON.stringify(result.error)); return { ...result.data.materializedDefinition, semanticHash: result.data.semanticHash }; };
export const instance = (id, definition) => ({ id, type: 'subgraph', definition: { id: definition.id, version: definition.version, semanticHash: definition.semanticHash }, parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {} });
export function patternWrappers() {
    const interfaces = [pin('draft', 'draft', 'input', 'entry'), pin('out', 'draft', 'output', 'exit'), pin('matches', 'data', 'output', 'report')];
    const inner = finalize({ id: 'pattern-inner', version: 1, name: 'Detector', interface: interfaces, parameters: [], body: { schema: 3, runtime: 2, mode: 'native-post', roles: {}, nodes: {
        entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'draft' }, work: node('work', 'pattern', settings()),
        exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'out' }, report: { id: 'report', type: 'subgraph-output', interfacePortId: 'matches' },
    }, wires: Object.fromEntries([wire('a', 'entry', 'out', 'work', 'in'), wire('b', 'work', 'out', 'exit', 'in'), wire('c', 'work', 'matches', 'report', 'in')].map(edge => [edge.id, edge])) } });
    const outer = finalize({ id: 'pattern-outer', version: 1, name: 'Nested Detector', interface: interfaces, parameters: [], body: { schema: 3, runtime: 2, mode: 'native-post', roles: {}, nodes: {
        entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'draft' }, work: instance('work', inner),
        exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'out' }, report: { id: 'report', type: 'subgraph-output', interfacePortId: 'matches' },
    }, wires: Object.fromEntries([wire('a', 'entry', 'out', 'work', 'draft'), wire('b', 'work', 'out', 'exit', 'in'), wire('c', 'work', 'matches', 'report', 'in')].map(edge => [edge.id, edge])) } });
    return { inner, outer, definitions: { [definitionRefKey(inner)]: inner, [definitionRefKey(outer)]: outer } };
}
