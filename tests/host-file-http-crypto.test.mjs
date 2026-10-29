import assert from 'node:assert/strict';
import test from 'node:test';
import {createHostFileStore} from '../src/ui/host-file-store.js';
import {createHostFileAccess} from '../src/ui/host-file-access.js';
import {createHostFileFixture} from './helpers/host-file-fixture.mjs';
import {reviewGraph} from './helpers/native-workflow-fixture.mjs';
import {unifiedRecipeHost} from './helpers/unified-recipe-host.mjs';

for(const bound of [false,true])test(`host-managed ${bound?'source-bound':'ordinary'} generation and acceptance work without secure-context-only crypto APIs`,async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),secure=globalThis.crypto;
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:secure.getRandomValues.bind(secure)}});
 let host;
 try{
  const disk=createHostFileFixture(),store=createHostFileStore({fetch:disk.fetch,getUserId:()=> 'default-user'}),access=createHostFileAccess({store,getUserId:()=> 'default-user'}),graph=reviewGraph({revise:false});
  assert.equal((await access.ready).ok,true);
  graph.nodes.read={id:'read',type:'workflow',operation:'read-file',initialization:'generate',bindToChat:bound,fileTarget:{managed:true}};
  graph.nodes.recordsText={id:'recordsText',type:'workflow',operation:'text',text:'[{"fact":"Accepted consequence"}]'};
  graph.nodes.write={id:'write',type:'workflow',operation:'write-file',destinationMode:'connected',mode:bound?'replace':'add'};
  if(!bound)graph.nodes.records={id:'records',type:'workflow',operation:'json-decode'};
  const wires=bound?[['reference','read','reference','write','reference'],['writeText','recordsText','out','write','text']]:[['decode','recordsText','out','records','in'],['reference','read','reference','write','reference'],['writeRecords','records','out','write','records']];
  for(const [id,from,fromPort,to,toPort]of wires)graph.wires[id]={id,route:'wire',from,fromPort,to,toPort};
  graph.runTargets.push({instancePath:[],nodeId:'write'});
  let calls=0;host=unifiedRecipeHost(graph,{ports:{nodeFileAccess:access,getWorkflowIdentity:()=> 'http-workflow'},request:async()=>{calls++;return {ok:true,data:{text:'[{"fact":"Initialized story"}]',finish:'stop'}};}});
  const result=await host.generate('Mara waits.');assert.equal(result.ok,true,JSON.stringify(result.error));
  assert.equal((await host.controller.apply(result.reviewHandles[0])).ok,true);
  const outputs=[...disk.files].filter(([name])=>name.includes('-output-'));assert.equal(outputs.length,1);assert.deepEqual(JSON.parse(outputs[0][1].toString()),[...bound?[]:[{fact:'Initialized story'}],{fact:'Accepted consequence'}]);assert.equal(calls,1);assert.deepEqual(disk.unexpected,[]);
 }finally{host?.controller.dispose();if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;}
});
