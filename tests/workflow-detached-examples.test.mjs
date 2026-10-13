import assert from 'node:assert/strict';
import test from 'node:test';
import { installWorkflowExample, listWorkflowExamples } from '../src/workflow/examples.js?v=0.27.2';
import { validateWorkflow } from '../src/workflow/contracts.js?v=0.27.2';
import { REMASTERED_WORKFLOW_EXAMPLE_DATA } from '../src/workflow/remastered-example-data.js?v=0.27.2';

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

test('repeated installation reuses private admission while returning fresh graph and node identities', () => {
    const entry = REMASTERED_WORKFLOW_EXAMPLE_DATA.find(item => item.id === 'lesson-01');
    const graph = entry.packages[0].graph, descriptor = Object.getOwnPropertyDescriptor(graph, 'description');
    const parse = JSON.parse; let parses = 0;
    graph.description = `${graph.description ?? ''} Admission cache probe.`;
    JSON.parse = (...args) => { parses++; return parse(...args); };
    try {
        const first = installWorkflowExample(entry.id);
        assert.equal(first.ok, true, JSON.stringify(first.error));
        const admittedParses = parses;
        assert.ok(admittedParses > 0, 'The first installation must parse and admit the authored package');
        const second = installWorkflowExample(entry.id);
        assert.equal(second.ok, true, JSON.stringify(second.error));
        assert.equal(parses, admittedParses, 'An unchanged plain package must not be admitted again');
        assert.notEqual(second.data.graph, first.data.graph);
        assert.notEqual(second.data.graph.id, first.data.graph.id);
        assert.equal(Object.keys(second.data.graph.nodes).length, Object.keys(first.data.graph.nodes).length);
        assert.ok(Object.keys(second.data.graph.nodes).every(id => !Object.hasOwn(first.data.graph.nodes, id)));
    } finally {
        JSON.parse = parse;
        if (descriptor) Object.defineProperty(graph, 'description', descriptor); else delete graph.description;
    }
});
