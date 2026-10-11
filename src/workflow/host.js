import { createNativeGuidanceComposition } from './native-guidance-compose.js?v=0.27.0';
import { isScopedSystemOperation } from './system-capabilities.js?v=0.27.0';
import { sha256Text } from './definition-data.js?v=0.27.0';
import { runWorkflowForHost, freezeArtifact, workflowSignature } from './runtime.js?v=0.27.0';
import { resolveBinding, requestModel, bindingStatus, bindingSummary } from './connections.js?v=0.27.0';
import { addressKey, safeError } from './record-data.js?v=0.27.0';
import { cloneWorkflowDocument } from './document.js?v=0.27.0';
import { resolveWorkflow } from './resolve.js?v=0.27.0';
import { projectIntrospectionNode } from './introspection/native.js?v=0.27.0';
import { executeIntrospection } from './introspection/nodes.js?v=0.27.0';
import { parseRecord } from './introspection/contracts.js?v=0.27.0';
import { artifactVisibility, preserveArtifactPrivacy, validVisibilityMetadata } from './artifact-privacy.js?v=0.27.0';
import { createAcceptedNativeSettlement, createNativeFileSession, validateNativeFileEvidence } from './native-settlement.js?v=0.27.0';
import { createChatDocumentCatalog } from './document-catalog.js?v=0.27.0';
import { ensureWorkflowDataDefaults } from './workflow-data-defaults.js?v=0.27.0';
import { createNativePersistenceVerifier } from './native-persistence.js?v=0.27.0';
import { createNativeDraftEvidenceRegistry } from './native-draft-evidence.js?v=0.27.0';
import { createNativeActorContext } from './native-actor-context.js?v=0.27.0';
import { createNativeRecallController } from './native-recall.js?v=0.27.0';
import { createNativeStoryState, createNativeOutcomeCache } from './native-story-state.js?v=0.27.0';
import { executeTimeNode } from './operations/time-nodes.js?v=0.27.0';
import { executeRandom } from './operations/random-outcomes.js?v=0.27.0';
import { executeFileNode } from './operations/file-nodes.js?v=0.27.0';
import { snapshotDraft, readDraftBody } from './draft-revisions.js?v=0.27.0';
import { snapshotPromptSource, promptSourceFingerprint } from './prompt-source.js?v=0.27.0';
import { createNativeMemoryAdapter, nativeMemoryFingerprint, nativeMemoryScope, nativeVisibility } from './introspection/host-memory.js?v=0.27.0';

// Internal review seam: observations contain no authority or retained payload values.
const retentionInspectors=new WeakMap();
export const inspectWorkflowRetentionForReview=controller=>retentionInspectors.get(controller)?.();

const PREFIX = 'lattice:guidance:';
const fail = (code,message) => ({ok:false,error:{code,message}});
const identity = c => ({chatId:c.getCurrentChatId?.() ?? c.chatId ?? null,characterId:c.characterId ?? null,groupId:c.groupId ?? null});
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
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
const token = () => globalThis.crypto.randomUUID();
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
    const context=ports.context;
    // Separate native read-only capability, captured once. General userId freshness
    // callbacks may have effects and cannot serve as final private transport authority.
    const transportUserId=typeof ports.transportUserId==='function'?ports.transportUserId:null;
    const documentCatalog=ports.documentCatalog??createChatDocumentCatalog({getContext:context,getUserId:()=>ports.userId?.()});
    const persistenceVerifier=ports.persistenceVerifier??createNativePersistenceVerifier({getContext:context,getUserId:()=>ports.userId?.()});
    const fileBarriers=new Map();
    const outcomeCache=createNativeOutcomeCache({...(typeof ports.random==='function'?{random:ports.random}:{})});
    function releaseRun(run) {if(!run||run.resourcesReleased)return;run.resourcesReleased=true;run.guidanceComposition?.clear();run.modelScopes?.clear();run.modelAddresses=new WeakMap();recall.releaseRun(run);run.memorySession?.release();run.memorySession=null;run.storySession?.release();run.storySession=null;run.draftEvidence?.release();run.draftEvidence=null;run.draftSources?.clear();delete run.nativeContext;for(const session of run.fileSessions?.values()??[])session.release();run.fileSessions?.clear();run.fileSession?.release();run.fileSession=null;run.actorContext?.release();run.actorContext=null;for(const session of run.actorMemorySessions?.values()??[])session.release();run.actorMemorySessions?.clear();run.stagedFiles.length=0;run.memoryIntents.clear();run.memoryTerminals.clear();}
    let epoch=0, active=null, result=null, automaticResult=null, applying=false, internalEvents=0, unsubscribe=null;
    let generationSequence=0, generation={dryRun:false,type:'normal'};
    const activityListeners=new Set();
    const activity=()=>active ? Object.freeze({busy:true,graph:active.originalGraph,graphId:Object.getOwnPropertyDescriptor(active.originalGraph ?? {},'id')?.value,runId:active.runId,native:active.native,documentToken:active.documentToken}) : null;
    const publishActivity=()=>{const value=activity();for(const listener of activityListeners)observe(listener,value);};
    const subscribeActivity=listener=>{if(typeof listener!=='function')return ()=>{};activityListeners.add(listener);observe(listener,activity());return ()=>activityListeners.delete(listener);};
    const keys=new Set(), sources=new Map(), candidates=new Map(), stopped=new WeakMap();
    const memoryAdapter=createNativeMemoryAdapter({context,selectActor:ports.selectIntrospectionActor,isSettled:(message,index,c)=>!stoppedRevision(message) && !incompleteStream(c,index)});
    const recall=createNativeRecallController({getActive:()=>{const graph=ports.getGraph?.('unified');if(ports.isEnabled?.()===false||!graph)return null;const c=context(),actor=nativeMemoryScope(c,ports.selectIntrospectionActor);return actor.ok?{owner:ports.getDocumentToken?.()??graph,graph,signature:workflowSignature(graph),scope:{userId:ports.userId?.(),chatId:identity(c).chatId,workflowId:graph.id,actorId:actor.data.actorId}}:null;},...(typeof ports.registerRecallHotkey==='function'?{registerHotkey:ports.registerRecallHotkey}:{})});
    const observe=(fn,...args)=>{try{const pending=fn?.(...args);if(pending&&typeof pending.then==='function')Promise.resolve(pending).catch(()=>{});}catch{/* Observers cannot own lifecycle. */}};
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
        const previous=result;
        if(!value.recording && previous?.recording) {
            // A failed attempt has no run identity. Preserve the old diagnostic separately.
            result=freezeArtifact({...previous,reviewHandles:[],superseded:true});
            const failure=freezeArtifact({...value,error:safeError(value.error)});
            observe(ports.onResult,failure,null);
            return failure;
        }
        result=freezeArtifact(value);
        const origin=run?.native && run.graph ? Object.freeze({graph:run.originalGraph,documentToken:run.documentToken,graphId:run.graph.id,graphName:run.graph.name,signature:run.signature,phase:run.unified?'unified':'pre',kind:'send',runId:run.runId}) : null;
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
    const userFresh=run=>!run.unified&&!run.hostUnified || run.userId===ports.userId?.();
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
    const sourceFresh=run=>playerSourceFresh(run) && memoryFresh(run) && promptFresh(run) && [...(run.pendingSources?.values()??[])].every(validSource) && [...(run.sceneSources??[])].every(entry=>entry.text!==null && sourceText(entry.chat)===entry.text && (entry.characterVisibility===undefined || (entry.characterVisibility!==null && characterVisibility(context())===entry.characterVisibility)) && (entry.characterSnapshots??[]).every(captured=>characterText(snapshotContext(context(),{chat:entry.chat,node:captured.node}))===captured.text));
    const start=(graph,native=false,abortPrimary=null,target)=>{
        cancel('Superseded by a new workflow');
        const run={epoch,runId:token(),controller:new AbortController(),originalGraph:graph,documentToken:ports.getDocumentToken?.(),native,abortPrimary,pending:true,target,mode:target===undefined?'root':'target',pendingSources:new Map(),sceneSources:[],promptSources:new Map(),bindingContexts:new Map(),modelAddresses:new WeakMap(),modelScopes:new Map(),bindingChecks:[],reviewHandles:[],memoryTerminals:new Map(),memoryIntents:new Map(),memorySession:null,invalidMemoryEvidence:false,fileSession:null,fileSessions:new Map(),fileReferences:new WeakMap(),actorContext:null,guidanceComposition:createNativeGuidanceComposition(),actorMemorySessions:new Map(),stagedFiles:[],retainResources:false,resourcesReleased:false};
        active=run;publishActivity();return run;
    };
    function prepareRun(run,plan,controls,options) {
        run.cancel=controls.cancel;
        const captured=controls.originalGraphSnapshot;
        run.graph={id:captured.id,name:captured.name,schema:captured.schema,runtime:captured.runtime,mode:captured.mode};
        run.workflowDataDefaults=plan.primitives.filter(unit=>unit.included&&!unit.systemDisabled).flatMap(unit=>unit.systemDefaults??[]);
        run.workflowDataNodes=Object.fromEntries([...plan.primitives.filter(unit=>unit.included&&!unit.systemDisabled).map(unit=>unit.node),...(controls.workflowDataNodes??[])].map((node,index)=>[index,node]));
        run.signature=workflowSignature(captured);run.identity=identity(context());run.hostUnified=captured.mode==='native-unified';if(run.hostUnified&&!run.unified)run.userId=ports.userId?.();
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
        return {ok:true};
    }
    function scopedActors(run){
        if(run.actorContext)return {ok:true,data:run.actorContext};
        if(!run.hostUnified)return fail('ROOT_ONLY','Actor authority requires an owned unified workflow.');
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
    function retainActorOutput(run,payload){
        const composed=run.guidanceComposition.retain(payload);if(!composed.ok)return composed;
        const mark=artifactVisibility(payload.artifact);if(mark.kind==='public'||mark.kind==='hidden')return {ok:true,data:{retained:true}};
        const scoped=scopedActors(run);if(!scoped.ok)return scoped;
        if(['actor-context','character-direction','prompted-memory'].includes(payload.node.operation)){
            const checked=scoped.data.authorizeEventInputs(payload.node,payload.inputs);if(!checked.ok)return checked;const captured=scoped.data.captureScopedResult(payload.rawResult,checked.data.grant);if(!captured.ok)return captured;
            if(payload.node.operation==='character-direction')return scoped.data.retainGuidance(payload);
        }
        return scoped.data.retainScopedOutput(payload.inputs,payload.artifact,payload);
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
            const chat=run.unified && (options.chat===undefined || options.chat===c.chat)?run.nativeCapture.preChat:options.chat??c.chat;
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
        if(memoryOutputs.length!==run.memoryTerminals.size)return fail('INVALID_MEMORY_TERMINAL','The compiled Memory Commit terminal did not provide its exact intent.');
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
                publish:async()=>{const applied=await publishCandidate(entry.handle);if(!applied.ok)return applied;if(run.memorySession&&memoryOutputs.length){const authorized=run.memorySession.authorizeAcceptedPublication({body:acceptedBody,finalText:entry.candidate.text,messageIndex:entry.source.messageIndex,originalSwipeId:entry.source.swipeId,finalSwipeId:applied.swipeId});if(!authorized.ok)return authorized;}return {ok:true,data:{appliedLocally:true,saveAttempted:true,persistence:applied.persistence,swipeId:applied.swipeId}};}});
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
        const scoped=scopedActors(run);if(!scoped.ok)return scoped;
        const checked=scoped.data.authorizeModelInputs(payload.inputs);if(!checked.ok)return checked;
        // Data authorization can run host callbacks; validate captured event authority last.
        const event=scoped.data.authorizeEventInputs(payload.node,payload.inputs);if(!event.ok)return event;
        if(stopped())return fail('ABORTED','The auxiliary request scope has closed.');
        if(!fresh(run)||!sourceFresh(run)||run.unified&&!nativePrefixFresh(run))return fail('STALE_SOURCE','The captured source changed before auxiliary dispatch.');
        return stopped()?fail('ABORTED','The auxiliary request scope has closed.'):checked;
    }
    function requestNativeModel(run,request) {
        const key=run.modelAddresses.get(request.binding),scope=run.modelScopes.get(key);
        if(run.hostUnified&&(!scope||scope.capability!=='text-completion'))return fail('ACTOR_SCOPE_FAILED','Use this run’s exact authorized auxiliary inputs.');
        const mark=scope?artifactVisibility(scope.inputs):null,actorId=scope&&['character-direction','prompted-memory'].includes(scope.node.operation)?scope.node.actorId:mark?.kind==='actor-private'?mark.actorId:null;
        if(actorId&&!transportUserId)return fail('ACTOR_SCOPE_FAILED','Private transport requires the native read-only user authority.');
        const beforeSend=checkBinding=>{
            if(typeof checkBinding!=='function')return fail('BINDING_CHANGED','The native transport binding check is unavailable.');
            if(scope){
                const initial=actorId?context():null,captured=actorId?actorTransportWatch(initial,actorId,identity(initial).chatId):null;
                if(actorId&&!captured)return fail('ACTOR_CONTEXT_CHANGED','The live actor source cannot be checked before transmission.');
                const checked=authorizeModelScope(run,scope);if(!checked.ok)return checked;
                // Acquire the current wrapper last, then run only own-data comparisons
                // and local lifecycle checks; no user/source/binding callbacks follow.
                const current=context(),chatId=identity(current).chatId;
                if(actorId){let userId;try{userId=transportUserId();}catch{return fail('ACTOR_SCOPE_FAILED','The native read-only user authority is unavailable.');}if(typeof userId!=='string'||userId!==run.userId)return fail('ACTOR_CONTEXT_CHANGED','The private transport user scope changed.');}
                const binding=checkBinding(current);if(!binding.ok)return binding;
                if(actorId&&!sameActorTransportWatch(captured,actorTransportWatch(current,actorId,chatId)))return fail('ACTOR_CONTEXT_CHANGED','The live actor source changed before transmission.');
                return run.controller.signal.aborted||run.resourcesReleased||run.epoch!==epoch?fail('ABORTED','The auxiliary request scope has closed.'):checked;
            }
            if(!fresh(run)||!sourceFresh(run)||run.unified&&!nativePrefixFresh(run))return fail('STALE_SOURCE','The captured source changed before auxiliary dispatch.');
            const binding=checkBinding(context());if(!binding.ok)return binding;
            return run.controller.signal.aborted||run.resourcesReleased||run.epoch!==epoch?fail('ABORTED','The auxiliary request scope has closed.'):{ok:true};
        };
        return requestModel(request,context,{beforeSend});
    }
    async function execute(run,options) {
        let value;
        try {value=await runWorkflowForHost(run.originalGraph,{
            ...(options.phase===undefined?{}:{phase:options.phase}),target:run.target,runId:run.runId,signal:run.controller.signal,
            snapshot:(phase,node)=>selectedSnapshot(run,phase,node,options),countTokens:ports.countTokens,
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
            selectNativeRandomOutcomes:async payload=>{const state=await scopedStoryState(run);return state.ok?state.data.selectNativeRandomOutcomes(payload):state;},
            reuseNativeOutcome:outcome=>run.storySession?run.storySession.reuseNativeOutcome(outcome):{ok:true,data:null},
            retainNativeOutcome:async payload=>run.storySession?run.storySession.retainNativeOutcome(payload):{ok:true}}:{}),
            onStage:ports.onStage,onEvent:event=>{observe(ports.onEvent,event);observe(options.onEvent,event);},
        },{prepare:(plan,controls)=>prepareRun(run,plan,controls,options),executeIntrospection:(node,inputs,operationPorts)=>introspect(run,node,inputs,operationPorts),...(run.unified||Object.getOwnPropertyDescriptor(run.originalGraph,'mode')?.value==='native-unified'?{executeHostOperation:(node,inputs,operationPorts)=>nativeOperation(run,node,inputs,operationPorts,options)}:{}),authorizeModelInputs:payload=>{const checked=authorizeModelScope(run,payload);if(checked.ok)run.modelScopes.set(addressKey(payload.address),Object.freeze({node:payload.node,inputs:payload.inputs,capability:payload.capability}));return checked;},retainScopedOutput:payload=>retainActorOutput(run,payload),retainRecallProvenance:payload=>run.recallCaptured?recall.retain(run,payload):{ok:true,data:{retained:true}},settle:transport=>settleRun(run,transport)});}
        finally {delete run.cancel;run.bindingContexts.clear();run.modelScopes.clear();run.modelAddresses=new WeakMap();if(!run.retainResources)releaseRun(run);}
        if(!value.ok||run.mode==='target') {releaseRun(run);run.pendingSources.clear();run.sceneSources.length=0;run.promptSources.clear();run.bindingChecks=[];for(const [id,entry]of candidates)if(entry.run===run)candidates.delete(id);for(const [id,entry]of sources)if(entry.run===run)sources.delete(id);if(run.native)clear();}
        else run.pendingSources.clear();
        const publicValue=freezeArtifact({...value,reviewHandles:value.ok?run.reviewHandles:[]});
        run.publicResult=publicValue;
        return publicValue;
    }
    const deferred=()=>{let resolve,settled=false;const promise=new Promise(done=>resolve=done);return {promise,resolve(value){if(!settled){settled=true;resolve(value);}}};};
    function captureNative(run,options) {
        const c=context(),owner=generation,userId=ports.userId?.();
        if(!owner.observed || owner.type!==run.nativeType || owner.aborted || owner.dryRun || owner.finished || owner.claimed)return fail('NATIVE_OWNER_MISSING','Native continuation requires its matching Generation Started event.');
        if(!['normal','swipe'].includes(run.nativeType) || c.groupId!==null && c.groupId!==undefined)return fail('UNSUPPORTED_NATIVE_GENERATION','Unified workflows support ordinary nongroup replies and newly generated swipes.');
        if(typeof userId!=='string' || !userId.trim() || userId.length>128)return fail('USER_SCOPE_UNAVAILABLE','A trusted current user handle is required for native continuation.');
        if(!Array.isArray(c.chat) || !c.chat.length)return fail('REPLY_UNAVAILABLE','Native continuation requires a live chat source.');
        const tail=c.chat.at(-1),swipe=run.nativeType==='swipe';
        if(swipe?!completed(tail)||!Array.isArray(tail.swipes)||!tail.swipes.length:!tail.is_user)return fail('UNSUPPORTED_NATIVE_SOURCE','Send requires a user message; swipe requires the latest completed assistant message.');
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
    function checkNativeCompletion(run) {
        run.nativeTimer=null;
        if(active!==run || run.nativeResolved || !run.nativeEnded)return;
        if(!run.nativePrepared)return holdNative(run,fail('NATIVE_GENERATION_MISMATCH','Native generation ended before its preparation was released.'));
        if(!nativePrefixFresh(run))return holdNative(run,fail('STALE_SOURCE','The owned native chat, prefix, user or workflow changed.'));
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
        const completedResult={ok:true,outputs:{draft,metadata},reports:[{code:'NATIVE_GENERATION_COMPLETED',generationType:run.nativeType,reviewRequired:true}]};
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
            const prepared=ensureWorkflowDataDefaults({catalog:documentCatalog,graph:{nodes:run.workflowDataNodes},defaults:run.workflowDataDefaults,scope:{userId:run.userId,chatId:run.identity.chatId},context,isCurrent:live});
            if(!prepared.ok)return prepared;
            run.workflowDataDefaultsPrepared=true;
        }
        const session=createNativeFileSession({catalog:documentCatalog,scope:{userId:run.userId,chatId:run.identity.chatId,...(actorId?{actorId}:{})},context,userId:()=>ports.userId?.(),persistenceVerifier,signal:run.controller.signal,isCurrent:live,barriers:fileBarriers,workflowId:run.graph.id,getOriginalDraft:()=>run.nativeDraft??{source:{messageIndex:context().chat.length-1,swipeId:context().chat.at(-1)?.swipe_id??0,originalText:context().chat.at(-1)?.mes??''}},validateEvidence:()=>({ok:true}),stage:effect=>{if(!live())return fail('STALE_RUN','The accepted effect source changed.');run.stagedFiles.push(effect);return {ok:true};}});
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
    async function nativeOperation(run,node,inputs,operationPorts,options) {
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
                try {const c=context(),key=PREFIX+addressKey(operationPorts.address);keys.add(key);if(typeof c.setExtensionPrompt!=='function')throw new Error();c.setExtensionPrompt(key,guidance.text,1,0,false,0);if(c.extensionPrompts && c.extensionPrompts[key]?.value!==guidance.text)throw new Error();}
                catch {clear();return fail('GUIDANCE_UNAVAILABLE','Native guidance could not be installed.');}
                authority=authorizedGuidance();if(!authority.ok)return rejectPreparation(authority);
                prepared=preparationFresh();if(!prepared.ok)return rejectPreparation(prepared);
            }
            prepared=preparationFresh();if(!prepared.ok)return rejectPreparation(prepared);
            run.pending=false;run.nativePrepared=true;run.nativeReady.resolve({ok:true,prepared:true,awaitingNative:true,runId:run.runId,published:inputs.guidance!==undefined});
            return run.nativeCompletion.promise;
        }
        if(['recall','hotkey-arm'].includes(node.operation)){if(!run.unified||run.mode==='target')return {ok:true,outputStates:Object.fromEntries((node.operation==='recall'?['out','records','report']:['proposal']).map(id=>[id,{status:'skipped',reason:{code:'RECALL_PREVIEW_NO_ACTIVATION',message:'Recall activates only on an owned ordinary Send or generated swipe.'}}])),reports:[]};const result=await recall.execute(run,node,inputs,{phase:operationPorts.phase,address:operationPorts.address,countTokens:ports.countTokens});if(result.ok&&artifactVisibility(result.outputs).kind==='actor-private'){const scoped=scopedActors(run);if(!scoped.ok)return scoped;const grant=scoped.data.authorizeSelectedActor();if(!grant.ok)return grant;const retained=scoped.data.captureScopedResult(result,grant.data.grant);if(!retained.ok)return retained;}return result;}
        if(['story-clock','commit-clock','commit-outcomes'].includes(node.operation)){
            const state=await scopedStoryState(run);if(!state.ok)return state;
            if(node.operation==='commit-outcomes')return executeRandom(node,inputs,{phase:operationPorts.phase,root:true,signal:run.controller.signal,stageNativeOutcomes:(target,values)=>state.data.stageOutcomes(target,values,operationPorts.address)});
            const result=await executeTimeNode(node,inputs,{phase:operationPorts.phase,root:true,signal:run.controller.signal,readStoryClock:state.data.readClock,stageStoryClock:(report,occurrences)=>state.data.stageClock(report,occurrences,operationPorts.address)});
            if(result.ok&&node.operation==='story-clock'){const registered=state.data.registerClock(result.outputs.out.value,result.outputs.out.value.clockId);if(!registered.ok)return registered;}
            return result;
        }
        if(['read-file','write-file'].includes(node.operation)) {
            if(!run.hostUnified)return fail('ROOT_ONLY','Native file capabilities require an authorized unified workflow.');
            const scopeRequest={actorScope:node.actorScope??'selected',actorId:node.actorId,presence:inputs.presence,reference:inputs.reference?.value};
            const captured=scopedFiles(run,scopeRequest);if(!captured.ok)return captured;
            if(node.operation==='write-file'&&inputs.evidence!==undefined){const state=await scopedStoryState(run);if(!state.ok)return state;}
            const files=captured.data;
            let read;const result=await executeFileNode(node,inputs,{phase:operationPorts.phase,root:true,signal:run.controller.signal,authorizeActorFileScope:({actorId,presence,reference})=>{if(actorId!==files.actorId||presence!==files.presence||reference&&run.fileReferences.get(reference)!==files)return fail('ACTOR_FILE_SCOPE_MISMATCH','The present-actor file capture changed.');const scoped=scopedActors(run);if(!scoped.ok)return scoped;const checked=scoped.data.checkActorGrant(files.actorGrant);return checked.ok?{ok:true,data:{actorId}}:checked;},files:{read:async target=>{const visibility=files.visibility(target);if(!visibility.ok)return visibility;read=await files.store.read(target);if(read.ok)run.fileReferences.set(read.data.fileRef,files);return read;},prepare:files.store.prepare},fileVisibility:({reference})=>files.visibility(reference.targetId),authorizeFileWrite:({reference})=>{const mark=files.visibility(reference.targetId);return mark.ok?{ok:true,data:{destinationVisibility:mark.data}}:mark;},createIntentId:(producer,evidence)=>files.intentId(producer,evidence,operationPorts.address),stageFileIntent:files.stage});
            if(node.operation==='read-file'&&result.ok&&artifactVisibility(result.outputs).kind==='actor-private'){const scoped=scopedActors(run);if(!scoped.ok)return scoped;const selected=files.actorGrant?{ok:true,data:{grant:files.actorGrant,scope:{actorId:files.actorId}}}:scoped.data.authorizeSelectedActor();if(!selected.ok)return selected;if(selected.data.scope.actorId!==files.actorId)return fail('ACTOR_FILE_SCOPE_MISMATCH','The private file belongs to a changed native actor.');const retained=scoped.data.captureScopedResult(result,selected.data.grant);if(!retained.ok)return retained;}
            if(run.recallCaptured&&node.operation==='read-file'&&result.ok&&read?.ok&&result.outputs?.reference?.value===read.data.fileRef){const snapshot=read.data.snapshot;let recordValue;try{recordValue=JSON.parse(snapshot.content);}catch{}const originalStored=context().chatMetadata?.latticeDocuments?.[run.userId]?.[snapshot.targetId],storedFingerprint=originalStored===undefined?null:JSON.stringify(originalStored);const captured=recall.capture(run,result,{kind:'file',recordValue,fresh:()=>fresh(run)&&nativePrefixFresh(run)&&files.visibility(snapshot.targetId).ok&&(context().chatMetadata?.latticeDocuments?.[run.userId]?.[snapshot.targetId]===undefined?null:JSON.stringify(context().chatMetadata.latticeDocuments[run.userId][snapshot.targetId]))===storedFingerprint});if(!captured.ok)return captured;}
            return result;
        }
        if(['scene-context','reply-snapshot','prompt-source'].includes(node.operation)) {
            const snapshot=selectedSnapshot(run,operationPorts.phase,node,options);
            if(snapshot?.ok===false)return snapshot;
            let artifact=snapshot?.ok===true?snapshot.artifact:snapshot;
            if(run.recallCaptured&&node.operation==='scene-context'&&artifact?.kind==='context'){const source={sourceId:'scene:'+run.runId+':'+(operationPorts.address.instancePath.length?sha256Text(addressKey(operationPorts.address)).slice(7):operationPorts.address.nodeId),revision:run.runId,sceneId:run.identity.chatId,watch:'scene-context'};artifact=freezeArtifact({...artifact,source:{...artifact.source,...source}});const result={ok:true,artifact,reports:snapshot?.report?[snapshot.report]:[]};const captured=recall.capture(run,result,{kind:'source',source,text:artifact.messages.filter(message=>message.source==='chat').map(message=>message.text).join('\n'),fresh:()=>fresh(run)&&nativePrefixFresh(run)&&sourceFresh(run)});return captured.ok?result:captured;}
            return {ok:true,artifact,reports:snapshot?.report?[snapshot.report]:[]};
        }
        return fail('HOST_OPERATION_REQUIRED','Unsupported private host operation.');
    }
    async function beforeUnified(graph,chat,abort,type) {
        if(generation.overlap){abort?.(true);return notify(fail('OVERLAPPING_GENERATION','A new generation overlapped the owned native continuation.'));}
        if(active?.native){cancel('Overlapping native generation');abort?.(true);return notify(fail('OVERLAPPING_GENERATION','Overlapping native requests are unsupported.'));}
        const run=start(graph,true,abort);run.unified=true;run.nativeType=type;run.nativeReady=deferred();run.nativeCompletion=deferred();
        const completion=execute(run,{chat}).then(value=>{
            run.nativeReady.resolve(value.ok?fail('NATIVE_BOUNDARY_MISSING','The selected workflow never reached native generation.'):value);
            if(active===run){active=null;notify(value,run);}else if(active===null && run.controller.signal.aborted)notify(value,run);return value;
        });
        run.completion=completion;
        const ready=await run.nativeReady.promise;
        if(!ready.ok) {const final=await completion;return {...final,fallback:'native'};}
        return ready;
    }
    async function beforeGenerate(chat,_contextSize,abort,type='normal') {
        clear();type=type||'normal';
        if(generation.aborted) {abort?.(true);return notify(fail('ABORTED','The native generation was stopped before workflow preparation.'));}
        if(generation.dryRun || !['normal','swipe','regenerate','continue'].includes(type)) {if(active)cancel('Overlapping background generation');return {ok:true,skipped:true};}
        if(ports.isEnabled?.()===false)return {ok:true,skipped:true};
        const unified=ports.getGraph?.('unified');
        if(Object.getOwnPropertyDescriptor(unified??{},'mode')?.value==='native-unified')return beforeUnified(unified,chat,abort,type);
        return {ok:true,skipped:true};
    }
    async function runTarget(graph,target,{messageIndex,onEvent}={}) {
        // Admit before replacing run authority or consulting the host. Runtime owns
        // the bounded malformed result, including getter-free version metadata.
        const admitted=cloneWorkflowDocument(graph);
        if(!admitted.ok){const owner={documentToken:ports.getDocumentToken?.()};return notify(await runWorkflowForHost(graph,{target}),null,owner);}
        // Manual previews cannot own SillyTavern's generation. Check the entire
        // dependency path before starting a run or dispatching auxiliary work.
        const planned=resolveWorkflow(admitted.data,{target});
        if(planned.ok&&planned.data.primitives.some(unit=>unit.included&&['on-send','generate-reply'].includes(unit.node.operation))){
            const source=planned.data.primitives.find(unit=>unit.included&&['on-send','generate-reply'].includes(unit.node.operation));
            const owner={documentToken:ports.getDocumentToken?.()};
            return notify(freezeArtifact({ok:false,mode:'target',schema:admitted.data.schema,runtime:admitted.data.runtime,actualCalls:0,callBound:planned.data.callBound,reviewHandles:[],error:{code:'NATIVE_OWNER_MISSING',message:'This step starts when you send a message. Enable Lattice, then send a message in SillyTavern to run this workflow.',nodeId:source.address.nodeId,address:source.address}}),null,owner);
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
    async function apply(selector) {
        const entry=candidateEntry(selector);if(!entry?.settlement)return publishCandidate(selector);
        if(!acceptedSourceFresh(entry))return notify(fail('STALE_SOURCE','The accepted reply or its captured scope changed.'),null,entry.run);
        if(entry.settlementResult?.status==='settled')return entry.applied;
        const settled=await entry.settlement.accept(entry.finalDraft);if(!settled.ok)return notify(settled,null,entry.run);
        entry.settlementResult=settled.data;
        entry.applied=freezeArtifact({...entry.applied,settlement:settled.data});
        if(settled.data.status==='settled')entry.settlement.release();
        return notify(entry.applied,null,entry.run);
    }
    function settlementStatus(selector) {const entry=candidateEntry(selector);if(!entry?.settlement)return fail('SETTLEMENT_UNAVAILABLE','This review has no retained consequence bundle.');return entry.settlementResult?{ok:true,data:entry.settlementResult}:entry.settlement.inspect();}
    function retryPersistence(selector) {const entry=candidateEntry(selector);return entry?.settlementResult?.status==='partial'?apply(selector):Promise.resolve(fail('PERSISTENCE_RECOVERY_UNAVAILABLE','Only failed targets in a partially settled accepted review may retry persistence.'));}
    function reject(selector) {const entry=candidateEntry(selector);if(!entry)return fail('STALE_CANDIDATE','This review is no longer retained.');entry.settlement?.reject();releaseRun(entry.run);candidates.delete(entry.handle.handleId);return {ok:true};}
    async function publishCandidate(selector) {
        const entry=candidateEntry(selector),candidate=entry?.candidate;
        if(!entry)return notify(fail('STALE_CANDIDATE','This candidate is no longer available; run the workflow again.'));
        if(entry.applied) {
            if(fresh(entry.run) && bindingFresh(entry.run).ok && context().chat?.[entry.source.messageIndex]===entry.message && entry.message.mes===candidate.text && entry.message.swipe_id===entry.applied.swipeId)return entry.applied;
            return notify(fail('STALE_CANDIDATE','The applied revision is no longer the selected reply.'),null,entry.run);
        }
        if(applying)return fail('BUSY','A reply application is already in progress.');
        const effective=bindingFresh(entry.run);if(!effective.ok)return notify(effective,null,entry.run);
        if(!validSource(entry))return notify(fail('STALE_SOURCE','The chat, reply, swipe, or prompt source changed. Run the workflow again.'),null,entry.run);
        const c=context(),m=entry.message,index=entry.source.messageIndex;
        if(typeof c.saveChat!=='function' || typeof c.updateMessageBlock!=='function' || typeof c.swipe?.refresh!=='function' || typeof ports.syncMesToSwipe!=='function' || typeof ports.syncSwipeToMes!=='function')return notify(fail('APPLY_UNAVAILABLE','Required native save, display or swipe synchronization APIs are unavailable.'),null,entry.run);
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
            return notify(entry.applied,null,entry.run);
        } catch {
            if(mutated) {for(const key of Object.keys(m))delete m[key];Object.assign(m,backup);try{if(context().chat===entry.chat && same(identity(context()),entry.run.identity)){await c.updateMessageBlock(index,m);await c.swipe.refresh(true,false);}}catch{/* Report detectable failure even if refresh fails. */}}
            return notify({...fail('APPLY_FAILED','The revision could not be applied; the original local message was restored.'),appliedLocally:false,saveAttempted,persistence:saveAttempted?'unverified':'not-attempted'},null,entry.run);
        } finally {applying=false;}
    }
    function subscribe() {
        if(unsubscribe)return unsubscribe;
        recall.sync();
        const c=context(),events=c.eventTypes ?? c.event_types ?? {},subscriptions=[];
        const on=(name,fn)=>{if(events[name] && c.eventSource?.on){c.eventSource.on(events[name],fn);subscriptions.push([events[name],fn]);}};
        on('GENERATION_STARTED',(type,options,dryRun)=>{
            generation={overlap:!!active?.unified && !active.nativeResolved,observed:true,id:++generationSequence,startedAt:Date.now(),type:type || 'normal',dryRun:!!dryRun,aborted:!!options?.signal?.aborted,originalTail:{message:context().chat?.at(-1),text:context().chat?.at(-1)?.mes}};
            if(dryRun)return;
            cancel('Generation started');
            const owner=generation;
            if(options?.signal)options.signal.addEventListener('abort',()=>{if(generation===owner){generation.aborted=true;cancel('Generation aborted');}},{once:true});
        });
        on('GENERATION_STOPPED',()=>{generation.aborted=true;const m=context().chat?.at(-1);if(m && !m.is_user && (!generation.originalTail || m!==generation.originalTail.message || m.mes!==generation.originalTail.text || incompleteStream(context(),context().chat.length-1)))rememberStopped(context());cancel('Generation stopped');});
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
        for(const name of ['CHAT_CHANGED','CHARACTER_SELECTED','MESSAGE_SENT','MESSAGE_DELETED','MESSAGE_SWIPED','MESSAGE_EDITED','MESSAGE_UPDATED'])on(name,()=>{if(!internalEvents){cancel(name);recall.sync();}});
        unsubscribe=()=>{cancel('Controller disposed');for(const [event,fn]of subscriptions)(c.eventSource.removeListener ?? c.eventSource.off)?.call(c.eventSource,event,fn);unsubscribe=null;recall.dispose();};
        return unsubscribe;
    }
    const controller={beforeGenerate,runTarget,apply,reject,syncRecall:recall.sync,statusRecall:recall.status,queueRecall:recall.queue,cancelRecall:recall.cancel,captureRecall:recall.captureQueueCommand,changeRecallQueues:recall.changeQueues,resetRecallDocument:recall.resetDocument,subscribeRecall:recall.subscribe,settlementStatus,retryPersistence,candidateStatus,cancel,activity,subscribeActivity,lastResult:()=>result,lastAutomaticResult:()=>automaticResult,subscribe,dispose:()=>{if(unsubscribe)unsubscribe();else recall.dispose();activityListeners.clear();}};
    retentionInspectors.set(controller,()=>{
        const runs=new Set([active,...[...sources.values(),...candidates.values()].map(entry=>entry.run)].filter(Boolean));
        const recordings=new Set([result?.recording,automaticResult?.result.recording,...[...runs].map(run=>run.publicResult?.recording),...[...candidates.values()].map(entry=>entry.applied?.recording)].filter(Boolean));
        return freezeArtifact({distinctRecordings:recordings.size,sourceCount:sources.size,candidateCount:candidates.size,runs:[...runs].map(run=>({hasCancel:Object.hasOwn(run,'cancel'),bindingContexts:run.bindingContexts.size,bindingChecks:run.bindingChecks.map(check=>({fields:Object.keys(check).sort(),...(check.node?{nodeFields:Object.keys(check.node).sort()}:{}),...(check.graph?{graphFields:Object.keys(check.graph).sort()}:{} )}))}))});
    });
    return controller;
}
