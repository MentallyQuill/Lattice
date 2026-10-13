import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runWorkflowForHost} from '../src/workflow/runtime.js?v=0.27.2';
import {computeDefinitionIdentity,definitionRefKey} from '../src/workflow/definition-data.js?v=0.27.2';
const n=(id,operation,extra={})=>({id,type:'workflow',operation,...extra}),w=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});
function graph(){return {id:'scope-runtime',schema:3,runtime:2,mode:'native-unified',nodes:{source:n('source','text',{text:'{"secret":"private"}'}),decode:n('decode','json-decode'),decision:n('decision','decision',{questions:{present:{type:'noul',instructions:'Is it present?'}}})},wires:{a:w('a','source','out','decode','in'),b:w('b','decode','out','decision','in')}};}
const target={workflowId:'scope-runtime',instancePath:[],nodeId:'decision',portId:'out'};
const ports=()=>({target,resolveBinding:()=>({ok:true,data:{profileId:'p',model:'m'}}),countTokens:async()=>({tokens:1}),request:async()=>({ok:true,data:{text:'{"answers":{"present":{"type":"noul","accepted":true}}}',finish:'stop'}})});
test('native request scope refusal happens before binding, tokenizer or transport effects',async()=>{
 let sideEffects=0;const p={...ports(),resolveBinding:()=>{sideEffects++;return {ok:true,data:{profileId:'p',model:'m'}};},countTokens:()=>{sideEffects++;return {tokens:1};},request:()=>{sideEffects++;}};
 const result=await runWorkflowForHost(graph(),p,{authorizeModelInputs:()=>({ok:false,error:{code:'ACTOR_SCOPE_MISMATCH',message:'Private actor is not authorized.'}})});
 assert.equal(result.ok,false);assert.equal(result.error.code,'ACTOR_SCOPE_MISMATCH');assert.equal(sideEffects,0);assert.equal(result.actualCalls,0);
});
test('every exact normalized root output is retained before downstream disclosure checks',async()=>{
 const retained=new WeakSet();let authorized=0;
 const result=await runWorkflowForHost(graph(),ports(),{retainScopedOutput:({artifact})=>{retained.add(artifact);return {ok:true,data:{retained:true}};},authorizeModelInputs:({inputs})=>{authorized++;assert.equal(retained.has(inputs.in),true);return {ok:true};}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(authorized,3);assert.equal(result.actualCalls,1);
});
test('scope retention failure and post-callback cancellation hold before downstream requests',async()=>{
 for(const cancel of [false,true]){const abort=new AbortController();let requests=0;const result=await runWorkflowForHost(graph(),{...ports(),signal:abort.signal,request:()=>{requests++;}}, {retainScopedOutput:()=>{if(cancel)abort.abort();return cancel?{ok:true,data:{retained:true}}:{ok:false,error:{code:'REVOKED',message:'Revoked.'}};}});assert.equal(result.ok,false);assert.match(result.error.code,/ABORTED|REVOKED/);assert.equal(requests,0);}
});
test('real helper seeds and cloned normalized child outputs retain exact scope before their model legs',async()=>{
 const raw={id:'scope-helper',version:1,name:'Scoped helper',interface:[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'}],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'},select:n('select','select-fields',{phase:'pre',fields:[{name:'secret',path:['secret']}]}),decide:n('decide','decision',{questions:{present:{type:'noul',instructions:'Present?'}}})},wires:{a:w('a','entry','out','select','in'),b:w('b','select','out','decide','in'),c:w('c','decide','out','exit','in')}}};
 const identity=computeDefinitionIdentity(raw);assert.equal(identity.ok,true,JSON.stringify(identity.error));const definition={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:definition.id,version:1,semanticHash:definition.semanticHash};const g=graph();g.nodes.source.text='[{"secret":"a"},{"secret":"b"}]';delete g.nodes.decision;g.nodes.each=n('each','for-each',{helper:ref,limit:2,requestBoundPerIteration:1});g.wires.b=w('b','decode','out','each','in');g.definitions={[definitionRefKey(ref)]:definition};
 const retained=new WeakSet();let checked=0,seeds=0,children=0;
 const result=await runWorkflowForHost(g,{...ports(),target:{...target,nodeId:'each'}},{retainScopedOutput:payload=>{retained.add(payload.artifact);if(payload.seed)seeds++;if(payload.address.instancePath.length)children++;return {ok:true,data:{retained:true}};},authorizeModelInputs:({node,inputs})=>{assert.equal(node.operation,'decision');assert.equal(retained.has(inputs.in),true);checked++;return {ok:true};}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(checked,6);assert.equal(seeds,4);assert.equal(children>=6,true);assert.equal(result.actualCalls,2);
 for(const stop of [false,true]){const abort=new AbortController();let revoked=false,requests=0;const held=await runWorkflowForHost(g,{...ports(),target:{...target,nodeId:'each'},signal:abort.signal,onEvent:event=>{if(event.type==='request-start'){revoked=true;if(stop)abort.abort();}},request:()=>{requests++;return {ok:true,data:{text:'{}',finish:'stop'}};}},{authorizeModelInputs:()=>revoked?{ok:false,error:{code:'STALE_ACTOR_SCOPE',message:'Child changed.'}}:{ok:true}});assert.equal(held.ok,false);assert.match(held.error.code,/ABORTED|STALE_ACTOR_SCOPE/);assert.equal(requests,0);assert.equal(held.actualCalls,0);}

});

test('scope mutation inside tokenizer is held immediately before the actual transport',async()=>{
 let revoked=false,requests=0;
 const result=await runWorkflowForHost(graph(),{...ports(),countTokens:async()=>{revoked=true;return {tokens:1};},request:()=>{requests++;return {ok:true,data:{text:'{}',finish:'stop'}};}},{authorizeModelInputs:()=>revoked?{ok:false,error:{code:'STALE_ACTOR_SCOPE',message:'Changed.'}}:{ok:true}});
 assert.equal(result.ok,false);assert.equal(result.error.code,'STALE_ACTOR_SCOPE');assert.equal(requests,0);assert.equal(result.actualCalls,0);
});


test('request progress callbacks cannot revoke scope and still dispatch',async()=>{
 for(const stop of [false,true]){let revoked=false,requests=0;const abort=new AbortController(),g=graph();
  const result=await runWorkflowForHost(g,{...ports(),signal:abort.signal,onEvent:event=>{if(event.type==='request-start'){revoked=true;if(stop)abort.abort();}},request:()=>{requests++;return {ok:true,data:{text:'{}',finish:'stop'}};}},{authorizeModelInputs:()=>revoked?{ok:false,error:{code:'STALE_ACTOR_SCOPE',message:'Changed at progress.'}}:{ok:true}});
  assert.equal(requests,0);assert.equal(result.ok,false);assert.match(result.error.code,/ABORTED|STALE_ACTOR_SCOPE/);assert.equal(result.actualCalls,0);
 }
});

test('injected request-start clock callbacks cannot revoke scope before transport',async()=>{
 let authorized=0,revoked=false,requests=0;const result=await runWorkflowForHost(graph(),{...ports(),clock:{now:()=>{if(authorized===2)revoked=true;return 1;},monotonic:()=>1},request:()=>{requests++;return {ok:true,data:{text:'{}',finish:'stop'}};}},{authorizeModelInputs:()=>{authorized++;return revoked?{ok:false,error:{code:'STALE_ACTOR_SCOPE',message:'Clock changed scope.'}}:{ok:true};}});assert.equal(result.ok,false);assert.equal(result.error.code,'STALE_ACTOR_SCOPE');assert.equal(requests,0);assert.equal(result.actualCalls,0);
});
