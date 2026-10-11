import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as definitions from '../src/workflow/definitions.js';

assert.equal(typeof definitions.definitionRefKey, 'function');
const ref = { id: 'a/[]', version: 1, semanticHash: `sha256:${'a'.repeat(64)}` };
assert.deepEqual(JSON.parse(definitions.definitionRefKey(ref)), [ref.id, 1, ref.semanticHash]);
assert.deepEqual(JSON.parse(definitions.nodeBindingOverrideKey(['a/b', 'c'], 'd')), [['a/b', 'c'], 'd']);
assert.notEqual(definitions.nodeBindingOverrideKey(['a/b'], 'c'), definitions.nodeBindingOverrideKey(['a', 'b'], 'c'));
assert.deepEqual(JSON.parse(definitions.artifactAddressKey({ workflowId: 'root', instancePath: ['a/b'], nodeId: 'c', portId: 'out' })), ['root', ['a/b'], 'c', 'out']);

// Browser-compatible synchronous hashing uses the standard SHA-256 UTF-8 protocol.
assert.equal(typeof definitions.sha256Text, 'function');
for (const text of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000), '雪🌈\ud800']) {
    assert.equal(definitions.sha256Text(text), `sha256:${createHash('sha256').update(text).digest('hex')}`);
}
assert.equal(definitions.sha256Text('abc'), 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

assert.equal(typeof definitions.cloneDefinitionData, 'function');
const original = { nested: { list: [1, '雪', null] } };
const cloned = definitions.cloneDefinitionData(original);
assert.equal(cloned.ok, true);
assert.deepEqual(cloned.data, original);
assert.notEqual(cloned.data.nested, original.nested);
assert.equal(Object.isFrozen(cloned.data.nested.list), true);
let getterCalls = 0;
const accessor = { get id() { getterCalls++; return 'unsafe'; } };
const circular = {}; circular.self = circular;
for (const unsafe of [accessor, circular, new Date(), { x: Infinity }, { x: undefined }, { x: () => 1 }, { endpoint: 'https://private' }, { recordings: [] }, JSON.parse('{"__proto__":{}}'), { x: 'a'.repeat(2000001) }, Array(2), { [Symbol('hidden')]: 1 }]) {
    assert.equal(definitions.cloneDefinitionData(unsafe).ok, false);
}
assert.equal(getterCalls, 0);
let deep = {}; for (let i = 0; i < 42; i++) deep = { child: deep };
assert.equal(definitions.cloneDefinitionData(deep).ok, false);

const fixture = () => ({ id: 'definition', version: 1, name: 'Compactor', interface: [
    { id: 'input', label: 'Context', direction: 'input', kind: 'context', required: true, cardinality: 'one', boundaryNodeId: 'entry' },
    { id: 'output', label: 'Result', direction: 'output', kind: 'context', required: false, cardinality: 'one', boundaryNodeId: 'exit' },
], parameters: [{ id: 'budget', label: 'Budget', target: { instancePath: [], nodeId: 'compact', controlId: 'targetTokens' } }], body: {
    schema: 3, runtime: 2, mode: 'native-pre', nodes: {
        entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'input' },
        compact: { id: 'compact', type: 'workflow', operation: 'smart-compactor', targetTokens: 99 },
        exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'output' },
    }, wires: {
        first: { id: 'first', route: 'wire', from: 'entry', fromPort: 'out', to: 'compact', toPort: 'in' },
        second: { id: 'second', route: 'wire', from: 'compact', fromPort: 'out', to: 'exit', toPort: 'in' },
    }, roles: { Analysis: { profileId: 'local', model: 'portable-model' } },
} });
assert.equal(typeof definitions.inspectDefinitionMetadata, 'function');
const metadata = definitions.inspectDefinitionMetadata(fixture());
assert.equal(metadata.ok, true);
assert.deepEqual(metadata.data.boundaryPorts.entry, { id: 'out', kind: 'context', direction: 'output', required: false, cardinality: 'one' });
assert.deepEqual(metadata.data.boundaryPorts.exit, { id: 'in', kind: 'context', direction: 'input', required: true, cardinality: 'one' });
assert.equal(metadata.data.topologyValidated, false);
for (const mutate of [
    d => { d.version = 0; }, d => { d.id = ''; }, d => { d.interface[1].boundaryNodeId = 'entry'; },
    d => { d.interface[0].kind = 'invalid'; }, d => { delete d.body.nodes.entry; },
    d => { d.body.nodes.entry.interfacePortId = 'other'; }, d => { d.interface.pop(); },
    d => { d.parameters.push({ ...d.parameters[0], id: 'another' }); },
    d => { d.parameters[0].target.instancePath = 'entry'; },
]) {
    const candidate = fixture(); mutate(candidate);
    assert.equal(definitions.inspectDefinitionMetadata(candidate).ok, false);
}
const notExecutable = fixture(); notExecutable.body.wires.first.from = 'missing';
assert.equal(definitions.inspectDefinitionMetadata(notExecutable).data.topologyValidated, false);
// Phase B now supplies the separate full validator; metadata success remains non-executable.
assert.equal(typeof definitions.validateDefinition, 'function');

assert.equal(typeof definitions.describeExposedControl, 'function');
const compact = fixture().body.nodes.compact;
assert.deepEqual(definitions.describeExposedControl(compact, 'targetTokens').data, { type: 'integer', min: 1, max: 65536, default: 99 });
assert.equal(definitions.describeExposedControl(compact, 'method').data.default, 'select');
assert.equal(definitions.describeExposedControl(compact, 'profileId').ok, false);
for (const value of [0, 65537, 1.5, '99']) assert.equal(definitions.describeExposedControl({ ...compact, targetTokens: value }, 'targetTokens').ok, false);
assert.equal(definitions.describeExposedControl({ ...compact, method: 'unknown' }, 'method').ok, false);

assert.equal(typeof definitions.computeDefinitionIdentity, 'function');
const identity = definitions.computeDefinitionIdentity(fixture());
assert.equal(identity.ok, true);
assert.equal(identity.data.semanticHash, `sha256:${createHash('sha256').update(identity.data.canonicalContent).digest('hex')}`);
assert.equal(identity.data.materializedDefinition.body.nodes.compact.method, 'select');
assert.equal(Object.isFrozen(identity.data.materializedDefinition.body.nodes.compact), true);
for (const mutate of [
    d => { d.id = 'different'; d.version = 2; d.name = 'Renamed'; d.description = 'Other'; },
    d => { d.body.nodes.compact.alias = 'Alias'; d.body.nodes.compact.x = 999; d.interface[0].label = 'Renamed'; d.parameters[0].label = 'Renamed'; },
    d => { d.body.roles.Analysis.profileId = 'other-local'; d.body.nodes.compact.profileId = 'local'; },
    d => { d.body.nodes = Object.fromEntries(Object.entries(d.body.nodes).reverse()); },
]) {
    const candidate = fixture(); mutate(candidate);
    assert.equal(definitions.computeDefinitionIdentity(candidate).data.canonicalContent, identity.data.canonicalContent);
}
for (const mutate of [
    d => { d.body.nodes.compact.targetTokens++; }, d => { d.body.roles.Analysis.model = 'different'; },
    d => { d.body.nodes.compact.modelRole = 'Prose'; }, d => { d.body.wires.first.fromPort = 'other'; },
    d => { d.interface[0].required = false; }, d => { d.parameters[0].target.controlId = 'maxTokens'; },
]) {
    const candidate = fixture(); mutate(candidate);
    assert.notEqual(definitions.computeDefinitionIdentity(candidate).data.canonicalContent, identity.data.canonicalContent);
}
const ruleDefinition = fixture();
ruleDefinition.body.mode = 'native-post';
ruleDefinition.interface.forEach(port => port.kind = 'draft');
ruleDefinition.parameters = [];
ruleDefinition.body.nodes.compact = { id: 'compact', type: 'workflow', operation: 'pattern', rules: [{ id: 'semantic', pattern: 'data', label: 'keep' }] };
const ruleIdentity = definitions.computeDefinitionIdentity(ruleDefinition).data;
ruleDefinition.body.nodes.compact.rules[0].label = 'changed';
assert.notEqual(definitions.computeDefinitionIdentity(ruleDefinition).data.semanticHash, ruleIdentity.semanticHash);
assert.match(ruleIdentity.canonicalContent, /"pattern":"data"/);

assert.equal(typeof definitions.inspectPinnedDefinitionIdentity, 'function');
const snapshot = { ...structuredClone(identity.data.materializedDefinition), semanticHash: identity.data.semanticHash };
const pinnedRef = { id: snapshot.id, version: snapshot.version, semanticHash: snapshot.semanticHash };
const table = { [definitions.definitionRefKey(pinnedRef)]: snapshot };
assert.equal(definitions.inspectPinnedDefinitionIdentity(pinnedRef, table).data.topologyValidated, false);
assert.equal(definitions.inspectPinnedDefinitionIdentity({ ...pinnedRef, version: 2 }, table).error.code, 'MISSING_DEFINITION');
const tampered = structuredClone(table); tampered[definitions.definitionRefKey(pinnedRef)].body.nodes.compact.targetTokens++;
assert.equal(definitions.inspectPinnedDefinitionIdentity(pinnedRef, tampered).error.code, 'DEFINITION_HASH');
const conflict = fixture(); conflict.body.nodes.compact.targetTokens++;
conflict.semanticHash = definitions.computeDefinitionIdentity(conflict).data.semanticHash;
assert.equal(definitions.inspectPinnedDefinitionIdentity(pinnedRef, { ...table, [definitions.definitionRefKey(conflict)]: conflict }).error.code, 'DEFINITION_CONFLICT');
assert.equal(definitions.inspectPinnedDefinitionIdentity(pinnedRef, { wrongKey: snapshot }).error.code, 'MISSING_DEFINITION');
const portable = structuredClone(table); delete portable[definitions.definitionRefKey(pinnedRef)].body.roles.Analysis.profileId;
assert.equal(definitions.inspectPinnedDefinitionIdentity(pinnedRef, portable).data.canonicalContent, identity.data.canonicalContent);

// Nested instance model overrides stay portable without globally deleting control keys.
const nested = fixture();
nested.body.nodes.child = { id: 'child', type: 'subgraph', definition: pinnedRef, parameterOverrides: { budget: 42 }, roleOverrides: { Analysis: { profileId: 'local', model: 'kept' } }, nodeBindingOverrides: { [definitions.nodeBindingOverrideKey(['nested/instance'], 'node')]: { profileId: 'local', model: 'kept' } } };
nested.body.portals = { portal: { id: 'portal', label: 'Display', kind: 'context', source: { nodeId: 'compact', portId: 'out' } } };
nested.body.groups = { group: { id: 'group', enabled: true, component: { id: 'ai-de-slop', version: 1, label: 'Display' }, members: ['compact'] } };
const nestedIdentity = definitions.computeDefinitionIdentity(nested).data;
delete nested.body.nodes.child.roleOverrides.Analysis.profileId;
for (const binding of Object.values(nested.body.nodes.child.nodeBindingOverrides)) delete binding.profileId;
nested.body.portals.portal.label = 'Renamed';
nested.body.groups.group.component.label = 'Renamed';
nested.body.groups.group.enabled = false;
nested.body.groups.group.members = [];
nested.body.nodes.compact.inGroup = 'group';
Object.values(nested.body.wires).forEach(wire => { wire.order = 99; wire.kind = 'prepend'; });
assert.equal(definitions.computeDefinitionIdentity(nested).data.canonicalContent, nestedIdentity.canonicalContent);
nested.body.nodes.child.parameterOverrides.budget++;
assert.notEqual(definitions.computeDefinitionIdentity(nested).data.semanticHash, nestedIdentity.semanticHash);
console.log('workflow definition Phase A foundations passed');
