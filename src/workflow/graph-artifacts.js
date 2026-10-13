import { inspectExpandedGraph, safeWorkflowData } from './graph-validation.js?v=0.27.2';
import { graphDocumentSignature } from './ports.js?v=0.27.2';
import { freeze } from './record-data.js?v=0.27.2';

const artifacts = new WeakMap(), latest = new WeakMap();
// Fingerprints and structuredClone must see every admitted authored property.
function enumerableData(value) {
    if (!value || typeof value !== 'object') return true;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).some(key => typeof key !== 'string')) return false;
    return Object.entries(descriptors).every(([key, descriptor]) => Array.isArray(value) && key === 'length' || descriptor.enumerable && 'value' in descriptor && enumerableData(descriptor.value));
}
export const safeGraphArtifactData = value => safeWorkflowData(value) && enumerableData(value);
const invalid = () => ({ok:false,error:{code:'INVALID_GRAPH_ARTIFACTS',message:'Use checked artifacts for this exact document content.'}});
/** Raw roots always cross getter-free bounds and a full fingerprint before reuse. */
export function prepareGraphArtifacts(root) {
    if (!safeGraphArtifactData(root) || !root || typeof root !== 'object' || Array.isArray(root)) return {ok:false,error:{code:'MALFORMED_WORKFLOW',message:'Expected a bounded plain workflow graph.'}};
    const signature = graphDocumentSignature(root), previous = latest.get(root);
    if (previous?.signature === signature) return {ok:true,data:previous.token};
    const checked = inspectExpandedGraph(root); if (!checked.ok) return checked;
    const token = Object.freeze({}), snapshot = freeze(structuredClone(root));
    artifacts.set(token, Object.freeze({signature, snapshot, checked: freeze(checked)}));
    latest.set(root, {signature, token});
    return {ok:true,data:token};
}
/** A private brand, never DTO identity, proves ownership of the immutable expansion. */
export function inspectGraphArtifacts(token) { return artifacts.get(token) ?? null; }
export function graphArtifactsFor(root, token) {
    const owned = artifacts.get(token);
    if (!owned || !safeGraphArtifactData(root) || graphDocumentSignature(root) !== owned.signature) return invalid();
    latest.set(root, {signature:owned.signature, token});
    return {ok:true,data:owned};
}
