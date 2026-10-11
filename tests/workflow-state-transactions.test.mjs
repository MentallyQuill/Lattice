import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installMock } from './mock.js';
import { starterGraph } from '../src/workflow/starters.js';
import { prepareWorkflowInsertion } from '../src/workflow/insertion.js';
import { captureGraphEditContext } from '../src/workflow/transactions.js?v=0.26.0';
import * as H from '../src/history.js?v=0.26.0';
import * as S from '../src/state.js?v=0.26.0';
import { cloneWorkflowDocument } from '../src/workflow/document.js';
import { prepareCreateFromSelection, prepareGraphCandidate } from '../src/workflow/composition.js';
import { prepareLocalDefinitionEdit } from '../src/workflow/definition-library.js';
import { definitionRefKey } from '../src/workflow/definitions.js';

let serial = 0;

test('named endpoint rewires record immediately as a structural history step', async () => {
    const root = starterGraph('structured-guidance'); root.id = `named-history-${++serial}`;
    H.track(root);
    root.wires['wire-3'].toPort = 'other-data';
    H.noteChange(root);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.notEqual(H.peek(root).undo, 'your last edit', 'named endpoints are structural, not a typing draft');
    assert.equal(H.undo(root), 'change a wire');
    assert.equal(root.wires['wire-3'].toPort, 'data');
});

function fixture() {
    const host = installMock({ settings: { enabled: false, nativeBindings: { preGraphId: null, postGraphId: null }, graphs: {} } });
    let saves = 0; host.saveSettingsDebounced = () => saves++;
    const root = starterGraph('native-guidance'); root.id = `state-transaction-${++serial}`;
    root.recording = { id: 'diagnostic' }; root.authority = { apply: 'current-only' };
    const context = { sessionId: 'state', viewPath: [], readOnly: false };
    const token = captureGraphEditContext(root, () => context).data;
    const prepared = { ...prepareWorkflowInsertion(root, starterGraph('native-guidance')).data, context: token };
    H.track(root);
    const calls = [];
    const hooks = { onSemanticChange: graph => calls.push(['cancel', graph.id]), reconcileViews: graph => calls.push(['reconcile', Object.keys(graph.nodes).length]) };
    return { root, host, context, prepared, hooks, calls, saves: () => saves };
}

test('state accepted document commit and semantic undo/redo persist, cancel and reconcile once each', () => {
    const { root, host, prepared, hooks, calls, saves } = fixture();
    const touched = [];
    const unsubscribe = S.onGraphTouched((graph, options) => { if (graph !== root) return; touched.push(options); if (options?.history !== false) H.noteChange(graph); });
    try {
        assert.equal(S.commitGraphEdit(root, prepared, hooks).ok, true);
        assert.deepEqual(calls, [['cancel', root.id], ['reconcile', 8]]);
        assert.deepEqual(touched, [{ history: false, semanticChanged: true }]);
        assert.equal(saves(), 1); assert.equal(root.authority.apply, 'current-only');
        assert.equal(S.stepGraphHistory(root, 'undo', hooks).data.semanticChanged, true);
        assert.equal(S.stepGraphHistory(root, 'redo', hooks).data.semanticChanged, true);
        assert.equal(saves(), 3); assert.equal(calls.length, 6);
        assert.equal(S.stepGraphHistory(root, 'redo', hooks).data.changed, false);
        assert.equal(saves(), 3); assert.equal(calls.length, 6);
        assert.deepEqual(root.recording, { id: 'diagnostic' });
        assert.equal(Object.hasOwn(S.settings(), 'nativeBindings'), false);
        assert.equal(host.extensionSettings.lattice.enabled, false);
        assert.equal(Object.hasOwn(host.extensionSettings.lattice, 'workflowMode'), false);
    } finally { unsubscribe(); }
});

test('native presentation undo preserves authority and recording and performs only reconciliation', () => {
    const { root, hooks, calls, saves } = fixture();
    const view = root.view, authority = root.authority, recording = root.recording;
    root.nodes['response-plan'].presentation = { alias: 'Plan alias', compact: true };
    H.noteChange(root); H.flush(root);
    assert.equal(S.stepGraphHistory(root, 'undo', hooks).data.semanticChanged, false);
    assert.deepEqual(calls, [['reconcile', 4]]);
    assert.equal(S.stepGraphHistory(root, 'redo', hooks).data.semanticChanged, false);
    assert.equal(calls.length, 2); assert.equal(saves(), 2);
    assert.equal(root.view, view); assert.equal(root.authority, authority); assert.equal(root.recording, recording);
});

test('rejected and no-op state commits cannot save, cancel, reconcile, or mutate history', () => {
    const { root, prepared, context, hooks, calls, saves } = fixture();
    const before = structuredClone(root), history = H.peek(root);
    context.readOnly = true;
    assert.equal(S.commitGraphEdit(root, prepared, hooks).error.code, 'READ_ONLY_VIEW');
    assert.deepEqual(root, before); assert.deepEqual(H.peek(root), history);
    context.readOnly = false;
    const noOp = { ...prepared, candidate: structuredClone(root) };
    assert.equal(S.commitGraphEdit(root, noOp, hooks).data.changed, false);
    assert.deepEqual(calls, []); assert.equal(saves(), 0); assert.deepEqual(H.peek(root), history);
});

test('immutable bookkeeping cannot throw after the complete editable document was accepted', () => {
    const { root, prepared, hooks, calls, saves } = fixture();
    Object.defineProperty(root, 'updatedAt', { value: 123, enumerable: true, configurable: false, writable: false });
    assert.equal(S.commitGraphEdit(root, prepared, hooks).ok, true);
    assert.equal(root.updatedAt, 123); assert.equal(saves(), 1); assert.equal(calls.length, 2);
});

test('ownership-only root documents round-trip field presence without invalidating runtime authority', () => {
    const host = installMock({ settings: { graphs: {} } }); let saves = 0, cancelled = 0; host.saveSettingsDebounced = () => saves++;
    const converted = prepareCreateFromSelection(cloneWorkflowDocument(starterGraph('native-guidance')).data, { nodeIds: ['smart-compactor'], definitionId: 'history-owned', name: 'History owned' }).data;
    const root = converted.candidate; root.id = `ownership-${++serial}`;
    delete root.localDefinitionOwners; delete root.nodes[converted.instanceId].localCopy;
    const authority = root.authority = { activeRun: 'current' }, recording = root.recording = { id: 'current-recording' };
    H.track(root);
    const next = structuredClone(root); next.localDefinitionOwners = [{ instancePath: [converted.instanceId], definitionId: 'history-owned' }];
    const context = () => ({ sessionId: 'ownership', viewPath: [], readOnly: false });
    const prepared = { ...prepareGraphCandidate(root, next).data, context: captureGraphEditContext(root, context).data };
    const hooks = { onSemanticChange: () => cancelled++ };
    const committed = S.commitGraphEdit(root, prepared, hooks);
    assert.equal(committed.ok, true, JSON.stringify(committed)); assert.equal(committed.data.semanticChanged, false);
    assert.deepEqual(root.localDefinitionOwners, next.localDefinitionOwners); assert.equal(saves, 1); assert.equal(cancelled, 0);
    assert.equal(S.stepGraphHistory(root, 'undo', hooks).data.semanticChanged, false); assert.equal(Object.hasOwn(root, 'localDefinitionOwners'), false);
    assert.equal(S.stepGraphHistory(root, 'redo', hooks).data.semanticChanged, false); assert.deepEqual(root.localDefinitionOwners, next.localDefinitionOwners);
    assert.equal(S.stepGraphHistory(root, 'redo', hooks).data.changed, false); assert.equal(saves, 3); assert.equal(cancelled, 0);
    assert.equal(root.authority, authority); assert.equal(root.recording, recording);
    const ref = root.nodes[converted.instanceId].definition, draft = structuredClone(root.definitions[definitionRefKey(ref)]); draft.body.nodes['smart-compactor'].targetTokens = 432;
    const revision = { ...prepareLocalDefinitionEdit(root, { instanceId: converted.instanceId, expectedRef: ref, draft }).data, context: captureGraphEditContext(root, context).data };
    assert.equal(S.commitGraphEdit(root, revision, hooks).data.semanticChanged, true); assert.equal(cancelled, 1); assert.equal(saves, 4);
    assert.equal(S.stepGraphHistory(root, 'undo', hooks).data.semanticChanged, true); assert.equal(cancelled, 2);
    assert.deepEqual(root.nodes[converted.instanceId].definition, ref); assert.deepEqual(root.localDefinitionOwners, next.localDefinitionOwners);
    assert.equal(root.authority, authority); assert.equal(root.recording, recording);
});
