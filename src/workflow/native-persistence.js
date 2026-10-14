import { cloneJsonValue } from './operations/json-data.js?v=0.27.3';
const fail=(code,message)=>({ok:false,error:{code,message}});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const identifier=value=>typeof value==='string'&&!!value.trim()&&value.length<=128&&!['__proto__','prototype','constructor'].includes(value)&&!/[\r\n]/.test(value);
const own=(value,key)=>{const property=value&&Object.getOwnPropertyDescriptor(value,key);if(property&&(!property.enumerable||!Object.hasOwn(property,'value')))throw new Error('Own data required');return property?.value;};
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
        if(!plain(selection)||!['document','document-checkpoint','introspection','document-catalog'].includes(selection.kind)||Object.keys(selection).some(key=>!['kind','targetId','storeId','actorId','pageIds'].includes(key)))throw new Error('Selection');
        if(selection.kind==='document-checkpoint'&&(!identifier(selection.targetId)||/[\\/:]/.test(selection.targetId)||selection.targetId.includes('..')||selection.storeId!==undefined||selection.actorId!==undefined||!Array.isArray(selection.pageIds)||selection.pageIds.length>4096||selection.pageIds.some(pageId=>!identifier(pageId))||new Set(selection.pageIds).size!==selection.pageIds.length)||selection.kind!=='document-checkpoint'&&selection.pageIds!==undefined)throw new Error('Selection');
        if(selection.kind==='document'&&(!identifier(selection.targetId)||/[\\/:]/.test(selection.targetId)||selection.targetId.includes('..')||selection.storeId!==undefined||selection.actorId!==undefined)||selection.kind==='introspection'&&(!identifier(selection.storeId)||!identifier(selection.actorId)||selection.targetId!==undefined)||selection.kind==='document-catalog'&&Object.keys(selection).length!==1)throw new Error('Selection');
        const c=methods.getContext(),userId=methods.getUserId(),chatId=c.getCurrentChatId?.()??c.chatId,character=c.characters?.[c.characterId];
        if(!identifier(userId)||!identifier(chatId)||c.groupId||!Array.isArray(c.chat)||!plain(c.chatMetadata)||!character||!identifier(character.avatar)||typeof character.chat!=='string'||!character.chat.trim()||character.chat.length>256||typeof character.name!=='string'||character.name.length>256)throw new Error('Scope');
        return {selection,userId,chatId,chat:c.chat,metadata:c.chatMetadata,characterId:c.characterId,avatar:character.avatar,chatName:character.chat,characterName:character.name,expected:canonical(selected(c.chatMetadata,userId,selection))};
    };
    const current=captured=>{
        try{const c=methods.getContext(),character=c.characters?.[c.characterId];return methods.getUserId()===captured.userId&&(c.getCurrentChatId?.()??c.chatId)===captured.chatId&&c.chat===captured.chat&&c.chatMetadata===captured.metadata&&!c.groupId&&c.characterId===captured.characterId&&character?.avatar===captured.avatar&&character?.chat===captured.chatName&&canonical(selected(c.chatMetadata,captured.userId,captured.selection))===captured.expected;}catch{return false;}
    };
    async function execute(raw,controls,save){
        let signal;
        try{if(!plain(controls)||Object.keys(controls).some(key=>key!=='signal'))throw new Error('Controls');signal=own(controls,'signal');if(signal!==undefined)Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(signal);}catch{return fail('INVALID_PERSISTENCE_CONTROLS','Use a trusted optional cancellation signal.');}
        if(signal?.aborted)return fail('CANCELLED','Persistence verification was stopped.');let captured;
        try{captured=capture(raw);}catch{return fail('PERSISTENCE_VERIFICATION_UNAVAILABLE','Select bounded story metadata in the active user’s character chat.');}
        let saveAttempted=false;
        const result=(acknowledged,reasonCode)=>({ok:true,data:{appliedLocally:true,saveAttempted,verificationAttempted:verificationAttempted,acknowledged,persistence:acknowledged?'confirmed':'save-unverified',...(reasonCode?{reasonCode}:{})}});let verificationAttempted=false;
        if(save){
            let c,saveMethod;try{c=methods.getContext();saveMethod=c.saveMetadata;}catch{return result(false,'NATIVE_SAVE_UNAVAILABLE');}
            if(typeof saveMethod!=='function')return fail('NATIVE_SAVE_UNAVAILABLE','A native metadata save method is required.');
            if(!current(captured))return result(false,'STALE_PERSISTENCE_SCOPE');
            try{saveAttempted=true;await saveMethod.call(c);}catch{return result(false,'NATIVE_SAVE_UNVERIFIED');}
        }
        if(signal?.aborted)return result(false,'CANCELLED');if(!current(captured))return result(false,'STALE_PERSISTENCE_SCOPE');
        try{
            const c=methods.getContext();if(typeof c.getRequestHeaders!=='function'||typeof fetchMethod!=='function')return result(false,'PERSISTENCE_VERIFICATION_UNAVAILABLE');
            const headers=admitted(c.getRequestHeaders());if(!plain(headers)||Object.values(headers).some(value=>typeof value!=='string')||!current(captured))return result(false,'STALE_PERSISTENCE_SCOPE');
            if(signal?.aborted)return result(false,'CANCELLED');verificationAttempted=true;
            const response=await fetchMethod('/api/chats/get',{method:'POST',headers,body:JSON.stringify({ch_name:captured.characterName,file_name:captured.chatName,avatar_url:captured.avatar}),credentials:'same-origin',redirect:'error',cache:'no-store',...(signal?{signal}:{})});
            if(!current(captured)||signal?.aborted)return result(false,signal?.aborted?'CANCELLED':'STALE_PERSISTENCE_SCOPE');
            if(response?.ok!==true)return result(false,'PERSISTENCE_VERIFICATION_FAILED');const saved=await boundedJson(response);
            if(!current(captured)||signal?.aborted)return result(false,signal?.aborted?'CANCELLED':'STALE_PERSISTENCE_SCOPE');
            if(!Array.isArray(saved)||!plain(saved[0]?.chat_metadata))return result(false,'PERSISTENCE_VERIFICATION_FAILED');
            let actual;try{actual=canonical(selected(saved[0].chat_metadata,captured.userId,captured.selection));}catch{return result(false,'PERSISTENCE_VERIFICATION_FAILED');}
            return actual===captured.expected?result(true):result(false,'PERSISTENCE_CONTENT_MISMATCH');
        }catch{return result(false,signal?.aborted?'CANCELLED':'PERSISTENCE_VERIFICATION_FAILED');}
    }
    return Object.freeze({saveAndVerify:(selection,controls={})=>execute(selection,controls,true),verify:(selection,controls={})=>execute(selection,controls,false)});
}
