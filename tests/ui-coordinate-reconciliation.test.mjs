import test from 'node:test';
import assert from 'node:assert/strict';
import { starterGraph } from '../src/workflow/starters.js?v=0.27.0';
import { prepareWorkspaceViews } from '../src/ui/workspace-preparation.js?v=0.27.0';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.0';
import { prepareGraphCandidate } from '../src/workflow/composition.js?v=0.27.0';
import { captureGraphEditContext,commitPreparedGraph } from '../src/workflow/transactions.js?v=0.27.0';
import * as H from '../src/history.js?v=0.27.0';
function fixture(){const root=starterGraph('unified-basic');H.reset(root);const preparation=prepareWorkspaceViews(root).data;const session=createGraphViewSession({root,activationId:'coordinates',...preparation}).data;return{root,session};}
function commit(f,edit){const context=captureGraphEditContext(f.root,()=>f.session.readEditContext()).data,candidate=structuredClone(f.root);edit(candidate);return commitPreparedGraph(f.root,{...prepareGraphCandidate(f.root,candidate).data,context});}
test('verified coordinate reconciliation preserves authored content and patches positions without full cache admission',()=>{
 const f=fixture(),id=Object.keys(f.root.nodes)[0],old=f.session.readEditor(),token=f.session.captureEditorContext();
 const result=commit(f,g=>{g.nodes[id].x=322;g.nodes[id].y=155;});assert.equal(result.ok,true);
 const patch=f.session.applyCommittedCoordinates(result.data);assert.equal(patch.ok,true);
 const next=f.session.readEditor();assert.equal(next.prepared.savedGraph.nodes[id].x,322);assert.equal(next.prepared.drawBase.nodes[id].y,155);assert.equal(next.prepared.effectiveNodes[id].x,322);
 assert.equal(next.prepared.drawBase.nativeCards,old.prepared.drawBase.nativeCards);assert.equal(next.prepared.interface,old.prepared.interface);assert.equal(next.view.selection,old.view.selection);assert.equal(f.session.isEditorContextCurrent(token),false);
 assert.equal(old.prepared.savedGraph.nodes[id].x===322,false);assert.ok(H.undo(f.root));assert.equal(H.undo(f.root),null);
 assert.equal(f.session.applyCommittedCoordinates(result.data).ok,false,'Undo revokes the receipt');
});
test('foreign summaries, content edits and current raw mutation cannot authorize a coordinate patch',()=>{
 const f=fixture(),id=Object.keys(f.root.nodes)[0];const result=commit(f,g=>{g.nodes[id].x=42;});
 assert.equal(f.session.applyCommittedCoordinates({...result.data}).ok,false);
 f.root.name='Untracked';assert.equal(f.session.applyCommittedCoordinates(result.data).ok,false);
 const other=fixture(),content=commit(other,g=>{g.name='Different content';});assert.equal(other.session.applyCommittedCoordinates(content.data).ok,false);
});

test('actual completed move reconciles once, preserves the planner and publishes one immediate recovery',async()=>{
 const {readFile}=await import('node:fs/promises'),{installMock}=await import('./mock.js'),S=await import('../src/state.js?v=0.27.0'),{projectEditorDraw}=await import('../src/ui/workspace-preparation.js?v=0.27.0'),{prepareQualifiedScopeEdit}=await import('../src/workflow/definition-library.js?v=0.27.0'),{committedGraphChange}=await import('../src/workflow/transactions.js?v=0.27.0');
 const source=await readFile(new URL('../src/ui/controller.js',import.meta.url),'utf8');const extract=(name,env)=>{const start=source.indexOf('function '+name+'('),line=source.indexOf('\n',start),end=source.slice(start,line).trim().endsWith('}')?line:source.indexOf('\n}',start)+2;return Function('env','with(env){'+source.slice(start,end)+';return '+name+';}')(env);};
 const host=installMock();let saves=0;host.saveSettingsDebounced=()=>saves++;const owner=S.settings(),f=fixture();S.activateWorkflow(f.root);saves=0;const id=Object.keys(f.root.nodes)[0];f.session.updateView({nodePresentation:{[id]:{alias:'Kept',x:1,y:2}},selection:{primary:{kind:'node',id},multi:[]}});
 const planner={},draw=projectEditorDraw(f.session.readEditor());let patches=0,projections=0,encodes=0,recovery=owner.recoveryDraft;
 Object.defineProperty(owner,'recoveryDraft',{enumerable:true,configurable:true,get:()=>recovery,set:value=>{encodes++;recovery=value;}});
 const env={current:f.root,graphViews:f.session,editorDraw:draw,workspacePrepared:{planner},workspaceRevision:0,positionEdit:null,editorCaptures:new WeakMap(),isOpen:()=>true,activeEditRoot:()=>f.root,readGraphEditContext:()=>f.session.readEditContext(),captureGraphEditContext,prepareQualifiedScopeEdit,committedGraphChange,documentSession:S.documentSession,activeWorkflow:()=>f.root,setActiveWorkspaceViews:S.setActiveWorkspaceViews,save:S.save,viewSaveTimer:null,setTimeout:()=>1,clearTimeout(){},toast:()=>assert.fail('No diagnostic'),updateWorkflowProjection(){projections++;},paintHistory(){},refreshWorkspaceDocument:()=>assert.fail('Coordinate edit cannot prepare the whole workspace'),canvas:{setPositions(nodes){patches++;for(const item of nodes)Object.assign(draw.nodes[item.id],item);}}};
 for(const name of ['captureEditor','editorCurrent','scopeCommand','commitCaptured','prepareScopeMutation','beginPositionEdit','completePositionEdit','persistGraphViews','reconcileWorkspaceDocument'])env[name]=extract(name,env);
 env.graphDocumentHooks={reconcileViews:(root,summary)=>env.reconcileWorkspaceDocument(summary)};env.commitGraphEdit=S.commitGraphEdit;
 env.beginPositionEdit();draw.nodes[id].x=500;draw.nodes[id].y=250;assert.equal(env.completePositionEdit([id]),true);
 assert.equal(patches,1);assert.equal(projections,1);assert.equal(encodes,1);assert.equal(saves,1);assert.equal(env.workspacePrepared.planner,planner);assert.deepEqual(f.session.readEditor().view.nodePresentation[id],{alias:'Kept'});assert.equal(recovery.graph.nodes[id].x,500);assert.deepEqual(recovery.workspaceViews.views[0].nodePresentation[id],{alias:'Kept'});assert.ok(H.undo(f.root));assert.equal(H.undo(f.root),null);
});

test('actual controller overlay retains selected authored Details across unrelated publications',async()=>{
 const {readFile}=await import('node:fs/promises'),{projectPreparedWorkflow}=await import('../src/ui/workflow-surface.js?v=0.27.0'),{projectWorkspacePanels}=await import('../src/ui/workspace-preparation.js?v=0.27.0'),{readNodePresentation}=await import('../src/ui/node-palette.js?v=0.27.0');
 const f=fixture(),id=Object.keys(f.root.nodes).find(id=>f.root.nodes[id].type==='workflow'),preparation=prepareWorkspaceViews(f.root).data;f.session.updateView({selection:{primary:{kind:'node',id},multi:[]}});
 const source=await readFile(new URL('../src/ui/controller.js',import.meta.url),'utf8'),start=source.indexOf('function workflowView('),end=source.indexOf('\n}',start)+2;
 const env={workspacePrepared:preparation,current:f.root,graphViews:f.session,selectedKind:'node',selected:f.root.nodes[id],workflowState:{},selectedPreview:null,pinnedPreview:null,targetedPreview:null,projectPreparedWorkflow,readNodePresentation,samePreviewTerminal:()=>false,workflowNodePresentations:new WeakMap()};
 const previewStart=source.indexOf('const effectivePreview ='),previewEnd=source.indexOf('\n',previewStart);assert.ok(previewStart>=0,'Actual effective preview function');env.effectivePreview=Function('env','with(env){'+source.slice(previewStart,previewEnd)+';return effectivePreview;}')(env);
 const view=Function('env','with(env){'+source.slice(start,end)+';return workflowView;}')(env);view();const first=view(),second=view();assert.equal(first.nodes.find(node=>node.id===id),second.nodes.find(node=>node.id===id));
 const before=projectWorkspacePanels(f.session.readEditor(),first,{},'one'),after=projectWorkspacePanels(f.session.readEditor(),second,{},'two');assert.equal(before.nodeDetails.controls,after.nodeDetails.controls);assert.equal(before.nodeDetails.model,after.nodeDetails.model);assert.equal(before.nodeDetails.modifiers,after.nodeDetails.modifiers);
});

test('removed authored coordinates require normal layout preparation instead of a retained drawing patch',()=>{
 const f=fixture(),id=Object.keys(f.root.nodes)[0];const result=commit(f,g=>{delete g.nodes[id].x;});assert.equal(result.ok,true);
 assert.equal(f.session.applyCommittedCoordinates(result.data).ok,false,'Missing optional positions must fall back to normal layout defaults');
});
