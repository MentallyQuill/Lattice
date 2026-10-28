import assert from 'node:assert/strict';
import test from 'node:test';
import {createHostFileStore} from '../src/ui/host-file-store.js';
import {createHostFileAccess} from '../src/ui/host-file-access.js';
import {sha256Text} from '../src/workflow/definition-data.js';

function fixture(maxBytes){
 const files=new Map();let user='alice',failDocument=false,offline=false;
 const fetch=async(url,options)=>{
  if(offline)throw Error('host offline');
  if(url==='/api/files/delete'){const body=JSON.parse(options.body);assert.match(body.path,/^files\/lattice-/);files.delete(user+':'+body.path.slice(6));return new Response('{}');}
  if(url==='/api/files/upload'){
   const body=JSON.parse(options.body);files.set(user+':'+body.name,Buffer.from(body.data,'base64'));
   if(failDocument&&body.name.includes('-output-')){failDocument=false;throw Error('lost response');}
   return Response.json({path:'user/files/'+body.name});
  }
  const bytes=files.get(user+':'+url.split('/').at(-1));return bytes===undefined?new Response('',{status:404}):new Response(bytes);
 };
 const store=createHostFileStore({fetch,getUserId:()=>user,maxBytes});
 return {files,store,setOffline:value=>{offline=value;},create:(override=store)=>createHostFileAccess({store:override,getUserId:()=>user}),setUser:value=>{user=value;},loseDocumentResponse:()=>{failDocument=true;}};
}
const definition={targetId:'scene',bindingId:'untrusted-import',name:'Scene.txt',format:'text',content:'initial',missing:'create',visibility:{kind:'public'}};
const controls={scope:{userId:'alice',chatId:'chat'},isCurrent:()=>true};
test('twenty large recovery versions and replay archives reload outside bounded journal envelopes',async()=>{
 const f=fixture(),access=f.create();must(await access.ready);
 const definitionData=must(await access.ensureManaged(definition,controls));let backend=access.backend([definitionData],controls);
 for(let index=0;index<25;index++){
  const snapshot=must(await backend.load('scene')),content=String(index).padEnd(130000,'x');
  must(await backend.compareAndSwap({targetId:'scene',expectedRevision:snapshot.revision,expectedContent:snapshot.content,projectedDocument:{format:'text',content},intentId:'large-'+index,fingerprint:sha256Text('large-'+index)}));
 }
 const reloaded=f.create();must(await reloaded.ready);backend=reloaded.backend([definitionData],controls);
 const versions=must(await backend.listVersions('scene'));assert.equal(versions.versions.length,20);
 const snapshot=must(await backend.load('scene'));must(await backend.restoreVersion('scene',{versionId:versions.versions.at(-1).versionId,expectedRevision:snapshot.revision,intentId:'restore-large'}));
 assert.equal(must(await backend.load('scene')).content,String(4).padEnd(130000,'x'));
});
function must(result){assert.equal(result.ok,true,JSON.stringify(result));return result.data;}

test('switching users during cleanup cannot delete the next user generated metadata',async()=>{
 const f=fixture();let armed=false,switched=false;
 const store={...f.store,async removeGenerated(name){
  if(armed&&!switched){switched=true;f.setUser('bob');return {ok:true,data:{removed:false}};}
  return f.store.removeGenerated(name);
 }};
 const access=f.create(store);must(await access.ready);const prepared=must(await access.ensureManaged(definition,controls)),backend=access.backend([prepared],controls);
 const before=must(await backend.load('scene'));must(await backend.compareAndSwap({targetId:'scene',expectedRevision:before.revision,expectedContent:before.content,projectedDocument:{format:'text',content:'first'},intentId:'first-cleanup',fingerprint:sha256Text('first-cleanup')}));
 const bobPrefix='bob:lattice-'+sha256Text('bob').slice(7,31)+'-';
 for(const [key,bytes]of [...f.files])if(/-(journal|content|metadata)-[a-f0-9]{64}\.json$/.test(key))f.files.set(bobPrefix+key.slice(key.indexOf('-',key.indexOf('lattice-')+8)+1),bytes);
 const bobBefore=[...f.files].filter(([key])=>key.startsWith('bob:')).map(([key,bytes])=>[key,Buffer.from(bytes)]);
 const loaded=must(await backend.load('scene'));armed=true;
 await backend.compareAndSwap({targetId:'scene',expectedRevision:loaded.revision,expectedContent:loaded.content,projectedDocument:{format:'text',content:'second'},intentId:'second-cleanup',fingerprint:sha256Text('second-cleanup')});
 assert.equal(switched,true);assert.ok(bobBefore.length>1);
 for(const [key,bytes]of bobBefore)assert.deepEqual(f.files.get(key),bytes,'The switched-to user retains '+key);
});
test('branch source lookup never allocates absent resources and exposes exact recorded prefix versions',async()=>{
 const f=fixture(),access=f.create();must(await access.ready);
 const absent=await access.ensureManaged(definition,{...controls,create:false});assert.equal(absent.error.code,'MANAGED_FILE_NOT_FOUND');assert.equal(f.files.size,0);
 const prepared=must(await access.ensureManaged(definition,controls)),stamp=count=>({schemaVersion:1,messageCount:count,prefixHash:sha256Text('prefix '+count)});
 for(let count=1;count<=2;count++){const backend=access.backend([prepared],{...controls,branchBinding:stamp(count)}),snapshot=must(await backend.load('scene'));must(await backend.compareAndSwap({targetId:'scene',expectedRevision:snapshot.revision,expectedContent:snapshot.content,projectedDocument:{format:'text',content:'point '+count},intentId:'point-'+count,fingerprint:sha256Text('point '+count)}));}
 const backend=access.backend([must(await access.ensureManaged(definition,{...controls,create:false}))],controls),versions=must(await backend.listVersions('scene'));
 assert.deepEqual(versions.branchBinding,stamp(2));assert.deepEqual(versions.versions[0].branchBinding,stamp(1));
 const old=must(await backend.readVersion('scene',{versionId:versions.versions[0].versionId}));assert.equal(old.snapshot.content,'point 1');assert.deepEqual(old.snapshot.branchBinding,stamp(1));
});
test('accepted branch stamps are captured after publication and never inherited by an unstamped later revision',async()=>{
 const f=fixture(),access=f.create();must(await access.ready);const prepared=must(await access.ensureManaged(definition,controls));
 let published;
 const backend=access.backend([prepared],{...controls,getBranchBinding:()=>published});
 const first=must(await backend.load('scene'));assert.equal(first.branchBinding,undefined);
 published={schemaVersion:1,messageCount:3,prefixHash:sha256Text('accepted assistant prefix')};
 must(await backend.compareAndSwap({targetId:'scene',expectedRevision:first.revision,expectedContent:first.content,projectedDocument:{format:'text',content:'accepted branch point'},intentId:'published-branch',fingerprint:sha256Text('published-branch')}));
 assert.deepEqual(must(await backend.listVersions('scene')).branchBinding,published);
 const stamp=published;published=undefined;
 const second=must(await backend.load('scene'));
 must(await backend.compareAndSwap({targetId:'scene',expectedRevision:second.revision,expectedContent:second.content,projectedDocument:{format:'text',content:'unverified later publication'},intentId:'unverified-branch',fingerprint:sha256Text('unverified-branch')}));
 const versions=must(await backend.listVersions('scene'));assert.equal(versions.branchBinding,undefined);assert.deepEqual(versions.versions[0].branchBinding,stamp);
});
test('trusted managed preparation creates metadata only and reload restores accepted files and receipts',async()=>{
 const f=fixture(),access=f.create();assert.equal((await access.ready).ok,true);
 const ensured=await access.ensureManaged(definition,controls);assert.equal(ensured.ok,true,JSON.stringify(ensured));
 assert.notEqual(ensured.data.bindingId,'untrusted-import');
 assert.equal([...f.files.keys()].some(key=>key.includes('-output-')),false);
 const backend=access.backend([ensured.data],controls),loaded=await backend.load('scene');
 assert.equal(loaded.ok,true,JSON.stringify(loaded));assert.equal(loaded.data.content,'initial');
 const update={targetId:'scene',expectedRevision:loaded.data.revision,expectedContent:'initial',projectedDocument:{format:'text',content:'accepted'},intentId:'accepted-1',fingerprint:sha256Text('accepted-1')};
 assert.equal((await backend.compareAndSwap(update)).data.acknowledged,true);
 const reloaded=f.create();await reloaded.ready;
 const again=await reloaded.ensureManaged({...definition,name:'Renamed.txt'},controls);
 assert.equal(again.data.bindingId,ensured.data.bindingId);assert.equal(again.data.name,'Scene.txt');
 const restored=await reloaded.backend([again.data],controls).load('scene');
 assert.equal(restored.data.content,'accepted');assert.equal(restored.data.receipts[0].intentId,'accepted-1');
});
test('managed files are isolated by chat and current authenticated user',async()=>{
 const f=fixture(),access=f.create();await access.ready;
 const one=await access.ensureManaged(definition,controls),two=await access.ensureManaged(definition,{...controls,scope:{userId:'alice',chatId:'other'}});
 assert.notEqual(one.data.bindingId,two.data.bindingId);
 const imported=await access.backend([one.data],{...controls,scope:{userId:'alice',chatId:'other'}}).load('scene');assert.equal(imported.ok,false);
 f.setUser('bob');assert.deepEqual(access.snapshot(),{});
 assert.equal((await access.ensureManaged(definition,controls)).ok,false);
 const bob=f.create();await bob.ready;assert.deepEqual(bob.snapshot(),{});
});
test('lost output acknowledgement reloads the pending receipt without writing the accepted data twice',async()=>{
 const f=fixture(),access=f.create();await access.ready;
 const ensured=await access.ensureManaged(definition,controls),backend=access.backend([ensured.data],controls),loaded=await backend.load('scene');
 const update={targetId:'scene',expectedRevision:loaded.data.revision,expectedContent:'initial',projectedDocument:{format:'text',content:'once'},intentId:'lost-output',fingerprint:sha256Text('lost-output')};
 f.loseDocumentResponse();const uncertain=await backend.compareAndSwap(update);assert.equal(uncertain.ok,false);assert.equal(uncertain.error.code,'PERSISTENCE_UNKNOWN');
 const reloaded=f.create();await reloaded.ready;const prepared=await reloaded.ensureManaged(definition,controls),restored=reloaded.backend([prepared.data],controls);
 const read=await restored.load('scene');assert.equal(read.ok,true,JSON.stringify(read));assert.equal(read.data.content,'once');assert.equal(read.data.receipts[0].intentId,'lost-output');
 const retry=await restored.compareAndSwap(update);assert.equal(retry.ok,true,JSON.stringify(retry));assert.equal(retry.data.acknowledged,true);
});

test('independent resource journals stay usable when their combined metadata exceeds one file bound',async()=>{
 const f=fixture(10000),access=f.create();await access.ready;
 for(let resource=0;resource<4;resource++){
  const prepared=await access.ensureManaged({...definition,targetId:'target-'+resource},controls);assert.equal(prepared.ok,true,JSON.stringify(prepared));
  const backend=access.backend([prepared.data],controls);
  for(let turn=0;turn<20;turn++){
   const loaded=await backend.load('target-'+resource);assert.equal(loaded.ok,true,JSON.stringify(loaded));
   const saved=await backend.compareAndSwap({targetId:'target-'+resource,expectedRevision:loaded.data.revision,expectedContent:loaded.data.content,projectedDocument:{format:'text',content:'turn '+turn},intentId:'resource-'+resource+'-turn-'+turn,fingerprint:sha256Text(resource+':'+turn)});
   assert.equal(saved.ok,true,JSON.stringify(saved));assert.equal(saved.data.acknowledged,true);
  }
 }
 const reloaded=f.create();assert.equal((await reloaded.ready).ok,true);
 const prepared=await reloaded.ensureManaged({...definition,targetId:'target-3'},controls),read=await reloaded.backend([prepared.data],controls).load('target-3');
 assert.equal(read.data.receipts.length,20);assert.equal(read.data.content,'turn 19');
});
test('two adapters serialize complete settlement without Web Locks and preserve the winning receipt',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
 try{
 const f=fixture(),one=f.create();await one.ready;const selected=await one.ensureManaged(definition,controls);
 const two=f.create();await two.ready;
 const first=one.backend([selected.data],controls),second=two.backend([selected.data],controls),loaded=await first.load('scene');
 const request={targetId:'scene',expectedRevision:loaded.data.revision,expectedContent:loaded.data.content,projectedDocument:{format:'text',content:'one'},intentId:'one',fingerprint:sha256Text('one')};
 const results=await Promise.all([first.compareAndSwap(request),second.compareAndSwap({...request,projectedDocument:{format:'text',content:'two'},intentId:'two',fingerprint:sha256Text('two')})]);
 assert.equal(results.filter(result=>result.ok&&result.data.acknowledged).length,1,JSON.stringify(results));
 assert.equal(results.find(result=>!result.ok).error.code,'FILE_REVISION_CONFLICT');
 const final=await first.load('scene');assert.equal(final.data.receipts.length,1);assert.equal(final.data.receipts[0].intentId,final.data.content);
 }finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
test('refresh after switching authenticated users exposes only that user and can prepare new files',async()=>{
 const f=fixture(),access=f.create();await access.ready;const first=await access.ensureManaged(definition,controls);assert.equal(first.ok,true);
 f.setUser('bob');assert.deepEqual(access.snapshot(),{});assert.equal((await access.refresh()).ok,true);
 const second=await access.ensureManaged(definition,{...controls,scope:{userId:'bob',chatId:'chat'}});assert.equal(second.ok,true,JSON.stringify(second));
 assert.notEqual(first.data.bindingId,second.data.bindingId);assert.equal(Object.hasOwn(access.snapshot(),first.data.bindingId),false);
 assert.equal((await access.backend([first.data],controls).load('scene')).ok,false);
});

test('an initially offline host can recover on refresh without losing its provider',async()=>{
 const f=fixture();f.setOffline(true);const access=f.create();assert.equal((await access.ready).ok,false);assert.equal(access.availability.code,'HOST_FILE_UNAVAILABLE');
 f.setOffline(false);assert.equal((await access.refresh()).ok,true);
 const selected=await access.ensureManaged(definition,controls);assert.equal(selected.ok,true,JSON.stringify(selected));
 assert.equal((await access.backend([selected.data],controls).load('scene')).ok,true);
});
test('reload rejects malformed receipts even when the journal bytes match their manifest hash',async()=>{
 const f=fixture(),access=f.create();await access.ready;const prepared=await access.ensureManaged(definition,controls),backend=access.backend([prepared.data],controls),loaded=await backend.load('scene');
 await backend.compareAndSwap({targetId:'scene',expectedRevision:loaded.data.revision,expectedContent:loaded.data.content,projectedDocument:{format:'text',content:'checked'},intentId:'checked',fingerprint:sha256Text('checked')});
 const manifest=await f.store.read('node-bindings.json'),data=JSON.parse(manifest.data.content),binding=data.bindings[0],shard=await f.store.read(binding.journalName),records=JSON.parse(shard.data.content);
 Object.values(records)[0].receipts[0].fingerprint='unverified';const content=JSON.stringify(records),digest=sha256Text(content);binding.journalName='journal-'+digest.slice(7)+'.json';binding.journalRevision=digest;
 assert.equal((await f.store.write({name:binding.journalName,expectedRevision:null,content,intentId:'tampered-shard'})).ok,true);
 assert.equal((await f.store.write({name:'node-bindings.json',expectedRevision:manifest.data.revision,content:JSON.stringify(data),intentId:'tampered-manifest'})).ok,true);
 assert.equal((await f.create().ready).ok,false);
});
