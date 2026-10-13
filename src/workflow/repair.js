import { snapshotDraft, retainDraftAuthority, readDraftBody } from './draft-revisions.js?v=0.27.2';
const MAX_TEXT = 100000, MAX_SPANS = 256;
const success = artifact => ({ ok: true, artifact, reports: [], calls: [], trace: [] });
const failure = (code, message, node, artifact) => ({ ok: false, error: { code, message, ...(node?.id ? { nodeId: node.id } : {}) }, ...(artifact ? { artifact } : {}), reports: [], calls: [], trace: [] });
function scopeRanges(text, scope) {
    const dialogue = [], unmatched = [];
    let opened = null;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char !== '"' && char !== '“' && char !== '”') continue;
        if (opened && char === opened.close) { dialogue.push([opened.start + 1, i]); opened = null; }
        else if (!opened && char !== '”') opened = { start: i, close: char === '“' ? '”' : '"' };
        else unmatched.push(i);
    }
    if (opened) unmatched.push(opened.start);
    const narration = [];
    let start = 0;
    for (const [from, to] of dialogue) { if (start < from - 1) narration.push([start, from - 1]); start = to + 1; }
    if (start < text.length) narration.push([start, text.length]);
    return { ranges: scope === 'whole' ? [[0, text.length]] : scope === 'dialogue' ? dialogue : narration, unmatched };
}
function literalRanges(text, phrases, caseSensitive = true) {
    const ranges = [];
    // Sticky matching preserves UTF-16 offsets even when Unicode lowercasing changes length.
    for (const phrase of phrases) {
        if (typeof phrase !== 'string' || !phrase.length) continue;
        const escaped = RegExp.escape(phrase);
        const matcher = new RegExp(escaped, caseSensitive ? 'uy' : 'iuy');
        for (let start = 0; start < text.length; start++) {
            matcher.lastIndex = start;
            const match = matcher.exec(text);
            if (match && match.index === start) ranges.push([start, start + match[0].length]);
        }
    }
    return ranges;
}
const literalList = (value, rules = false) => Array.isArray(value) && value.length <= 128 && value.every(item => {
    const phrase = rules && item && typeof item === 'object' ? item.phrase : item;
    return typeof phrase === 'string' && phrase.trim().length > 0 && phrase.length <= 2048;
});
function validSettings(node, scan = false) {
    if (!node || typeof node !== 'object' || !literalList(node.protectedLiterals ?? [])) return false;
    if (scan) return ['authorized', 'whole', 'narration', 'dialogue'].includes(node.scope ?? 'authorized') && typeof (node.caseSensitive ?? false) === 'boolean' && literalList(node.rules ?? [], true) && literalList(node.exemptions ?? []);
    return ['repair', 'scan'].includes(node.mode ?? 'repair') && typeof (node.instructions ?? '') === 'string' && (node.instructions ?? '').length <= 10000 && typeof (node.strength ?? 'light') === 'string' && (node.strength ?? '').length <= 1000 && Number.isSafeInteger(node.maxTokens ?? 2048) && (node.maxTokens ?? 2048) > 0 && (node.maxTokens ?? 2048) <= 65536;
}
const validDraft = draft => draft?.kind === 'draft' && typeof draft.text === 'string' && draft.source && typeof draft.source.originalText === 'string';
function validFindings(findings) {
    if (findings === undefined) return true;
    if (!Array.isArray(findings)) return false;
    for (let index = 0; index < findings.length; index++) {
        const finding = findings[index];
        if (!finding || typeof finding !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(finding))) return false;
    }
    return true;
}
/** Scan editable literal preferences without changing source text or calling a model. */
export function scanDraft(draft, node = {}) {
    if (!validSettings(node, true)) return failure('INVALID_SETTINGS', 'Use a supported scope/case policy and at most 128 nonblank literal preferences, each at most 2,048 UTF-16 units.', node, draft);
    if (!validDraft(draft)) return failure('INVALID_DRAFT', 'Expected a draft with frozen original source text.', node, draft);
    if (!validFindings(draft.findings)) return failure('INVALID_DRAFT', 'Draft findings must be a dense array of plain inspection records.', node, draft);
    if ((draft.findings?.length ?? 0) > 4096) return failure('SCAN_LIMIT', 'Scan accepts at most 4,096 total findings. Narrow the source or rules; no findings were truncated.', node, draft);
    if (draft?.text?.length > MAX_TEXT) return failure('INPUT_LIMIT', 'Draft exceeds the 100,000 UTF-16-unit scan/repair limit. Narrow the source before running; no text was truncated.', node, draft);
    const revision = Object.hasOwn(draft, 'lineage') || Object.hasOwn(draft, 'revisionId') || draft.text !== draft.source.originalText ? snapshotDraft(draft) : { ok: true, data: { revised: false } };
    if (!revision.ok) return failure(revision.error.code, revision.error.message, node, draft);
    if (revision.data.revised) draft = revision.data.draft;
    const hasSpans = Object.hasOwn(draft, 'spans');
    if (draft.spans?.length > MAX_SPANS) return failure('SPAN_LIMIT', 'Scan accepts at most 256 original editable spans.', node, draft);
    if (hasSpans && (!Array.isArray(draft.spans) || Array.from(draft.spans).some(span => !span))) return failure('INVALID_SPANS', 'Existing permissions require a dense original span array.', node, draft);
    if (!hasSpans && draft.scope !== undefined) return failure('INVALID_SPANS', 'Scoped Drafts require existing original permissions.', node, draft);
    if (!hasSpans && (node.scope ?? 'authorized') === 'authorized') return failure('SCOPE_REQUIRED', 'An unannotated Draft requires explicit whole, narration or dialogue scope.', node, draft);
    if (hasSpans && invalidSpans(draft)) return failure('INVALID_SPANS', 'Existing editable spans must remain valid original permissions.', node, draft);
    const spans = [], findings = [];
    const text = draft.text;
    const storedLiterals = value => value === undefined || Array.isArray(value) && value.length <= 128 && literalList(Array.from(value));
    if (!storedLiterals(draft.protectedLiterals) || !storedLiterals(draft.exemptions)) return failure('INVALID_DRAFT', 'Draft protections and exemptions must be bounded nonblank literal lists.', node, draft);
    const protectedLiterals = [...new Set([...(draft.protectedLiterals ?? []), ...(node.protectedLiterals ?? [])])];
    const exemptions = [...new Set([...(draft.exemptions ?? []), ...(node.exemptions ?? [])])];
    // The Draft flag governs stored exemption authority; a later rule scan cannot reinterpret it.
    const exemptionCaseSensitive = draft.exemptions?.length ? draft.caseSensitive ?? false : node.caseSensitive ?? false;
    if (protectedLiterals.length > 128 || exemptions.length > 128) return failure('INVALID_SETTINGS', 'Combined protections and exemptions accept at most 128 unique literals.', node, draft);
    const selectedScope = (node.scope ?? 'authorized') === 'authorized' ? 'whole' : node.scope;
    const body = revision.data.revised ? readDraftBody(draft) : { ok: true, data: { text } };
    if (!body.ok) return failure(body.error.code, body.error.message, node, draft);
    const scope = scopeRanges(body.data.text, selectedScope);
    if (scope.unmatched.length && selectedScope !== 'whole') {
        if ((draft.findings?.length ?? 0) >= 4096) return failure('SCAN_LIMIT', 'The unmatched-quote finding exceeds the 4,096 total finding limit.', node, draft);
        const result = success({ ...draft, spans: [], findings: [...(draft.findings ?? []), { code: 'UNMATCHED_QUOTES', offsets: scope.unmatched }], scope: draft.scope ?? selectedScope, caseSensitive: exemptionCaseSensitive, rules: structuredClone(node.rules ?? []), exemptions, protectedLiterals });
        result.reports.push({ code: 'UNMATCHED_QUOTES', message: 'Unmatched double quotes prevent deterministic narration/dialogue scanning.', offsets: scope.unmatched });
        const retained = retainDraftAuthority(draft, result.artifact);
        if (!retained.ok) return failure(retained.error.code, retained.error.message, node, draft);
        result.artifact = retained.data.draft;
        return result;
    }

    const protectedRanges = literalRanges(text, protectedLiterals);
    // New exemptions narrow by their requested policy and by the retained combined Draft policy.
    const exempted = [...literalRanges(text, exemptions, exemptionCaseSensitive), ...literalRanges(text, node.exemptions ?? [], node.caseSensitive ?? false)];
    for (const rule of node.rules ?? []) {
        const phrase = typeof rule === 'string' ? rule : rule.phrase;
        for (const [start, end] of literalRanges(text, [phrase], node.caseSensitive ?? false)) {
            if (!scope.ranges.some(([from, to]) => start >= from && end <= to)) continue;
            if (hasSpans && !draft.spans.some(span => start >= span.start && end <= span.end)) continue;
            if (exempted.some(([from, to]) => start < to && end > from)) continue;
            const protectedMatch = protectedRanges.some(([from, to]) => start < to && end > from);
            if ((draft.findings?.length ?? 0) + findings.length >= 4096) return failure('SCAN_LIMIT', 'Scan exceeds 4,096 total findings. Narrow the rules or scope; no permissions were truncated.', node, draft);
            findings.push({ rule: phrase, start, end, text: text.slice(start, end), protected: protectedMatch });
            if (protectedMatch) continue;
            spans.push({ index: spans.length, start, end, text: text.slice(start, end) });
        }
    }
    const normalized = [];
    for (const span of spans.sort((a, b) => a.start - b.start || a.end - b.end)) {
        const previous = normalized.at(-1);
        if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end);
        else normalized.push({ start: span.start, end: span.end });
    }
    if (normalized.length > MAX_SPANS) return failure('SPAN_LIMIT', 'Scan exceeds 256 normalized editable spans. Narrow the rules or scope; no permissions were truncated.', node, draft);
    const result = success({ ...draft, spans: normalized.map((span, index) => ({ index, ...span, text: text.slice(span.start, span.end) })), findings: [...(draft.findings ?? []), ...findings], scope: draft.scope ?? selectedScope, caseSensitive: exemptionCaseSensitive, rules: structuredClone(node.rules ?? []), exemptions, protectedLiterals });
    if (scope.unmatched.length) result.reports.push({ code: 'UNMATCHED_QUOTES', message: 'Unmatched double quotes were found; whole-text scope remains explicit.', offsets: scope.unmatched });
    const retained = retainDraftAuthority(draft, result.artifact);
    if (!retained.ok) return failure(retained.error.code, retained.error.message, node, draft);
    result.artifact = retained.data.draft;
    return result;
}
function invalidSpans(draft) {
    if (draft.scope !== undefined && !['whole', 'narration', 'dialogue'].includes(draft.scope)) return true;
    if (draft.caseSensitive !== undefined && typeof draft.caseSensitive !== 'boolean') return true;
    const exemptions = draft.exemptions === undefined ? [] : draft.exemptions;
    if (!Array.isArray(exemptions) || exemptions.length > 128 || !literalList(Array.from(exemptions))) return true;
    const exempted = literalRanges(draft.text, exemptions, draft.caseSensitive ?? false);
    const body = Object.hasOwn(draft, 'revisionId') ? readDraftBody(draft) : { ok: true, data: { text: draft.text } };
    if (!body.ok) return true;
    const allowed = scopeRanges(body.data.text, draft.scope ?? 'whole');
    const boundary = offset => !(offset > 0 && offset < draft.text.length && /[\uD800-\uDBFF]/u.test(draft.text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(draft.text[offset]));
    return !Array.isArray(draft?.spans) || draft.spans.some((span, index) =>
        !span || span.index !== index || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) ||
        span.start < 0 || span.end <= span.start || span.end > draft.text.length || !boundary(span.start) || !boundary(span.end) ||
        !allowed.ranges.some(([from, to]) => span.start >= from && span.end <= to) || (draft.scope && draft.scope !== 'whole' && allowed.unmatched.length > 0) ||
        exempted.some(([from, to]) => span.start < to && span.end > from) ||
        span.text !== draft.text.slice(span.start, span.end) || (index > 0 && span.start <= draft.spans[index - 1].end));
}
function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) freeze(item); }
    return value;
}
/** Validate only newly consumed context; provenance keys such as source.token are valid JSON metadata. */
function validContext(draft) {
    let entries = 0, characters = 0;
    const active = new Set();
    const visit = (value, depth) => {
        if (++entries > 20000 || depth > 40) return false;
        if (typeof value === 'string') { characters += value.length; return characters <= 500000; }
        if (value === null || typeof value === 'boolean') return true;
        if (typeof value === 'number') return Number.isFinite(value);
        if (typeof value !== 'object' || active.has(value)) return false;
        const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
        if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
        const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
        if (array && keys.length !== descriptors.length.value + 1) return false;
        active.add(value);
        for (const key of keys) {
            if (typeof key !== 'string') return false;
            if (array && key !== 'length' && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= descriptors.length.value)) return false;
            characters += key.length;
            const property = descriptors[key];
            if ((!array || key !== 'length') && !property.enumerable) return false;
            if (characters > 500000 || !Object.hasOwn(property, 'value') || !visit(property.value, depth + 1)) return false;
        }
        active.delete(value);
        return true;
    };
    try {
        const descriptor = Object.getOwnPropertyDescriptor(draft, 'context');
        if (!descriptor) return !('context' in draft);
        if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return false;
        const context = descriptor.value;
        if (context === undefined) return true;
        if (!visit(context, 0) || !context || !Object.hasOwn(context, 'kind') || context.kind !== 'context' || !Object.hasOwn(context, 'messages') || !Array.isArray(context.messages)) return false;
        for (const message of context.messages) {
            if (!message || Array.isArray(message) || typeof message !== 'object' || !['id', 'role', 'text'].every(key => Object.hasOwn(message, key) && typeof message[key] === 'string')) return false;
            if (!message.id.trim() || !['system', 'user', 'assistant'].includes(message.role)) return false;
        }
        return true;
    } catch { return false; }
}
/** Request one bounded JSON repair using the resolved ports.binding and request result envelope. */
export async function repairDraft(draft, node = {}, ports = {}) {
    if (!validSettings(node)) return failure('INVALID_SETTINGS', 'Repair settings require repair/scan mode, bounded text preferences and a positive completion limit.', node, draft);
    if (!validDraft(draft)) return failure('INVALID_DRAFT', 'Expected a draft with frozen original source text.', node, draft);
    if (draft?.text?.length > MAX_TEXT) return failure('INPUT_LIMIT', 'Draft exceeds the 100,000 UTF-16-unit repair limit. Narrow the source before running; no text was transmitted.', node, draft);
    if (draft?.spans?.length > MAX_SPANS) return failure('SPAN_LIMIT', 'Repair accepts at most 256 normalized spans. Narrow the rules or scope before running; no text was transmitted.', node, draft);
    if (ports.signal?.aborted) return failure('ABORTED', 'Repair was stopped.', node, draft);
    const revision = Object.hasOwn(draft, 'lineage') || Object.hasOwn(draft, 'revisionId') || draft.text !== draft.source.originalText ? snapshotDraft(draft) : { ok: true, data: { revised: false } };
    if (!revision.ok) return failure(revision.error.code, revision.error.message, node, draft);
    if (revision.data.revised) draft = revision.data.draft;
    if (invalidSpans(draft)) return failure('INVALID_SPANS', 'Editable spans must be ordered, normalized, nonoverlapping original ranges.', node, draft);
    if (!validContext(draft)) return failure('INVALID_CONTEXT', 'Nearby context must be bounded plain JSON with dense messages containing id, role and text; no request was sent.', node, draft);
    node = { id: node.id, mode: node.mode ?? 'repair', modelRole: node.modelRole ?? 'Prose', maxTokens: node.maxTokens ?? 2048, strength: node.strength ?? 'light', instructions: node.instructions ?? '', protectedLiterals: [...(node.protectedLiterals ?? [])] };
    const retained = retainDraftAuthority(draft, structuredClone(draft));
    if (!retained.ok) return failure(retained.error.code, retained.error.message, node, draft);
    const frozen = freeze(retained.data.draft);
    if (node.mode === 'scan' || frozen.spans?.length === 0) return success({ kind: 'patches', draft: frozen, patches: [], protectedLiterals: [...(frozen.protectedLiterals ?? []), ...(node.protectedLiterals ?? [])] });
    const messages = [
        { role: 'system', content: 'Repair selected prose spans only. Return exactly one raw JSON object using exactly this schema: {"patches":[{"index":0,"replacement":"..."}]}. Do not include Markdown, code fences, backticks, commentary, or surrounding text. Use only supplied indices; preserve protected wording. Unselected original text cannot change.' },
        { role: 'user', content: JSON.stringify({ original: frozen.text, spans: frozen.spans, ...(frozen.context === undefined ? {} : { context: frozen.context.messages.map(({ id, role, text }) => ({ id, role, text })) }), rules: frozen.rules ?? [], exemptions: frozen.exemptions ?? [], protectedLiterals: [...(frozen.protectedLiterals ?? []), ...(node.protectedLiterals ?? [])], strength: node.strength ?? 'light', instructions: node.instructions ?? '' }) },
    ];
    const prompt = messages.map(message => message.content).join('\n');
    if (prompt.length > 500000) return failure('INPUT_LIMIT', 'Repair prompt exceeds 500,000 UTF-16 units. Narrow the preferences; no request was sent.', node, frozen);
    let counted;
    try { counted = await ports.countTokens(prompt); }
    catch { return failure(ports.signal?.aborted ? 'ABORTED' : 'TOKEN_COUNT_FAILED', 'Repair could not measure the input; no request was sent.', node, frozen); }
    if (ports.signal?.aborted) return failure('ABORTED', 'Repair was stopped before transmission.', node, frozen);
    const request = { binding: ports.binding, messages, maxTokens: node.maxTokens ?? 2048, signal: ports.signal };
    let response;
    try { response = await ports.request(request); }
    catch { response = { ok: false, error: { code: ports.signal?.aborted ? 'ABORTED' : 'REQUEST_FAILED', message: 'Repair request failed; keep the original and inspect the connection.' } }; }
    const call = { nodeId: node.id, modelRole: node.modelRole ?? 'Prose', binding: { profileId: ports.binding?.profileId, model: ports.binding?.model }, messages, maxTokens: request.maxTokens, tokenCount: counted, result: response.data };
    if (!response.ok) { const rejected = failure(response.error.code, response.error.message, node, frozen); call.error = response.error; rejected.calls.push(call); return rejected; }
    if (ports.signal?.aborted) { const stopped = failure('ABORTED', 'Repair was stopped; ignore its late completion.', node, frozen); stopped.calls.push(call); return stopped; }
    const result = success({ kind: 'patches', draft: frozen, patches: response.data.text, usage: response.data.usage, finish: response.data.finish, protectedLiterals: [...(frozen.protectedLiterals ?? []), ...(node.protectedLiterals ?? [])] });
    result.calls.push(call);
    return result;
}
/** Validate patches against frozen original spans and build a manually reviewed candidate. */
export function validatePatches(artifact, node = {}) {
    if (artifact?.kind !== 'patches' || !validDraft(artifact.draft)) return failure('INVALID_PATCHES', 'Expected patches attached to a frozen original draft.', node, artifact?.draft);
    const { draft } = artifact;
    const preserved = { ...draft, usage: artifact.usage, finish: artifact.finish };
    const revision = Object.hasOwn(draft, 'lineage') || Object.hasOwn(draft, 'revisionId') || draft.text !== draft.source.originalText ? snapshotDraft(draft) : { ok: true, data: { revised: false } };
    if (!revision.ok) return failure(revision.error.code, revision.error.message, node, preserved);
    if (invalidSpans(draft)) return failure('INVALID_SPANS', 'Editable spans must be ordered, normalized, nonoverlapping original ranges.', node, preserved);
    if (['length', 'max_tokens', 'max_output_tokens'].includes(artifact.finish)) return failure('TRUNCATED_OUTPUT', 'Repair output reached its completion limit; keep the original.', node, preserved);
    if (typeof artifact.patches === 'string' && artifact.patches.length > MAX_TEXT) return failure('OUTPUT_LIMIT', 'Repair JSON exceeds 100,000 UTF-16 units; keep the original.', node, preserved);
    let patches;
    try {
        if (typeof artifact.patches === 'string') {
            const parsed = JSON.parse(artifact.patches);
            if (!parsed || Array.isArray(parsed) || Object.keys(parsed).length !== 1 || !Object.hasOwn(parsed, 'patches')) return failure('INVALID_PATCHES', 'Expected only a JSON patches array envelope.', node, preserved);
            patches = parsed.patches;
        } else patches = artifact.patches;
    }
    catch { return failure('INVALID_PATCHES', 'Repair must return valid JSON patches.', node, preserved); }
    if (!Array.isArray(patches) || patches.some(patch => !patch || Object.keys(patch).length !== 2 || !Object.hasOwn(patch, 'replacement') || !Number.isSafeInteger(patch?.index) || !draft.spans.some(span => span.index === patch.index))) return failure('INVALID_PATCHES', 'Patches must use the supplied span indices.', node, preserved);
    if (new Set(patches.map(patch => patch.index)).size !== patches.length) return failure('INVALID_PATCHES', 'A span index may appear only once.', node, preserved);
    if (patches.some(patch => typeof patch.replacement !== 'string' || !patch.replacement.trim())) return failure('INVALID_PATCHES', 'Each replacement must be nonblank text.', node, preserved);
    const changes = patches.map(patch => ({ ...draft.spans.find(span => span.index === patch.index), replacement: patch.replacement })).filter(change => change.text !== change.replacement);
    let text = draft.text;
    for (const change of [...changes].sort((a, b) => b.start - a.start)) text = text.slice(0, change.start) + change.replacement + text.slice(change.end);
    const pins = [...(draft.protectedLiterals ?? []), ...(artifact.protectedLiterals ?? []), ...(node.protectedLiterals ?? [])];
    if (pins.some(pin => literalRanges(text, [pin]).length < literalRanges(draft.text, [pin]).length)) return failure('PROTECTED_LITERAL_REMOVED', 'Repair removed protected literal wording.', node, preserved);
    const result = success({ kind: 'candidate', original: draft.source.originalText, text, source: draft.source, findings: draft.findings ?? [], changes, reviewRequired: true, ...(revision.data.revised ? { baseline: draft.text, parentRevisionId: draft.revisionId, rootRevisionId: draft.rootRevisionId, lineage: draft.lineage, offsetSpace: 'parent-revision' } : {}), usage: artifact.usage, finish: artifact.finish, ...(draft.derived !== undefined ? { derived: draft.derived } : {}) });
    if (text === draft.text) result.reports.push({ code: 'NO_CHANGES', message: 'No prose changes were proposed.' });
    return result;
}
