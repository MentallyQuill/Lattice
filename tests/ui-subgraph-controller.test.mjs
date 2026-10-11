import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { operationFor } from '../src/workflow/catalog.js?v=0.27.0';
import { isScopedSystemOperation } from '../src/workflow/system-capabilities.js?v=0.27.0';
import { isCommentFrame } from '../src/canvas/comment-frames.js?v=0.27.0';
import { prepareCreateFromSelection } from '../src/workflow/composition.js?v=0.27.0';
import { prepareOwnedDefinitionMetadataEdit } from '../src/workflow/definition-library.js?v=0.27.0';
import { prepareWorkspaceViews, prepareLibraryViews, projectEditorDraw } from '../src/ui/workspace-preparation.js?v=0.27.0';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.0';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js?v=0.27.0';
import { definitionRefKey } from '../src/workflow/definition-data.js?v=0.27.0';
import * as H from '../src/history.js?v=0.27.0';
import { captureRelocatedSubgraphViews, restoreSubgraphViews } from '../src/ui/subgraph-view-state.js?v=0.27.0';
import { showContextMenu } from '../src/ui/context-menu.js?v=0.27.0';
import { readNodePresentation } from '../src/ui/node-palette.js?v=0.27.0';
import { projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.27.0';
import { diagnosticText } from '../src/ui/diagnostics.js?v=0.27.0';

const source = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
function actual(name, env) {
    env.recallProjection ??= {nodes:{}}; env.recallSetupView ??= () => null;
    const start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'Actual controller function ' + name);
    const end = source.indexOf('\n}', start) + 2;
    return Function('env', 'with(env){' + source.slice(start, end) + ';return ' + name + ';}')(env);
}
let sequence = 0;
function fixture(mutator = null) {
    const graph = { id: 'subgraph-editor-' + ++sequence, schema: 3, runtime: 2, mode: 'native-unified', definitions: {}, groups: {}, portals: {}, roles: {}, nodes: {
        source: { id: 'source', type: 'workflow', operation: 'scene-context', x: 0, y: 40 },
        first: { id: 'first', type: 'workflow', operation: 'smart-compactor', method: 'select', x: 300, y: 40 },
        second: { id: 'second', type: 'workflow', operation: 'smart-compactor', method: 'select', x: 600, y: 40 },
        outside: { id: 'outside', type: 'workflow', operation: 'response-plan', x: 900, y: 40 },
    }, wires: {
        a: { id: 'a', route: 'wire', from: 'source', fromPort: 'out', to: 'first', toPort: 'in' },
        b: { id: 'b', route: 'wire', from: 'first', fromPort: 'out', to: 'second', toPort: 'in' },
        c: { id: 'c', route: 'wire', from: 'second', fromPort: 'out', to: 'outside', toPort: 'in' },
    } };
    mutator?.(graph);
    const prepared = prepareWorkspaceViews(graph); assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const session = createGraphViewSession({ root: graph, activationId: 'subgraph-' + sequence, ...prepared.data }).data;
    let commits = 0, fits = 0;
    const env = { current: graph, graphViews: session, workspacePrepared: prepared.data, workflowState: { busy: false }, pinnedPreview: null, selectedPreview: null, editorDraw: projectEditorDraw(session.readEditor()), editorCaptures: new WeakMap(), workspaceRevision: 0,
        workflowRuntime: { getNativeWorkflowController: () => null },
        isOpen: () => true, activeEditRoot: () => graph, readGraphEditContext: () => session.readEditContext(), captureGraphEditContext,
        prepareCreateFromSelection, prepareOwnedDefinitionMetadataEdit, definitionRefKey, crypto: globalThis.crypto,
        captureRelocatedSubgraphViews, restoreSubgraphViews, H, subgraphPresentationEffects: new WeakMap(), pendingSubgraphPresentation: new WeakMap(), viewIdentityKey: view => JSON.stringify(view),
        workbench: { update() {}, parts: { inspector: { querySelector: () => null } } },
        toast() {}, persistGraphViews() {}, requestAnimationFrame: callback => callback(),
        canvas: { multi: new Set(), selection: null, widthOf: node => node.w ?? 260, heightOf: () => 100,
            setMulti(ids) { this.multi = new Set(ids); },
            select(selection) { this.selection = selection; session.updateView({ selection: { primary: selection, multi: [...this.multi] } }); },
            fit() { fits++; }, cancelGesture() {} },
        graphDocumentHooks: {},
        commitGraphEdit(root, command) { const result = commitPreparedGraph(root, command); if (result.ok && result.data.changed) { commits++; refresh(); } return result; },
    };
    function refresh() {
        const next = prepareWorkspaceViews(graph); assert.equal(next.ok, true, JSON.stringify(next));
        assert.equal(session.replacePreparedViews(next.data).ok, true);
        env.editorDraw = projectEditorDraw(session.readEditor());
    }
    env.navigateGraphView = (action, ...args) => { assert.equal(session[action](...args).ok, true); refresh(); };
    env.activateEditorDraw = refresh;
    env.showSettings = selection => { env.canvas.select(selection); };
    for (const name of ['captureEditor', 'editorCurrent', 'scopeCommand', 'commitCaptured', 'detailCapture', 'commentDocumentState', 'queueSubgraphPresentation', 'createSubgraph', 'boundaryForNode', 'focusBoundaryLabel', 'editSubgraphInterface']) env[name] = actual(name, env);
    H.track(graph);
    const selection = nodeId => ({ selectionKey: JSON.stringify([session.readEditor().view.key, nodeId]), revision: session.readEditContext().sessionId + ':0', address: { workflowId: graph.id, instancePath: session.readEditor().view.identity.instancePath ?? [], nodeId } });
    return { graph, session, env, refresh, selection, commits: () => commits, fits: () => fits };
}

test('creation captures visible layout, rewires parent, selects wrapper and opens editable child in one undo step', () => {
    const f = fixture(), before = structuredClone(f.graph);
    f.session.updateView({ nodePresentation: { first: { x: 380, y: 140, alias: 'Keep recent', compact: true }, second: { x: 700, y: 180 } } }); f.refresh();
    const result = f.env.createSubgraph(['first', 'second'], 'Cleanup'); assert.equal(result.ok, true, JSON.stringify(result));
    const wrapper = Object.values(f.graph.nodes).find(node => node.type === 'subgraph'); assert.ok(wrapper);
    assert.equal(f.graph.wires.a.to, wrapper.id); assert.equal(f.graph.wires.c.from, wrapper.id); assert.equal(f.graph.wires.b, undefined);
    const child = f.session.readEditor(); assert.deepEqual(child.view.identity.instancePath, [wrapper.id]); assert.equal(child.readOnly, false);
    assert.equal(child.prepared.savedGraph.nodes.first.x, 380); assert.equal(child.prepared.savedGraph.nodes.first.profileId, undefined);
    assert.equal(child.view.nodePresentation.first.alias, 'Keep recent'); assert.equal(child.view.nodePresentation.first.compact, true);
    assert.equal(f.commits(), 1); assert.equal(f.fits(), 1);
    assert.ok(H.undo(f.graph)); f.refresh(); assert.deepEqual(f.graph, before);
    assert.equal(f.session.readEditor().view.identity.kind, 'root');
    assert.ok(H.redo(f.graph)); f.refresh();
    f.session.openInstance([wrapper.id]); f.refresh(); assert.equal(f.session.readEditor().readOnly, false);
    assert.equal(f.env.editorDraw.nodes.first.presentation.alias, 'Keep recent'); assert.equal(f.env.editorDraw.nodes.first.presentation.compact, true);
    const rootKey = f.session.project().graphViews.tabs[0].key; f.session.focusView(rootKey);
    assert.deepEqual(f.session.readEditor().view.selection.primary, { kind: 'node', id: wrapper.id });
});

test('creation carries the visible frame and collapse state of a selected group', () => {
    const f = fixture(); f.graph.nodes.first.inGroup = 'selected-group'; f.graph.nodes.second.inGroup = 'selected-group';
    f.graph.groups['selected-group'] = { id: 'selected-group', title: 'Cleanup group', collapsed: false, x: 280, y: 20, frame: { x: 280, y: 20, w: 600, h: 140 } }; f.refresh();
    f.session.updateView({ groupPresentation: { 'selected-group': { x: 320, y: 100, collapsed: true, frame: { x: 320, y: 100, w: 660, h: 180 } } } }); f.refresh();
    assert.equal(f.env.createSubgraph(['first', 'second']).ok, true);
    const group = Object.values(f.session.readEditor().prepared.savedGraph.groups)[0];
    assert.equal(group.x, 320); assert.equal(group.y, 100); assert.equal(group.collapsed, true);
    assert.deepEqual(group.frame, { x: 320, y: 100, w: 660, h: 180 });
});

test('boundary details update real interface labels and reject stale or unrelated ports', () => {
    const f = fixture(); assert.equal(f.env.createSubgraph(['first', 'second']).ok, true);
    const editor = f.session.readEditor(), port = editor.prepared.interface.find(port => port.direction === 'input');
    const captured = f.selection(port.boundaryNodeId);
    assert.equal(f.env.editSubgraphInterface(captured, { kind: 'update', id: port.id, label: 'Context to clean', artifactKind: port.kind, required: port.required }).ok, true);
    assert.equal(f.session.readEditor().prepared.interface.find(item => item.id === port.id).label, 'Context to clean');
    assert.equal(f.env.editSubgraphInterface(captured, { kind: 'remove', id: port.id }).ok, false);
    const current = f.session.readEditor(), other = current.prepared.interface.find(item => item.direction === 'output');
    assert.equal(f.env.editSubgraphInterface(f.selection(port.boundaryNodeId), { kind: 'update', id: other.id, label: 'Wrong port', artifactKind: other.kind, required: false }).ok, false);
});

function conversionMenu(f, nodeId) {
    const dom = new JSDOM('<main></main>'), document = dom.window.document;
    Object.assign(f.env, { document, window: dom.window, root: document.querySelector('main'), isCommentFrame, operationFor, isScopedSystemOperation,
        el(tag, cls, text) { const element = document.createElement(tag); if (cls) element.className = cls; if (text !== undefined) element.textContent = text; return element; },
        canCreateSubgraph: (...args) => actual('canCreateSubgraph', f.env)(...args),
        nodePreviewChoices: (...args) => actual('nodePreviewChoices', f.env)(...args),
        previewAddress: target => target?.kind === 'terminal' ? target.address : target, targetedPreview: null,
        canvasPreviewMenuItems: (...args) => actual('canvasPreviewMenuItems', f.env)(...args), showContextMenu, readNodePresentation, projectPreparedWorkflow, diagnosticText,
    });
    actual('onCanvasMenu', f.env)({ event: { clientX: 20, clientY: 20 }, node: f.env.editorDraw.nodes[nodeId], at: { x: 0, y: 0 } });
    const item = document.querySelector('[data-command="create-subgraph"]');
    assert.ok(item); return { item, close: () => dom.window.close() };
}

for (const mode of ['read', 'recall', 'commit']) test(`Memory ${mode} is offered for static subgraph extraction`, () => {
    const f = fixture(graph => Object.assign(graph, { mode: 'native-unified', wires: {}, nodes: {
        memory: { id: 'memory', type: 'workflow', operation: 'memory', operationVersion: 1, mode, ...(mode === 'commit' ? { idempotencyKey: 'extract-test' } : {}) },
    } }));
    const menu = conversionMenu(f, 'memory');
    assert.equal(menu.item.disabled, false); menu.close();
});

test('bare State is offered for static subgraph extraction with enclosing host memory', () => {
    const f = fixture(graph => Object.assign(graph, { wires: {}, nodes: { state: { id: 'state', type: 'workflow', operation: 'state', operationVersion: 1, mode: 'value' } } }));
    const menu = conversionMenu(f, 'state');
    assert.equal(menu.item.disabled, false); menu.close();
});

test('State with an explicit snapshot remains available for subgraph extraction', () => {
    const f = fixture(graph => Object.assign(graph, { nodes: {
        memory: { id: 'memory', type: 'workflow', operation: 'memory', operationVersion: 1, mode: 'read', view: 'state' },
        state: { id: 'state', type: 'workflow', operation: 'state', operationVersion: 1, mode: 'value' },
    }, wires: { snapshot: { id: 'snapshot', route: 'wire', from: 'memory', fromPort: 'out', to: 'state', toPort: 'state' } } }));
    const menu = conversionMenu(f, 'state');
    assert.equal(menu.item.disabled, false); menu.close();
    assert.equal(f.env.createSubgraph(['state'], 'Explicit State').ok, true);
    assert.equal(f.commits(), 1);
});

test('Add system starts from a pinned child, commits once to Main, and rejects changed origin before mutation',async()=>{
 const system=await import('../src/workflow/system-authoring.js');const views=await import('../src/ui/system-authoring-views.js');const {viewIdentityKey}=await import('../src/ui/view-state.js');
 const f=fixture(graph=>{graph.nodes.send={id:'send',type:'workflow',operation:'on-send'};graph.nodes.generate={id:'generate',type:'workflow',operation:'generate-reply'};graph.nodes.review={id:'review',type:'workflow',operation:'review-publish'};graph.wires.send={id:'send',route:'wire',from:'send',fromPort:'activation',to:'generate',toPort:'activation'};graph.wires.review={id:'review',route:'wire',from:'generate',fromPort:'draft',to:'review',toPort:'draft'};});
 const extracted=prepareCreateFromSelection(f.graph,{nodeIds:['first'],definitionId:'saved-helper',name:'Helper'});assert.equal(extracted.ok,true,JSON.stringify(extracted));const wrapper=extracted.data.candidate.nodes[extracted.data.instanceId],definition=extracted.data.candidate.definitions[definitionRefKey(wrapper.definition)];
 f.graph.definitions=structuredClone(extracted.data.candidate.definitions);f.graph.nodes.origin={...structuredClone(wrapper),id:'origin'};f.refresh();f.session.openInstance(['origin']);const before=structuredClone(f.graph);
 Object.assign(f.env,system,views,{viewIdentityKey,pendingAddSystem:null,libraryRevision:0,workspaceInputs:()=>({}),rootSystemWritable:()=>true,prepareWorkspaceViews,prepareLibraryViews,L:{getSubgraphShelfEntries:()=>({ok:true,data:[definition]}),loadSubgraphLibrary:()=>({ok:true,data:{definitions:f.graph.definitions}})},systemPresentationEffects:new WeakMap(),pendingSystemPresentation:new WeakMap()});
 for(const name of ['systemShelfCurrent','prepareSystemWorkspace','openAddSystem','previewAddSystem','submitAddSystem','handleSystemHistory','applyPendingSystemPresentation'])f.env[name]=actual(name,f.env);
 assert.equal(f.env.openAddSystem().ok,true);const key=f.env.pendingAddSystem.key,port=definition.interface.find(p=>p.direction==='input');const draft={choiceKey:definitionRefKey(definition),inputs:{[port.id]:{nodeId:'source',portId:'out'}},outputs:[],parameterOverrides:{}};
 assert.equal(f.env.previewAddSystem(key,draft).ok,true);assert.equal(f.env.submitAddSystem(key).ok,true);assert.equal(f.commits(),1);assert.equal(Object.values(f.graph.nodes).filter(n=>n.type==='subgraph').length,2);assert.notEqual(f.session.readEditor().view.identity.instancePath[0],'origin');
 const insertedId=f.session.readEditor().view.identity.instancePath[0];const stopHistory=H.onHistoryChange((graph,event)=>{if(graph===f.graph)f.env.handleSystemHistory(graph,event);});assert.ok(H.undo(f.graph));f.refresh();f.env.applyPendingSystemPresentation();assert.deepEqual(f.graph,before);assert.deepEqual(f.session.readEditor().view.identity.instancePath,['origin']);assert.ok(H.redo(f.graph));f.refresh();f.env.applyPendingSystemPresentation();assert.deepEqual(f.session.readEditor().view.identity.instancePath,[insertedId]);
 f.session.openInstance(['origin']);assert.equal(f.env.openAddSystem().ok,true);const pending=f.env.pendingAddSystem;assert.equal(f.env.previewAddSystem(pending.key,draft).ok,true);f.session.focusView(f.session.project().graphViews.tabs[0].key);const changed=structuredClone(f.graph);assert.equal(f.env.submitAddSystem(pending.key).ok,false);assert.deepEqual(f.graph,changed);assert.ok(before.nodes.origin);f.session.openInstance(['origin']);assert.equal(f.env.openAddSystem().ok,true);const libraryPending=f.env.pendingAddSystem;assert.equal(f.env.previewAddSystem(libraryPending.key,draft).ok,true);f.env.L.loadSubgraphLibrary=()=>({ok:true,data:{definitions:{}}});assert.equal(f.env.submitAddSystem(libraryPending.key).ok,false);assert.deepEqual(f.graph,changed);
});

for (const operation of ['read-file', 'write-file', 'story-clock', 'commit-clock', 'commit-outcomes']) test(operation + ' remains available for scoped system extraction', () => {
    const f = fixture(graph => Object.assign(graph, { mode: 'native-unified', wires: {}, nodes: { scoped: { id: 'scoped', type: 'workflow', operation, operationVersion: 1 } } }));
    const menu = conversionMenu(f, 'scoped');
    try { assert.equal(menu.item.disabled, false); } finally { menu.close(); }
    const result = f.env.createSubgraph(['scoped'], 'Scoped system');
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(f.commits(), 1);
});

test('Generate Reply can be wrapped with its preparation nodes and opens an editable subgraph', () => {
    const f = fixture(graph => {
        graph.nodes.send = { id: 'send', type: 'workflow', operation: 'on-send', x: 0, y: 0 };
        graph.nodes.generate = { id: 'generate', type: 'workflow', operation: 'generate-reply', x: 1200, y: 40 };
        graph.nodes.review = { id: 'review', type: 'workflow', operation: 'review-publish', x: 1500, y: 40 };
        graph.wires.activation = { id: 'activation', route: 'wire', from: 'send', fromPort: 'activation', to: 'generate', toPort: 'activation' };
        graph.wires.guidance = { id: 'guidance', route: 'wire', from: 'outside', fromPort: 'out', to: 'generate', toPort: 'guidance' };
        graph.wires.reply = { id: 'reply', route: 'wire', from: 'generate', fromPort: 'draft', to: 'review', toPort: 'draft' };
    });
    const before = structuredClone(f.graph);
    f.env.canvas.setMulti(['first', 'second', 'outside', 'generate']);
    const menu = conversionMenu(f, 'generate');
    try { assert.equal(menu.item.disabled, false); } finally { menu.close(); }
    const result = f.env.createSubgraph(['first', 'second', 'outside', 'generate'], 'Generate the reply');
    assert.equal(result.ok, true, JSON.stringify(result.error));
    const editor = f.session.readEditor();
    assert.equal(editor.readOnly, false);
    assert.equal(editor.prepared.savedGraph.nodes.generate.operation, 'generate-reply');
    assert.equal(f.commits(), 1);
    assert.ok(H.undo(f.graph));
    f.refresh();
    assert.deepEqual(f.graph, before);
});
