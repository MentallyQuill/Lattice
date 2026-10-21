import {createNativeSourceSetup} from '../src/ui/native-source-setup.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {describeOperation,describeAuthoredOperation} from '../src/workflow/catalog.js?v=0.27.5';
import {expandRecordAddress} from '../src/workflow/record-data.js?v=0.27.5';
import {createNativeWorkflowController} from '../src/workflow/host.js?v=0.27.5';
import {createNativePersistenceVerifier} from '../src/workflow/native-persistence.js?v=0.27.5';
import {createChatDocumentCatalog} from '../src/workflow/document-catalog.js?v=0.27.5';
const wire=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});
function fixture(){
 let saved,savedChat,saves=0,reads=0;
 const context={chatId:'foundation-story',characterId:0,groupId:null,characters:[{avatar:'Mara.png',name:'Mara',chat:'Foundation Story',data:{name:'Mara',description:'An archivist.'}}],chat:Array.from({length:26},(_,i)=>({name:i%2?'Mara':'User',mes:(i%2?'Assistant':'User')+' passage '+(Math.floor(i/2)+1)+'.',is_user:i%2===0,is_system:false})),chatMetadata:{},getRequestHeaders:()=>({'Content-Type':'application/json'}),saveMetadata:async()=>{saves++;saved=structuredClone(context.chatMetadata);savedChat=structuredClone(context.chat);}};
 const ports={getContext:()=>context,getUserId:()=> 'foundation-user'},persistenceVerifier=createNativePersistenceVerifier({...ports,fetch:async()=>{reads++;return {ok:true,text:async()=>JSON.stringify([{chat_metadata:saved},...savedChat])};}}),documentCatalog=createChatDocumentCatalog(ports),controller=createNativeWorkflowController({context:ports.getContext,userId:ports.getUserId,persistenceVerifier,documentCatalog});
 const graph={id:'foundation-source-chunk',schema:4,runtime:3,mode:'native-unified',nodes:{scene:{id:'scene',type:'workflow',operation:'scene-context',selection:'before-window',activationMode:'root',keepRecentAssistantTurns:10,maxMessages:1000,maxTextUnits:100000,includeCharacter:false,visibilityMode:'public'},chunk:{id:'chunk',type:'workflow',operation:'chunk',operationVersion:1,inputMode:'context',strategy:'assistant-turns',turnsPerChunk:3,overlap:0,maxChunks:32}},wires:{context:wire('context','scene','out','chunk','in'),manifest:wire('manifest','scene','manifest','chunk','sourceManifest')}};
 return {context,controller,graph,counts:()=>({saves,reads})};
}
test('foundation native reader groups the older three verified turns while the newest ten stay raw',async()=>{
 const f=fixture();try{
  assert.equal(typeof f.controller.setupSources,'function','Native source setup must be part of the real controller.');assert.equal((await f.controller.setupSources()).ok,true);
  const result=await f.controller.runTarget(f.graph,{workflowId:f.graph.id,instancePath:[],nodeId:'chunk',portId:'out'});assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,0);
  const records=result.recording.artifacts.filter(a=>a.origin.direction==='output'&&a.kind==='data'&&expandRecordAddress(result.recording,a.origin.address).nodeId==='chunk').map(a=>a.value.value).find(Array.isArray);assert.ok(Array.isArray(records));assert.equal(records.length,1);assert.equal(records[0].assistantTurnIds.length,3);assert.equal(records[0].sourceRefs.length,6);
  for(let turn=1;turn<=3;turn++){assert.ok(records[0].text.includes('User passage '+turn+'.'));assert.ok(records[0].text.includes('Assistant passage '+turn+'.'));}
  for(let turn=4;turn<=13;turn++)assert.equal(records[0].text.includes('passage '+turn+'.'),false);
  assert.deepEqual(f.counts(),{saves:1,reads:1});assert.equal(Object.hasOwn(f.controller,'setupWorkflowJobs'),false);
 }finally{f.controller.dispose();}
});

for(const [label,extra] of [
 ['events',{activationMode:'events'}],['cursor',{selection:'since-cursor'}],['range',{selection:'range',firstSourceId:'first',lastSourceId:'last'}],['confirmed',{confirmed:true}],['protected frontier',{protectRecentWindow:true}],['append rebase',{allowAppendRebase:true}],['range start',{firstSourceId:'first'}],['range end',{lastSourceId:'last'}]
])test('foundation rejects deferred source '+label+' before native IO',async()=>{
 const f=fixture();try{
  Object.assign(f.graph.nodes.scene,extra);
  for(const describe of [describeOperation,describeAuthoredOperation]){const result=describe(f.graph,f.graph.nodes.scene);assert.equal(result.ok,false,label);assert.equal(result.error.code,'UNSUPPORTED_FOUNDATION_CAPABILITY');}
  const result=await f.controller.runTarget(f.graph,{workflowId:f.graph.id,instancePath:[],nodeId:'chunk',portId:'out'});assert.equal(result.ok,false);assert.deepEqual(f.counts(),{saves:0,reads:0});assert.equal(result.actualCalls,0);
 }finally{f.controller.dispose();}
});
test('foundation source reader exposes no deferred cursor or event ports',()=>{
 const f=fixture();try{const result=describeOperation(f.graph,f.graph.nodes.scene);assert.equal(result.ok,true);assert.deepEqual(result.data.ports.map(p=>p.id),['out','records','manifest','report']);}finally{f.controller.dispose();}
});

test('explicit UI source setup calls the actual native save and readback only after the current action',async()=>{
 const f=fixture(),document={};try{const setup=createNativeSourceSetup({controller:()=>f.controller,documentToken:()=>document}),view=setup.snapshot();assert.equal(view.status,'setup-required');assert.deepEqual(f.counts(),{saves:0,reads:0});assert.equal((await setup.execute(view.key,'setup')).ok,true);assert.deepEqual(f.counts(),{saves:1,reads:1});assert.equal(setup.snapshot().status,'acknowledged');}finally{f.controller.dispose();}
});
