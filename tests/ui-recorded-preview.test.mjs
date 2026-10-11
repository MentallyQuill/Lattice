import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectRecordedPreview } from '../src/ui/recorded-preview.js';
import { applyTextModifiers } from '../src/workflow/modifiers.js';
import { freeze } from '../src/workflow/record-data.js';
import { createRunRecorder } from '../src/workflow/recording.js';
import { snapshotContext } from '../src/workflow/host.js';

const recorded = (value, kind = value.kind) => ({ id: 0, origin: { address: 0, direction: 'output', port: 0 }, kind, format: 'structured', value });

test('retained draft preserves exact prose rather than its diagnostic envelope', () => {
    const result = projectRecordedPreview(recorded({ kind: 'draft', text: '**Reply**\n\n  exact whitespace\n' }));
    assert.deepEqual(result.sections[0].readable, { kind: 'text', text: '**Reply**\n\n  exact whitespace\n', truncated: false });
});

test('nonempty Candidate projects its own exact prose rather than draft or review prose', () => {
    const result = projectRecordedPreview(recorded({ kind: 'candidate', text: '# Candidate\n\n  Own exact reply\n', draft: { kind: 'draft', text: 'Earlier draft prose' }, review: { text: 'Review summary prose' }, changes: [{ replacement: 'Proposed replacement prose' }] }));
    assert.deepEqual(result.sections[0].readable, { kind: 'text', text: '# Candidate\n\n  Own exact reply\n', truncated: false });
    const source = JSON.parse(result.source.text);
    assert.equal(source.draft.text, 'Earlier draft prose');
    assert.equal(source.review.text, 'Review summary prose');
    assert.equal(source.changes[0].replacement, 'Proposed replacement prose');
});

test('complete native recording retains snapshot notices for recent limit plus 1000 individual omissions', () => {
    const chat = Array.from({ length: 1001 }, () => ({ mes: 'Unsupported synthetic message', is_tool: true }));
    const context = snapshotContext({ chat, chatId: 'synthetic' }, { node: { recentMessages: 1000, includeCharacter: false } });
    assert.equal(context.report.omissions.length, 1001);
    const address = { workflowId: 'synthetic-omissions', instancePath: [], nodeId: 'context' };
    const recorder = createRunRecorder({ runId: 'synthetic-omissions' });
    const plan = { workflowId: address.workflowId, phase: 'post', mode: 'root', units: [{ address, operation: 'context', included: true, dependencies: [], requestBound: 0, inputPorts: [], outputPorts: ['out'] }], hierarchy: [], terminals: [], callBound: 0 };
    assert.equal(recorder.accept({ runId: 'synthetic-omissions', seq: 1, type: 'plan', at: 1, elapsedMs: 1, plan }).ok, true);
    assert.equal(recorder.capture({ address, direction: 'output', portId: 'out', artifact: context }).ok, true);
    const artifact = recorder.finish().artifacts[0];
    assert.equal(artifact.format, 'structured');
    assert.equal(artifact.value.report.omissions.length, 1001);
    const projected = projectRecordedPreview(artifact).sections[0];
    assert.equal(projected.readable.snapshotOmittedMessages, 1001);
    assert.equal(projected.readable.omittedMessages, 0);
    assert.deepEqual(projected.notices, ['Snapshot omitted 1001 messages.']);
});

test('default content labels debit the same aggregate budget as large JSON', () => {
    const result = projectRecordedPreview(recorded({ kind: 'data', value: { text: 'x'.repeat(100000) } }));
    const section = result.sections[0];
    const displayedLabel = section.label ?? section.kind;
    assert.ok(Buffer.byteLength(displayedLabel) + Buffer.byteLength(section.readable.text) <= 65536);
    assert.equal(section.readable.truncated, true);
});

test('Source carries recording privacy projection while ordinary Data fields retain their meaning', () => {
    const address = { workflowId: 'synthetic', instancePath: [], nodeId: 'output' };
    const recorder = createRunRecorder({ runId: 'synthetic' });
    const plan = { workflowId: 'synthetic', phase: 'post', mode: 'root', units: [{ address, operation: 'text', included: true, dependencies: [], requestBound: 0, inputPorts: [], outputPorts: ['out'] }], hierarchy: [], terminals: [], callBound: 0 };
    assert.equal(recorder.accept({ runId: 'synthetic', seq: 1, type: 'plan', at: 1, elapsedMs: 1, plan }).ok, true);
    assert.equal(recorder.capture({ address, direction: 'output', portId: 'out', artifact: { kind: 'draft', text: 'Synthetic retained prose', source: { chatId: 'synthetic-chat', token: 'PRIVATE_TOKEN', originalText: 'PRIVATE_ORIGINAL' }, context: { kind: 'context', messages: [], source: { token: 'PRIVATE_NESTED', chatId: 'synthetic-chat' } } } }).ok, true);
    const result = projectRecordedPreview(recorder.finish().artifacts[0]);
    assert.equal(result.sections[0].readable.text, 'Synthetic retained prose');
    assert.ok(result.source.text.includes('synthetic-chat'));
    assert.ok(!result.source.text.includes('PRIVATE_'));
    assert.ok(!result.source.text.includes('"originalText"'));
    assert.ok(!result.source.text.includes('"token"'));
    const data = projectRecordedPreview(recorded({ kind: 'data', value: { token: 'ordinary token', originalText: 'ordinary value', recordType: 'pattern-matches', schemaVersion: 1 } }));
    assert.equal(data.sections[0].readable.kind, 'json');
    assert.deepEqual(JSON.parse(data.sections[0].readable.text), { token: 'ordinary token', originalText: 'ordinary value', recordType: 'pattern-matches', schemaVersion: 1 });
});

test('malformed recording metadata cannot invoke coercion hooks or exceed the readable budget', () => {
    let reads = 0;
    const reason = { toString() { reads++; return 'private hook'; } };
    const result = projectRecordedPreview({ kind: 'draft', format: 'omitted', reason });
    assert.equal(reads, 0);
    assert.equal(result.source.text, 'Artifact omitted: unavailable');
    const oversized = projectRecordedPreview({ kind: 'draft', format: 'omitted', reason: '😀'.repeat(100000) });
    assert.ok(Buffer.byteLength(oversized.sections[0].readable.reason) <= 65536);
    const partial = projectRecordedPreview({ kind: 'context', format: 'json-prefix-text', text: reason });
    assert.equal(partial.source.text, '');
    assert.equal(reads, 0);
    const mismatch = projectRecordedPreview(recorded({ kind: 'data', text: 'not Draft', context: { kind: 'context', messages: [] } }, 'draft'));
    assert.equal(mismatch.sections.length, 1);
    assert.equal(mismatch.sections[0].readable.kind, 'json');
});

test('immutable retained identity preserves cached projection references', () => {
    const artifact = freeze(recorded({ kind: 'draft', text: 'retained', context: { kind: 'context', messages: [] } }));
    const first = projectRecordedPreview(artifact);
    const second = projectRecordedPreview(artifact);
    assert.strictEqual(second, first);
    assert.strictEqual(second.source, first.source);
    assert.strictEqual(second.sections, first.sections);
    assert.ok(Object.isFrozen(first.sections[0].readable));
    const mutable = recorded({ kind: 'text', text: 'before' });
    assert.equal(projectRecordedPreview(mutable).sections[0].readable.text, 'before');
    mutable.value.text = 'after';
    assert.equal(projectRecordedPreview(mutable).sections[0].readable.text, 'after');
});

test('Text modifier Output, Raw output, and trace remain readable subsections of one Source', () => {
    const modified = applyTextModifiers('raw output', [{ id: 'append', type: 'wrap', version: 1, enabled: true, settings: { prefix: '', suffix: '\nextra' } }]);
    assert.equal(modified.ok, true);
    const artifact = recorded({ kind: 'text', text: modified.data.text, modifiers: { rawText: 'raw output', trace: modified.data.trace } });
    const result = projectRecordedPreview(artifact);
    assert.deepEqual(result.sections.map(section => section.label), ['Output', 'Raw output', 'Modifier trace']);
    assert.equal(result.sections[0].readable.text, 'raw output\nextra');
    assert.equal(result.sections[0].recordedRawText, 'raw output');
    assert.deepEqual(result.sections[0].recordedModifierTrace, modified.data.trace);
    assert.equal(result.sections[1].readable.text, 'raw output');
    assert.equal(result.sections[2].readable.kind, 'json');
    assert.equal(JSON.parse(result.source.text).modifiers.rawText, 'raw output');
});

test('known Patches wrapper separates proposed changes from its typed draft', () => {
    const result = projectRecordedPreview(recorded({ kind: 'patches', patches: [{ index: 0, replacement: 'New wording' }], draft: { kind: 'draft', text: 'Old wording', context: { kind: 'context', messages: [] } } }));
    assert.equal(result.sections[0].label, 'Proposed changes');
    assert.deepEqual(JSON.parse(result.sections[0].readable.text), [{ index: 0, replacement: 'New wording' }]);
    assert.equal(result.sections[1].label, 'Draft');
    assert.equal(result.sections[1].readable.text, 'Old wording');
    assert.equal(result.sections[2].readable.kind, 'messages');
    assert.ok(result.source.text.includes('"patches"'));
    const misleading = projectRecordedPreview(recorded({ kind: 'data', value: { kind: 'patches', draft: { kind: 'draft', text: 'ordinary data' }, patches: [] } }));
    assert.equal(misleading.sections.length, 1);
    assert.equal(misleading.sections[0].readable.kind, 'json');
});

test('snapshot report omissions count omitted records separately from display omissions', () => {
    const result = projectRecordedPreview(recorded({ kind: 'context', messages: [], report: { code: 'BOUNDED_CONTEXT', omissions: [
        { omittedMessages: 2, reason: 'recent-message limit' },
        { id: 'chat:4', omittedCharacters: 20000, reason: 'snapshot character limit' },
        { id: 'chat:5', reason: 'restricted visibility' }
    ] } }));
    assert.equal(result.sections[0].readable.snapshotOmittedMessages, 4);
    assert.equal(result.sections[0].readable.omittedMessages, 0);
    assert.deepEqual(result.sections[0].notices, ['Snapshot omitted 4 messages.']);
    const huge = projectRecordedPreview(recorded({ kind: 'data', value: { text: 'x'.repeat(100000) } }));
    assert.equal(huge.sections[0].readable.truncated, true);
    assert.ok(Buffer.byteLength(huge.sections[0].readable.text) <= 65536);
});

test('own data inspection never reads getters, prototypes, JSON hooks, or private host state', () => {
    let reads = 0;
    const value = { kind: 'draft', text: 'retained own text' };
    Object.defineProperty(value, 'context', { enumerable: true, get() { reads++; throw Error('private getter'); } });
    Object.defineProperty(value, 'toJSON', { value() { reads++; throw Error('JSON hook'); } });
    const result = projectRecordedPreview(recorded(value));
    assert.equal(reads, 0);
    assert.equal(result.sections[0].readable.text, 'retained own text');
    assert.equal(result.source.text.includes('private'), false);
    const inherited = Object.create({ text: 'inherited secret' }); inherited.kind = 'text';
    assert.equal(projectRecordedPreview(recorded(inherited)).sections[0].readable.kind, 'json');
    const cycle = { kind: 'data' }; cycle.value = cycle;
    assert.doesNotThrow(() => projectRecordedPreview(recorded(cycle)));
    const envelope = Object.create({ format: 'structured', value: { kind: 'text', text: 'secret' } }); envelope.kind = 'text';
    assert.equal(projectRecordedPreview(envelope).source.format, 'omitted');
    const malformedContext = { kind: 'context', messages: [{ id: 'same', role: 'user', text: 'first' }, { id: 'same', role: 'invalid', text: 'second' }] };
    assert.equal(projectRecordedPreview(recorded(malformedContext)).sections[0].readable.kind, 'json');
});

test('one UTF-8 budget includes draft prose and message labels, clipping a final body safely', () => {
    const result = projectRecordedPreview(recorded({ kind: 'draft', text: 'D'.repeat(32768), context: { kind: 'context', messages: [
        { id: 'a', role: 'user', text: 'A'.repeat(16384) },
        { id: 'b', role: 'assistant', speaker: 'Captured', timestamp: 'today', text: '😀'.repeat(10000) },
        { id: 'c', role: 'user', text: 'later' }
    ], report: { omissions: [{ omittedMessages: 4 }] } } }));
    const readable = result.sections[1].readable;
    assert.equal(readable.messages.length, 2);
    assert.equal(readable.messages[0].text, 'A'.repeat(16384));
    assert.equal(readable.messages[1].truncated, true);
    // Draft/body + both section titles + metadata + snapshot notice leaves 16,293 bytes.
    assert.equal(readable.messages[1].text, '😀'.repeat(4073));
    assert.equal(readable.omittedMessages, 1);
    assert.equal(readable.snapshotOmittedMessages, 4);
    const total = result.sections[1].notices.reduce((n, text) => n + Buffer.byteLength(text), 0) + Buffer.byteLength(result.sections[0].label) + Buffer.byteLength(result.sections[1].label) + Buffer.byteLength(result.sections[0].readable.text) + readable.messages.reduce((n, m) => n + ['id', 'role', 'speaker', 'timestamp', 'text'].reduce((s, key) => s + Buffer.byteLength(m[key] ?? ''), 0), 0);
    assert.ok(total <= 65536);
    assert.ok(Buffer.byteLength(result.source.text) <= 65536);
    assert.equal(result.source.truncated, true);
    assert.equal(result.source.format, 'structured-text');
    assert.ok(!/[\uD800-\uDBFF]$/u.test(readable.messages[1].text));
});

test('Source is the complete indented retained artifact while prefixes never become readable messages', () => {
    const value = { kind: 'draft', text: 'reply', source: { chatId: 'retained' }, context: { kind: 'context', messages: [] } };
    const result = projectRecordedPreview(recorded(value));
    assert.deepEqual(result.source, { format: 'structured-text', text: '{\n  "kind": "draft",\n  "text": "reply",\n  "source": {\n    "chatId": "retained"\n  },\n  "context": {\n    "kind": "context",\n    "messages": []\n  }\n}', truncated: false, policy: 'safe-recording' });
    const prefix = projectRecordedPreview({ kind: 'context', format: 'json-prefix-text', text: '{"kind":"context","messages":[', truncated: true });
    assert.equal(prefix.source.format, 'json-prefix-text');
    assert.equal(prefix.source.text, '{"kind":"context","messages":[');
    assert.equal(prefix.source.truncated, true);
    assert.equal(prefix.sections[0].readable.kind, 'unavailable');
    assert.match(prefix.sections[0].readable.reason, /partial/i);
    const omitted = projectRecordedPreview({ kind: 'text', format: 'omitted', reason: 'canonical-prefix-limit' });
    assert.equal(omitted.source.format, 'omitted');
    assert.match(omitted.source.text, /canonical-prefix-limit/);
    assert.equal(omitted.source.policy, 'safe-recording');
    assert.equal(omitted.sections[0].readable.kind, 'unavailable');
    assert.equal(projectRecordedPreview(undefined).source.format, 'omitted');
});

test('empty retained context differs from unavailable context and malformed context', () => {
    const empty = projectRecordedPreview(recorded({ kind: 'draft', text: 'reply', context: { kind: 'context', messages: [] } })).sections[1];
    assert.equal(empty.label, 'No captured messages');
    assert.deepEqual(empty.readable.messages, []);
    const missing = projectRecordedPreview(recorded({ kind: 'draft', text: 'reply' })).sections[1];
    assert.equal(missing.readable.kind, 'unavailable');
    assert.match(missing.readable.reason, /not retained/);
    const malformed = projectRecordedPreview(recorded({ kind: 'context', messages: [{ role: 'user', text: 'no id' }] })).sections[0];
    assert.equal(malformed.readable.kind, 'json');
});

test('draft context preserves ordered messages and captured metadata in a separate collapsed section', () => {
    const result = projectRecordedPreview(recorded({ kind: 'draft', text: 'own draft', context: { kind: 'context', messages: [
        { id: 'a', role: 'user', text: 'First\n\nmessage', speaker: 'Captured Name', timestamp: '2026-10-10' },
        { id: 'b', role: 'assistant', text: '' }, { id: 'c', role: 'user', text: 'Third' }
    ], report: { omissions: [{ omittedMessages: 2, reason: 'recent-message limit' }] } } }));
    const context = result.sections[1];
    assert.equal(result.sections[0].readable.text, 'own draft');
    assert.equal(context.label, 'Captured context · 3 messages');
    assert.equal(context.collapsed, true);
    assert.deepEqual(context.readable.messages, [
        { id: 'a', role: 'user', text: 'First\n\nmessage', speaker: 'Captured Name', timestamp: '2026-10-10', truncated: false },
        { id: 'b', role: 'assistant', text: '', truncated: false }, { id: 'c', role: 'user', text: 'Third', truncated: false }
    ]);
    assert.equal(context.readable.snapshotOmittedMessages, 2);
    assert.equal(context.readable.omittedMessages, 0);
});

test('typed prose only recognizes declared matching kinds and Data remains JSON', () => {
    for (const kind of ['text', 'guidance', 'candidate']) {
        assert.deepEqual(projectRecordedPreview(recorded({ kind, text: '' })).sections[0].readable, { kind: 'text', text: '', truncated: false });
    }
    const value = { text: 'ordinary data', messages: [{ role: 'user', text: 'ordinary nested data' }], token: 'ordinary data token' };
    const result = projectRecordedPreview(recorded({ kind: 'data', value })).sections[0].readable;
    assert.equal(result.kind, 'json');
    assert.deepEqual(JSON.parse(result.text), value);
    assert.match(result.text, /\n  "text"/);
    assert.equal(projectRecordedPreview(recorded({ kind: 'draft', text: 'untrusted mismatch' }, 'data')).sections[0].readable.kind, 'json');
});


const patternReport = () => ({
    recordType: 'pattern-matches', schemaVersion: 1, status: 'complete', matched: true,
    totalOccurrences: 14, matchedRuleCount: 2,
    rules: [{ id: 'one', pattern: '1', label: 'Ones', count: 12 }, { id: 'two', pattern: '2', count: 0 }, { id: 'three', pattern: '3', count: 2 }],
    occurrences: Array.from({ length: 14 }, (_, index) => ({ ruleId: index < 12 ? 'one' : 'three', ruleIndex: index < 12 ? 0 : 2, start: index * 2, end: index * 2 + 1, text: index < 12 ? '1' : '3', protected: index === 0, editable: index !== 0 })),
    source: { revisionId: 'old-revision', rootRevisionId: 'old-root', textLength: 28, bodyLength: 28 },
    settings: { mode: 'whole-word', scope: 'whole', caseSensitive: false, matchPolicy: 'any', minOccurrences: 1, regexFlags: '' }, diagnostics: [],
});
const filterReport = overrides => ({ recordType: 'text-filter', schemaVersion: 1, status: 'complete', action: 'remove', unit: 'line', units: [{ start: 0, end: 11, text: '  remove 雪\n', blocked: false }], originalBodyLength: 20, resultBodyLength: 9, retainedUnitCount: 1, diagnostics: [], ...overrides });
const reportArtifact = report => recorded({ kind: 'data', value: report });

test('recorded Pattern report preserves authored 12/0/2 counts and exact protected occurrence rows without binding authority', () => {
    const input = freeze(reportArtifact(patternReport()));
    const result = projectRecordedPreview(input), summary = result.sections[0].readable.report;
    assert.equal(result.sections[0].readable.kind, 'pattern-matches');
    assert.equal(summary.totalOccurrences, 14);
    assert.deepEqual(summary.rules.map(rule => rule.count), [12, 0, 2]);
    assert.equal(summary.occurrences.length, 14);
    assert.deepEqual(summary.occurrences[0], { ruleId: 'one', ruleIndex: 0, start: 0, end: 1, text: '1', protected: true, editable: false, truncated: false });
    assert.match(result.sections[0].notices.join(' '), /recorded.*current/i);
    assert.equal('source' in summary, false);
    assert.equal('settings' in summary, false);
    assert.equal(summary.truncated, false);
    assert.ok(Object.isFrozen(summary));
    assert.strictEqual(projectRecordedPreview(input), result);
    assert.equal(JSON.parse(result.source.text).value.source.revisionId, 'old-revision');
});

test('unresolved Pattern counts stay unknown and diagnostics stay visible', () => {
    const report = patternReport(); Object.assign(report, { status: 'unresolved', matched: null, totalOccurrences: null, matchedRuleCount: null, occurrences: [], diagnostics: [{ code: 'UNMATCHED_QUOTES', message: 'Unmatched narration quote.' }] });
    report.rules.forEach(rule => { rule.count = null; });
    const content = projectRecordedPreview(reportArtifact(report)).sections[0].readable;
    assert.equal(content.kind, 'pattern-matches');
    assert.equal(content.report.totalOccurrences, null);
    assert.deepEqual(content.report.rules.map(rule => rule.count), [null, null, null]);
    assert.deepEqual(content.report.diagnostics, [{ code: 'UNMATCHED_QUOTES', message: 'Unmatched narration quote.' }]);
});

test('malformed report discriminants, counts, offsets and inherited fields stay generic Data', () => {
    const cases = [
        { ...patternReport(), schemaVersion: 2 }, { ...patternReport(), recordType: 'other' },
        { ...patternReport(), totalOccurrences: 15 }, { ...patternReport(), occurrences: [{ ...patternReport().occurrences[0], start: -1 }] },
        { ...patternReport(), source: {} }, { ...patternReport(), diagnostics: [{ code: 'BAD' }] },
        filterReport({ status: 'unknown' }), filterReport({ units: [{ start: 0, end: 1, text: 'x', blocked: 'yes' }] }),
    ];
    for (const report of cases) assert.equal(projectRecordedPreview(reportArtifact(report)).sections[0].readable.kind, 'json');
    let reads = 0;
    const getter = patternReport(); Object.defineProperty(getter, 'status', { enumerable: true, get() { reads++; return 'complete'; } });
    assert.equal(projectRecordedPreview(reportArtifact(getter)).sections[0].readable.kind, 'json'); assert.equal(reads, 0);
    const inherited = Object.create(patternReport());
    assert.equal(projectRecordedPreview(reportArtifact(inherited)).sections[0].readable.kind, 'json');
});

test('Filter reports retain exact selected unit text and completed, blocked, no-op and empty states', () => {
    const cases = [filterReport(), filterReport({ status: 'blocked', resultBodyLength: 9, units: [{ start: 0, end: 11, text: '  remove 雪\n', blocked: true }], diagnostics: [{ code: 'FILTER_PERMISSION_BLOCKED', message: 'An atomic line crosses a protection.' }] }), filterReport({ units: [], resultBodyLength: 20, retainedUnitCount: 2 }), filterReport({ status: 'empty', resultBodyLength: 0, retainedUnitCount: 0, units: [{ start: 0, end: 20, text: '  remove 雪\nKeep text', blocked: false }], diagnostics: [{ code: 'EMPTY_FILTER_RESULT', message: 'The proposed result is empty.' }] })];
    for (const report of cases) {
        const content = projectRecordedPreview(reportArtifact(report)).sections[0].readable;
        assert.equal(content.kind, 'text-filter');
        assert.equal(content.report.status, report.status);
        assert.deepEqual(content.report.units.map(unit => unit.text), report.units.map(unit => unit.text));
        assert.deepEqual(content.report.diagnostics, report.diagnostics);
        assert.equal(content.report.resultBodyLength, report.resultBodyLength);
        assert.equal(content.report.truncated, false);
    }
});

test('report display bounds label partial retained evidence, preserve counts and exact Unicode-safe prefix', () => {
    const report = filterReport({ originalBodyLength: 100000, resultBodyLength: 1, units: [{ start: 0, end: 99999, text: '😀'.repeat(49999) + 'x', blocked: false }] });
    const result = projectRecordedPreview(reportArtifact(report)), summary = result.sections[0].readable.report;
    assert.equal(result.sections[0].readable.kind, 'text-filter');
    assert.equal(summary.truncated, true);
    assert.equal(summary.units[0].truncated, true);
    assert.equal(summary.originalBodyLength, 100000);
    assert.ok(Buffer.byteLength(summary.units[0].text) < 65536);
    assert.ok(report.units[0].text.startsWith(summary.units[0].text));
    assert.ok(!/[\uD800-\uDBFF]$/u.test(summary.units[0].text));
    assert.equal(result.sections[0].truncated, true);
    assert.equal(result.source.truncated, true);
});


test('actual synthetic Pattern-to-Filter capture projects typed reports beside exact final Draft output', async () => {
    const { scanPatternDraft } = await import('../src/workflow/operations/pattern-engine.js?v=0.27.0');
    const { filterPatternDraft } = await import('../src/workflow/operations/filter-text.js?v=0.27.0');
    const body = 'First.\r\n\r\n' + '1 '.repeat(12) + '3 3\r\n\r\nLast.';
    const draft = { kind: 'draft', text: body, source: { originalText: body, token: 'PRIVATE_AUTHORITY' } };
    const scanned = await scanPatternDraft(draft, { ...patternReport().settings, rules: patternReport().rules.map(({ count, ...rule }) => rule), exemptions: [], protectedLiterals: [], timeoutMs: 1000 });
    assert.equal(scanned.ok, true, JSON.stringify(scanned.error));
    const filtered = filterPatternDraft(draft, scanned.outputs.matches, { action: 'remove', unit: 'paragraph', scope: 'whole', protectedLiterals: [] }, { nodeId: 'filter' });
    assert.equal(filtered.ok, true, JSON.stringify(filtered.error));
    const recorder = createRunRecorder({ runId: 'synthetic-reports' });
    const address = { workflowId: 'synthetic-reports', instancePath: [], nodeId: 'filter' };
    const plan = { workflowId: 'synthetic-reports', phase: 'post', mode: 'root', units: [{ address, operation: 'filter-text', included: true, dependencies: [], requestBound: 0, inputPorts: [], outputPorts: ['matches', 'report', 'out'] }], hierarchy: [], terminals: [], callBound: 0 };
    assert.equal(recorder.accept({ runId: 'synthetic-reports', seq: 1, type: 'plan', at: 1, elapsedMs: 1, plan }).ok, true);
    for (const [portId, artifact] of [['matches', scanned.outputs.matches], ['report', filtered.outputs.report], ['out', filtered.outputs.out]]) assert.equal(recorder.capture({ address, direction: 'output', portId, artifact }).ok, true);
    const projected = recorder.finish().artifacts.map(projectRecordedPreview);
    assert.equal(projected[0].sections[0].readable.kind, 'pattern-matches');
    assert.deepEqual(projected[0].sections[0].readable.report.rules.map(rule => rule.count), [12, 0, 2]);
    assert.equal(projected[1].sections[0].readable.kind, 'text-filter');
    assert.deepEqual(projected[1].sections[0].readable.report.units.map(unit => unit.text), ['1 '.repeat(12) + '3 3\r\n\r\n']);
    assert.equal(projected[2].sections[0].readable.text, 'First.\r\n\r\nLast.');
    for (const preview of projected) assert.equal(preview.source.text.includes('PRIVATE_AUTHORITY'), false);
});
