import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fixture, mouse, dom } from './canvas-fixture.mjs';
import {fixtureGraph as starterGraph,withNativeBoundary} from './helpers/workflow-fixtures.mjs';
import {nativeFixture} from './helpers/native-workflow-fixture.mjs';
import { cloneWorkflowDocument } from '../src/workflow/document.js?v=0.27.0';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js?v=0.27.0';
import { workflowSignature } from '../src/workflow/runtime.js?v=0.27.0';
import { createNativeWorkflowController } from '../src/workflow/host.js?v=0.27.0';
import { createWorkflowSession, prepareWorkflowProjection, projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.27.0';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.0';
import { prepareWorkspaceViews, prepareLibraryViews, projectEditorDraw, projectWorkspacePanels, projectNodeProfiles } from '../src/ui/workspace-preparation.js?v=0.27.0';
import * as H from '../src/history.js?v=0.27.0';
import {projectRecallView} from '../src/ui/recall-projection.js?v=0.27.0';
import { readNodePresentation } from '../src/ui/node-palette.js?v=0.27.0';
import { viewIdentityKey } from '../src/ui/view-state.js?v=0.27.0';
import { restoreSystemViews } from '../src/ui/system-authoring-views.js?v=0.27.0';
import { createConfiguredNodeSession } from '../src/ui/configured-node-creation.js?v=0.27.0';
import { isCommentFrame } from '../src/canvas/comment-frames.js?v=0.27.0';
import { operationFor } from '../src/workflow/catalog.js?v=0.27.0';
import { groupMembers } from '../src/state.js?v=0.27.0';

const groupId = 'ai-de-slop';
const controllerText = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
function controllerFunction(name, env) {
    env.recallProjection ??= {nodes:{}}; env.projectRecallView ??= projectRecallView; env.recallDetailsView ??= null; env.recallSelectionIds ??= () => []; env.recallSetupView ??= () => null;
    env.activeEditRoot ??= () => env.current;
    env.createConfiguredNodeSession ??= createConfiguredNodeSession;
    env.cancelConfiguredNode ??= () => {};
    env.readNodePresentation ??= readNodePresentation;
    env.viewIdentityKey ??= viewIdentityKey;
    env.pendingCommentPresentation ??= new WeakMap();
    env.pendingSubgraphPresentation ??= new WeakMap();
    env.pendingSystemPresentation ??= new WeakMap(); env.restoreSystemViews ??= restoreSystemViews;
    env.documentTransition ??= false; env.workflowState ??= { busy: false }; env.workflowRuntime ??= {};
    env.targetedPreview ??= null;
    env.isCommentFrame ??= isCommentFrame;
    env.operationFor ??= operationFor;
    env.groupMembers ??= groupMembers;
    if (name !== 'applyPendingCommentPresentation') env.applyPendingCommentPresentation ??= controllerFunction('applyPendingCommentPresentation', env);
    if (name === 'activateEditorDraw') { env.applyPendingSubgraphPresentation ??= controllerFunction('applyPendingSubgraphPresentation', env); env.applyPendingSystemPresentation ??= controllerFunction('applyPendingSystemPresentation', env); }
    if (name === 'selectionMenuCapabilities') env.rootSystemWritable ??= controllerFunction('rootSystemWritable', env);
    const start = controllerText.indexOf('function ' + name + '(');
    if (start < 0) {
        const declaration = controllerText.indexOf('const ' + name + ' =');
        if (declaration < 0) return null;
        return Function('env', 'with(env){' + controllerText.slice(declaration, controllerText.indexOf('\n', declaration)) + ';return ' + name + ';}')(env);
    }
    const next = controllerText.indexOf('\nfunction ', start + 1);
    return Function('env', 'with(env){' + controllerText.slice(start, next < 0 ? undefined : next) + ';return ' + name + ';}')(env);
}
function groupedDefinition() {
    const checked = computeDefinitionIdentity({ id: 'local-group', version: 1, name: 'Local group', parameters: [], interface: [{ id: 'text', label: 'Text', kind: 'text', direction: 'output', required: false, cardinality: 'one', boundaryNodeId: 'exit' }], body: { schema: 3, runtime: 2, mode: 'native-post', nodes: { compose: { id: 'compose', type: 'workflow', operation: 'compose', outputKind: 'text', inGroup: groupId, sections: [{ name: 'value', text: 'Local body' }], x: 40, y: 40 }, exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'text', x: 280, y: 40 } }, wires: { edge: { id: 'edge', route: 'wire', from: 'compose', fromPort: 'out', to: 'exit', toPort: 'in' } }, groups: { [groupId]: { id: groupId, title: 'Same local ID', collapsed: true, members: ['compose'], x: 40, y: 40, w: 160 } } } });
    assert.equal(checked.ok, true, JSON.stringify(checked));
    return { ...checked.data.materializedDefinition, semanticHash: checked.data.semanticHash };
}
function prepared(schema = 3,native=false) {
    const source = starterGraph('reviewed-de-slop'); source.nodes.repair.mode = 'scan';if(native){for(const [id,value]of Object.entries(source.nodes))if(value.operation==='apply-reply'){delete source.nodes[id];for(const [edge,wire]of Object.entries(source.wires))if(wire.to===id||wire.from===id)delete source.wires[edge];}withNativeBoundary(source);}const root = schema === 3 ? cloneWorkflowDocument(source).data : source;
    const definition = groupedDefinition(), ref = { id: definition.id, version: definition.version, semanticHash: definition.semanticHash };
    if (schema === 3) { root.definitions[definitionRefKey(definition)] = definition; root.nodes.inspection = { id: 'inspection', type: 'subgraph', definition: ref, parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {} }; }
    let bindings = 0;
    const result = prepareWorkspaceViews(root, { resolveBinding: () => { bindings++; throw new Error('Scan-only preparation must not bind a model'); } }); assert.equal(result.ok, true, JSON.stringify(result));
    const library = prepareLibraryViews(root.id, { [definitionRefKey(definition)]: definition }); assert.equal(library.ok, true, JSON.stringify(library));
    result.data.navigation.push(...library.data.navigation); result.data.preparedViews.push(...library.data.preparedViews);
    const views = createGraphViewSession({ root, activationId: 'group-presentation-' + schema, ...result.data }).data; assert.ok(views);
    return { root, definition, ref, views, preparation: result.data, bindings: () => bindings };
}
async function controllerFixture(schema = 3,native=false) {
    const f = prepared(schema,native), counters = { persist: 0, projection: 0, changes: 0 }, env = { current: f.root, graphViews: f.views, editorDraw: null, nativeGroupPresenter: null, rootRunEpoch: 7, workspaceRevision: 1, workspacePrepared: { ...f.preparation, catalogs: new Map() }, nativeWireBridge: null, nativeCatalog: null, editorCaptures: new WeakMap(), selected: null, selectedKind: null, selectedPreview: null, restoringEditor: false, canvasTraceRows: null, root: document.createElement('div'), projectEditorDraw, projectNodeProfiles, isOpen: () => true, cancelImportReview() {}, replaceNativeBridge() {}, syncPaneToggles() {}, updateWorkflowProjection() { counters.projection++; }, paintHistory() {}, workbench: { update() {} }, persistGraphViews() { counters.persist++; } };
    for (const name of ['captureEditor', 'editorCurrent', 'prepareGroupPresentation', 'replaceNativeBridge']) { const fn = controllerFunction(name, env); if (fn) env[name] = fn; }
    assert.equal(typeof env.prepareGroupPresentation, 'function', 'the actual controller needs a qualified local group presentation adapter');
    const real = fixture({ nativeCard: node => env.editorDraw?.nativeCards[node.id], nativeScope: () => f.views.readEditor().view.identity.kind === 'library' ? { readOnly: true } : { workflowId: f.root.id, instancePath: f.views.readEditor().view.identity.instancePath ?? [], readOnly: f.views.readEditor().readOnly }, canEdit: () => !f.views.readEditor().readOnly, onNativeGroupPresentation: (id, collapsed) => env.nativeGroupPresenter?.(id, collapsed), onChange: () => { counters.changes++; } }); env.canvas = real.canvas;
    const activate = controllerFunction('activateEditorDraw', env);
    function draw() {
        activate();
        for (const node of Object.values(env.editorDraw.nodes)) real.canvas.geometry.measure(node.id, 160, 48, env.editorDraw.nativeCards[node.id]?.ports.map(pin => ({ id: pin.port, direction: pin.dir, x: pin.dir === 'in' ? 0 : 160, y: 24, side: pin.side, kind: pin.kind })) ?? []);
        real.canvas.render();
    }
    draw(); return { ...f, env, real, counters, draw, async close() { await real.canvas.destroy(); real.host.remove(); } };
}
const open = host => host.querySelector(`[data-group="${groupId}"] [aria-label="Open group"]`);
const fold = host => host.querySelector(`[data-group="${groupId}"] [aria-label="Fold group"]`);
const group = host => host.querySelector(`[data-group="${groupId}"]`);

// The first regression isolates the genuine existing DOM-to-Canvas native bridge.
test('native ordinary Group Open DOM action and doubleclick reach presentation callbacks rather than the blanket native rejection', async () => {
    const f = prepared(), drawing = projectEditorDraw(f.views.readEditor()), calls = [], before = structuredClone(f.root);
    const real = fixture({ nativeCard: node => drawing.nativeCards[node.id], onNativeGroupPresentation: (...args) => { calls.push(args); return true; } });
    try {
        real.canvas.setGraph(drawing); assert.ok(open(real.host)); open(real.host).click();
        assert.deepEqual(calls, [[groupId, false]], 'the real native Open control must call the qualified presentation bridge');
        mouse(group(real.host), 'dblclick', 450, 150); assert.deepEqual(calls, [[groupId, false], [groupId, false]]);
        assert.deepEqual(f.root, before, 'the bridge never writes the saved root');
        assert.equal(real.canvas.setCollapsed(groupId, 'false'), false, 'fold state is a strict boolean'); assert.equal(calls.length, 2);
    } finally { await real.canvas.destroy(); real.host.remove(); }
});

test('actual current group Open exposes saved members and real pins and persists only local folding across reload', async () => {
    const f = await controllerFixture(), before = structuredClone(f.root), signature = workflowSignature(f.root); H.track(f.root); const history = structuredClone(H.peek(f.root)), epoch = f.views.readEditContext().sessionId;
    try {
        assert.equal(f.root.schema, 3); assert.equal(f.root.runtime, 2); assert.equal(f.root.groups[groupId].collapsed, true); assert.equal(f.real.host.querySelector('[data-id="pattern-scan"]'), null);
        const button = open(f.real.host); assert.ok(button); mouse(button, 'mousedown', 450, 150); mouse(button, 'mouseup', 450, 150);
        assert.equal(f.env.editorDraw.groups[groupId].collapsed, false); assert.ok(fold(f.real.host));
        const member = f.real.host.querySelector('.pc-node[data-id="pattern-scan"]'); assert.ok(member, 'ordinary DOM Open makes the real member reachable'); assert.ok(member.querySelector('.pc-port[data-dir="in"][data-port="in"]')); assert.ok(member.querySelector('.pc-port[data-dir="out"][data-port="out"]'));
        assert.deepEqual(f.views.readEditor().view.groupPresentation, { [groupId]: { collapsed: false } }); assert.equal(f.views.readEditContext().sessionId, epoch, 'folding cannot change the editor authority epoch');
        const saved = f.views.serialize(); assert.equal(saved.ok, true); assert.equal(saved.data.version, 1);
        const restored = createGraphViewSession({ root: f.root, activationId: 'reopened-root', ...f.preparation, persisted: saved.data }); assert.equal(restored.ok, true); assert.equal(projectEditorDraw(restored.data.readEditor()).groups[groupId].collapsed, false);
        mouse(f.real.host.querySelector(`[data-group="${groupId}"] .pc-group-frame-head`), 'dblclick', 450, 150); assert.equal(f.env.editorDraw.groups[groupId].collapsed, true); assert.equal(f.real.host.querySelector('[data-id="pattern-scan"]'), null);
        open(f.real.host).click(); assert.equal(f.env.editorDraw.groups[groupId].collapsed, false);
        assert.deepEqual(f.root, before); assert.equal(workflowSignature(f.root), signature); assert.deepEqual(H.peek(f.root), history); assert.equal(f.env.rootRunEpoch, 7); assert.equal(f.bindings(), 0); assert.equal(f.counters.changes, 0); assert.equal(f.counters.persist, 3);
    } finally { await f.close(); }
});

test('same-ID ordinary groups stay local to actual root child and readonly library views and reject captured stale callbacks', async () => {
    const f = await controllerFixture(3), before = structuredClone(f.root), signature = workflowSignature(f.root), rootKey = f.views.project().graphViews.tabs[0].key;
    try {
        const old = f.env.nativeGroupPresenter; open(f.real.host).click(); assert.equal(f.env.editorDraw.groups[groupId].collapsed, false);
        assert.equal(f.views.openInstance(['inspection']).ok, true); f.draw(); assert.equal(f.env.editorDraw.groups[groupId].collapsed, true); assert.equal(old(groupId, false), false); assert.equal(f.views.readEditor().view.groupPresentation, undefined);
        open(f.real.host).click(); assert.equal(f.env.editorDraw.groups[groupId].collapsed, false); assert.ok(f.real.host.querySelector('.pc-node[data-id="compose"] .pc-port[data-port="out"]'));
        const child = f.env.nativeGroupPresenter;
        assert.equal(f.views.openLibrary(f.ref).ok, true); f.draw(); assert.equal(f.views.readEditor().readOnly, true); assert.equal(f.env.editorDraw.groups[groupId].collapsed, true); assert.equal(child(groupId, false), false);
        open(f.real.host).click(); assert.equal(f.env.editorDraw.groups[groupId].collapsed, false, 'a readonly body still permits local presentation'); assert.ok(f.real.host.querySelector('.pc-node[data-id="compose"] .pc-port[data-port="out"]'));
        assert.equal(f.env.nativeGroupPresenter('missing', false), false); assert.equal(f.env.nativeGroupPresenter(groupId, 'false'), false); assert.equal(f.env.nativeGroupPresenter('constructor', false), false);
        f.views.focusView(rootKey); f.draw(); assert.equal(f.env.editorDraw.groups[groupId].collapsed, false); fold(f.real.host).click(); assert.equal(f.env.editorDraw.groups[groupId].collapsed, true);
        f.views.openInstance(['inspection']); f.draw(); assert.equal(f.env.editorDraw.groups[groupId].collapsed, false); f.views.openLibrary(f.ref); f.draw(); assert.equal(f.env.editorDraw.groups[groupId].collapsed, false);
        const persisted = f.views.serialize().data, restored = createGraphViewSession({ root: f.root, activationId: 'scope-reload', ...f.preparation, persisted }).data;
        assert.equal(restored.readEditor().readOnly, true); assert.equal(projectEditorDraw(restored.readEditor()).groups[groupId].collapsed, false); restored.focusView(rootKey); assert.equal(projectEditorDraw(restored.readEditor()).groups[groupId].collapsed, true);
        assert.deepEqual(f.root, before); assert.equal(workflowSignature(f.root), signature); assert.equal(f.counters.changes, 0); assert.equal(f.bindings(), 0);
    } finally { await f.close(); }
});

test('optional group presentation restores current version1 views and rejects malformed unbounded patches atomically', () => {
    const f = prepared(), saved = f.views.serialize().data; assert.ok(saved.views.every(view => !Object.hasOwn(view, 'groupPresentation')));
    const restored = createGraphViewSession({ root: f.root, activationId: 'current-restore', ...f.preparation, persisted: saved }).data; assert.ok(restored); const context = restored.captureEditorContext();
    assert.equal(restored.updateView({ groupPresentation: { [groupId]: { collapsed: false } } }).ok, true, 'new local presentation must be admitted by the actual store'); assert.equal(restored.isEditorContextCurrent(context), true);
    assert.equal(restored.updateView({ portalPresentation: { alias: { identity: { kind: 'root', workflowId: f.root.id }, source: { nodeId: 'reply-snapshot', portId: 'out' }, label: 'Local label' } } }).ok, true);
    const good = structuredClone(restored.serialize().data); assert.equal(createGraphViewSession({ root: f.root, activationId: 'both-fields', ...f.preparation, persisted: good }).ok, true);
    for (const value of [[], { '': { collapsed: true } }, { [groupId]: { collapsed: 'false' } }, { [groupId]: { collapsed: 1 } }, { [groupId]: { collapsed: false, enabled: false } }, { [groupId]: {} }, { ['x'.repeat(262144)]: { collapsed: false } }]) { assert.equal(restored.updateView({ groupPresentation: value }).ok, false); assert.deepEqual(restored.serialize().data, good); }
    const bad = structuredClone(good); bad.views[0].groupPresentation[groupId].collapsed = 'false'; const recovered = createGraphViewSession({ root: f.root, activationId: 'malformed', ...f.preparation, persisted: bad }).data; assert.equal(recovered.project().warnings.length, 1); assert.equal(recovered.readEditor().view.identity.kind, 'root'); assert.equal(recovered.readEditor().view.groupPresentation, undefined); assert.equal(recovered.readRoot(), f.root);
});

test('ordinary native folding does not cancel or replace a bounded target while it remains pending', async () => {
    const f = await controllerFixture(), before = structuredClone(f.root), counters = { host: 0, cancel: 0, requests: 0 }; let release, state;
    const message = { mes: 'We delve.', is_user: false, swipe_id: 0, swipes: ['We delve.'], swipe_info: [{ extra: {}, gen_started: 1, gen_finished: 2 }], extra: {}, gen_started: 1, gen_finished: 2 };
    const context = { chatId: 'fold-run', characterId: 1, groupId: null, chat: [{ mes: 'Hello', is_user: true }, message], extensionPrompts: {} };
    const host = createNativeWorkflowController({ context: () => { counters.host++; return context; }, getGraph: () => f.root, isEnabled: () => true, isBusy: () => false, resolveBinding: () => { throw new Error('Scan-only root does not bind'); }, request: async () => { counters.requests++; throw new Error('Scan-only root does not request'); } });
    const gate = new Promise(resolve => { release = resolve; });
    const runtime = { runTarget: async (root,target,options) => { await gate;return host.runTarget(root,target,options); }, cancel(reason) { counters.cancel++; host.cancel(reason); } };
    const session = createWorkflowSession({ runtime: () => runtime, rootCurrent: () => f.root, runEpoch: () => f.env.rootRunEpoch, active: () => true, changed(value) { state = value; } });
    try {
        const pending = session.run({target:{kind:'terminal',address:{workflowId:f.root.id,instancePath:[],nodeId:'apply-reply'}}}); assert.equal(state.busy, true); open(f.real.host).click(); fold(f.real.host).click(); assert.equal(state.busy, true); assert.equal(session.result(), null); assert.deepEqual(counters, { host: 0, cancel: 0, requests: 0 }); assert.equal(f.env.rootRunEpoch, 7); assert.deepEqual(f.root, before);
        release(); await pending; assert.equal(state.busy, false); assert.equal(session.result().ok, true, JSON.stringify(session.result().error)); assert.equal(session.result().recording.status, 'completed'); assert.equal(session.result().reviewHandles.length, 0); assert.equal(counters.cancel, 0); assert.equal(counters.requests, 0); assert.deepEqual(f.root, before);
    } finally { release(); await f.close(); }
});
test('folding preserves current private handle ownership through the actual session and preview adapter', async () => {
    for (const schema of [3]) {
        const f = await controllerFixture(schema,true), before = structuredClone(f.root), counters = { checks: 0, apply: 0, cancel: 0, requests: 0 };
        const message = { mes: 'We delve.', is_user: false, swipe_id: 0, swipes: ['We delve.'], swipe_info: [{ extra: {}, gen_started: 1, gen_finished: 2 }], extra: {}, gen_started: 1, gen_finished: 2 };
        const context = { chatId: 'fold-review-' + schema, characterId: 1, groupId: null, chat: [{ mes: 'Hello', is_user: true }, message], extensionPrompts: {}, saveChat: async () => {}, updateMessageBlock: async () => {}, swipe: { refresh: async () => {} } };
        context.characters=[{avatar:'other.png'},{avatar:'mara.png',data:{name:'Mara'}}];
        const native=nativeFixture(f.root,{context,request:async()=>{counters.requests++;throw Error('Scan-only review does not request');}}),host=native.controller;
        const runtime = { ...host, candidateStatus(candidate) { counters.checks++; return host.candidateStatus(candidate); }, apply(candidate) { counters.apply++; return host.apply(candidate); }, cancel(reason) { counters.cancel++; host.cancel(reason); } };
        Object.assign(f.env, { documentSession: { draftNamespace: () => 'native-group-document' }, workflowNodePresentations: new WeakMap(), workflowState: { result: null, reviewHandles: [], busy: false, availability: 'current', applyIssue: '' }, workspaceIssue: '', pinnedPreview: null, uiEpoch: 1, workflowLibrary: null, workflowInspector: null, workflowRuntime: { getNativeWorkflowController: () => runtime }, workflowProjection: null, workflowProjectionGraph: null, projectPreparedWorkflow, projectWorkspacePanels, settings: () => ({}), isWorkflowGraph: root => root?.mode?.startsWith('native-'), executableNative: root => root.schema === 2 && root.runtime === 1 || root.schema === 3 && root.runtime === 2, workbench: { update(value) { f.env.panels = value; } } });
        for (const name of ['previewAddress', 'effectivePreview', 'recallSetupView', 'samePreviewTerminal', 'currentRootPreviewTerminal', 'currentPreviewHandle', 'applyPreviewReview', 'rejectPreviewReview', 'workflowView', 'canCreateSubgraph', 'selectionMenuCapabilities', 'guideInsertionIsBusy', 'updateWorkflowProjection']) f.env[name] = controllerFunction(name, f.env);
        f.env.workflowSession = createWorkflowSession({ runtime: () => runtime, rootCurrent: () => f.root, runEpoch: () => f.env.rootRunEpoch, active: () => true, changed(value) {
            const changed = value.result !== f.env.workflowState.result || value.reviewHandles !== f.env.workflowState.reviewHandles; f.env.workflowState = value;
            if (changed) f.env.workspacePrepared.workflow = prepareWorkflowProjection(f.root, { ...(f.preparation.planner ? { planner: f.preparation.planner } : {}), result: value.result, candidateStatus: candidate => runtime.candidateStatus(candidate) });
            f.env.updateWorkflowProjection();
        } });
        try {
            await native.generate(f.root);f.env.workflowSession.receiveAutomatic(host.lastAutomaticResult());assert.equal(f.env.workflowSession.result().ok, true, JSON.stringify(f.env.workflowSession.result().error));
            const result = f.env.workflowSession.result(), recording = f.env.workflowState.recording, review = structuredClone(f.env.panels.outputPreview.review.selector), rootEpoch = f.env.rootRunEpoch, context = f.views.captureEditorContext(), viewEpoch = f.views.readEditContext().sessionId, calls = { ...counters };
            assert.equal(f.env.panels.outputPreview.review.canApply, true);
            open(f.real.host).click();
            assert.equal(f.env.editorDraw.groups[groupId].collapsed, false); assert.deepEqual(f.env.panels.outputPreview.review.selector, review); assert.equal(f.env.panels.outputPreview.review.canApply, true); assert.equal(f.views.isEditorContextCurrent(context), true); assert.equal(f.views.readEditContext().sessionId, viewEpoch);
            fold(f.real.host).click();
            assert.equal(f.env.editorDraw.groups[groupId].collapsed, true); assert.deepEqual(f.env.panels.outputPreview.review.selector, review); assert.equal(f.env.workflowSession.result(), result); assert.equal(f.env.workflowState.recording, recording); assert.equal(f.env.workflowState.availability, 'current'); assert.equal(f.env.rootRunEpoch, rootEpoch); assert.deepEqual(counters, calls); assert.deepEqual(f.root, before);
            assert.equal(f.env.currentPreviewHandle(review), true, 'the same genuine private ownership stays eligible');
            await f.env.applyPreviewReview(review); assert.equal(counters.apply, 1); assert.equal(message.swipes.length, 2); assert.ok(message.extra.latticeRevision); assert.equal(counters.cancel, 0); assert.equal(counters.requests, 0); assert.deepEqual(f.root, before);
        } finally { await f.close(); }
    }
});
