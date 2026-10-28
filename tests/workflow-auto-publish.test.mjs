import assert from 'node:assert/strict';
import { test } from 'node:test';
import { starterGraph } from '../src/workflow/starters.js?v=0.30.1';
import { unifiedRecipeHost } from './helpers/unified-recipe-host.mjs';

function revisionGraph({ autoApply = true, revise = true } = {}) {
    const graph = starterGraph('unified-basic');
    graph.nodes['review-publish'].autoApply = autoApply;
    if (revise) {
        graph.nodes.revise = { id: 'revise', type: 'workflow', operation: 'revise-draft', phase: 'post', scope: 'whole', instructions: 'Tighten the prose.' };
        graph.wires.draft.to = 'revise';
        graph.wires.review = { id: 'review', route: 'wire', from: 'revise', fromPort: 'out', to: 'review-publish', toPort: 'draft' };
    }
    return graph;
}
const revisedResponse = async () => ({ ok: true, data: { text: 'Revised reply.', finish: 'stop' } });

test('automatic review publishes and selects one revised swipe after post-processing', async () => {
    let chatSaves = 0;
    const host = unifiedRecipeHost(revisionGraph(), { request: revisedResponse, configureContext(context) { context.saveChat = async () => { chatSaves++; }; } });
    try {
        const result = await host.generate('Native reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        const reply = host.c.chat.at(-1);
        assert.deepEqual(reply.swipes, ['Native reply.', 'Revised reply.']);
        assert.equal(reply.swipe_id, 1);
        assert.equal(reply.mes, 'Revised reply.');
        assert.equal(result.appliedLocally, true);
        assert.equal(result.automaticallyApplied, true);
        assert.equal(host.calls(), 1);
        assert.equal(chatSaves, 1);
        await host.c.eventSource.emit('GENERATION_ENDED', host.c.chat.length);
        assert.equal((await host.controller.apply(result.reviewHandles[0])).ok, true);
        assert.equal(reply.swipes.length, 2);
        assert.equal(chatSaves, 1);
        assert.equal(host.controller.lastAutomaticResult().result.automaticallyApplied, true);
    } finally { host.controller.dispose(); }
});

test('automatic review leaves unchanged native text without a duplicate swipe', async () => {
    let chatSaves = 0;
    const host = unifiedRecipeHost(revisionGraph({ revise: false }), { request: revisedResponse, configureContext(context) { context.saveChat = async () => { chatSaves++; }; } });
    try {
        const result = await host.generate('Native reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.deepEqual(host.c.chat.at(-1).swipes, ['Native reply.']);
        assert.equal(host.c.chat.at(-1).swipe_id, 0);
        assert.equal(host.calls(), 0);
        assert.equal(chatSaves, 0);
    } finally { host.controller.dispose(); }
});

test('effects-only opt-in without staged effects leaves the native reply and review pending', async () => {
    const graph = revisionGraph({ revise: false, autoApply: false });
    graph.nodes['review-publish'].autoApplyEffects = true;
    const host = unifiedRecipeHost(graph, { request: revisedResponse });
    try {
        const result = await host.generate('Native reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(result.automaticallyApplied, undefined);
        assert.equal(host.controller.candidateStatus(result.reviewHandles[0]).ok, true);
        assert.deepEqual(host.c.chat.at(-1).swipes, ['Native reply.']);
        assert.equal(host.calls(), 0);assert.equal(host.saves(), 0);
    } finally { host.controller.dispose(); }
});

test('manual review remains pending until explicitly applied', async () => {
    const graph = revisionGraph();
    delete graph.nodes['review-publish'].autoApply;
    const host = unifiedRecipeHost(graph, { request: revisedResponse });
    try {
        const result = await host.generate('Native reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.deepEqual(host.c.chat.at(-1).swipes, ['Native reply.']);
        assert.equal(host.controller.candidateStatus(result.reviewHandles[0]).ok, true);
        assert.equal((await host.controller.apply(result.reviewHandles[0])).ok, true);
        assert.deepEqual(host.c.chat.at(-1).swipes, ['Native reply.', 'Revised reply.']);
    } finally { host.controller.dispose(); }
});

test('failed post-processing cannot automatically publish a swipe', async () => {
    const host = unifiedRecipeHost(revisionGraph(), { request: async () => ({ ok: false, error: { code: 'REQUEST_FAILED', message: 'Synthetic failure.' } }) });
    try {
        const result = await host.generate('Native reply.');
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'REQUEST_FAILED');
        assert.deepEqual(host.c.chat.at(-1).swipes, ['Native reply.']);
        assert.deepEqual(result.reviewHandles, []);
    } finally { host.controller.dispose(); }
});

test('automatic publication rolls back when the chat save fails', async () => {
    const host = unifiedRecipeHost(revisionGraph(), { request: revisedResponse, configureContext(context) { context.saveChat = async () => false; } });
    try {
        const result = await host.generate('Native reply.');
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'APPLY_FAILED');
        assert.deepEqual(host.c.chat.at(-1).swipes, ['Native reply.']);
        assert.equal(host.c.chat.at(-1).mes, 'Native reply.');
    } finally { host.controller.dispose(); }
});

test('manual target previews never use automatic publication', async () => {
    const graph = revisionGraph();
    graph.nodes.snapshot = { id: 'snapshot', type: 'workflow', operation: 'reply-snapshot' };
    graph.wires.draft.from = 'snapshot';
    graph.wires.draft.fromPort = 'out';
    const host = unifiedRecipeHost(graph, { request: revisedResponse });
    try {
        const now = new Date().toISOString();
        host.c.chat.push({ mes: 'Native reply.', is_user: false, extra: {}, gen_started: now, gen_finished: now, swipe_id: 0, swipes: ['Native reply.'], swipe_info: [{ gen_started: now, gen_finished: now, extra: {} }] });
        const result = await host.controller.runTarget(graph, { workflowId: graph.id, instancePath: [], nodeId: 'revise', portId: 'out' });
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.deepEqual(host.c.chat.at(-1).swipes, ['Native reply.']);
        assert.deepEqual(result.reviewHandles, []);
    } finally { host.controller.dispose(); }
});

test('cancelling a post-process request prevents late automatic publication', async () => {
    const host = unifiedRecipeHost(revisionGraph(), { request: async () => {
        host.controller.cancel('Synthetic cancellation');
        return revisedResponse();
    } });
    try {
        const result = await host.generate('Native reply.');
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'ABORTED');
        assert.deepEqual(host.c.chat.at(-1).swipes, ['Native reply.']);
        assert.deepEqual(result.reviewHandles, []);
    } finally { host.controller.dispose(); }
});

test('multiple automatic review terminals cannot arbitrarily select a candidate', async () => {
    const graph = revisionGraph();
    graph.nodes.secondReview = { id: 'secondReview', type: 'workflow', operation: 'review-publish', autoApply: true };
    graph.wires.secondReview = { id: 'secondReview', route: 'wire', from: 'revise', fromPort: 'out', to: 'secondReview', toPort: 'draft' };
    graph.runTargets.push({ instancePath: [], nodeId: 'secondReview' });
    const host = unifiedRecipeHost(graph, { request: revisedResponse });
    try {
        const result = await host.generate('Native reply.');
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'AUTO_APPLY_AMBIGUOUS');
        assert.deepEqual(host.c.chat.at(-1).swipes, ['Native reply.']);
        assert.equal(result.reviewHandles.length, 2);
        assert.equal(host.controller.candidateStatus(result.reviewHandles[0]).ok, true);
    } finally { host.controller.dispose(); }
});

test('mixed automatic reply and effects-only terminals cannot choose an ambiguous review', async () => {
    const graph = revisionGraph({ revise: false });
    graph.nodes.secondReview = { id: 'secondReview', type: 'workflow', operation: 'review-publish', autoApplyEffects: true };
    graph.wires.secondReview = { id: 'secondReview', route: 'wire', from: 'generate-reply', fromPort: 'draft', to: 'secondReview', toPort: 'draft' };
    graph.runTargets.push({ instancePath: [], nodeId: 'secondReview' });
    const host = unifiedRecipeHost(graph, { request: revisedResponse });
    try {
        const result = await host.generate('Native reply.');
        assert.equal(result.error.code, 'AUTO_APPLY_AMBIGUOUS');
        assert.deepEqual(host.c.chat.at(-1).swipes, ['Native reply.']);
        assert.equal(host.saves(), 0);assert.equal(result.reviewHandles.length, 2);
    } finally { host.controller.dispose(); }
});

test('automatic publication accepts connected staged story changes through settlement', async () => {
    const graph = revisionGraph();
    graph.nodes.read = { id: 'read', type: 'workflow', operation: 'read-file', targetId: 'notes.txt' };
    graph.nodes.body = { id: 'body', type: 'workflow', operation: 'draft-text' };
    graph.nodes.write = { id: 'write', type: 'workflow', operation: 'write-file', mode: 'append' };
    graph.wires.reference = { id: 'reference', route: 'wire', from: 'read', fromPort: 'reference', to: 'write', toPort: 'reference' };
    graph.wires.body = { id: 'body', route: 'wire', from: 'revise', fromPort: 'out', to: 'body', toPort: 'draft' };
    graph.wires.text = { id: 'text', route: 'wire', from: 'body', fromPort: 'out', to: 'write', toPort: 'text' };
    graph.runTargets.push({ instancePath: [], nodeId: 'write' });
    const host = unifiedRecipeHost(graph, { request: revisedResponse, documents: [{ targetId: 'notes.txt', name: 'Notes', format: 'text', content: 'Prior', visibility: { kind: 'public' } }] });
    try {
        const result = await host.generate('Native reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.deepEqual(host.c.chat.at(-1).swipes, ['Native reply.', 'Revised reply.']);
        assert.equal(result.settlement.status, 'settled');
        assert.equal(host.c.chatMetadata.latticeDocuments['default-user']['notes.txt'].content, 'Prior\nRevised reply.');
        assert.equal(host.saves(), 1);
        assert.equal((await host.controller.apply(result.reviewHandles[0])).ok, true);
        assert.equal(host.saves(), 1);
    } finally { host.controller.dispose(); }
});

test('a new Send cannot generate during automatic saving or be replaced by its late result', async () => {
    let releaseSave, enteredSave;
    const saving = new Promise(resolve => { enteredSave = resolve; });
    const save = new Promise(resolve => { releaseSave = resolve; });
    const host = unifiedRecipeHost(revisionGraph(), { request: revisedResponse, configureContext(context) { context.saveChat = async () => { enteredSave(); return save; }; } });
    try {
        const first = host.generate('Native reply.');
        await saving;
        await host.c.eventSource.emit('GENERATION_STARTED', 'normal', {}, false);
        let aborted = 0;
        const second = await host.controller.beforeGenerate(host.c.chat, 8192, () => { aborted++; }, 'normal');
        assert.equal(second.error?.code, 'BUSY');
        assert.equal(aborted, 1, 'The overlapping native request must be stopped');
        releaseSave();
        await first;
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(host.controller.lastResult().error?.code, 'BUSY', 'The older save must not replace a newer diagnostic');
        assert.deepEqual(host.c.chat.at(-1).swipes, ['Native reply.']);
    } finally { releaseSave(); host.controller.dispose(); }
});

test('recovering partial automatic settlement updates the retained automatic result', async () => {
    const graph = revisionGraph();
    graph.nodes.body = { id: 'body', type: 'workflow', operation: 'draft-text' };
    graph.wires.body = { id: 'body', route: 'wire', from: 'revise', fromPort: 'out', to: 'body', toPort: 'draft' };
    for (const id of ['first', 'second']) {
        graph.nodes['read-' + id] = { id: 'read-' + id, type: 'workflow', operation: 'read-file', targetId: id + '.txt' };
        graph.nodes['write-' + id] = { id: 'write-' + id, type: 'workflow', operation: 'write-file', mode: 'append' };
        graph.wires['reference-' + id] = { id: 'reference-' + id, route: 'wire', from: 'read-' + id, fromPort: 'reference', to: 'write-' + id, toPort: 'reference' };
        graph.wires['text-' + id] = { id: 'text-' + id, route: 'wire', from: 'body', fromPort: 'out', to: 'write-' + id, toPort: 'text' };
        graph.runTargets.push({ instancePath: [], nodeId: 'write-' + id });
    }
    const host = unifiedRecipeHost(graph, { request: revisedResponse,
        documents: ['first', 'second'].map(id => ({ targetId: id + '.txt', name: id, format: 'text', content: 'Prior', visibility: { kind: 'public' } })),
        configureContext(context) { context.saveChat = async () => {
            context.chatMetadata.latticeDocuments = { 'default-user': { 'second.txt': { targetId: 'second.txt', revision: 1, format: 'text', content: 'Concurrent text', receipts: [], scope: { userId: 'default-user', chatId: 'Story-2' } } } };
        }; },
    });
    try {
        const result = await host.generate('Native reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(result.settlement.status, 'partial');
        assert.equal(result.automaticallyApplied, true);
        delete host.c.chatMetadata.latticeDocuments['default-user']['second.txt'];
        const retried = await host.controller.retryPersistence(result.reviewHandles[0]);
        assert.equal(retried.ok, true, JSON.stringify(retried.error));
        assert.equal(retried.settlement.status, 'settled');
        assert.equal(host.controller.lastAutomaticResult().result.settlement.status, 'settled');
        assert.deepEqual(host.c.chat.at(-1).swipes, ['Native reply.', 'Revised reply.']);
        assert.equal(host.calls(), 1);
    } finally { host.controller.dispose(); }
});
