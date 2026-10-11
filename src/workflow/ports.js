import { ownJsonData } from './semantic-json-data.js?v=0.27.0';
import { safeWorkflowData, validateGraphStructure } from './contracts.js?v=0.27.0';
import { cloneWorkflowDocument } from './document.js?v=0.27.0';
import { operationFor, describeOperation, semanticControlsForNode, phaseForNode } from './catalog.js?v=0.27.0';
import { INTROSPECTION_NATIVE_OPERATIONS, introspectionDefaults } from './introspection/native.js?v=0.27.0';
export { portsForNode } from './catalog.js?v=0.27.0';

const fail = (code, message) => ({ ok: false, error: { code, message } });
const endpoint = value => value && typeof value === 'object' && !Array.isArray(value) && typeof value.nodeId === 'string' && typeof value.portId === 'string';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

/** Pure current execution identity excludes presentation and includes effective bindings. */
export function graphSemanticSignature(graph) {
    if (!graph) return 'null';
    const binding = value => value && typeof value === 'object' && !Array.isArray(value) ? { profileId: value.profileId ?? null, model: value.model ?? null } : value;
    const inheritedBinding = value => value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(['profileId', 'model'].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) : binding(value);
    const nodes = Object.entries(graph.nodes ?? {}).filter(([, node]) => node.type !== 'note').map(([key, node]) => {
        const operation = operationFor(node, { phase: phaseForNode(graph, node), mode: graph.mode });
        const controls = semanticControlsForNode(node, operation);
        if (node.operation === 'validate-patches') controls.protectedLiterals = node.protectedLiterals === undefined ? [] : node.protectedLiterals;
        return { key, id: node.id, type: node.type, operation: node.operation, ...(graph.mode==='native-unified'?{phase:phaseForNode(graph,node)}:{}), operationVersion: node.operationVersion === undefined ? 1 : node.operationVersion, enabled: node.enabled !== false, modelRole: node.modelRole ?? operation?.modelRole ?? null, ...binding(node), controls,
            ...(node.modifiers === undefined ? {} : { modifiers: node.modifiers }),
            ...(node.operation === 'reroute' ? { artifactKind: node.artifactKind, phase: node.phase } : {}),
            ...(node.type === 'subgraph' ? { definition: node.definition, parameterOverrides: node.parameterOverrides ?? {}, roleOverrides: Object.fromEntries(Object.entries(node.roleOverrides ?? {}).map(([key, value]) => [key, inheritedBinding(value)])), nodeBindingOverrides: Object.fromEntries(Object.entries(node.nodeBindingOverrides ?? {}).map(([key, value]) => [key, inheritedBinding(value)])) } : {}),
            ...(['subgraph-input', 'subgraph-output'].includes(node.type) ? { interfacePortId: node.interfacePortId } : {}),
        };
    });
    const wires = Object.entries(graph.wires ?? {}).map(([key, wire]) => ({ key, id: wire.id, route: wire.route, from: wire.from, fromPort: wire.fromPort, to: wire.to, toPort: wire.toPort, portalId: wire.portalId,
    }));
    const roles = Object.fromEntries(Object.entries(graph.roles ?? {}).map(([role, value]) => [role, inheritedBinding(value)]));
    const composition = {
        portals: Object.fromEntries(Object.entries(graph.portals ?? {}).map(([key, portal]) => [key, { id: portal.id, source: portal.source, kind: portal.kind }])),
        definitions: Object.fromEntries(Object.entries(graph.definitions ?? {}).map(([key, definition]) => [key, {
            id: definition.id, version: definition.version, semanticHash: definition.semanticHash,
            interface: definition.interface?.map(({ label, ...port }) => port), parameters: definition.parameters?.map(({ label, ...parameter }) => parameter),
            body: JSON.parse(graphSemanticSignature(definition.body)),
        }])),
    };
    return JSON.stringify(canonical({ schema: graph.schema, runtime: graph.runtime, mode: graph.mode, nodes, wires, roles, ...composition }));
}

/** Document precondition includes aliases/layout, but excludes root camera/selection and save bookkeeping. */
export function graphDocumentSignature(graph) {
    const { view, selection, updatedAt, ...document } = graph;
    return JSON.stringify(canonical(document));
}
function prepared(original, candidate, addedEdgeIds, removedEdgeIds) {
    const changed = addedEdgeIds.length > 0 || removedEdgeIds.length > 0;
    return { ok: true, data: {
        candidate: changed ? candidate : structuredClone(original), changed,
        addedEdgeIds, removedEdgeIds, baseSignature: graphSemanticSignature(original), baseDocumentSignature: graphDocumentSignature(original),
    } };
}

/** Prepare a complete candidate; no mutation, host calls, or identity allocation side effects.
 * @param {unknown} graph
 * @param {import('./types').ConnectionCommand} command
 * @returns {import('./types').Result<import('./types').PreparedGraphEdit>}
 */
export function prepareConnection(graph, command) {
    if (!safeWorkflowData(command) || !endpoint(command?.from) || !endpoint(command?.to) || (command.replace !== undefined && typeof command.replace !== 'boolean')) return fail('INVALID_ENDPOINT', 'Expected named output and input endpoints.');
    const normalized = cloneWorkflowDocument(graph);
    if (!normalized.ok) return normalized;
    const candidate = normalized.data;
    const { from, to, replace = false } = command;
    if (from.nodeId === to.nodeId) return fail('CYCLE', 'A block cannot connect to itself.');
    const incoming = Object.values(candidate.wires).filter(wire => wire.to === to.nodeId && wire.toPort === to.portId);
    if (incoming.some(wire => wire.route === 'wire' && wire.from === from.nodeId && wire.fromPort === from.portId)) return prepared(graph, candidate, [], []);
    if (incoming.length && !replace) return fail('AMBIGUOUS_INPUT', 'This input is already connected.');
    const removed = incoming.map(wire => wire.id);
    for (const id of removed) delete candidate.wires[id];
    let next = 1;
    while (Object.hasOwn(graph.wires, `edge-${next}`)) next++;
    const id = `edge-${next}`;
    candidate.wires[id] = { id, route: 'wire', from: from.nodeId, fromPort: from.portId, to: to.nodeId, toPort: to.portId };
    const validation = validateGraphStructure(candidate);
    return validation.ok ? prepared(graph, candidate, [id], removed) : validation;
}

/** Disconnection is valid authoring state even when it leaves required inputs unfinished.
 * @returns {import('./types').Result<import('./types').PreparedGraphEdit>}
 */
export function prepareDisconnection(graph, edgeIds) {
    if (!safeWorkflowData(edgeIds) || !Array.isArray(edgeIds) || edgeIds.some(id => typeof id !== 'string')) return fail('INVALID_WIRE', 'Expected wire IDs.');
    const normalized = cloneWorkflowDocument(graph);
    if (!normalized.ok) return normalized;
    const candidate = normalized.data;
    const removed = [...new Set(edgeIds)].filter(id => Object.hasOwn(candidate.wires, id));
    for (const id of removed) delete candidate.wires[id];
    const validation = validateGraphStructure(candidate);
    return validation.ok ? prepared(graph, candidate, [], removed) : validation;
}

/** Prepare declared control changes and explicit incident disconnections as one complete candidate.
 * Pin changes never discard wires or portal publishers implicitly.
 * @param {import('./types').NativeGraph3} graph
 * @param {import('./types').NodeControlChangeCommand} command
 * @returns {import('./types').Result<import('./types').PreparedGraphEdit>}
 */
export function prepareNodeControlChange(graph, command) {
    const nodeId = ownJsonData(command, 'nodeId'), selected = ownJsonData(ownJsonData(graph, 'nodes'), nodeId), operation = ownJsonData(selected, 'operation');
    if (!safeWorkflowData(command, { command: true, controlsOperation: operation }) || !command || typeof command !== 'object' || Array.isArray(command) || typeof command.nodeId !== 'string' || !command.controls || typeof command.controls !== 'object' || Array.isArray(command.controls) || Object.keys(command).some(key => !['nodeId', 'controls', 'removeEdgeIds'].includes(key)) || command.removeEdgeIds !== undefined && (!Array.isArray(command.removeEdgeIds) || command.removeEdgeIds.some(id => typeof id !== 'string'))) return fail('INVALID_SETTINGS', 'Expected declared control changes and explicit incident wire IDs.');
    const normalized = cloneWorkflowDocument(graph);
    if (!normalized.ok) return normalized;
    if (graph.schema !== 3 || graph.runtime !== 2) return fail('UNSUPPORTED_VERSION', 'Named control editing requires schema 3 and runtime 2.');
    const candidate = normalized.data;
    const applied = applyDeclaredNodeControlChange({ scope: candidate, metadata: () => candidate }, command);
    if (!applied.ok) return applied;
    const validation = validateGraphStructure(candidate);
    if (!validation.ok) return validation;
    return { ok: true, data: { candidate, changed: graphDocumentSignature(graph) !== graphDocumentSignature(candidate), addedEdgeIds: [], removedEdgeIds: applied.data.removedEdgeIds,
        baseSignature: graphSemanticSignature(graph), baseDocumentSignature: graphDocumentSignature(graph) } };
}

/** Internal mutation of a detached checked scope; callers own admission and full-root finish. */
export function applyDeclaredNodeControlChange(context, command) {
    const candidate = context.scope, node = Object.hasOwn(candidate.nodes, command.nodeId) && candidate.nodes[command.nodeId];
    const described = describeOperation(context.metadata(), node);
    if (!described.ok) return described;
    let defaults, declaredControls=described.data.descriptor.controls;
    const changesMode=Object.hasOwn(INTROSPECTION_NATIVE_OPERATIONS,node.operation) && Object.hasOwn(command.controls,'mode') && command.controls.mode!==node.mode;
    if(changesMode) {
        if(!INTROSPECTION_NATIVE_OPERATIONS[node.operation].modes.includes(command.controls.mode))return fail('INVALID_SETTINGS','Choose a supported Introspection mode.');
        defaults=introspectionDefaults(node.operation,command.controls.mode);
        const next=describeOperation(context.metadata(),{...node,...defaults});
        if(!next.ok)return next;
        declaredControls=next.data.descriptor.controls;
    }
    if (Object.keys(command.controls).some(key => !declaredControls.includes(key))) return fail('INVALID_SETTINGS', 'Only declared operation controls may change.');
    const removed = [...new Set(command.removeEdgeIds ?? [])];
    for (const id of removed) {
        const edge = Object.hasOwn(candidate.wires, id) && candidate.wires[id];
        const publisher = edge?.route === 'portal' ? candidate.portals?.[edge.portalId]?.source.nodeId : edge?.from;
        if (!edge || edge.to !== node.id && publisher !== node.id) return fail('INVALID_WIRE', 'Explicit removal must identify an existing incident wire.');
        delete candidate.wires[id];
    }
    if(changesMode) {
        // Discover controls across modes independently of the saved occurrence stage.
        // The selected mode and preserved stage were checked together above.
        const {phase: occurrencePhase, ...modeMetadata}=node;
        const settings=new Set(INTROSPECTION_NATIVE_OPERATIONS[node.operation].modes.flatMap(mode=>operationFor({...modeMetadata,...introspectionDefaults(node.operation,mode)},{phase:node.operation==='memory'&&mode==='commit'?'post':'pre'}).controls));
        for(const key of settings)delete node[key];
        Object.assign(node,defaults);
    }
    Object.assign(node, structuredClone(command.controls));
    return { ok: true, data: { removedEdgeIds: removed } };
}
