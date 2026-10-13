import assert from 'node:assert/strict';
import {test} from 'node:test';
import {computeDefinitionIdentity,definitionRefKey} from '../src/workflow/definition-data.js?v=0.27.2';
import {runWorkflow,runWorkflowForHost} from '../src/workflow/runtime.js?v=0.27.2';
const edge=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});
const node=(id,operation,extra={})=>({id,type:'workflow',operation,...extra});
function fixture(operation='decision',items='[{"item":1},{"item":2}]',extra={}) {
 const raw={id:'helper',version:1,name:'Decide each item',interface:[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'}],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',roles:{decision:{profileId:'helper-profile',model:'helper-model'}},nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'},decide:node('decide',operation,{questions:{answer:{type:'noul',instructions:'Is this item present?'}},...extra})},wires:{a:edge('a','entry','out','decide','in'),b:edge('b','decide','out','exit','in')}}};
 const identity=computeDefinitionIdentity(raw);assert.equal(identity.ok,true,JSON.stringify(identity.error));const def={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:def.id,version:def.version,semanticHash:def.semanticHash};
 const root={id:'root',schema:3,runtime:2,mode:'native-unified',roles:{decision:{profileId:'root-profile',model:'root-model'}},definitions:{[definitionRefKey(ref)]:def},nodes:{items:node('items','text',{text:items}),decode:node('decode','json-decode'),each:node('each','for-each',{helper:ref,limit:2,requestBoundPerIteration:1})},wires:{a:edge('a','items','out','decode','in'),b:edge('b','decode','out','each','in')}};
 return {root,def,ref,target:{workflowId:'root',instancePath:[],nodeId:'each',portId:'out'}};
}
test('runtime executes actual pinned model helpers with inherited binding and shared recording',async()=>{
 const f=fixture(),seen=[],binding={profileId:'helper-profile',model:'helper-model'};let requests=0;
 const result=await runWorkflow(f.root,{target:f.target,resolveBinding:(n,g,at)=>{seen.push({n,g,at});return {ok:true,data:binding};},countTokens:async()=>({tokens:1}),request:async options=>{requests++;assert.equal(options.binding,binding);return {ok:true,data:{text:'{"answers":{"answer":{"type":"noul","accepted":true}}}',finish:'stop'}};}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,2);assert.equal(requests,2);assert.equal(seen.length,2);assert.equal(seen[0].n.profileId,'helper-profile');assert.deepEqual(seen[1].at.instancePath,['each','iteration-1']);assert.equal(result.recording.units.find(unit=>unit.attempts)?.attempts,2);assert.equal(result.recording.units.length,3);assert.equal(JSON.stringify(result.recording).includes('iteration-item-data'),false);
});
test('runtime validates missing real helper even for empty collections before source effects',async()=>{
 const f=fixture('decision','[]');f.root.definitions={};let effects=0;
 const result=await runWorkflow(f.root,{target:f.target,onStage:()=>effects++,resolveBinding:()=>{effects++;},request:()=>{effects++;},countTokens:()=>{effects++;}});
 assert.equal(result.ok,false);assert.equal(effects,0);assert.equal(result.actualCalls,0);assert.match(result.error.code,/DEFINITION/);
});
test('real Decision helpers retain exact private binding at native settlement',async()=>{
 const f=fixture('decision','[{"item":1}]'),binding={profileId:'helper-profile',model:'helper-model'},captured=[];let requests=0;
 f.root.nodes.send=node('send','on-send');f.root.nodes.generate=node('generate','generate-reply');f.root.nodes.review=node('review','review-publish');f.root.nodes.guide=node('guide','compose',{outputKind:'guidance',mode:'template',template:'Decision {{data:}}',sections:[]});Object.assign(f.root.wires,{c:edge('c','each','out','guide','data'),d:edge('d','guide','out','generate','guidance'),e:edge('e','send','activation','generate','activation'),r:edge('r','generate','draft','review','draft')});
 const result=await runWorkflowForHost(f.root,{resolveBinding:()=>({ok:true,data:binding}),request:async options=>{requests++;assert.equal(options.binding,binding);return {ok:true,data:{text:'{"answers":{"answer":{"type":"noul","accepted":true}}}',finish:'stop',usage:{input_tokens:2,output_tokens:1}}};},countTokens:async()=>({tokens:1})},{executeHostOperation(n,inputs,local){if(n.operation==='on-send')return {ok:true,outputs:{activation:{kind:'data',value:{}}}};if(n.operation==='generate-reply'){captured.push(...local.getRequestBindings());return {ok:true,outputs:{draft:{kind:'draft',text:'Native.',source:{token:'native',originalText:'Native.'}},metadata:{kind:'data',value:{}}}};}throw Error('Unexpected host node');},settle:()=>({ok:true})});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(requests,1);assert.equal(result.actualCalls,1);assert.equal(captured.length,1);assert.equal(captured[0].binding,binding);assert.equal(captured[0].capability,'text-completion');assert.equal(captured[0].iteration.childAddress.nodeId,'decide');assert.equal(JSON.stringify(result.recording).includes('helper-model'),true);
});

test('real Decision helper honors its explicit fixed binding and counts one attempt',async()=>{
 const f=fixture('decision','[{"item":1}]',{profileId:'fixed-profile',model:'fixed-model'}),binding={profileId:'fixed-profile',model:'fixed-model'},selected=[];let requests=0;
 const result=await runWorkflow(f.root,{target:f.target,resolveBinding:n=>{selected.push(n);return {ok:true,data:binding};},countTokens:async()=>({tokens:1}),request:async options=>{requests++;assert.equal(options.binding,binding);return {ok:true,data:{text:'{"answers":{"answer":{"type":"noul","accepted":true}}}',finish:'stop'}};}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,1);assert.equal(requests,1);assert.equal(selected[0].profileId,'fixed-profile');assert.equal(selected[0].modelRole,'decision');assert.equal(selected[0].model,'fixed-model');
});

test('nested real pinned helpers retain nested request bounds and exact Decision child addresses',async()=>{
 const f=fixture('decision','[[{"item":1}],[{"item":2}]]'),outerRaw={id:'outer',version:1,name:'Outer',interface:f.def.interface,parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'},nested:node('nested','for-each',{helper:f.ref,limit:2,requestBoundPerIteration:1})},wires:{a:edge('a','entry','out','nested','in'),b:edge('b','nested','out','exit','in')}}};
 const identity=computeDefinitionIdentity(outerRaw);assert.equal(identity.ok,true,JSON.stringify(identity.error));const def={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:def.id,version:1,semanticHash:def.semanticHash};f.root.definitions[definitionRefKey(ref)]=def;f.root.nodes.each.helper=ref;f.root.nodes.each.requestBoundPerIteration=2;
 const seen=[],events=[];const result=await runWorkflow(f.root,{target:f.target,onEvent:event=>events.push(event),resolveBinding:(n,g,at)=>{seen.push(at);return {ok:true,data:{profileId:'helper-profile',model:'helper-model'}};},countTokens:async()=>({tokens:1}),request:async()=>({ok:true,data:{text:'{"answers":{"answer":{"type":"noul","accepted":true}}}',finish:'stop',usage:{input_tokens:1,output_tokens:1}}})});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,2);assert.deepEqual(seen.map(at=>at.instancePath),[['each','iteration-0','nested','iteration-0'],['each','iteration-1','nested','iteration-0']]);
 const requests=events.filter(event=>event.type==='request-start');assert.equal(requests.length,2);assert.equal(requests.every(event=>event.iteration?.childAddress?.instancePath.length===4),true);
});
