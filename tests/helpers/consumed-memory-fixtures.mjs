import {executeIntrospection} from '../../src/workflow/introspection/nodes.js';
import assert from 'node:assert/strict';
import { Worker as ThreadWorker } from 'node:worker_threads';
import { operationDefaults } from '../../src/workflow/catalog.js?v=0.27.1';
import { withNativeBoundary } from './workflow-fixtures.mjs';
import { parseWorkflow } from '../../src/workflow/packages.js';
import { createNativeWorkflowController } from '../../src/workflow/host.js';
import { createNativeMemoryAdapter } from '../../src/workflow/introspection/host-memory.js';
import { makeRecord } from '../../src/workflow/introspection/contracts.js';
// Match host.js's module URL: binding authentication is held in its WeakMap.
import { bindingStatus } from '../../src/workflow/connections.js?v=0.27.1';

export function accepted(result) { assert.equal(result.ok,true,JSON.stringify(result.error));return result; }
// Minimal unified fixtures for consumed evidence and identity-only memory lookup.
export function graphBy(id) {
    const graph={id:'consumed-memory-'+id,name:'Consumed memory fixture',schema:3,runtime:2,mode:'native-unified',nodes:{},wires:{},roles:{Analysis:{profileId:null,model:null}},definitions:{},groups:{},portals:{}};
    const add=(id,operation,controls={})=>graph.nodes[id]={...operationDefaults(operation,controls.mode?{mode:controls.mode}:{}),...controls,profileId:null,id,type:'workflow',operationVersion:1,phase:'pre',x:0,y:0};
    const wire=(id,from,to,toPort='in')=>graph.wires[id]={id,route:'wire',from,fromPort:'out',to,toPort};
    if(id===21){
        add('pre-recall','memory',{mode:'recall',query:'ferry',limit:4});
        add('pre-compose','compose',{mode:'template',outputKind:'guidance',template:'Actor episodes: {{data:/payload/episodes}}',sections:[]});
        add('pre-output','guidance',{budgetTokens:768});
        wire('wire-1','pre-recall','pre-compose','data');wire('wire-2','pre-compose','pre-output');
        return withNativeBoundary(graph,'pre-output');
    }
    if(id===18){
        add('pre-scene','scene-context',{recentMessages:1,includeCharacter:false,visibilityMode:'public'});add('pre-state','memory',{mode:'read',view:'state'});
        add('pre-reflect','reflect',{mode:'character',instructions:'Appraise supplied evidence while preserving player choice.'});add('pre-express','express',{mode:'behavior'});add('pre-guidance','guidance');
        wire('wire-1','pre-scene','pre-reflect','context');wire('wire-2','pre-state','pre-reflect','state');wire('wire-3','pre-reflect','pre-express','assessment');wire('wire-4','pre-express','pre-guidance');
        return withNativeBoundary(graph,'pre-guidance');
    }
    throw Error('Unknown consumed-memory fixture.');
}
export function bindFixtureRoles(graph) {
    graph.roles.Analysis = { profileId: 'fixtureAnalysis', model: 'fixture-model' };
    graph.roles.Prose = { profileId: 'fixtureProse', model: 'fixture-model' };
    // Definition-local explicit null roles intentionally shadow parent roles.
    for (const node of Object.values(graph.nodes)) {
        if (!node.definition) continue;
        const definition = Object.values(graph.definitions).find(def => def.id === node.definition.id);
        for (const role of Object.keys(definition?.body.roles ?? {})) node.roleOverrides[role] = { ...graph.roles[role] };
    }
    return graph;
}
export function completedMessage(text, index = 1, isUser = false) {
    return isUser ? { mes: text, is_user: true, send_date: index } : {
        mes: text, is_user: false, swipe_id: 0, swipes: [text],
        swipe_info: [{ extra: {}, gen_started: index * 2 + 1, gen_finished: index * 2 + 2 }],
        extra: {}, gen_started: index * 2 + 1, gen_finished: index * 2 + 2,
    };
}
export const response = text => ({ ok: true, data: { text: typeof text === 'string' ? text : JSON.stringify(text), finish: 'stop' } });
export function reflection(overrides = {}) {
    return {
        brief: 'Observation: Mira waits at the closed gate; interpretation: she remains cautious.',
        appraisals: ['Interpretation: the promise constrains her curiosity.'],
        conflicts: ['Interpretation: curiosity conflicts with keeping the seal intact.'],
        recalls: [], sceneChanges: [],
        behaviorHints: ['Possibility: Mira pauses and asks permission without opening the letter.'],
        attentionHints: ['Observation: the closed gate is an unresolved obstacle.'],
        recalledEpisodeIds: [], ...overrides,
    };
}
export const sourceRefs = events => events.map(({ id, revision }) => ({ id, revision }));
export const upsert = (collection, id, text, refs, classification = 'observation') => ({ op: 'upsert', collection, item: { id, text, classification, sourceRefs: refs } });
export const proposal = changes => ({ changes, values: {}, curves: {}, tracks: {} });
export const guidance = context => Object.values(context.extensionPrompts).map(prompt => prompt.value).filter(Boolean).join('\n');

export function createExampleFixture(graph, options = {}) {
    bindFixtureRoles(graph);
    let currentGraph = graph, requestPort = options.request, stage;
    let memorySaves = 0, chatSaves = 0;
    const supplied = options.chat ?? [
        completedMessage('At the ferry gate, Mira holds an unopened letter.', 0, true),
        completedMessage(options.text ?? 'Mira waits at the closed ferry gate.'),
    ];
    const chat = supplied.map((item, index) => typeof item === 'string' ? completedMessage(item, index, index % 2 === 0) : structuredClone(item));
    chat.push(completedMessage('Continue.',chat.length,true));
    const listeners=new Map();
    const character = { avatar: 'mira.png', name: 'Mira', ...options.character };
    const requests = [], stages = [], events = [], requestErrors = [];
    const context = {
        chatId: options.chatId ?? 'example-acceptance', characterId: 0, characters: [character], groupId: null,
        chatMetadata: structuredClone(options.chatMetadata ?? {}), chat, extensionPrompts: {},
        CONNECT_API_MAP: { fixture: { selected: 'openai', source: 'nanogpt' } },
        ConnectionManagerRequestService: { getProfile: id => ({ id, name: id, api: 'fixture', model: 'fixture-model' }) },
        chatCompletionSettings: {},
        setExtensionPrompt(key, value) { this.extensionPrompts[key] = { value }; },
        saveChat: async () => { chatSaves++; },
        saveMetadata: async () => { memorySaves++; return true; },
        updateMessageBlock: async () => {}, swipe: { refresh: async () => {} },
    };
    const countTokens = options.tokenCount ?? (async text => ({ tokens: Math.ceil(text.length / 4), method: 'example-fixture' }));
    context.eventTypes={GENERATION_STARTED:'GENERATION_STARTED',GENERATION_STOPPED:'GENERATION_STOPPED',GENERATION_ENDED:'GENERATION_ENDED'};
    context.eventSource={on(name,fn){listeners.set(name,fn);},removeListener(name){listeners.delete(name);},async emit(name,...args){await listeners.get(name)?.(...args);}};
    const controller = createNativeWorkflowController({
        context: () => context, getGraph: () => currentGraph, isEnabled: () => true, isBusy: () => false, userId: () => 'default-user', countTokens,
        onStage(node, address) { stage = { node, address }; stages.push(stage); options.onStage?.(node, address); },
        onEvent(event) { events.push(event); options.onEvent?.(event); },
        request: async input => {
            const captured = { ...input, stage, payload: input.messages[1]?.content };
            requests.push(captured);
            try {
                accepted(bindingStatus(input.binding, context));
                assert.equal(typeof requestPort, 'function', 'This example must not call a model.');
                return await requestPort(input, stage, context);
            } catch (error) { requestErrors.push(error); throw error; }
        },
        syncMesToSwipe(index) { const m = context.chat[index]; m.swipes[m.swipe_id] = m.mes; return true; },
        syncSwipeToMes(index, id) { const m = context.chat[index]; m.swipe_id = id; m.mes = m.swipes[id]; Object.assign(m, structuredClone(m.swipe_info[id])); return true; },
    });
    controller.subscribe();
    const f = {
        controller, context, graph, requests, stages, events, requestErrors, countTokens,
        async reflectIdentity() {
            const adapter=createNativeMemoryAdapter({context:()=>context}),captured=adapter.capture({signal:new AbortController().signal,isCurrent:()=>true});if(!captured.ok)return captured;const session=captured.data;
            try{const identity=await session.readIdentity();if(!identity.ok)return identity;
                return await executeIntrospection({type:'workflow',operation:'reflect',operationVersion:1,mode:'character'}, {context:{kind:'context',messages:[{id:'current',role:'user',text:context.chat.at(-1).mes}]}}, {root:true,...identity.data,request:async input=>{requests.push(input);return requestPort(input);}});
            }finally{session.release();}
        },
        get message() { return context.chat.at(-1); },
        memorySaves: () => memorySaves, chatSaves: () => chatSaves,
        setRequest(request) { requestPort = request; },
        setGraph(next) { currentGraph = bindFixtureRoles(next); f.graph = next; return next; },
        async pre(next = f.graph) { f.setGraph(next); await context.eventSource.emit('GENERATION_STARTED','normal',{},false); return controller.beforeGenerate(context.chat,8192,()=>{}); },

        append(text, isUser = false) { const m = completedMessage(text, context.chat.length, isUser); context.chat.push(m); return m; },
    };
    return f;
}
export async function readMemory(f, view = 'state', settings) {
    const adapter = createNativeMemoryAdapter({ context: () => f.context });
    const session = accepted(adapter.capture({ signal: new AbortController().signal, isCurrent: () => true })).data;
    try { return accepted(await (settings ? session.memory.recall(settings) : session.memory.read({ view }))); }
    finally { session.release(); }
}
export const currentMemory = async f => (await readMemory(f)).artifact.value;
// Seed a fixture through trusted native persistence, with refs captured from its
// supplied completed messages. This avoids a model that pretends a seed is evidence.
export async function seedMemory(f, makeChanges) {
    const adapter = createNativeMemoryAdapter({ context: () => f.context });
    const session = accepted(adapter.capture({ signal: new AbortController().signal, isCurrent: () => true })).data;
    try {
        const state = accepted(await session.memory.read({ view: 'state' })).artifact.value;
        const events = accepted(await session.memory.read({ view: 'events' })).artifact.value.payload.events;
        const proposed = accepted(makeRecord('state-proposal', state, proposal(makeChanges({ state, events })), sourceRefs(events))).data;
        const intent = accepted(makeRecord('commit-intent', proposed.value, { proposal: proposed.value, idempotencyKey: `example-fixture-seed-${state.store.version}` }, proposed.value.sourceRefs)).data;
        return accepted(await session.memory.commit(intent, { root: true })).data;
    } finally { session.release(); }
}
export function recordedArtifact(result, nodeId, portId = 'out', instancePath = []) {
    const recording = result.recording;
    const { strings, paths, addresses } = recording.identities;
    const decodePath = index => index === 0 ? [] : [...decodePath(paths[index][0]), strings[paths[index][1]]];
    const unit = recording.units.find(unit => {
        const [, path, node] = addresses[unit.address];
        return strings[node] === nodeId && JSON.stringify(decodePath(path)) === JSON.stringify(instancePath);
    });
    assert.ok(unit, `Missing recorded unit ${instancePath.join('/')}/${nodeId}`);
    const port = unit.ports.find(port => port.direction === 'output' && strings[port.port] === portId);
    assert.ok(port && port.artifact !== null, `Missing recorded ${nodeId}.${portId}`);
    const artifact = recording.artifacts[port.artifact];
    assert.equal(artifact.format, 'structured', `Artifact ${nodeId} must be completely inspectable`);
    return artifact.value;
}
export function verifyRun(f, result, expectedCalls) {
    if (!result.ok && f.requestErrors.length) throw f.requestErrors.at(-1);
    accepted(result);
    assert.equal(result.actualCalls, expectedCalls);
    assert.equal(result.recording.status, 'completed');
    return result;
}
export class BrowserWorker {
    constructor(url) {
        this.worker = new ThreadWorker(new URL('../fixtures/text-rules-node-worker.mjs', import.meta.url), { workerData: { entryURL: url.href } });
        this.handlers = new Map();
    }
    addEventListener(type, callback) {
        const handler = type === 'message' ? data => { if (!data?.fixtureStarted) callback({ data }); } : error => callback({ error });
        this.handlers.set(callback, handler); this.worker.on(type, handler);
    }
    removeEventListener(type, callback) { this.worker.off(type, this.handlers.get(callback)); this.handlers.delete(callback); }
    postMessage(data) { this.worker.postMessage(data); }
    terminate() { return this.worker.terminate(); }
}
export async function withBrowserWorker(fn) {
    const previous = globalThis.Worker; globalThis.Worker = BrowserWorker;
    try { return await fn(); }
    finally { if (previous === undefined) delete globalThis.Worker; else globalThis.Worker = previous; }
}
