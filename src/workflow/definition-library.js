import {semanticJsonCommandOptions} from './semantic-json-data.js?v=0.27.2';
import { cloneDefinitionData, computeDefinitionIdentity, definitionRefKey, describeExposedParameter, nodeBindingOverrideKey, validateDefinition } from './definitions.js?v=0.27.2';
import { safeWorkflowData, validateGraphStructure } from './contracts.js?v=0.27.2';
import { inspectGraphArtifacts, prepareGraphArtifacts } from './graph-artifacts.js?v=0.27.2';
import { cloneWorkflowDocument } from './document.js?v=0.27.2';
import { ARTIFACT_KINDS, describeOperation, operationFor } from './catalog.js?v=0.27.2';
import { applyDeclaredNodeControlChange, graphDocumentSignature } from './ports.js?v=0.27.2';
import { selectSubgraphClosure } from './packages.js?v=0.27.2';
import { prepareGraphCandidate } from './prepared-graph-edit.js?v=0.27.2';
import { compositionIds, definitionChain, ownershipEntries, ownsDefinitionPath, samePath, pathStartsWith, safeId, prunePrivateSnapshots } from './composition-edit.js?v=0.27.2';
import { inspectExpandedGraph } from './graph-validation.js?v=0.27.2';

const fail = (code, message) => ({ ok: false, error: { code, message } });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const reference = definition => ({ id: definition.id, version: definition.version, semanticHash: definition.semanticHash });
const only = (value, fields) => record(value) && Object.keys(value).every(key => fields.includes(key));
const exactRef = (value, actual) => only(value, ['id', 'version', 'semanticHash']) && definitionRefKey(value) === definitionRefKey(actual);

// Root bookkeeping belongs to graph admission; detached definitions remain stricter.
// Read the immutable checked snapshot; existing producers detach mutable candidates.
// This preserves optional field presence and own JSON without copying the base twice.
function inspectQualifiedRoot(root) {
    const checked = prepareGraphArtifacts(root); if (!checked.ok) return checked;
    return { ok: true, data: inspectGraphArtifacts(checked.data).snapshot };
}

/** Internal trusted synchronous domain seam, never a callback received from DTO/plugin input. */
export function prepareQualifiedScopeEdit(root, input, mutateSavedScope) {
    const copied = inspectQualifiedRoot(root); if (!copied.ok) return copied;
    const admitted = cloneDefinitionData(input, semanticJsonCommandOptions(copied.data,input)); if (!admitted.ok) return admitted;
    const command = admitted.data;
    if (!record(command) || !Array.isArray(command.viewPath) || command.viewPath.length > 8 || !command.viewPath.every(safeId)) return fail('INVALID_INSTANCE', 'Expected an explicit bounded containing graph path.');
    const original = copied.data;
    const artifacts = prepareGraphArtifacts(root); if (!artifacts.ok) return artifacts;
    const normalized = cloneWorkflowDocument(original, { checkedArtifacts: artifacts.data }); if (!normalized.ok) return normalized;
    if (original.schema !== 3 || original.runtime !== 2) return fail('UNSUPPORTED_VERSION', 'Qualified edits require schema 3 and runtime 2.');
    const path = [...command.viewPath], chain = path.length ? definitionChain(original, path) : [];
    if (!chain) return fail('INVALID_INSTANCE', 'The containing graph path does not exist.');
    const definition = chain.at(-1)?.definition;
    if (path.length ? !exactRef(command.expectedRef, reference(definition)) : command.expectedRef !== undefined) return fail('STALE_DEFINITION', 'Supply the current exact containing definition pin.');
    if (path.length && !ownsDefinitionPath(original, path)) return fail('READ_ONLY_DEFINITION', 'Make a local copy of the containing graph before editing.');
    const candidate = normalized.data, draft = definition ? structuredClone(definition) : null;
    const context = { original, candidate, path, definition, draft, scope: draft?.body ?? candidate, ids: compositionIds(candidate),
        metadata: () => ({ ...(draft?.body ?? candidate), definitions: candidate.definitions, ...(draft ? { interface: draft.interface } : {}) }) };
    const applied = mutateSavedScope(context, command); if (!applied.ok) return applied;
    let finished = candidate, details = applied.data ?? {};
    if (draft) {
        const identity = computeDefinitionIdentity(draft,{snapshots:candidate.definitions}); if (!identity.ok) return identity;
        const materialized = { ...structuredClone(identity.data.materializedDefinition), semanticHash: identity.data.semanticHash };
        if (graphDocumentSignature(materialized) !== graphDocumentSignature(definition)) {
            // Incoming snapshots belong to a real full root; final preconditions remain actualOriginal.
            const revised = prepareLocalDefinitionEdit({ ...original, definitions: candidate.definitions }, { instancePath: path, expectedRef: reference(definition), draft: materialized });
            if (!revised.ok) return revised;
            finished = revised.data.candidate;
            details = { ...details, changedRefs: revised.data.changedRefs };
        }
    }
    const prepared = prepareGraphCandidate(original, finished, details.addedEdgeIds ?? [], details.removedEdgeIds ?? [], root);
    return prepared.ok ? { ok: true, data: { ...prepared.data, ...details, viewPath: path, ...(definition ? { expectedRef: reference(definition) } : {}) } } : prepared;
}

const nodeFields = {
    controls: ['controls', 'removeEdgeIds'], enabled: ['value'], 'model-role': ['mode', 'value'], binding: ['field', 'mode', 'value', 'consumeOverride'],
    'parameter-override': ['expectedInstanceRef', 'parameterId', 'mode', 'value'], 'binding-override': ['expectedInstanceRef', 'target', 'field', 'mode', 'value'],
};
/** Prepare saved primitive fields or wrapper overrides in one actual qualified root candidate. */
export function prepareNativeNodeEdit(root, input) {
    const copied = inspectQualifiedRoot(root); if (!copied.ok) return copied;
    const admitted = cloneDefinitionData(input, semanticJsonCommandOptions(copied.data,input)); if (!admitted.ok) return admitted;
    const command = admitted.data;
    if (!record(command) || typeof command.kind !== 'string' || !Object.hasOwn(nodeFields, command.kind) || !only(command, ['kind', 'viewPath', 'expectedRef', 'nodeId', ...nodeFields[command.kind]]) || !safeId(command.nodeId)) return fail('INVALID_COMMAND', 'Expected a known qualified node command.');
    if (command.kind === 'controls' && (!record(command.controls) || command.removeEdgeIds !== undefined && (!Array.isArray(command.removeEdgeIds) || !command.removeEdgeIds.every(safeId)))) return fail('INVALID_COMMAND', 'Expected controls and explicit incident wire IDs.');
    if (command.consumeOverride !== undefined && typeof command.consumeOverride !== 'boolean') return fail('INVALID_COMMAND', 'Expected an explicit binding override consumption flag.');
    if (command.kind === 'enabled' && typeof command.value !== 'boolean') return fail('INVALID_COMMAND', 'Enabled requires a boolean.');
    const binding = command.kind === 'binding' || command.kind === 'binding-override';
    if (binding && !['profileId', 'model'].includes(command.field)) return fail('INVALID_COMMAND', 'Expected a model or profile field.');
    if (['binding', 'binding-override', 'model-role', 'parameter-override'].includes(command.kind)) {
        const resetting = ['binding-override', 'parameter-override'].includes(command.kind) ? 'reset' : 'remove';
        if (!['set', resetting].includes(command.mode) || command.mode === 'set' && !Object.hasOwn(command, 'value') || command.mode === resetting && Object.hasOwn(command, 'value') || command.kind !== 'parameter-override' && command.mode === 'set' && command.value !== null && typeof command.value !== 'string') return fail('INVALID_COMMAND', 'Expected an explicit saved set or removal command.');
    }
    if (command.kind === 'parameter-override' && !safeId(command.parameterId)) return fail('INVALID_COMMAND', 'Expected a stable parameter ID.');
    if (command.kind === 'binding-override') {
        const target = command.target;
        if (target?.kind === 'role' ? !only(target, ['kind', 'role']) || !safeId(target.role) : target?.kind !== 'node' || !only(target, ['kind', 'instancePath', 'nodeId']) || !Array.isArray(target.instancePath) || target.instancePath.length > 8 || !target.instancePath.every(safeId) || !safeId(target.nodeId)) return fail('INVALID_COMMAND', 'Expected an actual role or structural primitive target.');
    }
    const prepared = prepareQualifiedScopeEdit(root, command, applyNativeNodeEdit);
    if (!prepared.ok || command.kind !== 'binding' || !command.consumeOverride || !command.viewPath.length) return prepared;
    return consumeEditedBinding(root, prepared.data, command);
}

// A copied explicit null remains a wrapper blocker because saved primitive null means
// inheritance. Editing that field supersedes the blocker in the owning instance only.
function consumeEditedBinding(original, prepared, command) {
    let candidate = prepared.candidate;
    for (let depth = command.viewPath.length - 1; depth >= 0; depth--) {
        const prefix = command.viewPath.slice(0, depth + 1), chain = definitionChain(candidate, prefix), wrapper = chain.at(-1).node;
        const key = nodeBindingOverrideKey(command.viewPath.slice(depth + 1), command.nodeId);
        if (!Object.hasOwn(wrapper.nodeBindingOverrides?.[key] ?? {}, command.field)) continue;
        if (!depth) {
            delete wrapper.nodeBindingOverrides[key][command.field];
            if (!Object.keys(wrapper.nodeBindingOverrides[key]).length) delete wrapper.nodeBindingOverrides[key];
        } else {
            const parentPath = prefix.slice(0, -1), parent = definitionChain(candidate, parentPath).at(-1).definition;
            const draft = structuredClone(parent), nested = draft.body.nodes[prefix.at(-1)];
            delete nested.nodeBindingOverrides[key][command.field];
            if (!Object.keys(nested.nodeBindingOverrides[key]).length) delete nested.nodeBindingOverrides[key];
            const revised = prepareLocalDefinitionEdit(candidate, { instancePath: parentPath, expectedRef: reference(parent), draft });
            if (!revised.ok) return revised;
            candidate = revised.data.candidate;
        }
    }
    const final = prepareGraphCandidate(original, candidate);
    return final.ok ? { ok: true, data: { ...prepared, ...final.data } } : final;
}

function applyNativeNodeEdit(context, command) {
    const node = Object.hasOwn(context.scope.nodes, command.nodeId) && context.scope.nodes[command.nodeId];
    if (command.kind === 'enabled' && node?.type === 'subgraph') { node.enabled = command.value; return { ok: true, data: {} }; }
    if (['parameter-override', 'binding-override'].includes(command.kind)) {
        if (node?.type !== 'subgraph') return fail('INVALID_INSTANCE', 'Expected an actual local wrapper.');
        if (!exactRef(command.expectedInstanceRef, node.definition)) return fail('STALE_DEFINITION', 'The selected wrapper pin changed.');
        const definition = context.candidate.definitions[definitionRefKey(node.definition)];
        if (command.kind === 'parameter-override') {
            if (!definition.parameters.some(parameter => parameter.id === command.parameterId)) return fail('INVALID_OVERRIDE', 'Expected an actual current exposed parameter.');
            node.parameterOverrides ??= {};
            if (command.mode === 'reset') delete node.parameterOverrides[command.parameterId];
            else node.parameterOverrides[command.parameterId] = structuredClone(command.value);
        } else {
            if (command.target.kind === 'role' ? !definitionHasRole(definition, context.candidate.definitions, command.target.role) : !relativePrimitive(definition, context.candidate.definitions, command.target)) return fail('INVALID_OVERRIDE', 'Expected an actual current role or primitive target.');
            const role = command.target.kind === 'role', field = role ? 'roleOverrides' : 'nodeBindingOverrides';
            const key = role ? command.target.role : nodeBindingOverrideKey(command.target.instancePath, command.target.nodeId);
            node[field] ??= {};
            if (command.mode === 'reset') { if (Object.hasOwn(node[field], key)) { delete node[field][key][command.field]; if (!Object.keys(node[field][key]).length) delete node[field][key]; } }
            else { node[field][key] ??= {}; node[field][key][command.field] = command.value; }
        }
    } else {
        const described = describeOperation(context.metadata(), node); if (!described.ok) return described;
        if (command.kind === 'controls') return applyDeclaredNodeControlChange(context, command);
        if (command.kind === 'enabled') node.enabled = command.value;
        else { const field = command.kind === 'model-role' ? 'modelRole' : command.field; if (command.mode === 'remove') delete node[field]; else node[field] = command.value; }
    }
    return { ok: true, data: {} };
}

function relativePrimitive(definition, snapshots, target) {
    let scope = definition.body;
    for (const id of target.instancePath) { const wrapper = Object.hasOwn(scope.nodes, id) && scope.nodes[id]; if (wrapper?.type !== 'subgraph') return null; const child = snapshots[definitionRefKey(wrapper.definition)]; if (!child) return null; scope = child.body; }
    const node = Object.hasOwn(scope.nodes, target.nodeId) && scope.nodes[target.nodeId];
    return operationFor(node, { phase: scope.mode.slice(7) }) ? node : null;
}
function definitionHasRole(definition, snapshots, role) {
    const pending = [definition], visited = new Set();
    while (pending.length) { const item = pending.pop(), key = definitionRefKey(item); if (visited.has(key)) continue; visited.add(key);
        if (Object.hasOwn(item.body.roles ?? {}, role)) return true;
        for (const node of Object.values(item.body.nodes)) { if ((node.modelRole ?? operationFor(node, { phase: item.body.mode.slice(7) })?.modelRole) === role) return true; if (node.type === 'subgraph') pending.push(snapshots[definitionRefKey(node.definition)]); }
    }
    return false;
}

function mergeSnapshots(existing, incoming) {
    if (!record(existing) || !record(incoming)) return fail('DEFINITION_REF', 'Expected snapshot tables.');
    const merged = { ...existing };
    for (const [key, definition] of Object.entries(incoming)) {
        if (Object.hasOwn(merged, key)) {
            const left = computeDefinitionIdentity(merged[key]), right = computeDefinitionIdentity(definition);
            if (!left.ok) return left;
            if (!right.ok) return right;
            if (left.data.canonicalContent !== right.data.canonicalContent) return fail('DEFINITION_CONFLICT', 'An exact pin has conflicting canonical content.');
        } else Object.defineProperty(merged, key, { enumerable: true, configurable: true, writable: true, value: definition });
    }
    return { ok: true, data: merged };
}

/** Immutable shelf commands return new DTOs; no persistence or placed-workflow mutation. */
export function installDefinition(library, definition, snapshots = {}) {
    if (!safeWorkflowData(library) || !record(library) || !record(library.definitions) || !safeWorkflowData(definition) || !record(definition) || !safeWorkflowData(snapshots)) return fail('DEFINITION_DATA', 'Expected bounded local library data.');
    const incoming = mergeSnapshots(snapshots, { [definitionRefKey(definition)]: definition });
    if (!incoming.ok) return incoming;
    const merged = mergeSnapshots(library.definitions, incoming.data);
    if (!merged.ok) return merged;
    const key = definitionRefKey(definition), validation = validateDefinition(merged.data[key], merged.data);
    if (!validation.ok) return validation;
    const materialized = {};
    for (const [key, item] of Object.entries(merged.data)) {
        const identity = computeDefinitionIdentity(item);
        if (!identity.ok) return identity;
        materialized[key] = identity.data.materializedDefinition;
    }
    const frozen = cloneDefinitionData({ definitions: materialized });
    if (!frozen.ok) return frozen;
    const addedDefinitionKeys = Object.keys(materialized).filter(key => !Object.hasOwn(library.definitions, key));
    return { ok: true, data: { library: frozen.data, ref: reference(validation.data.definition), changed: addedDefinitionKeys.length > 0, addedDefinitionKeys } };
}

export function createRevision(library, draft, snapshots = {}) {
    if (!safeWorkflowData(library) || !record(library) || !record(library.definitions) || !safeWorkflowData(draft) || !record(draft) || !safeWorkflowData(snapshots) || !record(snapshots)) return fail('DEFINITION_DATA', 'Expected a library, editable definition draft and plain pinned snapshots.');
    const merged = mergeSnapshots(library.definitions, snapshots);
    if (!merged.ok) return merged;
    const versions = Object.values(merged.data).filter(item => item?.id === draft.id).map(item => item.version);
    const version = Math.max(0, ...versions) + 1;
    if (!Number.isSafeInteger(version)) return fail('DEFINITION_METADATA', 'Definition version limit reached.');
    const candidate = { ...structuredClone(draft), version }; delete candidate.semanticHash;
    const identity = computeDefinitionIdentity(candidate);
    if (!identity.ok) return identity;
    return installDefinition(library, { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash }, snapshots);
}

export function removeLibraryEntry(library, ref) {
    if (!safeWorkflowData(library) || !record(library) || !record(library.definitions) || !safeWorkflowData(ref) || !record(ref)) return fail('DEFINITION_DATA', 'Expected a library and exact reference.');
    const key = definitionRefKey(ref);
    if (!Object.hasOwn(library.definitions, key)) return fail('MISSING_DEFINITION', 'The shelf entry does not exist.');
    const validation = validateDefinition(library.definitions[key], library.definitions);
    if (!validation.ok) return validation;
    for (const [otherKey, item] of Object.entries(library.definitions)) if (otherKey !== key && Object.values(item.body.nodes).some(node => node.type === 'subgraph' && definitionRefKey(node.definition) === key)) return fail('DEFINITION_IN_USE', 'Another shelf definition pins this revision.');
    const definitions = { ...library.definitions }; delete definitions[key];
    const frozen = cloneDefinitionData({ definitions });
    return frozen.ok ? { ok: true, data: { library: frozen.data, changed: true } } : frozen;
}

function editableInstance(graph, command) {
    if (!safeWorkflowData(command) || !record(command) || typeof command.instanceId !== 'string') return fail('INVALID_INSTANCE', 'Expected an instance command.');
    const validation = validateGraphStructure(graph);
    if (!validation.ok) return validation;
    const node = Object.hasOwn(graph.nodes, command.instanceId) && graph.nodes[command.instanceId];
    return node?.type === 'subgraph' ? { ok: true, data: structuredClone(graph) } : fail('INVALID_INSTANCE', 'Expected a root-scope subgraph instance.');
}

export function makeLocalCopy(graph, command) {
    const input = qualifiedInstance(graph, command); if (!input.ok) return input;
    const { candidate, path, chain } = input.data, ids = compositionIds(candidate);
    if (!ids.claim(command.id) || command.name !== undefined && typeof command.name !== 'string') return fail('DEFINITION_CONFLICT', 'A local copy requires a fresh safe ID and optional display name.');
    if (command.materializeOverrides !== undefined && typeof command.materializeOverrides !== 'boolean') return fail('INVALID_COMMAND', 'Expected an explicit override materialization flag.');
    if (command.materializeOverrides) {
        const materialized = materializeQualifiedInstance(graph, path, command.id, command.name, ids); if (!materialized.ok) return materialized;
        const data = materialized.data, revisedChain = structuredClone(chain);
        Object.assign(candidate.definitions, data.definitions);
        const owners = ownershipEntries(candidate);
        for (const entry of data.owners) {
            const existing = owners.find(owner => samePath(owner.instancePath, entry.instancePath));
            if (existing) existing.definitionId = entry.definitionId; else owners.push(entry);
        }
        candidate.localDefinitionOwners = owners;
        for (let depth = 0; depth < path.length; depth++) {
            const wrapper = depth ? revisedChain[depth - 1].definition.body.nodes[path[depth]] : candidate.nodes[path[depth]];
            if (depth === path.length - 1) {
                wrapper.parameterOverrides = {}; wrapper.roleOverrides = {}; wrapper.nodeBindingOverrides = data.nullBindings;
            } else consumeSubtreeOverrides(wrapper, revisedChain[depth].definition, path.slice(depth + 1));
        }
        const revised = reviseQualified(graph, candidate, path, revisedChain, data.definition, true, ids);
        if (revised.ok) revised.data.changedRefs.push(...data.changedRefs.filter(change => change.instancePath.length > path.length));
        return revised;
    }
    const draft = { ...structuredClone(chain.at(-1).definition), id: command.id, version: 1, ...(command.name === undefined ? {} : { name: command.name }) };
    return reviseQualified(graph, candidate, path, chain, draft, true, ids);
}

function consumeSubtreeOverrides(wrapper, definition, relativePath) {
    for (const parameter of definition.parameters) if (pathStartsWith(parameter.target.instancePath, relativePath)) delete wrapper.parameterOverrides?.[parameter.id];
    for (const key of Object.keys(wrapper.nodeBindingOverrides ?? {})) {
        const [targetPath] = JSON.parse(key);
        if (pathStartsWith(targetPath, relativePath)) delete wrapper.nodeBindingOverrides[key];
    }
}

/** Detached effective saved contents for the explicit shelf action. Inherited role
 * fields and catalog defaults remain inherited; only actual wrapper overrides bake in.
 */
export function materializeInstanceDefinition(graph, command) {
    const input = qualifiedInstance(graph, command); if (!input.ok) return input;
    const ids = compositionIds(input.data.candidate);
    if (!ids.claim(command.id) || command.name !== undefined && typeof command.name !== 'string') return fail('DEFINITION_CONFLICT', 'Materialization requires a fresh safe ID and optional display name.');
    const built = materializeQualifiedInstance(graph, input.data.path, command.id, command.name, ids, true); if (!built.ok) return built;
    const data = built.data;
    if (Object.keys(data.nullBindings).length) {
        // The existing native wrapper is the lossless representation of explicit
        // null blocking. A shelf definition has no outer wrapper, so retain it inside
        // a bounded shell rather than fixing an inherited profile/model to this host.
        const inner = structuredClone(data.definition); inner.id = ids.next(`${command.id}-definition`);
        const saved = finalizedDefinition(inner); if (!saved.ok) return saved;
        delete data.definitions[definitionRefKey(data.definition)];
        data.definitions[definitionRefKey(saved.data)] = saved.data;
        const wrapperId = ids.next('saved-instance'), nodes = {}, wires = {};
        nodes[wrapperId] = { id: wrapperId, type: 'subgraph', definition: reference(saved.data), parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: data.nullBindings };
        const shell = structuredClone(data.definition);
        for (const port of shell.interface) {
            nodes[port.boundaryNodeId] = structuredClone(shell.body.nodes[port.boundaryNodeId]);
            const id = ids.next('saved-wire');
            wires[id] = { id, route: 'wire', ...(port.direction === 'input' ? { from: port.boundaryNodeId, fromPort: 'out', to: wrapperId, toPort: port.id } : { from: wrapperId, fromPort: port.id, to: port.boundaryNodeId, toPort: 'in' }) };
        }
        shell.parameters = shell.parameters.map(parameter => ({ ...parameter, target: { ...parameter.target, instancePath: [wrapperId, ...parameter.target.instancePath] } }));
        shell.body = { schema: 3, runtime: 2, mode: shell.body.mode, nodes, wires };
        const finished = finalizedDefinition(shell); if (!finished.ok) return finished;
        data.definition = finished.data; data.definitions[definitionRefKey(finished.data)] = finished.data;
    }
    const checked = selectSubgraphClosure(data.definition, data.definitions);
    return checked.ok ? { ok: true, data: { definition: checked.data.definition, definitions: checked.data.definitions } } : checked;
}

function finalizedDefinition(draft) {
    delete draft.semanticHash;
    const identity = computeDefinitionIdentity(draft);
    return identity.ok ? { ok: true, data: { ...structuredClone(identity.data.materializedDefinition), semanticHash: identity.data.semanticHash } } : identity;
}

function materializeQualifiedInstance(graph, selectedPath, id, name, ids, captureEnclosingRoles = false) {
    const checked = inspectExpandedGraph(graph); if (!checked.ok) return checked;
    const definitions = {}, nullBindings = {}, owners = [], changedRefs = [];
    const visit = (path, definitionId) => {
        const chain = definitionChain(graph, path), { definition, node: wrapper } = chain.at(-1);
        const draft = { ...structuredClone(definition), id: definitionId, version: 1, ...(samePath(path, selectedPath) && name !== undefined ? { name } : {}) };
        const effective = checked.data.scopes.find(scope => samePath(scope.instancePath, path)).graph;
        if (captureEnclosingRoles && samePath(path, selectedPath) && path.length > 1) {
            const roles = {};
            for (const context of chain.slice(0, -1)) for (const table of [context.definition.body.roles ?? {}, context.node.roleOverrides ?? {}]) {
                for (const [role, binding] of Object.entries(table)) roles[role] = { ...(roles[role] ?? {}), ...structuredClone(binding) };
            }
            for (const [role, binding] of Object.entries(draft.body.roles ?? {})) roles[role] = { ...(roles[role] ?? {}), ...binding };
            draft.body.roles = roles;
        }
        for (const [role, binding] of Object.entries(wrapper.roleOverrides ?? {})) {
            draft.body.roles ??= {};
            draft.body.roles[role] = { ...(draft.body.roles[role] ?? {}), ...structuredClone(binding) };
        }
        for (const node of Object.values(draft.body.nodes)) {
            if (node.type === 'subgraph') {
                const child = visit([...path, node.id], ids.next(`${id}-definition`)); if (!child.ok) return child;
                node.definition = reference(child.data);
                node.parameterOverrides = {}; node.roleOverrides = {}; node.nodeBindingOverrides = {};
            } else if (operationFor(node, { phase: draft.body.mode.slice(7) })) {
                const bindings = {};
                for (let depth = chain.length - 1; depth >= 0; depth--) {
                    const context = chain[depth], relative = path.slice(depth + 1);
                    for (const [parameterId] of Object.entries(context.node.parameterOverrides ?? {})) {
                        const parameter = context.definition.parameters.find(item => item.id === parameterId);
                        if (parameter.target.nodeId === node.id && samePath(parameter.target.instancePath, relative)) node[parameter.target.controlId] = structuredClone(effective.nodes[node.id][parameter.target.controlId]);
                    }
                    Object.assign(bindings, context.node.nodeBindingOverrides?.[nodeBindingOverrideKey(relative, node.id)] ?? {});
                }
                for (const field of Object.keys(bindings)) {
                    node[field] = effective.nodes[node.id][field];
                    if (node[field] === null) {
                        const key = nodeBindingOverrideKey(path.slice(selectedPath.length), node.id);
                        nullBindings[key] ??= {}; nullBindings[key][field] = null;
                    }
                }
            }
        }
        const finished = finalizedDefinition(draft); if (!finished.ok) return finished;
        definitions[definitionRefKey(finished.data)] = finished.data;
        owners.push({ instancePath: [...path], definitionId });
        changedRefs.push({ instancePath: [...path], before: reference(definition), after: reference(finished.data) });
        return finished;
    };
    const built = visit(selectedPath, id);
    return built.ok ? { ok: true, data: { definition: built.data, definitions, nullBindings, owners, changedRefs } } : built;
}

/** Reviewable explicit update: missing mappings retain the same stable ID; null drops an override.
 * Connected port removal is never implicit and must map to a compatible new port.
 */
export function prepareInstanceUpdate(graph, command) {
    const editable = editableInstance(graph, command); if (!editable.ok) return editable;
    for (const key of ['portMap', 'parameterMap', 'roleMap', 'nodeBindingMap']) if (!record(command[key] ?? {})) return fail('INVALID_OVERRIDE', 'Update mappings must be records.');
    const candidate = editable.data;
    const applied = applyInstanceUpdate({ candidate, scope: candidate }, command); if (!applied.ok) return applied;
    if (candidate.localDefinitionOwners !== undefined) reconcileOwners(candidate);
    return prepareGraphCandidate(graph, candidate);
}

function applyInstanceUpdate(context, command) {
    const { candidate, scope } = context, node = scope.nodes[command.instanceId], fromRef = structuredClone(node.definition);
    const installed = installDefinition({ definitions: candidate.definitions ?? {} }, command.definition, command.snapshots ?? {});
    if (!installed.ok) return installed;
    candidate.definitions = structuredClone(installed.data.library.definitions);
    node.definition = installed.data.ref;
    if (node.localCopy && node.localCopy.definitionId !== node.definition.id) delete node.localCopy;
    const map = (mapping, id) => Object.hasOwn(mapping ?? {}, id) ? mapping[id] : id;
    const remap = (values, mapping) => {
        const result = {};
        for (const [key, value] of Object.entries(values ?? {})) {
            const next = map(mapping, key);
            if (next === null) continue;
            if (typeof next !== 'string' || !next || Object.hasOwn(result, next) || ['__proto__', 'prototype', 'constructor'].includes(next)) return null;
            result[next] = value;
        }
        return result;
    };
    for (const [field, mapping] of [['parameterOverrides', 'parameterMap'], ['roleOverrides', 'roleMap'], ['nodeBindingOverrides', 'nodeBindingMap']]) {
        const values = remap(node[field], command[mapping]);
        if (!values) return fail('INVALID_OVERRIDE', 'Override mappings must be unambiguous stable IDs.');
        node[field] = values;
    }
    for (const wire of Object.values(scope.wires)) {
        if (wire.to === node.id) wire.toPort = map(command.portMap, wire.toPort);
        if (wire.route === 'wire' && wire.from === node.id) wire.fromPort = map(command.portMap, wire.fromPort);
    }
    for (const portal of Object.values(scope.portals ?? {})) if (portal.source.nodeId === node.id) portal.source.portId = map(command.portMap, portal.source.portId);
    return { ok: true, data: { fromRef, toRef: reference(installed.data.library.definitions[definitionRefKey(installed.data.ref)]) } };
}

export function reconcileOwners(candidate, entries = ownershipEntries(candidate)) {
    if (candidate.localDefinitionOwners === undefined && !entries.length) return;
    const owners = entries.filter(entry => definitionChain(candidate, entry.instancePath)?.at(-1).definition.id === entry.definitionId);
    candidate.localDefinitionOwners = owners.filter(entry => entry.instancePath.every((_, index) => owners.some(parent => samePath(parent.instancePath, entry.instancePath.slice(0, index + 1)))));
}

const mapFields = ['portMap', 'parameterMap', 'roleMap', 'nodeBindingMap'];
/** Explicit Update of a wrapper in its real editable containing parent, never its pinned body. */
export function prepareQualifiedInstanceUpdate(root, input) {
    const admitted = cloneDefinitionData(input); if (!admitted.ok) return admitted;
    const command = admitted.data;
    if (!only(command, ['viewPath', 'expectedRef', 'instanceId', 'expectedInstanceRef', 'definition', 'snapshots', ...mapFields]) || !safeId(command.instanceId) || !record(command.definition) || !record(command.snapshots)) return fail('INVALID_COMMAND', 'Expected an explicit qualified instance Update.');
    if (mapFields.some(field => !record(command[field]) || Object.entries(command[field]).some(([id, to]) => !safeId(id) || to !== null && !safeId(to)))) return fail('INVALID_OVERRIDE', 'Supply all four explicit stable mapping records.');
    return prepareQualifiedScopeEdit(root, command, applyQualifiedInstanceUpdate);
}

function bindingTarget(key) {
    let tuple; try { tuple = JSON.parse(key); } catch { return null; }
    return Array.isArray(tuple) && tuple.length === 2 && Array.isArray(tuple[0]) && tuple[0].length <= 8 && tuple[0].every(safeId) && safeId(tuple[1]) && key === nodeBindingOverrideKey(tuple[0], tuple[1]) ? { instancePath: tuple[0], nodeId: tuple[1] } : null;
}
function applyQualifiedInstanceUpdate(context, command) {
    const node = Object.hasOwn(context.scope.nodes, command.instanceId) && context.scope.nodes[command.instanceId];
    if (node?.type !== 'subgraph') return fail('INVALID_INSTANCE', 'Expected an actual local wrapper.');
    if (!exactRef(command.expectedInstanceRef, node.definition)) return fail('STALE_DEFINITION', 'The captured wrapper pin changed.');
    const closure = selectSubgraphClosure(command.definition, command.snapshots); if (!closure.ok) return closure;
    const previous = context.candidate.definitions[definitionRefKey(node.definition)], next = closure.data.definition;
    for (const [field, mapping] of mapFields.map(field => [field, command[field]])) for (const [from, to] of Object.entries(mapping)) {
        const exists = (definition, table, id) => field === 'portMap' ? definition.interface.some(port => port.id === id) : field === 'parameterMap' ? definition.parameters.some(parameter => parameter.id === id) : field === 'roleMap' ? definitionHasRole(definition, table, id) : !!bindingTarget(id) && !!relativePrimitive(definition, table, bindingTarget(id));
        if (!exists(previous, context.candidate.definitions, from) || to !== null && !exists(next, closure.data.definitions, to)) return fail('INVALID_OVERRIDE', 'Mapping must identify actual old and new metadata.');
        if (field === 'portMap' && to !== null) { const oldPort = previous.interface.find(port => port.id === from), newPort = next.interface.find(port => port.id === to); if (oldPort.direction !== newPort.direction || oldPort.kind !== newPort.kind) return fail('INVALID_OVERRIDE', 'Port mappings require matching direction and artifact kind.'); }
    }
    const applied = applyInstanceUpdate(context, { ...command, definition: closure.data.definition, snapshots: closure.data.definitions });
    if (applied.ok && !context.path.length) {
        reconcileOwners(context.candidate);
        prunePrivateSnapshots(context.candidate, new Set(ownershipEntries(context.original).map(entry => entry.definitionId)));
    }
    return applied;
}

const interfaceFields = { add: ['label', 'direction', 'artifactKind', 'required', 'graphPoint'], update: ['id', 'label', 'artifactKind', 'required'], remove: ['id'] };
const parameterFields = { add: ['label', 'target'], update: ['id', 'label'], remove: ['id'] };
/** Typed owning-body metadata edits; matching boundaries and full-root refs change atomically. */
export function prepareOwnedDefinitionMetadataEdit(root, input) {
    const admitted = cloneDefinitionData(input); if (!admitted.ok) return admitted;
    const command = admitted.data, fields = command?.kind === 'interface' ? interfaceFields : command?.kind === 'parameter' ? parameterFields : null, edit = command?.edit;
    if (!fields || !only(command, ['instancePath', 'expectedRef', 'kind', 'edit']) || !Array.isArray(command.instancePath) || !command.instancePath.length || !record(edit) || typeof edit.kind !== 'string' || !Object.hasOwn(fields, edit.kind) || !only(edit, ['kind', ...fields[edit.kind]]) || edit.kind !== 'add' && !safeId(edit.id) || edit.kind !== 'remove' && typeof edit.label !== 'string') return fail('INVALID_COMMAND', 'Expected a typed owned interface or parameter edit.');
    if (command.kind === 'interface' && edit.kind !== 'remove' && (!ARTIFACT_KINDS.includes(edit.artifactKind) || typeof edit.required !== 'boolean' || edit.kind === 'add' && !['input', 'output'].includes(edit.direction))) return fail('INVALID_COMMAND', 'Expected typed artifact kind and boundary direction.');
    if (command.kind === 'interface' && edit.kind === 'add' && edit.graphPoint !== undefined && (!only(edit.graphPoint, ['x', 'y']) || !Number.isFinite(edit.graphPoint.x) || !Number.isFinite(edit.graphPoint.y))) return fail('INVALID_COMMAND', 'Expected a finite boundary graph point.');
    if (command.kind === 'parameter' && edit.kind === 'add' && (!only(edit.target, ['instancePath', 'nodeId', 'controlId']) || !Array.isArray(edit.target.instancePath) || edit.target.instancePath.length > 8 || !edit.target.instancePath.every(safeId) || !safeId(edit.target.nodeId) || !safeId(edit.target.controlId))) return fail('INVALID_COMMAND', 'Expected an actual relative control target.');
    return prepareQualifiedScopeEdit(root, { ...command, viewPath: command.instancePath }, applyDefinitionMetadataEdit);
}

function defaultBoundaryPoint(draft, direction) {
    const bodyNodes = Object.values(draft.body.nodes).filter(node => !['subgraph-input', 'subgraph-output'].includes(node.type));
    const rectangles = (bodyNodes.length ? bodyNodes : [{}]).map(node => ({ x: node.x ?? 0, y: node.y ?? 0, w: node.w ?? 260 }));
    const left = Math.min(...rectangles.map(node => node.x)), right = Math.max(...rectangles.map(node => node.x + node.w));
    let y = Math.min(...rectangles.map(node => node.y));
    const peers = draft.interface.filter(port => port.direction === direction).map(port => draft.body.nodes[port.boundaryNodeId]).sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
    for (const peer of peers) if (y < (peer.y ?? 0) + (peer.h ?? 120) + 40 && y + 120 + 40 > (peer.y ?? 0)) y = (peer.y ?? 0) + (peer.h ?? 120) + 40;
    return { x: direction === 'input' ? left - 340 : right + 80, y };
}

function applyDefinitionMetadataEdit(context, command) {
    const draft = context.draft, edit = command.edit;
    if (command.kind === 'interface') {
        if (edit.kind === 'add') {
            let id; do { id = context.ids.next('interface-port'); } while (draft.interface.some(port => port.id === id));
            const boundaryNodeId = context.ids.next('boundary');
            const graphPoint = edit.graphPoint ?? defaultBoundaryPoint(draft, edit.direction);
            draft.interface.push({ id, label: edit.label, direction: edit.direction, kind: edit.artifactKind, required: edit.required, cardinality: 'one', boundaryNodeId });
            draft.body.nodes[boundaryNodeId] = { id: boundaryNodeId, type: `subgraph-${edit.direction}`, interfacePortId: id, ...graphPoint };
            return { ok: true, data: { addedInterfaceId: id, addedBoundaryNodeId: boundaryNodeId } };
        }
        const port = draft.interface.find(port => port.id === edit.id);
        if (!port) return fail('DEFINITION_INTERFACE', 'Expected an actual interface port.');
        if (edit.kind === 'remove') { draft.interface = draft.interface.filter(port => port.id !== edit.id); delete draft.body.nodes[port.boundaryNodeId]; }
        else { port.label = edit.label; port.kind = edit.artifactKind; port.required = edit.required; }
    } else {
        if (edit.kind === 'add') {
            const node = relativePrimitive(context.definition, context.candidate.definitions, edit.target);
            if (!node) return fail('DEFINITION_PARAMETER', 'Expected an actual relative primitive control.');
            const descriptor = describeExposedParameter(node, edit.target.controlId); if (!descriptor.ok) return descriptor;
            let id; do { id = context.ids.next('parameter'); } while (draft.parameters.some(parameter => parameter.id === id));
            draft.parameters.push({ id, label: edit.label, target: structuredClone(edit.target) });
            return { ok: true, data: { addedParameterId: id } };
        }
        const parameter = draft.parameters.find(parameter => parameter.id === edit.id);
        if (!parameter) return fail('DEFINITION_PARAMETER', 'Expected an actual exposed parameter.');
        if (edit.kind === 'remove') {
            const chain = definitionChain(context.original, context.path);
            if (Object.hasOwn(chain.at(-1).node.parameterOverrides ?? {}, parameter.id)) return fail('PARAMETER_IN_USE', 'Reset the surviving wrapper override before removing this parameter.');
            for (let depth = 0; depth < chain.length - 1; depth++) {
                const relative = [...context.path.slice(depth + 1), ...parameter.target.instancePath];
                if (chain[depth].definition.parameters.some(parent => samePath(parent.target.instancePath, relative) && parent.target.nodeId === parameter.target.nodeId && parent.target.controlId === parameter.target.controlId)) return fail('PARAMETER_IN_USE', 'Remove the surviving enclosing exposure before removing this parameter.');
            }
            draft.parameters = draft.parameters.filter(parameter => parameter.id !== edit.id);
        } else parameter.label = edit.label;
    }
    return { ok: true, data: {} };
}

/** Local body editing creates immutable revisions through an explicitly owned qualified path. */
export function prepareLocalDefinitionEdit(graph, command) {
    const input = qualifiedInstance(graph, command, {command:true,definitionDraft:true}); if (!input.ok) return input;
    const { candidate, path, chain } = input.data, node = chain.at(-1).node;
    if (!ownsDefinitionPath(candidate, path)) return fail('READ_ONLY_DEFINITION', 'Make an explicit local copy before editing this definition.');
    if (!record(command.expectedRef) || definitionRefKey(command.expectedRef) !== definitionRefKey(node.definition)) return fail('STALE_DEFINITION', 'The local definition changed; prepare the edit again.');
    if (!record(command.draft) || command.draft.id !== node.definition.id) return fail('DEFINITION_REF', 'A local edit must preserve its owned definition ID.');
    return reviseQualified(graph, candidate, path, chain, structuredClone(command.draft), false, compositionIds(candidate));
}

function qualifiedInstance(graph, command, options = {}) {
    const copied=inspectQualifiedRoot(graph);if(!copied.ok)return copied;
    if (!safeWorkflowData(command,{...options,snapshots:copied.data.definitions}) || !record(command)) return fail('INVALID_INSTANCE', 'Expected a plain instance command.');
    const validation = validateGraphStructure(graph); if (!validation.ok) return validation;
    const path = command.instancePath ?? [command.instanceId], chain = definitionChain(graph, path);
    if (!chain) return fail('INVALID_INSTANCE', 'Expected a bounded existing instance path.');
    return { ok: true, data: { candidate: structuredClone(graph), path: [...path], chain } };
}

function reviseQualified(original, candidate, path, chain, leafDraft, copying, ids) {
    let draft = leafDraft;
    const owners = ownershipEntries(candidate), changedRefs = [];
    for (let depth = path.length - 1; depth >= 0; depth--) {
        const prefix = path.slice(0, depth + 1), previous = chain[depth].definition;
        if (depth !== path.length - 1) {
            const childRef = reference(draft);
            draft = structuredClone(previous);
            draft.body.nodes[path[depth + 1]].definition = childRef;
            if (!ownsDefinitionPath(original, prefix)) { draft.id = ids.next('local-definition'); draft.version = 1; }
        }
        const newIdentity = draft.id !== previous.id;
        if (!newIdentity) draft.version = Math.max(...Object.values(candidate.definitions).filter(item => item.id === draft.id).map(item => item.version)) + 1;
        else draft.version = 1;
        delete draft.semanticHash;
        const identity = computeDefinitionIdentity(draft,{snapshots:candidate.definitions}); if (!identity.ok) return identity;
        draft = { ...structuredClone(identity.data.materializedDefinition), semanticHash: identity.data.semanticHash };
        candidate.definitions[definitionRefKey(draft)] = draft;
        changedRefs.push({ instancePath: prefix, before: reference(previous), after: reference(draft) });
        const owner = owners.find(entry => samePath(entry.instancePath, prefix));
        if (owner) owner.definitionId = draft.id; else owners.push({ instancePath: prefix, definitionId: draft.id });
    }
    candidate.nodes[path[0]].definition = reference(draft);
    candidate.nodes[path[0]].localCopy = { definitionId: draft.id };
    reconcileOwners(candidate, owners);
    prunePrivateSnapshots(candidate, new Set([...ownershipEntries(original), ...owners].map(entry => entry.definitionId)));
    const prepared = prepareGraphCandidate(original, candidate);
    return prepared.ok ? { ok: true, data: { ...prepared.data, changedRefs, instancePath: [...path], copying } } : prepared;
}
