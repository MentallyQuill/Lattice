import assert from 'node:assert/strict';
import { test } from 'node:test';
const authoring = await import('../src/ui/schema-authoring.js').catch(() => ({}));
const decoder = await import('../src/workflow/operations/json-decode.js');

test('schema authoring admits exactly the existing supported keyword classes and types', () => {
    assert.equal(typeof decoder.validateJsonSchema, 'function');
    for (const type of ['null','boolean','object','array','number','integer','string']) assert.equal(decoder.validateJsonSchema({type}).ok, true);
    const schema = { type:'object', title:'Title', description:'Description', $schema:'https://example.test/subset', properties:{text:{type:'string',minLength:0,maxLength:9},count:{type:'integer',minimum:0,maximum:5},list:{type:'array',items:{enum:[null,false,0,'',{'a.b':[]}]},minItems:0,maxItems:2}}, required:['text'], additionalProperties:false, const:{text:''} };
    const result = decoder.validateJsonSchema(schema);
    assert.equal(result.ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(result.data.schema)), schema);
    for (const schema of [{type:'object',$ref:'#/other'},{type:['string','null']},{enum:[]},{additionalProperties:{}},{minLength:-1},{minimum:Infinity},{required:['a','a']}]) assert.equal(decoder.validateJsonSchema(schema).ok, false);
    const getter = {}; Object.defineProperty(getter,'type',{enumerable:true,get(){throw Error('invoked');}});
    assert.equal(decoder.validateJsonSchema(getter).ok, false);
});

test('schema admission preserves the exact schema depth and node budgets', () => {
    let depth16 = {type:'string'}; for (let index=0;index<16;index++) depth16={properties:{child:depth16}};
    assert.equal(decoder.validateJsonSchema(depth16).ok, true);
    assert.equal(decoder.validateJsonSchema({items:depth16}).ok, false);
    const nodes1000={properties:Object.fromEntries(Array.from({length:999},(_,index)=>['p'+index,{}]))};
    assert.equal(decoder.validateJsonSchema(nodes1000).ok, true);
    assert.equal(decoder.validateJsonSchema({properties:{...nodes1000.properties,extra:{}}}).ok, false);
});

test('schema patches target exact schema nodes and retain annotations and optional absence', () => {
    assert.equal(typeof authoring.updateSchemaAtPath, 'function');
    const schema={title:'Root',description:'Keep me',$schema:'subset',type:'object',properties:{'a.b':{type:'array',items:{type:'string'}}}};
    const next=authoring.updateSchemaAtPath(schema,['properties','a.b','items'],{minLength:1});
    assert.equal(next.ok,true);
    assert.deepEqual(JSON.parse(JSON.stringify(next.data.schema)),{...schema,properties:{'a.b':{type:'array',items:{type:'string',minLength:1}}}});
    assert.equal(Object.hasOwn(schema.properties['a.b'].items,'minLength'),false);
    assert.equal(Object.hasOwn(next.data.schema,'required'),false);
    for(const path of [['properties'],['properties','missing'],['title'],['constructor','prototype'],[0]]) assert.equal(authoring.updateSchemaAtPath(schema,path,{type:'string'}).ok,false);
    assert.equal(authoring.updateSchemaAtPath(schema,[],{$ref:'#/other'}).ok,false);
    const own=JSON.parse('{"type":"object","properties":{"__proto__":{}}}');
    assert.equal(authoring.updateSchemaAtPath(own,['properties','__proto__'],{const:{polluted:true}}).ok,true);
    assert.equal({}.polluted,undefined);
});

test('schema keyword removal preserves falsy typed values and never alters the input',()=>{
    assert.equal(typeof authoring.removeSchemaKeyword,'function');
    const initial={type:'object',required:['x'],additionalProperties:false,properties:{x:{const:null,enum:[0,false,'',null]}}};
    const next=authoring.removeSchemaKeyword(initial,[],'required');
    assert.equal(next.ok,true); assert.equal(Object.hasOwn(next.data.schema,'required'),false);
    assert.deepEqual(JSON.parse(JSON.stringify(next.data.schema.properties.x)),{const:null,enum:[0,false,'',null]});
    assert.deepEqual(initial.required,['x']);
    assert.equal(authoring.removeSchemaKeyword(initial,['properties'],'x').ok,false);
});

import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync } = await import(clientURL);
async function compiled(name, directory, source) {
    const output = compile(source, { filename: name + '.svelte', generate: 'client', css: 'injected' });
    assert.deepEqual(output.warnings.filter(warning => warning.code.startsWith('a11y')), []);
    let code = output.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : import.meta.resolve(specifier)));
    code = code.replace(/from\s+(['"])(\.\.[^'"]+)\1/g, (_, quote, specifier) => 'from ' + JSON.stringify(new URL(specifier, new URL('../ui/', import.meta.url)).href));
    const path = join(directory, name + '.mjs'); await writeFile(path, code, 'utf8');
    return { path, component: (await import(pathToFileURL(path).href)).default };
}
async function fixture(name, initial, check, extra = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-schema-authoring-')), host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const source = await readFile(new URL('../ui/' + name + '.svelte', import.meta.url), 'utf8').catch(() => null);
        assert.ok(source, name + ' needs a typed editor');
        const valueLeaf = await compiled('JsonValueControl', directory, await readFile(new URL('../ui/JsonValueControl.svelte', import.meta.url),'utf8'));
        const leaf = await compiled(name, directory, source.replace("'./JsonValueControl.svelte'",JSON.stringify(pathToFileURL(valueLeaf.path).href)));
        const harness = await compiled('Harness', directory, `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, options } = $props(); let text = $state(initial); let changes = $state([]); let invalids = $state([]); let draft = $state.raw(); export function read(){return {text,changes:[...changes],invalids:[...invalids],draft};} function onDraftState(next){draft=next;} function ontext(next){text=next;changes=[...changes,next];} function oninvalid(text){invalids=[...invalids,text];}</script><Leaf {text} {ontext} {oninvalid} {onDraftState} {...options} label="Test" idPrefix="json-test" />`);
        mounted = mount(harness.component, { target: host, props: { initial, options: extra } }); flushSync();
        await check({ host, read: () => mounted.read(), remount: async () => { const saved=mounted.read(); await unmount(mounted); mounted=mount(harness.component,{target:host,props:{initial:saved.text,options:{...extra,draftState:saved.draft}}}); flushSync(); } });
    } finally {
        if (mounted) await unmount(mounted); host.remove();
        const scope = relative(resolve(tmpdir()), resolve(directory)); assert.ok(scope && scope.startsWith('lattice-schema-authoring-') && !scope.startsWith('..') && !isAbsolute(scope)); await rm(directory, { recursive: true, force: true });
    }
}
function input(host, label, value, type = 'input') {
    const element = host.querySelector(`[aria-label="${label}"]`); assert.ok(element, `Missing ${label}`);
    if (element.type === 'checkbox') element.checked = value; else element.value = value;
    element.dispatchEvent(new dom.window.Event(type, { bubbles: true })); flushSync(); return element;
}
function click(host, label) { const element = host.querySelector(`button[aria-label="${label}"]`); assert.ok(element, `Missing ${label}`); element.click(); flushSync(); return element; }

test('schema builder nests exact property keys and items, toggles Required and retains annotations', async()=>{
    const original='  { "type":"object", "title":"Root", "description":"Keep", "$schema":"subset" }\n';
    await fixture('SchemaControl',original,async f=>{
        input(f.host,'Test new property','a.b'); click(f.host,'Add Test property');
        input(f.host,'Test required a.b',true,'change');
        click(f.host,'Edit Test property a.b'); input(f.host,'Test schema type','array','change');
        input(f.host,'Test items enabled',true,'change'); click(f.host,'Edit Test items');
        input(f.host,'Test schema type','string','change'); input(f.host,'Test minLength enabled',true,'change'); input(f.host,'Test minLength','2');
        assert.deepEqual(JSON.parse(f.read().text),{type:'object',title:'Root',description:'Keep',$schema:'subset',properties:{'a.b':{type:'array',items:{type:'string',minLength:2}}},required:['a.b']});
        click(f.host,'Back Test schema'); click(f.host,'Back Test schema'); input(f.host,'Test required a.b',false,'change');
        assert.equal(Object.hasOwn(JSON.parse(f.read().text),'required'),false);
        click(f.host,'Remove Test property a.b'); assert.deepEqual(JSON.parse(f.read().text).properties,{});
    });
});

test('Advanced schema JSON retains exact valid source and invalid drafts across view switches',async()=>{
    const original=' { "title" : "kept", "type" : "string" }\n';
    await fixture('SchemaControl',original,async f=>{
        click(f.host,'Edit Test schema as JSON'); assert.equal(f.host.querySelector('[aria-label="Test schema JSON"]').value,original);
        const next='\n { "type" : "integer", "minimum" : 0, "description" : "exact" }  ';
        input(f.host,'Test schema JSON',next); assert.equal(f.read().text,next);
        click(f.host,'Edit Test schema as builder'); click(f.host,'Edit Test schema as JSON'); assert.equal(f.host.querySelector('[aria-label="Test schema JSON"]').value,next); assert.equal(f.read().text,next);
        input(f.host,'Test schema JSON','{"type":'); assert.equal(f.read().text,next); assert.ok(f.read().invalids.includes('{"type":'));
        click(f.host,'Edit Test schema as builder'); assert.equal(f.host.querySelector('[aria-label="Test schema JSON"]').value,'{"type":');
        input(f.host,'Test schema JSON','{"type":"number"}'); click(f.host,'Edit Test schema as builder'); assert.equal(f.host.querySelector('[aria-label="Test schema type"]').value,'number');
    });
});

test('optional schema absence and typed enum/const preserve null and falsy values',async()=>{
    await fixture('SchemaControl','',async f=>{
        assert.equal(f.host.querySelector('[aria-label="Test schema enabled"]').checked,false);
        input(f.host,'Test schema enabled',true,'change'); assert.equal(f.read().text,'{}');
        input(f.host,'Test const enabled',true,'change'); assert.equal(JSON.parse(f.read().text).const,null);
        input(f.host,'Test const type','boolean','change'); assert.equal(JSON.parse(f.read().text).const,false);
        input(f.host,'Test enum enabled',true,'change'); click(f.host,'Add Test enum item'); click(f.host,'Edit Test enum index 1'); input(f.host,'Test enum type','number','change');
        assert.deepEqual(JSON.parse(f.read().text).enum,[null,0]);
        const retained=f.read().text; input(f.host,'Test schema enabled',false,'change'); assert.equal(f.read().text,'');
        input(f.host,'Test schema enabled',true,'change'); assert.equal(f.read().text,retained);
    });
});

test('invalid schema typed constraints notify the parent and cannot save an old valid schema',async()=>{
    await fixture('SchemaControl','{"enum":[null],"minimum":0,"maximum":9}',async f=>{
        input(f.host,'Test enum type','string','change');
        assert.deepEqual(JSON.parse(f.read().text),{enum:[null],minimum:0,maximum:9});
        assert.ok(f.read().invalids.some(source=>{try{return JSON.parse(source).enum==='';}catch{return false;}}));
        input(f.host,'Test minimum','-'); input(f.host,'Test maximum','8');
        assert.deepEqual(JSON.parse(f.read().text),{enum:[null],minimum:0,maximum:9});
        assert.equal(f.host.querySelector('[aria-label="Test enum type"]').value,'string');
        input(f.host,'Test enum type','array','change'); assert.equal(f.host.querySelectorAll('.child').length,0); click(f.host,'Add Test enum item');
        assert.deepEqual(JSON.parse(f.read().text).enum,[null]);
    });
});

test('schema controls preserve disabled behavior even under forced events',async()=>{
    await fixture('SchemaControl','{"type":"string","minLength":0}',async f=>{
        for(const editor of f.host.querySelectorAll('input,select,textarea,button')) assert.equal(editor.disabled,true);
        input(f.host,'Test minLength','2'); input(f.host,'Test schema enabled',false,'change');
        assert.equal(f.read().text,'{"type":"string","minLength":0}'); assert.equal(f.read().changes.length,0); assert.equal(f.read().invalids.length,0);
    },{disabled:true});
});

test('schema edits reject hostile path and patch descriptors without invoking them',()=>{
    let invoked=0;
    const path=[]; Object.defineProperty(path,'0',{enumerable:true,get(){invoked++;return 'items';}});
    path.length=1;
    assert.equal(authoring.updateSchemaAtPath({items:{}},path,{type:'string'}).ok,false);
    const patch={}; Object.defineProperty(patch,'type',{enumerable:true,get(){invoked++;return 'string';}});
    assert.equal(authoring.updateSchemaAtPath({},[],patch).ok,false);
    assert.equal(invoked,0);
});

test('numeric schema drafts block unrelated edits until repaired',async()=>{
    await fixture('SchemaControl','{"minimum":0,"maximum":9}',async f=>{
        input(f.host,'Test minimum','-'); input(f.host,'Test maximum','8');
        assert.equal(f.read().text,'{"minimum":0,"maximum":9}'); assert.equal(f.read().changes.length,0);
        assert.equal(f.host.querySelector('[aria-label="Test minimum"]').value,'-'); assert.ok(f.read().invalids.includes('-'));
        input(f.host,'Test minimum','2'); assert.deepEqual(JSON.parse(f.read().text),{minimum:2,maximum:9});
    });
});

test('schema inactive and invalid authored state survives parent remounts and view switches',async()=>{
    const original='  { "title":"retained", "enum":[0,false,null] }\n';
    await fixture('SchemaControl',original,async f=>{
        input(f.host,'Test schema enabled',false,'change'); assert.equal(f.read().text,'');
        assert.equal(f.read().draft.inactiveText,original); await f.remount();
        input(f.host,'Test schema enabled',true,'change'); assert.equal(f.read().text,original);
        input(f.host,'Test enum type','string','change'); assert.equal(f.read().draft.invalid,true); await f.remount();
        assert.equal(f.host.querySelector('[aria-label="Test enum type"]').value,'string');
        input(f.host,'Test schema type','boolean','change'); assert.equal(f.read().text,original); assert.equal(f.read().draft.invalid,true);
        input(f.host,'Test enum type','array','change'); click(f.host,'Add Test enum item'); assert.deepEqual(JSON.parse(f.read().text).enum,[null]);
        click(f.host,'Edit Test schema as JSON'); input(f.host,'Test schema JSON','{"type":'); await f.remount();
        assert.equal(f.host.querySelector('[aria-label="Test schema JSON"]').value,'{"type":');
        assert.equal(f.read().draft.invalidText,'{"type":'); click(f.host,'Edit Test schema as builder');
        assert.equal(f.host.querySelector('[aria-label="Test schema JSON"]').value,'{"type":');
        input(f.host,'Test schema JSON','{"type":"integer"}'); click(f.host,'Edit Test schema as builder'); assert.equal(f.read().draft.invalid,false);
    });
});

test('invalid builder edits remain repairable through Advanced schema JSON',async()=>{
    await fixture('SchemaControl','{"minimum":0}',async f=>{
        input(f.host,'Test minimum','-'); click(f.host,'Edit Test schema as JSON');
        assert.equal(f.host.querySelector('[aria-label="Test schema JSON"]')?.value,'-');
        await f.remount(); assert.equal(f.host.querySelector('[aria-label="Test schema JSON"]').value,'-');
        input(f.host,'Test schema JSON','{"minimum":3}'); click(f.host,'Edit Test schema as builder');
        assert.equal(f.host.querySelector('[aria-label="Test minimum"]').value,'3'); assert.equal(f.read().draft.invalid,false);
    });
});
