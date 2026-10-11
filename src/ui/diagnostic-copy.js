import { stateCopy, knownTextCopy } from './diagnostic-states.js?v=0.27.0';
import { modelCopy, modelVariants } from './diagnostic-model.js?v=0.27.0';
import { resourceCopy } from './diagnostic-resources.js?v=0.27.0';
import { workflowCopy } from './diagnostic-workflow.js?v=0.27.0';

// Only catalog-owned copy reaches a diagnostic surface. Unknown source text is
// intentionally omitted, including in the technical disclosure.
export const unknownDiagnostic = Object.freeze({
    id: 'unknown', severity: 'error', title: 'Action could not be completed',
    message: 'Lattice could not complete this action. Check the workflow and its settings for more information.',
});

const unverified = { id: 'save-status-unverified', severity: 'warning', title: 'Saving is not confirmed', message: 'The stored result could not be verified. Confirm the stored data before making another write.' };
const variants = [
    ['RECALL_HOTKEY_CONFLICT', /^R is reserved for Run to here\. Choose a different key\.$/, { id: 'recall-shortcut-reserved', severity: 'error', title: 'Shortcut key is reserved', message: 'R is reserved for Run to here. Choose a different key in the Recall Shortcut’s Details.' }],
    ['INVALID_EFFECT_RESULT', /persistence|verified status/i, unverified],
    ['INVALID_FILE_BACKEND_RESULT', /CAS|acknowledge|durable/i, unverified],
    ['INVALID_MEMORY_BACKEND_RESULT', /CAS|acknowledge/i, unverified],
    ['INVALID_PORT', /editable subgraph|boundary whose port/i, { id: 'boundary-port', severity: 'error', title: 'Open an editable subgraph', message: 'Open an editable subgraph and select its Input or Output boundary to edit the port.' }],
    ['FILE_NOT_FOUND', /logical document|creation template/i, { id: 'logical-document-missing', severity: 'error', title: 'Workflow document is missing', message: 'Choose an existing document or configure an initial template in Workflow Data before reading this target.' }],
    ['MISSING_INPUT', /wrapper output.*no connected source/i, { id: 'subgraph-output-missing', severity: 'error', title: 'Subgraph output needs a source', message: 'Open the subgraph and connect a source to its Output boundary before previewing this output.' }],
    ['STALE_SOURCE', /memory/i, { id: 'memory-source-changed', severity: 'error', title: 'Memory evidence changed', message: 'The memory evidence changed after it was read. Inspect the current memory and its source before preparing another change.' }],
];
const extraCopy = {
    INVALID_CONTROL_JSON: {id:'control-json',severity:'error',title:'Check the JSON entry',message:'Enter valid JSON before saving. Finish the current entry or choose a supported input format.'},
    APPLY_UNVERIFIED: { id: 'apply-unverified', severity: 'warning', title: 'Reply application is not confirmed', message: 'Reply application could not be confirmed. Check the current reply and save status before making another write.' },
    ACCEPTED_SAVE_UNVERIFIED: { id: 'accepted-save-unverified', severity: 'warning', title: 'Saving is not confirmed', message: 'The accepted reply remains. The save outcome could not be confirmed. Check the stored data before making another write.' },
    PUBLICATION_UNKNOWN: unverified, EFFECT_WRITE_UNKNOWN: unverified,
    STALE_SOURCE: { id: 'review-source-changed', severity: 'error', title: 'Review is out of date', message: 'The chat, reply, swipe, or prompt changed after this candidate was prepared. This review cannot be applied. Prepare a new candidate from the current source; running model steps again makes another model request.' },
    MISSING_INPUT: { id: 'missing-input', severity: 'error', title: 'Input needs a connection', message: 'This step needs an input. Connect a compatible output to that input.', technical: 'A required input has no connected source.' },
};
const catalog = { ...stateCopy, ...modelCopy, ...resourceCopy, ...workflowCopy, ...extraCopy };
const nativeEnabled = { id: 'send-required', severity: 'info', title: 'Starts with a message', message: 'Send a message in SillyTavern to run this workflow.' };
const compactorCopy = new Map(modelVariants.filter(([, , copy]) => ['summary-truncated', 'summary-unverified', 'summary-empty', 'compression-request', 'compactor-settings'].includes(copy.id)).map(([code, , copy]) => [code, copy]));
const presentedText = new Map();
presentedText.set(nativeEnabled.message, nativeEnabled);
for (const copy of [...Object.values(catalog), ...modelVariants.map(rule => rule[2]), ...variants.map(rule => rule[2]), ...knownTextCopy.values()]) {
    // Exact catalog text can cross legacy string boundaries safely. No raw
    // exception or arbitrary interpolated content is accepted by this lookup.
    presentedText.set(copy.message, copy);
}

export function diagnosticCopy(source, context) {
    if (context.enabled && ['MANUAL_NATIVE_TRIGGER_REQUIRED', 'NATIVE_OWNER_MISSING', 'NATIVE_SEND_REQUIRED'].includes(source.code)) return nativeEnabled;
    for (const [code, pattern, copy] of variants) if (source.code === code && pattern.test(source.message)) return copy;
    for (const [code, pattern, copy] of modelVariants) if (source.code === code && pattern.test(source.message)) return copy;
    if (context.operation === 'smart-compactor' && compactorCopy.has(source.code)) return compactorCopy.get(source.code);
    if (source.code === 'MISSING_INPUT' && (context.nodeTitle || context.inputLabel)) return {
        id: 'missing-input', severity: 'error', title: 'Input needs a connection',
        message: `${context.nodeTitle || 'This step'} needs ${context.inputLabel || 'an input'}. Connect a compatible output to that input.`,
        technical: 'A required input has no connected source.',
    };
    const types = ['text', 'context', 'draft', 'patches', 'guidance', 'data', 'activation'];
    if (source.code === 'ARTIFACT_KIND' && types.includes(context.outputType) && types.includes(context.inputType)) return {
        id: 'wire-type', severity: 'error', title: 'Connection types do not match',
        message: `This output carries ${context.outputType}, but this input needs ${context.inputType}. Connect pins with compatible types.`,
        technical: 'The output and input types do not match.',
    };
    if (source.code.startsWith('PREVIEW_') && !catalog[source.code]) return { id: 'preview-state', severity: 'info', title: 'Preview status', message: 'Check the selected output’s current preview status.' };
    return catalog[source.code] ?? knownTextCopy.get(source.message) ?? presentedText.get(source.message) ?? unknownDiagnostic;
}
