import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeWorkflowController } from '../src/workflow/host.js?v=0.29.0';
import { createChatDocumentCatalog } from '../src/workflow/document-catalog.js?v=0.29.0';
import { operationDefaults } from '../src/workflow/catalog.js?v=0.29.0';
import { unifiedRecipeHost } from './helpers/unified-recipe-host.mjs';
import { normalizeOccurrences,confirmOccurrences,resolveItemHolders } from '../src/workflow/operations/event-data.js?v=0.29.0';
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
