import { artifactVisibility, preserveArtifactPrivacy, validVisibilityMetadata } from '../artifact-privacy.js?v=0.27.3';
import { cloneJsonValue, readJsonPath } from './json-data.js?v=0.27.3';
import { own, plain, freeze } from '../record-data.js?v=0.27.3';

const kinds = ['context', 'draft', 'patches', 'candidate', 'guidance', 'text', 'data'];
const fail = (code, message) => ({ ok: false, error: { code, message } });
const pin = (id, kind, direction, required = false) => ({ id, label: id, kind, direction, required, cardinality: 'one' });
const register = (id, title, defaults, controls) => ({ id, title, family: 'Shaping', phase: 'both', minimumSchema: 3, input: 'data', output: 'data', defaults, controls: Object.keys(defaults), controlDescriptors: controls, requestBound: 0, modelRole: null, terminal: false, dynamicPorts: true });
const control = (type, value, extra = {}) => ({ type, default: value, ...extra });
const canonical = value => Array.isArray(value) ? '['+value.map(canonical).join(',')+']' : plain(value) ? '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}' : JSON.stringify(value);
const slots = [{ id: 'base', label: 'Base', required: true }, { id: 'optional', label: 'Optional', required: false }];
export const CONTROL_OPERATIONS = {
    condition: register('condition', 'Condition', { path: [], operator: 'equals', value: true }, { path: control('array', [], { items: 'string' }), operator: control('enum', 'equals', { values: ['equals', 'not-equals', 'exists', 'nonempty', 'greater-than', 'at-least', 'less-than'] }), value: control('json-value', true) }),
    branch: register('branch', 'Branch', { artifactKind: 'data' }, { artifactKind: control('enum', 'data', { values: kinds }) }),
    join: { ...register('join', 'Join', { artifactKind: 'data', inputs: slots, selection: 'last' }, { artifactKind: control('enum', 'data', { values: kinds }), inputs: control('array', slots, { items: 'record', max: 16 }), selection: control('enum', 'last', { values: ['first','last'] }) }), acceptsSkippedInputs: true },
    collect: { ...register('collect', 'Collect', { artifactKind: 'data', inputs: slots }, { artifactKind: control('enum', 'data', { values: kinds }), inputs: control('array', slots, { items: 'record', max: 16 }) }), acceptsSkippedInputs: true },
    'confidence-gate': register('confidence-gate', 'Confidence Gate', { metricPath: [], acceptMin: 0.8, rejectMax: 0.2, direction: 'higher' }, { metricPath: control('array', [], { items: 'string' }), acceptMin: control('number', 0.8, { min: -Number.MAX_VALUE, max: Number.MAX_VALUE }), rejectMax: control('number', 0.2, { min: -Number.MAX_VALUE, max: Number.MAX_VALUE }), direction: control('enum', 'higher', { values: ['higher','lower'] }) }),
    'for-each': register('for-each', 'For Each', { helper: { id: '', version: 1, semanticHash: '' }, limit: 32, requestBoundPerIteration: 0, mode: 'map', roleOverrides: {} }, { helper: control('object', { id: '', version: 1, semanticHash: '' }), limit: control('integer', 32, { min: 1, max: 128 }), requestBoundPerIteration: control('integer', 0, { min: 0, max: 16 }), mode: control('enum', 'map', { values: ['map','projected-state'] }), roleOverrides: control('object', {}) }),
};

/** Local selectors use the same sparse profile/model binding shape as subgraph overrides. */
export function validIterationRoleOverrides(value) {
    const checked=cloneJsonValue(value);if(!checked.ok)return false;value=checked.data.value;
    if(!plain(value)||Object.keys(value).length>64)return false;
    return Object.entries(value).every(([role,binding])=>typeof role==='string'&&role.trim().length>0&&role.length<=128&&!['__proto__','prototype','constructor'].includes(role)&&plain(binding)&&Object.keys(binding).length<=2&&Object.entries(binding).every(([key,selector])=>['profileId','model'].includes(key)&&(selector===null||typeof selector==='string'&&selector.trim().length>0&&selector.length<=256)));
}
function resolve(node, options) {
    if (!plain(node) || !plain(options)) return fail('INVALID_SETTINGS', 'Control settings must be plain data.');
    const operation = own(node, 'operation'), base = Object.hasOwn(CONTROL_OPERATIONS, operation) && CONTROL_OPERATIONS[operation];
    if (!base) return fail('UNKNOWN_OPERATION', 'Unknown control operation.');
    if (own(node, 'operationVersion') !== undefined && own(node, 'operationVersion') !== 1) return fail('INVALID_SETTINGS', 'Control operation version must be 1.');
    const phase = own(options, 'phase') ?? own(node, 'phase') ?? 'pre';
    if (!['pre', 'post'].includes(phase) || own(node, 'phase') !== undefined && own(node, 'phase') !== phase) return fail('INVALID_PHASE', 'Control phase must match its effective phase.');
    const settings = {};
    for (const key of base.controls) {
        const descriptor = Object.getOwnPropertyDescriptor(node, key);
        if (descriptor && (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))) return fail('INVALID_SETTINGS', 'Controls require own data properties.');
        const checked = cloneJsonValue(descriptor ? descriptor.value : base.defaults[key]);
        if (!checked.ok) return fail('INVALID_SETTINGS', 'Controls require bounded JSON data.');
        settings[key] = checked.data.value;
    }
    let ports, descriptor = { ...base, phase, controlDescriptors: { ...base.controlDescriptors } };
    if (operation === 'for-each') {
        const helper=settings.helper;
        if(!plain(helper)||Object.keys(helper).length!==3||typeof helper.id!=='string'||!helper.id.trim()||helper.id.length>128||!Number.isSafeInteger(helper.version)||helper.version<1||!/^sha256:[0-9a-f]{64}$/.test(helper.semanticHash)||!Number.isSafeInteger(settings.limit)||settings.limit<1||settings.limit>128||!Number.isSafeInteger(settings.requestBoundPerIteration)||settings.requestBoundPerIteration<0||settings.requestBoundPerIteration>16||!['map','projected-state'].includes(settings.mode))return fail('INVALID_SETTINGS','For Each requires a pinned helper, 1–128 iterations and 0–16 requests per iteration.');
        if(!validIterationRoleOverrides(settings.roleOverrides))return fail('INVALID_SETTINGS','For Each role overrides require up to 64 named roles with only bounded profile/model selectors.');
        descriptor={...descriptor,requestBound:settings.limit*settings.requestBoundPerIteration};
        ports=[pin('in','data','input',true),pin('state','data','input',settings.mode==='projected-state'),pin('out','data','output'),pin('state','data','output')];
    } else if (operation === 'confidence-gate') {
        if(!Array.isArray(settings.metricPath)||settings.metricPath.length>32||settings.metricPath.some(key=>typeof key!=='string')||!Number.isFinite(settings.acceptMin)||!Number.isFinite(settings.rejectMax)||!['higher','lower'].includes(settings.direction)||settings.direction==='higher'&&settings.rejectMax>=settings.acceptMin||settings.direction==='lower'&&settings.acceptMin>=settings.rejectMax)return fail('INVALID_SETTINGS','Declare an explicit metric path, direction and nonoverlapping acceptance thresholds.');
        ports=[pin('in','data','input',true),...['accepted','rejected','unresolved'].map(id=>pin(id,'data','output'))];
    } else if (operation === 'condition') {
        if (!Array.isArray(settings.path) || settings.path.length > 32 || settings.path.some(key => typeof key !== 'string') || !base.controlDescriptors.operator.values.includes(settings.operator)) return fail('INVALID_SETTINGS', 'Condition requires a bounded path and supported comparison.');
        descriptor.controlDescriptors.value = control('json-value', settings.value);
        ports = [pin('in', 'data', 'input', true), pin('out', 'data', 'output')];
    } else if (['join','collect'].includes(operation)) {
        if (!kinds.includes(settings.artifactKind) || !Array.isArray(settings.inputs) || settings.inputs.length<1 || settings.inputs.length>16 || settings.inputs.some(slot=>!plain(slot)||typeof slot.id!=='string'||!slot.id||slot.id.length>128||slot.id==='out'||typeof slot.label!=='string'||slot.label.length>80||typeof slot.required!=='boolean'||Object.keys(slot).some(key=>!['id','label','required'].includes(key))) || new Set(settings.inputs.map(slot=>slot.id)).size!==settings.inputs.length || operation==='join'&&!['first','last'].includes(settings.selection)) return fail('INVALID_SETTINGS','Join requires 1–16 unique typed input slots with explicit required flags.');
        descriptor={...descriptor,input:settings.artifactKind,output:operation==='join'?settings.artifactKind:'data'};
        ports=[...settings.inputs.map(slot=>({...pin(slot.id,settings.artifactKind,'input',slot.required),label:slot.label})),pin('out',descriptor.output,'output')];
    } else {
        if (!kinds.includes(settings.artifactKind)) return fail('INVALID_SETTINGS', 'Select a declared artifact kind.');
        descriptor = { ...descriptor, input: settings.artifactKind, output: settings.artifactKind };
        ports = [pin('in', settings.artifactKind, 'input', true), pin('condition', 'data', 'input', true), ...['yes', 'no', 'unresolved'].map(id => pin(id, settings.artifactKind, 'output'))];
    }
    return { ok: true, data: { descriptor, ports, settings } };
}
export function describeControl(node, options = {}) {
    try { const result = resolve(node, options); if (!result.ok) return result; const { descriptor, ports } = result.data; return { ok: true, data: { descriptor, ports } }; }
    catch { return fail('INVALID_SETTINGS', 'Control settings could not be inspected.'); }
}
async function executeControlRaw(node, inputs, local = {}) {
    try {
        const checked = resolve(node, { phase: local.phase ?? own(node, 'phase') ?? 'pre' }); if (!checked.ok) return checked;
        const { settings } = checked.data;
        if (!plain(inputs)) return fail('INVALID_INPUT', 'Expected named control inputs.');
        if(node.operation==='for-each')return executeForEach(settings,inputs,local);
        if(node.operation==='confidence-gate') {
            if(own(inputs.in,'kind')!=='data')return fail('INVALID_INPUT','Confidence Gate requires a typed Data decision.');
            const decision=cloneJsonValue(own(inputs.in,'value'));if(!decision.ok)return decision;
            const selected=readJsonPath(decision.data.value,settings.metricPath);if(!selected.ok)return selected;
            const metric=selected.data.found&&Number.isFinite(selected.data.value)?selected.data.value:null;
            const accepted=metric===null?undefined:settings.direction==='higher'?metric>=settings.acceptMin?true:metric<=settings.rejectMax?false:undefined:metric<=settings.acceptMin?true:metric>=settings.rejectMax?false:undefined;
            const route=accepted===true?'accepted':accepted===false?'rejected':'unresolved';
            const artifact={kind:'data',value:{decision:decision.data.value,...(accepted===undefined?{}:{accepted}),metric,metricPath:settings.metricPath,policy:{direction:settings.direction,acceptMin:settings.acceptMin,rejectMax:settings.rejectMax}}};
            return {ok:true,outputs:{[route]:artifact},outputStates:Object.fromEntries(['accepted','rejected','unresolved'].filter(id=>id!==route).map(id=>[id,{status:'skipped',reason:{code:'GATE_NOT_SELECTED',message:'Another confidence route was selected.'}}]))};
        }
        if(['join','collect'].includes(node.operation)) {
            const retained=[];
            for(const slot of settings.inputs){const state=own(local.inputStates,slot.id),status=own(state,'status')??(Object.hasOwn(inputs,slot.id)?'completed':slot.required?'unresolved':'skipped');
                if(status==='unresolved'||slot.required&&status==='skipped')return {ok:true,outputStates:{out:{status:status==='skipped'?'skipped':'unresolved',reason:own(state,'reason')??{code:'JOIN_INPUT_MISSING',message:'A required contribution has not completed.'}}}};
                if(status==='skipped')continue;
                if(status!=='completed'||own(inputs[slot.id],'kind')!==settings.artifactKind)return fail('INVALID_INPUT','Join contributions must match their typed slots.');
                retained.push(inputs[slot.id]);
            }
            if(node.operation==='join')return retained.length?{ok:true,outputs:{out:retained[settings.selection==='first'?0:retained.length-1]}}:{ok:true,outputStates:{out:{status:'skipped',reason:{code:'EMPTY_JOIN',message:'No contribution was selected.'}}}};
            const checkedValues=cloneJsonValue(retained.map(artifact=>settings.artifactKind==='data'?artifact.value:artifact));if(!checkedValues.ok)return checkedValues;
            return {ok:true,outputs:{out:{kind:'data',value:checkedValues.data.value}}};
        }
        if (node.operation === 'condition') {
            if (own(inputs.in, 'kind') !== 'data') return fail('INVALID_INPUT', 'Condition requires Data.');
            const selected = readJsonPath(own(inputs.in, 'value'), settings.path); if (!selected.ok) return selected;
            const { found, value } = selected.data;
            if (!found && settings.operator !== 'exists') return { ok: true, outputStates: { out: { status: 'unresolved', reason: { code: 'CONDITION_MISSING', message: 'The comparison path has no value.' } } } };
            let accepted;
            if (settings.operator === 'exists') accepted = found;
            else if (settings.operator === 'nonempty') accepted = typeof value === 'string' || Array.isArray(value) ? value.length > 0 : plain(value) ? Object.keys(value).length > 0 : false;
            else if (['equals', 'not-equals'].includes(settings.operator)) { accepted = canonical(value) === canonical(settings.value); if (settings.operator === 'not-equals') accepted = !accepted; }
            else {
                if (typeof value !== 'number' || typeof settings.value !== 'number') return fail('INVALID_COMPARISON', 'Ordered comparisons require finite numbers.');
                accepted = settings.operator === 'greater-than' ? value > settings.value : settings.operator === 'at-least' ? value >= settings.value : value < settings.value;
            }
            return { ok: true, outputs: { out: { kind: 'data', value: { accepted, actual: value ?? null, operator: settings.operator } } } };
        }
        if (own(inputs.in, 'kind') !== settings.artifactKind || own(inputs.condition, 'kind') !== 'data') return fail('INVALID_INPUT', 'Branch requires its declared artifact and a Data decision.');
        const decision = own(inputs.condition, 'value'), accepted = typeof decision === 'boolean' ? decision : own(decision, 'accepted');
        const route = accepted === true ? 'yes' : accepted === false ? 'no' : 'unresolved';
        return { ok: true, outputs: { [route]: inputs.in }, outputStates: Object.fromEntries(['yes', 'no', 'unresolved'].filter(id => id !== route).map(id => [id, { status: 'skipped', reason: { code: 'BRANCH_NOT_SELECTED', message: 'Another branch was selected.' } }])) };
    } catch { return fail('INVALID_INPUT', 'Control inputs require bounded own data.'); }
}

/** A pinned helper is resolved by the trusted graph adapter; this engine owns ordering and limits. */
async function executeForEach(settings,inputs,local) {
    if(own(inputs.in,'kind')!=='data')return fail('INVALID_INPUT','For Each requires a Data collection.');
    const collection=cloneJsonValue(own(inputs.in,'value'));if(!collection.ok)return collection;
    if(!Array.isArray(collection.data.value))return fail('INVALID_INPUT','For Each requires an array collection.');
    if(collection.data.value.length>settings.limit)return fail('ITERATION_LIMIT','The collection exceeds the authored iteration bound.');
    let projectedState;
    if(Object.hasOwn(inputs,'state')){if(own(inputs.state,'kind')!=='data')return fail('INVALID_INPUT','Projected state requires Data.');const checked=cloneJsonValue(own(inputs.state,'value'));if(!checked.ok)return checked;projectedState=checked.data.value;}
    if(settings.mode==='projected-state'&&projectedState===undefined)return fail('MISSING_INPUT','Projected-state iteration requires its explicit initial state.');
    if(local.signal?.aborted)return fail('ABORTED','Iteration was stopped.');
    if(collection.data.value.length&&typeof local.iterateHelper!=='function')return fail('ITERATION_HELPER_MISSING','Bind the pinned iteration helper before execution.');
    const results=[], disclosure=[{visibility:artifactVisibility(inputs)}];
    for(let index=0;index<collection.data.value.length;index++) {
        if(local.signal?.aborted)return fail('ABORTED','Iteration was stopped.');
        let calls=0,requestFailure,pendingRequest,active=true;
        const request=options=>{
            if(!active)return Promise.resolve(fail('ITERATION_CLOSED','This iteration request capability has closed.'));
            if(pendingRequest)return Promise.resolve(requestFailure=fail('ITERATION_REQUEST_IN_PROGRESS','A helper request must settle before another starts.'));
            pendingRequest=dispatch(options).finally(()=>{pendingRequest=undefined;});return pendingRequest;
        };
        const dispatch=async options=>{
            if(local.signal?.aborted)return requestFailure=fail('ABORTED','Iteration was stopped.');
            if(calls>=settings.requestBoundPerIteration)return requestFailure=fail('ITERATION_CALL_LIMIT','The iteration request bound was reached.');
            calls++;
            if(typeof local.request!=='function')return requestFailure=fail('REQUEST_MISSING','Iteration requires the bounded root request adapter.');
            let response;try{response=await local.request({...options,iteration:{index,helper:settings.helper,...(own(options,'childAddress')===undefined?{}:{childAddress:own(options,'childAddress')})}});}catch{return requestFailure=fail('REQUEST_FAILED','The iteration request failed.');}if(!response?.ok)requestFailure=response??fail('INVALID_RESPONSE','Iteration request returned no result.');return response;
        };
        let result;
        try {result=await local.iterateHelper(freeze({helper:structuredClone(settings.helper),item:collection.data.value[index],index,visibility:artifactVisibility(disclosure),...(projectedState===undefined?{}:{projectedState}),phase:local.phase??'pre',rootMode:local.rootMode??'native-pre',...(local.address?{address:local.address}:{})}),{request,...(local.signal?{signal:local.signal}:{})});}
        catch {active=false;if(pendingRequest)await pendingRequest;return fail(local.signal?.aborted?'ABORTED':'ITERATION_HELPER_FAILED','The iteration helper failed; no partial result was published.');}
        active=false;if(pendingRequest)await pendingRequest;
        if(local.signal?.aborted)return fail('ABORTED','Ignore the stopped iteration result.');
        if(requestFailure&&!(result?.ok===true&&typeof local.isRecoveredIterationResult==='function'&&local.isRecoveredIterationResult(result)===true))return requestFailure;
        if(result?.ok!==true)return result?.ok===false?result:fail('INVALID_ITERATION_RESULT','The iteration helper returned an invalid Result.');
        const artifact=own(result,'artifact');
        if(!plain(artifact)||own(artifact,'kind')!=='data'||!validVisibilityMetadata(artifact))return fail('INVALID_ITERATION_RESULT','Iteration helpers must return Data results with valid disclosure metadata.');
        disclosure.push({visibility:artifactVisibility(artifact)});
        const value=cloneJsonValue(own(artifact,'value'));if(!value.ok)return value;results.push(value.data.value);
        if(settings.mode==='projected-state'){const stateVisibility=own(result,'projectedStateVisibility');if(stateVisibility!==undefined){if(!validVisibilityMetadata({visibility:stateVisibility}))return fail('INVALID_ITERATION_RESULT','Projected state must carry valid disclosure metadata.');disclosure.push({visibility:stateVisibility});}disclosure.push({visibility:artifactVisibility(own(result,'projectedState'))});const checked=cloneJsonValue(own(result,'projectedState'));if(!checked.ok)return fail('INVALID_PROJECTION','Each stateful iteration must return checked next projected state.');projectedState=checked.data.value;}
    }
    const checkedResults=cloneJsonValue(results);if(!checkedResults.ok)return checkedResults;
    return preserveArtifactPrivacy({ok:true,outputs:{out:{kind:'data',value:checkedResults.data.value},...(projectedState===undefined?{}:{state:{kind:'data',value:projectedState}})},...(projectedState===undefined?{outputStates:{state:{status:'skipped',reason:{code:'NO_PROJECTED_STATE',message:'Map mode supplied no state.'}}}}:{})},disclosure);
}

export async function executeControl(node,inputs,local = {}) { return preserveArtifactPrivacy(await executeControlRaw(node,inputs,local),inputs); }
