import assert from 'node:assert/strict';
import test from 'node:test';
import { operationDefaults } from '../src/workflow/catalog.js?v=0.27.0';
import { prepareCreateFromSelection, prepareUnpack } from '../src/workflow/composition.js?v=0.27.0';
import { resolveWorkflow } from '../src/workflow/resolve.js?v=0.27.0';
import { runWorkflow } from '../src/workflow/runtime.js?v=0.27.0';
import { exportWorkflow, parseWorkflow } from '../src/workflow/packages.js?v=0.27.0';
import { unifiedRecipeHost } from './helpers/unified-recipe-host.mjs';
import { actorHostFixture } from './helpers/native-actor-host-fixture.mjs';
const n = (id, operation, controls = {}) => ({ ...operationDefaults(operation, controls.mode ? { mode: controls.mode } : {}), id, type: 'workflow', operation, operationVersion: 1, ...controls });
const w = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
function graph() {
    return { id: 'owned-nesting', schema: 3, runtime: 2, mode: 'native-unified', definitions: {}, portals: {}, nodes: {
        send: n('send', 'on-send'), generate: n('generate', 'generate-reply'), review: n('review', 'review-publish'),
    }, wires: { activation: w('activation', 'send', 'activation', 'generate', 'activation'), reply: w('reply', 'generate', 'draft', 'review', 'draft') } };
}
function wrap(root, ids = Object.keys(root.nodes), name = 'body') {
    const result = prepareCreateFromSelection(root, { nodeIds: ids, definitionId: name + '-definition', instanceId: name, name });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    return result.data.candidate;
}
const unexpectedRequest = () => assert.fail('This path must not make an auxiliary request');

test('an entire Send-to-Review lifecycle survives two static layers, export and unpack', async () => {
    const root = wrap(wrap(graph()), undefined, 'outer');
    const parsed = parseWorkflow(JSON.stringify(exportWorkflow(root)));
    assert.equal(parsed.ok, true, JSON.stringify(parsed.error));
    assert.equal(resolveWorkflow(parsed.data).ok, true);
    const f = unifiedRecipeHost(parsed.data, { request: unexpectedRequest });
    try {
        const result = await f.generate('Owned nested reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(result.reviewHandles.length, 1);
        assert.deepEqual(result.reviewHandles[0].terminal.address.instancePath, ['outer', 'body']);
        assert.equal((await f.controller.apply(result.reviewHandles[0])).ok, true);
        assert.equal(f.calls(), 0);
    } finally { f.controller.dispose(); }
    const unpacked = prepareUnpack(root, { instancePath: ['outer', 'body'] });
    assert.equal(unpacked.ok, true, JSON.stringify(unpacked.error));
    assert.equal(resolveWorkflow(unpacked.data.candidate).ok, true);
});

test('nested On Send rejects manual and public generation before requests', async () => {
    const root = wrap(graph()), target = { workflowId: root.id, instancePath: ['body'], nodeId: 'generate', portId: 'metadata' };
    const f = unifiedRecipeHost(root, { request: unexpectedRequest });
    try {
        assert.equal((await f.controller.runTarget(root, target)).error.code, 'NATIVE_OWNER_MISSING');
        let forged = 0;
        const result = await runWorkflow(root, { target, executeHostOperation: () => { forged++; return { ok: true }; } });
        assert.equal(result.error.code, 'HOST_OPERATION_REQUIRED');
        assert.equal(forged, 0);
        assert.equal(f.calls(), 0);
    } finally { f.controller.dispose(); }
});

test('Scene Context and Guidance budget nodes execute inside the same static preparation body', async () => {
    const root = graph();
    root.nodes.scene = n('scene', 'scene-context', { visibilityMode: 'public', includeCharacter: false });
    root.nodes.plan = n('plan', 'response-plan');
    root.nodes.budget = n('budget', 'guidance');
    root.wires.context = w('context', 'scene', 'out', 'plan', 'in');
    root.wires.budget = w('budget', 'plan', 'out', 'budget', 'in');
    root.wires.guidance = w('guidance', 'budget', 'out', 'generate', 'guidance');
    const f = unifiedRecipeHost(wrap(root), { request: async () => ({ ok: true, data: { text: 'Follow the current scene.', finish: 'stop' } }) });
    try {
        const result = await f.generate('Context-guided reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(f.calls(), 1);
    } finally { f.controller.dispose(); }
});

for (const operation of ['prompt-source', 'player-event-source']) test(operation + ' preserves its owned source in a static subgraph', async () => {
    const root = graph();
    root.nodes.source = n('source', operation);
    root.nodes.compose = n('compose', 'compose', { outputKind: 'guidance', sections: [{ name: 'Source', text: '', kind: 'text' }] });
    if (operation === 'player-event-source') { root.nodes.encode = n('encode', 'format', { jsonShape: 'single' }); root.wires.encode = w('encode', 'source', 'out', 'encode', 'in'); }
    root.wires.source = w('source', operation === 'player-event-source' ? 'encode' : 'source', operation === 'player-event-source' ? 'text' : 'out', 'compose', 'section.Source');
    root.wires.guidance = w('guidance', 'compose', 'out', 'generate', 'guidance');
    const f = unifiedRecipeHost(wrap(root), { request: unexpectedRequest, configureContext(c) { c.mainApi = 'textgenerationwebui'; c.powerUserSettings = { sysprompt: { enabled: true, content: 'Describe the current scene.' } }; } });
    try {
        const result = await f.generate('Source-guided reply.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(f.calls(), 0);
    } finally { f.controller.dispose(); }
});

for (const [operation, controls] of [['memory', { mode: 'read' }], ['memory', { mode: 'recall', query: 'scene' }], ['state', { mode: 'value' }], ['reply-snapshot', {}]]) test('owned nested read supports ' + operation + ' ' + (controls.mode ?? ''), async () => {
    const root = graph();
    root.nodes.source = n('source', operation, controls);
    const wrapped = wrap(root, ['source']);
    let saves = 0;
    const f = unifiedRecipeHost(wrapped, { request: unexpectedRequest, configureContext(c) { c.saveMetadata = async () => { saves++; return true; }; const now = new Date().toISOString(); c.chat.push({ mes: 'Completed prior reply.', is_user: false, extra: {}, gen_started: now, gen_finished: now, swipe_id: 0, swipes: ['Completed prior reply.'], swipe_info: [{ gen_started: now, gen_finished: now, extra: {} }] }); } });
    try {
        const result = await f.controller.runTarget(wrapped, { workflowId: root.id, instancePath: ['body'], nodeId: 'source', portId: 'out' });
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(result.actualCalls, 0);
        assert.equal(saves, 0);
    } finally { f.controller.dispose(); }
});

function memoryGraph() {
    const root = graph();
    root.nodes.state = n('state', 'memory', { phase: 'post', mode: 'read' });
    root.nodes.events = n('events', 'memory', { phase: 'post', mode: 'read', view: 'events' });
    root.nodes.track = n('track', 'state', { phase: 'post', mode: 'track', trackId: 'scene' });
    root.nodes.commit = n('commit', 'memory', { phase: 'post', mode: 'commit' });
    root.wires.state = w('state', 'state', 'out', 'track', 'state');
    root.wires.events = w('events', 'events', 'out', 'track', 'events');
    root.wires.commit = w('commit', 'track', 'out', 'commit', 'proposal');
    return wrap(root, ['state', 'events', 'track', 'commit']);
}

for (const accept of [false, true]) test('nested Memory Commit ' + (accept ? 'settles once only after acceptance' : 'does not settle after rejection'), async () => {
    let saves = 0;
    const f = unifiedRecipeHost(memoryGraph(), { request: unexpectedRequest, configureContext(c) { c.saveMetadata = async () => { saves++; return true; }; } });
    try {
        const result = await f.generate('A remembered scene.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(saves, 0);
        assert.equal(f.c.chatMetadata.latticeIntrospection, undefined);
        if (accept) {
            const applied = await f.controller.apply(result.reviewHandles[0]);
            assert.equal(applied.ok, true, JSON.stringify(applied.error));
            const stored = f.c.chatMetadata.latticeIntrospection['native-chat']['character:mara.png'];
            assert.equal(stored.receipts.length, 1);
            assert.equal(stored.state.value.store.version, 1);
            const verifiedSaves = f.saves();
            assert.ok(verifiedSaves > 0);
            assert.equal((await f.controller.apply(result.reviewHandles[0])).ok, true);
            assert.equal(f.saves(), verifiedSaves);
            assert.equal(stored.receipts.length, 1);
        } else { assert.equal(f.controller.reject(result.reviewHandles[0]).ok, true); assert.equal(saves, 0); }
    } finally { f.controller.dispose(); }
});

test('nested Actor Context preserves separate actor permissions and private accepted file effects', async () => {
    const f = actorHostFixture('reflections');
    try {
        Object.assign(f.graph, wrap(f.graph));
        const ready = await f.start();
        assert.equal(ready.ok, true, JSON.stringify(ready.error));
        const result = await f.complete();
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(f.requests.length, 3);
        assert.equal(JSON.stringify(f.requests[1].messages).includes('PRIVATE SEA'), true);
        assert.equal(JSON.stringify(f.requests[1].messages).includes('PRIVATE FIRE'), false);
        assert.equal(JSON.stringify(f.requests[2].messages).includes('PRIVATE FIRE'), true);
        assert.equal(JSON.stringify(f.requests[2].messages).includes('PRIVATE SEA'), false);
        assert.equal((await f.controller.apply(result.reviewHandles[0])).ok, true);
    } finally { f.controller.dispose(); }
});


test('a disabled sibling lifecycle contributes no extra Send, generation or review', async () => {
    const root = wrap(graph());
    delete root.localDefinitionOwners;
    delete root.nodes.body.localCopy;
    root.nodes.disabled = { ...structuredClone(root.nodes.body), id: 'disabled', enabled: false };
    assert.equal(resolveWorkflow(root).ok, true);
    const f = unifiedRecipeHost(root, { request: unexpectedRequest });
    try {
        const result = await f.generate('Only the enabled lifecycle.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(result.reviewHandles.length, 1);
    } finally { f.controller.dispose(); }
});

test('sibling Memory Commits with identical local IDs remain distinct and are rejected before generation', async () => {
    const root = memoryGraph();
    delete root.localDefinitionOwners;
    delete root.nodes.body.localCopy;
    root.nodes.second = { ...structuredClone(root.nodes.body), id: 'second' };
    const f = unifiedRecipeHost(root, { request: unexpectedRequest });
    try {
        const result = await f.generate('This generation must not start.');
        assert.equal(result.error.code, 'MULTIPLE_MEMORY_COMMITS');
        assert.equal(f.c.chat.length, 1);
        assert.equal(f.saves(), 0);
    } finally { f.controller.dispose(); }
});

test('a disabled sibling Memory Commit does not block the live accepted memory terminal', async () => {
    const root = memoryGraph();
    delete root.localDefinitionOwners;
    delete root.nodes.body.localCopy;
    root.nodes.disabled = { ...structuredClone(root.nodes.body), id: 'disabled', enabled: false };
    const f = unifiedRecipeHost(root, { request: unexpectedRequest });
    try {
        const result = await f.generate('One enabled memory terminal.');
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal((await f.controller.apply(result.reviewHandles[0])).ok, true);
        assert.equal(f.c.chatMetadata.latticeIntrospection['native-chat']['character:mara.png'].receipts.length, 1);
    } finally { f.controller.dispose(); }
});


test('deep static source identities remain bounded for valid long instance IDs', async () => {
    const f = actorHostFixture('direction');
    try {
        let root = f.graph;
        for (let depth = 0; depth < 3; depth++) root = wrap(root, undefined, 'scope-' + depth + '-' + 'x'.repeat(80));
        Object.assign(f.graph, root);
        assert.equal(resolveWorkflow(f.graph).ok, true);
        const ready = await f.start();
        assert.equal(ready.ok, true, JSON.stringify(ready.error));
        const result = await f.complete();
        assert.equal(result.ok, true, JSON.stringify(result.error));
        const scene = JSON.parse(f.requests[0].messages.at(-1).content).context.source;
        assert.ok(scene.sourceId.length <= 256);
        assert.equal(result.reviewHandles.length, 1);
    } finally { f.controller.dispose(); }
});
