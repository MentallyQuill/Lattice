import {cloneJsonValue} from './operations/json-data.js?v=0.27.3';
import {artifactVisibility,validVisibilityMetadata} from './artifact-privacy.js?v=0.27.3';
import {validateStoryClock} from './story-time.js?v=0.27.3';
import {applyProgressionEvents} from './progression.js?v=0.27.3';
import {validateRandomOutcome} from './operations/random-outcomes.js?v=0.27.3';
const fail=(code,message)=>({ok:false,error:{code,message}});
const good=data=>({ok:true,data});
const id=value=>typeof value==='string'&&value.trim().length>0&&value.length<=256;
const clockEventId=value=>typeof value==='string'&&value.length>0&&value.length<=4096;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>{const property=value&&Object.getOwnPropertyDescriptor(value,key);if(property&&(!property.enumerable||!Object.hasOwn(property,'value')))throw Error('Own data required');return property?.value;};
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':plain(value)?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const same=(left,right)=>canonical(left)===canonical(right);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const validReceipt=value=>plain(value)&&id(value.intentId)&&typeof value.fingerprint==='string'&&/^sha256:[a-f0-9]{64}$/.test(value.fingerprint)&&(Number.isSafeInteger(value.revision)&&value.revision>=0||id(value.revision));
const validTurn=value=>plain(value)&&id(value.turnId)&&id(value.projectionKey)&&validateStoryClock(value.previousClock).ok&&value.previousClock.schemaVersion===1&&Number.isSafeInteger(value.previousClock.revision)&&value.previousClock.revision>=1;
const validProgression=value=>plain(value)&&id(value.eventId)&&typeof value.identityKey==='string'&&value.identityKey.length<=4096&&typeof value.eventIdentity==='string'&&value.eventIdentity.length<=4096;
const validOutcome=value=>plain(value)&&value.schemaVersion===1&&value.recordType==='random-outcome'&&id(value.outcomeId)&&plain(value.event)&&id(value.event.eventId)&&plain(value.library)&&id(value.library.libraryId)&&value.acceptance==='accepted'&&value.status==='resolved'&&plain(value.draw)&&plain(value.selection)&&plain(value.effect);
// These inputs have already passed bounded own-JSON admission. Keep each actor
// requirement even when conservative disclosure combines several marks as hidden.
function privateActors(material){
    const actors=new Set();
    const visit=value=>{if(!value||typeof value!=='object')return;const mark=value.visibility,actor=plain(mark)&&mark.kind==='actor-private'?mark.actorId:mark==='actor-private'?value.actorId??value.scope?.actorId??value.subjectId:['actor-state','reflection','state-proposal','episodes','commit-intent'].includes(value.recordType)?value.scope?.actorId:null;if(id(actor))actors.add(actor);Object.values(value).forEach(visit);};
    visit(material);return [...actors];
}

export function documentHistoryHeader(raw){
    if(raw===undefined)return good({schemaVersion:1,epoch:0,head:null});
    const checked=cloneJsonValue(raw);if(!checked.ok)return fail('INVALID_DOCUMENT_HISTORY','History requires bounded own data.');
    const value=checked.data.value;
    return plain(value)&&Object.keys(value).length===3&&value.schemaVersion===1&&Number.isSafeInteger(value.epoch)&&value.epoch>=0&&(value.epoch===0?value.head===null:id(value.head))?good(value):fail('INVALID_DOCUMENT_HISTORY','History requires a valid epoch and archive head.');
}

/** Native archive pages are checked individually; never assemble the entire history into a portable DTO. */
export function inspectDocumentHistory(request){
    try{
        const targetId=own(request,'targetId'),scope=own(request,'scope'),pages=own(request,'pages'),header=documentHistoryHeader(own(request,'history'));if(!header.ok)return header;
        const checkedScope=cloneJsonValue(scope);if(!id(targetId)||!checkedScope.ok||!plain(checkedScope.data.value)||!id(scope.userId)||!id(scope.chatId)||!plain(pages))return fail('INVALID_DOCUMENT_HISTORY','Use a captured target, scope and archive namespace.');
        const result=[],seen=new Set();let next=header.data.head,previousPage=null;
        while(next!==null){
            if(seen.has(next)||seen.size>=4096)return fail('DOCUMENT_HISTORY_LIMIT','The archive chain is cyclic or exceeds its checked traversal limit.');
            seen.add(next);const raw=own(pages,next),checked=cloneJsonValue(raw);
            if(!checked.ok)return fail('DOCUMENT_HISTORY_MISSING','A required archive page is missing or invalid.');
            const page=checked.data.value;
            if(!plain(page)||Object.keys(page).some(key=>!['schemaVersion','pageId','targetId','scope','visibility','epoch','checkpointId','previous','kind','payload'].includes(key))||page.schemaVersion!==1||page.pageId!==next||page.targetId!==targetId||!same(page.scope,checkedScope.data.value)||!Number.isSafeInteger(page.epoch)||page.epoch<1||page.epoch>header.data.epoch||!id(page.checkpointId)||(page.previous!==null&&!id(page.previous))||!['receipts','clock-turns','clock-events','outcomes','progression'].includes(page.kind)||!Array.isArray(page.payload)||!validVisibilityMetadata({visibility:page.visibility}))return fail('INVALID_DOCUMENT_HISTORY','An archive page does not match its captured target, scope or history.');
            if(!previousPage&&page.epoch!==header.data.epoch||previousPage&&(page.epoch>previousPage.epoch||page.epoch<previousPage.epoch-1||page.epoch===previousPage.epoch&&page.checkpointId!==previousPage.checkpointId)||page.previous===null&&page.epoch!==1)return fail('INVALID_DOCUMENT_HISTORY','The archive chain omits or rewinds a checkpoint epoch.');
            const validate={receipts:validReceipt,'clock-turns':validTurn,'clock-events':clockEventId,outcomes:validOutcome,progression:validProgression}[page.kind];
            if(page.payload.length>128||page.payload.some(item=>!validate(item)))return fail('INVALID_DOCUMENT_HISTORY','An archive page contains malformed retired records.');
            if(page.kind==='clock-turns'&&page.payload.some(turn=>turn.previousClock.clockId!==targetId))return fail('INVALID_DOCUMENT_HISTORY','Archived clocks must retain their original target.');
            result.push(page);previousPage=page;next=page.previous;
        }
        return good({header:header.data,pages:result,privateActorIds:[...new Set(result.flatMap(privateActors))],visibility:artifactVisibility(result.map(page=>({visibility:artifactVisibility(page)})))});
    }catch{return fail('INVALID_DOCUMENT_HISTORY','Archive access requires checked own data.');}
}

/** Native admission checks every retired draw with its canonical async validator. */
export async function validateDocumentHistory(request){
    const inspected=inspectDocumentHistory(request);if(!inspected.ok)return inspected;
    for(const page of inspected.data.pages)if(page.kind==='outcomes')for(const outcome of page.payload){
        const checked=await validateRandomOutcome(outcome);if(!checked.ok||checked.data.outcome.acceptance!=='accepted')return fail('INVALID_DOCUMENT_HISTORY','An archived outcome does not retain a valid accepted draw.');
    }
    return inspected;
}

export function lookupDocumentHistory(request,rawQuery){
    const query=cloneJsonValue(rawQuery);if(!query.ok||!plain(query.data.value))return fail('INVALID_HISTORY_QUERY','Use bounded history identities.');
    const inspected=inspectDocumentHistory(request);if(!inspected.ok)return inspected;
    const q=query.data.value,result={epoch:inspected.data.header.epoch,visibility:inspected.data.visibility,privateActorIds:inspected.data.privateActorIds};
    for(const page of inspected.data.pages){
        if(page.kind==='receipts'&&q.intentId){
            for(const receipt of page.payload){
                if(!validReceipt(receipt))return fail('INVALID_DOCUMENT_HISTORY','Archived save receipts are malformed.');
                if(receipt.intentId===q.intentId){if(result.receipt&&!same(result.receipt,receipt))return fail('FILE_INTENT_CONFLICT','Archived intent identities conflict.');result.receipt=receipt;}
            }
        }
        if(page.kind==='clock-turns'&&q.turnId){
            for(const turn of page.payload){
                if(!plain(turn)||!id(turn.turnId)||!id(turn.projectionKey)||!validateStoryClock(turn.previousClock).ok)return fail('INVALID_DOCUMENT_HISTORY','Archived clock turns are malformed.');
                if(turn.turnId===q.turnId){if(result.clockTurn&&!same(result.clockTurn,turn))return fail('CLOCK_REPLAY_CONFLICT','Archived clock turn identities conflict.');result.clockTurn=turn;}
            }
        }
        if(page.kind==='progression'&&q.progression){
            const requested=q.progression,retired=result.progression??={knownIdentityKeys:[],eventIdentities:[]};
            if(!Array.isArray(requested.identityKeys)||!Array.isArray(requested.eventIds))return fail('INVALID_HISTORY_QUERY','Progression lookup requires authored identity keys and event IDs.');
            for(const item of page.payload){
                if(!plain(item)||!id(item.eventId)||typeof item.identityKey!=='string'||item.identityKey.length>4096||typeof item.eventIdentity!=='string'||item.eventIdentity.length>4096)return fail('INVALID_DOCUMENT_HISTORY','Archived progression identities are malformed.');
                if(requested.identityKeys.includes(item.identityKey)&&!retired.knownIdentityKeys.includes(item.identityKey))retired.knownIdentityKeys.push(item.identityKey);
                if(requested.eventIds.includes(item.eventId)){const previous=retired.eventIdentities.find(entry=>entry.eventId===item.eventId);if(previous&&previous.eventIdentity!==item.eventIdentity)return fail('EVENT_ID_CONFLICT','Archived occurrence IDs refer to incompatible facts.');if(!previous)retired.eventIdentities.push({eventId:item.eventId,eventIdentity:item.eventIdentity});}
            }
        }
        if(page.kind==='outcomes'&&q.outcomes){
            const requested=q.outcomes;
            if(!plain(requested)||!Array.isArray(requested.eventIds)||requested.eventIds.length>256||!requested.eventIds.every(id)||!id(requested.libraryId)||(requested.rerollId!==null&&!id(requested.rerollId)))return fail('INVALID_HISTORY_QUERY','Outcome lookup requires occurrence, library and reroll identities.');
            const outcomes=result.outcomes??=[];
            for(const item of page.payload){
                if(!plain(item)||!id(item.outcomeId)||!plain(item.event)||!id(item.event.eventId)||!plain(item.library)||!id(item.library.libraryId)||item.acceptance!=='accepted')return fail('INVALID_DOCUMENT_HISTORY','Archived accepted outcomes are malformed.');
                if(requested.eventIds.includes(item.event.eventId)&&item.library.libraryId===requested.libraryId&&(item.rerollId??null)===requested.rerollId){
                    const previous=outcomes.find(entry=>entry.event.eventId===item.event.eventId);
                    if(previous&&!same(previous,item))return fail('OUTCOME_CONFLICT','Archived draws for one occurrence conflict.');
                    if(!previous)outcomes.push(item);
                }
            }
        }
    }
    if(q.progression&&!result.progression)result.progression={knownIdentityKeys:[],eventIdentities:[]};
    if(q.outcomes&&!result.outcomes)result.outcomes=[];
    const bounded=cloneJsonValue(result);return bounded.ok?good(freeze(bounded.data.value)):fail('DOCUMENT_HISTORY_LIMIT','The requested retired identities exceed portable bounds.');
}

/** Pure projection: only the native backend may install these immutable pages. */
export async function prepareDocumentCheckpoint(rawSnapshot,rawOptions){
    const checked=cloneJsonValue(rawSnapshot),options=cloneJsonValue(rawOptions);
    if(!checked.ok||!options.ok)return fail('INVALID_DOCUMENT_CHECKPOINT','Checkpoint inputs must be bounded own data.');
    const snapshot=checked.data.value,o=options.data.value,header=documentHistoryHeader(snapshot?.history);
    if(!header.ok)return header;
    if(!plain(snapshot)||!id(snapshot.targetId)||typeof snapshot.content!=='string'||!Array.isArray(snapshot.receipts)||snapshot.receipts.length>256||snapshot.receipts.some(item=>!validReceipt(item))||!plain(o)||!id(o.checkpointId)||!plain(o.scope)||!id(o.scope.userId)||!id(o.scope.chatId)||!validVisibilityMetadata({visibility:o.visibility})||header.data.epoch===Number.MAX_SAFE_INTEGER)return fail('INVALID_DOCUMENT_CHECKPOINT','Checkpoint requires a captured document and checked scope.');
    const groups=[{kind:'receipts',records:snapshot.receipts}],counts={receipts:snapshot.receipts.length,clockTurns:0,clockEvents:0,outcomes:0,progression:0};
    let content=snapshot.content,kind='document',retainedClockEvents=0;
    if(snapshot.format==='json'){
        let value;try{value=JSON.parse(content);}catch{return fail('INVALID_DOCUMENT_CHECKPOINT','Canonical JSON cannot be checkpointed until its data is valid.');}
        if(plain(value)&&Object.hasOwn(value,'clockId')){
            const clock=validateStoryClock(value);if(!clock.ok||value.clockId!==snapshot.targetId||value.schemaVersion!==1||!Number.isSafeInteger(value.revision)||value.revision<1)return fail('INVALID_DOCUMENT_CHECKPOINT','The clock document must retain its complete accepted identity.');
            const turns=value.acceptedTimeAdvances??[];
            if(!Array.isArray(turns)||turns.length>32||turns.some(turn=>!validTurn(turn)||turn.previousClock.clockId!==value.clockId||turn.previousClock.calendarId!==value.calendarId||turn.previousClock.dayLengthMinutes!==value.dayLengthMinutes)||new Set(turns.map(turn=>turn.turnId)).size!==turns.length)return fail('INVALID_DOCUMENT_CHECKPOINT','The clock turn history is invalid.');
            groups.push({kind:'clock-turns',records:turns});counts.clockTurns=turns.length;
            // Unknown consumed IDs remain active; only canonical past IDs are safely retired.
            const consumed=value.settledTimeEventIds??[],past=[],future=[];
            for(const eventId of consumed){let parts;try{if(eventId.startsWith('time:'))parts=JSON.parse(eventId.slice(5));}catch{}if(Array.isArray(parts)&&parts.length===4&&parts[0]===value.clockId&&id(parts[1])&&Number.isSafeInteger(parts[2])&&parts[2]>=1&&Number.isSafeInteger(parts[3])&&parts[3]>=0&&parts[3]<=value.absoluteMinute)past.push(eventId);else future.push(eventId);}
            groups.push({kind:'clock-events',records:past});counts.clockEvents=past.length;retainedClockEvents=future.length;
            value.acceptedTimeAdvances=[];value.settledTimeEventIds=future;content=JSON.stringify(value);kind='clock';
        }else if(plain(value)&&Object.hasOwn(value,'values')&&Object.hasOwn(value,'ledger')){
            if(value.historyCheckpoint!==undefined&&(!plain(value.historyCheckpoint)||Object.keys(value.historyCheckpoint).length!==2||value.historyCheckpoint.targetId!==snapshot.targetId||value.historyCheckpoint.epoch!==header.data.epoch))return fail('INVALID_DOCUMENT_CHECKPOINT','The progression history marker must match the active target and epoch.');
            const state={...value};delete state.historyCheckpoint;
            if(value.decayTimes!==undefined&&(!plain(value.decayTimes)||Object.values(value.decayTimes).some(minute=>!Number.isSafeInteger(minute)||minute<0)))return fail('INVALID_DOCUMENT_CHECKPOINT','Progression decay history requires explicit nonnegative whole story minutes.');
            const valid=applyProgressionEvents(state,[],{ruleSetId:'history-checkpoint',revision:1,rules:[]});if(!valid.ok)return fail('INVALID_DOCUMENT_CHECKPOINT','The progression document must have valid values and identity history.');
            groups.push({kind:'progression',records:value.ledger});counts.progression=value.ledger.length;
            value.ledger=[];value.historyCheckpoint={targetId:snapshot.targetId,epoch:header.data.epoch+1};content=JSON.stringify(value);kind='progression';
        }else if(Array.isArray(value)&&value.length&&value.every(item=>plain(item)&&Object.hasOwn(item,'outcomeId'))){
            for(const outcome of value){const valid=await validateRandomOutcome(outcome);if(!valid.ok||outcome.acceptance!=='accepted')return fail('INVALID_DOCUMENT_CHECKPOINT','Only valid accepted outcomes can be retired.');}
            groups.push({kind:'outcomes',records:value});counts.outcomes=value.length;content='[]';kind='outcomes';
        }
    }
    const pages={};let head=header.data.head;
    for(const group of groups){
        let batch=[];
        const flush=()=>{if(!batch.length)return true;const pageId='archive:'+crypto.randomUUID();const page={schemaVersion:1,pageId,targetId:snapshot.targetId,scope:o.scope,visibility:artifactVisibility({visibility:o.visibility,payload:batch}),epoch:header.data.epoch+1,checkpointId:o.checkpointId,previous:head,kind:group.kind,payload:batch};const admitted=cloneJsonValue(page);if(!admitted.ok)return false;pages[pageId]=admitted.data.value;head=pageId;batch=[];return true;};
        for(const record of group.records){const candidate={schemaVersion:1,pageId:'archive:00000000-0000-0000-0000-000000000000',targetId:snapshot.targetId,scope:o.scope,visibility:o.visibility,epoch:header.data.epoch+1,checkpointId:o.checkpointId,previous:head,kind:group.kind,payload:[...batch,record]};if(batch.length>=128||!cloneJsonValue(candidate).ok){if(!flush())return fail('DOCUMENT_HISTORY_LIMIT','An archive page exceeds its safe data capacity.');}batch.push(record);}
        if(!flush())return fail('DOCUMENT_HISTORY_LIMIT','A history record exceeds the archive page capacity.');
    }
    return good({content,history:{schemaVersion:1,epoch:header.data.epoch+1,head},pages,kind,counts,retained:{clockEvents:retainedClockEvents},checkpointId:o.checkpointId,visibility:artifactVisibility(Object.values(pages)),privateActorIds:[...new Set(Object.values(pages).flatMap(privateActors))]});
}
