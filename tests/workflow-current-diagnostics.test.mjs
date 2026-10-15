import assert from 'node:assert/strict';
import test from 'node:test';
import { safeError } from '../src/workflow/record-data.js';
import { createRunState, reduceRunState } from '../src/workflow/run-state.js';
import { createRunRecorder } from '../src/workflow/recording.js';
const address=(nodeId,path=[])=>({workflowId:'w',instancePath:path,nodeId});
const unit=(path=[])=>({address:address('same',path),operation:'work',included:true,dependencies:[],requestBound:0,inputPorts:['in'],outputPorts:['out']});
const plan=()=>({workflowId:'w',phase:'post',mode:'root',units:[unit(['first']),unit(['second'])],hierarchy:[{address:address('first'),kind:'instance',included:true,inputPorts:['wrapper-in']}],terminals:[],callBound:0});
const event=(seq,type,details={})=>({runId:'run',seq,type,at:seq,elapsedMs:seq,...details});
test('causal error parsing keeps exact selected input and rejects foreign/output identities without getters',()=>{
 const p=plan(),cause=address('same',['second']);
 assert.deepEqual(safeError({code:'INVALID_INPUT',message:'bad',address:cause,inputPortId:'in'},p),{code:'INVALID_INPUT',message:'bad',address:cause,nodeId:'same',inputPortId:'in'});
 assert.equal(safeError({code:'X',message:'bad',address:cause,inputPortId:'out'},p).inputPortId,undefined);
 assert.equal(safeError({code:'X',message:'bad',address:address('foreign'),inputPortId:'in'},p).address,undefined);
 assert.equal(safeError({code:'X',message:'bad',address:address('first'),inputPortId:'wrapper-in'},p).inputPortId,'wrapper-in');
 let reads=0;const raw={code:'X',message:'bad',address:cause};Object.defineProperty(raw,'inputPortId',{get(){reads++;return 'in';}});assert.equal(safeError(raw,p).inputPortId,undefined);assert.equal(reads,0);
});
test('preflight settlement records only its exact causal node and preserves cause in reducer and recording',()=>{
 const p=plan(),cause=address('same',['second']),error={code:'MISSING_INPUT',message:'Connect input',address:cause,inputPortId:'in'};
 let state=reduceRunState(createRunState('run'),event(1,'plan',{plan:p}));state=reduceRunState(state,event(2,'run-settled',{status:'failed',error,failedAddress:cause}));
 assert.deepEqual(state.nodes.map(n=>n.status),['not-run','failed']);assert.equal(state.error.inputPortId,'in');assert.deepEqual(state.nodes[1].error.address,cause);
 const recorder=createRunRecorder({runId:'run'});recorder.accept(event(1,'plan',{plan:p}));recorder.accept(event(2,'run-settled',{status:'failed',error,failedAddress:cause}));const record=recorder.finish();assert.equal(record.error.inputPortId,'in');assert.deepEqual(record.error.address,cause);
});
import { runWorkflow, workflowSignature } from '../src/workflow/runtime.js';
import { fixtureGraph } from './helpers/workflow-fixtures.mjs';
test('runtime missing selected input carries exact pin with zero source binding provider effects',async()=>{
 const graph=fixtureGraph('native-guidance');delete graph.wires[Object.keys(graph.wires).find(id=>graph.wires[id].to==='smart-compactor')];let effects=0;const effect=()=>{effects++;throw Error('effect');};
 const result=await runWorkflow(graph,{target:{workflowId:graph.id,instancePath:[],nodeId:'guidance',portId:'out'},snapshot:effect,resolveBinding:effect,request:effect,countTokens:effect});
 assert.equal(result.ok,false);assert.equal(result.error.inputPortId,'in');assert.equal(result.error.address.nodeId,'smart-compactor');assert.equal(effects,0);assert.ok(result.recording.plan);assert.equal(result.recording.status,'failed');
});
test('connected malformed JSON produces an exact runtime input diagnostic',async()=>{
 const graph=fixtureGraph('structured-guidance');graph.nodes['compose-json'].sections=[{name:'Scene',text:'not json'}];
 const result=await runWorkflow(graph,{target:{workflowId:graph.id,instancePath:[],nodeId:'json-decode',portId:'out'}});
 assert.equal(result.ok,false);assert.equal(result.error.address.nodeId,'json-decode');assert.equal(result.error.inputPortId,'in');assert.equal(result.recording.error.inputPortId,'in');
});

import { installMock } from './mock.js';
installMock();
const { createWorkflowSession }=await import('../src/ui/workflow-surface.js');
test('session current diagnostics own new preparation attempt and clear on semantic edit cancel document replacement',async()=>{
 let root=fixtureGraph('native-guidance'),epoch=1,document='doc',state;const cause={workflowId:root.id,instancePath:[],nodeId:'smart-compactor'};
 const runtime={cancel(){},runTarget:async()=>({ok:false,error:{code:'MISSING_INPUT',message:'Missing',address:cause,inputPortId:'in'}})};
 const session=createWorkflowSession({runtime:()=>runtime,current:()=>root,epoch:()=>epoch,documentToken:()=>document,active:()=>true,changed:value=>state=value});
 const run=()=>session.run({target:{...cause,portId:'out'}});await run();
 assert.equal(typeof session.currentDiagnostics,'function');assert.equal(session.currentDiagnostics('doc').nodes[0].inputPortId,'in');
 const retained=session.currentDiagnostics('doc');root.view.x++;assert.equal(session.currentDiagnostics('doc'),retained);
 session.invalidate();assert.equal(state.preparationError,null);assert.equal(session.currentDiagnostics('doc'),null);
 await run();session.cancel();assert.equal(state.preparationError,null);assert.equal(session.currentDiagnostics('doc'),null);
 await run();document='replacement';session.syncDocument();assert.equal(session.currentDiagnostics('doc'),null);
});
test('recording budgets retain bounded code and exact causal identity when optional error text does not fit',()=>{
 const p=plan(),long='n'.repeat(600000);p.units=[{...unit(),address:address(long),inputPorts:['in']}];p.hierarchy=[];
 const recorder=createRunRecorder({runId:'run'}),cause=address(long);assert.equal(recorder.accept(event(1,'plan',{plan:p})).ok,true);
 recorder.accept(event(2,'run-settled',{status:'failed',failedAddress:cause,error:{code:'INVALID_INPUT',message:'x'.repeat(10000),address:cause,inputPortId:'in'}}));
 const record=recorder.finish();assert.equal(record.error.code,'INVALID_INPUT');assert.deepEqual(record.error.address,cause);assert.equal(record.error.inputPortId,'in');assert.ok(new TextEncoder().encode(JSON.stringify(record)).length<=4194304);
});
test('provider failures stay node-only and never infer a pin from error text',async()=>{
 const graph=fixtureGraph('native-guidance');graph.nodes['smart-compactor'].method='select';
 const result=await runWorkflow(graph,{target:{workflowId:graph.id,instancePath:[],nodeId:'guidance',portId:'out'},snapshot:()=>({kind:'context',messages:[]}),countTokens:async()=>({tokens:0,method:'test'}),resolveBinding:()=>({ok:true,data:{profileId:'x',model:'fixture'}}),request:async()=>({ok:false,error:{code:'REQUEST_FAILED',message:'Input in failed at provider'}})});
 assert.equal(result.ok,false);assert.equal(result.error.address.nodeId,'response-plan');assert.equal(result.error.inputPortId,undefined);
});
test('unplanned settlements cannot admit arbitrary causal metadata into recording budgets',()=>{
 const recorder=createRunRecorder({runId:'run'});recorder.accept(event(1,'run-settled',{status:'invalid',error:{code:'INVALID',message:'bad',address:address('foreign'),inputPortId:'in'}}));assert.equal(recorder.finish().error.address,undefined);
});
const { unifiedRecipeHost }=await import('./helpers/unified-recipe-host.mjs');
test('owned automatic Send preflight paints exact input without effects and rejects late foreign attempts',async()=>{
 const graph=fixtureGraph('native-guidance');delete graph.wires['wire-1'];let document='native-doc',epoch=1,state;
 const host=unifiedRecipeHost(graph,{request:async()=>{throw Error('provider');},ports:{getDocumentToken:()=>document}});
 const session=createWorkflowSession({runtime:()=>host.controller,current:()=>graph,epoch:()=>epoch,documentToken:()=>document,active:()=>true,changed:value=>state=value});
 try {
  const result=await host.generate('unused');assert.equal(result.error.inputPortId,'in');assert.equal(host.calls(),0);assert.equal(host.saves(),0);assert.equal(result.actualCalls,0);
  const automatic=host.controller.lastAutomaticResult();assert.ok(automatic,'preflight must publish an owned automatic attempt before host preparation');
  session.receiveAutomatic(automatic);assert.equal(session.currentDiagnostics('native-doc').nodes[0].address.nodeId,'smart-compactor');assert.equal(session.currentDiagnostics('native-doc').nodes[0].inputPortId,'in');
  session.cancel();assert.equal(session.currentDiagnostics('native-doc'),null);session.receiveAutomatic(automatic);assert.equal(session.currentDiagnostics('native-doc'),null);
  await host.generate('unused');const next=host.controller.lastAutomaticResult();session.receiveAutomatic(next);assert.ok(session.currentDiagnostics('native-doc'));epoch++;session.invalidate();session.receiveAutomatic(next);assert.equal(session.currentDiagnostics('native-doc'),null);
  document='replacement';session.syncDocument();session.receiveAutomatic(next);assert.equal(session.currentDiagnostics('replacement'),null);
 } finally {host.controller.dispose();}
});
test('record-free automatic failure requires exact latest controller attempt identity',()=>{
 const graph=fixtureGraph('native-guidance'),cause={workflowId:graph.id,instancePath:[],nodeId:'smart-compactor'};let latest,state;
 const controller={lastAutomaticResult:()=>latest,cancel(){}};
 const session=createWorkflowSession({runtime:()=>controller,current:()=>graph,epoch:()=>1,active:()=>true,changed:value=>state=value});
 const failure=id=>({origin:{graph,graphId:graph.id,signature:workflowSignature(graph),kind:'send',phase:'unified',runId:id},result:{mode:'root',runId:id,ok:false,actualCalls:0,error:{code:'MISSING_INPUT',message:'Missing',address:cause,inputPortId:'in'}}});
 const owned=failure('owned');session.receiveAutomatic(owned);assert.equal(session.currentDiagnostics('doc'),null);
 latest=owned;session.receiveAutomatic(owned);assert.equal(session.currentDiagnostics('doc').nodes[0].inputPortId,'in');
 const foreign=failure('foreign');session.receiveAutomatic(foreign);assert.equal(session.currentDiagnostics('doc').attemptId,'owned');
 session.invalidate();session.receiveAutomatic(owned);assert.equal(session.currentDiagnostics('doc'),null);
 latest=failure('new');session.receiveAutomatic(owned);assert.equal(session.currentDiagnostics('doc'),null);
});

test('combined large causal identifiers reject before exceeding the whole recording budget',()=>{
 const p=plan(),node='n'.repeat(800000),input='i'.repeat(800000),output='o'.repeat(300000);p.units=[{...unit(),address:address(node),inputPorts:[input],outputPorts:[output]}];p.hierarchy=[];
 const recorder=createRunRecorder({runId:'run'}),admitted=recorder.accept(event(1,'plan',{plan:p}));
 if(!admitted.ok){assert.equal(admitted.error.code,'RUN_METADATA_LIMIT');return;}
 recorder.accept(event(2,'run-settled',{status:'failed',failedAddress:address(node),error:{code:'INVALID_INPUT',message:'bad',address:address(node),inputPortId:input}}));
 const record=recorder.finish();assert.deepEqual(record.error.address,address(node));assert.equal(record.error.inputPortId,input);assert.ok(new TextEncoder().encode(JSON.stringify(record)).length<=4194304);
});
test('a recorded automatic envelope cannot replace the controllers newer attempt',async()=>{
 const graph=fixtureGraph('native-guidance');delete graph.wires['wire-1'];
 const first=await runWorkflow(graph,{runId:'old'}),second=await runWorkflow(graph,{runId:'latest'});let latest;
 const envelope=result=>({origin:{graph,graphId:graph.id,signature:workflowSignature(graph),kind:'send',phase:'unified',runId:result.runId},result});
 const old=envelope(first),current=envelope(second),session=createWorkflowSession({runtime:()=>({lastAutomaticResult:()=>latest}),current:()=>graph,epoch:()=>1,active:()=>true,changed(){}});
 latest=current;session.receiveAutomatic(current);assert.equal(session.currentDiagnostics('doc').attemptId,'latest');session.receiveAutomatic(old);assert.equal(session.currentDiagnostics('doc').attemptId,'latest');
});
test('latest native Send with no selected outputs exposes a current global error and clears prior causal paint',async()=>{
 const graph=fixtureGraph('native-guidance');graph.runTargets=[];delete graph.wires['wire-1'];let document='doc',state;
 const host=unifiedRecipeHost(graph,{request:async()=>{throw Error('provider');},ports:{getDocumentToken:()=>document}});
 const session=createWorkflowSession({runtime:()=>host.controller,current:()=>graph,epoch:()=>1,documentToken:()=>document,active:()=>true,changed:value=>state=value});
 try {
  await session.run({target:{workflowId:graph.id,instancePath:[],nodeId:'guidance',portId:'out'}});const historical=state.recording;assert.equal(session.currentDiagnostics('doc').nodes[0].inputPortId,'in');
  const response=await host.generate('unused');assert.equal(response.error.code,'MISSING_RUN_TARGETS');assert.equal(response.recording.plan,null);assert.equal(response.recording.status,'invalid');
  const latest=host.controller.lastAutomaticResult();session.receiveAutomatic(latest);
  assert.equal(state.preparationError?.code,'MISSING_RUN_TARGETS');assert.equal(state.recording,historical);assert.equal(session.currentDiagnostics('doc'),null);assert.equal(host.calls(),0);assert.equal(host.saves(),0);
  session.cancel();session.receiveAutomatic(latest);assert.equal(state.preparationError,null);
 } finally {host.controller.dispose();}
});
test('planless automatic failures reject forged recording identity and metadata accessors',async()=>{
 const graph=fixtureGraph('native-guidance');graph.runTargets=[];const response=await runWorkflow(graph,{runId:'invalid'});let latest,state;
 const origin={graph,graphId:graph.id,signature:workflowSignature(graph),kind:'send',phase:'unified',runId:'invalid'},session=createWorkflowSession({runtime:()=>({lastAutomaticResult:()=>latest}),current:()=>graph,epoch:()=>1,active:()=>true,changed:value=>state=value});
 const foreign={origin,result:response};session.receiveAutomatic(foreign);assert.equal(state,undefined);
 latest={origin,result:{...response,recording:{...response.recording,runId:'foreign'}}};session.receiveAutomatic(latest);assert.equal(state,undefined);
 let reads=0;const recording={...response.recording};Object.defineProperty(recording,'plan',{get(){reads++;return null;}});latest={origin,result:{...response,recording}};session.receiveAutomatic(latest);assert.equal(reads,0);assert.equal(state,undefined);
 latest={origin,result:response};session.receiveAutomatic(latest);assert.equal(state.preparationError.code,'MISSING_RUN_TARGETS');assert.equal(state.preparationError.address,undefined);assert.equal(session.currentDiagnostics('doc'),null);
});
