import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRecord } from '../src/workflow/introspection/contracts.js';
import { advanceState } from '../src/workflow/introspection/context-state.js';
import { createNativeWorkflowController,snapshotContext } from '../src/workflow/host.js';
import {executeIntrospection} from '../src/workflow/introspection/nodes.js';
import { operationDefaults } from '../src/workflow/catalog.js';
import {nativeFixture,reviewGraph} from './helpers/native-workflow-fixture.mjs';

let createNativeMemoryAdapter;
try { ({ createNativeMemoryAdapter } = await import('../src/workflow/introspection/host-memory.js')); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
    const c = { chatId: 'one', characterId: 0, groupId: null, characters: [{ avatar: 'alice.png' }, { avatar: 'bob.png' }], chatMetadata: { unrelated: { keep: true } }, chat: [{ is_user: true, mes: 'An apology was offered.', send_date: 1 }, { is_user: false, mes: 'Alice accepted the apology.', swipe_id: 0, swipes: ['Alice accepted the apology.'], gen_started: 2, gen_finished: 3, extra: { reasoning: 'Private reasoning must never become an event.' } }] };
    let writes = 0;
    c.saveMetadata = async () => { writes++; return true; };
    assert.equal(typeof createNativeMemoryAdapter, 'function', 'the trusted native memory adapter must exist');
    const adapter = createNativeMemoryAdapter({ context: () => c });
    const capture = () => { const controller = new AbortController(); const result = adapter.capture({ signal: controller.signal, isCurrent: () => true }); assert.equal(result.ok, true); return { ...result.data, controller }; };
    return { c, adapter, capture, writes: () => writes };
}
async function intent(session, key = 'turn') {
    const prior = await session.memory.read({ view: 'state' }); assert.equal(prior.ok, true);
    const events = await session.memory.read({ view: 'events' }); assert.equal(events.ok, true);
    const proposal = advanceState(prior.artifact, { mode: 'track', trackId: 'apologies' }, events.artifact); assert.equal(proposal.ok, true);
    const result = makeRecord('commit-intent', proposal.artifact.value, { proposal: proposal.artifact.value, idempotencyKey: key }, proposal.artifact.value.sourceRefs); assert.equal(result.ok, true);
    return result.data;
}
test('native memory commits two settled turns and reads exact selected text without private metadata', async () => {
    const f = fixture(); const first = f.capture();
    const events = await first.memory.read({ view: 'events' });
    assert.deepEqual(events.artifact.value.payload.events.map(event => event.text), f.c.chat.map(message => message.mes));
    assert.equal(JSON.stringify(events).includes('Private reasoning'), false);
    const request = await intent(first, 'one');
    assert.equal((await first.memory.commit(request, { root: true })).data.acknowledged, true);
    f.c.chat.push({ is_user: true, mes: 'A second apology arrived.', send_date: 4 });
    const second = f.capture();
    assert.equal((await second.memory.read({ view: 'state' })).artifact.value.store.version, 1);
    assert.equal((await second.memory.commit(await intent(second, 'two'), { root: true })).data.version, 2);
    assert.equal(f.writes(), 2); assert.deepEqual(f.c.chatMetadata.unrelated, { keep: true });
});
test('native wired Memory Recall stays within the selected actor namespace',async()=>{
    const f=fixture(),session=f.capture();
    const prior=await session.memory.read({view:'state'}),events=await session.memory.read({view:'events'});
    const refs=[events.artifact.value.sourceRefs[0]];
    const proposed=makeRecord('state-proposal',prior.artifact.value,{changes:[{op:'upsert',collection:'episodes',item:{id:'lighthouse',text:'Alice remembers the lighthouse.',classification:'interpretation',sourceRefs:refs}}]},refs).data;
    const committed=await session.memory.commit(makeRecord('commit-intent',proposed.value,{proposal:proposed.value,idempotencyKey:'lighthouse'},refs).data,{root:true});
    assert.equal(committed.ok,true,JSON.stringify(committed.error));
    const graph={...nativeGraph(),nodes:{query:{...operationDefaults('text'),id:'query',type:'workflow',phase:'post',x:0,y:0,text:'lighthouse'},recall:{...operationDefaults('memory',{mode:'recall'}),id:'recall',type:'workflow',phase:'post',x:0,y:0,query:'garden'}},wires:{query:{id:'query',route:'wire',from:'query',fromPort:'out',to:'recall',toPort:'query'}}};
    const controller=createNativeWorkflowController({context:()=>f.c,userId:()=> 'default-user',isBusy:()=>false});
    const run=async()=>{
        const result=await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'recall',portId:'out'});
        assert.equal(result.ok,true,JSON.stringify(result.error));
        assert.equal(result.actualCalls,0);
        return result.recording.artifacts.find(entry=>entry.origin.direction==='output'&&entry.value?.value?.recordType==='episodes')?.value;
    };
    const alice=await run();
    assert.deepEqual(alice.value.payload.episodes.map(episode=>episode.id),['lighthouse']);
    assert.equal(alice.value.scope.actorId,'character:alice.png');
    f.c.characterId=1;
    const bob=await run();
    assert.deepEqual(bob.value.payload.episodes,[]);
    assert.equal(bob.value.scope.actorId,'character:bob.png');
    assert.equal(f.writes(),1);
});
for (const [name, mutate] of [['edit', c => { c.chat[1].mes = 'Edited'; }], ['swipe', c => { c.chat[1].swipe_id = 1; c.chat[1].mes = 'Another swipe'; }], ['delete', c => { c.chat.splice(1, 1); }], ['chat switch', c => { c.chatId = 'two'; }], ['actor switch', c => { c.characterId = 1; }]]) {
    test(`native ${name} rejects pending evidence before persistence`, async () => {
        const f = fixture(); const session = f.capture(); const request = await intent(session);
        mutate(f.c);
        assert.equal((await session.memory.commit(request, { root: true })).ok, false);
        assert.equal(f.writes(), 0);
    });
}
test('stored historical evidence is invalidated by selected message edits without rewriting history', async () => {
    const f = fixture(); const session = f.capture(); assert.equal((await session.memory.commit(await intent(session), { root: true })).ok, true);
    const stored = structuredClone(f.c.chatMetadata.latticeIntrospection);
    f.c.chat[1].mes = 'Edited selected reply';
    const read = await f.capture().memory.read({ view: 'state' });
    assert.ok(read.reports.some(report => report.code === 'INVALIDATED_SOURCES'));
    assert.deepEqual(f.c.chatMetadata.latticeIntrospection, stored);
});
test('native cancellation during an awaited source digest cannot persist late', async () => {
    const f = fixture(); const session = f.capture(); const request = await intent(session);
    session.controller.abort();
    assert.equal((await session.memory.commit(request, { root: true })).ok, false); assert.equal(f.writes(), 0);
});
test('native preview target dry-run and nonroot commits never write', async () => {
    for (const flags of [{ root: false }, { root: true, preview: true }, { root: true, dryRun: true }, {}]) {
        const f = fixture(); const session = f.capture(); assert.equal((await session.memory.commit(await intent(session), flags)).ok, false); assert.equal(f.writes(), 0);
    }
});
test('native receipts make an identical retry idempotent', async () => {
    const f = fixture(); const session = f.capture(); const request = await intent(session);
    assert.equal((await session.memory.commit(request, { root: true })).data.applied, true);
    const replay = await session.memory.commit(request, { root: true }); assert.equal(replay.ok, true); assert.equal(replay.data.applied, false); assert.equal(f.writes(), 1);
});
test('native save errors remain unknown through metadata clones until a newly loaded adapter reads the receipt', async () => {
    const f = fixture(); f.c.saveMetadata = async () => { throw new Error('Unconfirmed save'); };
    const session = f.capture(); const request = await intent(session);
    const saved = await session.memory.commit(request, { root: true }); assert.equal(saved.ok, true); assert.equal(saved.data.acknowledged, false);
    assert.equal((await session.memory.commit(request, { root: true })).error.code, 'PERSISTENCE_UNKNOWN');
    f.c.chatMetadata = structuredClone(f.c.chatMetadata);
    assert.equal((await session.memory.commit(request, { root: true })).error.code, 'PERSISTENCE_UNKNOWN');
    const reloaded = createNativeMemoryAdapter({ context: () => f.c }).capture().data;
    const replay = await reloaded.memory.commit(request, { root: true }); assert.equal(replay.ok, true); assert.equal(replay.data.applied, false); assert.equal(replay.data.acknowledged, true);
});
test('normal void saves allow distinct next-turn intents while keeping each exact replay unconfirmed', async () => {
    const f = fixture(); let writes = 0; f.c.saveMetadata = async () => { writes++; };
    const first = f.capture(); const firstRequest = await intent(first, 'void-one');
    const firstSaved = await first.memory.commit(firstRequest, { root: true }); assert.equal(firstSaved.ok, true); assert.equal(firstSaved.data.acknowledged, false);
    f.c.chat.push({ is_user: true, mes: 'Another settled turn.', send_date: 4 });
    const second = f.capture(); const secondRequest = await intent(second, 'void-two'); assert.equal(secondRequest.value.store.version, 1);
    const secondSaved = await second.memory.commit(secondRequest, { root: true }); assert.equal(secondSaved.ok, true, JSON.stringify(secondSaved.error)); assert.equal(secondSaved.data.applied, true); assert.equal(secondSaved.data.acknowledged, false); assert.equal(secondSaved.data.version, 2);
    for (const request of [firstRequest, secondRequest]) assert.equal((await second.memory.commit(request, { root: true })).error.code, 'PERSISTENCE_UNKNOWN');
    assert.equal(writes, 2);
    f.c.chatMetadata = structuredClone(f.c.chatMetadata);
    for (const request of [firstRequest, secondRequest]) assert.equal((await second.memory.commit(request, { root: true })).error.code, 'PERSISTENCE_UNKNOWN');
    const reloaded = createNativeMemoryAdapter({ context: () => f.c }).capture().data;
    for (const request of [firstRequest, secondRequest]) { const replay = await reloaded.memory.commit(request, { root: true }); assert.equal(replay.ok, true); assert.equal(replay.data.applied, false); assert.equal(replay.data.acknowledged, true); }
    assert.equal(writes, 2);
});
test('unconfirmed native commit keys reject conflicting content without a second save', async () => {
    const f = fixture(); let writes = 0; f.c.saveMetadata = async () => { writes++; };
    const session = f.capture(); const request = await intent(session, 'pending-key'); assert.equal((await session.memory.commit(request, { root: true })).ok, true);
    const conflict = await intent(session, 'pending-key');
    assert.equal((await session.memory.commit(conflict, { root: true })).error.code, 'IDEMPOTENCY_CONFLICT'); assert.equal(writes, 1);
});
for (const [name, mutate] of [['rollback', metadata => { metadata.state.value.store.version = 0; }], ['missing receipt', metadata => { metadata.receipts = []; }], ['missing local state', metadata => { delete metadata.state; }]]) {
    test(`unconfirmed native ${name} cannot authorize replay or a fresh write`, async () => {
        const f = fixture(); let writes = 0; f.c.saveMetadata = async () => { writes++; };
        const session = f.capture(); const request = await intent(session, 'pending'); assert.equal((await session.memory.commit(request, { root: true })).ok, true);
        const next = await intent(session, 'next'); mutate(f.c.chatMetadata.latticeIntrospection['native-chat']['character:alice.png']);
        for (const candidate of [request, next]) assert.equal((await session.memory.commit(candidate, { root: true })).error.code, 'PERSISTENCE_UNKNOWN');
        assert.equal(writes, 1);
    });
}
test('the native metadata critical section preserves concurrent updates to another namespace', async () => {
    const f = fixture(); const session = f.capture(); const request = await intent(session);
    const original = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle); const entered = deferred(); const release = deferred(); let pause = true;
    globalThis.crypto.subtle.digest = async (...args) => { if (pause) { pause = false; entered.resolve(); await release.promise; } return original(...args); };
    try {
        const pending = session.memory.commit(request, { root: true }); await entered.promise;
        f.c.chatMetadata.unrelated = { keep: true, contemporaneous: 'preserved' }; release.resolve();
        assert.equal((await pending).ok, true); assert.deepEqual(f.c.chatMetadata.unrelated, { keep: true, contemporaneous: 'preserved' });
    } finally { globalThis.crypto.subtle.digest = original; release.resolve(); }
});
test('group chats require an actual host-selected actor and unfinished content is excluded', async () => {
    const f = fixture(); f.c.groupId = 'group'; f.c.characterId = null;
    assert.equal(f.adapter.capture({ signal: new AbortController().signal, isCurrent: () => true }).error.code, 'ACTOR_REQUIRED');
    const selected = createNativeMemoryAdapter({ context: () => f.c, selectActor: () => 'character:alice.png' });
    const session = selected.capture({ signal: new AbortController().signal, isCurrent: () => true }).data;
    f.c.chat.push({ mes: 'Partial candidate', is_user: false, gen_started: 10, extra: { partial: true } });
    assert.equal((await session.memory.read({ view: 'events' })).artifact.value.payload.events.length, 2);
});

function nativeGraph() {
    const node = (id, operation, controls = {}) => ({ ...operationDefaults(operation, controls.mode ? { mode: controls.mode } : {}), id, type: 'workflow', phase:'post', x: 0, y: 0, ...controls });
    return { id: 'memory-native', name: 'Memory track', schema: 3, runtime: 2, mode: 'native-unified', roles: {}, groups: {}, portals: {}, definitions: {},
        nodes: { state: node('state', 'memory'), events: node('events', 'memory', { view: 'events' }), track: node('track', 'state', { mode: 'track' }), commit: node('commit', 'memory', { mode: 'commit' }) },
        wires: { state: { id: 'state', route: 'wire', from: 'state', fromPort: 'out', to: 'track', toPort: 'state' }, events: { id: 'events', route: 'wire', from: 'events', fromPort: 'out', to: 'track', toPort: 'events' }, commit: { id: 'commit', route: 'wire', from: 'track', fromPort: 'out', to: 'commit', toPort: 'proposal' } } };
}
test('native target execution returns the intent and never persists it', async () => {
    const f = fixture(); const graph = nativeGraph(); const controller = createNativeWorkflowController({ context: () => f.c, userId:()=> 'default-user', isBusy: () => false });
    const result = await controller.runTarget(graph, { kind: 'terminal', address: { workflowId: graph.id, instancePath: [], nodeId: 'commit' } });
    assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(f.writes(), 0); assert.equal(result.memoryCommit, undefined);
});
test('a failed independent native branch prevents every memory terminal from settling', async () => {
    const f = fixture(); const graph = nativeGraph();
    f.c.chat[1].swipe_info=[{extra:structuredClone(f.c.chat[1].extra),gen_started:2,gen_finished:3}];
    const repair = reviewGraph();
    Object.assign(graph.nodes, repair.nodes); Object.assign(graph.wires, repair.wires); graph.roles = repair.roles; graph.groups = repair.groups;
    let requests = 0;
    const native = nativeFixture(graph,{context:f.c,request:async()=>{requests++;return {ok:false,error:{code:'REQUEST_FAILED',message:'Synthetic branch failure'}};}});
    const result = await native.generate(graph); assert.equal(result.ok, false); assert.equal(f.writes(), 0);
    assert.equal(requests, 1, JSON.stringify(result.error));
});
test('stopping the native controller while selected evidence is pending cannot save late', async () => {
    const f = fixture(); const graph = nativeGraph(); const controller = createNativeWorkflowController({ context: () => f.c, userId:()=> 'default-user', isBusy: () => false });
    const original = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle); const entered = deferred(); const release = deferred(); let pause = true;
    globalThis.crypto.subtle.digest = async (...args) => { if (pause) { pause = false; entered.resolve(); await release.promise; } return original(...args); };
    try {
        const pending = controller.runTarget(graph,{kind:'terminal',address:{workflowId:graph.id,instancePath:[],nodeId:'commit'}}); const early=await Promise.race([entered.promise.then(()=>null),pending]);assert.equal(early,null,JSON.stringify(early?.error)); controller.cancel('stop'); release.resolve();
        const result = await pending; assert.equal(result.ok, false); assert.equal(f.writes(), 0);
    } finally { globalThis.crypto.subtle.digest = original; release.resolve(); }
});
test('stateless Reflect diagnostics receive the current native scoped store in one bounded request',async()=>{
 const f=fixture(),captured=f.capture(),identity=await captured.readIdentity();assert.equal(identity.ok,true);let transmitted;
 const binding={profileId:'fixture-analysis',model:'fixture-model'},context=snapshotContext(f.c,{node:{visibilityMode:'public'}});
 const result=await executeIntrospection({type:'workflow',operation:'reflect',operationVersion:1,mode:'character',maxTokens:2048,instructions:''},{context},{...identity.data,binding,request:async request=>{transmitted=request;return {ok:true,data:{finish:'stop',text:JSON.stringify({brief:'An apology was accepted.',appraisals:[],conflicts:[],recalls:[],sceneChanges:[],behaviorHints:['Answer calmly.'],attentionHints:[],recalledEpisodeIds:[]})}};}});
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.reports.find(report=>report.code==='INTROSPECTION_EXECUTION').requests,1);assert.equal(f.writes(),0);
 assert.equal(transmitted.maxTokens,2048);const prompt=JSON.parse(transmitted.messages[1].content);assert.deepEqual(prompt.state.scope,{chatId:'one',actorId:'character:alice.png'});assert.deepEqual(prompt.state.store,{id:'native-chat',version:0});
});
function perspectiveGraph() {
    return { ...nativeGraph(), id: 'host-perspective', mode: 'native-unified', nodes: { scene: { ...operationDefaults('scene-context'), id: 'scene', type: 'workflow', x: 0, y: 0 }, perspective: { ...operationDefaults('context', { mode: 'perspective' }), id: 'perspective', type: 'workflow', x: 0, y: 0 } }, wires: { perspective: { id: 'perspective', route: 'wire', from: 'scene', fromPort: 'out', to: 'perspective', toPort: 'context' } } };
}
async function projectNativePerspective(f) {
    const graph = perspectiveGraph(); const controller = createNativeWorkflowController({ context: () => f.c, userId:()=> 'default-user', isBusy: () => false });
    const result = await controller.runTarget(graph, { workflowId: graph.id, instancePath: [], nodeId: 'perspective', portId: 'out' });
    return { result, artifact: result.recording?.artifacts.find(entry => entry.value?.provenance?.operation === 'introspection-context')?.value };
}
test('native Scene Context supplies explicit current-actor visibility for zero-call Perspective', async () => {
    const f = fixture(); f.c.characters[0].description = 'Public character description.';
    const { result, artifact } = await projectNativePerspective(f); assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.actualCalls, 0); assert.equal(f.writes(), 0);
    assert.equal(artifact.provenance.actorId, 'character:alice.png');
    assert.deepEqual(artifact.messages.map(message => message.text), ['Public character description.', ...f.c.chat.map(message => message.mes)]);
    assert.ok(artifact.messages.every(message => message.visibleTo.includes('character:alice.png')));
});
test('native Perspective preserves explicit visibility exclusions on supplied public material', async () => {
    const f = fixture(); f.c.chat[1].visibleTo = ['character:bob.png'];
    const { result, artifact } = await projectNativePerspective(f); assert.equal(result.ok, true, JSON.stringify(result.error)); assert.deepEqual(artifact.messages.map(message => message.text), [f.c.chat[0].mes]);
});
test('native Perspective fails closed without a trusted current actor', async () => {
    const f = fixture(); f.c.characterId = null; f.c.groupId = 'group';
    const { result } = await projectNativePerspective(f); assert.equal(result.ok, false); assert.equal(result.error.code, 'ACTOR_REQUIRED'); assert.equal(f.writes(), 0);
});
for (const source of ['chat', 'character', 'character-after-text-only']) for (const replacement of ['revoked', 'accessor']) {
    test(`native ${source} visibility ${replacement} during awaited Perspective diagnostics rejects late output without reading accessors`, async () => {
        const f = fixture(); f.c.characters[0].data = { description: 'Public selected character description.' };
        f.c.extensionPrompts = {}; f.c.setExtensionPrompt = (key, value) => { f.c.extensionPrompts[key] = { value }; };
        const graph = perspectiveGraph();
        if (source === 'character-after-text-only') {
            graph.nodes.scene.includeCharacter = false;
            graph.nodes['scene-character'] = { ...operationDefaults('scene-context'), id: 'scene-character', type: 'workflow', x: 0, y: 0 };
            graph.nodes.assemble = { ...operationDefaults('context'), id: 'assemble', type: 'workflow', x: 0, y: 0 };
            graph.wires.perspective.from = 'assemble';
            graph.wires['assemble-chat'] = { id: 'assemble-chat', route: 'wire', from: 'scene', fromPort: 'out', to: 'assemble', toPort: 'in1' };
            graph.wires['assemble-character'] = { id: 'assemble-character', route: 'wire', from: 'scene-character', fromPort: 'out', to: 'assemble', toPort: 'in2' };
        }
        graph.nodes.awaited={...operationDefaults('smart-compactor'),id:'awaited',type:'workflow',method:'select',targetTokens:1200,keepRecent:0};
        graph.wires.awaited={id:'awaited',route:'wire',from:'perspective',fromPort:'out',to:'awaited',toPort:'in'};
        const entered = deferred(), release = deferred(); let visibilityReads = 0; const sceneIncludes = [];
        const controller = createNativeWorkflowController({ context: () => f.c, userId:()=> 'default-user', isBusy: () => false, getGraph: () => graph, isEnabled: () => true, onStage: node => { if (node.operation === 'scene-context') sceneIncludes.push(node.includeCharacter !== false); }, countTokens:async()=>{entered.resolve();await release.promise;return {tokens:12,method:'fixture'};}, resolveBinding: () => ({ ok: true, data: { profileId: 'fixture', model: 'fixture' } }), request: async () => { entered.resolve(); await release.promise; return { ok: true, data: { finish: 'stop', text: JSON.stringify({ brief: 'Public context reflection.', appraisals: [], conflicts: [], recalls: [], sceneChanges: [], behaviorHints: ['Answer calmly.'], attentionHints: [], recalledEpisodeIds: [] }) } }; } });
        const pending = controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'awaited',portId:'out'});const early=await Promise.race([entered.promise.then(()=>null),pending]);assert.ok(early===null,JSON.stringify(early?.error));
        if (source === 'character-after-text-only') assert.deepEqual(sceneIncludes, [false, true]);
        const material = source === 'chat' ? f.c.chat[0] : f.c.characters[0].data;
        if (replacement === 'revoked') material.visibleTo = ['character:bob.png'];
        else Object.defineProperty(material, 'visibleTo', { enumerable: true, get() { visibilityReads++; return ['character:alice.png']; } });
        release.resolve(); const result = await pending;
        assert.equal(result.ok, false, JSON.stringify(result.error)); assert.equal(result.error.code, 'STALE_SOURCE');
        assert.equal(visibilityReads, 0); assert.equal(f.writes(), 0); assert.ok(Object.values(f.c.extensionPrompts).every(prompt => !prompt.value));
    });
}
for (const sameGeneration of [false, true]) {
    test(`native Memory Events ${sameGeneration ? 'exclude the selected stopped generation' : 'retain a completed selected generation when an older stopped processor remains'}`, async () => {
        const f = fixture(); const graph = nativeGraph();
        f.c.streamingProcessor = { messageId: 1, isFinished: false, isStopped: true, timeStarted: sameGeneration ? 2 : 1, abortController: new AbortController() };
        const controller = createNativeWorkflowController({ context: () => f.c, userId:()=> 'default-user', isBusy: () => false });
        const result = await controller.runTarget(graph, { workflowId: graph.id, instancePath: [], nodeId: 'events', portId: 'out' }); assert.equal(result.ok, true, JSON.stringify(result.error));
        const material = result.recording.artifacts.find(entry => entry.value?.value?.recordType === 'events').value.value.payload.events;
        assert.deepEqual(material.map(event => event.text), sameGeneration ? [f.c.chat[0].mes] : f.c.chat.map(message => message.mes)); assert.equal(f.writes(), 0);
    });
}
for (const visibility of ['excluded', 'invalid', 'accessor']) {
    test(`native Memory Events omit ${visibility} actor visibility without reading accessors`, async () => {
        const f = fixture(); let reads = 0;
        if (visibility === 'excluded') f.c.chat[1].visibleTo = ['character:bob.png'];
        else if (visibility === 'invalid') f.c.chat[1].visibleTo = 'character:alice.png';
        else Object.defineProperty(f.c.chat[1], 'visibleTo', { enumerable: true, get() { reads++; return ['character:alice.png']; } });
        const events = await f.capture().memory.read({ view: 'events' }); assert.equal(events.ok, true, JSON.stringify(events.error)); assert.deepEqual(events.artifact.value.payload.events.map(event => event.text), [f.c.chat[0].mes]); assert.equal(reads, 0);
    });
}
for (const visibility of ['revoked', 'changed', 'invalid', 'accessor']) {
    test(`native Memory Commit invalidates ${visibility} selected visibility before saving`, async () => {
        const f = fixture(); f.c.chat[1].visibleTo = ['character:alice.png']; const session = f.capture(); const request = await intent(session); let reads = 0;
        if (visibility === 'revoked') f.c.chat[1].visibleTo = ['character:bob.png'];
        else if (visibility === 'changed') f.c.chat[1].visibleTo.push('character:bob.png');
        else if (visibility === 'invalid') f.c.chat[1].visibleTo = ['x'.repeat(129)];
        else Object.defineProperty(f.c.chat[1], 'visibleTo', { enumerable: true, get() { reads++; return ['character:alice.png']; } });
        const result = await session.memory.commit(request, { root: true }); assert.equal(result.ok, false); assert.equal(f.writes(), 0); assert.equal(reads, 0);
    });
}
