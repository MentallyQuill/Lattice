import { cloneDefinitionData, computeDefinitionIdentity, definitionRefKey, nodeBindingOverrideKey } from './definitions.js?v=0.27.2';
import { cloneWorkflowDocument } from './document.js?v=0.27.2';
import { validateGraphStructure } from './contracts.js?v=0.27.2';
import { prepareGraphCandidate } from './prepared-graph-edit.js?v=0.27.2';
import { definitionChain, ownershipEntries, ownsDefinitionPath, pathStartsWith, safeId, prunePrivateSnapshots } from './composition-edit.js?v=0.27.2';
import { reconcileOwners } from './definition-library.js?v=0.27.2';
import { operationFor } from './catalog.js?v=0.27.2';

const fail = (code, message) => ({ ok: false, error: { code, message } });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));
const reference = value => ({ id: value.id, version: value.version, semanticHash: value.semanticHash });
const exactRef = (expected, actual) => only(expected, ['id', 'version', 'semanticHash']) && definitionRefKey(expected) === definitionRefKey(actual);
const validIds = ids => Array.isArray(ids) && ids.length <= 1000 && ids.every(safeId) && new Set(ids).size === ids.length;

function removeBindings(scope, removedEndpoint, removedEdges) {
    const portals = new Set();
    for (const [id, portal] of Object.entries(scope.portals ?? {})) if (removedEndpoint(portal.source.nodeId, portal.source.portId)) { portals.add(id); delete scope.portals[id]; }
    for (const [id, wire] of Object.entries(scope.wires)) if (removedEndpoint(wire.to, wire.toPort)
        || wire.route === 'wire' && removedEndpoint(wire.from, wire.fromPort) || wire.route === 'portal' && portals.has(wire.portalId)) {
        delete scope.wires[id]; removedEdges.add(id);
    }
}

function pruneTargetBindings(scope, prefix, deletedTarget) {
    for (const node of Object.values(scope.nodes)) if (node.type === 'subgraph') {
        for (const key of Object.keys(node.nodeBindingOverrides ?? {})) {
            const [relativePath, nodeId] = JSON.parse(key);
            if (deletedTarget([...prefix, node.id, ...relativePath, nodeId])) delete node.nodeBindingOverrides[nodeBindingOverrideKey(relativePath, nodeId)];
        }
    }
}

function definedRoles(definition, snapshots) {
    const roles = new Set(), visited = new Set(), pending = [definition];
    while (pending.length) {
        const next = pending.pop(), key = definitionRefKey(next);
        if (visited.has(key)) continue; visited.add(key);
        for (const role of Object.keys(next.body.roles ?? {})) roles.add(role);
        for (const node of Object.values(next.body.nodes)) {
            const role = node.modelRole ?? operationFor(node)?.modelRole; if (role) roles.add(role);
            if (node.type === 'subgraph') pending.push(snapshots[definitionRefKey(node.definition)]);
        }
    }
    return roles;
}

/** Regular node deletion, including connected boundary ports, in one actual root candidate.
 * Only the explicitly owned branch receives new immutable pins; placed sibling snapshots survive.
 */
export function prepareSubgraphNodeDeletion(root, input) {
    const admitted = cloneDefinitionData(input); if (!admitted.ok) return admitted;
    const command = admitted.data;
    if (!only(command, ['viewPath', 'expectedRef', 'nodeIds', 'groupIds'])) return fail('INVALID_COMMAND', 'Expected a qualified node selection.');
    if (!Array.isArray(command.viewPath) || command.viewPath.length > 8 || !command.viewPath.every(safeId)) return fail('INVALID_INSTANCE', 'Expected an explicit bounded containing graph path.');
    if (!validIds(command.nodeIds) || !validIds(command.groupIds ?? []) || !command.nodeIds.length && !command.groupIds?.length) return fail('INVALID_SELECTION', 'Select existing unique nodes or groups.');
    const copied = cloneWorkflowDocument(root); if (!copied.ok) return copied;
    const checked = validateGraphStructure(root); if (!checked.ok) return checked;
    if (root.schema !== 3 || root.runtime !== 2) return fail('UNSUPPORTED_VERSION', 'Subgraph authoring requires schema 3 and runtime 2.');
    const candidate = copied.data, path = [...command.viewPath], chain = path.length ? definitionChain(root, path) : [];
    if (!chain) return fail('INVALID_INSTANCE', 'The containing graph path does not exist.');
    const definition = chain.at(-1)?.definition;
    if (path.length ? !exactRef(command.expectedRef, reference(definition)) : command.expectedRef !== undefined) return fail('STALE_DEFINITION', 'Supply the current exact containing definition pin.');
    if (path.length && !ownsDefinitionPath(root, path)) return fail('READ_ONLY_DEFINITION', 'Make a local copy before editing this subgraph.');
    let scope = structuredClone(definition?.body ?? candidate);
    if (command.nodeIds.some(id => !Object.hasOwn(scope.nodes, id)) || (command.groupIds ?? []).some(id => !Object.hasOwn(scope.groups ?? {}, id))) return fail('INVALID_SELECTION', 'Select actual current nodes and groups.');
    const selected = new Set(command.nodeIds), removedEdges = new Set(), deletedPaths = command.nodeIds.map(id => [...path, id]);
    const deletedTarget = address => deletedPaths.some(deleted => pathStartsWith(address, deleted));
    const removedInterfaceIds = (definition?.interface ?? []).filter(port => selected.has(port.boundaryNodeId)).map(port => port.id);
    removeBindings(scope, nodeId => selected.has(nodeId), removedEdges);
    for (const id of selected) delete scope.nodes[id];
    for (const group of Object.values(scope.groups ?? {})) if (group.members) group.members = group.members.filter(id => !selected.has(id));
    for (const id of command.groupIds ?? []) { delete scope.groups[id]; for (const node of Object.values(scope.nodes)) if (node.inGroup === id) delete node.inGroup; }
    pruneTargetBindings(scope, path, deletedTarget);
    const changedRefs = [];
    for (let depth = path.length - 1; depth >= 0; depth--) {
        const previous = chain[depth].definition, prefix = path.slice(0, depth + 1), draft = { ...structuredClone(previous), body: scope };
        if (depth === path.length - 1) draft.interface = draft.interface.filter(port => !selected.has(port.boundaryNodeId));
        draft.parameters = draft.parameters.filter(parameter => !deletedTarget([...prefix, ...parameter.target.instancePath, parameter.target.nodeId]));
        draft.version = Math.max(...Object.values(candidate.definitions).filter(item => item.id === draft.id).map(item => item.version)) + 1;
        if (!Number.isSafeInteger(draft.version)) return fail('DEFINITION_METADATA', 'Definition version limit reached.');
        delete draft.semanticHash;
        const identity = computeDefinitionIdentity(draft); if (!identity.ok) return identity;
        const saved = { ...structuredClone(identity.data.materializedDefinition), semanticHash: identity.data.semanticHash };
        candidate.definitions[definitionRefKey(saved)] = saved;
        changedRefs.push({ instancePath: prefix, before: reference(previous), after: reference(saved) });
        scope = structuredClone(depth ? chain[depth - 1].definition.body : candidate);
        const wrapper = scope.nodes[path[depth]]; wrapper.definition = reference(saved);
        for (const id of Object.keys(wrapper.parameterOverrides ?? {})) if (!saved.parameters.some(parameter => parameter.id === id)) delete wrapper.parameterOverrides[id];
        const roles = definedRoles(saved, candidate.definitions);
        for (const role of Object.keys(wrapper.roleOverrides ?? {})) if (!roles.has(role)) delete wrapper.roleOverrides[role];
        if (depth === path.length - 1 && removedInterfaceIds.length) {
            const removed = new Set(removedInterfaceIds);
            removeBindings(scope, (nodeId, portId) => nodeId === wrapper.id && removed.has(portId), removedEdges);
        }
        pruneTargetBindings(scope, path.slice(0, depth), deletedTarget);
    }
    const finished = { ...scope, definitions: candidate.definitions };
    reconcileOwners(finished, ownershipEntries(root).filter(entry => !deletedTarget(entry.instancePath)));
    prunePrivateSnapshots(finished, new Set(ownershipEntries(root).map(entry => entry.definitionId)));
    const prepared = prepareGraphCandidate(root, finished, [], [...removedEdges]);
    return prepared.ok ? { ok: true, data: { ...prepared.data, viewPath: path, ...(definition ? { expectedRef: reference(definition) } : {}), removedNodeIds: [...selected], removedInterfaceIds, changedRefs } } : prepared;
}
