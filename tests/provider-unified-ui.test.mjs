import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareWorkflowProjection, projectPreparedWorkflow } from '../src/ui/workflow-surface.js?v=0.26.0';
import { prepareWorkspaceViews, projectWorkspacePanels, projectNodeProfiles } from '../src/ui/workspace-preparation.js?v=0.26.0';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.26.0';
const api = await import('../src/ui/provider-settings.js?v=0.26.0').catch(() => ({}));
const graph = (controls = {}) => ({id:'provider-ui',name:'Provider UI',schema:3,runtime:2,mode:'native-pre',roles:{},nodes:{source:{id:'source',type:'workflow',operation:'compose',sections:[{name:'scene',text:'A scene.'}],outputKind:'text'},fast:{id:'fast',type:'workflow',operation:'fast-decision',inputKind:'text',fastConnectionId:'jev',...controls},render:{id:'render',type:'workflow',operation:'compose',mode:'template',outputKind:'guidance',template:'Decision: {{data:/answers}}'},guidance:{id:'guidance',type:'workflow',operation:'guidance'}},wires:{wire:{id:'wire',route:'wire',from:'source',fromPort:'out',to:'fast',toPort:'in'},data:{id:'data',route:'wire',from:'fast',fromPort:'out',to:'render',toPort:'data'},publish:{id:'publish',route:'wire',from:'render',fromPort:'out',to:'guidance',toPort:'in'}},portals:{},definitions:{},groups:{}});
const project = (root, options = {}) => projectPreparedWorkflow(prepareWorkflowProjection(root, options));
const failure = code => ({ok:false,error:{code,message:'Primary unavailable'}});

test('typed primary preparation never resolves an ordinary text profile', () => {
 let text=0,typed=0;
 const view=project(graph(),{resolveFastBinding(node){typed++;assert.equal(node.fastConnectionId,'jev');return{ok:true,data:{capability:'typed-decision',connectionId:'jev',provider:'jev',model:'typed-model',revision:'1'}};},resolveBinding(){text++;return failure('BINDING_MISSING');}});
 assert.deepEqual(view.issues,[]);assert.equal(typed,1);assert.equal(text,0);
 assert.match(view.nodes.find(node=>node.id==='fast').effective,/typed-model/);
});

test('explicit permitted Fast fallback unblocks preparation using its separately selected text profile model', () => {
 const calls=[];
 const view=project(graph({fallbackEnabled:true,fallbackAllowedCodes:['SERVICE_UNAVAILABLE'],fallbackProfileId:'fallback',profileId:'wrong-primary',model:'wrong-model'}),{resolveFastBinding:()=>failure('SERVICE_UNAVAILABLE'),resolveBinding(node){calls.push(node);return{ok:true,data:{profileId:node.profileId,model:'profile-default'}};}});
 assert.deepEqual(view.issues,[]);assert.equal(calls.length,1);assert.equal(calls[0].profileId,'fallback');assert.equal(calls[0].model,null);assert.equal(calls[0].modelRole,'decision');
 assert.match(view.nodes.find(node=>node.id==='fast').effective,/fallback/i);
});

for(const code of ['AUTH_MISSING','CONNECTION_MISSING','BINDING_CHANGED','ABORTED']) test('Fast preparation holds '+code+' unless its explicit supported fallback applies',()=>{
 let text=0;
 const view=project(graph({fallbackEnabled:true,fallbackAllowedCodes:['SERVICE_UNAVAILABLE'],fallbackProfileId:'fallback'}),{resolveFastBinding:()=>failure(code),resolveBinding(){text++;return{ok:true,data:{profileId:'fallback',model:'text'}};}});
 assert.ok(view.issues.length);assert.equal(text,0);
});

test('enabled fallback validates its own missing profile even when typed primary is ready',()=>{
 let text=0;
 const view=project(graph({fallbackEnabled:true,fallbackAllowedCodes:['RATE_LIMITED'],fallbackProfileId:'missing'}),{resolveFastBinding:()=>({ok:true,data:{model:'typed'}}),resolveBinding(node){text++;assert.equal(node.profileId,'missing');return failure('PROFILE_MISSING');}});
 assert.ok(view.issues.some(issue=>/fallback/i.test(issue)));assert.equal(text,1);
});

test('Fast node Details select configured typed IDs and separately select fallback profiles',()=>{
 const root=graph({fallbackEnabled:true,fallbackAllowedCodes:['SERVICE_UNAVAILABLE'],fallbackProfileId:'text-fallback'});
 const prepared=prepareWorkspaceViews(root,{profiles:[{id:'text-fallback',name:'Text fallback'}],fastConnections:[{id:'jev',label:'Scene judge',provider:'jev',model:'jev-any',credentialReady:true}],resolveFastBinding:()=>({ok:true,data:{model:'jev-any'}}),resolveBinding:()=>({ok:true,data:{profileId:'text-fallback',model:'text'}})});assert.equal(prepared.ok,true,JSON.stringify(prepared));
 const session=createGraphViewSession({root,activationId:'providers',...prepared.data}).data;
 const workflow=projectPreparedWorkflow(prepared.data.workflow,{selectedId:'fast'});
 const details=projectWorkspacePanels(session.readEditor(),workflow,{},'revision',null,null).nodeDetails;
 assert.equal(details.model,null);
 const primary=details.controls.find(control=>control.key==='fastConnectionId');assert.equal(primary.editor,'enum');assert.ok(primary.options.some(option=>option.value==='jev'&&/Scene judge/.test(option.label)));
 const fallback=details.controls.find(control=>control.key==='fallbackProfileId');assert.equal(fallback.editor,'enum');assert.ok(fallback.options.some(option=>option.value==='text-fallback'));
});

test('provider choices expose selectors without endpoint, credential reference or secret authority',()=>{
 assert.equal(typeof api.fastConnectionChoices,'function');
 const choices=api.fastConnectionChoices({ok:true,data:{connections:[{id:'jev',label:'Scene judge',provider:'jev',model:'jev-any',endpoint:'https://private/v1/systemone',credentialRef:'private-ref',credentialReady:true,apiKey:'SECRET'}]}});
 assert.deepEqual(choices,[{value:'jev',label:'Scene judge · jev · jev-any'}]);assert.doesNotMatch(JSON.stringify(choices),/SECRET|private-ref|https/);
});

test('provider save sends session key only to credential action and reports unverified persistence honestly',async()=>{
 assert.equal(typeof api.saveFastConnection,'function');const actions=[];const state={ok:true,data:{userId:'default-user',credentialStorage:'session',connections:[]}};
 const registry={snapshot:()=>state,upsert(value){actions.push(['upsert',value]);return state;},setCredential(id,key){actions.push(['credential',id,key]);return{ok:true,data:{credentialReady:true}};},save:async()=>({ok:true,data:{appliedLocally:true,saveAttempted:true,acknowledged:false}})};
 const result=await api.saveFastConnection(registry,{id:'jev',label:'Judge',provider:'jev',model:'jev-any'},'SECRET','default-user');
 assert.equal(result.ok,true);assert.match(result.data.message,/unconfirmed|unverified|not confirmed/i);assert.equal(actions[0][1].apiKey,undefined);assert.deepEqual(actions[1],['credential','jev','SECRET']);assert.doesNotMatch(JSON.stringify(result),/SECRET/);
});

test('stale provider settings scope rejects credentials before any mutation',async()=>{
 let writes=0;const registry={snapshot:()=>({ok:true,data:{userId:'other-user',connections:[]}}),upsert(){writes++;},setCredential(){writes++;}};
 const result=await api.saveFastConnection(registry,{id:'jev',provider:'jev',model:'jev-any'},'SECRET','default-user');assert.equal(result.ok,false);assert.equal(writes,0);assert.doesNotMatch(JSON.stringify(result),/SECRET/);
});


test('unified Details show editable stages for both-phase tools and fixed lifecycle stages',async()=>{
 const {starterGraph}=await import('../src/workflow/starters.js?v=0.26.0');const root=starterGraph('unified-basic');root.nodes.noteText={id:'noteText',type:'workflow',operation:'compose',phase:'post',sections:[{name:'text',text:'Notes'}],outputKind:'text'};
 const prepared=prepareWorkspaceViews(root);assert.equal(prepared.ok,true,JSON.stringify(prepared));const session=createGraphViewSession({root,activationId:'stages',...prepared.data}).data;
 const details=id=>projectWorkspacePanels(session.readEditor(),projectPreparedWorkflow(prepared.data.workflow,{selectedId:id}),{},'r1',null,null).nodeDetails;
 assert.equal(details('noteText').phase,'post');assert.equal(details('noteText').phaseEditable,true);assert.equal(details('generate-reply').phaseEditable,false);
});


test('workflow projection describes the open document without legacy assignment authority',()=>{
 const root=graph();const view=project(root,{settings:{nativeBindings:{workflowGraphId:'unified',preGraphId:root.id}}});
 assert.equal(view.graphId,root.id);assert.equal(view.phase,'pre');assert.equal(Object.hasOwn(view,'assigned'),false);
 const unassigned=project(root,{settings:{nativeBindings:{workflowGraphId:null,preGraphId:root.id}}});
 assert.equal(Object.hasOwn(unassigned,'assigned'),false);assert.deepEqual(unassigned.issues,view.issues);
});


test('provider settings do not claim a superseded save applied successfully',async()=>{
 const registry={snapshot:()=>({ok:true,data:{userId:'default-user',connections:[]}}),upsert:()=>({ok:true}),save:async()=>({ok:false,error:{code:'BINDING_CHANGED',message:'RAW_SECRET'}})};
 const result=await api.saveFastConnection(registry,{id:'jev',provider:'jev',model:'jev-any'},'','default-user');assert.equal(result.ok,false);assert.equal(result.error.code,'BINDING_CHANGED');assert.doesNotMatch(JSON.stringify(result),/RAW_SECRET/);
});


test('inferred response stage is shared by compiled inventory, graph card and editable Details',async()=>{
 const {starterGraph}=await import('../src/workflow/starters.js?v=0.26.0');const root=starterGraph('unified-basic');
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

test('Fast Decision keeps its typed selector without an ordinary model profile bar',()=>{
 const root=graph({fallbackEnabled:true,fallbackAllowedCodes:['SERVICE_UNAVAILABLE'],fallbackProfileId:'text-fallback'});
 const prepared=prepareWorkspaceViews(root,{profiles:[{id:'text-fallback',name:'Text fallback'}],fastConnections:[{id:'jev',label:'Scene judge',provider:'jev',model:'jev-any',credentialReady:true}],activeModel:{apiLabel:'Host API',model:'host-model'},resolveFastBinding:()=>({ok:true,data:{model:'jev-any'}}),resolveBinding:()=>({ok:true,data:{profileId:'text-fallback',model:'text'}})});
 assert.equal(prepared.ok,true,JSON.stringify(prepared));
 const session=createGraphViewSession({root,activationId:'typed-profile-bar',...prepared.data}).data;
 const workflow=projectPreparedWorkflow(prepared.data.workflow,{selectedId:'fast'});
 assert.equal(projectNodeProfiles(session.readEditor(),workflow,'typed:1').some(row=>row.id==='fast'),false);
 const details=projectWorkspacePanels(session.readEditor(),workflow,{},'typed:1',null,null).nodeDetails;
 assert.equal(details.model,null);
 assert.equal(details.controls.find(control=>control.key==='fastConnectionId').value,'jev');
 assert.equal(details.controls.find(control=>control.key==='fallbackProfileId').value,'text-fallback');
});
