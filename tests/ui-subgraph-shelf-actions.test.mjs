import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installMock } from './mock.js';
import { siblingWorkflow } from './fixtures/workflow-prepared-fixture.mjs';
import { effectiveInstanceWorkflow } from './fixtures/workflow-effective-instance.mjs';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js';
import { materializeInstanceDefinition } from '../src/workflow/definition-library.js';
import * as library from '../src/library.js?v=0.27.2';

const source = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
function actual(name, env) {
    const start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'Actual controller function ' + name);
    const end = source.indexOf('\n}', start) + 2;
    return Function('env', 'with(env){' + source.slice(start, end) + ';return ' + name + ';}')(env);
}
function fixture(libraryView = false) {
    const graph = effectiveInstanceWorkflow(libraryView);
    const containing = graph.definitions[definitionRefKey(graph.nodes.one.definition)];
    const savedGraph = libraryView ? containing.body : graph;
    if (!libraryView) { graph.nodes.wrapper = { ...graph.nodes.one, id: 'wrapper' }; delete graph.nodes.one; }
    const nodeId = libraryView ? 'left' : 'wrapper';
    const definition = graph.definitions[definitionRefKey(savedGraph.nodes[nodeId].definition)];
    const entry = { ...definition, id: 'shelf-one', name: 'Saved cleanup' }, token = {}, writes = [], updates = [];
    let live = true, entries = [entry], refreshes = 0;
    const env = { pendingSubgraphSave: null, libraryRevision: 0, current: graph, materializeInstanceDefinition, crypto: { randomUUID: () => 'unique' },
        workspacePrepared: { libraryDefinitions: graph.definitions },
        graphViews: { readEditor: () => ({ prepared: { savedGraph, ...(libraryView ? { definitionRef: { id: containing.id, version: containing.version, semanticHash: containing.semanticHash } } : {}) }, view: { identity: { kind: libraryView ? 'library' : 'root', instancePath: [] } } }) },
        captureEditor: () => ({ ok: true, data: token }), editorCurrent: capture => live && capture === token,
        definitionRefKey: item => JSON.stringify([item.id, item.version, item.semanticHash]),
        L: { loadSubgraphLibrary: () => ({ ok: true }), getSubgraphShelfEntries: () => ({ ok: true, data: entries }), saveSubgraphDefinition: (...args) => { writes.push(args); return { ok: true, data: {} }; } },
        workbench: { update: value => updates.push(value) }, toast() {}, refreshWorkspaceDocument: () => { refreshes++; },
    };
    for (const name of ['openSubgraphSave', 'saveSubgraphToShelf']) env[name] = actual(name, env);
    return { env, graph, nodeId, definition, writes, updates, stale: () => { live = false; }, replaceEntries: value => { entries = value; }, refreshes: () => refreshes };
}
test('explicit save snapshots authored data, offers an explicit shelf target, and never commits the graph', () => {
    const f = fixture(), before = structuredClone(f.graph); f.env.openSubgraphSave('wrapper');
    const view = f.updates.at(-1).subgraphSave;
    assert.equal(view.name, 'Effective leaf'); assert.equal(view.targetId, null);
    assert.deepEqual(view.entries, [{ id: 'shelf-one', name: 'Saved cleanup' }]);
    assert.equal(JSON.stringify(view).includes('instructions'), false);
    assert.equal(f.env.saveSubgraphToShelf(view.key, 'Updated cleanup', 'shelf-one').ok, true);
    const [draft, snapshots, targetId] = f.writes[0];
    assert.equal(targetId, 'shelf-one'); assert.equal(draft.id, 'shelf-one'); assert.equal(draft.name, 'Updated cleanup');
    assert.equal(draft.body.nodes.compact.targetTokens, 720);
    assert.equal(draft.body.nodes.inherited.model, undefined, 'parent model remains inherited');
    assert.equal(draft.parameterOverrides, undefined); assert.equal(draft.semanticHash, undefined);
    assert.deepEqual(snapshots, {}, 'a flat saved body requires no dependency snapshots');
    assert.equal(f.definition.body.nodes.compact.targetTokens, 960);
    assert.deepEqual(f.graph, before, 'saving preserves the selected graph and sibling contents');
    assert.equal(f.refreshes(), 1);
    assert.equal(f.updates.at(-1).subgraphSave, null);
});
test('a wrapper inspected in a library tab saves that displayed definition instead of the current root', () => {
    const f = fixture(true), before = structuredClone(f.graph);
    assert.equal(f.env.openSubgraphSave(f.nodeId).ok, true);
    const view = f.updates.at(-1).subgraphSave;
    assert.equal(f.env.saveSubgraphToShelf(view.key, 'Library copy', null).ok, true);
    assert.equal(f.writes[0][0].body.nodes.compact.targetTokens, 500);
    assert.deepEqual(f.graph, before);
});
test('new saves create independent shelf identities and reject stale graph or shelf captures', () => {
    const f = fixture(); f.env.openSubgraphSave('wrapper'); const key = f.updates.at(-1).subgraphSave.key;
    assert.equal(f.env.saveSubgraphToShelf(key, 'New cleanup', null).ok, true);
    assert.equal(f.writes[0][0].id, 'shelf-unique'); assert.equal(f.writes[0][2], null);
    const stale = fixture(); stale.env.openSubgraphSave('wrapper'); const oldKey = stale.updates.at(-1).subgraphSave.key; stale.stale();
    assert.equal(stale.env.saveSubgraphToShelf(oldKey, 'Old', null).ok, false); assert.equal(stale.writes.length, 0);
    const removed = fixture(); removed.env.openSubgraphSave('wrapper'); const removedKey = removed.updates.at(-1).subgraphSave.key; removed.replaceEntries([]);
    assert.equal(removed.env.saveSubgraphToShelf(removedKey, 'Old', 'shelf-one').ok, false); assert.equal(removed.writes.length, 0);
});
test('an externally advanced shelf target rejects the captured update', () => {
    const f = fixture(); f.env.openSubgraphSave('wrapper'); const key = f.updates.at(-1).subgraphSave.key;
    f.replaceEntries([{ ...f.definition, id: 'shelf-one', version: 3, semanticHash: 'new-hash' }]);
    assert.equal(f.env.saveSubgraphToShelf(key, 'Old target', 'shelf-one').ok, false);
    assert.equal(f.writes.length, 0); assert.equal(f.refreshes(), 0);
});

function persistedFixture() {
    const host = installMock(), source = Object.values(siblingWorkflow().definitions)[0];
    let saves = 0, refreshes = 0;
    host.saveSettingsDebounced = () => saves++;
    const installed = library.saveSubgraphDefinition(source); assert.equal(installed.ok, true);
    const head = library.getSubgraphShelfEntries().data[0], token = {}, updates = [];
    const current = { id: 'shelf-save-root', schema: 3, runtime: 2, mode: 'native-pre', nodes: { wrapper: { id: 'wrapper', type: 'subgraph', definition: installed.data.ref } }, wires: {}, definitions: { [definitionRefKey(head)]: head } };
    const env = { pendingSubgraphSave: null, libraryRevision: 0, current, materializeInstanceDefinition, crypto: { randomUUID: () => 'saved-dialog' },
        captureEditor: () => ({ ok: true, data: token }), editorCurrent: capture => capture === token,
        definitionRefKey, L: library, nativeCatalog: { choices: [{ id: 'old-choice', definitionRef: installed.data.ref }] },
        workspacePrepared: { libraryDefinitions: { [definitionRefKey(head)]: head } },
        graphViews: { readEditor: () => ({ prepared: { savedGraph: current }, view: { identity: { kind: 'root', instancePath: [] } } }) },
        workbench: { update: value => updates.push(value) }, toast() {}, refreshWorkspaceDocument: () => { refreshes++; },
    };
    for (const name of ['openSubgraphSave', 'saveSubgraphToShelf', 'shelfSubgraphAction']) env[name] = actual(name, env);
    const draft = structuredClone(head); draft.version++; draft.name = 'External update'; draft.body.nodes.work.instructions = 'New content from replaced settings'; delete draft.semanticHash;
    const identity = computeDefinitionIdentity(draft); assert.equal(identity.ok, true);
    const advanced = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    const replaceHead = () => {
        host.extensionSettings.lattice.subgraphLibrary = { definitions: { [definitionRefKey(head)]: head, [definitionRefKey(advanced)]: advanced }, entries: { [advanced.id]: { id: advanced.id, version: advanced.version, semanticHash: advanced.semanticHash } } };
        assert.equal(library.getSubgraphShelfEntries().data[0].version, head.version, 'external replacement leaves the cheap projection cache unchanged');
        return structuredClone(host.extensionSettings.lattice.subgraphLibrary);
    };
    return { env, host, head, advanced, updates, replaceHead, saves: () => saves, refreshes: () => refreshes };
}

test('actual save refreshes externally replaced settings before checking the captured shelf pin', () => {
    const f = persistedFixture(); assert.equal(f.env.openSubgraphSave('wrapper').ok, true);
    const key = f.updates.at(-1).subgraphSave.key, replaced = f.replaceHead();
    const result = f.env.saveSubgraphToShelf(key, 'Overwrite external update', f.head.id);
    assert.equal(result.ok, false); assert.equal(result.error.code, 'STALE_CONTEXT');
    assert.deepEqual(f.host.extensionSettings.lattice.subgraphLibrary, replaced);
    assert.equal(library.getSubgraphShelfEntries().data[0].version, f.advanced.version);
    assert.equal(f.saves(), 1); assert.equal(f.refreshes(), 0);
});

test('actual shelf deletion refreshes externally replaced settings and rejects an old displayed pin', () => {
    const f = persistedFixture(), replaced = f.replaceHead();
    f.env.shelfSubgraphAction('old-choice', 'delete');
    assert.deepEqual(f.host.extensionSettings.lattice.subgraphLibrary, replaced);
    assert.equal(library.getSubgraphShelfEntries().data[0].version, f.advanced.version);
    assert.equal(f.saves(), 1); assert.equal(f.refreshes(), 0);
});
