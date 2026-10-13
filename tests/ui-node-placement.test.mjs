import test from 'node:test';
import assert from 'node:assert/strict';
import * as preparation from '../src/ui/workspace-preparation.js?v=0.27.3';
import { prepareGraphArtifacts } from '../src/workflow/graph-artifacts.js?v=0.27.3';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js?v=0.27.3';
import { makeLocalCopy } from '../src/workflow/definition-library.js?v=0.27.3';
import { nodeCard } from '../src/canvas/presentation.js?v=0.27.3';
import { fixtureGraph } from './helpers/workflow-fixtures.mjs';
import { siblingWorkflow, nestedWorkflow } from './fixtures/workflow-prepared-fixture.mjs';
import { effectiveInstanceWorkflow } from './fixtures/workflow-effective-instance.mjs';

const dynamicRoot = () => {
    const graph = fixtureGraph('structured-guidance');
    graph.nodes['compose-json'].presentation = { alias: 'Placement 🌿', compact: true };
    graph.nodes['compose-json'].modifiers = [{ id: 'trim', type: 'trim', version: 1, enabled: true, settings: { edges: 'both' } }];
    return graph;
};
const dynamicInstance = () => {
    const identity = computeDefinitionIdentity({ id: 'placement-compose', version: 1, name: 'Dynamic compose', interface: [], parameters: [{ id: 'kind', label: 'Output', target: { instancePath: [], nodeId: 'compose', controlId: 'outputKind' } }], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: { compose: { id: 'compose', type: 'workflow', operation: 'compose', operationVersion: 1, mode: 'join', outputKind: 'text', sections: [{ name: 'scene', text: 'Scene' }] } }, wires: {} } });
    assert.equal(identity.ok, true, JSON.stringify(identity.error));
    const definition = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    return { id: 'dynamic-placement', schema: 3, runtime: 2, mode: 'native-unified', nodes: { instance: { id: 'instance', type: 'subgraph', definition: { id: definition.id, version: definition.version, semanticHash: definition.semanticHash }, parameterOverrides: { kind: 'guidance' }, roleOverrides: {}, nodeBindingOverrides: {} } }, wires: {}, definitions: { [definitionRefKey(definition)]: definition } };
};
const privateBoundary = () => { const result = makeLocalCopy(siblingWorkflow(), { instancePath: ['first/path'], id: 'placement-owned' }); assert.equal(result.ok, true); return result.data.candidate; };
const unpositioned = () => ({ id: 'unpositioned', schema: 3, runtime: 2, mode: 'native-unified', nodes: { first: { id: 'first', type: 'workflow', operation: 'text', phase: 'pre', text: 'First' }, second: { id: 'second', type: 'workflow', operation: 'text', phase: 'pre', text: 'Second' } }, wires: {}, groups: {}, roles: {}, portals: {}, definitions: {} });
for (const [label, create, nodeId, viewPath] of [
    ['dynamic root card', dynamicRoot, 'compose-json', []],
    ['named wrapper pins', siblingWorkflow, 'first/path', []],
    ['private input boundary', privateBoundary, 'entry', ['first/path']],
    ['nested effective controls', () => effectiveInstanceWorkflow(true), 'compact', ['one', 'left']],
    ['fallback coordinates', unpositioned, 'second', []],
]) test('single-card placement matches full workspace for ' + label, () => {
    assert.equal(typeof preparation.prepareNodePlacement, 'function');
    const root = create(), before = structuredClone(root), admitted = prepareGraphArtifacts(root); assert.equal(admitted.ok, true, JSON.stringify(admitted.error));
    const full = preparation.prepareWorkspaceViews(root, { artifacts: admitted.data }); assert.equal(full.ok, true, JSON.stringify(full.error));
    const expected = full.data.preparedViews.find(view => JSON.stringify(view.identity.instancePath ?? []) === JSON.stringify(viewPath)).drawBase;
    const placement = preparation.prepareNodePlacement(root, { nodeId, viewPath, artifacts: admitted.data }); assert.equal(placement.ok, true, JSON.stringify(placement.error));
    const { graph, node } = placement.data;
    assert.deepEqual(Object.keys(graph.nodes), [nodeId]); assert.deepEqual(Object.keys(graph.nativeCards), [nodeId]); assert.equal(node, graph.nodes[nodeId]);
    assert.deepEqual(node, expected.nodes[nodeId]); assert.deepEqual(graph.nativeCards[nodeId], expected.nativeCards[nodeId]);
    assert.deepEqual(nodeCard(node, { graph }), nodeCard(expected.nodes[nodeId], { graph: expected }));
    assert.deepEqual(root, before); assert.equal(Object.isFrozen(node), false);
    node.title = 'local measurement'; graph.nativeCards[nodeId].canonicalTitle = 'local metadata';
    assert.notEqual(root.nodes[nodeId]?.title, 'local measurement'); assert.notEqual(expected.nativeCards[nodeId].canonicalTitle, 'local metadata');
    assert.deepEqual(root, before, 'local measurement changes never mutate the root or nested definition');
});

test('single-card placement rejects forged or stale artifacts and unknown qualified nodes', () => {
    assert.equal(typeof preparation.prepareNodePlacement, 'function');
    const root = dynamicRoot(), artifacts = prepareGraphArtifacts(root).data, nodeId = 'compose-json';
    for (const token of [{}, structuredClone(artifacts), prepareGraphArtifacts(unpositioned()).data]) {
        assert.equal(preparation.prepareNodePlacement(root, { nodeId, artifacts: token }).error.code, 'INVALID_GRAPH_ARTIFACTS');
    }
    for (const options of [{ nodeId: 'absent' }, { nodeId, viewPath: ['absent'] }, { nodeId: 'constructor' }]) assert.equal(preparation.prepareNodePlacement(root, { ...options, artifacts }).ok, false);
    root.nodes[nodeId].title = 'raw change'; assert.equal(preparation.prepareNodePlacement(root, { nodeId, artifacts }).error.code, 'INVALID_GRAPH_ARTIFACTS');
    const fresh = preparation.prepareNodePlacement(root, { nodeId }); assert.equal(fresh.ok, true); assert.equal(fresh.data.node.title, 'raw change');
    let reads = 0; Object.defineProperty(root.nodes[nodeId], 'title', { enumerable: true, get() { reads++; throw Error('getter'); } });
    assert.equal(preparation.prepareNodePlacement(root, { nodeId }).ok, false); assert.equal(reads, 0);
});

test('single-card placement clones only its selected drawing node and metadata', () => {
    assert.equal(typeof preparation.prepareNodePlacement, 'function');
    const root = { id: 'placement-counts', schema: 3, runtime: 2, mode: 'native-unified', nodes: Object.fromEntries(Array.from({ length: 100 }, (_, index) => ['n' + index, { id: 'n' + index, type: 'workflow', operation: 'text', phase: 'pre', x: index * 10, y: 50, text: 'Content ' + index }])), wires: {}, groups: {}, roles: {}, portals: {}, definitions: {} };
    const artifacts = prepareGraphArtifacts(root).data, clone = globalThis.structuredClone, graphNodeCounts = []; let drawClones = 0;
    globalThis.structuredClone = function(value, ...options) {
        if (new Error().stack.includes('prepareEditorDrawBase')) {
            drawClones++; if (value?.nodes) graphNodeCounts.push(Object.keys(value.nodes).length);
        }
        return clone(value, ...options);
    };
    let placement;
    try { placement = preparation.prepareNodePlacement(root, { nodeId: 'n99', artifacts }); }
    finally { globalThis.structuredClone = clone; }
    assert.equal(placement.ok, true, JSON.stringify(placement.error));
    assert.deepEqual(graphNodeCounts, [1], 'the drawing clone never copies all authored nodes and discards them');
    assert.ok(drawClones <= 3, 'only selected graph/defaults/control descriptors are cloned, calls=' + drawClones);
});


const expectedCard = (root, artifacts, nodeId, viewPath) => {
    const placement = preparation.prepareNodePlacement(root, { artifacts, nodeId, viewPath });
    assert.equal(placement.ok, true, JSON.stringify(placement.error));
    return nodeCard(placement.data.node, { graph: placement.data.graph });
};
for (const [label, create, nodeId, viewPath] of [
    ['dynamic root ports and modifiers', dynamicRoot, 'compose-json', []],
    ['post-phase dynamic ports', () => fixtureGraph('literal-cleanup'), 'text-rules', []],
    ['root wrapper interface', siblingWorkflow, 'first/path', []],
    ['child wrapper interface', nestedWorkflow, 'work', ['first/path']],
    ['shared input boundary', siblingWorkflow, 'entry', ['first/path']],
    ['private input boundary', privateBoundary, 'entry', ['first/path']],
    ['private output boundary', privateBoundary, 'exit', ['first/path']],
    ['effective override changes port kind', dynamicInstance, 'compose', ['instance']],
    ['nested effective parameter override', () => effectiveInstanceWorkflow(true), 'compact', ['one', 'left']],
    ['nested inherited phase', () => effectiveInstanceWorkflow(true), 'inherited', ['one', 'left']],
    ['fallback coordinates', unpositioned, 'second', []],
]) test('token-only placement card matches admitted placement for ' + label, () => {
    assert.equal(typeof preparation.prepareNodePlacementCard, 'function');
    const root = create(), before = structuredClone(root), artifacts = prepareGraphArtifacts(root).data;
    const expected = expectedCard(root, artifacts, nodeId, viewPath);
    const placement = preparation.prepareNodePlacementCard(artifacts, { nodeId, viewPath });
    assert.equal(placement.ok, true, JSON.stringify(placement.error));
    assert.deepEqual(placement.data, expected);
    if (label === 'effective override changes port kind') assert.equal(placement.data.ports.find(port => port.dir === 'out').kind, 'guidance');
    if (label.includes('boundary')) assert.equal(placement.data.boundary.editable, label.startsWith('private'));
    assert.equal(Object.isFrozen(placement.data), false); assert.equal(Object.isFrozen(placement.data.ports), false);
    placement.data.title = 'measurement only';
    if (placement.data.ports.length) placement.data.ports[0].label = 'measurement pin';
    if (placement.data.boundary) placement.data.boundary.editable = !placement.data.boundary.editable;
    if (placement.data.modifierSummary) placement.data.modifierSummary.labels[0] = 'measurement modifier';
    assert.deepEqual(preparation.prepareNodePlacementCard(artifacts, { nodeId, viewPath }).data, expected);
    assert.deepEqual(root, before);
});

test('token-only placement rejects forged getter tokens without invoking their fields', () => {
    assert.equal(typeof preparation.prepareNodePlacementCard, 'function');
    const artifacts = prepareGraphArtifacts(dynamicRoot()).data;
    let reads = 0;
    const forged = Object.defineProperties({}, {
        snapshot: { enumerable: true, get() { reads++; throw Error('token snapshot getter'); } },
        checked: { enumerable: true, get() { reads++; throw Error('token expansion getter'); } },
    });
    for (const token of [{}, structuredClone(artifacts), forged, undefined, null, 3]) {
        assert.equal(preparation.prepareNodePlacementCard(token, { nodeId: 'compose-json' }).error.code, 'INVALID_GRAPH_ARTIFACTS');
    }
    assert.equal(reads, 0);
    for (const options of [{ nodeId: 'absent' }, { nodeId: 'constructor' }, { nodeId: 'compose-json', viewPath: ['absent'] }, { nodeId: 'compose-json', viewPath: [3] }]) {
        assert.equal(preparation.prepareNodePlacementCard(artifacts, options).error.code, 'NODE_PLACEMENT');
    }
});

test('token-only placement intentionally measures the exact historical owned snapshot', () => {
    assert.equal(typeof preparation.prepareNodePlacementCard, 'function');
    const root = privateBoundary(), artifacts = prepareGraphArtifacts(root).data, nodeId = 'entry', viewPath = ['first/path'];
    const expected = expectedCard(root, artifacts, nodeId, viewPath);
    const definition = root.definitions[definitionRefKey(root.nodes['first/path'].definition)];
    definition.interface[0].label = 'Changed raw interface'; root.localDefinitionOwners = []; delete root.nodes['first/path'].localCopy;
    assert.equal(preparation.prepareNodePlacement(root, { artifacts, nodeId, viewPath }).error.code, 'INVALID_GRAPH_ARTIFACTS');
    assert.deepEqual(preparation.prepareNodePlacementCard(artifacts, { nodeId, viewPath }).data, expected);
    let reads = 0; Object.defineProperty(root, 'nodes', { enumerable: true, get() { reads++; throw Error('raw getter'); } });
    assert.deepEqual(preparation.prepareNodePlacementCard(artifacts, { nodeId, viewPath }).data, expected);
    assert.equal(reads, 0);
});

test('token-only placement does not clone or prepare complete workflow scopes', () => {
    assert.equal(typeof preparation.prepareNodePlacementCard, 'function');
    const root = dynamicRoot(), template = structuredClone(root.nodes['compose-json']);
    root.wires = {}; root.nodes = Object.fromEntries(Array.from({ length: 100 }, (_, index) => ['n' + index, { ...structuredClone(template), id: 'n' + index }]));
    root.roles = { Analysis: { model: 'unrelated retained role' } }; root.groups = { group: { id: 'group', title: 'Unrelated group', collapsed: false, members: ['n0'], x: 1, y: 2, w: 260 } };
    root.nodes.n0.inGroup = 'group';
    const admitted = prepareGraphArtifacts(root); assert.equal(admitted.ok, true, JSON.stringify(admitted.error));
    const artifacts = admitted.data;
    const clone = globalThis.structuredClone, mapSet = Map.prototype.set, descriptors = Object.getOwnPropertyDescriptors, clonedGraphs = [], forbiddenCalls = [];
    const check = () => { const stack = new Error().stack; for (const name of ['prepareWorkflowPlanner', 'prepareCompositionViews', 'cloneWorkflowDocument', 'prepareGraphArtifacts', 'graphArtifactsFor']) if (stack.includes(name)) forbiddenCalls.push(name); };
    globalThis.structuredClone = function(value, ...options) {
        check();
        if (value?.nodes) { clonedGraphs.push(Object.keys(value.nodes).length); assert.equal(value.roles, undefined); assert.equal(value.definitions, undefined); assert.equal(value.groups, undefined); assert.equal(value.wires, undefined); }
        return clone(value, ...options);
    };
    Map.prototype.set = function(...args) { check(); return mapSet.apply(this, args); };
    Object.getOwnPropertyDescriptors = function(...args) { check(); return descriptors(...args); };
    let placement;
    try { placement = preparation.prepareNodePlacementCard(artifacts, { nodeId: 'n99' }); }
    finally { globalThis.structuredClone = clone; Map.prototype.set = mapSet; Object.getOwnPropertyDescriptors = descriptors; }
    assert.equal(placement.ok, true, JSON.stringify(placement.error));
    assert.deepEqual(clonedGraphs, [1]); assert.deepEqual(forbiddenCalls, []);
    assert.equal(placement.data.id, 'n99'); assert.equal(placement.data.ports.length > 0, true);
});
