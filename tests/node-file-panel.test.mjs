import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { compiled } from './helpers/svelte-compile.mjs';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const { mount, unmount, flushSync, tick } = await import(new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href);
const selection = { documentNamespace: 'document-a', selectionKey: 'notes-details', revision: 'revision1', address: { workflowId: 'root', instancePath: [], nodeId: 'notes' } };
const settings = { bindingId: 'binding-a', name: 'notes.txt', format: 'text', missing: 'create', content: 'Starting notes', visibility: { kind: 'public' } };
const model = extra => ({ operation: 'read-file', mode: 'source', destinationMode: 'own', settings: structuredClone(settings), available: true, supported: true, legacy: false, ...extra });
async function fixture(initial = model(), actions = {}, options = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-node-file-panel-')), host = document.createElement('div'); document.body.append(host); let mounted;
    const close = async () => { if (mounted) await unmount(mounted); host.remove(); const scope = relative(resolve(tmpdir()), resolve(directory)); assert.ok(scope && !scope.startsWith('..') && !isAbsolute(scope)); await rm(directory, { recursive: true, force: true }); };
    try {
        const leaf = await compiled('NodeFile', directory);
        const harness = await compiled('NodeFileHarness', directory, `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions, options } = $props(); let model = $state.raw(initial), selection = $state.raw(options.selection), disabled = $state(options.disabled ?? false); export function update(next, nextSelection = selection, nextDisabled = disabled) { model = next; selection = nextSelection; disabled = nextDisabled; }</script><Leaf {model} {selection} {actions} {disabled} />`);
        mounted = mount(harness.component, { target: host, props: { initial, actions, options: { selection, ...options } } }); flushSync();
        return { host, update(next, nextSelection, nextDisabled) { mounted.update(next, nextSelection, nextDisabled); flushSync(); }, close };
    } catch (error) { await close(); throw error; }
}
const field = (host, label) => { const value = host.querySelector(`[aria-label="${label}"]`); assert.ok(value, `Missing ${label}`); return value; };
const edit = (host, label, value, event = 'input') => { const element = field(host, label); element.value = value; element.dispatchEvent(new dom.window.Event(event, { bubbles: true })); flushSync(); };
const settle = async () => { await tick(); flushSync(); };


const waitSave=async()=>{await new Promise(resolve=>setTimeout(resolve,350));await settle();};
test('automatic file panel exposes friendly defaults and every saving node retains handling',async()=>{
 for(const operation of ['write-file','story-clock','commit-outcomes','random-pick','commit-clock']){
 const changes=[],f=await fixture(model({operation,managed:true,friendlyName:'Scene Context',typeLabel:'Text document',status:'Ready',saving:true,fileHandling:'replace',mode:operation==='commit-clock'?'inherited':'destination'}),{editControls(s,c){changes.push(c);return {ok:true};}});
 try{assert.equal(field(f.host,'File type').textContent,'Text document · Automatic');assert.equal(f.host.querySelector('[data-file-status]').textContent,'Ready');assert.equal(f.host.querySelector('[data-save-node-file]'),null);assert.equal(field(f.host,'File handling').disabled,false);edit(f.host,'File handling','append','change');await settle();assert.deepEqual(changes,[{fileHandling:'append'}]);assert.equal(f.host.querySelector('details').open,false);}finally{await f.close();}
 }
});

test('debounced settings autosave retains focus, incomplete drafts and per-node drafts across selection',async()=>{
 const saves=[],f=await fixture(model({managed:true,friendlyName:'Notes',settings:{...settings,bindingId:''}}),{saveNodeFile(s,v){saves.push([s,v]);return {ok:true};}});
 try{
 const input=field(f.host,'File name');input.focus();edit(f.host,'File name','Scene Context');await waitSave();assert.equal(saves.length,1);assert.equal(saves[0][1].name,'Scene Context');assert.equal(document.activeElement,input);
 edit(f.host,'File name','');await waitSave();assert.equal(saves.length,1);
 const next={...selection,selectionKey:'other',address:{...selection.address,nodeId:'other'}};
 f.update(model({managed:true,friendlyName:'Other',settings:{...settings,bindingId:'',name:'Other.txt'}}),next);
 assert.equal(field(f.host,'File name').value,'Other');
 f.update(model({managed:true,friendlyName:'Notes',settings:{...settings,bindingId:''}}),selection);
 assert.equal(field(f.host,'File name').value,'');await waitSave();assert.equal(saves.length,1);
 }finally{await f.close();}
});

test('stale autosave feedback never lands on another selection and disabled panels reject events',async()=>{
 let resolveSave;const saves=[],f=await fixture(model({managed:true,settings:{...settings,bindingId:''}}),{saveNodeFile(s,v){saves.push([s,v]);return new Promise(resolve=>{resolveSave=resolve;});},editControls(){throw Error('disabled edit');}});
 try{edit(f.host,'File name','Pending');await waitSave();assert.equal(saves.length,1);const other={...selection,selectionKey:'other',address:{...selection.address,nodeId:'other'}};f.update(model({friendlyName:'Other'}),other,true);resolveSave({ok:false,error:{code:'OLD',message:'Obsolete failure'}});await settle();assert.doesNotMatch(f.host.textContent,/Obsolete failure/);edit(f.host,'File name','Forged');assert.equal(field(f.host,'File name').value,'Forged');await waitSave();assert.equal(saves.length,1);assert.equal(field(f.host,'File name').disabled,true);}finally{await f.close();}
});

test('private character uses familiar labels and preserves an unavailable private identity',async()=>{
 const saves=[],f=await fixture(model({managed:true,actors:[{id:'actor:mara',label:'Mara'}],settings:{...settings,bindingId:'',visibility:{kind:'actor-private',actorId:'actor:missing'}}}),{saveNodeFile(s,v){saves.push(v);return {ok:true};}});
 try{assert.equal(field(f.host,'File character').value,'actor:missing');assert.match(field(f.host,'File character').textContent,/Previously selected character/);assert.equal(f.host.querySelector('[aria-label="File actor ID"]'),null);edit(f.host,'File name','Private notes');await waitSave();assert.deepEqual(saves[0].visibility,{kind:'actor-private',actorId:'actor:missing'});edit(f.host,'File character','actor:mara','change');await waitSave();assert.deepEqual(saves[1].visibility,{kind:'actor-private',actorId:'actor:mara'});}finally{await f.close();}
});

test('bound names and type changes require explicit copy while generic readers can choose real files',async()=>{
 const saves=[],copies=[],choices=[],f=await fixture(model(),{saveNodeFile(s,v){saves.push(v);return {ok:true};},createNodeFileCopy(s,v){copies.push(v);return {ok:true};},chooseNodeFile(s,v){choices.push(v);return Promise.resolve({ok:true});}});
 try{edit(f.host,'File name','Another file');edit(f.host,'Advanced file format','markdown','change');await waitSave();assert.equal(saves.length,0);f.host.querySelector('button:not([disabled])');const copy=[...f.host.querySelectorAll('button')].find(button=>button.textContent==='Create new copy…');assert.ok(copy);copy.click();await settle();assert.equal(copies.length,1);f.update(model({settings:{...settings,bindingId:''}}));f.host.querySelector('[data-choose-node-file="open"]').click();assert.equal(choices.length,1,'picker begins in the click gesture');assert.equal(choices[0].mode,'open');}finally{await f.close();}
});

test('external file settings changes retain a draft without autosaving over the new destination',async()=>{
 const saves=[],f=await fixture(model({managed:true,settings:{...settings,bindingId:''}}),{saveNodeFile(s,v){saves.push(v);return {ok:true};}});
 try{edit(f.host,'File name','Unfinished local name');f.update(model({managed:true,friendlyName:'Remote',settings:{...settings,bindingId:'',name:'Remote.txt'}}),{...selection,revision:'remote'});await waitSave();assert.equal(field(f.host,'File name').value,'Unfinished local name');assert.equal(saves.length,0);assert.match(f.host.textContent,/changed elsewhere/);}finally{await f.close();}
});

test('external readers offer explicit device input import without custom server setup',async()=>{
 const imports=[],f=await fixture(model({settings:{...settings,bindingId:''},supported:false}),{importNodeFile(s){imports.push(s);return {ok:true};}});
 try{const button=[...f.host.querySelectorAll('button')].find(button=>button.textContent==='Import from device…');assert.ok(button);assert.equal(button.disabled,false);assert.match(f.host.textContent,/Imports a copy; changes to the original/);button.click();assert.deepEqual(imports,[selection]);}finally{await f.close();}
});

test('returning to a retained valid draft pauses it when that node changed while unselected',async()=>{
 const saves=[],initial=model({managed:true,settings:{...settings,bindingId:''}}),f=await fixture(initial,{saveNodeFile(s,v){saves.push(v);return {ok:true};}});
 try{edit(f.host,'File name','Local draft');const other={...selection,selectionKey:'other',address:{...selection.address,nodeId:'other'}};f.update(model({friendlyName:'Other'}),other);f.update(model({managed:true,settings:{...settings,bindingId:'',name:'Remote.txt'}}),{...selection,revision:'remote'});await waitSave();assert.equal(saves.length,0);assert.equal(field(f.host,'File name').value,'Local draft');assert.match(f.host.textContent,/changed elsewhere/);}finally{await f.close();}
});

test('switching an inherited writer back to a configured own destination preserves its original file authority',async()=>{
 const edits=[],f=await fixture(model({operation:'write-file',mode:'inherited',destinationMode:'connected',ownFileConfigured:true}),{editControls(s,v){edits.push(v);return {ok:true};}});
 try{edit(f.host,'File destination','own','change');await settle();assert.deepEqual(edits,[{destinationMode:'own'}]);}finally{await f.close();}
});

test('remote privacy changes pause a newer local draft during autosave and survive the older acknowledgement',async()=>{
 const saves=[],acknowledgements=[];
 const initial=model({operation:'write-file',mode:'destination',managed:true,settings:{...settings,bindingId:''}});
 const f=await fixture(initial,{saveNodeFile(captured,value){saves.push([captured,structuredClone(value)]);return new Promise(resolve=>acknowledgements.push(resolve));}});
 try{
  edit(f.host,'File name','Local first');await waitSave();assert.equal(saves.length,1);
  edit(f.host,'File name','Local newer');
  f.update(model({operation:'write-file',mode:'destination',managed:true,friendlyName:'Remote destination',settings:{...settings,bindingId:'',name:'Remote destination.txt',visibility:{kind:'hidden'}}}),{...selection,revision:'remote-private-revision'});
  const pausedWhenRemoteArrived=/changed elsewhere/.test(f.host.textContent);
  acknowledgements[0]({ok:true});await waitSave();
  assert.equal(saves.length,1,'the old acknowledgement must not autosave Local newer with the old public visibility over the remote restriction');
  assert.equal(pausedWhenRemoteArrived,true);assert.match(f.host.textContent,/changed elsewhere/);
  assert.equal(field(f.host,'File name').value,'Local newer');assert.doesNotMatch(f.host.textContent,/Settings saved/);
  [...f.host.querySelectorAll('button')].find(button=>button.textContent==='Use current settings').click();await settle();
  assert.equal(field(f.host,'File name').value,'Remote destination');assert.equal(field(f.host,'File visibility').value,'hidden');
 }finally{for(const acknowledge of acknowledgements)acknowledge({ok:true});await f.close();}
});

test('an exact canonical own acknowledgement preserves a newer draft and permits its next autosave',async()=>{
 const saves=[],acknowledgements=[];
 const f=await fixture(model({operation:'write-file',mode:'destination',managed:true,settings:{...settings,bindingId:''}}),{saveNodeFile(captured,value){saves.push([captured,structuredClone(value)]);return new Promise(resolve=>acknowledgements.push(resolve));}});
 try{
  edit(f.host,'File name','Local first');await waitSave();edit(f.host,'File name','Local newer');
  f.update(model({operation:'write-file',mode:'destination',managed:true,friendlyName:'Local first',settings:{...settings,bindingId:'',name:'Local first.txt'}}),{...selection,revision:'own-first-commit'});
  assert.doesNotMatch(f.host.textContent,/changed elsewhere/);assert.equal(field(f.host,'File name').value,'Local newer');
  acknowledgements[0]({ok:true});await waitSave();assert.equal(saves.length,2);assert.equal(saves[1][1].name,'Local newer');assert.deepEqual(saves[1][1].visibility,{kind:'public'});assert.doesNotMatch(f.host.textContent,/changed elsewhere/);
 }finally{for(const acknowledge of acknowledgements)acknowledge({ok:true});await f.close();}
});

test('a remotely conflicted draft remains paused after further editing and returning to its selection',async()=>{
 const saves=[],f=await fixture(model({managed:true,settings:{...settings,bindingId:''}}),{saveNodeFile(captured,value){saves.push(value);return {ok:true};}});
 const remote=model({managed:true,friendlyName:'Remote destination',settings:{...settings,bindingId:'',name:'Remote destination.txt',visibility:{kind:'hidden'}}});
 try{
  edit(f.host,'File name','Local draft');f.update(remote,{...selection,revision:'remote-private'});assert.match(f.host.textContent,/changed elsewhere/);
  edit(f.host,'File name','Retained local edit');const other={...selection,selectionKey:'other',address:{...selection.address,nodeId:'other'}};
  f.update(model({friendlyName:'Other'}),other);f.update(remote,{...selection,revision:'remote-private'});await waitSave();
  assert.equal(saves.length,0);assert.equal(field(f.host,'File name').value,'Retained local edit');assert.match(f.host.textContent,/changed elsewhere/);
 }finally{await f.close();}
});
