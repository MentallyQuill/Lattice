import assert from 'node:assert/strict';
import test from 'node:test';
import {createNativePersistenceVerifier} from '../src/workflow/native-persistence.js?v=0.27.5';
const api=await import('../src/workflow/native-source-registry.js?v=0.27.5').catch(()=>({}));
function fixture(options={}){
 let user='user',branch=options.branch,serial=0,saves=0,requests=0,saved,savedChat;
 const chat=options.chat??[{name:'You',is_user:true,mes:'first',send_date:'2026-01-01'},{name:'Mara',is_user:false,mes:'second',send_date:'2026-01-02'},{name:'You',is_user:true,mes:'third',send_date:'2026-01-03'}];
 const c={chatId:'story',characterId:0,groupId:null,chat,characters:[{name:'Mara',avatar:'Mara.png',chat:'Story'}],chatMetadata:options.metadata??{},getRequestHeaders:()=>({'Content-Type':'application/json'}),saveMetadata:async()=>{saves++;saved=structuredClone(c.chatMetadata);savedChat=structuredClone(c.chat);await options.onSave?.(c);}};
 const verifier=createNativePersistenceVerifier({getContext:()=>c,getUserId:()=>user,fetch:async()=>{requests++;await options.onFetch?.(c);return {ok:options.offline!==true,text:async()=>JSON.stringify([{chat_metadata:saved??c.chatMetadata},...(savedChat??c.chat)])};}});
 const make=()=>api.createNativeSourceRegistry({getContext:()=>c,getUserId:()=>user,...(options.branchAdapter?{getBranchId:()=>branch}:{}),persistenceVerifier:verifier,randomId:()=>`id-${++serial}`,...(options.identityAdapter?{identityAdapter:options.identityAdapter}:{}),...(options.onInvalidated?{onInvalidated:options.onInvalidated}:{})});
 return {c,make,counts:()=>({saves,requests,ids:serial}),user:v=>{user=v;},branch:v=>{branch=v;},setSaved:v=>{saved=v;},capture:r=>r.capture({chat:c.chat,scope:{userId:user,chatId:c.chatId,...(options.branchAdapter&&branch?{branchId:branch}:{})},selector:{roles:['user','assistant']},isCurrent:()=>true})};
}
const enroll=r=>r.synchronize({expectedRevision:null,cause:'enroll'});
const view=snapshot=>api.inspectNativeSourceSnapshot(snapshot).data;
test('explicit enrollment acknowledges metadata only and copied snapshots cannot acquire source authority',async()=>{
 assert.equal(typeof api.createNativeSourceRegistry,'function');const f=fixture(),r=f.make(),before=structuredClone(f.c.chat),refs=[...f.c.chat];
 assert.equal(f.capture(r).error.code,'SOURCE_REGISTRY_SETUP_REQUIRED');assert.deepEqual(f.counts(),{saves:0,requests:0,ids:0});
 const enrolled=await enroll(r);assert.equal(enrolled.ok,true);assert.equal(enrolled.data.acknowledged,true);
 const captured=f.capture(r);assert.equal(captured.ok,true);assert.equal(Object.isFrozen(captured.data),true);assert.equal(view(captured.data).entries.length,3);
 assert.equal(api.inspectNativeSourceSnapshot({...captured.data}).error.code,'SOURCE_SNAPSHOT_UNAUTHORIZED');
 assert.deepEqual(f.c.chat,before);assert.deepEqual([...f.c.chat],refs);assert.equal(Object.isFrozen(f.c.chat),false);assert.equal(Object.isFrozen(f.c.chat[0]),false);
 assert.doesNotMatch(JSON.stringify(f.c.chatMetadata),/first|second|third|Mara|send_date/);
 assert.deepEqual(f.counts().saves,1);
});

test('middle deletion tombstones one source while in-session edits and same-text swipe selection revise stable IDs',async()=>{
 const invalidations=[],f=fixture({onInvalidated:value=>invalidations.push(value)}),r=f.make();await enroll(r);const before=view(f.capture(r).data).entries;
 f.c.chat.splice(1,1);f.c.chat[0].mes='edited';let state=r.inspect();const changed=await r.synchronize({expectedRevision:state.data.revision,cause:'host-change'});assert.equal(changed.ok,true);
 const after=view(f.capture(r).data).entries;assert.deepEqual(after.map(x=>x.sourceId),[before[0].sourceId,before[2].sourceId]);assert.notEqual(after[0].revision,before[0].revision);
 f.c.chat[0].swipes=['edited','edited'];f.c.chat[0].swipe_id=0;await r.synchronize({expectedRevision:r.inspect().data.revision,cause:'host-change'});const swipe0=view(f.capture(r).data).entries[0];f.c.chat[0].swipe_id=1;await r.synchronize({expectedRevision:r.inspect().data.revision,cause:'host-change'});const swipe1=view(f.capture(r).data).entries[0];assert.equal(swipe0.sourceId,swipe1.sourceId);assert.notEqual(swipe0.revision,swipe1.revision);
 assert.ok(invalidations.flatMap(x=>x.changes).some(x=>x.sourceId===before[1].sourceId&&x.tombstone));
 assert.equal(r.inspect().data.retainedSources,3);
});

test('cold reload verifies without writes or new IDs and unchanged fingerprints recover exact sources',async()=>{
 const f=fixture(),r=f.make();await enroll(r);const ids=view(f.capture(r).data).entries.map(x=>x.sourceId);f.c.chat=structuredClone(f.c.chat);const restored=f.make(),before=f.counts();assert.equal(f.capture(restored).error.code,'SOURCE_REGISTRY_UNVERIFIED');assert.equal((await restored.verifyPending()).ok,true);assert.deepEqual(view(f.capture(restored).data).entries.map(x=>x.sourceId),ids);assert.equal(f.counts().saves,before.saves);assert.equal(f.counts().ids,before.ids);
});

test('trusted immutable birth anchors recover edited sources after reload',async()=>{
 const identityAdapter={kind:'test-birth',getBirthAnchor:message=>message.birth};const f=fixture({chat:[{mes:'old',is_user:true,birth:'unique-birth'}],identityAdapter}),r=f.make();await enroll(r);const prior=view(f.capture(r).data).entries[0];f.c.chat=structuredClone(f.c.chat);f.c.chat[0].mes='edited after restart';const restored=f.make();const result=await restored.synchronize({expectedRevision:r.inspect().data.revision,cause:'explicit-reconcile'});assert.equal(result.ok,true);const next=view(f.capture(restored).data).entries[0];assert.equal(next.sourceId,prior.sourceId);assert.notEqual(next.revision,prior.revision);
});
test('changed unanchored reload and duplicate fingerprints hold without replacement IDs or metadata changes',async()=>{
 for(const duplicate of [false,true]){const f=fixture({chat:duplicate?[{mes:'same'},{mes:'same'}]:[{mes:'old'}]}),r=f.make();await enroll(r);f.c.chat=structuredClone(f.c.chat);if(!duplicate)f.c.chat[0].mes='new';const restored=f.make(),before=JSON.stringify(f.c.chatMetadata),ids=f.counts().ids;assert.equal((await restored.synchronize({expectedRevision:r.inspect().data.revision,cause:'explicit-reconcile'})).error.code,'SOURCE_IDENTITY_AMBIGUOUS');assert.equal(JSON.stringify(f.c.chatMetadata),before);assert.equal(f.counts().ids,ids);}
});

test('unknown save fences capture and exact verification reuses all allocated IDs without retrying save',async()=>{
 const options={offline:true},f=fixture(options),r=f.make();assert.equal((await enroll(r)).error.code,'PERSISTENCE_UNKNOWN');const metadata=JSON.stringify(f.c.chatMetadata),counts=f.counts();assert.equal(f.capture(r).error.code,'PERSISTENCE_UNKNOWN');assert.equal((await enroll(r)).error.code,'PERSISTENCE_UNKNOWN');options.offline=false;assert.equal((await r.verifyPending()).ok,true);assert.equal(JSON.stringify(f.c.chatMetadata),metadata);assert.equal(f.counts().ids,counts.ids);assert.equal(f.counts().saves,1);assert.equal(f.capture(r).ok,true);
});
test('scope switches permanently revoke previous snapshots even when returning to original scope',async()=>{
 const f=fixture(),r=f.make();await enroll(r);const snapshot=f.capture(r).data;f.user('other');r.inspect();f.user('user');assert.equal(api.inspectNativeSourceSnapshot(snapshot).error.code,'SOURCE_SNAPSHOT_STALE');assert.equal(f.capture(r).error.code,'SOURCE_REGISTRY_UNVERIFIED');
});
test('scope, prefix changes and cancellation during save cannot publish a late acknowledgement',async()=>{
 for(const change of ['scope','message','cancel','release']){let r;const controller=new AbortController(),f=fixture({onSave:c=>{if(change==='scope')f.user('other');if(change==='message')c.chat[0].mes='edit during save';if(change==='cancel')controller.abort();if(change==='release')r.release();}});r=f.make();const result=await r.synchronize({expectedRevision:null,cause:'enroll'},{signal:controller.signal});assert.equal(result.ok,false);assert.equal(f.capture(r).ok,false);assert.equal(f.counts().saves,1);}
});

test('source sidecar pages admit more than 1000 messages without aggregate Data admission or native mutation',async()=>{
 const f=fixture({chat:Array.from({length:1100},(_,i)=>({mes:'message '+i,is_user:i%2===0}))}),r=f.make();assert.equal((await enroll(r)).ok,true);const snapshot=view(f.capture(r).data);assert.equal(snapshot.entries.length,1100);const pages=f.c.chatMetadata.latticeSourcePages.user;assert.equal(Object.keys(pages).length,9);assert.equal(Object.values(pages).every(page=>page.rows.length<=128),true);const restored=f.make();assert.equal((await restored.verifyPending()).ok,true);
});
test('initial source capacity overflow holds before any metadata mutation or save',async()=>{
 const f=fixture({chat:Array.from({length:16385},(_,i)=>({mes:'message '+i}))}),r=f.make();assert.equal((await enroll(r)).error.code,'SOURCE_REGISTRY_CAPACITY');assert.deepEqual(f.c.chatMetadata,{});assert.equal(f.counts().saves,0);assert.equal(f.counts().ids,0);
});

test('restored metadata rejects foreign scope, duplicate pages, unknown row prose and invalid row revisions before verification',async()=>{
 for(const corruption of ['scope','duplicate-pages','row-prose','row-revision','ordinal','epoch']){const f=fixture(),r=f.make();await enroll(r);const header=f.c.chatMetadata.latticeSources.user,branch=header.branchStates.unbranched,page=f.c.chatMetadata.latticeSourcePages.user[branch.pageIds[0]];
 if(corruption==='scope')header.scope.chatId='other';if(corruption==='duplicate-pages')branch.pageIds.push(branch.pageIds[0]);if(corruption==='row-prose')page.rows[0].text='PRIVATE FORGED SOURCE';if(corruption==='row-revision')page.rows[0].revision=42;if(corruption==='ordinal')page.rows[0].ordinal=200;if(corruption==='epoch')branch.sourceEpoch='';
 const before=f.counts(),restored=f.make();assert.equal((await restored.verifyPending()).ok,false,corruption);assert.equal(f.counts().requests,before.requests,corruption);assert.doesNotMatch(JSON.stringify(restored.inspect()),/PRIVATE FORGED SOURCE/);
 }
});

test('trusted identity conflicts never fall back to duplicate anchors or reuse a deleted logical ID',async()=>{
 const identityAdapter={kind:'native-test',getBirthAnchor:message=>message.birth,getImmutableId:message=>message.nativeId};const f=fixture({chat:[{mes:'a',birth:'a',nativeId:'A'},{mes:'b',birth:'b',nativeId:'B'}],identityAdapter}),r=f.make();await enroll(r);const before=JSON.stringify(f.c.chatMetadata);f.c.chat[1].birth='a';assert.equal((await r.synchronize({expectedRevision:r.inspect().data.revision,cause:'host-change'})).error.code,'SOURCE_IDENTITY_AMBIGUOUS');assert.equal(JSON.stringify(f.c.chatMetadata),before);
});
test('metadata replacement rejects a blocked sidecar target before changing either reserved namespace',async()=>{
 const f=fixture(),r=f.make();Object.defineProperty(f.c.chatMetadata,'latticeSourcePages',{value:{},enumerable:true,writable:false,configurable:false});const before=JSON.stringify(f.c.chatMetadata);assert.equal((await enroll(r)).ok,false);assert.equal(JSON.stringify(f.c.chatMetadata),before);assert.equal(f.counts().saves,0);
});
test('native read rechecks exact context after trusted scope callbacks before installing metadata',async()=>{
 const original={chatId:'story',chat:[{mes:'first'}],chatMetadata:{}},other={chatId:'elsewhere',chat:[],chatMetadata:{}};let active=original,reads=0;
 const r=api.createNativeSourceRegistry({getContext:()=>active,getUserId:()=>{if(++reads===2)active=other;return 'user';},persistenceVerifier:{saveAndVerify:async()=>{throw Error('must not save');},verify:async()=>{throw Error('must not read');}}});const result=await enroll(r);assert.equal(result.ok,false);assert.deepEqual(original.chatMetadata,{});assert.deepEqual(other.chatMetadata,{});
});

test('read-only restored verification never allocates IDs for an appended unenrolled message',async()=>{
 const f=fixture(),r=f.make();await enroll(r);f.c.chat=structuredClone(f.c.chat);f.c.chat.push({mes:'new append'});const restored=f.make(),before=f.counts();assert.equal((await restored.verifyPending()).error.code,'SOURCE_REGISTRY_STALE');assert.equal(f.counts().ids,before.ids);assert.equal(f.counts().saves,before.saves);
});
test('private capture accepts only exact native prefix objects and rechecks the captured prefix after mutation',async()=>{
 const f=fixture(),r=f.make();await enroll(r);const prefix=f.c.chat.slice(0,2),captured=r.capture({chat:prefix,scope:{userId:'user',chatId:'story'},selector:{roles:['user','assistant']},isCurrent:()=>true});assert.equal(captured.ok,true);assert.equal(view(captured.data).entries.length,2);prefix[0]={...prefix[0]};assert.equal(api.inspectNativeSourceSnapshot(captured.data).error.code,'SOURCE_SNAPSHOT_STALE');
 assert.equal(r.capture({chat:structuredClone(f.c.chat),scope:{userId:'user',chatId:'story'},selector:{},isCurrent:()=>true}).ok,false);
});

test('invalidation callbacks cannot change metadata targets between final validation and replacement',async()=>{
 let f;f=fixture({onInvalidated:()=>Object.defineProperty(f.c.chatMetadata,'latticeSourcePages',{writable:false,configurable:false})});const r=f.make();await enroll(r);f.c.chat[0].mes='edited';const before=JSON.stringify(f.c.chatMetadata);assert.equal((await r.synchronize({expectedRevision:r.inspect().data.revision,cause:'host-change'})).ok,false);assert.equal(JSON.stringify(f.c.chatMetadata),before);assert.equal(f.counts().saves,1);
});

test('sparse and accessor prefix arrays cannot mint a private source snapshot',async()=>{
 const f=fixture(),r=f.make();await enroll(r);let reads=0;const accessor=[];Object.defineProperty(accessor,0,{get(){reads++;return f.c.chat[0];},enumerable:true});for(const chat of [new Array(2),accessor])assert.equal(r.capture({chat,scope:{userId:'user',chatId:'story'},selector:{},isCurrent:()=>true}).ok,false);assert.equal(reads,0);
});

test('a trusted immutable identity cannot change on the same native object',async()=>{
 const f=fixture({chat:[{mes:'first',nativeId:'immutable-A'}],identityAdapter:{kind:'native-id',getImmutableId:m=>m.nativeId}}),r=f.make();await enroll(r);f.c.chat[0].nativeId='immutable-B';const before=JSON.stringify(f.c.chatMetadata);assert.equal((await r.synchronize({expectedRevision:r.inspect().data.revision,cause:'host-change'})).error.code,'SOURCE_IDENTITY_AMBIGUOUS');assert.equal(JSON.stringify(f.c.chatMetadata),before);
});

test('a newly proven immutable ID with unchanged text cannot steal a previous logical source on reload',async()=>{
 const f=fixture({chat:[{mes:'same',nativeId:'A'}],identityAdapter:{kind:'native-id',getImmutableId:m=>m.nativeId}}),r=f.make();await enroll(r);const old=view(f.capture(r).data).entries[0].sourceId;f.c.chat=structuredClone(f.c.chat);f.c.chat[0].nativeId='B';const restored=f.make();assert.equal((await restored.synchronize({expectedRevision:r.inspect().data.revision,cause:'explicit-reconcile'})).ok,true);assert.notEqual(view(f.capture(restored).data).entries[0].sourceId,old);assert.equal(restored.inspect().data.retainedSources,2);
});

test('private reader view retains the owned selector and semantic identity while later caller mutation has no authority',async()=>{
 const f=fixture(),r=f.make();await enroll(r);const selector={roles:['user']},captured=r.capture({chat:f.c.chat,scope:{userId:'user',chatId:'story'},selector,isCurrent:()=>true});selector.roles.push('assistant');assert.deepEqual(view(captured.data).selector,{roles:['user']});assert.match(view(captured.data).selectorHash,/^sha256:/);assert.equal(Object.isFrozen(view(captured.data).selector),true);
});

test('retained tombstones consume capacity and are never silently pruned to enroll another source',async()=>{
 const f=fixture({chat:[{mes:'retained'}]}),r=f.make();await enroll(r);const header=f.c.chatMetadata.latticeSources.user,branch=header.branchStates.unbranched,template=f.c.chatMetadata.latticeSourcePages.user[branch.pageIds[0]].rows[0];branch.pageIds=[];const pages={};for(let p=0;p<128;p++){const pageId='capacity-page-'+p;branch.pageIds.push(pageId);pages[pageId]={schemaVersion:1,scope:{userId:'user',chatId:'story'},branchKey:'unbranched',rows:Array.from({length:128},(_,i)=>{const n=p*128+i;return {...template,sourceId:n===0?template.sourceId:'tombstone-'+n,tombstone:n!==0};})};}f.c.chatMetadata.latticeSourcePages.user=pages;f.c.chat.push({mes:'new'});const before=JSON.stringify(f.c.chatMetadata),counts=f.counts();assert.equal((await r.synchronize({expectedRevision:header.revision,cause:'host-change'})).error.code,'SOURCE_REGISTRY_CAPACITY');assert.equal(JSON.stringify(f.c.chatMetadata)===before,true);assert.equal(f.counts().ids,counts.ids);assert.equal(f.counts().saves,counts.saves);assert.equal(r.inspect().data.retainedSources,16384);
});
test('reader classification preserves restrictions and protocol barriers without exporting hidden reasoning',async()=>{
 const f=fixture({chat:[{mes:'private',visibility:{kind:'actor-private',actorId:'character:Mara.png'},extra:{reasoning:'PRIVATE HIDDEN REASONING'}},{mes:'restricted',visibleTo:['character:Mara.png']},{mes:'tool material',role:'tool'},{mes:'pending',gen_started:new Date('2026-01-01T00:00:00Z')}]});const r=f.make();assert.equal((await enroll(r)).ok,true);const data=view(f.capture(r).data);assert.deepEqual(data.entries[0].visibility,{kind:'actor-private',actorId:'character:Mara.png'});assert.equal(data.entries[1].visibility.kind,'hidden');assert.equal(data.entries[2].protocol,'tool');assert.equal(data.entries[3].settled,false);assert.doesNotMatch(JSON.stringify(data),/PRIVATE HIDDEN REASONING/);assert.doesNotMatch(JSON.stringify(f.c.chatMetadata),/reasoning|PRIVATE HIDDEN/);
});
test('unselected swipe histories and reasoning changes cannot revise selected source identity or stale a snapshot',async()=>{
 const f=fixture({chat:[{mes:'selected',swipe_id:0,swipes:['selected','unselected'],extra:{reasoning:'hidden'},swipe_info:[{send_date:'one'},{send_date:'two'}]}]}),r=f.make();await enroll(r);const snapshot=f.capture(r).data,revision=view(snapshot).entries[0].revision;f.c.chat[0].swipes[1]='changed unselected';f.c.chat[0].extra.reasoning='changed reasoning';assert.equal(api.inspectNativeSourceSnapshot(snapshot).ok,true);assert.equal(view(f.capture(r).data).entries[0].revision,revision);
});

test('acknowledged commit exposes source epoch and order revision for the private coordinator seam',async()=>{
 const f=fixture(),r=f.make(),result=await enroll(r),snapshot=f.capture(r).data;assert.equal(result.data.sourceEpoch,snapshot.sourceEpoch);assert.equal(result.data.orderRevision,snapshot.orderRevision);assert.equal(result.data.persistence,'confirmed');
});

test('capture immediately fences changes to trusted immutable adapter identity',async()=>{
 const f=fixture({chat:[{mes:'same',nativeId:'A'}],identityAdapter:{kind:'immutable',getImmutableId:m=>m.nativeId}}),r=f.make();await enroll(r);const snapshot=f.capture(r).data;f.c.chat[0].nativeId='B';assert.equal(f.capture(r).ok,false);assert.equal(api.inspectNativeSourceSnapshot(snapshot).ok,false);
});

test('observing unsupported native scope revokes captures permanently when returning to the same chat',async()=>{
 const f=fixture(),r=f.make();await enroll(r);const snapshot=f.capture(r).data;f.c.groupId='group';assert.equal(r.inspect().ok,false);f.c.groupId=null;assert.equal(api.inspectNativeSourceSnapshot(snapshot).ok,false);assert.equal(f.capture(r).ok,false);
});

test('host exceptions cannot smuggle prose or secrets into source diagnostic codes',()=>{
 const r=api.createNativeSourceRegistry({getContext:()=>{throw Error('SOURCE_PRIVATE_SECRET_DO_NOT_EXPORT');},getUserId:()=> 'user',persistenceVerifier:{saveAndVerify(){},verify(){}}});assert.equal(r.inspect().error.code,'SOURCE_REGISTRY_INVALID');assert.doesNotMatch(JSON.stringify(r.inspect()),/PRIVATE_SECRET/);
});

test('trusted same-chat branches receive separate source epochs and revoke prior branch snapshots',async()=>{
 const f=fixture({branchAdapter:true,branch:'left'}),r=f.make();await enroll(r);const left=f.capture(r).data;f.branch('right');assert.equal(f.capture(r).error.code,'SOURCE_REGISTRY_SETUP_REQUIRED');assert.equal(api.inspectNativeSourceSnapshot(left).ok,false);assert.equal((await r.synchronize({expectedRevision:r.inspect().data.revision,cause:'enroll'})).ok,true);const right=f.capture(r).data;assert.notEqual(right.sourceEpoch,left.sourceEpoch);assert.equal(Object.keys(f.c.chatMetadata.latticeSources.user.branchStates).length,2);assert.deepEqual(right.scope,{userId:'user',chatId:'story',branchId:'right'});
});
test('save verification await cannot grant snapshots after source changes, cancellation, or release',async()=>{
 for(const change of ['message','cancel','release']){let r;const controller=new AbortController(),options={offline:true},f=fixture(options);r=f.make();await enroll(r);options.offline=false;options.onFetch=c=>{if(change==='message')c.chat[0].mes='changed while verifying';if(change==='cancel')controller.abort();if(change==='release')r.release();};assert.equal((await r.verifyPending({signal:controller.signal})).ok,false);assert.equal(f.capture(r).ok,false);assert.equal(f.counts().saves,1);}
});

for(const conflictingField of ['nativeId','birth'])test(`cold reload holds conflicting ${conflictingField} after recovery through the other immutable anchor`,async()=>{
 const invalidations=[],f=fixture({chat:[{mes:'unchanged selected source',nativeId:'native-A',birth:'birth-A'}],identityAdapter:{kind:'dual-immutable',getImmutableId:m=>m.nativeId,getBirthAnchor:m=>m.birth},onInvalidated:value=>invalidations.push(value)}),r=f.make();
 assert.equal((await enroll(r)).ok,true);const prior=view(f.capture(r).data).entries[0],expectedRevision=r.inspect().data.revision;
 f.c.chat=structuredClone(f.c.chat);f.c.chat[0][conflictingField]=conflictingField==='nativeId'?'native-B':'birth-B';const restored=f.make(),before=JSON.stringify(f.c.chatMetadata),counts=f.counts();
 const result=await restored.synchronize({expectedRevision,cause:'explicit-reconcile'});assert.equal(result.ok,false);assert.equal(result.error.code,'SOURCE_IDENTITY_AMBIGUOUS');
 assert.equal(JSON.stringify(f.c.chatMetadata),before);assert.deepEqual(f.counts(),counts);assert.equal(f.capture(restored).ok,false);
 assert.deepEqual(invalidations,[{scope:{userId:'user',chatId:'story'},reason:'SOURCE_IDENTITY_AMBIGUOUS',changes:[{sourceId:prior.sourceId,priorRevision:prior.revision,nextRevision:null,tombstone:false}]}]);
});

test('explicit new epoch reset tombstones old identities and revokes snapshots while preserving native bytes',async()=>{
 const invalidations=[],f=fixture({onInvalidated:value=>invalidations.push(value)}),r=f.make();await enroll(r);const snapshot=f.capture(r).data,old=view(snapshot).entries,prior=r.inspect().data.revision,bytes=JSON.stringify(f.c.chat);
 assert.equal(typeof r.resetSourceEpoch,'function');
 const reset=await r.resetSourceEpoch({expectedRevision:prior,reason:'identity-ambiguity',confirmRebuild:true});assert.equal(reset.ok,true,JSON.stringify(reset));assert.equal(reset.data.rebuildRequired,true);assert.notEqual(reset.data.sourceEpoch,snapshot.sourceEpoch);assert.equal(api.inspectNativeSourceSnapshot(snapshot).ok,false);
 const next=view(f.capture(r).data).entries;assert.ok(next.every(e=>!old.some(o=>o.sourceId===e.sourceId)));assert.equal(r.inspect().data.retainedSources,old.length+next.length);assert.equal(JSON.stringify(f.c.chat),bytes);assert.equal(invalidations.flatMap(v=>v.changes).filter(v=>v.tombstone).length,old.length);
});
test('explicit epoch reset preserves unknown-save truth and cannot retarget pending IDs',async()=>{
 const options={offline:true},f=fixture(options),r=f.make();assert.equal((await enroll(r)).error.code,'PERSISTENCE_UNKNOWN');const oldIds=Object.values(f.c.chatMetadata.latticeSourcePages.user).flatMap(p=>p.rows.map(r=>r.sourceId));f.c.chat[0].mes='offline changed';options.offline=false;
 const reset=await r.resetSourceEpoch({expectedRevision:r.inspect().data.revision,reason:'unrecoverable-pending-save',confirmRebuild:true});assert.equal(reset.ok,true,JSON.stringify(reset));assert.equal(reset.data.priorPersistence,'unknown');assert.equal(reset.data.rebuildRequired,true);assert.ok(view(f.capture(r).data).entries.every(e=>!oldIds.includes(e.sourceId)));assert.equal(f.counts().saves,2);
});

test('a privately captured prefix allows only the host-owned append exception and separates current head completeness',async()=>{
 for(const owned of [false,true]){const f=fixture(),r=f.make();await enroll(r);const prefix=f.c.chat.slice(0,2),captured=r.capture({chat:prefix,scope:{userId:'user',chatId:'story'},selector:{roles:['user','assistant']},isCurrent:()=>true,...(owned?{allowPrefixAppend:()=>true}:{})});assert.equal(captured.ok,true);assert.equal(api.inspectNativeSourceSnapshot(captured.data).data.currentHead,false);f.c.chat.push({mes:'later reply'});assert.equal(api.inspectNativeSourceSnapshot(captured.data).ok,owned);if(owned)assert.equal(api.inspectNativeSourceSnapshot(captured.data).data.currentHead,false);assert.equal(f.capture(r).ok,false);f.c.chat[0].mes='prefix edit';assert.equal(api.inspectNativeSourceSnapshot(captured.data).ok,false);}
});

test('epoch reset requires explicit confirmation, exact revision and pending-save reason without metadata side effects',async()=>{
 const f=fixture(),r=f.make();await enroll(r);const before=f.counts(),metadata=JSON.stringify(f.c.chatMetadata),revision=r.inspect().data.revision;
 for(const command of [{expectedRevision:revision,reason:'identity-ambiguity',confirmRebuild:false},{expectedRevision:'wrong',reason:'identity-ambiguity',confirmRebuild:true},{expectedRevision:revision,reason:'unrecoverable-pending-save',confirmRebuild:true},{expectedRevision:revision,reason:'identity-ambiguity',confirmRebuild:true,extra:true}])assert.equal((await r.resetSourceEpoch(command)).ok,false);
 assert.equal(JSON.stringify(f.c.chatMetadata),metadata);assert.deepEqual(f.counts(),before);
});

test('explicit epoch recovery holds at retained-row capacity without pruning prior identities',async()=>{
 const f=fixture(),r=f.make();await enroll(r);const header=f.c.chatMetadata.latticeSources.user,branch=header.branchStates.unbranched,original=f.c.chatMetadata.latticeSourcePages.user[branch.pageIds[0]].rows,template=original[0];const rows=[...original,...Array.from({length:16384-original.length},(_,i)=>({...template,sourceId:'retired-'+i,tombstone:true}))];branch.pageIds=[];const pages={};for(let i=0;i<rows.length;i+=128){const pageId='retained-'+i;branch.pageIds.push(pageId);pages[pageId]={schemaVersion:1,scope:branch.scope,branchKey:'unbranched',rows:rows.slice(i,i+128)};}f.c.chatMetadata.latticeSourcePages.user=pages;const restored=f.make(),before=f.counts(),metadata=JSON.stringify(f.c.chatMetadata);assert.equal((await restored.resetSourceEpoch({expectedRevision:header.revision,reason:'identity-ambiguity',confirmRebuild:true})).error.code,'SOURCE_REGISTRY_CAPACITY');assert.equal(JSON.stringify(f.c.chatMetadata),metadata);assert.deepEqual(f.counts(),before);
});
