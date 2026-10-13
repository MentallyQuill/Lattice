import test from 'node:test';
import assert from 'node:assert/strict';
import { installMock } from './mock.js';
import { siblingWorkflow } from './fixtures/workflow-prepared-fixture.mjs';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js';
import * as shelf from '../src/library.js?v=0.27.1';
import * as S from '../src/state.js?v=0.27.1';

const ref = definition => ({ id: definition.id, version: definition.version, semanticHash: definition.semanticHash });
const definition = () => Object.values(siblingWorkflow().definitions)[0];
const finalize = draft => { const identity = computeDefinitionIdentity(draft); assert.equal(identity.ok, true); return { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash }; };

test('explicit shelf saves advance one visible head without editing placed snapshots', () => {
    const graph = siblingWorkflow(), before = structuredClone(graph), host = installMock({ settings: { graphs: { [graph.id]: graph } } });
    let saves = 0; host.saveSettingsDebounced = () => saves++;
    S.settings(); // Capture the host boundary and complete migration before counting shelf persistence.
    saves = 0;
    const draft = structuredClone(definition()); draft.id = 'saved-plan';
    const first = shelf.saveSubgraphDefinition(draft);
    assert.equal(first.ok, true, JSON.stringify(first));
    const changed = structuredClone(draft); changed.id = 'edited-local-definition'; changed.name = 'Saved latest'; changed.body.nodes.work.instructions = 'Keep continuity';
    const second = shelf.saveSubgraphDefinition(changed, {}, 'saved-plan');
    assert.equal(second.ok, true, JSON.stringify(second)); assert.equal(second.data.ref.version, 2);
    const entries = shelf.getSubgraphShelfEntries(); assert.equal(entries.ok, true);
    assert.deepEqual(entries.data.map(item => [item.id, item.version, item.name]), [['saved-plan', 2, 'Saved latest']]);
    assert.equal(entries.data[0].body.nodes.work.instructions, 'Keep continuity');
    assert.equal(Object.keys(shelf.getSubgraphLibrary().data.definitions).length, 2);
    assert.deepEqual(host.extensionSettings.lattice.subgraphLibrary.entries['saved-plan'], second.data.ref);
    assert.deepEqual(graph, before); assert.equal(saves, 2);
    assert.equal(shelf.saveSubgraphDefinition(changed, {}, 'missing').ok, false);
    assert.equal(saves, 2);
});

test('shelf removal keeps immutable dependency snapshots and removes only the visible entry', () => {
    const child = definition(), parent = finalize({ id: 'parent', version: 1, name: 'Parent', interface: [], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: { nested: { id: 'nested', type: 'subgraph', definition: ref(child), parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {} } }, wires: {} } });
    installMock();
    assert.equal(shelf.saveSubgraphDefinition(child).ok, true);
    assert.equal(shelf.saveSubgraphDefinition(parent, { [definitionRefKey(child)]: child }).ok, true);
    const before = structuredClone(shelf.getSubgraphLibrary().data.definitions);
    assert.equal(shelf.removeSubgraphShelfEntry(child.id).ok, true);
    assert.deepEqual(shelf.getSubgraphShelfEntries().data.map(item => item.id), ['parent']);
    assert.deepEqual(shelf.getSubgraphLibrary().data.definitions, before);
    assert.equal(shelf.removeSubgraphShelfEntry(child.id).ok, false);
    assert.equal(shelf.loadSubgraphLibrary().ok, true);
    assert.equal(shelf.installSubgraphDefinition(child).data.changed, true);
    assert.deepEqual(shelf.getSubgraphShelfEntries().data.map(item => item.id), ['parent', child.id]);
});

test('legacy shelf projection picks the latest revision and explicit entries require existing exact pins', () => {
    const old = definition(), latest = finalize({ ...structuredClone(old), version: 3, name: 'Latest' });
    const host = installMock({ settings: { subgraphLibrary: { definitions: { [definitionRefKey(old)]: old, [definitionRefKey(latest)]: latest } } } });
    assert.equal(shelf.loadSubgraphLibrary().ok, true);
    assert.deepEqual(shelf.getSubgraphShelfEntries().data.map(item => item.version), [3]);
    host.extensionSettings.lattice.subgraphLibrary.entries = { [old.id]: ref(old) };
    assert.equal(shelf.loadSubgraphLibrary().ok, true); assert.equal(shelf.getSubgraphShelfEntries().data[0].version, 1);
    host.extensionSettings.lattice.subgraphLibrary.entries[old.id].version = 99;
    assert.equal(shelf.loadSubgraphLibrary().ok, false);
    host.extensionSettings.lattice.subgraphLibrary.entries = { wrongId: ref(old) };
    assert.equal(shelf.loadSubgraphLibrary().ok, false);
    let reads = 0; Object.defineProperty(host.extensionSettings.lattice.subgraphLibrary, 'entries', { enumerable: true, configurable: true, get() { reads++; return {}; } });
    assert.equal(shelf.loadSubgraphLibrary().ok, false); assert.equal(reads, 0);
});

test('legacy heads support IDs that coincide with object prototype names', () => {
    const saved = finalize({ ...structuredClone(definition()), id: 'toString' });
    installMock({ settings: { subgraphLibrary: { definitions: { [definitionRefKey(saved)]: saved } } } });
    assert.equal(shelf.loadSubgraphLibrary().ok, true);
    assert.deepEqual(shelf.getSubgraphShelfEntries().data.map(item => item.id), ['toString']);
});

test('saving includes only nested dependencies and omits the old top and unrelated graph snapshots', () => {
    const graph = siblingWorkflow(), source = definition(), unrelated = finalize({ ...structuredClone(source), id: 'unrelated' });
    installMock();
    const draft = structuredClone(source); draft.id = 'fresh-shelf'; delete draft.semanticHash;
    const saved = shelf.saveSubgraphDefinition(draft, { ...graph.definitions, [definitionRefKey(unrelated)]: unrelated });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    const definitions = shelf.getSubgraphLibrary().data.definitions;
    assert.deepEqual(Object.keys(definitions), [definitionRefKey(saved.data.ref)]);
    assert.equal(definitions[definitionRefKey(saved.data.ref)].body.nodes.work.operation, source.body.nodes.work.operation);
});

test('saving a small subgraph near the shelf limit does not count its unsaved source twice', () => {
    installMock();
    const existing = finalize({ id: 'large-existing', version: 1, name: 'Existing', interface: [], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: Object.fromEntries(Array.from({ length: 997 }, (_, index) => ['note-' + index, { id: 'note-' + index, type: 'note', content: 'Note' }])), wires: {} } });
    assert.equal(shelf.saveSubgraphDefinition(existing).ok, true);
    const source = definition(), draft = structuredClone(source); draft.id = 'small-new'; delete draft.semanticHash;
    const saved = shelf.saveSubgraphDefinition(draft, { [definitionRefKey(source)]: source });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.deepEqual(Object.keys(shelf.getSubgraphLibrary().data.definitions), [definitionRefKey(existing), definitionRefKey(saved.data.ref)]);
    assert.equal(shelf.loadSubgraphLibrary().ok, true);
});

test('saving a parent can reuse an already installed child without supplying its snapshots again', () => {
    installMock();
    const child = definition(), installed = shelf.saveSubgraphDefinition(child); assert.equal(installed.ok, true);
    const parent = finalize({ id: 'new-parent', version: 1, name: 'Parent', interface: [], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: { child: { id: 'child', type: 'subgraph', definition: installed.data.ref, parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {} } }, wires: {} } });
    const saved = shelf.saveSubgraphDefinition(parent);
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.deepEqual(shelf.getSubgraphShelfEntries().data.map(item => item.id), [child.id, parent.id]);
    const snapshots = shelf.getSubgraphLibrary().data.definitions;
    assert.deepEqual(Object.keys(snapshots), [definitionRefKey(installed.data.ref), definitionRefKey(saved.data.ref)]);
    assert.deepEqual(snapshots[definitionRefKey(saved.data.ref)].body.nodes.child.definition, installed.data.ref);
    assert.equal(shelf.loadSubgraphLibrary().ok, true);
});
