import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runWorkflow, runWorkflowForHost } from '../src/workflow/runtime.js';
import { safeError, bytes } from '../src/workflow/record-data.js';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definition-data.js';
import { requestModel, resolveBinding } from '../src/workflow/connections.js';

const node = (id, operation, controls = {}) => ({ id, type: 'workflow', operation, ...controls });
const wire = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
const graph = (controls = {}) => ({ id: 'diagnostic-runtime', schema: 3, runtime: 2, mode: 'native-unified', nodes: { source: node('source', 'text', { text: 'Prompt content must stay outside diagnostics.' }), model: node('model', 'model-call', { outputKind: 'data', ...controls }) }, wires: { input: wire('input', 'source', 'out', 'model', 'prompt') } });
const address = { workflowId: 'diagnostic-runtime', instancePath: [], nodeId: 'model' };
const ports = { target: { ...address, portId: 'out' }, resolveBinding: () => ({ ok: true, data: { profileId: 'fixed', model: 'fixed-model', endpoint: 'SECRET endpoint' } }), countTokens: async () => ({ tokens: 4 }) };
function connectionFixture(sendRequest) {
    const context = { CONNECT_API_MAP: { custom: { selected: 'openai', source: 'custom' } }, chatCompletionSettings: { custom_url: 'https://synthetic.example' }, ChatCompletionService: { presetToGeneratePayload: async (_preset, _overrides, payload) => payload }, ConnectionManagerRequestService: { getProfile: id => ({ id, name: 'Synthetic connection', api: 'custom', model: 'synthetic' }), sendRequest } };
    const bound = resolveBinding({ profileId: 'synthetic' }, {}, context);
    assert.equal(bound.ok, true, JSON.stringify(bound.error));
    return { context, bound };
}
function helperGraph() {
    const raw = { id: 'diagnostic-helper', version: 1, name: 'Diagnostic helper', interface: [{ id: 'item', label: 'Item', direction: 'input', kind: 'data', required: true, cardinality: 'one', boundaryNodeId: 'entry' }, { id: 'result', label: 'Result', direction: 'output', kind: 'data', required: false, cardinality: 'one', boundaryNodeId: 'exit' }], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-unified', nodes: { entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'item' }, prompt: node('prompt', 'text', { text: 'Return a proposed room.' }), model: node('model', 'model-call', { outputKind: 'data', maxRetries: 1 }), exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'result' } }, wires: { prompt: wire('prompt', 'prompt', 'out', 'model', 'prompt'), evidence: wire('evidence', 'entry', 'out', 'model', 'data'), result: wire('result', 'model', 'out', 'exit', 'in') } } };
    const checked = computeDefinitionIdentity(raw);
    assert.equal(checked.ok, true, JSON.stringify(checked.error));
    const definition = { ...checked.data.materializedDefinition, semanticHash: checked.data.semanticHash }, ref = { id: definition.id, version: 1, semanticHash: definition.semanticHash };
    return { id: address.workflowId, schema: 3, runtime: 2, mode: 'native-unified', definitions: { [definitionRefKey(ref)]: definition }, nodes: { source: node('source', 'text', { text: '[{"item":1}]' }), decode: node('decode', 'json-decode'), each: node('each', 'for-each', { helper: ref, limit: 1, requestBoundPerIteration: 2 }) }, wires: { source: wire('source', 'source', 'out', 'decode', 'in'), items: wire('items', 'decode', 'out', 'each', 'in') } };
}

test('failed auxiliary completion text uses only the optional separate diagnostic sink', async () => {
    const diagnostics = [], events = [];
    const raw = 'FAILED_RAW_COMPLETION { invalid JSON';
    const result = await runWorkflow(graph(), { ...ports, onDiagnostic: event => diagnostics.push(event), onEvent: event => events.push(event), request: async () => ({ ok: true, data: { text: raw, finish: 'stop', usage: { outputTokens: 3, secret: 'SECRET usage' }, reasoning: 'SECRET reasoning' } }) });
    assert.equal(result.error.code, 'INVALID_JSON');
    assert.deepEqual(diagnostics[0], { type: 'response', address, attempt: 1, text: raw, visibility: { kind: 'public' }, finish: 'stop', usage: { outputTokens: 3 } });
    assert.equal(JSON.stringify({ result, events }).includes(raw), false);
    assert.equal(JSON.stringify(diagnostics).includes('SECRET'), false);
    assert.equal(JSON.stringify(diagnostics).includes('Prompt content'), false);
});

test('a corrected retry retains the failed attempt validation before the successful response', async () => {
    const diagnostics = [], events = [], messages = [];
    const schema = JSON.stringify({ type: 'object', required: ['name'], properties: { name: { type: 'string' } } });
    let calls = 0;
    const result = await runWorkflow(graph({ maxRetries: 2, schema }), { ...ports, onDiagnostic: event => diagnostics.push(event), onEvent: event => events.push(event), request: async options => { messages.push(options.messages); return { ok: true, data: { text: ++calls === 1 ? '{"name":7}' : '{"name":"Mara"}', finish: 'stop' } }; } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.actualCalls, 2);
    assert.equal(result.callBound, 3);
    assert.deepEqual(diagnostics.map(event => [event.type, event.attempt]), [['response', 1], ['validation', 1], ['response', 2]]);
    assert.equal(diagnostics[1].error.code, 'SCHEMA_MISMATCH');
    assert.deepEqual(diagnostics[1].error.findings, [{ path: '/name', keyword: 'type', message: 'Expected string; got number.' }]);
    assert.equal(events.filter(event => event.type === 'node-retry').length, 1);
    assert.equal(messages[1].length, messages[0].length + 2);
});

test('terminal JSON failures report both original and corrected attempt validation', async () => {
    const diagnostics = [];
    const result = await runWorkflow(graph({ maxRetries: 2 }), { ...ports, onDiagnostic: event => diagnostics.push(event), request: async () => ({ ok: true, data: { text: 'FAILED malformed document', finish: 'stop' } }) });
    assert.equal(result.error.code, 'INVALID_JSON');
    assert.equal(result.actualCalls, 2);
    assert.equal(result.callBound, 3);
    assert.deepEqual(diagnostics.map(event => [event.type, event.attempt]), [['response', 1], ['validation', 1], ['response', 2], ['validation', 2]]);
    assert.equal(diagnostics.filter(event => event.type === 'validation').every(event => event.error.code === 'INVALID_JSON'), true);
});

test('terminal schema findings remain bounded structural data in diagnostics and recording errors', async () => {
    const diagnostics = [];
    const schema = JSON.stringify({ type: 'object', required: Array.from({ length: 40 }, (_, i) => 'field' + i) });
    const result = await runWorkflow(graph({ schema }), { ...ports, onDiagnostic: event => diagnostics.push(event), request: async () => ({ ok: true, data: { text: '{}', finish: 'stop' } }) });
    assert.equal(result.error.code, 'SCHEMA_MISMATCH');
    assert.equal(result.error.findings.length, 32);
    assert.equal(result.error.truncated, true);
    assert.deepEqual(result.recording.error.findings, result.error.findings);
    assert.equal(result.recording.error.truncated, true);
    assert.deepEqual(diagnostics[1].error.findings, result.error.findings);
    let getters = 0;
    const projected = safeError({ code: 'SCHEMA_MISMATCH', message: 'Mismatch.', findings: [{ path: '/' + '😀'.repeat(1000), keyword: 'type'.repeat(100), message: 'm'.repeat(2000), value: 'SECRET schema value', get schema() { getters++; return 'SECRET schema'; } }] });
    assert.equal(getters, 0);
    assert.deepEqual(Object.keys(projected.findings[0]), ['path', 'keyword', 'message']);
    assert.equal(bytes(projected.findings[0].path) <= 1024, true);
    assert.equal(bytes(projected.findings[0].keyword) <= 64, true);
    assert.equal(bytes(projected.findings[0].message) <= 512, true);
    assert.equal(projected.truncated, true);
});

test('response visibility honors the trusted final actor authorization and conflicting input restrictions', async () => {
    const diagnostics = [];
    const result = await runWorkflowForHost(graph(), { ...ports, onDiagnostic: event => diagnostics.push(event), request: async () => ({ ok: true, data: { text: 'PRIVATE failed JSON', finish: 'stop', visibility: { kind: 'public' } } }) }, { authorizeModelInputs: () => ({ ok: true, data: { scope: { actorId: 'mara' } } }) });
    assert.equal(result.error.code, 'INVALID_JSON');
    assert.deepEqual(diagnostics[0].visibility, { kind: 'actor-private', actorId: 'mara' });
});

test('an explicit unknown authorization scope never becomes public diagnostic text', async () => {
    for (const scope of [{}, { actorId: 7 }, { actorId: '' }]) {
        const diagnostics = [];
        const result = await runWorkflowForHost(graph(), { ...ports, onDiagnostic: event => diagnostics.push(event), request: async () => ({ ok: true, data: { text: 'FAILED unknown scope', finish: 'stop' } }) }, { authorizeModelInputs: () => ({ ok: true, data: { scope } }) });
        assert.equal(result.error.code, 'INVALID_JSON');
        assert.deepEqual(diagnostics[0].visibility, { kind: 'hidden' });
    }
});

test('diagnostic scope projection introduces no callbacks between final authorization and dispatch', async () => {
    let dispatched = false, projectedBeforeDispatch = false;
    const scope = new Proxy({ actorId: 'mara' }, { getOwnPropertyDescriptor(target, key) { if (!dispatched) projectedBeforeDispatch = true; return Reflect.getOwnPropertyDescriptor(target, key); } });
    const diagnostics = [];
    const result = await runWorkflowForHost(graph(), { ...ports, onDiagnostic: event => diagnostics.push(event), request: async () => { dispatched = true; return { ok: true, data: { text: 'FAILED JSON', finish: 'stop' } }; } }, { authorizeModelInputs: () => ({ ok: true, data: { scope } }) });
    assert.equal(result.error.code, 'INVALID_JSON');
    assert.equal(projectedBeforeDispatch, false);
    assert.deepEqual(diagnostics[0].visibility, { kind: 'actor-private', actorId: 'mara' });
});

test('an iteration adapter without a trusted exact child scope has hidden response visibility', async () => {
    const diagnostics = [];
    const result = await runWorkflowForHost(helperGraph(), { ...ports, target: { ...address, nodeId: 'each', portId: 'out' }, onDiagnostic: event => diagnostics.push(event), iterateHelper: async (_invocation, local) => { const response = await local.request({ messages: [{ role: 'user', content: 'Private implementation prompt.' }], maxTokens: 20 }); return response.ok ? { ok: true, artifact: { kind: 'data', value: {} } } : response; }, request: async () => ({ ok: true, data: { text: '{}', finish: 'stop' } }) }, { authorizeModelInputs: () => ({ ok: true }) });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.actualCalls, 1);
    assert.deepEqual(diagnostics[0].visibility, { kind: 'hidden' });
});

test('hidden, invalid and conflicting source marks cannot be declassified by successful authorization', async () => {
    for (const mark of [{ kind: 'hidden' }, { kind: 'actor-private', actorId: 'laya' }, { kind: 'unknown' }]) {
        const authored = graph(), diagnostics = [];
        authored.nodes.context = node('context', 'scene-context');
        authored.wires.context = wire('context', 'context', 'out', 'model', 'context');
        const result = await runWorkflowForHost(authored, { ...ports, onDiagnostic: event => diagnostics.push(event), snapshot: () => ({ kind: 'context', messages: [{ id: 'm', role: 'user', text: 'Private source.' }], visibility: mark }), request: async () => ({ ok: true, data: { text: 'FAILED private JSON', finish: 'stop' } }) }, { authorizeModelInputs: () => ({ ok: true, data: { scope: { actorId: 'mara' } } }) });
        assert.equal(result.error.code, 'INVALID_JSON');
        assert.deepEqual(diagnostics[0].visibility, { kind: 'hidden' });
    }
});

test('implicit introspection state has hidden visibility when its actor is unavailable to runtime', async () => {
    const diagnostics = [];
    const authored = { id: address.workflowId, schema: 3, runtime: 2, mode: 'native-unified', nodes: { source: node('source', 'scene-context'), model: node('model', 'reflect') }, wires: { context: wire('context', 'source', 'out', 'model', 'context') } };
    const result = await runWorkflowForHost(authored, { ...ports, onDiagnostic: event => diagnostics.push(event), snapshot: () => ({ kind: 'context', messages: [{ id: 'm', role: 'user', text: 'Public source.' }] }), request: async () => ({ ok: true, data: { text: 'Private implicit state reflection.', finish: 'stop' } }) }, { authorizeModelInputs: () => ({ ok: true }), executeIntrospection: async (_node, _inputs, local) => { await local.request({ messages: [{ role: 'user', content: 'Private state supplied by host.' }], maxTokens: 20 }); return { ok: false, error: { code: 'INVALID_OUTPUT', message: 'Invalid reflection.' } }; } });
    assert.equal(result.error.code, 'INVALID_OUTPUT');
    assert.deepEqual(diagnostics[0].visibility, { kind: 'hidden' });
    assert.equal(diagnostics[1].error.code, 'INVALID_OUTPUT');
});

test('real helper retries retain private child response and validation under parent physical attempts', async () => {
    const diagnostics = [], scopes = [];
    let calls = 0;
    const result = await runWorkflowForHost(helperGraph(), { ...ports, target: { ...address, nodeId: 'each', portId: 'out' }, onDiagnostic: event => diagnostics.push(event), request: async () => ({ ok: true, data: { text: ++calls === 1 ? 'FAILED helper JSON' : '{}', finish: 'stop' } }) }, { authorizeModelInputs: ({ address }) => { scopes.push(address); return { ok: true, data: { scope: { actorId: 'mara' } } }; } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.actualCalls, 2);
    assert.deepEqual(diagnostics.map(event => [event.type, event.attempt, event.address.nodeId]), [['response', 1, 'each'], ['validation', 1, 'each'], ['response', 2, 'each']]);
    assert.deepEqual(diagnostics[0].visibility, { kind: 'actor-private', actorId: 'mara' });
    assert.equal(scopes.length, 6);
    assert.equal(scopes.every(scope => scope.nodeId === 'model' && scope.instancePath.join('/') === 'each/iteration-0'), true);
});

test('truncated completion text survives only in diagnostics without consuming another retry', async () => {
    const diagnostics = [], events = [];
    const text = '{"TRUNCATED_RAW_COMPLETION":';
    const result = await runWorkflow(graph({ maxRetries: 2 }), { ...ports, onDiagnostic: event => diagnostics.push(event), onEvent: event => events.push(event), request: async () => ({ ok: true, data: { text, finish: 'length', usage: { completion_tokens: 24 } } }) });
    assert.equal(result.error.code, 'TRUNCATED_OUTPUT');
    assert.equal(result.actualCalls, 1);
    assert.equal(result.callBound, 3);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].text, text);
    assert.equal(diagnostics[0].error.code, 'TRUNCATED_OUTPUT');
    assert.equal(diagnostics[0].finish, 'length');
    assert.deepEqual(diagnostics[0].usage, { completion_tokens: 24 });
    assert.equal(events.some(event => event.type === 'node-retry'), false);
    assert.equal(JSON.stringify({ result, events }).includes(text), false);
});

test('missing and failing sinks leave request and retry behavior unchanged', async () => {
    for (const onDiagnostic of [undefined, () => { throw new Error('Diagnostic failure.'); }, async () => { throw new Error('Async diagnostic failure.'); }]) {
        let calls = 0;
        const result = await runWorkflow(graph({ maxRetries: 1 }), { ...ports, ...(onDiagnostic ? { onDiagnostic } : {}), request: async () => ({ ok: true, data: { text: ++calls === 1 ? 'FAILED private completion' : '{}', finish: 'stop' } }) });
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(result.actualCalls, 2);
        assert.equal(result.callBound, 2);
        assert.equal(Object.hasOwn(result, 'diagnostics'), false);
        assert.equal(JSON.stringify(result).includes('FAILED private completion'), false);
    }
});

test('scope refusal before physical dispatch produces no diagnostic completion or validation payload', async () => {
    const diagnostics = [];
    let requests = 0;
    const result = await runWorkflowForHost(graph(), { ...ports, onDiagnostic: event => diagnostics.push(event), request: () => { requests++; } }, { authorizeModelInputs: () => ({ ok: false, error: { code: 'ACTOR_SCOPE_FAILED', message: 'Denied.' } }) });
    assert.equal(result.error.code, 'ACTOR_SCOPE_FAILED');
    assert.equal(requests, 0);
    assert.deepEqual(diagnostics, []);
});

test('real connection cutoff retains opted-in text privately without forwarding its callback to native transport', async () => {
    const diagnostics = [], sent = [], text = '{"REAL_TRUNCATED_COMPLETION":';
    const { context, bound } = connectionFixture(async (...args) => { sent.push(args); return { choices: [{ message: { content: text }, finish_reason: 'length' }], usage: { completion_tokens: 20 }, reasoning: 'SECRET reasoning' }; });
    let connectionResult;
    const result = await runWorkflow(graph({ maxRetries: 2 }), { ...ports, onDiagnostic: event => diagnostics.push(event), resolveBinding: () => bound, request: async options => connectionResult = await requestModel(options, context) });
    assert.equal(result.error.code, 'TRUNCATED_OUTPUT');
    assert.equal(result.actualCalls, 1);
    assert.equal(diagnostics[0].text, text);
    assert.equal(JSON.stringify(connectionResult).includes(text), false);
    assert.equal(JSON.stringify(diagnostics).includes('SECRET'), false);
    assert.equal(Object.hasOwn(sent[0][3], 'onDiagnosticResponse'), false);
    assert.equal(Object.hasOwn(sent[0][4], 'onDiagnosticResponse'), false);
});

test('metadata response opt-out prevents failed-text extraction in the real connection', async () => {
    const diagnostics = [];
    let extractions = 0;
    const { context, bound } = connectionFixture(async () => ({choices:[{message:{content:'PRIVATE_CUTOFF'},finish_reason:'length'}]}));
    context.extractMessageFromData = () => {extractions++; return 'PRIVATE_CUTOFF';};
    const result = await runWorkflow(graph(), {...ports,diagnosticResponseText:false,onDiagnostic:event=>diagnostics.push(event),resolveBinding:()=>bound,request:options=>requestModel(options,context)});
    assert.equal(result.error.code,'TRUNCATED_OUTPUT');
    assert.equal(extractions,0);
    assert.deepEqual(diagnostics,[]);
});

test('connection failed-text extraction is absent by default and callback failures remain passive', async () => {
    let extractions = 0;
    const { context, bound } = connectionFixture(async () => ({ choices: [{ message: { content: 'FAILED cutoff text' }, finish_reason: 'length' }] }));
    context.extractMessageFromData = () => { extractions++; return 'FAILED cutoff text'; };
    const request = { binding: bound.data, messages: [{ role: 'user', content: 'Synthetic prompt.' }], maxTokens: 20 };
    assert.equal((await requestModel(request, context)).error.code, 'TRUNCATED_OUTPUT');
    assert.equal(extractions, 0);
    for (const onDiagnosticResponse of [() => { throw Error('Sink failed.'); }, async () => { throw Error('Async sink failed.'); }]) {
        const result = await requestModel({ ...request, onDiagnosticResponse }, context);
        assert.equal(result.error.code, 'TRUNCATED_OUTPUT');
        assert.equal(JSON.stringify(result).includes('FAILED cutoff text'), false);
    }
    assert.equal(extractions, 2);
});

test('connection failed-text capability fails closed for accessors, invalid values and throwing callbacks', async () => {
    let extractions = 0, getters = 0, captured = 0;
    const { context, bound } = connectionFixture(async () => ({choices:[{message:{content:'PRIVATE_CUTOFF'},finish_reason:'length'}]}));
    context.extractMessageFromData = () => {extractions++;return 'PRIVATE_CUTOFF';};
    const request = {binding:bound.data,messages:[{role:'user',content:'Synthetic prompt.'}],maxTokens:20,onDiagnosticResponse:()=>captured++};
    const accessor = {...request};
    Object.defineProperty(accessor,'isDiagnosticResponseCurrent',{get(){getters++;return ()=>true;},enumerable:true});
    for (const input of [accessor,...[false,'true',()=>false,()=>{throw Error('Revoked.');}].map(isDiagnosticResponseCurrent=>({...request,isDiagnosticResponseCurrent}))]) {
        const result = await requestModel(input,context);
        assert.equal(result.error.code,'TRUNCATED_OUTPUT');
    }
    assert.equal(getters,0);
    assert.equal(extractions,0);
    assert.equal(captured,0);
});

test('connection diagnostic callback never runs for refused, stopped or undispatched requests', async () => {
    let calls = 0, captured = 0;
    const controller = new AbortController();
    const { context, bound } = connectionFixture(async () => { calls++; controller.abort(); return { choices: [{ message: { content: 'LATE cutoff text' }, finish_reason: 'length' }] }; });
    const request = { binding: bound.data, messages: [{ role: 'user', content: 'Synthetic prompt.' }], maxTokens: 20, onDiagnosticResponse: () => captured++ };
    assert.equal((await requestModel(request, context, { beforeSend: () => ({ ok: false, error: { code: 'ACTOR_SCOPE_FAILED', message: 'Denied.' } }) })).error.code, 'ACTOR_SCOPE_FAILED');
    assert.equal(calls, 0);
    assert.equal((await requestModel({ ...request, signal: controller.signal }, context)).error.code, 'ABORTED');
    assert.equal(calls, 1);
    assert.equal((await requestModel({ ...request, signal: controller.signal }, context)).error.code, 'ABORTED');
    assert.equal(captured, 0);
});

test('runtime closes its failed-text callback at settlement and omits stopped late output', async () => {
    for (const cancelled of [false, true]) {
        const diagnostics = [], controller = new AbortController();
        let callback, dispatch;
        const dispatched = new Promise(resolve => dispatch = resolve);
        let settle;
        const pending = runWorkflow(graph(), { ...ports, signal: controller.signal, onDiagnostic: event => diagnostics.push(event), request: options => { callback = options.onDiagnosticResponse; dispatch(); return new Promise(resolve => settle = resolve); } });
        await dispatched;
        if (cancelled) controller.abort();
        callback({ text: 'FAILED authorized completion' });
        settle({ ok: false, error: { code: 'TRUNCATED_OUTPUT', message: 'Cut off.', finish: 'length' } });
        const result = await pending;
        assert.equal(result.error.code, cancelled ? 'ABORTED' : 'TRUNCATED_OUTPUT');
        assert.equal(diagnostics.length, cancelled ? 0 : 1);
        callback({ text: 'LATE unauthorized completion' });
        assert.equal(JSON.stringify(diagnostics).includes('LATE'), false);
        if (!cancelled) assert.equal(diagnostics[0].text, 'FAILED authorized completion');
    }
});
