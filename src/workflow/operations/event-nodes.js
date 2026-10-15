import { parseRuntimeContext } from './context-data.js?v=0.27.3';
import { validateStoryClock } from '../story-time.js?v=0.27.3';
import { artifactVisibility, preserveArtifactPrivacy, validVisibilityMetadata } from '../artifact-privacy.js?v=0.27.3';
import { cloneJsonValue, stringifyJsonValue } from './json-data.js?v=0.27.3';
import { normalizeOccurrences, confirmOccurrences, resolveItemHolders, matchLiteralTrigger, validateOccurrences, toProgressionEvents, sourceFromDraft } from './event-data.js?v=0.27.3';
import { own, plain, freeze } from '../record-data.js?v=0.27.3';

const fail = (code,message) => ({ ok:false,error:{code,message} });
const pin = (id,kind,direction,required=false) => ({ id,label:id,kind,direction,required,cardinality:'one' });
const textControl = (value,maxLength=4096) => ({ type:'string',default:value,maxLength });
const registration = (id,title,defaults,controls,extra={}) => ({ id,title,family:'Events',phase:'both',minimumSchema:3,minimumRuntime:2,operationVersion:1,input:'data',output:'data',defaults,controls:Object.keys(defaults),controlDescriptors:controls,requestBound:0,modelRole:null,terminal:false,dynamicPorts:true,...extra });
export const EVENT_OPERATIONS = {
    'actor-context': registration('actor-context','Actor Context',{actorId:''},{actorId:textControl('',256)},{output:'context',rootOnly:true}),
    'draft-event-source': registration('draft-event-source','Draft Event Source',{}, {},{phase:'post',input:'draft'}),
    'event-normalize': registration('event-normalize','Event Normalize',{mode:'candidates',eventType:'',absoluteMinute:-1},{mode:{type:'enum',default:'candidates',values:['candidates','progression']},eventType:textControl('',256),absoluteMinute:{type:'integer',default:-1,min:-1,max:Number.MAX_SAFE_INTEGER}}),
    'prompted-memory': registration('prompted-memory','Prompted Memory',{ actorId:'',mode:'recall',prompt:'',allowCreate:false,maxTokens:1024 },{ actorId:textControl('',256),mode:{type:'enum',default:'recall',values:['recall','create','recall-or-create']},prompt:textControl(''),allowCreate:{type:'boolean',default:false},maxTokens:{type:'integer',default:1024,min:1,max:8192} },{ requestBound:1,modelRole:'promptedMemory' }),
    'item-mention-trigger': registration('item-mention-trigger','Item Mention Trigger',{ actorId:'',itemId:'',aliases:[],watch:'player-message',activation:'once-per-source',caseSensitive:false },{ actorId:textControl('',256),itemId:textControl('',256),aliases:{type:'array',items:'string',default:[],min:1,max:32},watch:{type:'enum',default:'player-message',values:['player-message','draft','scene-context','accepted-event']},activation:{type:'enum',default:'once-per-source',values:['per-occurrence','once-per-source','edge-once']},caseSensitive:{type:'boolean',default:false} }),
    'item-use-trigger': registration('item-use-trigger','Item Use Trigger',{ itemId:'',mode:'candidates',watch:'player-message',instructions:'',maxTokens:2048 },{ itemId:textControl('',256),mode:{type:'enum',default:'candidates',values:['candidates','extract']},watch:{type:'enum',default:'player-message',values:['player-message','draft','scene-context','accepted-event']},instructions:textControl(''),maxTokens:{type:'integer',default:2048,min:1,max:8192} }),
    'confirm-events': registration('confirm-events','Confirm Events',{mode:'records'},{mode:{type:'enum',default:'records',values:['records','single-gate']}}),
    'current-holder': registration('current-holder','Current Holder',{},{}),
    'scene-presence': registration('scene-presence','Scene Presence',{ actorId:'' },{ actorId:textControl('',256) }),
    'character-direction': registration('character-direction','Character Direction',{ actorId:'',systemPrompt:'',maxTokens:1024 },{ actorId:textControl('',256),systemPrompt:textControl(''),maxTokens:{type:'integer',default:1024,min:1,max:8192} },{ output:'guidance',requestBound:1,modelRole:'characterDirection' }),
};
const exact = (value,keys) => plain(value) && Object.keys(value).every(key=>keys.includes(key));
const id = value => typeof value==='string' && !!value.trim() && value.length<=256;
function resolve(node,options={}) {
    if(!plain(node)||!plain(options))return fail('INVALID_SETTINGS','Use plain node metadata.');
    for(const [value,keys] of [[node,['operation','operationVersion','phase','type']],[options,['phase']]])for(const key of keys) {
        const property=Object.getOwnPropertyDescriptor(value,key);
        if(property&&(!property.enumerable||!Object.hasOwn(property,'value')))return fail('INVALID_SETTINGS','Routing metadata requires own data properties.');
    }
    if (!plain(node)||!plain(options)) return fail('INVALID_SETTINGS','Use plain Event node settings.');
    const operation = own(node,'operation'), base = Object.hasOwn(EVENT_OPERATIONS,operation) && EVENT_OPERATIONS[operation];
    if (!base || own(node,'operationVersion')!==undefined && own(node,'operationVersion')!==1) return fail('UNKNOWN_OPERATION','Unknown Event operation.');
    const phase=own(options,'phase')??own(node,'phase')??(base.phase==='post'?'post':'pre');
    if(!['pre','post'].includes(phase)||base.phase==='post'&&phase!=='post'||own(node,'phase')!==undefined&&own(node,'phase')!==phase) return fail('INVALID_PHASE','Event phase must match its effective phase.');
    const settings={};
    for(const key of base.controls) {
        const descriptor=Object.getOwnPropertyDescriptor(node,key);
        if(descriptor&&(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))) return fail('INVALID_SETTINGS','Controls require own data properties.');
        const value=cloneJsonValue(descriptor?descriptor.value:base.defaults[key]);if(!value.ok)return value;settings[key]=value.data.value;
        const control=base.controlDescriptors[key];
        if(control.type==='string'&&(typeof settings[key]!=='string'||settings[key].length>control.maxLength)
            || control.type==='integer'&&(!Number.isSafeInteger(settings[key])||settings[key]<control.min||settings[key]>control.max)
            || control.type==='enum'&&!control.values.includes(settings[key])
            || control.type==='boolean'&&typeof settings[key]!=='boolean') return fail('INVALID_SETTINGS','Use supported bounded Event controls.');
    }
    const setupIssues=[];
    if(Object.hasOwn(settings,'actorId')&&!id(settings.actorId))setupIssues.push({code:'INVALID_SETTINGS',message:'Select a canonical actor identity.',field:'actorId'});
    let ports;
    if(operation==='draft-event-source')ports=[pin('in','draft','input',true),pin('scope','data','input',true),pin('out','data','output')];
    else if(operation==='event-normalize')ports=settings.mode==='progression'?[pin('events','data','input',true),pin('clock','data','input'),pin('out','data','output')]:[pin('source','data','input',true),pin('entities','data','input',true),pin('candidates','data','input',true),pin('out','data','output')];
    else if(operation==='scene-presence')ports=[pin('in','data','input',true),pin('out','data','output')];
    else if(['actor-context','character-direction'].includes(operation))ports=[pin('presence','data','input',true),...(operation==='character-direction'?[pin('data','data','input')]:[]),pin('out',operation==='actor-context'?'context':'guidance','output')];
    else if(operation==='prompted-memory')ports=[pin('presence','data','input',true),pin('event','data','input',true),pin('out','data','output')];
    else if(operation==='item-mention-trigger')ports=[pin('source','data','input',true),pin('entities','data','input',true),pin('state','data','input'),pin('out','data','output'),pin('state','data','output')];
    else if(operation==='item-use-trigger')ports=[pin('source','data','input',true),pin('entities','data','input',true),...(settings.mode==='candidates'?[pin('candidates','data','input',true)]:[]),pin('out','data','output')];
    else if(operation==='confirm-events')ports=[pin('events','data','input',true),pin('decisions','data','input',true),pin('out','data','output')];
    else ports=[pin('events','data','input',true),pin('holders','data','input',true),pin('events','data','output'),pin('holders','data','output')];
    if(Object.hasOwn(settings,'itemId')&&!id(settings.itemId))setupIssues.push({code:'INVALID_SETTINGS',message:'Select a canonical item identity.',field:'itemId'});
    if(operation==='item-mention-trigger') {
        if(!Array.isArray(settings.aliases)||settings.aliases.length>32||settings.aliases.some(alias=>typeof alias!=='string'||!alias.trim()||alias.length>2048))return fail('INVALID_SETTINGS','Provide bounded literal aliases.');
        if(!settings.aliases.length)setupIssues.push({code:'INVALID_SETTINGS',message:'Provide at least one literal alias.',field:'aliases'});
    }
    if(setupIssues.length&&!options.authoring)return {ok:false,error:setupIssues[0]};
    const requestBound=operation==='item-use-trigger'?settings.mode==='extract'?1:0:base.requestBound;
    const modelRole=operation==='item-use-trigger'&&settings.mode==='extract'?'eventExtract':base.modelRole;
    return {ok:true,data:{descriptor:{...base,phase,input:ports[0]?.kind??base.input,requestBound,modelRole},ports,settings,setupIssues}};
}
export function describeEvent(node,options={}) {
    const result=resolve(node,options);if(!result.ok)return result;
    return {ok:true,data:{descriptor:result.data.descriptor,ports:result.data.ports,...(options.authoring?{setupIssues:result.data.setupIssues}:{})}};
}
function inputsFor(raw,ports,operation) {
    const cloned=cloneJsonValue(raw);if(!cloned.ok)return cloned;
    const inputs=cloned.data.value;if(!plain(inputs))return fail('INVALID_INPUT','Event inputs require named Data artifacts.');
    const allowed=ports.filter(port=>port.direction==='input');
    if(Object.keys(inputs).some(key=>!allowed.some(port=>port.id===key)))return fail('UNSUPPORTED_INPUT','Unsupported Event input.');
    for(const port of allowed) {
        if(!Object.hasOwn(inputs,port.id)){if(port.required)return fail('MISSING_INPUT','Required input is missing: '+port.id);continue;}
        const artifact=inputs[port.id];
        if(port.kind==='draft') {
            if(!plain(artifact)||artifact.kind!=='draft'||typeof artifact.text!=='string'||!plain(artifact.source))return fail('INVALID_INPUT','Draft Event Source requires a checked Draft.');
        } else {
            const projection=operation==='character-direction'&&port.id==='data'&&(Object.hasOwn(artifact??{},'status')||Object.hasOwn(artifact??{},'acceptance'));
            if(!exact(artifact,projection?['kind','value','visibility','status','acceptance']:['kind','value','visibility'])||!validVisibilityMetadata(artifact)||artifact.kind!=='data'||!Object.hasOwn(artifact,'value')
                ||projection&&(artifact.status!=='proposed'||artifact.acceptance!=='pending'))return fail('INVALID_INPUT','Event input requires bounded Data.');
        }
    }
    return {ok:true,data:{inputs}};
}
function presenceRecord(scene,actorId) {
    if(!exact(scene,['sceneId','sourceId','revision','actors'])||!id(scene.sceneId)||!id(scene.sourceId)||!id(scene.revision)
        ||!Array.isArray(scene.actors)||scene.actors.length>128||scene.actors.some(actor=>!exact(actor,['actorId','status','evidence'])||!id(actor.actorId)||!['present','absent','unresolved'].includes(actor.status))
        ||new Set(scene.actors.map(actor=>actor.actorId)).size!==scene.actors.length)return fail('INVALID_CAST','Scene Cast requires explicit canonical participation states.');
    const actor=scene.actors.find(entry=>entry.actorId===actorId);
    return {ok:true,data:{schemaVersion:1,recordType:'scene-presence',sceneId:scene.sceneId,sourceId:scene.sourceId,revision:scene.revision,actorId,status:actor?.status??'unresolved',...(actor?.evidence===undefined?{}:{evidence:actor.evidence})}};
}
function privateScope(value,actorId) {
    if(Array.isArray(value))return value.every(item=>privateScope(item,actorId));
    if(!plain(value))return true;
    if(value.visibility==='actor-private'&&(value.actorId??value.scope?.actorId)!==actorId)return false;
    if(Object.hasOwn(value,'visibleTo')&&(!Array.isArray(value.visibleTo)||!value.visibleTo.includes(actorId)))return false;
    return Object.values(value).every(item=>privateScope(item,actorId));
}
async function scopedContext(presence,actorId,local,exactPresence,exactData) {
    if(!exact(presence,['schemaVersion','recordType','sceneId','sourceId','revision','actorId','status','evidence'])
        ||presence.schemaVersion!==1||presence.recordType!=='scene-presence'||presence.actorId!==actorId||!id(presence.sceneId)||!id(presence.sourceId)||!id(presence.revision)
        ||!['present','absent','unresolved'].includes(presence.status))return fail('INVALID_PRESENCE','Direction requires the selected actors checked scene presence.');
    if(presence.status!=='present')return {ok:true,outputStates:{out:{status:presence.status==='absent'?'skipped':'unresolved',reason:{code:presence.status==='absent'?'ACTOR_ABSENT':'PRESENCE_UNRESOLVED',message:'This actor is not confirmed to participate at this scene stage.'}}}};
    if(own(local,'signal')?.aborted)return fail('ABORTED','The actor request was stopped.');
    if(typeof own(local,'actorContext')!=='function')return fail('ACTOR_CONTEXT_MISSING','The trusted host must supply this actors authorized context.');
    let response;try{response=await own(local,'actorContext')(actorId,{sceneId:presence.sceneId,sourceId:presence.sourceId,revision:presence.revision,signal:own(local,'signal'),...(exactData===undefined?{}:{data:exactData})},exactPresence);}catch{return fail('ACTOR_CONTEXT_FAILED','The authorized actor context could not be captured.');}
    if(own(local,'signal')?.aborted)return fail('ABORTED','Ignore the stopped actor context.');
    const validated=cloneJsonValue(response);if(!validated.ok)return fail('INVALID_ACTOR_CONTEXT','Actor context must be bounded plain data.');
    if(validated.data.value.ok===false)return validated.data.value;
    if(validated.data.value.ok!==true)return fail('INVALID_ACTOR_CONTEXT','The actor context service must return a successful Result.');
    const context=validated.data.value.data;
    if(!exact(context,['scope','visibility','context','memories'])||!exact(context.scope,['sceneId','actorId'])||context.scope.actorId!==actorId||context.scope.sceneId!==presence.sceneId
        ||context.visibility!=='actor-private'||!Object.hasOwn(context,'context')||!privateScope(context.context,actorId)
        ||context.memories!==undefined&&(!Array.isArray(context.memories)||context.memories.length>64||context.memories.some(memory=>!exact(memory,['memoryId','actorId','visibility','text'])||!id(memory.memoryId)||memory.actorId!==actorId||memory.visibility!=='actor-private'||typeof memory.text!=='string'||memory.text.length>4096)))
        return fail('ACTOR_SCOPE_MISMATCH','The captured private material must belong to this actor and scene.');
    return {ok:true,data:context};
}
async function infer(messages,settings,local,rawInputs,snapshot) {
    if(own(local,'signal')?.aborted)return fail('ABORTED','The request was stopped.');
    if(typeof own(local,'request')!=='function')return fail('REQUEST_MISSING','Select a connected model for this Event operation.');
    if(new TextEncoder().encode(messages.map(message=>message.content).join('\n')).byteLength>65536)return fail('INPUT_LIMIT','The scoped Event prompt exceeds 65,536 UTF-8 bytes.');
    let response;try{response=await own(local,'request')({messages:freeze(messages),maxTokens:settings.maxTokens,signal:own(local,'signal')});}catch{return fail(own(local,'signal')?.aborted?'ABORTED':'REQUEST_FAILED','The Event model request failed; no retry was made.');}
    if(own(local,'signal')?.aborted)return fail('ABORTED','Ignore the stopped Event response.');
    const current=stringifyJsonValue(rawInputs);if(!current.ok||current.data.text!==snapshot)return fail('STALE_INPUT','Event evidence changed while the request was pending.');
    const validated=cloneJsonValue(response);if(!validated.ok)return fail('INVALID_RESPONSE','The Event model returned invalid plain data.');
    const value=validated.data.value;
    if(value.ok===false)return value;
    if(value.ok!==true||!plain(value.data)||typeof value.data.text!=='string'||!value.data.text.trim()||value.data.text.length>100000)return fail('INVALID_RESPONSE','The Event model requires a nonempty bounded completed response.');
    if(!['stop','eos_token','eos','stop_sequence','end_turn','complete','completed'].includes(value.data.finish))return fail(['length','max_tokens','max_output_tokens'].includes(value.data.finish)?'TRUNCATED_OUTPUT':'COMPLETION_UNVERIFIED','The Event response must have a verified complete finish reason.');
    return {ok:true,data:{text:value.data.text,...(value.data.usage?{usage:value.data.usage}:{})}};
}
async function executeEventRaw(node,namedInputs,local={}) {
    try {
        const result=resolve(node,{phase:own(local,'phase')});if(!result.ok)return result;
        const {descriptor,settings,ports}=result.data;
        if(descriptor.id==='actor-context'&&own(local,'root')!==true)return fail('ROOT_ONLY','Actor Context requires this run’s private root actor capability.');
        const validated=inputsFor(namedInputs,ports,descriptor.id);if(!validated.ok)return validated;
        const inputs=validated.data.inputs;
        if(descriptor.id==='draft-event-source') {
            const result=sourceFromDraft(own(namedInputs,'in'),inputs.scope.value);if(!result.ok)return result;
            return {ok:true,artifact:{kind:'data',value:result.data.source},reports:[{operation:descriptor.id,actualCalls:0,provenance:result.data.provenance}]};
        }
        if(descriptor.id==='event-normalize') {
            let absoluteMinute=settings.absoluteMinute;
            if(inputs.clock!==undefined){const clock=validateStoryClock(inputs.clock.value);if(!clock.ok)return clock;if(absoluteMinute!==-1&&absoluteMinute!==clock.data.absoluteMinute)return fail('CLOCK_MISMATCH','The explicit event time conflicts with the wired story clock.');absoluteMinute=clock.data.absoluteMinute;}
            const result=settings.mode==='progression'
                ?await toProgressionEvents(inputs.events.value,{...(settings.eventType?{eventType:settings.eventType}:{}),...(absoluteMinute===-1?{}:{absoluteMinute})})
                :normalizeOccurrences(inputs.source.value,inputs.candidates.value,inputs.entities.value);
            if(!result.ok)return result;
            return {ok:true,artifact:{kind:'data',value:result.data.events},reports:[{operation:descriptor.id,mode:settings.mode,actualCalls:0}]};
        }
        if(descriptor.id==='scene-presence') {
            const presence=presenceRecord(inputs.in.value,settings.actorId);if(!presence.ok)return presence;
            return {ok:true,artifact:{kind:'data',value:presence.data},reports:[{operation:descriptor.id,actualCalls:0}]};
        }
        if(descriptor.id==='item-mention-trigger') {
            const result=matchLiteralTrigger(inputs.source.value,settings,inputs.entities.value,inputs.state?.value);
            if(!result.ok)return result;
            return {ok:true,outputs:{out:{kind:'data',value:result.data.events},state:{kind:'data',value:result.data.triggerState}},reports:[{operation:descriptor.id,actualCalls:0,activationIds:result.data.activationIds}]};
        }
        if(descriptor.id==='item-use-trigger') {
            const source=inputs.source.value,entities=inputs.entities.value;
            const validatedSource=normalizeOccurrences(source,[],entities);if(!validatedSource.ok)return validatedSource;
            if(source.watch!==settings.watch)return fail('WATCH_MISMATCH','The source does not match the configured Watch.');
            let candidates=inputs.candidates?.value;
            if(settings.mode==='extract') {
                const snapshot=stringifyJsonValue(namedInputs);if(!snapshot.ok)return snapshot;
                const messages=[{role:'system',content:'Extract candidates only; never confirm them. Return exactly {"candidates":[...]}. Each candidate is {eventType:"item-used"|"item-transferred",actorId,itemId,objectId only for transfers,position:{start,end},semantics:"actual"|"mention"|"planned"|"threatened"|"recalled"|"proposed"|"uncertain"}. Spans are exact UTF-16 offsets into the supplied source text. Preserve two separate uses and intervening transfers. Use only supplied canonical IDs and target item '+settings.itemId+'. Mentioning, planning, threatening or recalling use is not actual use. '+settings.instructions},{role:'user',content:JSON.stringify({source,entities})}];
                const response=await infer(messages,settings,local,namedInputs,snapshot.data.text);if(!response.ok)return response;
                let parsed;try{parsed=JSON.parse(response.data.text);}catch{return fail('INVALID_EXTRACTION','Candidate extraction must return plain JSON.');}
                const checked=cloneJsonValue(parsed);if(!checked.ok||!exact(checked.data.value,['candidates']))return fail('INVALID_EXTRACTION','Candidate extraction requires exactly a candidates collection.');
                candidates=checked.data.value.candidates;
            }
            const normalized=normalizeOccurrences(source,candidates,entities);if(!normalized.ok)return normalized;
            if(normalized.data.events.some(event=>event.itemId!==settings.itemId||!['item-used','item-transferred'].includes(event.eventType)))return fail('INVALID_EXTRACTION','Candidates must target this item and retain uses or transfers.');
            return {ok:true,artifact:{kind:'data',value:normalized.data.events},reports:[{operation:descriptor.id,actualCalls:settings.mode==='extract'?1:0}]};
        }
        if(descriptor.id==='confirm-events') {
            let decisions=inputs.decisions.value;
            if(settings.mode==='single-gate') {
                const candidates=validateOccurrences(inputs.events.value,{status:'candidate'});if(!candidates.ok)return candidates;
                if(candidates.data.events.length!==1||!plain(decisions)||decisions.ok===false)return fail('INVALID_CONFIRMATIONS','Single Gate requires exactly one frozen candidate and a successful checked gate.');
                if(typeof decisions.accepted!=='boolean')return {ok:true,outputStates:{out:{status:'unresolved',reason:{code:'UNRESOLVED_EVENTS',message:'A probability or missing answer is not explicit gate acceptance.'}}}};
                if(!exact(decisions,['accepted','metric','metricPath','policy','decision','status']))return fail('INVALID_CONFIRMATIONS','A gate cannot replace occurrence actor, item or event identities.');
                decisions=[{eventId:candidates.data.events[0].eventId,accepted:decisions.accepted}];
            }
            const result=confirmOccurrences(inputs.events.value,decisions);
            if(!result.ok)return result.error.code==='UNRESOLVED_EVENTS'?{ok:true,outputStates:{out:{status:'unresolved',reason:result.error}}}:result;
            return {ok:true,artifact:{kind:'data',value:result.data.events},reports:[{operation:descriptor.id,actualCalls:0,rejectedIds:result.data.rejectedIds}]};
        }
        if(descriptor.id==='current-holder') {
            const result=resolveItemHolders(inputs.holders.value,inputs.events.value);if(!result.ok)return result;
            return {ok:true,outputs:{events:{kind:'data',value:result.data.events},holders:{kind:'data',value:result.data.holders}},reports:[{operation:descriptor.id,actualCalls:0}]};
        }
        const directionData=descriptor.id==='character-direction'?own(namedInputs,'data'):undefined;
        if(directionData!==undefined){const mark=artifactVisibility(inputs);if(mark.kind==='hidden'||mark.kind==='actor-private'&&mark.actorId!==settings.actorId)return fail('ACTOR_MODEL_SCOPE','Character Direction Data must be public or belong only to the selected actor.');}
        const presence=inputs.presence.value;
        const snapshot=stringifyJsonValue(namedInputs);if(!snapshot.ok)return snapshot;
        let event;
        if(descriptor.id==='prompted-memory') {
            const validated=validateOccurrences([inputs.event.value],{status:'confirmed'});if(!validated.ok)return validated;
            event=validated.data.events[0];
            if(event.holderId!==settings.actorId||event.sceneId!==presence.sceneId||!['item-used','item-mentioned'].includes(event.eventType))return fail('MEMORY_HOLDER_MISMATCH','Prompted Memory requires the participating actor holding this item at this confirmed event.');
            if(event.source.visibility==='actor-private'&&event.source.actorId!==settings.actorId)return fail('ACTOR_SCOPE_MISMATCH','This actor cannot receive another actors private trigger evidence.');
            if(settings.mode==='create'&&!settings.allowCreate)return fail('MEMORY_CREATION_NOT_ALLOWED','The workflow author must explicitly permit invented character history.');
        }
        const context=await scopedContext(presence,settings.actorId,local,own(namedInputs,'presence'),directionData);if(!context.ok||context.outputStates)return context;
        const current=stringifyJsonValue(namedInputs);if(!current.ok||current.data.text!==snapshot.data.text)return fail('STALE_INPUT','Event evidence changed while the actor context was captured.');
        if(descriptor.id==='actor-context'){
            const messages=[],omissions=[...(context.data.context.omissions??[])];let remaining=100000;
            const add=message=>{if(message.text.length>remaining){omissions.push({id:message.id,reason:'actor context budget'});return;}remaining-=message.text.length;messages.push(message);};
            for(const [field,text]of Object.entries(context.data.context.character?.fields??{}))add({id:'character:'+field,role:'system',text});
            for(const message of context.data.context.messages??[])add(message);
            for(const memory of context.data.memories??[])add({id:'memory:'+memory.memoryId,role:'system',text:memory.text});
            const checked=parseRuntimeContext({kind:'context',messages,source:{sceneId:presence.sceneId,sourceId:presence.sourceId,revision:presence.revision,actorId:settings.actorId},visibility:{kind:'actor-private',actorId:settings.actorId},report:{code:'SCOPED_ACTOR_CONTEXT',omissions}});
            return checked.ok?{ok:true,artifact:checked.data,reports:[{operation:descriptor.id,actualCalls:0,actorId:settings.actorId}]}:checked;
        }
        if(descriptor.id==='prompted-memory') {
            if(settings.mode==='recall'&&!context.data.memories?.length)return {ok:true,outputStates:{out:{status:'unresolved',reason:{code:'MEMORY_UNAVAILABLE',message:'No authorized existing memory is available for this recall.'}}}};
            const messages=[{role:'system',content:'Apply the supplied prompt only to '+settings.actorId+', the active item holder. Return exactly one of {"kind":"recalled","memoryId":supplied ID,"reflection":optional string,"direction":optional string}, {"kind":"invented","text":string,"reflection":optional string,"direction":optional string}, or {"kind":"no-match"} with no other fields when no permitted memory suits the prompt. Recall selects supplied memory identity without rewriting its stored text. Invention is permitted only when allowCreate is true and mode is create or recall-or-create. Treat all history and directions as pending actor-private proposals. '+settings.prompt},{role:'user',content:JSON.stringify({event,mode:settings.mode,allowCreate:settings.allowCreate,...context.data})}];
            const response=await infer(messages,settings,local,namedInputs,snapshot.data.text);if(!response.ok)return response;
            let parsed;try{parsed=JSON.parse(response.data.text);}catch{return fail('INVALID_MEMORY_RESPONSE','Prompted Memory must return checked JSON.');}
            const checked=cloneJsonValue(parsed);if(!checked.ok)return checked;
            const output=checked.data.value;
            if(exact(output,['kind'])&&output.kind==='no-match')return {ok:true,outputStates:{out:{status:'skipped',reason:{code:'MEMORY_NO_MATCH',message:'No authorized memory matches this item prompt.'}}},reports:[{operation:descriptor.id,actualCalls:1,actorId:settings.actorId,code:'MEMORY_NO_MATCH'}]};
            if(!exact(output,['kind','memoryId','text','reflection','direction'])||!['recalled','invented'].includes(output.kind)
                ||['reflection','direction'].some(key=>output[key]!==undefined&&(typeof output[key]!=='string'||output[key].length>4096)))return fail('INVALID_MEMORY_RESPONSE','Prompted Memory requires a bounded recalled or invented proposal.');
            let memory;
            if(output.kind==='recalled') {
                const existing=context.data.memories?.find(memory=>memory.memoryId===output.memoryId);
                if(settings.mode==='create'||!existing||output.text!==undefined)return fail('INVALID_MEMORY_RESPONSE','Recall must select an authorized existing memory without replacing its text.');
                memory={...existing,classification:'recalled'};
            } else {
                if(!settings.allowCreate||settings.mode==='recall')return fail('MEMORY_CREATION_NOT_ALLOWED','This workflow does not permit invented history.');
                if(typeof output.text!=='string'||!output.text.trim()||output.text.length>4096||output.memoryId!==undefined)return fail('INVALID_MEMORY_RESPONSE','Invented memory text must be bounded; identity comes from the confirmed occurrence.');
                const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([event.eventId,settings.actorId,own(node,'id')??'prompted-memory',settings.prompt])));
                const memoryId='memory:'+Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
                memory={memoryId,text:output.text,actorId:settings.actorId,visibility:'actor-private',classification:'invented'};
            }
            return {ok:true,artifact:{kind:'data',value:{schemaVersion:1,recordType:'prompted-memory',eventId:event.eventId,actorId:settings.actorId,sceneId:event.sceneId,visibility:'actor-private',acceptance:'pending',memory,...(output.reflection===undefined?{}:{reflection:output.reflection}),...(output.direction===undefined?{}:{direction:output.direction}),sourceRefs:[{sourceId:event.source.sourceId,revision:event.source.revision}]}},reports:[{operation:descriptor.id,actualCalls:1,actorId:settings.actorId}]};
        }
        const messages=[{role:'system',content:settings.systemPrompt+'\nWrite guidance only for '+settings.actorId+'. Preserve the player choices, common scene events and other actors. Private interpretations remain private; this output is a proposal.'},{role:'user',content:JSON.stringify(directionData===undefined?context.data:{...context.data,data:inputs.data.value})}];
        const response=await infer(messages,settings,local,namedInputs,snapshot.data.text);if(!response.ok)return response;
        return {ok:true,artifact:{kind:'guidance',text:response.data.text,scope:{actorId:settings.actorId,sceneId:presence.sceneId},visibility:'actor-private',acceptance:'pending',sourceRefs:[{sourceId:presence.sourceId,revision:presence.revision}]},reports:[{operation:descriptor.id,actualCalls:1,actorId:settings.actorId,...(response.data.usage?{usage:response.data.usage}:{})}]};
    } catch {return fail('INVALID_INPUT','Event nodes require bounded own data inputs and settings.');}
}
export async function executeEvent(node,namedInputs,local = {}) { return preserveArtifactPrivacy(await executeEventRaw(node,namedInputs,local),namedInputs); }
