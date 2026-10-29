import {cloneJsonValue} from './operations/json-data.js?v=0.30.2';
import {inspectDocumentHistory,validateDocumentHistory} from './document-history.js?v=0.30.2';
import {sha256Text} from './definition-data.js?v=0.30.2';
import {validVisibilityMetadata} from './artifact-privacy.js?v=0.30.2';
const fail=()=>({ok:false,error:{code:'FILE_RECOVERY_TRANSFER_INVALID',message:'The selected recovery history could not be verified.'}});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const id=value=>typeof value==='string'&&value.length>0&&value.length<=256;
const sameScope=(left,right)=>plain(left)&&plain(right)&&Object.keys(left).every(key=>['userId','chatId','actorId'].includes(key))&&left.userId===right.userId&&left.chatId===right.chatId&&(left.actorId??null)===(right.actorId??null);
export const validHistoryReference=value=>plain(value)&&Object.keys(value).length===2&&id(value.pageId)&&/^sha256:[a-f0-9]{64}$/.test(value.hash);
export const historyReference=page=>({pageId:page.pageId,hash:sha256Text(JSON.stringify(page))});
/** Keep document bytes independent of bounded metadata and individually admitted pages. */
export function captureHistorySnapshot(raw){
 try{
  if(!plain(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return fail();
  const descriptors=Object.getOwnPropertyDescriptors(raw),metadata={};
  for(const key of Reflect.ownKeys(raw)){const property=descriptors[key];if(typeof key!=='string'||!property.enumerable||!Object.hasOwn(property,'value'))return fail();if(key!=='content')Object.defineProperty(metadata,key,{value:property.value,enumerable:true});}
  const content=descriptors.content?.value,checked=cloneJsonValue(metadata);
  if(typeof content!=='string'||new TextEncoder().encode(content).byteLength>262144||!checked.ok)return fail();
  return {ok:true,data:{...checked.data.value,content}};
 }catch{return fail();}
}
export function captureHistoryAdoption(raw){
 try{
  if(!plain(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return fail();
  const descriptors=Object.getOwnPropertyDescriptors(raw);
  if(Reflect.ownKeys(raw).some(key=>!['snapshot','pages'].includes(key)||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value')))return fail();
  const snapshot=captureHistorySnapshot(descriptors.snapshot?.value);if(!snapshot.ok)return snapshot;
  const inspected=inspectDocumentHistory({targetId:snapshot.data.targetId,scope:snapshot.data.scope,history:snapshot.data.history,pages:descriptors.pages?.value});if(!inspected.ok)return inspected;
  return {ok:true,data:{snapshot:snapshot.data,pages:Object.fromEntries(inspected.data.pages.map(page=>[page.pageId,page]))}};
 }catch{return fail();}
}
export function parseHistoryPage(pageText,previous){
 try{
  if(typeof pageText!=='string'||new TextEncoder().encode(pageText).byteLength>262144||previous!==null&&!validHistoryReference(previous))return fail();
  const checked=cloneJsonValue(JSON.parse(pageText));if(!checked.ok||!plain(checked.data.value)||checked.data.value.previous!==(previous?.pageId??null))return fail();
  return {ok:true,data:checked.data.value};
 }catch{return fail();}
}
export async function validateHistoryTransfer(data,{targetId,scope,visibility}={}){
 const snapshot=captureHistorySnapshot(data?.snapshot);if(!snapshot.ok)return snapshot;
 const value=snapshot.data;
 if(value.targetId!==targetId||!sameScope(value.scope,scope)||!['text','json','jsonl','csv','markdown'].includes(value.format)||!(id(value.revision)||Number.isSafeInteger(value.revision)&&value.revision>=0)||!Array.isArray(value.receipts)||value.receipts.length>256||!validVisibilityMetadata({visibility:data.visibility})||!validVisibilityMetadata({visibility}))return fail();
 const inspected=await validateDocumentHistory({targetId,scope,history:value.history,pages:data.pages});if(!inspected.ok)return inspected;
 const allowed=mark=>mark.kind==='public'||visibility.kind==='hidden'||mark.kind==='actor-private'&&visibility.kind==='actor-private'&&mark.actorId===visibility.actorId;
 if(data.visibility.kind==='actor-private'&&data.visibility.actorId!==scope.actorId||inspected.data.privateActorIds.some(actor=>actor!==scope.actorId)||!allowed(data.visibility)||!allowed(inspected.data.visibility))return {ok:false,error:{code:'PRIVATE_DESTINATION',message:'The retained history keeps its original actor and document privacy.'}};
 return {ok:true,data:{snapshot:value,pages:Object.fromEntries(inspected.data.pages.map(page=>[page.pageId,page])),visibility:data.visibility}};
}
