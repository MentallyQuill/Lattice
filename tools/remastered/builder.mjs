import { inspectExpandedGraph } from '../../src/workflow/graph-validation.js';
import { teachingFor, lessonComment } from './teaching.mjs';
import { lessonCommentSize } from './comment-layout.mjs';
import { layout } from './graph-layout.mjs';
export { layout } from './graph-layout.mjs';
import { OPERATIONS, operationDefaults } from '../../src/workflow/catalog.js';
import { validateWorkflow } from '../../src/workflow/contracts.js';
import { exportWorkflow, parseWorkflow } from '../../src/workflow/packages.js';
import { computeDefinitionIdentity, definitionRefKey, validateDefinition } from '../../src/workflow/definitions.js';
import { prepareWorkflowPlanner } from '../../src/workflow/resolve.js';
export const must = (r, label) => {
    if (!r.ok)
        throw Error(`${label}: ${JSON.stringify(r.error)}`);
    return r.data;
};
export function builder(number, title, goal, focus) {
    const id = `lesson-${String(number).padStart(2, '0')}`, graph = {
        id: `remastered-${id}`, name: `${number}. ${title}`, description: goal, schema: 3, runtime: 2, mode: 'native-unified', template: { id, version: 1 }, nodes: {}, wires: {}, roles: {}, groups: {}, portals: {}, definitions: {}, view: { x: 0, y: 0, zoom: .65 }
    };
    let wire = 0;
    const add = (id, operation, settings = {}, label = '') => {
        const n = {
            ...operationDefaults(operation, settings), ...settings, id, type: 'workflow', enabled: true, alias: label ? `${OPERATIONS[operation].title} · ${label}` : OPERATIONS[operation].title, x: 0, y: 0, w: 300, h: 210
        };
        if (n.modelRole && !graph.roles[n.modelRole])
            graph.roles[n.modelRole] = { profileId: n.profileId, model: null };
        graph.nodes[id] = n;
        return id;
    };
    const connect = (from, fromPort, to, toPort) => {
        const id = `edge-${++wire}`;
        graph.wires[id] = {
            id, route: 'wire', from, fromPort, to, toPort
        };
    };
    add('send', 'on-send');
    add('generate', 'generate-reply');
    add('review', 'review-publish');
    connect('send', 'activation', 'generate', 'activation');
    const r = {
        number, id, title, goal, focus, graph, add, connect, requirements: [], steps: [], experiments: [], cases: [], checkpoints: [], fixtures: {}, budget: '0 auxiliary model requests; one ordinary native generation.', learn: []
    };
    r.data = (id, value, phase = 'pre') => {
        add(id + '-text', 'text', { text: JSON.stringify(value), phase }, 'authored input');
        add(id, 'json-decode', { phase });
        connect(id + '-text', 'out', id, 'in');
        return id;
    };
    r.guidance = (source, port = 'out', text = 'Use this supplied material as context; preserve established facts and player choices.', id = 'guidance') => {
        add(id, 'compose', { outputKind: 'guidance', mode: 'template', template: text + '\n{{data:}}' });
        connect(source, port, id, 'data');
        connect(id, 'out', 'generate', 'guidance');
        return id;
    };
    r.textGuidance = (source, port = 'out', id = 'guidance') => {
        add(id, 'compose', { outputKind: 'guidance', sections: [{ name: 'Material', text: '' }] });
        connect(source, port, id, 'section.Material');
        connect(id, 'out', 'generate', 'guidance');
        return id;
    };
    r.notes = (source, port = 'out', draft = 'generate', draftPort = 'draft', id = 'notes') => {
        add(id, 'render-notes', { title: focus, phase: 'post' });
        connect(source, port, id, 'data');
        add('append', 'append', { sectionId: r.id });
        connect(draft, draftPort, 'append', 'draft');
        connect(id, 'out', 'append', 'section');
        return ['append', 'out'];
    };
    r.summary = (source, port = 'out', draft = 'generate', draftPort = 'draft', id = 'notes') => {
        add(id, 'compose', { phase: 'post', mode: 'template', template: '<details><summary>' + focus + '</summary>\n{{data:}}\n</details>' });
        connect(source, port, id, 'data');
        add('append', 'append', { sectionId: r.id });
        connect(draft, draftPort, 'append', 'draft');
        connect(id, 'out', 'append', 'section');
        return ['append', 'out'];
    };
    r.check = (id, port, expect) => r.checkpoints.push({ node: graph.nodes[id].alias, port, expect });
    r.helper = (id, name, configure, { input = 'data', output = 'data', parameters = [] } = {}) => {
        const body = {
            id: id + '-body', schema: 3, runtime: 2, mode: 'native-unified', nodes: { item: {
                    id: 'item', type: 'subgraph-input', interfacePortId: 'item', enabled: true
                }, result: {
                    id: 'result', type: 'subgraph-output', interfacePortId: 'result', enabled: true
                } }, wires: {}, roles: {}, groups: {}, definitions: {}, portals: {}
        };
        let seq = 0;
        const add = (id, op, settings = {}, label = '') => {
            body.nodes[id] = {
                ...operationDefaults(op, settings), ...settings, id, type: 'workflow', enabled: true, alias: OPERATIONS[op].title + (label ? ' · ' + label : '')
            };
            const n = body.nodes[id];
            if (n.modelRole)
                body.roles[n.modelRole] = { profileId: n.profileId, model: null };
        };
        const c = (from, fromPort, to, toPort) => {
            const id = 'edge-' + ++seq;
            body.wires[id] = {
                id, route: 'wire', from, fromPort, to, toPort
            };
        };
        configure(add, c);
        const definition = {
            id: `remastered-${id}`, version: 1, name, description: 'Pure processor: no host sources, publication, private grants or settlement. Inspect the typed interface and exposed controls.', interface: [{
                    id: 'item', label: 'Item', direction: 'input', kind: input, required: true, cardinality: 'one', boundaryNodeId: 'item'
                }, {
                    id: 'result', label: 'Result', direction: 'output', kind: output, required: false, cardinality: 'one', boundaryNodeId: 'result'
                }], parameters, body
        };
        body.interface = definition.interface;
        layout(body);
        delete body.interface;
        const identity = must(computeDefinitionIdentity(definition), name);
        const snapshot = { ...identity.materializedDefinition, semanticHash: identity.semanticHash };
        graph.definitions[definitionRefKey(snapshot)] = snapshot;
        must(validateDefinition(snapshot, graph.definitions), name);
        return { id: snapshot.id, version: 1, semanticHash: snapshot.semanticHash };
    };
    r.finish = (draft = 'generate', port = 'draft') => {
        connect(draft, port, 'review', 'draft');
        if (!r.checkpoints.length)
            r.check('review', 'draft', 'An owned native Draft is available for deliberate review.');
        const { goal: lessonGoal, ...teaching } = teachingFor(number, r.checkpoints);
        const lesson = { ...teaching, focus };
        graph.description = lessonComment(lessonGoal, lesson);
        graph.nodes['lesson-note'] = {
            id: 'lesson-note', type: 'note', content: graph.description, title: 'Lesson instructions', x: 100, y: 0, ...lessonCommentSize(graph.description), enabled: true, commentFrame: true, moveContents: false
        };
        layout(graph);
        graph.runTargets = must(inspectExpandedGraph(graph), id).primitives.filter(unit=>unit.terminal).map(unit=>({instancePath:unit.address.instancePath,nodeId:unit.address.nodeId}));
        must(validateWorkflow(graph), id);
        must(prepareWorkflowPlanner(graph), id + ' prepare');
        const envelope = exportWorkflow(graph);
        const parsed = must(parseWorkflow(JSON.stringify(envelope)), id + ' parse');
        must(validateWorkflow(parsed), id + ' round trip');
        return {
            id, number, title, goal: lessonGoal, lesson, packages: [envelope]
        };
    };
    return r;
}
