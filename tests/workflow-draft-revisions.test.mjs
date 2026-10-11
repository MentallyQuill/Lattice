import assert from 'node:assert/strict';
import { test } from 'node:test';
const revisions = await import('../src/workflow/draft-revisions.js?v=0.27.0').catch(() => ({}));
const root = text => ({ kind: 'draft', text, source: { chatId: 'story', messageIndex: 4, swipeId: 0, originalText: text, token: 'native-token' } });
const must = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result.data; };

test('successive revisions preserve native original and expose a flat parent lineage', () => {
    assert.equal(typeof revisions.createDraftRevision, 'function', 'Draft revision helper is required');
    const first = must(revisions.createDraftRevision(root('Native prose.'), 'First prose.', { nodeId: 'style', scope: 'whole' })).draft;
    const second = must(revisions.createDraftRevision(first, 'Second prose.', { nodeId: 'voice', scope: 'authorized' })).draft;
    const candidate = must(revisions.toFinalCandidate(second)).candidate;
    assert.equal(candidate.original, 'Native prose.');
    assert.equal(candidate.text, 'Second prose.');
    assert.equal(candidate.source.originalText, 'Native prose.');
    assert.equal(second.lineage.length, 2);
    assert.equal(second.lineage[1].parentId, first.revisionId);
    assert.equal(second.lineage.some(entry => Object.hasOwn(entry, 'draft')), false);
    assert.equal(Object.isFrozen(second.source), true);
});
test('narrow revisions cannot widen their parent permissions or remove protected literals', () => {
    const original = { ...root('A "KEEP cold" B'), protectedLiterals: ['KEEP'], spans: [{ index: 0, start: 3, end: 12, text: 'KEEP cold' }], scope: 'dialogue' };
    const first = revisions.createDraftRevision(original, 'A "KEEP warm" B', { nodeId: 'voice', scope: 'whole' });
    assert.equal(first.ok, true, JSON.stringify(first.error));
    const changedOutside = revisions.createDraftRevision(first.data.draft, 'X "KEEP warm" B', { nodeId: 'voice2', scope: 'whole' });
    assert.equal(changedOutside.ok, false, 'Parent dialogue permission cannot be widened to narration');
    assert.equal(revisions.createDraftRevision(first.data.draft, 'A "warm" B', { nodeId: 'voice2', scope: 'authorized' }).ok, false);
    assert.equal(revisions.createDraftRevision(root('unannotated'), 'changed', { nodeId: 'style', scope: 'authorized' }).error.code, 'SCOPE_REQUIRED');
});
test('legacy patch repair and reference alignment target the current revision while preserving root original', async () => {
    const { scanDraft, repairDraft, validatePatches } = await import('../src/workflow/repair.js');
    const reference = await import('../src/workflow/operations/reference-draft.js?v=0.27.0');
    const first = must(revisions.createDraftRevision(root('Native cold prose.'), 'First warm prose.', { nodeId: 'first', scope: 'whole' })).draft;
    const scanned = scanDraft(first, { scope: 'whole', rules: ['warm'] });
    assert.equal(scanned.ok, true, JSON.stringify(scanned.error));
    const repaired = await repairDraft(scanned.artifact, { id: 'repair' }, { binding: {}, countTokens: async () => ({ tokens: 10 }), request: async options => {
        assert.equal(JSON.parse(options.messages[1].content).original, 'First warm prose.');
        return { ok: true, data: { text: '{"patches":[{"index":0,"replacement":"bright"}]}', finish: 'stop' } };
    } });
    assert.equal(repaired.ok, true, JSON.stringify(repaired.error));
    const candidate = validatePatches(repaired.artifact);
    assert.equal(candidate.ok, true, JSON.stringify(candidate.error));
    assert.equal(candidate.artifact.original, 'Native cold prose.');
    assert.equal(candidate.artifact.text, 'First bright prose.');
    assert.equal(candidate.artifact.baseline, 'First warm prose.');
    assert.equal(candidate.artifact.parentRevisionId, first.revisionId);
    const prepared = must(reference.prepareReferenceDraft(first, { scope: 'whole' }));
    const aligned = must(reference.alignReferenceCandidate(prepared, 'Second warm prose.'));
    assert.equal(validatePatches(aligned.artifact).artifact.original, 'Native cold prose.');
});
test('prose cleanup preserves revision authority while adding findings and checked patches', async () => {
    const { cleanupDraft } = await import('../src/workflow/operations/prose-cleanup.js?v=0.27.0');
    const { validatePatches } = await import('../src/workflow/repair.js');
    const first = must(revisions.createDraftRevision(root('Original.'), 'She let out a breath she did not know she was holding.', { nodeId: 'first', scope: 'whole' })).draft;
    const result = await cleanupDraft(first, { mode: 'inspect', scope: 'whole' });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    const candidate = validatePatches(result.data.artifact);
    assert.equal(candidate.ok, true, JSON.stringify(candidate.error));
    assert.equal(candidate.artifact.original, 'Original.');
});
test('a successful revision remains readable within the same snapshot bounds', () => {
    const large = { ...root('Native.'), extra: 'x'.repeat(400000) };
    const result = revisions.createDraftRevision(large, 'y'.repeat(80000), { nodeId: 'expand', scope: 'whole' });
    assert.equal(result.ok, false, 'An output beyond the next-read bound must not be emitted');
    assert.equal(result.error.code, 'OUTPUT_LIMIT');
});
test('revising an assembled body keeps the presentation immutable and subsequent append uses the new body', () => {
    const first = must(revisions.createDraftRevision(root('Native.'), 'First.', { nodeId: 'one', scope: 'whole' })).draft;
    const assembled = must(revisions.appendDraftSections(first, [{ id: 'notes', text: 'Notes.' }], { nodeId: 'append' })).draft;
    const revised = must(revisions.createDraftRevision(assembled, 'Second.\n\nNotes.', { nodeId: 'two', scope: 'authorized' })).draft;
    const replaced = must(revisions.appendDraftSections(revised, [{ id: 'notes', text: 'Updated.' }], { nodeId: 'append' })).draft;
    assert.equal(replaced.text, 'Second.\n\nUpdated.');
    assert.equal(revisions.createDraftRevision(assembled, 'First.\n\nChanged notes.', { nodeId: 'bad', scope: 'whole' }).ok, false);
});
test('annotation authority rejects fabricated spans rather than authenticating malformed permissions', () => {
    const first = must(revisions.createDraftRevision(root('Native.'), 'Current.', { nodeId: 'one', scope: 'whole' })).draft;
    const retained = revisions.retainDraftAuthority(first, { ...first, spans: [{ index: 0, start: 0, end: 8, text: 'invented' }] });
    assert.equal(retained.ok, false);
    assert.equal(retained.error.code, 'INVALID_SPANS');
});
test('an unchanged scoped revision does not guess new alignment for repeated anchors', () => {
    const text = 'abc MARK abc MARK abc';
    const parent = { ...root(text), scope: 'whole', spans: [{ index: 0, start: 0, end: 12, text: 'abc MARK abc' }, { index: 1, start: 18, end: 21, text: 'abc' }] };
    const result = revisions.createDraftRevision(parent, text, { nodeId: 'no-change', scope: 'authorized' });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(result.data.draft.spans.map(span => [span.start, span.end]), [[0, 12], [18, 21]]);
});
test('dialogue revision cannot emit permissions that cross newly inserted quote delimiters', () => {
    const result = revisions.createDraftRevision(root('A "cold" B'), 'A "warm "curse"" B', { nodeId: 'dialogue', scope: 'dialogue' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'INVALID_SPANS');
});
test('new exemption wording narrows successor permissions instead of becoming editable authority', () => {
    const parent = { ...root('cold warm'), scope: 'whole', caseSensitive: true, exemptions: ['KEEP'], spans: [{ index: 0, start: 0, end: 9, text: 'cold warm' }] };
    const result = must(revisions.createDraftRevision(parent, 'cold KEEP warm', { nodeId: 'one', scope: 'authorized' })).draft;
    assert.deepEqual(result.spans.map(span => span.text), ['cold ', ' warm']);
});
test('copied ancestry, modified source scope and getter-backed Drafts cannot recreate live authority', () => {
    const native = root('Native.'); native.source.userHandle = 'default-user';
    const first = must(revisions.createDraftRevision(native, 'Current.', { nodeId: 'one', scope: 'whole' })).draft;
    for (const forged of [{ ...first }, structuredClone(first), { ...first, source: { ...first.source, chatId: 'elsewhere' } }, { kind: 'text', text: first.text, lineage: first.lineage }]) {
        assert.equal(revisions.toFinalCandidate(forged).ok, false);
        assert.equal(revisions.createDraftRevision(forged, 'Forged.', { nodeId: 'bad', scope: 'whole' }).ok, false);
    }
    native.source.originalText = 'Changed after capture';
    assert.equal(must(revisions.toFinalCandidate(first)).candidate.original, 'Native.');
    let reads = 0;
    const unsafe = root('Native.'); Object.defineProperty(unsafe, 'text', { enumerable: true, get() { reads++; return 'Native.'; } });
    assert.equal(revisions.snapshotDraft(unsafe).ok, false);
    assert.equal(reads, 0);
});

test('revision history fails at its bound without dropping original ancestry', () => {
    let draft = root('Native.');
    for (let index = 0; index < 64; index++) draft = must(revisions.createDraftRevision(draft, `Revision ${index}.`, { nodeId: `node-${index}`, scope: index === 0 ? 'whole' : 'authorized' })).draft;
    assert.equal(revisions.createDraftRevision(draft, 'Overflow.', { nodeId: 'overflow', scope: 'authorized' }).error.code, 'LINEAGE_LIMIT');
    assert.equal(must(revisions.toFinalCandidate(draft)).candidate.original, 'Native.');
    assert.equal(draft.lineage.length, 64);
});
test('story-body views exclude presentation and keep a stable body revision across note replacements', () => {
    assert.equal(typeof revisions.readDraftBody, 'function', 'A checked story-body view is required');
    const first = must(revisions.createDraftRevision(root('Native.'), 'The wand was used.', { nodeId: 'prose', scope: 'whole' })).draft;
    const assembled = must(revisions.appendDraftSections(first, [{ id: 'notes', text: 'The wand was used again. (notes only)' }], { nodeId: 'append' })).draft;
    const replaced = must(revisions.appendDraftSections(assembled, [{ id: 'notes', text: 'Different presentation.' }], { nodeId: 'append' })).draft;
    assert.equal(must(revisions.readDraftBody(assembled)).text, 'The wand was used.');
    assert.equal(must(revisions.readDraftBody(replaced)).provenance.revisionId, first.revisionId);
    assert.equal(revisions.readDraftBody({ ...assembled, text: 'Forged' }).ok, false);
});
test('same-text annotations preserve private disclosure restrictions before public append', async () => {
    const models = await import('../src/workflow/operations/model-nodes.js?v=0.27.0');
    const privateRoot = { ...root('Private prose.'), visibility: { kind: 'actor-private', actorId: 'mara' } };
    const first = must(revisions.createDraftRevision(privateRoot, 'Private revision.', { nodeId: 'one', scope: 'whole' })).draft;
    for (const altered of [{ ...first, visibility: { kind: 'public' } }, { ...first, visibility: undefined }, { ...first, visibility: { kind: 'actor-private', actorId: 'laya' } }]) {
        const retained = revisions.retainDraftAuthority(first, altered);
        assert.equal(retained.ok, false, 'Annotation must not grant public or different-actor access to private text');
        assert.equal(retained.error.code, 'DISCLOSURE_CHANGED');
    }
    const preserved = must(revisions.retainDraftAuthority(first, { ...first, findings: [{ code: 'CHECKED' }] })).draft;
    assert.equal((await models.executeModelNode({ id: 'append', operation: 'append' }, { draft: preserved, section: { kind: 'text', text: 'Notes.' } }, { phase: 'post' })).error.code, 'PRIVATE_MATERIAL');
    const nested = must(revisions.createDraftRevision({ ...root('Native.'), context: { visibility: { kind: 'actor-private', actorId: 'mara' }, text: 'Private memory' } }, 'Current.', { nodeId: 'nested', scope: 'whole' })).draft;
    assert.equal(revisions.retainDraftAuthority(nested, { ...nested, context: { visibility: { kind: 'public' }, text: 'Private memory' } }).error.code, 'DISCLOSURE_CHANGED');
    assert.equal(revisions.retainDraftAuthority(nested, { ...nested, context: undefined }).error.code, 'DISCLOSURE_CHANGED');
});

test('narration scope parses only the registered body while preserving unmatched quotes in notes', async () => {
    const { scanDraft, validatePatches } = await import('../src/workflow/repair.js?v=0.27.0');
    const first = must(revisions.createDraftRevision(root('Native.'), 'First.', { nodeId: 'one', scope: 'narration' })).draft;
    const note = 'A note contains an unmatched " quote.';
    const assembled = must(revisions.appendDraftSections(first, [{ id: 'notes', text: note }], { nodeId: 'append' })).draft;
    const revised = must(revisions.createDraftRevision(assembled, 'Second.\n\n' + note, { nodeId: 'two', scope: 'authorized' })).draft;
    assert.equal(must(revisions.readDraftBody(revised)).text, 'Second.');
    assert.equal(revised.presentationSections[0].text, note);
    assert.equal(revisions.createDraftRevision(assembled, 'Second.\n\nChanged notes.', { nodeId: 'bad', scope: 'narration' }).error.code, 'OUT_OF_SCOPE_CHANGE');
    const scanned = scanDraft(assembled, { scope: 'narration', rules: ['First'] });
    assert.equal(scanned.ok, true, JSON.stringify(scanned.error));
    assert.equal(scanned.reports.some(report => report.code === 'UNMATCHED_QUOTES'), false);
    const patched = validatePatches({ kind: 'patches', draft: scanned.artifact, patches: [{ index: 0, replacement: 'Second' }] });
    assert.equal(patched.ok, true, JSON.stringify(patched.error));
    assert.equal(patched.artifact.text, 'Second.\n\n' + note);
    assert.equal(patched.artifact.original, 'Native.');
});

test('successor scans may add narrowing exemptions while preserving previous exemptions and case policy', async () => {
    const { scanDraft } = await import('../src/workflow/repair.js?v=0.27.0');
    const text = 'KEEP cold and Warm.';
    const native = { ...root(text), scope: 'whole', exemptions: ['KEEP'], caseSensitive: false, spans: [{ index: 0, start: 4, end: text.length, text: text.slice(4) }] };
    const first = must(revisions.createDraftRevision(native, text, { nodeId: 'one', scope: 'authorized' })).draft;
    const scanned = scanDraft(first, { scope: 'whole', rules: ['cold', 'Warm'], exemptions: ['Warm'], caseSensitive: true });
    assert.equal(scanned.ok, true, JSON.stringify(scanned.error));
    assert.deepEqual(scanned.artifact.exemptions, ['KEEP', 'Warm']);
    assert.equal(scanned.artifact.caseSensitive, false, 'Old exemption case policy remains authoritative');
    assert.deepEqual(scanned.artifact.spans.map(span => span.text), ['cold']);
    assert.equal(must(revisions.toFinalCandidate(scanned.artifact)).candidate.original, text);
    assert.equal(revisions.retainDraftAuthority(scanned.artifact, { ...scanned.artifact, exemptions: ['Warm'] }).error.code, 'INVALID_SPANS');
    assert.equal(revisions.retainDraftAuthority(scanned.artifact, { ...scanned.artifact, caseSensitive: true }).error.code, 'INVALID_SPANS');
    assert.equal(revisions.retainDraftAuthority(first, { ...first, exemptions: ['KEEP', 'Warm'] }).error.code, 'INVALID_SPANS', 'New exemptions must actually narrow spans');
});

test('exact deletion removes the selected middle line and retains native source', () => {
    assert.equal(typeof revisions.createDraftDeletionRevision, 'function', 'Exact Draft deletion helper is required');
    const text = 'A\nElara\nB';
    const parent = { kind: 'draft', text, source: { originalText: text } };
    const result = must(revisions.createDraftDeletionRevision(parent, [{ start: 2, end: 8 }], { nodeId: 'filter', scope: 'whole' })).draft;
    assert.equal(result.text, 'A\nB');
    assert.equal(result.source.originalText, text);
    assert.equal(result.lineage[0].nodeId, 'filter');
    assert.equal(must(revisions.toFinalCandidate(result)).candidate.original, text);
});

test('exact deletion refuses immutable gaps and inherited or configured protected text atomically', () => {
    const text = 'one KEEP two';
    const scoped = { ...root(text), spans: [{ index: 0, start: 0, end: 3, text: 'one' }, { index: 1, start: 9, end: 12, text: 'two' }] };
    for (const [parent, range, controls] of [
        [scoped, { start: 0, end: 10 }, {}],
        [{ ...root(text), protectedLiterals: ['KEEP'] }, { start: 0, end: 9 }, {}],
        [root(text), { start: 4, end: 8 }, { protectedLiterals: ['KEEP'] }],
    ]) {
        const result = revisions.createDraftDeletionRevision(parent, [range], { nodeId: 'filter', scope: 'whole', ...controls });
        assert.equal(result.ok, false, 'A whole deletion must be authorized, including its surrounding text');
        assert.equal(result.error.code, 'OUT_OF_SCOPE_CHANGE');
        assert.equal(result.data, undefined);
        assert.equal(parent.text, text);
    }
});

test('exact deletion rejects malformed ordered UTF-16 ranges without reading accessors', () => {
    const parent = root('A😀BCD');
    let reads = 0;
    const accessor = { end: 4 }; Object.defineProperty(accessor, 'start', { enumerable: true, get() { reads++; return 3; } });
    for (const ranges of [null, {}, new Array(1), [accessor], [{ start: -1, end: 1 }], [{ start: 0, end: 8 }], [{ start: 1, end: 2 }], [{ start: 2, end: 3 }], [{ start: 3, end: 3 }], [{ start: 3.5, end: 4 }], [{ start: 4, end: 5 }, { start: 3, end: 4 }], [{ start: 3, end: 5 }, { start: 4, end: 6 }], Array.from({ length: 257 }, () => ({ start: 0, end: 1 }))]) {
        const result = revisions.createDraftDeletionRevision(parent, ranges, { nodeId: 'filter', scope: 'whole' });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'INVALID_DELETE_RANGES');
        assert.equal(result.data, undefined);
    }
    assert.equal(reads, 0);
});

test('exact deletion validates controls and preserves no-op Draft identity', () => {
    const parent = root('Native.');
    let reads = 0;
    const accessor = { nodeId: 'filter' }; Object.defineProperty(accessor, 'scope', { enumerable: true, get() { reads++; return 'whole'; } });
    for (const settings of [null, {}, { nodeId: '', scope: 'whole' }, { nodeId: 'filter', scope: 'bad' }, { nodeId: 'filter', scope: 'whole', extra: true }, { nodeId: 'filter', scope: 'whole', protectedLiterals: [''] }, accessor]) {
        assert.equal(revisions.createDraftDeletionRevision(parent, [], settings).error.code, 'INVALID_SETTINGS');
    }
    assert.equal(reads, 0);
    assert.equal(must(revisions.createDraftDeletionRevision(parent, [], { nodeId: 'filter', scope: 'whole' })).draft, parent);
    const successor = must(revisions.createDraftRevision(parent, 'Current.', { nodeId: 'one', scope: 'whole' })).draft;
    assert.equal(must(revisions.createDraftDeletionRevision(successor, [], { nodeId: 'filter', scope: 'authorized' })).draft, successor);
    assert.equal(revisions.createDraftDeletionRevision({ ...successor }, [], { nodeId: 'filter', scope: 'whole' }).error.code, 'INVALID_ANCESTRY');
});

test('exact deletion retains stored exemption case and removes newly joined exempt text from permissions', () => {
    const text = 'keep KxEEP tail';
    const parent = { ...root(text), caseSensitive: false, exemptions: ['KEEP'], scope: 'whole', spans: [{ index: 0, start: 4, end: 15, text: ' KxEEP tail' }] };
    assert.equal(revisions.createDraftDeletionRevision(parent, [{ start: 0, end: 4 }], { nodeId: 'filter', scope: 'whole' }).error.code, 'OUT_OF_SCOPE_CHANGE');
    const deleted = must(revisions.createDraftDeletionRevision(parent, [{ start: 6, end: 7 }], { nodeId: 'filter', scope: 'authorized' })).draft;
    assert.equal(deleted.text, 'keep KEEP tail');
    assert.deepEqual(deleted.spans.map(span => [span.start, span.end, span.text]), [[4, 5, ' '], [9, 14, ' tail']]);
    assert.equal(deleted.caseSensitive, false);
    assert.deepEqual(deleted.exemptions, ['KEEP']);
    assert.equal(revisions.createDraftDeletionRevision(deleted, [{ start: 5, end: 9 }], { nodeId: 'next', scope: 'whole' }).error.code, 'OUT_OF_SCOPE_CHANGE');
});

test('exact deletion rejects empty story bodies even when presentation remains nonblank', () => {
    for (const text of ['Story', ' Story \n']) {
        const start = text.indexOf('Story');
        assert.equal(revisions.createDraftDeletionRevision(root(text), [{ start, end: start + 5 }], { nodeId: 'filter', scope: 'whole' }).error.code, 'EMPTY_FILTER_RESULT');
    }
    const parent = must(revisions.appendDraftSections(root('Story'), [{ id: 'notes', text: 'Notes remain.' }], { nodeId: 'append' })).draft;
    const result = revisions.createDraftDeletionRevision(parent, [{ start: 0, end: 5 }], { nodeId: 'filter', scope: 'whole' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'EMPTY_FILTER_RESULT');
    for (const blank of ['', '  \n']) assert.equal(revisions.createDraftRevision(root('Story'), blank, { nodeId: 'model', scope: 'whole' }).error.code, 'OUTPUT_LIMIT');
});

test('exact deletion remaps assembled body authority and preserves the presentation suffix', () => {
    const body = 'First.\r\n\r\nElara.\r\n\r\nLast.';
    const first = must(revisions.createDraftRevision(root('Native.'), body, { nodeId: 'one', scope: 'whole' })).draft;
    const note = 'Notes with an unmatched " quote.';
    const assembled = must(revisions.appendDraftSections(first, [{ id: 'notes', text: note }], { nodeId: 'append', separator: '\r\n--\r\n' })).draft;
    const result = must(revisions.createDraftDeletionRevision(assembled, [{ start: 10, end: 20 }], { nodeId: 'filter', scope: 'narration' })).draft;
    assert.equal(result.text, 'First.\r\n\r\nLast.\r\n--\r\n' + note);
    const view = must(revisions.readDraftBody(result));
    assert.equal(view.text, 'First.\r\n\r\nLast.');
    assert.equal(view.provenance.revisionId, result.revisionId);
    assert.equal(result.rootRevisionId, first.rootRevisionId);
    assert.equal(result.lineage.at(-1).parentId, assembled.revisionId);
    assert.deepEqual(result.presentationSections.map(section => [section.id, section.text]), [['notes', note]]);
    const replaced = must(revisions.appendDraftSections(result, [{ id: 'notes', text: 'Updated.' }], { nodeId: 'append', separator: '\n\n' })).draft;
    assert.equal(replaced.text, 'First.\r\n\r\nLast.\n\nUpdated.');
    assert.equal(revisions.createDraftDeletionRevision(assembled, [{ start: body.length, end: body.length + 2 }], { nodeId: 'bad', scope: 'whole' }).error.code, 'OUT_OF_SCOPE_CHANGE');
    assert.equal(revisions.createDraftDeletionRevision(structuredClone(result), [], { nodeId: 'copy', scope: 'whole' }).error.code, 'INVALID_ANCESTRY');
});

test('exact deletion cannot widen inherited dialogue scope through whole scope', () => {
    const text = 'A "cold warm" B';
    const parent = { ...root(text), scope: 'dialogue', spans: [{ index: 0, start: 3, end: 12, text: 'cold warm' }] };
    const result = must(revisions.createDraftDeletionRevision(parent, [{ start: 3, end: 8 }], { nodeId: 'filter', scope: 'whole' })).draft;
    assert.equal(result.text, 'A "warm" B');
    assert.equal(result.scope, 'dialogue');
    assert.deepEqual(result.spans.map(span => [span.start, span.end, span.text]), [[3, 7, 'warm']]);
    assert.equal(revisions.createDraftDeletionRevision(result, [{ start: 0, end: 1 }], { nodeId: 'next', scope: 'whole' }).error.code, 'OUT_OF_SCOPE_CHANGE');
});

test('exact deletion refuses successors whose lineage would exceed the authenticated bound', () => {
    let parent = root('Native.');
    for (let index = 0; index < 64; index++) parent = must(revisions.createDraftRevision(parent, 'Current.', { nodeId: 'one', scope: index ? 'authorized' : 'whole' })).draft;
    const result = revisions.createDraftDeletionRevision(parent, [{ start: 0, end: 1 }], { nodeId: 'filter', scope: 'authorized' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'LINEAGE_LIMIT');
    assert.equal(parent.lineage.length, 64);
    assert.equal(must(revisions.createDraftDeletionRevision(parent, [], { nodeId: 'noop', scope: 'authorized' })).draft, parent);
});

test('exact deletion does not emit a successor beyond the bounded readable snapshot', () => {
    const parent = { ...root('abc'), extra: 'x'.repeat(499750) };
    assert.equal(revisions.snapshotDraft(parent).ok, true);
    const result = revisions.createDraftDeletionRevision(parent, [{ start: 0, end: 1 }], { nodeId: 'filter', scope: 'whole' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'OUTPUT_LIMIT');
    assert.equal(result.data, undefined);
});

test('exact deletion keeps original delimiters and Unicode across first last multiple and adjacent ranges', () => {
    for (const [text, ranges, expected] of [
        ['First\r\nSecond\r\nLast', [{ start: 0, end: 7 }], 'Second\r\nLast'],
        ['First\nLast', [{ start: 6, end: 10 }], 'First\n'],
        ['A\rB\rC\rD', [{ start: 0, end: 2 }, { start: 4, end: 6 }], 'B\rD'],
        ['A😀BC', [{ start: 1, end: 3 }, { start: 3, end: 4 }], 'AC'],
        ['😀 x 😀', [{ start: 2, end: 5 }], '😀😀'],
    ]) {
        const parent = root(text);
        const result = must(revisions.createDraftDeletionRevision(parent, ranges, { nodeId: 'filter', scope: 'whole' })).draft;
        assert.equal(result.text, expected);
        assert.deepEqual(result.spans.map(span => [span.start, span.end, span.text]), [[0, expected.length, expected]]);
        assert.equal(result.source.token, 'native-token');
        assert.equal(result.source.chatId, 'story');
        assert.equal(result.source.originalText, text);
        assert.equal(must(revisions.toFinalCandidate(result)).candidate.text, expected);
        assert.equal(revisions.toFinalCandidate(structuredClone(result)).error.code, 'INVALID_ANCESTRY');
    }
});

test('exact deletion permits case-sensitive stored exemption alternatives and retains protection union', () => {
    const parent = { ...root('keep cold KEEP'), exemptions: ['KEEP'], caseSensitive: true, scope: 'whole', spans: [{ index: 0, start: 0, end: 10, text: 'keep cold ' }], protectedLiterals: ['cold'] };
    const result = must(revisions.createDraftDeletionRevision(parent, [{ start: 0, end: 5 }], { nodeId: 'filter', scope: 'whole', protectedLiterals: ['KEEP'] })).draft;
    assert.equal(result.text, 'cold KEEP');
    assert.deepEqual(result.protectedLiterals, ['cold', 'KEEP']);
    assert.deepEqual(result.spans.map(span => [span.start, span.end, span.text]), [[4, 5, ' ']]);
    assert.equal(result.caseSensitive, true);
    assert.equal(revisions.createDraftDeletionRevision(root('body'), [], { nodeId: 'filter', scope: 'authorized' }).error.code, 'SCOPE_REQUIRED');
});
