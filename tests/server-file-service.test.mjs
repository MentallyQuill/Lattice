import assert from 'node:assert/strict';
import test from 'node:test';
import filesystem from 'node:fs/promises';
import {mkdtemp,readFile,rm,writeFile,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {sha256Text} from '../src/workflow/definition-data.js';
const module=await import('../server-plugin/index.mjs').catch(()=>({}));
const {serverHandle,serverPersistence}=await import('../server-plugin/filesystem.mjs');
const must=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.data;};
async function fixture(admin=true){
 const root=await mkdtemp(path.join(tmpdir(),'lattice-server-files-'));
 const user={profile:{handle:'alice',admin},directories:{root,files:path.join(root,'user','files')}};
 const service=()=>module.createServerFileService();
 return {root,user,service,close:()=>rm(root,{recursive:true,force:true})};
}
const definition=binding=>({targetId:'notes',bindingId:binding.bindingId,name:binding.name,format:'text',missing:'create',content:'Initial',visibility:{kind:'public'}});
const request=binding=>({userId:'alice',scope:{userId:'alice',chatId:'story'},definition:definition(binding),generation:binding.generation});
const change=(loaded,content)=>({targetId:'notes',expectedRevision:loaded.revision,expectedContent:loaded.content,projectedDocument:{format:'text',content},intentId:'intent-1',fingerprint:sha256Text('intent-1:'+content)});

test('server cleanup retries a failed generated-content deletion without pruning replay archives',async context=>{
 const f=await fixture();try{
  const metadata=path.join(f.root,'lattice-file-service');await mkdir(metadata);
  const persistence=serverPersistence({root:f.root,metadata,admin:false});
  const state=content=>({bindings:[],records:{owned:{receipts:[],versions:[{versionId:'version:'+content,revision:sha256Text(content),content,format:'text',createdAt:1,visibility:{kind:'public'}}]}}});
  await persistence.save(state('one'));
  const abandoned=path.join(metadata,'content-'+sha256Text(JSON.stringify('one')).slice(7)+'.json');
  const archive=path.join(metadata,'archive-'+('a'.repeat(64))+'.json');await writeFile(archive,'preserved replay');
  const original=filesystem.unlink;let denied=true;
  context.mock.method(filesystem,'unlink',async value=>{if(value===abandoned&&denied)throw Object.assign(Error('denied'),{code:'EPERM'});return original(value);});
  await persistence.save(state('two'));assert.equal(await readFile(abandoned,'utf8'),'"one"');
  denied=false;await persistence.save(state('three'));
  await assert.rejects(readFile(abandoned),{code:'ENOENT'});assert.equal(await readFile(archive,'utf8'),'preserved replay');
 }finally{context.mock.restoreAll();await f.close();}
});
test('a raced metadata-folder substitution cannot read recovery bytes through an outside opened file',async context=>{
 const f=await fixture(false),outside=await fixture();let reads=0;
 try{
  const metadata=path.join(f.root,'lattice-file-service'),backup=metadata+'-backup';await mkdir(metadata);
  const persistence=serverPersistence({root:f.root,metadata,admin:false}),content='saved recovery';
  await persistence.save({bindings:[],records:{owned:{receipts:[],versions:[{versionId:'old',revision:sha256Text(content),content,format:'text',createdAt:1,visibility:{kind:'public'}}]}}});
  const target=path.join(metadata,'content-'+sha256Text(JSON.stringify(content)).slice(7)+'.json');await writeFile(path.join(outside.root,path.basename(target)),'outside secret');
  const original=filesystem.open;let swapped=false;
  context.mock.method(filesystem,'open',async(...args)=>{
   if(args[0]===target&&!swapped){swapped=true;await filesystem.rename(metadata,backup);await symlink(outside.root,metadata,process.platform==='win32'?'junction':'dir');}
   const opened=await original(...args);if(args[0]===target){const read=opened.read.bind(opened);opened.read=async(...params)=>{reads++;return read(...params);};}return opened;
  });
  await assert.rejects(persistence.load());assert.equal(reads,0,'outside recovery bytes are never read');
 }finally{context.mock.restoreAll();await f.close();await outside.close();}
});
test('server recovery partitions large versions and collects only unreachable generated content',async()=>{
 const f=await fixture();try{
  const service=f.service(),binding=must(await service.dispatch('configure',f.user,{userId:'alice',path:'',name:'large.txt',format:'text',mode:'save'})),captured=request(binding);
  for(let index=0;index<25;index++){
   const loaded=must(await service.dispatch('load',f.user,captured));must(await service.dispatch('cas',f.user,{...captured,update:{...change(loaded,String(index).padEnd(130000,'x')),intentId:'large-'+index}}));
  }
  const entries=await filesystem.readdir(path.join(f.root,'lattice-file-service'));
  assert.ok(entries.some(name=>name.startsWith('content-')),'recovery bytes need separate immutable files');
  const restarted=f.service(),versions=must(await restarted.dispatch('versions',f.user,captured));assert.equal(versions.versions.length,20);
  const loaded=must(await restarted.dispatch('load',f.user,captured));
  must(await restarted.dispatch('restore',f.user,{...captured,request:{versionId:versions.versions.at(-1).versionId,expectedRevision:loaded.revision,intentId:'restored'}}));
  assert.equal(await readFile(binding.path,'utf8'),String(4).padEnd(130000,'x'));
  assert.ok(entries.filter(name=>name.startsWith('content-')).length<=20);
 }finally{await f.close();}
});

test('server configuration owns a real path without creating document bytes',async()=>{
 assert.equal(typeof module.createServerFileService,'function');
 const f=await fixture();try{
  const service=f.service(),status=must(await service.dispatch('status',f.user));
  assert.equal(status.apiVersion,1);assert.equal(status.userId,'alice');assert.equal(status.canUseAbsolutePaths,true);
  const binding=must(await service.dispatch('configure',f.user,{userId:'alice',path:'',name:'SceneContext.txt',format:'text',mode:'save'}));
  assert.equal(binding.path,path.join(f.user.directories.files,'lattice','SceneContext.txt'));
  assert.equal(binding.storage,'server');assert.equal(binding.status,'ready');assert.ok(binding.generation);
  await assert.rejects(readFile(binding.path),{code:'ENOENT'});
  const loaded=must(await service.dispatch('load',f.user,request(binding)));
  assert.equal(loaded.content,'Initial');assert.match(loaded.revision,/^missing:/);
 }finally{await f.close();}
});

test('a configured Unicode path overwrites only after CAS and retains receipts across restart',async()=>{
 const f=await fixture();try{
  const file=path.join(f.root,'scene notes – 雨.txt');await writeFile(file,'Before');
  const service=f.service(),binding=must(await service.dispatch('configure',f.user,{userId:'alice',path:file,name:'ignored.txt',format:'text',mode:'open'}));
  assert.equal(binding.name,path.basename(file));assert.equal(await readFile(file,'utf8'),'Before');
  const captured=request(binding),loaded=must(await service.dispatch('load',f.user,captured));
  const update=change(loaded,'After 雨');must(await service.dispatch('cas',f.user,{...captured,update}));
  assert.equal(await readFile(file,'utf8'),'After 雨');
  const restarted=f.service(),status=must(await restarted.dispatch('status',f.user));
  assert.equal(status.bindings[binding.bindingId].status,'ready');
  const refreshed=must(await restarted.dispatch('load',f.user,captured));assert.equal(refreshed.receipts.length,1);
  must(await restarted.dispatch('cas',f.user,{...captured,update}));assert.equal(await readFile(file,'utf8'),'After 雨');
 }finally{await f.close();}
});

test('empty text files stay empty and missing files use initial contents only before the first write',async()=>{
 const f=await fixture();try{
  const empty=path.join(f.root,'empty.txt');await writeFile(empty,'');const service=f.service();
  const binding=must(await service.dispatch('configure',f.user,{userId:'alice',path:empty,name:'empty.txt',format:'text',mode:'save'}));
  const loaded=must(await service.dispatch('load',f.user,request(binding)));assert.equal(loaded.content,'');
  must(await service.dispatch('cas',f.user,{...request(binding),update:change(loaded,'')}));assert.equal(await readFile(empty,'utf8'),'');
  const missing=must(await service.dispatch('configure',f.user,{userId:'alice',path:'new/folder/notes.txt',name:'notes.txt',format:'text',mode:'save'}));
  const before=must(await service.dispatch('load',f.user,request(missing)));assert.equal(before.content,'Initial');
  must(await service.dispatch('cas',f.user,{...request(missing),update:change(before,'Created')}));assert.equal(await readFile(missing.path,'utf8'),'Created');
 }finally{await f.close();}
});

test('the backend refuses a path that differs from the server-issued binding',async()=>{
 const f=await fixture();try{
  const service=f.service(),binding=must(await service.dispatch('configure',f.user,{userId:'alice',path:'',name:'bound.txt',format:'text',mode:'save'}));
  const captured=request(binding);captured.definition.path=path.join(f.root,'other.txt');
  const rejected=await service.dispatch('load',f.user,captured);assert.equal(rejected.ok,false);assert.equal(rejected.error.code,'FILE_PATH_CONFLICT');
 }finally{await f.close();}
});

test('an external edit and a stale binding generation prevent a prepared overwrite',async()=>{
 const f=await fixture();try{
  const file=path.join(f.root,'versioned.txt');await writeFile(file,'Before');const service=f.service();
  const binding=must(await service.dispatch('configure',f.user,{userId:'alice',path:file,name:'versioned.txt',format:'text',mode:'open'}));
  const captured=request(binding),loaded=must(await service.dispatch('load',f.user,captured));await writeFile(file,'External');
  const conflict=await service.dispatch('cas',f.user,{...captured,update:change(loaded,'Overwrite')});assert.equal(conflict.ok,false);assert.equal(conflict.error.code,'FILE_REVISION_CONFLICT');assert.equal(await readFile(file,'utf8'),'External');
  const next=must(await service.dispatch('configure',f.user,{userId:'alice',path:file,name:'versioned.txt',format:'markdown',mode:'open',bindingId:binding.bindingId}));assert.notEqual(next.generation,binding.generation);
  const stale=await service.dispatch('load',f.user,captured);assert.equal(stale.error.code,'STALE_FILE_BINDING');
 }finally{await f.close();}
});

test('file capabilities belong to the authenticated user and require a matching chat scope',async()=>{
 const f=await fixture(),other=await fixture(false);try{
  const service=f.service(),binding=must(await service.dispatch('configure',f.user,{userId:'alice',path:'',name:'private.txt',format:'text',mode:'save'}));
  const bob={...other.user,profile:{handle:'bob',admin:false}};
  const wrongUser=await service.dispatch('load',bob,request(binding));assert.equal(wrongUser.error.code,'FILE_USER_CHANGED');
  const requestAsBob={...request(binding),userId:'bob',scope:{userId:'bob',chatId:'story'}};
  const unknown=await service.dispatch('load',bob,requestAsBob);assert.equal(unknown.error.code,'FILE_BINDING_MISSING');
  const noScope=await service.dispatch('load',f.user,{...request(binding),scope:{userId:'other',chatId:'story'}});assert.equal(noScope.error.code,'INVALID_FILE_REQUEST');
  const anon=await service.dispatch('status',{});assert.equal(anon.error.code,'FILE_USER_REQUIRED');
 }finally{await f.close();await other.close();}
});

test('nonadministrators are confined to their data directory including symbolic links',async()=>{
 const f=await fixture(false),outside=await fixture();try{
  const service=f.service(),external=path.join(outside.root,'outside.txt');await writeFile(external,'Secret');
  const denied=await service.dispatch('configure',f.user,{userId:'alice',path:external,name:'outside.txt',format:'text',mode:'open'});assert.equal(denied.error.code,'FILE_PATH_DENIED');
  const linked=path.join(f.root,'escape');await symlink(outside.root,linked,process.platform==='win32'?'junction':'dir');
  const escaped=await service.dispatch('configure',f.user,{userId:'alice',path:path.join(linked,'outside.txt'),name:'outside.txt',format:'text',mode:'open'});assert.equal(escaped.error.code,'FILE_PATH_DENIED');
  const missing=await service.dispatch('configure',f.user,{userId:'alice',path:path.join(linked,'new','file.txt'),name:'file.txt',format:'text',mode:'save'});assert.equal(missing.error.code,'FILE_PATH_DENIED');
  const dangling=path.join(f.root,'dangling');await symlink(path.join(outside.root,'future'),dangling,process.platform==='win32'?'junction':'dir');
  const danglingEscape=await service.dispatch('configure',f.user,{userId:'alice',path:path.join(dangling,'file.txt'),name:'file.txt',format:'text',mode:'save'});assert.equal(danglingEscape.ok,false);assert.equal(danglingEscape.error.code,'FILE_PATH_DENIED');
  const allowed=must(await service.dispatch('configure',f.user,{userId:'alice',path:path.join(f.root,'own.txt'),name:'own.txt',format:'text',mode:'save'}));assert.equal(allowed.status,'ready');
 }finally{await f.close();await outside.close();}
});

test('even administrators cannot overwrite the journal, and invalid text never becomes a binding',async()=>{
 const f=await fixture();try{
  const service=f.service();
  const journal=await service.dispatch('configure',f.user,{userId:'alice',path:path.join(f.root,'lattice-file-service','state.json'),name:'state.json',format:'json',mode:'save'});assert.equal(journal.error.code,'FILE_PATH_DENIED');
  const invalid=path.join(f.root,'invalid.txt');await writeFile(invalid,Buffer.from([0xc3,0x28]));
  const encoding=await service.dispatch('configure',f.user,{userId:'alice',path:invalid,name:'invalid.txt',format:'text',mode:'open'});assert.equal(encoding.error.code,'FILE_ENCODING_INVALID');
  const large=path.join(f.root,'large.txt');await writeFile(large,Buffer.alloc(262145));
  const size=await service.dispatch('configure',f.user,{userId:'alice',path:large,name:'large.txt',format:'text',mode:'open'});assert.equal(size.error.code,'FILE_DOCUMENT_LIMIT');
  const status=must(await service.dispatch('status',f.user));assert.deepEqual(status.bindings,{});
 }finally{await f.close();}
});

test('a restarted server reconciles an interrupted receipt without rewriting document bytes',async()=>{
 const f=await fixture();try{
  const file=path.join(f.root,'recover.txt');await writeFile(file,'Before');const service=f.service();
  const binding=must(await service.dispatch('configure',f.user,{userId:'alice',path:file,name:'recover.txt',format:'text',mode:'open'}));
  const captured=request(binding),loaded=must(await service.dispatch('load',f.user,captured)),update=change(loaded,'After');
  must(await service.dispatch('cas',f.user,{...captured,update}));
  const journalPath=path.join(f.root,'lattice-file-service','state.json'),journal=JSON.parse(await readFile(journalPath,'utf8'));
  const key=Object.keys(journal.records)[0];journal.records[key]={receipts:[],pending:{intentId:update.intentId,fingerprint:update.fingerprint,beforeHash:loaded.revision,afterHash:sha256Text('After'),revision:sha256Text('After')}};await writeFile(journalPath,JSON.stringify(journal));
  const restored=must(await f.service().dispatch('load',f.user,captured));assert.equal(restored.receipts.length,1);assert.equal(restored.receipts[0].intentId,'intent-1');assert.equal(await readFile(file,'utf8'),'After');
  assert.equal(JSON.parse(await readFile(journalPath,'utf8')).records[key].pending,undefined);
 }finally{await f.close();}
});

test('the supplied router gets authenticated file routes without an Express dependency',async()=>{
 const routes=new Map(),router={get:(url,handler)=>routes.set('GET '+url,handler),post:(url,handler)=>routes.set('POST '+url,handler)};await module.init(router);
 assert.deepEqual([...routes.keys()],['GET /status','POST /configure','POST /load','POST /cas','POST /history','POST /adopt','POST /versions','POST /version','POST /restore','POST /roots','POST /browse']);
 let result;await routes.get('GET /status')({user:{},once(){}},{once(){},json(value){result=value;}});assert.equal(result.error.code,'FILE_USER_REQUIRED');
});

test('one revoked path does not hide usable bindings or prevent repairing file settings',async()=>{
 const f=await fixture(false),outside=await fixture();try{
  const directory=path.join(f.root,'original');await mkdir(directory);await writeFile(path.join(directory,'notes.txt'),'Inside');const service=f.service();
  const binding=must(await service.dispatch('configure',f.user,{userId:'alice',path:path.join(directory,'notes.txt'),name:'notes.txt',format:'text',mode:'open'}));
  await rm(directory,{recursive:true});await symlink(outside.root,directory,process.platform==='win32'?'junction':'dir');
  const status=must(await service.dispatch('status',f.user));assert.equal(status.bindings[binding.bindingId].status,'unavailable');
  const repaired=must(await service.dispatch('configure',f.user,{userId:'alice',path:'',name:'repaired.txt',format:'text',mode:'save'}));assert.equal(repaired.status,'ready');
 }finally{await f.close();await outside.close();}
});

test('CAS transport admits separate 180 KB previous and next documents within the 2 MiB envelope',async()=>{
 const f=await fixture();try{
  const file=path.join(f.root,'large-valid.txt');await writeFile(file,'a'.repeat(180000));const service=f.service();
  const binding=must(await service.dispatch('configure',f.user,{userId:'alice',path:file,name:'large-valid.txt',format:'text',mode:'open'})),captured=request(binding),loaded=must(await service.dispatch('load',f.user,captured));
  must(await service.dispatch('cas',f.user,{...captured,update:change(loaded,'b'.repeat(180000))}));assert.equal(await readFile(file,'utf8'),'b'.repeat(180000));
 }finally{await f.close();}
});

test('raced parent substitution is rejected before reading from an opened outside file',async context=>{
 const f=await fixture(false),outside=await fixture();const directory=path.join(f.root,'read-race'),backup=path.join(f.root,'read-race-backup');let reads=0;
 try{
  await mkdir(directory);const target=path.join(directory,'notes.txt');await writeFile(target,'Inside');await writeFile(path.join(outside.root,'notes.txt'),'Outside secret');
  const owner={root:f.root,metadata:path.join(f.root,'lattice-file-service'),admin:false},handle=serverHandle(owner,target),original=filesystem.open;let swapped=false;
  context.mock.method(filesystem,'open',async(...args)=>{
   if(args[0]===target&&!swapped){swapped=true;await filesystem.rename(directory,backup);await symlink(outside.root,directory,process.platform==='win32'?'junction':'dir');}
   const opened=await original(...args);if(args[0]===target){const read=opened.read.bind(opened);opened.read=async(...params)=>{reads++;return read(...params);};}return opened;
  });
  await assert.rejects(handle.getFile());assert.equal(reads,0,'outside bytes are never read into the service');
 }finally{context.mock.restoreAll();await f.close();await outside.close();}
});

test('raced parent substitution cannot write payload bytes into an outside temporary file',async context=>{
 const f=await fixture(false),outside=await fixture();const directory=path.join(f.root,'write-race'),backup=path.join(f.root,'write-race-backup');let outsideWrites=0;
 try{
  await mkdir(directory);const target=path.join(directory,'notes.txt');await writeFile(target,'Inside');await writeFile(path.join(outside.root,'notes.txt'),'Outside original');
  const owner={root:f.root,metadata:path.join(f.root,'lattice-file-service'),admin:false},writer=await serverHandle(owner,target).createWritable();await writer.write('Replacement');
  const original=filesystem.open;let swapped=false;
  context.mock.method(filesystem,'open',async(...args)=>{
   const isTemporary=typeof args[0]==='string'&&path.dirname(args[0])===directory&&path.basename(args[0]).startsWith('.lattice-');
   if(isTemporary&&!swapped){swapped=true;await filesystem.rename(directory,backup);await symlink(outside.root,directory,process.platform==='win32'?'junction':'dir');}
   const opened=await original(...args);if(isTemporary){const write=opened.writeFile.bind(opened);opened.writeFile=async(...params)=>{outsideWrites++;return write(...params);};}return opened;
  });
  await assert.rejects(writer.close());assert.equal(outsideWrites,0,'no document payload reaches the redirected directory');assert.equal(await readFile(path.join(outside.root,'notes.txt'),'utf8'),'Outside original');
 }finally{context.mock.restoreAll();await f.close();await outside.close();}
});

test('server adoption retains scoped legacy receipts and source bindings without rewriting the file',async()=>{
 const f=await fixture();try{
  const file=path.join(f.root,'migrate.txt');await writeFile(file,'Before');const service=f.service();
  const binding=must(await service.dispatch('configure',f.user,{userId:'alice',path:file,name:'migrate.txt',format:'text',mode:'open'})),captured=request(binding),loaded=must(await service.dispatch('load',f.user,captured));
  const sourceBinding={schemaVersion:1,messageCount:1,prefixHash:sha256Text('prefix')};
  const snapshot={...loaded,scope:captured.scope,receipts:[{intentId:'legacy',fingerprint:sha256Text('legacy'),revision:1}],sourceBinding};
  assert.deepEqual(must(await service.dispatch('adopt',f.user,{...captured,request:{snapshot,pages:{}}})),{adopted:true});
  const restarted=f.service(),restored=must(await restarted.dispatch('load',f.user,captured));assert.deepEqual(restored.receipts,snapshot.receipts);assert.deepEqual(restored.sourceBinding,sourceBinding);assert.equal(await readFile(file,'utf8'),'Before');
  const history=must(await restarted.dispatch('history',f.user,{...captured,query:{intentId:'legacy'}}));assert.equal(history.epoch,0);
  const other=must(await restarted.dispatch('load',f.user,{...captured,scope:{...captured.scope,chatId:'other'}}));assert.deepEqual(other.receipts,[]);assert.equal(other.sourceBinding,undefined);
 }finally{await f.close();}
});
