import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { installMock } from './mock.js';
const moduleUrl=source=>'data:text/javascript,'+encodeURIComponent(source);
const hooks=registerHooks({resolve(specifier,context,next){if(specifier==='/script.js')return {url:moduleUrl('export const isGenerating=()=>false;export const syncMesToSwipe=()=>true;export const syncSwipeToMes=()=>true;'),shortCircuit:true};if(specifier==='/scripts/user.js')return {url:moduleUrl('export const getCurrentUserHandle=()=>globalThis.latticeFacadeUser;'),shortCircuit:true};return next(specifier,context);}});
test('installed facade passes one runtime request object to the real typed transport',async()=>{
    const c=installMock();Object.assign(c,{chatId:'story',characterId:0,chat:[{mes:'I use the wand.',is_user:true}],characters:[{data:{name:'Mara'}}]});globalThis.latticeFacadeUser='default-user';
    const previousFetch=globalThis.fetch;let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'http://localhost:8080/v1/systemone');const body=JSON.parse(options.body);assert.equal(body.model,'local');assert.deepEqual(body.state,{scene:'The wand flashes.'});assert.ok(body.questions.event);return {ok:true,status:200,text:async()=>JSON.stringify({model:'local',answers:{event:{type:'noul',noul:0.95}},usage:{input_tokens:2,output_tokens:1}})};};
    try{const facade=await import('../src/run.js?v=0.26.0');await facade.initializeNativeWorkflowController();assert.equal(facade.getFastConnectionRegistry().upsert({id:'local',provider:'laya',model:'local',endpoint:'http://localhost:8080/v1/systemone'}).ok,true);
        const nodes={text:{id:'text',type:'workflow',operation:'text',text:JSON.stringify({scene:'The wand flashes.'})},decode:{id:'decode',type:'workflow',operation:'json-decode'},decision:{id:'decision',type:'workflow',operation:'fast-decision',fastConnectionId:'local',questions:{event:{type:'noul',instructions:'Was the wand used?'}}}};
        const graph={id:'facade',schema:3,runtime:2,mode:'native-pre',nodes,wires:{a:{id:'a',route:'wire',from:'text',fromPort:'out',to:'decode',toPort:'in'},b:{id:'b',route:'wire',from:'decode',fromPort:'out',to:'decision',toPort:'in'}},portals:{},definitions:{}};
        const result=await facade.getNativeWorkflowController().runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'decision',portId:'out'});assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,1);assert.equal(calls,1);
    }finally{globalThis.fetch=previousFetch;delete globalThis.latticeFacadeUser;}
});

test('installed facade shares scoped catalog authorization with its trusted native controller',async()=>{
    const c=installMock();Object.assign(c,{chatId:'story',characterId:0,chat:[{mes:'A soul is captured.',is_user:true}],chatMetadata:{},characters:[{name:'Mara',avatar:'mara.png',chat:'Story-2'}]});globalThis.latticeFacadeUser='default-user';
    try {
        const facade=await import('../src/run.js?v=0.26.0'),catalog=facade.getStoryDocumentCatalog();
        assert.equal(catalog,facade.getStoryDocumentCatalog());assert.equal(facade.storyDocumentState().ok,true);
        assert.equal(catalog.define({targetId:'souls',name:'Sword souls',format:'json',content:'[]',visibility:{kind:'hidden'}}).ok,true);
        const graph={id:'file-facade',schema:3,runtime:2,mode:'native-unified',nodes:{read:{id:'read',type:'workflow',operation:'read-file',targetId:'souls'}},wires:{},portals:{},definitions:{}};
        const result=await facade.getNativeWorkflowController().runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'read',portId:'document'});
        assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,0);
        const lease=catalog.capture();assert.equal(lease.ok,true);globalThis.latticeFacadeUser='someone-else';assert.equal(lease.data.isCurrent(),false);assert.equal(facade.storyDocumentState().data.documents.length,0);
    } finally {delete globalThis.latticeFacadeUser;}
});


test('installed facade supplies native read-only user authority to a private character request',async()=>{
 const c=installMock(),actorId='character:mara.png';let privateController;globalThis.latticeFacadeUser='default-user';
 Object.assign(c,{mainApi:'openai',chatId:'Story-2',characterId:0,groupId:null,chat:[{mes:'Mara waits by the sea.',is_user:true,extra:{}}],characters:[{avatar:'mara.png',data:{name:'Mara',description:'PRIVATE SEA',visibility:{kind:'actor-private',actorId}}}],chatCompletionSettings:{chat_completion_source:'nanogpt',nanogpt_model:'active-model'},CONNECT_API_MAP:{nanogpt:{selected:'openai',source:'nanogpt'}},getChatCompletionModel:settings=>settings.nanogpt_model});
 c.setExtensionPrompt=(key,value)=>{c.extensionPrompts[key]={value};};
 const sent=[];c.ChatCompletionService={presetToGeneratePayload:async(_preset,_overrides,payload)=>payload,sendRequest:async payload=>{sent.push(JSON.stringify(payload.messages));const material=JSON.parse(payload.messages.at(-1).content),source=material.context?.source;return {choices:[{message:{content:source?.actorId===undefined&&source?JSON.stringify({sceneId:source.sceneId,sourceId:source.sourceId,revision:source.revision,actors:[{actorId,status:'present',evidence:c.chat[0].mes}]}):'Mara considers the sea.'},finish_reason:'stop'}]};}};
 try{
  const facade=await import('../src/run.js?v=0.26.0&private-transport'),{operationDefaults}=await import('../src/workflow/catalog.js'),{ACTIVE_PROFILE_ID}=await import('../src/workflow/model-profiles.js');
  const make=(id,operation,controls={})=>({id,type:'workflow',...operationDefaults(operation),...controls});
  const graph={id:'private-facade',schema:3,runtime:2,mode:'native-unified',roles:{},nodes:{scene:make('scene','scene-context',{visibilityMode:'public',includeCharacter:false}),prompt:make('prompt','text',{text:'Quote the present cast from context.source.'}),cast:make('cast','model-call',{profileId:ACTIVE_PROFILE_ID,outputKind:'data'}),presence:make('presence','scene-presence',{actorId}),direction:make('direction','character-direction',{profileId:ACTIVE_PROFILE_ID,actorId,systemPrompt:'Only Mara receives her own private direction.'})},wires:{},definitions:{},portals:{}};
  for(const[id,from,fromPort,to,toPort]of[['scene','scene','out','cast','context'],['prompt','prompt','out','cast','prompt'],['cast','cast','out','presence','in'],['presence','presence','out','direction','presence']])graph.wires[id]={id,route:'wire',from,fromPort,to,toPort};
  graph.nodes.send=make('send','on-send');graph.nodes.generate=make('generate','generate-reply');graph.nodes.review=make('review','review-publish');
  graph.wires.activation={id:'activation',route:'wire',from:'send',fromPort:'activation',to:'generate',toPort:'activation'};graph.wires.guidance={id:'guidance',route:'wire',from:'direction',fromPort:'out',to:'generate',toPort:'guidance'};graph.wires.draft={id:'draft',route:'wire',from:'generate',fromPort:'draft',to:'review',toPort:'draft'};
  const state=await import('../src/state.js?v=0.26.0');state.activateWorkflow(graph);state.settings().enabled=true;
  const listeners=new Map();c.eventTypes={GENERATION_STARTED:'started',GENERATION_ENDED:'ended',GENERATION_STOPPED:'stopped'};c.eventSource={on(name,fn){const list=listeners.get(name)??[];list.push(fn);listeners.set(name,list);},removeListener(name,fn){listeners.set(name,(listeners.get(name)??[]).filter(item=>item!==fn));},async emit(name,...args){for(const fn of listeners.get(name)??[])await fn(...args);}};
  await facade.initializeNativeWorkflowController();const controller=privateController=facade.getNativeWorkflowController();await c.eventSource.emit('started','normal',{},false);const result=await controller.beforeGenerate(c.chat.map(message=>({...message})),8192,()=>{},'normal');
  assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(sent.length,2);assert.equal(sent[0].includes('PRIVATE SEA'),false);assert.equal(sent[1].includes('PRIVATE SEA'),true);
 }finally{privateController?.dispose();delete globalThis.latticeFacadeUser;hooks.deregister();}
});
