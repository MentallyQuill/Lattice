import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createChatDocumentCatalog} from '../src/workflow/document-catalog.js';
import {createNativeDocumentHistory,createNativeFileSession} from '../src/workflow/native-settlement.js';
import {createChatDocumentBackend} from '../src/workflow/file-store.js';
import {createNativeWorkflowController} from '../src/workflow/host.js';
import {operationDefaults} from '../src/workflow/catalog.js';
import {applyProgressionEvents} from '../src/workflow/progression.js';
import {actorHostFixture,elias} from './helpers/native-actor-host-fixture.mjs';
const scope={userId:'default-user',chatId:'history-chat'};
test('checkpointed private State retains the present actor scope of its authorized Read File',async()=>{
    const f=actorHostFixture('files'),storageScope={userId:'default-user',chatId:'Story-2'},state={values:[{key:'trust',value:10,subjectId:elias}],ledger:[{eventId:'old',identityKey:'old-reward',eventIdentity:'old-facts',visibility:{kind:'actor-private',actorId:elias}}],visibility:{kind:'actor-private',actorId:elias}};
    f.catalog.define({targetId:'elias-progress',name:'Elias progress',format:'json',content:JSON.stringify(state),visibility:{kind:'actor-private',actorId:elias}});
    f.c.chatMetadata.latticeDocuments={[storageScope.userId]:{'elias-progress':{targetId:'elias-progress',revision:1,format:'json',content:JSON.stringify(state),receipts:[],scope:storageScope}}};
    const backend=createChatDocumentBackend({scope:storageScope,getContext:()=>({...f.c,userId:storageScope.userId}),saveMetadata:async()=>true}),preview=await backend.previewCheckpoint('elias-progress',{kind:'actor-private',actorId:elias});assert.equal((await backend.applyCheckpoint(preview.data.handle)).ok,true);
    for(const id of Object.keys(f.graph.nodes))if((id.startsWith('mara')&&id!=='mara')||(id.startsWith('elias')&&id!=='elias'))delete f.graph.nodes[id];
    for(const [id,wire]of Object.entries(f.graph.wires))if(!f.graph.nodes[wire.from]||!f.graph.nodes[wire.to])delete f.graph.wires[id];
    const node=(id,operation,controls={})=>f.graph.nodes[id]={...operationDefaults(operation,controls),...controls,id,type:'workflow',phase:'post'},wire=(id,from,fromPort,to,toPort)=>f.graph.wires[id]={id,route:'wire',from,fromPort,to,toPort};
    node('read','read-file',{targetId:'elias-progress',actorScope:'presence',actorId:elias});wire('presence','elias','out','read','presence');
    const rules=[{decayId:'recovery',revision:1,targetKey:'trust',subjectId:elias,baseline:0,unitsPerMinute:1,min:0,max:100,initialMinute:0}],clock={schemaVersion:1,clockId:'clock',calendarId:'days',revision:1,dayLengthMinutes:1440,absoluteMinute:1};
    for(const [id,value]of [['rules',rules],['clock',clock]]){node(id+'Text','text',{text:JSON.stringify(value)});node(id,'json-decode');wire(id+'Text',id+'Text','out',id,'in');}
    node('decay','state',{mode:'time-decay'});wire('state','read','value','decay','state');wire('rules','rules','out','decay','rules');wire('clock','clock','out','decay','clock');
    node('encode','format',{format:'json',jsonShape:'single'});wire('encode','decay','out','encode','in');node('save','write-file',{mode:'replace',actorScope:'presence',actorId:elias});wire('savePresence','elias','out','save','presence');wire('reference','read','reference','save','reference');wire('text','encode','text','save','text');
    try{const ready=await f.start();assert.equal(ready.ok,true,JSON.stringify(ready.error));const result=await f.complete();assert.equal(result.ok,true,JSON.stringify(result.error));const applied=await f.controller.apply(result.reviewHandles[0]);assert.equal(applied.ok,true,JSON.stringify(applied.error));const stored=JSON.parse(f.c.chatMetadata.latticeDocuments[storageScope.userId]['elias-progress'].content);assert.equal(stored.values[0].value,9);assert.equal(stored.historyCheckpoint.epoch,1);}finally{f.controller.dispose();}
});
test('a pending checkpoint save holds native file access until acknowledgement',async()=>{
    const context={chatId:scope.chatId,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{notes:{targetId:'notes',revision:1,format:'text',content:'Accepted',receipts:[{intentId:'old',fingerprint:'sha256:'+'a'.repeat(64),revision:1}],scope}}}}};
    const catalog=createChatDocumentCatalog({getContext:()=>context,getUserId:()=>scope.userId});catalog.define({targetId:'notes',name:'Notes',format:'text',visibility:{kind:'public'},content:''});
    let entered,release;const waiting=new Promise(resolve=>entered=resolve),saving=new Promise(resolve=>release=resolve),barriers=new Map(),verifier={saveAndVerify:async()=>{entered();return saving;}};
    const history=createNativeDocumentHistory({catalog,context:()=>context,userId:()=>scope.userId,actorId:()=>null,isBusy:()=>false,barriers,persistenceVerifier:verifier});
    const files=createNativeFileSession({catalog,scope,context:()=>context,userId:()=>scope.userId,barriers,persistenceVerifier:verifier,isCurrent:()=>true,workflowId:'workflow',validateEvidence:()=>({ok:true}),stage:()=>({ok:true})}).data;
    const preview=await history.preview('notes'),pending=history.apply(preview.data.handle);await waiting;
    const read=await files.store.read('notes');assert.equal(read.ok,false);assert.equal(read.error.code,'PERSISTENCE_UNKNOWN');
    release({ok:true,data:{acknowledged:true}});assert.equal((await pending).data.acknowledged,true);assert.equal(barriers.size,0);assert.equal((await files.store.read('notes')).ok,true);
});
test('native State looks up retired authored identities from its authorized Read File value',async()=>{
    const rules={ruleSetId:'xp',revision:1,rules:[{ruleId:'award',eventType:'progress',targetKey:'xp',identityFields:['victim'],mode:'add',amount:5,min:0,max:100}]},event={eventId:'event-1',eventType:'progress',identity:{victim:'enemy'},status:'confirmed',evidence:{origin:'scene'}};
    const prior=applyProgressionEvents({values:[{key:'xp',value:0}],ledger:[]},[event],rules);
    const context={chatId:scope.chatId,characterId:0,groupId:null,characters:[{avatar:'alice.png'}],chat:[{is_user:true,mes:'An objective was completed.'},{is_user:false,mes:'Alice celebrates.',swipe_id:0,swipes:['Alice celebrates.'],extra:{}}],chatMetadata:{latticeDocuments:{[scope.userId]:{xp:{targetId:'xp',revision:1,format:'json',content:JSON.stringify(prior.data.state),receipts:[],scope}}}}};
    const catalog=createChatDocumentCatalog({getContext:()=>context,getUserId:()=>scope.userId});catalog.define({targetId:'xp',name:'Experience',format:'json',content:'{}',visibility:{kind:'public'}});
    const backend=createChatDocumentBackend({scope,getContext:()=>({...context,userId:scope.userId}),saveMetadata:async()=>true});const preview=await backend.previewCheckpoint('xp',{kind:'public'});await backend.applyCheckpoint(preview.data.handle);
    const node=(id,operation,controls={})=>({...operationDefaults(operation,controls),...controls,id,type:'workflow',phase:'post',x:0,y:0});
    const graph={id:'retired-progression',name:'Retired progression',schema:3,runtime:2,mode:'native-unified',roles:{},groups:{},portals:{},definitions:{},nodes:{read:node('read','read-file',{targetId:'xp'}),rulesText:node('rulesText','text',{text:JSON.stringify(rules)}),rules:node('rules','json-decode'),eventsText:node('eventsText','text',{text:JSON.stringify([{...event,eventId:'new-event'}])}),events:node('events','json-decode'),state:node('state','state',{mode:'progression'})},wires:{}};
    for(const [id,from,fromPort,to,toPort]of [['read','read','value','state','state'],['rulesText','rulesText','out','rules','in'],['rules','rules','out','state','rules'],['eventsText','eventsText','out','events','in'],['events','events','out','state','events']])graph.wires[id]={id,route:'wire',from,fromPort,to,toPort};
    const controller=createNativeWorkflowController({context:()=>context,userId:()=>scope.userId,documentCatalog:catalog,isBusy:()=>false});
    const result=await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'state',portId:'out'});assert.equal(result.ok,true,JSON.stringify(result.error));
    const projected=result.recording.artifacts.findLast(entry=>entry.origin.direction==='output'&&entry.value?.kind==='data'&&Array.isArray(entry.value.value?.values))?.value;
    assert.equal(projected.value.values[0].value,5);assert.equal(projected.value.ledger.length,0);assert.equal(result.actualCalls,0);
});

test('authorized native checkpoint previews counts and verifies the installed archive with one save',async()=>{
    const context={chatId:scope.chatId,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{notes:{targetId:'notes',revision:1,format:'text',content:'Accepted notes',receipts:[{intentId:'old',fingerprint:'sha256:'+'a'.repeat(64),revision:1}],scope}}}}};
    const catalog=createChatDocumentCatalog({getContext:()=>context,getUserId:()=>scope.userId});
    catalog.define({targetId:'notes',name:'Notes',format:'text',visibility:{kind:'public'},content:''});
    let saves=0,selection;
    const history=createNativeDocumentHistory({catalog,context:()=>context,userId:()=>scope.userId,actorId:()=>null,isBusy:()=>false,barriers:new Map(),persistenceVerifier:{saveAndVerify:async value=>{saves++;selection=value;return {ok:true,data:{acknowledged:true}};},verify:async()=>({ok:true,data:{acknowledged:true}})}});
    const preview=await history.preview('notes');assert.equal(preview.ok,true,JSON.stringify(preview.error));assert.equal(preview.data.view.name,'Notes');assert.equal(saves,0);
    const result=await history.apply(preview.data.handle);assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.data.acknowledged,true);assert.equal(saves,1);
    assert.equal(selection.kind,'document-checkpoint');assert.equal(selection.pageIds.length,1);
    assert.equal(context.chatMetadata.latticeDocuments[scope.userId].notes.history.epoch,1);
});

test('private archive authority is invalidated when the selected actor changes after preview',async()=>{
    let actor='alice';const pageId='archive:private';
    const context={chatId:scope.chatId,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{notes:{targetId:'notes',revision:2,format:'text',content:'Current',receipts:[{intentId:'new',fingerprint:'sha256:'+'a'.repeat(64),revision:2}],scope,history:{schemaVersion:1,epoch:1,head:pageId}}}},latticeDocumentHistory:{[scope.userId]:{[pageId]:{schemaVersion:1,pageId,targetId:'notes',scope,visibility:{kind:'actor-private',actorId:'alice'},epoch:1,checkpointId:'checkpoint:private',previous:null,kind:'receipts',payload:[]}}}}};
    const catalog=createChatDocumentCatalog({getContext:()=>context,getUserId:()=>scope.userId});catalog.define({targetId:'notes',name:'Notes',format:'text',visibility:{kind:'public'},content:''});
    const history=createNativeDocumentHistory({catalog,context:()=>context,userId:()=>scope.userId,actorId:()=>actor,isBusy:()=>false,barriers:new Map(),persistenceVerifier:{saveAndVerify:async()=>({ok:true,data:{acknowledged:true}})}});
    const preview=await history.preview('notes');assert.equal(preview.ok,true,JSON.stringify(preview.error));actor='bob';
    const result=await history.apply(preview.data.handle);assert.equal(result.ok,false);assert.equal(result.error.code,'STALE_FILE_SCOPE');
    assert.equal(context.chatMetadata.latticeDocuments[scope.userId].notes.revision,2);
});
test('hidden catalog visibility cannot authorize another actor’s private archive',async()=>{
    const pageId='archive:private',context={chatId:scope.chatId,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{notes:{targetId:'notes',revision:2,format:'text',content:'Current',receipts:[{intentId:'new',fingerprint:'sha256:'+'a'.repeat(64),revision:2}],scope,history:{schemaVersion:1,epoch:1,head:pageId}}}},latticeDocumentHistory:{[scope.userId]:{[pageId]:{schemaVersion:1,pageId,targetId:'notes',scope,visibility:{kind:'actor-private',actorId:'alice'},epoch:1,checkpointId:'checkpoint:private',previous:null,kind:'receipts',payload:[]}}}}};
    const catalog=createChatDocumentCatalog({getContext:()=>context,getUserId:()=>scope.userId});catalog.define({targetId:'notes',name:'Notes',format:'text',visibility:{kind:'hidden'},content:''});
    const history=createNativeDocumentHistory({catalog,context:()=>context,userId:()=>scope.userId,actorId:()=> 'bob',isBusy:()=>false,barriers:new Map(),persistenceVerifier:{saveAndVerify:async()=>({ok:true,data:{acknowledged:true}})}});
    assert.equal((await history.preview('notes')).error?.code,'PRIVATE_DESTINATION');assert.equal((await history.inspect('notes')).error?.code,'PRIVATE_DESTINATION');
});

test('unverified checkpoint application holds writes until exact read-only verification',async()=>{
    let saves=0,confirmed=false;const barriers=new Map();
    const context={chatId:scope.chatId,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{notes:{targetId:'notes',revision:1,format:'text',content:'Accepted',receipts:[{intentId:'old',fingerprint:'sha256:'+'a'.repeat(64),revision:1}],scope}}}}};
    const catalog=createChatDocumentCatalog({getContext:()=>context,getUserId:()=>scope.userId});catalog.define({targetId:'notes',name:'Notes',format:'text',visibility:{kind:'public'},content:''});
    const history=createNativeDocumentHistory({catalog,context:()=>context,userId:()=>scope.userId,actorId:()=>null,isBusy:()=>false,barriers,persistenceVerifier:{saveAndVerify:async()=>{saves++;return {ok:true,data:{acknowledged:false}};},verify:async()=>({ok:true,data:{acknowledged:confirmed}})}});
    const preview=await history.preview('notes'),applied=await history.apply(preview.data.handle);assert.equal(applied.ok,true);assert.equal(applied.data.acknowledged,false);assert.equal(barriers.size,1);
    assert.equal((await history.preview('notes')).error.code,'PERSISTENCE_UNKNOWN');assert.equal((await history.inspect('notes')).error.code,'PERSISTENCE_UNKNOWN');assert.equal(saves,1);
    confirmed=true;const inspected=await history.inspect('notes');assert.equal(inspected.ok,true,JSON.stringify(inspected.error));assert.equal(barriers.size,0);assert.equal(saves,1);
});
