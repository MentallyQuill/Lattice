import { withNativeBoundary } from './helpers/workflow-fixtures.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareWorkflowProjection, projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.27.2';
import { prepareWorkspaceViews, projectWorkspacePanels } from '../src/ui/workspace-preparation.js?v=0.27.2';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.2';
const graph = () => withNativeBoundary({id:'provider-ui',name:'Provider UI',schema:3,runtime:2,mode:'native-unified',roles:{},nodes:{source:{id:'source',type:'workflow',operation:'compose',sections:[{name:'scene',text:'A scene.'}],outputKind:'text'},decide:{id:'decide',type:'workflow',operation:'decision',inputKind:'text'},render:{id:'render',type:'workflow',operation:'compose',mode:'template',outputKind:'guidance',template:'Decision: {{data:/answers}}'},guidance:{id:'guidance',type:'workflow',operation:'guidance'}},wires:{wire:{id:'wire',route:'wire',from:'source',fromPort:'out',to:'decide',toPort:'in'},data:{id:'data',route:'wire',from:'decide',fromPort:'out',to:'render',toPort:'data'},publish:{id:'publish',route:'wire',from:'render',fromPort:'out',to:'guidance',toPort:'in'}},portals:{},definitions:{},groups:{}}, 'guidance');
const project = (root, options = {}) => projectPreparedWorkflow(prepareWorkflowProjection(root, options));

test('unified Details show editable stages for both-phase tools and fixed lifecycle stages',async()=>{
 const {starterGraph}=await import('../src/workflow/starters.js?v=0.27.2');const root=starterGraph('unified-basic');root.nodes.noteText={id:'noteText',type:'workflow',operation:'compose',phase:'post',sections:[{name:'text',text:'Notes'}],outputKind:'text'};
 const prepared=prepareWorkspaceViews(root);assert.equal(prepared.ok,true,JSON.stringify(prepared));const session=createGraphViewSession({root,activationId:'stages',...prepared.data}).data;
 const details=id=>projectWorkspacePanels(session.readEditor(),projectPreparedWorkflow(prepared.data.workflow,{selectedId:id}),{},'r1',null,null).nodeDetails;
 assert.equal(details('noteText').phase,'post');assert.equal(details('noteText').phaseEditable,true);assert.equal(details('generate-reply').phaseEditable,false);
});


test('workflow projection describes the open document without legacy assignment authority',()=>{
 const root=graph();const view=project(root,{settings:{nativeBindings:{workflowGraphId:'unified',preGraphId:root.id}}});
 assert.equal(view.graphId,root.id);assert.equal(view.phase,'unified');assert.equal(Object.hasOwn(view,'assigned'),false);
 const unassigned=project(root,{settings:{nativeBindings:{workflowGraphId:null,preGraphId:root.id}}});
 assert.equal(Object.hasOwn(unassigned,'assigned'),false);assert.deepEqual(unassigned.issues,view.issues);
});


test('inferred response stage is shared by compiled inventory, graph card and editable Details',async()=>{
 const {starterGraph}=await import('../src/workflow/starters.js?v=0.27.2');const root=starterGraph('unified-basic');
 root.nodes.text={id:'text',type:'workflow',operation:'draft-text'};root.nodes.decision={id:'decision',type:'workflow',operation:'decision',inputKind:'text'};
 root.wires.text={id:'text',route:'wire',from:'generate-reply',fromPort:'draft',to:'text',toPort:'draft'};root.wires.decision={id:'decision',route:'wire',from:'text',fromPort:'out',to:'decision',toPort:'in'};
 const before=structuredClone(root);const prepared=prepareWorkspaceViews(root,{resolveBinding:()=>({ok:true,data:{profileId:'judge',model:'text'}})});assert.equal(prepared.ok,true,JSON.stringify(prepared));
 assert.equal(prepared.data.planner.inventory.primitives.find(unit=>unit.address.nodeId==='decision').phase,'post');
 const session=createGraphViewSession({root,activationId:'inferred-stage',...prepared.data}).data,workflow=projectPreparedWorkflow(prepared.data.workflow,{selectedId:'decision'});
 assert.equal(workflow.nodes.find(node=>node.id==='decision').phase,'post');assert.equal(session.readEditor().prepared.drawBase.nativeCards.decision.phase,'post');
 const details=projectWorkspacePanels(session.readEditor(),workflow,{},'r1',null,null).nodeDetails;assert.equal(details.phase,'post');assert.equal(details.phaseEditable,true);assert.deepEqual(root,before);
 // Committing the displayed stage must preserve valid stage admission.
 root.nodes.decision.phase=details.phase;assert.equal(prepareWorkspaceViews(root).ok,true);
 root.nodes.decision.phase='pre';assert.equal(prepareWorkspaceViews(root).ok,false);
});

test('ordinary Decision preparation resolves one text profile and caches its effective binding',()=>{
 let calls=0;const view=project(graph(),{resolveBinding(node){calls++;assert.equal(node.operation,'decision');return {ok:true,data:{profileId:'saved',model:'profile-model'}};}});
 assert.equal(calls,1);assert.deepEqual(view.issues,[]);assert.match(view.nodes.find(node=>node.id==='decide').effective,/saved.*profile-model/);
});
