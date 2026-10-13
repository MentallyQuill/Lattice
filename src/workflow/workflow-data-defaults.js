import { validateStoryClock } from './story-time.js?v=0.27.3';
import { cloneJsonValue } from './operations/json-data.js?v=0.27.3';
import { prepareDocumentMutation } from './operations/document-mutations.js?v=0.27.3';
import { freeze } from './record-data.js?v=0.27.3';

const fail = (code, message) => ({ ok: false, error: { code, message } });
const own = (value, key) => {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (property && (!property.enumerable || !Object.hasOwn(property, 'value'))) throw new Error('Own data required.');
    return property?.value;
};
const clock = { schemaVersion: 1, clockId: 'lattice-default-clock', calendarId: 'story-calendar', dayLengthMinutes: 1440, absoluteMinute: 0, revision: 1, unit: 'minute', originMinute: 0, originDay: 1, timeEvidence: { kind: 'explicit' } };
const presets = freeze({
    clock: { kind: 'clock', controlKey: 'clockId', targetId: clock.clockId, name: 'Chat clock', format: 'json', content: JSON.stringify(clock, null, 2), visibility: { kind: 'public' } },
    notes: { kind: 'notes', controlKey: 'targetId', targetId: 'lattice-default-notes', name: 'Chat notes', format: 'text', content: '', visibility: { kind: 'public' } },
    outcomes: { kind: 'outcomes', controlKey: 'targetId', targetId: 'lattice-default-outcomes', name: 'Chat outcomes', format: 'json', content: '[]', visibility: { kind: 'public' } },
});

/** Portable nodes name the default; only the trusted active user/chat host authorizes it. */
export function workflowDataPresetFor(operation) {
    if (operation === 'story-clock') return presets.clock;
    if (operation === 'read-file') return presets.notes;
    if (operation === 'commit-outcomes') return presets.outcomes;
    if (operation === 'random-pick') return freeze({ ...presets.outcomes, controlKey: 'ledgerId' });
    return null;
}

/** Inspect bounded initial or canonical content. Every valid format remains readable by Read File. */
export function workflowDataKind(definition) {
    try {
        const checked = cloneJsonValue(definition);
        if (!checked.ok) return null;
        const value = checked.data.value;
        if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.targetId !== 'string' || typeof value.content !== 'string' || !['json', 'jsonl', 'csv', 'text', 'markdown'].includes(value.format)) return null;
        const valid = prepareDocumentMutation({ targetId: value.targetId, revision: 0, format: value.format, content: value.content }, { operation: 'replace', content: value.content, ...(value.format === 'csv' ? { columns: value.columns } : {}) });
        if (!valid.ok) return null;
        if (value.format !== 'json') return 'notes';
        const parsed = JSON.parse(value.content);
        if (Array.isArray(parsed)) {
            const keyed = parsed.every(record => record && typeof record === 'object' && !Array.isArray(record) && typeof record.outcomeId === 'string' && record.outcomeId.trim().length > 0 && record.outcomeId.length <= 65536);
            return keyed && new Set(parsed.map(record => record.outcomeId)).size === parsed.length ? 'outcomes' : 'notes';
        }
        if (validateStoryClock(parsed).ok && parsed.schemaVersion === 1 && Number.isSafeInteger(parsed.revision) && parsed.revision > 0 && parsed.clockId === value.targetId) return 'clock';
        return 'notes';
    } catch { return null; }
}

/** Install missing referenced defaults before any file session captures catalog authority. */
export function ensureWorkflowDataDefaults({ catalog, graph, defaults = [], scope, context, isCurrent }) {
    try {
        const required = new Map(defaults.map(preset => [preset.targetId, preset]));
        for (const node of Object.values(own(graph, 'nodes') ?? {})) {
            const operation = own(node, 'operation'), preset = workflowDataPresetFor(operation);
            if (!preset) continue;
            const configured = own(node, preset.controlKey);
            const targetId = configured === undefined || configured === '' && operation !== 'random-pick' ? preset.targetId : configured;
            const selected = operation === 'read-file' ? Object.values(presets).find(candidate => candidate.targetId === targetId) : targetId === preset.targetId ? preset : null;
            if (selected) required.set(selected.targetId, selected);
        }
        if (!required.size) return { ok: true, data: { created: [] } };
        const current = () => isCurrent() === true;
        const stale = () => fail('STALE_DOCUMENT_SCOPE', 'Workflow Data defaults require the original active user and chat.');
        const capture = own(catalog, 'capture'), define = own(catalog, 'defineCaptured');
        if (typeof capture !== 'function') return fail('DOCUMENT_CATALOG_UNAVAILABLE', 'Workflow Data defaults require the active user and chat.');
        if (!current()) return stale();
        let captured = capture.call(catalog);
        if (!current()) return stale();
        if (!captured?.ok) return captured;
        const liveLease = () => captured.data.scope.userId === scope.userId && captured.data.scope.chatId === scope.chatId && captured.data.isCurrent() && current();
        if (!liveLease()) return stale();
        const liveContext = context();
        if (!liveLease() || (liveContext.getCurrentChatId?.() ?? liveContext.chatId) !== scope.chatId) return stale();
        const metadata = own(liveContext, 'chatMetadata'), storedRoot = metadata && own(metadata, 'latticeDocuments'), storedUser = storedRoot && own(storedRoot, scope.userId);
        const missing = [];
        // Preflight every reserved identity before modifying the catalog, avoiding partial setup on collisions.
        for (const preset of required.values()) {
            const existing = captured.data.documents.find(document => document.targetId === preset.targetId);
            const saved = storedUser && own(storedUser, preset.targetId);
            const compatible = definition => { const kind = workflowDataKind(definition); return preset.kind === 'notes' ? kind !== null : kind === preset.kind; };
            if (existing && !compatible(existing) || saved && (!existing || !compatible(saved) || saved.format !== existing.format)) return fail('WORKFLOW_DATA_DEFAULT_CONFLICT', 'The reserved Workflow Data target ' + preset.targetId + ' contains incompatible data or has no authorization. Choose another authorized source in the node settings.');
            if (!existing) missing.push(preset);
        }
        if (!liveLease()) return stale();
        if (missing.length && typeof define !== 'function') return fail('DOCUMENT_CATALOG_UNAVAILABLE', 'The host cannot create automatic Workflow Data defaults.');
        const created = [];
        for (const preset of missing) {
            if (!liveLease()) return stale();
            const { kind, controlKey, ...definition } = preset;
            const installed = define.call(catalog, captured.data, definition);
            if (!current()) return stale();
            if (!installed?.ok) return installed;
            created.push(preset.targetId);
            captured = capture.call(catalog);
            if (!current()) return stale();
            if (!captured?.ok) return captured;
            if (!liveLease()) return stale();
        }
        return { ok: true, data: { created } };
    } catch { return fail('DOCUMENT_CATALOG_UNAVAILABLE', 'Workflow Data defaults could not be prepared safely.'); }
}
