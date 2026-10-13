import { prepareGraphArtifacts } from '../workflow/graph-artifacts.js?v=0.27.3';
import { prepareWorkflowPlanner, preparedWorkflowExpansion } from '../workflow/resolve.js?v=0.27.3';
import { cloneWorkflowDocument } from '../workflow/document.js?v=0.27.3';
import { sha256Text } from '../workflow/definition-data.js?v=0.27.3';
import { prepareCompositionViews } from '../workflow/composition-views.js?v=0.27.3';
import { createRunState, reduceRunState, projectRunRows } from '../workflow/run-state.js?v=0.27.3';
import { projectRecordedPreview } from './recorded-preview.js?v=0.27.3';
import { addressKey, nodeAddress, targetAddress, own, plain, safeBinding, safeError, expandRecordAddress, freeze } from '../workflow/record-data.js?v=0.27.3';
import { workflowSignature } from '../workflow/runtime.js?v=0.27.3';
import { FAMILIES, OPERATIONS, operationFor, phaseForNode } from '../workflow/catalog.js?v=0.27.3';
import { safeWorkflowData } from '../workflow/contracts.js?v=0.27.3';
import { readNodePresentation } from './node-palette.js?v=0.27.3';
import { prepareNodeProfileOptions } from './node-profile-preparation.js?v=0.27.3';
import { presentDiagnostic, presentDiagnostics, diagnosticText } from './diagnostics.js?v=0.27.3';
const descriptions = { Input: 'Bring material into a workflow.', Shaping: 'Change the plan or amount of material.', Surface: 'Refine expression.', Transpose: 'Apply a reference’s qualities.', Derive: 'Extract findings from a source.', Introspection: 'Reflect on experience, context and actor state.', Output: 'Inspect or commit an artifact.' };
export const QUOTE_SCOPE_HELP = 'Dialogue is text inside paired ASCII double quotes (") or paired curly double quotes (“…”). Narration is text outside those paired quotes, excluding the quote delimiters. Apostrophes and single quotes are ordinary text.';
// Content/host preparation owns expensive work. Selection projects cached plain data.
const projections = new WeakMap();
const historicalPreviews = new WeakMap();
const recordedSections = new WeakMap();
const noRows = freeze([]);
const noPreview = freeze({ source: projectRecordedPreview(undefined).source, sections: noRows });
const pathKey = path => JSON.stringify(path);
const targetKey = target => target?.kind === 'terminal' ? 'terminal:' + addressKey(target.address) : addressKey(target) + ':' + target.portId;
const ownedPreviewTarget = raw => { const target = targetAddress(raw); return target ? freeze(target) : null; };
/** Consequence review exposes receipt status, never staged data or private capabilities. */
function safeSettlement(raw) {
    if (!plain(raw) || !['settled','partial','save-unverified'].includes(own(raw,'status')) || own(raw,'published') !== true) return null;
    const source = own(raw,'receipts');
    if (!Array.isArray(source) || source.length > 256) return null;
    const receipts = [];
    for (const item of source) {
        if (!plain(item)) return null;
        const intentId = own(item,'intentId'), targetId = own(item,'targetId'), status = own(item,'status');
        if (typeof intentId !== 'string' || !intentId || intentId.length > 512 || typeof targetId !== 'string' || !targetId || targetId.length > 512 || !['ready','confirmed','unchanged','failed','unknown','save-unverified'].includes(status)) return null;
        const error = safeError(own(item,'error'));
        receipts.push(freeze({intentId,targetId,status,...(error ? {error} : {})}));
    }
    return freeze({status:own(raw,'status'),published:true,receipts});
}
const summaryView = result => result.ok ? { callBound: result.data.callBound, issues: [], diagnostics: [], requiresNativeGeneration: result.data.requiresNativeGeneration === true, requiredBindingAddresses: result.data.requiredBindingAddresses } : { callBound: 0, issues: [result.error.message], diagnostics: presentDiagnostics([result.error]), requiresNativeGeneration: false, requiredBindingAddresses: [] };
const emptyView = message => ({ graphId: '', name: '', phase: '', profiles: [], families: [], nodes: [], groups: [], selectedId: null, callBound: 0, issues: [message], diagnostics: presentDiagnostics([message]), busy: false, status: '', result: null, quoteHelp: QUOTE_SCOPE_HELP, rows: [], targets: [] });
// Keep a fixed digest, never the semantic signature's saved controls/body text.
function rememberRecordingRevision(recording, revision) {
    if (recording && typeof recording === 'object' && typeof revision === 'string' && !historicalPreviews.has(recording)) historicalPreviews.set(recording, { revision: sha256Text(revision), aliases: null });
}
function prepareRecordedAliases(root, recording, workflowId, aliases) {
    const history = historicalPreviews.get(recording);
    if (!history || history.aliases || recording.identities.strings[recording.plan.workflowId] !== workflowId) return;
    if (history.revision === sha256Text(workflowSignature(root))) history.aliases = new Map(aliases);
}
function recordedTarget(recording, target) {
    const address = expandRecordAddress(recording, own(target, 'address')); if (!address) return null;
    if (own(target, 'kind') === 'terminal') return { kind: 'terminal', address };
    const portId = own(recording.identities.strings, String(own(target, 'port')));
    return typeof portId === 'string' ? { ...address, portId } : null;
}
function recordedPrimitiveTarget(recording, target) {
    if (target.kind === 'terminal') return recording.terminals.some(item => { const address = expandRecordAddress(recording, item.address); return address && addressKey(address) === addressKey(target.address); });
    return recording.units.some(unit => { const address = expandRecordAddress(recording, unit.address); return address && addressKey(address) === addressKey(target) && unit.ports.some(port => port.direction === 'output' && recording.identities.strings[port.port] === target.portId); });
}
function historicalPreviewTarget(recording, target) {
    if (!recording || !target) return { target: null, unavailable: false };
    if (recordedPrimitiveTarget(recording, target)) return { target: ownedPreviewTarget(target), unavailable: false };
    const requested = recordedTarget(recording, recording.plan.target), resolved = recordedTarget(recording, recording.plan.resolvedTarget);
    if (requested && targetKey(requested) === targetKey(target) && resolved && recordedPrimitiveTarget(recording, resolved)) return { target: ownedPreviewTarget(resolved), unavailable: false };
    const canonical = historicalPreviews.get(recording)?.aliases?.get(targetKey(target));
    return canonical && recordedPrimitiveTarget(recording, canonical) ? { target: ownedPreviewTarget(canonical), unavailable: false } : { target: null, unavailable: true };
}
function safeHandle(raw) {
    const terminal = targetAddress(own(raw, 'terminal')), handleId = own(raw, 'handleId'), runId = own(raw, 'runId');
    return terminal?.kind === 'terminal' && typeof handleId === 'string' && handleId && typeof runId === 'string' && runId ? freeze({ handleId, runId, terminal }) : null;
}
function baseWorkflowView(graph, profiles, settings, activeModel = null) {
    const phase = typeof graph.mode === 'string' ? graph.mode.slice(7) : '';
    return { graphId: graph.id || '', name: graph.name || '', phase, enabled: settings.enabled === true,
        profiles: prepareNodeProfileOptions(profiles, activeModel).map(({ value, label, ...metadata }) => ({ id: value, name: label, ...metadata })),
        families: FAMILIES.map(name => ({ name, description: descriptions[name], operations: Object.values(OPERATIONS).filter(op => op.family === name || name === 'Surface' && ['pattern', 'validate-patches'].includes(op.id)).map(op => ({ id: op.id, title: op.title, phase: op.phase === 'both' ? phase : op.phase || phase, compatible: !op.minimumSchema || graph.schema >= op.minimumSchema })) })),
        quoteHelp: QUOTE_SCOPE_HELP };
}
/** Root preparation boundary. The returned token is branded and contains no public authority. */
export function prepareWorkflowProjection(root, { planner, profiles = [], activeModel = null, workflowData = null, settings = {}, result = null, resolveBinding, candidateStatus } = {}) {
    const token = Object.freeze({});
    const reject = (issue, base = {}) => { const message = typeof issue === 'string' ? issue : issue.message; projections.set(token, { failure: { ...emptyView(message), ...base, issues: [message], diagnostics: presentDiagnostics([issue]) }, result }); return token; };
    if (planner !== undefined) {
        const brand = preparedWorkflowExpansion(root, planner);
        if (!brand.ok) return reject(brand.error);
    }
    // A historical planner proves ownership, not current raw content. Admit the
    // current document once, then share that verified expansion with its clone.
    const artifacts = prepareGraphArtifacts(root);
    if (!artifacts.ok) return reject(artifacts.error);
    const cloned = cloneWorkflowDocument(root, { checkedArtifacts: artifacts.data });
    if (!cloned.ok) return reject(cloned.error);
    const graph = cloned.data;
    const prepared = planner === undefined ? prepareWorkflowPlanner(root, artifacts.data) : { ok: true, data: planner };
    if (!prepared.ok) return reject(prepared.error, baseWorkflowView(graph, profiles, settings, activeModel));
    planner = prepared.data;
    const composition = prepareCompositionViews(root, planner);
    if (!composition.ok) return reject(composition.error, baseWorkflowView(graph, profiles, settings, activeModel));
    const inventory = planner.inventory, bindings = new Map(), boundIssues = new Map(), boundDiagnostics = new Map();
    // Effective materialized model overrides are explicit; inherited definitions cannot re-read root roles.
    for (const unit of inventory.primitives) if (unit.requestBound > 0) {
        let resolution;
        const bindingGraph = { schema: 3, runtime: 2, mode: graph.mode, roles: {} };
        try { resolution = resolveBinding?.(unit.node, bindingGraph); }
        catch { resolution = { ok: false, error: { message: 'Connection preparation failed.' } }; }
        const binding = resolution?.ok ? safeBinding(resolution.data) : null;
        bindings.set(addressKey(unit.address), binding || {});
        if (!resolution?.ok && !boundIssues.has(addressKey(unit.address))) {
            const issue = resolution?.error?.message || 'Bind ' + (unit.node.modelRole || 'model') + ' to an available connection before running.';
            boundIssues.set(addressKey(unit.address), issue);
            boundDiagnostics.set(addressKey(unit.address), presentDiagnostic({ ...resolution?.error, message: issue, address: unit.address }, { operation: unit.node.operation, nodeTitle: readNodePresentation(unit.node).alias || unit.node.title || operationFor(unit.node)?.title }));
        }
    }
    const withBindings = summary => {
        const safe = summaryView(summary), issues = [...safe.issues], diagnostics = [...safe.diagnostics];
        for (const address of safe.requiredBindingAddresses) if (boundIssues.has(addressKey(address))) { issues.push(boundIssues.get(addressKey(address))); diagnostics.push(boundDiagnostics.get(addressKey(address))); }
        return freeze({ ...safe, issues: [...new Set(issues)], diagnostics });
    };
    const rootSummary = withBindings(planner.summarize()), summaries = new Map(), targets = [], previewTargets = new Map(), targetInventory = new Map(), targetsByPath = new Map(), boundaryMappings = new Map();
    for (const pin of inventory.pins) if (pin.direction === 'output') targets.push(pin.address);
    targets.push(...inventory.terminals);
    const checked = preparedWorkflowExpansion(root, planner).data;
    for (const item of checked.boundaryMappings) {
        const instance = targetKey({ ...item.instance, portId: item.portId }), boundary = targetKey(item.boundary);
        if (!boundaryMappings.has(instance)) boundaryMappings.set(instance, item);
        if (!boundaryMappings.has(boundary)) boundaryMappings.set(boundary, item);
    }
    for (const target of targets) {
        const key = targetKey(target); targetInventory.set(key, target);
        const path = pathKey((target.kind === 'terminal' ? target.address : target).instancePath);
        if (!targetsByPath.has(path)) targetsByPath.set(path, []); targetsByPath.get(path).push(target);
        const mapping = target.kind === 'terminal' ? null : boundaryMappings.get(key);
        previewTargets.set(targetKey(target), ownedPreviewTarget(mapping?.source || target));
    }
    prepareRecordedAliases(root, result?.recording, graph.id, previewTargets);
    const units = new Map(inventory.primitives.map(unit => [addressKey(unit.address), unit])), views = new Map();
    for (const view of composition.data.views) {
        const portsByNode = new Map(), groupMembers = new Map(), groupBounds = new Map();
        for (const port of view.ports) { if (!portsByNode.has(port.address.nodeId)) portsByNode.set(port.address.nodeId, []); portsByNode.get(port.address.nodeId).push(port); }
        for (const node of Object.values(view.savedGraph.nodes)) if (node.inGroup) { if (!groupMembers.has(node.inGroup)) groupMembers.set(node.inGroup, []); groupMembers.get(node.inGroup).push(node.id); }
        const nodes = Object.values(view.effectiveNodes).flatMap(node => {
            const address = { workflowId: inventory.workflowId, instancePath: view.instancePath, nodeId: node.id }, unit = units.get(addressKey(address));
            const op = operationFor(node, { phase: unit?.phase ?? phaseForNode(view.savedGraph,node), mode: graph.mode });
            if (!op && node.type !== 'subgraph') return [];
            const binding = bindings.get(addressKey(address)), role = node.modelRole ?? op?.modelRole ?? null;
            const metadata = op || { title: typeof node.title === 'string' && node.title || 'Subgraph', family: 'Subgraphs', phase: inventory.phase, terminal: false, defaults: {} }, presentation = readNodePresentation(node);
            return [{ id: node.id, address, canonicalTitle: metadata.title, ...presentation,
                title: presentation.alias || (typeof node.title === 'string' ? node.title : '') || metadata.title, operation: node.operation || 'subgraph', family: metadata.family, phase: metadata.phase || inventory.phase,
                input: metadata.input || 'snapshot', output: metadata.output || 'host output', terminal: metadata.terminal, modelRole: role,
                profileId: node.profileId || '', model: node.model || '', resolvedModel: binding?.model || '', requestBound: unit?.requestBound ?? 0, enabled: node.enabled !== false,
                issue: boundIssues.get(addressKey(address)) || undefined,
                issueDiagnostic: boundDiagnostics.get(addressKey(address)),
                effective: unit?.requestBound ? [binding?.profileId, binding?.model].filter(Boolean).join(' · ') || boundIssues.get(addressKey(address)) || 'Model connection' : 'No model call',
                ports: portsByNode.get(node.id) ?? [] }];
        });
        for (const node of nodes) { const group = view.savedGraph.nodes[node.id]?.inGroup; if (group) groupBounds.set(group, (groupBounds.get(group) ?? 0) + (units.get(addressKey(node.address))?.requestBound || 0)); }
        const groups = Object.values(view.savedGraph.groups ?? {}).map(group => {
            const members = groupMembers.get(group.id) ?? [];
            return { id: group.id, title: group.title, members, collapsed: group.collapsed,
                callBound: groupBounds.get(group.id) ?? 0 };
        });
        views.set(pathKey(view.instancePath), freeze({ instancePath: view.instancePath, editable: view.editable, nodes, groups, targets: targetsByPath.get(pathKey(view.instancePath)) ?? [] }));
    }
    const handles = new Map();
    const reviewTerminals = inventory.primitives.filter(unit => unit.terminal && unit.enabled !== false && unit.node.enabled !== false && unit.node.operation === 'review-publish').map(unit => ({ kind: 'terminal', address: unit.address }));
    const applyTerminals = new Set(reviewTerminals.map(terminal => addressKey(terminal.address)));
    for (const raw of result?.reviewHandles || []) {
        const handle = safeHandle(raw);
        if (!handle || handle.runId !== result.runId || handle.terminal.address.workflowId !== graph.id || result.mode !== 'root' || !result.ok || !applyTerminals.has(addressKey(handle.terminal.address))) continue;
        const freshness = candidateStatus?.(handle);
        handles.set(handle.handleId, freeze({ handle, issue: freshness?.ok === false ? diagnosticText(freshness.error) : '', diagnostic: freshness?.ok === false ? presentDiagnostic(freshness.error) : null, persistOnly: freshness?.ok === true && freshness.persistOnly === true }));
    }
    projections.set(token, { base: freeze({ ...baseWorkflowView(graph, profiles, settings, activeModel), workflowData, reviewTerminals }), rootSummary, summaries, targetInventory, summarize: target => {
        const summary = withBindings(planner.summarize(target));
        if (!summary.requiresNativeGeneration) return summary;
        const manual = presentDiagnostic({ code: 'MANUAL_NATIVE_TRIGGER_REQUIRED', message: 'This step starts when you send a message. Enable Lattice, then send a message in SillyTavern to run this workflow.' });
        return freeze({ ...summary, issues: [...summary.issues, manual.message], diagnostics: [...summary.diagnostics, manual] });
    }, views, handles, previewTargets, result, rows: new WeakMap() }); return token;
}
function cachedRows(owner, source, viewPath) {
    if (!source || typeof source !== 'object') return noRows;
    let views = owner.rows.get(source); if (!views) { views = new Map(); owner.rows.set(source, views); }
    const key = pathKey(viewPath);
    if (!views.has(key)) views.set(key, projectRunRows(source, viewPath));
    return views.get(key);
}
const progressSource = (recording, runState) => runState && (!recording || runState.runId !== recording.runId || runState.lastSeq > recording.lastSeq) ? runState : recording;
function boundedPreview(recording, target) {
    if (!recording || !target) return noPreview;
    let cache = Object.isFrozen(recording) ? recordedSections.get(recording) : null;
    if (!cache) { cache = new Map(); if (Object.isFrozen(recording)) recordedSections.set(recording, cache); }
    const key = targetKey(target); if (cache.has(key)) return cache.get(key);
    let artifactId = null;
    if (target.kind === 'terminal') {
        const entry = recording.terminals.find(item => {
            const address = expandRecordAddress(recording, item.address); return address && addressKey(address) === addressKey(target.address);
        });
        artifactId = entry?.artifact;
    } else {
        const unit = recording.units.find(item => { const address = expandRecordAddress(recording, item.address); return address && addressKey(address) === addressKey(target); });
        artifactId = unit?.ports.find(port => port.direction === 'output' && recording.identities.strings[port.port] === target.portId)?.artifact;
    }
    const artifact = recording.artifacts.find(item => item.id === artifactId);
    if (!artifact) { cache.set(key, noPreview); return noPreview; }
    const preview = projectRecordedPreview(artifact);
    cache.set(key, preview); return preview;
}
function recordedOutputStatus(recording, target) {
    if (!recording || !target || target.kind === 'terminal') return null;
    const unit = recording.units.find(item => {
        const address = expandRecordAddress(recording, item.address);
        return address && addressKey(address) === addressKey(target);
    });
    return unit?.ports.find(port => port.direction === 'output' && recording.identities.strings[port.port] === target.portId)?.state?.status || null;
}
/** Selection/navigation projection: no resolver, binding, freshness or signature work. */
export function projectPreparedWorkflow(prepared, { viewPath = [], selectedId = null, selectedAddress, selectedTarget, selectedReviewHandle, pinnedPreview, result, recording, runState = null, availability = 'current', preparationError = null, busy = false, status = '', applyIssue = '', applyDiagnostic = null } = {}) {
    const owner = projections.get(prepared);
    if (!owner) return emptyView('Use an actual prepared projection.');
    result ??= owner.result;
    if (owner.failure) return { ...owner.failure, busy, status, result: result ? { kind: 'bounded', ok: result.ok === true, error: result.error?.message || '', ...(result.error ? { errorDiagnostic: presentDiagnostic(result.error) } : {}), actualCalls: result.actualCalls || 0, callBound: 0, ...noPreview, applyAvailable: false, applyIssue: owner.failure.issues[0], tokenMethods: [] } : null };
    recording ??= result?.recording;
    const path = safeWorkflowData(viewPath) && Array.isArray(viewPath) ? pathKey(viewPath) : '', view = owner.views.get(path);
    if (!view) return { ...owner.base, ...emptyView('The selected workflow view is unavailable.'), busy, status };
    const address = nodeAddress(selectedAddress), target = targetAddress(selectedTarget), pinned = targetAddress(pinnedPreview);
    let summary = owner.rootSummary;
    if (target) {
        const key = targetKey(target), actual = owner.targetInventory.get(key);
        if (actual && !owner.summaries.has(key)) owner.summaries.set(key, owner.summarize(actual));
        summary = owner.summaries.get(key) || { callBound: 0, issues: ['Select an actual output or tagged terminal.'], requiredBindingAddresses: [] };
    }
    const selector = safeHandle(selectedReviewHandle), cached = selector ? owner.handles.get(selector.handleId) : null;
    const validHandle = cached && selector.runId === cached.handle.runId && targetKey(selector.terminal) === targetKey(cached.handle.terminal) && target?.kind === 'terminal' && targetKey(target) === targetKey(cached.handle.terminal)
        && result?.mode === 'root' && result?.ok && result.runId === selector.runId && recording?.runId === selector.runId && availability === 'current'
        && (!view.instancePath.length || pathKey(view.instancePath) === pathKey(cached.handle.terminal.address.instancePath));
    const preview = historicalPreviewTarget(recording, pinned || target), displayedTarget = preview.target;
    const content = preview.unavailable ? projectRecordedPreview({ kind: 'diagnostic', format: 'omitted', reason: 'historical wrapper mapping unavailable' }) : boundedPreview(recording, displayedTarget);
    const resultView = result || recording ? { kind: 'bounded', ok: result?.ok === true, error: result?.error?.message || '', actualCalls: result?.actualCalls || 0, callBound: result?.callBound ?? recording?.plan?.callBound ?? summary.callBound,
        runId: recording?.runId || result?.runId || '', ...content, previewTarget: displayedTarget, applyAvailable: !!validHandle,
        selectedReviewHandle: validHandle ? cached.handle : null, persistOnly: !!(validHandle && cached.persistOnly), ...(safeSettlement(result?.settlement) ? {settlement:safeSettlement(result.settlement)} : {}), applyIssue: validHandle ? cached.issue || applyIssue : applyIssue, tokenMethods: [...new Set((recording?.units || []).map(unit => unit.request?.tokenCount?.method).filter(Boolean))] } : null;
    if (resultView && result?.error) resultView.errorDiagnostic = presentDiagnostic({ ...safeError(result.error), ...(nodeAddress(result.error.address) ? { address: nodeAddress(result.error.address) } : {}) });
    if (resultView) resultView.previewStatus = recordedOutputStatus(recording, displayedTarget);
    if (resultView && (cached?.diagnostic || applyDiagnostic)) resultView.applyDiagnostic = cached?.diagnostic || applyDiagnostic;
    const rowSource = progressSource(recording, runState);
    return { ...owner.base, nodes: view.nodes, groups: view.groups, selectedId: address && address.workflowId === owner.base.graphId && pathKey(address.instancePath) === path ? address.nodeId : selectedId,
        instancePath: view.instancePath, editable: view.editable, targets: view.targets, targetSummary: summary, callBound: summary.callBound, issues: summary.issues, diagnostics: summary.diagnostics ?? [],
        busy, status, result: resultView, rows: cachedRows(owner, rowSource, view.instancePath), recording: recording || null, availability, preparationError };
}
function boundedResult(raw, handles) {
    const result = { schema: raw.schema, runtime: raw.runtime, mode: raw.mode, runId: raw.runId, ok: raw.ok === true, callBound: raw.callBound, actualCalls: raw.actualCalls, recording: raw.recording, reviewHandles: handles };
    const error = safeError(raw.error);
    if (error) result.error = { ...error, ...(nodeAddress(own(own(raw, 'error'), 'address')) ? { address: nodeAddress(own(own(raw, 'error'), 'address')) } : {}) };
    const settlement = safeSettlement(own(raw,'settlement')); if (settlement) result.settlement = settlement;
    for (const key of ['preview', 'published', 'fallback']) if (raw[key] !== undefined) result[key] = raw[key];
    return freeze(result);
}
export function createWorkflowSession({ runtime, current, epoch, rootCurrent = current, runEpoch = epoch, documentToken, active, changed }) {
    let result = null, recording = null, runState = null, preparationError = null, reviewHandles = [], availability = 'current';
    let busy = false, status = '', applyIssue = '', applyDiagnostic = null, generation = 0, invocation = null;
    let ignoredAutomatic = new WeakSet(), displayedAutomatic = null, documentOwner = documentToken?.();
    const publish = () => changed({ result, recording, runState, preparationError, reviewHandles, availability, busy, status, applyIssue, applyDiagnostic: applyIssue ? applyDiagnostic : null });
    const rootOwned = transaction => active() && rootCurrent() === transaction.graph && generation === transaction.serial && (!documentToken || documentToken() === transaction.documentOwner);
    const valid = transaction => rootOwned(transaction) && runEpoch() === transaction.epoch && !transaction.cancelled;
    const settledValid = transaction => valid(transaction) && workflowSignature(transaction.graph) === transaction.revision;
    function syncDocument() {
        const next = documentToken?.();
        if (next === documentOwner) return;
        documentOwner = next; generation++; invocation = null;
        result = null; recording = null; runState = null; preparationError = null; reviewHandles = [];
        availability = 'current'; busy = false; status = ''; applyIssue = '';
        displayedAutomatic = null; ignoredAutomatic = new WeakSet(); publish();
    }
    function clearAuthority() {
        reviewHandles = [];
        if (result?.recording) result = boundedResult(result, reviewHandles);
    }
    function adopt(response, cancelled = false, revision) {
        preparationError = null;
        if (response.recording) {
            recording = response.recording;
            rememberRecordingRevision(recording, revision);
            if (runState?.runId !== recording.runId) runState = null;
            reviewHandles = cancelled || response.mode !== 'root' ? [] : (response.reviewHandles || []).map(safeHandle).filter(Boolean);
            result = boundedResult(response, reviewHandles);
            availability = cancelled ? 'cancelled' : 'current';
        } else if (response.ok === false) {
            const address = nodeAddress(response.error?.address);
            preparationError = { ...(safeError(response.error) || { code: 'PREPARATION_FAILED', message: 'Workflow preparation failed.' }), ...(address ? { address } : {}) };
            clearAuthority(); availability = recording ? 'superseded' : 'current';
        } else { preparationError = { code: 'RECORDING_REQUIRED', message: 'Current workflow results require an addressed recording.' }; clearAuthority(); availability = recording ? 'superseded' : 'current'; }
        status = response.ok ? 'Run complete. Review the result.' : diagnosticText(response.error || { code: cancelled ? 'ABORTED' : 'WORKFLOW_FAILED', message: 'Run failed.' });
    }
    function capture() {
        syncDocument();
        const graph = rootCurrent(), transaction = { graph, documentOwner, epoch: runEpoch(), serial: ++generation, revision: workflowSignature(graph), runId: null, cancelled: false };
        invocation = transaction; return transaction;
    }
    function observe(transaction, event) {
        const cancelledSettlement = transaction.cancelled && rootOwned(transaction) && transaction.runId && own(event, 'runId') === transaction.runId && own(event, 'type') === 'run-settled' && own(event, 'status') === 'cancelled';
        if (!cancelledSettlement && !valid(transaction)) return;
        let previous = runState;
        if (!transaction.runId) {
            if (own(event, 'type') !== 'plan' || own(event, 'seq') !== 1) return;
            previous = createRunState(own(event, 'runId'));
        }
        const next = reduceRunState(previous, event);
        if (!next || next === previous) return;
        transaction.runId = next.runId; runState = next; publish();
    }
    return {
        result: () => result,
        syncDocument,
        receiveAutomatic(record) {
            syncDocument();
            const graph = rootCurrent(), origin = record?.origin;
            if (!active() || !record?.result || !origin || (documentToken && origin.documentToken !== documentOwner) || origin.kind !== 'send' || origin.phase !== 'unified' || graph?.mode !== 'native-unified' || origin.graph !== graph || origin.graphId !== graph.id || origin.signature !== workflowSignature(graph) || ignoredAutomatic.has(record) || displayedAutomatic === record) return;
            if (busy) { ignoredAutomatic.add(record); return; }
            // A payload-free superseded Send cannot replace the one retained diagnostic.
            const received = record.result.recording;
            if (!received || record.result.mode !== 'root' || typeof origin.runId !== 'string' || !origin.runId || origin.runId !== record.result.runId || origin.runId !== received.runId || received.plan?.mode !== 'root' || received.plan?.phase !== origin.phase || received.identities?.strings?.[received.plan?.workflowId] !== graph.id) return;
            if (availability !== 'current' && recording?.runId === record.result.recording.runId) return;
            generation++; invocation = null; displayedAutomatic = record; adopt(record.result, false, origin.signature); applyIssue = '';
            status = `Automatic Send · unified workflow · "${origin.graphName || graph.name}". ${result?.ok ? 'Review the result.' : diagnosticText(record.result.error || { code: 'WORKFLOW_FAILED', message: 'Run failed.' })}`; publish();
        },
        refreshFreshness(selector) {
            syncDocument();
            const handle = safeHandle(selector);
            const captured = handle && reviewHandles.find(item => item.handleId === handle.handleId && item.runId === handle.runId && targetKey(item.terminal) === targetKey(handle.terminal));
            const freshness = captured ? runtime()?.candidateStatus?.(captured) : null;
            applyDiagnostic = freshness?.ok === false ? presentDiagnostic(freshness.error) : null;
            applyIssue = applyDiagnostic?.message || ''; publish();
        },
        async run(options = {}) {
            syncDocument();
            if (options.target === undefined) {
                preparationError = { code: 'NATIVE_SEND_REQUIRED', message: 'Enable this open unified workflow, then Send in SillyTavern. Generate Reply continues that native generation. Use Run to here to test supported nodes.' };
                status = preparationError.message; publish();
                return { schema: 3, runtime: 2, mode: 'root', ok: false, actualCalls: 0, error: preparationError };
            }
            const controller = runtime(), previous = controller?.lastAutomaticResult?.();
            if (previous?.origin.graph === rootCurrent()) ignoredAutomatic.add(previous);
            displayedAutomatic = null;
            const transaction = capture();
            if (recording) { clearAuthority(); availability = 'superseded'; } else result = null;
            runState = null; preparationError = null; busy = true; status = ''; applyIssue = ''; publish();
            try {
                if (!controller) throw new Error('Native workflow runtime is unavailable.');
                const onEvent = event => observe(transaction, event);
                const response = await controller.runTarget(transaction.graph, options.target, { ...options, onEvent });
                const cancelledDiagnostic = transaction.cancelled && rootOwned(transaction) && transaction.runId && response?.ok === false && response.error?.code === 'ABORTED' && response.recording?.status === 'cancelled' && response.recording.runId === transaction.runId;
                if (!cancelledDiagnostic && !settledValid(transaction)) return;
                adopt(response, cancelledDiagnostic, transaction.revision); busy = false; publish(); return response;
            } catch (error) {
                if (valid(transaction)) { preparationError = { code: 'PREPARATION_FAILED', message: 'Workflow preparation could not finish.' }; status = diagnosticText(preparationError); busy = false; clearAuthority(); publish(); }
            } finally {
                if (invocation === transaction) {
                    invocation = null;
                    if (busy && generation === transaction.serial) { busy = false; clearAuthority(); availability = recording ? 'stale' : 'current'; publish(); }
                }
            }
        },
        async apply(selector) {
            syncDocument();
            if (busy || !result?.ok || availability !== 'current') return;
            const handle = safeHandle(selector);
            const candidate = handle && reviewHandles.find(item => item.handleId === handle.handleId && item.runId === handle.runId && targetKey(item.terminal) === targetKey(handle.terminal));
            if (!candidate || result.mode !== 'root' || candidate.runId !== result.runId || candidate.terminal.address.workflowId !== rootCurrent()?.id) return;
            if (!candidate) return;
            const freshness = runtime()?.candidateStatus?.(candidate);
            if (freshness?.ok === false) { applyDiagnostic = presentDiagnostic(freshness.error); applyIssue = applyDiagnostic.message; status = applyIssue; publish(); return; }
            const transaction = capture(); busy = true; publish();
            try {
                const controller = runtime();
                const response = freshness?.persistOnly === true ? await controller.retryPersistence(candidate) : await controller.apply(candidate);
                if (!settledValid(transaction)) return;
                if (response.ok) {
                    const settlement = safeSettlement(own(response,'settlement'));
                    if (settlement) result = boundedResult({...result,settlement}, reviewHandles);
                    status = settlement?.status === 'partial' ? 'Reply accepted. Some workflow data could not be saved. Use Retry failed saves for those targets.'
                        : settlement?.status === 'save-unverified' ? 'Reply accepted. Some saves are unconfirmed. Check their save status before writing again.'
                        : settlement?.status === 'settled' ? 'Reply accepted. Workflow data saved. Saving the reply is still unconfirmed.'
                        : 'Reply applied locally. Saving is unconfirmed.';
                    if (settlement?.status === 'partial') { availability = 'current'; applyIssue = ''; }
                    else { clearAuthority(); availability = recording ? 'stale' : 'current'; if (!recording) result = null; }
                } else { status = diagnosticText(response.error || { code: 'APPLY_FAILED', message: 'Apply failed.' }); }
            } catch {
                if (valid(transaction)) {
                    applyDiagnostic = presentDiagnostic({ code: freshness?.persistOnly ? 'ACCEPTED_SAVE_UNVERIFIED' : 'APPLY_UNVERIFIED' });
                    applyIssue = applyDiagnostic.message; status = applyIssue;
                    clearAuthority();
                }
            }
            finally { if (valid(transaction)) { busy = false; invocation = null; publish(); } }
        },
        cancel(reason = 'Workflow view closed') {
            // Host publishes the recording barrier synchronously while this observer still owns the invocation.
            runtime()?.cancel(reason);
            if (invocation) invocation.cancelled = true;
            displayedAutomatic = null; ignoredAutomatic = new WeakSet(); clearAuthority();
            if (!recording) result = null;
            availability = recording ? 'stale' : 'current'; busy = false; status = ''; applyIssue = ''; publish();
        },
        invalidate(reason = 'Workflow changed') {
            runtime()?.cancel(reason); generation++; invocation = null; clearAuthority();
            if (!recording) result = null;
            availability = recording ? 'stale' : 'current'; busy = false; status = ''; applyIssue = ''; publish();
        },
        reject() {
            const controller = runtime(), published = result?.settlement?.published === true;
            if (typeof controller?.reject === 'function') for (const handle of reviewHandles) controller.reject(handle);
            else controller?.cancel('Candidate rejected');
            generation++; invocation = null; clearAuthority();
            if (!recording) result = null;
            availability = recording ? 'stale' : 'current'; busy = false; applyIssue = ''; status = published ? 'Save review closed. The accepted reply remains.' : 'Proposed reply rejected. Original reply preserved.'; publish();
        },
    };
}
