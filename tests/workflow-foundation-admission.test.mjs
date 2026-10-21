import test from 'node:test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {OPERATIONS,describeOperation,describeAuthoredOperation} from '../src/workflow/catalog.js';
import {runWorkflow} from '../src/workflow/runtime.js';
import {exportWorkflow,parseWorkflow} from '../src/workflow/packages.js';
const graph=()=>({id:'foundation-chunk',schema:4,runtime:3,mode:'native-unified',nodes:{input:{id:'input',type:'workflow',operation:'text',operationVersion:1,text:'A\r\n\r\nB'},chunk:{id:'chunk',type:'workflow',operation:'chunk',operationVersion:1,targetSize:5}},wires:{input:{id:'input',route:'wire',from:'input',fromPort:'out',to:'chunk',toPort:'in'}}});
test('foundation admits bounded Text Chunk and its portable runtime3 handoff without a model',async()=>{
 const input=graph(),described=describeOperation(input,input.nodes.chunk);assert.equal(described.ok,true,JSON.stringify(described.error));
 assert.equal(described.data.descriptor.minimumRuntime,3);assert.equal(describeOperation({...input,schema:3,runtime:2},input.nodes.chunk).ok,false);
 const parsed=parseWorkflow(JSON.stringify(exportWorkflow(input)));assert.equal(parsed.ok,true,JSON.stringify(parsed.error));
 const result=await runWorkflow(parsed.data,{target:{workflowId:input.id,instancePath:[],nodeId:'chunk',portId:'out'}});assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,0);
 const values=result.recording.artifacts.filter(a=>a.origin.direction==='output'&&a.kind==='data').map(a=>a.value.value),records=values.find(Array.isArray);
 assert.deepEqual(records.map(r=>[r.text,r.inputSpan]),[['A\r\n\r\n',{start:0,end:5,unit:'utf16'}],['B',{start:5,end:6,unit:'utf16'}]]);
 assert.ok(records.every(r=>r.mapping==='unmapped'&&r.sourceRefs.length===0));assert.equal(values.find(v=>v.type==='derivation-manifest').entries.length,2);
});
test('foundation keeps deferred memory operations outside the executable catalog',()=>{
 for(const operation of ['on-event','cadence','job','embed','index','search','history-policy']){
  assert.equal(Object.hasOwn(OPERATIONS,operation),false,operation);assert.equal(describeOperation(graph(),{id:'deferred',type:'workflow',operation,operationVersion:1}).ok,false,operation);
 }
});

for(const [operation,control] of [['read-file',{effectClass:'derived-maintenance'}],['write-file',{effectClass:'derived-maintenance'}],['generate-reply',{historyPolicy:'replace-covered'}]])test('foundation refuses deferred settings on '+operation,()=>{
 const node={id:'deferred-settings',type:'workflow',operation,operationVersion:1,targetId:'notes',...control};
 for(const describe of [describeOperation,describeAuthoredOperation]){const result=describe(graph(),node);assert.equal(result.ok,false);assert.equal(result.error.code,'UNSUPPORTED_FOUNDATION_CAPABILITY');}
});
test('foundation rejects a valid retained helper snapshot carrying a deferred File class',async()=>{
 const packet=await readFile(new URL('./fixtures/foundation-deferred-file.json',import.meta.url),'utf8');const fixture=JSON.parse(packet);assert.equal(Object.values(fixture.graph.definitions)[0].body.nodes.read.effectClass,'derived-maintenance');const result=parseWorkflow(packet);assert.equal(result.ok,false,'The previously admitted exact helper must not bypass the release capability boundary.');
});
