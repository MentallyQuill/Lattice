import test from 'node:test';import assert from 'node:assert/strict';
import {installWorkflowExample} from '../src/workflow/examples.js';
import {prepareNativeNodeEdit,makeLocalCopy} from '../src/workflow/definition-library.js';
import {captureGraphEditContext} from '../src/workflow/transactions.js';
import {computeDefinitionIdentity,definitionRefKey} from '../src/workflow/definitions.js';
import {prepareSubgraphNodeDeletion} from '../src/workflow/subgraph-authoring.js';
import {prepareAddSystem} from '../src/workflow/system-authoring.js';
const reference=d=>({id:d.id,version:d.version,semanticHash:d.semanticHash});
function definition(){const result=computeDefinitionIdentity({id:'foundation-label',version:1,name:'Foundation label',interface:[],parameters:[],body:{schema:4,runtime:3,mode:'native-unified',nodes:{text:{id:'text',type:'workflow',operation:'text',text:'label'}},wires:{}}});assert.equal(result.ok,true,JSON.stringify(result.error));return {...result.data.materializedDefinition,semanticHash:result.data.semanticHash};}
test('foundation normal controls edit schema4 runtime3 and preserve the original until commit',()=>{
 const graph=installWorkflowExample('lesson-34').data.graph,node=Object.values(graph.nodes).find(n=>n.operation==='chunk'),before=structuredClone(graph),edited=prepareNativeNodeEdit(graph,{kind:'controls',viewPath:[],nodeId:node.id,controls:{overlap:16}});assert.equal(edited.ok,true,JSON.stringify(edited.error));assert.equal(edited.data.candidate.nodes[node.id].overlap,16);assert.equal(edited.data.candidate.runtime,3);assert.deepEqual(graph,before);
});
test('foundation owned nested runtime3 edits retain exact pins and ownership checks',()=>{
 const leaf=definition(),shared={id:'foundation-owned',schema:4,runtime:3,mode:'native-unified',nodes:{part:{id:'part',type:'subgraph',definition:reference(leaf)}},wires:{},definitions:{[definitionRefKey(leaf)]:leaf}},copied=makeLocalCopy(shared,{instancePath:['part'],id:'private-label'});assert.equal(copied.ok,true,JSON.stringify(copied.error));const graph=copied.data.candidate,context={sessionId:'foundation-editor',viewPath:['part'],readOnly:false};
 assert.equal(captureGraphEditContext(graph,()=>context).ok,true);assert.equal(captureGraphEditContext(shared,()=>context).error.code,'READ_ONLY_DEFINITION');
 const edited=prepareNativeNodeEdit(graph,{kind:'controls',viewPath:['part'],expectedRef:graph.nodes.part.definition,nodeId:'text',controls:{text:'edited'}});assert.equal(edited.ok,true,JSON.stringify(edited.error));assert.notEqual(edited.data.candidate.nodes.part.definition.semanticHash,graph.nodes.part.definition.semanticHash);
});
test('foundation node deletion removes its incident wires as one prepared edit',()=>{
 const graph=installWorkflowExample('lesson-34').data.graph,node=Object.values(graph.nodes).find(n=>n.operation==='chunk'),before=structuredClone(graph),edited=prepareSubgraphNodeDeletion(graph,{viewPath:[],nodeIds:[node.id],groupIds:[]});assert.equal(edited.ok,true,JSON.stringify(edited.error));assert.equal(edited.data.candidate.nodes[node.id],undefined);assert.ok(Object.values(edited.data.candidate.wires).every(w=>w.from!==node.id&&w.to!==node.id));assert.deepEqual(graph,before);
});
test('foundation generation roots retain existing Add System authoring without new system capabilities',()=>{
 const graph=installWorkflowExample('lesson-34').data.graph,leaf=definition(),edited=prepareAddSystem(graph,{definition:leaf,snapshots:{},graphPoint:{x:100,y:100},inputs:{},outputs:[]});assert.equal(edited.ok,true,JSON.stringify(edited.error));assert.equal(edited.data.candidate.runtime,3);assert.ok(Object.values(edited.data.candidate.nodes).some(n=>n.type==='subgraph'));
});
