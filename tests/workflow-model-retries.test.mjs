import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeModelNode, describeModelNode } from '../src/workflow/operations/model-nodes.js?v=0.28.1';

const node = (operation = 'model-call', settings = {}) => ({ id: 'retry-node', operation, maxRetries: 2, ...settings });
const prompt = { prompt: { kind: 'text', text: 'Write a brief observation.' } };
const complete = text => ({ ok: true, data: { text, finish: 'stop' } });
const transient = (extra = {}) => ({ ok: false, error: { code: 'REQUEST_FAILED', message: 'Temporary request failure.', retryable: true, status: 503, ...extra } });

test('a transient model request recovers on its next tracked attempt', async () => {
    let calls = 0;
    const waits = [], retries = [];
    const result = await executeModelNode(node(), prompt, {
        request: async () => ++calls === 1 ? transient() : complete('Recovered observation.'),
        retryDelay: async delay => { waits.push(delay); },
        onRetry: event => retries.push(event),
    });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.artifact.text, 'Recovered observation.');
    assert.equal(calls, 2);
    assert.deepEqual(waits, [500]);
    assert.deepEqual(retries, [{ reasonCode: 'REQUEST_FAILED', delayMs: 500, nextAttempt: 2, maxAttempts: 3 }]);
    assert.equal(result.reports.reduce((sum, report) => sum + (report.actualCalls ?? 0), 0), 2);
});

test('one JSON correction resends the original task with only a trusted fixed instruction', async () => {
    const requests = [], waits = [];
    const inputs = { ...prompt, data: { kind: 'data', value: { evidence: 'An intact compass.' } } };
    const original = structuredClone(inputs);
    const operation = node('model-call', { outputKind: 'data', instructions: 'I'.repeat(10000) });
    const result = await executeModelNode(operation, inputs, {
        binding: { id: 'fixed-connection' },
        request: async request => { requests.push(request); return complete(requests.length === 1 ? 'BROKEN SECRET RESPONSE' : '{"observation":"intact"}'); },
        retryDelay: async delay => { waits.push(delay); },
    });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value, { observation: 'intact' });
    assert.equal(requests.length, 2);
    assert.deepEqual(waits, [0]);
    assert.deepEqual(requests[1].messages.slice(0, 2), requests[0].messages);
    assert.equal(requests[1].messages.length, 3);
    assert.equal(requests[1].messages[2].role, 'system');
    assert.equal(JSON.stringify(requests[1]).includes('BROKEN SECRET RESPONSE'), false);
    assert.deepEqual(requests[1].binding, { id: 'fixed-connection' });
    assert.deepEqual(inputs, original);
    assert.equal(operation.instructions.length, 10000);
    assert.equal(result.reports.find(report => report.code === 'MODEL_CALL').actualCalls, 2);
});

test('model reports use an authoritative physical request delta when provided', async () => {
    let physical = 4;
    const result = await executeModelNode(node(), prompt, {
        getRequestCount: () => physical,
        request: async () => ({ ok: false, error: { code: 'CALL_LIMIT', message: 'Dispatch stopped before calling the provider.' } }),
    });
    assert.equal(result.error.code, 'CALL_LIMIT');
    assert.equal(result.reports?.reduce((sum, report) => sum + (report.actualCalls ?? 0), 0) ?? 0, 0);
    const successful = await executeModelNode(node(), prompt, {
        getRequestCount: () => physical,
        request: async () => { physical++; return complete('Observed.'); },
    });
    assert.equal(successful.reports.find(report => report.code === 'MODEL_CALL').actualCalls, 1);
});

test('retry controls bound the resolved model budget and retain zero-call literal extraction', async () => {
    for (const operation of ['model-call', 'enrich', 'extract', 'revise-draft']) {
        const defaults = describeModelNode({ id: 'defaults', operation });
        assert.equal(defaults.ok, true);
        assert.equal(defaults.data.descriptor.requestBound, 1);
        assert.deepEqual(defaults.data.descriptor.controlDescriptors.maxRetries, { type: 'integer', min: 0, max: 2, default: 0, label: 'Maximum retries' });
        for (const maxRetries of [0, 1, 2]) assert.equal(describeModelNode(node(operation, { maxRetries })).data.descriptor.requestBound, maxRetries + 1);
    }
    const literal = describeModelNode(node('extract', { mode: 'literal' })).data.descriptor;
    assert.equal(literal.requestBound, 0);
    assert.equal(literal.modelRole, null);
    for (const maxRetries of [-1, 3, 0.5, '2', null]) {
        let calls = 0;
        const result = await executeModelNode(node('model-call', { maxRetries }), prompt, { request: async () => { calls++; return complete('Unused'); } });
        assert.equal(result.error.code, 'INVALID_SETTINGS');
        assert.equal(calls, 0);
    }
});

test('default zero and explicit retry limits cap transient physical requests', async () => {
    for (const [settings, expectedCalls, expectedWaits] of [[{}, 1, []], [{ maxRetries: 0 }, 1, []], [{ maxRetries: 1 }, 2, [500]], [{ maxRetries: 2 }, 3, [500, 1000]]]) {
        let calls = 0;
        const waits = [];
        const result = await executeModelNode({ id: 'limited', operation: 'model-call', ...settings }, prompt, {
            request: async () => { calls++; return transient(); }, retryDelay: async delay => { waits.push(delay); },
        });
        assert.equal(result.error.code, 'REQUEST_FAILED');
        assert.equal(result.artifact, undefined);
        assert.equal(calls, expectedCalls);
        assert.deepEqual(waits, expectedWaits);
        assert.equal(result.reports.reduce((sum, report) => sum + (report.actualCalls ?? 0), 0), expectedCalls);
    }
});

test('transient and JSON recovery share three attempts in either order', async () => {
    for (const [responses, expectedWaits] of [
        [[transient(), complete('invalid'), complete('```json\n{"ok":true}\n```')], [500, 0]],
        [[complete('invalid'), transient(), complete('{"ok":true}')], [0, 500]],
    ]) {
        const requests = [], waits = [];
        const result = await executeModelNode(node('model-call', { outputKind: 'data' }), prompt, {
            request: async request => { requests.push(request); return responses[requests.length - 1]; }, retryDelay: async delay => { waits.push(delay); },
        });
        assert.equal(result.ok, true);
        assert.deepEqual(result.artifact.value, { ok: true });
        assert.equal(requests.length, 3);
        assert.deepEqual(waits, expectedWaits);
        assert.deepEqual(requests.map(request => request.messages.slice(0, 2)), [requests[0].messages.slice(0, 2), requests[0].messages.slice(0, 2), requests[0].messages.slice(0, 2)]);
        assert.equal(result.reports.find(report => report.code === 'MODEL_CALL').actualCalls, 3);
        assert.equal(result.reports.reduce((sum, report) => sum + (report.actualCalls ?? 0), 0), 3);
    }
    let calls = 0;
    const exhausted = await executeModelNode(node('model-call', { outputKind: 'data' }), prompt, {
        request: async () => { calls++; return calls < 3 ? transient() : complete('invalid'); }, retryDelay: async () => true,
    });
    assert.equal(exhausted.error.code, 'INVALID_JSON');
    assert.equal(calls, 3);
});

test('JSON syntax and schema failures receive at most one correction', async () => {
    for (const [settings, text, code] of [
        [{}, 'invalid', 'INVALID_JSON'],
        [{ schema: '{"type":"object","required":["count"],"properties":{"count":{"type":"integer"}}}' }, '{"count":"wrong"}', 'SCHEMA_MISMATCH'],
    ]) {
        let calls = 0;
        const retries = [];
        const result = await executeModelNode(node('model-call', { outputKind: 'data', ...settings }), prompt, {
            request: async () => { calls++; return complete(text); }, retryDelay: async () => true, onRetry: event => retries.push(event),
        });
        assert.equal(result.error.code, code);
        assert.equal(calls, 2);
        assert.deepEqual(retries, [{ reasonCode: code, delayMs: 0, nextAttempt: 2, maxAttempts: 3 }]);
    }
});

test('only positively transient request failures retry and retain bounded public metadata', async () => {
    const responses = [
        transient({ retryable: false }), transient({ status: 401 }), transient({ status: 403 }), transient({ retryAfterMs: 30001 }),
        { ok: false, error: { code: 'REQUEST_FAILED', message: '503 Failed to fetch SECRET' } },
        ...['ABORTED', 'AUTH_FAILED', 'INVALID_CONFIG', 'BINDING_CHANGED', 'PRIVATE_MATERIAL', 'CALL_LIMIT', 'INVALID_JSON', 'SCHEMA_MISMATCH'].map(code => ({ ok: false, error: { code, message: 'SECRET', retryable: true, status: 503 } })),
        complete('   '), { ok: true, data: { text: 'Partial', finish: 'length' } }, { ok: true, data: { text: 'Unverified', finish: 'unknown' } },
    ];
    for (const response of responses) {
        let calls = 0;
        const result = await executeModelNode(node('model-call', { outputKind: 'data' }), prompt, {
            request: async () => { calls++; return response; }, retryDelay: async () => { assert.fail('Terminal responses cannot schedule a retry'); },
        });
        assert.equal(result.ok, false);
        assert.equal(result.artifact, undefined);
        assert.equal(calls, 1);
        assert.equal(JSON.stringify(result).includes('SECRET'), false);
    }
    const result = await executeModelNode(node('model-call', { maxRetries: 0 }), prompt, {
        request: async () => transient({ retryAfterMs: 700, details: 'SECRET', body: 'SECRET' }),
    });
    assert.deepEqual(result.error, { code: 'REQUEST_FAILED', message: 'The model request failed.', retryable: true, status: 503, retryAfterMs: 700 });
});

test('known thrown network failures are normalized and unknown thrown diagnostics stay terminal', async () => {
    let calls = 0;
    const result = await executeModelNode(node(), prompt, {
        request: async () => { if (++calls === 1) throw new TypeError('Failed to fetch'); return complete('Recovered.'); }, retryDelay: async () => true,
    });
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    calls = 0;
    const unknown = await executeModelNode(node(), prompt, {
        request: async () => { calls++; throw new Error('SECRET maybe timeout 503'); }, retryDelay: async () => assert.fail('Unknown thrown errors cannot retry'),
    });
    assert.equal(unknown.error.code, 'REQUEST_FAILED');
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(unknown).includes('SECRET'), false);
});

test('safe retry hints can increase bounded transient backoff', async () => {
    let calls = 0;
    const waits = [];
    const result = await executeModelNode(node(), prompt, {
        request: async () => ++calls < 3 ? transient({ retryAfterMs: calls === 1 ? 700 : 30000 }) : complete('Done.'),
        retryDelay: async delay => { waits.push(delay); },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(waits, [700, 30000]);
});

test('cancellation during native backoff prevents the next model attempt', async () => {
    const controller = new AbortController();
    let calls = 0;
    const result = await executeModelNode(node(), prompt, {
        signal: controller.signal,
        request: async () => { calls++; return transient(); },
        onRetry: () => queueMicrotask(() => controller.abort()),
    });
    assert.equal(result.error.code, 'ABORTED');
    assert.equal(calls, 1);
    assert.equal(result.reports[0].actualCalls, 1);
});

test('test delay cancellation and an aborted late response both stop retries', async () => {
    const controller = new AbortController();
    let calls = 0;
    const result = await executeModelNode(node(), prompt, {
        signal: controller.signal, request: async () => { calls++; return transient(); },
        retryDelay: async (delay, signal) => { assert.equal(delay, 500); assert.equal(signal, controller.signal); return false; },
    });
    assert.equal(result.error.code, 'ABORTED');
    assert.equal(calls, 1);
    const late = await executeModelNode(node(), prompt, {
        signal: controller.signal, request: async () => { calls++; controller.abort(); return transient(); },
        retryDelay: async () => assert.fail('Cancelled completions cannot retry'),
    });
    assert.equal(late.error.code, 'ABORTED');
    assert.equal(calls, 2);
});

const draft = text => ({ kind: 'draft', text, source: { originalText: text, chatId: 'story', token: 'native-token' } });
const records = { kind: 'data', visibility: { kind: 'public' }, value: { type: 'extracted-records', sourceRefs: [], records: [{ id: 'compass', label: 'Compass', text: 'compass', classification: 'observation', evidence: [{ start: 0, end: 7, quote: 'compass' }] }] } };

test('each model-backed operation can recover transport without changing its original inputs', async () => {
    for (const [operation, inputs, settings, text, reportCode] of [
        ['enrich', { data: records }, {}, '[{"id":"compass","details":"Intact casing."}]', 'MODEL_ENRICHMENT'],
        ['extract', { source: { kind: 'text', text: 'compass' } }, { inputKind: 'text' }, '[{"id":"compass","label":"Compass","text":"compass","classification":"observation","evidence":[{"start":0,"end":7,"quote":"compass"}]}]', 'MODEL_EXTRACTION'],
        ['revise-draft', { draft: draft('Old prose.') }, { scope: 'whole' }, 'New prose.', 'MODEL_REVISION'],
    ]) {
        const requests = [], original = structuredClone(inputs);
        const result = await executeModelNode(node(operation, settings), inputs, {
            phase: 'post', request: async request => { requests.push(request); return requests.length === 1 ? transient() : complete(text); }, retryDelay: async () => true,
        });
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(requests.length, 2);
        assert.deepEqual(requests[1], requests[0]);
        assert.deepEqual(inputs, original);
        assert.equal(result.reports.find(report => report.code === reportCode).actualCalls, 2);
    }
});

test('deterministic model output gates and zero-call branches never schedule retries', async () => {
    for (const [operation, inputs, settings, text, code] of [
        ['enrich', { data: records }, {}, '[{"id":"unknown","details":"Changed identity"}]', 'INVALID_ENRICHMENT'],
        ['extract', { source: { kind: 'text', text: 'compass' } }, { inputKind: 'text' }, '{}', 'INVALID_EXTRACTION'],
        ['extract', { source: { kind: 'text', text: 'compass' } }, { inputKind: 'text' }, '[{"id":"compass","label":"Compass","text":"compass","classification":"observation","evidence":[{"start":0,"end":7,"quote":"fiction"}]}]', 'INVALID_EVIDENCE'],
        ['revise-draft', { draft: draft('KEEP old prose.') }, { scope: 'whole', protectedLiterals: ['KEEP'] }, 'Changed new prose.', 'OUT_OF_SCOPE_CHANGE'],
    ]) {
        let calls = 0;
        const result = await executeModelNode(node(operation, settings), inputs, {
            phase: 'post', request: async () => { calls++; return complete(text); }, retryDelay: async () => assert.fail('A deterministic gate cannot retry'),
        });
        assert.equal(result.error.code, code);
        assert.equal(calls, 1);
    }
    for (const [operation, inputs, settings] of [
        ['enrich', { data: { ...records, value: { ...records.value, records: [] } } }, {}],
        ['extract', { source: draft('compass') }, { mode: 'literal' }],
        ['revise-draft', { draft: draft('KEEP') }, { scope: 'whole', protectedLiterals: ['KEEP'] }],
    ]) {
        const result = await executeModelNode(node(operation, settings), inputs, { phase: 'post', request: async () => assert.fail('A zero-call branch cannot request') });
        assert.equal(result.ok, true);
        assert.equal(result.reports.reduce((sum, report) => sum + (report.actualCalls ?? 0), 0), 0);
    }
});

test('an oversized model JSON byte envelope is terminal without a correction request', async () => {
    let calls = 0;
    const result = await executeModelNode(node('model-call', { outputKind: 'data' }), prompt, {
        request: async () => { calls++; return complete('"' + '中'.repeat(90000) + '"'); }, retryDelay: async () => true,
    });
    assert.equal(result.error.code, 'INVALID_JSON');
    assert.equal(calls, 1);
});

test('Enrich and Extract can correct their own JSON while retaining records and evidence', async () => {
    for (const [operation, inputs, settings, text, reportCode] of [
        ['enrich', { data: records }, {}, '[{"id":"compass","details":"Intact casing."}]', 'MODEL_ENRICHMENT'],
        ['extract', { source: { kind: 'text', text: 'compass' } }, { inputKind: 'text' }, '[{"id":"compass","label":"Compass","text":"compass","classification":"observation","evidence":[{"start":0,"end":7,"quote":"compass"}]}]', 'MODEL_EXTRACTION'],
    ]) {
        let calls = 0;
        const result = await executeModelNode(node(operation, settings), inputs, {
            phase: 'post', request: async () => complete(++calls === 1 ? 'invalid' : text), retryDelay: async () => true,
        });
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(calls, 2);
        assert.equal(result.artifact.value.records[0].id, 'compass');
        assert.deepEqual(result.artifact.value.records[0].evidence, [{ start: 0, end: 7, quote: 'compass' }]);
        assert.equal(result.reports.find(report => report.code === reportCode).actualCalls, 2);
    }
});

test('a pending retry retains the resolved operation and controls if its authoring node changes', async () => {
    const operation = node('model-call', { instructions: 'Keep the original task.' });
    const requests = [];
    const result = await executeModelNode(operation, prompt, {
        request: async request => { requests.push(request); return requests.length === 1 ? transient() : complete('Original task result.'); },
        retryDelay: async () => { operation.operation = 'enrich'; operation.instructions = 'Changed task.'; },
    });
    assert.equal(result.ok, true);
    assert.equal(result.artifact.text, 'Original task result.');
    assert.deepEqual(requests[1], requests[0]);
});
