import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js';
import { makeLocalCopy, prepareLocalDefinitionEdit } from '../src/workflow/definition-library.js';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js';
import * as H from '../src/history.js?v=0.27.3';
const ref = d => ({ id: d.id, version: d.version, semanticHash: d.semanticHash });
let id = 0;
function fixture() {
    const draft = { id: 'shared', version: 1, name: 'Shared', interface: [], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: { item: { id: 'item', type: 'workflow', operation: 'smart-compactor' } }, wires: {} } };
    const identity = computeDefinitionIdentity(draft); assert.equal(identity.ok, true);
    const definition = { ...structuredClone(identity.data.materializedDefinition), semanticHash: identity.data.semanticHash };
    const shared = { id: `qualified-${++id}`, schema: 3, runtime: 2, mode: 'native-pre', nodes: { child: { id: 'child', type: 'subgraph', definition: ref(definition) } }, wires: {}, definitions: { [definitionRefKey(definition)]: definition } };
    const copied = makeLocalCopy(shared, { instancePath: ['child'], id: 'private' }); assert.equal(copied.ok, true);
    const root = copied.data.candidate;
    const current = { sessionId: 'activation:1', viewPath: ['child'], readOnly: false };
    const actual = () => root.definitions[definitionRefKey(root.nodes.child.definition)];
    const prepare = context => { const draft = structuredClone(actual()); draft.body.nodes.item.targetTokens = 432; const result = prepareLocalDefinitionEdit(root, { instancePath: ['child'], expectedRef: ref(actual()), draft }); assert.equal(result.ok, true); return { ...result.data, context, viewPath: ['child'] }; };
    return { shared, root, current, actual, prepare };
}
test('owned child candidate commits its complete root as one reversible history step', () => {
    const { root, current, actual, prepare } = fixture();
    H.track(root); const before = structuredClone(root);
    const capture = captureGraphEditContext(root, () => current); assert.equal(capture.ok, true, JSON.stringify(capture));
    const prepared = prepare(capture.data);
    assert.equal(commitPreparedGraph(root, prepared).ok, true);
    assert.equal(actual().body.nodes.item.targetTokens, 432);
    assert.ok(H.undo(root)); assert.deepEqual(root, before); assert.equal(H.undo(root), null);
    assert.ok(H.redo(root)); assert.equal(actual().body.nodes.item.targetTokens, 432); assert.equal(H.redo(root), null);
});
test('child context requires current ownership, explicit prepared path, and full-root signatures', () => {
    const item = fixture();
    assert.equal(captureGraphEditContext(item.shared, () => item.current).error?.code, 'READ_ONLY_DEFINITION');
    for (const [mutate, code] of [
        [({ prepared }) => { delete prepared.viewPath; }, 'STALE_CONTEXT'],
        [({ prepared }) => { prepared.viewPath = []; }, 'STALE_CONTEXT'],
        [({ current }) => { current.sessionId = 'activation:3'; }, 'STALE_CONTEXT'],
        [({ current }) => { current.readOnly = true; }, 'READ_ONLY_VIEW'],
        [({ root }) => { root.nodes.child.title = 'other document edit'; }, 'STALE_DOCUMENT'],
        [({ root }) => { root.localDefinitionOwners = []; delete root.nodes.child.localCopy; }, 'READ_ONLY_DEFINITION'],
    ]) {
        const value = fixture(); H.track(value.root);
        const capture = captureGraphEditContext(value.root, () => value.current); assert.equal(capture.ok, true);
        value.prepared = value.prepare(capture.data); mutate(value);
        const before = structuredClone(value.root), history = H.peek(value.root);
        assert.equal(commitPreparedGraph(value.root, value.prepared).error?.code, code);
        assert.deepEqual(value.root, before); assert.deepEqual(H.peek(value.root), history);
    }
});
