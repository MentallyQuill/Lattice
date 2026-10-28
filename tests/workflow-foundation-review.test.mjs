import assert from 'node:assert/strict';
import test from 'node:test';
import {installMock} from './mock.js';
import * as S from '../src/state.js?v=0.29.0';
import {createWorkflowDocumentController} from '../src/ui/document-controller.js?v=0.29.0';
import {parseWorkflowDocument} from '../src/workflow/document-file.js?v=0.29.0';
import {installWorkflowExample} from '../src/workflow/examples.js?v=0.29.0';
import {createNativeWorkflowController} from '../src/workflow/host.js?v=0.29.0';
import {createNativePersistenceVerifier} from '../src/workflow/native-persistence.js?v=0.29.0';
import {prepareCreateFromSelection} from '../src/workflow/composition.js?v=0.29.0';
import {expandRecordAddress} from '../src/workflow/record-data.js?v=0.29.0';
function sourceHost(graph){
 let saved,saves=0,reads=0;const listeners=new Map();
 const c={chatId:'foundation-send',getCurrentChatId:()=> 'foundation-send',characterId:0,groupId:null,characters:[{avatar:'practice.png',name:'Practice',chat:'foundation-send',data:{name:'Practice'}}],chat:Array.from({length:26},(_,i)=>({name:i%2?'Practice':'User',mes:(i%2?'Assistant':'User')+' passage '+(Math.floor(i/2)+1)+'.',is_user:i%2===0,is_system:false,extra:{}})),chatMetadata:{},extensionPrompts:{},getRequestHeaders:()=>({'Content-Type':'application/json'}),eventTypes:Object.fromEntries(['GENERATION_STARTED','GENERATION_STOPPED','GENERATION_ENDED','MESSAGE_RECEIVED','MESSAGE_SENT','CHAT_CHANGED'].map(n=>[n,n]))};
 c.eventSource={on(n,f){const a=listeners.get(n)??[];a.push(f);listeners.set(n,a);},removeListener(n,f){listeners.set(n,(listeners.get(n)??[]).filter(x=>x!==f));},async emit(n,...args){for(const f of listeners.get(n)??[])await f(...args);}};
 c.setExtensionPrompt=(key,value)=>{c.extensionPrompts[key]={value};};c.saveMetadata=async()=>{saves++;saved=structuredClone([{chat_metadata:c.chatMetadata},...c.chat]);};
 const verifier=createNativePersistenceVerifier({getContext:()=>c,getUserId:()=> 'default-user',fetch:async()=>{reads++;return{ok:true,text:async()=>JSON.stringify(saved)};}});
 const controller=createNativeWorkflowController({context:()=>c,userId:()=> 'default-user',getGraph:()=>graph,isEnabled:()=>true,isBusy:()=>false,persistenceVerifier:verifier,countTokens:async()=>({tokens:1}),request:()=>assert.fail('No auxiliary model calls')});controller.subscribe();
 return{c,controller,counts:()=>({saves,reads}),async prepare(){await c.eventSource.emit('GENERATION_STARTED','normal',{},false);return controller.beforeGenerate(c.chat.map(m=>({...m})),8192,()=>{},'normal');}};
}

test('source setup survives the owned Send user append with verified bookkeeping and raw history',async()=>{
 const opened=installWorkflowExample('lesson-35');assert.equal(opened.ok,true);const f=sourceHost(opened.data.graph);
 try{const setup=await f.controller.setupSources();assert.equal(setup.ok,true,JSON.stringify(setup));const before=f.c.chat.map(m=>m.mes);f.c.chat.push({name:'User',mes:'I inspect the harbor light.',is_user:true,is_system:false,extra:{}});const raw=JSON.stringify(f.c.chat);const ready=await f.prepare();assert.equal(ready.ok,true,JSON.stringify(ready.error));assert.equal(ready.awaitingNative,true);assert.equal(JSON.stringify(f.c.chat),raw);assert.deepEqual(f.c.chat.slice(0,26).map(m=>m.mes),before);assert.deepEqual(f.counts(),{saves:2,reads:2});f.controller.cancel('Test ends at the real native boundary');}finally{f.controller.dispose();}
});

test('owned Send source refresh refuses a changed acknowledged prefix before another write',async()=>{
 const f=sourceHost(installWorkflowExample('lesson-35').data.graph);try{const setup=await f.controller.setupSources();assert.equal(setup.ok,true,JSON.stringify(setup));f.c.chat[0].mes='Changed after acknowledgement';f.c.chat.push({mes:'New user.',is_user:true,extra:{}});const ready=await f.prepare();assert.equal(ready.ok,false);assert.deepEqual(f.counts(),{saves:1,reads:1});}finally{f.controller.dispose();}
});

test('a runtime2 Scene helper retains its single output and needs no enrollment in a runtime3 root',async()=>{
 const legacy={id:'legacy-scene',schema:3,runtime:2,mode:'native-unified',nodes:{scene:{id:'scene',type:'workflow',operation:'scene-context',includeCharacter:false,visibilityMode:'public',recentMessages:12}},wires:{},definitions:{}};
 const wrapped=prepareCreateFromSelection(legacy,{nodeIds:['scene'],definitionId:'legacy-scene-body',instanceId:'legacy',name:'Legacy Scene'});assert.equal(wrapped.ok,true,JSON.stringify(wrapped.error));const root=wrapped.data.candidate;root.schema=4;root.runtime=3;
 const f=sourceHost(root);try{const result=await f.controller.runTarget(root,{workflowId:root.id,instancePath:['legacy'],nodeId:'scene',portId:'out'});assert.equal(result.ok,true,JSON.stringify(result.error));const outputs=result.recording.artifacts.filter(a=>a.origin.direction==='output'&&expandRecordAddress(result.recording,a.origin.address).nodeId==='scene');assert.deepEqual(outputs.map(a=>result.recording.identities.strings[a.origin.port]),['out']);assert.deepEqual(f.counts(),{saves:0,reads:0});}finally{f.controller.dispose();}
});

test('an edited saved lesson exports pruned checkpoints without reopening the document',async()=>{
 installMock();S.settings();const opened=installWorkflowExample('lesson-34');assert.equal(opened.ok,true);assert.ok(S.activateWorkflow(opened.data.graph,{exampleMetadata:opened.data.exampleMetadata}));const g=S.activeWorkflow();const ids=S.documentSession.exampleMetadata().checkpoints.map(x=>x.target.nodeId);assert.ok(ids.length);for(const id of ids)delete g.nodes[id];for(const [id,w] of Object.entries(g.wires))if(ids.includes(w.from)||ids.includes(w.to))delete g.wires[id];
 let saved;const commands=createWorkflowDocumentController({session:S.documentSession,files:{native:true,recents:()=>[],save:async json=>{saved=json;return{ok:true,data:{source:{name:'edited.json'},downloaded:false}};}},views:()=>null});assert.equal((await commands.save()).ok,true);assert.deepEqual(JSON.parse(saved).exampleMetadata.checkpoints,[]);const portable=S.exportGraph(g),parsed=parseWorkflowDocument(portable);assert.equal(parsed.ok,true,JSON.stringify(parsed.error));assert.deepEqual(parsed.data.exampleMetadata.checkpoints,[]);assert.equal(parsed.data.exampleMetadata.id,'lesson-34');
});


test('the next owned Send verifies a settled reply and the next user without rewriting history',async()=>{
 const f=sourceHost(installWorkflowExample('lesson-35').data.graph);try{assert.equal((await f.controller.setupSources()).ok,true);f.c.chat.push({mes:'First new user.',is_user:true,extra:{}});assert.equal((await f.prepare()).ok,true);f.controller.cancel('End first owned generation fixture');f.c.chat.push({mes:'First settled reply.',is_user:false,extra:{}},{mes:'Second new user.',is_user:true,extra:{}});const raw=JSON.stringify(f.c.chat);const next=await f.prepare();assert.equal(next.ok,true,JSON.stringify(next.error));assert.equal(next.awaitingNative,true);assert.equal(JSON.stringify(f.c.chat),raw);assert.deepEqual(f.counts(),{saves:3,reads:3});}finally{f.controller.dispose();}
});

test('cancel during owned Send source save prevents readback acknowledgement and native continuation',async()=>{
 const f=sourceHost(installWorkflowExample('lesson-35').data.graph);try{assert.equal((await f.controller.setupSources()).ok,true);const save=f.c.saveMetadata;f.c.saveMetadata=async()=>{f.controller.cancel('Stop during source persistence');await save();};f.c.chat.push({mes:'New user before cancellation.',is_user:true,extra:{}});const ready=await f.prepare();assert.equal(ready.ok,false);assert.equal(f.counts().reads,1);assert.notEqual(f.controller.inspectSources().data.status,'acknowledged');}finally{f.controller.dispose();}
});
