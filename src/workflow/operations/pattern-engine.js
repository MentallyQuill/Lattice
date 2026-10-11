import { boundary, literalHits, literalCoverage } from './pattern-matching.js?v=0.27.0';
import { snapshotDraft, readDraftBody } from '../draft-revisions.js?v=0.27.0';
import { cloneJsonValue } from './json-data.js?v=0.27.0';
import { validatePatternSettings } from './pattern-nodes.js?v=0.27.0';
import { prepareReferenceDraft } from './reference-draft.js?v=0.27.0';
import { freeze } from '../record-data.js?v=0.27.0';
import { artifactVisibility } from '../artifact-privacy.js?v=0.27.0';
const failure = (code, message) => ({ ok: false, error: { code, message } });
const bindings = new WeakMap();
const word = point => point !== undefined && /[\p{L}\p{N}\p{M}_]/u.test(point);
function wholeWord(text, start, end) {
    const previous = start > 0 ? String.fromCodePoint(text.codePointAt(start - (start > 1 && /[\uDC00-\uDFFF]/u.test(text[start - 1]) ? 2 : 1))) : undefined;
    return !word(previous) && !word(end < text.length ? String.fromCodePoint(text.codePointAt(end)) : undefined);
}
function scanRegions(text, scope, spans) {
    if (scope === 'whole') return [[0, text.length]];
    if (scope === 'authorized') return spans.map(span => [span.start, span.end]);
    const dialogue = [], narration = [];
    let open = null, cursor = 0;
    for (let at = 0; at < text.length; at++) {
        const char = text[at]; if (!['"', '“', '”'].includes(char)) continue;
        if (open && char === open.close) {
            if (cursor < open.start) narration.push([cursor, open.start]);
            if (open.start + 1 < at) dialogue.push([open.start + 1, at]);
            cursor = at + 1; open = null;
        } else if (!open && char !== '”') open = { start: at, close: char === '“' ? '”' : '"' };
        else throw new Error('UNMATCHED_QUOTES');
    }
    if (open) throw new Error('UNMATCHED_QUOTES');
    if (cursor < text.length) narration.push([cursor, text.length]);
    return scope === 'dialogue' ? dialogue : narration;
}
function defaultWorkerFactory() {
    if (import.meta.env?.DEV || import.meta.env?.PROD) return new Worker(new URL('./pattern-worker.js', import.meta.url), { type: 'module' });
    const url = new URL('./pattern-worker.js', import.meta.url); url.search = new URL(import.meta.url).search;
    return new Worker(url, { type: 'module' });
}
function executeRegex(request, local) {
    if (local.signal?.aborted) return Promise.resolve(failure('ABORTED', 'Pattern scanning was stopped.'));
    return new Promise(resolve => {
        const started = performance.now(); let worker, timer, settled = false;
        const finish = result => {
            if (settled) return; settled = true; clearTimeout(timer);
            local.signal?.removeEventListener('abort', abort);
            try { worker?.removeEventListener('message', message); } catch {}
            try { worker?.removeEventListener('error', error); } catch {}
            try { worker?.terminate()?.catch?.(() => {}); } catch {}
            resolve(result);
        };
        const abort = () => finish(failure('ABORTED', 'Pattern scanning was stopped.'));
        const error = () => finish(failure('WORKER_UNAVAILABLE', 'A dedicated Pattern Worker is unavailable.'));
        const message = event => {
            const checked = cloneJsonValue(event.data);
            if (!checked.ok) { finish(failure('PATTERN_REPORT_LIMIT', 'The Pattern Worker response exceeds Data bounds.')); return; }
            const result = checked.data.value;
            if (result?.ok === false && typeof result.error?.code === 'string' && typeof result.error?.message === 'string') { finish(result); return; }
            const hits = result?.data?.occurrences;
            if (result?.ok !== true || !Array.isArray(hits) || hits.length > 4096 || hits.some(hit => !hit || !Number.isSafeInteger(hit.ruleIndex) || hit.ruleIndex < 0 || hit.ruleIndex >= request.settings.rules.length || !Number.isSafeInteger(hit.start) || !Number.isSafeInteger(hit.end) || hit.start < 0 || hit.end <= hit.start || hit.end > request.text.length || !boundary(request.text, hit.start) || !boundary(request.text, hit.end) || hit.text !== request.text.slice(hit.start, hit.end))) { error(); return; }
            finish(result);
        };
        try {
            worker = (local.workerFactory ?? defaultWorkerFactory)();
            if (!worker || !['addEventListener', 'removeEventListener', 'postMessage', 'terminate'].every(key => typeof worker[key] === 'function')) { error(); return; }
            local.signal?.addEventListener('abort', abort, { once: true });
            worker.addEventListener('message', message); worker.addEventListener('error', error);
            if (local.signal?.aborted) { abort(); return; }
            const remaining = request.settings.timeoutMs - (performance.now() - started);
            if (remaining <= 0) { finish(failure('PATTERN_TIMEOUT', 'Pattern exceeded its Worker deadline.')); return; }
            timer = setTimeout(() => finish(failure('PATTERN_TIMEOUT', 'Pattern exceeded its Worker deadline.')), remaining);
            worker.postMessage(request);
        } catch { error(); }
    });
}
export function getPatternReportBinding(value, draft) {
    const binding = value && typeof value === 'object' && bindings.get(value);
    if (!binding) return failure('INVALID_MATCH_REPORT', 'Use a fresh live Pattern report.');
    if (binding.draft !== draft) return failure('STALE_MATCH_REPORT', 'The report belongs to another Draft.');
    const checked = snapshotDraft(draft);
    if (!checked.ok || JSON.stringify(checked.data.draft) !== JSON.stringify(binding.snapshot)) return failure('STALE_MATCH_REPORT', 'Draft source, text or permissions changed after scanning.');
    return { ok: true, data: binding };
}
export async function scanPatternDraft(draft, settings, local = {}) {
    if (local.signal?.aborted) return failure('ABORTED', 'Pattern scanning was stopped.');
    const controls = validatePatternSettings(settings); if (!controls.ok) return controls; settings = controls.data;
    const checked = snapshotDraft(draft); if (!checked.ok) return checked;
    const body = readDraftBody(draft); if (!body.ok) return body;
    const text = body.data.text, occurrences = [];
    const parent = checked.data.draft;
    if (!Array.isArray(parent.exemptions ?? []) || (parent.exemptions ?? []).length > 128 || (parent.exemptions ?? []).some(pin => typeof pin !== 'string' || !pin.trim() || pin.length > 2048) || parent.caseSensitive !== undefined && typeof parent.caseSensitive !== 'boolean') return failure('INVALID_SPANS', 'Draft exemptions require bounded literals and a Boolean case policy.');
    const upstreamExempt = literalCoverage(text, parent.exemptions ?? [], parent.caseSensitive ?? false);
    const configuredExempt = literalCoverage(text, settings.exemptions, settings.caseSensitive);
    let permissionInput = draft;
    if (!Object.hasOwn(parent, 'spans') && !Object.hasOwn(parent, 'scope') && settings.scope !== 'authorized' && (parent.exemptions ?? []).length) {
        const spans = []; let cursor = 0;
        while (cursor < text.length) {
            if (upstreamExempt(cursor, cursor + 1)) { cursor++; continue; }
            const start = cursor; while (cursor < text.length && !upstreamExempt(cursor, cursor + 1)) cursor++;
            spans.push({ index: spans.length, start, end: cursor, text: text.slice(start, cursor) });
            if (spans.length > 256) return failure('SPAN_LIMIT', 'Draft exemptions exceed 256 permission spans.');
        }
        permissionInput = { ...parent, spans };
    }
    const prepared = prepareReferenceDraft(permissionInput, { scope: settings.scope === 'authorized' ? 'authorized' : 'whole', protectedLiterals: settings.protectedLiterals });
    if (!prepared.ok) return prepared;
    const diagnostics = []; let unresolved = false, regions;
    try { scanRegions(text, 'dialogue', []); }
    catch { diagnostics.push({ code: 'UNMATCHED_QUOTES', message: 'Ambiguous double quotes prevent deterministic narration/dialogue scope.' }); unresolved = ['narration', 'dialogue'].includes(settings.scope); }
    regions = unresolved ? [] : scanRegions(text, settings.scope, prepared.data.draft.spans);
    const protectedHit = literalCoverage(text, prepared.data.protectedLiterals, true);
    let regexOccurrences;
    if (settings.mode === 'regex') {
        const result = await executeRegex({ text, settings, regions, upstreamExemptions: parent.exemptions ?? [], upstreamCaseSensitive: parent.caseSensitive ?? false }, local);
        if (!result.ok) return result;
        regexOccurrences = result.data.occurrences;
    }
    for (const [ruleIndex, rule] of settings.rules.entries()) {
        for (const match of regexOccurrences ? regexOccurrences.filter(hit => hit.ruleIndex === ruleIndex) : literalHits(text, rule.pattern, settings.caseSensitive)) {
            if (settings.mode === 'whole-word' && !wholeWord(text, match.start, match.end)) continue;
            if (!regions.some(([start, end]) => match.start >= start && match.end <= end)) continue;
            if (upstreamExempt(match.start, match.end) || configuredExempt(match.start, match.end)) continue;
            if (occurrences.length >= 4096) return failure('PATTERN_OCCURRENCE_LIMIT', 'Pattern exceeds 4,096 occurrences.');
            occurrences.push({ ruleId: rule.id, ruleIndex, ...match, protected: protectedHit(match.start, match.end), editable: prepared.data.windows.some(window => match.start >= window.start && match.end <= window.end) });
        }
    }
    occurrences.sort((a, b) => a.start - b.start || a.end - b.end || a.ruleIndex - b.ruleIndex);
    const rules = settings.rules.map((rule, ruleIndex) => ({ ...rule, count: unresolved ? null : occurrences.filter(hit => hit.ruleIndex === ruleIndex).length }));
    const totalOccurrences = unresolved ? null : occurrences.length, matchedRuleCount = unresolved ? null : rules.filter(rule => rule.count > 0).length;
    const matched = unresolved ? null : rules.length > 0 && (settings.matchPolicy === 'all' ? matchedRuleCount === rules.length : matchedRuleCount > 0) && totalOccurrences >= settings.minOccurrences;
    const report = { recordType: 'pattern-matches', schemaVersion: 1, status: unresolved ? 'unresolved' : 'complete', matched, totalOccurrences, matchedRuleCount, rules, occurrences, source: { revisionId: checked.data.draft.revisionId ?? null, rootRevisionId: checked.data.draft.rootRevisionId ?? null, textLength: checked.data.draft.text.length, bodyLength: text.length }, settings: Object.fromEntries(['mode', 'scope', 'caseSensitive', 'matchPolicy', 'minOccurrences', 'regexFlags'].map(key => [key, settings[key]])), diagnostics };
    const admitted = cloneJsonValue(report); if (!admitted.ok) return failure('PATTERN_REPORT_LIMIT', 'The complete Pattern report exceeds Data limits.');
    freeze(admitted.data.value); freeze(regions);
    bindings.set(admitted.data.value, Object.freeze({ draft, snapshot: checked.data.draft, settings, regions }));
    const visibility = artifactVisibility(draft), metadata = visibility.kind === 'public' ? {} : { visibility };
    return { ok: true, outputs: { out: draft, ...(!unresolved ? { matched: { kind: 'data', value: matched, ...metadata } } : {}), matches: { kind: 'data', value: admitted.data.value, ...metadata } }, ...(unresolved ? { outputStates: { matched: { status: 'unresolved', reason: diagnostics[0] } } } : {}) };
}
