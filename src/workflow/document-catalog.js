import { cloneJsonValue } from './operations/json-data.js?v=0.27.2';
import { prepareDocumentMutation } from './operations/document-mutations.js?v=0.27.2';
import { freeze } from './record-data.js?v=0.27.2';
const fail=(code,message)=>({ok:false,error:{code,message}});
const good=data=>({ok:true,data:freeze(data)});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const identifier=value=>typeof value==='string'&&!!value.trim()&&value.length<=128&&!['__proto__','prototype','constructor'].includes(value)&&!/[\r\n]/.test(value);
const target=value=>identifier(value)&&!/[\\/:]/.test(value)&&!value.includes('..');
const own=(value,key)=>{const item=Object.getOwnPropertyDescriptor(value,key);if(item&&(!item.enumerable||!Object.hasOwn(item,'value')))throw new Error('Own data required');return item?.value;};
function namespaceData(value){
    if(!plain(value)||Object.keys(value).length>256)throw new Error('Namespace');const result={};
    for(const key of Reflect.ownKeys(value)){if(typeof key!=='string'||!identifier(key))throw new Error('Namespace');Object.defineProperty(result,key,{value:own(value,key),enumerable:true,writable:true,configurable:true});}
    return result;
}
const clone=value=>{const checked=cloneJsonValue(value);if(!checked.ok)throw new Error('Bounded JSON required');return checked.data.value;};
function definition(raw,stored=false){
    const value=clone(raw),keys=['targetId','name','format','content','visibility','columns',...(stored?['revision']:[])];
    if(!plain(value)||Object.keys(value).some(key=>!keys.includes(key))||!target(value.targetId)||typeof value.name!=='string'||!value.name.trim()||value.name.length>256||!['json','jsonl','csv','text','markdown'].includes(value.format)||typeof value.content!=='string'||value.content.length>100000)throw new Error('Definition');
    const mark=value.visibility;
    if(!plain(mark)||!['public','hidden','actor-private'].includes(mark.kind)||Object.keys(mark).some(key=>!['kind','actorId'].includes(key))||(mark.kind==='actor-private'?!identifier(mark.actorId):Object.hasOwn(mark,'actorId')))throw new Error('Visibility');
    if(stored&&!identifier(value.revision))throw new Error('Revision');
    if(value.format!=='csv'&&value.columns!==undefined)throw new Error('Columns');
    const checked=prepareDocumentMutation({targetId:value.targetId,revision:0,format:value.format,content:value.content},{operation:'replace',content:value.content,...(value.format==='csv'?{columns:value.columns}:{})});
    if(!checked.ok)throw new Error('Format');return value;
}
/** Explicit author setup of logical chat documents, separate from portable graph authority. */
export function createChatDocumentCatalog(ports){
    if(!plain(ports))throw new Error('Trusted document host ports required');const methods={};
    for(const key of ['getContext','getUserId','saveMetadata']){const property=Object.getOwnPropertyDescriptor(ports,key);if(property&&(!Object.hasOwn(property,'value')||typeof property.value!=='function'))throw new Error('Own host methods required');methods[key]=property?.value;}
    if(typeof methods.getContext!=='function'||typeof methods.getUserId!=='function')throw new Error('Trusted user/chat scope required');
    const boot=globalThis.crypto.randomUUID(),leases=new WeakMap(),staleAuthority=Symbol('stale document authority');let sequence=0,scope=null,chat=null,metadata=null,signature=null,documents={};
    const bump=()=>{if(++sequence>Number.MAX_SAFE_INTEGER)throw new Error('Epoch exhausted');};
    const refresh=()=>{
        let c,userId,chatId;
        try{c=methods.getContext();userId=methods.getUserId();chatId=c.getCurrentChatId?.()??c.chatId;if(!identifier(userId)||!identifier(chatId)||!Array.isArray(c.chat)||!plain(c.chatMetadata))throw new Error('Scope');}
        catch{bump();scope=null;chat=null;metadata=null;signature=null;documents={};throw new Error('Scope');}
        if(!scope||scope.userId!==userId||scope.chatId!==chatId||chat!==c.chat||metadata!==c.chatMetadata){bump();scope={userId,chatId};chat=c.chat;metadata=c.chatMetadata;signature=null;documents={};}
        try{
            const rawNamespace=own(metadata,'latticeDocumentCatalog'),namespace=rawNamespace===undefined?undefined:namespaceData(rawNamespace);
            const packet=namespace===undefined?undefined:own(namespace,userId);let next={};
            if(packet!==undefined){if(!plain(packet)||Object.keys(packet).some(key=>!['schema','documents'].includes(key))||own(packet,'schema')!==1||!plain(own(packet,'documents'))||Object.keys(packet.documents).length>128)throw new Error('Catalog');
                for(const key of Object.keys(packet.documents)){const value=definition(own(packet.documents,key),true);if(value.targetId!==key)throw new Error('Identity');next[key]=value;}}
            const stamp=JSON.stringify(next);if(signature!==stamp){bump();signature=stamp;documents=next;}
            return c;
        }catch{if(signature!==null)bump();signature=null;documents={};throw new Error('Catalog');}
    };
    const authority=()=>({sequence,scope:{...scope},chat,metadata});
    const checkAuthority=captured=>{if(sequence!==captured.sequence||scope?.userId!==captured.scope.userId||scope?.chatId!==captured.scope.chatId||chat!==captured.chat||metadata!==captured.metadata)throw staleAuthority;};
    const install=(next,captured)=>{
        refresh();checkAuthority(captured);
        refresh();checkAuthority(captured);
        // Copy the live namespace after every host callback; merge only this user with no intervening callback.
        const namespace=namespaceData(own(metadata,'latticeDocumentCatalog')??{}),updated={...namespace,[captured.scope.userId]:{schema:1,documents:next}};
        bump();metadata.latticeDocumentCatalog=updated;documents=next;signature=JSON.stringify(next);
        return good({scope:{...captured.scope},documents:Object.values(next).map(({content,...summary})=>summary)});
    };
    const snapshot=()=>{try{refresh();return good({scope:{...scope},documents:Object.values(documents).map(({content,...summary})=>summary)});}catch{return fail('DOCUMENT_CATALOG_UNAVAILABLE','Workflow Data setup requires the active user and chat.');}};
    // A captured mutation starts with the original lease authority, before any host callback.
    const staleMutation=()=>fail('STALE_DOCUMENT_SCOPE','Workflow Data scope or catalog changed before this mutation.');
    const unauthorizedLease=()=>fail('DOCUMENT_LEASE_UNAUTHORIZED','Use the exact live lease captured by this document catalog.');
    const defineValue=(raw,expected)=>{
        let captured=expected;
        try {
            refresh();if(captured)checkAuthority(captured);else captured=authority();
            const value=definition(raw);checkAuthority(captured);
            if(!Object.hasOwn(documents,value.targetId)&&Object.keys(documents).length>=128)return fail('DOCUMENT_CATALOG_LIMIT','At most 128 workflow data targets are supported.');
            const storedRoot=own(metadata,'latticeDocuments'),storedUser=plain(storedRoot)?own(storedRoot,captured.scope.userId):null,stored=plain(storedUser)?own(storedUser,value.targetId):null;
            if(stored&&own(stored,'format')!==value.format)return fail('FILE_FORMAT_LOCKED','An existing workflow data document retains its stored format. Choose a new target to convert formats.');
            checkAuthority(captured);
            return install({...documents,[value.targetId]:{...value,revision:globalThis.crypto.randomUUID()}},captured);
        }catch(error){return expected&&(error===staleAuthority||sequence!==expected.sequence)?staleMutation():fail('INVALID_DOCUMENT_DEFINITION','Use a named logical target, a valid format/template and an explicit public, hidden or actor-private scope.');}
    };
    const removeValue=(targetId,expected)=>{
        let captured=expected;
        try {
            refresh();if(captured)checkAuthority(captured);else captured=authority();
            if(!target(targetId)||!Object.hasOwn(documents,targetId))return fail('FILE_NOT_AUTHORIZED','Select an authorized workflow data document.');
            const next={...documents};delete next[targetId];checkAuthority(captured);return install(next,captured);
        }catch(error){return expected&&(error===staleAuthority||sequence!==expected.sequence)?staleMutation():fail('DOCUMENT_CATALOG_UNAVAILABLE','Workflow Data authorization could not be updated.');}
    };
    return Object.freeze({snapshot,
        definition(targetId){try{refresh();return target(targetId)&&Object.hasOwn(documents,targetId)?good({...documents[targetId]}):fail('FILE_NOT_AUTHORIZED','Select a workflow data document created for this user and chat.');}catch{return fail('DOCUMENT_CATALOG_UNAVAILABLE','Workflow Data settings are unavailable.');}},
        define(raw){return defineValue(raw);},
        remove(targetId){return removeValue(targetId);},
        defineCaptured(lease,raw){const captured=leases.get(lease);return captured?defineValue(raw,captured):unauthorizedLease();},
        removeCaptured(lease,targetId){const captured=leases.get(lease);return captured?removeValue(targetId,captured):unauthorizedLease();},
        capture(){try{refresh();const captured=authority(),capturedScope=freeze({...scope}),capturedDocuments=freeze(Object.values(documents).map(item=>clone(item)));const lease=Object.freeze({scope:capturedScope,documents:capturedDocuments,isCurrent:()=>{try{refresh();checkAuthority(captured);return true;}catch{return false;}}});leases.set(lease,captured);return {ok:true,data:lease};}catch{return fail('DOCUMENT_CATALOG_UNAVAILABLE','Workflow Data settings could not be captured.');}},
        async save(){try{refresh();const expected=sequence;if(typeof methods.saveMetadata!=='function')return fail('CONFIG_SAVE_UNAVAILABLE','A host metadata save method is required.');const result=await methods.saveMetadata();refresh();if(sequence!==expected)return fail('STALE_DOCUMENT_SCOPE','Workflow Data scope changed during its save.');return good({appliedLocally:true,saveAttempted:true,acknowledged:result===true||plain(result)&&Object.getOwnPropertyDescriptor(result,'ok')?.value===true});}catch{return fail('CONFIG_SAVE_FAILED','Workflow Data settings remain local; the host save could not be verified.');}},
        revision(){refresh();return boot+':'+sequence;},
    });
}
