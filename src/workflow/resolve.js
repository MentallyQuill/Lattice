import { prepareGraphArtifacts, inspectGraphArtifacts, graphArtifactsFor } from './graph-artifacts.js?v=0.27.0';
import { resolveSystemNode } from './system-capabilities.js?v=0.27.0';
import { inspectExpandedGraph, nodeAddressKey, safeWorkflowData } from './graph-validation.js?v=0.27.0';
import { artifactAddressKey } from './definition-data.js?v=0.27.0';
import { operationFor } from './catalog.js?v=0.27.0';
import { freeze } from './record-data.js?v=0.27.0';

const fail = (code, message, address) => ({ ok: false, error: { code, message, ...(address ? { nodeId: address.nodeId, address } : {}) } });
const planners = new WeakMap();
const validOptions = options => safeWorkflowData(options) && options && typeof options === 'object' && !Array.isArray(options);
function indexExpansion(plan) {
    const byKey = new Map(plan.primitives.map(unit => [nodeAddressKey(unit.address), unit]));
    const terminals = plan.primitives.filter(unit => unit.terminal).map(unit => ({ kind: 'terminal', address: unit.address }));
    const dependencies = new Map(plan.primitives.map(unit => [nodeAddressKey(unit.address), []]));
    const incoming = new Set(), disabled = new Set();
    for (const edge of plan.edges) {
        const key = nodeAddressKey(edge.to), list = dependencies.get(key), upstream = byKey.get(nodeAddressKey(edge.from)).address;
        if (!list.some(at => nodeAddressKey(at) === nodeAddressKey(upstream))) list.push(upstream);
        incoming.add(artifactAddressKey(edge.to)); if (edge.disabled) disabled.add(key);
    }
    const mappings = new Map();
    for (const mapping of plan.boundaryMappings) for (const key of [artifactAddressKey({ ...mapping.instance, portId: mapping.portId }), artifactAddressKey(mapping.boundary)]) if (!mappings.has(key)) mappings.set(key, mapping);
    return { plan, byKey, terminals, dependencies, incoming, disabled, mappings,
        pins: new Map(plan.pins.filter(pin => pin.direction === 'output').map(pin => [artifactAddressKey(pin.address), pin])),
    };
}
/** One target/completeness algorithm shared by current execution and cached UI summaries. */
function selectClosure(index, target) {
    const { plan, byKey, terminals, dependencies } = index;
    let resolvedTarget, starts;
    if (target !== undefined) {
        if (!safeWorkflowData(target) || !target || typeof target !== 'object') return fail('INVALID_TARGET', 'Expected an actual output or tagged terminal target.');
        if (target.kind === 'terminal') {
            const unit = target.address && byKey.get(nodeAddressKey(target.address));
            if (!unit?.terminal || target.address.portId !== undefined) return fail('INVALID_TARGET', 'The target is not a terminal operation.');
            resolvedTarget = { kind: 'terminal', address: unit.address }; starts = [unit];
        } else {
            if (target.kind !== undefined) return fail('INVALID_TARGET', 'Unknown target kind.');
            const key = artifactAddressKey(target), pin = index.pins.get(key);
            if (!pin) return fail('INVALID_TARGET', 'Select an existing output port explicitly.');
            const mapping = index.mappings.get(key);
            if (mapping?.disabled) return fail('DISABLED_OPERATION', 'The selected output passes through a disabled boundary.', mapping.instance);
            resolvedTarget = mapping ? mapping.source : pin.address;
            if (!resolvedTarget) return fail('MISSING_INPUT', 'The selected wrapper output has no connected source.');
            const unit = byKey.get(nodeAddressKey(resolvedTarget));
            if (!unit) return fail('INVALID_TARGET', 'The selected output does not resolve to a primitive.');
            starts = [unit];
        }
    } else {
        if (!terminals.length) return fail('MISSING_TERMINAL', plan.phase === 'unified' ? 'Add Review / Publish to finish the workflow.' : 'Add a stage output to finish this helper.');
        starts = terminals.map(terminal => byKey.get(nodeAddressKey(terminal.address)));
    }
    const included = new Set();
    const visit = unit => { const key = nodeAddressKey(unit.address); if (included.has(key)) return; included.add(key); if (unit.systemDisabled) return; for (const at of dependencies.get(key)) visit(byKey.get(nodeAddressKey(at))); };
    starts.forEach(visit);
    for (const edge of plan.unresolvedEdges ?? []) if (included.has(nodeAddressKey(edge.to)) && !byKey.get(nodeAddressKey(edge.to)).systemDisabled) return fail('MISSING_INPUT', 'Connect the selected system output producer.', index.mappings.get(artifactAddressKey(edge.from))?.instance ?? edge.from);
    const containsIncluded = (instance, activeOnly = false) => plan.primitives.some(unit => (!activeOnly || !unit.systemDisabled) && included.has(nodeAddressKey(unit.address)) && unit.address.instancePath.length > instance.instancePath.length && instance.instancePath.every((id, i) => unit.address.instancePath[i] === id) && unit.address.instancePath[instance.instancePath.length] === instance.nodeId);
    for (const mapping of plan.boundaryMappings) if (target === undefined && mapping.direction === 'input' && mapping.required && containsIncluded(mapping.instance, true) && !mapping.source) return fail('MISSING_INPUT', 'Connect the required instance input.', mapping.instance);
    for (const unit of plan.primitives) if (included.has(nodeAddressKey(unit.address))) {
        if (unit.systemDisabled) continue;
        if (!unit.enabled || index.disabled.has(nodeAddressKey(unit.address))) return fail('DISABLED_OPERATION', 'A selected dependency is disabled.', unit.address);
        for (const port of unit.inputPorts) if (port.required && !index.incoming.has(artifactAddressKey({ ...unit.address, portId: port.id }))) return fail('MISSING_INPUT', 'Connect the required input artifact.', unit.address);
    }
    const selected = plan.primitives.filter(unit => included.has(nodeAddressKey(unit.address)));
    let ordered = plan.primitives, effectiveDependencies = dependencies;
    if (plan.phase === 'unified' && target === undefined) {
        const boundaries = selected.filter(unit => operationFor(unit.node, { phase: unit.phase, mode: 'native-unified' })?.nativeBoundary);
        if (boundaries.length > 1) return fail('MULTIPLE_NATIVE_GENERATIONS', 'A selected unified root supports one native generation boundary.');
        if (boundaries.length) {
            const boundary = boundaries[0], boundaryKey = nodeAddressKey(boundary.address);
            if (selected.filter(unit => unit.node.operation === 'on-send').length !== 1) return fail('NATIVE_ACTIVATION_REQUIRED', 'A native boundary requires one selected owned On Send activation.');
            // These links order stages and appear in safe plans; they never supply
            // an artifact, connect a port or expand a manual target's authority.
            effectiveDependencies = new Map([...dependencies].map(([key, values]) => [key, [...values]]));
            const depend = (unit, upstream) => {
                const list = effectiveDependencies.get(nodeAddressKey(unit.address));
                if (!list.some(at => nodeAddressKey(at) === nodeAddressKey(upstream.address))) list.push(upstream.address);
            };
            for (const unit of selected) {
                if (unit === boundary) continue;
                if (unit.phase === 'pre') depend(boundary, unit);
                else depend(unit, boundary);
            }
            ordered = [];
            const complete = new Set(), visiting = new Set();
            const order = unit => {
                const key = nodeAddressKey(unit.address);
                if (visiting.has(key)) return false;
                if (complete.has(key)) return true;
                visiting.add(key);
                for (const upstream of effectiveDependencies.get(key)) if (!order(byKey.get(nodeAddressKey(upstream)))) return false;
                visiting.delete(key); complete.add(key); ordered.push(unit); return true;
            };
            if (plan.primitives.some(unit => !order(unit))) return fail('CYCLE', 'Native preparation and Post-stage dependencies contain a cycle.');
        }
    }
    return { ok: true, data: { included, containsIncluded, resolvedTarget, ordered, dependencies: effectiveDependencies,
        requiresNativeGeneration: selected.some(unit => ['on-send', 'generate-reply'].includes(unit.node.operation)),
        callBound: selected.reduce((sum, unit) => sum + unit.requestBound, 0),
        requiredBindingAddresses: selected.filter(unit => unit.requestBound > 0).map(unit => unit.address) } };
}
/** Pure complete inventory plus selected upstream execution closure. No binding/host work. */
export function resolveWorkflow(root, options = {}) {
    if (!validOptions(options)) return fail('INVALID_TARGET', 'Expected plain planning options.');
    const expanded = inspectExpandedGraph(root); if (!expanded.ok) return expanded;
    const index = indexExpansion(expanded.data), selection = selectClosure(index, options.target); if (!selection.ok) return selection;
    const { plan, terminals } = index, { included, containsIncluded, resolvedTarget, callBound, ordered, dependencies } = selection.data, target = options.target;
    const primitives = ordered.map(unit => {
        const resolved = resolveSystemNode(unit.node, unit.address).data;
        return { ...unit, node: resolved.node, systemDefaults: unit.systemDisabled ? [] : resolved.defaults, included: included.has(nodeAddressKey(unit.address)), dependencies: dependencies.get(nodeAddressKey(unit.address)) };
    });
    const hierarchy = plan.hierarchy.map(entry => ({ ...entry, included: entry.kind === 'primitive' ? included.has(nodeAddressKey(entry.address)) : containsIncluded(entry.address) }));
    return { ok: true, data: {
        workflowId: plan.workflowId, phase: plan.phase, mode: target === undefined ? 'root' : 'target', primitives, edges: plan.edges, hierarchy, boundaryMappings: plan.boundaryMappings,
        dependencies: primitives.map(unit => ({ address: unit.address, dependencies: unit.dependencies })),
        terminals: terminals.filter(terminal => included.has(nodeAddressKey(terminal.address))), callBound,
        perNodeBounds: primitives.map(unit => ({ address: unit.address, requestBound: unit.requestBound, included: unit.included })),
        requiredRoles: [...new Set(primitives.filter(unit => unit.included && unit.requestBound > 0).map(unit => unit.node.modelRole).filter(Boolean))],
        ...(target === undefined ? {} : { target: structuredClone(target), resolvedTarget }),
        units: primitives.map(unit => ({ address: unit.address, operation: unit.node.operation, phase: unit.phase, label: unit.node.alias ?? unit.node.title ?? unit.node.operation, included: unit.included, dependencies: unit.dependencies, requestBound: unit.requestBound, inputPorts: unit.inputPorts.map(port => port.id), outputPorts: unit.outputPorts.map(port => port.id) })),
    } };
}
/** Owned content preparation. Caller root is neither retained in public DTOs nor frozen. */
export function prepareWorkflowPlanner(root, artifacts) {
    const prepared = artifacts === undefined ? prepareGraphArtifacts(root) : { ok: true, data: artifacts };
    if (!prepared.ok) return prepared;
    const admitted = artifacts === undefined ? { ok: true, data: inspectGraphArtifacts(prepared.data) } : graphArtifactsFor(root, artifacts);
    if (!admitted.ok) return admitted;
    const { checked, snapshot } = admitted.data;
    const index = indexExpansion(checked.data);
    const inventory = freeze({ workflowId: index.plan.workflowId, phase: index.plan.phase, primitives: index.plan.primitives, pins: index.plan.pins, hierarchy: index.plan.hierarchy, terminals: index.terminals });
    // Keys come only from the finite admitted inventory, never arbitrary caller input.
    const summaries = new Map();
    const targetKey = target => {
        if (target === undefined) return 'root';
        if (!safeWorkflowData(target) || !target || typeof target !== 'object' || Array.isArray(target)) return null;
        if (target.kind === 'terminal') {
            if (!target.address || typeof target.address !== 'object' || target.address.portId !== undefined) return null;
            const key = nodeAddressKey(target.address);
            return index.byKey.get(key)?.terminal ? 'terminal:' + key : null;
        }
        if (target.kind !== undefined) return null;
        const key = artifactAddressKey(target);
        return index.pins.has(key) ? 'output:' + key : null;
    };
    const planner = Object.freeze({ inventory, summarize(target) {
        const key = targetKey(target);
        if (key === null) return freeze(fail('INVALID_TARGET', 'Expected an actual output or tagged terminal target.'));
        if (summaries.has(key)) return summaries.get(key);
        const selection = selectClosure(index, target);
        const result = freeze(selection.ok ? { ok: true, data: { callBound: selection.data.callBound, requiredBindingAddresses: selection.data.requiredBindingAddresses, requiresNativeGeneration: selection.data.requiresNativeGeneration } } : selection);
        summaries.set(key, result); return result;
    } });
    planners.set(planner, { root, checked, snapshot }); return { ok: true, data: planner };
}
/** Module-internal brand boundary for the existing checked composition mapper. */
export function preparedWorkflowExpansion(root, planner) {
    const owned = planners.get(planner);
    return owned?.root === root ? owned.checked : fail('INVALID_PREPARED_PLANNER', 'Use the prepared planner belonging to this exact workflow.');
}

/** Historical authored source paired with the exact owned planner expansion. */
export function preparedWorkflowSource(root, planner) {
    const owned = planners.get(planner);
    return owned?.root === root ? owned.snapshot : null;
}
