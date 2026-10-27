import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runWorkflow, runWorkflowForHost } from '../src/workflow/runtime.js';
import { expandRecordAddress } from '../src/workflow/record-data.js';
const node=(id,operation,settings={})=>({id,type:'workflow',operation,...settings});
const wire=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});
const target=nodeId=>({workflowId:'recovery',instancePath:[],nodeId,portId:'out'});
function branches(){return {id:'recovery',schema:3,runtime:2,mode:'native-unified',nodes:{prompt:node('prompt','text',{text:'Prompt'}),bad:node('bad','model-call'),good:node('good','model-call'),compose:node('compose','compose',{sections:[{name:'bad',text:'',onSkipped:'omit'},{name:'good',text:''}]})},wires:{bad:wire('bad','prompt','out','bad','prompt'),good:wire('good','prompt','out','good','prompt'),a:wire('a','bad','out','compose','section.bad'),b:wire('b','good','out','compose','section.good')}};}
const failed={ok:false,error:{code:'REQUEST_FAILED',message:'The model request failed.'}};
const ports={failurePolicy:'continue-available',target:target('compose'),resolveBinding:node=>({ok:true,data:{profileId:node.id}}),countTokens:async()=>({tokens:1}),request:async({binding})=>binding.profileId==='bad'?failed:{ok:true,data:{text:'Surviving guidance',finish:'stop'}}};
const unit=(result,id)=>result.recording.units.find(unit=>expandRecordAddress(result.recording,unit.address).nodeId===id);
const output=(result,id)=>{const port=unit(result,id).ports.find(port=>port.direction==='output');return result.recording.artifacts.find(artifact=>artifact.id===port?.artifact)?.value;};
test('recovery preserves an independent result and omits failed optional Compose input',async()=>{
 const result=await runWorkflow(branches(),ports);
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.recovered,true);assert.equal(result.recording.status,'partial');
 assert.equal(output(result,'compose').text,'Surviving guidance');assert.equal(unit(result,'bad').status,'failed');assert.equal(unit(result,'good').status,'completed');
 assert.equal(unit(result,'bad').ports.find(port=>port.direction==='output').artifact,null);
 assert.equal(result.failures[0].code,'REQUEST_FAILED');assert.equal(result.failures[0].address.nodeId,'bad');
});

test('required failed inputs block consumers while optional downstream boundaries still recover',async()=>{
 const graph=branches();graph.nodes.dependent=node('dependent','model-call');graph.wires.chain=wire('chain','bad','out','dependent','prompt');graph.wires.a=wire('a','dependent','out','compose','section.bad');
 const visited=[];const result=await runWorkflow(graph,{...ports,onStage:node=>visited.push(node.id)});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(unit(result,'dependent').status,'blocked');assert.equal(visited.includes('dependent'),false);assert.equal(output(result,'compose').text,'Surviving guidance');
 assert.equal(unit(result,'dependent').reason.code,'REQUEST_FAILED');
});
test('recovery fails when the selected required output has no surviving artifact',async()=>{
 const graph=branches();graph.nodes.compose.sections[0].required=true;
 let settlements=0;const result=await runWorkflowForHost(graph,ports,{settle(){settlements++;return {ok:true};}});
 assert.equal(result.ok,false);assert.equal(result.error.code,'RECOVERY_OUTPUT_UNAVAILABLE');assert.equal(unit(result,'compose').status,'blocked');assert.equal(settlements,0);
});
test('unavailable node-local bindings omit only their optional contribution',async()=>{
 const result=await runWorkflow(branches(),{...ports,resolveBinding:node=>node.id==='bad'?{ok:false,error:{code:'PROFILE_MISSING',message:'The fixed profile is missing.'}}:ports.resolveBinding(node)});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,1);assert.equal(output(result,'compose').text,'Surviving guidance');assert.equal(result.failures[0].code,'PROFILE_MISSING');
});
test('eager planner binding failure remains recoverable at an optional Guidance boundary',async()=>{
 const graph=branches();graph.nodes.context=node('context','scene-context');graph.nodes.bad=node('bad','response-plan');graph.wires.bad=wire('bad','context','out','bad','in');graph.nodes.compose.sections[0].kind='guidance';
 const result=await runWorkflow(graph,{...ports,snapshot:()=>({kind:'context',messages:[]}),resolveBinding:node=>node.id==='bad'?{ok:false,error:{code:'BINDING_MISSING',message:'Choose a fixed connection.'}}:ports.resolveBinding(node)});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(unit(result,'bad').status,'failed');assert.equal(unit(result,'good').status,'completed');assert.equal(result.actualCalls,1);
});
function nativeBranches(){
 const graph=branches();graph.nodes.compose.outputKind='guidance';graph.nodes.send=node('send','on-send');graph.nodes.generate=node('generate','generate-reply');graph.nodes.review=node('review','review-publish');
 graph.wires.activation=wire('activation','send','activation','generate','activation');graph.wires.guidance=wire('guidance','compose','out','generate','guidance');graph.wires.review=wire('review','generate','draft','review','draft');graph.runTargets=[{instancePath:[],nodeId:'review'}];return graph;
}
const nativeHost=(seen=[])=>({executeHostOperation(node,inputs){if(node.operation==='on-send')return {ok:true,outputs:{activation:{kind:'data',value:true}}};if(node.operation==='generate-reply'){seen.push(inputs.guidance?.text);return {ok:true,outputs:{draft:{kind:'draft',text:'Native reply.',source:{originalText:'Native reply.'}},metadata:{kind:'data',value:{}}}};}throw new Error('Unexpected host operation');}});
test('five branches release the native stage barrier with exactly three surviving contributions',async()=>{
 const graph=nativeBranches(),seen=[];graph.nodes.compose.sections=[];
 for(const id of ['bad','good','third','fourth','fifth']){graph.nodes[id]=node(id,'model-call');graph.wires[id]=wire(id,'prompt','out',id,'prompt');graph.wires['section-'+id]=wire('section-'+id,id,'out','compose','section.'+id);graph.nodes.compose.sections.push({name:id,text:'',onSkipped:'omit'});}
 delete graph.wires.a;delete graph.wires.b;
 let settlement;const result=await runWorkflowForHost(graph,{...ports,target:undefined,request:async({binding})=>['bad','fourth'].includes(binding.profileId)?failed:{ok:true,data:{text:binding.profileId,finish:'stop'}}},{...nativeHost(seen),settle:value=>{settlement=structuredClone(value);return {ok:true};}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.recovered,true);assert.equal(result.actualCalls,5);assert.equal(result.failures.length,2);assert.deepEqual(seen,['good\n\nthird\n\nfifth']);assert.equal(unit(result,'generate').status,'completed');assert.equal(settlement.terminals.length,1);assert.deepEqual(settlement.failures,result.failures);
});
test('native authority failures are fatal even when their code resembles a local model failure',async()=>{
 const graph=nativeBranches();const result=await runWorkflowForHost(graph,{...ports,target:undefined,request:async()=>({ok:true,data:{text:'Good',finish:'stop'}})},{executeHostOperation(){return failed;}});
 assert.equal(result.ok,false);assert.equal(result.error.code,'REQUEST_FAILED');assert.equal(result.failures,undefined);
});
test('scope authorization refusal never becomes optional absence regardless of error code',async()=>{
 const result=await runWorkflowForHost(branches(),ports,{authorizeModelInputs:()=>failed});
 assert.equal(result.ok,false);assert.equal(result.error.code,'REQUEST_FAILED');assert.equal(result.failures,undefined);assert.equal(result.actualCalls,0);
});
test('default and stop policies retain fail-fast behavior',async()=>{
 for(const failurePolicy of [undefined,'native-fallback','stop']){const result=await runWorkflow(branches(),{...ports,failurePolicy});assert.equal(result.ok,false);assert.equal(result.error.code,'REQUEST_FAILED');assert.equal(result.actualCalls,1);assert.equal(result.recovered,undefined);assert.equal(result.recording.status,'failed');}
});
test('optional Join selects its surviving typed contribution and Compose uses authored fallback',async()=>{
 const graph=branches();graph.nodes.compose.sections[0]={name:'bad',text:'Fallback',onSkipped:'fallback'};
 const composed=await runWorkflow(graph,ports);assert.equal(output(composed,'compose').text,'Fallback\n\nSurviving guidance');
 graph.nodes.join=node('join','join',{artifactKind:'text',inputs:[{id:'bad',label:'Bad',required:false},{id:'good',label:'Good',required:true}]});graph.wires.ja=wire('ja','bad','out','join','bad');graph.wires.jb=wire('jb','good','out','join','good');
 const joined=await runWorkflow(graph,{...ports,target:target('join')});assert.equal(joined.ok,true,JSON.stringify(joined.error));assert.equal(output(joined,'join').text,'Surviving guidance');
});
test('model validation failures recover only after the authored retry cycle completes',async()=>{
 const graph=branches();graph.nodes.bad.outputKind='data';graph.nodes.bad.maxRetries=2;graph.nodes.collect=node('collect','collect',{artifactKind:'data',inputs:[{id:'bad',label:'Bad',required:false}]});graph.wires.a=wire('a','bad','out','collect','bad');graph.wires.data=wire('data','collect','out','compose','data');graph.nodes.compose.sections=[{name:'good',text:''}];
 let badCalls=0;const result=await runWorkflow(graph,{...ports,retryDelay:async()=>true,request:async({binding})=>binding.profileId==='bad'?(badCalls++,{ok:true,data:{text:'not json',finish:'stop'}}):{ok:true,data:{text:'Good',finish:'stop'}}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.failures[0].code,'INVALID_JSON');assert.equal(badCalls,2,'one configured format correction precedes recovery');assert.deepEqual(output(result,'collect').value,[]);assert.equal(unit(result,'bad').attempts,2);
});
test('exhausted transient retries retain all dispatched attempts before independent work resumes',async()=>{
 const graph=branches();graph.nodes.bad.maxRetries=2;const order=[];
 const result=await runWorkflow(graph,{...ports,retryDelay:async()=>true,request:async({binding})=>{order.push(binding.profileId);return binding.profileId==='bad'?{ok:false,error:{...failed.error,retryable:true,status:503}}:{ok:true,data:{text:'Good',finish:'stop'}};}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(order,['bad','bad','bad','good']);assert.equal(unit(result,'bad').attempts,3);assert.equal(result.actualCalls,4);
});
test('cancellation freshness privacy and capability failures remain fatal',async()=>{
 for(const code of ['ABORTED','STALE_SOURCE','BINDING_CHANGED','PRIVATE_MATERIAL','ACTOR_SCOPE_FAILED','REQUEST_CAPABILITY_MISMATCH','SERVICE_UNAVAILABLE','INVALID_OUTPUT']){
  const result=await runWorkflow(branches(),{...ports,request:async()=>({ok:false,error:{code,message:'Failure'}})});assert.equal(result.ok,false,code);assert.equal(result.error.code,code);assert.equal(result.failures,undefined,code);assert.equal(result.actualCalls,1);
 }
 const abort=new AbortController();const result=await runWorkflow(branches(),{...ports,signal:abort.signal,request:async()=>{abort.abort();return failed;}});assert.equal(result.error.code,'ABORTED');assert.equal(result.recording.status,'cancelled');assert.equal(result.recovered,undefined);
});
test('ordinary unresolved optional input continues to hold the selected output',async()=>{
 const graph=branches();graph.nodes.file=node('file','read-file',{targetId:'notes'});graph.wires.b=wire('b','file','text','compose','section.good');
 const result=await runWorkflowForHost(graph,ports,{executeHostOperation:()=>({ok:true,outputStates:{text:{status:'unresolved',reason:{code:'FILE_HELD',message:'Unresolved source.'}},reference:{status:'unresolved'}}})});
 assert.equal(result.ok,false);assert.equal(result.error.code,'UNRESOLVED_INPUT');assert.equal(unit(result,'compose').status,'unresolved');assert.equal(result.recording.status,'unresolved');
});
test('ordinary unresolved preparation cannot release native generation even with a recovered sibling',async()=>{
 const graph=nativeBranches();graph.nodes.file=node('file','read-file',{targetId:'notes'});graph.wires.b=wire('b','file','text','compose','section.good');const seen=[];
 const host=nativeHost(seen);const result=await runWorkflowForHost(graph,{...ports,target:undefined},{executeHostOperation:(node,...args)=>node.operation==='read-file'?{ok:true,outputStates:{text:{status:'unresolved'},reference:{status:'unresolved'}}}:host.executeHostOperation(node,...args)});
 assert.equal(result.error.code,'UNRESOLVED_INPUT');assert.deepEqual(seen,[]);assert.equal(unit(result,'generate').status,'unresolved');
});
test('a blocked native boundary cannot release independent Post sources',async()=>{
 const graph=nativeBranches();graph.nodes.compose.sections[0].required=true;graph.nodes.snapshot=node('snapshot','reply-snapshot');graph.nodes.otherReview=node('otherReview','review-publish');graph.wires.other=wire('other','snapshot','out','otherReview','draft');graph.runTargets.push({instancePath:[],nodeId:'otherReview'});
 const seen=[];const host=nativeHost(seen);let snapshots=0;
 const result=await runWorkflowForHost(graph,{...ports,target:undefined},{executeHostOperation:(node,...args)=>node.operation==='reply-snapshot'?(snapshots++,{ok:true,artifact:{kind:'draft',text:'Old reply',source:{originalText:'Old reply'}}}):host.executeHostOperation(node,...args)});
 assert.equal(result.ok,false);assert.equal(result.error.code,'RECOVERY_OUTPUT_UNAVAILABLE');assert.deepEqual(seen,[]);assert.equal(snapshots,0);assert.equal(unit(result,'snapshot').status,'blocked');
});
function pinnedModelDefinition(kind='text'){
 return {id:'nested-model-'+kind,version:1,name:'Model',parameters:[],interface:[{id:'item',label:'Input',direction:'input',kind:kind==='text'?'text':'data',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'result',label:'Output',direction:'output',kind,required:false,cardinality:'one',boundaryNodeId:'exit'}],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},prompt:node('prompt','text',{text:'Prompt'}),work:node('work','model-call',{outputKind:kind}),exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'}},wires:kind==='text'?{input:wire('input','entry','out','work','prompt'),result:wire('result','work','out','exit','in')}:{prompt:wire('prompt','prompt','out','work','prompt'),input:wire('input','entry','out','work','data'),result:wire('result','work','out','exit','in')}}};
}
async function materialize(raw){const {computeDefinitionIdentity,definitionRefKey}=await import('../src/workflow/definition-data.js');const checked=computeDefinitionIdentity(raw);assert.equal(checked.ok,true,JSON.stringify(checked.error));const definition={...checked.data.materializedDefinition,semanticHash:checked.data.semanticHash};const ref={id:definition.id,version:definition.version,semanticHash:definition.semanticHash};return {definition,ref,key:definitionRefKey(ref)};}
test('duplicate nested node IDs retain exact failure addresses and independent sibling completion',async()=>{
 const inner=await materialize(pinnedModelDefinition()),graph=branches();graph.definitions={[inner.key]:inner.definition};
 for(const id of ['bad','good'])graph.nodes[id]={id,type:'subgraph',definition:inner.ref,parameterOverrides:{},roleOverrides:{},nodeBindingOverrides:{}};
 graph.wires.bad.toPort='item';graph.wires.good.toPort='item';graph.wires.a.fromPort='result';graph.wires.b.fromPort='result';
 const result=await runWorkflow(graph,{...ports,resolveBinding:(node,graph,address)=>({ok:true,data:{profileId:address.instancePath[0]}})});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(result.failures[0].address,{workflowId:'recovery',instancePath:['bad'],nodeId:'work'});assert.equal(output(result,'compose').text,'Surviving guidance');
 const failed=result.recording.units.find(item=>item.status==='failed');assert.deepEqual(expandRecordAddress(result.recording,failed.address).instancePath,['bad']);
});
test('failed later iteration publishes none of the earlier successful iteration results',async()=>{
 const helper=await materialize(pinnedModelDefinition('data')),graph=branches();graph.definitions={[helper.key]:helper.definition};graph.nodes.items=node('items','text',{text:'[1,2]'});graph.nodes.decode=node('decode','json-decode');graph.nodes.each=node('each','for-each',{helper:helper.ref,limit:2,requestBoundPerIteration:1});graph.nodes.collect=node('collect','collect',{inputs:[{id:'items',label:'Items',required:false}]});graph.nodes.compose.sections=[{name:'good',text:''}];delete graph.nodes.bad;delete graph.wires.bad;delete graph.wires.a;
 graph.wires.items=wire('items','items','out','decode','in');graph.wires.each=wire('each','decode','out','each','in');graph.wires.collect=wire('collect','each','out','collect','items');graph.wires.data=wire('data','collect','out','compose','data');
 let iterations=0;const result=await runWorkflow(graph,{...ports,request:async request=>request.iteration?(++iterations===1?{ok:true,data:{text:'{"result":"PRIVATE_PARTIAL_SENTINEL"}',finish:'stop'}}:failed):{ok:true,data:{text:'Independent',finish:'stop'}}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(iterations,2);assert.equal(unit(result,'each').status,'failed');assert.equal(result.actualCalls,3);assert.deepEqual(output(result,'collect').value,[]);assert.equal(output(result,'compose').text,'Independent');assert.equal(JSON.stringify(result).includes('PRIVATE_PARTIAL_SENTINEL'),false);assert.equal(unit(result,'each').ports.filter(port=>port.direction==='output').every(port=>port.artifact===null),true);
});
test('runtime captures its failure policy before observers can change options',async()=>{
 const options={...ports,onStage:()=>{options.failurePolicy='stop';}};const result=await runWorkflow(branches(),options);assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.recovered,true);
});
test('iteration scope retention refusal remains fatal even with a local-looking error code',async()=>{
 const helper=await materialize(pinnedModelDefinition('data'));const graph={id:'recovery',schema:3,runtime:2,mode:'native-unified',definitions:{[helper.key]:helper.definition},nodes:{items:node('items','text',{text:'[1]'}),decode:node('decode','json-decode'),each:node('each','for-each',{helper:helper.ref,limit:1,requestBoundPerIteration:1})},wires:{decode:wire('decode','items','out','decode','in'),each:wire('each','decode','out','each','in')}};
 const result=await runWorkflowForHost(graph,{...ports,target:target('each')},{retainScopedOutput:payload=>payload.address.instancePath.length?failed:{ok:true,data:{retained:true}}});
 assert.equal(result.error.code,'REQUEST_FAILED');assert.equal(result.failures,undefined);assert.equal(result.actualCalls,0);
});
test('transport freshness refusal remains fatal when an operation normalizes its error code',async()=>{
 const {selectRandomOutcomes}=await import('../src/workflow/operations/random-outcomes.js');const {normalizeOccurrences,confirmOccurrences,resolveItemHolders}=await import('../src/workflow/operations/event-data.js');
 const source={sourceId:'action',revision:'r1',sceneId:'scene',watch:'player-message',text:'Mara casts the wand.',visibility:'public'};const normalized=normalizeOccurrences(source,[{eventType:'item-used',actorId:'mara',itemId:'wand',position:{start:0,end:source.text.length},semantics:'actual'}],{actorIds:['mara'],itemIds:['wand']});const confirmed=confirmOccurrences(normalized.data.events,[{eventId:normalized.data.events[0].eventId,accepted:true}]);const event=resolveItemHolders({wand:'mara'},confirmed.data.events).data.events[0];const picked=await selectRandomOutcomes([event],{libraryId:'effects',revision:'r1',itemId:'wand',effects:[{id:'wild',kind:'generate',weight:1}]},[],{random:()=>0});
 const graph=branches();graph.nodes.draw=node('draw','text',{text:JSON.stringify(picked.data.outcomes[0])});graph.nodes.decode=node('decode','json-decode');graph.nodes.bad=node('bad','effect-author');graph.nodes.collect=node('collect','collect',{inputs:[{id:'effect',label:'Effect',required:false}]});graph.nodes.compose.sections=[{name:'good',text:''}];graph.wires.bad=wire('bad','decode','out','bad','in');graph.wires.decode=wire('decode','draw','out','decode','in');graph.wires.a=wire('a','bad','out','collect','effect');graph.wires.data=wire('data','collect','out','compose','data');
 const result=await runWorkflow(graph,{...ports,request:async({binding})=>binding.profileId==='bad'?{ok:false,error:{code:'BINDING_CHANGED',message:'Fixed connection changed.'}}:{ok:true,data:{text:'Independent',finish:'stop'}}});
 assert.equal(result.ok,false);assert.equal(result.error.code,'BINDING_CHANGED');assert.equal(result.failures,undefined);
});
test('recovered failure summaries stay bounded while recordings retain every failed node',async()=>{
 const graph=branches();graph.nodes.compose.sections=[{name:'good',text:''}];delete graph.nodes.bad;delete graph.wires.bad;delete graph.wires.a;
 for(let i=0;i<40;i++){const id='failed'+i;graph.nodes[id]=node(id,'model-call');graph.wires[id]=wire(id,'prompt','out',id,'prompt');graph.wires[id+'-out']=wire(id+'-out',id,'out','compose','section.'+id);graph.nodes.compose.sections.push({name:id,text:'',onSkipped:'omit'});}
 const result=await runWorkflow(graph,{...ports,request:async({binding})=>binding.profileId==='good'?{ok:true,data:{text:'Only survivor',finish:'stop'}}:failed});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.failures.length,32);assert.equal(result.recording.units.filter(unit=>unit.status==='failed').length,40);assert.equal(output(result,'compose').text,'Only survivor');assert.equal(Object.isFrozen(result.failures),true);
});
test('partial event replay preserves failed and blocked states and rejects late completion',async()=>{
 const {createRunState,reduceRunState}=await import('../src/workflow/run-state.js');const {createRunRecorder}=await import('../src/workflow/recording.js');const events=[];
 const result=await runWorkflow(branches(),{...ports,runId:'partial-replay',onEvent:event=>events.push(event)});let state=createRunState('partial-replay');const recorder=createRunRecorder({runId:'partial-replay'});
 for(const event of events){state=reduceRunState(state,event);assert.equal(recorder.accept(event).ok,true);}
 assert.equal(state.status,'partial');assert.equal(state.nodes.find(node=>node.address.nodeId==='bad').status,'failed');assert.equal(state.nodes.find(node=>node.address.nodeId==='compose').status,'completed');
 const last=events.at(-1),late={...last,seq:last.seq+1,elapsedMs:last.elapsedMs+1,status:'completed'};assert.equal(reduceRunState(state,late),state);assert.equal(recorder.capture({address:{workflowId:'recovery',instancePath:[],nodeId:'bad'},direction:'output',portId:'out',artifact:{kind:'text',text:'late'}}).error.code,'RUN_CLOSED');assert.equal(recorder.finish().status,'partial');assert.equal(result.recording.status,'partial');
});
