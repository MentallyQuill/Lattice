import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../src/workflow/diagnostic-store.js').catch(() => ({}));
import {createDiagnosticHistory} from '../src/workflow/diagnostic-history.js';

// A transaction scheduler, so tests exercise the adapter's real request/commit handling.
function indexedDatabase({beforeCommit} = {}) {
    const records = new Map();
    let tail = Promise.resolve(), transactions = 0;
    const db = {
        objectStoreNames:{contains:()=>true}, close(){},
        transaction(_store,mode) {
            transactions++;
            const tx = {mode,error:null,aborted:false};
            const previous = tail;
            let complete;
            tail = new Promise(resolve => { complete = resolve; });
            const writes = [];
            tx.abort = () => {tx.aborted = true; queueMicrotask(()=>{tx.onabort?.(); complete();});};
            tx.objectStore = () => ({
                get(key) {
                    const request = {};
                    previous.then(()=>queueMicrotask(()=>{
                        request.result = structuredClone(records.get(key)); request.onsuccess?.();
                        queueMicrotask(async()=>{
                            if (mode === 'readwrite' && writes.length) await beforeCommit?.();
                            if (!tx.aborted) {for (const [id,value] of writes) records.set(id,structuredClone(value)); tx.oncomplete?.(); complete();}
                        });
                    }));
                    return request;
                },
                put(value,key) {writes.push([key,value]); return {};},
            });
            return tx;
        },
    };
    return {records,get transactions(){return transactions;},factory:{open(){const request={}; queueMicrotask(()=>{request.result=db;request.onsuccess?.();}); return request;}}};
}

test('IndexedDB adapter commits per-user read-modify-write updates atomically and survives reopening', async () => {
    assert.equal(typeof module.createDiagnosticStore,'function');
    const database = indexedDatabase(), store = module.createDiagnosticStore({indexedDB:database.factory});
    await Promise.all([store.update('owner',entries=>[...entries,{id:'one'}]),store.update('owner',entries=>[...entries,{id:'two'}])]);
    assert.deepEqual(await store.read('owner'),[{id:'one'},{id:'two'}]);
    assert.deepEqual(await store.read('other'),[]);
    const reopened = module.createDiagnosticStore({indexedDB:database.factory});
    assert.deepEqual(await reopened.read('owner'),[{id:'one'},{id:'two'}]);
    assert.equal(store.status().persistent,true);
    assert.ok(database.transactions >= 5);
});

test('a clear from another history service prevents an older capture from resurrecting logs', async () => {
    const database = indexedDatabase();
    const history = createDiagnosticHistory({store:module.createDiagnosticStore({indexedDB:database.factory})});
    const reopened = createDiagnosticHistory({store:module.createDiagnosticStore({indexedDB:database.factory})});
    const scope = {userId:'owner',chatId:'chat',characterId:7,groupId:null};
    const capture = history.begin({...scope,workflowId:'wf',workflowName:'Workflow',runId:'old',mode:'root',native:false,startedAt:10});
    await reopened.clear(scope);
    await capture.finish({ok:true});
    assert.equal((await reopened.list(scope)).data.entries.length,0);
    await reopened.begin({...scope,workflowId:'wf',workflowName:'Workflow',runId:'new',mode:'root',native:false,startedAt:10}).finish({ok:true});
    assert.equal((await reopened.list(scope)).data.entries.length,1);
});

test('abort after transform rolls back the pending IndexedDB transaction without a storage warning', async () => {
    let release, entered, gated = false;
    const commitGate = new Promise(resolve => {release = resolve;});
    const transformed = new Promise(resolve => {entered = resolve;});
    const database = indexedDatabase({async beforeCommit(){if (gated) {entered(); await commitGate;}}});
    const store = module.createDiagnosticStore({indexedDB:database.factory});
    await store.update('owner',()=>[{id:'previous'}]);
    gated = true;
    const controller = new AbortController();
    const pending = store.update('owner',entries=>[...entries,{id:'revoked'}],{signal:controller.signal});
    await transformed;
    controller.abort(); release();
    await assert.rejects(pending,error=>error.name === 'AbortError');
    assert.deepEqual(await store.read('owner'),[{id:'previous'}]);
    assert.deepEqual(store.status(),{persistent:true,issue:''});
});

test('history discard after the IndexedDB transform reports discarded and retains earlier logs', async () => {
    let release, entered, gated = false;
    const commitGate = new Promise(resolve => {release = resolve;});
    const transformed = new Promise(resolve => {entered = resolve;});
    const database = indexedDatabase({async beforeCommit(){if (gated) {entered(); await commitGate;}}});
    const history = createDiagnosticHistory({store:module.createDiagnosticStore({indexedDB:database.factory})});
    const scope = {userId:'owner',chatId:'chat',characterId:7,groupId:null};
    const origin = {...scope,workflowId:'wf',workflowName:'Workflow',mode:'root',native:false,startedAt:10};
    await history.begin({...origin,runId:'previous'}).finish({ok:true});
    gated = true;
    const pending = history.begin({...origin,runId:'revoked'}).finish({ok:true});
    await transformed;
    history.discardActive(); release();
    assert.deepEqual(await pending,{ok:true,data:{discarded:true}});
    assert.deepEqual((await history.list(scope)).data.entries.map(entry=>entry.id),['previous']);
    assert.deepEqual(history.status(),{persistent:true,issue:''});
});
