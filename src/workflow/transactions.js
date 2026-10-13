import { prepareGraphArtifacts, inspectGraphArtifacts, safeGraphArtifactData } from './graph-artifacts.js?v=0.27.2';
import { checkedCandidateSnapshot, consumeCheckedCandidate, checkedCandidateArtifacts } from './checked-candidate.js?v=0.27.2';
import { freeze } from './record-data.js?v=0.27.2';
import { commitGraphDocument, GRAPH_DOCUMENT_FIELDS, graphHistoryStamp } from '../history.js?v=0.27.2';
import { graphDocumentSignature, graphSemanticSignature } from './ports.js?v=0.27.2';
import { safeWorkflowData } from './contracts.js?v=0.27.2';
import { definitionChain, ownsDefinitionPath } from './composition-edit.js?v=0.27.2';

const contexts = new WeakMap();
const changes = new WeakMap();
const sameStamp = (a, b) => a.generation === b.generation && a.revision === b.revision;
const fail = (code, message) => ({ ok: false, error: { code, message } });
const validContext = value => safeWorkflowData(value) && value && typeof value.sessionId === 'string' && value.sessionId.length > 0 && typeof value.readOnly === 'boolean' && Array.isArray(value.viewPath) && value.viewPath.every(id => typeof id === 'string' && id.length > 0);
export const graphEditSignature = graphSemanticSignature;

/**
 * @typedef {{sessionId:string, viewPath:string[], readOnly:boolean}} GraphEditContext
 * @typedef {{candidate:import('./types').NativeGraph3, baseSignature:string, baseDocumentSignature:string, viewPath?:string[], context:object, checkedCandidate?:object}} ContextualPreparedEdit
 * @typedef {{changed:boolean, semanticChanged:boolean, rootId:string}} CommitSummary
 */

/**
 * Capture root/session/view identity before asynchronous preparation starts.
 * The synchronous adapter must report CURRENT active context and must not mutate it.
 * Session IDs must change when the controller/root activation is replaced or reopened.
 * Tokens are private WeakMap capabilities; serialization/cloning cannot transfer them.
 * @param {unknown} root
 * @param {() => GraphEditContext} readContext
 * @returns {import('./types').Result<object>}
 */
export function captureGraphEditContext(root, readContext) {
    try {
        const validation = prepareGraphArtifacts(root);
        if (!validation.ok) return validation;
        if (typeof root.id !== 'string' || !root.id) return fail('INVALID_CONTEXT', 'A stable root ID is required.');
        const current = readContext();
        if (!validContext(current)) return fail('INVALID_CONTEXT', 'Provide the active session ID, instance path and read-only state.');
        if (current.readOnly) return fail('READ_ONLY_VIEW', 'This graph view is read-only.');
        if (current.viewPath.length) {
            if (root.schema !== 3 || root.runtime !== 2 || !definitionChain(root, current.viewPath)) return fail('UNSUPPORTED_VIEW', 'The qualified graph view does not exist.');
            if (!ownsDefinitionPath(root, current.viewPath)) return fail('READ_ONLY_DEFINITION', 'Make a local copy before editing this definition.');
        }
        const token = Object.freeze({});
        contexts.set(token, { stamp: graphHistoryStamp(root), root, rootId: root.id, readContext, captured: structuredClone(current), baseSignature: graphEditSignature(root), baseDocumentSignature: graphDocumentSignature(root) });
        return { ok: true, data: token };
    } catch {
        return fail('CONTEXT_UNAVAILABLE', 'Could not capture the active graph context.');
    }
}

/**
 * Commit an explicit reviewed candidate without invoking host or model operations.
 * Pass the CURRENT root, not a captured stale pointer. All failures precede mutation.
 * The caller persists/reconciles views and invalidates semantic run state on success.
 * @param {unknown} root
 * @param {ContextualPreparedEdit} prepared
 * @returns {import('./types').Result<CommitSummary>}
 */
export function commitPreparedGraph(root, prepared) {
    try {
        if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared) || ![Object.prototype, null].includes(Object.getPrototypeOf(prepared)) || Object.values(Object.getOwnPropertyDescriptors(prepared)).some(property => !('value' in property))) return fail('INVALID_PREPARATION', 'Expected a plain prepared graph edit.');
        if (!safeGraphArtifactData(root)) return fail('MALFORMED_WORKFLOW', 'The destination must remain a bounded plain graph.');
        const context = contexts.get(prepared?.context);
        if (!context || context.root !== root || context.rootId !== root.id) return fail('STALE_ROOT', 'The destination graph was replaced. Prepare the edit again.');
        let current;
        try { current = context.readContext(); } catch { return fail('CONTEXT_UNAVAILABLE', 'Could not read the active graph context.'); }
        if (!validContext(current)) return fail('INVALID_CONTEXT', 'The active graph context is unavailable or malformed.');
        if (context.captured.readOnly || current.readOnly) return fail('READ_ONLY_VIEW', 'This graph view is read-only.');
        if (current.sessionId !== context.captured.sessionId || JSON.stringify(current.viewPath) !== JSON.stringify(context.captured.viewPath)) return fail('STALE_CONTEXT', 'The active graph session or view changed. Prepare the edit again.');
        if (context.captured.viewPath.length && !ownsDefinitionPath(root, current.viewPath)) return fail('READ_ONLY_DEFINITION', 'The qualified graph view is no longer owned.');
        if (context.captured.viewPath.length && prepared.viewPath === undefined) return fail('STALE_CONTEXT', 'A child edit must explicitly identify its captured graph view.');
        if (prepared.viewPath !== undefined && (!safeWorkflowData(prepared.viewPath) || JSON.stringify(prepared.viewPath) !== JSON.stringify(context.captured.viewPath))) return fail('STALE_CONTEXT', 'The prepared edit targets a different graph view.');
        if (!sameStamp(context.stamp, graphHistoryStamp(root))) return fail('STALE_DOCUMENT', 'The document history changed. Prepare the edit again.');
        if (prepared.baseSignature !== context.baseSignature || prepared.baseDocumentSignature !== context.baseDocumentSignature || context.baseSignature !== graphEditSignature(root) || context.baseDocumentSignature !== graphDocumentSignature(root)) return fail('STALE_DOCUMENT', 'The graph changed after import began. Prepare the edit again.');
        const owned = prepared.checkedCandidate === undefined ? null : checkedCandidateSnapshot(root, prepared);
        if (prepared.checkedCandidate !== undefined && !owned) return fail('INVALID_PREPARATION', 'The checked candidate was changed, cloned or consumed.');
        const admitted = owned ? { ok: true, data: checkedCandidateArtifacts(prepared.checkedCandidate) } : prepareGraphArtifacts(prepared.candidate);
        if (!admitted.ok) return admitted;
        const candidate = owned ?? inspectGraphArtifacts(admitted.data).snapshot;
        if (root.mode !== candidate.mode) return fail('MODE_MISMATCH', 'Import requires the same phase. Open this workflow separately.');
        const protectedFields = graph => Object.fromEntries(Object.entries(graph).filter(([key]) => !GRAPH_DOCUMENT_FIELDS.includes(key) && !['view', 'selection'].includes(key)));
        if (graphDocumentSignature(protectedFields(root)) !== graphDocumentSignature(protectedFields(candidate))) return fail('UNSUPPORTED_EDIT', 'A prepared edit cannot replace root identity, runtime authority, or other noneditable metadata.');
        const semanticChanged = graphEditSignature(root) !== graphEditSignature(candidate);
        const rootId = root.id;
        const impact = classifyChange(root, candidate, context.captured.viewPath);
        const snapshot = candidate;
        const committedSignature = graphDocumentSignature(snapshot);
        const committedStamp = Object.freeze({ generation: context.stamp.generation, revision: context.stamp.revision + 1 });
        const changed = commitGraphDocument(root, snapshot);
        if (prepared.checkedCandidate !== undefined) consumeCheckedCandidate(prepared.checkedCandidate);
        if (changed) contexts.delete(prepared.context);
        const summary = Object.freeze({ changed, semanticChanged: changed && semanticChanged, rootId });
        // History observers are synchronous and may mutate or commit again. Only
        // the exact atomic transition may authorize a retained display artifact.
        if (changed && sameStamp(committedStamp, graphHistoryStamp(root)) && safeWorkflowData(root) && graphDocumentSignature(root) === committedSignature)
            changes.set(summary, { root, stamp: committedStamp, signature: committedSignature, record: freeze({ ...impact, candidate: snapshot, artifacts: admitted.data }) });
        return { ok: true, data: summary };
    } catch {
        return fail('COMMIT_FAILED', 'Could not commit the prepared graph edit.');
    }
}

/** Positive coordinate classification compares the complete admitted document transition. */
function classifyChange(before, after, path) {
    const unknown = { kind: 'unknown', nodeIds: [], groupIds: [] };
    if (path.length) return unknown;
    const nodeIds = [], groupIds = [];
    const strip = (graph, collect) => {
        const document = Object.fromEntries(GRAPH_DOCUMENT_FIELDS.filter(key => Object.hasOwn(graph, key)).map(key => [key, graph[key]]));
        for (const [field, ids] of [['nodes', nodeIds], ['groups', groupIds]]) {
            if (!document[field]) continue;
            document[field] = Object.fromEntries(Object.entries(document[field]).map(([id, item]) => {
                const { x, y, ...rest } = item;
                if (field === 'groups' && rest.frame) { const { x, y, ...frame } = rest.frame; rest.frame = frame; }
                if (collect) {
                    const old = before[field]?.[id];
                    if (old && (old.x !== item.x || old.y !== item.y || field === 'groups' && (old.frame?.x !== item.frame?.x || old.frame?.y !== item.frame?.y))) ids.push(id);
                }
                return [id, rest];
            }));
        }
        return graphDocumentSignature(document);
    };
    return strip(before, false) === strip(after, true) && (nodeIds.length || groupIds.length) ? { kind: 'coordinates', nodeIds, groupIds } : unknown;
}
/** Verify the exact producer summary, destination, history generation and current raw content. */
export function committedGraphChange(root, summary) {
    const change = changes.get(summary);
    if (!change || change.root !== root || !sameStamp(change.stamp, graphHistoryStamp(root)) || !safeGraphArtifactData(root) || graphDocumentSignature(root) !== change.signature) return null;
    return change.record;
}
