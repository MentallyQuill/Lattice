import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeFixture,reviewGraph} from './helpers/native-workflow-fixture.mjs';
import {ACTIVE_PROFILE_ID} from '../src/workflow/model-profiles.js?v=0.30.0';
import {computeDefinitionIdentity,definitionRefKey} from '../src/workflow/definition-data.js?v=0.30.0';

function graph({writer=false,runtime=2}={}){
 const value=reviewGraph({revise:false});value.runtime=runtime;value.schema=runtime===3?4:3;
 value.nodes.read={id:'read',type:'workflow',operation:'read-file',targetId:'',fileTarget:{managed:true},initialization:'generate'};
 value.nodes.guide={id:'guide',type:'workflow',operation:'compose',outputKind:'guidance',sections:[{name:'notes',text:'',kind:'text',required:true}]};
 value.wires.notes={id:'notes',route:'wire',from:'read',fromPort:'text',to:'guide',toPort:'section.notes'};
 value.wires.guide={id:'guide',route:'wire',from:'guide',fromPort:'out',to:'generate',toPort:'guidance'};
 if(writer){
  value.nodes.write={id:'write',type:'workflow',operation:'write-file',mode:'add',destinationMode:'connected'};
  value.nodes.add={id:'add',type:'workflow',operation:'text',text:'[{"fact":"The door opens."}]'};
  value.nodes.decode={id:'decode',type:'workflow',operation:'json-decode'};
  for(const [id,from,fromPort,to,toPort]of [['ref','read','reference','write','reference'],['add','add','out','decode','in'],['records','decode','out','write','records']])value.wires[id]={id,route:'wire',from,fromPort,to,toPort};
  value.runTargets.push({instancePath:[],nodeId:'write'});
 }
 return value;
}
function fixture(value=graph(),options={}){
 const stored=new Map(),definitions=[];let writes=0,bindings=0;
 const access={ready:options.ready??Promise.resolve(),ensureManaged:async definition=>{definitions.push(definition);return {ok:true,data:{...definition,bindingId:definition.targetId,storage:'host'}};},backend:defs=>({
  async load(targetId){const definition=defs.find(item=>item.targetId===targetId);return {ok:true,data:structuredClone(stored.get(targetId)??{targetId,revision:Object.hasOwn(options,'existingContent')?'existing:1':'missing:seed',format:definition.format,content:options.existingContent??definition.content,receipts:[]})};},
  async lookupHistory(){return {ok:true,data:{epoch:0,receipt:null,outcomes:[],clockTurn:null,privateActorIds:[],visibility:{kind:'public'}}};},
  async compareAndSwap(update){const current=stored.get(update.targetId)??{revision:'missing:seed',content:defs.find(item=>item.targetId===update.targetId).content};if(current.revision!==update.expectedRevision||current.content!==update.expectedContent)return {ok:false,error:{code:'FILE_REVISION_CONFLICT',message:'Changed'}};writes++;const revision='saved:'+writes;stored.set(update.targetId,{targetId:update.targetId,format:'json',...update.projectedDocument,revision,receipts:[{intentId:update.intentId,fingerprint:update.fingerprint,revision}],...(update.sourceBinding?{sourceBinding:update.sourceBinding}:{})});return {ok:true,data:{applied:true,acknowledged:true,revision}};}
 })};
 const f=nativeFixture(value,{resolveBinding:()=>{bindings++;return {ok:true,data:{profileId:'test',model:'fixture'}};},...options,ports:{getWorkflowIdentity:()=> 'initialization-test',nodeFileAccess:access,persistenceVerifier:{saveAndVerify:async()=>({ok:true,data:{acknowledged:true}}),verify:async()=>({ok:true,data:{acknowledged:true}})},...options.ports},request:options.request??(async()=>({ok:true,data:{text:'["Mara carries a wand."]',finish:'stop'}}))});
 f.c.chatMetadata={};f.c.characters[1].data.description='Mara is a careful witch.';
 return {...f,stored,definitions,writes:()=>writes,bindings:()=>bindings};
}

test('first-use initialization is admitted once, remains virtual, and persists only on acceptance',async()=>{
 let request;const f=fixture(graph(),{request:async options=>{request=options;return {ok:true,data:{text:'["Mara carries a wand."]',finish:'stop'}};}});
 try{
  const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));
  assert.equal(result.actualCalls,1);assert.equal(result.callBound,1);assert.ok(f.bindings()>0);assert.equal(f.writes(),0);
  assert.match(JSON.stringify(request.messages),/Hello/);assert.match(JSON.stringify(request.messages),/careful witch/);
  assert.equal(f.stored.size,0);assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);
  assert.equal(f.writes(),1);assert.deepEqual(JSON.parse([...f.stored.values()][0].content),['Mara carries a wand.']);
  const bindingCount=f.bindings(),second=await f.controller.runTarget(graph(),{workflowId:'host-review',instancePath:[],nodeId:'read',portId:'text'});assert.equal(second.ok,true,JSON.stringify(second.error));assert.equal(second.actualCalls,0);assert.equal(f.bindings(),bindingCount);assert.equal(f.writes(),1);
 }finally{f.controller.dispose();}
});

test('an empty generated seed is still created once at acceptance',async()=>{
 const value=graph(),f=fixture(value,{request:async()=>({ok:true,data:{text:'[]',finish:'stop'}})});
 try{
  const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(f.writes(),0);
  const applied=await f.controller.apply(result.reviewHandles[0]);assert.equal(applied.ok,true,JSON.stringify(applied.error));assert.equal(f.writes(),1);
  const repeated=await f.controller.runTarget(value,{workflowId:value.id,instancePath:[],nodeId:'read',portId:'text'});assert.equal(repeated.actualCalls,0);
 }finally{f.controller.dispose();}
});

test('template initialization persists a valid seed at acceptance without model binding',async()=>{
 const value=graph();value.nodes.read.initialization='template';const f=fixture(value,{request:async()=>assert.fail('Templates cannot call a model')});
 try{const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,0);assert.equal(f.bindings(),0);assert.equal(f.writes(),0);assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(f.writes(),1);assert.equal([...f.stored.values()][0].content,'[]');}finally{f.controller.dispose();}
});

test('a connected writer composes with the generated virtual seed and owns one accepted write',async()=>{
 const f=fixture(graph({writer:true}),{request:async()=>({ok:true,data:{text:'[{"fact":"Mara carries a wand."}]',finish:'stop'}})});
 try{const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,1);assert.equal(f.writes(),0);const applied=await f.controller.apply(result.reviewHandles[0]);assert.equal(applied.ok,true,JSON.stringify(applied.error));assert.equal(f.writes(),1);assert.deepEqual(JSON.parse([...f.stored.values()][0].content),[{fact:'Mara carries a wand.'},{fact:'The door opens.'}]);}finally{f.controller.dispose();}
});

test('an old reader with no profile binding initializes through the active profile',async()=>{
 const value=graph();value.roles={};Object.assign(value.nodes.read,{modelRole:null,profileId:null,model:null});let bindingNode;
 const f=fixture(value,{resolveBinding:node=>{bindingNode=node;return {ok:true,data:{profileId:'test',model:'fixture'}};}});
 try{const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(bindingNode.profileId,ACTIVE_PROFILE_ID);assert.equal(bindingNode.modelRole,'Prose');}finally{f.controller.dispose();}
});

test('initialization leaves an explicit named role available to its host binding resolver',async()=>{
 const value=graph();value.roles={};Object.assign(value.nodes.read,{modelRole:'Archivist',profileId:null,model:null});let requested;
 const role={profileId:'archive-profile',model:'archive-model'};
 const f=fixture(value,{resolveBinding:node=>({ok:true,data:{profileId:node.profileId??role.profileId,model:node.model??role.model}}),request:async options=>{requested=options.binding;return {ok:true,data:{text:'[]',finish:'stop'}};}});
 try{const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(requested,role);}finally{f.controller.dispose();}
});

test('initialization requests use the actual inherited role profile and model',async()=>{
 const value=graph();value.roles={Archivist:{profileId:'inherited-profile',model:'inherited-model'}};Object.assign(value.nodes.read,{modelRole:'Archivist',profileId:null,model:null});let requested;
 const f=fixture(value,{resolveBinding:node=>({ok:true,data:{profileId:node.profileId,model:node.model}}),request:async options=>{requested=options.binding;return {ok:true,data:{text:'[]',finish:'stop'}};}});
 try{const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.deepEqual(requested,value.roles.Archivist);}finally{f.controller.dispose();}
});

test('rejection and target preview discard generated documents without persistence',async()=>{
 const value=graph(),f=fixture(value);
 try{const preview=await f.controller.runTarget(value,{workflowId:value.id,instancePath:[],nodeId:'read',portId:'text'});assert.equal(preview.ok,true,JSON.stringify(preview.error));assert.equal(preview.actualCalls,1);assert.equal(f.writes(),0);assert.equal(f.stored.size,0);const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(f.controller.reject(result.reviewHandles[0]).ok,true);assert.equal(f.writes(),0);assert.equal(f.stored.size,0);}finally{f.controller.dispose();}
});

for(const [format,content,ok]of [['json','[]',true],['json','',false],['json','malformed',false],['text','',true]])test(`existing ${format} file ${JSON.stringify(content)} never initializes or binds`,async()=>{
 const value=graph();value.nodes.read.fileTarget.format=format;const f=fixture(value,{existingContent:content,request:async()=>assert.fail('Existing files cannot initialize')});
 try{const result=await f.generate();assert.equal(result.ok,ok,JSON.stringify(result.error));assert.equal(result.actualCalls,0);assert.equal(f.bindings(),0);assert.equal(f.writes(),0);if(ok)assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(f.writes(),0);}finally{f.controller.dispose();}
});

for(const mutation of ['chat','character','file'])test(`${mutation} changes during initialization prevent publication`,async()=>{
 let f;f=fixture(graph(),{request:async()=>{if(mutation==='chat')f.c.chat[0].mes='Changed source';else if(mutation==='character')f.c.characters[1].data.description='Changed character';else{const definition=f.definitions[0];f.stored.set(definition.targetId,{targetId:definition.targetId,revision:'external:1',format:definition.format,content:'["External"]',receipts:[]});}return {ok:true,data:{text:'[]',finish:'stop'}};}});
 try{const result=await f.generate();assert.equal(result.ok,false);assert.match(result.error.code,/STALE|FILE_REVISION/);assert.equal(f.writes(),0);assert.equal(result.reviewHandles?.length??0,0);}finally{f.controller.dispose();}
});

for(const reason of ['invalid','cancel'])test(`${reason} initialization leaves no story bytes`,async()=>{
 let f;f=fixture(graph(),{request:async()=>{if(reason==='cancel')f.controller.cancel();return {ok:true,data:{text:reason==='invalid'?'invalid json':'[]',finish:'stop'}};}});
 try{const result=await f.generate();assert.equal(result.ok,false);assert.equal(f.writes(),0);assert.equal(f.stored.size,0);assert.equal(result.reviewHandles?.length??0,0);}finally{f.controller.dispose();}
});

test('runtime 3 initializes from its authorized bounded source reader',async()=>{
 const f=fixture(graph({runtime:3}));
 try{const reply=f.c.chat.pop();assert.equal((await f.controller.setupSources()).ok,true);f.c.chat.push(reply);const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,1);assert.equal(f.writes(),0);assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(f.writes(),1);}finally{f.controller.dispose();}
});

test('public initialization excludes private character facts from its request',async()=>{
 let request;const f=fixture(graph(),{request:async options=>{request=options;return {ok:true,data:{text:'[]',finish:'stop'}};}});
 f.c.characters[1].data.visibility={kind:'actor-private',actorId:'character:fixture.png'};
 try{const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.doesNotMatch(JSON.stringify(request.messages),/careful witch/);assert.match(JSON.stringify(request.messages),/Hello/);}finally{f.controller.dispose();}
});

test('a private managed reader retains its selected actor context for model authorization',async()=>{
 const value=graph();value.nodes.read.fileTarget.visibility={kind:'actor-private',actorId:'character:fixture.png'};let request;
 const f=fixture(value,{request:async options=>{request=options;return {ok:true,data:{text:'[]',finish:'stop'}};}});f.c.characters[1].data.visibility={kind:'actor-private',actorId:'character:fixture.png'};
 try{const result=await f.controller.runTarget(value,{workflowId:value.id,instancePath:[],nodeId:'read',portId:'text'});assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,1);assert.match(JSON.stringify(request.messages),/careful witch/);assert.equal(f.writes(),0);}finally{f.controller.dispose();}
});

test('presence initialization uses the exact partner actor card and excludes selected actor secrets',async()=>{
 const value=graph({writer:true}),actorId='character:other.png';
 delete value.nodes.guide;delete value.wires.notes;delete value.wires.guide;
 Object.assign(value.nodes.read,{actorScope:'presence',actorId,phase:'post'});Object.assign(value.nodes.write,{actorScope:'presence',actorId});
 value.nodes.scopeText={id:'scopeText',type:'workflow',operation:'text',text:JSON.stringify({sourceId:'authored',revision:'authored',sceneId:'one',visibility:'public'}),phase:'post'};
 value.nodes.scope={id:'scope',type:'workflow',operation:'json-decode',phase:'post'};
 value.nodes.source={id:'source',type:'workflow',operation:'draft-event-source'};
 value.nodes.castPrompt={id:'castPrompt',type:'workflow',operation:'text',text:'Return actual participating actors.',phase:'post'};
 value.nodes.cast={id:'cast',type:'workflow',operation:'model-call',outputKind:'data',phase:'post'};
 value.nodes.presence={id:'presence',type:'workflow',operation:'scene-presence',actorId,phase:'post'};
 for(const [id,from,fromPort,to,toPort]of [['scopeText','scopeText','out','scope','in'],['scope','scope','out','source','scope'],['sourceDraft','generate','draft','source','in'],['source','source','out','cast','data'],['prompt','castPrompt','out','cast','prompt'],['cast','cast','out','presence','in'],['readPresence','presence','out','read','presence'],['writePresence','presence','out','write','presence']])value.wires[id]={id,route:'wire',from,fromPort,to,toPort};
 let initialization;const f=fixture(value,{request:async options=>{
  const material=JSON.parse(options.messages.at(-1).content);
  if(material.data?.watch==='draft'){const source=material.data;return {ok:true,data:{text:JSON.stringify({sceneId:source.sceneId,sourceId:source.sourceId,revision:source.revision,actors:[{actorId,status:'present',evidence:source.text}]}),finish:'stop'}};}
  initialization=JSON.stringify(options.messages);return {ok:true,data:{text:'[]',finish:'stop'}};
 }});
 f.c.characters[0].data={name:'Other',description:'Other private secret',visibility:{kind:'actor-private',actorId}};f.c.characters[1].data.visibility={kind:'actor-private',actorId:'character:fixture.png'};
 try{const result=await f.generate();assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.actualCalls,2);assert.match(initialization,/Other private secret/);assert.doesNotMatch(initialization,/careful witch|We delve/);assert.equal(f.writes(),0);assert.equal((await f.controller.apply(result.reviewHandles[0])).ok,true);assert.equal(f.writes(),1);}finally{f.controller.dispose();}
});

test('canonical data appearing during reader readiness revokes automatic adoption before allocation',async()=>{
 const value=graph();Object.assign(value.nodes.read,{targetId:'old-notes',fileTarget:{}});let f;
 f=fixture(value,{ready:{then(resolve){f.c.chatMetadata.latticeDocuments={'default-user':{'old-notes':{content:'Preserve restored canonical data'}}};resolve();}}});
 try{const result=await f.generate();assert.equal(result.ok,false);assert.equal(result.error.code,'STALE_FILE_SCOPE');assert.equal(f.definitions.length,0);assert.equal(result.actualCalls,0);assert.equal(f.writes(),0);assert.equal(f.c.chatMetadata.latticeDocuments['default-user']['old-notes'].content,'Preserve restored canonical data');}finally{f.controller.dispose();}
});

test('nested reader preparation never inherits a same-ID root writer schema on its second pass',async()=>{
 const value=graph({writer:true});Object.assign(value.nodes.write,{schema:JSON.stringify({type:'object',properties:{fact:{type:'string'}},required:['fact']}),collectionPath:'/rootOnly'});
 const draft={id:'nested-reader',version:1,name:'Nested reader',interface:[],parameters:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{read:{id:'read',type:'workflow',operation:'read-file',initialization:'template',fileTarget:{managed:true}}},wires:{}}};
 const checked=computeDefinitionIdentity(draft);assert.equal(checked.ok,true,JSON.stringify(checked.error));const definition={...checked.data.materializedDefinition,semanticHash:checked.data.semanticHash};
 value.nodes.nested={id:'nested',type:'subgraph',definition:{id:definition.id,version:definition.version,semanticHash:definition.semanticHash}};value.definitions={[definitionRefKey(definition)]:definition};const f=fixture(value);
 try{const result=await f.controller.runTarget(value,{workflowId:value.id,instancePath:['nested'],nodeId:'read',portId:'text'});assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(f.definitions.length,1);assert.equal(f.definitions[0].content,'[]');assert.equal(result.actualCalls,0);}finally{f.controller.dispose();}
});
