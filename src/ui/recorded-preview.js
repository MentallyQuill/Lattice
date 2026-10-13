import { own, dense, plain, freeze } from '../workflow/record-data.js?v=0.27.1';
import { recognizeRecordedText } from '../workflow/retained-text.js?v=0.27.1';

const TEXT_BUDGET = 65536;
const projections = new WeakMap();
function clip(text, limit) {
    let bytes = 0, end = 0;
    for (const character of text) {
        const point = character.codePointAt(0), size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
        if (bytes + size > limit) break;
        bytes += size; end += character.length;
    }
    return { text: text.slice(0, end), truncated: end < text.length, bytes };
}
/** Stream an indented own-data JSON prefix; never invokes toJSON or serializes unbounded strings. */
function diagnosticJSON(value, limit = TEXT_BUDGET) {
    const chunks = [], active = new Set();
    let remaining = limit, truncated = false, visited = 0;
    const emit = text => {
        if (truncated) return;
        const bounded = clip(text, remaining); chunks.push(bounded.text); remaining -= bounded.bytes; truncated = bounded.truncated;
    };
    const string = text => {
        emit('"');
        for (const character of text) { if (truncated) break; emit(JSON.stringify(character).slice(1, -1)); }
        emit('"');
    };
    function visit(item, depth) {
        if (truncated) return;
        if (++visited > 20000 || depth > 40 || active.has(item)) throw Error('Invalid diagnostic data');
        if (typeof item === 'string') return string(item);
        if (item === null || typeof item === 'boolean' || typeof item === 'number') return emit(JSON.stringify(item));
        const array = Array.isArray(item);
        if (!array && !plain(item)) return emit('null');
        if (array && !dense(item, 20000)) throw Error('Invalid diagnostic array');
        active.add(item);
        const entries = array ? Array.from({ length: own(item, 'length') }, (_, i) => [String(i), own(item, String(i))])
            : Object.entries(Object.getOwnPropertyDescriptors(item)).filter(([, descriptor]) => descriptor.enumerable && 'value' in descriptor && descriptor.value !== undefined).map(([key, descriptor]) => [key, descriptor.value]);
        emit(array ? '[' : '{');
        for (let i = 0; i < entries.length && !truncated; i++) {
            emit((i ? ',\n' : '\n') + '  '.repeat(depth + 1));
            if (!array) { string(entries[i][0]); emit(': '); }
            visit(entries[i][1], depth + 1);
        }
        if (entries.length) emit('\n' + '  '.repeat(depth));
        emit(array ? ']' : '}'); active.delete(item);
    }
    visit(value, 0);
    return { text: chunks.join(''), truncated };
}

const integer = (value, max = 100000) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const string = (value, max) => typeof value === 'string' && value.length <= max;
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, own(value, key)]));
function reportDiagnostics(value) {
    if (!dense(value, 256)) return null;
    const result = [];
    for (let i = 0; i < value.length; i++) {
        const item = own(value, String(i));
        if (!plain(item) || !string(own(item, 'code'), 128) || !string(own(item, 'message'), 262144)) return null;
        result.push(pick(item, ['code', 'message']));
    }
    return result;
}
/** Verify a retained public report without importing or consulting engine bindings. */
function reportContent(value) {
    if (!plain(value) || own(value, 'schemaVersion') !== 1) return null;
    const type = own(value, 'recordType'), diagnostics = reportDiagnostics(own(value, 'diagnostics'));
    if (!diagnostics) return null;
    if (type === 'pattern-matches') {
        const status = own(value, 'status'), unresolved = status === 'unresolved';
        if (!['complete', 'unresolved'].includes(status)) return null;
        const source = own(value, 'source'), settings = own(value, 'settings'), regexFlags = own(settings, 'regexFlags');
        if (!plain(source) || !['revisionId', 'rootRevisionId'].every(key => own(source, key) === null || string(own(source, key), 262144))
            || !integer(own(source, 'textLength')) || !integer(own(source, 'bodyLength'), own(source, 'textLength'))) return null;
        if (!plain(settings) || !['literal', 'whole-word', 'regex'].includes(own(settings, 'mode')) || !['authorized', 'whole', 'narration', 'dialogue'].includes(own(settings, 'scope'))
            || typeof own(settings, 'caseSensitive') !== 'boolean' || !['any', 'all'].includes(own(settings, 'matchPolicy'))
            || !integer(own(settings, 'minOccurrences'), 4096) || own(settings, 'minOccurrences') < 1 || !string(regexFlags, 2) || !/^(|m|s|ms|sm)$/.test(regexFlags)) return null;
        const suppliedRules = own(value, 'rules'), suppliedOccurrences = own(value, 'occurrences');
        if (!dense(suppliedRules, 128) || !dense(suppliedOccurrences, 4096)) return null;
        const rules = [], occurrences = [], ids = new Set();
        for (let i = 0; i < suppliedRules.length; i++) {
            const rule = own(suppliedRules, String(i)), id = own(rule, 'id'), pattern = own(rule, 'pattern'), label = own(rule, 'label'), count = own(rule, 'count');
            if (!plain(rule) || !string(id, 128) || !id.trim() || ids.has(id) || !string(pattern, 2048) || !pattern.length || label !== undefined && !string(label, 128)
                || (unresolved ? count !== null : !integer(count, 4096))) return null;
            ids.add(id); rules.push({ id, pattern, ...(label !== undefined ? { label } : {}), count });
        }
        const counts = rules.map(() => 0), identities = new Set();
        let prior = null;
        for (let i = 0; i < suppliedOccurrences.length; i++) {
            const row = own(suppliedOccurrences, String(i)), occurrence = pick(row, ['ruleId', 'ruleIndex', 'start', 'end', 'text', 'protected', 'editable']);
            if (!plain(row) || !integer(occurrence.ruleIndex, rules.length - 1) || occurrence.ruleId !== rules[occurrence.ruleIndex]?.id
                || !integer(occurrence.start, own(source, 'bodyLength')) || !integer(occurrence.end, own(source, 'bodyLength')) || occurrence.end <= occurrence.start
                || !string(occurrence.text, 100000) || occurrence.text.length !== occurrence.end - occurrence.start
                || typeof occurrence.protected !== 'boolean' || typeof occurrence.editable !== 'boolean' || occurrence.protected && occurrence.editable) return null;
            const identity = `${occurrence.ruleIndex}:${occurrence.start}:${occurrence.end}`;
            if (identities.has(identity) || prior && (occurrence.start < prior.start || occurrence.start === prior.start && (occurrence.end < prior.end || occurrence.end === prior.end && occurrence.ruleIndex < prior.ruleIndex))) return null;
            identities.add(identity); counts[occurrence.ruleIndex]++; prior = occurrence;
            occurrences.push({ ...occurrence, truncated: false });
        }
        const matched = own(value, 'matched'), totalOccurrences = own(value, 'totalOccurrences'), matchedRuleCount = own(value, 'matchedRuleCount');
        if (unresolved) {
            if (matched !== null || totalOccurrences !== null || matchedRuleCount !== null || occurrences.length) return null;
        } else {
            if (typeof matched !== 'boolean' || totalOccurrences !== occurrences.length || matchedRuleCount !== counts.filter(count => count > 0).length || rules.some((rule, index) => rule.count !== counts[index])) return null;
            const expected = rules.length > 0 && (own(settings, 'matchPolicy') === 'all' ? matchedRuleCount === rules.length : matchedRuleCount > 0) && totalOccurrences >= own(settings, 'minOccurrences');
            if (matched !== expected) return null;
        }
        return { kind: type, report: { recordType: type, schemaVersion: 1, status, matched, totalOccurrences, matchedRuleCount, rules, occurrences, diagnostics, truncated: false, omittedRules: 0, omittedOccurrences: 0, omittedDiagnostics: 0 } };
    }
    if (type === 'text-filter') {
        const report = pick(value, ['status', 'action', 'unit', 'originalBodyLength', 'resultBodyLength', 'retainedUnitCount']), suppliedUnits = own(value, 'units');
        if (!['complete', 'blocked', 'empty'].includes(report.status) || !['remove', 'keep'].includes(report.action) || !['line', 'paragraph'].includes(report.unit)
            || !integer(report.originalBodyLength) || !integer(report.resultBodyLength, report.originalBodyLength) || !integer(report.retainedUnitCount) || !dense(suppliedUnits, 256)) return null;
        const units = []; let end = 0;
        for (let i = 0; i < suppliedUnits.length; i++) {
            const item = own(suppliedUnits, String(i)), unit = pick(item, ['start', 'end', 'text', 'blocked']);
            if (!plain(item) || !integer(unit.start, report.originalBodyLength) || !integer(unit.end, report.originalBodyLength) || unit.start < end || unit.end <= unit.start
                || !string(unit.text, 100000) || unit.text.length !== unit.end - unit.start || typeof unit.blocked !== 'boolean') return null;
            end = unit.end; units.push({ ...unit, truncated: false });
        }
        if (report.resultBodyLength !== report.originalBodyLength - units.reduce((sum, unit) => sum + unit.end - unit.start, 0) || (report.status === 'blocked') !== units.some(unit => unit.blocked)) return null;
        return { kind: type, report: { recordType: type, schemaVersion: 1, ...report, units, diagnostics, truncated: false, omittedUnits: 0, omittedDiagnostics: 0 } };
    }
    return null;
}

function boundSections(sections, prioritySection = 0) {
    let remaining = TEXT_BUDGET;
    for (const section of sections) {
        if (section.label) { const bounded = clip(section.label, remaining); section.label = bounded.text; remaining -= bounded.bytes; }
        if (section.notices) section.notices = section.notices.map(notice => { const bounded = clip(notice, remaining); remaining -= bounded.bytes; return bounded.text; });
    }
    const allocation = sections[prioritySection] ? [sections[prioritySection], ...sections.filter((_, index) => index !== prioritySection)] : sections;
    for (const section of allocation) {
        const readable = section.readable;
        if (readable.kind === 'text' || readable.kind === 'json') {
            const bounded = clip(readable.text, remaining); Object.assign(readable, { text: bounded.text, truncated: readable.truncated || bounded.truncated }); remaining -= bounded.bytes;
        } else if (readable.kind === 'messages') {
            const displayed = [];
            for (const message of readable.messages) {
                const labelBytes = ['id', 'role', 'speaker', 'timestamp'].reduce((n, key) => n + clip(message[key] ?? '', remaining + 1).bytes, 0);
                if (labelBytes > remaining) break;
                remaining -= labelBytes;
                const bounded = clip(message.text, remaining); Object.assign(message, { text: bounded.text, truncated: message.truncated || bounded.truncated }); remaining -= bounded.bytes;
                displayed.push(message); if (bounded.truncated) break;
            }
            readable.omittedMessages += readable.messages.length - displayed.length;
            readable.messages = displayed; readable.truncated = readable.truncated || readable.omittedMessages > 0 || displayed.some(message => message.truncated);
        } else if (readable.kind === 'pattern-matches' || readable.kind === 'text-filter') {
            const report = readable.report;
            // Summary/status/partial notices and per-row offsets/counts/permission labels
            // consume the same presentation-text budget as exact retained evidence.
            remaining = Math.max(0, remaining - 1024);
            const boundedString = text => {
                const bounded = clip(text, remaining); remaining -= bounded.bytes; report.truncated ||= bounded.truncated; return bounded;
            };
            const rows = (key, omittedKey, fields) => {
                const supplied = report[key], displayed = [];
                for (const row of supplied) {
                    if (remaining <= 128) break;
                    remaining -= 128;
                    const projected = { ...row };
                    for (const field of fields) if (typeof row[field] === 'string') {
                        const bounded = boundedString(row[field]); projected[field] = bounded.text;
                        if (field === 'text') projected.truncated ||= bounded.truncated;
                    }
                    displayed.push(projected); if (!remaining) break;
                }
                report[omittedKey] += supplied.length - displayed.length;
                report[key] = displayed; report.truncated ||= report[omittedKey] > 0;
            };
            // Keep diagnostic explanations ahead of potentially long exact unit/occurrence evidence.
            rows('diagnostics', 'omittedDiagnostics', ['code', 'message']);
            if (readable.kind === 'pattern-matches') {
                rows('rules', 'omittedRules', ['id', 'label', 'pattern']);
                rows('occurrences', 'omittedOccurrences', ['ruleId', 'text']);
            } else rows('units', 'omittedUnits', ['text']);
        } else if (readable.kind === 'unavailable') {
            const bounded = clip(readable.reason, remaining); readable.reason = bounded.text; remaining -= bounded.bytes;
        }
        section.text = readable.text ?? ''; section.truncated = readable.truncated ?? readable.report?.truncated ?? false;
    }
}

/** Rebound already-projected sections after a local text preview, keeping their tab order. */
export function boundReadablePreviewSections(sections, prioritySection = 0) {
    const detached = structuredClone(sections);
    boundSections(detached, prioritySection);
    return freeze(detached);
}

function contextSection(context, collapsed = false) {
    const supplied = own(context, 'messages');
    if (!plain(context) || own(context, 'kind') !== 'context' || !dense(supplied, 1000)) return null;
    const messages = [];
    const ids = new Set();
    for (let i = 0; i < supplied.length; i++) {
        const message = own(supplied, String(i));
        if (!plain(message) || !['id', 'role', 'text'].every(key => typeof own(message, key) === 'string') || !own(message, 'id').trim() || ids.has(own(message, 'id')) || !['system', 'user', 'assistant'].includes(own(message, 'role'))) return null;
        ids.add(own(message, 'id'));
        const projected = { id: own(message, 'id'), role: own(message, 'role'), text: own(message, 'text'), truncated: false };
        for (const key of ['speaker', 'timestamp']) if (typeof own(message, key) === 'string') projected[key] = own(message, key);
        messages.push(projected);
    }
    let snapshotOmittedMessages = 0;
    const omissions = own(own(context, 'report'), 'omissions');
    // Omission entries share the recorder's 20,000-entry bound, not the retained message limit.
    if (dense(omissions, 20000)) for (let i = 0; i < omissions.length; i++) {
        const count = own(own(omissions, String(i)), 'omittedMessages');
        if (Number.isSafeInteger(count) && count > 0) snapshotOmittedMessages = Math.min(Number.MAX_SAFE_INTEGER, snapshotOmittedMessages + count);
        else if (typeof own(own(omissions, String(i)), 'id') === 'string') snapshotOmittedMessages++;
    }
    return { kind: 'context', label: messages.length ? `Captured context · ${messages.length} messages` : 'No captured messages', collapsed,
        ...(snapshotOmittedMessages ? { notices: [`Snapshot omitted ${snapshotOmittedMessages} messages.`] } : {}),
        readable: { kind: 'messages', messages, omittedMessages: 0, snapshotOmittedMessages, truncated: false } };
}

function modifierSections(artifact) {
    const retained = recognizeRecordedText(artifact); if (!retained) return null;
    const { text, rawText, trace, hasModifiers } = retained;
    const sections = [{ kind: 'text', label: 'Output', readable: { kind: 'text', text, truncated: false }, recordedRawText: rawText, recordedModifierTrace: trace }];
    if (hasModifiers) sections.push(
        { kind: 'text', label: 'Raw output', readable: { kind: 'text', text: rawText, truncated: false } },
        { kind: 'diagnostic', label: 'Modifier trace', readable: { kind: 'json', ...diagnosticJSON(trace) } });
    return sections;
}

function project(artifact) {
    const format = own(artifact, 'format'), suppliedKind = own(artifact, 'kind');
    const kind = typeof suppliedKind === 'string' ? clip(suppliedKind, 128).text : 'unknown';
    if (format !== 'structured') {
        const partial = format === 'json-prefix-text';
        const suppliedText = own(artifact, 'text'), suppliedReason = own(artifact, 'reason');
        const text = partial ? typeof suppliedText === 'string' ? suppliedText : '' : 'Artifact omitted: ' + (typeof suppliedReason === 'string' ? clip(suppliedReason, 256).text : 'unavailable');
        const bounded = clip(text, TEXT_BUDGET);
        const source = { format: partial ? 'json-prefix-text' : 'omitted', text: bounded.text, truncated: partial || bounded.truncated, policy: 'safe-recording' };
        return { source, sections: [{ kind, format: source.format, text: source.text, truncated: source.truncated, readable: { kind: 'unavailable', reason: partial ? 'Readable content is unavailable from partial recorded source.' : bounded.text } }] };
    }
    const value = own(artifact, 'value');
    const text = own(value, 'text');
    const sourceText = diagnosticJSON(value);
    const source = { format: 'structured-text', text: sourceText.text, truncated: sourceText.truncated, policy: 'safe-recording' };
    const report = kind === 'data' && plain(value) && own(value, 'kind') === kind ? reportContent(own(value, 'value')) : null;
    const readable = report ?? (plain(value) && kind === own(value, 'kind') && ['text', 'guidance', 'draft', 'candidate'].includes(kind) && typeof text === 'string'
        ? { kind: 'text', text, truncated: false }
        : { kind: 'json', ...(kind === 'data' && own(value, 'kind') === kind ? diagnosticJSON(own(value, 'value')) : sourceText) });
    const sections = [{ kind, readable, ...(report ? { label: report.kind === 'pattern-matches' ? 'Pattern report' : 'Filter report', notices: ['Recorded report; it does not establish the current Draft state or authorize edits.'] } : {}) }];
    if (kind === 'text' && readable.kind === 'text') {
        const modified = modifierSections(artifact); if (modified) sections.splice(0, 1, ...modified);
    }
    const draft = own(value, 'draft'), patches = own(value, 'patches');
    const wrapper = kind === 'patches' && plain(value) && own(value, 'kind') === kind && plain(draft) && own(draft, 'kind') === 'draft' && typeof own(draft, 'text') === 'string' && dense(patches, 256)
        && patches.every(item => plain(item) && Number.isSafeInteger(own(item, 'index')) && own(item, 'index') >= 0 && typeof own(item, 'replacement') === 'string');
    if (wrapper) sections.splice(0, 1,
        { kind: 'patches', label: 'Proposed changes', readable: { kind: 'json', ...diagnosticJSON(patches) } },
        { kind: 'draft', label: 'Draft', readable: { kind: 'text', text: own(draft, 'text'), truncated: false } });
    const typed = plain(value) && own(value, 'kind') === kind;
    const hasDraft = wrapper || typed && readable.kind === 'text' && (kind === 'draft' || kind === 'candidate');
    const retainedContext = kind === 'context' ? value : own(wrapper ? draft : value, 'context');
    const context = typed && (kind === 'context' || hasDraft) ? contextSection(retainedContext, kind !== 'context') : null;
    if (context) { if (kind === 'context') sections[0] = context; else if (kind === 'draft' || kind === 'candidate') sections.push(context); }
    if (wrapper && context) sections.push(context);
    else if (!context && hasDraft) sections.push({ kind: 'context', label: 'Captured context unavailable', collapsed: true, readable: { kind: 'unavailable', reason: retainedContext === undefined ? 'Captured context was not retained.' : 'Captured context is unavailable from the retained recording.' } });
    for (const section of sections) Object.assign(section, { label: section.label ?? section.kind, format: 'structured-text', text: section.readable.text ?? '', truncated: false });
    boundSections(sections);
    return { source, sections };
}

export function projectRecordedPreview(artifact) {
    try {
        if (artifact && projections.has(artifact)) return projections.get(artifact);
        const result = freeze(project(artifact));
        if (plain(artifact) && Object.isFrozen(artifact)) projections.set(artifact, result);
        return result;
    } catch { return freeze(project({ kind: own(artifact, 'kind'), format: 'omitted', reason: 'invalid diagnostic data' })); }
}
