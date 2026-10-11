import assert from 'node:assert/strict';
import test from 'node:test';
import { describeOperation, operationDefaults } from '../src/workflow/catalog.js';
import { validateGraphStructure } from '../src/workflow/contracts.js';
import { graphSemanticSignature, prepareNodeControlChange } from '../src/workflow/ports.js';
import { runWorkflow } from '../src/workflow/runtime.js';
import { createNativeWorkflowController } from '../src/workflow/host.js';
import { exportWorkflow, parseWorkflow } from '../src/workflow/packages.js';
import { prepareNativeSearchCatalog, resolveNativeSearchChoice } from '../src/ui/native-search-catalog.js';
import { STARTERS, starterGraph, installStarter } from '../src/workflow/starters.js';
import { resolveWorkflow } from '../src/workflow/resolve.js';

const node = (id, operation, controls = {}) => ({ id, type: 'workflow', operation, operationVersion: 1, ...controls });
const wire = (id, from, to, toPort = 'in') => ({ id, route: 'wire', from, fromPort: 'out', to, toPort });
const graph = (nodes, wires = {}, phase = 'post') => ({ id: 'reference-integration', schema: 3, runtime: 2, mode: 'native-' + phase, nodes, wires, definitions: {}, portals: {}, roles: {} });
const draft = text => ({ kind: 'draft', text, source: { chatId: 'fixture', messageIndex: 4, swipeId: 0, originalText: text, token: 'private-source-token' } });
const countTokens = async text => ({ tokens: Math.ceil(text.length / 4) });
function flow(operation, controls = {}, reference = 'Plain sentences.') {
    const referenceNode = operation === 'terminology-map' || controls.referenceKind === 'data'
        ? node('reference', 'json-decode') : node('reference', 'compose', { sections: [{ name: 'Example', text: reference }] });
    const nodes = { source: node('source', 'reply-snapshot'), reference: referenceNode, change: node('change', operation, controls), validate: node('validate', 'validate-patches'), review: node('review', 'review-gate'), apply: node('apply', 'apply-reply') };
    const wires = { a: wire('a', 'source', 'change'), b: wire('b', 'reference', 'change', 'reference'), c: wire('c', 'change', 'validate'), d: wire('d', 'validate', 'review'), e: wire('e', 'review', 'apply') };
    if (referenceNode.operation === 'json-decode') { nodes.json = node('json', 'compose', { sections: [{ name: 'JSON', text: reference }] }); wires.json = wire('json', 'json', 'reference'); }
    return graph(nodes, wires);
}

test('legacy Draft Transpose is post-only with checked reference kinds, controls and named ports', () => {
    for (const [operation, bound] of [['style-transfer', 1], ['format-transfer', 1], ['terminology-map', 0]]) {
        const n = node('change', operation), post = describeOperation(graph({ change: n }), n);
        assert.equal(post.ok, true, JSON.stringify(post));
        assert.equal(post.data.descriptor.family, 'Transpose');
        assert.equal(post.data.descriptor.requestBound, bound);
        assert.equal(post.data.descriptor.modelRole, bound ? 'Prose' : null);
        assert.equal(post.data.ports.find(p => p.id === 'reference').kind, bound ? 'text' : 'data');
        assert.equal(post.data.ports.find(p => p.id === 'out').kind, 'patches');
        assert.equal(describeOperation(graph({}, {}, 'pre'), n).ok, false);
    }
    const transfer = node('t', 'style-transfer', { referenceKind: 'data' });
    assert.equal(describeOperation(graph({ t: transfer }), transfer).data.ports.find(p => p.id === 'reference').kind, 'data');
    for (const controls of [{ mode: 'bogus' }, { maxTokens: 0 }, { protectedLiterals: [''] }, { scope: 'everything' }]) assert.equal(describeOperation(graph({}), node('t', 'style-transfer', controls)).ok, false);
});

test('reference kind rewiring is atomic and all semantic controls invalidate execution identity', () => {
    const g = flow('style-transfer');
    assert.equal(validateGraphStructure(g).ok, true);
    const before = structuredClone(g);
    assert.equal(prepareNodeControlChange(g, { nodeId: 'change', controls: { referenceKind: 'data' } }).ok, false);
    assert.deepEqual(g, before);
    for (const controls of [{ mode: 'rhythm' }, { scope: 'whole' }, { strength: 'balanced' }, { instructions: 'A new instruction' }, { maxTokens: 100 }, { protectedLiterals: ['Plain'] }]) {
        const changed = prepareNodeControlChange(g, { nodeId: 'change', controls });
        assert.equal(changed.ok, true, JSON.stringify(changed));
        assert.notEqual(graphSemanticSignature(g), graphSemanticSignature(changed.data.candidate));
    }
    const parsed = parseWorkflow(JSON.stringify(exportWorkflow(g)));
    assert.equal(parsed.ok, true, JSON.stringify(parsed));
    assert.equal(parsed.data.nodes.change.operation, 'style-transfer');
});

test('canonical Transpose uses Text in either phase while legacy presets retain Draft behavior', () => {
    const scope = phase => ({ schema: 3, runtime: 2, mode: 'native-' + phase, workflowId: 'fixture', viewPath: [], inDefinition: false });
    const post = prepareNativeSearchCatalog(scope('post')).data;
    for (const phase of ['pre', 'post']) {
        const catalog = prepareNativeSearchCatalog(scope(phase)).data;
        assert.equal(catalog.choices.filter(choice => choice.family === 'Transpose').length, 3);
        for (const operation of ['style-transfer', 'format-transfer', 'terminology-map']) {
            const id = 'operation:' + operation;
            assert.ok(catalog.choices.some(choice => choice.id === id), id);
            const packet = resolveNativeSearchChoice(catalog, id);
            assert.equal(packet.controls.inputKind, 'text');
            const described = describeOperation(graph({}, {}, phase), node('change', operation, packet.controls));
            assert.equal(described.ok, true, JSON.stringify(described));
            assert.equal(described.data.ports.find(port => port.id === 'in').kind, 'text');
            assert.equal(described.data.ports.find(port => port.id === 'out').kind, 'text');
        }
    }
    assert.ok(post.choices.some(choice => choice.id === 'operation:repair'));
    for (const mode of ['inspect', 'contextual', 'strict']) {
        assert.equal(resolveNativeSearchChoice(post, 'operation:repair:' + mode).controls.mode, mode);
    }
    const voice = resolveNativeSearchChoice(post, 'operation:style-transfer:character-voice');
    assert.equal(voice.controls.mode, 'character-voice');
    assert.equal(voice.controls.scope, 'dialogue');
    assert.equal(voice.controls.inputKind ?? 'draft', 'draft');
    assert.equal(resolveNativeSearchChoice(prepareNativeSearchCatalog(scope('pre')).data, 'operation:style-transfer:character-voice'), null);
    assert.equal(operationDefaults('style-transfer').scope, 'narration');
});

test('raw Style Transfer flows through source-bound validation/review with one fixed Prose request', async () => {
    const text = 'Old prose. "Keep this."', binding = { profileId: 'private-profile', model: 'fixture' }, requests = [];
    const g = flow('style-transfer');
    const result = await runWorkflow(g, { countTokens, snapshot: () => draft(text), resolveBinding: () => ({ ok: true, data: binding }), request: async packet => { requests.push(packet); return { ok: true, data: { text: 'Lean prose. "Keep this."', finish: 'stop' } }; } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.callBound, 1); assert.equal(result.actualCalls, 1);
    assert.equal(requests[0].binding, binding);
    assert.ok(!JSON.stringify(requests[0].messages).includes('private-source-token'));
    assert.ok(!JSON.stringify(requests[0].messages).includes('private-profile'));
    const terminal = result.recording.artifacts.find(entry => entry.value?.kind === 'candidate');
    assert.equal(terminal.value.text, 'Lean prose. "Keep this."');
    assert.equal(terminal.value.original, text);
    assert.equal(result.recording.terminals.length, 1);
});

test('Terminology Map runs deterministic glossary flow and never resolves a model', async () => {
    const g = flow('terminology-map', { scope: 'whole' }, JSON.stringify({ entries: [{ from: 'Captain', to: 'Commander' }] }));
    const result = await runWorkflow(g, { countTokens, snapshot: () => draft('Captain waits.'), resolveBinding: () => { throw Error('No binding'); }, request: () => { throw Error('No request'); } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.actualCalls, 0); assert.equal(result.callBound, 0);
    assert.ok(result.recording.artifacts.some(entry => entry.value?.kind === 'candidate' && entry.value.text === 'Commander waits.'));
});

test('cleanup modes expose independent policy scope/categories and bounded optional Context', () => {
    for (const mode of ['inspect', 'contextual', 'strict']) {
        const n = node('cleanup', 'repair', { mode, scope: 'narration', categories: [] });
        const described = describeOperation(graph({ cleanup: n }), n);
        assert.equal(described.ok, true, JSON.stringify(described));
        assert.equal(described.data.ports.find(port => port.id === 'context').kind, 'context');
        const bound = described.data.descriptor.requestBound(n);
        assert.equal(bound, mode === 'inspect' ? 0 : 1);
        const g = graph({ cleanup: n });
        assert.notEqual(graphSemanticSignature(g), graphSemanticSignature(graph({ cleanup: { ...n, scope: 'whole' } })));
    }
    assert.equal(describeOperation(graph({}), node('cleanup', 'repair', { mode: 'strict', categories: ['unknown-category'] })).ok, false);
});

test('legacy Repair exposes only controls that its runtime enforces', () => {
    for (const mode of ['repair', 'scan']) {
        const n = node('cleanup', 'repair', { mode });
        const described = describeOperation(graph({ cleanup: n }), n);
        assert.equal(described.ok, true, JSON.stringify(described));
        for (const key of ['scope', 'categories', 'caseSensitive']) {
            assert.equal(described.data.descriptor.controls.includes(key), false, key);
            assert.equal(Object.hasOwn(described.data.descriptor.controlDescriptors, key), false, key);
        }
        assert.equal(described.data.ports.some(port => port.id === 'context'), false);
    }
    const n = node('cleanup', 'repair');
    const changed = prepareNodeControlChange(graph({ cleanup: n }), { nodeId: 'cleanup', controls: { mode: 'contextual' } });
    assert.equal(changed.ok, true, JSON.stringify(changed));
    assert.equal(describeOperation(changed.data.candidate, changed.data.candidate.nodes.cleanup).data.descriptor.controls.includes('scope'), true);
});

test('inspect flows to an unchanged review candidate without binding or model authority', async () => {
    const g = graph({ source: node('source', 'reply-snapshot'), cleanup: node('cleanup', 'repair', { mode: 'inspect', scope: 'whole' }), validate: node('validate', 'validate-patches'), review: node('review', 'review-gate'), apply: node('apply', 'apply-reply') }, { a: wire('a', 'source', 'cleanup'), b: wire('b', 'cleanup', 'validate'), c: wire('c', 'validate', 'review'), d: wire('d', 'review', 'apply') });
    const text = 'The tension was palpable.';
    const result = await runWorkflow(g, { countTokens, snapshot: () => draft(text), resolveBinding: () => { throw Error('No inspect binding'); }, request: () => { throw Error('No inspect request'); } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.callBound, 0); assert.equal(result.actualCalls, 0);
    const candidate = result.recording.artifacts.find(entry => entry.value?.kind === 'candidate').value;
    assert.equal(candidate.text, text); assert.equal(candidate.original, text);
    assert.ok(candidate.findings.some(finding => finding.code === 'SLOP_LITERAL_MATCH'));
});

test('stopped Transpose output cannot complete a root run', async () => {
    for (const stop of ['abort']) {
        const g = flow('style-transfer'), controller = new AbortController();
        const result = await runWorkflow(g, { signal: controller.signal, countTokens, snapshot: () => draft('Old prose.'), resolveBinding: () => ({ ok: true, data: { model: 'fixture' } }), request: async () => { if (stop === 'abort') controller.abort(); else g.nodes.change.instructions = 'Changed'; return { ok: true, data: { text: 'Late output.', finish: 'stop' } }; } });
        assert.equal(result.ok, false, stop);
        assert.ok(['ABORTED', 'STALE_GRAPH'].includes(result.error.code), JSON.stringify(result.error));
        assert.equal(result.recording.terminals.every(terminal => terminal.artifact === null), true);
    }
});

test('the host rejects changed Transpose controls before granting an Apply handle', async () => {
    const g = flow('style-transfer');
    const message = { mes: 'Old prose.', is_user: false, swipe_id: 0, swipes: ['Old prose.'], extra: {}, gen_started: 1, gen_finished: 2 };
    const context = { chatId: 'fixture', characterId: 1, groupId: null, chat: [{ mes: 'Continue.', is_user: true }, message] };
    const controller = createNativeWorkflowController({ context: () => context, getGraph: () => g, isEnabled: () => true, isBusy: () => false, countTokens,
        resolveBinding: () => ({ ok: true, data: { profileId: 'fixed', model: 'fixture' } }),
        request: async () => { g.nodes.change.instructions = 'Changed during request'; return { ok: true, data: { text: 'Lean prose.', finish: 'stop' } }; },
    });
    const result = await controller.runPost(g);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.error.code, 'STALE_SOURCE');
    assert.equal(result.reviewHandles.length, 0);
    assert.equal(message.mes, 'Old prose.');
});

test('reference library workflows are explicit independent installations with verified call bounds', () => {
    for (const [id, bound] of [['scene-compass', 1], ['library-literal-cleanup', 1], ['formatting-cleanup', 0], ['prose-cleanup', 1]]) {
        assert.ok(STARTERS.some(starter => starter.id === id), id);
        const g = starterGraph(id), resolved = resolveWorkflow(g);
        assert.equal(resolved.ok, true, JSON.stringify(resolved));
        assert.equal(resolved.data.callBound, bound, id);
        assert.equal(parseWorkflow(JSON.stringify(exportWorkflow(g))).ok, true);
        const first = installStarter(id), second = installStarter(id);
        assert.notEqual(first.id, second.id);
        assert.equal(resolveWorkflow(first).ok, true);
        assert.equal(resolveWorkflow(second).ok, true);
    }
});
