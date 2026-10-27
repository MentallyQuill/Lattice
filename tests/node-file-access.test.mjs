import assert from 'node:assert/strict';
import test from 'node:test';
const module = await import('../src/ui/node-file-access.js').catch(() => ({}));
const must = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result.data; };
function fileHandle(identity, initial = 'old', name = identity + '.txt') {
    const state = {text:initial,writes:0,permission:'granted',requests:0,missing:false,failClose:false};
    return {name,kind:'file',identity,state,
        isSameEntry:async other => identity === other.identity,
        queryPermission:async () => state.permission,
        requestPermission:async () => { state.requests++; return state.permission; },
        getFile:async () => { if(state.missing)throw new DOMException('missing','NotFoundError'); const text=state.text; return {name,size:new TextEncoder().encode(text).length,lastModified:1,text:async()=>text}; },
        createWritable:async () => {state.writes++;let text;return {write:async value=>{text=value;},close:async()=>{if(state.failClose)throw new Error('failed close');state.text=text;},abort:async()=>{}};},
    };
}
function storage() {
    let saved={bindings:[],records:{}};
    return {load:async()=>saved,save:async value=>{saved={bindings:value.bindings.map(row=>({...row})),records:structuredClone(value.records)};}};
}
test('choose starts the native picker in the gesture and persists only a plain binding view', async () => {
    assert.equal(typeof module.createNodeFileAccess,'function');
    const handle=fileHandle('chosen');let picked=false,resolveReady;
    const persistence=storage(),originalLoad=persistence.load;
    persistence.load=()=>{persistence.load=originalLoad;return new Promise(resolve=>{resolveReady=async()=>resolve(await originalLoad());});};
    let configuration;
    const access=module.createNodeFileAccess({persistence,showSaveFilePicker:options=>{picked=true;configuration=options;return Promise.resolve(handle);}});
    const choosing=access.choose({mode:'save',name:'notes.txt',format:'text'});
    assert.equal(picked,true,'picker must precede persistence awaits');
    resolveReady();
    const selected=must(await choosing);
    assert.equal(configuration.suggestedName,'notes.txt');
    assert.deepEqual(configuration.types,[{description:'Text document',accept:{'text/plain':['.txt']}}]);
    assert.equal(handle.state.writes,0);
    assert.equal(handle.state.text,'old');
    assert.deepEqual(access.snapshot(),{[selected.bindingId]:{bindingId:selected.bindingId,name:'chosen.txt',format:'text',status:'ready'}});
    assert.equal(JSON.stringify(access.snapshot()).includes('handle'),false);
});
test('revoked picker permission produces an explicit error without retaining authority', async()=>{
    const handle=fileHandle('denied');handle.state.permission='denied';
    const access=module.createNodeFileAccess({persistence:storage(),showOpenFilePicker:async()=>[handle]});
    const result=await access.choose({mode:'open',name:'denied.txt',format:'text'});
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'FILE_PERMISSION');
    assert.deepEqual(access.snapshot(),{});
    assert.equal(handle.state.requests,0);
});
const scope={userId:'user',chatId:'chat',actorId:'actor'};
const definition=(bindingId,overrides={})=>({targetId:'logical-notes',bindingId,name:'notes.txt',format:'text',content:'seed',missing:'error',visibility:{kind:'public'},...overrides});
async function selected(handle=fileHandle('notes'),persistence=storage()){
    const access=module.createNodeFileAccess({persistence,showOpenFilePicker:async()=>[handle]});
    const binding=must(await access.choose({mode:'open',name:'notes.txt',format:'text'}));
    return {access,handle,binding,persistence};
}
test('captured backend reads disk bytes using a content hash and exposes empty durable history',async()=>{
    const {access,handle,binding}=await selected();
    assert.equal(typeof access.backend,'function');
    const backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    const loaded=must(await backend.load('logical-notes'));
    assert.equal(loaded.targetId,'logical-notes');assert.equal(loaded.content,'old');assert.equal(loaded.format,'text');
    assert.equal(loaded.revision,'sha256:cba06b5736faf67e54b07b561eae94395e774c517a7d910a54369e1263ccfbd4');
    assert.deepEqual(loaded.receipts,[]);assert.deepEqual(loaded.history,{schemaVersion:1,epoch:0,head:null});
    assert.deepEqual(must(await backend.lookupHistory('logical-notes',{intentId:'missing'})),{epoch:0,visibility:{kind:'public'},privateActorIds:[]});
    handle.state.permission='prompt';
    assert.equal((await backend.load('logical-notes')).error.code,'FILE_PERMISSION');
    assert.equal(handle.state.requests,0,'backend operations never prompt for permission');
});

const fingerprint='sha256:'+'a'.repeat(64);
const update=(snapshot,content='next',intentId='intent-1')=>({targetId:snapshot.targetId,expectedRevision:snapshot.revision,expectedContent:snapshot.content,projectedDocument:{format:snapshot.format,content},intentId,fingerprint});
test('CAS writes accepted content once and persists a scoped receipt',async()=>{
    const {access,handle,binding,persistence}=await selected();
    const backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    assert.equal(typeof backend.compareAndSwap,'function');
    const old=must(await backend.load('logical-notes')),change=update(old);
    const saved=must(await backend.compareAndSwap(change,{}));
    assert.equal(saved.applied,true);assert.equal(saved.acknowledged,true);assert.equal(handle.state.text,'next');assert.equal(handle.state.writes,1);
    const fresh=module.createNodeFileAccess({persistence});await fresh.ready;
    const receipt=must(await fresh.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true}).load('logical-notes')).receipts;
    assert.deepEqual(receipt,[{intentId:'intent-1',fingerprint,revision:saved.revision}]);
    const other=fresh.backend([definition(binding.bindingId)],{scope:{...scope,chatId:'other'},isCurrent:()=>true});
    assert.deepEqual(must(await other.load('logical-notes')).receipts,[],'copied scope never inherits receipt authority');
});
test('a durable pending intent is required before opening any disk write stream',async()=>{
    const {access,handle,binding,persistence}=await selected();
    const backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    const old=must(await backend.load('logical-notes'));
    persistence.save=async()=>{throw new Error('quota exceeded');};
    const result=await backend.compareAndSwap(update(old),{});
    assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_JOURNAL_FAILED');
    assert.equal(handle.state.writes,0);assert.equal(handle.state.text,'old');
});
test('reopening reconciles bytes written before receipt persistence without applying the intent twice',async()=>{
    const {access,handle,binding,persistence}=await selected();
    const backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    const old=must(await backend.load('logical-notes')),change=update(old,'old\nappended');
    const save=persistence.save;let saves=0;
    persistence.save=async value=>{if(++saves===2)throw new Error('crash before receipt');return save(value);};
    assert.equal(must(await backend.compareAndSwap(change,{})).acknowledged,false);
    assert.equal(handle.state.text,'old\nappended');
    persistence.save=save;
    const recovered=module.createNodeFileAccess({persistence});await recovered.ready;
    const resumed=recovered.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    const loaded=must(await resumed.load('logical-notes'));
    assert.equal(loaded.receipts.length,1);assert.equal(loaded.receipts[0].intentId,'intent-1');
    assert.equal(must(await resumed.compareAndSwap(change,{})).acknowledged,true);
    assert.equal(handle.state.writes,1,'durable recovery must never append a second time');
});
test('stale authority discovered during pending persistence aborts before disk writing',async()=>{
    const {access,handle,binding,persistence}=await selected();let isCurrent=true;
    const backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>isCurrent});
    const old=must(await backend.load('logical-notes')),save=persistence.save;
    persistence.save=async value=>{await save(value);isCurrent=false;};
    const result=await backend.compareAndSwap(update(old),{});
    assert.equal(result.ok,false);assert.equal(result.error.code,'STALE_FILE_SCOPE');
    assert.equal(handle.state.writes,0);assert.equal(handle.state.text,'old');
});
test('an external edit during journal persistence conflicts before a stream opens',async()=>{
    const {access,handle,binding,persistence}=await selected();
    const backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    const old=must(await backend.load('logical-notes')),save=persistence.save;
    persistence.save=async value=>{await save(value);handle.state.text='external';};
    const result=await backend.compareAndSwap(update(old),{});
    assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_REVISION_CONFLICT');
    assert.equal(handle.state.writes,0);assert.equal(handle.state.text,'external');
});
function indexedDatabase(){
    const stores=new Map();
    const db={objectStoreNames:{contains:name=>stores.has(name)},createObjectStore:name=>stores.set(name,new Map()),transaction(name){
        const tx={objectStore(){const rows=stores.get(name);return {get(key){const request={};queueMicrotask(()=>{request.result=rows.get(key);request.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});return request;},put(value,key){const request={};queueMicrotask(()=>{rows.set(key,value);request.result=key;request.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});return request;}};}};return tx;
    }};
    return {open(){const request={};queueMicrotask(()=>{request.result=db;request.onupgradeneeded?.();request.onsuccess?.();});return request;}};
}
test('the default IndexedDB boundary restores native handles without exposing them in snapshots',async()=>{
    const indexedDB=indexedDatabase(),handle=fileHandle('durable');
    const access=module.createNodeFileAccess({indexedDB,showOpenFilePicker:async configuration=>{assert.equal(configuration.mode,'readwrite');return [handle];}});
    must(await access.ready);
    const binding=must(await access.choose({mode:'open',name:'durable.txt',format:'text'}));
    const reloaded=module.createNodeFileAccess({indexedDB});must(await reloaded.ready);
    assert.equal(reloaded.snapshot()[binding.bindingId].name,'durable.txt');
    assert.equal(reloaded.snapshot()[binding.bindingId].handle,undefined);
    assert.equal(must(await reloaded.backend([definition(binding.bindingId,{name:'durable.txt'})],{scope,isCurrent:()=>true}).load('logical-notes')).content,'old');
});
test('selecting the same physical file reuses its binding and rejects format disagreement',async()=>{
    const first=fileHandle('same'),second={...first};let picked=first;
    const access=module.createNodeFileAccess({persistence:storage(),showOpenFilePicker:async()=>[picked]});
    const binding=must(await access.choose({mode:'open',name:'same.txt',format:'text'}));picked=second;
    const duplicate=must(await access.choose({mode:'open',name:'same.txt',format:'text'}));
    assert.equal(duplicate.bindingId,binding.bindingId);assert.equal(Object.keys(access.snapshot()).length,1);
    const conflict=await access.choose({mode:'open',name:'same.json',format:'json'});
    assert.equal(conflict.ok,false);assert.equal(conflict.error.code,'FILE_FORMAT_CONFLICT');
});
test('concurrent service instances serialize writes and reject the stale CAS',async()=>{
    const {access,handle,binding,persistence}=await selected();
    const other=module.createNodeFileAccess({persistence});await other.ready;
    const first=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true}),second=other.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    const old=must(await first.load('logical-notes'));
    const results=await Promise.all([first.compareAndSwap(update(old,'one','one'),{}),second.compareAndSwap(update(old,'two','two'),{})]);
    assert.equal(results.filter(result=>result.ok).length,1);assert.equal(results.find(result=>!result.ok).error.code,'FILE_REVISION_CONFLICT');
    assert.equal(handle.state.writes,1);assert.equal(handle.state.text,'one');
});

test('a capture made during IndexedDB startup resolves the original binding when ready',async()=>{
    const {binding,persistence}=await selected();
    const restored=module.createNodeFileAccess({persistence});
    const backend=restored.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    assert.equal(must(await backend.load('logical-notes')).content,'old');
});
test('format disagreement is rejected before persisting an intent or writing a file',async()=>{
    const {access,handle,binding}=await selected();
    const mismatched=access.backend([definition(binding.bindingId,{format:'json'})],{scope,isCurrent:()=>true});
    const result=await mismatched.load('logical-notes');
    assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_FORMAT_CONFLICT');
    const backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    const old=must(await backend.load('logical-notes')),change=update(old);change.projectedDocument.format='json';
    const saved=await backend.compareAndSwap(change,{});
    assert.equal(saved.ok,false);assert.equal(saved.error.code,'FILE_FORMAT_CONFLICT');assert.equal(handle.state.writes,0);
});
test('explicit Save selection stages initial JSON for empty files without writing before CAS',async()=>{
    const handle=fileHandle('new','','new.json'),persistence=storage();
    const access=module.createNodeFileAccess({persistence,showSaveFilePicker:async()=>handle});
    const binding=must(await access.choose({mode:'save',name:'new.json',format:'json'}));
    assert.equal(handle.state.text,'');assert.equal(handle.state.writes,0);
    const restored=module.createNodeFileAccess({persistence});await restored.ready;
    const backend=restored.backend([definition(binding.bindingId,{name:'new.json',format:'json',missing:'create',content:'[]'})],{scope,isCurrent:()=>true});
    const snapshot=must(await backend.load('logical-notes'));assert.equal(snapshot.content,'[]');
    assert.equal(snapshot.revision,'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    must(await backend.compareAndSwap(update(snapshot,'[1]'),{}));assert.equal(handle.state.text,'[1]');
    handle.state.text='';
    assert.equal(must(await backend.load('logical-notes')).content,'','saved receipt consumes initial template authority');
    const opened=await selected(fileHandle('opened',''));
    assert.equal(must(await opened.access.backend([definition(opened.binding.bindingId,{name:'opened.txt',missing:'create',content:'seed'})],{scope,isCurrent:()=>true}).load('logical-notes')).content,'');
});
test('missing create policy stages a template and detects a file that appears before Apply',async()=>{
    const {access,handle,binding}=await selected();handle.state.missing=true;
    const errors=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    assert.equal((await errors.load('logical-notes')).error.code,'FILE_NOT_FOUND');
    const backend=access.backend([definition(binding.bindingId,{missing:'create',content:'seed'})],{scope,isCurrent:()=>true});
    const old=must(await backend.load('logical-notes'));assert.equal(old.content,'seed');assert.equal(handle.state.writes,0);
    handle.state.missing=false;handle.state.text='external';
    const result=await backend.compareAndSwap(update(old),{});assert.equal(result.error.code,'FILE_REVISION_CONFLICT');assert.equal(handle.state.writes,0);
});
test('ambiguous bytes after close retain the pending intent and block subsequent writes',async()=>{
    const handle=fileHandle('ambiguous'),open=handle.createWritable;
    handle.createWritable=async()=>{const writer=await open();return {...writer,close:async()=>{await writer.close();handle.state.text='third version';}};};
    const {access,binding}=await selected(handle);
    const backend=access.backend([definition(binding.bindingId,{name:'ambiguous.txt'})],{scope,isCurrent:()=>true}),old=must(await backend.load('logical-notes'));
    const result=await backend.compareAndSwap(update(old),{});
    assert.equal(result.ok,false);assert.equal(result.error.code,'PERSISTENCE_UNKNOWN');
    assert.equal((await backend.load('logical-notes')).error.code,'PERSISTENCE_UNKNOWN');
    assert.equal((await backend.compareAndSwap(update(old,'again','intent-2'),{})).error.code,'PERSISTENCE_UNKNOWN');assert.equal(handle.state.writes,1);
});
test('malformed CAS data is rejected without invoking accessors or opening a stream',async()=>{
    const {access,handle,binding}=await selected();
    const backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true}),old=must(await backend.load('logical-notes'));
    const bad=update(old);bad.fingerprint='untrusted';
    const invalid=await backend.compareAndSwap(bad,{});
    assert.equal(invalid.ok,false);assert.equal(invalid.error.code,'INVALID_FILE_BACKEND_UPDATE');
    let invoked=0;const accessor=update(old);Object.defineProperty(accessor,'projectedDocument',{enumerable:true,get(){invoked++;return {format:'text',content:'injected'};}});
    const rejected=await backend.compareAndSwap(accessor,{});
    assert.equal(rejected.ok,false);assert.equal(rejected.error.code,'INVALID_FILE_BACKEND_UPDATE');
    assert.equal(invoked,0);assert.equal(handle.state.writes,0);
});
test('permission status changes publish plain binding views that callers cannot mutate',async()=>{
    const {access,handle,binding}=await selected();let changes=0;
    const unsubscribe=access.subscribe(()=>changes++),backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    handle.state.permission='denied';assert.equal((await backend.load('logical-notes')).error.code,'FILE_PERMISSION');
    assert.equal(access.snapshot()[binding.bindingId].status,'permission-required');assert.equal(changes,1);
    handle.state.permission='granted';must(await backend.load('logical-notes'));
    assert.equal(access.snapshot()[binding.bindingId].status,'ready');assert.equal(changes,2);
    const snapshot=access.snapshot();snapshot[binding.bindingId].name='changed';assert.equal(access.snapshot()[binding.bindingId].name,'notes.txt');unsubscribe();
});
test('backend admission rejects absent scope and conflicting declarations before accessing files',async()=>{
    const {access,binding}=await selected();
    const invalid=access.backend([definition(binding.bindingId)],{scope:{},isCurrent:()=>true});
    const invalidResult=await invalid.load('logical-notes');assert.equal(invalidResult.ok,false);assert.equal(invalidResult.error.code,'INVALID_FILE_BACKEND_CONFIG');
    const duplicate=access.backend([definition(binding.bindingId),definition('another')],{scope,isCurrent:()=>true});
    const duplicateResult=await duplicate.load('logical-notes');assert.equal(duplicateResult.ok,false);assert.equal(duplicateResult.error.code,'INVALID_FILE_BACKEND_CONFIG');
});

test('empty history exposes requested outcome and progression collections',async()=>{
    const {access,binding}=await selected(),backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    assert.deepEqual(must(await backend.lookupHistory('logical-notes',{outcomes:{eventIds:['event'],libraryId:'library',rerollId:null},progression:{identityKeys:[],eventIds:[]}})),{epoch:0,visibility:{kind:'public'},privateActorIds:[],outcomes:[],progression:{knownIdentityKeys:[],eventIdentities:[]}});
});
test('chat source bindings survive receipt recovery and remain scoped to their originating chat',async()=>{
    const {access,handle,binding,persistence}=await selected();
    const backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true}),old=must(await backend.load('logical-notes'));
    const sourceBinding={schemaVersion:1,messageCount:1,prefixHash:'sha256:'+'b'.repeat(64)};
    const change={...update(old),sourceBinding,expectedBindingFingerprint:'sha256:74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b'};
    const save=persistence.save;let saves=0;persistence.save=async value=>{if(++saves===2)throw new Error('crash');return save(value);};
    assert.equal(must(await backend.compareAndSwap(change,{})).acknowledged,false);persistence.save=save;
    const restored=module.createNodeFileAccess({persistence});await restored.ready;
    const resumed=restored.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true}),fresh=must(await resumed.load('logical-notes'));
    assert.deepEqual(fresh.sourceBinding,sourceBinding);
    const wrong={...update(fresh,'again','intent-2'),sourceBinding:{...sourceBinding,messageCount:2},expectedBindingFingerprint:change.expectedBindingFingerprint};
    assert.equal((await resumed.compareAndSwap(wrong,{})).error.code,'FILE_REVISION_CONFLICT');assert.equal(handle.state.writes,1);
    const other=restored.backend([definition(binding.bindingId)],{scope:{...scope,chatId:'other'},isCurrent:()=>true});
    assert.equal(must(await other.load('logical-notes')).sourceBinding,undefined);
});
test('permission revoked while persisting the pending intent prevents opening a writer',async()=>{
    const {access,handle,binding,persistence}=await selected();
    const backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true}),old=must(await backend.load('logical-notes')),save=persistence.save;
    persistence.save=async value=>{await save(value);handle.state.permission='denied';};
    const result=await backend.compareAndSwap(update(old),{});
    assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_PERMISSION');assert.equal(handle.state.writes,0);assert.equal(handle.state.requests,0);
});
test('renaming a selected physical file invalidates old captures while preserving pending recovery',async()=>{
    const {access,handle,binding,persistence}=await selected();
    const backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true}),old=must(await backend.load('logical-notes'));
    const save=persistence.save;let saves=0;persistence.save=async value=>{if(++saves===2)throw new Error('crash');return save(value);};
    must(await backend.compareAndSwap(update(old),{}));persistence.save=save;
    const renamed={...handle,name:'renamed.txt'};
    const chooser=module.createNodeFileAccess({persistence,showOpenFilePicker:async()=>[renamed]});await chooser.ready;
    const picked=must(await chooser.choose({mode:'open',bindingId:binding.bindingId,name:'renamed.txt',format:'text'}));
    assert.equal(picked.bindingId,binding.bindingId);
    assert.equal((await backend.load('logical-notes')).error.code,'STALE_FILE_BINDING');
    const resumed=chooser.backend([definition(binding.bindingId,{name:'renamed.txt'})],{scope,isCurrent:()=>true});
    assert.equal(must(await resumed.load('logical-notes')).receipts.length,1);assert.equal(handle.state.writes,1);
});
test('choosing a previously restored handle refreshes its permission-ready status',async()=>{
    const {handle,binding,persistence}=await selected();
    const access=module.createNodeFileAccess({persistence,showOpenFilePicker:async()=>[handle]});await access.ready;
    assert.equal(access.snapshot()[binding.bindingId].status,'permission-required');
    const chosen=must(await access.choose({mode:'open',name:'notes.txt',format:'text'}));
    assert.equal(chosen.bindingId,binding.bindingId);assert.equal(access.snapshot()[binding.bindingId].status,'ready');
});
test('valid replacements admit old and new contents independently within document limits',async()=>{
    const {access,handle,binding}=await selected(fileHandle('large','a'.repeat(150000)));
    const backend=access.backend([definition(binding.bindingId,{name:'large.txt'})],{scope,isCurrent:()=>true}),old=must(await backend.load('logical-notes'));
    must(await backend.compareAndSwap(update(old,'b'.repeat(150000)),{}));assert.equal(handle.state.text,'b'.repeat(150000));assert.equal(handle.state.writes,1);
});
test('receipt capacity blocks another write before opening a stream',async()=>{
    const {access,handle,binding,persistence}=await selected();
    const backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true}),old=must(await backend.load('logical-notes'));
    must(await backend.compareAndSwap(update(old),{}));
    const state=await persistence.load(),key=Object.keys(state.records)[0];
    state.records[key].receipts=Array.from({length:256},(_,i)=>({intentId:'saved-'+i,fingerprint,revision:old.revision}));await persistence.save(state);
    const fresh=must(await backend.load('logical-notes')),result=await backend.compareAndSwap(update(fresh,'more','overflow'),{});
    assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_RECEIPT_LIMIT');assert.equal(handle.state.writes,1);
});
test('oversized disk files are rejected before reading their bytes',async()=>{
    const handle=fileHandle('oversized');let read=false;
    handle.getFile=async()=>({size:300000,text:async()=>{read=true;return 'x'.repeat(300000);}});
    const {access,binding}=await selected(handle),backend=access.backend([definition(binding.bindingId,{name:'oversized.txt'})],{scope,isCurrent:()=>true});
    const result=await backend.load('logical-notes');assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_DOCUMENT_LIMIT');assert.equal(read,false);
});
test('configured filenames must match the captured native binding',async()=>{
    const {access,handle,binding}=await selected(),backend=access.backend([definition(binding.bindingId,{name:'different.txt'})],{scope,isCurrent:()=>true});
    const result=await backend.load('logical-notes');assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_NAME_CONFLICT');assert.equal(handle.state.writes,0);
});

function legacyPacket(overrides={}){
    const oldReceipt={intentId:'archived-intent',fingerprint:'sha256:'+'c'.repeat(64),revision:1};
    const page={schemaVersion:1,pageId:'legacy-receipts',targetId:'logical-notes',scope,visibility:{kind:'actor-private',actorId:'actor'},epoch:1,checkpointId:'checkpoint-1',previous:null,kind:'receipts',payload:[oldReceipt]};
    const snapshot={targetId:'logical-notes',scope,revision:3,format:'text',content:'old',receipts:[{intentId:'active-intent',fingerprint:'sha256:'+'d'.repeat(64),revision:3}],sourceBinding:{schemaVersion:1,messageCount:1,prefixHash:'sha256:'+'e'.repeat(64)},history:{schemaVersion:1,epoch:1,head:page.pageId},...overrides};
    return {snapshot,pages:{[page.pageId]:page}};
}
test('matching legacy adoption durably retains scoped receipts, source bindings and archived history without writing bytes',async()=>{
    const {access,handle,binding,persistence}=await selected(),backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true}),packet=legacyPacket();
    assert.equal(typeof backend.adoptLegacy,'function');
    assert.deepEqual(must(await backend.adoptLegacy('logical-notes',packet)),{adopted:true});assert.equal(handle.state.writes,0);
    const reloaded=module.createNodeFileAccess({persistence});await reloaded.ready;
    const restored=reloaded.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true}),loaded=must(await restored.load('logical-notes'));
    assert.deepEqual(loaded.history,packet.snapshot.history);assert.deepEqual(loaded.receipts,packet.snapshot.receipts);assert.deepEqual(loaded.sourceBinding,packet.snapshot.sourceBinding);
    const history=must(await restored.lookupHistory('logical-notes',{intentId:'archived-intent'}));assert.equal(history.epoch,1);assert.equal(history.receipt.intentId,'archived-intent');assert.deepEqual(history.visibility,{kind:'actor-private',actorId:'actor'});
    const other=reloaded.backend([definition(binding.bindingId)],{scope:{...scope,chatId:'other'},isCurrent:()=>true});assert.equal(must(await other.load('logical-notes')).history.epoch,0);assert.deepEqual(must(await other.load('logical-notes')).receipts,[]);
});
test('adopted legacy history survives later CAS and pending-receipt recovery',async()=>{
    const {access,binding,persistence}=await selected(),backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true}),packet=legacyPacket();
    must(await backend.adoptLegacy('logical-notes',packet));const old=must(await backend.load('logical-notes'));
    const save=persistence.save;let saves=0;persistence.save=async value=>{if(++saves===2)throw new Error('crash');return save(value);};
    assert.equal(must(await backend.compareAndSwap(update(old),{})).acknowledged,false);persistence.save=save;
    const restored=module.createNodeFileAccess({persistence});await restored.ready;
    const resumed=restored.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true}),loaded=must(await resumed.load('logical-notes'));
    assert.equal(loaded.history.epoch,1);assert.equal(loaded.receipts.length,2);
    assert.equal(must(await resumed.lookupHistory('logical-notes',{intentId:'archived-intent'})).receipt.intentId,'archived-intent');
    must(await resumed.compareAndSwap(update(loaded,'last','intent-2'),{}));
    assert.equal(must(await resumed.load('logical-notes')).history.epoch,1);
    assert.equal(must(await resumed.lookupHistory('logical-notes',{intentId:'archived-intent'})).receipt.intentId,'archived-intent');
});
test('adopted JSON checkpoint markers cannot be dropped by a later CAS',async()=>{
    const content=JSON.stringify({historyCheckpoint:{targetId:'logical-notes',epoch:1},values:[],ledger:[]});
    const handle=fileHandle('notes',content,'notes.json'),access=module.createNodeFileAccess({persistence:storage(),showOpenFilePicker:async()=>[handle]});
    const binding=must(await access.choose({mode:'open',name:'notes.json',format:'json'}));
    const backend=access.backend([definition(binding.bindingId,{name:'notes.json',format:'json'})],{scope,isCurrent:()=>true}),packet=legacyPacket({content,format:'json'});
    must(await backend.adoptLegacy('logical-notes',packet));const old=must(await backend.load('logical-notes'));
    const result=await backend.compareAndSwap(update(old,'{}'),{});assert.equal(result.ok,false);assert.equal(result.error.code,'DOCUMENT_HISTORY_CHANGED');assert.equal(handle.state.writes,0);
});

test('explicit same-binding format reconfiguration invalidates old captures without writing bytes',async()=>{
    const {access,handle,binding}=await selected(),oldBackend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    const changed=must(await access.choose({mode:'open',bindingId:binding.bindingId,name:'notes.txt',format:'json'}));
    assert.equal(changed.bindingId,binding.bindingId);assert.equal(access.snapshot()[binding.bindingId].format,'json');assert.equal(handle.state.writes,0);
    assert.equal((await oldBackend.load('logical-notes')).error.code,'STALE_FILE_BINDING');
    const current=access.backend([definition(binding.bindingId,{format:'json'})],{scope,isCurrent:()=>true});assert.equal(must(await current.load('logical-notes')).content,'old');
});
test('selecting a different physical file never retargets an existing expected binding',async()=>{
    const persistence=storage(),oldHandle=fileHandle('notes'),newHandle=fileHandle('other');let picked=oldHandle;
    const access=module.createNodeFileAccess({persistence,showOpenFilePicker:async()=>[picked]}),first=must(await access.choose({mode:'open',name:'notes.txt',format:'text'}));
    const old=access.backend([definition(first.bindingId)],{scope,isCurrent:()=>true});picked=newHandle;
    const second=must(await access.choose({mode:'open',bindingId:first.bindingId,name:'other.txt',format:'json'}));
    assert.notEqual(second.bindingId,first.bindingId);assert.equal(access.snapshot()[first.bindingId].name,'notes.txt');assert.equal(access.snapshot()[first.bindingId].format,'text');
    assert.equal(must(await old.load('logical-notes')).content,'old');assert.equal(oldHandle.state.writes,0);assert.equal(newHandle.state.writes,0);
});
test('legacy adoption rejects scope or archive mismatches and never replaces an established association',async()=>{
    const {access,handle,binding}=await selected(),backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    assert.deepEqual(must(await backend.adoptLegacy('logical-notes',legacyPacket({content:'different'}))),{adopted:false});
    const copied=legacyPacket({scope:{...scope,chatId:'other'}});assert.equal((await backend.adoptLegacy('logical-notes',copied)).error.code,'INVALID_DOCUMENT_HISTORY');
    const wrongPage=legacyPacket();wrongPage.pages['legacy-receipts'].scope={...scope,chatId:'other'};assert.equal((await backend.adoptLegacy('logical-notes',wrongPage)).error.code,'INVALID_DOCUMENT_HISTORY');
    must(await backend.adoptLegacy('logical-notes',legacyPacket()));handle.state.text='changed externally';
    const replacement=legacyPacket({content:handle.state.text,receipts:[],history:{schemaVersion:1,epoch:0,head:null}});replacement.pages={};
    assert.deepEqual(must(await backend.adoptLegacy('logical-notes',replacement)),{adopted:true});
    const loaded=must(await backend.load('logical-notes'));assert.equal(loaded.history.epoch,1);assert.equal(loaded.receipts.length,1);assert.equal(handle.state.writes,0);
});
test('a native read failure during final legacy adoption checks returns a failure Result',async()=>{
    const {access,handle,binding}=await selected(),backend=access.backend([definition(binding.bindingId)],{scope,isCurrent:()=>true});
    const getFile=handle.getFile;let reads=0;handle.getFile=async()=>{if(++reads===2)throw new DOMException('missing','NotFoundError');return getFile();};
    let result;await assert.doesNotReject(async()=>{result=await backend.adoptLegacy('logical-notes',legacyPacket());});
    assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_NOT_FOUND');assert.equal(handle.state.writes,0);
});
