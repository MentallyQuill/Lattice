import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {createServerFileService} from '../server-plugin/index.mjs';
import {serverPersistence} from '../server-plugin/filesystem.mjs';
import {createServerFileAccess,cloneServerFileData} from '../src/ui/server-file-access.js';
import {createNodeFileService} from '../src/ui/node-file-service.js';
import {sha256Text} from '../src/workflow/definition-data.js';
import {prepareTrustedBranchSnapshot} from '../src/workflow/file-history-maintenance.js';
const must=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.data;};
const scope={userId:'owner',chatId:'parent',actorId:'mara'},visibility={kind:'actor-private',actorId:'mara'};
const branchBinding={schemaVersion:1,messageCount:3,prefixHash:sha256Text('accepted publication')};
async function fixture(count=50){
 const root=await mkdtemp(path.join(tmpdir(),'lattice-recovery-transfer-')),metadata=path.join(root,'lattice-file-service');
 const user={profile:{handle:'owner',admin:false},directories:{root,files:path.join(root,'files')}},service=createServerFileService();
 const binding=must(await service.dispatch('configure',user,{userId:'owner',path:'',name:'parent.json',format:'json',mode:'save'}));
 const content=JSON.stringify({schemaVersion:1,clockId:'clock',calendarId:'days',revision:1,dayLengthMinutes:1440,absoluteMinute:100,settledTimeEventIds:[],acceptedTimeAdvances:[]});
 await mkdir(path.dirname(binding.path),{recursive:true});await writeFile(binding.path,content);
 const pages={};let head=null;
 for(let epoch=1;epoch<=count;epoch++){const pageId='archive:page-'+epoch;pages[pageId]={schemaVersion:1,pageId,targetId:'clock',scope,visibility,epoch,checkpointId:'checkpoint:'+epoch,previous:head,kind:'clock-events',payload:Array.from({length:128},(_,index)=>'time:'+JSON.stringify(['clock',('schedule-'+index+'-').padEnd(380,'s'),epoch,epoch]))};head=pageId;}
 const persistence=serverPersistence({root,metadata,admin:false}),stored=await persistence.load(),key=JSON.stringify([scope.userId,scope.chatId,scope.actorId,'clock',binding.bindingId,binding.generation]);
 await persistence.save({...stored,records:{[key]:{receipts:[],visibility,branchBinding,history:{schemaVersion:1,epoch:count,head},historyPages:pages}}});
 const definition={targetId:'clock',bindingId:binding.bindingId,name:binding.name,format:'json',content,missing:'create',visibility};
 const transfers=[];let damage=null;
 const access=createServerFileAccess({getUserId:()=>scope.userId,getContext:()=>({}),fetch:async(url,options)=>{
  const action=url.split('/').at(-1),body=options.body?JSON.parse(options.body):{};
  assert.notEqual(cloneServerFileData(body),undefined,'each request remains bounded');
  let result=await service.dispatch(action,user,body);
  if(damage&&action==='version-page'&&result.ok)result=damage(result);
  transfers.push({action,body,result,requestBytes:Buffer.byteLength(JSON.stringify(body)),responseBytes:Buffer.byteLength(JSON.stringify(result))});
  return Response.json(result);
 }});must(await access.ready);
 return {access,service,user,definition,pages,content,transfers,setDamage:value=>{damage=value;},close:()=>rm(root,{recursive:true,force:true})};
}
test('large server recovery reads and branch adoption transfer checked pages within transport bounds',async()=>{
 const f=await fixture();try{
  const backend=f.access.backend([f.definition],{scope,isCurrent:()=>true}),selected=must(await backend.readVersion('clock',{versionId:'current'}));
  assert.equal(Object.keys(selected.pages).length,50);assert.equal(selected.snapshot.content,f.content);assert.deepEqual(selected.visibility,visibility);
  const branchScope={...scope,chatId:'child'},rebased=must(await prepareTrustedBranchSnapshot({...selected,branchScope,branchBinding,visibility}));
  const child=must(await f.service.dispatch('configure',f.user,{userId:'owner',path:'',name:'child.json',format:'json',mode:'save'}));must(await f.access.refresh());
  const native={snapshot:()=>({}),backend:()=>({}),ready:Promise.resolve({ok:true,data:{persistent:true}})};
  const service=createNodeFileService({server:f.access,native}),definition={...f.definition,bindingId:child.bindingId,name:child.name,content:rebased.snapshot.content};
  const childBackend=service.backend([definition],{scope:branchScope,isCurrent:()=>true});
  assert.equal(must(await childBackend.adoptLegacy('clock',{snapshot:rebased.snapshot,pages:rebased.pages})).adopted,true);
  await assert.rejects(readFile(child.path),{code:'ENOENT'},'adoption does not materialize output bytes');
  const restored=must(await childBackend.readVersion('clock',{versionId:'current'}));assert.equal(Object.keys(restored.pages).length,50);assert.equal(restored.snapshot.scope.chatId,'child');assert.deepEqual(restored.snapshot.receipts,[]);
  assert.ok(f.transfers.some(row=>row.action==='version-page'));assert.ok(f.transfers.some(row=>row.action==='adopt-page'));
  assert.ok(f.transfers.every(row=>row.requestBytes<=2097152&&row.responseBytes<=2097152));
 }finally{await f.close();}
});
test('paged recovery rejects corrupted transfer hashes without exposing archive state',async()=>{
 const f=await fixture();try{
  f.setDamage(result=>({...result,data:{...result.data,pageText:result.data.pageText+' '}}));
  const result=await f.access.backend([f.definition],{scope,isCurrent:()=>true}).readVersion('clock',{versionId:'current'});
  assert.equal(result.ok,false);assert.equal(result.error.code,'FILE_RECOVERY_TRANSFER_INVALID');
 }finally{await f.close();}
});

test('paged recovery archive I/O grows linearly with selected pages',async t=>{
 for(const count of [4,8]){
  const f=await fixture(count),original=fs.promises.open;let opens=0;
  try{
   fs.promises.open=async(...args)=>{if(String(args[0]).includes('archive-'))opens++;return original(...args);};
   const selected=must(await f.access.backend([f.definition],{scope,isCurrent:()=>true}).readVersion('clock',{versionId:'current'}));
   assert.equal(Object.keys(selected.pages).length,count);t.diagnostic(`read ${count}: ${opens} archive opens`);assert.ok(opens<=count*5,`${count} pages opened archives ${opens} times`);
  }finally{fs.promises.open=original;await f.close();}
 }
});

test('transfer sessions reject altered scope and expire after binding changes',async()=>{
 const f=await fixture(4);try{
  must(await f.access.backend([f.definition],{scope,isCurrent:()=>true}).readVersion('clock',{versionId:'current'}));
  const page=f.transfers.find(row=>row.action==='version-page').body;
  const altered=await f.service.dispatch('version-page',f.user,{...page,scope:{...scope,chatId:'other'}});assert.equal(altered.error.code,'FILE_RECOVERY_TRANSFER_INVALID');
  must(await f.service.dispatch('configure',f.user,{userId:'owner',path:'',name:'another.json',format:'json',mode:'save'}));
  const stale=await f.service.dispatch('version-page',f.user,page);assert.equal(stale.error.code,'FILE_RECOVERY_TRANSFER_INVALID');
 }finally{await f.close();}
});

test('paged adoption archive I/O grows linearly with selected pages',async t=>{
 for(const count of [4,8]){
  const f=await fixture(count),original=fs.promises.open;let opens=0;
  try{
   const selected=must(await f.access.backend([f.definition],{scope,isCurrent:()=>true}).readVersion('clock',{versionId:'current'}));
   const branchScope={...scope,chatId:'child'},rebased=must(await prepareTrustedBranchSnapshot({...selected,branchScope,branchBinding,visibility}));
   const child=must(await f.service.dispatch('configure',f.user,{userId:'owner',path:'',name:'child.json',format:'json',mode:'save'}));must(await f.access.refresh());
   const backend=f.access.backend([{...f.definition,bindingId:child.bindingId,name:child.name}],{scope:branchScope,isCurrent:()=>true});
   fs.promises.open=async(...args)=>{if(String(args[0]).includes('archive-'))opens++;return original(...args);};
   must(await backend.adoptLegacy('clock',{snapshot:rebased.snapshot,pages:rebased.pages}));
   t.diagnostic(`adopt ${count}: ${opens} archive opens`);assert.ok(opens<=count*12,`${count} pages opened archives ${opens} times`);
  }finally{fs.promises.open=original;await f.close();}
 }
});
