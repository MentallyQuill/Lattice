import { operationDefaults } from './catalog.js?v=0.27.3';

export const STARTERS = [
    { id: 'unified-basic', version: 1, title: 'Unified story workflow', purpose: 'Prepare, generate a native reply, and review the final Draft in one workflow.', phase: 'unified', roles: [], callBound: 0, operations: ['on-send', 'generate-reply', 'review-publish'] },
];
/** Return detached data for the single supported workflow starter. */
export function starterGraph(id) {
    const starter = STARTERS.find(item => item.id === id);
    if (!starter) throw new Error('Unknown workflow starter.');
    const graph = { id: starter.id, name: starter.title, description: starter.purpose, schema: 3, runtime: 2, mode: 'native-unified', template: { id: starter.id, version: starter.version }, roles: {}, nodes: {}, wires: {}, portals: {}, definitions: {}, groups: {}, view: { x: 0, y: 0, zoom: 1 } };
    for (const [index, operation] of starter.operations.entries()) graph.nodes[operation] = { ...operationDefaults(operation), id: operation, type: 'workflow', operationVersion: 1, enabled: true, x: 100 + index * 310, y: 140, w: 260 };
    graph.wires.activation = { id: 'activation', route: 'wire', from: 'on-send', fromPort: 'activation', to: 'generate-reply', toPort: 'activation' };
    graph.wires.draft = { id: 'draft', route: 'wire', from: 'generate-reply', fromPort: 'draft', to: 'review-publish', toPort: 'draft' };
    return graph;
}
/** Prepare an independent starter document; activation and enabling belong to callers. */
export function installStarter(id) {
    const graph = starterGraph(id), suffix = globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    const ids = Object.fromEntries(Object.keys(graph.nodes).map(nodeId => [nodeId, nodeId + '-' + suffix]));
    graph.nodes = Object.fromEntries(Object.values(graph.nodes).map(node => { node.id = ids[node.id]; if (node.inGroup) node.inGroup += '-' + suffix; return [node.id, node]; }));
    graph.wires = Object.fromEntries(Object.values(graph.wires).map(wire => { wire.id += '-' + suffix; wire.from = ids[wire.from]; wire.to = ids[wire.to]; return [wire.id, wire]; }));
    graph.groups = Object.fromEntries(Object.values(graph.groups).map(group => { group.id += '-' + suffix; group.members = group.members.map(member => ids[member]); return [group.id, group]; }));
    graph.id += '-' + suffix; graph.createdAt = graph.updatedAt = Date.now();
    return graph;
}
