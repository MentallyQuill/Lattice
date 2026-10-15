import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportWorkflow, parseWorkflow, exportSubgraph, parseSubgraph } from '../src/workflow/packages.js';
import * as contracts from '../src/workflow/contracts.js';
import { parseWorkflowInsertionFile, prepareWorkflowInsertion } from '../src/workflow/insertion.js';
import { siblingWorkflow } from './fixtures/workflow-prepared-fixture.mjs';

const graph = siblingWorkflow();
const envelope = exportWorkflow(graph);
const before = structuredClone(graph);
for (const rejected of [
    { ...envelope, kind: 'comfytavern-workflow' },
    { ...envelope, kind: 'sillycanvas-workflow' },
    { ...envelope, schema: 1, minRuntime: 1 },
    { ...envelope, graph: { schema: 1, nodes: {}, wires: {} } },
    { ...envelope, graph: { ...graph, schema: 2, runtime: 1 } },
    graph,
    { kind: 'prompt-canvas-graph', schema: 1, graph: { schema: 1, nodes: {}, wires: {} } },
]) {
    assert.equal(parseWorkflow(JSON.stringify(rejected)).ok, false, `reject ${rejected.kind ?? 'raw graph'} schema ${rejected.schema}`);
    assert.equal(parseWorkflowInsertionFile(JSON.stringify(rejected)).ok, false, 'additive file admission uses the same current-only boundary');
}
assert.deepEqual(graph, before);
assert.equal(typeof contracts.isWorkflowGraph, 'function');
assert.equal(contracts.isWorkflowGraph(graph), true);
let reads = 0;
for (const malformed of [null, [], {}, { ...graph, schema: 1 }, { ...graph, schema: 2, runtime: 1 }, { ...graph, get schema() { reads++; return 3; } }, Object.assign(Object.create({ schema: 3 }), graph)]) {
    assert.equal(contracts.isWorkflowGraph(malformed), false);
    assert.equal(contracts.validateGraphStructure(malformed).ok, false);
}
assert.equal(reads, 0, 'classification and validation never execute getters');
for (const malformed of [{ ...graph, get annotation() { reads++; return 'unsafe'; } }, { ...graph, nodes: { get node() { reads++; return {}; } } }]) assert.equal(contracts.isWorkflowGraph(malformed), false);
const drawingScope = { schema: 3, runtime: 2, mode: 'native-pre', nodes: { boundary: { id: 'boundary', type: 'subgraph-input', interfacePortId: 'in' } }, wires: {} };
assert.equal(contracts.isWorkflowGraph(drawingScope), true, 'classification does not resolve the prepared drawing scope');
assert.equal(contracts.validateGraphStructure(drawingScope).error.code, 'ROOT_BOUNDARY', 'strict admission remains separate from classification');
const nestedAccessor = { ...drawingScope, nodes: { primitive: { id: 'primitive', type: 'workflow', get operation() { reads++; return 'scene-context'; } } } };
assert.equal(contracts.isWorkflowGraph(nestedAccessor), true, 'classification does not walk primitive controls or call the resolver');
assert.equal(contracts.validateGraphStructure(nestedAccessor).ok, false);
assert.equal(reads, 0);
const { cloneWorkflowDocument } = await import('../src/workflow/document.js');
const unfinished = { id: 'unfinished', schema: 3, runtime: 2, mode: 'native-unified', nodes: { source: { id: 'source', type: 'workflow', operation: 'scene-context' } }, wires: {} };
const cloned = cloneWorkflowDocument(unfinished);
assert.equal(cloned.ok, true);
assert.deepEqual([cloned.data.groups, cloned.data.roles, cloned.data.portals, cloned.data.definitions], [{}, {}, {}, {}]);
cloned.data.nodes.source.alias = 'Detached';
assert.equal(unfinished.nodes.source.alias, undefined);
assert.equal(parseWorkflow(JSON.stringify(exportWorkflow(unfinished))).ok, true);
assert.equal(contracts.validateWorkflow(unfinished).error.code, 'MISSING_RUN_TARGETS');
for (const retired of [{ ...unfinished, schema: 2, runtime: 1 }, { schema: 1, nodes: {}, wires: {} }]) {
    assert.equal(cloneWorkflowDocument(retired).error.code, 'UNSUPPORTED_VERSION');
    assert.equal(prepareWorkflowInsertion(unfinished, retired).ok, false);
}
const definition = Object.values(graph.definitions)[0];
const subgraph = exportSubgraph(definition, graph.definitions);
assert.deepEqual([subgraph.kind, subgraph.schema, subgraph.minRuntime], ['lattice-subgraph', 1, 2]);
assert.equal(subgraph.definition.semanticHash, definition.semanticHash, 'portable snapshots retain exact semantic pins');
assert.deepEqual(subgraph.definitions, {}, 'standalone export includes only the dependency closure and omits its duplicate top snapshot');
assert.deepEqual(Object.keys(envelope.graph.definitions), Object.keys(graph.definitions), 'portable current workflow pins retain the owning table identities');
assert.equal(parseSubgraph(JSON.stringify(subgraph)).ok, true, 'current standalone subgraph envelope schema 1 remains supported');
for (const oversized of [{ ...envelope, graph: { ...envelope.graph, description: '界'.repeat(700000) } }, { ...subgraph, definition: { ...subgraph.definition, description: '界'.repeat(700000) } }]) {
    const json = JSON.stringify(oversized);
    assert.ok(json.length < 2000000);
    assert.equal((oversized.kind === 'lattice-subgraph' ? parseSubgraph : parseWorkflow)(json).error.code, 'MALFORMED_WORKFLOW');
}
console.log('workflow-current-admission: ok');

test('current admission rejects malformed node text, presentation and layout before package or insertion use', () => {
    const currentPackage = exportWorkflow(unfinished);
    const cases = [
        ['alias', { toString: false }], ['title', { toString: false }], ['alias', 7], ['title', null],
        ['compact', 'true'], ['collapsed', 1],
        ...['x', 'y', 'w', 'h', 'width', 'height'].map(key => [key, '12']),
        ['x', null], ['y', {}], ['w', []], ['h', false], ['x', NaN], ['y', Infinity],
        ['presentation', null], ['presentation', []], ['presentation', 'card'],
        ['presentation', { alias: { toString: false } }], ['presentation', { title: false }],
        ['presentation', { compact: 'false' }], ['presentation', { collapsed: {} }],
        ...['x', 'y', 'w', 'h', 'width', 'height'].map(key => ['presentation', { [key]: null }]),
    ];
    for (const [key, value] of cases) {
        const malformed = structuredClone(unfinished); malformed.nodes.source[key] = value;
        const original = structuredClone(malformed), label = key + ': ' + JSON.stringify(value);
        assert.equal(contracts.validateGraphStructure(malformed).ok, false, label + ' rejects at current authoring admission');
        assert.throws(() => exportWorkflow(malformed), undefined, label + ' cannot be exported');
        const json = JSON.stringify({ ...currentPackage, graph: malformed });
        assert.equal(parseWorkflow(json).ok, false, label + ' cannot be imported from a current package');
        assert.equal(parseWorkflowInsertionFile(json).ok, false, label + ' cannot reach an insertion review');
        assert.equal(prepareWorkflowInsertion(unfinished, malformed).ok, false, label + ' cannot prepare an edit');
        assert.equal(cloneWorkflowDocument(malformed).ok, false, label + ' cannot cross the document boundary');
        assert.deepEqual(malformed, original, 'failed validation never rewrites the caller');
    }
});

test('known group render fields and pinned definition node presentation use the same strict admission', () => {
    const grouped = structuredClone(unfinished); grouped.groups = { group: { id: 'group', members: [], x: 0, y: -10, w: 0, collapsed: false } };
    const groupPackage = exportWorkflow(grouped);
    for (const invalid of [{ title: {} }, { name: [] }, { description: false }, { collapsed: 'false' }, { x: '0' }, { y: null }, { w: {} }, { height: false }, { frame: [] }, { frame: { x: '0', y: 0, w: 10, h: 10 } }, { frame: { x: 0, y: 0, w: 10, h: null } }]) {
        const malformed = structuredClone(grouped); Object.assign(malformed.groups.group, invalid);
        assert.equal(contracts.validateGraphStructure(malformed).ok, false, 'known group fields reject incorrect types');
        assert.equal(parseWorkflow(JSON.stringify({ ...groupPackage, graph: malformed })).ok, false);
        assert.throws(() => exportWorkflow(malformed));
    }
    const nodeId = Object.values(definition.body.nodes).find(node => node.type === 'workflow').id;
    for (const invalid of [{ alias: { toString: false } }, { title: [] }, { compact: 'false' }, { presentation: { alias: { toString: false } } }, { presentation: { x: '0' } }]) {
        const malformed = structuredClone(definition); Object.assign(malformed.body.nodes[nodeId], invalid);
        assert.throws(() => exportSubgraph(malformed, graph.definitions), undefined, 'pinned bodies cannot bypass node presentation admission');
        assert.equal(parseSubgraph(JSON.stringify({ ...subgraph, definition: malformed })).ok, false);
        const withSnapshot = structuredClone(graph); Object.assign(withSnapshot.definitions[Object.keys(graph.definitions)[0]].body.nodes[nodeId], invalid);
        assert.equal(contracts.validateGraphStructure(withSnapshot).ok, false, 'bundled snapshots are checked before expansion');
    }
});

test('optional typed presentation accepts finite zero and negative positions while extra group and wire metadata stays uninterpreted', () => {
    const current = structuredClone(graph), node = Object.values(current.nodes)[0];
    Object.assign(node, { title: '', alias: 'Typed alias', compact: false, collapsed: true, x: 0, y: -25, w: 0, h: 20, width: 100, height: 30, presentation: { alias: '', title: 'Card title', compact: true, collapsed: false, x: -12, y: 0, w: 100, h: 0, extra: { retained: true } } });
    current.groups ??= {}; current.groups.presentation = { id: 'presentation', members: [], title: '', name: 'Visual frame', description: '', collapsed: false, x: -10, y: 0, w: 0, height: 20, frame: { x: 0, y: -10, w: 0, h: 30 }, enabled: { uninterpreted: true }, extra: { toString: false } };
    const wire = Object.values(current.wires)[0]; Object.assign(wire, { kind: { uninterpreted: true }, order: ['uninterpreted'], extra: { toString: false } });
    const original = structuredClone(current);
    assert.equal(contracts.validateGraphStructure(current).ok, true);
    assert.equal(parseWorkflow(JSON.stringify(exportWorkflow(current))).ok, true);
    assert.deepEqual(current, original, 'admission does not sanitize or reinterpret unrelated metadata');
    assert.equal(contracts.validateGraphStructure(unfinished).ok, true, 'unfinished documents may omit presentation and layout entirely');
});
