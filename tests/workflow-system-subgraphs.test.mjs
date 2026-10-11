import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definition-data.js?v=0.27.0';
import { resolveWorkflow } from '../src/workflow/resolve.js?v=0.27.0';
import { unifiedRecipeHost } from './helpers/unified-recipe-host.mjs';

function system(nodes, wires = {}, interfacePorts = [], id = 'system') {
    const draft = { id, version: 1, name: 'System', interface: interfacePorts, parameters: [], body: { schema: 3, runtime: 2, mode: 'native-unified', nodes, wires } };
    const result = computeDefinitionIdentity(draft); assert.equal(result.ok, true, JSON.stringify(result));
    return { ...result.data.materializedDefinition, semanticHash: result.data.semanticHash };
}
function main(definition, ids = ['one']) {
    return { id: 'main', schema: 3, runtime: 2, mode: 'native-unified', nodes: Object.fromEntries(ids.map(id => [id, { id, type: 'subgraph', definition: { id: definition.id, version: definition.version, semanticHash: definition.semanticHash } }])), wires: {}, definitions: { [definitionRefKey(definition)]: definition } };
}
const node = (id, operation, controls = {}) => ({ id, type: 'workflow', operation, ...controls });
const target = (id, portId = 'text') => ({ workflowId: 'main', instancePath: [id], nodeId: 'read', portId });

test('static nested Read File delegates to the existing authorized host session', async () => {
    const graph = main(system({ read: node('read', 'read-file', { targetId: 'authorized' }) }));
    const f = unifiedRecipeHost(graph, { documents: [{ targetId: 'authorized', name: 'Authorized', format: 'text', content: 'System state', visibility: { kind: 'public' } }] });
    const result = await f.controller.runTarget(graph, target('one'));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(f.saves(), 0); assert.equal(f.calls(), 0);
    f.controller.dispose();
});

test('nested defaults are stable per workflow and full instance path while Chat clock stays shared', async () => {
    const definition = system({ read: node('read', 'read-file'), clock: node('clock', 'story-clock'), outcomes: node('outcomes', 'commit-outcomes') });
    const graph = main(definition, ['one', 'two']);
    const before = JSON.stringify(definition);
    const first = resolveWorkflow(graph, { target: target('one') }); assert.equal(first.ok, true, JSON.stringify(first));
    const reads = first.data.primitives.filter(unit => unit.node.operation === 'read-file');
    assert.notEqual(reads[0].node.targetId, reads[1].node.targetId);
    assert.notEqual(reads[0].node.targetId, 'lattice-default-notes');
    assert.equal(first.data.primitives.find(unit => unit.node.operation === 'story-clock').node.clockId, 'lattice-default-clock');
    assert.equal(resolveWorkflow(graph, { target: target('one') }).data.primitives.find(unit => unit.node.operation === 'read-file').node.targetId, reads[0].node.targetId);
    assert.equal(JSON.stringify(definition), before);
    const f = unifiedRecipeHost(graph);
    assert.equal((await f.controller.runTarget(graph, target('one'))).ok, true);
    assert.deepEqual(f.catalog.snapshot().data.documents.map(doc => doc.targetId), [reads[0].node.targetId]);
    assert.equal(f.saves(), 0); f.controller.dispose();
});

test('disabled wrappers skip incomplete descendants without calls or default provisioning', async () => {
    const graph = main(system({ read: node('read', 'read-file'), write: node('write', 'write-file'), model: node('model', 'response-plan') }));
    graph.nodes.one.enabled = false;
    const resolved = resolveWorkflow(graph, { target: target('one') });
    assert.equal(resolved.ok, true, JSON.stringify(resolved));
    assert.equal(resolved.data.callBound, 0);
    const f = unifiedRecipeHost(graph);
    const result = await f.controller.runTarget(graph, target('one'));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.recording.units.find(unit => unit.ports.length).ports.find(port => port.state).state.status, 'skipped');
    assert.deepEqual(f.catalog.snapshot().data.documents, []); assert.equal(f.calls(), 0); assert.equal(f.saves(), 0);
    f.controller.dispose();
    graph.nodes.one.enabled = true;
    assert.equal(resolveWorkflow(graph).error.code, 'MISSING_INPUT');
});
const edge = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
function statefulMain({ shared = false } = {}) {
    const definition = system({ read: node('read', 'read-file', shared ? { targetId: 'shared' } : {}), text: node('text', 'text', { text: 'Remember this.' }), write: node('write', 'write-file', { mode: 'append' }) }, {
        reference: edge('reference', 'read', 'reference', 'write', 'reference'), contents: edge('contents', 'text', 'out', 'write', 'text'),
    });
    const graph = main(definition, ['one', 'two']);
    Object.assign(graph.nodes, { send: node('send', 'on-send'), generate: node('generate', 'generate-reply'), review: node('review', 'review-publish') });
    graph.wires.activation = edge('activation', 'send', 'activation', 'generate', 'activation');
    graph.wires.review = edge('review', 'generate', 'draft', 'review', 'draft');
    return graph;
}
test('sibling local writers retain different addressed intents in one accepted root bundle', async () => {
    const graph = statefulMain(), f = unifiedRecipeHost(graph);
    const result = await f.generate('Native reply.'); assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(f.saves(), 0);
    const receipts = result.recording.artifacts.filter(artifact => artifact.value?.value?.intentId);
    assert.equal(new Set(receipts.map(artifact => artifact.value.value.intentId)).size, 2);
    const accepted = await f.controller.apply(result.reviewHandles[0]);
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
    assert.equal(f.saves(), 2);
    assert.equal(Object.keys(f.c.chatMetadata.latticeDocuments['default-user']).length, 2);
    f.controller.dispose();
});

test('a disabled incomplete output boundary supplies skipped state to optional and required consumers', async () => {
    const definition = system({ exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'out' } }, {}, [{ id: 'out', label: 'Out', kind: 'text', direction: 'output', required: false, cardinality: 'one', boundaryNodeId: 'exit' }]);
    const graph = main(definition); graph.nodes.one.enabled = false;
    graph.nodes.compose = node('compose', 'compose', { sections: [{ name: 'System', text: 'fallback' }] });
    graph.wires.result = edge('result', 'one', 'out', 'compose', 'section.System');
    const f = unifiedRecipeHost(graph);
    const result = await f.controller.runTarget(graph, { workflowId: 'main', instancePath: [], nodeId: 'compose', portId: 'out' });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    const composeUnit = result.recording.units.find(unit => unit.operation === 'compose');
    assert.equal(composeUnit.ports.find(port => result.recording.identities.strings[port.port] === 'section.System').state.status, 'skipped');
    graph.nodes.compose = node('compose', 'reroute', { artifactKind: 'text' });
    graph.wires.result.toPort = 'in';
    const required = await f.controller.runTarget(graph, { workflowId: 'main', instancePath: [], nodeId: 'compose', portId: 'out' });
    assert.equal(required.ok, true, JSON.stringify(required.error));
    assert.equal(required.recording.units.find(unit => unit.operation === 'reroute').status, 'skipped');
    f.controller.dispose();
    graph.nodes.one.enabled = true;
    assert.equal(resolveWorkflow(graph, { target: { workflowId: 'main', instancePath: [], nodeId: 'compose', portId: 'out' } }).error.code, 'MISSING_INPUT');
});
import { runWorkflow } from '../src/workflow/runtime.js?v=0.27.0';
import { validateGraphStructure } from '../src/workflow/contracts.js?v=0.27.0';
import { isScopedSystemOperation, resolveSystemNode } from '../src/workflow/system-capabilities.js?v=0.27.0';

test('static eligibility uses trusted operation types while portable fields grant no execution authority', async () => {
    for (const operation of ['on-send', 'review-publish', 'scene-context', 'reply-snapshot', 'recall', 'hotkey-arm', 'memory']) {
        const selected = node('read', operation, { actorId: 'actor', memorySetId: 'memories', scopedSystem: true });
        assert.equal(isScopedSystemOperation(selected), true);
        assert.equal(isScopedSystemOperation({ ...selected, scopedSystem: false }), true);
        const identity = computeDefinitionIdentity({ id: 'static', version: 1, name: 'Static', interface: [], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-unified', nodes: { read: selected }, wires: {} } });
        assert.equal(identity.ok, true, operation + ': ' + JSON.stringify(identity));
        assert.equal(validateGraphStructure(main({ ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash })).ok, true, operation);
    }
    assert.equal(isScopedSystemOperation(node('forged', 'unregistered-operation', { scopedSystem: true })), false);
    assert.equal(isScopedSystemOperation({ id: 'forged', type: 'subgraph', operation: 'memory', scopedSystem: true }), false);
    const graph = main(system({ read: node('read', 'read-file') })); let calls = 0;
    const pure = await runWorkflow(graph, { target: target('one'), executeHostOperation: () => { calls++; return { ok: true }; } });
    assert.equal(pure.error.code, 'HOST_OPERATION_REQUIRED');
    assert.equal(calls, 0);
});

test('root and explicit targets remain unchanged, nested read and outcome ledger controls resolve consistently', () => {
    const address = { workflowId: 'main', instancePath: ['one', 'child'], nodeId: 'x' };
    const read = resolveSystemNode(node('x', 'read-file', { targetId: 'lattice-default-outcomes' }), address).data;
    const pick = resolveSystemNode(node('x', 'random-pick', { ledgerId: 'lattice-default-outcomes' }), address).data;
    const commit = resolveSystemNode(node('x', 'commit-outcomes'), address).data;
    assert.equal(read.node.targetId, pick.node.ledgerId); assert.equal(read.node.targetId, commit.node.targetId);
    assert.equal(resolveSystemNode(node('x', 'read-file', { targetId: 'custom' }), address).data.node.targetId, 'custom');
    assert.equal(resolveSystemNode(node('x', 'read-file'), { ...address, instancePath: [] }).data.node.targetId, 'lattice-default-notes');
    assert.equal(resolveSystemNode(node('x', 'random-pick'), address).data.node.ledgerId, undefined);
    assert.deepEqual(resolveSystemNode(node('x', 'write-file', { targetId: 'lattice-default-outcomes' }), address).data.defaults, [], 'undeclared writer metadata cannot provision defaults');
    assert.notEqual(read.node.targetId, resolveSystemNode(node('x', 'commit-outcomes'), { ...address, workflowId: 'other' }).data.node.targetId);
});

test('shared explicit destinations fail before publication, and nested preview/rejection/cancellation never save', async () => {
    const graph = statefulMain({ shared: true }), f = unifiedRecipeHost(graph, { documents: [{ targetId: 'shared', name: 'Shared', format: 'text', content: '', visibility: { kind: 'public' } }] });
    const conflict = await f.generate('Native reply.'); assert.equal(conflict.error.code, 'DUPLICATE_EFFECT_TARGET');
    assert.equal(f.saves(), 0); assert.equal(f.c.chat[1].swipes.length, 1); f.controller.dispose();
    for (const action of ['preview', 'reject', 'cancel', 'changed']) {
        const selected = statefulMain(), host = unifiedRecipeHost(selected);
        if (action === 'preview') {
            const preview = await host.controller.runTarget(selected, { workflowId: 'main', instancePath: ['one'], nodeId: 'write', portId: 'receipt' });
            assert.equal(preview.ok, true, JSON.stringify(preview.error)); assert.equal(preview.reviewHandles.length, 0);
        } else {
            const result = await host.generate('Native reply.'); assert.equal(result.ok, true, JSON.stringify(result.error));
            if (action === 'reject') { host.controller.reject(result.reviewHandles[0]); assert.equal((await host.controller.apply(result.reviewHandles[0])).ok, false); }
            else if (action === 'cancel') { host.controller.cancel(); assert.equal((await host.controller.apply(result.reviewHandles[0])).ok, false); }
            else { host.c.chat[1].mes = 'Changed source'; assert.equal((await host.controller.apply(result.reviewHandles[0])).ok, false); }
        }
        assert.equal(host.saves(), 0); assert.equal(host.c.chatMetadata.latticeDocuments, undefined); host.controller.dispose();
    }
});
import { normalizeOccurrences, confirmOccurrences, resolveItemHolders } from '../src/workflow/operations/event-data.js?v=0.27.0';
import { compileIterationHelper } from '../src/workflow/iteration-helpers.js?v=0.27.0';
import { prepareNativeSearchCatalog, resolveNativeSearchChoice } from '../src/ui/native-search-catalog.js?v=0.27.0';

function nestedStateGraph(kind) {
    const graph = statefulMain(); delete graph.nodes.two;
    const body = kind === 'clock' ? {
        nodes: { clock: node('clock', 'story-clock'), duration: node('duration', 'text', { text: '{"kind":"duration","minutes":30}' }), proposal: node('proposal', 'json-decode'), advance: node('advance', 'advance-time'), commit: node('commit', 'commit-clock') },
        wires: { parse: edge('parse', 'duration', 'out', 'proposal', 'in'), clock: edge('clock', 'clock', 'out', 'advance', 'clock'), proposal: edge('proposal', 'proposal', 'out', 'advance', 'proposal'), commit: edge('commit', 'advance', 'report', 'commit', 'projection') },
    } : (() => {
        const playerText = 'Mara uses her wand.', source = { sourceId: 'player-turn', revision: '1', sceneId: 'Story-2', watch: 'player-message', text: playerText, visibility: 'public' };
        const candidates = normalizeOccurrences(source, [{ eventType: 'item-used', actorId: 'mara', itemId: 'wand', position: { start: 0, end: playerText.length }, semantics: 'actual' }], { actorIds: ['mara'], itemIds: ['wand'] }).data.events;
        const events = resolveItemHolders({ wand: 'mara' }, confirmOccurrences(candidates, [{ eventId: candidates[0].eventId, accepted: true }]).data.events).data.events;
        const nodes = { pick: node('pick', 'random-pick', { ledgerId: 'lattice-default-outcomes' }), commit: node('commit', 'commit-outcomes') }, wires = {};
        for (const [id, value] of Object.entries({ events, library: { libraryId: 'wand', revision: '1', itemId: 'wand', effects: [{ id: 'sparks', kind: 'fixed', weight: 1, description: 'Blue sparks appear.' }] } })) {
            nodes[id + '-text'] = node(id + '-text', 'text', { text: JSON.stringify(value) }); nodes[id] = node(id, 'json-decode'); wires[id + '-parse'] = edge(id + '-parse', id + '-text', 'out', id, 'in');
        }
        wires.events = edge('events', 'events', 'out', 'pick', 'events'); wires.library = edge('library', 'library', 'out', 'pick', 'library'); wires.commit = edge('commit', 'pick', 'out', 'commit', 'outcomes');
        return { nodes, wires };
    })();
    const definition = system(body.nodes, body.wires);
    graph.definitions = { [definitionRefKey(definition)]: definition };
    graph.nodes.one.definition = { id: definition.id, version: definition.version, semanticHash: definition.semanticHash };
    return graph;
}

test('nested clocks and outcome terminals stage around exactly one Main generation and persist only at Apply', async () => {
    for (const kind of ['clock', 'outcomes']) {
        const graph = nestedStateGraph(kind), f = unifiedRecipeHost(graph, { playerText: 'Mara uses her wand.' });
        const result = await f.generate('Blue sparks appear.'); assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(f.saves(), 0); assert.equal(result.recording.units.filter(unit => unit.operation === 'generate-reply').length, 1);
        const generation = result.recording.units.find(unit => unit.operation === 'generate-reply');
        assert.ok(result.recording.units.find(unit => unit.operation === (kind === 'clock' ? 'story-clock' : 'random-pick')).settledAt <= generation.startedAt);
        assert.ok(result.recording.units.find(unit => unit.operation === (kind === 'clock' ? 'commit-clock' : 'commit-outcomes')).startedAt >= generation.settledAt);
        const accepted = await f.controller.apply(result.reviewHandles[0]); assert.equal(accepted.ok, true, JSON.stringify(accepted.error)); assert.equal(f.saves(), 1);
        const saved = Object.values(f.c.chatMetadata.latticeDocuments['default-user'])[0];
        if (kind === 'clock') { assert.equal(saved.targetId, 'lattice-default-clock'); assert.equal(JSON.parse(saved.content).absoluteMinute, 30); }
        else { assert.match(saved.targetId, /^lattice-system-outcomes-/); assert.equal(JSON.parse(saved.content)[0].selection.id, 'sparks'); }
        f.controller.dispose();
    }
});

test('search exposes static host operations while For Each cannot acquire their authority', () => {
    const catalog = prepareNativeSearchCatalog({ schema: 3, runtime: 2, mode: 'native-unified', workflowId: 'main', viewPath: ['one'], inDefinition: true }); assert.equal(catalog.ok, true, JSON.stringify(catalog));
    for (const operation of ['read-file', 'write-file', 'story-clock', 'commit-clock', 'commit-outcomes']) {
        assert.ok(resolveNativeSearchChoice(catalog.data, 'operation:' + operation), operation);
        const definition = system({ state: node('state', operation), item: { id: 'item', type: 'subgraph-input', interfacePortId: 'item' }, output: { id: 'output', type: 'subgraph-output', interfacePortId: 'result' } }, {}, [{ id: 'item', label: 'Item', kind: 'data', direction: 'input', required: true, cardinality: 'one', boundaryNodeId: 'item' }, { id: 'result', label: 'Result', kind: 'data', direction: 'output', required: false, cardinality: 'one', boundaryNodeId: 'output' }]);
        const graph = main(definition), helper = graph.nodes.one.definition;
        const compiled = compileIterationHelper(graph, { helper, mode: 'map', phase: ['write-file', 'commit-clock', 'commit-outcomes'].includes(operation) ? 'post' : 'pre', address: { workflowId: 'main', instancePath: [], nodeId: 'loop' }, requestBoundPerIteration: 0 });
        assert.equal(compiled.ok, false, operation);
        assert.equal(compiled.error.code, 'ITERATION_AUTHORITY');
    }
});

test('enabled connected systems with unfinished outputs fail addressed preflight before optional consumers run', () => {
    const definition = system({ exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'out' } }, {}, [{ id: 'out', label: 'Out', kind: 'text', direction: 'output', required: false, cardinality: 'one', boundaryNodeId: 'exit' }]);
    const graph = main(definition); graph.nodes.compose = node('compose', 'compose', { sections: [{ name: 'System', text: 'fallback' }] }); graph.wires.result = edge('result', 'one', 'out', 'compose', 'section.System');
    const result = resolveWorkflow(graph, { target: { workflowId: 'main', instancePath: [], nodeId: 'compose', portId: 'out' } });
    assert.equal(result.ok, false); assert.equal(result.error.code, 'MISSING_INPUT'); assert.deepEqual(result.error.address, { workflowId: 'main', instancePath: [], nodeId: 'one' });
});

test('nested private file reads retain current actor authorization and copied references cannot stage writes', async () => {
    for (const actorId of ['character:mara.png', 'character:other.png']) {
        const graph = main(system({ read: node('read', 'read-file', { targetId: 'private' }) }));
        const f = unifiedRecipeHost(graph, { documents: [{ targetId: 'private', name: 'Private', format: 'text', content: 'Secret state', visibility: { kind: 'actor-private', actorId } }] });
        const result = await f.controller.runTarget(graph, target('one'));
        assert.equal(result.ok, actorId === 'character:mara.png', JSON.stringify(result.error)); assert.equal(f.saves(), 0); f.controller.dispose();
    }
    const definition = system({ read: node('read', 'read-file'), decode: node('decode', 'json-decode', { mode: 'check' }), text: node('text', 'text', { text: 'Copy' }), write: node('write', 'write-file', { mode: 'append' }) }, {
        decode: edge('decode', 'read', 'reference', 'decode', 'in'), reference: edge('reference', 'decode', 'out', 'write', 'reference'), text: edge('text', 'text', 'out', 'write', 'text'),
    });
    const graph = main(definition), f = unifiedRecipeHost(graph);
    const result = await f.controller.runTarget(graph, { workflowId: 'main', instancePath: ['one'], nodeId: 'write', portId: 'receipt' });
    assert.equal(result.ok, false); assert.match(result.error.code, /REFERENCE/); assert.equal(f.saves(), 0); f.controller.dispose();
});

test('identical sibling Clock Commit projections retain separate producer intents and reject the shared clock target', async () => {
    const graph = nestedStateGraph('clock'); graph.nodes.two = { ...structuredClone(graph.nodes.one), id: 'two' };
    const f = unifiedRecipeHost(graph);
    const result = await f.generate('Native reply.');
    assert.equal(result.ok, false); assert.equal(result.error.code, 'DUPLICATE_EFFECT_TARGET'); assert.equal(f.saves(), 0); f.controller.dispose();
});

test('identical sibling Outcome Commit projections reject an explicit shared target without rerolling', async () => {
    const graph = nestedStateGraph('outcomes'), draft = structuredClone(Object.values(graph.definitions)[0]);
    draft.body.nodes.commit.targetId = 'shared-outcomes'; draft.body.nodes.pick.ledgerId = 'shared-outcomes'; delete draft.semanticHash;
    const identity = computeDefinitionIdentity(draft); assert.equal(identity.ok, true);
    const definition = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    graph.definitions = { [definitionRefKey(definition)]: definition }; graph.nodes.one.definition = { id: definition.id, version: definition.version, semanticHash: definition.semanticHash };
    graph.nodes.two = { ...structuredClone(graph.nodes.one), id: 'two' };
    let draws = 0;
    const f = unifiedRecipeHost(graph, { playerText: 'Mara uses her wand.', random: () => { draws++; return 0.9; }, documents: [{ targetId: 'shared-outcomes', name: 'Shared Outcomes', format: 'json', content: '[]', visibility: { kind: 'public' } }] });
    const result = await f.generate('Blue sparks appear.'); assert.equal(result.ok, false); assert.equal(result.error.code, 'DUPLICATE_EFFECT_TARGET'); assert.equal(f.saves(), 0); assert.equal(draws, 1); f.controller.dispose();
});

test('missing output provenance survives an optional system input while an unbound input stays legal', async () => {
    const source = system({ exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'out' } }, {}, [{ id: 'out', label: 'Out', kind: 'text', direction: 'output', required: false, cardinality: 'one', boundaryNodeId: 'exit' }], 'source-system');
    const destination = system({ entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'in' }, compose: node('compose', 'compose', { sections: [{ name: 'Source', text: 'fallback' }] }) }, { entry: edge('entry', 'entry', 'out', 'compose', 'section.Source') }, [{ id: 'in', label: 'In', kind: 'text', direction: 'input', required: false, cardinality: 'one', boundaryNodeId: 'entry' }]);
    const graph = main(destination, ['dest']);
    graph.nodes.source = main(source, ['source']).nodes.source;
    graph.definitions[definitionRefKey(source)] = source;
    graph.wires.source = edge('source', 'source', 'out', 'dest', 'in');
    const selected = { workflowId: 'main', instancePath: ['dest'], nodeId: 'compose', portId: 'out' };
    const result = resolveWorkflow(graph, { target: selected });
    assert.equal(result.ok, false); assert.equal(result.error.code, 'MISSING_INPUT');
    assert.deepEqual(result.error.address, { workflowId: 'main', instancePath: [], nodeId: 'source' });
    const f = unifiedRecipeHost(graph);
    const rejected = await f.controller.runTarget(graph, selected);
    assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'MISSING_INPUT');
    assert.equal(f.calls(), 0); assert.equal(f.saves(), 0); assert.deepEqual(f.catalog.snapshot().data.documents, []);
    delete graph.wires.source;
    assert.equal(resolveWorkflow(graph, { target: selected }).ok, true);
    const unbound = await f.controller.runTarget(graph, selected);
    assert.equal(unbound.ok, true, JSON.stringify(unbound.error));
    f.controller.dispose();
});

function disabledPassThrough(nested) {
    const ports = [{ id: 'in', label: 'In', kind: 'text', direction: 'input', required: false, cardinality: 'one', boundaryNodeId: 'entry' }, { id: 'out', label: 'Out', kind: 'text', direction: 'output', required: false, cardinality: 'one', boundaryNodeId: 'exit' }];
    const boundaries = { entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'in' }, exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'out' } };
    let definition = system(boundaries, { pass: edge('pass', 'entry', 'out', 'exit', 'in') }, ports, 'pass-through');
    const childDefinitions = nested ? { [definitionRefKey(definition)]: definition } : {};
    if (nested) {
        const child = main(definition, ['child']).nodes.child;
        definition = system({ ...boundaries, child }, { entry: edge('entry', 'entry', 'out', 'child', 'in'), exit: edge('exit', 'child', 'out', 'exit', 'in') }, ports, 'ancestor');
    }
    const graph = main(definition); Object.assign(graph.definitions, childDefinitions); graph.nodes.one.enabled = false;
    graph.nodes.upstream = node('upstream', 'text', { text: 'Live source' });
    graph.nodes.compose = node('compose', 'compose', { sections: [{ name: 'System', text: 'fallback' }] });
    graph.wires.upstream = edge('upstream', 'upstream', 'out', 'one', 'in');
    graph.wires.result = edge('result', 'one', 'out', 'compose', 'section.System');
    return graph;
}
for (const nested of [false, true]) test(`disabled ${nested ? 'ancestor of a pass-through' : 'pass-through'} output skips consumers without activating upstream`, async () => {
    const graph = disabledPassThrough(nested), selected = { workflowId: 'main', instancePath: [], nodeId: 'compose', portId: 'out' };
    const planned = resolveWorkflow(graph, { target: selected });
    assert.equal(planned.ok, true, JSON.stringify(planned.error));
    assert.equal(planned.data.primitives.find(unit => unit.node.id === 'upstream').included, false);
    assert.equal(planned.data.callBound, 0);
    const f = unifiedRecipeHost(graph), result = await f.controller.runTarget(graph, selected);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.recording.units.find(unit => unit.operation === 'text').status, 'not-run');
    const compose = result.recording.units.find(unit => unit.operation === 'compose');
    assert.equal(compose.ports.find(port => result.recording.identities.strings[port.port] === 'section.System').state.status, 'skipped');
    assert.equal(result.recording.artifacts.findLast(artifact => artifact.kind === 'text').value.text, 'fallback');
    assert.ok(result.recording.units.some(unit => unit.operation === 'subgraph-output' && unit.status === 'skipped'));
    graph.nodes.compose = node('compose', 'reroute', { artifactKind: 'text' }); graph.wires.result.toPort = 'in';
    const required = await f.controller.runTarget(graph, selected);
    assert.equal(required.ok, true, JSON.stringify(required.error));
    assert.equal(required.recording.units.find(unit => unit.operation === 'reroute').status, 'skipped');
    assert.equal(required.recording.units.find(unit => unit.operation === 'text').status, 'not-run');
    assert.equal(f.calls(), 0); assert.equal(f.saves(), 0); assert.deepEqual(f.catalog.snapshot().data.documents, []);
    f.controller.dispose();
});


test('explicit addressed setup is read by that system while viewing disabled siblings never provisions', async () => {
 const {createWorkflowDataSetup}=await import('../src/ui/workflow-data-setup.js'),{prepareWorkspaceViews}=await import('../src/ui/workspace-preparation.js');
 const graph=main(system({read:node('read','read-file')}),['one','two']),before=structuredClone(graph),f=unifiedRecipeHost(graph,{documents:[{targetId:'lattice-default-notes',name:'Main',format:'text',content:'Main untouched',visibility:{kind:'public'}}]});
 try {graph.nodes.two.enabled=false;const prepared=prepareWorkspaceViews(graph);assert.equal(prepared.ok,true);assert.equal(f.catalog.snapshot().data.documents.length,1);assert.equal(f.calls(),0);
  const setup=createWorkflowDataSetup(f.catalog),address={workflowId:graph.id,instancePath:['one'],nodeId:'read'},targetId=prepared.data.preparedViews.find(v=>v.identity.instancePath?.[0]==='one').effectiveNodes.read.targetId,key=setup.snapshot().key;
  const loaded=setup.load(key,'read-file',targetId,true,address);assert.equal(loaded.ok,true,JSON.stringify(loaded.error));assert.equal((await setup.save(key,'read-file',targetId,{...loaded.data.definition,format:'markdown',content:'Edited system initial value'},true,address)).ok,true);
  const result=await f.controller.runTarget(graph,target('one'));assert.equal(result.ok,true,JSON.stringify(result.error));assert.ok(result.recording.artifacts.some(a=>a.value?.text==='Edited system initial value'));
  assert.equal(f.catalog.definition('lattice-default-notes').data.content,'Main untouched');assert.equal(f.catalog.snapshot().data.documents.length,2);assert.deepEqual(graph.definitions,before.definitions);assert.equal(Object.hasOwn(graph.definitions[definitionRefKey(graph.nodes.one.definition)].body.nodes.read,'targetId'),true);assert.equal(graph.definitions[definitionRefKey(graph.nodes.one.definition)].body.nodes.read.targetId,'lattice-default-notes');
 } finally {f.controller.dispose();}
});
