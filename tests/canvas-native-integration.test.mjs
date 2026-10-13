import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, mouse, dom } from './canvas-fixture.mjs';
import { nodeCard } from '../src/canvas/presentation.js?v=0.27.1';
import { createNativeWireBridge } from '../src/ui/native-wire-bridge.js?v=0.27.1';
import { prepareNativeSearchCatalog } from '../src/ui/native-search-catalog.js?v=0.27.1';
import { prepareNativeConnectionEdit } from '../src/workflow/connection-edits.js';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js';

const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
let sequence = 0;
function nativeFixture(options = {}) {
    const root = { id: 'canvas-native-' + ++sequence, schema: 3, runtime: 2, mode: 'native-unified', nodes: {
        source: { id: 'source', type: 'workflow', operation: 'scene-context', x: 20, y: 30 },
        first: { id: 'first', type: 'workflow', operation: 'smart-compactor', x: 320, y: 30 },
        second: { id: 'second', type: 'workflow', operation: 'smart-compactor', x: 600, y: 30 },
    }, wires: {}, portals: {}, definitions: {}, groups: {}, view: { x: 0, y: 0, zoom: 1 } };
    const draw = structuredClone(root), overlays = [], records = new WeakMap(), commands = [], pending = [];
    let editable = options.editable !== false;
    const context = { sessionId: 'canvas', viewPath: [], readOnly: false };
    draw.nativeCards = Object.fromEntries(Object.values(draw.nodes).map(node => [node.id, {
        canonicalTitle: node.id, family: 'Shaping', iconPath: 'M1 1h2', body: 'cached', hostResult: false,
        ports: (node.id === 'source' ? ['out'] : ['in', 'out']).map(dir => ({ id: dir + ':' + dir, port: dir, dir,
            side: dir === 'in' ? 'left' : 'right', row: 1, kind: 'context', label: dir, className: 'pc-port pc-port-' + dir, title: dir + ': context' })),
    }]));
    let bridge;
    const env = fixture({ nativeCard: node => draw.nativeCards[node.id], nativeScope: () => ({ workflowId: root.id, instancePath: [], readOnly: !editable }),
        nativeAttachments: pin => ({ originalBindings: Object.values(root.wires).filter(wire => pin.dir === 'in' ? wire.to === pin.nodeId && wire.toPort === pin.portId : wire.from === pin.nodeId && wire.fromPort === pin.portId).map(wire => ({ kind: 'direct', id: wire.id })), jumps: [] }),
        nativeBridge: () => bridge, canEdit: () => editable, onPresentationChange: ids => overlays.push(ids), ...options.hooks });
    const adapter = {
        capture() { if (!editable) return { ok: false }; const tx = captureGraphEditContext(root, () => context); if (!tx.ok) return tx; const token = {}; records.set(token, tx.data); return { ok: true, data: token }; },
        isCurrent(token) { return editable && records.has(token); },
        prepare(token, command) { commands.push(structuredClone(command)); const result = prepareNativeConnectionEdit(root, { ...command, viewPath: [] });
            return options.defer && commands.length === 1 ? new Promise(resolve => pending.push(() => resolve(result))) : result; },
        commit(token, prepared) { return commitPreparedGraph(root, { ...prepared, context: records.get(token) }); },
    };
    bridge = createNativeWireBridge({ adapter, catalog: prepareNativeSearchCatalog({ schema: 3, runtime: 2, mode: root.mode, workflowId: root.id, viewPath: [], inDefinition: false }).data,
        onUpdate: (view, requests) => env.canvas.updateNativeWire?.(view, requests) });
    env.canvas.setGraph(draw);
    const measure = () => Object.values(draw.nodes).forEach(node => env.canvas.geometry.measure(node.id, 160, 48,
        draw.nativeCards[node.id].ports.map(p => ({ id: p.port, direction: p.dir, x: p.dir === 'in' ? 0 : 160, y: 24, side: p.side, kind: p.kind }))));
    measure();
    const captures = [], releases = [];
    env.host.setPointerCapture = id => captures.push(id);
    env.host.releasePointerCapture = id => releases.push(id);
    const pin = (id, dir) => env.host.querySelector(`.pc-port[data-node="${id}"][data-dir="${dir}"]`);
    return { ...env, root, draw, bridge, commands, pending, overlays, captures, releases, pin, measure, permission(value) { editable = value; } };
}
function pointer(target, type, x, y, options = {}) {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, ...options });
    Object.defineProperties(event, { pointerId: { value: options.pointerId ?? 7 }, pointerType: { value: 'mouse' } });
    target.dispatchEvent(event); return event;
}
function cableFixture(options = {}) {
    const env = nativeFixture(options);
    env.root.wires = { one: { id: 'one', route: 'wire', from: 'source', fromPort: 'out', to: 'first', toPort: 'in' },
        two: { id: 'two', route: 'wire', from: 'source', fromPort: 'out', to: 'second', toPort: 'in' } };
    env.draw.wires = structuredClone(env.root.wires); env.canvas.render(); env.measure();
    mouse(env.host.querySelector('.pc-wire-hit[data-id="one"]'), 'mousedown', 240, 54);
    mouse(env.host.querySelector('.pc-wire-hit[data-id="two"]'), 'mousedown', 400, 54, { ctrlKey: true });
    return env;
}
const selectedCables = env => [...env.host.querySelectorAll('.pc-wire.pc-selected[data-id]')].map(path => path.dataset.id);

test('cached wrapper presentation uses actual named ports and never previews or binds', () => {
    const wrapper = { id: 'wrapper', type: 'subgraph', x: 10, y: 20, presentation: { alias: 'Local alias', compact: true } };
    const ports = [{ id: 'out:result', port: 'result', dir: 'out', side: 'right', row: 1, kind: 'data', label: 'Result', className: 'pc-port pc-port-out', title: 'Result: data' }];
    const card = nodeCard(wrapper, { graph: { schema: 3, runtime: 2, mode: 'native-pre', wires: {}, nodes: { wrapper }, groups: {}, nativeCards: { wrapper: { canonicalTitle: 'Checked wrapper', family: 'Subgraphs', body: 'cached body', iconPath: 'M1 2', ports, hostResult: false } } },
        selection: null, multi: new Set(), hooks: { nativeBinding() { throw new Error('unexpected binding'); } },
        preview() { throw new Error('unexpected preview'); }, labels: {}, icons: {} });
    assert.match(card.className, /pc-node-native/); assert.equal(card.title, 'Local alias'); assert.equal(card.titleHint, 'Checked wrapper');
    assert.deepEqual(card.ports, ports); assert.match(card.className, /pc-family-subgraphs/);
});

test('native rendering preserves saved group frames and empty groups', async () => {
    const env = nativeFixture();
    env.draw.groups = { empty: { id: 'empty', x: 1, y: 1, collapsed: true }, tiny: { id: 'tiny', x: 0, y: 0, frame: { x: 0, y: 0, w: 5, h: 5 } } };
    env.draw.nodes.source.inGroup = 'tiny';
    const before = structuredClone(env.draw.groups); env.canvas.render();
    assert.deepEqual(env.draw.groups, before);
    await env.canvas.destroy();
});

test('readonly native node movement persists only local positions without graph revisions or group movement', async () => {
    const env = nativeFixture({ editable: false });
    const beforeRoot = structuredClone(env.root), revision = env.draw.updatedAt;
    const node = env.host.querySelector('[data-id="source"]');
    mouse(node, 'mousedown', 30, 40); mouse(window, 'mousemove', 50, 70); mouse(window, 'mouseup', 50, 70);
    assert.deepEqual([env.draw.nodes.source.x, env.draw.nodes.source.y], [40, 60]);
    assert.deepEqual(env.overlays, [['source']]); assert.equal(env.draw.updatedAt, revision); assert.deepEqual(env.root, beforeRoot);
    await env.canvas.destroy();
});

test('real Canvas pointer routing captures a native pin and commits through the accepted bridge', async () => {
    const env = nativeFixture();
    const down = pointer(env.pin('source', 'out'), 'pointerdown', 180, 54);
    document.elementFromPoint = () => env.pin('first', 'in');
    pointer(window, 'pointermove', 320, 54); await settle(); pointer(window, 'pointerup', 320, 54); await settle();
    assert.equal(down.defaultPrevented, true); assert.deepEqual(env.captures, [7]); assert.deepEqual(env.releases, [7]);
    assert.equal(Object.values(env.root.wires).length, 1); assert.equal(Object.values(env.root.wires)[0].from, 'source');
    assert.equal(Object.keys(env.draw.wires).length, 0, 'the detached draw is never a commit source');
    assert.deepEqual(env.commands.at(-1), { kind: 'connect', origin: { nodeId: 'source', portId: 'out' }, target: { nodeId: 'first', portId: 'in' }, replace: true });
    assert.equal(env.canvas.hasContentGesture(), false);
    await env.canvas.destroy(); document.elementFromPoint = () => null;
});

test('native empty drop opens captured search and genuine body drop cancels', async () => {
    const env = nativeFixture();
    env.draw.view = { x: 50, y: -20, zoom: 2 };
    pointer(env.pin('source', 'out'), 'pointerdown', 180, 54);
    document.elementFromPoint = () => env.host;
    pointer(window, 'pointerup', 210, 140);
    assert.equal(env.bridge.project().search?.mode, 'nodes'); assert.equal(env.canvas.hasContentGesture(), true);
    assert.deepEqual(env.bridge.project().gesture.ghost, { x: 80, y: 80 });
    const choice = env.bridge.project().search.choices.find(choice => choice.label === 'Smart Compactor');
    env.bridge.actions().search.choose(choice.id); await settle();
    assert.deepEqual(env.commands.at(-1).graphPoint, { x: 80, y: 80 });
    pointer(env.pin('source', 'out'), 'pointerdown', 180, 54);
    document.elementFromPoint = () => env.host.querySelector('[data-id="first"]');
    pointer(window, 'pointerup', 340, 60); await settle();
    assert.equal(env.bridge.project().search, null); assert.equal(env.canvas.hasContentGesture(), false);
    await env.canvas.destroy(); document.elementFromPoint = () => null;
});

test('releasing a connection on comment header padding cancels instead of opening search', async () => {
    const env = nativeFixture();
    try {
        env.draw.nodes.comment = { id: 'comment', type: 'note', commentFrame: true, title: 'Comment', content: '', x: 250, y: 20, w: 360, h: 220 };
        env.draw.nativeCards.comment = { canonicalTitle: 'Comment', family: 'Organization', body: '', ports: [], iconPath: 'M1 1', hostResult: false };
        env.canvas.render(); env.measure();
        pointer(env.pin('source', 'out'), 'pointerdown', 180, 54);
        document.elementFromPoint = () => env.host.querySelector('.pc-comment-header');
        pointer(window, 'pointerup', 255, 25);
        assert.equal(env.bridge.project().search, null);
        assert.equal(env.canvas.hasContentGesture(), false);
        assert.deepEqual(env.commands, []);
    } finally { await env.canvas.destroy(); document.elementFromPoint = () => null; }
});

test('Escape cancels the real native bridge and unexpected native node capture loss restores positions', async () => {
    const env = nativeFixture();
    pointer(env.pin('source', 'out'), 'pointerdown', 180, 54);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    assert.equal(env.canvas.hasContentGesture(), false); assert.deepEqual(env.releases, [7]);
    mouse(env.host.querySelector('[data-id="source"]'), 'mousedown', 30, 40);
    mouse(window, 'mousemove', 50, 70);
    assert.equal(env.canvas.drag?.moved, true, 'Escape must release compatible-mouse suppression for the next gesture');
    assert.deepEqual([env.draw.nodes.source.x, env.draw.nodes.source.y], [40, 60]);
    pointer(env.host, 'lostpointercapture', 50, 70, { buttons: 1 });
    assert.deepEqual([env.draw.nodes.source.x, env.draw.nodes.source.y], [20, 30]);
    await env.canvas.destroy();
});

test('native ghost uses cached named endpoints without layout reads during pointer motion', async () => {
    const env = nativeFixture();
    pointer(env.pin('source', 'out'), 'pointerdown', 180, 54);
    document.elementFromPoint = () => env.host;
    const rect = env.host.getBoundingClientRect;
    env.host.getBoundingClientRect = () => { throw new Error('camera gesture must retain its measured frame'); };
    pointer(window, 'pointermove', 250, 80); env.canvas.frames.flush();
    const route = env.host.querySelector('.pc-wire-ghost')?.getAttribute('d') ?? '';
    assert.match(route, /^M 180,54 C/);
    assert.match(route, /250,80$/);
    env.host.getBoundingClientRect = rect;
    await env.canvas.destroy(); document.elementFromPoint = () => null;
});

test('Ctrl input movement and pin-menu break use real cached attachment IDs through one bridge', async () => {
    const env = nativeFixture();
    env.root.wires.one = { id: 'one', route: 'wire', from: 'source', fromPort: 'out', to: 'first', toPort: 'in', order: 0 };
    env.draw.wires = structuredClone(env.root.wires); env.canvas.render(); env.measure();
    pointer(env.pin('first', 'in'), 'pointerdown', 320, 54, { ctrlKey: true });
    assert.equal(env.bridge.project().gesture.mode, 'move-input');
    document.elementFromPoint = () => env.pin('second', 'in');
    pointer(window, 'pointerup', 600, 54); await settle();
    assert.equal(Object.values(env.root.wires)[0].to, 'second');
    const menuEvent = pointer(env.pin('second', 'in'), 'contextmenu', 600, 54);
    assert.equal(menuEvent.defaultPrevented, true);
    assert.ok(env.bridge.project().menu.entries.find(entry => entry.id === 'cut:one'));
    env.bridge.actions().menu.pick('cut:one'); await settle();
    assert.equal(Object.keys(env.root.wires).length, 0);
    await env.canvas.destroy(); document.elementFromPoint = () => null;
});

test('native wire modifier selection deletes one batch and direct double click prepares reroute', async () => {
    const env = nativeFixture();
    env.root.wires = { one: { id: 'one', route: 'wire', from: 'source', fromPort: 'out', to: 'first', toPort: 'in', order: 0 },
        two: { id: 'two', route: 'wire', from: 'source', fromPort: 'out', to: 'second', toPort: 'in', order: 1 } };
    env.draw.wires = structuredClone(env.root.wires); env.canvas.render(); env.measure();
    mouse(env.host.querySelector('.pc-wire-hit[data-id="one"]'), 'mousedown', 230, 54);
    mouse(env.host.querySelector('.pc-wire-hit[data-id="two"]'), 'mousedown', 460, 54, { ctrlKey: true });
    assert.deepEqual([...env.canvas.wireMulti], ['one', 'two']);
    await env.canvas.deleteSelection(); await settle();
    assert.deepEqual(env.commands.at(-1), { kind: 'disconnect', edgeIds: ['one', 'two'] }); assert.equal(Object.keys(env.root.wires).length, 0);
    env.root.wires.one = { id: 'one', route: 'wire', from: 'source', fromPort: 'out', to: 'first', toPort: 'in', order: 0 };
    env.draw.wires = structuredClone(env.root.wires); env.canvas.render(); env.measure();
    mouse(env.host.querySelector('.pc-wire-hit[data-id="one"]'), 'dblclick', 250, 100); await settle();
    assert.deepEqual(env.commands.at(-1), { kind: 'reroute', edgeId: 'one', graphPoint: { x: 250, y: 100 } });
    assert.ok(Object.values(env.root.nodes).some(node => node.operation === 'reroute'));
    await env.canvas.destroy();
});

test('readonly native raw controls do not change graph documents', async () => {
    const env = nativeFixture({ editable: false }); const before = structuredClone(env.draw);
    pointer(env.pin('source', 'out'), 'pointerdown', 180, 54);
    assert.equal(env.commands.length, 0); assert.equal(env.bridge.hasContentGesture(), false);
    env.draw.groups.g = { id: 'g', frame: { x: 0, y: 0, w: 20, h: 20 } };
    env.canvas.setCollapsed('g', true);
    assert.equal(env.canvas.toggleGroup, undefined); assert.equal(env.canvas.setWireKind, undefined);
    assert.deepEqual(env.draw.nodes, before.nodes); assert.equal(env.draw.groups.g.collapsed, undefined);
    assert.equal(await env.canvas.deleteSelection(), false);
    await env.canvas.destroy();
});

test('native wheel and middle pan preserve document revision and MMB establishes keyboard focus', async () => {
    const env = nativeFixture(); const before = env.draw.updatedAt;
    document.body.focus(); mouse(env.host, 'mousedown', 200, 100, { button: 1 });
    assert.equal(document.activeElement, env.host);
    mouse(window, 'mousemove', 220, 120, { buttons: 4 }); mouse(window, 'mouseup', 220, 120, { button: 1 });
    assert.equal(env.draw.updatedAt, before);
    env.host.dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 200, clientY: 100, deltaY: -100 }));
    window.dispatchEvent(new window.Event('resize')); assert.equal(env.draw.updatedAt, before);
    await env.canvas.destroy();
});

test('released validation survives expected pointer loss and rejects permission changes before settlement', async () => {
    for (const stillEditable of [true, false]) {
        const env = nativeFixture({ defer: true });
        pointer(env.pin('source', 'out'), 'pointerdown', 180, 54);
        document.elementFromPoint = () => env.pin('first', 'in');
        pointer(window, 'pointermove', 320, 54); pointer(window, 'pointerup', 320, 54);
        assert.equal(env.canvas.hasContentGesture(), true); assert.equal(env.bridge.project().gesture.released, true);
        pointer(env.host, 'lostpointercapture', 320, 54, { buttons: 0 });
        assert.equal(env.canvas.hasContentGesture(), true, 'expected release must preserve the pending validation');
        env.permission(stillEditable); env.pending.shift()(); await settle();
        assert.equal(Object.keys(env.root.wires).length, stillEditable ? 1 : 0);
        assert.equal(env.canvas.hasContentGesture(), false);
        await env.canvas.destroy();
    }
    document.elementFromPoint = () => null;
});

test('native Alt wire activation cuts topology and its rapid guard protects a revealed neighbor', async () => {
    const env = nativeFixture();
    env.root.wires = { one: { id: 'one', route: 'wire', from: 'source', fromPort: 'out', to: 'first', toPort: 'in' },
        two: { id: 'two', route: 'wire', from: 'source', fromPort: 'out', to: 'second', toPort: 'in' } };
    env.draw.wires = structuredClone(env.root.wires); env.canvas.render(); env.measure();
    pointer(env.host.querySelector('.pc-wire-hit[data-id="one"]'), 'pointerdown', 240, 54, { altKey: true }); await settle();
    assert.equal(env.root.wires.one, undefined);
    const neighbor = pointer(env.host.querySelector('.pc-wire-hit[data-id="two"]'), 'pointerdown', 400, 54, { altKey: true }); await settle();
    assert.equal(neighbor.defaultPrevented, true); assert.ok(env.root.wires.two); assert.equal(env.commands.length, 1);
    await env.canvas.destroy();
});

test('native wire selection is restored per checked view and reconciles deleted IDs', async () => {
    let path = [];
    const env = nativeFixture({ hooks: { nativeScope: () => ({ workflowId: 'selection-root', instancePath: path, readOnly: false }) } });
    env.draw.wires.one = { id: 'one', route: 'wire', from: 'source', fromPort: 'out', to: 'first', toPort: 'in' };
    env.canvas.wireMulti.add('one');
    path = ['child']; const child = structuredClone(env.draw); child.wires = {}; env.canvas.setGraph(child);
    assert.equal(env.canvas.wireMulti.size, 0);
    path = []; env.canvas.setGraph(env.draw); assert.deepEqual([...env.canvas.wireMulti], ['one']);
    delete env.draw.wires.one; env.canvas.setGraph(env.draw); assert.equal(env.canvas.wireMulti.size, 0);
    await env.canvas.destroy();
});

test('native wire cancellation restores the selection at initiation instead of a prior node gesture', async () => {
    const env = nativeFixture();
    mouse(env.host.querySelector('[data-id="source"]'), 'mousedown', 30, 40); mouse(window, 'mouseup', 30, 40);
    env.canvas.select({ kind: 'node', id: 'first' });
    pointer(env.pin('source', 'out'), 'pointerdown', 180, 54);
    env.canvas.cancelGesture('escape');
    assert.deepEqual(env.canvas.selection, { kind: 'node', id: 'first' });
    await env.canvas.destroy();
});

test('actual cached wrapper cards render named pins and route their cached intrinsic geometry', async () => {
    const env = nativeFixture();
    env.draw.nodes.first.type = 'subgraph'; delete env.draw.nodes.first.operation; env.draw.nodes.first.w = 9999;
    env.draw.nativeCards.first.family = 'Subgraphs';
    env.draw.nativeCards.first.ports = [{ id: 'in:payload', port: 'payload', dir: 'in', side: 'left', row: 1, kind: 'data', label: 'Payload', className: 'pc-port pc-port-in', title: 'Payload: data' },
        { id: 'out:answer', port: 'answer', dir: 'out', side: 'right', row: 1, kind: 'data', label: 'Answer', className: 'pc-port pc-port-out', title: 'Answer: data' }];
    env.canvas.render(); env.measure();
    const card = env.host.querySelector('[data-id="first"]');
    assert.ok(card.classList.contains('pc-node-native')); assert.ok(card.classList.contains('pc-family-subgraphs'));
    assert.deepEqual([...card.querySelectorAll('.pc-port')].map(pin => pin.dataset.port), ['payload', 'answer']);
    assert.equal(env.canvas.widthOf(env.draw.nodes.first), 160);
    assert.deepEqual(env.canvas.endpoint('first', 'out', 'answer'), { id: 'answer', direction: 'out', x: 480, y: 54, side: 'right', kind: 'data' });
    await env.canvas.destroy();
});

test('library inspection never fabricates execution pin addresses and wrapper double click forwards the actual node', async () => {
    const opened = [];
    const env = nativeFixture({ editable: false, hooks: { nativeScope: () => ({ readOnly: true }), onOpen: node => opened.push(node) } });
    env.draw.nodes.first.type = 'subgraph'; delete env.draw.nodes.first.operation;
    env.canvas.render(); env.measure();
    pointer(env.pin('source', 'out'), 'pointerdown', 180, 54);
    assert.equal(env.bridge.project().gesture.kind, 'idle'); assert.equal(env.commands.length, 0);
    mouse(env.host.querySelector('[data-id="first"] .pc-node-title'), 'dblclick', 330, 40);
    assert.deepEqual(opened, [env.draw.nodes.first]);
    await env.canvas.destroy();
});

test('cancelled native node drag restores every selected cable and Delete disconnects the restored batch', async () => {
    const env = cableFixture(), beforeRoot = structuredClone(env.root);
    assert.deepEqual([...env.canvas.wireMulti], ['one', 'two']); assert.deepEqual(selectedCables(env), ['one', 'two']);
    mouse(env.host.querySelector('[data-id="source"]'), 'mousedown', 30, 40);
    mouse(window, 'mousemove', 60, 70);
    assert.equal(env.canvas.drag?.moved, true); assert.equal(env.canvas.wireMulti.size, 0);
    env.canvas.cancelGesture('escape');
    assert.deepEqual([env.draw.nodes.source.x, env.draw.nodes.source.y], [20, 30]);
    assert.deepEqual([...env.canvas.wireMulti], ['one', 'two']); assert.deepEqual(selectedCables(env), ['one', 'two']);
    assert.deepEqual(env.canvas.selection, { kind: 'wire', id: 'two' }); assert.deepEqual(env.root, beforeRoot); assert.equal(env.commands.length, 0);
    await env.canvas.deleteSelection(); await settle();
    assert.deepEqual(env.commands.at(-1), { kind: 'disconnect', edgeIds: ['one', 'two'] }); assert.equal(Object.keys(env.root.wires).length, 0);
    await env.canvas.destroy();
});

test('cancelled marquee and native pin gestures restore the complete cable selection', async () => {
    for (const gesture of ['marquee', 'pin', 'pan']) {
        const env = cableFixture();
        if (gesture === 'marquee') {
            mouse(env.host, 'mousedown', 10, 10); mouse(window, 'mousemove', 200, 100);
            assert.equal(env.canvas.marquee?.moved, true); assert.equal(env.canvas.wireMulti.size, 0);
        } else if (gesture === 'pin') {
            pointer(env.pin('source', 'out'), 'pointerdown', 180, 54);
            assert.equal(env.bridge.project().gesture.kind, 'drag');
        } else {
            mouse(env.host, 'mousedown', 800, 600, { button: 1 }); mouse(window, 'mousemove', 820, 620);
            assert.ok(env.canvas.pan);
        }
        env.canvas.cancelGesture('escape');
        assert.deepEqual([...env.canvas.wireMulti], ['one', 'two']); assert.deepEqual(selectedCables(env), ['one', 'two']);
        assert.deepEqual(env.canvas.selection, { kind: 'wire', id: 'two' }); assert.equal(env.commands.length, 0);
        assert.deepEqual(env.canvas.view, { x: 0, y: 0, zoom: 1 });
        await env.canvas.destroy();
    }
});

test('cancellation reconciles deleted cable IDs and replaces a removed primary with a surviving cable', async () => {
    for (const allRemoved of [false, true]) {
        const env = cableFixture();
        mouse(env.host.querySelector('[data-id="source"]'), 'mousedown', 30, 40); mouse(window, 'mousemove', 60, 70);
        delete env.draw.wires.two; if (allRemoved) delete env.draw.wires.one;
        env.canvas.cancelGesture('escape');
        assert.deepEqual([...env.canvas.wireMulti], allRemoved ? [] : ['one']);
        assert.deepEqual(selectedCables(env), allRemoved ? [] : ['one']);
        assert.deepEqual(env.canvas.selection, allRemoved ? null : { kind: 'wire', id: 'one' });
        assert.equal(env.commands.length, 0);
        await env.canvas.destroy();
    }
});

test('empty clicks and modifier node selection clear cable paint without rebuilding node cards', async () => {
    for (const action of ['empty-click', 'ctrl-node']) {
        let presentations = 0;
        const env = cableFixture({ hooks: { nativeCard() { presentations++; } } });
        const node = env.host.querySelector('[data-id="source"]'), path = env.host.querySelector('.pc-wire[data-id="one"]');
        presentations = 0;
        if (action === 'empty-click') { mouse(env.host, 'mousedown', 900, 700); mouse(window, 'mouseup', 900, 700); }
        else mouse(node, 'mousedown', 30, 40, { ctrlKey: true });
        assert.equal(env.canvas.wireMulti.size, 0); assert.deepEqual(selectedCables(env), []);
        assert.equal(env.host.querySelector('[data-id="source"]'), node); assert.equal(env.host.querySelector('.pc-wire[data-id="one"]'), path);
        assert.equal(presentations, 0, 'selection paint does not re-project node cards'); assert.equal(env.commands.length, 0);
        env.canvas.frames.schedule(2); env.canvas.frames.flush(); assert.deepEqual(selectedCables(env), []);
        await env.canvas.destroy();
    }
});

test('setMulti empty early return clears cable paint restored independently of primary selection', async () => {
    let presentations = 0;
    const env = cableFixture({ hooks: { nativeCard() { presentations++; } } });
    env.canvas.setGraph(env.draw); env.measure();
    assert.equal(env.canvas.selection, null); assert.equal(env.canvas.multi.size, 0);
    assert.deepEqual([...env.canvas.wireMulti], ['one', 'two']); assert.deepEqual(selectedCables(env), ['one', 'two']);
    presentations = 0; env.canvas.setMulti([]);
    assert.equal(env.canvas.wireMulti.size, 0); assert.deepEqual(selectedCables(env), []); assert.equal(presentations, 0);
    env.canvas.setMulti([]); assert.deepEqual(selectedCables(env), []);
    assert.equal(env.commands.length, 0); await env.canvas.destroy();
});

test('idle cancellation clears a painted ghost before its queued cleanup frame without rebuilding cards', async () => {
    let presentations = 0;
    const env = nativeFixture({ hooks: { nativeCard() { presentations++; } } });
    try {
        const card = env.host.querySelector('[data-id="first"]'); presentations = 0;
        pointer(env.pin('source', 'out'), 'pointerdown', 180, 54);
        document.elementFromPoint = () => env.host; pointer(window, 'pointermove', 250, 80); env.canvas.frames.flush();
        assert.ok(env.host.querySelector('.pc-wire-ghost')); assert.ok(env.pin('source', 'out').classList.contains('pc-pin-highlight'));
        document.elementFromPoint = () => card; pointer(window, 'pointerup', 340, 60);
        assert.equal(env.bridge.hasContentGesture(), false);
        presentations = 0;
        env.canvas.cancelGesture(); env.canvas.select({ kind: 'node', id: 'first' });
        assert.equal(env.host.querySelector('.pc-wire-ghost'), null);
        assert.equal(env.pin('source', 'out').classList.contains('pc-pin-highlight'), false);
        assert.equal(env.host.querySelector('[data-id="first"]'), card); assert.equal(presentations, 0); assert.equal(env.commands.length, 0);
    } finally { await env.canvas.destroy(); document.elementFromPoint = () => null; }
});
