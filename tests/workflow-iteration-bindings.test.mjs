import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CONTROL_OPERATIONS,describeControl} from '../src/workflow/operations/control-nodes.js?v=0.27.1';
const helper={id:'helper',version:1,semanticHash:'sha256:'+'a'.repeat(64)};
const each=extra=>({id:'each',type:'workflow',operation:'for-each',helper,...extra});
test('For Each declares bounded role overrides using the existing binding shape',()=>{
 assert.deepEqual(CONTROL_OPERATIONS['for-each'].defaults.roleOverrides,{});
 assert.equal(describeControl(each({roleOverrides:{decision:{profileId:'chosen',model:null}}})).ok,true);
 for(const roleOverrides of [[],{decision:{endpoint:'secret'}},{decision:{model:7}},{'':{profileId:'p'}},{decision:{profileId:' '.repeat(2)}},Object.fromEntries(Array.from({length:65},(_,i)=>['role'+i,{profileId:'p'}]))])assert.equal(describeControl(each({roleOverrides})).ok,false,JSON.stringify(roleOverrides));
});import {computeDefinitionIdentity,definitionRefKey,nodeBindingOverrideKey} from '../src/workflow/definition-data.js?v=0.27.1';
import {runWorkflow} from '../src/workflow/runtime.js?v=0.27.1';
import {resolveBinding,requestModel} from '../src/workflow/connections.js?v=0.27.1';
const edge=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});
const node=(id,operation,extra={})=>({id,type:'workflow',operation,...extra});
function fixture(roleOverrides={decision:{profileId:'chosen',model:null}}){
 const raw={id:'imported',version:1,name:'Imported confirmation',interface:[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'}],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',roles:{decision:{profileId:null,model:null}},nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'},decide:node('decide','decision',{questions:{answer:{type:'noul',instructions:'Is this item present?'}}})},wires:{a:edge('a','entry','out','decide','in'),b:edge('b','decide','out','exit','in')}}};
 const identity=computeDefinitionIdentity(raw);assert.equal(identity.ok,true,JSON.stringify(identity.error));const def={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:def.id,version:1,semanticHash:def.semanticHash};
 const root={id:'root',schema:3,runtime:2,mode:'native-unified',roles:{decision:{profileId:'ambient',model:'ambient-model'}},definitions:{[definitionRefKey(ref)]:def},nodes:{items:node('items','text',{text:'[{"item":1}]'}),decode:node('decode','json-decode'),each:node('each','for-each',{helper:ref,limit:2,requestBoundPerIteration:1,roleOverrides})},wires:{a:edge('a','items','out','decode','in'),b:edge('b','decode','out','each','in')}};
 return {root,ref,def,target:{workflowId:'root',instancePath:[],nodeId:'each',portId:'out'}};
}
function textHost(){
 const requests=[],profiles={chosen:{id:'chosen',name:'Chosen',api:'openai',model:'profile-default'},ambient:{id:'ambient',name:'Ambient',api:'openai',model:'ambient-model'}};
 const context={CONNECT_API_MAP:{openai:{selected:'openai',source:'openai'}},chatCompletionSettings:{},ChatCompletionService:{presetToGeneratePayload:async(_preset,_source,payload)=>payload},ConnectionManagerRequestService:{getProfile:id=>profiles[id],sendRequest:async(profileId,messages,maxTokens,options,payload)=>{requests.push({profileId,payload});return {choices:[{message:{content:'{"answers":{"answer":{"type":"noul","accepted":true}}}'},finish_reason:'stop'}]};}}};
 return {requests,context};
}
test('actual imported null-role helper request captures selected profile and its default model without editing the pin',async()=>{
 const f=fixture(),before=structuredClone(f.def),host=textHost(),bindings=[];
 const result=await runWorkflow(f.root,{target:f.target,resolveBinding:(n,g)=>{const result=resolveBinding(n,g,host.context);if(result.ok)bindings.push(result.data);return result;},countTokens:async()=>({tokens:1}),request:options=>requestModel(options,host.context)});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,1);assert.deepEqual(host.requests.map(r=>[r.profileId,r.payload.model]),[['chosen','profile-default']]);assert.equal(bindings[0].profileId,'chosen');assert.equal(bindings[0].model,'profile-default');assert.deepEqual(f.def,before);assert.deepEqual(f.root.nodes.each.helper,f.ref);
});
import {semanticControlsForNode} from '../src/workflow/catalog.js?v=0.27.1';
import {exportWorkflow} from '../src/workflow/packages.js?v=0.27.1';
test('empty helper overrides preserve additive defaults and local profiles do not enter semantic identity or portable exports',()=>{
 const f=fixture();
 assert.equal(Object.hasOwn(semanticControlsForNode(each({})), 'roleOverrides'),false);
 const raw={id:'outer',version:1,name:'Outer',interface:[],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{each:each({})},wires:{}}};
 const first=computeDefinitionIdentity(raw);assert.equal(first.ok,true,JSON.stringify(first.error));assert.equal(Object.hasOwn(first.data.materializedDefinition.body.nodes.each,'roleOverrides'),false);
 raw.body.nodes.each.roleOverrides={};assert.equal(computeDefinitionIdentity(raw).data.semanticHash,first.data.semanticHash);
 raw.body.nodes.each.roleOverrides={decision:{profileId:'local-A',model:null}};const a=computeDefinitionIdentity(raw);
 raw.body.nodes.each.roleOverrides.decision.profileId='local-B';assert.equal(computeDefinitionIdentity(raw).data.semanticHash,a.data.semanticHash);
 const exported=exportWorkflow(f.root);assert.equal(exported.kind,'lattice-workflow');assert.equal(JSON.stringify(exported).includes('chosen'),false);assert.deepEqual(exported.graph.nodes.each.roleOverrides,{decision:{profileId:null,model:null}});
});
test('outer helper role overrides reach nested imported null-role helpers while a nested explicit profile wins',async()=>{
 for(const nestedOverrides of [{},{decision:{profileId:'ambient',model:null}}]){
  const f=fixture(),raw={id:'nested',version:1,name:'Nested helper',interface:f.def.interface,parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'},nested:node('nested','for-each',{helper:f.ref,limit:2,requestBoundPerIteration:1,roleOverrides:nestedOverrides})},wires:{a:edge('a','entry','out','nested','in'),b:edge('b','nested','out','exit','in')}}};
  const identity=computeDefinitionIdentity(raw);assert.equal(identity.ok,true,JSON.stringify(identity.error));const def={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:def.id,version:1,semanticHash:def.semanticHash};f.root.definitions[definitionRefKey(ref)]=def;f.root.nodes.each.helper=ref;f.root.nodes.each.requestBoundPerIteration=2;f.root.nodes.items.text='[[{"item":1}]]';
  const host=textHost();const result=await runWorkflow(f.root,{target:f.target,resolveBinding:(n,g)=>resolveBinding(n,g,host.context),countTokens:async()=>({tokens:1}),request:options=>requestModel(options,host.context)});
  assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,1);assert.deepEqual(host.requests.map(r=>[r.profileId,r.payload.model]),Object.keys(nestedOverrides).length?[['ambient','ambient-model']]:[['chosen','profile-default']]);
 }
});
import {prepareWorkspaceViews,projectWorkspacePanels} from '../src/ui/workspace-preparation.js?v=0.27.1';
import {projectPreparedWorkflow} from '../src/ui/workflow-surface.js?v=0.27.1';
import {createGraphViewSession} from '../src/ui/graph-view-session.js?v=0.27.1';
function panel(f,options={}){
 const prepared=prepareWorkspaceViews(f.root,{profiles:[{id:'chosen',name:'Chosen connection'},{id:'ambient',name:'Ambient connection'}],...options});assert.equal(prepared.ok,true,JSON.stringify(prepared.error));
 const session=createGraphViewSession({root:f.root,activationId:'helper-bindings',...prepared.data}).data;
 return projectWorkspacePanels(session.readEditor(),projectPreparedWorkflow(prepared.data.workflow,{selectedId:'each'}),{},'r1',null,null).nodeDetails;
}
test('For Each Details projects only real helper model roles with profile/default-model selectors',()=>{
 const f=fixture(),before=structuredClone(f.root),view=panel(f);
 assert.ok(view.helperBindings,'For Each must expose model role selectors');assert.equal(view.model,null);assert.equal(view.controls.some(row=>row.key==='roleOverrides'),false);
 assert.deepEqual(view.helperBindings.roles.map(row=>row.role),['decision']);const row=view.helperBindings.roles[0];assert.equal(row.profile.value,'chosen');assert.equal(row.model.mode,'block');assert.equal(row.model.allowedModes.find(mode=>mode.value==='block').label,'Use profile model');assert.deepEqual(row.profile.options,[{value:'lattice:active-sillytavern',label:'Active SillyTavern model'},{value:'chosen',label:'Chosen connection'},{value:'ambient',label:'Ambient connection'}]);assert.equal(view.helperBindings.editable,true);assert.deepEqual(f.root,before);
});
test('helper role selectors override nested definition defaults while authored nested wrapper overrides still win',async()=>{
 for(const wrapperOverride of [{},{decision:{profileId:'ambient',model:null}}]){
  const f=fixture(),raw={id:'wrapper-helper',version:1,name:'Wrapper helper',interface:f.def.interface,parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'},child:{id:'child',type:'subgraph',definition:f.ref,roleOverrides:wrapperOverride}},wires:{a:edge('a','entry','out','child','item'),b:edge('b','child','result','exit','in')}}};
  const identity=computeDefinitionIdentity(raw);assert.equal(identity.ok,true,JSON.stringify(identity.error));const def={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:def.id,version:1,semanticHash:def.semanticHash};f.root.definitions[definitionRefKey(ref)]=def;f.root.nodes.each.helper=ref;
  const host=textHost();const result=await runWorkflow(f.root,{target:f.target,resolveBinding:(n,g)=>resolveBinding(n,g,host.context),countTokens:async()=>({tokens:1}),request:options=>requestModel(options,host.context)});
  assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(host.requests.map(r=>[r.profileId,r.payload.model]),Object.keys(wrapperOverride).length?[['ambient','ambient-model']]:[['chosen','profile-default']]);
 }
});
test('qualified For Each captures helper bindings from its actual instance parameter overrides',async()=>{
 const f=fixture();delete f.root.nodes.each.roleOverrides;
 const raw={id:'qualified',version:1,name:'Qualified For Each',interface:[{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'}],parameters:[{id:'bindings',label:'Helper bindings',target:{instancePath:[],nodeId:'each',controlId:'roleOverrides'}}],body:{schema:3,runtime:2,mode:'native-unified',nodes:{...f.root.nodes,exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'}},wires:{...f.root.wires,c:edge('c','each','out','exit','in')}}};
 const identity=computeDefinitionIdentity(raw);assert.equal(identity.ok,true,JSON.stringify(identity.error));const def={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:def.id,version:1,semanticHash:def.semanticHash};f.root.definitions[definitionRefKey(ref)]=def;f.root.nodes={wrapper:{id:'wrapper',type:'subgraph',definition:ref,parameterOverrides:{bindings:{decision:{profileId:'chosen',model:null}}}}};f.root.wires={};
 const host=textHost();const result=await runWorkflow(f.root,{target:{workflowId:'root',instancePath:[],nodeId:'wrapper',portId:'result'},resolveBinding:(n,g)=>resolveBinding(n,g,host.context),countTokens:async()=>({tokens:1}),request:options=>requestModel(options,host.context)});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(host.requests.map(r=>[r.profileId,r.payload.model]),[['chosen','profile-default']]);
});
import {readFile} from 'node:fs/promises';
import {prepareIterationBindingOverride,inspectIterationTextRoles} from '../src/ui/iteration-bindings.js?v=0.27.1';
import {prepareQualifiedScopeEdit} from '../src/workflow/definition-library.js?v=0.27.1';
import {captureGraphEditContext,commitPreparedGraph} from '../src/workflow/transactions.js?v=0.27.1';
import * as history from '../src/history.js?v=0.27.1';
const controllerSource=await readFile(new URL('../src/ui/controller.js',import.meta.url),'utf8');
const actionStart=controllerSource.indexOf('function editIterationHelperBinding('),actionEnd=controllerSource.indexOf('\nconst commentDetailsActions',actionStart);assert.ok(actionStart>=0&&actionEnd>actionStart);
const actionFactory=Function('detailCapture','commitCaptured','prepareScopeMutation','prepareIterationBindingOverride',controllerSource.slice(actionStart,actionEnd)+';return editIterationHelperBinding;');
test('actual captured controller helper edit commits profile defaults/custom models and rejects obsolete selections',async()=>{
 const f=fixture({}),original=structuredClone(f.def);history.track(f.root);let revision=1;
 const selected=()=>({selectionKey:'each',revision:'r'+revision,address:{workflowId:'root',instancePath:[],nodeId:'each'}});
 const action=actionFactory(selection=>selection.revision===selected().revision&&JSON.stringify(selection.address)===JSON.stringify(selected().address)?captureGraphEditContext(f.root,()=>({sessionId:'test-session',viewPath:[],readOnly:false})):{ok:false,error:{code:'STALE_CONTEXT',message:'Changed selection'}},(captured,prepared)=>{if(!prepared.ok)return prepared;const result=commitPreparedGraph(f.root,{...prepared.data,context:captured,viewPath:[]});if(result.ok)revision++;return result;},(_captured,mutate)=>prepareQualifiedScopeEdit(f.root,{viewPath:[]},mutate),prepareIterationBindingOverride);
 const stale=selected();assert.equal(action(stale,'decision','profileId','override','chosen').ok,true);assert.deepEqual(f.root.nodes.each.roleOverrides,{decision:{profileId:'chosen',model:null}});
 const host=textHost(),run=()=>runWorkflow(f.root,{target:f.target,resolveBinding:(n,g)=>resolveBinding(n,g,host.context),countTokens:async()=>({tokens:1}),request:options=>requestModel(options,host.context)});
 assert.equal((await run()).ok,true);assert.equal(action(stale,'decision','model','override','stale-model').error.code,'STALE_CONTEXT');assert.equal(action(selected(),'missing-role','profileId','override','chosen').ok,false);
 assert.equal(action(selected(),'decision','model','override','custom-decision').ok,true);assert.equal((await run()).ok,true);assert.deepEqual(host.requests.map(r=>[r.profileId,r.payload.model]),[['chosen','profile-default'],['chosen','custom-decision']]);assert.deepEqual(f.def,original);
 assert.equal(action(selected(),'decision','profileId','inherit',null).ok,true);assert.deepEqual(f.root.nodes.each.roleOverrides,{decision:{model:'custom-decision'}});assert.equal(action(selected(),'decision','model','inherit',null).ok,true);assert.equal(Object.hasOwn(f.root.nodes.each,'roleOverrides'),false);
});
test('unknown helper roles fail before source effects and disconnected model role declarations are not friendly required roles',async()=>{
 const f=fixture({unknown:{profileId:'chosen'}});let effects=0;const result=await runWorkflow(f.root,{target:f.target,onStage:()=>effects++,request:()=>effects++});assert.equal(result.ok,false);assert.equal(effects,0);assert.equal(result.actualCalls,0);assert.equal(result.error.code,'INVALID_OVERRIDE');
 const roles=inspectIterationTextRoles(f.ref,f.root.definitions);assert.equal(roles.ok,true);assert.deepEqual(roles.data.map(row=>row.role),['decision']);assert.equal(prepareIterationBindingOverride(f.root.nodes.each,f.root.definitions,{role:'unknown',field:'profileId',mode:'override',value:'chosen'}).ok,false);
});
test('friendly effective helper binding reports explicit nested wrapper precedence without masking it with the outer choice',()=>{
 const f=fixture(),raw={id:'bound-wrapper',version:1,name:'Bound wrapper',interface:f.def.interface,parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'},child:{id:'child',type:'subgraph',definition:f.ref,roleOverrides:{decision:{profileId:'ambient',model:null}}}},wires:{a:edge('a','entry','out','child','item'),b:edge('b','child','result','exit','in')}}};
 const identity=computeDefinitionIdentity(raw),def={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:def.id,version:1,semanticHash:def.semanticHash};f.root.definitions[definitionRefKey(ref)]=def;f.root.nodes.each.helper=ref;
 const row=panel(f).helperBindings.roles[0];assert.equal(row.profile.value,'chosen');assert.match(row.effective,/Ambient connection/);assert.doesNotMatch(row.effective,/Chosen connection/);assert.match(row.caveat,/nested/);
});
import {validIterationRoleOverrides} from '../src/workflow/operations/control-nodes.js?v=0.27.1';
test('helper binding validation rejects accessor selectors without invoking callbacks',()=>{
 let reads=0;const bindings={decision:{get profileId(){reads++;return 'chosen';}}};assert.equal(validIterationRoleOverrides(bindings),false);assert.equal(reads,0);
});
import {UNIFIED_WORKFLOW_EXAMPLE_DATA} from '../src/workflow/unified-example-data.js?v=0.27.1';
import {parseWorkflow} from '../src/workflow/packages.js?v=0.27.1';
import {normalizeOccurrences,confirmOccurrences,resolveItemHolders} from '../src/workflow/operations/event-data.js?v=0.27.1';
import {selectRandomOutcomes} from '../src/workflow/operations/random-outcomes.js?v=0.27.1';
test('published broken-wand confirmation and wild helpers accept local profile choices with unchanged imported pins',async()=>{
 const imported=parseWorkflow(JSON.stringify(UNIFIED_WORKFLOW_EXAMPLE_DATA.find(entry=>entry.id==='unified-broken-wand').packages[0]));assert.equal(imported.ok,true,JSON.stringify(imported.error));const graph=imported.data,definitions=structuredClone(graph.definitions),before=structuredClone(definitions);
 const source={sourceId:'action-42',revision:'r1',sceneId:'scene-42',watch:'player-message',text:'Mara casts the broken wand.',visibility:'public'},normalized=normalizeOccurrences(source,[{eventType:'item-used',actorId:'mara',itemId:'broken-wand',position:{start:0,end:source.text.length},semantics:'actual'}],{actorIds:['mara'],itemIds:['broken-wand']});assert.equal(normalized.ok,true);
 const confirmed=confirmOccurrences(normalized.data.events,[{eventId:normalized.data.events[0].eventId,accepted:true}]),event=resolveItemHolders({'broken-wand':'mara'},confirmed.data.events).data.events[0],picked=await selectRandomOutcomes([event],{libraryId:'wand-effects',revision:'r1',itemId:'broken-wand',effects:[{id:'wild',kind:'generate',weight:1}]},[],{random:()=>.5});assert.equal(picked.ok,true);
 for(const [nodeId,item,expected]of [['confirm-each',normalized.data.events[0],[['chosen','profile-default']]],['resolve-each',picked.data.outcomes[0],[['ambient','ambient-model'],['chosen','profile-default']]]]){
  const eachNode={...structuredClone(graph.nodes[nodeId]),id:'each'},roles=inspectIterationTextRoles(eachNode.helper,definitions);assert.equal(roles.ok,true);
  for(const row of roles.data){const chosen=prepareIterationBindingOverride(eachNode,definitions,{role:row.role,field:'profileId',mode:'override',value:row.role==='effectAuthor'?'ambient':'chosen'});assert.equal(chosen.ok,true,JSON.stringify(chosen.error));eachNode.roleOverrides=chosen.data.roleOverrides;}
  const root={id:'published-helper',schema:3,runtime:2,mode:'native-unified',definitions,roles:graph.roles,nodes:{items:node('items','text',{text:JSON.stringify([item])}),decode:node('decode','json-decode'),each:eachNode},wires:{a:edge('a','items','out','decode','in'),b:edge('b','decode','out','each','in')}},host=textHost();
  host.context.ConnectionManagerRequestService.sendRequest=async(profileId,messages,maxTokens,options,payload)=>{host.requests.push({profileId,payload});const answer=messages[0].content.startsWith('Invent')?{id:'paper-moths',description:'Paper moths circle Mara.',spellOutcome:'replaced',duration:'One minute',consequence:'The target is unharmed.'}:{answers:{[nodeId==='confirm-each'?'actual':'novel']:{type:'noul',accepted:true}}};return {choices:[{message:{content:JSON.stringify(answer)},finish_reason:'stop'}]};};
  const result=await runWorkflow(root,{target:{workflowId:root.id,instancePath:[],nodeId:'each',portId:'out'},resolveBinding:(n,g)=>resolveBinding(n,g,host.context),countTokens:async()=>({tokens:1}),request:options=>requestModel(options,host.context)});assert.equal(result.ok,true,nodeId+JSON.stringify(result.error));assert.deepEqual(host.requests.map(r=>[r.profileId,r.payload.model]),expected);assert.deepEqual(definitions,before);
 }
});
import {prepareLibraryViews} from '../src/ui/workspace-preparation.js?v=0.27.1';
test('readonly library For Each inspection retains a complete helper binding DTO',()=>{
 const f=fixture(),raw={id:'library-each',version:1,name:'Library For Each',interface:f.def.interface,parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'},each:node('each','for-each',{helper:f.ref,limit:2,requestBoundPerIteration:1})},wires:{a:edge('a','entry','out','each','in'),b:edge('b','each','out','exit','in')}}};const identity=computeDefinitionIdentity(raw),def={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:def.id,version:1,semanticHash:def.semanticHash};f.root.definitions[definitionRefKey(ref)]=def;
 const library=prepareLibraryViews('root',f.root.definitions);assert.equal(library.ok,true,JSON.stringify(library.error));const prepared=library.data.preparedViews.find(view=>definitionRefKey(view.definitionRef)===definitionRefKey(ref)),editor={readOnly:true,prepared,view:{identity:prepared.identity,key:'library',selection:{primary:{kind:'node',id:'each'}},nodePresentation:{}}};
 const details=projectWorkspacePanels(editor,{profiles:[],nodes:[],issues:[]},{},'library-r1',null,null).nodeDetails;assert.ok(Array.isArray(details.helperBindings.roles));assert.equal(details.helperBindings.editable,false);assert.deepEqual(details.helperBindings.roles.map(row=>row.role),['decision']);assert.deepEqual(details.helperBindings.roles[0].profile.options,[{value:'lattice:active-sillytavern',label:'Active SillyTavern model'}]);
});


test('For Each reports explicit Active and fixed helper-node connections and disables choices that affect no calls',()=>{
 for(const profileId of ['lattice:active-sillytavern','ambient']){
  const f=fixture(),raw=structuredClone(f.def);delete raw.semanticHash;raw.body.nodes.decide.profileId=profileId;
  const identity=computeDefinitionIdentity(raw);assert.equal(identity.ok,true,JSON.stringify(identity.error));const def={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:def.id,version:1,semanticHash:def.semanticHash};f.root.definitions={[definitionRefKey(ref)]:def};f.root.nodes.each.helper=ref;
  const before=structuredClone(f.root),row=panel(f).helperBindings.roles[0];
  assert.equal(row.profile.editable,false);assert.equal(row.model.editable,false);assert.equal(row.profile.value,'chosen');
  assert.match(row.source,/Explicit helper-node/);assert.match(row.caveat,/0 of 1 helper calls/);
  assert.match(row.effective,new RegExp(profileId==='ambient'?'Ambient connection':'Active SillyTavern model'));assert.deepEqual(f.root,before);
 }
});
test('an explicit ordinary helper-node profile keeps its captured request despite a For Each role choice',async()=>{
 const f=fixture(),raw=structuredClone(f.def);delete raw.semanticHash;raw.body.nodes.decide.profileId='ambient';
 const identity=computeDefinitionIdentity(raw),def={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:def.id,version:1,semanticHash:def.semanticHash};f.root.definitions={[definitionRefKey(ref)]:def};f.root.nodes.each.helper=ref;
 const before=structuredClone(f.def),host=textHost();const result=await runWorkflow(f.root,{target:f.target,resolveBinding:(n,g)=>resolveBinding(n,g,host.context),countTokens:async()=>({tokens:1}),request:options=>requestModel(options,host.context)});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,1);assert.deepEqual(host.requests.map(r=>[r.profileId,r.payload.model]),[['ambient','ambient-model']]);assert.deepEqual(f.def,before);
});

test('a fixed helper occurrence profile leaves an inherited model override useful and projects its captured model',async()=>{
 const f=fixture({decision:{profileId:'chosen',model:'custom-helper-model'}}),raw={id:'profile-wrapper',version:1,name:'Profile wrapper',interface:f.def.interface,parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'},child:{id:'child',type:'subgraph',definition:f.ref,nodeBindingOverrides:{[nodeBindingOverrideKey([],'decide')]:{profileId:'ambient'}}}},wires:{a:edge('a','entry','out','child','item'),b:edge('b','child','result','exit','in')}}};
 const identity=computeDefinitionIdentity(raw);assert.equal(identity.ok,true,JSON.stringify(identity.error));const def={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:def.id,version:1,semanticHash:def.semanticHash};f.root.definitions[definitionRefKey(ref)]=def;f.root.nodes.each.helper=ref;
 const host=textHost(),result=await runWorkflow(f.root,{target:f.target,resolveBinding:(n,g)=>resolveBinding(n,g,host.context),countTokens:async()=>({tokens:1}),request:options=>requestModel(options,host.context)});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(host.requests.map(r=>[r.profileId,r.payload.model]),[['ambient','custom-helper-model']]);
 const row=panel(f).helperBindings.roles[0];assert.equal(row.profile.editable,false);assert.equal(row.model.editable,true);assert.match(row.effective,/custom-helper-model/);
});
