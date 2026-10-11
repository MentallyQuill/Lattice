import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { scanPatternDraft, getPatternReportBinding } from '../src/workflow/operations/pattern-engine.js';
const draft = text => ({ kind: 'draft', text, source: { originalText: text } });
const settings = (patterns, extra = {}) => ({ mode: 'whole-word', scope: 'whole', caseSensitive: false, rules: patterns.map((pattern, index) => ({ id: `rule-${index}`, pattern })), exemptions: [], protectedLiterals: [], matchPolicy: 'any', minOccurrences: 1, regexFlags: '', timeoutMs: 1000, ...extra });
function workerHarness() {
    const resources = [];
    return { resources, factory() {
        const worker = new Worker(new URL('./fixtures/pattern-node-worker.mjs', import.meta.url));
        const listeners = new Map(), resource = { termination: null }; resources.push(resource);
        return { postMessage: data => worker.postMessage(data), addEventListener(type, listener) { const handler = type === 'message' ? data => listener({ data }) : error => listener({ error }); listeners.set(listener, handler); worker.on(type, handler); }, removeEventListener(type, listener) { worker.off(type, listeners.get(listener)); listeners.delete(listener); }, terminate() { resource.termination = worker.terminate(); return resource.termination; } };
    }, async cleaned() { for (const resource of resources) { assert.ok(resource.termination); await resource.termination; } } };
}
test('Pattern counts this invocation independently and passes the exact Draft', async () => {
    const input = draft('1 '.repeat(12) + '3 3'); input.findings = [{ rule: 'upstream', start: 0, end: 1 }];
    const result = await scanPatternDraft(input, settings(['1', '2', '3']));
    assert.equal(result.ok, true);
    assert.equal(result.outputs.out, input);
    assert.equal(result.outputs.matched.value, true);
    assert.equal(result.outputs.matches.value.totalOccurrences, 14);
    assert.deepEqual(result.outputs.matches.value.rules.map(rule => rule.count), [12, 0, 2]);
    assert.equal(input.spans, undefined);
});
test('Pattern runs once and routes its unchanged Draft through Branch and Join with live report identity', async () => {
    const { runWorkflowForHost } = await import('../src/workflow/runtime.js?v=0.27.0');
    const { getPatternReportBinding: liveBinding } = await import('../src/workflow/operations/pattern-engine.js?v=0.27.0');
    const node = (id, operation, extra = {}) => ({ id, type: 'workflow', operation, phase: 'post', ...extra });
    const wire = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
    const graph = { id: 'pattern-routing', schema: 3, runtime: 2, mode: 'native-unified', roles: {}, nodes: {
        source: node('source', 'reply-snapshot'), scan: node('scan', 'pattern', settings(['1', '2', '3'])), branch: node('branch', 'branch', { artifactKind: 'draft' }), join: node('join', 'join', { artifactKind: 'draft', inputs: [{ id: 'hit', label: 'Hit', required: false }, { id: 'miss', label: 'Miss', required: false }] }),
    }, wires: Object.fromEntries([wire('a', 'source', 'out', 'scan', 'in'), wire('b', 'scan', 'out', 'branch', 'in'), wire('c', 'scan', 'matched', 'branch', 'condition'), wire('d', 'branch', 'yes', 'join', 'hit'), wire('e', 'branch', 'no', 'join', 'miss')].map(item => [item.id, item])) };
    const outputs = [];
    const options = { target: { workflowId: graph.id, instancePath: [], nodeId: 'join', portId: 'out' }, snapshot: async () => draft('1 '.repeat(12) + '3 3') };
    const result = await runWorkflowForHost(graph, options, { retainScopedOutput(payload) { outputs.push(payload); return { ok: true, data: { retained: true } }; } });
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.actualCalls, 0);
    const source = outputs.find(item => item.node.id === 'source').artifact;
    const scanOut = outputs.find(item => item.node.id === 'scan' && item.portId === 'out').artifact;
    const matches = outputs.find(item => item.node.id === 'scan' && item.portId === 'matches').artifact;
    assert.equal(scanOut, source); assert.equal(matches.value.totalOccurrences, 14);
    assert.equal(outputs.filter(item => item.node.id === 'branch').length, 1);
    assert.equal(outputs.find(item => item.node.id === 'join').artifact, source);
    assert.equal(liveBinding(matches.value, source).ok, true);
});
test('Malformed Worker responses fail atomically instead of admitting invented occurrences', async () => {
    let message, terminated = false;
    const result = await scanPatternDraft(draft('a'), settings(['a'], { mode: 'regex' }), { workerFactory: () => ({ addEventListener(type, listener) { if (type === 'message') message = listener; }, removeEventListener() {}, postMessage() { message({ data: { ok: true, data: { occurrences: [{ ruleIndex: 5, start: 0, end: 1, text: 'invented' }] } } }); }, terminate() { terminated = true; } }) });
    assert.equal(result.ok, false); assert.equal(result.error.code, 'WORKER_UNAVAILABLE'); assert.equal(result.outputs, undefined); assert.equal(terminated, true);
});
test('Pattern derived decisions and excerpts retain Draft disclosure metadata', async () => {
    const input = { ...draft('cold'), visibility: { kind: 'actor-private', actorId: 'mara' } };
    const result = await scanPatternDraft(input, settings(['cold']));
    assert.equal(result.ok, true); assert.equal(result.outputs.out, input);
    assert.deepEqual(result.outputs.matched.visibility, input.visibility);
    assert.deepEqual(result.outputs.matches.visibility, input.visibility);
});
test('ANY and ALL combine rule hit coverage with the minimum total occurrences', async () => {
    for (const [patterns, policy, minimum, expected] of [[['1', '2', '3'], 'any', 14, true], [['1', '2', '3'], 'all', 1, false], [['1', '3'], 'all', 14, true], [['1', '3'], 'any', 15, false], [[], 'all', 1, false], [[], 'any', 1, false]]) {
        const result = await scanPatternDraft(draft('1 '.repeat(12) + '3 3'), settings(patterns, { matchPolicy: policy, minOccurrences: minimum }));
        assert.equal(result.ok, true); assert.equal(result.outputs.matched.value, expected);
    }
});
test('Assembled presentation is excluded and bound public evidence is deeply immutable', async () => {
    const { appendDraftSections } = await import('../src/workflow/draft-revisions.js?v=0.27.0');
    const assembled = appendDraftSections(draft('cold story'), [{ id: 'tail', text: 'cold presentation' }], { nodeId: 'append' });
    assert.equal(assembled.ok, true);
    const input = assembled.data.draft, result = await scanPatternDraft(input, settings(['cold']));
    assert.equal(result.ok, true); assert.equal(result.outputs.out, input);
    const value = result.outputs.matches.value;
    assert.equal(value.totalOccurrences, 1); assert.equal(value.source.bodyLength, 'cold story'.length);
    assert.ok(value.source.textLength > value.source.bodyLength);
    assert.throws(() => { value.occurrences[0].start = 5; }, TypeError);
    assert.throws(() => { value.rules[0].count = 99; }, TypeError);
    const binding = getPatternReportBinding(value, input); assert.equal(binding.ok, true);
    assert.equal(Object.isFrozen(binding.data.settings.rules[0]), true); assert.equal(Object.isFrozen(binding.data.regions[0]), true);
});
test('Regex deadlines include startup, cancellation terminates, and unavailable Workers never fall back', async () => {
    const unavailable = await scanPatternDraft(draft('aaa'), settings(['a+'], { mode: 'regex' }), { workerFactory: () => { throw new Error('unavailable'); } });
    assert.equal(unavailable.error.code, 'WORKER_UNAVAILABLE'); assert.equal(unavailable.outputs, undefined);
    const harness = workerHarness();
    const timeout = await scanPatternDraft(draft('a'.repeat(20000) + '!'), settings(['^(a+)+$'], { mode: 'regex', timeoutMs: 100 }), { workerFactory: harness.factory });
    assert.equal(timeout.error.code, 'PATTERN_TIMEOUT'); assert.equal(timeout.outputs, undefined);
    const controller = new AbortController();
    const pending = scanPatternDraft(draft('a'.repeat(20000) + '!'), settings(['^(a+)+$'], { mode: 'regex' }), { workerFactory: harness.factory, signal: controller.signal });
    controller.abort(); const cancelled = await pending;
    assert.equal(cancelled.error.code, 'ABORTED'); assert.equal(cancelled.outputs, undefined);
    let posted = false, terminated = false;
    const startup = await scanPatternDraft(draft('a'), settings(['a'], { mode: 'regex', timeoutMs: 100 }), { workerFactory() { const started = performance.now(); while (performance.now() - started < 125) {} return { addEventListener() {}, removeEventListener() {}, postMessage() { posted = true; }, terminate() { terminated = true; } }; } });
    assert.equal(startup.error.code, 'PATTERN_TIMEOUT'); assert.equal(posted, false); assert.equal(terminated, true);
    await harness.cleaned();
});
test('Cancellation fails before any scan and never emits a false decision', async () => {
    const controller = new AbortController(); controller.abort();
    const result = await scanPatternDraft(draft('cold'), settings(['cold']), { signal: controller.signal });
    assert.equal(result.ok, false); assert.equal(result.error.code, 'ABORTED'); assert.equal(result.outputs, undefined);
});
test('Pattern registers its current four-pin detector contract without a public legacy alias', async () => {
    const { OPERATIONS, describeOperation } = await import('../src/workflow/catalog.js');
    const description = describeOperation({ schema: 3, runtime: 2, mode: 'native-post' }, { id: 'pattern', type: 'workflow', operation: 'pattern' });
    assert.equal(description.ok, true); assert.equal(description.data.descriptor.requestBound, 0);
    assert.equal(OPERATIONS['pattern-scan'], undefined);
    assert.deepEqual(description.data.ports.map(pin => pin.id), ['in', 'out', 'matched', 'matches']);
});
test('Regex uses a terminable Worker for Unicode global nonoverlapping matches and explicit failures', async () => {
    const harness = workerHarness();
    const result = await scanPatternDraft(draft('Aa\na𐐀 aa'), settings(['a+', '𐐀'], { mode: 'regex' }), { workerFactory: harness.factory });
    assert.equal(result.ok, true); assert.deepEqual(result.outputs.matches.value.rules.map(rule => rule.count), [3, 1]);
    for (const [expression, expected] of [['[', 'INVALID_PATTERN_REGEX'], ['a*', 'PATTERN_ZERO_WIDTH']]) {
        const bad = await scanPatternDraft(draft('b'), settings([expression], { mode: 'regex' }), { workerFactory: harness.factory });
        assert.equal(bad.ok, false); assert.equal(bad.error.code, expected); assert.equal(bad.outputs, undefined);
    }
    assert.equal(harness.resources.length, 3); await harness.cleaned();
});
test('Scoped regex matches each selected region before remapping UTF-16 offsets', async () => {
    const harness = workerHarness();
    const dialogue = await scanPatternDraft(draft('a "b"'), settings(['a.*b|b'], { mode: 'regex', scope: 'dialogue' }), { workerFactory: harness.factory });
    assert.equal(dialogue.ok, true); assert.equal(dialogue.outputs.matched.value, true);
    assert.deepEqual(dialogue.outputs.matches.value.occurrences.map(hit => [hit.start, hit.end, hit.text]), [[3, 4, 'b']]);
    const input = draft('𐐀 a b x b'); input.spans = [{ index: 0, start: 5, end: 6, text: 'b' }, { index: 1, start: 9, end: 10, text: 'b' }];
    const authorized = await scanPatternDraft(input, settings(['^b$', '(?<!a )b', 'b(?= x)'], { mode: 'regex', scope: 'authorized' }), { workerFactory: harness.factory });
    assert.equal(authorized.ok, true);
    assert.deepEqual(authorized.outputs.matches.value.rules.map(rule => rule.count), [2, 2, 0]);
    assert.deepEqual(authorized.outputs.matches.value.occurrences.map(hit => [hit.start, hit.end, hit.ruleIndex]), [[5, 6, 0], [5, 6, 1], [9, 10, 0], [9, 10, 1]]);
    await harness.cleaned();
});
test('Pattern scan and complete Data reports fail atomically at their limits', async () => {
    // Nine visited values per occurrence cross generic Data's 10,000-value bound.
    for (const [text, extra, expected] of [['a '.repeat(4097), {}, 'PATTERN_OCCURRENCE_LIMIT'], ['a '.repeat(1400), {}, 'PATTERN_REPORT_LIMIT'], ['a'.repeat(100001), {}, 'INVALID_DRAFT']]) {
        const result = await scanPatternDraft(draft(text), settings(['a'], extra));
        assert.equal(result.ok, false); assert.equal(result.error.code, expected); assert.equal(result.outputs, undefined);
    }
});
test('Complete report UTF-8 admission rejects long excerpts independently of traversal and occurrence caps', async () => {
    // 45 occurrences and roughly 450 traversed values; excerpt bytes alone are
    // 2,048 * 45 * 3 = 276,480, exceeding the 262,144-byte Data bound.
    const pattern = '漢'.repeat(2048), input = draft(Array(45).fill(pattern).join(' '));
    assert.equal(input.text.length, 92204);
    const result = await scanPatternDraft(input, settings([pattern], { mode: 'literal' }));
    assert.equal(result.ok, false); assert.equal(result.error.code, 'PATTERN_REPORT_LIMIT'); assert.equal(result.outputs, undefined);
});
test('Fresh report binding rejects copies, different Drafts and changed permissions', async () => {
    const input = draft('cold'); const result = await scanPatternDraft(input, settings(['cold'])); const value = result.outputs.matches.value;
    assert.equal(getPatternReportBinding(value, input).ok, true);
    assert.equal(getPatternReportBinding(structuredClone(value), input).error.code, 'INVALID_MATCH_REPORT');
    assert.equal(getPatternReportBinding(value, draft('cold')).error.code, 'STALE_MATCH_REPORT');
    input.spans = [{ index: 0, start: 0, end: 4, text: 'cold' }];
    assert.equal(getPatternReportBinding(value, input).error.code, 'STALE_MATCH_REPORT');
});
test('Upstream and configured exemptions keep their own case policies', async () => {
    const input = draft('COLD cold ICE ice snow'); input.exemptions = ['COLD']; input.caseSensitive = true;
    const result = await scanPatternDraft(input, settings(['cold', 'ice', 'snow'], { exemptions: ['ICE'] }));
    assert.equal(result.ok, true); assert.deepEqual(result.outputs.matches.value.rules.map(rule => rule.count), [1, 0, 1]);
    assert.equal(result.outputs.out, input); assert.deepEqual(input.exemptions, ['COLD']);
});
test('Configured exemptions exclude hits before the occurrence cap in literal and Worker scans', async () => {
    const harness = workerHarness();
    for (const mode of ['literal', 'regex']) {
        const result = await scanPatternDraft(draft('a '.repeat(5000)), settings(['a'], { mode, exemptions: ['a'] }), { workerFactory: harness.factory });
        assert.equal(result.ok, true); assert.equal(result.outputs.matched.value, false);
        assert.equal(result.outputs.matches.value.totalOccurrences, 0); assert.deepEqual(result.outputs.matches.value.occurrences, []);
    }
    await harness.cleaned();
});
test('Read-only scans count dense stored exemptions and protections without editing fragment limits', async () => {
    for (const restriction of ['exemptions', 'protectedLiterals']) {
        const input = draft(('x a ').repeat(257)); input[restriction] = ['x'];
        const result = await scanPatternDraft(input, settings(['a', 'x']));
        assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.outputs.out, input); assert.equal(input.spans, undefined);
        const report = result.outputs.matches.value;
        assert.deepEqual(report.rules.map(rule => rule.count), restriction === 'exemptions' ? [257, 0] : [257, 257]);
        assert.equal(report.occurrences.filter(hit => hit.text === 'a').every(hit => hit.editable && !hit.protected), true);
        if (restriction === 'protectedLiterals') assert.equal(report.occurrences.filter(hit => hit.text === 'x').every(hit => !hit.editable && hit.protected), true);
        assert.equal(getPatternReportBinding(report, input).ok, true);
    }
});
test('Inspection preserves existing exact permission and live ancestry validation', async () => {
    for (const invalid of [
        { ...draft('abc'), scope: 'whole' },
        { ...draft('abc'), scope: 'invented', spans: [] },
        { ...draft('abc'), spans: [{ index: 0, start: 0, end: 2, text: 'wrong' }] },
        { ...draft('abc'), exemptions: ['a'], spans: [{ index: 0, start: 0, end: 3, text: 'abc' }] },
        { ...draft('a "b"'), scope: 'dialogue', spans: [{ index: 0, start: 0, end: 1, text: 'a' }] },
        { ...draft('𐐀a'), spans: [{ index: 0, start: 1, end: 3, text: '\uDC00a' }] },
    ]) {
        const result = await scanPatternDraft(invalid, settings(['a']));
        assert.equal(result.ok, false); assert.equal(result.error.code, 'INVALID_SPANS'); assert.equal(result.outputs, undefined);
    }
    const { createDraftRevision } = await import('../src/workflow/draft-revisions.js?v=0.27.0');
    const revision = createDraftRevision(draft('abc'), 'abd', { nodeId: 'edit', scope: 'whole' }); assert.equal(revision.ok, true);
    const copied = await scanPatternDraft(structuredClone(revision.data.draft), settings(['a']));
    assert.equal(copied.error.code, 'INVALID_ANCESTRY'); assert.equal(copied.outputs, undefined);
});
test('Unmatched quote scopes emit unresolved decisions with null counts', async () => {
    const input = draft('cold "cold');
    for (const scope of ['narration', 'dialogue']) {
        const result = await scanPatternDraft(input, settings(['cold'], { scope }));
        assert.equal(result.ok, true); assert.equal(result.outputs.out, input);
        assert.equal(result.outputs.matched, undefined); assert.equal(result.outputStates.matched.status, 'unresolved');
        assert.equal(result.outputStates.matched.reason.code, 'UNMATCHED_QUOTES');
        const report = result.outputs.matches.value;
        assert.equal(report.status, 'unresolved'); assert.equal(report.matched, null); assert.equal(report.totalOccurrences, null); assert.equal(report.rules[0].count, null); assert.deepEqual(report.occurrences, []);
    }
    const whole = await scanPatternDraft(input, settings(['cold']));
    assert.equal(whole.outputs.matches.value.totalOccurrences, 2);
    assert.equal(whole.outputs.matches.value.diagnostics[0].code, 'UNMATCHED_QUOTES');
});
test('Malformed quote Drafts with upstream empty permissions remain inspectable and scoped unresolved', async () => {
    const { scanDraft } = await import('../src/workflow/repair.js?v=0.27.0');
    const upstream = scanDraft(draft('cold "cold'), { scope: 'dialogue', rules: ['cold'] });
    assert.equal(upstream.ok, true); assert.deepEqual(upstream.artifact.spans, []);
    const input = upstream.artifact;
    const whole = await scanPatternDraft(input, settings(['cold']));
    assert.equal(whole.ok, true, JSON.stringify(whole.error)); assert.equal(whole.outputs.out, input);
    assert.equal(whole.outputs.matched.value, true);
    assert.equal(whole.outputs.matches.value.status, 'complete');
    assert.deepEqual(whole.outputs.matches.value.occurrences.map(hit => [hit.start, hit.end, hit.editable]), [[0, 4, false], [6, 10, false]]);
    assert.equal(whole.outputs.matches.value.diagnostics[0].code, 'UNMATCHED_QUOTES');
    for (const scope of ['dialogue', 'narration']) {
        const result = await scanPatternDraft(input, settings(['cold'], { scope }));
        assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.outputs.out, input);
        assert.equal(result.outputStates.matched.status, 'unresolved'); assert.equal(result.outputStates.matched.reason.code, 'UNMATCHED_QUOTES');
        const report = result.outputs.matches.value;
        assert.equal(report.status, 'unresolved'); assert.equal(report.matched, null); assert.equal(report.totalOccurrences, null); assert.equal(report.rules[0].count, null); assert.deepEqual(report.occurrences, []);
    }
    const invalid = { ...input, spans: [{ index: 0, start: 6, end: 10, text: 'cold' }] };
    const rejected = await scanPatternDraft(invalid, settings(['cold']));
    assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'INVALID_SPANS'); assert.equal(rejected.outputs, undefined);
});
test('Whole inspects protected and noneditable hits while authorized scope stays narrow', async () => {
    const input = draft('cold "cold" cold KEEP cold'); input.scope = 'whole'; input.protectedLiterals = ['KEEP'];
    input.spans = [{ index: 0, start: 0, end: 4, text: 'cold' }];
    const whole = await scanPatternDraft(input, settings(['cold', 'KEEP'], { protectedLiterals: ['"cold"'] }));
    assert.equal(whole.ok, true); assert.equal(whole.outputs.out, input);
    assert.deepEqual(whole.outputs.matches.value.occurrences.map(hit => [hit.text, hit.editable, hit.protected]), [['cold', true, false], ['cold', false, true], ['cold', false, false], ['KEEP', false, true], ['cold', false, false]]);
    const authorized = await scanPatternDraft(input, settings(['cold'], { scope: 'authorized' }));
    assert.equal(authorized.outputs.matches.value.totalOccurrences, 1);
    assert.equal((await scanPatternDraft(draft('cold'), settings(['cold'], { scope: 'authorized' }))).error.code, 'SCOPE_REQUIRED');
    assert.equal((await scanPatternDraft(input, settings(['cold'], { scope: 'dialogue' }))).outputs.matches.value.totalOccurrences, 1);
    assert.equal((await scanPatternDraft(input, settings(['cold'], { scope: 'narration' }))).outputs.matches.value.totalOccurrences, 3);
});
test('Literal overlaps and whole-word Unicode boundaries retain original offsets', async () => {
    const overlap = await scanPatternDraft(draft('aaa'), settings(['aa', 'aa'], { mode: 'literal' }));
    assert.equal(overlap.ok, true);
    assert.deepEqual(overlap.outputs.matches.value.occurrences.map(hit => [hit.start, hit.end, hit.ruleIndex]), [[0, 2, 0], [0, 2, 1], [1, 3, 0], [1, 3, 1]]);
    const input = draft("though thought 1 12 𐐀though though𐐀 though_ though́ 'though' though- İ THOUGH");
    const words = await scanPatternDraft(input, settings(['though', '1']));
    assert.equal(words.ok, true);
    assert.deepEqual(words.outputs.matches.value.rules.map(rule => rule.count), [4, 1]);
    for (const hit of words.outputs.matches.value.occurrences) assert.equal(input.text.slice(hit.start, hit.end), hit.text);
});
test('Pattern admits bounded canonical settings and rejects duplicate authored IDs', async () => {
    const { describePattern } = await import('../src/workflow/operations/pattern-nodes.js');
    const description = describePattern({ operation: 'pattern' });
    assert.equal(description.ok, true);
    assert.equal(description.data.descriptor.defaults.mode, 'whole-word');
    assert.equal(description.data.descriptor.defaults.timeoutMs, 1000);
    assert.deepEqual(description.data.ports.map(pin => [pin.id, pin.kind]), [['in', 'draft'], ['out', 'draft'], ['matched', 'data'], ['matches', 'data']]);
    for (const extra of [{ rules: [{ id: 'same', pattern: 'a' }, { id: 'same', pattern: 'a' }] }, { rules: Array.from({ length: 129 }, (_, index) => ({ id: String(index), pattern: 'a' })) }, { rules: [{ id: 'a', pattern: 'a'.repeat(2049) }] }, { minOccurrences: 0 }, { timeoutMs: 99 }, { timeoutMs: 2001 }, { regexFlags: 'mm' }, { regexFlags: 'i' }]) {
        const result = await scanPatternDraft(draft('a'), settings(['a'], extra));
        assert.equal(result.ok, false); assert.equal(result.error.code, 'INVALID_PATTERN_SETTINGS'); assert.equal(result.outputs, undefined);
    }
});
