import assert from 'node:assert/strict';
import test from 'node:test';
import { installMock } from './mock.js';
installMock();
const { createWorkflowSession, prepareWorkflowProjection, projectPreparedWorkflow }=await import('../src/ui/workflow-surface.js');
const { fixtureGraph:starterGraph }=await import('./helpers/workflow-fixtures.mjs');
const {reviewGraph}=await import('./helpers/native-workflow-fixture.mjs');
const targetOf=root=>({workflowId:root.id,instancePath:[],nodeId:'compose-guidance',portId:'out'});
const automatic=(root,result)=>({origin:{graph:root,graphId:root.id,signature:workflowSignature(root),kind:'send',phase:'unified',runId:result.runId},result});
const { resolveWorkflow }=await import('../src/workflow/resolve.js');
const { parseRunPlan,freeze }=await import('../src/workflow/record-data.js');
const { createRunRecorder }=await import('../src/workflow/recording.js');
const { workflowSignature }=await import('../src/workflow/runtime.js');
function runRecord(root,runId,status='completed') {
    const plan=parseRunPlan(resolveWorkflow(root).data),recorder=createRunRecorder({runId});recorder.accept({runId,seq:1,at:1,elapsedMs:0,type:'plan',plan});
    if(status==='cancelled')recorder.accept({runId,seq:2,at:2,elapsedMs:1,type:'run-cancelling'});
    recorder.accept({runId,seq:status==='cancelled'?3:2,at:3,elapsedMs:2,type:'run-settled',status});return recorder.finish();
}
const response=(recording,ok=true)=>freeze({schema:3,runtime:2,mode:'root',runId:recording.runId,ok,callBound:recording.plan.callBound,actualCalls:0,recording,reviewHandles:[],...(!ok?{error:{code:'ABORTED',message:'Stopped'}}:{})});

test('session-adopted run failures retain only the safe node location for diagnostic navigation', () => {
    const root = starterGraph('structured-guidance'), recording = runRecord(root, 'addressed-failure');
    const address = { workflowId: root.id, instancePath: [], nodeId: 'compose-guidance' };
    const session = createWorkflowSession({ runtime: () => ({}), current: () => root, epoch: () => 1, active: () => true, changed() {} });
    session.receiveAutomatic(automatic(root, { ...response(recording, false), error: { code: 'REQUEST_FAILED', message: 'The provider request failed.', address, privateHandle: 'private-capability' } }));
    assert.deepEqual(session.result().error.address, address);
    const view = projectPreparedWorkflow(prepareWorkflowProjection(root, { result: session.result() }));
    assert.deepEqual(view.result.errorDiagnostic.address, address);
    assert.equal(JSON.stringify(session.result()).includes('private-capability'), false);
});
test('session preserves the exact prior recording during preparation and keeps a new record-free error separate',async()=>{
    const root=starterGraph('structured-guidance'),recording=runRecord(root,'first');let finish,state;
    const runtime={runTarget:()=>new Promise(resolve=>finish=resolve),cancel(){}};
    const session=createWorkflowSession({runtime:()=>runtime,current:()=>root,epoch:()=>1,active:()=>true,changed:value=>state=value});
    const first=session.run({target:targetOf(root)});finish(response(recording));await first;assert.equal(state.recording,recording);assert.equal(session.result().recording,recording);
    const second=session.run({target:targetOf(root)});assert.equal(state.recording,recording);finish({ok:false,error:{code:'RUN_ID_REQUIRED',message:'Preparation failed'}});await second;
    assert.equal(state.recording,recording);assert.equal(state.preparationError.message,'Preparation failed');assert.equal(session.result().runId,'first');assert.equal(state.reviewHandles.length,0);
});
test('automatic Send then manual targets and record-free failures retain one exact diagnostic owner',async()=>{
    const root=starterGraph('structured-guidance'),sent=runRecord(root,'send'),manual=runRecord(root,'manual'),targetRecord=runRecord(root,'target');let state,finish,target;
    const runtime={cancel(){},runTarget:(_root,choice)=>{target=choice;return new Promise(resolve=>finish=resolve);}};
    const session=createWorkflowSession({runtime:()=>runtime,current:()=>root,epoch:()=>1,active:()=>true,changed:value=>state=value});
    session.receiveAutomatic({origin:{graph:root,graphId:root.id,signature:workflowSignature(root),kind:'send',phase:'unified',runId:'send'},result:response(sent)});
    assert.equal(state.recording,sent);assert.equal(session.result().recording,sent);assert.match(state.status,/Automatic Send/);assert.equal(Object.isFrozen(root),false);
    let pending=session.run({target:targetOf(root)});assert.equal(state.recording,sent);finish(response(manual));await pending;assert.equal(state.recording,manual);assert.equal(session.result().recording,manual);
    const choice={workflowId:root.id,instancePath:[],nodeId:'compose-guidance',portId:'out'};pending=session.run({target:choice});assert.equal(state.recording,manual);assert.equal(target,choice);finish({...response(targetRecord),mode:'target'});await pending;
    assert.equal(state.recording,targetRecord);assert.equal(session.result().recording,targetRecord);assert.deepEqual(state.reviewHandles,[]);
    pending=session.run({target:targetOf(root)});finish({schema:3,runtime:2,mode:'root',ok:false,error:{code:'INVALID_RUN_CLOCK',message:'New clock failure'},actualCalls:0,callBound:0});await pending;
    assert.equal(state.recording,targetRecord);assert.equal(state.result.runId,'target');assert.equal(state.result.recording.status,'completed');assert.equal(state.preparationError.message,'New clock failure');assert.equal(state.result.error,undefined);
    assert.equal(new Set([state.recording,state.result.recording]).size,1);
});
test('safe progress never reads current graph controls and invalidation rejects late ok after Stop or root replacement',async()=>{
    const root=starterGraph('structured-guidance'),plan=parseRunPlan(resolveWorkflow(root).data);let options,finish,state,current=root,epoch=1;
    const runtime={cancel(){},runTarget:(_root,_target,opts)=>{options=opts;return new Promise(resolve=>finish=resolve);}};
    const session=createWorkflowSession({runtime:()=>runtime,current:()=>current,epoch:()=>epoch,active:()=>true,changed:value=>state=value});
    let pending=session.run({target:targetOf(root)});options.onEvent({runId:'guarded',seq:1,at:1,elapsedMs:0,type:'plan',plan});
    const node=Object.values(root.nodes).find(node=>node.operation==='compose'),saved=node.template;let reads=0;Object.defineProperty(node,'template',{get(){reads++;throw new Error('event signature read');},configurable:true});
    options.onEvent({runId:'guarded',seq:2,at:2,elapsedMs:1,type:'node-phase',address:plan.units[0].address,phase:'executing'});assert.equal(reads,0);assert.equal(state.runState.lastSeq,2);
    Object.defineProperty(node,'template',{value:saved,writable:true,enumerable:true,configurable:true});
    session.cancel('Stop');epoch++;finish(response(runRecord(root,'guarded')));await pending;assert.equal(state.recording,null);assert.deepEqual(state.reviewHandles,[]);
    pending=session.run({target:targetOf(root)});options.onEvent({runId:'replaced',seq:1,at:1,elapsedMs:0,type:'plan',plan});current={...root};session.invalidate('Root replaced');current=root;finish(response(runRecord(root,'replaced','cancelled'),false));await pending;
    assert.equal(state.recording,null);assert.equal(state.busy,false);
});
test('progress has one explicit runId and root ownership survives view changes but rejects newer-run completions',async()=>{
    const root=starterGraph('structured-guidance'),plan=parseRunPlan(resolveWorkflow(root).data),pending=[];let viewEpoch=1,state,rootEpoch=1;
    const runtime={runTarget:(_graph,_target,options)=>new Promise(resolve=>pending.push({resolve,options})),cancel(){}};
    const session=createWorkflowSession({runtime:()=>runtime,current:()=>root,epoch:()=>rootEpoch,active:()=>true,changed:value=>state=value});
    const first=session.run({target:targetOf(root)});pending[0].options.onEvent(freeze({runId:'one',seq:1,at:1,elapsedMs:0,type:'plan',plan}));viewEpoch++;assert.equal(viewEpoch,2);assert.equal(state.runState.runId,'one');
    const observed=state.runState;pending[0].options.onEvent({runId:'foreign',seq:2,at:2,elapsedMs:1,type:'node-phase',address:plan.units[0].address,phase:'executing'});assert.equal(state.runState,observed);
    const second=session.run({target:targetOf(root)});pending[0].resolve(response(runRecord(root,'one')));await first;assert.notEqual(session.result()?.runId,'one');pending[1].resolve(response(runRecord(root,'two')));await second;assert.equal(session.result().runId,'two');
    const obsolete=session.run({target:targetOf(root)});rootEpoch++;pending[2].resolve(response(runRecord(root,'three')));await obsolete;assert.equal(session.result().runId,'two');
});
test('Stop retains diagnostics and accepts only its matching late cancelled record without handles',async()=>{
    const root=starterGraph('structured-guidance'),plan=parseRunPlan(resolveWorkflow(root).data);let finish,options,state,epoch=1;
    const runtime={runTarget:(_root,_target,opts)=>{options=opts;return new Promise(resolve=>finish=resolve);},cancel(){options.onEvent(freeze({runId:'stopped',seq:2,at:2,elapsedMs:1,type:'run-cancelling'}));assert.equal(state.runState.status,'cancelling','barrier is visible before the host epoch changes');epoch++;}};
    const session=createWorkflowSession({runtime:()=>runtime,current:()=>root,epoch:()=>epoch,active:()=>true,changed:value=>state=value});
    const pending=session.run({target:targetOf(root)});options.onEvent(freeze({runId:'stopped',seq:1,at:1,elapsedMs:0,type:'plan',plan}));session.cancel('Stopped');
    assert.equal(state.runState.status,'cancelling');finish(response(runRecord(root,'stopped','cancelled'),false));await pending;assert.equal(state.recording.runId,'stopped');assert.equal(state.recording.status,'cancelled');assert.equal(state.reviewHandles.length,0);
});
test('only the matching cancelled settlement event can close progress after the Stop epoch barrier',async()=>{
    const root=starterGraph('structured-guidance'),plan=parseRunPlan(resolveWorkflow(root).data);let state,options,finish,epoch=1;
    const runtime={runTarget:(_root,_target,opts)=>{options=opts;return new Promise(resolve=>finish=resolve);},cancel(){options.onEvent({runId:'closed',seq:2,at:2,elapsedMs:1,type:'run-cancelling'});epoch++;}};
    const session=createWorkflowSession({runtime:()=>runtime,current:()=>root,epoch:()=>epoch,active:()=>true,changed:value=>state=value});const pending=session.run({target:targetOf(root)});options.onEvent({runId:'closed',seq:1,at:1,elapsedMs:0,type:'plan',plan});session.cancel();
    options.onEvent({runId:'closed',seq:3,at:3,elapsedMs:2,type:'run-settled',status:'completed'});assert.equal(state.runState.status,'cancelling');
    options.onEvent({runId:'closed',seq:3,at:3,elapsedMs:2,type:'run-settled',status:'cancelled'});assert.equal(state.runState.status,'cancelled');
    finish(response(runRecord(root,'closed','cancelled'),false));await pending;assert.equal(state.recording.runId,'closed');assert.equal(state.reviewHandles.length,0);
});
test('schema3 Apply forwards the explicit frozen root handle and retains its recording after application',async()=>{
    const root=reviewGraph({second:true});
    const recording=runRecord(root,'apply'),plan=resolveWorkflow(root).data,handles=plan.terminals.map((terminal,index)=>freeze({handleId:'handle-'+index,runId:'apply',terminal}));let applied,checks=0,state;
    const runtime={cancel(){},runTarget:async()=>({...response(recording),reviewHandles:handles}),candidateStatus:()=>{checks++;return {ok:true};},apply:async selector=>{applied=selector;return {ok:true};}};
    const session=createWorkflowSession({runtime:()=>runtime,current:()=>root,epoch:()=>1,active:()=>true,changed:value=>state=value});session.receiveAutomatic(automatic(root,{...response(recording),reviewHandles:handles}));
    await session.apply();assert.equal(applied,undefined);await session.apply({...handles[0],terminal:handles[1].terminal});assert.equal(applied,undefined);assert.equal(checks,0);
    await session.apply(handles[1]);assert.deepEqual(applied,handles[1]);assert.equal(Object.isFrozen(applied),true);assert.equal(checks,1);assert.equal(state.recording,recording);assert.equal(state.result.recording,recording);assert.equal(state.reviewHandles.length,0);assert.equal(state.availability,'stale');
});
test('same schema3 Send replay stays unavailable after Stop or invalidation while a fresh Send replaces it',()=>{
    const root=starterGraph('structured-guidance');let state,current=root;
    const session=createWorkflowSession({runtime:()=>({cancel(){}}),current:()=>current,epoch:()=>1,active:()=>true,changed:value=>state=value});
    const automatic=id=>({origin:{graph:root,graphId:root.id,signature:workflowSignature(root),kind:'send',phase:'unified',runId:id},result:response(runRecord(root,id))});
    const sent=automatic('send');session.receiveAutomatic(sent);assert.equal(state.recording,sent.result.recording);session.cancel();assert.equal(state.availability,'stale');
    session.receiveAutomatic(sent);assert.equal(state.availability,'stale');assert.equal(state.recording,sent.result.recording);
    session.receiveAutomatic({...sent,result:{...sent.result}});assert.equal(state.availability,'stale','same run in a new notification wrapper remains unavailable');
    const fresh=automatic('fresh');current={...root};session.receiveAutomatic(fresh);assert.equal(state.recording,sent.result.recording,'same ID on another root object cannot adopt Send');current=root;session.receiveAutomatic(fresh);assert.equal(state.availability,'current');assert.equal(state.recording,fresh.result.recording);
    session.invalidate('Semantic invalidation');session.receiveAutomatic({...fresh,result:{...fresh.result}});assert.equal(state.availability,'stale');assert.equal(state.recording,fresh.result.recording);
    const next=automatic('next');session.receiveAutomatic(next);assert.equal(state.availability,'current');assert.equal(state.recording,next.result.recording);
});

function settlementSession(initial, retry) {
    const root=reviewGraph({revise:false}),recording=runRecord(root,'settlement'),terminal=resolveWorkflow(root).data.terminals[0],handle=freeze({handleId:'retained',runId:'settlement',terminal});
    let state,calls=0,retries=0,rejected=[];
    const runtime={runTarget:async()=>({...response(recording),reviewHandles:[handle]}),candidateStatus:()=>({ok:true,...(calls?{persistOnly:true,status:'partial'}:{})}),cancel(){},apply:async()=>{calls++;return {ok:true,appliedLocally:true,settlement:initial};},retryPersistence:async()=>{retries++;return {ok:true,appliedLocally:true,settlement:retry};},reject:selector=>{rejected.push(selector);return {ok:true};}};
    const session=createWorkflowSession({runtime:()=>runtime,current:()=>root,epoch:()=>1,active:()=>true,changed:value=>state=value});
    return {session,root,handle,runtime,start:(extra={})=>session.receiveAutomatic(automatic(root,{...response(recording),reviewHandles:[handle],...extra})),state:()=>state,calls:()=>calls,retries:()=>retries,rejected};
}

test('stale review freshness retains a plain remedy and technical support code', async () => {
    const f = settlementSession(settledReceipt('partial'));
    await f.start();
    f.runtime.candidateStatus = () => ({ ok: false, error: { code: 'STALE_SOURCE', message: 'The live source signature changed.' } });
    f.session.refreshFreshness(f.handle);
    assert.match(f.state().applyIssue, /changed|out of date/i);
    assert.equal(f.state().applyDiagnostic.technical.code, 'STALE_SOURCE');
    assert.equal(f.calls(), 0);
});

test('an interrupted failed-save retry preserves the accepted reply and does not offer blind retry', async () => {
    const f = settlementSession(settledReceipt('partial'));
    await f.start(); await f.session.apply(f.handle);
    f.runtime.retryPersistence = async () => { throw Error('private backend material'); };
    await f.session.apply(f.handle);
    assert.match(f.state().status, /accepted reply remains.*could not be confirmed/i);
    assert.doesNotMatch(f.state().status, /restored|private backend|retry failed/i);
    assert.equal(f.state().reviewHandles.length, 0);
    assert.equal(f.state().applyDiagnostic.severity, 'warning');
});
const settledReceipt=(status)=>({status,published:true,publication:{appliedLocally:true},receipts:[{intentId:'event',targetId:'file:souls',status:status==='partial'?'failed':status==='save-unverified'?'save-unverified':'confirmed',...(status==='partial'?{error:{code:'WRITE_FAILED',message:'Retry this target.'}}:{})}]});
test('automatically accepted effects retain applied UI state while describing the unchanged reply', () => {
    const f=settlementSession();f.root.nodes.review.autoApplyEffects=true;
    f.start({automaticallyApplied:true,effectsOnlyApplied:true,appliedLocally:true,settlement:settledReceipt('settled')});
    assert.equal(f.state().result.effectsOnlyApplied,true);
    assert.equal(f.state().result.automaticallyApplied,true);assert.equal(f.state().result.appliedLocally,true);
    assert.equal(f.state().reviewHandles.length,0);assert.equal(f.state().availability,'stale');
    assert.match(f.state().status,/Workflow data saved.*native reply unchanged/i);
    assert.doesNotMatch(f.state().status,/unconfirmed|new swipe/i);
    f.session.reject();assert.deepEqual(f.rejected,[]);
});

test('an automatically applied reply without effects retains accepted state and cannot be rejected as a proposal', () => {
    const f=settlementSession();
    f.start({automaticallyApplied:true,appliedLocally:true});
    const adopted=f.state();
    f.session.reject();
    assert.match(f.state().status,/accepted reply remains/i);
    assert.doesNotMatch(f.state().status,/rejected|Original reply preserved/i);
    assert.deepEqual(f.rejected,[],'An already accepted reply has no remaining rejection authority');
    assert.equal(adopted.result.automaticallyApplied,true);
    assert.equal(adopted.result.appliedLocally,true);
    assert.equal(adopted.reviewHandles.length,0);
    assert.equal(adopted.availability,'stale');
    assert.match(adopted.status,/Revised reply applied as a new swipe/i);
});

test('automatically applied partial consequences retain only failed-save recovery', async () => {
    const initial=settledReceipt('partial'),f=settlementSession(initial,settledReceipt('settled'));
    f.runtime.candidateStatus=()=>({ok:true,persistOnly:true,status:'partial'});
    f.start({automaticallyApplied:true,appliedLocally:true,settlement:initial});
    assert.equal(f.state().availability,'current');
    assert.equal(f.state().reviewHandles.length,1);
    assert.match(f.state().status,/Reply accepted.*Retry failed saves/i);
    await f.session.apply(f.handle);
    assert.equal(f.calls(),0,'Recovery must not republish the reply');
    assert.equal(f.retries(),1);
    assert.equal(f.state().reviewHandles.length,0);
    assert.equal(f.state().result.settlement.status,'settled');
    assert.equal(f.state().result.automaticallyApplied,true);
    assert.equal(f.state().result.appliedLocally,true);
});

test('an unchanged automatic Send keeps its proposed effects available for manual review', () => {
    const f=settlementSession();f.root.nodes.review.autoApply=true;
    f.start();
    assert.equal(f.state().availability,'current');
    assert.deepEqual(f.state().reviewHandles,[f.handle]);
    assert.match(f.state().status,/Review the result/i);
    f.session.reject();
    assert.deepEqual(f.rejected,[f.handle]);
    assert.match(f.state().status,/Original reply preserved/i);
});

test('partial accepted consequence review retains its handle and retries only persistence',async()=>{
    const f=settlementSession(settledReceipt('partial'),settledReceipt('settled'));await f.start();await f.session.apply(f.handle);
    assert.equal(f.state().availability,'current');assert.equal(f.state().reviewHandles.length,1);assert.equal(f.state().result.settlement.status,'partial');assert.match(f.state().status,/could not be saved.*Retry failed saves/i);
    await f.session.apply(f.handle);assert.equal(f.calls(),1);assert.equal(f.retries(),1);assert.equal(f.state().reviewHandles.length,0);assert.equal(f.state().result.settlement.status,'settled');assert.match(f.state().status,/workflow data saved.*reply.*unconfirmed/i);
});
test('unverified accepted consequence saves are shown and do not expose retry authority',async()=>{
    const f=settlementSession({...settledReceipt('save-unverified'),publication:{appliedLocally:true,secret:'private material'},receipts:[{intentId:'event',targetId:'file:souls',status:'unknown',proposed:{secret:'private material'},handle:{secret:'capability'}}]});await f.start();await f.session.apply(f.handle);
    assert.equal(f.state().reviewHandles.length,0);assert.equal(f.state().result.settlement.status,'save-unverified');assert.equal(f.state().result.settlement.receipts[0].status,'unknown');assert.match(f.state().status,/unconfirmed.*Check.*before writing/i);assert.equal(JSON.stringify(f.state().result).includes('private material'),false);assert.equal(JSON.stringify(f.state().result).includes('capability'),false);
});
test('reject explicitly releases retained host consequence handles before clearing the review',async()=>{
    const f=settlementSession(settledReceipt('partial'));await f.start();f.session.reject();assert.deepEqual(f.rejected,[f.handle]);assert.equal(f.state().reviewHandles.length,0);assert.match(f.state().status,/Original reply preserved/);
});
test('reject after partial publication accurately preserves the already accepted reply',async()=>{
    const f=settlementSession(settledReceipt('partial'));await f.start();await f.session.apply(f.handle);f.session.reject();assert.deepEqual(f.rejected,[f.handle]);assert.match(f.state().status,/accepted reply remains/i);assert.equal(f.state().status.includes('Original reply preserved'),false);
});

test('document activation expires identical-root diagnostics and accepts only the new activation Send',()=>{
    const root=starterGraph('structured-guidance');let owner={},opened=true,state;
    const session=createWorkflowSession({runtime:()=>({cancel(){}}),current:()=>root,epoch:()=>1,documentToken:()=>owner,active:()=>opened,changed:value=>state=value});
    const sent=automatic(root,response(runRecord(root,'old-document')));sent.origin.documentToken=owner;
    session.receiveAutomatic(sent);session.cancel();assert.equal(state.recording,sent.result.recording,'Close retains same-document diagnostics');
    opened=false;owner={};session.syncDocument();assert.equal(state.recording,null);assert.equal(session.result(),null);
    opened=true;session.receiveAutomatic({...sent,result:{...sent.result}});assert.equal(state.recording,null,'Identical graph and signature cannot replay a different activation');
    session.receiveAutomatic(automatic(root,response(runRecord(root,'missing-owner'))));assert.equal(state.recording,null,'Document-owned sessions require exact Send ownership');
    const fresh=automatic(root,response(runRecord(root,'fresh-document')));fresh.origin.documentToken=owner;
    opened=false;session.receiveAutomatic(fresh);assert.equal(state.recording,null);opened=true;session.receiveAutomatic(fresh);
    assert.equal(state.recording,fresh.result.recording);assert.equal(state.availability,'current','A new activation Send completed while closed is adopted on reopen');
});

test('document token replacement rejects a late target result even before UI synchronization',async()=>{
    const root=starterGraph('structured-guidance');let owner={},state,finish;
    const session=createWorkflowSession({runtime:()=>({cancel(){},runTarget:()=>new Promise(resolve=>finish=resolve)}),current:()=>root,epoch:()=>1,documentToken:()=>owner,active:()=>true,changed:value=>state=value});
    const pending=session.run({target:targetOf(root)});owner={};finish(response(runRecord(root,'late-document')));await pending;
    assert.equal(state.recording,null);session.syncDocument();assert.equal(state.busy,false);
});


test('recovered sessions retain bounded safe failures and announce partial completion after automatic application', () => {
    const root = starterGraph('structured-guidance'), recording = runRecord(root, 'partial-recovered');
    const address = {workflowId:root.id,instancePath:[],nodeId:'compose-guidance'};
    let state;
    const session = createWorkflowSession({runtime:()=>({}),current:()=>root,epoch:()=>1,active:()=>true,changed:value=>state=value});
    const failures = Array.from({length:40}, () => ({code:'REQUEST_FAILED',message:'The request failed.',address,privateHandle:'PRIVATE_CAPABILITY'}));
    session.receiveAutomatic(automatic(root,{...response(recording),recovered:true,failures,failurePolicy:'continue-available',failureDisposition:'continued',automaticallyApplied:true,appliedLocally:true}));
    assert.equal(session.result().recovered,true);
    assert.equal(session.result().failurePolicy,'continue-available');
    assert.equal(session.result().failureDisposition,'continued');
    assert.equal(session.result().failures.length,32);
    assert.deepEqual(session.result().failures[0].address,address);
    assert.equal(JSON.stringify(session.result()).includes('PRIVATE_CAPABILITY'),false);
    assert.match(state.status,/Completed with failures/);
    const view = projectPreparedWorkflow(prepareWorkflowProjection(root,{result:session.result()}));
    assert.equal(view.result.recovered,true);
    assert.equal(view.result.failurePolicy,'continue-available');
    assert.equal(view.result.failureDisposition,'continued');
    assert.equal(view.result.failures.length,32);
    assert.match(view.result.outcomeNotice,/Completed with failures/);
});
