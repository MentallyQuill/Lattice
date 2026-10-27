import { presentDiagnostic, presentDiagnostics } from './diagnostics.js?v=0.29.0';
import { addressKey, nodeAddress } from '../workflow/record-data.js?v=0.29.0';

/** Display-only state: no host reads, model calls, or recovery authority. */
export function previewDiagnostics({ workflow, state, target, selectedKey, sections, library, enabled, title }) {
    if (library) return { diagnostics: presentDiagnostics(['Library inspection is read-only and has no runtime output.']), emptyMessage: '', statusDetail: '', runReason: '' };
    const context = { enabled, nodeTitle: title };
    const priorRun = state.busy && state.availability === 'superseded';
    const diagnostics = [];
    const address = nodeAddress(target?.kind === 'terminal' ? target.address : target);
    const visit = rows => {
        for (const row of rows ?? []) {
            if (address && addressKey(row.address) === addressKey(address)) return row;
            const child = visit(row.children); if (child) return child;
        }
    };
    const row = address && !(priorRun && !state.runState) ? visit(workflow.rows) : null;
    const cause = state.currentDiagnostics?.nodes.find(node => address && addressKey(node.address) === addressKey(address));
    if (cause) diagnostics.push(presentDiagnostic(cause.error, context));
    const preparationAddress = nodeAddress(state.preparationError?.address);
    if (state.preparationError && (!preparationAddress || address && addressKey(preparationAddress) === addressKey(address)) && !cause && state.preparationError.code !== 'MANUAL_NATIVE_TRIGGER_REQUIRED') diagnostics.push(presentDiagnostic(state.preparationError, context));
    if (!['stale', 'superseded', 'cancelled'].includes(state.availability) && workflow.result?.applyIssue) diagnostics.push(workflow.result.applyDiagnostic ?? presentDiagnostic(workflow.result.applyIssue, context));
    const selectedStatus = priorRun ? row?.status : workflow.result?.previewStatus || row?.status;
    for (let index = 0; index < diagnostics.length; index++) if (diagnostics[index].technical?.code === 'MANUAL_NATIVE_TRIGGER_REQUIRED') diagnostics[index] = presentDiagnostic({ code: 'MANUAL_NATIVE_TRIGGER_REQUIRED', message: 'This step starts when you send a message.', ...(address ? { address } : {}) }, context);
    const unique = diagnostics.filter((item, index) => diagnostics.findIndex(other => other.id === item.id) === index);
    let emptyMessage = '';
    if (!sections.length && !unique.length) {
        const code = target && !selectedKey ? 'OUTPUT_REMOVED'
            : selectedStatus === 'blocked' ? 'UPSTREAM_FAILED'
            : selectedStatus === 'skipped' ? 'PREVIEW_SKIPPED'
            : ['waiting', 'queued'].includes(selectedStatus) ? 'PREVIEW_WAITING'
            : selectedStatus === 'cancelled' ? 'ABORTED'
            : selectedStatus === 'unresolved' ? 'PREVIEW_UNRESOLVED'
            : selectedStatus === 'not-run' ? 'PREVIEW_NOT_RUN'
            : selectedStatus === 'running' ? 'PREVIEW_RUNNING'
            : state.busy ? 'PREVIEW_WORKFLOW_RUNNING'
            : !workflow.result ? 'PREVIEW_NOT_RUN' : 'OUTPUT_NOT_RETAINED';
        emptyMessage = presentDiagnostic({ code, message: code }, context).message;
    }
    const earlier = state.availability === 'superseded' || state.availability === 'stale';
    const historyNotice = earlier && (sections.length || !state.busy && workflow.result) ? 'This preview describes an earlier run. It may not match the current workflow or reply.' : '';
    const statusDetail = state.preparationError || workflow.result?.error || unique.some(item => item.message === state.status) ? '' : workflow.result?.outcomeNotice ? state.status?.includes('Completed with failures') ? state.status : workflow.result.outcomeNotice : state.status || '';
    const runReason = state.busy ? 'Wait for the current run to finish.'
        : workflow.targetSummary?.requiresNativeGeneration ? presentDiagnostic({ code: 'MANUAL_NATIVE_TRIGGER_REQUIRED', message: 'This step starts when you send a message.' }, context).message
        : workflow.targetSummary?.attemptable === false ? (workflow.targetSummary?.diagnostics ?? []).map(item => item.message).join(' ') : '';
    return { diagnostics: unique, emptyMessage, statusDetail, historyNotice, runReason };
}
