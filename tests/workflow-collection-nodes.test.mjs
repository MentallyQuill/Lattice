import assert from 'node:assert/strict';
import test from 'node:test';
import { executeCollection, describeCollection, reduceCollection } from '../src/workflow/operations/collection-nodes.js';
const data=value=>({kind:'data',value});
const records=[{id:'first',actorId:'mara',points:20},{id:'second',actorId:'elias',points:50},{id:'third',actorId:'mara',points:30}];
test('filter preserves event ordering for a later count or sum reducer', () => {
    const filtered=executeCollection({operation:'collection',mode:'filter',fieldPath:['actorId'],value:'mara'},{in:data(records)});
    assert.equal(filtered.ok,true,JSON.stringify(filtered.error));
    assert.deepEqual(filtered.artifact.value.map(record=>record.id),['first','third']);
    const count=executeCollection({operation:'collection',mode:'count'},{in:filtered.artifact});
    assert.equal(count.ok,true,JSON.stringify(count.error));
    assert.equal(count.artifact.value,2);
    const sum=executeCollection({operation:'collection',mode:'sum',fieldPath:['points']},{in:filtered.artifact});
    assert.equal(sum.ok,true,JSON.stringify(sum.error));
    assert.equal(sum.artifact.value,50);
});
test('filter accepts an authored numeric Value for numeric comparisons', () => {
    const result=executeCollection({operation:'collection',mode:'filter',fieldPath:['points'],operator:'at-least',value:30},{in:data(records)});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value.map(record=>record.id),['second','third']);
});
test('Collection describes authored Value with the typed JSON editor and compatible string bound', () => {
    const described=describeCollection({operation:'collection',mode:'filter',value:30});
    assert.equal(described.ok,true,JSON.stringify(described.error));
    const value=described.data.descriptor.controlDescriptors.value;
    assert.equal(value.type,'json-value');
    assert.equal(value.editor,'json');
    assert.equal(value.default,'');
    assert.equal(value.maxLength,4096);
});
test('a wired numeric Match overrides the authored typed Value even when Match is zero', () => {
    const result=executeCollection({operation:'collection',mode:'filter',fieldPath:['points'],value:30},{in:data([{id:'zero',points:0},...records]),match:data(0)});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value.map(record=>record.id),['zero']);
});
test('authored Boolean, null, array and object Values retain exact JSON equality', () => {
    const cases=[
        {value:false,actual:false,other:'false'},
        {value:null,actual:null,other:'null'},
        {value:[1,false],actual:[1,false],other:['1',false]},
        {value:{points:10,active:true},actual:{active:true,points:10},other:{active:true,points:'10'}},
    ];
    for(const {value,actual,other} of cases) {
        const result=executeCollection({operation:'collection',mode:'filter',fieldPath:['value'],value},{in:data([{id:'exact',value:actual},{id:'different',value:other}])});
        assert.equal(result.ok,true,JSON.stringify(result.error));
        assert.deepEqual(result.artifact.value.map(record=>record.id),['exact']);
    }
});
test('authored numeric Value never coerces strings for numeric comparison', () => {
    const stringValue=executeCollection({operation:'collection',mode:'filter',fieldPath:['points'],operator:'at-least',value:'30'},{in:data(records)});
    assert.equal(stringValue.ok,false);
    assert.equal(stringValue.error.code,'INVALID_COMPARISON');
    const stringField=executeCollection({operation:'collection',mode:'filter',fieldPath:['points'],operator:'at-least',value:30},{in:data([{points:'50'}])});
    assert.equal(stringField.ok,false);
    assert.equal(stringField.error.code,'INVALID_COMPARISON');
});
test('Collection rejects malformed authored JSON without evaluating getters', () => {
    let reads=0;
    const accessor={};Object.defineProperty(accessor,'secret',{enumerable:true,get(){reads++;return 'secret';}});
    const cycle={};cycle.self=cycle;
    const sparse=[];sparse.length=1;
    for(const value of [undefined,NaN,Infinity,Symbol('value'),()=>0,Object.create({inherited:true}),accessor,cycle,sparse]) {
        const result=executeCollection({operation:'collection',mode:'filter',fieldPath:['points'],value},{in:data(records)});
        assert.equal(result.ok,false);
        assert.equal(result.artifact,undefined);
    }
    assert.equal(reads,0);
});
test('Collection keeps the authored string bound and overall JSON clone limits', () => {
    const value='x'.repeat(4096);
    const bounded=executeCollection({operation:'collection',mode:'filter',fieldPath:[],value},{in:data([value])});
    assert.equal(bounded.ok,true,JSON.stringify(bounded.error));
    assert.deepEqual(bounded.artifact.value,[value]);
    for(const value of ['x'.repeat(4097),{nested:'x'.repeat(262144)},Array(10001).fill(0)]) {
        const result=executeCollection({operation:'collection',mode:'filter',value},{in:data([])});
        assert.equal(result.ok,false);
        assert.equal(result.artifact,undefined);
    }
});
test('rule lookup selects authored matching rules without inventing rewards', () => {
    const table={ruleSetId:'rewards',revision:1,rules:[{ruleId:'quest',eventType:'quest-completed',amount:100},{ruleId:'kill',eventType:'enemy-defeated',amount:20}]};
    const result=executeCollection({operation:'collection',mode:'rule-lookup',fieldPath:['eventType'],value:'enemy-defeated'},{in:data(table)});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value,[{ruleId:'kill',eventType:'enemy-defeated',amount:20}]);
    assert.equal(table.rules.length,2);
});
test('threshold mode enumerates every crossed milestone through the shared progression engine', () => {
    const result=executeCollection({operation:'collection',mode:'threshold',thresholds:'[0,100,300,600]'},{in:data({before:80,after:650})});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(result.artifact.value.crossings.map(crossing=>crossing.threshold),[100,300,600]);
    assert.equal(result.artifact.value.afterBand,4);
});
test('unique merge preserves source order and refuses conflicting duplicate identities', () => {
    const merged=executeCollection({operation:'collection',mode:'merge',mergePolicy:'add-unique',identityPath:['id']},{in:data(records.slice(0,2)),other:data([records[0],records[2]])});
    assert.equal(merged.ok,true,JSON.stringify(merged.error));
    assert.deepEqual(merged.artifact.value.map(value=>value.id),['first','second','third']);
    const conflict=executeCollection({operation:'collection',mode:'merge',mergePolicy:'add-unique',identityPath:['id']},{in:data(records),other:data([{...records[0],points:99}])});
    assert.equal(conflict.ok,false);
    assert.equal(conflict.error.code,'IDENTITY_CONFLICT');
});
test('lookup detects ambiguous identity and explicit missing-field policy controls filtering', () => {
    const selected=executeCollection({operation:'collection',mode:'lookup',fieldPath:['id'],value:'second'},{in:data(records)});
    assert.equal(selected.ok,true,JSON.stringify(selected.error));
    assert.equal(selected.artifact.value.value.points,50);
    const ambiguous=executeCollection({operation:'collection',mode:'lookup',fieldPath:['actorId'],value:'mara'},{in:data(records)});
    assert.equal(ambiguous.ok,false);
    assert.equal(ambiguous.error.code,'AMBIGUOUS_LOOKUP');
    const held=executeCollection({operation:'collection',mode:'filter',fieldPath:['missing'],value:'mara'},{in:data(records)});
    assert.equal(held.ok,true);
    assert.equal(held.outputStates.out.status,'unresolved');
    const excluded=executeCollection({operation:'collection',mode:'filter',fieldPath:['missing'],missingPolicy:'exclude',value:'mara'},{in:data(records)});
    assert.equal(excluded.ok,true,JSON.stringify(excluded.error));
    assert.deepEqual(excluded.artifact.value,[]);
});
test('empty collections count and sum to zero without model work', () => {
    assert.deepEqual(reduceCollection([],{mode:'count'}),{ok:true,data:{value:0,actualCalls:0}});
    assert.deepEqual(reduceCollection([],{mode:'sum',fieldPath:['points']}),{ok:true,data:{value:0,actualCalls:0}});
    const described=describeCollection({operation:'collection',mode:'count'},{phase:'post'});
    assert.equal(described.ok,true);
    assert.equal(described.data.descriptor.requestBound,0);
});
