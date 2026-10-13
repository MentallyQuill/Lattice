import { applyProgressionEvents, projectTimeDecay } from '../progression.js?v=0.27.1';
import { advanceStoryClock } from '../story-time.js?v=0.27.1';
import { ownData, inspectCapabilities, freeze } from '../introspection/contracts.js?v=0.27.1';

const fail=(code,message)=>({ok:false,error:{code,message}});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
const pin=(id,direction,label=id)=>({id,label,kind:'data',direction,required:direction==='input',cardinality:'one'});
export const PROGRESSION_STATE_MODES=Object.freeze(['progression','time-decay']);

/** Descriptions extend State; these are modes, not separate registered operations. */
export function describeProgressionState(rawSettings) {
    const parsed=ownData(rawSettings);
    if(!parsed.ok||!exact(parsed.data,['mode'])||!PROGRESSION_STATE_MODES.includes(parsed.data.mode))return fail('INVALID_SETTINGS','Select a supported generic State mode.');
    return freeze({ok:true,data:{mode:parsed.data.mode,requestBound:0,modelRole:null,ports:[
        pin('state','input','Explicit state'),pin('rules','input','Authored rules'),parsed.data.mode==='progression'?pin('events','input','Confirmed events'):pin('clock','input','Effective Story Clock'),
        pin('out','output','Projected state'),pin('receipt','output','Proposed receipt'),
    ]}});
}
function visibilityFor(value) {
    const restrictions=[];
    const id=value=>typeof value==='string'&&!!value.trim()&&value.length<=256;
    const visit=item=>{
        if(!item||typeof item!=='object')return;
        if(Object.hasOwn(item,'visibility')) {
            const mark=item.visibility;
            if(mark==='public'||exact(mark,['kind'])&&mark.kind==='public') { /* Nested restrictions remain in force. */ }
            else if(exact(mark,['kind','actorId'])&&mark.kind==='actor-private'&&id(mark.actorId))restrictions.push({kind:'actor-private',actorId:mark.actorId});
            else if(mark==='actor-private') {
                const actorId=item.actorId??item.scope?.actorId??item.subjectId;
                restrictions.push(id(actorId)?{kind:'actor-private',actorId}:{kind:'hidden'});
            }else restrictions.push({kind:'hidden'});
        }
        if(Object.hasOwn(item,'visibleTo'))restrictions.push({kind:'hidden'});
        if(['actor-state','reflection','state-proposal','events','episodes','commit-intent'].includes(item.recordType))restrictions.push(id(item.scope?.actorId)?{kind:'actor-private',actorId:item.scope.actorId}:{kind:'hidden'});
        Object.values(item).forEach(visit);
    };
    visit(value);
    if(!restrictions.length)return {kind:'public'};
    const first=restrictions[0];
    return restrictions.every(mark=>mark.kind===first.kind&&mark.actorId===first.actorId)?first:{kind:'hidden'};
}
function proposedResult(mode,projection,inputs,extra={}) {
    const visibility=visibilityFor({inputs,projection,extra});
    const receipts=projection.receipts.map(receipt=>({...receipt,visibility,acceptance:'pending'}));
    const state={...projection.state,...(projection.state.ledger?{ledger:projection.state.ledger.map(receipt=>({...receipt,visibility}))}:{}),visibility};
    const artifact={kind:'data',value:state,visibility,status:'proposed',acceptance:'pending'};
    const receipt={kind:'data',value:{schemaVersion:1,recordType:'progression-receipt',mode,status:'proposed',acceptance:'pending',visibility,receipts,...extra},visibility,status:'proposed',acceptance:'pending'};
    const checked=ownData({ok:true,artifact,outputs:{out:artifact,receipt},reports:[{code:'STATE_PROJECTION',operation:'state',mode,actualCalls:0,status:'proposed',receiptCount:receipts.length,visibility}]});
    return checked.ok?freeze(checked.data):fail('PROGRESSION_OUTPUT_LIMIT','The proposed State outputs exceed portable data bounds.');
}
/** Project explicit Data inputs without any model, memory or persistence capability call. */
export function executeProgressionState(rawSettings,rawInputs,rawPorts={}) {
    try {
        const described=describeProgressionState(rawSettings);if(!described.ok)return described;
        const capabilities=inspectCapabilities(rawPorts);if(!capabilities.ok)return capabilities;
        if(capabilities.data.signal?.aborted)return fail('ABORTED','State projection was stopped.');
        const checked=ownData(rawInputs);if(!checked.ok||!object(checked.data))return fail('INVALID_INPUT','State modes require bounded named Data artifacts.');
        const inputs=checked.data,required=described.data.ports.filter(pin=>pin.direction==='input');
        if(Object.keys(inputs).some(key=>!required.some(pin=>pin.id===key)))return fail('INVALID_INPUT','Use only declared State inputs.');
        for(const pin of required) {
            if(!Object.hasOwn(inputs,pin.id))return fail('MISSING_INPUT','Missing '+pin.id+'.');
            const value=inputs[pin.id];
            if(!exact(value,['kind','value','visibility','status','acceptance','scope','sourceRefs'])||value.kind!=='data'||!Object.hasOwn(value,'value'))return fail('INVALID_INPUT','State projection inputs must be plain Data artifacts.');
        }
        if(described.data.mode==='progression') {
            const result=applyProgressionEvents(inputs.state.value,inputs.events.value,inputs.rules.value);
            if(!result.ok)return result;
            return proposedResult(described.data.mode,result.data,inputs);
        }
        const rules=inputs.rules.value;
        if(!Array.isArray(rules)||rules.some(rule=>!exact(rule,['decayId','revision','targetKey','baseline','unitsPerMinute','min','max','initialMinute','subjectId','objectId'])))return fail('INVALID_TIME_DECAY','Use only declared authored time-decay rule fields.');
        const clock=advanceStoryClock(inputs.clock.value,{kind:'duration',minutes:0});
        if(!clock.ok)return clock;
        const result=projectTimeDecay(inputs.state.value,clock.data.previousClock.absoluteMinute,rules);
        if(!result.ok)return result;
        return proposedResult(described.data.mode,result.data,inputs,{clock:clock.data.previousClock});
    }catch{return fail('INVALID_STATE_INPUT','State projection inputs could not be inspected.');}
}