import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {JSDOM} from 'jsdom';import {compiled} from './helpers/svelte-compile.mjs';
const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true,url:'https://lattice.test'});globalThis.window=dom.window;globalThis.document=dom.window.document;
for(const key of ['Node','Element','Text','Comment','Document','HTMLElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement','HTMLMediaElement','MutationObserver','localStorage'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
const {mount,unmount,flushSync,tick}=await import(new URL('../node_modules/svelte/src/index-client.js',import.meta.url).href);
test('Scene Context source setup renders its explicit action and preserves the captured selection',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-source-setup-')),host=document.createElement('div');document.body.append(host);let component;const calls=[],selection={selectionKey:'scene',revision:'rev',address:{workflowId:'root',instancePath:[],nodeId:'scene'}};
 try{const leaf=await compiled('NativeSourceSetup',directory);component=mount(leaf.component,{target:host,props:{model:{key:'captured',status:'setup-required',activeSources:26,busy:false,notice:'',issue:''},selection,actions:{sourceSetup:async(...args)=>{calls.push(args);return {ok:true};},refreshSourceSetup(){}}}});flushSync();assert.match(host.textContent,/Setup Required/);assert.equal(calls.length,0);const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='Set up chat sources');assert.ok(button);button.click();await tick();assert.deepEqual(calls,[[selection,'captured','setup']]);
 }finally{if(component)await unmount(component);host.remove();await rm(directory,{recursive:true,force:true});}
});
