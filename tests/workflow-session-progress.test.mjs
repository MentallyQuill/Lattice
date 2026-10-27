import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkflowSession, prepareWorkflowProjection, projectPreparedWorkflow } from '../src/ui/workflow-surface.js';
import { createRunState, reduceRunState } from '../src/workflow/run-state.js';
import { parseRunPlan } from '../src/workflow/record-data.js';
import { resolveWorkflow } from '../src/workflow/resolve.js';
import { reviewGraph } from './helpers/native-workflow-fixture.mjs';
import { fixtureGraph } from './helpers/workflow-fixtures.mjs';
import { createRunRecorder } from '../src/workflow/recording.js';
import { workflowSignature } from '../src/workflow/runtime.js';

test('opening during Send hydrates the current node and follows subsequent progress without review authority', () => {
    const graph = reviewGraph({ revise: false }), owner = {}, runId = 'active-send';
    const plan = parseRunPlan(resolveWorkflow(graph).data);
    let runState = reduceRunState(createRunState(runId), { runId, seq: 1, at: 1, elapsedMs: 0, type: 'plan', plan });
    const send = { workflowId: graph.id, instancePath: [], nodeId: 'send' };
    runState = reduceRunState(runState, { runId, seq: 2, at: 2, elapsedMs: 1, type: 'node-phase', address: send, phase: 'executing' });
    runState = reduceRunState(runState, { runId, seq: 3, at: 3, elapsedMs: 2, type: 'node-settled', address: send, status: 'completed' });
    const address = { workflowId: graph.id, instancePath: [], nodeId: 'generate' };
    runState = reduceRunState(runState, { runId, seq: 4, at: 4, elapsedMs: 3, type: 'node-phase', address, phase: 'executing' });
    let state;
    const session = createWorkflowSession({ runtime: () => ({}), current: () => graph, epoch: () => 1, documentToken: () => owner, active: () => true, changed: value => { state = value; } });
    const progress = () => ({ busy: true, graph, graphId: graph.id, runId, native: true, documentToken: owner, runState });
    for (const foreign of [{ graph: { ...graph } }, { documentToken: {} }, { runId: 'other-run' }, { graphId: 'other-workflow' }]) {
        session.receiveProgress({ ...progress(), ...foreign });
        assert.equal(state, undefined, 'Progress from another owner cannot paint this workflow');
    }
    session.receiveProgress(progress());
    const prepared = prepareWorkflowProjection(graph);
    assert.equal(projectPreparedWorkflow(prepared, state).rows.find(row => row.address.nodeId === 'generate').status, 'running');
    assert.equal(session.result(), null);
    assert.deepEqual(state.reviewHandles, []);
    runState = reduceRunState(runState, { runId, seq: 5, at: 5, elapsedMs: 4, type: 'node-settled', address, status: 'completed' });
    session.receiveProgress(progress());
    assert.equal(projectPreparedWorkflow(prepared, state).rows.find(row => row.address.nodeId === 'generate').status, 'completed');
    assert.equal(Object.isFrozen(graph), false);
});

test('a target run retains its completed recording while the editor is hidden', async () => {
    const graph = fixtureGraph('structured-guidance'), owner = {}, runId = 'hidden-target';
    const recorder = createRunRecorder({ runId });
    recorder.accept({ runId, seq: 1, at: 1, elapsedMs: 0, type: 'plan', plan: parseRunPlan(resolveWorkflow(graph).data) });
    recorder.accept({ runId, seq: 2, at: 2, elapsedMs: 1, type: 'run-settled', status: 'completed' });
    const recording = recorder.finish();
    let finish, state, visible = true;
    const runtime = { runTarget: () => new Promise(resolve => { finish = resolve; }) };
    const session = createWorkflowSession({ runtime: () => runtime, current: () => graph, epoch: () => 1, documentToken: () => owner, active: () => visible, ownerActive: () => true, changed: value => { state = value; } });
    const pending = session.run({ target: { workflowId: graph.id, instancePath: [], nodeId: 'compose-guidance', portId: 'out' } });
    visible = false;
    finish({ schema: 3, runtime: 2, mode: 'target', runId, ok: true, actualCalls: 0, recording, reviewHandles: [] });
    const response = await pending;
    assert.equal(response?.ok, true);
    assert.equal(session.result()?.recording, recording);
    assert.equal(state.busy, false);
    assert.equal(session.currentDiagnostics(), null, 'a hidden editor still has no visible diagnostic authority');
    visible = true;
    assert.equal(session.currentDiagnostics()?.attemptId, runId);
});

for (const observedProgress of [true, false]) test(`a newer Send supersedes an outstanding preview when its live progress is ${observedProgress ? 'observed' : 'missed while hidden'}`, async () => {
    const graph = fixtureGraph('structured-guidance'), owner = {}, plan = parseRunPlan(resolveWorkflow(graph).data);
    let finish, options, state, automatic;
    const runtime = { runTarget: (_graph, _target, opts) => { options = opts; return new Promise(resolve => { finish = resolve; }); }, lastAutomaticResult: () => automatic };
    const session = createWorkflowSession({ runtime: () => runtime, current: () => graph, epoch: () => 1, documentToken: () => owner, active: () => true, changed: value => { state = value; } });
    const pending = session.run({ target: { workflowId: graph.id, instancePath: [], nodeId: 'compose-guidance', portId: 'out' } });
    options.onEvent({ runId: 'old-preview', seq: 1, at: 1, elapsedMs: 0, type: 'plan', plan });
    if (observedProgress) session.receiveProgress({ busy: true, graph, graphId: graph.id, documentToken: owner, native: true, runId: 'new-send', runState: createRunState('new-send') });
    const recorder = createRunRecorder({ runId: 'new-send' });
    recorder.accept({ runId: 'new-send', seq: 1, at: 1, elapsedMs: 0, type: 'plan', plan });
    recorder.accept({ runId: 'new-send', seq: 2, at: 2, elapsedMs: 1, type: 'run-settled', status: 'completed' });
    automatic = { origin: { graph, graphId: graph.id, documentToken: owner, signature: workflowSignature(graph), phase: 'unified', kind: 'send', runId: 'new-send' }, result: { schema: 3, runtime: 2, mode: 'root', runId: 'new-send', ok: true, actualCalls: 0, recording: recorder.finish(), reviewHandles: [] } };
    session.receiveAutomatic(automatic);
    assert.equal(session.result()?.runId, 'new-send');
    finish({ schema: 3, runtime: 2, mode: 'target', runId: 'old-preview', ok: false, actualCalls: 0, error: { code: 'ABORTED', message: 'Superseded.' } });
    await pending;
    assert.equal(session.result()?.runId, 'new-send');
    assert.equal(state.busy, false);
});
