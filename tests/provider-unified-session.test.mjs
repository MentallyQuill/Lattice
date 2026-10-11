import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createNativeWorkflowController} from '../src/workflow/host.js?v=0.26.0';
import {starterGraph} from '../src/workflow/starters.js?v=0.26.0';
import {workflowSignature} from '../src/workflow/runtime.js?v=0.26.0';
import {createWorkflowSession,prepareWorkflowProjection,projectPreparedWorkflow} from '../src/ui/workflow-surface.js?v=0.26.0';

function fixture() {
 const root=starterGraph('unified-basic'),listeners=new Map();let busy=false,result,phaseCalls=0;
 const names=['GENERATION_STARTED','GENERATION_STOPPED','GENERATION_ENDED','MESSAGE_RECEIVED','MESSAGE_SENT','CHAT_CHANGED','MESSAGE_EDITED','MESSAGE_UPDATED','MESSAGE_DELETED','MESSAGE_SWIPED','MESSAGE_SWIPE_DELETED'];
 const context={chatId:'story',characterId:0,groupId:null,characters:[{data:{name:'Mara'}}],chat:[{mes:'Open the door.',is_user:true,extra:{}}],extensionPrompts:{},eventTypes:Object.fromEntries(names.map(name=>[name,name])),eventSource:{on(name,fn){const bucket=listeners.get(name)??[];bucket.push(fn);listeners.set(name,bucket);},removeListener(name,fn){listeners.set(name,(listeners.get(name)??[]).filter(value=>value!==fn));},async emit(name,...args){for(const fn of listeners.get(name)??[])await fn(...args);}},setExtensionPrompt(key,value){context.extensionPrompts[key]={value};},saveChat:async()=>{},updateMessageBlock:async()=>{},swipe:{refresh:async()=>{}}};
 const controller=createNativeWorkflowController({context:()=>context,getGraph:phase=>phase==='unified'?root:null,userId:()=> 'default-user',isEnabled:()=>true,isBusy:()=>busy,countTokens:async()=>({tokens:1}),onResult:value=>result=value,syncMesToSwipe(index){const message=context.chat[index];message.swipes[message.swipe_id]=message.mes;return true;},syncSwipeToMes(index,swipeId){const message=context.chat[index];message.swipe_id=swipeId;message.mes=message.swipes[swipeId];Object.assign(message,structuredClone(message.swipe_info[swipeId]));return true;}});
 controller.subscribe();const runtime={...controller,runPre(...args){phaseCalls++;return controller.runPre(...args);},runPost(...args){phaseCalls++;return controller.runPost(...args);}};
 let state;const session=createWorkflowSession({runtime:()=>runtime,current:()=>root,epoch:()=>1,active:()=>true,changed:value=>state=value});
 return{root,context,controller,session,state:()=>state,phaseCalls:()=>phaseCalls,async send(){busy=true;await context.eventSource.emit('GENERATION_STARTED','normal',{},false);const ready=await controller.beforeGenerate(context.chat.map(message=>({...message})),8192,()=>{},'normal');assert.equal(ready.ok,true,JSON.stringify(ready.error));assert.equal(ready.awaitingNative,true);const now=new Date().toISOString();context.chat.push({mes:'Native reply.',is_user:false,extra:{},gen_started:now,gen_finished:now,swipe_id:0,swipes:['Native reply.'],swipe_info:[{gen_started:now,gen_finished:now,extra:{}}]});await context.eventSource.emit('MESSAGE_RECEIVED',1,'normal');busy=false;await context.eventSource.emit('GENERATION_ENDED',2);for(let attempt=0;attempt<30&&!result;attempt++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(result?.ok,true,JSON.stringify(result?.error));return controller.lastAutomaticResult();},close(){controller.dispose();}};
}

test('actual unified Send recording is adopted and root Review/Publish handle projects Apply',async()=>{
 const f=fixture();try{const automatic=await f.send();f.session.receiveAutomatic(automatic);assert.equal(f.session.result()?.recording,automatic.result.recording);assert.match(f.state().status,/Automatic Send.*unified/);assert.equal(f.state().availability,'current');
 const handle=automatic.result.reviewHandles[0];assert.ok(handle);const prepared=prepareWorkflowProjection(f.root,{result:f.session.result(),candidateStatus:selector=>f.controller.candidateStatus(selector)});
 const view=projectPreparedWorkflow(prepared,{selectedTarget:handle.terminal,selectedReviewHandle:handle});assert.equal(view.result.applyAvailable,true);assert.deepEqual(view.result.selectedReviewHandle,handle);assert.ok(view.result.sections.length);
 for(const changed of [{selectedReviewHandle:{...handle,handleId:'foreign'}},{selectedReviewHandle:{...handle,runId:'foreign'}},{selectedTarget:{...handle.terminal,address:{...handle.terminal.address,nodeId:'generate-reply'}}},{availability:'stale'},{result:{...f.session.result(),mode:'target'}}])assert.equal(projectPreparedWorkflow(prepared,{selectedTarget:handle.terminal,selectedReviewHandle:handle,...changed}).result.applyAvailable,false);
 }finally{f.close();}
});

test('unified automatic adoption preserves exact root, signature, origin, run and recording ownership',async()=>{
 const f=fixture();try{const automatic=await f.send();
 const rejected=[{origin:{...automatic.origin,phase:'pre'}},{origin:{...automatic.origin,graph:{...f.root}}},{origin:{...automatic.origin,graphId:'foreign'}},{origin:{...automatic.origin,signature:'foreign'}},{origin:{...automatic.origin,runId:'foreign'}},{result:{...automatic.result,runId:'foreign'}},{result:{...automatic.result,mode:'target'}},{result:{...automatic.result,recording:{...automatic.result.recording,runId:'foreign'}}},{result:{...automatic.result,recording:{...automatic.result.recording,identities:{...automatic.result.recording.identities,strings:['foreign']}}}}];
 for(const change of rejected){const session=createWorkflowSession({runtime:()=>f.controller,current:()=>f.root,epoch:()=>1,active:()=>true,changed(){}});session.receiveAutomatic({...automatic,...change});assert.equal(session.result(),null,JSON.stringify(change.origin??{resultRunId:change.result?.runId}));}
 f.session.receiveAutomatic(automatic);const recording=f.state().recording;f.session.cancel();f.session.receiveAutomatic({...automatic,result:{...automatic.result}});assert.equal(f.state().recording,recording);assert.equal(f.state().availability,'stale');
 }finally{f.close();}
});

test('manual unified root Run gives Send guidance without calling legacy phases or discarding current review',async()=>{
 const f=fixture();try{const automatic=await f.send();f.session.receiveAutomatic(automatic);const before=f.session.result();
 const response=await f.session.run();assert.equal(response?.ok,false);assert.equal(response.error.code,'NATIVE_SEND_REQUIRED');assert.equal(f.phaseCalls(),0);assert.equal(f.session.result(),before);assert.equal(f.state().availability,'current');assert.equal(f.state().busy,false);assert.match(f.state().status,/Enable.*open workflow.*Send.*SillyTavern/i);assert.equal(f.state().recording,automatic.result.recording);
 }finally{f.close();}
});

test('unified Run to here uses the actual bounded target host path for independent preparation',async()=>{
 const f=fixture();try{f.root.nodes.prompt={id:'prompt',type:'workflow',operation:'compose',sections:[{name:'text',text:'Bounded preparation.'}],outputKind:'text'};const target={workflowId:f.root.id,instancePath:[],nodeId:'prompt',portId:'out'};
 const response=await f.session.run({target});assert.equal(response.ok,true,JSON.stringify(response.error));assert.equal(response.mode,'target');assert.equal(f.phaseCalls(),0);assert.equal(f.state().reviewHandles.length,0);assert.equal(response.recording.plan.phase,'unified');
 }finally{f.close();}
});
