import assert from 'node:assert/strict';
import {test} from 'node:test';
import {projectRecallView} from '../src/ui/recall-projection.js';
import {prepareWorkspaceViews} from '../src/ui/workspace-preparation.js';
import {operationDefaults} from '../src/workflow/catalog.js';
import {nestedRecallFixture,recallAddress} from './helpers/nested-recall-fixture.mjs';

test('prepared nested Recall projection avoids graph admission when selection and runtime status change',t=>{
 const f=nestedRecallFixture();
 for(let index=0;index<300;index++){
  const id='compose-'+index;f.graph.nodes[id]={id,type:'workflow',...operationDefaults('compose')};
 }
 const prepared=prepareWorkspaceViews(f.graph);assert.equal(prepared.ok,true,JSON.stringify(prepared.error));
 const ready=f.controller.sync();assert.equal(ready.ok,true,JSON.stringify(ready.error));
 const queued=f.controller.queue(recallAddress(['left']));assert.equal(queued.ok,true,JSON.stringify(queued.error));
 const cancelled=f.controller.cancel(recallAddress(['left']));assert.equal(cancelled.ok,true,JSON.stringify(cancelled.error));
 const input={rootGraph:f.graph,inventory:prepared.data.planner.inventory,status:ready.data,enabled:true,nodeIds:['recall'],viewKind:'instance',instancePath:['left']};
 const clone=globalThis.structuredClone;let clones=0;
 globalThis.structuredClone=(...args)=>{clones++;return clone(...args);};
 try{
  const disabled=projectRecallView({...input,enabled:false});assert.equal(disabled.nodes.recall.state,'unavailable');assert.equal(disabled.nodes.recall.queueAllowed,false);
  const unselected=projectRecallView({...input,nodeIds:[]});assert.equal(unselected.commands.selected.queueNodeIds.length,0);
  const available=projectRecallView(input);assert.equal(available.nodes.recall.queueAllowed,true);assert.deepEqual(available.nodes.recall.shortcutAddresses,[recallAddress(['left'])]);
  const pending=projectRecallView({...input,status:queued.data});assert.equal(pending.nodes.recall.state,'queued');assert.equal(pending.nodes.recall.cancelAllowed,true);assert.equal(pending.nodes.recall.queueAllowed,false);
  const unselectedPending=projectRecallView({...input,status:queued.data,nodeIds:[]});assert.equal(unselectedPending.nodes.recall.queued,true);assert.equal(unselectedPending.commands.selected.cancelNodeIds.length,0);
  const cleared=projectRecallView({...input,status:cancelled.data});assert.equal(cleared.nodes.recall.queued,false);assert.equal(cleared.nodes.recall.queueAllowed,true);assert.equal(cleared.sets.some(set=>set.memorySetId==='right-memories'),true);assert.equal(cleared.sets.some(set=>set.memorySetId==='off'),false);
  t.diagnostic(`six prepared Recall projections structuredClone calls: ${clones}`);
  assert.equal(clones,0,'Selection and status publications must reuse the admitted inventory.');
 }finally{globalThis.structuredClone=clone;f.controller.dispose();}
});
