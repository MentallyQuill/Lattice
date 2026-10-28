import assert from 'node:assert/strict';
import test from 'node:test';
import {createNativeFileSession} from '../src/workflow/native-settlement.js?v=0.29.1';
import {executeFileNode} from '../src/workflow/operations/file-nodes.js?v=0.29.1';
import {operationDefaults} from '../src/workflow/catalog.js?v=0.29.1';
const target={targetId:'notes',bindingId:'handle-notes',name:'notes.txt',format:'text',missing:'create',content:'',visibility:{kind:'public'}};
function fixture(){
 let stored={targetId:'notes',revision:'disk:1',format:'text',content:'Before',receipts:[]},writes=0,prepared;
 const backend={load:async()=>({ok:true,data:structuredClone(stored)}),lookupHistory:async()=>({ok:true,data:{visibility:{kind:'public'},privateActorIds:[],outcomes:[],clockTurn:null}}),compareAndSwap:async update=>{if(stored.revision!==update.expectedRevision||stored.content!==update.expectedContent)return {ok:false,error:{code:'FILE_REVISION_CONFLICT',message:'Changed'}};writes++;stored={...stored,...update.projectedDocument,revision:'disk:2',receipts:[{intentId:update.intentId,fingerprint:update.fingerprint,revision:'disk:2'}]};return {ok:true,data:{applied:true,acknowledged:true,revision:'disk:2'}};}};
 const captured=createNativeFileSession({catalog:{capture:()=>({ok:true,data:{scope:{userId:'u',chatId:'c'},documents:[],isCurrent:()=>true}})},nodeFileDefinitions:[target],diskBackend:backend,scope:{userId:'u',chatId:'c'},context:()=>({chat:[],chatId:'c',chatMetadata:{}}),userId:()=> 'u',persistenceVerifier:{saveAndVerify:async()=>{throw Error('Disk writes must not save legacy metadata');}},isCurrent:()=>true,workflowId:'workflow',originalDraft:{source:{messageIndex:0,swipeId:0,originalText:'After'}},validateEvidence:async()=>({ok:true}),stage:()=>({ok:true})});
 assert.equal(captured.ok,true,JSON.stringify(captured));const session=captured.data;
 const local={phase:'post',root:true,files:session.store,fileVisibility:({reference})=>session.visibility(reference.targetId),authorizeFileWrite:({reference})=>{const mark=session.visibility(reference.targetId);return mark.ok?{ok:true,data:{destinationVisibility:mark.data}}:mark;},createIntentId:session.intentId,stageFileIntent:value=>{prepared=value;return session.stage(value,[]);}};
 return {session,local,prepared:()=>prepared,writes:()=>writes,stored:()=>stored,external:()=>stored={...stored,revision:'disk:external',content:'External'}};
}
test('disk native session stages through Read File and persists once after accepted Apply',async()=>{
 const f=fixture();const staged=await executeFileNode({id:'write',type:'workflow',...operationDefaults('write-file'),destinationMode:'own',targetId:'notes',fileTarget:Object.fromEntries(Object.entries(target).filter(([key])=>key!=='targetId'))},{text:{kind:'text',text:'After'}},f.local);
 assert.equal(staged.ok,true,JSON.stringify(staged));assert.equal(f.writes(),0);assert.equal(f.stored().content,'Before');
 assert.equal((await f.session.store.commit(f.prepared().handle,{root:true,accepted:true})).ok,true);assert.equal(f.stored().content,'Before\nAfter');assert.equal(f.writes(),1);
 assert.equal((await f.session.store.commit(f.prepared().handle,{root:true,accepted:true})).ok,true);assert.equal(f.writes(),1);
});
import {unifiedRecipeHost} from './helpers/unified-recipe-host.mjs';
import {nativeFixture} from './helpers/native-workflow-fixture.mjs';
function graphForFile(fileTarget={}){
 const nodes={send:{id:'send',type:'workflow',operation:'on-send'},generate:{id:'generate',type:'workflow',operation:'generate-reply'},review:{id:'review',type:'workflow',operation:'review-publish'},body:{id:'body',type:'workflow',operation:'draft-text'},write:{id:'write',type:'workflow',...operationDefaults('write-file'),destinationMode:'own',targetId:'notes',fileTarget}};
 const connect=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});
 return {id:'disk-workflow',name:'Disk workflow',schema:3,runtime:2,mode:'native-unified',nodes,wires:{a:connect('a','send','activation','generate','activation'),b:connect('b','generate','draft','review','draft'),c:connect('c','generate','draft','body','draft'),d:connect('d','body','out','write','text')},portals:{},definitions:{},runTargets:[{instancePath:[],nodeId:'review'},{instancePath:[],nodeId:'write'}]};
}
test('host rejects an unconfigured external input before allowing native generation or paid requests',async()=>{
 const graph=graphForFile();
 graph.nodes.customReadFile={id:'customReadFile',type:'workflow',...operationDefaults('read-file'),targetId:'external-notes',fileTarget:{}};
 Object.assign(graph.nodes.write,{destinationMode:'connected',targetId:'',fileTarget:{}});
 graph.wires.reference={id:'reference',route:'wire',from:'customReadFile',fromPort:'reference',to:'write',toPort:'reference'};
 const f=unifiedRecipeHost(graph,{request:async()=>{throw Error('No paid requests');}});
 try{const result=await f.generate('After');assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_SETUP_REQUIRED');assert.equal(f.calls(),0);assert.equal(f.c.chat.length,1);assert.equal(f.saves(),0);}finally{f.controller.dispose();}
});
import {createNodeFileAccess} from '../src/ui/node-file-access.js?v=0.29.1';
import {createNodeFileService} from '../src/ui/node-file-service.js?v=0.29.1';
import {createServerFileAccess} from '../src/ui/server-file-access.js?v=0.29.1';
async function nativeDisk(content='Before',format='text',mode='open'){
 const state={content,writes:0,permission:'granted'};
 const handle={kind:'file',name:'notes.txt',isSameEntry:async other=>other===handle,queryPermission:async()=>state.permission,getFile:async()=>{const text=state.content;return {name:'notes.txt',size:text.length,lastModified:1,text:async()=>text};},createWritable:async()=>{state.writes++;let next;return {write:async text=>{next=text;},close:async()=>{state.content=next;},abort:async()=>{}};}};
 let saved={bindings:[],records:{}};const persistence={load:async()=>saved,save:async value=>{saved={bindings:value.bindings.map(item=>({...item})),records:structuredClone(value.records)};}};
 const access=createNodeFileAccess({persistence,showOpenFilePicker:async()=>[handle],showSaveFilePicker:async()=>handle});const chosen=await access.choose({mode,name:'notes.txt',format});assert.equal(chosen.ok,true,JSON.stringify(chosen));
 return {access,state,persistence,fileTarget:{bindingId:chosen.data.bindingId,name:'notes.txt',format,missing:'error',content:'',visibility:{kind:'public'}}};
}

test('legacy browser files still run when the optional server component is absent',async()=>{
 const disk=await nativeDisk(),server=createServerFileAccess({getContext:()=>({}),getUserId:()=> 'default-user',fetch:async()=>({status:404,ok:false})});
 assert.equal((await server.ready).ok,false);
 const access=createNodeFileService({server,native:disk.access}),f=unifiedRecipeHost(graphForFile(disk.fileTarget),{ports:{nodeFileAccess:access},request:async()=>{throw Error('No requests');}});
 try{const result=await f.generate('After');assert.equal(result.ok,true,JSON.stringify(result));assert.equal(disk.state.writes,0);const applied=await f.controller.apply(result.reviewHandles[0]);assert.equal(applied.ok,true,JSON.stringify(applied));assert.equal(disk.state.writes,1);}finally{f.controller.dispose();}
});
test('native handle remains untouched through preview and rejected review; accepted Apply writes once',async()=>{
 const disk=await nativeDisk(),f=unifiedRecipeHost(graphForFile(disk.fileTarget),{ports:{nodeFileAccess:disk.access},request:async()=>{throw Error('No requests');}});
 try{const result=await f.generate('After');assert.equal(result.ok,true,JSON.stringify(result));assert.equal(disk.state.content,'Before');assert.equal(disk.state.writes,0);const applied=await f.controller.apply(result.reviewHandles[0]);assert.equal(applied.ok,true,JSON.stringify(applied));assert.equal(disk.state.content,'Before\nAfter');assert.equal(disk.state.writes,1);assert.equal(f.c.chatMetadata.latticeDocuments,undefined);assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(disk.state.writes,1);}finally{f.controller.dispose();}
 const rejectedDisk=await nativeDisk(),rejected=unifiedRecipeHost(graphForFile(rejectedDisk.fileTarget),{ports:{nodeFileAccess:rejectedDisk.access},request:async()=>{throw Error('No requests');}});
 try{const result=await rejected.generate('After');assert.equal(result.ok,true,JSON.stringify(result));assert.equal(rejected.controller.reject(result.reviewHandles[0]).ok,true);assert.equal(rejectedDisk.state.content,'Before');assert.equal(rejectedDisk.state.writes,0);}finally{rejected.controller.dispose();}
});
test('external disk edits after preview prevent publication and every file write',async()=>{
 const disk=await nativeDisk(),f=unifiedRecipeHost(graphForFile(disk.fileTarget),{ports:{nodeFileAccess:disk.access},request:async()=>{throw Error('No requests');}});
 try{const result=await f.generate('After');assert.equal(result.ok,true,JSON.stringify(result));disk.state.content='External';const applied=await f.controller.apply(result.reviewHandles[0]);assert.equal(applied.ok,false);assert.equal(applied.error.code,'FILE_REVISION_CONFLICT');assert.equal(disk.state.content,'External');assert.equal(disk.state.writes,0);assert.equal(f.c.chat[1].swipes.length,1);}finally{f.controller.dispose();}
});
test('external disk edits during guidance tokenization block native generation before release',async()=>{
 const disk=await nativeDisk(),graph=graphForFile(disk.fileTarget);let generating=false,entered,release,calls=0,aborts=0;
 graph.nodes.guide={id:'guide',type:'workflow',operation:'compose',outputKind:'guidance',sections:[{name:'Style',text:'Use vivid prose.'}]};
 graph.wires.guidance={id:'guidance',route:'wire',from:'guide',fromPort:'out',to:'generate',toPort:'guidance'};
 const tokenizing=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 let f;const catalog=createChatDocumentCatalog({getContext:()=>f.c,getUserId:()=> 'default-user'});
 f=nativeFixture(graph,{ports:{documentCatalog:catalog,nodeFileAccess:disk.access,countTokens:async()=>{if(generating){entered();await gate;}return {tokens:1};}},onEvent:event=>{if(event.type==='node-phase'&&event.address.nodeId==='generate'&&event.phase==='executing')generating=true;},request:async()=>{calls++;throw Error('No paid requests');}});
 try{
  f.c.chatMetadata={};f.c.chat.pop();await f.c.eventSource.emit('GENERATION_STARTED','normal',{},false);
  const pending=f.controller.beforeGenerate([...f.c.chat],8192,()=>{aborts++;},'normal');
  await Promise.race([tokenizing,pending.then(result=>assert.fail('Native preparation settled before tokenization: '+JSON.stringify(result)))]);disk.state.content='Externally changed';release();const result=await pending;
  assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_REVISION_CONFLICT');assert.equal(aborts,1);
  assert.equal(calls,0);assert.equal(disk.state.writes,0);assert.equal(disk.state.content,'Externally changed');assert.equal(f.c.chat.length,1);
 }finally{release();f.controller.dispose();}
});
test('external disk edits after preparation stop the awaited native settings hook before payload changes',async()=>{
 const disk=await nativeDisk(),graph=graphForFile(disk.fileTarget);graph.nodes.generate.reasoningEffort='high';let stops=0,aborts=0;
 const f=unifiedRecipeHost(graph,{ports:{nodeFileAccess:disk.access,getFailurePolicy:()=> 'stop',stopGeneration:()=>f.c.stopGeneration()},configureContext:c=>{
  Object.assign(c,{mainApi:'openai',chatCompletionSettings:{chat_completion_source:'openai',openai_model:'gpt-5.1'},getChatCompletionModel:settings=>settings.openai_model});
  c.eventTypes.CHAT_COMPLETION_SETTINGS_READY='CHAT_COMPLETION_SETTINGS_READY';c.stopGeneration=()=>{stops++;void c.eventSource.emit('GENERATION_STOPPED');};
 },request:async()=>{throw Error('No paid requests');}});
 try{
  await f.c.eventSource.emit('GENERATION_STARTED','normal',{},false);
  const ready=await f.controller.beforeGenerate([...f.c.chat],8192,()=>{aborts++;},'normal');assert.equal(ready.ok,true,JSON.stringify(ready.error));
  disk.state.content='Externally changed';const payload={type:'normal',chat_completion_source:'openai',model:'gpt-5.1',reasoning_effort:'low'};
  await f.c.eventSource.emit('CHAT_COMPLETION_SETTINGS_READY',payload);
  for(let count=0;count<20&&!f.results.length;count++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(payload.reasoning_effort,'low');assert.equal(stops,1);assert.equal(aborts,1);
  assert.equal(f.results.at(-1)?.error?.code,'FILE_REVISION_CONFLICT');assert.equal(f.results.at(-1)?.failureDisposition,'stopped');
  assert.equal(f.calls(),0);assert.equal(disk.state.writes,0);assert.equal(f.c.chat.length,1);
 }finally{f.controller.dispose();}
});
test('revoked local access blocks native generation even for a post-phase destination',async()=>{
 const disk=await nativeDisk();disk.state.permission='denied';const f=unifiedRecipeHost(graphForFile(disk.fileTarget),{ports:{nodeFileAccess:disk.access},request:async()=>{throw Error('No requests');}});
 try{const result=await f.generate('After');assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_PERMISSION');assert.equal(f.c.chat.length,1);assert.equal(f.calls(),0);assert.equal(disk.state.writes,0);}finally{f.controller.dispose();}
});
test('disk routing preserves saved legacy content and starts from the selected file bytes',async()=>{
 const disk=await nativeDisk('Selected disk bytes'),f=unifiedRecipeHost(graphForFile(disk.fileTarget),{ports:{nodeFileAccess:disk.access},documents:[{targetId:'notes',name:'Legacy notes',format:'text',content:'Legacy template',visibility:{kind:'public'}}],configureContext:c=>{c.chatMetadata.latticeDocuments={'default-user':{notes:{targetId:'notes',scope:{userId:'default-user',chatId:'Story-2'},revision:7,format:'text',content:'Saved legacy bytes',receipts:[]}}};},request:async()=>{throw Error('No requests');}});
 try{const result=await f.generate('After');assert.equal(result.ok,true,JSON.stringify(result));assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(disk.state.content,'Selected disk bytes\nAfter');assert.equal(f.c.chatMetadata.latticeDocuments['default-user'].notes.content,'Saved legacy bytes');}finally{f.controller.dispose();}
});
test('Clock Commit inherits its captured disk destination with a distinct logical clock identity',async()=>{
 const clock={schemaVersion:1,clockId:'logical-clock',calendarId:'days',revision:1,dayLengthMinutes:1440,absoluteMinute:0,settledTimeEventIds:[]};const disk=await nativeDisk(JSON.stringify(clock),'json');
 const graph=graphForFile();delete graph.nodes.body;delete graph.nodes.write;delete graph.wires.c;delete graph.wires.d;graph.runTargets=graph.runTargets.filter(value=>value.nodeId!=='write');
 const add=(id,operation,settings={})=>graph.nodes[id]={id,type:'workflow',...operationDefaults(operation),...settings};const wire=(id,from,fromPort,to,toPort)=>graph.wires[id]={id,route:'wire',from,fromPort,to,toPort};
 add('clock','story-clock',{clockId:'logical-clock',fileTarget:disk.fileTarget});add('duration','text',{text:'{"kind":"duration","minutes":60}'});add('proposal','json-decode');add('advance','advance-time');add('commit','commit-clock');wire('parse','duration','out','proposal','in');wire('clock','clock','out','advance','clock');wire('proposal','proposal','out','advance','proposal');wire('commit','advance','report','commit','projection');graph.runTargets.push({instancePath:[],nodeId:'commit'});
 const f=unifiedRecipeHost(graph,{ports:{nodeFileAccess:disk.access},request:async()=>{throw Error('No requests');}});
 try{const result=await f.generate('After');assert.equal(result.ok,true,JSON.stringify(result));assert.equal(disk.state.writes,0);assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);const saved=JSON.parse(disk.state.content);assert.equal(saved.clockId,'logical-clock');assert.equal(saved.absoluteMinute,60);assert.equal(saved.revision,2);assert.equal(disk.state.writes,1);assert.equal(f.c.chatMetadata.latticeDocuments,undefined);}finally{f.controller.dispose();}
});
import {normalizeOccurrences,confirmOccurrences,resolveItemHolders} from '../src/workflow/operations/event-data.js?v=0.29.1';
test('Random Pick and Outcome Commit share one configured disk ledger in the story session',async()=>{
 const playerText='Mara uses her wand.',source={sourceId:'player',revision:'1',sceneId:'Story-2',watch:'player-message',text:playerText,visibility:'public'};
 const candidates=normalizeOccurrences(source,[{eventType:'item-used',actorId:'mara',itemId:'wand',position:{start:0,end:playerText.length},semantics:'actual'}],{actorIds:['mara'],itemIds:['wand']});assert.equal(candidates.ok,true,JSON.stringify(candidates));
 const events=resolveItemHolders({wand:'mara'},confirmOccurrences(candidates.data.events,[{eventId:candidates.data.events[0].eventId,accepted:true}]).data.events).data.events;
 const disk=await nativeDisk('[]','json'),graph=graphForFile();delete graph.nodes.body;delete graph.nodes.write;delete graph.wires.c;delete graph.wires.d;graph.runTargets=graph.runTargets.filter(value=>value.nodeId!=='write');
 const add=(id,operation,settings={})=>graph.nodes[id]={id,type:'workflow',...operationDefaults(operation),...settings};const wire=(id,from,fromPort,to,toPort)=>graph.wires[id]={id,route:'wire',from,fromPort,to,toPort};const data=(id,value)=>{add(id+'Text','text',{text:JSON.stringify(value)});add(id,'json-decode');wire(id+'Parse',id+'Text','out',id,'in');};
 data('events',events);data('library',{libraryId:'wand',revision:'1',itemId:'wand',effects:[{id:'sparks',kind:'fixed',weight:1,description:'Blue sparks appear.'}]});add('pick','random-pick',{ledgerId:'logical-outcomes',fileTarget:disk.fileTarget});add('commit','commit-outcomes',{targetId:'logical-outcomes',fileTarget:disk.fileTarget});wire('events','events','out','pick','events');wire('library','library','out','pick','library');wire('outcomes','pick','out','commit','outcomes');graph.runTargets.push({instancePath:[],nodeId:'commit'});
 let draws=0;const f=unifiedRecipeHost(graph,{playerText,random:()=>{draws++;return .4;},ports:{nodeFileAccess:disk.access},request:async()=>{throw Error('No requests');}});
 try{const result=await f.generate('Blue sparks appear.');assert.equal(result.ok,true,JSON.stringify(result));assert.equal(draws,1);assert.equal(disk.state.writes,0);const applied=await f.controller.apply(result.reviewHandles[0]);assert.equal(applied.ok,true,JSON.stringify(applied));const ledger=JSON.parse(disk.state.content);assert.equal(ledger.length,1);assert.equal(ledger[0].acceptance,'accepted');assert.equal(ledger[0].effect.description,'Blue sparks appear.');assert.equal(disk.state.writes,1);assert.equal(f.c.chatMetadata.latticeDocuments,undefined);}finally{f.controller.dispose();}
});
test('explicit save selection initializes empty JSON from its template only after accepted Apply',async()=>{
 const disk=await nativeDisk('','json','save');Object.assign(disk.fileTarget,{missing:'create',content:'[]'});const graph=graphForFile(disk.fileTarget);graph.nodes.write.mode='replace';const f=unifiedRecipeHost(graph,{ports:{nodeFileAccess:disk.access},request:async()=>{throw Error('No requests');}});
 try{const result=await f.generate('{"item":"one"}');assert.equal(result.ok,true,JSON.stringify(result));assert.equal(disk.state.content,'');assert.equal(disk.state.writes,0);const applied=await f.controller.apply(result.reviewHandles[0]);assert.equal(applied.ok,true,JSON.stringify(applied));assert.deepEqual(JSON.parse(disk.state.content),{item:'one'});assert.equal(disk.state.writes,1);}finally{f.controller.dispose();}
});
import {createChatDocumentBackend} from '../src/workflow/file-store.js?v=0.29.1';
import {createChatDocumentCatalog} from '../src/workflow/document-catalog.js?v=0.29.1';
import {applyProgressionEvents} from '../src/workflow/progression.js?v=0.29.1';
async function checkpointedProgression(){
 const scope={userId:'default-user',chatId:'Story-2'},rules={ruleSetId:'xp',revision:1,rules:[{ruleId:'award',eventType:'progress',targetKey:'xp',identityFields:['victim'],mode:'add',amount:5,min:0,max:100}]},event={eventId:'event-1',eventType:'progress',identity:{victim:'enemy'},status:'confirmed',evidence:{origin:'scene'}};
 const awarded=applyProgressionEvents({values:[{key:'xp',value:0}],ledger:[]},[event],rules);assert.equal(awarded.ok,true,JSON.stringify(awarded));
 const context={chatId:scope.chatId,chat:[],chatMetadata:{latticeDocuments:{[scope.userId]:{xp:{targetId:'xp',scope,revision:1,format:'json',content:JSON.stringify(awarded.data.state),receipts:[{intentId:'old-intent',fingerprint:'sha256:'+'a'.repeat(64),revision:1}]}}}}};
 const catalog=createChatDocumentCatalog({getContext:()=>context,getUserId:()=>scope.userId});assert.equal(catalog.define({targetId:'xp',name:'Experience',format:'json',content:'{}',visibility:{kind:'public'}}).ok,true);
 const backend=createChatDocumentBackend({scope,getContext:()=>({...context,userId:scope.userId}),saveMetadata:async()=>true}),preview=await backend.previewCheckpoint('xp',{kind:'public'});assert.equal(preview.ok,true,JSON.stringify(preview));assert.equal((await backend.applyCheckpoint(preview.data.handle)).ok,true);
 return {scope,rules,event,context,catalog,stored:context.chatMetadata.latticeDocuments[scope.userId].xp};
}
test('migrating a checkpointed disk State retains its retired progression identities',async()=>{
 const legacy=await checkpointedProgression(),disk=await nativeDisk(legacy.stored.content,'json');
 const node=(id,operation,settings={})=>({id,type:'workflow',...operationDefaults(operation),...settings,phase:'post'}),graph={id:'migrated-state',name:'Migrated state',schema:3,runtime:2,mode:'native-unified',nodes:{read:node('read','read-file',{targetId:'xp',fileTarget:disk.fileTarget}),rulesText:node('rulesText','text',{text:JSON.stringify(legacy.rules)}),rules:node('rules','json-decode'),eventsText:node('eventsText','text',{text:JSON.stringify([{...legacy.event,eventId:'new-event'}])}),events:node('events','json-decode'),state:node('state','state',{mode:'progression'})},wires:{},portals:{},definitions:{}};
 for(const [id,from,fromPort,to,toPort]of [['read','read','value','state','state'],['rulesText','rulesText','out','rules','in'],['rules','rules','out','state','rules'],['eventsText','eventsText','out','events','in'],['events','events','out','state','events']])graph.wires[id]={id,route:'wire',from,fromPort,to,toPort};
 const f=unifiedRecipeHost(graph,{ports:{nodeFileAccess:disk.access},documents:[{targetId:'xp',name:'Experience',format:'json',content:'{}',visibility:{kind:'public'}}],configureContext:c=>{c.chatMetadata=legacy.context.chatMetadata;},request:async()=>{throw Error('No requests');}});
 try{const result=await f.controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'state',portId:'out'});assert.equal(result.ok,true,JSON.stringify(result.error));const state=result.recording.artifacts.findLast(entry=>entry.origin.direction==='output'&&Array.isArray(entry.value?.value?.values))?.value.value;assert.equal(state.values[0].value,5);assert.equal(state.ledger.length,0);assert.equal(state.historyCheckpoint.epoch,1);assert.equal(disk.state.writes,0);}finally{f.controller.dispose();}
});
function capturedDiskSession(disk,{targetId='notes',catalog,context,scope={userId:'default-user',chatId:'Story-2'},barriers=new Map()}={}){
 const nativeContext=context??{chat:[],chatId:scope.chatId,chatMetadata:{}},nativeCatalog=catalog??{capture:()=>({ok:true,data:{scope,documents:[],isCurrent:()=>true}})},definition={targetId,...disk.fileTarget};
 const captured=createNativeFileSession({catalog:nativeCatalog,nodeFileDefinitions:[definition],diskBackend:disk.access.backend([definition],{scope,isCurrent:()=>true}),scope,context:()=>nativeContext,userId:()=>scope.userId,persistenceVerifier:{saveAndVerify:async()=>{throw Error('No legacy mutation');}},isCurrent:()=>true,barriers,workflowId:'migration-test',originalDraft:{source:{messageIndex:0,swipeId:0,originalText:'Accepted'}},validateEvidence:async()=>({ok:true}),stage:()=>({ok:true})});assert.equal(captured.ok,true,JSON.stringify(captured));return captured.data;
}
test('a fresh native disk session clears an uncertain-save barrier only after durable receipt recovery',async()=>{
 const disk=await nativeDisk(),barriers=new Map(),save=disk.persistence.save;let failReceipt=true;
 disk.persistence.save=async value=>{if(failReceipt&&Object.values(value.records).some(row=>!row.pending&&row.receipts?.length)){failReceipt=false;throw Error('Receipt save interrupted');}await save(value);};
 const first=capturedDiskSession(disk,{barriers}),read=await first.store.read('notes');assert.equal(read.ok,true,JSON.stringify(read));const prepared=await first.store.prepare(read.data.fileRef,{operation:'append-text',text:'Accepted',separator:'\n',emptyPolicy:'omit',trailingSeparator:false},{intentId:'recovered-intent',evidence:[]});assert.equal(prepared.ok,true,JSON.stringify(prepared));const committed=await first.store.commit(prepared.data.handle,{root:true,accepted:true});assert.equal(committed.ok,true,JSON.stringify(committed));assert.equal(committed.data.status,'save-unverified');assert.equal(barriers.size,1);assert.equal(disk.state.writes,1);first.release();
 const fresh=capturedDiskSession(disk,{barriers}),recovered=await fresh.store.read('notes');assert.equal(recovered.ok,true,JSON.stringify(recovered));assert.equal(recovered.data.snapshot.content,'Before\nAccepted');assert.equal(barriers.size,0);assert.equal(disk.state.writes,1);fresh.release();
});
test('migrated disk metadata preserves archived intents through later writes and reload',async()=>{
 const legacy=await checkpointedProgression(),disk=await nativeDisk(legacy.stored.content,'json'),session=capturedDiskSession(disk,{...legacy,targetId:'xp'});
 const archived=await session.lookupHistory('xp',{intentId:'old-intent'});assert.equal(archived.ok,true,JSON.stringify(archived));assert.equal(archived.data.epoch,1);assert.equal(archived.data.receipt.intentId,'old-intent');
 const read=await session.store.read('xp');assert.equal(read.ok,true,JSON.stringify(read));const duplicate=await session.store.prepare(read.data.fileRef,{operation:'replace',content:legacy.stored.content},{intentId:'old-intent',evidence:[]});assert.equal(duplicate.ok,true,JSON.stringify(duplicate));assert.equal((await session.store.preflight(duplicate.data.handle)).error.code,'FILE_INTENT_CONFLICT');assert.equal(disk.state.writes,0);
 const changed={...JSON.parse(legacy.stored.content),note:'A reviewed update'},prepared=await session.store.prepare(read.data.fileRef,{operation:'replace',content:JSON.stringify(changed)},{intentId:'new-intent',evidence:[]});assert.equal(prepared.ok,true,JSON.stringify(prepared));const committed=await session.store.commit(prepared.data.handle,{root:true,accepted:true});assert.equal(committed.ok,true,JSON.stringify(committed));assert.equal(disk.state.writes,1);session.release();
 const restored={...disk,access:createNodeFileAccess({persistence:disk.persistence})};await restored.access.ready;const fresh=capturedDiskSession(restored,{...legacy,targetId:'xp'}),retained=await fresh.lookupHistory('xp',{intentId:'old-intent'});assert.equal(retained.ok,true,JSON.stringify(retained));assert.equal(retained.data.epoch,1);assert.equal(retained.data.receipt.intentId,'old-intent');assert.equal(JSON.parse((await fresh.store.read('xp')).data.snapshot.content).note,'A reviewed update');assert.equal(disk.state.writes,1);fresh.release();
});
test('an unrelated disk file sharing a logical target never inherits old archive authority',async()=>{
 const legacy=await checkpointedProgression(),disk=await nativeDisk('{"unrelated":true}','json'),session=capturedDiskSession(disk,{...legacy,targetId:'xp'});
 const history=await session.lookupHistory('xp',{intentId:'old-intent'});assert.equal(history.ok,true,JSON.stringify(history));assert.equal(history.data.epoch,0);assert.equal(history.data.receipt,undefined);assert.deepEqual(JSON.parse((await session.store.read('xp')).data.snapshot.content),{unrelated:true});assert.equal(disk.state.writes,0);session.release();
});
test('a fresh native session preserves its barrier when pending bytes diverge from both reviewed versions',async()=>{
 const disk=await nativeDisk(),barriers=new Map(),save=disk.persistence.save;let failReceipt=true;
 disk.persistence.save=async value=>{if(failReceipt&&Object.values(value.records).some(row=>!row.pending&&row.receipts?.length)){failReceipt=false;throw Error('Receipt save interrupted');}await save(value);};
 const first=capturedDiskSession(disk,{barriers}),read=await first.store.read('notes'),prepared=await first.store.prepare(read.data.fileRef,{operation:'replace',content:'Accepted'},{intentId:'diverged-intent',evidence:[]});assert.equal(prepared.ok,true,JSON.stringify(prepared));const committed=await first.store.commit(prepared.data.handle,{root:true,accepted:true});assert.equal(committed.data.status,'save-unverified');assert.equal(barriers.size,1);first.release();disk.state.content='External';
 const fresh=capturedDiskSession(disk,{barriers}),blocked=await fresh.store.read('notes');assert.equal(blocked.ok,false);assert.equal(blocked.error.code,'PERSISTENCE_UNKNOWN');assert.equal(barriers.size,1);assert.equal(disk.state.writes,1);assert.equal(disk.state.content,'External');fresh.release();
});
