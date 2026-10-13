import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as transpose from '../src/workflow/operations/transpose-nodes.js';
import { validatePatches } from '../src/workflow/repair.js';
const must = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result.data; };

test('Style Transfer describes native post ports and bounded integration metadata', () => {
    const { descriptor, ports } = must(transpose.describeTranspose({ operation: 'style-transfer' }));
    assert.equal(descriptor.family, 'Transpose'); assert.equal(descriptor.phase, 'post');
    assert.equal(descriptor.operationVersion, 1); assert.equal(descriptor.terminal, false);
    assert.equal(descriptor.requestBound, 1); assert.equal(descriptor.modelRole, 'Prose');
    assert.equal(descriptor.defaults.scope, 'narration');
    assert.deepEqual(ports.map(({ id, direction, kind, required, cardinality }) => [id, direction, kind, required, cardinality]), [
        ['in', 'input', 'draft', true, 'one'], ['reference', 'input', 'text', true, 'one'],
        ['context', 'input', 'context', false, 'one'], ['out', 'output', 'patches', false, 'one'],
    ]);
});

test('effective reference ports, version and post phase reject stale envelopes without getters', () => {
    assert.equal(must(transpose.describeTranspose({ operation: 'style-transfer', referenceKind: 'data', operationVersion: 1, phase: 'post' })).ports[1].kind, 'data');
    assert.equal(must(transpose.describeTranspose({ operation: 'terminology-map' })).descriptor.requestBound, 0);
    let reads = 0;
    const node = { operation: 'format-transfer' };
    Object.defineProperty(node, 'unrelated', { get() { reads++; throw new Error('unread'); } });
    assert.equal(transpose.describeTranspose(node).ok, true);
    for (const bad of [null, Object.create({ operation: 'style-transfer' }), { operation: 'toString' }, { operation: 'style-transfer', phase: 'pre' }, { operation: 'style-transfer', operationVersion: 2 }, { operation: 'style-transfer', referenceKind: 'context' }, Object.defineProperty({}, 'operation', { enumerable: true, get() { reads++; return 'style-transfer'; } })]) {
        assert.equal(transpose.describeTranspose(bad).ok, false);
    }
    assert.equal(reads, 0);
});

test('all declared controls enforce typed bounds and metadata defaults cannot leak mutations', () => {
    const controls = must(transpose.describeTranspose({ operation: 'style-transfer' })).descriptor.controlDescriptors;
    assert.equal(controls.find(control => control.key === 'instructions').maxLength, 10000);
    assert.equal(controls.find(control => control.key === 'maxTokens').maximum, 65536);
    assert.equal(controls.find(control => control.key === 'protectedLiterals').maxItems, 128);
    const cases = [{ scope: 'everyone' }, { protectedLiterals: new Array(1) }, { protectedLiterals: [''] }, { protectedLiterals: ['x'.repeat(2049)] }, { protectedLiterals: Array.from({ length: 129 }, (_, i) => String(i)) }, { strength: 'strong' }, { instructions: 'x'.repeat(10001) }, { maxTokens: 0 }, { maxTokens: 65537 }, { maxTokens: 1.5 }, { mode: 'dialogue' }];
    let reads = 0;
    const pins = ['pin']; Object.defineProperty(pins, 0, { enumerable: true, get() { reads++; return 'pin'; } });
    cases.push({ protectedLiterals: pins }, Object.defineProperty({}, 'scope', { enumerable: true, get() { reads++; return 'whole'; } }));
    for (const bad of cases) assert.equal(transpose.describeTranspose(Object.defineProperties({ operation: 'style-transfer' }, Object.getOwnPropertyDescriptors(bad))).ok, false);
    for (const bad of [{ caseSensitive: 'false' }, { match: 'regex' }]) assert.equal(transpose.describeTranspose({ operation: 'terminology-map', ...bad }).ok, false);
    assert.equal(reads, 0);
    const copy = must(transpose.describeTranspose({ operation: 'style-transfer' })).descriptor;
    copy.defaults.protectedLiterals.push('later'); copy.controlDescriptors[0].options.push('later');
    assert.deepEqual(transpose.TRANSPOSE_OPERATIONS['style-transfer'].defaults.protectedLiterals, []);
    assert.equal(Object.isFrozen(transpose.TRANSPOSE_OPERATIONS['style-transfer'].controlDescriptors[0].options), true);
    assert.equal(transpose.describeTranspose({ operation: 'style-transfer', instructions: 'x'.repeat(10000), maxTokens: 65536, protectedLiterals: ['valid'] }).ok, true);
});
const rawDraft = text => ({ kind: 'draft', text, source: { originalText: text, token: 'source-token', revision: { swipe: 2 } } });
const candidate = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); const validated = validatePatches(result.artifact); assert.equal(validated.ok, true); return validated.artifact.text; };
const services = (text, extra = {}) => ({ binding: {}, countTokens: async () => ({ tokens: 3 }), request: async () => ({ ok: true, data: { text, finish: 'stop' } }), ...extra });

test('Style Transfer wraps real patches, maps named context and preserves opaque authority and source', async () => {
    const draft = rawDraft('old prose'); const before = structuredClone(draft);
    const binding = new Proxy({}, { get() { throw new Error('opaque'); }, ownKeys() { throw new Error('opaque'); } });
    let calls = 0, counts = 0;
    const context = { kind: 'context', messages: [{ id: 'm', role: 'user', text: 'named context' }] };
    const result = await transpose.executeTranspose({ operation: 'style-transfer', maxTokens: 17 }, { in: draft, reference: { kind: 'text', text: 'example' }, context }, services('new prose', {
        binding, countTokens: async () => { counts++; return { tokens: 3 }; }, request: async request => {
            calls++; assert.equal(request.binding, binding); assert.equal(request.maxTokens, 17);
            const prompt = JSON.parse(request.messages[1].content);
            assert.deepEqual(prompt.context, context.messages); assert.equal(prompt.controls.scope, 'narration');
            assert.equal(JSON.stringify(prompt).includes('source-token'), false);
            return { ok: true, data: { text: 'new prose', finish: 'stop' } };
        },
    }));
    assert.equal(candidate(result), 'new prose'); assert.equal(calls, 1); assert.equal(counts, 1);
    assert.deepEqual(draft, before); assert.deepEqual(JSON.parse(JSON.stringify(result.artifact.draft.source)), draft.source);
    assert.equal(result.reports.at(-1).requestCount, 1); assert.equal(result.reports.at(-1).semanticPreservation, 'review-dependent');
});

test('stale, extra, missing, inherited, getter and wrong-kind named inputs fail before any effects', async () => {
    let effects = 0, reads = 0;
    const inputs = { in: rawDraft('old prose'), reference: { kind: 'text', text: 'example' } };
    const getter = Object.defineProperty({}, 'in', { enumerable: true, get() { reads++; return inputs.in; } });
    const cases = [null, {}, { in: inputs.in }, { reference: inputs.reference }, { ...inputs, obsolete: inputs.reference }, { ...inputs, out: inputs.in }, { ...inputs, in: { kind: 'text', text: 'old prose' } }, { ...inputs, reference: { kind: 'data', value: { sample: 'x' } } }, { ...inputs, context: { kind: 'text', text: 'context' } }, Object.create(inputs), Object.assign(getter, { reference: inputs.reference })];
    const execution = services('new prose', { countTokens: async () => { effects++; return { tokens: 1 }; }, request: async () => { effects++; return { ok: true, data: { text: 'new prose', finish: 'stop' } }; } });
    for (const bad of cases) { const result = await transpose.executeTranspose({ operation: 'style-transfer' }, bad, execution); assert.equal(result.ok, false); assert.equal(result.artifact, undefined); }
    assert.equal(effects, 0); assert.equal(reads, 0);
    assert.equal((await transpose.executeTranspose({ operation: 'style-transfer', referenceKind: 'data' }, inputs, execution)).ok, false);
    assert.equal((await transpose.executeTranspose({ operation: 'style-transfer' }, inputs, { ...execution, phase: 'pre' })).error.code, 'INVALID_PHASE');
    assert.equal(effects, 0);
});

test('Format uses one request while Terminology consumes Data with zero authority reads', async () => {
    let formatCalls = 0, authorityReads = 0;
    const format = await transpose.executeTranspose({ operation: 'format-transfer', referenceKind: 'data', scope: 'whole' }, {
        in: rawDraft('one\ntwo'), reference: { kind: 'data', value: { requiredContent: ['one', 'two'], layout: 'one per heading' } },
    }, services('one\n\ntwo', { request: async request => { formatCalls++; assert.equal(JSON.parse(request.messages[1].content).controls.kind, 'format'); return { ok: true, data: { text: 'one\n\ntwo', finish: 'end_turn' } }; } }));
    assert.equal(candidate(format), 'one\n\ntwo'); assert.equal(formatCalls, 1);
    const execution = { phase: 'post' };
    for (const key of ['request', 'countTokens', 'binding', 'signal', 'provider', 'resolveBinding']) Object.defineProperty(execution, key, { enumerable: true, get() { authorityReads++; throw new Error('unread'); } });
    const draft = rawDraft('old term and "old term"'); const before = structuredClone(draft);
    const inputs = { in: draft, reference: { kind: 'data', value: { entries: [{ from: 'old term', to: 'new term' }] } } };
    const mapped = await transpose.executeTranspose({ operation: 'terminology-map' }, inputs, execution);
    assert.equal(candidate(mapped), 'new term and "old term"');
    assert.equal(mapped.reports.at(-1).count, 1); assert.equal(authorityReads, 0); assert.deepEqual(draft, before);
    assert.equal((await transpose.executeTranspose({ operation: 'terminology-map' }, { ...inputs, context: { kind: 'context', messages: [] } }, execution)).ok, false);
    assert.equal(authorityReads, 0);
});

test('injected execution controls are own typed ports and unrelated authorities stay unread', async () => {
    let effects = 0, reads = 0;
    const inputs = { in: rawDraft('old prose'), reference: { kind: 'text', text: 'example' } };
    const execution = services('new prose', { request: async () => { effects++; return { ok: true, data: { text: 'new prose', finish: 'stop' } }; } });
    Object.defineProperty(execution, 'resolveBinding', { get() { reads++; throw new Error('unread'); } });
    assert.equal(candidate(await transpose.executeTranspose({ operation: 'style-transfer' }, inputs, execution)), 'new prose');
    assert.equal(reads, 0); assert.equal(effects, 1); effects = 0;
    for (const bad of [{ signal: 'aborted' }, { request: 1 }, { countTokens: {} }, Object.defineProperty({}, 'binding', { enumerable: true, get() { reads++; return {}; } }), Object.defineProperty({}, 'phase', { enumerable: true, get() { reads++; return 'post'; } })]) {
        const options = Object.defineProperties({ ...execution }, Object.getOwnPropertyDescriptors(bad));
        assert.equal((await transpose.executeTranspose({ operation: 'style-transfer' }, inputs, options)).ok, false);
    }
    assert.equal(reads, 0); assert.equal(effects, 0);
});

test('style mode leaves narration scope explicit while presets and existing spans only narrow permissions', async () => {
    const text = 'old prose "old voice"';
    const inputs = { in: rawDraft(text), reference: { kind: 'text', text: 'voice example' } };
    for (const mode of ['narration', 'character-voice', 'rhythm', 'register']) {
        assert.equal(candidate(await transpose.executeTranspose({ operation: 'style-transfer', mode }, inputs, services('new prose "old voice"'))), 'new prose "old voice"');
        const outOfScope = await transpose.executeTranspose({ operation: 'style-transfer', mode }, inputs, services('old prose "new voice"'));
        assert.equal(outOfScope.ok, false); assert.equal(outOfScope.artifact, undefined);
    }
    assert.equal(candidate(await transpose.executeTranspose({ operation: 'style-transfer', mode: 'character-voice', scope: 'dialogue' }, inputs, services('old prose "new voice"'))), 'old prose "new voice"');
    const draft = { ...rawDraft(text), spans: [{ index: 0, start: 0, end: 9, text: 'old prose' }] };
    const widened = await transpose.executeTranspose({ operation: 'style-transfer', scope: 'whole' }, { ...inputs, in: draft }, services('new prose "new voice"'));
    assert.equal(widened.ok, false);
    const valid = await transpose.executeTranspose({ operation: 'style-transfer', scope: 'whole' }, { ...inputs, in: draft }, services('new prose "old voice"'));
    assert.equal(candidate(valid), 'new prose "old voice"');
    assert.deepEqual(JSON.parse(JSON.stringify(valid.artifact.draft.spans)), draft.spans);
    let calls = 0;
    const noPermission = await transpose.executeTranspose({ operation: 'style-transfer', scope: 'authorized' }, inputs, services('new prose "old voice"', { countTokens: async () => { calls++; return { tokens: 1 }; } }));
    assert.equal(noPermission.error.code, 'SCOPE_REQUIRED'); assert.equal(calls, 0);
    const noWindows = await transpose.executeTranspose({ operation: 'style-transfer' }, { ...inputs, in: { ...rawDraft(text), spans: [] } });
    assert.equal(candidate(noWindows), text); assert.equal(noWindows.reports.at(-1).requestCount, 0);
});


test('duplicate protected literals retain the helper unique-pin semantics', async () => {
    const result = await transpose.executeTranspose({ operation: 'style-transfer', protectedLiterals: ['pin', 'pin'] }, { in: rawDraft('old prose pin'), reference: { kind: 'text', text: 'example' } }, services('new prose pin'));
    assert.equal(candidate(result), 'new prose pin');
    assert.deepEqual(result.artifact.protectedLiterals, ['pin']);
});

test('public Transpose metadata detaches every mutable nested field while catalog metadata stays bounded', async () => {
    const { describeOperation } = await import('../src/workflow/catalog.js?v=0.27.1');
    const node = { type: 'workflow', operation: 'style-transfer', inputKind: 'text', phase: 'pre' };
    const first = must(transpose.describeTranspose(node)).descriptor;
    const untouched = must(transpose.describeTranspose(node)).descriptor;
    assert.notEqual(first.controls, untouched.controls);
    assert.notEqual(first.defaults.protectedLiterals, untouched.defaults.protectedLiterals);
    first.controls.push('caller-only');
    first.defaults.protectedLiterals.push('caller-only');
    first.controlDescriptors.find(control => control.key === 'scope').options.push('caller-only');
    first.controlDescriptors.find(control => control.key === 'protectedLiterals').items.maxLength = 1;
    assert.deepEqual(must(transpose.describeTranspose(node)).descriptor, untouched);
    assert.deepEqual(untouched.controlDescriptors.find(control => control.key === 'inputKind').options, ['text']);
    const clone = globalThis.structuredClone; let descriptorClones = 0;
    globalThis.structuredClone = (value, ...args) => { if (value?.id === 'style-transfer') descriptorClones++; return clone(value, ...args); };
    try {
        assert.equal(describeOperation({ schema: 3, runtime: 2, mode: 'native-unified' }, node).ok, true);
        node.scope = 'invalid';
        assert.equal(describeOperation({ schema: 3, runtime: 2, mode: 'native-unified' }, node).ok, false, 'mutable node controls must still be validated on every description');
        assert.equal(descriptorClones, 0, 'catalog never clones a whole operation descriptor');
    } finally { globalThis.structuredClone = clone; }
});
