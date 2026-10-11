import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runWorkflowForHost } from '../src/workflow/runtime.js?v=0.27.0';
import { getPatternReportBinding } from '../src/workflow/operations/pattern-engine.js?v=0.27.0';
import { routingGraph, hostHarness, fourteen, retained, unit, recorded, target, node, wire } from './helpers/pattern-routing-fixtures.mjs';

test('fourteen Pattern hits select and execute Filter once before final review with zero model work', async () => {
    const h = hostHarness(fourteen), result = await runWorkflowForHost(routingGraph(), h.ports, h.hooks);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(h.effects.filters, 1); assert.equal(h.effects.requests, 0); assert.equal(h.effects.bindings, 0); assert.equal(h.effects.tokens, 0); assert.equal(result.actualCalls, 0);
    const source = retained(h.outputs, 'generate', 'draft'), report = retained(h.outputs, 'pattern', 'matches');
    assert.equal(retained(h.outputs, 'pattern'), source); assert.equal(retained(h.outputs, 'branch', 'yes'), source);
    assert.equal(report.value.totalOccurrences, 14); assert.deepEqual(report.value.rules.map(rule => rule.count), [12, 0, 2]);
    assert.equal(getPatternReportBinding(report.value, source).ok, true);
    assert.equal(retained(h.outputs, 'filter').text, 'First.\n\nLast.');
    assert.equal(retained(h.outputs, 'join'), retained(h.outputs, 'filter'));
    assert.equal(h.settlements[0].terminals[0].artifact.text, 'First.\n\nLast.'); assert.equal(h.effects.commits, 1);
    assert.equal(unit(result, 'branch').status, 'completed'); assert.equal(unit(result, 'filter').status, 'completed'); assert.equal(unit(result, 'review').status, 'completed');
});

test('no-hit bypass skips filtering and an activated target model before binding or requests', async () => {
    const graph = routingGraph(), h = hostHarness('First.\n\nLast.');
    const result = await runWorkflowForHost(graph, h.ports, h.hooks);
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(h.effects.filters, 0);
    assert.equal(unit(result, 'filter').status, 'skipped'); assert.equal(unit(result, 'filter').attempts, 0);
    assert.equal(retained(h.outputs, 'join'), retained(h.outputs, 'generate', 'draft')); assert.equal(h.effects.commits, 1);
    graph.nodes.model = node('model', 'repair'); graph.wires.model = wire('model', 'branch', 'yes', 'model', 'in');
    const m = hostHarness('No keywords here.'), skipped = await runWorkflowForHost(graph, { ...m.ports, target: target('model') }, m.hooks);
    assert.equal(skipped.ok, true, JSON.stringify(skipped.error)); assert.equal(unit(skipped, 'model').status, 'skipped');
    assert.equal(m.effects.bindings, 0); assert.equal(m.effects.requests, 0); assert.equal(m.effects.tokens, 0); assert.equal(skipped.actualCalls, 0);
});

for (const [label, text, pattern, extra, reason, executions] of [
    ['ambiguous match', '1 "3', { scope: 'dialogue' }, {}, 'UNMATCHED_QUOTES', 0],
    ['blocked filter', fourteen, {}, { protectedLiterals: ['3'] }, 'FILTER_PERMISSION_BLOCKED', 1],
    ['empty filter', '1 3', {}, {}, 'EMPTY_FILTER_RESULT', 1],
]) test(`${label} holds Join and review without publication`, async () => {
    const h = hostHarness(text, extra), result = await runWorkflowForHost(routingGraph(pattern), h.ports, h.hooks);
    assert.equal(result.ok, false); assert.equal(result.error.code, 'UNRESOLVED_INPUT'); assert.equal(result.recording.status, 'unresolved');
    assert.equal(h.effects.filters, executions); assert.equal(h.effects.commits, 0); assert.equal(h.effects.requests, 0); assert.equal(h.settlements.length, 0);
    assert.equal(unit(result, 'join').status, 'unresolved'); assert.equal(unit(result, 'review').status, 'unresolved'); assert.equal(recorded(result, 'join'), undefined);
    const pin = unit(result, executions ? 'filter' : 'pattern').ports.find(pin => pin.direction === 'output' && result.recording.identities.strings[pin.port] === (executions ? 'out' : 'matched'));
    assert.equal(pin.state.reason.code, reason);
});

test('preview and dryRun stay effect-free even with regex detection and native publication selected', async () => {
    for (const flag of ['preview', 'dryRun']) {
        const h = hostHarness(fourteen), result = await runWorkflowForHost(routingGraph({ mode: 'regex' }), { ...h.ports, [flag]: true }, h.hooks);
        assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.preview, true); assert.equal(result.actualCalls, 0);
        assert.deepEqual(h.effects, { workers: 0, captures: 0, requests: 0, commits: 0, bindings: 0, tokens: 0, filters: 0, prepares: 0 });
        assert.ok(result.recording.units.every(unit => unit.status === 'not-run')); assert.equal(result.recording.artifacts.length, 0); assert.equal(h.outputs.length, 0); assert.equal(h.settlements.length, 0);
    }
});

test('explicit rerun captures a new Draft and live report while late settlement still holds publication', async () => {
    const graph = routingGraph(), first = hostHarness(fourteen), second = hostHarness(fourteen);
    const a = await runWorkflowForHost(graph, { ...first.ports, runId: 'pattern-first' }, first.hooks);
    const b = await runWorkflowForHost(graph, { ...second.ports, runId: 'pattern-second' }, second.hooks);
    assert.equal(a.ok, true); assert.equal(b.ok, true); assert.notEqual(a.runId, b.runId);
    const draftA = retained(first.outputs, 'generate', 'draft'), draftB = retained(second.outputs, 'generate', 'draft'), reportA = retained(first.outputs, 'pattern', 'matches'), reportB = retained(second.outputs, 'pattern', 'matches');
    assert.notEqual(draftA, draftB); assert.notEqual(reportA.value, reportB.value); assert.equal(getPatternReportBinding(reportA.value, draftB).error.code, 'STALE_MATCH_REPORT');
    assert.equal(first.effects.captures, 1); assert.equal(second.effects.captures, 1); assert.equal(first.effects.filters, 1); assert.equal(second.effects.filters, 1);
    const stale = hostHarness(fourteen);
    stale.hooks.settle = () => ({ ok: false, error: { code: 'STALE_SOURCE', message: 'Captured reply changed before publication.' } });
    const held = await runWorkflowForHost(graph, stale.ports, stale.hooks);
    assert.equal(held.ok, false); assert.equal(held.error.code, 'STALE_SOURCE'); assert.equal(stale.effects.commits, 0); assert.equal(held.recording.status, 'stale');
});


test('runtime privacy inheritance retains report identity while withholding a private Filter result', async () => {
    const graph = routingGraph(), h = hostHarness(fourteen), host = h.hooks.executeHostOperation;
    graph.nodes.reportBranch = node('reportBranch', 'branch', { artifactKind: 'data' });
    graph.wires.report.to = 'reportBranch'; graph.wires.report.toPort = 'in';
    graph.wires.private = wire('private', 'generate', 'metadata', 'reportBranch', 'condition');
    graph.wires.privateReport = wire('privateReport', 'reportBranch', 'yes', 'filter', 'matches');
    h.hooks.executeHostOperation = current => { const result = host(current); if (current.operation === 'generate-reply') result.outputs.metadata = { kind: 'data', value: true, visibility: { kind: 'actor-private', actorId: 'mara' } }; return result; };
    const result = await runWorkflowForHost(graph, h.ports, h.hooks);
    assert.equal(result.ok, false); assert.equal(result.error.code, 'PRIVATE_MATERIAL'); assert.equal(h.effects.commits, 0);
    const original = retained(h.outputs, 'pattern', 'matches'), routed = retained(h.outputs, 'reportBranch', 'yes');
    assert.notEqual(routed, original); assert.equal(routed.value, original.value); assert.deepEqual(routed.visibility, { kind: 'actor-private', actorId: 'mara' });
    assert.equal(getPatternReportBinding(routed.value, retained(h.outputs, 'generate', 'draft')).ok, true);
    assert.equal(unit(result, 'filter').status, 'failed'); assert.equal(unit(result, 'join').status, 'blocked'); assert.equal(h.effects.filters, 1); assert.equal(h.effects.requests, 0);
});
