import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanced } from '../tools/remastered/advanced.mjs';
import { capstones } from '../tools/remastered/capstones.mjs';
import { FIXTURES } from '../tools/remastered/fixtures.mjs';
import { actor } from '../tools/remastered/shared.mjs';
import { createFileStore } from '../src/workflow/file-store.js';
import { executeFileNode } from '../src/workflow/operations/file-nodes.js';
import { executeProgressionState } from '../src/workflow/operations/progression-nodes.js';
import { executeIntrospection } from '../src/workflow/introspection/nodes.js';
import { createActorState, makeRecord } from '../src/workflow/introspection/contracts.js';
import { createMemoryService, createInMemoryBackend } from '../src/workflow/introspection/memory.js';

// Build the authored sources directly so these checks do not depend on regeneration.
const lessons = new Map([...advanced(), ...capstones()].map(entry => [entry.number, entry]));
const graphFor = number => lessons.get(number).packages[0].graph;
const data = value => ({ kind: 'data', value });
const must = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result; };
const inputWire = (graph, node, port) => {
    const wires = Object.values(graph.wires).filter(wire => wire.to === node && wire.toPort === port);
    assert.equal(wires.length, 1, `${node}.${port} has one source`);
    return wires[0];
};
const authoredData = (graph, id) => data(JSON.parse(graph.nodes[id + '-text'].text));

async function readState(graph, id, fixtureName, privateActor) {
    const node = graph.nodes[id];
    const files = createFileStore({
        scope: { userId: 'example-test', chatId: 'practice', ...(privateActor ? { actorId: privateActor } : {}) },
        authorizedTargets: [node.targetId], isCurrent: () => true, validateEvidence: async () => ({ ok: true }),
        load: async () => ({ ok: true, data: { targetId: node.targetId, revision: 0, format: 'json', content: JSON.stringify(FIXTURES[fixtureName]), receipts: [] } }),
        compareAndSwap: async () => { throw Error('Authored graph projection must not persist'); },
    });
    return must(await executeFileNode(node, {}, { root: true, phase: 'pre', files })).outputs;
}

test('lesson 18 searches scoped native episodes with its connected lighthouse Text', async () => {
    const graph = graphFor(18), wire = inputWire(graph, 'episodes', 'query');
    const source = graph.nodes[wire.from];
    assert.equal(source.operation, 'text');
    assert.equal(source.text, 'lighthouse');
    assert.equal(wire.fromPort, 'out');
    const initial = must(createActorState({ chatId: 'practice', actorId: actor }, { id: 'native-memory', version: 0 }, { episodes: [
        { id: 'lighthouse', text: 'Rowan returned to the lighthouse.', classification: 'interpretation', sourceRefs: [] },
        { id: 'current', text: 'The current scene is a quiet garden.', classification: 'interpretation', sourceRefs: [] },
    ] })).data;
    const events = must(makeRecord('events', initial.value, { events: [] }, [])).data;
    const memory = createMemoryService(createInMemoryBackend(initial, events));
    const recallNode = Object.fromEntries(['id', 'type', 'operation', 'operationVersion', 'mode', 'query', 'limit'].map(key => [key, graph.nodes.episodes[key]]));
    const recalled = must(await executeIntrospection(recallNode, { query: { kind: 'text', text: source.text } }, { root: true, memory }));
    assert.deepEqual(recalled.artifact.value.payload.episodes.map(episode => episode.id), ['lighthouse']);
    assert.deepEqual(recalled.artifact.value.scope, { chatId: 'practice', actorId: actor });
    assert.match(lessons.get(18).lesson.experiments[0].change, /Edit Text/);
});

test('lesson 25 projects the parsed live value and retains its exact save reference source', async () => {
    const graph = graphFor(25), wire = inputWire(graph, 'award', 'state');
    assert.equal(wire.from, 'progression-file');
    assert.equal(wire.fromPort, 'value');
    assert.equal(graph.nodes.progression, undefined, 'no redundant text decoder');
    assert.equal(inputWire(graph, 'before-experience', 'in').fromPort, 'value');
    assert.equal(inputWire(graph, 'save', 'reference').from, wire.from);
    assert.equal(inputWire(graph, 'save', 'reference').fromPort, 'reference');
    const outputs = await readState(graph, wire.from, 'player-progression.json');
    const projected = must(executeProgressionState({ mode: graph.nodes.award.mode }, {
        state: outputs.value, rules: authoredData(graph, 'rules'),
        events: data([{ eventId: 'delivery-1', eventType: 'objective-completed', identity: { occurrenceId: 'delivery-1' }, status: 'confirmed', evidence: { origin: 'native-example-evidence' } }]),
    }));
    assert.equal(projected.artifact.value.values[0].value, 100);
    assert.equal(projected.artifact.value.ledger.length, 1);
    assert.equal(projected.outputs.receipt.value.acceptance, 'pending');
    assert.deepEqual(projected.artifact.visibility, { kind: 'public' });
});

test('lesson 30 feeds private parsed state directly to decay and preserves private projection', async () => {
    const graph = graphFor(30), wire = inputWire(graph, 'decay', 'state');
    assert.equal(wire.from, 'relationship-state-file');
    assert.equal(wire.fromPort, 'value');
    assert.equal(graph.nodes['relationship-state'], undefined, 'no redundant text decoder');
    assert.equal(graph.nodes[wire.from].actorScope, 'selected');
    assert.equal(inputWire(graph, 'save', 'reference').from, wire.from);
    assert.equal(inputWire(graph, 'save', 'reference').fromPort, 'reference');
    const outputs = await readState(graph, wire.from, 'rowan-relationship.json', actor);
    const projected = must(executeProgressionState({ mode: graph.nodes.decay.mode }, {
        state: outputs.value, rules: authoredData(graph, 'decay-rules'), clock: data(FIXTURES['story-clock.json']),
    }));
    assert.deepEqual(outputs.value.visibility, { kind: 'actor-private', actorId: actor });
    assert.deepEqual(projected.artifact.visibility, outputs.value.visibility);
    const tension = projected.artifact.value.values.find(value => value.key === 'rowan-toward-iris-tension').value;
    assert.ok(Math.abs(tension - (2 - 780 / 10080)) < 1e-10);
    assert.equal(projected.outputs.receipt.value.acceptance, 'pending');
});
