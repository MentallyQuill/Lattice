import assert from 'node:assert/strict';
import { test } from 'node:test';
const models = await import('../src/workflow/operations/model-nodes.js?v=0.27.3').catch(() => ({}));
const revisions = await import('../src/workflow/draft-revisions.js?v=0.27.3');
const root = text => ({ kind: 'draft', text, source: { originalText: text, chatId: 'story', token: 'native-token' } });
const node = (operation, settings = {}) => ({ id: operation + '-node', operation, ...settings });
const must = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result; };

test('Revise Draft requests current parent prose and returns a checked successor instead of generic Text', async () => {
    assert.equal(typeof models.executeModelNode, 'function', 'Composable model adapters are required');
    const first = revisions.createDraftRevision(root('Original prose.'), 'First prose.', { nodeId: 'first', scope: 'whole' }).data.draft;
    let calls = 0;
    const result = must(await models.executeModelNode(node('revise-draft', { scope: 'whole', instructions: 'Tighten prose' }), { draft: first }, { phase: 'post', request: async request => {
        calls++;
        assert.equal(JSON.parse(request.messages[1].content).draft, 'First prose.');
        return { ok: true, data: { text: 'Tight prose.', finish: 'stop', usage: { completion_tokens: 3 } } };
    } }));
    assert.equal(result.artifact.kind, 'draft');
    assert.equal(result.artifact.text, 'Tight prose.');
    assert.equal(revisions.toFinalCandidate(result.artifact).data.candidate.original, 'Original prose.');
    assert.equal(calls, 1);
});
test('Model Call validates structured output and never grants Draft authority to generated text', async () => {
    const operation = node('model-call', { outputKind: 'data', schema: '{"type":"object","required":["effect"],"properties":{"effect":{"type":"string"}},"additionalProperties":false}' });
    const structured = must(await models.executeModelNode(operation, { prompt: { kind: 'text', text: 'Invent a spell effect.' } }, { phase: 'pre', request: async () => ({ ok: true, data: { text: '{"effect":"paper moths"}', finish: 'stop' } }) }));
    assert.equal(structured.artifact.kind, 'data');
    assert.deepEqual(structured.artifact.value, { effect: 'paper moths' });
    const invalid = await models.executeModelNode(operation, { prompt: { kind: 'text', text: 'Invent' } }, { phase: 'pre', request: async () => ({ ok: true, data: { text: '{"effect":3}', finish: 'stop' } }) });
    assert.equal(invalid.error.code, 'SCHEMA_MISMATCH');
    const text = must(await models.executeModelNode(node('model-call'), { prompt: { kind: 'text', text: 'Write prose' } }, { phase: 'post', request: async () => ({ ok: true, data: { text: 'New prose.', finish: 'stop' } }) }));
    assert.equal(revisions.toFinalCandidate(text.artifact).ok, false);
});
test('private model material retains its disclosure scope and cannot enter a public Draft revision', async () => {
    const privateData = { kind: 'data', visibility: { kind: 'actor-private', actorId: 'mara' }, value: { memory: 'hidden fear' } };
    const output = must(await models.executeModelNode(node('model-call'), { prompt: { kind: 'text', text: 'Summarize' }, data: privateData }, { phase: 'pre', request: async () => ({ ok: true, data: { text: 'Private thought', finish: 'stop' } }) }));
    assert.deepEqual(output.artifact.visibility, { kind: 'actor-private', actorId: 'mara' });
    let calls = 0;
    const revised = await models.executeModelNode(node('revise-draft', { scope: 'whole' }), { draft: root('Public story.'), reference: privateData }, { phase: 'post', request: async () => { calls++; return { ok: true, data: { text: 'Leaks memory', finish: 'stop' } }; } });
    assert.equal(revised.error.code, 'PRIVATE_MATERIAL');
    assert.equal(calls, 0);
});
test('Draft Text and literal Extract preserve parent provenance without model calls or prose replacement', async () => {
    const draft = revisions.createDraftRevision(root('Original.'), 'Mara holds the broken wand.', { nodeId: 'prose', scope: 'whole' }).data.draft;
    let calls = 0;
    const text = must(await models.executeModelNode(node('draft-text'), { draft }, { phase: 'post', request: async () => { calls++; throw new Error('unused'); } }));
    assert.equal(text.artifact.text, 'Mara holds the broken wand.');
    assert.equal(text.artifact.provenance.revisionId, draft.revisionId);
    assert.equal(revisions.toFinalCandidate(text.artifact).ok, false);
    const extracted = must(await models.executeModelNode(node('extract', { mode: 'literal', patterns: [{ id: 'wand', literal: 'broken wand', label: 'Wand' }] }), { source: draft }, { phase: 'post', request: async () => { calls++; throw new Error('unused'); } }));
    assert.equal(extracted.artifact.kind, 'data');
    assert.equal(extracted.artifact.value.records[0].id, 'wand:15');
    assert.deepEqual(extracted.artifact.value.records[0].evidence, [{ start: 15, end: 26, quote: 'broken wand' }]);
    assert.equal(extracted.artifact.value.sourceRefs[0].revisionId, draft.revisionId);
    assert.equal(draft.text, 'Mara holds the broken wand.');
    assert.equal(calls, 0);
});
test('literal Extract can match capitalized words without matching map inside roadmap', async () => {
    const source = root('Map in the roadmap beside a MAP and lantern.');
    const result = must(await models.executeModelNode(node('extract', { mode: 'literal', caseSensitive: false, match: 'word', patterns: [{ id: 'map', literal: 'map', label: 'Map' }] }), { source }, { phase: 'post' }));
    assert.deepEqual(result.artifact.value.records.map(record => ({ text: record.text, evidence: record.evidence })), [
        { text: 'Map', evidence: [{ start: 0, end: 3, quote: 'Map' }] },
        { text: 'MAP', evidence: [{ start: 28, end: 31, quote: 'MAP' }] },
    ]);
    assert.equal(result.reports[0].actualCalls, 0);
});
test('literal Extract uses Unicode case folding without shifting original UTF-16 evidence', async () => {
    const result = must(await models.executeModelNode(node('extract', { mode: 'literal', caseSensitive: false, patterns: [{ id: 'k', literal: 'k', label: 'K' }] }), { source: root('İ 😀 K k') }, { phase: 'post' }));
    assert.deepEqual(result.artifact.value.records.map(record => ({ id: record.id, text: record.text, evidence: record.evidence })), [
        { id: 'k:5', text: 'K', evidence: [{ start: 5, end: 6, quote: 'K' }] },
        { id: 'k:7', text: 'k', evidence: [{ start: 7, end: 8, quote: 'k' }] },
    ]);
});
test('literal Extract word matching rejects adjacent Unicode letters, marks, digits and underscores', async () => {
    const result = must(await models.executeModelNode(node('extract', { mode: 'literal', caseSensitive: false, match: 'word', patterns: [{ id: 'map', literal: 'map', label: 'Map' }] }), { source: root('émAP 𐐀MAP MAP𐐀 MAP\u0301 _MAP MAP2 😀MAP') }, { phase: 'post' }));
    assert.deepEqual(result.artifact.value.records.map(record => record.evidence), [[{ start: 34, end: 37, quote: 'MAP' }]]);
});
test('literal Extract keeps regex metacharacters literal when matching case-insensitively', async () => {
    const result = must(await models.executeModelNode(node('extract', { mode: 'literal', caseSensitive: false, patterns: [{ id: 'plus', literal: 'a+b', label: 'Plus' }, { id: 'brackets', literal: '[map]', label: 'Brackets' }] }), { source: root('A+B a+b aaab [MAP] [map]') }, { phase: 'post' }));
    assert.deepEqual(result.artifact.value.records.map(record => record.evidence), [
        [{ start: 0, end: 3, quote: 'A+B' }], [{ start: 4, end: 7, quote: 'a+b' }],
        [{ start: 13, end: 18, quote: '[MAP]' }], [{ start: 19, end: 24, quote: '[map]' }],
    ]);
});
test('saved literal Extract defaults retain case-sensitive nonoverlapping substring matches', async () => {
    const map = must(await models.executeModelNode(node('extract', { mode: 'literal', patterns: [{ id: 'map', literal: 'map', label: 'Map' }] }), { source: root('Map in the roadmap beside a MAP and lantern.') }, { phase: 'post' }));
    assert.deepEqual(map.artifact.value.records.map(record => record.evidence), [[{ start: 15, end: 18, quote: 'map' }]]);
    const repeated = must(await models.executeModelNode(node('extract', { mode: 'literal', patterns: [{ id: 'pair', literal: 'aa', label: 'Pair' }] }), { source: root('aaa') }, { phase: 'post' }));
    assert.deepEqual(repeated.artifact.value.records.map(record => record.evidence), [[{ start: 0, end: 2, quote: 'aa' }]]);
});
test('model extraction checks quoted evidence and keeps its semantic claims proposed', async () => {
    const source = root('Mara holds a compass.');
    const records = [{ id: 'compass', label: 'Compass', text: 'Mara holds a compass', classification: 'observation', evidence: [{ start: 13, end: 20, quote: 'compass' }] }];
    const result = must(await models.executeModelNode(node('extract'), { source }, { phase: 'post', request: async () => ({ ok: true, data: { text: JSON.stringify(records), finish: 'stop' } }) }));
    assert.equal(result.artifact.value.records[0].status, 'proposed');
    assert.equal(result.artifact.value.records[0].id, 'compass');
    const invalid = await models.executeModelNode(node('extract'), { source }, { phase: 'post', request: async () => ({ ok: true, data: { text: JSON.stringify([{ ...records[0], evidence: [{ start: 0, end: 5, quote: 'ghost' }] }]), finish: 'stop' } }) });
    assert.equal(invalid.error.code, 'INVALID_EVIDENCE');
});
test('Enrich retains record identity and evidence while labeling model additions as generated proposals', async () => {
    const data = { kind: 'data', visibility: { kind: 'public' }, value: { type: 'extracted-records', sourceRefs: [{ kind: 'draft', revisionId: 'r1' }], records: [{ id: 'wand', label: 'Wand', text: 'Broken wand', classification: 'observation', status: 'proposed', evidence: [{ start: 0, end: 11, quote: 'Broken wand' }] }] } };
    const output = must(await models.executeModelNode(node('enrich', { instructions: 'Expand details' }), { data, context: { kind: 'context', messages: [{ id: 'm1', role: 'assistant', text: 'The wand is ashwood.' }] } }, { phase: 'post', request: async () => ({ ok: true, data: { text: '[{"id":"wand","details":"Ashwood grain and a fractured tip."}]', finish: 'stop' } }) }));
    const record = output.artifact.value.records[0];
    assert.equal(record.id, 'wand');
    assert.deepEqual(record.evidence, data.value.records[0].evidence);
    assert.equal(record.text, 'Broken wand');
    assert.equal(record.additions[0].classification, 'generated-proposal');
    const unknown = await models.executeModelNode(node('enrich'), { data }, { phase: 'pre', request: async () => ({ ok: true, data: { text: '[{"id":"sword","details":"New item"}]', finish: 'stop' } }) });
    assert.equal(unknown.error.code, 'INVALID_ENRICHMENT');
    let calls = 0;
    const empty = must(await models.executeModelNode(node('enrich'), { data: { ...data, value: { ...data.value, records: [] } } }, { phase: 'post', request: async () => { calls++; throw new Error(); } }));
    assert.deepEqual(empty.artifact.value.records, []);
    assert.equal(calls, 0);
});
test('Render Notes escapes field markup, labels generated details and rejects hidden records', async () => {
    const data = { kind: 'data', visibility: { kind: 'public' }, value: { type: 'enriched-records', sourceRefs: [], records: [{ id: 'wand', label: '<img src=x onerror=run()>', text: 'Broken & bent', classification: 'observation', evidence: [], additions: [{ text: '<script>steal()</script>', classification: 'generated-proposal' }] }] } };
    const rendered = must(await models.executeModelNode(node('render-notes', { title: '<Scene>' }), { data }, { phase: 'post' }));
    assert.match(rendered.artifact.text, /<details>/);
    assert.match(rendered.artifact.text, /&lt;img/);
    assert.equal(rendered.artifact.text.includes('<script>'), false);
    assert.match(rendered.artifact.text, /Generated proposal/);
    const hidden = await models.executeModelNode(node('render-notes'), { data: { ...data, value: { ...data.value, records: [{ ...data.value.records[0], visibility: { kind: 'actor-private', actorId: 'mara' } }] } } }, { phase: 'post' });
    assert.equal(hidden.error.code, 'PRIVATE_MATERIAL');
    const unlabeled = await models.executeModelNode(node('render-notes'), { data: { kind: 'data', value: data.value } }, { phase: 'post' });
    assert.equal(unlabeled.error.code, 'VISIBILITY_REQUIRED');
});
test('Append preserves the exact current body and replaces its own pending section on retry', async () => {
    const draft = revisions.createDraftRevision(root('Original.'), 'Revised body.', { nodeId: 'prose', scope: 'whole' }).data.draft;
    const first = must(await models.executeModelNode(node('combine', { mode: 'append', sectionId: 'notes' }), { draft, section: { kind: 'text', text: 'Notes one.', visibility: { kind: 'public' } } }, { phase: 'post' })).artifact;
    assert.equal(first.text, 'Revised body.\n\nNotes one.');
    const replaced = must(await models.executeModelNode(node('append', { sectionId: 'notes' }), { draft: first, section: { kind: 'text', text: 'Notes two.', visibility: { kind: 'public' } } }, { phase: 'post' })).artifact;
    assert.equal(replaced.text, 'Revised body.\n\nNotes two.');
    const candidate = revisions.toFinalCandidate(replaced).data.candidate;
    assert.equal(candidate.original, 'Original.');
    assert.equal(candidate.source.originalText, 'Original.');
    const privateAppend = await models.executeModelNode(node('append'), { draft, section: { kind: 'text', text: 'Secret', visibility: { kind: 'actor-private', actorId: 'mara' } } }, { phase: 'post' });
    assert.equal(privateAppend.error.code, 'PRIVATE_MATERIAL');
    const base = must(await models.executeModelNode(node('append'), { draft }, { phase: 'post' })).artifact;
    assert.equal(base.text, 'Revised body.');
});
test('notes fallback remains safe markup and identifies unconfirmed observations as proposed', async () => {
    const data = { kind: 'data', visibility: { kind: 'public' }, value: { type: 'extracted-records', sourceRefs: [], records: [{ id: 'x', label: '<b>Item</b>', text: '<script>x</script>', classification: 'observation', status: 'proposed', evidence: [] }] } };
    const output = must(await models.executeModelNode(node('render-notes', { format: 'text' }), { data }, { phase: 'post' }));
    assert.equal(output.artifact.text.includes('<script>'), false);
    assert.match(output.artifact.text, /Proposed observation/);
});
test('Revise Draft with no editable windows produces a checked unchanged successor without requesting', async () => {
    let calls = 0;
    const result = must(await models.executeModelNode(node('revise-draft', { scope: 'whole', protectedLiterals: ['KEEP'] }), { draft: root('KEEP') }, { phase: 'post', request: async () => { calls++; throw new Error('should not request'); } }));
    assert.equal(result.artifact.text, 'KEEP');
    assert.equal(revisions.toFinalCandidate(result.artifact).data.candidate.original, 'KEEP');
    assert.equal(calls, 0);
});
test('model descriptors expose valid schema controls and reject unsupported operation versions', () => {
    const description = must(models.describeModelNode(node('model-call', { outputKind: 'data' }), { phase: 'pre' })).data;
    assert.equal(description.descriptor.controlDescriptors.maxTokens.type, 'integer');
    assert.equal(description.descriptor.controlDescriptors.outputKind.values.includes('data'), true);
    assert.equal(description.ports.find(port => port.id === 'out').kind, 'data');
    assert.equal(models.describeModelNode(node('model-call', { operationVersion: 2 }), { phase: 'pre' }).ok, false);
    const literal = must(models.describeModelNode(node('extract', { mode: 'literal' }), { phase: 'post' })).data.descriptor;
    assert.equal(literal.requestBound, 0);
    assert.equal(literal.modelRole, null);
});
test('literal Extract describes Boolean case and labeled match controls only for literal mode', () => {
    const descriptor = must(models.describeModelNode(node('extract'), { phase: 'post' })).data.descriptor;
    assert.equal(descriptor.controlDescriptors.caseSensitive.type, 'boolean');
    assert.equal(descriptor.controlDescriptors.caseSensitive.default, true);
    assert.deepEqual(descriptor.controlDescriptors.caseSensitive.visibleWhen, { key: 'mode', value: 'literal' });
    assert.deepEqual(descriptor.controlDescriptors.match.values, ['substring', 'word']);
    assert.equal(descriptor.controlDescriptors.match.default, 'substring');
    assert.deepEqual(descriptor.controlDescriptors.match.valueLabels, { substring: 'Substring', word: 'Word' });
    assert.deepEqual(descriptor.controlDescriptors.match.visibleWhen, { key: 'mode', value: 'literal' });
});
test('Extract rejects unsupported case and match settings without requesting', async () => {
    let calls = 0;
    for (const settings of [{ caseSensitive: 'false' }, { caseSensitive: 0 }, { match: 'whole-word' }, { match: null }]) {
        const result = await models.executeModelNode(node('extract', { mode: 'literal', ...settings }), { source: root('Map') }, { phase: 'post', request: async () => { calls++; throw new Error('unused'); } });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'INVALID_SETTINGS');
        assert.equal(result.artifact, undefined);
    }
    assert.equal(calls, 0);
});
test('malformed Context is rejected before any auxiliary model request', async () => {
    let calls = 0;
    const result = await models.executeModelNode(node('model-call'), { prompt: { kind: 'text', text: 'Summarize' }, context: { kind: 'context', messages: [{ id: 'm1', role: 'developer', text: 'bad role' }] } }, { phase: 'pre', request: async () => { calls++; return { ok: true, data: { text: 'Output', finish: 'stop' } }; } });
    assert.equal(result.error?.code, 'INVALID_CONTEXT');
    assert.equal(calls, 0);
});
test('literal extraction holds a collection that exceeds the next-node JSON bound', async () => {
    const result = await models.executeModelNode(node('extract', { mode: 'literal', patterns: [{ id: 'x', literal: 'x', label: 'L'.repeat(1000) }] }), { source: root('x'.repeat(256)) }, { phase: 'post' });
    assert.equal(result.ok, false, 'An unreadable Data collection must not be emitted');
    assert.equal(result.error.code, 'OUTPUT_LIMIT');
});
test('literal Extract word matching holds more than 256 hits without truncating', async () => {
    const operation = node('extract', { mode: 'literal', caseSensitive: false, match: 'word', patterns: [{ id: 'map', literal: 'map', label: 'Map' }] });
    const bounded = must(await models.executeModelNode(operation, { source: root('MAP '.repeat(256)) }, { phase: 'post' }));
    assert.equal(bounded.artifact.value.records.length, 256);
    const overflow = await models.executeModelNode(operation, { source: root('MAP '.repeat(257)) }, { phase: 'post' });
    assert.equal(overflow.ok, false);
    assert.equal(overflow.error.code, 'EXTRACTION_LIMIT');
    assert.equal(overflow.artifact, undefined);
});
test('literal Extract retains its bounded source size with case-insensitive matching', async () => {
    const result = await models.executeModelNode(node('extract', { mode: 'literal', inputKind: 'text', caseSensitive: false, patterns: [{ id: 'map', literal: 'map', label: 'Map' }] }), { source: { kind: 'text', text: 'x'.repeat(100001) } }, { phase: 'post' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'INVALID_INPUT');
    assert.equal(result.artifact, undefined);
});
test('cancellation rejects deterministic presentation as well as model-backed work', async () => {
    const controller = new AbortController(); controller.abort();
    const result = await models.executeModelNode(node('draft-text'), { draft: root('Body.') }, { phase: 'post', signal: controller.signal });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'ABORTED');
});
test('Draft Text defaults to story body and extraction excludes appended presentation occurrences', async () => {
    const prose = revisions.createDraftRevision(root('Native.'), 'The wand is used.', { nodeId: 'prose', scope: 'whole' }).data.draft;
    const draft = revisions.appendDraftSections(prose, [{ id: 'notes', text: 'The wand is used again. (summary)' }], { nodeId: 'append' }).data.draft;
    const body = must(await models.executeModelNode(node('draft-text'), { draft }, { phase: 'post' })).artifact;
    assert.equal(body.text, 'The wand is used.');
    const assembled = must(await models.executeModelNode(node('draft-text', { view: 'assembled' }), { draft }, { phase: 'post' })).artifact;
    assert.equal(assembled.text.includes('(summary)'), true);
    const extraction = must(await models.executeModelNode(node('extract', { mode: 'literal', patterns: [{ id: 'wand', literal: 'wand', label: 'Wand' }] }), { source: draft }, { phase: 'post' })).artifact;
    assert.equal(extraction.value.records.length, 1);
    assert.equal(extraction.value.sourceRefs[0].revisionId, prose.revisionId);
});
test('failed, cutoff, unverifiable and cancelled completions produce no artifacts or implicit retries', async () => {
    const fixtures = [
        [{ ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: 'Endpoint unavailable' } }, 'PROVIDER_UNAVAILABLE'],
        [{ ok: true, data: { text: 'Partial', finish: 'length' } }, 'TRUNCATED_OUTPUT'],
        [{ ok: true, data: { text: 'Unknown', finish: 'mystery' } }, 'COMPLETION_UNVERIFIED'],
        [{ ok: true, data: { text: 'No finish' } }, 'COMPLETION_UNVERIFIED'],
    ];
    for (const [response, code] of fixtures) {
        let calls = 0;
        const result = await models.executeModelNode(node('model-call'), { prompt: { kind: 'text', text: 'Write' } }, { phase: 'pre', request: async () => { calls++; return response; } });
        assert.equal(result.error.code, code);
        assert.equal(result.artifact, undefined);
        assert.equal(calls, 1);
    }
    const controller = new AbortController();
    const result = await models.executeModelNode(node('model-call'), { prompt: { kind: 'text', text: 'Write' } }, { phase: 'pre', signal: controller.signal, request: async () => { controller.abort(); return { ok: true, data: { text: 'Late', finish: 'stop' } }; } });
    assert.equal(result.error.code, 'ABORTED');
    assert.equal(result.artifact, undefined);
});

test('model input/settings getters are rejected without evaluating them or requesting', async () => {
    let reads = 0, calls = 0;
    const input = { kind: 'text' }; Object.defineProperty(input, 'text', { enumerable: true, get() { reads++; return 'secret'; } });
    const settings = node('model-call'); Object.defineProperty(settings, 'instructions', { enumerable: true, get() { reads++; return 'secret'; } });
    for (const [operation, prompt] of [[settings, { kind: 'text', text: 'safe' }], [node('model-call'), input]]) {
        const result = await models.executeModelNode(operation, { prompt }, { phase: 'pre', request: async () => { calls++; throw new Error(); } });
        assert.equal(result.ok, false);
    }
    assert.equal(reads, 0);
    assert.equal(calls, 0);
});
test('model reports retain only validated token counters from provider usage', async () => {
    const usage = { input_tokens: 6, completion_tokens: 3, total_tokens: -1, outputTokens: 1.5, cached_tokens: Number.MAX_SAFE_INTEGER + 1, prompt_tokens: 'six', authorization: 'SECRET', diagnostics: { credential: 'SECRET' } };
    for (const operation of ['model-call', 'revise-draft']) {
        const inputs = operation === 'model-call' ? { prompt: { kind: 'text', text: 'Write prose.' } } : { draft: root('Original.') };
        const output = must(await models.executeModelNode(node(operation, operation === 'revise-draft' ? { scope: 'whole' } : {}), inputs, { phase: 'post', request: async () => ({ ok: true, data: { text: 'Revised.', finish: 'stop', usage } }) }));
        const report = output.reports.find(item => item.code === (operation === 'model-call' ? 'MODEL_CALL' : 'MODEL_REVISION'));
        assert.deepEqual(report.usage, { input_tokens: 6, completion_tokens: 3 });
        assert.equal(JSON.stringify(output).includes('SECRET'), false, 'Provider metadata cannot enter artifacts or reports');
    }
});

test('Revise Draft uses registered narrative scope without parsing appended note quotations', async () => {
    const first = revisions.createDraftRevision(root('Native.'), 'First.', { nodeId: 'one', scope: 'narration' }).data.draft;
    const note = 'A note contains an unmatched " quote.';
    const assembled = revisions.appendDraftSections(first, [{ id: 'notes', text: note }], { nodeId: 'append' }).data.draft;
    let calls = 0;
    const result = must(await models.executeModelNode(node('revise-draft', { scope: 'narration' }), { draft: assembled }, { phase: 'post', request: async request => {
        calls++;
        assert.equal(JSON.parse(request.messages[1].content).draft, 'First.\n\n' + note);
        return { ok: true, data: { text: 'Second.\n\n' + note, finish: 'stop' } };
    } }));
    assert.equal(calls, 1);
    assert.equal(result.artifact.text, 'Second.\n\n' + note);
    assert.equal(revisions.readDraftBody(result.artifact).data.text, 'Second.');
    assert.equal(revisions.toFinalCandidate(result.artifact).data.candidate.original, 'Native.');
});

test('failed model requests expose safe diagnostics and token counters without provider metadata', async () => {
    const failures = [
        { code: 'TRUNCATED_OUTPUT', message: 'The request reached its completion limit.', finish: 'length', usage: { prompt_tokens: 1, authorization: 'SECRET', total_tokens: -1 }, authorization: 'SECRET', details: { provider: 'SECRET' } },
        { code: 'COMPLETION_UNVERIFIED', message: 'Provider echoed credential SECRET', finish: 'SECRET', usage: { completion_tokens: 2, outputTokens: 0.5 }, response: 'SECRET' },
    ];
    for (const operation of ['model-call', 'revise-draft']) for (const error of failures) {
        let calls = 0;
        const inputs = operation === 'model-call' ? { prompt: { kind: 'text', text: 'Write prose.' } } : { draft: root('Original.') };
        const result = await models.executeModelNode(node(operation, operation === 'revise-draft' ? { scope: 'whole' } : {}), inputs, { phase: 'post', request: async () => { calls++; return { ok: false, error }; } });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, error.code);
        assert.equal(result.error.finish, error.finish === 'length' ? 'length' : null);
        assert.deepEqual(result.error.usage, error.code === 'TRUNCATED_OUTPUT' ? { prompt_tokens: 1 } : { completion_tokens: 2 });
        assert.deepEqual(Object.keys(result.error).sort(), ['code', 'finish', 'message', 'usage']);
        assert.equal(JSON.stringify(result).includes('SECRET'), false, 'Failure envelopes cannot copy arbitrary provider metadata or raw messages');
        assert.equal(result.artifact, undefined);
        assert.equal(calls, 1);
    }
});
