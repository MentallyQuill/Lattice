import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRunState, reduceRunState } from '../src/workflow/run-state.js';

const address = { workflowId: 'retries', instancePath: [], nodeId: 'model' };
const event = (seq, type, fields = {}) => ({ runId: 'retry-run', seq, type, at: seq, elapsedMs: seq, ...fields });
function executing() {
    const plan = { workflowId: 'retries', phase: 'pre', mode: 'target', target: { ...address, portId: 'out' }, units: [{ address, operation: 'model-call', included: true, dependencies: [], requestBound: 3, inputPorts: ['prompt'], outputPorts: ['out'] }], hierarchy: [], terminals: [], callBound: 3 };
    let state = reduceRunState(createRunState('retry-run'), event(1, 'plan', { plan }));
    return reduceRunState(state, event(2, 'node-phase', { address, phase: 'executing' }));
}

test('settled physical requests can enter retrying without reserving another attempt', () => {
    let state = reduceRunState(executing(), event(3, 'request-start', { address, attempt: 1, maxTokens: 20 }));
    state = reduceRunState(state, event(4, 'request-settled', { address, attempt: 1, status: 'failed', durationMs: 1 }));
    state = reduceRunState(state, event(5, 'node-retry', { address, reasonCode: 'REQUEST_FAILED', delayMs: 500, nextAttempt: 2, maxAttempts: 3 }));
    assert.equal(state.nodes[0].subphase, 'retrying');
    assert.equal(state.nodes[0].attempts, 1);
    assert.equal(state.nodes[0].request.status, 'failed');
    state = reduceRunState(state, event(6, 'request-start', { address, attempt: 2, maxTokens: 20 }));
    assert.equal(state.nodes[0].subphase, 'request');
    assert.equal(state.nodes[0].attempts, 2);
});

test('a cancelled final dispatch guard removes its reserved attempt through the cancellation barrier', () => {
    let state = reduceRunState(executing(), event(3, 'request-start', { address, attempt: 1, maxTokens: 20 }));
    state = reduceRunState(state, event(4, 'run-cancelling'));
    state = reduceRunState(state, event(5, 'request-settled', { address, attempt: 1, status: 'cancelled', durationMs: 0, dispatched: false }));
    assert.equal(state.nodes[0].attempts, 0);
    assert.equal(state.nodes[0].request.dispatched, false);
    assert.equal(state.nodes[0].request.status, 'cancelled');
    assert.equal(state.nodes[0].status, 'cancelling');
    assert.equal(state.nodes[0].subphase, 'cancelling');
    state = reduceRunState(state, event(6, 'run-settled', { status: 'cancelled' }));
    assert.equal(state.nodes[0].attempts, 0);
    assert.equal(state.nodes[0].status, 'cancelled');
});

test('cancelled requests cannot advertise another retry', () => {
    let state = reduceRunState(executing(), event(3, 'request-start', { address, attempt: 1, maxTokens: 20 }));
    state = reduceRunState(state, event(4, 'request-settled', { address, attempt: 1, status: 'cancelled', durationMs: 1 }));
    assert.equal(reduceRunState(state, event(5, 'node-retry', { address, reasonCode: 'REQUEST_FAILED', delayMs: 500, nextAttempt: 2, maxAttempts: 3 })), state);
});

test('malformed retry markers preserve identity and cannot spend request capacity', () => {
    const running = reduceRunState(executing(), event(3, 'request-start', { address, attempt: 1, maxTokens: 20 }));
    const retry = { address, reasonCode: 'INVALID_JSON', delayMs: 0, nextAttempt: 2, maxAttempts: 3 };
    assert.equal(reduceRunState(executing(), event(5, 'node-retry', retry)).nodes[0].attempts, 0);
    assert.equal(reduceRunState(running, event(5, 'node-retry', retry)), running);
    const settled = reduceRunState(running, event(4, 'request-settled', { address, attempt: 1, status: 'completed', durationMs: 1 }));
    for (const fields of [{ reasonCode: 'PRIVATE_PROVIDER_ERROR' }, { delayMs: -1 }, { delayMs: 30001 }, { delayMs: NaN }, { delayMs: '500' }, { nextAttempt: 1 }, { nextAttempt: 3 }, { nextAttempt: 4 }, { maxAttempts: 4 }]) {
        assert.equal(reduceRunState(settled, event(5, 'node-retry', { ...retry, ...fields })), settled);
    }
    let reads = 0;
    const accessor = Object.defineProperty(event(5, 'node-retry', retry), 'reasonCode', { get() { reads++; return 'INVALID_JSON'; } });
    assert.equal(reduceRunState(settled, accessor), settled);
    assert.equal(reads, 0);
    assert.equal(settled.nodes[0].attempts, 1);
    const retrying = reduceRunState(settled, event(5, 'node-retry', retry));
    assert.equal(reduceRunState(retrying, event(6, 'node-settled', { address, status: 'failed' })).nodes[0].subphase, null);
    assert.equal(reduceRunState(retrying, event(6, 'run-cancelling')).nodes[0].subphase, 'cancelling');
});

test('undispatched failures remove only the current reservation and reject inconsistent evidence', () => {
    const running = reduceRunState(executing(), event(3, 'request-start', { address, attempt: 1, maxTokens: 20 }));
    const settlement = { address, attempt: 1, status: 'failed', durationMs: 0, dispatched: false };
    for (const fields of [{ attempt: 2 }, { status: 'completed' }, { durationMs: 1 }, { dispatched: 'false' }, { usage: { totalTokens: 5 } }, { finish: 'stop' }]) {
        assert.equal(reduceRunState(running, event(4, 'request-settled', { ...settlement, ...fields })), running);
    }
    const held = reduceRunState(running, event(4, 'request-settled', settlement));
    assert.equal(held.nodes[0].attempts, 0);
    assert.equal(held.nodes[0].request.dispatched, false);
    assert.equal(reduceRunState(held, event(5, 'node-retry', { address, reasonCode: 'REQUEST_FAILED', delayMs: 500, nextAttempt: 1, maxAttempts: 3 })), held);
    const dispatched = reduceRunState(running, event(4, 'request-settled', { address, attempt: 1, status: 'failed', durationMs: 1 }));
    assert.equal(dispatched.nodes[0].attempts, 1);
    assert.equal(dispatched.nodes[0].request.dispatched, true);
});
