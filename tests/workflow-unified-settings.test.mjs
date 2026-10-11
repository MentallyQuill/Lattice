import assert from 'node:assert/strict';
import test from 'node:test';
import { installMock } from './mock.js';
import * as state from '../src/state.js?v=0.26.0';
import { starterGraph } from '../src/workflow/starters.js?v=0.26.0';
import { validateWorkflow } from '../src/workflow/contracts.js?v=0.26.0';
import { sendWorkflowState } from '../src/run.js?v=0.26.0';

test('new unified starter has explicit native boundary and a checked review terminal', () => {
    const graph = starterGraph('unified-basic'); assert.equal(graph.mode, 'native-unified');
    assert.deepEqual(Object.values(graph.nodes).map(node => node.operation), ['on-send', 'generate-reply', 'review-publish']);
    const checked = validateWorkflow(graph); assert.equal(checked.ok, true, JSON.stringify(checked.error)); assert.equal(checked.data.callBound, 0);
});
test('detached unified creation requires activation and keeps the Arm preference separate', () => {
    installMock(); const value = state.settings(), current = state.activeWorkflow(), graph = state.createGraph('Story');
    assert.equal(graph.mode, 'native-unified'); assert.equal(state.activeWorkflow(), current);
    state.activateWorkflow(graph); assert.equal(sendWorkflowState().automatic, true); assert.match(sendWorkflowState().armedText, /unified/i);
    assert.equal(value.enabled, false); assert.equal(Object.hasOwn(value, 'nativeBindings'), false);
});
test('legacy assignments cannot redirect Send away from the migrated current document', () => {
    const current = starterGraph('structured-guidance'), assigned = starterGraph('unified-basic');
    installMock({ settings: { graphs: { [current.id]: current, [assigned.id]: assigned }, activeGraphId: current.id, nativeBindings: { workflowGraphId: assigned.id } } });
    assert.equal(state.activeWorkflow().id, current.id);
    assert.equal(sendWorkflowState().automatic, true); assert.match(sendWorkflowState().armedText, /adds guidance before Send/);
    assert.equal(state.recoveredWorkflows().length, 2);
});
