import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nodeCard } from '../src/canvas/presentation.js?v=0.27.3';

const node = { id: 'source', type: 'workflow', operation: 'scene-context', x: 10, y: 20 };
const context = graph => ({ graph, multi: new Set(), hooks: {}, labels: {}, icons: {}, preview() { throw new Error('No domain preview during drawing'); } });

test('an unprepared current operation has no catalog fallback renderer', () => {
    assert.throws(() => nodeCard(node, context({ schema: 3, runtime: 2, mode: 'native-pre', nodes: { source: node }, wires: {}, groups: {} })), /prepared/i);
});

test('current metadata cannot prepare retired node types or unnamed routing dots', () => {
    const graph = { schema: 3, runtime: 2, mode: 'native-pre', nodes: {}, wires: {}, groups: {}, nativeCards: {} };
    const old = { ...node, type: 'decider' }; graph.nodes.source = old;
    graph.nativeCards.source = { canonicalTitle: 'Old route', family: 'Organization', iconPath: 'M1 1', body: 'Prepared', ports: [] };
    assert.throws(() => nodeCard(old, context(graph)), /prepared/i);
    graph.nodes.source = node;
    graph.nativeCards.source.ports = [{ id: 'out', dir: 'out', className: 'pc-port pc-port-out', title: 'Old bottom pin' }];
    assert.throws(() => nodeCard(node, context(graph)), /named side pins/i);
});

test('a retired block has no legacy renderer', () => {
    const old = { ...node, type: 'decider', keys: [{ id: 'old', name: 'Old route' }] };
    assert.throws(() => nodeCard(old, context({ schema: 1, nodes: { source: old }, wires: {}, groups: {} })), /prepared/i);
});

test('prepared compact aliases preserve named side pins and host terminal affordance', () => {
    const terminal = { ...node, presentation: { alias: 'Local alias', compact: true } };
    const ports = [{ id: 'in:guidance', port: 'guidance', dir: 'in', side: 'left', row: 1, kind: 'guidance', label: 'Guidance', className: 'pc-port pc-port-in', title: 'Guidance: guidance' }];
    const graph = { schema: 3, runtime: 2, mode: 'native-pre', nodes: { source: terminal }, wires: {}, groups: {}, nativeCards: { source: { canonicalTitle: 'Publish guidance', family: 'Output', iconPath: 'M1 1h2', body: 'Prepared output', hostResult: true, ports } } };
    const card = nodeCard(terminal, context(graph));
    assert.equal(card.title, 'Local alias'); assert.equal(card.titleHint, 'Publish guidance');
    assert.equal(card.compact, true); assert.equal(card.hostResult, true); assert.deepEqual(card.ports, ports);
    assert.ok(card.ports.every(port => port.side === 'left' || port.side === 'right'));
    assert.equal(card.rows, undefined); assert.equal(card.token, undefined);
});

test('unsafe prepared graph metadata rejects before reading a card accessor', () => {
    let reads = 0;
    const graph = { schema: 3, runtime: 2, mode: 'native-pre', nodes: { source: node }, wires: {}, get nativeCards() { reads++; throw new Error('Do not read'); } };
    assert.throws(() => nodeCard(node, context(graph)), /prepared/i); assert.equal(reads, 0);
});

test('visual group metadata does not disable current operations', () => {
    const grouped = { ...node, inGroup: 'visual' }, graph = { schema: 3, runtime: 2, mode: 'native-pre', nodes: { source: grouped }, wires: {}, groups: { visual: { id: 'visual', enabled: false } }, nativeCards: { source: { canonicalTitle: 'Context', family: 'Shaping', iconPath: 'M1 1', body: 'Prepared', ports: [] } } };
    const card = nodeCard(grouped, context(graph)); assert.doesNotMatch(card.className, /pc-off|pc-group-off/); assert.equal(card.offHint, undefined);
});
