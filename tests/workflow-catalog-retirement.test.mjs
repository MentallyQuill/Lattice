import test from 'node:test';
import assert from 'node:assert/strict';
import {STARTERS, starterGraph, installStarter} from '../src/workflow/starters.js';
import {listWorkflowExamples, listWorkflowExampleResults, installWorkflowExample} from '../src/workflow/examples.js';
import {validateWorkflow} from '../src/workflow/contracts.js';
import * as library from '../src/workflow/library/subgraphs.js';

test('the sole starter installs detached unified roots without assigning or arming', () => {
    assert.deepEqual(STARTERS.map(starter => starter.id), ['unified-basic']);
    const settings = {graphs:{}, enabled:false, nativeBindings:{workflowGraphId:null}};
    const first = installStarter('unified-basic', settings), second = installStarter('unified-basic', settings);
    assert.notEqual(first.id, second.id);
    assert.notEqual(Object.keys(first.nodes)[0], Object.keys(second.nodes)[0]);
    first.nodes[Object.keys(first.nodes)[0]].title = 'Local edit';
    assert.notEqual(Object.values(second.nodes)[0].title, 'Local edit');
    assert.equal(starterGraph('unified-basic').mode, 'native-unified');
    assert.equal(validateWorkflow(second).ok, true);
    assert.deepEqual([settings.enabled,settings.nativeBindings], [false,{workflowGraphId:null}]);
    for (const id of ['native-guidance','reviewed-de-slop','structured-guidance','literal-cleanup','scene-compass','reflect-and-express']) assert.throws(() => starterGraph(id), /unknown workflow starter/i);
    assert.equal(library.createLibraryWorkflow, undefined);
});

test('the example catalog contains the original thirty and two foundation unified roots', async () => {
    const examples = listWorkflowExamples(), results = listWorkflowExampleResults();
    assert.equal(examples.length, 32);
    assert.equal(results.length, 32);
    assert.deepEqual(examples.map(example => example.id), [...Array.from({length:30},(_,index)=>'lesson-'+String(index+1).padStart(2,'0')),'lesson-34','lesson-35']);
    assert.ok(examples.every(example => example.graph.mode === 'native-unified'));
    assert.ok(results.every(example => example.result.ok));
    examples[0].graph.name = 'Edited catalog copy';
    assert.notEqual(listWorkflowExamples()[0].graph.name, 'Edited catalog copy');
    for (const example of examples) {
        const settings = {graphs:{}, enabled:false, nativeBindings:{workflowGraphId:null}};
        const first = installWorkflowExample(example.id, settings), second = installWorkflowExample(example.id, settings);
        assert.equal(first.ok, true, JSON.stringify(first.error));
        assert.equal(second.ok, true, JSON.stringify(second.error));
        assert.notEqual(first.data.graph.id, second.data.graph.id);
        assert.equal(first.data.companions.length, 0);
        assert.equal(validateWorkflow(first.data.graph).ok, true);
        assert.deepEqual([settings.enabled,settings.nativeBindings], [false,{workflowGraphId:null}]);
    }
    for (const retiredId of ['scene-brief-basics','continuity-and-voice','promise-callback','reflect-and-express']) assert.equal(installWorkflowExample(retiredId,{graphs:{}}).error.code, 'UNKNOWN_EXAMPLE');
    const {UNIFIED_WORKFLOW_EXAMPLE_DATA: priorUnified} = await import('../src/workflow/unified-example-data.js');
    for(const prior of priorUnified){assert.equal(examples.some(example=>example.id===prior.id),false);const installed=installWorkflowExample(prior.id,{graphs:{}});assert.equal(installed.ok,true,JSON.stringify(installed.error));assert.equal(installed.data.graph.mode,'native-unified');}
});
