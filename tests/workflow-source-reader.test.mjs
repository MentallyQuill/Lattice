import assert from 'node:assert/strict';
import test from 'node:test';
import {createNativePersistenceVerifier} from '../src/workflow/native-persistence.js?v=0.30.2';
import {createNativeSourceRegistry,inspectNativeSourceSnapshot} from '../src/workflow/native-source-registry.js?v=0.30.2';
import {cloneJsonValue} from '../src/workflow/operations/json-data.js?v=0.30.2';
const api=await import('../src/workflow/source-reader.js?v=0.30.2').catch(()=>({}));
export async function sourceFixture(chat,ports={}){
 let serial=0,saved,savedChat,user='user',saves=0,reads=0;
 const context={chatId:'story',characterId:0,groupId:null,chat,characters:[{name:'Mara',avatar:'Mara.png',chat:'Story'}],chatMetadata:{},getRequestHeaders:()=>({'Content-Type':'application/json'}),saveMetadata:async()=>{saves++;saved=structuredClone(context.chatMetadata);savedChat=structuredClone(context.chat);}};
 const persistenceVerifier=createNativePersistenceVerifier({getContext:()=>context,getUserId:()=>user,fetch:async()=>{reads++;return {ok:true,text:async()=>JSON.stringify([{chat_metadata:saved},...savedChat])};}});
 const registry=createNativeSourceRegistry({getContext:()=>context,getUserId:()=>user,persistenceVerifier,randomId:()=>`id-${++serial}`});
 assert.equal((await registry.synchronize({expectedRevision:null,cause:'enroll'})).ok,true);
 const capture=(selector={roles:['user','assistant']},controls={})=>registry.capture({chat:context.chat,scope:{userId:user,chatId:'story'},selector,isCurrent:()=>true,...controls}).data;
 return {context,registry,capture,counts:()=>({saves,reads}),user:value=>{user=value;},sync:()=>registry.synchronize({expectedRevision:registry.inspect().data.revision,cause:'host-change'}),reader:()=>api.createSourceReader(ports)};
}
const messages=count=>Array.from({length:count},(_,i)=>({mes:'message '+i,is_user:i%2===0}));
const request={selection:'recent',recentMessages:2000,maxMessages:1000,maxTextUnits:100000};
const value=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.data;};
test('reader requires exact registry snapshot and emits bounded source-backed outputs over complete pages',async()=>{
 assert.equal(typeof api.selectSourcePage,'function');
 const f=await sourceFixture(messages(1106)),snapshot=f.capture();
 assert.equal(api.selectSourcePage({...snapshot},request).error.code,'SOURCE_SNAPSHOT_UNAUTHORIZED');
 let page=value(api.selectSourcePage(snapshot,request)),all=[];
 assert.ok(page.outputs.out.messages.length>0&&page.outputs.out.messages.length<=1000);
 assert.equal(page.outputs.manifest.value.completeness,'page');
 while(true){
  const {out,records,manifest,cursor,report}=page.outputs;
  assert.ok(Object.isFrozen(out));assert.equal(records.value.length,out.messages.length);assert.equal(report.value.pageMessages,out.messages.length);
  for(const artifact of Object.values(page.outputs))assert.equal(cloneJsonValue(artifact).ok,true);
  for(let i=0;i<out.messages.length;i++){const m=out.messages[i],r=records.value[i];assert.equal(m.id,r.id);assert.doesNotMatch(m.id,/chat:\d/);assert.deepEqual(r.sourceRefs[0].span,{start:0,end:m.text.length,unit:'utf16'});}
  all.push(...out.messages.map(x=>x.id));
  if(manifest.value.completeness==='complete')break;
  page=value(api.selectSourcePage(snapshot,{selection:'since-cursor',cursor:cursor.value,maxMessages:1000,maxTextUnits:100000}));
 }
 assert.equal(all.length,1106);assert.equal(new Set(all).size,1106);assert.ok(page.outputs.out.messages.length<1000);
});
test('oversized complete group holds without truncation',async()=>{
 const f=await sourceFixture([{mes:'12345',is_user:true},{mes:'67890'}]);
 assert.equal(api.selectSourcePage(f.capture(),{selection:'recent',recentMessages:2,maxMessages:1,maxTextUnits:100}).error.code,'SOURCE_GROUP_TOO_LARGE');
 assert.equal(api.selectSourcePage(f.capture(),{selection:'recent',recentMessages:2,maxMessages:2,maxTextUnits:9}).error.code,'SOURCE_GROUP_TOO_LARGE');
});
test('hidden and excluded protocol rows are barriers and safe counts do not disclose their presence',async()=>{
 const f=await sourceFixture([{mes:'user',is_user:true},{mes:'secret',extra:{hidden:true}},{mes:'reply'},{mes:'tool',is_tool:true},{mes:'u2',is_user:true},{mes:'a2'}]);
 const p=value(api.selectSourcePage(f.capture(),{...request,recentMessages:10}));
 assert.deepEqual(p.outputs.out.messages.map(x=>x.text),['user','reply','u2','a2']);
 assert.equal(p.outputs.report.value.sourceSetMessages,4);assert.doesNotMatch(JSON.stringify(p),/secret|tool/);
 const proof=value(api.inspectSourcePage(p));assert.deepEqual(proof.groups.map(g=>g.memberIds.length),[2]);assert.equal(proof.unpairedMemberIds.length,2);
 const before=value(api.selectSourcePage(f.capture(),{selection:'before-window',keepRecentAssistantTurns:0,maxMessages:1000,maxTextUnits:100000}));
 assert.deepEqual(before.outputs.out.messages.map(x=>x.text),['u2','a2']);
});
test('actor text requires current constructor grant, inherited private visibility and grant change revokes page',async()=>{
 let current=true;const scope={userId:'user',chatId:'story'},grant={actorId:'mara',scope,isCurrent:()=>current};
 const f=await sourceFixture([{mes:'public',is_user:true},{mes:'private',visibility:{kind:'actor-private',actorId:'mara'}},{mes:'other',visibility:{kind:'actor-private',actorId:'other'}}],{getActorGrant:()=>grant});
 const snapshot=f.capture(),publicPage=value(api.selectSourcePage(snapshot,request));assert.deepEqual(publicPage.outputs.out.messages.map(x=>x.text),['public']);
 const p=value(f.reader().selectSourcePage(snapshot,request));assert.deepEqual(p.outputs.out.messages.map(x=>x.text),['public','private']);assert.deepEqual(p.outputs.out.visibility,{kind:'actor-private',actorId:'mara'});assert.equal(p.outputs.report.value.sourceSetMessages,2);
 current=false;assert.equal(api.inspectSourcePage(p).ok,false);
 assert.equal(api.selectSourcePage(snapshot,{...request,actorId:'mara'}).error.code,'INVALID_SOURCE_REQUEST');
});
test('confirmed frontier is host-owned, nullable after means acknowledged beginning, and combines with newest-ten protection',async()=>{
 let frontier,query;const f=await sourceFixture(messages(30),{getConfirmedFrontier:q=>{query=q;return frontier;}}),snapshot=f.capture(),view=inspectNativeSourceSnapshot(snapshot).data;
 const opts={selection:'since-cursor',confirmed:true,upperBoundary:{keepRecentAssistantTurns:10},maxMessages:1000,maxTextUnits:100000};
 assert.equal(api.selectSourcePage(snapshot,opts).error.code,'SOURCE_FRONTIER_REQUIRED');
 const reader=f.reader();assert.equal(reader.selectSourcePage(snapshot,opts).error.code,'SOURCE_FRONTIER_REQUIRED');
 frontier={...query,after:null,isCurrent:()=>true};
 assert.equal(value(reader.selectSourcePage(snapshot,opts)).outputs.out.messages.length,10);
 frontier={...frontier,after:{sourceId:view.entries[3].sourceId,revision:view.entries[3].revision}};
 const p=value(reader.selectSourcePage(snapshot,opts));assert.deepEqual(p.outputs.out.messages.map(x=>x.text),messages(30).slice(4,10).map(x=>x.mes));
 frontier={...frontier,after:null};assert.equal(api.inspectSourcePage(p).error.code,'SOURCE_PAGE_STALE');
 assert.equal(reader.selectSourcePage(snapshot,{...opts,confirmedFrontier:{after:null}}).error.code,'INVALID_SOURCE_REQUEST');
});
test('cursor replay checks exact settings and prefix; append rebasing is explicit and rejects non-append mutations',async()=>{
 const f=await sourceFixture(messages(8)),snapshot=f.capture();
 const opts={selection:'since-cursor',maxMessages:2,maxTextUnits:100000};
 const page=value(api.selectSourcePage(snapshot,opts)),cursor=page.outputs.cursor.value;
 assert.deepEqual(value(api.selectSourcePage(snapshot,{...opts,cursor})).outputs.out.messages.map(x=>x.text),['message 2','message 3']);
 assert.equal(api.selectSourcePage(snapshot,{...opts,cursor:{...cursor,sourceSetId:'forged'}}).error.code,'READER_CURSOR_STALE');
 assert.equal(api.selectSourcePage(snapshot,{...opts,cursor,recentMessages:1}).error.code,'READER_CURSOR_STALE');
 f.context.chat.push(...messages(2).map((m,i)=>({...m,mes:'append '+i})));await f.sync();
 const fresh=f.capture();assert.equal(api.selectSourcePage(fresh,{...opts,cursor}).error.code,'READER_CURSOR_STALE');
 assert.equal(value(api.selectSourcePage(fresh,{...opts,cursor,allowAppendRebase:true})).outputs.report.value.rebased,true);
 // A mutation in the unread old suffix is not an append rebase either.
 f.context.chat[5].mes='suffix edit';await f.sync();
 assert.equal(api.selectSourcePage(f.capture(),{...opts,cursor,allowAppendRebase:true}).error.code,'READER_CURSOR_STALE');
});
test('prefix edit/delete/swipe and role reselection invalidate cursor continuation',async()=>{
 for(const change of ['edit','delete','swipe','selector']){
  const f=await sourceFixture(messages(8)),opts={selection:'since-cursor',maxMessages:2,maxTextUnits:100000},cursor=value(api.selectSourcePage(f.capture(),opts)).outputs.cursor.value;
  if(change==='edit')f.context.chat[0].mes='edited';if(change==='delete')f.context.chat.splice(0,1);if(change==='swipe'){f.context.chat[0].swipes=['message 0','message 0'];f.context.chat[0].swipe_id=1;}
  if(change!=='selector')await f.sync();
  assert.equal(api.selectSourcePage(f.capture(change==='selector'?{roles:['assistant']}:undefined),{...opts,cursor,allowAppendRebase:true}).error.code,'READER_CURSOR_STALE');
 }
});
test('range uses stable IDs and cannot split verified groups; zero eligible output is complete but never deletion evidence',async()=>{
 const f=await sourceFixture(messages(6)),snapshot=f.capture(),entries=inspectNativeSourceSnapshot(snapshot).data.entries;
 assert.equal(api.selectSourcePage(snapshot,{selection:'range',range:{firstSourceId:entries[1].sourceId,lastSourceId:entries[3].sourceId},maxMessages:100,maxTextUnits:100000}).error.code,'SOURCE_RANGE_GROUP_SPLIT');
 const page=value(api.selectSourcePage(snapshot,{selection:'range',range:{firstSourceId:entries[2].sourceId,lastSourceId:entries[5].sourceId},maxMessages:100,maxTextUnits:100000}));assert.equal(page.outputs.out.messages.length,4);
 const empty=value(api.selectSourcePage(snapshot,{selection:'before-window',maxMessages:100,maxTextUnits:100000}));assert.deepEqual(empty.outputs.records.value,[]);assert.equal(empty.outputs.manifest.value.completeness,'complete');assert.equal(empty.outputs.report.value.deletionEvidence,false);
});
test('freshness is checked around host callbacks and for released, cancelled, switched or changed sources',async()=>{
 for(const change of ['callback','cancel','reader-release','registry-release','revision','scope']){
  const controller=new AbortController();let f;f=await sourceFixture(messages(4),{signal:controller.signal,...(change==='callback'?{getActorGrant:()=>{f.context.chat[0].mes='changed in grant';return null;}}:{})});const reader=f.reader(),snapshot=f.capture();
  if(change==='callback'){assert.equal(reader.selectSourcePage(snapshot,request).ok,false);continue;}
  const page=value(reader.selectSourcePage(snapshot,request));
  if(change==='cancel')controller.abort();if(change==='reader-release')reader.release();if(change==='registry-release')f.registry.release();if(change==='revision')f.context.chat[0].mes='changed';if(change==='scope')f.user('other');
  assert.equal(api.inspectSourcePage(page).ok,false);
 }
});
test('a newly installed actor grant invalidates an earlier public-only page from that reader',async()=>{
 let grant=null;const f=await sourceFixture(messages(2),{getActorGrant:()=>grant}),reader=f.reader();
 const page=value(reader.selectSourcePage(f.capture(),request));
 grant={actorId:'mara',scope:{userId:'user',chatId:'story'},isCurrent:()=>true};
 assert.equal(api.inspectSourcePage(page).ok,false);
});
test('confirmed frontier cannot bisect a complete verified group',async()=>{
 let frontier;const f=await sourceFixture(messages(6),{getConfirmedFrontier:q=>frontier?Object.assign(frontier,q):null}),snapshot=f.capture(),e=inspectNativeSourceSnapshot(snapshot).data.entries[0];
 frontier={after:{sourceId:e.sourceId,revision:e.revision},isCurrent:()=>true};
 assert.equal(f.reader().selectSourcePage(snapshot,{selection:'since-cursor',confirmed:true,maxMessages:1000,maxTextUnits:100000}).error.code,'SOURCE_FRONTIER_GROUP_SPLIT');
});
test('cursor cannot rebase across changed selection semantics, even when native sources did not change',async()=>{
 const f=await sourceFixture(messages(12)),snapshot=f.capture(),opts={selection:'since-cursor',maxMessages:2,maxTextUnits:100000};
 const cursor=structuredClone(value(api.selectSourcePage(snapshot,opts)).outputs.cursor.value);
 cursor.position.semantics={...cursor.position.semantics,selection:'recent',recentMessages:2};
 assert.equal(api.selectSourcePage(snapshot,{...opts,cursor,allowAppendRebase:true}).error.code,'READER_CURSOR_STALE');
});

test('empty selected pages still emit a valid non-authoritative cursor with after:null',async()=>{
 const f=await sourceFixture(messages(4)),page=value(api.selectSourcePage(f.capture(),{selection:'before-window',maxMessages:100,maxTextUnits:100000}));
 assert.equal(page.outputs.cursor.value?.type,'reader-cursor');assert.equal(page.outputs.cursor.value.position.after,null);
});
test('observed grant revocation permanently revokes an old page even if a host later restores its handle',async()=>{
 let active=true;const grant={actorId:'mara',scope:{userId:'user',chatId:'story'},isCurrent:()=>active};
 const f=await sourceFixture(messages(2),{getActorGrant:()=>grant}),page=value(f.reader().selectSourcePage(f.capture(),request));
 active=false;assert.equal(api.inspectSourcePage(page).ok,false);active=true;assert.equal(api.inspectSourcePage(page).ok,false);
});
test('mutable host handle identity cannot silently retarget actor or acknowledged frontier bindings',async()=>{
 const grant={actorId:'mara',scope:{userId:'user',chatId:'story'},isCurrent:()=>true};
 const f=await sourceFixture(messages(4),{getActorGrant:()=>grant}),page=value(f.reader().selectSourcePage(f.capture(),request));
 grant.actorId='other';assert.equal(api.inspectSourcePage(page).ok,false);
 let frontier;const g=await sourceFixture(messages(6),{getConfirmedFrontier:q=>{frontier??={...q,after:null,isCurrent:()=>true};return frontier;}});
 const p=value(g.reader().selectSourcePage(g.capture(),{selection:'since-cursor',confirmed:true,maxMessages:100,maxTextUnits:100000}));
 frontier.after={sourceId:p.outputs.records.value[1].id,revision:p.outputs.records.value[1].revision};assert.equal(api.inspectSourcePage(p).ok,false);
});
test('a group that exceeds portable JSON bytes holds atomically although text and message budgets fit',async()=>{
 const f=await sourceFixture([{mes:'\u0000'.repeat(25000),is_user:true},{mes:'\u0000'.repeat(25000)}]);
 const result=api.selectSourcePage(f.capture(),{selection:'recent',recentMessages:2,maxMessages:2,maxTextUnits:100000});assert.equal(result.error.code,'SOURCE_GROUP_TOO_LARGE');assert.equal(result.data,undefined);
});
test('system, unsettled and selector-excluded material cannot bridge user/assistant pairing',async()=>{
 const f=await sourceFixture([{mes:'u1',is_user:true},{mes:'system',is_system:true},{mes:'a1'},{mes:'u2',is_user:true},{mes:'...',extra:{partial:true}},{mes:'a2'},{mes:'u3',is_user:true},{mes:'a3'}]);
 const page=value(api.selectSourcePage(f.capture(),request)),view=value(api.inspectSourcePage(page));assert.deepEqual(view.groups.map(x=>x.memberIds.length),[2]);assert.equal(view.unpairedMemberIds.length,4);
 const users=value(api.selectSourcePage(f.capture({roles:['user']}),request));assert.equal(value(api.inspectSourcePage(users)).groups.length,0);assert.deepEqual(users.outputs.out.messages.map(x=>x.text),['u1','u2','u3']);
});
test('strict cursor replay rejects altered full-capture commitment independently of page prefix',async()=>{
 const f=await sourceFixture(messages(4)),snapshot=f.capture(),opts={selection:'since-cursor',maxMessages:2,maxTextUnits:100000};
 const cursor=structuredClone(value(api.selectSourcePage(snapshot,opts)).outputs.cursor.value);cursor.position.capturedDigest='forged';
 assert.equal(api.selectSourcePage(snapshot,{...opts,cursor}).error.code,'READER_CURSOR_STALE');
});
test('source selection and private inspection make no persistence reads, saves or native mutations',async()=>{
 const f=await sourceFixture(messages(4)),before=structuredClone(f.context.chat),metadata=structuredClone(f.context.chatMetadata),counts=f.counts(),page=value(api.selectSourcePage(f.capture(),request));
 assert.equal(api.inspectSourcePage(page).ok,true);assert.deepEqual(f.counts(),counts);assert.deepEqual(f.context.chat,before);assert.deepEqual(f.context.chatMetadata,metadata);
});
test('real append cannot rebase a copied cursor with changed protection or selection semantics',async()=>{
 for(const change of ['protection','selection']){
  const f=await sourceFixture(messages(30)),snapshot=f.capture();
  const opts={selection:'since-cursor',upperBoundary:{keepRecentAssistantTurns:10},maxMessages:2,maxTextUnits:100000};
  const cursor=value(api.selectSourcePage(snapshot,opts)).outputs.cursor.value,tampered=structuredClone(cursor);
  if(change==='protection')tampered.position.semantics.keepRecentAssistantTurns=0;
  else tampered.position.semantics={...tampered.position.semantics,selection:'recent',recentMessages:12};
  f.context.chat.push({mes:'append question',is_user:true},{mes:'append reply'});await f.sync();const fresh=f.capture();
  const resume={selection:'since-cursor',maxMessages:1000,maxTextUnits:100000,allowAppendRebase:true};
  const valid=value(api.selectSourcePage(fresh,{...resume,cursor}));assert.equal(valid.outputs.report.value.rebased,true);assert.deepEqual(valid.outputs.out.messages.map(m=>m.text),messages(30).slice(2,12).map(m=>m.mes));
  const result=api.selectSourcePage(fresh,{...resume,cursor:tampered});assert.equal(result.ok,false);assert.equal(result.error.code,'READER_CURSOR_STALE');
 }
});
test('real append rebase verifies the previous frontier-dependent selection identity',async()=>{
 let frontier,after;const f=await sourceFixture(messages(30),{getConfirmedFrontier:q=>{frontier??={...q,after,isCurrent:()=>true};return frontier;}}),snapshot=f.capture(),entries=inspectNativeSourceSnapshot(snapshot).data.entries;
 after={sourceId:entries[3].sourceId,revision:entries[3].revision};const reader=f.reader();
 const cursor=value(reader.selectSourcePage(snapshot,{selection:'since-cursor',confirmed:true,upperBoundary:{keepRecentAssistantTurns:10},maxMessages:2,maxTextUnits:100000})).outputs.cursor.value;
 f.context.chat.push({mes:'append question',is_user:true},{mes:'append reply'});await f.sync();const fresh=f.capture(),resume={selection:'since-cursor',cursor,maxMessages:1000,maxTextUnits:100000,allowAppendRebase:true};
 assert.equal(value(reader.selectSourcePage(fresh,resume)).outputs.report.value.rebased,true);
 const tampered=structuredClone(cursor);tampered.position.semantics.confirmed=false;
 assert.equal(reader.selectSourcePage(fresh,{...resume,cursor:tampered}).error.code,'READER_CURSOR_STALE');
 frontier={...frontier,after:{sourceId:entries[7].sourceId,revision:entries[7].revision}};
 assert.equal(reader.selectSourcePage(fresh,resume).error.code,'READER_CURSOR_STALE');
});
