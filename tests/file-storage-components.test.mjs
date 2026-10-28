import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
import {compiled} from './helpers/svelte-compile.mjs';
const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true});globalThis.window=dom.window;globalThis.document=dom.window.document;
for(const key of ['Node','Element','Text','Comment','Document','HTMLElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
const {mount,unmount,flushSync,tick}=await import(new URL('../node_modules/svelte/src/index-client.js',import.meta.url).href);
const settle=async()=>{await tick();await tick();flushSync();};
test('first-run choices explain the remote machine and cancellation preserves optional setup',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-setup-component-')),target=document.createElement('div');document.body.append(target);let instance;
 try{
  const component=await compiled('FileStorageSetup',directory),choices=[];let cancelled=0;
  const setup={view:()=>({open:true,choice:null,step:'choice',status:'missing',local:false,hostId:'https://stories.example',userId:'alice',error:'',preferenceError:''}),subscribe:()=>()=>{},choose:async choice=>choices.push(choice),cancel:async()=>cancelled++};
  instance=mount(component.component,{target,props:{setup}});flushSync();assert.match(target.textContent,/Save only inside SillyTavern/);assert.match(target.textContent,/Choose locations on the SillyTavern server/);assert.match(target.textContent,/browser/);
  target.querySelector('[data-storage-choice="inside"]').click();await settle();assert.deepEqual(choices,['inside']);target.querySelector('[data-cancel-storage-setup]').click();await settle();assert.equal(cancelled,1);
 }finally{if(instance)await unmount(instance);target.remove();await rm(directory,{recursive:true,force:true});}
});
test('server chooser browses folders and returns only a path without authorizing or writing',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-chooser-component-')),target=document.createElement('div');document.body.append(target);let instance;
 try{
  const component=await compiled('ServerFileChooser',directory),selected=[],calls=[];
  const access={roots:async()=>({ok:true,data:{chooserVersion:1,roots:[{name:'Your files',path:'/files'}]}}),browse:async({path})=>{calls.push(path);return {ok:true,data:{chooserVersion:1,path,parent:null,truncated:false,entries:[{name:'notes.txt',kind:'file',path:'/files/notes.txt'}]}};}};
  instance=mount(component.component,{target,props:{access,mode:'open',onselect:path=>selected.push(path),oncancel:()=>{}}});flushSync();await settle();await settle();
  target.querySelector('[data-server-entry="file"]').click();await settle();assert.deepEqual(selected,['/files/notes.txt']);assert.deepEqual(calls,['/files']);
 }finally{if(instance)await unmount(instance);target.remove();await rm(directory,{recursive:true,force:true});}
});
