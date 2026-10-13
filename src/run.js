/** Current Lattice host facade. SillyTavern owns native reply generation. */
import { ctx, safe, settings, activeWorkflow, onWorkflowActivated, documentSession} from './state.js?v=0.27.2';
import { validateWorkflow } from './workflow/contracts.js?v=0.27.2';
import { createNativeWorkflowController } from './workflow/host.js?v=0.27.2';
import { bindingStatus } from './workflow/connections.js?v=0.27.2';
import { createChatDocumentCatalog } from './workflow/document-catalog.js?v=0.27.2';
import { createRecallShortcutRegistry } from './ui/recall-shortcuts.js?v=0.27.2';
import { createNativePersistenceVerifier } from './workflow/native-persistence.js?v=0.27.2';
import { diagnosticText, presentDiagnostic } from './ui/diagnostics.js?v=0.27.2';
export { runWorkflow, workflowSignature } from './workflow/runtime.js?v=0.27.2';
export { createNativeWorkflowController, snapshotContext, snapshotReply } from './workflow/host.js?v=0.27.2';

let controller, helpers, userHelpers, nativeUserReader, initialization, documentCatalog, persistenceVerifier, recallShortcuts, recallEvents;
const currentUser = () => userHelpers?.getCurrentUserHandle?.();
// The immutable native export reads the current handle without invoking graph or
// request hooks. Private transport uses this separate passive authority last.
const transportUserId = () => nativeUserReader?.();
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
        getDocumentToken: () => documentSession.capture(),
        registerRecallHotkey: request => { recallShortcuts ??= createRecallShortcutRegistry(globalThis.document,{changed:()=>safe(()=>globalThis.document.dispatchEvent(new CustomEvent('pc-recall-state')))}); return recallShortcuts.register(request); },
        context: ctx, userId: currentUser, transportUserId, documentCatalog: getStoryDocumentCatalog(), persistenceVerifier: getNativePersistenceVerifier(),
        isEnabled: () => settings().enabled === true,
        getGraph: () => { const graph = activeWorkflow(); return safe(() => Object.getOwnPropertyDescriptor(graph ?? {}, 'mode')?.value) === 'native-unified' ? graph : null; },
        isBusy: () => !helpers || helpers.isGenerating(),
        syncMesToSwipe: (...args) => helpers?.syncMesToSwipe(...args), syncSwipeToMes: (...args) => helpers?.syncSwipeToMes(...args),
        bindingStatus,
        countTokens: async text => { const count = ctx().getTokenCountAsync; if (typeof count === 'function') { const tokens = await count(text); if (Number.isFinite(tokens) && tokens >= 0) return { tokens, method: 'host-tokenizer' }; } return { tokens: Math.ceil(text.length / 4), method: 'character-estimate' }; },
        onResult: (result, origin) => { if (!result.ok) { const issue = presentDiagnostic(result.error, { action: 'run the workflow' }); safe(() => globalThis.toastr?.[issue.severity]?.(issue.message, 'Lattice workflow')); } if (origin) safe(() => globalThis.document?.dispatchEvent(new CustomEvent('pc-native-result'))); },
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
    return initialization.then(result=>{current.syncRecall();return result;});
}
