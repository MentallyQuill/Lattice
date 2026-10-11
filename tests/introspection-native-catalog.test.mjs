import assert from 'node:assert/strict';
import { FAMILIES, OPERATIONS, operationDefaults, operationFor, describeOperation, portsForNode, semanticControlsForNode } from '../src/workflow/catalog.js';
import { validateGraphStructure } from '../src/workflow/contracts.js';
import { describeExposedControl, computeDefinitionIdentity } from '../src/workflow/definition-data.js';
import { validateDefinition } from '../src/workflow/graph-validation.js';

assert.ok(FAMILIES.includes('Introspection'), 'the native picker registers the Introspection family');
const { projectIntrospectionNode, describeNativeIntrospection, introspectionDefaults } = await import('../src/workflow/introspection/native.js');
const graph = (nodes, phase = 'pre', wires = {}) => ({ id: 'native', schema: 3, runtime: 2, mode: `native-${phase}`, nodes, wires });
const native = (operation, settings = {}) => ({ id: 'introspection', type: 'workflow', ...operationDefaults(operation), ...settings });
const modes = {
    reflect: ['character', 'recall', 'scene'], internalize: ['experience', 'pattern', 'recovery'], express: ['behavior', 'attention', 'inner-voice'],
    context: ['assemble', 'perspective', 'focus'], memory: ['read', 'recall', 'commit'], state: ['value', 'curve', 'track', 'progression', 'time-decay'],
};
for (const [operation, entries] of Object.entries(modes)) {
    assert.equal(OPERATIONS[operation].family, 'Introspection');
    assert.equal(operationDefaults(operation).operationVersion, 1);
    for (const mode of entries) {
        const phase = mode === 'commit' ? 'post' : 'pre';
        const node = native(operation, introspectionDefaults(operation, mode));
        const described = describeOperation(graph({ introspection: node }, phase), node);
        assert.equal(described.ok, true, `${operation}:${mode} has valid native defaults`);
        assert.equal(described.data.descriptor.phase, phase, 'both-phase package entries resolve to the containing native phase');
        assert.deepEqual(described.data.descriptor.modes, entries);
        assert.equal(validateGraphStructure(graph({ introspection: node }, phase)).ok, true);
        const post = operationFor(node, { phase: 'post' });
        assert.equal(post?.phase, 'post');
    }
}

const decorated = native('context', { ...introspectionDefaults('context', 'focus'), x: 10, y: 20, title: 'My focus', presentation: { compact: true }, profileId: 'local', model: 'example', actorId: 'stale-other-mode', inputCount: 7 });
const projected = projectIntrospectionNode(decorated);
assert.equal(projected.ok, true);
assert.deepEqual(Object.keys(projected.data).sort(), ['id', 'type', 'operation', 'operationVersion', 'mode', 'method', 'targetTokens', 'maxTokens', 'keepRecent', 'pins', 'purpose'].sort());
assert.equal(projected.data.operationVersion, 1);
assert.equal(describeNativeIntrospection(decorated, { phase: 'post' }).ok, true);
assert.equal(projectIntrospectionNode({ ...decorated, operationVersion: 2 }).error?.code, 'UNKNOWN_OPERATION');
assert.equal(projectIntrospectionNode({ ...decorated, mode: 'unknown' }).error?.code, 'INVALID_SETTINGS');
const defaultsWithoutVersion = { ...decorated }; delete defaultsWithoutVersion.operationVersion;
assert.equal(projectIntrospectionNode(defaultsWithoutVersion).data.operationVersion, 1);

let reads = 0;
const accessor = native('state', { updates: {} });
Object.defineProperty(accessor.updates, 'trust', { enumerable: true, get() { reads++; return 0.5; } });
assert.equal(projectIntrospectionNode(accessor).ok, false);
assert.equal(reads, 0, 'unsafe control accessors are rejected without execution');
const topAccessor = native('reflect');
Object.defineProperty(topAccessor, 'model', { enumerable: true, get() { reads++; return 'unsafe'; } });
assert.equal(projectIntrospectionNode(topAccessor).ok, false);
assert.equal(reads, 0, 'native envelope accessors are rejected before projection');
const phaseAccessor = {};
Object.defineProperty(phaseAccessor, 'phase', { enumerable: true, get() { reads++; return 'pre'; } });
assert.equal(describeNativeIntrospection(native('reflect'), phaseAccessor).ok, false);
assert.equal(reads, 0, 'phase option accessors are rejected without execution');
assert.equal(describeNativeIntrospection(native('reflect'), null).ok, false);
assert.equal(describeNativeIntrospection(native('reflect'), { phase: 'pre', root: true }).ok, false);

const focused = native('context', introspectionDefaults('context', 'focus'));
assert.equal(describeOperation(graph({ introspection: focused }), focused).data.descriptor.requestBound, 0);
focused.method = 'compress';
assert.equal(describeOperation(graph({ introspection: focused }), focused).data.descriptor.requestBound, 1);
assert.equal(describeOperation(graph({ introspection: focused }), focused).data.descriptor.modelRole, 'Analysis');
const voice = native('express', introspectionDefaults('express', 'inner-voice'));
assert.equal(operationFor(voice).requestBound, 1);
assert.equal(operationFor(voice).modelRole, 'Prose');
assert.equal(operationFor(native('express')).requestBound, 0);

const assembled = native('context', { ...introspectionDefaults('context', 'assemble'), inputCount: 3 });
assert.deepEqual(portsForNode(graph({ introspection: assembled }), assembled).map(port => port.id), ['in1', 'in2', 'in3', 'out']);
const commit = native('memory', introspectionDefaults('memory', 'commit'));
const read = native('memory');
assert.deepEqual(describeOperation(graph({ introspection: read }), read).data.descriptor.controlDescriptors.mode.values, ['read', 'recall'], 'pre-phase mode controls omit Commit');
assert.equal(describeOperation(graph({ introspection: commit }), commit).error?.code, 'WRONG_PHASE');
const committed = describeOperation(graph({ introspection: commit }, 'post'), commit);
assert.equal(committed.data.descriptor.terminal, true);
assert.equal(committed.data.descriptor.rootOnly, true);
assert.equal(committed.data.descriptor.output, null);
assert.deepEqual(committed.data.ports.map(port => port.id), ['proposal'], 'commit has no routable terminal output');
const secondCommit = { ...commit, id: 'second' };
assert.equal(validateGraphStructure(graph({ introspection: commit, second: secondCommit }, 'post')).error?.code, 'MULTIPLE_MEMORY_COMMITS');

const value = native('state', { updates: { trust: 0.25 }, min: -0.5, max: 0.75 });
const valueMetadata = describeOperation(graph({ introspection: value }), value).data.descriptor;
assert.equal(valueMetadata.controlDescriptors.updates.type, 'object');
assert.equal(valueMetadata.controlDescriptors.min.type, 'number');
assert.equal(describeExposedControl(value, 'min').ok, true);
assert.equal(describeExposedControl(value, 'updates').ok, true);
assert.deepEqual(semanticControlsForNode(value), { mode: 'value', updates: { trust: 0.25 }, min: -0.5, max: 0.75 });
const curve = native('state', introspectionDefaults('state', 'curve'));
assert.equal(operationFor(curve).controlDescriptors.decay.type, 'number');
assert.equal(operationFor(curve).controlDescriptors.decay.step, 0.01);
assert.equal(operationFor(curve).controlDescriptors.durations.type, 'object');
assert.equal(operationFor(focused).controlDescriptors.pins.type, 'array');
assert.equal(validateGraphStructure(graph({ introspection: { ...value, updates: [] } })).ok, false);
assert.equal(describeExposedControl({ ...value, updates: null }, 'updates').ok, false);
assert.equal(validateGraphStructure(graph({ introspection: { ...curve, decay: 1.1 } })).ok, false);
assert.equal(validateGraphStructure(graph({ introspection: { ...curve, durations: { onset: 0.5 } } })).ok, false);

const definition = (node, phase = 'pre', explicitState = false) => {
    const draft = { id: 'introspection-definition', version: 1, name: 'Introspection', interface: explicitState ? [{ id: 'state-input', label: 'State', kind: 'data', direction: 'input', required: true, cardinality: 'one', boundaryNodeId: 'input' }] : [], parameters: [], body: { schema: 3, runtime: 2, mode: `native-${phase}`, nodes: { introspection: node, ...(explicitState ? { input: { id: 'input', type: 'subgraph-input', interfacePortId: 'state-input' } } : {}) }, wires: explicitState ? { state: { id: 'state', route: 'wire', from: 'input', fromPort: 'out', to: 'introspection', toPort: 'state' } } : {} } };
    return { ...draft, semanticHash: computeDefinitionIdentity(draft).data.semanticHash };
};
for (const mode of modes.memory) {
    const memory = native('memory', introspectionDefaults('memory', mode));
    assert.equal(validateDefinition(definition(memory, mode === 'commit' ? 'post' : 'pre')).ok, true, `Memory ${mode} preserves host authority in static definitions`);
}
assert.equal(validateDefinition(definition(value)).ok, true, 'implicit State retains the enclosing host snapshot inside static definitions');
assert.equal(validateDefinition(definition(value, 'pre', true)).ok, true, 'State remains reusable with an explicit snapshot input');
const malformedStateWire = definition(value, 'pre', true);
malformedStateWire.body.wires.state = null;
assert.doesNotThrow(() => validateDefinition(malformedStateWire), 'State scope checks fail safely for malformed saved wires');
assert.equal(validateDefinition(malformedStateWire).ok, false);
const identity = computeDefinitionIdentity(definition(value, 'pre', true));
assert.equal(identity.ok, true, 'plain object and fractional settings survive definition identity materialization');
const presented = definition({ ...value, x: 44, title: 'Renamed' }, 'pre', true);
assert.equal(computeDefinitionIdentity(presented).data.semanticHash, identity.data.semanticHash);
const snapshotDefinition = definition(native('state'), 'pre', true);
const snapshotIdentity = computeDefinitionIdentity(snapshotDefinition);
assert.equal(snapshotIdentity.ok, true);
assert.equal(Object.hasOwn(snapshotIdentity.data.materializedDefinition.body.nodes.introspection, 'updates'), false, 'materialized definitions preserve omitted State updates');
assert.notEqual(snapshotIdentity.data.semanticHash, computeDefinitionIdentity(definition(native('state', { updates: {} }), 'pre', true)).data.semanticHash, 'snapshot reads and explicit empty proposals have distinct semantic identities');

console.log('introspection-native-catalog: ok');
