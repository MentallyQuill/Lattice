import { ownJsonData } from './semantic-json-data.js?v=0.27.2';
import { cloneDefinitionData, definitionRefKey } from './definitions.js?v=0.27.2';
import { prepareGraphArtifacts, graphArtifactsFor } from './graph-artifacts.js?v=0.27.2';
import { cloneWorkflowDocument } from './document.js?v=0.27.2';
import { ARTIFACT_KINDS, OPERATIONS, describeOperation, operationDefaults, operationFor, portsForNode } from './catalog.js?v=0.27.2';
import { ACTIVE_PROFILE_ID } from './model-profiles.js?v=0.27.2';
import { INTROSPECTION_NATIVE_OPERATIONS } from './introspection/native.js?v=0.27.2';
import { prepareGraphCandidate } from './prepared-graph-edit.js?v=0.27.2';
import { prepareLocalDefinitionEdit } from './definition-library.js?v=0.27.2';
import { compositionIds, definitionChain, ownsDefinitionPath, safeId } from './composition-edit.js?v=0.27.2';
import { prepareImportedDefinitionPins } from './definition-insertion.js?v=0.27.2';
import { selectSubgraphClosure } from './packages.js?v=0.27.2';

const fail = (code, message) => ({ ok: false, error: { code, message } });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key));
const endpoint = value => keys(value, ['nodeId', 'portId']) && safeId(value.nodeId) && safeId(value.portId);
const same = (left, right) => left.nodeId === right.nodeId && left.portId === right.portId;
const point = value => keys(value, ['x', 'y']) && Number.isFinite(value.x) && Number.isFinite(value.y);
const fields = {
    connect: ['origin', 'target', 'replace'],
    'move-input': ['origin', 'target', 'replace'],
    'move-output': ['origin', 'target', 'replace'],
    disconnect: ['edgeIds', 'publisherIds', 'publisherPolicy'],
    'disconnect-pin': ['pin', 'publisherPolicy'],
    reroute: ['edgeId', 'graphPoint'],
    create: ['operation', 'controls', 'artifactKind', 'phase', 'graphPoint', 'connection'],
    'create-instance': ['definition', 'snapshots', 'graphPoint', 'connection'],
};

function optionsFactory(options) {
    if (!record(options) || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) return fail('INVALID_OPTIONS', 'Use a plain options object.');
    const descriptors = Object.getOwnPropertyDescriptors(options);
    if (Reflect.ownKeys(options).some(key => key !== 'idFactory') || Object.values(descriptors).some(item => !item.enumerable || !Object.hasOwn(item, 'value'))) return fail('INVALID_OPTIONS', 'Only an own idFactory option is supported.');
    const factory = descriptors.idFactory?.value;
    return factory === undefined || typeof factory === 'function' ? { ok: true, data: factory } : fail('INVALID_OPTIONS', 'idFactory must be a function.');
}

function actualPin(context, value, direction) {
    if (!endpoint(value) || !Object.hasOwn(context.scope.nodes, value.nodeId)) return fail('INVALID_PORT', 'Choose an existing named pin.');
    const pin = portsForNode(context.metadata(), context.scope.nodes[value.nodeId]).find(pin => pin.id === value.portId && (!direction || pin.direction === direction));
    return pin ? { ok: true, data: pin } : fail('INVALID_PORT', 'Choose an actual pin with the required direction.');
}

function removeEdges(context, edges) {
    for (const edge of edges) {
        delete context.scope.wires[edge.id];
        context.removedEdgeIds.push(edge.id);
        context.changed = true;
    }
}

function connect(context, origin, target, replace) {
    const left = actualPin(context, origin), right = actualPin(context, target);
    if (!left.ok) return left;
    if (!right.ok) return right;
    if (left.data.direction === right.data.direction) return fail('INVALID_PORT', 'A connection needs one output and one input.');
    const from = left.data.direction === 'output' ? origin : target, to = left.data.direction === 'input' ? origin : target;
    const incoming = Object.values(context.scope.wires).filter(edge => edge.to === to.nodeId && edge.toPort === to.portId);
    if (incoming.some(edge => edge.route === 'wire' && edge.from === from.nodeId && edge.fromPort === from.portId)) return { ok: true };
    if (incoming.length && !replace) return fail('AMBIGUOUS_INPUT', 'Replace the occupied input explicitly.');
    removeEdges(context, incoming);
    const id = context.allocate('edge');
    context.scope.wires[id] = { id, route: 'wire', from: from.nodeId, fromPort: from.portId, to: to.nodeId, toPort: to.portId };
    context.addedEdgeIds.push(id);
    context.changed = true;
    return { ok: true };
}

function move(context, command) {
    const direction = command.kind === 'move-input' ? 'input' : 'output';
    const origin = actualPin(context, command.origin, direction), target = actualPin(context, command.target, direction);
    if (!origin.ok) return origin;
    if (!target.ok) return target;
    if (origin.data.kind !== target.data.kind) return fail('ARTIFACT_KIND', 'Move bindings between matching artifact pins.');
    if (same(command.origin, command.target)) return { ok: true };
    if (direction === 'input') {
        const bindings = Object.values(context.scope.wires).filter(edge => edge.to === command.origin.nodeId && edge.toPort === command.origin.portId);
        if (!bindings.length) return { ok: true };
        const occupied = Object.values(context.scope.wires).filter(edge => edge.to === command.target.nodeId && edge.toPort === command.target.portId);
        if (occupied.length && !command.replace) return fail('AMBIGUOUS_INPUT', 'Replace the occupied input explicitly.');
        removeEdges(context, occupied);
        for (const edge of bindings) Object.assign(edge, { to: command.target.nodeId, toPort: command.target.portId });
        context.changed = true;
    } else {
        for (const edge of Object.values(context.scope.wires)) if (edge.route === 'wire' && edge.from === command.origin.nodeId && edge.fromPort === command.origin.portId) {
            Object.assign(edge, { from: command.target.nodeId, fromPort: command.target.portId }); context.changed = true;
        }
        for (const publisher of Object.values(context.scope.portals)) if (same(publisher.source, command.origin)) {
            publisher.source = { ...command.target }; context.changed = true;
        }
    }
    return { ok: true };
}

function disconnectPublishers(context, ids, policy) {
    for (const id of new Set(ids)) {
        if (!Object.hasOwn(context.scope.portals, id)) continue;
        const publisher = context.scope.portals[id], consumers = Object.values(context.scope.wires).filter(edge => edge.route === 'portal' && edge.portalId === id);
        if (consumers.length && policy === undefined) return fail('PORTAL_IN_USE', 'Choose whether to restore or disconnect publisher consumers.');
        if (policy === 'restore') {
            for (const edge of consumers) {
                const { portalId, ...metadata } = edge;
                context.scope.wires[edge.id] = { ...metadata, route: 'wire', from: publisher.source.nodeId, fromPort: publisher.source.portId };
            }
        } else removeEdges(context, consumers);
        delete context.scope.portals[id]; context.removedPortalIds.push(id); context.changed = true;
    }
    return { ok: true };
}

function disconnect(context, command) {
    if (command.kind === 'disconnect-pin') {
        const pin = actualPin(context, command.pin);
        if (!pin.ok) return pin;
        const policy = command.publisherPolicy === undefined ? 'retain' : command.publisherPolicy;
        if (!['retain', 'disconnect'].includes(policy)) return fail('INVALID_COMMAND', 'Pin disconnection supports retain or disconnect publishers.');
        const publishers = pin.data.direction === 'output' ? Object.values(context.scope.portals).filter(item => same(item.source, command.pin)).map(item => item.id) : [];
        const attached = new Set(publishers);
        const edges = Object.values(context.scope.wires).filter(edge => pin.data.direction === 'input'
            ? edge.to === command.pin.nodeId && edge.toPort === command.pin.portId
            : edge.route === 'wire' ? edge.from === command.pin.nodeId && edge.fromPort === command.pin.portId : attached.has(edge.portalId));
        removeEdges(context, edges);
        return policy === 'disconnect' ? disconnectPublishers(context, publishers, policy) : { ok: true };
    }
    const edgeIds = command.edgeIds === undefined ? [] : command.edgeIds, publisherIds = command.publisherIds === undefined ? [] : command.publisherIds;
    if (!Array.isArray(edgeIds) || !Array.isArray(publisherIds) || [...edgeIds, ...publisherIds].some(id => !safeId(id)) || command.publisherPolicy !== undefined && !['restore', 'disconnect'].includes(command.publisherPolicy)) return fail('INVALID_COMMAND', 'Provide safe IDs and an explicit supported publisher policy.');
    removeEdges(context, [...new Set(edgeIds)].filter(id => Object.hasOwn(context.scope.wires, id)).map(id => context.scope.wires[id]));
    return disconnectPublishers(context, publisherIds, command.publisherPolicy);
}

function reroute(context, command) {
    if (!point(command.graphPoint)) return fail('INVALID_COMMAND', 'Capture a finite graph point before opening a menu.');
    if (!safeId(command.edgeId)) return fail('INVALID_WIRE', 'Choose a stable direct-wire ID.');
    const edge = Object.hasOwn(context.scope.wires, command.edgeId) && context.scope.wires[command.edgeId];
    if (!edge || edge.route !== 'wire') return fail('INVALID_WIRE', 'Reroute an existing visible direct wire.');
    const source = actualPin(context, { nodeId: edge.from, portId: edge.fromPort }, 'output');
    if (!source.ok) return source;
    const id = context.allocate('node'), edgeId = context.allocate('edge');
    context.scope.nodes[id] = { id, type: 'workflow', ...operationDefaults('reroute'), artifactKind: source.data.kind, ...(context.scope.mode==='native-unified'?{}:{phase:context.scope.mode.slice(7)}), compact: true, x: command.graphPoint.x, y: command.graphPoint.y };
    context.scope.wires[edgeId] = { ...edge, id: edgeId, from: id, fromPort: 'out' };
    Object.assign(edge, { to: id, toPort: 'in' });
    context.addedNodeIds.push(id); context.addedEdgeIds.push(edgeId); context.changed = true;
    return { ok: true };
}

function create(context, command) {
    if (!point(command.graphPoint)) return fail('INVALID_COMMAND', 'Capture a finite graph point before opening search.');
    if (typeof command.operation !== 'string' || !Object.hasOwn(OPERATIONS, command.operation)) return fail('UNKNOWN_OPERATION', 'Choose a declared operation.');
    const controls = command.controls === undefined ? {} : command.controls;
    if (!record(controls)) return fail('INVALID_SETTINGS', 'Presets must be plain operation controls.');
    let defaults;
    try { defaults = operationDefaults(command.operation, { mode: controls.mode }); }
    catch { return fail('INVALID_SETTINGS', 'Select a supported operation mode.'); }
    const declared = Object.hasOwn(INTROSPECTION_NATIVE_OPERATIONS, command.operation)
        ? operationFor({ type: 'workflow', ...defaults }) ?? OPERATIONS[command.operation]
        : OPERATIONS[command.operation];
    if (!keys(controls, declared.controls) || command.operation === 'reroute' && Object.hasOwn(controls, 'artifactKind')) return fail('INVALID_SETTINGS', 'Presets may contain only declared operation controls; Reroute creation requires its top-level artifact kind.');
    if (command.operation === 'reroute' ? !ARTIFACT_KINDS.includes(command.artifactKind) : command.artifactKind !== undefined) return fail('INVALID_SETTINGS', 'Only typed reroute creation accepts an actual artifact kind.');
    if (command.connection !== undefined && (!keys(command.connection, ['origin', 'portId', 'replace']) || !endpoint(command.connection.origin) || !safeId(command.connection.portId) || command.connection.replace !== undefined && typeof command.connection.replace !== 'boolean')) return fail('INVALID_COMMAND', 'Choose an existing origin and an explicit new-node port.');
    if(command.phase!==undefined&&(!['pre','post'].includes(command.phase)||context.scope.mode!=='native-unified'&&command.phase!==context.scope.mode.slice(7)))return fail('WRONG_PHASE','Choose a supported stage in the current workflow.');
    const id = context.allocate('node');
    const node = { id, type: 'workflow', ...defaults, ...structuredClone(controls), x: command.graphPoint.x, y: command.graphPoint.y };
    if (command.operation === 'reroute') Object.assign(node, { artifactKind: command.artifactKind, compact: true });
    if(command.phase!==undefined)node.phase=command.phase;
    else if(OPERATIONS[command.operation].minimumSchema===3&&context.scope.mode!=='native-unified'||command.operation==='reroute'&&context.scope.mode!=='native-unified')node.phase=context.scope.mode.slice(7);
    const described = describeOperation(context.metadata(), node);
    if (!described.ok) return described;
    // Configured modes can introduce a model call absent from registration defaults.
    node.modelRole = described.data.descriptor.modelRole;
    node.profileId = node.modelRole ? ACTIVE_PROFILE_ID : null;
    context.scope.nodes[id] = node; context.addedNodeIds.push(id); context.changed = true;
    return command.connection ? connect(context, command.connection.origin, { nodeId: id, portId: command.connection.portId }, command.connection.replace) : { ok: true };
}

function createInstance(original, normalized, command, path, ref, factory, sourceRoot) {
    if (!point(command.graphPoint)) return fail('INVALID_COMMAND', 'Capture a finite graph point before inserting an instance.');
    if (path.length && command.expectedRef === undefined) return fail('STALE_DEFINITION', 'Supply the exact containing definition pin.');
    if (command.connection !== undefined && (!keys(command.connection, ['origin', 'portId', 'replace']) || !endpoint(command.connection.origin) || !safeId(command.connection.portId) || command.connection.replace !== undefined && typeof command.connection.replace !== 'boolean')) return fail('INVALID_COMMAND', 'Choose an existing origin and an explicit instance port.');
    const selected = selectSubgraphClosure(command.definition, command.snapshots === undefined ? {} : command.snapshots);
    if (!selected.ok) return selected;
    const saved = selected.data.definition, source = { ...selected.data.definitions, [definitionRefKey(saved)]: saved };
    const containing = path.length ? definitionChain(normalized, path).at(-1).definition : null;
    const targetMode=(containing?.body??normalized).mode;
    if(saved.body.mode!==targetMode&&!(targetMode==='native-unified'&&['native-pre','native-post'].includes(saved.body.mode)))return fail('WRONG_PHASE','Insert a definition in a compatible containing workflow.');
    const build = finalIds => {
        const candidate = structuredClone(normalized), draft = containing ? structuredClone(containing) : null, scope = draft?.body ?? candidate;
        scope.portals ??= {};
        const initialDefinitions = { ...candidate.definitions, ...source }, initialKeys = new Set(Object.keys(initialDefinitions));
        const ids = compositionIds({ ...candidate, definitions: initialDefinitions }), allocations = [];
        let allocationFailure = false;
        const context = { scope, changed: false, addedNodeIds: [], addedEdgeIds: [], removedEdgeIds: [],
            metadata: () => ({ ...scope, definitions: candidate.definitions, ...(draft ? { interface: draft.interface } : {}) }),
            allocate(kind) {
                const planned = ids.next(kind), id = finalIds?.[allocations.length] ?? planned;
                if (id !== planned && !ids.claim(id)) { allocationFailure = true; return planned; }
                allocations.push({ kind, id: planned }); return id;
            } };
        const imported = prepareImportedDefinitionPins(candidate, source, [{ id: saved.id, version: saved.version, semanticHash: saved.semanticHash }], () => ({ ok: true, data: context.allocate('definition') }));
        if (!imported.ok) return imported;
        if (allocationFailure) return fail('IDENTITY_COLLISION', 'idFactory must preserve the fresh identity namespace.');
        for (const key of imported.data.addedDefinitionKeys) if (!initialKeys.has(key) && !ids.claim(key)) return fail('IDENTITY_COLLISION', 'A copied snapshot table key must remain fresh.');
        candidate.definitions = imported.data.definitions;
        const id = context.allocate('node');
        if (allocationFailure) return fail('IDENTITY_COLLISION', 'idFactory must preserve the fresh identity namespace.');
        scope.nodes[id] = { id, type: 'subgraph', definition: imported.data.refs[0], parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {}, x: command.graphPoint.x, y: command.graphPoint.y };
        context.addedNodeIds.push(id); context.changed = true;
        if (command.connection) {
            const connected = connect(context, command.connection.origin, { nodeId: id, portId: command.connection.portId }, command.connection.replace);
            if (!connected.ok) return connected;
            if (allocationFailure) return fail('IDENTITY_COLLISION', 'idFactory must preserve the fresh identity namespace.');
        }
        const revised = draft ? prepareLocalDefinitionEdit({ ...original, definitions: candidate.definitions }, { instancePath: path, expectedRef: ref, draft }) : { ok: true, data: { candidate } };
        if (!revised.ok) return revised;
        const prepared = prepareGraphCandidate(original, revised.data.candidate, context.addedEdgeIds, context.removedEdgeIds, sourceRoot);
        return prepared.ok ? { ok: true, data: { ...prepared.data, viewPath: [...path], ...(ref ? { expectedRef: structuredClone(ref) } : {}),
            addedNodeIds: context.addedNodeIds, addedDefinitionKeys: Object.keys(prepared.data.candidate.definitions).filter(key => !Object.hasOwn(original.definitions ?? {}, key)),
            changedRefs: [...imported.data.changedRefs, ...(revised.data.changedRefs ?? [])] }, allocations, ids } : prepared;
    };
    const provisional = build();
    if (!provisional.ok) return provisional;
    if (!factory) return { ok: true, data: provisional.data };
    const finalIds = [];
    for (const { kind, id } of provisional.allocations) {
        const next = factory(kind);
        if (!safeId(next) || next !== id && !provisional.ids.claim(next)) return fail('IDENTITY_COLLISION', 'idFactory must return a fresh safe ID for each new record.');
        finalIds.push(next);
    }
    const final = build(finalIds);
    return final.ok ? { ok: true, data: final.data } : final;
}

/** Pure native document producer. Context/cancellation/history remain caller-owned.
 * Endpoints are local to viewPath; actual directions and kinds come from the catalog.
 * Commands (all may carry viewPath and an exact expectedRef for a private body):
 * - connect: origin, target, replace? (either drag direction)
 * - move-input / move-output: origin, target, replace?
 * - disconnect: edgeIds?, publisherIds?, publisherPolicy?: restore | disconnect
 * - disconnect-pin: pin, publisherPolicy?: retain (default) | disconnect
 * - reroute: edgeId, graphPoint (direct wires only)
 * - create: operation, controls?, artifactKind (reroute only), graphPoint, connection?: {origin, portId, replace?}
 * - create-instance: definition, snapshots?, graphPoint, connection?; child views require expectedRef
 * Only declared controls are presets; creation requires an explicit matching port.
 * IDs share the root/body/table namespace. idFactory(node | edge | definition) runs at most
 * once per new record, after a provisional complete root validates; no retries.
 * Returned added/removed IDs are local to viewPath; the candidate and both
 * preconditions always describe the whole root. This API grants no commit token.
 * @returns {import('./types').Result<import('./types').PreparedGraphEdit>}
 */
export function prepareNativeConnectionEdit(root, input, options = {}) {
    try {
        const admitted = cloneDefinitionData(input, { command: true, controlsOperation: ownJsonData(input, 'operation') });
        if (!admitted.ok) return fail('INVALID_COMMAND', 'Use bounded own plain command data.');
        const command = admitted.data, factory = optionsFactory(options);
        if (!factory.ok) return factory;
        if (!record(command) || typeof command.kind !== 'string' || !Object.hasOwn(fields, command.kind) || !keys(command, ['kind', 'viewPath', 'expectedRef', ...fields[command.kind]]) || command.replace !== undefined && typeof command.replace !== 'boolean') return fail('INVALID_COMMAND', 'Use a supported native connection command.');
        const path = command.viewPath === undefined ? [] : command.viewPath;
        if (!Array.isArray(path) || path.length > 8 || path.some(id => !safeId(id))) return fail('INVALID_COMMAND', 'Use a bounded path of stable instance IDs.');
        const artifacts = prepareGraphArtifacts(root);
        const normalized = cloneWorkflowDocument(root, artifacts.ok ? { checkedArtifacts: artifacts.data } : {});
        if (!normalized.ok) return normalized;
        // Keep entry preconditions even if a caller-provided ID factory changes its source.
        const original = structuredClone(root), candidate = normalized.data;
        if (artifacts.ok) {
            const verified = graphArtifactsFor(original, artifacts.data);
            if (!verified.ok) return verified;
        }
        const chain = path.length ? definitionChain(candidate, path) : null;
        if (path.length && (!chain || !ownsDefinitionPath(candidate, path))) return fail('READ_ONLY_VIEW', 'Make a local copy of the complete containing path before editing.');
        const definition = chain?.at(-1).definition, ref = chain?.at(-1).node.definition;
        if (command.expectedRef !== undefined && (!path.length || !keys(command.expectedRef, ['id', 'version', 'semanticHash']) || definitionRefKey(command.expectedRef) !== definitionRefKey(ref))) return fail('STALE_DEFINITION', 'The exact containing definition changed.');
        if (command.kind === 'create-instance') return createInstance(original, candidate, command, path, ref, factory.data, root);
        const draft = definition ? structuredClone(definition) : null, scope = draft?.body ?? candidate;
        scope.portals ??= {};
        const ids = compositionIds(candidate), allocations = [];
        const context = {
            scope, changed: false, addedEdgeIds: [], removedEdgeIds: [], addedNodeIds: [], removedPortalIds: [],
            metadata: () => ({ ...scope, definitions: candidate.definitions, ...(definition ? { interface: definition.interface } : {}) }),
            allocate(kind) { const id = ids.next(kind); allocations.push({ kind, id }); return id; },
        };
        let result;
        if (command.kind === 'connect') result = connect(context, command.origin, command.target, command.replace);
        else if (command.kind === 'move-input' || command.kind === 'move-output') result = move(context, command);
        else if (command.kind === 'reroute') result = reroute(context, command);
        else if (command.kind === 'create') result = create(context, command);
        else result = disconnect(context, command);
        if (!result.ok) return result;
        const finish = () => {
            const prepared = !context.changed ? prepareGraphCandidate(original, original, [], [], root)
                : draft ? prepareLocalDefinitionEdit(original, { instancePath: path, expectedRef: ref, draft })
                    : prepareGraphCandidate(original, candidate, context.addedEdgeIds, context.removedEdgeIds, root);
            const qualified = prepared.ok && draft ? prepareGraphCandidate(original, prepared.data.candidate, context.addedEdgeIds, context.removedEdgeIds, root) : prepared;
            return qualified.ok ? { ok: true, data: { ...prepared.data, ...qualified.data, viewPath: [...path], ...(ref ? { expectedRef: structuredClone(ref) } : {}), addedEdgeIds: [...context.addedEdgeIds], removedEdgeIds: [...context.removedEdgeIds], addedNodeIds: [...context.addedNodeIds], removedPortalIds: [...context.removedPortalIds] } } : qualified;
        };
        const provisional = finish();
        if (!provisional.ok || !provisional.data.changed || !factory.data || !allocations.length) return provisional;
        const replacements = new Map();
        for (const { kind, id } of allocations) {
            const next = factory.data(kind);
            if (!safeId(next) || next !== id && !ids.claim(next)) return fail('IDENTITY_COLLISION', 'idFactory must return a fresh safe ID for each new record.');
            replacements.set(id, next);
        }
        const nodeReplacements = new Map(context.addedNodeIds.map(id => [id, replacements.get(id)]));
        for (const [id, next] of nodeReplacements) {
            const node = scope.nodes[id]; delete scope.nodes[id]; node.id = next; scope.nodes[next] = node;
        }
        for (const edge of Object.values(scope.wires)) {
            if (nodeReplacements.has(edge.from)) edge.from = nodeReplacements.get(edge.from);
            if (nodeReplacements.has(edge.to)) edge.to = nodeReplacements.get(edge.to);
        }
        for (const id of context.addedEdgeIds) {
            const edge = scope.wires[id], next = replacements.get(id);
            delete scope.wires[id]; edge.id = next; scope.wires[next] = edge;
        }
        context.addedEdgeIds = context.addedEdgeIds.map(id => replacements.get(id));
        context.addedNodeIds = context.addedNodeIds.map(id => replacements.get(id));
        return finish();
    } catch {
        return fail('INVALID_COMMAND', 'The connection edit could not be prepared.');
    }
}
