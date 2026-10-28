import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,resolve,isAbsolute} from 'node:path';
const module=await import('../src/ui/server-file-access.js').catch(()=>({}));
const must=result=>{assert.equal(result.ok,true,JSON.stringify(result.error));return result.data;};
const binding={bindingId:'server-notes',name:'notes.txt',format:'text',path:'/stories/notes.txt',generation:'generation-1',status:'ready',storage:'server'};
const scope={userId:'user',chatId:'chat'};
const definition={targetId:'notes',bindingId:binding.bindingId,name:'notes.txt',format:'text',content:'',missing:'create',visibility:{kind:'public'}};
const status=()=>({apiVersion:1,userId:'user',basePath:'/data/user/files/lattice',platform:'linux',canUseAbsolutePaths:true,bindings:{[binding.bindingId]:binding}});
const response=(data,statusCode=200)=>({ok:statusCode>=200&&statusCode<300,status:statusCode,json:async()=>data});

test('chooser transport requires declared capabilities and validates bounded authenticated listings',async()=>{
 const data={...status(),chooserVersion:1,operations:['configure','load','cas','history','adopt','roots','browse']};
 const f=fixture({fetch:async url=>response({ok:true,data:url.endsWith('/status')?data:url.endsWith('/roots')?{chooserVersion:1,roots:[{name:'Files',path:'/data/user'}]}:{chooserVersion:1,path:'/data/user',parent:null,entries:[{name:'notes.txt',path:'/data/user/notes.txt',kind:'file'}],truncated:false}})});
 must(await f.access.ready);assert.deepEqual(f.access.serviceVersion,{apiVersion:1,chooserVersion:1});
 assert.equal(must(await f.access.roots()).roots[0].path,'/data/user');assert.equal(must(await f.access.browse({path:'/data/user'})).entries[0].kind,'file');
 assert.deepEqual(f.calls[1].body,{userId:'user'});assert.deepEqual(f.calls[2].body,{userId:'user',path:'/data/user'});
 f.user('other');assert.equal((await f.access.roots()).error.code,'FILE_SERVICE_USER');
 const old=fixture();await old.access.ready;assert.equal(old.access.supported,true);assert.equal((await old.access.roots()).error.code,'FILE_SERVICE_INCOMPATIBLE');
});
test('setup capability checks distinguish denied and incompatible from unreachable',async()=>{
 for(const [reply,code] of [[response(null,403),'FILE_SERVICE_DENIED'],[response({ok:true,data:{...status(),apiVersion:2}}),'FILE_SERVICE_INCOMPATIBLE']]){
  const f=fixture({fetch:async()=>reply});const result=await f.access.ready;assert.equal(result.error.code,code);assert.equal(f.access.availability.code,code);
 }
});
function fixture(options={}){
 let user='user';const calls=[];
 const access=module.createServerFileAccess({getContext:()=>({getRequestHeaders:()=>({'Content-Type':'application/json','X-CSRF-Token':'host-token'})}),getUserId:()=>user,fetch:async(url,request)=>{calls.push({url,request,body:request.body?JSON.parse(request.body):null});return options.fetch?options.fetch(url,request):response({ok:true,data:url.endsWith('/status')?status():binding});}});
 return {access,calls,user(value){user=value;}};
}

test('server file support configures a path without native pickers or writing document bytes',async()=>{
 assert.equal(typeof module.createServerFileAccess,'function');
 const f=fixture();must(await f.access.ready);
 assert.equal(f.access.supported,true);assert.equal(f.access.native,false);assert.equal(f.access.storage,'server');assert.equal(f.access.availability,null);
 assert.deepEqual(f.access.location,{basePath:'/data/user/files/lattice',platform:'linux',canUseAbsolutePaths:true});
 const chosen=must(await f.access.choose({mode:'save',name:'notes.txt',format:'text',path:'/stories/notes.txt'}));
 assert.equal(chosen.bindingId,binding.bindingId);assert.equal(chosen.path,binding.path);
 assert.deepEqual(f.access.snapshot(),{[binding.bindingId]:binding});
 assert.deepEqual(f.calls.map(call=>call.url),['/api/plugins/lattice-files/status','/api/plugins/lattice-files/configure']);
 assert.deepEqual(f.calls[1].body,{userId:'user',path:'/stories/notes.txt',name:'notes.txt',format:'text',mode:'save'});
 assert.equal(f.calls[1].request.credentials,'same-origin');assert.equal(f.calls[1].request.cache,'no-store');
 assert.equal(f.calls[1].request.headers['X-CSRF-Token'],'host-token');
 assert.equal(f.calls[1].body.content,undefined);
});

test('a captured backend reads, checks and writes through the scoped server binding',async()=>{
 const revision='sha256:'+'a'.repeat(64),nextRevision='sha256:'+'b'.repeat(64),update={targetId:'notes',expectedRevision:revision,expectedContent:'Before',projectedDocument:{targetId:'notes',format:'text',content:'After'},intentId:'intent-1',fingerprint:'sha256:'+'c'.repeat(64)};
 const f=fixture({fetch:async url=>response({ok:true,data:url.endsWith('/status')?status():url.endsWith('/load')?{targetId:'notes',format:'text',content:'Before',revision,receipts:[],history:{schemaVersion:1,epoch:0,head:null}}:url.endsWith('/cas')?{applied:true,acknowledged:true,revision:nextRevision}:url.endsWith('/history')?{epoch:0,visibility:{kind:'public'},privateActorIds:[]}: {adopted:true}})});
 must(await f.access.ready);
 const backend=f.access.backend([definition],{scope,isCurrent:()=>true});
 const loaded=must(await backend.load('notes'));assert.equal(loaded.content,'Before');
 definition.content='mutated after capture';
 try{
  assert.equal(must(await backend.compareAndSwap(update)).revision,nextRevision);
  assert.equal(must(await backend.lookupHistory('notes',{})).epoch,0);
  assert.equal(must(await backend.adoptLegacy('notes',{snapshot:{targetId:'notes',format:'text',content:'Before',revision,receipts:[],scope},pages:{}})).adopted,true);
  for(const call of f.calls.slice(1)){assert.equal(call.body.userId,'user');assert.deepEqual(call.body.scope,scope);assert.equal(call.body.definition.content,'');assert.equal(call.body.generation,'generation-1');}
  assert.deepEqual(f.calls[2].body.update,update);
 }finally{definition.content='';}
});
test('the server CAS captures only the late confirmed publication stamp',async()=>{
 const revision='sha256:'+('a'.repeat(64)),f=fixture({fetch:async url=>response({ok:true,data:url.endsWith('/status')?status():{applied:true,acknowledged:true,revision}})});
 must(await f.access.ready);let published;
 const backend=f.access.backend([definition],{scope,isCurrent:()=>true,getBranchBinding:()=>published});
 published={schemaVersion:1,messageCount:4,prefixHash:'sha256:'+('b'.repeat(64))};
 const update={targetId:'notes',expectedRevision:revision,expectedContent:'before',projectedDocument:{format:'text',content:'after'},intentId:'late-stamp',fingerprint:'sha256:'+('c'.repeat(64))};
 must(await backend.compareAndSwap(update));assert.deepEqual(f.calls.at(-1).body.branchBinding,published);
 published=undefined;must(await backend.compareAndSwap({...update,intentId:'no-stamp'}));assert.equal(f.calls.at(-1).body.branchBinding,undefined);
});

test('missing server installation has actionable host guidance and can be refreshed after installation',async()=>{
 let installed=false;
 const f=fixture({fetch:async()=>installed?response({ok:true,data:status()}):response(null,404)});
 const unavailable=await f.access.ready;
 assert.equal(unavailable.ok,false);assert.equal(f.access.supported,false);
 assert.equal(f.access.availability.code,'FILE_SERVICE_REQUIRED');
 assert.match(f.access.availability.message,/Install the Lattice file service on the SillyTavern server/);
 assert.doesNotMatch(f.access.availability.message,/Brave|flags|Chrome|Edge/);
 assert.equal((await f.access.choose({mode:'save',name:'notes.txt',format:'text'})).ok,false);
 assert.equal(f.calls.length,1,'configuration does not hit an absent plugin');
 installed=true;must(await f.access.refresh());assert.equal(f.access.supported,true);
});

test('a backend captured during startup uses only the restored server generation',async()=>{
 let release;
 const f=fixture({fetch:url=>url.endsWith('/status')?new Promise(resolve=>{release=()=>resolve(response({ok:true,data:status()}));}):Promise.resolve(response({ok:true,data:{targetId:'notes',format:'text',content:'Before',revision:'sha256:'+'a'.repeat(64),receipts:[]}}))});
 const backend=f.access.backend([definition],{scope,isCurrent:()=>true});
 const pending=backend.load('notes');assert.equal(f.calls.length,1);release();
 assert.equal(must(await pending).content,'Before');assert.equal(f.calls[1].body.generation,'generation-1');
});

test('user changes invalidate saved bindings and forbid every captured backend call',async()=>{
 const f=fixture();must(await f.access.ready);
 const backend=f.access.backend([definition],{scope,isCurrent:()=>true});
 f.user('other');
 assert.equal(f.access.supported,false);assert.deepEqual(f.access.snapshot(),{});assert.equal(f.access.location,null);
 assert.equal(f.access.availability.code,'FILE_SERVICE_USER');
 assert.equal((await backend.load('notes')).error.code,'STALE_FILE_SCOPE');
 assert.equal((await backend.lookupHistory('notes',{})).error.code,'STALE_FILE_SCOPE');
 assert.equal((await backend.adoptLegacy('notes',{})).error.code,'STALE_FILE_SCOPE');
 assert.equal(f.calls.length,1);
});

test('a late configure reply cannot attach another user’s binding or publish a change',async()=>{
 let release;const f=fixture({fetch:url=>url.endsWith('/status')?Promise.resolve(response({ok:true,data:status()})):new Promise(resolve=>{release=()=>resolve(response({ok:true,data:binding}));})});
 must(await f.access.ready);let changes=0;f.access.subscribe(()=>changes++);
 const choosing=f.access.choose({mode:'save',name:'notes.txt',format:'text'});await Promise.resolve();
 f.user('other');release();const result=await choosing;
 assert.equal(result.error.code,'STALE_FILE_SCOPE');assert.equal(changes,0);assert.deepEqual(f.access.snapshot(),{});
});

const update=()=>({targetId:'notes',expectedRevision:'sha256:'+'a'.repeat(64),expectedContent:'Before',projectedDocument:{targetId:'notes',format:'text',content:'After'},intentId:'intent-1',fingerprint:'sha256:'+'c'.repeat(64)});
test('uncertain server saves are held without automatically retrying the write',async()=>{
 for(const failure of [async()=>{throw Error('connection lost');},async()=>response({},503),async()=>response({ok:true,data:{applied:true}}),async()=>({ok:true,status:200,json:async()=>{throw Error('truncated response');}})]){
  const f=fixture({fetch:url=>url.endsWith('/status')?Promise.resolve(response({ok:true,data:status()})):failure()});must(await f.access.ready);
  const result=await f.access.backend([definition],{scope,isCurrent:()=>true}).compareAndSwap(update());
  assert.equal(result.error.code,'PERSISTENCE_UNKNOWN');
  assert.equal(f.calls.filter(call=>call.url.endsWith('/cas')).length,1);
 }
});

test('known server conflicts remain conflicts and cancellation before dispatch never sends a save',async()=>{
 const f=fixture({fetch:url=>Promise.resolve(url.endsWith('/status')?response({ok:true,data:status()}):response({ok:false,error:{code:'FILE_REVISION_CONFLICT',message:'The file changed.'}},409))});must(await f.access.ready);
 const abort=new AbortController(),backend=f.access.backend([definition],{scope,isCurrent:()=>true});
 abort.abort();assert.equal((await backend.compareAndSwap(update(),{signal:abort.signal})).error.code,'CANCELLED');assert.equal(f.calls.length,1);
 assert.equal((await backend.compareAndSwap(update())).error.code,'FILE_REVISION_CONFLICT');
});

test('cancelling an in-flight save preserves uncertainty because the server may have written it',async()=>{
 let release;const f=fixture({fetch:url=>url.endsWith('/status')?Promise.resolve(response({ok:true,data:status()})):new Promise(resolve=>{release=()=>resolve(response({ok:true,data:{applied:true,acknowledged:true,revision:'sha256:'+'b'.repeat(64)}}));})});must(await f.access.ready);
 const abort=new AbortController(),saving=f.access.backend([definition],{scope,isCurrent:()=>true}).compareAndSwap(update(),{signal:abort.signal});
 await Promise.resolve();abort.abort();release();
 assert.equal((await saving).error.code,'PERSISTENCE_UNKNOWN');
});

test('stale graph authority and changed binding generations stop before the HTTP request',async()=>{
 let generation='generation-1';const f=fixture({fetch:async()=>response({ok:true,data:{...status(),bindings:{[binding.bindingId]:{...binding,generation}}}})});must(await f.access.ready);let current=true;
 const backend=f.access.backend([definition],{scope,isCurrent:()=>current});
 current=false;assert.equal((await backend.load('notes')).error.code,'STALE_FILE_SCOPE');assert.equal(f.calls.length,1);current=true;
 const snapshot=f.access.snapshot();snapshot[binding.bindingId].generation='mutated';
 assert.equal(f.access.snapshot()[binding.bindingId].generation,'generation-1','snapshot is detached');
 generation='generation-2';must(await f.access.refresh());
 assert.equal((await backend.load('notes')).error.code,'STALE_FILE_BINDING');
 assert.equal(f.calls.length,2,'only the explicit status refresh was sent');
});

test('malformed server metadata and document responses never grant usable file access',async()=>{
 const invalid=fixture({fetch:async()=>response({ok:true,data:{...status(),bindings:{bad:{...binding,bindingId:'different'}}}})});
 assert.equal((await invalid.access.ready).error.code,'FILE_SERVICE_RESPONSE');assert.equal(invalid.access.supported,false);assert.deepEqual(invalid.access.snapshot(),{});
 const f=fixture({fetch:async url=>response({ok:true,data:url.endsWith('/status')?status():{targetId:'other',format:'text',content:'secret',revision:'hash',receipts:[]}})});must(await f.access.ready);
 assert.equal((await f.access.backend([definition],{scope,isCurrent:()=>true}).load('notes')).error.code,'FILE_SERVICE_RESPONSE');
});

test('an absent trusted user or malformed accessors cannot configure or write a path',async()=>{
 const f=fixture();must(await f.access.ready);f.user(undefined);
 assert.equal((await f.access.choose({mode:'save',name:'notes.txt',format:'text'})).error.code,'FILE_SERVICE_USER');
 let calls=0;const malicious={get mode(){calls++;return 'save';},name:'notes.txt',format:'text'};
 assert.equal((await f.access.choose(malicious)).error.code,'INVALID_FILE_SELECTION');assert.equal(calls,0);assert.equal(f.calls.length,1);
});

test('migrated numeric receipt revisions remain valid during reads and replay acknowledgements',async()=>{
 const receipt={intentId:'intent-1',fingerprint:'sha256:'+'c'.repeat(64),revision:3};
 const f=fixture({fetch:async url=>response({ok:true,data:url.endsWith('/status')?status():url.endsWith('/load')?{targetId:'notes',format:'text',content:'Before',revision:'sha256:'+'a'.repeat(64),receipts:[receipt]}:{applied:true,acknowledged:true,revision:3}})});must(await f.access.ready);
 const backend=f.access.backend([definition],{scope,isCurrent:()=>true});
 assert.deepEqual(must(await backend.load('notes')).receipts,[receipt]);
 assert.equal(must(await backend.compareAndSwap(update())).revision,3);
});

test('transport admits separate 180KB before and after documents while retaining each document limit',async()=>{
 const before='a'.repeat(180000),after='b'.repeat(180000);
 const f=fixture({fetch:async url=>response({ok:true,data:url.endsWith('/status')?status():url.endsWith('/load')?{targetId:'notes',format:'text',content:before,revision:'sha256:'+'a'.repeat(64),receipts:[]}:{applied:true,acknowledged:true,revision:'sha256:'+'b'.repeat(64)}})});must(await f.access.ready);
 const backend=f.access.backend([definition],{scope,isCurrent:()=>true});
 assert.equal(must(await backend.load('notes')).content,before);
 must(await backend.compareAndSwap({...update(),expectedContent:before,projectedDocument:{targetId:'notes',format:'text',content:after}}));
 const oversized=await backend.compareAndSwap({...update(),projectedDocument:{targetId:'notes',format:'text',content:'x'.repeat(262145)}});
 assert.equal(oversized.error.code,'INVALID_FILE_BACKEND_UPDATE');
 assert.equal(f.calls.filter(call=>call.url.endsWith('/cas')).length,1);
});

test('the HTTP adapter uses the actual server component to create, overwrite and reload an empty UTF-8 file',async()=>{
 const {createServerFileService}=await import('../server-plugin/index.mjs');
 const directory=await mkdtemp(join(tmpdir(),'lattice-server-http-'));
 try{
  const user={profile:{handle:'user',admin:true},directories:{root:directory,files:join(directory,'user','files')}},filePath=join(directory,'nested','Scene Context é.txt');
  let service=createServerFileService(),writes=0;
  const make=()=>module.createServerFileAccess({getContext:()=>({getRequestHeaders:()=>({'Content-Type':'application/json'})}),getUserId:()=>user.profile.handle,fetch:async(url,request)=>{
   const action=url.split('/').at(-1);if(action==='cas')writes++;
   const result=await service.dispatch(action,user,request.body?JSON.parse(request.body):{}, {signal:request.signal});
   return response(result);
  }});
  const access=make();must(await access.ready);
  const chosen=must(await access.choose({mode:'save',name:'notes.txt',format:'text',path:filePath}));assert.equal(writes,0);
  const configured={...definition,bindingId:chosen.bindingId,name:chosen.name,path:chosen.path};
  const backend=access.backend([configured],{scope,isCurrent:()=>true});
  const before=must(await backend.load('notes'));assert.equal(before.content,'');
  const change={...update(),expectedRevision:before.revision,expectedContent:'',projectedDocument:{targetId:'notes',format:'text',content:'Hello 🌍'}};
  must(await backend.compareAndSwap(change));assert.equal(await readFile(filePath,'utf8'),'Hello 🌍');
  const loaded=must(await backend.load('notes'));
  must(await backend.compareAndSwap({...change,intentId:'intent-2',fingerprint:'sha256:'+'d'.repeat(64),expectedRevision:loaded.revision,expectedContent:loaded.content,projectedDocument:{targetId:'notes',format:'text',content:''}}));
  assert.equal(await readFile(filePath,'utf8'),'');
  service=createServerFileService();const restarted=make();must(await restarted.ready);
  const restored=must(await restarted.backend([configured],{scope,isCurrent:()=>true}).load('notes'));
  assert.equal(restored.content,'');assert.equal(restored.receipts.length,2);assert.equal(writes,2);
  await writeFile(filePath,'a'.repeat(180000),'utf8');
  const largeBackend=restarted.backend([configured],{scope,isCurrent:()=>true}),large=must(await largeBackend.load('notes'));
  must(await largeBackend.compareAndSwap({...change,intentId:'intent-large',fingerprint:'sha256:'+'e'.repeat(64),expectedRevision:large.revision,expectedContent:large.content,projectedDocument:{targetId:'notes',format:'text',content:'b'.repeat(180000)}}));
  assert.equal(await readFile(filePath,'utf8'),'b'.repeat(180000));assert.equal(writes,3);
 }finally{
  const within=relative(resolve(tmpdir()),resolve(directory));assert.ok(within&&!within.startsWith('..')&&!isAbsolute(within));
  await rm(directory,{recursive:true,force:true});
 }
});
