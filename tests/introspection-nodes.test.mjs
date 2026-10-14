import assert from 'node:assert/strict';
import {test} from 'node:test';
import {state,proposal} from './fixtures/introspection.mjs';
import {createActorState,makeRecord} from '../src/workflow/introspection/contracts.js';
import {createMemoryService,createInMemoryBackend} from '../src/workflow/introspection/memory.js';
import {executeModelNode} from '../src/workflow/operations/model-nodes.js';
import {createDraftRevision} from '../src/workflow/draft-revisions.js?v=0.27.3';
const api=await import('../src/workflow/introspection/nodes.js').catch(()=>({}));
const node=(operation,settings={})=>({type:'workflow',operation,operationVersion:1,...settings});
const recallFixture=()=>{
    const initial=createActorState({chatId:'chat-1',actorId:'npc-1'},{id:'store-1',version:0},{episodes:[
        {id:'lighthouse',text:'A storm at the lighthouse.',classification:'interpretation',sourceRefs:[]},
        {id:'garden',text:'A quiet walk in the garden.',classification:'interpretation',sourceRefs:[]},
    ]}).data;
    const material=makeRecord('events',initial.value,{events:[]},[]).data;
    return {initial,material,memory:createMemoryService(createInMemoryBackend(initial,material))};
};
test('six registrations distill modes and declare dynamic typed ports',()=>{
    assert.equal(typeof api.describeIntrospection,'function');
    assert.equal(api.INTROSPECTION_OPERATIONS.length,6);
    const inner=api.describeIntrospection(node('express',{mode:'inner-voice'}));
    assert.equal(inner.ok,true); assert.equal(inner.data.descriptor.output,'text'); assert.equal(inner.data.descriptor.modelRole,'Prose'); assert.equal(inner.data.descriptor.requestBound,1);
    const behavior=api.describeIntrospection(node('express')); assert.equal(behavior.data.descriptor.output,'guidance');assert.equal(behavior.data.descriptor.requestBound,0);
    const commit=api.describeIntrospection(node('memory',{mode:'commit',idempotencyKey:'k'}),{phase:'post'}); assert.equal(commit.data.descriptor.terminal,true);assert.equal(commit.data.descriptor.rootOnly,true);
    assert.equal(api.describeIntrospection(node('memory',{mode:'commit',idempotencyKey:'k'}),{phase:'pre'}).ok,false);
});
test('invalid settings and named ports cannot access a memory provider',async()=>{
    let reads=0;
    const ports={memory:{read(){reads++;throw Error('must not read');}}};
    assert.equal((await api.executeIntrospection(node('state',{mode:'invalid'}),{},ports)).ok,false);
    assert.equal((await api.executeIntrospection(node('state'),{wrong:state()},ports)).ok,false);
    assert.equal((await api.executeIntrospection(node('state',{updates:{anger:NaN}}),{},ports)).ok,false);
    assert.equal(reads,0);
});
test('Memory Commit returns an intent without writing',async()=>{
    let writes=0;
    const result=await api.executeIntrospection(node('memory',{mode:'commit',idempotencyKey:'apology'}),{proposal:proposal()},{phase:'post',memory:{commit(){writes++;}}});
    assert.equal(result.ok,true);assert.equal(result.artifact.value.recordType,'commit-intent');assert.equal(writes,0);
});
test('State value passes an explicit state through detached and preserves controls round trip',async()=>{
    const descriptor=api.describeIntrospection(node('state')).data.descriptor;
    assert.deepEqual(JSON.parse(JSON.stringify(descriptor)),descriptor);
    const result=await api.executeIntrospection(node('state'),{state:state()});
    assert.equal(result.ok,true);assert.equal(result.artifact.value.recordType,'actor-state');
});
test('Express accepts an assessment without optional records',async()=>{
    const assessment=makeRecord('reflection',state().value,{behaviorHints:['Keep guarded'],attentionHints:['Notice the apology']}).data;
    const result=await api.executeIntrospection(node('express'),{assessment},{root:true});
    assert.equal(result.ok,true);assert.deepEqual(result.artifact,{kind:'guidance',text:'Keep guarded'});
});
test('all eighteen modes publish portable typed descriptions',()=>{
    const cases={reflect:['character','recall','scene'],internalize:['experience','pattern','recovery'],express:['behavior','attention','inner-voice'],context:['assemble','perspective','focus'],memory:['read','recall','commit'],state:['value','curve','track']};
    let count=0;
    for(const [operation,modes] of Object.entries(cases)) for(const mode of modes){
        const controls=mode==='perspective'?{actorId:'npc-1'}:mode==='commit'?{idempotencyKey:'k'}:{};
        const result=api.describeIntrospection(node(operation,{mode,...controls}),{phase:'post'});
        assert.equal(result.ok,true,`${operation}/${mode}`);assert.deepEqual(JSON.parse(JSON.stringify(result.data)),result.data);count++;
    }
    assert.equal(count,18);
});
test('adapter rejects capability getters without evaluating them and catches pending source edits',async()=>{
    let reads=0;
    const rejected=await api.executeIntrospection(node('state'),{state:state()},{get request(){reads++;return ()=>{};}});
    assert.equal(rejected.ok,false);assert.equal(reads,0);
    const context={kind:'context',messages:[{id:'scene',revision:'r1',role:'user',text:'An apology.'}]};
    const result=await api.executeIntrospection(node('reflect'),{context,state:state()},{request:async()=>{context.messages[0].revision='r2';return {ok:true,data:{text:'{}',finish:'stop'}};}});
    assert.equal(result.ok,false);assert.equal(result.error.code,'STALE_INPUT');
});
test('Memory Recall uses connected Text to retrieve matching scoped episodes instead of its query control',async()=>{
    const {memory}=recallFixture();
    const result=await api.executeIntrospection(node('memory',{mode:'recall',query:'garden'}),{query:{kind:'text',text:'lighthouse'}},{root:true,memory});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value.payload.episodes.map(episode=>episode.id),['lighthouse']);
    assert.deepEqual(result.artifact.value.scope,{chatId:'chat-1',actorId:'npc-1'});
    assert.equal(result.reports.at(-1).requests,0);
});
test('Memory Recall consumes real Draft Text provenance while using only its text as the scoped query',async()=>{
    const draft=createDraftRevision({kind:'draft',text:'Original prose.',source:{originalText:'Original prose.'}},'lighthouse',{nodeId:'prose',scope:'whole'}).data.draft;
    const produced=await executeModelNode({operation:'draft-text'},{draft},{phase:'post'});
    assert.equal(produced.ok,true,JSON.stringify(produced.error));
    const {memory}=recallFixture();
    const result=await api.executeIntrospection(node('memory',{mode:'recall',query:'garden'}),{query:produced.artifact},{root:true,memory});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value.payload.episodes.map(episode=>episode.id),['lighthouse']);
    assert.deepEqual(result.artifact.value.scope,{chatId:'chat-1',actorId:'npc-1'});
    assert.equal(result.reports.at(-1).requests,0);
});
test('Memory Recall without a query input retains the authored control',async()=>{
    const {memory}=recallFixture();
    const result=await api.executeIntrospection(node('memory',{mode:'recall',query:'garden'}),{},{memory});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value.payload.episodes.map(episode=>episode.id),['garden']);
});
test('Memory Recall treats connected empty Text as an explicit empty query',async()=>{
    const {memory}=recallFixture();
    const result=await api.executeIntrospection(node('memory',{mode:'recall',query:'garden'}),{query:{kind:'text',text:''}},{memory});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value.payload.episodes,[]);
});
test('Memory Recall accepts a query at the existing 4096-character control bound',async()=>{
    const {memory}=recallFixture();
    const result=await api.executeIntrospection(node('memory',{mode:'recall'}),{query:{kind:'text',text:'lighthouse'+' '.repeat(4086)}},{memory});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value.payload.episodes.map(episode=>episode.id),['lighthouse']);
});
test('Memory Recall rejects query text longer than the existing control bound before dispatch',async()=>{
    let reads=0;
    const result=await api.executeIntrospection(node('memory',{mode:'recall'}),{query:{kind:'text',text:'x'.repeat(4097)}},{memory:{recall:async()=>{reads++;throw Error('Oversized query reached memory.');}}});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'INVALID_INPUT');
    assert.equal(reads,0);
});
test('Memory Recall rejects a query Text artifact with no text payload',async()=>{
    const {memory}=recallFixture();
    const result=await api.executeIntrospection(node('memory',{mode:'recall'}),{query:{kind:'text'}},{memory});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'INVALID_INPUT');
});
test('Memory Recall rejects query getters without evaluating them or reading memory',async()=>{
    let getters=0,reads=0;
    const result=await api.executeIntrospection(node('memory',{mode:'recall'}),{query:{kind:'text',get text(){getters++;return 'lighthouse';}}},{memory:{recall:async()=>{reads++;throw Error('Accessor query reached memory.');}}});
    assert.equal(result.ok,false);
    assert.equal(getters,0);
    assert.equal(reads,0);
});
test('Memory Recall rejects a query changed while its scoped memory read is pending',async()=>{
    const {initial,material}=recallFixture(),inputs={query:{kind:'text',text:'lighthouse'}};
    const memory=createMemoryService(createInMemoryBackend(initial,async()=>{inputs.query.text='garden';return material;}));
    const result=await api.executeIntrospection(node('memory',{mode:'recall'}),inputs,{memory});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'STALE_INPUT');
    assert.equal(result.artifact,undefined);
});
test('Memory Read does not accept the Recall query input',async()=>{
    let reads=0;
    const result=await api.executeIntrospection(node('memory',{mode:'read'}),{query:{kind:'text',text:'lighthouse'}},{memory:{read:async()=>{reads++;throw Error('Unknown Read input reached memory.');}}});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'INVALID_INPUT');
    assert.equal(reads,0);
});
test('Memory Commit does not accept the Recall query input',async()=>{
    const result=await api.executeIntrospection(node('memory',{mode:'commit',idempotencyKey:'save'}),{proposal:proposal(),query:{kind:'text',text:'lighthouse'}},{phase:'post'});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'INVALID_INPUT');
});
test('Memory Recall rejects malformed disclosure metadata on its Text query before dispatch',async()=>{
    let reads=0;
    const result=await api.executeIntrospection(node('memory',{mode:'recall'}),{query:{kind:'text',text:'lighthouse',visibility:{kind:'actor-private'}}},{memory:{recall:async()=>{reads++;throw Error('Invalid query metadata reached memory.');}}});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'INVALID_INPUT');
    assert.equal(reads,0);
});
test('Memory Recall consumes real Render Notes provenance without treating notes as actor authority',async()=>{
    const data={kind:'data',visibility:{kind:'public'},value:{type:'extracted-records',sourceRefs:[],records:[{id:'light',label:'Lighthouse',text:'lighthouse',classification:'observation',status:'proposed',evidence:[]}]}};
    const produced=await executeModelNode({operation:'render-notes',title:'lighthouse',format:'text'},{data},{phase:'post'});
    assert.equal(produced.ok,true,JSON.stringify(produced.error));
    const {memory}=recallFixture();
    const result=await api.executeIntrospection(node('memory',{mode:'recall',query:'garden'}),{query:produced.artifact},{root:true,memory});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value.payload.episodes.map(episode=>episode.id),['lighthouse']);
    assert.deepEqual(result.artifact.value.scope,{chatId:'chat-1',actorId:'npc-1'});
});
test('Memory Recall rejects getters inside query provenance without evaluating them or reading memory',async()=>{
    let getters=0,reads=0;
    const query={kind:'text',text:'lighthouse',provenance:{get revisionId(){getters++;return 'r1';}}};
    const result=await api.executeIntrospection(node('memory',{mode:'recall'}),{query},{memory:{recall:async()=>{reads++;throw Error('Accessor provenance reached memory.');}}});
    assert.equal(result.ok,false);
    assert.equal(getters,0);
    assert.equal(reads,0);
});
test('Memory Recall rejects query provenance beyond the shared own-JSON bound before reading memory',async()=>{
    let reads=0;
    const query={kind:'text',text:'lighthouse',provenance:{body:'x'.repeat(262144)}};
    const result=await api.executeIntrospection(node('memory',{mode:'recall'}),{query},{memory:{recall:async()=>{reads++;throw Error('Oversized provenance reached memory.');}}});
    assert.equal(result.ok,false);
    assert.equal(reads,0);
});
test('Memory Recall retains provenance in its input fingerprint while a scoped read is pending',async()=>{
    const {initial,material}=recallFixture(),inputs={query:{kind:'text',text:'lighthouse',provenance:{revisionId:'r1'}}};
    const memory=createMemoryService(createInMemoryBackend(initial,async()=>{inputs.query.provenance.revisionId='r2';return material;}));
    const result=await api.executeIntrospection(node('memory',{mode:'recall'}),inputs,{memory});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'STALE_INPUT');
    assert.equal(result.artifact,undefined);
});
test('Memory Recall rejects Data in its Text query input before reading memory',async()=>{
    let reads=0;
    const result=await api.executeIntrospection(node('memory',{mode:'recall'}),{query:{kind:'data',value:'lighthouse'}},{memory:{recall:async()=>{reads++;throw Error('Invalid query reached memory.');}}});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'INVALID_INPUT');
    assert.equal(reads,0);
});
