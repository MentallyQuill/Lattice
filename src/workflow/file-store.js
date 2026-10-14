import { cloneJsonValue } from './operations/json-data.js?v=0.27.3';
import { prepareDocumentMutation } from './operations/document-mutations.js?v=0.27.3';
import {documentHistoryHeader,inspectDocumentHistory,validateDocumentHistory,lookupDocumentHistory,prepareDocumentCheckpoint} from './document-history.js?v=0.27.3';
import {artifactVisibility} from './artifact-privacy.js?v=0.27.3';

const fail=(code,message)=>({ok:false,error:{code,message}});
const id=value=>typeof value==='string'&&value.trim().length>0&&value.length<=256;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const revision=value=>typeof value==='string'&&value.trim().length>0&&value.length<=256||Number.isSafeInteger(value)&&value>=0;
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function own(value){const checked=cloneJsonValue(value);return checked.ok?checked.data.value:null;}
function result(raw){
    const value=own(raw);
    if(!plain(value)||typeof value.ok!=='boolean')return fail('INVALID_FILE_BACKEND_RESULT','The file backend must return a checked Result.');
    if(!value.ok)return plain(value.error)&&id(value.error.code)&&typeof value.error.message==='string'&&!Object.hasOwn(value,'data')?fail(value.error.code,value.error.message):fail('INVALID_FILE_BACKEND_RESULT','The backend failure is malformed.');
    return Object.hasOwn(value,'error')?fail('INVALID_FILE_BACKEND_RESULT','The backend success contains an error.'):{ok:true,data:value.data};
}
function trustedConfig(raw,allowed){
    try{
        if(!plain(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return {};
        const descriptors=Object.getOwnPropertyDescriptors(raw);
        if(Reflect.ownKeys(raw).some(key=>typeof key!=='string'||!allowed.includes(key)||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value')))return {};
        return Object.fromEntries(Object.entries(descriptors).map(([key,property])=>[key,property.value]));
    }catch{return {};}
}
function captureCasUpdate(raw){
    const fields=trustedConfig(raw,['targetId','expectedRevision','expectedContent','projectedDocument','intentId','fingerprint']);
    if(Object.keys(fields).length!==6)return null;
    const captured={};
    for(const key of Object.keys(fields)){
        const checked=cloneJsonValue(fields[key]);if(!checked.ok)return null;captured[key]=checked.data.value;
    }
    if(!id(captured.targetId)||!id(captured.intentId)||!revision(captured.expectedRevision)||typeof captured.expectedContent!=='string'||typeof captured.fingerprint!=='string'||!/^sha256:[a-f0-9]{64}$/.test(captured.fingerprint)||!plain(captured.projectedDocument)||typeof captured.projectedDocument.content!=='string'||!['json','jsonl','csv','text','markdown'].includes(captured.projectedDocument.format))return null;
    // Old and new snapshots each have their own read bound; combining both would
    // reject a valid large replacement solely because its content is duplicated.
    return freeze(captured);
}
const validScope=scope=>plain(scope)&&Object.keys(scope).every(key=>['userId','chatId','actorId'].includes(key))&&id(scope.userId)&&id(scope.chatId)&&(!Object.hasOwn(scope,'actorId')||id(scope.actorId));
function validSignal(signal){try{return signal===undefined||typeof Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(signal)==='boolean';}catch{return false;}}
/** Captured trusted ports own storage; portable DTOs and imported snapshots grant no write capability. */
export function createFileStore(config) {
    config=trustedConfig(config,['scope','authorizedTargets','load','compareAndSwap','lookupHistory','inspectHistory','previewCheckpoint','applyCheckpoint','validateEvidence','isCurrent','signal']);
    const refs=new WeakMap(),handles=new WeakMap(),intents=new Map(),uncertain=new Map();
    const scope=own(config.scope),targets=own(config.authorizedTargets);
    const valid=validScope(scope)&&validSignal(config.signal)&&Array.isArray(targets)&&targets.length<=128&&targets.every(id)&&new Set(targets).size===targets.length&&['load','compareAndSwap','validateEvidence','isCurrent'].every(key=>typeof config[key]==='function');
    let released=false,queue=Promise.resolve();
    const current=()=>{
        if(!valid)return fail('INVALID_FILE_CONFIG','Storage requires a captured user/chat scope, authorized targets and trusted backend ports.');
        if(released)return fail('FILE_CAPTURE_RELEASED','This file capture has been released.');
        try{if(config.signal?.aborted)return fail('CANCELLED','File settlement was cancelled.');if(config.isCurrent()!==true)return fail('STALE_FILE_SCOPE','The captured workflow or user/chat scope changed.');}
        catch{return fail('STALE_FILE_SCOPE','The captured file authority could not be verified.');}
        return {ok:true};
    };
    async function load(targetId){
        const before=current();if(!before.ok)return before;
        if(!id(targetId)||!targets.includes(targetId))return fail('FILE_TARGET_UNAUTHORIZED','Select and authorize this storage target in the host.');
        let loaded;try{loaded=result(await config.load(targetId));}catch{return fail('FILE_BACKEND_FAILED','The authorized target could not be read.');}
        const after=current();if(!after.ok)return after;if(!loaded.ok)return loaded;
        const value=loaded.data;
        if(!plain(value)||value.targetId!==targetId||!revision(value.revision)||!['json','jsonl','csv','text','markdown'].includes(value.format)||typeof value.content!=='string'||!Array.isArray(value.receipts)||value.receipts.length>256||value.receipts.some(entry=>!plain(entry)||!id(entry.intentId)||typeof entry.fingerprint!=='string'||!/^sha256:[a-f0-9]{64}$/.test(entry.fingerprint)||!revision(entry.revision)))return fail('INVALID_FILE_SNAPSHOT','The backend must provide a bounded revisioned document and receipts.');
        const history=documentHistoryHeader(value.history);if(!history.ok)return history;
        return {ok:true,data:freeze(value)};
    }
    async function read(targetId){
        const loaded=await load(targetId);if(!loaded.ok)return loaded;
        const snapshot=freeze({targetId,revision:loaded.data.revision,format:loaded.data.format,content:loaded.data.content});
        const fileRef=freeze({kind:'file-reference',backend:'host-store',scope:freeze(structuredClone(scope)),targetId,revision:snapshot.revision});
        refs.set(fileRef,{snapshot,historyEpoch:documentHistoryHeader(loaded.data.history).data.epoch});
        return {ok:true,data:freeze({snapshot,fileRef})};
    }
    async function prepare(fileRef,settings,options){
        const available=current();if(!available.ok)return available;
        const captured=refs.get(fileRef);if(!captured)return fail('FILE_REFERENCE_UNAUTHORIZED','Use the live reference captured by this authorized Read File.');
        const controls=own(options);if(!plain(controls)||!id(controls.intentId)||!Array.isArray(controls.evidence)||controls.evidence.length>128)return fail('INVALID_FILE_INTENT','Provide a stable intent identity and bounded source evidence.');
        const mutation=own(settings),projected=prepareDocumentMutation(captured.snapshot,mutation);if(!projected.ok)return projected;
        const plan=freeze(projected.data),evidence=freeze(controls.evidence);
        let fingerprint;
        try{
            // Fingerprint the authored action. Later entries and checkpointing
            // change the current projection without changing an already saved action.
            const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical({scope,operation:plan.operation,targetId:plan.targetId,mutation,evidence})));
            fingerprint='sha256:'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
        }catch{return fail('FILE_FINGERPRINT_FAILED','The prepared intent fingerprint could not be created.');}
        const stillCurrent=current();if(!stillCurrent.ok)return stillCurrent;
        const previous=intents.get(controls.intentId);
        if(previous)return previous.fingerprint===fingerprint?{ok:true,data:previous.prepared}:fail('FILE_INTENT_CONFLICT','The stable intent identity already refers to different proposed content.');
        const handle=Object.freeze({intentId:controls.intentId});
        const prepared=freeze({handle,plan,status:'staged'}),entry={handle,prepared,plan,evidence,fingerprint,intentId:controls.intentId,snapshot:captured.snapshot,historyEpoch:captured.historyEpoch,receipt:null};
        handles.set(handle,entry);intents.set(entry.intentId,entry);
        return {ok:true,data:prepared};
    }
    async function preflight(handle){
        const available=current();if(!available.ok)return available;
        const entry=handles.get(handle);if(!entry)return fail('FILE_INTENT_UNAUTHORIZED','Only this captured store can settle its prepared intents.');
        if(uncertain.has(entry.plan.targetId))return fail('PERSISTENCE_UNKNOWN','A prior save for this target is unconfirmed; reconcile persistence before any write.');
        const first=await load(entry.plan.targetId);if(!first.ok)return first;
        const history=documentHistoryHeader(first.data.history);if(!history.ok)return history;
        if(history.data.epoch!==entry.historyEpoch)return fail('DOCUMENT_HISTORY_CHANGED','The document history changed after capture; read and review a fresh projection.');
        if(entry.receipt)return {ok:true,data:entry.receipt};
        let receipt=first.data.receipts.find(item=>item.intentId===entry.intentId);
        if(!receipt&&history.data.head!==null){
            if(typeof config.lookupHistory!=='function')return fail('HISTORY_LOOKUP_REQUIRED','This document requires its native archived identity lookup.');
            let archived;try{archived=result(await config.lookupHistory(entry.plan.targetId,{intentId:entry.intentId}));}catch{return fail('INVALID_DOCUMENT_HISTORY','Archived receipt lookup failed.');}
            if(!current().ok)return current();if(!archived.ok)return archived;
            if(archived.data.epoch!==history.data.epoch)return fail('DOCUMENT_HISTORY_CHANGED','Document history changed during receipt lookup.');
            receipt=archived.data.receipt;
        }
        if(receipt){
            if(receipt.fingerprint!==entry.fingerprint)return fail('FILE_INTENT_CONFLICT','This persisted intent identity refers to different content.');
            return {ok:true,data:freeze({intentId:entry.intentId,targetId:entry.plan.targetId,status:'confirmed',applied:false,acknowledged:true,revision:receipt.revision})};
        }
        if(first.data.revision!==entry.plan.expectedRevision||first.data.content!==entry.snapshot.content||first.data.format!==entry.snapshot.format)return fail('FILE_REVISION_CONFLICT','The target changed. Recompute its projection and dependent story output before acceptance.');
        let validated;try{validated=result(await config.validateEvidence(entry.evidence));}catch{return fail('FILE_EVIDENCE_FAILED','The proposed file evidence could not be validated.');}
        if(!validated.ok)return validated;
        if(validated.data!==undefined)return fail('INVALID_FILE_BACKEND_RESULT','Evidence validation must return Result<void>.');
        const latest=await load(entry.plan.targetId);if(!latest.ok)return latest;
        if(latest.data.revision!==first.data.revision||latest.data.content!==first.data.content||latest.data.format!==first.data.format)return fail('FILE_REVISION_CONFLICT','The target changed during evidence validation.');
        return {ok:true,data:freeze({intentId:entry.intentId,targetId:entry.plan.targetId,status:'ready',applied:false,acknowledged:false,revision:entry.plan.expectedRevision})};
    }
    async function settle(handle,flags){
        const controls=own(flags);
        if(!plain(controls)||controls.root!==true||controls.accepted!==true||controls.preview===true||controls.dryRun===true)return fail('FILE_ACCEPTANCE_REQUIRED','Canonical file persistence requires accepted root settlement.');
        const ready=await preflight(handle);if(!ready.ok)return ready;
        if(['confirmed','unchanged'].includes(ready.data.status))return {ok:true,data:freeze({...ready.data,applied:false})};
        const entry=handles.get(handle),available=current();if(!available.ok)return available;
        if(!entry.plan.receipt.changed){
            entry.receipt=freeze({intentId:entry.intentId,targetId:entry.plan.targetId,status:'unchanged',applied:false,acknowledged:false,revision:entry.plan.expectedRevision});
            return {ok:true,data:entry.receipt};
        }
        let saved;
        try{saved=result(await config.compareAndSwap(freeze({targetId:entry.plan.targetId,expectedRevision:entry.plan.expectedRevision,expectedContent:entry.snapshot.content,projectedDocument:entry.plan.projectedDocument,intentId:entry.intentId,fingerprint:entry.fingerprint}),{signal:config.signal}));}
        catch{uncertain.set(entry.plan.targetId,entry);return {ok:true,data:freeze({intentId:entry.intentId,targetId:entry.plan.targetId,status:'unknown',applied:null,acknowledged:false})};}
        if(!saved.ok){if(saved.error.code==='INVALID_FILE_BACKEND_RESULT')uncertain.set(entry.plan.targetId,entry);return saved;}
        if(!plain(saved.data)||saved.data.applied!==true||typeof saved.data.acknowledged!=='boolean'||!revision(saved.data.revision)){
            uncertain.set(entry.plan.targetId,entry);return fail('INVALID_FILE_BACKEND_RESULT','CAS must explicitly report application, revision and durable acknowledgement.');
        }
        const receipt=freeze({intentId:entry.intentId,targetId:entry.plan.targetId,status:saved.data.acknowledged?'confirmed':'save-unverified',applied:true,acknowledged:saved.data.acknowledged,revision:saved.data.revision});
        if(saved.data.acknowledged)entry.receipt=receipt;else uncertain.set(entry.plan.targetId,entry);
        return {ok:true,data:receipt};
    }
    function commit(handle,flags={}){
        const captured=own(flags);
        if(!plain(captured)||Object.keys(captured).some(key=>!['root','accepted','preview','dryRun'].includes(key)||typeof captured[key]!=='boolean'))return Promise.resolve(fail('INVALID_FILE_CONTROLS','File lifecycle controls require known own boolean fields.'));
        freeze(captured);
        const pending=queue.then(()=>settle(handle,captured));queue=pending.catch(()=>{});return pending;
    }
    return Object.freeze({read,prepare,preflight,commit,release(){released=true;}});
}
function dataContainer(value,limit=256){
    try{return plain(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Reflect.ownKeys(value).length<=limit&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.getOwnPropertyDescriptor(value,key)?.enumerable&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));}catch{return false;}
}
function field(value,key){const property=Object.getOwnPropertyDescriptor(value,key);return property&&Object.hasOwn(property,'value')?property.value:undefined;}
/** Native chat metadata is a logical-document backend, never arbitrary disk access. */
export function createChatDocumentBackend(config){
    config=trustedConfig(config,['scope','getContext','saveMetadata','initialDocuments']);
    const scope=own(config.scope),initial=own(config.initialDocuments??[]),templates=new Map();
    let capturedChat,queue=Promise.resolve();const checkpoints=new WeakMap();
    const valid=validScope(scope)&&typeof config.getContext==='function'&&typeof config.saveMetadata==='function'&&Array.isArray(initial)&&initial.length<=128&&initial.every(doc=>plain(doc)&&id(doc.targetId)&&['json','jsonl','csv','text','markdown'].includes(doc.format)&&typeof doc.content==='string');
    if(valid){for(const doc of initial)templates.set(doc.targetId,freeze({targetId:doc.targetId,revision:0,format:doc.format,content:doc.content,receipts:[],scope:structuredClone(scope)}));try{capturedChat=config.getContext().chat;}catch{/* validation returns the scope error */}}
    function view(){
        if(!valid)return fail('INVALID_FILE_BACKEND_CONFIG','A logical-document backend needs a trusted user/chat scope and explicit creation templates.');
        let context;try{context=config.getContext();}catch{return fail('STALE_FILE_SCOPE','The native chat scope is unavailable.');}
        if(!context||context.chat!==capturedChat||context.chatId!==scope.chatId||context.userId!==scope.userId)return fail('STALE_FILE_SCOPE','The active user or chat changed before storage access.');
        const metadata=context.chatMetadata;
        if(!dataContainer(metadata))return fail('INVALID_FILE_METADATA','Native chat metadata requires own data fields.');
        const namespace=Object.hasOwn(metadata,'latticeDocuments')?field(metadata,'latticeDocuments'):{};
        if(!dataContainer(namespace))return fail('INVALID_FILE_METADATA','The logical-document namespace is malformed.');
        const user=Object.hasOwn(namespace,scope.userId)?field(namespace,scope.userId):{};
        if(!dataContainer(user))return fail('INVALID_FILE_METADATA','The selected user document namespace is malformed.');
        return {ok:true,data:{context,metadata,namespace,user}};
    }
    function packet(current,targetId){
        if(!id(targetId))return fail('FILE_TARGET_UNAUTHORIZED','A logical target identity is required.');
        const stored=Object.hasOwn(current.user,targetId)?own(field(current.user,targetId)):templates.get(targetId);
        if(!stored)return fail('FILE_NOT_FOUND','Select an existing logical document or an explicit creation template.');
        if(!plain(stored)||stored.targetId!==targetId||canonical(stored.scope)!==canonical(scope)||!Number.isSafeInteger(stored.revision)||stored.revision<0||typeof stored.content!=='string'||!Array.isArray(stored.receipts)||stored.receipts.length>256||stored.receipts.some(item=>!plain(item)||!id(item.intentId)||!/^sha256:[a-f0-9]{64}$/.test(item.fingerprint)||!revision(item.revision))||!['json','jsonl','csv','text','markdown'].includes(stored.format))return fail('INVALID_FILE_METADATA','The stored document must match its captured target and scope.');
        const header=documentHistoryHeader(stored.history);if(!header.ok)return header;
        if(header.data.epoch>0){
            const archive=archives(current);if(!archive.ok)return archive;
            const inspected=inspectDocumentHistory({targetId,scope,history:stored.history,pages:archive.data.pages});if(!inspected.ok)return inspected;
            if(inspected.data.pages.some(page=>page.kind==='progression')){
                let state;try{if(stored.format==='json')state=JSON.parse(stored.content);}catch{}
                const marker=state?.historyCheckpoint;
                if(!plain(state)||!Array.isArray(state.values)||!Array.isArray(state.ledger)||!plain(marker)||Object.keys(marker).length!==2||marker.targetId!==targetId||marker.epoch!==header.data.epoch)return fail('DOCUMENT_HISTORY_CHANGED','Checkpointed progression must retain its matching native history marker.');
            }
        }
        return {ok:true,data:stored};
    }
    async function load(targetId){
        const current=view();if(!current.ok)return current;
        const found=packet(current.data,targetId);if(!found.ok)return found;
        const {scope:storedScope,...snapshot}=found.data;
        return {ok:true,data:own(snapshot)};
    }
    function archives(current){
        const namespace=Object.hasOwn(current.metadata,'latticeDocumentHistory')?field(current.metadata,'latticeDocumentHistory'):{};
        if(!dataContainer(namespace))return fail('INVALID_DOCUMENT_HISTORY','The native archive namespace is malformed.');
        const pages=Object.hasOwn(namespace,scope.userId)?field(namespace,scope.userId):{};
        if(!dataContainer(pages,4096))return fail('INVALID_DOCUMENT_HISTORY','The native archive namespace is malformed.');
        return {ok:true,data:{namespace,pages}};
    }
    async function checkedHistory(current,found,targetId){
        const archive=archives(current);if(!archive.ok)return archive;
        const inspected=await validateDocumentHistory({targetId,scope,history:found.history,pages:archive.data.pages});if(!inspected.ok)return inspected;
        const after=view();if(!after.ok)return after;const latest=packet(after.data,targetId),liveArchive=archives(after.data);
        if(after.data.metadata!==current.metadata||!latest.ok||canonical(latest.data)!==canonical(found)||!liveArchive.ok)return fail('DOCUMENT_HISTORY_CHANGED','Document history changed during archive validation.');
        const live=inspectDocumentHistory({targetId,scope,history:latest.data.history,pages:liveArchive.data.pages});if(!live.ok)return live;
        return canonical(live.data.pages)===canonical(inspected.data.pages)?inspected:fail('DOCUMENT_HISTORY_CHANGED','Archive records changed during validation.');
    }
    async function lookupHistory(targetId,query){
        const capturedQuery=own(query);if(!capturedQuery)return fail('INVALID_HISTORY_QUERY','Use bounded history identities.');
        const current=view();if(!current.ok)return current;const found=packet(current.data,targetId);if(!found.ok)return found;
        const inspected=await checkedHistory(current.data,found.data,targetId);if(!inspected.ok)return inspected;
        return lookupDocumentHistory({targetId,scope,history:inspected.data.header,pages:Object.fromEntries(inspected.data.pages.map(page=>[page.pageId,page]))},capturedQuery);
    }
    async function inspectHistory(targetId){
        const current=view();if(!current.ok)return current;const found=packet(current.data,targetId);if(!found.ok)return found;
        const inspected=await checkedHistory(current.data,found.data,targetId);if(!inspected.ok)return inspected;
        return {ok:true,data:freeze({epoch:inspected.data.header.epoch,visibility:inspected.data.visibility,privateActorIds:inspected.data.privateActorIds,pages:inspected.data.pages.map(({pageId,checkpointId,epoch,kind,payload})=>({pageId,checkpointId,epoch,kind,count:payload.length}))})};
    }
    async function previewCheckpoint(targetId,visibility){
        const current=view();if(!current.ok)return current;const found=packet(current.data,targetId);if(!found.ok)return found;const archive=archives(current.data);if(!archive.ok)return archive;
        const old=await checkedHistory(current.data,found.data,targetId);if(!old.ok)return old;
        const projection=await prepareDocumentCheckpoint(found.data,{scope,visibility,checkpointId:'checkpoint:'+crypto.randomUUID()});if(!projection.ok)return projection;
        const produced=await validateDocumentHistory({targetId,scope,history:projection.data.history,pages:{...archive.data.pages,...projection.data.pages}});if(!produced.ok&&Object.values(projection.data.counts).some(count=>count>0))return produced;
        const combinedVisibility=artifactVisibility({visibility,archive:{visibility:old.data.visibility},projection:{visibility:projection.data.visibility}});
        const after=view();if(!after.ok)return after;const latest=packet(after.data,targetId),latestArchive=archives(after.data);if(!latest.ok||after.data.metadata!==current.data.metadata||canonical(latest.data)!==canonical(found.data)||!latestArchive.ok)return fail('FILE_REVISION_CONFLICT','The document changed while preparing its checkpoint.');
        const latestHistory=inspectDocumentHistory({targetId,scope,history:found.data.history,pages:latestArchive.data.pages});if(!latestHistory.ok||canonical(latestHistory.data.pages)!==canonical(old.data.pages))return fail('DOCUMENT_HISTORY_CHANGED','The archive changed while preparing its checkpoint.');
        const handle=Object.freeze({}),entry={metadata:current.data.metadata,expected:canonical(found.data),targetId,projection:projection.data,oldHead:canonical(old.data.pages)};
        checkpoints.set(handle,entry);
        return {ok:true,data:{handle,view:freeze({targetId,expectedRevision:found.data.revision,epoch:projection.data.history.epoch,kind:projection.data.kind,visibility:combinedVisibility,privateActorIds:[...new Set([...old.data.privateActorIds,...projection.data.privateActorIds])],counts:projection.data.counts,retained:projection.data.retained,canApply:Object.values(projection.data.counts).some(count=>count>0)})}};
    }
    async function checkpoint(handle){
        const entry=checkpoints.get(handle);if(!entry)return fail('CHECKPOINT_UNAUTHORIZED','Preview this target before applying a checkpoint.');
        const current=view();if(!current.ok)return current;const found=packet(current.data,entry.targetId);if(!found.ok)return found;
        if(current.data.metadata!==entry.metadata||canonical(found.data)!==entry.expected)return fail('FILE_REVISION_CONFLICT','The document changed after the checkpoint preview.');
        const archive=archives(current.data);if(!archive.ok)return archive;const old=inspectDocumentHistory({targetId:entry.targetId,scope,history:found.data.history,pages:archive.data.pages});if(!old.ok)return old;
        if(canonical(old.data.pages)!==entry.oldHead)return fail('DOCUMENT_HISTORY_CHANGED','The archive changed after the checkpoint preview.');
        if(!Object.values(entry.projection.counts).some(count=>count>0))return fail('CHECKPOINT_EMPTY','No active history needs a checkpoint.');
        if(found.data.revision===Number.MAX_SAFE_INTEGER)return fail('FILE_RECEIPT_LIMIT','Document revision capacity is exhausted.');
        const next=own({...found.data,revision:found.data.revision+1,content:entry.projection.content,receipts:[],history:entry.projection.history});if(!next)return fail('FILE_DOCUMENT_LIMIT','The checkpointed document exceeds its admission limits.');
        const complete=inspectDocumentHistory({targetId:entry.targetId,scope,history:next.history,pages:{...archive.data.pages,...entry.projection.pages}});if(!complete.ok)return complete;
        const pageIds=complete.data.pages.map(page=>page.pageId),expectedDocument=canonical(next),expectedPages=Object.fromEntries(complete.data.pages.map(page=>[page.pageId,canonical(page)])),checkpointSignature=canonical({document:next,pages:complete.data.pages});
        old.data.pages.forEach(page=>freeze(field(archive.data.pages,page.pageId)));
        Object.values(entry.projection.pages).forEach(freeze);
        const pages={...archive.data.pages,...entry.projection.pages};
        if(Object.keys(pages).length>4096||new TextEncoder().encode(JSON.stringify(pages)).byteLength>30000000)return fail('DOCUMENT_HISTORY_LIMIT','The native archive reached its bounded storage capacity.');
        if(['latticeDocuments','latticeDocumentHistory'].some(key=>{const property=Object.getOwnPropertyDescriptor(current.data.metadata,key);return property?property.writable!==true:!Object.isExtensible(current.data.metadata);}))return fail('INVALID_FILE_METADATA','Checkpoint metadata must permit both atomic namespace replacements.');
        // Archive installation and active replacement share the same synchronous CAS point.
        current.data.metadata.latticeDocumentHistory={...archive.data.namespace,[scope.userId]:pages};
        current.data.metadata.latticeDocuments={...current.data.namespace,[scope.userId]:{...current.data.user,[entry.targetId]:next}};
        checkpoints.delete(handle);let acknowledged=false;
        try{const saved=await config.saveMetadata({kind:'document-checkpoint',targetId:entry.targetId,pageIds});acknowledged=saved===true||plain(saved)&&Object.getOwnPropertyDescriptor(saved,'ok')?.value===true;}catch{}
        const after=view();
        if(!after.ok||after.data.metadata!==entry.metadata)acknowledged=false;
        else {const installed=packet(after.data,entry.targetId),savedArchives=archives(after.data);if(!installed.ok||canonical(installed.data)!==expectedDocument||!savedArchives.ok||Object.entries(expectedPages).some(([pageId,expected])=>canonical(field(savedArchives.data.pages,pageId))!==expected))acknowledged=false;}
        return {ok:true,data:{applied:true,acknowledged,revision:found.data.revision+1,epoch:entry.projection.history.epoch,pageIds,checkpointSignature}};
    }
    function applyCheckpoint(handle){const pending=queue.then(()=>checkpoint(handle));queue=pending.catch(()=>{});return pending;}
    async function settle(update,controls){
        const owned=captureCasUpdate(update);if(!plain(owned)||!id(owned.targetId)||!id(owned.intentId)||typeof owned.fingerprint!=='string'||!/^sha256:[a-f0-9]{64}$/.test(owned.fingerprint)||!plain(owned.projectedDocument)||typeof owned.projectedDocument.content!=='string'||!['json','jsonl','csv','text','markdown'].includes(owned.projectedDocument.format))return fail('INVALID_FILE_BACKEND_UPDATE','CAS requires a checked prepared document and bounded receipt.');
        if(controls?.signal?.aborted)return fail('CANCELLED','Logical-document settlement was cancelled.');
        const current=view();if(!current.ok)return current;
        const found=packet(current.data,owned.targetId);if(!found.ok)return found;
        const stored=found.data;
        if(stored.revision!==owned.expectedRevision||stored.content!==owned.expectedContent)return fail('FILE_REVISION_CONFLICT','The logical document changed before its atomic local replacement.');
        if(stored.format==='json'){
            let previous;try{previous=JSON.parse(stored.content);}catch{}
            if(plain(previous)&&Object.hasOwn(previous,'historyCheckpoint')){
                let next;try{if(owned.projectedDocument.format==='json')next=JSON.parse(owned.projectedDocument.content);}catch{}
                const marker=previous.historyCheckpoint,header=documentHistoryHeader(stored.history);
                if(!plain(marker)||Object.keys(marker).length!==2||marker.targetId!==stored.targetId||!header.ok||marker.epoch!==header.data.epoch||!plain(next)||canonical(next.historyCheckpoint)!==canonical(marker))return fail('DOCUMENT_HISTORY_CHANGED','Preserve this document’s checked history marker when updating its active state.');
            }
        }
        if(stored.revision===Number.MAX_SAFE_INTEGER||stored.receipts.length>=256)return fail('FILE_RECEIPT_LIMIT','Document revision/receipt capacity needs explicit reconciliation.');
        const nextRevision=stored.revision+1;
        const next=own({...stored,revision:nextRevision,format:owned.projectedDocument.format,content:owned.projectedDocument.content,receipts:[...stored.receipts,{intentId:owned.intentId,fingerprint:owned.fingerprint,revision:nextRevision}]});
        if(!next)return fail('FILE_DOCUMENT_LIMIT','The resulting document and receipts exceed storage admission limits.');
        // No await separates scope/CAS checks from the fresh namespace replacement.
        current.data.metadata.latticeDocuments={...current.data.namespace,[scope.userId]:{...current.data.user,[owned.targetId]:next}};
        let acknowledged=false;
        try{const saved=await config.saveMetadata();acknowledged=saved===true||plain(saved)&&Object.getOwnPropertyDescriptor(saved,'ok')?.value===true;}catch{/* local application is known; durable save remains unverified */}
        return {ok:true,data:{applied:true,acknowledged,revision:nextRevision}};
    }
    function compareAndSwap(update,controls={}){
        const owned=captureCasUpdate(update);if(!owned)return Promise.resolve(fail('INVALID_FILE_BACKEND_UPDATE','The prepared document must be own plain data.'));
        const capturedSignal=controls.signal;
        const pending=queue.then(()=>settle(owned,{signal:capturedSignal}));queue=pending.catch(()=>{});return pending;
    }
    return Object.freeze({load,compareAndSwap,lookupHistory,inspectHistory,previewCheckpoint,applyCheckpoint});
}
