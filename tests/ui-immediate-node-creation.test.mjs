import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {configuredCreationStage,nodeNeedsConfiguration} from '../src/ui/configured-node-creation.js';
import {OPERATIONS} from '../src/workflow/catalog.js';
import {prepareNativeSearchCatalog,resolveNativeSearchChoice} from '../src/ui/native-search-catalog.js';
import {prepareNativeConnectionEdit} from '../src/workflow/connection-edits.js';
import {definitionRefKey} from '../src/workflow/definitions.js';

const source=await readFile(new URL('../src/ui/controller.js',import.meta.url),'utf8');
function controllerFunction(name,environment){
 const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}',start)+2;
 assert.ok(start>=0,'controller contains '+name);
 return Function('env','with(env){'+source.slice(start,end)+';return '+name+';}')(environment);
}
function fixture(){
 const root={id:'immediate-placement',schema:3,runtime:2,mode:'native-unified',nodes:{},wires:{},definitions:{},portals:{}};
 const prepared=[],updates=[],capture={},result={ok:true,data:{addedNodeIds:['placed']}};
 let current=true,configurationCount=0;
 const env={current:root,selected:null,nodeNeedsConfiguration,configuredCreationStage,
  graphViews:{readEditor:()=>({view:{identity:{kind:'root'}},prepared:{savedGraph:root}})},editorDraw:{nativeCards:{}},
  editorCurrent:value=>current&&value===capture,
  prepareNativeCreation:(value,command)=>{prepared.push({value,command});return result;},
  prepareShelfNodeCreation:(value,command,at)=>{prepared.push({value,command,at});return result;},
  configuredNodeSession:{open(){configurationCount++;return {view:{key:'modal'},result:Promise.resolve(result)};}},
  iterationHelperChoices:()=>[],prepareNodeProfileOptions:()=>[],readNodeProfileMetadata:()=>[],activeModelMetadata:()=>null,
  ctx:()=>({}),profiles:()=>[],nodeDocumentCaptures:new Map(),pendingConfiguredNode:null,
  workflowRuntime:{getStoryDocumentCatalog(){throw new Error('Placement must not request document setup.');}},
  workbench:{update:value=>updates.push(value)},canvas:{toGraph:(x,y)=>({x:x/2,y:y/2})},
 };
 env.requestNodeCreation=controllerFunction('requestNodeCreation',env);
 return {env,capture,result,prepared,updates,configurationCount:()=>configurationCount,stale:()=>{current=false;}};
}

test('Prompted Memory places directly without opening setup or requesting resources',async()=>{
 const f=fixture(),command={kind:'create',operation:'prompted-memory',graphPoint:{x:25,y:40}};
 const result=await f.env.requestNodeCreation(f.capture,command);
 assert.equal(f.configurationCount(),0);
 assert.deepEqual(f.updates,[]);
 assert.equal(result,f.result);
 assert.equal(f.prepared.length,1);
 assert.equal(f.prepared[0].command.operation,'prompted-memory');
 assert.deepEqual(f.prepared[0].command.graphPoint,{x:25,y:40});
});

test('every available primitive and preset command is offered without a setup gate',()=>{
 const catalog=prepareNativeSearchCatalog({schema:3,runtime:2,mode:'native-unified',workflowId:'all-nodes',viewPath:[],inDefinition:false});
 assert.equal(catalog.ok,true,JSON.stringify(catalog.error));
 const choices=catalog.data.choices.filter(choice=>choice.id.startsWith('operation:'));
 assert.equal(choices.length,Object.keys(OPERATIONS).length);
 for(const choice of choices){
  assert.equal(choice.requiresConfiguration,undefined,choice.label);
  assert.equal(resolveNativeSearchChoice(catalog.data,choice.id).requiresConfiguration,undefined,choice.label);
 }
});

test('setup detection describes missing settings rather than a mandatory configuration form',()=>{
 assert.equal(nodeNeedsConfiguration('compose'),false);
 assert.equal(nodeNeedsConfiguration('model-call'),false);
 assert.equal(nodeNeedsConfiguration('prompted-memory'),true);
 assert.equal(nodeNeedsConfiguration('prompted-memory',{actorId:'actor:one'}),false);
});

test('readiness action opens the addressed node setting and rejects an obsolete selection',()=>{
 const selection={address:{workflowId:'root',instancePath:[],nodeId:'recall'}},shown=[];
 let valid=true,focused=0;
 const input={id:'pc-node-details-actorId-editor',disabled:false,focus(){focused++;},scrollIntoView(){}};
 const env={current:{id:'root'},detailCapture:()=>({ok:valid}),
  graphViews:{readEditor:()=>({view:{identity:{kind:'root'}},prepared:{savedGraph:{nodes:{recall:{id:'recall'}}}}})},
  canvas:{setMulti(){}},showSettings:value=>shown.push(value),
  requestAnimationFrame:callback=>callback(),workbench:{parts:{inspector:{querySelectorAll:()=>[input],querySelector:()=>null}}},
 };
 const open=controllerFunction('openReadinessDetails',env);
 open(selection,{field:'actorId'});
 assert.deepEqual(shown,[{kind:'node',id:'recall'}]);assert.equal(focused,1);
 valid=false;open(selection,{field:'actorId'});
 assert.equal(shown.length,1);assert.equal(focused,1);
});

test('real authoring preparation accepts every available primitive through direct controller placement',async()=>{
 const catalog=prepareNativeSearchCatalog({schema:3,runtime:2,mode:'native-unified',workflowId:'all-nodes',viewPath:[],inDefinition:false}).data;
 for(const choice of catalog.choices.filter(choice=>choice.id.startsWith('operation:'))){
  const f=fixture();
  f.env.prepareNativeCreation=(_,command)=>prepareNativeConnectionEdit(f.env.current,command);
  const packet=resolveNativeSearchChoice(catalog,choice.id);
  const result=await f.env.requestNodeCreation(f.capture,{kind:'create',...packet,graphPoint:{x:80,y:100}});
  assert.equal(result.ok,true,choice.label+': '+JSON.stringify(result.error));
  const node=result.data.candidate.nodes[result.data.addedNodeIds[0]];
  assert.equal(node.operation,packet.operation);assert.deepEqual([node.x,node.y],[80,100]);
  assert.equal(f.configurationCount(),0,choice.label);assert.deepEqual(f.updates,[]);
 }
});

test('direct placement rejects stale captures before preparing any node',()=>{
 const f=fixture();f.stale();
 assert.equal(f.env.requestNodeCreation(f.capture,{kind:'create',operation:'prompted-memory'}).error.code,'STALE_CONTEXT');
 assert.equal(f.prepared.length,0);assert.equal(f.configurationCount(),0);
});

test('library readiness follows its relative wrapper path before selecting a same-ID descendant',()=>{
 const top={id:'top',version:1,semanticHash:'sha256:top'},child={id:'child',version:1,semanticHash:'sha256:child'};
 const selection={address:{kind:'library',definitionRef:top,nodeId:'wrapper'}},shown=[],opened=[];
 let editor={view:{key:'top-view',identity:{kind:'library'}},prepared:{definitionRef:top,savedGraph:{nodes:{wrapper:{type:'subgraph',definition:child},memory:{id:'memory',title:'Wrong parent node'}}}}};
 const env={definitionRefKey,current:{id:'root'},detailCapture:()=>({ok:true}),graphViews:{readEditor:()=>editor},
  navigateGraphView(action,ref){opened.push([action,ref]);editor={view:{key:'child-view',identity:{kind:'library'}},prepared:{definitionRef:child,savedGraph:{nodes:{memory:{id:'memory',title:'Actual source'}}}}};return {ok:true};},
  canvas:{setMulti(){}},showSettings:value=>shown.push({view:editor.view.key,...value}),requestAnimationFrame:callback=>callback(),
  workbench:{parts:{inspector:{querySelectorAll:()=>[],querySelector:()=>null}}},
 };
 controllerFunction('openReadinessDetails',env)(selection,{field:'actorId',address:{kind:'library',definitionRef:top,instancePath:['wrapper'],nodeId:'memory'}});
 assert.deepEqual(opened,[['openLibrary',child]]);
 assert.deepEqual(shown,[{view:'child-view',kind:'node',id:'memory'}]);
});
