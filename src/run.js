/** Current Lattice host facade. SillyTavern owns native reply generation. */
import { ctx, safe, settings, save, activeWorkflow, onWorkflowActivated, documentSession, getWorkflowFailurePolicy, activateWorkflow, createWorkflowChatSelection, onGraphTouched} from './state.js?v=0.30.0';
import {createApplicationFileExperience} from './ui/application-file-experience.js?v=0.30.0';
import { validateWorkflow } from './workflow/contracts.js?v=0.30.0';
import { createNativeWorkflowController } from './workflow/host.js?v=0.30.0';
import { bindingStatus } from './workflow/connections.js?v=0.30.0';
import { createChatDocumentCatalog } from './workflow/document-catalog.js?v=0.30.0';
import { createRecallShortcutRegistry } from './ui/recall-shortcuts.js?v=0.30.0';
import { createNativePersistenceVerifier } from './workflow/native-persistence.js?v=0.30.0';
import { diagnosticText } from './ui/diagnostics.js?v=0.30.0';
import { presentFailureNotification } from './ui/failure-notification.js?v=0.30.0';
import { createDiagnosticHistory } from './workflow/diagnostic-history.js?v=0.30.0';
import {configureNodeFileAccess,refreshNodeFileAccess} from './ui/node-file-access.js?v=0.30.0';
export { runWorkflow, workflowSignature } from './workflow/runtime.js?v=0.30.0';
export { createNativeWorkflowController, snapshotContext, snapshotReply } from './workflow/host.js?v=0.30.0';

let controller, helpers, userHelpers, nativeUserReader, initialization, documentCatalog, persistenceVerifier, recallShortcuts, recallEvents, diagnosticHistory;
const workflowRunListeners = new Set();
/** Passive runtime observers; progress never owns workflow execution. */
export function subscribeWorkflowRunEvents(listener) {
    if (typeof listener !== 'function') return () => {};
    workflowRunListeners.add(listener);
    return () => workflowRunListeners.delete(listener);
}
const currentUser = () => userHelpers?.getCurrentUserHandle?.();
let applicationFiles=null,applicationPorts={},storageMode=()=> 'inside';
const existingInstallation=!!safe(()=>ctx().extensionSettings?.lattice);
const applicationContext=()=>safe(()=>JSON.stringify([currentUser(),ctx().getCurrentChatId?.()??ctx().chatId,ctx().characterId,ctx().groupId]),'');
const applicationBusy=()=>{const activity=controller?.activity?.();return !!activity?.busy||controller?.hasPendingReview?.()===true||!!applicationPorts.isBusy?.();};
const applicationBusyView=()=>!!controller?.activity?.()?.busy||controller?.hasRetainedReview?.()===true;
configureNodeFileAccess({getContext:ctx,getUserId:currentUser,getStorageMode:()=>storageMode()});
export function workflowApplicationBusy(){return applicationBusy();}
function refreshAfterNativeReview(){queueMicrotask(()=>{if(applicationFiles&&!applicationBusy())void applicationFiles.controller.refresh();});}
export function configureWorkflowApplication(ports){applicationPorts={...applicationPorts,...ports};}
export function getApplicationFileExperience(){
    if(applicationFiles||!currentUser())return applicationFiles;
    const selection=createWorkflowChatSelection({getContext:ctx,saveAndVerify:()=>getNativePersistenceVerifier().saveAndVerify({kind:'workflow-selection'})});
    applicationFiles=createApplicationFileExperience({session:documentSession,getUserId:currentUser,getNativeContext:ctx,getContext:applicationContext,
        getHost:()=>{const userId=currentUser();return userId?{hostId:globalThis.location?.origin??'SillyTavern',userId,local:['localhost','127.0.0.1','[::1]'].includes(globalThis.location?.hostname)}:null;},
        showWelcome:!existingInstallation,isBusy:applicationBusy,isBusyView:applicationBusyView,activate:activateWorkflow,
        replace:(...args)=>applicationPorts.replace?.(...args)??{ok:false,cancelled:true},prompt:(...args)=>applicationPorts.prompt?.(...args),
        getSelection:()=>selection.get(),persistSelection:value=>selection.persist(value),
        configureStorageMode:callback=>{storageMode=callback;},
        downloadCopy:(...args)=>applicationPorts.downloadCopy?.(...args)??{ok:false,error:{code:'WORKFLOW_DOWNLOAD_UNAVAILABLE',message:'Open the workspace to download a copy.'}},
        downloadSetup:()=>{const anchor=document.createElement('a');anchor.href=new URL('../assets/lattice-file-setup.zip',import.meta.url).href;anchor.download='lattice-file-setup.zip';anchor.click();},
        changed:()=>safe(()=>globalThis.document?.dispatchEvent(new CustomEvent('pc-file-experience')))});
    applicationFiles.setup.subscribe(()=>{void refreshNodeFileAccess();safe(()=>globalThis.document?.dispatchEvent(new CustomEvent('pc-file-experience')));});
    onGraphTouched(graph=>{if(graph===documentSession.current())applicationFiles.controller.changed();});
    documentSession.subscribe(event=>{if(event.type==='views'||event.type==='activate'&&event.graph===documentSession.current()&&!event.source&&documentSession.dirty())applicationFiles.controller.changed();});
    return applicationFiles;
}
// The immutable native export reads the current handle without invoking graph or
// request hooks. Private transport uses this separate passive authority last.
const transportUserId = () => nativeUserReader?.();
/** Operator diagnostics stay in browser storage, outside settings and story data. */
export function getWorkflowDiagnosticHistory() { return diagnosticHistory ??= createDiagnosticHistory(); }
export function workflowDiagnosticLoggingEnabled() { return settings().diagnosticLogging === true; }
export function setWorkflowDiagnosticLogging(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Diagnostic logging requires a boolean preference.');
    settings().diagnosticLogging = enabled;
    if (!enabled) diagnosticHistory?.discardActive();
    const saved = save({ recovery: false });
    if (!saved.ok) throw new Error(saved.error?.message || 'The diagnostic logging preference could not be saved.');
    safe(() => globalThis.document?.dispatchEvent(new CustomEvent('pc-diagnostic-history')));
}
export function getWorkflowDiagnosticScope() {
    return safe(() => {
        const c = ctx(), userId = currentUser(), chatId = c.getCurrentChatId?.() ?? c.chatId;
        if (typeof userId !== 'string' || !userId.trim() || userId.length > 128 || !(typeof chatId === 'string' && chatId.length || typeof chatId === 'number' && Number.isFinite(chatId))) return null;
        return { userId, chatId, characterId: c.characterId ?? null, groupId: c.groupId ?? null };
    }, null);
}
/** UI authorization and accepted writes share one live user/chat catalog lease. */
export function getStoryDocumentCatalog() {
    return documentCatalog ??= createChatDocumentCatalog({getContext:ctx,getUserId:currentUser,
        saveMetadata:async()=>{const saved=await getNativePersistenceVerifier().saveAndVerify({kind:'document-catalog'});return saved.ok&&saved.data.acknowledged===true;}});
}
export function getNativePersistenceVerifier() {
    return persistenceVerifier ??= createNativePersistenceVerifier({getContext:ctx,getUserId:currentUser,fetch:(...args)=>globalThis.fetch(...args)});
}
export const storyDocumentState = () => getStoryDocumentCatalog().snapshot();
export function callCount(graph) { const checked = validateWorkflow(graph); return checked.ok ? checked.data.callBound : 0; }
/** Send follows the one open document; Enable Lattice remains a separate host preference. */
export function sendWorkflowState() {
    const current = activeWorkflow(), mode = safe(() => Object.getOwnPropertyDescriptor(current ?? {}, 'mode')?.value);
    const checked = current && mode === 'native-unified' ? validateWorkflow(current) : null;
    const graph = checked?.ok ? current : null;
    return { automatic: !!graph,
        enableLabel: 'Enable Lattice',
        enabledText: graph ? '"' + graph.name + '" runs one unified workflow across preparation, SillyTavern generation and reply review (maximum ' + checked.data.callBound + ' auxiliary requests). SillyTavern builds its normal prompt.' : 'The open workflow cannot run. ' + (checked?.error ? diagnosticText(checked.error, { action: 'run the open workflow' }) : 'Open a valid unified workflow.') + ' SillyTavern builds its normal prompt.',
        offText: 'Lattice is off. Enable it to run the open unified workflow on Send.',
    };
}
export function getNativeWorkflowController() {
    if (controller) return controller;
    controller = createNativeWorkflowController({
        createDiagnosticCapture: origin => getWorkflowDiagnosticHistory().begin(origin, {mode:workflowDiagnosticLoggingEnabled() ? 'full':'metadata'}),
        onEvent: event => {
            for (const listener of workflowRunListeners) {
                try { Promise.resolve(listener(event)).catch(() => {}); } catch { /* An observer cannot interrupt the run. */ }
            }
        },
        getDocumentToken: () => documentSession.capture(),
        getWorkflowIdentity:()=>getApplicationFileExperience()?.controller.getWorkflowIdentity()??documentSession.draftNamespace(),
        getExampleFileOrigin:graph=>getApplicationFileExperience()?.origins.get(graph),
        beforeRun:async()=>{if(initialization)await initialization;return getApplicationFileExperience()?.controller.beforeRun()??{ok:true};},
        onChatChanged:()=>{void getApplicationFileExperience()?.controller.restoreSelection();},
        registerRecallHotkey: request => { recallShortcuts ??= createRecallShortcutRegistry(globalThis.document,{changed:()=>safe(()=>globalThis.document.dispatchEvent(new CustomEvent('pc-recall-state')))}); return recallShortcuts.register(request); },
        context: ctx, userId: currentUser, transportUserId, documentCatalog: getStoryDocumentCatalog(), persistenceVerifier: getNativePersistenceVerifier(),
        isEnabled: () => settings().enabled === true,
        onReviewChanged:refreshAfterNativeReview,
        getFailurePolicy: getWorkflowFailurePolicy,
        stopGeneration: () => {const stop=helpers?.stopGeneration??ctx().stopGeneration;return typeof stop==='function'?stop():false;},
        getGraph: () => { const graph = activeWorkflow(); return safe(() => Object.getOwnPropertyDescriptor(graph ?? {}, 'mode')?.value) === 'native-unified' ? graph : null; },
        isBusy: () => !helpers || helpers.isGenerating(),
        syncMesToSwipe: (...args) => helpers?.syncMesToSwipe(...args), syncSwipeToMes: (...args) => helpers?.syncSwipeToMes(...args),
        bindingStatus,
        countTokens: async text => { const count = ctx().getTokenCountAsync; if (typeof count === 'function') { const tokens = await count(text); if (Number.isFinite(tokens) && tokens >= 0) return { tokens, method: 'host-tokenizer' }; } return { tokens: Math.ceil(text.length / 4), method: 'character-estimate' }; },
        onResult: (result, origin) => {
            refreshAfterNativeReview();
            if ((!result.ok || result.recovered === true) && !result.skipped && !result.superseded) {
                const issue = presentFailureNotification(result, origin);
                const severity = ['info', 'warning'].includes(issue.severity) ? issue.severity : 'error';
                safe(() => globalThis.toastr?.[severity]?.(issue.message, 'Lattice workflow', { timeOut: 0, extendedTimeOut: 0, closeButton: true, tapToDismiss: false, escapeHtml: true }));
            }
            if (origin) safe(() => globalThis.document?.dispatchEvent(new CustomEvent('pc-native-result')));
        },
    });
    onWorkflowActivated(() => { controller.cancel('Workflow document replaced'); controller.resetRecallDocument(documentSession.capture()); });
    controller.subscribeRecall(() => safe(() => globalThis.document?.dispatchEvent(new CustomEvent('pc-recall-state'))));
    return controller;
}
/** Public host helpers are imported independently so missing user support cannot disable reviewed workflows. */
export function initializeNativeWorkflowController() {
    const current = getNativeWorkflowController(); current.subscribe();
    if(!recallEvents&&globalThis.document?.addEventListener){recallEvents=true;globalThis.document.addEventListener('pc-state',()=>current.syncRecall());}
    current.syncRecall();
    initialization ??= Promise.allSettled([
        import('/script.js').then(module => { if (['isGenerating', 'syncMesToSwipe', 'syncSwipeToMes'].every(key => typeof module[key] === 'function')) helpers = module; }),
        import('/scripts/user.js').then(module => { if (typeof module.getCurrentUserHandle === 'function') { userHelpers = module; nativeUserReader = module.getCurrentUserHandle; } }),
    ]);
    return initialization.then(result=>{current.syncRecall();const initial=!applicationFiles,app=getApplicationFileExperience();void app?.setup.check();if(initial)void app?.controller.restoreSelection();void refreshNodeFileAccess();safe(()=>globalThis.document?.dispatchEvent(new CustomEvent('pc-file-experience')));safe(()=>globalThis.document?.dispatchEvent(new CustomEvent('pc-diagnostic-history')));return result;});
}
