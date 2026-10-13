import { committedGraphChange } from '../workflow/transactions.js?v=0.27.2';
import { createViewState, viewIdentityKey } from './view-state.js?v=0.27.2';

const contentIdentities = new WeakMap();
/** Stable selected authored content for privately admitted editor scopes only. */
export const preparedViewContentIdentity = entry => contentIdentities.get(entry) ?? null;

const fail = (code, message) => ({ ok: false, error: { code, message } });
const freeze = value => {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
};

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// This checks the UI DTO boundary only; domain validation/materialization has already happened.
// No independent size caps: valid producer projections retain their existing domain bounds.
function cloneDTO(value, parents = new Set()) {
    if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object' || parents.has(value)) throw new Error('Expected plain DTO data.');
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new Error('Expected a plain DTO.');
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key))) throw new Error('Unexpected DTO key.');
    if (array && (keys.length !== value.length + 1 || keys.some(key => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key)))) throw new Error('Expected a dense DTO array.');
    const copy = array ? [] : {};
    parents.add(value);
    for (const key of keys) {
        if (array && key === 'length') continue;
        const descriptor = descriptors[key];
        if (!descriptor.enumerable || !('value' in descriptor)) throw new Error('Expected DTO value properties.');
        copy[key] = cloneDTO(descriptor.value, parents);
    }
    parents.delete(value);
    return copy;
}

function prepareCache(workflowId, navigation, preparedViews) {
    try {
        const entries = cloneDTO(preparedViews), nav = cloneDTO(navigation);
        if (!Array.isArray(entries)) throw new Error('Expected prepared views.');
        const rootIdentity = { kind: 'root', workflowId };
        const permissions = new Map([[viewIdentityKey(rootIdentity), false], ...nav.map(entry => [viewIdentityKey(entry.identity), entry.readOnly !== false])]);
        const result = new Map();
        for (const entry of entries) {
            const key = viewIdentityKey(entry?.identity);
            if (!record(entry) || Object.keys(entry).some(field => !['identity', 'definitionRef', 'readOnly', 'savedGraph', 'effectiveNodes', 'interface', 'ports', 'drawBase'].includes(field)) || !key || !permissions.has(key) || result.has(key) || !record(entry.savedGraph) || !record(entry.effectiveNodes) || !Array.isArray(entry.interface) || !Array.isArray(entry.ports)) throw new Error('Expected exact complete cached views.');
            const readOnly = permissions.get(key), ref = entry.definitionRef;
            if (entry.readOnly !== undefined && entry.readOnly !== readOnly) throw new Error('Cached permission disagrees with navigation.');
            if (entry.identity.kind !== 'root' && (!record(ref) || Object.keys(ref).some(field => !['id', 'version', 'semanticHash'].includes(field)) || typeof ref.id !== 'string' || !ref.id || !Number.isSafeInteger(ref.version) || ref.version < 1 || typeof ref.semanticHash !== 'string' || !ref.semanticHash)) throw new Error('Expected an exact definition ref.');
            if (entry.identity.kind === 'library' && (ref.id !== entry.identity.definitionRef.id || ref.version !== entry.identity.definitionRef.version || ref.semanticHash !== entry.identity.definitionRef.semanticHash || entry.ports.some(port => Object.hasOwn(port, 'address')))) throw new Error('Library inspection cannot supply a runtime address.');
            const owned = freeze({ ...entry, readOnly });
            contentIdentities.set(owned, Object.freeze({})); result.set(key, owned);
        }
        if (result.size !== permissions.size) throw new Error('The cache must cover complete navigation.');
        return { ok: true, data: result };
    } catch { return fail('VIEW_CACHE', 'Expected complete plain cached editor views matching the prepared navigation.'); }
}

/** Consume prepared plain editor DTOs only. Root execution and preparation stay with the caller. */
export function createGraphViewSession({ root, activationId, navigation = [], preparedViews, persisted, initialCamera } = {}) {
    if (!root || typeof root !== 'object' || typeof root.id !== 'string' || !root.id) return fail('VIEW_ROOT', 'Expected the active workflow root.');
    if (typeof activationId !== 'string' || !activationId) return fail('VIEW_ACTIVATION', 'Expected a root activation identity.');
    const workflowId = root.id;
    let views = createViewState({ workflowId, navigation, initialCamera, rootLabel: root.name });
    if (!views) return fail('VIEW_NAVIGATION', 'Expected complete prepared graph navigation.');
    let warnings = Object.freeze([]);
    if (persisted !== undefined) {
        const restored = createViewState({ workflowId, navigation, persisted, initialCamera, rootLabel: root.name });
        if (restored) views = restored;
        else warnings = freeze([{ code: 'VIEW_PERSISTENCE', message: 'Saved graph view presentation was invalid. The root workflow is available with fresh view presentation.' }]);
    }
    const checkedCache = prepareCache(workflowId, navigation, preparedViews);
    if (!checkedCache.ok) return checkedCache;
    let prepared = checkedCache.data;
    let active = true, rootIdentityCurrent = true;
    const rootCurrent = () => {
        if (rootIdentityCurrent && root.id !== workflowId) { rootIdentityCurrent = false; views.invalidateContext(); }
        return rootIdentityCurrent;
    };
    const contexts = new WeakMap();
    const editorFor = (view, current = rootCurrent()) => Object.freeze({ view, prepared: prepared.get(view.key), readOnly: !active || !current || view.readOnly });
    const readEditor = () => { const current = rootCurrent(); return editorFor(views.project().active, current); };
    const session = {
        readRoot: () => root,
        readEditor,
        project() {
            const current = rootCurrent(), graphViews = views.project();
            return Object.freeze({ graphViews, editor: editorFor(graphViews.active, current), active: active && current, activationId, warnings });
        },
        serialize: () => views.serialize(),
        readEditContext() {
            const current = rootCurrent(), projection = views.project(), view = projection.active;
            return freeze({ activationId, sessionId: `${activationId}:${projection.viewEpoch}`, viewPath: view.identity.kind === 'instance' ? [...view.identity.instancePath] : [], readOnly: !active || !current || view.readOnly });
        },
        captureEditorContext() {
            rootCurrent();
            const view = views.captureContext();
            const token = freeze({ activationId, key: view.key, viewEpoch: view.epoch, identity: view.identity });
            contexts.set(token, { root, activationId, view });
            return token;
        },
        isEditorContextCurrent(token) {
            const context = token !== null && typeof token === 'object' && contexts.get(token);
            return !!context && active && rootCurrent() && context.root === root && context.activationId === activationId && views.isContextCurrent(context.view);
        },
        replacePreparedViews({ navigation: nextNavigation, preparedViews: nextViews } = {}, { invalidateEditor = true } = {}) {
            if (!active) return fail('VIEW_INACTIVE', 'The graph view session is closed.');
            if (!rootCurrent()) return fail('VIEW_ROOT_CHANGED', 'The workflow root identity changed.');
            if (!createViewState({ workflowId, navigation: nextNavigation, rootLabel: root.name })) return fail('VIEW_NAVIGATION', 'Expected complete prepared graph navigation.');
            const checked = prepareCache(workflowId, nextNavigation, nextViews);
            if (!checked.ok) return checked;
            if (invalidateEditor !== true && invalidateEditor !== false) return fail('VIEW_CONTEXT_REQUIRED', 'Expected an explicit editor invalidation policy.');
            if (!invalidateEditor && (checked.data.size !== prepared.size || [...checked.data].some(([key, value]) => !prepared.has(key) || JSON.stringify(value) !== JSON.stringify(prepared.get(key))))) return fail('VIEW_CONTEXT_REQUIRED', 'Only cached navigation label changes may preserve an editor context.');
            const replaced = views.replaceNavigation(nextNavigation, { rootLabel: root.name ?? 'Graph 1' });
            if (!replaced.ok) return replaced;
            prepared = checked.data;
            if (invalidateEditor) views.invalidateContext();
            return { ok: true, data: readEditor() };
        },
        applyCommittedCoordinates(summary) {
            if (!active || !rootCurrent()) return fail('VIEW_INACTIVE', 'The graph view session is closed.');
            const change = committedGraphChange(root, summary), editor = readEditor();
            if (change?.kind !== 'coordinates' || change.nodeIds.some(id => { const node = change.candidate.nodes[id]; return !Number.isFinite(node?.x) || !Number.isFinite(node?.y) || node.type === 'note' && node.commentFrame === true; }) || editor.view.identity.kind !== 'root' || editor.readOnly) return fail('VIEW_PATCH', 'Expected a current committed root coordinate change.');
            const source = change.candidate, entry = editor.prepared;
            const patch = (items, ids, authored, frame = false) => {
                const next = { ...items };
                for (const id of ids) {
                    const item = { ...items[id] };
                    for (const field of ['x', 'y', ...(frame ? ['frame'] : [])]) {
                        if (Object.hasOwn(authored[id], field)) item[field] = frame && field === 'frame' ? freeze(cloneDTO(authored[id][field])) : authored[id][field];
                        else delete item[field];
                    }
                    next[id] = Object.freeze(item);
                }
                return Object.freeze(next);
            };
            const nodes = patch(entry.savedGraph.nodes, change.nodeIds, source.nodes);
            const groups = patch(entry.savedGraph.groups ?? {}, change.groupIds, source.groups ?? {}, true);
            const updated = Object.freeze({ ...entry,
                savedGraph: Object.freeze({ ...entry.savedGraph, nodes, groups }),
                effectiveNodes: patch(entry.effectiveNodes, change.nodeIds, source.nodes),
                drawBase: Object.freeze({ ...entry.drawBase, nodes: patch(entry.drawBase.nodes, change.nodeIds, source.nodes), groups }) });
            contentIdentities.set(updated, contentIdentities.get(entry));
            prepared = new Map(prepared); prepared.set(editor.view.key, updated); views.invalidateContext();
            return { ok: true, data: change };
        },
        invalidateEditorContext: () => views.invalidateContext(),
        deactivate() { if (active) { active = false; views.invalidateContext(); } },
    };
    for (const name of ['openInstance', 'openLibrary', 'focusView', 'closeView', 'reopenView', 'revealParent', 'updateView']) session[name] = (...args) => !active ? fail('VIEW_INACTIVE', 'The graph view session is closed.') : !rootCurrent() ? fail('VIEW_ROOT_CHANGED', 'The workflow root identity changed.') : views[name](...args);
    return { ok: true, data: Object.freeze(session) };
}
