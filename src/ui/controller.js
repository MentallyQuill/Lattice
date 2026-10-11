import { isScopedSystemOperation } from '../workflow/system-capabilities.js?v=0.27.0';
import { prepareAddSystem, projectSystemAuthoring } from '../workflow/system-authoring.js?v=0.27.0';
import { vacantSystemPoint, preflightSystemViews, captureSystemPresentation, refreshSystemPresentation, restoreSystemViews } from './system-authoring-views.js?v=0.27.0';
import {createRecallCommands} from './recall-commands.js?v=0.27.0';
import { diagnosticText, presentDiagnostic } from './diagnostics.js?v=0.27.0';
import {projectRecallView} from './recall-projection.js?v=0.27.0';
import { prepareIterationBindingOverride } from './iteration-bindings.js?v=0.27.0';
import { createStoryDocumentSetup } from './story-document-setup.js?v=0.27.0';
import { createWorkflowDataSetup } from './workflow-data-setup.js?v=0.27.0';
import { workflowDataPresetFor } from '../workflow/workflow-data-defaults.js?v=0.27.0';
import { createConfiguredNodeSession, configuredCreationStage, nodeNeedsConfiguration, iterationHelperChoices } from './configured-node-creation.js?v=0.27.0';
import { resolveBinding } from '../workflow/connections.js?v=0.27.0';
import { activeModelMetadata } from '../workflow/model-profiles.js?v=0.27.0';
import { readNodeProfileMetadata, nodeProfileMetadataKey } from './node-profile-preparation.js?v=0.27.0';
import * as workflowRuntime from '../run.js?v=0.27.0';
import { workflowSignature } from '../workflow/runtime.js?v=0.27.0';
import { installWorkflowExample } from '../workflow/examples.js?v=0.27.0';
import { projectWorkflowExamples } from './example-catalog.js?v=0.27.0';
import { OPERATIONS, operationFor, portsForNode } from '../workflow/catalog.js?v=0.27.0';
import { validateNodeModifiers } from '../workflow/modifiers.js?v=0.27.0';
import { isWorkflowGraph } from '../workflow/contracts.js?v=0.27.0';
import { parseWorkflowInsertionFile, prepareWorkflowInsertion } from '../workflow/insertion.js?v=0.27.0';
import { captureGraphEditContext, committedGraphChange } from '../workflow/transactions.js?v=0.27.0';
import { viewIdentityKey } from './view-state.js?v=0.27.0';
import { createGraphViewSession } from './graph-view-session.js?v=0.27.0';
import { prepareNativeNodeEdit, prepareQualifiedScopeEdit, makeLocalCopy, materializeInstanceDefinition, prepareOwnedDefinitionMetadataEdit } from '../workflow/definition-library.js?v=0.27.0';
import { prepareSubgraphNodeDeletion } from '../workflow/subgraph-authoring.js?v=0.27.0';
import { prepareNativeConnectionEdit } from '../workflow/connection-edits.js?v=0.27.0';
import { checkedCandidateArtifacts } from '../workflow/checked-candidate.js?v=0.27.0';
import { prepareCommentEdit } from '../workflow/comment-edits.js?v=0.27.0';
import { createCommentFrame, containedCommentNodes, fitCommentFrame, isCommentFrame } from '../canvas/comment-frames.js?v=0.27.0';
import { captureCommentPresentation, applyCommentPresentation, applyCommentGroupPresentation } from './comment-presentation.js?v=0.27.0';
import { captureRelocatedSubgraphViews, refreshRelocatedSubgraphViews, restoreSubgraphViews } from './subgraph-view-state.js?v=0.27.0';
import { preparePortalRename, prepareCreateFromSelection, prepareUnpack, prepareQualifiedPortalEdit } from '../workflow/composition.js?v=0.27.0';
import { prepareGraphCandidate } from '../workflow/prepared-graph-edit.js?v=0.27.0';
import { definitionRefKey } from '../workflow/definition-data.js?v=0.27.0';
import { exportSubgraph } from '../workflow/packages.js?v=0.27.0';
import { makeClip, makeDefinitionClip, readClip, prepareClipPaste } from '../workflow/clipboard.js?v=0.27.0';
import { getNodeGuideExample } from '../workflow/node-guide-examples.js?v=0.27.0';
import { prepareNodeGuideInsertion } from '../workflow/node-guide-insertion.js?v=0.27.0';
import { prepareNodeGuideScene } from './node-guide-scene.js?v=0.27.0';
import { prepareNativeSearchCatalog, resolveNativeSearchChoice } from './native-search-catalog.js?v=0.27.0';
import { createNativeWireBridge } from './native-wire-bridge.js?v=0.27.0';
import { readNodePresentation } from './node-palette.js?v=0.27.0';
import { showContextMenu } from './context-menu.js?v=0.27.0';
import { createWorkflowDocumentController } from './document-controller.js?v=0.27.0';
import { createWorkflowFileAccess } from './workflow-file-access.js?v=0.27.0';
import { readTextFile } from './file-input.js?v=0.27.0';
import { prepareWorkspaceViews, prepareNodePlacementCard, prepareLibraryViews, projectEditorDraw, initialWorkspaceCamera, projectWorkspacePanels, projectNodeProfiles } from './workspace-preparation.js?v=0.27.0';
import { prepareWorkflowProjection, projectPreparedWorkflow, createWorkflowSession } from './workflow-surface.js?v=0.27.0';
import { ctx, safe, settings, save, activeWorkflow, activateWorkflow, documentSession, activeWorkspaceViews, setActiveWorkspaceViews, recoveredWorkflows, retainRecoveryWorkflows, onWorkflowActivated, onRecoveryIssue, blankGraph, touchGraph, commitGraphEdit, stepGraphHistory, exportGraph, exportArchivedWorkflows, onGraphTouched, groupMembers } from '../state.js?v=0.27.0';
import { applyTheme } from '../theme.js?v=0.27.0';
import { renderThemeEditor } from '../theme-editor.js?v=0.27.0';
import * as H from '../history.js?v=0.27.0';
import * as L from '../library.js?v=0.27.0';
import { Canvas } from '../canvas.js?v=0.27.0';
import { createWorkbench } from './workbench.js?v=0.27.0';
import { measureNodeCard } from '../../dist/lattice-ui.js?v=0.27.0';

let workbench = null;
let root = null;
let canvas = null;
let current = null;      // graph in view
let selected = null;     // node or wire
let selectedKind = null;
let selectionEpoch = 0;
let uiEpoch = 0;
let graphEditAdapter = null;
let pendingImport = null;
let graphViews = null, workspacePrepared = null, editorDraw = null, rootRunEpoch = 0, workspaceRevision = 0;
let documentTransition = false, libraryRevision = 0, restoringEditor = false, canvasTraceRows = null;
let viewSaveTimer = null, pinnedPreview = null, targetedPreview = null, selectedPreview = null, nativeWireBridge = null, nativeCatalog = null, positionEdit = null;
let nativeGroupPresenter = null, detachedClip = null, workspaceIssue = '';
let pendingSubgraphSave = null, pendingAddSystem = null;
const systemPresentationEffects = new WeakMap(), pendingSystemPresentation = new WeakMap();
let workflowActivityUnsubscribe = null;
let pendingDocumentPrompt = null;
// The final graph-touch notification renders dirty state after owned reconciliation.
// Defer only its intermediate view event for this exact document activation.
let documentRenderReconciliation = null;
let workflowFiles = null, documentCommands = null, fileStorageIssue = '';
let storyDocumentSetup = null, nodeWorkflowDataSetup = null, pendingConfiguredNode = null;
const nodeDocumentCaptures = new Map(), nodeCreationScopes = new WeakMap();
const editorCaptures = new WeakMap(), workflowNodePresentations = new WeakMap();
const commentCaptures = new WeakMap(), commentPresentationEffects = new WeakMap(), pendingCommentPresentation = new WeakMap();
const subgraphPresentationEffects = new WeakMap(), pendingSubgraphPresentation = new WeakMap();
// Qualified editor context and cached tabs share the existing root workflow runner.
export function setGraphEditAdapter(adapter = null) { graphEditAdapter = adapter; }
const activeEditRoot = () => graphEditAdapter?.root?.() ?? current;
const readGraphEditContext = () => graphEditAdapter?.readContext?.() ?? graphViews?.readEditContext() ?? { sessionId: String(uiEpoch), viewPath: [], readOnly: !isOpen() };
const graphDocumentHooks = {
    onSemanticChange(graph) {
        workflowRevision = isWorkflowGraph(graph) ? workflowSignature(graph) : null;
        documentTransition = true; workflowSession.cancel('Workflow document changed'); documentTransition = false;
    },
    reconcileViews(graph, summary) {
        if (graph === current) {
            const previous = documentRenderReconciliation;
            documentRenderReconciliation = { graph, captured: documentSession.capture() };
            try { reconcileWorkspaceDocument(summary); }
            finally { documentRenderReconciliation = previous; }
        }
        graphEditAdapter?.reconcileViews?.(graph, summary);
    },
};
export const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
};

export function toast(msg, type = 'info', context = {}) {
    const plainNotice = typeof msg === 'string' && ['info', 'success'].includes(type);
    const issue = plainNotice ? null : presentDiagnostic(msg, context);
    const message = issue?.message ?? msg, severity = issue?.severity ?? type;
    const t = safe(() => globalThis.toastr);
    if (t) t[severity]?.(message, 'Lattice');
    else console.log('[Lattice]', message);
}

export async function confirmBox(text, title = 'Lattice') {
    const c = ctx();
    try {
        const res = await c.callGenericPopup(text, c.POPUP_TYPE.CONFIRM, '', { okButton: 'Yes', cancelButton: 'No', title });
        return res === c.POPUP_RESULT.AFFIRMATIVE;
    } catch {
        return confirm(text);
    }
}

export async function inputBox(text, value = '') {
    const c = ctx();
    try {
        const res = await c.callGenericPopup(text, c.POPUP_TYPE.INPUT, value, { title: 'Lattice' });
        return (res === false || res === null || res === undefined) ? null : String(res);
    } catch {
        return prompt(text, value);
    }
}

export function profiles() {
    const cm = safe(() => ctx().extensionSettings?.connectionManager?.profiles) ?? [];
    return Array.isArray(cm) ? cm : [];
}


let workflowRevision = null, nodeProfileInputsKey = null;
let workflowProjection = null, workflowProjectionGraph = null;
let workflowState = { result: null, busy: false, status: '', applyIssue: '' };
const workflowSession = createWorkflowSession({ runtime: () => workflowRuntime.getNativeWorkflowController?.(), rootCurrent: () => current, runEpoch: () => rootRunEpoch, documentToken: () => documentSession.capture(), active: isOpen, changed: state => {
    const authorityChanged = state.result !== workflowState.result || state.reviewHandles !== workflowState.reviewHandles;
    workflowState = state;
    if (isOpen() && !documentTransition) { if (authorityChanged) refreshWorkflowPreparation(); updateWorkflowProjection(); }
} });
const receiveAutomaticWorkflow = () => workflowSession.receiveAutomatic(workflowRuntime.getNativeWorkflowController?.()?.lastAutomaticResult?.());
function storySetup() {
    const catalog = workflowRuntime.getStoryDocumentCatalog?.();
    if (!catalog) return null;
    return storyDocumentSetup ??= createStoryDocumentSetup(catalog);
}
function workflowDataSetup() {
    const catalog = workflowRuntime.getStoryDocumentCatalog?.();
    if (!catalog) return null;
    return nodeWorkflowDataSetup ??= createWorkflowDataSetup(catalog, { getStored: (scope, targetId) => {
        const ownValue = (object, key) => Object.getOwnPropertyDescriptor(object ?? {}, key)?.value;
        return ownValue(ownValue(ownValue(ctx().chatMetadata, 'latticeDocuments'), scope.userId), targetId);
    } });
}
function refreshStoryDocuments(notice = '') {
    const snapshot = storySetup()?.snapshot();
    workbench?.update({ storyDocuments: snapshot?.ok ? { ...snapshot.data, notice } : { key: '', revision: '', scope: { userId: '', chatId: '' }, documents: [], issue: 'Workflow Data requires an active user and chat.' } });
}
function storyDocumentsChanged(result) {
    if (!result.ok) return result;
    workflowSession.cancel('Workflow Data authorization changed');
    refreshWorkflowPreparation(); updateWorkflowProjection(); refreshStoryDocuments(result.data.message);
    return result;
}
const storyDocumentsActions = {
    refresh: () => refreshStoryDocuments(),
    load(key, targetId) { return storySetup()?.load(key, targetId) ?? { ok: false, error: { code: 'DOCUMENT_SETUP_UNAVAILABLE', message: 'Workflow Data setup is unavailable.' } }; },
    async save(key, definition) { const setup = storySetup(); return setup ? storyDocumentsChanged(await setup.save(key, definition)) : { ok: false, error: { code: 'DOCUMENT_SETUP_UNAVAILABLE', message: 'Workflow Data setup is unavailable.' } }; },
    async remove(key, targetId) { const setup = storySetup(); return setup ? storyDocumentsChanged(await setup.remove(key, targetId)) : { ok: false, error: { code: 'DOCUMENT_SETUP_UNAVAILABLE', message: 'Workflow Data setup is unavailable.' } }; },
};
let recallProjection = null, refreshingRecall = false, recallDetailsView = null;
function recallSelectionIds(){return canvas?.multi.size?[...canvas.multi]:canvas?.selection?.kind==='node'?[canvas.selection.id]:[];}
function recallSetupView(){
 let response;try{response=workflowRuntime.getNativeWorkflowController?.()?.syncRecall?.();}catch{}
 const status=response?.ok?response.data:null;
 const identity=graphViews?.readEditor().view.identity;
 recallProjection=projectRecallView({rootGraph:current,inventory:workspacePrepared?.planner.inventory,status,enabled:!!settings().enabled,issue:response?.error ? diagnosticText(response.error, { operation: 'recall' }) : '',nodeIds:recallSelectionIds(),viewKind:identity?.kind??'root',instancePath:identity?.instancePath??[]});
 canvas?.setRecallStatus(Object.fromEntries(Object.entries(recallProjection.nodes).flatMap(([id,node])=>node.badge?[[id,node.badge]]:[])));
 return recallProjection;
}
function refreshRecallOverview(){if(refreshingRecall)return;refreshingRecall=true;try{const view=recallSetupView();if(recallDetailsView)recallDetailsView={...recallDetailsView,recall:recallProjection?.nodes[recallDetailsView.address.nodeId]};workbench?.update({recall:view,...(recallDetailsView?{nodeDetails:recallDetailsView}:{})});return view;}finally{refreshingRecall=false;}}
function recallUiContext(){if(!isOpen()||!graphViews||!recallProjection)return null;return {editorToken:graphViews.readEditContext().sessionId+':'+graphViews.readEditor().view.key,documentToken:documentSession.capture(),selectionEpoch,viewKind:graphViews.readEditor().view.identity.kind,projection:recallProjection};}
const recallCommands=createRecallCommands({readContext:recallUiContext,isContextCurrent:captured=>{const now=recallUiContext();return !!now&&now.editorToken===captured.editorToken&&now.documentToken===captured.documentToken&&now.selectionEpoch===captured.selectionEpoch;},captureRecall:()=>workflowRuntime.getNativeWorkflowController?.()?.captureRecall?.(),changeRecallQueues:(capture,request)=>workflowRuntime.getNativeWorkflowController?.()?.changeRecallQueues?.(capture,request),openDetails:openRecallDetails,changed:refreshRecallOverview});
function captureRecallActions(nodeIds,scope='selected'){const captured=recallCommands.capture(nodeIds,scope);return {queue:()=>captured.ok?recallCommands.change(captured.data,'queue'):captured,cancel:()=>captured.ok?recallCommands.change(captured.data,'cancel'):captured};}
const recallActions={refresh:refreshRecallOverview,capture:captureRecallActions,reportIssue:message=>toast(message,'error'),change(nodeIds,action,scope='selected'){const result=captureRecallActions(nodeIds,scope)[action]();if(!result.ok)toast(result.error,'error');return result;},reveal:nodeId=>openRecallDetails(nodeId,'all')};
function workspaceInputs() { const context = ctx(), hostProfiles = profiles(); nodeProfileInputsKey = nodeProfileMetadataKey(context, hostProfiles); return { settings: settings(), profiles: readNodeProfileMetadata(context, hostProfiles), activeModel: activeModelMetadata(context), workflowData: workflowDataSetup()?.snapshot() ?? { available: false, key: '', documents: [] }, result: workflowState.result, resolveBinding: (node, graph) => resolveBinding(node, graph, ctx()), candidateStatus: candidate => workflowRuntime.getNativeWorkflowController?.()?.candidateStatus?.(candidate) }; }
function refreshWorkflowPreparation() {
    if (!current || !workspacePrepared) return;
    workspacePrepared.workflow = prepareWorkflowProjection(current, { ...workspaceInputs(), ...(workspacePrepared.planner ? { planner: workspacePrepared.planner } : {}) });
}
/** Explicit host events and popup opening refresh metadata; camera/selection reuse it. */
function refreshNodeProfileMetadata(selection = null) {
    if (!isOpen() || !graphViews || !workspacePrepared) return;
    if (selection && !detailCapture(selection, true).ok) return;
    refreshWorkflowPreparation(); updateWorkflowProjection();
}
function refreshNodeProfileSettings() {
    if (!isOpen() || !graphViews || !workspacePrepared) return;
    if (nodeProfileMetadataKey(ctx(), profiles()) === nodeProfileInputsKey) return;
    refreshNodeProfileMetadata();
}
function installRecoveryLifecycle() {
    onRecoveryIssue(error => toast(error.message, 'error'));
    // Publish pending camera/selection before the state's pagehide submission.
    globalThis.addEventListener?.('pagehide', () => { if (graphViews) persistGraphViews(true, false, () => {}); }, { capture: true });
}
function persistGraphViews(flush = false, deferSerialization = false, persistSettings = () => save({ recovery: false })) {
    clearTimeout(viewSaveTimer);
    const session = graphViews, token = documentSession.capture();
    const current = () => graphViews === session && session && documentSession.stillCurrent(token) && session.readRoot() === activeWorkflow();
    const snapshot = () => {
        if (!current()) return false;
        const result = session.serialize();
        if (!result.ok) return false;
        setActiveWorkspaceViews(result.data); return true;
    };
    // Authored presentation is recoverable now; camera and selection bursts
    // publish once at the boundary captured by this document activation.
    if (!deferSerialization) snapshot();
    const persist = () => {
        if (!current()) return;
        viewSaveTimer = null;
        if (deferSerialization && !snapshot()) return;
        return persistSettings();
    };
    if (flush) return persist();
    viewSaveTimer = setTimeout(persist, 180);
}

function prepareWorkspaceDocument(change = null) {
    const result = prepareWorkspaceViews(current, { ...workspaceInputs(), ...(change?.artifacts ? { artifacts: change.artifacts } : {}) });
    if (!result.ok) { workspaceIssue = diagnosticText(result.error); toast(result.error, 'error'); return false; }
    workspaceIssue = '';
    workspacePrepared = result.data; workspaceRevision++;
    const shelf = L.loadSubgraphLibrary();
    workspacePrepared.libraryIssue = shelf.ok ? '' : diagnosticText(shelf.error);
    workspacePrepared.shelfDefinitions = shelf.ok ? shelf.data.definitions : {};
    const entries = shelf.ok ? L.getSubgraphShelfEntries() : shelf;
    workspacePrepared.shelfEntries = entries.ok ? entries.data : [];
    workspacePrepared.libraryDefinitions = { ...workspacePrepared.shelfDefinitions, ...(current.definitions ?? {}) };
    const library = prepareLibraryViews(current.id, workspacePrepared.libraryDefinitions);
    if (library.ok) { workspacePrepared.definitionInfo = library.data.definitionInfo; workspacePrepared.navigation.push(...library.data.navigation); workspacePrepared.preparedViews.push(...library.data.preparedViews); }
    else { workspacePrepared.definitionInfo = {}; workspacePrepared.libraryIssue = diagnosticText(library.error); }
    workspacePrepared.catalogs = new Map();
    for (const view of workspacePrepared.preparedViews) if (view.identity.kind !== 'library') {
        const catalog = prepareNativeSearchCatalog({schema:3,runtime:2,mode:current.mode,workflowId:current.id,viewPath:view.identity.instancePath ?? [],inDefinition:view.identity.kind === 'instance'}, {checkedLibraryClosures:workspacePrepared.shelfEntries.map(definition=>({definition,snapshots:workspacePrepared.shelfDefinitions}))});
        if (catalog.ok) workspacePrepared.catalogs.set(viewIdentityKey(view.identity),catalog.data);
    }
    return true;
}
function activateEditorDraw() {
    if (!graphViews || !canvas) return;
    cancelConfiguredNode();
    selectedPreview = null;
    // Cancellation belongs to the incoming view restoration; its callbacks
    // must not overwrite the retained selection or project the outgoing scene.
    restoringEditor = true;
    canvas.cancelGesture('view-change', { render: false }); cancelImportReview();
    // A rejected coordinate restoration retains its diagnostic and pending
    // effect, while the Canvas must still reflect the current validated view.
    applyPendingCommentPresentation();
    applyPendingSubgraphPresentation();
    applyPendingSystemPresentation();
    const editor = graphViews.readEditor();
    editorDraw = projectEditorDraw(editor, { canvasOnly: true }); canvasTraceRows=null;
    replaceNativeBridge();
    canvas.setGraph(editorDraw, { viewKey: graphViews.readEditContext().activationId + ':' + editor.view.key });
    const selection = editor.view.selection.primary;
    const primary=selection && editorDraw[selection.kind === 'node' ? 'nodes' : selection.kind === 'wire' ? 'wires' : 'groups']?.[selection.id] ? selection : null;
    const multi=editor.view.selection.multi.filter(id=>editorDraw.nodes[id]);
    if (multi.length) canvas.setMulti(multi);
    else if (primary) canvas.select(primary);
    else if (canvas.wireMulti.size) canvas.select({ kind: 'wire', id: [...canvas.wireMulti].at(-1) });
    else canvas.select(null);
    restoringEditor = false;
    const restoredPrimary = canvas.selection, restoredMulti = [...canvas.multi];
    selectedKind = restoredMulti.length > 1 ? 'multi' : restoredPrimary?.kind ?? null;
    selected = restoredMulti.length > 1 ? restoredMulti : restoredPrimary ? editorDraw[restoredPrimary.kind === 'node' ? 'nodes' : restoredPrimary.kind === 'wire' ? 'wires' : 'groups'][restoredPrimary.id] : null;
    graphViews.updateView({ selection: { primary: restoredPrimary, multi: restoredMulti }, inspector: { ...editor.view.inspector, item: restoredPrimary } });
    root.classList.toggle('pc-details-hidden',!editor.view.inspector.open);syncPaneToggles();
    workbench.update({ graphViews: graphViews.project().graphViews, readOnly: editor.readOnly });
    updateWorkflowProjection(); paintHistory();
}
function refreshWorkspaceDocument(change = null) {
    if (!isWorkflowGraph(current) || !prepareWorkspaceDocument(change)) return;
    if (graphViews) {
        const replaced = graphViews.replacePreparedViews(workspacePrepared);
        if (!replaced.ok) return toast(replaced.error, 'error');
    }
    activateEditorDraw(); persistGraphViews();
}
function reconcileWorkspaceDocument(summary) {
    const change = committedGraphChange(current, summary);
    if (change?.kind !== 'coordinates' || !graphViews || !canvas) return refreshWorkspaceDocument(change);
    const patched = graphViews.applyCommittedCoordinates(summary);
    if (!patched.ok) return refreshWorkspaceDocument(change);
    const editor = graphViews.readEditor(), nodePresentation = { ...editor.view.nodePresentation }, groupPresentation = { ...(editor.view.groupPresentation ?? {}) };
    for (const id of change.nodeIds) if (nodePresentation[id]) {
        const item = { ...nodePresentation[id] }; delete item.x; delete item.y;
        if (Object.keys(item).length) nodePresentation[id] = item; else delete nodePresentation[id];
    }
    for (const id of change.groupIds) if (groupPresentation[id]) {
        const item = { ...groupPresentation[id] }; delete item.x; delete item.y; delete item.frame;
        if (Object.keys(item).length) groupPresentation[id] = item; else delete groupPresentation[id];
    }
    graphViews.updateView({ nodePresentation, groupPresentation }); workspaceRevision++;
    for (const id of change.groupIds) Object.assign(editorDraw.groups[id], structuredClone(change.candidate.groups[id]));
    const nodeUpdates = change.nodeIds.map(id => ({ id, x: change.candidate.nodes[id].x, y: change.candidate.nodes[id].y }));
    const groupUpdates = change.groupIds.map(id => ({ id, ...change.candidate.groups[id] }));
    canvas.setPositions(nodeUpdates, groupUpdates);
    updateWorkflowProjection(); paintHistory(); persistGraphViews();
}
function navigateGraphView(action, ...args) {
    if (!graphViews) return;
    canvas?.cancelGesture(); persistGraphViews(true);
    const result = graphViews[action](...args);
    if (!result.ok) return toast(result.error, 'error');
    activateEditorDraw(); persistGraphViews();
}

async function onSaveGraph(saveAs = false) {
    canvas?.cancelGesture(); H.flush(current);
    return ensureDocumentCommands().save(saveAs);
}
function downloadGraphViewJSON(json, fileName) {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    try {
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = fileName; anchor.click();
    } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
}
function onExportGraphView(key) {
    const view = graphViews?.project().graphViews.tabs.find(view => view.key === key);
    if (!view) return;
    try {
        if (view.identity.kind === 'root') {
            onExportGraph();
            return;
        }
        const prepared = workspacePrepared?.preparedViews.find(entry => viewIdentityKey(entry.identity) === view.key);
        const ref = view.identity.kind === 'library' ? view.identity.definitionRef : prepared?.definitionRef;
        const definition = ref && workspacePrepared?.libraryDefinitions[definitionRefKey(ref)];
        if (!definition) throw new Error('The subgraph is no longer available.');
        downloadGraphViewJSON(JSON.stringify(exportSubgraph(definition, workspacePrepared.libraryDefinitions), null, 2), `${definition.name.replace(/[^\w-]+/g, '_')}.subgraph.json`);
    } catch (error) { toast(error, 'error', { action: 'export this graph' }); }
}
const graphViewActions = {
    openInstance: path => navigateGraphView('openInstance', [...path]), openLibrary: ref => navigateGraphView('openLibrary', ref),
    focusView: key => navigateGraphView('focusView', key), closeView: key => navigateGraphView('closeView', key), reopenView: key => navigateGraphView('reopenView', key), revealParent: () => navigateGraphView('revealParent'),
    closeOtherViews(key) { if (!graphViews) return; for (const tab of graphViews.project().graphViews.tabs) if (tab.identity.kind !== 'root' && tab.key !== key) graphViews.closeView(tab.key); activateEditorDraw(); persistGraphViews(); },
    exportView: key => onExportGraphView(key),
    renameView: (key, name) => onRenameGraphView(key, name), canRenameView: key => canRenameGraphView(key),
};
function samePreviewTerminal(first, second) {
    return first?.kind === 'terminal' && second?.kind === 'terminal' && Array.isArray(first.address?.instancePath) && Array.isArray(second.address?.instancePath)
        && JSON.stringify([first.address.workflowId, first.address.instancePath, first.address.nodeId]) === JSON.stringify([second.address.workflowId, second.address.instancePath, second.address.nodeId]);
}
const previewAddress = target => target?.kind === 'terminal' ? target.address : target;
const effectivePreview = () => pinnedPreview || targetedPreview || selectedPreview;
function nodePreviewChoices(node) {
    const editor = graphViews?.readEditor();
    if (!node || editor?.view.identity.kind === 'library' || isCommentFrame(node)) return [];
    const path = editor?.view.identity.instancePath ?? [];
    return workspacePrepared?.previewChoices.filter(choice => {
        const address = previewAddress(choice.target);
        return address.workflowId === current.id && address.nodeId === node.id && JSON.stringify(address.instancePath) === JSON.stringify(path);
    }) ?? [];
}
function togglePreviewTarget(node = selectedKind === 'node' ? selected : null) {
    if (!node) {
        if (!targetedPreview) return false;
        targetedPreview = null; updateWorkflowProjection(); return true;
    }
    const choices = nodePreviewChoices(node);
    if (!choices.length) return false;
    const address = previewAddress(targetedPreview), next = previewAddress(choices[0].target);
    if (address && address.workflowId === next.workflowId && address.nodeId === next.nodeId && JSON.stringify(address.instancePath) === JSON.stringify(next.instancePath)) targetedPreview = null;
    else {
        const choice = choices.find(choice => JSON.stringify(choice.target) === JSON.stringify(effectivePreview())) ?? choices[0];
        targetedPreview = structuredClone(choice.target); pinnedPreview = null;
        workbench.revealPreview();
    }
    updateWorkflowProjection(); return true;
}
function currentRootPreviewTerminal(target) {
    const editor = graphViews?.readEditor();
    return isOpen() && editor && editor.view.identity.workflowId === current?.id
        && (editor.view.identity.kind === 'root' && !editor.readOnly || editor.view.identity.kind === 'instance' && JSON.stringify(editor.view.identity.instancePath) === JSON.stringify(target?.address?.instancePath))
        && current?.mode === 'native-unified' && target?.kind === 'terminal' && target.address?.workflowId === current.id && Array.isArray(target.address.instancePath)
        && workspacePrepared?.planner?.inventory.primitives.some(unit => unit.terminal && unit.node.type === 'workflow' && unit.node.operation === 'review-publish' && samePreviewTerminal({ kind: 'terminal', address: unit.address }, target))
        && workspacePrepared?.previewChoices.some(choice => samePreviewTerminal(choice.target, target));
}
function currentPreviewHandle(selector) {
    const result = workflowState.result, target = effectivePreview();
    return !selector?.kind && current?.schema === 3 && current.runtime === 2 && currentRootPreviewTerminal(target) && samePreviewTerminal(selector?.terminal, target)
        && !workflowState.busy && workflowState.availability === 'current' && result === workflowSession.result() && result?.ok === true && result.mode === 'root' && result.runId === selector.runId
        && workflowState.reviewHandles?.some(handle => handle.handleId === selector.handleId && handle.runId === selector.runId && samePreviewTerminal(handle.terminal, selector.terminal));
}
function applyPreviewReview(selector) {
    if (currentPreviewHandle(selector)) return workflowSession.apply(selector);
}
function rejectPreviewReview(selector) {
    if (currentPreviewHandle(selector)) workflowSession.reject();
}
function workflowView() {
    if (!workspacePrepared && current) prepareWorkspaceDocument();
    if (targetedPreview && !workspacePrepared?.previewChoices.some(choice => JSON.stringify(choice.target) === JSON.stringify(targetedPreview))) targetedPreview = null;
    const editor = graphViews?.readEditor(), viewPath = editor?.view.identity.kind === 'instance' ? editor.view.identity.instancePath : [];
    const selectedId = selectedKind === 'node' ? selected?.id : null;
    const heldPreview = pinnedPreview || targetedPreview;
    let view = projectPreparedWorkflow(workspacePrepared?.workflow, { ...workflowState, viewPath, selectedId, selectedTarget: selectedPreview, pinnedPreview: heldPreview });
    if (!selectedPreview || selectedPreview.workflowId !== current.id && selectedPreview.address?.workflowId !== current.id) selectedPreview = view.targets?.find(target => (target.kind === 'terminal' ? target.address.nodeId : target.nodeId) === selectedId) ?? view.targets?.find(target => target.kind === 'terminal') ?? view.targets?.[0] ?? null;
    const effectiveTarget = effectivePreview();
    const selectedReviewHandle = workflowState.reviewHandles?.find(handle => samePreviewTerminal(handle.terminal, effectiveTarget));
    view = projectPreparedWorkflow(workspacePrepared?.workflow, { ...workflowState, viewPath, selectedId, selectedTarget: effectiveTarget, pinnedPreview: heldPreview, selectedReviewHandle });
    const presentation = editor?.view.nodePresentation ?? {};
    view = { ...view, nodes: view.nodes.map(node => { const saved = editor?.prepared.savedGraph.nodes[node.id] ?? node, overlay = readNodePresentation(saved, presentation[node.id]); const title = (overlay.alias || (typeof saved.title === 'string' ? saved.title : '') || node.canonicalTitle).slice(0,80);
        const key = JSON.stringify([overlay.alias, overlay.compact, title]), previous = workflowNodePresentations.get(node);
        if (Object.isFrozen(node) && previous?.key === key) return previous.data;
        const data = Object.freeze({ ...node, ...overlay, title });
        if (Object.isFrozen(node)) workflowNodePresentations.set(node, { key, data });
        return data; }), issues: [...view.issues, ...(graphViews?.project().warnings.map(warning => warning.message) ?? [])] };
    workflowProjection = view; workflowProjectionGraph = current;
    return view;
}
function guideInsertionIsBusy(activity = workflowRuntime.getNativeWorkflowController?.()?.activity?.()) {
    return !!workflowState.busy || !!activity?.busy;
}
function updateWorkflowProjection() {
    const activity = workflowRuntime.getNativeWorkflowController?.()?.activity?.();
    const ownedBusy = !!workflowState.busy || !!activity?.busy && activity.graph === current;
    const view = { ...workflowView(), ownedBusy };
    const revision = graphViews ? graphViews.readEditContext().sessionId + ':' + workspaceRevision : String(uiEpoch);
    const rootWorkflow = { ...projectPreparedWorkflow(workspacePrepared?.workflow,workflowState), ownedBusy };
    if (canvas && graphViews) canvas.setNodeProfiles?.(projectNodeProfiles(graphViews.readEditor(), view, revision));
    const recall = recallSetupView();
    const panels = graphViews ? projectWorkspacePanels({ ...graphViews.readEditor(), documentNamespace: documentSession.draftNamespace() }, view, { ...workflowState, enabled: !!settings().enabled }, revision, selectedPreview, pinnedPreview || targetedPreview, rootWorkflow, workspacePrepared.idleRunRows, workspacePrepared.previewChoices) : {};
    if (canvas && graphViews) {
        const editor = graphViews.readEditor(), address = previewAddress(targetedPreview);
        canvas.setPreviewTarget(address && editor.view.identity.kind !== 'library' && address.workflowId === current.id && JSON.stringify(address.instancePath) === JSON.stringify(editor.view.identity.instancePath ?? []) ? address.nodeId : null);
    }
    recallDetailsView=panels.nodeDetails&&graphViews.readEditor().view.identity.kind!=='library'&&recallProjection?.nodes[panels.nodeDetails.address.nodeId]?{...panels.nodeDetails,recall:recallProjection.nodes[panels.nodeDetails.address.nodeId]}:null;
    if(recallDetailsView)panels.nodeDetails=recallDetailsView;
    if (panels.outputPreview) panels.outputPreview = { ...panels.outputPreview, pinned: !!pinnedPreview, targeted: !!targetedPreview, followSelection: !pinnedPreview && !targetedPreview, busy: panels.outputPreview.busy || !!activity?.busy };
    if (canvas && graphViews && editorDraw && canvasTraceRows!==view.rows) { canvasTraceRows=view.rows;const traces = []; const visit = rows => { for (const row of rows ?? []) { traces.push({ id: row.address.nodeId, status: row.status }); } }; if(graphViews.readEditor().view.identity.kind!=='library')visit(view.rows); canvas.setTrace(traces); }
    workbench?.update({ workflow: view, rootWorkflow, guideInsertionBusy: guideInsertionIsBusy(activity), menuContextKey: graphViews?.readEditContext().sessionId, menuCapabilities: selectionMenuCapabilities(), recall, ...panels, nativeDiagnostic: workspaceIssue, nativeFlatCanvas: !settings().ui?.theme?.style?.grid });
}
function prepareGroupPresentation() {
    const captured = captureEditor(true); if (!captured.ok) return null;
    return (id, collapsed) => {
        if (!editorCurrent(captured.data) || typeof id !== 'string' || typeof collapsed !== 'boolean') return false;
        const editor = graphViews.readEditor();
        if (!Object.hasOwn(editor.prepared.savedGraph.groups ?? {}, id) || !Object.hasOwn(editorDraw?.groups ?? {}, id)) return false;
        if (editorDraw.groups[id].collapsed === collapsed) return true;
        const groupPresentation = { ...editor.view.groupPresentation, [id]: { ...editor.view.groupPresentation?.[id], collapsed } };
        const updated = graphViews.updateView({ groupPresentation }); if (!updated.ok) return false;
        editorDraw.groups[id].collapsed = collapsed;
        canvas.render(); updateWorkflowProjection(); persistGraphViews(); return true;
    };
}
function presentNode(id, key, value) {
    if (!graphViews || !editorDraw?.nodes[id] || !['alias', 'compact'].includes(key)) return;
    const editor = graphViews.readEditor(), nodePresentation = { ...editor.view.nodePresentation, [id]: { ...editor.view.nodePresentation[id], [key]: key === 'alias' ? String(value).slice(0,80) : value === true } };
    const updated = graphViews.updateView({ nodePresentation }); if (!updated.ok) return toast(updated.error, 'error');
    Object.assign(editorDraw.nodes[id].presentation ??= {}, nodePresentation[id]); canvas.render(true); updateWorkflowProjection(); persistGraphViews();
}
function focusAlias(node) {
    if (!editorDraw?.nativeCards?.[node?.id] || isCommentFrame(node)) return;
    showSettings({ kind: 'node', id: node.id });
    const input = root.querySelector('[aria-label="Node name"]'); input?.focus(); input?.select();
}
function compactCardShortcut(event) {
    if (event.key.toLowerCase() !== 'c' || !event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.repeat || typing() || !commentShortcutAvailable()) return false;
    if (selectedKind !== 'node' || !selected?.id || !canvas?.host?.contains(document.activeElement) || !editorDraw?.nativeCards?.[selected.id] || isCommentFrame(selected)) return false;
    const node = editorDraw.nodes[selected.id];
    presentNode(node.id, 'compact', node.presentation?.compact !== true); return true;
}
function syncNativeRevision(reason) {
    if (!isWorkflowGraph(current)) return false;
    const revision = workflowSignature(current);
    if (revision === workflowRevision) return false;
    workflowRevision = revision; workflowSession.cancel(reason); return true;
}
const workflowActions = {
    presentNode,
    run: () => graphViews ? workflowSession.run() : toast('The current workflow is unavailable.', 'error'),
    apply: selector => applyPreviewReview(selector), reject: () => workflowSession.reject(),
};
function defaultNodeSpot() {
    const rect = canvas.host.getBoundingClientRect(), zoom = canvas.view.zoom || 1;
    const center = canvas.toGraph(rect.left + rect.width / 2 - Math.min(130 * zoom, rect.width / 4), rect.top + rect.height / 2 - 60 * zoom);
    const nodes = Object.values(editorDraw?.nodes ?? current.nodes), width = 260, height = 140, gap = 24;
    const vacant = spot => nodes.every(node => spot.x + width + gap <= node.x || spot.x >= node.x + canvas.widthOf(node) + gap || spot.y + height + gap <= node.y || spot.y >= node.y + canvas.heightOf(node) + gap);
    if (vacant(center)) return center;
    for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
        const spot = canvas.toGraph(rect.left + 16 + col * Math.max(36, (rect.width - 32) / 6), rect.top + 16 + row * Math.max(36, (rect.height - 32) / 6));
        if (vacant(spot)) return spot;
    }
    return { x: center.x + nodes.length * 28, y: center.y + nodes.length * 28 };
}
export function isOpen() { return !!root && root.classList.contains('pc-open'); }
export function open() {
    const wasOpen = isOpen();
    build(); root.classList.add('pc-open'); document.addEventListener('pc-native-result', receiveAutomaticWorkflow);
    safe(() => applyTheme()); current = activeWorkflow(); ensureDocumentCommands();
    setCanvasGraph({ cancelRun: wasOpen }); renderAll();
    workflowActivityUnsubscribe?.();
    workflowActivityUnsubscribe = workflowRuntime.getNativeWorkflowController?.()?.subscribeActivity?.(() => { if (isOpen() && graphViews && !documentTransition) updateWorkflowProjection(); }) ?? null;
}
export function close() {
    workflowActivityUnsubscribe?.(); workflowActivityUnsubscribe = null;
    cancelConfiguredNode();
    documentCommands?.cancelReplacement();
    chooseDocumentPrompt('cancel');
    cancelImportReview(); document.removeEventListener('pc-native-result', receiveAutomaticWorkflow);
    documentTransition = true; workflowSession.cancel('Workflow view closed'); documentTransition = false;
    canvas?.cancelGesture(); persistGraphViews(true); graphViews?.deactivate(); graphViews = null; rootRunEpoch++; uiEpoch++;
    workbench?.update({ graphViews: undefined });
    nativeWireBridge?.cancel('view-close'); root?.classList.remove('pc-open');
}
export function toggle() { isOpen() ? close() : open(); }
function setCanvasGraph({ cancelRun = true } = {}) {
    cancelConfiguredNode();
    chooseDocumentPrompt('cancel');
    canvas?.cancelGesture(); persistGraphViews(true); const initializeCamera = !activeWorkspaceViews() && (!current.view || current.view.x === 0 && current.view.y === 0 && current.view.zoom === 1);
    graphViews?.deactivate(); graphViews = null; workspacePrepared = null; editorDraw = null; rootRunEpoch++;
    documentTransition = true;
    workflowSession.syncDocument();
    if (cancelRun) workflowSession.cancel('Workflow graph changed');
    documentTransition = false;
    uiEpoch++; selected = null; selectedKind = null; pinnedPreview = null; targetedPreview = null; selectedPreview = null;
    canvas?.cancelGesture(); nativeWireBridge?.cancel('root-change'); cancelImportReview();
    pendingSubgraphSave = null; pendingAddSystem = null; workbench?.update({ addSystem: null });
    workbench.update({ graphViews: undefined, portalManager: null, subgraphSave: null, nodeDetails: null, commentDetails: null, outputPreview: null, nativeChoices: [], nativeSearch: null, nativePinMenu: null });
    if (prepareWorkspaceDocument()) {
        const created = createGraphViewSession({ root: current, activationId: String(uiEpoch), ...workspacePrepared, persisted: activeWorkspaceViews(), initialCamera: current.view });
        if (created.ok) { graphViews = created.data; root.classList.remove('pc-details-hidden'); syncPaneToggles(); activateEditorDraw(); }
        else workspaceIssue = diagnosticText(created.error);
    }
    if (!graphViews) {
        canvas.setGraph({ schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {}, groups: {}, nativeCards: {}, view: { x: 0, y: 0, zoom: 1 } });
        workbench.update({ nativeDiagnostic: workspaceIssue || 'This workflow could not be opened. Import a current Lattice workflow.' });
    }
    workflowRevision = isWorkflowGraph(current) ? workflowSignature(current) : null; receiveAutomaticWorkflow();
    if (initializeCamera && graphViews) {
        const graph = current, epoch = uiEpoch;
        // Let pane resize observers settle before measuring shelf and meter clearance.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!stillEditing(graph, epoch) || !graphViews || graphViews.readEditor().view.identity.kind !== 'root') return;
            const rect = canvas.host.getBoundingClientRect(), shelf = canvas.host.parentElement?.querySelector('.pc-node-shelf')?.getBoundingClientRect(), meter = canvas.host.parentElement?.querySelector('.pc-run-meter')?.getBoundingClientRect();
            const first = Object.values(editorDraw.nodes).filter(node => !node.inGroup || !editorDraw.groups[node.inGroup]?.collapsed).sort((a,b) => a.y-b.y || a.x-b.x)[0];
            const camera = initialWorkspaceCamera(first ? { ...first, w: canvas.widthOf(first), h: canvas.heightOf(first) || 120 } : null, { width: rect.width, shelf: shelf ? { x: shelf.left-rect.left, y: shelf.top-rect.top, w: shelf.width, h: shelf.height } : null, meter: meter ? { x: meter.left-rect.left, y: meter.top-rect.top, w: meter.width, h: meter.height } : null });
            Object.assign(canvas.view, camera); canvas.applyTransform();
        }));
    }
}
function stillEditing(graph, epoch) { return isOpen() && current === graph && uiEpoch === epoch; }
function mkBtn(icon, title, fn, cls = '') { const button = el('button', 'pc-btn menu_button ' + cls); button.type = 'button'; button.innerHTML = '<i class="fa-solid ' + icon + '"></i>'; button.title = title; button.addEventListener('click', fn); return button; }
function build() {
    if (root) return;
    workbench = createWorkbench({
        openExample: onOpenExample,
        refreshExamples: refreshExampleCatalog,
        setEnabled(enabled) { settings().enabled = enabled; save(); renderStatus(); },
        command(name) {
            const menuCommand = menuCommandAction(name); if (menuCommand) return menuCommand();
            if (name.startsWith('open-recent:')) return ensureDocumentCommands().recent(name.slice(12));
            if (name.startsWith('recover-workflow:')) return ensureDocumentCommands().recover(name.slice(17));
            const commands = { new: onNewGraph, rename: onRenameGraph, save: onSaveGraph, 'save-as': () => onSaveGraph(true), 'download-document': onSaveGraph, 'clear-recent': () => ensureDocumentCommands().clearRecent(), 'open-workflow': onImportGraph, 'import-into-graph': onImportIntoGraph, export: onExportGraph, 'export-archived-workflows': onExportArchivedWorkflows, 'manage-portals': () => openPortalManager(), undo: doUndo, redo: doRedo,
                fit: () => canvas.fit(), copy: () => copySelection(), cut: () => copySelection(true), paste: pasteFromClipboard,
                'delete-selection': () => canvas.deleteSelection(), 'run-workflow': workflowActions.run, 'stop-workflow': stopOwnedWorkflow,
                theme: toggleThemePopover, inspector: togglePane, 'reveal-inspector': () => { if (root.classList.contains('pc-details-hidden')) togglePane(); }, close };
            return commands[name]?.();
        },
        mode: mode => canvas.setMode(mode), zoom: factor => { const rect = canvas.host.getBoundingClientRect(); canvas.zoomBy(factor, rect.left + rect.width / 2, rect.top + rect.height / 2); }, fitSelection: () => canvas.fitSelection(),
        resizeStart: () => canvas?.cancelGesture(), resizeDetails,
        graphViewActions, nodeDetails: nodeDetailsActions, nodeGuide: nodeGuideActions, commentDetails: commentDetailsActions, outputPreview: outputPreviewActions, runDetails: runDetailsActions,
        chooseNative: chooseNativeNode, managePortals: () => openPortalManager(), shelfSubgraph: shelfSubgraphAction,
        addSystem: { close() { pendingAddSystem = null; workbench.update({ addSystem: null }); }, preview: previewAddSystem, submit: submitAddSystem },
        subgraphSave: { close() { pendingSubgraphSave = null; workbench.update({ subgraphSave: null }); }, save: saveSubgraphToShelf },
        documentPrompt: { choose: chooseDocumentPrompt },
        recall: recallActions, storyDocuments: storyDocumentsActions, configureNode: configureNodeActions,
        acceptImport: acceptImportReview, cancelImport: cancelImportReview, prepareImportAgain,
    });
    root = workbench.root; hookHistory();
    onWorkflowActivated(({ graph }) => {
        documentTransition = true; workflowSession.syncDocument(); documentTransition = false;
        if (isOpen()) { current = graph; setCanvasGraph(); renderAll(); }
    });
    documentSession.subscribe(event => {
        const pending = documentRenderReconciliation;
        if (event.type === 'views' && event.graph === pending?.graph && documentSession.stillCurrent(pending.captured)) return;
        renderDocumentState();
    }); installRecoveryLifecycle();
    const nativeContext = ctx();
    for (const name of ['CHAT_CHANGED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_SENT', 'GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED']) {
        if (nativeContext.eventTypes?.[name]) nativeContext.eventSource?.on?.(nativeContext.eventTypes[name], () => { if (isOpen()) { workflowSession.refreshFreshness(); if (name === 'CHAT_CHANGED') { cancelConfiguredNode(); refreshStoryDocuments(); } } });
    }
    for (const name of ['CHATCOMPLETION_MODEL_CHANGED', 'CHATCOMPLETION_SOURCE_CHANGED', 'MAIN_API_CHANGED', 'CONNECTION_PROFILE_LOADED', 'CONNECTION_PROFILE_CREATED', 'CONNECTION_PROFILE_UPDATED', 'CONNECTION_PROFILE_DELETED', 'OAI_PRESET_CHANGED_AFTER', 'PRESET_CHANGED', 'PRESET_DELETED', 'PRESET_RENAMED', 'SETTINGS_LOADED_AFTER', 'EXTENSION_SETTINGS_LOADED']) {
        if (nativeContext.eventTypes?.[name]) nativeContext.eventSource?.on?.(nativeContext.eventTypes[name], () => refreshNodeProfileMetadata());
    }
    if (nativeContext.eventTypes?.SETTINGS_UPDATED) nativeContext.eventSource?.on?.(nativeContext.eventTypes.SETTINGS_UPDATED, refreshNodeProfileSettings);
    const panes = safe(() => JSON.parse(globalThis.localStorage?.getItem('lattice.workspace.panes') || '{}')) || {};
    root.classList.toggle('pc-details-hidden', typeof panes.inspector === 'boolean' ? !panes.inspector : window.innerWidth < 860); syncPaneToggles();
    document.addEventListener('pc-recall-state', () => { if(isOpen())refreshRecallOverview(); });
    document.addEventListener('pc-state', () => { if(isOpen())refreshRecallOverview(); });
    document.addEventListener('pc-theme', () => { if (canvas && isOpen()) { updateWorkflowProjection(); canvas.render(); } });
    canvas = new Canvas(workbench.parts.canvasHost, {
        lodKey: () => graphViews ? documentSession.draftNamespace() + ':' + graphViews.readEditor().view.key : undefined,
        onSelect(item, kind) {
            selectionEpoch++;
            selected = canvas.multi.size > 1 ? [...canvas.multi] : item; selectedKind = canvas.multi.size > 1 ? 'multi' : kind;
            if (graphViews && !restoringEditor) { selectedPreview = null; const primary = item && kind ? { kind, id: item.id } : null;
                graphViews.updateView({ selection: { primary, multi: [...canvas.multi] }, inspector: { ...graphViews.readEditor().view.inspector, item: primary } }); persistGraphViews(false, true); updateWorkflowProjection(); }
            if (!restoringEditor && kind === 'node' && ['subgraph-input', 'subgraph-output'].includes(item?.type) && root.classList.contains('pc-details-hidden')) togglePane();
            updateSelectionCount();
        },
        onView(camera) { workbench.update({ camera }); if (graphViews && !restoringEditor) { graphViews.updateView({ camera: { x: camera.x, y: camera.y, zoom: camera.zoom } }); persistGraphViews(false, true); } },
        onViewCommit: () => persistGraphViews(true),
        onOpen(node) { if (graphViews && node.type === 'subgraph') { const editor = graphViews.readEditor(); return editor.view.identity.kind === 'library' ? navigateGraphView('openLibrary', node.definition) : navigateGraphView('openInstance', [...(editor.view.identity.instancePath ?? []), node.id]); } showSettings({ kind: 'node', id: node.id }); },
        onToast: message => toast(message, 'error'), onReveal: showSettings,
        onHostResult(node) { showSettings({ kind: 'node', id: node.id }); workbench.revealPreview(); },
        onRecallDetails: openRecallDetails,
        onContextMenu: onCanvasMenu,
        onEmptyContextMenu(payload) {
            if (graphViews?.readEditor().view.identity.kind !== 'instance' && !canvas.multi.size) return false;
            onCanvasMenu({ ...payload, several: canvas.multi.size ? [...canvas.multi] : null }); return true;
        },
        nativeCard: node => editorDraw?.nativeCards?.[node.id], nativeBridge: () => nativeWireBridge,
        viewKey: () => graphViews?.readEditor().view.key,
        nativeScope() { const editor = graphViews?.readEditor(); return editor?.view.identity.kind === 'library' ? { readOnly: true } : { workflowId: current?.id, instancePath: editor?.view.identity.instancePath ?? [], readOnly: !editor || editor.readOnly }; },
        editProfile(selection, value) {
            const editor = graphViews?.readEditor(); if (!editor || editor.view.identity.kind === 'library') return { ok: false, error: { code: 'READ_ONLY', message: 'Library definitions are read-only.' } };
            const revision = graphViews.readEditContext().sessionId + ':' + workspaceRevision;
            const row = projectNodeProfiles(editor, workflowView(), revision).find(row => row.id === selection.address.nodeId);
            if (!row || !row.options.some(option => option.value === value)) return { ok: false, error: { code: 'PROFILE_MISSING', message: 'This connection is no longer available.' } };
            return nodeDetailsActions.editBinding(selection, 'profileId', 'override', value);
        },
        refreshProfiles: refreshNodeProfileMetadata,
        nativeAttachments, canEdit: () => !readGraphEditContext().readOnly,
        onNativeDelete: deleteNativeSelection, onNativeGroupPresentation: (id, collapsed) => nativeGroupPresenter?.(id, collapsed),
        onDragBlock(blocked) { if (blocked) beginPositionEdit(); },
        onPresentationChange: completePositionEdit,
        captureCommentEdit, onCommentPatch: commentPatch, onCommentCommand: commentCommand, onCommentLayout: commentLayout,
    });
    document.addEventListener('paste', event => { if (pendingDocumentPrompt) { event.preventDefault(); return; } if (!isOpen() || typing()) return; const text = event.clipboardData?.getData('text/plain') ?? ''; if (pasteOnCanvas(text || detachedClip)) event.preventDefault(); });
    document.addEventListener('keydown', event => {
        if (pendingDocumentPrompt) {
            event.preventDefault();
            if (event.key === 'Escape') chooseDocumentPrompt('cancel');
            else root.querySelector('.pc-document-prompt')?.focus({ preventScroll: true });
            return;
        }
        if (!isOpen()) return; const mod = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
        if (mod && !event.altKey && ['n', 'o', 's'].includes(key)) { event.preventDefault(); if (!event.repeat) { if (key === 'n') onNewGraph(); else if (key === 'o') onImportGraph(); else onSaveGraph(event.shiftKey); } return; }
        if (typing()) return;
        if (key === 't' && !mod && !event.shiftKey && !event.altKey && !event.repeat && !event.isComposing && !event.defaultPrevented) {
            if (togglePreviewTarget()) event.preventDefault();
            return;
        }
        if (key === 'r' && !mod && !event.shiftKey && !event.altKey && !event.repeat && !event.defaultPrevented && selectedKind === 'node') {
            const captured = captureEditor(true);
            const run = captured.ok && canvasPreviewMenuItems(selected, captured.data).find(item => item.id === 'run-to-here');
            if (run && !run.disabled) { event.preventDefault(); run.action(); }
            return;
        }
        if (event.key === 'Escape') { if (event.defaultPrevented) return; event.preventDefault(); if (canvas.cancelGesture()) return; if (canvas.selection || canvas.multi.size) { canvas.setMulti([]); canvas.select(null); } else close(); return; }
        if (event.key === 'F2' && selectedKind === 'node') { event.preventDefault(); focusAlias(selected); return; }
        if (key === 'f' && !mod && !event.altKey && !event.repeat) { event.preventDefault(); canvas.fitSelection(); return; }
        if (compactCardShortcut(event)) { event.preventDefault(); return; }
        if (key === 'c' && !event.shiftKey && !mod && !event.altKey && !event.repeat && commentShortcutAvailable()) { event.preventDefault(); addComment(); return; }
        if (mod && !event.altKey) {
            if (key === 'a') { event.preventDefault(); canvas.selectAll(); return; }
            if (key === 'g') { event.preventDefault(); event.shiftKey ? ungroupSelection() : groupSelection(); return; }
            if (key === 'z' || key === 'y') { event.preventDefault(); key === 'y' || event.shiftKey ? doRedo() : doUndo(); return; }
            if (['c', 'x'].includes(key) && !String(window.getSelection?.() ?? '').trim() && currentPick()) { event.preventDefault(); copySelection(key === 'x'); return; }
            if (key === 'd' && selectedKind === 'node') { event.preventDefault(); duplicateSelected(selected); return; }
        }
        if (['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); canvas.deleteSelection(); }
    });
    refreshExampleCatalog();
}
function refreshExampleCatalog() {
    try {
        workbench.update({ examples: projectWorkflowExamples(), examplesIssue: '' });
        return true;
    } catch (error) {
        const message = diagnosticText(error, { action: 'load workflow examples' });
        workbench.update({ examplesIssue: message });
        toast(message, 'error');
        return false;
    }
}
function typing() { const active = document.activeElement; return ['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName) || active?.isContentEditable; }
function currentPick() {
    if (selectedKind === 'multi' && Array.isArray(selected)) return { nodeIds: selected.filter(id => editorDraw?.nodes[id]) };
    if (selectedKind === 'group' && selected?.id) return { groupIds: [selected.id] };
    if (selectedKind === 'node' && selected?.id) return { nodeIds: [selected.id] };
    return null;
}
function clipForPick(pick) {
    const editor = graphViews?.readEditor(); if (!editor || !pick) return { ok: false, error: { message: 'Select nodes to copy.' } };
    const result = editor.view.identity.kind === 'library'
        ? makeDefinitionClip(workspacePrepared.libraryDefinitions[definitionRefKey(editor.prepared.definitionRef)], workspacePrepared.libraryDefinitions, pick)
        : makeClip(current, { ...pick, viewPath: [...(editor.view.identity.instancePath ?? [])] });
    if (!result.ok) return result;
    for (const [id, node] of Object.entries(result.data.graph.nodes)) {
        if (editorDraw.nodes[id]) {
            node.x = editorDraw.nodes[id].x; node.y = editorDraw.nodes[id].y;
            const presentation = editor.view.nodePresentation[id];
            if (presentation?.alias !== undefined) node.alias = presentation.alias;
            if (presentation?.compact !== undefined) node.compact = presentation.compact;
        }
    }
    for (const [id, group] of Object.entries(result.data.graph.groups)) if (editorDraw.groups[id]) {
        const drawn = editorDraw.groups[id];
        Object.assign(group, { ...(Number.isFinite(drawn.x) ? { x: drawn.x } : {}), ...(Number.isFinite(drawn.y) ? { y: drawn.y } : {}), ...(typeof drawn.collapsed === 'boolean' ? { collapsed: drawn.collapsed } : {}), ...(drawn.frame ? { frame: structuredClone(drawn.frame) } : {}) });
    }
    return readClip(result.data);
}
async function copySelection(cut = false, pick = currentPick()) {
    const captured = captureEditor(!cut); if (!captured.ok) return false; const result = clipForPick(pick); if (!result.ok) { toast(result.error, 'error'); return false; }
    detachedClip = result.data; let copied = false;
    try { await navigator.clipboard.writeText(JSON.stringify(result.data)); copied = true; } catch { toast(cut ? 'The clipboard write failed. These nodes were not cut.' : 'This copy is available in this tab.', 'info'); }
    if (cut) { if (!copied || !editorCurrent(captured.data)) return false; const nodes = Object.keys(result.data.graph.nodes), groupIds = Object.keys(result.data.graph.groups); if (!await deleteNativeSelection({ kind: 'nodes', ids: nodes, groupIds }, captured.data)) return false; }
    flashHistoryNote((cut ? 'Cut ' : 'Copied ') + Object.keys(result.data.graph.nodes).length + ' nodes'); return true;
}
async function pasteFromClipboard() {
    const captured = captureEditor(); if (!captured.ok) return false; let text;
    try { text = await navigator.clipboard.readText(); } catch { text = detachedClip; }
    if (!editorCurrent(captured.data)) return false; return pasteOnCanvas(text || detachedClip, null, captured.data);
}
function pasteOnCanvas(value, at = canvas.pointer ?? null, existingToken = null) {
    const captured = existingToken ? { ok: editorCurrent(existingToken), data: existingToken } : captureEditor(); if (!captured.ok || !value) return false;
    const decoded = readClip(value); let prepared;
    if (decoded.ok) prepared = prepareClipPaste(current, decoded.data, { at: at ?? defaultNodeSpot(), viewPath: scopeCommand(captured.data).viewPath });
    else if (typeof value === 'string' && value.trim() && !/^[\[{]/.test(value.trim())) prepared = prepareNativeConnectionEdit(current, { kind: 'create', operation: 'compose', controls: { sections: [{ name: 'pasted_text', text: value }], outputKind: 'text' }, graphPoint: at ?? defaultNodeSpot(), ...scopeCommand(captured.data) });
    else { toast(decoded.error, 'error'); return false; }
    const committed = commitCaptured(captured.data, prepared); if (committed.ok && prepared.ok) { const ids = prepared.data.added?.nodes ?? []; if (ids.length === 1) canvas.select({ kind: 'node', id: ids[0] }); else if (ids.length) canvas.setMulti(ids); } return committed.ok;
}
function togglePane() { canvas?.cancelGesture(); root.classList.toggle('pc-details-hidden'); if (graphViews) { graphViews.updateView({ inspector: { ...graphViews.readEditor().view.inspector, open: !root.classList.contains('pc-details-hidden') } }); persistGraphViews(); } syncPaneToggles(); safe(() => globalThis.localStorage?.setItem('lattice.workspace.panes', JSON.stringify({ inspector: !root.classList.contains('pc-details-hidden') }))); requestAnimationFrame(() => { canvas.render(); revealNarrowDetails(); }); }
function beginPositionEdit() {
    const editor = graphViews?.readEditor();
    const captured = captureEditor(editor?.readOnly || editor?.view.identity.kind !== 'root');
    positionEdit = captured.ok ? captured.data : null;
}
function completePositionEdit(ids, groupIds = []) {
    const token = positionEdit; positionEdit = null;
    if (!token || !editorCurrent(token)) return false;
    const editor = graphViews.readEditor(), view = editor.view;
    const nodes = Object.fromEntries(ids.filter(id => editorDraw.nodes[id]).map(id => [id, { x: editorDraw.nodes[id].x, y: editorDraw.nodes[id].y }]));
    const groups = Object.fromEntries(groupIds.filter(id => editorDraw.groups[id]).map(id => { const group = editorDraw.groups[id]; return [id, { x: group.x, y: group.y, ...(group.frame ? { frame: structuredClone(group.frame) } : {}) }]; }));
    const nodePresentation = structuredClone(view.nodePresentation), groupPresentation = structuredClone(view.groupPresentation ?? {});
    if (view.identity.kind === 'root' && !editor.readOnly) {
        const result = commitCaptured(token, prepareScopeMutation(token, ({ scope }) => {
            for (const [id, point] of Object.entries(nodes)) Object.assign(scope.nodes[id], point);
            for (const [id, frame] of Object.entries(groups)) Object.assign(scope.groups[id], frame);
            return { ok: true, data: {} };
        }));
        if (!result.ok) return false;
        const reconciled = graphViews.readEditor().view;
        if (result.data?.changed && Object.keys(nodes).every(id => reconciled.nodePresentation[id]?.x === undefined && reconciled.nodePresentation[id]?.y === undefined)
            && Object.keys(groups).every(id => reconciled.groupPresentation?.[id]?.x === undefined && reconciled.groupPresentation?.[id]?.y === undefined && reconciled.groupPresentation?.[id]?.frame === undefined)) return true;
        for (const id of Object.keys(nodes)) if (nodePresentation[id]) { delete nodePresentation[id].x; delete nodePresentation[id].y; if (!Object.keys(nodePresentation[id]).length) delete nodePresentation[id]; }
        for (const id of Object.keys(groups)) if (groupPresentation[id]) { delete groupPresentation[id].x; delete groupPresentation[id].y; delete groupPresentation[id].frame; if (!Object.keys(groupPresentation[id]).length) delete groupPresentation[id]; }
        graphViews.updateView({ nodePresentation, groupPresentation }); persistGraphViews(); return true;
    }
    for (const [id, point] of Object.entries(nodes)) nodePresentation[id] = { ...nodePresentation[id], ...point };
    for (const [id, frame] of Object.entries(groups)) groupPresentation[id] = { ...groupPresentation[id], ...frame };
    const updated = graphViews.updateView({ nodePresentation, groupPresentation }); if (updated.ok) persistGraphViews(); return updated.ok;
}
function resizeDetails(width) {
    if (!graphViews || !Number.isFinite(width) || width < 220 || width > 520) return;
    const editor = graphViews.readEditor(), result = graphViews.updateView({ inspector: { ...editor.view.inspector, width: Math.round(width) } });
    if (result.ok) { persistGraphViews(); syncPaneToggles(); }
}
function syncPaneToggles() { workbench.update({ inspectorOpen: !root.classList.contains('pc-details-hidden'), detailsWidth: graphViews?.readEditor().view.inspector.width ?? 258 }); }
function revealNarrowDetails() { if (window.innerWidth < 860 && !root.classList.contains('pc-details-hidden')) workbench.parts.inspector.scrollIntoView?.({ block: 'nearest' }); }
function armWorkflow(enabled = !settings().enabled) {
    settings().enabled = enabled; save(); renderStatus();
}
function stopOwnedWorkflow() {
    const activity = workflowRuntime.getNativeWorkflowController?.()?.activity?.();
    if (!isOpen() || !activity?.busy || activity.graph !== current || activity.documentToken !== undefined && activity.documentToken !== documentSession.capture()) return;
    return workflowSession.cancel('Stopped by user');
}
function reviewHostResult() {
    if (!isOpen() || !graphViews) return;
    const terminals = workspacePrepared?.reviewTerminals ?? [];
    const choices = workspacePrepared?.previewChoices.filter(choice => terminals.some(terminal => samePreviewTerminal(terminal, choice.target))) ?? [];
    const choice = choices.find(item => workflowState.reviewHandles?.some(handle => samePreviewTerminal(handle.terminal, item.target))) ?? choices.find(item => samePreviewTerminal(item.target, selectedPreview)) ?? choices[0];
    const rootView = graphViews.project().graphViews.tabs.find(tab => tab.identity.kind === 'root');
    if (!choice || !rootView) return;
    const path = choice.target.address.instancePath;
    if (path.length) navigateGraphView('openInstance', [...path]);
    else navigateGraphView('focusView', rootView.key);
    const editor = graphViews.readEditor();
    if (editor.view.identity.kind === 'library' || editor.view.identity.workflowId !== current.id || JSON.stringify(editor.view.identity.instancePath ?? []) !== JSON.stringify(path)) return;
    showSettings({ kind: 'node', id: choice.target.address.nodeId });
    outputPreviewActions.follow();
    outputPreviewActions.select(graphViews.readEditContext().sessionId + ':' + workspaceRevision, choice.key, choice.target);
    workbench.revealPreview();
}
function menuCommandAction(name) {
    const allowed = (flag, action) => () => selectionMenuCapabilities()[flag] ? action() : undefined;
    const commands = {
        'stop-workflow': allowed('stop', () => stopOwnedWorkflow()),
        'select-all': () => canvas.selectAll(),
        'clear-selection': () => { canvas.setMulti([]); canvas.select(null); },
        'details-selection': allowed('inspect', () => showSettings({ ...canvas.selection })),
        'rename-selection': allowed('rename', () => { const node = editorDraw.nodes[canvas.selection.id]; return ['subgraph-input', 'subgraph-output'].includes(node.type) ? focusBoundaryLabel(node.id) : focusAlias(node); }),
        'add-system': allowed('addSystem', () => openAddSystem()),
        'save-subgraph': allowed('saveSubgraph', () => openSubgraphSave(canvas.selection.id)),
        'center-selection': allowed('hasSelection', () => canvas.centerSelection()),
        'manage-portals': () => openPortalManager(),
        'enable-workflow': () => armWorkflow(),
        'review-host-result': () => reviewHostResult(),
        'duplicate-selection': allowed('duplicate', () => duplicateSelected()),
        'group-selection': allowed('group', () => groupSelection()),
        'ungroup-selection': allowed('ungroup', () => ungroupSelection()),
        'comment-selection': allowed('comment', () => addComment(null, commentSelectionIds())),
        'add-comment': () => addComment(null, []),
        'create-subgraph': allowed('createSubgraph', () => createSubgraph(commentSelectionIds())),
        'compact-selection': allowed('compact', () => { const node = editorDraw.nodes[canvas.selection.id]; return presentNode(node.id, 'compact', !selectionMenuCapabilities().compactChecked); }),
    };
    return commands[name];
}
function selectionMenuCapabilities() {
    const editor = graphViews?.readEditor(), selection = canvas?.selection;
    const hasSelection = !!selection || !!canvas?.multi.size || !!canvas?.wireMulti?.size;
    const node = selection?.kind === 'node' ? editorDraw?.nodes[selection.id] : null;
    const group = selection?.kind === 'group' ? editorDraw?.groups?.[selection.id] : null;
    const ids = canvas?.multi.size > 1 ? [...canvas.multi] : group ? groupMembers(editorDraw, group.id).map(member => member.id) : node ? [node.id] : [];
    const nodes = ids.map(id => editorDraw?.nodes[id]), editable = !!editor && !editor.readOnly;
    const boundary = node && ['subgraph-input', 'subgraph-output'].includes(node.type);
    const copyable = ids.length > 0 && nodes.every(item => item && !['subgraph-input', 'subgraph-output'].includes(item.type));
    const ordinary = nodes.filter(item => item && !isCommentFrame(item));
    const activity = workflowRuntime.getNativeWorkflowController?.()?.activity?.();
    return {
        addSystem: rootSystemWritable(),
        inspect: !!node && canvas.multi.size < 2,
        rename: !!node && canvas.multi.size < 2 && (boundary ? editable : !isCommentFrame(node) && !!editorDraw.nativeCards?.[node.id]),
        duplicate: editable && copyable,
        group: editable && canvas.multi.size > 1 && ordinary.length > 1 && ordinary.every(item => !['subgraph-input', 'subgraph-output'].includes(item.type)),
        ungroup: editable && !!group,
        createSubgraph: editable && ids.length > 0 && !nodes.some(isCommentFrame) && canCreateSubgraph(ids),
        saveSubgraph: !!node && canvas.multi.size < 2 && node.type === 'subgraph' && !!workspacePrepared?.libraryDefinitions?.[definitionRefKey(node.definition)],
        comment: editable && ordinary.length > 0 && !nodes.some(item => ['subgraph-input', 'subgraph-output'].includes(item?.type)),
        compact: !!node && canvas.multi.size < 2 && !boundary && !isCommentFrame(node) && !!editorDraw.nativeCards?.[node.id],
        compactChecked: !!node && readNodePresentation(node, editor?.view.nodePresentation[node.id]).compact === true,
        fitSelection: hasSelection,
        hasSelection,
        stop: !!activity?.busy && activity.graph === current && (activity.documentToken === undefined || activity.documentToken === documentSession.capture()),
    };
}
function updateSelectionCount() {
    const editor = graphViews?.readEditor(), graph = editor?.prepared.savedGraph, pick = currentPick(), selection = canvas?.selection;
    const copyable = id => graph?.nodes[id] && !['subgraph-input', 'subgraph-output'].includes(graph.nodes[id].type);
    const picked = pick?.nodeIds ?? pick?.groupIds?.flatMap(id => groupMembers(graph, id).map(node => node.id)) ?? [];
    const copy = picked.length > 0 && picked.every(copyable), canDelete = selection?.kind === 'wire' ? !!graph?.wires[selection.id] : selection?.kind === 'group' ? !!graph?.groups?.[selection.id] : picked.length > 0 && picked.every(id => !!graph?.nodes[id]);
    workbench.update({ menuCapabilities: selectionMenuCapabilities(), selectionCount: canvas?.multi.size || (selection?.kind === 'node' ? 1 : 0), selectionActions: { copy, cut: copy && !editor?.readOnly, delete: canDelete && !editor?.readOnly } });
}
function openRecallDetails(nodeId,scope='selected') {
    if (!graphViews || !canvas) return;
    const address=scope==='all'?recallProjection?.allNodes?.[nodeId]?.address:null;
    if(address){if(address.instancePath.length)navigateGraphView('openInstance',address.instancePath);else navigateGraphView('focusView',graphViews.project().graphViews.tabs[0].key);nodeId=address.nodeId;}
    if (!graphViews.readEditor().prepared.savedGraph.nodes[nodeId]) return;
    canvas.setMulti([]); showSettings({kind:'node',id:nodeId}); canvas.fitSelection();
    requestAnimationFrame(()=>workbench.parts.inspector.querySelector('.pc-recall-details')?.scrollIntoView({block:'nearest'}));
}
function showSettings(selection) { if (root.classList.contains('pc-details-hidden')) togglePane(); canvas.select(selection); const inspector = workbench.parts.inspector; inspector.scrollTop = 0; inspector.classList.add('pc-flash'); requestAnimationFrame(revealNarrowDetails); setTimeout(() => inspector.classList.remove('pc-flash'), 400); }
function touch() { touchGraph(current); refreshWorkspaceDocument(); }
function renderAll() {
    H.track(current);
    updateWorkflowProjection();
    paintHistory();
    renderDocumentState();
    renderStatus();
    canvas.render();
    updateSelectionCount();
}

/** The theme editor, dropped down from the palette button. */
function toggleThemePopover() {
    const existing = root.querySelector('.pc-theme-pop');
    if (existing) { existing.remove(); return; }
    const pop = el('div', 'pc-theme-pop');
    const head = el('div', 'pc-theme-pop-head');
    head.append(el('b', '', 'Theme'), mkBtn('fa-xmark', 'Close', () => pop.remove(), 'pc-theme-pop-close'));
    const body = el('div');
    pop.append(head, body);
    root.append(pop);
    renderThemeEditor(body);
    const away = (e) => {
        if (!pop.isConnected) { document.removeEventListener('mousedown', away, true); return; }
        if (!pop.contains(e.target) && !e.target.closest('.pc-theme-btn')) { pop.remove(); document.removeEventListener('mousedown', away, true); }
    };
    document.addEventListener('mousedown', away, true);
}

/* ------------------------------------------------------------------ */
/* undo and redo                                                       */
/* ------------------------------------------------------------------ */

let historyHooked = false;

function hookHistory() {
    if (historyHooked) return;
    historyHooked = true;
    onGraphTouched((g, options) => { if (options?.history !== false) H.noteChange(g); if (g === current) { syncNativeRevision('Workflow edited'); renderDocumentState(); } });
    H.onHistoryChange((g, event) => { handleCommentHistory(g, event); handleSubgraphHistory(g, event); handleSystemHistory(g, event); if (g === current) paintHistory(); });
}

function historyEditContext() {
    const context = readGraphEditContext(), editor = graphViews?.readEditor();
    // History belongs to the root document, including connection overrides on
    // shared instances. Library definitions remain read-only.
    return editor?.readOnly && editor.view.identity.kind === 'instance'
        ? { ...context, viewPath: [], readOnly: !isOpen() || activeEditRoot() !== current }
        : context;
}
function paintHistory() {
    if (!workbench || !current) return;
    const next = H.peek(current), allowed = !historyEditContext().readOnly;
    workbench.update({ history: { undo: allowed && !!next.undo, redo: allowed && !!next.redo,
        undoTitle: next.undo ? `Undo: ${next.undo} (Ctrl+Z)` : 'Nothing to undo',
        redoTitle: next.redo ? `Redo: ${next.redo} (Ctrl+Shift+Z)` : 'Nothing to redo', note: historyNote, showNote: historyNoteVisible } });
}

/** After undo or redo the canvas objects are new, so find the selection again by id. */
function afterHistory(label, verb) {
    if (!label) { paintHistory(); return; }
    if (selectedKind === 'node' && selected) selected = (editorDraw ?? current).nodes[selected.id] ?? null;
    if (selectedKind === 'wire' && selected) selected = (editorDraw ?? current).wires[selected.id] ?? null;
    if (selectedKind === 'group' && selected) selected = (editorDraw ?? current).groups?.[selected.id] ?? null;
    if (selectedKind === 'multi') { selected = null; selectedKind = null; }
    if (!selected) selectedKind = null;
    canvas.select(selected ? { kind: selectedKind, id: selected.id } : null);
    renderAll();
    flashHistoryNote(`${verb} ${label}`);
}

/** A quiet note beside the undo buttons that fades on its own. */
let noteTimer = null;
let historyNote = '', historyNoteVisible = false;
function flashHistoryNote(text) {
    if (!workbench) return;
    historyNote = text; historyNoteVisible = true; paintHistory();
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { historyNoteVisible = false; paintHistory(); }, 1600);
}

function restoreGraphHistory(direction, verb) {
    const graph = activeEditRoot();
    if (!graph) return;
    const context = captureGraphEditContext(graph, historyEditContext);
    if (!context.ok) return toast(context.error, 'error');
    const result = stepGraphHistory(graph, direction, graphDocumentHooks);
    if (result.ok) afterHistory(result.data.label, verb);
}
function doUndo() { restoreGraphHistory('undo', 'Undid'); }
function doRedo() { restoreGraphHistory('redo', 'Redid'); }

function renderDocumentState() {
    if (!workbench) return;
    workbench.update({ document: ensureDocumentCommands().view(), graphId: current?.id ?? '', enabled: !!settings().enabled, hasArchivedWorkflows: Object.keys(settings().archivedWorkflows?.graphs ?? {}).length > 0 || Object.keys(settings().archivedWorkflows?.definitions ?? {}).length > 0 });
}

function renderStatus() { safe(() => document.dispatchEvent(new CustomEvent('pc-state'))); workbench.update({ enabled: !!settings().enabled }); refreshRecallOverview(); if (graphViews) updateWorkflowProjection(); }
async function onNewGraph() {
    canvas?.cancelGesture();
    return ensureDocumentCommands().newDocument();
}





function requestDocumentChoice(name) {
    return new Promise(resolve => { pendingDocumentPrompt = { resolve }; workbench.update({ documentPrompt: { name } }); });
}

function chooseDocumentPrompt(choice) {
    if (!pendingDocumentPrompt || !['save', 'discard', 'cancel'].includes(choice)) return;
    const pending = pendingDocumentPrompt; pendingDocumentPrompt = null;
    workbench.update({ documentPrompt: null }); pending.resolve(choice);
}



function containingGraphView(view) {
    if (view?.identity.kind !== 'instance') return null;
    const path = view.identity.instancePath.slice(0, -1);
    const identity = path.length ? { kind: 'instance', workflowId: view.identity.workflowId, instancePath: path } : { kind: 'root', workflowId: view.identity.workflowId };
    const key = viewIdentityKey(identity);
    return { path, key, prepared: workspacePrepared?.preparedViews.find(entry => viewIdentityKey(entry.identity) === key) };
}
function canRenameGraphView(key) {
    const view = graphViews?.project().graphViews.tabs.find(view => view.key === key);
    return view?.identity.kind === 'root' || view?.identity.kind === 'instance' && containingGraphView(view)?.prepared?.readOnly === false;
}
function onRenameGraphView(key, value) {
    const session = graphViews, view = session?.project().graphViews.tabs.find(view => view.key === key);
    if (!view || !canRenameGraphView(key)) return;
    const name = view.identity.kind === 'root' ? value?.trim() : value?.trim().slice(0, 80);
    if (!name || name === view.label) return;
    if (view.identity.kind === 'root') { current.name = name; touch(); renderAll(); return; }
    const graph = current, parent = containingGraphView(view), nodeId = view.identity.instancePath.at(-1);
    const wrapper = parent.prepared.savedGraph.nodes[nodeId];
    const expectedPin = definitionRefKey(wrapper.definition);
    const originalKey = session.project().graphViews.active.key, parentWasOpen = session.project().graphViews.tabs.some(tab => tab.key === parent.key);
    navigateGraphView(parent.path.length ? 'openInstance' : 'focusView', parent.path.length ? parent.path : parent.key);
    const token = captureEditor();
    if (token.ok) {
        const prepared = prepareQualifiedScopeEdit(graph, scopeCommand(token.data), ({ scope }) => {
            const node = scope.nodes[nodeId];
            if (node?.type !== 'subgraph' || definitionRefKey(node.definition) !== expectedPin) return { ok: false, error: { code: 'STALE_DEFINITION', message: 'The subgraph changed. Rename it again.' } };
            node.title = name;
            if (typeof node.alias === 'string') node.alias = name;
            if (typeof node.presentation?.alias === 'string') node.presentation.alias = name;
            return { ok: true, data: {} };
        });
        const alias = graphViews.readEditor().view.nodePresentation[nodeId]?.alias;
        const beforeState = alias ? commentDocumentState(graph) : null, receipt = alias ? H.capturePresentationStep(graph) : null;
        const result = commitCaptured(token.data, prepared);
        if (result.ok) {
            const parentView = graphViews.readEditor().view;
            if (alias && result.data.changed) {
                const handle = Object.freeze({});
                if (H.attachPresentationEffect(graph, { receipt, effect: handle, beforeState, afterState: commentDocumentState(graph) })) {
                    subgraphPresentationEffects.set(handle, { root: graph, aliasRename: { viewKey: parent.key, nodeId, before: alias, after: name } });
                    graphViews.updateView({ nodePresentation: { ...parentView.nodePresentation, [nodeId]: { ...parentView.nodePresentation[nodeId], alias: name } } }, parent.key);
                } else toast('The node alias could not be attached to this Rename Undo step.', 'error');
            }
        }
    }
    if (session.project().graphViews.tabs.some(tab => tab.key === originalKey)) navigateGraphView('focusView', originalKey);
    if (!parentWasOpen && originalKey !== parent.key) navigateGraphView('closeView', parent.key);
    persistGraphViews(true); renderAll();
}

function onRenameGraph() {
    const view = graphViews?.project().graphViews.tabs.find(view => view.identity.kind === 'root');
    if (view) workbench.renameGraphView(view.key);
}



function onExportArchivedWorkflows() {
    try {
        const json = exportArchivedWorkflows();
        if (!json) return false;
        downloadGraphViewJSON(json, 'lattice-archived-workflows.json');
        return true;
    } catch (error) { toast(error, 'error', { action: 'export archived workflows' }); return false; }
}
function onExportGraph() {
    try {
        const json = exportGraph(current);
        if (!json) throw new Error('The workflow is no longer available.');
        downloadGraphViewJSON(json, `${current.name.replace(/[^\w-]+/g, '_')}.workflow.json`);
        return true;
    } catch (error) { toast(error, 'error', { action: 'export the workflow' }); return false; }
}


function cancelImportReview() { pendingImport = null; workbench?.update({ importReview: null }); }

function showImportReview(source, fileName, prepared) {
    pendingImport = { source, fileName, prepared, editorToken: prepared.editorToken };
    const { diagnostics, candidate, added } = prepared;
    const review = {
        fileName, name: String(source.name || 'Imported workflow'), phase: diagnostics.phase,
        nodeCount: added.nodes.length, wireCount: added.wires.length, groupCount: added.groups.length,
        callBound: diagnostics.callBound, importedCallBound: diagnostics.importedCallBound,
        requiredRoles: diagnostics.requiredRoles,
        unresolvedBindings: diagnostics.unresolvedBindings.map(binding => ({ role: binding.role || 'Per-node binding', title: String(candidate.nodes[binding.nodeId]?.title || candidate.nodes[binding.nodeId]?.operation || binding.nodeId), missing: binding.missing })),
        inheritedBindingCount: diagnostics.inheritedBindings?.length ?? 0,
        terminals: diagnostics.terminals.map(terminal => ({ title: String(candidate.nodes[terminal.nodeId]?.title || terminal.nodeId), operation: terminal.operation })),
        bindingReviewRequired: diagnostics.bindingReviewRequired, error: '',
    };
    pendingImport.review = review;
    workbench.update({ importReview: review });
}

function prepareImportReview(graph, source, fileName, context) {
    const path=graphViews?scopeCommand(context).viewPath:readGraphEditContext().viewPath;
    if(graphViews&&!editorCurrent(context))return toast('The destination view changed. Import the file again.','error');
    const result = prepareWorkflowInsertion(graph, source, { viewPath:path });
    if (!result.ok) return toast(result.error, 'error');
    showImportReview(source, fileName, graphViews?{...result.data,editorToken:context}:{ ...result.data, context });
}

function onImportIntoGraph() {
    const graph = activeEditRoot();
    const captured = graphViews?captureEditor():captureGraphEditContext(graph, readGraphEditContext);
    if (!captured.ok) return toast(captured.error, 'error');
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
        const file = input.files?.[0]; if (!file) return;
        try {
            const result = parseWorkflowInsertionFile(await file.text());
            if (!result.ok) return toast(result.error, 'error');
            if (!isOpen() || activeEditRoot() !== graph || graphViews&&!editorCurrent(captured.data)) return toast('The destination graph or view changed. Import the file again.', 'error');
            prepareImportReview(graph, result.data, file.name, captured.data);
        } catch { toast('Could not read this workflow file. Import the file again.', 'error'); }
    });
    input.click();
}

function prepareImportAgain() {
    if (!pendingImport) return;
    const { source, fileName } = pendingImport, graph = activeEditRoot();
    const captured = graphViews?captureEditor():captureGraphEditContext(graph, readGraphEditContext);
    if (!captured.ok) return workbench.update({ importReview: { ...workbenchImportReview(), error: diagnosticText(captured.error) } });
    prepareImportReview(graph, source, fileName, captured.data);
}

// Keep the review DTO alongside its opaque prepared capability, never in graph data.
function workbenchImportReview() { return pendingImport?.review ?? {}; }
function acceptImportReview() {
    if (!pendingImport) return;
    const reviewed = pendingImport;
    // A content gesture holds draft coordinates/endpoints across render calls.
    // Do not install new objects underneath it, or roll back a live camera pan.
    if (canvas.hasContentGesture?.() || canvas.drag || canvas.linking) {
        reviewed.review = { ...reviewed.review, error: 'Finish or cancel the active graph gesture, then prepare this import again.' };
        workbench.update({ importReview: reviewed.review }); return;
    }
    const result = reviewed.editorToken?commitCaptured(reviewed.editorToken,{ok:true,data:reviewed.prepared}):commitGraphEdit(activeEditRoot(), reviewed.prepared, graphDocumentHooks);
    if (!result.ok) {
        const review = { ...reviewed.review, error: diagnosticText(result.error) };
        reviewed.review = review; workbench.update({ importReview: review }); return;
    }
    if (!result.data.changed) { cancelImportReview(); return; }
    const ids = reviewed.prepared.added.nodes;
    cancelImportReview();
    canvas.render(); canvas.setMulti(ids);
    renderAll(); flashHistoryNote(`Imported ${ids.length} nodes`);
}

async function onOpenExample(id) {
    const result = await ensureDocumentCommands().example(id);
    if (!result.ok) return false;
    const graph = current, epoch = uiEpoch;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (stillEditing(graph, epoch) && graphViews?.readEditor().view.identity.kind === 'root') canvas.fit(); }));
    return true;
}

async function onImportGraph() {
    canvas?.cancelGesture();
    return ensureDocumentCommands().open();
}

function duplicateSelected(node = null) {
    const token = captureEditor(); if (!token.ok) return token;
    const fragment = clipForPick(node ? { nodeIds: [node.id] } : currentPick()); if (!fragment.ok) return fragment;
    const nodes = Object.values(fragment.data.graph.nodes), origin = node ?? { x: Math.min(...nodes.map(item => item.x ?? 0)), y: Math.min(...nodes.map(item => item.y ?? 0)) };
    return commitCaptured(token.data, prepareClipPaste(current, fragment.data, { at: { x: origin.x + 28, y: origin.y + 28 }, viewPath: scopeCommand(token.data).viewPath }));
}
function groupSelection(ids = [...canvas.multi], existingToken = null) {
    const captured = existingToken ? { ok: editorCurrent(existingToken), data: existingToken } : captureEditor();
    if (!captured.ok) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The graph view changed or is read-only.' } };
    const members = [...new Set(ids)].filter(id => !isCommentFrame(editorDraw.nodes[id])), nodes = members.map(id => editorDraw.nodes[id]);
    if (members.length < 2 || nodes.some(node => !node || ['subgraph-input', 'subgraph-output'].includes(node.type))) return { ok: false, error: { code: 'INVALID_GROUP', message: 'Select at least two ordinary nodes to group.' } };
    const x = Math.min(...nodes.map(node => node.x)), y = Math.min(...nodes.map(node => node.y));
    const frame = { x: x-20, y: y-40, w: Math.max(...nodes.map(node => node.x+canvas.widthOf(node)))-x+40, h: Math.max(...nodes.map(node => node.y+(canvas.heightOf(node) || 80)))-y+60 };
    const id = 'grp-'+crypto.randomUUID();
    return commitCaptured(captured.data, prepareScopeMutation(captured.data, ({ scope }) => {
        scope.groups ??= {};
        for (const group of Object.values(scope.groups)) if (group.members) group.members = group.members.filter(member => !members.includes(member));
        scope.groups[id] = { id, title: 'Group', members, collapsed: true, x, y, w: 180, frame };
        for (const nodeId of members) scope.nodes[nodeId].inGroup = id;
        return { ok: true, data: {} };
    }));
}
function ungroupSelection(id = canvas.selection?.kind === 'group' ? canvas.selection.id : null) {
    const captured = captureEditor(); if (!captured.ok || !id || !editorDraw.groups[id]) return { ok: false, error: { code: 'INVALID_GROUP', message: 'Select an editable group to ungroup.' } };
    return commitCaptured(captured.data, prepareScopeMutation(captured.data, ({ scope }) => {
        for (const node of Object.values(scope.nodes)) if (node.inGroup === id) delete node.inGroup;
        delete scope.groups[id]; return { ok: true, data: {} };
    }));
}
function canCreateSubgraph(nodeIds) {
    return nodeIds.length > 0 && nodeIds.every(id => {
        const candidate = editorDraw.nodes[id];
        if (!candidate || ['subgraph-input', 'subgraph-output'].includes(candidate.type)) return false;
        const operation = operationFor(candidate, { mode: editorDraw.mode, phase: candidate.phase ?? editorDraw.nativeCards?.[id]?.phase });
        return (!operation?.rootOnly || isScopedSystemOperation(candidate)) && (!operation?.requiresStateInDefinition || isScopedSystemOperation(candidate) || Object.values(editorDraw.wires).some(wire => wire.to === id && wire.toPort === 'state'));
    });
}
function canvasPreviewMenuItems(node, token) {
    const editor = graphViews.readEditor();
    if (!node || editor.view.identity.kind === 'library') return [];
    const path = editor.view.identity.instancePath ?? [], sourceKey = editorCaptures.get(token)?.revision;
    const choices = nodePreviewChoices(node);
    if (!choices.length) return [];
    const ports = editorDraw.nativeCards[node.id]?.ports ?? [];
    const labelFor = target => target.kind === 'terminal' ? 'Host result' : ports.find(port => port.dir === 'out' && port.port === target.portId)?.label || target.portId;
    const summaryFor = target => projectPreparedWorkflow(workspacePrepared.workflow, { ...workflowState, viewPath: path, selectedId: node.id, selectedTarget: target, pinnedPreview: null }).targetSummary;
    const currentKey = () => editorCurrent(token) && sourceKey === graphViews.readEditContext().sessionId + ':' + workspaceRevision;
    const choiceFor = target => choices.find(choice => JSON.stringify(choice.target) === JSON.stringify(target));
    const choice = choiceFor(pinnedPreview) ?? choiceFor(targetedPreview) ?? choiceFor(selectedPreview) ?? choices[0];
    const target = structuredClone(choice.target), summary = summaryFor(target);
    const busy = () => !!workflowState.busy || !!workflowRuntime.getNativeWorkflowController?.()?.activity?.()?.busy;
    const run = { id: 'run-to-here', label: 'Run to here', icon: 'run', tone: 'preview', shortcut: 'R',
        matchesShortcut: event => event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey,
        disabled: busy() || !!summary.issues.length,
        hint: busy() ? 'A workflow is already running.' : (summary.diagnostics?.map(issue => issue.message) ?? summary.issues.map(issue => diagnosticText(issue, { action: 'run to here' }))).join(' ') || `Run ${labelFor(target)} and its dependencies. Maximum auxiliary calls: ${summary.callBound}.`,
        action: () => {
            if (!currentKey() || busy() || summaryFor(target).issues.length) return;
            outputPreviewActions.select(sourceKey, choice.key, target);
            workbench.revealPreview(); outputPreviewActions.runHere(sourceKey, target);
        } };
    const pins = choices.map(choice => {
        const target = structuredClone(choice.target), pinned = JSON.stringify(pinnedPreview) === JSON.stringify(target);
        return { id: 'pin-preview', label: choices.length > 1 ? labelFor(target) : pinned ? 'Unpin preview' : 'Pin preview', icon: 'pin', tone: 'preview', checked: pinned, action: () => {
            if (!currentKey()) return;
            if (JSON.stringify(pinnedPreview) === JSON.stringify(target)) outputPreviewActions.follow();
            else { outputPreviewActions.select(sourceKey, choice.key, target); outputPreviewActions.pin(sourceKey, target); }
            workbench.revealPreview();
        } };
    });
    const targetNode = { id: 'target-node', label: 'Target Node', icon: 'target', tone: 'preview', shortcut: 'T',
        checked: choices.some(choice => JSON.stringify(choice.target) === JSON.stringify(targetedPreview)),
        matchesShortcut: event => event.key.toLowerCase() === 't' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !event.isComposing,
        hint: 'Follow this node in Preview. Press T again to clear its target.',
        action: () => { if (currentKey()) togglePreviewTarget(node); } };
    return [targetNode, run, ...(choices.length > 1 ? [
        { id: 'pin-preview', label: 'Pin preview', icon: 'pin', tone: 'preview', children: pins },
    ] : pins)];
}
function onCanvasMenu({ event, node, wire, at, group = null, several = null }) {
    if (several?.length) canvas.setMulti(several);
    else if (node || group || wire) {
        const pick = { kind: node ? 'node' : group ? 'group' : 'wire', id: node?.id ?? group?.id ?? wire.id };
        if (!node || canvas.multi.size > 1 || canvas.selection?.kind !== 'node' || canvas.selection?.id !== node.id) {
            canvas.setMulti([]);
            canvas.select(pick);
        }
    }
    const captured = captureEditor(true); if (!captured.ok) return;
    const editor = graphViews.readEditor(), readOnly = editor.readOnly, items = [];
    const entry = (id, label, icon, action, disabled = false, shortcut = '', extra = {}) => ({ id, label, icon, action, disabled, shortcut, ...extra });
    const section = entries => { if (!entries.length) return; if (items.length) items.push({ separator: true }); items.push(...entries); };
    const boundaryNode = node && ['subgraph-input', 'subgraph-output'].includes(node.type);
    if (isCommentFrame(node)) {
        section([entry('details', 'Details', 'details', () => showSettings({ kind: 'node', id: node.id })),
            entry('fit-contents', 'Fit to contents', 'fit', () => commentCommand(captureCommentEdit(), node.id, 'fit'), readOnly),
            entry('duplicate', 'Duplicate', 'duplicate', () => duplicateSelected(node), readOnly, 'Ctrl D')]);
    } else if (boundaryNode && !several) {
        section([entry('details', 'Details', 'details', () => focusBoundaryLabel(node.id))]);
    } else if (node || group || several) {
        const primary = [entry('details', 'Details', 'details', () => showSettings({ kind: node ? 'node' : group ? 'group' : 'node', id: node?.id || group?.id || several?.[0] }))];
        if (node && !several) {
            if (operationFor(node)) primary.push(entry('rename', 'Rename', 'rename', () => focusAlias(node), false, 'F2'));
            primary.push(entry('duplicate', 'Duplicate', 'duplicate', () => duplicateSelected(node), readOnly, 'Ctrl D'));
        }
        section(primary);
        section([entry('copy', 'Copy', 'copy', () => copySelection(), false, 'Ctrl C'), entry('cut', 'Cut', 'cut', () => copySelection(true), readOnly, 'Ctrl X')]);
    }
    if (node && !several && !isCommentFrame(node)) section(canvasPreviewMenuItems(node, captured.data));
    const recallIds=several??(node?[node.id]:[]),recallNodes=editor.view.identity.kind!=='library'?recallIds.filter(id=>recallProjection?.nodes[id]):[];
    if(recallNodes.length){const view=projectRecallView({rootGraph:current,inventory:workspacePrepared?.planner.inventory,status:workflowRuntime.getNativeWorkflowController?.()?.statusRecall?.()?.data??null,enabled:!!settings().enabled,nodeIds:recallIds,viewKind:editor.view.identity.kind,instancePath:editor.view.identity.instancePath??[]});const scope=view.commands.selected,actions=captureRecallActions(recallIds),plural=!!several;
        const label=(verb,ids)=>plural&&ids.length?verb+' for '+ids.length+' '+(ids.length===1?'node':'nodes'):verb;
        const hint=(count,reason)=>count?count+' '+(count===1?'memory set':'memory sets'):reason;
        section([entry('queue-recall',label('Queue recall',scope.queueNodeIds),'run',()=>{const result=actions.queue();if(!result.ok)toast(result.error,'error');},!scope.queueNodeIds.length,'',{hint:hint(scope.queueMemorySetCount,scope.queueReason)}),entry('cancel-recall',label('Cancel recall',scope.cancelNodeIds),'stop',()=>{const result=actions.cancel();if(!result.ok)toast(result.error,'error');},!scope.cancelNodeIds.length,'',{hint:hint(scope.cancelMemorySetCount,scope.cancelReason)}),...(!plural?[entry('recall-settings','Recall settings…','details',()=>openRecallDetails(node.id))]:[])]);
    }
    if (node?.type === 'subgraph' && !several) section([
        entry('open-subgraph', 'Open subgraph', 'open', () => editor.view.identity.kind === 'library' ? subgraphWrapperAction(node.id, 'open') : graphViewActions.openInstance([...(editor.view.identity.instancePath ?? []), node.id]), false, '', { tone: 'subgraph' }),
        entry('save-subgraph', 'Add to Subgraphs', 'save', () => openSubgraphSave(node.id), false, '', { tone: 'subgraph' }),
        entry('editable-copy', 'Make editable copy', 'edit', () => subgraphWrapperAction(node.id, 'copy'), readOnly),
        entry('saved-definition', 'Open saved definition', 'library', () => subgraphWrapperAction(node.id, 'open')),
        entry('export-subgraph', 'Export subgraph', 'export', () => subgraphWrapperAction(node.id, 'export')),
        entry('unpack-subgraph', 'Unpack subgraph', 'unpack', () => subgraphWrapperAction(node.id, 'unpack'), readOnly),
    ]);
    const organization = [];
    if (node && !isCommentFrame(node) || group || several) organization.push(entry('comment-selection', 'Comment around selection', 'comment', () => addComment(at, several ?? (group ? groupMembers(editorDraw, group.id).map(member => member.id) : [node.id])), readOnly, 'C'));
    const subgraphNodes = several ?? (group ? groupMembers(editorDraw, group.id).map(member => member.id) : node && !isCommentFrame(node) ? [node.id] : []);
    if (subgraphNodes.length) {
        const eligible = canCreateSubgraph(subgraphNodes);
        organization.push(entry('create-subgraph', 'Create subgraph', 'subgraph', () => createSubgraph(subgraphNodes), readOnly || !eligible, '', { tone: 'subgraph', hint: !eligible ? 'Keep existing boundary nodes in their containing definition.' : 'Move the selected nodes into an editable subgraph and preserve their connections.' }));
    }
    if (several?.length > 1) organization.push(entry('group', 'Group selected nodes', 'group', () => groupSelection(several), readOnly, 'Ctrl G'));
    if (group) organization.push(entry('ungroup', 'Ungroup', 'ungroup', () => ungroupSelection(group.id), readOnly, 'Ctrl Shift G'));
    const presentation = [];
    if (node && !several && !isCommentFrame(node)) {
        const compact = readNodePresentation(node, editor.view.nodePresentation[node.id]).compact;
            presentation.push(entry('compact', 'Compact card', 'compact', () => presentNode(node.id, 'compact', !compact), false, 'Shift C', { checked: compact }));
    }
    if (node || group || several || wire) presentation.push(entry('fit-selection', 'Fit selection', 'fit', () => canvas.fitSelection(), false, 'F'));
    section([...organization, ...presentation]);
    if (wire) {
        section([entry('portals', 'Manage portals', 'portals', () => openPortalManager({ edgeId: wire.id }))]);
        section([entry('disconnect', 'Disconnect', 'disconnect', () => { const token = captureEditor(); if (token.ok) commitCaptured(token.data, prepareNativeConnectionEdit(current, { kind: 'disconnect', edgeIds: [wire.id], ...scopeCommand(token.data) })); }, readOnly, '', { tone: 'danger' })]);
    }
    if (!node && !wire && !group && !several) {
        section([entry('add-node', 'Add node', 'add', () => nativeWireBridge?.openUnconnectedSearch({ graphPoint: at, screenAnchor: { x: event.clientX, y: event.clientY } }), readOnly), entry('add-comment', 'Add comment', 'comment', () => addComment(at, []), readOnly, 'C')]);
        section([entry('paste', 'Paste', 'paste', pasteFromClipboard, readOnly, 'Ctrl V')]);
        section([entry('fit-graph', 'Fit graph', 'fit', () => canvas.fit())]);
    }
    if (isCommentFrame(node)) section([entry('delete-comment', 'Delete comment', 'delete', () => commentCommand(captureCommentEdit(), node.id, 'delete'), readOnly, 'Del', { tone: 'danger' })]);
    else if (node || group || several) section([entry('delete', 'Delete', 'delete', () => canvas.deleteSelection(), readOnly, 'Del', { tone: 'danger' })]);
    showContextMenu({ root, x: event.clientX, y: event.clientY, items,
        label: several ? 'Selection actions' : isCommentFrame(node) ? 'Comment actions' : boundaryNode ? 'Port actions' : group ? 'Group actions' : wire ? 'Connection actions' : node ? 'Node actions' : 'Canvas actions',
        isCurrent: () => editorCurrent(captured.data), restoreFocus: () => canvas.host?.focus({ preventScroll: true }) });
}
function createSubgraph(nodeIds, name = null) {
    const captured = captureEditor(); if (!captured.ok) return captured;
    const editor = graphViews.readEditor(), parentPath = [...(editor.view.identity.instancePath ?? [])];
    const selectedIds = [...nodeIds], nodePositions = {}, nodePresentation = {}, groupPresentation = {}, presentation = {};
    for (const id of selectedIds) {
        const node = editorDraw.nodes[id]; if (!node) return { ok: false, error: { code: 'INVALID_SELECTION', message: 'The selected nodes changed.' } };
        nodePositions[id] = { x: node.x, y: node.y, w: canvas.widthOf(node), h: canvas.heightOf(node) };
        if (editor.view.nodePresentation[id]) presentation[id] = structuredClone(editor.view.nodePresentation[id]);
        const fields = Object.fromEntries(['alias', 'compact'].filter(field => presentation[id]?.[field] !== undefined).map(field => [field, presentation[id][field]]));
        if (Object.keys(fields).length) nodePresentation[id] = fields;
    }
    for (const [id, overlay] of Object.entries(editor.view.groupPresentation ?? {})) if (selectedIds.some(nodeId => editorDraw.nodes[nodeId]?.inGroup === id || editorDraw.groups[id]?.members?.includes(nodeId))) groupPresentation[id] = structuredClone(overlay);
    if (name === null) {
        const names = new Set(Object.values(current.definitions ?? {}).map(definition => definition.name));
        name = 'Subgraph'; let index = 2; while (names.has(name)) name = 'Subgraph ' + index++;
    }
    const prepared = prepareCreateFromSelection(current, { ...scopeCommand(captured.data), nodeIds: selectedIds, nodePositions, nodePresentation, groupPresentation, definitionId: 'local-' + crypto.randomUUID(), name });
    const relocated = prepared.ok ? captureRelocatedSubgraphViews(graphViews.serialize().data, parentPath, selectedIds, prepared.data.instanceId) : null;
    const selectedWrapperIds = selectedIds.filter(id => editor.prepared.savedGraph.nodes[id]?.type === 'subgraph');
    const relocation = prepared.ok && selectedWrapperIds.length ? { parentPath, selectedIds: selectedWrapperIds, instanceId: prepared.data.instanceId } : null;
    const beforeState = relocation ? commentDocumentState(current) : null, receipt = beforeState ? H.capturePresentationStep(current) : null;
    const result = commitCaptured(captured.data, prepared); if (!result.ok) return result;
    const instanceId = prepared.data.instanceId;
    if (relocation) {
        const handle = Object.freeze({});
        if (H.attachPresentationEffect(current, { receipt, effect: handle, beforeState, afterState: commentDocumentState(current) })) {
            subgraphPresentationEffects.set(handle, { root: current, relocation, ...relocated });
            queueSubgraphPresentation(current, relocated, 'redo');
        } else toast('The nested tab layout could not be attached to this Undo step.', 'error');
    }
    canvas.setMulti([]); canvas.select({ kind: 'node', id: instanceId });
    graphViews.updateView({ selection: { primary: { kind: 'node', id: instanceId }, multi: [] } });
    workbench.update({ subgraphSave: null });
    navigateGraphView('openInstance', [...parentPath, instanceId]);
    if (JSON.stringify(graphViews.readEditor().view.identity.instancePath) !== JSON.stringify([...parentPath, instanceId])) return result;
    graphViews.updateView({ nodePresentation: presentation });
    activateEditorDraw(); canvas.fit({ avoidShelf: true }); persistGraphViews();
    return result;
}
function queueSubgraphPresentation(graph, effect, direction) {
    const pending = pendingSubgraphPresentation.get(graph) ?? new Map();
    for (const view of [...effect.before, ...effect.after]) pending.delete(viewIdentityKey(view.identity));
    for (const view of direction === 'undo' ? effect.before : effect.after) pending.set(viewIdentityKey(view.identity), view);
    pendingSubgraphPresentation.set(graph, pending);
}
function handleSubgraphHistory(graph, event) {
    if (!event?.effect || !['undo', 'redo'].includes(event.direction)) return;
    const stored = subgraphPresentationEffects.get(event.effect);
    if (stored?.root !== graph) return;
    if (stored.aliasRename) {
        const rename = stored.aliasRename, live = graphViews?.readRoot() === graph;
        const serialized = live ? graphViews.serialize().data : activeWorkflow() === graph ? activeWorkspaceViews() : null;
        const view = serialized?.views.find(view => viewIdentityKey(view.identity) === rename.viewKey);
        if (!view) return;
        const nodePresentation = { ...view.nodePresentation, [rename.nodeId]: { ...view.nodePresentation[rename.nodeId], alias: event.direction === 'undo' ? rename.before : rename.after } };
        if (live) {
            const result = graphViews.updateView({ nodePresentation }, rename.viewKey);
            if (!result.ok) return toast(result.error, 'error');
            persistGraphViews(true);
        } else {
            setActiveWorkspaceViews({ ...serialized, views: serialized.views.map(entry => entry === view ? { ...entry, nodePresentation } : entry) });
        }
        return;
    }
    // History notifies before navigation prunes the outgoing instance paths.
    // Carry the latest presentation, including edits made since extraction.
    const serialized = graphViews?.readRoot() === graph ? graphViews.serialize().data : activeWorkflow() === graph ? activeWorkspaceViews() : null;
    if (serialized) Object.assign(stored, refreshRelocatedSubgraphViews(stored, serialized, event.direction));
    queueSubgraphPresentation(graph, stored, event.direction);
}
function applyPendingSubgraphPresentation() {
    if (!graphViews) return;
    const graph = graphViews.readRoot(), pending = pendingSubgraphPresentation.get(graph);
    if (!pending?.size) return;
    const live = new Set(workspacePrepared.preparedViews.map(view => viewIdentityKey(view.identity)));
    const snapshots = [...pending].filter(([key]) => live.has(key)).map(([, view]) => view);
    const restored = restoreSubgraphViews(graphViews, snapshots);
    if (restored.ok) pendingSubgraphPresentation.delete(graph);
    else toast(restored.error, 'error');
}
function boundaryForNode(nodeId) {
    return graphViews?.readEditor().prepared.interface.find(port => port.boundaryNodeId === nodeId) ?? null;
}
function focusBoundaryLabel(nodeId) {
    if (!boundaryForNode(nodeId)) return;
    showSettings({ kind: 'node', id: nodeId });
    const captured = captureEditor(true); if (!captured.ok) return;
    requestAnimationFrame(() => {
        if (!editorCurrent(captured.data) || canvas.selection?.id !== nodeId) return;
        const input = workbench.parts.inspector.querySelector('[aria-label="Node name"]');
        if (input && !input.disabled) { input.focus({ preventScroll: true }); input.select(); }
    });
}
function editSubgraphInterface(selection, edit) {
    const captured = detailCapture(selection); if (!captured.ok) return captured;
    const editor = graphViews.readEditor(), port = boundaryForNode(selection.address.nodeId);
    if (!port || edit.id !== port.id || !['update', 'remove'].includes(edit.kind) || editor.view.identity.kind !== 'instance') return { ok: false, error: { code: 'INVALID_PORT', message: 'Select the boundary whose port you want to edit.' } };
    return commitCaptured(captured.data, prepareOwnedDefinitionMetadataEdit(current, { instancePath: [...editor.view.identity.instancePath], expectedRef: editor.prepared.definitionRef, kind: 'interface', edit }));
}
function addSubgraphBoundary(direction, nodeId = null, graphPoint = null) {
    const captured = captureEditor(); if (!captured.ok) return captured;
    const editor = graphViews.readEditor(), port = nodeId === null ? null : boundaryForNode(nodeId);
    if (editor.view.identity.kind !== 'instance' || editor.readOnly || !['input', 'output'].includes(direction) || nodeId !== null && !port) return { ok: false, error: { code: 'INVALID_PORT', message: 'Open an editable subgraph to add a port.' } };
    const base = direction === 'input' ? 'Input' : 'Output', labels = new Set(editor.prepared.interface.map(item => item.label));
    let label = base, index = 2; while (labels.has(label)) label = base + ' ' + index++;
    const prepared = prepareOwnedDefinitionMetadataEdit(current, { instancePath: [...editor.view.identity.instancePath], expectedRef: editor.prepared.definitionRef, kind: 'interface', edit: { kind: 'add', direction, label, artifactKind: port?.kind ?? 'text', required: false, ...(graphPoint ? { graphPoint } : {}) } });
    const result = commitCaptured(captured.data, prepared);
    if (result.ok) { if (!graphPoint) canvas.fit({ avoidShelf: true }); focusBoundaryLabel(prepared.data.addedBoundaryNodeId); }
    return result;
}
export function refreshIfOpen() {
    if (isOpen()) { const graph = activeWorkflow(); if (current !== graph) { current = graph; setCanvasGraph(); } else { syncNativeRevision('Workflow edited'); refreshWorkspaceDocument(); } renderAll(); }
}
function captureEditor(navigation = false) {
    if (!isOpen() || !graphViews) return { ok: false, error: { code: 'VIEW_INACTIVE', message: 'The graph view is unavailable.' } };
    const editor = graphViews.readEditor(), transaction = navigation ? null : captureGraphEditContext(current, readGraphEditContext);
    if (transaction && !transaction.ok) return transaction;
    const token = Object.freeze({}); editorCaptures.set(token, { root: current, view: graphViews.captureEditorContext(), context: transaction?.data, path: [...(editor.view.identity.instancePath ?? [])], expectedRef: editor.prepared.definitionRef, revision: graphViews.readEditContext().sessionId + ':' + workspaceRevision, navigation }); return { ok: true, data: token };
}
function editorCurrent(token) { const captured = editorCaptures.get(token); return !!captured && isOpen() && captured.root === current && activeEditRoot() === captured.root && graphViews?.isEditorContextCurrent(captured.view); }
function scopeCommand(token) { const captured = editorCaptures.get(token); return { viewPath: [...captured.path], ...(captured.path.length ? { expectedRef: captured.expectedRef } : {}) }; }
function commitCaptured(token, prepared) {
    if (!editorCurrent(token)) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The graph view changed. Prepare this edit again.' } };
    if (!prepared.ok) { toast(prepared.error, 'error'); return prepared; }
    const captured = editorCaptures.get(token);
    if (prepared.data.viewPath !== undefined && JSON.stringify(prepared.data.viewPath) !== JSON.stringify(captured.path)) return {ok:false,error:{code:'STALE_CONTEXT',message:'The prepared edit belongs to a different containing graph.'}};
    const {editorToken,...data}=prepared.data;
    return commitGraphEdit(current, { ...data, context: captured.context, viewPath: captured.path }, graphDocumentHooks);
}
function captureCommentEdit() {
    const captured = captureEditor(); if (!captured.ok) return null;
    const bounds = Object.fromEntries(Object.values(editorDraw.nodes).map(node => [node.id, commentBounds(node)]));
    const groups = Object.fromEntries(Object.values(editorDraw.groups ?? {}).map(group => [group.id, { ...structuredClone(group), ...commentGroupOrigin(group, editorDraw, bounds), members: groupMembers(editorDraw, group.id).map(node => node.id) }]));
    commentCaptures.set(captured.data, { view: structuredClone(graphViews.readEditor().view), multi: [...canvas.multi], bounds, groups });
    return captured.data;
}
function commentGroupOrigin(group, graph, bounds) {
    if (Number.isFinite(group.x) && Number.isFinite(group.y)) return { x: group.x, y: group.y };
    const members = groupMembers(graph, group.id).map(node => bounds[node.id]);
    const x = members.length ? Math.min(...members.map(rect => rect.x)) - 24 : group.frame?.x ?? 0;
    const y = members.length ? Math.min(...members.map(rect => rect.y)) - 48 : group.frame?.y ?? 0;
    return { x: group.x ?? Math.min(group.frame?.x ?? x, x), y: group.y ?? Math.min(group.frame?.y ?? y, y) };
}
function commentShortcutAvailable() { return !documentTransition && !canvas?.hasContentGesture?.() && !nativeWireBridge?.hasContentGesture?.(); }
function commentBounds(node) { return { x: node.x, y: node.y, w: canvas.widthOf(node), h: canvas.heightOf(node) }; }
function commentSelectionIds() {
    const ids = canvas.multi.size ? [...canvas.multi] : canvas.selection?.kind === 'group' ? groupMembers(editorDraw, canvas.selection.id).map(node => node.id) : canvas.selection?.kind === 'node' ? [canvas.selection.id] : [];
    return ids.filter(id => editorDraw.nodes[id] && !isCommentFrame(editorDraw.nodes[id]));
}
function commentLocation(at) {
    if (Number.isFinite(at?.x) && Number.isFinite(at?.y)) return at;
    if (Number.isFinite(canvas.pointer?.x) && Number.isFinite(canvas.pointer?.y)) return canvas.pointer;
    const rect = canvas.host.getBoundingClientRect(); return canvas.toGraph(rect.left + rect.width / 2, rect.top + rect.height / 2);
}
function commitComment(command, token = null) {
    const captured = token ? { ok: editorCurrent(token), data: token } : captureEditor();
    if (!captured.ok || editorCaptures.get(captured.data)?.navigation || graphViews?.readEditor().readOnly) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The comment view changed or is read-only.' } };
    return commitCaptured(captured.data, prepareCommentEdit(current, { ...command, ...scopeCommand(captured.data) }));
}
function addComment(at = null, ids = null) {
    const captured = captureEditor(); if (!captured.ok) return captured;
    const frame = createCommentFrame(editorDraw, ids ?? commentSelectionIds(), commentBounds, { at: commentLocation(at) });
    const committed = commitComment({ kind: 'create', frame }, captured.data);
    if (committed.ok && committed.data.changed) {
        canvas.setMulti([]); canvas.select({ kind: 'node', id: frame.id });
        const focus = captureEditor(true);
        if (focus.ok) workbench.focusCommentTitle?.(frame.id, () => editorCurrent(focus.data) && canvas.selection?.kind === 'node' && canvas.selection.id === frame.id);
    }
    return committed;
}
function commentCommand(token, id, command) {
    if (!editorCurrent(token) || !isCommentFrame(editorDraw?.nodes[id])) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The comment changed. Select it again.' } };
    if (command === 'delete') return commitComment({ kind: 'delete', nodeId: id }, token);
    if (command !== 'fit') return { ok: false, error: { code: 'INVALID_COMMENT_COMMAND', message: 'Choose a comment command.' } };
    const { x, y, w, h } = fitCommentFrame(editorDraw, editorDraw.nodes[id], commentBounds);
    return commitComment({ kind: 'update', nodeId: id, patch: { x, y, w, h } }, token);
}
function commentPatch(token, id, patch) {
    if (!editorCurrent(token) || !isCommentFrame(editorDraw?.nodes[id])) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The comment changed. Select it again.' } };
    return commitComment({ kind: 'update', nodeId: id, patch }, token);
}
function commentLayoutIds(capture, positions) {
    if (!capture || !Array.isArray(positions) || !positions.length || positions.length > 1000) return null;
    const editor = graphViews.readEditor(), graph = projectEditorDraw({ ...editor, view: capture.view });
    const ids = positions.map(position => position?.id), frames = ids.filter(id => isCommentFrame(graph.nodes[id]));
    if (new Set(ids).size !== ids.length || ids.some(id => !graph.nodes[id]) || !frames.length) return null;
    let expected;
    const frame = graph.nodes[frames[0]], position = positions.find(position => position.id === frame.id);
    const resizing = position.w !== capture.bounds[frame.id].w || position.h !== capture.bounds[frame.id].h;
    if (resizing) {
        if (frames.length !== 1 || position.x !== frame.x || position.y !== frame.y) return null;
        expected = [frame.id];
    } else if (capture.multi.length > 1 && capture.multi.includes(frame.id)) expected = capture.multi;
    else {
        if (frames.length !== 1) return null;
        expected = [frame.id, ...(frame.moveContents !== false ? containedCommentNodes(graph, frame, node => capture.bounds[node.id]).filter(node => !node.inGroup || !graph.groups[node.inGroup]?.collapsed).map(node => node.id) : [])];
    }
    if (JSON.stringify([...expected].sort()) !== JSON.stringify([...ids].sort())) return null;
    const first = positions[0], origin = graph.nodes[first.id], dx = first.x - origin.x, dy = first.y - origin.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || positions.some(position => Math.abs(position.x - graph.nodes[position.id].x - dx) > 1e-7 || Math.abs(position.y - graph.nodes[position.id].y - dy) > 1e-7)) return null;
    return ids.filter(id => !isCommentFrame(graph.nodes[id]));
}
function commentDocumentState(graph) { return JSON.stringify(Object.fromEntries(H.GRAPH_DOCUMENT_FIELDS.filter(key => Object.hasOwn(graph, key)).map(key => [key, graph[key]]))); }
function commentLayoutGroups(capture, positions, groupPositions) {
    if (!Array.isArray(groupPositions) || groupPositions.length > 1000) return null;
    const selected = new Set(positions.map(position => position.id)), ids = groupPositions.map(position => position?.id);
    const expected = Object.values(capture.groups).filter(group => group.collapsed && group.members.length && group.members.every(id => selected.has(id))).map(group => group.id);
    if (new Set(ids).size !== ids.length || JSON.stringify([...ids].sort()) !== JSON.stringify(expected.sort())) return null;
    const first = positions[0], origin = capture.bounds[first.id], dx = first.x - origin.x, dy = first.y - origin.y;
    for (const position of groupPositions) {
        const group = capture.groups[position.id];
        if (!group || !Number.isFinite(position.x) || !Number.isFinite(position.y) || Math.abs(position.x - group.x - dx) > 1e-7 || Math.abs(position.y - group.y - dy) > 1e-7) return null;
        const frame = group.frame ? { ...group.frame, x: group.frame.x + dx, y: group.frame.y + dy } : undefined;
        if (JSON.stringify(position.frame) !== JSON.stringify(frame)) return null;
    }
    return ids;
}
function commentLayout(token, positions, groupPositions = []) {
    if (!editorCurrent(token) || graphViews.readEditor().readOnly) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The comment view changed or is read-only.' } };
    const capture = commentCaptures.get(token), ids = commentLayoutIds(capture, positions);
    if (!ids) return { ok: false, error: { code: 'INVALID_COMMENT_LAYOUT', message: 'The comment layout no longer matches its captured contents.' } };
    const groupIds = commentLayoutGroups(capture, positions, groupPositions);
    if (!groupIds) return { ok: false, error: { code: 'INVALID_COMMENT_LAYOUT', message: 'The comment layout no longer matches its captured groups.' } };
    if (!ids.length && !groupIds.length) return commitComment({ kind: 'layout', positions, groupPositions }, token);
    const effect = captureCommentPresentation(capture.view, ids, groupIds), after = effect && applyCommentPresentation(graphViews.readEditor().view.nodePresentation, effect, 'redo');
    const afterGroups = !groupIds.length || effect && applyCommentGroupPresentation(graphViews.readEditor().view.groupPresentation ?? {}, effect, 'redo');
    if (!effect || !after || !afterGroups) return commentPresentationFailure('The comment presentation exceeds its data limit.');
    const beforeState = commentDocumentState(current), receipt = H.capturePresentationStep(current);
    const committed = commitComment({ kind: 'layout', positions, groupPositions }, token);
    if (!committed.ok || !committed.data.changed) return committed;
    const handle = Object.freeze({});
    if (!H.attachPresentationEffect(current, { receipt, effect: handle, beforeState, afterState: commentDocumentState(current) })) return commentPresentationFailure('The comment history step changed before its presentation could be attached.');
    commentPresentationEffects.set(handle, { root: current, effect });
    const updated = applyCommentPresentationEffect(current, effect, 'redo');
    if (!updated.ok) return updated;
    activateEditorDraw(); persistGraphViews(); return committed;
}
function commentPresentationFailure(message) {
    workspaceIssue = message; toast(message, 'error'); workbench?.update?.({ nativeDiagnostic: message });
    return { ok: false, error: { code: 'COMMENT_PRESENTATION', message } };
}
function commentPresentationCoordinates(effect, direction, previous = null) {
    if (!['undo', 'redo'].includes(direction) || previous && previous.viewKey !== effect.viewKey) return null;
    const coordinates = { ...previous?.coordinates };
    for (const [id, captured] of Object.entries(effect.coordinates)) coordinates[id] = direction === 'undo' ? structuredClone(captured) : {};
    const groupCoordinates = { ...previous?.groupCoordinates };
    for (const [id, captured] of Object.entries(effect.groupCoordinates ?? {})) groupCoordinates[id] = direction === 'undo' ? structuredClone(captured) : {};
    const combined = { viewKey: effect.viewKey, identity: structuredClone(effect.identity), coordinates, ...(Object.keys(groupCoordinates).length ? { groupCoordinates } : {}) };
    return applyCommentPresentation({}, combined, 'undo') && (!combined.groupCoordinates || applyCommentGroupPresentation({}, combined, 'undo')) ? combined : null;
}
function deferCommentPresentation(graph, effect, direction) {
    let pending = pendingCommentPresentation.get(graph);
    if (!pending) { pending = new Map(); pendingCommentPresentation.set(graph, pending); }
    if (!pending.has(effect.viewKey) && pending.size >= 50) return commentPresentationFailure('Too many removed comment views await presentation restoration.');
    const combined = commentPresentationCoordinates(effect, direction, pending.get(effect.viewKey)?.effect);
    if (!combined) return commentPresentationFailure('The deferred comment coordinates exceed their presentation-data limit.');
    // Each node keeps its latest ordered coordinate intent; disjoint Undo/Redo
    // steps compose without retaining an unbounded operation list.
    pending.set(effect.viewKey, { effect: combined, direction: 'undo' }); return { ok: true, data: { pending: true } };
}
function applyCommentPresentationEffect(graph, effect, direction) {
    if (graph.id !== effect.identity.workflowId || viewIdentityKey(effect.identity) !== effect.viewKey) return commentPresentationFailure('The comment presentation belongs to a different workflow view.');
    const combined = commentPresentationCoordinates(effect, direction, pendingCommentPresentation.get(graph)?.get(effect.viewKey)?.effect);
    if (!combined) return commentPresentationFailure('The comment coordinates exceed their presentation-data limit.');
    if (graphViews?.readRoot() === graph) {
        const projection = graphViews.project().graphViews, view = [...projection.tabs, ...projection.closedViews].find(view => view.key === effect.viewKey);
        if (!view) return deferCommentPresentation(graph, effect, direction);
        const nodePresentation = applyCommentPresentation(view.nodePresentation, combined, 'undo');
        const groupPresentation = combined.groupCoordinates ? applyCommentGroupPresentation(view.groupPresentation ?? {}, combined, 'undo') : null;
        if (!nodePresentation || combined.groupCoordinates && !groupPresentation) { deferCommentPresentation(graph, effect, direction); return commentPresentationFailure('The comment coordinates could not fit the retained view.'); }
        const result = graphViews.updateView({ nodePresentation, ...(groupPresentation && (view.groupPresentation !== undefined || Object.keys(groupPresentation).length) ? { groupPresentation } : {}) }, effect.viewKey);
        if (!result.ok) { deferCommentPresentation(graph, effect, direction); return commentPresentationFailure(result.error.message); }
        pendingCommentPresentation.get(graph)?.delete(effect.viewKey); persistGraphViews(); return result;
    }
    const persisted = activeWorkflow() === graph ? activeWorkspaceViews() : null, view = persisted?.views?.find(view => viewIdentityKey(view.identity) === effect.viewKey);
    if (!view) return deferCommentPresentation(graph, effect, direction);
    const nodePresentation = applyCommentPresentation(view.nodePresentation, combined, 'undo');
    const groupPresentation = combined.groupCoordinates ? applyCommentGroupPresentation(view.groupPresentation ?? {}, combined, 'undo') : null;
    if (!nodePresentation || combined.groupCoordinates && !groupPresentation) { deferCommentPresentation(graph, effect, direction); return commentPresentationFailure('The comment coordinates could not fit the saved view.'); }
    const next = structuredClone(persisted), target = next.views.find(view => viewIdentityKey(view.identity) === effect.viewKey); target.nodePresentation = nodePresentation;
    if (groupPresentation && (view.groupPresentation !== undefined || Object.keys(groupPresentation).length)) target.groupPresentation = groupPresentation;
    if (new TextEncoder().encode(JSON.stringify(next)).length > 262144) { deferCommentPresentation(graph, effect, direction); return commentPresentationFailure('The saved view exceeds its presentation-data limit.'); }
    setActiveWorkspaceViews(next); pendingCommentPresentation.get(graph)?.delete(effect.viewKey); return { ok: true };
}
function applyPendingCommentPresentation() {
    if (!graphViews) return true;
    const graph = graphViews.readRoot(), pending = pendingCommentPresentation.get(graph);
    if (!pending?.size) return true;
    const projection = graphViews.project().graphViews, retained = new Set([...projection.tabs, ...projection.closedViews].map(view => view.key));
    for (const [key, { effect, direction }] of pending) if (retained.has(key) && !applyCommentPresentationEffect(graph, effect, direction).ok) return false;
    return true;
}
function handleCommentHistory(graph, event) {
    if (!event?.effect || !['undo', 'redo'].includes(event.direction)) return;
    const stored = commentPresentationEffects.get(event.effect);
    if (stored?.root === graph) applyCommentPresentationEffect(graph, stored.effect, event.direction);
}
function prepareScopeMutation(token, mutate) { return prepareQualifiedScopeEdit(current, scopeCommand(token), mutate); }
function prepareNode(rootGraph, command) { return prepareNativeNodeEdit(rootGraph, command); }
function detailCapture(selection, presentation = false) {
    const captured = captureEditor(presentation); if (!captured.ok) return captured;
    const editor = graphViews.readEditor(), actualRevision = graphViews.readEditContext().sessionId + ':' + workspaceRevision;
    const library=editor.view.identity.kind==='library';
    if (selection.revision !== actualRevision || selection.selectionKey !== JSON.stringify([editor.view.key, selection.address.nodeId]) || (library ? selection.address.kind!=='library'||definitionRefKey(selection.address.definitionRef)!==definitionRefKey(editor.prepared.definitionRef) : selection.address.kind==='library'||selection.address.workflowId!==current.id||JSON.stringify(selection.address.instancePath)!==JSON.stringify(editor.view.identity.instancePath ?? []))) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The selected node changed.' } };
    return captured;
}
function editInstanceBinding(selection, field, mode, value) {
    const captured = detailCapture(selection, true); if (!captured.ok) return captured;
    const editor = graphViews.readEditor(), path = selection.address.instancePath;
    if (editor.view.identity.kind !== 'instance' || !path.length) return { ok: false, error: { code: 'INVALID_INSTANCE', message: 'Select a node in a workflow instance.' } };
    // Bind this occurrence on its root wrapper, leaving pinned definitions and
    // sibling instances unchanged. Keep the active child tab and selection.
    const context = captureGraphEditContext(current, () => ({ sessionId: readGraphEditContext().sessionId, viewPath: [], readOnly: !editorCurrent(captured.data) }));
    if (!context.ok) return context;
    const resetting = mode === 'inherit';
    const prepared = prepareNode(current, { kind: 'binding-override', viewPath: [], nodeId: path[0], expectedInstanceRef: current.nodes[path[0]].definition,
        target: { kind: 'node', instancePath: path.slice(1), nodeId: selection.address.nodeId }, field, mode: resetting ? 'reset' : 'set',
        ...(resetting ? {} : { value: mode === 'block' ? null : value }) });
    if (!prepared.ok) return prepared;
    return commitGraphEdit(current, { ...prepared.data, context: context.data, viewPath: [] }, graphDocumentHooks);
}
function editIterationHelperBinding(selection, role, field, mode, value) {
    const captured=detailCapture(selection);if(!captured.ok)return captured;
    return commitCaptured(captured.data,prepareScopeMutation(captured.data,context=>{
        const node=context.scope.nodes[selection.address.nodeId];
        if(!node)return {ok:false,error:{code:'STALE_CONTEXT',message:'The selected iteration node changed.'}};
        const checked=prepareIterationBindingOverride(node,context.candidate.definitions??{},{role,field,mode,value});if(!checked.ok)return checked;
        if(Object.keys(checked.data.roleOverrides).length)node.roleOverrides=checked.data.roleOverrides;else delete node.roleOverrides;
        return {ok:true,data:{}};
    }));
}
const commentDetailsActions = {
    patch(selection, patch) { const captured = detailCapture(selection); return captured.ok ? commentPatch(captured.data, selection.address.nodeId, patch) : captured; },
    command(selection, command) { const captured = detailCapture(selection); return captured.ok ? commentCommand(captured.data, selection.address.nodeId, command) : captured; },
};
function prepareGuideExample(key) {
    if (!isOpen() || !current || !graphViews) return {ok: false, error: {code: 'VIEW_INACTIVE', message: 'Open an editable canvas tab to add this example.'}};
    if (guideInsertionIsBusy()) return {ok: false, error: {code: 'WORKFLOW_BUSY', message: 'Wait for the current run to finish before adding this example.'}};
    const editor = graphViews.readEditor();
    const example = getNodeGuideExample(key);
    if (!example) return {ok: false, error: {code: 'EXAMPLE_UNAVAILABLE', message: 'This example is unavailable.'}};
    return prepareNodeGuideInsertion(current, example, {viewPath: [...(editor.view.identity.instancePath ?? [])], readOnly: editor.readOnly || editor.view.identity.kind === 'library'});
}
const nodeGuideActions = {
    example(key) {
        const example = getNodeGuideExample(key);
        if (!example) return {ok: false, error: {code: 'EXAMPLE_UNAVAILABLE', message: 'This example is unavailable.'}};
        const prepared = prepareNodeGuideScene(example.graph, example.focus);
        return prepared.ok ? {ok: true, data: {example, scene: prepared.data}} : prepared;
    },
    status(key) {
        const prepared = prepareGuideExample(key);
        return prepared.ok ? {enabled: true, reason: prepared.data.message ?? ''} : {enabled: false, reason: prepared.error.message};
    },
    add(key) {
        canvas?.cancelGesture('guide-example');
        const captured = captureEditor(); if (!captured.ok) return captured;
        const prepared = prepareGuideExample(key);
        if (!prepared.ok) return prepared;
        const committed = commitCaptured(captured.data, prepared);
        if (committed.ok) {
            const ids = prepared.data.added?.nodes ?? [];
            if (ids.length === 1) canvas.select({kind: 'node', id: ids[0]}); else if (ids.length) canvas.setMulti(ids);
            if (ids.length) canvas.fitSelection();
        }
        return committed;
    },
};
const nodeDetailsActions = {
    queueRecall(selection){const captured=detailCapture(selection,true);return captured.ok?recallActions.change([selection.address.nodeId],'queue'):captured;},
    cancelRecall(selection){const captured=detailCapture(selection,true);return captured.ok?recallActions.change([selection.address.nodeId],'cancel'):captured;},
    revealRecallShortcut:nodeId=>openRecallDetails(nodeId,'all'),
    loadWorkflowData(selection, key) {
        const captured = detailCapture(selection); if (!captured.ok) return captured;
        const node = graphViews.readEditor().prepared.effectiveNodes[selection.address.nodeId], preset = workflowDataPresetFor(node?.operation);
        return preset ? workflowDataSetup()?.load(key, node.operation, node[preset.controlKey] || preset.targetId, true, selection.address) ?? { ok: false, error: { code: 'DOCUMENT_SETUP_UNAVAILABLE', message: 'Open an active chat to adjust initial values.' } } : { ok: false, error: { code: 'INVALID_WORKFLOW_DATA', message: 'Select a node that uses Workflow Data.' } };
    },
    async saveWorkflowData(selection, key, definition) {
        const captured = detailCapture(selection); if (!captured.ok) return captured;
        const node = graphViews.readEditor().prepared.effectiveNodes[selection.address.nodeId], preset = workflowDataPresetFor(node?.operation);
        if (!preset) return { ok: false, error: { code: 'INVALID_WORKFLOW_DATA', message: 'Select a node that uses Workflow Data.' } };
        const result = await workflowDataSetup()?.save(key, node.operation, node[preset.controlKey] || preset.targetId, definition, true, selection.address);
        if (!result) return { ok: false, error: { code: 'DOCUMENT_SETUP_UNAVAILABLE', message: 'Open an active chat to adjust initial values.' } };
        if (result.ok) {
            if (!editorCurrent(captured.data)) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The graph view changed. Prepare this edit again.' } };
            workflowSession.cancel('Workflow Data initial values changed'); refreshWorkflowPreparation(); updateWorkflowProjection();
        }
        return result;
    },
    async saveWorkflowDataVisibility(selection, key, visibility) {
        const captured = detailCapture(selection); if (!captured.ok) return captured;
        const node = graphViews.readEditor().prepared.effectiveNodes[selection.address.nodeId], preset = workflowDataPresetFor(node?.operation);
        if (!preset) return { ok: false, error: { code: 'INVALID_WORKFLOW_DATA', message: 'Select a node that uses Workflow Data.' } };
        const result = await workflowDataSetup()?.saveVisibility(key, node.operation, node[preset.controlKey] || preset.targetId, visibility, selection.address);
        if (!result) return { ok: false, error: { code: 'DOCUMENT_SETUP_UNAVAILABLE', message: 'Open an active chat to adjust visibility.' } };
        if (result.ok) {
            if (!editorCurrent(captured.data)) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The graph view changed. Prepare this edit again.' } };
            workflowSession.cancel('Workflow Data visibility changed'); refreshWorkflowPreparation(); updateWorkflowProjection();
        }
        return result;
    },
    async createWorkflowData(selection, key, options) {
        const captured = detailCapture(selection); if (!captured.ok) return captured;
        const node = graphViews.readEditor().prepared.effectiveNodes[selection.address.nodeId], preset = workflowDataPresetFor(node?.operation);
        if (!preset || options?.kind !== preset.kind) return { ok: false, error: { code: 'INVALID_WORKFLOW_DATA', message: 'Choose a compatible data source for this node.' } };
        const result = await workflowDataSetup()?.create(key, node.operation, options);
        if (!result) return { ok: false, error: { code: 'DOCUMENT_SETUP_UNAVAILABLE', message: 'Open an active chat to create a separate data source.' } };
        if (!result.ok) return result;
        if (!editorCurrent(captured.data)) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The graph view changed. Prepare this edit again.' } };
        const stillSelected = detailCapture(selection); if (!stillSelected.ok) return stillSelected;
        const committed = commitCaptured(captured.data, prepareNode(current, { ...scopeCommand(captured.data), kind: 'controls', nodeId: selection.address.nodeId, controls: { [preset.controlKey]: result.data.definition.targetId } }));
        refreshWorkflowPreparation(); updateWorkflowProjection();
        return committed.ok ? result : committed;
    },
    bindWorkflowData(selection, key, targetId) {
        const captured = detailCapture(selection); if (!captured.ok) return captured;
        const node = graphViews.readEditor().prepared.effectiveNodes[selection.address.nodeId], preset = workflowDataPresetFor(node?.operation), setup = workflowDataSetup();
        if (!preset || !setup) return { ok: false, error: { code: 'DOCUMENT_SETUP_UNAVAILABLE', message: 'Workflow Data settings are unavailable.' } };
        const checked = setup.checkBinding(key, node.operation, targetId); if (!checked.ok) return checked;
        const prepared = prepareNode(current, { ...scopeCommand(captured.data), kind: 'controls', nodeId: selection.address.nodeId, controls: { [preset.controlKey]: targetId } });
        const stillCurrent = setup.checkBinding(key, node.operation, targetId); if (!stillCurrent.ok) return stillCurrent;
        return commitCaptured(captured.data, prepared);
    },
    editHelperBinding(selection,role,field,mode,value) { return editIterationHelperBinding(selection,role,field,mode,value); },
    editPhase(selection, phase) {
        const captured = detailCapture(selection); if (!captured.ok) return captured;
        return commitCaptured(captured.data, prepareScopeMutation(captured.data, context => {
            const node = context.scope.nodes[selection.address.nodeId];
            if (!node || context.scope.mode !== 'native-unified' || OPERATIONS[node.operation]?.phase !== 'both' || !['pre', 'post'].includes(phase)) return { ok: false, error: { code: 'INVALID_PHASE', message: 'Choose a preparation or response stage for a both-stage node in a unified workflow.' } };
            node.phase = phase; return { ok: true, data: {} };
        }));
    },
    async loadFile(selection, file) {
        const captured = detailCapture(selection); if (!captured.ok) return captured;
        const selectedEpoch = selectionEpoch;
        const stillSelected = () => selectionEpoch === selectedEpoch && selectedKind === 'node' && selected?.id === selection.address.nodeId;
        if (!stillSelected()) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The selected node changed.' } };
        if (editorDraw?.nodes[selection.address.nodeId]?.operation !== 'file-input') return { ok: false, error: { code: 'INVALID_FILE_TARGET', message: 'Select a File Input node.' } };
        const loaded = await readTextFile(file); if (!loaded.ok) return loaded;
        const currentSelection = detailCapture(selection); if (!currentSelection.ok) return currentSelection;
        if (!stillSelected()) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The selected node changed while reading the file.' } };
        return commitCaptured(captured.data, prepareNode(current, { ...scopeCommand(captured.data), kind: 'controls', nodeId: selection.address.nodeId, controls: loaded.data }));
    },
    present(selection, field, value) { const captured = detailCapture(selection, true); if (!captured.ok) return captured; presentNode(selection.address.nodeId,field,value); return { ok: true }; },
    editControl(selection,key,value) { const captured = detailCapture(selection); return captured.ok ? commitCaptured(captured.data,prepareNode(current,{ ...scopeCommand(captured.data),kind:'controls',nodeId:selection.address.nodeId,controls:{[key]:value} })) : captured; },
    editModifiers(selection,items) {
        const captured = detailCapture(selection); if (!captured.ok) return captured;
        return commitCaptured(captured.data, prepareScopeMutation(captured.data, context => {
            const node = context.scope.nodes[selection.address.nodeId];
            if (!node) return {ok:false,error:{code:'STALE_CONTEXT',message:'The selected node changed.'}};
            const checked = validateNodeModifiers({...node,modifiers:items}, portsForNode(context.metadata(),node).filter(port => port.direction === 'output'));
            if (!checked.ok) return checked;
            if (checked.data.modifiers.length) node.modifiers = structuredClone(checked.data.modifiers); else delete node.modifiers;
            return {ok:true,data:{}};
        }));
    },
    editField(selection,key,value) { const captured = detailCapture(selection); return captured.ok ? commitCaptured(captured.data,prepareNode(current,{ ...scopeCommand(captured.data),kind:key === 'enabled' ? 'enabled' : 'model-role',nodeId:selection.address.nodeId,...(key === 'enabled' ? {value} : {mode:'set',value}) })) : captured; },
    editBinding(selection,field,mode,value) { if (graphViews?.readEditor().readOnly && graphViews.readEditor().view.identity.kind === 'instance') return editInstanceBinding(selection,field,mode,value); const captured = detailCapture(selection); return captured.ok ? commitCaptured(captured.data,prepareNode(current,{ ...scopeCommand(captured.data),kind:'binding',nodeId:selection.address.nodeId,field,consumeOverride:true,mode:mode === 'inherit' ? 'remove' : 'set',...(mode === 'inherit' ? {} : {value:mode==='block'?null:value}) })) : captured; },
    duplicate(selection) { const captured=detailCapture(selection);if(captured.ok)duplicateSelected(editorDraw.nodes[selection.address.nodeId],false); },
    remove(selection) { const captured = detailCapture(selection); if (captured.ok) deleteNativeSelection({kind:'node',id:selection.address.nodeId}, captured.data); },
    editInterface: editSubgraphInterface,
};
function runPreviewHere(key,target) {
    if (key !== graphViews?.readEditContext().sessionId + ':' + workspaceRevision || graphViews.readEditor().view.identity.kind === 'library') return;
    if (workflowState.busy || workflowRuntime.getNativeWorkflowController?.()?.activity?.()?.busy) return;
    return workflowSession.run({target});
}
function revealDiagnosticNode(address) {
    if (!isOpen() || !graphViews || activeEditRoot() !== current || !address || address.workflowId !== current?.id
        || !Array.isArray(address.instancePath) || address.instancePath.some(id => typeof id !== 'string') || typeof address.nodeId !== 'string') return false;
    const path = address.instancePath;
    const source = workspacePrepared?.preparedViews.find(view => view.identity.kind !== 'library' && view.identity.workflowId === current.id
        && JSON.stringify(view.identity.instancePath ?? []) === JSON.stringify(path));
    if (!source?.drawBase?.nodes[address.nodeId]) return false;
    if (path.length) navigateGraphView('openInstance', [...path]);
    else {
        const rootView = graphViews.project().graphViews.tabs.find(view => view.identity.kind === 'root' && view.identity.workflowId === current.id);
        if (!rootView) return false;
        navigateGraphView('focusView', rootView.key);
    }
    const editor = graphViews.readEditor();
    if (editor.view.identity.kind === 'library' || editor.view.identity.workflowId !== current.id
        || JSON.stringify(editor.view.identity.instancePath ?? []) !== JSON.stringify(path) || !editorDraw?.nodes[address.nodeId]) return false;
    canvas.select({ kind: 'node', id: address.nodeId }); canvas.fitSelection(); return true;
}
const outputPreviewActions = {
    select(key,choice,target) { if (key !== graphViews?.readEditContext().sessionId + ':' + workspaceRevision) return; selectedPreview = target; updateWorkflowProjection(); },
    pin(key,target) { if (key !== graphViews?.readEditContext().sessionId + ':' + workspaceRevision) return; targetedPreview = null; pinnedPreview = target; updateWorkflowProjection(); },
    follow() { pinnedPreview = null; targetedPreview = null; updateWorkflowProjection(); },
    runHere: runPreviewHere,
    reveal: address => revealDiagnosticNode(address),
    apply: applyPreviewReview, reject: rejectPreviewReview,
};
const runDetailsActions = { jump(runId,address) { if (runId !== (workflowState.runState?.runId || workflowState.recording?.runId) || address.workflowId !== current.id) return; if (address.instancePath.length) navigateGraphView('openInstance',address.instancePath); else navigateGraphView('focusView',graphViews.project().graphViews.tabs[0].key); canvas.select({kind:'node',id:address.nodeId}); canvas.fitSelection(); } };
function nativeAttachments(pin) { return editorDraw?.nativeAttachments?.[JSON.stringify([pin.nodeId,pin.dir,pin.portId])] ?? {originalBindings:[],jumps:[]}; }
function jumpNativeNode(capture, target) {
    if (!editorCurrent(capture) || !target || !editorDraw?.nodes[target.nodeId]) return false;
    const card = editorDraw.nativeCards[target.nodeId];
    if (!card?.ports.some(pin => pin.port === target.portId && pin.dir === target.dir)) return false;
    canvas.select({ kind: 'node', id: target.nodeId }); canvas.fitSelection(); return true;
}
function replaceNativeBridge() {
    nativeGroupPresenter = prepareGroupPresentation();
    nativeWireBridge?.cancel('view-change'); nativeWireBridge = null; nativeCatalog = null;
    const editor = graphViews?.readEditor(); if (!editor) { workbench?.update({nativeChoices:[],nativeSearch:null,nativePinMenu:null}); return; }
    if (editor.view.identity.kind === 'library') {
        nativeCatalog = workspacePrepared.catalogs.get(viewIdentityKey({ kind: 'root', workflowId: current.id }));
        workbench.update({ nativeChoices: nativeCatalog?.choices ?? [], nativeSearch: null, nativePinMenu: null });
        return;
    }
    nativeCatalog = workspacePrepared.catalogs.get(editor.view.key);
    if (!nativeCatalog) return;
    nativeWireBridge = createNativeWireBridge({catalog:nativeCatalog,adapter:{capture:()=>captureEditor(),captureNavigation:()=>captureEditor(true),isCurrent:editorCurrent,prepare:(capture,command)=>requestNodeCreation(capture,command),commit:(capture,prepared)=>{const result=commitNodeCreation(capture,{ok:true,data:prepared});if(result.ok&&prepared.addedBoundaryNodeId)focusBoundaryLabel(prepared.addedBoundaryNodeId);return result;},jump:jumpNativeNode},onUpdate:(view,requests)=>{canvas?.updateNativeWire?.(view,requests);workbench?.update({nativeSearch:view.search,nativePinMenu:view.menu});const actions=nativeWireBridge?.actions();workbench?.updateActions?.({nativeSearch:actions?.search ?? {},nativePinMenu:actions?.menu ?? {}});}});
    workbench.update({nativeChoices:nativeCatalog.choices});
}
const configuredNodeSession = createConfiguredNodeSession({
    isCurrent: editorCurrent,
    isOptionsCurrent: options => !options.documentScopeKey || nodeDocumentCaptures.get(options.documentScopeKey)?.isCurrent() === true,
    prepare: (capture, command, options) => { const prepared = options.shelf ? prepareShelfNodeCreation(capture, command, options.at) : prepareNativeCreation(capture, command); if (prepared.ok && options.documentScopeKey) nodeCreationScopes.set(prepared.data, nodeDocumentCaptures.get(options.documentScopeKey)); return prepared; },
});
const configureNodeActions = {
    apply: (key, text, phase) => configuredNodeSession.apply(key, text, phase),
    cancel: key => cancelConfiguredNode(key),
};
function cancelConfiguredNode(key = pendingConfiguredNode?.key) {
    if (!pendingConfiguredNode || pendingConfiguredNode.key !== key) return;
    configuredNodeSession.cancel(key); pendingConfiguredNode = null; workbench?.update({ configureNode: null });
}
function commitNodeCreation(capture, prepared) {
    const documentLease = prepared?.ok && nodeCreationScopes.get(prepared.data);
    if (documentLease && !documentLease.isCurrent()) return { ok: false, error: { code: 'STALE_DOCUMENT_SETUP', message: 'Workflow Data authorization changed before node creation. Reopen configuration.' } };
    return commitCaptured(capture, prepared);
}
function requestNodeCreation(capture, command, at = null, shelf = false) {
    if (command.kind !== 'create' || !nodeNeedsConfiguration(command.operation, command.controls)) {
        const { requiresConfiguration, ...plain } = command;
        if (command.kind === 'create') {
            if (!editorCurrent(capture)) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The graph view changed.' } };
            const editor = graphViews.readEditor(), origin = command.connection?.origin;
            const originCard = origin ? editorDraw?.nativeCards[origin.nodeId] : null;
            if (['read-file', 'story-clock', 'commit-outcomes'].includes(command.operation)) plain.phase = configuredCreationStage(command.operation, editor.prepared.savedGraph.mode, originCard?.phase ?? editorDraw?.nativeCards[selected?.id]?.phase, editor.view.identity.kind === 'instance').phase;
        }
        return shelf ? prepareShelfNodeCreation(capture, plain, at) : prepareNativeCreation(capture, plain);
    }
    if (!editorCurrent(capture)) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The graph view changed.' } };
    if (shelf && at) { command = { ...command, graphPoint: canvas.toGraph(at.x, at.y) }; shelf = false; at = null; }
    const editor = graphViews.readEditor(), origin = command.connection?.origin;
    const originCard = origin ? editorDraw?.nativeCards[origin.nodeId] : null;
    const originPort = originCard?.ports.find(port => port.port === origin.portId);
    const stage = configuredCreationStage(command.operation, editor.prepared.savedGraph.mode, originCard?.phase ?? editorDraw?.nativeCards[selected?.id]?.phase, editor.view.identity.kind === 'instance');
    let targets = [], documentScopeKey;
    if (['read-file', 'story-clock', 'commit-outcomes'].includes(command.operation)) {
        const captured = workflowRuntime.getStoryDocumentCatalog?.()?.capture();
        if (!captured?.ok) return { ok: false, error: { code: 'DOCUMENT_SETUP_UNAVAILABLE', message: 'Open an active chat and authorize a target in Workflow › Configure › Workflow Data before creating this node.' } };
        documentScopeKey = globalThis.crypto.randomUUID(); nodeDocumentCaptures.set(documentScopeKey, captured.data);
        targets = captured.data.documents.map(({ content, ...summary }) => summary);
    }
    const opened = configuredNodeSession.open(capture, command, { ...stage, targets, helpers: iterationHelperChoices(current), shelf, at, ...(documentScopeKey ? { documentScopeKey } : {}), ...(originPort ? { originKind: originPort.kind, originDirection: originPort.dir } : {}) });
    pendingConfiguredNode = opened.view; workbench?.update({ configureNode: opened.view });
    return opened.result.finally(() => { if (documentScopeKey) nodeDocumentCaptures.delete(documentScopeKey); if (pendingConfiguredNode?.key === opened.view.key) { pendingConfiguredNode = null; workbench?.update({ configureNode: null }); } });
}
function prepareNativeCreation(capture, command) {
    if (command.kind !== 'create-boundary') return prepareNativeConnectionEdit(current, { ...command, ...scopeCommand(capture) });
    if (!editorCurrent(capture)) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The graph view changed.' } };
    const editor = graphViews.readEditor(), direction = command.direction;
    if (editor.view.identity.kind !== 'instance' || editor.readOnly || command.connection || !['input', 'output'].includes(direction)) return { ok: false, error: { code: 'INVALID_PORT', message: 'Open an editable subgraph to add a port.' } };
    const base = direction === 'input' ? 'Input' : 'Output', labels = new Set(editor.prepared.interface.map(port => port.label));
    let label = base, index = 2; while (labels.has(label)) label = base + ' ' + index++;
    return prepareOwnedDefinitionMetadataEdit(current, { instancePath: [...editor.view.identity.instancePath], expectedRef: editor.prepared.definitionRef, kind: 'interface', edit: { kind: 'add', direction, label, artifactKind: command.artifactKind ?? 'text', required: false, graphPoint: command.graphPoint } });
}
function prepareShelfNodeCreation(capture, command, at = null) {
    // Commit refreshes the canvas, so settle pending camera motion before placement.
    canvas.cancelGesture();
    if (at) return prepareNativeCreation(capture, { ...command, graphPoint: canvas.toGraph(at.x, at.y) });
    const provisional = prepareNativeCreation(capture, { ...command, graphPoint: { x: 0, y: 0 } });
    if (!provisional.ok) return provisional;
    const path = scopeCommand(capture).viewPath;
    const id = provisional.data.addedBoundaryNodeId ?? provisional.data.addedNodeIds?.[0];
    const placement = prepareNodePlacementCard(checkedCandidateArtifacts(provisional.data.checkedCandidate), { nodeId: id, viewPath: path });
    if (!placement.ok) return placement;
    const size = measureNodeCard(canvas.nodeLayer, placement.data), rect = canvas.host.getBoundingClientRect();
    const origin = canvas.toGraph(rect.left + (rect.width - size.width) / 2, rect.top + (rect.height - size.height) / 2);
    // Reprepare private definitions so their content pins include the final coordinates.
    return prepareNativeCreation(capture, { ...command, graphPoint: origin });
}
async function chooseNativeNode(id, at = null) {
    if (!nativeCatalog) return;
    const choice = resolveNativeSearchChoice(nativeCatalog, id), captured = captureEditor(); if (!choice || !captured.ok) return;
    const prepared = await requestNodeCreation(captured.data, { kind: 'create', ...choice }, at, true);
    if (prepared?.error?.code === 'NODE_CONFIGURATION_CANCELLED') return;
    const result = commitNodeCreation(captured.data, prepared);
    if (result.ok && prepared.data.addedBoundaryNodeId) focusBoundaryLabel(prepared.data.addedBoundaryNodeId);
}
function deleteNativeSelection(selection, existingToken = null) {
    const captured=existingToken ? { ok: editorCurrent(existingToken), data: existingToken } : captureEditor(); if (!captured.ok) return Promise.resolve(false);
    const ids=selection?.kind === 'node' ? [selection.id] : ['nodes','multi'].includes(selection?.kind) ? selection.ids : selection?.kind === 'group' ? Object.values(editorDraw.nodes).filter(node=>node.inGroup===selection.id || editorDraw.groups?.[selection.id]?.members?.includes(node.id)).map(node=>node.id) : [...canvas.multi];
    if (!ids?.length && !(selection?.kind === 'group' && editorDraw.groups?.[selection.id])) return Promise.resolve(false);
    const groupIds = selection?.kind === 'group' ? [selection.id] : selection?.groupIds ?? [];
    if (!editorCurrent(captured.data)) return Promise.resolve(false);
    const remove = () => {
        if (!groupIds.length && ids.length && ids.every(id => isCommentFrame(editorDraw.nodes[id]))) {
            return commitCaptured(captured.data, prepareCommentEdit(current, { kind: 'delete-batch', nodeIds: ids, ...scopeCommand(captured.data) })).ok;
        }
        const prepared = prepareSubgraphNodeDeletion(current, { ...scopeCommand(captured.data), nodeIds: ids, groupIds });
        return commitCaptured(captured.data, prepared).ok;
    };
    return Promise.resolve(remove());
}
function managerScope(editor) { return editor.view.identity.kind === 'library' ? {kind:'library',definitionRef:editor.prepared.definitionRef} : {kind:'graph',workflowId:current.id,instancePath:[...(editor.view.identity.instancePath ?? [])],...(editor.prepared.definitionRef ? {definitionRef:editor.prepared.definitionRef} : {})}; }
function managerOwner(kind) { const capture=captureEditor(true);if(!capture.ok)return null;const editor=graphViews.readEditor();return {kind,token:capture.data,key:kind+':'+editor.view.key,revision:graphViews.readEditContext().sessionId+':'+workspaceRevision,scope:managerScope(editor),libraryRevision:String(libraryRevision)}; }
function currentManager(owner,capture) { return editorCurrent(owner.token) && capture.managerKey===owner.key && capture.revision===owner.revision && JSON.stringify(capture.scope)===JSON.stringify(owner.scope) && (capture.libraryRevision===undefined || capture.libraryRevision===owner.libraryRevision); }
const staleManager=()=>({ok:false,error:{code:'STALE_CONTEXT',message:'The manager scope changed. Reopen this manager.'}});
function prepareAtCurrent(producer, command) { return producer(current, command); }
function openPortalManager(conversion=null,selectedPortalId=null) {
 const owner=managerOwner('portals');if(!owner)return;const editor=graphViews.readEditor(),graph=editor.prepared.savedGraph,readOnly=editor.readOnly,overlay=editor.view.portalPresentation ?? {};
 const publishers=Object.values(graph.portals ?? {}).map(portal=>{const alias=overlay[portal.id],sameSource=JSON.stringify(alias?.source)===JSON.stringify(portal.source),sameRef=!editor.prepared.definitionRef||JSON.stringify(alias?.definitionRef)===JSON.stringify(editor.prepared.definitionRef);return {...portal,label:sameSource&&sameRef?alias.label:portal.label};});
 selectedPortalId ??= publishers[0]?.id ?? null;
 const endpoints=Object.entries(editor.prepared.drawBase.nativeCards).flatMap(([nodeId,card])=>card.ports.map(port=>({key:JSON.stringify([nodeId,port.port]),label:card.canonicalTitle+' · '+port.label,nodeId,portId:port.port,direction:port.dir==='in'?'input':'output',kind:port.kind,occupied:Object.values(graph.wires ?? {}).some(edge=>edge.to===nodeId&&edge.toPort===port.port)})));
 const selectedPublisher=publishers.find(portal=>portal.id===selectedPortalId);
 const view={managerKey:owner.key,revision:owner.revision,scope:owner.scope,scopeLabel:editor.view.breadcrumbs.map(crumb=>crumb.label).join(' / ')||'Graph 1',readOnly,canPresent:true,renameMode:editor.view.identity.kind==='root'?'authored':'presentation',capabilities:{create:!readOnly,rename:true,retarget:!readOnly,connect:!readOnly,restore:!readOnly,remove:!readOnly,convert:!readOnly},selectedPortalId,publishers,sources:endpoints.filter(port=>port.direction==='output'),receivers:endpoints.filter(port=>port.direction==='input'),consumers:Object.values(graph.wires ?? {}).filter(edge=>edge.route==='portal'&&edge.portalId===selectedPortalId).map(edge=>({edgeId:edge.id,label:edge.to+' · '+edge.toPort,to:{nodeId:edge.to,portId:edge.toPort}})),conversion,issue:null};
 const apply=(capture,command)=>{if(!currentManager(owner,capture))return staleManager();const token=captureEditor();if(!token.ok)return token;const result=commitCaptured(token.data,prepareAtCurrent(prepareQualifiedPortalEdit,{...scopeCommand(token.data),...command}));if(result.ok)openPortalManager(conversion,selectedPortalId);return result;};
 const actions={close:()=>workbench.update({portalManager:null}),selectPortal:(capture,id)=>{if(currentManager(owner,capture))openPortalManager(conversion,id);},create:(capture,label,source)=>apply(capture,{kind:'create',label,source}),retarget:(capture,portalId,source)=>apply(capture,{kind:'retarget',portalId,source}),connect:(capture,portalId,to,replace)=>apply(capture,{kind:'bind',portalId,to,replace}),restoreWire:(capture,edgeId)=>apply(capture,{kind:'restore',edgeId}),deletePublisher:(capture,portalId,consumers)=>apply(capture,{kind:'delete',portalId,consumers}),convertWire:(capture,edgeId)=>apply(capture,{kind:'convert-wire',edgeId,publisher:{kind:'create',label:conversion?.label || edgeId}}),convertOutput:(capture,endpoint)=>apply(capture,{kind:'create',label:conversion?.label || endpoint.portId,source:endpoint}),
 rename(capture,portalId,label,mode){if(!currentManager(owner,capture))return staleManager();const actual=graph.portals?.[portalId];if(!actual)return staleManager();if(mode==='presentation'){const portalPresentation={...editor.view.portalPresentation,[portalId]:{identity:editor.view.identity,...(editor.prepared.definitionRef?{definitionRef:editor.prepared.definitionRef}:{}),source:actual.source,label}};const result=graphViews.updateView({portalPresentation});if(result.ok){persistGraphViews();openPortalManager(conversion,portalId);}return result;}const token=captureEditor();if(!token.ok)return token;const result=commitCaptured(token.data,preparePortalRename(current,{portalId,label}));if(result.ok)openPortalManager(conversion,portalId);return result;},
 jumpSource:(capture,source)=>{if(currentManager(owner,capture)&&publishers.some(portal=>JSON.stringify(portal.source)===JSON.stringify(source)))canvas.select({kind:'node',id:source.nodeId});},jumpConsumer:(capture,edgeId)=>{if(currentManager(owner,capture)){const edge=graph.wires[edgeId];if(edge)canvas.select({kind:'node',id:edge.to});}}};
 workbench.updateActions({portalManager:actions});workbench.update({portalManager:view,subgraphSave:null});
}
function openSubgraphSave(nodeId) {
    const captured = captureEditor(true); if (!captured.ok) return captured;
    const editor = graphViews.readEditor(), wrapper = editor.prepared.savedGraph.nodes[nodeId];
    const definition = wrapper?.type === 'subgraph' && workspacePrepared.libraryDefinitions[definitionRefKey(wrapper.definition)];
    const shelf = L.getSubgraphShelfEntries();
    if (!definition || !shelf.ok) return { ok: false, error: { code: 'MISSING_DEFINITION', message: 'The subgraph cannot be saved.' } };
    const captureId = 'saved-' + crypto.randomUUID(), libraryView = editor.view.identity.kind === 'library';
    const source = libraryView ? { schema: 3, runtime: 2, mode: editor.prepared.savedGraph.mode, nodes: { [captureId]: { id: captureId, type: 'subgraph', definition: editor.prepared.definitionRef } }, wires: {}, definitions: workspacePrepared.libraryDefinitions } : current;
    const instancePath = libraryView ? [captureId, nodeId] : [...(editor.view.identity.instancePath ?? []), nodeId];
    const contents = materializeInstanceDefinition(source, { instancePath, id: captureId + '-definition' });
    if (!contents.ok) { toast(contents.error, 'error'); return contents; }
    const key = crypto.randomUUID(), entries = shelf.data.map(item => ({ id: item.id, name: item.name }));
    const view = { key, name: definition.name, targetId: entries.some(item => item.id === definition.id) ? definition.id : null, entries };
    pendingSubgraphSave = { key, token: captured.data, definition: contents.data.definition, snapshots: contents.data.definitions, entries: shelf.data.map(item => ({ id: item.id, ref: definitionRefKey(item) })), view };
    workbench.update({ subgraphSave: view, portalManager: null });
    return { ok: true };
}
function saveSubgraphToShelf(key, name, targetId) {
    const pending = pendingSubgraphSave;
    const reject = message => {
        if (pending && pending.key === key) workbench.update({ subgraphSave: { ...pending.view, error: message } });
        return { ok: false, error: { code: 'STALE_CONTEXT', message } };
    };
    if (!pending || pending.key !== key || !editorCurrent(pending.token)) return reject('The graph view changed. Close this dialog and save again.');
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) return reject('Enter a name of up to 80 characters.');
    const loaded = L.loadSubgraphLibrary(); if (!loaded.ok) return reject(loaded.error.message);
    const entries = L.getSubgraphShelfEntries();
    if (!entries.ok) return reject(entries.error.message);
    if (targetId !== null && (!pending.entries.some(item => item.id === targetId) || !entries.data.some(item => item.id === targetId && pending.entries.some(previous => previous.id === targetId && previous.ref === definitionRefKey(item))))) return reject('The saved subgraph changed. Close this dialog and save again.');
    const draft = structuredClone(pending.definition); delete draft.semanticHash;
    draft.id = targetId ?? 'shelf-' + crypto.randomUUID(); draft.name = name.trim();
    const result = L.saveSubgraphDefinition(draft, pending.snapshots, targetId);
    if (!result.ok) return reject(result.error.message);
    libraryRevision++; pendingSubgraphSave = null;
    workbench.update({ subgraphSave: null }); refreshWorkspaceDocument();
    toast(targetId === null ? 'Added to Subgraphs.' : 'Saved subgraph updated.', 'success');
    return result;
}
function shelfSubgraphAction(id, action) {
    if (!L.loadSubgraphLibrary().ok) return;
    const choice = nativeCatalog?.choices.find(item => item.id === id && item.definitionRef), entries = L.getSubgraphShelfEntries();
    if (!choice || !entries.ok || !entries.data.some(item => definitionRefKey(item) === definitionRefKey(choice.definitionRef))) return;
    if (action === 'open') return navigateGraphView('openLibrary', choice.definitionRef);
    if (action !== 'delete') return;
    const result = L.removeSubgraphShelfEntry(choice.definitionRef.id);
    if (!result.ok) { toast(result.error, 'error'); return result; }
    libraryRevision++; refreshWorkspaceDocument();
    return result;
}
function subgraphWrapperAction(nodeId, action) {
    const captured = captureEditor(action === 'open' || action === 'export'); if (!captured.ok) return captured;
    const editor = graphViews.readEditor(), wrapper = editor.prepared.savedGraph.nodes[nodeId];
    if (wrapper?.type !== 'subgraph') return;
    if (action === 'open') return navigateGraphView('openLibrary', wrapper.definition);
    const definition = workspacePrepared.libraryDefinitions[definitionRefKey(wrapper.definition)];
    if (action === 'export' && definition) {
        const text = JSON.stringify(exportSubgraph(definition, workspacePrepared.libraryDefinitions), null, 2);
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), anchor = document.createElement('a');
        anchor.href = url; anchor.download = definition.name + '.subgraph.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
        return { ok: true };
    }
    const instancePath = [...(editor.view.identity.instancePath ?? []), nodeId];
    if (action === 'unpack') return commitCaptured(captured.data, prepareUnpack(current, { instancePath }));
    if (action !== 'copy') return;
    const result = commitCaptured(captured.data, makeLocalCopy(current, { instancePath, id: 'local-' + crypto.randomUUID(), materializeOverrides: true }));
    if (result.ok) navigateGraphView('openInstance', instancePath);
    return result;
}

/** Inject file access for host adapters and browser fixtures, not document ownership. */
export function setWorkflowFileAccess(adapter = null) { workflowFiles = adapter; documentCommands = null; fileStorageIssue = ''; if (workbench) renderDocumentState(); }
function ensureDocumentCommands() {
    if (documentCommands) return documentCommands;
    workflowFiles ??= createWorkflowFileAccess({ onChange: () => { if (documentCommands) renderDocumentState(); }, onWarning: message => { fileStorageIssue = message; documentCommands?.storageIssue(message); } });
    documentCommands = createWorkflowDocumentController({
        session: documentSession, files: workflowFiles, create: () => blankGraph('Untitled workflow'),
        examples: id => installWorkflowExample(id), recovery: recoveredWorkflows, retainCompanions: retainRecoveryWorkflows,
        views() { canvas?.cancelGesture(); persistGraphViews(true); return activeWorkspaceViews(); },
        prompt: requestDocumentChoice,
        activate(graph, options) { canvas?.cancelGesture(); persistGraphViews(true); return activateWorkflow(graph, options); },
        changed: () => { if (documentCommands) renderDocumentState(); }, report: (message, type, issue) => toast(issue ?? message, type),
    });
    if (fileStorageIssue) documentCommands.storageIssue(fileStorageIssue);
    Promise.resolve(workflowFiles.ready).then(result => { if (result?.ok === false) documentCommands?.storageIssue(result.error.message); if (documentCommands) renderDocumentState(); }, () => documentCommands?.storageIssue('Recent workflow files could not be persisted in this browser.'));
    return documentCommands;
}

function rootSystemWritable() {
    return isOpen() && !!graphViews && activeEditRoot() === current && current?.schema === 3 && current.runtime === 2 && current.mode === 'native-unified' && graphViews.readEditor().view.identity.kind !== 'library' && !documentTransition && !workflowState.busy && !workflowRuntime.getNativeWorkflowController?.()?.activity?.()?.busy;
}
function openAddSystem() {
    if (!rootSystemWritable()) return { ok: false, error: { code: 'VIEW_INACTIVE', message: 'Main is unavailable for system editing.' } };
    const origin = captureEditor(true); if (!origin.ok) return origin;
    const context = captureGraphEditContext(current, () => ({ sessionId: graphViews?.readEditContext().sessionId ?? 'inactive', viewPath: [], readOnly: !rootSystemWritable() || !editorCurrent(origin.data) })); if (!context.ok) return context;
    const entries = L.getSubgraphShelfEntries(), library = L.loadSubgraphLibrary(); if (!entries.ok) return entries; if (!library.ok) return library;
    const projected = projectSystemAuthoring(current, entries.data.map(definition => ({ definition, snapshots: library.data.definitions }))); if (!projected.ok) return projected;
    const key = crypto.randomUUID(); pendingAddSystem = { key, origin: origin.data, context: context.data, libraryRevision, librarySignature: JSON.stringify(library.data), picker: projected.data, prepared: null };
    workbench.update({ addSystem: { ...projected.data, key } }); return { ok: true, data: { key } };
}
function previewAddSystem(key, draft) {
    const pending = pendingAddSystem;
    if (!pending || pending.key !== key || !editorCurrent(pending.origin) || pending.libraryRevision !== libraryRevision || !systemShelfCurrent(pending)) return { ok: false, error: { code: 'STALE_CONTEXT', message: 'The graph view or saved library changed. Reopen Add system.' } };
    pending.prepared = null;
    const choice = pending.picker.choices.find(item => item.key === draft.choiceKey); if (!choice) return { ok: false, error: { code: 'INVALID_DEFINITION', message: 'Choose the captured saved system revision.' } };
    const prepared = prepareAddSystem(current, { definition: choice.definition, snapshots: choice.snapshots, graphPoint: vacantSystemPoint(current), inputs: draft.inputs, outputs: draft.outputs, parameterOverrides: draft.parameterOverrides, ...(draft.guidance ? { guidance: draft.guidance } : {}) }); if (!prepared.ok) return prepared;
    const views = prepareSystemWorkspace(prepared.data.candidate); if (!views.ok) return views;
    const before = graphViews.serialize(); if (!before.ok) return before;
    const preflight = preflightSystemViews(prepared.data.candidate, views.data, before.data, prepared.data.instanceId); if (!preflight.ok) return preflight;
    pending.prepared = prepared;
    const describe = (nodeId, portId) => {
        if (nodeId === prepared.data.instanceId) return choice.name + ' · ' + (choice.definition.interface.find(port => port.id === portId)?.label ?? portId);
        const node = prepared.data.candidate.nodes[nodeId];
        if (node?.operation === 'compose' && (portId === 'out' || portId.startsWith('section.'))) return (node.alias || node.title || 'Compose Guidance') + ' · ' + (portId === 'out' ? 'Output' : portId.slice(8) + ' section');
        return pending.picker.pins.find(pin => pin.nodeId === nodeId && pin.portId === portId)?.label ?? node?.alias ?? node?.title ?? node?.operation ?? 'System';
    };
    const connections = prepared.data.addedEdgeIds.map(id => { const edge = prepared.data.candidate.wires[id]; return describe(edge.from, edge.fromPort) + ' → ' + describe(edge.to, edge.toPort) + (prepared.data.preview.some(change => change.kind === 'guidance' && change.nodeId === edge.to && edge.toPort === 'section.' + change.sectionName) ? ' → Generate Reply' : ''); });
    return { ok: true, data: { connections, changes: prepared.data.preview } };
}
function submitAddSystem(key) {
    const pending = pendingAddSystem;
    const reject = message => { workbench.update({ addSystem: pending ? { ...pending.picker, key: pending.key, error: message } : null }); return { ok: false, error: { code: 'STALE_CONTEXT', message } }; };
    if (!pending || pending.key !== key || !pending.prepared?.ok || !editorCurrent(pending.origin) || pending.libraryRevision !== libraryRevision || !systemShelfCurrent(pending)) return reject('The graph view or saved library changed. Reopen Add system.');
    const prepared = pending.prepared, views = prepareSystemWorkspace(prepared.data.candidate); if (!views.ok) return reject(views.error.message);
    persistGraphViews(true); const before = graphViews.serialize(); if (!before.ok) return reject(before.error.message);
    const preflight = preflightSystemViews(prepared.data.candidate, views.data, before.data, prepared.data.instanceId); if (!preflight.ok) return reject(preflight.error.message);
    const beforeState = commentDocumentState(current), receipt = H.capturePresentationStep(current);
    const result = commitGraphEdit(current, { ...prepared.data, context: pending.context }, graphDocumentHooks); if (!result.ok) return reject(result.error.message);
    const afterState = commentDocumentState(current), restored = restoreSystemViews(graphViews, preflight.data.after.views.filter(view => view.identity.kind === 'root' || view.identity.kind === 'instance' && view.identity.instancePath[0] === prepared.data.instanceId), preflight.data.after.activeKey);
    if (!restored.ok) return reject(restored.error.message);
    pendingAddSystem = null; workbench.update({ addSystem: null }); activateEditorDraw(); canvas.fit({ avoidShelf: true }); persistGraphViews(true);
    const handle = Object.freeze({}), effect = captureSystemPresentation(before.data, graphViews.serialize().data, prepared.data.instanceId);
    if (H.attachPresentationEffect(current, { receipt, effect: handle, beforeState, afterState })) systemPresentationEffects.set(handle, { root: current, effect });
    else toast('The system tab layout could not be attached to this Undo step.', 'error');
    return result;
}
function handleSystemHistory(graph, event) {
    const stored = event?.effect && systemPresentationEffects.get(event.effect); if (stored?.root !== graph || !['undo', 'redo'].includes(event.direction)) return;
    if (graphViews?.readRoot() === graph) refreshSystemPresentation(stored.effect, graphViews.serialize().data, event.direction);
    pendingSystemPresentation.set(graph, { snapshots: stored.effect[event.direction === 'undo' ? 'before' : 'after'].views, activeKey: stored.effect[event.direction === 'undo' ? 'before' : 'after'].activeKey });
}
function applyPendingSystemPresentation() {
    if (!graphViews) return; const graph = graphViews.readRoot(), pending = pendingSystemPresentation.get(graph); if (!pending) return;
    const restored = restoreSystemViews(graphViews, pending.snapshots, pending.activeKey); if (restored.ok) pendingSystemPresentation.delete(graph); else toast(restored.error.message, 'error');
}

function prepareSystemWorkspace(candidate) {
    const prepared = prepareWorkspaceViews(candidate, workspaceInputs()); if (!prepared.ok) return prepared;
    const library = L.loadSubgraphLibrary(); if (!library.ok) return library;
    const inspected = prepareLibraryViews(candidate.id, { ...library.data.definitions, ...(candidate.definitions ?? {}) }); if (!inspected.ok) return inspected;
    prepared.data.navigation.push(...inspected.data.navigation); prepared.data.preparedViews.push(...inspected.data.preparedViews);
    return prepared;
}
function systemShelfCurrent(pending) {
    const library = L.loadSubgraphLibrary(); return library.ok && JSON.stringify(library.data) === pending.librarySignature;
}
