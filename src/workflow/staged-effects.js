import { cloneJsonValue } from './operations/json-data.js?v=0.27.2';
const fail=(code,message)=>({ok:false,error:{code,message}});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const id=value=>typeof value==='string'&&value.trim().length>0&&value.length<=256;
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
function own(value){const checked=cloneJsonValue(value);return checked.ok?checked.data.value:null;}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function portResult(raw){const value=own(raw);if(!plain(value)||typeof value.ok!=='boolean')return fail('INVALID_EFFECT_RESULT','The effect capability must return a bounded Result.');if(!value.ok)return plain(value.error)&&id(value.error.code)&&typeof value.error.message==='string'&&!Object.hasOwn(value,'data')?fail(value.error.code,value.error.message):fail('INVALID_EFFECT_RESULT','The effect failure is malformed.');return Object.hasOwn(value,'error')?fail('INVALID_EFFECT_RESULT','The effect success contains an error.'):{ok:true,data:value.data};}
async function invoke(port,...args){try{return portResult(await port(...args));}catch{return fail('EFFECT_CAPABILITY_FAILED','The staged capability failed.');}}
function trustedConfig(raw){
    try{
        if(!plain(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return {};
        const descriptors=Object.getOwnPropertyDescriptors(raw),allowed=['scope','originalEvidence','isCurrent','validateFinal','publish','signal'];
        if(Reflect.ownKeys(raw).some(key=>typeof key!=='string'||!allowed.includes(key)||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value')))return {};
        return Object.fromEntries(Object.entries(descriptors).map(([key,property])=>[key,property.value]));
    }catch{return {};}
}
function validSignal(signal){try{return signal===undefined||typeof Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(signal)==='boolean';}catch{return false;}}
/** Private host callbacks survive review. This bundle never reruns graphs, models or randomness. */
export function createStagedEffects(config){
    config=trustedConfig(config);
    const scope=own(config.scope),originalEvidence=own(config.originalEvidence),entries=new Map(),targets=new Map();
    const valid=plain(scope)&&Object.keys(scope).every(key=>['userId','chatId','actorId'].includes(key))&&id(scope.userId)&&id(scope.chatId)&&(!Object.hasOwn(scope,'actorId')||id(scope.actorId))&&validSignal(config.signal)&&originalEvidence!==null&&['validateFinal','publish','isCurrent'].every(key=>typeof config[key]==='function');
    let rejected=false,sealed=false,published=false,publicationUnknown=false,publication=null,acceptedEvidence=null,queue=Promise.resolve();
    const current=()=>{
        if(!valid)return fail('INVALID_EFFECT_CONFIG','Staged settlement requires a captured scope, evidence and trusted lifecycle callbacks.');
        if(rejected)return fail('EFFECTS_REJECTED','The proposed effects were rejected.');
        try{if(config.signal?.aborted)return fail('CANCELLED','Staged settlement was cancelled.');if(config.isCurrent()!==true)return fail('STALE_EFFECT_SCOPE','The captured workflow or user/chat scope changed.');}catch{return fail('STALE_EFFECT_SCOPE','The captured effect authority could not be checked.');}
        if(publicationUnknown)return fail('PUBLICATION_UNKNOWN','The prior publication outcome is unknown; reconcile it before retrying.');
        return {ok:true};
    };
    function stage(raw){
        const available=current();if(!available.ok)return available;if(published)return fail('EFFECTS_ALREADY_PUBLISHED','Accepted effects cannot acquire new intents during persistence recovery.');if(sealed)return fail('EFFECTS_SEALED','Acceptance has sealed this effect set; validate a new bundle to change it.');
        let value;
        try{
            if(!plain(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return fail('INVALID_STAGED_EFFECT','Use own plain effect metadata and trusted callbacks.');
            const descriptors=Object.getOwnPropertyDescriptors(raw);
            if(Reflect.ownKeys(raw).some(key=>typeof key!=='string'||!['intentId','targetId','proposed','preflight','commit'].includes(key)||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value')))return fail('INVALID_STAGED_EFFECT','Effect settings require known own data fields.');
            value=Object.fromEntries(Object.entries(descriptors).map(([key,property])=>[key,property.value]));
        }catch{return fail('INVALID_STAGED_EFFECT','The effect could not be inspected.');}
        const proposed=own(value.proposed);
        if(!id(value.intentId)||!id(value.targetId)||proposed===null||typeof value.preflight!=='function'||typeof value.commit!=='function')return fail('INVALID_STAGED_EFFECT','An effect requires stable intent/target identities, proposed data and trusted persistence callbacks.');
        const fingerprint=canonical({targetId:value.targetId,proposed}),previous=entries.get(value.intentId);
        if(previous)return previous.fingerprint===fingerprint?{ok:true,data:freeze({intentId:value.intentId,status:'staged'})}:fail('EFFECT_ID_CONFLICT','This intent identity refers to a different proposed update.');
        if(targets.has(value.targetId))return fail('DUPLICATE_EFFECT_TARGET','Combine updates to one target into one prepared projection before staging.');
        if(entries.size>=64)return fail('EFFECT_BUNDLE_LIMIT','The bounded effect collection is full.');
        const preview=[...entries.values()].map(({intentId,targetId,proposed,receipt})=>({intentId,targetId,proposed,receipt})).concat([{intentId:value.intentId,targetId:value.targetId,proposed,receipt:null}]);
        if(!cloneJsonValue({ok:true,data:{published,rejected,effects:preview}}).ok)return fail('EFFECT_BUNDLE_LIMIT','The combined proposed effects exceed the review bound.');
        entries.set(value.intentId,{...value,proposed:freeze(proposed),fingerprint,receipt:null});targets.set(value.targetId,value.intentId);
        return {ok:true,data:freeze({intentId:value.intentId,status:'staged'})};
    }
    const successful=entry=>['confirmed','save-unverified','unknown','unchanged'].includes(entry.receipt?.status);
    async function settleChecked(flags){
        const available=current();if(!available.ok)return available;
        if(flags.root!==true||flags.accepted!==true||flags.preview===true||flags.dryRun===true)return fail('EFFECT_ACCEPTANCE_REQUIRED','Canonical effects require accepted root settlement.');
        if(!plain(flags.finalEvidence))return fail('INVALID_FINAL_EVIDENCE','Final selected narrative evidence is required.');
        const finalKey=canonical(flags.finalEvidence);
        if(published&&finalKey!==acceptedEvidence)return fail('FINAL_EVIDENCE_CHANGED','Persistence recovery must keep the accepted final narrative unchanged.');
        const verified=await invoke(config.validateFinal,freeze({scope,originalEvidence,finalEvidence:flags.finalEvidence,effects:[...entries.values()].map(({intentId,targetId,proposed})=>({intentId,targetId,proposed}))}));
        if(!verified.ok)return verified;if(verified.data!==undefined)return fail('INVALID_EFFECT_RESULT','Final evidence validation must return Result<void>.');
        const afterValidation=current();if(!afterValidation.ok)return afterValidation;
        const pending=[...entries.values()].filter(entry=>!successful(entry));
        for(const entry of pending){
            const checked=await invoke(entry.preflight);const stillCurrent=current();if(!stillCurrent.ok)return stillCurrent;
            if(!checked.ok){
                if(!published)return checked;
                entry.receipt=freeze({intentId:entry.intentId,targetId:entry.targetId,status:'failed',error:checked.error});
            }else if(!plain(checked.data)||!['ready','confirmed','unchanged'].includes(checked.data.status))return fail('INVALID_EFFECT_RESULT','Preflight must explicitly report ready or confirmed.');
            else entry.receipt=freeze({intentId:entry.intentId,targetId:entry.targetId,status:['confirmed','unchanged'].includes(checked.data.status)?checked.data.status:'ready'});
        }
        if(!published){
            let outcome;try{outcome=portResult(await config.publish(flags.finalEvidence));}catch{publicationUnknown=true;return fail('PUBLICATION_UNKNOWN','Publication threw without a verified outcome; no effects were persisted.');}
            if(!outcome.ok){if(outcome.error.code==='INVALID_EFFECT_RESULT'){publicationUnknown=true;return fail('PUBLICATION_UNKNOWN','Publication returned a malformed result; reconcile its application before retrying.');}return outcome;}
            if(!plain(outcome.data)||outcome.data.appliedLocally!==true){publicationUnknown=true;return fail('PUBLICATION_UNKNOWN','Publication did not verify local application; no effects were persisted.');}
            published=true;publication=freeze(outcome.data);acceptedEvidence=finalKey;
        }
        for(const entry of pending){
            if(entry.receipt?.status!=='ready')continue;
            const before=current();if(!before.ok){entry.receipt=freeze({intentId:entry.intentId,targetId:entry.targetId,status:'failed',error:before.error});continue;}
            let committed;
            try{committed=portResult(await entry.commit(freeze({root:true,accepted:true})));}
            catch{committed={ok:true,data:{status:'unknown',applied:null,acknowledged:false,error:{code:'EFFECT_WRITE_UNKNOWN',message:'The persistence callback threw without a verified outcome.'}}};}
            if(!committed.ok&&committed.error.code==='INVALID_EFFECT_RESULT')committed={ok:true,data:{status:'unknown',applied:null,acknowledged:false,error:committed.error}};
            if(!committed.ok)entry.receipt=freeze({intentId:entry.intentId,targetId:entry.targetId,status:'failed',error:committed.error});
            else if(!plain(committed.data)||!['confirmed','save-unverified','unknown','unchanged'].includes(committed.data.status))entry.receipt=freeze({intentId:entry.intentId,targetId:entry.targetId,status:'unknown',error:{code:'INVALID_EFFECT_RESULT',message:'Persistence returned no verified status.'}});
            else entry.receipt=freeze({...committed.data,intentId:entry.intentId,targetId:entry.targetId});
        }
        const receipts=[...entries.values()].map(entry=>entry.receipt);
        const status=receipts.some(receipt=>!['confirmed','save-unverified','unknown','unchanged'].includes(receipt?.status))?'partial':receipts.some(receipt=>!['confirmed','unchanged'].includes(receipt.status))?'save-unverified':'settled';
        return {ok:true,data:freeze({status,published:true,publication,receipts})};
    }
    function settle(raw={}){
        const flags=own(raw);
        if(!plain(flags)||Object.keys(flags).some(key=>!['root','accepted','preview','dryRun','finalEvidence'].includes(key)||key!=='finalEvidence'&&typeof flags[key]!=='boolean'))return Promise.resolve(fail('INVALID_EFFECT_CONTROLS','Settlement requires known own lifecycle controls and final evidence.'));
        freeze(flags);if(flags.root===true&&flags.accepted===true&&flags.preview!==true&&flags.dryRun!==true&&plain(flags.finalEvidence))sealed=true;const pending=queue.then(()=>settleChecked(flags));queue=pending.catch(()=>{});return pending;
    }
    function reject(){rejected=true;return {ok:true,data:freeze({published,receipts:[...entries.values()].map(entry=>entry.receipt),status:published?'rejected-after-publication':'rejected'})};}
    function inspect(){const view={ok:true,data:{published,rejected,effects:[...entries.values()].map(({intentId,targetId,proposed,receipt})=>({intentId,targetId,proposed,receipt}))}};const checked=cloneJsonValue(view);return checked.ok?freeze(checked.data.value):fail('EFFECT_PREVIEW_LIMIT','The complete effect preview exceeds its bounded data contract.');}
    return Object.freeze({stage,settle,reject,inspect});
}