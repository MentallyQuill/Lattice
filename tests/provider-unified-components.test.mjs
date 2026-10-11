import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {JSDOM} from 'jsdom';
import {compiled} from './helpers/svelte-compile.mjs';
const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true});
globalThis.window=dom.window;globalThis.document=dom.window.document;
for(const key of ['Node','Element','Text','Comment','Document','HTMLElement','HTMLMediaElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
const {mount,unmount,flushSync,tick}=await import(new URL('../node_modules/svelte/src/index-client.js',import.meta.url).href);
async function fixture(name,props,source){const directory=await mkdtemp(join(tmpdir(),'lattice-provider-ui-')),host=document.createElement('div');document.body.append(host);let mounted;
 const close=async()=>{if(mounted)await unmount(mounted);host.remove();const path=resolve(directory),rel=relative(resolve(tmpdir()),path);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(path,{recursive:true,force:true});};
 try{const leaf=await compiled(name,directory,source);mounted=mount(leaf.component,{target:host,props});flushSync();await tick();return{host,close,mounted};}catch(error){await close();throw error;}}
const input=(host,label,value,event='input')=>{const element=host.querySelector('[aria-label="'+label+'"]');assert.ok(element,label);element.value=value;element.dispatchEvent(new dom.window.Event(event,{bubbles:true}));flushSync();return element;};
const button=(host,label)=>[...host.querySelectorAll('button')].find(element=>element.textContent.trim()===label);
const view={userId:'default-user',connections:[],issue:''};

test('real Fast setup keeps session password separate and clears it before awaiting Save',async()=>{
 let captured,release;const f=await fixture('FastConnections',{view,close(){},actions:{save(configuration,key,userId){captured={configuration,key,userId};return new Promise(resolve=>release=resolve);}}});
 try{input(f.host,'Connection ID','judge');input(f.host,'Connection name','Scene judge');input(f.host,'Typed model','jev-any');const password=input(f.host,'Session API key','SECRET');assert.equal(password.type,'password');
 button(f.host,'Save connection').click();flushSync();assert.equal(password.value,'');assert.equal(captured.key,'SECRET');assert.equal(captured.userId,'default-user');assert.equal(captured.configuration.id,'judge');assert.equal(captured.configuration.apiKey,undefined);assert.equal(captured.configuration.endpoint,undefined);
 assert.doesNotMatch(f.host.textContent,/SECRET/);assert.match(f.host.textContent,/Re-enter.*restart/i);
 release({ok:true,data:{message:'Configuration applied locally; SillyTavern save is unconfirmed.'}});await tick();flushSync();assert.match(f.host.textContent,/save is unconfirmed/);
 }finally{await f.close();}
});

test('real Fast setup exposes explicit Laya endpoint and clears password when changing connections',async()=>{
 let captured;const connection={id:'local',label:'Local Laya',provider:'laya',model:'laya-model',endpoint:'http://127.0.0.1:8080/v1/systemone',credentialReady:false};
 const f=await fixture('FastConnections',{view:{...view,connections:[connection]},close(){},actions:{save(configuration,key){captured={configuration,key};return{ok:true,data:{message:'Applied locally'}};}}});
 try{input(f.host,'Configured Fast connection','local','change');assert.equal(f.host.querySelector('[aria-label="Typed endpoint"]').value,connection.endpoint);input(f.host,'Session API key','SECRET');input(f.host,'Configured Fast connection','','change');assert.equal(f.host.querySelector('[aria-label="Session API key"]').value,'');
 input(f.host,'Connection ID','laya');input(f.host,'Connection name','Laya');input(f.host,'Provider','laya','change');input(f.host,'Typed model','local-model');input(f.host,'Typed endpoint','http://localhost:8080/v1/systemone');button(f.host,'Save connection').click();flushSync();await tick();assert.equal(captured.configuration.provider,'laya');assert.equal(captured.configuration.endpoint,'http://localhost:8080/v1/systemone');assert.equal(captured.key,'');
 }finally{await f.close();}
});

test('unsaved workflow prompt applies the shared replacement choice',async()=>{
 let chosen;const f=await fixture('DocumentPrompt',{view:{name:'Story'},actions:{choose(...args){chosen=args;}}});
 try{assert.equal(f.host.querySelector('select'),null);button(f.host,"Don't Save").click();flushSync();assert.deepEqual(chosen,['discard']);}finally{await f.close();}
});

test('actual Graph menu runs the open unified workflow and Tools opens Fast connections',async()=>{
 const commands=[],local=[];const state={graphId:'unified',armed:false,inspectorOpen:true,history:{undo:false,redo:false},selectionCount:0,rootWorkflow:{phase:'unified',busy:false,issues:[]}};
 const f=await fixture('WorkspaceMenus',{state,actions:{command:name=>commands.push(name)},local:name=>local.push(name)});
 try{assert.equal(button(f.host,'Workflows'),undefined);button(f.host,'Graph').click();await tick();flushSync();const run=button(f.host,'Run workflow');assert.ok(run);run.click();flushSync();assert.deepEqual(commands,['run-workflow']);button(f.host,'Tools').click();await tick();flushSync();const setup=button(f.host,'Fast connections…');assert.ok(setup);setup.click();flushSync();assert.deepEqual(local,['fast-connections']);}finally{await f.close();}
});


test('actual node Details author a unified stage and expose Fast setup without a text profile editor',async()=>{
 const calls=[];const base={selectionKey:'node',revision:'r1',address:{workflowId:'unified',instancePath:[],nodeId:'work'},title:'Fast Decision',canonicalTitle:'Fast Decision',operation:'fast-decision',family:'Derive',phase:'pre',phaseEditable:true,iconPath:'',alias:'',compact:false,enabled:true,readOnly:false,canPresent:false,controls:[{key:'fastConnectionId',label:'Fast connection',editor:'enum',value:'',options:[{value:'',label:'Choose a connection'},{value:'jev',label:'Configured Jev'}]}],model:null,ports:[]};
 const f=await fixture('NodeDetails',{view:base,actions:{editControl(_selection,key,value){calls.push([key,value]);return{ok:true};},editPhase(_selection,phase){calls.push(['phase',phase]);return{ok:true};},openFastConnections(){calls.push(['setup']);}}});
 try{assert.equal(f.host.querySelector('[aria-label="Connection profile"]'),null);input(f.host,'Fast connection','jev','change');await tick();flushSync();input(f.host,'Workflow stage','post','change');await tick();flushSync();button(f.host,'Configure Fast connections…').click();flushSync();assert.deepEqual(calls,[['fastConnectionId','jev'],['phase','post'],['setup']]);}finally{await f.close();}
});


test('Fast setup discards an awaited completion after the active user changes',async()=>{
 let release;const source=`<script>import FastConnections from './FastConnections.svelte';let {view,actions}=$props();let current=$state.raw(view);export function update(value){current=value;}</script><FastConnections view={current} {actions} close={()=>{}}/>`;
 const f=await fixture('FastConnectionsHarness',{view,actions:{save(){return new Promise(resolve=>release=resolve);}}},source);
 try{input(f.host,'Connection ID','judge');input(f.host,'Typed model','jev-any');input(f.host,'Session API key','SECRET');button(f.host,'Save connection').click();flushSync();
 f.mounted.update({...view,userId:'other-user'});flushSync();await tick();assert.equal(f.host.querySelector('[aria-label="Connection ID"]').value,'');
 release({ok:true,data:{message:'Old user saved'}});await tick();flushSync();assert.equal(f.host.querySelector('[aria-label="Configured Fast connection"]').value,'');assert.equal(f.host.querySelector('[aria-label="Connection ID"]').disabled,false);assert.doesNotMatch(f.host.textContent,/Old user saved/);assert.match(f.host.textContent,/active user changed/i);
 }finally{await f.close();}
});

test('actual Workbench opens Fast setup and destroys its password on Escape or controller close',async()=>{
 let refreshed=0,escaped=0;const f=await fixture('Workbench',{actions:{fastConnections:{refresh(){refreshed++;},save(){return{ok:true};}}}});
 const listener=()=>escaped++;document.addEventListener('keydown',listener);
 try{f.mounted.update({fastConnections:view});flushSync();button(f.host,'Tools').click();await tick();flushSync();button(f.host,'Fast connections…').click();await tick();flushSync();assert.equal(refreshed,1);assert.ok(f.host.querySelector('[role="dialog"][aria-label="Fast connections"]'));
 const password=input(f.host,'Session API key','SECRET');password.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));flushSync();await tick();assert.equal(escaped,0);assert.equal(f.host.querySelector('[aria-label="Session API key"]'),null);
 f.mounted.update({fastConnectionsActive:true});flushSync();await tick();assert.equal(f.host.querySelector('[aria-label="Session API key"]').value,'');input(f.host,'Session API key','SECRET');f.mounted.update({fastConnectionsActive:false});flushSync();await tick();assert.equal(f.host.querySelector('[aria-label="Session API key"]'),null);
 }finally{document.removeEventListener('keydown',listener);await f.close();}
});


test('Workbench can close Fast setup before its awaited focus completes',async()=>{
 const f=await fixture('Workbench',{actions:{fastConnections:{refresh(){}}}});
 try{f.mounted.update({fastConnections:view,fastConnectionsActive:true});f.mounted.update({fastConnectionsActive:false});flushSync();await tick();assert.equal(f.host.querySelector('[role="dialog"][aria-label="Fast connections"]'),null);}finally{await f.close();}
});
