import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareCreateFromSelection, prepareUnpack } from '../src/workflow/composition.js?v=0.27.0';
import { definitionRefKey } from '../src/workflow/definition-data.js?v=0.27.0';
import { resolveWorkflow } from '../src/workflow/resolve.js?v=0.27.0';
import { exportWorkflow, parseWorkflow } from '../src/workflow/packages.js?v=0.27.0';
import { expandRecordAddress } from '../src/workflow/record-data.js?v=0.27.0';
import { unifiedRecipeHost } from './helpers/unified-recipe-host.mjs';

const node = (id, operation, controls = {}) => ({ id, type: 'workflow', operation, operationVersion: 1, ...controls });
const wire = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
function generationGraph() {
    const edges = [
        wire('activation', 'send', 'activation', 'generate', 'activation'),
        wire('first-context', 'scene', 'out', 'join', 'context-1'),
        wire('second-context', 'other-scene', 'out', 'join', 'context-2'),
        wire('joined', 'join', 'out', 'compact', 'in'),
        wire('compacted', 'compact', 'out', 'plan', 'in'),
        wire('guidance', 'plan', 'out', 'generate', 'guidance'),
        wire('reply', 'generate', 'draft', 'review', 'draft'),
    ];
    return { id: 'generation-subgraph', schema: 3, runtime: 2, mode: 'native-unified', definitions: {}, portals: {}, nodes: {
        send: node('send', 'on-send'), scene: node('scene', 'scene-context', { visibilityMode: 'public' }),
        'other-scene': node('other-scene', 'scene-context', { visibilityMode: 'public' }),
        join: node('join', 'context-join'), compact: node('compact', 'smart-compactor', { method: 'select' }),
        plan: node('plan', 'response-plan'), generate: node('generate', 'generate-reply'), review: node('review', 'review-publish'),
    }, wires: Object.fromEntries(edges.map(edge => [edge.id, edge])) };
}
function extract(graph, nodeIds = ['join', 'compact', 'plan', 'generate'], extra = {}) {
    return prepareCreateFromSelection(graph, { nodeIds, definitionId: 'generation-body', instanceId: 'generation', name: 'Reply generation', ...extra });
}

test('the pictured selection wraps preparation and Generate Reply with its owned native continuation', async () => {
    const graph = generationGraph(), before = structuredClone(graph), prepared = extract(graph);
    assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
    assert.deepEqual(graph, before);
    const root = prepared.data.candidate, definition = root.definitions[definitionRefKey(root.nodes.generation.definition)];
    assert.deepEqual(definition.interface.filter(port => port.direction === 'input').map(port => port.kind).sort(), ['context', 'context', 'data']);
    assert.deepEqual(definition.interface.filter(port => port.direction === 'output').map(port => port.kind).sort(), ['data', 'draft']);
    assert.equal(root.wires.activation.to, 'generation');
    assert.equal(root.wires['first-context'].to, 'generation');
    assert.equal(root.wires['second-context'].to, 'generation');
    assert.equal(root.wires.reply.from, 'generation');
    assert.equal(root.wires.reply.to, 'review');
    const plan = resolveWorkflow(root);
    assert.equal(plan.ok, true, JSON.stringify(plan.error));
    assert.deepEqual(plan.data.primitives.find(unit => unit.node.operation === 'generate-reply').address.instancePath, ['generation']);
    const roundtrip = parseWorkflow(JSON.stringify(exportWorkflow(root)));
    assert.equal(roundtrip.ok, true, JSON.stringify(roundtrip.error));
    const f = unifiedRecipeHost(roundtrip.data, { request: async () => ({ ok: true, data: { text: 'Follow the scene.', finish: 'stop' } }) });
    try {
        const result = await f.generate('Native reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(f.calls(), 1);
        assert.equal(result.reviewHandles.length, 1);
        assert.equal(f.c.chat[1].mes, 'Native reply.');
        const generator = result.recording.units.find(unit => unit.operation === 'generate-reply');
        assert.equal(generator.status, 'completed');
        assert.deepEqual(expandRecordAddress(result.recording, generator.address).instancePath, ['generation']);
        assert.equal((await f.controller.apply(result.reviewHandles[0])).ok, true);
    } finally { f.controller.dispose(); }
    const unpacked = prepareUnpack(root, { instancePath: ['generation'] });
    assert.equal(unpacked.ok, true, JSON.stringify(unpacked.error));
    assert.equal(resolveWorkflow(unpacked.data.candidate).ok, true);
});

test('nested Generate Reply remains unavailable to public runners and manual previews', async () => {
    const { runWorkflow } = await import('../src/workflow/runtime.js?v=0.27.0');
    const prepared = extract(generationGraph());
    assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
    const root = prepared.data.candidate, target = { workflowId: root.id, instancePath: ['generation'], nodeId: 'generate', portId: 'metadata' };
    let forgedCalls = 0;
    const publicResult = await runWorkflow(root, { target, executeHostOperation: () => { forgedCalls++; return { ok: true }; } });
    assert.equal(publicResult.error.code, 'HOST_OPERATION_REQUIRED');
    assert.equal(forgedCalls, 0);
    const f = unifiedRecipeHost(root, { request: () => assert.fail('Preview must not request a model') });
    try {
        const preview = await f.controller.runTarget(root, target);
        assert.equal(preview.error.code, 'NATIVE_OWNER_MISSING');
        assert.equal(preview.actualCalls, 0);
        assert.deepEqual(preview.reviewHandles, []);
        assert.equal(f.calls(), 0);
        assert.equal(f.saves(), 0);
    } finally { f.controller.dispose(); }
});

test('two selected generation subgraphs fail before native or auxiliary requests', async () => {
    const prepared = extract(generationGraph());
    assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
    const root = prepared.data.candidate;
    delete root.localDefinitionOwners;
    delete root.nodes.generation.localCopy;
    root.nodes.second = { ...structuredClone(root.nodes.generation), id: 'second' };
    root.nodes['second-review'] = node('second-review', 'review-publish');
    for (const edge of Object.values(root.wires)) {
        if (edge.to === 'generation') root.wires[edge.id + '-second'] = { ...edge, id: edge.id + '-second', to: 'second' };
    }
    root.wires['second-reply'] = { ...root.wires.reply, id: 'second-reply', from: 'second', to: 'second-review' };
    assert.equal(resolveWorkflow(root).error.code, 'MULTIPLE_NATIVE_GENERATIONS');
    const f = unifiedRecipeHost(root, { request: () => assert.fail('Duplicate generators must fail before requests') });
    try {
        const result = await f.generate('Unused reply.');
        assert.equal(result.error.code, 'MULTIPLE_NATIVE_GENERATIONS');
        assert.equal(f.calls(), 0);
        assert.equal(f.c.chat.length, 1);
    } finally { f.controller.dispose(); }
});

test('wrapping an existing generation subgraph preserves its full nested continuation address', async () => {
    const inner = extract(generationGraph());
    assert.equal(inner.ok, true, JSON.stringify(inner.error));
    const outer = extract(inner.data.candidate, ['generation'], { definitionId: 'outer-generation-body', instanceId: 'outer' });
    assert.equal(outer.ok, true, JSON.stringify(outer.error));
    const f = unifiedRecipeHost(outer.data.candidate, { request: async () => ({ ok: true, data: { text: 'Follow the scene.', finish: 'stop' } }) });
    try {
        const result = await f.generate('Nested native reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(result.reviewHandles.length, 1);
        assert.equal(f.calls(), 1);
        const generator = result.recording.units.find(unit => unit.operation === 'generate-reply');
        assert.deepEqual(expandRecordAddress(result.recording, generator.address).instancePath, ['outer', 'generation']);
    } finally { f.controller.dispose(); }
});

test('unpacking Generate Reply with unconnected optional guidance keeps a runnable native reply path', async () => {
    const graph = generationGraph();
    delete graph.wires.guidance;
    const prepared = extract(graph, ['generate']);
    assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
    assert.equal(resolveWorkflow(prepared.data.candidate).ok, true);
    const unpacked = prepareUnpack(prepared.data.candidate, { instancePath: ['generation'] });
    assert.equal(unpacked.ok, true, JSON.stringify(unpacked.error));
    const plan = resolveWorkflow(unpacked.data.candidate);
    assert.equal(plan.ok, true, JSON.stringify(plan.error));
    const f = unifiedRecipeHost(unpacked.data.candidate, { request: () => assert.fail('Unconnected planning must not request a model') });
    try {
        const result = await f.generate('Unguided native reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(result.reviewHandles.length, 1);
        assert.equal(f.calls(), 0);
    } finally { f.controller.dispose(); }
});

test('unpacking a disabled generation subgraph preserves disabled nodes and response output stages', async () => {
    const { inspectExpandedGraph } = await import('../src/workflow/graph-validation.js?v=0.27.0');
    const prepared = extract(generationGraph());
    assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
    prepared.data.candidate.nodes.generation.enabled = false;
    const unpacked = prepareUnpack(prepared.data.candidate, { instancePath: ['generation'] });
    assert.equal(unpacked.ok, true, JSON.stringify(unpacked.error));
    const root = unpacked.data.candidate, expanded = inspectExpandedGraph(root);
    assert.equal(expanded.ok, true, JSON.stringify(expanded.error));
    for (const id of Object.values(unpacked.data.identityMap.nodes)) assert.equal(root.nodes[id].enabled, false);
    const outputs = unpacked.data.generatedReroutes.filter(reroute => reroute.direction === 'output');
    assert.equal(outputs.length, 2);
    for (const output of outputs) assert.equal(expanded.data.primitives.find(unit => unit.address.nodeId === output.nodeId).phase, 'post');
});

test('unpacking a generation subgraph inside another definition preserves its native continuation', async () => {
    const inner = extract(generationGraph());
    assert.equal(inner.ok, true, JSON.stringify(inner.error));
    const outer = extract(inner.data.candidate, ['generation'], { definitionId: 'nested-unpack-body', instanceId: 'outer' });
    assert.equal(outer.ok, true, JSON.stringify(outer.error));
    const unpacked = prepareUnpack(outer.data.candidate, { instancePath: ['outer', 'generation'] });
    assert.equal(unpacked.ok, true, JSON.stringify(unpacked.error));
    assert.equal(resolveWorkflow(unpacked.data.candidate).ok, true);
    const f = unifiedRecipeHost(unpacked.data.candidate, { request: async () => ({ ok: true, data: { text: 'Follow the scene.', finish: 'stop' } }) });
    try {
        const result = await f.generate('Nested unpacked reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(result.reviewHandles.length, 1);
        assert.equal(f.calls(), 1);
    } finally { f.controller.dispose(); }
});

test('unpacking nested generation preserves an optional ancestor guidance connection without requiring it', async () => {
    const graph = generationGraph();
    delete graph.wires.guidance;
    const inner = extract(graph, ['generate']);
    assert.equal(inner.ok, true, JSON.stringify(inner.error));
    const outer = extract(inner.data.candidate, ['generation'], { definitionId: 'optional-unpack-body', instanceId: 'outer' });
    assert.equal(outer.ok, true, JSON.stringify(outer.error));
    const unpacked = prepareUnpack(outer.data.candidate, { instancePath: ['outer', 'generation'] });
    assert.equal(unpacked.ok, true, JSON.stringify(unpacked.error));
    const root = unpacked.data.candidate;
    const plan = resolveWorkflow(root);
    assert.equal(plan.ok, true, JSON.stringify(plan.error));
    const f = unifiedRecipeHost(root, { request: async () => ({ ok: true, data: { text: 'Later guidance.', finish: 'stop' } }) });
    try {
        const absent = await f.generate('No guidance yet.');
        assert.equal(absent.ok, true, JSON.stringify(absent.error));
        assert.equal(f.calls(), 0);
        const definition = root.definitions[definitionRefKey(root.nodes.outer.definition)];
        const guidance = definition.interface.find(port => port.direction === 'input' && port.kind === 'guidance');
        root.wires.guidance = wire('guidance', 'plan', 'out', 'outer', guidance.id);
        assert.equal(resolveWorkflow(root).ok, true);
        f.c.chat.push({ mes: 'Use planning now.', is_user: true, extra: {} });
        const bound = await f.generate('Guided reply.');
        assert.equal(bound.ok, true, JSON.stringify(bound.error));
        assert.equal(f.calls(), 1);
    } finally { f.controller.dispose(); }
});

test('unpacking an optional guidance input preserves portal fanout and the external publisher', async () => {
    const { computeDefinitionIdentity } = await import('../src/workflow/definition-data.js?v=0.27.0');
    const prepared = extract(generationGraph(), ['generate']);
    assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
    const root = prepared.data.candidate, oldRef = root.nodes.generation.definition;
    const definition = structuredClone(root.definitions[definitionRefKey(oldRef)]);
    const guidance = definition.interface.find(port => port.direction === 'input' && port.kind === 'guidance');
    const consumer = Object.values(definition.body.wires).find(edge => edge.from === guidance.boundaryNodeId);
    definition.body.portals.guidance = { id: 'guidance', label: 'Guidance', kind: 'guidance', source: { nodeId: guidance.boundaryNodeId, portId: 'out' } };
    definition.body.wires[consumer.id] = { id: consumer.id, route: 'portal', portalId: 'guidance', to: 'generate', toPort: 'guidance' };
    const identity = computeDefinitionIdentity(definition);
    assert.equal(identity.ok, true, JSON.stringify(identity.error));
    const saved = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    delete root.definitions[definitionRefKey(oldRef)];
    root.definitions[definitionRefKey(saved)] = saved;
    root.nodes.generation.definition = { id: saved.id, version: saved.version, semanticHash: saved.semanticHash };
    root.portals.external = { id: 'external', label: 'Planning', kind: 'guidance', source: { nodeId: 'plan', portId: 'out' } };
    root.wires.guidance = { id: 'guidance', route: 'portal', portalId: 'external', to: 'generation', toPort: guidance.id };
    const unpacked = prepareUnpack(root, { instancePath: ['generation'] });
    assert.equal(unpacked.ok, true, JSON.stringify(unpacked.error));
    assert.deepEqual(unpacked.data.candidate.portals.external, root.portals.external);
    assert.equal(resolveWorkflow(unpacked.data.candidate).ok, true);
    const f = unifiedRecipeHost(unpacked.data.candidate, { request: async () => ({ ok: true, data: { text: 'Portal guidance.', finish: 'stop' } }) });
    try {
        const result = await f.generate('Portal-guided reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(f.calls(), 1);
    } finally { f.controller.dispose(); }
});


test('unpacking preserves an independent wrapper output connected to its own optional input', async () => {
    const graph = generationGraph();
    graph.nodes.constant = node('constant', 'compose', { outputKind: 'guidance', sections: [{ name: 'Style', text: 'Use vivid prose.' }] });
    const prepared = extract(graph, ['generate', 'constant']);
    assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
    const root = prepared.data.candidate, definition = root.definitions[definitionRefKey(root.nodes.generation.definition)];
    const input = definition.interface.find(port => port.direction === 'input' && port.kind === 'guidance');
    const output = definition.interface.find(port => port.direction === 'output' && port.kind === 'guidance');
    root.wires.guidance = wire('guidance', 'generation', output.id, 'generation', input.id);
    const before = resolveWorkflow(root);
    assert.equal(before.ok, true, JSON.stringify(before.error));
    const unpacked = prepareUnpack(root, { instancePath: ['generation'] });
    assert.equal(unpacked.ok, true, JSON.stringify(unpacked.error));
    assert.equal(resolveWorkflow(unpacked.data.candidate).ok, true);
    const f = unifiedRecipeHost(unpacked.data.candidate, { request: () => assert.fail('Independent guidance must not request a model') });
    try {
        const result = await f.generate('Self-connected native reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(f.calls(), 0);
    } finally { f.controller.dispose(); }
});

test('unpacking preserves a disabled optional input boundary', async () => {
    const { computeDefinitionIdentity } = await import('../src/workflow/definition-data.js?v=0.27.0');
    const prepared = extract(generationGraph(), ['generate']);
    assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
    const root = prepared.data.candidate, oldRef = root.nodes.generation.definition;
    const definition = structuredClone(root.definitions[definitionRefKey(oldRef)]);
    const input = definition.interface.find(port => port.direction === 'input' && port.kind === 'guidance');
    definition.body.nodes[input.boundaryNodeId].enabled = false;
    const identity = computeDefinitionIdentity(definition);
    assert.equal(identity.ok, true, JSON.stringify(identity.error));
    const saved = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    delete root.definitions[definitionRefKey(oldRef)];
    root.definitions[definitionRefKey(saved)] = saved;
    root.nodes.generation.definition = { id: saved.id, version: saved.version, semanticHash: saved.semanticHash };
    assert.equal(resolveWorkflow(root).error.code, 'DISABLED_OPERATION');
    const unpacked = prepareUnpack(root, { instancePath: ['generation'] });
    assert.equal(unpacked.ok, true, JSON.stringify(unpacked.error));
    assert.equal(resolveWorkflow(unpacked.data.candidate).error?.code, 'DISABLED_OPERATION');
});
