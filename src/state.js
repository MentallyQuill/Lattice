/** Current Lattice documents and settings. SillyTavern owns its normal prompt. */
import { starterGraph } from './workflow/starters.js?v=0.26.0';
import { exportWorkflow, parseWorkflow } from './workflow/packages.js?v=0.26.0';
import { safeWorkflowData } from './workflow/contracts.js?v=0.26.0';
import { cloneWorkflowDocument } from './workflow/document.js?v=0.26.0';
import { serializeWorkflowDocument } from './workflow/document-file.js?v=0.26.0';
import { createWorkflowDocumentSession } from './ui/document-session.js?v=0.26.0';
import { commitPreparedGraph, graphEditSignature } from './workflow/transactions.js?v=0.26.0';
import * as graphHistory from './history.js?v=0.26.0';

export const MODULE = 'lattice';
export const ctx = () => globalThis.SillyTavern.getContext();
export function uid(prefix = 'n') { return prefix + '_' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)); }
export function safe(fn, fallback = undefined) { try { return fn(); } catch { return fallback; } }
// Public and cache-versioned module URLs must share document authority.
const stateKey = Symbol.for('lattice.workflow-document-state');
const shared = globalThis[stateKey] ??= { admitted: new WeakSet(), session: createWorkflowDocumentSession(), owner: null, activationListeners: new Set(), touchListeners: new Set() };
const admitted = shared.admitted;
export const documentSession = shared.session;
const activationListeners = shared.activationListeners;
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Settings registries contain independently bounded documents, not one package. */
function dataRecord(value) {
    try {
        if (!plain(value)) return null;
        const descriptors = Object.getOwnPropertyDescriptors(value), result = {};
        for (const key of Reflect.ownKeys(descriptors)) {
            const descriptor = descriptors[key];
            if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || !safeWorkflowData({ [key]: null })) return null;
            result[key] = descriptor.value;
        }
        return result;
    } catch { return null; }
}

function checkRegistry(value) {
    const entries = dataRecord(value);
    return entries && Object.values(entries).every(safeWorkflowData);
}

function legacyRecord(value) {
    try {
        if (!plain(value)) return null;
        return Object.getOwnPropertyDescriptors(value);
    } catch { return null; }
}

function checkSettings(value) {
    const saved = dataRecord(value), metadata = {}, library = dataRecord(saved?.subgraphLibrary);
    if (saved) for (const [key, item] of Object.entries(saved)) if (!['graphs', 'activeGraphId', 'nativeBindings', 'subgraphLibrary', 'workspaceViews', 'migrationRecovery', 'recoveryDraft'].includes(key)) metadata[key] = item;
    if (!saved || !safeWorkflowData(metadata) || ![1, 2].includes(saved.schema) || typeof saved.enabled !== 'boolean' || !plain(saved.ui) || !library || !checkRegistry(library.definitions ?? {}) || !safeWorkflowData(Object.fromEntries(Object.entries(library).filter(([key]) => key !== 'definitions')))) throw new Error('Lattice settings must contain plain preferences and a current reusable subgraph shelf.');
    if (Object.hasOwn(saved, 'workflowMode')) throw new Error('Lattice settings contain an unsupported workflow mode.');
    if (saved.schema === 2 && !Array.isArray(saved.migrationRecovery)) throw new Error('Lattice migration recovery must remain independently enumerable.');
    return saved;
}

/** Read old authoring entries independently; originals remain available even when unreadable. */
function migrateSettings(value, saved) {
    if (saved.schema !== 1) return;
    const graphs = legacyRecord(saved.graphs), views = legacyRecord(saved.workspaceViews ?? {}), recovery = [];
    if (!graphs) recovery.push({ id: 'legacy-workflow-data', name: 'Previous workflow data', issue: 'The previous workflow registry is unreadable.', original: saved.graphs });
    else for (const id of Reflect.ownKeys(graphs)) {
        const descriptor = graphs[id];
        if (typeof id !== 'string' || !safeWorkflowData({ [id]: null }) || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
            recovery.push({ id: typeof id === 'string' ? id : 'legacy-workflow-data-' + recovery.length, name: 'Unreadable previous workflow', issue: 'The previous workflow entry is not plain document data.', original: saved.graphs });
            continue;
        }
        const original = descriptor.value;
        const checked = cloneWorkflowDocument(original), entry = { id, name: safe(() => Object.getOwnPropertyDescriptor(original, 'name')?.value, id), original };
        if (typeof entry.name !== 'string' || !entry.name) entry.name = id;
        if (checked.ok && checked.data.id === id) entry.graph = checked.data;
        else entry.issue = checked.error?.message ?? 'The previous document identity does not match its registry entry.';
        if (views && Object.hasOwn(views, id)) {
            const viewDescriptor = views[id];
            entry.originalWorkspaceViews = Object.hasOwn(viewDescriptor, 'value') ? viewDescriptor.value : saved.workspaceViews;
            const encoded = entry.graph && Object.hasOwn(viewDescriptor, 'value') && serializeWorkflowDocument(entry.graph, viewDescriptor.value);
            if (encoded?.ok) entry.workspaceViews = structuredClone(viewDescriptor.value);
            else entry.issue = [entry.issue, 'The previous workspace presentation is unreadable.'].filter(Boolean).join(' ');
        }
        recovery.push(entry);
    }
    if (views) for (const id of Reflect.ownKeys(views)) {
        const entry = typeof id === 'string' ? recovery.find(entry => entry.id === id) : null;
        if (entry && Object.hasOwn(entry, 'originalWorkspaceViews')) continue;
        const descriptor = views[id], originalWorkspaceViews = Object.hasOwn(descriptor, 'value') ? descriptor.value : saved.workspaceViews;
        const issue = 'The previous workspace presentation has no readable matching document.';
        if (entry) { entry.originalWorkspaceViews = originalWorkspaceViews; entry.issue = [entry.issue, issue].filter(Boolean).join(' '); }
        else recovery.push({ id: typeof id === 'string' ? id : 'legacy-workspace-data-' + recovery.length, name: 'Previous workspace presentation', issue, original: originalWorkspaceViews, originalWorkspaceViews });
    }
    if (!views && saved.workspaceViews !== undefined) recovery.push({ id: 'legacy-workspace-data', name: 'Previous workspace presentation', issue: 'The previous workspace presentation registry is unreadable.', original: saved.workspaceViews });
    const selected = recovery.find(entry => entry.id === saved.activeGraphId && entry.graph);
    const next = { ...saved, schema: 2, migrationRecovery: recovery, recoveryDraft: selected ? { graph: structuredClone(selected.graph), workspaceViews: structuredClone(selected.workspaceViews ?? null) } : null };
    for (const field of ['graphs', 'activeGraphId', 'nativeBindings', 'workspaceViews']) delete next[field];
    for (const field of Object.keys(value)) if (!Object.hasOwn(next, field)) delete value[field];
    Object.assign(value, next);
}

function ownDocument(value) {
    if (shared.owner === value) return;
    shared.owner = value;
    const original = value.recoveryDraft, recovered = dataRecord(original), checked = recovered && cloneWorkflowDocument(recovered.graph);
    if (recovered && !checked?.ok) value.migrationRecovery.push({ id: 'previous-recovery-draft', name: 'Previous recovery draft', issue: checked?.error?.message ?? 'The previous recovery draft is unreadable.', original: recovered });
    let workspaceViews = checked?.ok ? recovered.workspaceViews ?? null : null;
    if (checked?.ok && workspaceViews !== null && !serializeWorkflowDocument(checked.data, workspaceViews).ok) {
        value.migrationRecovery.push({ id: 'previous-recovery-presentation', name: checked.data.name || 'Previous recovery draft', graph: structuredClone(checked.data), workspaceViews: null, original, originalWorkspaceViews: workspaceViews, issue: 'The previous recovery draft workspace presentation is unreadable.' });
        workspaceViews = null;
    }
    if (original && !recovered) value.migrationRecovery.push({ id: 'previous-recovery-draft', name: 'Previous recovery draft', original, issue: 'The previous recovery draft is unreadable.' });
    activateDocument(checked?.ok ? checked.data : starterGraph('unified-basic'), { source: checked?.ok ? { kind: 'recovery', name: checked.data.name || 'Recovered workflow' } : null, workspaceViews });
}

/** Admit saved settings once; camera projections never repeat domain validation. */
export function settings() {
    const c = ctx(), root = c.extensionSettings ?? c.extension_settings;
    if (!plain(root)) throw new Error('Lattice: getContext() exposed no extension settings.');
    const property = Object.getOwnPropertyDescriptor(root, MODULE);
    if (!property) {
        const value = { schema: 2, enabled: false, subgraphLibrary: { definitions: {} }, ui: {}, migrationRecovery: [], recoveryDraft: null };
        checkSettings(value);
        root[MODULE] = value; admitted.add(value); ownDocument(value);
        return value;
    }
    if (!('value' in property)) throw new Error('Lattice settings must not contain an accessor.');
    const value = property.value;
    if (!admitted.has(value)) { const saved = checkSettings(value); migrateSettings(value, saved); admitted.add(value); }
    ownDocument(value);
    return value;
}
function persistRecovery() {
    const graph = documentSession.current();
    if (!shared.owner || !graph) return;
    const encoded = serializeWorkflowDocument(graph, documentSession.workspaceViews?.() ?? documentSession.capture()?.workspaceViews ?? null);
    if (!encoded.ok) return;
    const envelope = JSON.parse(encoded.data.json);
    shared.owner.recoveryDraft = { graph: envelope.graph, workspaceViews: envelope.workspaceViews ?? null };
}
export function save() { persistRecovery(); safe(() => ctx().saveSettingsDebounced()); }

function activateDocument(graph, options = {}) {
    const previous = documentSession.current();
    if (previous) graphHistory.dispose(previous);
    graphHistory.reset(graph);
    const token = documentSession.activate(graph, options);
    persistRecovery();
    const event = { graph, previous, token };
    for (const listener of activationListeners) safe(() => listener(event));
    safe(() => globalThis.document?.dispatchEvent(new CustomEvent('pc-document-activated', { detail: event })));
    return token;
}
export function activeWorkflow() { settings(); return documentSession.current(); }
export function activateWorkflow(graph, options = {}) { settings(); return activateDocument(graph, options); }
export function onWorkflowActivated(listener) { activationListeners.add(listener); return () => activationListeners.delete(listener); }
export function activeWorkspaceViews() { settings(); return documentSession.workspaceViews?.() ?? documentSession.capture()?.workspaceViews ?? null; }
export function setActiveWorkspaceViews(data) { settings(); documentSession.workspaceViews(data); persistRecovery(); return data; }
export function recoveredWorkflows() { return settings().migrationRecovery.slice(); }
/** Retain successful example companions as recovery choices, never as recent files. */
export function retainRecoveryWorkflows(graphs) {
    const value = settings(), retained = [];
    for (const graph of graphs) {
        const checked = cloneWorkflowDocument(graph);
        if (!checked.ok) continue;
        const entry = { id: checked.data.id, name: checked.data.name || 'Example companion', graph: checked.data, workspaceViews: null, original: structuredClone(checked.data) };
        value.migrationRecovery.push(entry); retained.push(entry);
    }
    if (retained.length) save();
    return retained;
}

/** An empty current authoring document; terminals and connections are explicit. */
export function blankGraph(name = 'Untitled', phase = 'unified') {
    return { id: uid('g'), name, description: '', schema: 3, runtime: 2, mode: phase === 'unified' ? 'native-unified' : phase === 'post' ? 'native-post' : 'native-pre', createdAt: Date.now(), updatedAt: Date.now(), nodes: {}, wires: {}, portals: {}, definitions: {}, groups: {}, roles: {}, view: { x: 0, y: 0, zoom: 1 } };
}
export function createGraph(name, phase = 'unified') {
    const graph = blankGraph(name || 'Untitled', phase);
    if (phase === 'unified') { const starter = starterGraph('unified-basic'); Object.assign(graph, { nodes: starter.nodes, wires: starter.wires }); }
    return graph;
}

const touchListeners = shared.touchListeners ??= new Set();
export function syncGroupMembers(graph) {
    for (const group of Object.values(graph?.groups ?? {})) {
        if (!Array.isArray(group.members)) continue;
        const members = Object.values(graph.nodes).filter(node => node.inGroup === group.id).map(node => node.id);
        group.members = members;
    }
}
export function onGraphTouched(fn) { touchListeners.add(fn); return () => touchListeners.delete(fn); }
export function touchGraph(graph) {
    if (!graph) return; syncGroupMembers(graph); graph.updatedAt = Date.now(); save();
    for (const fn of touchListeners) safe(() => fn(graph));
}
function finishGraphDocumentEdit(graph, summary, hooks) {
    if (summary.semanticChanged) safe(() => hooks.onSemanticChange?.(graph, summary));
    safe(() => hooks.reconcileViews?.(graph, summary));
    const property = Object.getOwnPropertyDescriptor(graph, 'updatedAt');
    if (property?.writable || !property && Object.isExtensible(graph)) graph.updatedAt = Date.now();
    save();
    for (const fn of touchListeners) safe(() => fn(graph, { history: false, semanticChanged: summary.semanticChanged }));
}
export function commitGraphEdit(graph, prepared, hooks = {}) {
    const result = commitPreparedGraph(graph, prepared);
    if (result.ok && result.data.changed) finishGraphDocumentEdit(graph, result.data, hooks);
    return result;
}
export function stepGraphHistory(graph, direction, hooks = {}) {
    if (!['undo', 'redo'].includes(direction)) return { ok: false, error: { code: 'INVALID_HISTORY_ACTION', message: 'Choose Undo or Redo.' } };
    const before = graphEditSignature(graph), label = graphHistory[direction](graph);
    const summary = { changed: !!label, semanticChanged: !!label && before !== graphEditSignature(graph), rootId: graph.id, label };
    if (summary.changed) finishGraphDocumentEdit(graph, summary, hooks);
    return { ok: true, data: summary };
}

/** Groups are presentation only; executable interfaces belong to subgraphs. */
export function groupMembers(graph, id) { return Object.values(graph.nodes).filter(node => node.inGroup === id); }
export function groupOf(graph, node) { return node?.inGroup ? graph.groups?.[node.inGroup] ?? null : null; }
export function groupNodes(graph, ids, title = 'Group') {
    const members = ids.map(id => graph.nodes[id]).filter(Boolean); if (members.length < 2) return null;
    const x = Math.min(...members.map(node => node.x)), y = Math.min(...members.map(node => node.y));
    const group = { id: uid('grp'), title, collapsed: true, x, y, w: 180, frame: { x: x - 20, y: y - 40, w: Math.max(...members.map(node => node.x + 180)) - x + 40, h: Math.max(...members.map(node => node.y + 80)) - y + 60 } };
    graph.groups ??= {}; graph.groups[group.id] = group;
    for (const node of members) node.inGroup = group.id;
    touchGraph(graph); return group;
}
export function createBlanket(graph, x, y, { w = 560, h = 340, title = 'Group' } = {}) {
    const group = { id: uid('grp'), title, collapsed: false, x: Math.round(x), y: Math.round(y), w: 180, frame: { x: Math.round(x), y: Math.round(y), w, h } };
    graph.groups ??= {}; graph.groups[group.id] = group; touchGraph(graph); return group;
}
export function ungroup(graph, id) {
    for (const node of groupMembers(graph, id)) delete node.inGroup;
    delete graph.groups[id]; touchGraph(graph);
}

export function exportGraph(graph = activeWorkflow()) { return graph ? JSON.stringify(exportWorkflow(graph)) : null; }
export function importGraph(json) {
    const parsed = parseWorkflow(json);
    if (!parsed.ok) return { ...parsed, reason: parsed.error.message };
    const graph = structuredClone(parsed.data); graph.id = uid('g');
    graph.name ||= 'Imported'; graph.createdAt = graph.updatedAt = Date.now();
    return { ok: true, graph };
}
