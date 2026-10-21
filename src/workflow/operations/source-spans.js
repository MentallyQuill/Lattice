/** Private, exact UTF-16 projection. Separators are never original source material. */
import {canonicalContextData} from './context-data.js?v=0.27.5';
export function projectSourceSpan(mapping,start,end){
 if(!mapping||mapping.sourceRefs.length!==1)return null;
 const ref=mapping.sourceRefs[0],span=ref.span;
 if(!span||span.unit!=='utf16'||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>span.end-span.start)return null;
 return [{...ref,span:{start:span.start+start,end:span.start+end,unit:'utf16'}}];
}
export function sameSourceIdentity(a,b){return ['scope','sourceEpoch','selectorHash','sourceSetId','snapshotId'].every(key=>canonicalContextData(a[key])===canonicalContextData(b[key]))&&a.triggerCause===b.triggerCause;}
