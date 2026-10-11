import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import { compiled } from './helpers/svelte-compile.mjs';
import { resolveControlInputSpec } from '../src/ui/control-input-contracts.js';
import { OPERATIONS } from '../src/workflow/catalog.js';
const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true});
globalThis.window=dom.window; globalThis.document=dom.window.document;
for (const key of ['Node','Element','Text','Comment','Document','HTMLElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','MutationObserver']) Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
const {mount,unmount,flushSync,tick}=await import(new URL('../node_modules/svelte/src/index-client.js',import.meta.url).href);
const directory=await mkdtemp(join(tmpdir(),'lattice-control-import-'));
after(async()=>{const rel=relative(resolve(tmpdir()),resolve(directory)); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(directory,{recursive:true,force:true});});
const settle=async()=>{flushSync();await tick();flushSync();};
const leaf=await compiled('ControlImport',directory);
const harness=await compiled('ImportHarness',directory,`<script>import Component from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let {initial}=$props(); let params=$state.raw(initial); export function update(next) {params={...params,...next};}</script><Component {...params} />`);
const spec=resolveControlInputSpec({operation:'pattern',controls:{mode:'literal'},key:'rules',descriptor:OPERATIONS.pattern.controlDescriptors.rules});
async function fixture(extra={}) {
    const host=document.createElement('div');document.body.append(host);
    const values=[], drafts=[], value=[{id:'pattern-1',pattern:'old',label:'Keep'}];
    const mounted=mount(harness.component,{target:host,props:{initial:{spec,value,onConfirm:next=>values.push(next),onDraft:next=>drafts.push(next),...extra}}});await settle();
    const byLabel=label=>host.querySelector(`[aria-label="${label}"]`);
    const button=text=>[...host.querySelectorAll('button')].find(button=>button.textContent.trim()===text);
    return {host,value,values,drafts,byLabel,button,async update(next){mounted.update(next);await settle();},async input(label,text){const el=byLabel(label);assert.ok(el,label);el.value=text;el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await settle();},async click(text){const el=button(text);assert.ok(el,text);el.click();await settle();},async close(){await unmount(mounted);host.remove();}};
}

test('reviewing Add rows shows parsed columns and count without saving until confirmation',async()=>{
    const f=await fixture();try {
        await f.input('Table data','pattern,label\n"red, blue",Color');
        await f.input('Map pattern column','pattern');await f.input('Map label column','label');
        await f.input('Import action','add');
        assert.equal(f.values.length,0);assert.equal(f.button('Confirm import').disabled,true);
        await f.click('Review import');assert.equal(f.values.length,0);assert.match(f.host.textContent,/1 imported row/);assert.match(f.host.textContent,/red, blue/);
        assert.deepEqual(f.value,[{id:'pattern-1',pattern:'old',label:'Keep'}]);
        await f.click('Confirm import');assert.deepEqual(f.values,[[{id:'pattern-1',pattern:'old',label:'Keep'},{id:'pattern-2',pattern:'red, blue',label:'Color'}]]);
        await f.click('Confirm import');assert.equal(f.values.length,1);
    } finally {await f.close();}
});

test('changing reviewed text invalidates confirmation and Cancel does not save',async()=>{
    let cancelled=0;const f=await fixture({onCancel:()=>cancelled++});try {
        await f.input('Table data','pattern\nnew');await f.input('Map pattern column','pattern');await f.click('Review import');
        assert.equal(f.button('Confirm import').disabled,false);await f.input('Table data','pattern\nchanged');
        assert.equal(f.button('Confirm import').disabled,true);await f.click('Confirm import');assert.equal(f.values.length,0);
        await f.click('Cancel import');assert.equal(cancelled,1);assert.equal(f.values.length,0);
    } finally {await f.close();}
});

test('invalid table error locations and plain draft survive parent unmount and remount',async()=>{
    let handoff;const f=await fixture({onDraft:next=>handoff=next});
    await f.input('Table delimiter','\t');await f.input('Import action','replace');await f.input('Table data','pattern\tid\nnew\tx\nagain\tx');
    await f.input('Map pattern column','pattern');await f.input('Map id column','id');await f.click('Review import');
    assert.match(f.host.querySelector('[role="alert"]').textContent,/Row 3, cell 2/);assert.equal(f.values.length,0);
    assert.deepEqual(JSON.parse(JSON.stringify(handoff)),{text:'pattern\tid\nnew\tx\nagain\tx',delimiter:'\t',action:'replace',columns:{pattern:'pattern',id:'id'}});
    await f.close();const restored=await fixture({draft:handoff});try {
        assert.equal(restored.byLabel('Table data').value,handoff.text);assert.equal(restored.byLabel('Table delimiter').value,'\t');assert.equal(restored.byLabel('Map id column').value,'id');
        assert.match(restored.host.querySelector('[role="alert"]').textContent,/Row 3, cell 2/);assert.equal(restored.button('Confirm import').disabled,true);
        await restored.input('Table data','pattern\tid\nnew\tx\nagain\ty');await restored.click('Review import');await restored.click('Confirm import');
        assert.deepEqual(restored.values,[[{id:'x',pattern:'new'},{id:'y',pattern:'again'}]]);
    } finally {await restored.close();}
});


test('a parent value or contract change requires a fresh review before confirmation',async()=>{
    const f=await fixture();try {
        await f.input('Table data','pattern\nnew');await f.input('Map pattern column','pattern');await f.click('Review import');
        await f.update({value:[{id:'external',pattern:'external'}]});
        assert.equal(f.button('Confirm import').disabled,true);await f.click('Confirm import');assert.equal(f.values.length,0);
        await f.click('Review import');assert.equal(f.button('Confirm import').disabled,false);
        await f.update({spec:{...spec,id:'pattern.rules:regex'}});
        assert.equal(f.button('Confirm import').disabled,true);await f.click('Confirm import');assert.equal(f.values.length,0);
    } finally {await f.close();}
});

test('over-budget input leaves the last bounded draft and never confirms the stale review',async()=>{
    const f=await fixture();try {
        await f.input('Table data','pattern\nvalid');await f.input('Map pattern column','pattern');await f.click('Review import');
        const previous=structuredClone(f.drafts.at(-1));
        await f.input('Table data','x'.repeat(262145));
        assert.match(f.host.querySelector('[role="alert"]').textContent,/budget/);assert.deepEqual(f.drafts.at(-1),previous);
        assert.equal(f.byLabel('Table data').value,previous.text);
        assert.equal(f.button('Confirm import').disabled,true);await f.click('Confirm import');assert.equal(f.values.length,0);
    } finally {await f.close();}
});
