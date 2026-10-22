import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createProviderTestGuard, createRequestBoundary, runProviderTestSession, createReservationBridge, productionModulePath } from '../tools/provider-test-guard.mjs';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
const nativeBoundary=await import('../tools/native-model-host-boundary.mjs').catch(()=>({}));
const model = 'fixture-plain';
const owned = [{role:'system',content:'Synthetic fixture only.'},{role:'user',content:'A synthetic blue lantern.'}];
const options = { live:true, host:'http://127.0.0.1:8000', priorAttempts:0, maxAttempts:3, approvedModels:[model], fixtureLabels:['bounded auxiliary request'] };
const request = {binding:{model},messages:owned,maxTokens:1024};
const response = {ok:true,data:{text:'Fixture answer',finish:'stop',usage:{prompt_tokens:20,completion_tokens:3}}};

test('native model check refuses an occupied port without connecting to the existing host',async()=>{
    assert.equal(typeof nativeBoundary.assertLoopbackPortFree,'function');
    let connections=0;const occupied=createServer(()=>connections++);
    await new Promise(resolve=>occupied.listen(0,'127.0.0.1',resolve));
    try{await assert.rejects(nativeBoundary.assertLoopbackPortFree(`http://127.0.0.1:${occupied.address().port}`),/occupied/i);assert.equal(connections,0);}
    finally{await new Promise(resolve=>occupied.close(resolve));}
});

test('native model check only allows required local lifecycle routes, never auxiliary provider or proxy APIs',()=>{
    assert.equal(typeof nativeBoundary.allowNativeLocalRequest,'function');
    const host='http://127.0.0.1:4293';
    for(const path of ['/api/vector/insert','/api/vector/query','/api/backends/chat-completions/generate','/api/unknown','/proxy/https://api.nanogpt.com/v1/chat/completions'])for(const method of ['GET','POST'])assert.equal(nativeBoundary.allowNativeLocalRequest({url:host+path,method},host),false,path);
    assert.equal(nativeBoundary.allowNativeLocalRequest({url:'https://api.nanogpt.com/v1/chat/completions',method:'POST'},host),false);
    assert.equal(nativeBoundary.allowNativeLocalRequest({url:host+'/api/chats/save',method:'POST'},host),true);
    assert.equal(nativeBoundary.allowNativeLocalRequest({url:host+'/api/chats/save?extra=true',method:'POST'},host),false);
    assert.equal(nativeBoundary.allowNativeLocalRequest({url:host+'/api/chats/save',method:'GET'},host),false);
    assert.equal(nativeBoundary.allowNativeLocalRequest({url:host+'/scripts/extensions/third-party/Lattice/index.js?v=0.28.0',method:'GET'},host),true);
    assert.equal(nativeBoundary.allowNativeLocalRequest({url:host+'/lib.js',method:'GET'},host),true);
    assert.equal(nativeBoundary.allowNativeLocalRequest({url:host+'/sounds/message.mp3',method:'GET'},host),true);
    assert.equal(nativeBoundary.allowNativeLocalRequest({url:host+'/locales/lang.json',method:'GET'},host),true);
});

test('native model startup requires its child listening announcement and rejects early exit',async()=>{
    assert.equal(typeof nativeBoundary.waitForOwnedNativeHost,'function');
    const child=spawn(process.execPath,['-e',"console.log('SillyTavern is listening on IPv4: 127.0.0.1:4293');setTimeout(()=>{},30000)"],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    try{await nativeBoundary.waitForOwnedNativeHost(child,'http://127.0.0.1:4293',2000);assert.equal(child.exitCode,null);}
    finally{child.kill();}
    const exited=spawn(process.execPath,['-e','process.exit(1)'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    await assert.rejects(nativeBoundary.waitForOwnedNativeHost(exited,'http://127.0.0.1:4293',2000),/exited/i);
});

test('native replay accepts legacy arrays and its own ledgers, rejecting absent or failed selected responses',()=>{
    assert.equal(typeof nativeBoundary.readReplayCompletion,'function');
    const complete={outcome:'complete',finish:'stop',output:'Synthetic captured reply.'};
    assert.equal(nativeBoundary.readReplayCompletion([complete],0).output,'Synthetic captured reply.');
    assert.equal(nativeBoundary.readReplayCompletion({attempts:[complete]},0).output,'Synthetic captured reply.');
    for(const [document,index]of [[[],0],[{attempts:[complete]},1],[[complete],-1],[[{...complete,outcome:'failed'}],0],[[{...complete,finish:'length'}],0]])assert.throws(()=>nativeBoundary.readReplayCompletion(document,index),/captured|replay/i);
});
function probe(config = options, reply = response) {
    let executions = 0;
    const guard = createProviderTestGuard(config);
    return {guard, executions:()=>executions, send:input=>guard.request(input, async()=>{ executions++; return reply; })};
}
// Removing the opt-in check would execute this paid boundary.
test('without explicit live opt-in no transport executes', async()=>{
    const p = probe({...options,live:false});
    await assert.rejects(p.send(request),/opt.in/i); assert.equal(p.executions(),0);
});
// An unchecked host would send credentials to a remote server.
test('only plain HTTP loopback hosts are accepted', ()=>{
    for (const host of ['https://example.com','http://127.0.0.1.evil:8000','http://localhost:8000','http://user:pass@127.0.0.1:8000']) assert.throws(()=>createProviderTestGuard({...options,host}),/loopback/i);
});
test('unapproved models and excessive completion caps fail before transport', async()=>{
    const p = probe();
    for (const input of [{...request,binding:{model:'z-ai/glm-5.1'}},{...request,maxTokens:4097},{...request,maxTokens:0},{...request,maxTokens:2.5}]) await assert.rejects(p.send(input),/model|cap/i);
    assert.equal(p.executions(),0);
});
test('the caller ledger and per-run bound refuse extra attempts', async()=>{
    assert.throws(()=>createProviderTestGuard({...options,priorAttempts:-1}),/prior/i);
    assert.throws(()=>createProviderTestGuard({...options,maxAttempts:6}),/attempt/i);
    const p = probe({...options,maxAttempts:1});
    assert.equal((await p.send(request)).ok,true);
    await assert.rejects(p.send(request),/attempt/i);
    assert.equal(p.executions(),1); assert.equal(p.guard.attempts(),1);
});
test('only one exact owned backend payload consumes a reservation', async()=>{
    const guard = createProviderTestGuard(options); let paid = 0;
    assert.equal(guard.authorize({model,max_tokens:1024,messages:owned,chat_completion_source:'nanogpt'}),false);
    await guard.request(request,async()=>{
        assert.equal(guard.authorize({model,max_tokens:1024,messages:[...owned,{role:'user',content:'Unexpected private input'}],chat_completion_source:'nanogpt'}),false);
        const payload = {model,max_tokens:1024,messages:owned,chat_completion_source:'nanogpt'};
        if (guard.authorize(payload)) paid++;
        if (guard.authorize(payload)) paid++;
        return response;
    });
    assert.equal(paid,1);
    assert.equal(guard.authorize({model,max_tokens:1024,messages:owned,chat_completion_source:'nanogpt'}),false);
});
test('provider rejection stops the session without retry', async()=>{
    const p = probe(options,{ok:false,error:{code:'REQUEST_FAILED',message:'Failure'}});
    assert.equal((await p.send(request)).ok,false);
    await assert.rejects(p.send(request),/stopped/i);
    assert.equal(p.executions(),1);
});
test('a thrown transport is counted and cannot be retried', async()=>{
    const guard=createProviderTestGuard(options); let paid=0;
    await assert.rejects(guard.request(request,async()=>{paid++;throw Error('failure');}),/failure/);
    await assert.rejects(guard.request(request,async()=>{paid++;return response;}),/stopped/i);
    assert.equal(paid,1); assert.equal(guard.attempts(),1);
});

test('reservation bridge refuses invalid and concurrent sends without replacing the owned payload', async()=>{
    const guard=createProviderTestGuard(options), bridge=createReservationBridge(guard);
    await assert.rejects(bridge.reserve({...request,binding:{model:'unapproved'}}),/model/i);
    await bridge.reserve(request);
    await assert.rejects(bridge.reserve(request),/attempt|active/i);
    assert.equal(guard.authorize({model,max_tokens:1024,messages:owned,chat_completion_source:'nanogpt'}),true);
    await bridge.finish(response);
    assert.equal(guard.attempts(),1);
});
test('dedicated module routing refuses arbitrary files and serves an actual production module', async()=>{
    const root=fileURLToPath(new URL('../',import.meta.url));
    const path=await productionModulePath(root,'http://127.0.0.1/__lattice-provider-test/src/workflow/runtime.js?v=0.19.1');
    assert.equal(path,fileURLToPath(new URL('../src/workflow/runtime.js',import.meta.url)));
    for (const url of ['http://127.0.0.1/__lattice-provider-test/.git/config','http://127.0.0.1/__lattice-provider-test/src/state.js','http://127.0.0.1/__lattice-provider-test/src/workflow/../../.aws/credentials']) await assert.rejects(productionModulePath(root,url),/module/i);
});
const backendUrl='http://127.0.0.1:8000/api/backends/chat-completions/generate';
const backendPayload={model,max_tokens:1024,messages:owned,chat_completion_source:'nanogpt'};
test('outbound boundary blocks actual host hyphenated generation and direct-provider endpoints before reservation',()=>{
    const boundary=createRequestBoundary(createProviderTestGuard(options),options.host);
    for (const url of [
        'http://127.0.0.1:8000/api/horde/generate-text',
        'http://127.0.0.1:8000/api/openai/generate-image',
        'http://127.0.0.1:8000/api/google/generate-video',
        'http://127.0.0.1:8000/api/novelai/generate-voice',
        'http://127.0.0.1:8000/api/google/generate-native-tts',
        'http://127.0.0.1:8000/api/unknown/charge',
        'http://127.0.0.1:8000/unapproved-generation',
        'https://api.nanogpt.com/v1/chat/completions',
        'https://api.openai.com/v1/responses',
        backendUrl,
    ]) assert.equal(boundary.allow({url,method:'POST',payload:backendPayload}),false,url);
    assert.equal(boundary.counts().backendAccepted,0);
});
test('outbound boundary admits only exact origin POST path and one active owned request',async()=>{
    const guard=createProviderTestGuard(options),boundary=createRequestBoundary(guard,options.host);
    await guard.request(request,async()=>{
        for (const attempt of [
            {url:backendUrl.replace(':8000',':8001'),method:'POST'},
            {url:backendUrl.replace('127.0.0.1','localhost'),method:'POST'},
            {url:backendUrl,method:'GET'},
            {url:backendUrl+'/extra',method:'POST'},
            {url:backendUrl+'?redirect=external',method:'POST'},
            {url:backendUrl.replace('chat-completions','text-completions'),method:'POST'},
        ]) assert.equal(boundary.allow({...attempt,payload:backendPayload}),false);
        assert.equal(boundary.allow({url:backendUrl,method:'POST',payload:backendPayload}),true);
        assert.equal(boundary.allow({url:backendUrl,method:'POST',payload:backendPayload}),false);
        return response;
    });
    assert.equal(boundary.counts().backendAccepted,1);
    assert.equal(guard.attempts(),1);
});
test('outbound boundary keeps only required local readiness and tokenizer APIs available',()=>{
    const boundary=createRequestBoundary(createProviderTestGuard(options),options.host);
    for (const [path,method] of [['/','GET'],['/script.js','GET'],['/scripts/text-completion.js','GET'],['/csrf-token','GET'],['/api/extensions/discover','GET'],['/api/settings/get','POST'],['/api/tokenizers/openai/encode','POST']]) assert.equal(boundary.allow({url:options.host+path,method}),true);
    for (const [path,method] of [['/api/settings/save','POST'],['/api/secrets/find','POST'],['/api/secrets/view','POST'],['/api/chats/get','POST'],['/api/tokenizers/remote/kobold/count','POST'],['/proxy/https://provider.example/generate','GET']]) assert.equal(boundary.allow({url:options.host+path,method}),false);
});

test('exception after one admitted attempt returns a sanitized ledger with unknown usage and no retry',async()=>{
    let executions=0;
    const report=await runProviderTestSession(options,{execute:async({guard,boundary,stage})=>{
        stage('evaluate');
        await guard.request(request,async()=>{
            executions++;
            assert.equal(boundary.allow({url:backendUrl,method:'POST',payload:backendPayload}),true);
            throw Error('private-cookie-and-provider-body');
        });
    }});
    assert.equal(report.status,'failed'); assert.equal(report.failureStage,'evaluate');
    assert.equal(report.priorAttempts,0); assert.equal(report.attempts,1); assert.equal(report.totalAttempts,1);
    assert.equal(report.backendAccepted,1); assert.equal(report.attemptLedger[0].usageStatus,'unknown');
    assert.equal(report.attemptLedger[0].usage,null); assert.equal(executions,1);
    assert.equal(JSON.stringify(report).includes('private-cookie-and-provider-body'),false);
});
test('cleanup failure preserves completed fixture progress and the paid ledger',async()=>{
    const fixture={label:'bounded auxiliary request',ok:true,actualCalls:1,callBound:2,constraints:{pinPreserved:true},recording:{status:'completed',rows:[],terminal:{kind:'guidance',format:'structured',text:'Synthetic guidance'}},review:{required:false,handle:null}};
    let cleanups=0;
    const report=await runProviderTestSession(options,{execute:async({guard,boundary,recordFixture})=>{
        await guard.request(request,async()=>{assert.equal(boundary.allow({url:backendUrl,method:'POST',payload:backendPayload}),true);return response;});
        recordFixture(fixture);
    },cleanup:async()=>{cleanups++;throw Error('private cleanup details');}});
    assert.equal(report.status,'failed'); assert.equal(report.failureStage,'cleanup');
    assert.equal(report.totalAttempts,1); assert.equal(report.backendAccepted,1);
    assert.equal(report.completedFixtures,1); assert.equal(report.fixtures[0].recording.terminal.text,'Synthetic guidance');
    assert.equal(report.attemptLedger[0].usageStatus,'reported');
    assert.equal(report.attemptLedger[0].usage.completion_tokens,3);
    assert.equal(cleanups,1); assert.equal(JSON.stringify(report).includes('private cleanup details'),false);
});
test('startup exceptions and missing live opt-in produce machine-readable zero-attempt reports',async()=>{
    for (const failureStage of ['manifest','browser','navigation']) {
        const report=await runProviderTestSession(options,{execute:async({stage})=>{stage(failureStage);throw Error('private startup details');}});
        assert.equal(report.status,'failed'); assert.equal(report.failureStage,failureStage);assert.equal(report.totalAttempts,0);assert.equal(report.attempts,0);
    }
    let starts=0;
    const disabled=await runProviderTestSession({...options,live:false},{execute:async()=>{starts++;}});
    assert.equal(disabled.status,'disabled');assert.equal(disabled.totalAttempts,0);assert.equal(starts,0);
});

test('browser loss with an unfinished admitted reservation conservatively retains the unknown attempt',async()=>{
    const report=await runProviderTestSession(options,{execute:async({guard,boundary,stage})=>{
        stage('evaluate');
        await createReservationBridge(guard).reserve(request);
        assert.equal(boundary.allow({url:backendUrl,method:'POST',payload:backendPayload}),true);
        throw Error('private browser disconnect details');
    }});
    assert.equal(report.attempts,1);assert.equal(report.totalAttempts,1);assert.equal(report.backendAccepted,1);
    assert.equal(report.attemptLedger[0].outcome,'reserved');assert.equal(report.unknownUsageAttempts,1);
    assert.equal(report.completedFixtures,0);assert.equal(JSON.stringify(report).includes('private browser disconnect details'),false);
});

test('local OpenAI tokenizer admits the actual host count and encode/decode model queries without a paid reservation',()=>{
    const guard=createProviderTestGuard(options),boundary=createRequestBoundary(guard,options.host);
    for (const path of [
        '/api/tokenizers/openai/count?model=gpt-4o',
        '/api/tokenizers/openai/count?model=z-ai%2Fglm-5.2%3Athinking',
        '/api/tokenizers/openai/encode?model=claude',
        '/api/tokenizers/openai/decode?model=gpt-3.5-turbo',
    ]) assert.equal(boundary.allow({url:options.host+path,method:'POST'}),true,path);
    assert.equal(boundary.counts().backendAccepted,0);assert.equal(guard.attempts(),0);
});
test('local tokenizer query permission excludes duplicate unknown unbounded and nonlocal requests',()=>{
    const boundary=createRequestBoundary(createProviderTestGuard(options),options.host);
    for (const path of [
        '/api/tokenizers/openai/count',
        '/api/tokenizers/openai/count?model=',
        '/api/tokenizers/openai/count?model=gpt-4o&model=claude',
        '/api/tokenizers/openai/count?model=gpt-4o&other=value',
        '/api/tokenizers/openai/count?other=gpt-4o',
        '/api/tokenizers/openai/count?model='+ 'x'.repeat(129),
        '/api/tokenizers/openai/count?model=gpt%0A4o',
        '/api/tokenizers/openai/encode?model=gpt-4o&redirect=https://provider.example',
        '/api/tokenizers/remote/kobold/count?model=gpt-4o',
        '/api/backends/chat-completions/generate?model=gpt-4o',
    ]) assert.equal(boundary.allow({url:options.host+path,method:'POST'}),false,path);
    assert.equal(boundary.allow({url:options.host+'/api/tokenizers/openai/count?model=gpt-4o',method:'GET'}),false);
    assert.equal(boundary.allow({url:'http://127.0.0.1:8001/api/tokenizers/openai/count?model=gpt-4o',method:'POST'}),false);
    assert.equal(boundary.allow({url:'https://provider.example/api/tokenizers/openai/count?model=gpt-4o',method:'POST'}),false);
});

test('approved models and fixture labels are explicit current session configuration',async()=>{
 const p=probe({...options,approvedModels:[]});await assert.rejects(p.send(request),/model/i);assert.equal(p.executions(),0);
 const report=await runProviderTestSession(options,{execute:async({recordFixture})=>recordFixture({label:'retired workflow',ok:true})});
 assert.equal(report.status,'failed');assert.equal(report.completedFixtures,0);
});
