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

import { inspectorComponent, control, input, click, nodeAt } from './helpers/inspector-component.mjs';

test('raw schema JSON keeps exact source and unfinished drafts across view switches and remounts', async () => {
 const original=' { "title" : "kept", "type" : "string" }\n';
 await inspectorComponent('SchemaControl', original, {}, async f => {
  click(f.host,'Edit Test schema as JSON'); assert.equal(control(f.host,'Test schema JSON').value,original);
  const next='\n { "type" : "integer", "minimum" : 0, "description" : "exact" }  ';
  input(f.host,'Test schema JSON',next); click(f.host,'Edit Test schema as builder'); click(f.host,'Edit Test schema as JSON');
  assert.equal(control(f.host,'Test schema JSON').value,next); assert.equal(f.read().text,next);
  input(f.host,'Test schema JSON','{"type":'); await f.remount();
  assert.equal(control(f.host,'Test schema JSON').value,'{"type":'); assert.equal(f.read().draft.invalid,true);
  click(f.host,'Edit Test schema as builder'); assert.equal(control(f.host,'Test schema JSON').value,'{"type":');
  input(f.host,'Test schema JSON','{"type":"number"}'); click(f.host,'Edit Test schema as builder');
  assert.equal(control(f.host,'Test schema type').value,'number'); assert.equal(f.read().draft.invalid,false);
 });
});

test('optional schema absence and typed rules preserve exact null and falsy values', async () => {
 await inspectorComponent('SchemaControl','',{},async f=>{
  assert.equal(control(f.host,'Test schema type').value,''); assert.equal(f.read().text,'');
  input(f.host,'Add metadata or rule','const','change'); assert.equal(JSON.parse(f.read().text).const,null);
  input(f.host,'Test const type','boolean','change'); assert.equal(JSON.parse(f.read().text).const,false);
  input(f.host,'Add metadata or rule','enum','change'); assert.deepEqual(JSON.parse(f.read().text).enum,[null]);
  click(f.host,'Add Test enum item'); click(f.host,'Edit Test enum index 1'); input(f.host,'Test enum type','number','change');
  assert.deepEqual(JSON.parse(f.read().text).enum,[null,0]);
  click(f.host,'Edit Test schema as JSON'); input(f.host,'Test schema JSON',''); assert.equal(f.read().text,'');
 });
});

test('numeric drafts block unrelated edits and retain a whole recoverable schema document', async () => {
 await inspectorComponent('SchemaControl','{"type":"number","minimum":0,"maximum":9,"title":"Keep"}',{},async f=>{
  input(f.host,'Test minimum value','-'); input(f.host,'Test maximum value','8');
  assert.equal(f.read().text,'{"type":"number","minimum":0,"maximum":9,"title":"Keep"}');
  assert.equal(control(f.host,'Test minimum value').value,'-'); assert.ok(f.read().invalids.includes('-'));
  click(f.host,'Edit Test schema as JSON'); const source=control(f.host,'Test schema JSON').value;
  assert.ok(source.includes('minimum')&&source.includes('maximum')&&source.includes('Keep'));
  await f.remount(); assert.equal(control(f.host,'Test schema JSON').value,source);
  input(f.host,'Test schema JSON','{"type":"number","minimum":3,"maximum":9,"title":"Keep"}');
  click(f.host,'Edit Test schema as builder'); assert.equal(control(f.host,'Test minimum value').value,'3');
 });
});

test('rules for other types are retained and remain editable after a type change', async () => {
 const source='{"type":"object","required":["missing"],"properties":{"x":{"type":"string"}},"items":{"type":"number"},"minimum":0}';
 await inspectorComponent('SchemaControl',source,{},async f=>{
  input(f.host,'Test schema type','boolean','change'); const value=JSON.parse(f.read().text);
  assert.deepEqual(value.required,['missing']); assert.equal(value.items.type,'number'); assert.equal(value.minimum,0);
  click(f.host,'Remove required key missing'); assert.equal(Object.hasOwn(JSON.parse(f.read().text),'required'),false);
  assert.ok(control(f.host,'Edit Test field x')); assert.ok(control(f.host,'Edit Test list item definition'));
 });
});

test('schema edits reject hostile path and patch descriptors without invoking them',()=>{
 let invoked=0; const path=[]; Object.defineProperty(path,'0',{enumerable:true,get(){invoked++;return 'items';}}); path.length=1;
 assert.equal(authoring.updateSchemaAtPath({items:{}},path,{type:'string'}).ok,false);
 const patch={}; Object.defineProperty(patch,'type',{enumerable:true,get(){invoked++;return 'string';}});
 assert.equal(authoring.updateSchemaAtPath({},[],patch).ok,false); assert.equal(invoked,0);
});
