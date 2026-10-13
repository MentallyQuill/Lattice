import { cloneDefinitionData, definitionRefKey } from './definition-data.js?v=0.27.1';
import { ACTIVE_PROFILE_ID } from './model-profiles.js?v=0.27.1';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = () => ({ ok: false, error: { code: 'RETIRED_WORKFLOW_DATA', message: 'Expected a bounded plain recovery workflow.' } });
const retiredNodes = nodes => record(nodes) && Object.values(nodes).some(node => node?.type === 'workflow' && node.operation === 'fast-decision');

function exposedTarget(definition, parameter, snapshots) {
    if (!Array.isArray(parameter?.target?.instancePath)) return null;
    let scope = definition?.body;
    for (const id of parameter.target.instancePath) {
        const instance = scope?.nodes?.[id];
        if (instance?.type !== 'subgraph' || !record(instance.definition)) return null;
        scope = snapshots[definitionRefKey(instance.definition)]?.body;
    }
    return scope?.nodes?.[parameter.target.nodeId] ?? null;
}
function exposedOverrides(node, snapshots) {
    if (node?.type !== 'subgraph' || !record(node.definition)) return [];
    const definition = snapshots[definitionRefKey(node.definition)];
    return Object.entries(node.parameterOverrides ?? {}).map(([id, value]) => {
        const parameter = Array.isArray(definition?.parameters) ? definition.parameters.find(item => item?.id === id) : null;
        return { id, value, controlId: parameter?.target?.controlId, target: exposedTarget(definition, parameter, snapshots) };
    });
}
function referencedKeys(definition, snapshots) {
    const keys = new Set();
    for (const node of Object.values(definition?.body?.nodes ?? {})) {
        const references = node?.type === 'subgraph' ? [node.definition] : node?.type === 'workflow' && node.operation === 'for-each' ? [node.helper] : [];
        for (const override of exposedOverrides(node, snapshots)) if (override.target?.operation === 'for-each' && override.controlId === 'helper') references.push(override.value);
        for (const reference of references) if (record(reference)) keys.add(definitionRefKey(reference));
    }
    return keys;
}

/** Recovery classification carries no execution or definition admission authority. */
export function containsRetiredModelCall(graph) {
    const copied = cloneDefinitionData(graph);
    return copied.ok && record(copied.data) && (retiredNodes(copied.data.nodes) || Object.values(copied.data.definitions ?? {}).some(definition => retiredNodes(definition?.body?.nodes)));
}

/** Reverse dependency walk keeps unrelated shelf entries and exact saved pins. */
export function retiredLibraryKeys(definitions) {
    const retired = new Set(), parents = new Map();
    for (const [key, definition] of Object.entries(definitions ?? {})) {
        const copied = cloneDefinitionData(definition);
        if (!copied.ok) throw new Error(copied.error.message);
        if (retiredNodes(copied.data.body?.nodes)) retired.add(key);
        for (const child of referencedKeys(copied.data, definitions)) {
            const owners = parents.get(child) ?? new Set(); owners.add(key); parents.set(child, owners);
        }
    }
    const pending = [...retired];
    for (let index = 0; index < pending.length; index++) for (const parent of parents.get(pending[index]) ?? []) if (!retired.has(parent)) { retired.add(parent); pending.push(parent); }
    return retired;
}

/** Copy forward dependencies for recovery without removing ordinary live helpers. */
export function recoveryLibraryKeys(definitions, retired) {
    const closure = new Set(retired), pending = [...retired];
    for (let index = 0; index < pending.length; index++) for (const child of referencedKeys(definitions[pending[index]], definitions)) {
        if (Object.hasOwn(definitions, child) && !closure.has(child)) { closure.add(child); pending.push(child); }
    }
    return closure;
}

/** Retired operations cannot pass current operation validation; keep only cold JSON. */
export function cloneArchivedWorkflow(graph) {
    const copied = cloneDefinitionData(graph);
    if (!copied.ok) return copied;
    const value = copied.data;
    if (!record(value) || typeof value.id !== 'string' || !value.id || value.schema !== 3 || value.runtime !== 2 || !['native-pre', 'native-post', 'native-unified'].includes(value.mode)
        || !record(value.nodes) || !record(value.wires) || !['groups', 'roles', 'portals', 'definitions'].every(key => value[key] == null || record(value[key]))
        || Object.entries(value.nodes).some(([id, node]) => !record(node) || node.id !== id) || Object.entries(value.wires).some(([id, wire]) => !record(wire) || wire.id !== id)) return fail();
    return { ok: true, data: structuredClone(value) };
}

function portableBindings(table) {
    for (const binding of Object.values(table ?? {})) if (record(binding) && Object.hasOwn(binding, 'profileId') && binding.profileId !== ACTIVE_PROFILE_ID) binding.profileId = null;
}
function portableValue(value, controlId, target) {
    if (target?.operation === 'for-each' && controlId === 'roleOverrides') { portableBindings(value); return value; }
    if (target?.operation === 'fast-decision' && ['fastConnectionId', 'fallbackProfileId'].includes(controlId)) return '';
    if (target?.operation === 'fast-decision' && controlId === 'fallbackEnabled') return false;
    if (target?.type === 'workflow' && controlId === 'profileId' && value !== ACTIVE_PROFILE_ID) return null;
    return value;
}
function portableScope(graph, snapshots) {
    portableBindings(graph.roles);
    for (const node of Object.values(graph.nodes ?? {})) {
        if (Object.hasOwn(node, 'profileId') && node.profileId !== ACTIVE_PROFILE_ID) node.profileId = null;
        if (Object.hasOwn(node, 'fastConnectionId')) node.fastConnectionId = '';
        if (Object.hasOwn(node, 'fallbackProfileId')) node.fallbackProfileId = '';
        if (node.operation === 'fast-decision' && Object.hasOwn(node, 'fallbackEnabled')) node.fallbackEnabled = false;
        portableBindings(node.roleOverrides); portableBindings(node.nodeBindingOverrides);
        for (const override of exposedOverrides(node, snapshots)) node.parameterOverrides[override.id] = portableValue(override.value, override.controlId, override.target);
    }
}
function portableDefinition(definition, snapshots) {
    portableScope(definition.body ?? {}, snapshots);
    for (const parameter of definition.parameters ?? []) {
        if (Object.hasOwn(parameter, 'value')) parameter.value = portableValue(parameter.value, parameter.target?.controlId, exposedTarget(definition, parameter, snapshots));
    }
}
/** This recovery copy deliberately stays outside executable/importable packages. */
export function portableArchivedWorkflow(graph) {
    const checked = cloneArchivedWorkflow(graph);
    if (!checked.ok) throw new Error(checked.error.message);
    const copy = checked.data;
    const snapshots = copy.definitions ?? {};
    portableScope(copy, snapshots);
    for (const definition of Object.values(snapshots)) portableDefinition(definition, snapshots);
    return copy;
}
export function portableArchivedDefinition(definition, snapshots = {}) {
    const checked = cloneDefinitionData(definition);
    if (!checked.ok || !record(checked.data)) throw new Error('Expected a bounded plain recovery definition.');
    const copy = structuredClone(checked.data);
    portableDefinition(copy, snapshots);
    return copy;
}
