import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createChatDocumentCatalog} from '../src/workflow/document-catalog.js?v=0.27.3';
import {prepareNativeConnectionEdit} from '../src/workflow/connection-edits.js?v=0.27.3';
import {createConfiguredNodeSession,configuredCreationStage,nodeNeedsConfiguration,iterationHelperChoices} from '../src/ui/configured-node-creation.js?v=0.27.3';
import {prepareNodeProfileOptions,readNodeProfileMetadata} from '../src/ui/node-profile-preparation.js?v=0.27.3';
import {activeModelMetadata} from '../src/workflow/model-profiles.js?v=0.27.3';
import {workflowDataPresetFor} from '../src/workflow/workflow-data-defaults.js?v=0.27.3';
import {safe} from '../src/state.js?v=0.27.3';
const source=await readFile(new URL('../src/ui/controller.js',import.meta.url),'utf8');
test('a checkpoint applied in an earlier scope cannot cancel or refresh a replacement workflow',async()=>{
 const start=source.indexOf('    async applyCheckpoint('),end=source.indexOf('\n    },',start);assert.ok(start>=0&&end>start);
 let current=true,release,entered,effects=0;const waiting=new Promise(resolve=>entered=resolve),deferred=new Promise(resolve=>release=resolve);
 const env={storySetup:()=>({isCurrent:key=>current&&key==='captured-key'}),workflowRuntime:{getNativeWorkflowController:()=>({applyStoryHistoryCheckpoint:()=>{entered();return deferred;}})},workflowSession:{cancel(){effects++;}},refreshWorkflowPreparation(){effects++;},updateWorkflowProjection(){effects++;}};
 const method=Function('env','with(env){return ('+source.slice(start,end).trim().replace('async applyCheckpoint(','async function(')+'\n});}')(env);
 const pending=method('captured-key',{});await waiting;current=false;release({ok:true,data:{applied:true,acknowledged:false}});
 assert.equal((await pending).data.applied,true);assert.equal(effects,0,'The old checkpoint response cannot touch the new workflow');
});
function actual(name,env){const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}',start)+2;assert.ok(start>=0);return Function('env','with(env){'+source.slice(start,end)+';return '+name+';}')(env);}
function fixture(){
 const graph={id:'setup-controller',schema:3,runtime:2,mode:'native-unified',definitions:{},portals:{},nodes:{compose:{id:'compose',type:'workflow',operation:'compose',phase:'post',sections:[{name:'body',text:''}]}},wires:{}};
 const context={chatId:'story',chatMetadata:{},chat:[]};let user='default-user',camera=10,commits=0;const catalog=createChatDocumentCatalog({getContext:()=>context,getUserId:()=>user,saveMetadata:()=>true});catalog.define({targetId:'souls.json',name:'Souls',format:'json',content:'[]',visibility:{kind:'public'}});
 const capture={},env={current:graph,selected:{id:'compose'},graphViews:{readEditor:()=>({view:{identity:{kind:'root'}},prepared:{savedGraph:graph}})},editorDraw:{nativeCards:{compose:{phase:'post',ports:[{port:'section.body',dir:'in',kind:'text'}]}}},editorCurrent:token=>token===capture,workflowRuntime:{getStoryDocumentCatalog:()=>catalog},nodeDocumentCaptures:new Map(),nodeCreationScopes:new WeakMap(),pendingConfiguredNode:null,ctx:()=>context,safe,prepareNodeProfileOptions,readNodeProfileMetadata,activeModelMetadata,workflowDataPresetFor,workbench:{update(value){if('configureNode'in value)env.view=value.configureNode;}},canvas:{toGraph:(x,y)=>({x:x+camera,y:y+camera})},createConfiguredNodeSession,configuredCreationStage,nodeNeedsConfiguration,iterationHelperChoices,
 prepareNativeCreation:(token,command)=>prepareNativeConnectionEdit(graph,command),prepareShelfNodeCreation:(token,command,at)=>prepareNativeConnectionEdit(graph,{...command,graphPoint:at??{x:0,y:0}}),commitCaptured(){commits++;return {ok:true,data:{changed:true}};}};
 env.profiles=actual('profiles',env);
 const start=source.indexOf('const configuredNodeSession ='),end=source.indexOf('\n});',start)+4;assert.ok(start>=0);env.configuredNodeSession=Function('env','with(env){'+source.slice(start,end)+';return configuredNodeSession;}')(env);
 for(const name of ['requestNodeCreation','cancelConfiguredNode','commitNodeCreation'])env[name]=actual(name,env);
 return {graph,catalog,capture,env,user:value=>user=value,camera:value=>camera=value,commits:()=>commits};
}

test('direct native pin placement retains origin stage, logical target and named output',async()=>{
 const f=fixture(),before=structuredClone(f.graph);
 const prepared=await f.env.requestNodeCreation(f.capture,{kind:'create',operation:'read-file',controls:{targetId:'souls.json'},graphPoint:{x:25,y:30},connection:{origin:{nodeId:'compose',portId:'section.body'},portId:'text'}});
 assert.equal(prepared.ok,true,JSON.stringify(prepared.error));assert.equal(f.env.view,undefined);
 const node=prepared.data.candidate.nodes[prepared.data.addedNodeIds[0]];
 assert.equal(node.phase,'post');assert.equal(node.x,25);assert.equal(node.targetId,'souls.json');assert.deepEqual(f.graph,before);
 assert.equal(f.env.nodeDocumentCaptures.size,0);
});

test('shelf placement captures drop geometry without acquiring document authorization',async()=>{
 const f=fixture();f.env.canvas.cancelGesture=()=>{};f.env.prepareShelfNodeCreation=actual('prepareShelfNodeCreation',f.env);
 f.env.workflowRuntime.getStoryDocumentCatalog=()=>{throw Error('No document capture during placement');};
 const prepared=await f.env.requestNodeCreation(f.capture,{kind:'create',operation:'read-file',controls:{targetId:'souls.json'}},{x:30,y:40},true);
 f.camera(1000);assert.equal(prepared.ok,true,JSON.stringify(prepared.error));const node=prepared.data.candidate.nodes[prepared.data.addedNodeIds[0]];
 assert.equal(node.x,40);assert.equal(node.y,50);f.catalog.remove('souls.json');
 assert.equal(f.env.commitNodeCreation(f.capture,prepared).ok,true);assert.equal(f.commits(),1);assert.equal(f.env.nodeDocumentCaptures.size,0);
});

test('stale placement capture cannot prepare a node or acquire a document scope',async()=>{
 const f=fixture(),before=structuredClone(f.graph);
 const rejected=await f.env.requestNodeCreation({}, {kind:'create',operation:'read-file',controls:{targetId:'souls.json'},graphPoint:{x:0,y:0}});
 assert.equal(rejected.error.code,'STALE_CONTEXT');assert.equal(f.env.nodeDocumentCaptures.size,0);assert.deepEqual(f.graph,before);assert.equal(f.commits(),0);
});

test('actual controller automatic data nodes need no active chat and inherit the selected response stage',async()=>{
 for(const [operation,key,targetId] of [['read-file','targetId','lattice-default-notes'],['story-clock','clockId','lattice-default-clock'],['commit-outcomes','targetId','lattice-default-outcomes']]){
  const f=fixture();f.env.workflowRuntime={getStoryDocumentCatalog:()=>undefined};
  const pending=f.env.requestNodeCreation(f.capture,{kind:'create',operation,graphPoint:{x:25,y:30}});
  const prepared=await pending;
  assert.equal(prepared.ok,true,operation+' '+JSON.stringify(prepared));
  const node=prepared.data.candidate.nodes[prepared.data.addedNodeIds[0]];assert.equal(node[key],targetId);assert.equal(node.phase,'post');
  assert.equal(f.env.view,undefined);assert.equal(f.env.nodeDocumentCaptures.size,0);assert.equal(f.commits(),0);
 }
});

test('actual controller automatic pin creation keeps the origin response stage and commits once through its capture',async()=>{
 const f=fixture();f.env.workflowRuntime={getStoryDocumentCatalog:()=>undefined};
 const pending=f.env.requestNodeCreation(f.capture,{kind:'create',operation:'read-file',graphPoint:{x:25,y:30},connection:{origin:{nodeId:'compose',portId:'section.body'},portId:'text'}});assert.equal(f.env.view,undefined);const prepared=await pending;
 assert.equal(prepared.ok,true,JSON.stringify(prepared));const id=prepared.data.addedNodeIds[0],node=prepared.data.candidate.nodes[id];assert.equal(node.phase,'post');assert.equal(node.targetId,'lattice-default-notes');
 assert.equal(Object.values(prepared.data.candidate.wires).some(wire=>wire.from===id&&wire.fromPort==='text'&&wire.to==='compose'&&wire.toPort==='section.body'),true);
 assert.equal(f.env.commitNodeCreation(f.capture,prepared).ok,true);assert.equal(f.commits(),1);
});

test('actual controller automatic creation preserves shelf geometry and rejects stale graph views',async()=>{
 const f=fixture();f.env.workflowRuntime={getStoryDocumentCatalog:()=>undefined};
 const prepared=await f.env.requestNodeCreation(f.capture,{kind:'create',operation:'story-clock'},{x:30,y:40},true);
 assert.equal(prepared.ok,true,JSON.stringify(prepared));const node=prepared.data.candidate.nodes[prepared.data.addedNodeIds[0]];assert.equal(node.x,30);assert.equal(node.y,40);assert.equal(node.phase,'post');
 const stale=await f.env.requestNodeCreation({}, {kind:'create',operation:'story-clock',graphPoint:{x:0,y:0}});assert.equal(stale.ok,false);assert.equal(stale.error.code,'STALE_CONTEXT');
});
test('awaited node data edits cannot cancel refresh or bind a replacement document',async()=>{
 for(const name of ['saveWorkflowData','saveWorkflowDataVisibility','createWorkflowData']){
  const start=source.indexOf('    async '+name+'('),end=source.indexOf('\n    },',start);
  assert.ok(start>=0&&end>start);
  let current=true,release,effects=0,entered;
  const waiting=new Promise(resolve=>entered=resolve),deferred=new Promise(resolve=>release=resolve),capture={},selection={address:{nodeId:'notes'}};
  const setup={save:()=>{entered();return deferred;},saveVisibility:()=>{entered();return deferred;},create:()=>{entered();return deferred;}};
  const env={detailCapture:()=>current?{ok:true,data:capture}:{ok:false,error:{code:'STALE_CONTEXT',message:'Replaced document'}},editorCurrent:()=>current,graphViews:{readEditor:()=>({prepared:{effectiveNodes:{notes:{operation:'read-file'}}}})},workflowDataPresetFor:()=>({kind:'notes',controlKey:'targetId',targetId:'lattice-default-notes'}),workflowDataSetup:()=>setup,workflowSession:{cancel(){effects++;}},refreshWorkflowPreparation(){effects++;},updateWorkflowProjection(){effects++;},commitCaptured(){effects++;},prepareNode(){effects++;},scopeCommand:()=>({}),current:{}};
  const method=Function('env','with(env){return ('+source.slice(start,end).trim().replace('async '+name+'(','async function(')+'\n});}')(env);
  const pending=method(selection,'setup-key',{kind:'notes'});await waiting;current=false;
  release({ok:true,data:{definition:{targetId:'new-notes'}}});
  const result=await pending;assert.equal(result.ok,false,name);assert.equal(result.error.code,'STALE_CONTEXT',name);assert.equal(effects,0,name+' cannot affect the replacement document');
 }
});

test('direct logical document placement retains its capture and commits once without setup',async()=>{
 const f=fixture(),before=structuredClone(f.graph);
 const prepared=await f.env.requestNodeCreation(f.capture,{kind:'create',operation:'read-file',controls:{targetId:'souls.json'},graphPoint:{x:10,y:15}});
 assert.equal(prepared.ok,true,JSON.stringify(prepared.error));assert.equal(f.env.view,undefined);assert.deepEqual(f.graph,before);assert.equal(f.commits(),0);
 assert.equal(f.env.commitNodeCreation(f.capture,prepared).ok,true);assert.equal(f.commits(),1);
});
