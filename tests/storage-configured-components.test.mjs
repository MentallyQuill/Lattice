import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {JSDOM} from 'jsdom';
import {compiled} from './helpers/svelte-compile.mjs';
const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true});globalThis.window=dom.window;globalThis.document=dom.window.document;
for(const key of ['Node','Element','Text','Comment','Document','HTMLElement','HTMLMediaElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
const {mount,unmount,flushSync,tick}=await import(new URL('../node_modules/svelte/src/index-client.js',import.meta.url).href);
async function fixture(name,props){const directory=await mkdtemp(join(tmpdir(),'lattice-storage-ui-')),host=document.createElement('div');document.body.append(host);let mounted;const close=async()=>{if(mounted)await unmount(mounted);host.remove();const rel=relative(resolve(tmpdir()),resolve(directory));assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(directory,{recursive:true,force:true});};try{let leaf;try{leaf=await compiled(name,directory);}catch(error){assert.fail(name+' component must compile: '+error.message);}mounted=mount(leaf.component,{target:host,props});flushSync();await tick();return {host,mounted,close};}catch(error){await close();throw error;}}
const input=(host,label,value,event='input')=>{const element=host.querySelector('[aria-label="'+label+'"]');assert.ok(element,label);element.value=value;element.dispatchEvent(new dom.window.Event(event,{bubbles:true}));flushSync();return element;};const button=(host,label)=>[...host.querySelectorAll('button')].find(element=>element.getAttribute('aria-label')===label||element.textContent.trim()===label);
const view={key:'scope-key',revision:'r1',scope:{userId:'default-user',chatId:'story'},documents:[{targetId:'mara.json',name:'Mara memories',format:'json',revision:'doc1',visibility:{kind:'actor-private',actorId:'mara'}}],issue:''};

test('real Workflow Data panel explicitly loads a template and saves actor-private structured authorization',async()=>{
 let loaded,saved;const f=await fixture('StoryDocuments',{view,close(){},actions:{load(key,targetId){loaded={key,targetId};return {ok:true,data:{definition:{...view.documents[0],content:'[]'}}};},save(key,definition){saved={key,definition};return {ok:true,data:{acknowledged:false,message:'SillyTavern save is unconfirmed.'}};}}});
 try{assert.equal(f.host.querySelector('[aria-label="Initial template"]').value,'');input(f.host,'Workflow data document','mara.json','change');button(f.host,'Load initial template').click();await tick();flushSync();assert.deepEqual(loaded,{key:'scope-key',targetId:'mara.json'});assert.equal(f.host.querySelector('[aria-label="Initial template"]').value,'[]');assert.equal(f.host.querySelector('[aria-label="Actor ID"]').value,'mara');input(f.host,'Document name','Mara archive');button(f.host,'Save authorization').click();await tick();flushSync();assert.equal(saved.definition.visibility.actorId,'mara');assert.equal(saved.definition.targetId,'mara.json');assert.match(f.host.textContent,/unconfirmed/);assert.match(f.host.textContent,/canonical.*content/i);}finally{await f.close();}
});

test('real configuration dialog selects authorized target, passes explicit stage and isolates Escape',async()=>{
 let applied,cancelled,escaped=0;const f=await fixture('ConfigureNode',{view:{key:'edit',title:'Read File',operation:'read-file',controls:'{"targetId":""}',phase:'post',phaseLocked:false,targets:[{targetId:'souls.json',name:'Souls',format:'json'}],helpers:[]},actions:{apply(key,controls,phase){applied={key,controls:JSON.parse(controls),phase};return {ok:false,error:{code:'STALE_CONTEXT',message:'The graph changed.'}};},cancel(key){cancelled=key;}}});const listener=()=>escaped++;document.addEventListener('keydown',listener);
 try{input(f.host,'Workflow data document','souls.json','change');button(f.host,'Create node').click();await tick();flushSync();assert.deepEqual(applied,{key:'edit',controls:{targetId:'souls.json'},phase:'post'});const diagnostic=f.host.querySelector('[data-diagnostic]');assert.equal(diagnostic?.dataset.severity,'error');assert.match(diagnostic.textContent,/view or selection changed/i);assert.match(diagnostic.querySelector('details').textContent,/STALE_CONTEXT/);assert.equal(diagnostic.querySelector('details').open,false);f.host.querySelector('[aria-label="Node stage"]').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(cancelled,'edit');assert.equal(escaped,0);}finally{document.removeEventListener('keydown',listener);await f.close();}
});

test('Workbench exposes Workflow Data setup through Configure and traps panel Escape',async()=>{
 let refreshed=0,escaped=0;const f=await fixture('Workbench',{actions:{storyDocuments:{refresh(){refreshed++;}}}});const listener=()=>escaped++;document.addEventListener('keydown',listener);
 try{f.mounted.update({storyDocuments:view});flushSync();button(f.host,'Workflow').click();await tick();flushSync();button(f.host,'Configure').click();await tick();flushSync();button(f.host,'Workflow Data…').click();await tick();flushSync();assert.equal(refreshed,1);assert.ok(f.host.querySelector('[role="dialog"][aria-label="Workflow Data"]'));f.host.querySelector('[aria-label="Document name"]').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));flushSync();await tick();assert.equal(escaped,0);assert.equal(f.host.querySelector('[aria-label="Initial template"]'),null);}finally{document.removeEventListener('keydown',listener);await f.close();}
});

test('Outcome Commit dialog offers actual JSON ledger targets and keeps its response stage locked',async()=>{
 let applied;const f=await fixture('ConfigureNode',{view:{key:'outcome-edit',title:'Outcome Commit',operation:'commit-outcomes',controls:'{"targetId":""}',phase:'post',phaseLocked:true,targets:[{targetId:'outcomes.json',name:'Outcomes',format:'json'},{targetId:'notes.txt',name:'Notes',format:'text'}],helpers:[]},actions:{apply(key,controls,phase){applied={key,controls:JSON.parse(controls),phase};return {ok:true};},cancel(){}}});
 try{const selected=f.host.querySelector('[aria-label="Workflow data document"]');assert.ok(selected);assert.deepEqual([...selected.options].map(option=>option.value),['','outcomes.json']);assert.equal(f.host.querySelector('[aria-label="Node stage"]').disabled,true);input(f.host,'Workflow data document','outcomes.json','change');button(f.host,'Create node').click();await tick();flushSync();assert.deepEqual(applied,{key:'outcome-edit',controls:{targetId:'outcomes.json'},phase:'post'});}finally{await f.close();}
});

test('shared friendly creation stores numeric JSON text once and matches editing', async () => {
 const {projectNodeControls}=await import('../src/ui/node-control-projection.js');
 const {createConfiguredNodeSession}=await import('../src/ui/configured-node-creation.js');
 const {prepareNativeConnectionEdit}=await import('../src/workflow/connection-edits.js');
 const graph={id:'shared-forms',schema:3,runtime:2,mode:'native-unified',nodes:{},wires:{},definitions:{}};
 let prepares=0,workflowRuns=0;
 const session=createConfiguredNodeSession({isCurrent:()=>true,prepare:(_capture,command)=>{prepares++;return prepareNativeConnectionEdit(graph,{kind:'create',...command,graphPoint:{x:0,y:0}});}});
 const opened=session.open({}, {operation:'collection',controls:{mode:'threshold'}},{phase:'post',targets:[],helpers:[]});
 const creation=await fixture('ConfigureNode',{view:opened.view,actions:{apply:(...args)=>session.apply(...args),cancel:key=>session.cancel(key)}});
 try {
  input(creation.host,'Thresholds','1,2,3');
  button(creation.host,'Create node').click();await tick();flushSync();
  assert.equal(creation.host.querySelector('[data-diagnostic]'),null,creation.host.textContent);
  const result=await opened.result;assert.equal(result.ok,true,JSON.stringify(result));
  const createdNode=result.data.candidate.nodes[result.data.addedNodeIds[0]];
  assert.equal(createdNode.thresholds,'[1,2,3]');assert.deepEqual(JSON.parse(createdNode.thresholds),[1,2,3]);
  let editedNode;
  const control=projectNodeControls('collection',createdNode,{phase:'post'}).find(control=>control.key==='thresholds');
  const editing=await fixture('NodeDetails',{view:{selectionKey:'collection',revision:'1',address:{workflowId:graph.id,instancePath:[],nodeId:createdNode.id},title:'Collection',canonicalTitle:'Collection',iconPath:'',family:'Data',phase:'post',alias:'',compact:false,enabled:true,readOnly:false,canPresent:true,controls:[control],model:null,ports:[]},actions:{editControl(_selection,key,value){editedNode={...createdNode,[key]:value};return {ok:true};}}});
  try {input(editing.host,'Thresholds','1,2,3');button(editing.host,'Save Thresholds').click();await tick();flushSync();assert.equal(editedNode.thresholds,createdNode.thresholds);}finally{await editing.close();}
  assert.equal(prepares,1);assert.equal(workflowRuns,0);
 }finally{session.cancel(opened.view.key);await creation.close();}
});

test('friendly creation retains invalid drafts across Advanced JSON and honors a corrected advanced value', async () => {
 const {createConfiguredNodeSession}=await import('../src/ui/configured-node-creation.js');
 let prepared;
 const session=createConfiguredNodeSession({isCurrent:()=>true,prepare:(_capture,command)=>{prepared=command;return {ok:true,data:command};}});
 const opened=session.open({}, {operation:'collection',controls:{mode:'threshold'}},{phase:'post',targets:[],helpers:[]});
 const f=await fixture('ConfigureNode',{view:opened.view,actions:{apply:(...args)=>session.apply(...args),cancel:key=>session.cancel(key)}});
 try {
  input(f.host,'Thresholds','[unfinished');button(f.host,'Create node').click();await tick();flushSync();assert.equal(prepared,undefined);assert.equal(f.host.querySelector('[aria-label="Thresholds"]').value,'[unfinished');
  button(f.host,'Advanced JSON').click();flushSync();button(f.host,'Use form').click();flushSync();assert.equal(f.host.querySelector('[aria-label="Thresholds"]').value,'[unfinished');
  button(f.host,'Advanced JSON').click();flushSync();const raw=JSON.parse(f.host.querySelector('[aria-label="Node controls JSON"]').value);raw.thresholds='[1,2,3]';input(f.host,'Node controls JSON',JSON.stringify(raw));button(f.host,'Use form').click();flushSync();
  assert.equal(f.host.querySelector('[aria-label="Thresholds"]').value,'[1,2,3]');button(f.host,'Create node').click();await tick();flushSync();assert.equal(prepared.controls.thresholds,'[1,2,3]');
 }finally{session.cancel(opened.view.key);await opened.result;await f.close();}
});

test('creation discards incompatible Pattern mode drafts before returning to their old mode', async () => {
 const {createConfiguredNodeSession}=await import('../src/ui/configured-node-creation.js');
 const session=createConfiguredNodeSession({isCurrent:()=>true,prepare:(_capture,command)=>({ok:true,data:command})});
 const opened=session.open({}, {operation:'pattern'},{phase:'post',targets:[],helpers:[]});
 const f=await fixture('ConfigureNode',{view:opened.view,actions:{apply:(...args)=>session.apply(...args),cancel:key=>session.cancel(key)}});
 try {input(f.host,'Rules','{unfinished');f.host.querySelector('[aria-label="regex"]').click();flushSync();assert.equal(f.host.querySelector('[aria-label="Rules"]').value,'[]');f.host.querySelector('[aria-label="literal"]').click();flushSync();assert.equal(f.host.querySelector('[aria-label="Rules"]').value,'[]');}
 finally{session.cancel(opened.view.key);await opened.result;await f.close();}
});

test('friendly schema and whole-controls Advanced JSON preserve the same nested JSON-text settings', async () => {
 const {createConfiguredNodeSession}=await import('../src/ui/configured-node-creation.js');
 const schema='{"type":"object","properties":{"nested":{"type":"object","properties":{"enabled":{"type":"boolean"}}}}}';
 const made=[];
 for(const advanced of [false,true]) {
  const session=createConfiguredNodeSession({isCurrent:()=>true,prepare:(_capture,command)=>{made.push(command.controls);return {ok:true,data:command};}});
  const opened=session.open({}, {operation:'json-decode'},{phase:'pre',targets:[],helpers:[]});
  const f=await fixture('ConfigureNode',{view:opened.view,actions:{apply:(...args)=>session.apply(...args),cancel:key=>session.cancel(key)}});
  try {if(advanced){button(f.host,'Advanced JSON').click();flushSync();input(f.host,'Node controls JSON',JSON.stringify({...JSON.parse(opened.view.controls),schema}));}else input(f.host,'Schema',schema);
   button(f.host,'Create node').click();await tick();flushSync();assert.equal(f.host.querySelector('[data-diagnostic]'),null,f.host.textContent);assert.equal((await opened.result).ok,true);
  }finally {session.cancel(opened.view.key);await f.close();}
 }
 assert.equal(made[0].schema,schema);assert.deepEqual(JSON.parse(made[0].schema),{type:'object',properties:{nested:{type:'object',properties:{enabled:{type:'boolean'}}}}});assert.deepEqual(made[1],made[0]);
});

test('saving an existing multi-segment path retains its typed segments', async () => {
 const {projectNodeControls}=await import('../src/ui/node-control-projection.js');
 const control=projectNodeControls('collection',{identityPath:['actor','items']},{phase:'post'}).find(control=>control.key==='identityPath');
 let saved;
 const f=await fixture('NodeDetails',{view:{selectionKey:'path',revision:'1',address:{workflowId:'paths',instancePath:[],nodeId:'collection'},title:'Collection',canonicalTitle:'Collection',iconPath:'',family:'Data',phase:'post',alias:'',compact:false,enabled:true,readOnly:false,canPresent:true,controls:[control],model:null,ports:[]},actions:{editControl(_selection,_key,value){saved=value;return {ok:true};}}});
 try{button(f.host,'Save Identity path').click();await tick();flushSync();assert.deepEqual(saved,['actor','items']);}finally{await f.close();}
});
