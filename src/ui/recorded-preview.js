import { own, dense, plain, freeze } from '../workflow/record-data.js?v=0.27.0';
import { recognizeRecordedText } from '../workflow/retained-text.js?v=0.27.0';

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
        } else if (readable.kind === 'unavailable') {
            const bounded = clip(readable.reason, remaining); readable.reason = bounded.text; remaining -= bounded.bytes;
        }
        section.text = readable.text ?? ''; section.truncated = readable.truncated ?? false;
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
    const readable = plain(value) && kind === own(value, 'kind') && ['text', 'guidance', 'draft', 'candidate'].includes(kind) && typeof text === 'string'
        ? { kind: 'text', text, truncated: false }
        : { kind: 'json', ...(kind === 'data' && own(value, 'kind') === kind ? diagnosticJSON(own(value, 'value')) : sourceText) };
    const sections = [{ kind, readable }];
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
