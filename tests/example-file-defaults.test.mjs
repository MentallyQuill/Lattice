import test from 'node:test';
import assert from 'node:assert/strict';
import {installWorkflowExample} from '../src/workflow/examples.js';
import {prepareManagedNodeFiles} from '../src/workflow/managed-file-policy.js';
import {createHostFileStore} from '../src/ui/host-file-store.js';
import {createHostFileAccess} from '../src/ui/host-file-access.js';
import {sha256Text} from '../src/workflow/definition-data.js';
import {REMASTERED_WORKFLOW_EXAMPLE_DATA} from '../src/workflow/remastered-example-data.js';
import {unifiedRecipeHost} from './helpers/unified-recipe-host.mjs';
const api=await import('../src/workflow/example-file-defaults.js').catch(()=>({}));
const installed=number=>installWorkflowExample(`lesson-${String(number).padStart(2,'0')}`).data.graph;
const entries=graph=>Object.values(graph.nodes).map(node=>({node,address:{workflowId:graph.id,instancePath:[],nodeId:node.id}}));
const prepare=(number,options={})=>{const graph=installed(number);return api.prepareExampleFileDefaults({exampleId:`lesson-${String(number).padStart(2,'0')}`,nodes:entries(graph),workflowId:'library:practice',...options});};
const context={workflowId:'library:practice',scope:{userId:'u',chatId:'practice'},isCurrent:()=>true,access:{ensureManaged:async definition=>({ok:true,data:{...definition,bindingId:'host:'+definition.targetId}})}};
test('registered samples prepare isolated live inputs without output writes or model calls',async()=>{
 assert.equal(typeof api.prepareExampleFileDefaults,'function');
 const first=prepare(16),second=prepare(16);assert.equal(first.ok,true);assert.equal(second.ok,true);
 const a=await prepareManagedNodeFiles(first.data.nodes,{...context,initialTemplates:first.data.initialTemplates});
 const b=await prepareManagedNodeFiles(second.data.nodes,{...context,initialTemplates:second.data.initialTemplates});
 assert.equal(a.ok,true,JSON.stringify(a));assert.equal(b.ok,true,JSON.stringify(b));
 assert.match(a.data.definitions[0].content,/North Harbor/);
 assert.notEqual(a.data.definitions[0].targetId,b.data.definitions[0].targetId);
});
test('clock fixtures keep the sample minute and use the scoped clock identity',async()=>{
 const result=prepare(24);assert.equal(result.ok,true,JSON.stringify(result));
 const managed=await prepareManagedNodeFiles(result.data.nodes,{...context,initialTemplates:result.data.initialTemplates});assert.equal(managed.ok,true,JSON.stringify(managed));
 const clock=managed.data.definitions.find(value=>value.name==='story-clock.json'),value=JSON.parse(clock.content);
 assert.equal(value.absoluteMinute,780);assert.equal(value.calendarId,'campaign-days');assert.equal(value.clockId,clock.targetId);
 for(const {node} of result.data.nodes.filter(entry=>entry.node.operation==='time-trigger'))assert.equal(node.clockId,clock.targetId);
 const copied=api.prepareExampleFileDefaults({exampleId:'lesson-24',nodes:result.data.nodes,workflowId:'library:independent-copy'});assert.equal(copied.ok,true);
 const other=await prepareManagedNodeFiles(copied.data.nodes,{...context,workflowId:'library:independent-copy',initialTemplates:copied.data.initialTemplates});assert.equal(other.ok,true);
 const copiedClock=other.data.definitions.find(value=>value.name==='story-clock.json');assert.notEqual(copiedClock.targetId,clock.targetId);
 for(const {node} of copied.data.nodes.filter(entry=>entry.node.operation==='time-trigger'))assert.equal(node.clockId,copiedClock.targetId);
});
test('authored private reader actors without a file visibility choice remain unchanged',()=>{
 const graph=installed(30),nodes=entries(graph),reader=nodes.find(entry=>entry.node.operation==='read-file');reader.node.actorId='character:Different.png';delete reader.node.fileTarget;
 const prepared=api.prepareExampleFileDefaults({exampleId:'lesson-30',nodes,workflowId:context.workflowId,actorBindings:{'character:rowan.png':'character:Actual.png','character:iris.png':'character:Partner.png'}});assert.equal(prepared.ok,true);
 assert.deepEqual(prepared.data.nodes.find(entry=>entry.node.id===reader.node.id).node,reader.node);
 assert.equal(Object.hasOwn(prepared.data.initialTemplates,JSON.stringify([reader.address.workflowId,[],reader.node.id])),false);
});
test('authored unrelated managed schedule clocks are preserved while exact sample clocks rebase',()=>{
 const graph=installed(24),nodes=entries(graph),triggers=nodes.filter(entry=>entry.node.operation==='time-trigger');assert.ok(triggers.length>1);
 triggers[0].node.clockId='managed:authored-other-clock';
 const first=api.prepareExampleFileDefaults({exampleId:'lesson-24',nodes,workflowId:context.workflowId});assert.equal(first.ok,true);
 assert.equal(first.data.nodes.find(entry=>entry.node.id===triggers[0].node.id).node.clockId,'managed:authored-other-clock');
 const sample=first.data.nodes.find(entry=>entry.node.operation==='story-clock'),derived=first.data.nodes.find(entry=>entry.node.id===triggers[1].node.id).node.clockId;
 assert.equal(sample.node.clockId,derived);
 const copied=api.prepareExampleFileDefaults({exampleId:'lesson-24',nodes:first.data.nodes,workflowId:'library:copied',canonicalDocuments:{[derived]:{content:'existing original clock'}}});assert.equal(copied.ok,true);
 const copiedClock=copied.data.nodes.find(entry=>entry.node.operation==='story-clock');assert.notEqual(copiedClock.node.clockId,derived);
 assert.equal(copied.data.nodes.find(entry=>entry.node.id===triggers[1].node.id).node.clockId,copiedClock.node.clockId);
 assert.equal(copied.data.nodes.find(entry=>entry.node.id===triggers[0].node.id).node.clockId,'managed:authored-other-clock');
 const repeated=api.prepareExampleFileDefaults({exampleId:'lesson-24',nodes:copied.data.nodes,workflowId:'library:copied'});assert.equal(repeated.ok,true);assert.deepEqual(repeated.data.nodes,copied.data.nodes);
});
test('private samples require trusted character choices and retain connected references',()=>{
 const unknown=prepare(29);assert.equal(unknown.ok,true);assert.deepEqual(unknown.data.actorChoices.map(value=>value.label),['Rowan','Iris']);
 assert.equal(unknown.data.nodes.filter(entry=>entry.node.actorScope==='presence'&&entry.node.operation==='read-file').some(entry=>entry.node.fileTarget?.managed),false);
 const bound=prepare(29,{actorBindings:{'character:rowan.png':'character:actual-rowan.png','character:iris.png':'character:actual-iris.png'}});assert.equal(bound.ok,true);
 const readers=bound.data.nodes.filter(entry=>entry.node.operation==='read-file');assert.equal(readers.length,2);
 for(const {node} of readers){assert.equal(node.fileTarget.visibility.kind,'actor-private');assert.match(node.fileTarget.visibility.actorId,/actual-/);assert.equal(JSON.parse(bound.data.initialTemplates[JSON.stringify([bound.data.nodes[0].address.workflowId,[],node.id])]).length,0);}
 for(const {node} of bound.data.nodes.filter(entry=>entry.node.operation==='write-file'))assert.equal(node.destinationMode,'connected');
});
test('public holder samples request familiar character choices and remap only trusted choices',()=>{
 const unknown=prepare(20);assert.equal(unknown.ok,true);assert.deepEqual(unknown.data.actorChoices.map(choice=>choice.label),['Rowan','Iris']);
 const selected=prepare(20,{actorBindings:{'character:rowan.png':'character:Actual.png','character:iris.png':'character:Other.png'}});assert.equal(selected.ok,true);assert.deepEqual(selected.data.actorChoices,[]);
 const seeded=Object.values(selected.data.initialTemplates).map(value=>JSON.parse(value)).find(value=>value['signal-lantern']);assert.equal(seeded['signal-lantern'],'character:Actual.png');
 const strings=JSON.stringify(selected.data.nodes);assert.doesNotMatch(strings,/character:rowan\.png|character:iris\.png/);
 const swapped=prepare(20,{actorBindings:{'character:rowan.png':'character:iris.png','character:iris.png':'character:rowan.png'}});assert.equal(swapped.ok,true);
 assert.equal(JSON.parse(Object.values(swapped.data.initialTemplates)[0])['signal-lantern'],'character:iris.png');
 const cast=swapped.data.nodes.find(entry=>entry.node.id.startsWith('entities-text-'));assert.deepEqual(JSON.parse(cast.node.text).actorIds,['character:iris.png','character:rowan.png']);
 const repeated=api.prepareExampleFileDefaults({exampleId:'lesson-20',nodes:swapped.data.nodes,workflowId:context.workflowId,actorBindings:{'character:rowan.png':'character:iris.png','character:iris.png':'character:rowan.png'}});assert.equal(repeated.ok,true);assert.deepEqual(repeated.data.nodes,swapped.data.nodes);
});
test('sample outcome lineage shares one ledger and structured fixtures retain their authored values',async()=>{
 const graph=installed(27),defaults=api.prepareExampleFileDefaults({exampleId:'lesson-27',nodes:entries(graph),workflowId:context.workflowId});assert.equal(defaults.ok,true);
 const address=nodeId=>({workflowId:graph.id,instancePath:[],nodeId});
 const edges=Object.values(graph.wires).filter(wire=>wire.route==='wire').map(wire=>({from:{...address(wire.from),portId:wire.fromPort},to:{...address(wire.to),portId:wire.toPort}}));
 const managed=await prepareManagedNodeFiles(defaults.data.nodes,{...context,edges,initialTemplates:defaults.data.initialTemplates,fileOwners:defaults.data.fileOwners});assert.equal(managed.ok,true,JSON.stringify(managed));
 const pick=managed.data.nodes.find(node=>node.operation==='random-pick'),commit=managed.data.nodes.find(node=>node.operation==='commit-outcomes'),saved=managed.data.nodes.find(node=>node.operation==='read-file'&&node.targetId===commit.targetId);assert.equal(pick.ledgerId,commit.targetId);assert.equal(pick.fileTarget.bindingId,commit.fileTarget.bindingId);assert.equal(saved.fileTarget.bindingId,commit.fileTarget.bindingId);assert.equal(managed.data.definitions.filter(definition=>definition.name==='wand-outcomes.json').length,1);
 assert.equal(JSON.parse(Object.values(prepare(28).data.initialTemplates)[0]).length,99);
 const relationship=prepare(30,{actorBindings:{'character:rowan.png':'character:R.png','character:iris.png':'character:I.png'}});assert.equal(relationship.ok,true);
 const seeded=Object.values(relationship.data.initialTemplates).map(content=>JSON.parse(content)).find(value=>value.values);assert.deepEqual(seeded.values.map(value=>value.value),[0,0,2,0]);assert.equal(seeded.values.every(value=>value.visibility.actorId==='character:R.png'&&value.subjectId==='character:R.png'&&value.objectId==='character:I.png'),true);
});
test('explicit destinations, existing legacy data and unregistered imports are preserved',()=>{
 const graph=installed(16),nodes=entries(graph),reader=nodes.find(entry=>entry.node.operation==='read-file');
 reader.node.fileTarget={bindingId:'native:chosen',name:'Real.txt',format:'text',missing:'error',visibility:{kind:'hidden'}};
 const result=api.prepareExampleFileDefaults({exampleId:'lesson-16',nodes,workflowId:'library:practice'});assert.equal(result.ok,true);assert.deepEqual(result.data.nodes.find(entry=>entry.node.id===reader.node.id).node,reader.node);assert.deepEqual(result.data.initialTemplates,{});
 const legacy=prepare(16,{legacyDocuments:[{targetId:'campaign-notebook'}]});assert.deepEqual(legacy.data.initialTemplates,{});
 const hidden=entries(installed(16));hidden.find(entry=>entry.node.operation==='read-file').node.fileTarget={managed:true,name:'My hidden notebook',format:'text',visibility:{kind:'hidden'}};
 const preserved=api.prepareExampleFileDefaults({exampleId:'lesson-16',nodes:hidden,workflowId:'library:practice'});assert.equal(preserved.ok,true);assert.equal(preserved.data.nodes.find(entry=>entry.node.operation==='read-file').node.fileTarget.visibility.kind,'hidden');
 const privateNodes=entries(installed(30)),privateReader=privateNodes.find(entry=>entry.node.operation==='read-file');privateReader.node.fileTarget={managed:true,name:'Chosen private state',format:'json',visibility:{kind:'actor-private',actorId:'character:Different.png'}};
 const privateCopy=api.prepareExampleFileDefaults({exampleId:'lesson-30',nodes:privateNodes,workflowId:context.workflowId,actorBindings:{'character:rowan.png':'character:Rowan.png','character:iris.png':'character:Iris.png'}});assert.equal(privateCopy.ok,true);assert.deepEqual(privateCopy.data.nodes.find(entry=>entry.node.id===privateReader.node.id).node,privateReader.node);assert.equal(Object.values(privateCopy.data.initialTemplates).some(content=>content.includes('rowan-toward-iris')),false);
 assert.equal(api.prepareExampleFileDefaults({exampleId:'imported-path',nodes,workflowId:'library:practice'}).ok,false);
});
test('trusted template validation rejects malformed/schema incompatible seeds before allocation',async()=>{
 let calls=0;const entry={node:{id:'clock',operation:'story-clock',fileTarget:{managed:true}},address:{workflowId:'g',instancePath:[],nodeId:'clock'}};
 const key=JSON.stringify(['g',[],'clock']);const result=await prepareManagedNodeFiles([entry],{...context,initialTemplates:{[key]:'{"absoluteMinute":-1}'},access:{ensureManaged:async()=>{calls++;throw Error();}}});assert.equal(result.ok,false);assert.equal(calls,0);
 const schema={node:{id:'s',operation:'read-file',schema:JSON.stringify({type:'array',items:{type:'number'}}),fileTarget:{managed:true,format:'json'}},address:{workflowId:'g',instancePath:[],nodeId:'s'}};
 const invalid=await prepareManagedNodeFiles([schema],{...context,initialTemplates:{[JSON.stringify(['g',[],'s'])]:'["wrong"]'}});assert.equal(invalid.ok,false);
});
test('private managed allocation uses trusted actor scope and public allocation removes actor scope',async()=>{
 let calls=[];const access={ensureManaged:async(definition,controls)=>{calls.push(controls.scope);return {ok:true,data:{...definition,bindingId:'grant'}};}};
 const node={id:'private',operation:'read-file',fileTarget:{managed:true,format:'json',visibility:{kind:'actor-private',actorId:'actor:rowan'}}};
 const denied=await prepareManagedNodeFiles([node],{...context,access});assert.equal(denied.ok,false);assert.equal(calls.length,0);
 const removed=await prepareManagedNodeFiles([node],{...context,actorId:'actor:rowan',isActorAvailable:()=>false,access});assert.equal(removed.ok,false);assert.equal(calls.length,0);
 const allowed=await prepareManagedNodeFiles([node],{...context,actorId:'actor:rowan',access});assert.equal(allowed.ok,true,JSON.stringify(allowed));assert.equal(calls[0].actorId,'actor:rowan');
 const partner=await prepareManagedNodeFiles([node],{...context,actorId:'actor:iris',isActorAvailable:id=>id==='actor:rowan',access});assert.equal(partner.ok,true);assert.equal(calls[1].actorId,'actor:rowan');
 const publicFile=await prepareManagedNodeFiles([{id:'public',operation:'read-file',fileTarget:{managed:true}}],{...context,scope:{...context.scope,actorId:'actor:rowan'},access});assert.equal(publicFile.ok,true);assert.equal(Object.hasOwn(calls[2],'actorId'),false);
});
test('bundled sample reads use actual host backend virtual contents and existing saved bytes win',async()=>{
 const files=new Map(),uploads=[];
 const fetch=async(url,options)=>{
  if(url==='/api/files/upload'){const body=JSON.parse(options.body);uploads.push(body.name);files.set(body.name,Buffer.from(body.data,'base64'));return Response.json({path:'user/files/'+body.name});}
  const bytes=files.get(url.split('/').at(-1));return bytes===undefined?new Response('',{status:404}):new Response(bytes);
 };
 const access=createHostFileAccess({store:createHostFileStore({fetch,getUserId:()=> 'u'}),getUserId:()=> 'u'});assert.equal((await access.ready).ok,true);
 const sample=prepare(16),configured=await prepareManagedNodeFiles(sample.data.nodes,{...context,access,initialTemplates:sample.data.initialTemplates});assert.equal(configured.ok,true,JSON.stringify(configured));
 const definition=configured.data.definitions[0],backend=access.backend([definition],context),loaded=await backend.load(definition.targetId);assert.equal(loaded.ok,true,JSON.stringify(loaded));assert.match(loaded.data.content,/North Harbor/);assert.equal(uploads.some(name=>name.includes('-output-')),false);
 const saved=await backend.compareAndSwap({targetId:definition.targetId,expectedRevision:loaded.data.revision,expectedContent:loaded.data.content,projectedDocument:{format:'text',content:'Accepted personal notebook'},intentId:'accept-notebook',fingerprint:sha256Text('accept-notebook')});assert.equal(saved.ok,true,JSON.stringify(saved));
 const reconfigured=await prepareManagedNodeFiles(sample.data.nodes,{...context,access,initialTemplates:sample.data.initialTemplates});assert.equal(reconfigured.ok,true);const reread=await access.backend(reconfigured.data.definitions,context).load(definition.targetId);assert.equal(reread.data.content,'Accepted personal notebook');
});
test('lesson setup describes automatic practice files and has no removed global manager instructions',()=>{
 const text=JSON.stringify(REMASTERED_WORKFLOW_EXAMPLE_DATA.map(entry=>entry.lesson));
 assert.doesNotMatch(text,/Workflow [→›] Configure [→›] Workflow Data|Logical target ID|Save authorization|Paste.*Initial template/);
 assert.match(JSON.stringify(REMASTERED_WORKFLOW_EXAMPLE_DATA[15].lesson),/automatically/);
 assert.match(JSON.stringify(REMASTERED_WORKFLOW_EXAMPLE_DATA[28].lesson),/character.*name|name.*character/i);
});
test('generic managed Pick traverses typed For Each output to its commit without sample metadata',async()=>{
 const address=nodeId=>({workflowId:'generic',instancePath:[],nodeId});
 const nodes=[{id:'pick',operation:'random-pick',fileTarget:{managed:true}},{id:'each',operation:'for-each'},{id:'commit',operation:'commit-outcomes',fileTarget:{managed:true}}].map(node=>({node,address:address(node.id)}));
 const edge=(from,to,portId)=>({from:{...address(from),portId:'out'},to:{...address(to),portId}});
 const result=await prepareManagedNodeFiles(nodes,{...context,edges:[edge('pick','each','in'),edge('each','commit','outcomes')]});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.data.nodes[0].ledgerId,result.data.nodes[2].targetId);assert.equal(result.data.definitions.length,1);
});
test('sample ownership cannot alias explicit authority or incompatible private scope',async()=>{
 const address=nodeId=>({workflowId:'g',instancePath:[],nodeId}),sourceKey=JSON.stringify(['g',[],'read']);let allocations=0;
 const access={ensureManaged:async()=>{allocations++;throw Error('Invalid aliases allocate nothing');}};
 const managed={id:'read',operation:'read-file',fileTarget:{managed:true,format:'json'}},owner={id:'commit',operation:'commit-outcomes',fileTarget:{managed:true,format:'json'}};
 for(const override of [undefined,{bindingId:'imported',name:'Chosen.json',format:'json',missing:'create',content:'[]',visibility:{kind:'public'}},{managed:true,format:'json',visibility:{kind:'actor-private',actorId:'private'}}]){
  const nodes=[{node:managed,address:address('read')},...(override===undefined?[]:[{node:{...owner,fileTarget:override},address:address('commit')}])];
  const result=await prepareManagedNodeFiles(nodes,{...context,access,fileOwners:{[sourceKey]:address('commit')}});assert.equal(result.ok,false);assert.equal(allocations,0);
 }
});
test('registered wand sample reads and accepts one shared outcome ledger across a full controller reload',async()=>{
 const files=new Map(),uploads=[];const user='default-user';
 const fetch=async(url,options)=>{if(url==='/api/files/upload'){const body=JSON.parse(options.body);uploads.push(body.name);files.set(body.name,Buffer.from(body.data,'base64'));return Response.json({path:'user/files/'+body.name});}const bytes=files.get(url.split('/').at(-1));return bytes===undefined?new Response('',{status:404}):new Response(bytes);};
 const createAccess=()=>createHostFileAccess({store:createHostFileStore({fetch,getUserId:()=>user}),getUserId:()=>user});
 const graph=installed(27),player='Rowan uses the broken wand.';let draws=0;
 const response=value=>({ok:true,data:{text:typeof value==='string'?value:JSON.stringify(value),finish:'stop'}});
 const origin={exampleId:'lesson-27',actorBindings:{'character:rowan.png':'character:rowan.png','character:iris.png':'character:iris.png'}};
 const request=async options=>{const material=JSON.parse(options.messages[1].content);if(options.messages[0].content.startsWith('Revise'))return response(material.draft);if(options.messages[0].content.startsWith('Evaluate'))return response({answers:{actual:{type:'noul',accepted:true}}});return response({candidates:[{eventType:'item-used',actorId:'character:rowan.png',itemId:'broken-wand',position:{start:0,end:player.length},semantics:'actual'}]});};
 const create=access=>unifiedRecipeHost(graph,{playerText:player,configureContext:c=>{c.characters=[{avatar:'rowan.png',data:{name:'Rowan'}},{avatar:'iris.png',data:{name:'Iris'}}];},random:()=>{draws++;return .1;},request,ports:{nodeFileAccess:access,getWorkflowIdentity:()=> 'library:wand-practice',getExampleFileOrigin:()=>origin}});
 for(let iteration=0;iteration<2;iteration++){
  const access=createAccess(),host=create(access);try{
   const result=await host.generate('Blue sparks replace the spell.');assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(draws,1);
   if(iteration===0)assert.equal(uploads.some(name=>name.includes('-output-')),false,'configuration and preview do not write output bytes');
   const applied=await host.controller.apply(result.reviewHandles[0]);assert.equal(applied.ok,true,JSON.stringify(applied.error));
   const defaults=api.prepareExampleFileDefaults({exampleId:'lesson-27',nodes:entries(graph),workflowId:'library:wand-practice',actorBindings:origin.actorBindings});
   const prepared=await prepareManagedNodeFiles(defaults.data.nodes,{...context,workflowId:'library:wand-practice',scope:{userId:user,chatId:'Story-2'},access,initialTemplates:defaults.data.initialTemplates,fileOwners:defaults.data.fileOwners});assert.equal(prepared.ok,true,JSON.stringify(prepared));
   const outcome=prepared.data.definitions.find(definition=>definition.name==='wand-outcomes.json'),loaded=await access.backend([outcome],{scope:{userId:user,chatId:'Story-2'},isCurrent:()=>true}).load(outcome.targetId);assert.equal(loaded.ok,true,JSON.stringify(loaded));const saved=JSON.parse(loaded.data.content);assert.equal(saved.length,1);assert.equal(saved[0].acceptance,'accepted');
  }finally{host.controller.dispose();}
 }
 assert.equal(draws,1);
});
