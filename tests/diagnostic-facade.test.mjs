import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { installMock } from './mock.js';
import { fixtureGraph } from './helpers/workflow-fixtures.mjs';
import { createDiagnosticHistory } from '../src/workflow/diagnostic-history.js';

const moduleUrl = source => 'data:text/javascript,' + encodeURIComponent(source);
const hooks = registerHooks({resolve(specifier, context, next) {
    if (specifier === '/script.js') return {url:moduleUrl('export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'),shortCircuit:true};
    if (specifier === '/scripts/user.js') return {url:moduleUrl('export const getCurrentUserHandle=()=>"diagnostic-owner";'),shortCircuit:true};
    return next(specifier,context);
}});

test('production facade retains failure metadata with response logging off in its exact owner scope', async () => {
    const c = installMock(); c.chatId = 'diagnostic-chat'; c.characterId = 1;
    const facade = await import('../src/run.js?diagnostic-facade');
    const users = new Map();
    const store = {async read(id){return users.get(id)??[];},async update(id,change){const next=change(users.get(id)??[]);users.set(id,next);return next;}};
    // Replace only browser persistence with a real history service over an in-memory adapter.
    Object.assign(facade.getWorkflowDiagnosticHistory(),createDiagnosticHistory({store}));
    await facade.initializeNativeWorkflowController();
    const controller = facade.getNativeWorkflowController();
    try {
        const graph = fixtureGraph('structured-guidance');
        const result = await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'generate-reply',portId:'draft'});
        assert.equal(result.error.code,'NATIVE_OWNER_MISSING');
        const history = facade.getWorkflowDiagnosticHistory();
        const entries = (await history.list(facade.getWorkflowDiagnosticScope())).data.entries;
        assert.equal(entries.length,1);
        assert.equal(entries[0].error.code,'NATIVE_OWNER_MISSING');
        assert.equal(entries[0].origin.userId,'diagnostic-owner');
        assert.equal(entries[0].origin.chatId,'diagnostic-chat');
        assert.deepEqual((await history.list({...facade.getWorkflowDiagnosticScope(),chatId:'other-chat'})).data.entries,[]);
        const success = await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'compose-json',portId:'out'});
        assert.equal(success.ok,true);
        assert.equal((await history.list(facade.getWorkflowDiagnosticScope())).data.entries.length,1,'response logging off must omit successful runs');
        facade.setWorkflowDiagnosticLogging(true);
        const fullSuccess = await controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'compose-json',portId:'out'});
        assert.equal(fullSuccess.ok,true);
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
    } finally {controller.dispose();hooks.deregister();}
});
