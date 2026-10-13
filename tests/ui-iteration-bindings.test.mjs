import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {compiled} from './helpers/svelte-compile.mjs';
import {presentDiagnostic} from '../src/ui/diagnostics.js';
import {prepareIterationBindings} from '../src/ui/iteration-bindings.js?v=0.27.1';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true});globalThis.window=dom.window;globalThis.document=dom.window.document;
for(const key of ['Node','Element','Text','Comment','Document','HTMLElement','HTMLMediaElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
const {mount,unmount,flushSync,tick}=await import(new URL('../node_modules/svelte/src/index-client.js',import.meta.url).href);
const options=[{value:'inherit',label:'Use helper model'},{value:'override',label:'Override'},{value:'block',label:'Use profile model'}];
const role=role=>({role,label:role,profile:{mode:'inherit',value:null,allowedModes:options.slice(0,2),options:[{value:'chosen',label:'Chosen connection'}]},model:{mode:'inherit',value:null,allowedModes:options},effective:'Choose a connection for this helper role',source:'Pinned helper binding'});
function view(extra={}){return {selectionKey:'each',revision:'r1',address:{workflowId:'root',instancePath:[],nodeId:'each'},title:'For Each',canonicalTitle:'For Each',iconPath:'',family:'Shaping',phase:'pre',operation:'for-each',alias:'',compact:false,enabled:true,readOnly:false,canPresent:true,controls:[],model:null,ports:[],helperBindings:{helperKey:'exact-helper-pin',editable:true,roles:[role('decision'),role('effectAuthor')]},...extra};}
async function fixture(initial,actions={}){
 const directory=await mkdtemp(join(tmpdir(),'lattice-helper-bindings-')),host=document.createElement('div');document.body.append(host);let mounted;
 try{const leaf=await compiled('NodeDetails',directory);const harness=await compiled('HelperBindingHarness',directory,`<script>import Leaf from ${JSON.stringify(new URL('file:///'+leaf.path.replaceAll('\\','/')).href)};let {initial,actions}=$props();let view=$state.raw(initial);export function update(next){view=next;}</script><Leaf {view} {actions}/>`);mounted=mount(harness.component,{target:host,props:{initial,actions}});flushSync();return {host,update(next){mounted.update(next);flushSync();},async close(){await unmount(mounted);host.remove();const rel=relative(resolve(tmpdir()),resolve(directory));assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(directory,{recursive:true,force:true});}};}catch(error){if(mounted)await unmount(mounted);host.remove();const rel=relative(resolve(tmpdir()),resolve(directory));assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(directory,{recursive:true,force:true});throw error;}
}
const change=(element,value)=>{assert.ok(element,'Expected the friendly helper role selector');element.value=value;element.dispatchEvent(new dom.window.Event('change',{bubbles:true}));flushSync();};
const input=(element,value)=>{assert.ok(element);element.value=value;element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));flushSync();};
const settle=async()=>{await tick();flushSync();};
test('missing pinned helper projection preserves its stable diagnostic without changing bindings',()=>{
 const node={helper:{id:'missing-helper',version:1,semanticHash:'sha256:'+'0'.repeat(64)},roleOverrides:{}},before=structuredClone(node);
 const result=prepareIterationBindings(node,{});
 assert.deepEqual(result.roles,[]);assert.match(result.issue,/exact saved definition/);
 assert.equal(result.issueDiagnostic?.severity,'error');assert.equal(result.issueDiagnostic?.technical?.code,'MISSING_DEFINITION');
 assert.match(result.issueDiagnostic?.message,/includes its pinned definition/);assert.deepEqual(node,before);
});
test('helper binding diagnostics retain support codes in collapsed details and current edit guards',async()=>{
 const initial=view(),calls=[],diagnostic=presentDiagnostic({code:'MISSING_DEFINITION',message:'Helper pin is missing.'});
 initial.helperBindings.issue=diagnostic.message;initial.helperBindings.issueDiagnostic=diagnostic;
 const f=await fixture(initial,{editHelperBinding:(...args)=>{calls.push(args);return {ok:true};}});
 try{
  const notice=f.host.querySelector('[data-diagnostic]');assert.equal(notice?.dataset.severity,'error');assert.match(notice.textContent,/exact saved definition/);
  const disclosure=notice.querySelector('details');assert.ok(disclosure,'helper support code has a technical disclosure');assert.equal(disclosure.open,false);assert.match(disclosure.textContent,/MISSING_DEFINITION/);assert.equal(f.host.querySelectorAll('[data-diagnostic]').length,1);assert.deepEqual(calls,[],'presenting a helper failure performs no edit');
  const readonly=view({revision:'r2',readOnly:true});readonly.helperBindings={...initial.helperBindings,editable:false};f.update(readonly);await settle();
  const profile=f.host.querySelector('[aria-label="decision connection profile"]');assert.equal(profile.disabled,true);change(profile,'chosen');await settle();assert.deepEqual(calls,[],'raw events cannot bypass current helper edit guards');
  f.update(view({selectionKey:'other',revision:'r3',address:{workflowId:'root',instancePath:[],nodeId:'other'}}));await settle();assert.equal(f.host.querySelector('[data-diagnostic]'),null,'the helper notice follows the current selection');
 }finally{await f.close();}
});
test('actual Details component authors separate helper profiles and optional custom models through captured selections',async()=>{
 const initial=view(),calls=[],f=await fixture(initial,{editHelperBinding:(...args)=>{calls.push(args);return {ok:true};}});
 try{
  assert.match(f.host.textContent,/Helper model bindings/);change(f.host.querySelector('[aria-label="decision connection profile"]'),'chosen');await settle();
  assert.deepEqual(calls[0],[{selectionKey:initial.selectionKey,revision:initial.revision,address:initial.address},'decision','profileId','override','chosen']);
  change(f.host.querySelector('[aria-label="effectAuthor connection profile"]'),'chosen');await settle();assert.equal(calls[1][1],'effectAuthor');
  change(f.host.querySelector('[aria-label="decision model mode"]'),'override');assert.equal(calls.length,2,'Revealing a model editor does not write an empty binding');
  const model=f.host.querySelector('[aria-label="decision model identifier"]');input(model,'custom-decision');change(model,'custom-decision');await settle();assert.deepEqual(calls[2].slice(1),['decision','model','override','custom-decision']);
  change(f.host.querySelector('[aria-label="decision model mode"]'),'block');await settle();assert.deepEqual(calls[3].slice(1),['decision','model','block',null]);
 }finally{await f.close();}
});test('helper pin changes revoke unsaved per-role drafts even when the node and role names are unchanged',async()=>{
 const f=await fixture(view(),{editHelperBinding:()=>({ok:true})});
 try{change(f.host.querySelector('[aria-label="decision model mode"]'),'override');input(f.host.querySelector('[aria-label="decision model identifier"]'),'old-pin-model');const next=view({revision:'r2'});next.helperBindings.helperKey='new-exact-helper-pin';f.update(next);await settle();assert.equal(f.host.querySelector('[aria-label="decision model identifier"]'),null);}finally{await f.close();}
});
test('readonly helper selectors and obsolete asynchronous acknowledgments cannot affect a new selection',async()=>{
 let calls=0,resolveEdit;const initial=view(),f=await fixture(initial,{editHelperBinding:()=>{calls++;return new Promise(resolve=>{resolveEdit=resolve;});}});
 try{
  change(f.host.querySelector('[aria-label="decision connection profile"]'),'chosen');assert.equal(calls,1);const next=view({selectionKey:'other',revision:'r2',address:{workflowId:'root',instancePath:[],nodeId:'other'},readOnly:true});next.helperBindings.editable=false;f.update(next);await settle();
  assert.equal(f.host.querySelector('[aria-label="decision connection profile"]').disabled,true);change(f.host.querySelector('[aria-label="decision connection profile"]'),'chosen');assert.equal(calls,1);resolveEdit({ok:false,error:{code:'OLD_ERROR',message:'Obsolete'}});await settle();assert.doesNotMatch(f.host.textContent,/OLD_ERROR|Obsolete/);assert.equal(f.host.querySelector('[aria-label="decision model identifier"]'),null);
 }finally{await f.close();}
});
test('a late successful helper model save preserves a newer draft for that same role',async()=>{
 let resolveEdit;const f=await fixture(view(),{editHelperBinding:()=>new Promise(resolve=>{resolveEdit=resolve;})});
 try{change(f.host.querySelector('[aria-label="decision model mode"]'),'override');const model=f.host.querySelector('[aria-label="decision model identifier"]');input(model,'submitted-model');change(model,'submitted-model');f.update(view({revision:'r2'}));await settle();input(f.host.querySelector('[aria-label="decision model identifier"]'),'newer-model');resolveEdit({ok:true});await settle();assert.equal(f.host.querySelector('[aria-label="decision model identifier"]').value,'newer-model');}finally{await f.close();}
});

test('helper controls with no affected calls stay disabled while useful model inheritance editing remains available',async()=>{
 const initial=view();initial.helperBindings.roles[0].profile.editable=false;initial.helperBindings.roles[0].model.editable=true;initial.helperBindings.roles[0].caveat='Explicit helper-node connection: Active SillyTavern model. Connection choice affects 0 of 1 helper calls.';
 const calls=[],f=await fixture(initial,{editHelperBinding:(...args)=>{calls.push(args);return {ok:true};}});
 try{
  const profile=f.host.querySelector('[aria-label="decision connection profile"]');assert.equal(profile.disabled,true);change(profile,'chosen');await settle();assert.deepEqual(calls,[]);
  assert.match(f.host.textContent,/Explicit helper-node connection: Active SillyTavern model/);
  assert.equal(f.host.querySelector('[aria-label="decision model mode"]').disabled,false);
  change(f.host.querySelector('[aria-label="decision model mode"]'),'override');const model=f.host.querySelector('[aria-label="decision model identifier"]');input(model,'useful-model');change(model,'useful-model');await settle();assert.deepEqual(calls[0].slice(1),['decision','model','override','useful-model']);
 }finally{await f.close();}
});
