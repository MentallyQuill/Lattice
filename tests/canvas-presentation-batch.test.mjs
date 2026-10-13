import test from 'node:test';
import assert from 'node:assert/strict';
import * as presentation from '../src/canvas/presentation.js?v=0.27.2';

const cardsFor = presentation.nodeCards;
function fixture(count = 250) {
    const graph = { schema: 3, runtime: 2, mode: 'native-pre', nodes: {}, wires: {}, groups: {}, portals: {}, definitions: {}, nativeCards: {} };
    for (let index = 0; index < count; index++) {
        const id = 'node-' + index, node = { id, type: 'workflow', operation: 'scene-context', x: index * 40, y: index * 20, enabled: index !== 8 };
        if (index === 7) node.presentation = { alias: 'Local alias', compact: true };
        graph.nodes[id] = node;
        graph.nativeCards[id] = { canonicalTitle: 'Context ' + index, family: 'Shaping', iconPath: 'M1 1h2', body: 'Prepared body', hostResult: index === 9,
            ports: [{ id: 'out:context', port: 'context', dir: 'out', side: 'right', row: 1, kind: 'context', label: 'Context', className: 'pc-port pc-port-out', title: 'Context output' }] };
        if (index) graph.wires['wire-' + index] = { id: 'wire-' + index, route: 'wire', from: 'node-' + (index - 1), fromPort: 'context', to: id, toPort: 'context' };
    }
    return { graph, nodes: Object.values(graph.nodes), context: { graph, selection: { kind: 'node', id: 'node-3' }, multi: new Set(['node-4', 'node-5']), trace: new Map([['node-6', { status: 'running' }]]) } };
}
function countDescriptors(objects, run) {
    const read = Object.getOwnPropertyDescriptors, counts = Object.fromEntries(Object.keys(objects).map(key => [key, 0]));
    Object.getOwnPropertyDescriptors = value => {
        for (const [key, object] of Object.entries(objects)) if (value === object) counts[key]++;
        return read(value);
    };
    try { return { result: run(), counts }; } finally { Object.getOwnPropertyDescriptors = read; }
}

test('250-card batch classifies graph tables once and preserves every keyed card field', () => {
    const f = fixture(), expected = f.nodes.map(node => presentation.nodeCard(node, f.context));
    let preparedCalls = 0;
    f.context.hooks = { nativeCard: node => { preparedCalls++; return f.graph.nativeCards[node.id]; } };
    const { result, counts } = countDescriptors({ graph: f.graph, nodes: f.graph.nodes, wires: f.graph.wires, groups: f.graph.groups, firstNode: f.nodes[0], firstCard: f.graph.nativeCards['node-0'] }, () => cardsFor(f.nodes, f.context));
    assert.deepEqual(result, expected); assert.equal(preparedCalls, 250, 'every node still obtains its prepared card');
    assert.deepEqual(counts, { graph: 1, nodes: 1, wires: 1, groups: 1, firstNode: 1, firstCard: 1 });
});

test('standalone node and prepared-card projection continue to classify every graph', () => {
    const f = fixture(1), { counts } = countDescriptors({ graph: f.graph, nodes: f.graph.nodes }, () => {
        presentation.nodeCard(f.nodes[0], f.context); presentation.preparedCardFor(f.graph, f.nodes[0]);
    });
    assert.deepEqual(counts, { graph: 2, nodes: 2 });
    f.graph.schema = 1;
    assert.throws(() => presentation.nodeCard(f.nodes[0], f.context), /prepared current workflow graph/);
    assert.throws(() => presentation.preparedCardFor(f.graph, f.nodes[0]), /prepared current workflow graph/);
});

test('batch rejects unsafe graph and node descriptors without reading their accessors', () => {
    const f = fixture(1); let reads = 0, hooks = 0;
    f.context.hooks = { nativeCard: () => { hooks++; return f.graph.nativeCards['node-0']; } };
    Object.defineProperty(f.graph, 'nativeCards', { get() { reads++; throw new Error('Must not read'); } });
    assert.throws(() => cardsFor(f.nodes, f.context), /prepared current workflow graph/); assert.equal(reads, 0); assert.equal(hooks, 0);
    const other = fixture(1); other.context.hooks = { nativeCard: () => { hooks++; throw new Error('Must not prepare'); } };
    Object.defineProperty(other.nodes[0], 'id', { get() { reads++; throw new Error('Must not read'); } });
    assert.throws(() => cardsFor(other.nodes, other.context), /prepared current workflow node/); assert.equal(reads, 0); assert.equal(hooks, 0);
});

test('batch rejects accessor elements before iterating an external node array', () => {
    const f = fixture(1); let reads = 0, hooks = 0;
    const nodes = []; Object.defineProperty(nodes, '0', { get() { reads++; throw new Error('Must not read'); }, enumerable: true });
    f.context.hooks = { nativeCard: () => { hooks++; throw new Error('Must not prepare'); } };
    assert.throws(() => cardsFor(nodes, f.context), /prepared current workflow nodes/); assert.equal(reads, 0); assert.equal(hooks, 0);
});

test('batch retains per-node and prepared-card budgets rather than combining authoring traversal limits', () => {
    const f = fixture();
    for (const node of f.nodes) node.presentation = { alias: 'Large prepared node', details: Array.from({ length: 90 }, (_, index) => 'detail-' + index) };
    assert.equal(cardsFor(f.nodes, f.context).length, 250);
});

test('batch rejects unsafe prepared cards and malformed named side pins', () => {
    const accessor = fixture(1); let reads = 0;
    Object.defineProperty(accessor.graph.nativeCards['node-0'], 'body', { get() { reads++; throw new Error('Must not read'); } });
    assert.throws(() => cardsFor(accessor.nodes, accessor.context), /prepared current workflow card/); assert.equal(reads, 0);
    for (const corrupt of [ports => ports.push({ ...ports[0] }), ports => { ports[0].side = 'left'; }, ports => { ports[0].port = ''; }, ports => { ports[0].row = 0; }]) {
        const f = fixture(1); corrupt(f.graph.nativeCards['node-0'].ports);
        assert.throws(() => cardsFor(f.nodes, f.context), /prepared named side pins/);
    }
    const retired = fixture(1); retired.nodes[0].type = 'decider';
    assert.throws(() => cardsFor(retired.nodes, retired.context), /prepared current workflow node/);
});


test('batch uses the exact graph reference it classified even when the context has a switching getter', () => {
    const f = fixture(2), retired = { ...f.graph, schema: 1, nativeCards: structuredClone(f.graph.nativeCards) };
    for (const card of Object.values(retired.nativeCards)) card.canonicalTitle = 'Retired graph card';
    let reads = 0;
    const context = { ...f.context, get graph() { reads++; return reads === 1 ? f.graph : retired; } };
    const expected = f.nodes.map(node => presentation.nodeCard(node, f.context));
    assert.deepEqual(cardsFor(f.nodes, context), expected); assert.equal(reads, 1);
});
