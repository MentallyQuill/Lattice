import assert from 'node:assert/strict';
import {test} from 'node:test';
import {executeControl} from '../src/workflow/operations/control-nodes.js?v=0.27.3';
const data=value=>({kind:'data',value}),helper={id:'privacy-helper',version:1,semanticHash:'sha256:'+'a'.repeat(64)};
const node={type:'workflow',operation:'for-each',helper,mode:'projected-state',limit:3,requestBoundPerIteration:0};

test('For Each preserves private helper result disclosure on aggregate and projected state',async()=>{
 const result=await executeControl(node,{in:data([1]),state:data({total:0})},{iterateHelper:async()=>({ok:true,artifact:{...data('private observation'),visibility:{kind:'actor-private',actorId:'Mara'}},projectedState:{total:1}})});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.outputs.out.visibility,{kind:'actor-private',actorId:'Mara'});assert.deepEqual(result.outputs.state.visibility,{kind:'actor-private',actorId:'Mara'});
});

test('For Each hides aggregate and state derived from distinct private actors',async()=>{
 const result=await executeControl(node,{in:data([1,2]),state:data({total:0})},{iterateHelper:async invocation=>({ok:true,artifact:{...data(invocation.item),visibility:{kind:'actor-private',actorId:invocation.index?'Laya':'Mara'}},projectedState:{total:invocation.item}})});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.outputs.out.visibility,{kind:'hidden'});assert.deepEqual(result.outputs.state.visibility,{kind:'hidden'});
});

test('For Each includes implicit private projected-state records in disclosure provenance',async()=>{
 const result=await executeControl(node,{in:data([1]),state:data({total:0})},{iterateHelper:async()=>({ok:true,artifact:data('result'),projectedState:{recordType:'reflection',scope:{actorId:'Mara'},text:'private memory'}})});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.outputs.out.visibility,{kind:'actor-private',actorId:'Mara'});assert.deepEqual(result.outputs.state.visibility,{kind:'actor-private',actorId:'Mara'});
});

test('For Each rejects invalid helper envelope visibility without publishing partial outputs',async()=>{
 const result=await executeControl(node,{in:data([1]),state:data({total:0})},{iterateHelper:async()=>({ok:true,artifact:{...data('secret'),visibility:{kind:'actor-private'}},projectedState:{total:1}})});
 assert.equal(result.ok,false);assert.equal(result.error.code,'INVALID_ITERATION_RESULT');assert.equal(result.outputs,undefined);
});

import {computeDefinitionIdentity,definitionRefKey} from '../src/workflow/definition-data.js?v=0.27.3';
import {executePrimitive} from '../src/workflow/operations/nodes.js?v=0.27.3';
const compiler=await import('../src/workflow/iteration-helpers.js?v=0.27.3').catch(()=>({}));
const address={workflowId:'root',instancePath:[],nodeId:'each'};
const edge=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});
function definition({id='identity',stateful=false,mode='native-unified',nodes={},wires={},roles={}}={}) {
 const ports=[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},
  {id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'}];
 const boundary={entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'}};
 const links=Object.keys(wires).length?wires:{pass:edge('pass','entry','out','exit','in')};
 if(stateful){ports.push({id:'projectedState',label:'Projected state',direction:'input',kind:'data',required:false,cardinality:'one',boundaryNodeId:'stateEntry'},{id:'nextState',label:'Next state',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'stateExit'});boundary.stateEntry={id:'stateEntry',type:'subgraph-input',interfacePortId:'projectedState'};boundary.stateExit={id:'stateExit',type:'subgraph-output',interfacePortId:'nextState'};links.state= edge('state','stateEntry','out','stateExit','in');}
 const raw={id,version:1,name:id,interface:ports,parameters:[],body:{schema:3,runtime:2,mode,nodes:{...boundary,...nodes},wires:links,roles}};
 const checked=computeDefinitionIdentity(raw);assert.equal(checked.ok,true,JSON.stringify(checked.error));return {...checked.data.materializedDefinition,semanticHash:checked.data.semanticHash};
}
function setup(def,extra={}){const ref={id:def.id,version:def.version,semanticHash:def.semanticHash};return {root:{id:'root',schema:3,runtime:2,mode:'native-unified',roles:{Prose:{profileId:'root-profile',model:'root-model'}},nodes:{},wires:{},definitions:{[definitionRefKey(ref)]:def,...extra}},ref};}
function compile(fixture,options={}){assert.equal(typeof compiler.compileIterationHelper,'function','real pinned helper compiler must exist');return compiler.compileIterationHelper(fixture.root,{helper:fixture.ref,mode:'map',phase:'pre',address,requestBoundPerIteration:0,...options});}
function invocation(fixture,options={}){return {helper:fixture.ref,item:{amount:3},index:0,phase:'pre',rootMode:'native-unified',address,...options};}

test('compiler executes direct Data interface without fabricated seed unit effects',async()=>{
 const fixture=setup(definition()),compiled=compile(fixture);assert.equal(compiled.ok,true,JSON.stringify(compiled.error));assert.equal(compiled.data.description.requestBound,0);
 let calls=0;const result=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture),{executeUnit:()=>{calls++;throw Error('no real primitives');}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.artifact,data({amount:3}));assert.equal(calls,0);assert.equal(JSON.stringify(compiled.data).includes('null'),false);
});

test('compiler preserves projected-state Data outputs and invocation disclosure',async()=>{
 const fixture=setup(definition({stateful:true})),compiled=compile(fixture,{mode:'projected-state'});assert.equal(compiled.ok,true,JSON.stringify(compiled.error));
 const result=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture,{projectedState:{total:9},visibility:{kind:'actor-private',actorId:'Mara'}}),{executeUnit:()=>{throw Error('no real units');}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.projectedState,{total:9});assert.deepEqual(result.artifact.visibility,{kind:'actor-private',actorId:'Mara'});assert.deepEqual(result.projectedStateVisibility,{kind:'actor-private',actorId:'Mara'});
});

test('real helper adapters receive qualified immutable units and effective Post stage',async()=>{
 const fixture=setup(definition({nodes:{select:{id:'select',type:'workflow',operation:'select-fields',fields:[{name:'count',path:['amount']}]}},wires:{a:edge('a','entry','out','select','in'),b:edge('b','select','out','exit','in')}})),compiled=compile(fixture,{phase:'post'});assert.equal(compiled.ok,true,JSON.stringify(compiled.error));
 const seen=[];const result=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture,{phase:'post',index:2}),{executeUnit:(unit,inputs,local)=>{seen.push({unit,local});assert.equal(Object.isFrozen(unit.node),true);assert.equal(Object.isFrozen(inputs.in.value),true);return executePrimitive(unit.node,inputs,{phase:local.phase});}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.artifact.value,{count:3});assert.equal(seen.length,1);assert.deepEqual(seen[0].unit.address,{...address,instancePath:['each','iteration-2'],nodeId:'select'});assert.equal(seen[0].local.phase,'post');assert.equal(seen[0].local.root,false);
});

test('whole helper validation rejects an incomplete unused branch before effects',()=>{
 const fixture=setup(definition({nodes:{unused:{id:'unused',type:'workflow',operation:'json-decode'}}}));const result=compile(fixture);assert.equal(result.ok,false);assert.equal(result.error.code,'MISSING_INPUT');
});

test('compiler rejects absent or altered exact snapshot and root authority',()=>{
 const missing=setup(definition());missing.root.definitions={};assert.equal(compile(missing).ok,false);
 const changed=setup(definition());changed.root.definitions[definitionRefKey(changed.ref)]={...changed.root.definitions[definitionRefKey(changed.ref)],body:{...changed.root.definitions[definitionRefKey(changed.ref)].body,nodes:{bad:{id:'bad',type:'workflow',operation:'read-file'}}}};assert.equal(compile(changed).ok,false);
 const authority=setup(definition({nodes:{bad:{id:'bad',type:'workflow',operation:'prompt-source'}}}));assert.equal(compile(authority).ok,false);
});

test('compiler holds legacy or explicitly pinned incompatible phases',()=>{
 assert.equal(compile(setup(definition({mode:'native-pre'})),{phase:'post'}).ok,false);
 const explicit=setup(definition({nodes:{unused:{id:'unused',type:'workflow',operation:'text',text:'saved',phase:'pre'}}}));assert.equal(compile(explicit,{phase:'post'}).ok,false);
});

test('compiler charges actual request bounds and validates nested helper even off selected outputs',()=>{
 const call=setup(definition({nodes:{request:{id:'request',type:'workflow',operation:'decision'}},wires:{a:edge('a','entry','out','request','in'),b:edge('b','request','out','exit','in')}}));assert.equal(compile(call).ok,false);const admitted=compile(call,{requestBoundPerIteration:1});assert.equal(admitted.ok,true,JSON.stringify(admitted.error));assert.equal(admitted.data.description.requestBound,1);
 const absent={id:'absent',version:1,semanticHash:'sha256:'+'c'.repeat(64)},nested=setup(definition({nodes:{unused:{id:'unused',type:'workflow',operation:'for-each',helper:absent,limit:1,requestBoundPerIteration:0}},wires:{a:edge('a','entry','out','unused','in'),b:edge('b','entry','out','exit','in')}}));assert.equal(compile(nested).ok,false);
});

test('opaque compiler capability rejects forged tokens and cancellation before effect',async()=>{
 assert.equal(typeof compiler.executeCompiledIteration,'function');const fixture=setup(definition()),compiled=compile(fixture);assert.equal(compiled.ok,true);
 const forged=await compiler.executeCompiledIteration({},invocation(fixture),{executeUnit:()=>{throw Error();}});assert.equal(forged.ok,false);assert.equal(forged.error.code,'INVALID_ITERATION_CAPABILITY');
 const stop=new AbortController();stop.abort();const result=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture),{signal:stop.signal,executeUnit:()=>{throw Error();}});assert.equal(result.ok,false);assert.equal(result.error.code,'ABORTED');
});

test('For Each carries private nextState envelope labels to subsequent invocations and both outputs',async()=>{
 const labels=[];const result=await executeControl(node,{in:data([1,2]),state:data({total:0})},{iterateHelper:async call=>{labels.push(call.visibility);return {ok:true,artifact:data(call.item),projectedState:{total:call.item},projectedStateVisibility:{kind:'actor-private',actorId:'Mara'}};}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(labels[1],{kind:'actor-private',actorId:'Mara'});assert.deepEqual(result.outputs.out.visibility,{kind:'actor-private',actorId:'Mara'});assert.deepEqual(result.outputs.state.visibility,{kind:'actor-private',actorId:'Mara'});
});

test('For Each rejects malformed nextState envelope disclosure labels',async()=>{
 const result=await executeControl(node,{in:data([1]),state:data({total:0})},{iterateHelper:async()=>({ok:true,artifact:data('result'),projectedState:{total:1},projectedStateVisibility:{kind:'actor-private'}})});
 assert.equal(result.ok,false);assert.equal(result.error.code,'INVALID_ITERATION_RESULT');
});

function nestedFixture(){const child=definition({id:'child'}),childRef={id:child.id,version:1,semanticHash:child.semanticHash};const parent=definition({id:'parent',nodes:{nested:{id:'nested',type:'workflow',operation:'for-each',helper:childRef,mode:'map',limit:3,requestBoundPerIteration:0}},wires:{a:edge('a','entry','out','nested','in'),b:edge('b','nested','out','exit','in')}});return setup(parent,{[definitionRefKey(childRef)]:child});}

test('nested pinned helpers execute sequentially with real child callback and preserve item ordering',async()=>{
 const fixture=nestedFixture(),compiled=compile(fixture);assert.equal(compiled.ok,true,JSON.stringify(compiled.error));const seen=[];
 const executeUnit=(unit,inputs,local)=>{seen.push(unit.address);return executeControl(unit.node,inputs,local);};
 const result=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture,{item:[{id:'a'},{id:'b'}]}),{executeUnit});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.artifact.value,[{id:'a'},{id:'b'}]);assert.deepEqual(seen,[{workflowId:'root',instancePath:['each','iteration-0'],nodeId:'nested'}]);
});

test('compiled source and invocation remain detached while a real unit is awaiting',async()=>{
 const fixture=setup(definition({nodes:{select:{id:'select',type:'workflow',operation:'select-fields',fields:[{name:'count',path:['amount']}]}},wires:{a:edge('a','entry','out','select','in'),b:edge('b','select','out','exit','in')}})),compiled=compile(fixture);assert.equal(compiled.ok,true);
 let resume;const gate=new Promise(resolve=>resume=resolve),call=invocation(fixture);const pending=compiler.executeCompiledIteration(compiled.data.token,call,{executeUnit:async(unit,inputs,local)=>{await gate;return executePrimitive(unit.node,inputs,{phase:local.phase});}});
 call.item.amount=99;fixture.root.definitions={};resume();const result=await pending;assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.artifact.value,{count:3});
});

test('cancel after awaited child execution and unsafe failures never publish or echo source diagnostics',async()=>{
 const fixture=setup(definition({nodes:{select:{id:'select',type:'workflow',operation:'select-fields',fields:[{name:'count',path:['amount']}]}},wires:{a:edge('a','entry','out','select','in'),b:edge('b','select','out','exit','in')}})),compiled=compile(fixture),stop=new AbortController();
 const cancelled=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture),{signal:stop.signal,executeUnit:async()=>{stop.abort();return {ok:true,artifact:data('late')};}});assert.equal(cancelled.ok,false);assert.equal(cancelled.error.code,'ABORTED');
 const failed=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture),{executeUnit:()=>({ok:false,error:{code:'SECRET-CREDENTIAL',message:'Bearer secret-key',details:{password:'secret-key'}}})});assert.equal(failed.ok,false);assert.equal(JSON.stringify(failed).includes('secret'),false);assert.equal(failed.artifact,undefined);
});

import {executeModelNode} from '../src/workflow/operations/model-nodes.js?v=0.27.3';
import {executeDecision} from '../src/workflow/operations/decision-nodes.js?v=0.27.3';
const requestHelper=(id='mixed')=>definition({id,nodes:{decide:{id:'decide',type:'workflow',operation:'decision',questions:{event:{type:'noul',instructions:'An event?'}}},compose:{id:'compose',type:'workflow',operation:'compose',mode:'template',template:'{{data:}}'},model:{id:'model',type:'workflow',operation:'model-call',outputKind:'data'}},wires:{a:edge('a','entry','out','decide','in'),b:edge('b','decide','out','compose','data'),c:edge('c','compose','out','model','prompt'),d:edge('d','model','out','exit','in')}});
function requestExecutor(seen,provider){return async(unit,inputs,local)=>{
 if(unit.node.operation==='for-each')return executeControl(unit.node,inputs,local);
 const metadata={childAddress:unit.address,modelRole:unit.node.modelRole,binding:{profileId:unit.node.profileId,model:unit.node.model}};
 if(unit.node.operation==='decision')return executeDecision(unit.node,inputs,{phase:local.phase,request:options=>local.request({...options,...metadata,capability:'text-completion'})});
 if(unit.node.operation==='model-call')return executeModelNode(unit.node,inputs,{phase:local.phase,request:options=>local.request({...options,...metadata,capability:'text-completion'})});
 return executePrimitive(unit.node,inputs,{phase:local.phase});
};}

test('Decision and Model Call share ordered per-iteration requests and real child provenance',async()=>{
 const fixture=setup(requestHelper()),compiled=compile(fixture,{requestBoundPerIteration:2});assert.equal(compiled.ok,true,JSON.stringify(compiled.error));assert.equal(compiled.data.description.requestBound,2);
 const seen=[];const request=async options=>{seen.push(options);return options.iteration.childAddress.nodeId==='decide'?{ok:true,data:{text:'{"answers":{"event":{"type":"noul","accepted":true}}}',finish:'stop',usage:{input_tokens:2,output_tokens:1}}}:{ok:true,data:{text:'{"observation":"surprise"}',finish:'stop',usage:{input:3,output:2}}};};
 const each={type:'workflow',operation:'for-each',helper:fixture.ref,mode:'map',limit:2,requestBoundPerIteration:2};
 const result=await executeControl(each,{in:data([{amount:1},{amount:2}])},{address,phase:'pre',rootMode:'native-unified',request,iterateHelper:(call,ports)=>compiler.executeCompiledIteration(compiled.data.token,call,{...ports,executeUnit:requestExecutor()})});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.outputs.out.value,[{observation:'surprise'},{observation:'surprise'}]);assert.deepEqual(seen.map(x=>x.capability),['text-completion','text-completion','text-completion','text-completion']);
 assert.deepEqual(seen.map(x=>x.iteration.childAddress.instancePath),[['each','iteration-0'],['each','iteration-0'],['each','iteration-1'],['each','iteration-1']]);assert.deepEqual(seen.map(x=>x.iteration.childAddress.nodeId),['decide','model','decide','model']);
});

test('nested mixed helper requests retain both finite wrappers and actual nested child identities',async()=>{
 const child=requestHelper('mixed-child'),ref={id:child.id,version:1,semanticHash:child.semanticHash};const parent=definition({id:'nested-models',nodes:{nested:{id:'nested',type:'workflow',operation:'for-each',helper:ref,limit:2,requestBoundPerIteration:2}},wires:{a:edge('a','entry','out','nested','in'),b:edge('b','nested','out','exit','in')}}),fixture=setup(parent,{[definitionRefKey(ref)]:child}),compiled=compile(fixture,{requestBoundPerIteration:4});assert.equal(compiled.ok,true,JSON.stringify(compiled.error));assert.equal(compiled.data.description.requestBound,4);
 const seen=[];const request=async options=>{seen.push(options);return options.iteration.childAddress.nodeId==='decide'?{ok:true,data:{text:'{"answers":{"event":{"type":"noul","accepted":true}}}',finish:'stop',usage:{input_tokens:1,output_tokens:1}}}:{ok:true,data:{text:'{"done":true}',finish:'stop'}};};
 const each={type:'workflow',operation:'for-each',helper:fixture.ref,limit:1,requestBoundPerIteration:4};const result=await executeControl(each,{in:data([[{amount:1},{amount:2}]])},{address,phase:'pre',rootMode:'native-unified',request,iterateHelper:(call,ports)=>compiler.executeCompiledIteration(compiled.data.token,call,{...ports,executeUnit:requestExecutor()})});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(seen.length,4);assert.deepEqual(result.outputs.out.value,[[{done:true},{done:true}]]);assert.deepEqual(seen[2].iteration.childAddress.instancePath,['each','iteration-0','nested','iteration-1']);
 const tooSmall=compile(fixture,{requestBoundPerIteration:3});assert.equal(tooSmall.ok,false);assert.equal(tooSmall.error.code,'ITERATION_CALL_LIMIT');
});

test('helper output admission rejects getters, undeclared pins and malformed visibility',async()=>{
 const fixture=setup(definition({nodes:{select:{id:'select',type:'workflow',operation:'select-fields',fields:[]}},wires:{a:edge('a','entry','out','select','in'),b:edge('b','select','out','exit','in')}})),compiled=compile(fixture);assert.equal(compiled.ok,true);
 let reads=0;for(const response of [{ok:true,outputs:{extra:data('bad')}},{ok:true,artifact:{...data('bad'),visibility:{kind:'actor-private'}}},{ok:true,artifact:{kind:'data',get value(){reads++;return 'secret';}}}]){const result=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture),{executeUnit:()=>response});assert.equal(result.ok,false);assert.equal(result.artifact,undefined);}assert.equal(reads,0);
});

test('compiler rejects over-deep qualified helpers before an adapter can run',()=>{
 const fixture=setup(definition()),result=compile(fixture,{address:{...address,instancePath:Array.from({length:8},(_,i)=>'scope'+i)}});assert.equal(result.ok,false);
});

test('pinned nested instance role and explicit node overrides survive compiler mounting',async()=>{
 const child=definition({id:'bound-child',roles:{Prose:{profileId:'body-profile',model:'body-model'}},nodes:{compose:{id:'compose',type:'workflow',operation:'compose',mode:'template',template:'{{data:}}'},model:{id:'model',type:'workflow',operation:'model-call',outputKind:'data'}},wires:{a:edge('a','entry','out','compose','data'),b:edge('b','compose','out','model','prompt'),c:edge('c','model','out','exit','in')}}),ref={id:child.id,version:1,semanticHash:child.semanticHash};
 const parent=definition({id:'bound-parent',nodes:{wrapper:{id:'wrapper',type:'subgraph',definition:ref,roleOverrides:{Prose:{profileId:'override-profile',model:'override-model'}},nodeBindingOverrides:{[JSON.stringify([[],'model'])]:{profileId:'node-profile',model:'node-model'}}}},wires:{a:edge('a','entry','out','wrapper','item'),b:edge('b','wrapper','result','exit','in')}}),fixture=setup(parent,{[definitionRefKey(ref)]:child}),compiled=compile(fixture,{requestBoundPerIteration:1});assert.equal(compiled.ok,true,JSON.stringify(compiled.error));let binding;
 const result=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture),{request:async()=>({ok:true,data:{text:'{"ok":true}',finish:'stop'}}),executeUnit:(unit,inputs,local)=>{if(unit.node.operation==='model-call'){binding={profileId:unit.node.profileId,model:unit.node.model,role:local.roles.Prose};return executeModelNode(unit.node,inputs,{phase:local.phase,request:local.request});}return executePrimitive(unit.node,inputs,{phase:local.phase});}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(binding,{profileId:'node-profile',model:'node-model',role:{profileId:'override-profile',model:'override-model'}});assert.equal(child.body.nodes.model.profileId,undefined);
});

test('every crossed branch output executes once and skipped helper result holds publication',async()=>{
 const branch=definition({nodes:{condition:{id:'condition',type:'workflow',operation:'condition',path:['selected'],value:true},branch:{id:'branch',type:'workflow',operation:'branch'}},wires:{a:edge('a','entry','out','condition','in'),b:edge('b','entry','out','branch','in'),c:edge('c','condition','out','branch','condition'),d:edge('d','branch','yes','exit','in')}}),fixture=setup(branch),compiled=compile(fixture);assert.equal(compiled.ok,true,JSON.stringify(compiled.error));let calls=0;
 const executeUnit=(unit,inputs,local)=>{calls++;return executeControl(unit.node,inputs,local);};const selected=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture,{item:{selected:true}}),{executeUnit});assert.equal(selected.ok,true);assert.equal(calls,2);
 const skipped=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture,{item:{selected:false}}),{executeUnit});assert.equal(skipped.ok,false);assert.equal(skipped.error.code,'ITERATION_OUTPUT_UNRESOLVED');assert.equal(skipped.artifact,undefined);
});

test('compiler rejects IDs too long to preserve actual iteration request addresses',()=>{
 const id='u'.repeat(129),fixture=setup(definition({nodes:{[id]:{id,type:'workflow',operation:'select-fields',fields:[]}},wires:{a:edge('a','entry','out',id,'in'),b:edge('b',id,'out','exit','in')}}));const result=compile(fixture);assert.equal(result.ok,false);assert.equal(result.error.code,'ITERATION_ADDRESS_LIMIT');
});

test('immutable helper execution rejects accessor envelope without evaluating it',async()=>{
 const fixture=setup(definition({nodes:{select:{id:'select',type:'workflow',operation:'select-fields',fields:[]}},wires:{a:edge('a','entry','out','select','in'),b:edge('b','select','out','exit','in')}})),compiled=compile(fixture);let reads=0;
 const result=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture),{executeUnit:()=>({get ok(){reads++;return true;},artifact:data('bad')})});assert.equal(result.ok,false);assert.equal(reads,0);
});

test('helper outputs require their declared Data value and bounded Text body',async()=>{
 const fixture=setup(definition({nodes:{select:{id:'select',type:'workflow',operation:'select-fields',fields:[]}},wires:{a:edge('a','entry','out','select','in'),b:edge('b','select','out','exit','in')}})),compiled=compile(fixture);
 const noValue=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture),{executeUnit:()=>({ok:true,artifact:{kind:'data'}})});assert.equal(noValue.ok,false);assert.equal(noValue.error.code,'INVALID_ITERATION_OUTPUT');
 const textDef=definition({nodes:{compose:{id:'compose',type:'workflow',operation:'compose',mode:'template',template:'{{data:}}'},decode:{id:'decode',type:'workflow',operation:'json-decode'}},wires:{a:edge('a','entry','out','compose','data'),b:edge('b','compose','out','decode','in'),c:edge('c','decode','out','exit','in')}}),textFixture=setup(textDef),textCompiled=compile(textFixture);let decodeCalls=0;
 const badText=await compiler.executeCompiledIteration(textCompiled.data.token,invocation(textFixture),{executeUnit:unit=>{if(unit.node.operation==='compose')return {ok:true,artifact:{kind:'text',text:7}};decodeCalls++;return {ok:true,artifact:data('untrusted')};}});assert.equal(badText.ok,false);assert.equal(badText.error.code,'INVALID_ITERATION_OUTPUT');assert.equal(decodeCalls,0);
});

test('valid real root definition chain cannot push iteration addresses beyond depth 8',()=>{
 const leaf=definition({id:'depth-leaf'}),leafRef={id:leaf.id,version:1,semanticHash:leaf.semanticHash};let previous=leaf,defs={[definitionRefKey(leafRef)]:leaf},path=[];
 for(let index=0;index<7;index++){const previousRef={id:previous.id,version:1,semanticHash:previous.semanticHash},wrapper='scope'+index;previous=definition({id:'depth-'+index,nodes:{[wrapper]:{id:wrapper,type:'subgraph',definition:previousRef}},wires:{a:edge('a','entry','out',wrapper,'item'),b:edge('b',wrapper,'result','exit','in')}});defs[definitionRefKey(previous)]=previous;path.unshift(wrapper);}
 const top={id:previous.id,version:1,semanticHash:previous.semanticHash};const root={id:'root',schema:3,runtime:2,mode:'native-unified',nodes:{outer:{id:'outer',type:'subgraph',definition:top}},wires:{},definitions:defs};
 const result=compiler.compileIterationHelper(root,{helper:leafRef,mode:'map',phase:'pre',address:{...address,instancePath:['outer',...path.slice(0,6)]},requestBoundPerIteration:0});assert.equal(result.ok,false);assert.equal(result.error.code,'ITERATION_DEPTH');
});

function repin(raw){const copy=structuredClone(raw);delete copy.semanticHash;const checked=computeDefinitionIdentity(copy);assert.equal(checked.ok,true,JSON.stringify(checked.error));return {...checked.data.materializedDefinition,semanticHash:checked.data.semanticHash};}

test('all declared helper outputs must be connected even when map does not select nextState',()=>{
 const raw=structuredClone(definition({stateful:true}));delete raw.body.wires.state;const result=compile(setup(repin(raw)));assert.equal(result.ok,false);assert.equal(result.error.code,'MISSING_INPUT');
});

test('a required helper projectedState cannot be fabricated when invocation omits it',async()=>{
 const raw=structuredClone(definition({stateful:true}));raw.interface.find(port=>port.id==='projectedState').required=true;const fixture=setup(repin(raw)),compiled=compile(fixture);assert.equal(compiled.ok,true,JSON.stringify(compiled.error));let effects=0;
 const result=await compiler.executeCompiledIteration(compiled.data.token,invocation(fixture),{executeUnit:()=>{effects++;return {ok:true,artifact:data('bad')};}});assert.equal(result.ok,false);assert.equal(effects,0);
});
