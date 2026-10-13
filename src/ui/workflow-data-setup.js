import { resolveSystemNode } from '../workflow/system-capabilities.js?v=0.27.2';
import { createStoryDocumentSetup } from './story-document-setup.js?v=0.27.2';
import { workflowDataPresetFor, workflowDataKind } from '../workflow/workflow-data-defaults.js?v=0.27.2';
import { advanceStoryClock } from '../workflow/story-time.js?v=0.27.2';
import { freeze } from '../workflow/record-data.js?v=0.27.2';

const fail = (code, message) => ({ ok: false, error: { code, message } });
const stale = () => fail('STALE_DOCUMENT_SETUP', 'The active user, chat or Workflow Data changed. Reopen the node settings.');
const compatible = (kind, definition) => kind === 'notes' ? workflowDataKind(definition) !== null : workflowDataKind(definition) === kind;
const definitionOf = preset => {
    const { targetId, name, format, content, visibility, columns } = preset;
    return { targetId, name, format, content, visibility, ...(columns ? { columns } : {}) };
};

// Only exact resolver-derived reserved identities may seed a missing instance default.
// A matching-looking portable target name is never sufficient.
function addressedPreset(operation, targetId, address) {
    const preset = workflowDataPresetFor(operation); if (!preset) return null;
    const candidates = operation === 'read-file' ? ['read-file','commit-outcomes','story-clock'].map(workflowDataPresetFor) : [preset];
    for (const candidate of candidates) {
        const resolved = address ? resolveSystemNode({ id: address.nodeId, type: 'workflow', operation, [preset.controlKey]: candidate.targetId }, address) : null;
        const effective = address ? resolved?.ok ? resolved.data.defaults.find(item => item.kind === candidate.kind) : null : candidate;
        if (effective?.targetId === targetId) return { ...effective, controlKey: preset.controlKey, ...(address?.instancePath.length && effective.kind !== 'clock' ? { name: 'System ' + effective.kind } : {}) };
    }
    return null;
}

/** Retains settings authority; detached panel DTOs never contain canonical data. */
export function createWorkflowDataSetup(catalog, ports = {}) {
    const settings = createStoryDocumentSetup(catalog);
    let owner = null, knownScope = '', notice = null;
    const known = new Map(), scopeKey = scope => JSON.stringify([scope.userId, scope.chatId]);
    const unavailable = () => { owner = null; known.clear(); knownScope = ''; notice = null; return freeze({ available: false, key: '', documents: [] }); };
    const current = key => owner?.key === key && settings.isCurrent(key);
    const snapshot = () => {
        const view = owner && current(owner.key) ? { ok: true, data: { key: owner.key } } : settings.snapshot();
        if (!view.ok) return unavailable();
        const captured = catalog.capture();
        if (!captured.ok || !settings.isCurrent(view.data.key)) return unavailable();
        if (scopeKey(captured.data.scope) !== knownScope) { known.clear(); notice = null; knownScope = scopeKey(captured.data.scope); }
        const definitions = {};
        const documents = captured.data.documents.map(definition => {
            const cached = known.get(definition.targetId);
            if (cached && cached.signature === JSON.stringify(definitionOf(definition))) definitions[definition.targetId] = cached.definition;
            else known.delete(definition.targetId);
            let stored;
            try { stored = ports.getStored?.(captured.data.scope, definition.targetId); } catch { /* Unknown data is not offered as a clock. */ }
            const source = stored ? { ...definition, format: stored.format, content: stored.content } : definition;
            const { content, ...summary } = definition;
            return { ...summary, kind: workflowDataKind(source) };
        });
        if (!captured.data.isCurrent() || !settings.isCurrent(view.data.key)) return unavailable();
        if (notice && !captured.data.documents.some(definition => definition.targetId === notice.targetId && JSON.stringify(definitionOf(definition)) === notice.signature)) notice = null;
        owner = { key: view.data.key, documents };
        return freeze({ available: true, key: owner.key, documents, definitions, ...(notice ? { notice: { targetId: notice.targetId, message: notice.message } } : {}) });
    };
    const checkBinding = (key, operation, targetId, address) => {
        const preset = workflowDataPresetFor(operation);
        if (!preset) return fail('INVALID_WORKFLOW_DATA', 'This node does not use Workflow Data.');
        if (!owner && !key && (targetId === preset.targetId || operation === 'random-pick' && targetId === '')) return { ok: true };
        if (!current(key)) return stale();
        if (operation === 'random-pick' && targetId === '') return { ok: true };
        const document = owner.documents.find(item => item.targetId === targetId);
        if (!document && addressedPreset(operation, targetId, address) || document && (preset.kind === 'notes' || document.kind === preset.kind)) return { ok: true };
        return fail('INCOMPATIBLE_WORKFLOW_DATA', 'Choose a compatible data source for this node.');
    };
    const load = (key, operation, targetId, expose = true, address) => {
        const checked = checkBinding(key, operation, targetId, address); if (!checked.ok) return checked;
        if (!current(key)) return stale();
        const preset = workflowDataPresetFor(operation);
        const reserved = addressedPreset(operation, targetId, address);
        if (reserved && !owner.documents.some(item => item.targetId === targetId)) return { ok: true, data: { definition: freeze(definitionOf(reserved)) } };
        const loaded = settings.load(key, targetId);
        if (loaded.ok && !compatible(preset.kind, loaded.data.definition)) return fail('INCOMPATIBLE_WORKFLOW_DATA', 'This source has no compatible initial template. Create a separate source for new initial values.');
        if (loaded.ok && expose) { const definition = definitionOf(loaded.data.definition); known.set(targetId, { signature: JSON.stringify(definition), definition }); }
        return loaded;
    };
    const save = async (key, operation, targetId, definition, expose = true, address) => {
        if (!current(key)) return stale();
        const preset = workflowDataPresetFor(operation);
        if (!preset || definition?.targetId !== targetId || !compatible(preset.kind, definition)) return fail('INCOMPATIBLE_WORKFLOW_DATA', 'The initial values must match this node’s data source.');
        const remember = expose || known.has(targetId) || !owner.documents.some(document => document.targetId === targetId) && !!addressedPreset(operation, targetId, address);
        const originalScope = knownScope;
        const result = await settings.save(key, definition);
        if (result.ok) {
            const captured = catalog.capture();
            const installed = captured.ok && captured.data.documents.find(item => item.targetId === targetId);
            const savedDefinition = installed && definitionOf(installed), signature = savedDefinition && JSON.stringify(savedDefinition);
            if (captured.ok && scopeKey(captured.data.scope) === originalScope && captured.data.isCurrent() && signature === JSON.stringify(definitionOf(definition))) {
                if (remember) known.set(targetId, { signature, definition: savedDefinition });
                notice = { targetId, signature, message: result.data.message };
            }
        }
        return result;
    };
    const saveVisibility = async (key, operation, targetId, visibility, address) => {
        const loaded = load(key, operation, targetId, false, address); if (!loaded.ok) return loaded;
        const { revision, ...definition } = loaded.data.definition;
        return save(key, operation, targetId, { ...definition, visibility }, false, address);
    };
    const create = async (key, operation, options) => {
        if (!current(key)) return stale();
        const preset = workflowDataPresetFor(operation);
        if (!preset || !options || typeof options.name !== 'string' || !options.name.trim() || options.name.length > 256) return fail('INVALID_WORKFLOW_DATA', 'Give the new data source a name.');
        const targetId = 'workflow-' + preset.kind + '-' + globalThis.crypto.randomUUID();
        let definition = { ...definitionOf(preset), targetId, name: options.name.trim(), visibility: options.visibility ?? { kind: 'public' } };
        if (preset.kind === 'clock') {
            const clock = { ...JSON.parse(preset.content), clockId: targetId, calendarId: options.calendarId ?? 'story-calendar', absoluteMinute: options.absoluteMinute ?? 0, dayLengthMinutes: options.dayLengthMinutes ?? 1440 };
            const checked = advanceStoryClock(clock, { kind: 'duration', minutes: 0 });
            if (!checked.ok) return fail('INVALID_CLOCK_TEMPLATE', 'Use a calendar ID, a positive day length and a nonnegative whole starting minute.');
            definition.content = JSON.stringify(clock, null, 2);
        } else if (preset.kind === 'notes' && options.format) {
            definition.format = options.format;
            definition.content = options.format === 'json' ? '[]' : '';
            if (options.format === 'csv') { definition.columns = ['value']; definition.content = 'value\n'; }
        }
        const result = await save(key, operation, targetId, definition);
        return result.ok ? { ok: true, data: { ...result.data, definition: freeze(definition) } } : result;
    };
    return Object.freeze({ snapshot, checkBinding, load, save, saveVisibility, create });
}

/** Plain per-node display projection from a prepared catalog summary. */
export function projectWorkflowData(node, state = {}, editable = true, address) {
    const preset = workflowDataPresetFor(node?.operation);
    if (!preset || node.operation === 'random-pick' && !node.ledgerId) return null;
    const targetId = node[preset.controlKey] || preset.targetId, reserved = addressedPreset(node.operation, targetId, address);
    const knownDefinition = state.definitions && Object.hasOwn(state.definitions, targetId) ? state.definitions[targetId] : null;
    const documents = state.documents ?? [], selected = documents.find(item => item.targetId === targetId);
    const builtIn = documents.find(item => item.targetId === preset.targetId);
    const sources = [
        ...(node.operation === 'random-pick' ? [{ value: '', label: 'Disabled' }] : []),
        ...(!builtIn ? [{ value: preset.targetId, label: preset.name }] : []),
        ...documents.filter(item => preset.kind === 'notes' ? item.kind !== null : item.kind === preset.kind).map(item => ({ value: item.targetId, label: item.name })),
    ];
    if (!sources.some(source => source.value === targetId)) sources.push({ value: targetId, label: selected?.name ?? reserved?.name ?? 'Unavailable source' });
    return freeze({ kind: preset.kind, controlKey: preset.controlKey, targetId, name: selected?.name ?? (reserved ? reserved.name : targetId), format: selected?.format ?? preset.format, visibility: selected?.visibility ?? preset.visibility, sources, available: state.available === true, editable, key: state.key ?? '',
        ...(knownDefinition ? { definition: knownDefinition } : !selected && reserved ? { definition: definitionOf(reserved) } : {}),
        ...(state.notice?.targetId === targetId ? { notice: state.notice.message } : {}),
        ...(node.operation === 'story-clock' ? { expectedCalendar: node.calendarId ?? '' } : {}),
        ...(selected && (preset.kind === 'notes' ? selected.kind === null : selected.kind !== preset.kind) ? { issue: 'This data source is incompatible with the node. Choose another source or create a separate one.' } : !selected && !reserved ? { issue: 'This data source is unavailable in the active chat. Choose another source.' } : {}),
    });
}
