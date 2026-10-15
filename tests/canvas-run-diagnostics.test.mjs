import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './canvas-fixture.mjs';
import {prepareNodeReadiness,summarizeReadiness} from '../src/ui/node-readiness.js';
import {readFile} from 'node:fs/promises';
import {runWorkflow} from '../src/workflow/runtime.js';
import {projectRunRows} from '../src/workflow/run-state.js';
import {projectCurrentDiagnostics} from '../src/ui/current-diagnostics.js';
import {presentDiagnostic} from '../src/ui/diagnostics.js';

const controllerSource = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
function scopedTraces(...args) {
 const start=controllerSource.indexOf('function scopedRunTraces('),end=controllerSource.indexOf('\n}',start)+2;
 return Function(controllerSource.slice(start,end)+';return scopedRunTraces;')()(...args);
}

test('runtime explicit downstream cause owns red canvas paint while executing failure remains historical',async()=>{
 const env=fixture();try {
  const graph={...env.graph,mode:'native-unified',runTargets:[],nodes:{a:{...env.a},b:{...env.b,method:'select'}}};
  const address={workflowId:graph.id,instancePath:[],nodeId:'b'};
  const result=await runWorkflow(graph,{runId:'causal-run',target:{...address,portId:'out'},snapshot:()=>({ok:false,error:{code:'INVALID_INPUT',message:'Malformed selected input',address,inputPortId:'in'}})});
  assert.equal(result.ok,false);assert.deepEqual(result.error.address,address);
  const rows=projectRunRows(result.recording),dto=projectCurrentDiagnostics({attemptId:result.runId,documentKey:'doc',recording:result.recording,error:result.error});
  assert.deepEqual(rows.map(row=>[row.address.nodeId,row.status]),[['a','failed'],['b','failed']],'Run Details keep actual execution statuses');
  assert.deepEqual(dto.nodes.map(node=>node.address.nodeId),['b']);
  const before=env.canvas.endpoint('b','in','in'),card=env.host.querySelector('.pc-node[data-id="b"]'),pin=card.querySelector('[data-dir="in"]');
  env.canvas.setRunDiagnostics(dto);
  env.canvas.setTrace(scopedTraces(rows,{view:{identity:{kind:'root',workflowId:graph.id,instancePath:[]}}},'current',dto));
  assert.equal(env.host.querySelector('.pc-node[data-id="a"]').classList.contains('pc-trace-failed'),false,'executing source is not the admitted cause');
  assert.ok(card.classList.contains('pc-run-failed'));assert.ok(card.classList.contains('pc-trace-failed'));
  assert.ok(pin.classList.contains('pc-pin-run-failed'));assert.equal(env.host.querySelectorAll('.pc-pin-run-failed').length,1);
  assert.equal(env.host.querySelector('.pc-node[data-id="b"]'),card);assert.equal(card.querySelector('[data-dir="in"]'),pin);assert.deepEqual(env.canvas.endpoint('b','in','in'),before);
 }finally{await env.canvas.destroy();}
});

test('runtime oversized exact cause paints its node without navigating to an existing prefix',async()=>{
 const env=fixture();try {
  const prefix='n'.repeat(256),target=prefix+'x';
  const graph={...env.graph,mode:'native-unified',runTargets:[],nodes:{[prefix]:{...env.a,id:prefix,operation:'json-decode'},[target]:{...env.b,id:target,operation:'json-decode'}},wires:{},nativeCards:{[prefix]:env.graph.nativeCards.a,[target]:env.graph.nativeCards.b}};
  env.canvas.setGraph(graph);
  const result=await runWorkflow(graph,{target:{workflowId:graph.id,instancePath:[],nodeId:target,portId:'out'}});
  assert.equal(result.error.code,'MISSING_INPUT');assert.equal(result.error.address.nodeId,target);
  const dto=projectCurrentDiagnostics({attemptId:result.runId,documentKey:'doc',recording:result.recording,error:result.error});
  env.canvas.setRunDiagnostics(dto);
  assert.equal(env.host.querySelector(`.pc-node[data-id="${prefix}"]`).classList.contains('pc-run-failed'),false);
  const card=env.host.querySelector(`.pc-node[data-id="${target}"]`);assert.ok(card.classList.contains('pc-run-failed'));assert.ok(card.querySelector('[data-dir="in"]').classList.contains('pc-pin-run-failed'));
  assert.equal(presentDiagnostic(dto.nodes[0].error).address,undefined,'presentation rejects oversize navigation while exact paint is retained');
 }finally{await env.canvas.destroy();}
});

test('failed trace ancestor summaries require the full current causal address',()=>{
 const address=(workflowId,instancePath,nodeId)=>({workflowId,instancePath,nodeId});
 const editor={view:{identity:{kind:'root',workflowId:'root',instancePath:[]}}};
 const rows=['first','second','other'].map(nodeId=>({address:address('root',[],nodeId),kind:'instance',status:'failed'}));
 const dto={attemptId:'run',documentKey:'doc',nodes:[{address:address('root',['second','inner'],'cause')},{address:address('foreign',['first'],'cause')}]};
 assert.deepEqual(scopedTraces(rows,editor,'current',dto),[{id:'second',status:'failed'}]);
 assert.deepEqual(scopedTraces(rows,editor,'current',null),[]);
 assert.deepEqual(scopedTraces(rows,editor,'stale',dto),[]);
 rows[0].kind='primitive';rows[0].status='running';rows[1].status='blocked';rows[2].status='cancelled';
 assert.deepEqual(scopedTraces(rows,editor,'current',null),[{id:'first',status:'running'},{id:'second',status:'blocked'},{id:'other',status:'cancelled'}]);
 const nested={view:{identity:{kind:'instance',workflowId:'root',instancePath:['second']}}};
 assert.deepEqual(scopedTraces([{address:address('root',['second'],'inner'),kind:'instance',status:'failed'},{address:address('root',['first'],'inner'),kind:'instance',status:'failed'}],nested,'current',dto),[{id:'inner',status:'failed'}]);
});

test('draft inputs remain ordinary metadata without ambient readiness or group counts',()=>{
 const address={workflowId:'root',instancePath:[],nodeId:'draft'};
 const row=prepareNodeReadiness({address,ports:[{id:'in',label:'Context',direction:'input',required:true}],wires:{}});
 assert.equal(row.state,'ready');assert.equal(row.label,'');assert.deepEqual(row.issues,[]);
 const setup=prepareNodeReadiness({address,setupIssues:[{code:'ACTOR_REQUIRED',message:'Choose an actor',field:'actorId'}],ports:[{id:'in',direction:'input',required:true}]});
 assert.equal(setup.state,'setup');assert.equal(summarizeReadiness([setup,row]).label,'1 needs setup');
});

test('causal diagnostic paint changes only mounted failed slots and preserves retained geometry',async()=>{
 const env=fixture();
 try {
  assert.equal(typeof env.canvas.setRunDiagnostics,'function');
  const node=env.host.querySelector('.pc-node[data-id="b"]'),pin=node.querySelector('[data-dir="in"]'),out=node.querySelector('[data-dir="out"]');
  const before=env.canvas.endpoint('b','in','in'),slot=env.canvas.cardSlots.get('b'),ports=env.graph.nativeCards.b.ports,layout=env.canvas.layoutKeys.get('b');
  let reads=0;node.getBoundingClientRect=()=>{reads++;throw Error('card remeasurement');};pin.getBoundingClientRect=()=>{reads++;throw Error('pin remeasurement');};
  env.canvas.geometry.measure=()=>{throw Error('geometry work');};
  env.canvas.render=()=>{throw Error('scene redraw');};
  const address={workflowId:env.graph.id,instancePath:[],nodeId:'b'};
  env.canvas.setRunDiagnostics({attemptId:'run',documentKey:'doc',nodes:[{key:JSON.stringify([address.workflowId,[],address.nodeId]),address,error:{code:'INPUT_REQUIRED',message:'Connect Context.'},inputPortId:'in'}]});
  assert.ok(node.classList.contains('pc-run-failed'));assert.ok(pin.classList.contains('pc-pin-run-failed'));assert.ok(!out.classList.contains('pc-pin-run-failed'));
  assert.match(node.title,/INPUT_REQUIRED: Connect Context/);assert.match(pin.title,/INPUT_REQUIRED/);
  assert.equal(env.host.querySelector('.pc-node[data-id="b"]'),node);assert.equal(node.querySelector('[data-dir="in"]'),pin);
  assert.equal(env.canvas.cardSlots.get('b'),slot);assert.equal(env.graph.nativeCards.b.ports,ports);assert.equal(env.canvas.layoutKeys.get('b'),layout);assert.equal(reads,0);assert.deepEqual(env.canvas.endpoint('b','in','in'),before);
  env.canvas.setRunDiagnostics(null);assert.ok(!node.classList.contains('pc-run-failed'));assert.ok(!pin.classList.contains('pc-pin-run-failed'));assert.equal(pin.title,'in: context');
 }finally{await env.canvas.destroy();}
});

test('diagnostic projection isolates same IDs by full instance address and rings only known inputs',async()=>{
 const env=fixture({nativeScope:()=>({workflowId:'root',instancePath:['one']})});
 try {
  assert.equal(typeof env.canvas.setRunDiagnostics,'function');
  const card=env.host.querySelector('.pc-node[data-id="b"]'),pin=card.querySelector('[data-dir="in"]');
  const row=(path,port)=>{const address={workflowId:'root',instancePath:path,nodeId:'b'};return {key:JSON.stringify(['root',path,'b']),address,error:{code:'INVALID_INPUT',message:'Bad input'},inputPortId:port};};
  const dto=nodes=>({attemptId:'run',documentKey:'doc',nodes});
  env.canvas.setRunDiagnostics(dto([row(['two'],'in')]));assert.ok(!card.classList.contains('pc-run-failed'));
  env.canvas.setRunDiagnostics(dto([row(['one'],'out')]));assert.ok(card.classList.contains('pc-run-failed'));assert.ok(!pin.classList.contains('pc-pin-run-failed'));
  env.canvas.setRunDiagnostics(dto([row(['one'],'missing')]));assert.ok(!pin.classList.contains('pc-pin-run-failed'));
  env.canvas.setRunDiagnostics(dto([row(['one'],'in')]));assert.ok(pin.classList.contains('pc-pin-run-failed'));
  env.canvas.setTrace([{id:'a',status:'blocked'},{id:'b',status:'failed'}]);assert.ok(!env.host.querySelector('.pc-node[data-id="a"]').classList.contains('pc-run-failed'));
  env.canvas.render();assert.ok(pin.classList.contains('pc-pin-run-failed'),'structural publication reapplies paint');
  env.canvas.setGraph(env.graph);assert.ok(!env.host.querySelector('.pc-node[data-id="b"]').classList.contains('pc-run-failed'),'view replacement clears ownership');
 }finally{await env.canvas.destroy();}
});

test('diagnostics never execute DTO accessors and malformed identities clear earlier paint',async()=>{
 const env=fixture();try {
  assert.equal(typeof env.canvas.setRunDiagnostics,'function');
  let calls=0;const value={attemptId:'run',documentKey:'doc'};Object.defineProperty(value,'nodes',{get(){calls++;throw Error('accessor');}});
  env.canvas.setRunDiagnostics(value);assert.equal(calls,0);assert.equal(env.host.querySelectorAll('.pc-run-failed').length,0);
 }finally{await env.canvas.destroy();}
});
