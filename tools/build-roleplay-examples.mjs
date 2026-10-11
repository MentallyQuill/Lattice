import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { operationDefaults, portsForNode } from '../src/workflow/catalog.js?v=0.26.0';
import { exportWorkflow, parseWorkflow } from '../src/workflow/packages.js?v=0.26.0';
import { validateWorkflow } from '../src/workflow/contracts.js?v=0.26.0';
import { computeDefinitionIdentity, definitionRefKey, validateDefinition } from '../src/workflow/definitions.js?v=0.26.0';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('docs/research/2026-10-09-lattice-example-catalog.json', root), 'utf8'));
const directory = new URL('examples/roleplay/', root);
const clone = value => structuredClone(value);
const check = (result, label) => { if (!result.ok) throw new Error(`${label}: ${result.error.code}: ${result.error.message}`); return result.data; };
const nodeNotes = detail => [
    `${detail.alias} (${detail.key})`,
    `Purpose: ${detail.purpose}`,
    detail.fixture && `Fixture: ${detail.fixture}`,
    `Inspect: ${detail.inspect}`,
].filter(Boolean).join('\n');

function materializeNode(node, detail) {
    const base = node.type === 'workflow' ? operationDefaults(node.operation, { mode: detail?.settings?.mode ?? node.mode }) : {};
    // Preserve portable authored controls when new-node defaults evolve.
    if (Object.hasOwn(base, 'profileId')) base.profileId = null;
    if (node.operation === 'scene-context') delete base.visibilityMode;
    return { ...base, ...clone(node), ...clone(detail?.settings ?? {}), ...(detail?.alias ? { alias: detail.alias } : {}), enabled: true, w: 260 };
}

function sizeNodes(graph, definition) {
    for (const node of Object.values(graph.nodes)) {
        const ports = portsForNode({ ...graph, interface: definition?.interface }, node);
        node.h = Math.max(150, 62 + 24 * Math.max(ports.filter(port => port.direction === 'input').length, ports.filter(port => port.direction === 'output').length));
    }
}

// Definitions have no authored preview positions: put their actual DAG in columns.
function layoutBody(body) {
    const depths = new Map();
    const depth = id => {
        if (depths.has(id)) return depths.get(id);
        const incoming = Object.values(body.wires).filter(wire => wire.to === id);
        const value = incoming.length ? 1 + Math.max(...incoming.map(wire => depth(wire.from))) : 0;
        depths.set(id, value); return value;
    };
    const columns = new Map();
    for (const node of Object.values(body.nodes)) {
        const column = depth(node.id), peers = columns.get(column) ?? [];
        peers.push(node); columns.set(column, peers);
    }
    const tallest = Math.max(...[...columns.values()].map(peers => peers.length));
    for (const [column, peers] of columns) for (const [row, node] of peers.entries()) {
        node.x = 80 + column * 380; node.y = 100 + (row + (tallest - peers.length) / 2) * 250;
    }
}

function materializeDefinitions(entry) {
    const snapshots = {};
    for (const item of entry.subgraphs ?? []) {
        const draft = clone(item.nativeDefinitionDraft);
        const details = entry.nodeDetails.filter(detail => detail.definitionId === draft.id && detail.operation !== 'subgraph');
        draft.description = details.map(nodeNotes).join('\n\n');
        draft.body.nodes = Object.fromEntries(Object.entries(draft.body.nodes).map(([id, node]) => {
            const detail = details.find(detail => (detail.nativeNodeId ?? detail.key.split(/[./]/).at(-1)) === id);
            return [id, materializeNode(node, detail)];
        }));
        draft.body.roles = Object.fromEntries(Object.values(draft.body.nodes).filter(node => node.modelRole).map(node => [node.modelRole, { profileId: null, model: null }]));
        sizeNodes(draft.body, draft); layoutBody(draft.body);
        const identity = check(computeDefinitionIdentity(draft), draft.name);
        const definition = { ...clone(identity.materializedDefinition), semanticHash: identity.semanticHash };
        snapshots[definitionRefKey(definition)] = definition;
    }
    for (const definition of Object.values(snapshots)) check(validateDefinition(definition, snapshots), definition.name);
    return snapshots;
}

function materializeGraph(entry, authored, primary, snapshots) {
    const phase = authored.phase.toLowerCase();
    const graph = { id: `example-${entry.id}-${phase}`, name: primary ? entry.title : `${entry.title} · ${authored.phase}`, schema: 3, runtime: 2, mode: `native-${phase}`,
        template: { id: entry.id, version: 1 }, roles: {}, nodes: {}, wires: {}, groups: {}, portals: {}, definitions: {}, view: { x: 0, y: 0, zoom: 1 } };
    const details = entry.nodeDetails.filter(detail => detail.phase === authored.phase);
    graph.description = [entry.goal, `Lesson: ${entry.lesson}`, `Limitations: ${entry.limitation}`,
        'Opening creates an editable copy as the active workflow document and preserves Arm. Bind local model roles and provide the documented evidence before running.',
        ...entry.variants.filter(variant => variant.phase === authored.phase).map(variant => `${variant.phase}: at most ${variant.maxCalls} auxiliary calls. ${variant.effect === 'actor-memory' ? 'Writes actor memory on full Run. Inspect local update and save acknowledgment separately; unconfirmed saving is not durable saving.' : 'Preview before publishing or applying.'}`),
        `Try changing:\n${entry.tryChanging.join('\n')}`,
        'Documentation specimen (does not seed chat or actor memory):', `${entry.preview.beforeLabel}: ${entry.preview.before}`, `${entry.preview.afterLabel}: ${entry.preview.after}`,
        ...entry.annotations.map(annotation => `${annotation.title}: ${annotation.text}`),
        ...details.map(nodeNotes),
    ].join('\n\n');
    for (const visual of authored.nodes) {
        const detail = details.find(detail => detail.key === visual.id);
        if (!detail) throw new Error(`${entry.id}: missing settings for ${visual.id}`);
        const type = visual.operation === 'subgraph' ? 'subgraph' : 'workflow';
        const node = materializeNode({ id: visual.id, type, operation: visual.operation, operationVersion: 1, title: visual.label, x: 80 + (visual.x - 24) * 2.5, y: 120 + (visual.y - 46) * 2.5 }, detail);
        if (type === 'subgraph') {
            delete node.operation; delete node.operationVersion;
            const definition = Object.values(snapshots).find(snapshot => snapshot.id === detail.definitionId);
            if (!definition) throw new Error(`${entry.id}: missing definition ${detail.definitionId}`);
            node.definition = { id: definition.id, version: definition.version, semanticHash: definition.semanticHash };
            graph.definitions[definitionRefKey(definition)] = clone(definition);
        } else if (node.modelRole) graph.roles[node.modelRole] = { profileId: null, model: null };
        graph.nodes[node.id] = node;
    }
    sizeNodes(graph);
    for (const [index, edge] of authored.edges.entries()) {
        const id = `wire-${index + 1}`;
        graph.wires[id] = { id, route: 'wire', from: edge.a, fromPort: edge.fromPort, to: edge.b, toPort: edge.toPort };
    }
    for (const [index, group] of authored.commentGroups.entries()) {
        const members = group.nodes.map(id => graph.nodes[id]);
        const left = Math.min(...members.map(node => node.x)), top = Math.min(...members.map(node => node.y));
        const right = Math.max(...members.map(node => node.x + node.w)), bottom = Math.max(...members.map(node => node.y + node.h));
        const id = `comment-${index + 1}`;
        graph.nodes[id] = { id, type: 'note', title: group.title, content: group.notes, commentFrame: true, moveContents: group.moveContents,
            x: left - 26, y: top - 86, w: right - left + 52, h: bottom - top + 112, color: '#637d89' };
    }
    const envelope = exportWorkflow(graph);
    const portable = check(parseWorkflow(JSON.stringify(envelope)), graph.name);
    const resolved = check(validateWorkflow(portable), graph.name);
    const variant = entry.variants.find(variant => variant.phase === authored.phase);
    if (resolved.callBound !== variant.maxCalls || JSON.stringify([...resolved.requiredRoles].sort()) !== JSON.stringify([...variant.roles].sort())) throw new Error(`${entry.id}: incorrect resolved bound or roles`);
    return envelope;
}

await mkdir(directory, { recursive: true });
const recipes = [];
for (const entry of catalog.entries) {
    const definitions = materializeDefinitions(entry);
    const packages = entry.authoringGraphs.map((authored, index) => materializeGraph(entry, authored, index === 0, definitions));
    for (const envelope of packages) await writeFile(new URL(`${envelope.graph.id.slice(8)}.json`, directory), `${JSON.stringify(envelope, null, 2)}\n`);
    recipes.push({ id: entry.id, number: entry.number, title: entry.title, goal: entry.goal, packages });
}
await writeFile(new URL('src/workflow/example-data.js', root), `// Generated by tools/build-roleplay-examples.mjs. Runtime needs no design files or network.\nexport const WORKFLOW_EXAMPLE_DATA = ${JSON.stringify(recipes, null, 2)};\n`);
console.log(`Built ${recipes.length} recipes, ${recipes.reduce((sum, entry) => sum + entry.packages.length, 0)} portable roots.`);
