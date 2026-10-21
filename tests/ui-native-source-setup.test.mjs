import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../src/ui/native-source-setup.js').catch(()=>({}));
const fixture=()=>{let document={},chat='practice-a',revision=null,status='setup-required',calls=[],pending;const controller={inspectSources:()=>({ok:true,data:{scope:{userId:'user',chatId:chat,branchId:'main'},revision,status,activeSources:26,retainedSources:26}})};
 for(const method of ['setupSources','verifySources','reconcileSources'])controller[method]=async controls=>{calls.push({method,signal:controls.signal});if(pending)await pending;revision='saved';status='acknowledged';return {ok:true,data:{acknowledged:true}};};
 return {controller,calls,get document(){return document;},switchDocument(){document={};},switchChat(){chat='practice-b';},hold(value){pending=value;},create:()=>module.createNativeSourceSetup({controller:()=>controller,documentToken:()=>document})};};
test('source setup display is inert and only its explicit current command saves or verifies',async()=>{
 assert.equal(typeof module.createNativeSourceSetup,'function');const f=fixture(),setup=f.create(),view=setup.snapshot();assert.equal(view.status,'setup-required');assert.equal(f.calls.length,0);assert.equal((await setup.execute(view.key,'setup')).ok,true);assert.equal(f.calls[0].method,'setupSources');assert.equal(setup.snapshot().status,'acknowledged');
});
test('old source setup controls cannot enroll a new chat or replacement document',async()=>{
 assert.equal(typeof module.createNativeSourceSetup,'function');for(const change of ['switchChat','switchDocument']){const f=fixture(),setup=f.create(),view=setup.snapshot();f[change]();const result=await setup.execute(view.key,'setup');assert.equal(result.ok,false);assert.equal(result.error.code,'STALE_SOURCE_SETUP');assert.equal(f.calls.length,0);}
});
test('source setup cancellation aborts the native action and refuses stale async delivery',async()=>{
 assert.equal(typeof module.createNativeSourceSetup,'function');const f=fixture();let release;f.hold(new Promise(resolve=>release=resolve));const setup=f.create(),view=setup.snapshot(),pending=setup.execute(view.key,'setup');assert.equal(f.calls.length,1);setup.cancel();assert.equal(f.calls[0].signal.aborted,true);release();assert.equal((await pending).ok,false);
});

test('source setup status never carries a verified notice into another chat',async()=>{
 const f=fixture(),setup=f.create(),view=setup.snapshot();await setup.execute(view.key,'setup');assert.match(setup.snapshot().notice,/verified/);f.switchChat();assert.equal(setup.snapshot().notice,'');
});
