import test from 'node:test';
import assert from 'node:assert/strict';
import { siblingWorkflow, nestedWorkflow, direct } from './fixtures/workflow-prepared-fixture.mjs';
import { computeDefinitionIdentity, definitionRefKey, nodeBindingOverrideKey } from '../src/workflow/definitions.js';
import { makeLocalCopy } from '../src/workflow/definition-library.js';
import { validateGraphStructure } from '../src/workflow/contracts.js';
import { graphSemanticSignature, graphDocumentSignature } from '../src/workflow/ports.js';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js';
import * as history from '../src/history.js?v=0.27.1';
const api = await import('../src/workflow/subgraph-authoring.js').catch(() => ({}));
const ref = value => ({ id: value.id, version: value.version, semanticHash: value.semanticHash });
const at = (graph, path) => { let scope = graph, definition; for (const id of path) { definition = graph.definitions[definitionRefKey(scope.nodes[id].definition)]; scope = definition.body; } return { definition, scope }; };
const command = (graph, path, nodeIds, extra = {}) => ({ viewPath: path, ...(path.length ? { expectedRef: ref(at(graph, path).definition) } : {}), nodeIds, ...extra });
function own(root, path) { const result = makeLocalCopy(root, { instancePath: path, id: 'owned-leaf' }); assert.equal(result.ok, true, JSON.stringify(result)); return result.data.candidate; }
function accept(root, input) {
    assert.equal(typeof api.prepareSubgraphNodeDeletion, 'function');
    const result = api.prepareSubgraphNodeDeletion(root, input); assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.baseSignature, graphSemanticSignature(root)); assert.equal(result.data.baseDocumentSignature, graphDocumentSignature(root));
    assert.equal(validateGraphStructure(result.data.candidate).ok, true); return result;
}

test('connected input/output deletion removes body and parent bindings without changing sibling pins', () => {
    for (const boundary of ['entry', 'exit']) {
        const graph = own(siblingWorkflow(), ['first/path']), path = ['first/path'], before = structuredClone(graph), kind = boundary === 'entry' ? 'context' : 'guidance';
        graph.id = 'authoring-' + boundary;
        const body = at(graph, path).scope;
        if (boundary === 'entry') { body.portals = { p: { id: 'p', label: 'Input', kind, source: { nodeId: 'entry', portId: 'out' } } }; body.wires.a = { id: 'a', route: 'portal', portalId: 'p', to: 'work', toPort: 'in' }; }
        else { graph.portals = { p: { id: 'p', label: 'Result', kind, source: { nodeId: 'first/path', portId: 'proposal' } } }; graph.wires.b = { id: 'b', route: 'portal', portalId: 'p', to: 'one', toPort: 'in' }; }
        // Portals change execution identity; re-pin the deliberately authored fixture.
        if (boundary === 'entry') { const old = at(graph, path).definition, identity = computeDefinitionIdentity(old); assert.equal(identity.ok, true); const saved = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash }; delete graph.definitions[definitionRefKey(old)]; graph.definitions[definitionRefKey(saved)] = saved; graph.nodes['first/path'].definition = ref(saved); }
        const source = structuredClone(graph), result = accept(graph, command(graph, path, [boundary])), next = result.data.candidate;
        assert.equal(at(next, path).scope.nodes[boundary], undefined); assert.equal(at(next, path).definition.interface.some(port => port.boundaryNodeId === boundary), false);
        assert.equal(Object.keys(at(next, path).scope.wires).length, 1);
        assert.equal(next.wires[boundary === 'entry' ? 'a' : 'b'], undefined); assert.deepEqual(next.nodes.second, before.nodes.second);
        assert.equal(Object.keys(boundary === 'entry' ? at(next, path).scope.portals : next.portals).length, 0);
        assert.deepEqual(graph, source);
        const context = captureGraphEditContext(graph, () => ({ sessionId: 'session', viewPath: path, readOnly: false })); assert.equal(context.ok, true);
        history.track(graph); assert.equal(commitPreparedGraph(graph, { ...result.data, context: context.data }).ok, true);
        assert.ok(history.undo(graph)); assert.deepEqual(graph, source); assert.equal(history.undo(graph), null);
        assert.ok(history.redo(graph)); assert.equal(at(graph, path).scope.nodes[boundary], undefined); assert.equal(history.redo(graph), null);
    }
});

test('mixed nested boundary and node deletion revises ancestors and cleans exposing parameters and overrides', () => {
    const root = structuredClone(nestedWorkflow()), originalLeaf = at(root, ['first/path', 'work']).definition;
    delete originalLeaf.body.roles;
    originalLeaf.parameters = [{ id: 'purpose', label: 'Purpose', target: { instancePath: [], nodeId: 'work', controlId: 'instructions' } }];
    const leafIdentity = computeDefinitionIdentity(originalLeaf), leaf = { ...leafIdentity.data.materializedDefinition, semanticHash: leafIdentity.data.semanticHash };
    delete root.definitions[definitionRefKey(originalLeaf)]; root.definitions[definitionRefKey(leaf)] = leaf; root.nodes.second.definition = ref(leaf);
    const outer = at(root, ['first/path']).definition; outer.body.nodes.work.definition = ref(leaf); outer.parameters = [{ id: 'inner-purpose', label: 'Purpose', target: { instancePath: ['work'], nodeId: 'work', controlId: 'instructions' } }];
    outer.body.nodes.work.parameterOverrides = { purpose: 'inner override' }; outer.body.nodes.work.nodeBindingOverrides = { [nodeBindingOverrideKey([], 'work')]: { model: 'model' } }; outer.body.nodes.work.roleOverrides = { Analysis: { model: 'role-model' } };
    const outerIdentity = computeDefinitionIdentity(outer), saved = { ...outerIdentity.data.materializedDefinition, semanticHash: outerIdentity.data.semanticHash };
    delete root.definitions[definitionRefKey(outer)]; root.definitions[definitionRefKey(saved)] = saved; root.nodes['first/path'].definition = ref(saved); root.nodes['first/path'].parameterOverrides = { 'inner-purpose': 'outer override' }; root.nodes['first/path'].nodeBindingOverrides = { [nodeBindingOverrideKey(['work'], 'work')]: { model: 'outer-model' } }; root.nodes['first/path'].roleOverrides = { Analysis: { model: 'outer-role-model' } };
    const graph = own(root, ['first/path', 'work']), path = ['first/path', 'work']; graph.id = 'authoring-mixed'; const previous = structuredClone(graph);
    const prepared = accept(graph, command(graph, path, ['entry', 'work'])), next = prepared.data.candidate;
    const child = at(next, path), parent = at(next, ['first/path']);
    assert.deepEqual(Object.keys(child.scope.nodes), ['exit']); assert.equal(child.definition.parameters.length, 0);
    assert.equal(parent.scope.wires.a, undefined); assert.equal(parent.definition.parameters.length, 0);
    assert.deepEqual(parent.scope.nodes.work.parameterOverrides, {}); assert.deepEqual(parent.scope.nodes.work.nodeBindingOverrides, {});
    assert.deepEqual(parent.scope.nodes.work.roleOverrides, {});
    assert.deepEqual(next.nodes['first/path'].parameterOverrides, {}); assert.deepEqual(next.nodes['first/path'].nodeBindingOverrides, {});
    assert.deepEqual(next.nodes['first/path'].roleOverrides, {});
    assert.deepEqual(next.nodes.second, previous.nodes.second); assert.deepEqual(graph, previous);
    history.track(graph);
    const capture = captureGraphEditContext(graph, () => ({ sessionId: 'mixed', viewPath: path, readOnly: false }));
    assert.equal(commitPreparedGraph(graph, { ...prepared.data, context: capture.data }).ok, true);
    assert.ok(history.undo(graph)); assert.deepEqual(graph, previous); assert.equal(history.undo(graph), null);
    assert.ok(history.redo(graph)); assert.deepEqual(graph, next); assert.equal(history.redo(graph), null);
});

test('root normal deletion supports groups and connected portals, while invalid/stale/readonly boundary edits fail closed', () => {
    const graph = siblingWorkflow(); graph.groups = { group: { id: 'group', members: ['source', 'one'] } }; graph.nodes.source.inGroup = 'group'; graph.nodes.one.inGroup = 'group';
    const next = accept(graph, command(graph, [], ['source'], { groupIds: ['group'] })).data.candidate;
    assert.equal(next.nodes.source, undefined); assert.equal(next.groups.group, undefined); assert.equal(next.nodes.one.inGroup, undefined);
    assert.equal(next.wires.a, undefined); assert.equal(next.wires.c, undefined);
    const owned = own(siblingWorkflow(), ['first/path']);
    for (const [source, input, code] of [
        [graph, command(graph, ['first/path'], ['entry']), 'READ_ONLY_DEFINITION'],
        [owned, { ...command(owned, ['first/path'], ['entry']), expectedRef: ref(Object.values(graph.definitions)[0]) }, 'STALE_DEFINITION'],
        [owned, command(owned, [], ['entry']), 'INVALID_SELECTION'],
        [owned, command(owned, ['first/path'], ['entry', 'entry']), 'INVALID_SELECTION'],
        [owned, { ...command(owned, ['first/path'], ['entry']), unknown: true }, 'INVALID_COMMAND'],
    ]) { const before = structuredClone(source), result = api.prepareSubgraphNodeDeletion(source, input); assert.equal(result.ok, false); assert.equal(result.error.code, code); assert.deepEqual(source, before); }
    let reads = 0; const unsafe = { viewPath: [], get nodeIds() { reads++; return ['source']; } };
    assert.equal(api.prepareSubgraphNodeDeletion(graph, unsafe).ok, false); assert.equal(reads, 0);
});
