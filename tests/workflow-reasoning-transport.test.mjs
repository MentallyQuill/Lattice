import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runWorkflow } from '../src/workflow/runtime.js';
import { resolveBinding, requestModel } from '../src/workflow/connections.js';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definition-data.js';

const node=(id,operation,controls={})=>({id,type:'workflow',operation,...controls});
const wire=(id,from,fromPort,to,toPort)=>({id,route:'wire',from,fromPort,to,toPort});
const complete=text=>({choices:[{message:{content:text},finish_reason:'stop'}]});
const messages=[{role:'user',content:'Owned prompt'}];
const graph=controls=>({id:'reasoning',schema:3,runtime:2,mode:'native-unified',nodes:{prompt:node('prompt','text',{text:'Describe the room.'}),model:node('model','model-call',controls)},wires:{a:wire('a','prompt','out','model','prompt')}});
const runtimePorts={target:{workflowId:'reasoning',instancePath:[],nodeId:'model',portId:'out'},resolveBinding:()=>({ok:true,data:{profileId:'fixed',model:'gpt-5.1'}}),countTokens:async()=>({tokens:1})};

test('runtime attaches explicit None to legacy requests and keeps it on retries',async()=>{
    const sent=[];
    const result=await runWorkflow(graph({maxRetries:1}),{...runtimePorts,retryDelay:async()=>true,request:async options=>{sent.push(options);return sent.length===1?{ok:false,error:{code:'REQUEST_FAILED',message:'Temporary.',retryable:true,status:503}}:{ok:true,data:{text:'A quiet room.',finish:'stop'}};}});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(sent.map(({reasoningEffort,reasoningCustom})=>({reasoningEffort,reasoningCustom})),[{reasoningEffort:'none',reasoningCustom:''},{reasoningEffort:'none',reasoningCustom:''}]);
});

test('runtime uses authored reasoning on every retry',async()=>{
    const sent=[];
    const result=await runWorkflow(graph({maxRetries:1,reasoningEffort:'custom',reasoningCustom:'provider-value'}),{...runtimePorts,retryDelay:async()=>true,request:async options=>{sent.push(options);return sent.length===1?{ok:false,error:{code:'REQUEST_FAILED',message:'Temporary.',retryable:true,status:503}}:{ok:true,data:{text:'A quiet room.',finish:'stop'}};}});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(sent.map(({reasoningEffort,reasoningCustom})=>({reasoningEffort,reasoningCustom})),[{reasoningEffort:'custom',reasoningCustom:'provider-value'},{reasoningEffort:'custom',reasoningCustom:'provider-value'}]);
});

test('nested For Each preserves actual child reasoning through both wrapper request scopes',async()=>{
    const raw={id:'child-reasoning',version:1,name:'Child reasoning',interface:[{id:'item',label:'Item',direction:'input',kind:'data',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'result',label:'Result',direction:'output',kind:'data',required:false,cardinality:'one',boundaryNodeId:'exit'}],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'item'},prompt:node('prompt','text',{text:'Describe this item.'}),model:node('model','model-call',{outputKind:'data',reasoningEffort:'high'}),exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'}},wires:{a:wire('a','prompt','out','model','prompt'),b:wire('b','entry','out','model','data'),c:wire('c','model','out','exit','in')}}};
    const definition=raw=>{const result=computeDefinitionIdentity(raw);assert.equal(result.ok,true,JSON.stringify(result.error));const def={...result.data.materializedDefinition,semanticHash:result.data.semanticHash};return {def,ref:{id:def.id,version:1,semanticHash:def.semanticHash}};};
    const inner=definition(raw);
    const outer=definition({id:'outer-reasoning',version:1,name:'Outer reasoning',interface:raw.interface,parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{entry:raw.body.nodes.entry,exit:raw.body.nodes.exit,each:node('each','for-each',{helper:inner.ref,limit:1,requestBoundPerIteration:1})},wires:{a:wire('a','entry','out','each','in'),b:wire('b','each','out','exit','in')}}});
    const root={id:'reasoning',schema:3,runtime:2,mode:'native-unified',definitions:{[definitionRefKey(inner.ref)]:inner.def,[definitionRefKey(outer.ref)]:outer.def},nodes:{source:node('source','text',{text:'[[{"item":1}]]'}),decode:node('decode','json-decode'),each:node('each','for-each',{helper:outer.ref,limit:1,requestBoundPerIteration:1})},wires:{a:wire('a','source','out','decode','in'),b:wire('b','decode','out','each','in')}};
    const sent=[];
    const result=await runWorkflow(root,{...runtimePorts,target:{workflowId:'reasoning',instancePath:[],nodeId:'each',portId:'out'},request:async options=>{sent.push(options);return {ok:true,data:{text:'{"room":"quiet"}',finish:'stop'}};}});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(sent.length,1);
    assert.equal(sent[0].reasoningEffort,'high');assert.equal(sent[0].reasoningCustom,'');
});

function host(active=false){
    const sent=[];
    const context={mainApi:'openai',chatCompletionSettings:{chat_completion_source:'openai',openai_model:'gpt-5.1',reasoning_effort:'high',show_thoughts:true},getChatCompletionModel:settings=>settings.openai_model,
        CONNECT_API_MAP:{openai:{selected:'openai',source:'openai'}},getPresetManager:()=>({getCompletionPresetByName:()=>({reasoning_effort:'high',show_thoughts:true})}),
        ChatCompletionService:{presetToGeneratePayload:async(_preset,_source,payload)=>({...payload,reasoning_effort:'high',include_reasoning:true}),sendRequest:async payload=>{sent.push(payload);return complete('Complete.');}},
        ConnectionManagerRequestService:{getProfile:id=>({id,name:'Fixed',api:'openai',model:'gpt-5.1',preset:'reasoning'}),sendRequest:async(_id,_messages,_maxTokens,_options,payload)=>{sent.push(payload);return complete('Complete.');}}};
    const binding=resolveBinding({profileId:active?'lattice:active-sillytavern':'fixed'},{},context);assert.equal(binding.ok,true,JSON.stringify(binding.error));
    return {context,binding:binding.data,sent};
}

for(const active of [false,true])test(`${active?'active':'fixed'} request None overrides converted preset reasoning without mutating host settings`,async()=>{
    const f=host(active),before=structuredClone(f.context.chatCompletionSettings);
    const result=await requestModel({binding:f.binding,messages,maxTokens:32},f.context);
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.equal(f.sent[0].reasoning_effort,'none');assert.equal(f.sent[0].include_reasoning,false);
    assert.deepEqual(f.context.chatCompletionSettings,before);
});

test('transport rejects invalid reasoning before the provider is called',async()=>{
    const f=host();
    const result=await requestModel({binding:f.binding,messages,maxTokens:32,reasoningEffort:'bogus'},f.context);
    assert.equal(result.ok,false);assert.equal(f.sent.length,0);
});

test('Custom reaches the auxiliary custom include body after preset conversion clears it',async()=>{
    const f=host();f.context.CONNECT_API_MAP.openai.source='custom';f.context.chatCompletionSettings.custom_url='https://fixture.example/v1';
    f.context.ConnectionManagerRequestService.getProfile=id=>({id,name:'Fixed',api:'openai',model:'provider-model','api-url':'https://fixture.example/v1'});
    const binding=resolveBinding({profileId:'fixed'},{},f.context);assert.equal(binding.ok,true);
    const result=await requestModel({binding:binding.data,messages,maxTokens:32,reasoningEffort:'custom',reasoningCustom:'3210'},f.context);
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(JSON.parse(f.sent[0].custom_include_body),{reasoning_effort:'3210'});
});

test('contextual prose cleanup keeps reasoning controls in transport without passing them to cleanup settings',async()=>{
    const source='The tension was palpable.',sent=[];
    const workflow={id:'reasoning',schema:3,runtime:2,mode:'native-unified',nodes:{snapshot:node('snapshot','reply-snapshot'),cleanup:node('cleanup','repair',{mode:'contextual',scope:'whole',reasoningEffort:'high'})},wires:{draft:wire('draft','snapshot','out','cleanup','in')}};
    const result=await runWorkflow(workflow,{...runtimePorts,target:{workflowId:'reasoning',instancePath:[],nodeId:'cleanup',portId:'out'},snapshot:()=>({kind:'draft',text:source,source:{originalText:source,token:'fixture'},spans:[{index:0,start:0,end:source.length,text:source}]}),request:async options=>{sent.push(options);return {ok:true,data:{text:'The room fell silent.',finish:'stop'}};}});
    assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(sent.length,1);assert.equal(sent[0].reasoningEffort,'high');
    assert.equal(result.recording.artifacts.findLast(artifact=>artifact.kind==='patches').value.patches[0].replacement,'The room fell silent.');
});
