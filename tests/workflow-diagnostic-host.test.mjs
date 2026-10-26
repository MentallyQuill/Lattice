import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNativeWorkflowController } from '../src/workflow/host.js';
import { fixtureGraph } from './helpers/workflow-fixtures.mjs';

test('host opens a diagnostic capture before activity observers can replace the chat', async () => {
    const graph = fixtureGraph('structured-guidance');
    const context = { chatId: 'original-chat', characterId: 1, groupId: null, chat: [], extensionPrompts: {} };
    let user = 'original-user', captured, discarded = 0;
    const events = [], results = [];
    const controller = createNativeWorkflowController({
        context: () => context, userId: () => user, isBusy: () => false,
        createDiagnosticCapture(origin) {
            captured = origin;
            return { event: event => events.push(event), finish: result => results.push(result), discard: () => discarded++ };
        },
    });
    controller.subscribeActivity(activity => {
        if (activity?.busy) { context.chatId = 'replacement-chat'; user = 'replacement-user'; }
    });
    const result = await controller.runTarget(graph, { workflowId: graph.id, instancePath: [], nodeId: 'compose-json', portId: 'out' });
    assert.ok(captured, 'run must have an immutable diagnostic owner');
    assert.equal(captured.userId, 'original-user');
    assert.equal(captured.chatId, 'original-chat');
    assert.equal(captured.characterId, 1);
    assert.equal(captured.workflowId, graph.id);
    assert.equal(captured.mode, 'target');
    assert.equal(captured.native, false);
    assert.ok(Object.isFrozen(captured));
    assert.equal(captured.runId, result.runId);
    assert.ok(events.some(event => event.type === 'plan'));
    assert.equal(results.length, 0, 'a replacement scope cannot be saved under the original owner');
    assert.equal(discarded, 1);
});

test('diagnostic observer failures do not change workflow execution or its live result', async () => {
    const graph = fixtureGraph('structured-guidance');
    const context = { chatId: 'chat', characterId: 1, groupId: null, chat: [], extensionPrompts: {} };
    let events = 0, finishes = 0;
    const controller = createNativeWorkflowController({
        context: () => context, userId: () => 'user', isBusy: () => false,
        createDiagnosticCapture() { return { event() { events++; throw Error('diagnostic event failure'); }, finish() { finishes++; return Promise.reject(Error('storage unavailable')); } }; },
    });
    const result = await controller.runTarget(graph, { workflowId: graph.id, instancePath: [], nodeId: 'compose-json', portId: 'out' });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(controller.lastResult(), result);
    assert.ok(events > 0);
    assert.equal(finishes, 1);
    await new Promise(resolve => setTimeout(resolve, 0));
});

test('manual native-boundary rejection is retained even without a runtime execution plan', async () => {
    const graph = fixtureGraph('structured-guidance');
    const results = [];
    let origin;
    const controller = createNativeWorkflowController({
        context: () => ({ chatId: 'chat', characterId: 1, groupId: null, chat: [], extensionPrompts: {} }),
        userId: () => 'user',
        createDiagnosticCapture(value) { origin = value; return { finish: result => results.push(result) }; },
    });
    const result = await controller.runTarget(graph, { workflowId: graph.id, instancePath: [], nodeId: 'generate-reply', portId: 'draft' });
    assert.equal(result.error.code, 'NATIVE_OWNER_MISSING');
    assert.equal(results.length, 1);
    assert.equal(results[0], result);
    assert.equal(origin.runId, result.runId);
});
