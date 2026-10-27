import assert from 'node:assert/strict';
import {test} from 'node:test';
import {inspectorComponent,control,input,click} from './helpers/inspector-component.mjs';

test('repeated records use inline disclosures and open new rows without losing existing values',async()=>{
 const rows=[{name:'first',text:'Keep me'},{name:'second',text:'Inspect me'}];
 const metadata={key:'sections',label:'Sections',editor:'json',representation:'json-value',structured:'sections',value:rows};
 await inspectorComponent('StructuredControl',JSON.stringify(rows),{control:metadata},async f=>{
  const records=f.host.querySelectorAll('details[data-record-row]');assert.equal(records.length,2);
  assert.equal(records[0].open,true);assert.equal(records[1].open,false);
  assert.match(records[1].querySelector('summary').textContent,/second/);
  click(f.host,'Add section');const added=f.host.querySelectorAll('details[data-record-row]')[2];assert.equal(added.open,true);
  input(added,'Section 3 text','New value');assert.equal(JSON.parse(f.read().text)[0].text,'Keep me');assert.equal(JSON.parse(f.read().text)[2].text,'New value');
 });
});

test('typed JSON values expand inline and preserve exact keys, values and siblings',async()=>{
 const value=JSON.parse('{"a.b":{"items":[false,null]},"__proto__":0,"sibling":"Keep"}');
 await inspectorComponent('JsonValueControl',value,{},async f=>{
  click(f.host,'Edit Test key a.b');const nested=f.host.querySelector('[data-value-path=\'["a.b"]\']');assert.ok(nested);
  assert.ok(control(f.host,'Edit Test key sibling'));assert.equal(f.host.querySelector('[aria-label="Back Test"]'),null);
  click(nested,'Edit Test key items');const list=f.host.querySelector('[data-value-path=\'["a.b","items"]\']');
  click(list,'Edit Test index 0');const item=f.host.querySelector('[data-value-path=\'["a.b","items",0]\']');
  input(item,'Test type','number','change');input(item,'Test number','5');
  assert.deepEqual(f.read().value,JSON.parse('{"a.b":{"items":[5,null]},"__proto__":0,"sibling":"Keep"}'));
  assert.ok(f.host.querySelector('[role="region"][tabindex="0"]'));
 });
});

test('typed JSON readonly inspection expands values and rejects synthetic mutation',async()=>{
 await inspectorComponent('JsonValueControl',{nested:[0,false]}, {disabled:true},async f=>{
  click(f.host,'Edit Test key nested');const list=f.host.querySelector('[data-value-path=\'["nested"]\']');assert.ok(list);
  click(list,'Edit Test index 0');const item=f.host.querySelector('[data-value-path=\'["nested",0]\']');
  assert.equal(control(item,'Test number').disabled,true);input(item,'Test number','7');assert.equal(f.read().value.nested[0],0);
 });
});

for(const [component,value] of [
 ['DecisionQuestionsControl',{first:{type:'noul',instructions:'First?'},second:{type:'noul',instructions:'Second?'}}],
 ['ScheduleControl',[{scheduleId:'first',kind:'daily',minuteOfDay:0},{scheduleId:'second',kind:'daily',minuteOfDay:1}]],
])test(component+' keeps repeated entries compact and inspectable in readonly mode',async()=>{
 await inspectorComponent(component,value,{disabled:true},async f=>{
  const records=f.host.querySelectorAll('details[data-record-row]');assert.equal(records.length,2);
  assert.equal(records[0].open,true);assert.equal(records[1].open,false);
  records[1].querySelector('summary').click();assert.equal(records[1].open,true);
  assert.deepEqual(f.read().value,value);assert.equal(f.read().changes.length,0);
 });
});

test('renaming an expanded schedule retains its editing disclosure',async()=>{
 await inspectorComponent('ScheduleControl',[{scheduleId:'first',kind:'daily',minuteOfDay:0}],{},async f=>{
  input(f.host,'Schedule 1 identity','renamed');
  assert.equal(f.read().value[0].scheduleId,'renamed');
  assert.equal(f.host.querySelector('details[data-record-row]').open,true);
 });
});
