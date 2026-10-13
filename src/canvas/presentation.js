import { isWorkflowGraph, safeWorkflowData } from '../workflow/contracts.js?v=0.27.3';

/** Rendering accepts only prepared data. Catalog and runtime work belongs to preparation. */
export function preparedCardFor(graph, node, hooks = {}) {
    if (!isWorkflowGraph(graph)) throw new Error('Expected a prepared current workflow graph.');
    return checkedPreparedCard(graph, node, hooks);
}

function checkedPreparedCard(graph, node, hooks) {
    if (!safeWorkflowData(node) || !node || typeof node.id !== 'string'
        || !['workflow', 'note', 'subgraph', 'subgraph-input', 'subgraph-output'].includes(node.type)) throw new Error('Expected a prepared current workflow node.');
    const prepared = hooks.nativeCard?.(node) ?? graph?.nativeCards?.[node?.id];
    if (!safeWorkflowData(prepared)
        || !prepared || !['canonicalTitle', 'family', 'iconPath'].every(key => typeof prepared[key] === 'string')
        || typeof prepared.body !== 'string' || !Array.isArray(prepared.ports)) throw new Error('Expected a prepared current workflow card.');
    const ids = new Set();
    for (const port of prepared.ports) {
        if (!port || !['in', 'out'].includes(port.dir) || typeof port.port !== 'string' || !port.port
            || typeof port.id !== 'string' || !port.id || ids.has(port.id)
            || port.side !== (port.dir === 'in' ? 'left' : 'right')
            || !Number.isFinite(port.row) || port.row <= 0 || typeof port.kind !== 'string' || !port.kind
            || typeof port.label !== 'string' || typeof port.className !== 'string' || typeof port.title !== 'string') throw new Error('Expected prepared named side pins.');
        ids.add(port.id);
    }
    return prepared;
}

/** Plain presentation data consumed by keyed Svelte cards. */
export function nodeCard(node, context) {
    return presentNodeCard(node, preparedCardFor(context.graph, node, context.hooks), context);
}

/** Classify once per drawing batch; every node and prepared card still uses the same checks. */
export function nodeCards(nodes, context) {
    const graph = context.graph;
    if (!isWorkflowGraph(graph)) throw new Error('Expected a prepared current workflow graph.');
    const admitted = checkedNodeList(nodes), { hooks = {} } = context;
    return admitted.map(node => presentNodeCard(node, checkedPreparedCard(graph, node, hooks), context));
}

// Inspect collection descriptors before iterating, without combining individual node budgets.
function checkedNodeList(nodes) {
    try {
        if (!Array.isArray(nodes) || ![Array.prototype, null].includes(Object.getPrototypeOf(nodes))) throw new Error();
        const fields = Object.getOwnPropertyDescriptors(nodes), length = fields.length?.value;
        if (!Number.isInteger(length) || length < 0 || length > 1000 || Reflect.ownKeys(fields).length !== length + 1) throw new Error();
        return Array.from({ length }, (_, index) => {
            const field = fields[index];
            if (!field || !('value' in field)) throw new Error();
            return field.value;
        });
    } catch { throw new Error('Expected prepared current workflow nodes.'); }
}

function presentNodeCard(node, prepared, { selection, multi = new Set(), trace }) {
    const tr = trace?.get(node.id);
    const compact = node.presentation?.compact === true;
    return {
        id: node.id, type: node.type, x: node.x ?? 0, y: node.y ?? 0, w: node.w || 260,
        className: `pc-node pc-node-${node.type} pc-node-native pc-family-${prepared.family.toLowerCase()}`
            + (node.enabled === false ? ' pc-off' : '')
            + (selection?.kind === 'node' && selection.id === node.id ? ' pc-selected' : '')
            + (multi.has(node.id) ? ' pc-multi' : '') + (tr ? ` pc-trace-${tr.status}` : '') + (compact ? ' pc-node-compact' : ''),
        title: String(prepared.boundary ? prepared.canonicalTitle : node.presentation?.alias || node.title || prepared.canonicalTitle).slice(0, 80),
        titleHint: prepared.canonicalTitle, label: prepared.canonicalTitle, iconPath: prepared.iconPath,
        compact, body: prepared.body, ports: prepared.ports, hostResult: prepared.hostResult === true,
        ...(prepared.modifierSummary?.count ? {modifierSummary:prepared.modifierSummary} : {}),
        ...(prepared.boundary ? { boundary: { ...prepared.boundary } } : {}),
        enabled: node.enabled !== false,
        offHint: node.enabled === false ? node.type === 'subgraph' ? 'This system and its outputs are skipped.' : 'Disabled operations block workflow preflight.' : undefined,
    };
}
