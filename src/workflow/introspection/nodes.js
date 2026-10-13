import { ownData, inspectCapabilities, fail, freeze, parseRecord, makeRecord } from './contracts.js?v=0.27.1';
import { reflect, internalize, express } from './analysis.js?v=0.27.1';
import { shapeContext, advanceState } from './context-state.js?v=0.27.1';
import { parseRuntimeContext } from '../operations/context-data.js?v=0.27.1';
import { PROGRESSION_STATE_MODES, describeProgressionState, executeProgressionState } from '../operations/progression-nodes.js?v=0.27.1';

const MODES = { reflect: ['character','recall','scene'], internalize: ['experience','pattern','recovery'], express: ['behavior','attention','inner-voice'], context: ['assemble','perspective','focus'], memory: ['read','recall','commit'], state: ['value','curve','track',...PROGRESSION_STATE_MODES] };
const COMMON = ['mode'];
const CONTROLS = {
    reflect: ['maxTokens','instructions'], internalize: ['maxTokens','instructions'], express: ['maxTokens','instructions'],
    'context:assemble':['inputCount'], 'context:perspective':['actorId'], 'context:focus':['method','targetTokens','maxTokens','keepRecent','pins','purpose'],
    'memory:read':['view'], 'memory:recall':['query','limit'], 'memory:commit':['idempotencyKey'],
    'state:value':['updates','min','max'], 'state:curve':['curveId','steps','decay','baseline','durations'], 'state:track':['trackId'], 'state:progression':[], 'state:time-decay':[],
};
const DEFAULTS = {
    reflect:{mode:'character',maxTokens:2048,instructions:''}, internalize:{mode:'experience',maxTokens:2048,instructions:''}, express:{mode:'behavior',maxTokens:2048,instructions:''},
    'context:assemble':{mode:'assemble',inputCount:2}, 'context:perspective':{mode:'perspective',actorId:''}, 'context:focus':{mode:'focus',method:'select',targetTokens:1200,maxTokens:1024,keepRecent:2,pins:[],purpose:''},
    'memory:read':{mode:'read',view:'state'}, 'memory:recall':{mode:'recall',query:'',limit:8}, 'memory:commit':{mode:'commit',idempotencyKey:''},
    'state:value':{mode:'value',min:0,max:1}, 'state:curve':{mode:'curve',curveId:'emotion',steps:1,decay:0.25,baseline:0,durations:{onset:1,peak:1,plateau:1,decline:1,aftermath:1}}, 'state:track':{mode:'track',trackId:'consequences'}, 'state:progression':{mode:'progression'}, 'state:time-decay':{mode:'time-decay'},
};
const id = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
const boundedText = value => typeof value === 'string' && value.length <= 4096;
const integer = (value,min,max) => Number.isSafeInteger(value) && value >= min && value <= max;
const map = value => value && typeof value === 'object' && !Array.isArray(value);
const enumControl = values => ({type:'enum',values});
function parseNode(node) {
    const checked = ownData(node); if (!checked.ok) return checked;
    const n = checked.data;
    if (!map(n) || n.type !== 'workflow' || n.operationVersion !== 1 || !Object.hasOwn(MODES,n.operation)) return fail('INVALID_SETTINGS','Expected a version-1 introspection workflow node.');
    const mode = n.mode ?? MODES[n.operation][0];
    if (!MODES[n.operation].includes(mode) || (n.id !== undefined && !id(n.id))) return fail('INVALID_SETTINGS','Unsupported mode or node identity.');
    const key = CONTROLS[n.operation] ? n.operation : `${n.operation}:${mode}`;
    const controls = [...COMMON,...CONTROLS[key]];
    if (Object.keys(n).some(name => !['type','operation','operationVersion','id',...controls].includes(name))) return fail('INVALID_SETTINGS','Unknown control for this introspection mode.');
    const settings = { ...structuredClone(DEFAULTS[key]), ...Object.fromEntries(controls.filter(name => Object.hasOwn(n,name)).map(name => [name,n[name]])), mode };
    let valid = true;
    if (['reflect','internalize','express'].includes(n.operation)) valid = integer(settings.maxTokens,1,65536) && boundedText(settings.instructions);
    else if (key === 'context:assemble') valid = integer(settings.inputCount,2,16);
    else if (key === 'context:perspective') valid = id(settings.actorId);
    else if (key === 'context:focus') valid = ['select','compress'].includes(settings.method) && integer(settings.targetTokens,1,65536) && integer(settings.maxTokens,1,65536) && integer(settings.keepRecent,0,1000) && boundedText(settings.purpose) && Array.isArray(settings.pins) && settings.pins.length <= 64 && settings.pins.every(pin => boundedText(pin) && pin.length > 0);
    else if (key === 'memory:read') valid = ['state','events','episodes'].includes(settings.view);
    else if (key === 'memory:recall') valid = boundedText(settings.query) && integer(settings.limit,1,64);
    else if (key === 'memory:commit') valid = id(settings.idempotencyKey);
    else if (key === 'state:value') valid = Number.isFinite(settings.min) && Number.isFinite(settings.max) && settings.min <= settings.max && (settings.updates === undefined || (map(settings.updates) && Object.keys(settings.updates).length <= 32 && Object.entries(settings.updates).every(([key,value])=>id(key) && Number.isFinite(value) && value >= settings.min && value <= settings.max)));
    else if (key === 'state:curve') valid = id(settings.curveId) && integer(settings.steps,1,64) && Number.isFinite(settings.decay) && settings.decay >= 0 && settings.decay <= 1 && Number.isFinite(settings.baseline) && map(settings.durations) && Object.entries(settings.durations).every(([phase,duration])=>['onset','peak','plateau','decline','aftermath'].includes(phase) && integer(duration,1,64));
    else if (key === 'state:track') valid = id(settings.trackId);
    return valid ? {ok:true,data:{node:n,settings,controls}} : fail('INVALID_SETTINGS','Control values exceed their bounds or use an unsupported shape.');
}
function port(id,kind,required=true) { return {id,label:id,kind,direction:'input',required,cardinality:'one'}; }
function describe(parsed,phase) {
    const {node,settings,controls} = parsed, op = node.operation, mode = settings.mode;
    const requestBound = ['reflect','internalize'].includes(op) || (op === 'express' && mode === 'inner-voice') || (op === 'context' && mode === 'focus' && settings.method === 'compress') ? 1 : 0;
    const modelRole = requestBound ? (op === 'express' ? 'Prose' : 'Analysis') : null;
    const terminal = op === 'memory' && mode === 'commit';
    const rootOnly = op === 'memory';
    const output = op === 'context' ? 'context' : op === 'express' ? (mode === 'inner-voice' ? 'text' : 'guidance') : 'data';
    let ports = [];
    if (op === 'reflect') ports = [port('context','context'),port('state','data',false),port('episodes','data',false)];
    if (op === 'internalize') ports = [port('state','data'),port('events','data')];
    if (op === 'express') ports = [port('assessment','data'),port('state','data',false),port('events','data',false),port('episodes','data',false),port('context','context',false)];
    if (op === 'context') ports = mode === 'assemble' ? Array.from({length:settings.inputCount},(_,i)=>port(`in${i+1}`,'context')) : [port('context','context')];
    if (terminal) ports = [port('proposal','data')];
    const genericState = op === 'state' && PROGRESSION_STATE_MODES.includes(mode);
    if (op === 'state') ports = genericState ? describeProgressionState(settings).data.ports : [port('state','data',false),...(mode === 'track' ? [port('events','data')] : [])];
    if (!genericState) ports.push({id:'out',label:output,kind:output,direction:'output',required:false,cardinality:'one'});
    const controlDescriptors = Object.fromEntries(controls.map(name => [name, name === 'mode' ? enumControl(MODES[op]) : {type:['updates','durations','pins'].includes(name) ? 'json' : typeof settings[name] === 'number' ? 'number' : 'text',default:structuredClone(settings[name] ?? {})}]));
    return freeze({ok:true,data:{descriptor:{id:op,title:op[0].toUpperCase()+op.slice(1),family:'Introspection',phase:terminal ? 'post' : 'both',minimumSchema:3,dynamicPorts:true,input:ports.some(p=>p.direction==='input') ? ports[0].kind : null,output,requestBound,modelRole,terminal,rootOnly,modes:[...MODES[op]],controls,defaults:settings,controlDescriptors},ports}});
}
export const INTROSPECTION_OPERATIONS = freeze(Object.entries(MODES).map(([id,modes])=>({id,title:id[0].toUpperCase()+id.slice(1),family:'Introspection',minimumSchema:3,dynamicPorts:true,modes,defaults:{mode:modes[0]}})));
export function describeIntrospection(node,options={}) {
    const parsed = parseNode(node); if (!parsed.ok) return parsed;
    const checked = ownData(options);
    if (!checked.ok || !map(checked.data) || Object.keys(checked.data).some(key=>key!=='phase') || (checked.data.phase !== undefined && !['pre','post'].includes(checked.data.phase))) return fail('INVALID_SETTINGS','Unsupported execution phase.');
    if (parsed.data.node.operation === 'memory' && parsed.data.settings.mode === 'commit' && checked.data.phase === 'pre') return fail('INVALID_PHASE','Memory Commit settles only after a successful root run.');
    return describe(parsed.data,checked.data.phase);
}
export async function executeIntrospection(node,namedInputs={},ports={}) {
    try {
        const parsed = parseNode(node); if (!parsed.ok) return parsed;
        const capabilities = inspectCapabilities(ports); if (!capabilities.ok) return capabilities; ports=capabilities.data;
        const description = describeIntrospection(node,{...(ports.phase ? {phase:ports.phase} : {})}); if (!description.ok) return description;
        const inputs = ownData(namedInputs); if (!inputs.ok || !map(inputs.data)) return fail('INVALID_INPUT','Expected bounded plain named inputs.');
        const fingerprint = JSON.stringify(inputs.data);
        const {node:n,settings} = parsed.data, input = inputs.data;
        if (n.operation === 'state' && PROGRESSION_STATE_MODES.includes(settings.mode)) {
            const result = executeProgressionState(settings,input,ports);
            return result.ok ? {...result,reports:[...result.reports,{code:'INTROSPECTION_EXECUTION',operation:n.operation,mode:settings.mode,requests:0}]} : result;
        }
        const known = description.data.ports.filter(p=>p.direction==='input');
        if (Object.keys(inputs.data).some(key=>!known.some(p=>p.id===key))) return fail('INVALID_INPUT','Unknown named input.');
        for (const p of known) {
            const value = inputs.data[p.id];
            if (value === undefined) { if (p.required) return fail('MISSING_INPUT',`Missing ${p.id}.`); continue; }
            const valid = p.kind === 'context' ? parseRuntimeContext(value) : parseRecord(value);
            if (!valid.ok) return valid;
        }
        if (ports.signal?.aborted) return fail('ABORTED','Introspection was stopped.');
        if (description.data.descriptor.rootOnly && ports.root === false) return fail('ROOT_ONLY','Memory operations require the root graph.');
        let calls = 0;
        const local = {...ports,request:async request=>{
            if (ports.signal?.aborted) return fail('ABORTED','Introspection was stopped.');
            if (calls >= description.data.descriptor.requestBound) return fail('CALL_LIMIT','Introspection request bound exceeded.');
            if (typeof ports.request !== 'function') return fail('SERVICE_UNAVAILABLE','A resolved model request service is required.');
            calls++;
            return ports.request(request);
        }};
        let result;
        const optional = Object.fromEntries(['state','events','episodes','context'].filter(key=>Object.hasOwn(input,key)).map(key=>[key,input[key]]));
        if (n.operation === 'reflect') result = await reflect(input.context,settings,{...local,...optional});
        else if (n.operation === 'internalize') result = await internalize(input.state,input.events,settings,local);
        else if (n.operation === 'express') result = await express(input.assessment,settings,{...local,...optional});
        else if (n.operation === 'context') result = await shapeContext(input,settings,local);
        else if (n.operation === 'memory') {
            if (settings.mode === 'commit') {
                const proposal = parseRecord(input.proposal,'state-proposal'); if (!proposal.ok) return proposal;
                const intent = makeRecord('commit-intent',proposal.data,{proposal:proposal.data,idempotencyKey:settings.idempotencyKey},proposal.data.sourceRefs);
                result = intent.ok ? {ok:true,artifact:intent.data,reports:[]} : intent;
            } else {
                const method = settings.mode === 'read' ? ports.memory?.read : ports.memory?.recall;
                if (typeof method !== 'function') return fail('SERVICE_UNAVAILABLE','A scoped memory service is required.');
                result = await method.call(ports.memory, settings.mode === 'read' ? {view:settings.view} : {query:settings.query,limit:settings.limit});
            }
        } else {
            let state = input.state;
            if (!state) {
                if (typeof ports.memory?.read !== 'function') return fail('MISSING_INPUT','State needs an explicit snapshot or scoped memory service.');
                const read = await ports.memory.read({view:'state'}); if (!read.ok) return read; state = read.artifact;
            }
            result = advanceState(state,settings,input.events);
        }
        if (ports.signal?.aborted) return fail('ABORTED','Introspection was stopped.');
        const latest = ownData(namedInputs);
        if (!latest.ok || JSON.stringify(latest.data) !== fingerprint) return fail('STALE_INPUT','Named inputs changed while introspection was pending.');
        if (!result?.ok) return result?.error ? result : fail('INVALID_RESULT','Introspection service returned no verified result.');
        if (result.artifact?.kind !== description.data.descriptor.output) return fail('INVALID_RESULT','Introspection output kind differs from its descriptor.');
        if (result.artifact.kind === 'data') { const valid=parseRecord(result.artifact); if (!valid.ok) return valid; result={...result,artifact:{kind:'data',value:valid.data}}; }
        return {...result,reports:[...(result.reports ?? []),{code:'INTROSPECTION_EXECUTION',operation:n.operation,mode:settings.mode,requests:calls}]};
    } catch { return fail('INTROSPECTION_FAILED','Introspection inputs or services could not be consumed.'); }
}
