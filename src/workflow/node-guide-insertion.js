import { safeWorkflowData, validateWorkflow } from './contracts.js?v=0.27.1';
import { cloneWorkflowDocument } from './document.js?v=0.27.1';
import { semanticControlsForNode, operationFor } from './catalog.js?v=0.27.1';
import { exportWorkflow, parseWorkflow } from './packages.js?v=0.27.1';
import { prepareClipPaste } from './clipboard.js?v=0.27.1';
import { prepareGraphCandidate } from './prepared-graph-edit.js?v=0.27.1';
import { graphHistoryStamp } from '../history.js?v=0.27.1';
import { safeGraphArtifactData } from './graph-artifacts.js?v=0.27.1';
import { graphDocumentSignature } from './ports.js?v=0.27.1';

const LIFECYCLE = ['on-send', 'generate-reply', 'review-publish'];
const fail = (code, message) => ({ ok: false, error: { code, message } });
const sameWire = (a, b) => a.route === b.route && a.to === b.to && a.toPort === b.toPort && (a.route === 'portal' ? a.portalId === b.portalId : a.from === b.from && a.fromPort === b.fromPort);
const byOperation = (graph, operation) => Object.values(graph.nodes).filter(node => node.type === 'workflow' && node.operation === operation);
function compatible(a, b) {
    return a.enabled !== false && b.enabled !== false && (a.operationVersion ?? 1) === (b.operationVersion ?? 1)
        && (a.phase ?? operationFor(a)?.phase) === (b.phase ?? operationFor(b)?.phase)
        && JSON.stringify(semanticControlsForNode(a)) === JSON.stringify(semanticControlsForNode(b))
        && JSON.stringify(a.modifiers ?? []) === JSON.stringify(b.modifiers ?? []);
}
function canonicalDraftEdge(graph, edge, generate, review) {
    return graph.template?.id === 'unified-basic' && graph.template?.version === 1 && /^draft(?:-|$)/.test(edge.id)
        && Object.keys(edge).every(key => ['id', 'route', 'from', 'fromPort', 'to', 'toPort'].includes(key))
        && edge.route === 'wire' && edge.from === generate && edge.fromPort === 'draft' && edge.to === review && edge.toPort === 'draft';
}

/** Prepare one current-tab mutation. Admission, identity allocation and connection checks are pure;
 * the caller owns captured context, committing, undo, selection and reveal. */
export function prepareNodeGuideInsertion(destination, example, options = {}) {
    try {
        if (!options || typeof options !== 'object' || Array.isArray(options) || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) return fail('INVALID_OPTIONS', 'Use plain example insertion options.');
        const descriptors = Object.getOwnPropertyDescriptors(options);
        if (Object.values(descriptors).some(property => !property.enumerable || !Object.hasOwn(property, 'value'))) return fail('INVALID_OPTIONS', 'Example insertion options require plain data.');
        if (options.readOnly) return fail('READ_ONLY_VIEW', 'This tab is read-only. Open an editable workflow tab to add the example.');
        const viewPath = options.viewPath ?? [];
        if (!safeWorkflowData(viewPath) || !Array.isArray(viewPath) || viewPath.some(id => typeof id !== 'string' || !id)) return fail('INVALID_VIEW', 'Choose a current workflow view.');
        if (viewPath.length) return fail('ROOT_ONLY_EXAMPLE', 'This complete example includes native lifecycle nodes. Return to the top-level workflow view to add it.');
        const target = cloneWorkflowDocument(destination); if (!target.ok) return target;
        if (target.data.mode !== 'native-unified') return fail('MODE_MISMATCH', 'Open an editable unified workflow root to add this complete example.');
        if (!safeWorkflowData(example) || !example?.graph) return fail('INVALID_EXAMPLE', 'This guide has no admitted complete example.');
        const source = parseWorkflow(JSON.stringify(exportWorkflow(example.graph))); if (!source.ok) return source;
        const sourceValidation = validateWorkflow(source.data); if (!sourceValidation.ok) return sourceValidation;
        const reused = {}, reuseIds = {}, destinationLifecycle = LIFECYCLE.flatMap(operation => byOperation(target.data, operation));
        if (destinationLifecycle.length) {
            for (const operation of LIFECYCLE) {
                const incoming = byOperation(source.data, operation), existing = byOperation(target.data, operation);
                if (incoming.length !== 1 || existing.length !== 1) return fail('LIFECYCLE_CONFLICT', 'This tab needs exactly one compatible On Send, Generate Reply and Review / Publish path. Use an empty tab or finish its native lifecycle first.');
                if (!compatible(incoming[0], existing[0])) return fail('LIFECYCLE_SETTINGS', `${existing[0].title ?? operation} has different lifecycle settings or is disabled. Use an empty compatible tab to preserve your current settings.`);
                reused[incoming[0].id] = existing[0].id; reuseIds[operation] = existing[0].id;
            }
        }
        const baseStamp = graphHistoryStamp(destination);
        const pasted = prepareClipPaste(destination, exportWorkflow(source.data), { ...(options.at ? { at: options.at } : {}), ...(options.allocateId ? { allocateId: options.allocateId } : {}) });
        if (!pasted.ok) return pasted;
        // Allocators are caller code: preserve the original paste precondition, including history ABA.
        const currentStamp = graphHistoryStamp(destination);
        if (baseStamp.generation !== currentStamp.generation || baseStamp.revision !== currentStamp.revision
            || !safeGraphArtifactData(destination) || graphDocumentSignature(destination) !== pasted.data.baseDocumentSignature)
            return fail('STALE_DOCUMENT', 'The workflow changed while preparing the example. Prepare the insertion again.');
        const { candidate, added, identityMap } = pasted.data;
        const removedEdgeIds = [];
        const remap = Object.fromEntries(Object.entries(reused).map(([sourceId, existingId]) => [identityMap.nodes[sourceId], existingId]));
        for (const [importedId, existingId] of Object.entries(remap)) {
            delete candidate.nodes[importedId]; added.nodes = added.nodes.filter(id => id !== importedId);
            const sourceId = Object.keys(reused).find(id => identityMap.nodes[id] === importedId); identityMap.nodes[sourceId] = existingId;
        }
        for (const portalId of added.portals) {
            const portal = candidate.portals[portalId]; portal.source.nodeId = remap[portal.source.nodeId] ?? portal.source.nodeId;
        }
        for (const groupId of added.groups) if (candidate.groups[groupId].members) candidate.groups[groupId].members = candidate.groups[groupId].members.map(id => remap[id] ?? id);
        for (const wireId of [...added.wires]) {
            const edge = candidate.wires[wireId];
            if (edge.route === 'wire') edge.from = remap[edge.from] ?? edge.from;
            edge.to = remap[edge.to] ?? edge.to;
            const existing = Object.values(target.data.wires).filter(wire => wire.to === edge.to && wire.toPort === edge.toPort);
            if (!existing.length) continue;
            if (existing.length === 1 && sameWire(existing[0], edge)) { delete candidate.wires[wireId]; added.wires = added.wires.filter(id => id !== wireId); continue; }
            if (existing.length === 1 && edge.to === reuseIds['review-publish'] && edge.toPort === 'draft' && canonicalDraftEdge(target.data, existing[0], reuseIds['generate-reply'], reuseIds['review-publish'])) {
                delete candidate.wires[existing[0].id]; removedEdgeIds.push(existing[0].id); continue;
            }
            return fail('OCCUPIED_INPUT', `The ${edge.toPort} input on ${candidate.nodes[edge.to]?.title ?? 'an existing node'} is occupied by a custom connection. Use an empty tab or disconnect that input explicitly before adding this example.`);
        }
        // A custom response path remains connected even when its input is not touched
        // by a preparation-only example. The imported native generation is removed.
        const valid = validateWorkflow(candidate); if (!valid.ok) return fail(valid.error.code, `This example cannot join the current workflow: ${valid.error.message}`);
        const prepared = prepareGraphCandidate(destination, candidate, added.wires, removedEdgeIds); if (!prepared.ok) return prepared;
        const diagnostics = { ...pasted.data.diagnostics, callBound: valid.data.callBound,
            terminals: pasted.data.diagnostics.terminals.map(item => ({ ...item, nodeId: remap[item.nodeId] ?? item.nodeId, ...(item.address ? { address: { ...item.address, nodeId: remap[item.address.nodeId] ?? item.address.nodeId } } : {}) })) };
        return { ok: true, data: { ...pasted.data, ...prepared.data, diagnostics, added, identityMap, reusedNodeIds: Object.values(reused), selectedNodeIds: [...added.nodes],
            message: removedEdgeIds.length ? 'Adds the example and replaces the unchanged starter Draft connection with its response path in one undoable edit.' : Object.keys(reused).length ? 'Adds the example using this tab’s compatible native lifecycle nodes.' : 'Adds the complete example to this tab.' } };
    } catch { return fail('GUIDE_INSERTION_FAILED', 'This example cannot be added safely to the current tab. Use an editable compatible workflow root.'); }
}
