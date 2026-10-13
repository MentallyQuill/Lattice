import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { siblingWorkflow, nestedWorkflow } from './fixtures/workflow-prepared-fixture.mjs';
import { prepareWorkspaceViews } from '../src/ui/workspace-preparation.js?v=0.27.2';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.2';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js?v=0.27.2';
import { prepareNativeNodeEdit } from '../src/workflow/definition-library.js?v=0.27.2';
import { nodeBindingOverrideKey } from '../src/workflow/definition-data.js?v=0.27.2';
import * as history from '../src/history.js?v=0.27.2';
import { installMock } from './mock.js';
installMock();
const { stepGraphHistory } = await import('../src/state.js?v=0.27.2');

const source = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
function actual(name, env) {
    const start = source.indexOf('function ' + name + '('), end = source.indexOf('\n}', start) + 2;
    assert.ok(start >= 0, 'Actual controller function ' + name);
    return Function('env', 'with(env){' + source.slice(start, end) + ';return ' + name + ';}')(env);
}
function fixture(root, path) {
    const prepared = prepareWorkspaceViews(root); assert.equal(prepared.ok, true);
    const session = createGraphViewSession({ root, activationId: 'node-connections', ...prepared.data }).data;
    assert.equal(session.openInstance(path).ok, true);
    assert.equal(session.readEditor().readOnly, true);
    history.track(root);
    const env = { current: root, graphViews: session, workspaceRevision: 0, editorCaptures: new WeakMap(),
        isOpen: () => true, activeEditRoot: () => root, readGraphEditContext: () => session.readEditContext(),
        captureGraphEditContext, prepareNode: prepareNativeNodeEdit, graphDocumentHooks: {}, toast() {}, H: history, stepGraphHistory,
        workbench: { update(view) { env.historyView = view.history; } }, historyNote: '', historyNoteVisible: false, afterHistory() {},
        commitGraphEdit(graph, edit) {
            const result = commitPreparedGraph(graph, edit);
            if (result.ok && result.data.changed) {
                const next = prepareWorkspaceViews(graph); assert.equal(next.ok, true);
                assert.equal(session.replacePreparedViews(next.data).ok, true); env.workspaceRevision++;
            }
            return result;
        }, editSubgraphInterface() {},
    };
    for (const name of ['captureEditor', 'editorCurrent', 'scopeCommand', 'commitCaptured', 'detailCapture']) env[name] = actual(name, env);
    if (source.includes('function editInstanceBinding(')) env.editInstanceBinding = actual('editInstanceBinding', env);
    if (source.includes('function historyEditContext(')) env.historyEditContext = actual('historyEditContext', env);
    env.paintHistory = actual('paintHistory', env); env.restoreGraphHistory = actual('restoreGraphHistory', env);
    const start = source.indexOf('const nodeDetailsActions = {'), end = source.indexOf('\nconst outputPreviewActions', start);
    const actions = Function('env', 'with(env){' + source.slice(start, end) + ';return nodeDetailsActions;}')(env);
    return { env, actions, session, get selection() { return { selectionKey: JSON.stringify([session.readEditor().view.key, 'work']), revision: session.readEditContext().sessionId + ':' + env.workspaceRevision, address: { workflowId: root.id, instancePath: path, nodeId: 'work' } }; } };
}

test('a shared subgraph node gets an instance connection without editing its definition or sibling', () => {
    const root = siblingWorkflow(), before = structuredClone(root), f = fixture(root, ['first/path']);
    const result = f.actions.editBinding(f.selection, 'profileId', 'override', 'cheap');
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(root.definitions, before.definitions);
    assert.deepEqual(root.nodes.second, before.nodes.second);
    assert.equal(root.nodes['first/path'].nodeBindingOverrides[nodeBindingOverrideKey([], 'work')].profileId, 'cheap');
    assert.deepEqual(f.session.readEditor().view.identity.instancePath, ['first/path']);
    assert.ok(history.undo(root)); assert.deepEqual(root, before);
});

test('deep node binding edits target the exact primitive and can restore its profile model', () => {
    const root = nestedWorkflow(), f = fixture(root, ['first/path', 'work']);
    let result = f.actions.editBinding(f.selection, 'profileId', 'override', 'reasoning');
    assert.equal(result.ok, true, JSON.stringify(result));
    result = f.actions.editBinding(f.selection, 'model', 'block', null);
    assert.equal(result.ok, true, JSON.stringify(result));
    const key = nodeBindingOverrideKey(['work'], 'work');
    assert.deepEqual(root.nodes['first/path'].nodeBindingOverrides[key], { profileId: 'reasoning', model: null });
    result = f.actions.editBinding(f.selection, 'model', 'inherit', null);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(root.nodes['first/path'].nodeBindingOverrides[key], { profileId: 'reasoning' });
    result = f.actions.editBinding(f.selection, 'model', 'block', null);
    assert.equal(result.ok, true, JSON.stringify(result));
    result = f.actions.editBinding(f.selection, 'profileId', 'inherit', null);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(root.nodes['first/path'].nodeBindingOverrides[key], { model: null });
});

test('stale or detached node selections cannot change instance connections', () => {
    const root = siblingWorkflow(), f = fixture(root, ['first/path']), before = structuredClone(root);
    const selection = f.selection;
    f.env.workspaceRevision++;
    assert.equal(f.actions.editBinding(selection, 'profileId', 'override', 'cheap').error.code, 'STALE_CONTEXT');
    assert.deepEqual(root, before);
    f.env.workspaceRevision--;
    f.session.focusView(f.session.project().graphViews.tabs[0].key);
    assert.equal(f.actions.editBinding(selection, 'profileId', 'override', 'cheap').ok, false);
    assert.deepEqual(root, before);
});

test('instance binding edits can be undone and redone from the same shared node tab', () => {
    const root = siblingWorkflow(), f = fixture(root, ['first/path']);
    assert.equal(f.actions.editBinding(f.selection, 'profileId', 'override', 'cheap').ok, true);
    f.env.paintHistory(); assert.equal(f.env.historyView.undo, true);
    f.env.restoreGraphHistory('undo', 'Undid');
    assert.deepEqual(root.nodes['first/path'].nodeBindingOverrides, {});
    f.env.paintHistory(); assert.equal(f.env.historyView.redo, true);
    f.env.restoreGraphHistory('redo', 'Redid');
    assert.equal(root.nodes['first/path'].nodeBindingOverrides[nodeBindingOverrideKey([], 'work')].profileId, 'cheap');
    assert.deepEqual(f.session.readEditor().view.identity.instancePath, ['first/path']);
});
