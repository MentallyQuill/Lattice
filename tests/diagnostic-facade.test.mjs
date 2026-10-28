import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { installMock } from './mock.js';
import { fixtureGraph } from './helpers/workflow-fixtures.mjs';
import { createDiagnosticHistory } from '../src/workflow/diagnostic-history.js';
import { createHostFileFixture } from './helpers/host-file-fixture.mjs';

const moduleUrl = source => 'data:text/javascript,' + encodeURIComponent(source);
const hooks = registerHooks({resolve(specifier, context, next) {
    if (specifier === '/script.js') return {url:moduleUrl('export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'),shortCircuit:true};
    if (specifier === '/scripts/user.js') return {url:moduleUrl('export const getCurrentUserHandle=()=>"diagnostic-owner";'),shortCircuit:true};
    return next(specifier,context);
}});

test('production facade retains failure metadata with response logging off in its exact owner scope', async () => {
    const c = installMock(); c.chatId = 'diagnostic-chat'; c.characterId = 1;
    const host = createHostFileFixture(), originalFetch = globalThis.fetch;
    c.characters = [null,{name:'Diagnostic character',avatar:'diagnostic.png',chat:c.chatId}];
    c.getRequestHeaders = () => ({'Content-Type':'application/json'});
    let savedChat, chatReads = 0;
    c.saveMetadata = async () => {savedChat=[{chat_metadata:structuredClone(c.chatMetadata)},...structuredClone(c.chat)];};
    globalThis.fetch = async (url,options) => {
        if (url === '/api/chats/get' && options?.method === 'POST') {
            chatReads++;
            assert.deepEqual(JSON.parse(options.body),{ch_name:'Diagnostic character',file_name:c.chatId,avatar_url:'diagnostic.png'});
            return Response.json(savedChat);
        }
        return host.fetch(url,options);
    };
    let controller, application;
    try {
        const facade = await import('../src/run.js?diagnostic-facade');
        const state = await import('../src/state.js?v=0.30.0');
        const users = new Map();
        const store = {async read(id){return users.get(id)??[];},async update(id,change){const next=change(users.get(id)??[]);users.set(id,next);return next;}};
        // Replace only browser persistence with a real history service over an in-memory adapter.
        Object.assign(facade.getWorkflowDiagnosticHistory(),createDiagnosticHistory({store}));
        await facade.initializeNativeWorkflowController();
        application = facade.getApplicationFileExperience();
        controller = facade.getNativeWorkflowController();
        const graph = fixtureGraph('structured-guidance');
        assert.notEqual(state.activateWorkflow(graph)?.ok,false);
        const result = await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'generate-reply',portId:'draft'});
        assert.equal(result.error.code,'NATIVE_OWNER_MISSING');
        assert.equal(result.actualCalls,0);
        const history = facade.getWorkflowDiagnosticHistory();
        const entries = (await history.list(facade.getWorkflowDiagnosticScope())).data.entries;
        assert.equal(entries.length,1);
        assert.equal(entries[0].error.code,'NATIVE_OWNER_MISSING');
        assert.equal(entries[0].origin.userId,'diagnostic-owner');
        assert.equal(entries[0].origin.chatId,'diagnostic-chat');
        assert.deepEqual((await history.list({...facade.getWorkflowDiagnosticScope(),chatId:'other-chat'})).data.entries,[]);
        const success = await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'compose-json',portId:'out'});
        assert.equal(success.ok,true);
        assert.equal(success.actualCalls,0);
        assert.equal((await history.list(facade.getWorkflowDiagnosticScope())).data.entries.length,1,'response logging off must omit successful runs');
        facade.setWorkflowDiagnosticLogging(true);
        const fullSuccess = await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'compose-json',portId:'out'});
        assert.equal(fullSuccess.ok,true);
        assert.equal(fullSuccess.actualCalls,0);
        assert.ok((await history.list(facade.getWorkflowDiagnosticScope())).data.entries.some(entry=>entry.id===fullSuccess.runId&&entry.status==='completed'),'opt-in keeps successful full logs');
        let release, entered;
        const gate = new Promise(resolve=>{release=resolve;}), transformed = new Promise(resolve=>{entered=resolve;});
        const update = store.update.bind(store); let once = true;
        store.update = async (id,change) => {
            const next=change(users.get(id)??[]);
            if (once) {once=false;entered();await gate;}
            users.set(id,next);return next;
        };
        const pending = history.begin({...entries[0].origin,runId:'pending-full'},{mode:'full'});
        pending.model({type:'response',address:{workflowId:graph.id,instancePath:[],nodeId:'model'},attempt:1,text:'PRIVATE_PENDING_FULL',visibility:{kind:'public'}});
        const saving = pending.finish({ok:false,error:{code:'INVALID_JSON',message:'Invalid JSON.'}});
        await transformed;
        const activeMetadata = history.begin({...entries[0].origin,runId:'active-metadata'},{mode:'metadata'});
        facade.setWorkflowDiagnosticLogging(false);
        release();
        assert.equal((await saving).data.discarded,true);
        assert.equal((await activeMetadata.finish({ok:false,error:{code:'INVALID_JSON',message:'Invalid JSON.'}})).data.discarded,true);
        store.update = update;
        assert.equal((await history.list(facade.getWorkflowDiagnosticScope())).data.entries.length,2);
        assert.equal(JSON.stringify([...users.values()]).includes('PRIVATE_PENDING_FULL'),false);
        assert.ok(host.requests.some(request => request.url === '/api/files/upload'),'the draft preflight saves through the actual host file protocol');
        assert.ok(chatReads > 0,'the selected draft is verified against the saved native chat metadata');
        assert.deepEqual(host.unexpected,[],'the diagnostic scenarios must not call a generation endpoint or the network');
    } finally {controller?.dispose();application?.controller.dispose();globalThis.fetch=originalFetch;hooks.deregister();}
});
