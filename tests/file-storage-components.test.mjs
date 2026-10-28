import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
import {compiled} from './helpers/svelte-compile.mjs';
import {createFileStorageSetup} from '../src/ui/file-storage-setup.js';
const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true});globalThis.window=dom.window;globalThis.document=dom.window.document;
for(const key of ['Node','Element','Text','Comment','Document','HTMLElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
const {mount,unmount,flushSync,tick}=await import(new URL('../node_modules/svelte/src/index-client.js',import.meta.url).href);
const settle=async()=>{await tick();await tick();flushSync();};
const chooserRefreshSource=`<script>
 import Chooser from './ServerFileChooser.svelte';
 let {access,onselect}= $props();
 let view=$state.raw({access});
 export function refresh(){view={...view};}
 export function replaceAccess(next){view={access:next};}
</script><Chooser access={view.access} mode="save" name="notes.txt" {onselect} oncancel={()=>{}}/>`;
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

test('server chooser retains its selected folder and filename across same-access parent refreshes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-chooser-refresh-')),target=document.createElement('div');document.body.append(target);let instance;
 try{
  const component=await compiled('ServerChooserRefresh',directory,chooserRefreshSource),selected=[],calls=[];
  const access=Object.freeze({roots:async()=>({ok:true,data:{chooserVersion:1,roots:[{name:'Your files',path:'/files'}]}}),browse:async({path})=>{calls.push(path);return {ok:true,data:{chooserVersion:1,path,parent:null,truncated:false,entries:[]}};}});
  instance=mount(component.component,{target,props:{access,onselect:path=>selected.push(path)}});flushSync();await settle();await settle();
  const folder=target.querySelector('[aria-label="Server folder"]');folder.value='/files/Stories';folder.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  folder.closest('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await settle();await settle();
  const filename=target.querySelector('[aria-label="Filename"]');filename.value='SceneContext.txt';filename.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  instance.refresh();flushSync();await settle();await settle();
  assert.deepEqual(calls,['/files','/files/Stories'],'a status-only parent refresh cannot restart root browsing');
  assert.equal(target.querySelector('.path').textContent,'/files/Stories');assert.equal(folder.value,'/files/Stories');assert.equal(filename.value,'SceneContext.txt');
  filename.closest('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.deepEqual(selected,['/files/Stories/SceneContext.txt']);
 }finally{if(instance)await unmount(instance);target.remove();await rm(directory,{recursive:true,force:true});}
});

test('server chooser keeps a pending same-access browse and rejects late responses from a replaced adapter',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-chooser-adapter-')),target=document.createElement('div');document.body.append(target);let instance;
 try{
  const component=await compiled('ServerChooserAdapter',directory,chooserRefreshSource),calls=[];let release;
  const listing=path=>({ok:true,data:{chooserVersion:1,path,parent:null,truncated:false,entries:[]}});
  const access=Object.freeze({roots:async()=>({ok:true,data:{chooserVersion:1,roots:[{name:'Old files',path:'/old'}]}}),browse:({path})=>{calls.push(path);return new Promise(resolve=>{release=()=>resolve(listing(path));});}});
  instance=mount(component.component,{target,props:{access,onselect:()=>assert.fail('Browsing cannot select a file')}});flushSync();await settle();
  const oldRelease=release;assert.equal(typeof oldRelease,'function');instance.refresh();flushSync();await settle();
  assert.deepEqual(calls,['/old'],'same-adapter refresh must not cancel or restart the pending browse');
  const replacement=Object.freeze({roots:async()=>({ok:true,data:{chooserVersion:1,roots:[{name:'New files',path:'/new'}]}}),browse:async({path})=>{calls.push(path);return listing(path);}});
  instance.replaceAccess(replacement);flushSync();await settle();await settle();
  assert.equal(target.querySelector('.path').textContent,'/new');oldRelease();await settle();await settle();
  assert.equal(target.querySelector('.path').textContent,'/new');assert.deepEqual(calls,['/old','/new']);
  assert.equal(target.querySelector('[aria-label="Filename"]').closest('form').querySelector('button').disabled,false);
 }finally{if(instance)await unmount(instance);target.remove();await rm(directory,{recursive:true,force:true});}
});

test('reopening completed setup offers both choices and can switch back to inside saving',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-change-storage-')),target=document.createElement('div');document.body.append(target);let instance;
 const records=new Map(),setup=createFileStorageSetup({access:{serviceVersion:{apiVersion:1,chooserVersion:1},refresh:async()=>({ok:true,data:{persistent:true}})},getHost:()=>({hostId:'https://stories.example',userId:'alice'}),preferences:{read:async name=>({ok:true,data:{exists:records.has(name),content:records.get(name)??'',revision:null}}),write:async({name,content})=>{records.set(name,content);return {ok:true,data:{acknowledged:true,revision:'saved'}};}}});
 try{
  await setup.ready;await setup.choose('anywhere');await setup.cancel();await setup.open();
  const component=await compiled('FileStorageSetup',directory);instance=mount(component.component,{target,props:{setup}});flushSync();
  const inside=target.querySelector('[data-storage-choice="inside"]');assert.ok(inside,'completed settings must offer the inside choice');assert.ok(target.querySelector('[data-storage-choice="anywhere"]'));
  inside.click();await settle();await settle();assert.equal(setup.view().choice,'inside');assert.equal(setup.view().effectiveMode,'inside');assert.equal(setup.view().open,false);assert.equal(JSON.parse([...records.values()][0]).choice,'inside');
 }finally{if(instance)await unmount(instance);setup.dispose();target.remove();await rm(directory,{recursive:true,force:true});}
});
