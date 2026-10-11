const authenticated = new WeakMap();
let sequence = 0;
const fail = (code, message) => ({ ok: false, error: { code, message } });
const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };
/** Bounded data snapshots never evaluate getters or user serialization hooks. */
function snapshot(input) {
    let visited = 0, characters = 0;
    const active = new Set();
    function clone(value, depth = 0) {
        if (++visited > 20000 || depth > 40) throw new Error();
        if (typeof value === 'string') { if ((characters += value.length) > 500000) throw new Error(); return value; }
        if (value === undefined || value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
        if (!value || typeof value !== 'object' || active.has(value)) throw new Error();
        const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
        if (array ? proto !== Array.prototype : ![Object.prototype, null].includes(proto)) throw new Error();
        const fields = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(fields);
        const length = array ? fields.length.value : 0;
        if (array && keys.length !== length + 1) throw new Error();
        const output = array ? [] : Object.create(null);
        active.add(value);
        for (const key of keys) {
            if (array && key === 'length') continue;
            const property = fields[key];
            if (typeof key !== 'string' || !property.enumerable || !Object.hasOwn(property, 'value') || array && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length)) throw new Error();
            if ((characters += key.length) > 500000) throw new Error();
            Object.defineProperty(output, key, { value: clone(property.value, depth + 1), enumerable: true, writable: true, configurable: true });
        }
        active.delete(value);
        return output;
    }
    return clone(input);
}
function inspect(input) {
    const value = snapshot(input);
    if (!value || value.kind !== 'draft' || typeof value.text !== 'string' || value.text.length > 100000 || !value.source || typeof value.source.originalText !== 'string' || value.source.originalText.length > 100000) throw new Error('INVALID_DRAFT');
    const authority = authenticated.get(input);
    if (Object.hasOwn(value, 'lineage') || Object.hasOwn(value, 'revisionId') || Object.hasOwn(value, 'rootRevisionId')) {
        if (!authority) throw new Error('INVALID_ANCESTRY');
        authenticated.set(value, authority);
        return { draft: value, authority };
    }
    if (value.text !== value.source.originalText) throw new Error('STALE_SOURCE');
    return { draft: value, authority: null };
}
/** Legacy root DTOs retain their existing host source checks; successors require live authority. */
export function snapshotDraft(input) {
    try { const checked = inspect(input); return { ok: true, data: { draft: freeze(checked.draft), original: checked.draft.source.originalText, revised: Boolean(checked.authority) } }; }
    catch (error) { return fail(error.message || 'INVALID_DRAFT', 'Use a bounded original Draft or an authenticated successor.'); }
}
function scopeRanges(text, scope) {
    if (scope === 'whole' || scope === 'authorized') return [[0, text.length]];
    const dialogue = [], narration = [];
    let opened = null, cursor = 0;
    for (let offset = 0; offset < text.length; offset++) {
        const character = text[offset];
        if (!['"', '“', '”'].includes(character)) continue;
        if (opened && character === opened.close) {
            if (cursor < opened.start) narration.push([cursor, opened.start]);
            if (opened.start + 1 < offset) dialogue.push([opened.start + 1, offset]);
            cursor = offset + 1; opened = null;
        } else if (!opened && character !== '”') opened = { start: offset, close: character === '“' ? '”' : '"' };
        else throw new Error('UNMATCHED_QUOTES');
    }
    if (opened) throw new Error('UNMATCHED_QUOTES');
    if (cursor < text.length) narration.push([cursor, text.length]);
    return scope === 'dialogue' ? dialogue : narration;
}
const boundary = (text, offset) => !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(text[offset]));
function exemptionCoverage(text, exemptions = [], caseSensitive = false) {
    if (!Array.isArray(exemptions) || exemptions.length > 128 || exemptions.some(pin => typeof pin !== 'string' || !pin.trim() || pin.length > 2048) || typeof caseSensitive !== 'boolean') throw new Error('INVALID_SPANS');
    const changes = new Int32Array(text.length + 1);
    for (const pin of exemptions) {
        const matcher = new RegExp(RegExp.escape(pin), caseSensitive ? 'uy' : 'iuy');
        for (let offset = 0; offset < text.length; offset++) {
            matcher.lastIndex = offset;
            const match = matcher.exec(text);
            if (match) { changes[offset]++; changes[offset + match[0].length]--; }
        }
    }
    const covered = new Uint8Array(text.length);
    let active = 0;
    for (let offset = 0; offset < text.length; offset++) { active += changes[offset]; covered[offset] = Number(active > 0); }
    return covered;
}
function narrowExemptions(text, spans, exemptions, caseSensitive) {
    const coverage = exemptionCoverage(text, exemptions, caseSensitive), result = [];
    for (const span of spans) {
        let cursor = span.start;
        while (cursor < span.end) {
            if (coverage[cursor]) { cursor++; continue; }
            const start = cursor;
            while (cursor < span.end && !coverage[cursor]) cursor++;
            if (!boundary(text, start) || !boundary(text, cursor)) throw new Error('INVALID_SPANS');
            result.push({ index: result.length, start, end: cursor, text: text.slice(start, cursor) });
            if (result.length > 256) throw new Error('SPAN_LIMIT');
        }
    }
    return result;
}
function authorizedWindows(parent, scope, pins) {
    if (parent.scope !== undefined && !['whole', 'narration', 'dialogue'].includes(parent.scope)) throw new Error('INVALID_SPANS');
    const body = authenticated.get(parent)?.assembly?.baseText ?? parent.text;
    const selected = scopeRanges(body, scope), retained = scopeRanges(body, parent.scope ?? 'whole');
    let spans = parent.spans;
    if (spans === undefined) {
        if (parent.scope !== undefined) throw new Error('INVALID_SPANS');
        if (scope === 'authorized') throw new Error('SCOPE_REQUIRED');
        spans = [[0, body.length]].filter(([start, end]) => end > start).map(([start, end], index) => ({ index, start, end, text: parent.text.slice(start, end) }));
        // Root permissions are implicit; stored exemptions narrow them before
        // exact inherited-span validation. Authored spans are never repaired.
        spans = narrowExemptions(parent.text, spans, parent.exemptions, parent.caseSensitive);
    }
    if (!Array.isArray(spans) || spans.length > 256 || spans.some((span, index) => !span || span.index !== index || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > parent.text.length || !boundary(parent.text, span.start) || !boundary(parent.text, span.end) || span.text !== parent.text.slice(span.start, span.end) || index > 0 && span.start <= spans[index - 1].end || !retained.some(([start, end]) => span.start >= start && span.end <= end))) throw new Error('INVALID_SPANS');
    const exempted = exemptionCoverage(parent.text, parent.exemptions, parent.caseSensitive);
    if (spans.some(span => exempted.slice(span.start, span.end).some(Boolean))) throw new Error('INVALID_SPANS');
    const coverage = new Int32Array(parent.text.length + 1);
    for (const pin of pins) for (let offset = parent.text.indexOf(pin); offset >= 0; offset = parent.text.indexOf(pin, offset + 1)) { coverage[offset]++; coverage[offset + pin.length]--; }
    let active = 0;
    const protectedPositions = new Uint8Array(parent.text.length);
    for (let offset = 0; offset < parent.text.length; offset++) { active += coverage[offset]; protectedPositions[offset] = Number(active > 0); }
    const windows = [];
    for (const span of spans) for (const [from, to] of selected) {
        const start = Math.max(span.start, from), end = Math.min(span.end, to);
        let cursor = start;
        while (cursor < end) {
            if (protectedPositions[cursor]) { cursor++; continue; }
            const windowStart = cursor;
            while (cursor < end && !protectedPositions[cursor]) cursor++;
            if (!boundary(parent.text, windowStart) || !boundary(parent.text, cursor)) throw new Error('INVALID_SPANS');
            windows.push({ start: windowStart, end: cursor });
        }
    }
    if (windows.length > 256) throw new Error('WINDOW_LIMIT');
    return windows;
}
function alignRevision(parent, text, scope, pins) {
    const windows = authorizedWindows(parent, scope, pins);
    if (!windows.length) { if (text !== parent.text) throw new Error('OUT_OF_SCOPE_CHANGE'); return []; }
    if (text === parent.text) return windows.map((window, index) => ({ index, ...window, text: text.slice(window.start, window.end) }));
    const prefix = parent.text.slice(0, windows[0].start), suffix = parent.text.slice(windows.at(-1).end);
    if (!text.startsWith(prefix) || !text.endsWith(suffix) || prefix.length + suffix.length > text.length) throw new Error('OUT_OF_SCOPE_CHANGE');
    const anchors = windows.slice(0, -1).map((window, index) => parent.text.slice(window.end, windows[index + 1].start));
    const positions = [], end = text.length - suffix.length;
    let cursor = prefix.length;
    for (const anchor of anchors) {
        const position = text.indexOf(anchor, cursor);
        if (position < cursor || position + anchor.length > end) throw new Error('OUT_OF_SCOPE_CHANGE');
        positions.push(position); cursor = position + anchor.length;
    }
    cursor = end;
    for (let index = anchors.length - 1; index >= 0; index--) {
        if (text.lastIndexOf(anchors[index], cursor - anchors[index].length) !== positions[index]) throw new Error('AMBIGUOUS_ALIGNMENT');
        cursor = positions[index];
    }
    const result = [];
    cursor = prefix.length;
    for (let index = 0; index < windows.length; index++) {
        const until = index < positions.length ? positions[index] : end;
        if (until > cursor) result.push({ index: result.length, start: cursor, end: until, text: text.slice(cursor, until) });
        cursor = until + (anchors[index]?.length ?? 0);
    }
    if (result.some(span => !boundary(text, span.start) || !boundary(text, span.end))) throw new Error('INVALID_SPANS');
    return result;
}
export function createDraftRevision(parent, text, settings = {}) {
    const checked = snapshotDraft(parent);
    if (!checked.ok) return checked;
    let controls;
    try { controls = snapshot(settings); } catch { return fail('INVALID_SETTINGS', 'Revision controls require own plain data.'); }
    if (!controls || Array.isArray(controls) || Object.keys(controls).some(key => !['nodeId', 'scope', 'protectedLiterals'].includes(key)) || typeof controls.nodeId !== 'string' || !controls.nodeId.trim() || controls.nodeId.length > 256 || !['whole', 'authorized', 'narration', 'dialogue'].includes(controls.scope)) return fail('INVALID_SETTINGS', 'Specify a node identity and explicit supported revision scope.');
    if (typeof text !== 'string' || !text.trim() || text.length > 100000) return fail('OUTPUT_LIMIT', 'Revision requires nonblank text within 100,000 UTF-16 units.');
    const previous = checked.data.draft;
    const suppliedPins = controls.protectedLiterals ?? [];
    if (!Array.isArray(suppliedPins) || !Array.isArray(previous.protectedLiterals ?? []) || [...suppliedPins, ...(previous.protectedLiterals ?? [])].some(pin => typeof pin !== 'string' || !pin.trim() || pin.length > 2048)) return fail('INVALID_SETTINGS', 'Protections require bounded nonblank literals.');
    const pins = [...new Set([...(previous.protectedLiterals ?? []), ...suppliedPins])];
    if (pins.length > 128) return fail('INVALID_SETTINGS', 'At most 128 protected literals are permitted.');
    let spans;
    try { spans = narrowExemptions(text, alignRevision(previous, text, controls.scope, pins), previous.exemptions, previous.caseSensitive); }
    catch (error) { return fail(error.message, 'Revision changed an immutable region or has invalid scope permissions.'); }
    let authority = authenticated.get(previous) ?? { rootId: `draft-root:${++sequence}`, source: previous.source };
    if (authority.assembly) {
        const suffix = previous.text.slice(authority.assembly.baseText.length);
        if (!text.endsWith(suffix)) return fail('OUT_OF_SCOPE_CHANGE', 'Presentation sections are immutable during narrative revision.');
        authority = { ...authority, assembly: { ...authority.assembly, baseText: suffix.length ? text.slice(0, -suffix.length) : text } };
    }
    const lineage = previous.lineage ?? [];
    if (lineage.length >= 64) return fail('LINEAGE_LIMIT', 'At most 64 revisions may be composed; ancestry is never truncated.');
    const effectiveScope = controls.scope === 'authorized' || previous.scope && controls.scope === 'whole' ? previous.scope ?? 'whole' : controls.scope;
    try {
        const allowed = scopeRanges(authority.assembly?.baseText ?? text, effectiveScope);
        if (spans.some(span => !allowed.some(([start, end]) => span.start >= start && span.end <= end))) return fail('INVALID_SPANS', 'Revision would cross new scope delimiters.');
    } catch { return fail('UNMATCHED_QUOTES', 'Revision introduces ambiguous scope delimiters.'); }
    const id = `draft-revision:${++sequence}`;
    if (authority.assembly) authority = { ...authority, assembly: { ...authority.assembly, bodyRevisionId: text === previous.text ? authority.assembly.bodyRevisionId : id } };
    const draft = freeze({ ...previous, text, revisionId: id, rootRevisionId: authority.rootId, lineage: [...lineage, { id, parentId: previous.revisionId ?? authority.rootId, nodeId: controls.nodeId, scope: controls.scope }], scope: effectiveScope, spans, protectedLiterals: pins });
    try { snapshot(draft); } catch { return fail('OUTPUT_LIMIT', 'Draft output exceeds its own bounded snapshot contract.'); }
    authenticated.set(draft, authority);
    return { ok: true, data: { draft, report: [{ code: 'DRAFT_REVISION', revisionId: id, parentId: draft.lineage.at(-1).parentId, reviewRequired: true }] } };
}
/** Exact deletion uses parent offsets and independently prepared permissions. */
export function createDraftDeletionRevision(parent, ranges, settings = {}) {
    const checked = snapshotDraft(parent);
    if (!checked.ok) return checked;
    const previous = checked.data.draft;
    try { settings = snapshot(settings); } catch { return fail('INVALID_SETTINGS', 'Revision controls require own plain data.'); }
    if (!settings || Array.isArray(settings) || Object.keys(settings).some(key => !['nodeId', 'scope', 'protectedLiterals'].includes(key)) || typeof settings.nodeId !== 'string' || !settings.nodeId.trim() || settings.nodeId.length > 256 || !['whole', 'authorized', 'narration', 'dialogue'].includes(settings.scope)) return fail('INVALID_SETTINGS', 'Specify a node identity and explicit supported revision scope.');
    const suppliedPins = settings.protectedLiterals ?? [];
    if (!Array.isArray(suppliedPins) || !Array.isArray(previous.protectedLiterals ?? []) || [...suppliedPins, ...(previous.protectedLiterals ?? [])].some(pin => typeof pin !== 'string' || !pin.trim() || pin.length > 2048)) return fail('INVALID_SETTINGS', 'Protections require bounded nonblank literals.');
    try { ranges = snapshot(ranges); } catch { return fail('INVALID_DELETE_RANGES', 'Deletion ranges require bounded own plain data.'); }
    if (!Array.isArray(ranges) || ranges.length > 256 || ranges.some((range, index) => !range || Array.isArray(range) || Object.keys(range).length !== 2 || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end <= range.start || range.end > previous.text.length || !boundary(previous.text, range.start) || !boundary(previous.text, range.end) || index > 0 && range.start < ranges[index - 1].end)) return fail('INVALID_DELETE_RANGES', 'Use at most 256 sorted nonoverlapping Unicode-safe exact ranges.');

    const pins = [...new Set([...(previous.protectedLiterals ?? []), ...(settings.protectedLiterals ?? [])])];
    if (pins.length > 128) return fail('INVALID_SETTINGS', 'At most 128 protected literals are permitted.');
    let windows;
    try { windows = authorizedWindows(previous, settings.scope, pins); }
    catch (error) { return fail(error.message, 'Deletion requires valid parent permissions.'); }
    if (!ranges.length) return { ok: true, data: { draft: parent, report: [] } };
    if (ranges.some(range => !windows.some(window => range.start >= window.start && range.end <= window.end))) return fail('OUT_OF_SCOPE_CHANGE', 'A deletion crosses immutable, protected or exempt text.');
    // Validate each authored unit atomically before merging adjacent removals.
    const merged = [];
    for (const range of ranges) {
        if (merged.at(-1)?.end === range.start) merged.at(-1).end = range.end;
        else merged.push({ ...range });
    }
    ranges = merged;
    let cursor = 0, text = '';
    for (const range of ranges) { text += previous.text.slice(cursor, range.start); cursor = range.end; }
    text += previous.text.slice(cursor);
    const offset = position => position - ranges.reduce((removed, range) => removed + Math.max(0, Math.min(position, range.end) - range.start), 0);
    const bodyLength = authenticated.get(previous)?.assembly?.baseText.length ?? previous.text.length;
    if (!text.slice(0, offset(bodyLength)).trim()) return fail('EMPTY_FILTER_RESULT', 'Deletion must retain a nonblank story body.');
    let spans;
    try { spans = narrowExemptions(text, windows.map(window => ({ start: offset(window.start), end: offset(window.end) })).filter(span => span.end > span.start), previous.exemptions, previous.caseSensitive); }
    catch (error) { return fail(error.message, 'Deletion cannot emit invalid exemption permissions.'); }
    let authority = authenticated.get(previous) ?? { rootId: `draft-root:${++sequence}`, source: previous.source };
    if ((previous.lineage?.length ?? 0) >= 64) return fail('LINEAGE_LIMIT', 'At most 64 revisions may be composed; ancestry is never truncated.');
    const id = `draft-revision:${++sequence}`;
    if (authority.assembly) authority = { ...authority, assembly: { ...authority.assembly, baseText: text.slice(0, offset(bodyLength)), bodyRevisionId: id } };
    const draft = freeze({ ...previous, text, revisionId: id, rootRevisionId: authority.rootId, lineage: [...(previous.lineage ?? []), { id, parentId: previous.revisionId ?? authority.rootId, nodeId: settings.nodeId, scope: settings.scope }], scope: settings.scope === 'authorized' || previous.scope && settings.scope === 'whole' ? previous.scope ?? 'whole' : settings.scope, spans, protectedLiterals: pins });
    try { snapshot(draft); } catch { return fail('OUTPUT_LIMIT', 'Draft output exceeds its own bounded snapshot contract.'); }
    authenticated.set(draft, authority);
    return { ok: true, data: { draft, report: [{ code: 'DRAFT_REVISION', revisionId: id, parentId: draft.lineage.at(-1).parentId, reviewRequired: true }] } };
}
export function toFinalCandidate(input) {
    const checked = snapshotDraft(input);
    if (!checked.ok) return checked;
    if (!checked.data.revised) return fail('INVALID_ANCESTRY', 'Final revision requires authenticated Draft lineage.');
    const draft = checked.data.draft;
    return { ok: true, data: { candidate: freeze({ kind: 'candidate', original: draft.source.originalText, text: draft.text, source: draft.source, findings: draft.findings ?? [], changes: [], reviewRequired: true, revisionId: draft.revisionId, rootRevisionId: draft.rootRevisionId, lineage: draft.lineage }) } };
}

/** Same-text annotation is not a declassification capability, including nested material. */
function disclosureRestrictions(value) {
    const restrictions = new Map();
    function visit(item, path) {
        if (!item || typeof item !== 'object') return;
        const marker = Object.create(null);
        if (Object.hasOwn(item, 'visibility') && item.visibility !== 'public' && item.visibility?.kind !== 'public') {
            marker.visibility = item.visibility;
            if (Object.hasOwn(item, 'actorId')) marker.actorId = item.actorId;
        }
        if (Object.hasOwn(item, 'visibleTo')) marker.visibleTo = item.visibleTo;
        if (['actor-state', 'reflection', 'state-proposal', 'episodes', 'commit-intent'].includes(item.recordType)) {
            marker.recordType = item.recordType;
            marker.scope = item.scope;
        }
        if (Object.keys(marker).length) restrictions.set(JSON.stringify(path), JSON.stringify(marker));
        for (const [key, child] of Object.entries(item)) visit(child, [...path, key]);
    }
    visit(value, []);
    return restrictions;
}
/** Preserve authority while pure processors add narrower spans/findings to the same text. */
export function retainDraftAuthority(parent, output) {
    const authority = authenticated.get(parent);
    if (!authority) {
        if (parent && (Object.hasOwn(parent, 'lineage') || Object.hasOwn(parent, 'revisionId'))) return fail('INVALID_ANCESTRY', 'Copied lineage is not authenticated.');
        return { ok: true, data: { draft: output } };
    }
    let value;
    try { value = snapshot(output); } catch { return fail('INVALID_DRAFT', 'Annotations require bounded own plain data.'); }
    for (const key of ['kind', 'text', 'source', 'revisionId', 'rootRevisionId', 'lineage']) if (JSON.stringify(value[key]) !== JSON.stringify(parent[key])) return fail('INVALID_ANCESTRY', 'Annotations cannot change revision ancestry, source or text.');
    if (!Array.isArray(value.spans) || value.spans.length > 256 || value.spans.some((span, index) => !span || span.index !== index || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > value.text.length || !boundary(value.text, span.start) || !boundary(value.text, span.end) || span.text !== value.text.slice(span.start, span.end) || index > 0 && span.start <= value.spans[index - 1].end || !parent.spans.some(permitted => span.start >= permitted.start && span.end <= permitted.end))) return fail('INVALID_SPANS', 'Annotations require valid exact spans and cannot widen revision permissions.');
    if (value.scope !== parent.scope || value.caseSensitive !== parent.caseSensitive && parent.caseSensitive !== undefined || (parent.exemptions?.length ?? 0) > 0 && (value.caseSensitive ?? false) !== (parent.caseSensitive ?? false)) return fail('INVALID_SPANS', 'Annotations cannot reinterpret stored scope or exemption case authority.');
    try {
        const exemptions = value.exemptions ?? [];
        const coverage = exemptionCoverage(value.text, exemptions, value.caseSensitive);
        if ((parent.exemptions ?? []).some(pin => !exemptions.includes(pin)) || value.spans.some(span => coverage.slice(span.start, span.end).some(Boolean))) return fail('INVALID_SPANS', 'Annotations must retain existing exemptions and narrow permissions for added exemptions.');
    } catch { return fail('INVALID_SPANS', 'Annotations require bounded valid exemption protection.'); }
    const disclosures = disclosureRestrictions(value);
    for (const [path, restriction] of disclosureRestrictions(parent)) if (disclosures.get(path) !== restriction) return fail('DISCLOSURE_CHANGED', 'Annotations cannot remove or change existing disclosure restrictions.');
    const originalPins = parent.protectedLiterals ?? [];
    if (!Array.isArray(value.protectedLiterals ?? []) || originalPins.some(pin => !(value.protectedLiterals ?? []).includes(pin))) return fail('PROTECTED_LITERAL_REMOVED', 'Annotations cannot remove protection authority.');
    freeze(value); authenticated.set(value, authority);
    return { ok: true, data: { draft: value } };
}

/** Assemble presentation after the exact current body; only live section authority permits replacement. */
export function appendDraftSections(parent, sections, settings = {}) {
    const checked = snapshotDraft(parent);
    if (!checked.ok) return checked;
    let value, controls;
    try { value = snapshot(sections); controls = snapshot(settings); } catch { return fail('INVALID_ASSEMBLY', 'Assembly requires bounded own-data sections and controls.'); }
    if (!controls || Array.isArray(controls) || Object.keys(controls).some(key => !['nodeId', 'separator'].includes(key)) || typeof controls.nodeId !== 'string' || !controls.nodeId.trim() || controls.nodeId.length > 256 || typeof (controls.separator ?? '\n\n') !== 'string' || (controls.separator ?? '\n\n').length > 2048 || !Array.isArray(value) || value.length > 64 || value.some(section => !section || typeof section !== 'object' || Array.isArray(section) || Object.keys(section).length !== 2 || typeof section.id !== 'string' || !section.id.trim() || section.id.length > 256 || typeof section.text !== 'string' || section.text.length > 100000) || new Set(value.map(section => section.id)).size !== value.length) return fail('INVALID_ASSEMBLY', 'Use unique stable section identities, bounded text and an explicit separator.');
    const previous = checked.data.draft;
    let authority = authenticated.get(previous) ?? { rootId: `draft-root:${++sequence}`, source: previous.source };
    if (!value.length && checked.data.revised) return { ok: true, data: { draft: previous, report: [{ code: 'EMPTY_ASSEMBLY', actualCalls: 0 }] } };
    const assembly = authority.assembly ?? { baseText: previous.text, bodyRevisionId: previous.revisionId ?? authority.rootId, sections: [] };
    const pending = assembly.sections.map(section => ({ ...section }));
    for (const section of value) {
        const at = pending.findIndex(existing => existing.id === section.id);
        if (at < 0) { if (section.text.length) pending.push({ ...section, separator: controls.separator ?? '\n\n' }); }
        else if (section.text.length) pending[at] = { ...section, separator: controls.separator ?? '\n\n' };
        else pending.splice(at, 1);
    }
    if (pending.length > 64) return fail('ASSEMBLY_LIMIT', 'At most 64 pending sections are permitted.');
    const text = assembly.baseText + pending.map(section => section.separator + section.text).join('');
    if (text.length > 100000) return fail('OUTPUT_LIMIT', 'Assembled reply exceeds 100,000 UTF-16 units.');
    const lineage = previous.lineage ?? [];
    if (lineage.length >= 64) return fail('LINEAGE_LIMIT', 'At most 64 composed revisions are permitted.');
    const id = `draft-revision:${++sequence}`;
    const draft = freeze({ ...previous, text, revisionId: id, rootRevisionId: authority.rootId, lineage: [...lineage, { id, parentId: previous.revisionId ?? authority.rootId, nodeId: controls.nodeId, scope: 'append' }], spans: previous.spans ?? (assembly.baseText.length ? [{ index: 0, start: 0, end: assembly.baseText.length, text: assembly.baseText }] : []), scope: previous.scope ?? 'whole', presentationSections: pending.map(section => ({ id: section.id, text: section.text })) });
    authority = { ...authority, assembly: { baseText: assembly.baseText, bodyRevisionId: assembly.bodyRevisionId, sections: pending } };
    try { snapshot(draft); } catch { return fail('OUTPUT_LIMIT', 'Draft output exceeds its own bounded snapshot contract.'); }
    authenticated.set(draft, authority);
    return { ok: true, data: { draft, report: [{ code: 'DRAFT_ASSEMBLY', sectionIds: pending.map(section => section.id), bodyPreserved: true, actualCalls: 0 }] } };
}
/** Presentation is not fresh scene evidence; this view cannot reconstruct Draft authority. */
export function readDraftBody(input) {
    const checked = snapshotDraft(input);
    if (!checked.ok) return checked;
    const draft = checked.data.draft, assembly = authenticated.get(draft)?.assembly;
    return { ok: true, data: freeze({ kind: 'text', text: assembly?.baseText ?? draft.text, provenance: { type: 'draft-story-body', revisionId: assembly?.bodyRevisionId ?? draft.revisionId ?? null, assembledRevisionId: draft.revisionId ?? null, rootRevisionId: draft.rootRevisionId ?? null } }) };
}