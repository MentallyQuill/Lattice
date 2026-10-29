import assert from 'node:assert/strict';
import test from 'node:test';
import { operationDefaults, operationFor } from '../src/workflow/catalog.js?v=0.30.3';
import { describeFileNode, executeFileNode } from '../src/workflow/operations/file-nodes.js?v=0.30.3';
import { createFileStore } from '../src/workflow/file-store.js?v=0.30.3';
import { resolveManagedFileNode } from '../src/workflow/managed-file-policy.js?v=0.30.3';
import { prepareWorkflowAttempt } from '../src/workflow/resolve.js?v=0.30.3';
import { exportWorkflow, parseWorkflow } from '../src/workflow/packages.js?v=0.30.3';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definition-data.js?v=0.30.3';
import { prepareDocumentMutation } from '../src/workflow/operations/document-mutations.js?v=0.30.3';
const initialization=await import('../src/workflow/file-initialization.js?v=0.30.3').catch(()=>({}));

test('Read File registers bounded first-use generation and a managed reader default', () => {
    const node={id:'read',type:'workflow',...operationDefaults('read-file',{managedFiles:true})};
    assert.deepEqual(node.fileTarget,{managed:true});
    const described=describeFileNode(node);
    assert.equal(described.ok,true,JSON.stringify(described));
    assert.equal(described.data.descriptor.defaults.initialization,'generate');
    assert.equal(described.data.descriptor.requestBound,1);
    assert.equal(described.data.descriptor.modelRole,'Prose');
    assert.equal(described.data.descriptor.requestCapability,'text-completion');
    assert.equal(described.data.ports.find(port=>port.id==='context').kind,'context');
    for(const initialization of ['template','require-file']) {
        const descriptor=operationFor({...node,initialization});
        assert.equal(descriptor.requestBound,0);
        assert.equal(descriptor.modelRole,null);
        assert.equal(descriptor.requestCapability,undefined);
    }
    for(const controls of [{initialization:'bad'},{initializationInstructions:'x'.repeat(10001)},{initializationMaxTokens:0},{initializationMaxTokens:65537},{initializationMaxTokens:1.5}])assert.equal(describeFileNode({...node,...controls}).ok,false);
    assert.equal(operationDefaults('read-file').fileTarget,undefined);
    const ordinary=operationDefaults('read-file');
    assert.equal(ordinary.modelRole,null);
    assert.equal(ordinary.profileId,null);
    for(const key of ['initialization','initializationInstructions','initializationMaxTokens'])assert.equal(Object.hasOwn(ordinary,key),false);
    const legacyDescription=describeFileNode({id:'ordinary',type:'workflow',...ordinary});
    assert.equal(legacyDescription.data.descriptor.requestBound,0);
    assert.equal(legacyDescription.data.ports.some(port=>port.id==='context'),false);
});

test('unbound readers adopt schema-valid managed seeds and reuse actual existing catalog authority', () => {
    assert.equal(typeof initialization.prepareUnboundReader,'function');
    const schema=JSON.stringify({type:'object',required:['people','scene'],properties:{people:{type:'array',items:{type:'object'}},scene:{type:'string'}}});
    const node={id:'read',type:'workflow',operation:'read-file',targetId:'story',schema};
    const prepared=initialization.prepareUnboundReader(node);
    assert.equal(prepared.fileTarget.managed,true);
    assert.equal(prepared.fileTarget.missing,'create');
    const managed=resolveManagedFileNode(prepared,{workflowId:'trusted'});
    assert.equal(managed.ok,true,JSON.stringify(managed));
    assert.deepEqual(JSON.parse(managed.data.definition.content),{people:[],scene:''});
    assert.equal(managed.data.definition.format,'json');
    const legacy={...node,schema:'',fileTarget:{name:'SceneContext.txt',format:'text',content:''}};
    const existing=initialization.prepareUnboundReader(legacy,{legacyDocuments:[{targetId:'story',format:'json'}],canonicalDocuments:{story:{content:'{}'}}});
    assert.deepEqual(existing.fileTarget,{});
    assert.equal(initialization.prepareUnboundReader(node,{canonicalDocuments:{story:{content:'{}'}}}),node);
    for(const overrides of [{initialization:'require-file'},{initialization:'bad'},{schema:'bad'},{fileTarget:{bindingId:'revoked'}},{fileTarget:{path:'C:\\missing.json'}},{fileTarget:{content:'existing'}},{fileTarget:{format:'bad'}}]) {
        const explicit={...node,...overrides};
        assert.equal(initialization.prepareUnboundReader(explicit),explicit);
    }
    assert.equal(initialization.fileInitializationMode({}),'generate');
    assert.equal(initialization.fileInitializationMode({initialization:'template'}),'template');
});

test('first-use generation sends purpose, schema, valid seed and bounded current context through one checked request', async () => {
    assert.equal(typeof initialization.generateFileContents,'function');
    const schema=JSON.stringify({type:'object',required:['scene'],properties:{scene:{type:'string'}},additionalProperties:false});
    const node={id:'read',type:'workflow',operation:'read-file',title:'Scene memory',targetId:'story',schema,initializationInstructions:'Keep uncertainty explicit',initializationMaxTokens:123,fileTarget:{format:'json'}};
    const context={kind:'context',messages:[{id:'m',role:'user',text:'Mara enters the inn.'}]};
    let calls=0;
    const generated=await initialization.generateFileContents(node,{context,initialContent:'{"scene":""}',request:async options=>{
        calls++;
        assert.equal(options.maxTokens,123);
        for(const text of ['Scene memory','story','Keep uncertainty explicit','scene','Mara enters the inn.'])assert.equal(JSON.stringify(options.messages).includes(text),true,text);
        return {ok:true,data:{text:'```json\n{"scene":"Mara is at the inn."}\n```',finish:'stop'}};
    }});
    assert.equal(generated.ok,true,JSON.stringify(generated));
    assert.deepEqual(JSON.parse(generated.data.content),{scene:'Mara is at the inn.'});
    assert.equal(calls,1);
    for(const [text,finish,code] of [['{}','stop','SCHEMA_MISMATCH'],['bad','stop','INVALID_JSON'],['{"scene":"x"}','length','TRUNCATED_OUTPUT'],['{"scene":"x"}',undefined,'COMPLETION_UNVERIFIED']]){
        calls=0;
        const invalid=await initialization.generateFileContents(node,{context,initialContent:'{"scene":""}',request:async()=>{calls++;return {ok:true,data:{text,finish}};}});
        assert.equal(invalid.error?.code,code);
        assert.equal(invalid.data,undefined);
        assert.equal(calls,1);
    }
    calls=0;
    const invalidSeed=await initialization.generateFileContents(node,{initialContent:'{}',request:async()=>{calls++;throw Error();}});
    assert.equal(invalidSeed.error?.code,'SCHEMA_MISMATCH');
    assert.equal(calls,0);
});

test('selected automatic reader is prepared exactly once and its updated request bound is admitted',()=>{
    const read={id:'read',type:'workflow',...operationDefaults('read-file',{managedFiles:true})};
    const other={...read,id:'other'};
    const graph={id:'init',name:'Initialization',schema:3,runtime:2,mode:'native-unified',nodes:{read,other},wires:{},portals:{},definitions:{},runTargets:[]};
    let called=0;
    const prepared=prepareWorkflowAttempt(graph,{target:{workflowId:'init',instancePath:[],nodeId:'read',portId:'text'}},node=>{called++;return {ok:true,data:{...initialization.prepareUnboundReader(node),initialization:'template'}};});
    assert.equal(prepared.ok,true,JSON.stringify(prepared));
    assert.equal(called,1);
    assert.equal(prepared.data.preflight.ok,true,JSON.stringify(prepared.data.preflight));
    assert.equal(prepared.data.selection.callBound,0);
    assert.equal(prepared.data.selection.primitives.find(unit=>unit.node.id==='read').requestBound,0);
    const target={target:{workflowId:'init',instancePath:[],nodeId:'read',portId:'text'}};
    assert.equal(prepareWorkflowAttempt(graph,target,node=>({ok:true,data:{...node,operation:'model-call'}})).error?.code,'INVALID_FILE_PREPARATION');
    assert.equal(prepareWorkflowAttempt(graph,target,node=>({ok:true,data:{...node,schema:'invalid'}})).error?.code,'UNSUPPORTED_SCHEMA');
    const portableNode={...read,initialization:'template',initializationInstructions:'Use current people',initializationMaxTokens:512,schema:'{"type":"array"}'};
    const portable=exportWorkflow({...graph,nodes:{read:portableNode},runTargets:graph.runTargets});
    const parsed=parseWorkflow(JSON.stringify(portable));
    assert.equal(parsed.ok,true,JSON.stringify(parsed));
    for(const key of ['initialization','initializationInstructions','initializationMaxTokens','schema'])assert.deepEqual(parsed.data.nodes.read[key],portableNode[key]);
});

test('saved reads accept an optional initialization context without treating it as document contents',async()=>{
    const files=createFileStore({scope:{userId:'u',chatId:'c'},authorizedTargets:['saved'],isCurrent:()=>true,validateEvidence:async()=>({ok:true}),load:async()=>({ok:true,data:{targetId:'saved',revision:1,format:'json',content:'{"saved":true}',receipts:[]}}),compareAndSwap:async()=>{throw Error('Read cannot write.');}});
    const context={kind:'context',messages:[{id:'m',role:'user',text:'Unused private initialization material'}],visibility:{kind:'actor-private',actorId:'mara'}};
    const read=await executeFileNode({id:'read',type:'workflow',operation:'read-file',targetId:'saved',initialization:'generate'},{context},{root:true,files});
    assert.equal(read.ok,true,JSON.stringify(read));
    assert.deepEqual(read.outputs.value.value,{saved:true});
    assert.deepEqual(read.outputs.value.visibility,{kind:'public'});
});

test('Require a file cannot seed a raw managed marker and text schemas fail before generation',async()=>{
    const node={id:'read',type:'workflow',operation:'read-file',initialization:'require-file',fileTarget:{managed:true}};
    assert.equal(describeFileNode(node,{authoring:true}).data.setupIssues[0]?.code,'FILE_SETUP_REQUIRED');
    assert.equal(describeFileNode(node).error?.code,'FILE_SETUP_REQUIRED');
    let calls=0;
    const text=await initialization.generateFileContents({...node,initialization:'generate',schema:'{"type":"object"}',fileTarget:{format:'text'}},{initialContent:'',request:async()=>{calls++;return {ok:true,data:{text:'words',finish:'stop'}};}});
    assert.equal(text.error?.code,'UNSUPPORTED_SCHEMA');
    assert.equal(calls,0);
});

test('existing canonical bytes and incompatible catalog privacy cannot redirect a managed marker',()=>{
    const base={id:'read',type:'workflow',operation:'read-file',targetId:'saved',fileTarget:{managed:true}};
    const orphan=initialization.prepareUnboundReader(base,{canonicalDocuments:{saved:{content:'PRIVATE existing bytes'}}});
    assert.equal(orphan.fileTarget.managed,undefined);
    assert.equal(orphan.targetId,'saved');
    assert.equal(describeFileNode(orphan,{authoring:true}).data.setupIssues[0]?.code,'FILE_SETUP_REQUIRED');
    for(const visibility of [{kind:'hidden'},{kind:'actor-private',actorId:'mara'}]){
        const privateNode={...base,fileTarget:{managed:true,visibility}};
        const incompatible=initialization.prepareUnboundReader(privateNode,{legacyDocuments:[{targetId:'saved',format:'json',visibility:{kind:'public'}}]});
        assert.equal(incompatible.fileTarget.managed,undefined);
        assert.deepEqual(incompatible.fileTarget.visibility,visibility);
    }
    const legacy={...base,fileTarget:{name:'SceneContext.txt',format:'text',content:''}};
    assert.deepEqual(initialization.prepareUnboundReader(legacy,{legacyDocuments:[{targetId:'saved',format:'json',visibility:{kind:'hidden'}}]}).fileTarget,{});
});

test('generation supports text, Markdown, JSON Lines and CSV without losing serialization contracts',async()=>{
    const recordSchema=JSON.stringify({type:'object',required:['name'],properties:{name:{type:'string'}},additionalProperties:false});
    for(const [format,seed,text,expected] of [
        ['text','','Mara waits.','Mara waits.'],
        ['markdown','','# Mara\n\nAt the inn.','# Mara\n\nAt the inn.'],
        ['jsonl','','[{"name":"Mara"}]','{"name":"Mara"}\n'],
        ['csv','"name"\r\n','[{"name":"Mara, the mage"}]','name\r\n"Mara, the mage"\r\n'],
    ]){
        const node={id:'read',type:'workflow',operation:'read-file',initialization:'generate',fileTarget:{format},...(['jsonl','csv'].includes(format)?{schema:recordSchema}:{}),...(format==='csv'?{columns:['name']}:{})};
        let calls=0;
        const result=await initialization.generateFileContents(node,{initialContent:seed,request:async()=>{calls++;return {ok:true,data:{text,finish:'stop'}};}});
        assert.equal(result.ok,true,JSON.stringify(result));
        assert.equal(result.data.content,expected);
        assert.equal(calls,1);
    }
    let called=0;
    const controller=new AbortController();controller.abort();
    const cancelled=await initialization.generateFileContents({id:'read',operation:'read-file'},{initialContent:'[]',signal:controller.signal,request:async()=>{called++;throw Error();}});
    assert.equal(cancelled.error?.code,'ABORTED');
    assert.equal(called,0);
    const oversized=await initialization.generateFileContents({id:'read',operation:'read-file',fileTarget:{format:'text'}},{initialContent:'',request:async()=>({ok:true,data:{text:'界'.repeat(90000),finish:'stop'}})});
    assert.equal(oversized.ok,false);
    assert.equal(oversized.data,undefined);
});

test('automatic readers inherit one connected writer schema while retaining fixed selectors and safe privacy',()=>{
    const schema='{"type":"object","required":["scene"],"properties":{"scene":{"type":"string"}}}';
    const read={id:'read',type:'workflow',operation:'read-file',schema:'',profileId:'fixed-profile',model:'fixed-model',fileTarget:{name:'SceneContext.txt',format:'text',content:''}};
    const writer={id:'write',type:'workflow',operation:'write-file',schema};
    const prepared=initialization.prepareUnboundReader(read,{nodes:{write:writer},wires:{reference:{from:'read',fromPort:'reference',to:'write',toPort:'reference'}}});
    assert.equal(prepared.schema,schema);
    assert.equal(prepared.fileTarget.format,'json');
    assert.equal(prepared.profileId,'fixed-profile');
    assert.equal(prepared.model,'fixed-model');
    assert.equal(prepared.initialization,'generate');
    assert.equal(describeFileNode(prepared).data.descriptor.requestBound,1);
});

test('nested reader preparation receives only effective nodes and reference wires from its own qualified instance',()=>{
    const schema='{"type":"object","required":["scene"],"properties":{"scene":{"type":"string"}}}';
    const read={id:'read',type:'workflow',operation:'read-file',initialization:'template',fileTarget:{managed:true}};
    const write={id:'write',type:'workflow',operation:'write-file',mode:'replace',schema};
    const wire={id:'reference',route:'wire',from:'read',fromPort:'reference',to:'write',toPort:'reference'};
    const computed=computeDefinitionIdentity({id:'file-system',version:1,name:'File system',parameters:[],interface:[],body:{schema:3,runtime:2,mode:'native-unified',nodes:{read,write},wires:{reference:wire}}});
    assert.equal(computed.ok,true,JSON.stringify(computed));
    const definition={...computed.data.materializedDefinition,semanticHash:computed.data.semanticHash};
    const ref={id:definition.id,version:definition.version,semanticHash:definition.semanticHash};
    const graph={id:'nested-init',name:'Nested initialization',schema:3,runtime:2,mode:'native-unified',nodes:{one:{id:'one',type:'subgraph',definition:ref},two:{id:'two',type:'subgraph',definition:ref},read,write:{...write,schema:'{"type":"array"}'}},wires:{reference:wire},definitions:{[definitionRefKey(definition)]:definition},runTargets:[]};
    let calls=0;
    const prepared=prepareWorkflowAttempt(graph,{target:{workflowId:graph.id,instancePath:['one'],nodeId:'read',portId:'text'}},(node,address,context)=>{
        calls++;
        assert.deepEqual(address.instancePath,['one']);
        return {ok:true,data:initialization.prepareUnboundReader(node,context)};
    });
    assert.equal(prepared.ok,true,JSON.stringify(prepared));
    assert.equal(prepared.data.preflight.ok,true,JSON.stringify(prepared.data.preflight));
    const selected=prepared.data.selection.primitives.find(unit=>unit.included);
    assert.equal(selected.node.schema,schema);
    const managed=resolveManagedFileNode(selected.node,{workflowId:'trusted',address:selected.address});
    assert.equal(managed.ok,true,JSON.stringify(managed));
    assert.deepEqual(JSON.parse(managed.data.definition.content),{scene:''});
    assert.equal(calls,1);
});

test('record writer schemas initialize the JSON document collection rather than one record',()=>{
    const schema='{"type":"object","required":["fact"],"properties":{"fact":{"type":"string"}},"additionalProperties":false}';
    for(const collectionPath of ['', '/facts', '/memory/facts', '/scene~1notes/a~0b']){
        const read={id:'read',type:'workflow',operation:'read-file',initialization:'template',fileTarget:{managed:true}};
        const write={id:'write',type:'workflow',operation:'write-file',mode:'add',collectionPath,schema};
        const reader=initialization.prepareUnboundReader(read,{nodes:{write},wires:{reference:{from:'read',fromPort:'reference',to:'write',toPort:'reference'}}});
        const resolved=resolveManagedFileNode(reader,{workflowId:'trusted'});
        assert.equal(resolved.ok,true,JSON.stringify(resolved));
        const definition=resolved.data.definition;
        const projected=prepareDocumentMutation({targetId:definition.targetId,revision:0,format:definition.format,content:definition.content},{operation:'add',collectionPath,missingPath:'error',records:[{fact:'Door opens'}],schema:JSON.parse(schema)});
        assert.equal(projected.ok,true,JSON.stringify(projected));
        assert.equal(projected.data.receipt.added,1);
    }
    for(const format of ['jsonl','csv']){
        const read={id:'read',type:'workflow',operation:'read-file',initialization:'template',fileTarget:{managed:true,format},...(format==='csv'?{columns:['fact']}:{})};
        const write={id:'write',type:'workflow',operation:'write-file',mode:'add',schema};
        const reader=initialization.prepareUnboundReader(read,{nodes:{write},wires:{reference:{from:'read',fromPort:'reference',to:'write',toPort:'reference'}}});
        assert.equal(reader.schema,schema);
    }
});

test('legacy reserved readers retain scoped Workflow Data defaults while custom and authored readers initialize',()=>{
    const base={id:'read',type:'workflow',operation:'read-file'};
    for(const targetId of [undefined,'','lattice-default-notes','lattice-default-clock','lattice-default-outcomes']){
        const node={...base,...(targetId===undefined?{}:{targetId})};
        assert.equal(initialization.prepareUnboundReader(node),node);
        const emptyTarget={...node,fileTarget:{}};
        assert.equal(initialization.prepareUnboundReader(emptyTarget),emptyTarget);
    }
    for(const node of [
        {...base,targetId:'story-foundations'},
        {...base,initialization:'generate'},
        {...base,initializationInstructions:''},
        {...base,fileTarget:{managed:true}},
        {...base,fileTarget:{name:'SceneContext.txt',format:'text',content:''}},
    ])assert.equal(initialization.prepareUnboundReader(node).fileTarget.managed,true);
});

test('automatic adoption preserves inherited authored role bindings and only falls back for unbound readers',()=>{
    const base={id:'read',type:'workflow',operation:'read-file',targetId:'story-foundations',model:'fixed-model'};
    for(const profile of [{profileId:null},{}]){
        const reader={...base,modelRole:'Research',...profile};
        const prepared=initialization.prepareUnboundReader(reader);
        assert.equal(prepared.modelRole,'Research');
        assert.equal(prepared.model,'fixed-model');
        assert.equal(Object.hasOwn(prepared,'profileId'),Object.hasOwn(reader,'profileId'));
        assert.equal(prepared.profileId,reader.profileId);
    }
    const fixed=initialization.prepareUnboundReader({...base,modelRole:'Research',profileId:'fixed-profile'});
    assert.equal(fixed.profileId,'fixed-profile');
    const unbound=initialization.prepareUnboundReader({...base,modelRole:null,profileId:null});
    assert.equal(unbound.modelRole,'Prose');
    assert.equal(unbound.profileId,'lattice:active-sillytavern');
});
