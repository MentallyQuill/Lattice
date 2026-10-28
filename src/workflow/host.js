import { normalizeWorkflowFailurePolicy } from './failure-policy.js?v=0.29.0';
import { captureNodeFileTargets, nodeFileTargetId } from './node-file-targets.js?v=0.29.0';
import { prepareManagedNodeFiles } from './managed-file-policy.js?v=0.29.0';
import {migrateUnboundOwnFile} from './file-application-policy.js?v=0.29.0';
import {prepareManagedBranchFiles} from './managed-branch-files.js?v=0.29.0';
import {createScopedNodeFileBackend} from './scoped-node-file-backend.js?v=0.29.0';
import {prepareExampleFileDefaults} from './example-file-defaults.js?v=0.29.0';
import { getNodeFileAccess } from '../ui/node-file-access.js?v=0.29.0';
import { randomUuid } from '../random-id.js?v=0.29.0';
import {normalizeNativeSourceMessages} from './native-source-identity.js?v=0.29.0';
import {cloneJsonValue} from './operations/json-data.js?v=0.29.0';
import {captureNativeCharacterProjection} from './native-source-projections.js?v=0.29.0';
import {createNativeSourceRegistry} from './native-source-registry.js?v=0.29.0';
import {createSourceReader,inspectSourcePage} from './source-reader.js?v=0.29.0';
import {createSourceProofRegistry} from './source-provenance.js?v=0.29.0';
import { createNativeGuidanceComposition } from './native-guidance-compose.js?v=0.29.0';
import { isScopedSystemOperation } from './system-capabilities.js?v=0.29.0';
import { sha256Text } from './definition-data.js?v=0.29.0';
import { runWorkflowForHost, freezeArtifact, workflowSignature } from './runtime.js?v=0.29.0';
import { resolveBinding, requestModel, bindingStatus, bindingSummary } from './connections.js?v=0.29.0';
import { reasoningRequestOverrides } from './reasoning.js?v=0.29.0';
import { addressKey, safeError } from './record-data.js?v=0.29.0';
import { createRunState, reduceRunState } from './run-state.js?v=0.29.0';
import { cloneWorkflowDocument } from './document.js?v=0.29.0';
import { prepareWorkflowAttempt, resolveWorkflow } from './resolve.js?v=0.29.0';
import { projectIntrospectionNode } from './introspection/native.js?v=0.29.0';
import { executeIntrospection } from './introspection/nodes.js?v=0.29.0';
import { parseRecord } from './introspection/contracts.js?v=0.29.0';
import { artifactVisibility, preserveArtifactPrivacy, validVisibilityMetadata } from './artifact-privacy.js?v=0.29.0';
import { createAcceptedNativeSettlement, createNativeFileSession, createNativeDocumentHistory, validateNativeFileEvidence } from './native-settlement.js?v=0.29.0';
import { createChatPrefixBinding } from './chat-prefix-binding.js?v=0.29.0';
import {queryProgressionHistory} from './progression.js?v=0.29.0';
import { createChatDocumentCatalog } from './document-catalog.js?v=0.29.0';
import { ensureWorkflowDataDefaults } from './workflow-data-defaults.js?v=0.29.0';
import { createNativePersistenceVerifier } from './native-persistence.js?v=0.29.0';
import { createNativeDraftEvidenceRegistry } from './native-draft-evidence.js?v=0.29.0';
import { createNativeActorContext } from './native-actor-context.js?v=0.29.0';
import { createNativeRecallController } from './native-recall.js?v=0.29.0';
import { createNativeStoryState, createNativeOutcomeCache } from './native-story-state.js?v=0.29.0';
import { executeTimeNode } from './operations/time-nodes.js?v=0.29.0';
import { executeRandom } from './operations/random-outcomes.js?v=0.29.0';
import { executeFileNode } from './operations/file-nodes.js?v=0.29.0';
import { snapshotDraft, readDraftBody } from './draft-revisions.js?v=0.29.0';
import { snapshotPromptSource, promptSourceFingerprint } from './prompt-source.js?v=0.29.0';
import { createNativeMemoryAdapter, nativeMemoryFingerprint, nativeMemoryScope, nativeVisibility } from './introspection/host-memory.js?v=0.29.0';

// Internal review seam: observations contain no authority or retained payload values.
const retentionInspectors=new WeakMap();
export const inspectWorkflowRetentionForReview=controller=>retentionInspectors.get(controller)?.();

const PREFIX = 'lattice:guidance:';
// Public SillyTavern extension prompt position and role enum values.
const GUIDANCE_POSITIONS = { 'before-prompt': 2, 'in-prompt': 0, 'in-chat': 1 };
const GUIDANCE_ROLES = { system: 0, user: 1, assistant: 2 };
const fail = (code,message) => ({ok:false,error:{code,message}});
const identity = c => ({chatId:c.getCurrentChatId?.() ?? c.chatId ?? null,characterId:c.characterId ?? null,groupId:c.groupId ?? null});
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
// Stop ownership is captured before observers, without reading source getters.
// Native context wrappers may change; their chat reference and scalar IDs must not.
const nativeStopPassport = getContext => {
    try {
        const c=getContext(),own=key=>{const field=Object.getOwnPropertyDescriptor(c,key);if(field&&!Object.hasOwn(field,'value'))throw Error();return field?.value??null;};
        const chat=own('chat'),chatId=own('chatId'),characterId=own('characterId'),groupId=own('groupId');
        if(!Array.isArray(chat)||chatId===null||![chatId,characterId,groupId].every(value=>value===null||typeof value==='string'||typeof value==='number'&&Number.isFinite(value)))return null;
        return Object.freeze({chat,chatId,characterId,groupId});
    } catch {return null;}
};
const sameNativeStopPassport=(a,b)=>!!a&&!!b&&a.chat===b.chat&&a.chatId===b.chatId&&a.characterId===b.characterId&&a.groupId===b.groupId;
// Inspect only explicit source disclosure metadata, never unrelated native extras.
const contextDisclosure = material => {
    try {
        const property=material && Object.getOwnPropertyDescriptor(material,'visibility');
        if(!property)return {ok:true,data:{present:false}};
        if(!property.enumerable || !Object.hasOwn(property,'value') || !validVisibilityMetadata(material))return fail('INVALID_CONTEXT_VISIBILITY','Explicit source disclosure requires a valid own visibility label.');
        const own=(value,key)=>{const field=value && Object.getOwnPropertyDescriptor(value,key);return field && Object.hasOwn(field,'value')?field.value:undefined;};
        const label=property.value;
        const visibility=typeof label==='string'?{kind:label,...(label==='actor-private'?{actorId:own(material,'actorId')??own(own(material,'scope'),'actorId')}:{})}:label;
        return {ok:true,data:{present:true,visibility}};
    } catch {return fail('INVALID_CONTEXT_VISIBILITY','Explicit source disclosure could not be inspected.');}
};
const visibilityStamp = material => {
    const visibility=nativeVisibility(material),disclosure=contextDisclosure(material);
    return visibility.ok&&disclosure.ok?JSON.stringify({...visibility.data,...(disclosure.data.present?{disclosure:disclosure.data.visibility}:{})}):null;
};
// Private transport watch: inspect bounded own source data, then compare after all
// host callbacks. Context wrappers may be new objects; native source refs stay exact.
const actorTransportWatch = (c,actorId,chatId) => {
    try {
        const own=(value,key)=>{const property=value&&Object.getOwnPropertyDescriptor(value,key);if(!property)return undefined;if(!property.enumerable||!Object.hasOwn(property,'value'))throw Error();return property.value;};
        const scalar=value=>{if(value===undefined||value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value.length<=100000)return value;throw Error();};
        const characters=own(c,'characters'),chat=own(c,'chat');
        if(!Array.isArray(characters)||characters.length>10000||!Array.isArray(chat)||chat.length>10000)throw Error();
        const actorRefs=[],loaded=[];let wrapper,data;
        for(let index=0;index<characters.length;index++){
            const entry=own(characters,String(index));actorRefs.push(entry);if(!entry)continue;
            const avatar=own(entry,'avatar');if(avatar!==undefined&&(typeof avatar!=='string'||!avatar.trim()||avatar.length>240))throw Error();
            const canonical='character:'+(avatar??index);loaded.push([index,canonical]);
            if(canonical===actorId){if(wrapper)throw Error();wrapper=entry;data=own(entry,'data')??entry;}
        }
        if(!wrapper||!data)throw Error();
        const fields={};for(const key of ['name','description','personality','scenario']){const value=own(data,key);if(value!==undefined&&(typeof value!=='string'||value.length>100000))throw Error();fields[key]=value;}
        const labels=[visibilityStamp(wrapper),visibilityStamp(data)];if(labels.includes(null))throw Error();
        const refs=[],messages=[];for(let index=Math.max(0,chat.length-1000);index<chat.length;index++){
            const message=own(chat,String(index));refs.push(message);if(!message)throw Error();const label=visibilityStamp(message);if(label===null)throw Error();
            messages.push([index,...['mes','swipe_id','is_user','is_system','is_tool'].map(key=>scalar(own(message,key))),label]);
        }
        const stamp=JSON.stringify({chatId:scalar(chatId),characterId:scalar(own(c,'characterId')),groupId:scalar(own(c,'groupId')),loaded,fields,labels,length:chat.length,messages});
        if(new TextEncoder().encode(stamp).length>4000000)throw Error();
        return {characters,chat,wrapper,data,actorRefs,refs,stamp};
    } catch {return null;}
};
const sameActorTransportWatch=(captured,current)=>!!captured&&!!current&&captured.characters===current.characters&&captured.chat===current.chat&&captured.wrapper===current.wrapper&&captured.data===current.data&&captured.stamp===current.stamp&&captured.actorRefs.length===current.actorRefs.length&&captured.actorRefs.every((entry,index)=>entry===current.actorRefs[index])&&captured.refs.length===current.refs.length&&captured.refs.every((entry,index)=>entry===current.refs[index]);
// Final dispatch watch for actual retained source captures. Only own data is read;
// no context, user, identity-adapter, actor-grant or frontier callback runs here.
const sourceTransportWatch=(c,captures,pendingSources,chatId)=>{
    try{
        const own=(value,key)=>{const property=value&&Object.getOwnPropertyDescriptor(value,key);if(!property)return undefined;if(!property.enumerable||!Object.hasOwn(property,'value'))throw Error();return property.value;};
        const json=value=>{const checked=cloneJsonValue(value);if(!checked.ok)throw Error();return checked.data.value;};
        const chat=own(c,'chat'),metadata=own(c,'chatMetadata');if(!Array.isArray(chat)||chat.length>16384||!metadata)throw Error();
        const capturesList=[...captures],extra=[...pendingSources.values()].map(entry=>({nativeChat:entry.chat,references:entry.refs}));
        const all=[...capturesList,...extra];let length=0;
        for(const captured of all){if(chat!==captured.nativeChat||captured.metadata&&metadata!==captured.metadata||captured.references.length>chat.length)throw Error();for(let i=0;i<captured.references.length;i++)if(own(chat,String(i))!==captured.references[i])throw Error();length=Math.max(length,captured.references.length);}
        const refs=Array.from({length},(_,i)=>own(chat,String(i))),messages=normalizeNativeSourceMessages(refs);if(!messages.ok)throw Error();
        const sources=own(metadata,'latticeSources'),pageRoot=own(metadata,'latticeSourcePages'),registries=[];
        for(const captured of capturesList){
            if(chatId!==captured.scope.chatId)throw Error();const header=json(own(sources,captured.scope.userId));if(header.revision!==captured.revision)throw Error();
            const branch=Object.values(header.branchStates).find(value=>value.sourceEpoch===captured.sourceEpoch&&same(value.scope,captured.scope));if(!branch)throw Error();
            const pages=own(pageRoot,captured.scope.userId);registries.push([header,branch.pageIds.map(id=>json(own(pages,id)))]);
        }
        const selected=own(c,'characterId'),watchCharacter=capturesList.some(captured=>captured.watchCharacter),characters=watchCharacter?own(c,'characters'):null,wrapper=characters&&own(characters,String(selected)),data=wrapper&&(own(wrapper,'data')??wrapper),characterKeys=[...new Set(capturesList.flatMap(captured=>captured.characterKeys))];
        const fieldValues={};
        if(watchCharacter)for(const [name,material]of [['wrapper',wrapper],['data',data]]){
            const keys=[...(name==='wrapper'?['avatar']:[]),...(name==='data'||wrapper===data?characterKeys:[]),'visibility','visibleTo','actorId'];
            const fields={};for(const key of keys){const value=own(material,key);if(value!==undefined)fields[key]=json(value);}
            const scoped=own(own(material,'scope'),'actorId');if(scoped!==undefined)fields.scopeActorId=json(scoped);fieldValues[name]=fields;
        }
        return {chat,metadata,characters,wrapper,data,refs,stamp:JSON.stringify([chatId,chat.length,selected,messages.data.map(message=>message.fingerprint),registries,fieldValues])};
    }catch{return null;}
};
const sameSourceTransportWatch=(captured,current)=>!!captured&&!!current&&captured.chat===current.chat&&captured.metadata===current.metadata&&captured.characters===current.characters&&captured.wrapper===current.wrapper&&captured.data===current.data&&captured.stamp===current.stamp&&captured.refs.length===current.refs.length&&captured.refs.every((entry,index)=>entry===current.refs[index]);
const characterVisibility = c => {
    const wrapper=c.characters?.[c.characterId],data=wrapper?.data??wrapper;
    const wrapperStamp=visibilityStamp(wrapper),dataStamp=visibilityStamp(data);
    return wrapperStamp===null||dataStamp===null?null:JSON.stringify([wrapperStamp,dataStamp]);
};
const characterText = snapshot => snapshot?.kind==='context' ? JSON.stringify(snapshot.messages.filter(message=>message.source==='character').map(({id,text})=>[id,text])) : null;
const sourceText = chat => {
    const source=[];
    for(const m of chat??[]) {
        const visibility=visibilityStamp(m);if(visibility===null)return null;
        source.push([m?.mes,m?.swipe_id,m?.is_user,m?.is_system,visibility]);
    }
    return JSON.stringify(source);
};
const token = () => randomUuid();
const generationStamp = value => {
    if(typeof value!=='string' && typeof value!=='number' && !(value instanceof Date))return null;
    const stamp=new Date(value).getTime();return Number.isFinite(stamp)?stamp:null;
};
const replyRevision = m => ({swipeId:m.swipe_id ?? 0,text:m.mes,started:generationStamp(m.gen_started),finished:generationStamp(m.gen_finished)});
const incompleteStream = (c,index) => {
    const stream=c.streamingProcessor;
    if(stream?.messageId!==index)return false;
    const failed=stream.isStopped || stream.abortController?.signal?.aborted;
    // The host can retain a stopped processor after selecting another completed swipe.
    // Only a known, different generation identifies it as stale; missing evidence stays closed.
    const started=generationStamp(stream.timeStarted),selected=generationStamp(c.chat?.[index]?.gen_started);
    if(failed && started!==null && selected!==null && started!==selected)return false;
    return !stream.isFinished || failed;
};
const completed = m => !!m && (!m.role || m.role==='assistant') && !['narrator','tool'].includes(m.extra?.type) && m.mes!=='...' && !m.is_user && !m.is_system && !m.is_tool && !m.is_intermediate && !m.extra?.tool_invocations?.length && !m.extra?.tool_calls?.length && !m.extra?.image && !m.extra?.media?.length && !m.extra?.isSmallSys && !m.extra?.is_intermediate && !m.extra?.partial && !m.extra?.unfinished && !(m.gen_started && !m.gen_finished) && typeof m.mes === 'string' && !!m.mes.trim();

// Classify only an already rejected source. Never copy native content into diagnostics.
const nativeSourceFailure = (tail, generationType) => {
    let sourceReason = 'SWIPE_HISTORY_REQUIRED';
    if (generationType === 'normal') sourceReason = 'USER_MESSAGE_REQUIRED';
    else if (!tail || tail.is_user || tail.is_system || tail.is_tool || tail.role && tail.role !== 'assistant' || ['narrator', 'tool'].includes(tail.extra?.type) || tail.extra?.isSmallSys) sourceReason = 'ASSISTANT_REPLY_REQUIRED';
    else if (tail.mes === '...' || tail.is_intermediate || tail.extra?.is_intermediate || tail.extra?.partial || tail.extra?.unfinished || tail.gen_started && !tail.gen_finished) sourceReason = 'ASSISTANT_REPLY_INCOMPLETE';
    else if (tail.extra?.tool_invocations?.length || tail.extra?.tool_calls?.length) sourceReason = 'TOOL_REPLY_UNSUPPORTED';
    else if (tail.extra?.image || tail.extra?.media?.length) sourceReason = 'MEDIA_REPLY_UNSUPPORTED';
    else if (typeof tail.mes !== 'string' || !tail.mes.trim()) sourceReason = 'ASSISTANT_TEXT_REQUIRED';
    const messages = {
        USER_MESSAGE_REQUIRED: 'Send requires the latest chat message to be a user message. Send a new user message, or generate a new swipe of a completed assistant reply.',
        ASSISTANT_REPLY_REQUIRED: 'A new swipe requires the latest chat message to be an assistant reply. Select a completed assistant reply or send a new user message.',
        ASSISTANT_REPLY_INCOMPLETE: 'The latest assistant reply is unfinished. Finish or remove the unfinished reply before generating a new swipe.',
        ASSISTANT_TEXT_REQUIRED: 'The latest assistant reply has no completed text. Generate a complete reply before requesting a new swipe.',
        TOOL_REPLY_UNSUPPORTED: 'The latest assistant reply contains tool output. Send a new user message to generate a supported text reply.',
        MEDIA_REPLY_UNSUPPORTED: 'The latest assistant reply contains media. Send a new user message to generate a supported text reply.',
        SWIPE_HISTORY_REQUIRED: 'The latest assistant reply has no usable swipe history. Reload the chat and select a completed reply before generating a new swipe.',
    };
    return { ok: false, error: { code: 'UNSUPPORTED_NATIVE_SOURCE', message: messages[sourceReason], details: { generationType, sourceReason } } };
};

/** @typedef {'actor' | 'public'} SceneContextVisibilityMode */
/** Explicit bounded material only; this never assembles a native prompt or activates lore.
 * Actor view preserves the legacy Perspective contract. Public view admits only unmarked
 * sources; it never relabels restricted text or supplies an in-world knowledge claim.
 */
export function snapshotContext(context,{phase='pre',chat=context.chat,node={},visibilityActorId}={}) {
    const messages=[], omissions=[],characterMessages=[];
    /** @type {SceneContextVisibilityMode} */
    let visibilityMode;
    try {
        if(!node || typeof node!=='object' || Array.isArray(node) || ![Object.prototype,null].includes(Object.getPrototypeOf(node)))throw new Error();
        const mode=Object.getOwnPropertyDescriptor(node,'visibilityMode');
        if(mode && (!mode.enumerable || !Object.hasOwn(mode,'value')))throw new Error();
        visibilityMode=mode?.value===undefined?'actor':mode.value;
        if(!['actor','public'].includes(visibilityMode))throw new Error();
    } catch {return fail('INVALID_CONTEXT_VISIBILITY','Scene Context requires an own actor or public visibility mode.');}
    const actorIdValid=value=>typeof value==='string' && value.trim().length>0 && value.length<=128;
    if(visibilityActorId!==undefined && !actorIdValid(visibilityActorId))return fail('INVALID_CONTEXT_VISIBILITY','Host context visibility requires a bounded selected actor identifier.');
    const visibility=material=>{
        const explicit=nativeVisibility(material);if(!explicit.ok)return explicit;
        if(visibilityMode==='public') {
            const disclosure=contextDisclosure(material);if(!disclosure.ok)return disclosure;
            return {ok:true,data:{excluded:explicit.data.present || disclosure.data.present && disclosure.data.visibility.kind!=='public'}};
        }
        if(explicit.data.present)return {ok:true,data:{visibleTo:explicit.data.visibleTo}};
        return {ok:true,data:visibilityActorId===undefined?{}:{visibleTo:[visibilityActorId]}};
    };
    let remaining=100000;
    const available=Array.isArray(chat)?chat:[];
    const start=Math.max(0,available.length-Math.min(1000,node.recentMessages ?? 12));
    if(start) omissions.push({omittedMessages:start,reason:'recent-message limit'});
    let reserved=0;
    // Retain whole recent messages first. Partial messages undermine literal pins and scope.
    for(let i=available.length-1;i>=start;i--) {
        const m=available[i],id=`chat:${i}`;
        if(m?.extra?.tool_invocations?.length || m?.is_tool || typeof m?.mes!=='string') {omissions.push({id,reason:'unsupported message'});continue;}
        const visible=visibility(m);if(!visible.ok)return visible;
        if(visible.data.excluded){omissions.push({id,reason:'restricted visibility'});continue;}
        if(m.mes.length>remaining) {
            if(reserved<2)return fail('INPUT_LIMIT','The two latest context messages exceed the 100,000-character snapshot limit. Narrow the explicit source before running.');
            omissions.push({id,omittedCharacters:m.mes.length,reason:'snapshot character limit'});continue;
        }
        reserved++;remaining-=m.mes.length;
        messages.unshift({id,role:m.is_user?'user':m.is_system?'system':'assistant',text:m.mes,source:'chat',...(visible.data.visibleTo===undefined?{}:{visibleTo:visible.data.visibleTo})});
    }
    if(node.includeCharacter!==false) {
        const character=context.characters?.[context.characterId],data=character?.data ?? character;
        const wrapperVisibility=visibilityMode==='public' && character!==data?visibility(character):null;
        if(wrapperVisibility && !wrapperVisibility.ok)return wrapperVisibility;
        for(const key of ['name','description','personality','scenario']) {
            const text=data?.[key],id=`character:${key}`;
            if(typeof text!=='string' || !text)continue;
            const visible=visibility(data);if(!visible.ok)return visible;
            if(visible.data.excluded || wrapperVisibility?.data.excluded){omissions.push({id,reason:'restricted visibility'});continue;}
            if(text.length>16000 || text.length>remaining) {omissions.push({id,omittedCharacters:text.length,reason:'character field or snapshot limit'});continue;}
            remaining-=text.length;characterMessages.push({id,role:'system',text,source:'character',...(visible.data.visibleTo===undefined?{}:{visibleTo:visible.data.visibleTo})});
        }
    }
    return freezeArtifact({kind:'context',messages:[...characterMessages,...messages],source:{...identity(context),phase,...(visibilityMode==='public'?{visibilityMode} :visibilityActorId!==undefined?{actorId:visibilityActorId}:{})},report:{code:'BOUNDED_CONTEXT',omissions,limitCharacters:100000,nativeLoreIncluded:false,...(visibilityMode==='public'?{message:'Public view includes unmarked or explicitly public host material; restricted sources are omitted.'}:visibilityActorId!==undefined?{message:'Visibility identifies public host material supplied to the selected actor; it does not establish in-world knowledge.'}:{})}});
}
/** The opaque source token is JSON-safe; live message references stay in the controller. */
export function snapshotReply(context,messageIndex=context.chat?.length-1) {
    const message=context.chat?.[messageIndex];
    if(messageIndex !== context.chat?.length-1) return fail('OLDER_REPLY','Only the latest completed assistant reply can be reviewed.');
    if(incompleteStream(context,messageIndex) || !completed(message)) return fail('REPLY_UNAVAILABLE','Select a completed text-only assistant reply.');
    if(message.mes.length>100000) return fail('INPUT_LIMIT','The reply exceeds the 100,000-character repair limit.');
    const disclosure=nativeVisibility(message);if(!disclosure.ok)return disclosure;
    return freezeArtifact({kind:'draft',text:message.mes,...(disclosure.data.present?{visibleTo:disclosure.data.visibleTo}:{}),source:{...identity(context),token:token(),messageIndex,swipeId:message.swipe_id ?? 0,originalText:message.mes,chatLength:context.chat.length},context:snapshotContext(context,{phase:'post',chat:context.chat.slice(0,messageIndex)})});
}

/** Owns cancellation, guidance lifetime and explicit local revision commits. */
export function createNativeWorkflowController(ports) {
    const managedNamespace=token(),managedDocumentOwners=new WeakMap();
    const managedAddressKey=address=>addressKey({...address,instancePath:address.instancePath.map(part=>/^iteration-\d+$/.test(part)?'iteration-*':part)});
    const managedNode=(run,address)=>run.managedFileNodes?.get(addressKey(address))??run.managedFileNodes?.get(managedAddressKey(address));
    const context=ports.context;
    // Separate native read-only capability, captured once. General userId freshness
    // callbacks may have effects and cannot serve as final private transport authority.
    const transportUserId=typeof ports.transportUserId==='function'?ports.transportUserId:null;
    const documentCatalog=ports.documentCatalog??createChatDocumentCatalog({getContext:context,getUserId:()=>ports.userId?.()});
    const persistenceVerifier=ports.persistenceVerifier??createNativePersistenceVerifier({getContext:context,getUserId:()=>ports.userId?.()});
    let sourceRegistry=ports.sourceRegistry;
    const getSourceRegistry=()=>sourceRegistry??=createNativeSourceRegistry({getContext:context,getUserId:()=>ports.userId?.(),persistenceVerifier,...(typeof ports.getBranchId==='function'?{getBranchId:ports.getBranchId}:{}),...(typeof ports.onSourcesInvalidated==='function'?{onInvalidated:ports.onSourcesInvalidated}:{})});
    const fileBarriers=new Map();
    const documentHistory=createNativeDocumentHistory({catalog:documentCatalog,context,userId:()=>ports.userId?.(),actorId:()=>{const actor=nativeMemoryScope(context(),ports.selectIntrospectionActor);return actor.ok?actor.data.actorId:null;},isBusy:()=>applying||active!==null||ports.isBusy?.()===true,barriers:fileBarriers,persistenceVerifier,onApplied:()=>cancel('Workflow history checkpoint applied')});
    const outcomeCache=createNativeOutcomeCache({...(typeof ports.random==='function'?{random:ports.random}:{})});
    function releaseRun(run) {if(!run||run.resourcesReleased)return;run.resourcesReleased=true;run.sourceProofs?.clear();run.sourceActorService?.release();run.sourceActorService=null;run.actorArtifactOwners=new WeakMap();for(const reader of run.sourceReaders??[])reader.release();run.sourceReaders?.clear();run.sourcePages?.clear();run.sourceCaptures?.clear();run.guidanceComposition?.clear();run.modelScopes?.clear();run.modelAddresses=new WeakMap();recall.releaseRun(run);run.memorySession?.release();run.memorySession=null;run.storySession?.release();run.storySession=null;run.draftEvidence?.release();run.draftEvidence=null;run.draftSources?.clear();delete run.nativeContext;for(const session of run.fileSessions?.values()??[])session.release();run.fileSessions?.clear();run.fileSession?.release();run.fileSession=null;run.actorContext?.release();run.actorContext=null;for(const session of run.actorMemorySessions?.values()??[])session.release();run.actorMemorySessions?.clear();run.stagedFiles.length=0;run.memoryIntents.clear();run.memoryTerminals.clear();}
    let epoch=0, active=null, result=null, automaticResult=null, applying=false, automaticApplication=null, internalEvents=0, unsubscribe=null;
    let branchCapture=null;
    function captureBranchPoint(){
        const c=context(),metadata=c.chatMetadata,userId=ports.userId?.(),chatId=identity(c).chatId,parent=Object.getOwnPropertyDescriptor(metadata??{},'main_chat')?.value,integrity=Object.getOwnPropertyDescriptor(metadata??{},'integrity')?.value;
        const prefix=createChatPrefixBinding(c.chat,sourceText);
        branchCapture=typeof userId==='string'&&typeof chatId==='string'&&typeof parent==='string'&&parent&&parent!==chatId&&parent.length<=128&&typeof integrity==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(integrity)&&prefix?{userId,chatId,metadata,integrity,parentChatId:parent,binding:prefix.stamp}:null;
    }
    function actorAvailable(run,actorId){
        if(!fresh(run))return false;
        const actors=context().characters;if(!Array.isArray(actors))return false;
        return actors.some((actor,index)=>{const avatar=Object.getOwnPropertyDescriptor(actor??{},'avatar');return (!avatar||Object.hasOwn(avatar,'value'))&&actorId==='character:'+(avatar?.value??index);});
    }
    let generationSequence=0, generation={dryRun:false,type:'normal'}, generationInvocationDryRun=false;
    const activityListeners=new Set(), progressListeners=new Set();
    let runState=null,progressRevision=0,nativeStopListener=null,invokingPolicyStop=null;
    const activity=()=>active ? Object.freeze({busy:true,graph:active.originalGraph,graphId:Object.getOwnPropertyDescriptor(active.originalGraph ?? {},'id')?.value,runId:active.runId,native:active.native,documentToken:active.documentToken}) : null;
    // Progress is passive metadata. Freeze the snapshot, never the live graph or document owner.
    const progress=()=>active ? Object.freeze({...activity(),runState}) : null;
    // A listener can cancel or replace the run; its nested publication supersedes this snapshot.
    const publishProgress=()=>{const revision=++progressRevision,value=progress();for(const listener of progressListeners){if(revision!==progressRevision)break;observe(listener,value);}};
    const publishActivity=()=>{if(!active)runState=null;const value=activity();for(const listener of activityListeners)observe(listener,value);publishProgress();};
    const subscribeActivity=listener=>{if(typeof listener!=='function')return ()=>{};activityListeners.add(listener);observe(listener,activity());return ()=>activityListeners.delete(listener);};
    const subscribeProgress=listener=>{if(typeof listener!=='function')return ()=>{};progressListeners.add(listener);observe(listener,progress());return ()=>progressListeners.delete(listener);};
    const keys=new Set(), sources=new Map(), candidates=new Map(), stopped=new WeakMap();
    const memoryAdapter=createNativeMemoryAdapter({context,selectActor:ports.selectIntrospectionActor,isSettled:(message,index,c)=>!stoppedRevision(message) && !incompleteStream(c,index)});
    const recall=createNativeRecallController({getActive:()=>{const graph=ports.getGraph?.('unified');if(ports.isEnabled?.()===false||!graph)return null;const c=context(),actor=nativeMemoryScope(c,ports.selectIntrospectionActor);return actor.ok?{owner:ports.getDocumentToken?.()??graph,graph,signature:workflowSignature(graph),scope:{userId:ports.userId?.(),chatId:identity(c).chatId,workflowId:graph.id,actorId:actor.data.actorId}}:null;},...(typeof ports.registerRecallHotkey==='function'?{registerHotkey:ports.registerRecallHotkey}:{})});
    const observe=(fn,...args)=>{try{const pending=fn?.(...args);if(pending&&typeof pending.then==='function')Promise.resolve(pending).catch(()=>{});}catch{/* Observers cannot own lifecycle. */}};
    const diagnosticOrigins=new WeakMap();
    // Capture diagnostic ownership before cancellation/activity observers can
    // select another chat. Only the optional private sink receives this scope.
    const captureDiagnostics=(graph,native,target,runId)=>{
        if(typeof ports.createDiagnosticCapture!=='function')return null;
        try {
            const source=identity(context()),userId=ports.userId?.();
            const origin=freezeArtifact({...source,userId,workflowId:Object.getOwnPropertyDescriptor(graph??{},'id')?.value,workflowName:Object.getOwnPropertyDescriptor(graph??{},'name')?.value,runId,mode:target===undefined?'root':'target',native,startedAt:Date.now()});
            const capture=ports.createDiagnosticCapture(origin);
            if(!capture||typeof capture!=='object')return null;
            diagnosticOrigins.set(capture,origin);return capture;
        }catch{return null;}
    };
    const finishDiagnostic=(capture,value)=>{if(capture)observe(()=>capture.finish?.(value));return value;};
    const rememberStopped=c=>{
        const m=c.chat?.at(-1);if(!m)return;
        const revision=replyRevision(m),stream=c.streamingProcessor,started=generationStamp(stream?.timeStarted);
        // Pending progress can still change text/finish time after Stop; its generation stays failed.
        const failedStarted=stream?.messageId===c.chat.length-1 && started===revision.started?started:null;
        const records=stopped.get(m) ?? [];
        if(!records.some(record=>same(record.revision,revision)))records.push({revision,failedStarted});
        stopped.set(m,records);
    };
    const stoppedRevision=m=>{
        const revision=replyRevision(m);
        return (stopped.get(m) ?? []).some(record=>record.revision.swipeId===revision.swipeId && (record.failedStarted!==null?record.failedStarted===revision.started:same(record.revision,revision)));
    };
    const notify=(value,run=null,owner=run)=>{
        publishActivity();
        // Replaced documents cannot publish late diagnostics into the current document's cache.
        if(owner && typeof ports.getDocumentToken==='function' && owner.documentToken!==ports.getDocumentToken())return freezeArtifact({...value,reviewHandles:[],superseded:true});
        const origin=run?.automaticOrigin ?? (run?.native && run.graph ? Object.freeze({graph:run.originalGraph,documentToken:run.documentToken,graphId:run.graph.id,graphName:run.graph.name,signature:run.signature,phase:run.unified?'unified':'pre',kind:'send',runId:run.runId}) : null);
        const previous=result;
        if(!value.recording && previous?.recording) {
            // A failed attempt has no run identity. Preserve the old diagnostic separately.
            result=freezeArtifact({...previous,reviewHandles:[],superseded:true});
            const failure=freezeArtifact({...value,...(origin?{runId:origin.runId}:{}),error:safeError(value.error)});
            if(origin)automaticResult=Object.freeze({result:failure,origin});
            observe(ports.onResult,failure,origin);
            return failure;
        }
        result=freezeArtifact(value);
        if(origin)automaticResult=Object.freeze({result,origin});
        else if(result.recording && automaticResult?.result.recording && automaticResult.result.recording!==result.recording) {
            const prior=automaticResult.result;
            automaticResult=Object.freeze({origin:automaticResult.origin,superseded:true,result:Object.freeze({schema:prior.schema,runtime:prior.runtime,runId:prior.runId,mode:prior.mode,ok:prior.ok,callBound:prior.callBound,actualCalls:prior.actualCalls})});
        }
        observe(ports.onResult,result,origin);
        return result;
    };
    const clear=()=>{
        const c=context();
        for(const key of Object.keys(c.extensionPrompts ?? {})) if(key.startsWith(PREFIX)) keys.add(key);
        for(const key of keys) { try{c.setExtensionPrompt?.(key,'',1,0,false,0);if(c.extensionPrompts?.[key])c.extensionPrompts[key].value='';}catch{if(c.extensionPrompts)delete c.extensionPrompts[key];} }
    };
    const cancel=(reason='Workflow canceled')=>{
        if(!['Generation started','Generation ended','Superseded by a new workflow'].includes(reason))outcomeCache.clear();
        // Publish this run's barrier while it still owns the epoch, then revoke authority.
        active?.nativeReady?.resolve(fail('ABORTED','Workflow was stopped.'));
        active?.nativeCompletion?.resolve(fail('ABORTED','Workflow was stopped.'));
        if(active?.nativeTimer)clearTimeout(active.nativeTimer);
        if(active?.cancel)active.cancel();
        else active?.controller.abort(reason); // Runtime listener marks the admitted plan before epoch revocation.
        for(const entry of candidates.values())entry.settlement?.reject();releaseRun(active);
        epoch++; sources.clear(); candidates.clear(); clear();
        if(active) {active.controller.abort(reason); const abort=active.abortPrimary;active.abortPrimary=null;try{abort?.(true);}catch{/* Native abort callback is best effort. */}}
        active=null;publishActivity();
    };
    const bindingChecks=(run,entries)=>entries.map(({address,binding})=>({address,binding,...run.bindingContexts.get(binding)}));
    const bindingFresh=(run)=>{
        for(const check of run.bindingChecks??[]) {
            let status;
            try {
                if(ports.bindingStatus)status=ports.bindingStatus(check.binding,context());
                else if(!ports.resolveBinding)status=bindingStatus(check.binding,context());
                else {
                    const current=ports.resolveBinding(check.node,check.graph,check.address);
                    status=check.metadata && current?.ok&&same(current.data,check.metadata)?{ok:true}:fail('BINDING_CHANGED','The fixed connection changed after preflight. Run preflight again.');
                }
            } catch {status=fail('BINDING_CHANGED','The fixed connection is no longer available. Run preflight again.');}
            if(!status?.ok)return status??fail('BINDING_CHANGED','The fixed connection is no longer available.');
        }
        return {ok:true};
    };
    const fresh=(run)=>run.epoch===epoch && (typeof ports.getDocumentToken!=='function' || run.documentToken===ports.getDocumentToken()) && !run.controller.signal.aborted && same(run.identity,identity(context())) && run.signature===workflowSignature(run.originalGraph) && userFresh(run) && (!run.native || (ports.isEnabled?.() !== false && ports.getGraph?.('unified')===run.originalGraph));
    const userFresh=run=>!run.unified&&!run.hostUnified&&run.graph?.runtime!==3 || run.userId===ports.userId?.();
    const promptFresh = run => [...(run.promptSources?.values() ?? [])].every(entry => {
        const current = promptSourceFingerprint(context(), entry.node);
        return current.ok && current.data === entry.fingerprint;
    });
    const memoryFresh=run=>{
        if(!run.memorySession)return true;
        try {return run.memorySession.readFresh().ok;}
        catch {return false;}
    };
    const playerSourceFresh=run=>{try{return !run.playerSourceCurrent||run.playerSourceCurrent()===true;}catch{return false;}};
    const sourceFresh=run=>run.nodeFileFresh!==false && [...(run.sourcePages??[])].every(page=>inspectSourcePage(page).ok) && playerSourceFresh(run) && memoryFresh(run) && promptFresh(run) && [...(run.pendingSources?.values()??[])].every(validSource) && [...(run.sceneSources??[])].every(entry=>entry.text!==null && sourceText(entry.chat)===entry.text && (entry.characterVisibility===undefined || (entry.characterVisibility!==null && characterVisibility(context())===entry.characterVisibility)) && (entry.characterSnapshots??[]).every(captured=>characterText(snapshotContext(context(),{chat:entry.chat,node:captured.node}))===captured.text));
    const start=(graph,native=false,abortPrimary=null,target)=>{
        const policyOwner=generation,policyPassport=native?nativeStopPassport(context):null;
        const failurePolicy=normalizeWorkflowFailurePolicy(ports.getFailurePolicy?.());
        const runId=token(),diagnosticCapture=captureDiagnostics(graph,native,target,runId);
        cancel('Superseded by a new workflow');
        const run={epoch,runId,diagnosticCapture,failurePolicy,policyOwner,policyPassport,controller:new AbortController(),originalGraph:graph,documentToken:ports.getDocumentToken?.(),native,abortPrimary,pending:true,target,mode:target===undefined?'root':'target',pendingSources:new Map(),sceneSources:[],promptSources:new Map(),bindingContexts:new Map(),modelAddresses:new WeakMap(),modelScopes:new Map(),bindingChecks:[],reviewHandles:[],memoryTerminals:new Map(),memoryIntents:new Map(),memorySession:null,invalidMemoryEvidence:false,fileSession:null,fileSessions:new Map(),fileReferences:new WeakMap(),actorContext:null,guidanceComposition:createNativeGuidanceComposition(),actorMemorySessions:new Map(),stagedFiles:[],retainResources:false,resourcesReleased:false};
        run.sourcePages=new Set();run.sourceCaptures=new Set();run.sourceReaders=new Set();run.actorArtifactOwners=new WeakMap();run.sourceProofs=createSourceProofRegistry({signal:run.controller.signal,isCurrent:()=>fresh(run)&&!run.resourcesReleased});
        run.sourceCapability=Object.freeze({authorizeSource:artifact=>run.sourceProofs.authorizeSource(artifact),authorizePairing:(artifact,manifest)=>run.sourceProofs.authorizePairing(artifact,manifest),validateCurrent:artifact=>run.sourceProofs.validateCurrent(artifact)});
        active=run;runState=createRunState(runId);publishActivity();return run;
    };
    async function prepareRun(run,plan,controls,options) {
        run.cancel=controls.cancel;
        const captured=controls.originalGraphSnapshot;
        run.graph={id:captured.id,name:captured.name,schema:captured.schema,runtime:captured.runtime,mode:captured.mode};
        for(const unit of plan.primitives)if(unit.included&&!unit.systemDisabled&&unit.node.operation==='write-file'&&unit.node.fileHandling&&plan.edges.filter(edge=>addressKey(edge.to)===addressKey(unit.address)&&['text','records'].includes(edge.to.portId)).length>1)return fail('AMBIGUOUS_FILE_INPUT','Connect either Text or Records to this output.');
        run.workflowDataHelperNodes=controls.workflowDataNodes??[];
        run.workflowDataDefaults=plan.primitives.filter(unit=>unit.included&&!unit.systemDisabled&&!unit.node.fileTarget?.managed).flatMap(unit=>unit.systemDefaults??[]);
        run.workflowDataNodes=Object.fromEntries([...plan.primitives.filter(unit=>unit.included&&!unit.systemDisabled).map(unit=>unit.node),...(controls.workflowDataNodes??[])].map((node,index)=>[index,node]));
        run.managedFileEntries=[...plan.primitives.filter(unit=>unit.included&&!unit.systemDisabled).map(unit=>{
            const incoming=plan.edges.find(edge=>addressKey(edge.to)===addressKey(unit.address)&&['text','records'].includes(edge.to.portId)),source=incoming&&plan.primitives.find(candidate=>addressKey(candidate.address)===addressKey(incoming.from))?.node;
            return {node:unit.node,address:unit.address,...(source?.operation==='format'?{inputFormat:source.format??'json',inputColumns:source.columns}:source?.operation==='json-encode'?{inputFormat:'json'}:{}),...(incoming?.to.portId==='records'?{inputKind:'data'}:{})};
        }),...(controls.workflowDataNodes??[]).filter(entry=>entry.node&&entry.address)];
        run.managedFileEdges=plan.edges;
        let managedOwner=ports.getWorkflowIdentity?.();
        if(typeof managedOwner!=='string'||!managedOwner.trim()){
            if(run.documentToken!==undefined)managedOwner=managedNamespace+':'+String(run.documentToken);
            else {if(!managedDocumentOwners.has(run.originalGraph))managedDocumentOwners.set(run.originalGraph,token());managedOwner=managedNamespace+':'+managedDocumentOwners.get(run.originalGraph);}
        }
        run.managedWorkflowId=managedOwner;
        run.signature=workflowSignature(captured);run.identity=identity(context());run.hostUnified=captured.mode==='native-unified';if((run.hostUnified||captured.runtime===3)&&!run.unified)run.userId=ports.userId?.();
        if(run.diagnosticCapture){
            // A start observer may have selected another user/chat before
            // preparation. Its data must never inherit the original log owner.
            const origin=diagnosticOrigins.get(run.diagnosticCapture);
            let matches=false;try{matches=!!origin&&origin.userId===ports.userId?.()&&same({chatId:origin.chatId,characterId:origin.characterId,groupId:origin.groupId},run.identity);}catch{}
            if(!matches){observe(()=>run.diagnosticCapture.discard?.());run.diagnosticCapture=null;}
        }
        run.automaticTerminals=new Set(plan.primitives.filter(unit=>unit.included&&unit.enabled!==false&&!unit.systemDisabled&&unit.node.operation==='review-publish'&&unit.node.autoApply===true).map(unit=>addressKey(unit.address)));
        run.automaticEffectTerminals=new Set(plan.primitives.filter(unit=>unit.included&&unit.enabled!==false&&!unit.systemDisabled&&unit.node.operation==='review-publish'&&unit.node.autoApplyEffects===true).map(unit=>addressKey(unit.address)));
        if(run.unified){
            const selected=plan.primitives.filter(unit=>unit.included);
            if(selected.filter(unit=>unit.node.operation==='generate-reply').length!==1)return fail('NATIVE_BOUNDARY_REQUIRED','One selected native generation boundary is required.');
            if(selected.filter(unit=>unit.node.operation==='on-send').length!==1)return fail('NATIVE_ACTIVATION_REQUIRED','One selected On Send activation is required.');
            const native=captureNative(run,options);if(!native.ok)return native;
            if(plan.primitives.some(unit=>unit.included&&unit.enabled!==false&&!unit.systemDisabled&&(['actor-context','character-direction'].includes(unit.node.operation)||['read-file','write-file'].includes(unit.node.operation)&&unit.node.actorScope==='presence'||['recall','hotkey-arm','prompted-memory'].includes(unit.node.operation)))){const actor=nativeMemoryScope(context(),ports.selectIntrospectionActor);if(!actor.ok)return actor;const captured=recall.begin(run,{scope:{userId:run.userId,chatId:run.identity.chatId,workflowId:run.graph.id,actorId:actor.data.actorId},signature:run.signature,signal:run.controller.signal,isCurrent:()=>fresh(run)&&nativePrefixFresh(run),getGeneration:()=>fresh(run)&&nativePrefixFresh(run)?{generationId:String(run.nativeOwner.id),kind:run.nativeType==='swipe'?'swipe':'reply',stage:run.nativeResolved?'post':'pre',newlyGenerated:true}:null});if(!captured.ok)return captured;run.recallCaptured=true;}
        }
        for(const unit of plan.primitives)if(unit.included && unit.terminal && !unit.systemDisabled && unit.enabled!==false && unit.node.operation==='memory' && unit.node.mode==='commit')run.memoryTerminals.set(addressKey(unit.address),unit.node);
        if(run.memoryTerminals.size>1)return fail('MULTIPLE_MEMORY_COMMITS','Use one Memory Commit terminal per native root run.');
        if(!fresh(run))return fail('STALE_RUN','Workflow source or settings changed.');
        for (const unit of plan.primitives) if (unit.included && unit.node.operation === 'prompt-source') {
            const key = JSON.stringify([unit.node.source ?? 'system', unit.node.promptId ?? 'main', unit.node.form ?? 'raw']);
            if (run.promptSources.has(key)) continue;
            const snapshot = snapshotPromptSource(context(), unit.node); if (!snapshot.ok) return snapshot;
            run.promptSources.set(key, { node: { source: unit.node.source ?? 'system', promptId: unit.node.promptId ?? 'main', form: unit.node.form ?? 'raw' }, artifact: freezeArtifact(structuredClone(snapshot.artifact)), fingerprint: snapshot.fingerprint });
        }
        if(options.phase==='post' && (ports.isBusy?.()||applying))return fail('BUSY','Wait for generation or reply application to finish.');
        if(run.native) {
            const tail=(options.chat??[]).at(-1),liveTail=context().chat?.at(-1);
            if([tail,liveTail].some(message=>message?.is_tool || message?.extra?.tool_invocations?.length))return fail('INTERNAL_TOOL_CONTINUATION','Internal tool continuation does not run guidance.');
            generation.originalTail??={message:liveTail,text:liveTail?.mes};
        }
        if(run.hostUnified){const files=await prepareNodeFiles(run);if(!files.ok)return files;}
        return {ok:true};
    }
    const fileStamp=value=>JSON.stringify([value.revision,value.format,value.content]);
    async function prepareNodeFiles(run){
        let nodes=Object.values(run.workflowDataNodes??{}).map(entry=>entry.node??entry);if(!nodes.some(node=>nodeFileTargetId(node)!==null||['read-file','write-file','story-clock','commit-outcomes','random-pick'].includes(node.operation)&&Object.keys(node.fileTarget??{}).length))return {ok:true};
        const live=()=>fresh(run)&&(!run.unified||nativePrefixFresh(run));
        const priorCatalog=documentCatalog.capture();if(!priorCatalog.ok)return priorCatalog;
        const exampleOrigin=ports.getExampleFileOrigin?.(run.originalGraph);let initialTemplates,fileOwners;
        if(exampleOrigin){
            const example=prepareExampleFileDefaults({exampleId:exampleOrigin.exampleId,nodes:run.managedFileEntries,workflowId:run.managedWorkflowId,actorBindings:exampleOrigin.actorBindings,legacyDocuments:priorCatalog.data.documents,canonicalDocuments:context().chatMetadata?.latticeDocuments?.[run.userId]??{}});if(!example.ok)return example;
            if(example.data.actorChoices.length)return fail('EXAMPLE_ACTOR_REQUIRED','Choose the story characters for '+example.data.actorChoices.map(choice=>choice.label).join(' and ')+' in the example setup before running.');
            run.managedFileEntries=example.data.nodes;initialTemplates=example.data.initialTemplates;fileOwners=example.data.fileOwners;nodes=example.data.nodes.map(entry=>entry.node);
        }
        if(run.workflowDataDefaults?.length||run.workflowDataHelperNodes?.length){const installed=ensureWorkflowDataDefaults({catalog:documentCatalog,graph:{nodes:Object.fromEntries((run.workflowDataHelperNodes??[]).map((node,index)=>[index,node]))},defaults:run.workflowDataDefaults,scope:{userId:run.userId,chatId:run.identity.chatId},context,isCurrent:live});if(!installed.ok)return installed;}
        const legacy=documentCatalog.capture();if(!legacy.ok)return legacy;
        const canonicalDocuments=context().chatMetadata?.latticeDocuments?.[run.userId]??{};
        run.managedFileEntries=run.managedFileEntries.map(entry=>({...entry,node:migrateUnboundOwnFile(entry.node,{canonicalDocuments,legacyDocuments:legacy.data.documents})}));
        nodes=run.managedFileEntries.map(entry=>entry.node);
        const access=ports.nodeFileAccess??getNodeFileAccess();
        if(run.managedFileEntries?.some(entry=>entry.node.fileTarget?.managed===true)){
            await access?.ready;if(!live())return fail('STALE_FILE_SCOPE','The workflow changed while restoring managed files.');
            const existing=captureNodeFileTargets(nodes.filter(node=>!node.fileTarget?.managed),{legacyDocuments:legacy.data.documents});if(!existing.ok)return existing;
            if(existing.data.definitions.length){
                if(typeof access?.backend!=='function')return fail('FILE_ACCESS_REQUIRED','Choose an available file for the connected commit.');
                const checked=createScopedNodeFileBackend(access,existing.data.definitions,{scope:{userId:run.userId,chatId:run.identity.chatId},isCurrent:live,isActorAvailable:actorId=>actorAvailable(run,actorId),signal:run.controller.signal});
                for(const definition of existing.data.definitions){const loaded=await checked.load(definition.targetId);if(!live())return fail('STALE_FILE_SCOPE','The file scope changed while validating an existing destination.');if(!loaded.ok)return loaded;if(loaded.data.format!==definition.format)return fail('FILE_FORMAT_CONFLICT','The existing file type changed; choose it again.');}
            }
            const actor=nativeMemoryScope(context(),ports.selectIntrospectionActor);
            const managed=await prepareManagedNodeFiles(run.managedFileEntries,{workflowId:run.managedWorkflowId,edges:run.managedFileEdges,initialTemplates,fileOwners,scope:{userId:run.userId,chatId:run.identity.chatId},actorId:actor.ok?actor.data.actorId:undefined,isActorAvailable:actorId=>actorAvailable(run,actorId),legacyDocuments:legacy.data.documents,authorizedDefinitions:existing.data.definitions,isCurrent:live,access});if(!managed.ok)return managed;
            run.managedFileNodes=new Map(run.managedFileEntries.map((entry,index)=>[addressKey(entry.address),managed.data.nodes[index]]));
            nodes=managed.data.nodes;run.workflowDataNodes=Object.fromEntries(nodes.map((node,index)=>[index,node]));
        }
        const captured=captureNodeFileTargets(nodes,{legacyDocuments:legacy.data.documents});if(!captured.ok)return captured;
        run.nodeFileDefinitions=captured.data.definitions;run.nodeFileObserved=new Map();run.nodeFileFresh=true;
        if(!run.nodeFileDefinitions.length)return {ok:true};
        if(!access||typeof access.backend!=='function')return fail('FILE_ACCESS_REQUIRED','Choose an available local file in the File section for this node.');
        // Each captured backend validates its own readiness. An unused server adapter
        // may be unavailable while an existing native destination remains valid.
        await access.ready;if(!live())return fail('STALE_FILE_SCOPE','The workflow changed while restoring file access.');
        const prefix=createChatPrefixBinding(run.nativeCapture?.refs??context().chat,sourceText);
        if(!branchCapture&&context().chatMetadata?.main_chat)captureBranchPoint();
        const branch=branchCapture?.userId===run.userId&&branchCapture.chatId===run.identity.chatId&&branchCapture.metadata===context().chatMetadata&&prefix?.matches(branchCapture.binding)?branchCapture:null;
        if(branchCapture&&!branch)return fail('BRANCH_POINT_UNAVAILABLE','The captured branch point changed. Reopen the chat before preparing its state.');
        const managedIds=new Set([...run.managedFileNodes?.values()??[]].map(node=>nodeFileTargetId(node)));
        const branchPrepared=await prepareManagedBranchFiles({definitions:run.nodeFileDefinitions.filter(definition=>managedIds.has(definition.targetId)),access,scope:{userId:run.userId,chatId:run.identity.chatId},branch,isCurrent:live});if(!branchPrepared.ok)return branchPrepared;
        const branchDefinitions=new Map(branchPrepared.data.definitions.map(definition=>[definition.targetId,definition]));
        run.nodeFileDefinitions=run.nodeFileDefinitions.map(definition=>branchDefinitions.get(definition.targetId)??definition);
        run.nodeFileBackend=createScopedNodeFileBackend(access,run.nodeFileDefinitions,{scope:{userId:run.userId,chatId:run.identity.chatId},isCurrent:live,isActorAvailable:actorId=>actorAvailable(run,actorId),signal:run.controller.signal,getBranchBinding:()=>live()&&run.acceptedBranchBinding?run.acceptedBranchBinding:undefined});
        for(const adoption of branchPrepared.data.adoptions){const adopted=await run.nodeFileBackend.adoptLegacy(adoption.snapshot.targetId,{snapshot:adoption.snapshot,pages:adoption.pages});if(!adopted.ok)return adopted;if(adopted.data?.adopted!==true)return fail('BRANCH_POINT_UNAVAILABLE','The independent branch state could not be prepared safely.');}
        for(const definition of run.nodeFileDefinitions){const loaded=await run.nodeFileBackend.load(definition.targetId);if(!loaded.ok)return {...loaded,error:{...loaded.error,field:'fileTarget'}};if(!live())return fail('STALE_FILE_SCOPE','File scope changed while validating access.');run.nodeFileObserved.set(definition.targetId,fileStamp(loaded.data));}
        return {ok:true};
    }
    async function verifyNodeFiles(run){
        if(!run.nodeFileBackend)return {ok:true};
        if(run.nodeFileFresh===false)return fail('FILE_REVISION_CONFLICT','A selected file changed after this workflow captured it. Run it again.');
        for(const [targetId,stamp] of run.nodeFileObserved??[]){const loaded=await run.nodeFileBackend.load(targetId);if(!loaded.ok){run.nodeFileFresh=false;return loaded;}if(fileStamp(loaded.data)!==stamp){run.nodeFileFresh=false;return fail('FILE_REVISION_CONFLICT','A selected file changed after this workflow captured it. Run it again.');}}
        return {ok:true};
    }
    function scopedActors(run){
        if(run.actorContext)return {ok:true,data:run.actorContext};
        if(!run.hostUnified&&run.graph?.runtime!==3)return fail('ROOT_ONLY','Actor authority requires an owned unified workflow.');
        const captured=createNativeActorContext({context,userId:()=>ports.userId?.(),signal:run.controller.signal,isCurrent:()=>fresh(run)&&(!run.unified||nativePrefixFresh(run))&&(!run.effectEntry||acceptedSourceFresh(run.effectEntry)&&sourceFresh(run)),...(typeof ports.selectIntrospectionActor==='function'?{selectActor:ports.selectIntrospectionActor}:{}),
            authorizePresence:(exact,request)=>run.recallCaptured?recall.authorizePresence(run,exact,{actorId:request.actorId}):fail('ACTOR_PRESENCE_UNVERIFIED','This run has no retained scene presence.'),
            authorizeHolderEvent:(exact,request)=>run.recallCaptured?recall.authorizeHolderEvent(run,exact,request):fail('ACTOR_TRIGGER_UNVERIFIED','This run has no ordered live holder trigger.'),
            projectMessage:(message,index)=>{const entry=run.effectEntry;if(entry?.applied&&index===entry.source.messageIndex&&message===entry.message&&acceptedSourceFresh(entry))return {mes:entry.source.originalText,swipe_id:entry.source.swipeId};return message;},
            readMemories:async(actorId,{grant})=>{
                const service=run.actorContext,checked=service?.checkActorGrant(grant);if(!checked?.ok)return fail('STALE_ACTOR_SCOPE','Actor memory scope changed.');
                let session=run.actorMemorySessions.get(actorId);if(!session){const adapter=createNativeMemoryAdapter({context,selectActor:()=>actorId,isSettled:(message,index,c)=>!stoppedRevision(message)&&!incompleteStream(c,index)});const captured=adapter.capture({signal:run.controller.signal,isCurrent:()=>fresh(run)&&service.checkActorGrant(grant).ok});if(!captured.ok)return fail('ACTOR_MEMORY_UNAVAILABLE','The authorized native memory scope could not be captured.');session=captured.data;run.actorMemorySessions.set(actorId,session);}
                const read=await session.memory.read({view:'episodes'}),live=service.checkActorGrant(grant);if(!live.ok)return live;if(!read.ok||!session.readFresh().ok||read.reports?.some(report=>report.code==='INVALIDATED_SOURCES'))return fail('ACTOR_MEMORY_UNAVAILABLE','Authorized native memories are unavailable or stale.');const record=parseRecord(read.artifact,'episodes');if(!record.ok||record.data.scope.actorId!==actorId)return fail('ACTOR_MEMORY_UNAVAILABLE','Authorized native memories require their captured actor scope.');return {ok:true,data:record.data.payload.episodes.map(episode=>({memoryId:episode.id,actorId,visibility:'actor-private',text:episode.text}))};
            }});
        if(captured.ok)run.actorContext=captured.data;return captured;
    }
    // Swipe replaces a message outside the acknowledged source prefix. Source actor
    // grants use that exact prefix; post Actor Context continues to use the full chat.
    function sourceActors(run){
        if(!run.unified||!run.nativeCapture?.target)return scopedActors(run);
        if(run.sourceActorService)return {ok:true,data:run.sourceActorService};
        const captured=createNativeActorContext({context:()=>({...context(),chat:run.nativeCapture.refs}),userId:()=>ports.userId?.(),signal:run.controller.signal,isCurrent:()=>fresh(run)&&nativePrefixFresh(run)&&!run.resourcesReleased,...(typeof ports.selectIntrospectionActor==='function'?{selectActor:ports.selectIntrospectionActor}:{}),authorizePresence:()=>fail('ACTOR_PRESENCE_UNVERIFIED','A source prefix grants no scene presence.')});
        if(captured.ok)run.sourceActorService=captured.data;return captured;
    }
    function authorizeArtifactActors(run,inputs,defaultService){
        if(!run.sourceActorService)return defaultService.authorizeModelInputs(inputs);
        let selected=null;
        for(const artifact of Object.values(inputs)){
            const mark=artifactVisibility(artifact);if(mark.kind==='public')continue;
            const owner=run.actorArtifactOwners.get(artifact);if(mark.kind!=='actor-private'||!owner)return fail('ACTOR_MODEL_SCOPE','Private inputs require their exact current artifact owner.');
            // A failed owner is terminal: labels and another session cannot regrant it.
            const checked=owner.authorizeModelInputs({input:artifact});if(!checked.ok)return checked;
            if(!checked.data.scope||selected&&(!same(selected.data.scope,checked.data.scope)))return fail('ACTOR_MODEL_SCOPE','Private inputs require the same actual actor.');
            selected??={...checked,owner};
        }
        return selected??{ok:true,data:{scope:null}};
    }
    function retainActorOutput(run,payload){
        if(run.graph?.runtime===3){const retained=run.sourceProofs.retainOutput(payload);if(!retained.ok)return retained;if(typeof ports.sourceTriggers?.retainOutput==='function'){const cause=ports.sourceTriggers.retainOutput(payload);if(!cause?.ok)return cause??fail('SOURCE_TRIGGER_RETENTION_REQUIRED','The exact trigger cause must remain current.');}}
        const composed=run.guidanceComposition.retain(payload);if(!composed.ok)return composed;
        const mark=artifactVisibility(payload.artifact);if(mark.kind==='public'||mark.kind==='hidden')return {ok:true,data:{retained:true}};
        const scoped=scopedActors(run);if(!scoped.ok)return scoped;
        if(run.graph?.runtime===3&&payload.node.operation==='scene-context'){const grant=run.sourceActorGrant;if(!grant)return fail('SOURCE_ACTOR_UNAUTHORIZED','The current selected actor is required.');const retained=grant.service.retainScopedArtifact(payload.artifact,grant.exact);if(retained.ok)run.actorArtifactOwners.set(payload.artifact,grant.service);return retained;}
        if(['actor-context','character-direction','prompted-memory'].includes(payload.node.operation)){
            const checked=scoped.data.authorizeEventInputs(payload.node,payload.inputs);if(!checked.ok)return checked;const captured=scoped.data.captureScopedResult(payload.rawResult,checked.data.grant);if(!captured.ok)return captured;
            if(payload.node.operation==='character-direction'){const retained=scoped.data.retainGuidance(payload);if(retained.ok)run.actorArtifactOwners.set(payload.artifact,scoped.data);return retained;}
        }
        if(run.sourceActorService&&Object.values(payload.inputs).some(input=>run.actorArtifactOwners.get(input)===run.sourceActorService)){const checked=authorizeArtifactActors(run,payload.inputs,scoped.data);if(!checked.ok)return checked;if(!checked.data.grant)return fail('ACTOR_ARTIFACT_SCOPE','Private output requires its captured actor.');const owner=checked.owner??scoped.data,retained=owner.retainScopedArtifact(payload.artifact,checked.data.grant);if(retained.ok)run.actorArtifactOwners.set(payload.artifact,owner);return retained;}
        const retained=scoped.data.retainScopedOutput(payload.inputs,payload.artifact,payload);if(retained.ok)run.actorArtifactOwners.set(payload.artifact,scoped.data);return retained;
    }
    function scopedMemory(run) {
        if(run.memorySession)return {ok:true,data:run.memorySession};
        const session=memoryAdapter.capture({signal:run.controller.signal,isCurrent:()=>fresh(run)&&(!run.effectEntry||acceptedSourceFresh(run.effectEntry)),...(run.unified?{saveAndVerify:(selection,controls)=>persistenceVerifier.saveAndVerify(selection,controls)}:{})});
        if(session.ok)run.memorySession=session.data;
        return session;
    }
    async function introspect(run,node,inputs,operationPorts) {
        if(!fresh(run))return fail('STALE_RUN','Workflow source or settings changed.');
        const projected=projectIntrospectionNode(node);if(!projected.ok)return projected;
        const settings=projected.data;
        let session;
        if(settings.operation==='memory' || (settings.operation==='state' && !inputs.state) || (settings.operation==='reflect' && !inputs.state) || (settings.operation==='context' && settings.mode==='perspective' && settings.actorId==='character')) {
            const scoped=scopedMemory(run);if(!scoped.ok)return scoped;session=scoped.data;
        }
        if(settings.operation==='context' && settings.mode==='perspective' && settings.actorId==='character')settings.actorId=session.scope.actorId;
        if(settings.operation==='memory' && settings.mode==='commit' && settings.idempotencyKey==='lattice-memory-commit')settings.idempotencyKey='lattice:'+await nativeMemoryFingerprint(JSON.stringify([run.graph.id,operationPorts.address.instancePath.length?addressKey(operationPorts.address):node.id,inputs.proposal]));
        if(!fresh(run))return fail('STALE_RUN','Workflow source changed before Introspection execution.');
        const {address,...boundedPorts}=operationPorts;
        if(settings.operation==='reflect' && !inputs.state) {
            const base=await session.readIdentity();if(!base.ok)return base;
            boundedPorts.scope=base.data.scope;boundedPorts.store=base.data.store;
        }
        const memoryReads=[];
        const consumeMemory=method=>async options=>{
            const result=await session.memory[method](options);
            if(result.ok) {
                if(run.hostUnified)memoryReads.push(result);
                const record=parseRecord(result.artifact);
                if(record.ok) {
                    // Reports describe all stored history; only refs selected into this output can taint guidance.
                    const selected=new Set(record.data.sourceRefs.map(ref=>JSON.stringify([ref.id,ref.revision])));
                    if(result.reports?.some(report=>report.code==='INVALIDATED_SOURCES' && report.sourceRefs?.some(ref=>selected.has(JSON.stringify([ref.id,ref.revision])))))run.invalidMemoryEvidence=true;
                }
            }
            return result;
        };
        if(settings.operation==='state'&&['progression','time-decay'].includes(settings.mode)&&inputs.state?.value?.historyCheckpoint){
            const marker=inputs.state.value.historyCheckpoint,fingerprint=JSON.stringify(inputs);
            const authorized=[...run.fileSessions.values()].find(session=>session.visibility(marker.targetId).ok);
            const files=authorized?{ok:true,data:authorized}:scopedFiles(run);if(!files.ok)return files;
            const permission=files.data.visibility(marker.targetId);if(!permission.ok)return permission;
            const read=await files.data.store.read(marker.targetId);if(!fresh(run))return fail('STALE_RUN','State history scope changed.');if(!read.ok)return read;
            let stored;try{stored=JSON.parse(read.data.snapshot.content);}catch{return fail('INVALID_PROGRESSION_HISTORY','Checkpointed state requires its authorized JSON source.');}
            if(JSON.stringify(stored.historyCheckpoint)!==JSON.stringify(marker))return fail('DOCUMENT_HISTORY_CHANGED','State history no longer matches its authorized document.');
            const query=settings.mode==='progression'?queryProgressionHistory(inputs.state.value,inputs.events?.value,inputs.rules?.value):{ok:true,data:{identityKeys:[],eventIds:[]}};if(!query.ok)return query;
            const lookup=await files.data.lookupHistory(marker.targetId,{progression:query.data});if(!fresh(run)||JSON.stringify(inputs)!==fingerprint)return fail('STALE_RUN','State inputs changed during history lookup.');if(!lookup.ok)return lookup;
            if(lookup.data.epoch!==marker.epoch)return fail('DOCUMENT_HISTORY_CHANGED','State history epoch changed.');
            boundedPorts.progressionHistory={targetId:marker.targetId,epoch:marker.epoch,visibility:lookup.data.visibility,...lookup.data.progression};
        }
        const result=preserveArtifactPrivacy(await executeIntrospection(settings,inputs,{...boundedPorts,...(session?{memory:{read:consumeMemory('read'),recall:consumeMemory('recall')}}:{})}),inputs);
        const implicitStateRead=settings.operation==='state'&&settings.mode==='value'&&!inputs.state;
        if(run.hostUnified&&result.ok&&(settings.operation==='memory'&&['read','recall'].includes(settings.mode)||implicitStateRead)&&memoryReads.some(read=>same(read.artifact?.value,result.artifact?.value))&&artifactVisibility(result.artifact).kind==='actor-private'){const scoped=scopedActors(run);if(!scoped.ok)return scoped;const grant=scoped.data.authorizeSelectedActor();if(!grant.ok)return grant;const retained=scoped.data.captureScopedResult(result,grant.data.grant);if(!retained.ok)return retained;}
        if(run.recallCaptured&&result.ok&&settings.operation==='memory'&&['read','recall'].includes(settings.mode)&&memoryReads.some(read=>same(read.artifact?.value,result.artifact?.value))){const parsed=parseRecord(result.artifact);if(parsed.ok){const captured=recall.capture(run,result,{kind:'memory',recordValue:parsed.data.payload.episodes??[],fresh:()=>fresh(run)&&nativePrefixFresh(run)&&session.readFresh().ok});if(!captured.ok)return captured;}}
        if(result.ok && settings.operation==='memory' && settings.mode==='commit' && run.memoryTerminals.has(addressKey(address)))run.memoryIntents.set(addressKey(address),structuredClone(result.artifact));
        return result;
    }
    function selectedSnapshot(run,phase,node,options) {
        if (node.operation === 'prompt-source') {
            if (!fresh(run)) return fail('STALE_RUN', 'Workflow source or settings changed.');
            const key = JSON.stringify([node.source ?? 'system', node.promptId ?? 'main', node.form ?? 'raw']);
            const entry = run.promptSources.get(key);
            return entry ? { ok: true, artifact: entry.artifact } : fail('PROMPT_UNAVAILABLE', 'The configured prompt source was not captured.');
        }
        const c=context();
        if(!fresh(run))return fail('STALE_RUN','Workflow source or settings changed.');
        if(phase==='pre') {
            // Derived scene records and planner context must describe the same
            // accepted prefix, including when ST supplies a clone on swipe.
            const boundSource=run.unified&&Object.values(run.workflowDataNodes??{}).some(node=>node.operation==='read-file'&&node.bindToChat===true&&node.enabled!==false);
            const chat=boundSource?run.nativeCapture.refs:run.unified && (options.chat===undefined || options.chat===c.chat)?run.nativeCapture.preChat:options.chat??c.chat;
            let sceneSource=run.sceneSources.find(entry=>entry.chat===chat);
            if(!sceneSource){sceneSource={chat,text:sourceText(chat)};run.sceneSources.push(sceneSource);}
            // Public source selection has no actor authority or actor-selection callback.
            const scope=node.visibilityMode==='public'?null:nativeMemoryScope(c,ports.selectIntrospectionActor);
            const snapshot=snapshotContext(c,{chat,node,...(scope?.ok?{visibilityActorId:scope.data.actorId}:{})});
            if(node.includeCharacter!==false) {
                if(sceneSource.characterVisibility===undefined)sceneSource.characterVisibility=characterVisibility(c);
                // Recheck only effective bounded card text; omitted fields and unrelated metadata do not become sources.
                (sceneSource.characterSnapshots??=[]).push({node:{recentMessages:node.recentMessages,includeCharacter:true,...(node.visibilityMode===undefined?{}:{visibilityMode:node.visibilityMode})},text:characterText(snapshot)});
            }
            return snapshot;
        }
        if(run.unified && run.nativeDraft)return run.nativeDraft;
        const snapshot=snapshotReply(c,options.messageIndex);
        if(snapshot.ok===false)return snapshot;
        const message=c.chat[snapshot.source.messageIndex];
        if(stoppedRevision(message))return fail('REPLY_UNAVAILABLE','The stopped reply is not a completed repair target.');
        const entry={message,chat:c.chat,refs:[...c.chat],prefix:sourceText(c.chat),swipeText:message.swipes?.[snapshot.source.swipeId],source:snapshot.source,run};
        run.pendingSources.set(snapshot.source.token,entry);
        return snapshot;
    }
    async function settleRun(run,transport) {
        const files=await verifyNodeFiles(run);if(!files.ok)return files;
        if(!fresh(run)||!sourceFresh(run)||run.recallCaptured&&!recall.fresh(run))return fail('STALE_SOURCE','The workflow source changed during preparation.');
        run.bindingChecks=bindingChecks(run,transport.bindings);
        const effective=bindingFresh(run);if(!effective.ok)return effective;
        if(transport.mode==='target')return {ok:true};
        const memoryOutputs=[];
        for(const output of transport.terminals) {
            const record=output.artifact?.kind==='data'?parseRecord(output.artifact):null;
            if(record?.ok && record.data.recordType==='commit-intent') {
                const key=addressKey(output.terminal.address),expected=run.memoryIntents.get(key);
                if(!run.memoryTerminals.has(key) || !expected || !same(output.artifact,expected))return fail('UNTRUSTED_MEMORY_INTENT','Only the compiled Memory Commit terminal may settle its exact intent.');
                memoryOutputs.push(output);
            }
        }
        const expectedMemoryOutputs=run.failurePolicy==='continue-available' && transport.failures?.length>0?run.memoryIntents.size:run.memoryTerminals.size;
        if(memoryOutputs.length!==expectedMemoryOutputs)return fail('INVALID_MEMORY_TERMINAL','The compiled Memory Commit terminal did not provide its exact intent.');
        for(const output of transport.terminals) {
            if(output.artifact?.kind!=='candidate')continue;
            const source=run.pendingSources.get(output.artifact.source?.token);if(!source)return fail('STALE_CANDIDATE','The candidate source is no longer available.');
            const handle={handleId:token(),runId:run.runId,terminal:output.terminal};
            const entry={...source,candidate:freezeArtifact(structuredClone(output.artifact)),terminal:output.terminal,handle,applied:null};
            sources.set(entry.source.token,source);candidates.set(handle.handleId,entry);
            run.reviewHandles.push(handle);
        }
        if(run.recallCaptured){const successful=recall.succeed(run);if(!successful.ok)return successful;}
        if(run.unified && (run.stagedFiles.length||memoryOutputs.length||recall.hasPending(run))) {
            const entries=[...candidates.values()].filter(entry=>entry.run===run);
            if(entries.length!==1)return fail('EFFECT_REVIEW_REQUIRED','Staged consequences require one authoritative Review/Publish terminal.');
            const entry=entries[0],output=transport.terminals.find(output=>output.terminal.address.nodeId===entry.terminal.address.nodeId&&same(output.terminal.address,entry.terminal.address));
            const draft=snapshotDraft(output?.inputDraft),body=readDraftBody(output?.inputDraft);
            if(!draft.ok||!body.ok||draft.data.draft.text!==entry.candidate.text||draft.data.original!==entry.candidate.original||draft.data.draft.source.token!==entry.source.token)return fail('UNTRUSTED_FINAL_DRAFT','Accepted consequences require the exact authoritative final Draft.');
            entry.finalDraft=output.inputDraft;run.effectEntry=entry;
            let acceptedBody;
            entry.settlement=createAcceptedNativeSettlement({scope:{userId:run.userId,chatId:run.identity.chatId},originalDraft:run.nativeDraft,signal:run.controller.signal,
                isCurrent:()=>acceptedSourceFresh(entry)&&sourceFresh(run),release:()=>releaseRun(run),
                validateFinal:({body,originalBody,effects})=>{acceptedBody=body;for(const effect of effects){if(effect.proposed.kind==='file'){const evidence=run.storySession?run.storySession.validateEvidence(effect.proposed.evidence,body,originalBody,{draftEvidence:run.draftEvidence,finalDraft:entry.finalDraft}):validateNativeFileEvidence(effect.proposed.evidence,body,originalBody,{draftEvidence:run.draftEvidence,finalDraft:entry.finalDraft});if(!evidence.ok)return evidence;}}return {ok:true};},
                publish:async()=>{
                    const applied=await publishCandidate(entry.handle);if(!applied.ok)return applied;
                    // Recovery records the independently verified assistant-inclusive
                    // publication, separately from execution and source authority.
                    let verified;try{verified=await persistenceVerifier.verify?.({kind:'chat-prefix'});}catch{/* Unverified publication retains no branch stamp. */}
                    if(verified?.ok&&verified.data?.acknowledged===true&&acceptedSourceFresh(entry)&&sourceFresh(run))run.acceptedBranchBinding=createChatPrefixBinding(context().chat,sourceText)?.stamp;
                    // Effects-only acceptance keeps the preflighted original memory source;
                    // only a new reply revision needs accepted-publication rebasing.
                    if(run.memorySession&&memoryOutputs.length&&!entry.effectsOnlyPublication){const authorized=run.memorySession.authorizeAcceptedPublication({body:acceptedBody,finalText:entry.candidate.text,messageIndex:entry.source.messageIndex,originalSwipeId:entry.source.swipeId,finalSwipeId:applied.swipeId});if(!authorized.ok)return authorized;}
                    return {ok:true,data:{appliedLocally:true,saveAttempted:applied.saveAttempted,persistence:applied.persistence,swipeId:applied.swipeId}};
                }});
            for(const effect of recall.effects(run)){const staged=entry.settlement.stage(effect);if(!staged.ok)return staged;}
            for(const effect of run.stagedFiles){const staged=entry.settlement.stage(effect);if(!staged.ok)return staged;}
            for(const output of memoryOutputs){const intent=output.artifact,record=parseRecord(intent,'commit-intent');
                const staged=entry.settlement.stage({intentId:record.data.payload.idempotencyKey,targetId:'memory:'+run.memorySession.scope.actorId,proposed:{kind:'memory'},
                    preflight:()=>entry.applied?run.memorySession.memory.preflight(intent):run.memorySession.preflightAccepted(intent,{body:acceptedBody,messageIndex:entry.source.messageIndex,originalSwipeId:entry.source.swipeId}),
                    commit:async()=>{const committed=await run.memorySession.memory.commit(intent,{root:true,preview:false,dryRun:false});return committed.ok?{ok:true,data:{status:committed.data.acknowledged?'confirmed':'save-unverified',applied:committed.data.applied,acknowledged:committed.data.acknowledged,version:committed.data.version}}:committed;}});if(!staged.ok)return staged;
            }
            run.retainResources=true;return {ok:true};
        }
        return {ok:true};
    }
    // Exact normalized engine inputs and bindings remain private to this run. A graph
    // can name a model, but cannot supply or replace this transport authorization.
    function authorizeModelScope(run,payload) {
        const stopped=()=>run.controller.signal.aborted||run.resourcesReleased||run.epoch!==epoch;
        if(stopped())return fail('ABORTED','The auxiliary request scope has closed.');
        if(!fresh(run)||!sourceFresh(run)||run.unified&&!nativePrefixFresh(run))return fail('STALE_SOURCE','The captured source changed before auxiliary dispatch.');
        if(!run.hostUnified&&run.graph?.runtime===3&&Object.values(payload.inputs).every(artifact=>artifactVisibility(artifact).kind==='public'))return {ok:true};
        const scoped=scopedActors(run);if(!scoped.ok)return scoped;
        const checked=authorizeArtifactActors(run,payload.inputs,scoped.data);if(!checked.ok)return checked;
        // Data authorization can run host callbacks; validate captured event authority last.
        const event=scoped.data.authorizeEventInputs(payload.node,payload.inputs);if(!event.ok)return event;
        if(stopped())return fail('ABORTED','The auxiliary request scope has closed.');
        if(!fresh(run)||!sourceFresh(run)||run.unified&&!nativePrefixFresh(run))return fail('STALE_SOURCE','The captured source changed before auxiliary dispatch.');
        return stopped()?fail('ABORTED','The auxiliary request scope has closed.'):checked.data?.scope==null&&event.data?.scope?{...checked,data:{...checked.data,scope:event.data.scope}}:checked;
    }
    function requestNativeModel(run,request) {
        const key=run.modelAddresses.get(request.binding),scope=run.modelScopes.get(key);
        if(run.hostUnified&&(!scope||scope.capability!=='text-completion'))return fail('ACTOR_SCOPE_FAILED','Use this run’s exact authorized auxiliary inputs.');
        const mark=scope?artifactVisibility(scope.inputs):null,actorId=scope&&['character-direction','prompted-memory'].includes(scope.node.operation)?scope.node.actorId:mark?.kind==='actor-private'?mark.actorId:null;
        const watchSources=run.sourceCaptures.size>0;
        if((actorId||watchSources)&&!transportUserId)return fail('ACTOR_SCOPE_FAILED','Source transport requires the native read-only user authority.');
        const beforeSend=checkBinding=>{
            if(typeof checkBinding!=='function')return fail('BINDING_CHANGED','The native transport binding check is unavailable.');
            if(scope){
                const initial=actorId||watchSources?context():null,initialChatId=initial?identity(initial).chatId:null,captured=actorId?actorTransportWatch(initial,actorId,initialChatId):null,sourceWatch=watchSources?sourceTransportWatch(initial,run.sourceCaptures,run.pendingSources,initialChatId):null;
                if(watchSources&&!sourceWatch)return fail('STALE_SOURCE','The retained native sources cannot be watched before transmission.');
                if(actorId&&!captured)return fail('ACTOR_CONTEXT_CHANGED','The live actor source cannot be checked before transmission.');
                const checked=authorizeModelScope(run,scope);if(!checked.ok)return checked;
                if(!sourceFresh(run))return fail('STALE_SOURCE','The captured source changed before auxiliary dispatch.');
                // Acquire the current wrapper last, then run only own-data comparisons
                // and local lifecycle checks; no user/source/binding callbacks follow.
                const current=context(),chatId=identity(current).chatId;
                if(actorId||watchSources){let userId;try{userId=transportUserId();}catch{return fail('ACTOR_SCOPE_FAILED','The native read-only user authority is unavailable.');}if(typeof userId!=='string'||userId!==run.userId)return fail('ACTOR_CONTEXT_CHANGED','The private transport user scope changed.');}
                const binding=checkBinding(current);if(!binding.ok)return binding;
                if(actorId&&!sameActorTransportWatch(captured,actorTransportWatch(current,actorId,chatId)))return fail('ACTOR_CONTEXT_CHANGED','The live actor source changed before transmission.');
                if(watchSources&&!sameSourceTransportWatch(sourceWatch,sourceTransportWatch(current,run.sourceCaptures,run.pendingSources,chatId)))return fail('STALE_SOURCE','The retained native sources changed before transmission.');
                return run.controller.signal.aborted||run.resourcesReleased||run.epoch!==epoch?fail('ABORTED','The auxiliary request scope has closed.'):checked;
            }
            const initial=watchSources?context():null,sourceWatch=watchSources?sourceTransportWatch(initial,run.sourceCaptures,run.pendingSources,identity(initial).chatId):null;
            if(watchSources&&!sourceWatch||!fresh(run)||!sourceFresh(run)||run.unified&&!nativePrefixFresh(run))return fail('STALE_SOURCE','The captured source changed before auxiliary dispatch.');
            const current=context(),chatId=identity(current).chatId;
            if(watchSources){let userId;try{userId=transportUserId();}catch{return fail('ACTOR_SCOPE_FAILED','The native read-only user authority is unavailable.');}if(userId!==run.userId)return fail('STALE_SOURCE','The source user scope changed before transmission.');}
            const binding=checkBinding(current);if(!binding.ok)return binding;
            if(watchSources&&!sameSourceTransportWatch(sourceWatch,sourceTransportWatch(current,run.sourceCaptures,run.pendingSources,chatId)))return fail('STALE_SOURCE','The retained native sources changed before transmission.');
            return run.controller.signal.aborted||run.resourcesReleased||run.epoch!==epoch?fail('ABORTED','The auxiliary request scope has closed.'):{ok:true};
        };
        return requestModel(request,context,{beforeSend});
    }
    async function execute(run,options) {
        let value;
        try {value=await runWorkflowForHost(run.originalGraph,{
            ...(options.phase===undefined?{}:{phase:options.phase}),target:run.target,runId:run.runId,signal:run.controller.signal,failurePolicy:run.failurePolicy,
            snapshot:(phase,node)=>selectedSnapshot(run,phase,node,options),countTokens:ports.countTokens,...(ports.chunkTokenizer?{chunkTokenizer:ports.chunkTokenizer}:{}),
            resolveBinding:(node,graph,address)=>{
                const result=(ports.resolveBinding??((n,g)=>resolveBinding(n,g,context())))(node,graph,address);
                if(result?.ok&&result.data&&typeof result.data==='object')run.modelAddresses.set(result.data,addressKey(address));
                if(result?.ok && ports.resolveBinding && !ports.bindingStatus) {
                    const role=graph.roles?.[node.modelRole];
                    run.bindingContexts.set(result.data,{node:{profileId:node.profileId,model:node.model,modelRole:node.modelRole},graph:{roles:role?{[node.modelRole]:{profileId:role.profileId,model:role.model}}:{}},metadata:structuredClone(result.data)});
                }
                return result;
            },
            bindingSummary:ports.bindingSummary??bindingSummary,
            request:ports.request??(request=>requestNativeModel(run,request)),
            ...(Object.getOwnPropertyDescriptor(run.originalGraph,'mode')?.value==='native-unified'?{actorContext:(actorId,request,presence)=>{const scoped=scopedActors(run);return scoped.ok?scoped.data.actorContext(actorId,request,presence):scoped;}}:{}),
            ...(run.unified?{retainDraftEventSource:payload=>{if(!run.draftEvidence){const captured=createNativeDraftEvidenceRegistry({getOriginalDraft:()=>run.nativeDraft,isCurrent:()=>fresh(run)&&nativePrefixFresh(run)&&sourceFresh(run),signal:run.controller.signal});if(!captured.ok)return captured;run.draftEvidence=captured.data;}const retained=run.draftEvidence.retain(payload);if(retained.ok){const source=retained.data.source??payload.source;run.draftSources??=new Map();run.draftSources.set(JSON.stringify([source.value.sourceId,source.value.revision,source.value.sceneId,source.value.visibility,source.value.actorId??null]),payload.draft);if(run.recallCaptured){const captured=recall.captureSourceArtifact(run,source,{source:source.value,text:source.value.text,fresh:()=>fresh(run)&&nativePrefixFresh(run)&&sourceFresh(run)&&run.draftEvidence.validate([],payload.draft).ok});if(!captured.ok)return captured;}}return retained;}}:{}),
            ...(Object.getOwnPropertyDescriptor(run.originalGraph,'mode')?.value==='native-unified'?{retainTimeProjection:async payload=>{const state=await scopedStoryState(run);return state.ok?state.data.retainTimeProjection(payload):state;},
            selectNativeRandomOutcomes:async payload=>{const state=await scopedStoryState(run);const selected=payload.address&&managedNode(run,payload.address);return state.ok?state.data.selectNativeRandomOutcomes({...payload,...(selected?.operation==='random-pick'?{ledgerId:selected.ledgerId}:{})}):state;},
            reuseNativeOutcome:outcome=>run.storySession?run.storySession.reuseNativeOutcome(outcome):{ok:true,data:null},
            retainNativeOutcome:async payload=>run.storySession?run.storySession.retainNativeOutcome(payload):{ok:true}}:{}),
            ...(run.diagnosticCapture?{onDiagnostic:event=>observe(()=>run.diagnosticCapture.model?.(event)),diagnosticResponseText:run.diagnosticCapture.captureResponses!==false,isDiagnosticResponseCurrent:()=>run.diagnosticCapture.captureResponses!==false}:{}),
            onStage:ports.onStage,onEvent:event=>{if(active===run){const next=reduceRunState(runState,event);if(next!==runState){runState=next;publishProgress();}}if(run.diagnosticCapture)observe(()=>run.diagnosticCapture.event?.(event));observe(ports.onEvent,event);observe(options.onEvent,event);},
        },{getSourceProofs:()=>run.sourceCapability,prepare:(plan,controls)=>prepareRun(run,plan,controls,options),executeIntrospection:(node,inputs,operationPorts)=>introspect(run,node,inputs,operationPorts),...(run.unified||run.graph?.runtime===3||Object.getOwnPropertyDescriptor(run.originalGraph,'mode')?.value==='native-unified'?{executeHostOperation:(node,inputs,operationPorts)=>nativeOperation(run,node,inputs,operationPorts,options)}:{}),authorizeModelInputs:async payload=>{const files=await verifyNodeFiles(run);if(!files.ok)return files;const checked=authorizeModelScope(run,payload);if(checked.ok)run.modelScopes.set(addressKey(payload.address),Object.freeze({node:payload.node,inputs:payload.inputs,capability:payload.capability}));return checked;},retainScopedOutput:payload=>retainActorOutput(run,payload),retainRecallProvenance:payload=>run.recallCaptured?recall.retain(run,payload):{ok:true,data:{retained:true}},settle:transport=>settleRun(run,transport)});}
        finally {delete run.cancel;run.bindingContexts.clear();run.modelScopes.clear();run.modelAddresses=new WeakMap();if(!run.retainResources)releaseRun(run);}
        if(!value.ok||run.mode==='target') {releaseRun(run);run.pendingSources.clear();run.sceneSources.length=0;run.promptSources.clear();run.bindingChecks=[];for(const [id,entry]of candidates)if(entry.run===run)candidates.delete(id);for(const [id,entry]of sources)if(entry.run===run)sources.delete(id);if(run.native)clear();}
        else run.pendingSources.clear();
        const publicValue=freezeArtifact({...value,failurePolicy:run.failurePolicy,reviewHandles:value.ok?run.reviewHandles:[]});
        run.publicResult=publicValue;
        return finishDiagnostic(run.diagnosticCapture,publicValue);
    }
    const deferred=()=>{let resolve,settled=false;const promise=new Promise(done=>resolve=done);return {promise,resolve(value){if(!settled){settled=true;resolve(value);}}};};
    function captureNative(run,options) {
        const c=context(),owner=generation,userId=ports.userId?.();
        if(!owner.observed || owner.type!==run.nativeType || owner.aborted || owner.dryRun || owner.finished || owner.claimed)return fail('NATIVE_OWNER_MISSING','Native continuation requires its matching Generation Started event.');
        if(!['normal','swipe'].includes(run.nativeType) || c.groupId!==null && c.groupId!==undefined)return fail('UNSUPPORTED_NATIVE_GENERATION','Unified workflows support ordinary nongroup replies and newly generated swipes.');
        if(typeof userId!=='string' || !userId.trim() || userId.length>128)return fail('USER_SCOPE_UNAVAILABLE','A trusted current user handle is required for native continuation.');
        if(!Array.isArray(c.chat) || !c.chat.length)return fail('REPLY_UNAVAILABLE','Native continuation requires a live chat source.');
        const tail=c.chat.at(-1),swipe=run.nativeType==='swipe';
        if(swipe?!completed(tail)||!Array.isArray(tail.swipes)||!tail.swipes.length:!tail.is_user)return nativeSourceFailure(tail,run.nativeType);
        const refs=swipe?c.chat.slice(0,-1):[...c.chat],stamp=sourceText(refs);
        if(stamp===null)return fail('INVALID_CONTEXT_VISIBILITY','Live source visibility is invalid.');
        run.userId=userId;run.nativeOwner=owner;owner.unified=true;owner.claimed=true;
        run.nativeCapture={chat:c.chat,refs,stamp,preChat:[...c.chat],expectedIndex:swipe?c.chat.length-1:c.chat.length,expectedSwipe:swipe?tail.swipes.length:0,target:swipe?tail:null,priorSwipes:swipe?[...tail.swipes]:null,priorSwipeInfo:swipe?structuredClone(tail.swipe_info??[]):null,priorGeneration:swipe?{started:generationStamp(tail.gen_started),finished:generationStamp(tail.gen_finished)}:null};
        return {ok:true};
    }
    function nativePrefixFresh(run) {
        const captured=run.nativeCapture,c=context();
        if(!captured || run.nativeFailed || !fresh(run) || run.nativeOwner!==generation || generation.aborted || c.chat!==captured.chat || c.chat.length<captured.refs.length || !captured.refs.every((message,index)=>c.chat[index]===message) || sourceText(c.chat.slice(0,captured.refs.length))!==captured.stamp)return false;
        if(captured.target && (c.chat.length!==captured.expectedIndex+1 || c.chat[captured.expectedIndex]!==captured.target || !same(captured.target.swipes?.slice(0,captured.priorSwipes.length),captured.priorSwipes)))return false;
        return c.chat.length<=captured.expectedIndex+1;
    }
    function holdNative(run,error) {
        if(run.nativeTimer)clearTimeout(run.nativeTimer);run.nativeTimer=null;
        run.nativeFailed=true;run.nativeCompletion?.resolve(error);run.nativeReady?.resolve(error);clear();
    }
    const ownsNativeStop=run=>active===run && run.epoch===epoch && run.policyOwner===generation && sameNativeStopPassport(run.policyPassport,nativeStopPassport(context));
    function stopNativeGeneration(run,stop) {
        if(run.nativeStopReceipt)return run.nativeStopReceipt;
        if(!ownsNativeStop(run)||typeof stop!=='function')return Promise.resolve(false);
        try {
            // Observe the owned Stop before another async listener can deliver
            // that event to a replacement Send.
            const c=context(),events=c.eventTypes??c.event_types??{};
            if(nativeStopListener && events.GENERATION_STOPPED)c.eventSource?.makeFirst?.(events.GENERATION_STOPPED,nativeStopListener);
            if(!ownsNativeStop(run))return Promise.resolve(false);
        } catch {return Promise.resolve(false);}
        // Publish the receipt before calling the host: stopping may reenter us.
        const receipt=deferred();run.nativeStopReceipt=receipt.promise;
        const previous=invokingPolicyStop;invokingPolicyStop=run.policyOwner;
        try {Promise.resolve(stop()).then(value=>receipt.resolve(value!==false),()=>receipt.resolve(false));}
        catch {receipt.resolve(false);}
        finally {invokingPolicyStop=previous;}
        return receipt.promise;
    }
    function stopNativeReasoning(run) {
        try {const c=context(),stop=c.stopGeneration;void stopNativeGeneration(run,typeof stop==='function'?()=>stop.call(c):undefined);}
        catch {/* Keep the reasoning failure when native stopping is unavailable. */}
    }
    const nativeReasoningTarget=(c,payload)=>({api:payload?'openai':c.mainApi,source:payload?.chat_completion_source??c.chatCompletionSettings?.chat_completion_source,model:payload?.model??c.getChatCompletionModel?.(c.chatCompletionSettings),endpoint:payload?.custom_url??c.chatCompletionSettings?.custom_url??null});
    function nativeReasoningOverrides(target,controls,payload) {
        const mapped=reasoningRequestOverrides(target,controls);if(!mapped.ok)return mapped;
        if(!Object.hasOwn(mapped.data,'custom_include_body'))return mapped;
        try {
            const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
            const parse=value=>{
                try{return JSON.parse(value);}catch{
                    const yaml=globalThis.SillyTavern?.libs?.yaml;
                    if(typeof yaml?.parse==='function')return yaml.parse(value);
                    if(typeof value==='string'&&/^[\w.-]+$/.test(value))return value;
                    throw Error();
                }
            };
            const overlay=JSON.parse(mapped.data.custom_include_body||'{}');
            if(payload?.custom_exclude_body){
                const excluded=parse(payload.custom_exclude_body),keys=Array.isArray(excluded)?excluded.filter(key=>typeof key==='string'):object(excluded)?Object.keys(excluded):typeof excluded==='string'?[excluded]:[];
                if(keys.some(key=>Object.hasOwn(overlay,key)))return fail('REASONING_UNSUPPORTED','The native custom exclusion body removes a required reasoning field.');
            }
            const existing=payload?.custom_include_body;
            if(existing===undefined||existing===null||existing==='')return mapped;
            const parsed=parse(existing),body=Array.isArray(parsed)?Object.assign({},...parsed.filter(object)):object(parsed)?{...parsed}:{};
            // Node controls own reasoning; stale custom fields must not restore
            // a preset effort or conflict with a different provider's mapping.
            for(const key of ['reasoning','reasoning_effort','thinking','reasoning_budget','thinking_budget','thinking_config','thinkingConfig','enable_thinking','include_reasoning'])delete body[key];
            if(object(body.extra_body?.google))delete body.extra_body.google.thinking_config;
            if(object(body.extra_body)&&object(overlay.extra_body)){
                if(object(body.extra_body.google)&&object(overlay.extra_body.google))overlay.extra_body.google={...body.extra_body.google,...overlay.extra_body.google};
                overlay.extra_body={...body.extra_body,...overlay.extra_body};
            }
            return {ok:true,data:{...mapped.data,custom_include_body:JSON.stringify({...body,...overlay})}};
        } catch {return fail('REASONING_UNSUPPORTED','Native custom reasoning requires readable JSON or the host YAML parser for custom include and exclusion bodies.');}
    }
    function prepareNativeReasoning(run,node) {
        const c=context(),controls=Object.freeze({reasoningEffort:node.reasoningEffort??'none',reasoningCustom:node.reasoningCustom??''});
        const surface=!!unsubscribe&&c.mainApi==='openai'&&!!(c.eventTypes??c.event_types)?.CHAT_COMPLETION_SETTINGS_READY&&typeof c.eventSource?.on==='function';
        if(!surface){
            if(controls.reasoningEffort!=='none')return fail('REASONING_UNSUPPORTED','The host has no supported final native reasoning settings surface.');
            run.nativeReasoningSkipped=true;run.nativeReasoningSkipReason='The host has no supported native reasoning settings surface.';return {ok:true};
        }
        const target=nativeReasoningTarget(c),mapped=nativeReasoningOverrides(target,controls,c.chatCompletionSettings);
        if(!mapped.ok)return mapped;
        run.nativeReasoning=controls;return {ok:true};
    }
    async function applyNativeReasoning(payload) {
        const run=active;
        // This event is emitted only by the native chat send, after its final
        // settings conversion. Auxiliary services never emit it.
        const current=()=>active===run&&run?.native&&run.unified&&run.nativePrepared&&!run.nativeResolved&&!run.nativeFailed&&!run.nativeReasoningApplied&&run.nativeReasoning&&payload?.type===run.nativeType&&!generationInvocationDryRun&&!generation.dryRun&&!generation.aborted&&nativePrefixFresh(run);
        if(!current()||!sourceFresh(run))return;
        const reject=error=>{
            run.nativeReasoningFailure=error;holdNative(run,error);const abort=run.abortPrimary;run.abortPrimary=null;run.nativeOwner.aborted=true;
            try{abort?.(true);}catch{/* The installed native abort callback is best effort. */}
            stopNativeReasoning(run);
        };
        if(run.nodeFileBackend){
            const files=await verifyNodeFiles(run);
            if(!current())return;
            if(!files.ok){reject(files);return;}
            if(!sourceFresh(run))return;
        }
        const target=nativeReasoningTarget(context(),payload);
        const mapped=nativeReasoningOverrides(target,run.nativeReasoning,payload);
        // The public YAML parser can be supplied by the host. Recheck ownership
        // after that callback before altering or stopping a native request.
        if(!current()||!sourceFresh(run))return;
        if(!mapped.ok){reject(mapped);return;}
        if(!payload||typeof payload!=='object'||Array.isArray(payload))return;
        try{Object.assign(payload,mapped.data);run.nativeReasoningApplied=true;}
        catch{reject(fail('REASONING_UNSUPPORTED','The final native settings could not accept this reasoning override.'));}
    }
    function checkNativeCompletion(run) {
        run.nativeTimer=null;
        if(active!==run || run.nativeResolved || !run.nativeEnded)return;
        if(!run.nativePrepared)return holdNative(run,fail('NATIVE_GENERATION_MISMATCH','Native generation ended before its preparation was released.'));
        if(!nativePrefixFresh(run))return holdNative(run,fail('STALE_SOURCE','The owned native chat, prefix, user or workflow changed.'));
        if(run.nativeReasoning&&!run.nativeReasoningApplied){
            if(run.nativeReasoning.reasoningEffort!=='none')return holdNative(run,fail('REASONING_UNSUPPORTED','The native generation did not expose its final reasoning settings.'));
            run.nativeReasoningSkipped=true;run.nativeReasoningSkipReason='The native generation did not expose its final reasoning settings.';
        }
        if(!run.nativeReceived)return holdNative(run,fail('NATIVE_REPLY_MISSING','Generation ended without its matching received reply.'));
        if(ports.isBusy?.()) {
            if(Date.now()-run.nativeEndedAt>=5000)return holdNative(run,fail('NATIVE_COMPLETION_TIMEOUT','Native generation did not become settled after End.'));
            run.nativeTimer=setTimeout(()=>checkNativeCompletion(run),15);return;
        }
        const c=context(),captured=run.nativeCapture,m=c.chat[captured.expectedIndex];
        if(c.chat.length!==captured.expectedIndex+1 || !completed(m) || incompleteStream(c,captured.expectedIndex) || stoppedRevision(m))return holdNative(run,fail('REPLY_UNAVAILABLE','The owned native reply is incomplete, stopped or unsupported.'));
        const started=generationStamp(m.gen_started),finished=generationStamp(m.gen_finished);
        // ST allocates gen_started before awaiting character loading and emitting
        // Started. Completion follows the owned Started event; loading duration
        // cannot impose a lower bound on the generation's start timestamp.
        const reused=captured.priorGeneration && started===captured.priorGeneration.started && finished===captured.priorGeneration.finished;
        if(started===null || finished===null || finished<started || finished<run.nativeOwner.startedAt || started>Date.now()+1000 || reused)return holdNative(run,fail('NATIVE_GENERATION_MISMATCH','The received reply does not identify the owned generation.'));
        if((m.swipe_id??0)!==captured.expectedSwipe || !Array.isArray(m.swipes) || m.swipes[captured.expectedSwipe]!==m.mes || !Array.isArray(m.swipe_info) || !m.swipe_info[captured.expectedSwipe])return holdNative(run,fail('NATIVE_REPLY_UNNORMALIZED','Native reply swipe normalization did not finish.'));
        if(captured.target && (!same(m.swipe_info.slice(0,captured.priorSwipeInfo.length),captured.priorSwipeInfo) || m.swipes.length!==captured.expectedSwipe+1))return holdNative(run,fail('NATIVE_SWIPE_MISMATCH','Generated swipe changed existing swipe identities.'));
        const snapshot=snapshotReply(c,captured.expectedIndex);if(snapshot.ok===false)return holdNative(run,snapshot);
        // Prior context remains scoped private host material; the newly authored native portrayal is public.
        const {context:priorContext,...storyDraft}=snapshot;run.nativeContext=priorContext;
        const draft=freezeArtifact({...storyDraft,source:{...snapshot.source,userId:run.userId,nativeAttemptId:run.nativeOwner.id,...(run.recallCaptured?{sourceId:'draft:'+run.runId,revision:run.runId,sceneId:run.identity.chatId,watch:'draft'}:{})}});
        const entry={message:m,chat:c.chat,refs:[...c.chat],prefix:sourceText(c.chat),swipeText:m.swipes[draft.source.swipeId],source:draft.source,run};
        run.pendingSources.set(draft.source.token,entry);run.nativeDraft=draft;run.nativeResolved=true;run.nativeOwner.finished=true;run.abortPrimary=null;clear();
        const metadata=freezeArtifact({kind:'data',value:{type:'native-generation',schemaVersion:1,runId:run.runId,attemptId:run.nativeOwner.id,generationType:run.nativeType,source:{...run.identity,userId:run.userId,messageIndex:captured.expectedIndex,swipeId:captured.expectedSwipe},started,finished}});
        const completedResult={ok:true,outputs:{draft,metadata},reports:[{code:'NATIVE_GENERATION_COMPLETED',generationType:run.nativeType,reviewRequired:true},...(run.nativeReasoningSkipped?[{code:'REASONING_SKIPPED',reason:run.nativeReasoningSkipReason}]:[])]};
        if(run.recallCaptured){const retained=recall.capture(run,completedResult,{kind:'source',source:{sourceId:draft.source.sourceId,revision:draft.source.revision,sceneId:draft.source.sceneId,watch:'draft'},text:draft.text,fresh:()=>fresh(run)&&nativePrefixFresh(run)&&sourceFresh(run)});if(!retained.ok)return holdNative(run,retained);}
        run.nativeCompletion.resolve(completedResult);
    }
    function scheduleNative(run) {if(!run.nativeTimer)run.nativeTimer=setTimeout(()=>checkNativeCompletion(run),0);}
    function scopedFiles(run,request={}){
        if(!run.hostUnified)return fail('ROOT_ONLY','Native file capabilities require an authorized unified workflow.');
        let actorGrant,actorId,actors,key='selected';
        if(request.actorScope==='presence'){
            const scoped=scopedActors(run);if(!scoped.ok)return scoped;actors=scoped.data;
            if(request.reference){const session=run.fileReferences.get(request.reference);if(!session||session.actorId!==request.actorId||session.presence!==request.presence)return fail('ACTOR_FILE_SCOPE_MISMATCH','Use this present actor’s exact captured file session.');const live=actors.checkActorGrant(session.actorGrant);return live.ok?{ok:true,data:session}:live;}
            const existing=[...run.fileSessions.values()].find(session=>session.actorId===request.actorId&&session.presence===request.presence);if(existing){const live=actors.checkActorGrant(existing.actorGrant);return live.ok?{ok:true,data:existing}:live;}
            const grant=actors.authorizeActor(request.actorId,request.presence);if(!grant.ok)return grant;actorGrant=grant.data.grant;actorId=grant.data.scope.actorId;key=Object.freeze({actorId,presence:request.presence});
        }else{if(run.fileSession)return {ok:true,data:run.fileSession};const actor=nativeMemoryScope(context(),ports.selectIntrospectionActor);actorId=actor.ok?actor.data.actorId:undefined;}
        const live=()=>fresh(run)&&(!run.unified||nativePrefixFresh(run))&&(!run.effectEntry||acceptedSourceFresh(run.effectEntry)&&sourceFresh(run))&&(!actorGrant||actors.checkActorGrant(actorGrant).ok);
        if(!run.workflowDataDefaultsPrepared){
            const prepared=ensureWorkflowDataDefaults({catalog:documentCatalog,graph:{nodes:{}},defaults:run.workflowDataDefaults,scope:{userId:run.userId,chatId:run.identity.chatId},context,isCurrent:live});
            if(!prepared.ok)return prepared;
            run.workflowDataDefaultsPrepared=true;
        }
        const chatSource=createChatPrefixBinding(run.nativeCapture?.refs??context().chat,sourceText);
        const session=createNativeFileSession({catalog:documentCatalog,nodeFileDefinitions:run.nodeFileDefinitions??[],diskBackend:run.nodeFileBackend,scope:{userId:run.userId,chatId:run.identity.chatId,...(actorId?{actorId}:{})},context,userId:()=>ports.userId?.(),persistenceVerifier,signal:run.controller.signal,isCurrent:live,barriers:fileBarriers,workflowId:run.graph.id,chatSource,maintainHistory:run.unified===true,getOriginalDraft:()=>run.nativeDraft??{source:{messageIndex:context().chat.length-1,swipeId:context().chat.at(-1)?.swipe_id??0,originalText:context().chat.at(-1)?.mes??''}},validateEvidence:()=>({ok:true}),stage:effect=>{if(!live())return fail('STALE_RUN','The accepted effect source changed.');run.stagedFiles.push(effect);return {ok:true};}});
        if(!session.ok)return session;if(!live()){session.data.release();return fail('STALE_RUN','The native file scope changed during capture.');}const captured=Object.freeze({...session.data,actorId,...(actorGrant?{actorGrant,presence:request.presence}:{})});run.fileSessions.set(key,captured);if(key==='selected')run.fileSession=captured;return {ok:true,data:captured};
    }
    async function scopedStoryState(run){
        if(run.storySession)return {ok:true,data:run.storySession};
        const files=scopedFiles(run);if(!files.ok)return files;
        const c=context(),playerIndex=c.chat.findLastIndex(message=>message.is_user===true),player=c.chat[playerIndex],refs=c.chat.slice(0,playerIndex+1),stamp=sourceText(refs),chat=c.chat,userId=run.userId,capturedIdentity=identity(c);
        if(!player||stamp===null)return fail('STATE_SOURCE_REQUIRED','Accepted story state requires an actual captured player turn.');
        const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([capturedIdentity,userId,playerIndex,player.swipe_id??0,player.mes,player.send_date??null]))));
        if(!fresh(run)||(!run.unified?sourceText(context().chat.slice(0,refs.length))!==stamp:!nativePrefixFresh(run)))return fail('STALE_SOURCE','The player turn changed while capturing accepted story state.');
        const turnId='turn:'+Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
        const playerCurrent=()=>{const live=context(),user=ports.userId?.();return user===userId&&same(identity(live),capturedIdentity)&&live.chat===chat&&live.chat.findLastIndex(message=>message.is_user===true)===playerIndex&&refs.every((message,index)=>live.chat[index]===message)&&sourceText(live.chat.slice(0,refs.length))===stamp&&ports.userId?.()===userId;};
        run.playerSourceCurrent=playerCurrent;
        const sourceForEvent=event=>{
            if(event.source?.watch==='player-message'){
                const position=event.evidence?.position;
                if(!playerCurrent()||!position||player.mes.slice(position.start,position.end)!==event.evidence.text)return fail('STATE_EVIDENCE_CHANGED','The occurrence is not supported by the captured player message.');
                const disclosure=nativeVisibility(player);if(!disclosure.ok||disclosure.data.present)return fail('PRIVATE_MATERIAL','Restricted player events require an explicitly scoped event source.');
                return {ok:true,data:{isCurrent:playerCurrent}};
            }
            if(event.source?.watch==='draft'&&run.nativeDraft){const key=JSON.stringify([event.source.sourceId,event.source.revision,event.source.sceneId,event.source.visibility,event.source.actorId??null]),draft=run.draftSources?.get(key);if(!draft||!run.draftEvidence?.validate([event],draft).ok)return fail('STATE_EVIDENCE_CHANGED','Draft occurrences require their retained authentic narrative source.');return {ok:true,data:{isCurrent:()=>fresh(run)&&nativePrefixFresh(run)&&sourceFresh(run)&&run.draftEvidence?.validate([event],draft).ok===true}};}
            return fail('STATE_EVIDENCE_CHANGED','Use the captured player message or owned native Draft as event evidence.');
        };
        run.storySession=createNativeStoryState({files:files.data,scope:{userId:run.userId,chatId:run.identity.chatId},isCurrent:()=>fresh(run)&&playerSourceFresh(run)&&(!run.unified||nativePrefixFresh(run))&&(!run.effectEntry||acceptedSourceFresh(run.effectEntry)&&sourceFresh(run)),turnId,sourceForEvent,playerSource:{sourceId:turnId,revision:turnId,sceneId:run.identity.chatId,watch:'player-message',text:player.mes,visibility:'public'},cache:outcomeCache});
        return {ok:true,data:run.storySession};
    }
    async function sourceScene(run,node,inputs,operationPorts,options){
        let cause;
        if(node.activationMode==='events'){
            if(!inputs.trigger)return {ok:true,outputStates:Object.fromEntries(['out','records','manifest','cursor','report'].map(id=>[id,{status:'skipped',reason:{code:'INPUT_SKIPPED',message:'A trigger is required.'}}]))};
            if(typeof ports.sourceTriggers?.authorizeTrigger!=='function')return fail('SOURCE_TRIGGER_CAPABILITY_REQUIRED','An exact current host event trigger is required.');
            if(typeof ports.sourceTriggers.retainReader!=='function'||typeof ports.sourceTriggers.retainOutput!=='function')return fail('SOURCE_TRIGGER_RETENTION_REQUIRED','The current trigger cause must be retained privately.');
            const authorized=ports.sourceTriggers.authorizeTrigger(inputs.trigger,{node,address:operationPorts.address,signal:run.controller.signal});if(!authorized?.ok)return authorized??fail('SOURCE_TRIGGER_UNAUTHORIZED','The trigger could not be authorized.');cause=authorized.data;if(!cause||typeof cause.isCurrent!=='function'||!cause.cause||typeof cause.cause!=='object'||!Object.isFrozen(cause.cause)||Reflect.ownKeys(cause.cause).length!==0||cause.isCurrent()!==true)return fail('SOURCE_TRIGGER_UNAUTHORIZED','The exact current private trigger cause is required.');
        }
        let state=getSourceRegistry().inspect();if(!state.ok)return state;
        if(state.data.status==='unverified'&&run.unified&&run.nativeType==='normal'&&run.nativeOwner===generation&&fresh(run)&&nativePrefixFresh(run)){
            const synchronized=await getSourceRegistry().synchronizeNativeAppend(run.nativeCapture.refs,{signal:run.controller.signal});if(!synchronized.ok)return synchronized;
            if(!fresh(run)||!nativePrefixFresh(run))return fail('STALE_SOURCE','The owned Send source changed during verification.');
            state=getSourceRegistry().inspect();if(!state.ok)return state;
        }
        let grant=null;
        if(node.visibilityMode!=='public'){
            const service=sourceActors(run);if(!service.ok)return service;
            if(!run.sourceActorGrant){const captured=service.data.authorizeSelectedActor();if(!captured.ok)return captured;const exact=captured.data.grant;run.sourceActorGrant={exact,service:service.data,handle:Object.freeze({actorId:captured.data.scope.actorId,scope:state.data.scope,isCurrent:()=>fresh(run)&&service.data.checkActorGrant(exact).ok})};}
            grant=run.sourceActorGrant.handle;
        }
        const current=()=>fresh(run)&&!run.resourcesReleased&&(!cause||cause.isCurrent()===true)&&(!run.unified||nativePrefixFresh(run));
        const c=context(),chat=run.unified?run.nativeCapture.refs:options.chat??c.chat;
        const captured=getSourceRegistry().capture({chat,scope:state.data.scope,selector:{roles:['user','assistant'],visibilityMode:node.visibilityMode??'actor',includeCharacter:node.includeCharacter!==false},...(run.unified?{allowPrefixAppend:()=>nativePrefixFresh(run)&&!run.nativeFailed&&run.nativeOwner===generation}:{}),signal:run.controller.signal,isCurrent:current});if(!captured.ok)return captured;
        const character=node.includeCharacter===false?{ok:true,data:null}:captureNativeCharacterProjection({getContext:context,getUserId:()=>ports.userId?.(),scope:state.data.scope,getActorGrant:()=>grant,isCurrent:current,signal:run.controller.signal});if(!character.ok)return character;
        const reader=createSourceReader({exposeCursor:false,...(cause?{getTriggerCause:()=>cause}:{}),getCharacterProjection:()=>character.data,signal:run.controller.signal,isCurrent:current,getActorGrant:()=>grant,...(typeof ports.getConfirmedSourceFrontier==='function'?{getConfirmedFrontier:query=>ports.getConfirmedSourceFrontier(query,{node,address:operationPorts.address,workflowId:run.graph.id})}:{})});run.sourceReaders.add(reader);
        const selection=node.selection??'recent',request={selection,maxMessages:node.maxMessages??1000,maxTextUnits:node.maxTextUnits??100000,...(selection==='recent'?{recentMessages:node.recentMessages??12}:{}),...(selection==='range'?{range:{firstSourceId:node.firstSourceId,lastSourceId:node.lastSourceId}}:{}),...(selection==='before-window'?{keepRecentAssistantTurns:node.keepRecentAssistantTurns??10}:{}),...(selection==='since-cursor'?{...(inputs.cursor?{cursor:inputs.cursor.value}:{}),...(node.confirmed?{confirmed:true}:{}),...(node.protectRecentWindow?{upperBoundary:{keepRecentAssistantTurns:node.keepRecentAssistantTurns??10}}:{}),...(node.allowAppendRebase?{allowAppendRebase:true}:{})}:{})};
        const page=reader.selectSourcePage(captured.data,request);if(!page.ok)return page;
        if(cause&&typeof ports.sourceTriggers.retainReader!=='function')return fail('SOURCE_TRIGGER_RETENTION_REQUIRED','The current trigger cause must be retained privately.');
        if(cause){const retained=ports.sourceTriggers.retainReader(page.data,cause);if(!retained?.ok)return retained??fail('SOURCE_TRIGGER_UNAUTHORIZED','The trigger cause could not be retained.');}
        const view=inspectSourcePage(page.data);if(!view.ok)return view;
        // Readability, including absent/empty fields, determines source dependencies.
        // Restricted public-mode cards must never expose their prose to this watch.
        const wrapper=Object.getOwnPropertyDescriptor(c.characters??{},String(c.characterId))?.value,data=Object.getOwnPropertyDescriptor(wrapper??{},'data')?.value??wrapper;
        const publicReadable=material=>{const visibility=nativeVisibility(material),disclosure=contextDisclosure(material);return visibility.ok&&!visibility.data.present&&disclosure.ok&&(!disclosure.data.present||disclosure.data.visibility.kind==='public');};
        const characterKeys=grant!==null||node.includeCharacter!==false&&publicReadable(wrapper)&&publicReadable(data)?['name','description','personality','scenario']:[];
        run.sourcePages.add(page.data);run.sourceCaptures.add({nativeChat:c.chat,metadata:c.chatMetadata,references:[...chat],scope:state.data.scope,sourceEpoch:captured.data.sourceEpoch,revision:captured.data.revision,watchCharacter:node.includeCharacter!==false||grant!==null,characterKeys});const registered=run.sourceProofs.registerReaderResult(page.data.result,page.data);return registered.ok?page.data.result:registered;
    }
    async function nativeOperation(run,node,inputs,operationPorts,options) {
        node=managedNode(run,operationPorts.address)??node;
        if(operationPorts.root!==true&&!isScopedSystemOperation(node))return fail('HOST_OPERATION_REQUIRED','Nested operations require the trusted static system capability.');
        if(!fresh(run) || run.unified&&!nativePrefixFresh(run))return fail('STALE_RUN','Native workflow source changed.');
        if(['on-send','generate-reply'].includes(node.operation)&&(!run.native||!run.unified))return fail('NATIVE_OWNER_MISSING','Native activation requires its owned generation event.');
        if(node.operation==='on-send') {
            if(run.activation)return fail('MULTIPLE_SEND_ACTIVATIONS','One owned Send activation is supported.');
            run.activation=freezeArtifact({kind:'data',value:{type:'send-activation',schemaVersion:1,runId:run.runId,attemptId:run.nativeOwner.id,generationType:run.nativeType,source:{...run.identity,userId:run.userId}}});
            return {ok:true,outputs:{activation:run.activation},reports:[]};
        }
        if(node.operation==='player-event-source') {
            const player=context().chat.findLast(message=>message.is_user===true),disclosure=player&&nativeVisibility(player),label=player&&contextDisclosure(player);
            if(!player)return fail('STATE_SOURCE_REQUIRED','Player Event Source requires an actual player message.');
            if(!disclosure?.ok||disclosure.data.present||!label?.ok||label.data.present&&label.data.visibility.kind!=='public')return fail('PRIVATE_MATERIAL','Player Event Source requires a public actual player message.');
            const story=await scopedStoryState(run);if(!story.ok)return story;
            const source=story.data.playerSource();if(!source.ok)return source;
            const produced={ok:true,artifact:freezeArtifact({kind:'data',value:source.data}),reports:[{code:'PLAYER_EVENT_SOURCE',actualCalls:0}]};
            if(run.recallCaptured){const retained=recall.capture(run,produced,{kind:'source',source:source.data,text:source.data.text,fresh:()=>fresh(run)&&playerSourceFresh(run)&&(!run.unified||nativePrefixFresh(run))});if(!retained.ok)return retained;}
            return produced;
        }
        if(node.operation==='generate-reply') {
            if(inputs.activation!==run.activation || !run.activation)return fail('NATIVE_ACTIVATION_REQUIRED','Generation requires this run’s owned On Send activation.');
            if(run.nativeBoundary)return fail('MULTIPLE_NATIVE_GENERATIONS','One native generation boundary is supported.');
            const fileAccess=await verifyNodeFiles(run);if(!fileAccess.ok)return fileAccess;
            run.nativeBoundary=true;
            // This is a private runtime snapshot: opaque binding identity must be
            // retained through preparation and native release.
            const preparationFresh=()=>{
                if(!nativePrefixFresh(run)||!sourceFresh(run)||run.recallCaptured&&!recall.fresh(run))return fail('STALE_SOURCE','Source changed while preparing native generation.');
                if(typeof operationPorts.getRequestBindings!=='function')return fail('BINDING_CHECK_UNAVAILABLE','Native preparation requires its private request binding snapshot.');
                try {
                    const entries=operationPorts.getRequestBindings();
                    if(!Array.isArray(entries))throw new Error();
                    run.bindingChecks=bindingChecks(run,entries);
                } catch {return fail('BINDING_CHECK_UNAVAILABLE','Native preparation could not verify its request bindings.');}
                const effective=bindingFresh(run);if(!effective.ok)return effective;
                // Binding-status/resolver callbacks can change live host state.
                // Their return is followed by the final source/owner guard so no
                // callback can approve stale guidance or native preparation.
                if(!nativePrefixFresh(run)||!sourceFresh(run)||!userFresh(run)||run.recallCaptured&&!recall.fresh(run))return fail('STALE_SOURCE','Source changed while checking native preparation bindings.');
                return {ok:true};
            };
            const rejectPreparation=error=>{
                holdNative(run,error);
                const abort=run.abortPrimary;run.abortPrimary=null;run.nativeOwner.aborted=true;
                try{abort?.(true);}catch{/* The owned native abort callback is best effort. */}
                return error;
            };
            let prepared=preparationFresh();if(!prepared.ok)return rejectPreparation(prepared);
            if(inputs.guidance!==undefined) {
                const guidance=inputs.guidance;
                const authorizedGuidance=()=>{const mark=artifactVisibility(guidance);if(mark.kind==='public')return {ok:true};if(mark.kind!=='actor-private')return fail('ACTOR_GUIDANCE_SCOPE','Native generation cannot receive hidden or mixed actor guidance.');const nativeActor=nativeMemoryScope(context(),ports.selectIntrospectionActor);if(!nativeActor.ok||nativeActor.data.actorId!==mark.actorId)return fail('ACTOR_GUIDANCE_SCOPE','Native generation requires its currently selected actor’s guidance.');return run.guidanceComposition.authorize(guidance,original=>{const actor=run.actorContext?.authorizeGuidance(original);if(actor?.ok)return actor;const recalled=run.recallCaptured?recall.authorizeGuidance(run,original):null;return recalled?.ok?recalled:fail('ACTOR_GUIDANCE_UNVERIFIED','Use exact retained current-actor guidance.');});};
                let authority=authorizedGuidance();if(!authority.ok)return rejectPreparation(authority);
                if(guidance.kind!=='guidance' || typeof guidance.text!=='string' || guidance.text.length>100000 || typeof ports.countTokens!=='function')return fail('INVALID_GUIDANCE','Native guidance requires bounded Guidance and a tokenizer.');
                const measured=await ports.countTokens(guidance.text);
                authority=authorizedGuidance();if(!authority.ok)return rejectPreparation(authority);
                prepared=preparationFresh();if(!prepared.ok)return rejectPreparation(prepared);
                if(!Number.isFinite(measured?.tokens) || measured.tokens<0)return fail('TOKEN_COUNT_FAILED','Guidance tokenizer returned an invalid count.');
                if(measured.tokens>(node.budgetTokens??768))return fail('GUIDANCE_OVERFLOW','Guidance exceeds the native boundary token budget.');
                if(run.invalidMemoryEvidence)return fail('STALE_MEMORY_EVIDENCE','Selected memory evidence is no longer current.');
                prepared=preparationFresh();if(!prepared.ok)return rejectPreparation(prepared);
                authority=authorizedGuidance();if(!authority.ok)return rejectPreparation(authority);
                try {const c=context(),key=PREFIX+addressKey(operationPorts.address);keys.add(key);if(typeof c.setExtensionPrompt!=='function')throw new Error();c.setExtensionPrompt(key,guidance.text,GUIDANCE_POSITIONS[node.injectionPosition??'in-chat'],node.injectionDepth??0,false,GUIDANCE_ROLES[node.injectionRole??'system']);if(c.extensionPrompts && c.extensionPrompts[key]?.value!==guidance.text)throw new Error();}
                catch {clear();return fail('GUIDANCE_UNAVAILABLE','Native guidance could not be installed.');}
                authority=authorizedGuidance();if(!authority.ok)return rejectPreparation(authority);
                prepared=preparationFresh();if(!prepared.ok)return rejectPreparation(prepared);
            }
            prepared=preparationFresh();if(!prepared.ok)return rejectPreparation(prepared);
            const reasoning=prepareNativeReasoning(run,node);if(!reasoning.ok)return rejectPreparation(reasoning);
            const finalFiles=await verifyNodeFiles(run);if(!finalFiles.ok)return rejectPreparation(finalFiles);
            prepared=preparationFresh();if(!prepared.ok)return rejectPreparation(prepared);
            run.pending=false;run.nativePrepared=true;run.nativeReady.resolve({ok:true,prepared:true,awaitingNative:true,runId:run.runId,published:inputs.guidance!==undefined,...(run.nativeReasoningSkipped?{reasoningSkipped:true}:{})});
            return run.nativeCompletion.promise;
        }
        if(['recall','hotkey-arm'].includes(node.operation)){if(!run.unified||run.mode==='target')return {ok:true,outputStates:Object.fromEntries((node.operation==='recall'?['out','records','report']:['proposal']).map(id=>[id,{status:'skipped',reason:{code:'RECALL_PREVIEW_NO_ACTIVATION',message:'Recall activates only on an owned ordinary Send or generated swipe.'}}])),reports:[]};const result=await recall.execute(run,node,inputs,{phase:operationPorts.phase,address:operationPorts.address,countTokens:ports.countTokens});if(result.ok&&artifactVisibility(result.outputs).kind==='actor-private'){const scoped=scopedActors(run);if(!scoped.ok)return scoped;const grant=scoped.data.authorizeSelectedActor();if(!grant.ok)return grant;const retained=scoped.data.captureScopedResult(result,grant.data.grant);if(!retained.ok)return retained;}return result;}
        if(['story-clock','commit-clock','commit-outcomes'].includes(node.operation)){
            const state=await scopedStoryState(run);if(!state.ok)return state;
            if(node.operation==='commit-outcomes')return executeRandom(node,inputs,{phase:operationPorts.phase,root:true,signal:run.controller.signal,stageNativeOutcomes:(target,values,unused,handling)=>state.data.stageOutcomes(target,values,operationPorts.address,handling)});
            const result=await executeTimeNode(node,inputs,{phase:operationPorts.phase,root:true,signal:run.controller.signal,readStoryClock:state.data.readClock,stageStoryClock:(report,occurrences,handling)=>state.data.stageClock(report,occurrences,operationPorts.address,handling)});
            if(result.ok&&node.operation==='story-clock'){const registered=state.data.registerClock(result.outputs.out.value,result.outputs.out.value.clockId);if(!registered.ok)return registered;}
            return result;
        }
        if(['read-file','write-file'].includes(node.operation)) {
            if(!run.hostUnified)return fail('ROOT_ONLY','Native file capabilities require an authorized unified workflow.');
            const scopeRequest={actorScope:node.actorScope??'selected',actorId:node.actorId,presence:inputs.presence,reference:inputs.reference?.value};
            const captured=scopedFiles(run,scopeRequest);if(!captured.ok)return captured;
            if(node.operation==='write-file'&&inputs.evidence!==undefined){const state=await scopedStoryState(run);if(!state.ok)return state;}
            const files=captured.data;
            let read;const result=await executeFileNode(node,inputs,{phase:operationPorts.phase,root:true,signal:run.controller.signal,authorizeActorFileScope:({actorId,presence,reference})=>{if(actorId!==files.actorId||presence!==files.presence||reference&&run.fileReferences.get(reference)!==files)return fail('ACTOR_FILE_SCOPE_MISMATCH','The present-actor file capture changed.');const scoped=scopedActors(run);if(!scoped.ok)return scoped;const checked=scoped.data.checkActorGrant(files.actorGrant);return checked.ok?{ok:true,data:{actorId}}:checked;},files:{read:async (target,options)=>{const visibility=files.visibility(target);if(!visibility.ok)return visibility;read=await files.store.read(target,options);if(read.ok)run.fileReferences.set(read.data.fileRef,files);return read;},prepare:files.store.prepare},fileVisibility:({reference})=>files.visibility(reference.targetId),authorizeFileWrite:({reference})=>{const mark=files.visibility(reference.targetId);return mark.ok?{ok:true,data:{destinationVisibility:mark.data}}:mark;},createIntentId:(producer,evidence,reference)=>files.intentId(producer,evidence,operationPorts.address,reference),stageFileIntent:files.stage});
            if(node.operation==='read-file'&&result.ok&&artifactVisibility(result.outputs).kind==='actor-private'){const scoped=scopedActors(run);if(!scoped.ok)return scoped;const selected=files.actorGrant?{ok:true,data:{grant:files.actorGrant,scope:{actorId:files.actorId}}}:scoped.data.authorizeSelectedActor();if(!selected.ok)return selected;if(selected.data.scope.actorId!==files.actorId)return fail('ACTOR_FILE_SCOPE_MISMATCH','The private file belongs to a changed native actor.');const retained=scoped.data.captureScopedResult(result,selected.data.grant);if(!retained.ok)return retained;}
            if(run.recallCaptured&&node.operation==='read-file'&&result.ok&&read?.ok&&result.outputs?.reference?.value===read.data.fileRef){
                const snapshot=read.data.snapshot;let recordValue;try{recordValue=JSON.parse((read.data.readView??snapshot).content);}catch{}
                const diskBacked=run.nodeFileDefinitions?.some(definition=>definition.targetId===snapshot.targetId);
                const legacyFingerprint=()=>{const stored=context().chatMetadata?.latticeDocuments?.[run.userId]?.[snapshot.targetId];return stored===undefined?null:JSON.stringify(stored);};
                const storedFingerprint=diskBacked?null:legacyFingerprint();
                const captured=recall.capture(run,result,{kind:'file',recordValue,fresh:()=>fresh(run)&&nativePrefixFresh(run)&&files.visibility(snapshot.targetId).ok&&(diskBacked?run.nodeFileFresh!==false:legacyFingerprint()===storedFingerprint)});
                if(!captured.ok)return captured;
            }
            return result;
        }
        if(node.operation==='scene-context'&&operationPorts.runtime===3)return sourceScene(run,node,inputs,operationPorts,options);
        if(['scene-context','reply-snapshot','prompt-source'].includes(node.operation)) {
            const snapshot=selectedSnapshot(run,operationPorts.phase,node,options);
            if(snapshot?.ok===false)return snapshot;
            let artifact=snapshot?.ok===true?snapshot.artifact:snapshot;
            if(run.recallCaptured&&node.operation==='scene-context'&&artifact?.kind==='context'){const source={sourceId:'scene:'+run.runId+':'+(operationPorts.address.instancePath.length?sha256Text(addressKey(operationPorts.address)).slice(7):operationPorts.address.nodeId),revision:run.runId,sceneId:run.identity.chatId,watch:'scene-context'};artifact=freezeArtifact({...artifact,source:{...artifact.source,...source}});const result={ok:true,artifact,reports:snapshot?.report?[snapshot.report]:[]};const captured=recall.capture(run,result,{kind:'source',source,text:artifact.messages.filter(message=>message.source==='chat').map(message=>message.text).join('\n'),fresh:()=>fresh(run)&&nativePrefixFresh(run)&&sourceFresh(run)});return captured.ok?result:captured;}
            return {ok:true,artifact,reports:snapshot?.report?[snapshot.report]:[]};
        }
        return fail('HOST_OPERATION_REQUIRED','Unsupported private host operation.');
    }
    // Runtime completion owns the original error. Stopping the host must not
    // replace that recording with the reentrant GENERATION_STOPPED cancellation.
    async function failureDisposition(run,value) {
        if(value.ok)return {...value,...(value.recovered?{failureDisposition:'continued'}:{})};
        const ownsRun=()=>active===run && run.epoch===epoch && run.policyOwner===generation;
        if(!ownsRun() || run.controller.signal.aborted)return value;
        if(run.failurePolicy==='native-fallback')return {...value,failureDisposition:generation.aborted?'stopped':run.nativeResolved?'reply-preserved':'native-fallback'};
        run.policyStopping=true;
        const abort=run.abortPrimary;run.abortPrimary=null;
        try{abort?.(true);}catch{/* Native callback is best effort; real stop follows. */}
        let stopped=false;
        try {stopped=await stopNativeGeneration(run,ports.stopGeneration);}
        catch {/* Keep the node failure and report that host stopping was unconfirmed. */}
        finally {run.policyStopping=false;}
        run.controller.abort('Workflow failed');
        if(ownsNativeStop(run)) {generation.aborted=true;clear();}
        return {...value,failureDisposition:stopped?'stopped':'stop-unavailable'};
    }
    async function beforeUnified(graph,chat,abort,type) {
        if(generation.overlap){abort?.(true);return notify(fail('OVERLAPPING_GENERATION','A new generation overlapped the owned native continuation.'));}
        if(active?.native){cancel('Overlapping native generation');abort?.(true);return notify(fail('OVERLAPPING_GENERATION','Overlapping native requests are unsupported.'));}
        const run=start(graph,true,abort);run.unified=true;
        // Capture only admitted document identity before completeness can stop execution.
        const admitted=cloneWorkflowDocument(graph);
        if(admitted.ok)run.automaticOrigin=Object.freeze({graph:run.originalGraph,documentToken:run.documentToken,graphId:admitted.data.id,graphName:admitted.data.name,signature:workflowSignature(graph),phase:'unified',kind:'send',runId:run.runId});
        run.nativeType=type;run.nativeReady=deferred();run.nativeCompletion=deferred();
        const completion=execute(run,{chat}).then(async value=>{
            const priorResult=result;
            if(!value.ok)value=await failureDisposition(run,value);
            else if(value.recovered)value={...value,failureDisposition:'continued'};
            run.nativeReady.resolve(value.ok?fail('NATIVE_BOUNDARY_MISSING','The selected workflow never reached native generation.'):value);
            if(active===run&&value.ok&&run.nativeResolved)value=await automaticallyApply(run,value);
            if(active===run){active=null;notify(value,run);}else if(active===null && run.controller.signal.aborted && result===priorResult)notify(value,run);return value;
        });
        run.completion=completion;
        const ready=await run.nativeReady.promise;
        if(!ready.ok) {const final=await completion;return final.failureDisposition==='native-fallback'?{...final,fallback:'native'}:final;}
        return ready;
    }
    async function beforeGenerate(chat,_contextSize,abort,type='normal') {
        type=type||'normal';
        // Prompt inspection cannot replace the real generation owner or clear its guidance.
        if(generationInvocationDryRun)return {ok:true,skipped:true};
        if(applying||automaticApplication){abort?.(true);return notify(fail('BUSY','Wait for reply application to finish before generating another reply.'));}
        clear();
        if(generation.aborted) {abort?.(true);return notify(fail('ABORTED','The native generation was stopped before workflow preparation.'));}
        if(generation.dryRun || !['normal','swipe','regenerate','continue'].includes(type)) {if(active)cancel('Overlapping background generation');return {ok:true,skipped:true};}
        if(ports.isEnabled?.()===false)return {ok:true,skipped:true};
        const preflight=await ports.beforeRun?.({kind:'send'});if(preflight?.ok===false){abort?.(true);return notify(preflight);}
        const unified=ports.getGraph?.('unified');
        if(Object.getOwnPropertyDescriptor(unified??{},'mode')?.value==='native-unified')return beforeUnified(unified,chat,abort,type);
        return {ok:true,skipped:true};
    }
    async function runTarget(graph,target,{messageIndex,onEvent}={}) {
        const preflight=await ports.beforeRun?.({kind:'preview',graph,target});if(preflight?.ok===false)return notify(preflight);
        if(preflight&&ports.getGraph){const latest=ports.getGraph('unified');if(latest)graph=latest;}
        // Admit before replacing run authority or consulting the host. Runtime owns
        // the bounded malformed result, including getter-free version metadata.
        const admitted=cloneWorkflowDocument(graph);
        if(!admitted.ok){const runId=token(),capture=captureDiagnostics(graph,false,target,runId),owner={documentToken:ports.getDocumentToken?.()};return finishDiagnostic(capture,notify(await runWorkflowForHost(graph,{target,runId}),null,owner));}
        // Manual previews cannot own SillyTavern's generation. Check the entire
        // dependency path before starting a run or dispatching auxiliary work.
        const attempt=prepareWorkflowAttempt(admitted.data,{target}),planned=attempt.ok?{ok:true,data:attempt.data.selection}:attempt;
        if(planned.ok&&planned.data.primitives.some(unit=>unit.included&&['on-send','generate-reply'].includes(unit.node.operation))){
            const source=planned.data.primitives.find(unit=>unit.included&&['on-send','generate-reply'].includes(unit.node.operation));
            const runId=token(),capture=captureDiagnostics(graph,false,target,runId);
            const owner={documentToken:ports.getDocumentToken?.()};
            return finishDiagnostic(capture,notify(freezeArtifact({ok:false,runId,mode:'target',schema:admitted.data.schema,runtime:admitted.data.runtime,actualCalls:0,callBound:planned.data.callBound,reviewHandles:[],error:{code:'NATIVE_OWNER_MISSING',message:'This step starts when you send a message. Enable Lattice, then send a message in SillyTavern to run this workflow.',nodeId:source.address.nodeId,address:source.address}}),null,owner));
        }
        const run=start(graph,false,null,target);
        const value=await execute(run,{messageIndex,onEvent});
        if(active===run){active=null;return notify(value,run);}
        return value;
    }
    function validSource(entry) {
        const c=context(),s=entry.source;
        return fresh(entry.run) && promptFresh(entry.run) && !ports.isBusy?.() && c.chat===entry.chat && c.chat.length===s.chatLength && c.chat.every((m,i)=>m===entry.refs[i]) && c.chat[s.messageIndex]===entry.message && s.messageIndex===c.chat.length-1 && completed(entry.message) && !incompleteStream(c,s.messageIndex) && !stoppedRevision(entry.message) && (entry.message.swipe_id??0)===s.swipeId && entry.message.swipes?.[s.swipeId]===entry.swipeText && entry.message.mes===s.originalText && sourceText(c.chat)===entry.prefix;
    }
    function candidateEntry(selector) {
        if(selector?.handleId) {
            const entry=candidates.get(selector.handleId);
            return entry && selector.runId===entry.handle.runId && same(selector.terminal,entry.terminal)?entry:null;
        }
        return null;
    }
    function candidateStatus(selector) {
        const entry=candidateEntry(selector);
        if(!entry)return fail('STALE_CANDIDATE','This candidate is no longer available; run the workflow again.');
        if(entry.applied){if(entry.settlementResult?.status==='partial'&&acceptedSourceFresh(entry))return {ok:true,persistOnly:true,status:'partial'};return fail('ALREADY_APPLIED','This revision has already been applied.');}
        if(applying||ports.isBusy?.())return fail('BUSY','Wait for generation or reply application to finish.');
        const effective=bindingFresh(entry.run);if(!effective.ok)return effective;
        return validSource(entry)?{ok:true}:fail('STALE_SOURCE','The chat, reply, swipe, or prompt source changed. Run the workflow again.');
    }
    function acceptedSourceFresh(entry) {
        if(!entry.applied)return validSource(entry);
        const effective=bindingFresh(entry.run);if(!effective.ok)return false;
        const c=context(),m=entry.message,s=entry.source,old={...m,...m.swipe_info?.[s.swipeId],mes:m.swipes?.[s.swipeId],swipe_id:s.swipeId};
        return fresh(entry.run)&&promptFresh(entry.run)&&!ports.isBusy?.()&&c.chat===entry.chat&&c.chat.length===s.chatLength&&c.chat.every((item,index)=>item===entry.refs[index])&&c.chat[s.messageIndex]===m&&m.mes===entry.candidate.text&&m.swipe_id===entry.applied.swipeId&&m.swipes?.[s.swipeId]===s.originalText&&sourceText(c.chat.map((item,index)=>index===s.messageIndex?old:item))===entry.prefix;
    }
    async function automaticallyApply(run,value) {
        const entries=run.reviewHandles.filter(handle=>run.automaticTerminals.has(addressKey(handle.terminal.address))||run.automaticEffectTerminals.has(addressKey(handle.terminal.address))).map(handle=>candidateEntry(handle)).filter(Boolean);
        if(entries.length>1)return {...value,...fail('AUTO_APPLY_AMBIGUOUS','Enable automatic application on only one selected Review / Publish terminal.')};
        const entry=entries[0];
        if(!entry)return value;
        const unchanged=entry.candidate.text===entry.source.originalText;
        if(unchanged){
            if(!entry.settlement||!run.automaticEffectTerminals.has(addressKey(entry.terminal.address)))return value;
            entry.effectsOnlyPublication=true;
        } else if(!run.automaticTerminals.has(addressKey(entry.terminal.address)))return value;
        automaticApplication=run;
        try {
            const applied=await apply(entry.handle);
            if(!applied.ok)return {...value,...applied};
            entry.applied=freezeArtifact({...applied,automaticallyApplied:true});
            return entry.applied;
        } catch {return {...value,...fail('APPLY_FAILED','The automatic revision could not be applied. Inspect the retained review and chat before retrying.')};}
        finally {automaticApplication=null;}
    }
    // Automatic application publishes one final result after acceptance, rather
    // than exposing its intermediate publication/persistence notifications.
    const applicationResult=(value,run)=>{
        if(automaticApplication===run)return value;
        const recovered=value.automaticallyApplied===true&&automaticResult?.origin.runId===run?.runId;
        return notify(value,recovered?run:null,run);
    };
    async function apply(selector) {
        const entry=candidateEntry(selector);
        if(entry&&!entry.applied){const files=await verifyNodeFiles(entry.run);if(!files.ok)return applicationResult(files,entry.run);}
        if(!entry?.settlement)return publishCandidate(selector);
        if(!acceptedSourceFresh(entry))return applicationResult(fail('STALE_SOURCE','The accepted reply or its captured scope changed.'),entry.run);
        if(entry.settlementResult?.status==='settled')return entry.applied;
        const settled=await entry.settlement.accept(entry.finalDraft);if(!settled.ok)return applicationResult(settled,entry.run);
        entry.settlementResult=settled.data;
        entry.applied=freezeArtifact({...entry.applied,settlement:settled.data});
        if(settled.data.status==='settled')entry.settlement.release();
        return applicationResult(entry.applied,entry.run);
    }
    function settlementStatus(selector) {const entry=candidateEntry(selector);if(!entry?.settlement)return fail('SETTLEMENT_UNAVAILABLE','This review has no retained consequence bundle.');return entry.settlementResult?{ok:true,data:entry.settlementResult}:entry.settlement.inspect();}
    function retryPersistence(selector) {const entry=candidateEntry(selector);return entry?.settlementResult?.status==='partial'?apply(selector):Promise.resolve(fail('PERSISTENCE_RECOVERY_UNAVAILABLE','Only failed targets in a partially settled accepted review may retry persistence.'));}
    function reject(selector) {const entry=candidateEntry(selector);if(!entry)return fail('STALE_CANDIDATE','This review is no longer retained.');entry.settlement?.reject();releaseRun(entry.run);candidates.delete(entry.handle.handleId);return {ok:true};}
    async function publishCandidate(selector) {
        const entry=candidateEntry(selector),candidate=entry?.candidate;
        if(!entry)return notify(fail('STALE_CANDIDATE','This candidate is no longer available; run the workflow again.'));
        if(entry.applied) {
            if(fresh(entry.run) && bindingFresh(entry.run).ok && context().chat?.[entry.source.messageIndex]===entry.message && entry.message.mes===candidate.text && entry.message.swipe_id===entry.applied.swipeId)return entry.applied;
            return applicationResult(fail('STALE_CANDIDATE','The applied revision is no longer the selected reply.'),entry.run);
        }
        if(applying)return fail('BUSY','A reply application is already in progress.');
        const effective=bindingFresh(entry.run);if(!effective.ok)return applicationResult(effective,entry.run);
        if(!validSource(entry))return applicationResult(fail('STALE_SOURCE','The chat, reply, swipe, or prompt source changed. Run the workflow again.'),entry.run);
        if(entry.effectsOnlyPublication){
            entry.applied=freezeArtifact({...entry.run.publicResult,ok:true,appliedLocally:true,effectsOnlyApplied:true,saveAttempted:false,persistence:'not-attempted',swipeId:entry.source.swipeId});
            return applicationResult(entry.applied,entry.run);
        }
        const c=context(),m=entry.message,index=entry.source.messageIndex;
        if(typeof c.saveChat!=='function' || typeof c.updateMessageBlock!=='function' || typeof c.swipe?.refresh!=='function' || typeof ports.syncMesToSwipe!=='function' || typeof ports.syncSwipeToMes!=='function')return applicationResult(fail('APPLY_UNAVAILABLE','Required native save, display or swipe synchronization APIs are unavailable.'),entry.run);
        const backup=structuredClone(m); let mutated=false,saveAttempted=false;
        applying=true;
        try {
            // No await is allowed between this last source check and the mutation.
            if(!bindingFresh(entry.run).ok||!validSource(entry))throw new Error('Source changed');
            mutated=true;
            m.swipes=Array.isArray(m.swipes)?[...m.swipes]:[m.mes];
            m.swipe_id=m.swipe_id ?? 0;
            if(!Number.isInteger(m.swipe_id) || typeof m.swipes[m.swipe_id]!=='string')throw new Error('Invalid swipe identity');
            m.swipe_info=Array.from({length:m.swipes.length},(_,i)=>structuredClone(m.swipe_info?.[i] ?? {send_date:m.send_date,extra:{}}));
            if(!ports.syncMesToSwipe(index))throw new Error('Cannot preserve original swipe');
            if(m.swipes[entry.source.swipeId]!==candidate.original)throw new Error('Original swipe was not preserved');
            // Capture after the public helper synchronizes current original metadata.
            const preserved=structuredClone({swipes:m.swipes,info:m.swipe_info});
            const swipeId=m.swipes.length,now=new Date().toISOString();
            const revisionInfo={send_date:now,gen_started:now,gen_finished:now,extra:{latticeRevision:{sourceToken:candidate.source.token,sourceSwipeId:candidate.source.swipeId,workflowId:entry.run.graph.id,at:now}}};
            m.swipes.push(candidate.text);
            m.swipe_info.push(structuredClone(revisionInfo));
            if(!ports.syncSwipeToMes(index,swipeId,m))throw new Error('Cannot select revision');
            const revisionMetadata=value=>value && ({send_date:value.send_date,gen_started:value.gen_started,gen_finished:value.gen_finished,revision:value.extra?.latticeRevision});
            const expectedMetadata=revisionMetadata(revisionInfo);
            const intactSwipes=()=>Array.isArray(m.swipes) && m.swipes.length===swipeId+1
                && m.swipes[swipeId]===candidate.text && same(m.swipes.slice(0,swipeId),preserved.swipes)
                && Array.isArray(m.swipe_info) && m.swipe_info.length===swipeId+1
                && same(m.swipe_info.slice(0,swipeId),preserved.info)
                && same(revisionMetadata(m.swipe_info[swipeId]),expectedMetadata) && same(revisionMetadata(m),expectedMetadata);
            const stillApplied=()=>intactSwipes() && fresh(entry.run) && promptFresh(entry.run) && bindingFresh(entry.run).ok && !ports.isBusy?.() && context().chat===entry.chat && c.chat.length===entry.source.chatLength && c.chat.every((item,i)=>item===entry.refs[i]) && m.mes===candidate.text && m.swipe_id===swipeId;
            if(!stillApplied())throw new Error('Revision synchronization failed');
            internalEvents++;
            try {
                for(const name of ['MESSAGE_SWIPED','MESSAGE_UPDATED']) { const event=(c.eventTypes ?? c.event_types)?.[name];if(event)await c.eventSource?.emit(event,index);if(!stillApplied())throw new Error('Reply changed during notification'); }
            } finally {internalEvents--;}
            await c.updateMessageBlock(index,m);
            if(!stillApplied())throw new Error('Reply changed during render');
            await c.swipe.refresh(true,false);
            if(!stillApplied())throw new Error('Reply changed before save');
            saveAttempted=true;const saved=await c.saveChat();
            if(saved===false || saved?.ok===false || !stillApplied())throw new Error('Save failed or source changed');
            entry.applied=freezeArtifact({...entry.run.publicResult,ok:true,appliedLocally:true,saveAttempted:true,persistence:'unverified',swipeId});
            for(const [id,sibling]of candidates)if(sibling!==entry&&sibling.source.token===entry.source.token)candidates.delete(id);
            return applicationResult(entry.applied,entry.run);
        } catch {
            if(mutated) {for(const key of Object.keys(m))delete m[key];Object.assign(m,backup);try{if(context().chat===entry.chat && same(identity(context()),entry.run.identity)){await c.updateMessageBlock(index,m);await c.swipe.refresh(true,false);}}catch{/* Report detectable failure even if refresh fails. */}}
            return applicationResult({...fail('APPLY_FAILED','The revision could not be applied; the original local message was restored.'),appliedLocally:false,saveAttempted,persistence:saveAttempted?'unverified':'not-attempted'},entry.run);
        } finally {applying=false;}
    }
    function subscribe() {
        if(unsubscribe)return unsubscribe;
        recall.sync();
        captureBranchPoint();
        const c=context(),events=c.eventTypes ?? c.event_types ?? {},subscriptions=[];
        const on=(name,fn)=>{if(events[name] && c.eventSource?.on){c.eventSource.on(events[name],fn);subscriptions.push([events[name],fn]);}};
        on('CHAT_COMPLETION_SETTINGS_READY',applyNativeReasoning);
        on('GENERATION_STARTED',(type,options,dryRun)=>{
            generationInvocationDryRun=!!dryRun;if(dryRun)return;
            generation={overlap:!!active?.unified && !active.nativeResolved,observed:true,id:++generationSequence,startedAt:Date.now(),type:type || 'normal',dryRun:!!dryRun,aborted:!!options?.signal?.aborted,originalTail:{message:context().chat?.at(-1),text:context().chat?.at(-1)?.mes}};
            cancel('Generation started');
            const owner=generation;
            if(options?.signal)options.signal.addEventListener('abort',()=>{if(generation===owner){generation.aborted=true;if(!active?.policyStopping)cancel('Generation aborted');}},{once:true});
        });
        nativeStopListener=()=>{if(invokingPolicyStop){if(generation===invokingPolicyStop)generation.aborted=true;return;}generation.aborted=true;if(active?.policyStopping)return;const m=context().chat?.at(-1);if(m && !m.is_user && (!generation.originalTail || m!==generation.originalTail.message || m.mes!==generation.originalTail.text || incompleteStream(context(),context().chat.length-1)))rememberStopped(context());if(active?.nativeReasoningFailure){clear();return;}cancel('Generation stopped');};
        on('GENERATION_STOPPED',nativeStopListener);
        on('GENERATION_ENDED',()=>{
            if(active?.unified && !active.nativeResolved){active.nativeEnded=true;active.nativeEndedAt??=Date.now();active.abortPrimary=null;clear();scheduleNative(active);return;}
            if(generation.unified && generation.finished)return;
            const c=context();if(incompleteStream(c,c.chat?.length-1) && c.chat?.at(-1))rememberStopped(c);if(active && !active.pending)active.abortPrimary=null;cancel('Generation ended');
        });
        on('MESSAGE_RECEIVED',(messageIndex,type)=>{
            if(active?.unified && !active.nativeResolved){
                if(messageIndex!==active.nativeCapture?.expectedIndex || type!==active.nativeType)return holdNative(active,fail('NATIVE_GENERATION_MISMATCH','Received message does not match the owned generation.'));
                active.nativeReceived={messageIndex,type};scheduleNative(active);return;
            }
            if(!internalEvents)cancel('MESSAGE_RECEIVED');
        });
        on('MESSAGE_SWIPE_DELETED',({messageId,swipeId}={})=>{
            const m=context().chat?.[messageId],records=stopped.get(m);
            if(records && Number.isInteger(messageId) && Number.isInteger(swipeId) && swipeId>=0 && Array.isArray(m.swipes) && swipeId<=m.swipes.length) {
                const surviving=[];
                for(const record of records) {
                    if(record.revision.swipeId===swipeId)continue;
                    const id=record.revision.swipeId-(record.revision.swipeId>swipeId?1:0);
                    const revision={...record.revision,swipeId:id};
                    const stored=replyRevision({...m.swipe_info?.[id],swipe_id:id,mes:m.swipes[id]});
                    // Native deletion already spliced both arrays; only rebase a surviving failed revision.
                    if(record.failedStarted!==null?record.failedStarted===stored.started:same(revision,stored))surviving.push({...record,revision});
                }
                stopped.set(m,surviving);
            }
            if(!internalEvents)cancel('MESSAGE_SWIPE_DELETED');
        });
        for(const name of ['CHAT_CHANGED','CHARACTER_SELECTED','MESSAGE_SENT','MESSAGE_DELETED','MESSAGE_SWIPED','MESSAGE_EDITED','MESSAGE_UPDATED'])on(name,()=>{if(!internalEvents){cancel(name);if(name==='CHAT_CHANGED')captureBranchPoint();recall.sync();}});
        unsubscribe=()=>{cancel('Controller disposed');for(const [event,fn]of subscriptions)(c.eventSource.removeListener ?? c.eventSource.off)?.call(c.eventSource,event,fn);unsubscribe=null;recall.dispose();};
        return unsubscribe;
    }
    /** @type {import('./types').NativeSourceControllerActions} */
    const sourceActions={inspectSources:()=>getSourceRegistry().inspect(),setupSources:controls=>{cancel('Source setup');const state=getSourceRegistry().inspect();return state.ok?getSourceRegistry().synchronize({expectedRevision:state.data.revision,cause:'enroll'},controls):Promise.resolve(state);},reconcileSources:controls=>{cancel('Source reconciliation');const state=getSourceRegistry().inspect();return state.ok?getSourceRegistry().synchronize({expectedRevision:state.data.revision,cause:'explicit-reconcile'},controls):Promise.resolve(state);},verifySources:controls=>{cancel('Source verification');return getSourceRegistry().verifyPending(controls);},resetSourceEpoch:(command,controls)=>{cancel('Source epoch reset');return getSourceRegistry().resetSourceEpoch(command,controls);}};
    const inspectChunkTokenizer=()=>{try{const tokenizer=ports.chunkTokenizer,binding=Object.getOwnPropertyDescriptor(tokenizer??{},'binding')?.value,counter=Object.getOwnPropertyDescriptor(tokenizer??{},'countTokens')?.value,checked=cloneJsonValue(binding);if(typeof counter!=='function'||!checked.ok||Object.keys(checked.data.value??{}).length!==3||!['tokenizerId','version','model'].every(key=>typeof checked.data.value[key]==='string'&&checked.data.value[key].trim()&&checked.data.value[key].length<=256))return fail('TOKEN_COUNT_FAILED','This host has no exact Chunk tokenizer. Use UTF-16 sizing, or select an available exact tokenizer before choosing Tokens.');return {ok:true,data:{binding:checked.data.value}};}catch{return fail('TOKEN_COUNT_FAILED','The exact Chunk tokenizer is unavailable.');}};
    const controller={...sourceActions,inspectChunkTokenizer,beforeGenerate,runTarget,apply,reject,previewStoryHistoryCheckpoint:documentHistory.preview,applyStoryHistoryCheckpoint:documentHistory.apply,inspectStoryHistory:documentHistory.inspect,syncRecall:recall.sync,statusRecall:recall.status,queueRecall:recall.queue,cancelRecall:recall.cancel,captureRecall:recall.captureQueueCommand,changeRecallQueues:recall.changeQueues,resetRecallDocument:recall.resetDocument,subscribeRecall:recall.subscribe,settlementStatus,retryPersistence,candidateStatus,cancel,activity,subscribeActivity,progress,subscribeProgress,lastResult:()=>result,lastAutomaticResult:()=>automaticResult,subscribe,dispose:()=>{if(unsubscribe)unsubscribe();else recall.dispose();sourceRegistry?.release();activityListeners.clear();progressListeners.clear();}};
    retentionInspectors.set(controller,()=>{
        const runs=new Set([active,...[...sources.values(),...candidates.values()].map(entry=>entry.run)].filter(Boolean));
        const recordings=new Set([result?.recording,automaticResult?.result.recording,...[...runs].map(run=>run.publicResult?.recording),...[...candidates.values()].map(entry=>entry.applied?.recording)].filter(Boolean));
        return freezeArtifact({distinctRecordings:recordings.size,sourceCount:sources.size,candidateCount:candidates.size,runs:[...runs].map(run=>({hasCancel:Object.hasOwn(run,'cancel'),bindingContexts:run.bindingContexts.size,bindingChecks:run.bindingChecks.map(check=>({fields:Object.keys(check).sort(),...(check.node?{nodeFields:Object.keys(check.node).sort()}:{}),...(check.graph?{graphFields:Object.keys(check.graph).sort()}:{} )}))}))});
    });
    return controller;
}
