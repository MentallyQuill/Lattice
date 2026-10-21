import assert from 'node:assert/strict';
import test from 'node:test';
import { isWorkflowGraph, validateGraphStructure } from '../src/workflow/contracts.js';
import { exportWorkflow, parseWorkflow } from '../src/workflow/packages.js';
const graph = (schema=4,runtime=3) => ({id:'version-test',schema,runtime,mode:'native-unified',nodes:{},wires:{}});
test('exact legacy and runtime-3 version pairs roundtrip without rewriting', () => {
 for(const [schema,runtime,packageSchema] of [[3,2,2],[4,3,3]]) {
  const input=graph(schema,runtime);
  assert.equal(isWorkflowGraph(input),true);
  assert.equal(validateGraphStructure(input).ok,true);
  const envelope=exportWorkflow(input);
  assert.equal(envelope.schema,packageSchema);assert.equal(envelope.minRuntime,runtime);
  const parsed=parseWorkflow(JSON.stringify(envelope));assert.equal(parsed.ok,true);assert.equal(parsed.data.schema,schema);
  for(const wrong of [2,3]) if(wrong!==runtime) assert.equal(parseWorkflow(JSON.stringify({...envelope,minRuntime:wrong})).ok,false);
 }
 for(const [schema,runtime] of [[3,3],[4,2],[5,3]]) assert.equal(validateGraphStructure(graph(schema,runtime)).ok,false);
});
import { computeDefinitionIdentity,definitionRefKey } from '../src/workflow/definition-data.js';
import { exportSubgraph,parseSubgraph } from '../src/workflow/packages.js';
import { semanticShapeAssignable } from '../src/workflow/workflow-versions.js';
const definition=(schema=4,runtime=3) => {const result=computeDefinitionIdentity({id:'v4-body',version:1,name:'New body',interface:[],parameters:[],body:{schema,runtime,mode:'native-unified',nodes:{},wires:{}}});assert.equal(result.ok,true,JSON.stringify(result.error));return {...result.data.materializedDefinition,semanticHash:result.data.semanticHash};};
test('old graph/package envelopes reject runtime-3 definitions including unused snapshots',()=>{
 const item=definition();const legacy={...graph(3,2),definitions:{[definitionRefKey(item)]:item}};
 assert.equal(validateGraphStructure(legacy).ok,false);
 const envelope=exportSubgraph(item);assert.equal(envelope.schema,2);assert.equal(envelope.minRuntime,3);assert.equal(parseSubgraph(JSON.stringify(envelope)).ok,true);
 assert.equal(parseSubgraph(JSON.stringify({...envelope,schema:1,minRuntime:2})).ok,false);
});
test('known shape refinement is specific and generic Data remains deferred',()=>{
 assert.equal(semanticShapeAssignable('records/chunk/v1','record-list/v1'),true);
 assert.equal(semanticShapeAssignable(undefined,'source-manifest/v1'),true);
 assert.equal(semanticShapeAssignable('records/chunk/v1','source-manifest/v1'),false);
 assert.equal(semanticShapeAssignable('records/unknown/v1','record-list/v1'),false);
});
