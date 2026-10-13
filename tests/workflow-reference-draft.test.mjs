import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as helper from '../src/workflow/operations/reference-draft.js';
import { validatePatches } from '../src/workflow/repair.js';

const rawDraft = text => ({ kind: 'draft', text, source: { originalText: text, token: 'source-token', revision: { swipe: 2 } } });
const must = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result.data; };

test('explicit whole raw Draft produces frozen compatible patches with retained source', () => {
    assert.equal(typeof helper.prepareReferenceDraft, 'function');
    const draft = rawDraft('Old prose.');
    const before = structuredClone(draft);
    const prepared = must(helper.prepareReferenceDraft(draft, { scope: 'whole' }));
    const { artifact } = must(helper.createReferencePatches(prepared, ['New prose.']));
    assert.deepEqual(draft, before);
    assert.equal(Object.isFrozen(prepared.draft.source.revision), true);
    assert.equal(artifact.draft.source.token, 'source-token');
    const validated = validatePatches(artifact);
    assert.equal(validated.ok, true);
    assert.equal(validated.artifact.text, 'New prose.');
});

test('settings reject explicit nulls and accessors without widening scope', () => {
    let reads = 0;
    const accessor = {}; Object.defineProperty(accessor, 'scope', { enumerable: true, get() { reads++; return 'whole'; } });
    for (const settings of [{ scope: null }, { scope: 'whole', protectedLiterals: null }, accessor, Object.create({ scope: 'whole' }), null]) {
        assert.equal(helper.prepareReferenceDraft(rawDraft('abc'), settings).error.code, 'INVALID_SETTINGS');
    }
    assert.equal(helper.prepareReferenceDraft({ ...rawDraft('abc'), protectedLiterals: null }, { scope: 'whole' }).error.code, 'INVALID_SETTINGS');
    assert.equal(reads, 0);
});

test('patch output validates dense replacements, completion metadata and output bounds', () => {
    const prepared = must(helper.prepareReferenceDraft(rawDraft('old'), { scope: 'whole' }));
    let reads = 0;
    const getters = []; Object.defineProperty(getters, '0', { enumerable: true, get() { reads++; return 'new'; } });
    const metadataGetter = {}; Object.defineProperty(metadataGetter, 'usage', { enumerable: true, get() { reads++; return {}; } });
    for (const replacements of [[], ['new', 'extra'], new Array(1), getters, [3], [''], ['   ']]) {
        const rejected = helper.createReferencePatches(prepared, replacements);
        assert.equal(rejected.ok, false); assert.equal(rejected.data, undefined);
    }
    assert.equal(helper.createReferencePatches(prepared, ['new'], metadataGetter).ok, false);
    assert.equal(reads, 0);
    for (const finish of [undefined, null, 'length', 'unknown']) {
        assert.equal(helper.createReferencePatches(prepared, ['new'], { finish }).ok, false);
    }
    const metadata = { finish: 'STOP', usage: { inputTokens: 2, optional: undefined } };
    const { artifact } = must(helper.createReferencePatches(prepared, ['new'], metadata));
    assert.equal(artifact.finish, 'STOP');
    assert.equal(artifact.usage.inputTokens, 2);
    metadata.usage.inputTokens = 9;
    assert.equal(artifact.usage.inputTokens, 2);
    assert.equal(helper.createReferencePatches(prepared, ['x'.repeat(100000)]).ok, true);
    assert.equal(helper.createReferencePatches(prepared, ['x'.repeat(100001)]).error.code, 'OUTPUT_LIMIT');
    assert.equal(helper.alignReferenceCandidate(prepared, 'x'.repeat(100001)).error.code, 'OUTPUT_LIMIT');
    assert.equal(helper.createReferencePatches(prepared, ['new'], { usage: undefined }).ok, true);
    assert.equal(helper.createReferencePatches(prepared, ['new'], { usage: 'x'.repeat(500001) }).error.code, 'INVALID_METADATA');
    const usageCycle = {}; usageCycle.self = usageCycle;
    assert.equal(helper.createReferencePatches(prepared, ['new'], { usage: usageCycle }).error.code, 'INVALID_METADATA');
});

test('repeated internal anchor placements reject ambiguous alignment', () => {
    const prepared = must(helper.prepareReferenceDraft({ ...rawDraft('a|b'), spans: [{ index: 0, start: 0, end: 1, text: 'a' }, { index: 1, start: 2, end: 3, text: 'b' }] }));
    assert.equal(helper.alignReferenceCandidate(prepared, 'left|extra|right').error.code, 'AMBIGUOUS_ALIGNMENT');
    assert.equal(validatePatches(must(helper.alignReferenceCandidate(prepared, 'left|right')).artifact).artifact.text, 'left|right');
    const pinned = must(helper.prepareReferenceDraft(rawDraft('old KEEP old'), { scope: 'whole', protectedLiterals: ['KEEP'] }));
    assert.equal(validatePatches(must(helper.alignReferenceCandidate(pinned, 'new KEEP fresh')).artifact).artifact.text, 'new KEEP fresh');
    assert.equal(helper.alignReferenceCandidate(pinned, 'new LOST fresh').error.code, 'OUT_OF_SCOPE_CHANGE');
});

test('candidate alignment maps exact prefix, internal and suffix anchors preserving whitespace', () => {
    assert.equal(typeof helper.alignReferenceCandidate, 'function');
    const text = 'prefix old|middle|old suffix\r\n';
    const spans = [{ index: 0, start: 7, end: 10, text: 'old' }, { index: 1, start: 18, end: 21, text: 'old' }];
    const prepared = must(helper.prepareReferenceDraft({ ...rawDraft(text), spans }));
    assert.deepEqual(must(helper.alignReferenceCandidate(prepared, text)).artifact.patches, []);
    const { artifact } = must(helper.alignReferenceCandidate(prepared, 'prefix NEW|middle|FRESH suffix\r\n'));
    assert.equal(validatePatches(artifact).artifact.text, 'prefix NEW|middle|FRESH suffix\r\n');
    for (const candidate of ['changed NEW|middle|FRESH suffix\r\n', 'prefix NEW changed FRESH suffix\r\n', 'prefix NEW|middle|FRESH changed']) {
        assert.equal(helper.alignReferenceCandidate(prepared, candidate).error.code, 'OUT_OF_SCOPE_CHANGE');
    }
});

test('inclusive text, span, window, pin and surrogate limits fail without truncation', () => {
    assert.equal(helper.prepareReferenceDraft(rawDraft('x'.repeat(100000)), { scope: 'whole' }).ok, true);
    assert.equal(helper.prepareReferenceDraft(rawDraft('x'.repeat(100001)), { scope: 'whole' }).error.code, 'INPUT_LIMIT');
    assert.equal(helper.prepareReferenceDraft({ ...rawDraft('abc'), source: { originalText: 'abd' } }, { scope: 'whole' }).error.code, 'STALE_SOURCE');
    const many = count => { const text = 'x '.repeat(count); return { ...rawDraft(text), spans: Array.from({ length: count }, (_, index) => ({ index, start: index * 2, end: index * 2 + 1, text: 'x' })) }; };
    assert.equal(helper.prepareReferenceDraft(many(256)).ok, true);
    assert.equal(helper.prepareReferenceDraft(many(257)).error.code, 'SPAN_LIMIT');
    assert.equal(helper.prepareReferenceDraft(rawDraft('x!'.repeat(256)), { scope: 'whole', protectedLiterals: ['!'] }).ok, true);
    assert.equal(helper.prepareReferenceDraft(rawDraft('x!'.repeat(257)), { scope: 'whole', protectedLiterals: ['!'] }).error.code, 'WINDOW_LIMIT');
    const pins = Array.from({ length: 128 }, (_, i) => 'pin-' + i);
    assert.equal(helper.prepareReferenceDraft(rawDraft('abc'), { scope: 'whole', protectedLiterals: pins }).ok, true);
    assert.equal(helper.prepareReferenceDraft({ ...rawDraft('abc'), protectedLiterals: pins }, { scope: 'whole', protectedLiterals: ['extra'] }).error.code, 'INVALID_SETTINGS');
    assert.equal(helper.prepareReferenceDraft(rawDraft('abc'), { scope: 'whole', protectedLiterals: ['x'.repeat(2048)] }).ok, true);
    for (const pin of ['', ' ', 'x'.repeat(2049)]) assert.equal(helper.prepareReferenceDraft(rawDraft('abc'), { scope: 'whole', protectedLiterals: [pin] }).ok, false);
    assert.equal(helper.prepareReferenceDraft({ ...rawDraft('a😀b'), spans: [{ index: 0, start: 1, end: 2, text: '\ud83d' }] }).ok, false);
    assert.equal(helper.prepareReferenceDraft(rawDraft('a😀b'), { scope: 'whole', protectedLiterals: ['\ud83d'] }).ok, false);
    // Exact traversal bounds characterize the own-data clone used above.
    // rawDraft('abc') uses 8 values and 67 key/string UTF-16 units.
    assert.equal(helper.prepareReferenceDraft({ ...rawDraft('abc'), extra: 'x'.repeat(499928) }, { scope: 'whole' }).ok, true);
    assert.equal(helper.prepareReferenceDraft({ ...rawDraft('abc'), extra: 'x'.repeat(499929) }, { scope: 'whole' }).ok, false);
    assert.equal(helper.prepareReferenceDraft({ ...rawDraft('abc'), extra: Array(19991).fill(null) }, { scope: 'whole' }).ok, true);
    assert.equal(helper.prepareReferenceDraft({ ...rawDraft('abc'), extra: Array(19992).fill(null) }, { scope: 'whole' }).ok, false);
    const nested = count => { let value = null; for (let i = 0; i < count; i++) value = { next: value }; return value; };
    assert.equal(helper.prepareReferenceDraft({ ...rawDraft('abc'), extra: nested(39) }, { scope: 'whole' }).ok, true);
    assert.equal(helper.prepareReferenceDraft({ ...rawDraft('abc'), extra: nested(40) }, { scope: 'whole' }).ok, false);
});

test('Draft cloning rejects unsafe data without reading accessors or granting authority', () => {
    let reads = 0;
    const getter = rawDraft('abc');
    Object.defineProperty(getter.source, 'token', { enumerable: true, get() { reads++; return 'unsafe'; } });
    const inherited = { ...rawDraft('abc'), source: Object.create({ originalText: 'abc' }) };
    const cycle = rawDraft('abc'); cycle.extra = cycle;
    const sparse = rawDraft('abc'); sparse.extra = new Array(1);
    const extended = rawDraft('abc'); extended.extra = []; extended.extra.named = 1;
    for (const unsafe of [getter, inherited, cycle, sparse, extended, { ...rawDraft('abc'), extra: new Date() }, { ...rawDraft('abc'), extra: Infinity }, { ...rawDraft('abc'), extra: Symbol() }]) {
        const result = helper.prepareReferenceDraft(unsafe, { scope: 'whole' });
        assert.equal(result.ok, false);
        assert.equal(result.data, undefined);
    }
    assert.equal(reads, 0);
    const draft = rawDraft('abc'); draft.extra = undefined;
    const prepared = must(helper.prepareReferenceDraft(draft, { scope: 'whole' }));
    assert.equal(Object.getPrototypeOf(prepared.draft.source), null);
    assert.equal(Object.hasOwn(prepared.draft, 'extra'), true);
    for (const forged of [{ ...prepared }, structuredClone(prepared), { draft: prepared.draft, windows: [] }]) {
        assert.equal(helper.createReferencePatches(forged, []).error.code, 'INVALID_PREPARATION');
        assert.equal(helper.alignReferenceCandidate(forged, 'abc').error.code, 'INVALID_PREPARATION');
    }
});

test('overlapping protected ranges subtract windows and rebuild each original parent once', () => {
    const text = 'a KEEP b "talk" c';
    const draft = { ...rawDraft(text), spans: [{ index: 0, start: 0, end: text.length, text }], protectedLiterals: ['KEEP'] };
    const prepared = must(helper.prepareReferenceDraft(draft, { scope: 'narration', protectedLiterals: ['KE', 'EEP', 'KEEP'] }));
    assert.deepEqual(prepared.protectedLiterals, ['KEEP', 'KE', 'EEP']);
    assert.deepEqual(prepared.windows.map(w => [w.start, w.end, w.text]), [[0, 2, 'a '], [6, 9, ' b '], [15, 17, ' c']]);
    const { artifact } = must(helper.createReferencePatches(prepared, ['A ', ' B ', ' C']));
    assert.deepEqual(artifact.patches.map(p => [p.index, p.replacement]), [[0, 'A KEEP B "talk" C']]);
    assert.equal(validatePatches(artifact).artifact.text, 'A KEEP B "talk" C');
    assert.deepEqual(prepared.draft.spans.map(s => [s.start, s.end]), [[0, 17]]);
});

test('balanced quote scopes retain delimiters and fail visibly on ambiguous quotes', () => {
    const text = 'A "hello" B “world” C';
    const whole = { ...rawDraft(text), spans: [{ index: 0, start: 0, end: text.length, text }] };
    assert.deepEqual(must(helper.prepareReferenceDraft(whole, { scope: 'dialogue' })).windows.map(w => w.text), ['hello', 'world']);
    assert.deepEqual(must(helper.prepareReferenceDraft(rawDraft(text), { scope: 'narration' })).windows.map(w => w.text), ['A ', ' B ', ' C']);
    for (const ambiguous of ['A "oops', 'A ”oops', '“mixed"quotes”']) {
        assert.equal(helper.prepareReferenceDraft(rawDraft(ambiguous), { scope: 'dialogue' }).error.code, 'UNMATCHED_QUOTES');
    }
});

test('scope never constructs or widens existing permissions implicitly', () => {
    assert.equal(helper.prepareReferenceDraft(rawDraft('abc')).error.code, 'SCOPE_REQUIRED');
    assert.equal(helper.prepareReferenceDraft({ ...rawDraft('abc'), scope: 'whole' }, { scope: 'whole' }).ok, false);
    const empty = must(helper.prepareReferenceDraft({ ...rawDraft('abc'), spans: [] }, { scope: 'whole' }));
    assert.deepEqual(empty.windows, []);
    assert.deepEqual(must(helper.createReferencePatches(empty, [])).artifact.patches, []);
    assert.deepEqual(must(helper.alignReferenceCandidate(empty, 'abc')).artifact.patches, []);
    assert.equal(helper.alignReferenceCandidate(empty, 'changed').error.code, 'OUT_OF_SCOPE_CHANGE');
    const protectedWhole = must(helper.prepareReferenceDraft(rawDraft('abc'), { scope: 'whole', protectedLiterals: ['abc'] }));
    assert.deepEqual(protectedWhole.windows, []);
    assert.equal(helper.alignReferenceCandidate(protectedWhole, 'changed').ok, false);
    const existing = { ...rawDraft('a bc d'), spans: [{ index: 0, start: 2, end: 4, text: 'bc', note: 'retain' }] };
    const prepared = must(helper.prepareReferenceDraft(existing, { scope: 'whole' }));
    assert.equal(prepared.draft.spans[0].note, 'retain');
    assert.deepEqual(prepared.windows, [{ index: 0, spanIndex: 0, start: 2, end: 4, text: 'bc' }]);
    assert.equal(validatePatches(must(helper.createReferencePatches(prepared, ['BC'])).artifact).artifact.text, 'a BC d');
});

for (const [name, replacement, candidate] of [['reduced newline', '\n', 'Title\nBody'], ['empty gap', '', 'TitleBody']]) {
    test(`window replacements permit ${name} between protected literals in a nonblank parent`, () => {
        const prepared = must(helper.prepareReferenceDraft(rawDraft('Title\n\nBody'), { scope: 'whole', protectedLiterals: ['Title', 'Body'] }));
        assert.deepEqual(prepared.windows.map(window => window.text), ['\n\n']);
        const { artifact } = must(helper.createReferencePatches(prepared, [replacement]));
        assert.equal(artifact.kind, 'patches');
        assert.deepEqual(artifact.patches.map(patch => [patch.index, patch.replacement]), [[0, candidate]]);
        assert.deepEqual(artifact.protectedLiterals, ['Title', 'Body']);
        const validated = validatePatches(artifact);
        assert.equal(validated.ok, true);
        assert.equal(validated.artifact.text, candidate);
        assert.equal(artifact.draft.text, 'Title\n\nBody');
        assert.equal(artifact.draft.source.token, 'source-token');
    });

    test(`candidate alignment permits ${name} between protected literals in a nonblank parent`, () => {
        const prepared = must(helper.prepareReferenceDraft(rawDraft('Title\n\nBody'), { scope: 'whole', protectedLiterals: ['Title', 'Body'] }));
        const { artifact } = must(helper.alignReferenceCandidate(prepared, candidate));
        assert.deepEqual(artifact.patches.map(patch => [patch.index, patch.replacement]), [[0, candidate]]);
        const validated = validatePatches(artifact);
        assert.equal(validated.ok, true);
        assert.equal(validated.artifact.text, candidate);
        assert.deepEqual(prepared.draft.spans.map(span => [span.start, span.end, span.text]), [[0, 11, 'Title\n\nBody']]);
    });
}

test('blank changed parents still fail the native patch gate through reconstruction and alignment', () => {
    const prepared = must(helper.prepareReferenceDraft(rawDraft('old'), { scope: 'whole' }));
    for (const replacement of ['', '\n', '   ']) {
        const native = validatePatches({ kind: 'patches', draft: prepared.draft, patches: [{ index: 0, replacement }] });
        assert.equal(native.ok, false);
        assert.equal(native.error.code, 'INVALID_PATCHES');
        for (const result of [helper.createReferencePatches(prepared, [replacement]), helper.alignReferenceCandidate(prepared, replacement)]) {
            assert.equal(result.ok, false);
            assert.equal(result.error.code, native.error.code);
            assert.equal(result.data, undefined);
        }
    }
});

test('exact deletions consume reference permissions without relaxing ordinary blank patch gates', async () => {
    const revisions = await import('../src/workflow/draft-revisions.js?v=0.27.1');
    const text = 'A|Elara|B';
    const parent = { ...rawDraft(text), spans: [{ index: 0, start: 2, end: 7, text: 'Elara' }] };
    const prepared = must(helper.prepareReferenceDraft(parent, { scope: 'whole' }));
    assert.equal(helper.createReferencePatches(prepared, ['']).error.code, 'INVALID_PATCHES');
    const deleted = must(revisions.createDraftDeletionRevision(parent, [{ start: 2, end: 7 }], { nodeId: 'filter', scope: 'authorized' })).draft;
    assert.equal(deleted.text, 'A||B');
    assert.deepEqual(deleted.spans, []);
    assert.equal(deleted.source.originalText, text);
    const next = must(helper.prepareReferenceDraft(deleted, { scope: 'whole' }));
    assert.deepEqual(next.windows, []);
    assert.equal(helper.alignReferenceCandidate(next, 'A|changed|B').error.code, 'OUT_OF_SCOPE_CHANGE');
    assert.equal(helper.prepareReferenceDraft(structuredClone(deleted), { scope: 'whole' }).error.code, 'INVALID_ANCESTRY');
});
