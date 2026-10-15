import assert from 'node:assert/strict';
import {test} from 'node:test';
import {operationDefaults} from '../src/workflow/catalog.js';
import {computeDefinitionIdentity,definitionRefKey} from '../src/workflow/definitions.js';
import {installDefinition} from '../src/workflow/definition-library.js';

function definition(id,operation){
 const result=computeDefinitionIdentity({id,version:1,name:id,interface:[],parameters:[],body:{schema:3,runtime:2,mode:'native-pre',nodes:{node:{id:'node',type:'workflow',...operationDefaults(operation)}},wires:{},portals:{},roles:{}}});
 assert.equal(result.ok,true,JSON.stringify(result.error));return {...result.data.materializedDefinition,semanticHash:result.data.semanticHash};
}

test('library installation rejects unrelated incomplete snapshots even when its chosen definition is complete',()=>{
 const complete=definition('complete','text'),incomplete=definition('incomplete','for-each');
 const result=installDefinition({definitions:{}},complete,{[definitionRefKey(incomplete)]:incomplete});
 assert.equal(result.ok,false,'Every installed library entry must satisfy its internal setup contract');
});
import {inspectDefinitionGraph} from '../src/workflow/graph-validation.js';
import {exportSubgraph,parseSubgraph,selectSubgraphClosure} from '../src/workflow/packages.js';
import {resolveWorkflow} from '../src/workflow/resolve.js';

test('unused incomplete local snapshots still allow independent target execution',()=>{
 const incomplete=definition('local-incomplete','for-each');
 const graph={id:'root',schema:3,runtime:2,mode:'native-unified',nodes:{text:{id:'text',type:'workflow',...operationDefaults('text')}},wires:{},definitions:{[definitionRefKey(incomplete)]:incomplete}};
 const result=resolveWorkflow(graph,{target:{workflowId:'root',instancePath:[],nodeId:'text',portId:'out'}});
 assert.equal(result.ok,true,JSON.stringify(result));
});

test('sparse default For Each definitions export and import with their canonical empty helper',()=>{
 const sparse=structuredClone(definition('sparse','for-each'));delete sparse.body.nodes.node.helper;
 assert.equal(inspectDefinitionGraph(sparse).ok,true);
 const exported=exportSubgraph(sparse),imported=parseSubgraph(JSON.stringify(exported));
 assert.equal(imported.ok,true,JSON.stringify(imported));
 assert.equal(imported.data.definition.semanticHash,sparse.semanticHash);
 assert.deepEqual(imported.data.definition.body.nodes.node.helper,operationDefaults('for-each').helper);
 for(const helper of [null,{id:'',version:2,semanticHash:''},{id:'real',version:1,semanticHash:''},{id:'real',version:1,semanticHash:'sha256:'+'a'.repeat(64)}]){
  const malformed=structuredClone(sparse);malformed.body.nodes.node.helper=helper;
  assert.equal(selectSubgraphClosure(malformed).ok,false,JSON.stringify(helper));
 }
});
