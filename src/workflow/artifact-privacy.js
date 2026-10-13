import { plain, freeze } from './record-data.js?v=0.27.1';
const fail=()=>({ok:false,error:{code:'PRIVATE_MATERIAL',message:'Public reply assembly cannot disclose restricted evidence or decisions.'}});
const actorId=value=>typeof value==='string'&&!!value.trim()&&value.length<=256;
const publicMark=Object.freeze({kind:'public'}),hiddenMark=Object.freeze({kind:'hidden'});
const field=(value,key)=>{const property=Object.getOwnPropertyDescriptor(value,key);return property&&Object.hasOwn(property,'value')?property.value:undefined;};
/** Disclosure provenance is conservative: selecting, counting or comparing never makes private evidence public. */
export function artifactVisibility(material){
 let mark=publicMark,entries=0;const visited=new Set();
 const restrict=next=>{if(next.kind==='public')return;if(mark.kind==='public'){mark=next;return;}if(mark.kind!==next.kind||mark.actorId!==next.actorId)mark=hiddenMark;};
 const visit=(value,depth=0)=>{
  if(value===null||typeof value!=='object')return;
  if(++entries>20000||depth>40){restrict(hiddenMark);return;}
  if(visited.has(value))return;visited.add(value);
  if(!Array.isArray(value)&&!plain(value)){restrict(hiddenMark);return;}
  const properties=Object.getOwnPropertyDescriptors(value);
  if(Object.values(properties).some(property=>!Object.hasOwn(property,'value'))){restrict(hiddenMark);return;}
  if(Object.hasOwn(properties,'visibility')){
   const label=field(value,'visibility');
   if(label==='public'||plain(label)&&field(label,'kind')==='public'){}
   else if(plain(label)&&field(label,'kind')==='actor-private'&&actorId(field(label,'actorId')))restrict({kind:'actor-private',actorId:field(label,'actorId')});
   else if(label==='actor-private'&&actorId(field(value,'actorId')??field(field(value,'scope')??{},'actorId')))restrict({kind:'actor-private',actorId:field(value,'actorId')??field(field(value,'scope')??{},'actorId')});
   else restrict(hiddenMark);
  }
  if(Object.hasOwn(properties,'visibleTo'))restrict(hiddenMark);
  if(['actor-state','reflection','state-proposal','episodes','commit-intent'].includes(field(value,'recordType'))){const actor=field(field(value,'scope')??{},'actorId');restrict(actorId(actor)?{kind:'actor-private',actorId:actor}:hiddenMark);}
  for(const property of Object.values(properties))visit(property.value,depth+1);
 };
 try{visit(material);}catch{return hiddenMark;}return mark.kind==='public'?publicMark:mark.kind==='hidden'?hiddenMark:freeze({...mark});
}
export function validVisibilityMetadata(artifact){
 if(!Object.hasOwn(artifact,'visibility'))return true;
 const mark=field(artifact,'visibility');
 if(['public','hidden','actor-private'].includes(mark))return mark!=='actor-private'||actorId(field(artifact,'actorId')??field(field(artifact,'scope')??{},'actorId'));
 if(!plain(mark))return false;
 const properties=Object.getOwnPropertyDescriptors(mark);
 if(Object.values(properties).some(property=>!Object.hasOwn(property,'value'))||Object.keys(properties).some(key=>!['kind','actorId'].includes(key)))return false;
 return ['public','hidden'].includes(mark.kind)?Object.keys(properties).length===1:mark.kind==='actor-private'&&actorId(mark.actorId)&&Object.keys(properties).length===2;
}
/** Preserve exact public Draft/FileRef authority; only descriptive artifact envelopes receive new labels. */
export function preserveArtifactPrivacy(result,inputs){
 if(!result?.ok)return result;
 const inherit=artifact=>{const visibility=artifactVisibility({inputs,artifact});if(visibility.kind==='public')return artifact;if(['draft','patches','candidate'].includes(artifact?.kind))return null;const explicit=Object.hasOwn(artifact,'visibility')&&validVisibilityMetadata(artifact)?artifactVisibility({visibility:artifact.visibility,actorId:artifact.actorId,scope:artifact.scope}):publicMark;if(explicit.kind===visibility.kind&&explicit.actorId===visibility.actorId)return artifact;return freeze({...artifact,visibility});};
 if(result.artifact!==undefined){const artifact=inherit(result.artifact);if(artifact===null)return fail();result={...result,artifact};}
 if(result.outputs!==undefined){const outputs={};for(const [key,value] of Object.entries(result.outputs)){const artifact=inherit(value);if(artifact===null)return fail();outputs[key]=artifact;}result={...result,outputs};}
 return result;
}
