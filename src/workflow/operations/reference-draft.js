import { snapshotDraft, retainDraftAuthority, readDraftBody } from '../draft-revisions.js?v=0.27.1';
import { validatePatches } from '../repair.js?v=0.27.1';

const failure = (code, message) => ({ ok: false, error: { code, message } });
const authenticated = new WeakSet();
const record = data => Object.assign(Object.create(null), data);
const boundary = (text, offset) => !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(text[offset]));
const validPins = pins => Array.isArray(pins) && pins.every(pin => typeof pin === 'string' && pin.trim() && pin.length <= 2048);
function cloneData(input) {
    let values = 0, characters = 0;
    const active = new Set();
    function clone(value, depth) {
        if (++values > 20000 || depth > 40) throw new Error('Data traversal limit.');
        if (typeof value === 'string') {
            characters += value.length;
            if (characters > 500000) throw new Error('Data text limit.');
            return value;
        }
        if (value === undefined || value === null || typeof value === 'boolean') return value;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (!value || typeof value !== 'object' || active.has(value)) throw new Error('Unsafe data.');
        const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
        if (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) throw new Error('Nonplain data.');
        const descriptors = record(Object.getOwnPropertyDescriptors(value)), keys = Reflect.ownKeys(descriptors);
        const length = array ? descriptors.length.value : 0;
        if (array && keys.length !== length + 1) throw new Error('Sparse data.');
        const output = array ? [] : record({});
        active.add(value);
        for (const key of keys) {
            if (array && key === 'length') continue;
            const property = descriptors[key];
            if (typeof key !== 'string' || !property.enumerable || !Object.hasOwn(property, 'value')) throw new Error('Unsafe property.');
            if (array && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length)) throw new Error('Extended array.');
            characters += key.length;
            if (characters > 500000) throw new Error('Data text limit.');
            Object.defineProperty(output, key, { value: clone(property.value, depth + 1), enumerable: true, writable: true, configurable: true });
        }
        active.delete(value);
        return output;
    }
    return clone(input, 0);
}
function freeze(value) {
    if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); }
    return value;
}
function scopeRanges(text, scope) {
    if (scope === 'authorized' || scope === 'whole') return [[0, text.length]];
    const dialogue = [], narration = [];
    let open = null, start = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (!['"', '“', '”'].includes(char)) continue;
        if (open && char === open.close) {
            if (start < open.start) narration.push([start, open.start]);
            if (open.start + 1 < i) dialogue.push([open.start + 1, i]);
            start = i + 1; open = null;
        } else if (!open && char !== '”') open = { start: i, close: char === '“' ? '”' : '"' };
        else throw new Error('UNMATCHED_QUOTES');
    }
    if (open) throw new Error('UNMATCHED_QUOTES');
    if (start < text.length) narration.push([start, text.length]);
    return scope === 'dialogue' ? dialogue : narration;
}
function protectedRanges(text, pins) {
    // Accumulate coverage in bounded original-text space rather than retaining
    // every match (overlapping pins can otherwise produce millions of ranges).
    const changes = new Int32Array(text.length + 1);
    for (const pin of pins) {
        for (let at = text.indexOf(pin); at >= 0; at = text.indexOf(pin, at + 1)) { changes[at]++; changes[at + pin.length]--; }
    }
    const merged = [];
    let coverage = 0, start = 0;
    for (let offset = 0; offset <= text.length; offset++) {
        const previous = coverage; coverage += changes[offset];
        if (!previous && coverage) start = offset;
        else if (previous && !coverage) merged.push([start, offset]);
    }
    return merged;
}

export function prepareReferenceDraft(draft, settings = {}) {
    let snapshot;
    try { snapshot = cloneData(draft); }
    catch { return failure('INVALID_DRAFT', 'Draft must contain bounded own plain data.'); }
    if (!snapshot || !['kind', 'text', 'source'].every(key => Object.hasOwn(snapshot, key)) || snapshot.kind !== 'draft' || typeof snapshot.text !== 'string' || !snapshot.source || typeof snapshot.source !== 'object' || !Object.hasOwn(snapshot.source, 'originalText') || typeof snapshot.source.originalText !== 'string') return failure('INVALID_DRAFT', 'Draft requires own original source text.');
    if (snapshot.text.length > 100000) return failure('INPUT_LIMIT', 'Draft exceeds 100,000 UTF-16 units.');
    const revision = Object.hasOwn(snapshot, 'lineage') || Object.hasOwn(snapshot, 'revisionId') || snapshot.text !== snapshot.source.originalText ? snapshotDraft(draft) : { ok: true, data: { revised: false } };
    if (!revision.ok) return failure(revision.error.code, revision.error.message);
    if (revision.data.revised) {
        const retained = retainDraftAuthority(draft, snapshot);
        if (!retained.ok) return retained;
        snapshot = retained.data.draft;
    }
    try { settings = cloneData(settings); }
    catch { return failure('INVALID_SETTINGS', 'Settings require bounded own plain data.'); }
    if (!settings || Array.isArray(settings) || typeof settings !== 'object' || Object.keys(settings).some(key => !['scope', 'protectedLiterals'].includes(key)) || !['authorized', 'whole', 'narration', 'dialogue'].includes(settings.scope === undefined ? 'authorized' : settings.scope) || !validPins(settings.protectedLiterals === undefined ? [] : settings.protectedLiterals) || !validPins(snapshot.protectedLiterals === undefined ? [] : snapshot.protectedLiterals)) return failure('INVALID_SETTINGS', 'Use a supported scope and bounded nonblank protected literals.');
    const pins = [...new Set([...(snapshot.protectedLiterals ?? []), ...(settings.protectedLiterals ?? [])])];
    if (pins.length > 128) return failure('INVALID_SETTINGS', 'At most 128 unique protected literals are permitted.');
    const body = revision.data.revised ? readDraftBody(snapshot) : { ok: true, data: { text: snapshot.text } };
    if (!body.ok) return body;
    let selected;
    if (!Object.hasOwn(snapshot, 'spans')) {
        if (Object.hasOwn(snapshot, 'scope')) return failure('INVALID_SPANS', 'Scoped Drafts require existing permissions.');
        if ((settings.scope ?? 'authorized') === 'authorized') return failure('SCOPE_REQUIRED', 'An unannotated Draft requires explicit scope.');
        try { selected = scopeRanges(body.data.text, settings.scope); }
        catch { return failure('UNMATCHED_QUOTES', 'Ambiguous or unmatched double quotes prevent deterministic scope.'); }
        snapshot.spans = selected.filter(([start, end]) => end > start).map(([start, end], index) => ({ index, start, end, text: snapshot.text.slice(start, end) }));
    }
    if (!Array.isArray(snapshot.spans)) return failure('INVALID_SPANS', 'Draft permissions require spans.');
    if (snapshot.spans.length > 256) return failure('SPAN_LIMIT', 'At most 256 original spans are permitted.');
    const initial = validatePatches(record({ kind: 'patches', draft: snapshot, patches: [] }), record({}));
    if (!initial.ok) return { ok: false, error: initial.error };
    // Existing parent permissions are validated before any later narrowing.
    try { selected ??= scopeRanges(body.data.text, settings.scope ?? 'authorized'); }
    catch { return failure('UNMATCHED_QUOTES', 'Ambiguous or unmatched double quotes prevent deterministic scope.'); }
    const protectedText = protectedRanges(snapshot.text, pins);
    const windows = [];
    for (const span of snapshot.spans) for (const [from, to] of selected) {
        const start = Math.max(span.start, from), end = Math.min(span.end, to);
        let cursor = start;
        const add = (from, to) => { if (from < to) windows.push({ index: windows.length, spanIndex: span.index, start: from, end: to, text: snapshot.text.slice(from, to) }); };
        for (const [pinStart, pinEnd] of protectedText) {
            if (pinEnd <= cursor || pinStart >= end) continue;
            add(cursor, pinStart); cursor = Math.min(end, pinEnd);
        }
        add(cursor, end);
    }
    if (windows.length > 256) return failure('WINDOW_LIMIT', 'At most 256 editable windows are permitted.');
    if (windows.some(window => !boundary(snapshot.text, window.start) || !boundary(snapshot.text, window.end))) return failure('INVALID_SPANS', 'Editable boundaries cannot split surrogate pairs.');
    const prepared = freeze({ draft: snapshot, windows, protectedLiterals: pins });
    authenticated.add(prepared);
    return { ok: true, data: prepared };
}

export function createReferencePatches(prepared, replacements, metadata = {}) {
    if (!authenticated.has(prepared)) return failure('INVALID_PREPARATION', 'Use an authenticated reference Draft preparation.');
    try { replacements = cloneData(replacements); }
    catch { return failure('INVALID_PATCHES', 'Replacements require a dense own-data array.'); }
    if (!Array.isArray(replacements) || replacements.length !== prepared.windows.length || replacements.some(text => typeof text !== 'string')) return failure('INVALID_PATCHES', 'Supply one string replacement per editable window.');
    try { metadata = cloneData(metadata); }
    catch { return failure('INVALID_METADATA', 'Completion metadata requires bounded own plain data.'); }
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object' || Object.keys(metadata).some(key => !['usage', 'finish'].includes(key))) return failure('INVALID_METADATA', 'Supply only usage and completion metadata.');
    if (Object.hasOwn(metadata, 'finish') && (typeof metadata.finish !== 'string' || !['stop', 'eos_token', 'eos', 'stop_sequence', 'end_turn', 'complete', 'completed'].includes(metadata.finish.toLowerCase()))) return failure('COMPLETION_UNVERIFIED', 'Completion metadata requires a recognized successful finish.');
    const patches = [];
    for (const span of prepared.draft.spans) {
        let cursor = span.start, replacement = '';
        for (const window of prepared.windows.filter(window => window.spanIndex === span.index)) {
            replacement += prepared.draft.text.slice(cursor, window.start) + replacements[window.index]; cursor = window.end;
        }
        replacement += prepared.draft.text.slice(cursor, span.end);
        if (replacement !== span.text) patches.push(record({ index: span.index, replacement }));
    }
    const artifact = record({ kind: 'patches', draft: prepared.draft, patches, protectedLiterals: prepared.protectedLiterals });
    for (const key of ['usage', 'finish']) if (Object.hasOwn(metadata, key)) artifact[key] = metadata[key];
    const outputLength = prepared.draft.text.length + patches.reduce((sum, patch) => sum + patch.replacement.length - prepared.draft.spans[patch.index].text.length, 0);
    if (outputLength > 100000) return failure('OUTPUT_LIMIT', 'Candidate exceeds 100,000 UTF-16 units.');
    const validated = validatePatches(artifact, record({}));
    if (!validated.ok) return { ok: false, error: validated.error };
    return { ok: true, data: { artifact, report: validated.reports } };
}

export function alignReferenceCandidate(prepared, candidate, metadata = {}) {
    if (!authenticated.has(prepared)) return failure('INVALID_PREPARATION', 'Use an authenticated reference Draft preparation.');
    if (typeof candidate !== 'string') return failure('INVALID_CANDIDATE', 'Candidate must be exact text.');
    if (candidate.length > 100000) return failure('OUTPUT_LIMIT', 'Candidate exceeds 100,000 UTF-16 units.');
    const { draft, windows } = prepared;
    if (candidate === draft.text) return createReferencePatches(prepared, windows.map(window => window.text), metadata);
    if (!windows.length) return failure('OUT_OF_SCOPE_CHANGE', 'Candidate changed immutable original text.');
    const prefix = draft.text.slice(0, windows[0].start), suffix = draft.text.slice(windows.at(-1).end);
    if (!candidate.startsWith(prefix) || !candidate.endsWith(suffix) || prefix.length + suffix.length > candidate.length) return failure('OUT_OF_SCOPE_CHANGE', 'Candidate changed immutable original boundaries.');
    const anchors = windows.slice(0, -1).map((window, index) => draft.text.slice(window.end, windows[index + 1].start));
    const end = candidate.length - suffix.length, positions = [];
    let cursor = prefix.length;
    for (const anchor of anchors) {
        const position = candidate.indexOf(anchor, cursor);
        if (position < 0 || position + anchor.length > end) return failure('OUT_OF_SCOPE_CHANGE', 'Candidate changed an immutable original anchor.');
        positions.push(position); cursor = position + anchor.length;
    }
    cursor = end;
    for (let index = anchors.length - 1; index >= 0; index--) {
        const anchor = anchors[index];
        const position = candidate.lastIndexOf(anchor, cursor - anchor.length);
        if (position < prefix.length) return failure('OUT_OF_SCOPE_CHANGE', 'Candidate changed an immutable original anchor.');
        if (position !== positions[index]) return failure('AMBIGUOUS_ALIGNMENT', 'Immutable anchors admit multiple editable window alignments.');
        cursor = position;
    }
    const replacements = [];
    cursor = prefix.length;
    for (let index = 0; index < positions.length; index++) {
        replacements.push(candidate.slice(cursor, positions[index])); cursor = positions[index] + anchors[index].length;
    }
    replacements.push(candidate.slice(cursor, end));
    const result = createReferencePatches(prepared, replacements, metadata);
    if (!result.ok) return result;
    const validated = validatePatches(result.data.artifact, record({}));
    if (!validated.ok || validated.artifact.text !== candidate) return failure('OUT_OF_SCOPE_CHANGE', 'Candidate cannot be reconstructed from its editable windows.');
    return result;
}
