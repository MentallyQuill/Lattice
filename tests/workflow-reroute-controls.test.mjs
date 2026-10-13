import assert from 'node:assert/strict';
import test from 'node:test';
import { ARTIFACT_KINDS, describeOperation, operationFor, operationDefaults } from '../src/workflow/catalog.js';
import { prepareNodeControlChange } from '../src/workflow/ports.js';
import { prepareNativeNodeEdit, makeLocalCopy } from '../src/workflow/definition-library.js';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js';
import * as history from '../src/history.js?v=0.27.2';

const must = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result.data; };
let sequence = 0;
const node = (id, operation, controls = {}) => ({ id, type: 'workflow', operation, ...controls });
const graph = nodes => ({ id: 'reroute-controls-' + ++sequence, schema: 3, runtime: 2, mode: 'native-pre', nodes, wires: {}, definitions: {}, portals: {}, roles: {} });
const reroute = () => node('route', 'reroute', { artifactKind: 'text', phase: 'pre' });
const wire = (id, from, to, toPort) => ({ id, route: 'wire', from, fromPort: 'out', to, toPort });

test('unwired Reroute changes each artifact kind through declared controls while phase stays fixed', () => {
    const g = graph({ route: reroute() }), before = structuredClone(g);
    assert.equal(operationDefaults('reroute').artifactKind, 'text');
    for (const kind of ARTIFACT_KINDS) {
        const changed = must(prepareNodeControlChange(g, { nodeId: 'route', controls: { artifactKind: kind } }));
        const described = must(describeOperation(changed.candidate, changed.candidate.nodes.route));
        assert.deepEqual(described.ports.map(port => port.kind), [kind, kind]);
        assert.equal(changed.candidate.nodes.route.phase, 'pre');
        assert.deepEqual(described.descriptor.controlDescriptors.artifactKind.values, ARTIFACT_KINDS);
        assert.equal(described.descriptor.controlDescriptors.artifactKind.label, 'Artifact kind');
    }
    assert.deepEqual(g, before);
    assert.equal(prepareNodeControlChange(g, { nodeId: 'route', controls: { phase: 'post' } }).ok, false);
    assert.equal(prepareNodeControlChange(g, { nodeId: 'route', controls: { artifactKind: 'unknown' } }).ok, false);
    assert.equal(operationFor(node('missing', 'reroute', { phase: 'pre' })), null);
});

test('owned definition Reroute accepts qualified kind editing and retains the published source snapshot', () => {
    const identity = must(computeDefinitionIdentity({ id: 'reroute-definition', version: 1, name: 'Reroute', interface: [], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: { route: reroute() }, wires: {} } }));
    const definition = { ...structuredClone(identity.materializedDefinition), semanticHash: identity.semanticHash };
    const original = graph({ child: { id: 'child', type: 'subgraph', definition: { id: definition.id, version: definition.version, semanticHash: definition.semanticHash } } });
    original.definitions[definitionRefKey(definition)] = definition;
    const g = must(makeLocalCopy(original, { instancePath: ['child'], id: 'private-reroute' })).candidate;
    const before = structuredClone(g);
    const changed = must(prepareNativeNodeEdit(g, { viewPath: ['child'], expectedRef: g.nodes.child.definition, kind: 'controls', nodeId: 'route', controls: { artifactKind: 'data' } }));
    const body = changed.candidate.definitions[definitionRefKey(changed.candidate.nodes.child.definition)].body;
    assert.equal(body.nodes.route.artifactKind, 'data'); assert.equal(body.nodes.route.phase, 'pre');
    assert.deepEqual(g, before); assert.deepEqual(original.definitions[definitionRefKey(definition)], definition);
});

test('wired Reroute refuses incompatible kind changes without graph or history changes', () => {
    for (const edit of [g => prepareNodeControlChange(g, { nodeId: 'route', controls: { artifactKind: 'data' } }), g => prepareNativeNodeEdit(g, { viewPath: [], kind: 'controls', nodeId: 'route', controls: { artifactKind: 'data' } })]) {
        const g = graph({ source: node('source', 'compose', { sections: [{ name: 'Text', text: 'Content' }] }), route: reroute(), sink: node('sink', 'compose', { sections: [{ name: 'Text', text: '' }] }) });
        g.wires = { a: wire('a', 'source', 'route', 'in'), b: wire('b', 'route', 'sink', 'section.Text') };
        history.track(g);
        const before = structuredClone(g), stack = history.peek(g);
        const result = edit(g);
        assert.equal(result.ok, false); assert.equal(result.error.code, 'ARTIFACT_KIND');
        assert.deepEqual(g, before); assert.deepEqual(history.peek(g), stack);
    }
});
