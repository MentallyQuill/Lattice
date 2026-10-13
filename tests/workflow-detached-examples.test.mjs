import assert from 'node:assert/strict';
import test from 'node:test';
import { installWorkflowExample, listWorkflowExamples } from '../src/workflow/examples.js?v=0.27.2';
import { validateWorkflow } from '../src/workflow/contracts.js?v=0.27.2';

test('opening an example prepares independent unified documents without a registry', () => {
    const first = installWorkflowExample('lesson-01'), second = installWorkflowExample('lesson-01');
    assert.equal(first.ok, true, JSON.stringify(first.error));
    assert.equal(second.ok, true, JSON.stringify(second.error));
    assert.equal(first.data.companions.length, 0);
    assert.notEqual(first.data.graph.id, second.data.graph.id);
    const canonicalName = listWorkflowExamples().find(entry => entry.id === 'lesson-01').graph.name;
    assert.equal(first.data.graph.name, canonicalName); assert.equal(second.data.graph.name, canonicalName);
    for (const graph of [first.data.graph, ...first.data.companions]) assert.equal(validateWorkflow(graph).ok, true);
    first.data.graph.name = 'Changed only in first document';
    assert.notEqual(second.data.graph.name, 'Changed only in first document');
});
