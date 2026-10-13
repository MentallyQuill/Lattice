import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getNodeGuideExample } from '../src/workflow/node-guide-examples.js';
import { starterGraph } from '../src/workflow/starters.js';
import { validateWorkflow } from '../src/workflow/contracts.js';
import { graphSemanticSignature, graphDocumentSignature } from '../src/workflow/ports.js';
import { runWorkflowForHost } from '../src/workflow/runtime.js';

const insertion = await import('../src/workflow/node-guide-insertion.js').catch(() => ({}));
const empty = () => ({ ...starterGraph('unified-basic'), id: 'destination', name: 'Keep my name', nodes: {}, wires: {}, customSetting: { keep: true } });
test('empty roots receive a complete fresh graph in one pure prepared edit', () => {
    assert.equal(typeof insertion.prepareNodeGuideInsertion, 'function');
    const destination = empty(), example = getNodeGuideExample('compose'), before = structuredClone(destination), source = structuredClone(example);
    const result = insertion.prepareNodeGuideInsertion(destination, example);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.added.nodes.length, 5);
    assert.equal(result.data.candidate.id, destination.id);
    assert.equal(result.data.candidate.name, destination.name);
    assert.deepEqual(result.data.candidate.customSetting, destination.customSetting);
    assert.equal(validateWorkflow(result.data.candidate).ok, true);
    assert.equal(result.data.baseSignature, graphSemanticSignature(destination));
    assert.equal(result.data.baseDocumentSignature, graphDocumentSignature(destination));
    assert.ok(result.data.added.nodes.every(id => !Object.hasOwn(example.graph.nodes, id)));
    assert.deepEqual(destination, before); assert.deepEqual(example, source);
});
test('Compose reuses compatible native lifecycle nodes and rejects occupied guidance', () => {
    assert.equal(typeof insertion.prepareNodeGuideInsertion, 'function');
    const destination = starterGraph('unified-basic'), before = structuredClone(destination), example = getNodeGuideExample('compose');
    const result = insertion.prepareNodeGuideInsertion(destination, example);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.added.nodes.length, 2);
    for (const id of Object.keys(destination.nodes)) assert.deepEqual(result.data.candidate.nodes[id], destination.nodes[id]);
    assert.equal(Object.values(result.data.candidate.nodes).filter(n => n.operation === 'generate-reply').length, 1);
    assert.equal(validateWorkflow(result.data.candidate).ok, true);
    const again = insertion.prepareNodeGuideInsertion(result.data.candidate, example);
    assert.equal(again.ok, false); assert.match(again.error.message, /guidance.*occupied|occupied.*guidance/i);
    assert.deepEqual(destination, before);
});
test('response-path examples splice only a canonical starter Draft edge', () => {
    assert.equal(typeof insertion.prepareNodeGuideInsertion, 'function');
    const destination = starterGraph('unified-basic'), example = getNodeGuideExample('combine');
    const result = insertion.prepareNodeGuideInsertion(destination, example);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.data.removedEdgeIds, ['draft']);
    assert.match(result.data.message, /starter.*Draft|Draft.*starter/i);
    assert.equal(validateWorkflow(result.data.candidate).ok, true);
    const custom = starterGraph('unified-basic'); custom.wires.draft.id = 'custom'; custom.wires.custom = custom.wires.draft; delete custom.wires.draft;
    const blocked = insertion.prepareNodeGuideInsertion(custom, example);
    assert.equal(blocked.ok, false); assert.match(blocked.error.message, /custom|occupied/i);
});
test('read-only and helper scopes give actionable reasons without editing', () => {
    assert.equal(typeof insertion.prepareNodeGuideInsertion, 'function');
    const destination = starterGraph('unified-basic'), example = getNodeGuideExample('compose');
    const readonly = insertion.prepareNodeGuideInsertion(destination, example, { readOnly: true });
    assert.equal(readonly.ok, false); assert.match(readonly.error.message, /read.only/i);
    const helper = insertion.prepareNodeGuideInsertion(destination, example, { viewPath: ['helper'] });
    assert.equal(helper.ok, false); assert.match(helper.error.message, /root|top.level/i);
});
test('incompatible lifecycle settings are blocked and unrelated content is preserved', () => {
    assert.equal(typeof insertion.prepareNodeGuideInsertion, 'function');
    const destination = starterGraph('unified-basic'); destination.nodes['generate-reply'].budgetTokens = 400;
    assert.equal(insertion.prepareNodeGuideInsertion(destination, getNodeGuideExample('compose')).ok, false);
    const custom = starterGraph('unified-basic'); custom.nodes.note = { id: 'note', type: 'note', content: 'Keep this', x: -50, y: 90 };
    const result = insertion.prepareNodeGuideInsertion(custom, getNodeGuideExample('compose'));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.data.candidate.nodes.note, custom.nodes.note);
});

async function runCompose(graph) {
    let generations = 0, published, guidance;
    const text = 'The lighthouse stands above the sound of waves.';
    const draft = { kind: 'draft', text, source: { token: 'guide-merged-fixture', originalText: text } };
    const result = await runWorkflowForHost(graph, { signal: AbortSignal.timeout(5000), request: () => { throw new Error('Providers forbidden'); } }, {
        executeHostOperation(node, inputs) {
            if (node.operation === 'on-send') return { ok: true, outputs: { activation: { kind: 'data', value: { synthetic: true } } } };
            assert.equal(node.operation, 'generate-reply'); generations++; guidance = structuredClone(inputs.guidance);
            return { ok: true, outputs: { draft, metadata: { kind: 'data', value: { synthetic: true } } } };
        },
        settle: value => { published = structuredClone(value); return { ok: true }; },
    });
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.actualCalls, 0); assert.equal(generations, 1);
    assert.deepEqual(guidance, { kind: 'guidance', text: "Describe the dark lighthouse and one sound from the water.\n\nLeave the player's next action to them." });
    assert.equal(published.terminals.length, 1); assert.equal(published.terminals[0].artifact.kind, 'candidate');
    assert.equal(published.terminals[0].artifact.reviewRequired, true); assert.equal(published.terminals[0].artifact.text, text);
}

test('full and starter-merged Compose execute once and deliver the exact guidance to native generation', async t => {
    const example = getNodeGuideExample('compose');
    for (const destination of [empty(), starterGraph('unified-basic')]) {
        const before = structuredClone(destination), source = structuredClone(example), result = insertion.prepareNodeGuideInsertion(destination, example);
        assert.equal(result.ok, true, JSON.stringify(result));
        await runCompose(result.data.candidate);
        assert.deepEqual(destination, before); assert.deepEqual(example, source);
    }
});

test('portable insertion rebases portals and dependent definitions, strips local bindings and repeats with fresh identities', () => {
    const example = getNodeGuideExample('subgraph'), before = structuredClone(example), destination = empty();
    const textNode = Object.values(example.graph.nodes).find(n => n.operation === 'text');
    const edge = Object.values(example.graph.wires).find(w => w.route === 'wire' && w.from === textNode.id);
    example.graph.portals.publisher = { id: 'publisher', label: 'Portable source', source: { nodeId: textNode.id, portId: edge.fromPort }, kind: 'text' };
    example.graph.wires[edge.id] = { id: edge.id, route: 'portal', portalId: 'publisher', to: edge.to, toPort: edge.toPort };
    textNode.profileId = 'local-secret-profile'; textNode.model = 'saved-model';
    const source = structuredClone(example), first = insertion.prepareNodeGuideInsertion(destination, example);
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.ok(first.data.added.definitions.length);
    assert.equal(first.data.added.portals.length, 1);
    assert.equal(first.data.candidate.nodes[first.data.identityMap.nodes[textNode.id]].profileId, null);
    assert.equal(first.data.candidate.nodes[first.data.identityMap.nodes[textNode.id]].model, 'saved-model');
    assert.equal(first.data.candidate.portals[first.data.added.portals[0]].source.nodeId, first.data.identityMap.nodes[textNode.id]);
    const occupied = insertion.prepareNodeGuideInsertion(first.data.candidate, example);
    assert.equal(occupied.ok, false, 'A second response example must preserve the first response path.');
    const reserved = empty();
    for (const kind of ['nodes', 'wires', 'portals']) for (const id of first.data.added[kind]) reserved.nodes[id] = { id, type: 'note', content: 'Keep this identity', x: 0, y: 0 };
    reserved.definitions = structuredClone(first.data.candidate.definitions);
    const second = insertion.prepareNodeGuideInsertion(reserved, example);
    assert.equal(second.ok, true, JSON.stringify(second));
    for (const kind of ['nodes', 'wires', 'portals']) assert.ok(second.data.added[kind].every(id => !first.data.added[kind].includes(id)));
    assert.ok(second.data.added.definitions.every(key => !first.data.added.definitions.includes(key)));
    assert.equal(validateWorkflow(second.data.candidate).ok, true);
    assert.deepEqual(example, source);
    assert.deepEqual(destination, empty());
    assert.ok(before.graph.definitions);
});

test('every guide can insert its complete parent into an empty unified root', () => {
    const keys = ['compose', 'repair', 'validate-patches', 'review-gate', 'apply-reply', 'guidance', 'context', 'confidence-gate', 'combine', 'subgraph', 'subgraph-input', 'subgraph-output', 'effect-author', 'stage-outcome'];
    for (const key of keys) {
        const result = insertion.prepareNodeGuideInsertion(empty(), getNodeGuideExample(key));
        assert.equal(result.ok, true, `${key}: ${JSON.stringify(result)}`);
        assert.equal(validateWorkflow(result.data.candidate).ok, true, key);
    }
});

test('legacy publication replacement remains useful when added to the native starter', () => {
    const result = insertion.prepareNodeGuideInsertion(starterGraph('unified-basic'), getNodeGuideExample('apply-reply'));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.data.added.nodes.length, 'Add the replacement explanation beside the already compatible lifecycle.');
    assert.equal(Object.values(result.data.candidate.nodes).some(n => n.operation === 'apply-reply'), false);
});


test('allocator callbacks cannot refresh a stale guide insertion base or history generation', async t => {
    const history = await import('../src/history.js?v=0.27.1');
    for (const change of ['document', 'coordinates', 'reset', 'undo']) await t.test(change, () => {
        const destination = starterGraph('unified-basic'); history.track(destination);
        let calls = 0;
        const result = insertion.prepareNodeGuideInsertion(destination, getNodeGuideExample('compose'), {
            allocateId(kind, id) {
                if (!calls++) {
                    if (change === 'document') destination.name = 'Allocator changed my name';
                    if (change === 'coordinates') destination.nodes['on-send'].x += 17;
                    if (change === 'reset') history.reset(destination);
                    if (change === 'undo') {
                        const edit = structuredClone(destination); edit.name = 'Temporary edit';
                        history.commitGraphDocument(destination, edit); assert.ok(history.undo(destination));
                    }
                }
                return `guide-${kind}-${id}`;
            },
        });
        assert.ok(calls > 0);
        assert.equal(result.ok, false, `${change}: allocator changes must not receive fresh authority`);
        assert.equal(result.error.code, 'STALE_DOCUMENT', change);
        if (change === 'document') assert.equal(destination.name, 'Allocator changed my name');
        history.dispose(destination);
    });
});


test('guide insertion rejects root, option and example getters without evaluating them', () => {
    for (const location of ['schema', 'runtime', 'mode', 'node', 'option', 'example', 'allocator']) {
        const destination = starterGraph('unified-basic'), example = getNodeGuideExample('compose');
        let reads = 0;
        const getter = { enumerable: true, configurable: true, get() { reads++; return 'unsafe'; } };
        const options = {};
        if (['schema', 'runtime', 'mode'].includes(location)) Object.defineProperty(destination, location, getter);
        if (location === 'node') Object.defineProperty(destination.nodes['on-send'], 'enabled', getter);
        if (location === 'option') Object.defineProperty(options, 'readOnly', getter);
        if (location === 'example') Object.defineProperty(example, 'graph', getter);
        if (location === 'allocator') options.allocateId = (kind, id) => {
            Object.defineProperty(destination, 'schema', getter); return `safe-${kind}-${id}`;
        };
        const result = insertion.prepareNodeGuideInsertion(destination, example, options);
        assert.equal(result.ok, false, location);
        assert.equal(reads, 0, location);
    }
});

test('rewired guide candidate is bound to its original root and commits as one undo step', async () => {
    const history = await import('../src/history.js?v=0.27.1');
    const { captureGraphEditContext, commitPreparedGraph } = await import('../src/workflow/transactions.js?v=0.27.1');
    const { checkedCandidateSnapshot } = await import('../src/workflow/checked-candidate.js?v=0.27.1');
    const destination = starterGraph('unified-basic'), before = structuredClone(destination);
    history.track(destination);
    const context = captureGraphEditContext(destination, () => ({sessionId: 'guide', viewPath: [], readOnly: false}));
    const prepared = insertion.prepareNodeGuideInsertion(destination, getNodeGuideExample('combine'), {
        allocateId: (kind, id) => `guide-${kind}-${id}`,
    });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.deepEqual(prepared.data.removedEdgeIds, ['draft']);
    assert.deepEqual(checkedCandidateSnapshot(destination, prepared.data), prepared.data.candidate);
    assert.equal(checkedCandidateSnapshot(structuredClone(destination), prepared.data), null);
    const committed = commitPreparedGraph(destination, {...prepared.data, context: context.data});
    assert.equal(committed.ok, true, JSON.stringify(committed));
    assert.ok(history.undo(destination)); assert.deepEqual(destination, before);
    assert.equal(history.undo(destination), null);
    history.dispose(destination);
});
