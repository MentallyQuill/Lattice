import assert from 'node:assert/strict';
import test from 'node:test';
import { runWorkflow, runWorkflowForHost } from '../src/workflow/runtime.js';
import { operationDefaults } from '../src/workflow/catalog.js';
import { prepareNodeControlChange } from '../src/workflow/ports.js';
import { state } from './fixtures/introspection.mjs';
import { createActorState,makeRecord } from '../src/workflow/introspection/contracts.js';
import { createMemoryService,createInMemoryBackend } from '../src/workflow/introspection/memory.js';

const node = (id, operation, controls = {}) => ({ id, type: 'workflow', phase: 'post', x: 40, y: 60, ...operationDefaults(operation, controls.mode ? { mode: controls.mode } : {}), ...controls });
const graph = () => ({ id: 'native-introspection', name: 'Consequence recovery', schema: 3, runtime: 2, mode: 'native-unified', roles: {},
    nodes: { memory: node('memory', 'memory'), state: node('state', 'state', { mode: 'curve', decay: 0.25 }), commit: node('commit', 'memory', { mode: 'commit', idempotencyKey: 'recover-once' }) },
    wires: { state: { id: 'state', route: 'wire', from: 'memory', fromPort: 'out', to: 'state', toPort: 'state' }, commit: { id: 'commit', route: 'wire', from: 'state', fromPort: 'out', to: 'commit', toPort: 'proposal' } }, groups: {}, portals: {}, definitions: {} });
const terminalArtifact = result => result.recording.artifacts.find(artifact => artifact.id === result.recording.terminals[0]?.artifact)?.value;

test('unsupported Introspection modes return a Result and switching modes removes optional old settings', () => {
    const authored = graph(), before = structuredClone(authored);
    const invalid = prepareNodeControlChange(authored, { nodeId: 'state', controls: { mode: 'unsupported' } });
    assert.equal(invalid.ok, false); assert.equal(invalid.error.code, 'INVALID_SETTINGS');
    assert.deepEqual(authored, before);
    authored.nodes.state = node('state', 'state', { updates: { anger: 0.6 } });
    const curve = prepareNodeControlChange(authored, { nodeId: 'state', controls: { mode: 'curve' } });
    assert.equal(curve.ok, true, JSON.stringify(curve.error));
    assert.equal(Object.hasOwn(curve.data.candidate.nodes.state, 'updates'), false);
});

test('public native runner executes scoped reads and State proposals but never commits memory', async () => {
    let reads = 0, commits = 0;
    const authored = graph(), before = structuredClone(authored);
    const result = await runWorkflow(authored, { target: { workflowId: authored.id, instancePath: [], nodeId: 'state', portId: 'out' }, memory: { read: async () => { reads++; return { ok: true, artifact: state() }; }, commit: async () => { commits++; throw Error('public writes are forbidden'); } } });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.actualCalls, 0); assert.equal(result.callBound, 0);
    assert.equal(reads, 1); assert.equal(commits, 0);
    const proposal = result.recording.artifacts.find(artifact => artifact.origin.direction === 'output' && artifact.value?.value?.recordType === 'state-proposal').value;
    assert.equal(proposal.kind, 'data');
    assert.equal(proposal.value.payload.curves.emotion.value, 0);
    assert.deepEqual(authored, before);
});

test('default State Value reads the actor snapshot; an explicit values map creates a proposal', async () => {
    const authored = graph(); delete authored.nodes.commit; delete authored.wires.commit;
    authored.nodes.state = node('state', 'state');
    const ports = { target: { workflowId: authored.id, instancePath: [], nodeId: 'state', portId: 'out' }, memory: { read: async () => ({ ok: true, artifact: state() }) } };
    const read = await runWorkflow(authored, ports);
    assert.equal(read.ok, true, JSON.stringify(read.error));
    const stateAddress=read.recording.units.find(unit=>unit.operation==='state')?.address;
    const output = read.recording.artifacts.find(artifact => artifact.origin.direction === 'output' && artifact.value?.value?.recordType === 'actor-state' && artifact.origin.address === stateAddress);
    assert.ok(output, 'default State Value returns the unchanged actor-state');
    authored.nodes.state.updates = { anger: 0.6 };
    const update = await runWorkflow(authored, ports);
    assert.equal(update.ok, true, JSON.stringify(update.error));
    assert.ok(update.recording.artifacts.some(artifact => artifact.origin.direction === 'output' && artifact.value?.value?.recordType === 'state-proposal' && artifact.value.value.payload.values.anger === 0.6));
});
test('native Memory Recall accepts a Text wire through its typed descriptor and scoped service',async()=>{
    const initial=createActorState({chatId:'chat-1',actorId:'npc-1'},{id:'store-1',version:0},{episodes:[
        {id:'lighthouse',text:'A storm at the lighthouse.',classification:'interpretation',sourceRefs:[]},
        {id:'garden',text:'A quiet walk in the garden.',classification:'interpretation',sourceRefs:[]},
    ]}).data;
    const memory=createMemoryService(createInMemoryBackend(initial,makeRecord('events',initial.value,{events:[]},[]).data));
    const authored={...graph(),nodes:{query:node('query','text',{text:'lighthouse'}),memory:node('memory','memory',{mode:'recall',query:'garden'})},wires:{query:{id:'query',route:'wire',from:'query',fromPort:'out',to:'memory',toPort:'query'}}};
    const result=await runWorkflow(authored,{target:{workflowId:authored.id,instancePath:[],nodeId:'memory',portId:'out'},memory});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    const output=result.recording.artifacts.find(artifact=>artifact.origin.direction==='output'&&artifact.value?.value?.recordType==='episodes')?.value;
    assert.ok(output,'The wired query produces a scoped episodes artifact.');
    assert.deepEqual(output.value.payload.episodes.map(episode=>episode.id),['lighthouse']);
    assert.deepEqual(output.value.scope,{chatId:'chat-1',actorId:'npc-1'});
    assert.equal(result.actualCalls,0);
});
