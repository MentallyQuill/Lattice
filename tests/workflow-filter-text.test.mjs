import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as filter from '../src/workflow/operations/filter-text.js';
import { scanPatternDraft } from '../src/workflow/operations/pattern-engine.js?v=0.27.0';
import { appendDraftSections, readDraftBody, snapshotDraft } from '../src/workflow/draft-revisions.js?v=0.27.0';

const draft = text => ({ kind: 'draft', text, source: { originalText: text } });
const controls = extra => ({ action: 'remove', unit: 'paragraph', scope: 'whole', protectedLiterals: [], ...extra });
const scan = (input, words = ['Elara'], extra = {}) => scanPatternDraft(input, { mode: 'literal', scope: 'whole', caseSensitive: false, rules: words.map((pattern, index) => ({ id: String(index), pattern })), exemptions: [], protectedLiterals: [], matchPolicy: 'any', minOccurrences: 1, regexFlags: '', timeoutMs: 1000, ...extra });
async function run(input, words = ['Elara'], settings = {}, pattern = {}) {
    const scanned = await scan(input, words, pattern);
    assert.equal(scanned.ok, true, JSON.stringify(scanned.error));
    return filter.filterPatternDraft(input, scanned.outputs.matches, controls(settings), { nodeId: 'filter' });
}
const unresolved = (result, code) => {
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.outputs.out, undefined);
    assert.equal(result.outputStates.out.status, 'unresolved');
    assert.equal(result.outputStates.out.reason.code, code);
    assert.ok(result.outputs.report.value.diagnostics.some(item => item.code === code));
};

test('line and paragraph units own hand-derived original delimiters', () => {
    for (const [body, unit, expected] of [
        ['A\r\nB\rC\nD', 'line', [[0,3],[3,5],[5,7],[7,8]]],
        ['\nA\n \t\nB\r\n\r\n', 'paragraph', [[0,6],[6,11]]],
        ['A\n\nB', 'paragraph', [[0,3],[3,4]]],
        ['A\n\n', 'paragraph', [[0,3]]],
        [' \t\r\n', 'line', [[0,4]]],
        [' \t\r\n', 'paragraph', []],
        ['', 'line', []],
    ]) assert.deepEqual(filter.selectFilterUnits(body, unit).map(item => [item.start,item.end]), expected);
});

test('paragraph remove deduplicates repeated hits and retains exact CRLF', async () => {
    const input = draft('First.\r\n\r\nElara arrives.\r\n\r\nLast.');
    const result = await run(input, ['Elara', 'arrives']);
    assert.equal(result.ok, true);
    assert.equal(result.outputs.out.text, 'First.\r\n\r\nLast.');
    assert.deepEqual(result.outputs.report.value.units, [{ start: 10, end: 28, text: 'Elara arrives.\r\n\r\n', blocked: false }]);
    assert.equal(result.outputs.report.value.resultBodyLength, 15);
    assert.equal(result.outputs.report.value.retainedUnitCount, 2);
    assert.equal(snapshotDraft(result.outputs.out).ok, true);
    assert.equal(result.outputs.out.lineage.at(-1).nodeId, 'filter');
    assert.equal(input.text, 'First.\r\n\r\nElara arrives.\r\n\r\nLast.');
});

test('keep deletes nonmatching units and lines retain LF CR and final unterminated ownership', async () => {
    for (const [body, settings, expected] of [
        ['First.\nElara', { unit: 'line' }, 'First.\n'],
        ['First.\rElara\rLast.', { unit: 'line' }, 'First.\rLast.'],
        ['First.\r\nElara\r\nLast.', { unit: 'line' }, 'First.\r\nLast.'],
        ['\nFirst.\n\nElara\n \t\nLast.\n\n', { action: 'keep' }, 'Elara\n \t\n'],
        ['First.\nElara\nLast.', { action: 'keep', unit: 'line' }, 'Elara\n'],
    ]) {
        const result = await run(draft(body), ['Elara'], settings);
        assert.equal(result.ok, true); assert.equal(result.outputs.out.text, expected);
    }
});

test('remove with no hit is exact passthrough and keep/blank results retain removal previews', async () => {
    const input = draft('First.\nLast.');
    const noHit = await run(input);
    assert.equal(noHit.outputs.out, input); assert.deepEqual(noHit.outputs.report.value.units, []);
    const empty = await run(input, ['Elara'], { action: 'keep' });
    unresolved(empty, 'EMPTY_FILTER_RESULT');
    assert.deepEqual(empty.outputs.report.value.units.map(item => item.text), ['First.\nLast.']);
    assert.equal(empty.outputs.report.value.resultBodyLength, 0);
    const blank = await run(draft('Elara\n \t'), ['Elara'], { unit: 'line' });
    unresolved(blank, 'EMPTY_FILTER_RESULT'); assert.equal(blank.outputs.report.value.resultBodyLength, 2);
});

test('assembled presentation and ancestry survive exact filtering', async () => {
    const assembled = appendDraftSections(draft('First.\n\nElara\n\nLast.'), [{ id: 'notes', text: 'Elara " notes' }], { nodeId: 'append', separator: '\r\n--\r\n' });
    const input = assembled.data.draft, result = await run(input);
    assert.equal(result.outputs.out.text, 'First.\n\nLast.\r\n--\r\nElara " notes');
    assert.equal(readDraftBody(result.outputs.out).data.text, 'First.\n\nLast.');
    assert.equal(result.outputs.out.rootRevisionId, input.rootRevisionId);
    assert.equal(result.outputs.out.lineage.at(-1).parentId, input.revisionId);
    assert.deepEqual(result.outputs.out.presentationSections.map(section => [section.id, section.text]), [['notes', 'Elara " notes']]);
});

test('only the fresh direct bound report is accepted before generic cloning', async () => {
    const input = draft('First.\n\nElara\n\nLast.'), scanned = await scan(input);
    const bound = scanned.outputs.matches;
    assert.equal(filter.filterPatternDraft(input, bound, controls(), { nodeId: 'filter' }).ok, true);
    for (const value of [{ kind: 'data', value: structuredClone(bound.value) }, { kind: 'data', value: {} }, { kind: 'data', get value() { throw new Error('getter must not run'); } }]) {
        const result = filter.filterPatternDraft(input, value, controls(), { nodeId: 'filter' });
        assert.equal(result.error.code, 'INVALID_MATCH_REPORT'); assert.equal(result.outputs, undefined);
    }
    assert.equal(filter.filterPatternDraft(structuredClone(input), bound, controls(), { nodeId: 'filter' }).error.code, 'STALE_MATCH_REPORT');
    for (const mutate of [item => { item.source.originalText = 'changed'; }, item => { item.spans = []; }, item => { item.protectedLiterals = ['First.']; }, item => { item.text += '!'; }]) {
        const source = draft('First.\n\nElara\n\nLast.'), report = await scan(source); mutate(source);
        assert.equal(filter.filterPatternDraft(source, report.outputs.matches, controls(), { nodeId: 'filter' }).error.code, 'STALE_MATCH_REPORT');
    }
    const unresolvedScan = await scan(draft('First " Elara'), ['Elara'], { scope: 'dialogue' });
    assert.equal(filter.filterPatternDraft(unresolvedScan.outputs.out, unresolvedScan.outputs.matches, controls(), { nodeId: 'filter' }).error.code, 'INVALID_MATCH_REPORT');
});

test('whole-unit permission failures identify every proposed deletion without partial output', async () => {
    const body = 'Safe Elara.\n\nLocked Elara.\n\nLast.';
    const input = { ...draft(body), spans: [{ index: 0, start: 0, end: 13, text: 'Safe Elara.\n\n' }] };
    const result = await run(input);
    unresolved(result, 'FILTER_PERMISSION_BLOCKED');
    assert.deepEqual(result.outputs.report.value.units.map(item => item.blocked), [false, true]);
    assert.deepEqual(result.outputs.report.value.units.map(item => item.text), ['Safe Elara.\n\n', 'Locked Elara.\n\n']);
    assert.equal(input.text, body);
});

test('unioned Draft Pattern and Filter protections block crossing units independently of hit flags', async () => {
    for (const origin of ['draft', 'pattern', 'filter']) {
        const input = draft('First.\n\nElara protected.\n\nLast.');
        if (origin === 'draft') input.protectedLiterals = ['protected'];
        const result = await run(input, ['Elara'], origin === 'filter' ? { protectedLiterals: ['protected'] } : {}, origin === 'pattern' ? { protectedLiterals: ['protected'] } : {});
        unresolved(result, 'FILTER_PERMISSION_BLOCKED');
        assert.equal(result.outputs.report.value.units[0].blocked, true);
    }
});

test('stored and scan exemptions retain independent case policies at unit boundaries', async () => {
    const body = 'First.\n\nElara PIN.\n\nLast.';
    for (const [scanCase, wantBlocked] of [[false, true], [true, false]]) {
        const input = draft(body);
        const result = await run(input, ['Elara'], {}, { exemptions: ['pin'], caseSensitive: scanCase });
        if (wantBlocked) unresolved(result, 'FILTER_PERMISSION_BLOCKED');
        else assert.equal(result.outputs.out.text, 'First.\n\nLast.');
        assert.equal(input.exemptions, undefined);
    }
    const input = { ...draft(body), exemptions: ['pin'], caseSensitive: false, spans: [
        { index: 0, start: 0, end: 14, text: 'First.\n\nElara ' },
        { index: 1, start: 17, end: 25, text: '.\n\nLast.' },
    ] };
    const result = await run(input, ['Elara'], {}, { caseSensitive: true });
    unresolved(result, 'FILTER_PERMISSION_BLOCKED');
});

test('Filter scope narrows a whole scan and does not borrow keyword editing authority', async () => {
    const result = await run(draft('First.\n\n"Elara" speaks.\n\nLast.'), ['Elara'], { scope: 'dialogue' });
    unresolved(result, 'FILTER_PERMISSION_BLOCKED');
});

test('affected-unit and complete Data byte limits fail without any output', async () => {
    const units = await run(draft('Elara\n'.repeat(257) + 'Last.'), ['Elara'], { unit: 'line' });
    assert.equal(units.error.code, 'FILTER_UNIT_LIMIT'); assert.equal(units.outputs, undefined);
    const report = await run(draft('Elara' + '界'.repeat(89000) + '\nLast.'), ['Elara'], { unit: 'line' });
    assert.equal(report.error.code, 'FILTER_REPORT_LIMIT'); assert.equal(report.outputs, undefined);
});

test('invalid controls are rejected as settings rather than inferred', async () => {
    const input = draft('First.\n\nElara\n\nLast.'), scanned = await scan(input);
    for (const extra of [{ unit: 'sentence' }, { action: 'replace' }, { scope: 'invented' }, { protectedLiterals: [''] }, { surprise: true }]) {
        const result = filter.filterPatternDraft(input, scanned.outputs.matches, controls(extra), { nodeId: 'filter' });
        assert.equal(result.error.code, 'INVALID_FILTER_SETTINGS');
    }
});




test('runtime dispatch preserves the live Matches identity through reroute and executes zero requests', async () => {
    const { runWorkflowForHost } = await import('../src/workflow/runtime.js?v=0.27.0');
    const node = (id, operation, extra = {}) => ({ id, type: 'workflow', operation, phase: 'post', ...extra });
    const wire = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
    const graph = { id: 'filter-routing', schema: 3, runtime: 2, mode: 'native-unified', roles: {}, nodes: {
        source: node('source', 'reply-snapshot'),
        scan: node('scan', 'pattern', { mode: 'literal', scope: 'whole', rules: [{ id: 'name', pattern: 'Elara' }] }),
        route: node('route', 'reroute', { artifactKind: 'data' }),
        filter: node('filter', 'filter-text'),
    }, wires: Object.fromEntries([
        wire('a', 'source', 'out', 'scan', 'in'), wire('b', 'scan', 'out', 'filter', 'in'),
        wire('c', 'scan', 'matches', 'route', 'in'), wire('d', 'route', 'out', 'filter', 'matches'),
    ].map(item => [item.id, item])) };
    const outputs = [];
    const result = await runWorkflowForHost(graph, { target: { workflowId: graph.id, instancePath: [], nodeId: 'filter', portId: 'out' }, snapshot: async () => draft('First.\n\nElara\n\nLast.') }, {
        retainScopedOutput(payload) { outputs.push(payload); return { ok: true, data: { retained: true } }; },
    });
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.actualCalls, 0);
    const emitted = outputs.find(item => item.node.id === 'filter' && item.portId === 'out');
    assert.equal(emitted.artifact.text, 'First.\n\nLast.');
    assert.equal(outputs.find(item => item.node.id === 'scan' && item.portId === 'matches').artifact.value, outputs.find(item => item.node.id === 'route').artifact.value);
});




test('unannotated stored exemptions block whole units with a completed removal diagnostic', async () => {
    const input = { ...draft('First.\n\nElara PIN.\n\nLast.'), exemptions: ['pin'], caseSensitive: false };
    const result = await run(input);
    unresolved(result, 'FILTER_PERMISSION_BLOCKED');
    assert.equal(result.outputs.report.value.units[0].blocked, true);
});

test('derived Filter previews retain privacy and protections survive on successor authority', async () => {
    const input = { ...draft('First.\n\nElara\n\nLast.'), visibility: { kind: 'actor-private', actorId: 'mara' } };
    const result = await run(input, ['Elara'], { protectedLiterals: ['Last.'] }, { protectedLiterals: ['First.'] });
    assert.deepEqual(result.outputs.report.visibility, input.visibility);
    assert.deepEqual({ ...result.outputs.out.visibility }, { kind: 'actor-private', actorId: 'mara' });
    assert.deepEqual(result.outputs.out.protectedLiterals, ['First.', 'Last.']);
    assert.equal(Object.isFrozen(result.outputs.report.value.units[0]), true);
    const next = await run(result.outputs.out, ['Last.']);
    unresolved(next, 'FILTER_PERMISSION_BLOCKED');
});

test('exactly 256 affected units remain admissible', async () => {
    const result = await run(draft('Elara\n'.repeat(256) + 'Last.'), ['Elara'], { unit: 'line' });
    assert.equal(result.ok, true); assert.equal(result.outputs.out.text, 'Last.');
    assert.equal(result.outputs.report.value.units.length, 256);
});

test('authorized and retained dialogue permissions cannot delete surrounding narration', async () => {
    const body = 'First.\n\n"Elara" speaks.\n\nLast.';
    const input = { ...draft(body), scope: 'dialogue', spans: [{ index: 0, start: 9, end: 14, text: 'Elara' }] };
    for (const scope of ['authorized', 'whole']) unresolved(await run(input, ['Elara'], { scope }), 'FILTER_PERMISSION_BLOCKED');
});



test('no-hit remove is exact passthrough without expanding an editing plan', async () => {
    const input = { ...draft('First PIN.\n\nLast.'), exemptions: ['pin'], caseSensitive: false };
    const result = await run(input);
    assert.equal(result.ok, true); assert.equal(result.outputs.out, input);
    assert.equal(result.outputs.report.value.status, 'complete');
    const blank = draft(' \t\r\n');
    assert.equal((await run(blank)).outputs.out, blank);
});




test('unannotated stored exemptions allow independent deletion outside their coverage', async () => {
    const input = { ...draft('First PIN.\n\nElara\n\nLast.'), exemptions: ['pin'], caseSensitive: false };
    const result = await run(input);
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.outputs.out.text, 'First PIN.\n\nLast.');
    assert.equal(result.outputs.out.caseSensitive, false); assert.deepEqual(result.outputs.out.exemptions, ['pin']);
});
