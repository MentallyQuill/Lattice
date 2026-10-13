import test from 'node:test';
import assert from 'node:assert/strict';
import * as library from '../src/workflow/definition-library.js';
import { definitionRefKey, nodeBindingOverrideKey } from '../src/workflow/definitions.js';
import { inspectExpandedGraph } from '../src/workflow/graph-validation.js';
import { definitionChain, ownsDefinitionPath } from '../src/workflow/composition-edit.js';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js';
import * as H from '../src/history.js?v=0.27.3';
import { effectiveInstanceWorkflow } from './fixtures/workflow-effective-instance.mjs';
import { computeDefinitionIdentity } from '../src/workflow/definitions.js';
import { installMock } from './mock.js';
import * as L from '../src/library.js?v=0.27.3';
import { siblingWorkflow } from './fixtures/workflow-prepared-fixture.mjs';

const must = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };
const definitionAt = (root, path) => definitionChain(root, path).at(-1).definition;
const primitive = (root, path, id = 'compact') => must(inspectExpandedGraph(root)).primitives.find(unit => JSON.stringify(unit.address.instancePath) === JSON.stringify(path) && unit.address.nodeId === id).node;
const ref = definition => ({ id: definition.id, version: definition.version, semanticHash: definition.semanticHash });

test('effective editable copy consumes exposed overrides so saved body edits affect execution', () => {
    const original = effectiveInstanceWorkflow(), before = structuredClone(original);
    const copied = must(library.makeLocalCopy(original, { instancePath: ['one'], id: 'private-effective', materializeOverrides: true })).candidate;
    assert.equal(definitionAt(copied, ['one']).body.nodes.compact.targetTokens, 720);
    assert.deepEqual(copied.nodes.one.parameterOverrides, {});
    const saved = definitionAt(copied, ['one']), draft = structuredClone(saved); draft.body.nodes.compact.targetTokens = 2500;
    const edited = must(library.prepareLocalDefinitionEdit(copied, { instancePath: ['one'], expectedRef: ref(saved), draft })).candidate;
    assert.equal(primitive(edited, ['one']).targetTokens, 2500);
    assert.equal(primitive(edited, ['two']).targetTokens, 960);
    assert.deepEqual(edited.nodes.two, before.nodes.two);
    assert.deepEqual(edited.definitions[definitionRefKey(before.nodes.two.definition)], before.definitions[definitionRefKey(before.nodes.two.definition)]);
    assert.deepEqual(original, before);
});

test('effective nested copy isolates shared child pins and consumes only ancestor targets inside the copied path', () => {
    const original = effectiveInstanceWorkflow(true), before = structuredClone(original);
    const copied = must(library.makeLocalCopy(original, { instancePath: ['one', 'left'], id: 'private-nested', materializeOverrides: true })).candidate;
    assert.equal(definitionAt(copied, ['one', 'left']).body.nodes.compact.targetTokens, 720);
    assert.deepEqual(copied.nodes.one.parameterOverrides, {});
    assert.deepEqual(definitionChain(copied, ['one', 'left']).at(-1).node.parameterOverrides, {});
    assert.equal(ownsDefinitionPath(copied, ['one', 'left']), true);
    assert.equal(primitive(copied, ['one', 'right']).targetTokens, 600);
    assert.equal(primitive(copied, ['two', 'left']).targetTokens, 500);
    const saved = definitionAt(copied, ['one', 'left']), draft = structuredClone(saved); draft.body.nodes.compact.targetTokens = 2500;
    const edited = must(library.prepareLocalDefinitionEdit(copied, { instancePath: ['one', 'left'], expectedRef: ref(saved), draft })).candidate;
    assert.equal(primitive(edited, ['one', 'left']).targetTokens, 2500);
    assert.deepEqual(original, before);
});

test('effective copies preserve role and node binding precedence while untouched parent fields remain inherited', () => {
    const root = effectiveInstanceWorkflow();
    root.nodes.one.roleOverrides = { Analysis: { profileId: 'selected-profile' } };
    root.nodes.one.nodeBindingOverrides = { [nodeBindingOverrideKey([], 'compact')]: { profileId: 'node-profile', model: null } };
    const copied = must(library.makeLocalCopy(root, { instancePath: ['one'], id: 'private-binding', materializeOverrides: true })).candidate;
    assert.equal(primitive(copied, ['one']).profileId, 'node-profile');
    assert.equal(primitive(copied, ['one']).model, null);
    assert.deepEqual(copied.nodes.one.roleOverrides, {});
    assert.equal(definitionAt(copied, ['one']).body.nodes.compact.profileId, 'node-profile');
    copied.roles.Analysis.model = 'changed-parent';
    assert.equal(primitive(copied, ['one'], 'inherited').model, 'changed-parent');
    assert.equal(primitive(copied, ['one'], 'inherited').profileId, 'selected-profile');
    const saved = definitionAt(copied, ['one']);
    const edited = must(library.prepareNativeNodeEdit(copied, { kind: 'binding', viewPath: ['one'], expectedRef: ref(saved), nodeId: 'compact', field: 'model', mode: 'set', value: 'edited-model', consumeOverride: true })).candidate;
    assert.equal(primitive(edited, ['one']).model, 'edited-model');
    assert.equal(primitive(edited, ['two']).model, 'changed-parent');
});

test('effective copy commits as one reversible full-root history step', () => {
    const root = effectiveInstanceWorkflow(), before = structuredClone(root); H.track(root);
    const context = must(captureGraphEditContext(root, () => ({ sessionId: 'effective-copy', viewPath: [], readOnly: false })));
    const prepared = must(library.makeLocalCopy(root, { instancePath: ['one'], id: 'private-history', materializeOverrides: true }));
    must(commitPreparedGraph(root, { ...prepared, context, viewPath: [] }));
    assert.equal(primitive(root, ['one']).targetTokens, 720);
    assert.ok(H.undo(root)); assert.deepEqual(root, before); assert.equal(H.undo(root), null);
    assert.ok(H.redo(root)); assert.equal(definitionAt(root, ['one']).body.nodes.compact.targetTokens, 720); assert.equal(H.redo(root), null);
});

test('shelf contents preserve selected parameter and null binding values without changing placed pins or inherited models', () => {
    const root = effectiveInstanceWorkflow(), before = structuredClone(root);
    root.nodes.one.nodeBindingOverrides = { [nodeBindingOverrideKey([], 'compact')]: { profileId: 'fixed-profile', model: null } };
    const original = structuredClone(root), contents = must(library.materializeInstanceDefinition(root, { instancePath: ['one'], id: 'portable-effective' }));
    installMock();
    const saved = must(L.saveSubgraphDefinition(contents.definition, contents.definitions));
    const stored = L.getSubgraphLibrary().data.definitions;
    const placed = { ...structuredClone(before), roles: { Analysis: { profileId: 'new-parent-profile', model: 'new-parent-model' } }, nodes: { copy: { id: 'copy', type: 'subgraph', definition: saved.ref } }, definitions: structuredClone(stored) };
    const expanded = must(inspectExpandedGraph(placed)), compact = expanded.primitives.find(unit => unit.address.nodeId === 'compact').node;
    assert.equal(compact.targetTokens, 720); assert.equal(compact.profileId, 'fixed-profile'); assert.equal(compact.model, null);
    const inherited = expanded.primitives.find(unit => unit.address.nodeId === 'inherited').node;
    assert.equal(inherited.profileId, 'new-parent-profile'); assert.equal(inherited.model, 'new-parent-model');
    assert.deepEqual(root, original);
    const copied = must(library.makeLocalCopy(placed, { instancePath: ['copy'], id: 'portable-editable', materializeOverrides: true })).candidate;
    const unit = must(inspectExpandedGraph(copied)).primitives.find(item => item.address.nodeId === 'compact');
    const definition = definitionAt(copied, unit.address.instancePath);
    const edited = must(library.prepareNativeNodeEdit(copied, { kind: 'binding', viewPath: unit.address.instancePath, expectedRef: ref(definition), nodeId: 'compact', field: 'model', mode: 'set', value: 'changed-model', consumeOverride: true })).candidate;
    assert.equal(must(inspectExpandedGraph(edited)).primitives.find(item => item.address.nodeId === 'compact').node.model, 'changed-model');
});

test('shelf saves of a nested instance retain explicit enclosing subgraph role fields while root defaults stay inherited', () => {
    const root = effectiveInstanceWorkflow(true);
    root.nodes.one.roleOverrides = { Analysis: { profileId: 'enclosing-profile' } };
    const contents = must(library.materializeInstanceDefinition(root, { instancePath: ['one', 'left'], id: 'nested-portable' }));
    const placed = { schema: 3, runtime: 2, mode: 'native-pre', roles: { Analysis: { profileId: 'different-root-profile', model: 'different-root-model' } }, nodes: { copy: { id: 'copy', type: 'subgraph', definition: ref(contents.definition) } }, wires: {}, definitions: { ...contents.definitions, [definitionRefKey(contents.definition)]: contents.definition } };
    assert.equal(primitive(placed, ['copy']).profileId, 'enclosing-profile');
    assert.equal(primitive(placed, ['copy']).model, 'different-root-model');
});

test('independent effective shelf saves allocate distinct dependency identities', () => {
    const root = effectiveInstanceWorkflow();
    root.nodes.one.nodeBindingOverrides = { [nodeBindingOverrideKey([], 'compact')]: { model: null } };
    installMock();
    const first = must(library.materializeInstanceDefinition(root, { instancePath: ['one'], id: 'first-shelf-capture' }));
    must(L.saveSubgraphDefinition(first.definition, first.definitions));
    root.nodes.one.parameterOverrides.budget = 2500;
    const second = must(library.materializeInstanceDefinition(root, { instancePath: ['one'], id: 'second-shelf-capture' }));
    must(L.saveSubgraphDefinition(second.definition, second.definitions));
    const entries = L.getSubgraphShelfEntries().data;
    assert.equal(entries.length, 2);
    assert.notEqual(entries[0].body.nodes[Object.keys(entries[0].body.nodes)[0]].definition.id, entries[1].body.nodes[Object.keys(entries[1].body.nodes)[0]].definition.id);
});

test('nested copy consumes exact ancestor parameter and node targets while preserving other branch overrides', () => {
    const root = effectiveInstanceWorkflow(true), outer = definitionAt(root, ['one']), draft = structuredClone(outer);
    draft.parameters.push({ id: 'other-budget', label: 'Other budget', target: { instancePath: ['right'], nodeId: 'compact', controlId: 'targetTokens' } });
    delete draft.semanticHash; const identity = must(computeDefinitionIdentity(draft));
    const next = { ...identity.materializedDefinition, semanticHash: identity.semanticHash };
    delete root.definitions[definitionRefKey(outer)]; root.definitions[definitionRefKey(next)] = next;
    root.nodes.one.definition = ref(next); root.nodes.two.definition = ref(next);
    root.nodes.one.parameterOverrides['other-budget'] = 1700;
    root.nodes.one.roleOverrides = { Analysis: { profileId: 'enclosing-role' } };
    root.nodes.one.nodeBindingOverrides = { [nodeBindingOverrideKey(['left'], 'compact')]: { model: 'outer-model' }, [nodeBindingOverrideKey(['right'], 'compact')]: { model: 'other-model' } };
    const copied = must(library.makeLocalCopy(root, { instancePath: ['one', 'left'], id: 'isolated-left', materializeOverrides: true })).candidate;
    assert.equal(primitive(copied, ['one', 'left']).model, 'outer-model');
    assert.deepEqual(copied.nodes.one.parameterOverrides, { 'other-budget': 1700 });
    assert.deepEqual(copied.nodes.one.nodeBindingOverrides, { [nodeBindingOverrideKey(['right'], 'compact')]: { model: 'other-model' } });
    assert.deepEqual(copied.nodes.one.roleOverrides, { Analysis: { profileId: 'enclosing-role' } });
    assert.equal(primitive(copied, ['one', 'right']).targetTokens, 1700);
    assert.equal(primitive(copied, ['one', 'right']).model, 'other-model');
    const local = definitionAt(copied, ['one', 'left']);
    const edited = must(library.prepareNativeNodeEdit(copied, { kind: 'controls', viewPath: ['one', 'left'], expectedRef: ref(local), nodeId: 'compact', controls: { targetTokens: 2500 } })).candidate;
    assert.equal(primitive(edited, ['one', 'left']).targetTokens, 2500);
    assert.equal(primitive(edited, ['one', 'right']).targetTokens, 1700);
});

test('portable null binding carriers preserve connected typed boundaries', () => {
    const root = siblingWorkflow();
    root.nodes['first/path'].nodeBindingOverrides = { [nodeBindingOverrideKey([], 'work')]: { model: null } };
    const before = structuredClone(root), contents = must(library.materializeInstanceDefinition(root, { instancePath: ['first/path'], id: 'portable-boundaries' }));
    const placed = structuredClone(root);
    placed.nodes['first/path'].definition = ref(contents.definition);
    placed.nodes['first/path'].nodeBindingOverrides = {};
    placed.definitions = { ...placed.definitions, ...contents.definitions, [definitionRefKey(contents.definition)]: contents.definition };
    const expanded = must(inspectExpandedGraph(placed));
    assert.equal(expanded.primitives.find(unit => unit.address.instancePath[0] === 'first/path' && unit.address.nodeId === 'work').node.model, null);
    assert.equal(expanded.edges.some(edge => edge.from.nodeId === 'source' && edge.to.nodeId === 'work'), true);
    assert.equal(expanded.edges.some(edge => edge.from.nodeId === 'work' && edge.to.nodeId === 'one'), true);
    assert.deepEqual(contents.definition.interface.map(port => [port.id, port.direction, port.kind]), [['scene', 'input', 'context'], ['proposal', 'output', 'guidance']]);
    assert.deepEqual(root, before);
});

test('saving a null blocker at the native depth limit rejects without mutating the source', () => {
    const root = effectiveInstanceWorkflow(), snapshots = {};
    let current = definitionAt(root, ['one']); snapshots[definitionRefKey(current)] = current;
    for (let depth = 1; depth < 8; depth++) {
        const identity = must(computeDefinitionIdentity({ id: `depth-${depth}`, version: 1, name: 'Depth', interface: [], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: { child: { id: 'child', type: 'subgraph', definition: ref(current) } }, wires: {} } }));
        current = { ...identity.materializedDefinition, semanticHash: identity.semanticHash }; snapshots[definitionRefKey(current)] = current;
    }
    root.nodes = { one: { id: 'one', type: 'subgraph', definition: ref(current), nodeBindingOverrides: { [nodeBindingOverrideKey(Array(7).fill('child'), 'compact')]: { model: null } } } };
    root.definitions = snapshots;
    must(inspectExpandedGraph(root)); const before = structuredClone(root);
    const result = library.materializeInstanceDefinition(root, { instancePath: ['one'], id: 'too-deep-save' });
    assert.equal(result.ok, false); assert.equal(result.error.code, 'DEFINITION_DEPTH');
    assert.deepEqual(root, before);
});
