import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as catalog from '../src/workflow/catalog.js';
import { isWorkflowGraph, validateGraphStructure, validateWorkflow } from '../src/workflow/contracts.js';
import { resolveWorkflow } from '../src/workflow/resolve.js';

const node = (id, operation, settings = {}) => ({ id, type: 'workflow', operation, ...settings });
const wire = (id, from, to, toPort = 'in', fromPort = 'out') => ({ id, route: 'wire', from, fromPort, to, toPort });
const graph = (mode = 'native-unified', nodes = {}, wires = {}) => ({ id: 'unified', schema: 3, runtime: 2, mode, nodes, wires, definitions: {}, portals: {} });
const mixed = () => graph('native-unified', {
    context: node('context', 'scene-context'), compact: node('compact', 'smart-compactor'),
    plan: node('plan', 'response-plan'), guidance: node('guidance', 'guidance'),
    reply: node('reply', 'reply-snapshot'), scan: node('scan', 'pattern-scan'),
    repair: node('repair', 'repair', { mode: 'scan' }), validated: node('validated', 'validate-patches'),
    review: node('review', 'review-gate'), apply: node('apply', 'apply-reply'),
}, {
    a: wire('a', 'context', 'compact'), b: wire('b', 'compact', 'plan'), c: wire('c', 'plan', 'guidance'),
    d: wire('d', 'reply', 'scan'), e: wire('e', 'scan', 'repair'), f: wire('f', 'repair', 'validated'),
    g: wire('g', 'validated', 'review'), h: wire('h', 'review', 'apply'),
});

test('unified schema3 roots admit mixed pre and post operations with per-node phases', () => {
    const g = mixed();
    const structure = validateGraphStructure(g);
    assert.equal(structure.ok, true, JSON.stringify(structure));
    assert.equal(isWorkflowGraph(g), true);
    const result = validateWorkflow(g);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.phase, 'unified');
    for (const unit of result.data.primitives) {
        const phase = ['context', 'compact', 'plan', 'guidance'].includes(unit.node.id) ? 'pre' : 'post';
        assert.equal(unit.phase, phase, unit.node.id);
        assert.equal(catalog.phaseForNode(g, g.nodes[unit.node.id]), phase);
        assert.equal(result.data.units.find(item => item.address.nodeId === unit.node.id).phase, phase);
    }
    const guidance = catalog.describeOperation(g, g.nodes.guidance);
    assert.equal(guidance.data.descriptor.terminal, false);
    assert.deepEqual(guidance.data.ports.map(port => [port.id, port.kind, port.direction]), [['in', 'guidance', 'input'], ['out', 'guidance', 'output']]);
    assert.deepEqual(result.data.terminals.map(item => item.address.nodeId), ['apply']);
});
import { computeDefinitionIdentity, definitionRefKey, validateDefinition } from '../src/workflow/definitions.js';

const definition = (id, phase, operation, kind) => {
    const draft = { id, version: 1, name: id, parameters: [], interface: [
        { id: 'input', label: 'Input', direction: 'input', kind, required: true, cardinality: 'one', boundaryNodeId: 'entry' },
        { id: 'output', label: 'Output', direction: 'output', kind, required: false, cardinality: 'one', boundaryNodeId: 'exit' },
    ], body: graph(`native-${phase}`, {
        entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'input' },
        work: node('work', operation), exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'output' },
    }, { a: wire('a', 'entry', 'work'), b: wire('b', 'work', 'exit') }) };
    delete draft.body.definitions;
    const identity = computeDefinitionIdentity(draft);
    assert.equal(identity.ok, true, JSON.stringify(identity));
    return { ...structuredClone(identity.data.materializedDefinition), semanticHash: identity.data.semanticHash };
};
const instance = (id, snapshot) => ({ id, type: 'subgraph', definition: { id: snapshot.id, version: snapshot.version, semanticHash: snapshot.semanticHash }, parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {} });

test('unified roots compose compatible pinned pre and post definitions', () => {
    const pre = definition('pre-helper', 'pre', 'smart-compactor', 'context');
    const post = definition('post-helper', 'post', 'pattern-scan', 'draft');
    const g = mixed();
    g.definitions = { [definitionRefKey(pre)]: pre, [definitionRefKey(post)]: post };
    g.nodes.compact = instance('compact', pre); g.wires.a.toPort = 'input'; g.wires.b.fromPort = 'output';
    g.nodes.scan = instance('scan', post); g.wires.d.toPort = 'input'; g.wires.e.fromPort = 'output';
    const result = resolveWorkflow(g);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.primitives.find(unit => unit.address.instancePath[0] === 'compact').phase, 'pre');
    assert.equal(result.data.primitives.find(unit => unit.address.instancePath[0] === 'scan').phase, 'post');
    assert.deepEqual(g.definitions[definitionRefKey(pre)], pre, 'planning preserves pinned bodies');
    g.mode = 'native-pre';
    assert.equal(validateGraphStructure(g).error.code, 'WRONG_PHASE', 'legacy roots retain same-phase composition');
});
import { exportWorkflow, parseWorkflow } from '../src/workflow/packages.js';
import { parseRunPlan } from '../src/workflow/record-data.js';

test('unified inventory remains safe recording data with effective unit phases', () => {
    const result = resolveWorkflow(mixed());
    const parsed = parseRunPlan(result.data);
    assert.ok(parsed, 'record admission accepts a unified root phase');
    assert.equal(parsed.phase, 'unified');
    assert.deepEqual(parsed.units.map(unit => unit.phase), result.data.units.map(unit => unit.phase));
    const bad = structuredClone(result.data); bad.units[0].phase = 'unified';
    assert.equal(parseRunPlan(bad), null, 'operation phases remain pre/post');
});

test('unified portable roundtrip retains mode-dependent controls and profile redaction', () => {
    const g = mixed();
    g.nodes.memory = node('memory', 'memory', { mode: 'commit', idempotencyKey: 'unified-key', profileId: 'private-profile' });
    const envelope = exportWorkflow(g), result = parseWorkflow(JSON.stringify(envelope));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.mode, 'native-unified');
    assert.equal(result.data.nodes.memory.mode, 'commit');
    assert.equal(result.data.nodes.memory.idempotencyKey, 'unified-key');
    assert.equal(result.data.nodes.memory.profileId, null);
    assert.equal(g.nodes.memory.profileId, 'private-profile');
});

test('explicit phases cannot contradict fixed operations in any admitted mode', () => {
    for (const [operation, settings, conflict] of [
        ['scene-context', {}, 'post'], ['reply-snapshot', {}, 'pre'], ['repair', {}, 'pre'],
        ['guidance', {}, 'post'], ['compose', { outputKind: 'guidance' }, 'post'],
        ['text-rules', { inputKind: 'draft' }, 'pre'], ['memory', { mode: 'commit', idempotencyKey: 'key' }, 'pre'],
        ['terminology-map', {}, 'pre'],
    ]) {
        const n = node('work', operation, { ...settings, phase: conflict });
        for (const mode of ['native-unified', 'native-pre', 'native-post']) {
            const g = graph(mode, { work: n });
            assert.equal(catalog.phaseForNode(g, n), null, operation + mode);
            assert.equal(validateGraphStructure(g).error.code, 'WRONG_PHASE', operation + mode);
        }
    }
    const g = graph('native-unified', { work: node('work', 'text', { phase: 'post', text: 'after' }) });
    assert.equal(catalog.describeOperation(g, g.nodes.work).data.descriptor.phase, 'post');
    assert.equal(validateWorkflow(mixed(), { phase: 'pre' }).error.code, 'WRONG_PHASE');
    assert.equal(validateWorkflow(mixed(), { phase: 'unified' }).ok, true);
});

test('unified metadata getters and unknown runtime fail without invoking accessors', () => {
    let reads = 0;
    const getter = { enumerable: true, get() { reads++; throw new Error('getter'); } };
    const g = mixed(); Object.defineProperty(g.nodes.repair, 'phase', getter);
    assert.equal(catalog.phaseForNode(g, g.nodes.repair), null);
    assert.equal(catalog.describeOperation(g, g.nodes.repair).ok, false);
    assert.equal(validateGraphStructure(g).error.code, 'MALFORMED_WORKFLOW');
    const operationGetter = node('bad', 'repair'); Object.defineProperty(operationGetter, 'operation', getter);
    assert.equal(catalog.phaseForNode(mixed(), operationGetter), null);
    assert.equal(catalog.operationFor(operationGetter), null);
    const future = mixed(); future.runtime = 3;
    assert.equal(isWorkflowGraph(future), false);
    assert.equal(validateGraphStructure(future).error.code, 'UNSUPPORTED_VERSION');
    assert.equal(parseWorkflow(JSON.stringify({ kind: 'lattice-workflow', schema: 2, minRuntime: 2, graph: future })).error.code, 'UNSUPPORTED_VERSION');
    assert.equal(reads, 0);
});

test('unified definition bodies hash effective phases and admit ordinary host operations', () => {
    const draft = { id: 'unified-helper', version: 1, name: 'Unified helper', parameters: [], interface: [
        { id: 'input', label: 'Input', direction: 'input', kind: 'text', required: true, cardinality: 'one', boundaryNodeId: 'entry' },
        { id: 'output', label: 'Output', direction: 'output', kind: 'text', required: false, cardinality: 'one', boundaryNodeId: 'exit' },
    ], body: graph('native-unified', {
        entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'input' },
        first: node('first', 'text-rules', { phase: 'pre' }), second: node('second', 'text-rules', { phase: 'post' }),
        exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'output' },
    }, { a: wire('a', 'entry', 'first'), b: wire('b', 'first', 'second'), c: wire('c', 'second', 'exit') }) };
    delete draft.body.definitions;
    const identity = computeDefinitionIdentity(draft);
    assert.equal(identity.ok, true, JSON.stringify(identity));
    const snapshot = { ...structuredClone(identity.data.materializedDefinition), semanticHash: identity.data.semanticHash };
    assert.equal(validateDefinition(snapshot).ok, true);
    const changed = structuredClone(draft); changed.body.nodes.second.phase = 'pre';
    assert.notEqual(computeDefinitionIdentity(changed).data.semanticHash, identity.data.semanticHash, 'effective phases are semantic within unified definitions');
    const g = graph('native-unified', { source: node('source', 'text', { text: 'value' }), helper: instance('helper', snapshot) }, { a: wire('a', 'source', 'helper', 'input') });
    g.definitions[definitionRefKey(snapshot)] = snapshot;
    const result = resolveWorkflow(g, { target: { workflowId: g.id, instancePath: [], nodeId: 'helper', portId: 'output' } });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.data.primitives.filter(unit => unit.address.instancePath.length).map(unit => unit.phase), ['pre', 'post']);
    const roundtrip = parseWorkflow(JSON.stringify(exportWorkflow(g)));
    assert.equal(roundtrip.ok, true, JSON.stringify(roundtrip));
    assert.equal(Object.values(roundtrip.data.definitions)[0].semanticHash, snapshot.semanticHash);
    for (const operation of ['scene-context', 'reply-snapshot', 'guidance', 'apply-reply', 'prompt-source']) {
        const hosted = structuredClone(draft); hosted.body.nodes.host = node('host', operation);
        const hashed = computeDefinitionIdentity(hosted);
        assert.equal(hashed.ok, true, operation + JSON.stringify(hashed));
        const staticDefinition = { ...structuredClone(hashed.data.materializedDefinition), semanticHash: hashed.data.semanticHash };
        assert.equal(validateDefinition(staticDefinition).ok, true, operation);
    }
});

test('unified typed dependencies and cycles reject invalid authoring before closure selection', () => {
    const incompatible = mixed(); incompatible.wires.c.from = 'reply';
    assert.equal(validateGraphStructure(incompatible).error.code, 'ARTIFACT_KIND');
    const crossPhaseCycle = graph('native-unified', { first: node('first', 'text-rules', { phase: 'pre' }), second: node('second', 'text-rules', { phase: 'post' }) }, { a: wire('a', 'first', 'second'), b: wire('b', 'second', 'first') });
    assert.equal(validateGraphStructure(crossPhaseCycle).error.code, 'CYCLE');
    const guided = graph('native-unified', { plan: node('plan', 'compose', { outputKind: 'guidance' }), guide: node('guide', 'guidance'), onward: node('onward', 'reroute', { phase: 'pre', artifactKind: 'guidance' }) }, { a: wire('a', 'plan', 'guide'), b: wire('b', 'guide', 'onward') });
    const result = resolveWorkflow(guided, { target: { workflowId: guided.id, instancePath: [], nodeId: 'onward', portId: 'out' } });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.data.primitives.filter(unit => unit.included).map(unit => unit.node.id), ['plan', 'guide', 'onward']);
    assert.equal(resolveWorkflow(guided).error.code, 'MISSING_TERMINAL', 'Guidance is composable and requires a final terminal in unified root plans');
    guided.mode = 'native-pre'; delete guided.nodes.onward; delete guided.wires.b;
    const legacy = resolveWorkflow(guided);
    assert.equal(legacy.ok, true);
    assert.deepEqual(catalog.portsForNode(guided, guided.nodes.guide).map(port => port.id), ['in']);
    assert.deepEqual(legacy.data.terminals.map(item => item.address.nodeId), ['guide']);
});

test('direct effective operation projection rejects Context Join getters without evaluating them', () => {
    for (const field of ['inputs','operationVersion']) {
        let reads=0;
        const malformed=node('join','context-join');
        Object.defineProperty(malformed,field,{enumerable:true,get(){reads++;return field==='inputs'?[]:1;}});
        assert.equal(catalog.operationFor(malformed,{phase:'pre'}),null);
        assert.equal(reads,0);
    }
});

