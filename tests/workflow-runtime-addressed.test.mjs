import assert from 'node:assert/strict';
import test from 'node:test';
import { runWorkflow as runEngine } from '../src/workflow/runtime.js';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js';
import { expandRecordAddress } from '../src/workflow/record-data.js';
import { fixtureGraph as starterGraph } from './helpers/workflow-fixtures.mjs';
const runWorkflow=(graph,ports={})=>runEngine(graph,{...(graph.nodes?.joined?{target:{workflowId:graph.id,instancePath:[],nodeId:'joined',portId:'out'}}:graph.nodes?.guidance?{target:{workflowId:graph.id,instancePath:[],nodeId:'guidance',portId:'out'}}:{}),...ports});
import { cloneWorkflowDocument } from '../src/workflow/document.js';
import { Worker } from 'node:worker_threads';
import { validateWorkflow } from '../src/workflow/contracts.js';

const context = {kind:'context',messages:[{id:'shared',role:'user',text:'Shared scene.',source:'chat'}]};
const countTokens = async text => ({tokens:Math.ceil(text.length/4),method:'fixture'});
const direct = (id,from,fromPort,to,toPort) => ({id,route:'wire',from,fromPort,to,toPort});
function siblings() {
    const draft = {id:'plan-definition',version:1,name:'Plan',interface:[
        {id:'scene',label:'Scene',kind:'context',direction:'input',required:true,cardinality:'one',boundaryNodeId:'entry'},
        {id:'proposal',label:'Proposal',kind:'guidance',direction:'output',required:false,cardinality:'one',boundaryNodeId:'exit'},
    ],parameters:[],body:{schema:3,runtime:2,mode:'native-pre',roles:{Analysis:{profileId:'fixed'}},nodes:{
        entry:{id:'entry',type:'subgraph-input',interfacePortId:'scene'},
        work:{id:'work',type:'workflow',operation:'response-plan'},
        exit:{id:'exit',type:'subgraph-output',interfacePortId:'proposal'},
    },wires:{a:direct('a','entry','out','work','in'),b:direct('b','work','out','exit','in')}}};
    const identity=computeDefinitionIdentity(draft);assert.equal(identity.ok,true);
    const definition={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash};
    const ref={id:definition.id,version:definition.version,semanticHash:definition.semanticHash};
    const instance=id=>({id,type:'subgraph',definition:ref,parameterOverrides:{},roleOverrides:{},nodeBindingOverrides:{}});
    return {id:'root',schema:3,runtime:2,mode:'native-unified',nodes:{
        source:{id:'source',type:'workflow',operation:'scene-context'},
        'first/path':instance('first/path'),second:instance('second'),
        one:{id:'one',type:'workflow',operation:'guidance'},two:{id:'two',type:'workflow',operation:'guidance'},joined:{id:'joined',type:'workflow',operation:'join',artifactKind:'guidance',inputs:[{id:'one',label:'One',required:true},{id:'two',label:'Two',required:true}]},send:{id:'send',type:'workflow',operation:'on-send'},generate:{id:'generate',type:'workflow',operation:'generate-reply'},review:{id:'review',type:'workflow',operation:'review-publish'},
    },wires:{a:direct('a','source','out','first/path','scene'),b:direct('b','first/path','proposal','one','in'),c:direct('c','source','out','second','scene'),d:direct('d','second','proposal','two','in'),j1:direct('j1','one','out','joined','one'),j2:direct('j2','two','out','joined','two'),activation:direct('activation','send','activation','generate','activation'),guide:direct('guide','joined','out','generate','guidance'),reply:direct('reply','generate','draft','review','draft')},definitions:{[definitionRefKey(definition)]:definition},portals:{}};
}
test('one addressed executor shares the source and root signal while preserving sibling binding identities',async()=>{
    const graph=siblings(), controller=new AbortController(), events=[], bindings=[], requests=[];let snapshots=0;
    const result=await runWorkflow(graph,{signal:controller.signal,countTokens,onEvent:event=>events.push(event),
        snapshot:()=>{snapshots++;assert.equal(events[0]?.type,'plan');return structuredClone(context);},
        resolveBinding:(node,bindingGraph)=>{assert.deepEqual(bindingGraph.roles,{});const binding={profileId:node.profileId,model:'fixture',privateEndpoint:'hidden'};bindings.push(binding);return {ok:true,data:binding};},
        request:async request=>{requests.push(request);return {ok:true,data:{text:`Proposal ${requests.length}`,finish:'stop',usage:{completion_tokens:2}}};},
    });
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.schema,3);assert.equal(result.callBound,2);assert.equal(result.actualCalls,2);assert.equal(snapshots,1);
    assert.equal(requests[0].binding,bindings[0]);assert.equal(requests[1].binding,bindings[1]);assert.notEqual(bindings[0],bindings[1]);
    assert.ok(bindings.every(binding=>!Object.isFrozen(binding)),'adapter-owned binding identities stay private and mutable');
    assert.ok(requests.every(request=>request.signal===controller.signal));
    assert.ok(!('artifact' in result)&&!('outputs' in result)&&!('calls' in result)&&!('trace' in result)&&!('reports' in result));
    assert.equal(result.recording.terminals.length,0);assert.equal(result.recording.units.filter(unit=>unit.operation==='guidance'&&unit.status==='completed').length,2);assert.equal(result.recording.status,'completed');
    const work=result.recording.units.filter(unit=>expandRecordAddress(result.recording,unit.address).nodeId==='work');assert.equal(work.length,2);assert.ok(work.every(unit=>unit.attempts===1));
    assert.deepEqual(events.map(event=>event.seq),events.map((_,index)=>index+1));assert.ok(events.every(Object.isFrozen));assert.equal(events.at(-1).type,'run-settled');
    assert.ok(!JSON.stringify(result.recording).includes('privateEndpoint'));assert.ok(!JSON.stringify(events).includes('messages'));
});
test('stage observers cannot mutate execution controls or affect safe event delivery',async()=>{
    const graph=cloneWorkflowDocument(starterGraph('native-guidance')).data,events=[],requests=[];
    const result=await runWorkflow(graph,{countTokens,snapshot:()=>context,resolveBinding:()=>({ok:true,data:{profileId:'fixed',model:'fixture'}}),
        onStage:node=>{if(node.operation==='response-plan'){node.maxTokens=65536;node.instructions='Injected';}throw new Error('observer');},
        onEvent:event=>{events.push(event);return Promise.reject(new Error('async observer'));},
        request:async request=>{requests.push(request);return {ok:true,data:{text:'Proposal',finish:'stop'}};},
    });
    assert.equal(result.ok,true);assert.equal(requests[0].maxTokens,768);assert.ok(!requests[0].messages[1].content.includes('Injected'));assert.equal(events.at(-1).type,'run-settled');
});
test('clock creation failure is safe and performs zero source, binding or model effects',async()=>{
    const graph=siblings();let effects=0;
    const result=await runWorkflow(graph,{clock:{now:()=>{throw new Error('clock');},monotonic:()=>0},snapshot:()=>{effects++;},resolveBinding:()=>{effects++;},request:()=>{effects++;}});
    assert.equal(result.ok,false);assert.equal(result.error.code,'INVALID_RUN_CLOCK');assert.equal(effects,0);assert.ok(!result.recording);
});
test('invalid run identity is a safe preparation failure without retaining caller identity objects',async()=>{
    const identity={private:'not diagnostic'};let effects=0;
    const result=await runWorkflow(siblings(),{runId:identity,snapshot:()=>{effects++;},resolveBinding:()=>{effects++;},request:()=>{effects++;}});
    assert.equal(result.error.code,'RUN_ID_REQUIRED');assert.equal(effects,0);assert.ok(!result.recording);assert.ok(!('runId' in result));assert.ok(!JSON.stringify(result).includes('not diagnostic'));
});
test('invalid version metadata never invokes accessors or retains and freezes caller values',async()=>{
    for(const field of ['schema','runtime'])for(const kind of ['object','function','accessor']) {
        const graph=cloneWorkflowDocument(starterGraph('native-guidance')).data,value=kind==='function'?function privateVersion(){}:{private:'not diagnostic'};
        let reads=0,effects=0;
        if(kind==='accessor')Object.defineProperty(graph,field,{enumerable:true,get(){reads++;return value;}});else graph[field]=value;
        const descriptors=Object.getOwnPropertyDescriptors(graph),effect=()=>{effects++;throw new Error('Rejected graph cannot touch host');};
        const result=await runWorkflow(graph,{snapshot:effect,resolveBinding:effect,countTokens:effect,request:effect});
        assert.equal(result.ok,false);assert.ok(!Object.hasOwn(result,field));assert.equal(reads,0);assert.equal(effects,0);
        assert.equal(Object.isFrozen(value),false);assert.equal(Object.isFrozen(graph),false);assert.deepEqual(Object.getOwnPropertyDescriptors(graph),descriptors);assert.ok(!JSON.stringify(result).includes('not diagnostic'));
    }
    const graph=cloneWorkflowDocument(starterGraph('native-guidance')).data;graph.schema=99;
    const result=await runWorkflow(graph);assert.equal(result.error.code,'UNSUPPORTED_VERSION');assert.equal(result.schema,99);assert.equal(result.runtime,2);
});
test('public native request bounds include resolved schema3 and host transport stays private',async()=>{
    const {installMock}=await import('./mock.js');installMock();
    const facade=await import('../src/run.js');
    assert.equal(facade.callCount(siblings()),2);assert.equal('runWorkflowForHost' in facade,false);
});
test('target closure excludes unrelated completeness and bindings but whole-graph cycles still reject',async()=>{
    const graph=siblings();delete graph.nodes.one;delete graph.nodes.two;delete graph.wires.b;delete graph.wires.d;for(const id of ['joined','send','generate','review'])delete graph.nodes[id];for(const id of ['j1','j2','activation','guide','reply'])delete graph.wires[id];
    graph.nodes.unfinished={id:'unfinished',type:'workflow',operation:'response-plan'};
    let snapshots=0,bindings=0,requests=0;
    const ports={countTokens,snapshot:()=>{snapshots++;return context;},resolveBinding:()=>{bindings++;return {ok:true,data:{profileId:'fixture',model:'fixture'}};},request:async()=>{requests++;return {ok:true,data:{text:'Target proposal',finish:'stop'}};}};
    const target={workflowId:graph.id,instancePath:['first/path'],nodeId:'work',portId:'out'},result=await runWorkflow(graph,{...ports,target});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.callBound,1);assert.equal(result.actualCalls,1);assert.deepEqual([snapshots,bindings,requests],[1,1,1]);assert.equal(result.mode,'target');assert.ok(result.recording.units.some(unit=>!unit.included&&unit.status==='not-run'));
    assert.equal((await runWorkflow(graph,ports)).error.code,'MISSING_TERMINAL');
    for(const id of ['cycle-a','cycle-b'])graph.nodes[id]={id,type:'workflow',operation:'reroute',phase:'pre',artifactKind:'context'};
    graph.wires.cycleA=direct('cycleA','cycle-a','out','cycle-b','in');graph.wires.cycleB=direct('cycleB','cycle-b','out','cycle-a','in');
    const cyclic=await runWorkflow(graph,{...ports,target});assert.equal(cyclic.error.code,'CYCLE');assert.equal(cyclic.recording.status,'invalid');assert.deepEqual([snapshots,bindings,requests],[1,1,1]);
});
test('current source target is detached and contains only bounded addressed diagnostics',async()=>{
    const graph=starterGraph('native-guidance'),before=structuredClone(graph);let bindings=0;
    const result=await runWorkflow(graph,{target:{workflowId:graph.id,instancePath:[],nodeId:'scene-context',portId:'out'},snapshot:()=>context,resolveBinding:()=>{bindings++;}});
    assert.equal(result.ok,true);assert.equal(result.schema,3);assert.equal(result.runtime,2);assert.equal(result.mode,'target');assert.equal(result.callBound,0);assert.equal(bindings,0);assert.deepEqual(graph,before);assert.ok(!('artifact' in result)&&!('calls' in result));
});
test('cancellation after tokenization reserves no attempt and late provider output cannot reopen work',async()=>{
    for(const stopDuring of ['tokens','request']) {
        const controller=new AbortController(),events=[];let calls=0;
        const result=await runWorkflow(siblings(),{signal:controller.signal,snapshot:()=>context,resolveBinding:()=>({ok:true,data:{profileId:'fixture',model:'fixture'}}),onEvent:event=>events.push(event),
            countTokens:async text=>{if(stopDuring==='tokens')controller.abort();return countTokens(text);},
            request:async()=>{calls++;controller.abort();return {ok:true,data:{text:'Late provider output',finish:'stop'}};},
        });
        assert.equal(result.error.code,'ABORTED');assert.equal(result.recording.status,'cancelled');assert.equal(result.actualCalls,stopDuring==='tokens'?0:1);assert.equal(calls,result.actualCalls);assert.equal(events.at(-2).type,'run-cancelling');assert.equal(events.at(-1).type,'run-settled');assert.ok(!JSON.stringify(result.recording).includes('Late provider output'));assert.ok(result.recording.units.every(unit=>unit.request?.status!=='running'));
    }
});
test('Compose, Text Rules, JSON Decode and Select Fields run through named edges with zero requests',async()=>{
    const node=(id,operation,controls={})=>({id,type:'workflow',operation,...controls});
    const graph={id:'tools',schema:3,runtime:2,mode:'native-unified',nodes:{source:node('source','compose',{sections:[{name:'json',text:'{"value":"old","ignored":1}'}]}),rules:node('rules','text-rules',{rules:[{kind:'literal',pattern:'old',replacement:'new'}]}),decode:node('decode','json-decode'),pick:node('pick','select-fields',{fields:[{name:'selected',path:['value']}]}),unfinished:node('unfinished','repair')},wires:{a:direct('a','source','out','rules','in'),b:direct('b','rules','out','decode','in'),c:direct('c','decode','out','pick','in')},portals:{},definitions:{}};
    let effects=0,workers=0,termination;const handlers=new Map();
    const result=await runWorkflow(graph,{target:{workflowId:graph.id,instancePath:[],nodeId:'pick',portId:'out'},snapshot:()=>{effects++;},resolveBinding:()=>{effects++;},request:()=>{effects++;},countTokens:()=>{effects++;},createWorker(){workers++;const resource=new Worker(new URL('./fixtures/text-rules-node-worker.mjs',import.meta.url));return {addEventListener(type,fn){const handler=type==='message'?data=>{if(!data?.fixtureStarted)fn({data});}:error=>fn({error});handlers.set(fn,handler);resource.on(type,handler);},removeEventListener(type,fn){resource.off(type,handlers.get(fn));handlers.delete(fn);},postMessage(data){resource.postMessage(data);},terminate(){termination=resource.terminate();return termination;}};}});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.callBound,0);assert.equal(result.actualCalls,0);assert.equal(effects,0);assert.equal(workers,1);await termination;assert.equal(handlers.size,0);assert.ok(result.recording.artifacts.some(entry=>entry.value?.value?.selected==='new'));assert.equal(result.recording.units.filter(unit=>unit.status==='completed').length,4);
});
test('Context Join records actual ordered input pins in the same zero-request plan',async()=>{
    const graph={id:'joined',schema:3,runtime:2,mode:'native-unified',nodes:{source:{id:'source',type:'workflow',operation:'scene-context'},join:{id:'join',type:'workflow',operation:'context-join',inputs:[{id:'left/path',label:'Left'},{id:'right|path',label:'Right'}]}},wires:{a:direct('a','source','out','join','left/path'),b:direct('b','source','out','join','right|path')},portals:{},definitions:{}};let snapshots=0,effects=0;
    const result=await runWorkflow(graph,{target:{workflowId:graph.id,instancePath:[],nodeId:'join',portId:'out'},snapshot:()=>{snapshots++;return context;},resolveBinding:()=>{effects++;},request:()=>{effects++;}});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(snapshots,1);assert.equal(effects,0);assert.equal(result.actualCalls,0);assert.ok(result.recording.artifacts.some(entry=>entry.value?.source?.operation==='context-join'));assert.equal(result.recording.units.filter(unit=>unit.status==='completed').length,2);
});
test('metadata admission failure and previews precede all source, binding, tokenizer and request effects',async()=>{
    const graph=cloneWorkflowDocument(starterGraph('native-guidance')).data;let effects=0;const effect=()=>{effects++;throw new Error('Effect before admission');};
    const preview=await runWorkflow(graph,{preview:true,snapshot:effect,resolveBinding:effect,countTokens:effect,request:effect});
    assert.equal(preview.ok,true);assert.equal(preview.preview,true);assert.ok(preview.recording.units.every(unit=>unit.status==='not-run'));assert.equal(effects,0);
    graph.id='😀'.repeat(990000);
    const result=await runWorkflow(graph,{runId:'r'.repeat(350000),snapshot:effect,resolveBinding:effect,countTokens:effect,request:effect});
    assert.equal(result.error.code,'RUN_METADATA_LIMIT');assert.equal(result.recording.plan,null);assert.equal(result.recording.status,'invalid');assert.equal(effects,0);
});
test('the public complete execution gate resolves only current named-pin documents',()=>{
    const expanded=validateWorkflow(siblings());assert.equal(expanded.ok,true,JSON.stringify(expanded.error));assert.equal(expanded.data.callBound,2);assert.equal(expanded.data.primitives.filter(unit=>unit.included).length,9);
    const current=validateWorkflow(starterGraph('native-guidance'));assert.equal(current.ok,true);assert.equal(current.data.primitives.filter(unit=>unit.node.operation==='response-plan').length,1);
    assert.equal(validateWorkflow(siblings(),{phase:'post'}).error.code,'WRONG_PHASE');
});


test('nested static Pattern instances with duplicate local IDs keep separate live evidence and exact Draft authority', async () => {
    const { runWorkflowForHost } = await import('../src/workflow/runtime.js?v=0.27.2');
    const { getPatternReportBinding } = await import('../src/workflow/operations/pattern-engine.js?v=0.27.2');
    const { filterPatternDraft } = await import('../src/workflow/operations/filter-text.js?v=0.27.2');
    const f = await import('./helpers/pattern-routing-fixtures.mjs'), wrappers = f.patternWrappers();
    const root = f.rootGraph({
        sourceA: f.node('sourceA', 'reply-snapshot'), sourceB: f.node('sourceB', 'reply-snapshot'),
        first: f.instance('first', wrappers.outer), second: f.instance('second', wrappers.outer),
        filterA: f.node('filterA', 'filter-text', { scope: 'whole' }), filterB: f.node('filterB', 'filter-text', { scope: 'whole' }),
        selected: f.node('selected', 'join', { artifactKind: 'draft', inputs: f.slots('a', 'b') }),
    }, [f.wire('a', 'sourceA', 'out', 'first', 'draft'), f.wire('b', 'sourceB', 'out', 'second', 'draft'), f.wire('c', 'first', 'out', 'filterA', 'in'), f.wire('d', 'first', 'matches', 'filterA', 'matches'), f.wire('e', 'second', 'out', 'filterB', 'in'), f.wire('f', 'second', 'matches', 'filterB', 'matches'), f.wire('g', 'filterA', 'out', 'selected', 'a'), f.wire('h', 'filterB', 'out', 'selected', 'b')], wrappers.definitions);
    const outputs = []; let captures = 0;
    const result = await runWorkflowForHost(root, { target: f.target('selected'), snapshot: () => { captures++; return f.draft(f.fourteen); } }, { retainScopedOutput(payload) { outputs.push(payload); return { ok: true, data: { retained: true } }; } });
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(captures, 2); assert.equal(result.actualCalls, 0);
    const inputA = f.retained(outputs, 'sourceA'), inputB = f.retained(outputs, 'sourceB'); assert.notEqual(inputA, inputB);
    const reportA = f.retained(outputs, 'work', 'matches', ['first', 'work']), reportB = f.retained(outputs, 'work', 'matches', ['second', 'work']);
    assert.notEqual(reportA.value, reportB.value); assert.equal(getPatternReportBinding(reportA.value, inputA).ok, true); assert.equal(getPatternReportBinding(reportB.value, inputB).ok, true);
    assert.equal(f.retained(outputs, 'work', 'out', ['first', 'work']), inputA); assert.equal(f.retained(outputs, 'work', 'out', ['second', 'work']), inputB);
    assert.equal(f.retained(outputs, 'filterA').text, 'First.\n\nLast.'); assert.equal(f.retained(outputs, 'filterB').text, 'First.\n\nLast.');
    assert.equal(filterPatternDraft(inputA, reportB, { action: 'remove', unit: 'paragraph', scope: 'whole', protectedLiterals: [] }, { nodeId: 'crossed' }).error.code, 'STALE_MATCH_REPORT');
    assert.equal(f.unit(result, 'work', ['first', 'work']).status, 'completed'); assert.equal(f.unit(result, 'work', ['second', 'work']).status, 'completed');
});
