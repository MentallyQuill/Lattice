import assert from 'node:assert/strict';
import test from 'node:test';
import { semanticControlsForNode } from '../src/workflow/catalog.js';
import { computeDefinitionIdentity, definitionRefKey, inspectPinnedDefinitionIdentity, validateDefinition } from '../src/workflow/definitions.js';
import { exportSubgraph, parseSubgraph } from '../src/workflow/packages.js';
import { graphSemanticSignature } from '../src/workflow/ports.js';

// Captured with the privately backed-up 0.27.5 modules before retries were
// added to model controls. Current hashing never generates this expected pin.
const LEGACY_HASH = 'sha256:442faaa1dd587ef3c801cca285d751fa50180c7848e9ded1b8afb0488d4bf39b';
const legacySnapshot = () => ({
    id: 'legacy-model-retries', version: 1, name: 'Legacy model helper', semanticHash: LEGACY_HASH,
    parameters: [], interface: [
        { id: 'input', label: 'Prompt', direction: 'input', kind: 'text', required: true, cardinality: 'one', boundaryNodeId: 'entry' },
        { id: 'output', label: 'Result', direction: 'output', kind: 'text', required: false, cardinality: 'one', boundaryNodeId: 'exit' },
    ], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: {
        entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'input' },
        model: { id: 'model', type: 'workflow', operation: 'model-call', operationVersion: 1, modelRole: 'Prose', instructions: 'Return a concise result.', outputKind: 'text', schema: '', maxTokens: 128 },
        exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'output' },
    }, wires: {
        prompt: { id: 'prompt', route: 'wire', from: 'entry', fromPort: 'out', to: 'model', toPort: 'prompt' },
        result: { id: 'result', route: 'wire', from: 'model', fromPort: 'out', to: 'exit', toPort: 'in' },
    } },
});
const must = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result.data; };
const ref = definition => ({ id: definition.id, version: definition.version, semanticHash: definition.semanticHash });

test('a pinned pre-retry model definition retains its exact hash', () => {
    const original = legacySnapshot(), reference = ref(original);
    const pinned = inspectPinnedDefinitionIdentity(reference, { [definitionRefKey(reference)]: original });
    assert.equal(pinned.ok, true, JSON.stringify(pinned.error));
    assert.equal(pinned.data.semanticHash, LEGACY_HASH);
    assert.equal(must(validateDefinition(original)).definition.semanticHash, LEGACY_HASH);
});

test('omitted and explicit zero retries retain the legacy semantic content and saved body', () => {
    const original = legacySnapshot(), omitted = must(computeDefinitionIdentity(original));
    const explicit = legacySnapshot(); explicit.body.nodes.model.maxRetries = 0;
    const zero = must(computeDefinitionIdentity(explicit));
    assert.equal(omitted.semanticHash, LEGACY_HASH);
    assert.equal(zero.semanticHash, LEGACY_HASH);
    assert.equal(zero.canonicalContent, omitted.canonicalContent);
    assert.deepEqual(omitted.materializedDefinition, original);
    assert.deepEqual(zero.materializedDefinition, original);
    assert.equal(graphSemanticSignature(explicit.body), graphSemanticSignature(original.body));
    assert.equal(Object.hasOwn(semanticControlsForNode(original.body.nodes.model), 'maxRetries'), false);
});

test('legacy pinned model snapshots import and round-trip without adding retry fields', () => {
    const original = legacySnapshot();
    const envelope = { kind: 'lattice-subgraph', schema: 1, minRuntime: 2, definition: original, definitions: {} };
    const parsed = must(parseSubgraph(JSON.stringify(envelope)));
    assert.deepEqual(parsed.definition, original);
    assert.deepEqual(exportSubgraph(parsed.definition, parsed.definitions), envelope);
});

const legacySettings = [
    ['enrich', 'native-pre', { instructions: '', maxTokens: 2048 }],
    ['extract', 'native-post', { inputKind: 'draft', mode: 'model', instructions: '', schema: '', patterns: [], caseSensitive: true, match: 'substring', maxTokens: 2048 }],
    ['model-call', 'native-pre', { instructions: '', outputKind: 'text', schema: '', maxTokens: 2048 }],
    ['revise-draft', 'native-post', { instructions: '', scope: 'authorized', protectedLiterals: [], maxTokens: 2048 }],
];

for (const [operation, mode, settings] of legacySettings) {
    test(`${operation} omits zero retries while preserving positive retry semantics and materialization`, () => {
        const definition = { id: operation + '-compat', version: 1, name: 'Synthetic model helper', interface: [], parameters: [], body: {
            schema: 3, runtime: 2, mode, nodes: { model: { id: 'model', type: 'workflow', operation, operationVersion: 1, modelRole: 'Prose', ...settings } }, wires: {},
        } };
        const original = must(computeDefinitionIdentity(definition));
        assert.deepEqual(original.materializedDefinition, definition);
        assert.equal(Object.hasOwn(JSON.parse(original.canonicalContent).body.nodes.model.controls, 'maxRetries'), false);
        const hashes = new Set([original.semanticHash]);
        for (const maxRetries of [0, 1, 2]) {
            const changed = structuredClone(definition); changed.body.nodes.model.maxRetries = maxRetries;
            const identity = must(computeDefinitionIdentity(changed));
            const controls = JSON.parse(identity.canonicalContent).body.nodes.model.controls;
            if (maxRetries === 0) {
                assert.equal(identity.semanticHash, original.semanticHash);
                assert.deepEqual(identity.materializedDefinition, definition);
            } else {
                assert.equal(controls.maxRetries, maxRetries);
                assert.equal(identity.materializedDefinition.body.nodes.model.maxRetries, maxRetries);
                assert.equal(semanticControlsForNode(changed.body.nodes.model).maxRetries, maxRetries);
                assert.notEqual(graphSemanticSignature(changed.body), graphSemanticSignature(definition.body));
                hashes.add(identity.semanticHash);
            }
        }
        assert.equal(hashes.size, 3);
    });
}

test('positive retry snapshots require a new pin and preserve explicit values through import', () => {
    for (const maxRetries of [1, 2]) {
        const changed = legacySnapshot(); changed.body.nodes.model.maxRetries = maxRetries;
        const reference = ref(changed), identity = must(computeDefinitionIdentity(changed));
        assert.notEqual(identity.semanticHash, LEGACY_HASH);
        assert.equal(inspectPinnedDefinitionIdentity(reference, { [definitionRefKey(reference)]: changed }).error.code, 'DEFINITION_HASH');
        const saved = { ...identity.materializedDefinition, semanticHash: identity.semanticHash };
        must(validateDefinition(saved));
        const parsed = must(parseSubgraph(JSON.stringify(exportSubgraph(saved))));
        assert.equal(parsed.definition.body.nodes.model.maxRetries, maxRetries);
    }
});
