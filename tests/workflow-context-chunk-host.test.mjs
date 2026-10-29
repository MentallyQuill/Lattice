import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {createNativePersistenceVerifier} from '../src/workflow/native-persistence.js?v=0.30.2';
import {createChatDocumentCatalog} from '../src/workflow/document-catalog.js?v=0.30.2';
import {inspectSourceProof} from '../src/workflow/source-provenance.js?v=0.30.2';
import {computeDefinitionIdentity,definitionRefKey} from '../src/workflow/definition-data.js?v=0.30.2';
const hostURL=new URL('../src/workflow/host.js?context-chunk-host-test',import.meta.url).href,proofURL=new URL('../src/workflow/source-provenance.js?v=0.30.2',import.meta.url).href;
const observed=[];globalThis.latticeContextChunkObservation=observed;
const adapter='data:text/javascript,'+encodeURIComponent(`import {createSourceProofRegistry as real} from ${JSON.stringify(proofURL)};export function createSourceProofRegistry(options){const service=real(options);return Object.freeze({...service,retainOutput(payload){const result=service.retainOutput(payload);if(result.ok&&payload.node.operation==='chunk')globalThis.latticeContextChunkObservation.push({payload,service,proof:service.authorizeSource(payload.artifact)});return result;}});}`);
const hook=registerHooks({resolve(specifier,context,next){return context.parentURL===hostURL&&specifier.startsWith('./source-provenance.js')?{url:adapter,shortCircuit:true}:next(specifier,context);}});
const {createNativeWorkflowController}=await import(hostURL);hook.deregister();
const wire=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});
function fixture(){
 let saved,savedChat,saves=0,reads=0;
 const context={chatId:'story',characterId:0,groupId:null,characters:[{avatar:'Mara.png',name:'Mara',chat:'Story',data:{name:'Mara',description:'Private card',visibility:{kind:'actor-private',actorId:'character:Mara.png'}}}],chat:Array.from({length:8},(_,i)=>({mes:`message ${i}`,is_user:i%2===0})),chatMetadata:{},getRequestHeaders:()=>({'Content-Type':'application/json'}),saveMetadata:async()=>{saves++;saved=structuredClone(context.chatMetadata);savedChat=structuredClone(context.chat);}};
 const verifier=createNativePersistenceVerifier({getContext:()=>context,getUserId:()=> 'user',fetch:async()=>{reads++;return {ok:true,text:async()=>JSON.stringify([{chat_metadata:saved},...savedChat])};}});
 const catalog=createChatDocumentCatalog({getContext:()=>context,getUserId:()=> 'user'}),controller=createNativeWorkflowController({context:()=>context,userId:()=> 'user',persistenceVerifier:verifier,documentCatalog:catalog});
 const graph={id:'chunk-host',schema:4,runtime:3,mode:'native-unified',nodes:{scene:{id:'scene',type:'workflow',operation:'scene-context'},chunk:{id:'chunk',type:'workflow',operation:'chunk',operationVersion:1,inputMode:'context',strategy:'assistant-turns'}},wires:{context:wire('context','scene','out','chunk','in'),manifest:wire('manifest','scene','manifest','chunk','sourceManifest')}};
 return {context,controller,graph,counts:()=>({saves,reads})};
}
test('actual native host binds mixed private reader -> Chunk -> Collection and For Each raw arrays',async()=>{
 const f=fixture();assert.equal((await f.controller.setupSources()).ok,true);
 const identity=computeDefinitionIdentity({id:'identity',version:1,name:'Identity',parameters:[],interface:[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'}],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'}},wires:{pass:wire('pass','entry','out','exit','in')}}});assert.equal(identity.ok,true);
 const definition={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash};f.graph.definitions={[definitionRefKey(definition)]:definition};
 f.graph.nodes.collection={id:'collection',type:'workflow',operation:'collection',mode:'count',collectionPath:[]};f.graph.nodes.each={id:'each',type:'workflow',operation:'for-each',helper:{id:definition.id,version:1,semanticHash:definition.semanticHash},limit:8};
 for(const id of ['collection','each'])f.graph.wires[id]=wire(id,'chunk','out',id,'in');
 for(const id of ['collection','each']){observed.length=0;let checked=false;
  const result=await f.controller.runTarget(f.graph,{workflowId:f.graph.id,instancePath:[],nodeId:id,portId:'out'},{onEvent:event=>{if(event.type!=='node-settled'||event.address.nodeId!=='chunk')return;const out=observed.find(o=>o.payload.portId==='out');assert.equal(out.proof.ok,true);const view=inspectSourceProof(out.proof.data);assert.equal(view.ok,true);assert.equal(view.data.mapping.length,4);assert.equal(view.data.mapping[0].sourceOrders.length,0);assert.equal(view.data.mapping[2].sourceOrders.length,6);assert.ok(out.payload.artifact.value.every(r=>r.visibility.kind==='actor-private'));assert.equal(out.service.authorizeSource(structuredClone(out.payload.artifact)).ok,false);checked=true;}});
  assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(checked,true);const value=result.recording.artifacts.filter(a=>a.origin.direction==='output'&&a.kind==='data').at(-1).value.value;if(id==='collection')assert.equal(value,4);else assert.equal(value.length,4);
  assert.doesNotMatch(JSON.stringify(result),/sourceOrders|processedInputs|sourceProofs|triggerCause/);
 }
 assert.deepEqual(f.counts(),{saves:1,reads:1});f.controller.dispose();
});
test('actual before-window reader keeps newest paired turns outside Chunk while preserving character records',async()=>{
 const f=fixture();await f.controller.setupSources();Object.assign(f.graph.nodes.scene,{selection:'before-window',keepRecentAssistantTurns:1});observed.length=0;
 const result=await f.controller.runTarget(f.graph,{workflowId:f.graph.id,instancePath:[],nodeId:'chunk',portId:'out'});assert.equal(result.ok,true,JSON.stringify(result.error));
 const records=observed.find(o=>o.payload.portId==='out').payload.artifact.value;assert.deepEqual(records.map(r=>r.assistantTurnIds.length),[0,0,3]);assert.match(records[2].text,/message 5/);assert.doesNotMatch(records[2].text,/message [67]/);assert.deepEqual(f.counts(),{saves:1,reads:1});f.controller.dispose();
});
