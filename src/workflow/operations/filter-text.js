import { getPatternReportBinding } from './pattern-engine.js?v=0.27.3';
import { literalCoverage } from './pattern-matching.js?v=0.27.3';
import { prepareReferenceDraft } from './reference-draft.js?v=0.27.3';
import { readDraftBody, createDraftDeletionRevision } from '../draft-revisions.js?v=0.27.3';
import { cloneJsonValue } from './json-data.js?v=0.27.3';
import { own, plain, freeze } from '../record-data.js?v=0.27.3';
import { artifactVisibility } from '../artifact-privacy.js?v=0.27.3';

const failure = (code, message) => ({ ok: false, error: { code, message } });
const invalidSettings = () => failure('INVALID_FILTER_SETTINGS', 'Use canonical Filter action, unit, scope and bounded nonblank protections.');
export const FILTER_TEXT_DEFAULTS = freeze({ action: 'remove', unit: 'paragraph', scope: 'whole', protectedLiterals: [] });
export const FILTER_TEXT_OPERATION = {
    id: 'filter-text', title: 'Filter Text', family: 'Derive', phase: 'post', minimumSchema: 3,
    input: 'draft', output: 'draft', controls: Object.keys(FILTER_TEXT_DEFAULTS), defaults: FILTER_TEXT_DEFAULTS,
    requestBound: 0, modelRole: null, terminal: false, dynamicPorts: true,
    controlDescriptors: {
        action: { type: 'enum', values: ['remove', 'keep'], default: 'remove' },
        unit: { type: 'enum', values: ['line', 'paragraph'], default: 'paragraph' },
        scope: { type: 'enum', values: ['authorized', 'whole', 'narration', 'dialogue'], default: 'whole' },
        protectedLiterals: { type: 'array', items: 'string', max: 128, default: [] },
    },
};
export function validateFilterTextSettings(input = {}) {
    try {
        if (!plain(input) || Reflect.ownKeys(input).some(key => !Object.hasOwn(FILTER_TEXT_DEFAULTS, key))) return invalidSettings();
        const checked = cloneJsonValue(input); if (!checked.ok) return invalidSettings();
        const settings = { ...FILTER_TEXT_DEFAULTS, ...checked.data.value };
        if (!['remove', 'keep'].includes(settings.action) || !['line', 'paragraph'].includes(settings.unit) ||
            !['authorized', 'whole', 'narration', 'dialogue'].includes(settings.scope) || !Array.isArray(settings.protectedLiterals) ||
            settings.protectedLiterals.length > 128 || settings.protectedLiterals.some(pin => typeof pin !== 'string' || !pin.trim() || pin.length > 2048)) return invalidSettings();
        return { ok: true, data: freeze(settings) };
    } catch { return invalidSettings(); }
}
export function filterTextSettingsForNode(node) {
    try {
        if (!plain(node)) return invalidSettings();
        const settings = {};
        for (const key of FILTER_TEXT_OPERATION.controls) {
            const property = Object.getOwnPropertyDescriptor(node, key);
            if (property && (!property.enumerable || !Object.hasOwn(property, 'value'))) return invalidSettings();
            if (property) settings[key] = property.value;
        }
        return validateFilterTextSettings(settings);
    } catch { return invalidSettings(); }
}
export function describeFilterText(node) {
    if (own(node, 'operation') !== 'filter-text' || own(node, 'operationVersion') !== undefined && own(node, 'operationVersion') !== 1) return invalidSettings();
    if (own(node, 'phase') !== undefined && own(node, 'phase') !== 'post') return failure('INVALID_PHASE', 'Filter Text requires post phase.');
    const checked = filterTextSettingsForNode(node); if (!checked.ok) return checked;
    const pin = (id, label, kind, direction, required = false) => ({ id, label, kind, direction, required, cardinality: 'one' });
    return { ok: true, data: { descriptor: FILTER_TEXT_OPERATION, ports: [
        pin('in', 'Draft', 'draft', 'input', true), pin('matches', 'Matches', 'data', 'input', true),
        pin('out', 'Draft', 'draft', 'output'), pin('report', 'Report', 'data', 'output'),
    ] } };
}

/** Ranges own actual original delimiters; visual wrapping never creates units. */
export function selectFilterUnits(body, unit) {
    const lines = [];
    for (let start = 0; start < body.length;) {
        let contentEnd = start;
        while (contentEnd < body.length && body[contentEnd] !== '\r' && body[contentEnd] !== '\n') contentEnd++;
        const end = contentEnd + (body[contentEnd] === '\r' && body[contentEnd + 1] === '\n' ? 2 : contentEnd < body.length ? 1 : 0);
        lines.push({ start, end, blank: /^[ \t]*$/u.test(body.slice(start, contentEnd)) }); start = end;
    }
    if (unit === 'line') return lines.map(({ start, end }) => ({ start, end }));
    const paragraphs = [];
    let previousBlank = true;
    for (const line of lines) {
        if (!line.blank) {
            if (previousBlank) {
                if (paragraphs.length) paragraphs.at(-1).end = line.start;
                paragraphs.push({ start: paragraphs.length ? line.start : 0, end: line.end });
            } else paragraphs.at(-1).end = line.end;
        }
        previousBlank = line.blank;
    }
    if (paragraphs.length) paragraphs.at(-1).end = body.length;
    return paragraphs;
}

/** Consult live scan evidence before any JSON admission can replace its identity. */
export function filterPatternDraft(draft, matches, inputSettings, local) {
    let value;
    try {
        if (!plain(matches) || own(matches, 'kind') !== 'data') return failure('INVALID_MATCH_REPORT', 'Use a fresh live Pattern Matches artifact.');
        value = own(matches, 'value');
    } catch { return failure('INVALID_MATCH_REPORT', 'Use a fresh live Pattern Matches artifact.'); }
    const bound = getPatternReportBinding(value, draft); if (!bound.ok) return bound;
    if (value.status !== 'complete') return failure('INVALID_MATCH_REPORT', 'Filter requires a completed live Pattern report.');
    const controls = validateFilterTextSettings(inputSettings); if (!controls.ok) return controls;
    const settings = controls.data, binding = bound.data;
    if (!plain(local) || typeof own(local, 'nodeId') !== 'string' || !own(local, 'nodeId').trim() || own(local, 'nodeId').length > 256) return invalidSettings();
    const body = readDraftBody(draft); if (!body.ok) return body;
    const text = body.data.text, allUnits = selectFilterUnits(text, settings.unit);
    const selected = allUnits.filter(unit => {
        const hit = value.occurrences.some(hit => hit.start < unit.end && hit.end > unit.start);
        return settings.action === 'remove' ? hit : !hit;
    });
    if (selected.length > 256) return failure('FILTER_UNIT_LIMIT', 'Filter selects more than 256 affected units.');
    const protectedLiterals = [...new Set([...(binding.snapshot.protectedLiterals ?? []), ...binding.settings.protectedLiterals, ...settings.protectedLiterals])];
    if (protectedLiterals.length > 128) return invalidSettings();
    const storedExempt = literalCoverage(text, binding.snapshot.exemptions ?? [], binding.snapshot.caseSensitive ?? false);
    const scanExempt = literalCoverage(text, binding.settings.exemptions, binding.settings.caseSensitive);
    let preparationDraft = draft;
    // Unannotated roots have no stored windows. Narrow their implicit whole-body
    // permissions before reference validation; inherited spans are never rewritten.
    if (selected.length && !Object.hasOwn(binding.snapshot, 'spans') && !Object.hasOwn(binding.snapshot, 'scope') && binding.snapshot.exemptions?.length && settings.scope !== 'authorized') {
        const spans = [];
        for (let cursor = 0; cursor < text.length;) {
            if (storedExempt(cursor, cursor + 1)) { cursor++; continue; }
            const start = cursor;
            while (cursor < text.length && !storedExempt(cursor, cursor + 1)) cursor++;
            spans.push({ index: spans.length, start, end: cursor, text: text.slice(start, cursor) });
        }
        preparationDraft = { ...binding.snapshot, spans };
    }
    const prepared = selected.length ? prepareReferenceDraft(preparationDraft, { scope: settings.scope, protectedLiterals }) : { ok: true, data: { windows: [] } };
    if (!prepared.ok) return prepared;
    const units = selected.map(unit => ({ ...unit, text: text.slice(unit.start, unit.end),
        blocked: !prepared.data.windows.some(window => unit.start >= window.start && unit.end <= window.end) || storedExempt(unit.start, unit.end) || scanExempt(unit.start, unit.end),
    }));
    let cursor = 0, retained = '';
    for (const unit of selected) { retained += text.slice(cursor, unit.start); cursor = unit.end; }
    retained += text.slice(cursor);
    const blocked = units.some(unit => unit.blocked);
    const retainedUnitCount = allUnits.length - selected.length;
    const empty = !blocked && (settings.action === 'keep' && (retainedUnitCount === 0 || !retained.trim()) || selected.length > 0 && !retained.trim());
    const reason = blocked ? { code: 'FILTER_PERMISSION_BLOCKED', message: 'A proposed unit crosses immutable, protected or exempt text.' }
        : empty ? { code: 'EMPTY_FILTER_RESULT', message: 'Filter must retain a nonblank story body.' } : null;
    const report = { recordType: 'text-filter', schemaVersion: 1, status: blocked ? 'blocked' : empty ? 'empty' : 'complete',
        action: settings.action, unit: settings.unit, units, originalBodyLength: text.length, resultBodyLength: retained.length,
        retainedUnitCount, diagnostics: reason ? [reason] : [],
    };
    const admitted = cloneJsonValue(report); if (!admitted.ok) return failure('FILTER_REPORT_LIMIT', 'The complete Filter report exceeds Data limits.');
    const visibility = artifactVisibility(draft), metadata = visibility.kind === 'public' ? {} : { visibility };
    const outputs = { report: { kind: 'data', value: freeze(admitted.data.value), ...metadata } };
    if (reason) return { ok: true, outputs, outputStates: { out: { status: 'unresolved', reason } } };
    if (!selected.length) return { ok: true, outputs: { ...outputs, out: draft } };
    const revision = createDraftDeletionRevision(draft, selected, { nodeId: own(local, 'nodeId'), scope: settings.scope, protectedLiterals });
    if (!revision.ok) return revision;
    return { ok: true, outputs: { ...outputs, out: revision.data.draft }, reports: revision.data.report };
}
