import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nestedRecallFixture,nestedRecallHostFixture,recallAddress} from './helpers/nested-recall-fixture.mjs';
import {recallPause} from './helpers/native-recall-host-fixture.mjs';

test('nested shortcut listeners distinguish sibling local IDs and exclude disabled instances',()=>{
 const f=nestedRecallFixture(),synced=f.controller.sync();assert.equal(synced.ok,true,JSON.stringify(synced.error));
 assert.equal(f.listeners.length,3);assert.deepEqual(synced.data.shortcuts.map(item=>item.address.instancePath.join('/')).sort(),['','left','right']);
 const left=f.listeners.find(entry=>entry.address.instancePath[0]==='left');assert.equal(left.onPress().ok,true);
 assert.deepEqual(f.controller.status().data.requests.filter(item=>item.queued).map(item=>item.memorySetId),['left-memories']);
 assert.equal(f.controller.queue(recallAddress(['right'])).ok,true);assert.equal(f.controller.queue(f.collision).ok,true);
 assert.deepEqual(f.controller.status().data.requests.filter(item=>item.queued).map(item=>item.memorySetId).sort(),['left-memories','right-memories','root-memories']);
 assert.equal(f.controller.cancel(recallAddress(['left'])).ok,true);assert.equal(f.controller.status().data.shortcuts.find(item=>item.address.instancePath[0]==='right').queued,true);
 assert.equal(f.controller.queue(recallAddress(['disabled'])).ok,false);assert.equal(f.controller.queue('off').ok,false);f.controller.dispose();
});
test('addressed queue captures reject another document and malformed or foreign addresses atomically',()=>{
 const f=nestedRecallFixture(),capture=f.controller.captureQueueCommand();assert.equal(capture.ok,true,JSON.stringify(capture.error));
 for(const invalid of [{workflowId:'another',instancePath:['left'],nodeId:'hotkey'},recallAddress(['disabled']),{...recallAddress(['right']),portId:'proposal'}]){
  assert.equal(f.controller.changeQueues(capture.data,{action:'queue',shortcutAddresses:[recallAddress(['left']),invalid]}).ok,false);
  assert.equal(f.controller.status().data.requests.some(item=>item.queued),false);
 }
 for(const request of [{action:'queue',shortcutAddresses:null},{action:'queue',shortcutNodeIds:null}])assert.equal(f.controller.changeQueues(capture.data,request).ok,false,'A present shortcut list must be an array.');
 assert.equal(f.controller.changeQueues(capture.data,{action:'queue',shortcutAddresses:[recallAddress(['left']),recallAddress(['right'])]}).ok,true);
 const stale=f.controller.captureQueueCommand();f.replaceDocument();assert.equal(f.controller.changeQueues(stale.data,{action:'cancel',shortcutAddresses:[recallAddress(['left'])]}).ok,false);
 assert.equal(f.listeners.slice(0,3).every(entry=>entry.closed),true);assert.equal(f.controller.status().data.requests.some(item=>item.queued),false);f.controller.dispose();
});
test('static nested Recall preserves private file ancestry into native generation and accepted consumption',async()=>{
 const f=nestedRecallHostFixture();assert.equal(f.controller.queueRecall(f.address).ok,true);const ready=await f.start();assert.equal(ready.ok,true,JSON.stringify(ready.error));
 assert.equal(Object.values(f.c.extensionPrompts).some(entry=>entry.value.includes('PRIVATE harbor memory')),true);
 const result=await f.complete();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(f.requests(),1);
 const accepted=await f.controller.apply(result.reviewHandles[0]);assert.equal(accepted.ok,true,JSON.stringify(accepted.error));assert.equal(accepted.settlement.status,'settled');
 assert.equal(f.controller.statusRecall().data.shortcuts[0].queued,false);assert.equal(f.c.chat[1].mes.includes('PRIVATE harbor memory'),false);f.controller.dispose();
});
test('stopping a nested Recall reservation preserves its queued use for the next generation',async()=>{
 const f=nestedRecallHostFixture();assert.equal(f.controller.queueRecall(f.address).ok,true);assert.equal((await f.start()).ok,true);
 await f.c.eventSource.emit('GENERATION_STOPPED');for(let i=0;i<40&&!f.results.length;i++)await recallPause();
 assert.equal(f.results[0].error.code,'ABORTED');assert.equal(f.controller.statusRecall().data.shortcuts[0].queued,true);assert.equal(f.controller.statusRecall().data.shortcuts[0].pendingCount,0);
 f.results.length=0;assert.equal((await f.start()).ok,true);const result=await f.complete();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);
 assert.equal(f.controller.statusRecall().data.shortcuts[0].queued,false);f.controller.dispose();
});
test('nested Recall holds acceptance when its file source or addressed queued claim is revoked',async()=>{
 for(const change of ['file','cancel']){const f=nestedRecallHostFixture();assert.equal(f.controller.queueRecall(f.address).ok,true);assert.equal((await f.start()).ok,true);const result=await f.complete();assert.equal(result.ok,true,JSON.stringify(result.error));
  if(change==='file')f.catalog.remove('moments.json');else assert.equal(f.controller.cancelRecall(f.address).ok,true);
  assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,false,change);assert.equal(f.c.chat[1].swipes.length,1);f.controller.dispose();
 }
});
test('nested Recall rechecks source freshness and cancellation after an awaited tokenizer',async()=>{
 for(const mutation of ['file','stop']){let changed=false;const f=nestedRecallHostFixture({onCount:async text=>{if(changed||!text.includes('PRIVATE harbor memory'))return;changed=true;await Promise.resolve();if(mutation==='file')f.catalog.remove('moments.json');else await f.c.eventSource.emit('GENERATION_STOPPED');}});
  assert.equal(f.controller.queueRecall(f.address).ok,true);const result=await f.start();assert.equal(result.ok,false,mutation);assert.equal(Object.values(f.c.extensionPrompts).every(entry=>!entry.value),true,mutation);assert.equal(f.controller.statusRecall().data.shortcuts[0].queued,true);assert.equal(f.controller.statusRecall().data.shortcuts[0].pendingCount,0);f.controller.dispose();
 }
});
