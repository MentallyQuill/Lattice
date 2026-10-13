import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveWorkflow, prepareWorkflowPlanner } from '../src/workflow/resolve.js?v=0.27.3';
import { runWorkflow, runWorkflowForHost } from '../src/workflow/runtime.js?v=0.27.3';
import { parseRunPlan } from '../src/workflow/record-data.js?v=0.27.3';

const node = (id, operation, settings = {}) => ({ id, type: 'workflow', operation, ...settings });
const wire = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
const graph = (nodes, wires, mode = 'native-unified') => ({ id: 'stages', schema: 3, runtime: 2, mode, nodes, wires: Object.fromEntries(wires.map(edge => [edge.id, edge])), definitions: {}, portals: {} });
const address = (nodeId, portId = 'out') => ({ workflowId: 'stages', instancePath: [], nodeId, portId });
function nativeGraph() {
    // The Post source deliberately precedes native generation in authored insertion order.
    return graph({
        snapshot: node('snapshot', 'reply-snapshot'), secondReview: node('secondReview', 'review-publish'),
        send: node('send', 'on-send'), generate: node('generate', 'generate-reply'), review: node('review', 'review-publish'),
        preText: node('preText', 'text', { text: 'preparation' }), postCompose: node('postCompose', 'compose', { phase: 'post', sections: [{ name: 'scene', text: '' }] }),
        notes: node('notes', 'append', { sectionId: 'scene-notes' }),
    }, [
        wire('snapshot-review', 'snapshot', 'out', 'secondReview', 'draft'),
        wire('activation', 'send', 'activation', 'generate', 'activation'),
        wire('post-text', 'preText', 'out', 'postCompose', 'section.scene'),
        wire('notes-text', 'postCompose', 'out', 'notes', 'section'),
        wire('notes-draft', 'generate', 'draft', 'notes', 'draft'),
        wire('review', 'notes', 'out', 'review', 'draft'),
    ]);
}
const selected = result => result.data.primitives.filter(unit => unit.included);
const ids = result => selected(result).map(unit => unit.node.id);
const dependencies = (result, id) => result.data.units.find(unit => unit.address.nodeId === id).dependencies.map(at => at.nodeId);

test('root native barrier orders independent Post sources after Generate and all selected Pre work before it', () => {
    const root = nativeGraph(), result = resolveWorkflow(root);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    const order = ids(result);
    assert.ok(order.indexOf('generate') < order.indexOf('snapshot'), 'Reply Snapshot must wait for the owned native reply');
    assert.ok(order.indexOf('preText') < order.indexOf('generate'), 'All selected preparation finishes before native release');
    assert.ok(dependencies(result, 'snapshot').includes('generate'));
    assert.ok(dependencies(result, 'generate').includes('preText'));
    assert.equal(result.data.edges.length, Object.keys(root.wires).length, 'Stage dependencies cannot become fake artifact wires');
    assert.ok(parseRunPlan(result.data));
    assert.equal(root.nodes.snapshot.phase, undefined, 'Planning cannot rewrite the author document');
});

test('one runtime plan suspends the native boundary before independent Post source execution', async () => {
    const visited = [], events = []; let resume, preparation = 0;
    const draft = { kind: 'draft', text: 'Native reply.', source: { token: 'native', originalText: 'Native reply.' } };
    const pending = runWorkflowForHost(nativeGraph(), { runId: 'single-stage-run', onEvent: event => events.push(event) }, {
        prepare() { preparation++; },
        executeHostOperation(operation) {
            visited.push(operation.id);
            if (operation.operation === 'on-send') return { ok: true, outputs: { activation: { kind: 'data', value: { type: 'owned-test-activation' } } } };
            if (operation.operation === 'generate-reply') return new Promise(resolve => resume = () => resolve({ ok: true, outputs: { draft, metadata: { kind: 'data', value: { type: 'native-generation' } } } }));
            if (operation.operation === 'reply-snapshot') return { ok: true, artifact: draft };
            throw new Error('Unexpected host operation');
        },
    });
    for (let i = 0; i < 20 && !resume; i++) await new Promise(resolve => setTimeout(resolve, 2));
    assert.equal(typeof resume, 'function', 'Preparation must reach and release its native rendezvous');
    assert.equal(visited.includes('snapshot'), false, 'Independent Post work cannot run before native completion');
    resume(); const result = await pending;
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(visited, ['send', 'generate', 'snapshot']);
    assert.equal(preparation, 1); assert.equal(result.runId, 'single-stage-run');
    assert.equal(events.filter(event => event.type === 'plan').length, 1);
    assert.equal(events.filter(event => event.type === 'run-settled').length, 1);
});

test('neutral both-stage nodes inherit Post from native output and Post producers', () => {
    const root = nativeGraph();
    root.nodes.body = node('body', 'draft-text'); root.nodes.decision = node('decision', 'decision', { inputKind: 'text' });
    root.nodes.fields = node('fields', 'select-fields'); root.nodes.metadataFields = node('metadataFields', 'select-fields');
    root.wires.body = wire('body', 'generate', 'draft', 'body', 'draft');
    root.wires.decision = wire('decision', 'body', 'out', 'decision', 'in');
    root.wires.fields = wire('fields', 'decision', 'out', 'fields', 'in'); root.wires.metadataFields = wire('metadataFields', 'generate', 'metadata', 'metadataFields', 'in');
    const result = resolveWorkflow(root, { target: address('fields') });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    for (const id of ['body', 'decision', 'fields', 'metadataFields']) assert.equal(result.data.units.find(unit => unit.address.nodeId === id).phase, 'post', id);
    const inventory = prepareWorkflowPlanner(root);
    assert.equal(inventory.ok, true, JSON.stringify(inventory.error));
    assert.equal(inventory.data.inventory.primitives.find(unit => unit.node.id === 'decision').phase, 'post');
    assert.equal(root.nodes.decision.phase, undefined);
});

test('explicit Pre work consuming Post fails before host preparation, sources, models or effects', async () => {
    const root = nativeGraph();
    root.nodes.body = node('body', 'draft-text'); root.nodes.decision = node('decision', 'decision', { inputKind: 'text', phase: 'pre' });
    root.wires.body = wire('body', 'snapshot', 'out', 'body', 'draft'); root.wires.decision = wire('decision', 'body', 'out', 'decision', 'in');
    let effects = 0;
    const result = await runWorkflowForHost(root, { snapshot: () => effects++, countTokens: () => effects++, resolveBinding: () => effects++, request: () => effects++ }, { prepare: () => effects++, executeHostOperation: () => effects++ });
    assert.equal(result.error?.code, 'INVALID_STAGE_DEPENDENCY'); assert.equal(effects, 0);
});

test('fixed Pre Guidance consuming an independent Post source is rejected before native authority', () => {
    const root = nativeGraph();
    root.nodes.body = node('body', 'draft-text'); root.nodes.guide = node('guide', 'compose', { outputKind: 'guidance', sections: [{ name: 'scene', text: '' }] });
    root.wires.body = wire('body', 'snapshot', 'out', 'body', 'draft');
    root.wires.guide = wire('guide', 'body', 'out', 'guide', 'section.scene'); root.wires.guidance = wire('guidance', 'guide', 'out', 'generate', 'guidance');
    const result = resolveWorkflow(root);
    assert.equal(result.error?.code, 'INVALID_STAGE_DEPENDENCY');
});

test('multiple selected native generators are rejected while unselected generators do not widen target authority', async () => {
    const root = nativeGraph();
    root.nodes.sendTwo = node('sendTwo', 'on-send'); root.nodes.generateTwo = node('generateTwo', 'generate-reply'); root.nodes.reviewTwo = node('reviewTwo', 'review-publish');
    root.wires.activationTwo = wire('activationTwo', 'sendTwo', 'activation', 'generateTwo', 'activation'); root.wires.reviewTwo = wire('reviewTwo', 'generateTwo', 'draft', 'reviewTwo', 'draft');
    assert.equal(resolveWorkflow(root).error?.code, 'MULTIPLE_NATIVE_GENERATIONS');
    delete root.nodes.reviewTwo; delete root.wires.reviewTwo;
    assert.equal(resolveWorkflow(root).ok, true, 'An unselected generator is an unfinished authoring branch');
    const target = resolveWorkflow(root, { target: address('preText') });
    assert.equal(target.ok, true, JSON.stringify(target.error)); assert.deepEqual(ids(target), ['preText']);
    let effects = 0;
    const preview = await runWorkflow(root, { target: address('preText'), preview: true, snapshot: () => effects++, resolveBinding: () => effects++, request: () => effects++ });
    assert.equal(preview.ok, true); assert.equal(effects, 0);
});

test('source-free and existing reply target closures do not acquire an unrelated native boundary', async () => {
    const root = nativeGraph();
    const target = resolveWorkflow(root, { target: address('snapshot') });
    assert.equal(target.ok, true, JSON.stringify(target.error)); assert.deepEqual(ids(target), ['snapshot']);
    assert.deepEqual(dependencies(target, 'snapshot'), []);
    const planner = prepareWorkflowPlanner(root); assert.equal(planner.ok, true);
    assert.deepEqual(planner.data.summarize(address('snapshot')).data.requiredBindingAddresses, []);
    let sources = 0;
    const result = await runWorkflow(root, { target: address('snapshot'), snapshot: () => { sources++; return { kind: 'draft', text: 'Existing reply.', source: { originalText: 'Existing reply.' } }; } });
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(sources, 1);
});

test('legacy Pre and Post graph ordering and effective phases remain unchanged', () => {
    for (const mode of ['native-pre', 'native-post']) {
        const root = graph({ text: node('text', 'text', { text: '{}' }), decoded: node('decoded', 'json-decode') }, [wire('decode', 'text', 'out', 'decoded', 'in')], mode);
        const result = resolveWorkflow(root, { target: address('decoded') });
        assert.equal(result.ok, true, JSON.stringify(result.error)); assert.deepEqual(ids(result), ['text', 'decoded']);
        assert.equal(result.data.units.every(unit => unit.phase === mode.slice(7)), true);
        assert.deepEqual(dependencies(result, 'decoded'), ['text']);
    }
});
for (const status of ['skipped', 'unresolved', 'partial-native']) test(`native ${status} completion holds independent Post sources, binding and model work`, async () => {
    const root = nativeGraph(); root.nodes.model = node('model', 'model-call', { phase: 'post' });
    root.wires.model = wire('model', 'postCompose', 'out', 'model', 'prompt'); root.wires['notes-text'] = wire('notes-text', 'model', 'out', 'notes', 'section');
    let postSources = 0, bindings = 0, requests = 0, nativeCalls = 0;
    const result = await runWorkflowForHost(root, { resolveBinding: () => { bindings++; return { ok: true, data: { model: 'model' } }; }, countTokens: async () => ({ tokens: 1 }), request: () => { requests++; } }, {
        executeHostOperation(operation) {
            if (operation.operation === 'on-send') return status === 'partial-native'
                ? { ok: true, outputs: { activation: { kind: 'data', value: true } } }
                : { ok: true, outputStates: { activation: { status, reason: { code: 'TEST_ACTIVATION_HOLD', message: 'Activation did not complete.' } } } };
            if (operation.operation === 'generate-reply') { nativeCalls++; return { ok: true, outputs: { draft: { kind: 'draft', text: 'Native', source: { originalText: 'Native' } } } }; }
            if (operation.operation === 'reply-snapshot') { postSources++; return { ok: true, artifact: { kind: 'draft', text: 'Other', source: { originalText: 'Other' } } }; }
        },
    });
    assert.deepEqual([postSources, bindings, requests], [0, 0, 0]);
    assert.equal(nativeCalls, status === 'partial-native' ? 1 : 0);
    assert.equal(result.ok, status === 'skipped');
    if (status !== 'skipped') assert.equal(result.error?.code, 'UNRESOLVED_INPUT');
    const row = result.recording.units.find(unit => unit.operation === 'reply-snapshot');
    assert.equal(row.status, status === 'skipped' ? 'skipped' : 'unresolved');
});

test('unresolved independent preparation prevents the native boundary from dispatching', async () => {
    const root = nativeGraph();
    root.nodes.preFile = node('preFile', 'read-file', { targetId: 'notes' });
    root.wires['post-text'] = wire('post-text', 'preFile', 'text', 'postCompose', 'section.scene');
    let nativeCalls = 0;
    const result = await runWorkflowForHost(root, {}, { executeHostOperation(operation) {
        if (operation.operation === 'on-send') return { ok: true, outputs: { activation: { kind: 'data', value: true } } };
        if (operation.operation === 'read-file') return { ok: true, outputStates: { text: { status: 'unresolved', reason: { code: 'FILE_HELD', message: 'File snapshot is unresolved.' } } } };
        if (operation.operation === 'generate-reply') { nativeCalls++; throw new Error('Cannot generate after unresolved preparation'); }
    } });
    assert.equal(result.error?.code, 'UNRESOLVED_INPUT', JSON.stringify(result.error)); assert.equal(nativeCalls, 0);
});
test('private native boundary receives detached exact binding snapshots without recording credentials', async () => {
    const root = nativeGraph();
    root.nodes.prepareModel = node('prepareModel', 'model-call'); root.nodes.guide = node('guide', 'compose', { outputKind: 'guidance', sections: [{ name: 'model', text: '' }] });
    root.wires.prepareModel = wire('prepareModel', 'preText', 'out', 'prepareModel', 'prompt'); root.wires.guide = wire('guide', 'prepareModel', 'out', 'guide', 'section.model'); root.wires.guidance = wire('guidance', 'guide', 'out', 'generate', 'guidance');
    const binding = { profileId: 'fixed', model: 'prepared-model', privateCredential: 'private-binding-sentinel' };
    const draft = { kind: 'draft', text: 'Native', source: { originalText: 'Native' } };
    let captured;
    const result = await runWorkflowForHost(root, { resolveBinding: () => ({ ok: true, data: binding }), countTokens: async () => ({ tokens: 2 }), request: async () => ({ ok: true, data: { text: 'Guidance', finish: 'stop' } }) }, {
        executeHostOperation(operation, inputs, local) {
            assert.equal(typeof local.getRequestBindings, 'function');
            if (operation.operation === 'on-send') { assert.deepEqual(local.getRequestBindings(), []); return { ok: true, outputs: { activation: { kind: 'data', value: true } } }; }
            if (operation.operation === 'generate-reply') {
                captured = local.getRequestBindings(); assert.equal(captured.length, 1);
                assert.equal(captured[0].binding, binding); assert.equal(captured[0].address.nodeId, 'prepareModel');
                assert.equal(captured[0].capability, 'text-completion'); assert.equal(captured[0].role, 'Prose');
                assert.equal(Object.isFrozen(captured), true); assert.equal(Object.isFrozen(captured[0]), true); assert.equal(Object.isFrozen(captured[0].address.instancePath), true);
                assert.throws(() => captured.push({}));
                return { ok: true, outputs: { draft, metadata: { kind: 'data', value: true } } };
            }
            if (operation.operation === 'reply-snapshot') return { ok: true, artifact: draft };
        },
    });
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(captured[0].binding.privateCredential, 'private-binding-sentinel');
    assert.equal(JSON.stringify(result).includes('private-binding-sentinel'), false);
});
test('actual native controller releases preparation and resumes an independent Post reply source in the same run', async () => {
    const { createNativeWorkflowController } = await import('../src/workflow/host.js?v=0.27.3');
    const root = nativeGraph(), listeners = new Map(), results = [];
    const eventNames = ['GENERATION_STARTED', 'GENERATION_ENDED', 'MESSAGE_RECEIVED'];
    const context = { chatId: 'story', characterId: 0, groupId: null, characters: [{ data: { name: 'Mara' } }], chat: [{ mes: 'I open the door.', is_user: true, extra: {} }], extensionPrompts: {}, eventTypes: Object.fromEntries(eventNames.map(name => [name, name])), eventSource: { on(name, callback) { listeners.set(name, callback); }, emit(name, ...args) { return listeners.get(name)?.(...args); } } };
    let busy = true;
    const controller = createNativeWorkflowController({ context: () => context, getGraph: phase => phase === 'unified' ? root : undefined, isEnabled: () => true, userId: () => 'default-user', isBusy: () => busy, onResult: result => results.push(result) });
    controller.subscribe(); await context.eventSource.emit('GENERATION_STARTED', 'normal', {}, false);
    const prepared = await controller.beforeGenerate(context.chat.map(message => ({ ...message })), 8192, () => {}, 'normal');
    assert.equal(prepared.ok, true, JSON.stringify(prepared.error)); assert.equal(prepared.awaitingNative, true); assert.equal(results.length, 0);
    const now = new Date().toISOString(), text = 'Native reply.';
    context.chat.push({ mes: text, is_user: false, extra: {}, gen_started: now, gen_finished: now, swipe_id: 0, swipes: [text], swipe_info: [{ gen_started: now, gen_finished: now, extra: {} }] });
    await context.eventSource.emit('MESSAGE_RECEIVED', 1, 'normal'); busy = false; await context.eventSource.emit('GENERATION_ENDED', 2);
    for (let i = 0; i < 30 && !results.length; i++) await new Promise(resolve => setTimeout(resolve, 2));
    assert.equal(results.length, 1); assert.equal(results[0].ok, true, JSON.stringify(results[0].error));
    assert.equal(results[0].runId, prepared.runId); assert.equal(results[0].reviewHandles.length, 2);
    assert.equal(context.chat[1].mes, text, 'Both independent branches still require explicit review');
});
test('iteration bindings retain exact authority and child provenance at native preparation and final settlement',async()=>{
 const helper={id:'child-model',version:1,semanticHash:'sha256:'+'c'.repeat(64)},binding=Object.freeze({profileId:'helper-profile',model:'helper-model',authorization:'PRIVATE_ITERATION',opaque(){}}),childAddress={workflowId:helper.id,instancePath:[],nodeId:'choose'};
 const root=graph({items:node('items','text',{text:'[1]'}),decode:node('decode','json-decode'),each:node('each','for-each',{helper,limit:1,requestBoundPerIteration:1}),guide:node('guide','compose',{outputKind:'guidance',mode:'template',template:'Guidance {{data:}}',sections:[]}),send:node('send','on-send'),generate:node('generate','generate-reply'),review:node('review','review-publish')},[wire('json','items','out','decode','in'),wire('items','decode','out','each','in'),wire('data','each','out','guide','data'),wire('guide','guide','out','generate','guidance'),wire('activation','send','activation','generate','activation'),wire('reply','generate','draft','review','draft')]);
 let boundaryBindings,finalBindings,calls=0;
 const result=await runWorkflowForHost(root,{countTokens:async()=>({tokens:1}),request:async options=>{calls++;assert.equal(options.binding,binding);return {ok:true,data:{text:'Choice',finish:'stop'}};},iterateHelper:async(_,ports)=>{const response=await ports.request({binding,childAddress,messages:[{role:'user',content:'Choose.'}],maxTokens:8});return response.ok?{ok:true,artifact:{kind:'data',value:response.data.text}}:response;}},{executeHostOperation(operation,inputs,local){if(operation.operation==='on-send')return {ok:true,outputs:{activation:{kind:'data',value:{}}}};if(operation.operation==='generate-reply'){boundaryBindings=local.getRequestBindings();return {ok:true,outputs:{draft:{kind:'draft',text:'Native.',source:{token:'owned-native',originalText:'Native.'}},metadata:{kind:'data',value:{}}}};}throw new Error('Unexpected operation');},settle(transport){finalBindings=[...transport.bindings];return {ok:true};}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(calls,1);assert.equal(boundaryBindings.length,1);assert.equal(finalBindings.length,1);assert.equal(boundaryBindings[0].binding,binding);assert.equal(finalBindings[0].binding,binding);assert.deepEqual(boundaryBindings[0].iteration,{index:0,helper,childAddress});assert.deepEqual(finalBindings[0].iteration,{index:0,helper,childAddress});assert.doesNotMatch(JSON.stringify(result.recording),/PRIVATE_ITERATION/);
});

test('independent file consequence terminals participate in accepted native root selection',()=>{const root=graph({send:node('send','on-send'),generate:node('generate','generate-reply'),review:node('review','review-publish'),read:node('read','read-file',{targetId:'souls.json'}),record:node('record','text',{text:'Canonical effect'}),write:node('write','write-file')},[wire('activation','send','activation','generate','activation'),wire('reply','generate','draft','review','draft'),wire('file','read','reference','write','reference'),wire('record','record','out','write','text')]);const result=resolveWorkflow(root);assert.equal(result.ok,true,JSON.stringify(result.error));assert.ok(ids(result).includes('write'));assert.ok(result.data.terminals.some(terminal=>terminal.address.nodeId==='write'));assert.ok(dependencies(result,'write').includes('generate'));});
