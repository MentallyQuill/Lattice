import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareNativeConnectionEdit as prepare } from '../src/workflow/connection-edits.js';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js';
import { validateGraphStructure } from '../src/workflow/contracts.js';
import { graphDocumentSignature, graphSemanticSignature } from '../src/workflow/ports.js';
import { portsForNode } from '../src/workflow/catalog.js';
import { makeLocalCopy } from '../src/workflow/definition-library.js';
import { exportSubgraph, parseSubgraph, selectSubgraphClosure } from '../src/workflow/packages.js';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js';
import * as history from '../src/history.js?v=0.27.0';
import { prepareImportedDefinitionPins } from '../src/workflow/definition-insertion.js';

const ref = value => ({ id: value.id, version: value.version, semanticHash: value.semanticHash });
const pin = (nodeId, portId = 'out') => ({ nodeId, portId });
const wire = (id, from, to, fromPort = 'out', toPort = 'in') => ({ id, route: 'wire', from, fromPort, to, toPort, order: 0 });
const wrapper = (id, definition) => ({ id, type: 'subgraph', definition: ref(definition), parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {} });
const finalize = draft => {
    const result = computeDefinitionIdentity(draft); assert.equal(result.ok, true, JSON.stringify(result));
    return { ...structuredClone(result.data.materializedDefinition), semanticHash: result.data.semanticHash };
};
function leaf(id = 'source-leaf') {
    return finalize({ id, version: 1, name: 'Saved Loom', interface: [
        { id: 'input', label: 'Input', direction: 'input', kind: 'context', required: true, cardinality: 'one', boundaryNodeId: 'entry' },
        { id: 'output', label: 'Output', direction: 'output', kind: 'context', required: false, cardinality: 'one', boundaryNodeId: 'exit' },
    ], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: {
        entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'input' },
        work: { id: 'work', type: 'workflow', operation: 'smart-compactor' },
        exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'output' },
    }, wires: { a: wire('a', 'entry', 'work'), b: wire('b', 'work', 'exit') } } });
}
function source() {
    const child = leaf(), draft = structuredClone(child); draft.id = 'source-outer'; draft.name = 'Nested Loom';
    draft.body.nodes.work = wrapper('work', child); draft.body.wires.a.toPort = 'input'; draft.body.wires.b.fromPort = 'output';
    return { definition: finalize(draft), snapshots: { [definitionRefKey(child)]: child } };
}
function root() {
    return { id: 'instance-root', schema: 3, runtime: 2, mode: 'native-pre', nodes: {
        source: { id: 'source', type: 'workflow', operation: 'scene-context' },
        target: { id: 'target', type: 'workflow', operation: 'smart-compactor' },
    }, wires: { incoming: wire('incoming', 'source', 'target') }, portals: {}, definitions: {}, groups: {} };
}
const command = (saved = source(), extra = {}) => ({ kind: 'create-instance', ...saved, graphPoint: { x: -31.625, y: 97.125 }, ...extra });
function accepted(result, original) {
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(validateGraphStructure(result.data.candidate).ok, true);
    assert.equal(result.data.baseSignature, graphSemanticSignature(original));
    assert.equal(result.data.baseDocumentSignature, graphDocumentSignature(original));
    return result.data;
}
function at(root, path) {
    let scope = root, definition;
    for (const id of path) { definition = root.definitions[definitionRefKey(scope.nodes[id].definition)]; scope = definition.body; }
    return { definition, scope };
}

test('one instance candidate owns exact nested snapshots and uses captured coordinates without changing sources', () => {
    const graph = root(), saved = source(), graphBefore = structuredClone(graph), savedBefore = structuredClone(saved);
    const edit = accepted(prepare(graph, command(saved)), graph), added = edit.candidate.nodes[edit.addedNodeIds[0]];
    assert.equal(edit.changed, true); assert.deepEqual(edit.viewPath, []);
    assert.deepEqual(added.definition, ref(saved.definition)); assert.equal(added.type, 'subgraph');
    assert.deepEqual({ x: added.x, y: added.y }, { x: -31.625, y: 97.125 });
    assert.equal(added.localCopy, undefined); assert.equal(edit.candidate.localDefinitionOwners, undefined);
    assert.deepEqual(portsForNode(edit.candidate, added).map(port => port.id), ['input', 'output']);
    assert.deepEqual(new Set(edit.addedDefinitionKeys), new Set([definitionRefKey(saved.definition), ...Object.keys(saved.snapshots)]));
    assert.deepEqual(graph, graphBefore); assert.deepEqual(saved, savedBefore);
});

test('create instance connects either direction and explicit occupied replacement is one real history step', () => {
    const graph = root(), saved = source(), before = structuredClone(graph);
    const forward = accepted(prepare(graph, command(saved, { connection: { origin: pin('source'), portId: 'input' } })), graph);
    assert.equal(forward.candidate.wires[forward.addedEdgeIds[0]].to, forward.addedNodeIds[0]);
    const reverse = command(saved, { connection: { origin: pin('target', 'in'), portId: 'output' } });
    assert.equal(prepare(graph, reverse).error.code, 'AMBIGUOUS_INPUT');
    const edit = accepted(prepare(graph, { ...reverse, connection: { ...reverse.connection, replace: true } }), graph);
    assert.deepEqual(edit.removedEdgeIds, ['incoming']); assert.equal(edit.candidate.wires[edit.addedEdgeIds[0]].from, edit.addedNodeIds[0]);
    history.track(graph);
    const captured = captureGraphEditContext(graph, () => ({ sessionId: 'instance-history', viewPath: [], readOnly: false }));
    assert.equal(captured.ok, true);
    assert.equal(commitPreparedGraph(graph, { ...edit, context: captured.data }).ok, true);
    assert.ok(history.undo(graph)); assert.deepEqual(graph, before); assert.equal(history.undo(graph), null);
    assert.ok(history.redo(graph)); assert.deepEqual(graph, edit.candidate); assert.equal(history.redo(graph), null);
});

test('standalone subgraph roundtrip feeds the same instance producer without a workflow wrapper or shelf write', () => {
    const saved = source(), parsed = parseSubgraph(JSON.stringify(exportSubgraph(saved.definition, saved.snapshots)));
    assert.equal(parsed.ok, true);
    const graph = root(), edit = accepted(prepare(graph, command({ definition: parsed.data.definition, snapshots: parsed.data.definitions })), graph);
    assert.deepEqual(edit.candidate.nodes[edit.addedNodeIds[0]].definition, ref(parsed.data.definition));
    const selected = selectSubgraphClosure(parsed.data.definition, parsed.data.definitions);
    assert.equal(selected.ok, true); assert.equal(Object.isFrozen(selected.data), true);
    assert.equal(parseSubgraph(JSON.stringify({ kind: 'lattice-subgraph', schema: 2, minRuntime: 2 })).ok, false);
});

function privateRoot() {
    const graph = root(), saved = source();
    graph.definitions = { ...saved.snapshots, [definitionRefKey(saved.definition)]: saved.definition };
    graph.nodes.one = wrapper('one', saved.definition); graph.nodes.two = wrapper('two', saved.definition);
    const copied = makeLocalCopy(graph, { instancePath: ['one', 'work'], id: 'recipient-private-leaf' });
    assert.equal(copied.ok, true, JSON.stringify(copied)); return copied.data.candidate;
}

test('qualified instance creation merges real root snapshots before immutable ancestor revisions and preserves siblings', () => {
    const graph = privateRoot(), path = ['one', 'work'], before = structuredClone(graph), previous = at(graph, path).definition;
    const other = leaf('new-imported-leaf'), calls = [];
    const edit = accepted(prepare(graph, command({ definition: other }, { viewPath: path, expectedRef: ref(previous), connection: { origin: pin('entry'), portId: 'input' } }), { idFactory(kind) { calls.push(kind); return 'qualified-added-' + kind; } }), graph);
    const next = at(edit.candidate, path);
    assert.deepEqual(calls, ['node', 'edge']); assert.equal(next.definition.version, previous.version + 1);
    assert.equal(edit.changedRefs.filter(change => change.instancePath).length, 2);
    assert.deepEqual(next.scope.nodes['qualified-added-node'].definition, ref(other));
    assert.equal(next.scope.wires['qualified-added-edge'].toPort, 'input');
    assert.deepEqual(edit.expectedRef, ref(previous)); assert.deepEqual(edit.viewPath, path);
    assert.deepEqual(edit.candidate.nodes.two, graph.nodes.two); assert.deepEqual(edit.candidate.localDefinitionOwners, graph.localDefinitionOwners);
    assert.deepEqual(edit.candidate.definitions[definitionRefKey(other)], other);
    assert.deepEqual(graph, before);
});

test('private source IDs are copied recursively with coherent exact refs and no editing grant on repeated placement', () => {
    let graph = privateRoot();
    const owner = at(graph, ['one']).definition, selected = selectSubgraphClosure(owner, graph.definitions);
    assert.equal(selected.ok, true);
    const saved = { definition: selected.data.definition, snapshots: selected.data.definitions }, savedBefore = structuredClone(saved), ownerRef = ref(owner);
    for (let pass = 0; pass < 2; pass++) {
        const before = structuredClone(graph), calls = [];
        const edit = accepted(prepare(graph, command(saved, { connection: { origin: pin('source'), portId: 'input' } }), { idFactory(kind) { calls.push(kind); return `placed-${pass}-${calls.length}-${kind}`; } }), graph);
        assert.deepEqual(calls, ['definition', 'definition', 'node', 'edge']);
        const inserted = edit.candidate.nodes[edit.addedNodeIds[0]], top = edit.candidate.definitions[definitionRefKey(inserted.definition)];
        assert.notEqual(inserted.definition.id, owner.id); assert.equal(inserted.definition.version, 1);
        assert.notEqual(top.body.nodes.work.definition.id, owner.body.nodes.work.definition.id);
        assert.equal(top.body.nodes.work.id, 'work'); assert.equal(top.body.nodes.entry.id, 'entry');
        assert.equal(computeDefinitionIdentity(top).data.semanticHash, inserted.definition.semanticHash);
        assert.equal(edit.changedRefs.length, 2);
        for (const change of edit.changedRefs) assert.equal(Object.hasOwn(edit.candidate.definitions, definitionRefKey(change.after)), true);
        assert.deepEqual(edit.candidate.nodes.one.definition, ownerRef); assert.deepEqual(edit.candidate.localDefinitionOwners, before.localDefinitionOwners);
        assert.equal(inserted.localCopy, undefined); assert.deepEqual(graph, before);
        graph = edit.candidate;
    }
    assert.deepEqual(saved, savedBefore);
});

test('equal nonprivate pins retain recipient bindings and genuine cross-hash conflicts reject before user allocation', () => {
    const graph = root(), saved = source(), childKey = Object.keys(saved.snapshots)[0];
    graph.definitions = { ...structuredClone(saved.snapshots), [definitionRefKey(saved.definition)]: structuredClone(saved.definition) };
    graph.definitions[childKey].body.nodes.work.profileId = 'recipient-local-profile';
    const edit = accepted(prepare(graph, command(saved)), graph);
    assert.deepEqual(edit.addedDefinitionKeys, []); assert.equal(edit.candidate.definitions[childKey].body.nodes.work.profileId, 'recipient-local-profile');
    assert.deepEqual(edit.candidate.nodes[edit.addedNodeIds[0]].definition, ref(saved.definition));
    const privateGraph = privateRoot(), original = at(privateGraph, ['one']).definition;
    const selected = selectSubgraphClosure(original, privateGraph.definitions).data;
    const oldChild = Object.values(selected.definitions)[0], childDraft = structuredClone(oldChild); childDraft.body.nodes.work.targetTokens = 321;
    const child = finalize(childDraft), topDraft = structuredClone(selected.definition); topDraft.body.nodes.work.definition = ref(child);
    const conflict = { definition: finalize(topDraft), snapshots: { [definitionRefKey(child)]: child } }, before = structuredClone(privateGraph);
    let calls = 0;
    assert.equal(prepare(privateGraph, command(conflict), { idFactory() { calls++; return 'attempt'; } }).error.code, 'DEFINITION_CONFLICT');
    assert.equal(calls, 0); assert.deepEqual(privateGraph, before);
});

test('pinned paths, absent or stale containing pins and invalid actual interface choices reject without allocation', () => {
    const graph = root(), saved = source(); graph.definitions = { ...saved.snapshots, [definitionRefKey(saved.definition)]: saved.definition }; graph.nodes.pinned = wrapper('pinned', saved.definition);
    const privateGraph = privateRoot(), path = ['one', 'work'], current = at(privateGraph, path).definition;
    let calls = 0; const options = { idFactory() { calls++; return 'unused'; } };
    assert.equal(prepare(graph, command(saved, { viewPath: ['pinned'], expectedRef: ref(saved.definition) }), options).error.code, 'READ_ONLY_VIEW');
    assert.equal(prepare(privateGraph, command(saved, { viewPath: path }), options).error.code, 'STALE_DEFINITION');
    assert.equal(prepare(privateGraph, command(saved, { viewPath: path, expectedRef: { ...ref(current), version: current.version + 1 } }), options).error.code, 'STALE_DEFINITION');
    for (const connection of [{ origin: pin('source'), portId: 'in' }, { origin: pin('target', 'in'), portId: 'input' }, { origin: pin('target'), portId: 'output' }, { origin: pin('missing'), portId: 'input' }]) {
        const before = structuredClone(graph); assert.equal(prepare(graph, command(saved, { connection }), options).ok, false); assert.deepEqual(graph, before);
    }
    assert.equal(calls, 0);
});

test('source missing/hash/phase/port/portal-cycle and plain-data failures preserve the connected root', () => {
    const graph = root(), before = structuredClone(graph), saved = source(); let calls = 0, reads = 0;
    const options = { idFactory() { calls++; return 'unused'; } };
    const badChild = structuredClone(saved.snapshots); Object.values(badChild)[0].body.nodes.work.targetTokens = 7;
    const wrongPhase = structuredClone(saved.definition); wrongPhase.body.mode = 'native-post';
    const invalidPort = structuredClone(leaf()); invalidPort.body.nodes.work.operation = 'scene-context';
    const cyclic = structuredClone(leaf()); cyclic.body.portals = { hidden: { id: 'hidden', label: 'Hidden', kind: 'context', source: pin('work') } }; cyclic.body.wires.a = { id: 'a', route: 'portal', portalId: 'hidden', to: 'work', toPort: 'in' };
    const getter = command(saved); Object.defineProperty(getter, 'definition', { enumerable: true, get() { reads++; return saved.definition; } });
    const invalid = [command({ definition: saved.definition }), command({ definition: saved.definition, snapshots: badChild }), command({ definition: finalize(wrongPhase) }), command({ definition: finalize(invalidPort) }), command({ definition: finalize(cyclic) }), getter,
        command(saved, { graphPoint: { x: Infinity, y: 0 } }), command(saved, { phase: 'post' }), command(saved, { connection: { origin: pin('target', 'in'), portId: 'output' } })];
    for (const value of invalid) assert.equal(prepare(graph, value, options).ok, false);
    assert.equal(reads, 0); assert.equal(calls, 0); assert.deepEqual(graph, before);
});

test('valid opposite-phase source and recursive source pins reject without changing incoming attachments', () => {
    const graph = root(), before = structuredClone(graph), post = structuredClone(leaf()); post.body.mode = 'native-post';
    for (const port of post.interface) port.kind = 'draft';
    post.body.nodes.work = { id: 'work', type: 'workflow', operation: 'reroute', artifactKind: 'draft', phase: 'post' };
    const validPost = finalize(post); assert.equal(selectSubgraphClosure(validPost).ok, true);
    const recursive = structuredClone(leaf()); recursive.semanticHash = 'sha256:' + '0'.repeat(64);
    recursive.body.nodes.work = wrapper('work', recursive); recursive.body.wires.a.toPort = 'input'; recursive.body.wires.b.fromPort = 'output';
    let calls = 0; const options = { idFactory() { calls++; return 'unused'; } };
    assert.equal(prepare(graph, command({ definition: validPost }), options).error.code, 'WRONG_PHASE');
    assert.equal(prepare(graph, command({ definition: recursive, snapshots: { [definitionRefKey(recursive)]: recursive } }), options).error.code, 'DEFINITION_RECURSION');
    assert.equal(calls, 0); assert.deepEqual(graph, before);
});

test('valid deep closure cannot exceed actual recipient instance depth before allocator callbacks', () => {
    let top = leaf('deep-0'); const snapshots = {};
    for (let depth = 1; depth < 8; depth++) {
        snapshots[definitionRefKey(top)] = top;
        const draft = structuredClone(leaf('deep-' + depth)); draft.body.nodes.work = wrapper('work', top); draft.body.wires.a.toPort = 'input'; draft.body.wires.b.fromPort = 'output'; top = finalize(draft);
    }
    assert.equal(selectSubgraphClosure(top, snapshots).ok, true);
    const graph = privateRoot(), path = ['one', 'work'], before = structuredClone(graph); let calls = 0;
    assert.equal(prepare(graph, command({ definition: top, snapshots }, { viewPath: path, expectedRef: ref(at(graph, path).definition) }), { idFactory() { calls++; return 'unused'; } }).ok, false);
    assert.equal(calls, 0); assert.deepEqual(graph, before);
});

test('valid stored wire traversal at the cap rejects a combined closure before user ID allocation', () => {
    const draft = structuredClone(leaf('wire-cap')); delete draft.body.nodes.work; draft.body.wires = {};
    draft.body.portals = { context: { id: 'context', label: 'Context', kind: 'context', source: pin('entry') } };
    let count = 0;
    for (let index = 0; index < 125; index++) {
        const id = 'join-' + index, inputs = Array.from({ length: index === 124 ? 15 : 16 }, (_, slot) => ({ id: 'slot-' + slot, label: 'Slot ' + slot }));
        draft.body.nodes[id] = { id, type: 'workflow', operation: 'context-join', operationVersion: 1, inputs };
        for (const input of inputs) { const edgeId = 'consumer-' + count++; draft.body.wires[edgeId] = { id: edgeId, route: 'portal', portalId: 'context', to: id, toPort: input.id }; }
    }
    draft.body.wires.exit = { id: 'exit', route: 'portal', portalId: 'context', to: 'exit', toPort: 'in' };
    const unused = finalize(draft), graph = root(); graph.definitions[definitionRefKey(unused)] = unused;
    assert.equal(Object.keys(unused.body.wires).length, 2000); assert.equal(validateGraphStructure(graph).ok, true);
    const before = structuredClone(graph); let calls = 0;
    assert.equal(prepare(graph, command(), { idFactory() { calls++; return 'unused'; } }).ok, false);
    assert.equal(calls, 0); assert.deepEqual(graph, before);
});

test('actual expanded and stored limits reject before external allocators even with valid source definitions', () => {
    const expanded = root(); for (let i = 0; i < 995; i++) expanded.nodes['note-' + i] = { id: 'note-' + i, type: 'note' };
    assert.equal(validateGraphStructure(expanded).ok, true);
    const stored = root(), unused = finalize({ id: 'unused', version: 1, name: 'Unused', interface: [], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: Object.fromEntries(Array.from({ length: 998 }, (_, i) => ['note-' + i, { id: 'note-' + i, type: 'note' }])), wires: {} } });
    stored.definitions[definitionRefKey(unused)] = unused; assert.equal(validateGraphStructure(stored).ok, true);
    let calls = 0;
    for (const graph of [expanded, stored]) {
        const before = structuredClone(graph);
        assert.equal(prepare(graph, command(), { idFactory() { calls++; return 'unused'; } }).ok, false);
        assert.deepEqual(graph, before);
    }
    assert.equal(calls, 0);
});

test('final fresh IDs reserve root, table and inactive body identities; callback failures are atomic', () => {
    const graph = root(), saved = source(), before = structuredClone(graph);
    for (const id of [graph.id, 'source', 'entry', 'work', saved.definition.id, definitionRefKey(saved.definition), '__proto__', '', null]) {
        let calls = 0; assert.equal(prepare(graph, command(saved), { idFactory() { calls++; return id; } }).error.code, 'IDENTITY_COLLISION'); assert.equal(calls, 1);
    }
    assert.equal(prepare(graph, command(saved), { idFactory() { throw Error('unavailable'); } }).ok, false);
    const large = '雪'.repeat(300), edit = accepted(prepare(graph, command(saved), { idFactory() { return large; } }), graph);
    assert.deepEqual(edit.addedNodeIds, [large]); assert.deepEqual(graph, before);
});

test('a final wrapper ID cannot collide with a newly rehashed copied definition table key', () => {
    const graph = privateRoot(), before = structuredClone(graph), selected = selectSubgraphClosure(at(graph, ['one']).definition, graph.definitions).data;
    const saved = { definition: selected.definition, snapshots: selected.definitions }, pins = { ...saved.snapshots, [definitionRefKey(saved.definition)]: saved.definition };
    const fresh = ['fresh-child-copy', 'fresh-outer-copy']; let index = 0;
    const copied = prepareImportedDefinitionPins(graph, pins, [ref(saved.definition)], () => ({ ok: true, data: fresh[index++] }));
    assert.equal(copied.ok, true);
    const futureKey = definitionRefKey(copied.data.refs[0]); index = 0;
    const result = prepare(graph, command(saved), { idFactory(kind) { return kind === 'definition' ? fresh[index++] : futureKey; } });
    assert.equal(result.ok, false); assert.equal(result.error.code, 'IDENTITY_COLLISION'); assert.deepEqual(graph, before);
});

test('factored snapshot policy rejects getter tables without reading them and uses actual original merge preconditions', () => {
    const graph = root(), before = structuredClone(graph); let reads = 0;
    const bad = {}; Object.defineProperty(bad, 'snapshot', { enumerable: true, get() { reads++; return leaf(); } });
    assert.equal(prepareImportedDefinitionPins(graph, bad, []).ok, false);
    const saved = source(), pins = { ...saved.snapshots, [definitionRefKey(saved.definition)]: saved.definition };
    const merged = prepareImportedDefinitionPins(graph, pins, []);
    assert.equal(merged.ok, true); assert.deepEqual(merged.data.refs, []); assert.deepEqual(merged.data.changedRefs, []);
    assert.deepEqual(new Set(merged.data.addedDefinitionKeys), new Set(Object.keys(pins)));
    assert.equal(reads, 0); assert.deepEqual(graph, before);
});

test('an explicit null snapshot table is rejected instead of becoming an empty closure', () => {
    const graph = root(), before = structuredClone(graph); let calls = 0;
    assert.equal(prepare(graph, command({ definition: leaf(), snapshots: null }), { idFactory() { calls++; return 'new-wrapper'; } }).ok, false);
    assert.equal(calls, 0); assert.deepEqual(graph, before);
});

test('retired early-native insertion rejects before ID allocation and preserves its source', () => {
    const graph = root(); graph.schema = 2; graph.runtime = 1; delete graph.definitions; delete graph.portals;
    for (const edge of Object.values(graph.wires)) { delete edge.route; delete edge.fromPort; delete edge.toPort; }
    const before = structuredClone(graph); let calls = 0;
    assert.equal(prepare(graph, command(source(), { connection: { origin: pin('source'), portId: 'missing' } }), { idFactory() { calls++; return 'unused'; } }).ok, false);
    assert.equal(calls, 0); assert.deepEqual(graph, before);
    const result = prepare(graph, command(), { idFactory() { calls++; return 'unused'; } });
    assert.equal(result.error.code, 'UNSUPPORTED_VERSION');
    assert.equal(calls, 0); assert.deepEqual(graph, before);
});

test('factory cannot retarget captured source or original dual preconditions during final rebuilding', () => {
    const graph = root(), saved = source(), before = structuredClone(graph), savedBefore = structuredClone(saved);
    const captured = captureGraphEditContext(graph, () => ({ sessionId: 'source-mutation', viewPath: [], readOnly: false })); assert.equal(captured.ok, true);
    const edit = prepare(graph, command(saved), { idFactory() { graph.name = 'changed outside'; saved.definition.name = 'changed outside'; return 'external-node'; } });
    assert.equal(edit.ok, true);
    assert.equal(edit.data.baseSignature, graphSemanticSignature(before)); assert.equal(edit.data.baseDocumentSignature, graphDocumentSignature(before));
    assert.deepEqual(edit.data.candidate.definitions[definitionRefKey(savedBefore.definition)], savedBefore.definition);
    assert.equal(commitPreparedGraph(graph, { ...edit.data, context: captured.data }).ok, false); assert.equal(Object.hasOwn(graph.nodes, 'external-node'), false);
});
