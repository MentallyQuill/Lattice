import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateWorkflow, validateGraphStructure } from '../src/workflow/contracts.js';
import { fixtureGraph } from './helpers/workflow-fixtures.mjs';
import { exportWorkflow } from '../src/workflow/packages.js';
import { STARTERS, starterGraph, installStarter } from '../src/workflow/starters.js';
import { prepareCreateFromSelection, prepareUnpack } from '../src/workflow/composition.js';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js';
import { siblingWorkflow } from './fixtures/workflow-prepared-fixture.mjs';

test('portable named wires and visual groups have only current authoring metadata', () => {
    const source = fixtureGraph('native-guidance');
    source.groups.visual = { id: 'visual', members: ['smart-compactor', 'response-plan'], collapsed: true,
        component: { id: 'retired-component', version: 99 }, entry: 'missing', exit: {}, enabled: 'retired' };
    source.nodes['smart-compactor'].inGroup = source.nodes['response-plan'].inGroup = 'visual';
    Object.assign(source.wires['wire-1'], { order: 'retired', kind: 'retired' });
    assert.equal(validateWorkflow(source).ok, true, 'retired annotations do not become current authoring contracts');
    const portable = exportWorkflow(source).graph;
    assert.deepEqual(portable.groups.visual, { id: 'visual', members: ['smart-compactor', 'response-plan'], collapsed: true });
    assert.deepEqual(Object.keys(portable.wires['wire-1']).sort(), ['from', 'fromPort', 'id', 'route', 'to', 'toPort']);
    const selected = prepareCreateFromSelection(source, { nodeIds: ['smart-compactor'], definitionId: 'partial', name: 'Partial' });
    assert.equal(selected.ok, true, JSON.stringify(selected));
});

test('all starters preserve collapsed visual formation without retired group or wire contracts', () => {
    for (const starter of STARTERS) {
        const graph = starterGraph(starter.id), installed = installStarter(starter.id, {});
        for (const document of [graph, installed]) {
            for (const wire of Object.values(document.wires)) for (const key of ['kind', 'order']) assert.equal(Object.hasOwn(wire, key), false);
            for (const group of Object.values(document.groups)) for (const key of ['component', 'entry', 'exit', 'enabled']) assert.equal(Object.hasOwn(group, key), false);
            assert.equal(validateWorkflow(document).ok, true);
        }
    }
    const graph = fixtureGraph('reviewed-de-slop'); assert.equal(graph.groups['ai-de-slop'].collapsed, true);
    assert.deepEqual(graph.groups['ai-de-slop'].members, ['pattern', 'repair', 'validate-patches']);
});

test('unpack retains inner visual membership and assigns only ungrouped children to the outer visual group', () => {
    const source = siblingWorkflow(), previous = Object.values(source.definitions)[0], draft = structuredClone(previous);
    draft.body.groups = { inner: { id: 'inner', members: ['work'], collapsed: true } }; draft.body.nodes.work.inGroup = 'inner';
    const identity = computeDefinitionIdentity(draft); assert.equal(identity.ok, true);
    const definition = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    source.definitions[definitionRefKey(definition)] = definition;
    source.groups = { outer: { id: 'outer', members: ['first/path'], collapsed: true, enabled: false } }; source.nodes['first/path'].inGroup = 'outer';
    const before = structuredClone(source), result = prepareUnpack(source, { instancePath: ['first/path'] });
    assert.equal(result.ok, true, JSON.stringify(result));
    const { candidate, identityMap } = result.data, work = candidate.nodes[identityMap.nodes.work];
    assert.equal(work.inGroup, identityMap.groups.inner); assert.notEqual(work.enabled, false);
    assert.deepEqual(candidate.groups.outer.members.sort(), [identityMap.nodes.entry, identityMap.nodes.exit].sort());
    assert.equal(validateGraphStructure(candidate).ok, true); assert.deepEqual(source, before);
});
