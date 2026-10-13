/** Current Lattice documents and settings. SillyTavern owns its normal prompt. */
import { starterGraph } from './workflow/starters.js?v=0.27.2';
import { exportWorkflow, parseWorkflow } from './workflow/packages.js?v=0.27.2';
import { safeWorkflowData } from './workflow/contracts.js?v=0.27.2';
import { cloneWorkflowDocument } from './workflow/document.js?v=0.27.2';
import { serializeWorkflowDocument } from './workflow/document-file.js?v=0.27.2';
import { createWorkflowDocumentSession } from './ui/document-session.js?v=0.27.2';
import { commitPreparedGraph, graphEditSignature, committedGraphChange } from './workflow/transactions.js?v=0.27.2';
import * as graphHistory from './history.js?v=0.27.2';
import { definitionRefKey } from './workflow/definition-data.js?v=0.27.2';
import { containsRetiredModelCall, cloneArchivedWorkflow, retiredLibraryKeys, recoveryLibraryKeys, portableArchivedWorkflow, portableArchivedDefinition } from './workflow/retired-workflows.js?v=0.27.2';

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

/** Preserve sparse historical entries without reading accessors or cloning originals. */
function recoveryArray(value) {
    try {
        if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
        const descriptors = Object.getOwnPropertyDescriptors(value), length = descriptors.length.value;
        const result = new Array(length);
        for (const key of Reflect.ownKeys(descriptors)) {
            if (key === 'length') continue;
            const descriptor = descriptors[key], index = typeof key === 'string' ? Number(key) : NaN;
            if (typeof key !== 'string' || !Number.isInteger(index) || index < 0 || index >= length || String(index) !== key || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
            Object.defineProperty(result, key, { value: descriptor.value, enumerable: true, writable: true, configurable: true });
        }
        return result;
    } catch { return null; }
}

function legacyRecord(value) {
    try {
        if (!plain(value)) return null;
        return Object.getOwnPropertyDescriptors(value);
    } catch { return null; }
}

function checkSettings(value) {
    const saved = dataRecord(value), metadata = {}, library = dataRecord(saved?.subgraphLibrary);
    if (saved) for (const [key, item] of Object.entries(saved)) if (!['graphs', 'activeGraphId', 'nativeBindings', 'subgraphLibrary', 'workspaceViews', 'migrationRecovery', 'recoveryDraft', 'archivedWorkflows'].includes(key)) metadata[key] = item;
    if (!saved || !safeWorkflowData(metadata) || ![1, 2].includes(saved.schema) || typeof saved.enabled !== 'boolean' || !plain(saved.ui) || !library || !checkRegistry(library.definitions ?? {}) || !safeWorkflowData(Object.fromEntries(Object.entries(library).filter(([key]) => key !== 'definitions')))) throw new Error('Lattice settings must contain plain-data preferences and a current reusable subgraph shelf.');
    if (Object.hasOwn(saved, 'workflowMode')) throw new Error('Lattice settings contain an unsupported workflow mode.');
    if (saved.schema === 2 && !recoveryArray(saved.migrationRecovery)) throw new Error('Lattice migration recovery must remain independently enumerable.');
    checkArchivedWorkflows(saved.archivedWorkflows);
    return saved;
}

function checkArchivedWorkflows(value) {
    if (value === undefined) return;
    const archive = dataRecord(value), graphs = dataRecord(archive?.graphs);
    if (!archive || archive.schema !== 1 || !graphs || !checkRegistry(archive.definitions ?? {}) || !safeWorkflowData(Object.fromEntries(Object.entries(archive).filter(([key]) => !['graphs', 'definitions'].includes(key)))) || Object.keys(archive).some(key => !['schema', 'graphs', 'bindings', 'activeGraphId', 'definitions', 'entries'].includes(key))) throw new Error('Lattice archived workflows must be bounded plain data.');
    for (const [id, graph] of Object.entries(graphs)) {
        const checked = cloneArchivedWorkflow(graph);
        if (!checked.ok || checked.data.id !== id) throw new Error('Lattice archived workflow ' + id + ' is invalid.');
    }
}

/** Read old authoring entries independently; originals remain available even when unreadable. */
function migrateSettings(value, saved) {
    if (saved.schema !== 1) return applySettings(value, prepareFastRetirement(saved));
    const graphs = legacyRecord(saved.graphs), views = legacyRecord(saved.workspaceViews ?? {}), recovery = [], retired = [];
    if (!graphs) recovery.push({ id: 'legacy-workflow-data', name: 'Previous workflow data', issue: 'The previous workflow registry is unreadable.', original: saved.graphs });
    else for (const id of Reflect.ownKeys(graphs)) {
        const descriptor = graphs[id];
        if (typeof id !== 'string' || !safeWorkflowData({ [id]: null }) || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
            recovery.push({ id: typeof id === 'string' ? id : 'legacy-workflow-data-' + recovery.length, name: 'Unreadable previous workflow', issue: 'The previous workflow entry is not plain document data.', original: saved.graphs });
            continue;
        }
        const original = descriptor.value;
        const fast = containsRetiredModelCall(original);
        const checked = fast ? cloneArchivedWorkflow(original) : cloneWorkflowDocument(original), entry = { id, name: safe(() => Object.getOwnPropertyDescriptor(original, 'name')?.value, id), original };
        if (typeof entry.name !== 'string' || !entry.name) entry.name = id;
        if (checked.ok && checked.data.id === id && checked.data.mode === 'native-unified' && !fast) entry.graph = checked.data;
        else if (checked.ok && checked.data.id === id) { retired.push([id, original]); entry.issue = 'Retired workflow roots remain available for recovery export only.'; }
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
    const bindings = dataRecord(saved.nativeBindings);
    const selected = recovery.find(entry => entry.id === saved.activeGraphId && entry.graph)
        ?? recovery.find(entry => entry.id === bindings?.workflowGraphId && entry.graph)
        ?? recovery.find(entry => entry.graph);
    const next = { ...saved, schema: 2, migrationRecovery: recovery, recoveryDraft: selected ? { graph: structuredClone(selected.graph), workspaceViews: structuredClone(selected.workspaceViews ?? null) } : null };
    if (!selected) next.enabled = false;
    if (retired.length) {
        const archive = saved.archivedWorkflows ? structuredClone(saved.archivedWorkflows) : { schema: 1, graphs: {}, bindings: { ...bindings }, activeGraphId: saved.activeGraphId ?? null };
        for (const [id, original] of retired) {
            if (Object.hasOwn(archive.graphs, id) && JSON.stringify(archive.graphs[id]) !== JSON.stringify(original)) throw new Error('Lattice archived workflow identity conflicts with an existing original.');
            archive.graphs[id] = structuredClone(original);
        }
        next.archivedWorkflows = archive;
        if (!selected) next.enabled = false;
    }
    for (const field of ['graphs', 'activeGraphId', 'nativeBindings', 'workspaceViews']) delete next[field];
    return applySettings(value, prepareFastRetirement(next));
}

/** Plan cold recovery changes without cloning unreadable historical originals. */
function prepareFastRetirement(saved) {
    let next = saved, archive = saved.archivedWorkflows, recovery = recoveryArray(saved.migrationRecovery);
    const replace = (field, value) => { if (next === saved) next = { ...saved }; next[field] = value; };
    const archiveItem = (field, key, item) => {
        const previous = archive?.[field]?.[key];
        if (previous !== undefined) {
            if (JSON.stringify(previous) !== JSON.stringify(item)) throw new Error('Lattice archived workflow identity conflicts with an existing original.');
            return;
        }
        archive = { ...(archive ?? { schema: 1, graphs: {}, bindings: {}, activeGraphId: null }), [field]: { ...archive?.[field], [key]: structuredClone(item) } };
        replace('archivedWorkflows', archive);
    };
    const retireGraph = graph => {
        if (!containsRetiredModelCall(graph)) return false;
        const checked = cloneArchivedWorkflow(graph);
        if (!checked.ok) return false;
        archiveItem('graphs', checked.data.id, checked.data);
        return true;
    };
    const draft = dataRecord(saved.recoveryDraft);
    if (draft && containsRetiredModelCall(draft.graph)) {
        retireGraph(draft.graph);
        if (!recovery.some(entry => dataRecord(entry)?.original === saved.recoveryDraft)) {
            const ids = new Set(recovery.map(entry => dataRecord(entry)?.id));
            let id = 'retired-recovery-draft', suffix = 1;
            while (ids.has(id)) id = 'retired-recovery-draft-' + suffix++;
            recovery.push({ id, name: draft.graph.name || 'Retired recovery draft', issue: 'Retired model calls remain available for recovery export only.', original: saved.recoveryDraft });
            replace('migrationRecovery', recovery);
        }
        replace('recoveryDraft', null); replace('enabled', false);
    }
    const coldRecovery = recovery.map(entry => {
        const record = dataRecord(entry);
        if (!record) return entry;
        const original = dataRecord(record.original);
        const fast = [record.graph, original?.graph, record.original].map(retireGraph).some(Boolean);
        if (!fast || !Object.hasOwn(record, 'graph')) return entry;
        const cold = { ...record, issue: 'Retired model calls remain available for recovery export only.' };
        delete cold.graph; delete cold.workspaceViews;
        return cold;
    });
    if (coldRecovery.some((entry, index) => entry !== recovery[index])) replace('migrationRecovery', coldRecovery);
    const library = saved.subgraphLibrary, definitions = library.definitions ?? {}, retired = retiredLibraryKeys(definitions);
    if (retired.size) {
        const live = { ...definitions }, entries = { ...(library.entries ?? {}) };
        for (const key of recoveryLibraryKeys(definitions, retired)) archiveItem('definitions', key, definitions[key]);
        for (const key of retired) delete live[key];
        for (const [id, ref] of Object.entries(entries)) if (retired.has(definitionRefKey(ref))) { archiveItem('entries', id, ref); delete entries[id]; }
        replace('subgraphLibrary', { ...library, definitions: live, ...(library.entries ? { entries } : {}) });
    }
    return next;
}

/** Validate every changed property before applying any migration or owning a document. */
function applySettings(value, next) {
    checkSettings(next);
    const changed = [...new Set([...Object.keys(value), ...Object.keys(next)])].filter(field => Object.hasOwn(value, field) !== Object.hasOwn(next, field) || value[field] !== next[field]);
    const writable = new Set(changed);
    if (shared.owner !== value) {
        // Ownership persists a new recovery envelope even for an unchanged draft.
        writable.add('recoveryDraft');
        const recovered = dataRecord(next.recoveryDraft), checked = recovered && admitActiveDocument(recovered.graph);
        if (checked?.error?.code === 'WRONG_PHASE') writable.add('enabled');
        if (next.recoveryDraft && !checked?.ok || checked?.ok && recovered.workspaceViews != null && !serializeWorkflowDocument(checked.data, recovered.workspaceViews).ok) {
            writable.add('migrationRecovery');
            if (!Object.isExtensible(next.migrationRecovery) || Object.getOwnPropertyDescriptor(next.migrationRecovery, 'length')?.writable !== true) throw new Error('Lattice settings are read-only; previous workflows were not changed.');
        }
    }
    for (const field of writable) {
        const descriptor = Object.getOwnPropertyDescriptor(value, field);
        if (Object.hasOwn(next, field) ? (descriptor ? descriptor.writable !== true : !Object.isExtensible(value)) : descriptor?.configurable !== true || descriptor?.writable !== true) throw new Error('Lattice settings are read-only; previous workflows were not changed.');
    }
    for (const field of changed) if (!Object.hasOwn(next, field)) delete value[field]; else value[field] = next[field];
    return changed.length > 0;
}

function ownDocument(value, host) {
    if (shared.owner === value) return;
    const original = value.recoveryDraft, recovered = dataRecord(original), checked = recovered && admitActiveDocument(recovered.graph);
    if (checked?.error?.code === 'WRONG_PHASE') value.enabled = false;
    if (shared.owner) flushRecovery();
    shared.owner = value;
    shared.recoveryPending = false; shared.settingsSavePending = false; shared.settingsSaveTicket = null;
    // Keep the admitted host boundary: replacement contexts cannot save this owner.
    const saver = host.saveSettingsDebounced;
    shared.ownerBoundary = () => saver.call(host);
    if (recovered && !checked?.ok) value.migrationRecovery.push({ id: 'previous-recovery-draft', name: 'Previous recovery draft', issue: checked?.error?.message ?? 'The previous recovery draft is unreadable.', original: recovered });
    let workspaceViews = checked?.ok ? recovered.workspaceViews ?? null : null;
    if (checked?.ok && workspaceViews !== null && !serializeWorkflowDocument(checked.data, workspaceViews).ok) {
        value.migrationRecovery.push({ id: 'previous-recovery-presentation', name: checked.data.name || 'Previous recovery draft', graph: structuredClone(checked.data), workspaceViews: null, original, originalWorkspaceViews: workspaceViews, issue: 'The previous recovery draft workspace presentation is unreadable.' });
        workspaceViews = null;
    }
    if (original && !recovered) value.migrationRecovery.push({ id: 'previous-recovery-draft', name: 'Previous recovery draft', original, issue: 'The previous recovery draft is unreadable.' });
    activateDocument(checked?.ok ? checked.data : starterGraph('unified-basic'), { source: checked?.ok ? { kind: 'recovery', name: checked.data.name || 'Recovered workflow' } : null, workspaceViews }, { ownerReplacement: true });
}

/** Admit saved settings once; camera projections never repeat domain validation. */
export function settings() {
    const c = ctx(), root = c.extensionSettings ?? c.extension_settings;
    if (!plain(root)) throw new Error('Lattice: getContext() exposed no extension settings.');
    const property = Object.getOwnPropertyDescriptor(root, MODULE);
    if (!property) {
        const value = { schema: 2, enabled: false, subgraphLibrary: { definitions: {} }, ui: {}, migrationRecovery: [], recoveryDraft: null };
        checkSettings(value);
        root[MODULE] = value; admitted.add(value); ownDocument(value, c);
        return value;
    }
    if (!('value' in property)) throw new Error('Lattice settings must not contain an accessor.');
    const value = property.value;
    let migrated = false;
    if (!admitted.has(value)) { const saved = checkSettings(value); migrated = migrateSettings(value, saved); admitted.add(value); }
    ownDocument(value, c);
    if (migrated) save({ recovery: false });
    return value;
}
shared.recoveryBatchDepth ??= 0;
shared.recoveryPending ??= false;
shared.settingsSavePending ??= false;
shared.pendingRecoveryTickets ??= new Map();
shared.recoveryIssueListeners ??= new Set();
const recoveryIssue = (code, message) => ({ ok: false, error: { code, message } });
function reportRecovery(result, onIssue) {
    if (!result.ok) {
        safe(() => onIssue?.(result.error));
        for (const listener of shared.recoveryIssueListeners) safe(() => listener(result.error));
    }
    return result;
}
export function onRecoveryIssue(listener) { shared.recoveryIssueListeners.add(listener); return () => shared.recoveryIssueListeners.delete(listener); }
function recoveryTicket() {
    const captured = documentSession.capture();
    if (!shared.owner || !captured) return null;
    if (shared.recoveryTicket?.owner === shared.owner && shared.recoveryTicket.captured === captured) return shared.recoveryTicket;
    const previous = shared.pendingRecoveryTickets.get(shared.owner);
    return shared.recoveryTicket = {
        owner: shared.owner, captured, graph: captured.graph,
        workspaceViews: documentSession.workspaceViews(), boundary: shared.ownerBoundary,
        recoveryPending: false, savePending: previous?.savePending ?? false, payload: null,
    };
}
function retainTicket(ticket) { shared.pendingRecoveryTickets.set(ticket.owner, ticket); }
function releaseTicket(ticket) {
    if (!ticket.recoveryPending && !ticket.savePending && shared.pendingRecoveryTickets.get(ticket.owner) === ticket) shared.pendingRecoveryTickets.delete(ticket.owner);
}
function publishRecovery(ticket, checkedArtifacts, { retry = false } = {}) {
    ticket.recoveryPending = true; retainTicket(ticket);
    if (!retry || !ticket.payload) {
        const encoded = serializeWorkflowDocument(ticket.graph, ticket.workspaceViews, { checkedArtifacts });
        if (!encoded.ok) { ticket.payload = null; return encoded; }
        const envelope = encoded.data.recovery ?? JSON.parse(encoded.data.json);
        ticket.payload = { graph: envelope.graph, workspaceViews: envelope.workspaceViews ?? null };
    }
    try { ticket.owner.recoveryDraft = ticket.payload; }
    catch { return recoveryIssue('RECOVERY_WRITE', 'The workflow recovery draft could not be stored.'); }
    ticket.recoveryPending = false; releaseTicket(ticket);
    return { ok: true, data: ticket.payload };
}
function submitRecovery(ticket) {
    if (!ticket) return { ok: true, data: null };
    ticket.savePending = true; retainTicket(ticket);
    try { ticket.boundary(); }
    catch { return recoveryIssue('HOST_SAVE', 'The workflow recovery settings could not be submitted to the host. Pending recovery is retained for retry.'); }
    // A successful submission of the old envelope cannot discharge a failed new publication.
    ticket.savePending = ticket.recoveryPending; releaseTicket(ticket);
    return { ok: true, data: { submitted: true } };
}
function persistRecovery(checkedArtifacts, { immediate = false } = {}) {
    if (shared.recoveryBatchDepth && !immediate) { shared.recoveryPending = true; return { ok: true, data: { deferred: true } }; }
    const ticket = recoveryTicket();
    if (!ticket) return { ok: true, data: null };
    ticket.workspaceViews = documentSession.workspaceViews?.() ?? documentSession.capture()?.workspaceViews ?? null;
    const result = publishRecovery(ticket, checkedArtifacts);
    shared.recoveryPending = !result.ok;
    return result;
}
/** Synchronous owner-qualified submission; the host debounce provides no disk acknowledgment. */
export function flushRecovery({ owner = shared.owner, captured = documentSession.capture(), onRecoveryIssue: onIssue } = {}) {
    if (!owner || !captured) return { ok: true, data: null };
    if (owner !== shared.owner || !documentSession.stillCurrent(captured)) return recoveryIssue('STALE_RECOVERY', 'The recovery request belongs to a replaced workflow document.');
    const result = persistRecovery(undefined, { immediate: true });
    const ticket = recoveryTicket(), submission = submitRecovery(ticket);
    shared.settingsSavePending = ticket?.savePending ?? !submission.ok;
    return reportRecovery(result.ok ? submission.ok ? result : submission : result, onIssue);
}
/** Retry captured work without consulting a replacement context or its active document. */
export function retryPendingRecovery({ onRecoveryIssue: onIssue } = {}) {
    let result = { ok: true, data: null };
    for (const ticket of [...shared.pendingRecoveryTickets.values()]) {
        const recovery = ticket.recoveryPending ? publishRecovery(ticket, undefined, { retry: true }) : { ok: true, data: ticket.payload };
        const submission = ticket.savePending ? submitRecovery(ticket) : { ok: true, data: null };
        const attempted = recovery.ok ? submission : recovery;
        if (!attempted.ok) { reportRecovery(attempted, onIssue); if (result.ok) result = attempted; }
        if (ticket.owner === shared.owner && documentSession.stillCurrent(ticket.captured)) {
            shared.recoveryPending = ticket.recoveryPending; shared.settingsSavePending = ticket.savePending;
        }
    }
    return result;
}
export function save({ recovery = true, onRecoveryIssue: onIssue } = {}) {
    const host = ctx(), owner = (host.extensionSettings ?? host.extension_settings)?.[MODULE];
    // Legacy/preference callers can submit before admitting an active document.
    // Their new synchronous request never serializes a different owner's graph.
    const ownsDocument = owner === shared.owner, saver = host.saveSettingsDebounced;
    const ticket = ownsDocument ? recoveryTicket() : { owner, captured: null, boundary: () => saver.call(host), recoveryPending: false, savePending: false, payload: null };
    const result = recovery && ownsDocument ? persistRecovery() : { ok: true, data: null };
    if (shared.recoveryBatchDepth) { shared.settingsSavePending = true; shared.settingsSaveTicket = ticket; return result; }
    const submission = submitRecovery(ticket);
    shared.settingsSavePending = ticket?.savePending ?? !submission.ok;
    return reportRecovery(result.ok ? submission.ok ? result : submission : result, onIssue);
}
function finishRecoveryBatch(checkedArtifacts) {
    if (--shared.recoveryBatchDepth) return { ok: true, data: null };
    const result = shared.recoveryPending ? persistRecovery(checkedArtifacts) : { ok: true, data: null };
    const ticket = shared.settingsSaveTicket ?? recoveryTicket();
    const submission = shared.settingsSavePending ? submitRecovery(ticket) : { ok: true, data: null };
    shared.settingsSavePending = ticket?.savePending ?? !submission.ok;
    if (!shared.settingsSavePending) shared.settingsSaveTicket = null;
    return reportRecovery(result.ok ? submission.ok ? result : submission : result);
}
if (!shared.pagehideListener && typeof globalThis.addEventListener === 'function') {
    shared.pagehideListener = () => flushRecovery();
    globalThis.addEventListener('pagehide', shared.pagehideListener);
}

function admitActiveDocument(graph) {
    const checked = cloneWorkflowDocument(graph);
    if (!checked.ok) return checked;
    return checked.data.mode === 'native-unified' ? checked : { ok: false, error: { code: 'WRONG_PHASE', message: 'Active workflow documents require a unified root. Retired originals are recovery data only.' } };
}

function activateDocument(graph, options = {}, { ownerReplacement = false } = {}) {
    const checked = admitActiveDocument(graph);
    if (!checked.ok) return checked;
    const previous = documentSession.current();
    if (previous) {
        if (!ownerReplacement) flushRecovery({ onRecoveryIssue: options.onRecoveryIssue });
        graphHistory.dispose(previous);
    }
    graphHistory.reset(graph);
    const token = documentSession.activate(graph, options);
    reportRecovery(persistRecovery(), options.onRecoveryIssue);
    const event = { graph, previous, token };
    for (const listener of activationListeners) safe(() => listener(event));
    safe(() => globalThis.document?.dispatchEvent(new CustomEvent('pc-document-activated', { detail: event })));
    return token;
}
export function activeWorkflow() { settings(); return documentSession.current(); }
export function activateWorkflow(graph, options = {}) { const checked = admitActiveDocument(graph); if (!checked.ok) return checked; settings(); return activateDocument(graph, options); }
export function onWorkflowActivated(listener) { activationListeners.add(listener); return () => activationListeners.delete(listener); }
export function activeWorkspaceViews() { settings(); return documentSession.workspaceViews?.() ?? documentSession.capture()?.workspaceViews ?? null; }
export function setActiveWorkspaceViews(data, { onRecoveryIssue } = {}) { settings(); documentSession.workspaceViews(data); reportRecovery(persistRecovery(), onRecoveryIssue); return data; }
export function recoveredWorkflows() { return settings().migrationRecovery.slice(); }
/** Retain successful example companions as recovery choices, never as recent files. */
export function retainRecoveryWorkflows(graphs) {
    const value = settings(), retained = [];
    for (const graph of graphs) {
        const checked = admitActiveDocument(graph);
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
    const checkedArtifacts = committedGraphChange(graph, summary)?.artifacts;
    shared.recoveryBatchDepth++;
    let recovery;
    try {
        if (summary.semanticChanged) safe(() => hooks.onSemanticChange?.(graph, summary));
        safe(() => hooks.reconcileViews?.(graph, summary));
        const property = Object.getOwnPropertyDescriptor(graph, 'updatedAt');
        if (property?.writable || !property && Object.isExtensible(graph)) graph.updatedAt = Date.now();
        save();
    } finally {
        try { recovery = finishRecoveryBatch(checkedArtifacts); }
        finally {
            if (recovery && !recovery.ok) safe(() => hooks.onRecoveryIssue?.(recovery.error));
            // The authored edit is already accepted, even if a host boundary throws.
            for (const fn of touchListeners) safe(() => fn(graph, { history: false, semanticChanged: summary.semanticChanged }));
        }
    }
    return recovery;
}
export function commitGraphEdit(graph, prepared, hooks = {}) {
    const result = commitPreparedGraph(graph, prepared);
    if (result.ok && result.data.changed) {
        const recovery = finishGraphDocumentEdit(graph, result.data, hooks);
        if (!recovery.ok) return { ...result, recovery };
    }
    return result;
}

export function stepGraphHistory(graph, direction, hooks = {}) {
    if (!['undo', 'redo'].includes(direction)) return { ok: false, error: { code: 'INVALID_HISTORY_ACTION', message: 'Choose Undo or Redo.' } };
    const before = graphEditSignature(graph), label = graphHistory[direction](graph);
    const summary = { changed: !!label, semanticChanged: !!label && before !== graphEditSignature(graph), rootId: graph.id, label };
    const recovery = summary.changed ? finishGraphDocumentEdit(graph, summary, hooks) : null;
    return { ok: true, data: summary, ...(recovery && !recovery.ok ? { recovery } : {}) };
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
/** Recovery download only; retired documents never become executable imports. */
export function exportArchivedWorkflows() {
    const current = settings(), archive = current.archivedWorkflows;
    if (!archive || (!Object.keys(archive.graphs).length && !Object.keys(archive.definitions ?? {}).length)) return null;
    const snapshots = { ...current.subgraphLibrary.definitions, ...archive.definitions };
    return JSON.stringify({ kind: 'lattice-workflow-archive', ...archive,
        graphs: Object.fromEntries(Object.entries(archive.graphs).map(([id, graph]) => [id, portableArchivedWorkflow(graph)])),
        ...(archive.definitions ? { definitions: Object.fromEntries(Object.entries(archive.definitions).map(([key, definition]) => [key, portableArchivedDefinition(definition, snapshots)])) } : {}) });
}
export function importGraph(json) {
    const parsed = parseWorkflow(json);
    if (!parsed.ok) return { ...parsed, reason: parsed.error.message };
    const graph = structuredClone(parsed.data); graph.id = uid('g');
    graph.name ||= 'Imported'; graph.createdAt = graph.updatedAt = Date.now();
    return { ok: true, graph };
}
