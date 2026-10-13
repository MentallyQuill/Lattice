import {snapshotDraft,readDraftBody} from './draft-revisions.js?v=0.27.2';
import {sourceFromDraft,validateOccurrences} from './operations/event-data.js?v=0.27.2';
import {cloneJsonValue} from './operations/json-data.js?v=0.27.2';
import {artifactVisibility} from './artifact-privacy.js?v=0.27.2';
import {own,plain,freeze} from './record-data.js?v=0.27.2';
const fail=(code,message)=>({ok:false,error:{code,message}}),good=data=>({ok:true,...(data===undefined?{}:{data})});
const registries=new WeakSet();
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':plain(value)?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const sourceKey=source=>canonical(Object.fromEntries(Object.entries(source).filter(([key])=>key!=='text')));
export const isNativeDraftEvidenceRegistry=value=>registries.has(value);
/** A private registry binds re-extraction to live native Draft authority. It is never serialized. */
export function createNativeDraftEvidenceRegistry(config) {
 if(!plain(config)||typeof own(config,'getOriginalDraft')!=='function'||typeof own(config,'isCurrent')!=='function'||own(config,'signal')!==undefined&&!(own(config,'signal')instanceof AbortSignal))return fail('INVALID_DRAFT_EVIDENCE_CONFIG','Use trusted native Draft ownership callbacks.');
 const getOriginalDraft=own(config,'getOriginalDraft'),isCurrent=own(config,'isCurrent'),signal=own(config,'signal'),proofs=new Map();let released=false;
 const current=()=>{if(released||signal?.aborted)return false;try{const value=isCurrent();return value===true&&!released&&!signal?.aborted;}catch{return false;}};
 const owned=draft=>{
  if(!current())return fail('STALE_DRAFT_EVIDENCE','Native Draft evidence authority changed.');
  let original;try{original=getOriginalDraft();}catch{return fail('NATIVE_SOURCE_REQUIRED','The owned native Draft is unavailable.');}
  if(!current())return fail('STALE_DRAFT_EVIDENCE','Native Draft evidence authority changed.');
  const root=snapshotDraft(original),checked=snapshotDraft(draft),body=readDraftBody(draft),rootBody=readDraftBody(original);
  if(!root.ok||!checked.ok||!body.ok||!rootBody.ok||typeof root.data.draft.source.token!=='string'||!root.data.draft.source.token||checked.data.draft.source.token!==root.data.draft.source.token||checked.data.original!==root.data.original||!checked.data.revised&&body.data.text!==rootBody.data.text)return fail('UNTRUSTED_DRAFT_EVIDENCE','Evidence must originate from this native Draft or its authentic revisions.');
  if(!current())return fail('STALE_DRAFT_EVIDENCE','Native Draft evidence authority changed.');
  return good({draft:checked.data.draft,body:body.data});
 };
 const registry=freeze({
  retain(input){
   if(!plain(input))return fail('INVALID_DRAFT_EVIDENCE','Use the exact Draft Event Source inputs and output.');
   const scope=cloneJsonValue(own(input,'scope')),source=cloneJsonValue(own(input,'source'));
   if(!scope.ok||!source.ok||scope.data.value?.kind!=='data'||source.data.value?.kind!=='data')return fail('INVALID_DRAFT_EVIDENCE','Draft source scope and result require Data envelopes.');
   const owner=owned(own(input,'draft'));if(!owner.ok)return owner;
   const expected=sourceFromDraft(owner.data.draft,scope.data.value.value);if(!expected.ok||canonical(expected.data.source)!==canonical(source.data.value.value))return fail('DRAFT_SOURCE_MISMATCH','Captured source must describe the exact narrative body and scope.');
   const visibility=artifactVisibility({draft:owner.data.draft,scope:scope.data.value});
   if(visibility.kind==='hidden'||visibility.kind==='actor-private'&&(expected.data.source.visibility!=='actor-private'||expected.data.source.actorId!==visibility.actorId))return fail('DRAFT_DISCLOSURE_MISMATCH','Evidence cannot declassify private narrative material.');
   const canonicalSource=freeze({...expected.data.source,revision:owner.data.body.provenance.revisionId??owner.data.draft.source.token});
   const sourceArtifact=freeze({...source.data.value,value:canonicalSource});
   const key=sourceKey(canonicalSource),proof=freeze({source:canonicalSource,body:owner.data.body.text,revisionId:owner.data.body.provenance.revisionId,token:owner.data.draft.source.token});
   if(proofs.has(key)&&canonical(proofs.get(key))!==canonical(proof))return fail('DRAFT_SOURCE_CONFLICT','A captured source identity already describes another body.');
   if(!proofs.has(key)&&proofs.size>=256)return fail('DRAFT_EVIDENCE_LIMIT','A run retains at most 256 canonical narrative sources.');
   if(!current())return fail('STALE_DRAFT_EVIDENCE','Native Draft evidence authority changed.');
   proofs.set(key,proof);return good({retained:true,source:sourceArtifact});
  },
  validate(raw,finalDraft){
   const events=validateOccurrences(raw,{status:'confirmed'});if(!events.ok)return fail('INVALID_FILE_EVIDENCE','Canonical writes require confirmed occurrences.');
   const final=owned(finalDraft);if(!final.ok)return final;
   for(const event of events.data.events){const proof=proofs.get(sourceKey(event.source));if(!proof||event.source.watch!=='draft'||proof.token!==final.data.draft.source.token||proof.body!==final.data.body.text||proof.revisionId!==final.data.body.provenance.revisionId||proof.body.slice(event.position.start,event.position.end)!==event.evidence.text)return fail('FINAL_EVIDENCE_REEXTRACT_REQUIRED','Reextract canonical occurrences from the authoritative final narrative body.');}
   return current()?good():fail('STALE_DRAFT_EVIDENCE','Native Draft evidence authority changed.');
  },release(){released=true;proofs.clear();}
 });registries.add(registry);return good(registry);
}
