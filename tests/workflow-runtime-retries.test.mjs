import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runWorkflow, runWorkflowForHost } from '../src/workflow/runtime.js';
import { createRunState, reduceRunState } from '../src/workflow/run-state.js';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definition-data.js';

const node = (id, operation, controls = {}) => ({ id, type: 'workflow', operation, ...controls });
const wire = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
const graph = (controls = {}) => ({ id: 'runtime-retries', schema: 3, runtime: 2, mode: 'native-unified', nodes: { source: node('source', 'text', { text: 'Describe a calm room.' }), model: node('model', 'model-call', controls) }, wires: { input: wire('input', 'source', 'out', 'model', 'prompt') } });
const target = { workflowId: 'runtime-retries', instancePath: [], nodeId: 'model', portId: 'out' };
const binding = { profileId: 'fixed', model: 'fixed-model' };
const ports = { target, resolveBinding: () => ({ ok: true, data: binding }), countTokens: async () => ({ tokens: 4 }) };
const modelUnit = result => result.recording.units.find(unit => unit.operation === 'model-call');

test('Stop inside request progress keeps physical and projected attempts at zero', async () => {
    const controller = new AbortController(), events = [];
    let physical = 0;
    const result = await runWorkflow(graph(), { ...ports, signal: controller.signal, onEvent: event => { events.push(event); if (event.type === 'request-start') controller.abort(); }, request: async () => { physical++; return { ok: true, data: { text: 'A calm room.', finish: 'stop' } }; } });
    assert.equal(result.error.code, 'ABORTED');
    assert.equal(physical, 0);
    assert.equal(result.actualCalls, 0);
    assert.equal(modelUnit(result).attempts, 0);
    assert.equal(modelUnit(result).request.dispatched, false);
    assert.equal(modelUnit(result).request.status, 'cancelled');
    assert.equal(events.find(event => event.type === 'request-settled')?.dispatched, false);
});

test('retry progress uses tracked attempts and fixed authorization on every physical dispatch', async () => {
    const events = [], delays = [], bindings = [];
    let physical = 0, authorized = 0, selected = 0;
    const result = await runWorkflowForHost(graph({ maxRetries: 2 }), { ...ports, resolveBinding: () => { selected++; return { ok: true, data: binding }; }, onEvent: event => events.push(event), retryDelay: async delay => { delays.push(delay); return true; }, request: async options => { bindings.push(options.binding); physical++; return physical === 1 ? { ok: false, error: { code: 'REQUEST_FAILED', message: 'Temporary request failure.', retryable: true, status: 503 } } : { ok: true, data: { text: 'A calm room.', finish: 'stop' } }; } }, { authorizeModelInputs: () => { authorized++; return { ok: true }; } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(physical, 2);
    assert.equal(result.actualCalls, 2);
    assert.equal(result.callBound, 3);
    assert.equal(modelUnit(result).attempts, 2);
    assert.equal(selected, 1);
    assert.equal(authorized, 6);
    assert.deepEqual(bindings, [binding, binding]);
    assert.deepEqual(delays, [500]);
    const retry = events.filter(event => event.type === 'node-retry');
    assert.equal(retry.length, 1);
    assert.deepEqual({ reasonCode: retry[0].reasonCode, delayMs: retry[0].delayMs, nextAttempt: retry[0].nextAttempt, maxAttempts: retry[0].maxAttempts }, { reasonCode: 'REQUEST_FAILED', delayMs: 500, nextAttempt: 2, maxAttempts: 3 });
    assert.deepEqual(events.filter(event => event.type === 'request-start').map(event => event.attempt), [1, 2]);
});

test('thrown transient request failures retain only safe retry metadata', async () => {
    const events = [];
    let physical = 0;
    const result = await runWorkflow(graph({ maxRetries: 1 }), { ...ports, onEvent: event => events.push(event), retryDelay: async () => true, request: async () => { if (++physical === 1) throw Object.assign(new Error('PRIVATE provider request and response body'), { status: 503 }); return { ok: true, data: { text: 'A calm room.', finish: 'stop' } }; } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.actualCalls, 2);
    assert.equal(modelUnit(result).attempts, 2);
    assert.equal(events.filter(event => event.type === 'node-retry').length, 1);
    assert.equal(JSON.stringify({ result, events }).includes('PRIVATE'), false);
});

test('Stop during retry progress clears retrying and preserves the dispatched attempt only', async () => {
    const controller = new AbortController();
    let state, sawRetrying = false, physical = 0;
    const result = await runWorkflow(graph({ maxRetries: 2 }), { ...ports, signal: controller.signal, onEvent: event => { state ??= createRunState(event.runId); state = reduceRunState(state, event); if (event.type === 'node-retry') { sawRetrying = state.nodes.find(unit => unit.operation === 'model-call').subphase === 'retrying'; controller.abort(); } }, retryDelay: async () => true, request: async () => { physical++; return { ok: false, error: { code: 'REQUEST_FAILED', message: 'Temporary request failure.', retryable: true, status: 503 } }; } });
    assert.equal(sawRetrying, true);
    assert.equal(physical, 1);
    assert.equal(result.actualCalls, 1);
    assert.equal(modelUnit(result).attempts, 1);
    assert.equal(modelUnit(result).status, 'cancelled');
    assert.equal(modelUnit(result).subphase, null);
});

test('scope refusal at retry dispatch rolls back only the undispatched second attempt', async () => {
    let physical = 0, revoked = false;
    const result = await runWorkflowForHost(graph({ maxRetries: 2 }), { ...ports, onEvent: event => { if (event.type === 'request-start' && event.attempt === 2) revoked = true; }, retryDelay: async () => true, request: async () => { physical++; return { ok: false, error: { code: 'REQUEST_FAILED', message: 'Temporary request failure.', retryable: true, status: 503 } }; } }, { authorizeModelInputs: () => revoked ? { ok: false, error: { code: 'STALE_ACTOR_SCOPE', message: 'The selected scope changed.' } } : { ok: true } });
    assert.equal(result.error.code, 'STALE_ACTOR_SCOPE');
    assert.equal(physical, 1);
    assert.equal(result.actualCalls, 1);
    assert.equal(modelUnit(result).attempts, 1);
    assert.equal(modelUnit(result).request.attempt, 2);
    assert.equal(modelUnit(result).request.dispatched, false);
});

test('real helper retry progress annotates the bounded parent without losing child scope', async () => {
    const raw = { id: 'retry-helper', version: 1, name: 'Retry helper', interface: [{ id: 'item', label: 'Item', direction: 'input', kind: 'data', required: true, cardinality: 'one', boundaryNodeId: 'entry' }, { id: 'result', label: 'Result', direction: 'output', kind: 'data', required: false, cardinality: 'one', boundaryNodeId: 'exit' }], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-unified', nodes: { entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'item' }, prompt: node('prompt', 'text', { text: 'Return a proposed room.' }), model: node('model', 'model-call', { outputKind: 'data', maxRetries: 2 }), exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'result' } }, wires: { prompt: wire('prompt', 'prompt', 'out', 'model', 'prompt'), evidence: wire('evidence', 'entry', 'out', 'model', 'data'), result: wire('result', 'model', 'out', 'exit', 'in') } } };
    const checked = computeDefinitionIdentity(raw);
    assert.equal(checked.ok, true, JSON.stringify(checked.error));
    const definition = { ...checked.data.materializedDefinition, semanticHash: checked.data.semanticHash }, ref = { id: definition.id, version: 1, semanticHash: definition.semanticHash };
    const helperGraph = { id: 'runtime-retries', schema: 3, runtime: 2, mode: 'native-unified', definitions: { [definitionRefKey(ref)]: definition }, nodes: { source: node('source', 'text', { text: '[{"item":1}]' }), decode: node('decode', 'json-decode'), each: node('each', 'for-each', { helper: ref, limit: 1, requestBoundPerIteration: 3 }) }, wires: { source: wire('source', 'source', 'out', 'decode', 'in'), items: wire('items', 'decode', 'out', 'each', 'in') } };
    let physical = 0;
    const events = [], scopes = [];
    const result = await runWorkflowForHost(helperGraph, { ...ports, target: { ...target, nodeId: 'each' }, onEvent: event => events.push(event), retryDelay: async () => true, request: async options => { assert.equal(options.binding, binding); return ++physical === 1 ? { ok: false, error: { code: 'REQUEST_FAILED', message: 'Temporary request failure.', retryable: true, status: 503 } } : { ok: true, data: { text: '{"room":"calm"}', finish: 'stop' } }; } }, { authorizeModelInputs: ({ address }) => { scopes.push(address); return { ok: true }; } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.actualCalls, 2);
    assert.equal(physical, 2);
    assert.equal(result.recording.units.find(unit => unit.operation === 'for-each').attempts, 2);
    assert.equal(scopes.length, 6);
    assert.equal(scopes.every(address => address.nodeId === 'model' && address.instancePath.join('/') === 'each/iteration-0'), true);
    const retry = events.find(event => event.type === 'node-retry');
    assert.deepEqual(retry.address, { workflowId: 'runtime-retries', instancePath: [], nodeId: 'each' });
    assert.equal(retry.nextAttempt, 2);
    assert.equal(retry.maxAttempts, 3);
});
