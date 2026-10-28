import {cloneJsonValue} from './operations/json-data.js?v=0.29.1';
import {sha256Text} from './definition-data.js?v=0.29.1';
import {parseVisibility} from './source-manifests.js?v=0.29.1';
import {artifactVisibility} from './artifact-privacy.js?v=0.29.1';
import {freeze} from './record-data.js?v=0.29.1';
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const own=(v,k)=>{if(!plain(v))throw Error();const p=Object.getOwnPropertyDescriptor(v,k);if(p&&(!p.enumerable||!Object.hasOwn(p,'value')))throw Error();return p?.value;};
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const hash=v=>sha256Text(canonical(v));
const text=(value,maximum=256)=>{if(value===undefined||value===null)return null;if(typeof value!=='string'||value.length>maximum)throw Error();return value;};
const flag=(v,k)=>{const value=own(v,k);if(value!==undefined&&typeof value!=='boolean')throw Error();return value===true;};
function timestamp(value){if(value===undefined||value===null)return null;if(value instanceof Date)return Date.prototype.toISOString.call(value);if(typeof value==='string'&&value.length<=128||typeof value==='number'&&Number.isFinite(value))return value;throw Error();}
function disclosure(value){
 const label=own(value,'visibility'),visibleTo=own(value,'visibleTo');let mark={kind:'public'};
 if(label!==undefined){const scope=own(value,'scope'),actorId=own(value,'actorId')??(scope===undefined?undefined:own(scope,'actorId'));const parsed=parseVisibility(typeof label==='string'?{kind:label,...(label==='actor-private'?{actorId}:{})}:label);if(!parsed.ok)throw Error();mark=parsed.data;}
 if(visibleTo!==undefined){const checked=cloneJsonValue(visibleTo);if(!checked.ok||!Array.isArray(checked.data.value)||checked.data.value.length>64||checked.data.value.some(id=>typeof id!=='string'||!id.trim()||id.length>256))throw Error();return {mark,visibleTo:checked.data.value};}
 return {mark};
}
function nonempty(value){if(value===undefined||value===null)return false;if(!Array.isArray(value))throw Error();return value.length>0;}
function messageIdentity(message){
 const selectedText=own(message,'mes');if(typeof selectedText!=='string')throw Error();
 const extra=own(message,'extra')??{};if(!plain(extra))throw Error();
 const name=text(own(message,'name')),nativeRole=text(own(message,'role'),64),isUser=flag(message,'is_user'),isSystem=flag(message,'is_system');
 const role=isSystem?'system':isUser?'user':'assistant',type=text(own(extra,'type'),64);
 const tool=flag(message,'is_tool')||type==='tool'||nativeRole==='tool'||nonempty(own(extra,'tool_calls'))||nonempty(own(extra,'tool_invocations'))||own(extra,'tool_call_id')!==undefined;
 const intermediate=flag(message,'is_intermediate')||flag(extra,'is_intermediate'),unsupported=nativeRole!==null&&!['user','assistant','system','tool'].includes(nativeRole)||flag(extra,'isSmallSys');
 const protocol=tool?'tool':isSystem||nativeRole==='system'?'system':intermediate||unsupported?'unsupported':type==='narrator'?'narrator':'chat';
 const messageDisclosure=disclosure(message),extraDisclosure=disclosure(extra);
 const forcedHidden=isSystem||flag(extra,'is_hidden')||flag(extra,'hidden');
 const visibility=forcedHidden?{kind:'hidden'}:artifactVisibility([{visibility:messageDisclosure.mark,...(messageDisclosure.visibleTo?{visibleTo:messageDisclosure.visibleTo}:{})},{visibility:extraDisclosure.mark,...(extraDisclosure.visibleTo?{visibleTo:extraDisclosure.visibleTo}:{})}]);
 const swipeId=own(message,'swipe_id')??null;if(swipeId!==null&&(!Number.isSafeInteger(swipeId)||swipeId<0))throw Error();
 const swipes=own(message,'swipes'),swipeInfo=own(message,'swipe_info');let selectedSwipeText=null,info={};
 if(swipes!==undefined){if(!Array.isArray(swipes))throw Error();const descriptor=Object.getOwnPropertyDescriptor(swipes,String(swipeId??0));if(descriptor){if(!Object.hasOwn(descriptor,'value')||!descriptor.enumerable||typeof descriptor.value!=='string')throw Error();selectedSwipeText=descriptor.value;}}
 if(swipeInfo!==undefined){if(!Array.isArray(swipeInfo))throw Error();const descriptor=Object.getOwnPropertyDescriptor(swipeInfo,String(swipeId??0));if(descriptor){if(!Object.hasOwn(descriptor,'value')||!descriptor.enumerable||!plain(descriptor.value))throw Error();const selected=descriptor.value;info={sendDate:timestamp(own(selected,'send_date')),genStarted:timestamp(own(selected,'gen_started')),genFinished:timestamp(own(selected,'gen_finished'))};}}
 const sendDate=timestamp(own(message,'send_date')),genStarted=timestamp(own(message,'gen_started')),genFinished=timestamp(own(message,'gen_finished'));
 const settled=selectedText!=='...'&&!intermediate&&!flag(extra,'partial')&&!flag(extra,'unfinished')&&!(genStarted!==null&&genFinished===null);
 const selection={swipeId,text:selectedSwipeText,...info};
 const normalized={text:selectedText,name,role,protocol,visibility,visibleTo:messageDisclosure.visibleTo??extraDisclosure.visibleTo??null,settled,sendDate,genStarted,genFinished,selection};
 const checked=cloneJsonValue(normalized);if(!checked.ok)throw Error();
 const fingerprint=hash(checked.data.value),selectionDigest=hash(selection);
 return freeze({text:selectedText,name,role,protocol,visibility,visibleTo:normalized.visibleTo,settled,selectionDigest,fingerprint,revision:fingerprint});
}
/** Pure bounded normalization of selected native message semantics. No identity authority.
 * Unselected swipe histories and hidden reasoning payloads are never read or hashed. */
export function normalizeNativeSourceMessages(chat){
 try{
  if(!Array.isArray(chat)||Object.getPrototypeOf(chat)!==Array.prototype||chat.length>16384||Reflect.ownKeys(chat).length!==chat.length+1)throw Error();
  const messages=[];for(let i=0;i<chat.length;i++){const descriptor=Object.getOwnPropertyDescriptor(chat,String(i));if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value')||!plain(descriptor.value))throw Error();messages.push(messageIdentity(descriptor.value));}
  return {ok:true,data:freeze(messages)};
 }catch{return {ok:false,error:{code:'SOURCE_IDENTITY_INVALID',message:'Native selected messages require bounded own source semantics.'}};}
}
