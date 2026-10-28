import assert from 'node:assert/strict';
import test from 'node:test';
import { operationDefaults } from '../src/workflow/catalog.js?v=0.29.0';
import { validateNodeFileTarget } from '../src/workflow/node-file-targets.js?v=0.29.0';
import { describeFileNode } from '../src/workflow/operations/file-nodes.js?v=0.29.0';
const policy=await import('../src/workflow/managed-file-policy.js?v=0.29.0').catch(()=>({}));
test('managed names retain interior periods and exactly one safe format suffix',()=>{
 assert.equal(typeof policy.canonicalFileName,'function');
 assert.equal(policy.canonicalFileName('SceneContext.txt','text'),'SceneContext.txt');
 assert.equal(policy.canonicalFileName('Scene.v2.txt.txt','text'),'Scene.v2.txt');
 assert.equal(policy.canonicalFileName('../CON.json','json'),'_CON.json');
});
test('managed format follows declared serialization and schema rather than output text',()=>{
 assert.equal(typeof policy.inferManagedFileFormat,'function');
 assert.equal(policy.inferManagedFileFormat({operation:'write-file'},{inputFormat:'markdown'}),'markdown');
 assert.equal(policy.inferManagedFileFormat({operation:'write-file'},{inputKind:'data'}),'json');
 const schema=JSON.stringify({type:'object',required:['scene'],properties:{scene:{type:'string',minLength:1}}});
 const resolved=policy.resolveManagedFileNode({id:'w',operation:'write-file',destinationMode:'own',schema,fileTarget:{managed:true}},{workflowId:'trusted'});
 assert.equal(resolved.ok,true,JSON.stringify(resolved));
 assert.equal(resolved.data.definition.format,'json');
 assert.deepEqual(JSON.parse(resolved.data.definition.content),{scene:' '});
});
test('declared CSV serialization supplies the initial header and reader columns',()=>{
 const resolved=policy.resolveManagedFileNode({id:'w',operation:'write-file',destinationMode:'own',columns:[],fileTarget:{managed:true}},{workflowId:'trusted',inputFormat:'csv',inputColumns:['scene','status']});
 assert.equal(resolved.ok,true,JSON.stringify(resolved));
 assert.equal(resolved.data.definition.content,'"scene","status"\r\n');
 assert.deepEqual(resolved.data.node.columns,['scene','status']);
 assert.equal(policy.resolveManagedFileNode({id:'w',operation:'write-file',destinationMode:'own',fileTarget:{managed:true,format:'csv'}},{workflowId:'trusted'}).ok,false);
});
test('new outputs own a managed replace destination while legacy omitted mode stays connected',()=>{
 const node={id:'new',type:'workflow',...operationDefaults('write-file',{managedFiles:true})};
 assert.equal(node.destinationMode,'own');
 assert.equal(node.fileHandling,'replace');
 assert.deepEqual(node.fileTarget,{managed:true});
 assert.equal(validateNodeFileTarget({managed:true}).ok,true);
 assert.equal(describeFileNode(node,{authoring:true}).data.setupIssues.length,0);
 const legacy=describeFileNode({id:'old',type:'workflow',operation:'write-file'},{authoring:true});
 assert.equal(legacy.data.ports.find(port=>port.id==='reference').required,true);
});
test('new external readers request a real source instead of inventing empty notes',()=>{
 const reader={id:'read',type:'workflow',...operationDefaults('read-file',{managedFiles:true})};
 assert.equal(reader.fileTarget?.managed,undefined);
 const described=describeFileNode(reader,{authoring:true});
 assert.equal(described.ok,true,JSON.stringify(described));
 assert.equal(described.data.setupIssues.some(issue=>issue.code==='FILE_SETUP_REQUIRED'),true);
});
test('trusted preparation allocates bindings for owned writers and state without output writes',async()=>{
 assert.equal(typeof policy.prepareManagedNodeFiles,'function');
 const nodes=[{id:'write',operation:'write-file',destinationMode:'own',fileTarget:{managed:true}},{id:'outcomes',operation:'commit-outcomes',fileTarget:{managed:true}},{id:'clock',operation:'story-clock',fileTarget:{managed:true}}];
 const trustedControls=[];
 const prepared=await policy.prepareManagedNodeFiles(nodes,{workflowId:'library:one',scope:{userId:'u',chatId:'c'},isCurrent:()=>true,access:{ensureManaged:async(definition,controls)=>{trustedControls.push(controls);return {ok:true,data:{...definition,bindingId:'host:'+definition.targetId}};}}});
 assert.equal(prepared.ok,true,JSON.stringify(prepared));
 assert.equal(prepared.data.definitions.length,3);
 assert.equal(trustedControls.length,3);assert.equal(trustedControls.every(controls=>controls.managed===true&&controls.scope.userId==='u'&&controls.isCurrent()===true),true);
 assert.equal(prepared.data.nodes[0].destinationMode,'own');
 assert.equal(prepared.data.nodes[0].fileTarget.bindingId.startsWith('host:'),true);
 assert.equal(prepared.data.nodes[1].fileTarget.content,'[]');
 assert.deepEqual(nodes[0].fileTarget,{managed:true});
});
test('connected managed outcome picks share their commit ledger and ambiguous sinks allocate nothing',async()=>{
 const address=nodeId=>({workflowId:'authored',instancePath:[],nodeId});
 const entries=['pick','commit','other'].map(id=>({node:{id,operation:id==='pick'?'random-pick':'commit-outcomes',fileTarget:{managed:true}},address:address(id)}));
 let allocated=0;
 const context={workflowId:'trusted',scope:{userId:'u',chatId:'c'},isCurrent:()=>true,access:{ensureManaged:async definition=>{allocated++;return {ok:true,data:{...definition,bindingId:definition.targetId}};}}};
 const edge=to=>({from:{...address('pick'),portId:'out'},to:{...address(to),portId:'outcomes'}});
 const prepared=await policy.prepareManagedNodeFiles(entries.slice(0,2),{...context,edges:[edge('commit')]});
 assert.equal(prepared.ok,true,JSON.stringify(prepared));
 assert.equal(prepared.data.nodes[0].ledgerId,prepared.data.nodes[1].targetId);
 assert.equal(prepared.data.definitions.length,1);
 allocated=0;
 const ambiguous=await policy.prepareManagedNodeFiles(entries,{...context,edges:[edge('commit'),edge('other')]});
 assert.equal(ambiguous.ok,false);
 assert.equal(ambiguous.error.code,'MANAGED_OUTCOME_AMBIGUOUS');
 assert.equal(allocated,0);
});
test('mixed outcome lineage inherits only authorized existing file scope and rejects unresolved sinks before allocation',async()=>{
 const address=nodeId=>({workflowId:'authored',instancePath:[],nodeId});
 const fileTarget={bindingId:'checked-existing-binding',name:'Mara outcomes.json',format:'json',missing:'error',content:'[]',visibility:{kind:'actor-private',actorId:'mara'}};
 const entries=[{node:{id:'pick',operation:'random-pick',fileTarget:{managed:true}},address:address('pick')},{node:{id:'commit',operation:'commit-outcomes',targetId:'existing',fileTarget},address:address('commit')}];
 let allocations=0;
 const context={workflowId:'trusted',scope:{userId:'u',chatId:'c'},edges:[{from:{...address('pick'),portId:'out'},to:{...address('commit'),portId:'outcomes'}}],isCurrent:()=>true,access:{ensureManaged:async()=>{allocations++;throw Error('Existing authority must not allocate a managed file.');}}};
 const authorized=await policy.prepareManagedNodeFiles(entries,{...context,authorizedDefinitions:[{targetId:'existing',...fileTarget}]});
 assert.equal(authorized.ok,true,JSON.stringify(authorized));
 assert.equal(authorized.data.nodes[0].ledgerId,'existing');
 assert.deepEqual(authorized.data.nodes[0].fileTarget,fileTarget);
 assert.deepEqual(authorized.data.definitions,[]);
 const unresolved=await policy.prepareManagedNodeFiles(entries,context);
 assert.equal(unresolved.error.code,'FILE_SETUP_REQUIRED');
 const imported=await policy.prepareManagedNodeFiles(entries,{...context,authorizedDefinitions:[{targetId:'existing',...fileTarget,bindingId:'different-binding'}],legacyDocuments:[{targetId:'existing',format:'json',content:'[]',visibility:{kind:'public'}}]});
 assert.equal(imported.error.code,'FILE_SETUP_REQUIRED');
 const other={node:{id:'other',operation:'commit-outcomes',fileTarget:{managed:true}},address:address('other')};
 const conflicting=await policy.prepareManagedNodeFiles([...entries,other],{...context,authorizedDefinitions:[{targetId:'existing',...fileTarget}],edges:[...context.edges,{from:{...address('pick'),portId:'out'},to:{...address('other'),portId:'outcomes'}}]});
 assert.equal(conflicting.error.code,'MANAGED_OUTCOME_AMBIGUOUS');
 assert.equal(allocations,0);
});
test('managed policy cannot redirect connected references or widen imported actor authority',()=>{
 for(const fileTarget of [{managed:true,bindingId:'imported'},{managed:true,path:'/private'},{managed:true,visibility:{kind:'public'}}]){
  const result=policy.resolveManagedFileNode({id:'w',operation:'write-file',destinationMode:'own',actorScope:'presence',actorId:'mara',fileTarget},{workflowId:'trusted',address:{nodeId:'w',instancePath:[]}});
  assert.equal(result.ok,false);
 }
 const connected={id:'w',operation:'write-file'};
 assert.deepEqual(policy.resolveManagedFileNode(connected,{workflowId:'trusted'}).data.node,connected);
 assert.equal(policy.resolveManagedFileNode({...connected,fileTarget:{managed:true}},{workflowId:'trusted'}).ok,false);
 const privateFile=actorId=>policy.resolveManagedFileNode({id:'w',operation:'write-file',destinationMode:'own',actorScope:'presence',actorId,fileTarget:{managed:true}},{workflowId:'trusted'});
 assert.notEqual(privateFile('mara').data.definition.targetId,privateFile('laya').data.definition.targetId);
});
test('managed policy derives independent bounded ownership and valid clock JSON without changing authoring',()=>{
 assert.equal(typeof policy.resolveManagedFileNode,'function');
 const node={id:'clock',operation:'story-clock',title:'Story',fileTarget:{managed:true}};
 const context={workflowId:'trusted-library:one',address:{workflowId:'ignored',instancePath:['helper'],nodeId:'clock'}};
 const resolved=policy.resolveManagedFileNode(node,context);
 assert.equal(resolved.ok,true,JSON.stringify(resolved));
 const {definition}=resolved.data;
 assert.equal(definition.format,'json');
 assert.equal(JSON.parse(definition.content).clockId,definition.targetId);
 assert.equal(JSON.parse(definition.content).revision,1);
 assert.equal(definition.targetId.length<=128,true);
 assert.equal(policy.resolveManagedFileNode({...node,title:'Renamed'},context).data.definition.targetId,definition.targetId);
 assert.notEqual(policy.resolveManagedFileNode(node,{...context,workflowId:'trusted-library:two'}).data.definition.targetId,definition.targetId);
 assert.notEqual(policy.resolveManagedFileNode(node,{...context,address:{...context.address,instancePath:['other']}}).data.definition.targetId,definition.targetId);
 assert.deepEqual(node.fileTarget,{managed:true});
});
