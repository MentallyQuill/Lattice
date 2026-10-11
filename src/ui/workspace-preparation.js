import { resolveSystemNode } from '../workflow/system-capabilities.js?v=0.27.0';
import { projectNodeControls, detailControl } from './node-control-projection.js?v=0.27.0';
import { preparedViewContentIdentity } from './graph-view-session.js?v=0.27.0';
import { iterationHelperChoices } from './configured-node-creation.js?v=0.27.0';
import { prepareIterationBindings } from './iteration-bindings.js?v=0.27.0';
import { prepareDefinitionRegistry, inspectPreparedDefinition } from '../workflow/graph-validation.js?v=0.27.0';
import { projectRunRows } from '../workflow/run-state.js?v=0.27.0';
import { definitionRefKey, nodeBindingOverrideKey } from '../workflow/definition-data.js?v=0.27.0';
import { inspectGraphArtifacts } from '../workflow/graph-artifacts.js?v=0.27.0';
import { prepareWorkflowPlanner } from '../workflow/resolve.js?v=0.27.0';
import { prepareCompositionViews } from '../workflow/composition-views.js?v=0.27.0';
import { prepareWorkflowProjection, projectPreparedWorkflow } from './workflow-surface.js?v=0.27.0';
import { ARTIFACT_KINDS, OPERATIONS, operationFor, portsForNode, phaseForNode } from '../workflow/catalog.js?v=0.27.0';
import { definitionChain, ownsDefinitionPath } from '../workflow/composition-edit.js?v=0.27.0';
import { FAMILY_PALETTE, paletteForOperation, readNodePresentation } from './node-palette.js?v=0.27.0';
import { isCommentFrame } from '../canvas/comment-frames.js?v=0.27.0';
import { nodeCard } from '../canvas/presentation.js?v=0.27.0';
import { modifierTypes, modifierSummary, applyTextModifiers } from '../workflow/modifiers.js?v=0.27.0';
import { addressKey, boundedText, RENDERED_TEXT_BYTES, freeze } from '../workflow/record-data.js?v=0.27.0';
import { prepareNodeProfileOptions } from './node-profile-preparation.js?v=0.27.0';
import { projectWorkflowData } from './workflow-data-setup.js?v=0.27.0';
import { presentDiagnostic, presentDiagnostics } from './diagnostics.js?v=0.27.0';
import { previewDiagnostics } from './preview-diagnostics.js?v=0.27.0';
import { projectRecordedPreview, boundReadablePreviewSections } from './recorded-preview.js?v=0.27.0';
const panelCaches = new WeakMap();
const authoredFieldCaches = new WeakMap();
const runPanelCaches = new WeakMap();
const noDisplayRows = Object.freeze([]);
const unavailablePreviewSource = projectRecordedPreview(undefined).source;
const rootIdentity = root => ({ kind: 'root', workflowId: root.id });
/** First activation favors readable named cards; users can pan or explicitly Fit. */
export function initialWorkspaceCamera(node, { width, shelf, meter } = {}) {
    if (!node) return { x: 0, y: 0, zoom: 1 };
    const beside = shelf && shelf.x + shelf.w + 24 + node.w <= width - 16;
    let x = beside ? shelf.x + shelf.w + 24 : 16;
    const y = shelf && !beside ? shelf.y + shelf.h + 16 : 48;
    if (meter && x < meter.x + meter.w + 12 && x + node.w > meter.x - 12 && y < meter.y + meter.h + 12 && y + (node.h || 120) > meter.y - 12) x = meter.x + meter.w + 16;
    return { x: x - node.x, y: y - node.y, zoom: 1 };
}
/** Content/host preparation only. The view session receives detached display DTOs. */
export function prepareWorkspaceViews(root, options = {}) {
    const prepared = prepareWorkflowPlanner(root, options.artifacts); if (!prepared.ok) return prepared;
    const planner = prepared.data;
    const primitivePhases = new Map(planner.inventory.primitives.map(unit => [addressKey(unit.address), unit.phase]));
    const composition = prepareCompositionViews(root, planner); if (!composition.ok) return composition;
    const workflow = prepareWorkflowProjection(root, { ...options, ...(planner ? { planner } : {}) });
    const helperProfiles = prepareNodeProfileOptions(options.profiles ?? [], options.activeModel).map(option => ({ id: option.value, name: option.label }));
    const navigation = [], preparedViews = composition.data.views.map(view => {
        const identity = view.instancePath.length ? { kind: 'instance', workflowId: root.id, instancePath: [...view.instancePath] } : rootIdentity(root);
        const wrapper = view.instancePath.length ? definitionChain(root, view.instancePath).at(-1) : null;
        if (wrapper) navigation.push({ identity, label: (readNodePresentation(wrapper.node).alias || (typeof wrapper.node.title === 'string' ? wrapper.node.title : '') || wrapper.definition.name || view.instancePath.at(-1)).slice(0, 256), readOnly: !view.editable });
        const effectiveNodes = Object.fromEntries(Object.entries(view.effectiveNodes).map(([id, node]) => {
            const resolved = resolveSystemNode(node, { workflowId: root.id, instancePath: view.instancePath, nodeId: id });
            return [id, resolved.ok ? resolved.data.node : node];
        }));
        const drawBase = prepareEditorDrawBase(view, root.definitions, nodeId => primitivePhases.get(addressKey({ workflowId: root.id, instancePath: view.instancePath, nodeId })));
        // Saved primitive null means inheritance; only an explicit enclosing
        // instance null map blocks it. Cache that source distinction with the view.
        drawBase.iterationHelpers = iterationHelperChoices(root, helperProfiles); drawBase.iterationBindings = {}; drawBase.bindingBlocks = {}; drawBase.instanceBindingSources = {}; drawBase.profileDefaultModels = {}; drawBase.instanceBindingValues = {};
        const chain = view.instancePath.length ? definitionChain(root, view.instancePath) : [];
        let helperRoles=structuredClone(root.roles??{});
        for(const owner of chain){
            for(const [role,binding]of Object.entries(owner.definition.body.roles??{}))helperRoles[role]={...(helperRoles[role]??{}),...binding};
            for(const [role,binding]of Object.entries(owner.node.roleOverrides??{}))helperRoles[role]={...(helperRoles[role]??{}),...binding};
        }
        for (const node of Object.values(view.savedGraph.nodes)) {
            if(node.operation==='for-each')drawBase.iterationBindings[node.id]=prepareIterationBindings(node,root.definitions??{},helperProfiles,helperRoles);
            const binding = {};
            for (let depth = chain.length - 1; depth >= 0; depth--) Object.assign(binding, chain[depth].node.nodeBindingOverrides?.[nodeBindingOverrideKey(view.instancePath.slice(depth + 1), node.id)] ?? {});
            const fields = Object.fromEntries(Object.entries(binding).filter(([, value]) => value === null).map(([field]) => [field, true]));
            if (Object.keys(fields).length) drawBase.bindingBlocks[node.id] = fields;
            // The root inspector can reset only the top wrapper's override.
            // Inner pinned wrappers contribute effective defaults, not edit ownership.
            const rootBinding = chain[0]?.node.nodeBindingOverrides?.[nodeBindingOverrideKey(view.instancePath.slice(1), node.id)];
            if (rootBinding && Object.keys(rootBinding).length) drawBase.instanceBindingValues[node.id] = { ...rootBinding };
            drawBase.profileDefaultModels[node.id] = Object.hasOwn(binding, 'profileId') ? !!binding.profileId : !!node.profileId;
            const role = node.modelRole ?? drawBase.nativeCards[node.id]?.modelRole;
            if (Object.keys(binding).length || chain.some(owner => Object.keys(owner.node.roleOverrides?.[role] ?? {}).some(key => ['profileId','model'].includes(key) && !node[key]))) drawBase.instanceBindingSources[node.id] = true;
        }
        return { identity, ...(view.definitionRef ? { definitionRef: view.definitionRef } : {}), readOnly: !view.editable, savedGraph: view.savedGraph, effectiveNodes, interface: view.interface, ports: view.ports, drawBase };
    });
    const inventory=planner.inventory;
    const idleRunRows=projectRunRows({plan:{workflowId:root.id,hierarchy:inventory.hierarchy},nodes:inventory.primitives.map(unit=>({...unit,included:unit.enabled!==false,status:'not-run',attempts:0,durationMs:null,request:null}))});
    const previewChoices = preparedViews.flatMap(view => previewChoicesFor(view, projectPreparedWorkflow(workflow, { viewPath: view.identity.instancePath ?? [] }).targets));
    return { ok: true, data: { navigation, preparedViews, workflow, planner, idleRunRows, previewChoices, reviewTerminals: projectPreparedWorkflow(workflow).reviewTerminals ?? [] } };
}
/** Checked single-card measurement data, never a full-root commit candidate. */
export function prepareNodePlacement(root, { nodeId, viewPath = [], artifacts } = {}) {
    const prepared = prepareWorkflowPlanner(root, artifacts); if (!prepared.ok) return prepared;
    const invalid = () => ({ ok: false, error: { code: 'NODE_PLACEMENT', message: 'Choose an existing node in an admitted editor view.' } });
    if (typeof nodeId !== 'string' || !nodeId || !Array.isArray(viewPath) || !viewPath.every(id => typeof id === 'string' && id)) return invalid();
    const planner = prepared.data, composition = prepareCompositionViews(root, planner); if (!composition.ok) return composition;
    const samePath = path => path.length === viewPath.length && path.every((id, index) => id === viewPath[index]);
    const view = composition.data.views.find(view => samePath(view.instancePath));
    if (!view || !Object.hasOwn(view.effectiveNodes, nodeId)) return invalid();
    const unit = planner.inventory.primitives.find(unit => unit.address.nodeId === nodeId && samePath(unit.address.instancePath));
    const graph = prepareEditorDrawBase(view, root.definitions, () => unit?.phase, nodeId);
    if (!graph.nativeCards[nodeId]) return invalid();
    return { ok: true, data: { graph, node: graph.nodes[nodeId] } };
}
/** Measure one card from an exact privately owned snapshot and its paired expansion.
 * Historical tokens intentionally describe their admitted content, never a current
 * raw document. The detached display DTO grants no editing or execution authority.
 * @param {object} artifacts Exact token returned by prepareGraphArtifacts.
 * @param {{nodeId: string, viewPath?: string[]}} options
 * @returns {import('../workflow/types').Result<import('../../ui/types').NodeCardData>}
 */
export function prepareNodePlacementCard(artifacts, { nodeId, viewPath = [] } = {}) {
    const owned = inspectGraphArtifacts(artifacts);
    if (!owned) return { ok: false, error: { code: 'INVALID_GRAPH_ARTIFACTS', message: 'Use checked artifacts for this exact document content.' } };
    const invalid = () => ({ ok: false, error: { code: 'NODE_PLACEMENT', message: 'Choose an existing node in an admitted editor view.' } });
    if (typeof nodeId !== 'string' || !nodeId || !Array.isArray(viewPath) || !viewPath.every(id => typeof id === 'string' && id)) return invalid();
    const samePath = path => path.length === viewPath.length && path.every((id, index) => id === viewPath[index]);
    const scope = owned.checked.data.scopes.find(scope => samePath(scope.instancePath));
    if (!scope || !Object.hasOwn(scope.graph.nodes, nodeId)) return invalid();
    const root = owned.snapshot;
    const definition = viewPath.length ? definitionChain(root, viewPath).at(-1).definition : null;
    const view = { savedGraph: definition?.body ?? root, effectiveNodes: scope.graph.nodes, interface: definition?.interface ?? [], editable: !viewPath.length || ownsDefinitionPath(root, viewPath) };
    const unit = owned.checked.data.primitives.find(unit => unit.address.nodeId === nodeId && samePath(unit.address.instancePath));
    const graph = prepareEditorDrawBase(view, root.definitions, () => unit?.phase, nodeId, true);
    if (!graph.nativeCards[nodeId]) return invalid();
    return { ok: true, data: structuredClone(nodeCard(graph.nodes[nodeId], { graph })) };
}
/** Cheap detached drawing overlay; never a saved body or full-root commit candidate. */
export function projectEditorDraw(editor, { canvasOnly = false } = {}) {
    const source = editor.prepared.drawBase;
    // Details keeps its complete prepared metadata. Canvas avoids copying and
    // traversing repeated editor schemas, while retaining every visual field.
    const draw = canvasOnly && source.nativeCards ? { ...source, nativeCards: Object.fromEntries(Object.entries(source.nativeCards).map(([id, card]) => {
        const { controlDescriptors, defaults, ...visual } = card;
        return [id, visual];
    })) } : source;
    const graph = structuredClone(draw), view = editor.view;
    if(view.identity.kind==='root')graph.id=view.identity.workflowId;else delete graph.id;
    graph.view = { ...view.camera }; graph.selection = [...view.selection.multi];
    graph.nodes ??= {}; graph.wires ??= {}; graph.groups ??= {};
    for (const [id, presentation] of Object.entries(view.nodePresentation)) {
        const node = graph.nodes[id]; if (!node) continue;
        node.presentation = { ...node.presentation, ...presentation };
        if (!isCommentFrame(node) && presentation.x !== undefined) node.x = presentation.x;
        if (!isCommentFrame(node) && presentation.y !== undefined) node.y = presentation.y;
    }
    for (const [id, presentation] of Object.entries(view.groupPresentation ?? {})) if (Object.hasOwn(graph.groups, id)) Object.assign(graph.groups[id], structuredClone(presentation));
    return graph;
}

/** Cheap per-node decoration rows from prepared metadata, independent of selection. */
export function projectNodeProfiles(editor, workflow, revision) {
    if (!editor?.prepared) return [];
    const library = editor.view.identity.kind === 'library', path = editor.view.identity.instancePath ?? [];
    const options = (workflow.profiles ?? []).map(profile => ({ value: profile.id, label: profile.name, apiLabel: profile.apiLabel || '', model: profile.model || '', active: profile.active === true }));
    const available = options.length ? options : prepareNodeProfileOptions();
    return Object.values(editor.prepared.effectiveNodes).flatMap(node => {
        const op = operationFor(node), bound = op?.requestBound;
        const requestBound = typeof bound === 'function' ? bound(node) : bound || 0;
        if (!requestBound) return [];
        const prepared = library ? null : workflow.nodes.find(row => row.id === node.id);
        const role = node.modelRole ?? op.modelRole;
        const value = prepared?.profileId ?? node.profileId ?? editor.prepared.savedGraph.roles?.[role]?.profileId ?? '';
        const option = available.find(option => option.value === value);
        const model = prepared?.model || node.model || prepared?.resolvedModel || (option ? option.model : '') || '';
        const address = library ? { kind: 'library', definitionRef: editor.prepared.definitionRef, nodeId: node.id } : { workflowId: workflow.graphId, instancePath: [...path], nodeId: node.id };
        return [{ id: node.id, selection: { selectionKey: JSON.stringify([editor.view.key, node.id]), revision, address }, value, label: option?.label || (value ? 'Unavailable connection · ' + value : 'Choose a connection'), model, editable: !library, options: available }];
    });
}

const targetKey = target => JSON.stringify(target);
function previewChoicesFor(prepared, targets = []) {
    const path = prepared.identity.instancePath ?? [];
    return targets.map(target => {
        const at = target.kind === 'terminal' ? target.address : target, card = prepared.drawBase?.nativeCards?.[at.nodeId];
        const port = card?.ports.find(port => port.port === target.portId && port.dir === 'out');
        const label = (card?.canonicalTitle || at.nodeId) + (target.kind === 'terminal' ? ' · Host result' : ' · ' + (port?.label || target.portId));
        return { key: targetKey(target), label: path.length ? path.join(' / ') + ' · ' + label : label, kind: port?.kind || 'host', target: structuredClone(target) };
    });
}
/** Plain panel DTOs from cached saved/effective values and bounded run projections. */
export function projectWorkspacePanels(editor, workflow, state, revision, selectedTarget, pinnedPreview, rootWorkflow = workflow, idleRunRows = [], previewChoices) {
    const library = editor?.view.identity.kind === 'library', path = editor?.view.identity.instancePath ?? [], graph = editor?.prepared.savedGraph;
    const selectedId = library ? editor.view.selection.primary?.kind === 'node' ? editor.view.selection.primary.id : null : workflow.selectedId, saved = graph?.nodes[selectedId], effective = library ? null : workflow.nodes.find(node => node.id === selectedId), metadata = editor?.prepared.drawBase?.nativeCards?.[selectedId];
    const address = library ? {kind:'library',definitionRef:editor.prepared.definitionRef,nodeId:selectedId} : { workflowId: workflow.graphId, instancePath: [...path], nodeId: selectedId };
    const presentation = readNodePresentation(saved, editor?.view.nodePresentation[selectedId]);
    // Only the session can qualify unchanged authored content across its verified
    // coordinate patch. Ordinary/frozen caller DTOs never transfer that identity.
    const contentIdentity = preparedViewContentIdentity(editor.prepared), immutableScope = !!contentIdentity;
    let cache = immutableScope ? panelCaches.get(contentIdentity) : null;
    if (!cache) { cache = new Map(); if (immutableScope) panelCaches.set(contentIdentity, cache); }
    const panelKey = JSON.stringify([selectedId, library, editor.readOnly, presentation.alias, presentation.compact]);
    const dependencies = [effective, effective?.issueDiagnostic, workflow.profiles, workflow.workflowData];
    let authored = immutableScope ? cache.get(panelKey) : null;
    if (!authored || dependencies.some((value, index) => value !== authored.dependencies[index])) {
        const produced = (() => {
            const fileInput = saved?.operation === 'file-input' ? { fileName: typeof saved.fileName === 'string' ? saved.fileName : '', loaded: saved.loaded === true } : null;
            const workflowData = saved ? projectWorkflowData(editor.prepared.effectiveNodes[selectedId] ?? saved, workflow.workflowData ?? {}, !(editor.readOnly || library), library ? undefined : address) : null;
            let fieldCache = immutableScope ? authoredFieldCaches.get(contentIdentity) : null;
            if (!fieldCache) { fieldCache = new Map(); if (immutableScope) authoredFieldCaches.set(contentIdentity, fieldCache); }
            const fieldKey = JSON.stringify([selectedId, workflowData?.controlKey]);
            let fields = fieldCache.get(fieldKey);
            if (!fields) {
                const effectiveNode = editor.prepared.effectiveNodes[selectedId] ?? saved;
                const context = {phase:effective?.phase ?? phaseForNode(graph,saved) ?? 'pre',readOnly:editor.readOnly || library};
                const ownControls = projectNodeControls(saved?.operation,saved,context);
                const effectiveControls = projectNodeControls(saved?.operation,effectiveNode,context);
                const controls = metadata ? [...ownControls, ...effectiveControls.filter(control=>!ownControls.some(own=>own.key===control.key))].filter(control => {
                    const key=control.key;
                    return !(workflowData && (key===workflowData.controlKey || saved.operation==='story-clock' && key==='calendarId') || key==='roleOverrides' && saved.operation==='for-each' || fileInput && ['fileName','content','loaded'].includes(key));
                }).map(control=>{
                    const own=Object.hasOwn(saved,control.key)?saved[control.key]:control.value;
                    const effectiveValue=Object.hasOwn(effectiveNode,control.key)?effectiveNode[control.key]:control.value;
                    return {...control,value:own,...(saved.operation==='for-each' && control.key==='helper' ? {helperChoices:(editor.prepared.drawBase.iterationHelpers??[]).filter(choice=>saved.mode!=='projected-state'||choice.stateful)} : {}),...(JSON.stringify(own)===JSON.stringify(effectiveValue)?{}:{effective:displayEffective(effectiveValue),source:'Effective instance override'})};
                }) : [];
                fields = freeze(structuredClone({ controls, ports: metadata?.ports.map(port => ({ id: port.port, label: port.label, direction: port.dir === 'in' ? 'input' : 'output', kind: port.kind })) ?? [] }));
                fieldCache.set(fieldKey, fields);
            }
            const { controls } = fields;
            const modes = [{ value: 'inherit', label: 'Inherit role' }, { value: 'override', label: 'Override' }];
            const field = (key, options) => {
                const explicitNull = editor?.prepared.drawBase.bindingBlocks?.[selectedId]?.[key] === true;
                const pinnedInstance = !library && editor.readOnly;
                const ownProfile = editor.prepared.drawBase.profileDefaultModels?.[selectedId] === true;
                if (pinnedInstance) {
                    const instance = editor.prepared.drawBase.instanceBindingValues?.[selectedId], present = Object.hasOwn(instance ?? {}, key);
                    const value = present ? instance[key] : null;
                    const inherited = [{ value: 'inherit', label: key === 'profileId' ? 'Use definition binding' : 'Use definition model' }, { value: 'override', label: 'Override' }];
                    const allowedModes = explicitNull || key === 'model' && ownProfile ? [...inherited, { value: 'block', label: key === 'model' && ownProfile ? 'Use profile model' : 'Blocked by instance' }] : inherited;
                    return { mode: present ? value === null ? 'block' : 'override' : 'inherit', value, effectiveValue: editor.prepared.effectiveNodes[selectedId]?.[key] ?? null, allowedModes, ...(options ? { options } : {}) };
                }
                const profileModelDefault = key === 'model' && explicitNull && ownProfile;
                const blocked = explicitNull && !profileModelDefault;
                const value = profileModelDefault ? null : saved?.[key] ?? null;
                return { mode: blocked ? 'block' : value ? 'override' : 'inherit', value, effectiveValue: editor.prepared.effectiveNodes[selectedId]?.[key] ?? null, allowedModes: blocked ? [...modes, { value: 'block', label: 'Blocked by instance' }] : modes, ...(options ? { options } : {}) };
            };
            const guideKey = saved?.type === 'workflow' ? saved.operation : isCommentFrame(saved) ? 'comment' : saved?.type;
            const guideCard = saved && metadata && editor.prepared.drawBase.nodes?.[selectedId] && !isCommentFrame(saved)
                ? nodeCard({ ...editor.prepared.drawBase.nodes[selectedId], presentation, x: 0, y: 0 }, { graph: editor.prepared.drawBase }) : null;
            const selection = { selectionKey: JSON.stringify([editor?.view.key, selectedId]), revision, address };
            const interfacePort = metadata?.boundary ? editor.prepared.interface.find(port => port.id === saved?.interfacePortId && port.boundaryNodeId === selectedId) : null;
            const boundary = interfacePort ? { id: interfacePort.id, label: interfacePort.label, direction: interfacePort.direction, kind: interfacePort.kind, required: interfacePort.required, kinds: [...ARTIFACT_KINDS] } : null;
            const commentDetails = isCommentFrame(saved) ? { selection, comment: { id: saved.id, x: saved.x, y: saved.y, w: saved.w, h: saved.h, title: saved.title ?? 'Comment', content: saved.content ?? '', color: saved.color ?? '#637d89', moveContents: saved.moveContents !== false, selected: true, readOnly: editor.readOnly || library } } : null;
            const nodeDetails = saved && metadata && !commentDetails ? { ...selection, guideKey, guideCard, title: boundary?.label ?? (presentation.alias || (typeof saved.title === 'string' ? saved.title : metadata.canonicalTitle)), canonicalTitle: metadata.canonicalTitle, operation: saved.operation, system: saved.type === 'subgraph', iconPath: metadata.iconPath, family: metadata.family, familyColor: metadata.familyColor, phase: effective?.phase ?? phaseForNode(graph,saved) ?? metadata.phase ?? graph.mode.slice(7), phaseEditable: graph.mode === 'native-unified' && OPERATIONS[saved.operation]?.phase === 'both', alias: presentation.alias, compact: presentation.compact, enabled: saved.enabled !== false, readOnly: editor.readOnly || library, canPresent: true, controls, ...(fileInput ? { fileInput } : {}), ...(boundary ? { boundary } : {}),
                model: metadata.modelRole && (effective?.effective !== 'No model call' || saved.model || saved.profileId || Object.keys(editor?.prepared.drawBase.bindingBlocks?.[selectedId] ?? {}).length) ? { role: saved.modelRole ?? metadata.modelRole, roleEditable: true, editable: !library, profileDefaultModel: editor.prepared.drawBase.profileDefaultModels?.[selectedId] ?? !!saved.profileId, profile: field('profileId', workflow.profiles.map(profile => ({ value: profile.id, label: profile.name }))), model: field('model'), effective: effective?.effective || (library ? [editor.prepared.effectiveNodes[selectedId]?.profileId ?? graph.roles?.[saved.modelRole ?? metadata.modelRole]?.profileId,editor.prepared.effectiveNodes[selectedId]?.model ?? graph.roles?.[saved.modelRole ?? metadata.modelRole]?.model].filter(Boolean).join(' · ') : ''), source: editor.prepared.drawBase.instanceBindingSources?.[selectedId] ? 'Containing instance override' : saved.profileId || saved.model ? 'Node override' : 'Inherited from ' + (saved.modelRole ?? metadata.modelRole), ...(effective?.issue ? {issue: effective.issue} : {}) } : null,
                helperBindings: saved.operation === 'for-each' ? { ...editor.prepared.drawBase.iterationBindings?.[selectedId], editable: !(editor.readOnly || library) } : null,
                ...(workflowData ? { workflowData } : {}),
                modifiers: modifierView(saved, metadata, !(editor.readOnly || library)),
                ports: fields.ports, issues: [] } : null;
            if (nodeDetails?.model && effective?.issueDiagnostic) nodeDetails.model.issueDiagnostic = effective.issueDiagnostic;
            if (nodeDetails) nodeDetails.editorContractKey = detailsEditorContractKey(nodeDetails);
            return { nodeDetails, commentDetails, fields };
        })();
        const detached = structuredClone({ nodeDetails: produced.nodeDetails, commentDetails: produced.commentDetails });
        if (detached.nodeDetails) { detached.nodeDetails.controls = produced.fields.controls; detached.nodeDetails.ports = produced.fields.ports; }
        authored = { ...freeze(detached), dependencies }; cache.set(panelKey, authored);
    }
    const envelope = { selectionKey: JSON.stringify([editor?.view.key, selectedId]), revision, address, ...(editor.documentNamespace ? { documentNamespace: editor.documentNamespace } : {}) };
    const envelopeKey = JSON.stringify([envelope.selectionKey, envelope.revision, envelope.documentNamespace]);
    if (!authored.enveloped || authored.envelopeKey !== envelopeKey) {
        freeze(address); Object.freeze(envelope);
        authored.enveloped = { nodeDetails: authored.nodeDetails ? Object.freeze({ ...authored.nodeDetails, ...envelope }) : null, commentDetails: authored.commentDetails ? Object.freeze({ ...authored.commentDetails, selection: envelope }) : null }; authored.envelopeKey = envelopeKey;
    }
    const { nodeDetails, commentDetails } = authored.enveloped;
    let choiceCache = immutableScope ? cache.get('preview-choices') : null;
    if (!choiceCache || choiceCache.source !== workflow.targets) { choiceCache = { source: workflow.targets, choices: freeze(previewChoicesFor(editor.prepared, workflow.targets)) }; cache.set('preview-choices', choiceCache); }
    const choices = library ? noDisplayRows : previewChoices ?? choiceCache.choices;
    const target = pinnedPreview || selectedTarget, selectedKey = choices.find(choice => targetKey(choice.target) === targetKey(target))?.key ?? '';
    const result = workflow.result, sectionKey = 'preview-sections:' + selectedId;
    const sectionDependencies = [result?.sections, saved?.modifiers, targetKey(target), state.busy];
    let sectionCache = immutableScope && (!result || Object.isFrozen(result.sections)) ? cache.get(sectionKey) : null;
    if (!sectionCache || sectionDependencies.some((value, index) => value !== sectionCache.dependencies[index])) {
        let sections = result ? result.sections.map((section,i) => ({ id: String(i), label: section.kind, ...section })) : [];
        if (!library && !state.busy && saved && nodeDetails?.modifiers && target?.nodeId === selectedId && target?.workflowId === workflow.graphId && target?.portId === nodeDetails.modifiers.outputPortId && JSON.stringify(target.instancePath) === JSON.stringify(path)) {
            const source = sections.find(section => section.format === 'structured-text' && typeof section.recordedRawText === 'string');
            if (source) {
                const local = applyTextModifiers(source.recordedRawText, saved.modifiers ?? []);
                if (local.ok && JSON.stringify(local.data.trace) !== JSON.stringify(source.recordedModifierTrace ?? [])) {
                    const text = boundedText(local.data.text, RENDERED_TEXT_BYTES - 2);
                    sections.push({id:'local-modifiers',kind:'text',label:'Local modifier preview · recorded source',text,format:'structured-text',truncated:text !== local.data.text,readable:{kind:'text',text,truncated:text !== local.data.text}});
                    sections = boundReadablePreviewSections(sections, sections.length - 1);
                }
            }
        }
        sectionCache = { sections: freeze(structuredClone(sections)), dependencies: sectionDependencies }; cache.set(sectionKey, sectionCache);
    }
    const sections = sectionCache.sections;
    const selector = !library ? result?.selectedReviewHandle ?? null : null;
    const presentationState = previewDiagnostics({ workflow, state, target, selectedKey, sections, library, enabled: state.enabled ?? workflow.enabled, title: choices.find(choice => choice.key === selectedKey)?.label || 'Output preview' });
    const outputPreview = { sourceKey: revision, source: library || target && !selectedKey ? unavailablePreviewSource : result?.source ?? unavailablePreviewSource, title: 'Output preview', statusDetail: state.status || '', status: !library && target && !selectedKey ? 'removed' : !result ? 'not-run' : state.availability === 'current' ? 'current' : 'stale', choices, selectedKey, pinned: !!pinnedPreview, followSelection: !pinnedPreview, sections: library || target && !selectedKey ? noDisplayRows : sections, issues: library ? ['Library inspection is read-only and has no runtime output.'] : workflow.issues, busy: state.busy, settlement: library ? null : result?.settlement ?? null, runHere: library || !selectedKey ? null : { enabled: !state.busy && !workflow.targetSummary?.issues?.length, callBound: workflow.targetSummary?.callBound ?? workflow.callBound, issue: workflow.targetSummary?.issues?.join(' ') }, review: selector ? { selector, canApply: result.applyAvailable, persistOnly: result.persistOnly, fresh: !result.applyIssue && state.availability === 'current', selectedRootTerminal: target?.kind === 'terminal' && targetKey(target) === targetKey(selector.terminal), mode: 'root', issue: result.applyIssue } : null };
    Object.assign(outputPreview, { diagnostics: presentationState.diagnostics, emptyMessage: presentationState.emptyMessage, statusDetail: presentationState.statusDetail, historyNotice: presentationState.historyNotice });
    if (outputPreview.runHere) outputPreview.runHere.reason = presentationState.runReason;
    if (outputPreview.review) outputPreview.review.reason = state.busy ? 'Wait for the current run to finish.' : outputPreview.review.issue ? presentDiagnostic(outputPreview.review.issue).message : !outputPreview.review.fresh ? 'This result is out of date. Create a fresh review before applying it.' : '';
    const rowSource = state.runState || state.recording, rows = rootWorkflow.rows?.length ? rootWorkflow.rows : idleRunRows;
    let runCache = runPanelCaches.get(rows); if (!runCache) { runCache = []; runPanelCaches.set(rows, runCache); }
    const preparationDiagnostic = state.preparationError ? presentDiagnostic(state.preparationError) : null;
    const runDependencies = [rowSource, state.busy, rootWorkflow.result?.actualCalls, rootWorkflow.result?.callBound, rootWorkflow.callBound, JSON.stringify(preparationDiagnostic), rootWorkflow.result?.errorDiagnostic, result?.ok, result?.error];
    let run = Object.isFrozen(rows) && (!rowSource || Object.isFrozen(rowSource)) ? runCache.find(entry => runDependencies.every((value, index) => value === entry.dependencies[index])) : null;
    if (!run) {
        const flat = [];
        const visit = (items, depth) => { for (const row of items) { flat.push({ key: JSON.stringify(row.address), address: row.address, title: readNodePresentation(row.node).alias || (typeof row.node?.title === 'string' ? row.node.title : '') || row.node?.operation || row.address.nodeId, kind: row.kind, depth, status: row.status, subphase: row.subphase, durationMs: row.durationMs ?? null, attempts: row.attempts ?? 0, callBound: row.requestBound ?? 0, usage: row.request?.usage ?? null, issue: row.error?.message, ...(row.error ? { diagnostics: [presentDiagnostic({ ...row.error, address: row.address }, { nodeTitle: readNodePresentation(row.node).alias || row.node?.title || row.node?.operation || row.address.nodeId, operation: row.node?.operation })] } : {}) }); visit(row.children ?? [],depth+1); } }; visit(rows,0);
        const executableCount = rows.reduce((sum,row) => sum+row.executableCount,0), completedCount = rows.reduce((sum,row) => sum+row.completedCount,0), status = state.busy ? rowSource?.status || 'running' : rowSource?.status || (result ? result.ok ? 'completed' : 'failed' : 'not-run');
        const runDetails = { runId: rowSource?.runId || '', status, elapsedMs: rowSource?.elapsedMs ?? null, actualCalls: state.busy ? flat.filter(row=>row.kind==='primitive').reduce((sum,row)=>sum+row.attempts,0) : rootWorkflow.result?.actualCalls ?? flat.filter(row=>row.kind==='primitive').reduce((sum,row)=>sum+row.attempts,0), callBound: rowSource?.plan?.callBound ?? rootWorkflow.result?.callBound ?? rootWorkflow.callBound, completedCount, executableCount, rows: flat, issue: state.preparationError?.message || result?.error || '' };
        runDetails.diagnostics = preparationDiagnostic ? [preparationDiagnostic] : rootWorkflow.result?.errorDiagnostic ? [rootWorkflow.result.errorDiagnostic] : presentDiagnostics(runDetails.issue ? [runDetails.issue] : []);
        const runMeter = { ...runDetails, rows: rows.map(row => ({ id: JSON.stringify(row.address), title: row.address.nodeId, status: row.status, executableCount: row.executableCount, completedCount: row.completedCount })) };
        run = { ...freeze(structuredClone({ runDetails, runMeter })), dependencies: runDependencies };
        runCache.splice(0, runCache.length, run);
    }
    const { runDetails, runMeter } = run;
    return { nodeDetails, commentDetails, outputPreview, runDetails, runMeter };
}

function prepareEditorDrawBase(view, snapshots, compiledPhase = () => undefined, onlyNodeId, cardOnly = false) {
        // Clone effective nodes once; authored nodes were previously copied only
        // to be discarded. Measurement prepares metadata for its one node.
        const nodes = onlyNodeId === undefined ? view.effectiveNodes : { [onlyNodeId]: view.effectiveNodes[onlyNodeId] };
        // Token-only card measurement needs no wires, roles, groups or definitions
        // in its drawing DTO; catalog metadata still sees the full owned scope.
        const source = cardOnly ? { schema: view.savedGraph.schema, runtime: view.savedGraph.runtime, mode: view.savedGraph.mode, nodes } : { ...view.savedGraph, nodes };
        const drawBase = structuredClone(source);
        drawBase.groups ??= {}; drawBase.wires ??= {}; drawBase.nativeCards = {};
        const metadata = { ...view.savedGraph, definitions: snapshots, interface: view.interface };
        let index = 0;
        if (onlyNodeId !== undefined) {
            // Missing positions use the same preceding unpositioned-row count
            // as full preparation without describing those preceding nodes.
            for (const node of Object.values(view.effectiveNodes)) {
                if (node.id === onlyNodeId) break;
                if (node.y == null) index++;
            }
        }
        for (const node of Object.values(drawBase.nodes)) {
            node.presentation = { ...node.presentation, ...readNodePresentation(node) };
            if (typeof node.title !== 'string') delete node.title;
            node.x ??= 40 + index % 3 * 240; node.y ??= 40 + Math.floor(index++ / 3) * 160;
            const phase = compiledPhase(node.id) ?? phaseForNode(view.savedGraph, node);
            const operation = operationFor(node, { phase, mode: view.savedGraph.mode });
            const wrapper = node.type === 'subgraph', boundary = ['subgraph-input', 'subgraph-output'].includes(node.type);
            if (node.type === 'note') { drawBase.nativeCards[node.id] = { canonicalTitle: 'Note', family: 'Organization', familyColor: '#a3aa99', iconPath: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5', body: typeof node.content === 'string' ? node.content : '', ports: [], hostResult: false, defaults: {}, controlDescriptors: {}, modelRole: null }; continue; }
            if (!operation && !wrapper && !boundary) continue;
            const actualPorts = portsForNode(metadata, node), rows = { in: 0, out: 0 };
            const interfacePort = boundary ? view.interface.find(port => port.id === node.interfacePortId && port.boundaryNodeId === node.id) : null;
            const title = operation?.title || (wrapper ? snapshots?.[JSON.stringify([node.definition.id, node.definition.version, node.definition.semanticHash])]?.name || 'Subgraph' : interfacePort?.label || node.interfacePortId);
            const family = operation?.family || 'Subgraphs', palette = FAMILY_PALETTE.find(item => item.name === family), discovery = paletteForOperation(node.operation);
            drawBase.nativeCards[node.id] = { canonicalTitle: title, ...(phase || operation?.phase ? { phase: phase ?? operation.phase } : {}), ...(operation?.requestCapability ? { requestCapability: operation.requestCapability } : {}), family, familyColor: palette?.color || '#a3aa99', iconPath: wrapper ? palette?.icon : boundary ? paletteForOperation(node.type).icon : discovery.icon,
                body: wrapper ? 'Open the pinned subgraph' : boundary ? 'Definition interface' : operation.title,
                hostResult: !!operation?.terminal, modifierSummary: modifierSummary(node.modifiers ?? []), ...(cardOnly ? {} : { controlDescriptors: structuredClone(operation?.controlDescriptors ?? {}), defaults: structuredClone(operation?.defaults ?? {}) }), modelRole: operation?.modelRole ?? null,
                ...(interfacePort ? { boundary: { direction: interfacePort.direction, editable: view.editable === true } } : {}),
                ports: actualPorts.map(port => { const dir = port.direction === 'input' ? 'in' : 'out'; return { id: `${dir}:${port.id}`, port: port.id, dir, side: dir === 'in' ? 'left' : 'right', row: ++rows[dir], kind: port.kind, label: port.label, className: `pc-port pc-port-${dir}`, title: `${port.label}: ${port.kind}` }; }) };
        }

    if (!cardOnly) drawBase.nativeAttachments = prepareEndpointAttachments(drawBase);
    return drawBase;
}
/** Build endpoint navigation once per scope; pins never rescan the wire table. */
export function prepareEndpointAttachments(drawBase) {
    const attachments = {};
    const incoming = new Map(), outgoing = new Map(), subscribers = new Map(), publishers = new Map(), pins = new Map();
    const endpoint = (nodeId, portId) => JSON.stringify([nodeId, portId]);
    const append = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
    for (const [nodeId, card] of Object.entries(drawBase.nativeCards)) for (const pin of card.ports) pins.set(JSON.stringify([nodeId, pin.dir, pin.port]), pin);
    for (const edge of Object.values(drawBase.wires ?? {})) {
        append(incoming, endpoint(edge.to, edge.toPort), edge);
        if (edge.route === 'portal') append(subscribers, edge.portalId, edge);
        else append(outgoing, endpoint(edge.from, edge.fromPort), edge);
    }
    for (const portal of Object.values(drawBase.portals ?? {})) append(publishers, endpoint(portal.source.nodeId, portal.source.portId), portal);
    for (const [nodeId, card] of Object.entries(drawBase.nativeCards)) for (const port of card.ports) {
        const originalBindings = [], jumps = [];
        const jump = (id, targetId, targetPort, dir, portalLabel) => {
            const targetCard = drawBase.nativeCards[targetId], pin = pins.get(JSON.stringify([targetId, dir, targetPort]));
            if (!pin) return;
            jumps.push({ id, label: 'Go to ' + targetCard.canonicalTitle + ' · ' + pin.label + (portalLabel ? ' · ' + portalLabel : ''), target: { nodeId: targetId, portId: targetPort, dir } });
        };
        for (const edge of (port.dir === 'in' ? incoming : outgoing).get(endpoint(nodeId, port.port)) ?? []) {
            if (port.dir === 'in') {
                if (edge.route === 'portal') {
                    const publisher = drawBase.portals?.[edge.portalId];
                    originalBindings.push({ kind: 'portal', id: edge.id, portalId: edge.portalId });
                    if (publisher) jump('portal-source:' + edge.id, publisher.source.nodeId, publisher.source.portId, 'out', publisher.label || publisher.id);
                } else {
                    originalBindings.push({ kind: 'direct', id: edge.id });
                    jump('wire-source:' + edge.id, edge.from, edge.fromPort, 'out');
                }
            } else if (port.dir === 'out') {
                originalBindings.push({ kind: 'direct', id: edge.id });
                jump('wire-target:' + edge.id, edge.to, edge.toPort, 'in');
            }
        }
        for (const portal of port.dir === 'out' ? publishers.get(endpoint(nodeId, port.port)) ?? [] : []) {
            originalBindings.push({ kind: 'portal-publisher', portalId: portal.id });
            for (const edge of subscribers.get(portal.id) ?? []) jump('portal-target:' + edge.id, edge.to, edge.toPort, 'in', portal.label || portal.id);
        }
        attachments[JSON.stringify([nodeId, port.dir, port.port])] = { originalBindings, jumps };
    }
    return attachments;
}
/** Content preparation for actual saved definitions. Never creates a workflow or runtime address. */
export function prepareLibraryViews(workflowId, snapshots) {
    const navigation=[],preparedViews=[],definitionInfo={};
    const registry = prepareDefinitionRegistry(snapshots); if (!registry.ok) return registry;
    snapshots = registry.data.snapshots;
    for (const definition of Object.values(snapshots)) {
        const checked=inspectPreparedDefinition(registry.data,{id:definition.id,version:definition.version,semanticHash:definition.semanticHash});if(!checked.ok)return checked;
        const {ref,definition:actual,expansion}=checked.data;
        const eligibleTargets=[],nodeBindings=[],roles=new Map();
        for(const scope of expansion.scopes) for(const role of Object.keys(scope.graph.roles ?? {})) roles.set(role,{id:role,label:role});
        for(const unit of expansion.primitives) {
            const operation=operationFor(unit.node,{phase:phaseForNode(actual.body,unit.node),mode:actual.body.mode});
            const role=unit.node.modelRole ?? operation?.modelRole;if(role)roles.set(role,{id:role,label:role});
            const target={instancePath:[...unit.address.instancePath],nodeId:unit.address.nodeId};
            nodeBindings.push({id:JSON.stringify([target.instancePath,target.nodeId]),label:[...target.instancePath,operation?.title || target.nodeId].join(' / '),target:{kind:'node',...target}});
            for(const [controlId,descriptor] of Object.entries(operation?.controlDescriptors ?? {})) if(descriptor.exposable!==false) eligibleTargets.push({key:JSON.stringify([target.instancePath,target.nodeId,controlId]),label:[...target.instancePath,operation.title,descriptor.label || controlId].join(' / '),target:{...target,controlId}});
        }
        const parameters=actual.parameters.map(parameter=>{
            const unit=expansion.primitives.find(unit=>unit.address.nodeId===parameter.target.nodeId&&JSON.stringify(unit.address.instancePath)===JSON.stringify(parameter.target.instancePath));
            const descriptor=checked.data.parameterDescriptors[parameter.id];
            return {...parameter,control:detailControl(parameter.id,parameter.label,descriptor,unit.node[parameter.target.controlId])};
        });
        definitionInfo[definitionRefKey(ref)]={ref,name:actual.name,description:actual.description || '',phase:actual.body.mode.slice(7),nodeCount:checked.data.nodeCount,wireCount:checked.data.wireCount,interface:actual.interface,parameters,eligibleTargets,roles:[...roles.values()],nodeBindings};
        const identity={kind:'library',workflowId,definitionRef:ref};
        const scope=expansion.scopes.find(scope=>!scope.instancePath.length);
        const ports=[...expansion.pins.values()].filter(pin=>!pin.address.instancePath.length).map(({address,...port})=>({...port,nodeId:address.nodeId,portId:address.portId}));
        const view={savedGraph:actual.body,effectiveNodes:scope.graph.nodes,interface:actual.interface};
        navigation.push({identity,label:actual.name,readOnly:true});
        const drawBase=prepareEditorDrawBase(view,snapshots);drawBase.iterationBindings={};
        for(const node of Object.values(actual.body.nodes))if(node.operation==='for-each')drawBase.iterationBindings[node.id]=prepareIterationBindings(node,snapshots,prepareNodeProfileOptions().map(option=>({id:option.value,name:option.label})),scope.graph.roles??{});
        preparedViews.push({identity,definitionRef:ref,readOnly:true,...view,ports,drawBase});
    }
    return {ok:true,data:{navigation,preparedViews,definitionInfo}};
}

const displayEffective = value => {const text = typeof value === 'string' ? value : JSON.stringify(value);return text?.length > 256 ? text.slice(0,256) + '…' : text;};
function modifierView(node, metadata, editable) {
 const outputs = metadata.ports.filter(port => port.dir === 'out');
 if (node.type !== 'workflow' || metadata.hostResult || outputs.length !== 1 || outputs[0].kind !== 'text') return null;
 const options = Object.values(modifierTypes).map(type => ({type:type.type,label:type.label,defaultSettings:structuredClone(type.defaultSettings),fields:type.fields.map(field => detailControl(field.key,field.label,{type:field.type === 'enum' ? 'enum' : field.type,values:field.options,min:field.min,max:field.max}, type.defaultSettings[field.key]))}));
 return {items:structuredClone(node.modifiers ?? []), options, editable, outputPortId:outputs[0].port};
}
export function projectDefinitionInstance(info,wrapper,profiles=[],effectiveControls={},effectiveBindings={}) {
 const modes=[{value:'inherit',label:'Inherit definition'},{value:'override',label:'Override'},{value:'block',label:'Block inheritance'}];
 const field=(binding,key)=>({mode:Object.hasOwn(binding ?? {},key)?binding[key]===null?'block':'override':'inherit',value:binding?.[key] ?? null,allowedModes:modes,...(key==='profileId'?{options:profiles.map(profile=>({value:profile.id,label:profile.name}))}:{})});
 const parameters=info.parameters.map(row=>{const value=Object.hasOwn(wrapper.parameterOverrides ?? {},row.id)?wrapper.parameterOverrides[row.id]:row.control.value,effective=effectiveControls[row.id] ?? row.control.value;return {...row,overridden:Object.hasOwn(wrapper.parameterOverrides ?? {},row.id),control:{...row.control,value,...(JSON.stringify(value)===JSON.stringify(effective)?{}:{effective:displayEffective(effective),source:'Effective instance override'})}};});
 const bindings=[...info.roles.map(role=>({key:'role:'+role.id,label:'Role '+role.label,target:{kind:'role',role:role.id},saved:wrapper.roleOverrides?.[role.id]})),...info.nodeBindings.map(row=>({key:'node:'+row.id,label:row.label,target:row.target,saved:wrapper.nodeBindingOverrides?.[row.id]}))].map(row=>({key:row.key,label:row.label,target:row.target,editable:true,profile:field(row.saved,'profileId'),model:field(row.saved,'model'),effective:effectiveBindings[row.key] || 'No model call',source:'Saved instance override or definition binding'}));
 return {parameters,bindings};
}
export function projectDefinitionUpdate(previous,next) {
 const rows=(old,choices,compatible=()=>true)=>old.map(row=>{const options=choices.filter(choice=>compatible(row,choice)).map(choice=>({id:choice.id,label:choice.label}));return {from:row.id,label:row.label,to:options.some(choice=>choice.id===row.id)?row.id:null,options,canDrop:true};});
 return {portMap:rows(previous.interface,next.interface,(a,b)=>a.direction===b.direction&&a.kind===b.kind),parameterMap:rows(previous.parameters,next.parameters),roleMap:rows(previous.roles,next.roles),nodeBindingMap:rows(previous.nodeBindings,next.nodeBindings)};
}

/** Producer contract contains editor compatibility only; revision/activation are write tokens. */
function detailsEditorContractKey(node) {
    return JSON.stringify([node.controls.map(control => [control.key, control.editor, control.representation, control.allowEmpty, control.structured, control.inputSpec?.id, control.inputSpec?.version]), node.model?.profile.allowedModes, node.model?.model.allowedModes, node.model?.editable, node.helperBindings && [node.helperBindings.helperKey, node.helperBindings.editable, node.helperBindings.roles.map(row => [row.role, row.model.allowedModes])], node.boundary && [node.boundary.id, node.boundary.direction, node.boundary.kinds], !!node.fileInput, node.modifiers && [node.modifiers.items.map(item => [item.id, item.type]).sort(([a], [b]) => a.localeCompare(b)), node.modifiers.options.map(option => [option.type, option.fields.map(field => [field.key, field.editor])]), node.modifiers.editable], node.readOnly]);
}
