import assert from 'node:assert/strict';
import test from 'node:test';
import {createHostFileStore} from '../src/ui/host-file-store.js';
import {createHostFileAccess} from '../src/ui/host-file-access.js';
import {resolveManagedFileNode} from '../src/workflow/managed-file-policy.js';
import {createHostFileFixture} from './helpers/host-file-fixture.mjs';
import {reviewGraph} from './helpers/native-workflow-fixture.mjs';
import {unifiedRecipeHost} from './helpers/unified-recipe-host.mjs';

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
function branchHost(value,access,request){
 return unifiedRecipeHost(value,{playerText:'Mara reaches the quiet inn.',request,ports:{nodeFileAccess:access,getWorkflowIdentity:()=>workflowId},configureContext:c=>{
  // Existing native branch authority must be present before the controller's
  // chat-open capture. No parent document or legacy catalog is installed.
  c.chatId=childChatId;c.chatMetadata={main_chat:parentChatId,integrity};
  c.characters[0].data.description='Mara is a careful witch.';
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
