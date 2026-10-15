import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNodeReadiness } from '../src/ui/node-readiness.js';

test('setup issues retain field addresses and take priority over unconnected required pins', () => {
    const address = {workflowId:'root',instancePath:['one'],nodeId:'memory'};
    const result = prepareNodeReadiness({address, setupIssues:[{code:'ACTOR_REQUIRED',message:'Choose an actor',field:'actorId'}], ports:[{id:'in',direction:'input',required:true,label:'Context'}], wires:[]});
    assert.equal(result.state,'setup');
    assert.equal(result.label,'Setup Required');
    assert.equal(result.issues.length,2);
    assert.deepEqual(result.issues[0],{code:'ACTOR_REQUIRED',message:'Choose an actor',field:'actorId',address,category:'setup'});
    assert.equal(prepareNodeReadiness({address,ports:[],wires:[]}).state,'ready');
});

test('workspace projection retains incomplete Prompted Memory pins and reports only actual setup requirements',async()=>{
    const {prepareWorkspaceViews,projectNodeProfiles}=await import('../src/ui/workspace-preparation.js?v=0.27.3');
    const {operationDefaults}=await import('../src/workflow/catalog.js?v=0.27.3');
    const {createGraphViewSession}=await import('../src/ui/graph-view-session.js?v=0.27.3');
    const {projectPreparedWorkflow}=await import('../src/ui/workflow-surface.js?v=0.27.3');
    const make=(id,operation)=>({...operationDefaults(operation),id,type:'workflow',operationVersion:1,phase:'pre',enabled:true,x:100,y:100});
    const root={id:'readiness',schema:3,runtime:2,mode:'native-unified',nodes:{memory:make('memory','prompted-memory'),compose:make('compose','compose')},wires:{},portals:{},groups:{},roles:{},definitions:{}};
    const prepared=prepareWorkspaceViews(root);assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const view=prepared.data.preparedViews[0],cards=view.drawBase.nativeCards;
    assert.ok(cards.memory.ports.length);
    assert.equal(cards.memory.readiness.state,'setup');
    assert.ok(cards.memory.readiness.issues.some(issue=>issue.field==='actorId'));
    assert.notEqual(cards.compose.readiness.state,'setup');
    const session=createGraphViewSession({root,activationId:'readiness',...prepared.data}).data;
    const rows=projectNodeProfiles(session.readEditor(),projectPreparedWorkflow(prepared.data.workflow),'r1');
    assert.ok(rows.some(row=>row.id==='memory' && row.readiness.state==='setup'));
    assert.equal(rows.some(row=>row.id==='compose'),false,'Ready deterministic nodes need no empty decoration container');
});

test('effective occurrences and wrappers count setup by full source address while library parameters remain external contracts',async()=>{
    const {prepareWorkspaceViews,prepareLibraryViews}=await import('../src/ui/workspace-preparation.js?v=0.27.3');
    const {computeDefinitionIdentity,definitionRefKey}=await import('../src/workflow/definitions.js');
    const {operationDefaults}=await import('../src/workflow/catalog.js');
    const raw={id:'memory-library',version:1,name:'Memory library',parameters:[{id:'actor',label:'Actor',target:{instancePath:[],nodeId:'memory',controlId:'actorId'}}],interface:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{memory:{id:'memory',type:'workflow',...operationDefaults('prompted-memory')}},wires:{}}};
    const identity=computeDefinitionIdentity(raw);assert.equal(identity.ok,true,JSON.stringify(identity));
    const def={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:def.id,version:def.version,semanticHash:def.semanticHash};
    const root={id:'instances',schema:3,runtime:2,mode:'native-unified',nodes:{one:{id:'one',type:'subgraph',definition:ref,parameterOverrides:{actor:'real-actor'}},two:{id:'two',type:'subgraph',definition:ref}},wires:{},definitions:{[definitionRefKey(def)]:def}};
    const prepared=prepareWorkspaceViews(root);assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const one=prepared.data.preparedViews.find(view=>view.identity.instancePath?.[0]==='one'),two=prepared.data.preparedViews.find(view=>view.identity.instancePath?.[0]==='two');
    assert.notEqual(one.drawBase.nativeCards.memory.readiness.state,'setup');
    assert.equal(two.drawBase.nativeCards.memory.readiness.state,'setup');
    const wrapper=prepared.data.preparedViews[0].drawBase.nativeCards.two.readiness;
    assert.equal(wrapper.setup,1);assert.equal(wrapper.issues[0].address.instancePath[0],'two');
    const library=prepareLibraryViews(root.id,root.definitions);assert.equal(library.ok,true,JSON.stringify(library));
    assert.notEqual(library.data.preparedViews[0].drawBase.nativeCards.memory.readiness.state,'setup');
});

test('live resources are deferred without an evaluator and evaluated failures use safe prepared diagnostic copy',async()=>{
    const {prepareWorkspaceViews}=await import('../src/ui/workspace-preparation.js?v=0.27.3');
    const {operationDefaults}=await import('../src/workflow/catalog.js');
    const root={id:'resource-readiness',schema:3,runtime:2,mode:'native-unified',nodes:{model:{id:'model',type:'workflow',...operationDefaults('model-call')},file:{id:'file',type:'workflow',...operationDefaults('read-file'),targetId:'unavailable-document'}},wires:{}};
    const absent=prepareWorkspaceViews(root);assert.equal(absent.ok,true);
    assert.notEqual(absent.data.preparedViews[0].drawBase.nativeCards.model.readiness.state,'setup');
    assert.notEqual(absent.data.preparedViews[0].drawBase.nativeCards.file.readiness.state,'setup');
    assert.ok(absent.data.preparedViews[0].drawBase.nativeCards.model.readiness.deferred.length);
    const live=prepareWorkspaceViews(root,{resolveBinding:()=>({ok:false,error:{code:'UNAVAILABLE',message:'private-host-reply hidden-model-secret'}}),workflowData:{available:true,documents:[]}});
    assert.equal(live.ok,true);
    const cards=live.data.preparedViews[0].drawBase.nativeCards;
    assert.equal(cards.model.readiness.state,'setup');assert.equal(cards.model.readiness.issues[0].field,'profileId');
    assert.ok(!cards.model.readiness.description.includes('private-host-reply'));
    assert.equal(cards.file.readiness.state,'setup');assert.equal(cards.file.readiness.issues[0].field,'targetId');
});

test('selected pinned helper body setup is projected onto its For Each control',async()=>{
    const {prepareWorkspaceViews}=await import('../src/ui/workspace-preparation.js?v=0.27.3');
    const {computeDefinitionIdentity,definitionRefKey}=await import('../src/workflow/definitions.js');
    const {operationDefaults}=await import('../src/workflow/catalog.js');
    const raw={id:'incomplete-helper',version:1,name:'Helper',parameters:[],interface:[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'}],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'},memory:{id:'memory',type:'workflow',...operationDefaults('prompted-memory')}},wires:{pass:{id:'pass',route:'wire',from:'entry',fromPort:'out',to:'exit',toPort:'in'}}}};
    const identity=computeDefinitionIdentity(raw);assert.equal(identity.ok,true,JSON.stringify(identity));const def={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash};
    const root={id:'helper-readiness',schema:3,runtime:2,mode:'native-unified',nodes:{each:{id:'each',type:'workflow',...operationDefaults('for-each'),helper:{id:def.id,version:def.version,semanticHash:def.semanticHash},requestBoundPerIteration:1}},wires:{},definitions:{[definitionRefKey(def)]:def}};
    const prepared=prepareWorkspaceViews(root);assert.equal(prepared.ok,true,JSON.stringify(prepared));
    const readiness=prepared.data.preparedViews[0].drawBase.nativeCards.each.readiness;
    assert.equal(readiness.state,'setup');assert.equal(readiness.issues[0].field,'helper');assert.match(readiness.description,/memory/);
});

test('summaries count each full occurrence once using its primary readiness category',async()=>{
    const {summarizeReadiness}=await import('../src/ui/node-readiness.js');
    const address=(instance,nodeId)=>({workflowId:'root',instancePath:[instance],nodeId});
    const setup=prepareNodeReadiness({address:address('one','same'),setupIssues:[{code:'A',message:'Actor',field:'actorId'},{code:'B',message:'Memory set',field:'memorySetId'}],ports:[{id:'in',required:true,direction:'input'}]});
    const input=prepareNodeReadiness({address:address('two','same'),ports:[{id:'in',required:true,direction:'input'}]});
    const summary=summarizeReadiness([setup,input,setup]);
    assert.equal(summary.setup,1);assert.equal(summary.input,1);assert.equal(summary.label,'1 needs setup · 1 needs input');
});
