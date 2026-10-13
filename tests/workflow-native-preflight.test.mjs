import test from 'node:test';
import assert from 'node:assert/strict';
import {starterGraph} from '../src/workflow/starters.js?v=0.27.1';
import {unifiedRecipeHost} from './helpers/unified-recipe-host.mjs';

test('manual native preflight spends no auxiliary requests and leaves ordinary Send usable',async()=>{
 const graph=starterGraph('unified-basic');
 graph.nodes.context={id:'context',type:'workflow',operation:'scene-context',visibilityMode:'public'};
 graph.nodes.model={id:'model',type:'workflow',operation:'response-plan'};
 graph.wires.context={id:'context',route:'wire',from:'context',fromPort:'out',to:'model',toPort:'in'};
 graph.wires.guidance={id:'guidance',route:'wire',from:'model',fromPort:'out',to:'generate-reply',toPort:'guidance'};
 const host=unifiedRecipeHost(graph,{request:async()=>({ok:true,data:{text:'A direction.',finish:'stop'}})});
 try{
  const preview=await host.controller.runTarget(graph,{workflowId:graph.id,instancePath:[],nodeId:'generate-reply',portId:'draft'});
  assert.equal(preview.error.code,'NATIVE_OWNER_MISSING');assert.equal(preview.actualCalls,0);assert.equal(host.calls(),0);assert.equal(host.saves(),0);
  assert.deepEqual(preview.reviewHandles,[]);assert.equal(host.c.chat.length,1);
  const sent=await host.generate('Ordinary native reply.');assert.equal(sent.ok,true,JSON.stringify(sent.error));
  assert.equal(host.calls(),1);assert.equal(host.c.chat.at(-1).mes,'Ordinary native reply.');assert.equal(host.saves(),0);
 }finally{host.controller.dispose();}
});
