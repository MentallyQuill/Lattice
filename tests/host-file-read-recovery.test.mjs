import assert from 'node:assert/strict';
import test from 'node:test';
import {createHostFileStore} from '../src/ui/host-file-store.js';
import {createHostFileAccess} from '../src/ui/host-file-access.js';
import {createHostFileFixture} from './helpers/host-file-fixture.mjs';
import {sha256Text} from '../src/workflow/definition-data.js';

const definition={targetId:'scene',name:'Scene.txt',format:'text',content:'',missing:'create',visibility:{kind:'public'}},controls={scope:{userId:'alice',chatId:'chat'},isCurrent:()=>true};
async function savedFixture(){
 const disk=createHostFileFixture();let fault,failedReads=0;
 const fetch=async(url,options)=>{
  if(fault&&options.method==='GET'&&url.endsWith('-node-bindings.json')){failedReads++;const action=fault;fault=null;return action();}
  return disk.fetch(url,options);
 };
 const store=createHostFileStore({fetch,getUserId:()=> 'alice'}),access=createHostFileAccess({store,getUserId:()=> 'alice'});
 assert.equal((await access.ready).ok,true);
 const selected=await access.ensureManaged(definition,{...controls,managed:true});assert.equal(selected.ok,true);
 const backend=access.backend([selected.data],controls),before=await backend.load('scene');assert.equal(before.ok,true);
 assert.equal((await backend.compareAndSwap({targetId:'scene',expectedRevision:before.data.revision,expectedContent:before.data.content,projectedDocument:{format:'text',content:'Accepted story'},intentId:'accepted',fingerprint:sha256Text('accepted')})).ok,true);
 return {disk,store,access,backend,arm:action=>{fault=action;},failedReads:()=>failedReads};
}

for(const kind of ['network','body','temporary-status'])test(`an accepted host file survives one ${kind} metadata read failure without writes`,async()=>{
 const f=await savedFixture(),before=[...f.disk.files].map(([name,bytes])=>[name,bytes.toString()]);
 f.arm(()=>{if(kind==='network')throw new TypeError('Failed to fetch');if(kind==='body')return {ok:true,status:200,text:async()=>{throw new TypeError('Connection reset while reading');}};return new Response('',{status:503});});
 const loaded=await f.backend.load('scene');
 assert.equal(loaded.ok,true,JSON.stringify(loaded.error));assert.equal(loaded.data.content,'Accepted story');assert.equal(f.failedReads(),1);
 assert.deepEqual([...f.disk.files].map(([name,bytes])=>[name,bytes.toString()]),before);
});

test('an exhausted host connection read retains its cause instead of a local storage error',async()=>{
 const f=await savedFixture();let attempts=0;
 f.arm(function failAgain(){attempts++;f.arm(failAgain);throw new TypeError('Network unavailable');});
 const loaded=await f.backend.load('scene');assert.equal(loaded.ok,false);assert.equal(loaded.error.code,'HOST_FILE_UNAVAILABLE');assert.equal(attempts,3);
});

test('host permission denial is reported directly without read retries',async()=>{
 const f=await savedFixture();f.arm(()=>new Response('',{status:403}));
 const loaded=await f.backend.load('scene');assert.equal(loaded.ok,false);assert.equal(loaded.error.code,'HOST_FILE_DENIED');assert.equal(f.failedReads(),1);
});

test('a user switch during a failed read stops before any retry for another user',async()=>{
 let user='alice',calls=0;
 const store=createHostFileStore({getUserId:()=>user,fetch:async()=>{calls++;user='bob';throw new TypeError('Connection interrupted');}});
 const result=await store.read('scene.txt');assert.equal(result.ok,false);assert.equal(result.error.code,'STALE_FILE_SCOPE');assert.equal(calls,1);
});

test('invalid metadata is held distinctly from a connection failure without rewriting files',async()=>{
 const f=await savedFixture(),manifest=[...f.disk.files.keys()].find(name=>name.endsWith('-node-bindings.json'));
 f.disk.files.set(manifest,Buffer.from('{"schemaVersion":2,"userId":"another-user","bindings":[]}'));
 const before=[...f.disk.files].map(([name,bytes])=>[name,bytes.toString()]);
 const loaded=await f.backend.load('scene');assert.equal(loaded.ok,false);assert.equal(loaded.error.code,'HOST_FILE_METADATA_INVALID');
 assert.deepEqual([...f.disk.files].map(([name,bytes])=>[name,bytes.toString()]),before);
});

test('unavailable journal reads retain the host connection error',async()=>{
 const disk=createHostFileFixture();let offline=false,attempts=0;
 const fetch=async(url,options)=>{if(offline&&options.method==='GET'&&/-journal-[a-f0-9]{64}\.json$/.test(url)){attempts++;throw new TypeError('Disconnected');}return disk.fetch(url,options);};
 const store=createHostFileStore({fetch,getUserId:()=> 'alice'}),access=createHostFileAccess({store,getUserId:()=> 'alice'});assert.equal((await access.ready).ok,true);
 const selected=await access.ensureManaged(definition,{...controls,managed:true});assert.equal(selected.ok,true);offline=true;
 const loaded=await access.backend([selected.data],controls).load('scene');assert.equal(loaded.ok,false);assert.equal(loaded.error.code,'HOST_FILE_UNAVAILABLE');assert.equal(attempts,3);
});
