import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { operationFor } from '../src/workflow/catalog.js?v=0.27.0';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definition-data.js?v=0.27.0';
import { validateDefinition } from '../src/workflow/definitions.js?v=0.27.0';
import { prepareCreateFromSelection, prepareUnpack } from '../src/workflow/composition.js?v=0.27.0';
import { compileIterationHelper } from '../src/workflow/iteration-helpers.js?v=0.27.0';
import { isScopedSystemOperation } from '../src/workflow/system-capabilities.js?v=0.27.0';
import { prepareNativeSearchCatalog, resolveNativeSearchChoice } from '../src/ui/native-search-catalog.js?v=0.27.0';

const cases = [
    ['scene-context', {}], ['reply-snapshot', {}], ['guidance', {}], ['apply-reply', {}],
    ['prompt-source', {}], ['actor-context', { actorId: 'actor:mara' }], ['player-event-source', {}],
    ['memory', { mode: 'read' }], ['memory', { mode: 'recall' }], ['memory', { mode: 'commit', idempotencyKey: 'static-commit' }],
    ['recall', { actorId: 'actor:mara', memorySetId: 'memories' }], ['hotkey-arm', { actorId: 'actor:mara', memorySetId: 'memories' }],
    ['on-send', {}], ['review-publish', {}], ['state', { mode: 'value' }], ['state', { mode: 'curve' }], ['state', { mode: 'track' }],
];
const node = (operation, controls = {}, id = 'unit') => ({ id, type: 'workflow', operation, ...controls });
const graph = unit => ({ id: 'static-root', schema: 3, runtime: 2, mode: 'native-unified', nodes: { [unit.id]: unit }, wires: {}, definitions: {} });
const finalize = draft => {
    const identity = computeDefinitionIdentity(draft); assert.equal(identity.ok, true, JSON.stringify(identity));
    return { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
};
const controller = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
const eligibilitySource = controller.slice(controller.indexOf('function canCreateSubgraph('), controller.indexOf('\nfunction canvasPreviewMenuItems('));
const eligible = editorDraw => Function('editorDraw', 'operationFor', 'isScopedSystemOperation', eligibilitySource + '\nreturn canCreateSubgraph;')(editorDraw, operationFor, isScopedSystemOperation);

for (const [operation, controls] of cases) {
    const label = operation + (controls.mode ? ' ' + controls.mode : '');
    test(`static extraction preserves ${label} and its ordinary operation controls`, () => {
        const root = graph(node(operation, controls)), before = structuredClone(root);
        const extracted = prepareCreateFromSelection(root, { nodeIds: ['unit'], definitionId: 'static-operation', name: 'Static operation' });
        assert.equal(extracted.ok, true, JSON.stringify(extracted));
        const definition = extracted.data.candidate.definitions[definitionRefKey(extracted.data.definitionRef)];
        assert.equal(definition.body.nodes.unit.operation, operation);
        for (const [key, value] of Object.entries(controls)) assert.deepEqual(definition.body.nodes.unit[key], value);
        assert.equal(validateDefinition(definition, extracted.data.candidate.definitions).ok, true);
        const unpacked = prepareUnpack(extracted.data.candidate, { instancePath: [extracted.data.instanceId] });
        assert.equal(unpacked.ok, true, JSON.stringify(unpacked));
        assert.equal(Object.values(unpacked.data.candidate.nodes).some(unit => unit.operation === operation), true);
        assert.deepEqual(root, before);
    });
    test(`static definition validation admits ${label} without portable capability flags`, () => {
        const draft = { id: 'static-operation', version: 1, name: 'Static operation', interface: [], parameters: [], body: graph(node(operation, controls)) };
        delete draft.body.id; delete draft.body.definitions;
        assert.equal(validateDefinition(finalize(draft)).ok, true);
    });
    test(`Create subgraph is available for ${label}`, () => {
        assert.equal(eligible(graph(node(operation, controls)))(['unit']), true);
    });
}

test('nested search offers all ordinary host operations and Memory variants', () => {
    const catalog = prepareNativeSearchCatalog({ schema: 3, runtime: 2, mode: 'native-unified', workflowId: 'static-root', viewPath: ['system'], inDefinition: true });
    assert.equal(catalog.ok, true, JSON.stringify(catalog));
    for (const operation of new Set(cases.map(([operation]) => operation))) assert.ok(resolveNativeSearchChoice(catalog.data, 'operation:' + operation), operation);
    for (const mode of ['recall', 'commit']) assert.ok(resolveNativeSearchChoice(catalog.data, 'operation:memory:' + mode), mode);
});

test('existing boundary nodes remain unavailable for extraction from their containing definition', () => {
    for (const type of ['subgraph-input', 'subgraph-output']) assert.equal(eligible({ nodes: { boundary: { id: 'boundary', type } }, wires: {} })(['boundary']), false);
    assert.equal(eligible(graph(node('text')))(['missing']), false);
    assert.equal(eligible(graph(node('text')))([]), false);
});

const edge = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
function helper(unit, explicitState = false) {
    return finalize({ id: 'helper', version: 1, name: 'Helper', interface: [
        { id: 'item', label: 'Item', kind: 'data', direction: 'input', required: true, cardinality: 'one', boundaryNodeId: 'entry' },
        { id: 'result', label: 'Result', kind: 'data', direction: 'output', required: false, cardinality: 'one', boundaryNodeId: 'exit' },
    ], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-unified', nodes: {
        entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'item' }, exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'result' }, unit,
    }, wires: { pass: edge('pass', 'entry', 'out', 'exit', 'in'), ...(explicitState ? { snapshot: edge('snapshot', 'entry', 'out', 'unit', 'state') } : {}) } } });
}
function compile(definition, phase = 'pre', snapshots = {}) {
    const root = graph(node('text'));
    root.definitions = { [definitionRefKey(definition)]: definition, ...snapshots };
    return compileIterationHelper(root, { helper: { id: definition.id, version: definition.version, semanticHash: definition.semanticHash }, mode: 'map', phase,
        address: { workflowId: root.id, instancePath: [], nodeId: 'loop' }, requestBoundPerIteration: 0 });
}

for (const [operation, controls] of cases.filter(([operation]) => operation !== 'state')) test(`For Each still rejects ${operation}${controls.mode ? ' ' + controls.mode : ''} host authority`, () => {
    const unit = node(operation, controls), phase = operationFor(unit, { mode: 'native-unified' }).phase;
    const compiled = compile(helper(unit), phase);
    assert.equal(compiled.ok, false);
    assert.equal(compiled.error.code, 'ITERATION_AUTHORITY', JSON.stringify(compiled));
});

test('For Each independently rejects State without an explicit snapshot', () => {
    const compiled = compile(helper(node('state', { mode: 'value' })));
    assert.equal(compiled.ok, false);
    assert.equal(compiled.error.code, 'ITERATION_AUTHORITY');
});

test('For Each still admits State with an explicit snapshot', () => {
    const compiled = compile(helper(node('state', { mode: 'value' }), true));
    assert.equal(compiled.ok, true, JSON.stringify(compiled));
});

for (const snapshot of ['implicit', 'unconnected', 'connected']) test(`For Each checks ${snapshot} State snapshots through nested static wrappers`, () => {
    const exposed = snapshot !== 'implicit';
    const state = finalize({ id: 'nested-state', version: 1, name: 'Nested State', interface: exposed ? [
        { id: 'state', label: 'State', kind: 'data', direction: 'input', required: false, cardinality: 'one', boundaryNodeId: 'snapshot' },
    ] : [], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-unified', nodes: {
        unit: node('state', { mode: 'value' }), ...(exposed ? { snapshot: { id: 'snapshot', type: 'subgraph-input', interfacePortId: 'state' } } : {}),
    }, wires: exposed ? { snapshot: edge('snapshot', 'snapshot', 'out', 'unit', 'state') } : {} } });
    const wrapped = helper({ id: 'unit', type: 'subgraph', definition: { id: state.id, version: state.version, semanticHash: state.semanticHash } }, snapshot === 'connected');
    const compiled = compile(wrapped, 'pre', { [definitionRefKey(state)]: state });
    if (snapshot === 'connected') assert.equal(compiled.ok, true, JSON.stringify(compiled));
    else { assert.equal(compiled.ok, false); assert.equal(compiled.error.code, 'ITERATION_AUTHORITY', JSON.stringify(compiled)); }
});
