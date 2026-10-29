import assert from 'node:assert/strict';
import test from 'node:test';
import { executeFileNode } from '../src/workflow/operations/file-nodes.js?v=0.30.2';
import { createFileStore } from '../src/workflow/file-store.js?v=0.30.2';
import { executeTimeNode } from '../src/workflow/operations/time-nodes.js?v=0.30.2';
import { executeRandom } from '../src/workflow/operations/random-outcomes.js?v=0.30.2';
const node={id:'write',type:'workflow',operation:'write-file',destinationMode:'own',targetId:'notes'};
async function project(format,content,text,fileHandling,extra={}){
 let prepared,writes=0;
 const files=createFileStore({scope:{userId:'u',chatId:'c'},authorizedTargets:['notes'],load:async()=>({ok:true,data:{targetId:'notes',revision:1,format,content,receipts:[]}}),compareAndSwap:async()=>{writes++;return {ok:true};},isCurrent:()=>true,validateEvidence:async()=>({ok:true})});
 const result=await executeFileNode({...node,fileHandling,...extra},{text:{kind:'text',text}},{phase:'post',root:true,files,createIntentId:()=>({ok:true,data:'intent'}),fileVisibility:()=>({ok:true,data:{kind:'public'}}),authorizeFileWrite:()=>({ok:true,data:{destinationVisibility:{kind:'public'}}}),stageFileIntent:value=>{prepared=value;return {ok:true};}});
 return {result,prepared,writes};
}
test('file handling replaces owned text and appends one parsed JSON record collection without writes',async()=>{
 const replaced=await project('text','Before','After','replace');
 assert.equal(replaced.result.ok,true,JSON.stringify(replaced.result));
 assert.equal(replaced.prepared.plan.projectedDocument.content,'After');
 const appended=await project('json','[{"id":1}]','[{"id":2}]','append');
 assert.equal(appended.result.ok,true,JSON.stringify(appended.result));
 assert.deepEqual(JSON.parse(appended.prepared.plan.projectedDocument.content),[{id:1},{id:2}]);
 assert.equal(appended.writes,0);
 const text=await project('text','Before','After','append');
 assert.equal(text.prepared.plan.projectedDocument.content,'Before\nAfter');
});
test('structured append validates the full resulting schema before staging',async()=>{
 const result=await project('json','[{"id":1}]','[{"id":2}]','append',{schema:JSON.stringify({type:'array',maxItems:1})});
 assert.equal(result.result.ok,false);
 assert.equal(result.result.error.code,'SCHEMA_MISMATCH');
 assert.equal(result.prepared,undefined);
});
test('JSON collection append checks the document schema at its root',async()=>{
 const schema=JSON.stringify({type:'object',required:['items'],properties:{items:{type:'array',items:{type:'object',required:['id'],properties:{id:{type:'integer'}}}}}});
 const added=await project('json','{"items":[]}','{"id":1}','append',{collectionPath:'/items',schema});
 assert.equal(added.result.ok,true,JSON.stringify(added.result));
 assert.deepEqual(JSON.parse(added.prepared.plan.projectedDocument.content),{items:[{id:1}]});
});
test('specialized saving nodes send validated file handling to trusted state staging',async()=>{
 let clockHandling,outcomeHandling;
 const clock=await executeTimeNode({id:'commit',operation:'commit-clock',fileHandling:'append'},{projection:{kind:'data',value:{}}},{phase:'post',root:true,stageStoryClock:async(report,extra,options)=>{clockHandling=options;return {ok:true,data:{status:'staged'}};}});
 assert.equal(clock.ok,true,JSON.stringify(clock));
 assert.deepEqual(clockHandling,{fileHandling:'append'});
 const outcomes=await executeRandom({id:'outcomes',operation:'commit-outcomes',targetId:'ledger',fileHandling:'replace'},{outcomes:{kind:'data',value:[]}},{phase:'post',root:true,stageNativeOutcomes:async(target,values,address,options)=>{outcomeHandling=options;return {ok:true,data:{status:'empty'}};}});
 assert.equal(outcomes.ok,true,JSON.stringify(outcomes));
 assert.deepEqual(outcomeHandling,{fileHandling:'replace'});
});
test('file handling preserves declared Records inputs for structured replacement',async()=>{
 const {describeFileNode}=await import('../src/workflow/operations/file-nodes.js?v=0.30.2');
 const described=describeFileNode({...node,mode:'add',fileHandling:'replace'},{authoring:true});
 assert.equal(described.ok,true,JSON.stringify(described));
 assert.equal(described.data.ports.some(port=>port.id==='records'&&port.kind==='data'),true);
 assert.equal(describeFileNode({...node,mode:'untrusted',fileHandling:'replace'},{authoring:true}).ok,false);
 const files=createFileStore({scope:{userId:'u',chatId:'c'},authorizedTargets:['notes'],load:async()=>({ok:true,data:{targetId:'notes',revision:1,format:'json',content:'[{"old":true}]',receipts:[]}}),compareAndSwap:async()=>{throw Error('preview writes');},isCurrent:()=>true,validateEvidence:async()=>({ok:true})});
 let staged;
 const result=await executeFileNode({...node,fileHandling:'replace'},{records:{kind:'data',value:[{id:2}]}},{phase:'post',root:true,files,createIntentId:()=>({ok:true,data:'records'}),fileVisibility:()=>({ok:true,data:{kind:'public'}}),authorizeFileWrite:()=>({ok:true,data:{destinationVisibility:{kind:'public'}}}),stageFileIntent:prepared=>{staged=prepared;return {ok:true};}});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.deepEqual(JSON.parse(staged.plan.projectedDocument.content),[{id:2}]);
});
