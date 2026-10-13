import { graphHistoryStamp } from '../history.js?v=0.27.1';
import { prepareGraphArtifacts, inspectGraphArtifacts, graphArtifactsFor } from './graph-artifacts.js?v=0.27.1';
import { graphDocumentSignature } from './ports.js?v=0.27.1';

const candidates = new WeakMap();
/** Admit and own data before issuing a capability. Ordinary DTO identities grant no authority. */
export function prepareCheckedCandidate(original, candidate, sourceRoot = original) {
    const base = prepareGraphArtifacts(original); if (!base.ok) return base;
    const checked = prepareGraphArtifacts(candidate); if (!checked.ok) return checked;
    const snapshot = inspectGraphArtifacts(checked.data).snapshot, token = Object.freeze({});
    candidates.set(token, { stamp: graphHistoryStamp(sourceRoot), root: sourceRoot, snapshot, artifacts: checked.data, baseSignature: graphDocumentSignature(original) });
    return { ok: true, data: token };
}
/** Every mutable public candidate still crosses getter-free admission and a complete fingerprint. */
export function checkedCandidateSnapshot(root, prepared) {
    const owned = candidates.get(prepared.checkedCandidate);
    const stamp = graphHistoryStamp(root);
    if (!owned || owned.stamp.generation !== stamp.generation || owned.stamp.revision !== stamp.revision || owned.root !== root || owned.baseSignature !== prepared.baseDocumentSignature || !graphArtifactsFor(prepared.candidate, owned.artifacts).ok) return null;
    return owned.snapshot;
}
export function consumeCheckedCandidate(token) { candidates.delete(token); }

export function checkedCandidateArtifacts(token) { return candidates.get(token)?.artifacts; }
