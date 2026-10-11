import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {compiled} from './helpers/svelte-compile.mjs';
import {OPERATIONS,operationDefaults,describeOperation} from '../src/workflow/catalog.js';
import {projectNodeControls} from '../src/ui/node-control-projection.js';
import {parseControlInput} from '../src/ui/control-input-contracts.js';
import {nodeNeedsConfiguration,createConfiguredNodeSession,configuredCreationStage,validateConfiguredNodeControls,iterationHelperChoices} from '../src/ui/configured-node-creation.js';
import {prepareNativeSearchCatalog,resolveNativeSearchChoice} from '../src/ui/native-search-catalog.js';
import {prepareNativeConnectionEdit} from '../src/workflow/connection-edits.js';
import {prepareNativeNodeEdit} from '../src/workflow/definition-library.js';
import {captureGraphEditContext,commitPreparedGraph} from '../src/workflow/transactions.js';
import {prepareNodeProfileOptions,readNodeProfileMetadata} from '../src/ui/node-profile-preparation.js';
import {activeModelMetadata} from '../src/workflow/model-profiles.js';
import {safe} from '../src/state.js';
import {workflowDataPresetFor} from '../src/workflow/workflow-data-defaults.js';
import * as H from '../src/history.js?v=0.27.0';
const operations=['json-decode','extract','model-call','format','read-file','write-file','project-document'];
const scope={schema:3,runtime:2,mode:'native-unified',workflowId:'schema-work',viewPath:[],inDefinition:false};
const graph=()=>({id:'schema-work',schema:3,runtime:2,mode:'native-unified',roles:{},nodes:{},wires:{},definitions:{},portals:{}});
const settings=operation=>({...Object.fromEntries(Object.entries(operationDefaults(operation)).filter(([key])=>OPERATIONS[operation].controls.includes(key))),...(operation==='model-call'?{outputKind:'data'}:{})});
const source=await readFile(new URL('../src/ui/controller.js',import.meta.url),'utf8');
function actual(name,env){const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}',start)+2;assert.ok(start>=0);return Function('env','with(env){'+source.slice(start,end)+';return '+name+';}')(env);}
function controller(root=graph(),catalog){
 H.track(root);let commits=0,prepares=0,current=true;const token={},context={chatId:'schema-story',chatMetadata:{},chat:[]};
 let captured=captureGraphEditContext(root,()=>({sessionId:'schema',viewPath:[],readOnly:false}));assert.equal(captured.ok,true,JSON.stringify(captured));
 const env={current:root,selected:null,graphViews:{readEditor:()=>({view:{identity:{kind:'root'}},prepared:{savedGraph:root}})},editorDraw:{nativeCards:{}},editorCurrent:arg=>current&&arg===token,workflowRuntime:{getStoryDocumentCatalog:()=>catalog},nodeDocumentCaptures:new Map(),nodeCreationScopes:new WeakMap(),pendingConfiguredNode:null,ctx:()=>context,safe,prepareNodeProfileOptions,readNodeProfileMetadata,activeModelMetadata,workflowDataPresetFor,workbench:{update(value){if('configureNode'in value)env.view=value.configureNode;}},canvas:{toGraph:(x,y)=>({x,y})},createConfiguredNodeSession,configuredCreationStage,nodeNeedsConfiguration,iterationHelperChoices,
 prepareNativeCreation:(capture,command)=>{prepares++;return prepareNativeConnectionEdit(root,command);},prepareShelfNodeCreation:(capture,command,at)=>{prepares++;return prepareNativeConnectionEdit(root,{...command,graphPoint:at??{x:0,y:0}});},commitCaptured(capture,prepared){if(!env.editorCurrent(capture))return {ok:false,error:{code:'STALE_CONTEXT',message:'Stale'}};if(!prepared.ok)return prepared;const result=commitPreparedGraph(root,{...prepared.data,context:captured.data});if(result.ok)commits++;return result;}};
 env.profiles=actual('profiles',env);
 const start=source.indexOf('const configuredNodeSession ='),end=source.indexOf('\n});',start)+4;env.configuredNodeSession=Function('env','with(env){'+source.slice(start,end)+';return configuredNodeSession;}')(env);
 for(const name of ['requestNodeCreation','cancelConfiguredNode','commitNodeCreation'])env[name]=actual(name,env);
 return {root,env,token,prepares:()=>prepares,commits:()=>commits,stale:()=>current=false,refresh:()=>captured=captureGraphEditContext(root,()=>({sessionId:'schema',viewPath:[],readOnly:false}))};
}
const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true});globalThis.window=dom.window;globalThis.document=dom.window.document;
for(const key of ['Node','Element','Text','Comment','Document','HTMLElement','HTMLMediaElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
const {mount,unmount,flushSync,tick}=await import(new URL('../node_modules/svelte/src/index-client.js',import.meta.url).href);
async function fixture(name,props){const directory=await mkdtemp(join(tmpdir(),'lattice-schema-integrated-')),host=document.createElement('div');document.body.append(host);let mounted;
 try{const leaf=await compiled(name,directory),harness=await compiled('Harness',directory,`<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)};let {initial,actions}=$props();let view=$state.raw(initial);export function update(next){view=next;}</script><Leaf {view} {actions}/>`);mounted=mount(harness.component,{target:host,props:{initial:props.view,actions:props.actions}});flushSync();await tick();return {host,mounted,async close(){await unmount(mounted);host.remove();const local=relative(resolve(tmpdir()),resolve(directory));assert.ok(local&&!local.startsWith('..')&&!isAbsolute(local));await rm(directory,{recursive:true,force:true});}};}catch(error){if(mounted)await unmount(mounted);host.remove();await rm(directory,{recursive:true,force:true});throw error;}
}
function input(host,label,value,event='input'){const element=host.querySelector('[aria-label="'+label+'"]');assert.ok(element,'Missing '+label);if(['checkbox','radio'].includes(element.type))element.checked=value;else element.value=value;element.dispatchEvent(new dom.window.Event(event,{bubbles:true}));flushSync();return element;}
function button(host,label){const found=[...host.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')===label||e.textContent.trim()===label);assert.ok(found,'Missing '+label);return found;}
async function click(host,label){button(host,label).click();flushSync();await tick();flushSync();}
function detail(root,id){const node=root.nodes[id];return {selectionKey:id,revision:'r1',address:{workflowId:root.id,instancePath:[],nodeId:id},title:node.operation,canonicalTitle:node.operation,iconPath:'',family:'Data',phase:node.phase??'pre',operation:node.operation,alias:'',compact:false,enabled:true,readOnly:false,canPresent:true,controls:projectNodeControls(node.operation,node,{phase:node.phase??'pre'}),model:null,ports:[]};}

test('all seven schema controls enter actual configured creation with valid defaults and discoverable commands',()=>{
 const catalog=prepareNativeSearchCatalog(scope);assert.equal(catalog.ok,true);
 for(const operation of operations){const fields=projectNodeControls(operation,settings(operation),{phase:'post'}),control=fields.find(field=>field.key==='schema');assert.equal(control.inputSpec.editor,'schema');assert.equal(control.inputSpec.storage,'json-text');assert.equal(nodeNeedsConfiguration(operation),true,operation);
  const choice=catalog.data.choices.find(item=>item.id==='operation:'+operation);assert.ok(choice,operation);assert.equal(choice.requiresConfiguration,true,operation);assert.equal(resolveNativeSearchChoice(catalog.data,choice.id).requiresConfiguration,true);
 }
});

test('schema control storage admits engine depth16/node1000 and retains exact text with generic enum budgets',()=>{
 for(const operation of operations){const spec=projectNodeControls(operation,settings(operation),{phase:'post'}).find(control=>control.key==='schema').inputSpec;
  let schema={type:'string'};for(let index=0;index<16;index++)schema={properties:{child:schema}};const text=' \n'+JSON.stringify(schema)+'  ';
  assert.deepEqual(parseControlInput(spec,{format:'json',text}).data?.value,text,operation);assert.equal(parseControlInput(spec,{format:'json',text:JSON.stringify({items:schema})}).ok,false);
  const atLimit={properties:Object.fromEntries(Array.from({length:999},(_,index)=>['p'+index,{}]))};assert.equal(parseControlInput(spec,{format:'json',text:JSON.stringify(atLimit)}).ok,true);assert.equal(parseControlInput(spec,{format:'json',text:JSON.stringify({properties:{...atLimit.properties,extra:{}}})}).ok,false);
  let deep=null;for(let index=0;index<33;index++)deep=[deep];assert.equal(parseControlInput(spec,{format:'json',text:JSON.stringify({const:deep})}).ok,false);
  assert.equal(parseControlInput(spec,{format:'json',text:'{"$ref":"#/other"}'}).ok,false);
 }
});

test('actual controller creation opens schema builder and commits exact source once for all seven consumers',async()=>{
 for(const operation of operations){const f=controller(),before=structuredClone(f.root),pending=f.env.requestNodeCreation(f.token,{kind:'create',operation,controls:settings(operation),graphPoint:{x:20,y:30}});
  assert.ok(f.env.view,operation+' must open configuration');assert.deepEqual(f.root,before);assert.equal(f.prepares(),0);
  const form=await fixture('ConfigureNode',{view:f.env.view,actions:{apply:(key,text,phase)=>f.env.configuredNodeSession.apply(key,text,phase),cancel:key=>f.env.cancelConfiguredNode(key)}});
  try{const label=projectNodeControls(operation,settings(operation),{phase:'post'}).find(control=>control.key==='schema').label;input(form.host,label+' schema enabled',true,'change');await click(form.host,'Edit '+label+' schema as JSON');const original=' \n { "type":"object", "title":"retained", "description":"exact", "$schema":"subset" }  ';input(form.host,label+' schema JSON',original);await click(form.host,'Create node');assert.equal(f.prepares(),1,operation+' '+form.host.textContent);const prepared=await pending;assert.equal(prepared.ok,true,operation+' '+JSON.stringify(prepared));assert.equal(f.prepares(),1);assert.deepEqual(f.root,before);const id=prepared.data.addedNodeIds[0];assert.equal(prepared.data.candidate.nodes[id].schema,original);assert.equal(describeOperation(scope,prepared.data.candidate.nodes[id]).ok,true);assert.equal(f.env.commitNodeCreation(f.token,prepared).ok,true);assert.equal(f.commits(),1);assert.equal(f.root.nodes[id].schema,original);assert.ok(H.undo(f.root));assert.deepEqual(f.root,before);assert.equal(H.undo(f.root),null);}
  finally{f.env.cancelConfiguredNode();await form.close();}
 }
});
function nativeSave(f){
 const env=f.env;env.detailCapture=selection=>env.editorCurrent(f.token)&&f.root.nodes[selection.address.nodeId]?{ok:true,data:f.token}:{ok:false,error:{code:'STALE_CONTEXT',message:'Stale details'}};env.scopeCommand=()=>({viewPath:[]});env.prepareNode=actual('prepareNode',{prepareNativeNodeEdit});
 const start=source.indexOf('    editControl(selection,key,value)'),end=source.indexOf('\n',start);assert.ok(start>=0);return Function('env','with(env){return ({'+source.slice(start,end).trim().replace(/,$/,'')+'}).editControl;}')(env);
}

test('all seven actual Node Details saves reach controller-used native preparation and one reversible commit',async()=>{
 for(const operation of operations){const root=graph();root.nodes.node={id:'node',type:'workflow',operation,...settings(operation),phase:'post'};const f=controller(root),before=structuredClone(root),editControl=nativeSave(f),view=detail(root,'node'),label=view.controls.find(control=>control.key==='schema').label;
  const form=await fixture('NodeDetails',{view,actions:{editControl}});
  try{if(operation==='read-file'){form.host.querySelector('[data-control-group="Validation"] summary').click();flushSync();}input(form.host,label+' schema enabled',true,'change');input(form.host,label+' schema type','object','change');input(form.host,label+' title enabled',true,'change');input(form.host,label+' title','Kept');input(form.host,label+' new property','a.b');await click(form.host,'Add '+label+' property');await click(form.host,'Save '+label);
   assert.equal(f.commits(),1,operation+' '+form.host.textContent);assert.equal(typeof root.nodes.node.schema,'string');assert.deepEqual(JSON.parse(root.nodes.node.schema),{type:'object',title:'Kept',properties:{'a.b':{}}});assert.equal(describeOperation(scope,root.nodes.node).ok,true);assert.ok(H.undo(root));assert.deepEqual(root,before);assert.equal(H.undo(root),null);assert.ok(H.redo(root));assert.equal(f.commits(),1);
  }finally{await form.close();}
 }
});

test('schema invalid drafts block actual parent Create and Save across remounts and unrelated edits',async()=>{
 for(const creation of [true,false]){
  const operation='json-decode',initial=' { "minimum":0, "enum":[false] } ',root=graph();root.nodes.node={id:'node',type:'workflow',operation,...settings(operation),schema:initial,phase:'post'};const f=controller(root),before=structuredClone(root),props=creation?{view:{key:'invalid-schema',operation,title:operation,controls:JSON.stringify({...settings(operation),schema:initial}),phase:'post',phaseLocked:false,targets:[],helpers:[]},actions:{apply(){assert.fail('Invalid schema must not reach preparation');},cancel(){}}}:{view:detail(root,'node'),actions:{editControl:nativeSave(f)}};
  const form=await fixture(creation?'ConfigureNode':'NodeDetails',props);
  try{input(form.host,'Schema minimum','-');await click(form.host,creation?'Create node':'Save Schema');assert.equal(f.commits(),0);assert.deepEqual(root,before);
   if(creation){await click(form.host,'Advanced JSON');const whole=form.host.querySelector('[aria-label="Node controls JSON"]');assert.equal(JSON.parse(whole.value).schema,'-');await click(form.host,'Use form');}
   else {form.mounted.update(null);flushSync();await tick();form.mounted.update({...props.view,revision:'r2'});flushSync();await tick();}
   assert.equal(form.host.querySelector('[aria-label="Schema minimum"]').value,'-',creation?'creation remount':'details remount');
   input(form.host,'check',true,'change');await click(form.host,creation?'Create node':'Save Schema');assert.equal(f.commits(),creation?0:1); // Mode is its separate transaction; invalid Schema remains unsaved.
   assert.equal(root.nodes.node.schema,initial);
   input(form.host,'Schema minimum','2');await click(form.host,'Edit Schema schema as JSON');assert.equal(JSON.parse(form.host.querySelector('[aria-label="Schema schema JSON"]').value).minimum,2);
  }finally{await form.close();}
 }
});

test('actual read-file default creation needs no chat setup, while custom targets and stale captures stay rejected',async()=>{
 const f=controller(),before=structuredClone(f.root),pending=f.env.requestNodeCreation(f.token,{kind:'create',operation:'read-file',graphPoint:{x:2,y:3}});assert.ok(f.env.view);assert.equal(f.env.view.targets.length,0);assert.equal(JSON.parse(f.env.view.controls).targetId,'lattice-default-notes');
 const form=await fixture('ConfigureNode',{view:f.env.view,actions:{apply:(key,text,phase)=>f.env.configuredNodeSession.apply(key,text,phase),cancel:key=>f.env.cancelConfiguredNode(key)}});
 try{assert.equal(form.host.querySelector('[aria-label="Workflow data document"]').value,'lattice-default-notes');await click(form.host,'Create node');assert.equal(f.prepares(),1);const prepared=await pending;assert.equal(prepared.ok,true);assert.equal(f.env.commitNodeCreation(f.token,prepared).ok,true);assert.equal(f.commits(),1);assert.deepEqual(f.root.nodes[prepared.data.addedNodeIds[0]].targetId,'lattice-default-notes');assert.ok(H.undo(f.root));assert.deepEqual(f.root,before);}
 finally{f.env.cancelConfiguredNode();await form.close();}
 const custom=controller();assert.equal(custom.env.requestNodeCreation(custom.token,{kind:'create',operation:'read-file',controls:{targetId:'private.json'}}).error.code,'DOCUMENT_SETUP_UNAVAILABLE');assert.equal(custom.prepares(),0);
 const alternate=controller(),held=alternate.env.requestNodeCreation(alternate.token,{kind:'create',operation:'read-file'}),key=alternate.env.view.key;assert.equal(alternate.env.configuredNodeSession.apply(key,'{"targetId":"private.json"}','pre').error.code,'DOCUMENT_NOT_AUTHORIZED');assert.equal(alternate.prepares(),0);alternate.stale();assert.equal(alternate.env.configuredNodeSession.apply(key,alternate.env.view.controls,'pre').error.code,'STALE_CONTEXT');alternate.env.cancelConfiguredNode(key);assert.equal((await held).error.code,'NODE_CONFIGURATION_CANCELLED');assert.equal(alternate.commits(),0);
});

test('actual seven-schema configuration Cancel never prepares or creates a history entry',async()=>{
 for(const operation of operations){const f=controller(),before=structuredClone(f.root),pending=f.env.requestNodeCreation(f.token,{kind:'create',operation});assert.ok(f.env.view,operation);f.env.cancelConfiguredNode(f.env.view.key);assert.equal((await pending).error.code,'NODE_CONFIGURATION_CANCELLED');assert.equal(f.prepares(),0);assert.equal(f.commits(),0);assert.deepEqual(f.root,before);assert.equal(H.undo(f.root),null);}
});

test('Extract configured default honors its strict Draft stage and explicit Text/container stage contracts',async()=>{
 const f=controller(),pending=f.env.requestNodeCreation(f.token,{kind:'create',operation:'extract'});assert.equal(f.env.view.phase,'post');f.env.cancelConfiguredNode();assert.equal((await pending).error.code,'NODE_CONFIGURATION_CANCELLED');assert.equal(f.prepares(),0);
 assert.deepEqual(configuredCreationStage('extract','native-unified','pre',false,{inputKind:'text'}),{phase:'pre',phaseLocked:false});
 assert.deepEqual(configuredCreationStage('extract','native-pre','post',true,{inputKind:'draft'}),{phase:'pre',phaseLocked:true});
 const options={phase:'pre',targets:[],helpers:[]};assert.equal(validateConfiguredNodeControls('extract','{"inputKind":"draft"}',options).ok,false);assert.equal(validateConfiguredNodeControls('extract','{"inputKind":"text"}',options).ok,true);
 const locked=controller();locked.env.graphViews={readEditor:()=>({view:{identity:{kind:'instance'}},prepared:{savedGraph:{...locked.root,mode:'native-pre'}}})};const held=locked.env.requestNodeCreation(locked.token,{kind:'create',operation:'extract'});assert.equal(locked.env.view.phase,'pre');assert.equal(locked.env.view.phaseLocked,true);assert.equal(locked.env.configuredNodeSession.apply(locked.env.view.key,locked.env.view.controls,'post').error.code,'INVALID_PHASE');assert.equal(locked.env.configuredNodeSession.apply(locked.env.view.key,locked.env.view.controls,'pre').error.code,'INVALID_CONFIGURATION');assert.equal(locked.prepares(),0);locked.env.cancelConfiguredNode();await held;
 const text=controller(),textHeld=text.env.requestNodeCreation(text.token,{kind:'create',operation:'extract',controls:{inputKind:'text'},graphPoint:{x:4,y:5}});assert.equal(text.env.view.phase,'pre');assert.equal(text.env.view.phaseLocked,false);const changed=JSON.stringify({...JSON.parse(text.env.view.controls),inputKind:'draft'});assert.equal(text.env.configuredNodeSession.apply(text.env.view.key,changed,'pre').error.code,'INVALID_CONFIGURATION');assert.equal(text.prepares(),0);const textApplied=text.env.configuredNodeSession.apply(text.env.view.key,text.env.view.controls,'pre');assert.equal(textApplied.ok,true,JSON.stringify(textApplied));assert.equal((await textHeld).ok,true);assert.equal(text.prepares(),1);assert.equal(text.commits(),0);assert.equal(H.undo(text.root),null);
});

test('optional schema inactive text and rejected typed enum survive parent view caches',async()=>{
 for(const creation of [true,false]){
  const original='  {"title":"retained","description":"kept","$schema":"subset","enum":[false,0]}\n',root=graph();root.nodes.node={id:'node',type:'workflow',operation:'json-decode',phase:'post',mode:'parse',schema:original};const f=controller(root),props=creation?{view:{key:'inactive-schema',operation:'json-decode',title:'JSON Decode',controls:JSON.stringify({mode:'parse',schema:original}),phase:'post',phaseLocked:false,targets:[],helpers:[]},actions:{apply(){return {ok:false,error:{code:'RETAIN',message:'keep form'}};},cancel(){}}}:{view:detail(root,'node'),actions:{editControl:nativeSave(f)}};const form=await fixture(creation?'ConfigureNode':'NodeDetails',props);
  async function remount(){if(creation){await click(form.host,'Advanced JSON');await click(form.host,'Use form');}else{form.mounted.update(null);flushSync();await tick();form.mounted.update({...props.view,revision:'r2'});flushSync();await tick();}}
  try{input(form.host,'Schema schema enabled',false,'change');await remount();assert.equal(form.host.querySelector('[aria-label="Schema schema enabled"]').checked,false);input(form.host,'Schema schema enabled',true,'change');await click(form.host,'Edit Schema schema as JSON');assert.equal(form.host.querySelector('[aria-label="Schema schema JSON"]').value,original);await click(form.host,'Edit Schema schema as builder');
   input(form.host,'Schema enum type','string','change');await remount();assert.equal(form.host.querySelector('[aria-label="Schema enum type"]').value,'string');await click(form.host,creation?'Create node':'Save Schema');assert.equal(f.commits(),0);assert.equal(root.nodes.node.schema,original);
   input(form.host,'Schema enum type','array','change');await click(form.host,'Add Schema enum item');await click(form.host,'Edit Schema schema as JSON');assert.deepEqual(JSON.parse(form.host.querySelector('[aria-label="Schema schema JSON"]').value),{title:'retained',description:'kept',$schema:'subset',enum:[null]});
  }finally{await form.close();}
 }
});

test('schema boundaries retain descriptor text limits, encoded byte bounds and const JSON budgets',()=>{
 const spec=projectNodeControls('format',{}, {phase:'pre'}).find(control=>control.key==='schema').inputSpec;assert.equal(spec.limits.maxStringLength,100000);
 for(const text of [JSON.stringify({title:'x'.repeat(100001)}),JSON.stringify({title:'中'.repeat(90000)}),JSON.stringify({const:Array.from({length:10000},()=>null)})])assert.equal(parseControlInput(spec,{format:'json',text}).ok,false);
 let nested={type:'string'};for(let index=0;index<16;index++)nested={properties:{key:nested}};
 assert.equal(parseControlInput(spec,{format:'rows',value:nested}).ok,true);
});


test('accepted optional absence retains inactive schema draft across inspector remount',async()=>{
 const original='  {"title":"inactive","minimum":0} ',root=graph();root.nodes.node={id:'node',type:'workflow',operation:'json-decode',phase:'post',mode:'parse',schema:original};const f=controller(root),form=await fixture('NodeDetails',{view:detail(root,'node'),actions:{editControl:nativeSave(f)}});
 try{input(form.host,'Schema minimum','-');input(form.host,'Schema schema enabled',false,'change');await click(form.host,'Save Schema');assert.equal(f.commits(),1);assert.equal(root.nodes.node.schema,'');f.refresh();
  form.mounted.update(null);flushSync();await tick();form.mounted.update({...detail(root,'node'),revision:'r2'});flushSync();await tick();input(form.host,'Schema schema enabled',true,'change');assert.equal(form.host.querySelector('[aria-label="Schema minimum"]').value,'-');await click(form.host,'Save Schema');assert.equal(f.commits(),1);input(form.host,'Schema minimum','3');await click(form.host,'Save Schema');assert.equal(f.commits(),2);assert.deepEqual(JSON.parse(root.nodes.node.schema),{title:'inactive',minimum:3});
 }finally{await form.close();}
});


test('unfinished enum and const numbers remain exact repairable keyword drafts after parent remounts',async()=>{
 for(const creation of [true,false])for(const keyword of ['enum','const']){
  const original=JSON.stringify({title:'keep',[keyword]:keyword==='enum'?[0]:{exact:0}}),root=graph();root.nodes.node={id:'node',type:'workflow',operation:'json-decode',phase:'post',mode:'parse',schema:original};const f=controller(root),props=creation?{view:{key:'typed-'+keyword,operation:'json-decode',title:'JSON Decode',controls:JSON.stringify({mode:'parse',schema:original}),phase:'post',phaseLocked:false,targets:[],helpers:[]},actions:{apply(){assert.fail('Unfinished typed draft must block Create');},cancel(){}}}:{view:detail(root,'node'),actions:{editControl:nativeSave(f)}},form=await fixture(creation?'ConfigureNode':'NodeDetails',props);
  try{await click(form.host,'Edit Schema '+keyword+(keyword==='enum'?' index 0':' key exact'));input(form.host,'Schema '+keyword+' number','-');
   if(creation){await click(form.host,'Advanced JSON');await click(form.host,'Use form');}else{form.mounted.update(null);flushSync();await tick();form.mounted.update({...props.view,revision:'r2'});flushSync();await tick();}
   const rejected=keyword==='enum'?'[-]':'{"exact":-}';assert.equal(form.host.querySelector('[aria-label="Schema '+keyword+' JSON"]')?.value,rejected);await click(form.host,creation?'Create node':'Save Schema');assert.equal(f.commits(),0);assert.equal(root.nodes.node.schema,original);
   input(form.host,'Schema '+keyword+' JSON',keyword==='enum'?'[2]':'{"exact":2}');await click(form.host,'Edit Schema schema as JSON');assert.deepEqual(JSON.parse(form.host.querySelector('[aria-label="Schema schema JSON"]').value),{title:'keep',[keyword]:keyword==='enum'?[2]:{exact:2}});
  }finally{await form.close();}
 }
});

test('disabled creation and read-only inspector schema editors reject synthetic edits and Save',async()=>{
 const original='{"minimum":1}',root=graph();root.nodes.node={id:'node',type:'workflow',operation:'json-decode',phase:'post',mode:'parse',schema:original};let saves=0;
 for(const creation of [true,false]){const props=creation?{view:{key:'disabled',operation:'json-decode',title:'JSON Decode',controls:JSON.stringify({mode:'parse',schema:original}),phase:'post',phaseLocked:false,targets:[],helpers:[]}}:{view:{...detail(root,'node'),readOnly:true},actions:{editControl(){saves++;return {ok:true};}}},form=await fixture(creation?'ConfigureNode':'NodeDetails',props);
  try{assert.equal(form.host.querySelector('[aria-label="Schema minimum"]').disabled,true);input(form.host,'Schema minimum','4');input(form.host,'Schema schema enabled',false,'change');await click(form.host,creation?'Create node':'Save Schema');assert.equal(saves,0);assert.equal(root.nodes.node.schema,original);form.mounted.update({...props.view,revision:'r2',key:'disabled-r2'});flushSync();await tick();assert.equal(form.host.querySelector('[aria-label="Schema minimum"]').disabled,true);
  }finally{await form.close();}
 }
});


test('pending schema Save disables numeric and typed edits through acknowledgement and remount',async()=>{
 for(const typed of [false,true]){
  const root=graph(),original=typed?'{"const":0}':'{"minimum":0}';root.nodes.node={id:'node',type:'workflow',operation:'json-decode',phase:'post',mode:'parse',schema:original};let release,submitted;const form=await fixture('NodeDetails',{view:detail(root,'node'),actions:{editControl(_selection,_key,value){submitted=value;return new Promise(resolve=>release=resolve);}}});
  try{const label=typed?'Schema const number':'Schema minimum';input(form.host,label,'2');await click(form.host,'Save Schema');assert.equal(JSON.parse(submitted)[typed?'const':'minimum'],2);
   assert.equal(form.host.querySelector('[aria-label="'+label+'"]').disabled,true);for(const editor of form.host.querySelectorAll('[data-schema-control] input,[data-schema-control] select,[data-schema-control] textarea,[data-schema-control] button'))assert.equal(editor.disabled,true);
   input(form.host,label,'-');root.nodes.node.schema=submitted;form.mounted.update({...detail(root,'node'),revision:'r2'});flushSync();await tick();release({ok:true});flushSync();await tick();form.mounted.update(null);flushSync();await tick();form.mounted.update({...detail(root,'node'),revision:'r2'});flushSync();await tick();assert.equal(form.host.querySelector('[aria-label="'+label+'"]').value,'2');assert.equal(form.host.querySelector('[aria-label="'+label+'"]').disabled,false);
  }finally{if(release)release({ok:true});await form.close();}
 }
});

test('pristine schema view follows authoritative revision and real Undo without stale Save',async()=>{
 const root=graph();root.nodes.node={id:'node',type:'workflow',operation:'json-decode',phase:'post',mode:'parse',schema:'{"minimum":0}'};const f=controller(root),save=nativeSave(f),submitted=[],form=await fixture('NodeDetails',{view:detail(root,'node'),actions:{editControl(selection,key,value){submitted.push(value);return save(selection,key,value);}}});
 try{assert.equal(form.host.querySelector('[aria-label="Schema minimum"]').value,'0');await click(form.host,'Edit Schema schema as JSON'); // View change alone is not authored text.
  assert.equal(save(detail(root,'node'),'schema','{"minimum":7}').ok,true);f.refresh();form.mounted.update({...detail(root,'node'),revision:'r2'});flushSync();await tick();assert.equal(JSON.parse(form.host.querySelector('[aria-label="Schema schema JSON"]').value).minimum,7);await click(form.host,'Edit Schema schema as builder');assert.equal(form.host.querySelector('[aria-label="Schema minimum"]').value,'7');await click(form.host,'Save Schema');assert.equal(submitted.at(-1),'{"minimum":7}');
  assert.ok(H.undo(root));assert.equal(root.nodes.node.schema,'{"minimum":0}');f.refresh();form.mounted.update({...detail(root,'node'),revision:'r3'});flushSync();await tick();assert.equal(form.host.querySelector('[aria-label="Schema minimum"]').value,'0');await click(form.host,'Save Schema');assert.equal(submitted.at(-1),'{"minimum":0}');assert.equal(H.undo(root),null);
 }finally{await form.close();}
});


test('revision-expired Save acknowledgement cannot clear a newer invalid schema generation',async()=>{
 for(const typed of [false,true]){
  const root=graph();root.nodes.node={id:'node',type:'workflow',operation:'json-decode',phase:'post',mode:'parse',schema:typed?'{"const":0}':'{"minimum":0}'};let release,calls=0,submitted;const form=await fixture('NodeDetails',{view:detail(root,'node'),actions:{editControl(_selection,_key,value){calls++;submitted=value;return new Promise(resolve=>release=resolve);}}});
  try{const label=typed?'Schema const number':'Schema minimum';input(form.host,label,'2');await click(form.host,'Save Schema');root.nodes.node.schema=submitted;form.mounted.update({...detail(root,'node'),revision:'r2'});flushSync();await tick();assert.equal(form.host.querySelector('[aria-label="'+label+'"]').disabled,false);input(form.host,label,'-');release({ok:true});flushSync();await tick();form.mounted.update(null);flushSync();await tick();form.mounted.update({...detail(root,'node'),revision:'r2'});flushSync();await tick();
   const rejected=typed?'Schema const JSON':label;assert.equal(form.host.querySelector('[aria-label="'+rejected+'"]').value,'-');assert.equal(button(form.host,'Save Schema').disabled,true);await click(form.host,'Save Schema');assert.equal(calls,1);input(form.host,rejected,'3');assert.equal(button(form.host,'Save Schema').disabled,false);await click(form.host,'Edit Schema schema as JSON');assert.equal(JSON.parse(form.host.querySelector('[aria-label="Schema schema JSON"]').value)[typed?'const':'minimum'],3);
  }finally{if(release)release({ok:true});await form.close();}
 }
});
