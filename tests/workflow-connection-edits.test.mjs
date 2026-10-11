import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateGraphStructure } from '../src/workflow/contracts.js';
import { graphDocumentSignature, graphSemanticSignature } from '../src/workflow/ports.js';
import { portsForNode } from '../src/workflow/catalog.js';
import { ACTIVE_PROFILE_ID } from '../src/workflow/model-profiles.js';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js';
import { makeLocalCopy } from '../src/workflow/definition-library.js';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js';
import * as history from '../src/history.js?v=0.27.0';
import { graphPoint as toGraph } from '../src/canvas/camera.js';
import { createGeometryCache } from '../src/canvas/geometry.js';
const api = await import('../src/workflow/connection-edits.js').catch(() => ({}));
const endpoint = (nodeId, portId = 'out') => ({ nodeId, portId });
const wire = (id, from, to, extra = {}) => ({ id, route: 'wire', from, fromPort: 'out', to, toPort: 'in', ...extra });
const node = (id, operation = 'smart-compactor') => ({ id, type: 'workflow', operation });
function fixture() {
    return { id: 'connection-root', schema: 3, runtime: 2, mode: 'native-pre', nodes: {
        source: node('source', 'scene-context'), alternate: node('alternate', 'scene-context'),
        first: node('first'), second: node('second'), third: node('third'),
    }, wires: { incoming: wire('incoming', 'source', 'first', { order: 7, kind: 'append' }) }, portals: {}, definitions: {}, groups: {} };
}
function prepare(graph, command, options) {
    assert.equal(typeof api.prepareNativeConnectionEdit, 'function');
    assert.equal(validateGraphStructure(graph).ok, true, 'source fixture is structurally valid');
    return api.prepareNativeConnectionEdit(graph, command, options);
}
function accepted(result, original) {
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(validateGraphStructure(result.data.candidate).ok, true);
    assert.equal(result.data.baseSignature, graphSemanticSignature(original));
    assert.equal(result.data.baseDocumentSignature, graphDocumentSignature(original));
    return result.data;
}

test('typed reroute creation uses declared artifact metadata and actual containing phase', () => {
    for (const phase of ['pre', 'post']) {
        const graph = { id: 'typed-' + phase, schema: 3, runtime: 2, mode: 'native-' + phase, nodes: {}, wires: {}, portals: {}, definitions: {} };
        for (const artifactKind of ['context', 'draft', 'patches', 'candidate', 'guidance', 'text', 'data']) {
            const edit = accepted(prepare(graph, { kind: 'create', operation: 'reroute', artifactKind, graphPoint: { x: -7.125, y: 2.875 } }), graph);
            const added = edit.candidate.nodes[edit.addedNodeIds[0]];
            assert.equal(added.phase, phase); assert.equal(added.artifactKind, artifactKind); assert.equal(added.compact, true);
            assert.deepEqual(portsForNode(edit.candidate, added).map(port => [port.id, port.kind]), [['in', artifactKind], ['out', artifactKind]]);
            assert.deepEqual({ x: added.x, y: added.y }, { x: -7.125, y: 2.875 });
        }
    }
    const graph = fixture(), edit = accepted(prepare(graph, { kind: 'create', operation: 'reroute', artifactKind: 'context', graphPoint: { x: 0.125, y: 0.5 }, connection: { origin: endpoint('source'), portId: 'in' } }), graph);
    assert.equal(edit.candidate.wires[edit.addedEdgeIds[0]].to, edit.addedNodeIds[0]);
});

test('unconfigured or malformed typed reroute metadata and metadata on other operations allocate nothing', () => {
    const graph = fixture(), before = structuredClone(graph); let calls = 0;
    for (const extra of [{}, { artifactKind: 'unknown' }, { artifactKind: 'context', phase: 'post' }, { artifactKind: 'context', controls: { artifactKind: 'context' } }, { artifactKind: 'context', controls: { artifactKind: 'text' } }]) {
        assert.equal(prepare(graph, { kind: 'create', operation: 'reroute', graphPoint: { x: 0, y: 0 }, ...extra }, { idFactory() { calls++; return 'unused'; } }).ok, false);
    }
    assert.equal(prepare(graph, { kind: 'create', operation: 'smart-compactor', artifactKind: 'context', graphPoint: { x: 0, y: 0 } }, { idFactory() { calls++; return 'unused'; } }).ok, false);
    assert.equal(calls, 0); assert.deepEqual(graph, before);
});

test('connect resolves actual named pins in both drag directions and preserves the source', () => {
    const graph = fixture(), before = structuredClone(graph);
    for (const [origin, target] of [[endpoint('first'), endpoint('second', 'in')], [endpoint('second', 'in'), endpoint('first')]]) {
        const edit = accepted(prepare(graph, { kind: 'connect', origin, target }), graph);
        assert.equal(edit.changed, true);
        assert.equal(edit.addedEdgeIds.length, 1);
        assert.deepEqual(edit.candidate.wires[edit.addedEdgeIds[0]], wire(edit.addedEdgeIds[0], 'first', 'second'));
        assert.deepEqual(edit.viewPath, []);
    }
    assert.deepEqual(graph, before);
});

test('occupied input is replaced only explicitly and only after complete candidate validation', () => {
    const graph = fixture(), before = structuredClone(graph);
    const command = { kind: 'connect', origin: endpoint('alternate'), target: endpoint('first', 'in') };
    assert.equal(prepare(graph, command).error.code, 'AMBIGUOUS_INPUT');
    const edit = accepted(prepare(graph, { ...command, replace: true }), graph);
    assert.deepEqual(edit.removedEdgeIds, ['incoming']);
    assert.equal(Object.hasOwn(edit.candidate.wires, 'incoming'), false);
    assert.equal(edit.candidate.wires[edit.addedEdgeIds[0]].from, 'alternate');
    const cycle = prepare(graph, { ...command, origin: endpoint('first'), replace: true });
    assert.equal(cycle.error.code, 'CYCLE');
    assert.deepEqual(graph, before);
});

test('same current connection and missing disconnection are exact no-ops without ID callbacks', () => {
    const graph = fixture();
    let calls = 0;
    for (const command of [
        { kind: 'connect', origin: endpoint('source'), target: endpoint('first', 'in'), replace: true },
        { kind: 'disconnect', edgeIds: ['missing'] },
        { kind: 'move-input', origin: endpoint('first', 'in'), target: endpoint('first', 'in') },
        { kind: 'move-output', origin: endpoint('third'), target: endpoint('second') },
    ]) {
        const edit = accepted(prepare(graph, command, { idFactory() { calls++; return 'unused'; } }), graph);
        assert.equal(edit.changed, false);
        assert.deepEqual(edit.candidate, graph);
        assert.deepEqual(edit.addedEdgeIds, []);
        assert.deepEqual(edit.removedEdgeIds, []);
    }
    assert.equal(calls, 0);
});

test('retired schemas reject without invoking the ID factory or changing the source', () => {
    const graph = fixture(); graph.schema = 2; graph.runtime = 1;
    let calls = 0;
    const before = structuredClone(graph);
    const result = api.prepareNativeConnectionEdit(graph, { kind: 'connect', origin: endpoint('first'), target: endpoint('second', 'in') }, { idFactory() { calls++; return 'unused'; } });
    assert.equal(result.error.code, 'UNSUPPORTED_VERSION');
    assert.equal(calls, 0); assert.deepEqual(graph, before);
});

test('Ctrl input move preserves portal route, wire identity and metadata with atomic replacement', () => {
    const graph = fixture();
    graph.portals.named = { id: 'named', label: 'Context', kind: 'context', source: endpoint('source') };
    graph.wires.incoming = { id: 'incoming', route: 'portal', portalId: 'named', to: 'first', toPort: 'in', order: 7, kind: 'append' };
    graph.wires.occupied = wire('occupied', 'alternate', 'second');
    const before = structuredClone(graph);
    const command = { kind: 'move-input', origin: endpoint('first', 'in'), target: endpoint('second', 'in') };
    assert.equal(prepare(graph, command).error.code, 'AMBIGUOUS_INPUT');
    const edit = accepted(prepare(graph, { ...command, replace: true }), graph);
    assert.deepEqual(edit.candidate.wires.incoming, { ...graph.wires.incoming, to: 'second' });
    assert.deepEqual(edit.removedEdgeIds, ['occupied']);
    assert.deepEqual(edit.addedEdgeIds, []);
    assert.deepEqual(edit.candidate.portals, graph.portals);
    assert.deepEqual(graph, before);
});

test('Ctrl output move includes direct fanout and both used and unused publisher records', () => {
    const graph = fixture();
    graph.wires.another = wire('another', 'source', 'second');
    for (const id of ['named', 'unused']) graph.portals[id] = { id, label: id, kind: 'context', source: endpoint('source') };
    graph.wires.hidden = { id: 'hidden', route: 'portal', portalId: 'named', to: 'third', toPort: 'in' };
    const before = structuredClone(graph);
    const edit = accepted(prepare(graph, { kind: 'move-output', origin: endpoint('source'), target: endpoint('alternate') }), graph);
    assert.equal(edit.candidate.wires.incoming.from, 'alternate'); assert.equal(edit.candidate.wires.another.from, 'alternate');
    assert.deepEqual(edit.candidate.wires.hidden, graph.wires.hidden);
    for (const id of ['named', 'unused']) assert.deepEqual(edit.candidate.portals[id], { ...graph.portals[id], source: endpoint('alternate') });
    assert.deepEqual(edit.addedEdgeIds, []); assert.deepEqual(edit.removedEdgeIds, []);
    assert.deepEqual(graph, before);
});

test('hidden portal cycles and nonexistent or same-direction pins reject without source mutation', () => {
    const graph = fixture(); graph.portals.named = { id: 'named', label: 'Context', kind: 'context', source: endpoint('first') };
    graph.wires.hidden = { id: 'hidden', route: 'portal', portalId: 'named', to: 'second', toPort: 'in' };
    const before = structuredClone(graph); let calls = 0;
    const commands = [
        [{ kind: 'move-output', origin: endpoint('first'), target: endpoint('second') }, 'CYCLE'],
        [{ kind: 'connect', origin: endpoint('first'), target: endpoint('second') }, 'INVALID_PORT'],
        [{ kind: 'connect', origin: endpoint('source', 'fabricated'), target: endpoint('third', 'in') }, 'INVALID_PORT'],
    ];
    for (const [command, code] of commands) assert.equal(prepare(graph, command, { idFactory() { calls++; return 'unused'; } }).error.code, code);
    assert.equal(calls, 0); assert.deepEqual(graph, before);
});

function publishedFixture() {
    const graph = fixture();
    for (const id of ['named', 'unused']) graph.portals[id] = { id, label: id, kind: 'context', source: endpoint('source') };
    graph.wires.hidden = { id: 'hidden', route: 'portal', portalId: 'named', to: 'second', toPort: 'in', order: 3, kind: 'prepend' };
    graph.wires.unrelated = wire('unrelated', 'alternate', 'third');
    return graph;
}

test('multi-wire disconnect deduplicates IDs and never deletes named publishers', () => {
    const graph = publishedFixture(), before = structuredClone(graph);
    const edit = accepted(prepare(graph, { kind: 'disconnect', edgeIds: ['hidden', 'incoming', 'hidden', 'missing'] }), graph);
    assert.deepEqual(edit.removedEdgeIds, ['hidden', 'incoming']);
    assert.deepEqual(edit.candidate.wires, { unrelated: graph.wires.unrelated });
    assert.deepEqual(edit.candidate.portals, graph.portals); assert.deepEqual(edit.removedPortalIds, []);
    assert.deepEqual(graph, before);
});

test('output pin break defaults to retaining publishers and explicitly supports removing all attachments', () => {
    const graph = publishedFixture(), before = structuredClone(graph);
    const retained = accepted(prepare(graph, { kind: 'disconnect-pin', pin: endpoint('source') }), graph);
    assert.deepEqual(retained.candidate.portals, graph.portals);
    assert.deepEqual(retained.candidate.wires, { unrelated: graph.wires.unrelated });
    assert.deepEqual(retained.removedEdgeIds, ['incoming', 'hidden']);
    const removed = accepted(prepare(graph, { kind: 'disconnect-pin', pin: endpoint('source'), publisherPolicy: 'disconnect' }), graph);
    assert.deepEqual(removed.candidate.portals, {});
    assert.deepEqual(removed.removedPortalIds, ['named', 'unused']);
    assert.deepEqual(removed.candidate.wires, { unrelated: graph.wires.unrelated });
    assert.equal(prepare(graph, { kind: 'disconnect-pin', pin: endpoint('source'), publisherPolicy: 'restore' }).error.code, 'INVALID_COMMAND');
    assert.deepEqual(graph, before);
});

test('input pin break removes only its consumer and unused output publisher retain is a no-op', () => {
    const graph = publishedFixture();
    const edit = accepted(prepare(graph, { kind: 'disconnect-pin', pin: endpoint('second', 'in') }), graph);
    assert.deepEqual(edit.removedEdgeIds, ['hidden']);
    assert.deepEqual(edit.candidate.portals, graph.portals); assert.deepEqual(edit.candidate.wires.incoming, graph.wires.incoming);
    delete graph.wires.incoming; delete graph.wires.hidden;
    const noop = accepted(prepare(graph, { kind: 'disconnect-pin', pin: endpoint('source') }), graph);
    assert.equal(noop.changed, false); assert.deepEqual(noop.candidate, graph);
});

test('explicit publisher deletion requires consumer policy and restore preserves each consumer ID', () => {
    const graph = publishedFixture(), before = structuredClone(graph);
    assert.equal(prepare(graph, { kind: 'disconnect', publisherIds: ['named'] }).error.code, 'PORTAL_IN_USE');
    const restore = accepted(prepare(graph, { kind: 'disconnect', publisherIds: ['named'], publisherPolicy: 'restore' }), graph);
    assert.deepEqual(restore.candidate.wires.hidden, wire('hidden', 'source', 'second', { order: 3, kind: 'prepend' }));
    assert.deepEqual(restore.removedEdgeIds, []); assert.deepEqual(restore.removedPortalIds, ['named']);
    assert.deepEqual(restore.candidate.portals.unused, graph.portals.unused);
    const remove = accepted(prepare(graph, { kind: 'disconnect', edgeIds: ['hidden'], publisherIds: ['named'], publisherPolicy: 'disconnect' }), graph);
    assert.deepEqual(remove.removedEdgeIds, ['hidden']); assert.deepEqual(remove.removedPortalIds, ['named']);
    assert.deepEqual(graph, before);
});

test('typed reroute uses exact captured graph coordinates and preserves the existing wire leg', () => {
    const graph = fixture(), before = structuredClone(graph), graphPoint = { x: -13.875, y: 207.125 };
    const edit = accepted(prepare(graph, { kind: 'reroute', edgeId: 'incoming', graphPoint }), graph);
    assert.equal(edit.addedNodeIds.length, 1); assert.equal(edit.addedEdgeIds.length, 1);
    const reroute = edit.candidate.nodes[edit.addedNodeIds[0]];
    assert.equal(reroute.operation, 'reroute'); assert.equal(reroute.artifactKind, 'context'); assert.equal(reroute.phase, 'pre'); assert.equal(reroute.compact, true);
    assert.equal(reroute.x, graphPoint.x); assert.equal(reroute.y, graphPoint.y);
    assert.deepEqual(portsForNode(edit.candidate, reroute).map(pin => [pin.id, pin.kind]), [['in', 'context'], ['out', 'context']]);
    assert.deepEqual(edit.candidate.wires.incoming, { ...graph.wires.incoming, to: reroute.id });
    assert.deepEqual(edit.candidate.wires[edit.addedEdgeIds[0]], { ...graph.wires.incoming, id: edit.addedEdgeIds[0], from: reroute.id });
    assert.deepEqual(edit.removedEdgeIds, []); assert.deepEqual(graph, before);
    assert.equal(prepare(publishedFixture(), { kind: 'reroute', edgeId: 'hidden', graphPoint }).error.code, 'INVALID_WIRE');
});

test('create and connect is one complete candidate at the captured point in both directions', () => {
    const graph = fixture(), before = structuredClone(graph), graphPoint = { x: 103.375, y: -42.625 };
    for (const connection of [{ origin: endpoint('source'), portId: 'in' }, { origin: endpoint('second', 'in'), portId: 'out' }]) {
        const edit = accepted(prepare(graph, { kind: 'create', operation: 'smart-compactor', graphPoint, connection }), graph);
        assert.equal(edit.addedNodeIds.length, 1); assert.equal(edit.addedEdgeIds.length, 1);
        const created = edit.candidate.nodes[edit.addedNodeIds[0]], edge = edit.candidate.wires[edit.addedEdgeIds[0]];
        assert.equal(created.x, graphPoint.x); assert.equal(created.y, graphPoint.y); assert.equal(created.targetTokens, 1200);
        assert.equal(edge.from, connection.portId === 'in' ? 'source' : created.id);
        assert.equal(edge.to, connection.portId === 'in' ? created.id : 'second');
    }
    assert.deepEqual(graph, before);
});

test('declared Compose section preset selects a real named port and unconnected creation remains valid', () => {
    const graph = fixture(); graph.nodes.text = node('text', 'compose');
    const edit = accepted(prepare(graph, { kind: 'create', operation: 'compose', controls: { sections: [{ name: 'Input', text: '' }] }, graphPoint: { x: 1.25, y: 2.5 }, connection: { origin: endpoint('text'), portId: 'section.Input' } }), graph);
    assert.equal(edit.candidate.wires[edit.addedEdgeIds[0]].toPort, 'section.Input');
    assert.deepEqual(edit.candidate.nodes[edit.addedNodeIds[0]].sections, [{ name: 'Input', text: '' }]);
    const unconnected = accepted(prepare(graph, { kind: 'create', operation: 'select-fields', graphPoint: { x: 9, y: 10 } }), graph);
    assert.deepEqual(unconnected.addedEdgeIds, []); assert.deepEqual(unconnected.candidate.wires, graph.wires);
});

test('Draft rules and JSON check presets use their effective kinds while invalid presets allocate nothing', () => {
    const post = fixture(); post.mode = 'native-post'; post.nodes = { source: node('source', 'reply-snapshot') }; post.wires = {};
    const draft = accepted(prepare(post, { kind: 'create', operation: 'text-rules', controls: { inputKind: 'draft' }, graphPoint: { x: 0.25, y: 0.5 }, connection: { origin: endpoint('source'), portId: 'in' } }), post);
    assert.deepEqual(portsForNode(draft.candidate, draft.candidate.nodes[draft.addedNodeIds[0]]).map(pin => pin.kind), ['draft', 'patches']);
    const graph = fixture(); graph.nodes.data = node('data', 'select-fields');
    const checked = accepted(prepare(graph, { kind: 'create', operation: 'json-decode', controls: { mode: 'check', schema: '{"type":"object"}' }, graphPoint: { x: 0, y: 0 }, connection: { origin: endpoint('data'), portId: 'in' } }), graph);
    assert.equal(portsForNode(checked.candidate, checked.candidate.nodes[checked.addedNodeIds[0]])[0].kind, 'data');
    let calls = 0;
    for (const command of [
        { kind: 'create', operation: 'text-rules', controls: { inputKind: 'draft' }, graphPoint: { x: 0, y: 0 } },
        { kind: 'create', operation: 'json-decode', controls: { mode: 'check', schema: 'not JSON' }, graphPoint: { x: 0, y: 0 } },
        { kind: 'create', operation: 'compose', controls: { fabricated: true }, graphPoint: { x: 0, y: 0 } },
        { kind: 'create', operation: 'compose', graphPoint: { x: 0, y: 0 }, connection: { origin: endpoint('source'), portId: 'in' } },
        { kind: 'create', operation: 'select-fields', graphPoint: { x: 0, y: 0 }, connection: { origin: endpoint('source'), portId: 'in' } },
    ]) assert.equal(prepare(graph, command, { idFactory() { calls++; return 'unused'; } }).ok, false);
    assert.equal(calls, 0);
});

test('ID factory runs once per new record after valid full candidate and collision or throw remains atomic', () => {
    const graph = fixture(), before = structuredClone(graph), calls = [];
    const edit = accepted(prepare(graph, { kind: 'create', operation: 'smart-compactor', graphPoint: { x: 1, y: 2 }, connection: { origin: endpoint('source'), portId: 'in' } }, { idFactory(kind) { calls.push(kind); return 'external-' + kind; } }), graph);
    assert.deepEqual(calls, ['node', 'edge']); assert.deepEqual(edit.addedNodeIds, ['external-node']); assert.deepEqual(edit.addedEdgeIds, ['external-edge']);
    assert.equal(edit.candidate.wires['external-edge'].to, 'external-node');
    const invalid = prepare(graph, { kind: 'connect', origin: endpoint('first'), target: endpoint('first', 'in'), replace: true }, { idFactory() { throw Error('invalid candidate must not allocate'); } });
    assert.equal(invalid.error.code, 'CYCLE');
    const command = { kind: 'connect', origin: endpoint('first'), target: endpoint('second', 'in') };
    assert.equal(prepare(graph, command, { idFactory() { return 'source'; } }).error.code, 'IDENTITY_COLLISION');
    assert.equal(prepare(graph, command, { idFactory() { throw Error('unavailable'); } }).ok, false);
    assert.deepEqual(graph, before);
});

const reference = value => ({ id: value.id, version: value.version, semanticHash: value.semanticHash });
function finalize(draft) {
    const result = computeDefinitionIdentity(draft); assert.equal(result.ok, true, JSON.stringify(result));
    return { ...structuredClone(result.data.materializedDefinition), semanticHash: result.data.semanticHash };
}
const instance = (id, definition) => ({ id, type: 'subgraph', definition: reference(definition), parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {} });
function nestedFixture() {
    const leaf = finalize({ id: 'leaf', version: 1, name: 'Leaf', interface: [
        { id: 'input', label: 'Input', direction: 'input', kind: 'context', required: true, cardinality: 'one', boundaryNodeId: 'entry' },
        { id: 'output', label: 'Output', direction: 'output', kind: 'context', required: false, cardinality: 'one', boundaryNodeId: 'exit' },
    ], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: {
        entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'input' }, work: node('work'), exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'output' },
    }, wires: { first: wire('first', 'entry', 'work'), second: wire('second', 'work', 'exit') } } });
    const outerDraft = structuredClone(leaf); outerDraft.id = 'outer'; outerDraft.body.nodes.work = instance('work', leaf);
    outerDraft.body.wires.first.toPort = 'input'; outerDraft.body.wires.second.fromPort = 'output';
    const outer = finalize(outerDraft), graph = fixture();
    graph.nodes.one = instance('one', outer); graph.nodes.two = instance('two', outer);
    graph.definitions = { [definitionRefKey(leaf)]: leaf, [definitionRefKey(outer)]: outer };
    assert.equal(validateGraphStructure(graph).ok, true);
    return graph;
}
function bodyAt(root, path) {
    let scope = root, definition;
    for (const id of path) { definition = root.definitions[definitionRefKey(scope.nodes[id].definition)]; scope = definition.body; }
    return { definition, scope };
}

test('qualified private body edit revises all owned ancestors with full-root signatures and preserves shared pins', () => {
    const pinned = nestedFixture(), copied = makeLocalCopy(pinned, { instancePath: ['one', 'work'], id: 'private-leaf' });
    assert.equal(copied.ok, true, JSON.stringify(copied));
    const graph = copied.data.candidate, before = structuredClone(graph), path = ['one', 'work'];
    const previous = bodyAt(graph, path).definition, point = { x: -101.25, y: 9.875 };
    const edit = accepted(prepare(graph, { kind: 'create', viewPath: path, expectedRef: reference(previous), operation: 'smart-compactor', graphPoint: point, connection: { origin: endpoint('entry'), portId: 'in' } }), graph);
    const next = bodyAt(edit.candidate, path);
    assert.equal(edit.changed, true); assert.equal(edit.changedRefs.length, 2); assert.deepEqual(edit.viewPath, path);
    assert.deepEqual(edit.expectedRef, reference(previous)); assert.equal(next.definition.version, previous.version + 1);
    assert.equal(next.scope.nodes[edit.addedNodeIds[0]].x, point.x); assert.equal(next.scope.nodes[edit.addedNodeIds[0]].y, point.y);
    assert.equal(next.scope.wires[edit.addedEdgeIds[0]].from, 'entry');
    assert.deepEqual(edit.candidate.nodes.two, graph.nodes.two);
    for (const [key, snapshot] of Object.entries(pinned.definitions)) assert.deepEqual(edit.candidate.definitions[key], snapshot);
    assert.deepEqual(edit.candidate.localDefinitionOwners, graph.localDefinitionOwners);
    assert.deepEqual(graph, before);
});

test('pinned bodies and stale exact references reject before ID factory while private bodies admit host sources', () => {
    const pinned = nestedFixture(), before = structuredClone(pinned), path = ['one', 'work']; let calls = 0;
    const options = { idFactory() { calls++; return 'new-node'; } };
    const command = { kind: 'create', viewPath: path, operation: 'smart-compactor', graphPoint: { x: 0, y: 0 } };
    assert.equal(prepare(pinned, command, options).error.code, 'READ_ONLY_VIEW');
    const graph = makeLocalCopy(pinned, { instancePath: path, id: 'private-leaf' }).data.candidate;
    const ref = reference(bodyAt(graph, path).definition);
    assert.equal(prepare(graph, { ...command, expectedRef: { ...ref, version: ref.version + 1 } }, options).error.code, 'STALE_DEFINITION');
    assert.equal(calls, 0); assert.deepEqual(pinned, before);
    assert.equal(prepare(graph, { ...command, operation: 'scene-context' }).ok, true);
});

test('private body duplicates and same-pin moves do not revise any immutable snapshot', () => {
    const path = ['one', 'work'], graph = makeLocalCopy(nestedFixture(), { instancePath: path, id: 'private-leaf' }).data.candidate;
    for (const command of [
        { kind: 'connect', origin: endpoint('work', 'in'), target: endpoint('entry') },
        { kind: 'move-output', origin: endpoint('work'), target: endpoint('work') },
        { kind: 'disconnect', edgeIds: ['missing'] },
    ]) {
        const edit = accepted(prepare(graph, { ...command, viewPath: path }), graph);
        assert.equal(edit.changed, false); assert.deepEqual(edit.candidate, graph);
        assert.equal(edit.changedRefs, undefined);
    }
});

test('fresh namespace reserves inactive body IDs, definition IDs, root/table IDs without reallocating pins', () => {
    const graph = nestedFixture(), before = structuredClone(graph), keys = Object.keys(graph.definitions);
    for (const existingId of ['entry', 'work', 'leaf', 'outer', keys[0], graph.id]) {
        const edit = prepare(graph, { kind: 'create', operation: 'smart-compactor', graphPoint: { x: 0, y: 0 } }, { idFactory() { return existingId; } });
        assert.equal(edit.error.code, 'IDENTITY_COLLISION', existingId);
    }
    const snapshot = structuredClone(graph.definitions[keys[0]]); snapshot.id = 'node-4';
    snapshot.body.nodes['node-1'] = { id: 'node-1', type: 'note' };
    snapshot.body.groups = { 'node-2': { id: 'node-2' } };
    snapshot.body.portals = { 'node-3': { id: 'node-3', label: 'Reserved', source: endpoint('entry'), kind: 'context' } };
    const unused = finalize(snapshot); graph.definitions[definitionRefKey(unused)] = unused;
    graph.id = 'node-5'; graph.nodes['node-6'] = { id: 'node-6', type: 'note' };
    graph.groups['node-7'] = { id: 'node-7' }; graph.portals['node-8'] = { id: 'node-8', label: 'Reserved root', source: endpoint('source'), kind: 'context' };
    const edit = accepted(prepare(graph, { kind: 'create', operation: 'smart-compactor', graphPoint: { x: 0, y: 0 } }), graph);
    assert.deepEqual(edit.addedNodeIds, ['node-9']); assert.deepEqual(edit.candidate.definitions, graph.definitions);
    assert.deepEqual(before, nestedFixture());
});

test('untrusted getters, malformed commands, nonfinite points and legacy roots fail without callbacks', () => {
    const graph = fixture(), before = structuredClone(graph); let reads = 0, calls = 0;
    const options = { idFactory() { calls++; return 'unused'; } };
    const commands = [
        { get kind() { reads++; return 'create'; } },
        { kind: 'connect', origin: endpoint('source'), target: { nodeId: 'first', get portId() { reads++; return 'in'; } } },
        { kind: 'create', operation: 'smart-compactor', graphPoint: { x: NaN, y: 1 } },
        { kind: 'create', operation: 'smart-compactor', graphPoint: { x: '1', y: 1 } },
        { kind: 'reroute', edgeId: 'incoming', graphPoint: { x: Infinity, y: 1 } },
        { kind: 'disconnect', publisherIds: 'named' },
        { kind: 'disconnect', edgeIds: null },
        { kind: 'disconnect', publisherIds: null },
        { kind: 'disconnect', edgeIds: [], viewPath: null },
        { kind: 'disconnect-pin', pin: endpoint('source'), publisherPolicy: null },
        { kind: 'create', operation: 'smart-compactor', graphPoint: { x: 0, y: 0 }, controls: null },
        { kind: 'reroute', edgeId: ['incoming'], graphPoint: { x: 0, y: 0 } },
        { kind: 'connect', origin: endpoint('source'), target: endpoint('first', 'in'), replace: 'yes' },
        { kind: 'cancel' },
        { kind: ['connect'], origin: endpoint('source'), target: endpoint('first', 'in') },
        { kind: 'disconnect', edgeIds: [], unexpected: true },
    ];
    for (const command of commands) assert.equal(prepare(graph, command, options).ok, false);
    assert.equal(api.prepareNativeConnectionEdit({ ...graph, get name() { reads++; return 'Unsafe'; } }, { kind: 'disconnect', edgeIds: [] }, options).ok, false);
    assert.equal(api.prepareNativeConnectionEdit(graph, { kind: 'disconnect', edgeIds: [] }, { get idFactory() { reads++; return () => 'unused'; } }).ok, false);
    assert.equal(api.prepareNativeConnectionEdit({ ...graph, schema: 1 }, { kind: 'disconnect', edgeIds: [] }, options).ok, false);
    assert.equal(reads, 0); assert.equal(calls, 0); assert.deepEqual(graph, before);
});

test('factory source mutation cannot change captured full-root document preconditions', () => {
    const graph = fixture(), before = structuredClone(graph);
    const capture = captureGraphEditContext(graph, () => ({ sessionId: 'source-mutation', viewPath: [], readOnly: false }));
    assert.equal(capture.ok, true);
    const edit = prepare(graph, { kind: 'connect', origin: endpoint('first'), target: endpoint('second', 'in') }, { idFactory() { graph.nodes.first.alias = 'Changed after preparation'; return 'new-edge'; } });
    assert.equal(edit.ok, true, JSON.stringify(edit));
    assert.equal(edit.data.baseDocumentSignature, graphDocumentSignature(before));
    assert.notEqual(edit.data.baseDocumentSignature, graphDocumentSignature(graph));
    assert.equal(edit.data.candidate.nodes.first.alias, undefined);
    assert.equal(commitPreparedGraph(graph, { ...edit.data, context: capture.data }).error.code, 'STALE_DOCUMENT');
});

test('combined create and occupied replacement commits as one undo step and no-op creates no history', () => {
    const graph = fixture(); graph.id = 'atomic-connection-history'; const before = structuredClone(graph);
    const context = captureGraphEditContext(graph, () => ({ sessionId: 'connection-session', viewPath: [], readOnly: false }));
    assert.equal(context.ok, true); history.track(graph);
    const noop = accepted(prepare(graph, { kind: 'connect', origin: endpoint('source'), target: endpoint('first', 'in') }), graph);
    assert.deepEqual(commitPreparedGraph(graph, { ...noop, context: context.data }).data, { changed: false, semanticChanged: false, rootId: graph.id });
    assert.equal(history.undo(graph), null);
    const rejected = prepare(graph, { kind: 'create', operation: 'smart-compactor', graphPoint: { x: 11.125, y: 9.75 }, connection: { origin: endpoint('first', 'in'), portId: 'out' } });
    assert.equal(rejected.error.code, 'AMBIGUOUS_INPUT'); assert.equal(history.undo(graph), null);
    const edit = accepted(prepare(graph, { kind: 'create', operation: 'smart-compactor', graphPoint: { x: 11.125, y: 9.75 }, connection: { origin: endpoint('first', 'in'), portId: 'out', replace: true } }), graph);
    assert.deepEqual(edit.removedEdgeIds, ['incoming']);
    const committed = commitPreparedGraph(graph, { ...edit, context: context.data });
    assert.deepEqual(committed.data, { changed: true, semanticChanged: true, rootId: graph.id });
    assert.equal(Object.hasOwn(graph.nodes, edit.addedNodeIds[0]), true);
    assert.ok(history.undo(graph)); assert.deepEqual(graph, before); assert.equal(history.undo(graph), null);
    assert.ok(history.redo(graph)); assert.deepEqual(graph, edit.candidate);
});

test('private factory IDs update only newly created body endpoints and preserve pinned reference identities', () => {
    const path = ['one', 'work'], graph = makeLocalCopy(nestedFixture(), { instancePath: path, id: 'private-leaf' }).data.candidate;
    const before = structuredClone(graph), calls = [];
    const edit = accepted(prepare(graph, { kind: 'reroute', viewPath: path, edgeId: 'first', graphPoint: { x: 12.625, y: -6.75 } }, { idFactory(kind) { calls.push(kind); return 'private-new-' + kind; } }), graph);
    assert.deepEqual(calls, ['node', 'edge']);
    const next = bodyAt(edit.candidate, path).scope;
    assert.equal(next.wires.first.to, 'private-new-node'); assert.equal(next.wires['private-new-edge'].from, 'private-new-node');
    assert.deepEqual(edit.addedNodeIds, ['private-new-node']); assert.deepEqual(edit.addedEdgeIds, ['private-new-edge']);
    assert.deepEqual(edit.candidate.nodes.two.definition, graph.nodes.two.definition);
    assert.deepEqual(graph, before);
});

test('root actual wrapper interface pins are checked by stable identity rather than generic in/out', () => {
    const graph = nestedFixture(), before = structuredClone(graph);
    const edit = accepted(prepare(graph, { kind: 'connect', origin: endpoint('one', 'input'), target: endpoint('source') }), graph);
    assert.equal(edit.candidate.wires[edit.addedEdgeIds[0]].toPort, 'input');
    assert.equal(prepare(graph, { kind: 'connect', origin: endpoint('source'), target: endpoint('one', 'in') }).error.code, 'INVALID_PORT');
    assert.deepEqual(graph, before);
});

test('nonidentity camera capture remains creation geometry when the popup anchor is clamped elsewhere', () => {
    const graph = fixture(), view = { x: -37.5, y: 81.25, zoom: 1.75 }, release = { x: 812.375, y: 193.875 };
    const captured = toGraph(view, release), popup = { x: 700, y: 150 };
    assert.notDeepEqual(toGraph(view, popup), captured);
    for (const command of [
        { kind: 'create', operation: 'smart-compactor', graphPoint: captured, connection: { origin: endpoint('source'), portId: 'in' } },
        { kind: 'reroute', edgeId: 'incoming', graphPoint: captured },
    ]) {
        const edit = accepted(prepare(graph, command), graph), node = edit.candidate.nodes[edit.addedNodeIds[0]];
        assert.deepEqual({ x: node.x, y: node.y }, captured);
        const cache = createGeometryCache(); cache.measure(node.id, 260, 90, [{ id: 'in', direction: 'input', x: 3.25, y: 21.125 }]);
        const pin = cache.endpoint(node.id, 'input', 'in');
        assert.equal((node.x + pin.x) * view.zoom + view.x, release.x + pin.x * view.zoom);
        assert.equal((node.y + pin.y) * view.zoom + view.y, release.y + pin.y * view.zoom);
    }
});

test('input move rejection and mismatched output kinds preserve every direct and portal attachment', () => {
    const graph = fixture(); graph.nodes.text = node('text', 'compose');
    graph.portals.named = { id: 'named', label: 'Context', kind: 'context', source: endpoint('first') };
    graph.wires.hidden = { id: 'hidden', route: 'portal', portalId: 'named', to: 'second', toPort: 'in' };
    const before = structuredClone(graph);
    assert.equal(prepare(graph, { kind: 'move-input', origin: endpoint('second', 'in'), target: endpoint('first', 'in'), replace: true }).error.code, 'CYCLE');
    assert.equal(prepare(graph, { kind: 'move-output', origin: endpoint('first'), target: endpoint('text') }).error.code, 'ARTIFACT_KIND');
    assert.deepEqual(graph, before);
});

test('full-root limits and malformed command bounds reject before any external ID allocation', () => {
    const graph = fixture(); for (let index = 0; index < 995; index++) graph.nodes['note-' + index] = { id: 'note-' + index, type: 'note' };
    let calls = 0; const options = { idFactory() { calls++; return 'unused'; } };
    assert.equal(prepare(graph, { kind: 'create', operation: 'smart-compactor', graphPoint: { x: 0, y: 0 } }, options).ok, false);
    assert.equal(api.prepareNativeConnectionEdit(fixture(), { kind: 'disconnect', edgeIds: Array(20000).fill('missing') }, options).ok, false);
    assert.equal(api.prepareNativeConnectionEdit(fixture(), { kind: 'create', operation: 'smart-compactor', controls: { purpose: '雪'.repeat(666667) }, graphPoint: { x: 0, y: 0 } }, options).ok, false);
    assert.equal(calls, 0);
});

test('admitted long Unicode endpoint and factory identities are preserved without local truncation', () => {
    const graph = fixture(), originalId = '源雪🌈'.repeat(257), newId = '新雪🌈'.repeat(257);
    graph.nodes[originalId] = { ...graph.nodes.alternate, id: originalId }; delete graph.nodes.alternate;
    const edit = accepted(prepare(graph, { kind: 'connect', origin: endpoint(originalId), target: endpoint('second', 'in') }, { idFactory() { return newId; } }), graph);
    assert.deepEqual(edit.addedEdgeIds, [newId]); assert.equal(edit.candidate.wires[newId].from, originalId);
});

test('unified configured creation uses a real stage and leaves neutral nodes dependency-derived',()=>{
 const graph={id:'unified-create',schema:3,runtime:2,mode:'native-unified',nodes:{},wires:{},portals:{},definitions:{}};
 for(const [operation,controls,phase] of [['text',{},undefined],['decision',{},'post'],['read-file',{targetId:'souls'},'pre'],['story-clock',{clockId:'time'},'pre'],['time-trigger',{scheduleId:'curse'},'post']]) {
  const edit=accepted(prepare(graph,{kind:'create',operation,controls,...(phase?{phase}:{}),graphPoint:{x:10,y:20}}),graph),added=edit.candidate.nodes[edit.addedNodeIds[0]];
  assert.equal(added.phase,phase);assert.notEqual(added.phase,'unified');assert.ok(portsForNode(edit.candidate,added).length);
 }
 const automatic=accepted(prepare(graph,{kind:'create',operation:'read-file',graphPoint:{x:0,y:0}}),graph);
 assert.equal(automatic.candidate.nodes[automatic.addedNodeIds[0]].targetId,'lattice-default-notes','Read File has a real scoped automatic preset');
 assert.equal(prepare(graph,{kind:'create',operation:'read-file',controls:{targetId:null},graphPoint:{x:0,y:0}}).ok,false,'Malformed explicit targets remain invalid');
 assert.equal(prepare(graph,{kind:'create',operation:'on-send',phase:'post',graphPoint:{x:0,y:0}}).ok,false,'fixed preparation node cannot become a response node');
});
test('configured Item Use Trigger extraction starts with the active SillyTavern model', () => {
    const graph = { id: 'configured-event-model', schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {}, portals: {}, definitions: {} };
    const edit = accepted(prepare(graph, { kind: 'create', operation: 'item-use-trigger', controls: { itemId: 'wand', mode: 'extract' }, phase: 'post', graphPoint: { x: 10, y: 20 } }), graph);
    const added = edit.candidate.nodes[edit.addedNodeIds[0]];
    assert.equal(added.mode, 'extract');
    assert.equal(added.modelRole, 'eventExtract');
    assert.equal(added.profileId, ACTIVE_PROFILE_ID);
});
test('Context focus creation admits only its mode controls and defaults compression to the active model', () => {
    const graph = { id: 'configured-context-model', schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {}, portals: {}, definitions: {} };
    const command = { kind: 'create', operation: 'context', controls: { mode: 'focus', method: 'compress' }, graphPoint: { x: 10, y: 20 } };
    const edit = accepted(prepare(graph, command), graph), added = edit.candidate.nodes[edit.addedNodeIds[0]];
    assert.equal(added.mode, 'focus'); assert.equal(added.method, 'compress');
    assert.equal(added.modelRole, 'Analysis'); assert.equal(added.profileId, ACTIVE_PROFILE_ID);
    assert.equal(added.inputCount, undefined, 'defaults from assemble do not leak into focus');
    assert.equal(prepare(graph, { ...command, controls: { ...command.controls, inputCount: 3 } }).error.code, 'INVALID_SETTINGS');
});
test('configured Introspection creation selects its effective role without binding deterministic nodes', () => {
    const graph = { id: 'configured-model-modes', schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {}, portals: {}, definitions: {} };
    for (const [operation, controls, role, profileId] of [
        ['express', { mode: 'inner-voice' }, 'Prose', ACTIVE_PROFILE_ID],
        ['express', { mode: 'behavior' }, null, null],
        ['context', { mode: 'focus', method: 'select' }, null, null],
        ['item-use-trigger', { itemId: 'wand', mode: 'candidates' }, null, null],
    ]) {
        const edit = accepted(prepare(graph, { kind: 'create', operation, controls, graphPoint: { x: 10, y: 20 } }), graph), added = edit.candidate.nodes[edit.addedNodeIds[0]];
        assert.equal(added.modelRole, role, operation + ':' + controls.mode);
        assert.equal(added.profileId, profileId, operation + ':' + controls.mode);
    }
    const retired = prepare(graph, { kind: 'create', operation: 'fast-decision', controls: {}, graphPoint: { x: 10, y: 20 } });
    assert.equal(retired.ok, false, 'retired model calls cannot be created');
    assert.deepEqual(graph.nodes, {}, 'rejection leaves the graph unchanged');
});
test('inserting a reroute in a unified Post wire preserves dependency-derived stage',()=>{
 const graph={id:'unified-route',schema:3,runtime:2,mode:'native-unified',nodes:{source:{id:'source',type:'workflow',operation:'text',text:'post',phase:'post'},compose:{id:'compose',type:'workflow',operation:'compose',sections:[{name:'body',text:''}]}},wires:{edge:{id:'edge',route:'wire',from:'source',fromPort:'out',to:'compose',toPort:'section.body'}},portals:{},definitions:{}};
 const edit=accepted(prepare(graph,{kind:'reroute',edgeId:'edge',graphPoint:{x:0,y:0}}),graph),added=edit.candidate.nodes[edit.addedNodeIds[0]];assert.equal(added.phase,undefined);assert.notEqual(added.phase,'unified');
});

test('unified workflows accept pinned legacy stage definitions while legacy containers retain their stage',()=>{
 const raw={id:'stage-helper',version:1,name:'Preparation helper',interface:[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'}],parameters:[],body:{schema:3,runtime:2,mode:'native-pre',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'}},wires:{pass:{id:'pass',route:'wire',from:'entry',fromPort:'out',to:'exit',toPort:'in'}}}};
 const checked=computeDefinitionIdentity(raw);assert.equal(checked.ok,true);const definition={...checked.data.materializedDefinition,semanticHash:checked.data.semanticHash};
 for(const mode of ['native-unified','native-pre','native-post']) {
  const graph={id:'container',schema:3,runtime:2,mode,nodes:{},wires:{},portals:{},definitions:{}},result=prepare(graph,{kind:'create-instance',definition,graphPoint:{x:0,y:0}});
  assert.equal(result.ok,mode!=='native-post',JSON.stringify(result.error));if(result.ok)assert.equal(validateGraphStructure(result.data.candidate).ok,true);
 }
});
