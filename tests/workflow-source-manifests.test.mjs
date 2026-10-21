import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from '../src/workflow/source-manifests.js';
const scope = {userId:'u',chatId:'c'};
const ref = {sourceId:'s',revision:'r',kind:'chat-message',scope};
const record = {id:'a',revision:'r',scope,sourceRefs:[ref],visibility:{kind:'public'}};
test('scope admission owns frozen exact fields and never executes accessors', () => {
 const input = {...scope,actorId:'actor',branchId:'branch'};
 const result = api.parseScope(input);
 assert.equal(result.ok,true); assert.notEqual(result.data,input); assert.ok(Object.isFrozen(result.data));
 let calls=0; const getter=Object.defineProperty({...scope},'actorId',{enumerable:true,get(){calls++;throw Error();}});
 for(const invalid of [getter,Object.create(scope),{...scope,extra:true},{...scope,userId:''},{...scope,actorId:''},null]) assert.equal(api.parseScope(invalid).ok,false);
 assert.equal(calls,0);
});
test('visibility and source refs enforce exact variants and half-open UTF16 spans', () => {
 for(const v of [{kind:'public'},{kind:'hidden'},{kind:'actor-private',actorId:'a'}]) assert.equal(api.parseVisibility(v).ok,true);
 for(const v of [{kind:'actor-private'},{kind:'public',actorId:'a'},{kind:'hidden',grant:true}]) assert.equal(api.parseVisibility(v).ok,false);
 for(const span of [{start:0,end:0,unit:'utf16'},{start:0,end:Number.MAX_SAFE_INTEGER,unit:'utf16'}]) assert.equal(api.parseSourceRef({...ref,span}).ok,true);
 for(const span of [{start:-1,end:1,unit:'utf16'},{start:2,end:1,unit:'utf16'},{start:0,end:1.1,unit:'utf16'},{start:0,end:1,unit:'bytes'},{start:0,end:1,unit:'utf16',extra:1}]) assert.equal(api.parseSourceRef({...ref,span}).ok,false);
 for(const v of [{...ref,kind:'invented'},{...ref,revision:''},{...ref,scope:{...scope,branchId:''}},{...ref,credential:'x'}]) assert.equal(api.parseSourceRef(v).ok,false);
});
test('record admission preserves JSON extensions and lists have bounded opt-in uniqueness', () => {
 const input={...record,recordType:'event',metadata:{a:[true]},extra:17};
 const got=api.parseRecordV1(input); assert.equal(got.ok,true); assert.deepEqual(got.data,input); assert.ok(Object.isFrozen(got.data.metadata.a));
 assert.equal(api.parseRecordV1({...record,text:7}).ok,false);
 assert.equal(api.parseRecordList([]).ok,true);
 assert.equal(api.parseRecordList(Array.from({length:1024},()=>({...record,sourceRefs:[]}))).ok,true);
 assert.equal(api.parseRecordList(Array.from({length:1025},()=>({...record,sourceRefs:[]}))).ok,false);
 assert.equal(api.parseRecordList([record,{...record,revision:'other'}]).ok,true);
 assert.equal(api.parseRecordList([record,{...record,revision:'other'}],{requireUniqueIdentities:true}).ok,false);
 assert.equal(api.parseRecordList([record,{...record,scope:{...scope,actorId:'a'}}],{requireUniqueIdentities:true}).ok,true);
 assert.equal(api.parseRecordList([record],{maxRecords:0}).ok,false);
 assert.equal(api.parseRecordList([],{maxRecords:1025}).ok,false);
 assert.equal(api.parseRecordList([],{maxRecords:1.1}).ok,false);
 assert.equal(api.parseRecordList([,record]).ok,false);
 let calls=0; const options=Object.defineProperty({},'maxRecords',{enumerable:true,get(){calls++;return 1;}});
 assert.equal(api.parseRecordList([],options).ok,false); assert.equal(calls,0);
});

const sourceManifest = {type:'source-manifest',schemaVersion:1,scope,sourceSetId:'set',snapshotId:'snap',completeness:'page',entries:[{id:'a',revision:'r',sourceRefs:[ref]}],continuation:{opaque:[1]}};
test('source manifests and cursors require closed complete explicit envelopes', () => {
 for(const input of [sourceManifest,{...sourceManifest,completeness:'complete',continuation:null,entries:[]}]) assert.equal(api.parseSourceManifest(input).ok,true);
 for(const input of [{...sourceManifest,completeness:'maybe'},{...sourceManifest,continuation:undefined},{...sourceManifest,schemaVersion:2},{...sourceManifest,entries:[...sourceManifest.entries,...sourceManifest.entries]},{...sourceManifest,entries:[{id:'a',revision:'r',sourceRefs:[],extra:1}]},{...sourceManifest,authority:true}]) assert.equal(api.parseSourceManifest(input).ok,false);
 const cursor={type:'reader-cursor',schemaVersion:1,scope,sourceSetId:'set',snapshotId:'snap',position:{adapter:[null,'opaque']}};
 const parsed=api.parseReaderCursor(cursor); assert.equal(parsed.ok,true); assert.ok(Object.isFrozen(parsed.data.position.adapter));
 const {position,...missing}=cursor; assert.equal(api.parseReaderCursor(missing).ok,false);
 assert.equal(api.parseReaderCursor({...cursor,position:null}).ok,true);
 assert.equal(api.parseReaderCursor({...cursor,read(){throw Error();}}).ok,false);
});
test('derivation and coverage validate lineage and receipt data without granting authority', () => {
 const derivation={type:'derivation-manifest',schemaVersion:1,scope,definitionHash:'def',settingsHash:'settings',entries:[{id:'a',revision:'r',sourceRefs:[ref],parents:[{id:'p',revision:'p1'}]}]};
 assert.equal(api.parseDerivationManifest(derivation).ok,true);
 for(const entries of [[{...derivation.entries[0],parents:[{id:'p'}]}],[...derivation.entries,...derivation.entries]]) assert.equal(api.parseDerivationManifest({...derivation,entries}).ok,false);
 const coverage={type:'coverage-manifest',schemaVersion:1,scope,sourceSetId:'set',snapshotId:'snap',covered:[ref],derivations:[{id:'a',revision:'r'}],receipts:[{receiptId:'forged-looking',targetId:'target',nextRevision:'r2',intentDigest:'claimed'}],replacementDigest:null};
 for(const replacementDigest of [null,'digest']) {const got=api.parseCoverageManifest({...coverage,replacementDigest}); assert.equal(got.ok,true); assert.deepEqual(got.data.receipts,coverage.receipts); assert.ok(Object.isFrozen(got.data.receipts[0]));}
 for(const input of [{...coverage,replacementDigest:3},{...coverage,receipts:[{...coverage.receipts[0],applied:true}]},{...coverage,receipts:[{receiptId:'incomplete'}]},{...coverage,derivations:[{id:'a',revision:''}]}]) assert.equal(api.parseCoverageManifest(input).ok,false);
 const {replacementDigest,...missing}=coverage; assert.equal(api.parseCoverageManifest(missing).ok,false);
});
test('canonical keys bind exact scope and source identity, excluding spans and preserving selector arrays', () => {
 const key=api.canonicalSourceKey(ref); assert.equal(key.ok,true);
 assert.deepEqual(api.canonicalSourceKey({...ref,span:{start:1,end:2,unit:'utf16'}}),key);
 assert.notEqual(api.canonicalSourceKey({...ref,revision:'next'}).data,key.data);
 assert.notEqual(api.canonicalSourceKey({...ref,scope:{...scope,actorId:'a'}}).data,key.data);
 assert.equal(api.canonicalSourceKey({...ref,kind:'invalid'}).ok,false);
 const a=api.canonicalSourceSetKey(scope,{z:{b:2,a:1},array:[2,1]});
 assert.deepEqual(api.canonicalSourceSetKey({chatId:'c',userId:'u'},{array:[2,1],z:{a:1,b:2}}),a);
 assert.notEqual(api.canonicalSourceSetKey(scope,{z:{a:1,b:2},array:[1,2]}).data,a.data);
 assert.notEqual(api.canonicalSourceSetKey({...scope,branchId:'b'},{z:{a:1,b:2},array:[2,1]}).data,a.data);
 assert.equal(api.canonicalSourceSetKey(scope,()=>1).ok,false);
 assert.deepEqual(api.sameScope(scope,{chatId:'c',userId:'u'}),{ok:true,data:true});
 assert.deepEqual(api.sameScope(scope,{...scope,actorId:'a'}),{ok:true,data:false});
 assert.equal(api.sameScope(scope,{...scope,actorId:''}).ok,false);
});
test('record-list settings reject explicit null rather than inventing a default', () => {
 assert.equal(api.parseRecordList([],{maxRecords:null}).ok,false);
});
test('all public parsers reject executable/exotic/sparse JSON without calling hooks or throwing', () => {
 let calls=0;
 const accessor=Object.defineProperty({},'scope',{enumerable:true,get(){calls++;throw Error('secret');}});
 const cycle={}; cycle.self=cycle;
 const inherited=Object.create({userId:'u',chatId:'c'});
 const exotic=[new Date(),new Map(),new Set(),Object.create({}),inherited,accessor,cycle,[,1],NaN,Infinity,1n,()=>{calls++;}, {toJSON(){calls++;return scope;}},Object.assign([], {named:1})];
 const symbol={...scope}; symbol[Symbol('x')]=1; exotic.push(symbol);
 for(const name of ['parseScope','parseVisibility','parseSourceRef','parseRecordV1','parseRecordList','parseSourceManifest','parseReaderCursor','parseDerivationManifest','parseCoverageManifest']) {
  for(const value of exotic) { const result=api[name](value); assert.equal(result.ok,false,name); assert.ok(Object.isFrozen(result.error)); assert.equal(JSON.stringify(result).includes('secret'),false); }
 }
 assert.equal(calls,0);
});
test('bounded JSON byte, depth and value limits remain in force for extensible records', () => {
 assert.equal(api.parseRecordV1({...record,text:'x'.repeat(262144)}).ok,false);
 assert.equal(api.parseRecordV1({...record,text:'é'.repeat(131072)}).ok,false);
 let depth=0; for(let i=0;i<33;i++) depth={child:depth};
 assert.equal(api.parseRecordV1({...record,deep:depth}).ok,false);
 assert.equal(api.parseRecordV1({...record,values:Array(10000).fill(null)}).ok,false);
 const dangerous=JSON.parse('{"__proto__":{"safe":true},"constructor":{"safe":true}}');
 const parsed=api.parseRecordV1({...record,...dangerous}); assert.equal(parsed.ok,true); assert.equal(Object.hasOwn(parsed.data,'__proto__'),true); assert.equal({}.safe,undefined);
 const huge=api.parseRecordList(Array.from({length:1024},()=>record)); assert.equal(huge.ok,false,'aggregate value limit precedes record count');
});
