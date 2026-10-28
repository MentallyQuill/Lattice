import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildCombinedExample} from '../tools/combined-system-example.mjs';
import {createCombinedHost, readDocument, initialRelationship} from './helpers/combined-system-host.mjs';
import {readFile} from 'node:fs/promises';
import {validateDefinition} from '../src/workflow/definitions.js';
import {editableCombinedExample} from '../tools/combined-system-example.mjs';
import {parseWorkflow} from '../src/workflow/packages.js';

test('combined reference readers deliberately require authored source files',()=>{
 const graph=buildCombinedExample();
 const readers=Object.values(graph.definitions).flatMap(definition=>Object.values(definition.body.nodes)).filter(node=>node.operation==='read-file');
 assert.ok(readers.length>0);
 for(const reader of readers)assert.equal(reader.initialization,'require-file',reader.id);
});

test('combined native reply receives ordered item/weather guidance and settles three targets once', async () => {
 const graph=buildCombinedExample();
 assert.equal(graph.schema,3);assert.equal(graph.runtime,2);
 assert.deepEqual(Object.values(graph.nodes).filter(n=>n.type==='subgraph').map(n=>n.id),['wand','weather','relationship']);
 for(const id of ['wand','weather','relationship'])assert.equal(graph.definitions[JSON.stringify([graph.nodes[id].definition.id,graph.nodes[id].definition.version,graph.nodes[id].definition.semanticHash])].interface.length,2,'Expose only connected source/guidance boundaries for '+id);
 const f=createCombinedHost(graph);
 try {
  const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));
  assert.equal(result.reviewHandles.length,1);assert.equal(result.recording.artifacts.filter(a=>a.kind==='draft').length,1);assert.equal(result.recording.artifacts.filter(a=>a.kind==='candidate').length,1);assert.equal(f.c.chat.length,2);assert.ok(Object.values(f.c.extensionPrompts).every(p=>p.value===''));assert.equal(f.injections.length,1);assert.equal(f.injections[0].chatLength,1);
  assert.match(f.injections[0].text,/Blue sparks replace the spell/);assert.match(f.injections[0].text,/rain begins/);
  assert.ok(f.injections[0].text.indexOf('Blue sparks')<f.injections[0].text.indexOf('rain begins'));
  assert.doesNotMatch(f.injections[0].text,/rowan-toward-iris|actor-private/);
  assert.equal(f.calls(),4);assert.equal(f.draws(),1);assert.equal(f.saves(),0);assert.equal(f.c.chatMetadata.latticeDocuments,undefined);
  assert.deepEqual(readDocument(f,'rowan-relationship'),initialRelationship);
  assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);
  assert.equal(f.saves(),3);assert.equal(readDocument(f,'lattice-default-clock').absoluteMinute,480);
  assert.equal(readDocument(f,'lattice-default-clock').settledTimeEventIds.length,1);
  const outcomes=readDocument(f,'wand-outcomes');assert.equal(outcomes.length,1);assert.equal(outcomes[0].acceptance,'accepted');assert.equal(outcomes[0].event.holderId,'character:rowan.png');
  const state=readDocument(f,'rowan-relationship');assert.deepEqual(state.values.map(v=>v.value),[1,.1,1.75,.5]);assert.equal(state.ledger.length,4);
  assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(f.saves(),3);assert.equal(f.calls(),4);assert.equal(f.draws(),1);
 } finally {f.controller.dispose();}
});

for(const action of ['reject','cancel','source-changed'])test('combined '+action+' preserves all initial resources',async()=>{
 const f=createCombinedHost(buildCombinedExample());try{
  const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));
  if(action==='reject')assert.equal(f.controller.reject(result.reviewHandles[0]).ok,true);
  else if(action==='cancel')f.controller.cancel();else f.c.chat.at(-1).mes+=' changed';
  assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,false);assert.equal(f.saves(),0);assert.equal(f.calls(),4);assert.equal(f.draws(),1);
  assert.equal(f.c.chatMetadata.latticeDocuments,undefined);assert.deepEqual(readDocument(f,'rowan-relationship'),initialRelationship);assert.equal(readDocument(f,'lattice-default-clock').absoluteMinute,0);assert.deepEqual(readDocument(f,'wand-outcomes'),[]);
 }finally{f.controller.dispose();}
});
for(const disabled of ['wand','weather','relationship'])test('disabled '+disabled+' removes only its participation',async()=>{
 const graph=buildCombinedExample();graph.nodes[disabled].enabled=false;const documents=combinedDocuments().filter(d=>disabled==='wand'?!d.targetId.startsWith('wand-'):disabled==='relationship'?d.targetId!=='rowan-relationship':true);const f=createCombinedHost(graph,{documents});try{
  const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(f.injections.length,1);
  assert.equal(f.injections[0].text.includes('Blue sparks'),disabled!=='wand');assert.equal(f.injections[0].text.includes('rain begins'),disabled!=='weather');
  assert.equal(f.draws(),disabled==='wand'?0:1);assert.equal(f.calls(),disabled==='weather'?4:2);assert.equal(f.saves(),0);
  assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(f.saves(),2);
  assert.equal(readDocument(f,'lattice-default-clock').absoluteMinute,disabled==='weather'?0:480);
  if(disabled!=='wand')assert.equal(readDocument(f,'wand-outcomes').length,1);
  if(disabled!=='relationship')assert.deepEqual(readDocument(f,'rowan-relationship').values.map(v=>v.value),[1,.1,1.75,.5]);
  if(disabled==='relationship')assert.equal(result.recording.artifacts.some(a=>JSON.stringify(a.address??{}).includes('relationship-state-file')),false,'Disabled private body is never read');
 }finally{f.controller.dispose();}
});
test('no actual wand use omits only wand guidance and never draws or settles an outcome',async()=>{
 const f=createCombinedHost(buildCombinedExample(),{noUse:true});try{
  const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(f.injections.length,1);assert.doesNotMatch(f.injections[0].text,/Blue sparks/);assert.match(f.injections[0].text,/rain begins/);assert.equal(f.draws(),0);assert.equal(f.calls(),3);
  assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(f.saves(),2);assert.deepEqual(readDocument(f,'wand-outcomes'),[]);
 }finally{f.controller.dispose();}
});

import {exportWorkflow} from '../src/workflow/packages.js';
import {runWorkflow} from '../src/workflow/runtime.js';
import {serializeWorkflowDocument,parseWorkflowDocument} from '../src/workflow/document-file.js';
import {createViewState} from '../src/ui/view-state.js';
import {combinedDocuments} from './helpers/combined-system-host.mjs';

test('an agreed shorter wait omits rain while preserving other system guidance and projected time',async()=>{
 const f=createCombinedHost(buildCombinedExample({waitMinutes:479}));try{
  const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(f.injections.length,1);assert.match(f.injections[0].text,/Blue sparks/);assert.doesNotMatch(f.injections[0].text,/rain begins/);
  assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(f.saves(),3);assert.equal(readDocument(f,'lattice-default-clock').absoluteMinute,479);assert.deepEqual(readDocument(f,'lattice-default-clock').settledTimeEventIds,[]);
 }finally{f.controller.dispose();}
});
test('a zero agreed wait preserves the clock and omits rain while other systems settle',async()=>{
 const f=createCombinedHost(buildCombinedExample({waitMinutes:0}));try{
  const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(f.injections.length,1);assert.doesNotMatch(f.injections[0].text,/rain begins/);
  assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(readDocument(f,'lattice-default-clock').absoluteMinute,0);assert.deepEqual(readDocument(f,'lattice-default-clock').settledTimeEventIds,[]);assert.equal(readDocument(f,'wand-outcomes').length,1);
 }finally{f.controller.dispose();}
});
test('wrong accepted holder holds before native reply, draw or any settlement',async()=>{
 const documents=combinedDocuments();documents.find(d=>d.targetId==='wand-holders').content=JSON.stringify({'broken-wand':'character:iris.png'});
 const f=createCombinedHost(buildCombinedExample(),{documents});try{
  const result=await f.generate();assert.equal(result.ok,false);assert.equal(result.reviewHandles?.length??0,0);assert.equal(f.draws(),0);assert.equal(f.saves(),0);assert.equal(f.injections.length,0);assert.equal(f.c.chat.length,1);assert.equal(f.c.chatMetadata.latticeDocuments,undefined);
 }finally{f.controller.dispose();}
});
test('public preview and native Run to here never publish or settle combined effects',async()=>{
 const graph=buildCombinedExample();const preview=await runWorkflow(graph,{preview:true,request:()=>{throw Error('Preview called model');}});assert.equal(preview.ok,true);assert.equal(preview.preview,true);
 const f=createCombinedHost(graph);try{
  const result=await f.controller.runTarget(graph,{workflowId:graph.id,instancePath:['weather'],nodeId:'weather-commit-clock',portId:'receipt'});
  assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.reviewHandles.length,0);assert.equal(f.calls(),0);assert.equal(f.draws(),0);assert.equal(f.injections.length,0);assert.equal(f.saves(),0);assert.equal(readDocument(f,'lattice-default-clock').absoluteMinute,0);assert.equal(f.c.chat.length,1);
 }finally{f.controller.dispose();}
});
function openedViews(graph){const navigation=['wand','weather','relationship'].map(id=>({identity:{kind:'instance',workflowId:graph.id,instancePath:[id]},label:id}));const views=createViewState({workflowId:graph.id,navigation});assert.ok(views);for(const id of ['wand','weather','relationship'])assert.equal(views.openInstance([id]).ok,true);return views;}
test('portable definitions and editable document round trip without acquiring file rights; closed tabs preserve execution',async()=>{
 const {normalizeExampleCheckout}=await import('../tools/combined-system-example.mjs');const sample='{\"value\":1}\n';assert.equal(normalizeExampleCheckout(sample),sample);assert.equal(normalizeExampleCheckout(sample.replaceAll('\n','\r\n')),sample);assert.notEqual(normalizeExampleCheckout(sample.replace('1','2')),sample);
 const graph=buildCombinedExample(),portable=exportWorkflow(graph);const parsed=parseWorkflow(JSON.stringify(portable));assert.equal(parsed.ok,true,JSON.stringify(parsed.error));
 assert.equal(normalizeExampleCheckout(await readFile(new URL('../examples/unified/unified-combined-systems.json',import.meta.url),'utf8')),JSON.stringify(portable,null,2)+'\n');
 assert.equal(normalizeExampleCheckout(await readFile(new URL('../examples/unified/unified-combined-systems.lattice-document.json',import.meta.url),'utf8')),editableCombinedExample()+'\n');
 assert.deepEqual(buildCombinedExample(),buildCombinedExample());
 for(const d of Object.values(parsed.data.definitions))assert.equal(validateDefinition(d,parsed.data.definitions).ok,true,d.id);
 for(const g of [parsed.data,...Object.values(parsed.data.definitions).map(d=>d.body)])for(const n of Object.values(g.nodes))if(n.type==='workflow')assert.equal(n.operationVersion,1);
 assert.equal(Object.values(parsed.data.definitions).length,5);assert.equal(Object.values(graph.nodes).filter(n=>n.operation==='generate-reply').length,1);
 const views=openedViews(graph);const encoded=serializeWorkflowDocument(graph,views.serialize().data);assert.equal(encoded.ok,true,JSON.stringify(encoded.error));
 const reopened=parseWorkflowDocument(encoded.data.json);assert.equal(reopened.ok,true,JSON.stringify(reopened.error));assert.equal(reopened.data.workspaceViews.views.filter(v=>v.open).length,4);
 for(const id of ['wand','weather','relationship'])assert.equal(views.closeView(JSON.stringify(['instance',graph.id,[id]])).ok,true);
 const closed=serializeWorkflowDocument(graph,views.serialize().data);assert.equal(closed.ok,true,JSON.stringify(closed.error));assert.equal(parseWorkflowDocument(closed.data.json).data.workspaceViews.views.filter(v=>v.open).length,1);
 const f=createCombinedHost(parseWorkflowDocument(closed.data.json).data.graph);try{const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(f.injections.length,1);assert.equal(f.calls(),4);assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(f.saves(),3);}finally{f.controller.dispose();}
 const unauthorized=createCombinedHost(parsed.data,{documents:[]});try{const result=await unauthorized.generate();assert.equal(result.ok,false);assert.equal(unauthorized.saves(),0);assert.equal(unauthorized.injections.length,0);}finally{unauthorized.controller.dispose();}
});
