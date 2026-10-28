import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Text} from '../src/workflow/definition-data.js';
import {prepareDocumentCheckpoint,lookupDocumentHistory} from '../src/workflow/document-history.js';
const api=await import('../src/workflow/file-history-maintenance.js');
test('trusted branch rebasing requires exact verified branchpoint and preserves canonical private state',async()=>{
 const sourceBinding={schemaVersion:1,messageCount:2,prefixHash:sha256Text('accepted-prefix')};
 const snapshot={targetId:'clock',scope:{userId:'owner',chatId:'parent',actorId:'mara'},revision:7,format:'json',content:JSON.stringify({schemaVersion:1,clockId:'clock',calendarId:'days',revision:7,dayLengthMinutes:1440,absoluteMinute:42}),receipts:[{intentId:'parent-save',fingerprint:sha256Text('save'),revision:7}],sourceBinding,branchBinding:sourceBinding};
 const request={snapshot,pages:{},branchScope:{...snapshot.scope,chatId:'child'},branchBinding:sourceBinding,visibility:{kind:'actor-private',actorId:'mara'}};
 const before=structuredClone(request),result=await api.prepareTrustedBranchSnapshot(request);assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(JSON.parse(result.data.snapshot.content).absoluteMinute,42);assert.equal(result.data.snapshot.scope.chatId,'child');assert.deepEqual(result.data.snapshot.receipts,[]);assert.equal(result.data.snapshot.revision,0);assert.deepEqual(request,before);
 assert.equal((await api.prepareTrustedBranchSnapshot({...request,branchBinding:{...sourceBinding,messageCount:1}})).error.code,'BRANCH_POINT_UNAVAILABLE');
 assert.equal((await api.prepareTrustedBranchSnapshot({...request,branchScope:{...request.branchScope,actorId:'other'}})).ok,false);
 assert.equal((await api.prepareTrustedBranchSnapshot({...request,branchScope:snapshot.scope})).ok,false);
});
test('an unstamped accepted revision never borrows an older business source prefix as publication authority',async()=>{
 const binding={schemaVersion:1,messageCount:2,prefixHash:sha256Text('older business prefix')};
 for(const marker of [null,undefined]){
  const snapshot={targetId:'notes',scope:{userId:'owner',chatId:'parent'},revision:9,format:'text',content:'later unverified publication',receipts:[],sourceBinding:binding,...(marker===undefined?{}:{branchBinding:marker})};
  const result=await api.prepareTrustedBranchSnapshot({snapshot,pages:{},branchScope:{userId:'owner',chatId:'child'},branchBinding:binding,visibility:{kind:'public'}});
  assert.equal(result.ok,false);assert.equal(result.error.code,'BRANCH_POINT_UNAVAILABLE');
 }
});
test('branch archive rebasing preserves private replay facts while discarding parent save authority',async()=>{
 const scope={userId:'owner',chatId:'parent',actorId:'mara'},visibility={kind:'actor-private',actorId:'mara'},branchBinding={schemaVersion:1,messageCount:3,prefixHash:sha256Text('branch prefix')};
 const value={values:[{key:'trust',value:5}],ledger:[{eventId:'accepted-event',identityKey:'trust-award',eventIdentity:'private-facts',visibility}]};
 const snapshot={targetId:'state',scope,revision:8,format:'json',content:JSON.stringify(value),receipts:[{intentId:'parent-save',fingerprint:sha256Text('save'),revision:8}],branchBinding};
 const checkpoint=await prepareDocumentCheckpoint(snapshot,{scope,visibility,checkpointId:'parent-checkpoint'});assert.equal(checkpoint.ok,true,JSON.stringify(checkpoint));
 const request={snapshot:{...snapshot,content:checkpoint.data.content,history:checkpoint.data.history},pages:checkpoint.data.pages,branchScope:{...scope,chatId:'child'},branchBinding,visibility};
 const branch=await api.prepareTrustedBranchSnapshot(request);assert.equal(branch.ok,true,JSON.stringify(branch));
 const lookup=lookupDocumentHistory({targetId:'state',scope:request.branchScope,history:branch.data.snapshot.history,pages:branch.data.pages},{intentId:'parent-save',progression:{identityKeys:['trust-award'],eventIds:['accepted-event']}});
 assert.equal(lookup.ok,true,JSON.stringify(lookup));assert.equal(lookup.data.receipt,undefined);assert.deepEqual(lookup.data.privateActorIds,['mara']);assert.deepEqual(lookup.data.progression.knownIdentityKeys,['trust-award']);
 assert.equal(JSON.parse(branch.data.snapshot.content).values[0].value,5);
 assert.equal((await api.prepareTrustedBranchSnapshot({...request,visibility:{kind:'public'}})).error.code,'PRIVATE_DESTINATION');
});
