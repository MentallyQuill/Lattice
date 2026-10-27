import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeFixture,reviewGraph} from './helpers/native-workflow-fixture.mjs';

const node=(id,operation,settings={})=>({id,type:'workflow',operation,...settings});
const wire=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});

test('a blocked Memory Commit does not discard the surviving native Review during recovery',async()=>{
 const graph=reviewGraph({revise:false});
 graph.nodes.prompt=node('prompt','text',{phase:'post',text:'Prepare a memory proposal.'});
 graph.nodes.proposal=node('proposal','model-call',{phase:'post',outputKind:'data'});
 graph.nodes.commit=node('commit','memory',{mode:'commit'});
 graph.wires.prompt=wire('prompt','prompt','out','proposal','prompt');
 graph.wires.commit=wire('commit','proposal','out','commit','proposal');
 graph.runTargets.push({instancePath:[],nodeId:'commit'});
 let writes=0;
 const f=nativeFixture(graph,{ports:{getFailurePolicy:()=> 'continue-available'},request:async()=>({ok:false,error:{code:'REQUEST_FAILED',message:'Synthetic proposal failure.'}})});
 f.c.chatMetadata={};f.c.saveMetadata=async()=>{writes++;};
 try{
  const result=await f.generate();
  assert.equal(result.ok,true,JSON.stringify(result.error));
  assert.equal(result.recovered,true);assert.equal(result.recording.status,'partial');
  assert.equal(result.recording.units.find(unit=>unit.status==='blocked')?.status,'blocked');
  assert.equal(result.failures[0].code,'REQUEST_FAILED');assert.equal(result.reviewHandles.length,1);
  assert.equal(f.controller.candidateStatus(result.reviewHandles[0]).ok,true);
  assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);
  assert.equal(writes,0);assert.equal(f.c.chatMetadata.latticeIntrospection,undefined);
 }finally{f.controller.dispose();}
});

for(const invalidSettings of [false,true])test(`strict failure cannot stop the chat selected by a start activity observer (${invalidSettings?'invalid settings':'guidance overflow'})`,async()=>{
 const graph=reviewGraph({revise:false});
 graph.nodes.guide=node('guide','compose',{outputKind:'guidance',sections:[{name:'Style',text:'Use vivid prose.'}]});
 graph.wires.guide=wire('guide','guide','out','generate','guidance');
 if(invalidSettings)graph.nodes.generate.budgetTokens=0;
 let stops=0,aborts=0;
 const f=nativeFixture(graph,{ports:{getFailurePolicy:()=> 'stop',countTokens:async()=>({tokens:1000000}),stopGeneration:()=>{stops++;return true;}}});
 f.controller.subscribeActivity(activity=>{if(activity)f.c.chatId='other-chat';});
 try{
  f.c.chat.pop();await f.c.eventSource.emit('GENERATION_STARTED','normal',{},false);
  const result=await f.controller.beforeGenerate(f.c.chat,8192,()=>{aborts++;},'normal');
  assert.equal(result.error.code,invalidSettings?'INVALID_SETTINGS':'GUIDANCE_OVERFLOW');
  assert.equal(stops,0,'The old Send cannot stop generation in the newly selected chat');
  assert.equal(aborts,1,'The owned interceptor can still abort the original Send');
  assert.equal(result.failureDisposition,'stop-unavailable');assert.equal(result.fallback,undefined);
  assert.equal(result.recording.status,invalidSettings?'invalid':'failed');
 }finally{f.controller.dispose();}
});

for(const boundary of ['policy','diagnostics','cancel','chat-reference'])test(`native stop ownership precedes the ${boundary} callback`,async()=>{
 const graph=reviewGraph({revise:false});graph.nodes.generate.budgetTokens=0;
 let f,armed=false,stops=0,aborts=0;
 const change=()=>{if(armed){if(boundary==='chat-reference')f.c.chat=[...f.c.chat];else f.c.chatId='other-chat';}};
 f=nativeFixture(graph,{ports:{getFailurePolicy:()=>{if(boundary==='policy')change();return 'stop';},createDiagnosticCapture:()=>{if(boundary==='diagnostics')change();return {};},stopGeneration:()=>{stops++;return true;}}});
 if(boundary==='cancel'||boundary==='chat-reference')f.controller.subscribeActivity(activity=>{if(!activity)change();});
 try{
  f.c.chat.pop();await f.c.eventSource.emit('GENERATION_STARTED','normal',{},false);armed=true;
  const result=await f.controller.beforeGenerate(f.c.chat,8192,()=>{aborts++;},'normal');
  assert.equal(result.error.code,'INVALID_SETTINGS');assert.equal(stops,0);assert.equal(aborts,1);
  assert.equal(result.failureDisposition,'stop-unavailable');assert.equal(result.fallback,undefined);
 }finally{f.controller.dispose();}
});

test('preflight failure without a getter-free stop passport aborts only the owned interceptor',async()=>{
 const graph=reviewGraph({revise:false});graph.nodes.generate.budgetTokens=0;
 let stops=0,aborts=0,reads=0;
 const f=nativeFixture(graph,{ports:{getFailurePolicy:()=> 'stop',stopGeneration:()=>{stops++;return true;}}});
 Object.defineProperty(f.c,'characterId',{get(){reads++;return 1;}});
 Object.defineProperty(f.c,'getCurrentChatId',{get(){reads++;return ()=> 'one';}});
 try{
  f.c.chat.pop();await f.c.eventSource.emit('GENERATION_STARTED','normal',{},false);
  const result=await f.controller.beforeGenerate(f.c.chat,8192,()=>{aborts++;},'normal');
  assert.equal(result.error.code,'INVALID_SETTINGS');assert.equal(stops,0);assert.equal(aborts,1);assert.equal(reads,0);
  assert.equal(result.failureDisposition,'stop-unavailable');assert.equal(result.fallback,undefined);
 }finally{f.controller.dispose();}
});

for(const recover of [false,true])test(`a produced Memory Commit retains accepted settlement checks (${recover?'recovered':'normal'})`,async()=>{
 const graph=reviewGraph({revise:false});
 graph.nodes.state=node('state','memory',{phase:'post'});
 graph.nodes.events=node('events','memory',{view:'events',phase:'post'});
 graph.nodes.track=node('track','state',{mode:'track',phase:'post'});
 graph.nodes.commit=node('commit','memory',{mode:'commit'});
 graph.wires.state=wire('state','state','out','track','state');
 graph.wires.events=wire('events','events','out','track','events');
 graph.wires.commit=wire('commit','track','out','commit','proposal');
 graph.runTargets.push({instancePath:[],nodeId:'commit'});
 if(recover){
  graph.nodes.prompt=node('prompt','text',{text:'Plan this scene.'});
  graph.nodes.failed=node('failed','model-call');
  graph.nodes.guide=node('guide','compose',{outputKind:'guidance',sections:[{name:'optional',text:'Use vivid prose.',onSkipped:'fallback'}]});
  graph.wires.prompt=wire('prompt','prompt','out','failed','prompt');
  graph.wires.optional=wire('optional','failed','out','guide','section.optional');
  graph.wires.guide=wire('guide','guide','out','generate','guidance');
 }
 let writes=0;
 const f=nativeFixture(graph,{ports:{getFailurePolicy:()=> 'continue-available',persistenceVerifier:{saveAndVerify:async()=>{writes++;return {ok:true,data:{acknowledged:true}};}}},request:async()=>({ok:false,error:{code:'REQUEST_FAILED',message:'Synthetic optional failure.'}})});
 f.c.chatMetadata={};f.c.saveMetadata=async()=>{writes++;return true;};
 try{
  const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));
  assert.equal(result.recovered,recover?true:undefined);assert.equal(result.recording.status,recover?'partial':'completed');
  assert.equal(result.reviewHandles.length,1);assert.equal(writes,0);
  const applied=await f.controller.apply(result.reviewHandles[0]);assert.equal(applied.ok,true,JSON.stringify(applied.error));
  assert.equal(applied.settlement.status,'settled');assert.equal(writes,1);
  assert.ok(f.c.chatMetadata.latticeIntrospection);
  assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(writes,1);
 }finally{f.controller.dispose();}
});
