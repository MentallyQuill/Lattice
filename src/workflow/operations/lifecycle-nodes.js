import { cloneJsonValue } from './json-data.js?v=0.27.2';
import { own, plain } from '../record-data.js?v=0.27.2';
import { createDraftRevision, snapshotDraft, toFinalCandidate } from '../draft-revisions.js?v=0.27.2';
const fail = (code, message) => ({ ok: false, error: { code, message } });
const port = (id, kind, direction, required = false) => ({ id, label: id === 'draft' ? 'Draft' : id === 'metadata' ? 'Generation metadata' : id === 'activation' ? 'Send activation' : 'Guidance', kind, direction, required, cardinality: 'one' });
const descriptor = (id, title, phase, input, output, extra = {}) => ({ id, title, family: id==='review-publish'?'Output':'Input', phase, input, output, minimumSchema: 3, controls: [], defaults: {}, controlDescriptors: {}, modelRole: null, requestBound: 0, terminal: false, dynamicPorts: true, rootOnly: true, modes: ['native-unified'], ...extra });
const INJECTION_ROLES = ['system', 'user', 'assistant'];
const INJECTION_POSITIONS = ['before-prompt', 'in-prompt', 'in-chat'];
export const LIFECYCLE_OPERATIONS = {
    'player-event-source': descriptor('player-event-source', 'Player Event Source', 'pre', null, 'data', { hostOperation: true }),
    'on-send': descriptor('on-send', 'On Send', 'pre', null, 'data', { hostOperation: true }),
    'generate-reply': descriptor('generate-reply', 'Generate Reply · SillyTavern', 'pre', 'data', 'draft', {
        hostOperation: true, nativeBoundary: true,
        controls: ['budgetTokens', 'injectionRole', 'injectionPosition', 'injectionDepth'],
        defaults: { budgetTokens: 768, injectionRole: 'system', injectionPosition: 'in-chat', injectionDepth: 0 },
        controlDescriptors: {
            budgetTokens: { type: 'integer', min: 1, max: 8192, default: 768, label: 'Guidance token budget' },
            injectionRole: { type: 'enum', values: INJECTION_ROLES, default: 'system', label: 'Injection role', valueLabels: { system: 'System', user: 'User', assistant: 'Assistant' }, help: 'Message role for the combined guidance supplied to SillyTavern.' },
            injectionPosition: { type: 'enum', values: INJECTION_POSITIONS, default: 'in-chat', label: 'Injection position', valueLabels: { 'before-prompt': 'Before main prompt', 'in-prompt': 'After main prompt', 'in-chat': 'In chat' }, help: 'Where the combined guidance enters the native prompt.' },
            injectionDepth: { type: 'integer', min: 0, max: 10000, default: 0, label: 'Injection depth', visibleWhen: { key: 'injectionPosition', value: 'in-chat' }, help: 'Chat messages from the end: 0 is nearest the newest message; higher values place guidance farther back.' },
        },
    }),
    'review-publish': descriptor('review-publish', 'Review / Publish', 'post', 'draft', null, { terminal: true }),
};
export function describeLifecycleNode(node, options = {}) {
    if (!plain(node) || !plain(options)) return fail('INVALID_SETTINGS', 'Lifecycle nodes require own plain controls.');
    const checked=cloneJsonValue(node);
    if(!checked.ok || Reflect.ownKeys(options).some(key=>typeof key!=='string' || !Object.hasOwn(Object.getOwnPropertyDescriptor(options,key),'value')))return fail('INVALID_SETTINGS','Lifecycle controls require own data properties.');
    node=checked.data.value;
    const operation = own(node, 'operation'), version = own(node, 'operationVersion'), declared = own(node, 'phase');
    if (typeof operation!=='string' || !Object.hasOwn(LIFECYCLE_OPERATIONS, operation)) return fail('UNKNOWN_OPERATION', 'Unknown lifecycle operation.');
    const value = LIFECYCLE_OPERATIONS[operation];
    const phase = own(options, 'phase') ?? declared ?? value.phase;
    if (phase !== value.phase || declared !== undefined && declared !== phase) return fail('INVALID_PHASE', 'Lifecycle operation conflicts with its generation stage.');
    if (version !== undefined && version !== 1) return fail('INVALID_SETTINGS', 'Lifecycle operation version must be 1.');
    if (operation === 'generate-reply' && (!Number.isSafeInteger(own(node, 'budgetTokens') ?? 768) || (own(node, 'budgetTokens') ?? 768) < 1 || (own(node, 'budgetTokens') ?? 768) > 8192)) return fail('INVALID_SETTINGS', 'Use a guidance budget from 1 to 8,192 tokens.');
    if (operation === 'generate-reply') {
        const role = own(node, 'injectionRole'), position = own(node, 'injectionPosition'), depth = own(node, 'injectionDepth');
        if (role !== undefined && !INJECTION_ROLES.includes(role)) return fail('INVALID_SETTINGS', 'Injection role must be System, User or Assistant.');
        if (position !== undefined && !INJECTION_POSITIONS.includes(position)) return fail('INVALID_SETTINGS', 'Choose a supported injection position.');
        if (depth !== undefined && (!Number.isSafeInteger(depth) || depth < 0 || depth > 10000)) return fail('INVALID_SETTINGS', 'Use an injection depth from 0 to 10,000 messages.');
    }
    const ports = operation === 'player-event-source' ? [port('out', 'data', 'output')] : operation === 'on-send' ? [port('activation', 'data', 'output')] : operation === 'generate-reply' ? [port('activation', 'data', 'input', true), port('guidance', 'guidance', 'input'), port('draft', 'draft', 'output'), port('metadata', 'data', 'output')] : [port('draft', 'draft', 'input', true)];
    return { ok: true, data: { descriptor: structuredClone(value), ports } };
}
/** Host generation uses a private callback; this pure adapter only produces review candidates. */
export async function executeLifecycleNode(node, inputs, execution = {}) {
    const described = describeLifecycleNode(node, execution);
    if (!described.ok) return described;
    const signal=own(execution,'signal');
    if(signal!==undefined && !(signal instanceof AbortSignal))return fail('INVALID_PORTS','Use a trusted AbortSignal.');
    if (signal?.aborted) return fail('ABORTED', 'Workflow was stopped.');
    if (own(node, 'operation') !== 'review-publish') return fail('HOST_OPERATION_REQUIRED', 'Native generation requires its owned host continuation.');
    if (own(execution, 'root') !== true || own(execution, 'rootMode') !== 'native-unified') return fail('HOST_OPERATION_REQUIRED', 'Review / Publish requires the unified root.');
    if (!plain(inputs) || Object.keys(inputs).some(key => key !== 'draft')) return fail('INVALID_INPUT', 'Review requires only the declared Draft input.');
    const checked = snapshotDraft(own(inputs, 'draft'));
    if (!checked.ok) return checked;
    const revision = checked.data.revised ? { ok: true, data: { draft: checked.data.draft } } : createDraftRevision(checked.data.draft, checked.data.draft.text, { nodeId: own(node, 'id') ?? 'review-publish', scope: 'whole' });
    if (!revision.ok) return revision;
    const final = toFinalCandidate(revision.data.draft);
    return final.ok ? { ok: true, artifact: final.data.candidate, reports: [{ code: 'REVIEW_REQUIRED', originalPreserved: true }] } : final;
}
