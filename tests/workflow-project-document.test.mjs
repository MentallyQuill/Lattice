import assert from 'node:assert/strict';
import {test} from 'node:test';
import {executeFileNode,describeFileNode} from '../src/workflow/operations/file-nodes.js?v=0.27.2';
const node=extra=>({type:'workflow',operation:'project-document',operationVersion:1,...extra});
const text=text=>({kind:'text',text});const data=value=>({kind:'data',value});
const original='[{"id":"sword","level":1,"souls":[{"id":"old"}]}]';
test('pure document projection chains soul collection and level fields without acquiring write authority',async()=>{
 let effects=0;const local={root:false,files:{read(){effects++;},prepare(){effects++;}},stageFileIntent(){effects++;}};
 const souls=await executeFileNode(node({mode:'add-unique',collectionPath:'/0/souls'}),{source:text(original),records:data([{id:'new'}])},local);assert.equal(souls.ok,true,JSON.stringify(souls.error));assert.deepEqual(souls.outputs.data.value[0].souls,[{id:'old'},{id:'new'}]);assert.equal(souls.outputs.receipt.value.added,1);
 const level=await executeFileNode(node({mode:'update-fields',fields:['level']}),{source:souls.outputs.text,records:data([{id:'sword',level:2}])},local);assert.equal(level.ok,true,JSON.stringify(level.error));assert.deepEqual(level.outputs.data.value,[{id:'sword',level:2,souls:[{id:'old'},{id:'new'}]}]);assert.equal(original,'[{"id":"sword","level":1,"souls":[{"id":"old"}]}]');assert.equal(effects,0);assert.equal(Object.hasOwn(level.outputs,'reference'),false);
});
test('projection preserves duplicate identity conflicts and schema validation before staging',async()=>{
 const conflict=await executeFileNode(node({mode:'add-unique',collectionPath:'/0/souls'}),{source:text(original),records:data([{id:'old',invented:true}])});assert.equal(conflict.error.code,'IDENTITY_CONFLICT');
 const invalid=await executeFileNode(node({mode:'replace',schema:'{"type":"array"}'}),{source:text('[]'),text:text('{}')});assert.equal(invalid.error.code,'SCHEMA_MISMATCH');
});
test('projection privacy is inherited through serialized text, parsed data and receipts',async()=>{
 const result=await executeFileNode(node({mode:'add'}),{source:{...text('[]'),visibility:{kind:'actor-private',actorId:'mara'}},records:data([{id:'a'}])});assert.equal(result.ok,true,JSON.stringify(result.error));for(const artifact of Object.values(result.outputs))assert.deepEqual(artifact.visibility,{kind:'actor-private',actorId:'mara'});
});
test('pure projection is permitted inside a helper in either stage and fails malformed or cancelled input',async()=>{
 for(const phase of ['pre','post']){const result=describeFileNode(node(),{phase});assert.equal(result.ok,true);assert.equal(result.data.descriptor.hostOperation,undefined);assert.equal(result.data.descriptor.terminal,false);assert.equal(result.data.descriptor.requestBound,0);}
 const invalid=await executeFileNode(node({mode:'add'}),{source:text('not json'),records:data([])});assert.equal(invalid.ok,false);const c=new AbortController();c.abort();assert.equal((await executeFileNode(node(),{}, {signal:c.signal})).error.code,'ABORTED');
});
