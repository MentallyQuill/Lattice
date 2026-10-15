import assert from 'node:assert/strict';
import {createNativeWorkflowController} from '../../src/workflow/host.js';
export function reviewGraph({second=false,revise=true}={}) {
 const nodes={send:{id:'send',type:'workflow',operation:'on-send'},generate:{id:'generate',type:'workflow',operation:'generate-reply'},review:{id:'review',type:'workflow',operation:'review-publish'}};
 const wires={activation:{id:'activation',route:'wire',from:'send',fromPort:'activation',to:'generate',toPort:'activation'},draft:{id:'draft',route:'wire',from:'generate',fromPort:'draft',to:revise?'repair':'review',toPort:'draft'}};
 if(revise){nodes.repair={id:'repair',type:'workflow',operation:'revise-draft',scope:'whole',instructions:'Tighten prose.',profileId:null,modelRole:'Prose',x:410,y:140,inGroup:'ai-de-slop'};wires.review={id:'review',route:'wire',from:'repair',fromPort:'out',to:'review',toPort:'draft'};}
 if(second){nodes.second={id:'second',type:'workflow',operation:'review-publish'};wires.second={id:'second',route:'wire',from:revise?'repair':'generate',fromPort:revise?'out':'draft',to:'second',toPort:'draft'};}
 return {id:'host-review',name:'Host review',schema:3,runtime:2,mode:'native-unified',runTargets:[{instancePath:[],nodeId:'review'},...(second?[{instancePath:[],nodeId:'second'}]:[])],nodes,wires,definitions:{},portals:{},roles:{Prose:{profileId:'fixed',model:null}},groups:revise?{'ai-de-slop':{id:'ai-de-slop',members:['repair'],collapsed:true,x:410,y:140,w:260}}:{},view:{x:0,y:0,zoom:1}};
}
export function nativeFixture(graph=reviewGraph(),options={}) {
 const original={mes:'We delve.',is_user:false,swipe_id:0,swipes:['We delve.'],swipe_info:[{extra:{old:'keep'},send_date:1,gen_started:1,gen_finished:2}],extra:{old:'keep'},send_date:1,gen_started:1,gen_finished:2};
 const listeners=new Map(),events=[],results=[];
 const c=options.context??{chatId:'one',characterId:1,groupId:null,characters:[{avatar:'other.png'},{avatar:'fixture.png',data:{name:'Fixture'}}],chat:[{mes:'Hello',is_user:true},original],extensionPrompts:{other:{value:'keep'}}};
 const message=c.chat.at(-1);let assigned=graph,busy=false;
 c.eventTypes=Object.fromEntries(['GENERATION_STARTED','GENERATION_STOPPED','GENERATION_ENDED','MESSAGE_RECEIVED','CHAT_CHANGED','MESSAGE_EDITED','MESSAGE_UPDATED','MESSAGE_DELETED','MESSAGE_SWIPED','MESSAGE_SWIPE_DELETED','MESSAGE_SENT'].map(name=>[name,name]));
 c.eventSource={on(name,fn){const bucket=listeners.get(name)??[];bucket.push(fn);listeners.set(name,bucket);},removeListener(name,fn){listeners.set(name,(listeners.get(name)??[]).filter(value=>value!==fn));},async emit(name,...args){for(const fn of listeners.get(name)??[])await fn(...args);}};
 c.setExtensionPrompt??=((key,value)=>{c.extensionPrompts[key]={value};});c.saveChat??=(async()=>{c.saved=(c.saved??0)+1;});c.updateMessageBlock??=(()=>{});c.swipe??={refresh:()=>{}};
 const controller=createNativeWorkflowController({context:options.contextReader??(()=>c),userId:()=> 'default-user',transportUserId:()=> 'default-user',getGraph:phase=>phase==='unified'?assigned:undefined,isEnabled:()=>true,isBusy:()=>busy,countTokens:async text=>({tokens:Math.ceil(text.length/4),method:'fixture'}),...options.ports,...(options.resolveBinding?{resolveBinding:options.resolveBinding}:options.nativeBinding?{}:{resolveBinding:()=>({ok:true,data:{profileId:'fixed',model:'fixture'}})}),...(options.nativeBinding?{}:{request:options.request??(async()=>({ok:true,data:{text:'We explore.',finish:'stop'}}))}),onEvent:event=>{events.push(event);options.onEvent?.(event);},onResult:(value,origin)=>{results.push(value);options.onResult?.(value,origin);},syncMesToSwipe(index){const m=c.chat[index];m.swipes[m.swipe_id]=m.mes;Object.assign(m.swipe_info[m.swipe_id],{send_date:m.send_date,gen_started:m.gen_started,gen_finished:m.gen_finished,extra:structuredClone(m.extra)});return true;},syncSwipeToMes(index,id){const m=c.chat[index];m.swipe_id=id;m.mes=m.swipes[id];Object.assign(m,structuredClone(m.swipe_info[id]));return true;}});
 controller.subscribe();
 return {c,controller,original:message,message,events,results,setGraph(value){assigned=value;},setBusy(value){busy=value;},owned:()=>Object.entries(c.extensionPrompts).filter(([key])=>key.startsWith('lattice:guidance:')).map(([,value])=>value.value).join(''),async generate(next=assigned,{onEvent}={}){
  assigned=next;const count=results.length,m=c.chat.pop();assert.equal(m.is_user,false,'Fixture owns one native reply');
  await c.eventSource.emit('GENERATION_STARTED','normal',{},false);
  const ready=await controller.beforeGenerate(c.chat,8192,()=>{},'normal');
  if(!ready.ok){c.chat.push(m);return ready;}
  const now=Date.now();m.gen_started=now;m.gen_finished=now;c.chat.push(m);
  await c.eventSource.emit('MESSAGE_RECEIVED',c.chat.length-1,'normal');await c.eventSource.emit('GENERATION_ENDED',c.chat.length);
  for(let i=0;i<100&&results.length===count;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(results.length>count,'Owned native run settled');const result=results.at(-1);if(onEvent)for(const event of events.filter(event=>event.runId===result.runId))onEvent(event);return result;
 }};
}
