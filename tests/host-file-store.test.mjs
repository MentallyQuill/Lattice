import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {mkdtempSync,writeFileSync,readFileSync,statSync,rmSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {createHostFileStore} from '../src/ui/host-file-store.js';

// Implements the host endpoint's actual base64 guard/decoding and per-user disk namespace.
export function hostFixture(){
 const files=new Map(),requests=[],directory=mkdtempSync(join(tmpdir(),'lattice-host-file-'));let user='alice',loseMain=false,wrongPath=false;
 const diskPath=key=>join(directory,encodeURIComponent(key));
 files.set=(key,bytes)=>{writeFileSync(diskPath(key),bytes);Map.prototype.set.call(files,key,bytes);return files;};
 files.delete=key=>{if(files.has(key))unlinkSync(diskPath(key));return Map.prototype.delete.call(files,key);};
 after(()=>{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));rmSync(directory,{recursive:true,force:true});});
 const fetch=async(url,options={})=>{
  requests.push({url,...options});
  assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');
  assert.equal(options.headers['X-CSRF'],'checked');
  if(url==='/api/files/upload'){
   const body=JSON.parse(options.body);if(!body.name||!body.data)return new Response('{}',{status:400});
   files.set(user+':'+body.name,Buffer.from(body.data,'base64'));
   if(loseMain&&body.name.endsWith('-scene.txt')){loseMain=false;throw Error('response lost');}
   return Response.json({path:wrongPath?'user/files/unrelated.txt':'user/files/'+body.name});
  }
  const name=url.slice('/user/files/'.length),bytes=files.get(user+':'+name);
  return bytes===undefined?new Response('',{status:404}):new Response(readFileSync(diskPath(user+':'+name)));
 };
 const create=(overrides={})=>createHostFileStore({fetch,getUserId:()=>user,getRequestHeaders:()=>({'X-CSRF':'checked'}),...overrides});
 return {files,requests,diskPath,create,setUser:value=>{user=value;},loseMain:()=>{loseMain=true;},wrongPath:()=>{wrongPath=true;}};
}
test('accepted host writes produce real UTF-8 files and empty replacement is zero bytes',async()=>{
 const f=hostFixture(),store=f.create();
 const first=await store.write({name:'scene.txt',expectedRevision:null,content:'héllo',intentId:'one'});
 assert.equal(first.ok,true,JSON.stringify(first));assert.equal(first.data.acknowledged,true);
 assert.equal((await store.read('scene.txt')).data.content,'héllo');
 const empty=await store.write({name:'scene.txt',expectedRevision:first.data.revision,content:'',intentId:'two'});
 assert.equal(empty.ok,true,JSON.stringify(empty));
 assert.equal(statSync(f.diskPath('alice:'+empty.data.path.split('/').at(-1))).size,0);
 assert.equal((await store.read('scene.txt')).data.content,'');
 assert.equal(f.requests.filter(row=>row.url==='/api/files/upload').some(row=>JSON.parse(row.body).data==='='),true);
});
test('lost responses recover the same intent after reload without replaying an append',async()=>{
 const f=hostFixture(),store=f.create();f.loseMain();
 const request={name:'scene.txt',expectedRevision:null,content:'accepted',intentId:'lost'};
 const first=await store.write(request);assert.equal(first.ok,false);assert.equal(first.error.code,'PERSISTENCE_UNKNOWN');
 const retried=await f.create().write(request);assert.equal(retried.ok,true,JSON.stringify(retried));assert.equal(retried.data.deduplicated,true);
 assert.equal((await store.read('scene.txt')).data.content,'accepted');
 const reused=await store.write({...request,content:'different'});assert.equal(reused.error.code,'FILE_INTENT_CONFLICT');
});
test('stale revisions preserve attempted bytes and previous versions without overwriting live data',async()=>{
 const f=hostFixture(),store=f.create();
 const first=await store.write({name:'scene.txt',expectedRevision:null,content:'original',intentId:'first'});
 await store.write({name:'scene.txt',expectedRevision:first.data.revision,content:'external',intentId:'external'});
 const conflict=await store.write({name:'scene.txt',expectedRevision:first.data.revision,content:'attempt',intentId:'conflict'});
 assert.equal(conflict.error.code,'FILE_REVISION_CONFLICT');assert.equal((await store.read('scene.txt')).data.content,'external');
 assert.equal([...f.files.values()].some(bytes=>bytes.toString()==='attempt'),true);
 assert.equal([...f.files.values()].some(bytes=>bytes.toString()==='original'),true);
 assert.equal(store.capabilities.crossDeviceCAS,false);
});
test('unsafe names and unexpected upload paths never receive an acknowledged save',async()=>{
 const f=hostFixture(),store=f.create();assert.equal((await store.read('../other')).ok,false);
 f.wrongPath();const saved=await store.write({name:'scene.txt',expectedRevision:null,content:'x',intentId:'path'});
 assert.equal(saved.ok,false);assert.equal(saved.error.code,'PERSISTENCE_UNKNOWN');
});
test('raw library storage admits large UTF-8 snapshots while applying an explicit byte bound',async()=>{
 const f=hostFixture(),content='🦉'.repeat(600000);
 const saved=await f.create().write({name:'library.json',expectedRevision:null,content,intentId:'library'});
 assert.equal(saved.ok,true,JSON.stringify(saved));assert.equal((await f.create().read('library.json')).data.content,content);
 const bounded=createHostFileStore({fetch:async()=>{throw Error('must not send');},getUserId:()=> 'alice',maxBytes:4});
 assert.equal((await bounded.write({name:'small.txt',expectedRevision:null,content:'🦉x',intentId:'size'})).error.code,'INVALID_HOST_FILE_WRITE');
});
test('a completed intent never recreates an externally deleted file on retry',async()=>{
 const f=hostFixture(),store=f.create(),request={name:'scene.txt',expectedRevision:null,content:'accepted',intentId:'completed'};
 const saved=await store.write(request);assert.equal(saved.ok,true);
 f.files.delete('alice:'+saved.data.path.split('/').at(-1));
 const retry=await f.create().write(request);assert.equal(retry.ok,false);assert.equal(retry.error.code,'FILE_REVISION_CONFLICT');
 assert.equal((await store.read('scene.txt')).data.exists,false);
});

test('a small configured content limit does not reject internal save receipts',async()=>{
 const f=hostFixture(),store=f.create({maxBytes:4}),saved=await store.write({name:'tiny.txt',expectedRevision:null,content:'four',intentId:'small'});
 assert.equal(saved.ok,true,JSON.stringify(saved));assert.equal((await store.read('tiny.txt')).data.content,'four');
});
