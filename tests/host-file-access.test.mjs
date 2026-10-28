import assert from 'node:assert/strict';
import test from 'node:test';
import {createHostFileStore} from '../src/ui/host-file-store.js';
import {createHostFileAccess} from '../src/ui/host-file-access.js';
import {sha256Text} from '../src/workflow/definition-data.js';

function fixture(maxBytes){
 const files=new Map();let user='alice',failDocument=false,offline=false;
 const fetch=async(url,options)=>{
  if(offline)throw Error('host offline');
  if(url==='/api/files/upload'){
   const body=JSON.parse(options.body);files.set(user+':'+body.name,Buffer.from(body.data,'base64'));
   if(failDocument&&body.name.includes('-output-')){failDocument=false;throw Error('lost response');}
   return Response.json({path:'user/files/'+body.name});
  }
  const bytes=files.get(user+':'+url.split('/').at(-1));return bytes===undefined?new Response('',{status:404}):new Response(bytes);
 };
 const store=createHostFileStore({fetch,getUserId:()=>user,maxBytes});
 return {files,store,setOffline:value=>{offline=value;},create:()=>createHostFileAccess({store,getUserId:()=>user}),setUser:value=>{user=value;},loseDocumentResponse:()=>{failDocument=true;}};
}
const definition={targetId:'scene',bindingId:'untrusted-import',name:'Scene.txt',format:'text',content:'initial',missing:'create',visibility:{kind:'public'}};
const controls={scope:{userId:'alice',chatId:'chat'},isCurrent:()=>true};
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
