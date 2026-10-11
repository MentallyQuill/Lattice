import assert from 'node:assert/strict';
import { test } from 'node:test';
const api=await import('../src/ui/schedule-authoring.js').catch(()=>({}));
test('durations use deterministic minutes and explicit authored day lengths',()=>{
    assert.equal(typeof api.durationToMinutes,'function');
    assert.deepEqual(api.durationToMinutes(8,'hours').data,{minutes:480});
    assert.deepEqual(api.durationToMinutes(1,'days',1200).data,{minutes:1200});
    assert.equal(api.durationToMinutes(1,'days').ok,false);
    assert.match(api.durationToMinutes(1,'days').error.message,/day length|calendar/i);
    assert.deepEqual(api.durationToMinutes(0,'minutes').data,{minutes:0});
    for(const args of [[Number.MAX_SAFE_INTEGER,'hours'],[1,'days',0],[-1,'minutes'],[Infinity,'minutes'],[0.1,'minutes'],[1,'weeks']]) assert.equal(api.durationToMinutes(...args).ok,false);
});
test('schedule rows preserve exact revision, order, scope, timing and typed extra values',()=>{
    assert.equal(typeof api.compileScheduleRows,'function');
    const rows=[{scheduleId:'d',kind:'daily',minuteOfDay:840,revision:4,order:-1,clockId:'authored-clock',calendarId:'authored-calendar',visibility:'private',extra:{'a.b':[null,false,0,'']}},{scheduleId:'i',kind:'interval',anchorMinute:0,intervalMinutes:480},{scheduleId:'once',kind:'delay',dueMinute:0}];
    const result=api.compileScheduleRows(rows);assert.equal(result.ok,true);assert.deepEqual(result.data.value,rows.map(row=>({...row,revision:row.revision??1})));
    assert.equal(result.data.value[1].revision,1);assert.equal(Object.hasOwn(rows[1],'revision'),false);
    assert.notEqual(result.data.value[0],rows[0]);
    assert.equal(api.compileScheduleRows([]).ok,true);
});
test('schedule rows reject duplicates, overflow, invalid timing and JSON budgets without choosing a clock',()=>{
    const base={scheduleId:'s',kind:'delay',dueMinute:0};
    for(const rows of [[base,base],[{...base,scheduleId:''}],[{...base,dueMinute:-1}],[{...base,revision:0}],[{...base,order:Infinity}],[{...base,clockId:null}],[{scheduleId:'s',kind:'interval',anchorMinute:0,intervalMinutes:0}],[{...base,extra:'x'.repeat(262145)}],Array.from({length:1001},(_,i)=>({...base,scheduleId:'s'+i}))]) assert.equal(api.compileScheduleRows(rows).ok,false);
    assert.equal(api.compileScheduleRows(Array.from({length:1000},(_,i)=>({...base,scheduleId:'s'+i}))).ok,true);
});
test('Time Trigger metadata uses the existing reserved timing and identity rules',()=>{
    assert.equal(typeof api.validateScheduleMetadata,'function');
    assert.deepEqual(api.validateScheduleMetadata({subject:'Rowan',visibility:'private',consequence:{value:false}}).data,{value:{subject:'Rowan',visibility:'private',consequence:{value:false}}});
    for(const key of ['scheduleId','revision','kind','clockId','calendarId','minuteOfDay','anchorMinute','intervalMinutes','dueMinute','order']) assert.equal(api.validateScheduleMetadata({[key]:null}).ok,false);
    assert.equal(api.validateScheduleMetadata(Object.fromEntries(Array.from({length:129},(_,i)=>['key'+i,null]))).ok,false);
});

import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';
const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true});
globalThis.window=dom.window;globalThis.document=dom.window.document;
for(const key of ['Node','Element','Text','Comment','Document','HTMLElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','MutationObserver']) Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
const clientURL=new URL('../node_modules/svelte/src/index-client.js',import.meta.url).href;
const {mount,unmount,flushSync}=await import(clientURL);
async function fixture(initial,check,options={}) {
    const directory=await mkdtemp(join(tmpdir(),'lattice-schedule-rows-')),host=document.createElement('div');document.body.append(host);let mounted;
    async function compiled(name,source) {
        const output=compile(source,{filename:name+'.svelte',generate:'client',css:'injected'});assert.deepEqual(output.warnings.filter(w=>w.code.startsWith('a11y')),[]);
        let code=output.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g,(_,q,s)=>JSON.stringify(s==='svelte'?clientURL:import.meta.resolve(s)));
        code=code.replace(/from\s+(['"])(\.\.[^'"]+)\1/g,(_,q,s)=>'from '+JSON.stringify(new URL(s,new URL('../ui/',import.meta.url)).href));
        code=code.replace(/(['"])\.\/JsonValueControl.svelte\1/g,JSON.stringify(pathToFileURL(join(directory,'JsonValueControl.mjs')).href));
        const path=join(directory,name+'.mjs');await writeFile(path,code,'utf8');return pathToFileURL(path).href;
    }
    try {
        const source=await readFile(new URL('../ui/ScheduleControl.svelte',import.meta.url),'utf8').catch(()=>null);assert.ok(source,'Schedule rows must exist');
        await compiled('JsonValueControl',await readFile(new URL('../ui/JsonValueControl.svelte',import.meta.url),'utf8'));
        const leaf=await compiled('ScheduleControl',source);
        const harness=await compiled('Harness',`<script>import Leaf from ${JSON.stringify(leaf)};let {initial,options}=$props();let value=$state(initial),draft=$state(),invalids=$state([]),shown=$state(true);export function read(){return {value,draft,invalids:[...invalids]};}export function remount(){shown=false;}export function show(){shown=true;}function onchange(v){value=v;}function oninvalid(text){invalids=[...invalids,text];}function onDraftState(state){draft=state;}</script>{#if shown}<Leaf {value} {onchange} {oninvalid} draftState={draft} {onDraftState} idPrefix="schedules" {...options}/>{/if}`);
        mounted=mount((await import(harness)).default,{target:host,props:{initial,options}});flushSync();await check({host,read:()=>mounted.read(),remount:()=>{mounted.remount();flushSync();mounted.show();flushSync();}});
    }finally{if(mounted)await unmount(mounted);host.remove();await rm(directory,{recursive:true,force:true});}
}
function input(host,label,value,type='input'){const e=host.querySelector(`[aria-label="${label}"]`);assert.ok(e,'Missing '+label);e.value=value;e.dispatchEvent(new dom.window.Event(type,{bubbles:true}));flushSync();}
function click(host,label){const e=host.querySelector(`button[aria-label="${label}"]`);assert.ok(e,'Missing '+label);e.click();flushSync();}
test('schedule forms convert authored intervals and retain private metadata, revision, scope and optional absence',async()=>{
    await fixture([{scheduleId:'exact',kind:'interval',anchorMinute:0,intervalMinutes:480,revision:7,clockId:'chosen',extra:{visibility:'private',value:false}}],async f=>{
        input(f.host,'Schedule 1 interval quantity','8');input(f.host,'Schedule 1 interval unit','hours','change');assert.equal(f.read().value[0].intervalMinutes,480);
        assert.deepEqual(JSON.parse(JSON.stringify(f.read().value[0].extra)),{visibility:'private',value:false});assert.equal(f.read().value[0].revision,7);assert.equal(f.read().value[0].clockId,'chosen');assert.equal(Object.hasOwn(f.read().value[0],'order'),false);
        input(f.host,'Schedule 1 interval unit','days','change');assert.equal(f.read().value[0].intervalMinutes,480);assert.ok(f.read().invalids.length);
    });
});
test('unfinished numeric schedules survive view changes and remounts',async()=>{
    await fixture([{scheduleId:'one',kind:'delay',dueMinute:10}],async f=>{
        input(f.host,'Schedule 1 due minute','1e');assert.equal(f.read().value[0].dueMinute,10);
        click(f.host,'Advanced schedules JSON');click(f.host,'Use schedule rows');f.remount();assert.equal(f.host.querySelector('[aria-label="Schedule 1 due minute"]').value,'1e');
        input(f.host,'Schedule 1 due minute','20');assert.equal(f.read().value[0].dueMinute,20);
    });
});
test('schedule forms use an explicitly supplied day length and reject edits when disabled',async()=>{
    await fixture([{scheduleId:'one',kind:'interval',anchorMinute:0,intervalMinutes:1}],async f=>{input(f.host,'Schedule 1 interval quantity','1');input(f.host,'Schedule 1 interval unit','days','change');assert.equal(f.read().value[0].intervalMinutes,1200);},{dayLengthMinutes:1200});
    await fixture([{scheduleId:'one',kind:'delay',dueMinute:10}],async f=>{input(f.host,'Schedule 1 due minute','20');assert.equal(f.read().value[0].dueMinute,10);},{disabled:true});
});
test('schedule identity drafts reject duplicates without removing a row and retain text across remounts',async()=>{
    await fixture([{scheduleId:'one',kind:'delay',dueMinute:10},{scheduleId:'two',kind:'delay',dueMinute:20}],async f=>{
        input(f.host,'Schedule 2 identity','one');assert.equal(f.read().value[1].scheduleId,'two');f.remount();assert.equal(f.host.querySelector('[aria-label="Schedule 2 identity"]').value,'one');
        input(f.host,'Schedule 2 identity','three');assert.equal(f.read().value[1].scheduleId,'three');assert.equal(f.host.querySelectorAll('fieldset').length,2);
    });
});
test('changing schedule kind retains authored inactive timing and optional falsy metadata',async()=>{
    await fixture([{scheduleId:'one',kind:'delay',dueMinute:0,order:0,extra:null,minuteOfDay:20}],async f=>{
        input(f.host,'Schedule 1 kind','daily','change');assert.equal(f.read().value[0].dueMinute,0);assert.equal(f.read().value[0].minuteOfDay,20);assert.equal(f.read().value[0].extra,null);assert.equal(f.read().value[0].order,0);
    });
});
test('retained nested metadata drafts can be repaired after a schedule remount without losing private scope',async()=>{
    await fixture([{scheduleId:'one',kind:'delay',dueMinute:10,scope:{visibility:'private',actorId:'Rowan'}}],async f=>{
        click(f.host,'Edit Schedule 1 extra metadata key scope');click(f.host,'Edit Schedule 1 extra metadata key actorId');click(f.host,'Edit Schedule 1 extra metadata as JSON');input(f.host,'Schedule 1 extra metadata JSON','{unfinished');f.remount();
        input(f.host,'Schedule 1 metadata unfinished JSON','"Mira"');assert.deepEqual(JSON.parse(JSON.stringify(f.read().value[0].scope)),{visibility:'private',actorId:'Mira'});
    });
});


test('inactive-interval-draft retains exact rejected quantity and unit through kind round trip and remount',async()=>{
    for(const unit of ['hours','days'])await fixture([{scheduleId:'one',kind:'interval',anchorMinute:0,intervalMinutes:480,scope:{visibility:'private',actorId:'Rowan'}}],async f=>{
        input(f.host,'Schedule 1 interval quantity','8');input(f.host,'Schedule 1 interval unit','hours','change');
        const rejected=unit==='hours'?'1e':'1';input(f.host,'Schedule 1 interval quantity',rejected);if(unit==='days')input(f.host,'Schedule 1 interval unit','days','change');
        const before=JSON.parse(JSON.stringify(f.read().value));assert.equal(f.read().draft.invalid,true);
        input(f.host,'Schedule 1 kind','delay','change');f.remount();input(f.host,'Schedule 1 kind','interval','change');f.remount();
        assert.equal(f.host.querySelector('[aria-label="Schedule 1 interval quantity"]').value,rejected);assert.equal(f.host.querySelector('[aria-label="Schedule 1 interval unit"]').value,unit);assert.deepEqual(JSON.parse(JSON.stringify(f.read().value)),before);assert.equal(f.read().draft.invalid,true);
        input(f.host,'Schedule 1 interval quantity','9');input(f.host,'Schedule 1 interval unit','hours','change');assert.equal(f.read().draft.invalid,false);assert.equal(f.read().value[0].intervalMinutes,540);assert.equal(f.read().value[0].scheduleId,'one');assert.deepEqual(JSON.parse(JSON.stringify(f.read().value[0].scope)),{visibility:'private',actorId:'Rowan'});
    });
});
test('prototype-like-id supports own-safe constructor and __proto__ duration state including identity renames',async()=>{
    for(const id of ['constructor','__proto__'])await fixture([{scheduleId:id,kind:'interval',anchorMinute:0,intervalMinutes:480}],async f=>{
        assert.equal(api.compileScheduleRows([{scheduleId:id,kind:'interval',anchorMinute:0,intervalMinutes:480}]).ok,true);
        assert.equal(f.host.querySelector('[aria-label="Schedule 1 interval quantity"]').value,'480');assert.equal(f.host.querySelector('[aria-label="Schedule 1 interval unit"]').value,'minutes');
        input(f.host,'Schedule 1 interval quantity','8');input(f.host,'Schedule 1 interval unit','hours','change');assert.equal(f.read().value[0].intervalMinutes,480);assert.equal(f.read().draft.invalid,false);assert.equal(Object.hasOwn(f.read().draft.quantities,id),true);assert.equal(Object.hasOwn(f.read().draft.units,id),true);
        input(f.host,'Schedule 1 identity',id);assert.equal(f.host.querySelector('[aria-label="Schedule 1 interval quantity"]').value,'8');assert.equal(f.host.querySelector('[aria-label="Schedule 1 interval unit"]').value,'hours');
        const renamed=id==='constructor'?'__proto__':'constructor';input(f.host,'Schedule 1 identity',renamed);f.remount();assert.equal(f.read().value[0].scheduleId,renamed);assert.equal(f.host.querySelector('[aria-label="Schedule 1 interval quantity"]').value,'8');assert.equal(f.host.querySelector('[aria-label="Schedule 1 interval unit"]').value,'hours');assert.equal(Object.hasOwn(f.read().draft.quantities,id),false);assert.equal(Object.hasOwn(f.read().draft.units,id),false);assert.equal(Object.hasOwn(f.read().draft.quantities,renamed),true);assert.equal(Object.hasOwn(f.read().draft.units,renamed),true);
        input(f.host,'Schedule 1 interval quantity','1e');f.remount();assert.equal(f.host.querySelector('[aria-label="Schedule 1 interval quantity"]').value,'1e');input(f.host,'Schedule 1 interval quantity','9');assert.equal(f.read().value[0].intervalMinutes,540);assert.equal(f.read().draft.invalid,false);
    });
});
test('raw-replacement-page keeps smaller complete replacement visible through a retained remount',async()=>{
    const rows=Array.from({length:33},(_,index)=>({scheduleId:'row-'+index,kind:'delay',dueMinute:index}));
    await fixture(rows,async f=>{
        click(f.host,'Next schedules');assert.equal(f.read().draft.page,1);assert.equal(f.host.querySelectorAll('fieldset').length,1);
        click(f.host,'Advanced schedules JSON');input(f.host,'Schedules JSON',JSON.stringify([{scheduleId:'kept',kind:'delay',dueMinute:20,scope:{visibility:'private',actorId:'Rowan'}}]));f.remount();click(f.host,'Use schedule rows');
        assert.equal(f.read().draft.page,0);assert.equal(f.host.querySelectorAll('fieldset').length,1);assert.equal(f.host.querySelector('[aria-label="Schedule 1 identity"]').value,'kept');assert.equal(f.host.querySelector('[aria-label="Schedule 1 due minute"]').value,'20');assert.equal(f.host.querySelector('[aria-label="Previous schedules"]'),null);
        click(f.host,'Advanced schedules JSON');input(f.host,'Schedules JSON','[]');f.remount();click(f.host,'Use schedule rows');assert.equal(f.read().draft.page,0);assert.equal(f.host.querySelectorAll('fieldset').length,0);click(f.host,'Add schedule');assert.equal(f.host.querySelectorAll('fieldset').length,1);
    });
});

test('raw-replacement-page clamps a stale retained snapshot before displaying its complete rows',async()=>{
    const rows=[{scheduleId:'kept',kind:'delay',dueMinute:20}];
    await fixture(rows,async f=>{assert.equal(f.read().draft.page,0);assert.equal(f.host.querySelectorAll('fieldset').length,1);assert.equal(f.host.querySelector('[aria-label="Schedule 1 identity"]').value,'kept');f.remount();assert.equal(f.host.querySelectorAll('fieldset').length,1);},{draftState:{rows,raw:false,rawText:JSON.stringify(rows),feedback:'',invalid:false,invalidText:'',drafts:{},draftPaths:{},units:{},quantities:{},page:1}});
});
