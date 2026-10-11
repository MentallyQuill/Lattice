import { UNIFIED_WORKFLOW_EXAMPLE_DATA } from './unified-example-data.js?v=0.26.0';
import { WORKFLOW_EXAMPLE_DATA } from './example-data.js?v=0.26.0';
import { parseWorkflow } from './packages.js?v=0.26.0';
import { cloneWorkflowDocument } from './document.js?v=0.26.0';
import { validateWorkflow } from './contracts.js?v=0.26.0';

const ALL_WORKFLOW_EXAMPLES = [...WORKFLOW_EXAMPLE_DATA,...UNIFIED_WORKFLOW_EXAMPLE_DATA];
let sequence = 0;
const fail = (code, message) => ({ ok: false, error: { code, message } });
function admitExamplePackages(entry) {
    try {
        if (!Array.isArray(entry.packages) || !entry.packages.length) return fail('MALFORMED_EXAMPLE', 'That workflow example has no primary package.');
        const graphs = [];
        for (const envelope of entry.packages) {
            const parsed = parseWorkflow(JSON.stringify(envelope));
            if (!parsed.ok) return parsed;
            const validation = validateWorkflow(parsed.data);
            if (!validation.ok) return validation;
            graphs.push(parsed.data);
        }
        return { ok: true, data: graphs };
    } catch { return fail('MALFORMED_EXAMPLE', 'That workflow example contains malformed local package data.'); }
}
function independentCopy(source) {
    const cloned = cloneWorkflowDocument(source);
    if (!cloned.ok) return cloned;
    const graph = cloned.data;
    const suffix = `${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}-${++sequence}`;
    const id = `example-copy-${suffix}`;
    const nodes = Object.fromEntries(Object.keys(graph.nodes).map(id => [id, `${id}-${suffix}`]));
    const groups = Object.fromEntries(Object.keys(graph.groups).map(id => [id, `${id}-${suffix}`]));
    const portals = Object.fromEntries(Object.keys(graph.portals).map(id => [id, `${id}-${suffix}`]));
    graph.nodes = Object.fromEntries(Object.values(graph.nodes).map(node => {
        node.id = nodes[node.id];
        if (node.inGroup) node.inGroup = groups[node.inGroup];
        return [node.id, node];
    }));
    graph.wires = Object.fromEntries(Object.values(graph.wires).map(wire => {
        wire.id = `${wire.id}-${suffix}`; wire.to = nodes[wire.to];
        if (wire.route === 'wire') wire.from = nodes[wire.from];
        else wire.portalId = portals[wire.portalId];
        return [wire.id, wire];
    }));
    graph.groups = Object.fromEntries(Object.values(graph.groups).map(group => {
        group.id = groups[group.id];
        if (group.members) group.members = group.members.map(id => nodes[id]);
        return [group.id, group];
    }));
    graph.portals = Object.fromEntries(Object.values(graph.portals).map(portal => {
        portal.id = portals[portal.id]; portal.source.nodeId = nodes[portal.source.nodeId];
        return [portal.id, portal];
    }));
    graph.id = id;
    graph.createdAt = graph.updatedAt = Date.now();
    return cloneWorkflowDocument(graph);
}

/** Read independent primary graph data from the local portable example catalog. */
export function listWorkflowExamples() {
    return ALL_WORKFLOW_EXAMPLES.map(({ id, number, title, goal, packages }) => {
        const parsed = parseWorkflow(JSON.stringify(packages[0]));
        if (!parsed.ok) throw new Error(`${title}: ${parsed.error.message}`);
        return { id, number, title, goal, graph: parsed.data };
    });
}

/** Preserve catalog metadata when one bundle fails admission. Every successful
 * Result owns a detached primary graph; every companion has also passed admission.
 * @returns {import('./examples').WorkflowExampleResult[]}
 */
export function listWorkflowExampleResults() {
    return ALL_WORKFLOW_EXAMPLES.map(entry => {
        const { id, number, title, goal } = entry, admitted = admitExamplePackages(entry);
        return { id, number, title, goal, result: admitted.ok ? { ok: true, data: admitted.data[0] } : admitted };
    });
}

/** Prepare detached local roots. Saving, activation and running belong to the caller.
 * @param {string} id
 * @returns {import('./types').Result<{graph: import('./types').NativeGraph3, companions: import('./types').NativeGraph3[]}>}
 */
export function installWorkflowExample(id) {
    const entry = ALL_WORKFLOW_EXAMPLES.find(entry => entry.id === id);
    if (!entry) return fail('UNKNOWN_EXAMPLE', 'That workflow example is unavailable.');
    const admitted = admitExamplePackages(entry);
    if (!admitted.ok) return admitted;
    const prepared = [];
    for (const graph of admitted.data) {
        const result = independentCopy(graph);
        if (!result.ok) return result;
        const validation = validateWorkflow(result.data);
        if (!validation.ok) return validation;
        prepared.push(result.data);
    }
    return { ok: true, data: { graph: prepared[0], companions: prepared.slice(1) } };
}
