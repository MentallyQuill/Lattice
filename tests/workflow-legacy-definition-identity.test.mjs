import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { computeDefinitionIdentity, definitionRefKey, inspectPinnedDefinitionIdentity, validateDefinition } from '../src/workflow/definitions.js';
import { validateGraphStructure } from '../src/workflow/contracts.js';
import { graphSemanticSignature } from '../src/workflow/ports.js';
import { runWorkflow } from '../src/workflow/runtime.js';
import { expandRecordAddress } from '../src/workflow/record-data.js';
import { semanticControlsForNode } from '../src/workflow/catalog.js';
import { exportSubgraph, exportWorkflow, parseSubgraph, parseWorkflow } from '../src/workflow/packages.js';

// Generated with the actual archived 029a930 / 0.25.0 workflow modules.
// Static pins and canonical content prove compatibility independently of current hashing.
const baseline = JSON.parse(readFileSync(new URL('./fixtures/workflow-legacy-029a930.json', import.meta.url), 'utf8'));
const legacyGraph = () => structuredClone(baseline.workflowPackage.graph);
const must = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result.data; };
const byId = (graph, id) => Object.values(graph.definitions).find(item => item.id === id);
const ref = definition => ({ id: definition.id, version: definition.version, semanticHash: definition.semanticHash });
const transpose = node => ['style-transfer', 'format-transfer', 'terminology-map'].includes(node.operation);

function assertLegacyPins(graph) {
    assert.deepEqual(Object.keys(graph.definitions).sort(), Object.keys(baseline.workflowPackage.graph.definitions).sort());
    for (const definition of Object.values(graph.definitions)) {
        const original = byId(baseline.workflowPackage.graph, definition.id);
        assert.equal(definition.semanticHash, original.semanticHash);
        for (const node of Object.values(definition.body.nodes)) if (transpose(node)) assert.equal(Object.hasOwn(node, 'inputKind'), false);
    }
}

test('029a930 Transpose and Reroute snapshots retain their exact canonical hashes and materialized bodies', () => {
    const g = legacyGraph(), before = structuredClone(g);
    for (const definition of Object.values(g.definitions)) {
        const identity = must(computeDefinitionIdentity(definition));
        assert.equal(identity.semanticHash, definition.semanticHash, definition.id);
        assert.equal(identity.canonicalContent, baseline.canonicalContentById[definition.id]);
        assert.deepEqual(identity.materializedDefinition, definition);
        must(inspectPinnedDefinitionIdentity(ref(definition), g.definitions));
    }
    must(validateGraphStructure(g));
    assert.deepEqual(g, before);
});

test('029a930 pins round-trip inside a unified root and bundled subgraphs without repinning', () => {
    assert.equal(parseWorkflow(JSON.stringify(baseline.workflowPackage)).error.code, 'WRONG_PHASE');
    const unifiedPackage = structuredClone(baseline.workflowPackage);
    unifiedPackage.graph.mode = 'native-unified';
    const parsed = must(parseWorkflow(JSON.stringify(unifiedPackage)));
    assertLegacyPins(parsed);
    const roundTrip = must(parseWorkflow(JSON.stringify(exportWorkflow(parsed))));
    assertLegacyPins(roundTrip);
    assert.deepEqual(roundTrip.nodes, baseline.workflowPackage.graph.nodes);
    const standalone = must(parseSubgraph(JSON.stringify(baseline.subgraphPackage)));
    assert.equal(standalone.definition.semanticHash, baseline.subgraphPackage.definition.semanticHash);
    assert.deepEqual(standalone.definition.body.nodes.child.definition, baseline.subgraphPackage.definition.body.nodes.child.definition);
    assert.deepEqual(Object.keys(standalone.definitions), Object.keys(baseline.subgraphPackage.definitions));
    const exported = exportSubgraph(standalone.definition, standalone.definitions);
    assert.deepEqual(exported, baseline.subgraphPackage);
});

test('explicit Draft Transpose normalizes to the same saved identity and execution signature as omitted legacy mode', () => {
    const g = legacyGraph();
    for (const definition of Object.values(g.definitions)) for (const node of Object.values(definition.body.nodes)) if (transpose(node)) node.inputKind = 'draft';
    for (const definition of Object.values(g.definitions)) {
        const identity = must(computeDefinitionIdentity(definition));
        assert.equal(identity.semanticHash, definition.semanticHash);
        assert.equal(identity.canonicalContent, baseline.canonicalContentById[definition.id]);
        assert.deepEqual(identity.materializedDefinition, byId(baseline.workflowPackage.graph, definition.id));
    }
    must(validateGraphStructure(g));
    assert.equal(graphSemanticSignature(g), graphSemanticSignature(legacyGraph()));
    // Explicit root execution enrollment changes root identity, while archived definition pins remain exact.
    const currentSignature = JSON.parse(graphSemanticSignature(g));
    assert.deepEqual(currentSignature.runTargets, []);
    delete currentSignature.runTargets;
    assert.deepEqual(currentSignature, JSON.parse(baseline.graphSignature));
});

test('Text Transpose remains semantic and forged old pins or same-version conflicts still reject', () => {
    for (const operation of ['style-transfer', 'format-transfer', 'terminology-map']) {
        const original = byId(legacyGraph(), 'legacy-' + operation), changed = structuredClone(original);
        changed.body.nodes.work.inputKind = 'text';
        changed.interface.find(port => port.id === 'target').kind = 'text';
        changed.interface.find(port => port.id === 'result').kind = 'text';
        const identity = must(computeDefinitionIdentity(changed));
        assert.notEqual(identity.semanticHash, original.semanticHash);
        assert.equal(JSON.parse(identity.canonicalContent).body.nodes.work.controls.inputKind, 'text');
        assert.equal(inspectPinnedDefinitionIdentity(ref(original), { [definitionRefKey(original)]: changed }).error.code, 'DEFINITION_HASH');
        assert.equal(validateDefinition(changed).error.code, 'DEFINITION_HASH');
        const saved = { ...identity.materializedDefinition, semanticHash: identity.semanticHash };
        must(validateDefinition(saved));
        assert.equal(inspectPinnedDefinitionIdentity(ref(original), { [definitionRefKey(original)]: original, [definitionRefKey(saved)]: saved }).error.code, 'DEFINITION_CONFLICT');
    }
});

test('Reroute artifact kind is hashed once and changing it still invalidates pins and execution identity', () => {
    const original = byId(legacyGraph(), 'legacy-reroute'), changed = structuredClone(original);
    assert.deepEqual(semanticControlsForNode(original.body.nodes.work), {});
    assert.equal(JSON.parse(must(computeDefinitionIdentity(original)).canonicalContent).body.nodes.work.artifactKind, 'text');
    changed.body.nodes.work.artifactKind = 'data';
    changed.interface.forEach(port => { port.kind = 'data'; });
    const identity = must(computeDefinitionIdentity(changed));
    assert.notEqual(identity.semanticHash, original.semanticHash);
    assert.equal(inspectPinnedDefinitionIdentity(ref(original), { [definitionRefKey(original)]: changed }).error.code, 'DEFINITION_HASH');
    assert.notEqual(graphSemanticSignature(original.body), graphSemanticSignature(changed.body));
});
test('genuine saved nested Terminology and Reroute execute with zero model calls and retain source-bound patches', async () => {
    const g = legacyGraph();
    g.mode = 'native-unified';
    const node = (id, operation, controls = {}) => ({ id, type: 'workflow', operation, phase: 'post', ...controls });
    const wire = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
    g.nodes.source = node('source', 'reply-snapshot');
    g.nodes.glossaryText = node('glossaryText', 'compose', { sections: [{ name: 'Glossary', text: '{"entries":[{"from":"Captain","to":"Commander"}]}' }] });
    g.nodes.glossary = node('glossary', 'json-decode');
    g.nodes.validate = node('validate', 'validate-patches');
    g.wires = {
        draft: wire('draft', 'source', 'out', 'instance-2', 'target'),
        decode: wire('decode', 'glossaryText', 'out', 'glossary', 'in'),
        reference: wire('reference', 'glossary', 'out', 'instance-2', 'reference'),
        patches: wire('patches', 'instance-2', 'result', 'validate', 'in'),
    };
    const source = { originalText: 'Captain waits.', chatId: 'fixture', messageIndex: 2, swipeId: 0, token: 'legacy-provenance' };
    let snapshots = 0, bindings = 0, requests = 0, writes = 0;
    const result = await runWorkflow(g, {
        target: { workflowId: g.id, instancePath: [], nodeId: 'validate', portId: 'out' },
        snapshot: () => { snapshots++; return { kind: 'draft', text: source.originalText, source }; },
        resolveBinding: () => { bindings++; throw Error('No model binding'); }, request: () => { requests++; throw Error('No model request'); },
        apply: () => { writes++; throw Error('No host write'); },
    });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.callBound, 0); assert.equal(result.actualCalls, 0);
    assert.equal(snapshots, 1); assert.equal(bindings, 0); assert.equal(requests, 0); assert.equal(writes, 0);
    const patchArtifact = result.recording.artifacts.find(item => item.value?.kind === 'patches').value;
    assert.deepEqual(patchArtifact.patches, [{ index: 0, replacement: 'Commander waits.' }]);
    assert.equal(patchArtifact.draft.text, 'Captain waits.');
    assert.deepEqual(patchArtifact.draft.source, { chatId: 'fixture', messageIndex: 2, swipeId: 0 });
    const candidate = result.recording.artifacts.find(item => item.value?.kind === 'candidate').value;
    assert.equal(candidate.text, 'Commander waits.'); assert.equal(candidate.original, 'Captain waits.'); assert.deepEqual(candidate.source, { chatId: 'fixture', messageIndex: 2, swipeId: 0 });
    assert.deepEqual(source, { originalText: 'Captain waits.', chatId: 'fixture', messageIndex: 2, swipeId: 0, token: 'legacy-provenance' });
    const mapUnit = result.recording.units.find(unit => unit.operation === 'terminology-map');
    assert.deepEqual(expandRecordAddress(result.recording, mapUnit.address).instancePath, ['instance-2', 'child']);
    assert.equal(result.recording.terminals.length, 0);

    g.nodes.textSource = node('textSource', 'compose', { sections: [{ name: 'Text', text: 'Rerouted content.' }] });
    g.nodes.textSink = node('textSink', 'compose', { sections: [{ name: 'Text', text: '' }] });
    g.wires.rerouteInput = wire('rerouteInput', 'textSource', 'out', 'instance-3', 'target');
    g.wires.rerouteOutput = wire('rerouteOutput', 'instance-3', 'result', 'textSink', 'section.Text');
    const routed = await runWorkflow(g, { target: { workflowId: g.id, instancePath: [], nodeId: 'textSink', portId: 'out' }, snapshot: () => { snapshots++; throw Error('No reply snapshot'); }, resolveBinding: () => { bindings++; throw Error('No binding'); }, request: () => { requests++; throw Error('No request'); } });
    assert.equal(routed.ok, true, JSON.stringify(routed.error));
    assert.equal(routed.callBound, 0); assert.equal(routed.actualCalls, 0); assert.equal(snapshots, 1); assert.equal(bindings, 0); assert.equal(requests, 0);
    assert.ok(routed.recording.artifacts.some(item => item.value?.kind === 'text' && item.value.text === 'Rerouted content.'));
    assertLegacyPins(g);
});
