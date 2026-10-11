import { operationDefaults } from './catalog.js?v=0.26.0';
import { createLibraryWorkflow } from './library/subgraphs.js?v=0.26.0';
import { createIntrospectionStarter } from './introspection/starters.js?v=0.26.0';
export const STARTERS = [
    { id: 'unified-basic', version: 1, title: 'Unified story workflow', purpose: 'Prepare, generate a native reply, and review the final Draft in one workflow.', phase: 'unified', roles: [], callBound: 0, operations: ['on-send', 'generate-reply', 'review-publish'] },
    { id: 'native-guidance', version: 1, title: 'Scene guidance', purpose: 'Shape scene direction while SillyTavern writes the reply.', phase: 'pre', roles: ['Analysis'], callBound: 2, operations: ['scene-context', 'smart-compactor', 'response-plan', 'guidance'] },
    { id: 'reviewed-de-slop', version: 1, title: 'Reviewed AI De-slop', purpose: 'Find literal patterns and review a bounded repair before applying.', phase: 'post', roles: ['Prose'], callBound: 1, operations: ['reply-snapshot', 'pattern-scan', 'repair', 'validate-patches', 'review-gate', 'apply-reply'] },
    { id: 'literal-cleanup', version: 1, title: 'Literal cleanup', purpose: 'Try a small literal replacement without a model call, then review before applying.', phase: 'post', roles: [], callBound: 0, operations: ['reply-snapshot', 'text-rules', 'validate-patches', 'review-gate', 'apply-reply'] },
    { id: 'structured-guidance', version: 1, title: 'Structured guidance', purpose: 'Read JSON, select fields and compose optional guidance without a model call.', phase: 'pre', roles: [], callBound: 0, operations: ['compose', 'json-decode', 'select-fields', 'compose', 'guidance'] },
    { id: 'scene-compass', libraryRecipe: 'scene-compass', version: 1, title: 'Scene Compass', purpose: 'Select context and suggest scene direction while preserving user agency.', phase: 'pre', roles: ['Analysis'], callBound: 1, operations: [] },
    { id: 'library-literal-cleanup', libraryRecipe: 'literal-cleanup', version: 1, title: 'Literal phrase cleanup', purpose: 'Find configured phrases and propose a focused repair for review.', phase: 'post', roles: ['Prose'], callBound: 1, operations: [] },
    { id: 'formatting-cleanup', libraryRecipe: 'formatting-cleanup', version: 1, title: 'Formatting cleanup', purpose: 'Normalize line endings within explicitly permitted draft text.', phase: 'post', roles: [], callBound: 0, operations: [] },
    { id: 'prose-cleanup', libraryRecipe: 'prose-cleanup', version: 1, title: 'Prose cleanup', purpose: 'Inspect or revise prose using the complete category-based policy.', phase: 'post', roles: ['Prose'], callBound: 1, operations: [] },
    { id: 'reflect-and-express', introspectionRecipe: true, version: 1, title: 'Reflect and express', purpose: 'Focus scene evidence and turn character reflection into optional behavior guidance.', phase: 'pre', roles: ['Analysis'], callBound: 1, operations: ['scene-context', 'context', 'memory', 'reflect', 'express', 'guidance'] },
    { id: 'internalize-and-commit', introspectionRecipe: true, version: 1, title: 'Internalize and commit', purpose: 'Propose actor memory updates from settled events and commit after a successful root run.', phase: 'post', roles: ['Analysis'], callBound: 1, operations: ['memory', 'memory', 'internalize', 'memory'] },
    { id: 'consequence-clock', introspectionRecipe: true, version: 1, title: 'Consequence clock', purpose: 'Track distinct settled events and commit deterministic state without a model.', phase: 'post', roles: [], callBound: 0, operations: ['memory', 'memory', 'state', 'memory'] },
];
/** Canonical versioned definitions also generate the literal portable packages. */
export function starterGraph(id) {
    const starter = STARTERS.find(item => item.id === id);
    if (!starter) throw new Error('Unknown workflow starter.');
    if (starter.introspectionRecipe) return createIntrospectionStarter(starter);
    if (starter.libraryRecipe) {
        const result = createLibraryWorkflow(starter.libraryRecipe);
        if (!result.ok) throw new Error(result.error.code + ': ' + result.error.message);
        return { ...result.data.graph, id: starter.id, name: starter.title, template: { id: starter.id, version: starter.version } };
    }
    if (starter.id === 'unified-basic') {
        const graph = { id: starter.id, name: starter.title, description: starter.purpose, schema: 3, runtime: 2, mode: 'native-unified', template: { id: starter.id, version: starter.version }, roles: {}, nodes: {}, wires: {}, portals: {}, definitions: {}, groups: {}, view: { x: 0, y: 0, zoom: 1 } };
        for (const [index, operation] of starter.operations.entries()) graph.nodes[operation] = { ...operationDefaults(operation), id: operation, type: 'workflow', operationVersion: 1, enabled: true, x: 100 + index * 310, y: 140, w: 260 };
        graph.wires.activation = { id: 'activation', route: 'wire', from: 'on-send', fromPort: 'activation', to: 'generate-reply', toPort: 'activation' };
        graph.wires.draft = { id: 'draft', route: 'wire', from: 'generate-reply', fromPort: 'draft', to: 'review-publish', toPort: 'draft' };
        return graph;
    }
    return workspaceStarter(starter);
}
function workspaceStarter(starter) {
    const graph = { id: starter.id, name: starter.title, schema: 3, runtime: 2, mode: 'native-' + starter.phase, template: { id: starter.id, version: starter.version }, roles: Object.fromEntries(starter.roles.map(role => [role, { profileId: null, model: null }])), nodes: {}, wires: {}, portals: {}, definitions: {}, groups: {}, view: { x: 0, y: 0, zoom: 1 } };
    const ids = starter.id === 'structured-guidance' ? ['compose-json', 'json-decode', 'select-fields', 'compose-guidance', 'guidance'] : starter.operations;
    for (const [i, operation] of starter.operations.entries()) {
        const nodeId = ids[i];
        graph.nodes[nodeId] = { ...operationDefaults(operation), id: nodeId, type: 'workflow', operationVersion: 1, enabled: true, x: 100 + i * (starter.roles.length ? 310 : 230), y: 140, w: 260 };
        if (i) graph.wires['wire-' + i] = { id: 'wire-' + i, route: 'wire', from: ids[i - 1], fromPort: 'out', to: nodeId, toPort: nodeId === 'compose-guidance' ? 'data' : 'in' };
    }
    if (starter.id === 'literal-cleanup') {
        graph.nodes['text-rules'].inputKind = 'draft';
        graph.nodes['text-rules'].scope = 'whole';
        graph.nodes['text-rules'].rules = [{ kind: 'literal', pattern: 'very very', replacement: 'very', flags: '' }];
    } else if (starter.id === 'native-guidance') {
        graph.nodes['smart-compactor'].method = 'compress';
        graph.nodes['response-plan'].instructions = 'Suggest scene direction and actor intentions. Preserve user agency; proposals are not established events.';
    } else if (starter.id === 'reviewed-de-slop') {
        const members = ['pattern-scan', 'repair', 'validate-patches'];
        graph.groups['ai-de-slop'] = { id: 'ai-de-slop', title: 'AI De-slop', collapsed: true, x: 410, y: 140, w: 260, members };
        for (const member of members) graph.nodes[member].inGroup = 'ai-de-slop';
        graph.nodes['pattern-scan'].rules = ['a testament to', 'delve', 'tapestry'];
    } else {
        graph.nodes['compose-json'].sections = [{ name: 'Scene', text: JSON.stringify({ direction: 'A quiet conversation.', constraint: 'Let the user choose their next action.' }, null, 2) }];
        graph.nodes['select-fields'].fields = [{ name: 'direction', path: ['direction'] }, { name: 'constraint', path: ['constraint'] }];
        Object.assign(graph.nodes['compose-guidance'], { mode: 'template', outputKind: 'guidance', template: 'Direction: {{data:/direction}}\nConstraint: {{data:/constraint}}' });
    }
    return graph;
}
/** Prepare an independent starter document; activation and arming belong to callers. */
export function installStarter(id) {
    const graph = starterGraph(id), suffix = globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    const ids = Object.fromEntries(Object.keys(graph.nodes).map(nodeId => [nodeId, nodeId + '-' + suffix]));
    graph.nodes = Object.fromEntries(Object.values(graph.nodes).map(node => { node.id = ids[node.id]; if (node.inGroup) node.inGroup += '-' + suffix; return [node.id, node]; }));
    graph.wires = Object.fromEntries(Object.values(graph.wires).map(wire => { wire.id += '-' + suffix; wire.from = ids[wire.from]; wire.to = ids[wire.to]; return [wire.id, wire]; }));
    graph.groups = Object.fromEntries(Object.values(graph.groups).map(group => { group.id += '-' + suffix; group.members = group.members.map(member => ids[member]); return [group.id, group]; }));
    graph.id += '-' + suffix; graph.createdAt = graph.updatedAt = Date.now();
    return graph;
}
