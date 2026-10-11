import { safeWorkflowData, validateGraphStructure } from './contracts.js?v=0.26.0';
import { OPERATIONS, operationFor, phaseForNode } from './catalog.js?v=0.26.0';
import { introspectionDefaults } from './introspection/native.js?v=0.26.0';
import { parseWorkflow } from './packages.js?v=0.26.0';
import { createViewState } from '../ui/view-state.js?v=0.26.0';

const LIMIT = 2000000;
const fail = (code, message) => ({ ok: false, error: { code, message } });
const credentialKey = key => /^(api[_-]?key|api[_-]?token|access[_-]?token|token|password|secret|credentials?|authorization|headers?|provider|endpoint|base[_-]?url)$/i.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key);
function properties(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Expected plain authoring containers.');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).length > 20000 || Object.keys(descriptors).some(credentialKey)) throw new Error('Unsafe authoring properties.');
    return descriptors;
}
function ownValue(descriptor) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Expected authoring data properties.');
    return descriptor.value;
}
function pick(value, keys) {
    const descriptors = properties(value);
    return Object.fromEntries([...new Set(keys)].filter(key => Object.hasOwn(descriptors, key)).map(key => [key, ownValue(descriptors[key])]));
}
const map = (value, project) => Object.fromEntries(Object.entries(properties(value ?? {})).map(([key, descriptor]) => [key, project(ownValue(descriptor))]));
function list(value, project) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error('Expected authoring array.');
    const descriptors = Object.getOwnPropertyDescriptors(value), length = descriptors.length.value;
    if (length > 20000 || Reflect.ownKeys(descriptors).length !== length + 1) throw new Error('Expected bounded dense authoring array.');
    return Array.from({ length }, (_, index) => project(ownValue(descriptors[index])));
}
const binding = value => pick(value, ['profileId', 'model']);
const presentationFields = ['title', 'alias', 'compact', 'collapsed', 'x', 'y', 'w', 'h', 'width', 'height'];
const reference = value => pick(value, ['id', 'version', 'semanticHash']);

// Local authoring has the same supported controls as sharing, but preserves local
// bindings, exact pins and exclusive definition ownership. Runtime fields never
// enter this allowlist, including inside immutable definition bodies.
function projectGraph(graph, depth = 0) {
    if (depth > 40) throw new Error('Authoring document exceeds nesting bounds.');
    graph = pick(graph, ['id', 'name', 'description', 'schema', 'runtime', 'mode', 'nodes', 'wires', 'groups', 'roles', 'portals', 'definitions', 'localDefinitionOwners']);
    const copy = pick(graph, ['id', 'name', 'description', 'schema', 'runtime', 'mode']);
    copy.nodes = map(graph.nodes, node => {
        const metadata = pick(node, ['type', 'operation', 'mode']), registered = Object.hasOwn(OPERATIONS, metadata.operation) ? OPERATIONS[metadata.operation] : null;
        const candidateControls = registered?.family === 'Introspection' ? Object.keys(introspectionDefaults(metadata.operation, metadata.mode)) : registered?.controls ?? [];
        node = pick(node, ['id', 'type', 'operation', 'operationVersion', 'modifiers', 'enabled', 'inGroup', 'color', ...presentationFields, 'profileId', 'model', 'modelRole', 'artifactKind', 'phase', ...candidateControls, 'content', 'commentFrame', 'moveContents', 'definition', 'parameterOverrides', 'roleOverrides', 'nodeBindingOverrides', 'localCopy', 'interfacePortId', 'protectedLiterals', 'presentation']);
        const controls = node.type === 'workflow' ? (registered?.family === 'Introspection' ? operationFor(node, { phase: phaseForNode(graph, node), mode: graph.mode })?.controls : registered?.controls) ?? [] : [];
        const projected = pick(node, [
            'id', 'type', 'operation', 'operationVersion', 'modifiers', 'enabled', 'inGroup', 'color', ...presentationFields,
            'profileId', 'model', 'modelRole', 'artifactKind', 'phase', ...controls,
            ...(node.type === 'note' ? ['content', 'commentFrame', 'moveContents'] : []),
            ...(node.type === 'subgraph' ? ['definition', 'parameterOverrides', 'roleOverrides', 'nodeBindingOverrides', 'localCopy'] : []),
            ...(['subgraph-input', 'subgraph-output'].includes(node.type) ? ['interfacePortId'] : []),
            ...(node.operation === 'validate-patches' ? ['protectedLiterals'] : []),
        ]);
        if (node.presentation) projected.presentation = pick(node.presentation, presentationFields);
        if (projected.definition) projected.definition = reference(projected.definition);
        if (projected.localCopy) projected.localCopy = pick(projected.localCopy, ['definitionId']);
        for (const field of ['roleOverrides', 'nodeBindingOverrides']) if (Object.hasOwn(projected, field)) projected[field] = map(projected[field], binding);
        if (node.operation === 'for-each') {
            if (projected.helper) projected.helper = reference(projected.helper);
            if (projected.roleOverrides) projected.roleOverrides = map(projected.roleOverrides, binding);
        }
        return projected;
    });
    copy.wires = map(graph.wires, wire => pick(wire, ['id', 'route', 'from', 'fromPort', 'to', 'toPort', 'portalId']));
    if (Object.hasOwn(graph, 'groups')) copy.groups = map(graph.groups, group => {
        const data = pick(group, ['id', 'title', 'name', 'description', 'color', 'members', ...presentationFields, 'frame']);
        return { ...data, ...(data.frame ? { frame: pick(data.frame, ['x', 'y', 'w', 'h']) } : {}) };
    });
    if (Object.hasOwn(graph, 'roles')) copy.roles = map(graph.roles, binding);
    if (Object.hasOwn(graph, 'portals')) copy.portals = map(graph.portals, portal => { const data = pick(portal, ['id', 'label', 'kind', 'source']); return { ...data, source: pick(data.source, ['nodeId', 'portId']) }; });
    if (Object.hasOwn(graph, 'definitions')) copy.definitions = map(graph.definitions, definition => {
        const data = pick(definition, ['id', 'version', 'semanticHash', 'name', 'description', 'interface', 'parameters', 'body']);
        return { ...data,
            interface: list(data.interface, port => pick(port, ['id', 'label', 'direction', 'kind', 'required', 'cardinality', 'boundaryNodeId'])),
            parameters: list(data.parameters, parameter => { const data = pick(parameter, ['id', 'label', 'target']); return { ...data, target: pick(data.target, ['instancePath', 'nodeId', 'controlId']) }; }),
            body: projectGraph(data.body, depth + 1),
        };
    });
    if (Object.hasOwn(graph, 'localDefinitionOwners')) copy.localDefinitionOwners = list(graph.localDefinitionOwners, owner => pick(owner, ['instancePath', 'definitionId']));
    return copy;
}

function projectViews(value, authoredOnly = false) {
    if (value == null) return null;
    value = pick(value, ['version', 'workflowId', 'activeKey', 'views']);
    if (value.version !== 1 || typeof value.workflowId !== 'string' || !Array.isArray(value.views)) throw new Error('Invalid workspace presentation.');
    const copy = pick(value, authoredOnly ? ['version', 'workflowId'] : ['version', 'workflowId', 'activeKey']);
    copy.views = list(value.views, view => {
        view = pick(view, ['identity', 'open', 'camera', 'selection', 'inspector', 'nodePresentation', 'groupPresentation', 'portalPresentation']);
        const entry = pick(view, authoredOnly ? ['identity'] : ['identity', 'open', 'camera', 'selection', 'inspector']);
        for (const field of ['nodePresentation', 'groupPresentation', 'portalPresentation']) if (Object.hasOwn(view, field)) entry[field] = map(view[field], item => {
            if (field === 'nodePresentation') return pick(item, ['alias', 'compact', 'x', 'y']);
            if (field === 'groupPresentation') { const data = pick(item, ['collapsed', 'x', 'y', 'frame']); return { ...data, ...(data.frame ? { frame: pick(data.frame, ['x', 'y', 'w', 'h']) } : {}) }; }
            return pick(item, ['identity', 'definitionRef', 'source', 'label']);
        });
        return entry;
    });
    // Opening/closing an otherwise untouched tab is navigation, not authoring.
    if (authoredOnly) {
        copy.views = copy.views.filter(view => ['nodePresentation', 'groupPresentation', 'portalPresentation'].some(field => Object.keys(view[field] ?? {}).length));
        if (!copy.views.length) return null;
        copy.views.sort((a, b) => JSON.stringify(canonical(a.identity)).localeCompare(JSON.stringify(canonical(b.identity))));
    }
    return copy;
}

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
function admitRootMetadata(graph) {
    if (typeof graph.id !== 'string' || !graph.id) graph.id = 'document-' + crypto.randomUUID();
    if (graph.name === undefined) graph.name = 'Imported workflow';
    return graph;
}

/** The save checkpoint ignores camera, navigation, timestamps and runtime data. */
export function workflowDocumentSnapshot(graph, workspaceViews = null) {
    if (!graph) return '';
    const document = { graph: projectGraph(graph), workspaceViews: projectViews(workspaceViews, true) };
    if (!safeWorkflowData(document)) throw new Error('Expected bounded plain workflow authoring data.');
    return JSON.stringify(canonical(document));
}

/** Encode an editable local file without consulting settings or runtime state. */
export function serializeWorkflowDocument(graph, workspaceViews = null) {
    try {
        const projectedData = projectGraph(graph), viewData = projectViews(workspaceViews);
        if (!safeWorkflowData(projectedData) || !safeWorkflowData(viewData)) return fail('MALFORMED_WORKFLOW', 'Expected bounded plain workflow authoring data without credentials.');
        const projected = structuredClone(projectedData), views = structuredClone(viewData);
        const validation = validateGraphStructure(projected);
        if (!validation.ok) return validation;
        if (views && views.workflowId !== projected.id) return fail('VIEW_DATA', 'Workspace presentation belongs to a different workflow.');
        if (views) {
            const navigation = new Map();
            for (const view of views.views) {
                const identity = view.identity;
                if (identity?.kind === 'root') continue;
                const identities = identity?.kind === 'instance' && Array.isArray(identity.instancePath)
                    ? identity.instancePath.map((_, index) => ({ ...identity, instancePath: identity.instancePath.slice(0, index + 1) })) : [identity];
                for (const entry of identities) navigation.set(JSON.stringify(canonical(entry)), { identity: entry, label: 'Saved view' });
            }
            if (!createViewState({ workflowId: projected.id, navigation: [...navigation.values()], persisted: views })) return fail('VIEW_DATA', 'Expected valid retained workspace presentation for this workflow.');
        }
        const envelope = { kind: 'lattice-document', schema: 1, minRuntime: 2, graph: projected, ...(views ? { workspaceViews: views } : {}) };
        const json = JSON.stringify(envelope, null, 2);
        if (new TextEncoder().encode(json).byteLength > LIMIT) return fail('MALFORMED_WORKFLOW', 'Workflow JSON must be at most 2,000,000 UTF-8 bytes.');
        return { ok: true, data: { json } };
    } catch { return fail('MALFORMED_WORKFLOW', 'Malformed workflow authoring containers.'); }
}

/** Validate a candidate before the caller replaces its current document. */
export function parseWorkflowDocument(json) {
    if (typeof json !== 'string' || json.length > LIMIT || new TextEncoder().encode(json).byteLength > LIMIT) return fail('MALFORMED_WORKFLOW', 'Workflow JSON must be at most 2,000,000 UTF-8 bytes.');
    let envelope;
    try { envelope = JSON.parse(json); } catch { return fail('INVALID_JSON', 'That is not valid workflow JSON.'); }
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return fail('UNSUPPORTED_PACKAGE', 'Expected a Lattice workflow document.');
    if (!safeWorkflowData(envelope)) return fail('MALFORMED_WORKFLOW', 'Invalid workflow authoring data.');
    if (envelope.kind === 'lattice-workflow') {
        const portable = parseWorkflow(json);
        return portable.ok ? { ok: true, data: { graph: admitRootMetadata(portable.data), workspaceViews: null } } : portable;
    }
    if (envelope.kind !== 'lattice-document' || envelope.schema !== 1 || envelope.minRuntime !== 2) return fail('UNSUPPORTED_PACKAGE', 'Expected a Lattice document with schema 1 and minRuntime 2.');
    const serialized = serializeWorkflowDocument(envelope.graph, envelope.workspaceViews ?? null);
    if (!serialized.ok) return serialized;
    const projected = JSON.parse(serialized.data.json);
    return { ok: true, data: { graph: admitRootMetadata(projected.graph), workspaceViews: projected.workspaceViews ?? null } };
}
