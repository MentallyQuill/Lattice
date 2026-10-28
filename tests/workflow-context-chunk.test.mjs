import assert from 'node:assert/strict';
import test from 'node:test';
import {createNativePersistenceVerifier} from '../src/workflow/native-persistence.js?v=0.29.1';
import {createNativeSourceRegistry} from '../src/workflow/native-source-registry.js?v=0.29.1';
import {createSourceReader} from '../src/workflow/source-reader.js?v=0.29.1';
import {createSourceProofRegistry,inspectSourceProof} from '../src/workflow/source-provenance.js?v=0.29.1';
import {executeChunk} from '../src/workflow/operations/chunk.js?v=0.29.1';
import {bindSourceDerivation} from '../src/workflow/source-provenance.js?v=0.29.1';
import {freeze} from '../src/workflow/record-data.js?v=0.29.1';
import {preserveArtifactPrivacy} from '../src/workflow/artifact-privacy.js?v=0.29.1';
const address={workflowId:'test',instancePath:[],nodeId:'chunk'};
const node=settings=>({id:'chunk',type:'workflow',operation:'chunk',operationVersion:1,inputMode:'context',...settings});
async function fixture(chat=[{mes:'abcdef',is_user:true},{mes:'reply'}],ports={},captureOptions={}){
 let serial=0,saved,user='user';
 const context={chatId:'story',characterId:0,groupId:null,chat,characters:[{name:'Mara',avatar:'Mara.png',chat:'Story'}],chatMetadata:{},getRequestHeaders:()=>({'Content-Type':'application/json'}),saveMetadata:async()=>{saved=structuredClone(context.chatMetadata);}};
 const persistenceVerifier=createNativePersistenceVerifier({getContext:()=>context,getUserId:()=>user,fetch:async()=>({ok:true,text:async()=>JSON.stringify([{chat_metadata:saved},...chat])})});
 const registry=createNativeSourceRegistry({getContext:()=>context,getUserId:()=>user,persistenceVerifier,randomId:()=>`id-${++serial}`});
 assert.equal((await registry.synchronize({expectedRevision:null,cause:'enroll'})).ok,true);
 const snapshot=registry.capture({chat:[...chat],scope:{userId:'user',chatId:'story'},selector:{roles:['user','assistant']},isCurrent:()=>true,...captureOptions}).data;
 const reader=createSourceReader(ports),selected=reader.selectSourcePage(snapshot,{selection:'recent',recentMessages:1000,maxMessages:1000,maxTextUnits:100000});assert.equal(selected.ok,true,JSON.stringify(selected.error));const page=selected.data;
 const proofs=createSourceProofRegistry({isCurrent:()=>true});proofs.registerReaderResult(page.result,page);
 const retain=(rawResult,portId,artifact=rawResult.outputs[portId],inputs={})=>proofs.retainOutput({node:node(),address,rawResult,portId,artifact,inputs});
 for(const port of ['out','manifest'])assert.equal(retain(page.result,port).ok,true);
 const run=(settings={},local={})=>executeChunk(node(settings),{in:page.outputs.out,sourceManifest:page.outputs.manifest},{address,sourceProofs:proofs,...local});
 return {context,page,proofs,retain,run,registry,reader,snapshot,user:value=>{user=value;}};
}
test('actual reader Context fixed chunks project exact separate message spans and overlap',async()=>{
 const f=await fixture(),result=await f.run({strategy:'fixed',targetSize:3,overlap:1});
 assert.equal(result.ok,true,JSON.stringify(result.error));const records=result.outputs.out.value;
 assert.deepEqual(records.map(r=>r.text),['abc','cde','ef','rep','ply']);
 assert.deepEqual(records.map(r=>r.sourceRefs[0].span),[{start:0,end:3,unit:'utf16'},{start:2,end:5,unit:'utf16'},{start:4,end:6,unit:'utf16'},{start:0,end:3,unit:'utf16'},{start:2,end:5,unit:'utf16'}]);
 assert.ok(records.every(r=>r.mapping==='exact'&&r.inputSpan===null&&r.memberIds.length===1));
 assert.equal(result.outputs.manifest.value.entries[0].parents[0].id,f.page.outputs.out.messages[0].id);
});
test('actual Chunk result retains private lineage only for exact final payload and revokes after source edit',async()=>{
 const f=await fixture(),result=await f.run({strategy:'fixed',targetSize:3});assert.equal(result.ok,true);
 assert.equal(f.retain(result,'out').ok,true);const proof=f.proofs.authorizeSource(result.outputs.out);assert.equal(proof.ok,true);
 const view=inspectSourceProof(proof.data);assert.equal(view.ok,true);assert.equal(view.data.processedInputs.length,2);
 assert.deepEqual(view.data.mapping[0].sourceOrders.map(o=>o.messageOrdinal),[0]);
 assert.equal(f.proofs.authorizeSource(structuredClone(result.outputs.out)).ok,false);
 f.context.chat[0].mes='edited';assert.equal(inspectSourceProof(proof.data).ok,false);
});
test('assistant turns retain whole verified pairs in three-turn windows and explicitly preserve unpaired material',async()=>{
 const chat=[{mes:'orphan'},...Array.from({length:8},(_,i)=>({mes:String(i),is_user:i%2===0})),{mes:'tail',is_user:true}];
 const f=await fixture(chat),result=await f.run({strategy:'assistant-turns',separator:'|'});
 assert.equal(result.ok,true,JSON.stringify(result.error));const records=result.outputs.out.value;
 assert.deepEqual(records.map(r=>r.text),['orphan','0|1|2|3|4|5','6|7','tail']);
 assert.deepEqual(records.map(r=>r.assistantTurnIds.length),[0,3,1,0]);
 assert.equal(records[1].sourceRefs.length,6);assert.ok(records[1].sourceRefs.every(r=>r.span.end===1));
 assert.equal(result.outputs.report.value.diagnostics[0].code,'CHUNK_UNPAIRED_PRESERVED');
 assert.equal(f.retain(result,'out').ok,true);const view=inspectSourceProof(f.proofs.authorizeSource(result.outputs.out).data).data;
 assert.deepEqual(view.mapping[1].sourceOrders.map(o=>o.messageOrdinal),[1,2,3,4,5,6]);
});
test('source changes after a tokenizer await prevent every later tokenizer dispatch and output',async()=>{
 for(const mutate of [f=>{f.context.chat[0].mes='edited';},f=>f.user('another'),f=>{f.context.chatId='another';},f=>{Object.assign(f.context.chat[1],{mes:'new swipe',swipe_id:1,swipes:['reply','new swipe']});},f=>{f.context.chatMetadata.latticeSources.user.branchStates.unbranched.sourceEpoch='new-epoch';}]){
  const f=await fixture();let calls=0;const binding={tokenizerId:'test',version:'1',model:'test'};
  const result=await f.run({strategy:'fixed',sizeUnit:'tokens',targetSize:3,tokenizerBinding:binding},{chunkTokenizer:{binding,countTokens:async text=>{calls++;mutate(f);return {tokens:text.length};}}});
  assert.equal(result.ok,false);assert.equal(result.outputs,undefined);assert.equal(calls,1);
 }
});
test('empty actual reader output retains parent lineage and skips tokenization in every strategy',async()=>{
 for(const strategy of ['fixed','assistant-turns']){
  const f=await fixture([]),binding={tokenizerId:'test',version:'1',model:'test'};let calls=0;
  const result=await f.run({strategy,sizeUnit:'tokens',tokenizerBinding:binding},{chunkTokenizer:{binding,countTokens:()=>{calls++;throw Error('empty');}}});
  assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(calls,0);assert.deepEqual(result.outputs.out.value,[]);
  assert.equal(f.retain(result,'out').ok,true);assert.equal(f.proofs.authorizeSource(result.outputs.out).ok,true);
 }
});
test('reusable derivation retains only the source orders associated with selected exact ranges',async()=>{
 const f=await fixture(),chunk=await f.run({strategy:'assistant-turns'});assert.equal(f.retain(chunk,'out').ok,true);
 const parent=f.proofs.authorizeSource(chunk.outputs.out).data,ref=chunk.outputs.out.value[0].sourceRefs[1];
 const row={id:'event',revision:'event-1',scope:ref.scope,sourceRefs:[ref],visibility:{kind:'public'},text:'reply',mapping:'exact'};
 const result=freeze({ok:true,outputs:{out:{kind:'data',value:[row],visibility:{kind:'public'}}}});
 const bound=bindSourceDerivation(result,{parents:[parent],processedMemberIds:[chunk.outputs.out.value[0].id],mapping:[{memberId:row.id,sourceRefs:row.sourceRefs,visibility:row.visibility,mapping:'exact'}]});assert.equal(bound.ok,true,JSON.stringify(bound.error));
 assert.equal(f.retain(result,'out').ok,true);const view=inspectSourceProof(f.proofs.authorizeSource(result.outputs.out).data).data;
 assert.deepEqual(view.mapping[0].sourceOrders.map(o=>o.messageOrdinal),[1]);
});
test('zero-record derivations retain all processed parent membership through subsequent empty transformations',async()=>{
 const f=await fixture(),chunk=await f.run({strategy:'assistant-turns'});f.retain(chunk,'out');
 let parent=f.proofs.authorizeSource(chunk.outputs.out).data,ids=[chunk.outputs.out.value[0].id];
 for(let stage=0;stage<2;stage++){
  const result=freeze({ok:true,outputs:{out:{kind:'data',value:[],visibility:{kind:'public'}}}});
  const bound=bindSourceDerivation(result,{parents:[parent],processedMemberIds:ids,mapping:[]});assert.equal(bound.ok,true,JSON.stringify(bound.error));
  f.retain(result,'out');parent=f.proofs.authorizeSource(result.outputs.out).data;ids=[];
  const view=inspectSourceProof(parent).data;assert.ok(view.processedInputs.some(m=>m.memberId===f.page.outputs.out.messages[0].id));
  assert.ok(view.processedInputs.some(m=>m.memberId===chunk.outputs.out.value[0].id));assert.deepEqual(view.mapping,[]);
 }
});
test('derived-only Context and Text projections preserve source associations without claiming exact spans',async()=>{
 const f=await fixture(),proof=f.proofs.authorizeSource(f.page.outputs.out).data;
 const sourceRef={...f.page.outputs.records.value[0].sourceRefs[0]};delete sourceRef.span;
 for(const artifact of [{kind:'context',messages:[{id:'summary',role:'system',text:'Lossy summary'}]},{kind:'text',text:'Lossy summary'}]){
  const result=freeze({ok:true,outputs:{out:artifact}});
  const bound=bindSourceDerivation(result,{parents:[proof],processedMemberIds:[f.page.outputs.out.messages[0].id],mapping:[{memberId:'summary',sourceRefs:[sourceRef],visibility:{kind:'public'},mapping:'derived-only'}]});assert.equal(bound.ok,true,JSON.stringify(bound.error));
  assert.equal(f.retain(result,'out').ok,true);const view=inspectSourceProof(f.proofs.authorizeSource(result.outputs.out).data).data;
  assert.equal(view.mapping[0].mapping,'derived-only');assert.equal(view.mapping[0].sourceRefs[0].span,undefined);
 }
});
test('shallow-frozen or accessor-bearing result payloads cannot acquire reusable derivation authority',async()=>{
 const f=await fixture(),parent=f.proofs.authorizeSource(f.page.outputs.out).data;
 const result=Object.freeze({ok:true,outputs:{out:{kind:'data',value:[]}}});
 assert.equal(bindSourceDerivation(result,{parents:[parent],processedMemberIds:[],mapping:[]}).ok,false);
});
test('paragraph and sentence Context preserve independent Unicode spans and generic Context stays unmapped',async()=>{
 for(const [strategy,text,targetSize,expected] of [['paragraph','A\r\n\r\nB',5,['A\r\n\r\n','B']],['sentence','Hi. Bye!',5,['Hi. ','Bye!']],['fixed','x👨‍👩‍👧‍👦é',11,['x','👨‍👩‍👧‍👦','é']]]){
  const f=await fixture([{mes:text,is_user:true}]),result=await f.run({strategy,targetSize});assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.outputs.out.value.map(r=>r.text),expected);for(const r of result.outputs.out.value)assert.equal(text.slice(r.sourceRefs[0].span.start,r.sourceRefs[0].span.end),r.text);
  const generic=await executeChunk(node({strategy,targetSize}),{in:structuredClone(f.page.outputs.out)},{address});assert.equal(generic.ok,true);assert.ok(generic.outputs.out.value.every(r=>r.mapping==='unmapped'&&r.sourceRefs.length===0));
 }
});
test('exact privacy clones and trigger identity survive retention while late source changes reject final retention',async()=>{
 const cause=Object.freeze({}),handle={cause,isCurrent:()=>true},f=await fixture(undefined,{getTriggerCause:()=>handle});
 const result=await f.run({strategy:'assistant-turns'}),inputs={trigger:{kind:'data',value:[],visibility:{kind:'actor-private',actorId:'mara'}}};
 const normalized=preserveArtifactPrivacy(result,inputs);assert.notEqual(normalized.outputs.out,result.outputs.out);assert.equal(normalized.outputs.out.value,result.outputs.out.value);
 assert.equal(f.retain(result,'out',normalized.outputs.out,inputs).ok,true);const proof=f.proofs.authorizeSource(normalized.outputs.out);assert.equal(inspectSourceProof(proof.data).data.triggerCause,cause);
 assert.equal(f.retain(result,'out',freeze(structuredClone(normalized.outputs.out)),inputs).ok,false);
 f.context.chat[0].mes='late edit';assert.equal(f.retain(result,'manifest').ok,false);assert.equal(inspectSourceProof(proof.data).ok,false);
});
test('owned prefix append keeps exact Chunk lineage but removes current-head completeness',async()=>{
 const f=await fixture(undefined,{}, {allowPrefixAppend:()=>true}),result=await f.run({strategy:'assistant-turns'});f.retain(result,'out');const proof=f.proofs.authorizeSource(result.outputs.out).data;
 assert.equal(inspectSourceProof(proof).data.currentHead,true);f.context.chat.push({mes:'owned append'});
 const inspected=inspectSourceProof(proof);assert.equal(inspected.ok,true,JSON.stringify(inspected.error));assert.equal(inspected.data.currentHead,false);
});
test('derived Context has lineage without acquiring reader pairing or invented exact source spans',async()=>{
 const f=await fixture(),proof=f.proofs.authorizeSource(f.page.outputs.out).data,ref={...f.page.outputs.records.value[0].sourceRefs[0]};delete ref.span;
 const result=freeze({ok:true,outputs:{out:{kind:'context',messages:[{id:'summary',role:'system',text:'Summary'}]}}});
 const mapping=[{memberId:'summary',sourceRefs:[ref],visibility:{kind:'public'},mapping:'derived-only'}];
 assert.equal(bindSourceDerivation(result,{parents:[proof],processedMemberIds:[f.page.outputs.out.messages[0].id],mapping}).ok,true);f.retain(result,'out');
 assert.equal(f.proofs.authorizePairing(result.outputs.out).ok,false);
 const chunk=await executeChunk(node({strategy:'fixed',targetSize:3}),{in:result.outputs.out},{address,sourceProofs:f.proofs});assert.equal(chunk.ok,true,JSON.stringify(chunk.error));
 assert.ok(chunk.outputs.out.value.every(r=>r.mapping==='derived-only'&&r.sourceRefs[0].span===undefined));
 const forged=freeze({ok:true,outputs:{out:{kind:'data',value:[{id:'bad',sourceRefs:[ref],visibility:{kind:'public'},mapping:'exact'}]}}});
 assert.equal(bindSourceDerivation(forged,{parents:[proof],processedMemberIds:[f.page.outputs.out.messages[0].id],mapping:[{...mapping[0],memberId:'bad',mapping:'exact'}]}).ok,false);
});
test('a stale actual Context cannot silently downgrade to generic unmapped without the optional manifest',async()=>{
 const f=await fixture();f.context.chat[0].mes='edited';
 const result=await executeChunk(node({strategy:'fixed'}),{in:f.page.outputs.out},{address,sourceProofs:f.proofs});
 assert.equal(result.ok,false);assert.equal(result.outputs,undefined);
});
test('a derived Context chunk manifest names its direct derived parent identity and revision',async()=>{
 const f=await fixture(),proof=f.proofs.authorizeSource(f.page.outputs.out).data,ref={...f.page.outputs.records.value[0].sourceRefs[0]};delete ref.span;
 const result=freeze({ok:true,outputs:{out:{kind:'context',messages:[{id:'summary',revision:'summary-1',role:'system',text:'Summary'}]}}});
 assert.equal(bindSourceDerivation(result,{parents:[proof],processedMemberIds:[f.page.outputs.out.messages[0].id],mapping:[{memberId:'summary',sourceRefs:[ref],visibility:{kind:'public'},mapping:'derived-only'}]}).ok,true);f.retain(result,'out');
 const chunk=await executeChunk(node({strategy:'fixed'}),{in:result.outputs.out},{address,sourceProofs:f.proofs});assert.equal(chunk.ok,true);
 assert.deepEqual(chunk.outputs.manifest.value.entries[0].parents,[{id:'summary',revision:'summary-1'}]);
});
test('an optional manifest from another page of the same source snapshot cannot authorize the input',async()=>{
 const f=await fixture(Array.from({length:4},(_,i)=>({mes:String(i),is_user:i%2===0})));
 const first=f.reader.selectSourcePage(f.snapshot,{selection:'recent',recentMessages:4,maxMessages:2,maxTextUnits:100000}).data;
 const next=f.reader.selectSourcePage(f.snapshot,{selection:'since-cursor',cursor:first.outputs.cursor.value,maxMessages:2,maxTextUnits:100000}).data;
 assert.equal(first.outputs.manifest.value.snapshotId,next.outputs.manifest.value.snapshotId);
 for(const page of [first,next]){f.proofs.registerReaderResult(page.result,page);f.retain(page.result,'out');f.retain(page.result,'manifest');}
 const result=await executeChunk(node({strategy:'fixed'}),{in:first.outputs.out,sourceManifest:next.outputs.manifest},{address,sourceProofs:f.proofs});
 assert.equal(result.ok,false);assert.equal(result.outputs,undefined);
});
test('internal derivation mappings cannot preserve fabricated single-anchor native order',async()=>{
 const f=await fixture(),parent=f.proofs.authorizeSource(f.page.outputs.out).data,record=f.page.outputs.records.value[0];
 const result=freeze({ok:true,outputs:{out:{kind:'data',value:[record]}}});
 const bound=bindSourceDerivation(result,{parents:[parent],processedMemberIds:[record.id],mapping:[{memberId:record.id,sourceRefs:record.sourceRefs,visibility:record.visibility,mapping:'exact',sourceOrder:{messageOrdinal:9999,orderRevision:'fake'}}]});
 assert.equal(bound.ok,true,JSON.stringify(bound.error));f.retain(result,'out');const view=inspectSourceProof(f.proofs.authorizeSource(result.outputs.out).data).data;
 assert.equal(view.mapping[0].sourceOrder,undefined);assert.deepEqual(view.mapping[0].sourceOrders.map(o=>o.messageOrdinal),[0]);
});
test('Context tokenizer and output budgets are global and fail atomically without hidden paging',async()=>{
 const f=await fixture([{mes:'a',is_user:true},{mes:'b'}]),binding={tokenizerId:'test',version:'1',model:'test'};let calls=0;
 const result=await f.run({strategy:'fixed',sizeUnit:'tokens',targetSize:3,tokenizerBinding:binding,maxTokenizerCalls:1},{chunkTokenizer:{binding,countTokens:async text=>{calls++;return {tokens:text.length};}}});assert.equal(result.ok,false);assert.equal(result.error.code,'CHUNK_LIMIT');assert.equal(calls,1);assert.equal(result.outputs,undefined);
 const bounded=await f.run({strategy:'fixed',targetSize:1,maxChunks:1});assert.equal(bounded.error.code,'CHUNK_LIMIT');assert.equal(bounded.outputs,undefined);
 const mismatch=await f.run({strategy:'fixed'},{chunkScope:{userId:'other',chatId:'story'}});assert.equal(mismatch.error.code,'CHUNK_SOURCE_MISMATCH');
});
test('cause conflicts and foreign registries cannot be joined by a trusted derivation adapter',async()=>{
 const f=await fixture(),foreign=await fixture(),first=f.proofs.authorizeSource(f.page.outputs.out).data,second=foreign.proofs.authorizeSource(foreign.page.outputs.out).data;
 const result=freeze({ok:true,outputs:{out:{kind:'data',value:[]}}});assert.equal(bindSourceDerivation(result,{parents:[first,second],processedMemberIds:[],mapping:[]}).ok,false);
 const causes=[Object.freeze({}),Object.freeze({})],parents=[];
 for(const cause of causes){const handle={cause,isCurrent:()=>true},reader=createSourceReader({getTriggerCause:()=>handle}),page=reader.selectSourcePage(f.snapshot,{selection:'recent',recentMessages:1000,maxMessages:1000,maxTextUnits:100000}).data;f.proofs.registerReaderResult(page.result,page);f.retain(page.result,'out');parents.push(f.proofs.authorizeSource(page.outputs.out).data);}
 assert.equal(bindSourceDerivation(result,{parents,processedMemberIds:[],mapping:[]}).error.code,'SOURCE_DERIVATION_CONFLICT');
});
test('generic Context input is captured before the first asynchronous import boundary',async()=>{
 const inputs={in:{kind:'context',messages:[{id:'message',role:'user',text:'original'}]}};
 const pending=executeChunk(node({strategy:'fixed'}),inputs,{address});inputs.in.messages[0].text='replacement';
 const result=await pending;assert.equal(result.ok,true);assert.equal(result.outputs.out.value[0].text,'original');
});
test('empty members do not dispatch beyond the Context-wide tokenizer bound',async()=>{
 const binding={tokenizerId:'test',version:'1',model:'test'};let calls=0;
 const result=await executeChunk(node({strategy:'fixed',sizeUnit:'tokens',tokenizerBinding:binding,maxTokenizerCalls:1}),{in:{kind:'context',messages:[{id:'a',role:'user',text:'a'},{id:'empty',role:'assistant',text:''}]}},{address,chunkTokenizer:{binding,countTokens:async text=>{calls++;return {tokens:text.length};}}});
 assert.ok(calls<=1);assert.equal(result.ok,true);assert.equal(result.outputs.out.value.length,1);
});
test('Context namespaced metadata is preserved as detached data and participates in record revisions',async()=>{
 const input={kind:'context',messages:[{id:'a',role:'user',text:'abc'}],metadata:{'fixture:labels':['one']}};
 const first=await executeChunk(node({targetSize:2}),{in:input},{address});assert.equal(first.ok,true);assert.deepEqual(first.outputs.out.value[0].metadata,input.metadata);assert.notEqual(first.outputs.out.value[0].metadata,input.metadata);
 input.metadata['fixture:labels'][0]='two';const second=await executeChunk(node({targetSize:2}),{in:input},{address});assert.notEqual(first.outputs.out.value[0].revision,second.outputs.out.value[0].revision);
});
