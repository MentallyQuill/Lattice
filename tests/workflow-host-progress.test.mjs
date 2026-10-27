import assert from 'node:assert/strict';
import test from 'node:test';
import { fixtureGraph } from './helpers/workflow-fixtures.mjs';
import { nativeFixture } from './helpers/native-workflow-fixture.mjs';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function delayedFixture(options = {}) {
    const graph = fixtureGraph('native-guidance');
    graph.nodes['scene-context'].visibilityMode = 'public';
    const entered = deferred(), response = deferred(), documentToken = {};
    const f = nativeFixture(graph, { ...options, ports: { ...options.ports, getDocumentToken: () => documentToken }, request: options.request ?? (() => { entered.resolve(); return response.promise; }) });
    return { ...f, graph, entered, response, documentToken, target: { workflowId: graph.id, instancePath: [], nodeId: 'guidance', portId: 'out' } };
}

// Losing the accepted plan when a view subscribes after dispatch prevents live node paint.
test('a late progress subscriber immediately receives the current immutable addressed run state', async () => {
    const f = delayedFixture();
    assert.equal(typeof f.controller.progress, 'function');
    assert.equal(f.controller.progress(), null);
    const pending = f.controller.runTarget(f.graph, f.target);
    await f.entered.promise;
    const progress = f.controller.progress(), running = progress.runState.nodes.find(node => node.status === 'running');
    assert.equal(progress.graph, f.graph);
    assert.equal(progress.documentToken, f.documentToken);
    assert.equal(progress.runId, progress.runState.runId);
    assert.equal(progress.runState.status, 'running');
    assert.equal(running.request.status, 'running');
    assert.equal(running.address.workflowId, f.graph.id);
    assert.ok(Object.isFrozen(progress) && Object.isFrozen(progress.runState) && Object.isFrozen(running));
    assert.equal(Object.isFrozen(f.graph), false, 'Progress cannot freeze the live editable graph');
    assert.deepEqual(Object.keys(progress).sort(), ['busy', 'documentToken', 'graph', 'graphId', 'native', 'runId', 'runState']);
    const seen = [], stop = f.controller.subscribeProgress(value => seen.push(value));
    assert.equal(seen.length, 1);
    assert.equal(seen[0].runState, progress.runState);
    f.response.resolve({ ok: true, data: { text: 'Keep the scene quiet.', finish: 'stop' } });
    assert.equal((await pending).ok, true);
    assert.ok(seen.some(value => value?.runState.status === 'completed'));
    assert.equal(seen.at(-1), null);
    assert.equal(f.controller.progress(), null);
    stop();
    const count = seen.length;
    f.controller.cancel();
    assert.equal(seen.length, count);
    f.controller.dispose();
});

// Progress must be current before public events, without multiplying activity notifications.
test('progress observers are isolated and node events leave activity publication cadence unchanged', async () => {
    const observations = [];
    let f;
    f = delayedFixture({ onEvent: event => { const progress = f.controller.progress(); observations.push([event, progress]); } });
    const activity = [], progress = [];
    f.controller.subscribeActivity(value => activity.push(value?.busy ?? false));
    f.controller.subscribeProgress(() => { throw new Error('passive observer'); });
    f.controller.subscribeProgress(() => Promise.reject(new Error('passive asynchronous observer')));
    f.controller.subscribeProgress(value => progress.push(value));
    const pending = f.controller.runTarget(f.graph, f.target);
    await f.entered.promise;
    assert.deepEqual(activity, [false, false, true]);
    assert.ok(progress.some(value => value?.runState.status === 'empty'));
    assert.ok(observations.length > 2);
    for (const [event, snapshot] of observations) assert.equal(snapshot.runState.lastSeq, event.seq);
    f.response.resolve({ ok: true, data: { text: 'Keep the scene quiet.', finish: 'stop' } });
    assert.equal((await pending).ok, true);
    assert.deepEqual(activity, [false, false, true, false]);
    assert.equal(progress.at(-1), null);
    f.controller.dispose();
});

// Clearing the active owner before its barrier hides cancellation from an open view.
test('cancellation publishes its live barrier then clears progress before late provider completion', async () => {
    const f = delayedFixture(), seen = [];
    f.controller.subscribeProgress(value => seen.push(value));
    const pending = f.controller.runTarget(f.graph, f.target);
    await f.entered.promise;
    const runId = f.controller.progress().runId;
    f.controller.cancel('Stop from test');
    const barrier = seen.find(value => value?.runState.status === 'cancelling');
    assert.equal(barrier.runId, runId);
    assert.equal(barrier.runState.nodes.find(node => node.status === 'cancelling').request.status, 'running');
    assert.equal(seen.at(-1), null);
    assert.equal(f.controller.progress(), null);
    const count = seen.length;
    f.response.resolve({ ok: true, data: { text: 'Late text cannot revive progress.', finish: 'stop' } });
    assert.equal((await pending).error.code, 'ABORTED');
    assert.equal(f.controller.progress(), null);
    assert.equal(seen.length, count);
    f.controller.dispose();
});

// A late cancelled first request must not erase the second run's retained plan.
test('superseded runtime events cannot replace progress retained for the new active run', async () => {
    const entered = [deferred(), deferred()], responses = [deferred(), deferred()];
    let requests = 0;
    const f = delayedFixture({ request: () => { const index = requests++; entered[index].resolve(); return responses[index].promise; } });
    const first = f.controller.runTarget(f.graph, f.target);
    await entered[0].promise;
    const firstId = f.controller.progress().runId;
    const second = f.controller.runTarget(f.graph, f.target);
    await entered[1].promise;
    const retained = f.controller.progress();
    assert.notEqual(retained.runId, firstId);
    responses[0].resolve({ ok: true, data: { text: 'Cancelled first result.', finish: 'stop' } });
    assert.equal((await first).error.code, 'ABORTED');
    assert.equal(f.controller.progress().runState, retained.runState);
    responses[1].resolve({ ok: true, data: { text: 'Current second result.', finish: 'stop' } });
    assert.equal((await second).ok, true);
    assert.equal(f.controller.progress(), null);
    f.controller.dispose();
});

// A reentrant cancel must prevent the interrupted publication from reviving stale progress.
test('reentrant cancellation never publishes an obsolete active snapshot after idle progress', async () => {
    for (const source of ['progress', 'activity']) {
        const f = delayedFixture(), seen = [];
        if (source === 'progress') f.controller.subscribeProgress(value => {
            if (value?.runState.status === 'running') f.controller.cancel('Cancel from progress observer');
        });
        else f.controller.subscribeActivity(value => { if (value?.busy) f.controller.cancel('Cancel from activity observer'); });
        f.controller.subscribeProgress(value => seen.push(value));
        const result = await f.controller.runTarget(f.graph, f.target);
        assert.equal(result.error.code, 'ABORTED');
        assert.equal(f.controller.progress(), null);
        assert.equal(seen.at(-1), null, `${source} cancellation must leave every observer idle`);
        assert.equal(seen.some(value => value?.runState.status === 'running'), false, 'A listener after the cancelling observer cannot receive obsolete running state');
        f.controller.dispose();
    }
});
