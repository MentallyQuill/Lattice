import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installMock } from './mock.js';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js';
import { createRevision, installDefinition } from '../src/workflow/definition-library.js';
import * as packages from '../src/workflow/packages.js';
import * as library from '../src/library.js?v=0.27.2';

const finalize = draft => {
    const identity = computeDefinitionIdentity(draft);
    assert.equal(identity.ok, true, JSON.stringify(identity));
    return { ...structuredClone(identity.data.materializedDefinition), semanticHash: identity.data.semanticHash };
};
const ref = definition => ({ id: definition.id, version: definition.version, semanticHash: definition.semanticHash });
const leaf = (id = 'leaf', content = '') => finalize({ id, version: 1, name: id, interface: [], parameters: [], body: {
    schema: 3, runtime: 2, mode: 'native-post', nodes: { note: { id: 'note', type: 'note', content } }, wires: {},
} });
const parent = child => finalize({ id: 'parent', version: 1, name: 'Parent', interface: [], parameters: [], body: {
    schema: 3, runtime: 2, mode: 'native-post', nodes: { nested: { id: 'nested', type: 'subgraph', definition: ref(child) } }, wires: {},
} });

test('a shelf revision installs its exact new nested snapshots atomically and preserves old pins', () => {
    const oldChild = leaf(), oldParent = parent(oldChild);
    const initial = installDefinition({ definitions: {} }, oldParent, { [definitionRefKey(oldChild)]: oldChild });
    assert.equal(initial.ok, true, JSON.stringify(initial));
    const before = structuredClone(initial.data.library), privateChild = leaf('private-child');
    const draft = structuredClone(oldParent);
    draft.body.nodes.nested.definition = ref(privateChild);
    const result = createRevision(initial.data.library, draft, { [definitionRefKey(privateChild)]: privateChild });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.ref.version, 2);
    assert.deepEqual(result.data.library.definitions[definitionRefKey(result.data.ref)].body.nodes.nested.definition, ref(privateChild));
    assert.deepEqual(result.data.library.definitions[definitionRefKey(oldParent)], oldParent);
    assert.deepEqual(initial.data.library, before);
    assert.equal(Object.isFrozen(result.data.library), true);
    const malformed = structuredClone(privateChild); malformed.body.nodes.note.enabled = 'invalid';
    assert.equal(createRevision(initial.data.library, draft, { [definitionRefKey(privateChild)]: malformed }).ok, false);
    assert.deepEqual(initial.data.library, before);
});

test('nested shelf persistence writes once on acceptance and nothing on failure', () => {
    const oldChild = leaf(), oldParent = parent(oldChild);
    const initial = installDefinition({ definitions: {} }, oldParent, { [definitionRefKey(oldChild)]: oldChild }).data.library;
    const host = installMock({ settings: { subgraphLibrary: structuredClone(initial) } });
    let saves = 0; host.saveSettingsDebounced = () => saves++;
    assert.equal(library.loadSubgraphLibrary().ok, true);
    const privateChild = leaf('private-child'), draft = structuredClone(oldParent);
    draft.body.nodes.nested.definition = ref(privateChild);
    const storedBefore = structuredClone(host.extensionSettings.lattice.subgraphLibrary);
    assert.equal(library.reviseSubgraphDefinition(draft).ok, false);
    assert.equal(saves, 0);
    assert.deepEqual(host.extensionSettings.lattice.subgraphLibrary, storedBefore);
    const result = library.reviseSubgraphDefinition(draft, { [definitionRefKey(privateChild)]: privateChild });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(saves, 1);
    assert.deepEqual(library.getSubgraphLibrary().data.definitions[definitionRefKey(oldParent)], oldParent);
    assert.equal(host.extensionSettings.lattice.subgraphLibrary.definitions[definitionRefKey(result.data.ref)].body.nodes.nested.definition.id, privateChild.id);
});

test('revision numbering includes an exact nested historical pin sharing the top identity', () => {
    const original = leaf('parent'), nestedDraft = structuredClone(original);
    nestedDraft.version = 5;
    const nested = finalize(nestedDraft), draft = structuredClone(parent(nested));
    const initial = installDefinition({ definitions: {} }, original).data.library;
    const result = createRevision(initial, draft, { [definitionRefKey(nested)]: nested });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.ref.version, 6);
    assert.deepEqual(result.data.library.definitions[definitionRefKey(result.data.ref)].body.nodes.nested.definition, ref(nested));
    assert.equal(initial.definitions[definitionRefKey(original)].version, 1);
});

test('the export selector returns only the exact reachable pins and portable JSON round trips', () => {
    assert.equal(typeof packages.selectSubgraphClosure, 'function');
    const child = leaf(), top = parent(child), unrelated = leaf('unrelated');
    const snapshots = { [definitionRefKey(top)]: top, [definitionRefKey(child)]: child, [definitionRefKey(unrelated)]: unrelated };
    const before = structuredClone(snapshots), result = packages.selectSubgraphClosure(top, snapshots);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(Object.keys(result.data.definitions), [definitionRefKey(child)]);
    assert.equal(Object.isFrozen(result.data.definitions), true);
    assert.equal(result.data.definition === top, false);
    assert.deepEqual(snapshots, before);
    const parsed = packages.parseSubgraph(JSON.stringify(packages.exportSubgraph(result.data.definition, result.data.definitions)));
    assert.equal(parsed.ok, true, JSON.stringify(parsed));
    assert.deepEqual(Object.keys(parsed.data.definitions), [definitionRefKey(child)]);
    assert.deepEqual(parsed.data.definition.body.nodes.nested.definition, ref(child));
});

test('unrelated shelf content cannot inflate a selected standalone package beyond its byte limit', () => {
    assert.equal(typeof packages.selectSubgraphClosure, 'function');
    const top = leaf('selected', 'x'.repeat(700000)), unrelated = leaf('unrelated', 'y'.repeat(900000));
    const snapshots = { [definitionRefKey(top)]: top, [definitionRefKey(unrelated)]: unrelated };
    const direct = packages.exportSubgraph(top, snapshots);
    assert.deepEqual(direct.definitions, {}, 'export omits both the top duplicate and unrelated shelf entries');
    assert.equal(packages.parseSubgraph(JSON.stringify(direct)).ok, true);
    const selected = packages.selectSubgraphClosure(top, snapshots);
    assert.equal(selected.ok, true, JSON.stringify(selected));
    assert.deepEqual(selected.data.definitions, {});
    const encoded = JSON.stringify(packages.exportSubgraph(selected.data.definition, selected.data.definitions));
    assert.equal(packages.parseSubgraph(encoded).ok, true);
    assert.equal(new TextEncoder().encode(encoded).byteLength < 800000, true);
});

test('closure selection rejects unsafe data, missing pins and a conflicting supplied top without mutations', () => {
    assert.equal(typeof packages.selectSubgraphClosure, 'function');
    const child = leaf(), top = parent(child);
    assert.equal(packages.selectSubgraphClosure(top, {}).error.code, 'MISSING_DEFINITION');
    const malformed = structuredClone(top); malformed.body.nodes.nested.definition = null;
    assert.equal(packages.selectSubgraphClosure(malformed, {}).error.code, 'DEFINITION_REF');
    const changed = structuredClone(child); changed.body.roles = { Analysis: { model: 'changed-model' } };
    assert.equal(packages.selectSubgraphClosure(top, { [definitionRefKey(child)]: changed }).error.code, 'DEFINITION_HASH');
    const conflict = structuredClone(top); conflict.body.roles = { Analysis: { model: 'conflicting-model' } };
    assert.equal(packages.selectSubgraphClosure(top, { [definitionRefKey(top)]: conflict, [definitionRefKey(child)]: child }).error.code, 'DEFINITION_CONFLICT');
    let reads = 0;
    const unsafe = {}; Object.defineProperty(unsafe, 'definitions', { enumerable: true, get() { reads++; throw new Error('read'); } });
    assert.equal(packages.selectSubgraphClosure(top, unsafe).ok, false);
    assert.equal(reads, 0);
});
