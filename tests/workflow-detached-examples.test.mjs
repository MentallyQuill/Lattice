import assert from 'node:assert/strict';
import test from 'node:test';
import { installWorkflowExample, listWorkflowExamples } from '../src/workflow/examples.js?v=0.26.0';
import { validateWorkflow } from '../src/workflow/contracts.js?v=0.26.0';

test('opening an example prepares independent primary and companion documents without a registry', () => {
    const first = installWorkflowExample('continuity-and-voice'), second = installWorkflowExample('continuity-and-voice');
    assert.equal(first.ok, true, JSON.stringify(first.error));
    assert.equal(second.ok, true, JSON.stringify(second.error));
    assert.equal(first.data.companions.length, 1);
    assert.notEqual(first.data.graph.id, second.data.graph.id);
    const canonicalName = listWorkflowExamples().find(entry => entry.id === 'continuity-and-voice').graph.name;
    assert.equal(first.data.graph.name, canonicalName); assert.equal(second.data.graph.name, canonicalName);
    for (const graph of [first.data.graph, ...first.data.companions]) assert.equal(validateWorkflow(graph).ok, true);
    first.data.companions[0].name = 'Changed only in first bundle';
    assert.notEqual(second.data.companions[0].name, 'Changed only in first bundle');
});
