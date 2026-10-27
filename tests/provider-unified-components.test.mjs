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
const button=(host,label)=>[...host.querySelectorAll('button')].find(element=>element.getAttribute('aria-label')===label||element.textContent.trim()===label);





test('unsaved workflow prompt applies the shared replacement choice',async()=>{
 let chosen;const f=await fixture('DocumentPrompt',{view:{name:'Story'},actions:{choose(...args){chosen=args;}}});
 try{assert.equal(f.host.querySelector('select'),null);button(f.host,"Don't Save").click();flushSync();assert.deepEqual(chosen,['discard']);}finally{await f.close();}
});

test('actual Graph menu omits root diagnostics and Tools opens Story documents',async()=>{
 const commands=[],local=[];const state={graphId:'unified',enabled:false,inspectorOpen:true,history:{undo:false,redo:false},selectionCount:0,rootWorkflow:{phase:'unified',busy:false,issues:[]}};
 const f=await fixture('WorkspaceMenus',{state,actions:{command:name=>commands.push(name)},local:name=>local.push(name)});
 try{assert.equal(button(f.host,'Workflows'),undefined);button(f.host,'Graph').click();await tick();flushSync();assert.equal(button(f.host,'Run workflow'),undefined);assert.deepEqual(commands,[]);button(f.host,'Workflow').click();await tick();flushSync();button(f.host,'Configure').click();await tick();flushSync();assert.equal(button(f.host,'Fast connections…'),undefined);const setup=button(f.host,'Legacy chat data…');assert.ok(setup);setup.click();flushSync();assert.deepEqual(local,['story-documents']);}finally{await f.close();}
});


test('actual node Details authors a unified stage through the captured selection',async()=>{
 const calls=[],base={selectionKey:'node',revision:'r1',address:{workflowId:'unified',instancePath:[],nodeId:'work'},title:'Compose',canonicalTitle:'Compose',operation:'compose',family:'Shaping',phase:'pre',phaseEditable:true,iconPath:'',alias:'',compact:false,enabled:true,readOnly:false,canPresent:false,controls:[],model:null,ports:[]};
 const f=await fixture('NodeDetails',{view:base,actions:{editPhase(selection,phase){calls.push([selection,phase]);return{ok:true};}}});
 try{input(f.host,'Workflow stage','post','change');await tick();flushSync();assert.deepEqual(calls,[[{selectionKey:base.selectionKey,revision:base.revision,address:base.address},'post']]);}finally{await f.close();}
});





test('File offers archived recovery export only when recovery data exists and Graph opens the portal manager',async()=>{
 const base={graphId:'unified',enabled:false,inspectorOpen:true,history:{undo:false,redo:false},selectionCount:0},commands=[];
 for(const hasArchivedWorkflows of [false,true]){
  const f=await fixture('WorkspaceMenus',{state:{...base,hasArchivedWorkflows},actions:{command:name=>commands.push(name)},local:()=>{}});
  try{
   button(f.host,'File').click();await tick();flushSync();const archive=button(f.host,'Export archived workflows');assert.equal(!!archive,hasArchivedWorkflows);
   if(archive){archive.click();flushSync();assert.equal(commands.at(-1),'export-archived-workflows');}
   button(f.host,'Graph').click();await tick();flushSync();const portals=button(f.host,'Manage portals…');assert.ok(portals);portals.click();flushSync();assert.equal(commands.at(-1),'manage-portals');
  }finally{await f.close();}
 }
});
