import { safeWorkflowData } from './contracts.js?v=0.27.1';
import { cloneWorkflowDocument } from './document.js?v=0.27.1';
import { portsForNode } from './catalog.js?v=0.27.1';
import { cloneDefinitionData } from './definitions.js?v=0.27.1';
import { prepareQualifiedScopeEdit } from './definition-library.js?v=0.27.1';
import { safeId } from './composition-edit.js?v=0.27.1';
import { prepareGraphCandidate } from './prepared-graph-edit.js?v=0.27.1';
export { prepareGraphCandidate } from './prepared-graph-edit.js?v=0.27.1';
export { prepareCreateFromSelection, prepareUnpack } from './composition-transform.js?v=0.27.1';
export { prepareCompositionViews } from './composition-views.js?v=0.27.1';

const fail = (code, message) => ({ ok: false, error: { code, message } });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const endpoint = value => record(value) && typeof value.nodeId === 'string' && typeof value.portId === 'string';
const allocate = (table, prefix) => { let next = 1; while (Object.hasOwn(table, `${prefix}-${next}`)) next++; return `${prefix}-${next}`; };

function input(graph, command) {
    if (!safeWorkflowData(command) || !record(command)) return fail('INVALID_PORTAL', 'Expected a plain portal command.');
    return cloneWorkflowDocument(graph);
}
function publisher(candidate, portalId) {
    return typeof portalId === 'string' && Object.hasOwn(candidate.portals, portalId) ? candidate.portals[portalId] : null;
}
function sourcePort(graph, source) {
    return endpoint(source) && Object.hasOwn(graph.nodes, source.nodeId) ? portsForNode(graph, graph.nodes[source.nodeId]).find(port => port.id === source.portId && port.direction === 'output') : null;
}
function restoreWire(candidate, wire) {
    const source = candidate.portals[wire.portalId].source;
    candidate.wires[wire.id] = { id: wire.id, route: 'wire', from: source.nodeId, fromPort: source.portId, to: wire.to, toPort: wire.toPort };
}

function applyPortal(context, command) {
    const candidate = context.scope;
    candidate.portals ??= {};
    const result = (addedEdgeIds = [], removedEdgeIds = [], extra = {}) => ({ ok: true, data: { addedEdgeIds, removedEdgeIds, ...extra } });
    if (command.kind === 'create') {
    const port = sourcePort(context.metadata(), command.source);
    if (!port || typeof command.label !== 'string') return fail('INVALID_PORTAL', 'A publisher requires a label and existing output.');
    const id = command.id ?? (context.ids ? context.ids.next('portal') : allocate(candidate.portals, 'portal'));
    if (typeof id !== 'string' || !id || Object.hasOwn(candidate.portals, id) || command.id !== undefined && context.ids && !context.ids.claim(id)) return fail('INVALID_PORTAL', 'A publisher requires a fresh stable ID.');
    Object.defineProperty(candidate.portals, id, { enumerable: true, configurable: true, writable: true, value: { id, label: command.label, kind: port.kind, source: { nodeId: command.source.nodeId, portId: command.source.portId } } });
    return result([], [], { createdPortalId: id });
    }
    if (command.kind === 'rename') {
    const portal = publisher(candidate, command.portalId);
    if (!portal || typeof command.label !== 'string') return fail('INVALID_PORTAL', 'Expected an existing publisher and label.');
    portal.label = command.label; return result();
    }
    if (command.kind === 'retarget') {
    const portal = publisher(candidate, command.portalId), port = sourcePort(context.metadata(), command.source);
    if (!portal || !port) return fail('INVALID_PORTAL', 'Expected a publisher and compatible local output.');
    portal.source = { nodeId: command.source.nodeId, portId: command.source.portId }; portal.kind = port.kind;
    return result();
    }
    if (command.kind === 'bind') {
    if (!publisher(candidate, command.portalId) || !endpoint(command.to) || command.replace !== undefined && typeof command.replace !== 'boolean') return fail('INVALID_PORTAL', 'Expected a publisher and named destination.');
    const incoming = Object.values(candidate.wires).filter(wire => wire.to === command.to.nodeId && wire.toPort === command.to.portId);
    if (incoming.some(wire => wire.route === 'portal' && wire.portalId === command.portalId)) return result();
    if (incoming.length && !command.replace) return fail('AMBIGUOUS_INPUT', 'This input is already bound.');
    const id = context.ids ? context.ids.next('edge') : allocate(candidate.wires, 'edge');
    for (const wire of incoming) delete candidate.wires[wire.id];
    candidate.wires[id] = { id, route: 'portal', portalId: command.portalId, to: command.to.nodeId, toPort: command.to.portId };
    return result([id], incoming.map(wire => wire.id));
    }
    if (command.kind === 'restore') {
    const wire = typeof command.edgeId === 'string' && Object.hasOwn(candidate.wires, command.edgeId) && candidate.wires[command.edgeId];
    if (!wire || wire.route !== 'portal') return fail('INVALID_PORTAL', 'Expected a portal consumer wire.');
    restoreWire(candidate, wire); return result();
    }
    if (command.kind === 'delete') {
    if (!publisher(candidate, command.portalId)) return fail('INVALID_PORTAL', 'Expected an existing portal publisher.');
    const consumers = Object.values(candidate.wires).filter(wire => wire.route === 'portal' && wire.portalId === command.portalId);
    if (consumers.length && !['restore', 'disconnect'].includes(command.consumers)) return fail('PORTAL_IN_USE', 'Choose restore or disconnect for existing consumers.');
    for (const wire of consumers) if (command.consumers === 'restore') restoreWire(candidate, wire); else delete candidate.wires[wire.id];
    delete candidate.portals[command.portalId];
    return result([], command.consumers === 'disconnect' ? consumers.map(wire => wire.id) : []);
    }
    const wire = Object.hasOwn(candidate.wires, command.edgeId) && candidate.wires[command.edgeId];
    if (!wire || wire.route !== 'wire') return fail('INVALID_PORTAL', 'Expected an actual ordinary wire.');
    const source = { nodeId: wire.from, portId: wire.fromPort }, port = sourcePort(context.metadata(), source);
    if (!port) return fail('INVALID_PORTAL', 'Expected an actual wire output.');
    let portalId = command.publisher.portalId;
    if (command.publisher.kind === 'create') { const created = applyPortal(context, { kind: 'create', source, label: command.publisher.label, ...(command.publisher.id === undefined ? {} : { id: command.publisher.id }) }); if (!created.ok) return created; portalId = created.data.createdPortalId; }
    const portal = publisher(candidate, portalId);
    if (!portal || portal.kind !== port.kind || portal.source.nodeId !== source.nodeId || portal.source.portId !== source.portId) return fail('INVALID_PORTAL', 'The selected publisher must match this exact wire output.');
    candidate.wires[wire.id] = { id: wire.id, route: 'portal', portalId, to: wire.to, toPort: wire.toPort };
    return result([], [], { convertedEdgeId: wire.id, portalId });
}

function prepareRootPortal(graph, command, kind) {
    const normalized = input(graph, command); if (!normalized.ok) return normalized;
    const candidate = normalized.data, applied = applyPortal({ scope: candidate, metadata: () => candidate }, { ...command, kind });
    return applied.ok ? prepareGraphCandidate(graph, candidate, applied.data.addedEdgeIds, applied.data.removedEdgeIds) : applied;
}
export function preparePortalCreate(graph, command) { return prepareRootPortal(graph, command, 'create'); }
export function preparePortalRename(graph, command) { return prepareRootPortal(graph, command, 'rename'); }
export function preparePortalRetarget(graph, command) { return prepareRootPortal(graph, command, 'retarget'); }
export function preparePortalBinding(graph, command) { return prepareRootPortal(graph, command, 'bind'); }
export function preparePortalRestoreWire(graph, command) { return prepareRootPortal(graph, command, 'restore'); }
export function preparePortalDelete(graph, command) { return prepareRootPortal(graph, command, 'delete'); }

const portalFields = { create: ['source', 'label', 'id'], retarget: ['portalId', 'source'], bind: ['portalId', 'to', 'replace'], restore: ['edgeId'], delete: ['portalId', 'consumers'], 'convert-wire': ['edgeId', 'publisher'] };
const only = (value, fields) => record(value) && Object.keys(value).every(key => fields.includes(key));
const actualEndpoint = value => only(value, ['nodeId', 'portId']) && safeId(value.nodeId) && safeId(value.portId);
/** One qualified publisher/consumer candidate. Child labels remain presentation overlays. */
export function prepareQualifiedPortalEdit(root, input) {
    const admitted = cloneDefinitionData(input); if (!admitted.ok) return admitted;
    const command = admitted.data;
    if (!record(command) || typeof command.kind !== 'string' || !Object.hasOwn(portalFields, command.kind) || !only(command, ['kind', 'viewPath', 'expectedRef', ...portalFields[command.kind]])) return fail('INVALID_COMMAND', 'Expected a known qualified portal command.');
    if (['create', 'retarget'].includes(command.kind) && !actualEndpoint(command.source) || command.kind === 'create' && (typeof command.label !== 'string' || command.id !== undefined && !safeId(command.id)) || ['retarget', 'bind', 'delete'].includes(command.kind) && !safeId(command.portalId) || command.kind === 'bind' && (!actualEndpoint(command.to) || command.replace !== undefined && typeof command.replace !== 'boolean') || ['restore', 'convert-wire'].includes(command.kind) && !safeId(command.edgeId) || command.kind === 'delete' && command.consumers !== undefined && !['restore', 'disconnect'].includes(command.consumers)) return fail('INVALID_COMMAND', 'Expected actual named portal metadata and explicit policies.');
    if (command.kind === 'convert-wire') {
        const choice = command.publisher;
        if (choice?.kind === 'existing' ? !only(choice, ['kind', 'portalId']) || !safeId(choice.portalId) : choice?.kind !== 'create' || !only(choice, ['kind', 'label', 'id']) || typeof choice.label !== 'string' || choice.id !== undefined && !safeId(choice.id)) return fail('INVALID_COMMAND', 'Choose an existing publisher or explicit new publisher.');
    }
    return prepareQualifiedScopeEdit(root, command, applyPortal);
}
