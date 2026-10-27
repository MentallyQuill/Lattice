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
