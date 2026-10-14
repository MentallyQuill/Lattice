import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FILE_OPERATIONS, describeFileNode, executeFileNode } from '../src/workflow/operations/file-nodes.js';
import { createFileStore } from '../src/workflow/file-store.js';
import { executeCollection } from '../src/workflow/operations/collection-nodes.js';
const node=(operation,settings={})=>({id:'node-'+operation,type:'workflow',operation,...settings});
const data=value=>({kind:'data',value});
const must=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result;};
const scope={userId:'default-user',chatId:'Story-2'};
function fixture(content='{"souls":[]}',format='json',extra={}) {
    let stored={targetId:'sword',revision:0,format,content,receipts:[]},writes=0,staged=[];
    const files=createFileStore({scope:extra.scope??scope,authorizedTargets:['sword'],load:async()=>({ok:true,data:structuredClone(stored)}),compareAndSwap:async()=>{writes++;throw new Error('No commits from a node');},isCurrent:()=>true,validateEvidence:async()=>({ok:true})});
    const local={root:true,phase:'post',files,createIntentId:()=>({ok:true,data:'stable-event-1'}),authorizeFileWrite:async()=>({ok:true,data:{destinationVisibility:extra.destinationVisibility??{kind:'public'}}}),stageFileIntent:async(prepared,evidence)=>{staged.push({prepared,evidence});return {ok:true};},...extra.local};
    return {files,local,writes:()=>writes,staged:()=>staged};
}
test('Read File exposes its checked structured value without granting write authority',async()=>{
    const f=fixture();
    const read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
    assert.deepEqual(read.outputs.value?.value,{souls:[]});
    assert.deepEqual(read.outputs.value.visibility,read.outputs.document.visibility);
    assert.ok(describeFileNode(node('read-file',{targetId:'sword'}),{phase:'post'}).data.ports.some(port=>port.id==='value'&&port.direction==='output'&&port.kind==='data'));
    const written=await executeFileNode(node('write-file',{mode:'add',collectionPath:'/souls'}),{reference:read.outputs.value,records:data([])},f.local);
    assert.equal(written.ok,false);
    assert.equal(f.staged().length,0);
});

test('Format decodes only explicitly selected JSON text and emits separate bounded outputs',async()=>{
    const formatted=must(await executeFileNode(node('format',{inputMode:'json-text',format:'jsonl'}),{in:{kind:'text',text:'[{"eventId":"kill-1","victimId":"enemy-1"}]'}},{phase:'post'}));
    assert.deepEqual(formatted.outputs.records.value,[{eventId:'kill-1',victimId:'enemy-1'}]);
    assert.equal(formatted.outputs.text.text,'{"eventId":"kill-1","victimId":"enemy-1"}\n');
    assert.equal(formatted.outputs.report.value.serialization.format,'jsonl');
    assert.equal((await executeFileNode(node('format',{inputMode:'json-text'}),{in:{kind:'text',text:'The sword steals a soul.'}},{phase:'pre'})).ok,false);
    assert.equal(FILE_OPERATIONS.format.requestBound,0);
    assert.equal(FILE_OPERATIONS['read-file'].rootOnly,true);
    assert.equal(describeFileNode(node('write-file'),{phase:'pre'}).error.code,'INVALID_PHASE');
});

test('Read File parsed value connects directly to strict Data consumers',async()=>{
    const f=fixture('[1,2]');
    const read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
    const counted=must(await executeCollection(node('collection',{mode:'count'}),{in:read.outputs.value},{phase:'post'}));
    assert.equal(counted.artifact.value,2);
});
test('Read File preserves exact live reference authority and Write stages a proposal without committing',async()=>{
    const f=fixture();
    const read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
    assert.deepEqual(read.outputs.document.value.value,{souls:[]});
    const written=must(await executeFileNode(node('write-file',{mode:'add-unique',collectionPath:'/souls',key:'eventId'}),{reference:read.outputs.reference,records:data([{eventId:'kill-1',victimId:'enemy-1'}]),evidence:data([{eventId:'kill-1'}])},f.local));
    assert.equal(written.outputs.receipt.value.status,'staged');
    assert.equal(written.outputs.projection.value.value.souls.length,1);
    assert.equal(f.staged().length,1);
    assert.equal(f.writes(),0);
    assert.equal(JSON.stringify(written).includes('"handle"'),false);
    assert.equal((await f.files.preflight(f.staged()[0].prepared.handle)).ok,true);
    const copied=await executeFileNode(node('write-file',{mode:'add',collectionPath:'/souls'}),{reference:structuredClone(read.outputs.reference),records:data([])},f.local);
    assert.equal(copied.error.code,'FILE_REFERENCE_UNAUTHORIZED');
});
test('private records fail before staging to a public destination',async()=>{
    const f=fixture();
    const read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
    const result=await executeFileNode(node('write-file',{mode:'add',collectionPath:'/souls'}),{reference:read.outputs.reference,records:{kind:'data',value:[{id:'secret',visibility:{kind:'actor-private',actorId:'mara'}}]}},f.local);
    assert.equal(result.error.code,'PRIVATE_DESTINATION');
    assert.equal(f.staged().length,0);
    assert.equal(f.writes(),0);
});

test('Read rejects malformed text snapshots and mismatched file scope before emitting reference authority',async()=>{
    const reference=Object.freeze({kind:'file-reference',backend:'host-store',scope:Object.freeze(scope),targetId:'sword',revision:0});
    const invalid=await executeFileNode(node('read-file',{targetId:'sword'}),{},{root:true,phase:'pre',files:{read:async()=>({ok:true,data:{snapshot:{targetId:'sword',revision:0,format:'text',content:'hello',extra:'unadmitted'},fileRef:reference}})}});
    assert.equal(invalid.ok,false);
    assert.equal(invalid.outputs,undefined);
});
test('describing a node cannot freeze unrelated caller-owned properties',()=>{
    const extra={items:[]},operation=node('format',{extra});
    must(describeFileNode(operation,{phase:'pre'}));
    assert.equal(Object.isFrozen(extra),false);
    assert.equal(Object.isFrozen(extra.items),false);
});

test('Format applies explicit mappings/defaults and schema without inventing missing prose fields',async()=>{
    const settings={mapping:'select',fields:[{name:'eventId',path:['id']},{name:'label',path:['description'],required:false,default:'authored fallback'}],schema:JSON.stringify({type:'object',required:['eventId','label'],properties:{eventId:{type:'string'},label:{type:'string'}},additionalProperties:false})};
    const output=must(await executeFileNode(node('format',settings),{in:data({id:'event-1',ignored:'not selected'})},{phase:'pre'}));
    assert.deepEqual(output.outputs.records.value,[{eventId:'event-1',label:'authored fallback'}]);
    const missing=await executeFileNode(node('format',settings),{in:data({description:'only label'})},{phase:'post'});
    assert.equal(missing.error.code,'MISSING_FIELD');
    const unsupported=describeFileNode(node('format',{schema:'{"type":"object","pattern":".*"}'}));
    assert.equal(unsupported.error.code,'UNSUPPORTED_SCHEMA');
});
test('Format and Read honor JSONL/CSV decoding and string cell schemas',async()=>{
    const lines=fixture('{"id":"one"}\r\n{"id":"two"}\n','jsonl');
    const readLines=must(await executeFileNode(node('read-file',{targetId:'sword',schema:'{"type":"object","required":["id"]}'}),{},lines.local));
    assert.deepEqual(readLines.outputs.document.value.value,[{id:'one'},{id:'two'}]);
    const csv=fixture('id,description\r\none,"A line\nwith ""quotes"""\r\n','csv');
    const readCsv=must(await executeFileNode(node('read-file',{targetId:'sword',columns:['id','description']}),{},csv.local));
    assert.deepEqual(readCsv.outputs.document.value.value,[{id:'one',description:'A line\nwith "quotes"'}]);
    assert.equal((await executeFileNode(node('read-file',{targetId:'sword',columns:['description','id']}),{},csv.local)).error.code,'CSV_HEADER_MISMATCH');
    const csvOutput=must(await executeFileNode(node('format',{format:'csv',columns:['id','amount']}),{in:data([{id:'one',amount:3}])},{phase:'pre'}));
    assert.deepEqual(csvOutput.outputs.records.value,[{id:'one',amount:'3'}]);
    const numeric=await executeFileNode(node('format',{format:'csv',columns:['amount'],schema:'{"properties":{"amount":{"type":"number"}}}'}),{in:data([{amount:3}])},{phase:'pre'});
    assert.equal(numeric.error.code,'SCHEMA_MISMATCH');
});
test('empty and semantic duplicate writes stage unchanged plans and perform no backend mutation',async()=>{
    for(const [content,records] of [['{"souls":[]}',[]],['{"souls":[{"eventId":"kill-1"}]}',[{eventId:'kill-1'}]]]){
        const f=fixture(content);
        const read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
        const staged=must(await executeFileNode(node('write-file',{mode:'add-unique',collectionPath:'/souls',key:'eventId'}),{reference:read.outputs.reference,records:data(records)},f.local));
        assert.equal(staged.outputs.receipt.value.changed,false);
        const settled=must(await f.files.commit(f.staged()[0].prepared.handle,{root:true,accepted:true})).data;
        assert.equal(settled.status,'unchanged');
        assert.equal(f.writes(),0);
    }
    const empty=must(await executeFileNode(node('format',{format:'markdown',separator:'\n\n'}),{in:data([])},{phase:'post'}));
    assert.equal(empty.outputs.text.text,'');
    assert.deepEqual(empty.outputs.records.value,[]);
});
test('Write modes consume text or structured records explicitly, preserving the captured format',async()=>{
    for(const format of ['text','markdown']){
        const f=fixture('Original',format),read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
        const proposed=must(await executeFileNode(node('write-file',{mode:'append',separator:' | ',trailingSeparator:true}),{reference:read.outputs.reference,text:{kind:'text',text:'new scene'}},f.local));
        assert.equal(proposed.outputs.projection.value.content,'Original | new scene | ');
        assert.equal(proposed.outputs.projection.value.format,format);
        assert.equal(f.writes(),0);
    }
    const f=fixture('{"souls":[]}'),read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
    const replaced=must(await executeFileNode(node('write-file',{mode:'replace',schema:'{"type":"object","required":["souls"]}'}),{reference:read.outputs.reference,text:{kind:'text',text:'{"souls":[{"eventId":"e"}]}'}},f.local));
    assert.equal(replaced.outputs.projection.value.value.souls[0].eventId,'e');
    const mismatch=await executeFileNode(node('write-file',{mode:'replace',schema:'{"type":"object","required":["souls"]}'}),{reference:read.outputs.reference,text:{kind:'text',text:'{}'}},f.local);
    assert.equal(mismatch.error.code,'SCHEMA_MISMATCH');
    assert.equal(f.staged().length,1);
});
test('storage nodes reject helper authority, unavailable policies and mismatched actor-private destinations',async()=>{
    let reads=0;
    const helper=await executeFileNode(node('read-file',{targetId:'sword'}),{},{phase:'post',root:false,files:{read:async()=>{reads++;}}});
    assert.equal(helper.error.code,'ROOT_ONLY');assert.equal(reads,0);
    const f=fixture('[]','json',{scope:{...scope,actorId:'mara'}});
    const read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
    assert.deepEqual(read.outputs.text.visibility,{kind:'actor-private',actorId:'mara'});
    const absent=await executeFileNode(node('write-file',{mode:'add'}),{reference:read.outputs.reference,records:data([{text:'reflection'}])},{...f.local,authorizeFileWrite:undefined});
    assert.equal(absent.error.code,'INVALID_PORTS');
    for(const destinationVisibility of [{kind:'public'},{kind:'actor-private',actorId:'eli'}]){
        const result=await executeFileNode(node('write-file',{mode:'add'}),{reference:{...read.outputs.reference,visibility:{kind:'public'}},records:data([{text:'reflection'}])},{...f.local,authorizeFileWrite:async()=>({ok:true,data:{destinationVisibility}})});
        assert.equal(result.error.code,'PRIVATE_DESTINATION');
    }
    const allowed=must(await executeFileNode(node('write-file',{mode:'add'}),{reference:read.outputs.reference,records:data([{text:'reflection'}])},{...f.local,authorizeFileWrite:async()=>({ok:true,data:{destinationVisibility:{kind:'actor-private',actorId:'mara'}}})}));
    assert.deepEqual(allowed.outputs.projection.visibility,{kind:'actor-private',actorId:'mara'});
    assert.equal(f.staged().length,1);
});
test('cancellation during read, authorization, identity and preparation does not stage a write',async()=>{
    for(const boundary of ['read','authorizeFileWrite','createIntentId','prepare']){
        const f=fixture(),controller=new AbortController();
        let read;
        if(boundary==='read'){
            const result=await executeFileNode(node('read-file',{targetId:'sword'}),{},{...f.local,signal:controller.signal,files:{...f.files,read:async id=>{const result=await f.files.read(id);controller.abort();return result;}}});
            assert.equal(result.error.code,'ABORTED');continue;
        }
        read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
        const local={...f.local,signal:controller.signal};
        if(boundary==='prepare')local.files={...f.files,prepare:async(...args)=>{const result=await f.files.prepare(...args);controller.abort();return result;}};
        else local[boundary]=async(...args)=>{const result=await f.local[boundary](...args);controller.abort();return result;};
        const result=await executeFileNode(node('write-file',{mode:'add',collectionPath:'/souls'}),{reference:read.outputs.reference,records:data([{id:'soul'}])},local);
        assert.equal(result.error.code,'ABORTED');
        assert.equal(f.staged().length,0);
        assert.equal(f.writes(),0);
    }
});
test('controls, artifacts and capability getters are rejected without evaluation or staging',async()=>{
    let reads=0;
    const badNode=node('format');Object.defineProperty(badNode,'schema',{enumerable:true,get(){reads++;return '';}});
    const badInput={kind:'data'};Object.defineProperty(badInput,'value',{enumerable:true,get(){reads++;return [];}});
    const badLocal={phase:'pre'};Object.defineProperty(badLocal,'files',{enumerable:true,get(){reads++;return {};}});
    for(const [operation,input,local] of [[badNode,{in:data([])},{phase:'pre'}],[node('format'),{in:badInput},{phase:'pre'}],[node('format'),{in:data([])},badLocal]])assert.equal((await executeFileNode(operation,input,local)).ok,false);
    assert.equal(reads,0);
});
test('no staging occurs after invalid schemas, source records or malformed capability results',async()=>{
    const f=fixture(),read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
    const params={reference:read.outputs.reference,records:data([{id:'a'}])};
    const mismatch=await executeFileNode(node('write-file',{mode:'add',collectionPath:'/souls',schema:'{"required":["eventId"]}'}),params,f.local);
    assert.equal(mismatch.error.code,'SCHEMA_MISMATCH');
    const invalid=await executeFileNode(node('write-file',{mode:'add',collectionPath:'/souls'}),{...params,records:data(['not a record'])},f.local);
    assert.equal(invalid.error.code,'INVALID_RECORDS');
    const policy=await executeFileNode(node('write-file',{mode:'add',collectionPath:'/souls'}),params,{...f.local,authorizeFileWrite:async()=>({ok:true,data:{destinationVisibility:{kind:'public'},extra:()=>{}}})});
    assert.equal(policy.error.code,'PRIVATE_DESTINATION');
    assert.equal(f.staged().length,0);
});

test('private labels inside decoded JSON survive field selection and serialized Text routing',async()=>{
    const raw='[{"id":"one","visibility":{"kind":"actor-private","actorId":"mara"},"text":"secret"}]';
    const formatted=must(await executeFileNode(node('format',{inputMode:'json-text',mapping:'select',fields:[{name:'text',path:['text']}],format:'text'}),{in:{kind:'text',text:raw}},{phase:'pre'}));
    assert.deepEqual(formatted.outputs.text.visibility,{kind:'actor-private',actorId:'mara'});
    const f=fixture('','text'),read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
    const written=await executeFileNode(node('write-file',{mode:'append'}),{reference:read.outputs.reference,text:formatted.outputs.text},f.local);
    assert.equal(written.error.code,'PRIVATE_DESTINATION');
    assert.equal(f.staged().length,0);
});
test('replacement JSON private fields cannot enter a public document through unlabelled Text',async()=>{
    const f=fixture('[]'),read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
    const result=await executeFileNode(node('write-file',{mode:'replace'}),{reference:read.outputs.reference,text:{kind:'text',text:'[{"id":"memory","visibility":{"kind":"actor-private","actorId":"mara"}}]'}},f.local);
    assert.equal(result.error.code,'PRIVATE_DESTINATION');
    assert.equal(f.staged().length,0);
});

test('keyed modes forward exact collection, field and missing-path policies into one projection',async()=>{
    const cases=[
        ['upsert',{fieldPolicy:'merge'},[{id:'m',feeling:'joy'}],{id:'m',feeling:'joy',note:'retained'}],
        ['upsert',{fieldPolicy:'replace'},[{id:'m',feeling:'joy'}],{id:'m',feeling:'joy'}],
        ['update-fields',{fields:['feeling']},[{id:'m',feeling:'joy',note:'ignored'}],{id:'m',feeling:'joy',note:'retained'}],
    ];
    for(const [mode,controls,records,expected] of cases){
        const f=fixture('{"memories":[{"id":"m","feeling":"hope","note":"retained"}]}'),read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
        const result=must(await executeFileNode(node('write-file',{mode,collectionPath:'/memories',...controls}),{reference:read.outputs.reference,records:data(records)},f.local));
        assert.deepEqual(result.outputs.projection.value.value.memories,[expected]);
        assert.equal(f.staged()[0].prepared.plan.operation,mode);
        assert.equal(f.writes(),0);
    }
    const f=fixture('{}'),read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
    assert.equal((await executeFileNode(node('write-file',{mode:'add',collectionPath:'/souls',missingPath:'error'}),{reference:read.outputs.reference,records:data([{id:'one'}])},f.local)).error.code,'MISSING_COLLECTION');
    const created=must(await executeFileNode(node('write-file',{mode:'add',collectionPath:'/souls',missingPath:'create'}),{reference:read.outputs.reference,records:data([{id:'one'}])},f.local));
    assert.deepEqual(created.outputs.projection.value.value,{souls:[{id:'one'}]});
});
test('unsupported keyed mutations on JSONL/CSV hold without staging',async()=>{
    for(const [format,content,settings] of [['jsonl','{"id":"one"}\n',{}],['csv','id\r\none\r\n',{columns:['id']}]]){
        const f=fixture(content,format),read=must(await executeFileNode(node('read-file',{targetId:'sword',...settings}),{},f.local));
        const result=await executeFileNode(node('write-file',{mode:'upsert',...settings}),{reference:read.outputs.reference,records:data([{id:'one'}])},f.local);
        assert.equal(result.error.code,'UNSUPPORTED_MUTATION');
        assert.equal(f.staged().length,0);
    }
});
test('input mutation during authorization cannot alter the captured records, evidence or controls',async()=>{
    const f=fixture(),read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
    const operation=node('write-file',{mode:'add',collectionPath:'/souls'}),records=[{id:'one'}],evidence=[{eventId:'one'}];
    const local={...f.local,authorizeFileWrite:async capture=>{
        records[0].id='changed';evidence[0].eventId='changed';operation.collectionPath='/wrong';
        assert.equal(Object.isFrozen(capture.evidence[0]),true);
        assert.equal(Object.isFrozen(capture.projection.projectedDocument),true);
        return {ok:true,data:{destinationVisibility:{kind:'public'}}};
    }};
    const result=must(await executeFileNode(operation,{reference:read.outputs.reference,records:data(records),evidence:data(evidence)},local));
    assert.deepEqual(result.outputs.projection.value.value,{souls:[{id:'one'}]});
    assert.deepEqual(f.staged()[0].evidence,[{eventId:'one'}]);
});
test('read policy can restrict plain text, while graph metadata cannot declassify its live reference',async()=>{
    const f=fixture('private reflection','text'),local={...f.local,fileVisibility:async()=>({ok:true,data:{kind:'actor-private',actorId:'mara'}})};
    const read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},local));
    assert.deepEqual(read.outputs.text.visibility,{kind:'actor-private',actorId:'mara'});
    const result=await executeFileNode(node('write-file',{mode:'append'}),{reference:{...read.outputs.reference,visibility:{kind:'public'}},text:{kind:'text',text:'more'}},f.local);
    assert.equal(result.error.code,'PRIVATE_DESTINATION');
    const actor=fixture('[]','json',{scope:{...scope,actorId:'mara'}});
    const prohibited=await executeFileNode(node('read-file',{targetId:'sword'}),{},{...actor.local,fileVisibility:async()=>({ok:true,data:{kind:'public'}})});
    assert.equal(prohibited.error.code,'PRIVATE_DESTINATION');
});

test('Format mapping defaults preserve their own private labels in records, serialized Text and write authorization',async()=>{
    const memory={text:'private memory',visibility:{kind:'actor-private',actorId:'mara'}};
    const formatted=must(await executeFileNode(node('format',{mapping:'select',fields:[{name:'memory',path:['missing'],required:false,default:memory}]}),{in:data({id:'public-record'})},{phase:'pre'}));
    assert.deepEqual(formatted.outputs.records.visibility,{kind:'actor-private',actorId:'mara'});
    assert.deepEqual(formatted.outputs.text.visibility,{kind:'actor-private',actorId:'mara'});
    assert.deepEqual(formatted.outputs.report.visibility,{kind:'actor-private',actorId:'mara'});
    const f=fixture('','text'),read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));
    const written=await executeFileNode(node('write-file',{mode:'append'}),{reference:read.outputs.reference,text:formatted.outputs.text},f.local);
    assert.equal(written.error.code,'PRIVATE_DESTINATION');
    assert.equal(f.staged().length,0);
});
test('every typed file capability failure returns only locally controlled diagnostics',async()=>{
    const secret='PRIVATE_CAPABILITY_SECRET';
    const failure={ok:false,error:{code:'FILE_BACKEND_FAILED',message:'Provider echoed '+secret,authorization:secret,details:{privatePath:secret},nodeId:secret,address:{workflowId:secret,instancePath:[],nodeId:secret}}};
    for(const boundary of ['read','fileVisibility','authorizeFileWrite','createIntentId','prepare','stageFileIntent']){
        const f=fixture(),local={...f.local};
        let result;
        if(boundary==='read'){
            local.files={...f.files,read:async()=>failure};
            result=await executeFileNode(node('read-file',{targetId:'sword'}),{},local);
        }else if(boundary==='fileVisibility'){
            local.fileVisibility=async()=>failure;
            result=await executeFileNode(node('read-file',{targetId:'sword'}),{},local);
        }else{
            const read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},local));
            if(boundary==='prepare')local.files={...f.files,prepare:async()=>failure};
            else local[boundary]=async()=>failure;
            result=await executeFileNode(node('write-file',{mode:'add',collectionPath:'/souls'}),{reference:read.outputs.reference,records:data([{id:'one'}])},local);
        }
        assert.equal(result.ok,false,boundary);
        assert.equal(result.error.code,'FILE_BACKEND_FAILED',boundary);
        assert.equal(JSON.stringify(result).includes(secret),false,boundary);
        assert.deepEqual(Object.keys(result.error).sort(),['code','message'],boundary);
        assert.equal(f.staged().length,0,boundary);
    }
});

test('unknown, oversized and accessor-backed capability diagnostics never echo private data or evaluate getters',async()=>{
    const secret='PRIVATE_DIAGNOSTIC_SECRET';let getterReads=0;
    const getterError={message:'private '+secret};Object.defineProperty(getterError,'code',{enumerable:true,get(){getterReads++;return 'FILE_BACKEND_FAILED';}});
    const nestedDetails={};Object.defineProperty(nestedDetails,'privatePath',{enumerable:true,get(){getterReads++;return secret;}});
    const failures=[
        [{code:secret,message:secret},'FILE_CAPABILITY_FAILED'],
        [{code:'FILE_BACKEND_FAILED',message:secret.repeat(1000)},'INVALID_FILE_RESPONSE'],
        [getterError,'INVALID_FILE_RESPONSE'],
        [{code:'FILE_BACKEND_FAILED',message:secret,details:nestedDetails},'FILE_BACKEND_FAILED'],
    ];
    for(const [error,expectedCode] of failures){
        const result=await executeFileNode(node('read-file',{targetId:'sword'}),{},{root:true,phase:'pre',files:{read:async()=>({ok:false,error})}});
        assert.equal(result.error.code,expectedCode);
        assert.equal(JSON.stringify(result).includes(secret),false);
        assert.deepEqual(Object.keys(result.error).sort(),['code','message']);
    }
    assert.equal(getterReads,0);
});

test('Write to File is a consequence root whose review artifact is the descriptive staging receipt',async()=>{assert.equal(describeFileNode(node('write-file'),{phase:'post'}).data.descriptor.terminal,true);const f=fixture(),read=must(await executeFileNode(node('read-file',{targetId:'sword'}),{},f.local));const result=must(await executeFileNode(node('write-file',{mode:'add',collectionPath:'/souls'}),{reference:read.outputs.reference,records:data([{id:'soul-1'}])},f.local));assert.equal(result.artifact,result.outputs.receipt);assert.equal(result.artifact.kind,'data');assert.equal(result.artifact.value.status,'staged');assert.equal(f.writes(),0);assert.equal(JSON.stringify(result.artifact).includes('"handle"'),false);});

const actorPresence=actorId=>({kind:'data',value:{schemaVersion:1,recordType:'scene-presence',actorId,status:'present',sceneId:'scene',sourceId:'owned-scene',revision:'r1'}});
test('actor presence mode requires a configured actor and exact required presence pin without changing selected ports',()=>{
    for(const operation of ['read-file','write-file']){
        const settings=operation==='read-file'?{targetId:'sword'}:{};
        assert.equal(describeFileNode(node(operation,{...settings,actorScope:'presence'}),{phase:'post'}).ok,false);
        const described=must(describeFileNode(node(operation,{...settings,actorScope:'presence',actorId:'character:mara.png'}),{phase:'post'}));
        assert.equal(described.data.ports.find(pin=>pin.id==='presence').required,true);
        assert.equal(describeFileNode(node(operation,{...settings,actorId:'character:mara.png'}),{phase:'post'}).ok,false);
        assert.equal(must(describeFileNode(node(operation,settings),{phase:'post'})).data.ports.some(pin=>pin.id==='presence'),false);
    }
    assert.equal(FILE_OPERATIONS['project-document'].controls.includes('actorScope'),false);
});
test('presence-scoped Read passes exact authority, preserves actor labels, and Write checks the same captured actor',async()=>{
    const actorId='character:mara.png',presence=actorPresence(actorId),calls=[];
    const f=fixture('[]','json',{scope:{...scope,actorId},destinationVisibility:{kind:'actor-private',actorId},local:{authorizeActorFileScope:request=>{calls.push(request);assert.equal(request.presence,presence);return {ok:true,data:{actorId}};}}});
    const read=must(await executeFileNode(node('read-file',{targetId:'sword',actorScope:'presence',actorId}),{presence},f.local));
    assert.equal(read.outputs.text.visibility.actorId,actorId);
    const write=must(await executeFileNode(node('write-file',{mode:'add',actorScope:'presence',actorId}),{presence,reference:read.outputs.reference,records:data([{id:'memory-1'}])},f.local));
    assert.equal(write.outputs.projection.visibility.actorId,actorId);assert.equal(f.staged().length,1);assert.equal(f.writes(),0);
    const other='character:elias.png',cross=await executeFileNode(node('write-file',{mode:'add',actorScope:'presence',actorId:other}),{presence:actorPresence(other),reference:read.outputs.reference,records:data([])},{...f.local,authorizeActorFileScope:()=>({ok:true,data:{actorId:other}})});
    assert.equal(cross.error.code,'ACTOR_FILE_SCOPE_MISMATCH');assert.equal(f.staged().length,1);assert.ok(calls.length>=4);
});
test('presence file authority fails closed before file access, projects errors, and catches awaited mutation and cancellation',async()=>{
    const actorId='character:mara.png',settings=node('read-file',{targetId:'sword',actorScope:'presence',actorId});
    let reads=0;const files={read:async()=>{reads++;throw Error('must not read');}};
    for(const authorizeActorFileScope of [undefined,()=>({ok:false,error:{code:'secret-token',message:'password',details:'password'}}),()=>({ok:true,data:{actorId:'other'}})]){
        const result=await executeFileNode(settings,{presence:actorPresence(actorId)},{root:true,phase:'post',files,authorizeActorFileScope});assert.equal(result.ok,false);assert.equal(JSON.stringify(result).includes('password'),false);assert.equal(JSON.stringify(result).includes('secret-token'),false);
    }
    const presence=actorPresence(actorId);
    const changed=await executeFileNode(settings,{presence},{root:true,phase:'post',files,authorizeActorFileScope:async()=>{presence.value.revision='changed';return {ok:true,data:{actorId}};}});
    assert.equal(changed.error.code,'ACTOR_FILE_SCOPE_MISMATCH');assert.equal(Object.isFrozen(presence),false);
    const controller=new AbortController();const canceled=await executeFileNode(settings,{presence:actorPresence(actorId)},{root:true,phase:'post',files,signal:controller.signal,authorizeActorFileScope:async()=>{controller.abort();return {ok:true,data:{actorId}};}});
    assert.equal(canceled.error.code,'ABORTED');assert.equal(reads,0);
});

test('additive selected actor defaults preserve earlier version-one file definition controls and bodies',async()=>{
 const {computeDefinitionIdentity}=await import('../src/workflow/definitions.js');
 for(const operation of ['read-file','write-file']){
  const n=node(operation,operation==='read-file'?{targetId:'sword'}:{}),body={schema:3,runtime:2,mode:'native-post',nodes:{[n.id]:n},wires:{},roles:{},portals:{}},definition={id:operation+'-helper',name:operation,version:1,interface:[],parameters:[],body};
  const original=must(computeDefinitionIdentity(definition)).data,explicit=must(computeDefinitionIdentity({...definition,body:{...body,nodes:{[n.id]:{...n,actorScope:'selected',actorId:''}}}})).data;
  assert.equal(original.semanticHash,explicit.semanticHash);assert.equal(Object.hasOwn(original.materializedDefinition.body.nodes[n.id],'actorScope'),false);assert.equal(Object.hasOwn(original.materializedDefinition.body.nodes[n.id],'actorId'),false);assert.equal(Object.hasOwn(JSON.parse(original.canonicalContent).body.nodes[n.id].controls,'actorScope'),false);
 }
});
