/** Bounded native model check. Use only a disposable SillyTavern data/config fixture. */
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createProviderTestGuard,createReservationBridge} from './provider-test-guard.mjs';
import {assertLoopbackPortFree,waitForOwnedNativeHost,allowNativeLocalRequest,readReplayCompletion} from './native-model-host-boundary.mjs';

const {values}=parseArgs({options:{fixture:{type:'string'},output:{type:'string'},hostRoot:{type:'string'},case:{type:'string',default:'revision'},live:{type:'boolean',default:false},replay:{type:'string'},replayIndex:{type:'string',default:'0'},maxTokens:{type:'string',default:'2048'}}});
assert.ok(values.fixture&&values.output&&values.hostRoot,'Supply --fixture, --output and --hostRoot; the fixture must be disposable.');
assert.ok(values.live!==Boolean(values.replay),'Select exactly one of --live or --replay <captured ledger>.');
assert.ok(['revision','extract'].includes(values.case),'Select revision or extract.');
const fixture=resolve(values.fixture),output=resolve(values.output),hostRoot=resolve(values.hostRoot);
const url='http://127.0.0.1:4293',model='z-ai/glm-5.2:thinking',maxTokens=Number(values.maxTokens);
assert.ok(Number.isSafeInteger(maxTokens)&&maxTokens>0&&maxTokens<=4096,'Use a completion cap from 1 through 4096.');
const captured=values.replay?readReplayCompletion(JSON.parse(await readFile(resolve(values.replay),'utf8')),Number(values.replayIndex)):null;
await assertLoopbackPortFree(url);
await mkdir(output,{recursive:false});
const guard=createProviderTestGuard({live:values.live,host:url,maxAttempts:1,approvedModels:[model]}),bridge=createReservationBridge(guard);
let replayReservation=null,accepted=0,blocked=0,browser;
const snapshots=[],errors=[],blockedRequests=[];
const log=createWriteStream(join(output,'host.log'));
const server=spawn(process.execPath,['server.js','--configPath',join(fixture,'config.yaml'),'--dataRoot',join(fixture,'data'),'--port','4293','--listen','false','--browserLaunchEnabled','false'],{cwd:hostRoot,windowsHide:true,stdio:['ignore','pipe','pipe']});
server.stdout.pipe(log);server.stderr.pipe(log);
const saveLedger=()=>writeFile(join(output,'ledger.json'),JSON.stringify({completionCap:maxTokens,actualProviderCalls:guard.attempts(),replayedResponses:captured?accepted:0,attempts:guard.ledger()},null,2));
try{
 await waitForOwnedNativeHost(server,url);
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 server.once('exit',()=>context.close().catch(()=>{}));
 assert.equal(server.exitCode,null,'Owned native server exited.');
 await context.exposeFunction('modelCheckSnapshot',async snapshot=>{snapshots.push(snapshot);await writeFile(join(output,'native-state.json'),JSON.stringify(snapshots,null,2));});
 await context.exposeFunction('modelCheckReserve',async input=>{
   if(captured){assert.equal(replayReservation,null);assert.equal(input.binding.model,model);assert.equal(input.maxTokens,maxTokens);replayReservation={...input,used:false};}
   else{await bridge.reserve(input);await saveLedger();}return true;
 });
 await context.exposeFunction('modelCheckFinish',async result=>{if(!captured){await bridge.finish(result);await saveLedger();}return true;});
 await context.route('**/*',async route=>{
   const request=route.request(),target=new URL(request.url());
   if(server.exitCode!==null||server.signalCode!==null||target.origin!==url||target.username||target.password){blocked++;await route.abort();return;}
   if(target.pathname==='/api/backends/chat-completions/generate'){
     const payload=JSON.parse(request.postData()??'{}');
     const authorized=request.method()==='POST'&&!target.search&&(captured?replayReservation&&!replayReservation.used&&payload.chat_completion_source==='nanogpt'&&payload.model===model&&payload.max_tokens===maxTokens&&payload.stream!==true&&JSON.stringify(payload.messages)===JSON.stringify(replayReservation.messages):guard.authorize(payload));
     if(!authorized){blocked++;await route.abort();return;}
     accepted++;
     if(captured){replayReservation.used=true;await new Promise(resolve=>setTimeout(resolve,5500));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:captured.output},finish_reason:captured.finish}],usage:captured.usage})});}
     else{await saveLedger();const response=await route.fetch({timeout:180000,maxRetries:0,maxRedirects:0});await route.fulfill({response});}return;
   }
   if(!allowNativeLocalRequest({url:request.url(),method:request.method()},url)){blocked++;blockedRequests.push(request.method()+' '+target.pathname);await route.abort();return;}
   await route.continue();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.lattice?.open,{}, {timeout:90000});
 // Extension readiness precedes the host welcome screen. Finish native startup,
 // then explicitly load our own chat before capturing any preservation baseline.
 await page.waitForFunction(async()=>!(await import('/scripts/action-loader.js')).loader.isBlocking(),{}, {timeout:90000});
 const csrf=await(await context.request.get(url+'/csrf-token')).json();
 const chatId='lattice-model-check-'+randomUUID();
 const card={spec:'chara_card_v2',spec_version:'2.0',data:{name:'Lattice Model Check',description:'Disposable fictional model validation.',personality:'',scenario:'A fictional harbor.',first_mes:'Synthetic validation chat.',mes_example:'',creator_notes:'Disposable test fixture.',system_prompt:'',post_history_instructions:'',alternate_greetings:[],tags:[],creator:'Lattice test',character_version:'1'}};
 const imported=await context.request.post(url+'/api/characters/import',{headers:{'x-csrf-token':csrf.token},multipart:{file_type:'json',avatar:{name:'lattice-model-check.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(card))}}});assert.equal(imported.ok(),true);const avatar=(await imported.json()).file_name;
 await page.evaluate(async({avatar,chatId})=>{let c=window.SillyTavern.getContext();await c.getCharacters();const id=c.characters.findIndex(character=>character.avatar===avatar||character.avatar===avatar+'.png');if(id<0)throw Error('Owned character absent');await c.selectCharacterById(id);await window.SillyTavern.getContext().openCharacterChat(chatId);c=window.SillyTavern.getContext();c.chat.splice(0,c.chat.length,{name:'Lattice Model Check',mes:'Synthetic validation chat. Preserve this message exactly.',is_user:false,is_system:false,send_date:new Date().toISOString(),extra:{}});await c.saveChat();await c.reloadCurrentChat();},{avatar,chatId});
 await page.waitForFunction(chatId=>{const c=window.SillyTavern.getContext();return c.getCurrentChatId()===chatId&&c.chat.length===1&&c.chat[0].mes==='Synthetic validation chat. Preserve this message exactly.';},chatId);
 // Native prompt preview initializes timed World Info metadata asynchronously
 // after CHAT_CHANGED, including when no model or Lattice executor runs.
 await page.waitForFunction(chatId=>{const c=window.SillyTavern.getContext(),timed=c.chatMetadata.timedWorldInfo;return c.getCurrentChatId()===chatId&&timed&&typeof timed.sticky==='object'&&typeof timed.cooldown==='object';},chatId,{timeout:15000});
 const result=await page.evaluate(async({model,kind,maxTokens})=>{
   const base='/scripts/extensions/third-party/Lattice/';
   const [{executeModelNode},{resolveBinding,requestModel},{toFinalCandidate}]=await Promise.all([import(base+'src/workflow/operations/model-nodes.js?v=0.28.0'),import(base+'src/workflow/connections.js?v=0.28.0'),import(base+'src/workflow/draft-revisions.js?v=0.28.0')]);
   const context=()=>window.SillyTavern.getContext();
   const snapshot=()=>({chatId:context().getCurrentChatId(),chat:structuredClone(context().chat),metadata:structuredClone(context().chatMetadata)});
   const capture=async stage=>{const value=snapshot();await window.modelCheckSnapshot({stage,...value});return value;};
   const before=await capture('before');
   const binding=resolveBinding({profileId:'lattice:active-sillytavern',modelRole:'Prose'},{},context());if(!binding.ok||binding.data.model!==model||binding.data.source!=='nanogpt')throw Error('Unexpected active model binding.');
   await capture('after-binding');
   const request=async input=>{await capture('before-transport');await window.modelCheckReserve({binding:{model},maxTokens:input.maxTokens,messages:input.messages});const response=await requestModel({...input,binding:binding.data},context);await capture('after-transport');await window.modelCheckFinish(response);return response;};
   const source='Mira carries a brass key.',original='Mira slowly walked toward the blue harbor lantern.';
   const node=kind==='extract'?{id:'check-extract',operation:'extract',inputKind:'text',mode:'model',instructions:'Extract exactly one observation about the carried object. Quote only brass key as the evidence span, with exact UTF-16 offsets into the supplied source. Use id brass-key and label Key. Return the raw array only.',maxTokens}:{id:'check-revision',operation:'revise-draft',scope:'whole',protectedLiterals:['Mira','blue harbor lantern'],instructions:'Tighten the sentence by removing slowly and using a concise movement verb. Keep Mira approaching the blue harbor lantern. Return only the revised prose.',maxTokens};
   const inputs=kind==='extract'?{source:{kind:'text',text:source}}:{draft:{kind:'draft',text:original,source:{originalText:original,chatId:before.chatId,token:'owned-model-validation'}}};
   const checked=await executeModelNode(node,inputs,{phase:'post',binding:binding.data,request});await capture('after-executor');
   if(!checked.ok)throw Error(JSON.stringify(checked.error));
   if(kind==='extract'){const rows=checked.artifact.value.records;if(rows.length!==1||rows[0].status!=='proposed'||rows[0].evidence[0].start!==15||rows[0].evidence[0].end!==24||rows[0].evidence[0].quote!=='brass key')throw Error('Extraction evidence mismatch.');}
   else{const final=toFinalCandidate(checked.artifact);if(!final.ok||final.data.candidate.original!==original||checked.artifact.text===original||!checked.artifact.text.includes('Mira')||!checked.artifact.text.includes('blue harbor lantern'))throw Error('Revision authority/protection mismatch.');}
   const after=await capture('final');if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Native chat or metadata changed.');
   return{status:'PASS',case:kind,chatAndMetadataUnchanged:true,publicationApplied:false,artifact:checked.artifact,reports:checked.reports};
 },{model,kind:values.case,maxTokens});
 assert.equal(accepted,1);assert.equal(blocked,0);assert.deepEqual(errors,[]);
 await writeFile(join(output,'result.json'),JSON.stringify({...result,completionCap:maxTokens,actualProviderCalls:guard.attempts(),replayedResponses:captured?accepted:0},null,2));console.log(JSON.stringify({status:'PASS',case:values.case,chatAndMetadataUnchanged:true,completionCap:maxTokens,actualProviderCalls:guard.attempts(),replayedResponses:captured?accepted:0}));
}catch(error){await writeFile(join(output,'failure.json'),JSON.stringify({error:String(error),accepted,blocked,blockedRequests,errors},null,2));console.error(String(error));process.exitCode=1;}
finally{guard.stop();await saveLedger();await browser?.close();server.kill();await new Promise(resolve=>{server.once('exit',resolve);setTimeout(resolve,3000);});log.end();}
