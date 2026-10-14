
/** One explicit native UI lifecycle; preview DTOs never grant storage or archive authority. */
export function createNativeDocumentHistory(raw){
    const config=trustedConfig(raw,['catalog','context','userId','actorId','isBusy','barriers','persistenceVerifier','onApplied']);
    const handles=new WeakMap(),save=ownMethod(config.persistenceVerifier,'saveAndVerify'),verify=ownMethod(config.persistenceVerifier,'verify');
    const capture=targetId=>{
        try{
            if(config.isBusy?.())return fail('WORKFLOW_BUSY','Finish the active workflow before checkpointing its history.');
            const lease=config.catalog?.capture();if(!lease?.ok)return fail('DOCUMENT_SETUP_UNAVAILABLE','Workflow Data requires an active user and chat.');
            const doc=lease.data.documents.find(value=>value.targetId===targetId);if(!doc)return fail('FILE_NOT_AUTHORIZED','Select an authorized document.');
            const actorId=config.actorId?.()??null,scope=lease.data.scope;
            if(doc.visibility.kind==='actor-private'&&doc.visibility.actorId!==actorId)return fail('PRIVATE_DESTINATION','Select this document’s actor before inspecting its history.');
            const current=()=>{try{const c=config.context();return lease.data.isCurrent()&&config.userId()===scope.userId&&(c.getCurrentChatId?.()??c.chatId)===scope.chatId&&(config.actorId?.()??null)===actorId;}catch{return false;}};
            const backend=createChatDocumentBackend({scope,getContext:()=>{if(!current())throw Error('Stale');const c=config.context();return {chat:c.chat,chatId:scope.chatId,userId:scope.userId,chatMetadata:c.chatMetadata};},initialDocuments:[{targetId:doc.targetId,format:doc.format,content:doc.content}],saveMetadata:async selection=>{const result=await save?.call(config.persistenceVerifier,selection);return result?.ok===true&&result.data.acknowledged===true;}});
            return good({doc,scope,actorId,current,backend,key:canonical([scope.userId,scope.chatId,targetId])});
        }catch{return fail('DOCUMENT_SETUP_UNAVAILABLE','The native document history scope is unavailable.');}
    };
    const authorized=(entry,data)=>data.privateActorIds.every(actorId=>actorId===entry.actorId)&&(data.visibility.kind!=='actor-private'||data.visibility.actorId===entry.actorId);
    const signature=(entry,pageIds)=>{try{const c=config.context(),document=own(own(own(c.chatMetadata,'latticeDocuments'),entry.scope.userId),entry.doc.targetId),pages=own(own(c.chatMetadata,'latticeDocumentHistory'),entry.scope.userId);return canonical({document,pages:pageIds.map(pageId=>own(pages,pageId))});}catch{return null;}};
    return Object.freeze({
        async preview(targetId){
            const captured=capture(targetId);if(!captured.ok)return captured;const entry=captured.data;
            if(config.barriers?.has(entry.key))return fail('PERSISTENCE_UNKNOWN','Verify the target’s previous save before checkpointing history.');
            const preview=await entry.backend.previewCheckpoint(targetId,entry.doc.visibility);if(!entry.current())return fail('STALE_FILE_SCOPE','Workflow Data scope changed during preview.');if(!preview.ok)return preview;
            if(!authorized(entry,preview.data.view))return fail('PRIVATE_DESTINATION','Archived history retains its original actor privacy.');
            const handle=Object.freeze({});handles.set(handle,{...entry,nativeHandle:preview.data.handle});
            const {privateActorIds,...view}=preview.data.view;
            return good({handle,view:Object.freeze({...view,name:entry.doc.name})});
        },
        async apply(handle){
            const entry=handles.get(handle);if(!entry)return fail('CHECKPOINT_UNAUTHORIZED','Preview this document before applying its checkpoint.');
            try{if(config.isBusy?.())return fail('WORKFLOW_BUSY','Finish the active workflow before checkpointing history.');}catch{return fail('DOCUMENT_SETUP_UNAVAILABLE','The workflow activity could not be verified.');}
            if(!entry.current())return fail('STALE_FILE_SCOPE','Workflow Data scope changed after preview.');
            if(config.barriers?.has(entry.key))return fail('PERSISTENCE_UNKNOWN','The previous native save remains unconfirmed.');
            const pending=Object.freeze({checkpointPending:true});config.barriers?.set(entry.key,pending);
            let result;try{result=await entry.backend.applyCheckpoint(entry.nativeHandle);}catch{return fail('PERSISTENCE_UNKNOWN','The checkpoint outcome could not be confirmed. Further writes remain held.');}
            if(!result.ok){if(config.barriers?.get(entry.key)===pending)config.barriers.delete(entry.key);return result;}handles.delete(handle);
            if(!result.data.acknowledged)config.barriers?.set(entry.key,{checkpoint:true,revision:result.data.revision,epoch:result.data.epoch,pageIds:result.data.pageIds,checkpointSignature:result.data.checkpointSignature});
            else if(config.barriers?.get(entry.key)===pending)config.barriers.delete(entry.key);
            try{if(entry.current())config.onApplied?.();}catch{}
            return good({applied:true,acknowledged:result.data.acknowledged,revision:result.data.revision,epoch:result.data.epoch,message:result.data.acknowledged?'History checkpoint saved. Existing review results need a fresh run.':'Checkpoint applied locally; durable save is unverified. Further writes remain held.'});
        },
        async inspect(targetId){
            const captured=capture(targetId);if(!captured.ok)return captured;const entry=captured.data,barrier=config.barriers?.get(entry.key);
            const before=await entry.backend.inspectHistory(targetId);if(!entry.current())return fail('STALE_FILE_SCOPE','Workflow Data scope changed during archive inspection.');if(!before.ok)return before;if(!authorized(entry,before.data))return fail('PRIVATE_DESTINATION','Archived history retains its original actor privacy.');
            if(barrier){
                if(!barrier.checkpoint||signature(entry,barrier.pageIds)!==barrier.checkpointSignature)return fail('PERSISTENCE_UNKNOWN','The previous save requires its original exact persistence reconciliation.');
                let result;try{result=await verify?.call(config.persistenceVerifier,{kind:'document-checkpoint',targetId,pageIds:barrier.pageIds});}catch{return fail('PERSISTENCE_UNKNOWN','The checkpoint save remains unverified; no retry write was made.');}
                if(!entry.current()||signature(entry,barrier.pageIds)!==barrier.checkpointSignature||config.barriers?.get(entry.key)!==barrier)return fail('PERSISTENCE_UNKNOWN','The checkpoint changed during verification.');
                if(!result?.ok||result.data.acknowledged!==true)return fail('PERSISTENCE_UNKNOWN','The checkpoint save remains unverified; no retry write was made.');
                config.barriers.delete(entry.key);
            }
            const inspected=await entry.backend.inspectHistory(targetId);if(!entry.current())return fail('STALE_FILE_SCOPE','Workflow Data scope changed during archive inspection.');if(!inspected.ok)return inspected;
            if(!authorized(entry,inspected.data))return fail('PRIVATE_DESTINATION','Archived history retains its original actor privacy.');
            const {privateActorIds,...view}=inspected.data;return good(view);
        },
    });
}
import { own } from './record-data.js?v=0.27.3';
import { isNativeDraftEvidenceRegistry } from './native-draft-evidence.js?v=0.27.3';
import { createStagedEffects } from './staged-effects.js?v=0.27.3';
import { createFileStore, createChatDocumentBackend } from './file-store.js?v=0.27.3';
import {artifactVisibility} from './artifact-privacy.js?v=0.27.3';
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
        lookupHistory:async(targetId,query)=>{const policy=visibility(targetId);if(!policy.ok)return policy;const result=await backend.lookupHistory(targetId,query);if(!current())return fail('STALE_FILE_SCOPE','Archive authorization changed.');if(!result.ok)return result;if(result.data.privateActorIds.some(actorId=>actorId!==config.scope.actorId))return fail('PRIVATE_DESTINATION','Archived history retains its original actor privacy.');const mark=result.data.visibility,destination=policy.data;if(mark.kind!=='public'&&destination.kind!=='hidden'&&!(mark.kind==='actor-private'&&destination.kind==='actor-private'&&mark.actorId===destination.actorId))return fail('PRIVATE_DESTINATION','Archived history retains its original document privacy.');return result;},
        compareAndSwap:async (update,controls)=>{writingTarget=update.targetId;try{const result=await backend.compareAndSwap(update,controls);if(result.ok&&!result.data.acknowledged)config.barriers?.set(barrierKey(update.targetId),{intentId:update.intentId,revision:result.data.revision});return result;}finally{writingTarget=null;}}});
    const visibility=targetId=>{
        const doc=definitions.get(targetId);if(!doc)return fail('FILE_NOT_AUTHORIZED','Select a document authorized in this chat.');
        if(doc.visibility.kind==='actor-private'&&doc.visibility.actorId!==config.scope.actorId)return fail('PRIVATE_DESTINATION','Select this actor’s authorized private document.');
        return current()?good(doc.visibility):fail('STALE_FILE_SCOPE','Workflow Data authorization changed.');
    };
    return good(Object.freeze({store,visibility,lookupHistory:async(targetId,query)=>{const policy=visibility(targetId);if(!policy.ok)return policy;const result=await backend.lookupHistory(targetId,query);if(!current())return fail('STALE_FILE_SCOPE','Archive authorization changed.');if(!result.ok)return result;if(result.data.privateActorIds.some(actorId=>actorId!==config.scope.actorId))return fail('PRIVATE_DESTINATION','Archived history retains its original actor privacy.');const mark=result.data.visibility;if(mark.kind!=='public'&&policy.data.kind!=='hidden'&&!(mark.kind==='actor-private'&&policy.data.kind==='actor-private'&&mark.actorId===policy.data.actorId))return fail('PRIVATE_DESTINATION','Archived history retains its original document privacy.');return result;},release:()=>store.release(),
        async intentId(node,evidence,address){const checked=cloneJsonValue(evidence);if(!checked.ok)return checked;const identities=checked.data.value.flatMap(value=>Array.isArray(value?.events)?value.events:[value]).map(value=>value?.eventId).filter(Boolean);const source=(config.getOriginalDraft?.()??config.originalDraft)?.source;if(!source)return fail('NATIVE_SOURCE_REQUIRED','A completed native source is required before staging a write.');const data=canonical([config.scope.userId,config.scope.chatId,config.workflowId,...(address?.instancePath?.length?[address.instancePath]:[]),node.id,identities.length?identities:[source.messageIndex,source.swipeId,source.originalText]]);const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)));return current()?good('native:'+Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('')):fail('STALE_FILE_SCOPE','Document intent scope changed.');},
        stage(prepared,evidence){return config.stage({intentId:prepared.handle.intentId,targetId:'file:'+prepared.plan.targetId,proposed:{kind:'file',targetId:prepared.plan.targetId,evidence},preflight:()=>store.preflight(prepared.handle),commit:flags=>store.commit(prepared.handle,flags)});}}));
}
