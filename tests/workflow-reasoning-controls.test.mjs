import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OPERATIONS, operationDefaults, operationFor, describeAuthoredOperation, semanticControlsForNode } from '../src/workflow/catalog.js';
import { computeDefinitionIdentity } from '../src/workflow/definitions.js';
import { prepareNodeControlChange } from '../src/workflow/ports.js';
import { serializeWorkflowDocument, parseWorkflowDocument } from '../src/workflow/document-file.js';
import { exportWorkflow } from '../src/workflow/packages.js';

test('all model operations and the native generation boundary declare default None reasoning', () => {
    for (const operation of Object.values(OPERATIONS).filter(operation => operation.modelRole || operation.nativeBoundary)) {
        assert.equal(operation.defaults.reasoningEffort, 'none', operation.id);
        assert.equal(operation.defaults.reasoningCustom, '', operation.id);
        assert.ok(operation.controls.includes('reasoningEffort'), operation.id);
        assert.equal(operation.controlDescriptors.reasoningCustom.maxLength, 128, operation.id);
    }
    assert.equal(OPERATIONS.recall.controls.includes('reasoningEffort'), false);
    assert.equal(OPERATIONS['for-each'].controls.includes('reasoningEffort'), false);
});

test('default reasoning preserves existing definition content and semantic identity', () => {
    assert.equal(Object.hasOwn(operationDefaults('response-plan'), 'reasoningEffort'), false, 'None stays an implicit additive default in authored nodes');
    const node = { id: 'plan', type: 'workflow', operation: 'response-plan' };
    const controls = semanticControlsForNode(node);
    assert.equal(Object.hasOwn(controls, 'reasoningEffort'), false);
    assert.equal(Object.hasOwn(controls, 'reasoningCustom'), false);
    const definition = { id: 'reasoning-pin', version: 1, name: 'Plan', interface: [], parameters: [], body: {
        schema: 3, runtime: 2, mode: 'native-pre', nodes: { plan: node }, wires: {}, roles: {},
    } };
    const original = computeDefinitionIdentity(definition);
    assert.equal(original.ok, true, JSON.stringify(original.error));
    assert.equal(Object.hasOwn(original.data.materializedDefinition.body.nodes.plan, 'reasoningEffort'), false);
    assert.equal(Object.hasOwn(original.data.materializedDefinition.body.nodes.plan, 'reasoningCustom'), false);
    definition.body.nodes.plan = { ...node, reasoningEffort: 'none', reasoningCustom: '' };
    assert.equal(computeDefinitionIdentity(definition).data.semanticHash, original.data.semanticHash);
    definition.body.nodes.plan.reasoningEffort = 'high';
    assert.notEqual(computeDefinitionIdentity(definition).data.semanticHash, original.data.semanticHash);
});

test('dynamic descriptions retain reasoning controls across model and deterministic modes', () => {
    for (const settings of [
        { operation: 'model-call' }, { operation: 'extract', inputKind: 'text' },
        { operation: 'reflect' }, { operation: 'express', mode: 'inner-voice' },
        { operation: 'express', mode: 'behavior' }, { operation: 'context', mode: 'focus', method: 'compress' },
        { operation: 'context', mode: 'assemble' }, { operation: 'item-use-trigger', mode: 'extract' },
        { operation: 'item-use-trigger', mode: 'candidates' }, { operation: 'generate-reply' },
    ]) {
        const node = { type: 'workflow', ...settings };
        const operation = operationFor(node);
        assert.ok(operation, JSON.stringify(settings));
        assert.ok(operation.controls.includes('reasoningEffort'), JSON.stringify(settings));
        const described = describeAuthoredOperation({ schema: 3, runtime: 2, mode: 'native-unified' }, node);
        assert.equal(described.ok, true, JSON.stringify(described.error));
        assert.ok(described.data.descriptor.controls.includes('reasoningEffort'), JSON.stringify(settings));
    }
});

test('reasoning stays in the native envelope during cleanup validation and mode changes', () => {
    const repair = { type: 'workflow', operation: 'repair', phase: 'post', mode: 'contextual', reasoningEffort: 'high' };
    assert.ok(operationFor(repair), 'cleanup accepts native reasoning envelope');
    const graph = { id: 'root', schema: 3, runtime: 2, mode: 'native-unified', nodes: {
        expression: { id: 'expression', type: 'workflow', operation: 'express', mode: 'inner-voice', reasoningEffort: 'custom', reasoningCustom: 'future-level' },
    }, wires: {}, roles: {} };
    const changed = prepareNodeControlChange(graph, { nodeId: 'expression', controls: { mode: 'behavior' } });
    assert.equal(changed.ok, true, JSON.stringify(changed.error));
    assert.equal(changed.data.candidate.nodes.expression.reasoningEffort, 'custom');
    assert.equal(changed.data.candidate.nodes.expression.reasoningCustom, 'future-level');
});

test('authoring validates bounded reasoning and both document formats retain Custom', () => {
    const graph = { id: 'reasoning-roundtrip', name: 'Reasoning', schema: 3, runtime: 2, mode: 'native-unified', nodes: {
        model: { id: 'model', type: 'workflow', operation: 'model-call', reasoningEffort: 'custom', reasoningCustom: 'future-effort' },
    }, wires: {}, roles: {} };
    for (const controls of [{ reasoningEffort: 'invalid' }, { reasoningCustom: 'x'.repeat(129) }, { reasoningCustom: 1024 }]) {
        assert.equal(prepareNodeControlChange(graph, { nodeId: 'model', controls }).ok, false);
    }
    const edited = prepareNodeControlChange(graph, { nodeId: 'model', controls: { reasoningCustom: 'custom-level' } });
    assert.equal(edited.ok, true, JSON.stringify(edited.error));
    const serialized = serializeWorkflowDocument(edited.data.candidate);
    assert.equal(serialized.ok, true, JSON.stringify(serialized.error));
    const parsed = parseWorkflowDocument(serialized.data.json);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.error));
    assert.equal(parsed.data.graph.nodes.model.reasoningEffort, 'custom');
    assert.equal(parsed.data.graph.nodes.model.reasoningCustom, 'custom-level');
    const portable = exportWorkflow(edited.data.candidate);
    assert.equal(portable.graph.nodes.model.reasoningCustom, 'custom-level');
    assert.equal(parseWorkflowDocument(JSON.stringify(portable)).data.graph.nodes.model.reasoningEffort, 'custom');
});
