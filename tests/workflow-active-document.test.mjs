import assert from 'node:assert/strict';
import test from 'node:test';
import { installMock } from './mock.js';
import * as S from '../src/state.js?v=0.26.0';
import * as H from '../src/history.js?v=0.26.0';
import { sendWorkflowState } from '../src/run.js?v=0.26.0';
import { starterGraph } from '../src/workflow/starters.js?v=0.26.0';

test('Send follows the active document mode while activation preserves Arm', () => {
    installMock();
    assert.equal(typeof S.activateWorkflow, 'function', 'central document activation is available');
    const value = S.settings(), current = starterGraph('unified-basic');
    S.activateWorkflow(current);
    assert.equal(S.activeWorkflow(), current);
    assert.equal(value.enabled, false);
    assert.equal(sendWorkflowState().automatic, true);
    value.enabled = true;
    S.activateWorkflow(starterGraph('literal-cleanup'));
    assert.equal(sendWorkflowState().automatic, false, 'legacy post documents are manual');
    assert.equal(value.enabled, true, 'replacement cannot change the Arm preference');
    S.activateWorkflow(starterGraph('structured-guidance'));
    assert.equal(sendWorkflowState().automatic, true, 'legacy pre guidance still follows Send');
});

test('reopening the same graph identity resets history and invalidates activation captures', () => {
    installMock();
    assert.equal(typeof S.activateWorkflow, 'function', 'central document activation is available');
    const first = starterGraph('structured-guidance');
    S.activateWorkflow(first);
    const token = S.documentSession.capture();
    first.name = 'Edited first file'; H.noteChange(first); H.flush(first);
    assert.ok(H.peek(first).undo);
    const second = starterGraph('structured-guidance'); second.id = first.id;
    S.activateWorkflow(second, { clean: true });
    assert.equal(S.documentSession.stillCurrent(token), false);
    assert.deepEqual(H.peek(second), { undo: null, redo: null });
    assert.equal(H.undo(second), null);
    first.name = 'Late first-file edit'; H.noteChange(first);
    assert.deepEqual(H.peek(second), { undo: null, redo: null });
});

test('legacy recovery admits each document independently and preserves originals and views', () => {
    const graph = starterGraph('structured-guidance'), malformed = { id: 'broken', schema: 1, nodes: {}, wires: {} };
    const views = { version: 1, workflowId: graph.id, activeKey: JSON.stringify(['root', graph.id]), views: [{ identity: { kind: 'root', workflowId: graph.id }, open: true, camera: { x: 19, y: 12, zoom: 1.5 }, selection: { primary: null, multi: [] }, inspector: { item: null, section: '', open: true }, nodePresentation: {} }] };
    const c = installMock({ settings: { graphs: { [graph.id]: graph, broken: malformed }, activeGraphId: graph.id, workspaceViews: { [graph.id]: views }, enabled: true, ui: { remember: 'preference' } } });
    assert.equal(typeof S.recoveredWorkflows, 'function', 'migration recovery is independently enumerable');
    const value = S.settings(), entries = S.recoveredWorkflows();
    assert.equal(entries.length, 2);
    const valid = entries.find(entry => entry.id === graph.id), broken = entries.find(entry => entry.id === 'broken');
    assert.deepEqual(valid.graph, graph); assert.deepEqual(valid.workspaceViews, views);
    assert.deepEqual(valid.original, graph); assert.deepEqual(broken.original, malformed); assert.match(broken.issue, /schema|current|document/i);
    assert.equal(S.activeWorkflow().id, graph.id);
    assert.equal(value.enabled, true); assert.deepEqual(value.ui, { remember: 'preference' });
    assert.equal(Object.hasOwn(value, 'graphs'), false); assert.equal(Object.hasOwn(value, 'activeGraphId'), false);
    assert.equal(Object.hasOwn(value, 'nativeBindings'), false); assert.equal(Object.hasOwn(value, 'workspaceViews'), false);
    assert.equal(c.extensionSettings.lattice, value);
    S.activeWorkflow().name = 'Changed current recovery'; S.touchGraph(S.activeWorkflow());
    assert.equal(S.recoveredWorkflows().find(entry => entry.id === graph.id).graph.name, graph.name, 'current draft cannot mutate original recovery');
});

test('a single recovery draft stores authored work without its native file handle or runtime result', () => {
    installMock();
    assert.equal(typeof S.activateWorkflow, 'function', 'central document activation is available');
    const graph = starterGraph('structured-guidance'), handle = { name: 'private.json', createWritable() {} };
    S.activateWorkflow(graph, { source: { name: 'private.json', handle }, clean: true });
    graph.recording = { secret: 'runtime-only' }; graph.name = 'Authored change'; S.touchGraph(graph);
    const recovery = S.settings().recoveryDraft;
    assert.equal(recovery.graph.name, 'Authored change');
    assert.equal(Object.hasOwn(recovery.graph, 'recording'), false);
    assert.equal(JSON.stringify(S.settings()).includes('private.json'), false);
    assert.equal(S.documentSession.source().handle, handle);
});

test('malformed legacy graph accessors remain recoverable without evaluating them', () => {
    let reads = 0;
    const graph = { schema: 3, runtime: 2, mode: 'native-pre', nodes: {}, wires: {} };
    Object.defineProperty(graph, 'id', { enumerable: true, get() { reads++; throw new Error('never read'); } });
    installMock({ settings: { graphs: { unsafe: graph }, activeGraphId: 'unsafe' } });
    assert.equal(typeof S.recoveredWorkflows, 'function', 'migration recovery is independently enumerable');
    assert.doesNotThrow(() => S.settings());
    const entry = S.recoveredWorkflows().find(entry => entry.id === 'unsafe');
    assert.ok(entry.issue); assert.equal(entry.original, graph); assert.equal(reads, 0);
});

test('an unreadable legacy table entry does not hide independently valid documents or views', () => {
    let reads = 0;
    const graph = starterGraph('structured-guidance'), graphs = { [graph.id]: graph };
    Object.defineProperty(graphs, 'blocked', { enumerable: true, get() { reads++; throw new Error('never read'); } });
    const views = { [graph.id]: { version: 999, workflowId: graph.id, views: [] } };
    installMock({ settings: { graphs, activeGraphId: graph.id, workspaceViews: views } });
    const entries = S.recoveredWorkflows(), valid = entries.find(entry => entry.id === graph.id);
    assert.ok(valid, 'independently valid graph remains available');
    assert.equal(valid.graph.id, graph.id);
    assert.ok(valid.issue, 'invalid view presentation is reported independently');
    assert.deepEqual(valid.originalWorkspaceViews, views[graph.id]);
    assert.equal(valid.workspaceViews ?? null, null);
    assert.ok(entries.find(entry => entry.id === 'blocked').issue);
    assert.equal(reads, 0);
});

test('public state imports share one exact active document and lifecycle across versioned module URLs', async () => {
    installMock();
    const publicState = await import('../src/state.js'), publicHistory = await import('../src/history.js');
    const root = starterGraph('structured-guidance'); S.activateWorkflow(root);
    assert.equal(publicState.activeWorkflow(), root);
    const token = S.documentSession.capture(); let observed, touched;
    const unsubscribe = S.onWorkflowActivated(event => { observed = event.graph; });
    const unsubscribeTouch = S.onGraphTouched(graph => { touched = graph; });
    try {
        publicState.touchGraph(root); assert.equal(touched, root, 'public touch reaches versioned subscribers');
        root.name = 'First version'; publicHistory.noteChange(root); publicHistory.flush(root);
        assert.ok(publicHistory.peek(root).undo);
        const replacement = starterGraph('structured-guidance'); replacement.id = root.id;
        publicState.activateWorkflow(replacement);
        assert.equal(S.activeWorkflow(), replacement); assert.equal(observed, replacement);
        assert.equal(S.documentSession.stillCurrent(token), false);
        assert.deepEqual(publicHistory.peek(replacement), { undo: null, redo: null });
    } finally { unsubscribe(); unsubscribeTouch(); }
});

test('a corrupted recovery draft view preserves its graph and original view data without blocking document commands', () => {
    const graph = starterGraph('structured-guidance'), workspaceViews = { version: 1, workflowId: graph.id, views: 'corrupt' };
    installMock({ settings: { recoveryDraft: { graph, workspaceViews } } });
    S.settings();
    assert.doesNotThrow(() => S.documentSession.snapshot());
    assert.equal(S.activeWorkflow().id, graph.id); assert.equal(S.activeWorkspaceViews(), null);
    const entry = S.recoveredWorkflows().find(entry => entry.graph?.id === graph.id);
    assert.ok(entry?.issue); assert.deepEqual(entry.originalWorkspaceViews, workspaceViews);
    S.activateWorkflow(S.createGraph('Next document')); assert.equal(S.activeWorkflow().name, 'Next document');
});

test('legacy presentations remain recoverable when their graph entry is absent or unreadable', () => {
    let reads = 0;
    const graphs = {};
    Object.defineProperty(graphs, 'blocked', { enumerable: true, get() { reads++; throw new Error('never read'); } });
    const workspaceViews = { absent: { version: 1, workflowId: 'absent', views: [] }, blocked: { version: 1, workflowId: 'blocked', views: [] } };
    installMock({ settings: { graphs, workspaceViews } });
    const entries = S.recoveredWorkflows();
    for (const id of ['absent', 'blocked']) {
        const entry = entries.find(entry => entry.id === id);
        assert.ok(entry?.issue); assert.deepEqual(entry.originalWorkspaceViews, workspaceViews[id]);
    }
    assert.equal(reads, 0);
});

test('reactivating the same document object revokes presentation receipts from its previous history', () => {
    installMock();
    const graph = starterGraph('structured-guidance'); S.activateWorkflow(graph);
    const snapshot = () => JSON.stringify(Object.fromEntries(H.GRAPH_DOCUMENT_FIELDS.filter(key => Object.hasOwn(graph, key)).map(key => [key, graph[key]])));
    const receipt = H.capturePresentationStep(graph), beforeState = snapshot();
    S.activateWorkflow(graph);
    graph.name = 'New activation edit'; H.noteChange(graph); H.flush(graph);
    assert.equal(H.attachPresentationEffect(graph, { receipt, effect: Object.freeze({}), beforeState, afterState: snapshot() }), false);
});
