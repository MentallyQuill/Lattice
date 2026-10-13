import { advanceStoryClock } from '../workflow/story-time.js?v=0.27.1';
import {freeze} from '../workflow/record-data.js?v=0.27.1';
const fail=(code,message)=>({ok:false,error:{code,message}}),stale=()=>fail('STALE_DOCUMENT_SETUP','The user, chat or Workflow Data catalog changed. Refresh setup before applying this edit.');
const sameScope=(a,b)=>a?.userId===b?.userId&&a?.chatId===b?.chatId;
const summaries=lease=>lease.documents.map(({content,...summary})=>summary);
/** Settings-only authorizations. No canonical document bytes or runtime write capabilities are exposed. */
export function createStoryDocumentSetup(catalog){
 let owner=null;
 const current=key=>{const captured=owner;try{return captured?.key===key&&captured.lease.isCurrent()===true&&owner===captured;}catch{return false;}};
 const snapshot=()=>{try{const captured=catalog.capture();if(!captured.ok)return fail('DOCUMENT_SETUP_UNAVAILABLE','Workflow Data requires an active user and chat.');const view=catalog.snapshot(),revision=catalog.revision();if(!view.ok||!captured.data.isCurrent())return stale();const key=globalThis.crypto.randomUUID();owner={key,lease:captured.data};return {ok:true,data:freeze({key,revision,scope:view.data.scope,documents:view.data.documents,issue:''})};}catch{return fail('DOCUMENT_SETUP_UNAVAILABLE','Workflow Data setup is unavailable for the active user and chat.');}};
 const load=(key,targetId)=>{if(!current(key))return stale();try{const result=catalog.definition(targetId);if(!current(key))return stale();return result.ok?{ok:true,data:freeze({definition:result.data})}:fail('DOCUMENT_NOT_AUTHORIZED','Choose an authorized workflow data document before loading its initial template.');}catch{return fail('DOCUMENT_SETUP_FAILED','The initial template could not be loaded.');}};
 const update=async(key,perform)=>{
  if(!current(key))return stale();const previous=owner;
  let changed;try{changed=perform(previous.lease);}catch{return fail('INVALID_DOCUMENT_SETUP','Use a named logical target, a valid initial template and explicit visibility.');}
  if(!changed?.ok){const code=changed?.error?.code;if(['STALE_DOCUMENT_SCOPE','DOCUMENT_LEASE_UNAUTHORIZED'].includes(code))return stale();return code==='FILE_FORMAT_LOCKED'?fail(code,'An existing canonical document keeps its format. Create a different logical target to convert it.'):fail('INVALID_DOCUMENT_SETUP','Use a named logical target, a valid initial template and explicit visibility.');}
  let installed;try{installed=catalog.capture();if(!installed.ok||!sameScope(previous.lease.scope,installed.data.scope)||JSON.stringify(changed.data.documents)!==JSON.stringify(summaries(installed.data))||!installed.data.isCurrent())return stale();}catch{return stale();}
  let saved;try{saved=await catalog.save();}catch{saved=null;}
  if(!installed.data.isCurrent())return stale();
  return {ok:true,data:{acknowledged:saved?.ok===true&&saved.data?.acknowledged===true,message:saved?.ok===true&&saved.data?.acknowledged===true?'Workflow Data authorization saved and verified.':'Workflow Data authorization updated locally; SillyTavern save is unconfirmed.'}};
 };
 return Object.freeze({snapshot,load,save:(key,value)=>update(key,lease=>catalog.defineCaptured(lease,value)),remove:(key,id)=>update(key,lease=>catalog.removeCaptured(lease,id)),isCurrent:current});
}

/** Author an explicit story clock template without reading the machine clock. */
export function createStoryClockTemplate(clockId,calendarId,absoluteMinute=0){
 const clock={schemaVersion:1,clockId,calendarId,dayLengthMinutes:1440,absoluteMinute,revision:1,unit:'minute',originMinute:0,originDay:1,timeEvidence:{kind:'explicit'}};
 const checked=advanceStoryClock(clock,{kind:'duration',minutes:0});
 return checked.ok?{ok:true,data:{text:JSON.stringify(clock,null,2)}}:fail('INVALID_CLOCK_TEMPLATE','Choose explicit clock/calendar IDs and a nonnegative whole story minute.');
}
