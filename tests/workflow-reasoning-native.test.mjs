import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createNativeWorkflowController} from '../src/workflow/host.js';

function fixture(controls={},options={}){
    const graph={id:'native-reasoning',schema:3,runtime:2,mode:'native-unified',runTargets:[{instancePath:[],nodeId:'review'}],nodes:{send:{id:'send',type:'workflow',operation:'on-send'},generate:{id:'generate',type:'workflow',operation:'generate-reply',...controls},review:{id:'review',type:'workflow',operation:'review-publish'}},wires:{activation:{id:'activation',route:'wire',from:'send',fromPort:'activation',to:'generate',toPort:'activation'},draft:{id:'draft',route:'wire',from:'generate',fromPort:'draft',to:'review',toPort:'draft'}},definitions:{}};
    const listeners=new Map(),results=[];let aborts=0,stops=0,busy=true;
    const c={mainApi:'openai',chatCompletionSettings:{chat_completion_source:'openai',openai_model:'gpt-5.1',reasoning_effort:'high',show_thoughts:true},getChatCompletionModel:s=>s.openai_model,chatId:'story',characterId:0,groupId:null,characters:[{data:{name:'Mara'}}],chat:[{mes:'I open the door.',is_user:true,extra:{}}],extensionPrompts:{},eventTypes:Object.fromEntries(['GENERATION_STARTED','GENERATION_STOPPED','GENERATION_ENDED','MESSAGE_RECEIVED','CHAT_CHANGED','CHAT_COMPLETION_SETTINGS_READY'].filter(name=>!options.missingEvent||name!=='CHAT_COMPLETION_SETTINGS_READY').map(name=>[name,name]))};
    c.eventSource={on(name,fn){const bucket=listeners.get(name)??[];bucket.push(fn);listeners.set(name,bucket);},removeListener(name,fn){listeners.set(name,(listeners.get(name)??[]).filter(item=>item!==fn));},async emit(name,...args){for(const fn of listeners.get(name)??[])await fn(...args);}};
    c.setExtensionPrompt=(key,value)=>{c.extensionPrompts[key]={value};};
    c.stopGeneration=()=>{stops++;void c.eventSource.emit('GENERATION_STOPPED');};
    const controller=createNativeWorkflowController({context:()=>c,getGraph:phase=>phase==='unified'?graph:undefined,isEnabled:()=>true,userId:()=> 'user',isBusy:()=>busy,countTokens:async()=>({tokens:1}),getFailurePolicy:()=>options.failurePolicy,stopGeneration:()=>c.stopGeneration(),onResult:r=>results.push(r)});
    controller.subscribe();
    return {graph,c,controller,results,aborts:()=>aborts,stops:()=>stops,setBusy:value=>{busy=value;},async start(){await c.eventSource.emit('GENERATION_STARTED','normal',{},false);return controller.beforeGenerate([...c.chat],8192,()=>aborts++,'normal');},emit:payload=>c.eventSource.emit('CHAT_COMPLETION_SETTINGS_READY',payload)};
}
const payload=()=>({type:'normal',chat_completion_source:'openai',model:'gpt-5.1',reasoning_effort:'high',include_reasoning:true,messages:[{role:'user',content:'Owned native prompt'}]});

test('native final settings hook applies owned reasoning exactly once without touching global settings',async()=>{
    const f=fixture(),before=structuredClone(f.c.chatCompletionSettings);
    try{
        const unrelated=payload();await f.emit(unrelated);assert.equal(unrelated.reasoning_effort,'high');
        assert.equal((await f.start()).ok,true);
        const quiet={...payload(),type:'quiet'};await f.emit(quiet);assert.equal(quiet.reasoning_effort,'high');
        const owned=payload();await f.emit(owned);assert.equal(owned.reasoning_effort,'none');assert.equal(owned.include_reasoning,false);
        assert.deepEqual(owned.messages,[{role:'user',content:'Owned native prompt'}]);assert.deepEqual(f.c.chatCompletionSettings,before);
        const second=payload();await f.emit(second);assert.equal(second.reasoning_effort,'high');
    }finally{f.controller.dispose();}
});

test('native final settings hook ignores canceled disposed dry-run and stale owners',async()=>{
    for(const action of ['cancel','dispose','dry-run','stale']){
        const f=fixture({reasoningEffort:'high'});
        try{
            assert.equal((await f.start()).ok,true);
            if(action==='cancel')f.controller.cancel();
            if(action==='dispose')f.controller.dispose();
            if(action==='dry-run')await f.c.eventSource.emit('GENERATION_STARTED','normal',{},true);
            if(action==='stale')f.c.chat[0].mes='Changed source.';
            const value={...payload(),reasoning_effort:'low'};await f.emit(value);assert.equal(value.reasoning_effort,'low',action);
        }finally{f.controller.dispose();}
    }
});

test('native custom JSON additions retain unrelated fields while reasoning takes precedence',async()=>{
    const f=fixture({reasoningEffort:'custom',reasoningCustom:'3210'});
    f.c.chatCompletionSettings.chat_completion_source='custom';f.c.chatCompletionSettings.custom_url='https://fixture.example';
    try{
        assert.equal((await f.start()).ok,true);
        const value={...payload(),chat_completion_source:'custom',model:'provider-model',custom_url:'https://fixture.example',custom_include_body:'{"other":true,"reasoning_effort":"preset"}',custom_exclude_body:'temperature'};
        await f.emit(value);assert.deepEqual(JSON.parse(value.custom_include_body),{other:true,reasoning_effort:'3210'});assert.equal(value.custom_exclude_body,'temperature');
    }finally{f.controller.dispose();}
});

test('native enabled reasoning fails preparation when the final settings surface is missing',async()=>{
    const f=fixture({reasoningEffort:'high'},{missingEvent:true});
    try{const result=await f.start();assert.equal(result.ok,false);assert.equal(result.error.code,'REASONING_UNSUPPORTED');assert.equal(f.aborts(),1);}finally{f.controller.dispose();}
});

test('native text completions report skipped default None and reject enabled reasoning',async()=>{
    for(const controls of [{},{reasoningEffort:'high'}]){
        const f=fixture(controls);f.c.mainApi='textgenerationwebui';f.c.textCompletionSettings={type:'generic'};
        try{const result=await f.start();if(controls.reasoningEffort){assert.equal(result.ok,false);assert.equal(result.error.code,'REASONING_UNSUPPORTED');}else{assert.equal(result.ok,true);assert.equal(result.reasoningSkipped,true);}}finally{f.controller.dispose();}
    }
});

test('native unsupported final settings stop physical generation and retain the actionable error',async()=>{
    const f=fixture({reasoningEffort:'high'});
    try{
        assert.equal((await f.start()).ok,true);
        const value={...payload(),chat_completion_source:'unmapped-provider'};
        await f.emit(value);
        for(let count=0;count<20&&!f.results.length;count++)await new Promise(resolve=>setTimeout(resolve,1));
        assert.equal(f.stops(),1);assert.equal(f.results.at(-1)?.error?.code,'REASONING_UNSUPPORTED');
        assert.equal(value.reasoning_effort,'high');
    }finally{f.controller.dispose();}
});

test('native reasoning failures stop once under stop and recovery policies without replay or fallback',async()=>{
    for(const failurePolicy of ['stop','continue-available']){
        const f=fixture({reasoningEffort:'high'},{failurePolicy});
        try{
            assert.equal((await f.start()).ok,true);
            const value={...payload(),chat_completion_source:'unmapped-provider'};
            await f.emit(value);
            for(let count=0;count<20&&!f.results.length;count++)await new Promise(resolve=>setTimeout(resolve,1));
            const result=f.results.at(-1);assert.ok(result,'The original native failure must settle');
            assert.equal(f.stops(),1,failurePolicy);assert.equal(f.aborts(),1,failurePolicy);
            assert.equal(result.error.code,'REASONING_UNSUPPORTED');assert.equal(result.failureDisposition,'stopped');
            assert.equal(result.fallback,undefined);assert.equal(result.actualCalls,0);assert.equal(f.results.length,1);
            assert.equal(value.reasoning_effort,'high');
            await f.emit(payload());assert.equal(f.stops(),1);assert.equal(f.results.length,1);
        }finally{f.controller.dispose();}
    }
});

test('native direct Claude and Gemini reasoning uses the final payload without auxiliary binding restrictions',async()=>{
    for(const [source,model] of [['claude','claude-sonnet-4-6'],['makersuite','gemini-3.1-pro-preview'],['vertexai','gemini-3.1-pro-preview']]){
        const f=fixture({reasoningEffort:'high'});
        f.c.chatCompletionSettings.chat_completion_source=source;f.c.chatCompletionSettings.openai_model=model;
        try{
            const ready=await f.start();assert.equal(ready.ok,true,JSON.stringify(ready.error));
            const value={...payload(),chat_completion_source:source,model,reasoning_effort:'low',include_reasoning:false};
            await f.emit(value);assert.equal(value.reasoning_effort,'high',source);assert.equal(value.include_reasoning,true,source);
        }finally{f.controller.dispose();}
    }
});

test('native custom YAML body fails preparation visibly instead of dropping unrelated additions',async()=>{
    const f=fixture({reasoningEffort:'custom',reasoningCustom:'high'});
    Object.assign(f.c.chatCompletionSettings,{chat_completion_source:'custom',custom_url:'https://fixture.example',custom_include_body:'other: true'});
    try{const result=await f.start();assert.equal(result.ok,false);assert.equal(result.error.code,'REASONING_UNSUPPORTED');assert.equal(f.c.chatCompletionSettings.custom_include_body,'other: true');assert.equal(f.aborts(),1);}finally{f.controller.dispose();}
});

test('native None removes inherited custom reasoning while retaining unrelated nested additions',async()=>{
    const f=fixture();
    Object.assign(f.c.chatCompletionSettings,{chat_completion_source:'custom',openai_model:'provider-model',custom_url:'https://fixture.example'});
    try{
        assert.equal((await f.start()).ok,true);
        const value={...payload(),chat_completion_source:'custom',model:'provider-model',custom_url:'https://fixture.example',custom_include_body:JSON.stringify({other:true,reasoning_effort:'high',thinking:{type:'enabled'},extra_body:{other:1,google:{other:2,thinking_config:{thinking_budget:123}}}})};
        await f.emit(value);
        assert.deepEqual(JSON.parse(value.custom_include_body),{other:true,extra_body:{other:1,google:{other:2}}});
        assert.equal(value.include_reasoning,false);
    }finally{f.controller.dispose();}
});

test('native custom reasoning rejects conflicting exclusions before releasing generation',async()=>{
    for(const exclusion of ['reasoning_effort','["reasoning_effort"]']){
        const f=fixture({reasoningEffort:'custom',reasoningCustom:'3210'});
        Object.assign(f.c.chatCompletionSettings,{chat_completion_source:'custom',openai_model:'provider-model',custom_url:'https://fixture.example',custom_exclude_body:exclusion});
        try{const result=await f.start();assert.equal(result.ok,false);assert.equal(result.error.code,'REASONING_UNSUPPORTED');assert.equal(f.aborts(),1);assert.equal(f.c.chatCompletionSettings.custom_exclude_body,exclusion);}finally{f.controller.dispose();}
    }
});

test('native default None preserves YAML additions through the public host parser',async()=>{
    const prior=globalThis.SillyTavern;
    // The host owns YAML syntax. This fixture exposes its parsed public output.
    globalThis.SillyTavern={libs:{yaml:{parse:input=>{if(input==='other: true\nreasoning_effort: high')return {other:true,reasoning_effort:'high'};if(input==='- temperature')return ['temperature'];throw Error('Unknown fixture YAML');}}}};
    const f=fixture();
    Object.assign(f.c.chatCompletionSettings,{chat_completion_source:'custom',openai_model:'provider-model',custom_url:'https://fixture.example',custom_include_body:'other: true\nreasoning_effort: high',custom_exclude_body:'- temperature'});
    try{
        const ready=await f.start();assert.equal(ready.ok,true,JSON.stringify(ready.error));
        const value={...payload(),chat_completion_source:'custom',model:'provider-model',custom_url:'https://fixture.example',custom_include_body:f.c.chatCompletionSettings.custom_include_body,custom_exclude_body:'- temperature'};
        await f.emit(value);assert.deepEqual(JSON.parse(value.custom_include_body),{other:true});assert.equal(value.custom_exclude_body,'- temperature');assert.equal(value.include_reasoning,false);
    }finally{f.controller.dispose();if(prior===undefined)delete globalThis.SillyTavern;else globalThis.SillyTavern=prior;}
});

test('native completion reports a missing reasoning hook instead of claiming the control took effect',async()=>{
    for(const controls of [{},{reasoningEffort:'high'}]){
        const f=fixture(controls);
        try{
            assert.equal((await f.start()).ok,true);
            const now=new Date().toISOString(),text='Native reply.';
            f.c.chat.push({mes:text,is_user:false,extra:{},gen_started:now,gen_finished:now,swipe_id:0,swipes:[text],swipe_info:[{gen_started:now,gen_finished:now,extra:{}}]});
            f.setBusy(false);await f.c.eventSource.emit('MESSAGE_RECEIVED',1,'normal');await f.c.eventSource.emit('GENERATION_ENDED');
            for(let count=0;count<30&&!f.results.length;count++)await new Promise(resolve=>setTimeout(resolve,1));
            const result=f.results.at(-1);assert.ok(result,'Native continuation must settle');
            if(controls.reasoningEffort){assert.equal(result.ok,false);assert.equal(result.error.code,'REASONING_UNSUPPORTED');}
            else {assert.equal(result.ok,true,JSON.stringify(result.error));assert.ok(result.recording.units.find(unit=>unit.operation==='generate-reply').reports.some(report=>report.code==='REASONING_SKIPPED'));}
        }finally{f.controller.dispose();}
    }
});

test('native final chat payload determines its API even if the live selector changes after preparation',async()=>{
    const f=fixture();
    try{assert.equal((await f.start()).ok,true);f.c.mainApi='textgenerationwebui';const value=payload();await f.emit(value);assert.equal(value.reasoning_effort,'none');assert.equal(value.include_reasoning,false);}finally{f.controller.dispose();}
});
