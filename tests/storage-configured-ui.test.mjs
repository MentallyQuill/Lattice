import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createChatDocumentCatalog} from '../src/workflow/document-catalog.js?v=0.27.0';
import {prepareNativeSearchCatalog,resolveNativeSearchChoice,matchNativeSearchPorts} from '../src/ui/native-search-catalog.js?v=0.27.0';
import {describeOperation,operationDefaults} from '../src/workflow/catalog.js?v=0.27.0';
const setup=await import('../src/ui/story-document-setup.js?v=0.27.0').catch(()=>({}));
const config=await import('../src/ui/configured-node-creation.js?v=0.27.0').catch(()=>({}));
const scope={schema:3,runtime:2,mode:'native-unified',workflowId:'root',viewPath:[],inDefinition:false};
const definition={targetId:'souls.json',name:'Sword souls',format:'json',content:'[]',visibility:{kind:'public'}};
function storageFixture(saveMetadata){let user='default-user';const context={chatId:'story',chat:[],chatMetadata:{}};const catalog=createChatDocumentCatalog({getContext:()=>context,getUserId:()=>user,saveMetadata:saveMetadata??(()=>undefined)});return {context,catalog,user:value=>user=value};}

test('required-configuration nodes remain discoverable without valid placeholder controls',()=>{
 const prepared=prepareNativeSearchCatalog(scope);assert.equal(prepared.ok,true);
 for(const operation of ['time-trigger','for-each','prompted-memory','item-mention-trigger','item-use-trigger','scene-presence','character-direction','parse-effect-library','recall','hotkey-arm']){const choice=prepared.data.choices.find(item=>item.id==='operation:'+operation);assert.ok(choice,operation);assert.equal(choice.requiresConfiguration,true);const command=resolveNativeSearchChoice(prepared.data,choice.id);assert.equal(command.requiresConfiguration,true);assert.equal(describeOperation(scope,{type:'workflow',...operationDefaults(operation)}).ok,false);}
 const read=matchNativeSearchPorts(prepared.data,'operation:read-file',{kind:'data',dir:'in'});assert.deepEqual(read.map(pin=>pin.portId),['document','reference']);
 const each=matchNativeSearchPorts(prepared.data,'operation:for-each',{kind:'data',dir:'out'});assert.deepEqual(each.map(pin=>pin.portId),['in','state']);
});

test('document-backed nodes can be created from search with usable automatic defaults and no setup catalog',async()=>{
 const {prepareNativeConnectionEdit}=await import('../src/workflow/connection-edits.js?v=0.27.0');
 const graph={id:'automatic-data',schema:3,runtime:2,mode:'native-unified',nodes:{},wires:{},definitions:{},portals:{}},prepared=prepareNativeSearchCatalog(scope);
 for(const [operation,key,targetId] of [['read-file','targetId','lattice-default-notes'],['story-clock','clockId','lattice-default-clock'],['commit-outcomes','targetId','lattice-default-outcomes']]){
  assert.equal(config.nodeNeedsConfiguration(operation),false,operation+' must add immediately');
  const choice=prepared.data.choices.find(item=>item.id==='operation:'+operation),command=resolveNativeSearchChoice(prepared.data,choice.id);
  assert.equal(choice.requiresConfiguration,undefined);assert.equal(command.requiresConfiguration,undefined);
  const created=prepareNativeConnectionEdit(graph,{kind:'create',...command,graphPoint:{x:20,y:30},phase:'post'});assert.equal(created.ok,true,JSON.stringify(created));
  const node=created.data.candidate.nodes[created.data.addedNodeIds[0]];assert.equal(node[key],targetId);assert.equal(describeOperation(scope,node).ok,true);
  assert.equal(config.validateConfiguredNodeControls(operation,'{}',{phase:'post',targets:[],helpers:[]}).ok,true);
 }
});

test('automatic node creation retains explicit target and control validation',()=>{
 const options={phase:'post',targets:[{targetId:'custom.json',format:'json'}],helpers:[]};
 for(const [operation,key] of [['read-file','targetId'],['story-clock','clockId'],['commit-outcomes','targetId']]){
  assert.equal(config.nodeNeedsConfiguration(operation,{[key]:'custom.json'}),true);
  assert.equal(config.nodeNeedsConfiguration(operation,{[key]:''}),true);
  assert.equal(config.validateConfiguredNodeControls(operation,JSON.stringify({[key]:''}),options).ok,false);
  assert.equal(config.validateConfiguredNodeControls(operation,JSON.stringify({[key]:'unconfigured.json'}),options).error.code,'DOCUMENT_NOT_AUTHORIZED');
 }
 assert.equal(config.nodeNeedsConfiguration('read-file',{schema:'not valid JSON'}),true);
 assert.equal(config.validateConfiguredNodeControls('read-file','{"schema":"not valid JSON"}',options).ok,false);
});

test('story setup lists redacted summaries and explicitly loads templates before editing',()=>{
 assert.equal(typeof setup.createStoryDocumentSetup,'function');const f=storageFixture(),ui=setup.createStoryDocumentSetup(f.catalog);const initial=ui.snapshot();assert.equal(initial.ok,true);
 const loaded=ui.load(initial.data.key,'missing');assert.equal(loaded.ok,false);
 f.catalog.define(definition);const view=ui.snapshot();assert.equal(view.ok,true);assert.equal(Object.hasOwn(view.data.documents[0],'content'),false);assert.equal(JSON.stringify(view.data).includes('[]'),false);
 const edit=ui.load(view.data.key,'souls.json');assert.equal(edit.ok,true);assert.equal(edit.data.definition.content,'[]');
});

test('story setup rejects stale catalog, user and chat scopes before any definition mutation',async()=>{
 assert.equal(typeof setup.createStoryDocumentSetup,'function');for(const change of ['catalog','user','chat']){const f=storageFixture(),ui=setup.createStoryDocumentSetup(f.catalog),view=ui.snapshot();if(change==='catalog')f.catalog.define({...definition,targetId:'external.json'});if(change==='user')f.user('other-user');if(change==='chat')f.context.chatId='other-chat';const before=structuredClone(f.context.chatMetadata);const result=await ui.save(view.data.key,definition);assert.equal(result.ok,false);assert.equal(result.error.code,'STALE_DOCUMENT_SETUP');assert.deepEqual(f.context.chatMetadata,before);}
});

test('story setup leaves existing canonical content intact and reports unverified save truthfully',async()=>{
 assert.equal(typeof setup.createStoryDocumentSetup,'function');const f=storageFixture(),ui=setup.createStoryDocumentSetup(f.catalog);f.catalog.define(definition);f.context.chatMetadata.latticeDocuments={'default-user':{'souls.json':{format:'json',content:'[{"id":"s1"}]',revision:1,receipts:[]}}};const view=ui.snapshot(),result=await ui.save(view.data.key,{...definition,name:'Sword archive',content:'["initial template"]'});assert.equal(result.ok,true);assert.equal(result.data.acknowledged,false);assert.match(result.data.message,/unconfirmed/i);assert.equal(f.context.chatMetadata.latticeDocuments['default-user']['souls.json'].content,'[{"id":"s1"}]');
 const removed=await ui.remove(ui.snapshot().data.key,'souls.json');assert.equal(removed.ok,true);assert.equal(f.context.chatMetadata.latticeDocuments['default-user']['souls.json'].content,'[{"id":"s1"}]');
});

test('story setup rejects changed scope after an awaited verified save',async()=>{
 assert.equal(typeof setup.createStoryDocumentSetup,'function');let release;const f=storageFixture(()=>new Promise(resolve=>release=resolve)),ui=setup.createStoryDocumentSetup(f.catalog);const pending=ui.save(ui.snapshot().data.key,definition);f.user('other-user');release(true);const result=await pending;assert.equal(result.ok,false);assert.equal(result.error.code,'STALE_DOCUMENT_SETUP');assert.equal(f.context.chatMetadata.latticeDocumentCatalog['other-user'],undefined);
});

test('configured creation authorizes selected logical targets and keeps strict required settings',()=>{
 assert.equal(typeof config.validateConfiguredNodeControls,'function');const options={phase:'post',targets:[{targetId:'souls.json',format:'json'}],helpers:[]};
 assert.equal(config.validateConfiguredNodeControls('read-file','{"targetId":"souls.json"}',options).ok,true);assert.equal(config.validateConfiguredNodeControls('read-file','{"targetId":"../outside"}',options).ok,false);assert.equal(config.validateConfiguredNodeControls('read-file','{"targetId":""}',options).ok,false);assert.equal(config.validateConfiguredNodeControls('item-mention-trigger','{"actorId":"mara","itemId":"wand","aliases":["broken wand"]}',options).ok,true);assert.equal(config.validateConfiguredNodeControls('scene-presence','{"actorId":"mara","undeclared":true}',options).ok,false);
});

test('configured creation sessions preserve exact capture and cancel without prepare or commit',async()=>{
 assert.equal(typeof config.createConfiguredNodeSession,'function');let prepares=0,commits=0;const capture={},session=config.createConfiguredNodeSession({isCurrent:token=>token===capture,prepare:()=>{prepares++;return {ok:true,data:{changed:true}};}});const opened=session.open(capture,{operation:'read-file'}, {phase:'pre',targets:[{targetId:'souls.json',format:'json'}],helpers:[]});session.cancel(opened.view.key);assert.equal((await opened.result).error.code,'NODE_CONFIGURATION_CANCELLED');assert.equal(prepares,0);assert.equal(commits,0);
});

test('configured creation holds stale captures and rejects changed pin shapes before completing',async()=>{
 assert.equal(typeof config.createConfiguredNodeSession,'function');const capture={};let current=true,prepared;const session=config.createConfiguredNodeSession({isCurrent:token=>current&&token===capture,prepare:(token,command)=>{prepared=command;return {ok:true,data:{changed:true}};}});const opened=session.open(capture,{operation:'read-file'}, {phase:'post',targets:[{targetId:'souls.json',format:'json'}],helpers:[]});current=false;const stale=session.apply(opened.view.key,'{"targetId":"souls.json"}','post');assert.equal(stale.ok,false);assert.equal(prepared,undefined);session.cancel(opened.view.key);
 const fresh=session.open(capture,{operation:'parse-effect-library',connection:{origin:{nodeId:'text',portId:'out'},portId:'in'}},{phase:'pre',targets:[],helpers:[],originKind:'text',originDirection:'out'});current=true;const changed=session.apply(fresh.view.key,'{"libraryId":"wand-effects","revision":"1","itemId":"wand","format":"data"}','pre');assert.equal(changed.ok,false);assert.equal(changed.error.code,'CONFIGURATION_PORT_CHANGED');session.cancel(fresh.view.key);await fresh.result;
});

test('configured creation defaults to the effective selected response stage and locks stage-specific helper contracts',()=>{
 assert.equal(typeof config.configuredCreationStage,'function');
 assert.deepEqual(config.configuredCreationStage('read-file','native-unified','post'),{phase:'post',phaseLocked:false});
 assert.deepEqual(config.configuredCreationStage('read-file','native-post','pre',true),{phase:'post',phaseLocked:true});
 assert.deepEqual(config.configuredCreationStage('on-send','native-unified','post'),{phase:'pre',phaseLocked:true});
});

test('configured document creation rechecks its captured catalog authorization before preparation',async()=>{
 const f=storageFixture();f.catalog.define(definition);const lease=f.catalog.capture().data,capture={};let prepared=0;
 const session=config.createConfiguredNodeSession({isCurrent:()=>true,isOptionsCurrent:()=>lease.isCurrent(),prepare:()=>{prepared++;return {ok:true,data:{}};}});
 const opened=session.open(capture,{kind:'create',operation:'read-file'},{phase:'post',targets:[{targetId:'souls.json',format:'json'}],helpers:[]});
 f.catalog.remove('souls.json');const applied=session.apply(opened.view.key,'{"targetId":"souls.json"}','post');assert.equal(applied.ok,false);assert.equal(applied.error.code,'STALE_DOCUMENT_SETUP');assert.equal(prepared,0);session.cancel(opened.view.key);await opened.result;
});

test('configured creation resolves a real strict graph candidate only after valid controls',async()=>{
 const {prepareNativeConnectionEdit}=await import('../src/workflow/connection-edits.js?v=0.27.0');
 const graph={id:'configured',schema:3,runtime:2,mode:'native-unified',nodes:{},wires:{},definitions:{},portals:{}},before=structuredClone(graph),capture={};
 const session=config.createConfiguredNodeSession({isCurrent:()=>true,prepare:(token,command)=>prepareNativeConnectionEdit(graph,{...command,graphPoint:{x:20,y:30}})});
 const opened=session.open(capture,{kind:'create',operation:'read-file',requiresConfiguration:true},{phase:'post',targets:[{targetId:'souls.json',format:'json'}],helpers:[]});
 assert.equal(session.apply(opened.view.key,'{"targetId":""}','post').ok,false);assert.deepEqual(graph,before);
 assert.equal(session.apply(opened.view.key,'{"targetId":"souls.json"}','post').ok,true);const prepared=await opened.result;assert.equal(prepared.ok,true,JSON.stringify(prepared));const node=prepared.data.candidate.nodes[prepared.data.addedNodeIds[0]];assert.equal(node.targetId,'souls.json');assert.equal(node.phase,'post');assert.equal(node.requiresConfiguration,undefined);assert.deepEqual(graph,before);
});

test('story clock template uses the real engine contract and no ambient time',async()=>{
 assert.equal(typeof setup.createStoryClockTemplate,'function');const made=setup.createStoryClockTemplate('time.json','fantasy-calendar',840);assert.equal(made.ok,true);const clock=JSON.parse(made.data.text);assert.equal(clock.clockId,'time.json');assert.equal(clock.absoluteMinute,840);assert.equal(clock.schemaVersion,1);assert.equal(clock.revision,1);const {advanceStoryClock}=await import('../src/workflow/story-time.js?v=0.27.0');assert.equal(advanceStoryClock(clock,{kind:'duration',minutes:480}).ok,true);assert.equal(setup.createStoryClockTemplate('','calendar',0).ok,false);assert.equal(setup.createStoryClockTemplate('time','calendar',-1).ok,false);
});

test('Recall deferred ports match their configured activation in root and static bodies',()=>{
 const prepared=prepareNativeSearchCatalog(scope).data,body=prepareNativeSearchCatalog({...scope,viewPath:['child'],inDefinition:true}).data;
 for(const operation of ['recall','hotkey-arm']){assert.equal(prepared.choices.find(item=>item.id==='operation:'+operation).requiresConfiguration,true);assert.equal(body.choices.find(item=>item.id==='operation:'+operation).requiresConfiguration,true);}
 for(const activation of ['armed','keyword','event','armed-or-character']){const controls={actorId:'mara',memorySetId:'memories',activation,keywords:['wand'],eventTypes:['kiss']},described=describeOperation({...scope,mode:'native-unified'},{type:'workflow',...operationDefaults('recall'),...controls});assert.equal(described.ok,true);assert.deepEqual(config.deferredNodeDescription('recall',controls).ports,described.data.ports);}
});

test('For Each setup exposes only exact pinned Data item/result helpers and rejects edited references',async()=>{
 const {computeDefinitionIdentity}=await import('../src/workflow/definitions.js?v=0.27.0');const {definitionRefKey}=await import('../src/workflow/definition-data.js?v=0.27.0');
 const draft={id:'item-helper',version:1,name:'Identity',interface:[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'input'},{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'output'}],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{input:{id:'input',type:'subgraph-input',interfacePortId:'item'},output:{id:'output',type:'subgraph-output',interfacePortId:'result'}},wires:{same:{id:'same',route:'wire',from:'input',fromPort:'out',to:'output',toPort:'in'}}}};
 const make=value=>{const checked=computeDefinitionIdentity(value);assert.equal(checked.ok,true,JSON.stringify(checked));return {...checked.data.materializedDefinition,semanticHash:checked.data.semanticHash};};const definition=make(draft),optional=make({...draft,id:'optional',interface:draft.interface.map(port=>({...port,required:false}))});
 const definitions=Object.fromEntries([definition,optional].map(def=>[definitionRefKey(def),def])),choices=config.iterationHelperChoices({definitions});assert.equal(choices.length,1);assert.equal(choices[0].ref.id,'item-helper');const options={phase:'post',targets:[],helpers:choices};
 assert.equal(config.validateConfiguredNodeControls('for-each',JSON.stringify({helper:choices[0].ref,requestBoundPerIteration:1,mode:'map'}),options).ok,true);assert.equal(config.validateConfiguredNodeControls('for-each',JSON.stringify({helper:{...choices[0].ref,version:2}}),options).ok,false);assert.equal(config.validateConfiguredNodeControls('for-each',JSON.stringify({helper:choices[0].ref,mode:'projected-state'}),options).ok,false);
});

test('setup save and remove reject a scope switch on the actual mutation entry callback without rebasing private data',async()=>{
 for(const action of ['save','remove'])for(const change of ['user','chat','catalog']){
  let user='default-user',armed=false,calls=0;const context={chatId:'Story-2',chat:[],chatMetadata:{}};
  const privateDoc={targetId:'moments.json',name:'Mara memories',format:'json',content:'["PRIVATE INITIAL TEMPLATE"]',visibility:{kind:'actor-private',actorId:'mara'}};
  const catalog=createChatDocumentCatalog({getContext:()=>context,getUserId:()=>{if(armed&&++calls===2){if(change==='user')user='other-user';if(change==='chat')context.chatId='Story-3';if(change==='catalog'){const packet=context.chatMetadata.latticeDocumentCatalog['default-user'];packet.documents['moments.json']={...packet.documents['moments.json'],name:'External edit',content:'["EXTERNAL TEMPLATE"]',revision:'external'};}}return user;},saveMetadata:()=>true});
  assert.equal(catalog.define(privateDoc).ok,true);user='other-user';assert.equal(catalog.define({...privateDoc,name:'Other user',content:'["OTHER USER CONTENT"]'}).ok,true);user='default-user';const ui=setup.createStoryDocumentSetup(catalog),view=ui.snapshot();const before=structuredClone(context.chatMetadata);armed=true;calls=0;
  const result=await (action==='save'?ui.save(view.data.key,{...privateDoc,name:'Updated name'}):ui.remove(view.data.key,privateDoc.targetId));
  assert.equal(result.ok,false,action+' '+change);assert.equal(result.error.code,'STALE_DOCUMENT_SETUP');assert.deepEqual(context.chatMetadata.latticeDocumentCatalog['other-user'],before.latticeDocumentCatalog['other-user'],'other-user authorization must remain byte-for-byte intact');
  if(change==='catalog'){const existing=context.chatMetadata.latticeDocumentCatalog['default-user'].documents['moments.json'];assert.equal(existing.name,'External edit');assert.equal(existing.content,'["EXTERNAL TEMPLATE"]');}
  else assert.deepEqual(context.chatMetadata.latticeDocumentCatalog['default-user'],before.latticeDocumentCatalog['default-user'],'original authorization is unchanged on scope rejection');
 }
});

test('cancelled configuration cannot prepare or clear a replacement at any authority or preparation callback',async()=>{
 for(const seam of ['graph-initial','options-initial','prepare','graph-final','options-final']){
  let session,first,second,armed=false,replaced=false,graphChecks=0,optionChecks=0,prepares=0;
  const options={phase:'post',targets:[{targetId:'souls.json',format:'json'}],helpers:[]},replace=()=>{if(!armed||replaced)return;replaced=true;session.cancel(first.view.key);second=session.open({}, {kind:'create',operation:'read-file'},options);};
  session=config.createConfiguredNodeSession({isCurrent:()=>{graphChecks++;if(seam==='graph-initial'&&graphChecks===1||seam==='graph-final'&&graphChecks===2)replace();return true;},isOptionsCurrent:()=>{optionChecks++;if(seam==='options-initial'&&optionChecks===1||seam==='options-final'&&optionChecks===2)replace();return true;},prepare:()=>{prepares++;if(seam==='prepare')replace();return {ok:true,data:{candidate:'prepared'}};}});
  first=session.open({}, {kind:'create',operation:'read-file'},options);armed=true;const applied=session.apply(first.view.key,'{"targetId":"souls.json"}','post');assert.equal(applied.ok,false,seam+' obsolete apply must not finalize');assert.equal((await first.result).error.code,'NODE_CONFIGURATION_CANCELLED');assert.ok(second);assert.equal(prepares,seam.endsWith('initial')?0:1,seam+' cancellation before prepare must perform no prepare');
  const next=session.apply(second.view.key,'{"targetId":"souls.json"}','post');assert.equal(next.ok,true,seam+' replacement remains independently usable');assert.equal((await second.result).ok,true);assert.equal(prepares,seam.endsWith('initial')?1:2);
 }
});

test('Outcome Commit automatic defaults stay response-only and custom targets require authorized JSON',()=>{
 const unified=prepareNativeSearchCatalog(scope).data,choice=unified.choices.find(item=>item.id==='operation:commit-outcomes');assert.ok(choice);assert.equal(choice.requiresConfiguration,undefined);assert.equal(choice.phase,'post');assert.equal(prepareNativeSearchCatalog({...scope,mode:'native-pre'}).ok,false);
 const options={phase:'post',targets:[{targetId:'outcomes.json',format:'json'},{targetId:'notes.txt',format:'text'}],helpers:[]};assert.equal(config.validateConfiguredNodeControls('commit-outcomes','{"targetId":"outcomes.json"}',options).ok,true);assert.equal(config.validateConfiguredNodeControls('commit-outcomes','{"targetId":"notes.txt"}',options).ok,false);assert.equal(config.validateConfiguredNodeControls('commit-outcomes','{"targetId":"missing.json"}',options).ok,false);
});
