import { normalizeNativeSourceMessages } from './native-source-identity.js?v=0.28.0';
import { cloneJsonValue } from './operations/json-data.js?v=0.28.0';
const fail=(code,message)=>({ok:false,error:{code,message}});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const identifier=value=>typeof value==='string'&&!!value.trim()&&value.length<=128&&!['__proto__','prototype','constructor'].includes(value)&&!/[\r\n]/.test(value);
const getOwnDescriptor=Object.getOwnPropertyDescriptor,apply=Reflect.apply,nativeAborted=getOwnDescriptor(AbortSignal.prototype,'aborted').get;
const own=(value,key)=>{const property=value&&getOwnDescriptor(value,key);if(property&&(!property.enumerable||!Object.hasOwn(property,'value')))throw new Error('Own data required');return property?.value;};
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const admitted=value=>{const checked=cloneJsonValue(value);if(!checked.ok)throw new Error('Bounded JSON required');return checked.data.value;};
async function boundedJson(response){
    const maximum=33554432;let text;
    if(response.body&&typeof response.body.getReader==='function'){
        const reader=response.body.getReader(),chunks=[];let size=0;
        try{while(true){const next=await reader.read();if(next.done)break;if(!(next.value instanceof Uint8Array))throw new Error('Stream');size+=next.value.byteLength;if(size>maximum){await reader.cancel();throw new Error('Limit');}chunks.push(next.value);}const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}text=new TextDecoder('utf-8',{fatal:true}).decode(all);}
        finally{reader.releaseLock();}
    }else{if(typeof response.text!=='function')throw new Error('Body');text=await response.text();if(typeof text!=='string'||text.length>maximum||new TextEncoder().encode(text).byteLength>maximum)throw new Error('Limit');}
    return JSON.parse(text);
}
function selected(metadata,userId,selection){
    if(selection.kind==='source-registry'){
        const header=admitted(own(own(metadata,'latticeSources'),userId));
        if(!plain(header)||header.schemaVersion!==1||!plain(header.scope)||header.scope.userId!==userId||!plain(header.branchStates))throw new Error('Registry');
        const branch=own(header.branchStates,selection.branchKey);
        if(!plain(branch)||!plain(branch.scope)||branch.scope.userId!==userId||branch.scope.chatId!==header.scope.chatId||!Array.isArray(branch.pageIds)||canonical(branch.pageIds)!==canonical(selection.pageIds))throw new Error('Branch');
        const pages=own(own(metadata,'latticeSourcePages'),userId);
        return {header,branch,pages:selection.pageIds.map(pageId=>{const page=admitted(own(pages,pageId));if(!plain(page)||page.schemaVersion!==1||canonical(page.scope)!==canonical(branch.scope)||page.branchKey!==selection.branchKey||!Array.isArray(page.rows)||page.rows.length>128)throw new Error('Page');return page;})};
    }
    const path=['document','document-checkpoint'].includes(selection.kind)?['latticeDocuments',userId,selection.targetId]:selection.kind==='introspection'?['latticeIntrospection',selection.storeId,selection.actorId]:['latticeDocumentCatalog',userId];
    let value=metadata;for(const key of path){if(!plain(value))throw new Error('Missing');value=own(value,key);}
    const document=admitted(value);
    if(selection.kind!=='document-checkpoint')return document;
    const namespace=own(metadata,'latticeDocumentHistory'),pages=own(namespace,userId);
    return {document,pages:selection.pageIds.map(pageId=>admitted(own(pages,pageId)))};
}
/** Await native saving and verify only selected metadata from the saved active chat. No retry writes. */
export function createNativePersistenceVerifier(ports){
    if(!plain(ports))throw new Error('Trusted native persistence ports required');const methods={};
    for(const key of ['getContext','getUserId','fetch']){const property=Object.getOwnPropertyDescriptor(ports,key);if(property&&(!Object.hasOwn(property,'value')||typeof property.value!=='function'))throw new Error('Own host methods required');methods[key]=property?.value;}
    if(typeof methods.getContext!=='function'||typeof methods.getUserId!=='function')throw new Error('Trusted user/chat scope required');const fetchMethod=methods.fetch??globalThis.fetch;
    const capture=raw=>{
        const selection=admitted(raw);
        if(!plain(selection)||!['document','document-checkpoint','introspection','document-catalog','source-registry'].includes(selection.kind)||Object.keys(selection).some(key=>!['kind','targetId','storeId','actorId','pageIds','branchKey'].includes(key)))throw new Error('Selection');
        if(selection.kind==='source-registry'){
            const pathId=value=>identifier(value)&&!/[\\/:]/.test(value)&&!value.includes('..');
            if(Object.keys(selection).length!==3||!pathId(selection.branchKey)||!Array.isArray(selection.pageIds)||selection.pageIds.length>128||selection.pageIds.some(value=>!pathId(value))||new Set(selection.pageIds).size!==selection.pageIds.length)throw new Error('Selection');
        }else if(selection.branchKey!==undefined)throw new Error('Selection');
        if(selection.kind==='document-checkpoint'&&(!identifier(selection.targetId)||/[\\/:]/.test(selection.targetId)||selection.targetId.includes('..')||selection.storeId!==undefined||selection.actorId!==undefined||!Array.isArray(selection.pageIds)||selection.pageIds.length>4096||selection.pageIds.some(pageId=>!identifier(pageId))||new Set(selection.pageIds).size!==selection.pageIds.length)||!['document-checkpoint','source-registry'].includes(selection.kind)&&selection.pageIds!==undefined)throw new Error('Selection');
        if(selection.kind==='document'&&(!identifier(selection.targetId)||/[\\/:]/.test(selection.targetId)||selection.targetId.includes('..')||selection.storeId!==undefined||selection.actorId!==undefined)||selection.kind==='introspection'&&(!identifier(selection.storeId)||!identifier(selection.actorId)||selection.targetId!==undefined)||selection.kind==='document-catalog'&&Object.keys(selection).length!==1)throw new Error('Selection');
        const c=methods.getContext(),userId=methods.getUserId(),chatId=c.getCurrentChatId?.()??c.chatId,character=c.characters?.[c.characterId];
        if(!identifier(userId)||!identifier(chatId)||c.groupId||!Array.isArray(c.chat)||!plain(c.chatMetadata)||!character||!identifier(character.avatar)||typeof character.chat!=='string'||!character.chat.trim()||character.chat.length>256||typeof character.name!=='string'||character.name.length>256)throw new Error('Scope');
        if(selection.kind==='source-registry'&&selected(c.chatMetadata,userId,selection).header.scope.chatId!==chatId)throw new Error('Scope');
        const sources=selection.kind==='source-registry'?normalizeNativeSourceMessages(c.chat):null;if(sources&&!sources.ok)throw new Error('Sources');
        return {sourceFingerprints:sources?.data.map(message=>message.fingerprint),selection,userId,chatId,chat:c.chat,metadata:c.chatMetadata,characterId:c.characterId,avatar:character.avatar,chatName:character.chat,characterName:character.name,expected:canonical(selected(c.chatMetadata,userId,selection))};
    };
    const current=captured=>{
        try{const c=methods.getContext(),character=c.characters?.[c.characterId];return methods.getUserId()===captured.userId&&(c.getCurrentChatId?.()??c.chatId)===captured.chatId&&c.chat===captured.chat&&c.chatMetadata===captured.metadata&&!c.groupId&&c.characterId===captured.characterId&&character?.avatar===captured.avatar&&character?.chat===captured.chatName&&canonical(selected(c.chatMetadata,captured.userId,captured.selection))===captured.expected&&(captured.sourceFingerprints===undefined||(()=>{const sources=normalizeNativeSourceMessages(c.chat);return sources.ok&&canonical(sources.data.map(message=>message.fingerprint))===canonical(captured.sourceFingerprints);})());}catch{return false;}
    };
    async function execute(raw,controls,save){
        let signal;
        try{if(!plain(controls)||Object.keys(controls).some(key=>key!=='signal'))throw new Error('Controls');signal=own(controls,'signal');if(signal!==undefined)Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(signal);}catch{return fail('INVALID_PERSISTENCE_CONTROLS','Use a trusted optional cancellation signal.');}
        if(signal?.aborted)return fail('CANCELLED','Persistence verification was stopped.');let captured;
        try{captured=capture(raw);}catch{return fail('PERSISTENCE_VERIFICATION_UNAVAILABLE','Select bounded story metadata in the active user’s character chat.');}
        const stopped=()=>signal!==undefined&&nativeAborted.call(signal);
        const captureReceiver=value=>{try{if(!plain(value))return null;const chat=own(value,'chat'),metadata=own(value,'chatMetadata');return chat===captured.chat&&metadata===captured.metadata?Object.freeze({value,chat,metadata}):null;}catch{return null;}};
        const receiverCurrent=receiver=>{try{return !!receiver&&own(receiver.value,'chat')===receiver.chat&&own(receiver.value,'chatMetadata')===receiver.metadata&&receiver.chat===captured.chat&&receiver.metadata===captured.metadata;}catch{return false;}};
        let saveAttempted=false;
        const result=(acknowledged,reasonCode)=>({ok:true,data:{appliedLocally:true,saveAttempted,verificationAttempted:verificationAttempted,acknowledged,persistence:acknowledged?'confirmed':'save-unverified',...(reasonCode?{reasonCode}:{})}});let verificationAttempted=false;
        if(save){
            let c,receiver,saveMethod;try{c=methods.getContext();receiver=captureReceiver(c);if(!receiver)return result(false,'STALE_PERSISTENCE_SCOPE');saveMethod=c.saveMetadata;}catch{return result(false,'NATIVE_SAVE_UNAVAILABLE');}
            if(typeof saveMethod!=='function')return fail('NATIVE_SAVE_UNAVAILABLE','A native metadata save method is required.');
            if(!current(captured))return result(false,'STALE_PERSISTENCE_SCOPE');
            try{if(stopped())return result(false,'CANCELLED');if(!receiverCurrent(receiver))return result(false,'STALE_PERSISTENCE_SCOPE');saveAttempted=true;await apply(saveMethod,c,[]);}catch{return result(false,'NATIVE_SAVE_UNVERIFIED');}
        }
        if(signal?.aborted)return result(false,'CANCELLED');if(!current(captured))return result(false,'STALE_PERSISTENCE_SCOPE');
        try{
            const c=methods.getContext(),receiver=captureReceiver(c);if(!receiver)return result(false,'STALE_PERSISTENCE_SCOPE');const headersMethod=c.getRequestHeaders;if(typeof headersMethod!=='function'||typeof fetchMethod!=='function')return result(false,'PERSISTENCE_VERIFICATION_UNAVAILABLE');
            if(stopped())return result(false,'CANCELLED');if(!receiverCurrent(receiver))return result(false,'STALE_PERSISTENCE_SCOPE');const headers=admitted(apply(headersMethod,c,[]));if(!plain(headers)||Object.values(headers).some(value=>typeof value!=='string')||!current(captured))return result(false,'STALE_PERSISTENCE_SCOPE');
            const request={method:'POST',headers,body:JSON.stringify({ch_name:captured.characterName,file_name:captured.chatName,avatar_url:captured.avatar}),credentials:'same-origin',redirect:'error',cache:'no-store',...(signal?{signal}:{})};
            if(!current(captured))return result(false,'STALE_PERSISTENCE_SCOPE');if(stopped())return result(false,'CANCELLED');if(!receiverCurrent(receiver))return result(false,'STALE_PERSISTENCE_SCOPE');verificationAttempted=true;
            const response=await apply(fetchMethod,undefined,['/api/chats/get',request]);
            if(!current(captured)||signal?.aborted)return result(false,signal?.aborted?'CANCELLED':'STALE_PERSISTENCE_SCOPE');
            if(response?.ok!==true)return result(false,'PERSISTENCE_VERIFICATION_FAILED');const saved=await boundedJson(response);
            if(!current(captured)||signal?.aborted)return result(false,signal?.aborted?'CANCELLED':'STALE_PERSISTENCE_SCOPE');
            if(!Array.isArray(saved)||!plain(saved[0]?.chat_metadata))return result(false,'PERSISTENCE_VERIFICATION_FAILED');
            let actual;try{actual=canonical(selected(saved[0].chat_metadata,captured.userId,captured.selection));}catch{return result(false,'PERSISTENCE_VERIFICATION_FAILED');}
            if(actual!==captured.expected)return result(false,'PERSISTENCE_CONTENT_MISMATCH');
            if(captured.sourceFingerprints!==undefined){const sources=normalizeNativeSourceMessages(saved.slice(1));if(!sources.ok||canonical(sources.data.map(message=>message.fingerprint))!==canonical(captured.sourceFingerprints))return result(false,'PERSISTENCE_SOURCE_MISMATCH');}
            return result(true);
        }catch{return result(false,signal?.aborted?'CANCELLED':'PERSISTENCE_VERIFICATION_FAILED');}
    }
    return Object.freeze({saveAndVerify:(selection,controls={})=>execute(selection,controls,true),verify:(selection,controls={})=>execute(selection,controls,false)});
}
