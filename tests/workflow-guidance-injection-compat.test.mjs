import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDefinitionIdentity, definitionRefKey, inspectPinnedDefinitionIdentity, validateDefinition } from '../src/workflow/definitions.js';
import { exportSubgraph, parseSubgraph } from '../src/workflow/packages.js';
import { graphSemanticSignature } from '../src/workflow/ports.js';

// Captured before Generate Reply declared injection controls. The complete
// native lifecycle body was admitted by validateDefinition with this exact pin.
const LEGACY_HASH = 'sha256:f4de13a2b4a2f33831a74c8fbb5aabf30142597da8618d7d106178656b42009b';
const legacySnapshot = () => ({
    id: 'legacy-guidance-injection', version: 1, name: 'Legacy guidance injection', semanticHash: LEGACY_HASH,
    parameters: [], interface: [],
    body: { schema: 3, runtime: 2, mode: 'native-unified', nodes: {
        send: { id: 'send', type: 'workflow', operation: 'on-send', operationVersion: 1, modelRole: null },
        generate: { id: 'generate', type: 'workflow', operation: 'generate-reply', budgetTokens: 768, operationVersion: 1, modelRole: null },
        review: { id: 'review', type: 'workflow', operation: 'review-publish', operationVersion: 1, modelRole: null },
    }, wires: {
        activation: { id: 'activation', route: 'wire', from: 'send', fromPort: 'activation', to: 'generate', toPort: 'activation' },
        draft: { id: 'draft', route: 'wire', from: 'generate', fromPort: 'draft', to: 'review', toPort: 'draft' },
    } },
});
const must = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result.data; };
const reference = definition => ({ id: definition.id, version: definition.version, semanticHash: definition.semanticHash });

test('default injection controls retain the pre-change Generate Reply hash and saved body', () => {
    const original = legacySnapshot();
    const omitted = must(computeDefinitionIdentity(original));
    assert.equal(omitted.semanticHash, LEGACY_HASH);
    assert.deepEqual(omitted.materializedDefinition, original);
    const explicit = legacySnapshot();
    Object.assign(explicit.body.nodes.generate, { injectionRole: 'system', injectionPosition: 'in-chat', injectionDepth: 0 });
    const normalized = must(computeDefinitionIdentity(explicit));
    assert.equal(normalized.semanticHash, LEGACY_HASH);
    assert.equal(normalized.canonicalContent, omitted.canonicalContent);
    assert.deepEqual(normalized.materializedDefinition, original);
    assert.equal(graphSemanticSignature(explicit.body), graphSemanticSignature(original.body));
});

test('pre-change Generate Reply snapshots import and retain their exact pinned reference', () => {
    const original = legacySnapshot(), ref = reference(original), snapshots = { [definitionRefKey(ref)]: original };
    const before = structuredClone(original);
    assert.equal(must(inspectPinnedDefinitionIdentity(ref, snapshots)).semanticHash, LEGACY_HASH);
    assert.equal(must(validateDefinition(original)).definition.semanticHash, LEGACY_HASH);
    const envelope = { kind: 'lattice-subgraph', schema: 1, minRuntime: 2, definition: original, definitions: {} };
    const parsed = must(parseSubgraph(JSON.stringify(envelope)));
    assert.deepEqual(parsed.definition, original);
    const exported = exportSubgraph(parsed.definition, parsed.definitions);
    assert.deepEqual(exported, envelope);
    assert.deepEqual(must(parseSubgraph(JSON.stringify(exported))).definition, original);
    assert.deepEqual(original, before);
});

test('each nondefault injection control changes semantics and invalidates an old pinned reference', () => {
    const original = legacySnapshot(), ref = reference(original), originalSignature = graphSemanticSignature(original.body);
    for (const [controlId, value] of [
        ['injectionRole', 'user'], ['injectionRole', 'assistant'],
        ['injectionPosition', 'before-prompt'], ['injectionPosition', 'in-prompt'],
        ['injectionDepth', 1], ['injectionDepth', 10000],
    ]) {
        const changed = legacySnapshot(); changed.body.nodes.generate[controlId] = value;
        const identity = must(computeDefinitionIdentity(changed));
        assert.notEqual(identity.semanticHash, LEGACY_HASH, controlId);
        assert.equal(JSON.parse(identity.canonicalContent).body.nodes.generate.controls[controlId], value);
        assert.equal(identity.materializedDefinition.body.nodes.generate[controlId], value);
        assert.notEqual(graphSemanticSignature(changed.body), originalSignature, controlId);
        assert.equal(inspectPinnedDefinitionIdentity(ref, { [definitionRefKey(ref)]: changed }).error.code, 'DEFINITION_HASH');
        assert.equal(validateDefinition(changed).error.code, 'DEFINITION_HASH');
        const saved = { ...identity.materializedDefinition, semanticHash: identity.semanticHash };
        must(validateDefinition(saved));
        assert.equal(must(parseSubgraph(JSON.stringify(exportSubgraph(saved)))).definition.body.nodes.generate[controlId], value);
    }
});
