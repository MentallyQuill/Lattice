import assert from 'node:assert/strict';
import test from 'node:test';
import { operationDefaults, semanticControlsForNode } from '../src/workflow/catalog.js?v=0.29.0';
import { exportWorkflow } from '../src/workflow/packages.js?v=0.29.0';
import { describeFileNode, executeFileNode } from '../src/workflow/operations/file-nodes.js?v=0.29.0';
import { createFileStore } from '../src/workflow/file-store.js?v=0.29.0';
const targets=await import('../src/workflow/node-file-targets.js?v=0.29.0').catch(()=>({}));
const target={bindingId:'native-handle-1',name:'notes.txt',format:'text',missing:'create',content:'',visibility:{kind:'public'}};
const node=(operation,settings={})=>({id:operation,type:'workflow',...operationDefaults(operation),...settings});

test('file destination validation rejects path names, unknown authority and unbounded settings',()=>{
    assert.equal(typeof targets.validateNodeFileTarget,'function');
    assert.equal(targets.validateNodeFileTarget(target).ok,true);
    for(const invalid of [{...target,name:'../notes.txt'},{...target,name:'C:\\notes.txt'},{...target,handle:{}},{...target,missing:'overwrite'},{...target,visibility:{kind:'actor-private'}}])assert.equal(targets.validateNodeFileTarget(invalid).ok,false);
    assert.deepEqual(targets.validateNodeFileTarget({}).data,{});
});

test('file defaults preserve semantic identity and portable packages strip local authority',()=>{
    const read={...node('read-file',{targetId:'notes',fileTarget:target}),id:'read'};
    const described=describeFileNode(read,{authoring:true});assert.equal(described.ok,true,JSON.stringify(described));
    assert.equal(described.data.descriptor.controls.includes('fileTarget'),true);
    for(const operation of ['read-file','write-file','story-clock','commit-outcomes','random-pick'])assert.equal(Object.hasOwn(semanticControlsForNode(node(operation)),'fileTarget'),false);
    assert.equal(Object.hasOwn(semanticControlsForNode(node('write-file')),'destinationMode'),false);
    const graph={id:'files',name:'Files',schema:3,runtime:2,mode:'native-unified',nodes:{read},wires:{},portals:{},definitions:{},runTargets:[]};
    const portable=exportWorkflow(graph).graph.nodes.read.fileTarget;
    assert.equal(portable.bindingId,'');assert.equal(portable.name,'notes.txt');assert.equal(read.fileTarget.bindingId,'native-handle-1');
});


test('own-file Write validates the same read path and stages only the selected logical target',async()=>{
    let staged,writes=0;
    const files=createFileStore({scope:{userId:'u',chatId:'c'},authorizedTargets:['notes'],load:async()=>({ok:true,data:{targetId:'notes',revision:'disk:r1',format:'text',content:'Before',receipts:[]}}),compareAndSwap:async()=>{writes++;return {ok:true,data:{applied:true,acknowledged:true,revision:'disk:r2'}};},isCurrent:()=>true,validateEvidence:async()=>({ok:true})});
    const local={root:true,phase:'post',files,fileVisibility:()=>({ok:true,data:{kind:'public'}}),createIntentId:()=>({ok:true,data:'own-write'}),authorizeFileWrite:()=>({ok:true,data:{destinationVisibility:{kind:'public'}}}),stageFileIntent:prepared=>{staged=prepared;return {ok:true};}};
    const write=await executeFileNode(node('write-file',{destinationMode:'own',targetId:'notes',fileTarget:target}),{text:{kind:'text',text:'After'}},local);
    assert.equal(write.ok,true,JSON.stringify(write));assert.equal(write.outputs.projection.value.content,'Before\nAfter');assert.equal(staged.plan.targetId,'notes');assert.equal(writes,0);
    const forged=await executeFileNode(node('write-file',{destinationMode:'own',targetId:'notes',fileTarget:target}),{reference:{kind:'data',value:{targetId:'notes'}},text:{kind:'text',text:'After'}},local);assert.equal(forged.error.code,'FILE_REFERENCE_UNAUTHORIZED');
});
test('captured targets keep handle authority separate and reject conflicting logical mappings',()=>{
    assert.equal(typeof targets.captureNodeFileTargets,'function');
    const read=node('read-file',{targetId:'notes',fileTarget:target});
    const other={...read,id:'other',fileTarget:{...target,bindingId:'second-handle'}};
    const captured=targets.captureNodeFileTargets([read]);assert.equal(captured.ok,true,JSON.stringify(captured));assert.equal(captured.data.definitions[0].targetId,'notes');assert.equal(captured.data.definitions[0].bindingId,'native-handle-1');
    assert.equal(targets.captureNodeFileTargets([read,other]).error.code,'FILE_TARGET_CONFLICT');
    assert.equal(targets.captureNodeFileTargets([read,{...read,id:'alias',targetId:'another'}]).error.code,'FILE_TARGET_CONFLICT');
    assert.equal(targets.captureNodeFileTargets([node('story-clock')]).error.code,'FILE_SETUP_REQUIRED');
    assert.equal(targets.captureNodeFileTargets([node('read-file',{targetId:'legacy'})],{legacyDocuments:[{targetId:'legacy',format:'text',content:'old',visibility:{kind:'public'}}]}).ok,true);
});
test('shared actor-private destinations accept equivalent imported visibility key order',()=>{
    const first=node('read-file',{targetId:'notes',fileTarget:{...target,visibility:{kind:'actor-private',actorId:'mara'}}});
    const second={...first,id:'other',fileTarget:{...target,visibility:{actorId:'mara',kind:'actor-private'}}};
    const captured=targets.captureNodeFileTargets([first,second]);
    assert.equal(captured.ok,true,JSON.stringify(captured));
    assert.equal(captured.data.definitions.length,1);
    assert.deepEqual(captured.data.definitions[0].visibility,{kind:'actor-private',actorId:'mara'});
});
test('native access errors retain actionable codes without exposing backend paths',async()=>{
 const result=await executeFileNode(node('read-file',{targetId:'notes'}),{},{root:true,phase:'pre',files:{read:async()=>({ok:false,error:{code:'FILE_PERMISSION',message:'C:\\private\\notes.txt denied'}})}});
 assert.equal(result.error.code,'FILE_PERMISSION');assert.equal(JSON.stringify(result).includes('private'),false);
});
test('portable empty file settings remain omitted across repeated export and import',async()=>{
 const {parseWorkflow}=await import('../src/workflow/packages.js?v=0.29.0');const clock={...node('story-clock'),id:'clock'},graph={id:'portable-defaults',name:'Portable defaults',schema:3,runtime:2,mode:'native-unified',nodes:{clock},wires:{},portals:{},definitions:{},runTargets:[]};
 const first=exportWorkflow(graph);assert.equal(Object.hasOwn(first.graph.nodes.clock,'fileTarget'),false);const parsed=parseWorkflow(JSON.stringify(first));assert.equal(parsed.ok,true,JSON.stringify(parsed));assert.deepEqual(exportWorkflow(parsed.data),first);
});
