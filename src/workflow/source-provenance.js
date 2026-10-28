/** Run-local exact output bindings. Nothing in these handles is portable authority. */
import {inspectSourcePage} from './source-reader.js?v=0.30.1';
import {preserveArtifactPrivacy,validVisibilityMetadata,artifactVisibility} from './artifact-privacy.js?v=0.30.1';
import {freeze,plain,own} from './record-data.js?v=0.30.1';
import {sameSourceIdentity} from './operations/source-spans.js?v=0.30.1';
import {canonicalContextData,inspectContextData} from './operations/context-data.js?v=0.30.1';
import {cloneJsonValue} from './operations/json-data.js?v=0.30.1';
import {sha256Text} from './definition-data.js?v=0.30.1';
const sourceHandles=new WeakMap(),pairingHandles=new WeakMap(),derivations=new WeakMap();
const fail=code=>({ok:false,error:{code,message:'An exact current retained reader output is required.'}});
const good=data=>({ok:true,data});
function exactEnvelope(actual,expected){
 if(!plain(actual)||!Object.isFrozen(actual))return false;
 const descriptors=Object.getOwnPropertyDescriptors(actual),keys=Reflect.ownKeys(descriptors);
 if(keys.some(k=>typeof k!=='string'||!Object.hasOwn(descriptors[k],'value')||!descriptors[k].enumerable)||keys.length!==Object.keys(expected).length)return false;
 for(const key of keys){
  if(!Object.hasOwn(expected,key))return false;
  if(key==='visibility'){
   if(!validVisibilityMetadata(actual))return false;
   const a=artifactVisibility({visibility:actual.visibility}),b=artifactVisibility({visibility:expected.visibility});
   if(a.kind!==b.kind||a.actorId!==b.actorId)return false;
  }else if(descriptors[key].value!==expected[key])return false;
 }
 return true;
}
/** Host-owned lifecycle. No generic transformation or metadata-based lineage admission. */
export function createSourceProofRegistry(options){
 if(!plain(options)||typeof options.isCurrent!=='function'||Object.keys(options).some(k=>!['isCurrent','signal'].includes(k)))throw Error('Trusted current source proof ports required');
 options={...options};
 const owner=Object.freeze({});let cleared=false,results=new WeakMap(),artifacts=new WeakMap();
 const running=()=>{try{if(cleared||options.signal?.aborted||options.isCurrent()!==true){cleared=true;return false;}return true;}catch{cleared=true;return false;}};
 function inspect(page){
  const derived=derivations.get(page);if(derived){if(!running()||derived.owner!==owner)return fail('SOURCE_PROOF_STALE');return derived.current();}
  if(!running())return fail('SOURCE_PROOF_STALE');const first=inspectSourcePage(page);if(!first.ok)return first;
  if(!running())return fail('SOURCE_PROOF_STALE');return inspectSourcePage(page);
 }
 function retained(artifact){
  if(!running())return fail('SOURCE_PROOF_STALE');const entry=artifacts.get(artifact);if(!entry)return fail('SOURCE_PROOF_REQUIRED');
  const view=inspect(entry.page);return view.ok?good({...entry,view:view.data}):view;
 }
 function handle(map,page,view){const token=Object.freeze({});map.set(token,{owner,current:()=>inspect(page),view});return token;}
 return Object.freeze({
  registerReaderResult(result,page){
   const view=inspect(page);if(!view.ok)return view;
   if(result!==view.data.result)return fail('SOURCE_RESULT_UNAUTHORIZED');
   const existing=results.get(result);if(existing&&existing!==page)return fail('SOURCE_RESULT_UNAUTHORIZED');
   results.set(result,page);return good(undefined);
  },
  retainOutput(payload){
   try{
    if(!running())return fail('SOURCE_PROOF_STALE');
    const rawResult=own(payload,'rawResult'),derived=derivations.get(rawResult);
    const page=results.get(rawResult)??(derived?.owner===owner?rawResult:undefined);if(!page)return good({retained:true});
    const view=inspect(page);if(!view.ok)return view;
    const portId=own(payload,'portId'),artifact=own(payload,'artifact');
    const normalized=preserveArtifactPrivacy(view.data.result,own(payload,'inputs'));
    if(!normalized.ok)return normalized;
    const expected=own(normalized.outputs,portId);
    if(!expected||!exactEnvelope(artifact,expected))return fail('SOURCE_OUTPUT_MISMATCH');
    const fresh=inspect(page);if(!fresh.ok)return fresh;
    const prior=artifacts.get(artifact);if(prior&&(prior.page!==page||prior.portId!==portId))return fail('SOURCE_OUTPUT_MISMATCH');
    artifacts.set(artifact,{page,portId});return good({retained:true});
   }catch{return fail('SOURCE_OUTPUT_MISMATCH');}
  },
  authorizeSource(artifact){
   const found=retained(artifact);if(!found.ok)return found;const {page,portId,view}=found.data;
   if(!['out','records','manifest'].includes(portId))return fail('SOURCE_PROOF_REQUIRED');
   const data=freeze({currentHead:view.currentHead,scope:view.scope,sourceEpoch:view.sourceEpoch,selectorHash:view.selectorHash,sourceSetId:view.sourceSetId,snapshotId:view.snapshotId,...(view.triggerCause?{triggerCause:view.triggerCause}:{}),mapping:view.mapping,...(view.processedInputs?{processedInputs:view.processedInputs}:{})});
   return good(handle(sourceHandles,page,data));
  },
  authorizePairing(context,manifest){
   const found=retained(context);if(!found.ok)return found;
   if(found.data.portId!=='out'||own(context,'kind')!=='context')return fail('SOURCE_PAIRING_REQUIRED');
   if(manifest!==undefined){const other=retained(manifest);if(!other.ok)return other;if(other.data.page!==found.data.page||other.data.portId!=='manifest')return fail('SOURCE_PAIRING_REQUIRED');}
   const {page,view}=found.data;
   if(!Array.isArray(view.groups)||!Array.isArray(view.unpairedMemberIds))return fail('SOURCE_PAIRING_REQUIRED');
   const data=freeze({currentHead:view.currentHead,scope:view.scope,sourceEpoch:view.sourceEpoch,selectorHash:view.selectorHash,sourceSetId:view.sourceSetId,snapshotId:view.snapshotId,...(view.triggerCause?{triggerCause:view.triggerCause}:{}),mapping:view.mapping,groups:view.groups,unpairedMemberIds:view.unpairedMemberIds});
   return good(handle(pairingHandles,page,data));
  },
  validateCurrent(artifact){const found=retained(artifact);return found.ok?good(undefined):found;},
  clear(){cleared=true;results=new WeakMap();artifacts=new WeakMap();},
 });
}
function inspectHandle(map,handle){const entry=map.get(handle);if(!entry)return fail('SOURCE_PROOF_REQUIRED');const current=entry.current();return current.ok?good(Object.freeze({...entry.view,currentHead:current.data.currentHead})):current;}
/** Trusted consumers only; mapping is bounded and contains no native references or prose. */
export const inspectSourceProof=handle=>inspectHandle(sourceHandles,handle);
export const inspectPairingProof=handle=>inspectHandle(pairingHandles,handle);

/** Trusted operation adapter only. Not installed in runtime ports or workflow settings.
 * Complete current parents remain retained even when mapping/output is empty. */
export function bindSourceDerivation(result,{parents,mapping,processedMemberIds}){
 try{
  const frozen=value=>value===null||typeof value!=='object'||Object.isFrozen(value)&&Object.values(value).every(frozen);
  if(!inspectContextData(result).ok||!frozen(result)||!inspectContextData(mapping).ok)return fail('SOURCE_DERIVATION_INVALID');
  if(!Object.isFrozen(result)||result.ok!==true||!Array.isArray(parents)||!parents.length||parents.length>1024||!Array.isArray(mapping)||mapping.length>1024||!Array.isArray(processedMemberIds)||processedMemberIds.length>1000)return fail('SOURCE_DERIVATION_INVALID');
  const parentHandles=Object.freeze([...parents]);
  const bindings=parentHandles.map(p=>sourceHandles.get(p));if(bindings.some(b=>!b)||bindings.some(b=>b.owner!==bindings[0].owner))return fail('SOURCE_DERIVATION_INVALID');
  const views=parentHandles.map(inspectSourceProof);if(views.some(v=>!v.ok))return fail('SOURCE_PROOF_STALE');
  const base=views[0].data;if(views.some(v=>!sameSourceIdentity(base,v.data)))return fail('SOURCE_DERIVATION_CONFLICT');
  const available=views.flatMap(v=>v.data.mapping),selectedInputs=processedMemberIds.map(id=>available.find(m=>m.memberId===id));
  if(new Set(processedMemberIds).size!==processedMemberIds.length||selectedInputs.some(m=>!m))return fail('SOURCE_DERIVATION_INVALID');
  const output=own(result.outputs,'out'),kind=own(output,'kind'),records=kind==='data'?own(output,'value'):kind==='context'?own(output,'messages'):null;
  if(!['data','context','text'].includes(kind)||kind!=='text'&&(!Array.isArray(records)||records.length!==mapping.length)||new Set(mapping.map(m=>m.memberId)).size!==mapping.length)return fail('SOURCE_DERIVATION_INVALID');
  const equal=(a,b)=>canonicalContextData(a)===canonicalContextData(b);
  const processedInputs=[];for(const item of [...views.flatMap(v=>v.data.processedInputs??[]),...selectedInputs]){const prior=processedInputs.find(m=>m.memberId===item.memberId);if(prior&&!equal(prior,item))return fail('SOURCE_DERIVATION_CONFLICT');if(!prior)processedInputs.push(item);}
  for(const item of available)if(available.some(m=>m.memberId===item.memberId&&!equal(m,item)))return fail('SOURCE_DERIVATION_CONFLICT');
  const contains=(parent,ref)=>equal(parent.scope,ref.scope)&&parent.sourceId===ref.sourceId&&parent.revision===ref.revision&&parent.kind===ref.kind&&(!ref.span||parent.span&&ref.span.unit==='utf16'&&ref.span.start>=parent.span.start&&ref.span.end<=parent.span.end&&ref.span.end>=ref.span.start);
  const captured=[];
  for(let i=0;i<mapping.length;i++){
   const m=mapping[i],record=records?.[i];if(typeof m.memberId!=='string'||!m.memberId||!['exact','derived-only'].includes(m.mapping)||record&&(m.memberId!==record.id||record.sourceRefs!==undefined&&!equal(m.sourceRefs,record.sourceRefs)||record.visibility!==undefined&&!equal(m.visibility,record.visibility)||record.mapping!==undefined&&record.mapping!==m.mapping))return fail('SOURCE_DERIVATION_INVALID');
   if(m.mapping==='derived-only'&&m.sourceRefs.some(r=>r.span))return fail('SOURCE_DERIVATION_INVALID');
   if(m.mapping==='exact'&&m.sourceRefs.some(r=>!r.span||!Number.isSafeInteger(r.span.start)||!Number.isSafeInteger(r.span.end)))return fail('SOURCE_DERIVATION_INVALID');
   if(m.sourceRefs.some(ref=>!selectedInputs.some(p=>p.sourceRefs.some(r=>contains(r,ref)))))return fail('SOURCE_DERIVATION_INVALID');
   const sourceOrders=[];
   for(const p of selectedInputs)for(const ref of p.sourceRefs){
    if(!m.sourceRefs.some(r=>contains(ref,r)))continue;
    const orders=p.sourceOrders??(p.sourceOrder?[{sourceId:ref.sourceId,revision:ref.revision,...p.sourceOrder}]:[]);
    for(const order of orders)if(order.sourceId===ref.sourceId&&order.revision===ref.revision&&!sourceOrders.some(o=>equal(o,order)))sourceOrders.push(order);
   }
   captured.push({memberId:m.memberId,revision:typeof record?.revision==='string'?record.revision:sha256Text(canonicalContextData(record??output)),sourceRefs:m.sourceRefs,visibility:m.visibility,mapping:m.mapping,sourceOrders});
  }
  if(!cloneJsonValue(captured).ok||!cloneJsonValue(processedInputs).ok)return fail('SOURCE_DERIVATION_INVALID');
  const view=freeze({...base,mapping:structuredClone(captured),processedInputs:structuredClone(processedInputs)});
  let revoked=false;
  const current=()=>{if(revoked)return fail('SOURCE_PROOF_STALE');const fresh=parentHandles.map(inspectSourceProof);if(fresh.some(v=>!v.ok)||fresh.some(v=>!sameSourceIdentity(base,v.data))){revoked=true;return fail('SOURCE_PROOF_STALE');}return good(Object.freeze({...view,currentHead:fresh.every(v=>v.data.currentHead),result}));};
  const fresh=current();if(!fresh.ok)return fresh;
  if(derivations.has(result))return fail('SOURCE_DERIVATION_INVALID');derivations.set(result,{owner:bindings[0].owner,current});return good(undefined);
 }catch{return fail('SOURCE_DERIVATION_INVALID');}
}
