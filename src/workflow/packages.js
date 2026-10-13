import { ACTIVE_PROFILE_ID } from './model-profiles.js?v=0.27.2';
import { safeWorkflowData, validateGraphStructure } from './contracts.js?v=0.27.2';
import { OPERATIONS, operationFor, phaseForNode } from './catalog.js?v=0.27.2';
import { cloneDefinitionData, computeDefinitionIdentity, definitionRefKey, inspectDefinitionMetadata, validateDefinition } from './definitions.js?v=0.27.2';
const limit = 2000000;
const fail = (code, message) => ({ ok: false, error: { code, message } });
const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
const portableBindings = bindings => Object.fromEntries(Object.entries(bindings ?? {}).map(([id, binding]) => [id, { ...pick(binding, ['model']), ...(Object.hasOwn(binding, 'profileId') ? { profileId: binding.profileId === ACTIVE_PROFILE_ID ? ACTIVE_PROFILE_ID : null } : {}) }]));
// Parameter values are authored JSON unless the exact exposed control is a binding.
// Resolve against the original flat table before any portable hashes are changed.
function exposedParameterNode(definition, parameter, snapshots) {
    if (!Array.isArray(parameter?.target?.instancePath)) return null;
    let graph = definition.body;
    for (const id of parameter.target.instancePath) {
        const instance = graph?.nodes?.[id];
        if (instance?.type !== 'subgraph') return null;
        if (!instance.definition || typeof instance.definition !== 'object') return null;
        const child = snapshots[definitionRefKey(instance.definition)];
        if (!child) return null;
        graph = child.body;
    }
    return graph?.nodes?.[parameter.target.nodeId] ?? null;
}
function instanceParameterTargets(node, snapshots) {
    if (!node.definition || typeof node.definition !== 'object' || Array.isArray(node.definition)) return [];
    const definition = snapshots[definitionRefKey(node.definition)];
    return Object.entries(node.parameterOverrides ?? {}).map(([id, value]) => {
        const parameter = Array.isArray(definition?.parameters) ? definition.parameters.find(parameter => parameter?.id === id) : null;
        return { id, value, controlId: parameter?.target?.controlId, target: parameter ? exposedParameterNode(definition, parameter, snapshots) : null };
    });
}
function definitionReferences(node, snapshots) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
    const refs = node.type === 'subgraph' ? [node.definition] : node.type === 'workflow' && node.operation === 'for-each' ? [node.helper] : [];
    if (node.type === 'subgraph') for (const parameter of instanceParameterTargets(node, snapshots)) {
        if (parameter.target?.operation === 'for-each' && parameter.controlId === 'helper') refs.push(parameter.value);
    }
    return refs;
}
function portableProjection(snapshots) {
    const projected = new Map(), active = new Set();
    const context = {
        reference(reference) {
            const key = definitionRefKey(reference), original = snapshots[key];
            return pick(original ? context.definition(original) : reference, ['id', 'version', 'semanticHash']);
        },
        parameters(node) {
            return Object.fromEntries(instanceParameterTargets(node, snapshots).map(parameter => [parameter.id,
                parameter.target?.operation === 'fast-decision' && ['fastConnectionId', 'fallbackProfileId'].includes(parameter.controlId) ? ''
                    : parameter.target?.operation === 'fast-decision' && parameter.controlId === 'fallbackEnabled' ? false
                    : parameter.target?.operation === 'for-each' && parameter.controlId === 'roleOverrides' ? portableBindings(parameter.value)
                    : parameter.target?.operation === 'for-each' && parameter.controlId === 'helper' ? context.reference(parameter.value) : parameter.value,
            ]));
        },
        definition(definition) {
            const key = definitionRefKey(definition);
            if (projected.has(key)) return projected.get(key);
            if (active.has(key)) throw new Error('Recursive portable definition references are not supported.');
            active.add(key);
            const copy = pick(definition, ['id', 'version', 'semanticHash', 'name', 'description']);
            copy.interface = definition.interface.map(port => pick(port, ['id', 'label', 'direction', 'kind', 'required', 'cardinality', 'boundaryNodeId']));
            copy.parameters = definition.parameters.map(parameter => ({ ...pick(parameter, ['id', 'label']), target: pick(parameter.target, ['instancePath', 'nodeId', 'controlId']) }));
            copy.body = portableNativeDocument(definition.body, context);
            const materialized = computeDefinitionIdentity(copy,{snapshots:{...snapshots,...Object.fromEntries([...projected.values()].map(item=>[definitionRefKey(item),item]))}});
            if (!materialized.ok) throw new Error(materialized.error.message);
            const portable = structuredClone({ ...materialized.data.materializedDefinition, semanticHash: materialized.data.semanticHash });
            projected.set(key, portable);
            active.delete(key);
            return portable;
        },
    };
    return context;
}
function portableNativeDocument(graph, context) {
    const copy = pick(graph, ['id', 'name', 'description', 'schema', 'runtime', 'mode', 'nodes', 'wires', 'groups', 'roles', 'portals', 'definitions', 'template', 'view', 'createdAt', 'updatedAt']);
    copy.nodes = Object.fromEntries(Object.entries(graph.nodes).map(([id, node]) => [id, pick(node, [
        'id', 'type', 'operation', 'operationVersion', 'modifiers', 'title', 'enabled', 'x', 'y', 'w', 'h', 'width', 'height', 'collapsed', 'compact', 'inGroup', 'color',
        'profileId', 'model', 'modelRole', 'artifactKind', 'phase', 'alias', ...(node.type === 'note' ? ['content', 'commentFrame', 'moveContents'] : []),
        ...(node.type === 'subgraph' ? ['definition', 'parameterOverrides', 'roleOverrides', 'nodeBindingOverrides'] : []),
        ...(['subgraph-input', 'subgraph-output'].includes(node.type) ? ['interfacePortId'] : []),
        ...((OPERATIONS[node.operation]?.family === 'Introspection' ? operationFor(node, { phase: phaseForNode(graph, node), mode: graph.mode }) : OPERATIONS[node.operation])?.controls ?? []), ...(node.operation === 'validate-patches' ? ['protectedLiterals'] : []),
    ])]));
    for (const [id, node] of Object.entries(copy.nodes)) {
        if (Object.hasOwn(node, 'profileId') && node.profileId !== ACTIVE_PROFILE_ID) node.profileId = null;
        if (node.type === 'workflow' && node.operation === 'fast-decision') {
            node.fastConnectionId = '';
            node.fallbackProfileId = '';
            node.fallbackEnabled = false;
        }
        if (node.type === 'workflow' && node.operation === 'for-each') {
            if (Object.hasOwn(node, 'roleOverrides')) node.roleOverrides = portableBindings(node.roleOverrides);
            if (Object.hasOwn(node, 'helper')) node.helper = context.reference(node.helper);
        }
        if (node.type === 'subgraph') {
            if (Object.hasOwn(node, 'parameterOverrides')) node.parameterOverrides = context.parameters(graph.nodes[id]);
            node.definition = context.reference(node.definition);
            node.roleOverrides = portableBindings(node.roleOverrides);
            node.nodeBindingOverrides = portableBindings(node.nodeBindingOverrides);
        }
    }
    copy.wires = Object.fromEntries(Object.entries(graph.wires).map(([id, wire]) => [id, pick(wire, ['id', 'route', 'from', 'fromPort', 'to', 'toPort', 'portalId'])]));
    if (graph.roles) copy.roles = portableBindings(graph.roles);
    if (graph.portals) copy.portals = Object.fromEntries(Object.entries(graph.portals).map(([id, portal]) => {
        if (Object.keys(portal.source).some(key => !['nodeId', 'portId'].includes(key))) throw new Error('Portal sources must be local endpoints.');
        return [id, { ...pick(portal, ['id', 'label', 'kind']), source: pick(portal.source, ['nodeId', 'portId']) }];
    }));
    if (graph.definitions) copy.definitions = Object.fromEntries(Object.values(graph.definitions).map(definition => {
        const portable = context.definition(definition);
        return [definitionRefKey(portable), portable];
    }));
    if (graph.groups) copy.groups = Object.fromEntries(Object.entries(graph.groups).map(([id, group]) => {
        const portable = pick(group, ['id', 'title', 'name', 'description', 'x', 'y', 'w', 'h', 'width', 'height', 'color', 'collapsed', 'members']);
        if (group.frame) portable.frame = pick(group.frame, ['x', 'y', 'w', 'h']);
        return [id, portable];
    }));
    if (graph.view) copy.view = pick(graph.view, ['x', 'y', 'zoom']);
    if (graph.template) copy.template = pick(graph.template, ['id', 'version']);
    return copy;
}
function portableGraph(graph) {
    return structuredClone(portableNativeDocument(graph, portableProjection(graph.definitions ?? {})));
}
/** The caller serializes this envelope for download. No host state is consulted. */
export function exportWorkflow(graph) {
    if (!safeWorkflowData(graph)) throw new Error('Expected a bounded plain workflow graph.');
    const structure = validateGraphStructure(graph);
    if (!structure.ok) throw new Error(structure.error.message);
    const portable = portableGraph(graph);
    const validation = validateGraphStructure(portable);
    if (!validation.ok) throw new Error(validation.error.message);
    const envelope = { kind: 'lattice-workflow', schema: 2, minRuntime: 2, graph: portable };
    if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > limit) throw new Error('Workflow JSON must be at most 2,000,000 UTF-8 bytes.');
    return envelope;
}
/** Parsing and preflight are pure; settings change only after caller acceptance. */
export function parseWorkflow(json) {
    const parsed = parseWorkflowFragment(json);
    if (parsed.ok && parsed.data.mode !== 'native-unified') return fail('WRONG_PHASE', 'Root workflow imports require a unified workflow. Retired originals are recovery data only.');
    return parsed;
}
/** Clipboard fragments from pinned stage bodies carry no root execution authority. */
export function parseWorkflowFragment(json) {
    if (typeof json !== 'string' || json.length > limit || new TextEncoder().encode(json).byteLength > limit) return fail('MALFORMED_WORKFLOW', 'Workflow JSON must be at most 2,000,000 UTF-8 bytes.');
    let envelope;
    try { envelope = JSON.parse(json); } catch { return { ok: false, error: { code: 'INVALID_JSON', message: 'That is not valid workflow JSON.' } }; }
    if (!safeWorkflowData(envelope)) return { ok: false, error: { code: 'MALFORMED_WORKFLOW', message: 'Invalid workflow package data.' } };
    if (envelope?.kind !== 'lattice-workflow' || envelope.schema !== 2 || envelope.minRuntime !== 2) return fail('UNSUPPORTED_PACKAGE', 'Expected a Lattice workflow package with schema 2 and minRuntime 2.');
    const structure = validateGraphStructure(envelope.graph);
    if (!structure.ok) return structure;
    let portable;
    try { portable = portableGraph(envelope.graph); } catch { return fail('MALFORMED_WORKFLOW', 'Malformed workflow package containers.'); }
    const validation = validateGraphStructure(portable);
    if (!validation.ok) return validation;
    return { ok: true, data: portable };
}

/** Select a checked exact closure for a standalone export or atomic shelf save.
 * Unrelated snapshots never enter the returned package; no source or saved pin changes.
 * @returns {import('./types').Result<{definition: import('./types').DefinitionSnapshot, definitions: import('./types').SnapshotTable}>}
 */
export function selectSubgraphClosure(definition, snapshots = {}) {
    const table = cloneDefinitionData(snapshots);
    if (!table.ok) return table;
    const top = cloneDefinitionData(definition,{snapshots:table.data});
    if (!top.ok) return top;
    if (!table.data || typeof table.data !== 'object' || Array.isArray(table.data)) return fail('DEFINITION_DATA', 'Expected a plain pinned snapshot table.');
    const metadata = inspectDefinitionMetadata(top.data,{snapshots:table.data});
    if (!metadata.ok) return metadata;
    const topKey = definitionRefKey(top.data), selected = {}, visited = new Set(), pending = [top.data];
    if (Object.hasOwn(table.data, topKey)) selected[topKey] = table.data[topKey];
    while (pending.length) {
        const item = pending.pop(), checked = inspectDefinitionMetadata(item,{snapshots:table.data});
        if (!checked.ok) return checked;
        const key = definitionRefKey(item);
        if (visited.has(key)) continue;
        visited.add(key);
        for (const node of Object.values(item.body.nodes)) for (const reference of definitionReferences(node, table.data)) {
            if (!reference || typeof reference !== 'object' || Array.isArray(reference)) return fail('DEFINITION_REF', 'An instance or helper requires an exact pinned reference.');
            const childKey = definitionRefKey(reference);
            if (!Object.hasOwn(table.data, childKey)) return fail('MISSING_DEFINITION', 'The exact pinned snapshot is not bundled.');
            selected[childKey] = table.data[childKey];
            pending.push(table.data[childKey]);
        }
    }
    const validation = validateDefinition(top.data, selected);
    if (!validation.ok) return validation;
    delete selected[topKey];
    return cloneDefinitionData({ definition: validation.data.definition, definitions: selected });
}

/** Portable standalone snapshots use one flat, local table for the complete pinned closure. */
export function exportSubgraph(definition, snapshots = {}) {
    const table=cloneDefinitionData(snapshots);if(!table.ok)throw new Error(table.error.message);snapshots=table.data;
    if (!safeWorkflowData(definition,{snapshots}) || !safeWorkflowData(snapshots)) throw new Error('Expected bounded plain subgraph data.');
    const closure = selectSubgraphClosure(definition, snapshots);
    if (!closure.ok) throw new Error(closure.error.message);
    const context = portableProjection({ ...closure.data.definitions, [definitionRefKey(closure.data.definition)]: closure.data.definition });
    const portable = context.definition(closure.data.definition), definitions = Object.fromEntries(Object.values(closure.data.definitions).map(item => {
        const definition = context.definition(item);
        return [definitionRefKey(definition), definition];
    }));
    const validation = validateDefinition(portable, definitions);
    if (!validation.ok) throw new Error(validation.error.message);
    const envelope = { kind: 'lattice-subgraph', schema: 1, minRuntime: 2, definition: portable, definitions };
    if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > limit) throw new Error('Subgraph JSON must be at most 2,000,000 UTF-8 bytes.');
    return envelope;
}
export function parseSubgraph(json) {
    if (typeof json !== 'string' || json.length > limit || new TextEncoder().encode(json).byteLength > limit) return fail('MALFORMED_WORKFLOW', 'Subgraph JSON must be at most 2,000,000 UTF-8 bytes.');
    let envelope;
    try { envelope = JSON.parse(json); } catch { return fail('INVALID_JSON', 'That is not valid subgraph JSON.'); }
    if (!safeWorkflowData(envelope)) return fail('DEFINITION_DATA', 'Invalid plain subgraph package data.');
    if (envelope?.kind !== 'lattice-subgraph' || envelope.schema !== 1 || envelope.minRuntime !== 2) return fail('UNSUPPORTED_PACKAGE', 'Unsupported subgraph package/runtime pair.');
    try {
        const closure = selectSubgraphClosure(envelope.definition, envelope.definitions ?? {});
        if (!closure.ok) return closure;
        const context = portableProjection({ ...closure.data.definitions, [definitionRefKey(closure.data.definition)]: closure.data.definition });
        const definition = context.definition(closure.data.definition), definitions = Object.fromEntries(Object.values(closure.data.definitions).map(item => {
            const portable = context.definition(item);
            return [definitionRefKey(portable), portable];
        }));
        const validation = validateDefinition(definition, definitions);
        return validation.ok ? { ok: true, data: { definition: validation.data.definition, definitions } } : validation;
    } catch { return fail('DEFINITION_DATA', 'Malformed subgraph package containers.'); }
}
