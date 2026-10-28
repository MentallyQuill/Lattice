import assert from 'node:assert/strict';
import test from 'node:test';
import {createNodeFileService} from '../src/ui/node-file-service.js';

function adapter(storage,bindings={}){
 const calls=[];
 return {storage,calls,supported:true,native:storage==='native',availability:null,ready:Promise.resolve({ok:true,data:{persistent:true}}),snapshot:()=>structuredClone(bindings),subscribe:()=>()=>{},choose:async request=>{calls.push(['choose',request]);return {ok:true,data:{bindingId:storage,name:request.name}};},backend:()=>Object.fromEntries(['load','compareAndSwap','lookupHistory','adoptLegacy'].map(method=>[method,async value=>{calls.push([method,value]);return {ok:true,data:{storage}};}]))};
}
test('new file selection uses the server while existing native bindings retain their backend',async()=>{
 const native=adapter('native',{'local-file':{bindingId:'local-file',name:'old.txt',format:'text',status:'ready'}}),server=adapter('server',{'server-file':{bindingId:'server-file',name:'new.txt',format:'text',status:'ready'}});
 const service=createNodeFileService({native,server});
 assert.equal(service.storage,'server');
 assert.equal(service.snapshot()['local-file'].storage,'native');
 await service.choose({mode:'save',name:'new.txt',format:'text',path:'/data/new.txt'});
 assert.equal(server.calls[0][0],'choose');assert.equal(native.calls.length,0);
 const backend=service.backend([{targetId:'old',bindingId:'local-file'},{targetId:'new',bindingId:'server-file'}],{scope:{userId:'u',chatId:'c'},isCurrent:()=>true});
 assert.equal((await backend.load('old')).data.storage,'native');
 assert.equal((await backend.load('new')).data.storage,'server');
});

test('file writes capture their update before awaiting legacy restoration',async()=>{
 let resume;const native=adapter('native'),server=adapter('server');native.ready=new Promise(resolve=>{resume=resolve;});
 const service=createNodeFileService({native,server}),backend=service.backend([{targetId:'new',bindingId:'server-file'}],{scope:{userId:'u',chatId:'c'},isCurrent:()=>true});
 const update={targetId:'new',projectedDocument:{content:'reviewed'}};
 const saved=backend.compareAndSwap(update);update.projectedDocument.content='changed';resume({ok:true});await saved;
 assert.equal(server.calls[0][1].projectedDocument.content,'reviewed');
});

test('independently valid before and after documents fit the composite service',async()=>{
 const native=adapter('native'),server=adapter('server'),service=createNodeFileService({native,server});
 const backend=service.backend([{targetId:'new',bindingId:'server-file'}],{scope:{userId:'u',chatId:'c'},isCurrent:()=>true});
 const result=await backend.compareAndSwap({targetId:'new',expectedContent:'a'.repeat(180000),projectedDocument:{content:'b'.repeat(180000)}});
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(server.calls[0][1].projectedDocument.content.length,180000);
});
test('managed defaults use host storage while existing native and server grants keep their providers',async()=>{
 const host=adapter('host',{'host-file':{bindingId:'host-file',name:'managed.txt',format:'text',status:'ready'}}),server=adapter('server',{'server-file':{bindingId:'server-file',name:'external.txt',format:'text',status:'ready'}}),native=adapter('native',{'native-file':{bindingId:'native-file',name:'local.txt',format:'text',status:'ready'}});
 host.capabilities={concurrency:'verified-write',crossDeviceCAS:false};server.capabilities={concurrency:'serialized-checked-write',crossDeviceCAS:true};
 const service=createNodeFileService({host,server,native,getStorageMode:()=> 'inside'});
 assert.equal(service.storage,'host');assert.equal(service.capabilities.concurrency,'verified-write');
 await service.choose({mode:'save',name:'managed.txt',format:'text'});assert.equal(host.calls[0][0],'choose');
 const denied=await service.choose({mode:'save',name:'external.txt',format:'text',path:'/other/file.txt'});assert.equal(denied.ok,false);
 const backend=service.backend([{targetId:'h',bindingId:'host-file'},{targetId:'s',bindingId:'server-file'},{targetId:'n',bindingId:'native-file'}],{scope:{userId:'u',chatId:'c'},isCurrent:()=>true});
 assert.equal((await backend.load('h')).data.storage,'host');assert.equal((await backend.load('s')).data.storage,'server');assert.equal((await backend.load('n')).data.storage,'native');
 assert.equal(service.providers.server.capabilities.concurrency,'serialized-checked-write');
});
test('optional custom support can be offline without disabling automatic host files',async()=>{
 const host=adapter('host'),server=adapter('server'),native=adapter('native');server.supported=false;server.availability={code:'FILE_SERVICE_UNAVAILABLE',message:'offline'};
 host.ensureManaged=async definition=>({ok:true,data:{...definition,bindingId:'managed'}});
 const service=createNodeFileService({host,server,native,getStorageMode:()=> 'anywhere'});
 assert.equal(service.supported,true);assert.equal(service.availability,null);assert.equal(service.providers.server.availability.code,'FILE_SERVICE_UNAVAILABLE');
 assert.equal((await service.ensureManaged({targetId:'new'},{scope:{userId:'u',chatId:'c'},isCurrent:()=>true,managed:true})).data.bindingId,'managed');
 await service.choose({mode:'save',name:'custom.txt',format:'text',path:'/custom.txt'});assert.equal(server.calls[0][0],'choose');
});
test('unavailable external providers never allocate a replacement managed host destination',async()=>{
 for(const destination of [
  {storage:'server',bindingId:'existing-server-binding',path:'/legacy/scene.txt'},
  {storage:'native',bindingId:'existing-native-binding'},
  {path:'/legacy/scene.txt'},
 ]){
  const host=adapter('host'),server=adapter('server'),native=adapter('native');let allocations=0;
  host.ensureManaged=async definition=>{allocations++;return {ok:true,data:{...definition,bindingId:'replacement',storage:'host'}};};
  server.supported=false;server.availability={code:'FILE_SERVICE_UNAVAILABLE',message:'offline'};server.ready=Promise.resolve({ok:false,error:server.availability});
  native.supported=false;native.availability={code:'FILE_ACCESS_UNSUPPORTED',message:'grant unavailable'};
  const service=createNodeFileService({host,server,native,getStorageMode:()=> 'anywhere'});
  const result=await service.ensureManaged({targetId:'scene',name:'scene.txt',format:'text',content:'',missing:'create',visibility:{kind:'public'},...destination},{scope:{userId:'u',chatId:'c'},isCurrent:()=>true});
  assert.equal(result.ok,false,JSON.stringify(destination));assert.equal(allocations,0);
  assert.equal(result.error.code,destination.storage==='native'?'FILE_ACCESS_UNSUPPORTED':'FILE_SERVICE_UNAVAILABLE');
 }
});
test('unknown binding authority and explicit custom paths fail closed even when providers are online',async()=>{
 for(const destination of [{bindingId:'unknown-grant'},{bindingId:'unknown-server',storage:'server',path:'/existing.txt'},{path:'/existing.txt'}]){
  const host=adapter('host'),server=adapter('server'),native=adapter('native');let allocations=0;
  host.ensureManaged=async definition=>{allocations++;return {ok:true,data:{...definition,bindingId:'replacement'}};};
  const service=createNodeFileService({host,server,native,getStorageMode:()=> 'anywhere'});
  const result=await service.ensureManaged({targetId:'scene',...destination},{scope:{userId:'u',chatId:'c'},isCurrent:()=>true});
  assert.equal(result.ok,false,JSON.stringify(destination));assert.equal(result.error.code,'FILE_BINDING_MISSING');assert.equal(allocations,0);
 }
});
test('only trusted runtime controls can authorize new managed storage and imported grants are ignored then',async()=>{
 const host=adapter('host'),server=adapter('server'),native=adapter('native',{'imported-grant':{bindingId:'imported-grant',name:'private.txt',format:'text',status:'ready'}});const allocations=[];
 host.ensureManaged=async definition=>{allocations.push(definition);return {ok:true,data:{...definition,bindingId:'fresh-host-grant',storage:'host'}};};
 const service=createNodeFileService({host,server,native}),controls={scope:{userId:'u',chatId:'c'},isCurrent:()=>true};
 const descriptiveIntent={targetId:'managed:'+'a'.repeat(64),managed:true,bindingId:'',name:'scene.txt',format:'text'};
 assert.equal((await service.ensureManaged(descriptiveIntent,controls)).ok,false);assert.equal(allocations.length,0);
 const imported={...descriptiveIntent,bindingId:'imported-grant',path:'/borrowed/private.txt',storage:'native'};
 const prepared=await service.ensureManaged(imported,{...controls,managed:true});
 assert.equal(prepared.ok,true,JSON.stringify(prepared));assert.equal(prepared.data.bindingId,'fresh-host-grant');assert.equal(prepared.data.storage,'host');
 assert.equal(allocations.length,1);assert.equal(allocations[0].bindingId,'');assert.equal(Object.hasOwn(allocations[0],'path'),false);assert.equal(Object.hasOwn(allocations[0],'storage'),false);
});
