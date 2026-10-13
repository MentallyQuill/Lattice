import { artifactVisibility } from './artifact-privacy.js?v=0.27.1';
import { cloneJsonValue } from './operations/json-data.js?v=0.27.1';
import { advanceStoryClock } from './story-time.js?v=0.27.1';
import { validateOccurrences, normalizeOccurrences }  from './operations/event-data.js?v=0.27.1';
import { selectRandomOutcomes, validateRandomOutcome } from './operations/random-outcomes.js?v=0.27.1';
import { validateNativeFileEvidence } from './native-settlement.js?v=0.27.1';
import { freeze, plain } from './record-data.js?v=0.27.1';
const good=data=>({ok:true,...(data===undefined?{}:{data})}),fail=(code,message)=>({ok:false,error:{code,message}});
const permits=(source,destination)=>source.kind==='public'||destination.kind==='hidden'||source.kind==='actor-private'&&destination.kind==='actor-private'&&source.actorId===destination.actorId;
const id=value=>typeof value==='string'&&!!value.trim()&&value.length<=256;
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':plain(value)?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const hash=async value=>'state:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');
const caches=new WeakMap();
function configData(raw,allowed){try {if(!plain(raw))return {};const descriptors=Object.getOwnPropertyDescriptors(raw);if(Reflect.ownKeys(raw).some(key=>typeof key!=='string'||!allowed.includes(key)||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value')))return {};return Object.fromEntries(Object.entries(descriptors).map(([key,value])=>[key,value.value]));}catch{return {};}}
/** The cache is a private capability. No portable artifact can create a retained draw. */
export function createNativeOutcomeCache(raw={}) {
    const config=configData(raw,['random']);
    const handle=Object.freeze({clear(){caches.get(handle).entries.clear();caches.get(handle).scope=null;caches.get(handle).epoch++;}});
    caches.set(handle,{random:config.random??(()=>{const values=new Uint32Array(1);crypto.getRandomValues(values);return values[0]/4294967296;}),entries:new Map(),scope:null,epoch:0});
    return handle;
}
/** A root host session ties pure clock/outcome projections to exact captured catalog references. */
export function createNativeStoryState(raw) {
    const config=configData(raw,['files','scope','isCurrent','turnId','sourceForEvent','playerSource','cache']);
    const checkedScope=cloneJsonValue(config.scope),cache=caches.get(config.cache);
    const valid=checkedScope.ok&&plain(checkedScope.data.value)&&id(checkedScope.data.value.userId)&&id(checkedScope.data.value.chatId)&&id(config.turnId)&&typeof config.isCurrent==='function'&&typeof config.sourceForEvent==='function'&&config.files?.store&&cache;
    const scope=valid?checkedScope.data.value:null,scopeKey=valid?canonical(scope):'';
    if(valid&&cache.scope!==scopeKey){cache.entries.clear();cache.scope=scopeKey;cache.epoch++;}
    const cacheEpoch=cache?.epoch;
    let released=false;
    const captures=new Map(),clockValues=new WeakMap(),projections=new WeakMap(),occurrenceLists=new WeakMap(),knownOutcomes=new Map(),scheduledEvents=new Map(),stagedClocks=new WeakMap();
    function current(){try {const local=()=>valid&&!released&&cache.epoch===cacheEpoch;return local()&&config.isCurrent()===true&&local()?good():fail('STALE_STATE_SCOPE','The accepted state scope changed or was released.');}catch{return fail('STALE_STATE_SCOPE','The accepted state scope could not be verified.');}}
    function source(event){const before=current();if(!before.ok)return before;let result;try {result=config.sourceForEvent(event);}catch{return fail('STATE_EVIDENCE_CHANGED','The captured event source could not be verified.');}const after=current();if(!after.ok)return after;if(result?.ok!==true||typeof result.data?.isCurrent!=='function')return fail('STATE_EVIDENCE_CHANGED','Use a confirmed occurrence from the captured player message or native Draft.');try {if(result.data.isCurrent()!==true)return fail('STATE_EVIDENCE_CHANGED','The captured event evidence changed.');}catch{return fail('STATE_EVIDENCE_CHANGED','The captured event evidence changed.');}return current().ok?result:current();}
    function playerSource(){const available=current();if(!available.ok)return available;const source=cloneJsonValue(config.playerSource);if(!source.ok||!source.data.value)return fail('PLAYER_SOURCE_UNAVAILABLE','A trusted captured player source is required.');return good(freeze(source.data.value));}
    const withoutAdvanceLedger=value=>{const result={...value};delete result.acceptedTimeAdvances;return result;};
    async function readClock(clockId){
        const before=current();if(!before.ok)return before;if(!id(clockId))return fail('INVALID_CLOCK','Select an authorized clock document.');
        const read=await config.files.store.read(clockId);const after=current();if(!after.ok)return after;if(!read.ok)return read;
        if(read.data.snapshot.format!=='json')return fail('INVALID_CLOCK','Story Clock requires an authored JSON clock document.');
        let value;try {value=JSON.parse(read.data.snapshot.content);}catch{return fail('INVALID_CLOCK','The accepted clock document is invalid JSON.');}
        const checked=cloneJsonValue(value);if(!checked.ok)return fail('INVALID_CLOCK','The accepted clock exceeds portable bounds.');value=checked.data.value;
        const clock=advanceStoryClock(value,{kind:'duration',minutes:0});if(!clock.ok||value.schemaVersion!==1||!Number.isSafeInteger(value.revision)||value.revision<1||value.clockId!==clockId)return fail('INVALID_CLOCK','The accepted clock requires matching identity, schema 1 and positive revision.');
        const records=value.acceptedTimeAdvances??[];
        if(!Array.isArray(records)||records.length>32||records.some(record=>!plain(record)||!id(record.turnId)||!id(record.projectionKey)||!plain(record.previousClock))||new Set(records.map(record=>record.turnId)).size!==records.length)return fail('INVALID_CLOCK_LEDGER','The accepted time advance ledger is invalid or exceeds 32 retained turns.');
        const replay=records.find(record=>record.turnId===config.turnId),exposed=replay?replay.previousClock:value;
        const tested=advanceStoryClock(exposed,{kind:'duration',minutes:0});if(!tested.ok||exposed.clockId!==value.clockId||exposed.calendarId!==value.calendarId||!Number.isSafeInteger(exposed.revision)||exposed.revision<1)return fail('INVALID_CLOCK_LEDGER','A retained preturn clock must share the accepted clock identity.');
        const visibility=config.files.visibility(clockId);if(!visibility.ok)return visibility;if(!current().ok)return current();
        const marked=freeze({...tested.data.previousClock,visibility:visibility.data});
        captures.set(clockId,{...read.data,latest:value,records,replay,exposed:marked});return good(marked);
    }
    function registerClock(value,clockId){const available=current();if(!available.ok)return available;const capture=captures.get(clockId);const checked=cloneJsonValue(value);if(!capture||!Object.isFrozen(value)||!checked.ok||canonical(checked.data.value)!==canonical(capture.exposed))return fail('CLOCK_CAPTURE_REQUIRED','Clock authority requires this exact captured accepted source.');clockValues.set(value,capture);return good();}
    function retainTimeProjection({operation,inputs,settings,outputs}) {
        const available=current();if(!available.ok)return available;
        if(operation==='advance-time'){
            const capture=clockValues.get(inputs.clock?.value);if(!capture)return good();
            if(!outputs.clock?.value||!outputs.report?.value||!Array.isArray(outputs.occurrences?.value))return fail('INVALID_TIME_PROJECTION','The time projection is incomplete.');
            const parent=projections.get(inputs.clock.value),ancestors=parent?[...parent.ancestors,parent]:[];
            if(ancestors.length>=32)return fail('TIME_PROJECTION_LIMIT','Retain at most 32 chained time advances in one accepted turn.');
            if(parent?.remainder.minutes>0&&inputs.proposal.value!==parent.remainder)return fail('TIME_REMAINDER_UNRESOLVED','Connect the exact retained remainder before chaining another advance after an interruption.');
            const step=cloneJsonValue({previous:withoutAdvanceLedger(outputs.report.value.previousClock),proposal:inputs.proposal.value,settings,...(inputs.schedules?{schedules:inputs.schedules.value}:{}),...(inputs.consumed?{consumed:inputs.consumed.value}:{}),clock:withoutAdvanceLedger(outputs.clock.value),occurrences:outputs.occurrences.value,remainder:outputs.remainder.value});
            if(!step.ok)return fail('TIME_PROJECTION_LIMIT','The time projection exceeds portable ancestry bounds.');
            const steps=[...(parent?.steps??[]),step.data.value],occurrences=[...(parent?.occurrences??[]),...outputs.occurrences.value];
            if(occurrences.length>1000||!cloneJsonValue(steps).ok)return fail('TIME_PROJECTION_LIMIT','The complete time ancestry or occurrence ledger exceeds its bound.');
            const proof={capture,clock:outputs.clock.value,report:outputs.report.value,occurrences,remainder:outputs.remainder.value,ancestors,steps,visibility:artifactVisibility({outputs,ancestor:{visibility:parent?.visibility??{kind:'public'}}})};
            projections.set(proof.report,proof);projections.set(proof.clock,proof);clockValues.set(proof.clock,capture);occurrenceLists.set(outputs.occurrences.value,{proof});for(const event of outputs.occurrences.value)scheduledEvents.set(event.occurrenceId,{event,proof});return good();
        }
        if(operation==='time-trigger'){
            const prior=clockValues.get(inputs.previous?.value),projection=projections.get(inputs.destination?.value);
            if(!prior||!projection||projection.capture!==prior)return good();
            occurrenceLists.set(outputs.occurrences.value,{proof:projection});for(const event of outputs.occurrences.value)scheduledEvents.set(event.occurrenceId,{event,proof:projection});return good();
        }
        return good();
    }
    async function stageClock(report,extra,address) {
        const available=current();if(!available.ok)return available;const proof=projections.get(report);if(!proof||proof.report!==report)return fail('TIME_PROJECTION_UNAUTHORIZED','Clock Commit requires the retained Advance Time report.');
        let occurrences=proof.occurrences;
        if(extra!==undefined){const retained=occurrenceLists.get(extra)?.proof;if(!retained||retained.capture!==proof.capture||retained!==proof&&!proof.ancestors.includes(retained))return fail('TIME_PROJECTION_UNAUTHORIZED','Connected occurrences must derive from this retained time ancestry.');occurrences=[...occurrences,...extra];}occurrences=occurrences.filter((event,index,all)=>all.findIndex(other=>other.occurrenceId===event.occurrenceId)===index);
        const visibility=config.files.visibility(proof.capture.fileRef.targetId);if(!current().ok)return current();if(!visibility.ok)return visibility;if(!permits(artifactVisibility({visibility:proof.visibility,extra}),visibility.data))return fail('PRIVATE_DESTINATION','Clock Commit must preserve the time projection disclosure scope.');
        const capture=proof.capture,key=await hash({origin:withoutAdvanceLedger(capture.exposed),steps:proof.steps,occurrences});if(!current().ok)return current();
        let next;
        if(capture.replay){if(capture.replay.projectionKey!==key)return fail('CLOCK_REPLAY_CONFLICT','This player turn already accepted a different time projection; explicitly reconcile it.');next=capture.latest;}
        else {
            if(capture.records.length>=32)return fail('CLOCK_LEDGER_FULL','The retained turn ledger is full; explicitly archive it before advancing.');
            const previous={...capture.exposed};delete previous.acceptedTimeAdvances;
            const consumed=[...new Set([...(capture.latest.settledTimeEventIds??[]),...occurrences.map(event=>event.occurrenceId)])];
            if(consumed.length>1000||capture.latest.revision===Number.MAX_SAFE_INTEGER)return fail('CLOCK_LEDGER_FULL','The accepted clock or occurrence ledger reached its bound.');
            next={...proof.clock,revision:capture.latest.revision+1,settledTimeEventIds:consumed,pendingTimeAdvance:proof.remainder.minutes?proof.remainder:null,acceptedTimeAdvances:[...capture.records,{turnId:config.turnId,projectionKey:key,previousClock:previous}]};
        }
        const snapshot=cloneJsonValue(next);if(!snapshot.ok)return fail('CLOCK_LEDGER_FULL','The accepted clock projection exceeds portable bounds.');
        const intentId=await hash([scope,'clock',config.turnId,capture.fileRef.revision,key,capture.replay?'replay':'advance',...(address?.instancePath?.length?[[address.workflowId,address.instancePath,address.nodeId]]:[])]);if(!current().ok)return current();
        const prepared=await config.files.store.prepare(capture.fileRef,{operation:'replace',content:JSON.stringify(snapshot.data.value)},{intentId,evidence:[]});if(!current().ok)return current();if(!prepared.ok)return prepared;
        const staged=config.files.stage(prepared.data,[]);if(!current().ok)return current();if(staged.ok){const ids=new Set(occurrences.map(event=>event.occurrenceId));for(const ancestor of [...proof.ancestors,proof])stagedClocks.set(ancestor,ids);}return staged.ok?good(freeze({kind:'clock',status:'staged',clockId:next.clockId,previousRevision:capture.latest.revision,proposedRevision:next.revision,absoluteMinute:next.absoluteMinute,occurrenceCount:occurrences.length,remainingMinutes:next.pendingTimeAdvance?.minutes??0,intentId})):staged;
    }
    async function selectNativeRandomOutcomes({events,library,saved=[],rerollId,ledgerId='',visibility={kind:'public'}}){
        const available=current();if(!available.ok)return available;const checked=validateOccurrences(events,{status:'confirmed'});if(!checked.ok)return checked;
        for(const [key,entry]of cache.entries){try {if(entry.isCurrent()!==true)cache.entries.delete(key);}catch{cache.entries.delete(key);}}
        const bindings=[];for(const event of checked.data.events){const bound=source(event);if(!bound.ok)return bound;bindings.push(bound.data);}
        let selectedEvents=checked.data.events;
        if(config.playerSource){const captured=playerSource();if(!captured.ok)return captured;const rebased=[];for(const event of selectedEvents){if(event.source.watch!=='player-message'){rebased.push(event);continue;}const normalized=normalizeOccurrences(captured.data,[{eventType:event.eventType,actorId:event.actorId,...(event.itemId?{itemId:event.itemId}:{}),...(event.objectId?{objectId:event.objectId}:{}),position:event.position,semantics:event.semantics}],{actorIds:[...new Set([event.actorId,event.objectId].filter(Boolean))],itemIds:[event.itemId].filter(Boolean)});if(!normalized.ok)return normalized;const next=normalized.data.events[0];if(next.evidence.text!==event.evidence.text)return fail('STATE_EVIDENCE_CHANGED','The native player source must preserve the original exact quote.');rebased.push({...next,status:'confirmed',confirmation:{accepted:true},...(event.holderId?{holderId:event.holderId}:{})});}selectedEvents=rebased;}
        let durable=[],ledgerVisibility={kind:'public'};
        if(ledgerId){const mark=config.files.visibility(ledgerId);if(!current().ok)return current();if(!mark.ok)return mark;ledgerVisibility=mark.data;const read=await config.files.store.read(ledgerId);if(!current().ok)return current();if(!read.ok)return read;if(read.data.snapshot.format!=='json')return fail('INVALID_OUTCOME_LEDGER','Outcome ledgers require JSON arrays.');try {durable=JSON.parse(read.data.snapshot.content);}catch{return fail('INVALID_OUTCOME_LEDGER','The outcome ledger is invalid JSON.');}if(!Array.isArray(durable)||durable.length>256)return fail('INVALID_OUTCOME_LEDGER','The accepted outcome ledger must be a bounded JSON array.');for(const raw of durable){const checked=await validateRandomOutcome(raw);if(!current().ok)return current();if(!checked.ok||checked.data.outcome.acceptance!=='accepted')return fail('INVALID_OUTCOME_LEDGER','The accepted outcome ledger contains invalid or unaccepted outcomes.');}}
        const supplied=cloneJsonValue(saved);if(!supplied.ok||!Array.isArray(supplied.data.value))return fail('UNTRUSTED_SAVED_OUTCOME','Saved outcomes require the retained cache or an authorized ledger.');
        const prior=[...durable,...[...cache.entries.values()].filter(entry=>entry.turnId===config.turnId).map(entry=>entry.outcome)].filter((value,index,array)=>array.findIndex(other=>other.outcomeId===value.outcomeId)===index);
        if(supplied.data.value.some(value=>!prior.some(known=>canonical(known)===canonical(value))))return fail('UNTRUSTED_SAVED_OUTCOME','Imported outcomes cannot authorize a native draw. Select its authorized ledger.');
        const relevant=prior.filter(value=>selectedEvents.some(event=>event.eventId===value.event.eventId)&&value.library.libraryId===library.libraryId&&(value.rerollId??null)===(rerollId??null));
        const newCount=selectedEvents.filter(event=>!relevant.some(value=>value.event.eventId===event.eventId)).length;
        if(cache.entries.size+newCount>64)return fail('OUTCOME_CACHE_FULL','The pending draw cache is full; settle or explicitly cancel the pending outcomes.');
        const result=await selectRandomOutcomes(selectedEvents,library,relevant,{random:cache.random,...(rerollId?{rerollId,rerollPolicy:'explicit'}:{})});if(!current().ok)return current();if(!result.ok)return result;
        // Every callback is followed by the source and scope guard, before retaining any draw.
        for(let index=0;index<checked.data.events.length;index++){if(!source(checked.data.events[index]).ok)return fail('STATE_EVIDENCE_CHANGED','The event source changed while selecting outcomes.');}
        for(let index=0;index<result.data.outcomes.length;index++){const outcome=result.data.outcomes[index],key=canonical([scopeKey,config.turnId,outcome.event.eventId,outcome.library.libraryId,outcome.rerollId??null]);const mark=artifactVisibility({visibility,ledger:{visibility:ledgerVisibility},prior:{visibility:cache.entries.get(key)?.visibility??{kind:'public'}}});cache.entries.set(key,{outcome,visibility:mark,turnId:config.turnId,isCurrent:bindings[index].isCurrent});knownOutcomes.set(outcome.outcomeId,{key,outcome,visibility:mark});}
        return good(freeze({...result.data,visibility:artifactVisibility(result.data.outcomes.map(value=>({visibility:knownOutcomes.get(value.outcomeId).visibility})))}));
    }
    const outcomeBase=value=>({outcomeId:value.outcomeId,event:value.event,library:value.library,libraryFingerprint:value.libraryFingerprint,selection:value.selection,draw:value.draw,rerollId:value.rerollId,acceptance:value.acceptance});
    function reuseNativeOutcome(value){const available=current();if(!available.ok)return available;const known=knownOutcomes.get(value.outcomeId);if(!known||canonical(outcomeBase(known.outcome))!==canonical(outcomeBase(value)))return good(null);const entry=cache.entries.get(known.key);if(!entry||!source(value.event).ok)return fail('STATE_EVIDENCE_CHANGED','The retained draw source changed.');return good(entry.outcome);}
    async function retainNativeOutcome({parent,result}){const available=current();if(!available.ok)return available;const known=knownOutcomes.get(parent.outcomeId);if(!known)return good();const validated=await validateRandomOutcome(result);if(!current().ok)return current();if(!validated.ok)return validated;const next=validated.data.outcome;
        const immutable=value=>({outcomeId:value.outcomeId,event:value.event,library:value.library,libraryFingerprint:value.libraryFingerprint,selection:value.selection,draw:value.draw,rerollId:value.rerollId,acceptance:value.acceptance});
        if(canonical(immutable(parent))!==canonical(immutable(known.outcome))||canonical(immutable(next))!==canonical(immutable(known.outcome))||!source(next.event).ok)return fail('OUTCOME_PROJECTION_UNAUTHORIZED','The authored outcome must retain this captured draw and occurrence.');
        cache.entries.set(known.key,{...cache.entries.get(known.key),outcome:next});knownOutcomes.set(next.outcomeId,{...known,outcome:next});return good();
    }
    async function stageOutcomes(targetId,rawOutcomes,address){
        const available=current();if(!available.ok)return available;const admitted=cloneJsonValue(rawOutcomes);if(!admitted.ok)return fail('OUTCOME_LIMIT','Outcome Commit requires bounded own outcome data.');const values=Array.isArray(admitted.data.value)?admitted.data.value:[admitted.data.value];if(values.length>64)return fail('OUTCOME_LIMIT','Commit a bounded nonempty set of resolved outcomes.');
        const outcomes=[];for(const value of values){const known=knownOutcomes.get(value?.outcomeId);if(!known||canonical(value)!==canonical(known.outcome)||value.status!=='resolved'||!source(value.event).ok)return fail('OUTCOME_PROJECTION_UNAUTHORIZED','Outcome Commit requires the retained resolved draw and unchanged event.');outcomes.push({...value,acceptance:'accepted'});}
        const visibility=config.files.visibility(targetId);if(!current().ok)return current();if(!visibility.ok)return visibility;if(!permits(artifactVisibility({outcomes,provenance:values.map(value=>({visibility:knownOutcomes.get(value.outcomeId).visibility}))}),visibility.data))return fail('PRIVATE_DESTINATION','Outcome Commit must preserve the occurrence disclosure scope.');
        if(!values.length)return good(freeze({kind:'outcomes',status:'empty',targetId,outcomeIds:[]}));
        const read=await config.files.store.read(targetId);if(!current().ok)return current();if(!read.ok)return read;if(read.data.snapshot.format!=='json')return fail('INVALID_OUTCOME_LEDGER','Outcome Commit requires an authorized JSON array document.');
        const evidence=outcomes.map(value=>value.event),intentId=await hash([scope,'outcomes',targetId,outcomes,...(address?.instancePath?.length?[[address.workflowId,address.instancePath,address.nodeId]]:[])]);if(!current().ok)return current();
        const prepared=await config.files.store.prepare(read.data.fileRef,{operation:'add-unique',collectionPath:'',missingPath:'error',key:'outcomeId',records:outcomes},{intentId,evidence});if(!current().ok)return current();if(!prepared.ok)return prepared;
        const staged=config.files.stage(prepared.data,evidence);if(!current().ok)return current();return staged.ok?good(freeze({kind:'outcomes',status:'staged',targetId,outcomeIds:outcomes.map(value=>value.outcomeId),intentId})):staged;
    }
    function validateEvidence(raw,body,originalBody,options={}){const checked=cloneJsonValue(raw);if(!checked.ok||!Array.isArray(checked.data.value))return fail('INVALID_FILE_EVIDENCE','File evidence requires a bounded array.');for(const value of checked.data.value){if(!plain(value))return fail('INVALID_FILE_EVIDENCE','File evidence entries must be own records.');const events=Array.isArray(value.events)?value.events:[value];for(const event of events){if(event.occurrenceId&&scheduledEvents.has(event.occurrenceId)){const known=scheduledEvents.get(event.occurrenceId);if(canonical(event)!==canonical(known.event)||!stagedClocks.get(known.proof)?.has(event.occurrenceId))return fail('TIME_PROJECTION_UNAUTHORIZED','A scheduled consequence requires its exact retained occurrence and staged accepted clock.');}else if(event.source?.watch==='player-message'){const validated=validateOccurrences([event],{status:'confirmed'});if(!validated.ok||!source(event).ok)return fail('STATE_EVIDENCE_CHANGED','The captured player event changed before acceptance.');}else {const validated=validateNativeFileEvidence([event],body,originalBody,options);if(!validated.ok)return validated;}}}return current();}
    return Object.freeze({playerSource,readClock,registerClock,retainTimeProjection,stageClock,selectNativeRandomOutcomes,reuseNativeOutcome,retainNativeOutcome,stageOutcomes,validateEvidence,release(){released=true;captures.clear();knownOutcomes.clear();}});
}
