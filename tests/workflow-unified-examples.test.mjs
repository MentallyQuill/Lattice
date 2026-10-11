import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {UNIFIED_WORKFLOW_EXAMPLE_DATA as entries} from '../src/workflow/unified-example-data.js';
import {parseWorkflow,exportWorkflow} from '../src/workflow/packages.js?v=0.26.0';
import {validateWorkflow} from '../src/workflow/contracts.js?v=0.26.0';
import {validateDefinition} from '../src/workflow/definitions.js?v=0.26.0';
import {unifiedRecipeHost} from './helpers/unified-recipe-host.mjs';
const recipe=id=>structuredClone(entries.find(e=>e.id==='unified-'+id).packages[0].graph);
const response=text=>({ok:true,data:{text:typeof text==='string'?text:JSON.stringify(text),finish:'stop'}});
const document=(targetId,format,content)=>({targetId,name:targetId,format,content,visibility:{kind:'public'}});
test('all new portable recipes are single unified roots with exact pins and no local assignment',()=>{
 const files=readdirSync(new URL('../examples/unified/',import.meta.url)).filter(name=>name.endsWith('.json'));assert.equal(files.length,entries.length);assert.ok(entries.length>=15);
 for(const [index,entry]of entries.entries()){
  assert.equal(entry.number,31+index);assert.equal(entry.packages.length,1);const envelope=JSON.parse(readFileSync(new URL('../examples/unified/'+entry.id+'.json',import.meta.url),'utf8'));assert.deepEqual(envelope,entry.packages[0]);const parsed=parseWorkflow(JSON.stringify(envelope));assert.equal(parsed.ok,true,JSON.stringify(parsed));assert.equal(parsed.data.mode,'native-unified');assert.deepEqual(exportWorkflow(parsed.data),envelope);const validation=validateWorkflow(parsed.data);assert.equal(validation.ok,true,entry.title+JSON.stringify(validation.error));
  assert.equal(Object.values(parsed.data.nodes).filter(n=>n.operation==='generate-reply').length,1);assert.ok(Object.values(parsed.data.nodes).filter(n=>n.operation==='review-publish').length>=1);assert.ok(parsed.data.description.includes('Setup:'));assert.ok(parsed.data.description.includes('Inspect:'));
  for(const binding of Object.values(parsed.data.roles??{}))assert.deepEqual(binding,{model:null,profileId:null});
  for(const definition of Object.values(parsed.data.definitions??{}))assert.equal(validateDefinition(definition,parsed.data.definitions).ok,true);
 }
});
test('motivating unified recipe runs guidance, native generation, prose, extraction, enrichment and notes before one Apply',async()=>{
 const f=unifiedRecipeHost(recipe('guidance-prose-notes'),{request:async options=>{
  const system=options.messages[0].content;if(system.startsWith('Revise'))return response('Mara found a brass key.');
  if(system.startsWith('Extract')){const source=JSON.parse(options.messages[1].content).source,start=source.indexOf('brass key');return response([{id:'key',label:'Brass key',text:'A brass key is present.',classification:'observation',evidence:[{start,end:start+9,quote:'brass key'}]}]);}
  if(system.startsWith('Expand'))return response([{id:'key',details:'A suggested warm metallic glint.'}]);throw Error('Unexpected recipe request');
 }});
 const result=await f.generate('Mara finds a brass key.');assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(f.calls(),3);assert.equal(f.c.chat.at(-1).mes,'Mara finds a brass key.');assert.equal(f.saves(),0);
 const candidate=result.recording.artifacts.find(a=>a.kind=== 'candidate').value;assert.match(candidate.text,/Mara found a brass key/);assert.match(candidate.text,/<details>/);assert.match(candidate.text,/Generated proposal/);
 const accepted=await f.controller.apply(result.reviewHandles[0]);assert.equal(accepted.ok,true,JSON.stringify(accepted.error));assert.equal(f.c.chat.at(-1).swipes[0],'Mara finds a brass key.');assert.match(f.c.chat.at(-1).mes,/<details>/);assert.equal(f.calls(),3);f.controller.dispose();
});
test('a journal recipe appends its accepted notes to existing document contents',async()=>{
 const f=unifiedRecipeHost(recipe('scene-journal'),{documents:[document('scene-journal','text','Earlier scene.\n')],request:async options=>{const source=JSON.parse(options.messages[1].content).source;return response([{id:'arrival',label:'Arrival',text:'Mara arrived.',classification:'observation',evidence:[{start:0,end:source.length,quote:source}]}]);}});
 const result=await f.generate('Mara arrived.');assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(f.saves(),0);const accepted=await f.controller.apply(result.reviewHandles[0]);assert.equal(accepted.ok,true,JSON.stringify(accepted.error));assert.equal(f.saves(),1);const lease=f.catalog.capture();assert.equal(lease.ok,true);assert.match(f.c.chatMetadata.latticeDocuments['default-user']['scene-journal'].content,/^Earlier scene\.\n/);assert.match(f.c.chatMetadata.latticeDocuments['default-user']['scene-journal'].content,/Mara arrived/);assert.equal(f.c.chatMetadata.latticeDocuments['default-user']['scene-journal'].revision,1);f.controller.dispose();
});

test('same-file sword recipe projects 100 souls and level two, then settles one final canonical write',async()=>{
 const old=Array.from({length:99},(_,i)=>({id:'prior-'+i})),body='Mara killed Guard with the soul-sword.';let call=0;
 const f=unifiedRecipeHost(recipe('hundred-souls'),{documents:[document('soul-sword','json',JSON.stringify([{id:'sword',level:1,souls:old}]))],request:async()=>++call===1?response([{eventType:'scene-action',actorId:'mara',objectId:'guard',itemId:'soul-sword',position:{start:0,end:body.length},semantics:'actual'}]):response({answers:{actual:{type:'noul',accepted:true}}})});
 const result=await f.generate(body);assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(f.calls(),2);assert.equal(f.saves(),0);assert.equal(f.c.chatMetadata.latticeDocuments,undefined);assert.equal(f.c.chat.at(-1).mes,body);
 const accepted=await f.controller.apply(result.reviewHandles[0]);assert.equal(accepted.ok,true,JSON.stringify(accepted.error));assert.equal(accepted.settlement.status,'settled');const sword=JSON.parse(f.c.chatMetadata.latticeDocuments['default-user']['soul-sword'].content)[0];assert.equal(sword.souls.length,100);assert.equal(sword.souls.at(-1).id,'guard');assert.equal(sword.level,2);assert.equal(f.c.chatMetadata.latticeDocuments['default-user']['soul-sword'].revision,1);assert.equal(f.saves(),1);assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(f.saves(),1);assert.equal(f.c.chat.at(-1).swipes[0],body);f.controller.dispose();
});
test('generic experience recipe preserves other state and enumerates every crossed milestone',async()=>{
 const graph=recipe('general-experience'),rules=JSON.parse(graph.nodes['rewards-text'].text);rules.rules[0].amount=570;graph.nodes['rewards-text'].text=JSON.stringify(rules);const body='Mara completed the beacon objective.';let call=0;
 const f=unifiedRecipeHost(graph,{documents:[document('player-progression','json',JSON.stringify({values:[{key:'experience',value:80},{key:'mana',value:9}],ledger:[],campaign:'Story-2'}))],request:async()=>++call===1?response([{eventType:'scene-action',actorId:'mara',position:{start:0,end:body.length},semantics:'actual'}]):response({answers:{actual:{type:'noul',accepted:true}}})});
 const result=await f.generate(body);assert.equal(result.ok,true,JSON.stringify(result.error));const projected=result.recording.artifacts.find(a=>a.kind==='candidate').value;for(const milestone of [100,300,600])assert.ok(projected.text.includes('"threshold":'+milestone));assert.equal(f.saves(),0);const accepted=await f.controller.apply(result.reviewHandles[0]);assert.equal(accepted.ok,true,JSON.stringify(accepted.error));const state=JSON.parse(f.c.chatMetadata.latticeDocuments['default-user']['player-progression'].content);assert.equal(Array.isArray(state),false);assert.deepEqual(state.values,[{key:'experience',value:650},{key:'mana',value:9}]);assert.equal(state.ledger.length,1);assert.equal(state.campaign,'Story-2');assert.equal(f.calls(),2);assert.equal(f.saves(),1);f.controller.dispose();
});
test('directed relationship recipe keeps feelings private, uses story minutes and separates attraction from desire decay',async()=>{
 const body='Elias helped Mara repair her cloak.';let call=0;const privateDoc={...document('mara-relationship','json',JSON.stringify({values:[{key:'mara-to-elias-attraction',value:18,subjectId:'character:mara.png',objectId:'character:elias.png'},{key:'mara-to-elias-desire',value:6,subjectId:'character:mara.png',objectId:'character:elias.png'}],ledger:[]})),visibility:{kind:'actor-private',actorId:'character:mara.png'}};
 const f=unifiedRecipeHost(recipe('directed-relationship'),{documents:[privateDoc,document('story-clock','json',JSON.stringify({schemaVersion:1,clockId:'story-clock',calendarId:'campaign-days',dayLengthMinutes:1440,absoluteMinute:600,revision:1}))],request:async()=>++call===1?response([{eventType:'scene-action',actorId:'character:mara.png',objectId:'character:elias.png',position:{start:0,end:body.length},semantics:'actual'}]):response({answers:{actual:{type:'noul',accepted:true}}})});
 const result=await f.generate(body);assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.recording.artifacts.find(a=>a.kind==='candidate').value.text,body);assert.equal(f.saves(),0);const accepted=await f.controller.apply(result.reviewHandles[0]);assert.equal(accepted.ok,true,JSON.stringify(accepted.error));const state=JSON.parse(f.c.chatMetadata.latticeDocuments['default-user']['mara-relationship'].content);assert.equal(state.values[0].value,20);assert.equal(state.values[1].value,3);assert.equal(state.ledger[0].status,'applied');assert.equal(f.c.chat.at(-1).mes,body);assert.equal(f.calls(),2);f.controller.dispose();
});

test('public example catalog prepares detached unified copies with exact helpers',async()=>{
 const api=await import('../src/workflow/examples.js?v=0.26.0');const examples=api.listWorkflowExamples();assert.equal(examples.filter(e=>e.graph.mode==='native-unified').length,entries.length);
 for(const entry of entries){const first=api.installWorkflowExample(entry.id),second=api.installWorkflowExample(entry.id);assert.equal(first.ok,true,JSON.stringify(first.error));assert.equal(second.ok,true,JSON.stringify(second.error));assert.equal(first.data.companions.length,0);assert.equal(first.data.graph.mode,'native-unified');assert.notEqual(first.data.graph.id,second.data.graph.id);assert.notEqual(Object.keys(first.data.graph.nodes)[0],Object.keys(second.data.graph.nodes)[0]);for(const graph of [first.data.graph,second.data.graph])assert.equal(validateWorkflow(graph).ok,true);}
});
test('broken wand recipe resolves the actual player use before generation, including a separate wild author branch',async()=>{
 const player='Mara uses her broken wand.';
 for(const wild of [false,true]){let draws=0,calls=0;const graph=recipe('broken-wand'),library={libraryId:'wand-effects',revision:'r1',itemId:'broken-wand',effects:[wild?{id:'wild',kind:'generate',weight:1}:{id:'sparks',kind:'fixed',weight:1,description:'Violet sparks replace the spell.'}]};
  const f=unifiedRecipeHost(graph,{playerText:player,documents:[document('wand-effects','json',JSON.stringify(library)),document('wand-outcomes','json','[]')],random:()=>{draws++;return .5;},request:async()=>{calls++;if(calls===1)return response({candidates:[{eventType:'item-used',actorId:'mara',itemId:'broken-wand',position:{start:0,end:player.length},semantics:'actual'}]});if(calls===2)return response({answers:{actual:{type:'noul',accepted:true}}});if(calls===3)return response({id:'paper-moths',description:'Paper moths circle Mara.',spellOutcome:'replaced',duration:'One minute',consequence:'The target is unharmed.'});return response({answers:{novel:{type:'noul',accepted:true}}});}});
  const result=await f.generate(wild?'Paper moths circle Mara.':'Violet sparks replace the spell.');assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(draws,1);assert.equal(calls,wild?4:2);assert.equal(f.saves(),0);assert.equal(f.c.chatMetadata.latticeDocuments,undefined);
  const accepted=await f.controller.apply(result.reviewHandles[0]);assert.equal(accepted.ok,true,JSON.stringify(accepted.error));const saved=JSON.parse(f.c.chatMetadata.latticeDocuments['default-user']['wand-outcomes'].content);assert.equal(saved.length,1);assert.equal(saved[0].acceptance,'accepted');assert.equal(saved[0].effect.id,wild?'paper-moths':'sparks');assert.equal(saved[0].event.source.watch,'player-message');assert.equal(f.saves(),1);assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(draws,1);assert.equal(calls,wild?4:2);f.controller.dispose();
 }
});
