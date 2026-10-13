import assert from 'node:assert/strict';
import { test } from 'node:test';
const lifecycle = await import('../src/workflow/operations/lifecycle-nodes.js?v=0.27.2').catch(() => ({}));
const revisions = await import('../src/workflow/draft-revisions.js?v=0.27.2');

test('native lifecycle descriptors expose activation and distinct reply metadata ports', () => {
    assert.equal(typeof lifecycle.describeLifecycleNode, 'function');
    const send = lifecycle.describeLifecycleNode({ id: 'send', type: 'workflow', operation: 'on-send' }, { phase: 'pre' });
    assert.equal(send.ok, true);
    assert.deepEqual(send.data.ports.map(port => [port.id, port.kind]), [['activation', 'data']]);
    assert.equal(send.data.descriptor.hostOperation, true);
    const generate = lifecycle.describeLifecycleNode({ id: 'generate', type: 'workflow', operation: 'generate-reply' }, { phase: 'pre' });
    assert.equal(generate.ok, true);
    assert.deepEqual(generate.data.ports.map(port => [port.id, port.direction, port.kind, port.required]), [['activation', 'input', 'data', true], ['guidance', 'input', 'guidance', false], ['draft', 'output', 'draft', false], ['metadata', 'output', 'data', false]]);
    assert.equal(generate.data.descriptor.requestBound, 0, 'Native generation is not an auxiliary model request');
    assert.equal(lifecycle.describeLifecycleNode({ operation: 'generate-reply', operationVersion: 7 }, { phase: 'pre' }).ok, false);
});

test('Review/Publish converts only a checked Draft lineage into a root-source candidate', async () => {
    assert.equal(typeof lifecycle.executeLifecycleNode, 'function');
    const native = { kind: 'draft', text: 'Original.', source: { originalText: 'Original.', token: 'native-token' } };
    const draft = revisions.createDraftRevision(native, 'Revised.', { nodeId: 'style', scope: 'whole' }).data.draft;
    const review = await lifecycle.executeLifecycleNode({ id: 'publish', type: 'workflow', operation: 'review-publish' }, { draft }, { phase: 'post', root: true, rootMode: 'native-unified' });
    assert.equal(review.ok, true, JSON.stringify(review.error));
    assert.equal(review.artifact.original, 'Original.');
    assert.equal(review.artifact.text, 'Revised.');
    assert.equal(review.artifact.reviewRequired, true);
    assert.equal((await lifecycle.executeLifecycleNode({ id: 'publish', operation: 'review-publish' }, { draft: { ...draft } }, { phase: 'post', root: true, rootMode: 'native-unified' })).ok, false);
    assert.equal((await lifecycle.executeLifecycleNode({ id: 'publish', operation: 'review-publish' }, { draft: native }, { phase: 'post', root: true, rootMode: 'native-unified' })).ok, true);
});

const { createNativeWorkflowController } = await import('../src/workflow/host.js?v=0.27.2');
const nextTurn = () => new Promise(resolve => setTimeout(resolve, 10));
function unifiedGraph({ guidance = false, revise = true } = {}) {
    const nodes = { send: { id: 'send', type: 'workflow', operation: 'on-send' }, generate: { id: 'generate', type: 'workflow', operation: 'generate-reply' }, review: { id: 'review', type: 'workflow', operation: 'review-publish' } };
    const wires = { activation: { id: 'activation', route: 'wire', from: 'send', fromPort: 'activation', to: 'generate', toPort: 'activation' } };
    if (revise) nodes.revise = { id: 'revise', type: 'workflow', operation: 'revise-draft', scope: 'whole', instructions: 'Tighten prose.' };
    wires.reply = { id: 'reply', route: 'wire', from: 'generate', fromPort: 'draft', to: revise ? 'revise' : 'review', toPort: 'draft' };
    if (revise) wires.review = { id: 'review', route: 'wire', from: 'revise', fromPort: 'out', to: 'review', toPort: 'draft' };
    if (guidance) { nodes.guide = { id: 'guide', type: 'workflow', operation: 'compose', outputKind: 'guidance', sections: [{ name: 'Style', text: 'Use vivid prose.' }] }; wires.guidance = { id: 'guidance', route: 'wire', from: 'guide', fromPort: 'out', to: 'generate', toPort: 'guidance' }; }
    return { id: 'unified', name: 'Unified test', schema: 3, runtime: 2, mode: 'native-unified', nodes, wires, portals: {}, definitions: {} };
}
function nativeFixture(graph = unifiedGraph(), options = {}) {
    const listeners = new Map(), events = [], results = [];
    const c = { chatId: 'story', characterId: 0, groupId: null, characters: [{ data: { name: 'Mara' } }], chat: [{ mes: 'I open the door.', is_user: true, extra: {} }], extensionPrompts: {}, eventTypes: Object.fromEntries(['GENERATION_STARTED', 'GENERATION_STOPPED', 'GENERATION_ENDED', 'MESSAGE_RECEIVED', 'MESSAGE_SENT', 'CHAT_CHANGED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_SWIPE_DELETED'].map(name => [name, name])) };
    c.eventSource = { on(name, fn) { const bucket = listeners.get(name) ?? []; bucket.push(fn); listeners.set(name, bucket); }, removeListener(name, fn) { listeners.set(name, (listeners.get(name) ?? []).filter(value => value !== fn)); }, async emit(name, ...args) { for (const listener of listeners.get(name) ?? []) await listener(...args); } };
    c.setExtensionPrompt = (key, value) => { c.extensionPrompts[key] = { value }; };
    c.saveChat = async () => {}; c.updateMessageBlock = async () => {}; c.swipe = { refresh: async () => {} };
    let busy = false, user = 'default-user', requests = 0;
    const controller = createNativeWorkflowController({ ...options.ports, context: () => c, getGraph: phase => phase === 'unified' ? graph : undefined, isEnabled: () => true, userId: () => user, isBusy: () => busy, countTokens: options.countTokens ?? (async text => ({ tokens: Math.ceil(text.length / 4) })), resolveBinding: options.resolveBinding ?? (() => ({ ok: true, data: { profileId: 'fixed', model: 'test' } })), request: options.request ?? (async () => { requests++; return { ok: true, data: { text: 'Revised reply.', finish: 'stop' } }; }), onEvent: event => events.push(event), onResult: result => results.push(result), syncMesToSwipe(index) { const m = c.chat[index]; m.swipes[m.swipe_id] = m.mes; return true; }, syncSwipeToMes(index, swipeId) { const m = c.chat[index]; m.swipe_id = swipeId; m.mes = m.swipes[swipeId]; Object.assign(m, structuredClone(m.swipe_info[swipeId])); return true; } });
    controller.subscribe();
    return { c, controller, events, results, setBusy(value) { busy = value; }, setUser(value) { user = value; }, requests: () => requests, async start(type = 'normal') { busy = true; await c.eventSource.emit('GENERATION_STARTED', type, {}, false); return controller.beforeGenerate(c.chat.map(message => ({ ...message })), 8192, options.abort ?? (() => {}), type); } };
}
function addReply(f, { normalized = true, text = 'Native reply.' } = {}) {
    const now = new Date().toISOString(), m = { mes: text, is_user: false, extra: {}, gen_started: now, gen_finished: now };
    if (normalized) Object.assign(m, { swipe_id: 0, swipes: [text], swipe_info: [{ gen_started: now, gen_finished: now, extra: {} }] });
    f.c.chat.push(m); return m;
}
async function settled(f) { for (let tries = 0; tries < 30 && !f.results.length; tries++) await nextTurn(); assert.equal(f.results.length, 1, 'Owned continuation must settle promptly'); return f.results[0]; }

test('Generate Reply refuses invalid injection controls before installing guidance', async () => {
    for (const controls of [
        { injectionRole: 'developer' }, { injectionRole: null },
        { injectionPosition: 'anywhere' }, { injectionPosition: null },
        { injectionDepth: -1 }, { injectionDepth: 10001 }, { injectionDepth: 1.5 },
        { injectionDepth: '4' }, { injectionDepth: null },
    ]) {
        const node = { id: 'generate', type: 'workflow', operation: 'generate-reply', ...controls };
        assert.equal(lifecycle.describeLifecycleNode(node, { phase: 'pre' }).ok, false, JSON.stringify(controls));
        const graph = unifiedGraph({ guidance: true, revise: false });
        Object.assign(graph.nodes.generate, controls);
        const f = nativeFixture(graph);
        try {
            const result = await f.start();
            assert.equal(result.ok, false, JSON.stringify(controls));
            assert.ok(Object.values(f.c.extensionPrompts).every(prompt => !prompt.value));
            assert.equal(f.requests(), 0);
        } finally { f.controller.dispose(); }
    }
});

test('Generate Reply installs guidance using its configured role, position and depth', async () => {
    for (const [controls, expected] of [
        [{}, [1, 0, false, 0]],
        [{ injectionRole: 'user', injectionPosition: 'in-chat', injectionDepth: 4 }, [1, 4, false, 1]],
        [{ injectionRole: 'assistant', injectionPosition: 'before-prompt', injectionDepth: 7 }, [2, 7, false, 2]],
        [{ injectionRole: 'system', injectionPosition: 'in-prompt', injectionDepth: 5 }, [0, 5, false, 0]],
    ]) {
        const graph = unifiedGraph({ guidance: true, revise: false });
        Object.assign(graph.nodes.generate, controls);
        const f = nativeFixture(graph), installed = [];
        const setter = f.c.setExtensionPrompt;
        f.c.setExtensionPrompt = (key, value, ...settings) => { if (value) installed.push(settings); setter(key, value); };
        try {
            const ready = await f.start();
            assert.equal(ready.ok, true, JSON.stringify(ready.error));
            assert.deepEqual(installed, [expected]);
            assert.equal(f.requests(), 0);
        } finally { f.controller.dispose(); }
    }
});

test('unified Send releases preparation then resumes the same run after Received and End in either order', async () => {
    for (const order of ['received-first', 'ended-first']) {
        const f = nativeFixture(unifiedGraph({ guidance: true }));
        const prepared = await f.start();
        assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
        assert.equal(prepared.awaitingNative, true, 'Interceptor must return before the suspended runtime finishes');
        assert.equal(f.requests(), 0);
        assert.equal(Object.values(f.c.extensionPrompts).some(value => value.value === 'Use vivid prose.'), true);
        const m = addReply(f, { normalized: false });
        if (order === 'received-first') await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, 'normal');
        f.setBusy(false);
        await f.c.eventSource.emit('GENERATION_ENDED', 2);
        if (order === 'ended-first') await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, 'normal');
        Object.assign(m, { swipe_id: 0, swipes: [m.mes], swipe_info: [{ gen_started: m.gen_started, gen_finished: m.gen_finished, extra: {} }] });
        const result = await settled(f);
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(result.runId, prepared.runId);
        assert.equal(result.recording.plan.phase, 'unified');
        assert.equal(result.reviewHandles.length, 1);
        assert.equal(f.requests(), 1);
        assert.equal(m.mes, 'Native reply.', 'Processing requires review before publication');
        const applied = await f.controller.apply(result.reviewHandles[0]);
        assert.equal(applied.ok, true, JSON.stringify(applied.error));
        assert.deepEqual(m.swipes, ['Native reply.', 'Revised reply.']);
        assert.equal(applied.persistence, 'unverified');
    }
});

test('native continuation rejects unrelated Received, missing reply and changed live authority without processing', async () => {
    for (const change of ['unrelated', 'missing', 'prefix-edit', 'prefix-object', 'user', 'character', 'chat-array', 'failed-reply', 'tool']) {
        const f = nativeFixture();
        const ready = await f.start(); assert.equal(ready.ok, true, JSON.stringify(ready.error));
        if (change !== 'missing') addReply(f);
        if (change === 'prefix-edit') f.c.chat[0].mes = 'Changed after preparation';
        if (change === 'prefix-object') f.c.chat[0] = { ...f.c.chat[0] };
        if (change === 'user') f.setUser('other-user');
        if (change === 'character') f.c.characterId = 1;
        if (change === 'chat-array') f.c.chat = [...f.c.chat];
        if (change === 'failed-reply') f.c.chat.at(-1).extra.unfinished = true;
        if (change === 'tool') f.c.chat.at(-1).extra.tool_invocations = [{ name: 'tool' }];
        if (change !== 'missing') await f.c.eventSource.emit('MESSAGE_RECEIVED', change === 'unrelated' ? 0 : 1, 'normal');
        f.setBusy(false); await f.c.eventSource.emit('GENERATION_ENDED', f.c.chat.length);
        const result = await settled(f);
        assert.equal(result.ok, false, change);
        assert.deepEqual(result.reviewHandles, []);
        assert.equal(f.requests(), 0, change);
        assert.equal(Object.values(f.c.extensionPrompts).every(value => !value.value), true);
    }
});

test('Stop and source invalidation terminate a suspended run without blocking event emitters or late replies', async () => {
    for (const event of ['GENERATION_STOPPED', 'CHAT_CHANGED', 'MESSAGE_EDITED', 'MESSAGE_SENT']) {
        const f = nativeFixture(); const ready = await f.start(); assert.equal(ready.awaitingNative, true);
        await f.c.eventSource.emit(event, 0);
        const result = await settled(f);
        assert.equal(result.error.code, 'ABORTED', event);
        assert.equal(result.recording.status, 'cancelled');
        addReply(f); f.setBusy(false);
        await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, 'normal'); await f.c.eventSource.emit('GENERATION_ENDED', 2);
        await nextTurn(); assert.equal(f.requests(), 0); assert.deepEqual(result.reviewHandles, []);
    }
});

test('newly generated swipe resumes its owner and Apply preserves both earlier and native swipes', async () => {
    const f = nativeFixture();
    const previous = addReply(f, { text: 'Earlier reply.' });
    const priorInfo = structuredClone(previous.swipe_info);
    previous.swipe_id = 1; // ST overswipe selects its pending slot before GENERATION_STARTED.
    const ready = await f.start('swipe'); assert.equal(ready.awaitingNative, true, JSON.stringify(ready.error));
    const now = new Date().toISOString();
    Object.assign(previous, { mes: 'Native reply.', gen_started: now, gen_finished: now });
    previous.swipes.push(previous.mes); previous.swipe_info.push({ gen_started: now, gen_finished: now, extra: {} });
    await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, 'swipe'); f.setBusy(false); await f.c.eventSource.emit('GENERATION_ENDED', 2);
    const result = await settled(f); assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(previous.swipe_info.slice(0, 1), priorInfo);
    assert.equal((await f.controller.apply(result.reviewHandles[0])).ok, true);
    assert.deepEqual(previous.swipes, ['Earlier reply.', 'Native reply.', 'Revised reply.']);
});

test('unified native activation requires trusted Started/user scope and rejects unsupported modes and groups', async () => {
    const withoutStart = nativeFixture();
    assert.equal((await withoutStart.controller.beforeGenerate(withoutStart.c.chat, 8192, () => {}, 'normal')).error.code, 'NATIVE_OWNER_MISSING');
    const missingUser = nativeFixture(); missingUser.setUser(undefined);
    assert.equal((await missingUser.start()).error.code, 'USER_SCOPE_UNAVAILABLE');
    const group = nativeFixture(); group.c.groupId = 'party';
    assert.equal((await group.start()).error.code, 'UNSUPPORTED_NATIVE_GENERATION');
    const continuation = nativeFixture();
    assert.equal((await continuation.start('continue')).error.code, 'UNSUPPORTED_NATIVE_GENERATION');
});

test('a second Started epoch rejects overlapping continuation and cannot reuse late ownership', async () => {
    const f = nativeFixture(); const first = await f.start(); assert.equal(first.awaitingNative, true);
    await f.c.eventSource.emit('GENERATION_STARTED', 'normal', {}, false);
    const second = await f.controller.beforeGenerate(f.c.chat, 8192, () => {}, 'normal');
    assert.equal(second.error.code, 'OVERLAPPING_GENERATION');
    addReply(f); f.setBusy(false); await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, 'normal'); await f.c.eventSource.emit('GENERATION_ENDED', 2);
    await nextTurn(); assert.equal(f.requests(), 0); assert.equal(f.results.every(result => !result.reviewHandles?.length), true);
});

test('lifecycle descriptions reject accessor and coercion hooks without evaluating them', () => {
    let reads = 0;
    const unsafe = { id: 'generate', operation: 'generate-reply' };
    Object.defineProperty(unsafe, 'budgetTokens', { enumerable: true, get() { reads++; return 768; } });
    assert.equal(lifecycle.describeLifecycleNode(unsafe, { phase: 'pre' }).ok, false);
    const coerced = { operation: { toString() { reads++; return 'on-send'; } } };
    assert.equal(lifecycle.describeLifecycleNode(coerced, { phase: 'pre' }).ok, false);
    assert.equal(reads, 0);
});

test('controller forwards the ordinary Decision binding and bounded request', async () => {
    const graph = { id: 'decision-target', schema: 3, runtime: 2, mode: 'native-unified', nodes: { scene: { id: 'scene', type: 'workflow', operation: 'compose', sections: [{ name: 'scene', text: 'They kissed.' }] }, decision: { id: 'decision', type: 'workflow', operation: 'decision', inputKind: 'text', questions: { kiss: { type: 'noul', instructions: 'Did they kiss?' } } } }, wires: { source: { id: 'source', route: 'wire', from: 'scene', fromPort: 'out', to: 'decision', toPort: 'in' } }, portals: {}, definitions: {} };
    let bindings = 0, calls = 0, summaries = 0;
    const binding = Object.freeze({ profileId: 'decision-profile', model: 'decision-current' });
    const f = nativeFixture(graph, { resolveBinding() { bindings++; return { ok: true, data: binding }; }, request(options) { calls++; assert.equal(options.binding, binding); assert.equal(JSON.parse(options.messages[1].content).state, 'They kissed.'); return { ok: true, data: { text: '{"answers":{"kiss":{"type":"noul","accepted":true}}}',finish:'stop',usage: { input_tokens: 4, output_tokens: 1 } } }; }, ports: { bindingSummary() { summaries++; return { model: 'decision-current', profileId: 'decision-profile' }; }, bindingStatus: () => ({ ok: true }) } });
    const result = await f.controller.runTarget(graph, { workflowId: graph.id, instancePath: [], nodeId: 'decision', portId: 'out' });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(bindings, 1); assert.equal(calls, 1); assert.ok(summaries > 0);
    assert.equal(result.actualCalls, 1); assert.equal(result.callBound,1);assert.equal(f.requests(), 0);
});

test('native continuation waits for the nonbusy barrier and captures distinct generation outputs once', async () => {
    const f = nativeFixture(unifiedGraph({ revise: false }));
    const ready = await f.start(); assert.equal(ready.awaitingNative, true);
    addReply(f); await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, 'normal'); await f.c.eventSource.emit('GENERATION_ENDED', 2);
    await nextTurn(); assert.equal(f.results.length, 0, 'End does not authorize a busy native reply');
    f.setBusy(false); const result = await settled(f);
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.runId, ready.runId); assert.equal(f.requests(), 0);
    const generation = result.recording.units.find(unit => unit.operation === 'generate-reply');
    const outputs = generation.ports.filter(port => port.direction === 'output');
    assert.deepEqual(outputs.map(port => result.recording.identities.strings[port.port]).sort(), ['draft', 'metadata']);
    const artifacts = outputs.map(port => result.recording.artifacts.find(artifact => artifact.id === port.artifact));
    assert.deepEqual(artifacts.map(artifact => artifact.kind).sort(), ['data', 'draft']);
    assert.equal(f.events.filter(event => event.type === 'plan').length, 1);
    assert.equal(f.events.filter(event => event.type === 'run-settled').length, 1);
    await f.c.eventSource.emit('GENERATION_ENDED', 2); await nextTurn();
    assert.equal(f.controller.candidateStatus(result.reviewHandles[0]).ok, true, 'Repeated End cannot revoke settled review authority');
});

test('selected swipe or generation completion mismatch is rejected before post models run', async () => {
    for (const change of ['selected-swipe', 'old-generation', 'unormalized', 'stopped-stream']) {
        const f = nativeFixture(); const ready = await f.start(); assert.equal(ready.awaitingNative, true);
        const m = addReply(f);
        if (change === 'selected-swipe') { m.swipe_id = 1; m.swipes.push('Other reply.'); }
        if (change === 'old-generation') Object.assign(m, { gen_started: '2000-01-01T00:00:00.000Z', gen_finished: '2000-01-01T00:00:01.000Z' });
        if (change === 'unormalized') delete m.swipes;
        if (change === 'stopped-stream') f.c.streamingProcessor = { messageId: 1, timeStarted: m.gen_started, isFinished: true, isStopped: true };
        await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, 'normal'); f.setBusy(false); await f.c.eventSource.emit('GENERATION_ENDED', 2);
        const result = await settled(f); assert.equal(result.ok, false, change); assert.equal(f.requests(), 0); assert.deepEqual(result.reviewHandles, []);
    }
});

test('Stop during post processing rejects the late model result and leaves the native reply unchanged', async () => {
    let release, signal;
    const f = nativeFixture(unifiedGraph(), { request: options => { signal = options.signal; return new Promise(resolve => release = resolve); } });
    await f.start(); const m = addReply(f); await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, 'normal'); f.setBusy(false); await f.c.eventSource.emit('GENERATION_ENDED', 2);
    for (let tries = 0; tries < 30 && !release; tries++) await nextTurn(); assert.equal(typeof release, 'function');
    await f.c.eventSource.emit('GENERATION_STOPPED'); assert.equal(signal.aborted, true);
    release({ ok: true, data: { text: 'Late overwrite', finish: 'stop' } });
    const result = await settled(f); assert.equal(result.error.code, 'ABORTED'); assert.deepEqual(result.reviewHandles, []); assert.equal(m.mes, 'Native reply.');
});

test('End during preparation prevents late guidance from being installed after native completion', async () => {
    let release;
    const f = nativeFixture(unifiedGraph({ guidance: true }), { countTokens: () => new Promise(resolve => release = resolve) });
    const published = [];
    f.c.setExtensionPrompt = (key, value) => { published.push(value); f.c.extensionPrompts[key] = { value }; };
    const preparing = f.start();
    for (let tries = 0; tries < 30 && !release; tries++) await nextTurn(); assert.equal(typeof release, 'function');
    f.setBusy(false); await f.c.eventSource.emit('GENERATION_ENDED', 1); await nextTurn();
    release({ tokens: 4 });
    const result = await preparing; assert.equal(result.ok, false); assert.equal(published.includes('Use vivid prose.'), false);
    assert.equal(f.requests(), 0);
});

test('delayed Started accepts the owned normal reply and generated swipe despite earlier generation timestamp', async () => {
    for (const type of ['normal', 'swipe']) {
        const f = nativeFixture();
        const earlierStart = new Date(Date.now() - 5000).toISOString();
        let m;
        if (type === 'swipe') { m = addReply(f, { text: 'Earlier reply.' }); m.swipe_id = 1; }
        const ready = await f.start(type); assert.equal(ready.awaitingNative, true);
        const finished = new Date().toISOString();
        if (type === 'normal') m = addReply(f);
        Object.assign(m, { mes: 'Native reply.', gen_started: earlierStart, gen_finished: finished });
        if (type === 'normal') { m.swipes[0] = m.mes; m.swipe_info[0] = { gen_started: earlierStart, gen_finished: finished, extra: {} }; }
        else { m.swipes.push(m.mes); m.swipe_info.push({ gen_started: earlierStart, gen_finished: finished, extra: {} }); }
        await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, type); f.setBusy(false); await f.c.eventSource.emit('GENERATION_ENDED', 2);
        const result = await settled(f);
        assert.equal(result.ok, true, `${type}: ${JSON.stringify(result.error)}`);
        assert.equal(result.runId, ready.runId); assert.equal(f.requests(), 1);
        assert.equal(result.reviewHandles.length, 1); assert.equal(m.mes, 'Native reply.');
        assert.equal((await f.controller.apply(result.reviewHandles[0])).ok, true);
        assert.deepEqual(m.swipes, type === 'normal' ? ['Native reply.', 'Revised reply.'] : ['Earlier reply.', 'Native reply.', 'Revised reply.']);
    }
});

test('a new swipe slot cannot reuse the previous native generation identity', async () => {
    const f = nativeFixture();
    const previous = addReply(f, { text: 'Earlier reply.' });
    const stamp = new Date(Date.now() + 500).toISOString();
    Object.assign(previous, { gen_started: stamp, gen_finished: stamp });
    previous.swipe_info[0] = { gen_started: stamp, gen_finished: stamp, extra: {} };
    previous.swipe_id = 1;
    const ready = await f.start('swipe'); assert.equal(ready.awaitingNative, true);
    previous.mes = 'Replayed prior generation.';
    previous.swipes.push(previous.mes); previous.swipe_info.push({ gen_started: stamp, gen_finished: stamp, extra: {} });
    await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, 'swipe'); f.setBusy(false); await f.c.eventSource.emit('GENERATION_ENDED', 2);
    const result = await settled(f);
    assert.equal(result.ok, false); assert.equal(result.error.code, 'NATIVE_GENERATION_MISMATCH');
    assert.equal(f.requests(), 0); assert.deepEqual(result.reviewHandles, []);
});

function plannedUnifiedGraph({ revise = false } = {}) {
    const graph = unifiedGraph({ revise });
    graph.nodes.scene = { id: 'scene', type: 'workflow', operation: 'scene-context', visibilityMode: 'public' };
    graph.nodes.plan = { id: 'plan', type: 'workflow', operation: 'response-plan', instructions: 'Offer scene guidance.' };
    graph.wires.context = { id: 'context', route: 'wire', from: 'scene', fromPort: 'out', to: 'plan', toPort: 'in' };
    graph.wires.guidance = { id: 'guidance', route: 'wire', from: 'plan', fromPort: 'out', to: 'generate', toPort: 'guidance' };
    return graph;
}

test('native preparation rejects a pre model binding changed during its completion, tokenizer or prompt callback', async () => {
    for (const stage of ['completion', 'tokenizer', 'prompt']) {
        let model = 'original', calls = 0, aborted = 0;
        const guidance = 'Model-generated guidance.';
        const f = nativeFixture(plannedUnifiedGraph(), {
            resolveBinding: () => ({ ok: true, data: { profileId: 'fixed', model } }),
            request: async () => { calls++; if (stage === 'completion') model = 'changed'; return { ok: true, data: { text: guidance, finish: 'stop' } }; },
            countTokens: async text => { if (stage === 'tokenizer' && text === guidance) { await Promise.resolve(); model = 'changed'; } return { tokens: 4 }; },
            abort: () => { aborted++; }
        });
        const published = [];
        f.c.extensionPrompts.other = { value: 'Keep other guidance.' };
        f.c.setExtensionPrompt = (key, value) => { published.push(value); f.c.extensionPrompts[key] = { value }; if (stage === 'prompt' && value === guidance) model = 'changed'; };
        const result = await f.start();
        assert.equal(result.ok, false, stage);
        assert.equal(result.error.code, 'BINDING_CHANGED', stage);
        assert.equal(result.prepared, undefined); assert.equal(result.awaitingNative, undefined);
        assert.equal(calls, 1, 'The completed pre call is the only auxiliary request');
        assert.equal(aborted, 1, 'The owned native generation must be aborted before release');
        assert.equal(Object.entries(f.c.extensionPrompts).filter(([key]) => key.startsWith('lattice:guidance:')).every(([, value]) => !value.value), true);
        assert.equal(f.c.extensionPrompts.other.value, 'Keep other guidance.');
        assert.equal(published.includes(guidance), stage === 'prompt', stage);
        addReply(f); f.setBusy(false); await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, 'normal'); await f.c.eventSource.emit('GENERATION_ENDED', 2); await nextTurn();
        assert.equal(calls, 1); assert.deepEqual(result.reviewHandles, []);
    }
});

test('fresh opaque pre and post bindings preserve exact authority across normal and swipe continuation', async () => {
    for (const type of ['normal', 'swipe']) {
        const pre = Object.freeze({ profileId: 'pre-fixed', model: 'pre-model', authorization: 'PRIVATE_PRE', opaque: () => {} });
        const post = Object.freeze({ profileId: 'post-fixed', model: 'post-model', authorization: 'PRIVATE_POST', opaque: () => {} });
        const checks = [], calls = [];
        const f = nativeFixture(plannedUnifiedGraph({ revise: true }), {
            ports: { bindingStatus(binding) { assert.ok(binding === pre || binding === post); checks.push(binding); return { ok: true }; } },
            resolveBinding: node => ({ ok: true, data: node.id === 'plan' ? pre : post }),
            request: async options => { assert.ok(options.binding === pre || options.binding === post); calls.push(options.binding); return { ok: true, data: { text: options.binding === pre ? 'Fresh model guidance.' : 'Revised reply.', finish: 'stop' } }; }
        });
        let m;
        if (type === 'swipe') { m = addReply(f, { text: 'Earlier reply.' }); Object.assign(m, { gen_started: '2020-01-01', gen_finished: '2020-01-02' }); m.swipe_id = 1; }
        const ready = await f.start(type); assert.equal(ready.awaitingNative, true, JSON.stringify(ready.error));
        assert.deepEqual(calls, [pre]); assert.ok(checks.length >= 4); assert.equal(checks.every(binding => binding === pre), true);
        if (type === 'normal') m = addReply(f);
        else { const stamp = new Date().toISOString(); Object.assign(m, { mes: 'Native reply.', gen_started: stamp, gen_finished: stamp }); m.swipes.push(m.mes); m.swipe_info.push({ gen_started: stamp, gen_finished: stamp, extra: {} }); }
        await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, type); f.setBusy(false); await f.c.eventSource.emit('GENERATION_ENDED', 2);
        const result = await settled(f); assert.equal(result.ok, true, JSON.stringify(result.error)); assert.deepEqual(calls, [pre, post]); assert.ok(checks.includes(post));
        assert.equal(JSON.stringify(result.recording).includes('PRIVATE_'), false);
        assert.equal((await f.controller.apply(result.reviewHandles[0])).ok, true);
        assert.deepEqual(m.swipes, type === 'normal' ? ['Native reply.', 'Revised reply.'] : ['Earlier reply.', 'Native reply.', 'Revised reply.']);
    }
});

test('preparation checks every completed pre binding even when Join selects a different guidance', async () => {
    const graph = plannedUnifiedGraph();
    graph.nodes.second = { id: 'second', type: 'workflow', operation: 'response-plan', instructions: 'Offer alternate guidance.' };
    graph.nodes.join = { id: 'join', type: 'workflow', operation: 'join', artifactKind: 'guidance', selection: 'last', inputs: [{ id: 'first', label: 'First', required: true }, { id: 'second', label: 'Second', required: true }] };
    graph.wires.second = { id: 'second', route: 'wire', from: 'scene', fromPort: 'out', to: 'second', toPort: 'in' };
    graph.wires.firstJoin = { id: 'firstJoin', route: 'wire', from: 'plan', fromPort: 'out', to: 'join', toPort: 'first' };
    graph.wires.secondJoin = { id: 'secondJoin', route: 'wire', from: 'second', fromPort: 'out', to: 'join', toPort: 'second' };
    graph.wires.guidance.from = 'join';
    let firstModel = 'first-original', calls = 0, aborted = 0;
    const f = nativeFixture(graph, {
        resolveBinding: node => ({ ok: true, data: { profileId: node.id, model: node.id === 'plan' ? firstModel : 'second-fixed' } }),
        request: async options => { calls++; if (options.binding.profileId === 'second') firstModel = 'first-changed'; return { ok: true, data: { text: 'Chosen guidance.', finish: 'stop' } }; },
        abort: () => { aborted++; }
    });
    const result = await f.start(); assert.equal(result.ok, false); assert.equal(result.error.code, 'BINDING_CHANGED');
    assert.equal(calls, 2); assert.equal(aborted, 1); assert.deepEqual(result.reviewHandles, []);
    assert.equal(Object.values(f.c.extensionPrompts).some(value => value.value === 'Chosen guidance.'), false);
});

test('native release without guidance validates the ordinary Decision profile and model', async () => {
    for (const changed of ['profile', 'model', 'none']) {
        const graph = unifiedGraph({ revise: false });
        graph.nodes.state = { id: 'state', type: 'workflow', operation: 'compose', sections: [{ name: 'scene', text: 'They kissed.' }] };
        graph.nodes.decision = { id: 'decision', type: 'workflow', operation: 'decision', inputKind: 'text', profileId: 'independent-text', questions: { kiss: { type: 'noul', instructions: 'Did they kiss?' } } };
        graph.nodes.check = { id: 'check', type: 'workflow', operation: 'condition', path: ['answers', 'kiss', 'accepted'], operator: 'equals', value: true };
        graph.nodes.branch = { id: 'branch', type: 'workflow', operation: 'branch', artifactKind: 'data' };
        graph.wires.state = { id: 'state', route: 'wire', from: 'state', fromPort: 'out', to: 'decision', toPort: 'in' };
        graph.wires.check = { id: 'check', route: 'wire', from: 'decision', fromPort: 'out', to: 'check', toPort: 'in' };
        graph.wires.condition = { id: 'condition', route: 'wire', from: 'check', fromPort: 'out', to: 'branch', toPort: 'condition' };
        graph.wires.activation.to = 'branch'; graph.wires.activation.toPort = 'in';
        graph.wires.selected = { id: 'selected', route: 'wire', from: 'branch', fromPort: 'yes', to: 'generate', toPort: 'activation' };
        let profile = 'independent-text', model = 'model-original', calls = 0, aborted = 0;
        const f = nativeFixture(graph, {
            resolveBinding: node => { assert.equal(node.profileId, 'independent-text'); return { ok: true, data: { profileId: profile, model } }; },
            request: async () => { calls++; if (changed === 'profile') profile = 'profile-changed'; if (changed === 'model') model = 'model-changed'; return { ok: true, data: { text: '{"answers":{"kiss":{"type":"noul","accepted":true}}}', finish: 'stop' } }; },
            abort: () => { aborted++; }
        });
        const ready = await f.start(); assert.equal(calls, 1);
        if (changed !== 'none') { assert.equal(ready.ok, false, changed); assert.equal(ready.error.code, 'BINDING_CHANGED', changed); assert.equal(aborted, 1); assert.deepEqual(ready.reviewHandles, []); }
        else {
            assert.equal(ready.awaitingNative, true, JSON.stringify(ready.error)); assert.equal(ready.published, false); assert.equal(aborted, 0);
            addReply(f); await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, 'normal'); f.setBusy(false); await f.c.eventSource.emit('GENERATION_ENDED', 2);
            const result = await settled(f); assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.reviewHandles.length, 1); assert.equal(calls, 1);
        }
    }
});

test('final binding callbacks cannot change source or user ownership before native publication or release', async () => {
    for (const guard of [5, 3]) for (const changed of ['prefix', 'user']) {
        let checks = 0, calls = 0, aborted = 0;
        const binding = Object.freeze({ profileId: 'fixed', model: 'original', opaque: () => {} });
        const guidance = 'Checked model guidance.';
        const f = nativeFixture(plannedUnifiedGraph(), {
            ports: { bindingStatus(actual) { assert.equal(actual, binding); checks++; if (checks === guard) { if (changed === 'prefix') f.c.chat[0].mes = 'Edited during the binding callback.'; else f.setUser('other-user'); } return { ok: true }; } },
            resolveBinding: () => ({ ok: true, data: binding }),
            request: async () => { calls++; return { ok: true, data: { text: guidance, finish: 'stop' } }; },
            abort: () => { aborted++; }
        });
        const published = [];
        f.c.extensionPrompts.other = { value: 'Keep other guidance.' };
        f.c.setExtensionPrompt = (key, value) => { published.push(value); f.c.extensionPrompts[key] = { value }; };
        const result = await f.start();
        assert.equal(result.ok, false, `guard ${guard} ${changed}`);
        assert.equal(result.error.code, 'STALE_SOURCE'); assert.equal(checks, guard);
        assert.equal(result.prepared, undefined); assert.equal(result.awaitingNative, undefined);
        assert.equal(aborted, 1); assert.equal(calls, 1); assert.deepEqual(result.reviewHandles, []);
        assert.equal(published.includes(guidance), guard === 5);
        assert.equal(Object.entries(f.c.extensionPrompts).filter(([key]) => key.startsWith('lattice:guidance:')).every(([, value]) => !value.value), true);
        assert.equal(f.c.extensionPrompts.other.value, 'Keep other guidance.');
        addReply(f); f.setBusy(false); await f.c.eventSource.emit('MESSAGE_RECEIVED', 1, 'normal'); await f.c.eventSource.emit('GENERATION_ENDED', 2); await nextTurn(); assert.equal(calls, 1);
    }
});

test('source and user mutation from the prompt setter revoke guidance before native release', async () => {
    for (const changed of ['prefix', 'user']) {
        let aborted = 0;
        const f = nativeFixture(plannedUnifiedGraph(), { request: async () => ({ ok: true, data: { text: 'Checked setter guidance.', finish: 'stop' } }), abort: () => { aborted++; } });
        f.c.setExtensionPrompt = (key, value) => { f.c.extensionPrompts[key] = { value }; if (value === 'Checked setter guidance.') { if (changed === 'prefix') f.c.chat[0].mes = 'Edited by setter.'; else f.setUser('other-user'); } };
        const result = await f.start(); assert.equal(result.ok, false); assert.equal(result.error.code, 'STALE_SOURCE'); assert.equal(aborted, 1);
        assert.equal(result.awaitingNative, undefined); assert.deepEqual(result.reviewHandles, []);
        assert.equal(Object.values(f.c.extensionPrompts).every(value => !value.value), true);
    }
});


test('Send skips a legacy Pre assignment without resolving or publishing it', async () => {
    const legacy = { id: 'retired-pre', schema: 3, runtime: 2, mode: 'native-pre', nodes: {
        text: { id: 'text', type: 'workflow', operation: 'compose', outputKind: 'guidance', sections: [{ name: 'direction', text: 'Retired guidance.' }] },
        guidance: { id: 'guidance', type: 'workflow', operation: 'guidance' }
    }, wires: { guide: { id: 'guide', route: 'wire', from: 'text', fromPort: 'out', to: 'guidance', toPort: 'in' } }, definitions: {}, portals: {} };
    const c = { chatId: 'story', characterId: 0, groupId: null, chat: [{ is_user: true, mes: 'Continue.' }], extensionPrompts: { 'lattice:guidance:old': { value: 'Expired' }, other: { value: 'Keep' } } };
    c.setExtensionPrompt = (key, value) => { c.extensionPrompts[key] = { value }; };
    let legacyReads = 0, effects = 0;
    const controller = createNativeWorkflowController({ context: () => c, isEnabled: () => true, getGraph: phase => { if (phase === 'pre') { legacyReads++; return legacy; } }, countTokens: () => { effects++; return { tokens: 1 }; }, resolveBinding: () => { effects++; }, request: () => { effects++; } });
    const result = await controller.beforeGenerate(c.chat, 8192, () => {}, 'normal');
    assert.equal(result.ok, true); assert.equal(result.skipped, true);
    assert.equal(legacyReads, 0); assert.equal(effects, 0);
    assert.equal(c.extensionPrompts['lattice:guidance:old'].value, ''); assert.equal(c.extensionPrompts.other.value, 'Keep');
    assert.equal(Object.values(c.extensionPrompts).some(entry => entry.value === 'Retired guidance.'), false);
});

test('identical document replacement cannot publish a late automatic result over a fresh Send',async()=>{
    const graph=unifiedGraph();let owner={},release,started;
    const waiting=new Promise(resolve=>started=resolve);let calls=0;
    const f=nativeFixture(graph,{ports:{getDocumentToken:()=>owner},request:async()=>{if(++calls===1){started();await new Promise(resolve=>release=resolve);}return {ok:true,data:{text:'Revised reply.',finish:'stop'}};}});
    await f.start();addReply(f);await f.c.eventSource.emit('MESSAGE_RECEIVED',1,'normal');f.setBusy(false);await f.c.eventSource.emit('GENERATION_ENDED',2);await waiting;
    owner={};f.controller.cancel('Workflow document replaced');await nextTurn();assert.equal(f.results.length,0,'Replaced document results never notify the current document');
    f.c.chat.push({mes:'Continue.',is_user:true,extra:{}});await f.start();addReply(f);await f.c.eventSource.emit('MESSAGE_RECEIVED',3,'normal');f.setBusy(false);await f.c.eventSource.emit('GENERATION_ENDED',4);
    const fresh=await settled(f),automatic=f.controller.lastAutomaticResult();assert.equal(fresh.ok,true);assert.equal(automatic.origin.documentToken,owner);
    release();await nextTurn();assert.equal(f.controller.lastAutomaticResult(),automatic);assert.equal(f.results.length,1);
    assert.equal(f.controller.candidateStatus(fresh.reviewHandles[0]).ok,true);
});
