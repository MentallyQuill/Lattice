import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createChatDocumentCatalog} from '../src/workflow/document-catalog.js?v=0.29.1';
import {createNativeFileSession} from '../src/workflow/native-settlement.js?v=0.29.1';
import {executeFileNode} from '../src/workflow/operations/file-nodes.js?v=0.29.1';
import {sha256Text} from '../src/workflow/definition-data.js?v=0.29.1';
const must=result=>{assert.equal(result.ok,true,JSON.stringify(result.error));return result.data;};
function fixture(){
 const c={chatId:'story',chat:[{mes:'A door opens.',is_user:true,swipe_id:0}],chatMetadata:{}},barriers=new Map(),effects=[];
 const catalog=createChatDocumentCatalog({getContext:()=>c,getUserId:()=> 'u'});must(catalog.define({targetId:'capsule',name:'Scene',format:'json',content:'{"topic":null}',visibility:{kind:'public'}}));
 let saves=0,ack=true;
 const serialize=chat=>JSON.stringify(chat.map(m=>[m.mes,m.swipe_id,m.is_user]));
 function session(options={}){const prefix=JSON.parse(serialize(c.chat)),stamp={schemaVersion:1,messageCount:prefix.length,prefixHash:sha256Text(JSON.stringify(prefix))};return must(createNativeFileSession({catalog,scope:{userId:'u',chatId:c.chatId},context:()=>c,userId:()=> 'u',workflowId:'graph',barriers,maintainHistory:options.maintainHistory!==false,isCurrent:()=>true,chatSource:{stamp,matches:value=>value?.schemaVersion===1&&Number.isSafeInteger(value.messageCount)&&value.messageCount<=prefix.length&&value.prefixHash===sha256Text(JSON.stringify(prefix.slice(0,value.messageCount)))},originalDraft:{source:{messageIndex:c.chat.length,swipeId:0,originalText:'reply'}},validateEvidence:()=>({ok:true}),stage:effect=>{effects.push(effect);return {ok:true};},persistenceVerifier:{saveAndVerify:async()=>{saves++;return {ok:true,data:{acknowledged:ack}};}}}));}
 async function read(s,bindToChat=true){return executeFileNode({id:'read',operation:'read-file',targetId:'capsule',bindToChat},{},{root:true,files:s.store,fileVisibility:({reference})=>s.visibility(reference.targetId)});}
 async function write(s,r,content='{"topic":"door"}',intentId='first'){const prepared=must(await s.store.prepare(r.outputs.reference.value,{operation:'replace',content},{intentId,evidence:[]}));return s.store.commit(prepared.handle,{root:true,accepted:true});}
 return {c,catalog,session,read,write,barriers,effects,saves:()=>saves,setAck:v=>ack=v};
}
test('covered edits reset emitted scene context but retain the raw revision for safe replacement',async()=>{
 const f=fixture(),first=f.session(),read=await f.read(first);must(read);must(await f.write(first,read));
 f.c.chat[0].mes='The door stays shut.';
 const next=f.session(),reset=await f.read(next);must(reset);assert.deepEqual(reset.outputs.value.value,{topic:null});assert.equal(reset.outputs.reference.value.revision,1);
 must(await f.write(next,reset,'{"topic":"closed"}','second'));assert.equal(f.c.chatMetadata.latticeDocuments.u.capsule.content,'{"topic":"closed"}');
});
test('appending accepted messages preserves bound context; swipe and deletion invalidate covered source',async()=>{
 for(const change of ['append','swipe','delete']){const f=fixture(),s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r));if(change==='append')f.c.chat.push({mes:'Then I wait.',is_user:true});if(change==='swipe')f.c.chat[0].swipe_id=1;if(change==='delete')f.c.chat.splice(0,1);const next=await f.read(f.session());must(next);assert.equal(next.outputs.value.value.topic,change==='append'?'door':null);}
});
test('missing or malformed source metadata resets only opted-in reads',async()=>{
 for(const binding of [undefined,null,{schemaVersion:1,messageCount:-1,prefixHash:'forged'},{schemaVersion:1,messageCount:1,prefixHash:'sha256:'+'0'.repeat(64),extra:true}]){const f=fixture(),s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r));if(binding===undefined)delete f.c.chatMetadata.latticeDocuments.u.capsule.sourceBinding;else f.c.chatMetadata.latticeDocuments.u.capsule.sourceBinding=binding;const regular=await f.read(f.session(),false);must(regular);assert.equal(regular.outputs.value.value.topic,'door');const reset=await f.read(f.session());must(reset);assert.equal(reset.outputs.value.value.topic,null);}
});
test('copied bound packets reset and rebind only inside authorized same-user template scope',async()=>{
 const f=fixture(),s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r));const packet=f.c.chatMetadata.latticeDocuments.u.capsule;packet.scope.chatId='old-chat';
 assert.equal((await f.read(f.session(),false)).ok,false);const rebound=f.session(),reset=await f.read(rebound);must(reset);assert.equal(reset.outputs.value.value.topic,null);must(await f.write(rebound,reset,'{"topic":"new"}','copied'));assert.equal(packet.scope.chatId,'old-chat');assert.equal(f.c.chatMetadata.latticeDocuments.u.capsule.scope.chatId,'story');
 for(const scope of [{userId:'other',chatId:'old'},{userId:'u',chatId:'old',actorId:'foreign'}]){const g=fixture(),a=g.session(),v=await g.read(a);must(v);must(await g.write(a,v));g.c.chatMetadata.latticeDocuments.u.capsule.scope=scope;assert.equal((await g.read(g.session())).ok,false);}
});
test('a reset view does not bypass concurrent-write CAS or permit copied references',async()=>{
 const f=fixture(),s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r));f.c.chat[0].mes='Edit';const next=f.session(),reset=await f.read(next);must(reset);const ref=reset.outputs.reference.value;
 assert.equal((await next.store.prepare(structuredClone(ref),{operation:'replace',content:'{}'},{intentId:'forged',evidence:[]})).error.code,'FILE_REFERENCE_UNAUTHORIZED');
 const prepared=must(await next.store.prepare(ref,{operation:'replace',content:'{}'},{intentId:'conflict',evidence:[]}));f.c.chatMetadata.latticeDocuments.u.capsule.revision++;f.c.chatMetadata.latticeDocuments.u.capsule.content='{"topic":"foreign"}';assert.equal((await next.store.commit(prepared.handle,{root:true,accepted:true})).error.code,'FILE_REVISION_CONFLICT');
});
test('source metadata comes from host authority even when replacement JSON authors a source field',async()=>{
 const f=fixture(),s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r,'{"sourceBinding":{"prefixHash":"forged"}}'));const packet=f.c.chatMetadata.latticeDocuments.u.capsule;assert.match(packet.sourceBinding.prefixHash,/^sha256:[a-f0-9]{64}$/);assert.notEqual(packet.sourceBinding.prefixHash,'forged');assert.equal((await s.store.prepare(r.outputs.reference.value,{operation:'append-text',text:'x'},{intentId:'append',evidence:[]})).error.code,'BOUND_REPLACE_REQUIRED');
});
test('bound scene writes checkpoint acknowledged receipts before the active capacity is exhausted',async()=>{
 const f=fixture();for(let i=0;i<260;i++){const s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r,JSON.stringify({topic:i}),'turn-'+i));s.release();}
 const packet=f.c.chatMetadata.latticeDocuments.u.capsule;assert.ok(packet.receipts.length<240);assert.ok(packet.history.epoch>=1);assert.ok(Object.keys(f.c.chatMetadata.latticeDocumentHistory.u).length>0);
});

test('unchanged replacement advances source coverage and later edits to newly covered messages reset',async()=>{
 const f=fixture(),s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r));f.c.chat.push({mes:'An accepted answer.',is_user:false,swipe_id:0});const next=f.session(),same=await f.read(next);must(same);must(await f.write(next,same,'{"topic":"door"}','same-content'));assert.equal(f.c.chatMetadata.latticeDocuments.u.capsule.sourceBinding.messageCount,2);f.c.chat[1].mes='Edited answer';const reset=await f.read(f.session());must(reset);assert.equal(reset.outputs.value.value.topic,null);
});
test('reset views retain restricted record privacy from the actual stored snapshot',async()=>{
 const f=fixture(),s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r,'{"topic":"secret","visibility":{"kind":"actor-private","actorId":"mara"}}'));f.c.chat[0].mes='Edit';const reset=await f.read(f.session());assert.equal(reset.ok,false);assert.equal(reset.error.code,'PRIVATE_DESTINATION');
});
test('uncertain accepted maintenance holds later reads without discarding replay receipts',async()=>{
 const f=fixture();for(let i=0;i<224;i++){const s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r,JSON.stringify({topic:i}),'uncertain-'+i));s.release();}
 f.setAck(false);const before=f.saves(),s=f.session(),r=await f.read(s);must(r);assert.equal(f.saves(),before);
 const saved=must(await f.write(s,r,'{"topic":"accepted"}','uncertain-final'));assert.equal(saved.acknowledged,false);assert.equal(f.saves(),before+1);
 const packet=f.c.chatMetadata.latticeDocuments.u.capsule;assert.equal(packet.receipts.length,1);assert.equal(packet.history.epoch,1);assert.equal(f.barriers.size,1);
 const again=await f.read(f.session());assert.equal(again.error.code,'PERSISTENCE_UNKNOWN');assert.equal(f.saves(),before+1);
});

test('bound reference identity includes the prefix even if the same native reply is generated after earlier edits',async()=>{
 const f=fixture(),s=f.session(),r=await f.read(s);must(r);const a=must(await s.intentId({id:'writer'},[],undefined,r.outputs.reference.value));f.c.chat[0].mes='Different premise';const t=f.session(),v=await f.read(t);must(v);const b=must(await t.intentId({id:'writer'},[],undefined,v.outputs.reference.value));assert.notEqual(a,b);
});
test('a bound write rejects metadata-only source changes after capture',async()=>{
 const f=fixture(),s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r));const next=f.session(),v=await f.read(next);must(v);const prepared=must(await next.store.prepare(v.outputs.reference.value,{operation:'replace',content:'{"topic":"new"}'},{intentId:'source-conflict',evidence:[]}));f.c.chatMetadata.latticeDocuments.u.capsule.sourceBinding.prefixHash='sha256:'+'0'.repeat(64);const result=await next.store.commit(prepared.handle,{root:true,accepted:true});assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_REVISION_CONFLICT');
});

test('preview bound reads never checkpoint or save metadata at receipt capacity',async()=>{
 const f=fixture();for(let i=0;i<240;i++){const s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r,JSON.stringify({topic:i}),'preview-'+i));s.release();}const before=JSON.stringify(f.c.chatMetadata),saves=f.saves();const preview=await f.read(f.session({maintainHistory:false}));must(preview);assert.equal(f.saves(),saves);assert.equal(JSON.stringify(f.c.chatMetadata),before);
});
test('checkpointed scene receipt replay stays idempotent after a new session',async()=>{
 const f=fixture();for(let i=0;i<242;i++){const s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r,JSON.stringify({topic:i}),'archived-'+i));s.release();}const before=f.saves(),s=f.session(),r=await f.read(s);must(r);const replay=must(await f.write(s,r,'{"topic":0}','archived-0'));assert.equal(replay.status,'confirmed');assert.equal(replay.applied,false);assert.equal(f.saves(),before);assert.equal(JSON.parse(f.c.chatMetadata.latticeDocuments.u.capsule.content).topic,241);
});
test('unbound replacement revokes prior trusted source metadata',async()=>{
 const f=fixture(),s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r));const ordinary=f.session(),unbound=await f.read(ordinary,false);must(unbound);must(await f.write(ordinary,unbound,'{"topic":"untrusted"}','unbound-replacement'));assert.equal(f.c.chatMetadata.latticeDocuments.u.capsule.sourceBinding,undefined);const reset=await f.read(f.session());must(reset);assert.equal(reset.outputs.value.value.topic,null);
});
test('a copied long-lived bound document rebinds without adopting foreign archived receipts',async()=>{
 const f=fixture();for(let i=0;i<242;i++){const s=f.session(),r=await f.read(s);must(r);must(await f.write(s,r,JSON.stringify({topic:i}),'copy-history-'+i));s.release();}const old=f.c.chatMetadata.latticeDocuments.u.capsule,archives=JSON.stringify(f.c.chatMetadata.latticeDocumentHistory);assert.ok(old.history.epoch>0);f.c.chatId='branched-story';const s=f.session(),r=await f.read(s);must(r);assert.equal(r.outputs.value.value.topic,null);assert.equal(r.outputs.reference.value.revision,old.revision);const p=must(await s.store.prepare(r.outputs.reference.value,{operation:'replace',content:'{"topic":"new branch"}'},{intentId:'branch',evidence:[]}));old.revision++;assert.equal((await s.store.commit(p.handle,{root:true,accepted:true})).error.code,'FILE_REVISION_CONFLICT');const fresh=f.session(),reset=await f.read(fresh);must(reset);must(await f.write(fresh,reset,'{"topic":"new branch"}','branch-fresh'));const rebound=f.c.chatMetadata.latticeDocuments.u.capsule;assert.equal(rebound.scope.chatId,'branched-story');assert.equal(rebound.history,undefined);assert.equal(rebound.receipts.length,1);assert.equal(JSON.stringify(f.c.chatMetadata.latticeDocumentHistory),archives);
});
test('native bound-read controls reject accessors without evaluating them',async()=>{
 const f=fixture(),s=f.session();let reads=0;const controls=Object.defineProperty({},'bindToChat',{enumerable:true,get(){reads++;return true;}});const result=await s.store.read('capsule',controls);assert.equal(result.ok,false);assert.equal(reads,0);
});
