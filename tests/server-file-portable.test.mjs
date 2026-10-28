import assert from 'node:assert/strict';
import test from 'node:test';
import {exportWorkflow} from '../src/workflow/packages.js';
import {operationDefaults} from '../src/workflow/catalog.js';
test('portable node files keep the suggested name while stripping server paths and bindings',()=>{
 const fileTarget={bindingId:'server-capability',path:'C:\\Private\\Scenes\\SceneContext.txt',name:'SceneContext.txt',format:'text',missing:'create',content:'',visibility:{kind:'public'}};
 const graph={id:'paths',name:'Paths',schema:3,runtime:2,mode:'native-unified',nodes:{file:{id:'file',type:'workflow',...operationDefaults('read-file'),targetId:'notes',fileTarget}},wires:{},groups:{},portals:{},definitions:{}};
 const exported=exportWorkflow(graph),portable=exported.graph.nodes.file.fileTarget;
 assert.equal(portable.name,'SceneContext.txt');assert.equal(portable.bindingId,'');assert.equal(Object.hasOwn(portable,'path'),false);
 assert.equal(graph.nodes.file.fileTarget.path,fileTarget.path,'local authoring retains the configured path');
});
