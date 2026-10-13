import { definitionRefKey } from './definition-data.js?v=0.27.2';

export const pathKey = path => JSON.stringify(path);
export const samePath = (left, right) => pathKey(left) === pathKey(right);
export const pathStartsWith = (path, prefix) => path.length >= prefix.length && prefix.every((id, i) => path[i] === id);
export const safeId = id => typeof id === 'string' && id.length > 0 && !['__proto__', 'prototype', 'constructor'].includes(id);

/** Checked DTO traversal only. Paths identify wrappers, including the final wrapper ID. */
export function definitionChain(root, path) {
    if (!Array.isArray(path) || !path.length || path.length > 8 || !path.every(safeId)) return null;
    const chain = []; let scope = root;
    for (const id of path) {
        const node = Object.hasOwn(scope.nodes, id) && scope.nodes[id];
        if (node?.type !== 'subgraph') return null;
        const definition = root.definitions?.[definitionRefKey(node.definition)];
        if (!definition) return null;
        chain.push({ node, definition }); scope = definition.body;
    }
    return chain;
}
export function ownershipEntries(root) {
    const entries = (root.localDefinitionOwners ?? []).map(entry => ({ instancePath: [...entry.instancePath], definitionId: entry.definitionId }));
    for (const node of Object.values(root.nodes)) if (node.type === 'subgraph' && node.localCopy && !entries.some(entry => samePath(entry.instancePath, [node.id]))) entries.push({ instancePath: [node.id], definitionId: node.localCopy.definitionId });
    return entries;
}
export function ownsDefinitionPath(root, path) {
    const chain = definitionChain(root, path);
    if (!chain) return false;
    const owners = ownershipEntries(root);
    return chain.every(({ definition }, i) => owners.some(entry => samePath(entry.instancePath, path.slice(0, i + 1)) && entry.definitionId === definition.id));
}

/** Same single-namespace policy as reviewed insertion, without allocator callbacks or imports.
 * Monotone counters terminate after at most occupied-size + allocations collisions.
 */
export function compositionIds(root) {
    const occupied = new Set();
    const reserveScope = scope => {
        if (safeId(scope.id)) occupied.add(scope.id);
        for (const kind of ['nodes', 'wires', 'groups', 'portals']) for (const [key, value] of Object.entries(scope[kind] ?? {})) { occupied.add(key); if (safeId(value.id)) occupied.add(value.id); }
    };
    reserveScope(root);
    for (const [key, definition] of Object.entries(root.definitions ?? {})) { occupied.add(key); occupied.add(definition.id); reserveScope(definition.body); }
    const counters = new Map();
    return {
        claim(id) { if (!safeId(id) || occupied.has(id)) return false; occupied.add(id); return true; },
        next(kind) { let n = counters.get(kind) ?? 1; while (occupied.has(`${kind}-${n}`)) n++; const id = `${kind}-${n}`; counters.set(kind, n + 1); occupied.add(id); return id; },
    };
}

/** A prepared root revision may discard only unreachable snapshots with proven private IDs.
 * Every live exact nested/sibling pin survives; history retains the complete prior document.
 */
export function prunePrivateSnapshots(root, ownedIds) {
    const live = new Set(), queue = Object.values(root.nodes).filter(node => node.type === 'subgraph').map(node => node.definition);
    while (queue.length) {
        const key = definitionRefKey(queue.pop()); if (live.has(key)) continue;
        live.add(key);
        const definition = root.definitions[key];
        if (definition) for (const node of Object.values(definition.body.nodes)) if (node.type === 'subgraph') queue.push(node.definition);
    }
    for (const [key, definition] of Object.entries(root.definitions)) if (ownedIds.has(definition.id) && !live.has(key)) delete root.definitions[key];
}
