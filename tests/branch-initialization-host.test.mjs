import assert from 'node:assert/strict';
import test from 'node:test';
import {createHostFileStore} from '../src/ui/host-file-store.js';
import {createHostFileAccess} from '../src/ui/host-file-access.js';
import {resolveManagedFileNode} from '../src/workflow/managed-file-policy.js';
import {createHostFileFixture} from './helpers/host-file-fixture.mjs';
import {reviewGraph} from './helpers/native-workflow-fixture.mjs';
import {unifiedRecipeHost} from './helpers/unified-recipe-host.mjs';
import {sha256Text} from '../src/workflow/definition-data.js';

const userId='default-user',childChatId='existing-branch',parentChatId='original-parent',workflowId='branch-initialization';
const integrity='8cae3be6-d8db-4f95-a7d4-362d07b0dd92';
const outputFiles=disk=>[...disk.files].filter(([name])=>/-output-[a-f0-9]{64}\.(?:json|txt|md|jsonl|csv)$/.test(name));
function graph({privateFile=false}={}){
 const value=reviewGraph({revise:false});
 value.nodes.read={id:'read',type:'workflow',operation:'read-file',initialization:'generate',targetId:'',fileTarget:{managed:true,...(privateFile?{visibility:{kind:'actor-private',actorId:'character:mara.png'}}:{})}};
 if(privateFile){
  value.nodes.recordsText={id:'recordsText',type:'workflow',operation:'text',text:'[{"fact":"Accepted consequence"}]'};
  value.nodes.records={id:'records',type:'workflow',operation:'json-decode'};
  value.nodes.write={id:'write',type:'workflow',operation:'write-file',destinationMode:'connected',mode:'add'};
  for(const [id,from,fromPort,to,toPort]of [['decode','recordsText','out','records','in'],['reference','read','reference','write','reference'],['writeRecords','records','out','write','records']])value.wires[id]={id,route:'wire',from,fromPort,to,toPort};
  value.runTargets.push({instancePath:[],nodeId:'write'});
 }else{
  value.nodes.guide={id:'guide',type:'workflow',operation:'compose',outputKind:'guidance',sections:[{name:'state',text:'',kind:'text',required:true}]};
  value.wires.contents={id:'contents',route:'wire',from:'read',fromPort:'text',to:'guide',toPort:'section.state'};
  value.wires.guide={id:'guide',route:'wire',from:'guide',fromPort:'out',to:'generate',toPort:'guidance'};
 }
 return value;
}
function branchHost(value,access,request,configure=()=>{}){
 return unifiedRecipeHost(value,{playerText:'Mara reaches the quiet inn.',request,ports:{nodeFileAccess:access,getWorkflowIdentity:()=>workflowId},configureContext:c=>{
  // Existing native branch authority must be present before the controller's
  // chat-open capture. No parent document or legacy catalog is installed.
  c.chatId=childChatId;c.chatMetadata={main_chat:parentChatId,integrity};
  c.characters[0].data.description='Mara is a careful witch.';
  configure(c);
 }});
}
async function bindingRows(store){
 const metadata=await store.read('node-bindings.json');assert.equal(metadata.ok,true,JSON.stringify(metadata.error));
 return metadata.data.exists?JSON.parse(metadata.data.content).bindings:[];
}

for(const privateFile of [false,true])test(`an existing branch initializes a new ${privateFile?'private':'public'} child document without a parent binding`,async()=>{
 const disk=createHostFileFixture(),store=createHostFileStore({fetch:disk.fetch,getUserId:()=>userId}),access=createHostFileAccess({store,getUserId:()=>userId}),value=graph({privateFile});
 assert.equal((await access.ready).ok,true);assert.deepEqual(await bindingRows(store),[]);
 if(privateFile){
  const candidate=resolveManagedFileNode(value.nodes.read,{workflowId,address:{workflowId:value.id,instancePath:[],nodeId:'read'}});assert.equal(candidate.ok,true,JSON.stringify(candidate.error));
  const child=await access.ensureManaged(candidate.data.definition,{managed:true,scope:{userId,chatId:childChatId,actorId:'character:mara.png'},isCurrent:()=>true});assert.equal(child.ok,true,JSON.stringify(child.error));
  assert.equal((await bindingRows(store)).length,1,'an unwritten child binding may predate this run');assert.equal(outputFiles(disk).length,0);
 }
 const generated=[{fact:'Mara carries a wand.'}],expected=privateFile?[...generated,{fact:'Accepted consequence'}]:generated;
 let requests=0,initializationMessages;
 const host=branchHost(value,access,async options=>{requests++;initializationMessages=JSON.stringify(options.messages);return {ok:true,data:{text:JSON.stringify(generated),finish:'stop'}};});
 try{
  const proposed=await host.generate('Mara waits at the inn.');assert.equal(proposed.ok,true,JSON.stringify(proposed.error));
  assert.equal(requests,1);assert.equal(proposed.actualCalls,1);assert.match(initializationMessages,/quiet inn/);
  assert.equal(outputFiles(disk).length,0,'preparation may allocate metadata but cannot publish document bytes');
  assert.ok([...disk.files.values()].every(bytes=>!bytes.toString().includes('Mara carries a wand.')),'generated story content stays out of stored metadata before acceptance');
  const preparedRows=await bindingRows(store);assert.equal(preparedRows.length,1);assert.ok(preparedRows.every(row=>JSON.parse(row.managedScope)[1]===childChatId));
  if(privateFile)assert.equal(JSON.parse(preparedRows[0].managedScope)[2],'character:mara.png');
  const accepted=await host.controller.apply(proposed.reviewHandles[0]);assert.equal(accepted.ok,true,JSON.stringify(accepted.error));
  assert.equal(outputFiles(disk).length,1);assert.deepEqual(JSON.parse(outputFiles(disk)[0][1].toString()),expected);
  assert.ok((await bindingRows(store)).every(row=>JSON.parse(row.managedScope)[1]!==parentChatId),'parent metadata must remain unallocated');
  const freshStore=createHostFileStore({fetch:disk.fetch,getUserId:()=>userId}),fresh=createHostFileAccess({store:freshStore,getUserId:()=>userId});assert.equal((await fresh.ready).ok,true);
  const resolved=resolveManagedFileNode(value.nodes.read,{workflowId,address:{workflowId:value.id,instancePath:[],nodeId:'read'}});assert.equal(resolved.ok,true,JSON.stringify(resolved.error));
  const scope={userId,chatId:childChatId,...(privateFile?{actorId:'character:mara.png'}:{})},existing=await fresh.ensureManaged(resolved.data.definition,{managed:true,create:false,scope,isCurrent:()=>true});assert.equal(existing.ok,true,JSON.stringify(existing.error));
  const loaded=await fresh.backend([existing.data],{scope,isCurrent:()=>true}).load(existing.data.targetId);assert.equal(loaded.ok,true,JSON.stringify(loaded.error));assert.deepEqual(JSON.parse(loaded.data.content),expected);
  let parentLookups=0;const watched={...fresh,ensureManaged:(definition,controls)=>{if(controls.create===false&&controls.scope.chatId===parentChatId)parentLookups++;return fresh.ensureManaged(definition,controls);}};
  const reopened=branchHost(value,watched,async()=>assert.fail('An existing child document must skip initialization'));
  try{const reused=await reopened.generate('Mara remains at the inn.');assert.equal(reused.ok,true,JSON.stringify(reused.error));assert.equal(reused.actualCalls,0);assert.equal(parentLookups,0,'saved child state must skip parent inheritance');assert.equal(reopened.controller.reject(reused.reviewHandles[0]).ok,true);}finally{reopened.controller.dispose();}
  assert.equal(requests,1);assert.equal(outputFiles(disk).length,1);assert.deepEqual(disk.unexpected,[]);
 }finally{host.controller.dispose();}
});

for(const privateFile of [false,true])for(const change of ['edit','delete'])test(`accepted ${privateFile?'private':'public'} child files survive a captured branch-prefix ${change} before the next Send`,async()=>{
 const disk=createHostFileFixture(),store=createHostFileStore({fetch:disk.fetch,getUserId:()=>userId}),access=createHostFileAccess({store,getUserId:()=>userId}),value=graph({privateFile});
 assert.equal((await access.ready).ok,true);
 let requests=0,parentLookups=0;const watched={...access,ensureManaged:(definition,controls)=>{if(controls.create===false&&controls.scope.chatId===parentChatId)parentLookups++;return access.ensureManaged(definition,controls);}};
 const generated=[{fact:'Accepted child state survives trimmed history.'}],host=branchHost(value,watched,async()=>{requests++;return {ok:true,data:{text:JSON.stringify(generated),finish:'stop'}};});
 try{
  const first=await host.generate('Mara waits at the inn.');assert.equal(first.ok,true,JSON.stringify(first.error));assert.equal((await host.controller.apply(first.reviewHandles[0])).ok,true);assert.equal(requests,1);
  const before=outputFiles(disk).map(([name,bytes])=>[name,bytes.toString()]);assert.equal(before.length,1);parentLookups=0;
  if(change==='delete')host.c.chat.shift();else host.c.chat[0].mes='The old branch prefix was edited.';
  await host.c.eventSource.emit(change==='delete'?'MESSAGE_DELETED':'MESSAGE_EDITED',0);
  host.c.chat.push({mes:'Mara begins the next turn after cleaning up history.',is_user:true,extra:{}});
  const continued=await host.generate('Mara continues from the saved child state.');
  assert.equal(continued.ok,true,JSON.stringify(continued.error));assert.equal(continued.actualCalls,0);assert.equal(requests,1,'accepted child state must not initialize again');assert.equal(parentLookups,0,'existing child resources need no parent inheritance lookup');
  assert.deepEqual(outputFiles(disk).map(([name,bytes])=>[name,bytes.toString()]),before);
  assert.equal(host.controller.reject(continued.reviewHandles[0]).ok,true);
  if(change==='delete'){
   const fresh=createHostFileAccess({store:createHostFileStore({fetch:disk.fetch,getUserId:()=>userId}),getUserId:()=>userId});assert.equal((await fresh.ready).ok,true);let freshParentLookups=0;
   const reopenedAccess={...fresh,ensureManaged:(definition,controls)=>{if(controls.create===false&&controls.scope.chatId===parentChatId)freshParentLookups++;return fresh.ensureManaged(definition,controls);}};
   const reopened=branchHost(value,reopenedAccess,async()=>assert.fail('Reopened trimmed child state cannot initialize again'),c=>{c.chat=[...structuredClone(host.c.chat),{mes:'Mara sends a new turn after reopening.',is_user:true,extra:{}}];c.chatMetadata=structuredClone(host.c.chatMetadata);});
   try{const reused=await reopened.generate('Mara continues after reopening the trimmed branch.');assert.equal(reused.ok,true,JSON.stringify(reused.error));assert.equal(reused.actualCalls,0);assert.equal(freshParentLookups,0);assert.equal(reopened.controller.reject(reused.reviewHandles[0]).ok,true);}finally{reopened.controller.dispose();}
   assert.deepEqual(outputFiles(disk).map(([name,bytes])=>[name,bytes.toString()]),before);
  }
  assert.deepEqual(disk.unexpected,[]);
 }finally{host.controller.dispose();}
});

test('an edited prefix permits a missing child document only after verified absence in the same parent scope',async()=>{
 const disk=createHostFileFixture(),store=createHostFileStore({fetch:disk.fetch,getUserId:()=>userId}),access=createHostFileAccess({store,getUserId:()=>userId}),value=graph();assert.equal((await access.ready).ok,true);
 let requests=0,parentLookups=0;const watched={...access,ensureManaged:(definition,controls)=>{if(controls.create===false&&controls.scope.chatId===parentChatId)parentLookups++;return access.ensureManaged(definition,controls);}};
 const generated=[{fact:'New state follows the edited conversation.'}],host=branchHost(value,watched,async()=>{requests++;return {ok:true,data:{text:JSON.stringify(generated),finish:'stop'}};});
 try{
  host.c.chat[0].mes='The captured branch prefix was edited before its first document.';await host.c.eventSource.emit('MESSAGE_EDITED',0);host.c.chat.push({mes:'Mara begins a new turn.',is_user:true,extra:{}});
  const proposed=await host.generate('Mara starts new child state.');assert.equal(proposed.ok,true,JSON.stringify(proposed.error));assert.equal(requests,1);assert.equal(parentLookups,1);assert.equal(outputFiles(disk).length,0);
  assert.ok((await bindingRows(store)).every(row=>JSON.parse(row.managedScope)[1]===childChatId),'verified parent absence must not allocate its binding');
  assert.equal((await host.controller.apply(proposed.reviewHandles[0])).ok,true);assert.equal(outputFiles(disk).length,1);assert.deepEqual(JSON.parse(outputFiles(disk)[0][1].toString()),generated);assert.deepEqual(disk.unexpected,[]);
 }finally{host.controller.dispose();}
});

for(const mutation of ['metadata identity','integrity','parent'])test(`a missing child cannot initialize through changed branch ${mutation} even when parent data is absent`,async()=>{
 const disk=createHostFileFixture(),store=createHostFileStore({fetch:disk.fetch,getUserId:()=>userId}),access=createHostFileAccess({store,getUserId:()=>userId}),value=graph();assert.equal((await access.ready).ok,true);
 let requests=0,parentLookups=0;const watched={...access,ensureManaged:(definition,controls)=>{if(controls.create===false)parentLookups++;return access.ensureManaged(definition,controls);}};
 const host=branchHost(value,watched,async()=>{requests++;return {ok:true,data:{text:'[]',finish:'stop'}};});
 try{
  host.c.chat[0].mes='The old prefix changed.';await host.c.eventSource.emit('MESSAGE_EDITED',0);host.c.chat.push({mes:'Next user turn.',is_user:true,extra:{}});
  if(mutation==='metadata identity')host.c.chatMetadata={...host.c.chatMetadata};
  else if(mutation==='integrity')host.c.chatMetadata.integrity='65325410-c02e-4fbc-8ab3-d7b0eaec88ce';
  else host.c.chatMetadata.main_chat='different-parent';
  const held=await host.generate('This generation must remain held.');assert.equal(held.ok,false);assert.equal(held.error.code,'BRANCH_POINT_UNAVAILABLE');assert.equal(requests,0);assert.equal(parentLookups,0);assert.equal(outputFiles(disk).length,0);assert.deepEqual(disk.unexpected,[]);
 }finally{host.controller.dispose();}
});

test('a source-bound child reader resets its view after trimming and rewrites only at acceptance',async()=>{
 const disk=createHostFileFixture(),store=createHostFileStore({fetch:disk.fetch,getUserId:()=>userId}),access=createHostFileAccess({store,getUserId:()=>userId}),value=graph();assert.equal((await access.ready).ok,true);
 value.nodes.read.bindToChat=true;
 const oldContent=JSON.stringify([{fact:'Old derived state must not survive the source reset.'}]),newContent=JSON.stringify([{fact:'Recomputed state for the trimmed conversation.'}]);
 value.nodes.replacement={id:'replacement',type:'workflow',operation:'text',text:oldContent};value.nodes.write={id:'write',type:'workflow',operation:'write-file',destinationMode:'connected',mode:'replace'};
 for(const [id,from,fromPort,to,toPort]of [['reference','read','reference','write','reference'],['replacement','replacement','out','write','text']])value.wires[id]={id,route:'wire',from,fromPort,to,toPort};value.runTargets.push({instancePath:[],nodeId:'write'});
 let requests=0,parentLookups=0;const watched={...access,ensureManaged:(definition,controls)=>{if(controls.create===false&&controls.scope.chatId===parentChatId)parentLookups++;return access.ensureManaged(definition,controls);}};
 const host=branchHost(value,watched,async()=>{requests++;return {ok:true,data:{text:oldContent,finish:'stop'}};});
 try{
  const first=await host.generate('First derived reply.');assert.equal(first.ok,true,JSON.stringify(first.error));assert.equal((await host.controller.apply(first.reviewHandles[0])).ok,true);assert.equal(requests,1);assert.equal(outputFiles(disk)[0][1].toString(),oldContent);
  host.c.chat.shift();await host.c.eventSource.emit('MESSAGE_DELETED',0);host.c.chat.push({mes:'A user turn after the source was trimmed.',is_user:true,extra:{}});value.nodes.replacement.text=newContent;parentLookups=0;
  const reset=await host.generate('A reply based on the reset view.');assert.equal(reset.ok,true,JSON.stringify(reset.error));assert.equal(reset.actualCalls,0);assert.equal(requests,1);assert.equal(parentLookups,0);
  assert.ok(reset.recording.artifacts.some(artifact=>artifact.value?.kind==='text'&&artifact.value.text==='[]'),'the bound reader exposes its valid starting template after a source mismatch');
  assert.equal(JSON.stringify(reset.recording).includes('Old derived state must not survive'),false,'stale derived bytes cannot reach the next workflow inputs');assert.equal(outputFiles(disk)[0][1].toString(),oldContent,'replacement waits for acceptance');
  assert.equal((await host.controller.apply(reset.reviewHandles[0])).ok,true);assert.equal(outputFiles(disk)[0][1].toString(),newContent);assert.deepEqual(disk.unexpected,[]);
 }finally{host.controller.dispose();}
});

test('an invalid branch capture still holds a missing child file when an accepted parent file exists',async()=>{
 const disk=createHostFileFixture(),store=createHostFileStore({fetch:disk.fetch,getUserId:()=>userId}),access=createHostFileAccess({store,getUserId:()=>userId}),value=graph();
 assert.equal((await access.ready).ok,true);
 const resolved=resolveManagedFileNode(value.nodes.read,{workflowId,address:{workflowId:value.id,instancePath:[],nodeId:'read'}});assert.equal(resolved.ok,true,JSON.stringify(resolved.error));
 const scope={userId,chatId:parentChatId},parent=await access.ensureManaged(resolved.data.definition,{managed:true,scope,isCurrent:()=>true});assert.equal(parent.ok,true,JSON.stringify(parent.error));
 const backend=access.backend([parent.data],{scope,isCurrent:()=>true}),loaded=await backend.load(parent.data.targetId);assert.equal(loaded.ok,true,JSON.stringify(loaded.error));
 const parentContent=JSON.stringify([{fact:'Accepted parent history must never become a fresh child seed.'}]);
 const saved=await backend.compareAndSwap({targetId:parent.data.targetId,expectedRevision:loaded.data.revision,expectedContent:loaded.data.content,projectedDocument:{format:'json',content:parentContent},intentId:'accepted-parent',fingerprint:sha256Text('accepted parent')});assert.equal(saved.ok,true,JSON.stringify(saved.error));
 const before=outputFiles(disk).map(([name,bytes])=>[name,bytes.toString()]);assert.equal(before.length,1);
 let requests=0;const host=branchHost(value,access,async()=>{requests++;return {ok:true,data:{text:'[]',finish:'stop'}};});
 try{
  host.c.chat.shift();await host.c.eventSource.emit('MESSAGE_DELETED',0);host.c.chat.push({mes:'A new player turn after the old prefix was deleted.',is_user:true,extra:{}});
  const held=await host.generate('This native generation must remain held.');assert.equal(held.ok,false);assert.equal(held.error.code,'BRANCH_POINT_UNAVAILABLE');assert.equal(requests,0);
  assert.deepEqual(outputFiles(disk).map(([name,bytes])=>[name,bytes.toString()]),before,'a failed branch proof must preserve the parent and leave the child missing');assert.deepEqual(disk.unexpected,[]);
 }finally{host.controller.dispose();}
});
