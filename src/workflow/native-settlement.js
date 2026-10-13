import { own } from './record-data.js?v=0.27.3';
import { isNativeDraftEvidenceRegistry } from './native-draft-evidence.js?v=0.27.3';
import { createStagedEffects } from './staged-effects.js?v=0.27.3';
import { createFileStore, createChatDocumentBackend } from './file-store.js?v=0.27.3';
import { snapshotDraft, readDraftBody } from './draft-revisions.js?v=0.27.3';
import { cloneJsonValue } from './operations/json-data.js?v=0.27.3';
import { validateOccurrences } from './operations/event-data.js?v=0.27.3';
const fail=(code,message)=>({ok:false,error:{code,message}});
function trustedConfig(raw,allowed) {
    try {if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return {};const descriptors=Object.getOwnPropertyDescriptors(raw);if(Reflect.ownKeys(raw).some(key=>typeof key!=='string'||!allowed.includes(key)||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value')))return {};return Object.fromEntries(Object.entries(descriptors).map(([key,property])=>[key,property.value]));}catch{return {};}
}
const ownMethod=(value,key)=>{try{const property=Object.getOwnPropertyDescriptor(value,key);return property&&Object.hasOwn(property,'value')&&typeof property.value==='function'?property.value:null;}catch{return null;}};
const good=data=>({ok:true,...(data===undefined?{}:{data})});
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
/** Retained private callbacks and handles never enter review DTOs. */
export function createAcceptedNativeSettlement(config) {
    config=trustedConfig(config,['scope','originalDraft','signal','isCurrent','validateFinal','publish','release']);
    const root=snapshotDraft(config.originalDraft),rootBody=readDraftBody(config.originalDraft);
    let publishedDraft=null,publishedKey=null,attempt=null,released=false,sealed=false,acceptQueue=Promise.resolve();
    const release=()=>{if(!released){released=true;try{config.release?.();}catch{/* Revocation remains final even when cleanup fails. */}}};
    const effects=createStagedEffects({scope:config.scope,originalEvidence:root.ok&&rootBody.ok?{sourceToken:root.data.draft.source.token,body:rootBody.data.text}:{},signal:config.signal,isCurrent:()=>!released&&root.ok&&rootBody.ok&&config.isCurrent()===true,
        validateFinal:async ({finalEvidence,effects})=>{
            if(finalEvidence.sourceToken!==root.data.draft.source.token)return fail('FINAL_SOURCE_MISMATCH','Accepted narrative must retain its original native source.');
            if(!attempt||canonical(finalEvidence)!==canonical(attempt.evidence))return fail('FINAL_EVIDENCE_CHANGED','Publication must use the exact Draft paired with its checked narrative evidence.');
            return config.validateFinal({body:finalEvidence.body,originalBody:rootBody.data.text,effects});
        },publish:()=>config.publish(attempt.draft)});
    return Object.freeze({stage:effect=>sealed?fail('EFFECTS_SEALED','Acceptance sealed the retained effects; validate a new bundle to change them.'):effects.stage(effect),
        async accept(draft){
            const checked=snapshotDraft(draft),body=readDraftBody(draft);
            if(!root.ok||!rootBody.ok)return fail('INVALID_SETTLEMENT_SOURCE','A captured native Draft is required.');
            if(!checked.ok)return checked;if(!body.ok)return body;
            if(checked.data.draft.source.token!==root.data.draft.source.token||checked.data.original!==root.data.original)return fail('FINAL_SOURCE_MISMATCH','Accepted narrative must retain the captured native source.');
            const captured={draft:checked.data.draft,key:canonical(checked.data.draft),evidence:{sourceToken:checked.data.draft.source.token,body:body.data.text,revisionId:body.data.provenance.revisionId}};
            sealed=true;
            // The outer queue pairs this private Draft with exactly one evidence
            // validation/publication attempt across every awaited callback.
            const pending=acceptQueue.then(async()=>{
                if(publishedDraft&&publishedKey!==captured.key)return fail('FINAL_EVIDENCE_CHANGED','Persistence recovery must keep the exact published Draft and presentation unchanged.');
                attempt=captured;let result;
                try{return result=await effects.settle({root:true,accepted:true,finalEvidence:captured.evidence});}
                finally {
                    const view=effects.inspect();
                    if(result?.ok&&result.data.published||view.ok&&view.data.published){publishedDraft=captured.draft;publishedKey=captured.key;}
                    attempt=null;
                }
            }).catch(()=>fail('NATIVE_SETTLEMENT_FAILED','Retained acceptance could not complete.'));
            acceptQueue=pending.then(()=>undefined,()=>undefined);
            return pending;
        },reject(){const result=effects.reject();release();return result;},release,
        inspect(){const view=effects.inspect();return view.ok?good({published:view.data.published,rejected:view.data.rejected,effects:view.data.effects.map(({intentId,targetId,receipt})=>({intentId,targetId,receipt}))}):view;}});
}
/** Canonical Draft quotes must remain at their captured positions in the final narrative body. */
export function validateNativeFileEvidence(raw,body,originalBody=body,options={}) {
    const checked=cloneJsonValue(raw);if(!checked.ok||!Array.isArray(checked.data.value))return fail('INVALID_FILE_EVIDENCE','Use bounded canonical occurrence evidence.');
    const events=checked.data.value.flatMap(value=>Array.isArray(value?.events)?value.events:[value]);
    if(!events.length)return good();
    const validated=validateOccurrences(events,{status:'confirmed'});if(!validated.ok)return fail('INVALID_FILE_EVIDENCE','Canonical writes require confirmed occurrence records.');
    if(events.some(event=>event.source.watch!=='draft'||originalBody.slice(event.position.start,event.position.end)!==event.evidence.text||body.slice(event.position.start,event.position.end)!==event.evidence.text)) {
        const registry=own(options,'draftEvidence'),finalDraft=own(options,'finalDraft');
        if(!isNativeDraftEvidenceRegistry(registry))return fail('FINAL_EVIDENCE_REEXTRACT_REQUIRED','Canonical Draft evidence changed. Reextract or rebase it from the final narrative body before accepting.');
        const finalBody=readDraftBody(finalDraft);if(!finalBody.ok||finalBody.data.text!==body)return fail('FINAL_EVIDENCE_CHANGED','Final evidence must describe the authoritative narrative body.');
        return registry.validate(events,finalDraft);
    }
    return good();
}
/** A catalog lease authorizes logical user/chat documents; no path comes from a graph. */
export function createNativeFileSession(config) {
    config=trustedConfig(config,['catalog','scope','context','userId','persistenceVerifier','signal','isCurrent','barriers','workflowId','originalDraft','getOriginalDraft','validateEvidence','stage']);
    const scope=cloneJsonValue(config.scope),capture=ownMethod(config.catalog,'capture'),saveAndVerify=ownMethod(config.persistenceVerifier,'saveAndVerify');
    if(!scope.ok||!scope.data.value||!capture||typeof config.context!=='function'||typeof config.userId!=='function'||!saveAndVerify||typeof config.stage!=='function'||typeof config.isCurrent!=='function')return fail('INVALID_NATIVE_FILE_CONFIG','Native file staging requires captured catalog and persistence capabilities.');
    config={...config,scope:scope.data.value};
    let lease;try{lease=capture.call(config.catalog);}catch{return fail('FILE_SCOPE_UNAVAILABLE','The logical document catalog is unavailable.');}if(!lease.ok)return lease;
    if(lease.data.scope.userId!==config.scope.userId||lease.data.scope.chatId!==config.scope.chatId)return fail('STALE_FILE_SCOPE','Document catalog belongs to another user or chat.');
    const definitions=new Map(lease.data.documents.map(doc=>[doc.targetId,doc]));
    const current=()=>{try{return config.isCurrent()===true&&lease.data.isCurrent();}catch{return false;}};
    const barrierKey=targetId=>canonical([config.scope.userId,config.scope.chatId,targetId]);
    const backend=createChatDocumentBackend({scope:{userId:config.scope.userId,chatId:config.scope.chatId},getContext:()=>{const c=config.context(),chatId=c.getCurrentChatId?.()??c.chatId,userId=config.userId();if(!current())throw new Error('Stale logical document authority');return {chat:c.chat,chatId,userId,chatMetadata:c.chatMetadata};},initialDocuments:lease.data.documents.map(({targetId,format,content})=>({targetId,format,content})),saveMetadata:async ()=>{const result=await saveAndVerify.call(config.persistenceVerifier,{kind:'document',targetId:writingTarget},{signal:config.signal});return result.ok&&result.data.acknowledged===true;}});
    let writingTarget=null;
    const store=createFileStore({scope:{userId:config.scope.userId,chatId:config.scope.chatId},authorizedTargets:[...definitions.keys()],signal:config.signal,isCurrent:current,validateEvidence:config.validateEvidence,
        load:targetId=>config.barriers?.has(barrierKey(targetId))?Promise.resolve(fail('PERSISTENCE_UNKNOWN','This target has an unconfirmed native save. Reconcile it before another write.')):backend.load(targetId),
        compareAndSwap:async (update,controls)=>{writingTarget=update.targetId;try{const result=await backend.compareAndSwap(update,controls);if(result.ok&&!result.data.acknowledged)config.barriers?.set(barrierKey(update.targetId),{intentId:update.intentId,revision:result.data.revision});return result;}finally{writingTarget=null;}}});
    const visibility=targetId=>{
        const doc=definitions.get(targetId);if(!doc)return fail('FILE_NOT_AUTHORIZED','Select a document authorized in this chat.');
        if(doc.visibility.kind==='actor-private'&&doc.visibility.actorId!==config.scope.actorId)return fail('PRIVATE_DESTINATION','Select this actor’s authorized private document.');
        return current()?good(doc.visibility):fail('STALE_FILE_SCOPE','Workflow Data authorization changed.');
    };
    return good(Object.freeze({store,visibility,release:()=>store.release(),
        async intentId(node,evidence,address){const checked=cloneJsonValue(evidence);if(!checked.ok)return checked;const identities=checked.data.value.flatMap(value=>Array.isArray(value?.events)?value.events:[value]).map(value=>value?.eventId).filter(Boolean);const source=(config.getOriginalDraft?.()??config.originalDraft)?.source;if(!source)return fail('NATIVE_SOURCE_REQUIRED','A completed native source is required before staging a write.');const data=canonical([config.scope.userId,config.scope.chatId,config.workflowId,...(address?.instancePath?.length?[address.instancePath]:[]),node.id,identities.length?identities:[source.messageIndex,source.swipeId,source.originalText]]);const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)));return current()?good('native:'+Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('')):fail('STALE_FILE_SCOPE','Document intent scope changed.');},
        stage(prepared,evidence){return config.stage({intentId:prepared.handle.intentId,targetId:'file:'+prepared.plan.targetId,proposed:{kind:'file',targetId:prepared.plan.targetId,evidence},preflight:()=>store.preflight(prepared.handle),commit:flags=>store.commit(prepared.handle,flags)});}}));
}
