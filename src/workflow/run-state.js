import { addressKey, nodeAddress, own, plain, parseRunPlan, safeBinding, safeError, safeIteration, safeUsage, boundedText, freeze, expandRecordAddress, dense } from './record-data.js?v=0.27.1';

/** @typedef {{runId:string,lastSeq:number,status:string,plan:object|null,nodes:object[],elapsedMs:number,at:number|null}} RunState */
/** Explicit initialization; invalid identity is a programmer boundary error. */
export function createRunState(runId) {
    if (typeof runId !== 'string' || !runId) return null;
    return freeze({ runId, lastSeq: 0, status: 'empty', plan: null, nodes: [], elapsedMs: 0, at: null });
}
const terminal = status => ['completed', 'skipped', 'unresolved', 'failed', 'cancelled', 'invalid', 'stale'].includes(status);
const untouched = node => ['waiting', 'queued', 'not-run', 'blocked'].includes(node.status);
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const active = node => node.status === 'running' || node.status === 'cancelling';

/** Close observed activity at the accepted settlement clock; provider fields remain as reported. */
function settleNode(node, status, elapsedMs) {
    const result = { ...node, status, subphase: null, settledAt: node.settledAt ?? elapsedMs, durationMs: node.durationMs ?? (node.startedAt === null ? null : elapsedMs - node.startedAt) };
    if (node.request?.status === 'running') result.request = { ...node.request, status: ['completed', 'failed'].includes(status) ? status : 'cancelled', durationMs: elapsedMs - node.request.startedAt };
    return result;
}

function failNodes(nodes, address, elapsedMs) {
    const failed = new Set(nodes.filter(node => node.included && (active(node) || node.status === 'failed')).map(node => addressKey(node.address)));
    if (address) failed.add(addressKey(address));
    const blocked = new Set(failed);
    let changed = true;
    while (changed) { changed = false; for (const node of nodes) if (node.included && !blocked.has(addressKey(node.address)) && node.dependencies.some(dependency => blocked.has(addressKey(dependency)))) { blocked.add(addressKey(node.address)); changed = true; } }
    return nodes.map(node => {
        if (['completed','skipped','unresolved'].includes(node.status) || !node.included) return node;
        if (failed.has(addressKey(node.address))) return node.status === 'failed' ? node : settleNode(node, 'failed', elapsedMs);
        if (node.status === 'blocked') return node;
        if (untouched(node)) return { ...node, status: blocked.has(addressKey(node.address)) ? 'blocked' : 'not-run', subphase: null };
        return node;
    });
}
/** Pure metadata reducer. Invalid, foreign, late and duplicate events preserve object identity. */
export function reduceRunState(previous, raw) {
    try {
        if (!previous || !plain(raw) || own(raw, 'runId') !== previous.runId) return previous;
        const seq = own(raw, 'seq'), at = own(raw, 'at'), elapsedMs = own(raw, 'elapsedMs'), type = own(raw, 'type');
        if (!Number.isSafeInteger(seq) || seq <= previous.lastSeq || !number(at) || !number(elapsedMs) || elapsedMs < previous.elapsedMs || terminal(previous.status)) return previous;
        if (previous.status === 'cancelling' && !(type === 'run-settled' && own(raw, 'status') === 'cancelled')) return previous;
        let next = { ...previous, lastSeq: seq, at, elapsedMs }, nodes = previous.nodes;
        if (type === 'plan') {
            if (previous.status !== 'empty' || seq !== 1) return previous;
            const plan = parseRunPlan(own(raw, 'plan')); if (!plan) return previous;
            next.plan = plan; next.status = 'waiting';
            nodes = plan.units.map(unit => ({ ...unit, status: unit.included ? 'waiting' : 'not-run', subphase: null, attempts: 0, request: null, startedAt: null, settledAt: null, durationMs: null }));
        } else if (type === 'run-cancelling') {
            if (previous.status === 'empty') return previous;
            next.status = 'cancelling';
            nodes = nodes.map(node => node.status === 'running' ? { ...node, status: 'cancelling', subphase: 'cancelling' } : node);
            const error = safeError(own(raw, 'reason')); if (error) next.error = error;
        } else if (type === 'run-settled') {
            const status = own(raw, 'status'); if (!['completed', 'unresolved', 'failed', 'cancelled', 'invalid', 'stale'].includes(status)) return previous;
            if (previous.status === 'empty' && !['invalid', 'cancelled', 'stale'].includes(status)) return previous;
            const rawAddress = own(raw, 'failedAddress'), failedAddress = rawAddress === undefined ? null : nodeAddress(rawAddress);
            if (rawAddress !== undefined && (!failedAddress || !nodes.some(node => node.included && addressKey(node.address) === addressKey(failedAddress)))) return previous;
            next.status = status;
            if (status === 'failed') nodes = failNodes(nodes, failedAddress, elapsedMs);
            else nodes = nodes.map(node => {
                if (!node.included || terminal(node.status) || node.status === 'blocked' || node.status === 'not-run') return node;
                return settleNode(node, status === 'completed' ? (active(node) ? 'completed' : 'not-run') : status, elapsedMs);
            });
            const error = safeError(own(raw, 'error')); if (error) next.error = error;
        } else {
            if (!previous.plan) return previous;
            const address = nodeAddress(own(raw, 'address')); if (!address) return previous;
            const index = nodes.findIndex(node => addressKey(node.address) === addressKey(address));
            if (index < 0 || !nodes[index].included || terminal(nodes[index].status) || ['blocked', 'not-run', 'cancelling'].includes(nodes[index].status)) return previous;
            let node = { ...nodes[index] };
            if (type === 'node-phase') {
                const phase = own(raw, 'phase'); if (!['binding', 'executing'].includes(phase) || node.status === 'running') return previous;
                // Preflight may resolve a fixed binding before its source runs;
                // only execution authorizes input consumption and needs settled dependencies.
                if (nodes.some(item => active(item)) || phase === 'executing' && node.dependencies.some(dependency => !nodes.some(item => addressKey(item.address) === addressKey(dependency) && ['completed','skipped','unresolved'].includes(item.status)))) return previous;
                node.subphase = phase;
                const binding = safeBinding(own(raw, 'binding')); if (binding) node.binding = binding;
                if (phase === 'executing') { nodes = nodes.map(item => item.included && item.status === 'waiting' ? { ...item, status: 'queued' } : item); node.status = 'running'; node.startedAt = elapsedMs; next.status = 'running'; }
            } else if (type === 'node-binding') {
                const binding = safeBinding(own(raw, 'binding'));
                if (node.status !== 'running' || node.request?.status === 'running' || !binding || !Object.keys(binding).length) return previous;
                node.binding = binding;
            } else if (type === 'request-start') {
                const attempt = own(raw, 'attempt'), maxTokens = own(raw, 'maxTokens'), inputTokens = own(raw, 'inputTokens');
                if (node.status !== 'running' || (node.request && node.request.status === 'running') || !Number.isSafeInteger(attempt) || attempt !== node.attempts + 1 || attempt > node.requestBound || !number(maxTokens) || (inputTokens !== undefined && inputTokens !== null && !number(inputTokens))) return previous;
                node.attempts = attempt; node.subphase = 'request'; node.request = { attempt, status: 'running', maxTokens, inputTokens: inputTokens ?? null, startedAt: elapsedMs };
                const capability=own(raw,'capability');if(['text-completion','typed-decision'].includes(capability))node.request.capability=capability;
                const iteration=safeIteration(own(raw,'iteration'));if(iteration)node.request.iteration=iteration;
            } else if (type === 'request-settled') {
                const attempt = own(raw, 'attempt'), status = own(raw, 'status'), durationMs = own(raw, 'durationMs');
                if (!node.request || node.request.status !== 'running' || attempt !== node.request.attempt || !['completed', 'failed', 'cancelled'].includes(status) || !number(durationMs)) return previous;
                node.request = { ...node.request, status, durationMs };
                const finish = own(raw, 'finish'); if (typeof finish === 'string' || finish === null) node.request.finish = boundedText(finish, 128) ?? null;
                const usage = safeUsage(own(raw, 'usage')); if (usage !== undefined) node.request.usage = usage;
                const error = safeError(own(raw, 'error')); if (error) node.request.error = error;
                node.subphase = 'executing';
            } else if (type === 'node-settled') {
                const status = own(raw, 'status'); if (!['completed', 'skipped', 'unresolved', 'failed', 'cancelled'].includes(status) || (node.status !== 'running' && !(status === 'failed' && node.subphase === 'binding') && !(['skipped','unresolved'].includes(status)&&untouched(node)&&node.dependencies.every(dependency=>nodes.some(item=>addressKey(item.address)===addressKey(dependency)&&['completed','skipped','unresolved'].includes(item.status)))))) return previous;
                node = settleNode(node, status, elapsedMs);
                const reason = safeError(own(raw,'reason')); if(reason) node.reason = reason;
                const error = safeError(own(raw, 'error')); if (error) node.error = error;
                if (status === 'failed') nodes = failNodes(nodes, address, elapsedMs);
            } else return previous;
            nodes = nodes.slice(); nodes[index] = node;
        }
        next.nodes = nodes;
        return freeze(next);
    } catch { return previous; }
}

const samePath = (a, b) => a.length === b.length && a.every((id, index) => id === b[index]);
const belowPath = (path, prefix) => prefix.length <= path.length && prefix.every((id, index) => id === path[index]);
function wrapperStatus(descendants) {
    if (!descendants.length) return 'not-run';
    for (const status of ['cancelling', 'running', 'failed', 'blocked', 'cancelled', 'invalid', 'stale']) if (descendants.some(node => node.status === status)) return status;
    if (descendants.some(node => node.status === 'unresolved')) return 'unresolved';
    if (descendants.every(node => ['completed','skipped'].includes(node.status))) return descendants.every(node=>node.status==='skipped')?'skipped':'completed';
    for (const status of ['queued', 'waiting']) if (descendants.some(node => node.status === status)) return status;
    return 'not-run';
}
/** View-only hierarchy; children preserve all details while the UI chooses its meter aggregation. */
export function projectRunRows(record, viewPath = []) {
    try {
        if (!record || !dense(viewPath, 8) || viewPath.some(id => typeof id !== 'string')) return freeze([]);
        const compact = own(record, 'identities') !== undefined;
        const plan = own(record, 'plan'); if (!plan) return freeze([]);
        const nodeData = own(record, compact ? 'units' : 'nodes'), hierarchyData = own(compact ? record : plan, 'hierarchy');
        if (!Array.isArray(nodeData) || !Array.isArray(hierarchyData)) return freeze([]);
        const nodes = Array.from(nodeData, node => ({ ...node, address: compact ? expandRecordAddress(record, node.address) : node.address })).filter(node => node.address);
        const hierarchy = Array.from(hierarchyData, entry => ({ ...entry, address: compact ? expandRecordAddress(record, entry.address) : entry.address })).filter(entry => entry.address);
        const workflowId = compact ? own(own(record, 'identities'), 'strings')[plan.workflowId] : plan.workflowId;
        function rowsAt(path) {
            const rows = [], seen = new Set();
            // Primitive plan order is authoritative; wrapper order is its first descendant's position.
            const candidates = [...nodes.map((node, rank) => ({ node, rank })), ...hierarchy.filter(entry => entry.kind === 'instance').map(entry => ({ node: entry, rank: nodes.findIndex(node => belowPath(node.address.instancePath, [...entry.address.instancePath, entry.address.nodeId])) }))];
            candidates.sort((a, b) => a.rank - b.rank);
            for (const { node } of candidates) {
                if (node.address.workflowId !== workflowId || !samePath(node.address.instancePath, path) || seen.has(addressKey(node.address))) continue;
                seen.add(addressKey(node.address));
                const kind = node.kind === 'instance' ? 'instance' : 'primitive';
                if (kind === 'primitive') rows.push({ ...node, kind, executableCount: node.included ? 1 : 0, completedCount: node.included && node.status === 'completed' ? 1 : 0, children: [] });
                else {
                    const childPath = [...path, node.address.nodeId], descendants = nodes.filter(item => item.address.workflowId === workflowId && belowPath(item.address.instancePath, childPath));
                    rows.push({ address: node.address, kind, status: wrapperStatus(descendants), executableCount: descendants.filter(item => item.included).length, completedCount: descendants.filter(item => item.included && item.status === 'completed').length, children: rowsAt(childPath) });
                }
            }
            return rows;
        }
        return freeze(rowsAt(Array.from(viewPath)));
    } catch { return freeze([]); }
}
