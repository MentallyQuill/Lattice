import assert from 'node:assert/strict';
import {createActorState} from '../../src/workflow/introspection/contracts.js';
import {describeIntrospection, executeIntrospection} from '../../src/workflow/introspection/nodes.js';

function artifact(result) {
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.artifact;
}
const initialized = createActorState({chatId: 'demo-chat', actorId: 'mara'});
if (!initialized.ok) throw new Error(initialized.error.message);
const state = initialized.data;
const context = {kind: 'context', messages: [
    {id: 'apology', revision: 'r1', role: 'user', text: 'The player apologizes.', visibleTo: ['mara']},
    {id: 'secret', revision: 'r1', role: 'user', text: 'A different actor hides the key.', visibleTo: ['other']},
]};
const visible = artifact(await executeIntrospection({
    type: 'workflow', operation: 'context', operationVersion: 1, mode: 'perspective', actorId: 'mara',
}, {context}));
assert.deepEqual(visible.messages.map(message => message.id), ['apology']);

const node = {type: 'workflow', operation: 'reflect', operationVersion: 1, mode: 'character', maxTokens: 512};
const description = describeIntrospection(node);
assert.equal(description.ok, true);
assert.equal(description.data.descriptor.requestBound, 1);
let calls = 0;
// A deterministic completion fixture makes this example offline. Replace request with
// your already resolved model transport, returning the same Result/completion shape.
const ports = {request: async ({messages, maxTokens, signal}) => {
    assert.equal(signal?.aborted ?? false, false);
    assert.equal(maxTokens, 512);
    assert.ok(messages.some(message => message.content.includes('The player apologizes.')));
    assert.ok(messages.every(message => !message.content.includes('hides the key')));
    calls++;
    return {ok: true, data: {finish: 'stop', text: JSON.stringify({
        brief: 'Mara considers accepting the apology.', appraisals: ['Sincerity is still uncertain.'],
        conflicts: [], recalls: [], sceneChanges: [], behaviorHints: ['Answer cautiously.'],
        attentionHints: ['Watch for consistent conduct.'], recalledEpisodeIds: [],
    })}};
}};
const assessment = artifact(await executeIntrospection(node, {context: visible, state}, ports));
const guidance = artifact(await executeIntrospection({
    type: 'workflow', operation: 'express', operationVersion: 1, mode: 'behavior',
}, {assessment, state, context: visible}, ports));
assert.equal(calls, 1); // Express Behavior uses no request.
assert.equal(guidance.kind, 'guidance');
assert.equal(state.value.store.version, 0); // Neither operation writes memory.
console.log(JSON.stringify({calls, assessment: assessment.value.payload.brief, guidance: guidance.text}, null, 2));
