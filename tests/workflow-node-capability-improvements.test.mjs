import assert from 'node:assert/strict';
import {test} from 'node:test';
import {composition} from '../tools/remastered/composition.mjs';
import {executeContextJoin} from '../src/workflow/operations/context-join.js';
import {compactContext} from '../src/workflow/compactor.js';
import {operationDefaults,describeOperation} from '../src/workflow/catalog.js';

test('lesson 15 compaction protects the actual latest chronological messages', async()=>{
    const graph=composition().find(entry=>entry.number===15).packages[0].graph;
    const messages=Array.from({length:12},(_,index)=>({id:'chat:'+index,role:'user',text:'Message '+index}));
    const sources={recent:{kind:'context',messages:messages.slice(-3)},wider:{kind:'context',messages}};
    const inputs=Object.fromEntries(Object.values(graph.wires).filter(wire=>wire.to==='join-context').map(wire=>[wire.toPort,sources[wire.from]]));
    const joined=executeContextJoin(graph.nodes['join-context'],inputs);
    assert.equal(joined.ok,true,JSON.stringify(joined.error));
    const result=await compactContext(joined.artifact,{targetTokens:2,keepRecent:2,method:'select'},{countTokens:async text=>({tokens:text?text.split('[user ').length-1:0,method:'message-count-fixture'})});
    assert.equal(result.ok,true,JSON.stringify(result.error));
    assert.deepEqual(result.artifact.messages.map(message=>message.id),['chat:10','chat:11']);
});

test('new Repair starts with inspection while saved legacy modes remain legacy',()=>{
    const created=operationDefaults('repair');
    assert.equal(created.mode,'inspect');
    assert.equal(created.policyVersion,1);
    const legacy=describeOperation({schema:3,runtime:2,mode:'native-unified'},{type:'workflow',operation:'repair',phase:'post'});
    assert.equal(legacy.ok,true);
    assert.equal(legacy.data.descriptor.defaults.mode,'repair');
    const explicit=describeOperation({schema:3,runtime:2,mode:'native-unified'},{type:'workflow',operation:'repair',phase:'post',mode:'repair'});
    assert.equal(explicit.ok,true);
});
