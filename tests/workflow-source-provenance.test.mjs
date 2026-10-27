import assert from 'node:assert/strict';
import test from 'node:test';
import {createNativePersistenceVerifier} from '../src/workflow/native-persistence.js?v=0.29.0';
import {createNativeSourceRegistry} from '../src/workflow/native-source-registry.js?v=0.29.0';
import {selectSourcePage,inspectSourcePage} from '../src/workflow/source-reader.js?v=0.29.0';
import {preserveArtifactPrivacy} from '../src/workflow/artifact-privacy.js?v=0.29.0';
import {freezeArtifact} from '../src/workflow/runtime.js?v=0.29.0';
const api=await import('../src/workflow/source-provenance.js?v=0.29.0').catch(()=>({}));
async function fixture(options={},captureOptions={}){
 let serial=0,saved;const chat=[{mes:'question',is_user:true},{mes:'reply'}];
 const context={chatId:'story',characterId:0,groupId:null,chat,characters:[{name:'Mara',avatar:'Mara.png',chat:'Story'}],chatMetadata:{},getRequestHeaders:()=>({'Content-Type':'application/json'}),saveMetadata:async()=>{saved=structuredClone(context.chatMetadata);}};
 const persistenceVerifier=createNativePersistenceVerifier({getContext:()=>context,getUserId:()=> 'user',fetch:async()=>({ok:true,text:async()=>JSON.stringify([{chat_metadata:saved},...chat])})});
 const registry=createNativeSourceRegistry({getContext:()=>context,getUserId:()=> 'user',persistenceVerifier,randomId:()=>`id-${++serial}`});
 assert.equal((await registry.synchronize({expectedRevision:null,cause:'enroll'})).ok,true);
 const snapshot=registry.capture({chat:[...chat],scope:{userId:'user',chatId:'story'},selector:{roles:['user','assistant']},isCurrent:()=>true,...captureOptions}).data;
 const page=selectSourcePage(snapshot,{selection:'recent',recentMessages:2,maxMessages:1000,maxTextUnits:100000}).data;
 const proofs=api.createSourceProofRegistry({isCurrent:()=>true,...options});
 const payload=(portId,artifact=page.outputs[portId],extra={})=>({node:{id:'reader',operation:'scene-context'},address:{nodeId:'reader',instancePath:[]},inputs:{},artifact,portId,rawResult:page.result,...extra});
 return {context,registry,page,proofs,payload};
}
test('only exact privately branded reader page and raw result can register',async()=>{
 assert.equal(typeof api.createSourceProofRegistry,'function');const f=await fixture();
 assert.equal(f.proofs.registerReaderResult(f.page.result,{...f.page}).error.code,'SOURCE_PAGE_UNAUTHORIZED');
 assert.equal(f.proofs.registerReaderResult({...f.page.result},f.page).error.code,'SOURCE_RESULT_UNAUTHORIZED');
 assert.equal(f.proofs.registerReaderResult(f.page.result,f.page).ok,true);
 assert.equal(f.proofs.authorizeSource(f.page.outputs.out).ok,false,'registration alone does not retain runtime output');
 assert.equal(f.proofs.retainOutput(f.payload('out')).ok,true);
 const proof=f.proofs.authorizeSource(f.page.outputs.out);assert.equal(proof.ok,true);assert.deepEqual(Object.keys(proof.data),[]);assert.equal(JSON.stringify(proof.data),'{}');
 const view=api.inspectSourceProof(proof.data);assert.equal(view.ok,true);assert.equal(view.data.mapping.length,2);assert.equal(typeof view.data.sourceEpoch,'string');assert.equal(typeof view.data.selectorHash,'string');assert.doesNotMatch(JSON.stringify(view.data),/question|reply|chatMetadata/);
 assert.equal(api.inspectSourceProof({...proof.data}).ok,false);
});
test('private mapping carries native order revision and ordinals without publishing them',async()=>{
 const f=await fixture();f.proofs.registerReaderResult(f.page.result,f.page);f.proofs.retainOutput(f.payload('out'));
 const view=api.inspectSourceProof(f.proofs.authorizeSource(f.page.outputs.out).data).data;
 assert.deepEqual(view.mapping.map(m=>m.sourceOrder?.messageOrdinal),[0,1]);
 assert.ok(view.mapping.every(m=>typeof m.sourceOrder.orderRevision==='string'));
 assert.doesNotMatch(JSON.stringify(f.page.outputs),/messageOrdinal|"sourceOrder"/);
});
test('privacy envelope clones preserve identity while deep copies, wrong port/kind and added metadata fail',async()=>{
 const f=await fixture();f.proofs.registerReaderResult(f.page.result,f.page);
 const inputs={trigger:{kind:'data',value:[],visibility:{kind:'actor-private',actorId:'mara'}}};
 const normalized=preserveArtifactPrivacy(f.page.result,inputs),out=freezeArtifact(normalized.outputs.out);
 assert.notEqual(out,f.page.outputs.out);assert.equal(out.messages,f.page.outputs.out.messages);
 assert.equal(f.proofs.retainOutput(f.payload('out',out,{inputs})).ok,true);assert.equal(f.proofs.authorizeSource(out).ok,true);
 for(const artifact of [freezeArtifact(structuredClone(out)),freezeArtifact({...out,kind:'data',value:[]}),freezeArtifact({...out,invented:'mapping'}),freezeArtifact({...out,visibility:{kind:'public'}})])assert.equal(f.proofs.retainOutput(f.payload('out',artifact,{inputs})).ok,false);
 assert.equal(f.proofs.retainOutput(f.payload('manifest',out,{inputs})).ok,false);
 assert.equal(f.proofs.authorizeSource(freezeArtifact({...out})).ok,false);
});
test('pairing requires exact retained Context and optional manifest from same current page',async()=>{
 const a=await fixture(),b=await fixture();for(const f of [a,b]){f.proofs.registerReaderResult(f.page.result,f.page);f.proofs.retainOutput(f.payload('out'));f.proofs.retainOutput(f.payload('manifest'));}
 assert.equal(a.proofs.authorizePairing(a.page.outputs.out,b.page.outputs.manifest).ok,false);
 assert.equal(a.proofs.authorizePairing(a.page.outputs.out,structuredClone(a.page.outputs.manifest)).ok,false);
 const proof=a.proofs.authorizePairing(a.page.outputs.out,a.page.outputs.manifest);assert.equal(proof.ok,true);
 const view=api.inspectPairingProof(proof.data);assert.equal(view.ok,true);assert.deepEqual(view.data.groups,inspectSourcePage(a.page).data.groups);
 a.context.chat[0].mes='edited';assert.equal(api.inspectPairingProof(proof.data).ok,false);assert.equal(a.proofs.validateCurrent(a.page.outputs.out).ok,false);
});
test('scope/current callbacks, cancellation, source release and clear revoke all existing handles and later authorization',async()=>{
 for(const action of ['current','cancel','release','clear']){
  let current=true;const controller=new AbortController(),f=await fixture({isCurrent:()=>current,signal:controller.signal});f.proofs.registerReaderResult(f.page.result,f.page);f.proofs.retainOutput(f.payload('out'));
  const proof=f.proofs.authorizeSource(f.page.outputs.out).data;
  if(action==='current')current=false;if(action==='cancel')controller.abort();if(action==='release')f.registry.release();if(action==='clear')f.proofs.clear();
  assert.equal(f.proofs.authorizeSource(f.page.outputs.out).ok,false);assert.equal(api.inspectSourceProof(proof).ok,false);assert.equal(f.proofs.retainOutput(f.payload('out')).ok,false);
 }
});
test('unrelated outputs retain successfully without gaining authority; copied Context and metadata cannot authorize',async()=>{
 const f=await fixture();const imported=freezeArtifact(structuredClone(f.page.outputs.out));
 assert.equal(f.proofs.retainOutput(f.payload('out',imported,{rawResult:{ok:true,artifact:imported}})).ok,true);
 assert.equal(f.proofs.authorizeSource(imported).ok,false);assert.equal(f.proofs.authorizePairing(imported).ok,false);
});
test('observed run revocation is terminal even if a current callback later returns true',async()=>{
 let current=true;const f=await fixture({isCurrent:()=>current});f.proofs.registerReaderResult(f.page.result,f.page);f.proofs.retainOutput(f.payload('out'));
 const handle=f.proofs.authorizeSource(f.page.outputs.out).data;current=false;assert.equal(api.inspectSourceProof(handle).ok,false);current=true;
 assert.equal(f.proofs.authorizeSource(f.page.outputs.out).ok,false);assert.equal(api.inspectSourceProof(handle).ok,false);
});
test('caller mutation of derivation parents cannot remove freshness checks or upgrade an owned prefix',async()=>{
 for(const mutation of ['clear','reverse','replace']){
  const f=await fixture({}, {allowPrefixAppend:()=>true});f.proofs.registerReaderResult(f.page.result,f.page);
  for(const port of ['out','records'])assert.equal(f.proofs.retainOutput(f.payload(port)).ok,true);
  const original=f.proofs.authorizeSource(f.page.outputs.out).data,parents=[original,f.proofs.authorizeSource(f.page.outputs.records).data];
  const result=freezeArtifact({ok:true,outputs:{out:{kind:'data',value:[],visibility:{kind:'public'}}}});
  assert.equal(api.bindSourceDerivation(result,{parents,processedMemberIds:f.page.outputs.out.messages.map(m=>m.id),mapping:[]}).ok,true);
  assert.equal(f.proofs.retainOutput(f.payload('out',result.outputs.out,{rawResult:result})).ok,true);
  const derived=f.proofs.authorizeSource(result.outputs.out).data;
  f.context.chat.push({mes:'owned append'});
  assert.equal(api.inspectSourceProof(original).data.currentHead,false);
  assert.equal(api.inspectSourceProof(derived).data.currentHead,false);
  if(mutation==='clear')parents.length=0;
  if(mutation==='reverse')parents.reverse();
  if(mutation==='replace')parents.splice(0,parents.length,Object.freeze({}));
  const current=api.inspectSourceProof(derived);assert.equal(current.ok,true,mutation);assert.equal(current.data.currentHead,false,mutation);
  f.context.chat[0].mes='edited original source';
  assert.equal(api.inspectSourceProof(original).ok,false,mutation);
  assert.equal(api.inspectSourceProof(derived).ok,false,mutation);
  assert.equal(f.proofs.validateCurrent(result.outputs.out).ok,false,mutation);
 }
});
