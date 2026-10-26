import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDefinitionIdentity, definitionRefKey, inspectPinnedDefinitionIdentity, validateDefinition } from '../src/workflow/definitions.js';
import { exportSubgraph, parseSubgraph } from '../src/workflow/packages.js';
import { operationDefaults, operationFor, semanticControlsForNode } from '../src/workflow/catalog.js';

// The verified pre-change lifecycle pin from workflow-guidance-injection-compat.
// This fixture has the same semantic body; display metadata does not affect identity.
const LEGACY_HASH = 'sha256:f4de13a2b4a2f33831a74c8fbb5aabf30142597da8618d7d106178656b42009b';
const legacySnapshot = () => ({
    id: 'legacy-auto-publish', version: 1, name: 'Legacy manual publication', semanticHash: LEGACY_HASH,
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

test('new manual terminals omit the additive default while the descriptor retains it', () => {
    const node = { id: 'review', type: 'workflow', ...operationDefaults('review-publish') };
    assert.equal(Object.hasOwn(node, 'autoApply'), false);
    assert.equal(operationFor(node).defaults.autoApply, false);
    assert.equal(Object.hasOwn(semanticControlsForNode(node), 'autoApply'), false);
    assert.equal(Object.hasOwn(semanticControlsForNode({ ...node, autoApply: false }), 'autoApply'), false);
    assert.equal(semanticControlsForNode({ ...node, autoApply: true }).autoApply, true);
});

test('omitted and false automatic publication preserve the old pin and saved body', () => {
    const original = legacySnapshot();
    for (const explicit of [false, true]) {
        const candidate = legacySnapshot();
        if (explicit) candidate.body.nodes.review.autoApply = false;
        const identity = must(computeDefinitionIdentity(candidate));
        assert.equal(identity.semanticHash, LEGACY_HASH);
        assert.deepEqual(identity.materializedDefinition, original);
        assert.equal(Object.hasOwn(JSON.parse(identity.canonicalContent).body.nodes.review.controls, 'autoApply'), false);
        assert.equal(Object.hasOwn(identity.materializedDefinition.body.nodes.review, 'autoApply'), false);
    }
});

test('old manual publication snapshots retain their exact pins through package round trips', () => {
    const original = legacySnapshot(), ref = reference(original);
    const snapshots = { [definitionRefKey(ref)]: original };
    assert.equal(must(inspectPinnedDefinitionIdentity(ref, snapshots)).semanticHash, LEGACY_HASH);
    assert.equal(must(validateDefinition(original)).definition.semanticHash, LEGACY_HASH);
    const envelope = { kind: 'lattice-subgraph', schema: 1, minRuntime: 2, definition: original, definitions: {} };
    const parsed = must(parseSubgraph(JSON.stringify(envelope)));
    assert.deepEqual(parsed.definition, original);
    assert.deepEqual(exportSubgraph(parsed.definition, parsed.definitions), envelope);
});

test('enabled automatic publication changes the pin and stays serialized', () => {
    const changed = legacySnapshot(), ref = reference(changed);
    changed.body.nodes.review.autoApply = true;
    const identity = must(computeDefinitionIdentity(changed));
    assert.notEqual(identity.semanticHash, LEGACY_HASH);
    assert.equal(JSON.parse(identity.canonicalContent).body.nodes.review.controls.autoApply, true);
    assert.equal(identity.materializedDefinition.body.nodes.review.autoApply, true);
    assert.equal(inspectPinnedDefinitionIdentity(ref, { [definitionRefKey(ref)]: changed }).error.code, 'DEFINITION_HASH');
    const saved = { ...identity.materializedDefinition, semanticHash: identity.semanticHash };
    must(validateDefinition(saved));
    const parsed = must(parseSubgraph(JSON.stringify(exportSubgraph(saved))));
    assert.equal(parsed.definition.body.nodes.review.autoApply, true);
});
