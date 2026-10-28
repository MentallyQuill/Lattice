import assert from 'node:assert/strict';
import test from 'node:test';
import { requestModel, resolveBinding } from '../src/workflow/connections.js';
import { normalizeRequestFailure } from '../src/workflow/request-failure.js';
import { executeModelNode } from '../src/workflow/operations/model-nodes.js?v=0.29.0';

const requestWithFailure = async (error, signal) => {
    let calls = 0;
    const context = {
        CONNECT_API_MAP: { fixture: { selected: 'openai', source: 'nanogpt' } },
        chatCompletionSettings: {},
        ChatCompletionService: { presetToGeneratePayload: async (_preset, _settings, payload) => payload },
        ConnectionManagerRequestService: {
            getProfile: () => ({ id: 'fixture', name: 'Synthetic connection', api: 'fixture', model: 'fixture-model' }),
            sendRequest: async () => { calls++; throw error; },
        },
    };
    const binding = resolveBinding({ profileId: 'fixture' }, {}, context).data;
    const result = await requestModel({ binding, messages: [{ role: 'user', content: 'Synthetic input' }], maxTokens: 10, signal }, context);
    return { result, calls };
};

test('connection preserves a known transient status without making a second attempt', async () => {
    const { result, calls } = await requestWithFailure(Object.assign(new Error('Private provider body'), { status: 503 }));
    assert.equal(result.error?.code, 'REQUEST_FAILED');
    assert.equal(result.error?.retryable, true);
    assert.equal(result.error?.status, 503);
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(result).includes('Private provider body'), false);
});

test('connection recognizes the installed wrapper cause around a fetch network failure', async () => {
    const { result, calls } = await requestWithFailure(new Error('API request failed', { cause: new TypeError('Failed to fetch') }));
    assert.equal(result.error?.code, 'REQUEST_FAILED');
    assert.equal(result.error?.retryable, true);
    assert.equal(calls, 1);
});

test('normalizes only known transient HTTP statuses and exact installed status text', () => {
    for (const [status, text] of [[408, 'Request Timeout'], [429, 'Too Many Requests'], [500, 'Internal Server Error'], [502, 'Bad Gateway'], [503, 'Service Unavailable'], [504, 'Gateway Timeout']]) {
        for (const error of [{ status }, { statusCode: status }, new Error(text), { statusText: text }]) {
            const result = normalizeRequestFailure(error);
            assert.equal(result.error.retryable, true, `${status}: ${JSON.stringify(error)}`);
            assert.equal(result.error.status, status);
        }
    }
});

test('normalizes the exact known network messages and transport codes', () => {
    for (const error of [
        new TypeError('Failed to fetch'),
        new TypeError('NetworkError when attempting to fetch resource.'),
        new TypeError('Load failed'),
        { code: 'ETIMEDOUT' }, { code: 'ECONNRESET' }, { code: 'EAI_AGAIN' },
    ]) assert.equal(normalizeRequestFailure(new Error('API request failed', { cause: error })).error.retryable, true);
});

test('unknown, generic, malformed, and similar-looking failures do not retry', () => {
    for (const error of [
        undefined, null, 'Service Unavailable', 503,
        new Error('REQUEST_FAILED'), new Error('API request failed'), new Error('Response not OK'),
        new Error('Failed to fetch'), new TypeError('fetch failed'), new TypeError('Failed to fetch: private detail'),
        new Error('service unavailable'), new Error('Service Unavailable '), new Error('private: Service Unavailable'),
        { status: '503' }, { statusCode: 503.5 }, { status: NaN }, { status: 501 }, { code: 'ECONNREFUSED' },
    ]) {
        const result = normalizeRequestFailure(error);
        assert.equal(result.error.code, 'REQUEST_FAILED');
        assert.equal(result.error.retryable, undefined);
    }
});

test('explicit permanent HTTP and auth or configuration failures override transient causes', () => {
    for (const error of [
        { status: 401, cause: { status: 503 } },
        { statusCode: 403, cause: new TypeError('Failed to fetch') },
        { status: 503, cause: { status: 400 } },
        { status: 503, statusCode: 404 },
        { code: 'AUTH_FAILED', cause: { status: 503 } },
        { code: 'INVALID_API_KEY', cause: { status: 429 } },
        { code: 'CONFIG_ERROR', cause: { code: 'ETIMEDOUT' } },
        { code: 'BINDING_CHANGED', cause: { status: 503 } },
        { code: 'CALL_LIMIT', cause: { status: 503 } },
    ]) assert.equal(normalizeRequestFailure(error).error.retryable, undefined);
});

test('cancellation overrides all transient and permanent evidence across causes', async () => {
    const abortError = Object.assign(new Error('Private abort reason'), { name: 'AbortError' });
    for (const error of [abortError, new DOMException('Private abort reason', 'AbortError'), { status: 503, cause: abortError }, { status: 401, cause: { cause: abortError } }]) {
        const result = normalizeRequestFailure(error);
        assert.equal(result.error.code, 'ABORTED');
        assert.equal(result.error.retryable, undefined);
        assert.equal(JSON.stringify(result).includes('Private'), false);
    }
    assert.equal(normalizeRequestFailure({ status: 503 }, { aborted: true }).error.code, 'ABORTED');
    const { result, calls } = await requestWithFailure(new Error('API request failed', { cause: abortError }));
    assert.equal(result.error.code, 'ABORTED');
    assert.equal(calls, 1);
});

test('cause cycles, excessive depth, accessors and throwing proxies fail closed without evaluating getters', () => {
    let reads = 0;
    const cycle = { status: 503 }; cycle.cause = cycle;
    const deep = { status: 503 }; let tail = deep;
    for (let i = 0; i < 6; i++) { tail.cause = {}; tail = tail.cause; }
    for (const error of [
        cycle, deep,
        Object.defineProperty({ status: 503 }, 'cause', { get() { reads++; return undefined; } }),
        Object.defineProperty({ cause: { status: 503 } }, 'status', { get() { reads++; return 503; } }),
        Object.defineProperty({ status: 503 }, 'name', { get() { reads++; return 'Error'; } }),
        new Proxy({ status: 503 }, { getOwnPropertyDescriptor() { throw new Error('Private trap reason'); } }),
        new Proxy({ status: 503 }, { getPrototypeOf() { throw new Error('Private trap reason'); } }),
    ]) assert.equal(normalizeRequestFailure(error).error.retryable, undefined);
    assert.equal(reads, 0);
    assert.equal(normalizeRequestFailure({ cause: { cause: { cause: { cause: { cause: { status: 503 } } } } } }).error.retryable, true);
    assert.equal(normalizeRequestFailure(Object.create({ status: 503 })).error.retryable, undefined);
    assert.equal(normalizeRequestFailure(Object.create({ cause: { status: 503 } })).error.retryable, undefined);
});

test('structured bounded retry delays are retained and oversized delays stop automatic retry', () => {
    for (const delay of [0, 500, 30000]) {
        const result = normalizeRequestFailure({ status: 429, retryAfterMs: delay });
        assert.equal(result.error.retryable, true);
        assert.equal(result.error.retryAfterMs, delay);
    }
    assert.equal(normalizeRequestFailure({ retryAfterMs: 1200, cause: { status: 503 } }).error.retryAfterMs, 1200);
    assert.equal(normalizeRequestFailure({ status: 503, retryAfterMs: 30001 }).error.retryable, undefined);
    assert.equal(normalizeRequestFailure({ status: 503, cause: { retryAfterMs: 60000 } }).error.retryable, undefined);
    for (const delay of [-1, '500', 0.5, NaN, Infinity]) assert.equal(normalizeRequestFailure({ status: 503, retryAfterMs: delay }).error.retryAfterMs, undefined);
    assert.equal(normalizeRequestFailure({ retryAfterMs: 500 }).error.retryAfterMs, undefined);
});

test('normalized metadata never retains provider bodies, arbitrary diagnostics or causes', () => {
    const result = normalizeRequestFailure({
        status: 503, retryAfterMs: 2000, message: 'PRIVATE BODY', body: 'PRIVATE BODY',
        response: { status: 401, body: 'PRIVATE BODY' }, cause: { code: 'ECONNRESET', message: 'PRIVATE CAUSE' },
    });
    assert.deepEqual(result, { ok: false, error: { code: 'REQUEST_FAILED', message: 'The auxiliary request failed. Inspect the fixed connection.', retryable: true, status: 503, retryAfterMs: 2000 } });
});

const terminalCodes = [
    'TRUNCATED_OUTPUT', 'COMPLETION_UNVERIFIED', 'PRIVATE_MATERIAL', 'STALE_ACTOR_SCOPE',
    'PROMPT_LIMIT', 'OUTPUT_LIMIT', 'INVALID_SETTINGS', 'INVALID_RESPONSE', 'EMPTY_OUTPUT',
    'TOKEN_COUNT_FAILED', 'REQUEST_UNAVAILABLE', 'UNSUPPORTED_SCHEMA', 'SCHEMA_LIMIT',
    'INVALID_SCHEMA', 'INVALID_JSON', 'SCHEMA_MISMATCH', 'INVALID_JSON_VALUE', 'INVALID_JSON_PATH', 'INVALID_JSON_OPTIONS',
    'ACTOR_ARTIFACT_SCOPE', 'ACTOR_CONTEXT_CHANGED', 'ACTOR_CONTEXT_LIMIT', 'ACTOR_GRANT_REQUIRED',
    'ACTOR_GUIDANCE_SCOPE', 'ACTOR_GUIDANCE_UNVERIFIED', 'ACTOR_MEMORY_SCOPE_MISMATCH',
    'ACTOR_MEMORY_UNAVAILABLE', 'ACTOR_MODEL_SCOPE', 'ACTOR_NOT_LOADED', 'ACTOR_PRESENCE_UNVERIFIED',
    'ACTOR_TRIGGER_UNVERIFIED', 'INVALID_ACTOR_PORTS', 'INVALID_ACTOR_REQUEST',
    'ENRICHMENT_LIMIT', 'EXTRACTION_LIMIT', 'INVALID_ENRICHMENT', 'INVALID_EVIDENCE',
    'INVALID_EXTRACTION', 'INVALID_INPUT', 'INVALID_PHASE', 'INVALID_PORTS', 'INVALID_RECORDS',
    'MISSING_INPUT', 'UNKNOWN_OPERATION', 'UNSUPPORTED_INPUT', 'VISIBILITY_REQUIRED',
    'DRAFT_EVIDENCE_RETENTION_FAILED', 'GUIDANCE_OVERFLOW', 'HOST_OPERATION_REQUIRED',
    'INVALID_OUTPUT', 'INVALID_RUN_CLOCK', 'INVALID_RUN_PLAN', 'INVALID_SNAPSHOT',
    'ITERATION_AUTHORITY', 'PENDING_REQUEST', 'RECALL_PROVENANCE_FAILED', 'REQUEST_IN_FLIGHT',
    'REQUEST_MISSING', 'UNRESOLVED_INPUT', 'WORKFLOW_FAILED', 'WRONG_PHASE',
];

test('explicit terminal model, privacy and limit codes veto transient evidence anywhere in a cause chain', () => {
    for (const code of terminalCodes) {
        for (const error of [
            { code, cause: { status: 503 } },
            { status: 503, cause: { code } },
            { code, cause: new TypeError('Failed to fetch') },
        ]) assert.equal(normalizeRequestFailure(error).error.retryable, undefined, code);
    }
    assert.equal(normalizeRequestFailure({ code: 'REQUEST_FAILED', cause: { status: 503 } }).error.retryable, true);
});

test('thrown terminal request codes stop a retry-enabled model after one physical request', async () => {
    for (const code of ['TRUNCATED_OUTPUT', 'COMPLETION_UNVERIFIED', 'PRIVATE_MATERIAL', 'STALE_ACTOR_SCOPE', 'PROMPT_LIMIT', 'OUTPUT_LIMIT', 'INVALID_JSON', 'SCHEMA_MISMATCH']) {
        let calls = 0;
        const waits = [];
        const result = await executeModelNode({ id: 'terminal', operation: 'model-call', maxRetries: 2 }, { prompt: { kind: 'text', text: 'Synthetic prompt' } }, {
            request: async () => { calls++; throw Object.assign(new Error('Private provider detail'), { code, cause: { status: 503 } }); },
            retryDelay: async delay => { waits.push(delay); },
        });
        assert.equal(result.ok, false);
        assert.equal(calls, 1, code);
        assert.deepEqual(waits, [], code);
        assert.equal(result.error.retryable, undefined, code);
    }
});
