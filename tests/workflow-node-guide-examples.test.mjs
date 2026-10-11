import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OPERATIONS } from '../src/workflow/catalog.js';
import { parseWorkflow, exportWorkflow } from '../src/workflow/packages.js';
import { validateWorkflow } from '../src/workflow/contracts.js';
import { inspectExpandedGraph } from '../src/workflow/graph-validation.js';
import { runWorkflowForHost } from '../src/workflow/runtime.js';
import { prepareWorkflowPlanner } from '../src/workflow/resolve.js';
import { expandRecordAddress } from '../src/workflow/record-data.js';
import { Worker } from 'node:worker_threads';
import { unifiedRecipeHost } from './helpers/unified-recipe-host.mjs';

const registry = await import('../src/workflow/node-guide-examples.js').catch(() => ({}));
test('every operation and structural guide has a detached, complete admitted example', () => {
    assert.equal(typeof registry.getNodeGuideExample, 'function');
    const keys = [...Object.keys(OPERATIONS), 'note', 'comment', 'subgraph', 'subgraph-input', 'subgraph-output'];
    assert.equal(keys.length, 80);
    for (const key of keys) {
        const example = registry.getNodeGuideExample(key);
        assert.ok(example, key);
        assert.ok(example.requirements.length && example.steps.length && example.expected, key);
        const parsed = parseWorkflow(JSON.stringify(exportWorkflow(example.graph)));
        assert.equal(parsed.ok, true, `${key}: ${JSON.stringify(parsed)}`);
        const valid = validateWorkflow(parsed.data);
        assert.equal(valid.ok, true, `${key}: ${JSON.stringify(valid)}`);
        const planner = prepareWorkflowPlanner(parsed.data);
        assert.equal(planner.ok, true, key);
        assert.equal(planner.data.summarize().ok, true, key);
        assert.ok(example.requirements.every(s => typeof s === 'string') && example.steps.every(s => typeof s === 'string'), key);
        const expansion = inspectExpandedGraph(example.graph);
        const bodies = [example.graph, ...expansion.data.scopes.map(s => s.graph), ...Object.values(example.graph.definitions).map(d => d.body)];
        if (key === 'apply-reply') assert.match(example.description, /superseded legacy.*replacement/);
        else assert.ok(bodies.some(g => Object.values(g.nodes).some(n => key === 'comment' ? n.commentFrame === true : OPERATIONS[key] ? n.operation === key : n.type === key)), key);
        example.graph.nodes = {};
        assert.ok(Object.keys(registry.getNodeGuideExample(key).graph.nodes).length, key);
    }
    assert.equal(registry.getNodeGuideExample('missing'), null);
});

async function syntheticRun(graph, expectedGuidance, target) {
    const text = 'The very very bright lantern lights North Harbor.';
    const draft = { kind: 'draft', text, source: { token: 'node-guide-synthetic', originalText: text } };
    let generations = 0, requests = 0, settlement;
    const result = await runWorkflowForHost(graph, {
        signal: AbortSignal.timeout(5000), ...(target ? { target } : {}),
        countTokens: async text => ({ tokens: Math.ceil(text.length / 4), method: 'guide-fixture' }),
        createWorker() {
            const worker = new Worker(new URL('./fixtures/text-rules-node-worker.mjs', import.meta.url)), handlers = new Map();
            return { addEventListener(type, fn) { const handler = type === 'message' ? data => { if (!data?.fixtureStarted) fn({ data }); } : error => fn({ error }); handlers.set(fn, handler); worker.on(type, handler); }, removeEventListener(type, fn) { worker.off(type, handlers.get(fn)); handlers.delete(fn); }, postMessage(data) { worker.postMessage(data); }, terminate() { return worker.terminate(); } };
        },
        resolveBinding: () => ({ ok: true, data: { profileId: 'fixture', model: 'synthetic' } }),
        request: async request => { requests++; return { ok: true, data: { text: request.messages[0].content.includes('complete proposed prose') ? 'The harbor lantern glows.' : 'Ground the next beat in the lantern scene.', finish: 'stop' } }; },
    }, {
        executeHostOperation(node, inputs) {
            if (node.operation === 'reply-snapshot') return { ok: true, artifact: draft };
            if (node.operation === 'on-send') return { ok: true, outputs: { activation: { kind: 'data', value: { synthetic: true } } } };
            if (node.operation === 'scene-context') return { ok: true, artifact: { kind: 'context', messages: [{ id: '1', role: 'user', text: 'Describe the lantern.', source: 'chat' }] } };
            assert.equal(node.operation, 'generate-reply'); generations++;
            if (expectedGuidance !== undefined) assert.equal(inputs.guidance.text, expectedGuidance);
            return { ok: true, outputs: { draft, metadata: { kind: 'data', value: { synthetic: true } } } };
        },
        settle: value => { settlement = structuredClone(value); return { ok: true }; },
    });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(generations, target ? Number(prepareWorkflowPlanner(graph).data.summarize(target).data.requiresNativeGeneration) : 1);
    assert.equal(result.recording.status, 'completed');
    return { result, settlement, requests };
}

for (const [key, expected] of [
    ['compose', "Describe the dark lighthouse and one sound from the water.\n\nLeave the player's next action to them."],
    ['guidance', "Describe the dark lighthouse and one sound from the water.\n\nLeave the player's next action to them."],
    ['reroute', 'The harbour lantern glows.'], ['text-rules', 'The harbor lantern glows.'],
    ['terminology-map', 'The harbor lantern glows.'], ['confidence-gate', 'Describe the lighthouse with one concrete detail.'],
    ['context', 'Ground the next beat in the lantern scene.'], ['style-transfer', 'The harbor lantern glows.'], ['format-transfer', 'The harbor lantern glows.'],
]) test(`${key} produces its intended guidance using real operations and a synthetic host`, async () => {
    const example = registry.getNodeGuideExample(key), before = structuredClone(example.graph);
    const run = await syntheticRun(example.graph, expected);
    assert.equal(run.requests, ['context', 'style-transfer', 'format-transfer'].includes(key) ? 1 : 0);
    assert.deepEqual(example.graph, before);
});

test('Combine assembles a stable notes section before modern review', async () => {
    const example = registry.getNodeGuideExample('combine'), run = await syntheticRun(example.graph);
    assert.equal(run.requests, 0);
    assert.equal(run.settlement.terminals.length, 1);
    assert.equal(run.settlement.terminals[0].artifact.text, 'The very very bright lantern lights North Harbor.\n\nObserved: one lantern by the harbor.');
});

for (const [key, id, kind] of [['pattern', 'scan', 'draft'], ['repair', 'repair', 'patches'], ['validate-patches', 'validate', 'candidate'], ['review-gate', 'gate', 'candidate']]) test(`${key} provides an executable connected inspection target`, async () => {
    const example = registry.getNodeGuideExample(key), target = { workflowId: example.graph.id, instancePath: [], nodeId: id, portId: 'out' };
    const run = await syntheticRun(example.graph, undefined, target);
    assert.equal(run.requests, 0);
    const unit = run.result.recording.units.find(unit => expandRecordAddress(run.result.recording, unit.address).nodeId === id);
    const port = unit.ports.find(p => p.direction === 'output' && run.result.recording.identities.strings[p.port] === 'out');
    assert.equal(run.result.recording.artifacts[port.artifact].value.kind, kind);
    if (key === 'repair') assert.match(example.expected, /Repair\.out.*Patches.*zero patches/, 'The guide must describe the actual Patches output verified above.');
    if (key === 'validate-patches') assert.match(example.expected, /Validate Patches\.out.*Candidate/);
    if (key === 'review-gate') assert.match(example.expected, /Review Gate\.out.*Candidate/);
});

test('Compose uses the approved complete five-node graph with no auxiliary model', () => {
    assert.equal(typeof registry.getNodeGuideExample, 'function');
    const example = registry.getNodeGuideExample('compose');
    assert.deepEqual(Object.values(example.graph.nodes).map(n => n.operation).sort(), ['on-send', 'generate-reply', 'review-publish', 'text', 'compose'].sort());
    assert.equal(Object.keys(example.graph.wires).length, 4);
    assert.equal(validateWorkflow(example.graph).data.callBound, 0);
    assert.equal(example.graph.nodes.direction.text, 'Describe the dark lighthouse and one sound from the water.');
});


for (const [key, id] of [['repair', 'repair'], ['validate-patches', 'validate'], ['review-gate', 'gate']]) {
    test(`${key} manual inspection excludes native generation from its dependency closure`, () => {
        const example = registry.getNodeGuideExample(key);
        const planner = prepareWorkflowPlanner(example.graph);
        const summary = planner.data.summarize({ workflowId: example.graph.id, instancePath: [], nodeId: id, portId: 'out' });
        assert.equal(summary.ok, true, JSON.stringify(summary));
        assert.equal(summary.data.requiresNativeGeneration, false);
        assert.equal(summary.data.callBound, 0);
    });
    test(`${key} promised Run to here works through public host preview without requests or publication`, async () => {
        const example = registry.getNodeGuideExample(key);
        const host = unifiedRecipeHost(example.graph, {
            request: async () => { throw Error('No auxiliary requests are needed'); },
            configureContext(c) { c.chat.push({ mes: 'The very very bright lantern lights North Harbor.', is_user: false, extra: {} }); },
        });
        const before = structuredClone(host.c.chat);
        try {
            const result = await host.controller.runTarget(example.graph, { workflowId: example.graph.id, instancePath: [], nodeId: id, portId: 'out' });
            assert.equal(result.ok, true, JSON.stringify(result.error));
            assert.equal(host.calls(), 0); assert.equal(host.saves(), 0);
            assert.deepEqual(result.reviewHandles, []); assert.deepEqual(host.c.chat, before);
            host.c.chat.push({ mes: 'Continue the scene.', is_user: true, extra: {} });
            const sent = await host.generate('A new native reply.');
            assert.equal(sent.ok, true, JSON.stringify(sent.error));
            assert.equal(host.calls(), 0); assert.equal(host.saves(), 0);
            assert.equal(host.c.chat.at(-1).mes, 'A new native reply.');
        } finally { host.controller.dispose(); }
    });
}

test('Pattern and Filter Text guide routes repeated hits once and retains an exact final Draft', async () => {
 const { hostHarness, retained } = await import('./helpers/pattern-routing-fixtures.mjs');
 const graph=registry.getNodeGuideExample('filter-text').graph;
 const h=hostHarness('First.\n\nvery very very very\n\nLast.');
 const result=await runWorkflowForHost(graph,h.ports,h.hooks);
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(h.effects.filters,1);assert.equal(h.effects.requests,0);
 assert.equal(retained(h.outputs,'scan','matches').value.totalOccurrences,3);assert.equal(retained(h.outputs,'filter').text,'First.\n\nLast.');
});
