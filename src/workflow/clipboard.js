import { safeWorkflowData } from './contracts.js?v=0.27.1';
import { cloneWorkflowDocument } from './document.js?v=0.27.1';
import { operationFor, phaseForNode } from './catalog.js?v=0.27.1';
import { definitionRefKey, nodeBindingOverrideKey } from './definition-data.js?v=0.27.1';
import { inspectExpandedGraph, inspectDefinitionGraph } from './graph-validation.js?v=0.27.1';
import { compositionIds, samePath, pathStartsWith } from './composition-edit.js?v=0.27.1';
import { materializeInstanceControls } from './composition-transform.js?v=0.27.1';
import { exportWorkflow, parseWorkflowFragment, selectSubgraphClosure } from './packages.js?v=0.27.1';
import { prepareWorkflowInsertion } from './insertion.js?v=0.27.1';

const fail = (message, code = 'INVALID_CLIPBOARD') => ({ ok: false, error: { code, message } });

function validateSelection(selection) {
    if (!safeWorkflowData(selection) || !selection || Array.isArray(selection)) return fail('Expected a plain clipboard selection.');
    if (Object.keys(selection).some(key => !['nodeIds', 'groupIds', 'viewPath'].includes(key))) return fail('Expected current clipboard selection fields.');
    for (const key of ['nodeIds', 'groupIds']) if (selection[key] !== undefined && (!Array.isArray(selection[key]) || selection[key].some(id => typeof id !== 'string'))) return fail('Expected selected node and group IDs.');
    const path = selection.viewPath ?? [];
    if (!Array.isArray(path) || path.length > 8 || path.some(id => typeof id !== 'string' || !id)) return fail('Expected a bounded qualified view path.');
    return { ok: true, data: path };
}

/** A portable current fragment selected from one checked effective scope. */
function selectFragment(source, expansion, selection, path, snapshots) {
    const effective = expansion.scopes.find(scope => samePath(scope.instancePath, path))?.graph;
    if (!effective) return fail('The qualified clipboard view no longer exists.', 'INVALID_VIEW');
    const nodes = new Set(selection.nodeIds ?? []), groups = new Set(selection.groupIds ?? []);
    for (const id of groups) {
        if (!Object.hasOwn(effective.groups ?? {}, id)) return fail('A selected group no longer exists.');
        for (const member of effective.groups[id].members ?? []) nodes.add(member);
    }
    for (const node of Object.values(effective.nodes)) if (groups.has(node.inGroup)) nodes.add(node.id);
    if (!nodes.size || [...nodes].some(id => !Object.hasOwn(effective.nodes, id))) return fail('Select current workflow nodes to copy.');
    if ([...nodes].some(id => ['subgraph-input', 'subgraph-output'].includes(effective.nodes[id].type))) return fail('Interface boundary nodes belong to their definition and cannot be copied as ordinary workflow nodes. Select the interior nodes or copy the whole subgraph instance.', 'BOUNDARY_SELECTION');
    const fragment = { ...structuredClone(source), mode: effective.mode, nodes: {}, wires: {}, groups: {}, portals: {}, roles: {}, definitions: {} };
    // Source admission checked private ownership; portable selections carry no authority.
    delete fragment.localDefinitionOwners;
    const pool = { ...structuredClone(source), definitions: structuredClone(snapshots) }, ids = compositionIds(pool);
    for (const id of nodes) {
        const node = structuredClone(effective.nodes[id]); fragment.nodes[id] = node; delete node.localCopy;
        if (!groups.has(node.inGroup)) delete node.inGroup;
        const role = node.modelRole ?? operationFor(node)?.modelRole;
        if (role && Object.hasOwn(effective.roles ?? {}, role)) fragment.roles[role] = structuredClone(effective.roles[role]);
        if (node.type !== 'subgraph') continue;
        const prefix = [...path, id], units = expansion.primitives.filter(unit => pathStartsWith(unit.address.instancePath, prefix));
        const baselineNode = structuredClone(node); delete baselineNode.inGroup;
        const baseline = inspectExpandedGraph({ schema: 3, runtime: 2, mode: effective.mode, nodes: { [id]: baselineNode }, wires: {}, roles: effective.roles ?? {}, definitions: pool.definitions });
        if (!baseline.ok) return baseline;
        const differences = [];
        node.nodeBindingOverrides ??= {};
        for (const unit of units) {
            const relative = unit.address.instancePath.slice(prefix.length), operation = operationFor(unit.node);
            const previous = baseline.data.primitives.find(item => samePath(item.address.instancePath, [id, ...relative]) && item.address.nodeId === unit.address.nodeId);
            for (const controlId of operation.controls) if (JSON.stringify(unit.node[controlId]) !== JSON.stringify(previous.node[controlId])) differences.push({ instancePath: relative, nodeId: unit.address.nodeId, controlId, value: unit.node[controlId] });
            const role = unit.node.modelRole ?? operation.modelRole;
            if (role) {
                if (Object.hasOwn(effective.roles ?? {}, role)) fragment.roles[role] = structuredClone(effective.roles[role]);
                node.nodeBindingOverrides[nodeBindingOverrideKey(relative, unit.address.nodeId)] = { profileId: unit.node.profileId ?? null, model: unit.node.model ?? null };
            }
        }
        const captured = materializeInstanceControls(pool, node, differences, ids, [id], []); if (!captured.ok) return captured;
        const key = definitionRefKey(node.definition), definition = pool.definitions[key];
        if (!definition) return fail('The selected instance is missing its pinned definition.');
        const closure = selectSubgraphClosure(definition, pool.definitions); if (!closure.ok) return closure;
        fragment.definitions[key] = closure.data.definition; Object.assign(fragment.definitions, closure.data.definitions);
    }
    for (const [id, portal] of Object.entries(effective.portals ?? {})) if (nodes.has(portal.source.nodeId)) fragment.portals[id] = structuredClone(portal);
    for (const [id, wire] of Object.entries(effective.wires)) {
        if (!nodes.has(wire.to)) continue;
        if (wire.route === 'portal' ? Object.hasOwn(fragment.portals, wire.portalId) : nodes.has(wire.from)) fragment.wires[id] = structuredClone(wire);
    }
    for (const id of groups) {
        const group = structuredClone(effective.groups[id]);
        if (Array.isArray(group.members)) group.members = group.members.filter(id => nodes.has(id));
        fragment.groups[id] = group;
    }
    try { return { ok: true, data: exportWorkflow(fragment) }; }
    catch (error) { return fail(error.message); }
}

/** Root/qualified current copy. Host I/O and transactions belong to the controller. */
export function makeClip(graph, selection = {}) {
    const selected = validateSelection(selection); if (!selected.ok) return selected;
    const cloned = cloneWorkflowDocument(graph); if (!cloned.ok) return cloned;
    const expanded = inspectExpandedGraph(cloned.data); if (!expanded.ok) return expanded;
    return selectFragment(cloned.data, expanded.data, selection, selected.data, cloned.data.definitions);
}

/** Pure Library copy admits an actual current definition and its exact snapshots. */
export function makeDefinitionClip(definition, snapshots = {}, selection = {}) {
    const selected = validateSelection(selection); if (!selected.ok) return selected;
    const inspected = inspectDefinitionGraph(definition, snapshots); if (!inspected.ok) return inspected;
    return selectFragment(inspected.data.definition.body, inspected.data.expansion, selection, selected.data, { ...snapshots, [definitionRefKey(inspected.data.definition)]: inspected.data.definition });
}

/** Only current portable envelopes are admissible; never inspect unsafe objects. */
export function readClip(textOrEnvelope) {
    if (typeof textOrEnvelope !== 'string' && !safeWorkflowData(textOrEnvelope)) return fail('Expected bounded plain clipboard data.');
    let text;
    try { text = typeof textOrEnvelope === 'string' ? textOrEnvelope : JSON.stringify(textOrEnvelope); }
    catch { return fail('Expected portable clipboard JSON.'); }
    const parsed = parseWorkflowFragment(text); if (!parsed.ok) return parsed;
    try { return { ok: true, data: exportWorkflow(parsed.data) }; }
    catch (error) { return fail(error.message); }
}

/** Prepare a detached insertion for a single captured edit and undo transaction. */
export function prepareClipPaste(destination, envelope, options = {}) {
    const clip = readClip(envelope); if (!clip.ok) return clip;
    const target = cloneWorkflowDocument(destination); if (!target.ok) return target;
    let rootView = false;
    try {
        const property = Object.getOwnPropertyDescriptor(options, 'viewPath');
        rootView = !property || Object.hasOwn(property, 'value') && Array.isArray(property.value) && property.value.length === 0;
    } catch { return fail('Expected plain insertion options.'); }
    if (target.data.mode === 'native-unified' && rootView && ['native-pre', 'native-post'].includes(clip.data.graph.mode)) {
        const graph = clip.data.graph;
        for (const node of Object.values(graph.nodes)) if (node.type === 'workflow') node.phase = phaseForNode(graph, node);
        graph.mode = 'native-unified';
    }
    return prepareWorkflowInsertion(destination, clip.data.graph, options);
}
