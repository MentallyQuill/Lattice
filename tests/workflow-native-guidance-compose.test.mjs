import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definition-data.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {actorHostFixture as fixture,mara,elias} from './helpers/native-actor-host-fixture.mjs';
import {recallHostFixture as recallFixture} from './helpers/native-recall-host-fixture.mjs';
import {operationDefaults} from '../src/workflow/catalog.js?v=0.27.2';
function addCompose(f, nested = false) {
    const node = (id, settings) => f.graph.nodes[id] = { id, type: 'workflow', ...operationDefaults('compose'), outputKind: 'guidance', ...settings };
    const wire = (id, from, fromPort, to, toPort) => f.graph.wires[id] = { id, route: 'wire', from, fromPort, to, toPort };
    delete f.graph.wires.guidance;
    node('compose', { sections: [{ name: 'public', text: 'Public weather.' }, { name: 'actor', text: '', kind: 'guidance' }] });
    wire('actorMerge', 'direction', 'out', 'compose', 'section.actor');
    if (nested) { node('outer', { sections: [{ name: 'inner', text: '', kind: 'guidance' }, { name: 'public', text: 'Public ending.' }] }); wire('innerMerge', 'compose', 'out', 'outer', 'section.inner'); }
    wire('guidance', nested ? 'outer' : 'compose', 'out', 'generate', 'guidance');
}

test('native Compose injects public plus exact current actor Character Direction once', async () => {
    const f = fixture(); addCompose(f);
    try {
        const ready = await f.start(); assert.equal(ready.ok, true, JSON.stringify(ready.error));
        assert.ok(Object.values(f.c.extensionPrompts).some(p => p.value === 'Public weather.\n\nMara considers the sea.'));
        const result = await f.complete(); assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal((await f.controller.apply(result.reviewHandles[0])).ok, true);
    } finally { f.controller.dispose(); }
});

test('a cleared run registry cannot retain late aggregates or authorize late originals', async () => {
    const { createNativeGuidanceComposition } = await import('../src/workflow/native-guidance-compose.js');
    const registry = createNativeGuidanceComposition();
    const source = Object.freeze({ kind: 'guidance', text: 'Private.', visibility: { kind: 'actor-private', actorId: mara } });
    const artifact = Object.freeze({ kind: 'guidance', text: 'Private.', visibility: source.visibility });
    const payload = { node: { operation: 'compose', outputKind: 'guidance', sections: [{ name: 'source', text: '', kind: 'guidance' }] }, inputs: { 'section.source': source }, artifact, portId: 'out' };
    registry.clear();
    assert.equal(registry.retain(payload).ok, false);
    assert.equal(registry.authorize(artifact, () => ({ ok: true })).ok, false);
});

test('authentic private Guidance crosses a legal static system boundary before nested composition', async () => {
    const f = fixture(); addCompose(f, true);
    wrapDirection(f);
    try {
        const ready = await f.start(); assert.equal(ready.ok, true, JSON.stringify(ready.error));
        assert.ok(Object.values(f.c.extensionPrompts).some(p => p.value === 'Public weather.\n\nMara considers the sea.\n\nPublic ending.'));
        const result = await f.complete(); assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal((await f.controller.apply(result.reviewHandles[0])).ok, true);
    } finally { f.controller.dispose(); }
});

function wrapDirection(f) {
    const direction = f.graph.nodes.direction;
    const body = { schema: 3, runtime: 2, mode: 'native-unified', nodes: { input: { id: 'input', type: 'subgraph-input', interfacePortId: 'presence' }, direction, output: { id: 'output', type: 'subgraph-output', interfacePortId: 'guidance' } }, wires: {
        presence: { id: 'presence', route: 'wire', from: 'input', fromPort: 'out', to: 'direction', toPort: 'presence' },
        guidance: { id: 'guidance', route: 'wire', from: 'direction', fromPort: 'out', to: 'output', toPort: 'in' },
    } };
    const identity = computeDefinitionIdentity({ id: 'actor-system', version: 1, name: 'Actor system', parameters: [], body, interface: [
        { id: 'presence', label: 'Presence', kind: 'data', direction: 'input', required: true, cardinality: 'one', boundaryNodeId: 'input' },
        { id: 'guidance', label: 'Guidance', kind: 'guidance', direction: 'output', required: false, cardinality: 'one', boundaryNodeId: 'output' },
    ] }); assert.equal(identity.ok, true, JSON.stringify(identity.error));
    const definition = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    f.graph.definitions[definitionRefKey(definition)] = definition;
    delete f.graph.nodes.direction;
    f.graph.nodes.system = { id: 'system', type: 'subgraph', definition: { id: definition.id, version: definition.version, semanticHash: definition.semanticHash } };
    f.graph.wires.present.to = 'system'; f.graph.wires.present.toPort = 'presence';
    f.graph.wires.actorMerge.from = 'system'; f.graph.wires.actorMerge.fromPort = 'guidance';
}

test('disabled nested Character Direction omits guidance without actor discovery or source calls', async () => {
    const f = fixture(); addCompose(f); wrapDirection(f); f.graph.nodes.system.enabled = false;
    f.graph.nodes.compose.sections[1].onSkipped = 'omit';
    for (const id of ['scene', 'castPrompt', 'cast', 'mara', 'elias']) delete f.graph.nodes[id];
    for (const [id, wire] of Object.entries(f.graph.wires)) if (!f.graph.nodes[wire.from] || !f.graph.nodes[wire.to]) delete f.graph.wires[id];
    f.c.characterId = 99;
    try {
        const ready = await f.start(); assert.equal(ready.ok, true, JSON.stringify(ready.error));
        assert.equal(f.requests.length, 0);
        assert.ok(Object.values(f.c.extensionPrompts).some(p => p.value === 'Public weather.'));
    } finally { f.controller.dispose(); }
});

test('root Recall composes with public guidance and consumes only the accepted native reply', async () => {
    const f = recallFixture();
    addRecallCompose(f);
    try {
        assert.equal(f.controller.queueRecall('hotkey').ok, true);
        const ready = await f.start(); assert.equal(ready.ok, true, JSON.stringify(ready.error));
        assert.ok(Object.values(f.c.extensionPrompts).some(p => p.value.startsWith('Public weather.\n\n') && p.value.includes('PRIVATE harbor memory')));
        assert.equal(f.controller.statusRecall().data.shortcuts[0].queued, true);
        const result = await f.complete(); assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(f.controller.statusRecall().data.shortcuts[0].queued, true);
        assert.equal((await f.controller.apply(result.reviewHandles[0])).ok, true);
        assert.equal(f.controller.statusRecall().data.shortcuts[0].queued, false);
        assert.equal(JSON.stringify(result).includes('originals'), false);
        assert.equal(JSON.stringify(f.graph).includes('PRIVATE harbor memory'), false);
    } finally { f.controller.dispose(); }
});

test('native aggregate currentness is rechecked after tokenizer and prompt setter callbacks', async () => {
    for (const checkpoint of ['tokenizer', 'setter']) {
        let changed = false;
        const f = fixture('direction', { onCount(text, c) { if (checkpoint === 'tokenizer' && text.startsWith('Public weather.') && !changed) { changed = true; c.characters[0].data.description = 'Changed private card.'; } } });
        addCompose(f);
        const setter = f.c.setExtensionPrompt;
        f.c.setExtensionPrompt = (key, value) => { setter(key, value); if (checkpoint === 'setter' && value.startsWith('Public weather.') && !changed) { changed = true; f.c.characterId = 1; } };
        try {
            const ready = await f.start(); assert.equal(changed, true, checkpoint); assert.equal(ready.ok, false, checkpoint);
            assert.equal(Object.values(f.c.extensionPrompts).some(p => p.value), false, checkpoint);
            assert.equal(ready.reviewHandles.length, 0);
            assert.equal(f.c.chatMetadata.latticeDocuments, undefined);
        } finally { f.controller.dispose(); }
    }
});

test('native aggregate authorization rejects cloned and forged envelopes despite copied provenance', async () => {
    const hostURL = new URL('../src/workflow/host.js?composition-proof-capture', import.meta.url).href;
    const registryURL = new URL('../src/workflow/native-guidance-compose.js', import.meta.url).href;
    const state = {}; globalThis.latticeCompositionProofCapture = state;
    const adapter = 'data:text/javascript,' + encodeURIComponent(`import {createNativeGuidanceComposition as real} from ${JSON.stringify(registryURL)};export const createNativeGuidanceComposition=()=>{const service=real();globalThis.latticeCompositionProofCapture.service=service;return Object.freeze({...service,retain(payload){if(payload.node.operation==='compose')globalThis.latticeCompositionProofCapture.payload=payload;return service.retain(payload);},authorize(artifact,original){globalThis.latticeCompositionProofCapture.original=original;return service.authorize(artifact,original);}});};`);
    const hook = registerHooks({ resolve(specifier, context, next) { return context.parentURL === hostURL && specifier.startsWith('./native-guidance-compose.js') ? { url: adapter, shortCircuit: true } : next(specifier, context); } });
    let f;
    try {
        const { createNativeWorkflowController: controllerFactory } = await import(hostURL);
        f = fixture('direction', { controllerFactory }); addCompose(f);
        assert.equal((await f.start()).ok, true);
        assert.equal(state.service.authorize(state.payload.artifact, state.original).ok, true);
        for (const artifact of [Object.freeze(structuredClone(state.payload.artifact)), Object.freeze({ ...state.payload.artifact, text: 'Rewritten private instructions.' }), Object.freeze({ ...state.payload.artifact, sourceRefs: [{ sourceId: 'forged', revision: 'fake' }] })]) {
            assert.equal(state.service.authorize(artifact, state.original).ok, false);
        }
        const modified = Object.freeze({ ...state.payload.artifact, text: 'Modified after composition.' });
        assert.equal(state.service.retain({ ...state.payload, artifact: modified }).ok, false);
        const original = state.payload.inputs['section.actor'];
        const clonedSource = Object.freeze(structuredClone(original));
        const copied = Object.freeze({ ...state.payload.artifact });
        assert.equal(state.service.retain({ ...state.payload, inputs: { ...state.payload.inputs, 'section.actor': clonedSource }, artifact: copied }).ok, true);
        assert.equal(state.service.authorize(copied, state.original).ok, false);
    } finally { f?.controller.dispose(); hook.deregister(); delete globalThis.latticeCompositionProofCapture; }
});

test('native Compose blocks private Text even when its connected text is unused by the template', async () => {
    const f = fixture(); addCompose(f);
    f.graph.nodes.privateText = { id: 'privateText', type: 'workflow', ...operationDefaults('read-file'), targetId: 'mara.md' };
    f.graph.nodes.compose.sections.push({ name: 'privateText', text: '', kind: 'text' });
    f.graph.nodes.compose.mode = 'template'; f.graph.nodes.compose.template = '{{section:public}}';
    f.graph.wires.privateText = { id: 'privateText', route: 'wire', from: 'privateText', fromPort: 'text', to: 'compose', toPort: 'section.privateText' };
    try {
        const ready = await f.start(); assert.equal(ready.ok, false); assert.equal(ready.error.code, 'ACTOR_GUIDANCE_UNVERIFIED', JSON.stringify(ready.error));
        assert.equal(Object.values(f.c.extensionPrompts).some(p => p.value), false);
        assert.equal(ready.reviewHandles.length, 0);
        assert.equal(f.c.chatMetadata.latticeDocuments, undefined);
    } finally { f.controller.dispose(); }
});

test('native composed guidance denies authentic other-actor and hidden contributions', async () => {
    for (const restricted of ['other-actor', 'hidden']) {
        const f = fixture(); addCompose(f);
        if (restricted === 'other-actor') {
            f.graph.nodes.direction.actorId = elias; f.graph.wires.present.from = 'elias';
        } else {
            assert.equal(f.catalog.define({ targetId: 'hidden.md', name: 'Hidden', format: 'text', content: 'Hidden source.', visibility: { kind: 'hidden' } }).ok, true);
            f.graph.nodes.hiddenRead = { id: 'hiddenRead', type: 'workflow', ...operationDefaults('read-file'), targetId: 'hidden.md' };
            f.graph.nodes.compose.sections.push({ name: 'hiddenSource', text: '' });
            f.graph.wires.hiddenInput = { id: 'hiddenInput', route: 'wire', from: 'hiddenRead', fromPort: 'text', to: 'compose', toPort: 'section.hiddenSource' };
        }
        try {
            const ready = await f.start(); assert.equal(ready.ok, false, restricted);
            assert.equal(Object.values(f.c.extensionPrompts).some(p => p.value), false, restricted);
            assert.equal(ready.reviewHandles.length, 0);
        } finally { f.controller.dispose(); }
    }
});

function addRecallCompose(f) {
    f.graph.nodes.compose = { id: 'compose', type: 'workflow', ...operationDefaults('compose'), outputKind: 'guidance', sections: [{ name: 'public', text: 'Public weather.' }, { name: 'memory', text: '', kind: 'guidance', onSkipped: 'omit' }] };
    f.graph.wires.guidance.to = 'compose'; f.graph.wires.guidance.toPort = 'section.memory';
    f.graph.wires.composed = { id: 'composed', route: 'wire', from: 'compose', fromPort: 'out', to: 'generate', toPort: 'guidance' };
}

test('composed Recall preview and rejection preserve queues without installing or settling effects', async () => {
    const f = recallFixture(); addRecallCompose(f);
    try {
        assert.equal(f.controller.queueRecall('hotkey').ok, true);
        const preview = await f.controller.runTarget(f.graph, { workflowId: f.graph.id, instancePath: [], nodeId: 'compose', portId: 'out' });
        assert.equal(preview.ok, true, JSON.stringify(preview.error));
        assert.equal(Object.values(f.c.extensionPrompts).some(p => p.value), false);
        assert.equal(preview.reviewHandles.length, 0);
        assert.equal(f.controller.statusRecall().data.shortcuts[0].queued, true);
        f.results.length = 0;
        assert.equal((await f.start()).ok, true);
        const result = await f.complete(); assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.equal(f.controller.reject(result.reviewHandles[0]).ok, true);
        assert.equal(f.controller.statusRecall().data.shortcuts[0].queued, true);
        assert.equal(f.c.chatMetadata.latticeDocuments, undefined);
    } finally { f.controller.dispose(); }
});

test('composed Recall source mutation or cancellation during native admission revokes injection and pending claims', async () => {
    for (const mutation of ['tokenizer-source', 'setter-source', 'stop']) {
        let changed = false;
        let f;
        const mutate = async c => { changed = true; if (mutation === 'stop') await c.eventSource.emit('GENERATION_STOPPED'); else c.chatMetadata.latticeDocuments = { 'default-user': { 'moments.json': { content: 'Changed source.', revision: 1 } } }; };
        f = recallFixture({ onCount: async (text, c) => { if (!changed && text.startsWith('Public weather.') && mutation !== 'setter-source') await mutate(c); }, onPrompt: (text, c) => { if (!changed && text.startsWith('Public weather.') && mutation === 'setter-source') void mutate(c); } });
        addRecallCompose(f);
        try {
            assert.equal(f.controller.queueRecall('hotkey').ok, true);
            const ready = await f.start(); assert.equal(changed, true, mutation); assert.equal(ready.ok, false, mutation);
            assert.equal(Object.values(f.c.extensionPrompts).some(p => p.value), false, mutation);
            assert.equal(ready.reviewHandles.length, 0);
            assert.equal(f.controller.statusRecall().data.shortcuts[0].queued, true);
            assert.equal(f.controller.statusRecall().data.shortcuts[0].pendingCount, 0);
        } finally { f.controller.dispose(); }
    }
});

test('composition authorization reads own authorizer Results without getter execution or reentrant release admission', async () => {
    const { createNativeGuidanceComposition } = await import('../src/workflow/native-guidance-compose.js');
    const source = Object.freeze({ kind: 'guidance', text: 'Private.', visibility: { kind: 'actor-private', actorId: mara } });
    const registry = createNativeGuidanceComposition(); let reads = 0;
    const response = {}; Object.defineProperty(response, 'ok', { enumerable: true, get() { reads++; registry.clear(); return true; } });
    assert.equal(registry.authorize(source, () => response).ok, false);
    assert.equal(reads, 0);
    assert.equal(registry.authorize(source, () => { registry.clear(); return { ok: true }; }).ok, false);
});

test('Compose and Generate retain independent rendered budgets in native execution', async () => {
    for (const boundary of ['compose', 'generate']) {
        const f = fixture(); addCompose(f);
        f.graph.nodes.compose.budgetTokens = boundary === 'compose' ? 1 : 4096;
        f.graph.nodes.generate.budgetTokens = boundary === 'generate' ? 1 : 4096;
        try {
            const ready = await f.start(); assert.equal(ready.ok, false);
            assert.equal(ready.error.code, boundary === 'compose' ? 'COMPOSE_OVERFLOW' : 'GUIDANCE_OVERFLOW');
            assert.equal(ready.error.nodeId, boundary);
            assert.equal(Object.values(f.c.extensionPrompts).some(p => p.value), false);
        } finally { f.controller.dispose(); }
    }
});


function presenceFileSystem(f, enabled, readPhase = 'post') {
    delete f.graph.nodes.direction; delete f.graph.wires.present; delete f.graph.wires.guidance;
    for (const id of Object.keys(f.graph.nodes)) if (id.startsWith('elias') || id.startsWith('mara') && id !== 'mara') delete f.graph.nodes[id];
    for (const [id, wire] of Object.entries(f.graph.wires)) if (!f.graph.nodes[wire.from] || !f.graph.nodes[wire.to]) delete f.graph.wires[id];
    const node = (id, operation, settings = {}) => ({ id, type: 'workflow', ...operationDefaults(operation), ...settings });
    const wire = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
    const body = { schema: 3, runtime: 2, mode: 'native-unified', nodes: {
        presence: { id: 'presence', type: 'subgraph-input', interfacePortId: 'presence' },
        read: node('read', 'read-file', { targetId: 'mara.md', actorScope: 'presence', actorId: mara, phase: readPhase }),
        note: node('note', 'text', { text: 'Scoped file note.', phase: 'post' }),
        write: node('write', 'write-file', { mode: 'append', actorScope: 'presence', actorId: mara }),
    }, wires: {
        readPresence: wire('readPresence', 'presence', 'out', 'read', 'presence'),
        writePresence: wire('writePresence', 'presence', 'out', 'write', 'presence'),
        reference: wire('reference', 'read', 'reference', 'write', 'reference'),
        note: wire('note', 'note', 'out', 'write', 'text'),
    } };
    const identity = computeDefinitionIdentity({ id: 'presence-files', version: 1, name: 'Presence files', parameters: [], body, interface: [
        { id: 'presence', label: 'Presence', kind: 'data', direction: 'input', required: true, cardinality: 'one', boundaryNodeId: 'presence' },
    ] }); assert.equal(identity.ok, true, JSON.stringify(identity.error));
    const definition = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    f.graph.definitions[definitionRefKey(definition)] = definition;
    f.graph.nodes.files = { id: 'files', type: 'subgraph', enabled, definition: { id: definition.id, version: definition.version, semanticHash: definition.semanticHash } };
    f.graph.wires.systemPresence = wire('systemPresence', 'mara', 'out', 'files', 'presence');
}

test('nested presence files alone start the Main scene session and disabled files skip discovery and effects', async () => {
    for (const enabled of [true, false]) {
        let verified = 0;
        const f = fixture('files', { onVerify() { verified++; } }); presenceFileSystem(f, enabled);
        if (!enabled) f.c.characterId = 99; // Any actor discovery would now fail.
        try {
            const authored = [...Object.values(f.graph.nodes), ...Object.values(Object.values(f.graph.definitions)[0].body.nodes)];
            assert.equal(authored.some(node => ['character-direction', 'actor-context', 'recall', 'hotkey-arm', 'prompted-memory'].includes(node.operation)), false);
            const ready = await f.start(); assert.equal(ready.ok, true, JSON.stringify(ready.error));
            assert.equal(f.requests.length, 0);
            const result = await f.complete(); assert.equal(result.ok, true, JSON.stringify(result.error));
            assert.equal(f.requests.length, enabled ? 1 : 0);
            if (enabled) {
                const source = JSON.parse(f.requests[0].messages.at(-1).content).data;
                assert.equal(typeof source.sourceId, 'string'); assert.ok(source.sourceId);
                assert.equal(typeof source.revision, 'string'); assert.ok(source.revision);
                assert.equal(source.sceneId, 'Story-2'); assert.equal(source.watch, 'draft');
                assert.equal(source.text, f.c.chat.at(-1).mes);
            }
            for (const operation of ['read-file', 'write-file']) {
                const unit = result.recording.units.find(unit => unit.operation === operation);
                if (enabled) assert.equal(unit.status, 'completed');
                else assert.ok(['not-run', 'skipped'].includes(unit.status), operation + ' must not execute');
            }
            assert.equal(f.c.chatMetadata.latticeDocuments, undefined); assert.equal(verified, 0);
            const accepted = await f.controller.apply(result.reviewHandles[0]); assert.equal(accepted.ok, true, JSON.stringify(accepted.error));
            if (enabled) {
                assert.equal(accepted.settlement.status, 'settled'); assert.equal(verified, 1);
                const content = f.c.chatMetadata.latticeDocuments['default-user']['mara.md'].content;
                assert.ok(content.includes('PRIVATE SEA reflection')); assert.ok(content.includes('Scoped file note.'));
            } else { assert.equal(verified, 0); assert.equal(f.c.chatMetadata.latticeDocuments, undefined); }
            assert.equal(Object.values(f.c.extensionPrompts).some(prompt => prompt.value), false);
            assert.equal(f.c.chat.at(-1).mes.includes('PRIVATE SEA'), false);
        } finally { f.controller.dispose(); }
    }
});


test('nested presence files reject pre-reply presence for a write after native completion', async () => {
    let verified = 0;
    const f = fixture('direction', { onVerify() { verified++; } }); presenceFileSystem(f, true, 'pre');
    try {
        const ready = await f.start(); assert.equal(ready.ok, true, JSON.stringify(ready.error));
        assert.equal(f.requests.length, 1);
        const result = await f.complete(); assert.equal(result.ok, false);
        assert.equal(result.error.code, 'ACTOR_PRESENCE_UNVERIFIED'); assert.equal(result.error.nodeId, 'write');
        assert.equal(result.reviewHandles.length, 0); assert.equal(verified, 0);
        assert.equal(f.c.chatMetadata.latticeDocuments, undefined);
        assert.equal(Object.values(f.c.extensionPrompts).some(prompt => prompt.value), false);
    } finally { f.controller.dispose(); }
});


test('private aggregate authorization admits exact depth and occurrence bounds and rejects one over', async () => {
 const {createNativeGuidanceComposition}=await import('../src/workflow/native-guidance-compose.js');const registry=createNativeGuidanceComposition(),visibility=Object.freeze({kind:'actor-private',actorId:mara}),leaf=Object.freeze({kind:'guidance',text:'',visibility});
 const compose=originals=>{const sections=originals.map((_,i)=>({name:'s'+i,text:'',kind:'guidance'})),node={id:'bounded',type:'workflow',...operationDefaults('compose'),outputKind:'guidance',separator:'',sections},artifact=Object.freeze({kind:'guidance',text:'',visibility}),inputs=Object.fromEntries(originals.map((a,i)=>['section.s'+i,a]));assert.equal(registry.retain({node,artifact,inputs,portId:'out'}).ok,true);return artifact;};
 let exact=leaf;for(let i=0;i<32;i++)exact=compose([exact]);let calls=0;assert.equal(registry.authorize(exact,()=>{calls++;return {ok:true};}).ok,true);assert.equal(calls,1);
 assert.equal(registry.authorize(compose([exact]),()=>({ok:true})).ok,false);
 const branch=compose(Array(63).fill(leaf)),short=compose(Array(62).fill(leaf));calls=0;
 assert.equal(registry.authorize(compose([...Array(63).fill(branch),short]),()=>{calls++;return {ok:true};}).ok,true);assert.equal(calls,4031);
 assert.equal(registry.authorize(compose(Array(64).fill(branch)),()=>({ok:true})).ok,false);
});
