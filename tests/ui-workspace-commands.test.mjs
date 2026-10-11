import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { prepareWorkspaceViews, projectEditorDraw } from '../src/ui/workspace-preparation.js';
import { createGraphViewSession } from '../src/ui/graph-view-session.js';
import { operationFor } from '../src/workflow/catalog.js';
import { isCommentFrame, createCommentFrame } from '../src/canvas/comment-frames.js';
import { readNodePresentation } from '../src/ui/node-palette.js';
import { groupMembers } from '../src/state.js';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js';
import { createNativeWorkflowController } from '../src/workflow/host.js';
import { starterGraph } from '../src/workflow/starters.js';
import { canvasWorkflow } from './browser/native-fixture.mjs';
import { operationDefaults } from '../src/workflow/catalog.js';
import { prepareCreateFromSelection } from '../src/workflow/composition.js';
import { captureRelocatedSubgraphViews } from '../src/ui/subgraph-view-state.js';
import { prepareCommentEdit } from '../src/workflow/comment-edits.js';
import { makeClip, makeDefinitionClip, readClip, prepareClipPaste } from '../src/workflow/clipboard.js';
import { prepareQualifiedScopeEdit } from '../src/workflow/definition-library.js';
import * as H from '../src/history.js?v=0.27.0';
import { definitionRefKey } from '../src/workflow/definition-data.js';
import { siblingWorkflow } from './fixtures/workflow-prepared-fixture.mjs';
const source = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
function actual(name, env) {
    const start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'Actual controller function ' + name);
    const line = source.slice(start, source.indexOf('\n', start));
    const end = line.endsWith('}') ? start + line.length : source.indexOf('\n}', start) + 2;
    return Function('env', 'with(env){' + source.slice(start, end) + ';return ' + name + ';}')(env);
}
function fixture(graph = siblingWorkflow()) {
    const prepared = prepareWorkspaceViews(graph); assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const session = createGraphViewSession({ root: graph, activationId: 'menu-commands', ...prepared.data }).data;
    const env = { current: graph, graphViews: session, workspacePrepared: { ...prepared.data, libraryDefinitions: graph.definitions }, editorDraw: projectEditorDraw(session.readEditor()),
        canvas: { selection: null, multi: new Set(), wireMulti: new Set() }, selected: null, selectedKind: null,
        operationFor, isCommentFrame, readNodePresentation, groupMembers, definitionRefKey, prepareCreateFromSelection, captureRelocatedSubgraphViews, createCommentFrame, prepareCommentEdit, makeClip, makeDefinitionClip, readClip, prepareClipPaste, H, captureGraphEditContext, prepareQualifiedScopeEdit, editorCaptures: new WeakMap(), workspaceRevision: 0, isOpen: () => true, activeEditRoot: () => graph, readGraphEditContext: () => session.readEditContext(), graphDocumentHooks: {}, workbench: { focusCommentTitle() {}, update() {} }, persistGraphViews() {}, toast() {}, workflowState: { busy: false }, workflowRuntime: { getNativeWorkflowController: () => ({ activity: () => null }) } };
    const documentToken = Object.freeze({}); env.documentSession = { capture: () => documentToken };
    env.documentTransition = false; env.rootSystemWritable = actual('rootSystemWritable', env);
    env.canCreateSubgraph = actual('canCreateSubgraph', env);
    env.selectionMenuCapabilities = actual('selectionMenuCapabilities', env);
    env.stopOwnedWorkflow = actual('stopOwnedWorkflow', env);
    env.runPreviewHere = actual('runPreviewHere', env);
    const refresh = () => { const next = prepareWorkspaceViews(graph); assert.equal(next.ok, true, JSON.stringify(next)); assert.equal(session.replacePreparedViews(next.data).ok, true); env.editorDraw = projectEditorDraw(session.readEditor()); env.workspacePrepared.libraryDefinitions = graph.definitions; };
    env.commitGraphEdit = (root, command) => { const result = commitPreparedGraph(root, command); if (result.ok && result.data.changed) { H.noteChange(root); refresh(); } return result; };
    env.canvas.widthOf = () => 260; env.canvas.heightOf = () => 100;
    for (const name of ['captureEditor', 'editorCurrent', 'scopeCommand', 'commitCaptured', 'prepareScopeMutation', 'groupSelection', 'ungroupSelection', 'currentPick', 'clipForPick', 'duplicateSelected', 'samePreviewTerminal', 'commentSelectionIds', 'commentBounds', 'commentLocation', 'commitComment', 'addComment']) env[name] = actual(name, env);
    env.activateEditorDraw = refresh; env.navigateGraphView = (action, ...args) => { assert.equal(session[action](...args).ok, true); refresh(); }; env.canvas.fit = () => {};
    H.track(graph);
    const select = (kind, value) => { env.selectedKind = kind; env.selected = kind === 'multi' ? value : kind ? env.editorDraw[kind === 'node' ? 'nodes' : kind === 'group' ? 'groups' : 'wires'][value] : null; env.canvas.selection = kind && kind !== 'multi' ? { kind, id: value } : null; env.canvas.multi = new Set(kind === 'multi' ? value : []); };
    env.canvas.select = selection => select(selection?.kind ?? null, selection?.id);
    env.canvas.setMulti = ids => select(ids.length > 1 ? 'multi' : ids.length ? 'node' : null, ids.length > 1 ? ids : ids[0]);
    env.canvas.host = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }) }; env.canvas.toGraph = (x, y) => ({ x, y });
    return { env, session, graph, refresh, select, capabilities: () => actual('selectionMenuCapabilities', env)() };
}
test('diagnostic dispatch never supersedes an active host run and rechecks before starting', () => {
    const f = fixture();
    let activity = {busy:true, graph:f.graph}, calls = 0;
    f.env.workflowRuntime.getNativeWorkflowController = () => ({activity: () => activity});
    f.env.workflowSession = {run: options => { calls++; return options; }};
    const run = actual('runPreviewHere', f.env);
    const key = f.session.readEditContext().sessionId + ':' + f.env.workspaceRevision;
    const target = {workflowId:f.graph.id,instancePath:[],nodeId:'source',portId:'out'};
    run(key,target); assert.equal(calls,0);
    activity = {busy:true,graph:siblingWorkflow()}; run(key,target); assert.equal(calls,0);
    activity = null; run(key + ':stale',target); assert.equal(calls,0);
    assert.deepEqual(run(key,target),{target}); assert.equal(calls,1);
    f.env.workflowState.busy = true; run(key,target); assert.equal(calls,1);
});
test('menu capabilities follow exact node, multi, group and wire selection', () => {
    const f = fixture();
    assert.equal(f.capabilities().hasSelection, false);
    f.select('node', 'second');
    assert.equal(f.capabilities().inspect, true); assert.equal(f.capabilities().saveSubgraph, true); assert.equal(f.capabilities().duplicate, true);
    f.select('multi', ['first/path', 'second']);
    assert.equal(f.capabilities().inspect, false); assert.equal(f.capabilities().group, true); assert.equal(f.capabilities().createSubgraph, true); assert.equal(f.capabilities().saveSubgraph, false);
    f.select('node', 'source'); assert.equal(f.capabilities().createSubgraph, true);
    f.select('wire', 'a'); assert.equal(f.capabilities().hasSelection, true); assert.equal(f.capabilities().inspect, false); assert.equal(f.capabilities().duplicate, false); assert.equal(f.capabilities().comment, false);
});

test('Fit selection is available for wires, empty group frames and a single multiple-selection ID', () => {
    const f = fixture();
    assert.equal(f.capabilities().fitSelection, false);
    f.select('wire', 'a'); assert.equal(f.capabilities().fitSelection, true);
    f.select(null); f.env.canvas.wireMulti.add('a'); assert.equal(f.capabilities().fitSelection, true);
    f.env.canvas.wireMulti.clear(); f.env.canvas.multi.add('second'); assert.equal(f.capabilities().fitSelection, true);
    f.env.editorDraw.groups.empty = { id: 'empty', title: 'Empty', frame: { x: 700, y: 200, w: 400, h: 200 } };
    f.select('group', 'empty'); assert.equal(f.capabilities().fitSelection, true);
    assert.equal(f.session.openInstance(['second']).ok, true); f.refresh(); f.select('node', 'work');
    assert.equal(f.session.readEditor().readOnly, true); assert.equal(f.capabilities().fitSelection, true);
});


test('group and ungroup menu commands use real typed edits and retain undo', () => {
    const f = fixture(); f.select('multi', ['first/path', 'second']);
    const before = structuredClone(f.graph);
    const action = actual('menuCommandAction', f.env)('group-selection'); assert.equal(typeof action, 'function');
    assert.equal(action().ok, true);
    const group = Object.values(f.graph.groups)[0]; assert.deepEqual(group.members, ['first/path', 'second']);
    f.select('group', group.id); assert.equal(f.capabilities().ungroup, true); assert.equal(f.capabilities().group, false);
    assert.equal(actual('menuCommandAction', f.env)('ungroup-selection')().ok, true); assert.equal(Object.keys(f.graph.groups).length, 0);
    assert.ok(H.undo(f.graph)); f.refresh(); assert.ok(f.graph.groups[group.id]);
    assert.ok(H.undo(f.graph)); f.refresh(); assert.deepEqual(f.graph, before);
});


test('duplicate selection preserves the selected fragment and commits one undo step', () => {
    const f = fixture(); f.select('multi', ['first/path', 'second']);
    const before = structuredClone(f.graph), count = Object.keys(f.graph.nodes).length;
    const action = actual('menuCommandAction', f.env)('duplicate-selection'); assert.equal(typeof action, 'function'); assert.equal(action().ok, true);
    assert.equal(Object.keys(f.graph.nodes).length, count + 2); assert.deepEqual([...f.env.canvas.multi], ['first/path', 'second']);
    assert.ok(H.undo(f.graph)); f.refresh(); assert.deepEqual(f.graph, before);
});

test('comment commands wrap selected nodes or add an empty frame using authored edits', () => {
    const f = fixture(); f.select('multi', ['first/path', 'second']);
    const before = structuredClone(f.graph);
    const action = actual('menuCommandAction', f.env)('comment-selection'); assert.equal(typeof action, 'function'); assert.equal(action().ok, true);
    const frame = Object.values(f.graph.nodes).find(isCommentFrame); assert.ok(frame); assert.equal(f.env.canvas.selection.id, frame.id);
    assert.ok(H.undo(f.graph)); f.refresh(); assert.deepEqual(f.graph, before); f.select(null);
    const add = actual('menuCommandAction', f.env)('add-comment'); assert.equal(typeof add, 'function'); assert.equal(add().ok, true);
    assert.equal(Object.values(f.graph.nodes).filter(isCommentFrame).length, 1);
});

test('menu commands respect read-only and boundary capabilities while presentation remains available', () => {
    const f = fixture(); assert.equal(f.session.openInstance(['second']).ok, true); f.refresh(); f.select('node', 'work');
    assert.equal(f.session.readEditor().readOnly, true); assert.equal(f.capabilities().rename, true); assert.equal(f.capabilities().compact, true);
    const before = structuredClone(f.graph); const command = actual('menuCommandAction', f.env);
    for (const name of ['duplicate-selection', 'group-selection', 'ungroup-selection', 'comment-selection', 'create-subgraph']) {
        const action = command(name); assert.equal(typeof action, 'function', name); action();
    }
    assert.equal(command('add-comment')().ok, false); assert.deepEqual(f.graph, before);
    f.select('node', 'entry'); assert.equal(f.capabilities().inspect, true); assert.equal(f.capabilities().rename, false); assert.equal(f.capabilities().duplicate, false); assert.equal(f.capabilities().compact, false); assert.equal(f.capabilities().createSubgraph, false);
    f.select('node', 'work'); let presented = null; f.env.presentNode = (id, field, value) => { presented = { id, field, value }; f.session.updateView({ nodePresentation: { [id]: { [field]: value } } }); };
    command('compact-selection')(); assert.deepEqual(presented, { id: 'work', field: 'compact', value: true }); assert.equal(f.capabilities().compactChecked, true); assert.deepEqual(f.graph, before);
});

test('create-subgraph menu command uses captured qualified authoring and one-step undo', () => {
    const graph = canvasWorkflow(operationDefaults, 3); graph.id = 'menu-create-subgraph';
    const f = fixture(graph); f.select('multi', ['n0', 'n1']); f.env.createSubgraph = actual('createSubgraph', f.env);
    const before = structuredClone(graph); assert.equal(f.capabilities().createSubgraph, true);
    assert.equal(actual('menuCommandAction', f.env)('create-subgraph')().ok, true);
    const wrapper = Object.values(graph.nodes).find(node => node.type === 'subgraph'); assert.ok(wrapper);
    assert.deepEqual(f.session.readEditor().view.identity.instancePath, [wrapper.id]); assert.ok(f.session.readEditor().prepared.savedGraph.nodes.n0);
    assert.equal(graph.wires.w2.from, wrapper.id); assert.equal(graph.wires.w1, undefined);
    assert.ok(H.undo(graph)); f.refresh(); assert.deepEqual(graph, before); assert.equal(f.session.readEditor().view.identity.kind, 'root');
});

function pendingHost(graph = starterGraph('unified-basic')) {
    const listeners = new Map(), documentToken = Object.freeze({});
    let busy = false, aborts = 0, settle;
    const settled = new Promise(resolve => { settle = resolve; });
    const context = { chatId: 'menu-activity', characterId: 0, groupId: null, characters: [{ data: { name: 'Mara' } }], chat: [{ mes: 'Hello', is_user: true, extra: {} }], extensionPrompts: {},
        eventTypes: Object.fromEntries(['GENERATION_STARTED', 'GENERATION_STOPPED', 'GENERATION_ENDED', 'MESSAGE_RECEIVED'].map(name => [name, name])),
        setExtensionPrompt(key, value) { context.extensionPrompts[key] = { value }; } };
    context.eventSource = { on(name, listener) { const bucket = listeners.get(name) ?? []; bucket.push(listener); listeners.set(name, bucket); },
        removeListener(name, listener) { listeners.set(name, (listeners.get(name) ?? []).filter(item => item !== listener)); },
        async emit(name, ...args) { for (const listener of listeners.get(name) ?? []) await listener(...args); } };
    const controller = createNativeWorkflowController({ context: () => context, getGraph: phase => phase === 'unified' ? graph : null, getDocumentToken: () => documentToken,
        isEnabled: () => true, userId: () => 'menu-user', isBusy: () => busy, onResult: result => settle(result) });
    controller.subscribe();
    return { graph, controller, context, documentToken, settled, aborts: () => aborts,
        async start() { busy = true; await context.eventSource.emit('GENERATION_STARTED', 'normal', {}, false); return controller.beforeGenerate(context.chat.map(message => ({ ...message })), 8192, () => { aborts++; }, 'normal'); } };
}
test('host publishes genuine owned Send activity and unsubscribe removes observers', async () => {
    const f = pendingHost(), changes = [];
    assert.equal(typeof f.controller.activity, 'function'); assert.equal(typeof f.controller.subscribeActivity, 'function');
    const unsubscribe = f.controller.subscribeActivity(value => changes.push(value));
    const ready = await f.start(); assert.equal(ready.ok, true, JSON.stringify(ready)); assert.equal(ready.awaitingNative, true);
    const owned = f.controller.activity(); assert.equal(owned.graph, f.graph); assert.equal(owned.busy, true); assert.equal(owned.native, true); assert.equal(typeof owned.runId, 'string'); assert.equal(Object.isFrozen(f.graph), false);
    assert.equal(owned.documentToken, f.documentToken); assert.equal(owned.runId, ready.runId);
    f.controller.cancel('Stopped by user'); assert.equal(f.controller.activity(), null); assert.equal(changes.at(-1), null);
    assert.equal(f.aborts(), 1); assert.equal((await f.settled).error.code, 'ABORTED'); unsubscribe(); const count = changes.length; f.controller.cancel('after-unsubscribe'); assert.equal(changes.length, count); f.controller.dispose();
});

test('Stop checks current root ownership and never cancels a different active host run', async () => {
    const host = pendingHost(), f = fixture(host.graph);
    f.env.workflowRuntime.getNativeWorkflowController = () => host.controller;
    let documentToken = host.documentToken, cancellations = 0;
    f.env.documentSession = { capture: () => documentToken };
    f.env.workflowSession = { cancel: reason => { cancellations++; host.controller.cancel(reason); } };
    const ready = await host.start(); assert.equal(ready.ok, true, JSON.stringify(ready)); assert.equal(ready.awaitingNative, true);
    assert.equal(f.env.workflowState.busy, false); assert.equal(f.capabilities().stop, true);
    const command = actual('menuCommandAction', f.env), stop = command('stop-workflow'); assert.equal(typeof stop, 'function');
    f.env.stopOwnedWorkflow = actual('stopOwnedWorkflow', f.env);
    const other = siblingWorkflow(); f.env.current = other; assert.equal(f.capabilities().stop, false); stop(); assert.equal(host.controller.activity().graph, host.graph);
    f.env.current = structuredClone(host.graph); assert.equal(f.capabilities().stop, false); stop(); assert.equal(cancellations, 0);
    f.env.current = host.graph; documentToken = Object.freeze({}); assert.equal(f.capabilities().stop, false); stop(); assert.equal(cancellations, 0); assert.equal(host.aborts(), 0);
    documentToken = host.documentToken; f.env.isOpen = () => false; stop(); assert.equal(cancellations, 0); assert.equal(host.controller.activity().runId, ready.runId);
    f.env.isOpen = () => true; stop(); assert.equal(cancellations, 1); assert.equal(host.aborts(), 1); assert.equal(host.controller.activity(), null); assert.equal(f.capabilities().stop, false);
    assert.equal((await host.settled).error.code, 'ABORTED'); assert.deepEqual(host.context.chat, [{ mes: 'Hello', is_user: true, extra: {} }]); host.controller.dispose();
});

test('selection navigation and named presentation commands target the active view', () => {
    const f = fixture(), calls = []; f.env.canvas.selectAll = () => f.env.canvas.setMulti(Object.keys(f.env.editorDraw.nodes)); f.env.canvas.centerSelection = () => calls.push('center');
    f.env.showSettings = selection => calls.push(['details', selection]); f.env.focusAlias = node => calls.push(['rename', node.id]); f.env.focusBoundaryLabel = id => calls.push(['boundary', id]);
    f.env.openSubgraphSave = id => calls.push(['save-subgraph', id]); f.env.openPortalManager = conversion => calls.push(['portals', conversion]);
    const command = actual('menuCommandAction', f.env);
    assert.equal(typeof command('select-all'), 'function'); command('select-all')(); assert.equal(f.env.canvas.multi.size, Object.keys(f.graph.nodes).length);
    command('clear-selection')(); assert.equal(f.capabilities().hasSelection, false);
    f.select('node', 'second'); command('details-selection')(); command('rename-selection')(); command('save-subgraph')(); command('center-selection')();
    assert.deepEqual(calls.slice(0, 4), [['details', { kind: 'node', id: 'second' }], ['rename', 'second'], ['save-subgraph', 'second'], 'center']);
    assert.equal(f.session.openInstance(['second']).ok, true); f.refresh(); f.select('node', 'work'); command('rename-selection')(); assert.deepEqual(calls.at(-1), ['rename', 'work']);
    command('manage-portals')(); assert.deepEqual(calls.at(-1), ['portals', undefined]);
});

test('Enable Lattice changes the current document preference from a child without legacy assignment authority', () => {
    const f = fixture(), stored = { schema: 2, enabled: false }; let saves = 0, canceled = 0;
    Object.assign(f.env, { settings: () => stored, save: () => saves++, refreshWorkflowPreparation() {}, updateWorkflowProjection() {}, renderStatus() {}, workflowSession: { cancel: () => canceled++ } });
    f.session.openInstance(['second']); f.refresh();
    const command = actual('menuCommandAction', f.env); assert.equal(command('clear-workflow-assignment'), undefined); assert.equal(command('arm-workflow'), undefined);
    const token = f.env.documentSession.capture(); f.env.armWorkflow = actual('armWorkflow', f.env);
    command('enable-workflow')(); assert.equal(stored.enabled, true); command('enable-workflow')(); assert.equal(stored.enabled, false); assert.equal(saves, 2); assert.equal(canceled, 0);
    assert.deepEqual(stored, { schema: 2, enabled: false }); assert.equal(f.env.current, f.graph); assert.equal(f.env.documentSession.capture(), token); assert.deepEqual(f.session.readEditor().view.identity.instancePath, ['second']);
});

test('Review host result returns from child to the current saved root terminal and follows it', () => {
    const graph = siblingWorkflow(), native = starterGraph('unified-basic');
    Object.assign(graph.nodes, native.nodes); Object.assign(graph.wires, native.wires);
    const f = fixture(graph); f.session.openInstance(['second']); f.refresh(); f.select('node', 'work'); let revealed = 0;
    Object.assign(f.env, { selectedPreview: { kind: 'terminal', address: { workflowId: 'old-root', instancePath: [], nodeId: 'one' } }, pinnedPreview: { workflowId: f.graph.id, instancePath: ['second'], nodeId: 'work', portId: 'out' }, updateWorkflowProjection() {}, applyPreviewReview() {}, rejectPreviewReview() {} });
    f.env.workbench.revealPreview = () => revealed++; f.env.showSettings = selection => f.env.canvas.select(selection);
    const start = source.indexOf('const outputPreviewActions = {'), end = source.indexOf('\n};', start) + 3;
    f.env.outputPreviewActions = Function('env', 'with(env){' + source.slice(start, end) + ';return outputPreviewActions;}')(f.env);
    const command = actual('menuCommandAction', f.env); assert.equal(typeof command('review-host-result'), 'function'); f.env.reviewHostResult = actual('reviewHostResult', f.env); command('review-host-result')();
    assert.equal(f.session.readEditor().view.identity.kind, 'root'); assert.equal(f.env.canvas.selection.id, 'review-publish'); assert.equal(f.env.pinnedPreview, null);
    assert.deepEqual(f.env.selectedPreview, { kind: 'terminal', address: { workflowId: f.graph.id, instancePath: [], nodeId: 'review-publish' } }); assert.equal(revealed, 1);
});

test('activity publication preserves getter-free unsupported document admission', async () => {
    let reads = 0;
    const graph = { schema: 99, runtime: 2, get id() { reads++; throw new Error('Unsupported document id must not be read'); } };
    const controller = createNativeWorkflowController({ context: () => ({ chat: [] }) });
    const result = await controller.runTarget(graph, { workflowId: 'unsupported', instancePath: [], nodeId: 'source', portId: 'out' }); assert.equal(result.error.code, 'MALFORMED_WORKFLOW'); assert.equal(reads, 0); assert.equal(controller.activity(), null); controller.dispose();
});
