import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeMemoryAdapter } from '../src/workflow/introspection/host-memory.js?v=0.27.3';
import { makeRecord } from '../src/workflow/introspection/contracts.js?v=0.27.3';
import { advanceState } from '../src/workflow/introspection/context-state.js?v=0.27.3';
async function fixture() {
    let writes=0;
    const c={chatId:'story',characterId:0,groupId:null,characters:[{avatar:'mara.png'}],chatMetadata:{},chat:[{mes:'I draw the sword.',is_user:true},{mes:'The sword killed Orr.',is_user:false,swipe_id:0,swipes:['The sword killed Orr.'],swipe_info:[{gen_started:1,gen_finished:2}],gen_started:1,gen_finished:2}]};
    c.saveMetadata=async()=>{writes++;return true;};
    const controller=new AbortController();const session=createNativeMemoryAdapter({context:()=>c}).capture({signal:controller.signal,isCurrent:()=>true}).data;
    const state=await session.memory.read({view:'state'}),events=await session.memory.read({view:'events'});
    const proposal=advanceState(state.artifact,{mode:'track',trackId:'souls'},events.artifact);
    const intent=makeRecord('commit-intent',proposal.artifact.value,{proposal:proposal.artifact.value,idempotencyKey:'owned-turn'},proposal.artifact.value.sourceRefs).data;
    return {c,session,intent,writes:()=>writes,controller};
}
test('retained memory preflight performs no save and rejects changed final body before publication',async()=>{
    const f=await fixture(); assert.equal(typeof f.session.preflightAccepted,'function');
    const controls={body:'The sword killed Orr. Ash fell.',messageIndex:1,originalSwipeId:0};
    assert.equal((await f.session.preflightAccepted(f.intent,controls)).data.status,'ready');assert.equal(f.writes(),0);
    assert.equal((await f.session.preflightAccepted(f.intent,{...controls,body:'The sword spared Orr.'})).error.code,'FINAL_EVIDENCE_REEXTRACT_REQUIRED');assert.equal(f.writes(),0);
});
test('only exact privately accepted original swipe may authorize memory after final publication',async()=>{
    const f=await fixture(),body='The sword killed Orr. Ash fell.';
    await f.session.preflightAccepted(f.intent,{body,messageIndex:1,originalSwipeId:0});
    const m=f.c.chat[1];m.swipes.push(body);m.swipe_info.push({gen_started:3,gen_finished:4});Object.assign(m,{mes:body,swipe_id:1,gen_started:3,gen_finished:4});
    assert.equal(f.session.authorizeAcceptedPublication({body,finalText:body,messageIndex:1,originalSwipeId:0,finalSwipeId:1}).ok,true);
    assert.equal((await f.session.memory.commit(f.intent,{root:true})).ok,true);assert.equal(f.writes(),1);
});
test('historical edits or cancellation invalidate retained accepted memory authority',async()=>{
    for(const change of ['edit','abort']){const f=await fixture();if(change==='edit')f.c.chat[0].mes='Changed old event.';else f.controller.abort();
        assert.equal((await f.session.preflightAccepted(f.intent,{body:f.c.chat[1].mes,messageIndex:1,originalSwipeId:0})).ok,false);assert.equal(f.writes(),0);}
});
test('released memory authority cannot be reactivated by calling its retained capability',async()=>{
    const f=await fixture();f.session.release();const committed=await f.session.memory.commit(f.intent,{root:true});assert.equal(committed.ok,false);assert.equal(committed.error.code,'MEMORY_AUTHORITY_RELEASED');assert.equal(f.writes(),0);
});

async function publishAccepted(f,body='The sword killed Orr. Ash fell.') {
 const flags={body,messageIndex:1,originalSwipeId:0};assert.equal((await f.session.preflightAccepted(f.intent,flags)).ok,true);
 const m=f.c.chat[1];m.swipes.push(body);m.swipe_info.push({gen_started:3,gen_finished:4});Object.assign(m,{mes:body,swipe_id:1,gen_started:3,gen_finished:4});
 assert.equal(f.session.authorizeAcceptedPublication({...flags,finalText:body,finalSwipeId:1}).ok,true);
}
async function episodeFixture(){
 const f=await fixture(),state=await f.session.memory.read({view:'state'}),events=await f.session.memory.read({view:'events'}),ref=events.artifact.value.sourceRefs.find(x=>x.id==='chat:1');
 const proposed=makeRecord('state-proposal',state.artifact.value,{changes:[{op:'upsert',collection:'episodes',item:{id:'sword-event',text:f.c.chat[1].mes,classification:'observation',sourceRefs:[ref]}}],values:{},curves:{},tracks:{}},[ref]);assert.equal(proposed.ok,true);
 f.intent=makeRecord('commit-intent',proposed.data.value,{proposal:proposed.data.value,idempotencyKey:'accepted-episode'},[ref]).data;f.originalRef=ref;return f;
}
test('accepted native memory rebases only its owned original reference and stays readable after release and reload',async()=>{
 const f=await episodeFixture();await publishAccepted(f);assert.equal((await f.session.memory.commit(f.intent,{root:true})).ok,true);
 const receipt=structuredClone(f.c.chatMetadata.latticeIntrospection['native-chat']['character:mara.png'].receipts[0]);
 assert.equal((await f.session.memory.commit(f.intent,{root:true})).data.applied,false);assert.equal(f.writes(),1);f.session.release();
 f.c.chatMetadata=structuredClone(f.c.chatMetadata);
 const loaded=createNativeMemoryAdapter({context:()=>f.c}).capture().data;
 try{const events=await loaded.memory.read({view:'events'}),currentRef=events.artifact.value.sourceRefs.find(x=>x.id==='chat:1');assert.notDeepEqual(currentRef,f.originalRef);const state=await loaded.memory.read({view:'state'});assert.equal(state.ok,true);assert.equal(state.reports.some(x=>x.code==='INVALIDATED_SOURCES'),false);assert.deepEqual(state.artifact.value.payload.episodes[0].sourceRefs,[currentRef]);assert.deepEqual(state.artifact.value.sourceRefs,[currentRef]);assert.equal(state.artifact.value.payload.episodes[0].text,'The sword killed Orr.');assert.deepEqual(f.c.chatMetadata.latticeIntrospection['native-chat']['character:mara.png'].receipts[0],receipt);assert.equal((await loaded.memory.commit(f.intent,{root:true})).data.applied,false);assert.equal(f.writes(),1);}finally{loaded.release();}
});
for(const mutation of ['selected-text','selected-swipe','history','visibility'])test('accepted memory reload does not authorize changed '+mutation+' through an older swipe',async()=>{
 const f=await episodeFixture();await publishAccepted(f);assert.equal((await f.session.memory.commit(f.intent,{root:true})).ok,true);f.session.release();
 if(mutation==='selected-text'){f.c.chat[1].mes='The sword spared Orr.';f.c.chat[1].swipes[1]=f.c.chat[1].mes;}else if(mutation==='selected-swipe'){f.c.chat[1].swipe_id=0;f.c.chat[1].mes=f.c.chat[1].swipes[0];Object.assign(f.c.chat[1],structuredClone(f.c.chat[1].swipe_info[0]));}else if(mutation==='history'){f.c.chat.splice(1,1);}else f.c.chat[1].visibleTo=['character:other.png'];
 const loaded=createNativeMemoryAdapter({context:()=>f.c}).capture().data;
 try{const state=await loaded.memory.read({view:'state'});assert.equal(state.ok,true);assert.ok(state.reports.some(x=>x.code==='INVALIDATED_SOURCES'));assert.equal(f.writes(),1);}finally{loaded.release();}
});
test('accepted memory rebase rejects a changed original swipe and a final source beyond the accepted publication bound',async()=>{
 for(const mutation of ['original','oversize']){const f=await episodeFixture();await publishAccepted(f);if(mutation==='oversize'){f.c.chat[1].mes+='x'.repeat(100000);f.c.chat[1].swipes[1]=f.c.chat[1].mes;}if(mutation==='original')f.c.chat[1].swipes[0]='The sword spared Orr.';const result=await f.session.memory.commit(f.intent,{root:true});assert.equal(result.ok,false);assert.equal(f.writes(),0);assert.equal(f.c.chatMetadata.latticeIntrospection,undefined);}
});

test('accepted memory retains historical source references and rewrites no text values',async()=>{
 const f=await episodeFixture(),state=await f.session.memory.read({view:'state'}),events=await f.session.memory.read({view:'events'}),historical=events.artifact.value.sourceRefs.find(ref=>ref.id==='chat:0');
 const literal=JSON.stringify(f.originalRef),proposal=makeRecord('state-proposal',state.artifact.value,{changes:[{op:'upsert',collection:'episodes',item:{id:'historical-event',text:'Earlier player action.',classification:'observation',sourceRefs:[historical]}},{op:'upsert',collection:'episodes',item:{id:'sword-event',text:literal,classification:'observation',sourceRefs:[f.originalRef]}}],values:{},curves:{},tracks:{}},[historical,f.originalRef]);assert.equal(proposal.ok,true);
 f.intent=makeRecord('commit-intent',proposal.data.value,{proposal:proposal.data.value,idempotencyKey:'accepted-mixed-evidence'},[historical,f.originalRef]).data;
 await publishAccepted(f);assert.equal((await f.session.memory.commit(f.intent,{root:true})).ok,true);f.session.release();
 const loaded=createNativeMemoryAdapter({context:()=>f.c}).capture().data;
 try{const eventsNow=await loaded.memory.read({view:'events'}),accepted=eventsNow.artifact.value.sourceRefs.find(ref=>ref.id==='chat:1'),stored=await loaded.memory.read({view:'state'});assert.equal(stored.ok,true);assert.equal(stored.reports.some(x=>x.code==='INVALIDATED_SOURCES'),false);assert.deepEqual(stored.artifact.value.payload.episodes.find(x=>x.id==='historical-event').sourceRefs,[historical]);assert.deepEqual(stored.artifact.value.payload.episodes.find(x=>x.id==='sword-event').sourceRefs,[accepted]);assert.equal(stored.artifact.value.payload.episodes.find(x=>x.id==='sword-event').text,literal);assert.deepEqual(stored.artifact.value.sourceRefs,[historical,accepted]);}finally{loaded.release();}
});

test('same-body accepted publication retains durable memory on its exact new selected revision',async()=>{
 const f=await episodeFixture();await publishAccepted(f,f.c.chat[1].mes);assert.equal((await f.session.memory.commit(f.intent,{root:true})).ok,true);f.session.release();
 const loaded=createNativeMemoryAdapter({context:()=>f.c}).capture().data;
 try{const events=await loaded.memory.read({view:'events'}),current=events.artifact.value.sourceRefs.find(x=>x.id==='chat:1'),state=await loaded.memory.read({view:'state'});assert.notDeepEqual(current,f.originalRef);assert.equal(state.reports.some(x=>x.code==='INVALIDATED_SOURCES'),false);assert.deepEqual(state.artifact.value.payload.episodes[0].sourceRefs,[current]);assert.equal(state.artifact.value.payload.episodes[0].text,'The sword killed Orr.');}finally{loaded.release();}
});

for(const mutation of ['abort','selected-text','original-swipe','visibility','actor-selection'])test('accepted memory rejects '+mutation+' during awaited revision hashing before persistence',async()=>{
 const f=await episodeFixture(),body='The sword killed Orr. Ash fell.';await publishAccepted(f,body);
 const subtle=globalThis.crypto.subtle,prior=Object.getOwnPropertyDescriptor(subtle,'digest'),digest=subtle.digest;let changed=false;
 Object.defineProperty(subtle,'digest',{configurable:true,value:async function(...args){const result=await Reflect.apply(digest,this,args);let source;try{source=JSON.parse(new TextDecoder().decode(args[1]));}catch{}if(!changed&&Array.isArray(source)&&source[0]===1&&source[2]===body){changed=true;if(mutation==='abort')f.controller.abort();else if(mutation==='selected-text'){f.c.chat[1].mes='The sword spared Orr.';f.c.chat[1].swipes[1]=f.c.chat[1].mes;}else if(mutation==='original-swipe')f.c.chat[1].swipes[0]='The sword spared Orr.';else if(mutation==='visibility')f.c.chat[1].visibleTo=['character:other.png'];else f.c.characterId=1;}return result;}});
 try{const result=await f.session.memory.commit(f.intent,{root:true});assert.equal(changed,true);assert.equal(result.ok,false);assert.equal(f.writes(),0);assert.equal(f.c.chatMetadata.latticeIntrospection,undefined);}finally{if(prior)Object.defineProperty(subtle,'digest',prior);else delete subtle.digest;}
});

for(const mutation of ['text','visibility','abort'])test('long accepted source rejects '+mutation+' during historical-reference hashing after reload',async()=>{
 const f=await episodeFixture(),body='The sword killed Orr. '+ 'N'.repeat(5000);await publishAccepted(f,body);assert.equal((await f.session.memory.commit(f.intent,{root:true})).ok,true);f.session.release();
 const cancellation=new AbortController(),loaded=createNativeMemoryAdapter({context:()=>f.c}).capture({signal:cancellation.signal}).data;
 const subtle=globalThis.crypto.subtle,prior=Object.getOwnPropertyDescriptor(subtle,'digest'),digest=subtle.digest;let changed=false;
 Object.defineProperty(subtle,'digest',{configurable:true,value:async function(...args){const result=await Reflect.apply(digest,this,args);let source;try{source=JSON.parse(new TextDecoder().decode(args[1]));}catch{}if(!changed&&Array.isArray(source)&&source[0]===1&&source[2]===body){changed=true;if(mutation==='abort')cancellation.abort();else if(mutation==='visibility')f.c.chat[1].visibleTo=['character:other.png'];else{f.c.chat[1].mes+=' changed';f.c.chat[1].swipes[1]=f.c.chat[1].mes;}}return result;}});
 try{const state=await loaded.memory.read({view:'state'});assert.equal(changed,true);if(mutation==='abort'){assert.equal(state.ok,false);assert.equal(state.error.code,'CANCELLED');}else{assert.equal(state.ok,true);assert.ok(state.reports.some(report=>report.code==='INVALIDATED_SOURCES'));}assert.equal(f.writes(),1);}finally{if(prior)Object.defineProperty(subtle,'digest',prior);else delete subtle.digest;loaded.release();}
});
