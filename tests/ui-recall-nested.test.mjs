import assert from 'node:assert/strict';
import {test} from 'node:test';
import {projectRecallView} from '../src/ui/recall-projection.js';
import {createRecallCommands} from '../src/ui/recall-commands.js';
import {nestedRecallFixture,recallAddress} from './helpers/nested-recall-fixture.mjs';

test('instance Recall projection displays local cards and carries exact sibling shortcut addresses',()=>{
 const f=nestedRecallFixture(),synced=f.controller.sync();assert.equal(synced.ok,true,JSON.stringify(synced.error));
 const view=projectRecallView({rootGraph:f.graph,status:synced.data,enabled:true,nodeIds:['recall'],viewKind:'instance',instancePath:['left']});
 assert.ok(view.nodes.recall,'The active instance exposes its Recall card.');assert.equal(view.nodes.recall.queueAllowed,true);assert.deepEqual(view.nodes.recall.address,recallAddress(['left'],'recall'));assert.deepEqual(view.nodes.recall.shortcutAddresses,[recallAddress(['left'])]);
 assert.equal(view.commands.selected.queueNodeIds.length,1);assert.equal(view.sets.some(set=>set.memorySetId==='right-memories'),true);assert.equal(view.sets.some(set=>set.memorySetId==='off'),false);
 const library=projectRecallView({rootGraph:f.graph,status:synced.data,enabled:true,nodeIds:['recall'],viewKind:'library',instancePath:['left']});assert.equal(library.commands.selected.queueNodeIds.length,0);f.controller.dispose();
});
test('nested selected UI queue and cancel dispatch exact addresses and reject changed editor context',()=>{
 const f=nestedRecallFixture();let context={editorToken:'left',documentToken:{},selectionEpoch:1,viewKind:'instance',projection:null};
 const refresh=()=>context={...context,projection:projectRecallView({rootGraph:f.graph,status:f.controller.status().data,enabled:true,nodeIds:['recall'],viewKind:'instance',instancePath:['left']})};refresh();
 const commands=createRecallCommands({readContext:()=>context,isContextCurrent:saved=>saved.editorToken===context.editorToken&&saved.documentToken===context.documentToken&&saved.selectionEpoch===context.selectionEpoch,captureRecall:()=>f.controller.captureQueueCommand(),changeRecallQueues:(capture,request)=>f.controller.changeQueues(capture,request),changed:refresh,openDetails(){}});
 const queue=commands.capture(['recall']);assert.equal(queue.ok,true,JSON.stringify(queue.error));assert.equal(commands.change(queue.data,'queue').ok,true);assert.equal(context.projection.nodes.recall.cancelAllowed,true);
 assert.equal(f.controller.status().data.shortcuts.find(item=>item.address.instancePath[0]==='right').queued,false);
 const cancel=commands.capture(['recall']);assert.equal(commands.change(cancel.data,'cancel').ok,true);assert.equal(context.projection.nodes.recall.queued,false);
 const stale=commands.capture(['recall']);context={...context,editorToken:'right'};assert.equal(commands.change(stale.data,'queue').ok,false);assert.equal(f.controller.status().data.requests.some(item=>item.queued),false);f.controller.dispose();
});
