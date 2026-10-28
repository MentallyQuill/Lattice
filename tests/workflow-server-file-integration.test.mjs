import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,resolve,isAbsolute} from 'node:path';
import {createServerFileService} from '../server-plugin/index.mjs';
import {createServerFileAccess} from '../src/ui/server-file-access.js?v=0.29.0';
import {createNodeFileAccess} from '../src/ui/node-file-access.js?v=0.29.0';
import {createNodeFileService} from '../src/ui/node-file-service.js?v=0.29.0';
import {operationDefaults} from '../src/workflow/catalog.js?v=0.29.0';
import {unifiedRecipeHost} from './helpers/unified-recipe-host.mjs';

const must=result=>{assert.equal(result.ok,true,JSON.stringify(result.error));return result.data;};
function graphForFile(fileTarget){
 const nodes={send:{id:'send',type:'workflow',operation:'on-send'},generate:{id:'generate',type:'workflow',operation:'generate-reply'},review:{id:'review',type:'workflow',operation:'review-publish'},body:{id:'body',type:'workflow',operation:'draft-text'},write:{id:'write',type:'workflow',...operationDefaults('write-file'),destinationMode:'own',targetId:'notes',fileTarget}};
 const wire=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});
 return {id:'server-file-workflow',name:'Server file workflow',schema:3,runtime:2,mode:'native-unified',nodes,wires:{a:wire('a','send','activation','generate','activation'),b:wire('b','generate','draft','review','draft'),c:wire('c','generate','draft','body','draft'),d:wire('d','body','out','write','text')},portals:{},definitions:{},runTargets:[{instancePath:[],nodeId:'review'},{instancePath:[],nodeId:'write'}]};
}
async function fixture({installed=true,loseFirstSaveReply=false}={}){
 const directory=await mkdtemp(join(tmpdir(),'lattice-reviewed-server-file-')),filePath=join(directory,'Scene Context.txt');
 await writeFile(filePath,'Before','utf8');
 const user={profile:{handle:'default-user',admin:true},directories:{root:directory,files:join(directory,'user','files')}},service=createServerFileService();
 let available=installed,saveRequests=0,providerCalls=0,loseReply=loseFirstSaveReply,fileDefinition;
 const server=createServerFileAccess({getContext:()=>({getRequestHeaders:()=>({'Content-Type':'application/json'})}),getUserId:()=>user.profile.handle,fetch:async(url,request)=>{
  if(!available)return {ok:false,status:404,json:async()=>null};
  const action=url.split('/').at(-1);if(action==='cas')saveRequests++;
  const result=await service.dispatch(action,user,request.body?JSON.parse(request.body):{},{signal:request.signal});
  if(action==='cas'&&result.ok&&loseReply){loseReply=false;throw Error('The response was lost after the server committed the file.');}
  return {ok:true,status:200,json:async()=>result};
 }});
 const native=createNodeFileAccess({persistence:{load:async()=>({bindings:[],records:{}}),save:async()=>{}}}),access=createNodeFileService({server,native});
 const configured=async()=>{
  const binding=must(await access.choose({mode:'save',name:'Scene Context.txt',format:'text',path:filePath}));
  const fileTarget={bindingId:binding.bindingId,name:binding.name,path:binding.path,format:'text',missing:'error',content:'',visibility:{kind:'public'}};
  fileDefinition={targetId:'notes',...fileTarget};
  const host=unifiedRecipeHost(graphForFile(fileTarget),{ports:{nodeFileAccess:access},request:async()=>{providerCalls++;throw Error('Server file tests must not make model requests.');}});
  return host;
 };
 return {access,server,filePath,configured,saveRequests:()=>saveRequests,providerCalls:()=>providerCalls,readStored:()=>access.backend([fileDefinition],{scope:{userId:'default-user',chatId:'Story-2'},isCurrent:()=>true}).load('notes'),install(){available=true;},async close(){const within=relative(resolve(tmpdir()),resolve(directory));assert.ok(within&&!within.startsWith('..')&&!isAbsolute(within));await rm(directory,{recursive:true,force:true});}};
}

test('server paths stay unchanged through configuration and preview, then save once on accepted Apply',async()=>{
 const disk=await fixture();let host;
 try{
  must(await disk.access.ready);host=await disk.configured();
  assert.equal(await readFile(disk.filePath,'utf8'),'Before');assert.equal(disk.saveRequests(),0);
  const result=await host.generate('After');must(result);
  assert.equal(await readFile(disk.filePath,'utf8'),'Before');assert.equal(disk.saveRequests(),0);
  must(await host.controller.apply(result.reviewHandles[0]));
  assert.equal(await readFile(disk.filePath,'utf8'),'Before\nAfter');assert.equal(disk.saveRequests(),1);
  must(await host.controller.apply(result.reviewHandles[0]));assert.equal(disk.saveRequests(),1);
  assert.equal(host.c.chatMetadata.latticeDocuments,undefined);assert.equal(disk.providerCalls(),0);
 }finally{host?.controller.dispose();await disk.close();}
});

test('rejecting a reviewed result never sends a server write or changes the configured file',async()=>{
 const disk=await fixture();let host;
 try{
  must(await disk.access.ready);host=await disk.configured();const result=await host.generate('After');must(result);
  must(host.controller.reject(result.reviewHandles[0]));
  assert.equal(await readFile(disk.filePath,'utf8'),'Before');assert.equal(disk.saveRequests(),0);assert.equal(disk.providerCalls(),0);
 }finally{host?.controller.dispose();await disk.close();}
});

test('an external server file edit after preview blocks Apply before a write or publication',async()=>{
 const disk=await fixture();let host;
 try{
  must(await disk.access.ready);host=await disk.configured();const result=await host.generate('After');must(result);
  await writeFile(disk.filePath,'External edit','utf8');
  const applied=await host.controller.apply(result.reviewHandles[0]);assert.equal(applied.ok,false);assert.equal(applied.error.code,'FILE_REVISION_CONFLICT');
  assert.equal(await readFile(disk.filePath,'utf8'),'External edit');assert.equal(disk.saveRequests(),0);
  assert.equal(host.c.chat[1].swipes.length,1);assert.equal(disk.providerCalls(),0);
 }finally{host?.controller.dispose();await disk.close();}
});

test('installing and refreshing the file service restores own-file runs after the initial status failed',async()=>{
 const disk=await fixture({installed:false});let host;
 try{
  assert.equal((await disk.access.ready).ok,false);assert.equal(disk.access.supported,false);
  disk.install();must(await disk.access.refresh());assert.equal(disk.access.supported,true);
  host=await disk.configured();assert.equal((await disk.access.ready).ok,false,'initial readiness remains an immutable historical promise');
  const result=await host.generate('After');must(result);assert.equal(disk.saveRequests(),0);
  must(await host.controller.apply(result.reviewHandles[0]));
  assert.equal(await readFile(disk.filePath,'utf8'),'Before\nAfter');assert.equal(disk.saveRequests(),1);assert.equal(disk.providerCalls(),0);
 }finally{host?.controller.dispose();await disk.close();}
});

test('a lost HTTP reply after server commit recovers the durable receipt without another append or publication',async()=>{
 const disk=await fixture({loseFirstSaveReply:true});let host;
 try{
  must(await disk.access.ready);host=await disk.configured();const result=await host.generate('After');must(result);
  const applied=await host.controller.apply(result.reviewHandles[0]);must(applied);
  assert.equal(applied.settlement.status,'partial',JSON.stringify(applied.settlement));
  const uncertain=applied.settlement.receipts.find(receipt=>receipt.targetId==='file:notes');
  assert.equal(uncertain.error.code,'PERSISTENCE_UNKNOWN');
  assert.equal(await readFile(disk.filePath,'utf8'),'Before\nAfter');assert.equal(disk.saveRequests(),1);
  const messageBefore=structuredClone(host.c.chat[1]),stored=must(await disk.readStored());
  assert.equal(stored.receipts.length,1);assert.equal(stored.content,'Before\nAfter');
  const recovered=await host.controller.retryPersistence(result.reviewHandles[0]);must(recovered);
  assert.equal(recovered.settlement.status,'settled',JSON.stringify(recovered.settlement));
  assert.equal(recovered.settlement.receipts.find(receipt=>receipt.targetId==='file:notes').status,'confirmed');
  assert.equal(await readFile(disk.filePath,'utf8'),'Before\nAfter');assert.equal(disk.saveRequests(),1);
  assert.deepEqual(host.c.chat[1],messageBefore,'recovery keeps the exact published reply and swipe history');
  assert.equal((must(await disk.readStored())).receipts.length,1);assert.equal(disk.providerCalls(),0);
 }finally{host?.controller.dispose();await disk.close();}
});
