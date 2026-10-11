import test from 'node:test';
import assert from 'node:assert/strict';
import { starterGraph } from '../src/workflow/starters.js?v=0.26.0';
import { cloneWorkflowDocument } from '../src/workflow/document.js?v=0.26.0';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.26.0';
import { createWorkflowSession, projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.26.0';
import { makeClip, makeDefinitionClip, readClip } from '../src/workflow/clipboard.js?v=0.26.0';
import { isCommentFrame } from '../src/canvas/comment-frames.js?v=0.26.0';
import { prepareSubgraphNodeDeletion } from '../src/workflow/subgraph-authoring.js?v=0.26.0';
const api = await import('../src/ui/workspace-preparation.js?v=0.26.0');

test('copied explicit null blockers project as blocked and choosing inheritance restores the parent role', async () => {
    const { effectiveInstanceWorkflow } = await import('./fixtures/workflow-effective-instance.mjs');
    const { makeLocalCopy, prepareNativeNodeEdit } = await import('../src/workflow/definition-library.js?v=0.26.0');
    const { definitionRefKey } = await import('../src/workflow/definitions.js?v=0.26.0');
    const { inspectExpandedGraph } = await import('../src/workflow/graph-validation.js?v=0.26.0');
    const source = effectiveInstanceWorkflow(); source.nodes.one.nodeBindingOverrides = { '[[],"compact"]': { model: null } };
    const root = makeLocalCopy(source, { instancePath: ['one'], id: 'projected-private', materializeOverrides: true }).data.candidate;
    const prepared = api.prepareWorkspaceViews(root); assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const session = createGraphViewSession({ root, activationId: 'blocked-binding', ...prepared.data }).data;
    session.openInstance(['one']); session.updateView({ selection: { primary: { kind: 'node', id: 'compact' }, multi: [] } });
    const workflow = projectPreparedWorkflow(prepared.data.workflow, { viewPath: ['one'], selectedId: 'compact' });
    const details = api.projectWorkspacePanels(session.readEditor(), workflow, {}, 'blocked', null, null).nodeDetails;
    assert.equal(details.model.model.mode, 'block');
    assert.deepEqual(details.model.model.allowedModes.map(option => option.value), ['inherit', 'override', 'block']);
    assert.equal(details.model.profile.mode, 'inherit', 'An absent profile is not a blocker');
    const saved = root.definitions[definitionRefKey(root.nodes.one.definition)];
    const result = prepareNativeNodeEdit(root, { kind: 'binding', viewPath: ['one'], expectedRef: root.nodes.one.definition, nodeId: 'compact', field: 'model', mode: 'remove', consumeOverride: true });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(inspectExpandedGraph(result.data.candidate).data.primitives.find(unit => unit.address.instancePath[0] === 'one' && unit.address.nodeId === 'compact').node.model, 'parent-model');
    assert.equal(saved.body.nodes.compact.model, null, 'Projection and detached edits preserve the source snapshot');
});

test('saved wrapper names give repeated subgraph instances separate tabs and matching parent cards', async () => {
    const { siblingWorkflow } = await import('./fixtures/workflow-prepared-fixture.mjs');
    const { nodeCard } = await import('../src/canvas/presentation.js');
    const root = siblingWorkflow();
    root.name = 'Composition';
    root.nodes['first/path'].title = 'Renamed instance';
    root.nodes.second.alias = 'Sibling alias';
    let bindings = 0;
    const prepared = api.prepareWorkspaceViews(root, { resolveBinding: () => { bindings++; return { ok: true, data: {} }; } });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.deepEqual(prepared.data.navigation.map(entry => entry.label), ['Renamed instance', 'Sibling alias']);
    const session = createGraphViewSession({ root, activationId: 'instance-labels', ...prepared.data }).data;
    const drawing = api.projectEditorDraw(session.readEditor());
    assert.equal(nodeCard(drawing.nodes['first/path'], { graph: drawing }).title, 'Renamed instance');
    assert.equal(nodeCard(drawing.nodes.second, { graph: drawing }).title, 'Sibling alias');
    assert.equal(session.openInstance(['first/path']).ok, true);
    assert.deepEqual(session.readEditor().view.breadcrumbs.map(crumb => crumb.label), ['Composition', 'Renamed instance']);
    assert.equal(session.openInstance(['second']).ok, true);
    assert.deepEqual(session.project().graphViews.tabs.map(tab => tab.label), ['Composition', 'Renamed instance', 'Sibling alias']);
    const before = bindings, token = session.captureEditorContext();
    root.name = 'Renamed composition';
    assert.equal(session.replacePreparedViews(prepared.data, { invalidateEditor: false }).ok, true);
    assert.equal(session.project().graphViews.tabs[0].label, 'Renamed composition');
    assert.equal(session.isEditorContextCurrent(token), true);
    assert.equal(bindings, before, 'A root label refresh reuses prepared views without binding reads');
});

test('saved subgraph presentation aliases precede title and definition labels', async () => {
    const { siblingWorkflow } = await import('./fixtures/workflow-prepared-fixture.mjs');
    const root = siblingWorkflow();
    root.nodes['first/path'].title = 'Title';
    root.nodes['first/path'].alias = 'Legacy alias';
    root.nodes['first/path'].presentation = { alias: 'Current alias' };
    root.nodes.second.title = 'Second title';
    root.nodes.second.presentation = { alias: '' };
    const prepared = api.prepareWorkspaceViews(root);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.deepEqual(prepared.data.navigation.map(entry => entry.label), ['Current alias', 'Second title']);
    assert.equal(Object.values(root.definitions)[0].name, 'Plan', 'Instance names do not rename their shared definition');
});

test('long saved wrapper titles retain a navigable bounded subgraph tab', async () => {
    const { siblingWorkflow } = await import('./fixtures/workflow-prepared-fixture.mjs');
    const root = siblingWorkflow();
    root.nodes['first/path'].title = 'x'.repeat(300);
    const prepared = api.prepareWorkspaceViews(root);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const created = createGraphViewSession({ root, activationId: 'long-instance-label', ...prepared.data });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.data.openInstance(['first/path']).ok, true);
    assert.equal(created.data.readEditor().view.label, 'x'.repeat(256));
    assert.equal(root.nodes['first/path'].title, 'x'.repeat(300), 'The display bound preserves the saved title');
});

test('prepared editor drawing is detached and overlays never change the activated root', async () => {
    assert.equal(typeof api.prepareWorkspaceViews, 'function');
    const root = cloneWorkflowDocument(starterGraph('native-guidance')).data; root.id = 'workspace-root';
    let bindings = 0;
    const prepared = api.prepareWorkspaceViews(root, { resolveBinding: () => { bindings++; return { ok: true, data: { profileId: 'cached', model: 'cached-model' } }; } });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const count = bindings, before = structuredClone(root);
    const views = createGraphViewSession({ root, activationId: 'active', ...prepared.data }).data;
    views.updateView({ camera: { x: 99, y: 88, zoom: 1.5 }, nodePresentation: { 'response-plan': { alias: 'Plan', compact: true, x: 17, y: 18 } } });
    const drawing = api.projectEditorDraw(views.readEditor());
    assert.equal(drawing.id,root.id);assert.deepEqual(drawing.view, { x: 99, y: 88, zoom: 1.5 }); assert.equal(drawing.nodes['response-plan'].presentation.alias, 'Plan');
    drawing.nodes['response-plan'].instructions = 'draw graph is never a draft';
    assert.deepEqual(root, before); assert.equal(bindings, count);
    const view = projectPreparedWorkflow(prepared.data.workflow, { selectedId: 'response-plan' }); assert.equal(view.nodes.find(n => n.id === 'response-plan').effective, 'cached · cached-model'); assert.equal(bindings, count);
    let settle, cancelled = 0, state;
    const runtime = { runPre: async actual => { assert.equal(actual, root); return new Promise(resolve => { settle = resolve; }); }, cancel: () => { cancelled++; } };
    const execution = createWorkflowSession({ runtime: () => runtime, rootCurrent: () => root, runEpoch: () => 7, active: () => true, changed: next => { state = next; } });
    const running = execution.run();
    views.updateView({ camera: { x: 1, y: 2, zoom: 0.7 } }); views.focusView(views.project().graphViews.active.key);
    const { resolveWorkflow } = await import('../src/workflow/resolve.js');
    const { parseRunPlan } = await import('../src/workflow/record-data.js');
    const { createRunRecorder } = await import('../src/workflow/recording.js');
    const recorder = createRunRecorder({ runId: 'view-independent' });
    recorder.accept({ runId: 'view-independent', seq: 1, at: 1, elapsedMs: 0, type: 'plan', plan: parseRunPlan(resolveWorkflow(root).data) });
    recorder.accept({ runId: 'view-independent', seq: 2, at: 2, elapsedMs: 1, type: 'run-settled', status: 'completed' });
    settle({ ok: true, schema: 3, runtime: 2, mode: 'root', runId: 'view-independent', actualCalls: 0, recording: recorder.finish(), reviewHandles: [] }); await running;
    assert.equal(state.result.ok, true); assert.equal(state.busy, false); assert.equal(cancelled, 0); assert.equal(bindings, count);
});

test('library inspection uses a real definition inventory and exposes no runtime addresses', async () => {
    assert.equal(typeof api.prepareLibraryViews, 'function');
    const { nestedWorkflow } = await import('./fixtures/workflow-prepared-fixture.mjs');
    const root = nestedWorkflow(), before = structuredClone(root), definitions = root.definitions;
    const result = api.prepareLibraryViews(root.id, definitions); assert.equal(result.ok,true,JSON.stringify(result));
    for (const view of result.data.preparedViews) { assert.equal(view.identity.kind,'library');assert.equal(view.readOnly,true);assert.deepEqual(view.identity.definitionRef,view.definitionRef);assert.equal(view.savedGraph.id,undefined);assert.ok(view.ports.every(port=>!Object.hasOwn(port,'address'))); }
    const outer = result.data.preparedViews.find(view=>view.definitionRef.id==='prepared-outer');
    assert.ok(outer.drawBase.nativeCards.entry.ports.some(port=>port.kind==='context'));
    assert.ok(outer.drawBase.nativeCards.work.ports.some(port=>port.port==='proposal'));
    const nested = result.data.preparedViews.find(view=>view.definitionRef.id==='prepared-plan');assert.ok(nested);
    assert.deepEqual(root,before);
});

test('not-run meter uses cached checked root rows before events without a second planner or host read',()=>{
 const root=cloneWorkflowDocument(starterGraph('structured-guidance')).data;root.id='idle-root';let bindings=0;const prepared=api.prepareWorkspaceViews(root,{resolveBinding:()=>{bindings++;return {ok:true,data:{}};}});assert.equal(prepared.ok,true);const count=bindings;
 assert.ok(prepared.data.idleRunRows.length>0);assert.ok(prepared.data.idleRunRows.every(row=>row.status==='not-run'));assert.equal(prepared.data.idleRunRows.reduce((sum,row)=>sum+row.executableCount,0),Object.values(root.nodes).length);assert.equal(bindings,count);
});


// Execute the actual bounded controller functions, with real accepted Canvas/store/domain APIs.
// Only external UI notifications are replaced; the function bodies are read from current source.
const controllerText=await(await import('node:fs/promises')).readFile(new URL('../src/ui/controller.js',import.meta.url),'utf8');
function controllerFunction(name,env){env.activeEditRoot ??= () => env.current;env.isCommentFrame ??= isCommentFrame;env.prepareSubgraphNodeDeletion ??= prepareSubgraphNodeDeletion;env.pendingCommentPresentation ??= new WeakMap();env.pendingSubgraphPresentation ??= new WeakMap();if(name!=='applyPendingCommentPresentation')env.applyPendingCommentPresentation ??= controllerFunction('applyPendingCommentPresentation',env);if(name==='activateEditorDraw')env.applyPendingSubgraphPresentation ??= controllerFunction('applyPendingSubgraphPresentation',env);const start=controllerText.indexOf('function '+name+'(');assert.ok(start>=0,'Actual controller function '+name);const next=controllerText.indexOf('\nfunction ',start+1);const source=(controllerText.slice(start-6,start)==='async '?'async ':'')+controllerText.slice(start,next<0?undefined:next);return Function('env','with(env){'+source+';return '+name+';}')(env);}
async function restoreFixture(){
 const {siblingWorkflow}=await import('./fixtures/workflow-prepared-fixture.mjs');const root=siblingWorkflow(),prepared=api.prepareWorkspaceViews(root),session=createGraphViewSession({root,activationId:'restore',...prepared.data}).data;const env={current:root,graphViews:session,editorDraw:null,selected:null,selectedKind:null,restoringEditor:false,selectedPreview:null,canvasTraceRows:null,cancelConfiguredNode(){},cancelImportReview(){},replaceNativeBridge(){},syncPaneToggles(){},updateWorkflowProjection(){},paintHistory(){},workbench:{update(){}}};
 const {fixture}=await import('./canvas-fixture.mjs');const real=fixture({nativeCard:node=>env.editorDraw?.nativeCards[node.id],nativeScope:()=>({workflowId:root.id,instancePath:session.readEditor().view.identity.instancePath??[],readOnly:session.readEditor().readOnly}),canEdit:()=>!session.readEditor().readOnly});env.canvas=real.canvas;env.root=document.createElement('div');env.projectEditorDraw=api.projectEditorDraw;const restore=controllerFunction('activateEditorDraw',env);env.activate=()=>{restore();for(const node of Object.values(env.editorDraw.nodes))real.canvas.geometry.measure(node.id,160,48,env.editorDraw.nativeCards[node.id]?.ports.map(pin=>({id:pin.port,direction:pin.dir,x:pin.dir==='in'?0:160,y:24,side:pin.side,kind:pin.kind}))??[]);real.canvas.render();};return {...env,env,session,real};
}
test('actual controller roundtrip preserves primary node wire and supported ephemeral cable paint',async()=>{
 const {env,session,real}=await restoreFixture();try{
 session.updateView({selection:{primary:{kind:'node',id:'source'},multi:[]}});env.activate();assert.deepEqual(real.canvas.selection,{kind:'node',id:'source'});assert.ok(real.host.querySelector('.pc-node[data-id="source"]').classList.contains('pc-selected'));
 session.openInstance(['first/path']);env.activate();session.focusView(session.project().graphViews.tabs[0].key);env.activate();assert.deepEqual(real.canvas.selection,{kind:'node',id:'source'});assert.deepEqual(session.readEditor().view.selection.primary,real.canvas.selection);
 session.updateView({selection:{primary:{kind:'wire',id:'a'},multi:[]}});env.activate();real.canvas.wireMulti.add('b');real.canvas.render();session.openInstance(['first/path']);env.activate();session.focusView(session.project().graphViews.tabs[0].key);env.activate();assert.deepEqual(real.canvas.selection,{kind:'wire',id:'a'});assert.deepEqual([...real.canvas.wireMulti].sort(),['a','b']);assert.deepEqual([...real.host.querySelectorAll('.pc-wire.pc-selected')].map(edge=>edge.dataset.id).sort(),['a','b']);
 }finally{await real.canvas.destroy();real.host.remove();}
});

test('Edit availability uses the actual child saved scope and readonly library permission',async()=>{
 const {siblingWorkflow}=await import('./fixtures/workflow-prepared-fixture.mjs');const root=siblingWorkflow(),saved=structuredClone(Object.values(root.definitions)[0].body);let readOnly=false,last;const canvas={selection:{kind:'node',id:'work'},multi:new Set()},env={current:root,canvas,currentPick:()=>({nodeIds:['work']}),groupMembers:(graph,id)=>Object.values(graph.nodes).filter(node=>node.inGroup===id),graphViews:{readEditor:()=>({prepared:{savedGraph:saved},readOnly,view:{identity:{kind:'instance'}}})},editorDraw:saved,workbench:{update(value){last=value;}}};const update=controllerFunction('updateSelectionCount',env);update();assert.deepEqual(last.selectionActions,{copy:true,cut:true,delete:true});
 root.nodes.entry={id:'entry',type:'workflow',operation:'scene-context'};canvas.selection={kind:'node',id:'entry'};env.currentPick=()=>({nodeIds:['entry']});update();assert.deepEqual(last.selectionActions,{copy:false,cut:false,delete:true},'The actual child boundary can be deleted without copying it as an ordinary node');
 root.nodes.rootOnly={id:'rootOnly',type:'workflow',operation:'scene-context'};canvas.selection={kind:'node',id:'rootOnly'};env.currentPick=()=>({nodeIds:['rootOnly']});update();assert.deepEqual(last.selectionActions,{copy:false,cut:false,delete:false},'A root-only node is absent from the actual child scope');
 canvas.selection={kind:'wire',id:'a'};env.currentPick=()=>null;update();assert.equal(last.selectionActions.delete,true);saved.groups={child:{id:'child'}};canvas.selection={kind:'group',id:'child'};update();assert.equal(last.selectionActions.delete,true);
 readOnly=true;canvas.selection={kind:'node',id:'entry'};env.currentPick=()=>({nodeIds:['entry']});update();assert.deepEqual(last.selectionActions,{copy:false,cut:false,delete:false});canvas.selection={kind:'node',id:'work'};env.currentPick=()=>({nodeIds:['work']});update();assert.deepEqual(last.selectionActions,{copy:true,cut:false,delete:false});
});

test('nested library Copy bundles only its real reachable pin closure and actual insertion accepts it',async()=>{
 const {nestedWorkflow}=await import('./fixtures/workflow-prepared-fixture.mjs');const source=nestedWorkflow(),root=starterGraph('structured-guidance'),content=api.prepareWorkspaceViews(root),library=api.prepareLibraryViews(root.id,source.definitions);const session=createGraphViewSession({root,activationId:'library-copy',navigation:[...content.data.navigation,...library.data.navigation],preparedViews:[...content.data.preparedViews,...library.data.preparedViews]}).data;session.openLibrary(library.data.preparedViews.find(view=>view.definitionRef.id==='prepared-outer').definitionRef);const {definitionRefKey}=await import('../src/workflow/definition-data.js?v=0.26.0'),{prepareWorkflowInsertion}=await import('../src/workflow/insertion.js?v=0.26.0');const env={current:root,graphViews:session,editorDraw:api.projectEditorDraw(session.readEditor()),workspacePrepared:{libraryDefinitions:source.definitions},makeClip,makeDefinitionClip,readClip,definitionRefKey};const copied=controllerFunction('clipForPick',env)({nodeIds:['work']});assert.equal(copied.ok,true,JSON.stringify(copied));const fragment=copied.data.graph;assert.equal(Object.keys(fragment.definitions).length,1);assert.ok(fragment.definitions[definitionRefKey(fragment.nodes.work.definition)]);assert.equal(fragment.nodes.work.localCopy,undefined);assert.deepEqual(root.definitions,{});const inserted=prepareWorkflowInsertion(root,fragment);assert.equal(inserted.ok,true,JSON.stringify(inserted));const conflict=structuredClone(root);conflict.definitions[definitionRefKey(fragment.nodes.work.definition)]={...fragment.definitions[definitionRefKey(fragment.nodes.work.definition)],body:{...fragment.definitions[definitionRefKey(fragment.nodes.work.definition)].body,nodes:{...fragment.definitions[definitionRefKey(fragment.nodes.work.definition)].body.nodes,work:{...fragment.definitions[definitionRefKey(fragment.nodes.work.definition)].body.nodes.work,instructions:'Conflicting canonical settings'}}}};assert.equal(prepareWorkflowInsertion(conflict,fragment).ok,false);
});

test('native Cut waits for a successful write and rejects failure or a stale qualified continuation',async()=>{
    let deletes = 0, notes = [], toasts = [], resolveWrite, current = true;
    const envelope = makeClip(starterGraph('structured-guidance'), { nodeIds: ['compose-json'] });
    const prior = makeClip(starterGraph('structured-guidance'), { nodeIds: ['compose-guidance'] });
    assert.equal(envelope.ok, true); assert.equal(prior.ok, true);
    const older = JSON.stringify(prior.data); let clipboard = older;
    const env = { graphViews: {}, detachedClip: null, currentPick: () => ({ nodeIds: ['compose-json'] }), clipForPick: () => envelope,
        captureEditor: () => ({ ok: true, data: { captured: true } }), editorCurrent: () => current,
        deleteNativeSelection: async (selection, capture) => { assert.ok(capture?.captured, 'Deletion must retain the pre-write qualified token'); assert.deepEqual(selection, { kind: 'nodes', ids: ['compose-json'], groupIds: [] }); deletes++; return true; },
        flashHistoryNote: note => notes.push(note), toast: message => toasts.push(message) };
    const copy = controllerFunction('copySelection', env);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('denied'); }, readText: async () => clipboard } } });
    assert.equal(await copy(true), false); assert.equal(deletes, 0); assert.equal(notes.length, 0); assert.ok(toasts[0].includes('not cut')); assert.equal(await navigator.clipboard.readText(), older);
    navigator.clipboard.writeText = () => new Promise(resolve => { resolveWrite = resolve; });
    const pending = copy(true); await Promise.resolve(); assert.equal(deletes, 0); current = false; resolveWrite(); assert.equal(await pending, false); assert.equal(deletes, 0);
    current = true; navigator.clipboard.writeText = async text => { clipboard = text; };
    assert.equal(await copy(true), true); assert.equal(deletes, 1); assert.ok(notes[0].startsWith('Cut ')); assert.equal(readClip(clipboard).ok, true);
    navigator.clipboard.writeText = async () => { throw new Error('rejected'); }; assert.equal(await copy(true), false); assert.equal(deletes, 1);
});

test('actual Copy preserves selected local node and group presentation in current portable fields', async () => {
    const root = starterGraph('structured-guidance');
    root.groups.selected = { id: 'selected', title: 'Selected', members: ['compose-json'], x: 1, y: 2, collapsed: true, frame: { x: 1, y: 2, w: 300, h: 100 } };
    root.nodes['compose-json'].inGroup = 'selected';
    const before = structuredClone(root), prepared = api.prepareWorkspaceViews(root);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const session = createGraphViewSession({ root, activationId: 'copy-presentation', ...prepared.data }).data;
    const frame = { x: 55, y: 66, w: 310, h: 120 };
    assert.equal(session.updateView({ nodePresentation: { 'compose-json': { alias: '雪 Alias', compact: true, x: 17, y: 18 } }, groupPresentation: { selected: { x: 55, y: 66, frame } } }).ok, true);
    const env = { current: root, graphViews: session, editorDraw: api.projectEditorDraw(session.readEditor()), makeClip, makeDefinitionClip, readClip };
    const copied = controllerFunction('clipForPick', env)({ groupIds: ['selected'] });
    assert.equal(copied.ok, true, JSON.stringify(copied));
    const node = copied.data.graph.nodes['compose-json'], group = copied.data.graph.groups.selected;
    assert.equal(node.alias, '雪 Alias'); assert.equal(node.compact, true);
    assert.deepEqual({ x: node.x, y: node.y }, { x: 17, y: 18 });
    assert.deepEqual({ x: group.x, y: group.y, frame: group.frame }, { x: 55, y: 66, frame });
    assert.deepEqual(root, before);
});

test('immediate group Cut removes its authored enclosure and ordinary nodes in one captured undoable edit', async () => {
    const { captureGraphEditContext, commitPreparedGraph } = await import('../src/workflow/transactions.js?v=0.26.0');
    const { prepareQualifiedScopeEdit, reconcileOwners } = await import('../src/workflow/definition-library.js?v=0.26.0');
    const { ownershipEntries, prunePrivateSnapshots } = await import('../src/workflow/composition-edit.js?v=0.26.0');
    const H = await import('../src/history.js?v=0.26.0');
    const root = starterGraph('structured-guidance'); root.id = 'captured-group-cut';
    root.groups.cut = { id: 'cut', title: 'Cut group', collapsed: true };
    for (const id of ['compose-json', 'json-decode']) root.nodes[id].inGroup = 'cut';
    root.groups.keep = { id: 'keep', title: 'Keep empty enclosure', collapsed: false };
    const prepared = api.prepareWorkspaceViews(root); assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const session = createGraphViewSession({ root, activationId: 'group-cut', ...prepared.data }).data;
    const before = structuredClone(root), issues = []; let writes = 0, confirmations = 0, commits = 0;
    const env = { current: root, graphViews: session, workspaceRevision: 0, editorCaptures: new WeakMap(), editorDraw: api.projectEditorDraw(session.readEditor()),
        selected: root.groups.cut, selectedKind: 'group', detachedClip: null, isOpen: () => true, readGraphEditContext: () => session.readEditContext(),
        canvas: { multi: new Set() }, makeClip, makeDefinitionClip, readClip, captureGraphEditContext, prepareQualifiedScopeEdit, reconcileOwners, ownershipEntries, prunePrivateSnapshots, graphDocumentHooks: {}, toast(message) { issues.push(message); }, flashHistoryNote() {},
        okToDelete: async () => { confirmations++; assert.fail('Selected edits must not open confirmation'); }, commitGraphEdit(graph, command) { commits++; return commitPreparedGraph(graph, command); } };
    for (const name of ['captureEditor', 'editorCurrent', 'scopeCommand', 'commitCaptured', 'currentPick', 'clipForPick', 'deleteNativeSelection']) env[name] = controllerFunction(name, env);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async text => { writes++; assert.equal(readClip(text).ok, true); } } } });
    H.track(root);
    assert.equal(await controllerFunction('copySelection', env)(true), true, JSON.stringify(issues));
    assert.equal(writes, 1); assert.equal(confirmations, 0); assert.equal(commits, 1);
    assert.equal(root.groups.cut, undefined); assert.ok(root.groups.keep);
    assert.equal(root.nodes['compose-json'], undefined); assert.equal(root.nodes['json-decode'], undefined);
    assert.ok(H.undo(root)); assert.deepEqual(root, before); assert.equal(H.undo(root), null);
});

for (const nested of [false, true]) for (const cut of [false, true]) test(`actual ${nested ? 'nested' : 'root'} owned wrapper ${cut ? 'Cut' : 'Delete'} reconciles descendant ownership and private snapshots with one undo`, async () => {
    const fixtures = await import('./fixtures/workflow-prepared-fixture.mjs');
    const { captureGraphEditContext, commitPreparedGraph } = await import('../src/workflow/transactions.js?v=0.26.0');
    const { makeLocalCopy, prepareQualifiedScopeEdit, reconcileOwners } = await import('../src/workflow/definition-library.js?v=0.26.0');
    const { ownershipEntries, prunePrivateSnapshots } = await import('../src/workflow/composition-edit.js?v=0.26.0');
    const H = await import('../src/history.js?v=0.26.0');
    const path = nested ? ['first/path', 'work'] : ['first/path'], preparedCopy = makeLocalCopy(fixtures.nestedWorkflow(), {instancePath:['first/path','work'],id:'private-deletion-review'});
    assert.equal(preparedCopy.ok,true,JSON.stringify(preparedCopy));
    const root = preparedCopy.data.candidate; root.id = `owned-${nested ? 'nested' : 'root'}-${cut ? 'cut' : 'delete'}`;
    const before = structuredClone(root), privateIds = new Set(ownershipEntries(root).map(owner=>owner.definitionId));
    const prepared = api.prepareWorkspaceViews(root); assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const session = createGraphViewSession({root,activationId:root.id,...prepared.data}).data;
    if (nested) assert.equal(session.openInstance(['first/path']).ok,true);
    const id = path.at(-1), issues = []; let commits = 0, confirmations = 0, writes = 0;
    const env = {current:root,graphViews:session,workspaceRevision:0,editorCaptures:new WeakMap(),editorDraw:api.projectEditorDraw(session.readEditor()),
        selected:null,selectedKind:'node',detachedClip:null,isOpen:()=>true,readGraphEditContext:()=>session.readEditContext(),canvas:{multi:new Set()},
        makeClip,makeDefinitionClip,readClip,captureGraphEditContext,prepareQualifiedScopeEdit,reconcileOwners,ownershipEntries,prunePrivateSnapshots,graphDocumentHooks:{},toast:message=>issues.push(message),flashHistoryNote(){},
        okToDelete:async()=>{confirmations++;assert.fail('Selected edits must not open confirmation');},commitGraphEdit(graph,command){commits++;return commitPreparedGraph(graph,command);} };
    env.selected=env.editorDraw.nodes[id]; assert.equal(session.readEditor().readOnly,false);
    for (const name of ['captureEditor','editorCurrent','scopeCommand','commitCaptured','currentPick','clipForPick','deleteNativeSelection']) env[name]=controllerFunction(name,env);
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>{writes++;assert.equal(readClip(text).ok,true);}}}});
    H.track(root);
    const deleted = cut ? await controllerFunction('copySelection',env)(true) : await env.deleteNativeSelection({kind:'node',id});
    assert.equal(deleted,true,JSON.stringify(issues));assert.equal(confirmations,0);assert.equal(commits,1);assert.equal(writes,cut?1:0);
    const refreshed=api.prepareWorkspaceViews(root);assert.equal(refreshed.ok,true,JSON.stringify(refreshed));
    const scope=refreshed.data.preparedViews.find(view=>nested?view.identity.kind==='instance'&&JSON.stringify(view.identity.instancePath)==='["first/path"]':view.identity.kind==='root').savedGraph;
    assert.equal(scope.nodes[id],undefined);
    assert.ok((root.localDefinitionOwners??[]).every(owner=>!path.every((part,index)=>owner.instancePath[index]===part)));
    assert.ok(!Object.values(root.definitions).some(definition=>definition.id==='private-deletion-review'));
    if (!nested) assert.ok(!Object.values(root.definitions).some(definition=>privateIds.has(definition.id)));
    assert.deepEqual(root.nodes.second,before.nodes.second,'The unowned sibling pin is preserved');
    assert.ok(H.undo(root));assert.deepEqual(root,before);assert.equal(H.undo(root),null);
});

test('actual captured visual grouping keeps membership consistent, preserves execution and makes one history step', async () => {
    const { captureGraphEditContext, commitPreparedGraph } = await import('../src/workflow/transactions.js');
    const { prepareQualifiedScopeEdit } = await import('../src/workflow/definition-library.js');
    const { workflowSignature } = await import('../src/workflow/runtime.js');
    const H = await import('../src/history.js?v=0.26.0');
    const root = starterGraph('structured-guidance'), ids = ['compose-json', 'json-decode'];
    root.id = 'group-edit-history';
    root.groups.previous = { id: 'previous', title: 'Previous', members: ['compose-json', 'select-fields'], collapsed: false };
    root.nodes['compose-json'].inGroup = 'previous'; root.nodes['select-fields'].inGroup = 'previous';
    const before = structuredClone(root), signature = workflowSignature(root), prepared = api.prepareWorkspaceViews(root);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const session = createGraphViewSession({ root, activationId: 'group-capture', ...prepared.data }).data;
    let commits = 0;
    const env = { current: root, graphViews: session, editorDraw: api.projectEditorDraw(session.readEditor()), isOpen: () => true, editorCaptures: new WeakMap(), workspaceRevision: 0,
        canvas: { multi: new Set(ids), selection: null, widthOf: () => 180, heightOf: () => 80 }, readGraphEditContext: () => session.readEditContext(), captureGraphEditContext, prepareQualifiedScopeEdit,
        graphDocumentHooks: {}, toast() {}, commitGraphEdit(graph, command) { commits++; return commitPreparedGraph(graph, command); } };
    for (const name of ['captureEditor', 'editorCurrent', 'scopeCommand', 'commitCaptured', 'prepareScopeMutation']) env[name] = controllerFunction(name, env);
    const group = controllerFunction('groupSelection', env); H.track(root);
    const result = group(); assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(commits, 1);
    const added = Object.values(root.groups).find(value => value.id !== 'previous'); assert.ok(added);
    assert.equal(added.collapsed, true); assert.deepEqual(added.members, ids);
    assert.ok(ids.every(id => root.nodes[id].inGroup === added.id)); assert.deepEqual(root.groups.previous.members, ['select-fields']);
    assert.deepEqual(root.wires, before.wires); assert.equal(workflowSignature(root), signature);
    assert.ok(H.undo(root)); assert.deepEqual(root, before); assert.equal(H.undo(root), null);
    const captured = env.captureEditor(); session.invalidateEditorContext(); assert.equal(group(ids, captured.data).ok, false); assert.equal(commits, 1);
    assert.equal(group(['compose-json']).ok, false); assert.equal(commits, 1);
});
test('portable copied aliases and compactness survive import, prepared cards, Details and local overlays', async () => {
    const { exportWorkflow, parseWorkflow } = await import('../src/workflow/packages.js');
    const { nodeCard } = await import('../src/canvas/presentation.js');
    const original = starterGraph('structured-guidance'); original.nodes['compose-json'].alias = 'Copied alias'; original.nodes['compose-json'].compact = true;
    const root = parseWorkflow(JSON.stringify(exportWorkflow(original))).data, prepared = api.prepareWorkspaceViews(root);
    assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const session = createGraphViewSession({root,activationId:'portable-presentation',...prepared.data}).data;
    let drawing = api.projectEditorDraw(session.readEditor()), card = nodeCard(drawing.nodes['compose-json'],{graph:drawing});
    assert.equal(card.title,'Copied alias');assert.equal(card.compact,true);
    const workflow = projectPreparedWorkflow(prepared.data.workflow,{selectedId:'compose-json'});
    let details = api.projectWorkspacePanels(session.readEditor(),workflow,{},'one',null,null).nodeDetails;
    assert.equal(details.title,'Copied alias');assert.equal(details.alias,'Copied alias');assert.equal(details.compact,true);
    session.updateView({nodePresentation:{'compose-json':{alias:'Local alias',compact:false}}});
    drawing=api.projectEditorDraw(session.readEditor());card=nodeCard(drawing.nodes['compose-json'],{graph:drawing});
    assert.equal(card.title,'Local alias');assert.equal(card.compact,false);
    details=api.projectWorkspacePanels(session.readEditor(),workflow,{},'two',null,null).nodeDetails;
    assert.equal(details.alias,'Local alias');assert.equal(details.compact,false);
});
test('completed root movement commits authored geometry once while cancellation, replacement and library movement preserve root authority', async () => {
    const { captureGraphEditContext, commitPreparedGraph } = await import('../src/workflow/transactions.js');
    const { prepareQualifiedScopeEdit } = await import('../src/workflow/definition-library.js');
    const { workflowSignature } = await import('../src/workflow/runtime.js');
    const { siblingWorkflow } = await import('./fixtures/workflow-prepared-fixture.mjs');
    const H = await import('../src/history.js?v=0.26.0');
    const root = starterGraph('structured-guidance'); root.id = 'position-edit-history';
    const prepared = api.prepareWorkspaceViews(root), library = api.prepareLibraryViews(root.id,siblingWorkflow().definitions);
    const session = createGraphViewSession({ root, activationId:'move-root', navigation:[...prepared.data.navigation,...library.data.navigation], preparedViews:[...prepared.data.preparedViews,...library.data.preparedViews] }).data;
    session.updateView({ nodePresentation:{'compose-json':{alias:'Retained alias',x:1,y:2}} });
    const before=structuredClone(root), signature=workflowSignature(root), stored={workspaceViews:{}}, queued=new Map(); let commits=0, storedRoot=root, ticket=0;
    const env = { current:root, graphViews:session, editorDraw:api.projectEditorDraw(session.readEditor()), positionEdit:null, editorCaptures:new WeakMap(), workspaceRevision:0,
        activeEditRoot:()=>storedRoot, isOpen:()=>true, readGraphEditContext:()=>session.readEditContext(), captureGraphEditContext, prepareQualifiedScopeEdit, toast(){}, viewSaveTimer:null, activeWorkflow:()=>storedRoot, setActiveWorkspaceViews:data=>{stored.workspaceViews[root.id]=data;}, settings:()=>stored, save(){}, setTimeout(callback){queued.set(++ticket,callback);return ticket;}, clearTimeout(id){queued.delete(id);},
        activateEditorDraw(){env.editorDraw=api.projectEditorDraw(session.readEditor());}, graphDocumentHooks:{},
        commitGraphEdit(graph,command){const result=commitPreparedGraph(graph,command);if(result.ok){commits++;const latest=api.prepareWorkspaceViews(root);session.replacePreparedViews({navigation:[...latest.data.navigation,...library.data.navigation],preparedViews:[...latest.data.preparedViews,...library.data.preparedViews]});}return result;} };
    for(const name of ['captureEditor','editorCurrent','scopeCommand','commitCaptured','prepareScopeMutation'])env[name]=controllerFunction(name,env);
    env.persistGraphViews=controllerFunction('persistGraphViews',env);env.persistGraphViews(true);
    const begin=controllerFunction('beginPositionEdit',env), complete=controllerFunction('completePositionEdit',env); H.track(root);
    begin();env.editorDraw.nodes['compose-json'].x=77;env.editorDraw.nodes['compose-json'].y=88;env.editorDraw.nodes['json-decode'].x+=76;env.editorDraw.nodes['json-decode'].y+=86;
    assert.equal(complete(['compose-json','json-decode']),true);assert.equal(commits,1);
    assert.deepEqual({x:root.nodes['compose-json'].x,y:root.nodes['compose-json'].y},{x:77,y:88});
    assert.equal(workflowSignature(root),signature);assert.deepEqual(session.readEditor().view.nodePresentation['compose-json'],{alias:'Retained alias'});
    assert.deepEqual(stored.workspaceViews[root.id].views[0].nodePresentation['compose-json'],{alias:'Retained alias'},'Settled root drag synchronously removes obsolete saved overlay coordinates');
    assert.equal(complete(['compose-json']),false);assert.equal(commits,1);
    assert.ok(H.undo(root));assert.deepEqual(root,before);assert.equal(H.undo(root),null);
    begin();env.editorDraw.nodes['compose-json'].x=900;assert.deepEqual(root,before,'An unfinished or cancelled drag cannot write authored geometry');
    session.invalidateEditorContext();assert.equal(complete(['compose-json']),false);assert.equal(commits,1);
    begin();storedRoot=structuredClone(root);assert.equal(complete(['compose-json']),false);assert.equal(commits,1);assert.deepEqual(root,before);assert.deepEqual(storedRoot,before);storedRoot=root;
    session.openLibrary(library.data.preparedViews[0].definitionRef);env.activateEditorDraw();const id=Object.keys(env.editorDraw.nodes).find(id=>env.editorDraw.nodes[id].type==='workflow');
    begin();env.editorDraw.nodes[id].x=66;env.editorDraw.nodes[id].y=77;
    assert.equal(complete([id]),true);assert.deepEqual(session.readEditor().view.nodePresentation[id],{x:66,y:77});assert.equal(commits,1);assert.deepEqual(root,before);
});


test('actual pin jump uses a current navigation token and an existing prepared opposite pin',async()=>{
 const {env,session,real}=await restoreFixture();try{env.activate();env.editorCurrent=capture=>session.isEditorContextCurrent(capture);const jump=controllerFunction('jumpNativeNode',env),capture=session.captureEditorContext(),target={nodeId:'first/path',portId:'scene',dir:'in'};assert.equal(jump(capture,target),true);assert.deepEqual(real.canvas.selection,{kind:'node',id:'first/path'});assert.equal(jump(capture,{...target,portId:'fabricated'}),false);session.openInstance(['first/path']);env.activate();session.focusView(session.project().graphViews.tabs[0].key);env.activate();assert.equal(jump(capture,target),false,'Away and back cannot revive a retained pin menu');const latest=session.captureEditorContext();delete env.editorDraw.nodes['first/path'];assert.equal(jump(latest,target),false,'Deleted targets cannot be followed');}finally{await real.canvas.destroy();real.host.remove();}
});


test('native plaintext paste uses valid Compose sections and one real root transaction in both phases', async () => {
    const { captureGraphEditContext, commitPreparedGraph } = await import('../src/workflow/transactions.js?v=0.26.0');
    const { prepareNativeConnectionEdit } = await import('../src/workflow/connection-edits.js?v=0.26.0');
    const { composeText } = await import('../src/workflow/operations/compose.js?v=0.26.0');
    const { siblingWorkflow } = await import('./fixtures/workflow-prepared-fixture.mjs');
    const H = await import('../src/history.js?v=0.26.0');
    const text = '  User 🌿\nSecond line: 界\n  ', point = { x: 13.125, y: -7.5 };
    for (const phase of ['pre', 'post']) {
        const root = { id: 'plaintext-root-' + phase, schema: 3, runtime: 2, mode: 'native-' + phase, nodes: {}, wires: {}, groups: {}, portals: {}, definitions: {} };
        const prepared = api.prepareWorkspaceViews(root), library = api.prepareLibraryViews(root.id, siblingWorkflow().definitions);
        assert.equal(prepared.ok, true, JSON.stringify(prepared)); assert.equal(library.ok, true, JSON.stringify(library));
        const created = createGraphViewSession({ root, activationId: 'plaintext-' + phase, navigation: [...prepared.data.navigation, ...library.data.navigation], preparedViews: [...prepared.data.preparedViews, ...library.data.preparedViews] });
        assert.equal(created.ok, true, JSON.stringify(created)); const session = created.data, errors = [];
        let preparations = 0, commits = 0;
        const env = { current: root, graphViews: session, canvas: { pointer: null, select(){}, setMulti(){} }, readClip, workspaceRevision: 0, editorCaptures: new WeakMap(), isOpen: () => true, readGraphEditContext: () => session.readEditContext(), captureGraphEditContext, graphDocumentHooks: {}, toast: message => errors.push(message), defaultNodeSpot: () => point,
            prepareNativeConnectionEdit(graph, command) { preparations++; return prepareNativeConnectionEdit(graph, command); },
            commitGraphEdit(graph, command) { commits++; return commitPreparedGraph(graph, command); } };
        // Execute the actual paste, private capture/current/path and commit adapters.
        // Only persistence/UI notifications are replaced by the public root commit producer.
        for (const name of ['captureEditor', 'editorCurrent', 'scopeCommand', 'commitCaptured']) env[name] = controllerFunction(name, env);
        const paste = controllerFunction('pasteOnCanvas', env), before = structuredClone(root); H.track(root);
        assert.equal(paste(text, point), true, JSON.stringify(errors));
        assert.equal(preparations, 1); assert.equal(commits, 1);
        const added = Object.values(root.nodes); assert.equal(added.length, 1);
        assert.equal(added[0].operation, 'compose'); assert.equal(added[0].phase, phase);
        assert.equal(added[0].outputKind, phase === 'pre' ? 'guidance' : 'text');
        assert.deepEqual(added[0].sections, [{ name: 'pasted_text', text }]);
        assert.deepEqual({ x: added[0].x, y: added[0].y }, point);
        const composed = composeText({ sections: added[0].sections, separator: added[0].separator });
        assert.equal(composed.ok, true, JSON.stringify(composed)); assert.equal(composed.data.text, text);
        assert.ok(H.undo(root)); assert.deepEqual(root, before); assert.equal(H.undo(root), null, 'Paste creates only one history step');
        assert.equal(paste(' \n\t ', point), false, 'Blank plaintext is not an edit');
        const capture = env.captureEditor(); assert.equal(capture.ok, true);
        session.openLibrary(library.data.preparedViews[0].definitionRef);
        assert.equal(paste(text, point, capture.data), false, 'A captured root cannot retarget a readonly library view');
        assert.equal(paste({ text }, point), false, 'Fresh readonly capture cannot prepare or commit plaintext');
        assert.equal(preparations, 1); assert.equal(commits, 1); assert.deepEqual(root, before);
    }
});

test('unified workspace keeps effective node stages and shows typed decisions separately from completion profiles',()=>{
    const root=cloneWorkflowDocument(starterGraph('literal-cleanup')).data;root.mode='native-unified';
    root.nodes.context={id:'context',type:'workflow',operation:'scene-context'};
    root.nodes.fast={id:'fast',type:'workflow',operation:'fast-decision',fastConnectionId:'local-laya'};
    let textResolutions=0,fastResolutions=0;
    const prepared=api.prepareWorkspaceViews(root,{settings:{nativeBindings:{workflowGraphId:root.id}},resolveBinding:()=>{textResolutions++;return {ok:true,data:{profileId:'ordinary'}};},resolveFastBinding:()=>{fastResolutions++;return {ok:true,data:{connectionId:'local-laya',capability:'typed-decision',provider:'laya',model:'laya-any'}};}});
    assert.equal(prepared.ok,true,JSON.stringify(prepared.error));assert.equal(textResolutions,0);assert.equal(fastResolutions,1);
    const session=createGraphViewSession({root,activationId:'unified-panels',...prepared.data}).data;
    session.updateView({selection:{primary:{kind:'node',id:'fast'},multi:[]}});
    const workflow=projectPreparedWorkflow(prepared.data.workflow,{selectedId:'fast'});assert.equal(workflow.graphId,root.id);
    assert.ok(workflow.nodes.some(node=>node.id==='reply-snapshot'&&node.phase==='post'));assert.ok(workflow.nodes.some(node=>node.id==='context'&&node.phase==='pre'));
    assert.ok(workflow.families.flatMap(family=>family.operations).find(operation=>operation.id==='repair').compatible);
    const details=api.projectWorkspacePanels(session.readEditor(),workflow,{},'unified',null,null).nodeDetails;
    assert.equal(details.phase,'pre');assert.equal(details.model,null);assert.ok(details.controls.some(control=>control.key==='fastConnectionId'));
    const drawing=api.projectEditorDraw(session.readEditor());assert.equal(drawing.nativeCards.fast.canonicalTitle,'Fast Decision');assert.equal(drawing.nativeCards['reply-snapshot'].ports[0].kind,'draft');
});
