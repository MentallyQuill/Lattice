import assert from 'node:assert/strict';
import test from 'node:test';
import { runWorkflow as runEngine } from '../src/workflow/runtime.js';
import { fixtureGraph as starterGraph } from './helpers/workflow-fixtures.mjs';
const runWorkflow=(graph,ports={})=>runEngine(graph,{target:graph.nodes.guidance?{workflowId:graph.id,instancePath:[],nodeId:'guidance',portId:'out'}:{kind:'terminal',address:{workflowId:graph.id,instancePath:[],nodeId:'apply-reply'}},...ports});
import { callCount } from '../src/run.js';
const countTokens = async text => ({ tokens: Math.ceil(text.length / 4), method: 'fixture' });
const binding = { profileId: 'fixed', model: 'fake' };
const context = { kind: 'context', messages: [{ id: '1', role: 'user', text: 'What happens next?', source: 'chat' }] };
const terminal = result => result.recording.artifacts.findLast(entry => entry.kind === 'guidance' || entry.kind === 'candidate')?.value;
const ports = { snapshot: () => structuredClone(context), countTokens, resolveBinding: () => ({ ok: true, data: binding }) };

test('current guidance uses fixed bindings, preserves authoring data and records bounded request evidence', async () => {
    const graph = starterGraph('native-guidance'); graph.nodes['scene-context'].y = 9999;
    const before = structuredClone(graph), seen = [];
    const result = await runWorkflow(graph, { ...ports, request: async request => { seen.push(request); return { ok: true, data: { text: 'Consider a quiet departure.', finish: 'stop' } }; } });
    assert.equal(result.ok, true); assert.equal(terminal(result).kind, 'guidance');
    assert.equal(result.actualCalls, 1); assert.equal(result.callBound, 2);
    assert.equal(seen[0].binding, binding); assert.equal(seen[0].maxTokens, 768);
    assert.match(seen[0].messages[0].content, /guidance|proposal/i); assert.deepEqual(graph, before);
    assert.ok(result.recording.units.some(unit => unit.reports?.some(report => report.code === 'GUIDANCE_BUDGET')));
    assert.equal('calls' in result, false); assert.equal('artifact' in result, false);
});
test('missing binding and previews perform no requests; retired documents cannot enter another executor', async () => {
    const graph = starterGraph('native-guidance'); let requests = 0;
    const failing = { ...ports, resolveBinding: node => node.operation === 'response-plan' ? { ok: false, error: { code: 'PROFILE_MISSING', message: 'Missing' } } : { ok: true, data: binding }, request: () => { requests++; } };
    assert.equal((await runWorkflow(graph, failing)).error.code, 'PROFILE_MISSING');
    for (const options of [{ dryRun: true }, { preview: true }]) assert.equal((await runWorkflow(graph, { ...failing, ...options })).actualCalls, 0);
    assert.equal(requests, 0); assert.equal(callCount(graph), 2);
    for (const schema of [1, 2]) {
        const retired = { ...graph, schema, runtime: 1 };
        assert.equal((await runWorkflow(retired, failing)).error.code, 'UNSUPPORTED_VERSION'); assert.equal(callCount(retired), 0);
    }
    assert.equal(requests, 0);
});
test('reviewed repair records a candidate while preserving the immutable input snapshot', async () => {
    const graph = starterGraph('reviewed-de-slop'), source = { originalText: 'We delve.', token: 'immutable-token' }, before = structuredClone(source);
    const result = await runWorkflow(graph, { ...ports, snapshot: () => ({ kind: 'draft', text: source.originalText, source }), request: async () => ({ ok: true, data: { text: 'We explore.', finish: 'stop' } }) });
    assert.equal(result.ok, true); assert.equal(terminal(result).text, 'We explore.'); assert.equal(terminal(result).kind, 'candidate');
    assert.equal(result.actualCalls, 1); assert.deepEqual(source, before);
});
test('completion evidence fails closed and cutoff evidence survives in the recording', async () => {
    const graph = starterGraph('native-guidance');
    const missing = await runWorkflow(graph, { ...ports, request: async () => ({ ok: true, data: { text: 'Unsafe incomplete plan' } }) });
    assert.equal(missing.error.code, 'COMPLETION_UNVERIFIED');
    const cutoff = await runWorkflow(graph, { ...ports, request: async () => ({ ok: false, error: { code: 'TRUNCATED_OUTPUT', message: 'cut off', finish: 'length', usage: { completion_tokens: 768 } } }) });
    const request = cutoff.recording.units.find(unit => unit.request).request;
    assert.equal(cutoff.actualCalls, 1); assert.equal(request.usage.completion_tokens, 768); assert.equal(request.finish, 'length');
});
