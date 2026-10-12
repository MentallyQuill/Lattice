import assert from 'node:assert/strict';
import {createActorState, makeRecord, applyStateProposal} from '../../src/workflow/introspection/contracts.js';
import {createInMemoryBackend, createMemoryService} from '../../src/workflow/introspection/memory.js';
import {executeIntrospection} from '../../src/workflow/introspection/nodes.js';

function data(result) {
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.data;
}
function artifact(result) {
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.artifact;
}

const scope = {chatId: 'demo-chat', actorId: 'mara'};
const prior = data(createActorState(scope, {id: 'demo-store', version: 0}, {values: {trust: 0.2}}));
const source = {id: 'apology', revision: 'r1'};
const events = data(makeRecord('events', prior.value, {
    events: [{...source, text: 'The player apologizes for the insult.', settled: true}],
}, [source]));
const proposal = data(makeRecord('state-proposal', prior.value, {
    changes: [{op: 'upsert', collection: 'conditions', item: {
        id: 'guarded', text: 'Willing to listen, while trust remains guarded.',
        classification: 'interpretation', sourceRefs: [source],
    }}],
    values: {trust: 0.35},
}, [source]));

// A reducer returns a detached candidate. It does not mutate or increment the prior state.
const candidate = data(applyStateProposal(prior, proposal));
assert.equal(prior.value.payload.values.trust, 0.2);
assert.equal(candidate.value.payload.values.trust, 0.35);
assert.equal(candidate.value.store.version, 0);

// This backend is process-local demonstration storage, with fresh evidence from a callback.
// A real host must supply durable, coordinated compare-and-swap and source validation.
const memory = createMemoryService(createInMemoryBackend(prior, () => events));
const intent = artifact(await executeIntrospection({
    type: 'workflow', operation: 'memory', operationVersion: 1, mode: 'commit',
    idempotencyKey: 'demo-chat:apology:r1',
}, {proposal}, {root: true, phase: 'post'}));
assert.equal(artifact(await memory.read()).value.store.version, 0);

const ready = data(await memory.preflight(intent, {root: true}));
assert.equal(ready.status, 'ready');
const preview = await memory.commit(intent, {root: true, preview: true});
assert.equal(preview.ok, false);
assert.equal(artifact(await memory.read()).value.store.version, 0);

// Your application decides when its user has accepted the narrative and its effects.
// Only then call its owned service; a node's commit-intent output is not that authority.
const accepted = data(await memory.commit(intent, {root: true}));
assert.equal(accepted.applied, true);
assert.equal(accepted.acknowledged, true);
assert.equal(accepted.version, 1);
const replay = data(await memory.commit(intent, {root: true}));
assert.equal(replay.applied, false);
assert.equal(replay.version, 1);
console.log(JSON.stringify({candidateVersion: candidate.value.store.version, committedVersion: accepted.version, replayApplied: replay.applied}, null, 2));
