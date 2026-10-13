import { cloneJsonValue } from './operations/json-data.js?v=0.27.1';

const failure = (code,message) => ({ok:false,error:{code,message}});
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const number = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
const minute = value => Number.isSafeInteger(value)&&value>=0;
const checked = (value,code) => {
    const result = cloneJsonValue(value);
    if (!result.ok) throw {code,message:'Use bounded plain JSON data with own fields.'};
    return result.data.value;
};
const reject = message => {throw {code:'INVALID_PROGRESSION',message};};
const unique = (entries,key) => new Set(entries.map(item=>item[key])).size === entries.length;
const has = (value,key) => Object.hasOwn(value,key);
const totalMap = value => record(value) && Object.values(value).every(item=>number(item)&&item>=0);

function admit(rawState,rawEvents,rawRules) {
    const state=checked(rawState,'INVALID_PROGRESSION'), events=checked(rawEvents,'INVALID_PROGRESSION'), table=checked(rawRules,'INVALID_PROGRESSION');
    if (!record(state)||!Array.isArray(state.values)||state.values.length>256||state.values.some(item=>!record(item)||!id(item.key)||!number(item.value))||!unique(state.values,'key')) reject('Values require unique authored keys and bounded numeric values.');
    if (!Array.isArray(state.ledger)||state.ledger.length>5000||state.ledger.some(item=>!record(item)||!id(item.eventId)||typeof item.identityKey!=='string'||item.identityKey.length>4096||typeof item.eventIdentity!=='string'||item.eventIdentity.length>4096)||!unique(state.ledger,'identityKey')) reject('The event ledger must contain unique bounded identities.');
    if (!Array.isArray(events)||events.length>1000||events.some(item=>!record(item)||!id(item.eventId)||!id(item.eventType)||!record(item.identity)||item.status!=='confirmed'||!record(item.evidence)||!id(item.evidence.origin))) reject('Events require confirmed occurrence identities and explicit evidence.');
    if (!record(table)||!id(table.ruleSetId)||!Number.isSafeInteger(table.revision)||table.revision<1||!Array.isArray(table.rules)||table.rules.length>256||!unique(table.rules,'ruleId')) reject('Use a versioned authored rule table.');
    const budgetPolicies=new Map();
    for (const rule of table.rules) {

        const allowedRuleFields=['ruleId','eventType','targetKey','identityFields','mode','amount','min','max','subjectId','objectId','budgetGroup','positiveSceneCap','positiveDayCap','zeroDeltaPolicy','cooldownMinutes','diminishingFactors','cooldownOnZero','repeatOnZero'];
        if(!record(rule)||Object.keys(rule).some(key=>!allowedRuleFields.includes(key)))reject('Only declared authored rule settings are supported.');

        if (!record(rule)||!id(rule.ruleId)||!id(rule.eventType)||!id(rule.targetKey)||!Array.isArray(rule.identityFields)||rule.identityFields.length<1||rule.identityFields.length>16||rule.identityFields.some(field=>!id(field))||new Set(rule.identityFields).size!==rule.identityFields.length||!['add','set','clamp'].includes(rule.mode)||(rule.mode!=='clamp'&&!number(rule.amount))||(rule.mode==='clamp'&&has(rule,'amount'))||!number(rule.min)||!number(rule.max)||rule.min>rule.max) reject('A rule requires declared identity fields, an authored add/set amount or clamp, and ordered numeric bounds.');
        const target = state.values.find(item=>item.key===rule.targetKey);
        if (!target) reject('Every rule must address an existing authored value.');

        if(target.visibility==='actor-private'&&(!id(rule.subjectId)||!id(target.subjectId)||rule.subjectId!==target.subjectId||has(target,'objectId')&&rule.objectId!==target.objectId))reject('Private values require explicitly authored matching actor scope.');

        for(const key of ['subjectId','objectId','budgetGroup'])if(has(rule,key)&&!id(rule[key]))reject('Rule scope IDs must be bounded authored strings.');
        if(has(rule,'subjectId')&&target.subjectId!==rule.subjectId||has(rule,'objectId')&&target.objectId!==rule.objectId)reject('A directed rule must match its stored target scope.');
        for(const key of ['positiveSceneCap','positiveDayCap'])if(has(rule,key)&&(!number(rule[key])||rule[key]<0))reject('Positive caps must be nonnegative authored numbers.');
        if(has(rule,'positiveDayCap')&&(!Number.isSafeInteger(table.dayLengthMinutes)||table.dayLengthMinutes<1))reject('A story-day cap requires an explicit calendar day length.');

        if(has(rule,'cooldownMinutes')&&!minute(rule.cooldownMinutes))reject('Cooldowns require nonnegative integer story minutes.');
        if(has(rule,'diminishingFactors')&&(!Array.isArray(rule.diminishingFactors)||rule.diminishingFactors.length<1||rule.diminishingFactors.length>64||rule.diminishingFactors.some(factor=>!number(factor)||factor<0||factor>1)))reject('Diminishing factors require an authored bounded list in [0,1].');
        for(const key of ['cooldownOnZero','repeatOnZero'])if(has(rule,key)&&typeof rule[key]!=='boolean')reject('Zero-delta pacing modes require explicit booleans.');

        const groupKey=JSON.stringify([rule.targetKey,rule.budgetGroup??rule.targetKey]);
        const groupPolicy=JSON.stringify([rule.positiveSceneCap??null,rule.positiveDayCap??null]);
        if(budgetPolicies.has(groupKey)&&budgetPolicies.get(groupKey)!==groupPolicy)reject('Rules sharing a value/budget group must agree on their pacing caps.');
        budgetPolicies.set(groupKey,groupPolicy);
        if(has(rule,'zeroDeltaPolicy')&&!['consume','retain'].includes(rule.zeroDeltaPolicy))reject('Choose whether zero-delta events are consumed or retained.');
    }
    const initialized=['budgets','cooldowns','repetitions'].filter(key=>!has(state,key));
    if(state.budgets===undefined)state.budgets={scene:{},day:{}};
    if(!record(state.budgets)||!totalMap(state.budgets.scene)||!totalMap(state.budgets.day))reject('Pacing budgets require nonnegative scene/day totals.');

    if(state.cooldowns===undefined)state.cooldowns={};
    if(!record(state.cooldowns)||Object.values(state.cooldowns).some(value=>!minute(value)))reject('Cooldown state requires nonnegative integer eligible times.');
    if(state.repetitions===undefined)state.repetitions={};
    if(!record(state.repetitions)||Object.values(state.repetitions).some(value=>!minute(value)))reject('Repeat state requires nonnegative integer counts.');
    return {state,events,table,initialized};
}
function eventIdentityFor(event) {
    const fields=Object.entries(event.identity).sort(([a],[b])=>a<b?-1:a>b?1:0);
    if(fields.some(([key,value])=>!id(key)||!id(value)&&!(Number.isSafeInteger(value)&&value>=0)))reject('Occurrence identity fields must be bounded canonical IDs.');
    for(const key of ['subjectId','objectId','sceneId'])if(has(event,key)&&!id(event[key]))reject('Occurrence attribution requires bounded canonical IDs.');
    if(has(event,'absoluteMinute')&&!minute(event.absoluteMinute))reject('Occurrence time must be an established nonnegative integer minute.');
    const identity=JSON.stringify([event.eventType,event.subjectId??null,event.objectId??null,event.sceneId??null,event.absoluteMinute??null,fields]);
    if(identity.length>4096)reject('Occurrence identities exceed their bounded ledger representation.');
    return identity;
}

function identityFor(event,rule,table) {
    const identity = [...rule.identityFields].sort().map(field=>{
        const value = has(event.identity,field)?event.identity[field]:undefined;
        if(!id(value)&&!(Number.isSafeInteger(value)&&value>=0))reject('A matched event is missing its authored identity.');
        return [field,value];
    });
    const key=JSON.stringify([table.ruleSetId,rule.ruleId,rule.targetKey,...identity]);
    if(key.length>4096)reject('The generated reward identity exceeds the bounded ledger representation.');
    return key;
}
function pacing(event,rule,table,state,raw) {
    let allowed=raw;
    const group=rule.budgetGroup??rule.targetKey, reasons=[], updates=[];
    let storyDay;

    const pacingKey=JSON.stringify([table.ruleSetId,rule.ruleId,rule.targetKey]);
    const nextEligible=state.cooldowns[pacingKey]??0, repeatCount=state.repetitions[pacingKey]??0;
    const blocked=has(rule,'cooldownMinutes')&&event.absoluteMinute<nextEligible;
    if(has(rule,'cooldownMinutes')&&!minute(event.absoluteMinute))reject('A cooldown requires this event\'s established story minute.');
    if(blocked){allowed=0;reasons.push('cooldown');}
    if(rule.diminishingFactors&&!blocked){
        const factor=rule.diminishingFactors[Math.min(repeatCount,rule.diminishingFactors.length-1)];
        if(factor!==1)reasons.push('diminishing-returns');
        allowed*=factor;
    }

    if(has(rule,'positiveSceneCap')) {
        if(!id(event.sceneId))reject('A scene cap requires the stable scene identity for this event.');
        const key=JSON.stringify([rule.targetKey,group,event.sceneId]), used=state.budgets.scene[key]??0;
        if(allowed>0){const amount=Math.min(allowed,Math.max(0,rule.positiveSceneCap-used));if(amount<allowed)reasons.push('scene-cap');allowed=amount;}
        updates.push({kind:'scene',key,used});
    }
    if(has(rule,'positiveDayCap')) {
        if(!minute(event.absoluteMinute))reject('A day cap requires the established story timestamp of this event.');
        storyDay=Math.floor(event.absoluteMinute/table.dayLengthMinutes)+1;
        if(!Number.isSafeInteger(storyDay))reject('The event story day exceeds safe arithmetic.');
        const key=JSON.stringify([rule.targetKey,group,storyDay]), used=state.budgets.day[key]??0;
        if(allowed>0){const amount=Math.min(allowed,Math.max(0,rule.positiveDayCap-used));if(amount<allowed)reasons.push('day-cap');allowed=amount;}
        updates.push({kind:'day',key,used});
    }
    return {allowed,reasons,updates,pacingKey,repeatCount,blocked,...(storyDay===undefined?{}:{storyDay})};
}

/** Project authored event-driven numeric updates; this has no persistence or model authority. */
export function applyProgressionEvents(rawState,rawEvents,rawRules) {
    try {
        const {state,events,table,initialized}=admit(rawState,rawEvents,rawRules), ledger=state.ledger, receipts=[];
        const known=new Map(ledger.map(item=>[item.identityKey,item]));
        const byEvent=new Map();let lastProgressionMinute=-1;
        for(const item of ledger) {
            if(byEvent.has(item.eventId)&&byEvent.get(item.eventId)!==item.eventIdentity)throw {code:'EVENT_ID_CONFLICT',message:'The stored occurrence ID refers to incompatible facts.'};
            byEvent.set(item.eventId,item.eventIdentity);
        }
        for(const event of events) {
            const eventIdentity=eventIdentityFor(event);
            if(byEvent.has(event.eventId)&&byEvent.get(event.eventId)!==eventIdentity)throw {code:'EVENT_ID_CONFLICT',message:'One occurrence ID cannot identify incompatible events.'};
            byEvent.set(event.eventId,eventIdentity);

            const matched=table.rules.filter(rule=>rule.eventType===event.eventType&&(!has(rule,'subjectId')||rule.subjectId===event.subjectId)&&(!has(rule,'objectId')||rule.objectId===event.objectId));

            if(matched.some(rule=>has(rule,'cooldownMinutes')||has(rule,'positiveDayCap'))){
                if(!minute(event.absoluteMinute))throw {code:'UNRESOLVED_TIME',message:'This progression needs the event\'s established story minute.'};
                if(event.absoluteMinute<lastProgressionMinute)throw {code:'EVENT_ORDER',message:'Timed progression occurrences must be supplied chronologically.'};
                lastProgressionMinute=event.absoluteMinute;
            }
            if(!matched.length){receipts.push({eventId:event.eventId,status:'unmatched'});continue;}
            for(const rule of matched) {
                const identityKey=identityFor(event,rule,table), target=state.values.find(item=>item.key===rule.targetKey), before=target.value, raw=rule.mode==='set'?rule.amount-before:rule.mode==='clamp'?0:rule.amount;
                if(!number(raw))reject('The authored numeric delta exceeds safe finite arithmetic.');
                if(known.has(identityKey)){receipts.push({eventId:event.eventId,ruleId:rule.ruleId,identityKey,status:'duplicate',before,raw,allowed:0,after:before});continue;}
                const policy=pacing(event,rule,table,state,raw), proposed=rule.mode==='set'&&policy.allowed===raw&&!policy.blocked?rule.amount:before+policy.allowed;
                if(!number(proposed))reject('Numeric progression exceeds safe finite arithmetic.');
                const after=policy.blocked?before:Math.min(rule.max,Math.max(rule.min,proposed));
                let allowed=after-before;
                if(!number(allowed))reject('The actual bounded delta exceeds safe finite arithmetic.');
                for(const update of policy.updates)if(allowed>0){
                    const remaining=Math.max(0,rule[update.kind==='scene'?'positiveSceneCap':'positiveDayCap']-update.used);
                    if(allowed<=remaining)continue;
                    // Only fractional arithmetic dust is normalized; integer and zero caps are exact.
                    const dust=remaining>0&&!(Number.isSafeInteger(allowed)&&Number.isSafeInteger(remaining))?Number.EPSILON*4*Math.max(Math.abs(allowed),Math.abs(remaining)):0;
                    if(allowed-remaining>dust)reject('The authored bounds require a gain beyond the remaining positive cap.');
                    allowed=remaining;
                }
                const receipt={eventId:event.eventId,eventIdentity,eventType:event.eventType,ruleSetId:table.ruleSetId,ruleRevision:table.revision,ruleId:rule.ruleId,targetKey:rule.targetKey,identityKey,status:'applied',before,raw,allowed,after,evidence:event.evidence,reasons:policy.reasons,...(policy.storyDay===undefined?{}:{storyDay:policy.storyDay})};
                if(allowed!==policy.allowed)receipt.reasons.push('bounds');
                target.value=after;
                if(allowed>0)for(const update of policy.updates){const total=update.used+allowed;if(!number(total))reject('Pacing totals exceed safe finite arithmetic.');state.budgets[update.kind][update.key]=total;}
                const consume=allowed!==0||(rule.zeroDeltaPolicy??'consume')==='consume';
                receipt.consumed=consume;

                if(consume&&!policy.blocked){
                    if(has(rule,'cooldownMinutes')&&(allowed!==0||rule.cooldownOnZero===true)){
                        const nextEligible=event.absoluteMinute+rule.cooldownMinutes;
                        if(!minute(nextEligible))reject('The next eligible time exceeds safe integer arithmetic.');
                        state.cooldowns[policy.pacingKey]=nextEligible;
                    }
                    if(rule.diminishingFactors&&(allowed!==0||rule.repeatOnZero===true)){
                        const repetitions=policy.repeatCount+1;
                        if(!minute(repetitions))reject('The repeat ledger exceeds safe integer arithmetic.');
                        state.repetitions[policy.pacingKey]=repetitions;
                    }
                }

                if(consume){ledger.push(receipt);known.set(identityKey,receipt);}else receipt.status='retained';
                receipts.push(receipt);
            }
        }

        for(const key of initialized)if(key==='budgets'?Object.keys(state.budgets.scene).length===0&&Object.keys(state.budgets.day).length===0:Object.keys(state[key]).length===0)delete state[key];
        const result=checked({state,ledger,receipts,actualCalls:0},'PROGRESSION_LIMIT');
        return {ok:true,data:result};
    } catch(error){return failure(error?.code??'INVALID_PROGRESSION',error?.message??'The progression cannot be safely inspected.');}
}

/** Report all crossings; bands and milestones do not themselves authorize a state write. */
export function resolveThresholds(rawBefore,rawAfter,rawThresholds) {
    try {
        const thresholds=checked(rawThresholds,'INVALID_THRESHOLDS');
        if(!number(rawBefore)||!number(rawAfter)||!Array.isArray(thresholds)||thresholds.length>256||thresholds.some((value,index)=>!number(value)||index>0&&value<=thresholds[index-1]))return failure('INVALID_THRESHOLDS','Use finite values and a strictly increasing authored threshold list.');
        const direction=rawAfter>=rawBefore?'up':'down';
        const crossings=thresholds.flatMap((threshold,index)=>(direction==='up'?rawBefore<threshold&&threshold<=rawAfter:rawAfter<threshold&&threshold<=rawBefore)?[{threshold,index,level:index+1,direction}]:[]);
        if(direction==='down')crossings.reverse();
        return {ok:true,data:{crossings,beforeBand:thresholds.filter(value=>value<=rawBefore).length,afterBand:thresholds.filter(value=>value<=rawAfter).length,actualCalls:0}};
    } catch{return failure('INVALID_THRESHOLDS','Use bounded plain authored thresholds.');}
}

/** Explicit elapsed-time recovery is separate from legacy message-step Curve behavior. */
export function projectTimeDecay(rawState,destination,rawRules) {
    try {
        const state=checked(rawState,'INVALID_TIME_DECAY'), rules=checked(rawRules,'INVALID_TIME_DECAY');
        if(!record(state)||!Array.isArray(state.values)||state.values.length>256||state.values.some(item=>!record(item)||!id(item.key)||!number(item.value))||!unique(state.values,'key')||!minute(destination))return failure('INVALID_TIME_DECAY','Use bounded authored values and an established nonnegative story minute.');
        if(!Array.isArray(rules)||rules.length>256||!unique(rules,'decayId')||!unique(rules,'targetKey'))return failure('INVALID_TIME_DECAY','Choose one explicit recovery rule per value.');
        const hadDecayTimes=has(state,'decayTimes');
        if(state.decayTimes===undefined)state.decayTimes={};
        if(!record(state.decayTimes)||Object.values(state.decayTimes).some(value=>!minute(value)))return failure('INVALID_TIME_DECAY','Decay timestamps must be nonnegative integer story minutes.');
        const receipts=[];
        for(const rule of rules) {
            if(!record(rule)||!id(rule.decayId)||!id(rule.targetKey)||!Number.isSafeInteger(rule.revision)||rule.revision<1||!number(rule.baseline)||!number(rule.unitsPerMinute)||rule.unitsPerMinute<0||!number(rule.min)||!number(rule.max)||rule.min>rule.max||rule.baseline<rule.min||rule.baseline>rule.max||!minute(rule.initialMinute))return failure('INVALID_TIME_DECAY','Recovery requires explicit baseline, rate, bounds, revision and initial story time.');
            const target=state.values.find(item=>item.key===rule.targetKey);
            if(!target||target.value<rule.min||target.value>rule.max)return failure('INVALID_TIME_DECAY','Recovery targets must exist inside their authored bounds.');
            if(target.visibility==='actor-private'&&(!id(rule.subjectId)||!id(target.subjectId)||rule.subjectId!==target.subjectId||has(target,'objectId')&&rule.objectId!==target.objectId))return failure('INVALID_TIME_DECAY','Private recovery requires explicitly authored matching actor scope.');
            for(const field of ['subjectId','objectId'])if(has(rule,field)&&(!id(rule[field])||rule[field]!==target[field]))return failure('INVALID_TIME_DECAY','Directed recovery must match its stored target scope.');
            const key=JSON.stringify([rule.decayId,rule.targetKey]), previousMinute=state.decayTimes[key]??rule.initialMinute;
            if(destination<previousMinute)return failure('BACKWARD_TIME','Recovery cannot rewind established story time.');
            const elapsedMinutes=destination-previousMinute, amount=elapsedMinutes*rule.unitsPerMinute;
            if(!number(amount))return failure('TIME_DECAY_LIMIT','Elapsed-time recovery exceeds safe finite arithmetic.');
            const before=target.value, after=before>rule.baseline?Math.max(rule.baseline,before-amount):Math.min(rule.baseline,before+amount);
            target.value=after;if(elapsedMinutes>0||has(state.decayTimes,key))state.decayTimes[key]=destination;
            receipts.push({decayId:rule.decayId,ruleRevision:rule.revision,targetKey:rule.targetKey,previousMinute,destination,elapsedMinutes,before,raw:before>rule.baseline?-amount:amount,allowed:after-before,after,baseline:rule.baseline});
        }
        if(!hadDecayTimes&&Object.keys(state.decayTimes).length===0)delete state.decayTimes;
        return {ok:true,data:checked({state,receipts,actualCalls:0},'TIME_DECAY_LIMIT')};
    } catch(error){return failure(error?.code??'INVALID_TIME_DECAY',error?.message??'Recovery cannot be safely inspected.');}
}

