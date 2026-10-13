import { safeWorkflowData, validateGraphStructure } from './contracts.js?v=0.27.3';
import { cloneDefinitionData, computeDefinitionIdentity, definitionRefKey, inspectPinnedDefinitionIdentity } from './definitions.js?v=0.27.3';
import { compositionIds, ownershipEntries, safeId } from './composition-edit.js?v=0.27.3';

const fail = (code, message) => ({ ok: false, error: { code, message } });

/** Shared import-only snapshot policy. refs=[] performs the pre-allocation merge check.
 * The caller supplies its internal namespace allocator, returning Result<string>.
 * This prepares plain data only; it never grants ownership or commits a document.
 */
export function prepareImportedDefinitionPins(root, snapshots, refs, allocateDefinitionId) {
    try {
        const admitted = cloneDefinitionData({ snapshots, refs }, {snapshotEnvelope:true});
        if (!admitted.ok) return admitted;
        if (!safeWorkflowData(root) || !admitted.data.snapshots || typeof admitted.data.snapshots !== 'object' || Array.isArray(admitted.data.snapshots)
            || !Array.isArray(admitted.data.refs)) return fail('DEFINITION_DATA', 'Expected a root, pinned snapshot table and exact references.');
        const source = admitted.data.snapshots, definitions = structuredClone(root.definitions ?? {}), addedDefinitionKeys = [], changedRefs = [];
        for (const [key, definition] of Object.entries(source)) {
            if (Object.hasOwn(definitions, key)) {
                const left = computeDefinitionIdentity(definitions[key],{snapshots:{...definitions,...source}}), right = computeDefinitionIdentity(definition,{snapshots:{...definitions,...source}});
                if (!left.ok) return left;
                if (!right.ok) return right;
                if (left.data.canonicalContent !== right.data.canonicalContent) return fail('DEFINITION_CONFLICT', 'An exact snapshot pin has conflicting semantic content.');
            } else { definitions[key] = structuredClone(definition); addedDefinitionKeys.push(key); }
        }
        // Keep the actual root and original pins: renaming cannot hide a source conflict.
        const merged = validateGraphStructure({ ...root, definitions });
        if (!merged.ok) return merged;
        for (const ref of admitted.data.refs) {
            const checked = inspectPinnedDefinitionIdentity(ref, source);
            if (!checked.ok) return checked;
        }
        const privateIds = new Set(ownershipEntries(root).map(entry => entry.definitionId)), replacements = new Map();
        const ids = compositionIds({ ...root, definitions });
        const copyPin = key => {
            if (replacements.has(key)) return { ok: true, data: replacements.get(key) };
            const saved = source[key], draft = structuredClone(saved);
            let changed = privateIds.has(saved.id);
            for (const node of Object.values(draft.body.nodes)) if (node.type === 'subgraph') {
                const child = copyPin(definitionRefKey(node.definition));
                if (!child.ok) return child;
                if (definitionRefKey(child.data) !== definitionRefKey(node.definition)) { node.definition = child.data; changed = true; }
            }
            let next = { id: saved.id, version: saved.version, semanticHash: saved.semanticHash };
            if (changed) {
                if (typeof allocateDefinitionId !== 'function') return fail('INVALID_OPTIONS', 'Supply an internal fresh definition allocator.');
                const allocated = allocateDefinitionId(key);
                if (!allocated?.ok) return allocated ?? fail('INVALID_ID', 'Expected a fresh definition identity.');
                if (!safeId(allocated.data) || !ids.claim(allocated.data)) return fail('IDENTITY_COLLISION', 'A copied definition requires a fresh safe identity.');
                draft.id = allocated.data; draft.version = 1; delete draft.semanticHash;
                const identity = computeDefinitionIdentity(draft,{snapshots:definitions});
                if (!identity.ok) return identity;
                const snapshot = { ...structuredClone(identity.data.materializedDefinition), semanticHash: identity.data.semanticHash };
                next = { id: snapshot.id, version: snapshot.version, semanticHash: snapshot.semanticHash };
                const nextKey = definitionRefKey(next);
                if (!ids.claim(nextKey)) return fail('IDENTITY_COLLISION', 'A copied snapshot table key must remain fresh.');
                definitions[nextKey] = snapshot; addedDefinitionKeys.push(nextKey);
                changedRefs.push({ sourceKey: key, before: { id: saved.id, version: saved.version, semanticHash: saved.semanticHash }, after: next });
            }
            replacements.set(key, next); return { ok: true, data: next };
        };
        const nextRefs = [];
        for (const reference of admitted.data.refs) {
            const copied = copyPin(definitionRefKey(reference));
            if (!copied.ok) return copied;
            nextRefs.push(copied.data);
        }
        return { ok: true, data: { definitions, refs: nextRefs, addedDefinitionKeys, changedRefs } };
    } catch { return fail('INSERTION_FAILED', 'Could not prepare the pinned definition import.'); }
}
