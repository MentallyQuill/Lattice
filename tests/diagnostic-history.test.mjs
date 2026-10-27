import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../src/workflow/diagnostic-history.js').catch(() => ({}));
const origin = (extra = {}) => ({userId:'owner',chatId:'chat',characterId:7,groupId:null,workflowId:'wf',workflowName:'Workflow',runId:'run',mode:'root',native:false,startedAt:10,...extra});
function memoryStore(seed = []) {
    const users = new Map([['owner',seed]]);
    return { users, async read(id) { return users.get(id) ?? []; }, async update(id, change) { const next = change(users.get(id) ?? []); users.set(id,next); return next; } };
}
const address = {workflowId:'wf',nodeId:'model',instancePath:[]};

test('metadata-only failures retain bounded diagnostics without completion text', async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    const capture = history.begin(origin(), {mode:'metadata'});
    capture.event({type:'plan',plan:{callBound:2,prompt:'PRIVATE_PROMPT'}});
    capture.event({type:'request-start',address,attempt:1,at:11});
    capture.model({type:'response',address,attempt:1,text:'PRIVATE_COMPLETION',visibility:{kind:'actor-private',actorId:'actor-a'}});
    capture.model({type:'validation',address,attempt:1,error:{code:'SCHEMA_MISMATCH',message:'Schema mismatch.',findings:[{path:'/responseOptions',keyword:'minItems',message:'Expected at least 1 item; got 0.',value:'PRIVATE_VALUE'}]}});
    capture.event({type:'node-retry',address,reasonCode:'SCHEMA_MISMATCH',delayMs:0,nextAttempt:2});
    await capture.finish({ok:false,actualCalls:1,error:{code:'SCHEMA_MISMATCH',message:'Schema mismatch.',address}});
    const reloaded = module.createDiagnosticHistory({store});
    const entry = (await reloaded.list(origin())).data.entries[0];
    assert.equal(entry.status,'failed');
    assert.equal(entry.actualCalls,1);
    assert.equal(entry.callBound,2);
    assert.equal(entry.error.code,'SCHEMA_MISMATCH');
    assert.deepEqual(entry.attempts[0].validationError.findings,[{path:'/responseOptions',keyword:'minItems',message:'Expected at least 1 item; got 0.'}]);
    assert.deepEqual(entry.attempts[0].retry,{reasonCode:'SCHEMA_MISMATCH',delayMs:0,nextAttempt:2});
    assert.equal(JSON.stringify(store.users.get('owner')).includes('PRIVATE_'),false);
});

test('metadata-only history omits successful, cancelled and stale runs without storage writes', async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    let writes = 0;
    const update = store.update.bind(store);
    store.update = async (...args) => {writes++; return update(...args);};
    for (const status of ['completed','cancelled','stale']) {
        const capture = history.begin(origin({runId:status}), {mode:'metadata'});
        capture.event({type:'run-settled',status});
        const result = await capture.finish({ok:status === 'completed',error:{code:status === 'cancelled'?'ABORTED':'UNUSED',message:'Run ended.'}});
        assert.equal(result.data.discarded,true);
    }
    assert.equal(writes,0);
    assert.deepEqual((await history.list(origin())).data.entries,[]);
});

test('metadata-only response capture never inspects completion text or visibility properties', async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    const capture = history.begin(origin(),{mode:'metadata'});
    let inspected = 0;
    const response = new Proxy({type:'response',address,attempt:1,get text(){inspected++; throw Error('Completion text was read.');},get visibility(){inspected++; throw Error('Visibility was read.');}}, {
        getOwnPropertyDescriptor(target,key) {
            if (key === 'text' || key === 'visibility') inspected++;
            return Reflect.getOwnPropertyDescriptor(target,key);
        },
    });
    capture.model(response);
    await capture.finish({ok:false,error:{code:'INVALID_JSON',message:'Invalid JSON.'}});
    assert.equal(inspected,0);
    const row = (await history.list(origin())).data.entries[0].attempts[0];
    assert.equal(row.response.text,undefined);
    assert.match(row.response.omitted,/logging is off/i);
});

test('metadata-only invalid and unresolved failures retain bounded getter-free findings', async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    let getters = 0;
    for (const status of ['invalid','unresolved']) {
        const capture = history.begin(origin({runId:status}),{mode:'metadata'});
        const findings = Array.from({length:40},() => ({path:'/'+'😀'.repeat(400),keyword:'type',message:'m'.repeat(1000),get value(){getters++;return 'PRIVATE';}}));
        capture.event({type:'run-settled',status,error:{code:'SCHEMA_MISMATCH',message:'Mismatch.',findings},failedAddress:address});
        await capture.finish({ok:false});
    }
    const entries = (await history.list(origin())).data.entries;
    assert.deepEqual(entries.map(entry=>entry.status).sort(),['invalid','unresolved']);
    for (const entry of entries) {
        assert.equal(entry.error.findings.length,32);
        assert.equal(entry.error.truncated,true);
        assert.equal(entry.error.nodeId,'model');
        for (const finding of entry.error.findings) {
            assert.ok(Buffer.byteLength(JSON.stringify(finding.path)) <= 512);
            assert.ok(Buffer.byteLength(JSON.stringify(finding.message)) <= 512);
        }
    }
    assert.equal(getters,0);
    assert.equal(JSON.stringify(store.users.get('owner')).includes('PRIVATE'),false);
});

test('invalid explicit capture modes cannot fall back to full response logging', () => {
    const history = module.createDiagnosticHistory({store:memoryStore()});
    let getters = 0;
    for (const options of [{mode:'metdata'}, {}, null, {get mode(){getters++;return 'metadata';}}]) {
        assert.equal(history.begin(origin(),options),null);
    }
    assert.equal(getters,0);
});

test('metadata-only finish discards a superseded host result even after failure settlement', async () => {
    const history = module.createDiagnosticHistory({store:memoryStore()});
    const capture = history.begin(origin(),{mode:'metadata'});
    capture.event({type:'run-settled',status:'failed',error:{code:'INVALID_JSON',message:'Invalid JSON.'}});
    assert.equal((await capture.finish({ok:false,superseded:true})).data.discarded,true);
    assert.deepEqual((await history.list(origin())).data.entries,[]);
});

test('capture snapshots explicit metadata mode once before response events arrive', async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    let reads = 0;
    const options = new Proxy({mode:'metadata'},{getOwnPropertyDescriptor(target,key){
        if (key === 'mode') return {value:++reads === 1?'metadata':'full',enumerable:true,configurable:true,writable:true};
        return Reflect.getOwnPropertyDescriptor(target,key);
    }});
    const capture = history.begin(origin(),options);
    capture.model({type:'response',address,attempt:1,text:'PRIVATE_COMPLETION',visibility:{kind:'public'}});
    await capture.finish({ok:false,error:{code:'INVALID_JSON',message:'Invalid JSON.'}});
    assert.equal(JSON.stringify(store.users.get('owner')).includes('PRIVATE_COMPLETION'),false);
    assert.equal(reads,1);
});

test('settled captures persist detached summaries in the exact owner and chat scope', async () => {
    assert.equal(typeof module.createDiagnosticHistory,'function');
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    const source = origin(), capture = history.begin(source);
    source.chatId = 'other';
    assert.ok(capture);
    assert.equal((await capture.finish({ok:true})).ok,true);
    const result = await history.list(origin());
    assert.equal(result.ok,true);
    assert.equal(result.data.entries.length,1);
    assert.equal(result.data.entries[0].origin.chatId,'chat');
    assert.equal(result.data.entries[0].status,'completed');
    assert.equal((await history.list(origin({characterId:'7'}))).data.entries.length,0);
    assert.equal((await history.list(origin({userId:'different'}))).data.entries.length,0);
    assert.equal(history.begin(origin({chatId:null})),null);
});

test('each retry preserves failed output and schema findings after transport success', async () => {
    const history = module.createDiagnosticHistory({store:memoryStore()}), capture = history.begin(origin());
    capture.event({type:'plan',plan:{callBound:2,prompt:'SECRET'}});
    capture.event({type:'node-binding',address,binding:{model:'model-id',connectionId:'safe-id',apiKey:'SECRET',endpoint:'SECRET'}});
    capture.event({type:'request-start',address,attempt:1,at:11});
    capture.model({type:'response',address,attempt:1,text:'{bad}',visibility:{kind:'public'},finish:'stop',usage:{outputTokens:3,raw:'SECRET'}});
    capture.event({type:'request-settled',address,attempt:1,status:'completed',durationMs:12});
    capture.model({type:'validation',address,attempt:1,error:{code:'SCHEMA_MISMATCH',message:'Schema mismatch.',findings:Array.from({length:40},()=>({path:'$.title',keyword:'type',message:'Expected a string.',value:'SECRET'})),schema:'SECRET'}});
    capture.event({type:'node-retry',address,reasonCode:'SCHEMA_MISMATCH',delayMs:10,nextAttempt:2,maxAttempts:2});
    capture.event({type:'request-start',address,attempt:2,at:13});
    capture.model({type:'response',address,attempt:2,text:'{"title":"ok"}',visibility:{kind:'public'},finish:'stop'});
    capture.event({type:'request-settled',address,attempt:2,status:'completed',durationMs:4});
    await capture.finish({ok:true});
    const entry = (await history.list(origin())).data.entries[0];
    assert.equal(entry.actualCalls,2);
    assert.equal(entry.callBound,2);
    assert.equal(entry.attempts[0].status,'completed');
    assert.equal(entry.attempts[0].response.text,'{bad}');
    assert.equal(entry.attempts[0].validationError.findings.length,32);
    assert.equal(entry.attempts[0].validationError.truncated,true);
    assert.deepEqual(entry.attempts[0].retry,{reasonCode:'SCHEMA_MISMATCH',delayMs:10,nextAttempt:2});
    assert.equal(entry.attempts[1].response.text,'{"title":"ok"}');
    assert.equal(JSON.stringify(entry).includes('SECRET'),false);
});

test('owner permission retains labeled actor-private text and explicitly omits hidden or unknown scope', async () => {
    const history = module.createDiagnosticHistory({store:memoryStore()}), capture = history.begin(origin());
    for (const [attempt,visibility,text] of [[1,{kind:'actor-private',actorId:'actor-a'},'Private story'],[2,{kind:'hidden'},'HIDDEN'],[3,undefined,'UNKNOWN'],[4,{kind:'actor-private'},'NOACTOR']]) {
        capture.model({type:'response',address,attempt,visibility,text});
    }
    await capture.finish({ok:true});
    const rows = (await history.list(origin())).data.entries[0].attempts;
    assert.deepEqual(rows[0].response,{visibility:'actor-private',actorId:'actor-a',text:'Private story'});
    assert.equal(rows[1].response.visibility,'hidden');
    assert.match(rows[1].response.omitted,/hidden/i);
    assert.match(rows[2].response.omitted,/unknown/i);
    assert.match(rows[3].response.omitted,/actor/i);
    assert.equal(JSON.stringify(rows).includes('HIDDEN'),false);
    assert.equal(JSON.stringify(rows).includes('UNKNOWN'),false);
    assert.equal(JSON.stringify(rows).includes('NOACTOR'),false);
});

test('encoded byte budgets preserve Unicode and mark response and run omissions', async () => {
    const history = module.createDiagnosticHistory({store:memoryStore()}), capture = history.begin(origin());
    const text = '😀"\\\n'.repeat(12000);
    for (let attempt = 1; attempt <= 80; attempt++) {
        capture.event({type:'request-start',address,attempt,at:10});
        capture.model({type:'response',address,attempt,text,visibility:{kind:'public'}});
        capture.model({type:'validation',address,attempt,error:{code:'INVALID_JSON',message:'Invalid JSON',findings:Array.from({length:40},()=>({path:'$.'+'😀'.repeat(300),keyword:'type',message:'"'.repeat(700)}))}});
    }
    await capture.finish({ok:false,error:{code:'INVALID_JSON',message:'Invalid JSON',address}});
    const entry = (await history.list(origin())).data.entries[0];
    assert.ok(Buffer.byteLength(JSON.stringify(entry)) <= 256*1024);
    assert.equal(entry.actualCalls,80);
    assert.equal(entry.error.code,'INVALID_JSON');
    assert.equal(entry.error.address.nodeId,'model');
    assert.equal(entry.truncated,true);
    assert.ok(entry.attempts.some(row => row.response?.omitted));
    for (const row of entry.attempts) {
        if (row.response?.text !== undefined) {
            assert.ok(Buffer.byteLength(JSON.stringify(row.response.text)) <= 32*1024);
            assert.equal(row.response.truncated,true);
            assert.equal(/[\uD800-\uDBFF]$/.test(row.response.text),false);
        }
    }
});

test('retention evicts the oldest runs across chats by count and encoded user bytes', async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    for (let i = 0; i < 55; i++) await history.begin(origin({runId:`small-${i}`,startedAt:i})).finish({ok:true});
    assert.equal(store.users.get('owner').length,50);
    assert.equal(store.users.get('owner').some(row => row.id === 'small-0'),false);
    for (let i = 0; i < 32; i++) {
        const capture = history.begin(origin({runId:`large-${i}`,startedAt:100+i,chatId:i%2?'other':'chat'}));
        for (let attempt = 1; attempt <= 7; attempt++) capture.model({type:'response',address,attempt,text:'x'.repeat(32760),visibility:{kind:'public'}});
        await capture.finish({ok:true});
    }
    const retained = store.users.get('owner');
    assert.ok(Buffer.byteLength(JSON.stringify(retained)) <= 5*1024*1024);
    assert.ok(retained.length <= 50);
    assert.ok(retained.some(row => row.id === 'large-31'));
    assert.equal(retained.some(row => row.id === 'large-0'),false);
});

test('stored records are strictly allowlisted without invoking getters or admitting hidden text', async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    await history.begin(origin()).finish({ok:true});
    const good = structuredClone(store.users.get('owner')[0]);
    let invoked = 0;
    const getter = {...good}; Object.defineProperty(getter,'origin',{enumerable:true,get(){invoked++; return good.origin;}});
    store.users.set('owner',[
        good, {...good,version:2}, {...good,headers:{authorization:'SECRET'}},
        {...good,origin:origin({userId:'other'})}, getter,
        {...good,attempts:[{address,attempt:1,response:{visibility:'hidden',text:'HIDDEN'}}]},
        {...good,attempts:[{address,attempt:1,response:{visibility:'actor-private',text:'NOACTOR'}}]},
        {...good,attempts:[{address,attempt:1,response:{visibility:'public',text:'x',request:{prompt:'SECRET'}}}]},
    ]);
    const result = await history.list(origin());
    assert.equal(result.data.entries.length,1);
    assert.equal(invoked,0);
    assert.equal(JSON.stringify(result).includes('SECRET'),false);
    assert.equal(result.data.entries[0] === good,false);
});

test('clear invalidates captures and pending finishes without erasing another exact chat', async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    await history.begin(origin({runId:'other',chatId:'other'})).finish({ok:true});
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const blocked = new Promise(resolve => { entered = resolve; });
    const update = store.update.bind(store);
    let once = true;
    store.update = async (...args) => { if (once) { once = false; entered(); await gate; } return update(...args); };
    const active = history.begin(origin({runId:'active'}));
    const pending = history.begin(origin({runId:'pending'})).finish({ok:true});
    await blocked;
    assert.equal(typeof history.clear,'function');
    const cleared = history.clear(origin());
    release();
    assert.equal((await pending).ok,true);
    assert.equal((await cleared).ok,true);
    await active.finish({ok:true});
    assert.equal((await history.list(origin())).data.entries.length,0);
    assert.equal((await history.list(origin({chatId:'other'}))).data.entries.length,1);
    await history.begin(origin({runId:'new'})).finish({ok:true});
    assert.equal((await history.list(origin())).data.entries.length,1);
});

test('storage failures return passive results and visible status without leaking adapter errors', async () => {
    const store = {async read(){throw new Error('SECRET token');},async update(){throw new Error('SECRET token');}};
    let changes = 0;
    const history = module.createDiagnosticHistory({store,onChange(){changes++; throw new Error('observer');}});
    const result = await history.begin(origin()).finish({ok:true});
    assert.equal(result.ok,false);
    assert.equal(history.status().persistent,false);
    assert.match(history.status().issue,/storage/i);
    assert.equal(JSON.stringify(history.status()).includes('SECRET'),false);
    assert.equal((await history.list(origin())).ok,false);
    assert.equal((await history.clear(origin())).ok,false);
    assert.ok(changes >= 1);
});

test('export contains only versioned logs for the exact captured owner and chat', async () => {
    const history = module.createDiagnosticHistory({store:memoryStore()});
    await history.begin(origin()).finish({ok:true});
    await history.begin(origin({runId:'other',chatId:'other'})).finish({ok:true});
    assert.equal(typeof history.export,'function');
    const result = await history.export(origin());
    assert.equal(result.ok,true);
    const exported = JSON.parse(result.data.text);
    assert.equal(exported.version,1);
    assert.deepEqual(exported.scope,{userId:'owner',chatId:'chat',characterId:7,groupId:null});
    assert.deepEqual(exported.entries.map(entry=>entry.id),['run']);
    assert.match(result.data.fileName,/^lattice-diagnostics-\d{4}-\d\d-\d\d\.json$/);
    assert.equal((await history.export({userId:'owner'})).ok,false);
});

test('active capture buffers have a per-user ceiling with an explicit overflow omission', async () => {
    const history = module.createDiagnosticHistory({store:memoryStore()});
    const captures = Array.from({length:21},(_,i)=>history.begin(origin({runId:`active-${i}`})));
    const overflow = await captures[0].finish({ok:true});
    assert.equal(overflow.data.discarded,true);
    assert.match(overflow.data.omitted,/limit/i);
    await captures.at(-1).finish({ok:true});
    assert.deepEqual((await history.list(origin())).data.entries.map(row=>row.id),['active-20']);
});

test('repeated unavailable reads notify only when the visible storage status changes', async () => {
    let changes = 0;
    const history = module.createDiagnosticHistory({store:{async read(){throw new Error('blocked');}},onChange(){changes++;}});
    await history.list(origin());
    await history.list(origin());
    assert.equal(changes,1);
});

test('discardActive revokes queued finishes while preserving previously saved history', async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    await history.begin(origin({runId:'saved'})).finish({ok:true});
    let release, entered;
    const gate = new Promise(resolve => {release = resolve;});
    const started = new Promise(resolve => {entered = resolve;});
    const update = store.update.bind(store);
    store.update = async (...args) => {entered(); await gate; return update(...args);};
    const active = history.begin(origin({runId:'active'}));
    const pending = history.begin(origin({runId:'pending'})).finish({ok:true});
    await started;
    history.discardActive(); release();
    await pending;
    await active.finish({ok:true});
    assert.deepEqual((await history.list(origin())).data.entries.map(row=>row.id),['saved']);
});

test('preflight failures retain a bounded failing node even without a runtime address', async () => {
    const history = module.createDiagnosticHistory({store:memoryStore()});
    await history.begin(origin()).finish({ok:false,error:{code:'INVALID_CONFIGURATION',message:'Invalid configuration.',nodeId:'configuration'}});
    assert.equal((await history.list(origin())).data.entries[0].error.nodeId,'configuration');
});

test('runtime terminal settlement preserves unresolved status and failing address', async () => {
    const history = module.createDiagnosticHistory({store:memoryStore()}), capture = history.begin(origin());
    capture.event({type:'run-settled',status:'unresolved',error:{code:'UNRESOLVED_INPUT',message:'Missing input.'},failedAddress:address});
    await capture.finish({ok:false,unresolved:true,error:{code:'UNRESOLVED_INPUT',message:'Missing input.'}});
    const entry = (await history.list(origin())).data.entries[0];
    assert.equal(entry.status,'unresolved');
    assert.equal(entry.error.address.nodeId,'model');
});

test('terminal runtime counts override started attempts rejected before dispatch', async () => {
    const history = module.createDiagnosticHistory({store:memoryStore()}), capture = history.begin(origin());
    capture.event({type:'request-start',address,attempt:1,at:10});
    capture.event({type:'request-settled',address,attempt:1,status:'failed',dispatched:false,durationMs:0,error:{code:'MODEL_AUTHORITY_CHANGED',message:'Request authorization changed.'}});
    await capture.finish({ok:false,actualCalls:0,callBound:3,error:{code:'MODEL_AUTHORITY_CHANGED',message:'Request authorization changed.'}});
    const entry = (await history.list(origin())).data.entries[0];
    assert.equal(entry.actualCalls,0);
    assert.equal(entry.callBound,3);
    assert.equal(entry.attempts[0].status,'failed');
    assert.match(entry.attempts[0].response.omitted,/not dispatched/i);
});

test('native-source failure details survive reload with unknown detail fields excluded', async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    await history.begin(origin()).finish({ok:false,error:{code:'UNSUPPORTED_NATIVE_SOURCE',message:'Native source is unavailable.',details:{generationType:'normal',sourceReason:'USER_MESSAGE_REQUIRED',endpoint:'SECRET',request:{prompt:'SECRET'}}}});
    const reloaded = module.createDiagnosticHistory({store});
    const entries = (await reloaded.list(origin())).data.entries;
    assert.equal(entries.length,1);
    assert.deepEqual(entries[0].error.details,{generationType:'normal',sourceReason:'USER_MESSAGE_REQUIRED'});
    assert.equal(JSON.stringify(store.users.get('owner')).includes('SECRET'),false);
});

test('successful reads preserve a failed-write warning until a write succeeds', async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    const update = store.update.bind(store);
    store.update = async () => {throw new Error('Quota exceeded.');};
    assert.equal((await history.begin(origin()).finish({ok:true})).ok,false);
    assert.equal((await history.list(origin())).ok,true);
    assert.equal(history.status().persistent,false);
    assert.match(history.status().issue,/storage/i);
    store.update = update;
    assert.equal((await history.begin(origin({runId:'recovered'})).finish({ok:true})).ok,true);
    assert.deepEqual(history.status(),{persistent:true,issue:''});
});

test('a read-only storage failure recovers when a later read succeeds', async () => {
    let fail = true;
    const history = module.createDiagnosticHistory({store:{async read(){if (fail) throw new Error('Read blocked.'); return [];}}});
    assert.equal((await history.list(origin())).ok,false);
    assert.equal(history.status().persistent,false);
    fail = false;
    assert.equal((await history.list(origin())).ok,true);
    assert.deepEqual(history.status(),{persistent:true,issue:''});
});

test('discard after transform removes a late injected-store commit without rolling back other logs', async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    await history.begin(origin({runId:'previous'})).finish({ok:true});
    const otherStore = memoryStore(), otherHistory = module.createDiagnosticHistory({store:otherStore});
    await otherHistory.begin(origin({runId:'another-completed'})).finish({ok:true});
    const another = otherStore.users.get('owner')[0];
    let release, entered;
    const commitGate = new Promise(resolve => {release = resolve;});
    const transformed = new Promise(resolve => {entered = resolve;});
    let once = true;
    store.update = async (id,change) => {
        const next = change(store.users.get(id) ?? []);
        if (once) {once = false; entered(); await commitGate; next.push(another);}
        store.users.set(id,next);
        return next;
    };
    const pending = history.begin(origin({runId:'revoked'})).finish({ok:true});
    await transformed;
    history.discardActive(); release();
    const result = await pending;
    assert.deepEqual((await history.list(origin())).data.entries.map(row=>row.id).sort(),['another-completed','previous']);
    assert.equal(result.data.discarded,true);
    assert.equal(history.status().issue,'');
});

for (const mode of ['full','metadata']) test(`${mode}: clear after a copied transform defeats the late commit and preserves another chat`, async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    await history.begin(origin({runId:'other',chatId:'other'}),{mode}).finish({ok:false,error:{code:'INVALID_JSON',message:'Invalid JSON.'}});
    let release, entered;
    const commitGate = new Promise(resolve => {release = resolve;});
    const transformed = new Promise(resolve => {entered = resolve;});
    let once = true;
    store.update = async (id,change) => {
        const next = change(store.users.get(id) ?? []);
        if (once) {once = false; entered(); await commitGate;}
        store.users.set(id,next); return next;
    };
    const pending = history.begin(origin({runId:'revoked'}),{mode}).finish({ok:false,error:{code:'INVALID_JSON',message:'Invalid JSON.'}});
    await transformed;
    const clearing = history.clear(origin()); release();
    assert.equal((await pending).data.discarded,true);
    assert.equal((await clearing).ok,true);
    assert.deepEqual((await history.list(origin())).data.entries,[]);
    assert.deepEqual((await history.list(origin({chatId:'other'}))).data.entries.map(row=>row.id),['other']);
});

test('discard while the initial revision read fails remains a passive discarded capture', async () => {
    let release;
    const gate = new Promise(resolve => {release = resolve;});
    const store = memoryStore();
    store.revision = async () => {await gate; throw new Error('Read failed.');};
    const history = module.createDiagnosticHistory({store});
    const pending = history.begin(origin()).finish({ok:true});
    await Promise.resolve();
    history.discardActive(); release();
    assert.deepEqual(await pending,{ok:true,data:{discarded:true}});
    assert.equal(history.status().issue,'');
});

test('discard after a full-retention copied write restores its evicted previous log', async () => {
    const store = memoryStore(), history = module.createDiagnosticHistory({store});
    for (let index = 0; index < 50; index++) await history.begin(origin({runId:`previous-${index}`})).finish({ok:true});
    const previousIds = store.users.get('owner').map(entry=>entry.id).sort();
    let release, entered, once = true;
    const commitGate = new Promise(resolve => {release = resolve;});
    const transformed = new Promise(resolve => {entered = resolve;});
    store.update = async (id,change) => {
        const next = change(store.users.get(id) ?? []);
        if (once) {once = false; entered(); await commitGate;}
        store.users.set(id,next); return next;
    };
    const pending = history.begin(origin({runId:'revoked'})).finish({ok:true});
    await transformed;
    history.discardActive(); release();
    assert.equal((await pending).data.discarded,true);
    assert.deepEqual((await history.list(origin())).data.entries.map(entry=>entry.id).sort(),previousIds);
});
