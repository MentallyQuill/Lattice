import assert from 'node:assert/strict';
import test from 'node:test';
import {createHostFileStore} from '../src/ui/host-file-store.js';
import {createHostFileAccess} from '../src/ui/host-file-access.js';
import {resolveManagedFileNode} from '../src/workflow/managed-file-policy.js';
import {createHostFileFixture} from './helpers/host-file-fixture.mjs';
import {nativeFixture,reviewGraph} from './helpers/native-workflow-fixture.mjs';

test('generated initial contents survive the actual host provider and a fresh access instance',async()=>{
 const disk=createHostFileFixture(),store=createHostFileStore({fetch:disk.fetch,getUserId:()=> 'default-user'});
 const access=createHostFileAccess({store,getUserId:()=> 'default-user'});assert.equal((await access.ready).ok,true);
 const graph=reviewGraph({revise:false}),content=JSON.stringify({scene:'Mara waits in the inn.'});
 graph.nodes.read={id:'read',type:'workflow',operation:'read-file',title:'Current scene',targetId:'',fileTarget:{managed:true},schema:JSON.stringify({type:'object',properties:{scene:{type:'string'}},required:['scene'],additionalProperties:false})};
 graph.nodes.guide={id:'guide',type:'workflow',operation:'compose',outputKind:'guidance',sections:[{name:'scene',text:'',kind:'text',required:true}]};
 graph.wires.scene={id:'scene',route:'wire',from:'read',fromPort:'text',to:'guide',toPort:'section.scene'};
 graph.wires.guide={id:'guide',route:'wire',from:'guide',fromPort:'out',to:'generate',toPort:'guidance'};
 let calls=0;
 const host=nativeFixture(graph,{ports:{nodeFileAccess:access,getWorkflowIdentity:()=> 'provider-initialization'},request:async()=>{calls++;return {ok:true,data:{text:content,finish:'stop'}};}});
 host.c.chatMetadata={};
 try {
  const proposed=await host.generate();assert.equal(proposed.ok,true,JSON.stringify(proposed.error));
  assert.equal(calls,1);assert.equal([...disk.files.values()].some(bytes=>bytes.toString()===content),false);
  const accepted=await host.controller.apply(proposed.reviewHandles[0]);assert.equal(accepted.ok,true,JSON.stringify(accepted));
  assert.equal([...disk.files.values()].some(bytes=>bytes.toString()===content),true,'accepted contents reach real host file APIs');
  const fresh=createHostFileAccess({store:createHostFileStore({fetch:disk.fetch,getUserId:()=> 'default-user'}),getUserId:()=> 'default-user'});assert.equal((await fresh.ready).ok,true);
  const resolved=resolveManagedFileNode(graph.nodes.read,{workflowId:'provider-initialization',address:{workflowId:graph.id,instancePath:[],nodeId:'read'}});assert.equal(resolved.ok,true,JSON.stringify(resolved));
  const scope={userId:'default-user',chatId:host.c.chatId},definition=await fresh.ensureManaged(resolved.data.definition,{managed:true,scope,isCurrent:()=>true});assert.equal(definition.ok,true,JSON.stringify(definition));
  const loaded=await fresh.backend([definition.data],{scope,isCurrent:()=>true}).load(definition.data.targetId);assert.equal(loaded.ok,true,JSON.stringify(loaded));assert.equal(loaded.data.content,content);
  const reopened=nativeFixture(graph,{ports:{nodeFileAccess:fresh,getWorkflowIdentity:()=> 'provider-initialization'},request:async()=>{calls++;throw Error('Saved state must avoid generation');}});reopened.c.chatMetadata={};
  try {const next=await reopened.generate();assert.equal(next.ok,true,JSON.stringify(next.error));assert.equal(calls,1,'saved data avoids another model request after reopening');reopened.controller.reject(next.reviewHandles[0]);} finally {reopened.controller.dispose();}
  assert.deepEqual(disk.unexpected,[]);
 } finally {host.controller.dispose();}
});
