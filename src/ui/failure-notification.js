import { presentDiagnostic, diagnosticSchemaFindings } from './diagnostics.js?v=0.29.0';
import { own, dense, addressKey, expandRecordAddress } from '../workflow/record-data.js?v=0.29.0';

const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value) ? value : '';
const label = value => {
    if (typeof value !== 'string' || /(?:api[_ -]?key|authorization|bearer\s|password|secret\s*[=:]|sk-[\w-]+)/i.test(value)) return '';
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    return clean.length > 160 ? clean.slice(0, 159) + '…' : clean;
};
const findingLocation = finding => finding.keyword === 'additionalProperties'
    ? `${finding.path.slice(0, finding.path.lastIndexOf('/')) || '(root)'} (unexpected field)`
    : finding.path || '(root)';

const tableIndex = value => Number.isSafeInteger(value) && value >= 0;
function recordedAddress(record, index) {
    if (!tableIndex(index)) return null;
    const identities = own(record, 'identities');
    const tuple = own(own(identities, 'addresses'), String(index));
    if (!dense(tuple, 3) || tuple.length !== 3 || !tuple.every(tableIndex)) return null;
    let pathIndex = tuple[1], depth = 0;
    while (pathIndex !== 0 && depth++ < 8) {
        const path = own(own(identities, 'paths'), String(pathIndex));
        if (!dense(path, 2) || path.length !== 2 || !path.every(tableIndex)) return null;
        pathIndex = path[0];
    }
    return pathIndex === 0 ? expandRecordAddress(record, index) : null;
}

// Recordings capture the executed labels and dispatched attempts, even if the editor changes later.
function failedNode(result, issue, nodeId) {
    try {
        const record = own(result, 'recording'), units = own(record, 'units'), runId = own(result, 'runId');
        if (typeof runId !== 'string' || !runId || !dense(units) || own(record, 'runId') !== runId) return null;
        const matches = [];
        for (let index = 0; index < units.length; index++) {
            const unit = own(units, String(index));
            if (own(unit, 'included') !== true) continue;
            const address = recordedAddress(record, own(unit, 'address'));
            if (address && (issue.address ? addressKey(address) === addressKey(issue.address) : address.nodeId === nodeId)) matches.push(unit);
        }
        return matches.length === 1 ? matches[0] : null;
    } catch { return null; }
}

/** Toast copy uses only captured node metadata, catalog copy and sanitized validator findings. */
export function presentFailureNotification(result, origin) {
    const recovered=own(result,'recovered')===true, failures=own(result,'failures');
    const failed=recovered && dense(failures,32)?failures:[];
    const error = own(result, 'error') ?? (recovered?own(failed,'0'):undefined), issue = presentDiagnostic(error, { action: 'run the workflow' });
    const code = issue.technical?.code || 'WORKFLOW_FAILED';
    const nodeId = identifier(issue.address?.nodeId ?? own(error, 'nodeId'));
    const node = failedNode(result, issue, nodeId), title = label(own(node, 'label'));
    const path = issue.address?.instancePath.map(identifier);
    const nodePath = nodeId && path?.every(Boolean) ? [...path, nodeId].join('/') : nodeId;
    const location = title ? ` at “${title}”${nodePath ? ` [${nodePath}]` : ''}` : nodePath ? ` at ${nodePath}` : '';
    const attempts = own(node, 'attempts'), requestBound = own(node, 'requestBound');
    const count = Number.isSafeInteger(attempts) && attempts > 0 ? ` after ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}`
        : attempts === 0 && Number.isSafeInteger(requestBound) && requestBound > 0 ? ' before any model request for this node' : '';
    const findings = diagnosticSchemaFindings(error);
    const detail = findings.length
        ? findings.slice(0, 2).map(finding => `${findingLocation(finding)}: ${finding.message}`).join(' ')
            + (findings.length > 2 ? ' Additional schema issues are shown in Details.' : '')
        : issue.message;
    const maxTokens = own(own(node, 'request'), 'maxTokens');
    const tokenLimit = code === 'TRUNCATED_OUTPUT' && Number.isSafeInteger(maxTokens) && maxTokens > 0 ? ` Output tokens: ${maxTokens}.` : '';
    const automatic = own(origin, 'kind') === 'send' && own(origin, 'phase') === 'unified';
    const disposition=own(result,'failureDisposition');
    const outcome=recovered?'':disposition==='stopped'?' Generation stopped.':disposition==='stop-unavailable'?' SillyTavern stopping could not be confirmed.':disposition==='reply-preserved'?' The completed SillyTavern reply was kept.':disposition==='native-fallback'?' Continuing with normal SillyTavern generation.':automatic?' SillyTavern may continue with its normal reply.':'';
    const heading=recovered?`Workflow continued with available results; ${failed.length} ${failed.length===1?'node':'nodes'} failed`:'Workflow stopped';
    return { severity: recovered?'warning':issue.severity,
        message: `${heading}${location}${count} (${code}). ${detail}${tokenLimit}${outcome} Open Lattice for details.` };
}
