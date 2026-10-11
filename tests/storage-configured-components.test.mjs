import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {JSDOM} from 'jsdom';
import {pathToFileURL} from 'node:url';
import {compiled} from './helpers/svelte-compile.mjs';
import {projectNodeControls} from '../src/ui/node-control-projection.js';
const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true});globalThis.window=dom.window;globalThis.document=dom.window.document;
for(const key of ['Node','Element','Text','Comment','Document','HTMLElement','HTMLMediaElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
const {mount,unmount,flushSync,tick}=await import(new URL('../node_modules/svelte/src/index-client.js',import.meta.url).href);
async function fixture(name,props,reactive=false){const directory=await mkdtemp(join(tmpdir(),'lattice-storage-ui-')),host=document.createElement('div');document.body.append(host);let mounted;const close=async()=>{if(mounted)await unmount(mounted);host.remove();const rel=relative(resolve(tmpdir()),resolve(directory));assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(directory,{recursive:true,force:true});};try{let leaf;try{leaf=await compiled(name,directory);}catch(error){assert.fail(name+' component must compile: '+error.message);}if(reactive){const harness=await compiled('TypedDraftHarness',directory,`<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)};let {initial,actions}=$props();let view=$state.raw(initial);export function update(next){view=next;}</script><Leaf {view} {actions}/>`);mounted=mount(harness.component,{target:host,props:{initial:props.view,actions:props.actions}});}else mounted=mount(leaf.component,{target:host,props});flushSync();await tick();return {host,mounted,close};}catch(error){await close();throw error;}}
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
 try {f.host.querySelector('[aria-label="Edit Rules as JSON"]').click();flushSync();input(f.host,'Rules','{unfinished');f.host.querySelector('[aria-label="regex"]').click();flushSync();assert.equal(f.host.querySelector('[aria-label="Rules"]').value,'[]');f.host.querySelector('[aria-label="literal"]').click();flushSync();assert.equal(f.host.querySelector('[aria-label="Rules"]').value,'[]');}
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
  try {if(advanced){button(f.host,'Advanced JSON').click();flushSync();input(f.host,'Node controls JSON',JSON.stringify({...JSON.parse(opened.view.controls),schema}));}else {const enabled=f.host.querySelector('[aria-label="Schema schema enabled"]');enabled.checked=true;enabled.dispatchEvent(new dom.window.Event('change',{bubbles:true}));flushSync();button(f.host,'Edit Schema schema as JSON').click();flushSync();input(f.host,'Schema schema JSON',schema);}
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

test('both shared forms preserve literal commas quotes newlines and brackets on unchanged and neighboring-entry Saves', async () => {
 const {projectNodeControls}=await import('../src/ui/node-control-projection.js');
 const {createConfiguredNodeSession}=await import('../src/ui/configured-node-creation.js');
 const literals=['red, blue','say "hello"','line\nbreak','[chapter]'];
 for(const creation of [false,true])for(const editNeighbor of [false,true]){
  let saved,session,opened;
  const control=projectNodeControls('pattern',{protectedLiterals:literals},{phase:'post'}).find(control=>control.key==='protectedLiterals');
  let props,name;
  if(creation){session=createConfiguredNodeSession({isCurrent:()=>true,prepare:(_capture,command)=>{saved=command.controls.protectedLiterals;return {ok:true,data:command};}});opened=session.open({}, {operation:'pattern',controls:{protectedLiterals:literals}},{phase:'post',targets:[],helpers:[]});props={view:opened.view,actions:{apply:(...args)=>session.apply(...args),cancel:key=>session.cancel(key)}};name='ConfigureNode';}
  else {props={view:{selectionKey:'literals',revision:'1',address:{workflowId:'literal-list',instancePath:[],nodeId:'pattern'},title:'Pattern',canonicalTitle:'Pattern',iconPath:'',family:'Surface',phase:'post',alias:'',compact:false,enabled:true,readOnly:false,canPresent:true,controls:[control],model:null,ports:[]},actions:{editControl(_selection,_key,value){saved=value;return {ok:true};}}};name='NodeDetails';}
  const f=await fixture(name,props);
  try{
   if(!creation){f.host.querySelector('[data-control-group="Protections"] summary').click();await tick();flushSync();}
   const text=f.host.querySelector('[aria-label="Protected literals"]').value;
   if(editNeighbor)input(f.host,'Protected literals',text+',neighbor');
   button(f.host,creation?'Create node':'Save Protected literals').click();await tick();flushSync();
   assert.deepEqual(saved,editNeighbor?[...literals,'neighbor']:literals,(creation?'creation':'editing')+' round trip');
  }finally{if(session){session.cancel(opened.view.key);await opened.result;}await f.close();}
 }
});

test('target and exact helper pickers merge current Advanced JSON without replacing other edits', async () => {
 for(const operation of ['read-file','for-each']){
  const first={id:'first',version:1,semanticHash:'a'.repeat(64)},second={id:'second',version:2,semanticHash:'b'.repeat(64)};
  const initial=operation==='read-file'?{targetId:'first.json',format:'json',schema:''}:{mode:'map',helper:first,roleOverrides:{},requestBoundPerIteration:1};
  let submitted;
  const f=await fixture('ConfigureNode',{view:{key:'advanced-'+operation,title:operation,operation,controls:JSON.stringify(initial),phase:'pre',phaseLocked:false,targets:[{targetId:'first.json',name:'First',format:'json'},{targetId:'second.json',name:'Second',format:'json'}],helpers:[{key:'first',label:'First',ref:first,stateful:false},{key:'second',label:'Second',ref:second,stateful:false}]},actions:{apply(_key,text){submitted=JSON.parse(text);return {ok:true};},cancel(){}}});
  try{
   button(f.host,'Advanced JSON').click();flushSync();
   const edited=operation==='read-file'?{...initial,schema:'{"type":"object"}'}:{...initial,roleOverrides:{reader:{profileId:'custom'}},requestBoundPerIteration:3};
   input(f.host,'Node controls JSON',JSON.stringify(edited));input(f.host,operation==='read-file'?'Workflow data document':'Pinned Data helper',operation==='read-file'?'second.json':'second','change');
   button(f.host,'Create node').click();await tick();flushSync();
   assert.deepEqual(submitted,operation==='read-file'?{...edited,targetId:'second.json'}:{...edited,helper:second});
  }finally{await f.close();}
 }
});

test('target and helper selection leave invalid Advanced JSON and current selections intact', async () => {
 for(const operation of ['read-file','for-each']){
  const first={id:'first',version:1,semanticHash:'a'.repeat(64)},second={id:'second',version:2,semanticHash:'b'.repeat(64)};
  const controls=operation==='read-file'?{targetId:'first.json',format:'json',schema:''}:{mode:'map',helper:first,roleOverrides:{},requestBoundPerIteration:1};
  let applies=0;
  const f=await fixture('ConfigureNode',{view:{key:'invalid-'+operation,title:operation,operation,controls:JSON.stringify(controls),phase:'pre',phaseLocked:false,targets:[{targetId:'first.json',name:'First',format:'json'},{targetId:'second.json',name:'Second',format:'json'}],helpers:[{key:'first',label:'First',ref:first,stateful:false},{key:'second',label:'Second',ref:second,stateful:false}]},actions:{apply(){applies++;return {ok:true};},cancel(){}}});
  try{
   button(f.host,'Advanced JSON').click();flushSync();const invalid='{"unfinished":';input(f.host,'Node controls JSON',invalid);
   const picker=operation==='read-file'?'Workflow data document':'Pinned Data helper';input(f.host,picker,operation==='read-file'?'second.json':'second','change');
   assert.equal(f.host.querySelector('[aria-label="Node controls JSON"]').value,invalid);assert.equal(f.host.querySelector('[aria-label="'+picker+'"]').value,operation==='read-file'?'first.json':'first');assert.match(f.host.textContent,/JSON object/);assert.equal(applies,0);
   button(f.host,'Use form').click();flushSync();assert.equal(f.host.querySelector('[aria-label="Node controls JSON"]').value,invalid);
  }finally{await f.close();}
 }
});


test('creation helper binding selectors keep sparse values and unrelated advanced overrides',async()=>{
 const ref={id:'helper',version:1,semanticHash:'sha256:'+'a'.repeat(64)},modes=[{value:'inherit',label:'Use helper model'},{value:'override',label:'Override'},{value:'block',label:'Use profile model'}];
 const role={role:'decision',label:'Decision',profile:{mode:'inherit',value:null,allowedModes:modes.slice(0,2),options:[{value:'chosen',label:'Chosen connection'}]},model:{mode:'inherit',value:null,allowedModes:modes},effective:'Inherited',source:'Helper'};
 let submitted;const f=await fixture('ConfigureNode',{view:{key:'bindings',title:'For Each',operation:'for-each',controls:JSON.stringify({helper:ref,mode:'map',roleOverrides:{other:{model:'keep'}}}),phase:'pre',phaseLocked:false,targets:[],helpers:[{key:'exact',label:'Pinned',ref,stateful:false,bindings:{helperKey:'exact',roles:[role]}}]},actions:{apply(_key,text){submitted=JSON.parse(text);return {ok:true};},cancel(){}}});
 try{
  input(f.host,'decision connection profile','chosen','change');input(f.host,'decision model mode','override','change');input(f.host,'decision model identifier','authored-model');
  button(f.host,'Create node').click();await tick();flushSync();
  assert.deepEqual(submitted.helper,ref);assert.deepEqual(submitted.roleOverrides,{other:{model:'keep'},decision:{profileId:'chosen',model:'authored-model'}});
  button(f.host,'Advanced JSON').click();flushSync();const raw=f.host.querySelector('[aria-label="Node controls JSON"]');input(f.host,'Node controls JSON',JSON.stringify({...submitted,roleOverrides:{other:{model:'advanced'}}}));input(f.host,'decision connection profile','chosen','change');
  assert.deepEqual(JSON.parse(raw.value).roleOverrides,{other:{model:'advanced'},decision:{profileId:'chosen',model:null}});
 }finally{await f.close();}
});

test('editing renders exact pinned helper choices with a preserved Advanced JSON alternative',async()=>{
 const {projectNodeControls}=await import('../src/ui/node-control-projection.js');
 const first={id:'first',version:1,semanticHash:'sha256:'+'a'.repeat(64)},second={id:'second',version:2,semanticHash:'sha256:'+'b'.repeat(64)};
 const control={...projectNodeControls('for-each',{helper:first},{phase:'pre'}).find(control=>control.key==='helper'),helperChoices:[{key:'first',label:'First v1',ref:first,stateful:false},{key:'second',label:'Second v2',ref:second,stateful:false}]};
 let submitted;const f=await fixture('NodeDetails',{view:{selectionKey:'each',revision:'1',address:{workflowId:'root',instancePath:[],nodeId:'each'},title:'For Each',canonicalTitle:'For Each',iconPath:'',family:'Control',phase:'pre',operation:'for-each',alias:'',compact:false,enabled:true,readOnly:false,canPresent:true,controls:[control],model:null,ports:[]},actions:{editControl(_selection,key,value){submitted={key,value};return {ok:true};}}});
 try{input(f.host,'Pinned Data helper','second','change');await tick();flushSync();assert.deepEqual(submitted,{key:'helper',value:second});assert.ok(f.host.querySelector('textarea[aria-label="Helper"]'));}
 finally{await f.close();}
});


test('Pattern terms mode compiles friendly drafts through the shared creation and editing Save path',async()=>{
 const {projectNodeControls}=await import('../src/ui/node-control-projection.js');
 for(const creation of [true,false]){
  let submitted;const control=projectNodeControls('pattern',{}, {phase:'post'}).find(control=>control.key==='rules');
  const props=creation?{view:{key:'terms-pattern',operation:'pattern',title:'Pattern',controls:'{}',phase:'post',phaseLocked:false,targets:[],helpers:[]},actions:{apply(_key,text){submitted=JSON.parse(text).rules;return {ok:true};},cancel(){}}}:{view:{selectionKey:'pattern',revision:'1',address:{workflowId:'root',instancePath:[],nodeId:'pattern'},title:'Pattern',canonicalTitle:'Pattern',iconPath:'',family:'Data',phase:'post',alias:'',compact:false,enabled:true,readOnly:false,canPresent:true,controls:[control],model:null,ports:[]},actions:{editControl(_selection,_key,value){submitted=value;return {ok:true};}}};
  const f=await fixture(creation?'ConfigureNode':'NodeDetails',props);
  try{const label=control.label,terms=button(f.host,'Use '+label+' terms');assert.ok(terms,f.host.textContent);terms.click();flushSync();input(f.host,label,'though,"red, blue"');button(f.host,creation?'Create node':'Save '+label).click();await tick();flushSync();assert.deepEqual(submitted,[{id:'pattern-1',pattern:'though'},{id:'pattern-2',pattern:'red, blue'}]);}
  finally{await f.close();}
 }
});


function patternTransitionProps(creation,mode,rows,save,response={ok:true}){
 const control=projectNodeControls('pattern',{mode,rules:rows},{phase:'post'}).find(row=>row.key==='rules');
 return creation?{view:{key:'pattern-transition',operation:'pattern',title:'Pattern',controls:JSON.stringify({mode,rules:rows}),phase:'post',phaseLocked:false,targets:[],helpers:[]},actions:{apply(_key,text){save(JSON.parse(text).rules);return response;},cancel(){}}}:{view:{selectionKey:'pattern-transition',revision:'1',address:{workflowId:'root',instancePath:[],nodeId:'pattern'},title:'Pattern',canonicalTitle:'Pattern',iconPath:'',family:'Data',phase:'post',alias:'',compact:false,enabled:true,readOnly:false,canPresent:true,controls:[control],model:null,ports:[]},actions:{editControl(_selection,_key,value){save(value);return response;}}};
}
test('regex row terms row view switches retain exact expressions IDs and callback candidates',async()=>{
 for(const creation of [false,true])for(const rows of [[{id:'custom',pattern:'a{1,3}',label:'Keep'},{id:'pattern-2',pattern:'[a,b]\\s+'}],[{id:'pattern-1',pattern:'a{1,3}'}]]){
  const saves=[];
  const f=await fixture(creation?'ConfigureNode':'NodeDetails',patternTransitionProps(creation,'regex',rows,value=>saves.push(value)));
  try{button(f.host,'Use Rules terms').click();flushSync();assert.ok(f.host.querySelector('[data-control-items]').textContent.startsWith(rows.length+' entries'));button(f.host,'Use Rules rows').click();flushSync();assert.equal(f.host.querySelector('[aria-label="Pattern 1 expression"]').value,'a{1,3}');button(f.host,creation?'Create node':'Save Rules').click();await tick();flushSync();assert.deepEqual(saves,[rows]);}
  finally{await f.close();}
 }
});
test('typed row metadata survives terms format dropdowns and rejected malformed text in both parents',async()=>{
 for(const creation of [false,true])for(const requested of ['csv','json','auto']){
  const rows=[{id:'pattern-1',pattern:'old',label:'original'}],saves=[];
  const f=await fixture(creation?'ConfigureNode':'NodeDetails',patternTransitionProps(creation,'literal',rows,value=>saves.push(value)));
  try{
   input(f.host,'Pattern 1 label','edited label');button(f.host,'Use Rules terms').click();flushSync();input(f.host,'Rules input format',requested,'change');
   assert.notEqual(f.host.querySelector('[aria-label="Rules"]').value,'');button(f.host,creation?'Create node':'Save Rules').click();await tick();flushSync();assert.deepEqual(saves,[[{...rows[0],label:'edited label'}]]);
   input(f.host,'Rules input format','json','change');input(f.host,'Rules','[{"id":');button(f.host,'Use Rules rows').click();flushSync();assert.equal(f.host.querySelector('[aria-label="Rules"]').value,'[{"id":');button(f.host,creation?'Create node':'Save Rules').click();await tick();flushSync();assert.equal(saves.length,1);
   input(f.host,'Rules input format','csv','change');assert.equal(f.host.querySelector('[aria-label="Rules"]').value,'[{"id":');input(f.host,'Rules input format','json','change');button(f.host,creation?'Create node':'Save Rules').click();await tick();flushSync();assert.equal(saves.length,1);
  }finally{await f.close();}
 }
});
test('helper selectors merge the current field override draft and retain invalid draft text on rejection',async()=>{
 const ref={id:'helper',version:1,semanticHash:'sha256:'+'a'.repeat(64)},modes=[{value:'inherit',label:'Use helper model'},{value:'override',label:'Override'},{value:'block',label:'Use profile model'}],role={role:'decision',label:'Decision',profile:{mode:'inherit',value:null,allowedModes:modes.slice(0,2),options:[{value:'chosen',label:'Chosen connection'}]},model:{mode:'inherit',value:null,allowedModes:modes},effective:'Inherited',source:'Helper'},saves=[];
 const f=await fixture('ConfigureNode',{view:{key:'binding-drafts',operation:'for-each',title:'For Each',controls:JSON.stringify({helper:ref,mode:'map',roleOverrides:{saved:{model:'old'}}}),phase:'pre',phaseLocked:false,targets:[],helpers:[{key:'exact',label:'Pinned',ref,stateful:false,bindings:{helperKey:'exact',roles:[role]}}]},actions:{apply(_key,text){saves.push(JSON.parse(text));return {ok:true};},cancel(){}}});
 try{
  input(f.host,'Role overrides','{"other":{"model":"draft"}}');input(f.host,'decision connection profile','chosen','change');button(f.host,'Create node').click();await tick();flushSync();assert.deepEqual(saves[0].roleOverrides,{other:{model:'draft'},decision:{profileId:'chosen',model:null}});
  const invalid=' {"unfinished":';input(f.host,'Role overrides',invalid);input(f.host,'decision connection profile','','change');assert.equal(f.host.querySelector('[aria-label="Role overrides"]').value,invalid);assert.equal(f.host.querySelector('[aria-label="decision connection profile"]').value,'chosen');assert.match(f.host.textContent,/Repair|valid|Check/);button(f.host,'Create node').click();await tick();flushSync();assert.equal(saves.length,1);
  input(f.host,'Role overrides','{"other":{"model":"repaired"}}');input(f.host,'decision connection profile','chosen','change');button(f.host,'Create node').click();await tick();flushSync();assert.deepEqual(saves[1].roleOverrides,{other:{model:'repaired'},decision:{profileId:'chosen',model:null}});
 }finally{await f.close();}
});


test('a rejected valid Save retains the typed candidate through further terms format changes',async()=>{
 for(const creation of [false,true]){
  const rows=[{id:'authored',pattern:'old',label:'original'}],expected=[{...rows[0],label:'edited'}],saves=[];
  const f=await fixture(creation?'ConfigureNode':'NodeDetails',patternTransitionProps(creation,'literal',rows,value=>saves.push(value),{ok:false,error:{code:'CONTROL_REJECTED',message:'Review this candidate.'}}));
  try{input(f.host,'Pattern 1 label','edited');button(f.host,'Use Rules terms').click();flushSync();button(f.host,creation?'Create node':'Save Rules').click();await tick();flushSync();assert.deepEqual(saves,[expected]);assert.match(f.host.textContent,/CONTROL_REJECTED/);input(f.host,'Rules input format','csv','change');assert.notEqual(f.host.querySelector('[aria-label="Rules"]').value,'');button(f.host,creation?'Create node':'Save Rules').click();await tick();flushSync();assert.deepEqual(saves,[expected,expected]);}
  finally{await f.close();}
 }
});

test('Condition typed comparison uses the same Save candidate for creation and editing through every JSON type', async () => {
 for (const creation of [false,true]) {
  const saves=[],control=projectNodeControls('condition',{value:null},{phase:'pre'}).find(control=>control.key==='value');
  const props=creation?{view:{key:'typed-condition',operation:'condition',title:'Condition',controls:'{"value":null}',phase:'pre',phaseLocked:false,targets:[],helpers:[]},actions:{apply(_key,text){saves.push(JSON.parse(text).value);return {ok:false,error:{code:'RETAIN',message:'Keep editing'}};},cancel(){}}}:{view:{selectionKey:'typed-condition',revision:'1',address:{workflowId:'root',instancePath:[],nodeId:'condition'},title:'Condition',canonicalTitle:'Condition',iconPath:'',family:'Control',phase:'pre',alias:'',compact:false,enabled:true,readOnly:false,canPresent:true,controls:[control],model:null,ports:[]},actions:{editControl(_selection,key,value){assert.equal(key,'value');saves.push(value);return {ok:false,error:{code:'RETAIN',message:'Keep editing'}};}}};
  const f=await fixture(creation?'ConfigureNode':'NodeDetails',props);
  try {
   assert.equal(f.host.querySelector('[aria-label="Value type"]')?.value,'null');
   for (const [type,value] of [['object',{}],['array',[]],['number',0],['boolean',false],['string',''],['null',null]]) {
    input(f.host,'Value type',type,'change');button(f.host,creation?'Create node':'Save Value').click();await tick();flushSync();assert.deepEqual(saves.at(-1),value);assert.ok(f.host.querySelector('[aria-label="Value type"]'));
   }
   assert.deepEqual(saves,[{},[],0,false,'',null]);
  } finally {await f.close();}
 }
});

test('creation preserves unfinished typed comparisons across whole-form view remounts and unrelated edits', async () => {
 const saves=[],f=await fixture('ConfigureNode',{view:{key:'invalid-typed-condition',operation:'condition',title:'Condition',controls:'{"value":0}',phase:'pre',phaseLocked:false,targets:[],helpers:[]},actions:{apply(_key,text){saves.push(JSON.parse(text));return {ok:true};},cancel(){}}});
 try {
  input(f.host,'Value number','-');assert.equal(f.host.querySelector('[aria-label="Value JSON"]').value,'-');
  input(f.host,'Operator','not-equals','change');assert.equal(f.host.querySelector('[aria-label="Value JSON"]').value,'-');
  button(f.host,'Create node').click();await tick();flushSync();assert.equal(saves.length,0);
  button(f.host,'Configuration format').click();flushSync();
  const raw=f.host.querySelector('[aria-label="Node controls JSON"]');assert.ok(raw);assert.match(raw.value,/"value":\s*-/);
  button(f.host,'Create node').click();await tick();flushSync();assert.equal(saves.length,0,'Invalid source cannot submit an older canonical comparison');
  input(f.host,'Node controls JSON','{"value":null,"operator":"not-equals"}');button(f.host,'Configuration format').click();flushSync();
  assert.equal(f.host.querySelector('[aria-label="Value type"]').value,'null');
  button(f.host,'Create node').click();await tick();flushSync();assert.deepEqual(saves,[{value:null,operator:'not-equals'}]);
 } finally {await f.close();}
});


const typedDetails=(operation,settings,extra={})=>({selectionKey:'typed-'+operation,revision:'1',address:{workflowId:'typed-root',instancePath:[],nodeId:operation},title:operation,canonicalTitle:operation,iconPath:'',family:'Control',phase:'pre',alias:'',compact:false,enabled:true,readOnly:false,canPresent:true,controls:projectNodeControls(operation,settings,{phase:'pre'}),model:null,ports:[],...extra});

test('unfinished nested Condition value survives unrelated edit, revision, selection removal and view remount',async()=>{
 const settings={value:JSON.parse('{"a.b":{"__proto__":0},"red, blue":false}'),operator:'equals'},saves=[];
 const initial=typedDetails('condition',settings),f=await fixture('NodeDetails',{view:initial,actions:{editControl(_selection,key,value){saves.push({key,value});return {ok:true};}}},true);
 try{
  button(f.host,'Edit Value key a.b').click();flushSync();button(f.host,'Edit Value key __proto__').click();flushSync();input(f.host,'Value number','1e');
  const unfinished=f.host.querySelector('[aria-label="Value JSON"]').value;assert.equal(unfinished,'{"a.b":{"__proto__":1e},"red, blue":false}');
  button(f.host,'Save Value').click();await tick();flushSync();assert.equal(saves.length,0);
  input(f.host,'Operator','not-equals','change');await tick();flushSync();assert.deepEqual(saves,[{key:'operator',value:'not-equals'}]);assert.equal(f.host.querySelector('[aria-label="Value JSON"]').value,unfinished);
  const next=typedDetails('condition',{...settings,operator:'not-equals'},{revision:'2'});f.mounted.update(next);flushSync();f.mounted.update(null);flushSync();f.mounted.update(next);flushSync();
  assert.equal(f.host.querySelector('[aria-label="Value JSON"]').value,unfinished);button(f.host,'Save Value').click();await tick();flushSync();assert.equal(saves.length,1);
  const repaired=JSON.parse('{"a.b":{"__proto__":0},"red, blue":false}');input(f.host,'Value JSON',JSON.stringify(repaired));button(f.host,'Save Value').click();await tick();flushSync();assert.deepEqual(saves[1],{key:'value',value:repaired});assert.equal(Object.hasOwn(saves[1].value['a.b'],'__proto__'),true);assert.equal({}.polluted,undefined);
 }finally{await f.close();}
});

test('both shared parents save typed mapping paths and distinguish omitted defaults from explicit null',async()=>{
 for(const creation of [false,true]){
  const saves=[],fields=[{name:'literal',path:['a.b','red, blue','__proto__','0'],required:false}],props=creation?{view:{key:'typed-fields',operation:'select-fields',title:'Select Fields',controls:JSON.stringify({fields}),phase:'pre',phaseLocked:false,targets:[],helpers:[]},actions:{apply(_key,text){saves.push(JSON.parse(text).fields);return {ok:false,error:{code:'RETAIN',message:'Keep editing'}};},cancel(){}}}:{view:typedDetails('select-fields',{fields}),actions:{editControl(_selection,key,value){assert.equal(key,'fields');saves.push(value);return {ok:false,error:{code:'RETAIN',message:'Keep editing'}};}}};
  const f=await fixture(creation?'ConfigureNode':'NodeDetails',props);
  const save=async()=>{button(f.host,creation?'Create node':'Save Fields').click();await tick();flushSync();};
  try{
   assert.equal(f.host.querySelector('[aria-label="Field 1 default type"]'),null);await save();assert.equal(Object.hasOwn(saves[0][0],'default'),false);
   f.host.querySelector('[aria-label="Field 1 use default"]').click();flushSync();assert.equal(f.host.querySelector('[aria-label="Field 1 default type"]').value,'null');
   input(f.host,'Field 1 path segment 4 kind','index','change');input(f.host,'Field 1 path segment 4 index','0');button(f.host,'Move Field 1 path segment 4 up').click();flushSync();
   await save();assert.deepEqual(saves[1],[{...fields[0],path:['a.b','red, blue',0,'__proto__'],default:null}]);
   input(f.host,'Field 1 default type','object','change');input(f.host,'Field 1 default new key','__proto__');button(f.host,'Add Field 1 default property').click();flushSync();button(f.host,'Edit Field 1 default key __proto__').click();flushSync();input(f.host,'Field 1 default type','boolean','change');await save();
   assert.deepEqual(saves[2][0].default,JSON.parse('{"__proto__":false}'));assert.equal(typeof saves[2][0].default,'object');assert.equal({}.polluted,undefined);
   f.host.querySelector('[aria-label="Field 1 use default"]').click();flushSync();await save();assert.equal(Object.hasOwn(saves[3][0],'default'),false);
  }finally{await f.close();}
 }
});

test('string-only Condition and Collection path forms retain string zero and expose no index option',async()=>{
 for(const operation of ['condition','collection'])for(const creation of [false,true]){
  const key=operation==='condition'?'path':'identityPath',label=operation==='condition'?'Path':'Identity path',settings={[key]:['a.b','red, blue','__proto__','0']},saves=[];
  const props=creation?{view:{key:'literal-path-'+operation,operation,title:operation,controls:JSON.stringify(settings),phase:'pre',phaseLocked:false,targets:[],helpers:[]},actions:{apply(_key,text){saves.push(JSON.parse(text)[key]);return {ok:true};},cancel(){}}}:{view:typedDetails(operation,settings),actions:{editControl(_selection,_key,value){saves.push(value);return {ok:true};}}};
  const f=await fixture(creation?'ConfigureNode':'NodeDetails',props);
  try{assert.equal(f.host.querySelector('[aria-label="'+label+' segment 4 kind"]'),null);assert.equal(f.host.querySelector('[aria-label="Add '+label+' index"]'),null);assert.equal(f.host.querySelector('[aria-label="'+label+' segment 4 key"]').value,'0');button(f.host,'Move '+label+' segment 4 up').click();flushSync();button(f.host,creation?'Create node':'Save '+label).click();await tick();flushSync();assert.deepEqual(saves,[['a.b','red, blue','0','__proto__']]);}
  finally{await f.close();}
 }
});

test('real configured session and native creation retain typed own keys in Condition and mapping defaults',async()=>{
 const {createConfiguredNodeSession}=await import('../src/ui/configured-node-creation.js'),{prepareNativeConnectionEdit}=await import('../src/workflow/connection-edits.js');
 const graph={id:'semantic-forms',schema:3,runtime:2,mode:'native-unified',nodes:{},wires:{},definitions:{}};
 for(const operation of ['condition','select-fields','format']){
  const payload=JSON.parse('{"__proto__":{"a.b":[0,false,null,""]},"red, blue":{"constructor":{"prototype":"literal"}}}'),controls=operation==='condition'?{value:payload}:{fields:[{name:'chosen',path:['a.b',0],required:false,default:payload}]};
  const session=createConfiguredNodeSession({isCurrent:()=>true,prepare:(_capture,command)=>prepareNativeConnectionEdit(graph,{kind:'create',...command,graphPoint:{x:0,y:0}})}),opened=session.open({}, {operation,controls},{phase:'pre',targets:[],helpers:[]});
  const f=await fixture('ConfigureNode',{view:opened.view,actions:{apply:(...args)=>session.apply(...args),cancel:key=>session.cancel(key)}});
  try{button(f.host,'Create node').click();await tick();flushSync();assert.equal(f.host.querySelector('[data-diagnostic]'),null,f.host.textContent);const result=await opened.result;assert.equal(result.ok,true,JSON.stringify(result));const made=result.data.candidate.nodes[result.data.addedNodeIds[0]],actual=operation==='condition'?made.value:made.fields[0].default;assert.deepEqual(actual,payload);assert.equal(Object.hasOwn(actual,'__proto__'),true);assert.equal({}.polluted,undefined);}
  finally{session.cancel(opened.view.key);await f.close();}
 }
});


test('an unfinished sole numeric path segment remains invalid across parent view switches and cannot Save an empty path',async()=>{
 for(const creation of [false,true]){
  const fields=[{name:'item',path:[0]}],saves=[];
  const props=creation?{view:{key:'unfinished-index',operation:'select-fields',title:'Select Fields',controls:JSON.stringify({fields}),phase:'pre',phaseLocked:false,targets:[],helpers:[]},actions:{apply(_key,text){saves.push(JSON.parse(text));return {ok:true};},cancel(){}}}:{view:typedDetails('select-fields',{fields}),actions:{editControl(_selection,_key,value){saves.push(value);return {ok:true};}}};
  const f=await fixture(creation?'ConfigureNode':'NodeDetails',props,!creation);
  try{input(f.host,'Field 1 path segment 1 index','');button(f.host,creation?'Create node':'Save Fields').click();await tick();flushSync();assert.equal(saves.length,0);
   if(creation){button(f.host,'Configuration format').click();flushSync();button(f.host,'Create node').click();await tick();flushSync();assert.equal(saves.length,0);assert.match(f.host.querySelector('[aria-label="Node controls JSON"]').value,/\[,\]/);}
   else{f.mounted.update(null);flushSync();f.mounted.update(props.view);flushSync();assert.match(f.host.querySelector('[aria-label="Fields"]').value,/\[,\]/);button(f.host,'Save Fields').click();await tick();flushSync();assert.equal(saves.length,0);}
  }finally{await f.close();}
 }
});


test('I4 wrong-shape Path JSON stays editable and blocks both parents through remount and repair',async()=>{
 for(const creation of [false,true])for(const source of ['0','null','{"a.b":0}','"literal"']){
  const saves=[],settings={path:[]},props=creation?{view:{key:'invalid-path',operation:'condition',title:'Condition',controls:JSON.stringify(settings),phase:'pre',phaseLocked:false,targets:[],helpers:[]},actions:{apply(_key,text){saves.push(JSON.parse(text).path);return {ok:true};},cancel(){}}}:{view:typedDetails('condition',settings),actions:{editControl(_selection,key,value){assert.equal(key,'path');saves.push(value);return {ok:true};}}};
  const f=await fixture(creation?'ConfigureNode':'NodeDetails',props,!creation);
  try{button(f.host,'Edit Path as JSON').click();flushSync();assert.doesNotThrow(()=>input(f.host,'Path JSON',source));assert.equal(f.host.querySelector('[aria-label="Path JSON"]').value,source);button(f.host,creation?'Create node':'Save Path').click();await tick();flushSync();assert.equal(saves.length,0);
   if(creation){button(f.host,'Configuration format').click();flushSync();button(f.host,'Create node').click();await tick();flushSync();assert.equal(saves.length,0);button(f.host,'Configuration format').click();flushSync();}
   else{f.mounted.update(null);flushSync();f.mounted.update(props.view);flushSync();}
   assert.equal(f.host.querySelector('[aria-label="Path JSON"]').value,source);button(f.host,creation?'Create node':'Save Path').click();await tick();flushSync();assert.equal(saves.length,0);
   input(f.host,'Path JSON','["a.b","red, blue","__proto__","0"]');button(f.host,creation?'Create node':'Save Path').click();await tick();flushSync();assert.deepEqual(saves,[['a.b','red, blue','__proto__','0']]);
  }finally{await f.close();}
 }
});


test('I1 actual Node Details Save reaches controller-used native preparation with exact own-key payload',async()=>{
 const {prepareNativeNodeEdit}=await import('../src/workflow/definition-library.js');
 const graph={id:'native-save',schema:3,runtime:2,mode:'native-unified',nodes:{check:{id:'check',type:'workflow',operation:'condition',value:null}},wires:{},definitions:{}},payload=JSON.parse('{"__proto__":{"polluted":false},"a.b":[0,false,null,""]}');let prepared;
 const view=typedDetails('condition',{value:null},{address:{workflowId:graph.id,instancePath:[],nodeId:'check'}}),f=await fixture('NodeDetails',{view,actions:{editControl(selection,key,value){prepared=prepareNativeNodeEdit(graph,{kind:'controls',viewPath:selection.address.instancePath,nodeId:selection.address.nodeId,controls:{[key]:value}});return prepared;}}});
 try{button(f.host,'Edit Value as JSON').click();flushSync();input(f.host,'Value JSON',JSON.stringify(payload));button(f.host,'Save Value').click();await tick();flushSync();assert.equal(prepared?.ok,true,JSON.stringify(prepared));assert.deepEqual(prepared.data.candidate.nodes.check.value,payload);assert.equal(Object.hasOwn(prepared.data.candidate.nodes.check.value,'__proto__'),true);assert.equal(graph.nodes.check.value,null);assert.equal({}.polluted,undefined);}
 finally{await f.close();}
});
