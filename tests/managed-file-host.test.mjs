import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeWorkflowController } from '../src/workflow/host.js?v=0.30.3';
import { createChatDocumentCatalog } from '../src/workflow/document-catalog.js?v=0.30.3';
import { operationDefaults } from '../src/workflow/catalog.js?v=0.30.3';
import { unifiedRecipeHost } from './helpers/unified-recipe-host.mjs';
import { normalizeOccurrences,confirmOccurrences,resolveItemHolders } from '../src/workflow/operations/event-data.js?v=0.30.3';
import {nativeFixture,reviewGraph} from './helpers/native-workflow-fixture.mjs';

test('host adopts an empty legacy own-file destination before strict runtime preflight',async()=>{
 const graph={id:'legacy-file',name:'Legacy file',schema:3,runtime:2,mode:'native-unified',nodes:{text:{id:'text',type:'workflow',operation:'text',text:'Scene context'},write:{id:'write',type:'workflow',operation:'write-file',destinationMode:'own',targetId:'',mode:'append',fileTarget:{name:'SceneContext.txt',format:'text',content:'',visibility:{kind:'hidden'}}}},wires:{w:{id:'w',route:'wire',from:'text',fromPort:'out',to:'write',toPort:'text'}},portals:{},definitions:{},runTargets:[]};
 const authored=structuredClone(graph),c={chatId:'chat',characterId:0,characters:[{name:'Mara'}],chat:[{mes:'Hello',is_user:true}],chatMetadata:{}};
 const catalog=createChatDocumentCatalog({getContext:()=>c,getUserId:()=> 'u'});
 const definitions=[];let writes=0;
 const access={ready:Promise.resolve(),ensureManaged:async definition=>{definitions.push(definition);return {ok:true,data:{...definition,bindingId:'managed-binding',storage:'host'}};},backend:defs=>({lookupHistory:async()=>({ok:true,data:{epoch:0,receipt:null,outcomes:[],clockTurn:null,privateActorIds:[],visibility:{kind:'hidden'}}}),load:async targetId=>{const definition=defs.find(value=>value.targetId===targetId);return {ok:true,data:{targetId,revision:0,format:definition.format,content:definition.content,receipts:[]}};},compareAndSwap:async()=>{writes++;return {ok:true};}})};
 const controller=createNativeWorkflowController({context:()=>c,getGraph:()=>graph,userId:()=> 'u',getWorkflowIdentity:()=> 'library:legacy',nodeFileAccess:access,documentCatalog:catalog,isBusy:()=>false});
 try{
  const result=await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'write',portId:'projection'});
  assert.equal(result.ok,true,JSON.stringify(result.error));
  assert.equal(definitions.length,1);assert.equal(definitions[0].name,'SceneContext.txt');assert.deepEqual(definitions[0].visibility,{kind:'hidden'});
  assert.equal(writes,0,'Preflight and target preview cannot publish file bytes');assert.deepEqual(graph,authored);
 }finally{controller.dispose();}
});

test('a genuine file setup failure stops native generation without fallback or allocation',async()=>{
 const graph=reviewGraph({revise:false});
 graph.nodes.text={id:'text',type:'workflow',operation:'text',text:'Scene context'};
 graph.nodes.write={id:'write',type:'workflow',operation:'write-file',destinationMode:'own',targetId:'',mode:'append',fileTarget:{name:'SceneContext.txt',format:'text',content:'Imported authored template',visibility:{kind:'hidden'}}};
 graph.wires.file={id:'file',route:'wire',from:'text',fromPort:'out',to:'write',toPort:'text'};
 graph.runTargets.push({instancePath:[],nodeId:'write'});
 const authored=structuredClone(graph);let allocations=0,stops=0,aborts=0,requests=0;
 const f=nativeFixture(graph,{ports:{getFailurePolicy:()=> 'stop',stopGeneration:()=>{stops++;return true;},nodeFileAccess:{ensureManaged:async()=>{allocations++;throw Error('An imported template cannot acquire a managed grant.');}}},request:async()=>{requests++;throw Error('Invalid destinations cannot dispatch.');}});
 f.c.chatMetadata={};
 try{
  f.c.chat.pop();await f.c.eventSource.emit('GENERATION_STARTED','normal',{},false);
  const result=await f.controller.beforeGenerate(f.c.chat,8192,()=>{aborts++;},'normal');
  assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_SETUP_REQUIRED');
  assert.equal(result.failurePolicy,'stop');assert.equal(result.failureDisposition,'stopped');assert.equal(result.fallback,undefined);
  assert.equal(stops,1);assert.equal(aborts,1);assert.equal(requests,0);assert.equal(allocations,0);assert.deepEqual(graph,authored);
 }finally{f.controller.dispose();}
});

test('legacy adoption cannot redirect canonical data appearing after planning',async()=>{
 const graph={id:'legacy-race',name:'Legacy file',schema:3,runtime:2,mode:'native-unified',nodes:{text:{id:'text',type:'workflow',operation:'text',text:'Scene context'},write:{id:'write',type:'workflow',operation:'write-file',destinationMode:'own',targetId:'old-scene',mode:'append',fileTarget:{name:'SceneContext.txt',format:'text',content:'',visibility:{kind:'hidden'}}}},wires:{w:{id:'w',route:'wire',from:'text',fromPort:'out',to:'write',toPort:'text'}},portals:{},definitions:{},runTargets:[]};
 const c={chatId:'chat',characterId:0,characters:[{name:'Mara'}],chat:[{mes:'Hello',is_user:true}],chatMetadata:{}};
 const catalog=createChatDocumentCatalog({getContext:()=>c,getUserId:()=> 'u'});let allocations=0;
 const controller=createNativeWorkflowController({context:()=>c,getGraph:()=>graph,userId:()=> 'u',documentCatalog:catalog,nodeFileAccess:{ensureManaged:async()=>{allocations++;return {ok:false,error:{code:'UNEXPECTED_ALLOCATION',message:'Existing canonical data must not be redirected.'}};}},onEvent:event=>{if(event.type==='plan')c.chatMetadata.latticeDocuments={u:{'old-scene':{content:'Preserve canonical scene'}}};},isBusy:()=>false});
 try{
  const result=await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'write',portId:'projection'});
  assert.equal(result.error?.code,'STALE_FILE_SCOPE');assert.equal(allocations,0);
  assert.equal(c.chatMetadata.latticeDocuments.u['old-scene'].content,'Preserve canonical scene');assert.equal(graph.nodes.write.fileTarget.managed,undefined);
 }finally{controller.dispose();}
});

test('legacy adoption rechecks canonical absence after asynchronous provider readiness',async()=>{
 const graph={id:'legacy-ready-race',name:'Legacy file',schema:3,runtime:2,mode:'native-unified',nodes:{text:{id:'text',type:'workflow',operation:'text',text:'Scene context'},write:{id:'write',type:'workflow',operation:'write-file',destinationMode:'own',targetId:'old-scene',mode:'append',fileTarget:{name:'SceneContext.txt',format:'text',content:'',visibility:{kind:'hidden'}}}},wires:{w:{id:'w',route:'wire',from:'text',fromPort:'out',to:'write',toPort:'text'}},portals:{},definitions:{},runTargets:[]};
 const c={chatId:'chat',characterId:0,characters:[{name:'Mara'}],chat:[{mes:'Hello',is_user:true}],chatMetadata:{}};
 const catalog=createChatDocumentCatalog({getContext:()=>c,getUserId:()=> 'u'});let allocations=0;
 const access={ready:{then(resolve){c.chatMetadata.latticeDocuments={u:{'old-scene':{content:'Canonical bytes restored asynchronously'}}};resolve();}},ensureManaged:async()=>{allocations++;return {ok:false,error:{code:'UNEXPECTED_ALLOCATION',message:'Canonical restore must block replacement allocation.'}};}};
 const controller=createNativeWorkflowController({context:()=>c,getGraph:()=>graph,userId:()=> 'u',documentCatalog:catalog,nodeFileAccess:access,isBusy:()=>false});
 try{
  const result=await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'write',portId:'projection'});
  assert.equal(result.error?.code,'STALE_FILE_SCOPE');assert.equal(allocations,0);
  assert.equal(c.chatMetadata.latticeDocuments.u['old-scene'].content,'Canonical bytes restored asynchronously');assert.equal(graph.nodes.write.fileTarget.managed,undefined);
 }finally{controller.dispose();}
});

test('legacy adoption stops later managed grants when another file becomes canonical',async()=>{
 const graph=reviewGraph({revise:false});
 graph.nodes.text={id:'text',type:'workflow',operation:'text',text:'Scene context'};
 for(const id of ['first','second']){
  graph.nodes[id]={id,type:'workflow',operation:'write-file',destinationMode:'own',targetId:'old-'+id,mode:'append',fileTarget:{name:id+'.txt',format:'text',content:'',visibility:{kind:'hidden'}}};
  graph.wires[id]={id,route:'wire',from:'text',fromPort:'out',to:id,toPort:'text'};graph.runTargets.push({instancePath:[],nodeId:id});
 }
 const definitions=[];let providerCurrent;
 const access={ready:Promise.resolve(),ensureManaged:async(definition,options)=>{
  f.c.chatMetadata.latticeDocuments={'default-user':{'old-second':{content:'Restored second file'}}};
  providerCurrent=options.isCurrent();definitions.push(definition);
  return {ok:true,data:{...definition,bindingId:'managed-binding',storage:'host'}};
 }};
 const f=nativeFixture(graph,{ports:{getFailurePolicy:()=> 'stop',stopGeneration:()=>true,nodeFileAccess:access}});f.c.chatMetadata={};
 try{
  f.c.chat.pop();await f.c.eventSource.emit('GENERATION_STARTED','normal',{},false);
  const result=await f.controller.beforeGenerate(f.c.chat,8192,()=>{},'normal');
  assert.equal(result.error?.code,'STALE_FILE_SCOPE');assert.equal(providerCurrent,false);assert.equal(definitions.length,1);
  assert.equal(f.c.chatMetadata.latticeDocuments['default-user']['old-second'].content,'Restored second file');assert.equal(result.fallback,undefined);
 }finally{f.controller.dispose();}
});

test('native generation reaches its boundary with omitted legacy own-file settings under stop policy',async()=>{
 const graph=reviewGraph({revise:false});
 graph.nodes.text={id:'text',type:'workflow',operation:'text',text:'Scene context'};
 graph.nodes.write={id:'write',type:'workflow',operation:'write-file',destinationMode:'own',mode:'append',phase:'post'};
 graph.wires.file={id:'file',route:'wire',from:'text',fromPort:'out',to:'write',toPort:'text'};graph.runTargets.push({instancePath:[],nodeId:'write'});
 const authored=structuredClone(graph),definitions=[];let writes=0,stops=0,aborts=0;
 const access={ready:Promise.resolve(),ensureManaged:async definition=>{definitions.push(definition);return {ok:true,data:{...definition,bindingId:'managed-binding',storage:'host'}};},backend:defs=>({lookupHistory:async()=>({ok:true,data:{epoch:0,receipt:null,outcomes:[],clockTurn:null,privateActorIds:[],visibility:{kind:'hidden'}}}),load:async targetId=>{const definition=defs.find(value=>value.targetId===targetId);return {ok:true,data:{targetId,revision:0,format:definition.format,content:definition.content,receipts:[]}};},compareAndSwap:async()=>{writes++;return {ok:true};}})};
 const f=nativeFixture(graph,{ports:{getFailurePolicy:()=> 'stop',stopGeneration:()=>{stops++;return true;},nodeFileAccess:access}});f.c.chatMetadata={};
 try{
  f.c.chat.pop();await f.c.eventSource.emit('GENERATION_STARTED','normal',{},false);
  const ready=await f.controller.beforeGenerate(f.c.chat,8192,()=>{aborts++;},'normal');
  assert.equal(ready.ok,true,JSON.stringify(ready.error));assert.equal(definitions.length,1);assert.equal(writes,0);assert.equal(stops,0);assert.equal(aborts,0);assert.deepEqual(graph,authored);
 }finally{f.controller.dispose();}
});

for(const protection of ['canonical','catalog','path','binding','template'])test(`legacy preflight preserves ${protection} authority without allocating a replacement`,async()=>{
 const fileTarget={name:'SceneContext.txt',format:'text',content:'',visibility:{kind:'hidden'},...(protection==='path'?{path:'C:\\authored-scene.txt'}:{}),...(protection==='binding'?{bindingId:'imported-ungranted'}:{}),...(protection==='template'?{content:'Authored template'}:{})};
 const graph={id:'protected-file',name:'Protected file',schema:3,runtime:2,mode:'native-unified',nodes:{text:{id:'text',type:'workflow',operation:'text',text:'Scene context'},write:{id:'write',type:'workflow',operation:'write-file',destinationMode:'own',targetId:'old-scene',mode:'append',fileTarget}},wires:{w:{id:'w',route:'wire',from:'text',fromPort:'out',to:'write',toPort:'text'}},portals:{},definitions:{},runTargets:[]};
 const authored=structuredClone(graph),c={chatId:'chat',characterId:0,characters:[{name:'Mara'}],chat:[{mes:'Hello',is_user:true}],chatMetadata:protection==='canonical'?{latticeDocuments:{u:{'old-scene':{content:'Canonical bytes'}}}}:{}};
 const catalog=createChatDocumentCatalog({getContext:()=>c,getUserId:()=> 'u'});let allocations=0;
 if(protection==='catalog')assert.equal(catalog.define({targetId:'old-scene',name:'Existing scene',format:'text',content:'Saved template',visibility:{kind:'hidden'}}).ok,true);
 const access={ensureManaged:async()=>{allocations++;throw Error('Protected authority cannot acquire a replacement grant.');},backend:()=>({load:async()=>({ok:false,error:{code:'FILE_BINDING_MISSING',message:'Imported grants require explicit local authorization.'}})})};
 const controller=createNativeWorkflowController({context:()=>c,getGraph:()=>graph,userId:()=> 'u',nodeFileAccess:access,documentCatalog:catalog,isBusy:()=>false});
 try{
  const result=await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'write',portId:'projection'});
  assert.equal(result.ok,false);assert.equal(result.error.code,protection==='binding'?'FILE_BINDING_MISSING':'FILE_SETUP_REQUIRED');
  assert.equal(allocations,0);assert.deepEqual(graph,authored);
 }finally{controller.dispose();}
});
test('host provisions a trusted managed destination before staging and retains authored intent',async()=>{
 const graph={id:'untrusted-authored-id',name:'File',schema:3,runtime:2,mode:'native-unified',nodes:{text:{id:'text',type:'workflow',operation:'text',text:'Hello'},write:{id:'write',type:'workflow',...operationDefaults('write-file',{managedFiles:true})}},wires:{w:{id:'w',route:'wire',from:'text',fromPort:'out',to:'write',toPort:'text'}},portals:{},definitions:{},runTargets:[]};
 const c={chatId:'chat',characterId:0,characters:[{name:'Mara'}],chat:[{mes:'Hello',is_user:true}],chatMetadata:{}};
 const catalog=createChatDocumentCatalog({getContext:()=>c,getUserId:()=> 'u'});
 let writes=0,definitions=[];
 const access={ready:Promise.resolve(),ensureManaged:async definition=>{definitions.push(definition);return {ok:true,data:{...definition,bindingId:'managed-binding',storage:'host'}};},backend:defs=>({lookupHistory:async()=>({ok:true,data:{epoch:0,receipt:null,outcomes:[],clockTurn:null,privateActorIds:[],visibility:{kind:'public'}}}),load:async targetId=>{const definition=defs.find(value=>value.targetId===targetId);return {ok:true,data:{targetId,revision:0,format:definition.format,content:definition.content,receipts:[]}};},compareAndSwap:async()=>{writes++;return {ok:true};}})};
 const controller=createNativeWorkflowController({context:()=>c,getGraph:()=>graph,userId:()=> 'u',getWorkflowIdentity:()=> 'library:trusted',nodeFileAccess:access,documentCatalog:catalog,isBusy:()=>false});
 const result=await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'write',portId:'projection'});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(definitions.length,1);
 assert.equal(definitions[0].name,'Write to File.txt');
 assert.equal(writes,0);
 assert.deepEqual(graph.nodes.write.fileTarget,{managed:true});
 catalog.define({targetId:'lattice-default-clock',name:'Legacy reserved data',format:'json',content:'[]',visibility:{kind:'public'}});
 graph.nodes.clock={id:'clock',type:'workflow',...operationDefaults('story-clock',{managedFiles:true})};
 const clock=await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'clock',portId:'out'});
 assert.equal(clock.ok,true,JSON.stringify(clock.error));
 assert.equal(definitions.length,2);
 assert.equal(JSON.parse(definitions[1].content).clockId,definitions[1].targetId);
 assert.equal(writes,0);
 graph.nodes.source={id:'source',type:'workflow',operation:'text',text:'[{"id":1}]'};
 graph.nodes.records={id:'records',type:'workflow',operation:'json-decode'};
 graph.nodes.structured={id:'structured',type:'workflow',...operationDefaults('write-file',{managedFiles:true})};
 graph.wires.decode={id:'decode',route:'wire',from:'source',fromPort:'out',to:'records',toPort:'in'};
 graph.wires.structured={id:'structured',route:'wire',from:'records',fromPort:'out',to:'structured',toPort:'records'};
 for(const fileHandling of ['replace','append']){
  graph.nodes.structured.fileHandling=fileHandling;
  const structured=await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'structured',portId:'projection'});
  assert.equal(structured.ok,true,JSON.stringify(structured.error));
  assert.equal(definitions.at(-1).format,'json');
  assert.equal(definitions.at(-1).content,'[]');
 }
 const allocated=definitions.length;
 graph.wires.ambiguous={id:'ambiguous',route:'wire',from:'source',fromPort:'out',to:'structured',toPort:'text'};
 const ambiguous=await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'structured',portId:'projection'});
 assert.equal(ambiguous.error.code,'AMBIGUOUS_FILE_INPUT');
 assert.equal(definitions.length,allocated);
 controller.dispose();
});

function mixedOutcomeGraph(fileTarget){
 const playerText='Mara uses her wand.',source={sourceId:'player-turn',revision:'1',sceneId:'Story-2',watch:'player-message',text:playerText,visibility:'public'};
 const candidates=normalizeOccurrences(source,[{eventType:'item-used',actorId:'mara',itemId:'wand',position:{start:0,end:playerText.length},semantics:'actual'}],{actorIds:['mara'],itemIds:['wand']}).data.events;
 const events=resolveItemHolders({wand:'mara'},confirmOccurrences(candidates,[{eventId:candidates[0].eventId,accepted:true}]).data.events).data.events;
 const graph={id:'mixed-outcomes',name:'Mixed outcomes',schema:3,runtime:2,mode:'native-unified',nodes:{},wires:{},portals:{},definitions:{},runTargets:['review','commit'].map(nodeId=>({instancePath:[],nodeId}))};
 const node=(id,operation,extra={})=>graph.nodes[id]={id,type:'workflow',...operationDefaults(operation),...extra};
 const wire=(id,from,fromPort,to,toPort)=>graph.wires[id]={id,route:'wire',from,fromPort,to,toPort};
 node('send','on-send');node('generate','generate-reply');node('review','review-publish');
 wire('activation','send','activation','generate','activation');wire('reply','generate','draft','review','draft');
 for(const [id,value] of Object.entries({events,library:{libraryId:'wand',revision:'1',itemId:'wand',effects:[{id:'sparks',kind:'fixed',weight:1,description:'Blue sparks appear.'}]}})){
  node(id+'-text','text',{text:JSON.stringify(value)});node(id,'json-decode');wire(id+'-parse',id+'-text','out',id,'in');
 }
 node('pick','random-pick',operationDefaults('random-pick',{managedFiles:true}));node('commit','commit-outcomes',{targetId:'existing-ledger',...(fileTarget?{fileTarget}:{})});
 wire('events','events','out','pick','events');wire('library','library','out','pick','library');wire('commit','pick','out','commit','outcomes');
 return {graph,playerText};
}
test('managed Pick reuses an existing connected commit ledger after reload without allocating a new file',async()=>{
 const {graph,playerText}=mixedOutcomeGraph();
 let draws=0,allocations=0;
 const access={ready:Promise.resolve(),ensureManaged:async definition=>{allocations++;return {ok:true,data:{...definition,bindingId:definition.targetId}};},backend:definitions=>({
  async load(targetId){const definition=definitions.find(value=>value.targetId===targetId);return {ok:true,data:{targetId,revision:0,format:definition.format,content:definition.content,receipts:[]}};},
  async lookupHistory(){return {ok:true,data:{epoch:0,receipt:null,clockTurn:null,outcomes:[],privateActorIds:[],visibility:{kind:'public'}}};},
  async compareAndSwap(){throw Error('The existing catalog ledger owns the accepted write.');}
 })};
 const create=chatMetadata=>unifiedRecipeHost(graph,{playerText,documents:[{targetId:'existing-ledger',name:'Existing accepted outcomes',format:'json',content:'[]',visibility:{kind:'public'}}],random:()=>{draws++;return .9;},ports:{nodeFileAccess:access,getWorkflowIdentity:()=> 'library:mixed'},configureContext:c=>{if(chatMetadata)c.chatMetadata=structuredClone(chatMetadata);}});
 const first=create(),result=await first.generate('Blue sparks appear.');assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal((await first.controller.apply(result.reviewHandles[0])).ok,true);
 const saved=structuredClone(first.c.chatMetadata);first.controller.dispose();
 const second=create(saved),replayed=await second.generate('Blue sparks appear.');assert.equal(replayed.ok,true,JSON.stringify(replayed.error));assert.equal((await second.controller.apply(replayed.reviewHandles[0])).ok,true);second.controller.dispose();
 assert.equal(draws,1);
 assert.equal(allocations,0);
 assert.equal(JSON.parse(second.c.chatMetadata.latticeDocuments['default-user']['existing-ledger'].content).length,1);
});

test('mixed lineage uses a checked existing disk binding and rejects an imported binding before allocation',async()=>{
 const fileTarget={bindingId:'checked-file',name:'Existing outcomes.json',format:'json',missing:'error',content:'[]',visibility:{kind:'public'}};
 const {graph,playerText}=mixedOutcomeGraph(fileTarget);
 let allocations=0,draws=0,writes=0;const saved=new Map();
 const access={ready:Promise.resolve(),ensureManaged:async()=>{allocations++;throw Error('No allocation for an existing file.');},backend:definitions=>({
  async load(targetId){const definition=definitions.find(value=>value.targetId===targetId);if(definition?.bindingId!=='checked-file')return {ok:false,error:{code:'FILE_BINDING_MISSING',message:'No captured grant.'}};return {ok:true,data:saved.get(targetId)??{targetId,revision:0,format:'json',content:'[]',receipts:[]}};},
  async lookupHistory(){return {ok:true,data:{epoch:0,receipt:null,clockTurn:null,outcomes:[],privateActorIds:[],visibility:{kind:'public'}}};},
  async compareAndSwap(update){const previous=saved.get(update.targetId),revision=(previous?.revision??0)+1;saved.set(update.targetId,{targetId:update.targetId,revision,...update.projectedDocument,receipts:[...(previous?.receipts??[]),{intentId:update.intentId,fingerprint:update.fingerprint,revision}]});writes++;return {ok:true,data:{applied:true,acknowledged:true,revision}};}
 })};
 const create=()=>unifiedRecipeHost(graph,{playerText,random:()=>{draws++;return .9;},ports:{nodeFileAccess:access,getWorkflowIdentity:()=> 'library:mixed-file'}});
 const first=create(),result=await first.generate('Blue sparks appear.');assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal((await first.controller.apply(result.reviewHandles[0])).ok,true);first.controller.dispose();
 const second=create(),replayed=await second.generate('Blue sparks appear.');assert.equal(replayed.ok,true,JSON.stringify(replayed.error));assert.equal((await second.controller.apply(replayed.reviewHandles[0])).ok,true);second.controller.dispose();
 assert.equal(draws,1);assert.equal(writes,1);assert.equal(allocations,0);
 graph.nodes.commit.fileTarget={...fileTarget,bindingId:'imported-unknown'};
 const imported=create(),denied=await imported.generate('No accepted output.');assert.equal(denied.ok,false);assert.equal(denied.error.code,'FILE_BINDING_MISSING');imported.controller.dispose();
 assert.equal(draws,1);assert.equal(allocations,0);assert.equal(writes,1);
});
