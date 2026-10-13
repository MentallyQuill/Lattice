import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareNativeSearchCatalog } from '../src/ui/native-search-catalog.js?v=0.27.1';
import { prepareNativeConnectionEdit } from '../src/workflow/connection-edits.js';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js';
import { createGraphViewSession } from '../src/ui/graph-view-session.js';
import { createConfiguredNodeSession, configuredCreationStage, nodeNeedsConfiguration } from '../src/ui/configured-node-creation.js';
import { phaseForNode, portsForNode } from '../src/workflow/catalog.js';
import { graphPoint } from '../src/canvas/camera.js';
import * as history from '../src/history.js?v=0.27.1';
const api = await import('../src/ui/native-wire-bridge.js').catch(() => ({}));
let rootSequence = 0;
const fixture = () => ({ id: 'bridge-root-' + ++rootSequence, schema: 3, runtime: 2, mode: 'native-unified', nodes: {
    source: { id: 'source', type: 'workflow', operation: 'scene-context' }, alternate: { id: 'alternate', type: 'workflow', operation: 'scene-context' },
    first: { id: 'first', type: 'workflow', operation: 'smart-compactor' }, second: { id: 'second', type: 'workflow', operation: 'smart-compactor' },
}, wires: {}, portals: {}, definitions: {}, groups: {} });
const catalogFor = (root, viewPath = []) => prepareNativeSearchCatalog({ schema: root.schema, runtime: root.runtime, mode: root.mode, workflowId: root.id, viewPath, inDefinition: viewPath.length > 0 }).data;
const pin = (root, nodeId, dir = 'out', kind = 'context', portId = dir === 'out' ? 'out' : 'in', instancePath = []) => ({ nodeId, portId, dir, kind, center: { x: 21, y: 37 }, address: { workflowId: root.id, instancePath, nodeId, portId } });
const hit = value => ({ kind: 'pin', pin: value });
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function setup(root = fixture(), options = {}) {
    assert.equal(typeof api.createNativeWireBridge, 'function');
    const counts = { capture: 0, current: 0, prepare: 0, commit: 0, jump: 0 }, commands = [], pending = [], records = new WeakMap();
    const viewPath = options.viewPath ?? [], context = { sessionId: 'session', viewPath, readOnly: !!options.readOnly };
    let revision = 0;
    const adapter = {
        capture() {
            counts.capture++;
            const tx = captureGraphEditContext(root, () => context);
            if (!tx.ok) return tx;
            const capture = new Proxy({}, { get() { throw new Error('opaque get'); }, ownKeys() { throw new Error('opaque keys'); }, getPrototypeOf() { throw new Error('opaque prototype'); }, preventExtensions() { throw new Error('opaque freeze'); } });
            records.set(capture, { tx: tx.data, revision, editor: options.session?.captureEditorContext() });
            return { ok: true, data: capture };
        },
        isCurrent(capture) { counts.current++; const saved = records.get(capture); return !!saved && saved.revision === revision && !context.readOnly && (!options.session || options.session.isEditorContextCurrent(saved.editor)); },
        prepare(capture, command) {
            counts.prepare++; commands.push(structuredClone(command));
            let result;
            if (command.kind === 'create' && nodeNeedsConfiguration(command.operation, command.controls)) {
                assert.equal(command.requiresConfiguration, true, 'covered catalog packets request validated configuration');
                const origin = command.connection?.origin, originNode = origin && root.nodes[origin.nodeId];
                const originPort = originNode && portsForNode(root, originNode).find(port => port.id === origin.portId);
                const stage = configuredCreationStage(command.operation, root.mode, originNode && phaseForNode(root, originNode), viewPath.length > 0, command.controls);
                const configured = createConfiguredNodeSession({ isCurrent: saved => adapter.isCurrent(saved),
                    prepare: (saved, candidate) => prepareNativeConnectionEdit(root, { ...candidate, viewPath }) });
                const opened = configured.open(capture, command, { ...stage, targets: [], helpers: [],
                    ...(originPort ? { originKind: originPort.kind, originDirection: originPort.direction === 'input' ? 'in' : 'out' } : {}) });
                const applied = configured.apply(opened.view.key, opened.view.controls, opened.view.phase);
                result = applied.ok ? opened.result : applied;
            } else result = prepareNativeConnectionEdit(root, { ...command, viewPath });
            if (options.defer && counts.prepare === 1) return new Promise(resolve => pending.push(() => resolve(result)));
            return result;
        },
        commit(capture, prepared) { counts.commit++; return commitPreparedGraph(root, { ...prepared, context: records.get(capture).tx }); },
        jump() { counts.jump++; },
    };
    const updates = [];
    const bridge = api.createNativeWireBridge({ adapter, catalog: catalogFor(root, viewPath), onUpdate: (view, requests) => updates.push({ view, requests }) });
    return { bridge, root, counts, commands, pending, updates, adapter, context, stale() { revision++; } };
}
function begin(env, origin, originalBindings = [], ctrl = false) {
    return env.bridge.dispatch({ type: 'begin-pin', pin: origin, pointerId: 1, graphPoint: { x: 6, y: 7 }, originalBindings, ctrl });
}
function move(env, target) { return env.bridge.dispatch({ type: 'pointer-move', pointerId: 1, graphPoint: { x: 15, y: 19 }, hit: hit(target) }); }
function release(env, target) { return env.bridge.dispatch({ type: 'release', pointerId: 1, graphPoint: { x: 15, y: 19 }, hit: hit(target) }); }
function search(env, origin = pin(env.root, 'source'), point = { x: -103.125, y: 71.75 }) {
    begin(env, origin);
    env.bridge.dispatch({ type: 'release', pointerId: 1, graphPoint: point, screenAnchor: { x: 999, y: 720 }, hit: { kind: 'empty' } });
    return env.bridge.actions().search;
}

test('one real reducer translates both directions and previews only changed actual pins', async () => {
    for (const reverse of [false, true]) {
        const env = setup(), out = pin(env.root, 'source'), input = pin(env.root, 'first', 'in');
        const start = begin(env, reverse ? input : out);
        assert.deepEqual(start.requests, [{ type: 'capture-pointer', pointerId: 1 }]);
        const counts = { ...env.counts };
        for (let i = 0; i < 5; i++) env.bridge.dispatch({ type: 'pointer-move', pointerId: 1, graphPoint: { x: i, y: i }, hit: { kind: 'empty' } });
        assert.deepEqual(env.counts, counts, 'empty moves do not call any adapter');
        move(env, reverse ? out : input); await settle();
        assert.equal(env.counts.prepare, 1); assert.equal(env.counts.commit, 0);
        const unchanged = { ...env.counts }; move(env, reverse ? out : input); assert.deepEqual(env.counts, unchanged);
        release(env, reverse ? out : input); await settle();
        assert.equal(env.counts.capture, 1); assert.equal(env.counts.prepare, 2); assert.equal(env.counts.commit, 1);
        assert.deepEqual(env.commands[1], { kind: 'connect', origin: { nodeId: 'source', portId: 'out' }, target: { nodeId: 'first', portId: 'in' }, replace: true });
        assert.equal(Object.values(env.root.wires)[0].from, 'source'); assert.equal(env.bridge.project().gesture.kind, 'idle');
        assert.equal(JSON.stringify(env.bridge.project()).includes('capture'), false);
    }
});

test('release before validation and expected capture loss preserve pending draft and commit once', async () => {
    const env = setup(fixture(), { defer: true }), input = pin(env.root, 'first', 'in');
    begin(env, pin(env.root, 'source')); move(env, input);
    const released = release(env, input);
    assert.equal(released.view.gesture.released, true); assert.equal(env.counts.prepare, 1);
    env.bridge.dispatch({ type: 'capture-lost', pointerId: 1, buttons: 0 });
    assert.equal(env.bridge.project().gesture.kind, 'drag'); assert.equal(env.counts.commit, 0);
    env.pending.shift()(); await settle();
    assert.equal(env.counts.commit, 1); assert.equal(env.counts.prepare, 2); assert.equal(env.bridge.hasContentGesture(), false);
});

test('a stale matching validation cancels only its pending gesture and an old result cannot affect a newer capture', async () => {
    const env = setup(fixture(), { defer: true }), input = pin(env.root, 'first', 'in');
    begin(env, pin(env.root, 'source')); move(env, input); release(env, input); env.stale();
    env.pending.shift()(); await settle();
    assert.equal(env.counts.commit, 0); assert.equal(env.bridge.hasContentGesture(), false);
    const next = setup(fixture(), { defer: true }); begin(next, pin(next.root, 'source')); move(next, pin(next.root, 'first', 'in'));
    next.bridge.cancel('escape'); begin(next, pin(next.root, 'alternate'));
    next.pending.shift()(); await settle();
    assert.equal(next.bridge.project().gesture.origin.nodeId, 'alternate'); assert.equal(next.counts.commit, 0);
});

test('retained search keeps exact captured graph point, chooses multiple actual ports and commits one create/connect history step', async () => {
    const env = setup(); history.track(env.root); const before = structuredClone(env.root);
    const actions = search(env);
    env.bridge.dispatch({ type: 'capture-lost', pointerId: 1, buttons: 0 });
    assert.equal(env.bridge.hasContentGesture(), true);
    actions.choose('operation:context-join');
    assert.equal(env.bridge.project().search.mode, 'ports');
    assert.deepEqual(env.bridge.project().search.ports.map(p => p.portId), ['context-1', 'context-2']);
    env.bridge.actions().search.choosePort('context-2'); await settle();
    assert.equal(env.counts.commit, 1); assert.equal(env.counts.prepare, 1);
    const added = Object.values(env.root.nodes).find(n => !before.nodes[n.id]);
    assert.deepEqual([added.x, added.y], [-103.125, 71.75]);
    assert.equal(Object.values(env.root.wires)[0].toPort, 'context-2');
    assert.ok(history.undo(env.root)); assert.deepEqual(env.root, before); assert.equal(history.undo(env.root), null);
});

test('context-off creates an incompatible valid node unconnected; old same-ID actions cannot retarget reopened search', async () => {
    const env = setup(), old = search(env);
    old.setContextSensitive(false); old.choose('operation:json-decode:check'); await settle();
    assert.equal(env.counts.commit, 1); assert.equal(Object.keys(env.root.wires).length, 0);
    const latest = search(env, pin(env.root, 'alternate'));
    const count = env.counts.prepare; old.choose('operation:context-join'); old.setContextSensitive(false);
    assert.equal(env.counts.prepare, count); assert.equal(env.bridge.project().search.contextSensitive, true);
    latest.choose('operation:smart-compactor'); await settle();
    assert.equal(Object.values(env.root.wires)[0].from, 'alternate');
});

test('blank search has no fabricated origin or draft and readonly/schema-2 initiation fails before preparation', async () => {
    const env = setup(); env.bridge.openUnconnectedSearch({ graphPoint: { x: 9.5, y: -2 }, screenAnchor: { x: 340, y: 210 } });
    assert.equal(env.bridge.project().gesture.kind, 'idle'); assert.equal(env.bridge.project().search.origin, null);
    env.bridge.actions().search.choose('operation:compose:input'); await settle();
    assert.equal(env.counts.prepare, 1); assert.equal(Object.hasOwn(env.commands[0], 'connection'), false);
    const locked = setup(fixture(), { readOnly: true }); begin(locked, pin(locked.root, 'source'));
    assert.equal(locked.bridge.hasContentGesture(), false); assert.equal(locked.counts.prepare, 0);
    const oldRoot = fixture(); oldRoot.schema = 2; oldRoot.runtime = 1;
    const oldBridge = api.createNativeWireBridge({ adapter: env.adapter, catalog: catalogFor(oldRoot) });
    oldBridge.dispatch({ type: 'begin-pin', pin: pin(oldRoot, 'source'), pointerId: 1, graphPoint: { x: 0, y: 0 }, originalBindings: [] });
    assert.equal(env.counts.capture, 1, 'unsupported schema does not enter the native bridge');
});

test('wrong root/path pins reject before preparation and a nonexistent qualified child cannot be captured', () => {
    const env = setup(), foreign = pin(env.root, 'source'); foreign.address.workflowId = 'other';
    begin(env, foreign); assert.equal(env.counts.capture, 0);
    begin(env, pin(env.root, 'source')); move(env, pin(env.root, 'first', 'in', 'context', 'in', ['child']));
    assert.equal(env.counts.prepare, 0); assert.equal(env.bridge.project().gesture.feedback.compatible, false);
    const child = setup(fixture(), { viewPath: ['instance'] }); begin(child, pin(child.root, 'first', 'out', 'context', 'out', ['instance']));
    assert.equal(child.counts.capture, 1); assert.equal(child.counts.prepare, 0); assert.equal(child.counts.commit, 0); assert.equal(child.bridge.hasContentGesture(), false); assert.match(child.bridge.project().feedback, /view.*unavailable/i);
});

test('compatible duplicate drops clear the draft without commit/history and invalid cycle retains original bindings', async () => {
    const root = fixture(); root.wires.e = { id: 'e', route: 'wire', from: 'source', fromPort: 'out', to: 'first', toPort: 'in' };
    const env = setup(root); history.track(root); const before = structuredClone(root);
    begin(env, pin(root, 'source')); const input = pin(root, 'first', 'in'); move(env, input); await settle(); release(env, input); await settle();
    assert.equal(env.counts.commit, 0); assert.equal(history.undo(root), null); assert.deepEqual(root, before);
    begin(env, pin(root, 'first')); move(env, input); await settle(); release(env, input); await settle();
    assert.equal(env.counts.commit, 0); assert.deepEqual(root, before);
});

test('Ctrl input keeps portal route identity and output moves every ordinary and publisher source', async () => {
    for (const mode of ['input', 'output']) {
        const root = fixture(); root.portals.named = { id: 'named', label: 'Named', kind: 'context', source: { nodeId: 'source', portId: 'out' } };
        root.portals.unused = { id: 'unused', label: 'Unused', kind: 'context', source: { nodeId: 'source', portId: 'out' } };
        root.wires.hidden = { id: 'hidden', route: 'portal', portalId: 'named', to: 'first', toPort: 'in', order: 7 };
        root.wires.direct = { id: 'direct', route: 'wire', from: 'source', fromPort: 'out', to: 'second', toPort: 'in' };
        const env = setup(root), origin = pin(root, mode === 'input' ? 'first' : 'source', mode === 'input' ? 'in' : 'out');
        const target = pin(root, mode === 'input' ? 'second' : 'alternate', mode === 'input' ? 'in' : 'out');
        begin(env, origin, [{ kind: 'portal', id: 'hidden', portalId: 'named' }, ...(mode === 'output' ? [{ kind: 'direct', id: 'direct' }, { kind: 'portal-publisher', portalId: 'unused' }] : [])], true);
        move(env, target); await settle(); release(env, target); await settle();
        assert.equal(env.counts.commit, 1);
        assert.equal(root.wires.hidden.portalId, 'named'); assert.equal(root.wires.hidden.order, 7);
        if (mode === 'input') { assert.equal(root.wires.hidden.to, 'second'); assert.equal(Object.hasOwn(root.wires, 'direct'), false); }
        else { assert.equal(root.wires.direct.from, 'alternate'); for (const publisher of Object.values(root.portals)) assert.equal(publisher.source.nodeId, 'alternate'); }
    }
});

test('pin menu ordinary cuts retain publishers while explicit remove and restore use approved producer policies', async () => {
    for (const entry of ['break-all', 'remove-publishers', 'restore-publisher:named']) {
        const root = fixture(); root.portals.named = { id: 'named', label: 'Named', kind: 'context', source: { nodeId: 'source', portId: 'out' } };
        root.wires.hidden = { id: 'hidden', route: 'portal', portalId: 'named', to: 'first', toPort: 'in' };
        const env = setup(root);
        env.bridge.openPinMenu({ pin: pin(root, 'source'), screenAnchor: { x: 900, y: 90 }, originalBindings: [{ kind: 'portal', id: 'hidden', portalId: 'named' }, { kind: 'portal-publisher', portalId: 'named' }] });
        assert.ok(env.bridge.project().menu.entries.find(item => item.id === entry));
        env.bridge.actions().menu.pick(entry); await settle();
        assert.equal(env.counts.commit, 1);
        if (entry === 'break-all') { assert.ok(root.portals.named); assert.equal(Object.keys(root.wires).length, 0); }
        if (entry === 'remove-publishers') { assert.equal(Object.keys(root.portals).length, 0); assert.equal(Object.keys(root.wires).length, 0); }
        if (entry.startsWith('restore')) { assert.equal(Object.keys(root.portals).length, 0); assert.equal(root.wires.hidden.route, 'wire'); assert.equal(root.wires.hidden.from, 'source'); }
    }
});

test('readonly menu navigation uses only a navigation capability and raw edit/old callback dispatch cannot mutate', () => {
    const root = fixture(), counts = { prepare: 0, commit: 0, jump: 0 }, caps = new WeakSet();
    const adapter = { capture: () => ({ ok: false, error: { code: 'READ_ONLY_VIEW', message: 'Read only' } }), captureNavigation() { const token = new Proxy({}, { get() { throw Error('opaque'); }, ownKeys() { throw Error('opaque'); } }); caps.add(token); return { ok: true, data: token }; },
        isCurrent: token => caps.has(token), prepare() { counts.prepare++; }, commit() { counts.commit++; }, jump() { counts.jump++; } };
    const bridge = api.createNativeWireBridge({ adapter, catalog: catalogFor(root) });
    const input = { pin: pin(root, 'source'), screenAnchor: { x: 30, y: 40 }, readOnly: true, originalBindings: [], jumps: [{ id: 'source-view', label: 'Jump to source', target: { kind: 'root', workflowId: root.id } }] };
    bridge.openPinMenu(input); const old = bridge.actions().menu;
    assert.equal(bridge.project().menu.readOnly, true);
    old.pick('break-all'); assert.equal(counts.prepare, 0);
    old.pick('jump:source-view'); assert.equal(counts.jump, 1); assert.equal(counts.commit, 0);
    bridge.openPinMenu(input); old.pick('jump:source-view'); assert.equal(counts.jump, 1);
    bridge.actions().menu.pick('jump:source-view'); assert.equal(counts.jump, 2);
});

test('rapid Alt guard consumes a revealed neighbor and typed reroute while direct wire double click uses exact point', async () => {
    const root = fixture(); root.wires.one = { id: 'one', route: 'wire', from: 'source', fromPort: 'out', to: 'first', toPort: 'in' };
    root.wires.two = { id: 'two', route: 'wire', from: 'source', fromPort: 'out', to: 'second', toPort: 'in' };
    const env = setup(root);
    env.bridge.dispatch({ type: 'activate-target', alt: true, timestamp: 100, target: { kind: 'wire', id: 'one' } }); await settle();
    const captured = env.counts.capture;
    const neighbor = env.bridge.dispatch({ type: 'activate-target', alt: true, timestamp: 150, target: { kind: 'wire', id: 'two' } });
    assert.equal(neighbor.requests[0].type, 'consume'); assert.equal(env.counts.capture, captured);
    env.bridge.dispatch({ type: 'wire-double-click', direct: true, timestamp: 200, wireId: 'two', graphPoint: { x: -11.125, y: 9.75 } }); await settle();
    assert.equal(Object.hasOwn(root.wires, 'two'), true); assert.equal(Object.values(root.nodes).some(n => n.operation === 'reroute'), false);
    env.bridge.dispatch({ type: 'wire-double-click', direct: true, timestamp: 700, wireId: 'two', graphPoint: { x: -11.125, y: 9.75 } }); await settle();
    const reroute = Object.values(root.nodes).find(n => n.operation === 'reroute');
    assert.deepEqual([reroute.x, reroute.y], [-11.125, 9.75]); assert.equal(reroute.artifactKind, 'context');
});

test('away/back with the real editor token and catalog replacement invalidates same-ID chooser callbacks', () => {
    const root = fixture(), identity = { kind: 'root', workflowId: root.id }, child = { kind: 'instance', workflowId: root.id, instancePath: ['a'] };
    const session = createGraphViewSession({ root, activationId: 'activation', navigation: [{ identity: child, label: 'A', readOnly: false }], preparedViews: [identity, child].map(identity => ({ identity, ...(identity.kind === 'instance' ? { definitionRef: { id: 'definition', version: 1, semanticHash: 'hash' } } : {}), savedGraph: root, effectiveNodes: root.nodes, interface: [], ports: [] })) }).data;
    const env = setup(root, { session }), actions = search(env);
    session.openInstance(['a']); session.focusView(identity);
    actions.choose('operation:smart-compactor'); assert.equal(env.counts.prepare, 0);
    env.bridge.cancel('view-change'); const latest = search(env);
    env.bridge.replaceCatalog(catalogFor(root)); latest.choose('operation:smart-compactor');
    assert.equal(env.counts.prepare, 0); assert.equal(env.bridge.hasContentGesture(), false);
});

test('body/outside/Ctrl-empty/unexpected loss and fresh cancellation clear active drafts without preparation', () => {
    for (const ending of ['body', 'outside', 'surface', 'ctrl-empty', 'capture-lost', 'escape', 'pointercancel', 'blur']) {
        const env = setup(); begin(env, pin(env.root, 'source'), ending === 'ctrl-empty' ? [{ kind: 'direct', id: 'some' }] : [], ending === 'ctrl-empty');
        if (['escape', 'pointercancel', 'blur'].includes(ending)) env.bridge.dispatch({ type: ending });
        else if (ending === 'capture-lost') env.bridge.dispatch({ type: ending, pointerId: 1, buttons: 0 });
        else env.bridge.dispatch({ type: 'release', pointerId: 1, graphPoint: { x: 2, y: 3 }, screenAnchor: { x: 2, y: 3 }, hit: { kind: ending === 'ctrl-empty' ? 'empty' : ending } });
        assert.equal(env.bridge.hasContentGesture(), false, ending); assert.equal(env.counts.prepare, 0, ending);
    }
});

test('malformed public fields and unsupported menu attachments do not invoke getters or admit commands', () => {
    const env = setup(); let reads = 0;
    const event = {}; Object.defineProperty(event, 'type', { enumerable: true, get() { reads++; return 'begin-pin'; } });
    env.bridge.dispatch(event);
    const target = pin(env.root, 'source'); Object.defineProperty(target.address, 'workflowId', { enumerable: true, get() { reads++; return env.root.id; } });
    begin(env, target); assert.equal(reads, 0); assert.equal(env.counts.capture, 0);
    env.bridge.openUnconnectedSearch({ graphPoint: { x: Infinity, y: 2 }, screenAnchor: { x: 1, y: 1 } });
    assert.equal(env.counts.capture, 0);
    env.bridge.openPinMenu({ pin: pin(env.root, 'source'), screenAnchor: { x: 2, y: 2 }, originalBindings: [{ kind: 'unknown', id: 'wire' }] });
    assert.equal(env.counts.capture, 0); assert.equal(env.bridge.actions().menu, null);
});

test('nested activation/search accessors are rejected without reads or capture and disabled menu actions are guarded', () => {
    const env = setup(); let reads = 0;
    const target = {}; Object.defineProperty(target, 'kind', { enumerable: true, get() { reads++; return 'pin'; } });
    env.bridge.dispatch({ type: 'activate-target', alt: true, timestamp: 5, target, originalBindings: [] });
    const options = {}; Object.defineProperty(options, 'graphPoint', { enumerable: true, get() { reads++; return { x: 1, y: 1 }; } });
    env.bridge.openUnconnectedSearch(options);
    assert.equal(reads, 0); assert.equal(env.counts.capture, 0);
    env.bridge.openPinMenu({ pin: pin(env.root, 'source'), screenAnchor: { x: 1, y: 1 }, originalBindings: [] });
    env.bridge.actions().menu.pick('break-all'); assert.equal(env.counts.prepare, 0);
});

test('release point uses the shared nonidentity camera transform and popup movement cannot move the created node', async () => {
    const env = setup(), point = graphPoint({ x: 61.75, y: -30.25, zoom: 1.6 }, { x: 273.5, y: 182.125 });
    env.bridge.openUnconnectedSearch({ graphPoint: point, screenAnchor: { x: 1015, y: 715 } });
    const actions = env.bridge.actions().search;
    const projected = env.bridge.project();
    assert.ok(Object.isFrozen(projected.search.screenAnchor));
    assert.throws(() => { projected.search.screenAnchor.x = 10; }, TypeError);
    actions.choose('operation:compose:input'); await settle();
    const created = Object.values(env.root.nodes).find(node => node.operation === 'compose');
    assert.deepEqual({ x: created.x, y: created.y }, point);
});

test('fresh Escape cancels an asynchronous final preparation before commit and real Tx rejects a document mutation', async () => {
    const env = setup(); const originalPrepare = env.adapter.prepare; let finish;
    env.adapter.prepare = (capture, command) => { const result = originalPrepare(capture, command); return new Promise(resolve => { finish = () => resolve(result); }); };
    env.bridge.openUnconnectedSearch({ graphPoint: { x: 1, y: 2 }, screenAnchor: { x: 10, y: 20 } });
    env.bridge.actions().search.choose('operation:compose');
    assert.equal(env.bridge.project().gesture.kind, 'idle'); assert.equal(env.bridge.project().search, null);
    assert.equal(env.bridge.hasContentGesture(), true, 'pending final preparation remains discoverable to the real Escape/import guard');
    if (env.bridge.hasContentGesture()) env.bridge.dispatch({ type: 'escape' });
    assert.equal(env.bridge.hasContentGesture(), false); finish(); await settle();
    assert.equal(env.counts.commit, 0); assert.equal(Object.values(env.root.nodes).some(node => node.operation === 'compose'), false);
    const guarded = setup(); const rawPrepare = guarded.adapter.prepare;
    guarded.adapter.prepare = (capture, command) => { const result = rawPrepare(capture, command); guarded.root.nodes.source.title = 'Changed after capture'; return result; };
    guarded.bridge.openUnconnectedSearch({ graphPoint: { x: 1, y: 2 }, screenAnchor: { x: 10, y: 20 } });
    guarded.bridge.actions().search.choose('operation:compose'); await settle();
    assert.equal(guarded.counts.commit, 1); assert.match(guarded.bridge.project().feedback, /changed/i);
    assert.equal(Object.values(guarded.root.nodes).some(node => node.operation === 'compose'), false);
});

test('private final preparation ownership clears on changed/no-op/rejected/error/stale/commit outcomes', async () => {
    for (const outcome of ['changed', 'noop', 'rejected', 'throws', 'promise-error', 'stale', 'commit-error']) {
        const env = setup(), originalPrepare = env.adapter.prepare; let finish;
        env.adapter.prepare = (capture, command) => {
            const result = originalPrepare(capture, command);
            if (outcome === 'throws') throw new Error('Preparation failed');
            return new Promise((resolve, reject) => { finish = () => outcome === 'promise-error' ? reject(new Error('Preparation failed'))
                : resolve(outcome === 'rejected' ? prepareNativeConnectionEdit(env.root, { kind: 'create', operation: 'text-rules', controls: { inputKind: 'invalid' }, graphPoint: { x: 1, y: 2 } }) : result); });
        };
        if (outcome === 'commit-error') env.adapter.commit = () => { env.counts.commit++; throw new Error('Commit failed'); };
        if (outcome === 'noop') env.bridge.disconnectWires(['missing']);
        else {
            env.bridge.openUnconnectedSearch({ graphPoint: { x: 1, y: 2 }, screenAnchor: { x: 10, y: 20 } });
            env.bridge.actions().search.choose('operation:compose');
        }
        assert.equal(env.bridge.hasContentGesture(), true, outcome + ' owns pending final work');
        assert.equal(JSON.stringify(env.bridge.project()).includes('capture'), false); assert.equal(JSON.stringify(env.bridge.project()).includes('candidate'), false);
        if (outcome === 'stale') env.stale();
        finish?.(); await settle();
        assert.equal(env.bridge.hasContentGesture(), false, outcome + ' clears ownership after settlement');
        assert.equal(env.counts.commit, ['changed', 'commit-error'].includes(outcome) ? 1 : 0, outcome);
        assert.equal(Object.values(env.root.nodes).some(node => node.operation === 'compose'), outcome === 'changed', outcome);
    }
});

test('an obsolete final preparation cannot clear a newer pending owner or commit into its reopened scope', async () => {
    const env = setup(), originalPrepare = env.adapter.prepare, finish = [];
    env.adapter.prepare = (capture, command) => { const result = originalPrepare(capture, command); return new Promise(resolve => finish.push(() => resolve(result))); };
    for (const x of [1, 7]) {
        env.bridge.openUnconnectedSearch({ graphPoint: { x, y: 2 }, screenAnchor: { x: 10, y: 20 } });
        env.bridge.actions().search.choose('operation:compose'); assert.equal(env.bridge.hasContentGesture(), true);
    }
    finish[0](); await settle(); assert.equal(env.counts.commit, 0); assert.equal(env.bridge.hasContentGesture(), true, 'obsolete completion leaves newer final preparation owned');
    finish[1](); await settle(); assert.equal(env.counts.commit, 1); assert.equal(env.bridge.hasContentGesture(), false);
    assert.equal(Object.values(env.root.nodes).find(node => node.operation === 'compose').x, 7);
});

test('explicit wire batch disconnect uses one root candidate/undo step, no-op skips commit, and readonly or malformed lists fail closed', async () => {
    const root = fixture();
    for (const [id, to] of [['界'.repeat(300), 'first'], ['other', 'second']]) root.wires[id] = { id, route: 'wire', from: 'source', fromPort: 'out', to, toPort: 'in' };
    const env = setup(root), before = structuredClone(root); history.track(root);
    assert.equal(typeof env.bridge.disconnectWires, 'function');
    env.bridge.disconnectWires(Object.keys(root.wires)); await settle();
    assert.equal(env.counts.capture, 1); assert.equal(env.counts.prepare, 1); assert.equal(env.counts.commit, 1); assert.equal(Object.keys(root.wires).length, 0);
    assert.ok(history.undo(root)); assert.deepEqual(root, before); assert.equal(history.undo(root), null);
    const noop = setup(); history.track(noop.root); noop.bridge.disconnectWires(['missing']); await settle();
    assert.equal(noop.counts.prepare, 1); assert.equal(noop.counts.commit, 0); assert.equal(history.undo(noop.root), null);
    const locked = setup(fixture(), { readOnly: true }); locked.bridge.disconnectWires(['some']); assert.equal(locked.counts.prepare, 0);
    let reads = 0; const trapped = ['wire']; Object.defineProperty(trapped, '0', { enumerable: true, get() { reads++; return 'wire'; } });
    const invalid = setup(); for (const ids of [trapped, Array(2001).fill('wire'), [null], []]) invalid.bridge.disconnectWires(ids);
    assert.equal(reads, 0); assert.equal(invalid.counts.capture, 0);
});
