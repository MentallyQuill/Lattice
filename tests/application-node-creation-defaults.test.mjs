import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {operationDefaults,OPERATIONS} from '../src/workflow/catalog.js';
import {prepareNativeConnectionEdit} from '../src/workflow/connection-edits.js';
const source=await readFile(new URL('../src/ui/controller.js',import.meta.url),'utf8'),start=source.indexOf('function requestNodeCreation('),end=source.indexOf('\n}',start)+2;
const graph={id:'shelf',name:'Shelf',schema:3,runtime:2,mode:'native-unified',roles:{},nodes:{},wires:{},groups:{},portals:{},definitions:{},view:{x:0,y:0,zoom:1}};
function request(command){const env={editorCurrent:()=>true,operationDefaults,OPERATIONS,graphViews:{readEditor:()=>({prepared:{savedGraph:graph},view:{identity:{kind:'root'}}})},editorDraw:{nativeCards:{}},selected:null,configuredCreationStage:()=>({phase:command.phase??'pre'}),prepareNativeCreation:(_capture,value)=>prepareNativeConnectionEdit(graph,{...value,graphPoint:{x:0,y:0}}),prepareShelfNodeCreation:()=>{throw Error('unexpected')}};return Function('env','with(env){'+source.slice(start,end)+';return requestNodeCreation;}')(env)({},command);}
test('reroute retains its top-level artifact kind and ordinary presets',()=>{const result=request({kind:'create',operation:'reroute',artifactKind:'data',phase:'pre'});assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(Object.values(result.data.candidate.nodes)[0].artifactKind,'data');});
test('managed file creation retains explicit defaults and caller overrides',()=>{const result=request({kind:'create',operation:'write-file',phase:'post',controls:{fileHandling:'append'}});assert.equal(result.ok,true,JSON.stringify(result.error));const node=Object.values(result.data.candidate.nodes)[0];assert.deepEqual(node.fileTarget,{managed:true});assert.equal(node.destinationMode,'own');assert.equal(node.fileHandling,'append');});
