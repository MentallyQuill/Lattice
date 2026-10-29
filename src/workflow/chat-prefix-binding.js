import {sha256Text} from './definition-data.js?v=0.30.2';
import {cloneJsonValue} from './operations/json-data.js?v=0.30.2';

/** A host-authored digest of accepted source, never model-authored document data. */
export function validChatSourceBinding(raw){
    const checked=cloneJsonValue(raw);if(!checked.ok)return false;
    const value=checked.data.value;
    return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===3&&value.schemaVersion===1&&Number.isSafeInteger(value.messageCount)&&value.messageCount>=0&&typeof value.prefixHash==='string'&&/^sha256:[a-f0-9]{64}$/.test(value.prefixHash);
}
/** Capture serialization now, before generation mutates the live chat. */
export function createChatPrefixBinding(chat,serialize){
    let prefix;try{const text=serialize(chat);if(text===null)return null;prefix=JSON.parse(text);if(!Array.isArray(prefix))return null;}catch{return null;}
    const stamp=Object.freeze({schemaVersion:1,messageCount:prefix.length,prefixHash:sha256Text(JSON.stringify(prefix))});
    return Object.freeze({stamp,matches:raw=>validChatSourceBinding(raw)&&raw.messageCount<=prefix.length&&raw.prefixHash===sha256Text(JSON.stringify(prefix.slice(0,raw.messageCount)))});
}
