import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseControlTableImport } from '../src/ui/control-table-import.js';
import { resolveControlInputSpec } from '../src/ui/control-input-contracts.js';
import { OPERATIONS } from '../src/workflow/catalog.js';
const spec = (operation, key, mode) => resolveControlInputSpec({operation, key, controls: {...OPERATIONS[operation].defaults, ...(mode ? {mode} : {})}, descriptor: OPERATIONS[operation].controlDescriptors[key]});
const pattern = spec('pattern', 'rules', 'literal');
const parse = (text, columns, currentValue = [], action = 'replace', inputSpec = pattern, delimiter = ',') => parseControlTableImport(inputSpec, text, {columns, currentValue, action, delimiter});

test('mapped headers preserve quoted multiline expressions and optional labels without mutating current records', () => {
    const current = [{id: 'old', pattern: 'keep', label: 'Retained'}], original = structuredClone(current);
    const result = parse('Label,Expression,Identity\n"Color\nline","red, blue",authored', {pattern: 'Expression', label: 'Label', id: 'Identity'}, current);
    assert.deepEqual(result, {ok: true, data: {value: [{id: 'authored', pattern: 'red, blue', label: 'Color\nline'}], rows: [{id: 'authored', pattern: 'red, blue', label: 'Color\nline'}], warnings: []}});
    assert.deepEqual(current, original);
    result.data.value[0].label = 'changed'; assert.deepEqual(current, original);
});

test('replace without identity or label columns reuses exact records and allocates stable smallest IDs', () => {
    const current = [{id: 'pattern-1', pattern: 'a', label: 'A'}, {id: 'pattern-3', pattern: 'b'}];
    assert.deepEqual(parse('pattern\nb\nnew\na', {pattern: 'pattern'}, current).data.value, [{id:'pattern-3',pattern:'b'}, {id:'pattern-2',pattern:'new'}, {id:'pattern-1',pattern:'a',label:'A'}]);
});

test('add keeps existing rows, generates distinct IDs for duplicate terms, and ignores fully blank rows visibly', () => {
    const current = [{id: 'pattern-1', pattern: 'a', label: ''}];
    const result = parse('pattern\na\n\na\n', {pattern:'pattern'}, current, 'add');
    assert.deepEqual(result.data.value, [...current, {id:'pattern-2',pattern:'a'}, {id:'pattern-3',pattern:'a'}]);
    assert.equal(result.data.rows.length, 2); assert.match(result.data.warnings.join(' '), /2 blank rows/);
});

test('invalid mapped cells retain source row and column coordinates', () => {
    for (const [text, columns, row, cell] of [
        ['id,pattern\nsame,a\nsame,b', {id:'id',pattern:'pattern'}, 3, 1],
        ['id,pattern\nx,', {id:'id',pattern:'pattern'}, 2, 2],
        ['pattern,label\na', {pattern:'pattern',label:'label'}, 2, 2],
        ['pattern,pattern\na,b', {pattern:'pattern'}, 1, 2],
        ['pattern\na', {pattern:'absent'}, 1, 1],
    ]) {
        const result = parse(text, columns); assert.equal(result.ok, false, text); assert.equal(result.error.row, row); assert.equal(result.error.cell, cell);
    }
    assert.equal(parse('id,pattern\nold,b', {id:'id',pattern:'pattern'}, [{id:'old',pattern:'a'}], 'add').error.row, 2);
});

test('explicit TSV delimiter imports Extract and slots with canonical boolean cells', () => {
    assert.deepEqual(parse('literal\tlabel\tid\nred, blue\t\tx', {literal:'literal',label:'label',id:'id'}, [], 'replace', spec('extract','patterns'), '\t').data.value, [{id:'x',literal:'red, blue',label:''}]);
    assert.deepEqual(parse('label,required\nOptional,false', {label:'label',required:'required'}, [], 'replace', spec('join','inputs')).data.value, [{id:'slot-1',label:'Optional',required:false}]);
    assert.deepEqual(parse('label\nRequired', {label:'label'}, [], 'replace', spec('collect','inputs')).data.value, [{id:'slot-1',label:'Required',required:true}]);
    const result = parse('label,required\nWrong,yes', {label:'label',required:'required'}, [], 'replace', spec('join','inputs'));
    assert.equal(result.ok, false); assert.equal(result.error.row,2); assert.equal(result.error.cell,2); assert.match(result.error.message,/true.*false/);
});

test('typed mapping cells preserve literal path keys and explicit null false zero empty string and absence defaults', () => {
    const input = spec('format','fields');
    const text = 'name\tpath\trequired\tdefault\nNull\t"[""a.b,c"",0]"\tfalse\tnull\nZero\t[]\t\t0\nFalse\t[]\t\tfalse\nEmpty\t[]\t\t""""""\nAbsent\t[]\t\t';
    const result = parse(text, {name:'name',path:'path',required:'required',default:'default'}, [], 'replace', input, '\t');
    assert.deepEqual(result.data.value, [{name:'Null',path:['a.b,c',0],required:false,default:null}, {name:'Zero',path:[],default:0}, {name:'False',path:[],default:false}, {name:'Empty',path:[],default:''}, {name:'Absent',path:[]}]);
    for (const path of ['a.b,c', '[true]', '[-1]']) {
        const result = parse('name\tpath\nField\t' + path, {name:'name',path:'path'}, [], 'replace', input, '\t');
        assert.equal(result.ok,false); assert.equal(result.error.row,2); assert.equal(result.error.cell,2); assert.match(result.error.message,/JSON.*path|path.*JSON/i);
    }
    const invalid = parse('name\tpath\tdefault\nField\t[]\tundefined', {name:'name',path:'path',default:'default'}, [], 'replace', input, '\t');
    assert.equal(invalid.ok,false); assert.equal(invalid.error.cell,3);
});

test('Text Rules imports explicit kinds with omitted or empty optional cells', () => {
    const input = spec('text-rules','rules');
    assert.deepEqual(parse('kind\tpattern\treplacement\tflags\nregex\ta{1,3}\t\ti', {kind:'kind',pattern:'pattern',replacement:'replacement',flags:'flags'}, [], 'replace', input, '\t').data.value,[{kind:'regex',pattern:'a{1,3}',replacement:'',flags:'i'}]);
    assert.deepEqual(parse('kind,pattern\nliteral,hello', {kind:'kind',pattern:'pattern'}, [], 'replace', input).data.value,[{kind:'literal',pattern:'hello'}]);
    const result = parse('kind,pattern\nregex,[', {kind:'kind',pattern:'pattern'}, [], 'replace', input); assert.equal(result.ok,false); assert.equal(result.error.row,2); assert.equal(result.error.cell,2);
});

test('unsupported controls, unknown mappings and malformed existing canonical rows fail without inferred intent', () => {
    assert.equal(parse('name\nhello', {name:'name'}, [], 'replace', spec('compose','sections')).ok,false);
    assert.equal(parse('pattern\na', {pattern:'pattern',schedule:'pattern'}).ok,false);
    assert.equal(parse('pattern\na', {pattern:'pattern'}, [{id:'broken',pattern:'a',secret:true}], 'add').ok,false);
    const result = parse('pattern\na', {pattern:'pattern'}, Array.from({length:128},(_,i)=>({id:'p'+i,pattern:'x'})), 'add'); assert.equal(result.ok,false);
    let calls=0; const hostile={}; Object.defineProperty(hostile,'action',{enumerable:true,get(){calls++; return 'replace';}});
    assert.equal(parseControlTableImport(pattern,'pattern\na',hostile).ok,false); assert.equal(calls,0);
});

test('explicit IDs are reserved before generated rows allocate the smallest unused suffix', () => {
    const result=parse('pattern,id\nnew,\nexplicit,pattern-2', {pattern:'pattern',id:'id'}, [{id:'pattern-1',pattern:'old'}], 'add');
    assert.equal(result.ok,true);
    assert.deepEqual(result.data.rows,[{id:'pattern-3',pattern:'new'},{id:'pattern-2',pattern:'explicit'}]);
});

test('valid empty slot labels and literal whitespace cells preserve canonical authoring', () => {
    const slot=parse('id,label\nx,""', {id:'id',label:'label'}, [], 'replace', spec('join','inputs'));
    assert.equal(slot.ok,true);assert.deepEqual(slot.data.value,[{id:'x',label:'',required:true}]);
    const rule=parse('kind,pattern\nliteral," "', {kind:'kind',pattern:'pattern'}, [], 'replace', spec('text-rules','rules'));
    assert.equal(rule.ok,true);assert.deepEqual(rule.data.value,[{kind:'literal',pattern:' '}]);
});

test('invalid slot limits and duplicate field names identify the actual source cell', () => {
    for (const [text, row, cell] of [['label,id\nGood,out',2,2], ['label,id\n'+'a'.repeat(81)+',x\nFine,y',2,1]]) {
        const result=parse(text,{label:'label',id:'id'},[],'replace',spec('join','inputs'));
        assert.equal(result.ok,false);assert.equal(result.error.row,row);assert.equal(result.error.cell,cell);
    }
    const result=parse('path,name\n[],same\n[],same',{path:'path',name:'name'},[],'replace',spec('select-fields','fields'));
    assert.equal(result.ok,false);assert.equal(result.error.row,3);assert.equal(result.error.cell,2);
});

test('invalid Pattern regex cells point to the mapped expression column', () => {
    const result=parse('id,pattern\nx,[',{id:'id',pattern:'pattern'},[],'replace',spec('pattern','rules','regex'));
    assert.equal(result.ok,false);assert.equal(result.error.row,2);assert.equal(result.error.cell,2);
});

test('Pattern labels obey current engine bounds without narrowing Extract labels', () => {
    const text='pattern,label\na,'+'x'.repeat(129);
    const patternResult=parse(text,{pattern:'pattern',label:'label'});
    assert.equal(patternResult.ok,false);assert.equal(patternResult.error.row,2);assert.equal(patternResult.error.cell,2);
    assert.equal(parse(text.replace('pattern,','literal,'),{literal:'literal',label:'label'},[],'replace',spec('extract','patterns')).ok,true);
});
