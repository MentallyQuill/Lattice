import assert from 'node:assert/strict';
import test from 'node:test';
import { createDraftRevision, appendDraftSections } from '../src/workflow/draft-revisions.js?v=0.27.2';
const settlement = await import('../src/workflow/native-settlement.js?v=0.27.2').catch(() => ({}));
const original = { kind: 'draft', text: 'The sword killed Orr.', source: { originalText: 'The sword killed Orr.', token: 'owned-source' } };
function fixture() {
    const calls = [], released = [];
    let current = true;
    assert.equal(typeof settlement.createAcceptedNativeSettlement, 'function');
    const bundle = settlement.createAcceptedNativeSettlement({ scope: { userId: 'default-user', chatId: 'story' }, originalDraft: original, isCurrent: () => current, validateFinal: async ({ body }) => { calls.push(['validate', body]); return body.includes('killed Orr') ? { ok: true } : { ok: false, error: { code: 'FINAL_EVIDENCE_REEXTRACT_REQUIRED', message: 'Changed narrative requires new evidence.' } }; }, publish: async draft => { calls.push(['publish', draft.text]); return { ok: true, data: { appliedLocally: true, swipeId: 1, persistence: 'unverified' } }; }, release: () => released.push(true) });
    return { bundle, calls, released, stale: () => { current = false; } };
}

test('accepted settlement validates narrative body, preflights all targets and publishes only once before persistence recovery', async () => {
    const f = fixture(); let failSecond = true;
    for (const target of ['souls', 'moments']) assert.equal(f.bundle.stage({ intentId: target + '-intent', targetId: target, proposed: { type: 'file', targetId: target }, preflight: async () => { f.calls.push(['preflight', target]); return { ok: true, data: { status: 'ready' } }; }, commit: async () => { f.calls.push(['commit', target]); return target === 'moments' && failSecond ? { ok: false, error: { code: 'FILE_WRITE_FAILED', message: 'Retry persistence.' } } : { ok: true, data: { status: 'confirmed', applied: true, acknowledged: true } }; } }).ok, true);
    const revised = createDraftRevision(original, original.text + ' Ash fell.', { nodeId: 'prose', scope: 'whole' }).data.draft;
    const final = appendDraftSections(revised, [{ id: 'notes', text: '<details>The sword killed someone else.</details>' }], { nodeId: 'notes' }).data.draft;
    const first = await f.bundle.accept(final); assert.equal(first.ok, true); assert.equal(first.data.status, 'partial');
    assert.equal(f.calls.find(call => call[0] === 'validate')[1], revised.text);
    assert.deepEqual(f.calls.filter(call => call[0] !== 'validate').map(call => call[0]), ['preflight', 'preflight', 'publish', 'commit', 'commit']);
    failSecond = false; const retry = await f.bundle.accept(final); assert.equal(retry.ok, true); assert.equal(retry.data.status, 'settled');
    assert.equal(f.calls.filter(call => call[0] === 'publish').length, 1); assert.equal(f.calls.filter(call => call[0] === 'commit' && call[1] === 'souls').length, 1);
});

test('notes cannot restore removed canonical evidence and forged final lineage cannot publish', async () => {
    const f = fixture();
    const revised = createDraftRevision(original, 'The sword spared Orr.', { nodeId: 'prose', scope: 'whole' }).data.draft;
    const final = appendDraftSections(revised, [{ id: 'notes', text: original.text }], { nodeId: 'notes' }).data.draft;
    assert.equal((await f.bundle.accept(final)).error.code, 'FINAL_EVIDENCE_REEXTRACT_REQUIRED');
    assert.equal((await f.bundle.accept({ ...final })).ok, false); assert.equal(f.calls.some(call => call[0] === 'publish'), false);
    f.bundle.reject(); assert.equal(f.released.length, 1); assert.equal((await f.bundle.accept(final)).ok, false);
});

test('failed preflight keeps native text unpublished; stale/cancelled settlement releases retained authority', async () => {
    const f = fixture();
    f.bundle.stage({ intentId: 'soul', targetId: 'souls', proposed: {}, preflight: async () => ({ ok: false, error: { code: 'FILE_REVISION_CONFLICT', message: 'Projection changed.' } }), commit: async () => { throw new Error('Must not commit'); } });
    assert.equal((await f.bundle.accept(original)).error.code, 'FILE_REVISION_CONFLICT'); assert.equal(f.calls.some(call => call[0] === 'publish'), false);
    f.stale(); assert.equal((await f.bundle.accept(original)).ok, false); f.bundle.release(); assert.equal(f.released.length, 1);
});
test('canonical file occurrence evidence must be confirmed and preserved in final story body',async()=>{
    const {normalizeOccurrences,confirmOccurrences}=await import('../src/workflow/operations/event-data.js?v=0.27.2');
    const candidates=normalizeOccurrences({sourceId:'native',revision:'r1',sceneId:'story',watch:'draft',text:original.text,visibility:'public'},[{eventType:'scene-action',actorId:'mara',position:{start:0,end:original.text.length},semantics:'actual'}],{actorIds:['mara'],itemIds:[]});assert.equal(candidates.ok,true);
    const confirmed=confirmOccurrences(candidates.data.events,candidates.data.events.map(event=>({eventId:event.eventId,accepted:true}))).data.events;
    assert.equal(settlement.validateNativeFileEvidence(confirmed,original.text+' Ash fell.',original.text).ok,true);
    assert.equal(settlement.validateNativeFileEvidence(candidates.data.events,original.text,original.text).error.code,'INVALID_FILE_EVIDENCE');
    assert.equal(settlement.validateNativeFileEvidence(confirmed,'The sword spared Orr.',original.text).error.code,'FINAL_EVIDENCE_REEXTRACT_REQUIRED');
    assert.equal(settlement.validateNativeFileEvidence(confirmed,'Prefix. '+original.text,original.text).error.code,'FINAL_EVIDENCE_REEXTRACT_REQUIRED');
});
test('settlement configuration accessors are rejected without acquiring private capabilities',async()=>{
    let reads=0;const config=Object.defineProperty({},'originalDraft',{enumerable:true,get(){reads++;return original;}});const bundle=settlement.createAcceptedNativeSettlement(config);assert.equal((await bundle.accept(original)).ok,false);assert.equal(reads,0);
    assert.equal(settlement.createNativeFileSession(config).ok,false);assert.equal(reads,0);
});
test('native file factories inspect capability methods without evaluating nested accessors',()=>{
    let reads=0;const catalog=Object.defineProperty({},'capture',{enumerable:true,get(){reads++;throw new Error('PRIVATE SECRET');}});const result=settlement.createNativeFileSession({catalog,scope:{userId:'u',chatId:'c'},context:()=>({}),userId:()=> 'u',persistenceVerifier:{saveAndVerify:async()=>({ok:true,data:{acknowledged:true}})},isCurrent:()=>true,stage:()=>({ok:true})});assert.equal(result.ok,false);assert.equal(reads,0);
});
test('failed final validation cannot pin a different Draft for a corrected accepted retry',async()=>{
    const f=fixture();let commits=0;f.bundle.stage({intentId:'soul',targetId:'souls',proposed:{},preflight:async()=>({ok:true,data:{status:'ready'}}),commit:async()=>{commits++;return {ok:true,data:{status:'confirmed'}};}});
    const spared=createDraftRevision(original,'The sword spared Orr.',{nodeId:'prose',scope:'whole'}).data.draft;
    assert.equal((await f.bundle.accept(spared)).error.code,'FINAL_EVIDENCE_REEXTRACT_REQUIRED');assert.equal((await f.bundle.accept(original)).ok,true);
    assert.deepEqual(f.calls.filter(call=>call[0]==='publish'),[['publish',original.text]]);assert.equal(commits,1);
});
test('failed effect preflight permits a safely corrected Draft without publishing its abandoned predecessor',async()=>{
    const f=fixture();let ready=false;f.bundle.stage({intentId:'soul',targetId:'souls',proposed:{},preflight:async()=>ready?{ok:true,data:{status:'ready'}}:{ok:false,error:{code:'FILE_REVISION_CONFLICT',message:'Recheck target'}},commit:async()=>({ok:true,data:{status:'confirmed'}})});
    const abandoned=createDraftRevision(original,original.text+' Ash fell.',{nodeId:'prose',scope:'whole'}).data.draft;
    assert.equal((await f.bundle.accept(abandoned)).error.code,'FILE_REVISION_CONFLICT');ready=true;assert.equal((await f.bundle.accept(original)).ok,true);assert.deepEqual(f.calls.filter(call=>call[0]==='publish'),[['publish',original.text]]);
});
test('overlapping acceptance keeps each validated Draft paired with its own publication and freezes accepted presentation',async()=>{
    let resume,entered;const gate=new Promise(resolve=>resume=resolve),started=new Promise(resolve=>entered=resolve);const calls=[];let validations=0,commits=0;
    const bundle=settlement.createAcceptedNativeSettlement({scope:{userId:'u',chatId:'story'},originalDraft:original,isCurrent:()=>true,validateFinal:async({body})=>{calls.push(['validate',body]);if(++validations===1){entered();await gate;}return {ok:true};},publish:async draft=>{calls.push(['publish',draft.text]);return {ok:true,data:{appliedLocally:true}};}});
    bundle.stage({intentId:'soul',targetId:'souls',proposed:{},preflight:async()=>({ok:true,data:{status:'ready'}}),commit:async()=>{commits++;return {ok:true,data:{status:'confirmed'}};}});
    const parent=createDraftRevision(original,original.text,{nodeId:'body',scope:'whole'}).data.draft;const firstDraft=appendDraftSections(parent,[{id:'notes',text:'First notes.'}],{nodeId:'notes'}).data.draft;
    const changed=appendDraftSections(parent,[{id:'notes',text:'Different notes.'}],{nodeId:'notes'}).data.draft;
    const first=bundle.accept(firstDraft);await started;const second=bundle.accept(changed);assert.equal(validations,1);resume();const [accepted,rejected]=await Promise.all([first,second]);assert.equal(accepted.ok,true);assert.equal(rejected.ok,false);assert.equal(rejected.error.code,'FINAL_EVIDENCE_CHANGED');assert.deepEqual(calls.filter(call=>call[0]==='publish'),[['publish',firstDraft.text]]);assert.equal(commits,1);assert.equal((await bundle.accept(firstDraft)).ok,true);assert.equal(commits,1);
});
test('overlapping failed and corrected acceptance publishes only the validated corrected Draft',async()=>{
    let resume,entered;const gate=new Promise(resolve=>resume=resolve),started=new Promise(resolve=>entered=resolve),calls=[];let validations=0;
    const bundle=settlement.createAcceptedNativeSettlement({scope:{userId:'u',chatId:'story'},originalDraft:original,isCurrent:()=>true,validateFinal:async({body})=>{if(++validations===1){entered();await gate;}return body===original.text?{ok:true}:{ok:false,error:{code:'FINAL_EVIDENCE_REEXTRACT_REQUIRED',message:'Reextract'} };},publish:async draft=>{calls.push(draft.text);return {ok:true,data:{appliedLocally:true}};}});
    const spared=createDraftRevision(original,'The sword spared Orr.',{nodeId:'prose',scope:'whole'}).data.draft;const first=bundle.accept(spared);await started;const second=bundle.accept(original);resume();const [failed,accepted]=await Promise.all([first,second]);assert.equal(failed.ok,false);assert.equal(accepted.ok,true);assert.deepEqual(calls,[original.text]);
});
