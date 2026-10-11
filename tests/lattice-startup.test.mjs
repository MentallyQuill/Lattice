import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as S from '../src/state.js?v=0.26.0';
import { starterGraph } from '../src/workflow/starters.js?v=0.26.0';

function host(extensionSettings = {}) {
    let effects = 0;
    const context = { extensionSettings, saveSettingsDebounced() { effects++; } };
    globalThis.SillyTavern = { getContext: () => context };
    return { context, effects: () => effects };
}
const legacy = (graphs, activeGraphId = null, extra = {}) => ({ schema: 1, enabled: false, activeGraphId, graphs, nativeBindings: { preGraphId: null, postGraphId: null }, subgraphLibrary: { definitions: {} }, ui: {}, ...extra });

test('fresh Lattice opens a current zero-call document without reading old settings', () => {
    const root = {};
    Object.defineProperty(root, 'prompt-canvas', { enumerable: true, get() { throw new Error('Old settings must not be read'); } });
    const h = host(root), value = S.settings(), graph = S.activeWorkflow();
    assert.equal(S.MODULE, 'lattice'); assert.equal(root.lattice, value);
    assert.equal(value.schema, 2); assert.equal(value.enabled, false);
    assert.equal(Object.hasOwn(value, 'graphs'), false); assert.equal(Object.hasOwn(value, 'nativeBindings'), false);
    assert.equal(graph.schema, 3); assert.equal(graph.runtime, 2); assert.equal(graph.mode, 'native-unified');
    assert.deepEqual(Object.values(graph.nodes).map(n => n.operation), ['on-send', 'generate-reply', 'review-publish']);
    assert.equal(h.effects(), 0); assert.equal(S.settings(), value); assert.equal(S.activeWorkflow(), graph);
});

test('retired documents remain recoverable and never erase a valid migrated document', () => {
    const graph = starterGraph('structured-guidance'), retired = { id: 'old', schema: 1, nodes: {}, wires: {} };
    const stored = legacy({ [graph.id]: graph, old: retired }, graph.id), h = host({ lattice: stored });
    assert.equal(S.settings(), stored); assert.equal(S.activeWorkflow().id, graph.id);
    const recovered = S.recoveredWorkflows(); assert.equal(recovered.length, 2);
    assert.deepEqual(recovered.find(entry => entry.id === 'old').original, retired);
    assert.ok(recovered.find(entry => entry.id === 'old').issue); assert.equal(h.effects(), 0);
});

test('creating and importing documents remains detached until central activation', () => {
    host(); const current = S.activeWorkflow(), value = S.settings(), before = structuredClone(value);
    const created = S.createGraph('New workflow');
    assert.equal(created.schema, 3); assert.equal(created.runtime, 2); assert.equal(S.activeWorkflow(), current);
    assert.deepEqual(value, before);
    assert.equal(S.importGraph(JSON.stringify({ kind: 'prompt-canvas-graph', schema: 1, graph: { nodes: {}, wires: {} } })).ok, false);
    assert.deepEqual(value, before);
    S.activateWorkflow(created); assert.equal(S.activeWorkflow(), created); assert.equal(value.enabled, false);
});

test('saved graph accessors are preserved for recovery without executing them', () => {
    let reads = 0;
    const graph = { schema: 3, runtime: 2, mode: 'native-pre', nodes: {}, wires: {} };
    Object.defineProperty(graph, 'id', { enumerable: true, get() { reads++; return 'unsafe'; } });
    const stored = legacy({ unsafe: graph }, 'unsafe'), h = host({ lattice: stored });
    assert.doesNotThrow(() => S.settings());
    const recovered = S.recoveredWorkflows()[0]; assert.equal(recovered.original, graph); assert.ok(recovered.issue);
    assert.equal(reads, 0); assert.equal(h.context.extensionSettings.lattice, stored); assert.equal(h.effects(), 0);
});

test('several individually bounded legacy workflows reload as independent recovery choices', async () => {
    const graph = S.createGraph('Large current workflow');
    for (let i = 0; i < 8; i++) graph.nodes['compose-' + i] = { id: 'compose-' + i, type: 'workflow', operation: 'compose', operationVersion: 1, outputKind: 'text', sections: [{ name: 'Text', text: 'x'.repeat(95000) }] };
    const copies = [graph, { ...structuredClone(graph), id: 'copy-two' }, { ...structuredClone(graph), id: 'copy-three' }];
    const stored = legacy(Object.fromEntries(copies.map(copy => [copy.id, copy])), graph.id), h = host({ lattice: stored });
    const reloaded = await import('../src/state.js?reload=valid-many-documents');
    assert.equal(reloaded.settings(), stored);
    for (const copy of copies) assert.equal(reloaded.recoveredWorkflows().find(entry => entry.id === copy.id).graph.nodes['compose-7'].sections[0].text.length, 95000);
    assert.equal(h.effects(), 0);
});

test('unreadable preference metadata is rejected without replacing it or executing accessors', () => {
    let reads = 0;
    const ui = Object.defineProperty({}, 'theme', { enumerable: true, get() { reads++; return 'unsafe'; } });
    const stored = legacy({}, null, { ui }), h = host({ lattice: stored });
    assert.throws(() => S.settings(), /preferences|plain|settings/i);
    assert.equal(reads, 0); assert.equal(h.context.extensionSettings.lattice, stored); assert.equal(h.effects(), 0);
});
