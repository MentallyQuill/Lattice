import assert from 'node:assert/strict';
import {test} from 'node:test';
import {lookupDocumentHistory,prepareDocumentCheckpoint} from '../src/workflow/document-history.js';
import {createChatDocumentBackend,createFileStore} from '../src/workflow/file-store.js';
import {applyProgressionEvents,queryProgressionHistory} from '../src/workflow/progression.js';
import {executeProgressionState} from '../src/workflow/operations/progression-nodes.js';
import {selectRandomOutcomes} from '../src/workflow/operations/random-outcomes.js';
import {normalizeOccurrences,confirmOccurrences,resolveItemHolders} from '../src/workflow/operations/event-data.js';
const scope={userId:'default-user',chatId:'history-chat'};
const receipt={intentId:'event-1',fingerprint:'sha256:'+'a'.repeat(64),revision:1};
test('archive validation fails closed on cleared heads, rewound chains, malformed receipts and cycles',async()=>{
    const page={schemaVersion:1,pageId:'archive:one',targetId:'notes',scope,visibility:{kind:'public'},epoch:1,checkpointId:'checkpoint:one',previous:null,kind:'receipts',payload:[receipt]};
    for(const [history,pages] of [
        [{schemaVersion:1,epoch:1,head:null},{}],
        [{schemaVersion:1,epoch:2,head:page.pageId},{[page.pageId]:page}],
        [{schemaVersion:1,epoch:1,head:page.pageId},{[page.pageId]:{...page,previous:page.pageId}}],
        [{schemaVersion:1,epoch:1,head:page.pageId},{}],
        [{schemaVersion:1,epoch:1,head:page.pageId},{[page.pageId]:{...page,scope:{...scope,chatId:'other'}}}],
        [{schemaVersion:1,epoch:1,head:page.pageId},{[page.pageId]:{...page,payload:[{intentId:'old'}]}}],
    ])assert.equal(lookupDocumentHistory({targetId:'notes',scope,history,pages},{}).ok,false);
    const malformed=await prepareDocumentCheckpoint({targetId:'notes',revision:1,format:'text',content:'Notes',receipts:[{intentId:'old'}]},{scope,visibility:{kind:'public'},checkpointId:'checkpoint:bad'});assert.equal(malformed.ok,false);
});

test('linked immutable history retrieves an exact retired receipt',()=>{
    const page={schemaVersion:1,pageId:'archive:one',targetId:'notes',scope,visibility:{kind:'public'},epoch:1,checkpointId:'checkpoint:one',previous:null,kind:'receipts',payload:[receipt]};
    const result=lookupDocumentHistory({targetId:'notes',scope,history:{schemaVersion:1,epoch:1,head:page.pageId},pages:{[page.pageId]:page}},{intentId:'event-1'});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(result.data.receipt,receipt);
    assert.deepEqual(result.data.visibility,{kind:'public'});
});
test('individually bounded public pages remain public across a long history chain',()=>{
    const pages={};let head=null;
    for(let epoch=1;epoch<=200;epoch++){const pageId='archive:'+epoch;pages[pageId]={schemaVersion:1,pageId,targetId:'notes',scope,visibility:{kind:'public'},epoch,checkpointId:'checkpoint:'+epoch,previous:head,kind:'receipts',payload:Array.from({length:128},(_,index)=>({...receipt,intentId:'intent-'+epoch+'-'+index}))};head=pageId;}
    const result=lookupDocumentHistory({targetId:'notes',scope,history:{schemaVersion:1,epoch:200,head},pages},{intentId:'intent-1-0'});assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.data.visibility,{kind:'public'});
});

test('checkpoint retires clock history while preserving accepted time and pending remainder',async()=>{
    const clock={schemaVersion:1,clockId:'clock',calendarId:'days',revision:4,absoluteMinute:1440,dayLengthMinutes:1440,settledTimeEventIds:[],pendingTimeAdvance:{kind:'duration',minutes:30},acceptedTimeAdvances:[{turnId:'turn-1',projectionKey:'state:one',previousClock:{schemaVersion:1,clockId:'clock',calendarId:'days',revision:3,absoluteMinute:1380,dayLengthMinutes:1440}}]};
    const result=await prepareDocumentCheckpoint({targetId:'clock',revision:3,format:'json',content:JSON.stringify(clock),receipts:[receipt]},{scope,visibility:{kind:'public'},checkpointId:'checkpoint:clock'});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    const value=JSON.parse(result.data.content);
    assert.equal(value.absoluteMinute,1440);
    assert.deepEqual(value.pendingTimeAdvance,clock.pendingTimeAdvance);
    assert.deepEqual(value.acceptedTimeAdvances,[]);
    const looked=lookupDocumentHistory({targetId:'clock',scope,history:result.data.history,pages:result.data.pages},{turnId:'turn-1'});
    assert.equal(looked.ok,true);
    assert.deepEqual(looked.data.clockTurn,clock.acceptedTimeAdvances[0]);
});
test('ordinary ledger-named JSON is left intact by a receipt-only checkpoint',async()=>{
    const content=JSON.stringify({ledger:[{description:'An authored notebook entry'}],notes:'Current prose'}),result=await prepareDocumentCheckpoint({targetId:'notes',revision:1,format:'json',content,receipts:[receipt]},{scope,visibility:{kind:'public'},checkpointId:'checkpoint:notes'});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.data.kind,'document');assert.equal(result.data.content,content);assert.equal(result.data.counts.progression,0);assert.equal(result.data.counts.receipts,1);
});
test('checkpoint refuses a foreign preturn clock or malformed progression decay history',async()=>{
    const previousClock={schemaVersion:1,clockId:'other',calendarId:'days',revision:1,absoluteMinute:0,dayLengthMinutes:1440},clock={schemaVersion:1,clockId:'clock',calendarId:'days',revision:2,absoluteMinute:10,dayLengthMinutes:1440,acceptedTimeAdvances:[{turnId:'turn',projectionKey:'state:one',previousClock}]};
    for(const [targetId,value]of [['clock',clock],['xp',{values:[{key:'xp',value:5}],ledger:[],decayTimes:{recovery:-1}}]])assert.equal((await prepareDocumentCheckpoint({targetId,revision:1,format:'json',content:JSON.stringify(value),receipts:[]},{scope,visibility:{kind:'public'},checkpointId:'checkpoint:invalid'})).ok,false);
});

test('checkpoint retires only canonical past consumed clock IDs',async()=>{
    const past='time:'+JSON.stringify(['clock','midnight',1,1440]),future='time:'+JSON.stringify(['clock','later',1,2880]);
    const clock={schemaVersion:1,clockId:'clock',calendarId:'days',revision:1,absoluteMinute:1440,dayLengthMinutes:1440,settledTimeEventIds:[past,future,'authored:opaque']};
    const result=await prepareDocumentCheckpoint({targetId:'clock',revision:1,format:'json',content:JSON.stringify(clock),receipts:[]},{scope,visibility:{kind:'public'},checkpointId:'checkpoint:past'});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.equal(result.data.counts.clockEvents,1);
    assert.deepEqual(JSON.parse(result.data.content).settledTimeEventIds,[future,'authored:opaque']);
});
test('valid long schedule occurrence IDs remain readable after native checkpoint application',async()=>{
    const eventId='time:'+JSON.stringify(['clock','s'.repeat(250),1,1440]),clock={schemaVersion:1,clockId:'clock',calendarId:'days',revision:1,absoluteMinute:1440,dayLengthMinutes:1440,settledTimeEventIds:[eventId]};
    const context={...scope,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{clock:{targetId:'clock',revision:1,format:'json',content:JSON.stringify(clock),receipts:[],scope}}}}};
    const backend=createChatDocumentBackend({scope,getContext:()=>context,saveMetadata:async()=>true}),preview=await backend.previewCheckpoint('clock',{kind:'public'});assert.equal(preview.ok,true,JSON.stringify(preview.error));assert.equal((await backend.applyCheckpoint(preview.data.handle)).ok,true);
    const result=await backend.lookupHistory('clock',{});assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal((await backend.load('clock')).ok,true);
});
test('native history operations reject every malformed archived outcome, even when it is not queried',async()=>{
    const pageId='archive:broken',broken={schemaVersion:1,recordType:'random-outcome',outcomeId:'broken',event:{eventId:'e'},library:{libraryId:'l'},acceptance:'accepted',status:'resolved',draw:{},selection:{},effect:{}};
    const context={...scope,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{outcomes:{targetId:'outcomes',revision:1,format:'json',content:'[]',receipts:[receipt],scope,history:{schemaVersion:1,epoch:1,head:pageId}}}},latticeDocumentHistory:{[scope.userId]:{[pageId]:{schemaVersion:1,pageId,targetId:'outcomes',scope,visibility:{kind:'public'},epoch:1,checkpointId:'checkpoint:broken',previous:null,kind:'outcomes',payload:[broken]}}}}};
    const backend=createChatDocumentBackend({scope,getContext:()=>context,saveMetadata:async()=>true});
    for(const result of [await backend.inspectHistory('outcomes'),await backend.previewCheckpoint('outcomes',{kind:'public'}),await backend.lookupHistory('outcomes',{outcomes:{eventIds:['other'],libraryId:'l',rerollId:null}})])assert.equal(result.ok,false);
});
test('native reads refuse a missing progression marker while retired progression history exists',async()=>{
    const state={values:[{key:'xp',value:5}],ledger:[{eventId:'event',identityKey:'award',eventIdentity:'facts'}]},context={...scope,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{xp:{targetId:'xp',revision:1,format:'json',content:JSON.stringify(state),receipts:[],scope}}}}};
    const backend=createChatDocumentBackend({scope,getContext:()=>context,saveMetadata:async()=>true}),preview=await backend.previewCheckpoint('xp',{kind:'public'});await backend.applyCheckpoint(preview.data.handle);
    const damaged=JSON.parse(context.chatMetadata.latticeDocuments[scope.userId].xp.content);delete damaged.historyCheckpoint;context.chatMetadata.latticeDocuments[scope.userId].xp.content=JSON.stringify(damaged);
    const result=await backend.load('xp');assert.equal(result.ok,false);assert.equal(result.error.code,'DOCUMENT_HISTORY_CHANGED');
});

test('native checkpoint frees save receipt capacity and retains archived intent lookup',async()=>{
    const context={...scope,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{notes:{targetId:'notes',revision:256,format:'text',content:'Current notes',receipts:Array.from({length:256},(_,index)=>({...receipt,intentId:'event-'+index,revision:index+1})),scope}}}}};
    let saves=0;
    const backend=createChatDocumentBackend({scope,getContext:()=>context,saveMetadata:async()=>{saves++;return true;}});
    const preview=await backend.previewCheckpoint('notes',{kind:'public'});
    assert.equal(preview.ok,true,JSON.stringify(preview.error));
    assert.equal(preview.data.view.counts.receipts,256);
    assert.equal(saves,0);
    const applied=await backend.applyCheckpoint(preview.data.handle);
    assert.equal(applied.ok,true,JSON.stringify(applied.error));
    assert.equal(applied.data.acknowledged,true);
    assert.equal(saves,1);
    const loaded=await backend.load('notes');
    assert.equal(loaded.data.content,'Current notes');
    assert.deepEqual(loaded.data.receipts,[]);
    const prior=await backend.lookupHistory('notes',{intentId:'event-1'});
    assert.equal(prior.data.receipt.intentId,'event-1');
    const saved=await backend.compareAndSwap({targetId:'notes',expectedRevision:257,expectedContent:'Current notes',projectedDocument:{format:'text',content:'Next notes'},intentId:'next',fingerprint:'sha256:'+'b'.repeat(64)});
    assert.equal(saved.ok,true,JSON.stringify(saved.error));
    assert.equal(saves,2);
});
test('checkpoint refuses immutable metadata before installing either namespace',async()=>{
    const context={...scope,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{notes:{targetId:'notes',revision:1,format:'text',content:'Notes',receipts:[receipt],scope}}}}};
    Object.defineProperty(context.chatMetadata,'latticeDocuments',{writable:false});
    const backend=createChatDocumentBackend({scope,getContext:()=>context,saveMetadata:async()=>true});const preview=await backend.previewCheckpoint('notes',{kind:'public'});
    const result=await backend.applyCheckpoint(preview.data.handle);assert.equal(result.ok,false);assert.equal(result.error.code,'INVALID_FILE_METADATA');assert.equal(Object.hasOwn(context.chatMetadata,'latticeDocumentHistory'),false);
});
test('mutating installed metadata during save cannot acknowledge a different checkpoint',async()=>{
    const context={...scope,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{notes:{targetId:'notes',revision:1,format:'text',content:'Notes',receipts:[receipt],scope}}}}};
    const backend=createChatDocumentBackend({scope,getContext:()=>context,saveMetadata:async()=>{context.chatMetadata.latticeDocuments[scope.userId].notes.content='Altered during save';return true;}});
    const preview=await backend.previewCheckpoint('notes',{kind:'public'}),result=await backend.applyCheckpoint(preview.data.handle);assert.equal(result.ok,true);assert.equal(result.data.acknowledged,false);
    assert.equal(result.data.checkpointSignature.includes('Altered during save'),false);
});
test('checkpoint acknowledgement and reconciliation signatures cover previously retired history too',async()=>{
    const context={...scope,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{notes:{targetId:'notes',revision:1,format:'text',content:'Notes',receipts:[receipt],scope}}}}};let armed=false,oldPage;
    const backend=createChatDocumentBackend({scope,getContext:()=>context,saveMetadata:async()=>{if(armed){const pages=context.chatMetadata.latticeDocumentHistory[scope.userId];pages[oldPage]={...pages[oldPage],payload:[]};}return true;}});
    let preview=await backend.previewCheckpoint('notes',{kind:'public'});await backend.applyCheckpoint(preview.data.handle);oldPage=context.chatMetadata.latticeDocuments[scope.userId].notes.history.head;
    await backend.compareAndSwap({targetId:'notes',expectedRevision:2,expectedContent:'Notes',projectedDocument:{format:'text',content:'New notes'},intentId:'new',fingerprint:receipt.fingerprint});
    preview=await backend.previewCheckpoint('notes',{kind:'public'});armed=true;const applied=await backend.applyCheckpoint(preview.data.handle);assert.equal(applied.data.acknowledged,false);assert.equal(applied.data.checkpointSignature.includes(receipt.intentId),true);assert.equal(applied.data.pageIds.length,2);
});

test('a checkpoint invalidates a previously captured save handle before cached success',async()=>{
    const context={...scope,chat:[],chatMetadata:{}};
    const backend=createChatDocumentBackend({scope,getContext:()=>context,saveMetadata:async()=>true,initialDocuments:[{targetId:'notes',format:'text',content:'One'}]});
    const store=createFileStore({scope,authorizedTargets:['notes'],...backend,isCurrent:()=>true,validateEvidence:async()=>({ok:true})});
    const read=await store.read('notes'),prepared=await store.prepare(read.data.fileRef,{operation:'replace',content:'Two'},{intentId:'write-one',evidence:[]});
    assert.equal(prepared.ok,true,JSON.stringify(prepared.error));
    assert.equal((await store.commit(prepared.data.handle,{root:true,accepted:true})).ok,true);
    const preview=await backend.previewCheckpoint('notes',{kind:'public'});
    assert.equal((await backend.applyCheckpoint(preview.data.handle)).ok,true);
    const stale=await store.preflight(prepared.data.handle);
    assert.equal(stale.ok,false);
    assert.equal(stale.error.code,'DOCUMENT_HISTORY_CHANGED');
});
test('a fresh capture acknowledges an identical archived intent and refuses changed content',async()=>{
    const context={...scope,chat:[],chatMetadata:{}};let saves=0;
    const backend=createChatDocumentBackend({scope,getContext:()=>context,saveMetadata:async()=>{saves++;return true;},initialDocuments:[{targetId:'notes',format:'text',content:'One'}]});
    const makeStore=()=>createFileStore({scope,authorizedTargets:['notes'],...backend,isCurrent:()=>true,validateEvidence:async()=>({ok:true})});
    let store=makeStore(),read=await store.read('notes'),prepared=await store.prepare(read.data.fileRef,{operation:'replace',content:'Two'},{intentId:'same',evidence:[]});
    assert.equal((await store.commit(prepared.data.handle,{root:true,accepted:true})).ok,true);
    const preview=await backend.previewCheckpoint('notes',{kind:'public'});await backend.applyCheckpoint(preview.data.handle);
    store=makeStore();read=await store.read('notes');prepared=await store.prepare(read.data.fileRef,{operation:'replace',content:'Two'},{intentId:'same',evidence:[]});
    const replay=await store.commit(prepared.data.handle,{root:true,accepted:true});assert.equal(replay.ok,true,JSON.stringify(replay.error));assert.equal(replay.data.applied,false);assert.equal(replay.data.acknowledged,true);assert.equal(saves,2);
    store=makeStore();read=await store.read('notes');prepared=await store.prepare(read.data.fileRef,{operation:'replace',content:'Three'},{intentId:'same',evidence:[]});assert.equal((await store.preflight(prepared.data.handle)).error.code,'FILE_INTENT_CONFLICT');
});
test('an archived append action is acknowledged after later entries without appending twice',async()=>{
    const context={...scope,chat:[],chatMetadata:{}};let saves=0;
    const backend=createChatDocumentBackend({scope,getContext:()=>context,saveMetadata:async()=>{saves++;return true;},initialDocuments:[{targetId:'notes',format:'text',content:'One'}]});
    const makeStore=()=>createFileStore({scope,authorizedTargets:['notes'],...backend,isCurrent:()=>true,validateEvidence:async()=>({ok:true})});
    async function append(intentId,text){const store=makeStore(),read=await store.read('notes'),prepared=await store.prepare(read.data.fileRef,{operation:'append-text',text,separator:'',emptyPolicy:'omit',trailingSeparator:false},{intentId,evidence:[]});assert.equal(prepared.ok,true,JSON.stringify(prepared.error));return store.commit(prepared.data.handle,{root:true,accepted:true});}
    assert.equal((await append('scene-one','\nTwo')).ok,true);assert.equal((await append('scene-two','\nLater')).ok,true);
    const preview=await backend.previewCheckpoint('notes',{kind:'public'});await backend.applyCheckpoint(preview.data.handle);
    const replay=await append('scene-one','\nTwo');assert.equal(replay.ok,true,JSON.stringify(replay.error));assert.equal(replay.data.acknowledged,true);assert.equal(replay.data.applied,false);
    assert.equal((await backend.load('notes')).data.content,'One\nTwo\nLater');assert.equal(saves,3);
});

test('checkpointed progression preserves pacing and arbitrary authored duplicate identities',async()=>{
    const rules={ruleSetId:'xp',revision:1,rules:[{ruleId:'reward',eventType:'progress',targetKey:'xp',identityFields:['victim'],mode:'add',amount:5,min:0,max:100}]};
    const event={eventId:'event-1',eventType:'progress',identity:{victim:'enemy-1'},status:'confirmed',evidence:{origin:'confirmed-scene'}};
    const prior=applyProgressionEvents({values:[{key:'xp',value:0}],ledger:[],cooldowns:{authored:20},repetitions:{authored:2}},[event],rules);
    assert.equal(prior.ok,true,JSON.stringify(prior.error));
    const projected=await prepareDocumentCheckpoint({targetId:'xp',revision:1,format:'json',content:JSON.stringify(prior.data.state),receipts:[]},{scope,visibility:{kind:'public'},checkpointId:'checkpoint:xp'});
    assert.equal(projected.ok,true,JSON.stringify(projected.error));
    const state=JSON.parse(projected.data.content);
    assert.deepEqual(state.cooldowns,prior.data.state.cooldowns);
    assert.deepEqual(state.repetitions,prior.data.state.repetitions);
    const repeat={...event,eventId:'event-2'};
    const query=queryProgressionHistory(state,[repeat],rules);
    assert.equal(query.ok,true,JSON.stringify(query.error));
    const found=lookupDocumentHistory({targetId:'xp',scope,history:projected.data.history,pages:projected.data.pages},{progression:query.data});
    const result=applyProgressionEvents(state,[repeat],rules,{targetId:'xp',epoch:1,...found.data.progression});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.equal(result.data.state.values[0].value,5);
    assert.equal(result.data.ledger.length,0);
});
test('retired progression records retain their own private disclosure and actor authorization',async()=>{
    const state={values:[{key:'xp',value:5}],ledger:[{eventId:'secret-event',identityKey:'secret-reward',eventIdentity:'secret-facts',visibility:{kind:'actor-private',actorId:'alice'}}]};
    const checkpoint=await prepareDocumentCheckpoint({targetId:'xp',revision:1,format:'json',content:JSON.stringify(state),receipts:[]},{scope,visibility:{kind:'hidden'},checkpointId:'checkpoint:private'});
    const found=lookupDocumentHistory({targetId:'xp',scope,history:checkpoint.data.history,pages:checkpoint.data.pages},{progression:{identityKeys:['secret-reward'],eventIds:['secret-event']}});
    assert.deepEqual(found.data.privateActorIds,['alice']);assert.equal(found.data.visibility.kind,'hidden');
});

test('State consumes checked private history ports without adding authoring inputs',()=>{
    const state={values:[{key:'xp',value:0}],ledger:[],historyCheckpoint:{targetId:'xp',epoch:1}};
    const rules={ruleSetId:'xp',revision:1,rules:[{ruleId:'reward',eventType:'progress',targetKey:'xp',identityFields:['victim'],mode:'add',amount:5,min:0,max:100}]};
    const event={eventId:'new',eventType:'progress',identity:{victim:'enemy'},status:'confirmed',evidence:{origin:'scene'}};
    const data=value=>({kind:'data',value});
    const result=executeProgressionState({mode:'progression'},{state:data(state),rules:data(rules),events:data([event])},{progressionHistory:{targetId:'xp',epoch:1,visibility:{kind:'public'},knownIdentityKeys:[],eventIdentities:[]}});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.equal(result.outputs.out.value.values[0].value,5);
});

test('ordinary document replacement cannot remove a checkpointed progression marker',async()=>{
    const state={values:[{key:'xp',value:5}],ledger:[],historyCheckpoint:{targetId:'xp',epoch:1}},history={schemaVersion:1,epoch:1,head:'archive:old'};
    const context={...scope,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{xp:{targetId:'xp',revision:2,format:'json',content:JSON.stringify(state),receipts:[],scope,history}}},latticeDocumentHistory:{[scope.userId]:{'archive:old':{schemaVersion:1,pageId:'archive:old',targetId:'xp',scope,visibility:{kind:'public'},epoch:1,checkpointId:'checkpoint:old',previous:null,kind:'progression',payload:[{eventId:'old',identityKey:'old-award',eventIdentity:'facts'}]}}}}};
    let saves=0;const backend=createChatDocumentBackend({scope,getContext:()=>context,saveMetadata:async()=>{saves++;return true;}});
    const replacement={...state};delete replacement.historyCheckpoint;
    const result=await backend.compareAndSwap({targetId:'xp',expectedRevision:2,expectedContent:JSON.stringify(state),projectedDocument:{format:'json',content:JSON.stringify(replacement)},intentId:'reset',fingerprint:receipt.fingerprint});
    assert.equal(result.ok,false);assert.equal(result.error.code,'DOCUMENT_HISTORY_CHANGED');assert.equal(saves,0);
    assert.deepEqual(JSON.parse(context.chatMetadata.latticeDocuments[scope.userId].xp.content),state);
});

test('checkpointed progression refuses offline execution and conflicting archived event facts',async()=>{
    const rules={ruleSetId:'xp',revision:1,rules:[{ruleId:'reward',eventType:'progress',targetKey:'xp',identityFields:['victim'],mode:'add',amount:5,min:0,max:100}]};
    const event={eventId:'event-1',eventType:'progress',identity:{victim:'enemy-1'},status:'confirmed',evidence:{origin:'scene'}};
    const prior=applyProgressionEvents({values:[{key:'xp',value:0}],ledger:[]},[event],rules);
    const projected=await prepareDocumentCheckpoint({targetId:'xp',revision:1,format:'json',content:JSON.stringify(prior.data.state),receipts:[]},{scope,visibility:{kind:'public'},checkpointId:'checkpoint:xp'});
    const state=JSON.parse(projected.data.content);assert.equal(applyProgressionEvents(state,[],rules).error.code,'HISTORY_LOOKUP_REQUIRED');
    const changed={...event,identity:{victim:'enemy-2'}},query=queryProgressionHistory(state,[changed],rules);
    const found=lookupDocumentHistory({targetId:'xp',scope,history:projected.data.history,pages:projected.data.pages},{progression:query.data});
    assert.equal(applyProgressionEvents(state,[changed],rules,{targetId:'xp',epoch:1,...found.data.progression}).error.code,'EVENT_ID_CONFLICT');
});

test('checkpointed accepted random outcomes remain available by their exact draw identity',async()=>{
    const source={sourceId:'use',revision:'r1',sceneId:'scene',watch:'player-message',text:'Mara uses the wand.',visibility:'public'};
    const normalized=normalizeOccurrences(source,[{eventType:'item-used',actorId:'mara',itemId:'wand',position:{start:0,end:source.text.length},semantics:'actual'}],{actorIds:['mara'],itemIds:['wand']});
    const confirmed=confirmOccurrences(normalized.data.events,[{eventId:normalized.data.events[0].eventId,accepted:true}]);
    const event=resolveItemHolders({wand:'mara'},confirmed.data.events).data.events[0];
    const library={libraryId:'wand-effects',revision:'1',itemId:'wand',effects:[{id:'sparks',kind:'fixed',weight:1,description:'Violet sparks.'}]};
    const selected=await selectRandomOutcomes([event],library,[],{random:()=>0});assert.equal(selected.ok,true,JSON.stringify(selected.error));
    const outcome={...selected.data.outcomes[0],acceptance:'accepted'};
    const checkpoint=await prepareDocumentCheckpoint({targetId:'outcomes',revision:1,format:'json',content:JSON.stringify([outcome]),receipts:[]},{scope,visibility:{kind:'public'},checkpointId:'checkpoint:outcomes'});
    assert.equal(checkpoint.ok,true,JSON.stringify(checkpoint.error));
    const found=lookupDocumentHistory({targetId:'outcomes',scope,history:checkpoint.data.history,pages:checkpoint.data.pages},{outcomes:{eventIds:[event.eventId],libraryId:'wand-effects',rerollId:null}});
    assert.deepEqual(found.data.outcomes?.map(value=>value.outcomeId),[outcome.outcomeId]);
    const replay=await selectRandomOutcomes([event],library,found.data.outcomes,{random:()=>{throw Error('must not draw again');}});
    assert.equal(replay.ok,true,JSON.stringify(replay.error));assert.equal(replay.data.draws,0);
});
