import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectRunRows } from '../src/workflow/run-state.js';

const api = await import('../src/workflow/recording.js').catch(() => ({}));
const address = (nodeId, instancePath = []) => ({ workflowId: 'root/wf', instancePath, nodeId });
const unit = (nodeId, instancePath = []) => ({ address: address(nodeId, instancePath), operation: 'select-fields', included: true, dependencies: [], requestBound: 0, inputPorts: ['in'], outputPorts: ['out'] });
const plan = (count = 2) => ({ workflowId: 'root/wf', phase: 'post', mode: 'root', units: Array.from({ length: count }, (_, i) => unit('node-' + i)), hierarchy: [], terminals: [{ kind: 'terminal', address: address('node-1') }], callBound: 0 });
const event = (seq, type, fields = {}) => ({ runId: 'run', seq, type, at: seq, elapsedMs: seq, ...fields });
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const byteSize = value => new TextEncoder().encode(JSON.stringify(value)).length;
const recorderWithAllowance = (p, allowance) => {
    const probe = api.createRunRecorder({ runId: 'run' }); probe.accept(event(1, 'plan', { plan: p }));
    const base = probe.snapshot().retention.payloadAllowance;
    const runId = 'r'.repeat(3 + base - allowance);
    const recorder = api.createRunRecorder({ runId });
    assert.equal(recorder.accept(event(1, 'plan', { runId, plan: p })).ok, true);
    assert.equal(recorder.snapshot().retention.payloadAllowance, allowance);
    return recorder;
};

// Repeated deep instance paths must be interned once, with exact separator-containing identities.
test('admits 1000 depth-eight units with exact compact paths and rejects irreducible identity overflow', () => {
    assert.equal(typeof api.admitRunPlan, 'function');
    const p = plan(1000); p.terminals = [];
    p.units.forEach((entry, i) => { entry.address.instancePath = Array.from({ length: 8 }, (_, depth) => `instance/${depth}/uuid-${Math.floor(i / 10)}`); });
    const result = api.admitRunPlan(p, { runId: 'run' });
    assert.equal(result.ok, true);
    assert.ok(byteSize(result.data) < 4194304);
    assert.ok(result.data.identities.paths.length <= 801);
    assert.deepEqual(projectRunRows(result.data, p.units[999].address.instancePath).at(-1).address, p.units[999].address);
    const huge = plan(); huge.units[0].address.nodeId = 'x'.repeat(4194304);
    assert.equal(api.admitRunPlan(huge, { runId: 'run' }).error.code, 'RUN_METADATA_LIMIT');
});

// Arrival order must not choose which payload or artifact ID wins diagnostic retention.
test('records real ports and terminal results separately with deterministic immutable identity dedupe', () => {
    assert.equal(typeof api.createRunRecorder, 'function');
    const artifact = freeze({ kind: 'data', value: { text: 'safe', token: 'legitimate data' } });
    const captures = [
        { address: address('node-0'), portId: 'out', direction: 'output', artifact },
        { address: address('node-1'), portId: 'in', direction: 'input', artifact },
        { address: address('node-1'), direction: 'terminal', artifact },
    ];
    const build = order => { const recorder = api.createRunRecorder({ runId: 'run' }); assert.equal(recorder.accept(event(1, 'plan', { plan: plan() })).ok, true); for (const index of order) assert.equal(recorder.capture(captures[index]).ok, true); return recorder.finish(); };
    const first = build([0, 1, 2]), reversed = build([2, 1, 0]);
    assert.deepEqual(first, reversed);
    assert.equal(first.artifacts.length, 1);
    assert.equal(first.units[0].ports[1].artifact, 0);
    assert.equal(first.units[1].ports[0].artifact, 0);
    assert.deepEqual(first.terminals[0], { kind: 'terminal', address: first.units[1].address, artifact: 0 });
    assert.equal(first.artifacts[0].value.value.token, 'legitimate data');
    assert.ok(Object.isFrozen(first.artifacts[0].value.value));
    assert.equal(artifact.value.text, 'safe');
});

// A full structured candidate is private authority; the recording and rendered text need independent caps.
test('truncates escaped multibyte structured diagnostics visibly without mutating the candidate', () => {
    const recorder = api.createRunRecorder({ runId: 'run' }); recorder.accept(event(1, 'plan', { plan: plan() }));
    const text = ('😀\u0000\\\"').repeat(60000), artifact = freeze({ kind: 'candidate', text, original: 'original', source: { token: 'host-authority', originalText: 'private source', chatId: 'chat', messageIndex: 4 }, findings: [{ text }] });
    assert.equal(recorder.capture({ address: address('node-1'), direction: 'terminal', artifact }).ok, true);
    const recording = recorder.finish(), entry = recording.artifacts[0];
    assert.equal(entry.format, 'json-prefix-text'); assert.equal(entry.truncated, true);
    assert.ok(byteSize(entry) <= 262144);
    const rendered = api.formatRecordedArtifact(entry);
    assert.ok(new TextEncoder().encode(rendered.text).length <= 65536);
    assert.equal(rendered.truncated, true); assert.equal(rendered.format, 'json-prefix-text');
    assert.equal(recording.terminals.length, 1);
    assert.equal(artifact.text, text); assert.equal(artifact.source.token, 'host-authority');
    assert.ok(!JSON.stringify(recording).includes('host-authority'));
    assert.ok(!JSON.stringify(recording).includes('private source'));
});

// Retaining an unbounded candidate sidecar would defeat a bounded serialized snapshot.
test('whole-record allocation and private pending payloads retain plan order under reversed arrivals', () => {
    const p = plan(40); p.terminals = [{ kind: 'terminal', address: address('node-39') }];
    const artifacts = p.units.map((_, i) => freeze({ kind: 'data', value: { rank: i, text: '😀'.repeat(70000) } }));
    const build = order => {
        const recorder = api.createRunRecorder({ runId: 'run' }); recorder.accept(event(1, 'plan', { plan: p }));
        for (const i of order) recorder.capture({ address: address('node-' + i), portId: 'out', direction: 'output', artifact: artifacts[i] });
        recorder.capture({ address: address('node-39'), direction: 'terminal', artifact: artifacts[39] });
        return recorder.finish();
    };
    const a = build(Array.from({ length: 40 }, (_, i) => i)), b = build(Array.from({ length: 40 }, (_, i) => 39 - i));
    assert.deepEqual(a, b); assert.ok(byteSize(a) <= 4194304);
    assert.ok(a.artifacts.every(entry => byteSize(entry) <= 262144));
    assert.ok(a.artifacts[0].format !== 'omitted'); assert.equal(a.artifacts.at(-1).format, 'omitted');
    assert.equal(a.terminals[0].artifact, 39);
    assert.ok(a.retention.pendingBytes <= a.retention.payloadAllowance, 'reported pending projection bytes are bounded at the capture boundary');
});

// Summary projection must never copy old owned call records or provider/host authority objects.
test('allowlists event and capture provenance, errors and reports and preserves Data.value keys', () => {
    const recorder = api.createRunRecorder({ runId: 'run' }); recorder.accept(event(1, 'plan', { plan: plan() }));
    recorder.accept(event(2, 'node-phase', { address: address('node-0'), phase: 'binding', binding: { role: 'Analysis', profileId: 'profile', model: 'model', fingerprint: 'opaque', endpoint: 'private', messages: ['private prompt'] } }));
    const artifact = freeze({ kind: 'data', value: { source: { token: 'data token', originalText: 'data original' }, messages: ['legitimate diagnostic message'], binding: 'legitimate binding data' }, source: { token: 'private token', chatId: 'chat' }, calls: [{ messages: ['private prompt'] }], reports: [{ messages: ['private owned report'] }], usage: { prompt_tokens: 4, endpoint: 'private provider field' }, error: { code: 'ARTIFACT_ERROR', message: 'safe summary', cause: 'private cause' } });
    recorder.capture({ address: address('node-0'), portId: 'out', direction: 'output', artifact, source: { kind: 'context', phase: 'post', chatId: 'chat', messageObject: 'private', token: 'private token' }, binding: { model: 'model', endpoint: 'private' }, reports: [{ code: 'WARNING', message: '😀'.repeat(90000), providerResponse: 'private' }] });
    recorder.accept(event(3, 'run-settled', { status: 'failed', failedAddress: address('node-0'), error: { code: 'FAIL', message: '😀\u0000'.repeat(100000), stack: 'private', cause: { messages: ['private prompt'] } } }));
    const record = recorder.finish(), serialized = JSON.stringify(record);
    assert.ok(byteSize(record) <= 4194304); assert.ok(byteSize(record.error) < 2400);
    assert.equal(record.error.truncated, true);
    assert.deepEqual(record.units[0].source, { kind: 'context', phase: 'post', chatId: 'chat' });
    assert.equal(record.units[0].reports[0].code, 'WARNING'); assert.equal(record.units[0].reports[0].truncated, true);
    assert.ok(!serialized.includes('private'));
    assert.equal(record.artifacts[0].value.value.source.token, 'data token');
    assert.equal(record.artifacts[0].value.value.binding, 'legitimate binding data');
    assert.deepEqual(record.artifacts[0].value.usage, { prompt_tokens: 4 });
    assert.deepEqual(record.artifacts[0].value.error, { code: 'ARTIFACT_ERROR', message: 'safe summary' });
});

// Hook-bearing input is rejected or projected through own data descriptors without execution.
test('never executes inherited JSON hooks, accessors or array species and dedupes only deeply immutable values', () => {
    let hooks = 0;
    const recorder = api.createRunRecorder({ runId: 'run' }); recorder.accept(event(1, 'plan', { plan: plan() }));
    const prototypeHook = Object.create({ toJSON() { hooks++; return { secret: 'private' }; } }); prototypeHook.kind = 'data';
    recorder.capture({ address: address('node-0'), direction: 'output', portId: 'out', artifact: prototypeHook });
    const getter = Object.defineProperty({ kind: 'data' }, 'value', { enumerable: true, get() { hooks++; return 'private'; } });
    recorder.capture({ address: address('node-1'), direction: 'input', portId: 'in', artifact: getter });
    class HookArray extends Array { static get [Symbol.species]() { hooks++; return Array; } }
    recorder.capture({ address: address('node-1'), direction: 'output', portId: 'out', artifact: { kind: 'data', value: new HookArray(1, 2) } });
    const shallow = Object.freeze({ kind: 'data', value: { number: 1 } });
    const another = api.createRunRecorder({ runId: 'run' }); another.accept(event(1, 'plan', { plan: plan() }));
    another.capture({ address: address('node-0'), direction: 'output', portId: 'out', artifact: shallow }); shallow.value.number = 2;
    another.capture({ address: address('node-1'), direction: 'input', portId: 'in', artifact: shallow });
    assert.equal(another.finish().artifacts.length, 2);
    assert.equal(recorder.finish().artifacts[1].format, 'omitted');
    assert.equal(hooks, 0);
    const invalid = api.createRunRecorder(Object.defineProperty({}, 'runId', { get() { hooks++; return 'run'; } }));
    assert.equal(invalid.error.code, 'RUN_ID_REQUIRED'); assert.equal(hooks, 0);
});

// Omission still needs table rows; a plan with many pins cannot spend the budget twice.
test('reserves every potential omitted entry and refuses an oversized no-plan run identity', () => {
    const p = plan(1000); p.terminals = [];
    p.units.forEach(entry => { entry.inputPorts = Array.from({ length: 40 }, (_, i) => 'input-' + i); entry.outputPorts = []; });
    assert.equal(api.admitRunPlan(p, { runId: 'run' }).ok, false);
    assert.equal(api.admitRunPlan(p, { runId: 'run' }).error.code, 'RUN_METADATA_LIMIT');
    assert.equal(api.createRunRecorder({ runId: '😀'.repeat(1200000) }).error.code, 'RUN_METADATA_LIMIT');
    const nearLimit = api.createRunRecorder({ runId: 'x'.repeat(4194304 - 700) });
    if (nearLimit.ok === false) assert.equal(nearLimit.error.code, 'RUN_METADATA_LIMIT');
    else {
        nearLimit.accept({ runId: 'x'.repeat(4194304 - 700), seq: 1, type: 'run-settled', at: 1, elapsedMs: 1, status: 'invalid', error: { code: 'INVALID', message: 'x'.repeat(4000) } });
        assert.ok(byteSize(nearLimit.finish()) <= 4194304);
    }
});

// Large safe metadata from every port is summarized per node instead of becoming a hidden sidecar.
test('caps pending capture metadata independently of port count and ignores late captures after Stop', () => {
    const p = plan(20); p.terminals = [];
    p.units.forEach(entry => { entry.outputPorts = Array.from({ length: 20 }, (_, i) => 'port-' + i); });
    const source = { kind: 'context', phase: 'post', revision: '😀'.repeat(3000), chatId: '😀'.repeat(3000) };
    const recorder = api.createRunRecorder({ runId: 'run' }); recorder.accept(event(1, 'plan', { plan: p }));
    for (let i = 19; i >= 0; i--) for (let port = 19; port >= 0; port--) recorder.capture({ address: address('node-' + i), portId: 'port-' + port, direction: 'output', artifact: { kind: 'text', text: 'a' }, source, reports: [{ code: 'BIG', message: 'x'.repeat(2000) }] });
    const before = recorder.snapshot();
    assert.ok(before.retention.pendingMetadataBytes <= before.retention.metadataAllowance);
    recorder.accept(event(2, 'run-cancelling'));
    const late = recorder.capture({ address: address('node-0'), portId: 'in', direction: 'input', artifact: { kind: 'text', text: 'late' } });
    assert.equal(late.ok, false); assert.equal(late.error.code, 'RUN_CLOSED');
    assert.equal(recorder.snapshot().artifacts.length, before.artifacts.length);
});

// Canonical port order must also choose optional metadata without arrival-dependent omission flags.
test('canonical port metadata replaces later-ranked summaries deterministically', () => {
    const p = plan(1000); p.terminals = [];
    const captures = [
        { address: address('node-0'), direction: 'input', portId: 'in', artifact: { kind: 'text', text: 'input' }, reports: [{ code: 'SMALL', message: 'small' }] },
        { address: address('node-0'), direction: 'output', portId: 'out', artifact: { kind: 'text', text: 'output' }, reports: [{ code: 'BIG', message: 'x'.repeat(4000) }] },
    ];
    const build = order => { const recorder = api.createRunRecorder({ runId: 'run' }); recorder.accept(event(1, 'plan', { plan: p })); order.forEach(i => recorder.capture(captures[i])); return recorder.finish(); };
    const a = build([0, 1]), b = build([1, 0]);
    assert.deepEqual(a, b); assert.equal(a.units[0].reports[0].code, 'SMALL');
});

// Very large strings cannot become an unlimited temporary diagnostic clone or retained candidate reference.
test('streams a bounded prefix from a large candidate and preserves every terminal reference', () => {
    const p = plan(3); p.terminals = [{ kind: 'terminal', address: address('node-1') }, { kind: 'terminal', address: address('node-2') }];
    const recorder = api.createRunRecorder({ runId: 'run' }); recorder.accept(event(1, 'plan', { plan: p }));
    const candidate = freeze({ kind: 'candidate', text: '😀'.repeat(4000000), source: { token: 'authority', chatId: 'chat' } });
    recorder.capture({ address: address('node-1'), direction: 'terminal', artifact: candidate });
    recorder.capture({ address: address('node-2'), direction: 'terminal', artifact: { kind: 'candidate', text: 'second', context: { kind: 'context', messages: [{ id: 'message', role: 'user', text: 'legitimate text' }], source: { token: 'nested-authority', chatId: 'chat' } } } });
    const snapshot = recorder.snapshot();
    assert.equal(snapshot.artifacts[0].format, 'json-prefix-text');
    assert.ok(snapshot.retention.pendingBytes < 400000);
    assert.deepEqual(snapshot.terminals.map(row => row.artifact), [0, 1]);
    assert.ok(!JSON.stringify(snapshot).includes('authority'));
    assert.equal(candidate.text.length, 8000000);
    const old = snapshot;
    recorder.accept(event(2, 'run-settled', { status: 'failed', failedAddress: address('node-2'), error: { code: 'FAILED', message: 'second terminal failed' } }));
    const finished = recorder.finish();
    assert.equal(finished.status, 'failed'); assert.equal(old.status, 'waiting');
    assert.deepEqual(finished.terminals.map(row => row.artifact), [0, 1]);
    assert.equal(recorder.finish(), finished);
});

// Even a global inherited JSON hook must not participate in internal projection or byte accounting.
test('internal encoding ignores inherited toJSON hooks and emits byte-exact JSON-safe diagnostics', () => {
    let hooks = 0, result;
    Object.defineProperty(Object.prototype, 'toJSON', { configurable: true, get() { hooks++; return () => 'secret'; } });
    try {
        const recorder = api.createRunRecorder({ runId: 'run' }); recorder.accept(event(1, 'plan', { plan: plan() }));
        recorder.capture({ address: address('node-0'), direction: 'output', portId: 'out', artifact: { kind: 'data', value: { text: '\\"\u0000😀', '__proto__': null } } });
        result = recorder.finish();
        assert.equal(hooks, 0);
    } finally { delete Object.prototype.toJSON; }
    assert.equal(result.artifacts[0].value.value.text, '\\"\u0000😀');
    assert.ok(byteSize(result) <= 4194304);
});

// A bounded report sample must say how many later reports were removed.
test('report truncation keeps an explicit omission count', () => {
    const recorder = api.createRunRecorder({ runId: 'run' }); recorder.accept(event(1, 'plan', { plan: plan() }));
    recorder.capture({ address: address('node-0'), direction: 'output', portId: 'out', artifact: { kind: 'text', text: 'ok' }, reports: Array.from({ length: 8 }, (_, i) => ({ code: 'REPORT_' + i, message: 'x'.repeat(3000) })) });
    const reports = recorder.finish().units[0].reports;
    assert.equal(reports.at(-1).code, 'REPORTS_OMITTED');
    assert.equal(reports.at(-1).omitted, 8 - (reports.length - 1));
    assert.ok(byteSize(reports) <= 4096);
});

// Skipping an oversized middle candidate irreversibly loses later unequal-size payloads on reverse arrival.
test('unequal 35000 75000 25000 payloads retain the same canonical prefix at a 100000 byte allowance', () => {
    const p = plan(3); p.terminals = [];
    const artifacts = [35000, 75000, 25000].map(size => freeze({ kind: 'data', value: 'a'.repeat(size) }));
    const build = order => {
        const recorder = recorderWithAllowance(p, 100000);
        for (const i of order) {
            assert.equal(recorder.capture({ address: address('node-' + i), direction: 'output', portId: 'out', artifact: artifacts[i] }).ok, true);
            const interim = recorder.snapshot();
            assert.ok(interim.retention.pendingBytes <= 100000); assert.ok(byteSize(interim) <= 4194304);
        }
        return recorder.finish();
    };
    const ascending = build([0, 1, 2]), reversed = build([2, 1, 0]);
    assert.deepEqual(ascending.artifacts.map(entry => entry.format), reversed.artifacts.map(entry => entry.format));
    assert.deepEqual(ascending, reversed);
    assert.deepEqual(ascending.artifacts.map(entry => entry.format), ['structured', 'omitted', 'omitted']);
    assert.ok(ascending.artifacts.every(entry => byteSize(entry) <= 262144));
    assert.equal(ascending.artifacts[2].reason, 'canonical-prefix-limit');
    assert.equal(ascending.retention.policy, 'canonical-prefix');
});

// A newly captured earlier port may rerank an immutable artifact first seen at a later terminal.
test('shared immutable payloads rerank canonically while keeping every real port and terminal reference', () => {
    const p = plan(3); p.terminals = [{ kind: 'terminal', address: address('node-2') }];
    const [z, y, x] = [35000, 75000, 25000].map(size => freeze({ kind: 'data', value: 'a'.repeat(size) }));
    const captures = [
        { address: address('node-0'), direction: 'input', portId: 'in', artifact: x },
        { address: address('node-0'), direction: 'output', portId: 'out', artifact: z },
        { address: address('node-1'), direction: 'output', portId: 'out', artifact: y },
        { address: address('node-2'), direction: 'output', portId: 'out', artifact: x },
        { address: address('node-2'), direction: 'terminal', artifact: x },
    ];
    const build = order => {
        const recorder = recorderWithAllowance(p, 100000);
        for (const i of order) {
            recorder.capture(captures[i]);
            const snapshot = recorder.snapshot(); assert.ok(snapshot.retention.pendingBytes <= 100000); assert.ok(byteSize(snapshot) <= 4194304);
        }
        return recorder.finish();
    };
    const ascending = build([0, 1, 2, 3, 4]), reversed = build([4, 3, 2, 1, 0]);
    assert.deepEqual(ascending, reversed);
    assert.deepEqual(ascending.artifacts.map(entry => entry.format), ['structured', 'structured', 'omitted']);
    assert.equal(ascending.units[0].ports[0].artifact, 0);
    assert.equal(ascending.units[2].ports[1].artifact, 0);
    assert.equal(ascending.terminals[0].artifact, 0);
    assert.ok(ascending.artifacts.every(entry => byteSize(entry) <= 262144));
});

// A recording must never expose a live request or wrapper after accepting a root terminal outcome.
test('terminal failure and cancellation persist closed active requests and wrapper rows', () => {
    const p = plan(5); p.terminals = [];
    p.units[1].address.instancePath = ['instance']; p.units[1].requestBound = 1;
    p.units[2].address.instancePath = ['instance']; p.units[2].dependencies = [address('node-1', ['instance'])]; p.units[4].included = false;
    p.hierarchy = [{ address: address('instance'), kind: 'instance', included: true }]; p.callBound = 1;
    const build = status => {
        const recorder = api.createRunRecorder({ runId: 'run' }); recorder.accept(event(1, 'plan', { plan: p }));
        for (const e of [event(2, 'node-phase', { address: address('node-0'), phase: 'executing' }), event(3, 'node-settled', { address: address('node-0'), status: 'completed' }), event(4, 'node-phase', { address: address('node-1', ['instance']), phase: 'executing' }), event(5, 'request-start', { address: address('node-1', ['instance']), attempt: 1, maxTokens: 100, inputTokens: 11 })]) recorder.accept(e);
        if (status === 'cancelled') recorder.accept(event(6, 'run-cancelling'));
        recorder.accept(event(7, 'run-settled', { status, elapsedMs: 15, ...(status === 'failed' ? { error: { code: 'ROOT_FAILED', message: 'Runtime failed' } } : {}) }));
        return recorder.finish();
    };
    for (const status of ['failed', 'cancelled']) {
        const record = build(status), active = record.units[1];
        assert.equal(record.status, status); assert.equal(active.status, status); assert.equal(active.request.status, status);
        assert.equal(active.request.durationMs, 10); assert.equal(active.durationMs, 11); assert.equal(active.attempts, 1);
        for (const key of ['usage', 'finish', 'cost']) assert.equal(Object.hasOwn(active.request, key), false);
        assert.equal(projectRunRows(record).find(row => row.kind === 'instance').status, status);
        assert.equal(record.units[0].status, 'completed'); assert.equal(record.units[4].status, 'not-run');
        assert.equal(record.units[2].status, status === 'failed' ? 'blocked' : 'cancelled');
        assert.equal(record.units[3].status, status === 'failed' ? 'not-run' : 'cancelled');
        assert.ok(byteSize(record) <= 4194304);
    }
});


test('retained Pattern reports and JSON imports remain descriptive copies without live Filter admission', async () => {
    const { scanPatternDraft, getPatternReportBinding } = await import('../src/workflow/operations/pattern-engine.js?v=0.27.3');
    const { filterPatternDraft } = await import('../src/workflow/operations/filter-text.js?v=0.27.3');
    const { executePrimitive } = await import('../src/workflow/operations/nodes.js?v=0.27.3');
    const f = await import('./helpers/pattern-routing-fixtures.mjs'), input = f.draft(f.fourteen);
    const scan = await scanPatternDraft(input, f.settings()); assert.equal(scan.ok, true);
    const report = scan.outputs.matches, recorder = api.createRunRecorder({ runId: 'run' });
    assert.equal(recorder.accept(event(1, 'plan', { plan: plan() })).ok, true);
    assert.equal(recorder.capture({ address: address('node-0'), direction: 'output', portId: 'out', artifact: report }).ok, true);
    const recording = recorder.finish(), retained = recording.artifacts[0].value;
    assert.deepEqual(retained.value, report.value); assert.notEqual(retained.value, report.value);
    const decoded = await executePrimitive({ operation: 'json-decode', phase: 'post' }, { in: { kind: 'text', text: JSON.stringify(report.value) } });
    assert.equal(decoded.ok, true, JSON.stringify(decoded.error));
    const selected = await executePrimitive({ operation: 'select-fields', phase: 'post', fields: [{ name: 'report', path: [] }] }, { in: report });
    assert.equal(selected.ok, true, JSON.stringify(selected.error)); assert.deepEqual(selected.artifact.value.report, report.value);
    for (const copy of [retained, { kind: 'data', value: JSON.parse(JSON.stringify(report.value)) }, decoded.artifact, { kind: 'data', value: selected.artifact.value.report }]) {
        assert.equal(getPatternReportBinding(copy.value, input).error.code, 'INVALID_MATCH_REPORT');
        assert.equal(filterPatternDraft(input, copy, { action: 'remove', unit: 'paragraph', scope: 'whole', protectedLiterals: [] }, { nodeId: 'copied' }).error.code, 'INVALID_MATCH_REPORT');
    }
    assert.equal(getPatternReportBinding(report.value, input).ok, true, 'recording leaves the live report usable');
    assert.notEqual(recording.artifacts[0].truncated, true);
});
