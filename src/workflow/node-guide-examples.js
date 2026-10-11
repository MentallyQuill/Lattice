import { OPERATIONS, operationDefaults, operationFor, phaseForNode } from './catalog.js?v=0.27.0';
import { REMASTERED_WORKFLOW_EXAMPLE_DATA } from './remastered-example-data.js?v=0.27.0';
import { exportWorkflow, parseWorkflow } from './packages.js?v=0.27.0';
import { validateWorkflow } from './contracts.js?v=0.27.0';
import { inspectExpandedGraph } from './graph-validation.js?v=0.27.0';
import { starterGraph } from './starters.js?v=0.27.0';
import { getNodeGuideFixtures } from './node-guide-fixtures.js?v=0.27.0';
import { definitionRefKey } from './definition-data.js?v=0.27.0';

const HOST_REQUIREMENT = 'Use a practice SillyTavern chat and your usual working model connection. Enable Lattice before Send; Review / Publish lets you accept or reject the proposed reply.';
let examples, lessons;
const admittedLessons = new WeakMap(), admittedGraphs = new WeakMap();
function node(graph, id, operation, controls = {}) {
    const index = Object.keys(graph.nodes).length;
    graph.nodes[id] = { ...operationDefaults(operation), id, type: 'workflow', operationVersion: 1, enabled: true, x: 100 + (index % 4) * 290, y: 420 + Math.floor(index / 4) * 220, w: 220, ...controls };
    return id;
}
function wire(graph, from, fromPort, to, toPort) {
    const id = `guide-edge-${Object.keys(graph.wires).length + 1}`;
    graph.wires[id] = { id, route: 'wire', from, fromPort, to, toPort };
}
function base(id, title) {
    const graph = starterGraph('unified-basic');
    delete graph.template;
    graph.id = `guide-${id}`; graph.name = title;
    return graph;
}
function recipe(id, title, graph, focus, description, expected, requirements = [], steps = []) {
    return { id: `guide-${id}`, title, description, graph, focus, requirements: [HOST_REQUIREMENT, ...requirements], steps: steps.length ? steps : ['Add this example to a compatible tab.', 'Inspect the example node and its connected inputs. Use Run to here on its output to inspect the artifact.', 'Send in the practice chat, then inspect the proposed reply at Review / Publish.'], expected };
}
function auxiliaryConnectionRequirement(graph, expansion) {
    const labels = new Set(), visitedHelpers = new Set();
    const add = (node, operation, place) => {
        const role = node.modelRole ?? operation.modelRole;
        labels.add(`${operation.title}${node.alias && node.alias !== operation.title ? ` (${node.alias})` : ''} (${place}${role ? ` ${role}` : ''})`);
    };
    const inspectHelper = ref => {
        const key = definitionRefKey(ref);
        if (visitedHelpers.has(key)) return;
        visitedHelpers.add(key);
        const definition = graph.definitions[key]; if (!definition) return;
        for (const node of Object.values(definition.body.nodes)) {
            if (node.enabled === false) continue;
            if (node.type === 'subgraph') { inspectHelper(node.definition); continue; }
            if (node.operation === 'for-each') { inspectHelper(node.helper); continue; }
            const operation = operationFor(node, { phase: phaseForNode(definition.body, node), mode: definition.body.mode });
            if (operation && (typeof operation.requestBound === 'function' ? operation.requestBound(node) : operation.requestBound) > 0) add(node, operation, 'For Each helper role');
        }
    };
    for (const unit of expansion.primitives) {
        if (!unit.enabled) continue;
        if (unit.node.operation === 'for-each') { inspectHelper(unit.node.helper); continue; }
        if (unit.requestBound > 0) add(unit.node, operationFor(unit.node, { phase: unit.phase, mode: graph.mode }), 'Details role');
    }
    return labels.size ? `Check these auxiliary model connections before running: ${[...labels].join('; ')}.${visitedHelpers.size ? ' Helper roles are configured in the containing For Each helper bindings.' : ''} An inherited Active SillyTavern connection is fine when it supports that job.` : null;
}
function approvedCompose() {
    const graph = base('compose', 'Compose example · a scene brief');
    const ids = { 'on-send': 'send', 'generate-reply': 'generate', 'review-publish': 'review' };
    graph.nodes = Object.fromEntries(Object.entries(graph.nodes).map(([id, n]) => { n.id = ids[id]; return [n.id, n]; }));
    graph.wires = {};
    Object.assign(graph.nodes.send, { x: 20, y: 280, w: 220, h: 210 });
    Object.assign(graph.nodes.generate, { x: 210, y: 250, w: 220, h: 210 });
    Object.assign(graph.nodes.review, { x: 530, y: 260, w: 220, h: 210 });
    node(graph, 'direction', 'text', { alias: 'Text · scene direction', text: 'Describe the dark lighthouse and one sound from the water.', x: 170, y: 0, h: 210 });
    node(graph, 'guidance', 'compose', { outputKind: 'guidance', sections: [{ name: 'Direction', text: '' }, { name: 'Boundary', text: "Leave the player's next action to them." }], separator: '\n\n', x: 350, y: 105, h: 210 });
    wire(graph, 'send', 'activation', 'generate', 'activation');
    wire(graph, 'direction', 'out', 'guidance', 'section.Direction');
    wire(graph, 'guidance', 'out', 'generate', 'guidance');
    wire(graph, 'generate', 'draft', 'review', 'draft');
    graph.description = 'Text supplies Direction. Compose adds Boundary and joins both with a blank line before native generation.';
    return recipe('compose', graph.name, graph, { instancePath: [], nodeIds: ['direction', 'guidance'] }, graph.description,
        "Compose produces Guidance: Describe the dark lighthouse and one sound from the water. Then a blank line and Leave the player's next action to them.", ['No auxiliary model or file setup is required.'],
        ['Inspect Text and the two saved Compose sections.', 'Run to here on Compose.out to inspect the scene brief without generating a reply.', 'Send a continuation request. Generate Reply receives that brief and Review / Publish receives its native Draft.']);
}
function authoredExamples() {
    const result = new Map(), compose = approvedCompose(); result.set('compose', compose); result.set('text', compose);
    let g = base('pattern', 'Detect and filter a matching paragraph'); delete g.wires.draft;
    node(g, 'scan', 'pattern', { scope: 'whole', rules: [{ id: 'repeat', pattern: 'very very' }], protectedLiterals: ['North Harbor'] });
    node(g, 'branch', 'branch', { artifactKind: 'draft' }); node(g, 'filter', 'filter-text', { action: 'remove', unit: 'paragraph', scope: 'whole' });
    node(g, 'join', 'join', { artifactKind: 'draft', inputs: [{ id: 'filtered', label: 'Filtered', required: false }, { id: 'bypass', label: 'No match', required: false }] });
    for (const [from, fromPort, to, toPort] of [['generate-reply','draft','scan','in'],['scan','out','branch','in'],['scan','matched','branch','condition'],['branch','yes','filter','in'],['scan','matches','filter','matches'],['filter','out','join','filtered'],['branch','no','join','bypass'],['join','out','review-publish','draft']]) wire(g, from, fromPort, to, toPort);
    const detected = recipe('pattern', g.name, g, { instancePath: [], nodeIds: ['scan', 'branch', 'filter', 'join'] }, 'Detect occurrences, route once per reply, and filter complete authorized units with zero auxiliary requests.', 'Pattern.out is the unchanged Draft; Matched selects one branch even with repeated hits. Filter removes a matching paragraph once. Unresolved detection, blocked units or an empty result hold Review / Publish.', [], ['Use a practice reply with separate paragraphs: First., very very, Last.', 'Inspect Pattern.matched and Pattern.matches, then Filter Text.report and the final Draft.', 'Protected North Harbor in a selected paragraph blocks atomic deletion. Copy source copies the retained privacy-projected payload; copied reports cannot authorize deletion.']);
    result.set('pattern', detected); result.set('filter-text', { ...detected, focus: { instancePath: [], nodeIds: ['scan', 'filter', 'join'] } });
    g = base('repair', 'Inspect a safe patch pipeline');
    node(g, 'snapshot', 'reply-snapshot');
    node(g, 'repair', 'repair', { mode: 'inspect', scope: 'whole', instructions: 'Inspect accidental repeated intensifiers.' });
    node(g, 'validate', 'validate-patches'); node(g, 'gate', 'review-gate');
    wire(g, 'snapshot', 'out', 'repair', 'in'); wire(g, 'repair', 'out', 'validate', 'in'); wire(g, 'validate', 'out', 'gate', 'in');
    const cleanup = recipe('repair', g.name, g, { instancePath: [], nodeIds: ['snapshot', 'repair', 'validate', 'gate'] }, 'Inspect a completed reply through Draft → Patches → Candidate alongside the native Send path.', 'Repair.out produces Patches with zero patches in inspect mode. Validate Patches.out and Review Gate.out produce an unchanged Candidate from the latest completed assistant reply. Send separately delivers its native Draft to Review / Publish.', ['Leave a completed assistant reply as the latest message in the practice chat before using Run to here. Reply Snapshot reads that existing reply without starting generation.', 'Repair starts in inspect mode and makes no auxiliary request. To try contextual mode, choose a working Prose connection first.', 'The Candidate branch is for inspection with Run to here and does not publish its patches. For an editable current publication path, use Revise Draft → Review / Publish.'], ['Use a completed assistant reply containing very very as the latest chat message.', 'Run to here on Repair.out to inspect Patches, or on Validate Patches.out or Review Gate.out to inspect the resulting Candidate; inspect mode keeps text unchanged.', 'Send separately to generate a new native Draft, then accept or reject it at Review / Publish. Candidate inspection does not publish that Candidate.']);
    for (const key of ['repair', 'validate-patches', 'review-gate']) result.set(key, { ...cleanup, focus: { instancePath: [], nodeIds: [key === 'repair' ? 'repair' : key === 'validate-patches' ? 'validate' : 'gate'] } });
    g = base('apply-reply', 'Replace legacy Apply Reply with native review');
    g.nodes.replacement = { id: 'replacement', type: 'note', title: 'Current publication path', content: 'Apply Reply belongs to recovered legacy graphs. Use Generate Reply → Review / Publish to review the native Draft, then explicitly accept or reject it.', x: 100, y: 420, w: 320 };
    result.set('apply-reply', recipe('apply-reply', g.name, g, { instancePath: [], nodeIds: Object.keys(g.nodes) }, 'Apply Reply is a superseded legacy Candidate terminal. This working modern replacement sends the native Draft to Review / Publish.', 'Review / Publish holds the native Draft for an explicit acceptance or rejection.', ['Apply Reply is retained for recovery of old graphs. Current native publication requires Review / Publish and a Draft input; this example deliberately demonstrates that replacement.'], ['Follow On Send → Generate Reply → Review / Publish.', 'Send in a practice chat.', 'Open the Review / Publish host result and accept or reject the native Draft.']));
    g = structuredClone(compose.graph); node(g, 'budget', 'guidance');
    const guidanceWire = Object.values(g.wires).find(w => w.to === 'generate' && w.toPort === 'guidance'); guidanceWire.to = 'budget'; guidanceWire.toPort = 'in'; wire(g, 'budget', 'out', 'generate', 'guidance');
    result.set('guidance', recipe('guidance', 'Check the guidance budget', g, { instancePath: [], nodeIds: ['guidance', 'budget'] }, 'Check a composed brief against a token budget before native generation.', 'Guidance forwards the scene brief if it fits 768 tokens; overflow blocks generation.', ['No auxiliary model is needed. Token counting uses the active host tokenizer when available.']));
    for (const operation of ['reroute', 'text-rules', 'style-transfer', 'format-transfer', 'terminology-map']) {
        g = base(operation, `${OPERATIONS[operation].title} · a literal text example`);
        node(g, 'source', 'text', { text: 'The harbour lantern glows.' });
        const controls = operation === 'reroute' ? { artifactKind: 'text' } : operation === 'text-rules' ? { inputKind: 'text', rules: [{ kind: 'literal', pattern: 'harbour', replacement: 'harbor' }] } : { inputKind: 'text', scope: 'whole' };
        node(g, 'transform', operation, controls);
        wire(g, 'source', 'out', 'transform', 'in');
        if (['style-transfer', 'format-transfer', 'terminology-map'].includes(operation)) {
            node(g, 'reference', 'text', { text: operation === 'terminology-map' ? '{"entries":[{"from":"harbour","to":"harbor"}]}' : operation === 'style-transfer' ? 'A spare sentence. A concrete image. Quiet movement.' : '- Location: North Harbor\n- Light: lantern' });
            if (operation === 'terminology-map') { node(g, 'mapping', 'json-decode'); wire(g, 'reference', 'out', 'mapping', 'in'); wire(g, 'mapping', 'out', 'transform', 'reference'); }
            else wire(g, 'reference', 'out', 'transform', 'reference');
        }
        node(g, 'brief', 'compose', { outputKind: 'guidance', sections: [{ name: 'Reference', text: '' }] });
        wire(g, 'transform', 'out', 'brief', 'section.Reference'); wire(g, 'brief', 'out', 'generate-reply', 'guidance');
        result.set(operation, recipe(operation, g.name, g, { instancePath: [], nodeIds: ['source', 'transform', ...(g.nodes.reference ? ['reference'] : [])] }, 'Transform supplied Text and feed the result into the scene brief.', operation === 'text-rules' || operation === 'terminology-map' ? 'The output reads The harbor lantern glows.' : operation === 'reroute' ? 'Reroute forwards exactly The harbour lantern glows.' : 'The output follows the supplied reference while keeping the lantern scene.', ['style-transfer', 'format-transfer'].includes(operation) ? ['Choose a working Prose model connection for the transform before running. This example uses Text input; no native Draft permissions are required.'] : ['No auxiliary model is required.']));
    }
    g = base('context', 'Assemble two context windows');
    node(g, 'recent', 'scene-context', { recentMessages: 2 }); node(g, 'wider', 'scene-context', { recentMessages: 6 }); node(g, 'assemble', 'context', { mode: 'assemble', inputCount: 2 }); node(g, 'plan', 'response-plan', { instructions: 'Suggest one next scene beat grounded in the supplied context.' });
    wire(g, 'recent', 'out', 'assemble', 'in1'); wire(g, 'wider', 'out', 'assemble', 'in2'); wire(g, 'assemble', 'out', 'plan', 'in'); wire(g, 'plan', 'out', 'generate-reply', 'guidance');
    result.set('context', recipe('context', g.name, g, { instancePath: [], nodeIds: ['recent', 'wider', 'assemble'] }, 'Join overlapping host context snapshots before planning.', 'Context assembles compatible snapshots and the planner supplies a grounded next beat.', ['Use a chat with at least six messages and choose a working Analysis model connection for Response Plan.']));
    g = base('confidence-gate', 'Route an explicit confidence score');
    node(g, 'score', 'text', { text: '{"confidence":0.9,"subject":"lighthouse"}' }); node(g, 'decode', 'json-decode'); node(g, 'gate', 'confidence-gate', { metricPath: ['confidence'] }); node(g, 'brief', 'compose', { mode: 'template', outputKind: 'guidance', template: 'Describe the {{data:/decision/subject}} with one concrete detail.' });
    wire(g, 'score', 'out', 'decode', 'in'); wire(g, 'decode', 'out', 'gate', 'in'); wire(g, 'gate', 'accepted', 'brief', 'data'); wire(g, 'brief', 'out', 'generate-reply', 'guidance');
    result.set('confidence-gate', recipe('confidence-gate', g.name, g, { instancePath: [], nodeIds: ['score', 'decode', 'gate', 'brief'] }, 'Route a Data score against explicit acceptance thresholds.', 'Confidence 0.9 selects accepted. Compose receives the decision and prepares guidance for the lighthouse.', ['The score is supplied demonstration data, not measured model reliability. No auxiliary model is needed.'], ['Run to here on Confidence Gate.accepted to inspect the policy record.', 'Send to use the accepted scene brief.', 'Change confidence to 0.1 or 0.5: rejected or unresolved is selected, so this accepted-only reply path cannot finish.']));
    g = base('combine', 'Append a stable notes section'); delete g.wires.draft;
    node(g, 'notes', 'text', { text: 'Observed: one lantern by the harbor.' }); node(g, 'combine', 'combine', { sectionId: 'observed-lantern' }); wire(g, 'generate-reply', 'draft', 'combine', 'draft'); wire(g, 'notes', 'out', 'combine', 'section'); wire(g, 'combine', 'out', 'review-publish', 'draft');
    result.set('combine', recipe('combine', g.name, g, { instancePath: [], nodeIds: ['notes', 'combine'] }, 'Attach notes to a native Draft under a stable section identity.', 'Review / Publish receives the original narrative plus Observed: one lantern by the harbor.', ['No auxiliary model is required.']));
    g = base('comment', 'Explain a group of nodes');
    g.nodes.comment = { id: 'comment', type: 'note', commentFrame: true, moveContents: true, title: 'Native reply path', content: 'Send activates generation. Review / Publish holds the final Draft for your choice.', color: '#637d89', x: 76, y: 80, w: 900, h: 280 };
    result.set('comment', recipe('comment', g.name, g, { instancePath: [], nodeIds: ['comment'] }, 'Use a comment frame to explain the native lifecycle.', 'The frame labels the lifecycle without changing its execution.', ['No auxiliary model is required.'], ['Move or resize the comment frame around the lifecycle nodes.', 'Edit its title and content to explain the workflow.', 'Send in a practice chat: the comment adds no runtime work.']));
    g = base('note', 'Leave a note beside the reply path');
    g.nodes.note = { id: 'note', type: 'note', title: 'Practice chat', content: 'Try a short continuation, then review the proposed reply.', x: 100, y: 420, w: 260 };
    result.set('note', recipe('note', g.name, g, { instancePath: [], nodeIds: ['note'] }, 'Keep a short instruction beside a complete native workflow.', 'The note stays on the canvas and adds no runtime work.', ['No auxiliary model is required.'], ['Edit the note title and content.', 'Move the note beside the node it explains.', 'Send in a practice chat and review the native reply.']));
    return result;
}
const guideKey = node => node.type === 'workflow' ? node.operation : node.commentFrame ? 'comment' : node.type;
function lessonFor(key) {
    // This index contains bundled source constants only. Admit a selected bundle
    // before reading it for presentation; unopened lessons do no planner work.
    lessons ??= [...REMASTERED_WORKFLOW_EXAMPLE_DATA].sort((a, b) => Object.keys(a.packages[0].graph.nodes).length - Object.keys(b.packages[0].graph.nodes).length || a.number - b.number);
    for (const entry of lessons) {
        const raw = entry.packages[0].graph;
        if (![raw, ...Object.values(raw.definitions ?? {}).map(definition => definition.body)].some(graph => Object.values(graph.nodes).some(node => guideKey(node) === key))) continue;
        let graph = admittedLessons.get(entry);
        if (!admittedLessons.has(entry)) {
            graph = null;
            for (const envelope of entry.packages) {
                const parsed = parseWorkflow(JSON.stringify(envelope));
                if (!parsed.ok || !validateWorkflow(parsed.data).ok) { graph = null; break; }
                graph ??= parsed.data;
            }
            admittedLessons.set(entry, graph);
        }
        if (!graph) continue;
        const expanded = inspectExpandedGraph(graph); if (!expanded.ok) continue;
        const locations = expanded.data.scopes.map(scope => ({ graph: scope.graph, instancePath: scope.instancePath }));
        for (const [definitionKey, definition] of Object.entries(graph.definitions)) locations.push({ graph: definition.body, instancePath: [], definitionKey });
        for (const location of locations) for (const n of Object.values(location.graph.nodes)) {
            if (guideKey(n) !== key) continue;
            const neighbors = new Set([n.id]);
            for (const edge of Object.values(location.graph.wires)) {
                const from = edge.route === 'portal' ? location.graph.portals?.[edge.portalId]?.source.nodeId : edge.from;
                if (from === n.id) neighbors.add(edge.to);
                if (edge.to === n.id && from) neighbors.add(from);
            }
            const fixtures = getNodeGuideFixtures(entry.id), connectionRequirement = auxiliaryConnectionRequirement(graph, expanded.data);
            return { id: entry.id, title: entry.title, description: entry.goal, graph,
                focus: { instancePath: location.instancePath, nodeIds: [...neighbors], ...(location.definitionKey ? { definitionKey: location.definitionKey } : {}) },
                requirements: [...(entry.lesson?.requirements ?? [HOST_REQUIREMENT]), ...(connectionRequirement ? [connectionRequirement] : [])],
                steps: entry.lesson?.steps ?? ['Follow the connected nodes and inspect their outputs.'],
                ...(fixtures.length ? { fixtures } : {}),
                expected: entry.lesson?.checkpoints?.map(checkpoint => checkpoint.expect).join(' ') || entry.goal };
        }
    }
    return null;
}
function admittedExample(key, example) {
    if (!admittedGraphs.has(example.graph)) {
        const parsed = parseWorkflow(JSON.stringify(exportWorkflow(example.graph)));
        if (!parsed.ok) throw new Error(key + ' guide: ' + parsed.error.message);
        const validation = validateWorkflow(parsed.data);
        if (!validation.ok) throw new Error(key + ' guide: ' + validation.error.message);
        admittedGraphs.set(example.graph, parsed.data);
        admittedGraphs.set(parsed.data, parsed.data);
    }
    return { ...example, graph: admittedGraphs.get(example.graph) };
}
/** Complete local examples only. Every result owns detached, admitted portable graph data. */
export function getNodeGuideExample(key) {
    if (typeof key !== 'string') return null;
    examples ??= authoredExamples();
    if (!examples.has(key)) {
        const lesson = lessonFor(key);
        if (!lesson) return null;
        examples.set(key, lesson);
    }
    const example = admittedExample(key, examples.get(key));
    examples.set(key, example);
    return structuredClone(example);
}
