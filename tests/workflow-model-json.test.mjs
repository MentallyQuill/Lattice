import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeModelNode } from '../src/workflow/operations/model-nodes.js?v=0.29.1';
import { decodeModelJson } from '../src/workflow/operations/model-json.js?v=0.29.1';
import { decodeJson } from '../src/workflow/operations/json-decode.js?v=0.29.1';

const dataCall = (text, settings = {}, finish = 'stop') => executeModelNode(
    { id: 'json-output', operation: 'model-call', outputKind: 'data', ...settings },
    { prompt: { kind: 'text', text: 'Return the requested structured value.' } },
    { phase: 'pre', request: async () => ({ ok: true, data: { text, finish } }) },
);

test('Model Call accepts one complete JSON fence for Data output', async () => {
    const result = await dataCall('```json\n{"status":"ready"}\n```');
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value, { status: 'ready' });
    assert.deepEqual(result.reports, [
        { code: 'MODEL_CALL', actualCalls: 1, nodeId: 'json-output', finish: 'stop' },
        { code: 'MODEL_JSON_WRAPPER_REMOVED', actualCalls: 0, wrapper: { bom: false, fence: 'json' } },
    ]);
});

test('Model Call accepts one leading BOM after standard JSON whitespace', async () => {
    const result = await dataCall(' \t\r\n\uFEFF{"status":"ready"}');
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value, { status: 'ready' });
    assert.deepEqual(result.reports.find(report => report.code === 'MODEL_JSON_WRAPPER_REMOVED'), {
        code: 'MODEL_JSON_WRAPPER_REMOVED', actualCalls: 0, wrapper: { bom: true, fence: null },
    });
});

test('raw model JSON keeps its value and has no normalization report', async () => {
    for (const [input, value] of [[' \t\r\n{"status":"ready"}\r\n', { status: 'ready' }], ['null', null], ['[1,true,"text"]', [1, true, 'text']]]) {
        assert.deepEqual(decodeModelJson(input), { ok: true, data: { value, report: [] } });
    }
    const result = await dataCall('{"status":"ready"}');
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.reports.length, 1);
    assert.equal(result.reports[0].code, 'MODEL_CALL');
});

test('model JSON accepts complete unlabeled and case-insensitive JSON fences with standard line endings', () => {
    for (const [input, wrapper] of [
        ['```\n{"status":"ready"}\n```', { bom: false, fence: 'unlabeled' }],
        [' \t```JSON \t\r\n{"status":"ready"}\r\n```\r\n ', { bom: false, fence: 'json' }],
        ['```jSoN\r{"status":"ready"}\r```', { bom: false, fence: 'json' }],
        ['\uFEFF \n```json\n{"status":"ready"}\n```', { bom: true, fence: 'json' }],
    ]) {
        assert.deepEqual(decodeModelJson(input), {
            ok: true, data: { value: { status: 'ready' }, report: [{ code: 'MODEL_JSON_WRAPPER_REMOVED', actualCalls: 0, wrapper }] },
        });
    }
});

test('model JSON rejects surrounding prose, multiple documents and incomplete or unsupported fences', async () => {
    for (const input of [
        'Here is the value:\n```json\n{}\n```', '```json\n{}\n```\nDone.',
        'Here is the value: {}', '{} Done.', '{}\n{}',
        '```json\n{}\n```\n```json\n{}\n```',
        '```json\n{}', '{}\n```', '```json {} ```',
        '```javascript\n{}\n```', '~~~json\n{}\n~~~', '````json\n{}\n````',
        '\uFEFF\uFEFF{}', '```json\n\uFEFF{}\n```',
        '\u00A0{}', '\u00A0\uFEFF{}', '```json\n{}\n```\u00A0',
    ]) {
        const result = await dataCall(input);
        assert.equal(result.ok, false, 'An incomplete or embellished document must be held.');
        assert.equal(result.error.code, 'INVALID_JSON');
        assert.equal(result.artifact, undefined);
    }
});

test('model JSON rejects missing values and incomplete documents without response text in diagnostics', async () => {
    for (const input of [
        '\uFEFF{"diagnostic-marker":}',
        '```json\n{"value":"diagnostic-marker"\n```',
        '{,}', '[,]', '[1,,]', '{"value":,}', '{"value":1,',
        '{value:1}', '{"value":undefined}', '{"value":NaN}',
        '{"value":1 "other":2}', '[1 2]', '{"value":"bad\\q"}',
    ]) {
        const result = await dataCall(input);
        assert.equal(result.error?.code, 'INVALID_JSON');
        assert.equal(result.artifact, undefined);
        assert.equal(JSON.stringify(result).includes('diagnostic-marker'), false);
    }
});

test('model JSON repairs trailing commas locally before spending a correction attempt', async () => {
    let calls = 0;
    const result = await executeModelNode(
        { id: 'json-repair', operation: 'model-call', outputKind: 'data', maxRetries: 2 },
        { prompt: { kind: 'text', text: 'Return a structured value.' } },
        { phase: 'pre', request: async () => {
            calls++;
            return { ok: true, data: { text: '```json\n{"private-marker":[1,{"text":",} ,]",},],}\n```', finish: 'stop' } };
        } },
    );
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value, { 'private-marker': [1, { text: ',} ,]' }] });
    assert.equal(calls, 1);
    assert.deepEqual(result.reports.slice(1), [
        { code: 'MODEL_JSON_WRAPPER_REMOVED', actualCalls: 0, wrapper: { bom: false, fence: 'json' } },
        { code: 'MODEL_JSON_REPAIRED', actualCalls: 0, repairs: ['trailing-comma'] },
    ]);
    assert.equal(JSON.stringify(result.reports).includes('private-marker'), false);
});

test('model JSON removes comments outside strings without joining tokens', () => {
    const result = decodeModelJson('{/* private-marker */"url":"https://example.com/*literal*/", "items":[1, // item\n2,/* end */],}');
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(result.data.value, { url: 'https://example.com/*literal*/', items: [1, 2] });
    assert.deepEqual(result.data.report, [{ code: 'MODEL_JSON_REPAIRED', actualCalls: 0, repairs: ['comment', 'trailing-comma'] }]);
    for (const input of ['[tr/* gap */ue]', '[1/* gap */2]', '{"a":1}/* unfinished', '{"a":1// missing end']) {
        assert.equal(decodeModelJson(input).error?.code, 'INVALID_JSON');
    }
});

test('model JSON line comments end at Unicode line separators without swallowing later data', () => {
    for (const separator of ['\u2028', '\u2029']) {
        assert.equal(decodeModelJson('{"a":1}// comment' + separator + '{"b":2}').error?.code, 'INVALID_JSON');
        const result = decodeModelJson('[1,// comment' + separator + '2]');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.deepEqual(result.data.value, [1, 2]);
    }
});

test('model JSON normalizes single-quoted strings while preserving quotes and escapes', () => {
    const result = decodeModelJson(String.raw`{'text':'It\'s "quoted"; // literal /* text */', 'path':'C:\\folder', 'escaped':'\n\u754c',}`);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(result.data.value, { text: 'It\'s "quoted"; // literal /* text */', path: 'C:\\folder', escaped: '\n界' });
    assert.deepEqual(result.data.report, [{ code: 'MODEL_JSON_REPAIRED', actualCalls: 0, repairs: ['single-quote', 'trailing-comma'] }]);
    for (const input of [String.raw`{'text':'bad\q'}`, "{'text':'don't guess'}", "{'text':'unfinished}"]) {
        assert.equal(decodeModelJson(input).error?.code, 'INVALID_JSON');
    }
});

test('model JSON escapes literal string control characters without changing their values', () => {
    const result = decodeModelJson('{"text":"line 1\r\nline 2\t\u0000", "escaped":"\\n", "quote":"\\\""}');
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(result.data.value, { text: 'line 1\r\nline 2\t\u0000', escaped: '\n', quote: '"' });
    assert.deepEqual(result.data.report, [{ code: 'MODEL_JSON_REPAIRED', actualCalls: 0, repairs: ['string-control-character'] }]);
    assert.equal(decodeModelJson('{"text":"missing quote\n}').error?.code, 'INVALID_JSON');
    assert.equal(decodeModelJson('[1,\u00002]').error?.code, 'INVALID_JSON');
});

test('wrapped model JSON preserves supported schema validation without coercion', async () => {
    const schema = '{"type":"object","required":["status"],"properties":{"status":{"type":"string","enum":["ready"]}},"additionalProperties":false}';
    assert.equal((await dataCall('```json\n{"status":"ready"}\n```', { schema })).ok, true);
    assert.equal((await dataCall("{'status':'ready',}", { schema })).ok, true);
    for (const input of ['```json\n{}\n```', '\uFEFF{"status":3}', '```\n{"status":"ready","extra":true}\n```', "{'status':3,}", "{'status':'ready','extra':true,}"]) {
        const result = await dataCall(input, { schema });
        assert.equal(result.error?.code, 'SCHEMA_MISMATCH');
        assert.equal(result.artifact, undefined);
    }
});

test('schema diagnostics explain expected bounds and actual types or counts without response values', () => {
    for (const [input, schema, message] of [
        ['"PRIVATE RESPONSE"', { type: 'array' }, 'Expected array; got string.'],
        ['null', { type: 'object' }, 'Expected object; got null.'],
        ['[]', { type: 'object' }, 'Expected object; got array.'],
        ['{}', { required: ['missing'] }, 'Required field is missing.'],
        ['[]', { minItems: 1 }, 'Expected at least 1 items; got 0.'],
        ['[1,2]', { maxItems: 1 }, 'Expected at most 1 items; got 2.'],
        ['"😀"', { minLength: 2 }, 'Expected at least 2 characters; got 1.'],
        ['"😀😀😀"', { maxLength: 2 }, 'Expected at most 2 characters; got 3.'],
        ['1', { minimum: 2 }, 'Expected a number at least 2.'],
        ['999987654', { maximum: 2 }, 'Expected a number at most 2.'],
    ]) {
        const result = decodeModelJson(input, { schema });
        assert.equal(result.error?.code, 'SCHEMA_MISMATCH');
        assert.equal(result.error.findings[0].message, message);
        assert.equal(JSON.stringify(result).includes('PRIVATE RESPONSE'), false);
        assert.equal(JSON.stringify(result).includes('999987654'), false);
    }
});

test('model JSON bounds the original raw envelope before removing character wrappers', () => {
    const atFenceLimit = '```json\n' + ' '.repeat(99984) + 'null\n```';
    const atBomLimit = '\uFEFF' + ' '.repeat(99995) + 'null';
    for (const input of [atFenceLimit, atBomLimit]) {
        assert.equal(input.length, 100000);
        assert.equal(decodeModelJson(input).ok, true);
        const oversized = decodeModelJson(input + ' ');
        assert.equal(oversized.error?.code, 'INVALID_JSON');
        assert.equal(oversized.data, undefined);
    }
    for (const input of [null, undefined, 3, {}, []]) assert.equal(decodeModelJson(input).error?.code, 'INVALID_JSON');
    assert.equal(decodeModelJson('/*' + 'x'.repeat(100000) + '*/{}').error?.code, 'INVALID_JSON');
    assert.equal(decodeModelJson('"' + '\u0000'.repeat(20000) + '"').error?.code, 'INVALID_JSON');
    assert.equal(decodeModelJson('['.repeat(34) + '1,' + ']'.repeat(34)).error?.code, 'INVALID_JSON_VALUE');
});

test('model JSON bounds the original UTF-8 envelope before removing byte wrappers', async () => {
    const atByteLimit = '```json\n"' + '界'.repeat(87376) + 'aa"\n```';
    assert.equal(new TextEncoder().encode(atByteLimit).byteLength, 262144);
    assert.equal(decodeModelJson(atByteLimit).ok, true);
    const oversized = ' ' + atByteLimit;
    assert.ok(oversized.length < 100000);
    assert.equal(decodeModelJson(oversized).error?.code, 'INVALID_JSON');
    const result = await dataCall(oversized);
    assert.equal(result.error?.code, 'INVALID_JSON');
    assert.equal(result.artifact, undefined);
    assert.equal(decodeModelJson('/*' + '界'.repeat(87381) + '*/{}').error?.code, 'INVALID_JSON');
});

test('wrapped model JSON still requires verified completion and never retries rejected output', async () => {
    for (const [text, finish, code] of [
        ['```json\n{}\n```', 'length', 'TRUNCATED_OUTPUT'],
        ['```json\n{}\n```', 'max_tokens', 'TRUNCATED_OUTPUT'],
        ['```json\n{}\n```', 'max_output_tokens', 'TRUNCATED_OUTPUT'],
        ['```json\n{}', 'length', 'TRUNCATED_OUTPUT'],
        ['```json\n{}\n```', 'unknown', 'COMPLETION_UNVERIFIED'],
        ['```json\n{}\n```', undefined, 'COMPLETION_UNVERIFIED'],
        ['{"value":1,}', 'length', 'TRUNCATED_OUTPUT'],
        ['{"value":1,}', 'unknown', 'COMPLETION_UNVERIFIED'],
        ['```json\n{bad}\n```', 'stop', 'INVALID_JSON'],
    ]) {
        let calls = 0;
        const result = await executeModelNode(
            { id: 'bounded-json', operation: 'model-call', outputKind: 'data' },
            { prompt: { kind: 'text', text: 'Return a structured value.' } },
            { phase: 'pre', request: async () => { calls++; return { ok: true, data: { text, finish } }; } },
        );
        assert.equal(result.error?.code, code);
        assert.equal(result.artifact, undefined);
        assert.equal(calls, 1);
    }
});

test('Text model output preserves BOM, whitespace, fences and prose exactly', async () => {
    const text = ' \t\uFEFFHere is the value:\n```json\n{"status":"ready"}\n```\n ';
    const result = await dataCall(text, { outputKind: 'text' });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.artifact.text, text);
    assert.equal(result.reports.length, 1);
    assert.equal(result.reports[0].code, 'MODEL_CALL');
});

test('generic JSON Decode and schema settings retain raw JSON requirements', async () => {
    for (const input of ['\uFEFF{}', '```json\n{}\n```', '```\n{}\n```', '{"value":1,}', "{'value':1}", '{/* comment */}', '"line 1\nline 2"']) assert.equal(decodeJson(input).error?.code, 'INVALID_JSON');
    let calls = 0;
    const result = await executeModelNode(
        { id: 'strict-schema', operation: 'model-call', outputKind: 'data', schema: '```json\n{"type":"object"}\n```' },
        { prompt: { kind: 'text', text: 'Return a structured value.' } },
        { phase: 'pre', request: async () => { calls++; throw new Error('Invalid schemas must not request.'); } },
    );
    assert.equal(result.error?.code, 'INVALID_SCHEMA');
    assert.equal(calls, 0);
    assert.equal(decodeModelJson('{"value":1,}', { schema: { unsupported: true } }).error?.code, 'UNSUPPORTED_SCHEMA');
    assert.equal(decodeModelJson('{"value":1,}', { extra: true }).error?.code, 'INVALID_JSON_OPTIONS');
});

test('model Extract accepts a wrapped record array and retains exact evidence and proposal status', async () => {
    let calls = 0;
    const result = await executeModelNode(
        { id: 'wrapped-extract', operation: 'extract', inputKind: 'text' },
        { source: { kind: 'text', text: 'The bell rang.' } },
        { phase: 'post', request: async () => {
            calls++;
            return { ok: true, data: { text: '```JSON\n[{"id":"bell","label":"Bell","text":"The bell rang","classification":"observation","evidence":[{"start":4,"end":8,"quote":"bell"}]}]\n```', finish: 'stop' } };
        } },
    );
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(calls, 1);
    assert.deepEqual(result.artifact.value.records[0], {
        id: 'bell', label: 'Bell', text: 'The bell rang', classification: 'observation', evidence: [{ start: 4, end: 8, quote: 'bell' }], status: 'proposed',
    });
    assert.equal(result.reports[0].code, 'MODEL_EXTRACTION');
    assert.deepEqual(result.reports[1], { code: 'MODEL_JSON_WRAPPER_REMOVED', actualCalls: 0, wrapper: { bom: false, fence: 'json' } });
});

test('Enrich accepts BOM and a whole unlabeled fence while preserving record identity and evidence', async () => {
    const data = { kind: 'data', value: { type: 'extracted-records', sourceRefs: [{ kind: 'text' }], records: [
        { id: 'bell', label: 'Bell', text: 'The bell rang', classification: 'observation', evidence: [{ start: 4, end: 8, quote: 'bell' }] },
    ] } };
    let calls = 0;
    const result = await executeModelNode(
        { id: 'wrapped-enrich', operation: 'enrich' }, { data },
        { phase: 'post', request: async () => {
            calls++;
            return { ok: true, data: { text: '\uFEFF```\n[{"id":"bell","details":"A brass tone."}]\n```', finish: 'stop' } };
        } },
    );
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(calls, 1);
    assert.equal(result.artifact.value.type, 'enriched-records');
    assert.equal(result.artifact.value.records[0].id, 'bell');
    assert.deepEqual(result.artifact.value.records[0].evidence, [{ start: 4, end: 8, quote: 'bell' }]);
    assert.deepEqual(result.artifact.value.records[0].additions, [{ text: 'A brass tone.', classification: 'generated-proposal', originNodeId: 'wrapped-enrich' }]);
    assert.deepEqual(result.reports[1], { code: 'MODEL_JSON_WRAPPER_REMOVED', actualCalls: 0, wrapper: { bom: true, fence: 'unlabeled' } });
    assert.equal(JSON.stringify(result.reports).includes('A brass tone.'), false);
});

test('wrapped extraction still rejects invalid record shapes, false evidence and schema mismatches', async () => {
    for (const [text, schema, code] of [
        ['```json\n{}\n```', '', 'INVALID_EXTRACTION'],
        ['```json\n[{"id":"bell","label":"Bell","text":"The bell rang","classification":"observation","evidence":[{"start":0,"end":4,"quote":"bell"}]}]\n```', '', 'INVALID_EVIDENCE'],
        ['```json\n[]\n```', '{"type":"array","minItems":1}', 'SCHEMA_MISMATCH'],
        ['[{"id":"bell","label":"Bell","text":"The bell rang","classification":"observation","evidence":[{"start":0,"end":4,"quote":"bell",}],},]', '', 'INVALID_EVIDENCE'],
    ]) {
        let calls = 0;
        const result = await executeModelNode(
            { id: 'checked-extract', operation: 'extract', inputKind: 'text', schema },
            { source: { kind: 'text', text: 'The bell rang.' } },
            { phase: 'post', request: async () => { calls++; return { ok: true, data: { text, finish: 'stop' } }; } },
        );
        assert.equal(result.error?.code, code);
        assert.equal(result.artifact, undefined);
        assert.equal(calls, 1);
    }
});

test('wrapped enrichment still rejects changed record identities without retrying', async () => {
    let calls = 0;
    const result = await executeModelNode(
        { id: 'checked-enrich', operation: 'enrich' },
        { data: { kind: 'data', value: { type: 'extracted-records', sourceRefs: [], records: [{ id: 'bell', label: 'Bell', text: 'A bell', classification: 'observation', evidence: [] }] } } },
        { phase: 'post', request: async () => {
            calls++;
            return { ok: true, data: { text: '```json\n[{"id":"changed","details":"A brass tone.",},]\n```', finish: 'stop' } };
        } },
    );
    assert.equal(result.error?.code, 'INVALID_ENRICHMENT');
    assert.equal(result.artifact, undefined);
    assert.equal(calls, 1);
});
