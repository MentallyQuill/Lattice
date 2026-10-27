import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {presentFailureNotification} from '../src/ui/failure-notification.js';
import {runWorkflow} from '../src/workflow/runtime.js';
import {decodeJson} from '../src/workflow/operations/json-decode.js';
const source=fs.readFileSync(new URL('../src/run.js', import.meta.url),'utf8');
const start=source.indexOf('onResult: ');const expression=start<0?source.trim():source.slice(start+'onResult: '.length,source.indexOf('\n    });',start)).trim().replace(/,$/,'');
function fixture(){const calls=[],events=[],kinds=[];const scope={console:{info(){}},presentFailureNotification,safe:fn=>{try{return fn();}catch{}},toastr:{error(...args){calls.push(args);kinds.push('error');},info(...args){calls.push(args);kinds.push('info');},warning(...args){calls.push(args);kinds.push('warning');}},document:{dispatchEvent(event){events.push(event.type);}},CustomEvent:class{constructor(type){this.type=type;}}};return {calls,events,kinds,onResult:vm.runInNewContext('('+expression+')',scope)};}
const automatic={kind:'send',phase:'unified',runId:'synthetic'};

// Dropping recording metadata from presentation hides the actual failing node and retry count.
test('schema toast names the executed node and its own attempts with the concrete field constraint',async()=>{
 const graph={id:'notification',schema:3,runtime:2,mode:'native-unified',nodes:{
  source:{id:'source',type:'workflow',operation:'text',text:'PRIVATE PROMPT'},
  model:{id:'model',type:'workflow',operation:'model-call',title:'2 | Choose outward portrayal',outputKind:'data',maxRetries:2,
   schema:JSON.stringify({type:'object',properties:{portrayalBrief:{type:'object',properties:{contribution:{type:'string',maxLength:280}}}}})}
 },wires:{input:{id:'input',route:'wire',from:'source',fromPort:'out',to:'model',toPort:'prompt'}}};
 const result=await runWorkflow(graph,{runId:'notification-run',target:{workflowId:graph.id,instancePath:[],nodeId:'model',portId:'out'},
  resolveBinding:()=>({ok:true,data:{profileId:'fixed',model:'fake'}}),countTokens:async()=>({tokens:4}),
  request:async()=>({ok:true,data:{text:JSON.stringify({portrayalBrief:{contribution:'x'.repeat(322)}}),finish:'stop'}})});
 assert.equal(result.error.code,'SCHEMA_MISMATCH');assert.equal(result.actualCalls,2);
 graph.nodes.model.title='Later renamed node';
 const f=fixture();f.onResult(result,automatic);const message=f.calls[0][0];
 assert.match(message,/2 \| Choose outward portrayal/);assert.match(message,/after 2 attempts/);
 assert.match(message,/\/portrayalBrief\/contribution/);assert.match(message,/at most 280 characters; got 322/);
 assert.doesNotMatch(message,/Later renamed|PRIVATE PROMPT|xxxxxxxx/);
});

// Resolving by nodeId alone chooses the wrong reusable workflow instance.
test('nested failures identify their instance and count only that qualified node’s attempts',()=>{
 const result={ok:false,runId:'nested',actualCalls:8,error:{code:'INVALID_JSON',address:{workflowId:'wf',instancePath:['right'],nodeId:'model'}},
  recording:{runId:'nested',identities:{strings:['wf','left','right','model'],paths:[null,[0,1],[0,2]],addresses:[[0,1,3],[0,2,3]]},
   units:[{address:0,included:true,label:'Left model',attempts:3},{address:1,included:true,label:'Right model',attempts:1}]}};
 const f=fixture();f.onResult(result,automatic);const message=f.calls[0][0];
 assert.match(message,/Right model/);assert.match(message,/right\/model/);assert.match(message,/after 1 attempt\b/);
 assert.doesNotMatch(message,/Left model|after [238] attempts/);
});

// A binding failure happens before dispatch, regardless of the node's retry budget.
test('preflight failure explains that no model request was made',async()=>{
 const graph={id:'preflight',schema:3,runtime:2,mode:'native-unified',nodes:{
  source:{id:'source',type:'workflow',operation:'text',text:'Prompt'},
  model:{id:'model',type:'workflow',operation:'model-call',title:'Assess the scene',maxRetries:2}
 },wires:{input:{id:'input',route:'wire',from:'source',fromPort:'out',to:'model',toPort:'prompt'}}};
 const result=await runWorkflow(graph,{runId:'preflight',target:{workflowId:graph.id,instancePath:[],nodeId:'model',portId:'out'},
  resolveBinding:()=>({ok:false,error:{code:'PROFILE_MISSING',message:'PRIVATE binding error'}})});
 assert.equal(result.actualCalls,0);assert.equal(result.error.code,'PROFILE_MISSING');
 const f=fixture();f.onResult(result,automatic);const message=f.calls[0][0];
 assert.match(message,/Assess the scene/);assert.match(message,/before any model request/);
 assert.doesNotMatch(message,/after \d+ attempts?|PRIVATE/);
});

// A configured model output budget should be actionable when the provider reports a cutoff.
test('truncated output reports the captured node output token limit',async()=>{
 const graph={id:'cutoff',schema:3,runtime:2,mode:'native-unified',nodes:{
  source:{id:'source',type:'workflow',operation:'text',text:'Prompt'},
  model:{id:'model',type:'workflow',operation:'model-call',title:'Assess the scene',maxTokens:2304}
 },wires:{input:{id:'input',route:'wire',from:'source',fromPort:'out',to:'model',toPort:'prompt'}}};
 const result=await runWorkflow(graph,{runId:'cutoff',target:{workflowId:graph.id,instancePath:[],nodeId:'model',portId:'out'},
  resolveBinding:()=>({ok:true,data:{profileId:'fixed',model:'fake'}}),countTokens:async()=>({tokens:4}),
  request:async()=>({ok:false,error:{code:'TRUNCATED_OUTPUT',message:'PRIVATE response',finish:'length'}})});
 assert.equal(result.ok,false);assert.equal(result.error?.code,'TRUNCATED_OUTPUT');
 const f=fixture();f.onResult(result,automatic);const message=f.calls[0][0];
 assert.match(message,/Assess the scene/);assert.match(message,/after 1 attempt\b/);assert.match(message,/Output tokens: 2304/);
 assert.doesNotMatch(message,/PRIVATE/);
});

// Metadata without a matching run identity can belong to an unrelated historical run.
test('unowned recording metadata is never attributed to a new failure',()=>{
 const recording={identities:{strings:['wf','model'],paths:[null],addresses:[[0,0,1]]},
  units:[{address:0,included:true,label:'Wrong historical label',attempts:99}]};
 for(const result of [
  {ok:false,error:{code:'INVALID_JSON',nodeId:'model'},recording},
  {ok:false,runId:'new',error:{code:'INVALID_JSON',nodeId:'model'},recording:{...recording,runId:'old'}}
 ]){
  const f=fixture();f.onResult(result,automatic);
  assert.match(f.calls[0][0],/INVALID_JSON.*not valid JSON/);assert.doesNotMatch(f.calls[0][0],/Wrong historical label|99 attempts/);
 }
});

// A malformed count must not execute user hooks or turn a notification into an exception.
test('malformed recording fields cannot invoke accessors or numeric conversion hooks',()=>{
 let hooks=0;
 const unit={address:0,included:true,attempts:0,requestBound:{valueOf(){hooks++;throw new Error('PRIVATE');}}};
 Object.defineProperty(unit,'label',{get(){hooks++;throw new Error('PRIVATE');}});
 const result={ok:false,runId:'malformed',error:{code:'PROFILE_MISSING',nodeId:'model'},recording:{runId:'malformed',
  identities:{strings:['wf','model'],paths:[null],addresses:[[0,0,1]]},units:[unit]}};
 const f=fixture();assert.doesNotThrow(()=>f.onResult(result,automatic));
 assert.equal(hooks,0);assert.match(f.calls[0][0],/PROFILE_MISSING/);assert.doesNotMatch(f.calls[0][0],/PRIVATE|before any/);
});

test('malformed recording addresses never execute conversion hooks',()=>{
 let hooks=0;
 const invalid={toString(){hooks++;return '0';}};
 for(const [index,tuple,paths] of [[invalid,[0,0,1],[null]],[0,[invalid,0,1],[null]],[0,[0,1,1],[null,[invalid,0]]]]){
  const result={ok:false,runId:'malformed-address',error:{code:'INVALID_JSON',nodeId:'model'},recording:{runId:'malformed-address',
   identities:{strings:['wf','model'],paths,addresses:[tuple]},units:[{address:index,included:true,label:'Wrong label',attempts:1}]}};
  const f=fixture();f.onResult(result,automatic);
  assert.equal(hooks,0);assert.doesNotMatch(f.calls[0][0],/Wrong label|after 1 attempt/);assert.match(f.calls[0][0],/INVALID_JSON/);
 }
});

test('schema findings stay bounded and omit arbitrary messages and rejected values',()=>{
 const f=fixture();f.onResult({ok:false,error:{code:'SCHEMA_MISMATCH',message:'PRIVATE response',nodeId:'model',findings:[
  {path:'',keyword:'required',message:'PRIVATE malicious finding',value:'PRIVATE value'},
  {path:'/pressures',keyword:'maxItems',message:'Expected at most 2 items; got 3.'},
  {path:'/third-field',keyword:'type',message:'Expected string; got object.'}
 ]}},automatic);
 const message=f.calls[0][0];assert.match(message,/\(root\): Required field is missing/);
 assert.match(message,/\/pressures: Expected at most 2 items; got 3/);assert.match(message,/Additional schema issues.*Details/);
 assert.doesNotMatch(message,/PRIVATE|third-field/);assert.equal(f.calls[0][2].escapeHtml,true);
});

// Unexpected property names originate in the rejected response, rather than the configured schema.
test('additional-property toast redacts the generated key while retaining its schema-owned parent',()=>{
 const decoded=decodeJson('{"portrayalBrief":{"PRIVATE_GENERATED_KEY":"PRIVATE_VALUE"}}',{
  schema:{type:'object',properties:{portrayalBrief:{type:'object',additionalProperties:false}}}
 });
 assert.equal(decoded.error?.code,'SCHEMA_MISMATCH');
 const f=fixture();f.onResult(decoded,automatic);const message=f.calls[0][0];
 assert.match(message,/\/portrayalBrief.*unexpected field.*Additional field is not allowed/);
 assert.doesNotMatch(message,/PRIVATE_GENERATED_KEY|PRIVATE_VALUE/);
});

test('an unqualified duplicate node ID keeps the safe fallback without guessing an instance',()=>{
 const f=fixture();f.onResult({ok:false,runId:'ambiguous',error:{code:'INVALID_JSON',nodeId:'model'},recording:{runId:'ambiguous',
  identities:{strings:['wf','left','right','model'],paths:[null,[0,1],[0,2]],addresses:[[0,1,3],[0,2,3]]},
  units:[{address:0,included:true,label:'Wrong left label',attempts:3},{address:1,included:true,label:'Wrong right label',attempts:1}]}
 },automatic);
 assert.match(f.calls[0][0],/at model.*INVALID_JSON/);assert.doesNotMatch(f.calls[0][0],/Wrong|after \d+ attempt/);
});

test('skipped and superseded failures stay silent',()=>{
 const f=fixture();for(const flag of ['skipped','superseded'])f.onResult({ok:false,[flag]:true,error:{code:'INVALID_JSON'}},automatic);
 assert.equal(f.calls.length,0);assert.deepEqual(f.events,['pc-native-result','pc-native-result']);
});
test('automatic schema failure visibly reports safe code and node, and persists with an accurate fallback caveat',()=>{const f=fixture();f.onResult({ok:false,error:{code:'SCHEMA_MISMATCH',message:'PRIVATE source data',nodeId:'assessment'}},automatic);assert.equal(f.calls.length,1);const [message,title,options]=f.calls[0];assert.match(message,/SCHEMA_MISMATCH/);assert.match(message,/assessment/);assert.match(message,/SillyTavern may continue with its normal reply/);assert.doesNotMatch(message,/PRIVATE/);assert.equal(options.timeOut,0);assert.equal(options.extendedTimeOut,0);assert.equal(options.closeButton,true);assert.equal(options.escapeHtml,true);assert.match(title,/Lattice/);assert.deepEqual(f.events,['pc-native-result']);});
test('manual failure uses catalog copy plus safe code and persistent error',()=>{const f=fixture();f.onResult({ok:false,error:{code:'INVALID_JSON',message:'PRIVATE model text'}},null);assert.equal(f.calls.length,1);assert.match(f.calls[0][0],/not valid JSON/);assert.match(f.calls[0][0],/INVALID_JSON/);assert.doesNotMatch(f.calls[0][0],/PRIVATE|SillyTavern may continue/);assert.equal(f.calls[0][2].timeOut,0);assert.equal(f.events.length,0);});
test('successful automatic result produces no toast and retains the result event',()=>{const f=fixture();f.onResult({ok:true},automatic);assert.equal(f.calls.length,0);assert.deepEqual(f.events,['pc-native-result']);});
test('informational cancellation remains neutral, visible and persistent',()=>{const f=fixture();f.onResult({ok:false,error:{code:'ABORTED',message:'Workflow was stopped.'}},automatic);assert.equal(f.calls.length,1);assert.equal(f.kinds[0],'info');assert.match(f.calls[0][0],/Workflow stopped.*ABORTED/);assert.equal(f.calls[0][2].timeOut,0);assert.equal(f.calls[0][2].closeButton,true);assert.deepEqual(f.events,['pc-native-result']);});
test('arbitrary error code and node text cannot reach the toast',()=>{const f=fixture();f.onResult({ok:false,error:{code:'<secret>',message:'PRIVATE',nodeId:'<script>private</script>'}},automatic);assert.equal(f.calls.length,1);assert.match(f.calls[0][0],/WORKFLOW_FAILED/);assert.doesNotMatch(f.calls[0][0],/secret|private|script|PRIVATE/);});


test('failure notices use the captured stop outcome instead of suggesting native fallback', () => {
 const f=fixture();
 f.onResult({ok:false,failurePolicy:'stop',failureDisposition:'stopped',error:{code:'REQUEST_FAILED',nodeId:'planner'}},automatic);
 assert.match(f.calls[0][0],/Generation stopped/);
 assert.doesNotMatch(f.calls[0][0],/may continue|Continuing with normal/);
});

test('a recovered automatic run shows a persistent warning with safe failure details', () => {
 const f=fixture();
 f.onResult({ok:true,recovered:true,failurePolicy:'continue-available',failureDisposition:'continued',failures:[
  {code:'INVALID_JSON',nodeId:'weather',message:'PRIVATE response'},
  {code:'REQUEST_FAILED',nodeId:'mood',message:'PRIVATE transport'}
 ]},automatic);
 assert.equal(f.calls.length,1);
 assert.equal(f.kinds[0],'warning');
 assert.match(f.calls[0][0],/continued with available results/);
 assert.match(f.calls[0][0],/2 nodes failed/);
 assert.match(f.calls[0][0],/weather.*INVALID_JSON/);
 assert.doesNotMatch(f.calls[0][0],/PRIVATE|may continue|Generation stopped/);
 assert.equal(f.calls[0][2].timeOut,0);
});
