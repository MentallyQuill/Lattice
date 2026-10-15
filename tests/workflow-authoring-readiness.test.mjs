import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareNativeConnectionEdit } from '../src/workflow/connection-edits.js';
import { describeOperation, portsForNode } from '../src/workflow/catalog.js';
const empty = () => ({ id:'authoring',schema:3,runtime:2,mode:'native-unified',nodes:{},wires:{},groups:{},definitions:{},portals:{} });
test('default Prompted Memory places with actual incomplete settings and declared pins', () => {
 const result=prepareNativeConnectionEdit(empty(),{kind:'create',operation:'prompted-memory',graphPoint:{x:0,y:0}});
 assert.equal(result.ok,true,JSON.stringify(result));
 const graph=result.data.candidate,node=graph.nodes[result.data.addedNodeIds[0]];
 assert.equal(node.actorId,'');
 assert.deepEqual(portsForNode(graph,node).map(port=>port.id),['presence','event','out']);
 assert.equal(describeOperation(graph,node).ok,false);
});
import { describeAuthoredOperation, operationDefaults, OPERATIONS } from '../src/workflow/catalog.js';
import { prepareNodeControlChange, graphSemanticSignature } from '../src/workflow/ports.js';
import { resolveWorkflow } from '../src/workflow/resolve.js';
import { validateGraphStructure } from '../src/workflow/contracts.js';
test('Recall saves actor while memory set remains incomplete and changes semantic signature',()=>{
 const graph=empty();graph.nodes.recall={id:'recall',type:'workflow',...operationDefaults('recall')};
 const before=graphSemanticSignature(graph);
 const edit=prepareNodeControlChange(graph,{nodeId:'recall',controls:{actorId:'actor-real'}});
 assert.equal(edit.ok,true,JSON.stringify(edit));
 assert.notEqual(graphSemanticSignature(edit.data.candidate),before);
 const described=describeAuthoredOperation(edit.data.candidate,edit.data.candidate.nodes.recall);
 assert.deepEqual(described.data.setupIssues.map(issue=>issue.field),['memorySetId']);
 assert.equal(prepareNativeConnectionEdit(edit.data.candidate,{kind:'create',operation:'text',graphPoint:{x:10,y:10}}).ok,true);
});
test('default For Each is authored with an empty helper, but a claimed real helper remains exact',()=>{
 const graph=empty();graph.nodes.each={id:'each',type:'workflow',...operationDefaults('for-each')};
 assert.equal(validateGraphStructure(graph).ok,true);
 assert.deepEqual(describeAuthoredOperation(graph,graph.nodes.each).data.setupIssues.map(issue=>issue.field),['helper']);
 graph.nodes.each.helper={id:'real-helper',version:1,semanticHash:''};
 assert.equal(validateGraphStructure(graph).ok,false);
});
test('selected independent target excludes incomplete settings while included settings fail preflight',()=>{
 const graph=empty();graph.nodes.text={id:'text',type:'workflow',...operationDefaults('text')};
 graph.nodes.recall={id:'recall',type:'workflow',...operationDefaults('recall')};
 const good=resolveWorkflow(graph,{target:{workflowId:graph.id,instancePath:[],nodeId:'text',portId:'out'}});
 assert.equal(good.ok,true,JSON.stringify(good));
 const bad=resolveWorkflow(graph,{target:{workflowId:graph.id,instancePath:[],nodeId:'recall',portId:'out'}});
 assert.equal(bad.ok,false);assert.equal(bad.error.code,'INVALID_SETTINGS');assert.equal(bad.error.address.nodeId,'recall');
});
test('all registered defaults with supported phase admit declared authoring controls',()=>{
 for(const operation of Object.keys(OPERATIONS).filter(id=>id!=='reroute')){
  const graph=empty(),node={id:operation,type:'workflow',...operationDefaults(operation)};
  const result=describeAuthoredOperation(graph,node);
  assert.equal(result.ok,true,operation+': '+JSON.stringify(result));
 }
});
import { computeDefinitionIdentity, definitionRefKey, validateDefinition } from '../src/workflow/definitions.js';
import { installDefinition } from '../src/workflow/definition-library.js';
import { exportWorkflow, parseWorkflow, exportSubgraph, parseSubgraph } from '../src/workflow/packages.js';
import { serializeWorkflowDocument, parseWorkflowDocument } from '../src/workflow/document-file.js';
import { makeClip, readClip, prepareClipPaste } from '../src/workflow/clipboard.js';
import { runWorkflowForHost } from '../src/workflow/runtime.js';
const must=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.data;};
function incompleteDefinition(extra={}) {
 const raw={id:'incomplete-local',version:1,name:'Incomplete local',interface:[],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{memory:{id:'memory',type:'workflow',...operationDefaults('prompted-memory')}},wires:{}},...extra};
 const identity=must(computeDefinitionIdentity(raw));return {...identity.materializedDefinition,semanticHash:identity.semanticHash};
}
test('unused incomplete exact snapshots persist and do not block an independent target; publication stays strict',()=>{
 const def=incompleteDefinition(),graph=empty();graph.definitions[definitionRefKey(def)]=def;
 graph.nodes.text={id:'text',type:'workflow',...operationDefaults('text')};
 assert.equal(validateGraphStructure(graph).ok,true);
 assert.equal(resolveWorkflow(graph,{target:{workflowId:graph.id,instancePath:[],nodeId:'text',portId:'out'}}).ok,true);
 assert.equal(installDefinition({definitions:{}},def).ok,false);
 const opened=must(parseWorkflowDocument(must(serializeWorkflowDocument(graph)).json)).graph;
 assert.equal(opened.definitions[definitionRefKey(def)].body.nodes.memory.actorId,'');
 const subgraph=must(parseSubgraph(JSON.stringify(exportSubgraph(def))));assert.equal(subgraph.definition.body.nodes.memory.actorId,'');
 const changed=structuredClone(def);changed.body.nodes.memory.prompt='A partial prompt';delete changed.semanticHash;
 assert.notEqual(must(computeDefinitionIdentity(changed)).semanticHash,def.semanticHash);
 const tampered=structuredClone(graph);tampered.definitions[definitionRefKey(def)].body.nodes.memory.prompt='tampered';
 assert.equal(validateGraphStructure(tampered).error.code,'DEFINITION_HASH');
});
test('incomplete root settings round trip local, portable, and clipboard documents',()=>{
 const graph=empty();for(const operation of ['recall','for-each'])graph.nodes[operation]={id:operation,type:'workflow',...operationDefaults(operation)};
 const local=must(parseWorkflowDocument(must(serializeWorkflowDocument(graph)).json)).graph;
 assert.equal(local.nodes.recall.actorId,'');assert.deepEqual(local.nodes['for-each'].helper,graph.nodes['for-each'].helper);
 const portable=must(parseWorkflow(JSON.stringify(exportWorkflow(graph))));assert.equal(portable.nodes.recall.actorId,'');
 const clip=must(makeClip(graph,{nodeIds:['recall','for-each']}));
 assert.equal(readClip(clip).ok,true);
 const pasted=prepareClipPaste(empty(),clip);assert.equal(pasted.ok,true,JSON.stringify(pasted));
});
test('included incomplete settings reject before all prepare/source/model/host effects',async()=>{
 const graph=empty();graph.nodes.recall={id:'recall',type:'workflow',...operationDefaults('recall')};let effects=0;
 const result=await runWorkflowForHost(graph,{target:{workflowId:graph.id,instancePath:[],nodeId:'recall',portId:'out'},resolveBinding(){effects++;},executeHostOperation(){effects++;},request(){effects++;}},{prepare(){effects++;}});
 assert.equal(result.ok,false);assert.equal(result.error.code,'INVALID_SETTINGS');assert.equal(effects,0);
});
import { makeLocalCopy, prepareNativeNodeEdit } from '../src/workflow/definition-library.js';
const pinRef=def=>({id:def.id,version:def.version,semanticHash:def.semanticHash});
const pinDefinition=raw=>{const value=must(computeDefinitionIdentity(raw));return {...value.materializedDefinition,semanticHash:value.semanticHash};};
const wire=(id,from,to,fromPort='out',toPort='in')=>({id,route:'wire',from,fromPort,to,toPort});
test('nested owned local settings update exact ancestor hashes and reject stale references',()=>{
 const leaf=incompleteDefinition();
 const parent=pinDefinition({id:'parent',version:1,name:'Parent',interface:[],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{child:{id:'child',type:'subgraph',definition:pinRef(leaf)}},wires:{}}});
 const graph=empty();graph.definitions={[definitionRefKey(leaf)]:leaf,[definitionRefKey(parent)]:parent};graph.nodes.wrapper={id:'wrapper',type:'subgraph',definition:pinRef(parent)};
 const copied=must(makeLocalCopy(graph,{instancePath:['wrapper','child'],id:'owned-leaf'})).candidate;
 const oldParent=copied.nodes.wrapper.definition,oldLeaf=copied.definitions[definitionRefKey(oldParent)].body.nodes.child.definition;
 const command={kind:'controls',viewPath:['wrapper','child'],expectedRef:oldLeaf,nodeId:'memory',controls:{prompt:'Partial saved prompt'}};
 const changed=must(prepareNativeNodeEdit(copied,command)).candidate;
 assert.notEqual(changed.nodes.wrapper.definition.semanticHash,oldParent.semanticHash);
 const child=changed.definitions[definitionRefKey(changed.nodes.wrapper.definition)].body.nodes.child.definition;
 assert.notEqual(child.semanticHash,oldLeaf.semanticHash);assert.equal(changed.definitions[definitionRefKey(child)].body.nodes.memory.actorId,'');
 assert.equal(prepareNativeNodeEdit(changed,command).ok,false);
 assert.equal(validateGraphStructure(changed).ok,true);
 const reopened=must(parseWorkflowDocument(must(serializeWorkflowDocument(changed)).json)).graph;
 assert.deepEqual(reopened.localDefinitionOwners,changed.localDefinitionOwners);
});
test('library publication permits exposed caller settings and inherited model roles',()=>{
 const def=incompleteDefinition({parameters:[{id:'actor',label:'Actor',target:{instancePath:[],nodeId:'memory',controlId:'actorId'}}]});
 assert.equal(validateDefinition(def).ok,true);assert.equal(installDefinition({definitions:{}},def).ok,true);
});
test('selected For Each validates all helper settings before preparation, including unused helper branches',async()=>{
 const def=pinDefinition({id:'helper',version:1,name:'Helper',parameters:[],interface:[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'}],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'},memory:{id:'memory',type:'workflow',...operationDefaults('prompted-memory')}},wires:{pass:wire('pass','entry','exit')}}});
 const graph=empty();graph.definitions[definitionRefKey(def)]=def;
 graph.nodes={text:{id:'text',type:'workflow',...operationDefaults('text'),text:'[]'},decode:{id:'decode',type:'workflow',...operationDefaults('json-decode')},each:{id:'each',type:'workflow',...operationDefaults('for-each'),helper:pinRef(def),requestBoundPerIteration:1}};
 graph.wires={a:wire('a','text','decode'),b:wire('b','decode','each')};let effects=0;
 const target=nodeId=>({workflowId:graph.id,instancePath:[],nodeId,portId:'out'});
 const good=await runWorkflowForHost(graph,{target:target('text')});assert.equal(good.ok,true,JSON.stringify(good));
 const bad=await runWorkflowForHost(graph,{target:target('each'),resolveBinding(){effects++;},executeHostOperation(){effects++;}},{prepare(){effects++;}});
 assert.equal(bad.ok,false);assert.equal(bad.error.code,'INVALID_SETTINGS');assert.equal(effects,0);
});
test('custom iteration adapters cannot bypass included helper setup preflight',async()=>{
 const def=incompleteDefinition(),graph=empty();graph.definitions[definitionRefKey(def)]=def;
 graph.nodes={text:{id:'text',type:'workflow',...operationDefaults('text'),text:'[]'},decode:{id:'decode',type:'workflow',...operationDefaults('json-decode')},each:{id:'each',type:'workflow',...operationDefaults('for-each'),helper:pinRef(def)}};
 graph.wires={a:wire('a','text','decode'),b:wire('b','decode','each')};let effects=0;
 const result=await runWorkflowForHost(graph,{target:{workflowId:graph.id,instancePath:[],nodeId:'each',portId:'out'},iterateHelper(){effects++;}},{prepare(){effects++;}});
 assert.equal(result.ok,false);assert.equal(effects,0);
});
test('canonical mode changes retain missing actor, keyed update, and reroll settings progressively',()=>{
 for(const [operation,controls,field] of [['read-file',{actorScope:'presence'},'actorId'],['write-file',{mode:'update-fields'},'fields'],['random-pick',{rerollPolicy:'explicit'},'rerollId']]) {
  const graph=empty();graph.nodes.node={id:'node',type:'workflow',...operationDefaults(operation)};
  const edit=prepareNodeControlChange(graph,{nodeId:'node',controls});assert.equal(edit.ok,true,operation+': '+JSON.stringify(edit));
  const described=describeAuthoredOperation(edit.data.candidate,edit.data.candidate.nodes.node);
  assert.ok(described.data.setupIssues.some(issue=>issue.field===field));assert.equal(describeOperation(edit.data.candidate,edit.data.candidate.nodes.node).ok,false);
 }
});
test('planner and library publication inspect referenced helper setup without running it',()=>{
 const helper=incompleteDefinition(),ref=pinRef(helper);
 const owner=pinDefinition({id:'owner',version:1,name:'Owner',interface:[],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{each:{id:'each',type:'workflow',...operationDefaults('for-each'),helper:ref}},wires:{}}});
 assert.equal(installDefinition({definitions:{}},owner,{[definitionRefKey(helper)]:helper}).ok,false);
 const graph=empty();graph.definitions[definitionRefKey(helper)]=helper;
 graph.nodes={text:{id:'text',type:'workflow',...operationDefaults('text'),text:'[]'},decode:{id:'decode',type:'workflow',...operationDefaults('json-decode')},each:{id:'each',type:'workflow',...operationDefaults('for-each'),helper:ref}};
 graph.wires={a:wire('a','text','decode'),b:wire('b','decode','each')};
 const result=resolveWorkflow(graph,{target:{workflowId:graph.id,instancePath:[],nodeId:'each',portId:'out'}});
 assert.equal(result.ok,false);assert.equal(result.error.field,'helper');assert.equal(result.error.address.nodeId,'each');
});
