import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARTIFACT_KINDS, describeOperation, operationDefaults, portsForNode, phaseForNode } from '../src/workflow/catalog.js';
import { computeDefinitionIdentity, definitionRefKey, validateDefinition } from '../src/workflow/definitions.js';
import { prepareNativeConnectionEdit } from '../src/workflow/connection-edits.js';
import { createNativeWireBridge } from '../src/ui/native-wire-bridge.js';
import { captureGraphEditContext, commitPreparedGraph } from '../src/workflow/transactions.js';
import * as history from '../src/history.js?v=0.27.0';
const api = await import('../src/ui/native-search-catalog.js?v=0.27.0').catch(() => ({}));
const scope = (mode = 'native-unified', extra = {}) => ({ schema: 3, runtime: 2, mode, workflowId: 'root', viewPath: [], inDefinition: false, ...extra });
function catalog(input = scope(), options) {
    assert.equal(typeof api.prepareNativeSearchCatalog, 'function');
    const result = api.prepareNativeSearchCatalog(input, options);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.data;
}
const choice = (value, id) => value.choices.find(item => item.id === id);

test('Subgraphs Input and Output are disabled outside definitions and create checked boundaries inside', () => {
    const root = catalog(), child = catalog(scope('native-pre', { inDefinition: true, viewPath: ['instance'] }));
    for (const direction of ['input', 'output']) {
        const id = 'boundary:' + direction, item = choice(root, id), inside = choice(child, id);
        assert.equal(item.family, 'Subgraphs'); assert.equal(item.label, direction === 'input' ? 'Input' : 'Output');
        assert.match(item.disabledReason, /inside a subgraph/i); assert.equal(api.resolveNativeSearchChoice(root, id), null);
        assert.equal(inside.disabledReason, undefined);
        assert.deepEqual(inside.ports, [{ portId: direction === 'input' ? 'out' : 'in', dir: direction === 'input' ? 'out' : 'in', kind: 'text', label: inside.label, required: false }]);
        assert.deepEqual(api.resolveNativeSearchChoice(child, id), { kind: 'create-boundary', direction, artifactKind: 'text' });
        assert.deepEqual(api.matchNativeSearchPorts(child, id, { dir: direction === 'input' ? 'in' : 'out', kind: 'text' }), []);
        for (const contextSensitive of [true, false]) assert.equal(api.filterNativeSearchChoices(child, { origin: { dir: 'out', kind: 'text' }, contextSensitive }).some(item => item.id === id), false);
    }
});

test('canonical discovery lists each operation once and keeps modes out of node labels', () => {
    for (const mode of ['native-unified']) {
        const value = catalog(scope(mode));
        const operations = value.choices.filter(item => item.id.startsWith('operation:'));
        const ids = operations.map(item => item.id.split(':')[1]);
        assert.equal(new Set(ids).size, ids.length);
        assert.equal(operations.some(item => item.id.split(':').length > 2 || item.label.includes(' · ') && item.id !== 'operation:generate-reply'), false);
        assert.equal(operations.filter(item => item.family === 'Introspection').length, 6);
        assert.equal(choice(value, 'operation:reroute').label, 'Reroute');
        assert.deepEqual(choice(value, 'operation:reroute').ports.map(port => port.kind), ['text', 'text']);
    }
});

test('canonical aliases find the single node while pin matching selects a checked compatible mode', () => {
    const value = catalog();
    for (const [query, id] of [['JSON validation', 'operation:json-decode'], ['Reflect · Recall', 'operation:reflect'], ['inner voice', 'operation:express']]) {
        assert.deepEqual(api.filterNativeSearchChoices(value, { query }).map(item => item.id), [id]);
    }
    for (const kind of ARTIFACT_KINDS) {
        const origin = { dir: 'out', kind }, matches = api.filterNativeSearchChoices(value, { query: 'Reroute', origin });
        assert.equal(matches.length, 1); assert.equal(matches[0].label, 'Reroute');
        const packet = api.resolveNativeSearchChoice(value, matches[0].id);
        assert.equal(packet.artifactKind, kind);
        assert.deepEqual(api.matchNativeSearchPorts(value, matches[0].id, origin).map(port => [port.portId, port.kind]), [['in', kind]]);
        assert.ok(Object.isFrozen(matches[0]));
        for (const port of api.matchNativeSearchPorts(value, matches[0].id, origin)) assert.ok(Object.isFrozen(port));
    }
    const check = api.filterNativeSearchChoices(value, { query: 'JSON Decode', origin: { dir: 'out', kind: 'data' } });
    assert.equal(check.length, 1); assert.equal(check[0].label, 'JSON Decode');
    assert.equal(api.resolveNativeSearchChoice(value, check[0].id).controls.mode, 'check');
});

test('canonical Text Transpose choices exist in either phase and reply-edit modes stay explicit', () => {
    for (const mode of ['native-unified']) {
        const value = catalog(scope(mode));
        for (const operation of ['style-transfer', 'format-transfer', 'terminology-map']) {
            const item = choice(value, 'operation:' + operation); assert.ok(item, operation + ' in ' + mode);
            assert.equal(api.resolveNativeSearchChoice(value, item.id).controls.inputKind, 'text');
            assert.equal(item.ports.find(port => port.portId === 'in').kind, 'text');
            assert.equal(item.ports.find(port => port.portId === 'out').kind, 'text');
        }
    }
    const value = catalog(scope('native-unified'));
    for (const item of api.filterNativeSearchChoices(value, { query: 'Memory', origin: { dir: 'out', kind: 'data' } })) {
        assert.notEqual(api.resolveNativeSearchChoice(value, item.id).controls?.mode, 'commit', 'pin matching must not silently select a write mode');
    }
});

test('legacy Transpose preset packets retain Draft semantics while new pin discovery prefers Text', () => {
    const post = catalog(scope('native-unified'));
    for (const id of ['style-transfer:character-voice', 'style-transfer:rhythm', 'style-transfer:register', 'format-transfer:data']) {
        const packet = api.resolveNativeSearchChoice(post, 'operation:' + id);
        assert.equal(packet.controls.inputKind ?? 'draft', 'draft');
        const described = describeOperation(scope('native-unified'), { type: 'workflow', ...operationDefaults(packet.operation), ...packet.controls });
        assert.equal(described.ok, true);
        assert.deepEqual(described.data.ports.filter(port => ['in', 'out'].includes(port.id)).map(port => port.kind), ['draft', 'patches']);
    }
    for (const mode of ['native-unified']) {
        const value = catalog(scope(mode)), item = api.filterNativeSearchChoices(value, { query: 'Format Transfer', origin: { dir: 'out', kind: 'data' } })[0];
        assert.ok(item); const packet = api.resolveNativeSearchChoice(value, item.id);
        assert.equal(packet.controls.inputKind, 'text'); assert.equal(packet.controls.referenceKind, 'data');
    }
});

test('default and declared variants describe real pins in the containing phase without allocated identities', () => {
    for (const mode of ['native-unified']) {
        const value = catalog(scope(mode));
        for (const item of value.choices.filter(item => !item.disabledReason)) {
            const command = api.resolveNativeSearchChoice(value, item.id);
            const described = describeOperation(scope(mode), { type: 'workflow', ...operationDefaults(command.operation), ...command.controls, ...(item.requiresConfiguration ? configuredSamples[command.operation] : {}),
                ...(command.operation === 'reroute' ? { artifactKind: command.artifactKind, phase: 'pre' } : {}) });
            assert.equal(described.ok, true, item.id + ' ' + JSON.stringify(described.error));
            if(item.requiresConfiguration) { assert.equal(command.requiresConfiguration,true); assert.equal(describeOperation(scope(mode),{type:'workflow',...operationDefaults(command.operation),...command.controls}).ok,false,'incomplete defaults must remain rejected'); }
            assert.equal(item.phase, described.data.descriptor.phase);
            assert.deepEqual(item.ports, described.data.ports.map(port => ({ portId: port.id, dir: port.direction === 'input' ? 'in' : 'out', kind: port.kind, label: port.label, required: port.required })));
            for (const port of item.ports) for (const key of ['nodeId', 'center', 'address']) assert.equal(Object.hasOwn(port, key), false);
        }
        assert.ok(choice(value, 'operation:reroute'));
        assert.ok(value.families.includes('Transpose'));
        assert.equal(value.choices.some(item => item.family === 'Transpose'), true);
    }
});

const configuredSamples = {
 'commit-outcomes':{targetId:'outcomes.json'},
 recall:{actorId:'mara',memorySetId:'memories'},'hotkey-arm':{actorId:'mara',memorySetId:'memories'},
 'read-file': {targetId:'souls.json'}, 'story-clock': {clockId:'time'}, 'time-trigger': {scheduleId:'curse'},
 'for-each': {helper:{id:'pinned-helper',version:1,semanticHash:'sha256:'+'a'.repeat(64)}},
 'actor-context': {actorId:'mara'}, 'prompted-memory': {actorId:'mara'}, 'item-mention-trigger': {actorId:'mara',itemId:'wand',aliases:['broken wand']},
 'item-use-trigger': {itemId:'wand'}, 'scene-presence': {actorId:'mara'}, 'character-direction': {actorId:'mara'},
 'parse-effect-library': {libraryId:'wand-effects',revision:'1',itemId:'wand'},
};
const ref = value => ({ id: value.id, version: value.version, semanticHash: value.semanticHash });
const finalize = draft => {
    const identity = computeDefinitionIdentity(draft); assert.equal(identity.ok, true, JSON.stringify(identity));
    return { ...structuredClone(identity.data.materializedDefinition), semanticHash: identity.data.semanticHash };
};
const wire = (id, from, to, fromPort = 'out', toPort = 'in') => ({ id, route: 'wire', from, fromPort, to, toPort, order: 0 });
function savedClosure() {
    const interfacePorts = [
        { id: 'left', label: 'Left', direction: 'input', kind: 'context', required: true, cardinality: 'one', boundaryNodeId: 'entry-left' },
        { id: 'right', label: 'Right', direction: 'input', kind: 'context', required: true, cardinality: 'one', boundaryNodeId: 'entry-right' },
        { id: 'primary', label: 'Primary', direction: 'output', kind: 'context', required: false, cardinality: 'one', boundaryNodeId: 'exit-primary' },
        { id: 'secondary', label: 'Secondary', direction: 'output', kind: 'context', required: false, cardinality: 'one', boundaryNodeId: 'exit-secondary' },
    ];
    const boundaryNodes = Object.fromEntries(interfacePorts.map(port => [port.boundaryNodeId, { id: port.boundaryNodeId, type: port.direction === 'input' ? 'subgraph-input' : 'subgraph-output', interfacePortId: port.id }]));
    const child = finalize({ id: 'checked-leaf', version: 2, name: 'Inner Loom', interface: interfacePorts, parameters: [], body: {
        schema: 3, runtime: 2, mode: 'native-pre', nodes: { ...boundaryNodes,
            first: { id: 'first', type: 'workflow', operation: 'smart-compactor' }, second: { id: 'second', type: 'workflow', operation: 'smart-compactor' } },
        wires: { a: wire('a', 'entry-left', 'first'), b: wire('b', 'first', 'exit-primary'), c: wire('c', 'entry-right', 'second'), d: wire('d', 'second', 'exit-secondary') },
    } });
    const definition = finalize({ id: 'checked-outer', version: 3, name: 'Saved Nested Loom', interface: interfacePorts, parameters: [], body: {
        schema: 3, runtime: 2, mode: 'native-pre', nodes: { ...boundaryNodes,
            nested: { id: 'nested', type: 'subgraph', definition: ref(child), parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {} } },
        wires: { a: wire('a', 'entry-left', 'nested', 'out', 'left'), b: wire('b', 'nested', 'exit-primary', 'primary'),
            c: wire('c', 'entry-right', 'nested', 'out', 'right'), d: wire('d', 'nested', 'exit-secondary', 'secondary') },
    } });
    return { definition, snapshots: { [definitionRefKey(child)]: child } };
}
let catalogRootSequence = 0;
const graph = (mode = 'native-unified') => ({ id: 'catalog-root-' + ++catalogRootSequence, schema: 3, runtime: 2, mode, nodes: {}, wires: {}, definitions: {}, portals: {}, groups: {} });
const catalogScope = root => scope(root.mode, { workflowId: root.id });

test('one canonical reroute retains typed pin-aware creation for every actual kind', () => {
    for (const mode of ['native-unified']) {
        const root = graph(mode), value = catalog(catalogScope(root));
        assert.equal(value.choices.filter(item => item.id.startsWith('operation:reroute')).length, 1);
        for (const kind of ARTIFACT_KINDS) {
            const item = api.filterNativeSearchChoices(value, { query: 'Reroute', origin: { dir: 'out', kind } })[0], id = item.id;
            assert.ok(item, id); assert.equal(item.phase, 'pre');
            assert.deepEqual(item.ports.map(port => [port.portId, port.dir, port.kind]), [['in', 'in', kind], ['out', 'out', kind]]);
            const result = prepareNativeConnectionEdit(root, { kind: 'create', ...api.resolveNativeSearchChoice(value, id), graphPoint: { x: -4.125, y: 91.75 } });
            assert.equal(result.ok, true, JSON.stringify(result));
            const node = result.data.candidate.nodes[result.data.addedNodeIds[0]];
            assert.deepEqual([node.operation, node.artifactKind, phaseForNode(result.data.candidate,node), node.compact, node.x, node.y], ['reroute', kind, 'pre', true, -4.125, 91.75]);
            assert.deepEqual(portsForNode(result.data.candidate, node).map(port => [port.id, port.kind]), [['in', kind], ['out', kind]]);
            assert.deepEqual(api.filterNativeSearchChoices(value, { query: 'Reroute', origin: { dir: 'out', kind } }).map(item => item.id), [id]);
        }
        assert.equal(api.resolveNativeSearchChoice(value, 'operation:reroute').artifactKind, 'text');
    }
});

test('checked real closures enable exact saved names and ports while bodies stay private and detached', () => {
    const saved = savedClosure(), before = structuredClone(saved);
    assert.equal(validateDefinition(saved.definition, saved.snapshots).ok, true);
    const value = catalog(scope(), { checkedLibraryClosures: [saved] }), id = 'definition:' + definitionRefKey(saved.definition), item = choice(value, id);
    assert.equal(item.label, 'Saved Nested Loom'); assert.deepEqual(item.definitionRef, ref(saved.definition)); assert.equal(item.disabledReason, undefined);
    assert.deepEqual(item.ports.map(port => [port.portId, port.dir]), [['left', 'in'], ['right', 'in'], ['primary', 'out'], ['secondary', 'out']]);
    for (const key of ['definition', 'snapshots', 'body', 'parameters']) assert.equal(Object.hasOwn(item, key), false);
    for (const port of item.ports) for (const key of ['boundaryNodeId', 'nodeId', 'address', 'center']) assert.equal(Object.hasOwn(port, key), false);
    assert.equal(JSON.stringify(value).includes('checked-leaf'), false);
    const packet = api.resolveNativeSearchChoice(value, id);
    assert.equal(packet.kind, 'create-instance'); assert.deepEqual(packet.definition, before.definition); assert.deepEqual(packet.snapshots, before.snapshots);
    assert.ok(Object.isFrozen(packet)); assert.ok(Object.isFrozen(packet.definition.body.nodes)); assert.ok(Object.isFrozen(packet.snapshots));
    saved.definition.name = 'Mutated'; saved.definition.body.nodes.nested.definition.id = 'mutated'; saved.snapshots = {};
    assert.equal(item.label, 'Saved Nested Loom'); assert.deepEqual(api.resolveNativeSearchChoice(value, id), packet);
    assert.deepEqual(api.matchNativeSearchPorts(value, id, { dir: 'out', kind: 'context' }).map(port => port.portId), ['left', 'right']);
    assert.deepEqual(api.matchNativeSearchPorts(value, id, { dir: 'in', kind: 'context' }).map(port => port.portId), ['primary', 'secondary']);
    assert.equal(api.resolveNativeSearchChoice(structuredClone(value), id), null);
    assert.ok(api.filterNativeSearchChoices(value, { query: 'Saved Nested Loom' }).some(item => item.id === id));
    let reads = 0; Object.defineProperty(saved.definition.body, 'nodes', { enumerable: true, get() { reads++; throw new Error('source lookup'); } });
    for (let i = 0; i < 5; i++) {
        assert.ok(api.filterNativeSearchChoices(value, { query: 'Loom', origin: { dir: 'out', kind: 'context' } }).some(item => item.id === id));
        assert.equal(api.resolveNativeSearchChoice(value, id), packet);
    }
    assert.equal(reads, 0);
});

test('closure preparation rejects hashes, missing children, duplicates and accessor data', () => {
    const saved = savedClosure(), id = 'definition:' + definitionRefKey(saved.definition);
    const invalid = [
        { definition: { ...saved.definition, semanticHash: 'sha256:' + 'f'.repeat(64) }, snapshots: saved.snapshots },
        { definition: saved.definition },
        { ...saved, snapshots: null },
        { ...saved, definitionRef: ref(saved.definition) },
    ];
    const hosted = structuredClone(saved.definition); hosted.id = 'hosted'; hosted.body.nodes.rootSource = { id: 'rootSource', type: 'workflow', operation: 'scene-context' };
    assert.equal(api.prepareNativeSearchCatalog(scope(), { checkedLibraryClosures: [{ definition: finalize(hosted), snapshots: saved.snapshots }] }).ok, true);
    for (const entry of invalid) assert.equal(api.prepareNativeSearchCatalog(scope(), { checkedLibraryClosures: [entry] }).ok, false);
    assert.equal(api.prepareNativeSearchCatalog(scope(), { checkedLibraryClosures: [saved, saved] }).ok, false);
    const metadata = { definitionRef: ref(saved.definition), name: saved.definition.name, phase: 'pre', ports: saved.definition.interface.map(({ boundaryNodeId, ...port }) => port) };
    assert.equal(api.prepareNativeSearchCatalog(scope(), { checkedLibraryClosures: [saved], checkedLibraryEntries: [metadata] }).ok, false);
    assert.equal(api.resolveNativeSearchChoice(catalog(scope(), { checkedLibraryEntries: [metadata] }), id), null);
    let reads = 0; const trapped = structuredClone(saved);
    Object.defineProperty(trapped.snapshots[Object.keys(trapped.snapshots)[0]].body, 'nodes', { enumerable: true, get() { reads++; return {}; } });
    assert.equal(api.prepareNativeSearchCatalog(scope(), { checkedLibraryClosures: [trapped] }).ok, false); assert.equal(reads, 0);
    const oversized = structuredClone(saved); oversized.definition.name = '界'.repeat(700000);
    assert.equal(api.prepareNativeSearchCatalog(scope(), { checkedLibraryClosures: [oversized] }).ok, false);
});

test('closure phase filtering keeps exact private scope and optional empty snapshots without public body leakage', () => {
    const pre = savedClosure(), post = { definition: finalize({ id: 'post-saved', version: 1, name: 'Post Relay', interface: [], parameters: [], body: {
        schema: 3, runtime: 2, mode: 'native-post', nodes: { relay: { id: 'relay', type: 'workflow', operation: 'reroute', artifactKind: 'draft', phase: 'post' } }, wires: {},
    } }) };
    for (const mode of ['native-pre', 'native-post']) {
        const value = catalog(scope(mode, { viewPath: ['owned', 'nested'], inDefinition: true }), { checkedLibraryClosures: [pre, post] });
        const wanted = mode === 'native-pre' ? pre : post, other = mode === 'native-pre' ? post : pre;
        assert.deepEqual(value.scope.viewPath, ['owned', 'nested']);
        assert.deepEqual(value.choices.filter(item => item.definitionRef).map(item => item.label), [wanted.definition.name]);
        assert.equal(api.resolveNativeSearchChoice(value, 'definition:' + definitionRefKey(other.definition)), null);
        assert.ok(api.resolveNativeSearchChoice(value, 'definition:' + definitionRefKey(wanted.definition)));
        for (const operation of mode === 'native-pre' ? ['scene-context', 'guidance'] : ['reply-snapshot', 'apply-reply']) assert.ok(choice(value, 'operation:' + operation));
    }
});

test('an enabled real 257-port Unicode definition preserves every named choice and excludes unrelated snapshots', () => {
    const ports = Array.from({ length: 257 }, (_, i) => ({ id: 'port-' + i, label: 'Port ' + i, direction: 'input', kind: 'context', required: false, cardinality: 'one', boundaryNodeId: 'boundary-' + i }));
    const definition = finalize({ id: '界'.repeat(300), version: 1, name: 'Wide Saved Loom', interface: ports, parameters: [], body: {
        schema: 3, runtime: 2, mode: 'native-pre', nodes: Object.fromEntries(ports.map(port => [port.boundaryNodeId, { id: port.boundaryNodeId, type: 'subgraph-input', interfacePortId: port.id }])), wires: {},
    } });
    const unrelated = savedClosure(), value = catalog(scope(), { checkedLibraryClosures: [{ definition, snapshots: { [definitionRefKey(unrelated.definition)]: unrelated.definition, ...unrelated.snapshots } }] });
    const id = 'definition:' + definitionRefKey(definition);
    assert.deepEqual(api.matchNativeSearchPorts(value, id, { dir: 'out', kind: 'context' }).map(port => port.portId), ports.map(port => port.id));
    const packet = api.resolveNativeSearchChoice(value, id); assert.deepEqual(packet.snapshots, {}); assert.equal(packet.definition.id, definition.id);
    const result = prepareNativeConnectionEdit(graph(), { kind: 'create', ...packet, graphPoint: { x: 5, y: 7 } });
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(portsForNode(result.data.candidate, result.data.candidate.nodes[result.data.addedNodeIds[0]]).length, 257);
});

function bridgeFixture(saved = savedClosure(), mode = 'native-unified') {
    const root = graph(mode), commands = [], contexts = new WeakMap(), counts = { prepare: 0, commit: 0, opaqueReads: 0 };
    root.nodes.source = { id: 'source', type: 'workflow', operation: 'scene-context' };
    root.nodes.target = { id: 'target', type: 'workflow', operation: 'smart-compactor' };
    root.nodes.text = { id: 'text', type: 'workflow', ...operationDefaults('compose') };
    root.wires.incoming = wire('incoming', 'source', 'target');
    const context = { sessionId: root.id, viewPath: [], readOnly: false };
    let current = true;
    const value = catalog(catalogScope(root), { checkedLibraryClosures: [saved] });
    const bridge = createNativeWireBridge({ catalog: value, adapter: {
        capture() {
            const tx = captureGraphEditContext(root, () => context); if (!tx.ok) return tx;
            const opaque = new Proxy({}, { get() { counts.opaqueReads++; throw new Error('opaque read'); }, ownKeys() { counts.opaqueReads++; throw new Error('opaque keys'); }, getPrototypeOf() { counts.opaqueReads++; throw new Error('opaque prototype'); }, preventExtensions() { counts.opaqueReads++; throw new Error('opaque freeze'); } });
            contexts.set(opaque, tx.data); return { ok: true, data: opaque };
        },
        isCurrent(capture) { return contexts.has(capture) && current && !context.readOnly; },
        prepare(capture, command) { counts.prepare++; commands.push(command); return prepareNativeConnectionEdit(root, command); },
        commit(capture, prepared) { counts.commit++; return commitPreparedGraph(root, { ...prepared, context: contexts.get(capture) }); },
    } });
    const pin = (nodeId, dir = 'out', kind = 'context') => ({ nodeId, portId: dir === 'out' ? 'out' : 'in', dir, kind, center: { x: 10, y: 20 }, address: { workflowId: root.id, instancePath: [], nodeId, portId: dir === 'out' ? 'out' : 'in' } });
    const search = origin => {
        bridge.dispatch({ type: 'begin-pin', pin: origin, pointerId: 1, graphPoint: { x: 0, y: 0 }, originalBindings: [] });
        bridge.dispatch({ type: 'release', pointerId: 1, graphPoint: { x: -103.125, y: 71.75 }, screenAnchor: { x: 999, y: 720 }, hit: { kind: 'empty' } });
        return bridge.actions().search;
    };
    return { root, value, bridge, counts, commands, context, pin, search, stale() { current = false; } };
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('the existing bridge creates checked instances in either direction with explicit named-port choice and one history step', async () => {
    for (const reverse of [false, true]) {
        const saved = savedClosure(), env = bridgeFixture(saved), before = structuredClone(env.root), savedBefore = structuredClone(saved);
        history.track(env.root);
        const actions = env.search(reverse ? env.pin('target', 'in') : env.pin('source'));
        actions.choose('definition:' + definitionRefKey(saved.definition));
        assert.equal(env.bridge.project().search.mode, 'ports'); assert.equal(env.counts.prepare, 0);
        assert.deepEqual(env.bridge.project().search.ports.map(port => port.portId), reverse ? ['primary', 'secondary'] : ['left', 'right']);
        const selectedPort = reverse ? 'secondary' : 'right';
        env.bridge.actions().search.choosePort(selectedPort); await settle();
        assert.equal(env.counts.prepare, 1); assert.equal(env.counts.commit, 1); assert.equal(env.counts.opaqueReads, 0);
        const packet = env.commands[0]; assert.equal(packet.kind, 'create-instance'); assert.equal(packet.connection.portId, selectedPort);
        assert.deepEqual(packet.graphPoint, { x: -103.125, y: 71.75 });
        const added = Object.values(env.root.nodes).find(node => !Object.hasOwn(before.nodes, node.id));
        assert.deepEqual([added.type, added.x, added.y], ['subgraph', -103.125, 71.75]); assert.deepEqual(added.definition, ref(saved.definition));
        const addedWire = Object.values(env.root.wires).find(edge => !Object.hasOwn(before.wires, edge.id));
        assert.deepEqual([addedWire.from, addedWire.fromPort, addedWire.to, addedWire.toPort],
            reverse ? [added.id, 'secondary', 'target', 'in'] : ['source', 'out', added.id, 'right']);
        assert.equal(Object.hasOwn(env.root.wires, 'incoming'), !reverse);
        assert.equal(env.bridge.hasContentGesture(), false); assert.deepEqual(saved, savedBefore);
        assert.ok(history.undo(env.root)); assert.deepEqual(env.root, before); assert.equal(history.undo(env.root), null);
        assert.ok(history.redo(env.root)); assert.equal(env.root.nodes[added.id].type, 'subgraph'); assert.equal(history.redo(env.root), null);
    }
});

test('typed reroute packets also pass the existing bridge in both connection directions', async () => {
    for (const reverse of [false, true]) {
        const env = bridgeFixture(), beforeIds = new Set(Object.keys(env.root.nodes));
        const actions = env.search(reverse ? env.pin('target', 'in') : env.pin('source'));
        actions.choose('operation:reroute:context'); await settle();
        assert.equal(env.counts.prepare, 1); assert.equal(env.counts.commit, 1);
        assert.deepEqual(env.commands[0], { kind: 'create', operation: 'reroute', artifactKind: 'context', graphPoint: { x: -103.125, y: 71.75 },
            connection: { origin: { nodeId: reverse ? 'target' : 'source', portId: reverse ? 'in' : 'out' }, portId: reverse ? 'out' : 'in', replace: true } });
        const node = Object.values(env.root.nodes).find(node => !beforeIds.has(node.id));
        assert.deepEqual([node.operation, node.artifactKind, phaseForNode(env.root,node), node.compact], ['reroute', 'context', 'pre', true]);
        assert.equal(env.bridge.hasContentGesture(), false); assert.equal(env.counts.opaqueReads, 0);
    }
});

test('context-off library selection creates unconnected and obsolete catalog actions cannot retarget a new scope', async () => {
    const saved = savedClosure(), env = bridgeFixture(saved), id = 'definition:' + definitionRefKey(saved.definition);
    const old = env.search(env.pin('text', 'out', 'text'));
    assert.equal(env.bridge.project().search.choices.some(item => item.id === id), false);
    old.setContextSensitive(false); assert.ok(env.bridge.project().search.choices.some(item => item.id === id));
    old.choose(id); await settle();
    assert.equal(env.counts.commit, 1); assert.equal(env.commands[0].kind, 'create-instance'); assert.equal(env.commands[0].connection, undefined);
    assert.deepEqual(Object.keys(env.root.wires), ['incoming']);
    const pending = env.search(env.pin('source'));
    env.bridge.replaceCatalog(catalog(scope('native-pre', { workflowId: env.root.id, viewPath: ['new-view'], inDefinition: true }), { checkedLibraryClosures: [saved] }));
    pending.choose(id); pending.setContextSensitive(false); old.choose(id); await settle();
    assert.equal(env.counts.commit, 1); assert.equal(env.counts.prepare, 1); assert.equal(env.bridge.hasContentGesture(), false);
    const fresh = bridgeFixture(saved), freshActions = fresh.search(fresh.pin('source')); fresh.stale(); freshActions.choose(id); await settle();
    assert.equal(fresh.counts.prepare, 0); assert.equal(fresh.counts.commit, 0);
    const readonly = bridgeFixture(saved), readonlyBefore = structuredClone(readonly.root); readonly.context.readOnly = true;
    assert.equal(readonly.search(readonly.pin('source')), null); assert.equal(readonly.counts.prepare, 0); assert.deepEqual(readonly.root, readonlyBefore);
});

test('Draft Text Rules, JSON check, Compose Input and Context Join expose actual variant ports', () => {
    const pre = catalog(scope('native-pre',{inDefinition:true,viewPath:['helper']})), post = catalog(scope('native-post',{inDefinition:true,viewPath:['helper']}));
    assert.equal(choice(pre, 'operation:text-rules:draft'), undefined);
    assert.deepEqual(api.filterNativeSearchChoices(post, { query: 'Text Rules', origin: { dir: 'out', kind: 'draft' } })[0].ports.map(p => [p.dir, p.kind]), [['in', 'draft'], ['out', 'patches']]);
    assert.equal(api.filterNativeSearchChoices(pre, { query: 'JSON Decode', origin: { dir: 'out', kind: 'data' } })[0].ports[0].kind, 'data');
    assert.deepEqual(api.resolveNativeSearchChoice(pre, 'operation:json-decode:check').controls, { mode: 'check' });
    assert.ok(api.filterNativeSearchChoices(pre, { query: 'Compose', origin: { dir: 'out', kind: 'text' } })[0].ports.some(p => p.portId === 'section.Input' && p.kind === 'text'));
    assert.deepEqual(choice(pre, 'operation:context-join').ports.filter(p => p.dir === 'in').map(p => p.portId), ['context-1', 'context-2']);
    assert.equal(api.resolveNativeSearchChoice(post, 'operation:compose:guidance'), null);
    assert.equal(api.filterNativeSearchChoices(pre, { query: 'Compose', origin: { dir: 'in', kind: 'guidance' } })[0].ports.find(p => p.dir === 'out').kind, 'guidance');
});

test('private bodies admit host operations in their phase while retaining dynamic both-phase choices', () => {
    for (const mode of ['native-pre', 'native-post']) {
        const value = catalog(scope(mode, { inDefinition: true, viewPath: ['instance'] }));
        for (const id of mode === 'native-pre' ? ['scene-context', 'guidance'] : ['reply-snapshot', 'apply-reply']) assert.ok(choice(value, 'operation:' + id));
        for (const id of mode === 'native-pre' ? ['reply-snapshot', 'apply-reply'] : ['scene-context', 'guidance']) assert.equal(choice(value, 'operation:' + id), undefined);
        assert.ok(choice(value, 'operation:compose'));
        assert.ok(choice(value, 'operation:json-decode'));
        assert.equal(api.resolveNativeSearchChoice(value, 'operation:json-decode:check').controls.mode, 'check');
        assert.equal(choice(value, mode === 'native-pre' ? 'operation:repair' : 'operation:smart-compactor'), undefined);
    }
});

test('cached query and context matching preserve multiple real compatible ports and allow context-off choices', () => {
    const value = catalog(), origin = { dir: 'out', kind: 'context' };
    const matched = api.filterNativeSearchChoices(value, { query: 'join', origin, contextSensitive: true });
    assert.deepEqual(matched.map(c => c.id), ['operation:context-join']);
    assert.deepEqual(api.matchNativeSearchPorts(value, matched[0].id, origin).map(p => p.portId), ['context-1', 'context-2']);
    assert.equal(api.filterNativeSearchChoices(value, { query: 'JSON', origin, contextSensitive: true }).length, 0);
    assert.deepEqual(api.filterNativeSearchChoices(value, { query: 'JSON', origin, contextSensitive: false }).map(choice => choice.id).sort(), ['operation:file-input', 'operation:json-decode']);
    assert.equal(api.matchNativeSearchPorts(value, 'operation:json-decode:check', origin).length, 0);
    assert.equal(api.resolveNativeSearchChoice(value, 'missing'), null);
    assert.equal(api.resolveNativeSearchChoice({ ...value }, 'operation:compose'), null, 'foreign catalog cannot provide checked commands');
});

test('checked shelf entries retain exact revision and actual interface choices but require an atomic producer', () => {
    const id = '界'.repeat(300);
    const interfacePorts = Array.from({ length: 257 }, (_, i) => ({ id: 'input-' + i, label: 'Input ' + i, direction: 'input', kind: 'context', required: false, cardinality: 'one', boundaryNodeId: 'boundary-' + i }));
    const draft = { id, version: 4, name: 'Saved shape', interface: interfacePorts, parameters: [], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: Object.fromEntries(interfacePorts.map(port => [port.boundaryNodeId, { id: port.boundaryNodeId, type: 'subgraph-input', interfacePortId: port.id }])), wires: {} } };
    const identity = computeDefinitionIdentity(draft); assert.equal(identity.ok, true);
    const definition = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    assert.equal(validateDefinition(definition, { [definitionRefKey(definition)]: definition }).ok, true, 'real 257-interface source is accepted by the existing definition validator');
    const ref = { id, version: 4, semanticHash: definition.semanticHash }, ports = interfacePorts.map(({ boundaryNodeId, ...port }) => port);
    const value = catalog(scope(), { checkedLibraryEntries: [{ definitionRef: ref, name: 'Saved shape', phase: 'pre', ports }] });
    const item = value.choices.find(c => c.definitionRef);
    assert.deepEqual(item.definitionRef, ref);
    assert.equal(item.ports.length, 257);
    assert.match(item.disabledReason, /atomic/i);
    assert.equal(api.resolveNativeSearchChoice(value, item.id), null);
    ref.id = 'mutated'; ports[0].id = 'mutated';
    assert.equal(item.definitionRef.id, id); assert.equal(item.ports[0].portId, 'input-0');
    assert.ok(Object.isFrozen(item.ports));
});

test('catalog admission rejects unsupported schema, malformed/getter scope and malformed shelf metadata without invoking getters', () => {
    assert.equal(typeof api.prepareNativeSearchCatalog, 'function');
    assert.equal(api.prepareNativeSearchCatalog(scope('native-pre', { schema: 2, runtime: 1 })).ok, false);
    let reads = 0;
    const trapped = { ...scope() }; Object.defineProperty(trapped, 'workflowId', { enumerable: true, get() { reads++; return 'root'; } });
    assert.equal(api.prepareNativeSearchCatalog(trapped).ok, false); assert.equal(reads, 0);
    assert.equal(api.prepareNativeSearchCatalog(scope(), { checkedLibraryEntries: [{ definitionRef: {}, name: 'bad', phase: 'pre', ports: [] }] }).ok, false);
    assert.equal(api.prepareNativeSearchCatalog(scope('native-pre', { viewPath: Array(9).fill('instance'), inDefinition: true })).ok, false);
});

test('genuine interface and data overlimits reject while a disabled shelf remains a queryable cached choice', () => {
    const ref = { id: 'definition', version: 1, semanticHash: 'sha256:' + 'f'.repeat(64) };
    const ports = Array.from({ length: 1001 }, (_, i) => ({ id: 'port-' + i, label: '', direction: 'input', kind: 'context', required: false, cardinality: 'one' }));
    assert.equal(api.prepareNativeSearchCatalog(scope(), { checkedLibraryEntries: [{ definitionRef: ref, name: 'Saved', phase: 'pre', ports }] }).ok, false);
    assert.equal(api.prepareNativeSearchCatalog(scope('native-pre', { workflowId: '界'.repeat(700000) })).ok, false);
    const value = catalog(scope(), { checkedLibraryEntries: [{ definitionRef: ref, name: 'Saved', phase: 'pre', ports: ports.slice(0, 1) }] });
    assert.match(api.filterNativeSearchChoices(value, { query: 'Saved' }).find(choice => choice.definitionRef?.id === ref.id).disabledReason, /checked definition.*atomic/i);
});

test('public cached filter rejects accessor or malformed options without evaluating them', () => {
    const value = catalog(); let reads = 0;
    const options = {}; Object.defineProperty(options, 'query', { enumerable: true, get() { reads++; return 'Compose'; } });
    assert.deepEqual(api.filterNativeSearchChoices(value, options), []); assert.equal(reads, 0);
    assert.deepEqual(api.filterNativeSearchChoices(value, { query: '', origin: { dir: 'sideways', kind: 'context' } }), []);
    assert.deepEqual(api.filterNativeSearchChoices(value, { contextSensitive: 'yes' }), []);
});

test('cached operation purpose, prototype shortcode and known aliases each independently find compatible choices', () => {
    const value = catalog(), item = choice(value, 'operation:smart-compactor');
    assert.equal(typeof item.purpose, 'string'); assert.equal(item.shortcode, 'cp'); assert.ok(Object.isFrozen(item.searchAliases));
    for (const [field, term] of [['purpose', 'protected'], ['shortcode', 'cp'], ['searchAliases', 'compaction']]) {
        const fields = { label: item.label, family: item.family, purpose: item.purpose, shortcode: item.shortcode, searchAliases: item.searchAliases.join(' ') };
        assert.ok(fields[field].includes(term));
        for (const [name, contents] of Object.entries(fields)) if (name !== field) assert.equal(contents.toLowerCase().includes(term), false, term + ' appears only in ' + field);
        const filtered = api.filterNativeSearchChoices(value, { query: term.toUpperCase(), origin: { dir: 'out', kind: 'context' }, contextSensitive: true });
        assert.ok(filtered.some(match => match.id === item.id), term);
        assert.equal(api.filterNativeSearchChoices(value, { query: term, origin: { dir: 'out', kind: 'draft' }, contextSensitive: true }).some(match => match.id === item.id), false);
        assert.ok(api.filterNativeSearchChoices(value, { query: term, origin: { dir: 'out', kind: 'draft' }, contextSensitive: false }).some(match => match.id === item.id));
    }
    for (const entry of value.choices) { assert.equal(typeof entry.purpose, 'string'); assert.equal(typeof entry.shortcode, 'string'); assert.ok(Object.isFrozen(entry.searchAliases)); }
});

test('saved subgraph label and admitted optional search metadata remain immutable without placed-node aliases', () => {
    const entry = { definitionRef: { id: 'saved', version: 1, semanticHash: 'sha256:' + 'e'.repeat(64) }, name: 'Saved Loom', phase: 'pre', ports: [], purpose: 'Reusable arrangement', shortcode: 'lm', searchAliases: ['woven branch'] };
    const value = catalog(scope(), { checkedLibraryEntries: [entry] }), item = value.choices.find(choice => choice.definitionRef);
    assert.equal(item.label, 'Saved Loom'); assert.deepEqual(item.searchAliases, ['woven branch']);
    for (const term of ['Saved Loom', 'arrangement', 'lm', 'woven branch']) assert.ok(api.filterNativeSearchChoices(value, { query: term }).some(choice => choice.id === item.id));
    entry.name = 'Changed'; entry.searchAliases.push('changed alias'); assert.equal(item.label, 'Saved Loom'); assert.deepEqual(item.searchAliases, ['woven branch']);
    let reads = 0; const trapped = { ...entry }; Object.defineProperty(trapped, 'purpose', { enumerable: true, get() { reads++; return 'bad'; } });
    assert.equal(api.prepareNativeSearchCatalog(scope(), { checkedLibraryEntries: [trapped] }).ok, false); assert.equal(reads, 0);
    for (const searchAliases of [[42], 'not an array']) assert.equal(api.prepareNativeSearchCatalog(scope(), { checkedLibraryEntries: [{ ...entry, searchAliases }] }).ok, false);
    assert.equal(api.prepareNativeSearchCatalog(scope(), { placedNodeAliases: ['placed node alias'] }).ok, false);
});

test('one unified shelf exposes preparation and reply processing with their actual pins',()=>{
    const unified=catalog(scope('native-unified'));
    for(const id of ['scene-context','reply-snapshot','response-plan','repair','guidance','apply-reply','condition','decision'])assert.ok(choice(unified,'operation:'+id),id);
    assert.equal(choice(unified,'operation:scene-context').phase,'pre');assert.equal(choice(unified,'operation:reply-snapshot').phase,'post');
    assert.equal(choice(unified,'operation:guidance').ports.find(port=>port.dir==='out').kind,'guidance');
    assert.equal(choice(unified,'operation:decision').label,'Decision');
    for(const item of unified.choices.filter(item=>item.id.startsWith('operation:'))){
        const command=api.resolveNativeSearchChoice(unified,item.id);const described=describeOperation(scope('native-unified'),{type:'workflow',...operationDefaults(command.operation),...command.controls,...(item.requiresConfiguration?configuredSamples[command.operation]:{}),...(command.artifactKind?{artifactKind:command.artifactKind,phase:'pre'}:{})});
        assert.equal(described.ok,true,item.id+' '+JSON.stringify(described.error));assert.deepEqual(item.ports,described.data.ports.map(({id,label,kind,direction,required})=>({portId:id,label,kind,dir:direction==='input'?'in':'out',required})));
    }
});

test('Data pin discovery offers Character Direction data without inventing its required actor configuration', () => {
    const value = catalog(scope('native-unified')), origin = {dir:'out', kind:'data'};
    const items = api.filterNativeSearchChoices(value, {query:'Character Direction', origin});
    const item = items.find(item => item.id === 'operation:character-direction');
    assert.ok(item);
    assert.equal(item.requiresConfiguration, true);
    assert.deepEqual(api.matchNativeSearchPorts(value, item.id, origin).map(port => [port.portId, port.kind, port.required]), [['presence','data',true], ['data','data',false]]);
    const command = api.resolveNativeSearchChoice(value, item.id);
    assert.equal(command.requiresConfiguration, true);
    assert.equal(Object.hasOwn(command.controls ?? {}, 'actorId'), false);
    assert.equal(describeOperation(scope('native-unified'), {type:'workflow', ...operationDefaults(command.operation), ...command.controls}).ok, false);
});
