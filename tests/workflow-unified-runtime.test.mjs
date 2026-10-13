import assert from 'node:assert/strict';
import test from 'node:test';
import { runWorkflow } from '../src/workflow/runtime.js';
import { runWorkflowForHost } from '../src/workflow/runtime.js';
import { expandRecordAddress } from '../src/workflow/record-data.js';
import { createRunRecorder } from '../src/workflow/recording.js';
import { fixtureGraph as starterGraph } from './helpers/workflow-fixtures.mjs';
const guidanceTarget=root=>({workflowId:root.id,instancePath:[],nodeId:'guidance',portId:'out'});
import { requestModel, resolveBinding } from '../src/workflow/connections.js';
import { createRunState, reduceRunState } from '../src/workflow/run-state.js';

const node = (id, operation, settings = {}) => ({ id, type: 'workflow', operation, ...settings });
const wire = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
const graph = (nodes, edges, mode = 'native-unified') => ({ id: 'control-runtime', schema: 3, runtime: 2, mode, nodes, wires: Object.fromEntries(edges.map(edge => [edge.id, edge])), definitions: {}, portals: {} });
const address = (id, portId = 'out') => ({ workflowId: 'control-runtime', instancePath: [], nodeId: id, portId });
const unit = (result, id) => result.recording.units.find(item => expandRecordAddress(result.recording, item.address).nodeId === id);
const output = (result, id, portId = 'out') => {
    const row = unit(result, id), pin = row.ports.find(pin => pin.direction === 'output' && result.recording.identities.strings[pin.port] === portId);
    return pin.artifact === null ? undefined : result.recording.artifacts[pin.artifact].value;
};

test('Branch routes only its selected output and skips an unbound model without a request', async () => {
    const root = graph({
        source: node('source', 'reply-snapshot'),
        json: node('json', 'compose', { sections: [{ name: 'decision', text: '{"active":false}' }] }),
        data: node('data', 'json-decode'), condition: node('condition', 'condition', { path: ['active'], operator: 'equals', value: true }),
        branch: node('branch', 'branch', { artifactKind: 'draft' }),
        model: node('model', 'repair'), planned: node('planned', 'validate-patches'), selected: node('selected', 'apply-reply'),
        fallback: node('fallback', 'repair', { mode: 'scan' }), checked: node('checked', 'validate-patches'), final: node('final', 'apply-reply'),
    }, [wire('a', 'json', 'out', 'data', 'in'), wire('b', 'data', 'out', 'condition', 'in'), wire('c', 'condition', 'out', 'branch', 'condition'), wire('d', 'source', 'out', 'branch', 'in'), wire('e', 'branch', 'yes', 'model', 'in'), wire('f', 'model', 'out', 'planned', 'in'), wire('g', 'branch', 'no', 'fallback', 'in'), wire('h', 'fallback', 'out', 'checked', 'in'), wire('i', 'checked', 'out', 'final', 'in'), wire('j', 'planned', 'out', 'selected', 'in')]);
    for (const mode of ['native-unified']) {
        let bindings = 0, requests = 0;
        const result = await runWorkflow({ ...root, mode }, { snapshot: () => ({ kind: 'draft', text: 'An ordinary scene.', spans: [], source: { originalText: 'An ordinary scene.' } }), countTokens: async () => ({ tokens: 8 }), resolveBinding: () => { bindings++; return { ok: false, error: { code: 'PROFILE_MISSING', message: 'Missing' } }; }, request: () => { requests++; } });
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.deepEqual([bindings, requests, result.actualCalls], [0, 0, 0]);
        assert.equal(unit(result, 'model').status, 'skipped');
        assert.equal(unit(result, 'planned').status, 'skipped');
        assert.equal(output(result, 'branch', 'yes'), undefined);
        assert.equal(output(result, 'branch', 'no').kind, 'draft');
    }
});

test('activated sources precede binding failure and retain bounded failure recording', async () => {
    const root = starterGraph('native-guidance'), effects = [], events = [];
    const result = await runWorkflow(root, { target: guidanceTarget(root),
        snapshot: () => { effects.push('snapshot'); return {kind:'context',messages:[{id:'1',role:'user',text:'A scene.',source:'chat'}]}; },
        countTokens: async () => ({tokens:1,method:'fixture'}),
        resolveBinding: node => { effects.push('bind:' + node.id); return node.operation === 'response-plan' ? { ok: false, error: { code: 'FIXTURE_UNBOUND', message: 'Choose a profile' } } : { ok: true, data: { profileId: 'fixed', model: 'fixture' } }; },
        request: () => { effects.push('request'); }, onEvent: event => events.push(event),
    });
    assert.equal(result.error?.code, 'FIXTURE_UNBOUND');
    assert.deepEqual(effects, ['snapshot','bind:smart-compactor','bind:response-plan']);
    assert.equal(result.actualCalls, 0); assert.equal(result.recording.status, 'failed');
    assert.equal(unit(result, 'scene-context').status, 'completed'); assert.equal(unit(result, 'smart-compactor').status, 'completed');
    assert.equal(unit(result, 'response-plan').status, 'failed'); assert.equal(unit(result, 'guidance').status, 'blocked');
    assert.equal(unit(result, 'response-plan').error.code, 'FIXTURE_UNBOUND');
    assert.ok(events.some(event => event.type === 'node-phase' && event.address?.nodeId === 'response-plan' && event.phase === 'binding'));
});

test('unified sources and injected host outputs keep activation-time binding', async () => {
    const root = starterGraph('native-guidance'); let bindings = 0;
    const ports = { snapshot: () => undefined, resolveBinding: () => { bindings++; return { ok: false, error: { code: 'UNBOUND', message: 'No profile' } }; } };
    const unified = await runWorkflow({ ...root, mode: 'native-unified' }, { ...ports, target: { workflowId: root.id, instancePath: [], nodeId: 'response-plan', portId: 'out' } });
    assert.equal(unified.error?.code, 'INVALID_SNAPSHOT'); assert.equal(bindings, 0);
    const skipped = await runWorkflowForHost(root, {...ports,target:guidanceTarget(root)}, { executeHostOperation: () => ({ ok: true, outputStates: { out: { status: 'skipped' } } }) });
    assert.equal(skipped.ok, true, JSON.stringify(skipped.error)); assert.equal(bindings, 0);
    assert.equal(unit(skipped, 'response-plan').status, 'skipped');
});

test('an activated binding authenticates current host state after tokenizer callbacks', async () => {
    const root = starterGraph('native-guidance'), profile = { id: 'fixed', name: 'Fixed', api: 'oai', model: 'original' };
    root.nodes['smart-compactor'].profileId='fixed';root.nodes['smart-compactor'].targetTokens=64;root.nodes['smart-compactor'].keepRecent=0;
    let lookups = 0, transmitted = 0;
    const context = { CONNECT_API_MAP: { oai: { selected: 'openai', source: 'openai' } }, chatCompletionSettings: {}, ConnectionManagerRequestService: { getProfile: () => profile, sendRequest: () => { transmitted++; } } };
    const result = await runWorkflow(root, { target:{workflowId:root.id,instancePath:[],nodeId:'smart-compactor',portId:'out'},
        resolveBinding: (node, graph) => { lookups++; return resolveBinding(node, graph, context); },
        snapshot: () => { assert.equal(lookups, 0); return { kind: 'context', messages: [{ id: '1', role: 'user', text: 'What happens next?', source: 'chat' }] }; },
        countTokens: async text => { profile.model='changed-after-binding';return { tokens: text.length?1000:0, method: 'fixture' }; }, request: options => requestModel(options, context),
    });
    assert.equal(result.error?.code, 'BINDING_CHANGED'); assert.equal(result.recording.status, 'stale');
    assert.equal(lookups, 1); assert.equal(transmitted, 0);
});

test('a dependency-unsettled preflight marker never authorizes early execution or concurrent binding', () => {
    const a = { workflowId: 'preflight', instancePath: [], nodeId: 'source' }, b = { ...a, nodeId: 'model' };
    const plan = { workflowId: 'preflight', phase: 'pre', mode: 'root', callBound: 1, hierarchy: [], terminals: [], units: [
        { address: a, operation: 'scene-context', included: true, dependencies: [], requestBound: 0, inputPorts: [], outputPorts: ['out'] },
        { address: b, operation: 'response-plan', included: true, dependencies: [a], requestBound: 1, inputPorts: ['in'], outputPorts: ['out'] },
    ] };
    const event = (seq, type, fields) => ({ runId: 'preflight', seq, at: seq, elapsedMs: seq, type, ...fields });
    const waiting = reduceRunState(createRunState('preflight'), event(1, 'plan', { plan }));
    const bound = reduceRunState(waiting, event(2, 'node-phase', { address: b, phase: 'binding' }));
    assert.equal(bound.nodes[1].subphase, 'binding'); assert.equal(bound.nodes[1].status, 'waiting');
    assert.equal(reduceRunState(bound, event(3, 'node-phase', { address: b, phase: 'executing' })), bound);
    const running = reduceRunState(bound, event(4, 'node-phase', { address: a, phase: 'executing' }));
    assert.equal(reduceRunState(running, event(5, 'node-phase', { address: b, phase: 'binding' })), running);
});

test('runtime admits optional skipped pins and records a completed empty Collect', async () => {
    const root=graph({source:node('source','compose',{sections:[{name:'json',text:'false'}]}),decode:node('decode','json-decode'),condition:node('condition','condition',{value:true}),branch:node('branch','branch'),collect:node('collect','collect',{inputs:[{id:'optional',label:'Optional',required:false}]})},[wire('a','source','out','decode','in'),wire('b','decode','out','condition','in'),wire('c','decode','out','branch','in'),wire('d','condition','out','branch','condition'),wire('e','branch','yes','collect','optional')]);
    const result=await runWorkflow(root,{target:address('collect')});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(output(result,'collect').value,[]);
    const optional=unit(result,'collect').ports.find(port=>port.direction==='input');
    assert.equal(optional.state.status,'skipped');assert.equal(optional.artifact,null);
    assert.ok(result.recording.units.every(row=>row.phase==='pre'));
});

test('required unresolved input holds dependent model binding and remains distinct from failure',async()=>{
    const root=graph({source:node('source','compose',{sections:[{name:'json',text:'{}'}]}),decode:node('decode','json-decode'),condition:node('condition','condition',{path:['absent']}),branch:node('branch','branch'),join:node('join','join',{inputs:[{id:'base',label:'Base',required:true}]})},[wire('a','source','out','decode','in'),wire('b','decode','out','condition','in'),wire('c','decode','out','branch','in'),wire('d','condition','out','branch','condition'),wire('e','branch','yes','join','base')]);
    const result=await runWorkflow(root,{target:address('join')});
    assert.equal(result.ok,false);assert.equal(result.error.code,'UNRESOLVED_INPUT');assert.equal(result.recording.status,'unresolved');
    assert.equal(unit(result,'branch').status,'unresolved');assert.equal(unit(result,'join').status,'unresolved');
    assert.equal(output(result,'branch','yes'),undefined);
});

test('For Each counts activated helper requests once and enforces each iteration bound',async()=>{
    const helper={id:'model-helper',version:1,semanticHash:'sha256:'+'b'.repeat(64)};
    const root=graph({source:node('source','compose',{sections:[{name:'json',text:'[1,2]'}]}),decode:node('decode','json-decode'),each:node('each','for-each',{helper,limit:3,requestBoundPerIteration:1})},[wire('a','source','out','decode','in'),wire('b','decode','out','each','in')]);
    let requests=0;
    const ports={target:address('each'),countTokens:async()=>({tokens:2}),request:async()=>{requests++;return {ok:true,data:{text:'answer',finish:'stop'}};},iterateHelper:async({item},{request})=>{const response=await request({messages:[{role:'user',content:String(item)}],maxTokens:4});return response.ok?{ok:true,artifact:{kind:'data',value:response.data.text}}:response;}};
    const result=await runWorkflow(root,ports);
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.callBound,3);assert.equal(result.actualCalls,2);assert.equal(requests,2);assert.deepEqual(output(result,'each').value,['answer','answer']);
    const exceeded=await runWorkflow(root,{...ports,iterateHelper:async(_, {request})=>{await request({messages:[{role:'user',content:'one'}],maxTokens:4});await request({messages:[{role:'user',content:'two'}],maxTokens:4});return {ok:true,artifact:{kind:'data',value:'ignored failure'}};}});
    assert.equal(exceeded.error.code,'ITERATION_CALL_LIMIT');assert.equal(exceeded.actualCalls,1);assert.equal(output(exceeded,'each'),undefined);
});

test('iteration model bindings stay private while the shared root wrapper owns request accounting',async()=>{
    const helper={id:'model-helper',version:1,semanticHash:'sha256:'+'b'.repeat(64)},binding={profileId:'helper-profile',privateEndpoint:'secret'};
    const root=graph({source:node('source','compose',{sections:[{name:'json',text:'[1]'}]}),decode:node('decode','json-decode'),each:node('each','for-each',{helper,limit:1,requestBoundPerIteration:1})},[wire('a','source','out','decode','in'),wire('b','decode','out','each','in')]);
    const result=await runWorkflow(root,{target:address('each'),countTokens:async()=>({tokens:2}),request:async options=>options.binding===binding?{ok:true,data:{text:'bound helper',finish:'stop'}}:{ok:false,error:{code:'WRONG_BINDING',message:'Helper binding lost'}},iterateHelper:async(_, {request})=>{const response=await request({binding,messages:[{role:'user',content:'Confirm?'}],maxTokens:4});return response.ok?{ok:true,artifact:{kind:'data',value:response.data.text}}:response;}});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,1);assert.deepEqual(output(result,'each').value,['bound helper']);assert.ok(!JSON.stringify(result.recording).includes('secret'));
});

test('provider failures are failures and never turn into an accepted No branch',async()=>{
    const helper={id:'model-helper',version:1,semanticHash:'sha256:'+'b'.repeat(64)};
    const root=graph({source:node('source','compose',{sections:[{name:'json',text:'[1]'}]}),decode:node('decode','json-decode'),each:node('each','for-each',{helper,limit:1,requestBoundPerIteration:1})},[wire('a','source','out','decode','in'),wire('b','decode','out','each','in')]);
    const result=await runWorkflow(root,{target:address('each'),countTokens:async()=>({tokens:2}),request:async()=>({ok:false,error:{code:'TRANSPORT_FAILED',message:'Unavailable'}}),iterateHelper:async(_, {request})=>{await request({messages:[{role:'user',content:'Confirm?'}],maxTokens:4});return {ok:true,artifact:{kind:'data',value:false}};}});
    assert.equal(result.error.code,'TRANSPORT_FAILED');assert.equal(result.recording.status,'failed');assert.equal(output(result,'each'),undefined);
});

test('one run and recording span an awaited host source without restarting execution',async()=>{
    const root=graph({source:node('source','reply-snapshot')},[]);const events=[];let resume,prepared=0;
    const pending=runWorkflowForHost(root,{runId:'suspended-one',target:address('source'),onEvent:event=>events.push(event),snapshot:()=>{throw new Error('Use owned host operation');}},{prepare:async()=>{prepared++;},executeHostOperation:async(node,inputs,local)=>{assert.equal(node.operation,'reply-snapshot');assert.equal(local.phase,'post');assert.equal(local.rootMode,'native-unified');return new Promise(resolve=>{resume=resolve;});}});
    for(let i=0;i<20&&!resume;i++)await new Promise(resolve=>setImmediate(resolve));
    assert.equal(typeof resume,'function');
    assert.equal(events.filter(event=>event.type==='plan').length,1);assert.equal(events.some(event=>event.type==='run-settled'),false);
    resume({ok:true,outputs:{out:{kind:'draft',text:'Native reply',source:{originalText:'Native reply'}}}});
    const result=await pending;assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.runId,'suspended-one');assert.equal(result.recording.runId,'suspended-one');assert.equal(prepared,1);assert.equal(unit(result,'source').phase,'post');
});

test('runtime cancellation during iteration discards late artifacts and closes the same recording',async()=>{
    const helper={id:'model-helper',version:1,semanticHash:'sha256:'+'b'.repeat(64)},controller=new AbortController();
    const root=graph({source:node('source','compose',{sections:[{name:'json',text:'[1]'}]}),decode:node('decode','json-decode'),each:node('each','for-each',{helper,limit:1,requestBoundPerIteration:1})},[wire('a','source','out','decode','in'),wire('b','decode','out','each','in')]);
    const result=await runWorkflow(root,{runId:'cancelled-iteration',target:address('each'),signal:controller.signal,countTokens:async()=>({tokens:2}),request:async()=>{controller.abort();return {ok:true,data:{text:'late private result',finish:'stop'}};},iterateHelper:async(_, {request})=>{await request({messages:[{role:'user',content:'Work'}],maxTokens:4});return {ok:true,artifact:{kind:'data',value:'late private result'}};}});
    assert.equal(result.error.code,'ABORTED');assert.equal(result.recording.status,'cancelled');assert.equal(result.actualCalls,1);assert.equal(unit(result,'each').request.status,'cancelled');assert.ok(!JSON.stringify(result.recording).includes('late private result'));
});

test('port-state reasons remain bounded without creating artifacts for skipped outputs',()=>{
    const at={workflowId:'bounded-state',instancePath:[],nodeId:'branch'},recorder=createRunRecorder({runId:'bounded-state'});
    const plan={workflowId:'bounded-state',phase:'unified',mode:'target',target:{...at,portId:'no'},resolvedTarget:{...at,portId:'no'},callBound:0,units:[{address:at,operation:'branch',phase:'post',included:true,dependencies:[],requestBound:0,inputPorts:[],outputPorts:['no']}],hierarchy:[],terminals:[]};
    assert.equal(recorder.accept({runId:'bounded-state',seq:1,at:0,elapsedMs:0,type:'plan',plan}).ok,true);
    assert.equal(recorder.capture({address:at,direction:'output',portId:'no',state:{status:'skipped',reason:{code:'BRANCH_NOT_SELECTED',message:'private '.repeat(10000)}}}).ok,true);
    const record=recorder.snapshot();assert.equal(record.artifacts.length,0);assert.equal(record.units[0].ports[0].artifact,null);
    assert.ok(new TextEncoder().encode(record.units[0].ports[0].state.reason.message).byteLength<=128);
});

test('projected iteration records its ordered results and final state on distinct real pins',async()=>{
    const helper={id:'state-helper',version:1,semanticHash:'sha256:'+'c'.repeat(64)};
    const root=graph({items:node('items','text',{text:'[1,2]'}),initial:node('initial','text',{text:'{"total":0}'}),data:node('data','json-decode'),state:node('state','json-decode'),each:node('each','for-each',{helper,phase:'post',limit:2,mode:'projected-state'})},[wire('a','items','out','data','in'),wire('b','initial','out','state','in'),wire('c','data','out','each','in'),wire('d','state','out','each','state')]);
    const result=await runWorkflow(root,{target:address('each','state'),iterateHelper:async({item,projectedState,phase,rootMode})=>{assert.equal(phase,'post');assert.equal(rootMode,'native-unified');const total=projectedState.total+item;return {ok:true,artifact:{kind:'data',value:total},projectedState:{total}};}});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(output(result,'each','out').value,[1,3]);assert.deepEqual(output(result,'each','state').value,{total:3});
});

test('named host outputs must match declared ports and completed states require an artifact',async()=>{
    const root=graph({source:node('source','reply-snapshot')},[]);
    for(const returned of [{ok:true,outputs:{undeclared:{kind:'draft',text:'wrong'}}},{ok:true,outputs:{out:{kind:'data',value:1}}},{ok:true,outputStates:{out:{status:'completed'}}}]){
        const result=await runWorkflowForHost(root,{target:address('source')},{executeHostOperation:()=>returned});
        assert.equal(result.error.code,'INVALID_OUTPUT');assert.equal(result.recording.status,'failed');assert.equal(output(result,'source'),undefined);
    }
});

test('ordinary operations omit declared optional skipped inputs and use their authored fallback',async()=>{
    const root=graph({text:node('text','text',{text:'selected branch'}),decision:node('decision','text',{text:'false'}),data:node('data','json-decode'),branch:node('branch','branch',{artifactKind:'text'}),fallback:node('fallback','compose',{sections:[{name:'optional',text:'authored fallback'}]})},[wire('a','decision','out','data','in'),wire('b','data','out','branch','condition'),wire('c','text','out','branch','in'),wire('d','branch','yes','fallback','section.optional')]);
    const result=await runWorkflow(root,{target:address('fallback')});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(output(result,'fallback')?.text,'authored fallback');assert.equal(unit(result,'fallback').status,'completed');
});

test('reserved For Each requests need no parent profile and retain iteration child provenance',async()=>{
    const helper={id:'model-helper',version:1,semanticHash:'sha256:'+'b'.repeat(64)};
    const root=graph({source:node('source','text',{text:'[1,2]'}),decode:node('decode','json-decode'),each:node('each','for-each',{helper,limit:3,requestBoundPerIteration:1})},[wire('a','source','out','decode','in'),wire('b','decode','out','each','in')]);
    let lookups=0;const events=[];
    const result=await runWorkflow(root,{target:address('each'),resolveBinding:()=>{lookups++;throw new Error('No parent model');},countTokens:async()=>({tokens:1}),onEvent:event=>events.push(event),request:async()=>({ok:true,data:{text:'answer',finish:'stop'}}),iterateHelper:async({index},{request})=>{const response=await request({childAddress:{workflowId:helper.id,instancePath:[],nodeId:'decision-'+index},messages:[{role:'user',content:'Work'}],maxTokens:2});return response.ok?{ok:true,artifact:{kind:'data',value:index}}:response;}});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(lookups,0);
    const requests=events.filter(event=>event.type==='request-start');assert.deepEqual(requests.map(event=>event.iteration?.index),[0,1]);assert.deepEqual(requests.map(event=>event.iteration?.childAddress?.nodeId),['decision-0','decision-1']);assert.deepEqual(unit(result,'each').request.iteration?.helper,helper);
});

test('empty For Each reserves its conservative bound without binding a model or invoking a helper',async()=>{
    const helper={id:'model-helper',version:1,semanticHash:'sha256:'+'b'.repeat(64)};
    const root=graph({source:node('source','text',{text:'[]'}),decode:node('decode','json-decode'),each:node('each','for-each',{helper,limit:3,requestBoundPerIteration:2})},[wire('a','source','out','decode','in'),wire('b','decode','out','each','in')]);
    let effects=0;const effect=()=>{effects++;throw new Error('Empty iteration');};
    const result=await runWorkflow(root,{target:address('each'),resolveBinding:effect,request:effect,countTokens:effect,iterateHelper:effect});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.callBound,6);assert.equal(result.actualCalls,0);assert.equal(effects,0);assert.deepEqual(output(result,'each').value,[]);
});


test('retired root modes fail execution admission before any source or model effects', async () => {
    for (const mode of ['native-pre', 'native-post']) {
        const root = graph({ source: node('source', mode === 'native-pre' ? 'scene-context' : 'reply-snapshot') }, [], mode);
        let effects = 0; const effect = () => { effects++; throw Error('Retired root executed'); };
        const result = await runWorkflow(root, { target: address('source'), snapshot: effect, resolveBinding: effect, countTokens: effect, request: effect });
        assert.equal(result.ok, false); assert.equal(result.error.code, 'WRONG_PHASE'); assert.equal(effects, 0); assert.equal(result.actualCalls, 0);
    }
});


test('runtime Reroute and Data Branch/Join retain exact Matches values for a direct Filter', async () => {
    const { runWorkflowForHost } = await import('../src/workflow/runtime.js?v=0.27.1');
    const f = await import('./helpers/pattern-routing-fixtures.mjs');
    const { getPatternReportBinding } = await import('../src/workflow/operations/pattern-engine.js?v=0.27.1');
    const root = f.routingGraph();
    root.nodes.reportRoute = f.node('reportRoute', 'reroute', { artifactKind: 'data' });
    root.nodes.reportBranch = f.node('reportBranch', 'branch', { artifactKind: 'data' });
    root.nodes.reportJoin = f.node('reportJoin', 'join', { artifactKind: 'data', inputs: f.slots('yes', 'no') });
    delete root.wires.report;
    for (const edge of [f.wire('r1', 'pattern', 'matches', 'reportRoute', 'in'), f.wire('r2', 'reportRoute', 'out', 'reportBranch', 'in'), f.wire('r3', 'pattern', 'matched', 'reportBranch', 'condition'), f.wire('r4', 'reportBranch', 'yes', 'reportJoin', 'yes'), f.wire('r5', 'reportBranch', 'no', 'reportJoin', 'no'), f.wire('r6', 'reportJoin', 'out', 'filter', 'matches')]) root.wires[edge.id] = edge;
    const h = f.hostHarness(f.fourteen), result = await runWorkflowForHost(root, h.ports, h.hooks);
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(h.effects.filters, 1); assert.equal(h.effects.requests, 0);
    const report = f.retained(h.outputs, 'pattern', 'matches'), input = f.retained(h.outputs, 'generate', 'draft');
    for (const [id, port] of [['reportRoute', 'out'], ['reportBranch', 'yes'], ['reportJoin', 'out']]) {
        assert.equal(f.retained(h.outputs, id, port), report); assert.equal(f.retained(h.outputs, id, port).value, report.value);
    }
    assert.equal(getPatternReportBinding(report.value, input).ok, true); assert.equal(h.effects.commits, 1);
});
