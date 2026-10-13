import { prepareCheckedCandidate } from './checked-candidate.js?v=0.27.2';
import { graphSemanticSignature, graphDocumentSignature } from './ports.js?v=0.27.2';

/** Pure dual-precondition boundary shared by composition and immutable definition revisions. */
export function prepareGraphCandidate(original, candidate, addedEdgeIds = [], removedEdgeIds = [], sourceRoot = original) {
    const validation = prepareCheckedCandidate(original, candidate, sourceRoot);
    if (!validation.ok) return validation;
    const baseDocumentSignature = graphDocumentSignature(original);
    // Cloning supplies optional current containers; their absence is not an edit.
    const document = graph => ({ ...graph, ...Object.fromEntries(['groups', 'roles', 'portals', 'definitions'].map(key => [key, graph[key] ?? {}])) });
    const changed = graphDocumentSignature(document(candidate)) !== graphDocumentSignature(document(original));
    const checkedCandidate = changed ? validation.data : prepareCheckedCandidate(original, original, sourceRoot).data;
    return { ok: true, data: { checkedCandidate, candidate: structuredClone(changed ? candidate : original), changed, addedEdgeIds, removedEdgeIds, baseDocumentSignature, baseSignature: graphSemanticSignature(original) } };
}
