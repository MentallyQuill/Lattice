import assert from 'node:assert/strict';
import test from 'node:test';
import * as host from '../src/workflow/host.js';
const { createNativeWorkflowController }=host;
import { cloneWorkflowDocument } from '../src/workflow/document.js';
import { fixtureGraph as starterGraph } from './helpers/workflow-fixtures.mjs';
import {nativeFixture,reviewGraph} from './helpers/native-workflow-fixture.mjs';

function fixture(graph,options={}) {
 const profile={id:'fixed',api:'custom',model:'fixture','api-url':'https://private.example'};
 const f=nativeFixture(graph,{nativeBinding:true,...options,ports:{request:options.request??(async()=>({ok:true,data:{text:'We explore.',finish:'stop'}}))}});
 f.c.CONNECT_API_MAP={custom:{selected:'openai',source:'custom'}};f.c.ConnectionManagerRequestService={getProfile:()=>profile};
 return {...f,profile};
}
function graph3(kind) {const g=kind==='reviewed-de-slop'?reviewGraph():starterGraph(kind);for(const node of Object.values(g.nodes))if(node.operation==='scene-context')node.visibilityMode='public';for(const role of Object.values(g.roles))role.profileId='fixed';for(const node of Object.values(g.nodes))if(node.modelRole)node.profileId=null;return cloneWorkflowDocument(g).data;}

test('schema3 keeps all addressed candidate handles private and Apply rejects changed effective profiles',async()=>{
    const graph=graph3('reviewed-de-slop');graph.runTargets.push({instancePath:[],nodeId:'second'});graph.nodes.second={id:'second',type:'workflow',operation:'review-publish'};graph.wires.second={id:'second',route:'wire',from:'repair',fromPort:'out',to:'second',toPort:'draft'};
    const f=fixture(graph),result=await f.generate(graph);
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.reviewHandles.length,2);assert.notEqual(result.reviewHandles[0].handleId,result.reviewHandles[1].handleId);assert.equal(result.recording.terminals.length,2);
    assert.ok(!('artifact' in result)&&!('outputs' in result)&&!('calls' in result));assert.equal(f.message.mes,'We delve.');
    assert.equal(f.controller.candidateStatus(result.reviewHandles[0]).ok,true);
    assert.equal(f.controller.candidateStatus({kind:'candidate',text:'forged',source:{token:'forged'}}).error.code,'STALE_CANDIDATE');
    f.profile.model='externally-changed';assert.equal(f.controller.candidateStatus(result.reviewHandles[0]).error.code,'BINDING_CHANGED');
    const rejected=await f.controller.apply(result.reviewHandles[0]);assert.equal(rejected.ok,false);assert.equal(f.message.mes,'We delve.');
});
test('explicit terminal targets retain diagnostics and never publish Guidance or register candidates',async()=>{
    const graph=graph3('native-guidance'),f=fixture(graph,{request:async()=>({ok:true,data:{text:'Proposal',finish:'stop'}})});
    const target={workflowId:graph.id,instancePath:[],nodeId:'guidance',portId:'out'};
    assert.equal(typeof f.controller.runTarget,'function');const result=await f.controller.runTarget(graph,target);
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.mode,'target');assert.deepEqual(result.reviewHandles,[]);assert.equal(result.recording.terminals.length,0);assert.deepEqual(f.c.extensionPrompts,{other:{value:'keep'}});
});
test('malformed target metadata settles as a bounded failure without reading accessors or invoking host work',async()=>{
    let reads=0,contexts=0,bindings=0,tokens=0,requests=0;
    const graph=starterGraph('native-guidance');Object.defineProperty(graph,'mode',{enumerable:true,get(){reads++;throw new Error('getter ran');}});
    const controller=createNativeWorkflowController({context:()=>{contexts++;return {extensionPrompts:{}};},resolveBinding:()=>{bindings++;},countTokens:()=>{tokens++;},request:()=>{requests++;}});
    const result=await controller.runTarget(graph,{kind:'terminal',address:{workflowId:'native-guidance',instancePath:[],nodeId:'guidance'}});
    assert.equal(result.ok,false);assert.equal(result.error.code,'MALFORMED_WORKFLOW');assert.equal(result.mode,'target');
    assert.deepEqual({reads,contexts,bindings,tokens,requests},{reads:0,contexts:0,bindings:0,tokens:0,requests:0});
    assert.ok(!('artifact' in result)&&!('reports' in result)&&!('calls' in result)&&!('trace' in result));
});
test('safe plan publication precedes source identity and final freshness settles inside the recording',async()=>{
    const graph=graph3('reviewed-de-slop');let f;
    f=fixture(graph,{request:async()=>{f.profile.model='changed';return {ok:true,data:{text:'We explore.',finish:'stop'}};}});
    let identityReads=0;Object.defineProperty(f.c,'characterId',{get(){identityReads++;assert.equal(f.events[0]?.type,'plan');return 1;}});
    const result=await f.generate(graph);assert.ok(identityReads>0);assert.equal(result.error.code,'BINDING_CHANGED');assert.equal(result.recording.status,'stale');assert.deepEqual(result.reviewHandles,[]);assert.equal(f.events.at(-1).type,'run-settled');
});
test('an explicit schema3 handle applies once and sibling selectors become stale',async()=>{
    const graph=graph3('reviewed-de-slop');graph.nodes.second={id:'second',type:'workflow',operation:'review-publish'};graph.wires.second={id:'second',route:'wire',from:'repair',fromPort:'out',to:'second',toPort:'draft'};
    const f=fixture(graph),run=await f.generate(graph),applied=await f.controller.apply(structuredClone(run.reviewHandles[0]));
    assert.equal(applied.ok,true,JSON.stringify(applied.error));assert.equal(applied.appliedLocally,true);assert.equal(f.message.mes,'We explore.');assert.equal(f.message.swipes[0],'We delve.');assert.ok(!('artifact' in applied));
    assert.equal((await f.controller.apply(run.reviewHandles[0])).swipeId,applied.swipeId);assert.equal(f.message.swipes.length,2);assert.equal(f.controller.candidateStatus(run.reviewHandles[1]).ok,false);
});
test('profile changes across an existing Apply await guard restore the original message',async()=>{
    const graph=graph3('reviewed-de-slop'),f=fixture(graph),run=await f.generate(graph),original=structuredClone(f.message);
    f.c.updateMessageBlock=async()=>{f.profile.model='changed-during-render';};
    const result=await f.controller.apply(run.reviewHandles[0]);assert.equal(result.error.code,'APPLY_FAILED');assert.deepEqual(f.message,original);
});
test('plan-observer cancellation marks the recording before host cleanup and cannot grant late authority',async()=>{
    const graph=graph3('reviewed-de-slop');let f,requests=0;
    f=fixture(graph,{onEvent:event=>{if(event.type==='plan')f.controller.cancel('plan observer stopped');},request:async()=>{requests++;return {ok:true,data:{text:'late',finish:'stop'}};}});
    f.c.extensionPrompts['lattice:guidance:old']={value:'old'};
    const setter=f.c.setExtensionPrompt;f.c.setExtensionPrompt=(key,value)=>{if(f.events.length)assert.ok(f.events.some(event=>event.type==='run-cancelling'));setter(key,value);};
    const result=await f.generate(graph);assert.equal(result.error.code,'ABORTED');assert.equal(result.recording.status,'cancelled');assert.deepEqual(result.reviewHandles,[]);assert.equal(requests,0);assert.deepEqual(f.events.map(event=>event.type),['plan','run-cancelling','run-settled']);
});
test('a source-free post target does not read chat or manufacture reply source authority',async()=>{
    const graph={id:'source-free',schema:3,runtime:2,mode:'native-unified',nodes:{text:{id:'text',type:'workflow',operation:'compose',phase:'post',sections:[{name:'value',text:'Hello'}]}},wires:{},portals:{},definitions:{}},f=fixture(graph);let reads=0;
    Object.defineProperty(f.c,'chat',{get(){reads++;throw new Error('No source selected');}});
    const result=await f.controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'text',portId:'out'});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(reads,0);assert.deepEqual(result.reviewHandles,[]);
});
test('per-invocation safe events are independent of a throwing controller observer',async()=>{
    const graph=graph3('structured-guidance'),seen=[],f=fixture(graph,{onEvent:()=>{throw new Error('controller observer');}});
    const result=await f.controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'guidance',portId:'out'},{onEvent:event=>{seen.push(event);return Promise.reject(new Error('invocation observer'));}});
    assert.equal(result.ok,true);assert.equal(seen[0].type,'plan');assert.equal(seen.at(-1).type,'run-settled');assert.ok(seen.every(Object.isFrozen));assert.equal(result.recording.lastSeq,seen.at(-1).seq);
});
test('unified Send then a bounded target retains one diagnostic recording',async()=>{
 const graph=graph3('reviewed-de-slop'),f=fixture(graph),automatic=await f.generate(graph),origin=f.controller.lastAutomaticResult().origin;
 const targetGraph=graph3('native-guidance'),manual=await f.controller.runTarget(targetGraph,{workflowId:targetGraph.id,instancePath:[],nodeId:'guidance',portId:'out'});
 assert.equal(manual.ok,true,JSON.stringify(manual.error));assert.notEqual(manual.runId,automatic.runId);assert.equal(f.controller.lastResult().recording,manual.recording);
 const retained=f.controller.lastAutomaticResult();assert.equal(retained.origin,origin);assert.equal(retained.superseded,true);assert.ok(!retained.result.recording);assert.ok(!('reviewHandles' in retained.result));
 assert.equal(new Set([f.controller.lastResult().recording,retained.result.recording].filter(Boolean)).size,1);assert.equal(host.inspectWorkflowRetentionForReview(f.controller).distinctRecordings,1);
});
test('schema3 preparation failure without a recording keeps prior diagnostics separate from the visible new error',async()=>{
    for(const kind of ['reviewed-de-slop']) {
        const graph=graph3(kind),seen=[],f=fixture(graph,{onResult:value=>seen.push(value),request:async()=>({ok:true,data:{text:kind==='native-guidance'?'Proposal':'{"patches":[{"index":0,"replacement":"explore"}]}',finish:'stop'}})});f.controller.subscribe();
        const previous=await f.generate(graph),signal=new AbortController();signal.abort();
        await f.c.eventSource.emit('GENERATION_STARTED','normal',{signal:signal.signal},false);
        const failed=await f.controller.beforeGenerate(f.c.chat,8192,()=>{});
        assert.equal(failed.ok,false);assert.equal(failed.error.code,'ABORTED');assert.ok(!('recording' in failed)&&!('runId' in failed));assert.equal(seen.at(-1),failed);assert.equal(f.controller.lastResult().recording,previous.recording);assert.equal(f.controller.lastResult().runId,previous.runId);assert.equal(f.controller.lastResult().superseded,true);assert.deepEqual(f.controller.lastResult().reviewHandles,[]);assert.equal(f.controller.lastResult().recording.status,'completed');
        assert.ok(!('calls' in failed)&&!('artifact' in failed)&&!('reports' in failed));assert.equal(host.inspectWorkflowRetentionForReview(f.controller).distinctRecordings,1);
        if(previous.reviewHandles.length)assert.equal(f.controller.candidateStatus(previous.reviewHandles[0]).error.code,'STALE_CANDIDATE');
    }
});
test('completed native and candidate authority release executor cancellation and production graph sidecars',async()=>{
    assert.equal(typeof host.inspectWorkflowRetentionForReview,'function');
    for(const kind of ['reviewed-de-slop']) {
        const graph=graph3(kind),f=fixture(graph,{request:async()=>({ok:true,data:{text:kind==='native-guidance'?'Proposal':'{"patches":[{"index":0,"replacement":"explore"}]}',finish:'stop'}})});
        const result=await f.generate(graph);
        assert.equal(result.ok,true,JSON.stringify(result.error));const retained=host.inspectWorkflowRetentionForReview(f.controller);assert.equal(retained.runs.length,1);assert.ok(Object.isFrozen(retained));
        const run=retained.runs[0];assert.equal(retained.distinctRecordings,1);assert.equal(run.hasCancel,false);assert.equal(run.bindingContexts,0);assert.equal(run.bindingChecks.length,kind==='native-guidance'?2:1);assert.ok(run.bindingChecks.every(check=>JSON.stringify(check.fields)===JSON.stringify(['address','binding'])));
        if(result.reviewHandles.length)assert.equal(f.controller.candidateStatus(result.reviewHandles[0]).ok,true);
        const count=f.events.length;f.controller.cancel('after settlement');assert.equal(f.events.length,count);assert.equal(host.inspectWorkflowRetentionForReview(f.controller).runs.length,0);
        if(result.reviewHandles.length)assert.equal(f.controller.candidateStatus(result.reviewHandles[0]).error.code,'STALE_CANDIDATE');
    }
});
test('injected resolver retains only fixed binding context and still rejects changed effective metadata',async()=>{
    assert.equal(typeof host.inspectWorkflowRetentionForReview,'function');let model='fixture',resolutions=0;
    const graph=graph3('reviewed-de-slop'),f=fixture(graph,{resolveBinding:(node,bindingGraph)=>{resolutions++;assert.ok(node.modelRole);assert.equal(Object.keys(bindingGraph.roles).length,0);return {ok:true,data:{profileId:'fixed',model}};}}),result=await f.generate(graph);
    assert.equal(result.ok,true,JSON.stringify(result.error));const run=host.inspectWorkflowRetentionForReview(f.controller).runs[0],check=run.bindingChecks[0];
    assert.equal(run.hasCancel,false);assert.equal(run.bindingContexts,0);assert.deepEqual(check.fields,['address','binding','graph','metadata','node']);assert.deepEqual(check.nodeFields,['model','modelRole','profileId']);assert.deepEqual(check.graphFields,['roles']);
    const count=resolutions;assert.equal(f.controller.candidateStatus(result.reviewHandles[0]).ok,true);assert.ok(resolutions>count);model='external-change';assert.equal(f.controller.candidateStatus(result.reviewHandles[0]).error.code,'BINDING_CHANGED');assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,false);assert.equal(f.message.mes,'We delve.');
});
