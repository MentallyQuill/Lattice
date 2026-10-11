import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Worker as ThreadWorker } from 'node:worker_threads';
import { STARTERS, starterGraph, installStarter } from '../src/workflow/starters.js';
import { parseWorkflow, exportWorkflow, parseSubgraph } from '../src/workflow/packages.js';
import { resolveWorkflow } from '../src/workflow/resolve.js';
import { createNativeWorkflowController } from '../src/workflow/host.js';

// Exercise the actual browser Worker entry in an isolated Node thread.
class BrowserWorker {
    constructor(url) {
        this.worker = new ThreadWorker(new URL('./fixtures/text-rules-node-worker.mjs', import.meta.url), { workerData: { entryURL: url.href } });
        this.handlers = new Map();
    }
    addEventListener(type, callback) {
        const handler = type === 'message' ? data => { if (!data?.fixtureStarted) callback({ data }); } : error => callback({ error });
        this.handlers.set(callback, handler); this.worker.on(type, handler);
    }
    removeEventListener(type, callback) { this.worker.off(type, this.handlers.get(callback)); this.handlers.delete(callback); }
    postMessage(data) { this.worker.postMessage(data); }
    terminate() { return this.worker.terminate(); }
}
const text = 'It was very very quiet.';
function fixture(graph) {
    let requests = 0;
    const message = { mes: text, is_user: false, swipe_id: 0, swipes: [text], swipe_info: [{ extra: {}, gen_started: 1, gen_finished: 2 }], extra: {}, gen_started: 1, gen_finished: 2 };
    const context = { chatId: 'tutorial-chat', characterId: 1, groupId: null, chat: [{ mes: 'Continue.', is_user: true }, message], extensionPrompts: {}, setExtensionPrompt(key, value) { this.extensionPrompts[key] = { value }; }, saveChat: async () => {}, updateMessageBlock: async () => {}, swipe: { refresh: async () => {} } };
    const controller = createNativeWorkflowController({ context: () => context, getGraph: () => graph, isEnabled: () => true, isBusy: () => false,
        countTokens: async value => ({ tokens: Math.ceil(value.length / 4), method: 'tutorial-fixture' }),
        resolveBinding: () => { throw new Error('A zero-call example must not resolve a model.'); },
        request: async () => { requests++; throw new Error('A zero-call example must not call a model.'); },
        syncMesToSwipe(index) { const m = context.chat[index]; m.swipes[m.swipe_id] = m.mes; return true; },
        syncSwipeToMes(index, id) { const m = context.chat[index]; m.swipe_id = id; m.mes = m.swipes[id]; Object.assign(m, structuredClone(m.swipe_info[id])); return true; },
    });
    return { controller, context, message, requests: () => requests };
}

test('all examples are current, independent, portable and unarmed', async () => {
    for (const id of ['native-guidance', 'reviewed-de-slop', 'literal-cleanup', 'structured-guidance']) {
        const graph = starterGraph(id);
        const portable = JSON.parse(await readFile(new URL('../workflows/' + id + '.json', import.meta.url), 'utf8'));
        assert.deepEqual(exportWorkflow(graph), portable);
        assert.equal(parseWorkflow(JSON.stringify(portable)).ok, true);
        assert.equal(graph.schema, 3); assert.equal(graph.runtime, 2);
        assert.equal(resolveWorkflow(graph).ok, true);
        const first = installStarter(id), second = installStarter(id);
        assert.notEqual(first.id, second.id);
        assert.equal(STARTERS.find(item => item.id === id).callBound, id === 'native-guidance' ? 2 : id === 'reviewed-de-slop' ? 1 : 0);
        if (graph.schema === 3) {
            assert.equal(resolveWorkflow(first).ok, true);
            assert.equal(resolveWorkflow(second).ok, true);
            for (const wire of Object.values(first.wires)) { assert.ok(first.nodes[wire.from]); assert.ok(first.nodes[wire.to]); }
        }
    }
});

test('literal cleanup runs with a real Worker and requires an exact current terminal before Apply', async () => {
    const priorWorker = globalThis.Worker; globalThis.Worker = BrowserWorker;
    try {
        const graph = starterGraph('literal-cleanup'), f = fixture(graph);
        const result = await f.controller.runPost(graph);
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(result.actualCalls, 0); assert.equal(result.callBound, 0); assert.equal(f.requests(), 0);
        assert.equal(f.message.mes, text); assert.equal(result.reviewHandles.length, 1);
        assert.equal(result.recording.artifacts.some(item => item.kind === 'patches'), true);
        assert.equal((await f.controller.apply({ handleId: 'invented', runId: result.runId, terminal: result.reviewHandles[0].terminal })).ok, false);
        const applied = await f.controller.apply(result.reviewHandles[0]);
        assert.equal(applied.ok, true, JSON.stringify(applied.error));
        assert.equal(f.message.mes, 'It was very quiet.'); assert.equal(f.message.swipes[0], text);
        assert.equal(f.requests(), 0);
        const targetFixture = fixture(graph), target = result.reviewHandles[0].terminal;
        const inspected = await targetFixture.controller.runTarget(graph, target);
        assert.equal(inspected.ok, true, JSON.stringify(inspected.error)); assert.deepEqual(inspected.reviewHandles, []);
        assert.equal(targetFixture.message.mes, text);
    } finally { if (priorWorker === undefined) delete globalThis.Worker; else globalThis.Worker = priorWorker; }
});

test('structured guidance previews without publication and uses the existing native Send publication path', async () => {
    const graph = starterGraph('structured-guidance'), f = fixture(graph);
    assert.equal(Object.values(graph.nodes).some(node => node.operation === 'scene-context'), false);
    const target = { workflowId: graph.id, instancePath: [], nodeId: 'compose-guidance', portId: 'out' };
    const inspected = await f.controller.runTarget(graph, target);
    assert.equal(inspected.ok, true, JSON.stringify(inspected.error)); assert.deepEqual(f.context.extensionPrompts, {});
    const result = await f.controller.runPre(graph);
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.actualCalls, 0); assert.equal(f.requests(), 0);
    assert.deepEqual(f.context.extensionPrompts, {});
    const sent = await f.controller.beforeGenerate(f.context.chat, 8192, () => {});
    assert.equal(sent.ok, true, JSON.stringify(sent.error)); assert.equal(sent.actualCalls, 0); assert.equal(f.requests(), 0);
    assert.deepEqual(Object.values(f.context.extensionPrompts).map(prompt => prompt.value), ['Direction: A quiet conversation.\nConstraint: Let the user choose their next action.']);
    assert.equal(f.message.mes, text);
    assert.deepEqual(result.reviewHandles, []);
});

test('standalone cleanup subgraph has actual Draft/Patches boundaries and an editable rules parameter', async () => {
    const parsed = parseSubgraph(await readFile(new URL('../workflows/subgraphs/literal-cleanup.json', import.meta.url), 'utf8'));
    assert.equal(parsed.ok, true, JSON.stringify(parsed.error));
    const definition = parsed.data.definition;
    assert.deepEqual(definition.interface.map(port => [port.id, port.direction, port.kind]), [['draft', 'input', 'draft'], ['patches', 'output', 'patches']]);
    assert.deepEqual(definition.parameters.map(parameter => parameter.target.controlId), ['rules']);
    const root = starterGraph('literal-cleanup');
    root.definitions = { [JSON.stringify([definition.id, definition.version, definition.semanticHash])]: definition };
    const old = root.nodes['text-rules'];
    root.nodes['text-rules'] = { id: old.id, type: 'subgraph', definition: { id: definition.id, version: definition.version, semanticHash: definition.semanticHash }, x: old.x, y: old.y };
    root.wires['wire-1'].toPort = 'draft'; root.wires['wire-2'].fromPort = 'patches';
    const priorWorker = globalThis.Worker; globalThis.Worker = BrowserWorker;
    try {
        const f = fixture(root), result = await f.controller.runPost(root);
        assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.actualCalls, 0);
        assert.equal((await f.controller.apply(result.reviewHandles[0])).ok, true); assert.equal(f.message.mes, 'It was very quiet.');
    } finally { if (priorWorker === undefined) delete globalThis.Worker; else globalThis.Worker = priorWorker; }
});
