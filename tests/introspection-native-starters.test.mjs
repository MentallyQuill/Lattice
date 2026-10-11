import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { STARTERS, starterGraph, installStarter } from '../src/workflow/starters.js';
import { parseWorkflow, exportWorkflow } from '../src/workflow/packages.js';
import { resolveWorkflow } from '../src/workflow/resolve.js';
import { portsForNode } from '../src/workflow/catalog.js';
import { createNativeWorkflowController } from '../src/workflow/host.js';

const examples = [
    { id: 'reflect-and-express', phase: 'pre', calls: 1, roles: ['Analysis'], modes: ['scene-context', 'context:focus', 'memory:read', 'reflect:character', 'express:behavior', 'guidance'] },
    { id: 'internalize-and-commit', phase: 'post', calls: 1, roles: ['Analysis'], modes: ['memory:read', 'memory:read', 'internalize:experience', 'memory:commit'] },
    { id: 'consequence-clock', phase: 'post', calls: 0, roles: [], modes: ['memory:read', 'memory:read', 'state:track', 'memory:commit'] },
];

test('native Introspection starters are discoverable with their exact phase and call bound', () => {
    for (const example of examples) {
        const starter = STARTERS.find(entry => entry.id === example.id);
        assert.ok(starter, example.id + ' must be available in Workflow examples');
        assert.equal(starter.phase, example.phase);
        assert.equal(starter.callBound, example.calls);
        assert.deepEqual(starter.roles, example.roles);
    }
});

test('native Introspection examples round-trip with valid named pins and private local bindings', async () => {
    for (const example of examples) {
        const graph = starterGraph(example.id);
        assert.equal(graph.schema, 3); assert.equal(graph.runtime, 2);
        assert.equal(graph.mode, 'native-' + example.phase);
        assert.deepEqual(Object.values(graph.nodes).map(node => node.operation + (node.mode ? ':' + node.mode : '')), example.modes);
        assert.deepEqual(graph.roles, Object.fromEntries(example.roles.map(role => [role, { profileId: null, model: null }])));
        const resolved = resolveWorkflow(graph);
        assert.equal(resolved.ok, true, JSON.stringify(resolved.error));
        assert.equal(resolved.data.callBound, example.calls);
        for (const wire of Object.values(graph.wires)) {
            assert.ok(portsForNode(graph, graph.nodes[wire.from]).some(port => port.id === wire.fromPort && port.direction === 'output'));
            assert.ok(portsForNode(graph, graph.nodes[wire.to]).some(port => port.id === wire.toPort && port.direction === 'input'));
        }
        const commit = Object.values(graph.nodes).find(node => node.operation === 'memory' && node.mode === 'commit');
        if (commit) assert.deepEqual(portsForNode(graph, commit).map(port => port.id), ['proposal']);
        const json = await readFile(new URL('../examples/introspection/native/' + example.id + '.json', import.meta.url), 'utf8');
        assert.deepEqual(JSON.parse(json), exportWorkflow(graph));
        const parsed = parseWorkflow(json);
        assert.equal(parsed.ok, true, JSON.stringify(parsed.error));
        assert.deepEqual(exportWorkflow(parsed.data), exportWorkflow(graph));
        if (example.roles.length) {
            graph.roles.Analysis.profileId = 'private-local-profile';
            const inference = Object.values(graph.nodes).find(node => ['reflect', 'internalize'].includes(node.operation));
            inference.profileId = 'private-node-profile';
            inference.model = 'operator-model';
            const portable = exportWorkflow(graph);
            assert.equal(portable.graph.roles.Analysis.profileId, null);
            assert.equal(portable.graph.nodes[inference.id].profileId, null);
            assert.equal(JSON.stringify(portable).includes('private-'), false);
            assert.equal(parseWorkflow(JSON.stringify(portable)).ok, true);
        }
    }
});

test('preparing native Introspection examples creates independent detached graphs', () => {
    for (const example of examples) {
        const first = installStarter(example.id), second = installStarter(example.id);
        assert.notEqual(first.id, second.id);
        assert.equal(resolveWorkflow(first).ok, true); assert.equal(resolveWorkflow(second).ok, true);
        first.nodes[Object.keys(first.nodes)[0]].alias = 'Local edit';
        assert.equal(Object.values(second.nodes).some(node => node.alias === 'Local edit'), false);
        assert.equal(Object.values(starterGraph(example.id).nodes).some(node => node.alias === 'Local edit'), false);
    }
});

function fixture(graph) {
    let requests = 0, saves = 0;
    const context = { chatId: 'native-starter-chat', characterId: 0, groupId: null, characters: [{ avatar: 'alice.png' }], chatMetadata: {}, extensionPrompts: {},
        chat: [{ is_user: true, mes: 'An apology was offered.', send_date: 1 }, { is_user: false, mes: 'Alice accepts and stays cautious.', swipe_id: 0, swipes: ['Alice accepts and stays cautious.'], gen_started: 2, gen_finished: 3 }],
        setExtensionPrompt(key, value) { this.extensionPrompts[key] = { value }; }, saveMetadata: async () => { saves++; return true; },
    };
    const controller = createNativeWorkflowController({ context: () => context, getGraph: () => graph, isEnabled: () => true, isBusy: () => false,
        countTokens: async value => ({ tokens: Math.ceil(value.length / 4), method: 'synthetic-starter-fixture' }),
        resolveBinding: () => ({ ok: true, data: { profileId: 'synthetic', model: 'synthetic' } }),
        request: async () => { requests++; return { ok: true, data: { text: JSON.stringify(graph.mode === 'native-pre' ? { brief: 'Cautious acceptance', behaviorHints: ['Let Alice acknowledge the apology without deciding the player\'s next action.'] } : { values: { trust: 0.35 } }), finish: 'stop' } }; },
    });
    return { context, controller, requests: () => requests, saves: () => saves };
}

test('Reflect and express produces guidance with one synthetic Analysis call and no memory write', async () => {
    const graph = starterGraph('reflect-and-express'), f = fixture(graph);
    const result = await f.controller.runPre(graph);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.actualCalls, 1); assert.equal(result.callBound, 1); assert.equal(f.requests(), 1);
    assert.equal(f.saves(), 0); assert.deepEqual(f.context.extensionPrompts, {});
    const guidance = result.recording.artifacts.find(artifact => artifact.value.kind === 'guidance');
    assert.match(guidance.value.text, /acknowledge the apology/);
});

for (const example of examples.filter(entry => entry.phase === 'post')) {
    test(example.id + ' previews without saving and settles only the successful full root run', async () => {
        const graph = starterGraph(example.id), f = fixture(graph);
        const commit = Object.values(graph.nodes).find(node => node.operation === 'memory' && node.mode === 'commit');
        const preview = await f.controller.runTarget(graph, { kind: 'terminal', address: { workflowId: graph.id, instancePath: [], nodeId: commit.id } });
        assert.equal(preview.ok, true, JSON.stringify(preview.error)); assert.equal(f.saves(), 0);
        assert.equal(preview.memoryCommit, undefined);
        const result = await f.controller.runPost(graph);
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(result.actualCalls, example.calls); assert.equal(result.callBound, example.calls);
        assert.equal(f.requests(), example.calls * 2);
        assert.deepEqual(result.memoryCommit, { applied: true, acknowledged: true, version: 1 });
        assert.equal(f.saves(), 1);
        const stored = f.context.chatMetadata.latticeIntrospection['native-chat']['character:alice.png'].state.value.payload;
        if (example.id === 'consequence-clock') assert.equal(stored.tracks.consequences.count, 2);
        else assert.equal(stored.values.trust, 0.35);
        f.context.chat.push({ is_user: true, mes: 'The conversation moves forward.', send_date: 4 });
        const next = await f.controller.runPost(graph);
        assert.equal(next.ok, true, JSON.stringify(next.error));
        assert.deepEqual(next.memoryCommit, { applied: true, acknowledged: true, version: 2 });
        assert.equal(f.saves(), 2);
        if (example.id === 'consequence-clock') assert.equal(f.context.chatMetadata.latticeIntrospection['native-chat']['character:alice.png'].state.value.payload.tracks.consequences.count, 3);
    });
}
