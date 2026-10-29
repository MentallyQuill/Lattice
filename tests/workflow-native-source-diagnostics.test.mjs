import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unifiedRecipeHost } from './helpers/unified-recipe-host.mjs';
import { safeError } from '../src/workflow/record-data.js?v=0.30.2';
import { presentDiagnostic } from '../src/ui/diagnostics.js?v=0.30.2';

const graph = {
    id: 'source-diagnostics', schema: 3, runtime: 2, mode: 'native-unified',
    nodes: {
        send: { id: 'send', type: 'workflow', operation: 'on-send' },
        generate: { id: 'generate', type: 'workflow', operation: 'generate-reply' },
        review: { id: 'review', type: 'workflow', operation: 'review-publish' },
    },
    wires: {
        activation: { id: 'activation', route: 'wire', from: 'send', fromPort: 'activation', to: 'generate', toPort: 'activation' },
        draft: { id: 'draft', route: 'wire', from: 'generate', fromPort: 'draft', to: 'review', toPort: 'draft' },
    },
    portals: {}, definitions: {}, runTargets: [{ instancePath: [], nodeId: 'review' }],
};
const prior = { mes: 'PRIVATE_SOURCE_SENTINEL', is_user: false, extra: {}, swipe_id: 1, swipes: ['PRIVATE_SOURCE_SENTINEL'] };
const cases = [
    ['normal', {}, 'USER_MESSAGE_REQUIRED', /user message/],
    ['swipe', { is_user: true }, 'ASSISTANT_REPLY_REQUIRED', /assistant reply/],
    ['swipe', { role: 'tool' }, 'ASSISTANT_REPLY_REQUIRED', /assistant reply/],
    ['swipe', { extra: { isSmallSys: true } }, 'ASSISTANT_REPLY_REQUIRED', /assistant reply/],
    ['swipe', { mes: '...' }, 'ASSISTANT_REPLY_INCOMPLETE', /unfinished/],
    ['swipe', { gen_started: '2026-10-25T00:00:00Z' }, 'ASSISTANT_REPLY_INCOMPLETE', /unfinished/],
    ['swipe', { extra: { partial: true } }, 'ASSISTANT_REPLY_INCOMPLETE', /unfinished/],
    ['swipe', { is_intermediate: true }, 'ASSISTANT_REPLY_INCOMPLETE', /unfinished/],
    ['swipe', { mes: '   ' }, 'ASSISTANT_TEXT_REQUIRED', /complete.*reply/],
    ['swipe', { extra: { tool_calls: [{}] } }, 'TOOL_REPLY_UNSUPPORTED', /tool output/],
    ['swipe', { extra: { image: 'PRIVATE_IMAGE_SENTINEL' } }, 'MEDIA_REPLY_UNSUPPORTED', /media/],
    ['swipe', { swipes: undefined }, 'SWIPE_HISTORY_REQUIRED', /swipe history/],
    ['swipe', { swipes: [] }, 'SWIPE_HISTORY_REQUIRED', /swipe history/],
];

for (const [generationType, overrides, sourceReason, actionable] of cases) {
    test(`native source ${generationType}/${sourceReason} retains a safe actionable cause without model work (${JSON.stringify(overrides)})`, async () => {
        const f = unifiedRecipeHost(graph, {
            configureContext(c) { c.chat = [{ ...structuredClone(prior), ...overrides }]; },
            request() { assert.fail('Unsupported native sources must not dispatch model requests.'); },
        });
        const before = structuredClone(f.c.chat);
        try {
            await f.c.eventSource.emit('GENERATION_STARTED', generationType, {}, false);
            const result = await f.controller.beforeGenerate(f.c.chat.map(m => ({ ...m })), 8192, () => {}, generationType);
            assert.equal(result.error?.code, 'UNSUPPORTED_NATIVE_SOURCE');
            assert.deepEqual(result.error.details, { generationType, sourceReason });
            assert.equal(result.actualCalls, 0);
            assert.equal(f.calls(), 0);
            assert.equal(result.fallback, 'native');
            assert.deepEqual(f.c.chat, before);
            assert.match(result.error.message, actionable);
            assert.doesNotMatch(JSON.stringify(result.error), /PRIVATE_/);
            const diagnostic = presentDiagnostic(result.error);
            assert.notEqual(diagnostic.id.split('-')[0], 'unknown');
            assert.match(diagnostic.message, actionable);
            assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE_/);
        } finally { f.controller.dispose(); }
    });
}

test('native source details retain only the enumerated generation type and reason', () => {
    const checked = safeError({ code: 'UNSUPPORTED_NATIVE_SOURCE', message: 'Safe source failure.', details: { generationType: 'swipe', sourceReason: 'SWIPE_HISTORY_REQUIRED', text: 'PRIVATE_DETAIL_SENTINEL' } });
    assert.deepEqual(checked.details, { generationType: 'swipe', sourceReason: 'SWIPE_HISTORY_REQUIRED' });
    for (const details of [
        { generationType: 'PRIVATE_TYPE', sourceReason: 'SWIPE_HISTORY_REQUIRED' },
        { generationType: 'swipe', sourceReason: 'PRIVATE_REASON'.repeat(1000) },
        { generationType: 'normal', sourceReason: 'SWIPE_HISTORY_REQUIRED' },
        { generationType: 'swipe', sourceReason: 'USER_MESSAGE_REQUIRED' },
    ]) assert.equal(safeError({ code: 'UNSUPPORTED_NATIVE_SOURCE', message: 'Safe source failure.', details }).details, undefined);
    assert.equal(safeError({ code: 'UNRELATED', message: 'Safe source failure.', details: checked.details }).details, undefined);
});

test('native diagnostic details never invoke getters or expose unknown detail values', () => {
    let reads = 0;
    const details = { generationType: 'swipe', get sourceReason() { reads++; return 'SWIPE_HISTORY_REQUIRED'; } };
    assert.equal(safeError({ code: 'UNSUPPORTED_NATIVE_SOURCE', message: 'Safe source failure.', details }).details, undefined);
    const raw = { code: 'UNSUPPORTED_NATIVE_SOURCE', message: 'PRIVATE_UNTRUSTED_MESSAGE', get details() { reads++; return details; } };
    assert.equal(safeError(raw).details, undefined);
    const proxy = new Proxy({}, { getPrototypeOf() { throw Error('PRIVATE_PROXY'); } });
    assert.equal(safeError({ code: 'UNSUPPORTED_NATIVE_SOURCE', message: 'Safe source failure.', details: proxy }).details, undefined);
    assert.equal(reads, 0);
    const presented = presentDiagnostic(raw);
    assert.match(presented.message, /user message|assistant reply/);
    assert.doesNotMatch(JSON.stringify(presented), /PRIVATE_/);
});

test('schema mismatch explains valid JSON with a wrong data shape without raw model data', () => {
    const presented = presentDiagnostic({ code: 'SCHEMA_MISMATCH', message: 'PRIVATE_MODEL_OUTPUT' });
    assert.match(presented.message, /valid JSON/);
    assert.match(presented.message, /schema/);
    assert.match(presented.message, /field|type/);
    assert.doesNotMatch(presented.message, /model returned/i, 'JSON Decode can also validate authored or connected Data.');
    assert.doesNotMatch(JSON.stringify(presented), /PRIVATE_/);
});
