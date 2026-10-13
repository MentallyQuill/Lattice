import { preserveArtifactPrivacy, validVisibilityMetadata, artifactVisibility } from '../artifact-privacy.js?v=0.27.1';
import { cloneJsonValue, stringifyJsonValue } from './json-data.js?v=0.27.1';
import { validateOccurrences } from './event-data.js?v=0.27.1';
import { own, plain, freeze, safeUsage } from '../record-data.js?v=0.27.1';
import { workflowDataPresetFor } from '../workflow-data-defaults.js?v=0.27.1';

const fail=(code,message)=>({ok:false,error:{code,message}});
const exact=(value,keys)=>plain(value)&&Object.keys(value).every(key=>keys.includes(key));
const id=value=>typeof value==='string'&&!!value.trim()&&value.length<=256;
const revision=value=>id(value)||Number.isSafeInteger(value)&&value>=1;
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':plain(value)?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const hash=async value=>'sha256:'+Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)))),value=>value.toString(16).padStart(2,'0')).join('');
function validEffect(effect) {
    return exact(effect,['id','kind','weight','eligible','description','spellOutcome','duration','consequence'])
        &&id(effect.id)&&['fixed','generate'].includes(effect.kind)&&typeof effect.weight==='number'&&Number.isFinite(effect.weight)&&effect.weight>=0
        &&(effect.eligible===undefined||typeof effect.eligible==='boolean')
        &&(effect.kind!=='fixed'||typeof effect.description==='string'&&!!effect.description.trim()&&effect.description.length<=4096)
        &&(effect.kind!=='generate'||effect.description===undefined&&effect.spellOutcome===undefined&&effect.duration===undefined&&effect.consequence===undefined)
        &&(effect.spellOutcome===undefined||['success','failure','replaced'].includes(effect.spellOutcome))
        &&['duration','consequence'].every(key=>effect[key]===undefined||typeof effect[key]==='string'&&!!effect[key].trim()&&effect[key].length<=4096);
}
/** JSON uses the documented effects shape; text supports weights, @generate markers, comments and uniform lines. */
export function parseEffectLibrary(raw,rawSettings={}) {
    const settingsResult=cloneJsonValue(rawSettings);if(!settingsResult.ok)return settingsResult;
    const settings=settingsResult.data.value;
    if(!exact(settings,['format','libraryId','revision','itemId','mechanicalPolicy'])||settings.format!==undefined&&!['data','json','text'].includes(settings.format))return fail('INVALID_EFFECT_LIBRARY','Use data, JSON or plain text library settings.');
    const format=settings.format??(typeof raw==='string'?'json':'data');
    let value;
    if(format==='data') {const checked=cloneJsonValue(raw);if(!checked.ok)return fail('INVALID_EFFECT_LIBRARY','Effect libraries require bounded plain JSON.');value=checked.data.value;}
    else {
        if(typeof raw!=='string'||raw.length>100000)return fail('INVALID_EFFECT_LIBRARY','Effect source text must be bounded.');
        if(format==='json'){try{value=JSON.parse(raw);}catch{return fail('INVALID_EFFECT_LIBRARY','The effect source is not valid JSON.');}}
        else {
            const effects=[];
            const lines=raw.split(/\r?\n/);
            for(let index=0;index<lines.length;index++) {
                let description=lines[index].trim();if(!description||description.startsWith('#'))continue;
                let weight=1;
                const split=description.indexOf('|');
                if(split>=0) {
                    const prefix=description.slice(0,split).trim();
                    if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(prefix))return fail('INVALID_EFFECT_LIBRARY','Weighted text lines require a nonnegative numeric weight before |.');
                    weight=Number(prefix);description=description.slice(split+1).trim();
                }
                if(description.startsWith('@generate:'))effects.push({id:description.slice(10).trim(),kind:'generate',weight});
                else effects.push({id:'line-'+(index+1),kind:'fixed',weight,description:description.startsWith('\\@generate:')?description.slice(1):description});
            }
            value={effects};
        }
        const checked=cloneJsonValue(value);if(!checked.ok)return fail('INVALID_EFFECT_LIBRARY','Parsed effect source exceeds JSON limits.');value=checked.data.value;
    }
    if(!exact(value,['libraryId','revision','itemId','effects','mechanicalPolicy']))return fail('INVALID_EFFECT_LIBRARY','Effect libraries require a known metadata and effects schema.');
    for(const key of ['libraryId','revision','itemId'])if(value[key]!==undefined&&settings[key]!==undefined&&value[key]!==settings[key])return fail('LIBRARY_SCOPE_MISMATCH','Configured effect library identity must match its source.');
    const library={libraryId:value.libraryId??settings.libraryId,revision:value.revision??settings.revision,itemId:value.itemId??settings.itemId,effects:value.effects,mechanicalPolicy:value.mechanicalPolicy??settings.mechanicalPolicy??'narrative-only'};
    if(!id(library.libraryId)||!revision(library.revision)||!id(library.itemId)||!['narrative-only','require-mechanics'].includes(library.mechanicalPolicy)
        ||!Array.isArray(library.effects)||!library.effects.length||library.effects.length>128||library.effects.some(effect=>!validEffect(effect))
        ||new Set(library.effects.map(effect=>effect.id)).size!==library.effects.length)return fail('INVALID_EFFECT_LIBRARY','Validate every entry, unique ID, authored kind and weight before drawing.');
    if(library.mechanicalPolicy==='require-mechanics'&&library.effects.some(effect=>effect.kind==='fixed'&&['spellOutcome','duration','consequence'].some(key=>effect[key]===undefined)))return fail('INVALID_EFFECT_LIBRARY','This library requires explicit spell outcome, duration and consequence for every fixed effect.');
    const eligible=library.effects.filter(effect=>effect.eligible!==false&&effect.weight>0);
    const totalWeight=eligible.reduce((sum,effect)=>sum+effect.weight,0);
    if(!eligible.length||!Number.isFinite(totalWeight)||totalWeight<=0)return fail('INVALID_EFFECT_LIBRARY','The eligible library must contain positive finite total weight.');
    const checked=cloneJsonValue(library);if(!checked.ok)return fail('INVALID_EFFECT_LIBRARY','The effect library exceeds portable JSON limits.');
    return {ok:true,data:{library:checked.data.value,eligible,totalWeight}};
}
function outcomeIdentity(event,library,rerollId) {
    return 'outcome:'+JSON.stringify([event.eventId,library.libraryId,library.revision,rerollId??null]);
}
export async function validateRandomOutcome(raw) {
    const cloned=cloneJsonValue(raw);if(!cloned.ok)return cloned;
    const value=cloned.data.value;
    if(!exact(value,['schemaVersion','recordType','outcomeId','event','library','libraryFingerprint','selection','draw','effect','status','acceptance','rerollId','author','novelty'])
        ||value.schemaVersion!==1||value.recordType!=='random-outcome'||!['drawn','proposed','resolved'].includes(value.status)
        ||!['pending','accepted'].includes(value.acceptance)||value.rerollId!==undefined&&!id(value.rerollId))return fail('INVALID_SAVED_OUTCOME','Saved random outcomes require checked identity and pending/accepted status.');
    const events=validateOccurrences([value.event],{status:'confirmed'});if(!events.ok)return fail('INVALID_SAVED_OUTCOME','Saved outcomes require unchanged confirmed occurrences.');
    const library=parseEffectLibrary(value.library);if(!library.ok)return fail('INVALID_SAVED_OUTCOME','Saved outcomes require their original frozen library.');
    const event=events.data.events[0];
    if(event.eventType!=='item-used'||event.semantics!=='actual'||event.holderId!==event.actorId||event.itemId!==library.data.library.itemId
        ||value.outcomeId!==outcomeIdentity(event,library.data.library,value.rerollId)||value.libraryFingerprint!==await hash(library.data.library)
        ||!exact(value.draw,['unit','totalWeight','index'])||!Number.isFinite(value.draw.unit)||value.draw.unit<0||value.draw.unit>=1
        ||value.draw.totalWeight!==library.data.totalWeight||!Number.isSafeInteger(value.draw.index)||value.draw.index<0||value.draw.index>=library.data.eligible.length
        ||canonical(value.selection)!==canonical(library.data.eligible[value.draw.index]))return fail('INVALID_SAVED_OUTCOME','The saved occurrence, selected entry and library revision must remain consistent.');
    let expectedIndex=library.data.eligible.length-1,cumulative=0;
    for(let index=0;index<library.data.eligible.length;index++){cumulative+=library.data.eligible[index].weight;if(value.draw.unit*library.data.totalWeight<cumulative){expectedIndex=index;break;}}
    if(expectedIndex!==value.draw.index)return fail('INVALID_SAVED_OUTCOME','The saved draw does not identify its selected entry.');
    if(value.selection.kind==='fixed') {
        const effect={id:value.selection.id,description:value.selection.description,...(value.selection.spellOutcome===undefined?{}:{spellOutcome:value.selection.spellOutcome}),...(value.selection.duration===undefined?{}:{duration:value.selection.duration}),...(value.selection.consequence===undefined?{}:{consequence:value.selection.consequence})};
        if(value.status!=='resolved'||canonical(value.effect)!==canonical(effect)||value.author!==undefined||value.novelty!==undefined)return fail('INVALID_SAVED_OUTCOME','Fixed selections preserve their authored effect.');
    } else if(value.status==='drawn'&&value.effect!==undefined||value.status!=='drawn'&&!validInvention(value.effect,library.data.library))return fail('INVALID_SAVED_OUTCOME','Generated outcome state must retain a valid distinct invented effect.');
    if(value.selection.kind==='generate'&&value.status==='resolved'&&(!exact(value.novelty,['accepted'])||value.novelty.accepted!==true))return fail('INVALID_SAVED_OUTCOME','Generated effects require explicit accepted novelty before resolution.');
    return {ok:true,data:{outcome:value}};
}
function validInvention(effect,library) {
    return exact(effect,['id','description','spellOutcome','duration','consequence'])&&id(effect.id)&&typeof effect.description==='string'&&!!effect.description.trim()&&effect.description.length<=4096
        &&['success','failure','replaced'].includes(effect.spellOutcome)&&['duration','consequence'].every(key=>typeof effect[key]==='string'&&!!effect[key].trim()&&effect[key].length<=4096)
        &&!library.effects.some(entry=>entry.id===effect.id||entry.description?.trim().toLocaleLowerCase()===effect.description.trim().toLocaleLowerCase());
}
/** A retry reuses the original library and draw. A new reroll identity requires explicit authored reroll policy. */
export async function selectRandomOutcomes(rawEvents,rawLibrary,rawSaved=[],ports={}) {
    try {
        const eventResult=validateOccurrences(rawEvents,{status:'confirmed'});if(!eventResult.ok)return eventResult;
        const parsed=parseEffectLibrary(rawLibrary);if(!parsed.ok)return parsed;
        const events=eventResult.data.events,library=parsed.data.library;
        if(events.some(event=>event.eventType!=='item-used'||event.semantics!=='actual'||event.holderId!==event.actorId||event.itemId!==library.itemId))return fail('INVALID_RANDOM_EVENT','Random effects require actual confirmed uses by the resolved holder of this exact item.');
        const rerollId=own(ports,'rerollId'),rerollPolicy=own(ports,'rerollPolicy');
        if(rerollId!==undefined&&(!id(rerollId)||rerollPolicy!=='explicit')||rerollId===undefined&&rerollPolicy!==undefined)return fail('REROLL_POLICY_REQUIRED','A deliberate redraw requires its own reroll identity and explicit policy.');
        const savedResult=cloneJsonValue(rawSaved);if(!savedResult.ok||!Array.isArray(savedResult.data.value)||savedResult.data.value.length>256)return fail('INVALID_SAVED_OUTCOME','Saved outcomes must be a bounded collection.');
        const snapshot=stringifyJsonValue({events:rawEvents,library:rawLibrary,saved:rawSaved});if(!snapshot.ok)return snapshot;
        const saved=[];
        for(const raw of savedResult.data.value){const validated=await validateRandomOutcome(raw);if(!validated.ok)return validated;saved.push(validated.data.outcome);}
        if(new Set(saved.map(value=>value.outcomeId)).size!==saved.length)return fail('INVALID_SAVED_OUTCOME','Saved outcome identities must be unique.');
        const selections=events.map(event=>{
            const matching=saved.filter(value=>value.event.eventId===event.eventId&&(value.rerollId??null)===(rerollId??null));
            if(matching.length>1)return fail('OUTCOME_CONFLICT','One occurrence cannot have multiple outcomes for the same reroll identity.');
            const prior=matching[0];
            if(prior&&(canonical(prior.event)!==canonical(event)||prior.library.libraryId!==library.libraryId))return fail('OUTCOME_CONFLICT','The saved outcome belongs to different attributed evidence or library.');
            return {ok:true,event,prior};
        });
        const error=selections.find(value=>!value.ok);if(error)return error;
        const fingerprint=await hash(library);
        if(selections.some(value=>value.prior&&value.prior.library.revision===library.revision&&value.prior.libraryFingerprint!==fingerprint))return fail('LIBRARY_REVISION_CONFLICT','Changing a library requires a new revision; a retry preserves its original snapshot.');
        const current=stringifyJsonValue({events:rawEvents,library:rawLibrary,saved:rawSaved});if(!current.ok||current.data.text!==snapshot.data.text)return fail('STALE_INPUT','Random evidence or library changed during validation.');
        if(own(ports,'signal')?.aborted)return fail('ABORTED','Random outcomes were stopped.');
        const random=own(ports,'random');if(selections.some(value=>!value.prior)&&typeof random!=='function')return fail('RANDOM_MISSING','Supply the trusted runtime randomness capability.');
        // Check every eligible projection with the portable UTF-8, depth and node limits.
        // This 24-character unit encoding reserves five leading zeros and 17 significant digits.
        // Any mixed selection has no more bytes or nodes than one of these uniform projections.
        for(const entry of parsed.data.eligible) {
            const maximum=selections.map(selection=>selection.prior??createOutcome(selection.event,library,fingerprint,entry,127,0.0000011111111111111112,parsed.data.totalWeight,rerollId));
            if(!cloneJsonValue({outcomes:maximum,draws:256,actualCalls:0}).ok)return fail('OUTCOME_LIMIT','The selected occurrence collection cannot safely retain every possible draw; reduce the collection or library.');
        }
        const outcomes=[];let draws=0;
        for(const selection of selections) {
            if(selection.prior){outcomes.push(selection.prior);continue;}
            let unit;try{unit=random();}catch{return fail('RANDOM_FAILED','The runtime random source failed.');}
            if(!Number.isFinite(unit)||unit<0||unit>=1)return fail('INVALID_RANDOM_DRAW','Runtime randomness must return a finite unit value in [0,1).');
            let index=parsed.data.eligible.length-1,cumulative=0;
            for(let next=0;next<parsed.data.eligible.length;next++){cumulative+=parsed.data.eligible[next].weight;if(unit*parsed.data.totalWeight<cumulative){index=next;break;}}
            const entry=parsed.data.eligible[index],event=selection.event;
            const outcome=createOutcome(event,library,fingerprint,entry,index,unit,parsed.data.totalWeight,rerollId);
            outcomes.push(outcome);draws++;
        }
        const checked=cloneJsonValue({outcomes,draws,actualCalls:0});if(!checked.ok)return fail('OUTCOME_LIMIT','The saved outcome collection exceeds portable bounds; no model request was made.');
        return {ok:true,data:freeze(checked.data.value)};
    }catch{return fail('INVALID_RANDOM_INPUT','Random selection requires bounded data and trusted capabilities.');}
}
function effectFor(entry) {
    return {id:entry.id,description:entry.description,...(entry.spellOutcome===undefined?{}:{spellOutcome:entry.spellOutcome}),...(entry.duration===undefined?{}:{duration:entry.duration}),...(entry.consequence===undefined?{}:{consequence:entry.consequence})};
}
function createOutcome(event,library,fingerprint,entry,index,unit,totalWeight,rerollId) {
    return {schemaVersion:1,recordType:'random-outcome',outcomeId:outcomeIdentity(event,library,rerollId),event,library,libraryFingerprint:fingerprint,selection:entry,draw:{unit,totalWeight,index},status:entry.kind==='fixed'?'resolved':'drawn',acceptance:'pending',...(rerollId===undefined?{}:{rerollId}),...(entry.kind==='fixed'?{effect:effectFor(entry)}:{})};
}
const pin=(id,kind,direction,required=false)=>({id,label:id,kind,direction,required,cardinality:'one'});
const string=(value,maxLength=256)=>({type:'string',default:value,maxLength});
const register=(id,title,defaults,controls,extra={})=>({id,title,family:'Randomness',phase:'both',minimumSchema:3,minimumRuntime:2,operationVersion:1,input:'data',output:'data',defaults,controls:Object.keys(defaults),controlDescriptors:controls,requestBound:0,modelRole:null,terminal:false,dynamicPorts:true,...extra});
export const RANDOM_OPERATIONS = {
    'parse-effect-library':register('parse-effect-library','Effect Library',{format:'json',libraryId:'',revision:'',itemId:'',mechanicalPolicy:'narrative-only'},{format:{type:'enum',default:'json',values:['data','json','text']},libraryId:string(''),revision:string(''),itemId:string(''),mechanicalPolicy:{type:'enum',default:'narrative-only',values:['narrative-only','require-mechanics']}}),
    'random-pick':register('random-pick','Random Pick',{rerollPolicy:'reuse',rerollId:'',ledgerId:''},{rerollPolicy:{type:'enum',default:'reuse',values:['reuse','explicit']},rerollId:string(''),ledgerId:{...string(''),label:'Outcomes ID (optional)'}}),
    'commit-outcomes':register('commit-outcomes','Outcome Commit',{targetId:workflowDataPresetFor('commit-outcomes').targetId},{targetId:string(workflowDataPresetFor('commit-outcomes').targetId)},{family:'Output',phase:'post',rootOnly:true,hostOperation:true,terminal:true}),
    'saved-outcome':register('saved-outcome','Saved Outcome',{},{}),
    'effect-author':register('effect-author','Effect Author',{instructions:'',maxTokens:2048},{instructions:string('',4096),maxTokens:{type:'integer',default:2048,min:1,max:8192}},{requestBound:1,modelRole:'effectAuthor'}),
    'stage-outcome':register('stage-outcome','Stage Outcome',{},{}),
};
function resolve(node,options={}) {
    if(!plain(node)||!plain(options))return fail('INVALID_SETTINGS','Use plain node metadata.');
    for(const [value,keys] of [[node,['operation','operationVersion','phase','type']],[options,['phase']]])for(const key of keys) {
        const property=Object.getOwnPropertyDescriptor(value,key);
        if(property&&(!property.enumerable||!Object.hasOwn(property,'value')))return fail('INVALID_SETTINGS','Routing metadata requires own data properties.');
    }
    if(!plain(node)||!plain(options))return fail('INVALID_SETTINGS','Use plain Random node settings.');
    const operation=own(node,'operation'),base=Object.hasOwn(RANDOM_OPERATIONS,operation)&&RANDOM_OPERATIONS[operation];
    if(!base||own(node,'operationVersion')!==undefined&&own(node,'operationVersion')!==1)return fail('UNKNOWN_OPERATION','Unknown Random operation.');
    const phase=own(options,'phase')??own(node,'phase')??(base.phase==='post'?'post':'pre');
    if(!['pre','post'].includes(phase)||own(node,'phase')!==undefined&&own(node,'phase')!==phase)return fail('INVALID_PHASE','Random node phase must match its effective phase.');
    if(base.phase==='post'&&phase!=='post')return fail('INVALID_PHASE','Outcome Commit is a Post operation.');
    const settings={};
    for(const key of base.controls) {
        const property=Object.getOwnPropertyDescriptor(node,key);if(property&&(!property.enumerable||!Object.hasOwn(property,'value')))return fail('INVALID_SETTINGS','Controls require own data properties.');
        const value=cloneJsonValue(property?property.value:base.defaults[key]);if(!value.ok)return value;settings[key]=value.data.value;
        const control=base.controlDescriptors[key];
        if(control.type==='string'&&(typeof settings[key]!=='string'||settings[key].length>control.maxLength)
            ||control.type==='enum'&&!control.values.includes(settings[key])
            ||control.type==='integer'&&(!Number.isSafeInteger(settings[key])||settings[key]<control.min||settings[key]>control.max))return fail('INVALID_SETTINGS','Use supported bounded Random controls.');
    }
    if(operation==='commit-outcomes'&&settings.targetId==='')settings.targetId=base.defaults.targetId;
    let ports;
    if(operation==='commit-outcomes') {if(!id(settings.targetId))return fail('INVALID_SETTINGS','Choose an authorized outcomes source.');ports=[pin('outcomes','data','input',true),pin('receipt','data','output')];}
    else if(operation==='parse-effect-library') {
        if(!id(settings.libraryId)||!id(settings.revision)||!id(settings.itemId))return fail('INVALID_SETTINGS','Supply explicit library, revision and item identities.');
        ports=[pin('in',settings.format==='data'?'data':'text','input',true),pin('out','data','output')];
    } else if(operation==='random-pick')ports=[pin('events','data','input',true),pin('library','data','input',true),pin('saved','data','input'),pin('out','data','output')];
    else if(operation==='saved-outcome')ports=[pin('event','data','input',true),pin('saved','data','input',true),pin('out','data','output')];
    else ports=[pin('in','data','input',true),...(operation==='effect-author'?[pin('context','data','input')]:[pin('novelty','data','input')]),pin('out','data','output')];
    if(operation==='random-pick'&&(settings.rerollPolicy==='explicit'&&!id(settings.rerollId)||settings.rerollPolicy==='reuse'&&settings.rerollId!==''))return fail('REROLL_POLICY_REQUIRED','Explicit reroll mode requires an authored reroll identity; reuse leaves it empty.');
    return {ok:true,data:{descriptor:{...base,phase,input:ports[0].kind},ports,settings}};
}
export function describeRandom(node,options={}) {
    const result=resolve(node,options);if(!result.ok)return result;return {ok:true,data:{descriptor:result.data.descriptor,ports:result.data.ports}};
}
function checkedInputs(raw,ports) {
    const result=cloneJsonValue(raw);if(!result.ok)return result;const inputs=result.data.value;
    const allowed=ports.filter(port=>port.direction==='input');
    if(!plain(inputs)||Object.keys(inputs).some(key=>!allowed.some(port=>port.id===key)))return fail('INVALID_INPUT','Use declared named Random inputs.');
    for(const port of allowed) {
        if(!Object.hasOwn(inputs,port.id)){if(port.required)return fail('MISSING_INPUT','Required input is missing: '+port.id);continue;}
        const artifact=inputs[port.id];
        if(!exact(artifact,port.kind==='text'?['kind','text','visibility']:['kind','value','visibility'])||!validVisibilityMetadata(artifact)||artifact.kind!==port.kind
            ||port.kind==='text'&&(typeof artifact.text!=='string'||artifact.text.length>100000)
            ||port.kind==='data'&&!Object.hasOwn(artifact,'value'))return fail('INVALID_INPUT','The Random input must match its declared artifact kind.');
    }
    return {ok:true,data:{inputs}};
}
async function executeRandomRaw(node,namedInputs,local={}) {
    try {
        const described=resolve(node,{phase:own(local,'phase')});if(!described.ok)return described;
        const {descriptor,ports,settings}=described.data;
        const checked=checkedInputs(namedInputs,ports);if(!checked.ok)return checked;
        const inputs=checked.data.inputs,snapshot=stringifyJsonValue(namedInputs);if(!snapshot.ok)return snapshot;
        if(own(local,'signal')?.aborted)return fail('ABORTED','The Random operation was stopped.');
        if(descriptor.id==='parse-effect-library') {
            const result=parseEffectLibrary(settings.format==='data'?inputs.in.value:inputs.in.text,settings);if(!result.ok)return result;
            return {ok:true,artifact:{kind:'data',value:result.data.library},reports:[{operation:descriptor.id,actualCalls:0}]};
        }
        if(descriptor.id==='random-pick') {
            const nativeSelect=own(local,'selectNativeRandomOutcomes');
            if(nativeSelect!==undefined&&typeof nativeSelect!=='function')return fail('RANDOM_FAILED','Native selection requires a trusted host capability.');
            const result=nativeSelect?await nativeSelect({events:inputs.events.value,library:inputs.library.value,saved:inputs.saved?.value??[],ledgerId:settings.ledgerId,visibility:artifactVisibility(namedInputs),...(settings.rerollPolicy==='explicit'?{rerollId:settings.rerollId}:{})}):await selectRandomOutcomes(inputs.events.value,inputs.library.value,inputs.saved?.value??[],{random:own(local,'random'),signal:own(local,'signal'),...(settings.rerollPolicy==='explicit'?{rerollId:settings.rerollId,rerollPolicy:'explicit'}:{})});if(!result.ok)return result;
            const latest=stringifyJsonValue(namedInputs);if(own(local,'signal')?.aborted)return fail('ABORTED','Random selection was stopped.');if(!latest.ok||latest.data.text!==snapshot.data.text)return fail('STALE_INPUT','Random selection evidence changed during capture.');
            return {ok:true,artifact:{kind:'data',value:result.data.outcomes,...(result.data.visibility?{visibility:result.data.visibility}:{})},reports:[{operation:descriptor.id,actualCalls:0,draws:result.data.draws}]};
        }
        if(descriptor.id==='commit-outcomes') {
            if(own(local,'root')!==true)return fail('ROOT_ONLY','Outcome Commit requires a root workflow.');
            const stage=own(local,'stageNativeOutcomes');if(typeof stage!=='function')return fail('HOST_OPERATION_REQUIRED','Outcome Commit requires a trusted accepted-state host.');
            const staged=await stage(settings.targetId,namedInputs.outcomes.value);if(own(local,'signal')?.aborted)return fail('ABORTED','Outcome staging was stopped.');
            if(staged?.ok!==true)return fail('OUTCOME_COMMIT_FAILED','The resolved native outcomes could not be staged; verify their event sources and authorized outcome data.');
            const bounded=cloneJsonValue(staged.data);if(!bounded.ok)return fail('OUTCOME_COMMIT_FAILED','Outcome staging requires a bounded descriptive receipt.');
            const receipt={kind:'data',value:bounded.data.value};return {ok:true,artifact:receipt,outputs:{receipt},reports:[{operation:descriptor.id,actualCalls:0,status:'staged'}]};
        }
        if(descriptor.id==='saved-outcome') {
            const eventResult=validateOccurrences([inputs.event.value],{status:'confirmed'});if(!eventResult.ok)return eventResult;
            if(!Array.isArray(inputs.saved.value)||inputs.saved.value.length>256)return fail('INVALID_SAVED_OUTCOME','Saved Outcome requires a bounded outcome collection.');
            const matches=[];
            for(const raw of inputs.saved.value){const result=await validateRandomOutcome(raw);if(!result.ok)return result;if(result.data.outcome.event.eventId===inputs.event.value.eventId)matches.push(result.data.outcome);}
            if(matches.length>1)return fail('OUTCOME_CONFLICT','Select an explicit reroll identity before resolving multiple outcomes.');
            if(matches.length&&canonical(matches[0].event)!==canonical(eventResult.data.events[0]))return fail('OUTCOME_CONFLICT','The saved outcome attribution does not match this occurrence.');
            return {ok:true,artifact:{kind:'data',value:{found:matches.length===1,outcome:matches[0]??null}},reports:[{operation:descriptor.id,actualCalls:0}]};
        }
        const validated=await validateRandomOutcome(inputs.in.value);if(!validated.ok)return validated;
        let outcome=validated.data.outcome;
        const reuse=own(local,'reuseNativeOutcome');
        if(descriptor.id==='effect-author'&&reuse!==undefined){if(typeof reuse!=='function')return fail('OUTCOME_REUSE_FAILED','Outcome reuse requires a trusted host capability.');const reused=reuse(outcome);if(!reused?.ok)return fail('OUTCOME_REUSE_FAILED','The retained draw source changed.');if(reused.data){const retained=await validateRandomOutcome(reused.data);if(!retained.ok)return retained;outcome=retained.data.outcome;}}
        const current=stringifyJsonValue(namedInputs);if(!current.ok||current.data.text!==snapshot.data.text)return fail('STALE_INPUT','Outcome material changed during validation.');
        if(descriptor.id==='stage-outcome') {
            if(outcome.status==='resolved')return {ok:true,artifact:{kind:'data',value:outcome},reports:[{operation:descriptor.id,actualCalls:0}]};
            const accepted=inputs.novelty?.value?.accepted;
            if(outcome.status!=='proposed'||accepted!==true)return {ok:true,outputStates:{out:{status:'unresolved',reason:{code:outcome.status!=='proposed'?'OUTCOME_NOT_AUTHORED':accepted===false?'NOVELTY_REJECTED':'NOVELTY_UNRESOLVED',message:'A wild effect needs an authored proposal and explicit accepted novelty judgment.'}}}};
            return {ok:true,artifact:{kind:'data',value:{...outcome,status:'resolved',novelty:{accepted:true}}},reports:[{operation:descriptor.id,actualCalls:0}]};
        }
        if(outcome.status!=='drawn')return {ok:true,artifact:{kind:'data',value:outcome},reports:[{operation:descriptor.id,actualCalls:0,reused:true}]};
        if(typeof own(local,'request')!=='function')return fail('REQUEST_MISSING','Select the separate effect-author model connection.');
        const messages=[{role:'system',content:'Invent one mechanically distinct effect for this already selected generated branch. Preserve this cast, actor, item and player choice; do not add another cast. Return exactly {id,description,spellOutcome:"success"|"failure"|"replaced",duration,consequence}; each descriptive field is a nonempty string of at most 4096 characters. Its ID and description must differ from every listed effect. This is a proposal awaiting a separate semantic novelty decision. '+settings.instructions},{role:'user',content:JSON.stringify({outcome,...(inputs.context?{context:inputs.context.value}:{})})}];
        if(new TextEncoder().encode(messages.map(message=>message.content).join('\n')).byteLength>65536)return fail('INPUT_LIMIT','The effect-author prompt exceeds 65,536 UTF-8 bytes.');
        let response;try{response=await own(local,'request')({messages:freeze(messages),maxTokens:settings.maxTokens,signal:own(local,'signal')});}catch{return fail(own(local,'signal')?.aborted?'ABORTED':'REQUEST_FAILED','The effect author failed; retain the existing draw for retry.');}
        if(own(local,'signal')?.aborted)return fail('ABORTED','Ignore the stopped effect-author response.');
        const latest=stringifyJsonValue(namedInputs);if(!latest.ok||latest.data.text!==snapshot.data.text)return fail('STALE_INPUT','The cast or saved draw changed during effect authoring.');
        const parsedResponse=cloneJsonValue(response);if(!parsedResponse.ok)return fail('INVALID_RESPONSE','The effect author returned malformed plain data.');
        const value=parsedResponse.data.value;if(value.ok===false){const errors={HTTP_ERROR:'The effect author service failed; retain the existing draw for retry.',TRUNCATED_OUTPUT:'The effect author reached its completion limit; retain the existing draw for retry.',COMPLETION_UNVERIFIED:'The effect author response did not expose verified completion.',ABORTED:'Effect authoring was stopped.',REQUEST_FAILED:'The effect author failed; retain the existing draw for retry.'};const code=Object.hasOwn(errors,value.error?.code)?value.error.code:'REQUEST_FAILED';return fail(code,errors[code]);}
        if(value.ok!==true||!plain(value.data)||typeof value.data.text!=='string'||value.data.text.length>100000)return fail('INVALID_RESPONSE','The effect author requires bounded completed JSON text.');
        if(!['stop','eos_token','eos','stop_sequence','end_turn','complete','completed'].includes(value.data.finish))return fail(['length','max_tokens','max_output_tokens'].includes(value.data.finish)?'TRUNCATED_OUTPUT':'COMPLETION_UNVERIFIED','The effect author must complete before its proposal can be used.');
        let effect;try{effect=JSON.parse(value.data.text);}catch{return fail('INVALID_EFFECT_RESPONSE','The effect author must return plain JSON.');}
        const effectResult=cloneJsonValue(effect);if(!effectResult.ok||!validInvention(effectResult.data.value,outcome.library))return fail('INVALID_EFFECT_RESPONSE','The invented effect must satisfy the authored structure and exact novelty checks.');
        const authored={...outcome,effect:effectResult.data.value,status:'proposed',author:{operation:'effect-author',instructionsFingerprint:await hash(settings.instructions)}};
        const bounded=cloneJsonValue(authored);if(!bounded.ok)return fail('OUTCOME_LIMIT','The authored outcome exceeds portable bounds; retain the saved draw.');
        return {ok:true,artifact:{kind:'data',value:bounded.data.value},reports:[{operation:descriptor.id,actualCalls:1,...(safeUsage(value.data.usage)?{usage:Object.fromEntries(Object.entries(safeUsage(value.data.usage)).filter(([,count])=>Number.isSafeInteger(count)))}:{})}]};
    } catch {return fail('INVALID_RANDOM_INPUT','Random operations require bounded own data and trusted capabilities.');}
}
export async function executeRandom(node,namedInputs,local = {}) {
    const result=preserveArtifactPrivacy(await executeRandomRaw(node,namedInputs,local),namedInputs);
    if(result.ok&&result.artifact&&['effect-author','stage-outcome'].includes(node.operation)){
        try {const retain=own(local,'retainNativeOutcome');if(retain!==undefined){if(typeof retain!=='function')return fail('OUTCOME_RETENTION_FAILED','Outcome retention requires a trusted host capability.');const retained=await retain({parent:namedInputs.in.value,result:result.artifact.value});if(!retained?.ok)return fail('OUTCOME_RETENTION_FAILED','The retained draw source changed during authoring.');}}catch{return fail('OUTCOME_RETENTION_FAILED','The native outcome could not be retained.');}
    }
    return result;
}
