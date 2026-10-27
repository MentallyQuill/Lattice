import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNativeWorkflowController } from '../src/workflow/host.js';
import { fixtureGraph } from './helpers/workflow-fixtures.mjs';
import { createDiagnosticHistory } from '../src/workflow/diagnostic-history.js';
import { requestModel, resolveBinding } from '../src/workflow/connections.js';
import { installMock } from './mock.js';

function diagnosticModelFixture(mode) {
    const graph = {id:'host-diagnostic-model',name:'Diagnostic model',schema:3,runtime:2,mode:'native-unified',nodes:{prompt:{id:'prompt',type:'workflow',operation:'text',text:'Synthetic prompt.'},model:{id:'model',type:'workflow',operation:'model-call',profileId:'synthetic',outputKind:'data',schema:JSON.stringify({type:'object',properties:{name:{type:'string'}}})}},wires:{prompt:{id:'prompt',route:'wire',from:'prompt',fromPort:'out',to:'model',toPort:'prompt'}}};
    const entries = new Map(), history = createDiagnosticHistory({store:{async read(id){return entries.get(id)??[];},async update(id,change){const next=change(entries.get(id)??[]);entries.set(id,next);return next;}}});
    let finish = 'length', extractions = 0, release, started;
    const context = {chatId:'chat',characterId:1,groupId:null,chat:[],extensionPrompts:{},CONNECT_API_MAP:{custom:{selected:'openai',source:'custom'}},chatCompletionSettings:{custom_url:'https://synthetic.example'},ChatCompletionService:{presetToGeneratePayload:async(_preset,_overrides,payload)=>payload},ConnectionManagerRequestService:{getProfile:id=>({id,name:'Synthetic',api:'custom',model:'synthetic'}),sendRequest:async()=>{started?.();if(release)await release;return {choices:[{message:{content:'{"name":7}'},finish_reason:finish}]};}},extractMessageFromData(){extractions++;return '{"name":7}';}};
    const controller = createNativeWorkflowController({context:()=>context,userId:()=> 'owner',isBusy:()=>false,countTokens:async()=>({tokens:4}),createDiagnosticCapture:origin=>history.begin(origin,{mode}),resolveBinding:(node,graph)=>resolveBinding(node,graph,context),request:request=>requestModel(request,context)});
    return {controller,history,context,entries,graph,scope:{userId:'owner',chatId:'chat',characterId:1,groupId:null},run:()=>controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'model',portId:'out'}),extractions:()=>extractions,setFinish:value=>{finish=value;},defer(promise,onStarted){release=promise;started=onStarted;}};
}

test('host metadata capture never extracts failed response text while full capture does', async () => {
    for (const [mode,expected] of [['metadata',0],['full',1]]) {
        const f = diagnosticModelFixture(mode);
        try {
            const result = await f.run();
            assert.equal(result.error?.code,'TRUNCATED_OUTPUT');
            assert.equal(f.extractions(),expected);
            const entry = (await f.history.list(f.scope)).data.entries[0];
            assert.equal(entry.error.code,'TRUNCATED_OUTPUT');
            assert.equal(entry.attempts[0].response?.text,mode === 'full'?'{"name":7}':undefined);
        } finally {f.controller.dispose();}
    }
});

test('host metadata capture retains schema validation and retry attempts without response diagnostics', async () => {
    const f = diagnosticModelFixture('metadata'); f.setFinish('stop'); f.graph.nodes.model.maxRetries = 1;
    try {
        const result = await f.run();
        assert.equal(result.error.code,'SCHEMA_MISMATCH');
        const entry = (await f.history.list(f.scope)).data.entries[0];
        assert.equal(entry.actualCalls,2);
        assert.equal(entry.attempts.length,2);
        assert.equal(entry.attempts[0].retry.reasonCode,'SCHEMA_MISMATCH');
        for (const row of entry.attempts) {
            assert.equal(row.response,undefined);
            assert.deepEqual(row.validationError.findings,[{path:'/name',keyword:'type',message:'Expected string; got number.'}]);
        }
        assert.equal(JSON.stringify(entry).includes('{"name":7}'),false);
    } finally {f.controller.dispose();}
});

for (const revoke of ['logging-off','clear']) test(`${revoke}: revoking a pending full host capture stops failed-text extraction and preserves other chats`, async () => {
    const f = diagnosticModelFixture('full');
    installMock({settings:{diagnosticLogging:true}});
    const facade = await import(`../src/run.js?diagnostic-live-${revoke}`);
    Object.assign(facade.getWorkflowDiagnosticHistory(),f.history);
    const origin = {userId:'owner',chatId:'chat',characterId:1,groupId:null,workflowId:'saved',workflowName:'Saved',runId:'saved',mode:'root',native:false,startedAt:1};
    await f.history.begin(origin).finish({ok:true});
    await f.history.begin({...origin,chatId:'other',runId:'other'}).finish({ok:true});
    let release, dispatched;
    const gate = new Promise(resolve=>{release=resolve;}), started = new Promise(resolve=>{dispatched=resolve;});
    f.defer(gate,dispatched);
    try {
        const pending = f.run(); await started;
        const revoked = revoke === 'logging-off' ? facade.setWorkflowDiagnosticLogging(false):f.history.clear(f.scope);
        release(); await revoked;
        assert.equal((await pending).error.code,'TRUNCATED_OUTPUT');
        assert.equal(f.extractions(),0);
        assert.deepEqual((await f.history.list(f.scope)).data.entries.map(row=>row.id),revoke === 'logging-off'?['saved']:[]);
        assert.deepEqual((await f.history.list({...f.scope,chatId:'other'})).data.entries.map(row=>row.id),['other']);
    } finally {release();f.controller.dispose();}
});

test('host opens a diagnostic capture before activity observers can replace the chat', async () => {
    const graph = fixtureGraph('structured-guidance');
    const context = { chatId: 'original-chat', characterId: 1, groupId: null, chat: [], extensionPrompts: {} };
    let user = 'original-user', captured, discarded = 0;
    const events = [], results = [];
    const controller = createNativeWorkflowController({
        context: () => context, userId: () => user, isBusy: () => false,
        createDiagnosticCapture(origin) {
            captured = origin;
            return { event: event => events.push(event), finish: result => results.push(result), discard: () => discarded++ };
        },
    });
    controller.subscribeActivity(activity => {
        if (activity?.busy) { context.chatId = 'replacement-chat'; user = 'replacement-user'; }
    });
    const result = await controller.runTarget(graph, { workflowId: graph.id, instancePath: [], nodeId: 'compose-json', portId: 'out' });
    assert.ok(captured, 'run must have an immutable diagnostic owner');
    assert.equal(captured.userId, 'original-user');
    assert.equal(captured.chatId, 'original-chat');
    assert.equal(captured.characterId, 1);
    assert.equal(captured.workflowId, graph.id);
    assert.equal(captured.mode, 'target');
    assert.equal(captured.native, false);
    assert.ok(Object.isFrozen(captured));
    assert.equal(captured.runId, result.runId);
    assert.ok(events.some(event => event.type === 'plan'));
    assert.equal(results.length, 0, 'a replacement scope cannot be saved under the original owner');
    assert.equal(discarded, 1);
});

test('diagnostic observer failures do not change workflow execution or its live result', async () => {
    const graph = fixtureGraph('structured-guidance');
    const context = { chatId: 'chat', characterId: 1, groupId: null, chat: [], extensionPrompts: {} };
    let events = 0, finishes = 0;
    const controller = createNativeWorkflowController({
        context: () => context, userId: () => 'user', isBusy: () => false,
        createDiagnosticCapture() { return { event() { events++; throw Error('diagnostic event failure'); }, finish() { finishes++; return Promise.reject(Error('storage unavailable')); } }; },
    });
    const result = await controller.runTarget(graph, { workflowId: graph.id, instancePath: [], nodeId: 'compose-json', portId: 'out' });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(controller.lastResult(), result);
    assert.ok(events > 0);
    assert.equal(finishes, 1);
    await new Promise(resolve => setTimeout(resolve, 0));
});

test('manual native-boundary rejection is retained even without a runtime execution plan', async () => {
    const graph = fixtureGraph('structured-guidance');
    const results = [];
    let origin;
    const controller = createNativeWorkflowController({
        context: () => ({ chatId: 'chat', characterId: 1, groupId: null, chat: [], extensionPrompts: {} }),
        userId: () => 'user',
        createDiagnosticCapture(value) { origin = value; return { finish: result => results.push(result) }; },
    });
    const result = await controller.runTarget(graph, { workflowId: graph.id, instancePath: [], nodeId: 'generate-reply', portId: 'draft' });
    assert.equal(result.error.code, 'NATIVE_OWNER_MISSING');
    assert.equal(results.length, 1);
    assert.equal(results[0], result);
    assert.equal(origin.runId, result.runId);
});
