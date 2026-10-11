import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as contracts from '../src/ui/control-input-contracts.js';
const termSpec = { id: 'smart-compactor.pins', version: 1, editor: 'list', formats: ['auto', 'plain', 'csv', 'json', 'rows'], storage: 'json-value', limits: { maxItems: 128, maxStringLength: 4096, maxBytes: 262144 } };
test('though becomes one string term', () => {
    assert.deepEqual(contracts.parseControlInput(termSpec, { format: 'auto', text: 'though' }).data.value, ['though']);
});
test('comma-separated numbers remain string terms with leading zeroes', () => {
    assert.deepEqual(contracts.parseControlInput(termSpec, { format: 'auto', text: '1, 2, 3' }).data.value, ['1', '2', '3']);
    assert.deepEqual(contracts.parseControlInput(termSpec, { format: 'auto', text: '001, 2' }).data.value, ['001', '2']);
});
test('quoted comma, newline and doubled quote content survives list parsing', () => {
    assert.deepEqual(contracts.parseControlInput(termSpec, { format: 'auto', text: ' "red, blue", " line\none ", "say ""hello"""\r\ngreen' }).data.value, ['red, blue', ' line\none ', 'say "hello"', 'green']);
});
test('ignored blank cells produce a visible ignored-entry warning', () => {
    const result = contracts.parseControlInput(termSpec, { format: 'auto', text: 'one,,\r\n ,two' });
    assert.deepEqual(result.data.value, ['one', 'two']);
    assert.match(result.data.warnings[0], /3.*blank/i);
});
test('unterminated quotes and trailing quoted-cell junk return located errors', () => {
    for (const text of ['one,"unfinished', '"one"junk,two']) {
        const result = contracts.parseControlInput(termSpec, { format: 'csv', text });
        assert.equal(result.ok, false);
        assert.equal(typeof result.error.code, 'string');
        assert.equal(typeof result.error.row, 'number');
        assert.equal(typeof result.error.cell, 'number');
        assert.equal(Object.hasOwn(result, 'data'), false);
    }
});
test('apparent JSON is not silently reinterpreted', () => {
    assert.equal(contracts.parseControlInput(termSpec, { format: 'auto', text: '["one",' }).ok, false);
    assert.deepEqual(contracts.parseControlInput(termSpec, { format: 'plain', text: '["one",' }).data.value, ['["one",']);
    assert.deepEqual(contracts.parseControlInput(termSpec, { format: 'auto', text: '["1", "2", "3"]' }).data.value, ['1', '2', '3']);
    for (const text of ['true', 'null', '123']) assert.deepEqual(contracts.parseControlInput(termSpec, { format: 'auto', text }).data.value, [text]);
    assert.equal(contracts.parseControlInput(termSpec, { format: 'auto', text: '{"one":2}' }).ok, false);
});
test('numeric thresholds compile finite numbers to JSON text', () => {
    const spec = contracts.resolveControlInputSpec({ operation: 'collection', controls: { mode: 'threshold' }, key: 'thresholds', descriptor: { type: 'string', default: '[]', editor: 'json', maxLength: 4096 } });
    assert.equal(contracts.parseControlInput(spec, { format: 'auto', text: '-3, 1, 2.5' }).data.value, '[-3,1,2.5]');
    for (const text of ['1, Infinity', '1, NaN', '1, 1e999']) assert.equal(contracts.parseControlInput(spec, { format: 'auto', text }).ok, false);
});
test('invalid input and generic JSON byte, depth and value limits fail without values', () => {
    const valueSpec = { ...termSpec, id: 'condition.value', editor: 'value', formats: ['json', 'rows'] };
    let deep = null; for (let i = 0; i < 34; i++) deep = [deep];
    let accessed = false;
    const accessor = Object.defineProperty({}, 'secret', { enumerable: true, get() { accessed = true; return 1; } });
    for (const input of [{ format: 'rows', value: deep }, { format: 'rows', value: Array(10001).fill(null) }, { format: 'json', text: JSON.stringify('x'.repeat(262145)) }, { format: 'rows', value: accessor }, { format: 'rows', value: NaN }, { format: 'rows', value: undefined }, { format: 'auto', text: 1 }]) {
        const result = contracts.parseControlInput(valueSpec, input);
        assert.equal(result.ok, false);
        assert.equal(Object.hasOwn(result, 'data'), false);
    }
    assert.equal(accessed, false);
    assert.deepEqual(contracts.parseControlInput(valueSpec, { format: 'rows', value: JSON.parse('{"__proto__":{"safe":true}}') }).data.value, JSON.parse('{"__proto__":{"safe":true}}'));
});
test('every exposed structured inventory entry resolves to a declared grammar', async () => {
    const { OPERATIONS, operationFor } = await import('../src/workflow/catalog.js');
    for (const [operation, entry] of Object.entries(OPERATIONS)) {
        for (const mode of entry.modes ?? [entry.defaults.mode]) {
            const controls = { ...entry.defaults, ...(mode ? { mode } : {}) };
            const effective = operationFor({ type: 'workflow', operation, ...controls }, { phase: entry.phase === 'post' ? 'post' : 'pre' }) ?? entry;
            for (const [key, descriptor] of Object.entries(effective.controlDescriptors)) {
                if (!['array', 'object', 'json-value'].includes(descriptor.type) && descriptor.editor !== 'json') continue;
                const spec = contracts.resolveControlInputSpec({ operation, controls, key, descriptor });
                assert.equal(spec.version, 1, operation + '.' + key);
                assert.notEqual(spec.editor, 'text', operation + '.' + key);
                assert.equal(spec.storage, descriptor.type === 'string' ? 'json-text' : 'json-value', operation + '.' + key);
                if (descriptor.max !== undefined) assert.equal(spec.limits.maxItems, descriptor.max, operation + '.' + key);
            }
        }
    }
    assert.equal(contracts.resolveControlInputSpec({ operation: 'state', controls: { mode: 'duration' }, key: 'durations', descriptor: { type: 'object', max: 5, default: {} } }).editor, 'rows');
    assert.equal(contracts.resolveControlInputSpec({ operation: 'condition', controls: {}, key: 'value', descriptor: { type: 'json-value', default: null } }).editor, 'value');
    assert.throws(() => contracts.resolveControlInputSpec({ operation: 'new-operation', controls: {}, key: 'newArray', descriptor: { type: 'array', items: 'string', default: [] } }), /declare/i);
});
test('regex expressions retain comma quantifiers and compile stable Pattern IDs', () => {
    const spec = contracts.resolveControlInputSpec({ operation: 'pattern', controls: { mode: 'regex' }, key: 'rules', descriptor: { type: 'array', items: 'record', max: 128, default: [] } });
    const currentValue = [{ id: 'pattern-1', pattern: 'a{1,3}', label: 'Keep label' }];
    assert.deepEqual(contracts.parseControlInput(spec, { format: 'auto', text: 'a{1,3}\nb+', currentValue }).data.value, [{ id: 'pattern-1', pattern: 'a{1,3}', label: 'Keep label' }, { id: 'pattern-2', pattern: 'b+' }]);
});
test('Pattern and Extract entries compile current records and validate explicit IDs', () => {
    const pattern = contracts.resolveControlInputSpec({ operation: 'pattern', controls: { mode: 'literal' }, key: 'rules', descriptor: { type: 'array', max: 128, items: 'record', default: [] } });
    const extract = contracts.resolveControlInputSpec({ operation: 'extract', controls: { mode: 'literal' }, key: 'patterns', descriptor: { type: 'array', max: 64, items: 'record', default: [] } });
    assert.deepEqual(contracts.parseControlInput(pattern, { format: 'json', text: '["though","though"]' }).data.value, [{ id: 'pattern-1', pattern: 'though' }, { id: 'pattern-2', pattern: 'though' }]);
    assert.deepEqual(contracts.parseControlInput(extract, { format: 'auto', text: 'red, blue' }).data.value, [{ id: 'pattern-1', literal: 'red', label: '' }, { id: 'pattern-2', literal: 'blue', label: '' }]);
    const records = [{ id: 'authored', pattern: 'though', label: 'Keep me' }];
    assert.deepEqual(contracts.parseControlInput(pattern, { format: 'json', text: JSON.stringify(records) }).data.value, records);
    for (const value of [[{ id: 'same', pattern: 'a' }, { id: 'same', pattern: 'b' }], [{ pattern: 'missing id' }], [{ id: 'x', literal: 'old schema' }], Array(129).fill('a')]) {
        const result = contracts.parseControlInput(pattern, { format: 'rows', value });
        assert.equal(result.ok, false); assert.equal(Object.hasOwn(result, 'data'), false);
    }
});
test('JSON-text schemas retain exact source and format without double encoding', () => {
    const spec = contracts.resolveControlInputSpec({ operation: 'json-decode', controls: {}, key: 'schema', descriptor: { type: 'string', editor: 'json', default: '' } });
    const text = ' { "type": "object", "properties": {"x": {"type": "number"}} }\n';
    const result = contracts.parseControlInput(spec, { format: 'json', text });
    assert.equal(result.data.value, text); assert.equal(result.data.sourceText, text);
    assert.equal(contracts.formatControlInput(spec, result.data.value, 'json').data, text);
    assert.equal(contracts.parseControlInput(spec, { format: 'rows', value: { type: 'string' } }).data.value, '{"type":"string"}');
    assert.equal(contracts.parseControlInput(spec, { format: 'json', text: '{"unsupported":true}' }).ok, false);
});
test('exports round-trip string identity and reject lossy record or plain exports', () => {
    const value = ['001', ' red, blue ', 'line\none', 'say "hello"'];
    const exported = contracts.formatControlInput(termSpec, value, 'csv');
    assert.equal(exported.ok, true);
    assert.deepEqual(contracts.parseControlInput(termSpec, { format: 'csv', text: exported.data }).data.value, value);
    assert.equal(contracts.formatControlInput(termSpec, ['["one",'], 'plain').data, '["one",');
    assert.equal(contracts.formatControlInput(termSpec, ['one', 'two'], 'plain').ok, false);
    const spec = contracts.resolveControlInputSpec({ operation: 'pattern', controls: { mode: 'literal' }, key: 'rules', descriptor: { type: 'array', max: 128, items: 'record', default: [] } });
    assert.equal(contracts.formatControlInput(spec, [{ id: 'custom', pattern: 'one', label: 'Keep me' }], 'csv').ok, false);
    const rows = [{ id: 'pattern-1', pattern: 'red, blue' }, { id: 'pattern-2', pattern: 'green' }];
    const text = contracts.formatControlInput(spec, rows, 'csv'); assert.equal(text.ok, true);
    assert.deepEqual(contracts.parseControlInput(spec, { format: 'csv', text: text.data }).data.value, rows);
});
test('explicit TSV retains table rows while automatic terms preserve literal tabs', async () => {
    const { parseDelimitedInput } = await import('../src/ui/delimited-input.js');
    assert.deepEqual(parseDelimitedInput('"one\ttwo"\tthree\r\nfour\tfive', '\t').data.rows, [['one\ttwo', 'three'], ['four', 'five']]);
    assert.deepEqual(contracts.parseControlInput(termSpec, { format: 'auto', text: 'one\ttwo' }).data.value, ['one\ttwo']);
    for (const [text, delimiter] of [['one', ';'], [1, ','], ['x'.repeat(262145), ','], [Array(10001).fill('a').join(','), ',']]) {
        const result = parseDelimitedInput(text, delimiter); assert.equal(result.ok, false); assert.equal(Object.hasOwn(result, 'data'), false);
    }
});
test('paths, prose and typed values use their own grammar instead of CSV inference', () => {
    const path = contracts.resolveControlInputSpec({ operation: 'condition', controls: {}, key: 'path', descriptor: { type: 'array', items: 'string', default: [] } });
    assert.deepEqual(contracts.parseControlInput(path, { format: 'auto', text: 'a.b,c' }).data.value, ['a.b,c']);
    assert.deepEqual(contracts.parseControlInput(path, { format: 'csv', text: '001, item' }).data.value, ['001', 'item']);
    assert.equal(contracts.parseControlInput(path, { format: 'rows', value: ['items', 0] }).ok, false);
    const prose = contracts.resolveControlInputSpec({ operation: 'compose', controls: {}, key: 'template', descriptor: { type: 'string', default: '' } });
    assert.equal(contracts.parseControlInput(prose, { format: 'auto', text: '[draft], prose\nline' }).data.value, '[draft], prose\nline');
    assert.equal(contracts.formatControlInput(prose, '[draft], prose', 'plain').data, '[draft], prose');
    const value = contracts.resolveControlInputSpec({ operation: 'condition', controls: {}, key: 'value', descriptor: { type: 'json-value', default: null } });
    assert.equal(contracts.parseControlInput(value, { format: 'auto', text: 'null' }).data.value, null);
    assert.deepEqual(contracts.parseControlInput(value, { format: 'rows', value: { 'a.b,c': false } }).data.value, { 'a.b,c': false });
});

test('descriptor limits and existing engine constraints reject invalid field values', () => {
    const thresholds = contracts.resolveControlInputSpec({ operation: 'collection', controls: { mode: 'threshold' }, key: 'thresholds', descriptor: { type: 'string', editor: 'json', maxLength: 4096, default: '[]' } });
    for (const text of ['3,2', '2,2', '9007199254740992', '[true]']) assert.equal(contracts.parseControlInput(thresholds, { format: 'auto', text }).ok, false);
    const terms = { ...termSpec, limits: { maxItems: 2, maxStringLength: 3, maxBytes: 100 } };
    for (const text of ['one,two,tri', 'long']) assert.equal(contracts.parseControlInput(terms, { format: 'auto', text }).ok, false);
    const slots = contracts.resolveControlInputSpec({ operation: 'join', controls: {}, key: 'inputs', descriptor: { type: 'array', items: 'record', min: 1, max: 16, default: [] } });
    assert.equal(contracts.parseControlInput(slots, { format: 'rows', value: [{ id: 'only', label: 'Only', required: false }] }).ok, true);
    assert.equal(contracts.parseControlInput(slots, { format: 'rows', value: [] }).ok, false);
    assert.equal(contracts.parseControlInput(slots, { format: 'auto', text: 'some words' }).ok, false);
    const schema = contracts.resolveControlInputSpec({ operation: 'json-decode', controls: {}, key: 'schema', descriptor: { type: 'string', editor: 'json', default: '' } });
    assert.equal(contracts.parseControlInput(schema, { format: 'json', text: '' }).data.value, '');
});
test('copied specs retain field validation and JSON budgets apply to the value', () => {
    const slots = structuredClone(contracts.resolveControlInputSpec({ operation: 'join', controls: {}, key: 'inputs', descriptor: { type: 'array', items: 'record', max: 16, default: [] } }));
    assert.equal(contracts.parseControlInput(slots, { format: 'rows', value: [] }).ok, false);
    const value = { ...termSpec, id: 'condition.value', editor: 'value', limits: { maxBytes: 262144 } };
    const text = JSON.stringify('\\'.repeat(100000));
    assert.equal(contracts.parseControlInput(value, { format: 'json', text }).ok, true);
    let accessed = false;
    const input = Object.defineProperty({ format: 'auto' }, 'text', { enumerable: true, get() { accessed = true; return 'secret'; } });
    assert.equal(contracts.parseControlInput(termSpec, input).ok, false); assert.equal(accessed, false);
});

test('declared types and row byte budgets constrain accepted canonical values', () => {
    const bounded = { ...termSpec, limits: { maxBytes: 8 } };
    assert.equal(contracts.parseControlInput(bounded, { format: 'rows', value: ['too long'] }).ok, false);
    const prose = contracts.resolveControlInputSpec({ operation: 'compose', controls: {}, key: 'template', descriptor: { type: 'string', default: '' } });
    assert.equal(contracts.parseControlInput(prose, { format: 'json', text: '42' }).ok, false);
    assert.equal(contracts.formatControlInput(prose, 42, 'plain').ok, false);
    const path = contracts.resolveControlInputSpec({ operation: 'select-fields', controls: {}, key: 'path', descriptor: { type: 'array', items: 'json', max: 32, default: [] } });
    assert.deepEqual(contracts.parseControlInput(path, { format: 'rows', value: ['items', 0, 'a.b,c'] }).data.value, ['items', 0, 'a.b,c']);
    assert.equal(contracts.parseControlInput(path, { format: 'rows', value: ['items', -1] }).ok, false);
});
test('explicit regex CSV import preserves quoted expressions independently of Auto rows', () => {
    const spec = contracts.resolveControlInputSpec({ operation: 'pattern', controls: { mode: 'regex' }, key: 'rules', descriptor: { type: 'array', items: 'record', max: 128, default: [] } });
    const rows = [{ id: 'pattern-1', pattern: 'a{1,3}' }, { id: 'pattern-2', pattern: 'b+' }];
    assert.deepEqual(contracts.parseControlInput(spec, { format: 'csv', text: '"a{1,3}","b+"' }).data.value, rows);
    assert.equal(contracts.formatControlInput(spec, rows, 'csv').ok, true);
});
test('inserted terms cannot consume identities reserved for later exact matches', () => {
    const fixtures = [
        { operation: 'pattern', key: 'rules', field: 'pattern', currentValue: [{ id: 'pattern-1', pattern: 'a', label: 'A' }, { id: 'pattern-2', pattern: 'b', label: 'B' }], text: 'new,a', expected: [{ id: 'pattern-3', pattern: 'new' }, { id: 'pattern-1', pattern: 'a', label: 'A' }] },
        { operation: 'pattern', key: 'rules', field: 'pattern', currentValue: [{ id: 'pattern-1', pattern: 'a', label: 'A' }, { id: 'pattern-2', pattern: 'b', label: 'B' }], text: 'new,b,a', expected: [{ id: 'pattern-3', pattern: 'new' }, { id: 'pattern-2', pattern: 'b', label: 'B' }, { id: 'pattern-1', pattern: 'a', label: 'A' }] },
        { operation: 'pattern', key: 'rules', field: 'pattern', currentValue: [{ id: 'pattern-1', pattern: 'a', label: 'First' }, { id: 'pattern-2', pattern: 'a', label: 'Second' }, { id: 'pattern-3', pattern: 'b', label: 'B' }], text: 'new,a,b,a,a', expected: [{ id: 'pattern-4', pattern: 'new' }, { id: 'pattern-1', pattern: 'a', label: 'First' }, { id: 'pattern-3', pattern: 'b', label: 'B' }, { id: 'pattern-2', pattern: 'a', label: 'Second' }, { id: 'pattern-5', pattern: 'a' }] },
        { operation: 'extract', key: 'patterns', field: 'literal', currentValue: [{ id: 'pattern-1', literal: 'a', label: 'A' }, { id: 'pattern-2', literal: 'b', label: 'B' }], text: 'new,b,a', expected: [{ id: 'pattern-3', literal: 'new', label: '' }, { id: 'pattern-2', literal: 'b', label: 'B' }, { id: 'pattern-1', literal: 'a', label: 'A' }] },
    ];
    for (const fixture of fixtures) {
        const spec = contracts.resolveControlInputSpec({ operation: fixture.operation, controls: { mode: 'literal' }, key: fixture.key, descriptor: { type: 'array', items: 'record', max: fixture.operation === 'pattern' ? 128 : 64, default: [] } });
        assert.deepEqual(contracts.parseControlInput(spec, { format: 'auto', text: fixture.text, currentValue: fixture.currentValue }).data.value, fixture.expected);
    }
});
test('literal and identifier lists obey existing engine string and identity constraints', async () => {
    const { OPERATIONS } = await import('../src/workflow/catalog.js');
    const fixtures = [
        { operation: 'pattern', key: 'exemptions', controls: { ...OPERATIONS.pattern.defaults }, limit: 2048 },
        { operation: 'pattern', key: 'protectedLiterals', controls: { ...OPERATIONS.pattern.defaults }, limit: 2048 },
        { operation: 'text-rules', key: 'protectedLiterals', controls: { ...OPERATIONS['text-rules'].defaults }, limit: 2048 },
        { operation: 'style-transfer', key: 'protectedLiterals', controls: { ...OPERATIONS['style-transfer'].defaults }, limit: 2048 },
        { operation: 'recall', key: 'partnerIds', controls: { ...OPERATIONS.recall.defaults, actorId: 'actor', memorySetId: 'memories' }, limit: 256 },
        { operation: 'recall', key: 'recordIds', controls: { ...OPERATIONS.recall.defaults, actorId: 'actor', memorySetId: 'memories' }, limit: 256 },
        { operation: 'time-trigger', key: 'consumedIds', controls: { ...OPERATIONS['time-trigger'].defaults, scheduleId: 'schedule' }, limit: 4096 },
    ];
    for (const { operation, key, controls, limit } of fixtures) {
        const spec = contracts.resolveControlInputSpec({ operation, controls, key, descriptor: OPERATIONS[operation].controlDescriptors[key] });
        assert.equal(spec.limits.maxStringLength, limit, operation + '.' + key);
        assert.equal(contracts.parseControlInput(spec, { format: 'rows', value: ['x'.repeat(limit)] }).ok, true, operation + '.' + key);
        for (const format of ['auto', 'json', 'rows']) {
            const result = contracts.parseControlInput(spec, format === 'rows' ? { format, value: ['x'.repeat(limit + 1)] } : { format, text: format === 'json' ? JSON.stringify(['x'.repeat(limit + 1)]) : 'x'.repeat(limit + 1) });
            assert.equal(result.ok, false, operation + '.' + key + ':' + format); assert.equal(Object.hasOwn(result, 'data'), false);
        }
    }
    const recall = contracts.resolveControlInputSpec({ operation: 'recall', controls: { ...OPERATIONS.recall.defaults, actorId: 'actor', memorySetId: 'memories' }, key: 'recordIds', descriptor: OPERATIONS.recall.controlDescriptors.recordIds });
    for (const value of [['same', 'same'], [' ']]) assert.equal(contracts.parseControlInput(recall, { format: 'rows', value }).ok, false);
});
test('copied dynamic specs retain effective mode field admission', async () => {
    const { operationFor } = await import('../src/workflow/catalog.js');
    const { introspectionDefaults } = await import('../src/workflow/introspection/native.js');
    for (const { operation, mode, key, valid, invalid } of [
        { operation: 'state', mode: 'curve', key: 'durations', valid: { peak: 64 }, invalid: [{ bad: false }, { peak: 0 }, { peak: 65 }, { peak: false }] },
        { operation: 'context', mode: 'focus', key: 'pins', valid: ['word'], invalid: [Array(65).fill('word'), ['x'.repeat(4097)], [false]] },
    ]) {
        const controls = introspectionDefaults(operation, mode), effective = operationFor({ type: 'workflow', operation, ...controls });
        const original = contracts.resolveControlInputSpec({ operation, controls, key, descriptor: effective.controlDescriptors[key] });
        for (const spec of [original, structuredClone(original)]) {
            assert.equal(contracts.parseControlInput(spec, { format: 'rows', value: valid }).ok, true, original.id);
            for (const value of invalid) {
                const result = contracts.parseControlInput(spec, { format: 'rows', value });
                assert.equal(result.ok, false, original.id); assert.equal(Object.hasOwn(result, 'data'), false);
            }
        }
    }
});
test('copied specs preserve field checks without requiring sibling save settings', async () => {
    const { OPERATIONS, operationFor } = await import('../src/workflow/catalog.js');
    const { introspectionDefaults } = await import('../src/workflow/introspection/native.js');
    const fixtures = [
        { operation: 'state', key: 'updates', controls: { ...introspectionDefaults('state', 'value'), min: -4, max: 4 }, valid: { score: 2 }, invalid: { score: false } },
        { operation: 'recall', key: 'recordIds', controls: { ...OPERATIONS.recall.defaults, actorId: 'actor', memorySetId: 'memories' }, valid: ['record'], invalid: ['same', 'same'] },
        { operation: 'time-trigger', key: 'metadata', controls: { ...OPERATIONS['time-trigger'].defaults, scheduleId: 'schedule' }, valid: { subjectId: 'actor', consequence: false }, invalid: { scheduleId: 'conflicting' } },
        { operation: 'hotkey-arm', key: 'hotkey', controls: { ...OPERATIONS['hotkey-arm'].defaults, actorId: 'actor', memorySetId: 'memories' }, valid: { code: 'KeyM', ctrl: true, alt: false, shift: false, meta: false }, invalid: { code: 'KeyR', ctrl: true, alt: false, shift: false, meta: false } },
        { operation: 'for-each', key: 'roleOverrides', controls: { ...OPERATIONS['for-each'].defaults, helper: { id: 'helper', version: 1, semanticHash: 'sha256:' + '0'.repeat(64) } }, valid: { Writer: { model: null } }, invalid: { Writer: { unknown: 'setting' } } },
    ];
    for (const { operation, key, controls, valid, invalid } of fixtures) {
        const descriptor = operationFor({ type: 'workflow', operation, ...controls }).controlDescriptors[key];
        const original = contracts.resolveControlInputSpec({ operation, controls, key, descriptor });
        for (const spec of [original, structuredClone(original)]) {
            assert.equal(contracts.parseControlInput(spec, { format: 'rows', value: valid }).ok, true, original.id);
            assert.equal(contracts.parseControlInput(spec, { format: 'rows', value: invalid }).ok, false, original.id);
        }
    }
});


test('wave-one row adapters preserve authored identities and metadata with exact bounds', async () => {
    const adapters = await import('../src/ui/control-input-adapters.js').catch(() => null);
    assert.ok(adapters, 'Pure row adapters are available');
    const { readControlRows, writeControlRows, allocateControlRowId } = adapters;
    const { projectNodeControls } = await import('../src/ui/node-control-projection.js');
    const spec = (operation, key, controls = {}) => projectNodeControls(operation, controls, {}).find(control => control.key === key).inputSpec;
    assert.equal(allocateControlRowId('pattern', ['pattern-1', 'pattern-3']), 'pattern-2');
    for (const [operation, key, field, max] of [['pattern', 'rules', 'pattern', 128], ['extract', 'patterns', 'literal', 64]]) {
        const original = [{ id: 'first', [field]: 'a{1,3}', label: 'Keep' }, { id: 'second', [field]: 'b', ...(operation === 'extract' ? { label: '' } : {}) }];
        const input = spec(operation, key);
        assert.deepEqual(readControlRows(input, original).data.rows, original);
        const edited = writeControlRows(input, [{ ...original[0], [field]: 'changed' }, original[1]], original).data.value;
        assert.equal(edited[0].id, original[0].id); assert.equal(edited[0].label, 'Keep');
        const reordered = writeControlRows(input, [original[1], original[0]], original).data.value;
        assert.equal(reordered[0].id, original[1].id);
        assert.equal(writeControlRows(input, [original[0], original[0]]).ok, false);
        assert.equal(writeControlRows(input, Array.from({ length: max }, (_, i) => ({ ...original[0], id: 'row-' + i }))).ok, true);
        assert.equal(writeControlRows(input, Array.from({ length: max + 1 }, (_, i) => ({ ...original[0], id: 'row-' + i }))).ok, false);
    }
    for (const operation of ['join', 'collect', 'context-join']) {
        const input = spec(operation, 'inputs');
        const rows = [{ id: 'one', label: 'One', ...(operation !== 'context-join' ? { required: false } : {}) }];
        assert.equal(writeControlRows(input, rows).ok, operation !== 'context-join');
        assert.equal(writeControlRows(input, Array.from({ length: 16 }, (_, i) => ({ ...rows[0], id: 'slot-' + i }))).ok, true);
        assert.equal(writeControlRows(input, Array.from({ length: 17 }, (_, i) => ({ ...rows[0], id: 'slot-' + i }))).ok, false);
    }
    const fields = [{ name: 'Optional', path: ['a.b,c', 0], required: false, default: null }];
    assert.deepEqual(writeControlRows(spec('format', 'fields'), fields).data.value, fields);
});

test('wave-one projection selects friendly editors for every list and existing row family', async () => {
    const { projectNodeControls } = await import('../src/ui/node-control-projection.js');
    for (const [operation, key, structured] of [['pattern','rules','patterns'],['extract','patterns','extract'],['join','inputs','slots'],['collect','inputs','slots'],['context-join','inputs','slots'],['format','fields','fields'],['select-fields','fields','fields'],['compose','sections','sections'],['text-rules','rules','rules']]) {
        const field = projectNodeControls(operation, {}, {}).find(control => control.key === key);
        assert.equal(field?.structured, structured, operation + '.' + key);
    }
    const hotkey = projectNodeControls('hotkey-arm', {}, {}).find(control => control.key === 'hotkey').inputSpec;
    for (const code of ['KeyR','Space','F13']) assert.equal(contracts.parseControlInput(hotkey, { format:'rows', value:{code,ctrl:true,alt:false,shift:false,meta:false} }).ok, false);
    assert.equal(contracts.parseControlInput(hotkey, { format:'rows', value:{code:'KeyM',ctrl:false,alt:false,shift:true,meta:false} }).ok, false);
    assert.equal(contracts.parseControlInput(hotkey, { format:'rows', value:{code:'F12',ctrl:false,alt:false,shift:false,meta:false} }).ok, true);
});


test('row adapters reject duplicate map names and hostile row data without silently collapsing them',async()=>{
 const {writeControlRows}=await import('../src/ui/control-input-adapters.js');const {projectNodeControls}=await import('../src/ui/node-control-projection.js');
 const spec=projectNodeControls('state',{mode:'value'},{}).find(row=>row.key==='updates').inputSpec;
 assert.equal(writeControlRows(spec,[{name:'same',number:1},{name:'same',number:2}]).ok,false);
 let touched=false;const row=Object.defineProperty({name:'value'},'number',{enumerable:true,get(){touched=true;return 1;}});
 assert.equal(writeControlRows(spec,[row]).ok,false);assert.equal(touched,false);
});


test('prepared exact helper choices expose inspected roles and available profiles without rewriting pins',async()=>{
 const {iterationHelperChoices}=await import('../src/ui/configured-node-creation.js');const {computeDefinitionIdentity,definitionRefKey}=await import('../src/workflow/definition-data.js');
 const raw={id:'pinned',version:1,name:'Pinned decision',interface:[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'}],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',roles:{decision:{profileId:null,model:null}},nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'},decide:{id:'decide',type:'workflow',operation:'decision',questions:{answer:{type:'noul',instructions:'Check the item.'}}}},wires:{a:{id:'a',route:'wire',from:'entry',fromPort:'out',to:'decide',toPort:'in'},b:{id:'b',route:'wire',from:'decide',fromPort:'out',to:'exit',toPort:'in'}}}};
 const identity=computeDefinitionIdentity(raw);assert.equal(identity.ok,true);const definition={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},ref={id:definition.id,version:definition.version,semanticHash:definition.semanticHash};
 const root={definitions:{[definitionRefKey(ref)]:definition},roles:{}},before=structuredClone(root),choices=iterationHelperChoices(root,[{id:'chosen',name:'Chosen connection'}]);
 assert.equal(choices.length,1);assert.deepEqual(choices[0].ref,ref);assert.deepEqual(choices[0].bindings.roles.map(row=>row.role),['decision']);assert.deepEqual(choices[0].bindings.roles[0].profile.options,[{value:'chosen',label:'Chosen connection'}]);assert.deepEqual(root,before);
});


test('Pattern shared admission matches Unicode regex syntax and 128-character labels, retaining Extract 2048',()=>{
 const spec=mode=>contracts.resolveControlInputSpec({operation:'pattern',controls:{mode},key:'rules',descriptor:{type:'array',items:'record',max:128,default:[]}});
 for(const format of ['rows','json','plain','csv']){
  const result=contracts.parseControlInput(spec('regex'),format==='rows'?{format,value:[{id:'x',pattern:'['}]}:{format,text:format==='json'?'[{"id":"x","pattern":"["}]':'['});
  assert.equal(result.ok,false,'invalid regex '+format);
 }
 assert.equal(contracts.parseControlInput(spec('literal'),{format:'rows',value:[{id:'x',pattern:'[',label:'x'.repeat(128)}]}).ok,true);
 assert.equal(contracts.parseControlInput(spec('literal'),{format:'rows',value:[{id:'x',pattern:'literal',label:'x'.repeat(129)}]}).ok,false);
 const extract=contracts.resolveControlInputSpec({operation:'extract',key:'patterns',descriptor:{type:'array',items:'record',max:64,default:[]}});
 assert.equal(contracts.parseControlInput(extract,{format:'rows',value:[{id:'x',literal:'[',label:'x'.repeat(2048)}]}).ok,true);
});


test('exhaustive dynamic catalog projection covers all 33 structured operation families and every declared visibility branch',async()=>{
 const {OPERATIONS,operationFor}=await import('../src/workflow/catalog.js');const {projectNodeControls}=await import('../src/ui/node-control-projection.js');const {introspectionDefaults}=await import('../src/workflow/introspection/native.js');
 const expected=['smart-compactor','pattern','filter-text','repair','compose','text-rules','json-decode','select-fields','style-transfer','format-transfer','terminology-map','context','state','condition','join','collect','confidence-gate','for-each','decision','extract','model-call','revise-draft','format','read-file','write-file','project-document','time-trigger','advance-time','item-mention-trigger','collection','recall','hotkey-arm','context-join'].sort(),exposed=new Set(),seen=new Set();
 for(const [operation,entry]of Object.entries(OPERATIONS)){
  const dimensions=new Map(Object.entries(entry.controlDescriptors).filter(([,d])=>d.type==='enum').map(([k,d])=>[k,d.values]));
  for(const d of Object.values(entry.controlDescriptors))if(d.visibleWhen){const values=dimensions.get(d.visibleWhen.key)??[entry.defaults[d.visibleWhen.key]];dimensions.set(d.visibleWhen.key,[...new Set([...values,d.visibleWhen.value])]);}
  let variants=[{}];for(const [key,values]of dimensions)variants=variants.flatMap(base=>values.map(value=>({...base,[key]:value})));
  for(const variant of variants){const defaults=['state','context','memory'].includes(operation)?introspectionDefaults(operation,variant.mode):entry.defaults,controls={...defaults,...variant};
   for(const phase of ['pre','post']){
    const effective=operationFor({type:'workflow',operation,...controls},{phase})??entry;
    const fields=projectNodeControls(operation,controls,{phase});
    for(const field of fields){if(!['json','lines'].includes(field.editor))continue;exposed.add(operation);seen.add(field.inputSpec.id);
     assert.ok(['list','path','rows','value','schema','questions','schedules','hotkey','helper'].includes(field.inputSpec.editor),operation+'.'+field.key);
     const resolved=contracts.resolveControlInputSpec({operation,controls,key:field.key,descriptor:effective.controlDescriptors[field.key]});assert.deepEqual(field.inputSpec,resolved);
    }
   }
  }
 }
 assert.deepEqual([...exposed].sort(),expected);
 for(const id of ['state.updates:value','state.durations:curve','context.pins:focus','condition.value','filter-text.protectedLiterals'])assert.ok(seen.has(id),id);
 for(const type of ['array','object','json-value'])assert.throws(()=>contracts.resolveControlInputSpec({operation:'future-operation',key:'future',descriptor:{type,default:null}}),/Declare an input contract/);
 assert.equal(contracts.parseControlInput(projectNodeControls('condition',{value:null},{}).find(x=>x.key==='value').inputSpec,{format:'rows',value:null}).data.value,null);
});
