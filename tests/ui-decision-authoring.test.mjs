import assert from 'node:assert/strict';
import { test } from 'node:test';
const api = await import('../src/ui/decision-authoring.js').catch(() => ({}));
const question = (id, extra = {}) => ({ id, type:'yes/no', instructions:'Keep exact words, commas.', ...extra });
test('question cards compile friendly yes/no and preserve stable IDs, structured instructions and criteria', () => {
    assert.equal(typeof api.compileQuestionRows, 'function');
    const rows = [question('question-1', { instructions:{text:['A','B']}, criteria:{true:{reason:''},false:[]} }), question('__proto__')];
    const result = api.compileQuestionRows(rows);
    assert.equal(result.ok,true);
    assert.deepEqual(JSON.parse(JSON.stringify(result.data.value)), JSON.parse('{"question-1":{"type":"noul","instructions":{"text":["A","B"]},"criteria":{"true":{"reason":""},"false":[]}},"__proto__":{"type":"noul","instructions":"Keep exact words, commas."}}'));
    assert.equal({}.polluted,undefined);
    assert.equal(rows[0].type,'yes/no');
    assert.deepEqual(Object.keys(api.compileQuestionRows([...rows].reverse()).data.value),['__proto__','question-1']);
});
test('question compilation preserves criteria absence and rejects duplicate IDs and unsupported fields', () => {
    const current={'question-1':{type:'noul',instructions:'Previous',criteria:{true:'Old'}}};
    const result=api.compileQuestionRows([question('question-1')],current);
    assert.equal(Object.hasOwn(result.data.value['question-1'],'criteria'),false);
    for(const rows of [[question('a'),question('a')],[question('')],[question('a',{privateState:true})],[question('a',{criteria:null})],[question('a',{instructions:' '})]]) assert.equal(api.compileQuestionRows(rows).ok,false);
});
test('question bounds delegate to the strict existing runtime schema', () => {
    for(const count of [1,32]) assert.equal(api.compileQuestionRows(Array.from({length:count},(_,i)=>question('q'+i))).ok,true);
    for(const count of [0,33]) assert.equal(api.compileQuestionRows(Array.from({length:count},(_,i)=>question('q'+i))).ok,false);
    for(const count of [2,255]) assert.equal(api.compileQuestionRows([question('c',{type:'choice',criteria:Object.fromEntries(Array.from({length:count},(_,i)=>['c'+i,i===0?null:'']))})]).ok,true);
    for(const count of [1,256]) assert.equal(api.compileQuestionRows([question('c',{type:'choice',criteria:Object.fromEntries(Array.from({length:count},(_,i)=>['c'+i,null]))})]).ok,false);
    for(const count of [2,10]) assert.equal(api.compileQuestionRows([question('s',{type:'score',criteria:Array(count).fill({detail:[]})})]).ok,true);
    for(const count of [1,11]) assert.equal(api.compileQuestionRows([question('s',{type:'score',criteria:Array(count).fill('')})]).ok,false);
    const getter={};Object.defineProperty(getter,'id',{enumerable:true,get(){throw Error('invoked');}});
    assert.equal(api.compileQuestionRows([getter]).ok,false);
    assert.equal(api.compileQuestionRows([question('a',{instructions:'x'.repeat(262145)})]).ok,false);
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
    const directory=await mkdtemp(join(tmpdir(),'lattice-decision-cards-')),host=document.createElement('div');document.body.append(host);let mounted;
    async function compiled(name,source) {
        const output=compile(source,{filename:name+'.svelte',generate:'client',css:'injected'});assert.deepEqual(output.warnings.filter(w=>w.code.startsWith('a11y')),[]);
        let code=output.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g,(_,q,s)=>JSON.stringify(s==='svelte'?clientURL:import.meta.resolve(s)));
        code=code.replace(/from\s+(['"])(\.\.[^'"]+)\1/g,(_,q,s)=>'from '+JSON.stringify(new URL(s,new URL('../ui/',import.meta.url)).href));
        code=code.replace(/(['"])\.\/JsonValueControl.svelte\1/g,JSON.stringify(pathToFileURL(join(directory,'JsonValueControl.mjs')).href));
        const path=join(directory,name+'.mjs');await writeFile(path,code,'utf8');return pathToFileURL(path).href;
    }
    try {
        const source=await readFile(new URL('../ui/DecisionQuestionsControl.svelte',import.meta.url),'utf8').catch(()=>null);assert.ok(source,'Question cards must exist');
        await compiled('JsonValueControl',await readFile(new URL('../ui/JsonValueControl.svelte',import.meta.url),'utf8'));
        const leaf=await compiled('DecisionQuestionsControl',source);
        const harness=await compiled('Harness',`<script>import Leaf from ${JSON.stringify(leaf)};let {initial,options}=$props();let value=$state(initial),draft=$state(),invalids=$state([]),shown=$state(true);export function read(){return {value,draft,invalids:[...invalids]};}export function remount(){shown=false;}export function show(){shown=true;}function onchange(v){value=v;}function oninvalid(text){invalids=[...invalids,text];}function onDraftState(state){draft=state;}</script>{#if shown}<Leaf {value} {onchange} {oninvalid} draftState={draft} {onDraftState} idPrefix="questions" {...options}/>{/if}`);
        mounted=mount((await import(harness)).default,{target:host,props:{initial,options}});flushSync();await check({host,read:()=>mounted.read(),remount:()=>{mounted.remount();flushSync();mounted.show();flushSync();}});
    }finally{if(mounted)await unmount(mounted);host.remove();await rm(directory,{recursive:true,force:true});}
}
function input(host,label,value,type='input'){const e=host.querySelector(`[aria-label="${label}"]`);assert.ok(e,'Missing '+label);e.value=value;e.dispatchEvent(new dom.window.Event(type,{bubbles:true}));flushSync();}
function click(host,label){const e=host.querySelector(`button[aria-label="${label}"]`);assert.ok(e,'Missing '+label);e.click();flushSync();}
test('question cards retain identity and advanced structured criteria while editing words and order',async()=>{
    await fixture({'question-1':{type:'noul',instructions:'Before',criteria:{true:{exact:[0,false,null,'']}}},other:{type:'score',instructions:[],criteria:['low','high']}},async f=>{
        input(f.host,'Question 1 instructions','After, exact');assert.deepEqual(JSON.parse(JSON.stringify(f.read().value['question-1'])),{type:'noul',instructions:'After, exact',criteria:{true:{exact:[0,false,null,'']}}});
        click(f.host,'Move question 2 up');assert.deepEqual(Object.keys(f.read().value),['other','question-1']);
        click(f.host,'Add question');assert.equal(f.read().draft.rows[2].id,'question-2');
    });
});
test('unfinished question drafts survive Advanced JSON switches and parent remounts without publishing invalid settings',async()=>{
    await fixture({'question-1':{type:'noul',instructions:'Before'}},async f=>{
        input(f.host,'Question 1 instructions','');assert.equal(f.read().value['question-1'].instructions,'Before');assert.ok(f.read().invalids.length);
        click(f.host,'Advanced questions JSON');input(f.host,'Questions JSON','{"question-1":');click(f.host,'Use question cards');f.remount();
        assert.equal(f.host.querySelector('[aria-label="Question 1 instructions"]').value,'');click(f.host,'Advanced questions JSON');assert.equal(f.host.querySelector('[aria-label="Questions JSON"]').value,'{"question-1":');
    });
});
test('disabled question cards cannot change saved settings',async()=>{
    await fixture({'q':{type:'noul',instructions:'Before'}},async f=>{input(f.host,'Question 1 instructions','After');assert.equal(f.read().value.q.instructions,'Before');},{disabled:true});
});
test('unfinished typed criteria remain visible after remount and block unrelated question edits until corrected',async()=>{
    await fixture({'q':{type:'score',instructions:'Before',criteria:['low','high']}},async f=>{
        click(f.host,'Edit Question 1 rubric levels index 0');click(f.host,'Edit Question 1 rubric levels as JSON');input(f.host,'Question 1 rubric levels JSON','{unfinished');
        click(f.host,'Advanced questions JSON');click(f.host,'Use question cards');f.remount();assert.match(f.host.textContent,/unfinished/);
        input(f.host,'Question 1 instructions','After');assert.equal(f.read().value.q.instructions,'Before');
        click(f.host,'Discard question 1 criteria draft');assert.equal(f.read().value.q.instructions,'After');
    });
});
test('retained child criteria JSON drafts can be repaired at the exact nested path after remount',async()=>{
    await fixture({'q':{type:'score',instructions:'Before',criteria:[{detail:'low'},'high']}},async f=>{
        click(f.host,'Edit Question 1 rubric levels index 0');click(f.host,'Edit Question 1 rubric levels key detail');click(f.host,'Edit Question 1 rubric levels as JSON');input(f.host,'Question 1 rubric levels JSON','{unfinished');f.remount();
        input(f.host,'Question 1 criteria unfinished JSON','"fixed"');assert.deepEqual(JSON.parse(JSON.stringify(f.read().value.q.criteria)),[{detail:'fixed'},'high']);
    });
});
