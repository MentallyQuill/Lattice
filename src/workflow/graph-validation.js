import { freeze } from './record-data.js?v=0.27.0';
import { isScopedSystemOperation } from './system-capabilities.js?v=0.27.0';
import { validateNodeModifiers } from './modifiers.js?v=0.27.0';
import { ARTIFACT_KINDS, operationFor, describeOperation, portsForNode, phaseForNode } from './catalog.js?v=0.27.0';
import { cloneDefinitionData, computeDefinitionIdentity, definitionRefKey, inspectDefinitionMetadata, describeExposedParameter, nodeBindingOverrideKey, artifactAddressKey } from './definition-data.js?v=0.27.0';
import { samePath, safeId } from './composition-edit.js?v=0.27.0';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const idText = value => typeof value === 'string' && value.length > 0;
const fail = (code, message, nodeId) => ({ ok: false, error: { code, message, ...(nodeId ? { nodeId } : {}) } });
const bindingValid = value => record(value) && ['profileId', 'model'].every(key => value[key] === undefined || value[key] === null || typeof value[key] === 'string');
const optionalFields = (value, keys, accepts) => keys.every(key => value[key] === undefined || accepts(value[key]));
const layoutValid = value => optionalFields(value, ['x', 'y', 'w', 'h', 'width', 'height'], Number.isFinite);
const presentationValid = value => record(value)
    && optionalFields(value, ['title', 'alias'], item => typeof item === 'string')
    && optionalFields(value, ['compact', 'collapsed'], item => typeof item === 'boolean')
    && layoutValid(value);
export const nodeAddressKey = ({ workflowId, instancePath, nodeId }) => JSON.stringify([workflowId, instancePath, nodeId]);

/** Bounded plain authoring data shared by current readers and safe exports. */
export function safeWorkflowData(value) {
    let entries = 0, characters = 0;
    const seen = new Set();
    const visit = (item, depth) => {
        if (++entries > 20000 || depth > 40) return false;
        if (typeof item === 'string') { characters += item.length; return characters <= 2000000; }
        if (item === null || typeof item === 'boolean') return true;
        if (typeof item === 'number') return Number.isFinite(item);
        if (typeof item !== 'object' || seen.has(item)) return false;
        const prototype = Object.getPrototypeOf(item);
        if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) return false;
        seen.add(item);
        for (const [key, property] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
            if (/^(api[_-]?key|api[_-]?token|access[_-]?token|token|password|secret|credentials?|authorization|headers?|provider|endpoint|base[_-]?url)$/i.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key) || !('value' in property) || !visit(property.value, depth + 1)) return false;
        }
        seen.delete(item);
        return true;
    };
    try { return visit(value, 0); } catch { return false; }
}

function controlValid(value, descriptor) {
    return descriptor.type === 'integer' ? Number.isSafeInteger(value) && value >= descriptor.min && value <= descriptor.max
        : descriptor.type === 'number' ? Number.isFinite(value) && value >= descriptor.min && value <= descriptor.max
        : descriptor.type === 'enum' ? descriptor.values.includes(value)
        : descriptor.type === 'object' ? record(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && (descriptor.max === undefined || Object.keys(value).length <= descriptor.max) && cloneDefinitionData(value).ok
        : descriptor.type === 'array' ? Array.isArray(value) && (descriptor.items === 'json' ? cloneDefinitionData(value).ok : value.every(item => typeof item === 'string' || ['string-or-record', 'record', 'context-slot'].includes(descriptor.items) && record(item)))
        : typeof value === descriptor.type;
}

/** Validate one checked graph scope and resolve all its portal aliases before edge checks. */
function inspectScope(graph, { definition, snapshots = {} } = {}) {
    if (!record(graph) || !record(graph.nodes) || !record(graph.wires) || !['groups', 'roles', 'portals', 'definitions'].every(key => record(graph[key] ?? {}))) return fail('MALFORMED_WORKFLOW', 'Expected native graph containers.');
    if (graph.schema !== 3 || graph.runtime !== 2) return fail('UNSUPPORTED_VERSION', 'Expected schema 3 and runtime 2.');
    if (!['native-pre', 'native-post', 'native-unified'].includes(graph.mode)) return fail('WRONG_PHASE', 'Expected an explicit native workflow phase.');
    if (definition && Object.keys(graph.definitions ?? {}).length) return fail('DEFINITION_REF', 'Bundle all pinned snapshots in the owning table, not inside definition bodies.');
    if (definition && graph.localDefinitionOwners !== undefined) return fail('LOCAL_COPY_OWNERSHIP', 'Ownership registries belong only to the root document.');
    if (graph.name !== undefined && typeof graph.name !== 'string' || Object.values(graph.roles ?? {}).some(binding => !bindingValid(binding))) return fail('INVALID_SETTINGS', 'Invalid workflow metadata or role binding.');
    const nodes = Object.values(graph.nodes), wires = Object.values(graph.wires);
    if (nodes.length > 1000 || wires.length > 2000) return fail('MALFORMED_WORKFLOW', 'The graph exceeds traversal limits.');
    for (const [id, group] of Object.entries(graph.groups ?? {})) {
        if (!record(group) || group.id !== id) return fail('INVALID_GROUP', 'Invalid group metadata.');
        if (!optionalFields(group, ['title', 'name', 'description'], value => typeof value === 'string') || !optionalFields(group, ['collapsed'], value => typeof value === 'boolean') || !layoutValid(group) || group.frame !== undefined && (!record(group.frame) || !layoutValid(group.frame))) return fail('INVALID_GROUP', 'Invalid group presentation or layout.');
        if (group.members !== undefined && (!Array.isArray(group.members) || group.members.some(member => !idText(member) || !Object.hasOwn(graph.nodes, member)) || new Set(group.members).size !== group.members.length)) return fail('INVALID_GROUP', 'Invalid group membership.');
        if (group.members && (group.members.some(member => graph.nodes[member]?.inGroup !== id) || nodes.some(node => node?.inGroup === id && !group.members.includes(node.id)))) return fail('INVALID_GROUP', 'Declared membership must agree with node membership.');
    }
    const describedNodes = new Map();
    let memoryCommits = 0;
    for (const [id, node] of Object.entries(graph.nodes)) {
        if (!record(node) || !idText(id) || node.id !== id) return fail('MALFORMED_WORKFLOW', 'Invalid node identity.');
        if (!presentationValid(node) || node.presentation !== undefined && !presentationValid(node.presentation)) return fail('INVALID_SETTINGS', 'Invalid node presentation or layout.', id);
        if (node.enabled !== undefined && typeof node.enabled !== 'boolean' || node.inGroup !== undefined && (!idText(node.inGroup) || !Object.hasOwn(graph.groups ?? {}, node.inGroup))) return fail('INVALID_SETTINGS', 'Invalid enabled/group setting.', id);
        if (node.type !== 'workflow') { const modifiers=validateNodeModifiers(node,[]); if(!modifiers.ok)return {...modifiers,error:{...modifiers.error,nodeId:id}}; }
        if (node.type === 'note') continue;
        if (node.type === 'subgraph-input' || node.type === 'subgraph-output') {
            if (!definition) return fail('ROOT_BOUNDARY', 'Boundary nodes belong inside definitions.', id);
            continue;
        }
        if (node.type === 'subgraph') {
            const checked = inspectInstance(node, snapshots);
            if (!checked.ok) return checked;
            if (node.localCopy !== undefined && (definition || !record(node.localCopy) || Object.keys(node.localCopy).length !== 1 || node.localCopy.definitionId !== node.definition.id)) return fail('LOCAL_COPY_OWNERSHIP', 'Local-copy ownership belongs to one root instance and its exact definition ID.', id);
            if (graph.mode !== 'native-unified' && checked.data.body.mode !== graph.mode) return fail('WRONG_PHASE', 'The instance phase differs from its container.', id);
            continue;
        }
        const described = describeOperation(graph, node);
        if (!described.ok) return { ...described, error: { ...described.error, nodeId: id } };
        describedNodes.set(id, described.data);
        const modifiers=validateNodeModifiers(node,described.data.ports.filter(port=>port.direction==='output'));
        if(!modifiers.ok)return {...modifiers,error:{...modifiers.error,nodeId:id}};
        const operation = described.data.descriptor;
        if (node.operationVersion !== undefined && node.operationVersion !== 1) return fail('UNKNOWN_OPERATION', 'Unknown operation or version.', id);
        if (operation.phase !== phaseForNode(graph, node)) return fail('WRONG_PHASE', 'An operation does not support the containing phase.', id);
        if (definition && operation.rootOnly && !isScopedSystemOperation(node)) return fail('ROOT_ONLY_OPERATION', 'This operation is not eligible for static definitions.', id);
        if (definition && operation.requiresStateInDefinition && !isScopedSystemOperation(node) && !wires.some(wire => wire?.to === id && wire.toPort === 'state')) return fail('ROOT_ONLY_OPERATION', 'This definition operation requires an explicit snapshot input.', id);
        if (operation.id === 'memory' && operation.terminal && node.enabled !== false && ++memoryCommits > 1) return fail('MULTIPLE_MEMORY_COMMITS', 'A root workflow supports one Memory Commit terminal.', id);
        if (!bindingValid(node) || node.modelRole !== undefined && node.modelRole !== null && typeof node.modelRole !== 'string') return fail('INVALID_SETTINGS', 'Invalid model binding.', id);
        for (const [key, descriptor] of Object.entries(operation.controlDescriptors)) if (!controlValid(node[key] === undefined ? descriptor.default : node[key], descriptor)) return fail('INVALID_SETTINGS', `Invalid ${key}.`, id);
        if (node.operation === 'validate-patches' && node.protectedLiterals !== undefined && (!Array.isArray(node.protectedLiterals) || node.protectedLiterals.some(value => typeof value !== 'string'))) return fail('INVALID_SETTINGS', 'Invalid protected literals.', id);
    }
    const metadata = { ...graph, definitions: snapshots, interface: definition?.interface };
    const ports = new Map(nodes.map(node => [node.id, describedNodes.get(node.id)?.ports ?? portsForNode(metadata, node)]));
    const pin = (nodeId, portId, direction) => ports.get(nodeId)?.find(port => port.id === portId && port.direction === direction);
    for (const [id, portal] of Object.entries(graph.portals ?? {})) {
        if (!record(portal) || portal.id !== id || !idText(id) || typeof portal.label !== 'string' || !record(portal.source) || Object.keys(portal.source).some(key => !['nodeId', 'portId'].includes(key)) || !idText(portal.source.nodeId) || !idText(portal.source.portId) || !ARTIFACT_KINDS.includes(portal.kind)) return fail('INVALID_PORTAL', 'Invalid portal publisher metadata.');
        if (!Object.hasOwn(graph.nodes, portal.source.nodeId)) return fail('DANGLING_WIRE', 'A portal refers to a missing local node.');
        const source = pin(portal.source.nodeId, portal.source.portId, 'output');
        if (!source || source.kind !== portal.kind) return fail('INVALID_PORT', 'A portal must publish a matching local output.');
    }
    const resolved = [], incoming = new Set();
    for (const [id, wire] of Object.entries(graph.wires)) {
        if (!record(wire) || wire.id !== id || !idText(id)) return fail('MALFORMED_WORKFLOW', 'Invalid wire identity.');
        if (!idText(wire.to) || !idText(wire.toPort) || wire.loop || wire.port) return fail('INVALID_WIRE', 'Invalid named wire metadata.');
        let from = wire.from, fromPort = wire.fromPort;
        if (wire.route === 'portal') {
            if (!idText(wire.portalId) || !Object.hasOwn(graph.portals ?? {}, wire.portalId)) return fail('MISSING_PORTAL', 'A consumer requires a local portal publisher.');
            if (wire.from !== undefined || wire.fromPort !== undefined) return fail('INVALID_WIRE', 'Portal consumers cannot also specify a direct source.');
            ({ nodeId: from, portId: fromPort } = graph.portals[wire.portalId].source);
        } else if (wire.route !== 'wire' || !idText(from) || !idText(fromPort) || wire.portalId !== undefined) return fail('INVALID_WIRE', 'Expected one direct or portal route.');
        if (!Object.hasOwn(graph.nodes, from) || !Object.hasOwn(graph.nodes, wire.to)) return fail('DANGLING_WIRE', 'A wire refers to a missing local node.');
        const source = pin(from, fromPort, 'output'), destination = pin(wire.to, wire.toPort, 'input');
        if (!source || !destination) return fail('INVALID_PORT', 'A wire requires existing output and input ports.');
        if (source.kind !== destination.kind) return fail('ARTIFACT_KIND', 'These ports carry incompatible artifacts.');
        const key = JSON.stringify([wire.to, wire.toPort]);
        if (incoming.has(key)) return fail('AMBIGUOUS_INPUT', 'A named input accepts one binding.');
        incoming.add(key); resolved.push({ ...wire, from, fromPort });
    }
    const predecessors = new Map(nodes.map(node => [node.id, []]));
    for (const edge of resolved) predecessors.get(edge.to).push(edge.from);
    const visited = new Set(), active = new Set();
    const visit = id => {
        if (active.has(id)) return false;
        if (visited.has(id)) return true;
        active.add(id);
        for (const from of predecessors.get(id)) if (!visit(from)) return false;
        active.delete(id); visited.add(id); return true;
    };
    if (!nodes.some(node => node.type === 'subgraph') && nodes.some(node => !visit(node.id))) return fail('CYCLE', 'Resolved dependencies contain a cycle.');
    return { ok: true, data: { graph, ports, describedNodes, edges: resolved, nodeCount: nodes.length, wireCount: wires.length } };
}

export function validateNamedGraphStructure(graph) {
    const result = inspectExpandedGraph(graph);
    return result.ok ? { ok: true, data: { nodeCount: result.data.nodeCount, wireCount: result.data.wireCount } } : result;
}

function exactSnapshot(ref, snapshots) {
    if (!record(ref) || !idText(ref.id) || !Number.isSafeInteger(ref.version) || ref.version < 1 || typeof ref.semanticHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(ref.semanticHash)) return fail('DEFINITION_REF', 'Expected an exact pinned reference.');
    const key = definitionRefKey(ref);
    return Object.hasOwn(snapshots, key) ? { ok: true, data: snapshots[key] } : fail('MISSING_DEFINITION', 'The exact pinned snapshot is not bundled.');
}

function targetNode(definition, target, snapshots) {
    let graph = definition.body;
    for (const id of target.instancePath) {
        const node = Object.hasOwn(graph.nodes, id) && graph.nodes[id];
        if (node?.type !== 'subgraph') return fail('DEFINITION_PARAMETER', 'A target path must traverse existing subgraph instances.');
        const child = exactSnapshot(node.definition, snapshots);
        if (!child.ok) return child;
        graph = child.data.body;
    }
    const node = Object.hasOwn(graph.nodes, target.nodeId) && graph.nodes[target.nodeId];
    return operationFor(node) ? { ok: true, data: node } : fail('DEFINITION_PARAMETER', 'A target must identify a primitive operation.');
}

function inspectInstance(node, snapshots) {
    const pin = exactSnapshot(node.definition, snapshots);
    if (!pin.ok) return pin;
    const definition = pin.data;
    if (!['parameterOverrides', 'roleOverrides', 'nodeBindingOverrides'].every(key => record(node[key] ?? {}))) return fail('INVALID_OVERRIDE', 'Expected override maps.', node.id);
    for (const [id, value] of Object.entries(node.parameterOverrides ?? {})) {
        const parameter = definition.parameters.find(parameter => parameter.id === id);
        if (!parameter) return fail('INVALID_OVERRIDE', 'Unknown exposed parameter.', node.id);
        const target = targetNode(definition, parameter.target, snapshots);
        if (!target.ok) return target;
        const descriptor = describeExposedParameter(target.data, parameter.target.controlId);
        if (!descriptor.ok || !controlValid(value, descriptor.data)) return fail('INVALID_OVERRIDE', 'Parameter override does not match its catalog type/range.', node.id);
    }
    const roles = new Set(), visited = new Set(), queue = [definition];
    while (queue.length) {
        const item = queue.pop(), key = definitionRefKey(item);
        if (visited.has(key)) continue;
        visited.add(key);
        Object.keys(item.body.roles ?? {}).forEach(role => roles.add(role));
        for (const child of Object.values(item.body.nodes)) {
            const role = child.modelRole ?? operationFor(child)?.modelRole;
            if (role) roles.add(role);
            if (child.type === 'subgraph') { const nested = exactSnapshot(child.definition, snapshots); if (!nested.ok) return nested; queue.push(nested.data); }
        }
    }
    for (const [role, binding] of Object.entries(node.roleOverrides ?? {})) if (!roles.has(role) || !bindingValid(binding)) return fail('INVALID_OVERRIDE', 'Unknown role or invalid role override.', node.id);
    for (const [key, binding] of Object.entries(node.nodeBindingOverrides ?? {})) {
        let tuple; try { tuple = JSON.parse(key); } catch { return fail('INVALID_OVERRIDE', 'Node binding overrides require structural tuple keys.', node.id); }
        if (!Array.isArray(tuple) || tuple.length !== 2 || !Array.isArray(tuple[0]) || tuple[0].length > 8 || !tuple[0].every(idText) || !idText(tuple[1]) || key !== nodeBindingOverrideKey(tuple[0], tuple[1]) || !bindingValid(binding)) return fail('INVALID_OVERRIDE', 'Invalid node binding override.', node.id);
        const target = targetNode(definition, { instancePath: tuple[0], nodeId: tuple[1] }, snapshots);
        if (!target.ok) return target;
    }
    return pin;
}

const ownedDefinitions = new WeakMap();

/** Validate all bundled snapshots, including unused entries, before expanding any instance. */
function inspectSnapshots(value) {
    const copied = cloneDefinitionData(value);
    if (!copied.ok) return copied;
    const snapshots = copied.data;
    if (!record(snapshots)) return fail('DEFINITION_REF', 'Expected a local snapshot table.');
    let nodes = 0, wires = 0;
    for (const [key, snapshot] of Object.entries(snapshots)) {
        const retained = ownedDefinitions.get(value[key]);
        const metadata = retained ? { ok: true } : inspectDefinitionMetadata(snapshot);
        if (!metadata.ok) return metadata;
        if (typeof snapshot.semanticHash !== 'string' || key !== definitionRefKey(snapshot)) return fail('DEFINITION_REF', 'Snapshot keys must match exact references.');
        nodes += Object.keys(snapshot.body.nodes).length; wires += Object.keys(snapshot.body.wires).length;
        if (nodes > 1000 || wires > 2000) return fail('GRAPH_LIMIT', 'Bundled snapshot traversal exceeds limits.');
    }
    const active = new Set(), heights = new Map();
    const visit = key => {
        if (active.has(key)) return fail('DEFINITION_RECURSION', 'Recursive definitions are not supported.');
        if (heights.has(key)) return { ok: true, data: heights.get(key) };
        active.add(key);
        let height = 1;
        for (const node of Object.values(snapshots[key].body.nodes)) if (node?.type === 'subgraph') {
            const child = exactSnapshot(node.definition, snapshots);
            if (!child.ok) return child;
            const result = visit(definitionRefKey(node.definition));
            if (!result.ok) return result;
            height = Math.max(height, result.data + 1);
        }
        if (height > 8) return fail('DEFINITION_DEPTH', 'Definition nesting exceeds depth 8.');
        active.delete(key); heights.set(key, height);
        return { ok: true, data: height };
    };
    for (const key of Object.keys(snapshots)) {
        const closure = visit(key);
        if (!closure.ok) return closure;
    }
    const versions = new Map(), materialized = {};
    for (const [key, snapshot] of Object.entries(snapshots)) {
        const retained = ownedDefinitions.get(value[key]);
        const scope = inspectScope(snapshot.body, { definition: snapshot, snapshots });
        if (!scope.ok) return scope;
        for (const parameter of snapshot.parameters) {
            const target = targetNode(snapshot, parameter.target, snapshots);
            if (!target.ok) return target;
            const control = describeExposedParameter(target.data, parameter.target.controlId);
            if (!control.ok) return control;
        }
        const identity = retained?.identity ?? computeDefinitionIdentity(snapshot);
        if (!identity.ok) return identity;
        const versionKey = JSON.stringify([snapshot.id, snapshot.version]);
        if (versions.has(versionKey) && versions.get(versionKey) !== identity.data.canonicalContent) return fail('DEFINITION_CONFLICT', 'The same ID/version has different canonical content.');
        versions.set(versionKey, identity.data.canonicalContent);
        if (identity.data.semanticHash !== snapshot.semanticHash) return fail('DEFINITION_HASH', 'Snapshot hash does not match its semantic content.');
        const owned = retained ? value[key] : freeze(identity.data.materializedDefinition);
        if (!retained) ownedDefinitions.set(owned, { identity });
        materialized[definitionRefKey(snapshot)] = owned;
    }
    return { ok: true, data: freeze(materialized) };
}

/** Full bounded local and nested definition validation; no host/runtime effects.
 * @returns {import('./types').Result<import('./types').DefinitionDiagnostics>}
 */
export function validateDefinition(definition, snapshots = {}) {
    return inspectDefinition(definition, snapshots, false);
}

/** Read-only library display inventory from the same checked definition expansion.
 * This inspects a real definition and closure, never an invented root workflow.
 * Returned data is owned; it does not freeze or modify either caller input.
 */
export function inspectDefinitionGraph(definition, snapshots = {}) {
    return inspectDefinition(definition, snapshots, true);
}

function inspectDefinition(definition, snapshots, includeExpansion) {
    if (!safeWorkflowData(definition) || !safeWorkflowData(snapshots) || !record(definition) || !record(snapshots)) return fail('DEFINITION_DATA', 'Expected bounded plain definition data.');
    const key = definitionRefKey(definition);
    if (Object.hasOwn(snapshots, key)) {
        const a = computeDefinitionIdentity(definition), b = computeDefinitionIdentity(snapshots[key]);
        if (!a.ok) return a;
        if (!b.ok) return b;
        if (a.data.canonicalContent !== b.data.canonicalContent) return fail('DEFINITION_CONFLICT', 'The supplied snapshot conflicts with its bundled copy.');
    }
    const prepared = prepareDefinitionRegistry({ ...snapshots, [key]: definition });
    if (!prepared.ok) return prepared;
    const inspected = inspectPreparedDefinition(prepared.data, definition);
    if (!inspected.ok) return inspected;
    if (includeExpansion) return structuredClone(inspected);
    const { expansion, ...diagnostics } = inspected.data;
    return { ok: true, data: diagnostics };
}

const preparedRegistries = new WeakMap();
const registryTables = new WeakMap();
/** Admit the complete combination once. Only owned immutable tables can bypass admission. */
export function prepareDefinitionRegistry(snapshots) {
    const retained = registryTables.get(snapshots);
    if (retained) return { ok: true, data: retained };
    if (!safeWorkflowData(snapshots) || !record(snapshots)) return fail('DEFINITION_DATA', 'Expected bounded plain definition data.');
    const checked = inspectSnapshots(snapshots);
    if (!checked.ok) return checked;
    const expansions = new Map();
    for (const [key, item] of Object.entries(checked.data)) {
        const owned = ownedDefinitions.get(item);
        const closure = [], seen = new Set();
        const collect = snapshot => {
            if (seen.has(snapshot)) return;
            seen.add(snapshot); closure.push(snapshot);
            for (const node of Object.values(snapshot.body.nodes)) if (node.type === 'subgraph') collect(checked.data[definitionRefKey(node.definition)]);
        };
        collect(item);
        const retained = owned.expansion && owned.closure.length === closure.length && closure.every((snapshot, i) => snapshot === owned.closure[i]);
        const expanded = retained ? { ok: true, data: owned.expansion } : expandChecked(item.body, checked.data, item);
        if (!expanded.ok) return expanded;
        const expansion = freeze(expanded.data);
        owned.expansion = expansion; owned.closure = closure;
        expansions.set(key, expansion);
    }
    const registry = freeze({ snapshots: checked.data });
    preparedRegistries.set(registry, { expansions, inspections: new Map() });
    registryTables.set(registry.snapshots, registry);
    return { ok: true, data: registry };
}
/** Owned diagnostics are qualified by the whole registry, including local presentation/bindings. */
export function inspectPreparedDefinition(registry, ref) {
    const owned = preparedRegistries.get(registry);
    if (!owned) return fail('INVALID_PREPARED_REGISTRY', 'Use an admitted definition registry.');
    if (!safeWorkflowData(ref) || !record(ref)) return fail('DEFINITION_REF', 'Expected an exact definition reference.');
    const key = definitionRefKey(ref), snapshot = registry.snapshots[key];
    if (!snapshot) return fail('DEFINITION_REF', 'The exact definition is absent from the admitted registry.');
    if (owned.inspections.has(key)) return owned.inspections.get(key);
    const ownExpansion = owned.expansions.get(key), parameterDescriptors = {};
    for (const parameter of snapshot.parameters) {
        const unit = ownExpansion.primitives.find(unit => unit.address.nodeId === parameter.target.nodeId && JSON.stringify(unit.address.instancePath) === JSON.stringify(parameter.target.instancePath));
        const descriptor = describeExposedParameter(unit.node, parameter.target.controlId);
        if (!descriptor.ok) return descriptor;
        parameterDescriptors[parameter.id] = descriptor.data;
    }
    const result = freeze({ ok: true, data: { ref: { id: snapshot.id, version: snapshot.version, semanticHash: snapshot.semanticHash }, definition: snapshot, interface: snapshot.interface, parameters: snapshot.parameters, parameterDescriptors, nodeCount: ownExpansion.nodeCount, wireCount: ownExpansion.wireCount, expansion: ownExpansion } });
    owned.inspections.set(key, result); return result;
}

/** Checked structural inventory shared by authoring validation and execution planning. */
export function inspectExpandedGraph(graph) {
    if (!safeWorkflowData(graph) || !record(graph)) return fail('MALFORMED_WORKFLOW', 'Expected bounded plain workflow data.');
    const preparedRegistry = prepareDefinitionRegistry(graph.definitions ?? {});
    if (!preparedRegistry.ok) return preparedRegistry;
    const checked = { ok: true, data: preparedRegistry.data.snapshots };
    const scope = inspectScope(graph, { snapshots: checked.data });
    if (!scope.ok) return scope;
    // Registry admission already checked expanded topology for every unused snapshot.
    const expanded = expandChecked(graph, checked.data);
    if (!expanded.ok) return expanded;
    const registry = graph.localDefinitionOwners ?? [];
    if (!Array.isArray(registry) || registry.length > 1000) return fail('LOCAL_COPY_OWNERSHIP', 'Expected a bounded structural ownership registry.');
    const owners = [];
    for (const entry of registry) {
        if (!record(entry) || Object.keys(entry).some(key => !['instancePath', 'definitionId'].includes(key)) || !Array.isArray(entry.instancePath) || !entry.instancePath.length || entry.instancePath.length > 8 || !entry.instancePath.every(safeId) || !safeId(entry.definitionId) || owners.some(other => samePath(other.instancePath, entry.instancePath) || other.definitionId === entry.definitionId)) return fail('LOCAL_COPY_OWNERSHIP', 'Ownership paths and definition IDs must be unique.');
        owners.push(entry);
    }
    for (const node of Object.values(graph.nodes)) if (node.type === 'subgraph' && node.localCopy) {
        const existing = owners.find(entry => samePath(entry.instancePath, [node.id]));
        if (existing && existing.definitionId !== node.localCopy.definitionId) return fail('LOCAL_COPY_OWNERSHIP', 'Root shorthand and registry ownership must agree.');
        if (!existing) owners.push({ instancePath: [node.id], definitionId: node.localCopy.definitionId });
    }
    for (const owner of owners) {
        const occurrences = expanded.data.instances.filter(item => item.definition.id === owner.definitionId);
        if (occurrences.length !== 1 || !samePath(occurrences[0].instancePath, owner.instancePath)) return fail('LOCAL_COPY_OWNERSHIP', 'Each owned ID must have one exact live instance path.');
        for (let depth = 1; depth < owner.instancePath.length; depth++) if (!owners.some(entry => samePath(entry.instancePath, owner.instancePath.slice(0, depth)))) return fail('LOCAL_COPY_OWNERSHIP', 'Every private child requires privately owned ancestor paths.');
    }
    return expanded;
}

function expandChecked(root, snapshots, rootDefinition) {
    const workflowId = typeof root.id === 'string' ? root.id : 'root';
    const primitives = [], hierarchy = [], instances = [], scopes = [], boundaryMappings = [], edges = [], unresolvedEdges = [], virtual = new Set(), blocked = new Set();
    const pins = new Map(), incoming = new Map(), outputSources = new Map(), stageCapabilities = new Map();
    let nodeCount = 0, wireCount = 0;
    const address = (path, nodeId, portId) => ({ workflowId, instancePath: [...path], nodeId, ...(portId === undefined ? {} : { portId }) });
    const addPin = (at, port, isVirtual) => { const key = artifactAddressKey(at); pins.set(key, { address: at, ...port }); if (isVirtual) virtual.add(key); };
    const putEdge = (from, to, provenance) => {
        const key = artifactAddressKey(to);
        if (incoming.has(key)) return fail('AMBIGUOUS_INPUT', 'Expanded input has multiple bindings.', to.nodeId);
        incoming.set(key, { from, to, provenance });
        return { ok: true, data: null };
    };
    const inactiveOutputs = [];
    const visit = (saved, path, definition, contexts = [], ancestorEnabled = true, inheritedRoles = {}) => {
        if (path.length > 8) return fail('DEFINITION_DEPTH', 'Instance nesting exceeds depth 8.');
        nodeCount += Object.keys(saved.nodes ?? {}).length; wireCount += Object.keys(saved.wires ?? {}).length;
        if (nodeCount > 1000 || wireCount > 2000) return fail(path.length || rootDefinition ? 'GRAPH_LIMIT' : 'MALFORMED_WORKFLOW', 'Expanded graph traversal exceeds 1,000 nodes or 2,000 wires.');
        const graph = structuredClone(saved);
        const ownRoles = graph.roles ?? {};
        graph.roles = structuredClone(inheritedRoles);
        for (const [role, binding] of Object.entries(ownRoles)) graph.roles[role] = { ...(Object.hasOwn(graph.roles, role) ? graph.roles[role] : {}), ...binding };
        const localContext = contexts.at(-1);
        if (localContext) {
            graph.roles ??= {};
            for (const [role, binding] of Object.entries(localContext.node.roleOverrides ?? {})) graph.roles[role] = { ...(Object.hasOwn(graph.roles, role) ? graph.roles[role] : {}), ...binding };
        }
        for (const node of Object.values(graph.nodes ?? {})) {
            const operation = operationFor(node, { phase: phaseForNode(graph, node), mode: graph.mode });
            if (!operation) continue;
            for (const [id, descriptor] of Object.entries(operation.controlDescriptors)) if (node[id] === undefined && (operation.family !== 'Introspection' || Object.hasOwn(operation.defaults, id))) node[id] = descriptor.default !== null && typeof descriptor.default === 'object' ? structuredClone(descriptor.default) : descriptor.default;
            node.operationVersion ??= 1;
            node.modelRole ??= operation.modelRole;
            const explicitBinding = {};
            for (const context of [...contexts].reverse()) {
                const relativePath = path.slice(context.path.length);
                for (const [id, value] of Object.entries(context.node.parameterOverrides ?? {})) {
                    const parameter = context.definition.parameters.find(parameter => parameter.id === id);
                    if (parameter.target.nodeId === node.id && JSON.stringify(parameter.target.instancePath) === JSON.stringify(relativePath)) node[parameter.target.controlId] = structuredClone(value);
                }
                const bindingKey = nodeBindingOverrideKey(relativePath, node.id);
                if (Object.hasOwn(context.node.nodeBindingOverrides ?? {}, bindingKey)) Object.assign(explicitBinding, context.node.nodeBindingOverrides[bindingKey]);
            }
            const role = graph.roles?.[node.modelRole] ?? {};
            // A node-selected profile uses its own model unless a node/instance model overrides it.
            const profileOverride = node.profileId != null || Object.hasOwn(explicitBinding, 'profileId');
            node.profileId = node.profileId ?? role.profileId ?? null;
            node.model = node.model ?? (profileOverride ? null : role.model ?? null);
            Object.assign(node, explicitBinding);
        }
        const scope = inspectScope(graph, { definition, snapshots });
        if (!scope.ok) return scope;
        scopes.push({ instancePath: [...path], graph });
        const parent = path.length ? address(path.slice(0, -1), path.at(-1)) : undefined;
        for (const node of Object.values(graph.nodes)) {
            if (node.type === 'note') continue;
            const at = address(path, node.id), operation = scope.data.describedNodes.get(node.id)?.descriptor;
            const enabled = ancestorEnabled && node.enabled !== false;
            const ports = scope.data.ports.get(node.id);
            for (const port of ports) {
                const pinAddress = { ...at, portId: port.id };
                addPin(pinAddress, port, !operation);
                if (ancestorEnabled && node.enabled === false && node.type !== 'subgraph' && !operation) blocked.add(artifactAddressKey(pinAddress));
            }
            if (operation) {
                const requestBound = typeof operation.requestBound === 'function' ? operation.requestBound(node) : operation.requestBound;
                const unit = { address: at, node, phase: operation.phase, enabled, systemDisabled: !ancestorEnabled, requestBound: ancestorEnabled ? requestBound : 0, inputPorts: ports.filter(port => port.direction === 'input'), outputPorts: ports.filter(port => port.direction === 'output'), terminal: operation.terminal };
                // A pinned legacy phase remains an explicit stage contract. Only an
                // undeclared, compatible unified operation can inherit a later stage.
                if (root.mode === 'native-unified') stageCapabilities.set(nodeAddressKey(at), {
                    nativeBoundary: operation.nativeBoundary === true,
                    inferPost: graph.mode === 'native-unified' && node.phase === undefined && phaseForNode({ ...graph, mode: 'native-post' }, node) === 'post' && !!operationFor(node, { phase: 'post', mode: 'native-unified' }),
                });
                primitives.push(unit); hierarchy.push({ address: at, kind: 'primitive', ...(parent ? { parent } : {}) });
            } else if (!ancestorEnabled && node.type === 'subgraph-output') {
                inactiveOutputs.push({ address: at, node, ports, parent, phase: graph.mode === 'native-post' ? 'post' : 'pre' });
            } else if (node.type === 'subgraph') {
                instances.push({ instancePath: [...path, node.id], definition: node.definition });
                hierarchy.push({ address: at, kind: 'instance', ...(parent ? { parent } : {}) });
                const child = snapshots[definitionRefKey(node.definition)], childPath = [...path, node.id];
                const nested = visit(child.body, childPath, child, [...contexts, { path: childPath, node, definition: child }], enabled, graph.roles);
                if (!nested.ok) return nested;
                for (const port of child.interface) {
                    const outer = { ...at, portId: port.id }, inner = address(childPath, port.boundaryNodeId, port.direction === 'input' ? 'out' : 'in');
                    const edge = port.direction === 'input' ? putEdge(outer, inner) : putEdge(inner, outer);
                    if (!edge.ok) return edge;
                    boundaryMappings.push({ instance: at, portId: port.id, direction: port.direction, boundary: inner, required: port.required });
                }
            }
        }
        for (const edge of scope.data.edges) {
            const result = putEdge(address(path, edge.from, edge.fromPort), address(path, edge.to, edge.toPort), { wireId: edge.id, ...(edge.route === 'portal' ? { portalId: edge.portalId } : {}), instancePath: [...path] });
            if (!result.ok) return result;
        }
        return { ok: true, data: null };
    };
    const visited = visit(root, [], rootDefinition);
    if (!visited.ok) return visited;
    // Every disabled exposed output publishes skipped state and severs upstream demand. These
    // execution records are derived from ancestor participation, never graph fields.
    for (const output of inactiveOutputs) {
        const key = artifactAddressKey({ ...output.address, portId: 'in' });
        virtual.delete(key);
        primitives.push({ address: output.address, node: { ...output.node, operation: 'subgraph-output' }, phase: output.phase, enabled: false, systemDisabled: true, requestBound: 0, inputPorts: [], outputPorts: output.ports.map(port => ({ ...port, direction: 'output' })), terminal: false });
        hierarchy.push({ address: output.address, kind: 'primitive', parent: output.parent });
    }
    const active = new Set(), missingSources = new Map();
    const exposedOutputs = new Map(boundaryMappings.filter(mapping => mapping.direction === 'output').map(mapping => {
        const at = { ...mapping.instance, portId: mapping.portId }; return [artifactAddressKey(at), at];
    }));
    const sourceFor = at => {
        const key = artifactAddressKey(at);
        if (!virtual.has(key)) return at;
        if (outputSources.has(key)) return outputSources.get(key);
        if (active.has(key)) throw new Error('cycle');
        active.add(key);
        const edge = incoming.get(key), source = edge ? sourceFor(edge.from) : null;
        if (edge && blocked.has(artifactAddressKey(edge.from))) blocked.add(key);
        if (!source) {
            const origin = (edge && missingSources.get(artifactAddressKey(edge.from))) || exposedOutputs.get(key);
            if (origin) missingSources.set(key, origin);
        }
        active.delete(key); outputSources.set(key, source); return source;
    };
    try {
        for (const key of virtual) sourceFor(pins.get(key).address);
        for (const unit of primitives) for (const port of unit.inputPorts) {
            const to = { ...unit.address, portId: port.id }, edge = incoming.get(artifactAddressKey(to));
            if (!edge) continue;
            const from = sourceFor(edge.from);
            if (from) edges.push({ from, to, provenance: edge.provenance, disabled: blocked.has(artifactAddressKey(edge.from)) });
            else if (missingSources.has(artifactAddressKey(edge.from))) unresolvedEdges.push({ from: missingSources.get(artifactAddressKey(edge.from)), to });
        }
        for (const mapping of boundaryMappings) {
            const at = { ...mapping.instance, portId: mapping.portId };
            mapping.source = sourceFor(at); mapping.disabled = blocked.has(artifactAddressKey(at)) || blocked.has(artifactAddressKey(mapping.boundary));
        }
    } catch { return fail('CYCLE', 'Expanded boundary dependencies contain a cycle.'); }
    const byKey = new Map(primitives.map(unit => [nodeAddressKey(unit.address), unit]));
    const predecessors = new Map(primitives.map(unit => [nodeAddressKey(unit.address), []]));
    for (const edge of edges) predecessors.get(nodeAddressKey(edge.to)).push(byKey.get(nodeAddressKey(edge.from)));
    const ordered = [], complete = new Set(), visiting = new Set();
    const order = unit => {
        const key = nodeAddressKey(unit.address);
        if (visiting.has(key)) return false;
        if (complete.has(key)) return true;
        visiting.add(key);
        for (const upstream of predecessors.get(key)) if (!order(upstream)) return false;
        visiting.delete(key); complete.add(key); ordered.push(unit); return true;
    };
    if (primitives.some(unit => !order(unit))) return fail('CYCLE', 'Expanded primitive dependencies contain a cycle.');
    if (root.mode === 'native-unified') for (const unit of ordered) {
        const key = nodeAddressKey(unit.address);
        const receivesPost = predecessors.get(key).some(upstream => upstream.phase === 'post' || stageCapabilities.get(nodeAddressKey(upstream.address))?.nativeBoundary);
        if (!receivesPost || unit.phase === 'post') continue;
        if (!stageCapabilities.get(key)?.inferPost) return fail('INVALID_STAGE_DEPENDENCY', 'Preparation cannot consume native reply or Post-stage output. Move a compatible node to Post or remove the reverse dependency.', unit.node.id);
        unit.phase = 'post';
    }
    return { ok: true, data: { workflowId, phase: root.mode.slice(7), primitives: ordered, edges, unresolvedEdges, hierarchy, instances, scopes, boundaryMappings, pins: [...pins.values()], nodeCount, wireCount } };
}
