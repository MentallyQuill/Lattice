import assert from 'node:assert/strict';
import test from 'node:test';
import { describeOperation, operationDefaults } from '../src/workflow/catalog.js';
import { runWorkflow } from '../src/workflow/runtime.js';
import { exportWorkflow, parseWorkflow } from '../src/workflow/packages.js';
const chunkNode = (extra={}) => ({id:'chunk',type:'workflow',operation:'chunk',operationVersion:1,...extra});
const graph = (extra={}) => ({id:'chunk-workflow',schema:4,runtime:3,mode:'native-unified',nodes:{text:{id:'text',type:'workflow',operation:'text',operationVersion:1,text:'A\r\n\r\nB'},chunk:chunkNode(extra)},wires:{input:{id:'input',route:'wire',from:'text',fromPort:'out',to:'chunk',toPort:'in'}}});
const target={workflowId:'chunk-workflow',instancePath:[],nodeId:'chunk',portId:'out'};
test('Chunk is an actual gated catalog/runtime operation with raw array output and separate manifest/report',async()=>{
 const node=chunkNode({targetSize:5});const described=describeOperation(graph(),node);assert.equal(described.ok,true,JSON.stringify(described.error));
 assert.equal(described.data.descriptor.minimumRuntime,3);assert.equal(described.data.ports.find(p=>p.id==='out').semanticShape,'records/chunk/v1');
 assert.equal(operationDefaults('chunk').operationVersion,1);
 assert.equal(describeOperation({...graph(),schema:3,runtime:2},node).error.code,'UNSUPPORTED_VERSION');
 const input=graph({targetSize:5});const parsed=parseWorkflow(JSON.stringify(exportWorkflow(input)));assert.equal(parsed.ok,true);
 const result=await runWorkflow(parsed.data,{target});assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,0);
 const data=result.recording.artifacts.filter(a=>a.origin.direction==='output'&&a.kind==='data').map(a=>a.value.value);
 const records=data.find(Array.isArray);assert.deepEqual(records.map(r=>[r.text,r.inputSpan]),[['A\r\n\r\n',{start:0,end:5,unit:'utf16'}],['B',{start:5,end:6,unit:'utf16'}]]);
 assert.ok(records.every(r=>r.sourceRefs.length===0&&r.mapping==='unmapped'));
 assert.equal(data.find(v=>v.type==='derivation-manifest').entries.length,2);assert.equal(data.find(v=>v.recordType==='chunk-report').actualCalls,0);
});
import { executeChunk,validateChunkSettings } from '../src/workflow/operations/chunk.js';
const local={address:{workflowId:'literal-test',instancePath:[],nodeId:'chunk'}};
const run=(text,settings={},options={})=>executeChunk(chunkNode(settings),{in:{kind:'text',text}}, {...local,...options});
const binding={tokenizerId:'fixture-exact',version:'1',model:'fixture-model'};
test('explicit matching tokenizer measures exact overlap candidates and reports bounded calls',async()=>{
 const seen=[];const result=await run('abcdef',{strategy:'fixed',sizeUnit:'tokens',targetSize:3,overlap:1,tokenizerBinding:binding},{chunkTokenizer:{binding,countTokens:async(text,options)=>{seen.push(text);return {tokens:text.length};}}});
 assert.equal(result.ok,true,JSON.stringify(result.error));
 assert.deepEqual(result.outputs.out.value.map(r=>r.text),['abc','cde','ef']);assert.ok(seen.every(t=>typeof t==='string'));
 assert.equal(result.outputs.report.value.tokenizerCalls,seen.length);assert.deepEqual(result.outputs.report.value.tokenizerBinding,binding);
 const noBinding=validateChunkSettings({sizeUnit:'tokens'});assert.equal(noBinding.ok,false);
});
test('Text ranges preserve whitespace, natural CRLF boundaries and complete Unicode graphemes',async()=>{
 for(const [text,settings,expected] of [
  ['',{},[]],[' \t\r\n',{targetSize:8},[' \t\r\n']],['A\n\nB\r\rC',{targetSize:3},['A\n\n','B\r\r','C']],
  ['Hi. Bye!',{strategy:'sentence',targetSize:5},['Hi. ','Bye!']],
  ['x👨‍👩‍👧‍👦e\u0301🇺🇸👍🏽',{strategy:'fixed',targetSize:11},['x','👨‍👩‍👧‍👦','e\u0301🇺🇸👍🏽']],
 ]) {
  const result=await run(text,settings);assert.equal(result.ok,true,JSON.stringify(result.error));
  assert.deepEqual(result.outputs.out.value.map(r=>r.text),expected);
  assert.equal(result.outputs.out.value.map(r=>r.text).join(''),text);
  for(const r of result.outputs.out.value)assert.equal(text.slice(r.inputSpan.start,r.inputSpan.end),r.text);
  assert.equal(result.outputs.report.value.status,text?'complete':'empty');
 }
 assert.equal((await run('e\u0301',{targetSize:1})).error.code,'CHUNK_ATOM_TOO_LARGE');
 assert.equal((await run('😀',{targetSize:1})).error.code,'CHUNK_ATOM_TOO_LARGE');
});
test('Chunk settings, complete inputs, output limits and private proof refusals fail atomically without getters',async()=>{
 for(const settings of [{targetSize:0},{targetSize:1.2},{overlap:2048},{separator:'x'.repeat(129)},{sentenceLocale:'not_a_locale',strategy:'sentence'},{strategy:'assistant-turns'},{inputMode:'context',strategy:'assistant-turns',overlap:1},{sizeUnit:'tokens',targetSize:8193,tokenizerBinding:binding}])assert.equal(validateChunkSettings(settings).ok,false);
 let invoked=0;const input={kind:'text',text:'safe',unused:{get secret(){invoked++;return 'bad';}}};
 const result=await executeChunk(chunkNode(),{in:input},local);assert.equal(result.error.code,'INVALID_CHUNK_INPUT');assert.equal(invoked,0);
 const node=chunkNode();Object.defineProperty(node,'targetSize',{enumerable:true,get(){invoked++;return 1;}});assert.equal((await executeChunk(node,{in:{kind:'text',text:'safe'}},local)).error.code,'INVALID_CHUNK_SETTINGS');assert.equal(invoked,0);
 for(const [text,settings] of [['abc',{targetSize:1,maxChunks:2}],['x'.repeat(100001),{}],['x'.repeat(100000),{strategy:'fixed',targetSize:50000,overlap:49000}]]) {
  const result=await run(text,settings);assert.equal(result.ok,false);assert.equal(result.error.code,'CHUNK_LIMIT');assert.equal(result.outputs,undefined);
 }
 const forged={kind:'data',value:{type:'source-manifest',schemaVersion:1}};
 assert.equal((await executeChunk(chunkNode(),{in:{kind:'text',text:'source'},sourceManifest:forged},local)).error.code,'CHUNK_SOURCE_REQUIRED');
 for(const strategy of ['paragraph','assistant-turns'])assert.equal((await executeChunk(chunkNode({inputMode:'context',strategy}),{in:{kind:'context',messages:[{id:'u',role:'user',text:'A'},{id:'a',role:'assistant',text:'B'}]},sourceManifest:forged},local)).error.code,strategy==='assistant-turns'?'CHUNK_TURN_SOURCE_REQUIRED':'CHUNK_SOURCE_REQUIRED');
 assert.equal((await executeChunk(chunkNode({inputMode:'context'}),{in:{kind:'context',messages:[]}},local)).outputs.out.value.length,0);
});
test('identity is deterministic, scope-local and sensitive to segmentation settings; privacy follows all inputs',async()=>{
 const first=await run('abc',{strategy:'fixed',targetSize:2}),again=await run('abc',{strategy:'fixed',targetSize:2});
 assert.deepEqual(first.outputs,again.outputs);
 const changed=await run('abc',{strategy:'fixed',targetSize:3}),elsewhere=await run('abc',{strategy:'fixed',targetSize:2},{address:{...local.address,workflowId:'elsewhere'}});
 assert.notEqual(first.outputs.out.value[0].id,changed.outputs.out.value[0].id);assert.notEqual(first.outputs.out.value[0].id,elsewhere.outputs.out.value[0].id);
 const privateResult=await executeChunk(chunkNode(),{in:{kind:'text',text:'abc',visibility:{kind:'actor-private',actorId:'actor'}}},local);
 assert.equal(privateResult.ok,true);for(const value of Object.values(privateResult.outputs))assert.deepEqual(value.visibility,{kind:'actor-private',actorId:'actor'});
 assert.deepEqual(privateResult.outputs.out.value[0].visibility,{kind:'actor-private',actorId:'actor'});
});
test('tokenizer failures, exhausted bounds and cancellation discard all partial outputs and late replies',async()=>{
 const settings={strategy:'fixed',sizeUnit:'tokens',targetSize:2,tokenizerBinding:binding};let calls=0;
 for(const tokens of [NaN,Infinity,-1,1.2,'2']) {
  const result=await run('abc',settings,{chunkTokenizer:{binding,countTokens:async()=>({tokens})}});assert.equal(result.error.code,'TOKEN_COUNT_FAILED');assert.equal(result.outputs,undefined);
 }
 const mismatch=await run('abc',settings,{countTokens:()=>{throw Error('ambient');},chunkTokenizer:{binding:{...binding,version:'2'},countTokens:()=>{throw Error('wrong binding');}}});assert.equal(mismatch.error.code,'TOKEN_COUNT_FAILED');
 const bounded=await run('abcdef',{...settings,maxTokenizerCalls:2},{chunkTokenizer:{binding,countTokens:async text=>{calls++;return {tokens:text.length};}}});assert.equal(bounded.error.code,'CHUNK_LIMIT');assert.equal(calls,2);assert.equal(bounded.outputs,undefined);
 const controller=new AbortController();let late;const pending=run('abc',settings,{signal:controller.signal,chunkTokenizer:{binding,countTokens:()=>new Promise(resolve=>{late=resolve;})}});
 while(!late)await new Promise(resolve=>setImmediate(resolve));controller.abort();const cancelled=await pending;assert.equal(cancelled.error.code,'ABORTED');late({tokens:1});assert.equal(cancelled.outputs,undefined);
});
import { prepareNodeControlChange } from '../src/workflow/ports.js';
test('input mode changes require explicit incompatible-wire removal in one editor candidate',()=>{
 const input=graph();const before=structuredClone(input);
 const refused=prepareNodeControlChange(input,{nodeId:'chunk',controls:{inputMode:'context'}});assert.equal(refused.ok,false);assert.deepEqual(input,before);
 const changed=prepareNodeControlChange(input,{nodeId:'chunk',controls:{inputMode:'context'},removeEdgeIds:['input']});assert.equal(changed.ok,true,JSON.stringify(changed.error));assert.equal(changed.data.candidate.nodes.chunk.inputMode,'context');assert.equal(Object.keys(changed.data.candidate.wires).length,0);assert.deepEqual(input,before);
});
import { computeDefinitionIdentity,definitionRefKey } from '../src/workflow/definition-data.js';
import { validateGraphStructure } from '../src/workflow/contracts.js';
const signed=raw=>{const checked=computeDefinitionIdentity(raw);assert.equal(checked.ok,true,JSON.stringify(checked.error));return {...checked.data.materializedDefinition,semanticHash:checked.data.semanticHash};};
const sinkDefinition=(semanticShape)=>signed({id:'sink',version:1,name:'Sink',parameters:[],interface:[{id:'input',label:'Input',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry',...(semanticShape?{semanticShape}:{})}],body:{schema:4,runtime:3,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'input'}},wires:{}}});
test('semantic shapes survive semantic hashes/package roundtrip and reject incompatible known wires',()=>{
 const known=sinkDefinition('source-manifest/v1'),generic=sinkDefinition();assert.notEqual(known.semanticHash,generic.semanticHash);
 for(const shape of ['source-manifest/v1','record-list/v1',undefined]) {
  const def=sinkDefinition(shape),key=definitionRefKey(def),input=graph();input.definitions={[key]:def};input.nodes.sink={id:'sink',type:'subgraph',definition:{id:def.id,version:1,semanticHash:def.semanticHash}};input.wires.result={id:'result',route:'wire',from:'chunk',fromPort:'out',to:'sink',toPort:'input'};
  const checked=validateGraphStructure(input);assert.equal(checked.ok,shape!=='source-manifest/v1',JSON.stringify(checked.error));
  if(checked.ok) {const parsed=parseWorkflow(JSON.stringify(exportWorkflow(input)));assert.equal(parsed.ok,true,JSON.stringify(parsed.error));assert.equal(Object.values(parsed.data.definitions)[0].interface[0].semanticShape,shape);}
 }
});
test('a selected tokenizer binding change during an awaited count invalidates the entire result',async()=>{
 const mutable={...binding};const result=await run('ab',{sizeUnit:'tokens',tokenizerBinding:binding},{chunkTokenizer:{binding:mutable,countTokens:async()=>{mutable.version='changed';return {tokens:1};}}});
 assert.equal(result.ok,false);assert.equal(result.error.code,'TOKEN_COUNT_FAILED');assert.equal(result.outputs,undefined);
});
import { prepareCreateFromSelection,prepareUnpack } from '../src/workflow/composition-transform.js';
test('runtime-3 Chunk composition preserves versions and typed output boundaries',async()=>{
 const root=graph({targetSize:5});const collapsed=prepareCreateFromSelection(root,{nodeIds:['chunk'],definitionId:'chunk-body',name:'Chunk body',instanceId:'wrapped'});assert.equal(collapsed.ok,true,JSON.stringify(collapsed.error));
 const candidate=collapsed.data.candidate;const def=Object.values(candidate.definitions).find(d=>d.id==='chunk-body');assert.equal(def.body.schema,4);assert.equal(def.body.runtime,3);assert.ok(def.interface.some(p=>p.semanticShape==='records/chunk/v1'));
 const out=def.interface.find(p=>p.semanticShape==='records/chunk/v1');const result=await runWorkflow(candidate,{target:{...target,nodeId:'wrapped',portId:out.id}});assert.equal(result.ok,true,JSON.stringify(result.error));
 const unpacked=prepareUnpack(candidate,{instanceId:'wrapped'});assert.equal(unpacked.ok,true,JSON.stringify(unpacked.error));assert.equal(unpacked.data.candidate.schema,4);
});
test('preview and skipped upstream paths make no tokenizer or model requests through real runtime dispatch',async()=>{
 let counted=0,requested=0;const options={target,chunkTokenizer:{binding,countTokens:async text=>{counted++;return {tokens:text.length};}},request:()=>{requested++;throw Error('no model');}};
 const input=graph({sizeUnit:'tokens',targetSize:5,tokenizerBinding:binding});
 const preview=await runWorkflow(input,{...options,preview:true});assert.equal(preview.ok,true,JSON.stringify(preview.error));assert.equal(counted,0);assert.equal(requested,0);
 input.nodes.decisionText={id:'decisionText',type:'workflow',operation:'text',text:'false'};input.nodes.decision={id:'decision',type:'workflow',operation:'json-decode'};input.nodes.branch={id:'branch',type:'workflow',operation:'branch',artifactKind:'text'};
 const edge=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});input.wires={a:edge('a','decisionText','out','decision','in'),b:edge('b','decision','out','branch','condition'),c:edge('c','text','out','branch','in'),d:edge('d','branch','yes','chunk','in')};const skipped=await runWorkflow(input,options);assert.equal(skipped.ok,true,JSON.stringify(skipped.error));assert.equal(counted,0);assert.equal(requested,0);
});
import { compileIterationHelper } from '../src/workflow/iteration-helpers.js';
test('runtime-3 pinned iteration helpers mount and execute real Chunk without synthetic legacy downgrade',async()=>{
 const edge=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});
 const def=signed({id:'chunk-helper',version:1,name:'Chunk helper',parameters:[],interface:[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit',semanticShape:'records/chunk/v1'}],body:{schema:4,runtime:3,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},compose:{id:'compose',type:'workflow',operation:'compose',mode:'template',template:'{{data:}}'},chunk:chunkNode({strategy:'fixed',targetSize:16}),exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'}},wires:{a:edge('a','entry','out','compose','data'),b:edge('b','compose','out','chunk','in'),c:edge('c','chunk','out','exit','in')}}});
 const ref={id:def.id,version:1,semanticHash:def.semanticHash};
 const input={id:'helper-runtime',schema:4,runtime:3,mode:'native-unified',definitions:{[definitionRefKey(def)]:def},nodes:{text:{id:'text',type:'workflow',operation:'text',text:'["ab","cd"]'},decode:{id:'decode',type:'workflow',operation:'json-decode'},each:{id:'each',type:'workflow',operation:'for-each',helper:ref,limit:2,requestBoundPerIteration:0}},wires:{a:edge('a','text','out','decode','in'),b:edge('b','decode','out','each','in')}};
 const compiled=compileIterationHelper(input,{helper:ref,mode:'map',phase:'pre',address:{workflowId:input.id,instancePath:[],nodeId:'each'},requestBoundPerIteration:0});assert.equal(compiled.ok,true,JSON.stringify(compiled.error));
 const result=await runWorkflow(input,{target:{workflowId:input.id,instancePath:[],nodeId:'each',portId:'out'}});assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,0);
 assert.equal(validateGraphStructure({...input,schema:3,runtime:2}).error.code,'UNSUPPORTED_VERSION');
});
test('namespaced metadata is detached and preserved, with aggregate output admission remaining atomic',async()=>{
 const metadata={'fixture:tags':['source-doc'], 'fixture:info':{label:'safe'}};const input={in:{kind:'text',text:'abcd',metadata}};
 const result=await executeChunk(chunkNode({strategy:'fixed',targetSize:2}),input,local);assert.equal(result.ok,true);assert.deepEqual(result.outputs.out.value.map(r=>r.metadata),[metadata,metadata]);assert.notEqual(result.outputs.out.value[0].metadata,metadata);
 const oversized=await executeChunk(chunkNode({strategy:'fixed',targetSize:2}),{in:{kind:'text',text:'abcd',metadata:{'fixture:large':'x'.repeat(140000)}}},local);assert.equal(oversized.error.code,'CHUNK_LIMIT');assert.equal(oversized.outputs,undefined);
});
test('a legacy helper in a runtime-3 document retains its owner version while unrelated runtime-3 snapshots stay bundled',()=>{
 const def=signed({id:'legacy-helper',version:1,name:'Legacy identity',parameters:[],interface:[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'}],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'}},wires:{pass:{id:'pass',route:'wire',from:'entry',fromPort:'out',to:'exit',toPort:'in'}}}});
 const modern=sinkDefinition('records/chunk/v1'),ref={id:def.id,version:1,semanticHash:def.semanticHash},input={id:'mixed-helper',schema:4,runtime:3,mode:'native-unified',nodes:{},wires:{},definitions:{[definitionRefKey(def)]:def,[definitionRefKey(modern)]:modern}};
 const result=compileIterationHelper(input,{helper:ref,mode:'map',phase:'pre',address:{workflowId:input.id,instancePath:[],nodeId:'each'},requestBoundPerIteration:0});assert.equal(result.ok,true,JSON.stringify(result.error));
});
test('checked execution scope seeds authored Text identity while public node/input scope cannot supply source authority',async()=>{
 const scope={userId:'captured-user',chatId:'captured-chat',actorId:'actor',branchId:'branch'};
 const result=await run('literal',{}, {chunkScope:scope});assert.equal(result.ok,true);assert.deepEqual(result.outputs.out.value[0].scope,scope);assert.deepEqual(result.outputs.manifest.value.scope,scope);assert.deepEqual(result.outputs.out.value[0].sourceRefs,[]);
 const changed=await run('literal',{}, {chunkScope:{...scope,chatId:'another-chat'}});assert.notEqual(result.outputs.out.value[0].id,changed.outputs.out.value[0].id);
 const invalid=await run('literal',{}, {chunkScope:{userId:'u'}});assert.equal(invalid.error.code,'CHUNK_SOURCE_MISMATCH');
 const fallback=await executeChunk(chunkNode({scope}),{in:{kind:'text',text:'literal',scope}},local);assert.equal(fallback.outputs.out.value[0].scope.userId,'workflow:literal-test');assert.deepEqual(fallback.outputs.out.value[0].sourceRefs,[]);
});
import { makeClip } from '../src/workflow/clipboard.js';
import { materializeInstanceDefinition } from '../src/workflow/definition-library.js';
import { nodeBindingOverrideKey } from '../src/workflow/definition-data.js';
test('runtime-3 subgraph clipboard capture preserves its version instead of using a synthetic legacy body',()=>{
 const collapsed=prepareCreateFromSelection(graph(),{nodeIds:['chunk'],definitionId:'copy-body',name:'Chunk body',instanceId:'wrapped'});assert.equal(collapsed.ok,true);
 const clip=makeClip(collapsed.data.candidate,{nodeIds:['wrapped']});assert.equal(clip.ok,true,JSON.stringify(clip.error));assert.equal(clip.data.schema,3);assert.equal(clip.data.graph.schema,4);assert.equal(clip.data.minRuntime,3);
});
test('portable null-binding shells retain runtime-3 definition requirements',()=>{
 const def=signed({id:'v4-model',version:1,name:'V4 model',interface:[],parameters:[],body:{schema:4,runtime:3,mode:'native-unified',nodes:{work:{id:'work',type:'workflow',operation:'response-plan'}},wires:{}}});
 const root={id:'v4-shell',schema:4,runtime:3,mode:'native-unified',nodes:{wrapped:{id:'wrapped',type:'subgraph',definition:{id:def.id,version:1,semanticHash:def.semanticHash},nodeBindingOverrides:{[nodeBindingOverrideKey([],'work')]:{model:null}}}},wires:{},definitions:{[definitionRefKey(def)]:def}};
 const result=materializeInstanceDefinition(root,{instancePath:['wrapped'],id:'portable-v4'});assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.data.definition.body.schema,4);assert.equal(result.data.definition.body.runtime,3);
});
test('execution rejects wrong operation identity/version before segmentation',async()=>{
 for(const node of [chunkNode({operation:'text'}),chunkNode({operationVersion:2})]){const result=await executeChunk(node,{in:{kind:'text',text:'abc'}},local);assert.equal(result.ok,false);assert.equal(result.outputs,undefined);}
});
test('raw Chunk arrays feed real Collection and For Each root inputs without wrapper paths',async()=>{
 const identity=signed({id:'raw-identity',version:1,name:'Identity',parameters:[],interface:[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'}],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'}},wires:{pass:{id:'pass',route:'wire',from:'entry',fromPort:'out',to:'exit',toPort:'in'}}}});
 const input=graph({strategy:'fixed',targetSize:3});input.nodes.text.text='abcdef';input.definitions={[definitionRefKey(identity)]:identity};input.nodes.collection={id:'collection',type:'workflow',operation:'collection',mode:'count',collectionPath:[]};input.nodes.each={id:'each',type:'workflow',operation:'for-each',helper:{id:identity.id,version:1,semanticHash:identity.semanticHash},limit:2};
 for(const id of ['collection','each'])input.wires[id]={id,route:'wire',from:'chunk',fromPort:'out',to:id,toPort:'in'};
 for(const id of ['collection','each']){const result=await runWorkflow(input,{target:{...target,nodeId:id}});assert.equal(result.ok,true,JSON.stringify(result.error));const last=result.recording.artifacts.filter(a=>a.origin.direction==='output'&&a.kind==='data').at(-1).value.value;if(id==='collection')assert.equal(last,2);else assert.deepEqual(last.map(r=>r.text),['abc','def']);}
});
test('nonmonotone token overlap is a suffix of only the immediately previous chunk',async()=>{
 const result=await run('abcdefg',{strategy:'fixed',sizeUnit:'tokens',targetSize:3,overlap:1,tokenizerBinding:binding},{chunkTokenizer:{binding,countTokens:async text=>({tokens:text==='bcde'?1:text.length})}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.outputs.out.value.map(r=>r.text),['abc','cde','efg']);
});
