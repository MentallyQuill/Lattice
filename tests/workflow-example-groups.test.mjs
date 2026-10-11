import test from 'node:test';
import assert from 'node:assert/strict';
import { REMASTERED_WORKFLOW_EXAMPLE_DATA as entries } from '../src/workflow/remastered-example-data.js';
import { layout } from '../tools/remastered/builder.mjs';
import { portsForNode } from '../src/workflow/catalog.js';

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (frame, node) => frame.x <= node.x && frame.y <= node.y && frame.x + frame.w >= node.x + node.w && frame.y + frame.h >= node.y + node.h;
const processingNodes = graph => Object.values(graph.nodes).filter(node => node.type === 'workflow' || node.type === 'subgraph');
function connected(graph, members) {
    const allowed = new Set(members), visited = new Set([members[0]]), pending = [members[0]];
    while (pending.length) {
        const id = pending.pop();
        for (const wire of Object.values(graph.wires)) {
            if (wire.route !== 'wire' || !allowed.has(wire.from) || !allowed.has(wire.to)) continue;
            const neighbor = wire.from === id ? wire.to : wire.to === id ? wire.from : null;
            if (neighbor && !visited.has(neighbor)) { visited.add(neighbor); pending.push(neighbor); }
        }
    }
    return visited.size === allowed.size;
}
function assertMeaningfulGroups(graph, label) {
    for (const group of Object.values(graph.groups)) {
        assert.ok(group.members.length >= 2, `${label}: ${group.id} groups just one box`);
        assert.ok(connected(graph, group.members), `${label}: ${group.id} contains disconnected work`);
        assert.ok(group.title.trim(), `${label}: group has no purpose`);
        assert.doesNotMatch(group.title, /\d|\/|^(?:stage|preparation|response processing|native generation)$/i, `${label}: group has an arbitrary stage name`);
        assert.ok(group.members.every(id => !['on-send', 'generate-reply', 'review-publish'].includes(graph.nodes[id].operation)), `${label}: ordinary generation or review is hidden in a processing group`);
    }
}
function assertClearGeometry(graph, label) {
    const nodes = Object.values(graph.nodes), groups = Object.values(graph.groups);
    for (let index = 0; index < nodes.length; index++) for (const other of nodes.slice(index + 1)) assert.equal(overlaps(nodes[index], other), false, `${label}: ${nodes[index].id} overlaps ${other.id}`);
    for (let index = 0; index < groups.length; index++) {
        const group = groups[index];
        for (const other of groups.slice(index + 1)) assert.equal(overlaps(group, other), false, `${label}: group frames overlap`);
        for (const node of nodes) {
            if (group.members.includes(node.id)) { assert.equal(node.inGroup, group.id); assert.ok(contains(group, node), `${label}: group misses a member`); }
            else assert.equal(overlaps(group, node), false, `${label}: group covers a nonmember`);
        }
    }
    for (const wire of Object.values(graph.wires).filter(wire => wire.route === 'wire')) assert.ok(graph.nodes[wire.from].x < graph.nodes[wire.to].x, `${label}: wire no longer moves forward`);
}
const behavior = graph => ({
    ...graph,
    groups: undefined,
    nodes: Object.fromEntries(Object.entries(graph.nodes).map(([id, node]) => {
        const { x, y, w, h, inGroup, ...rest } = node;
        return [id, rest];
    })),
});

test('supplied examples group connected pieces of work instead of individual boxes', () => {
    for (const entry of entries) assertMeaningfulGroups(entry.packages[0].graph, entry.id);
});

test('layout makes useful groups while keeping the first lessons simple', () => {
    for (const entry of entries) {
        const graph = structuredClone(entry.packages[0].graph), before = behavior(structuredClone(graph));
        layout(graph);
        assertMeaningfulGroups(graph, entry.id);
        assertClearGeometry(graph, entry.id);
        assert.deepEqual(behavior(graph), before, `${entry.id}: layout changed workflow behavior`);
        if (entry.number <= 8) assert.equal(Object.keys(graph.groups).length, 0, `${entry.id}: beginner lesson is cluttered with groups`);
    }
    const large = structuredClone(entries[28].packages[0].graph);
    layout(large);
    assert.ok(Object.keys(large.groups).length >= 2, 'The large paired-reflection example should separate useful processing systems');
});

test('a tall lesson comment leaves room above every group and card', () => {
    const graph = structuredClone(entries[28].packages[0].graph);
    graph.nodes['lesson-note'].h = 1600;
    layout(graph);
    const bottom = graph.nodes['lesson-note'].y + graph.nodes['lesson-note'].h;
    assert.ok(processingNodes(graph).every(node => node.y >= bottom + 80));
    assertClearGeometry(graph, 'Tall comment');
});

test('reusable helpers contain systems of logic and stay flat inside their boundaries', () => {
    for (const entry of entries) for (const definition of Object.values(entry.packages[0].graph.definitions)) {
        const graph = structuredClone(definition.body);
        assert.ok(Object.values(graph.nodes).filter(node => node.type === 'workflow').length >= 2, `${entry.id}: helper wraps just one processing box`);
        layout(graph);
        assert.equal(Object.keys(graph.groups).length, 0, `${entry.id}: helper has redundant inner groups`);
        assert.ok(Object.values(graph.nodes).every(node => !node.inGroup), `${entry.id}: helper retains stale membership`);
        assertClearGeometry(graph, entry.id + ' helper');
    }
});

test('repeated layout clears obsolete memberships without changing its result', () => {
    const graph = structuredClone(entries[0].packages[0].graph);
    graph.nodes.send.inGroup = 'obsolete';
    graph.groups.obsolete = { id: 'obsolete', members: ['send'] };
    layout(graph);
    assert.ok(Object.values(graph.nodes).every(node => !node.inGroup));
    const once = structuredClone(graph);
    layout(graph);
    assert.deepEqual(graph, once);
});

test('independent inputs sit beside their first consumer instead of spanning the lesson', () => {
    for (const number of [2, 6, 12, 22, 25, 28, 29, 30]) {
        const graph = structuredClone(entries[number - 1].packages[0].graph);
        layout(graph);
        for (const node of Object.values(graph.nodes).filter(node => node.type !== 'note')) {
            const inputs = Object.values(graph.wires).filter(wire => wire.to === node.id);
            const consumers = Object.values(graph.wires).filter(wire => wire.from === node.id).map(wire => graph.nodes[wire.to]);
            if (inputs.length || !consumers.length) continue;
            assert.ok(Math.min(...consumers.map(consumer => consumer.x)) - node.x <= 420,
                `${number}: independent ${node.id} is far from its first consumer`);
        }
        assertClearGeometry(graph, `Lesson ${number}`);
    }
});

function wireSpans(graph) {
    const pin = (id, portId, direction) => {
        const node = graph.nodes[id], ports = portsForNode(graph, node).filter(port => port.direction === direction);
        const row = ports.findIndex(port => port.id === portId);
        assert.ok(row >= 0, `${id}.${portId} is a real pin`);
        return { x: node.x + (direction === 'output' ? node.w + 19 : -19), y: node.y + 40 + row * 24 };
    };
    return Object.values(graph.wires).map(wire => ({ id: wire.id,
        from: pin(wire.from, wire.fromPort, 'output'), to: pin(wire.to, wire.toPort, 'input') }));
}

test('long connections remain distinct instead of sharing a visually merged span', () => {
    for (const number of [22, 24, 29, 30]) {
        const graph = structuredClone(entries[number - 1].packages[0].graph);
        layout(graph);
        const spans = wireSpans(graph), failures = [];
        for (let index = 0; index < spans.length; index++) for (const b of spans.slice(index + 1)) {
            const a = spans[index], left = Math.max(a.from.x, b.from.x), right = Math.min(a.to.x, b.to.x);
            const y = (span, x) => span.from.y + (span.to.y - span.from.y) * (x - span.from.x) / (span.to.x - span.from.x);
            let merged = 0;
            for (let x = left; x < right; x += 8) {
                const slope = (a.to.y - a.from.y) / (a.to.x - a.from.x);
                if (Math.abs(y(a, x) - y(b, x)) / Math.hypot(1, slope) < 6) merged += 8;
            }
            if (merged > 120) failures.push(`${a.id}/${b.id}: ${merged}px`);
        }
        assert.deepEqual(failures, [], `Lesson ${number}: long bundled wires`);
    }
});
