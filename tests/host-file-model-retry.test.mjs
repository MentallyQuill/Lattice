import assert from 'node:assert/strict';
import test from 'node:test';
import {createHostFileStore} from '../src/ui/host-file-store.js';
import {createHostFileAccess} from '../src/ui/host-file-access.js';
import {resolveManagedFileNode} from '../src/workflow/managed-file-policy.js';
import {sha256Text} from '../src/workflow/definition-data.js';
import {createHostFileFixture} from './helpers/host-file-fixture.mjs';
import {reviewGraph} from './helpers/native-workflow-fixture.mjs';
import {unifiedRecipeHost} from './helpers/unified-recipe-host.mjs';

test('a metadata read interruption between Assessment attempts does not consume or replay model requests',async()=>{
 const disk=createHostFileFixture();let failNextRead=false,interruptedReads=0,calls=0;
 const fetch=async(url,options)=>{if(failNextRead&&options.method==='GET'&&url.endsWith('-node-bindings.json')){failNextRead=false;interruptedReads++;throw new TypeError('Mobile connection reset');}return disk.fetch(url,options);};
 const userId='default-user',workflowId='retry-workflow',access=createHostFileAccess({store:createHostFileStore({fetch,getUserId:()=>userId}),getUserId:()=>userId}),graph=reviewGraph({revise:false});
 graph.nodes.read={id:'read',type:'workflow',operation:'read-file',initialization:'generate',fileTarget:{managed:true}};
 graph.nodes.assessment={id:'assessment',type:'workflow',operation:'model-call',outputKind:'data',schema:JSON.stringify({type:'object',required:['brief'],properties:{brief:{type:'string'}},additionalProperties:false}),maxRetries:1};
 graph.wires.assessment={id:'assessment',route:'wire',from:'read',fromPort:'text',to:'assessment',toPort:'prompt'};
 const definition=resolveManagedFileNode(graph.nodes.read,{workflowId,address:{workflowId:graph.id,instancePath:[],nodeId:'read'}});assert.equal(definition.ok,true);
 assert.equal((await access.ready).ok,true);const scope={userId,chatId:'Story-2'},selected=await access.ensureManaged(definition.data.definition,{managed:true,scope,isCurrent:()=>true});assert.equal(selected.ok,true);
 const backend=access.backend([selected.data],{scope,isCurrent:()=>true}),loaded=await backend.load(selected.data.targetId);assert.equal(loaded.ok,true);
 assert.equal((await backend.compareAndSwap({targetId:selected.data.targetId,expectedRevision:loaded.data.revision,expectedContent:loaded.data.content,projectedDocument:{format:'json',content:'[{"fact":"Accepted story"}]'},intentId:'seed',fingerprint:sha256Text('seed')})).ok,true);
 const before=[...disk.files].map(([name,bytes])=>[name,bytes.toString()]);
 const host=unifiedRecipeHost(graph,{ports:{nodeFileAccess:access,getWorkflowIdentity:()=>workflowId},request:async()=>{calls++;if(calls===1){failNextRead=true;return {ok:true,data:{text:'not JSON',finish:'stop'}};}return {ok:true,data:{text:'{"brief":"Proceed"}',finish:'stop'}};}});
 try{
  const result=await host.controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'assessment',portId:'out'});
  assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(calls,2);assert.equal(result.actualCalls,2);assert.equal(interruptedReads,1);
  assert.deepEqual([...disk.files].map(([name,bytes])=>[name,bytes.toString()]),before,'read retries cannot publish or rewrite file data');assert.deepEqual(disk.unexpected,[]);
 }finally{host.controller.dispose();}
});
