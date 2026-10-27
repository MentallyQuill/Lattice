import { normalizeWorkflowFailurePolicy } from './failure-policy.js?v=0.29.0';
import { executeChunk } from './operations/chunk.js?v=0.29.0';
import { isScopedSystemOperation } from './system-capabilities.js?v=0.29.0';
import { artifactVisibility, preserveArtifactPrivacy } from './artifact-privacy.js?v=0.29.0';
import { normalizeRequestFailure } from './request-failure.js?v=0.29.0';
import { compileIterationHelper, executeCompiledIteration } from './iteration-helpers.js?v=0.29.0';
import { LIFECYCLE_OPERATIONS, executeLifecycleNode } from './operations/lifecycle-nodes.js?v=0.29.0';
import { FILE_OPERATIONS, executeFileNode } from './operations/file-nodes.js?v=0.29.0';
import { TIME_OPERATIONS, executeTimeNode } from './operations/time-nodes.js?v=0.29.0';
import { EVENT_OPERATIONS, executeEvent } from './operations/event-nodes.js?v=0.29.0';
import { RANDOM_OPERATIONS, executeRandom } from './operations/random-outcomes.js?v=0.29.0';
import { COLLECTION_OPERATIONS, executeCollection } from './operations/collection-nodes.js?v=0.29.0';
import { applyTextModifiers } from './modifiers.js?v=0.29.0';
import { operationFor } from './catalog.js?v=0.29.0';
import { cloneWorkflowDocument } from './document.js?v=0.29.0';
import { prepareWorkflowAttempt } from './resolve.js?v=0.29.0';
import { compactContext, formatContext } from './compactor.js?v=0.29.0';
import { repairDraft, validatePatches } from './repair.js?v=0.29.0';
import { scanPatternDraft } from './operations/pattern-engine.js?v=0.29.0';
import { patternSettingsForNode } from './operations/pattern-nodes.js?v=0.29.0';
import { filterPatternDraft, filterTextSettingsForNode } from './operations/filter-text.js?v=0.29.0';
import { graphSemanticSignature } from './ports.js?v=0.29.0';
import { executePrimitive, PRIMITIVE_OPERATIONS } from './operations/nodes.js?v=0.29.0';
import { executeInput, INPUT_OPERATIONS } from './operations/input-nodes.js?v=0.29.0';
import { executeContextJoin } from './operations/context-join.js?v=0.29.0';
import { executeControl, CONTROL_OPERATIONS } from './operations/control-nodes.js?v=0.29.0';
import { executeDecision, DECISION_OPERATIONS } from './operations/decision-nodes.js?v=0.29.0';
import { executeModelNode, MODEL_OPERATIONS } from './operations/model-nodes.js?v=0.29.0';
import { executeTranspose, TRANSPOSE_OPERATIONS } from './operations/transpose-nodes.js?v=0.29.0';
import { cleanupDraft, CLEANUP_MODES } from './operations/prose-cleanup.js?v=0.29.0';
import { executeIntrospection } from './introspection/nodes.js?v=0.29.0';
import { INTROSPECTION_NATIVE_OPERATIONS, projectIntrospectionNode } from './introspection/native.js?v=0.29.0';
import { admitRunPlan, createRunRecorder } from './recording.js?v=0.29.0';
import { addressKey, freeze, own, plain, parseRunPlan, safeBinding, safeError, safeIteration, safeUsage, boundedText } from './record-data.js?v=0.29.0';

/** Execution identity shared by the host and UI. Canvas presentation never invalidates work. */
export const workflowSignature = graphSemanticSignature;
export const freezeArtifact = freeze;
const failure = (code,message,nodeId) => ({ok:false,error:{code,message,...(nodeId ? {nodeId} : {})}});
const success = artifact => ({ok:true,artifact,reports:[]});
const RECOVERABLE_NODE_ERRORS=new Set(['REQUEST_FAILED','INVALID_RESPONSE','TRUNCATED_OUTPUT','COMPLETION_UNVERIFIED','EMPTY_OUTPUT','INVALID_JSON','SCHEMA_MISMATCH','BINDING_MISSING','PROFILE_MISSING','MODEL_MISSING','PRESET_MISSING','INSTRUCT_MISSING','ENDPOINT_MISSING']);
const cutoff = finish => ['length','max_tokens','max_output_tokens'].includes(String(finish).toLowerCase());
const complete = finish => ['stop','eos_token','eos','stop_sequence','end_turn','complete','completed'].includes(String(finish).toLowerCase());
const artifactKey = address => JSON.stringify([address.workflowId,address.instancePath,address.nodeId,address.portId]);
const versionMetadata = value => typeof value==='number' && Number.isFinite(value) ? value : undefined;
const observe = (observer,...args) => { try { const pending=observer?.(...args); if(pending && typeof pending.then==='function')Promise.resolve(pending).catch(()=>{}); } catch {/* Observers never own execution. */} };
/** Scope comes from the final host authorization, never request/provider disclosure claims. */
function diagnosticVisibility(node,inputs,authorized) {
    const scope=own(own(authorized,'data'),'scope'),actorId=own(scope,'actorId');
    const actor=typeof actorId==='string'&&!!actorId.trim()&&actorId.length<=256?{kind:'actor-private',actorId}:undefined;
    // Reflect can consume host-owned implicit state absent from its public Context pin.
    if(!node||scope!==undefined&&scope!==null&&!actor||node.operation==='reflect'&&!inputs.state&&!actor||['character-direction','prompted-memory'].includes(node.operation)&&!actor)return {kind:'hidden'};
    return artifactVisibility({inputs,...(actor?{visibility:actor}:{})});
}

function planWorkflow(graph,ports) {
    const normalized=cloneWorkflowDocument(graph);if(!normalized.ok)return normalized;
    if(normalized.data.mode!=='native-unified')return failure('WRONG_PHASE','Only unified workflow roots can execute.');
    if(ports.phase && normalized.data.mode!=='native-'+ports.phase)return failure('WRONG_PHASE','The workflow operation does not support this phase.');
    const resolved=prepareWorkflowAttempt(normalized.data,ports.target===undefined?{}:{target:ports.target});return resolved.ok?{ok:true,data:resolved.data.selection,preflight:resolved.data.preflight,graph:normalized.data}:resolved;
}
async function executeNode(node,inputs,op,local) {
    const input=inputs.in;
    if(node.operation==='chunk')return executeChunk(node,inputs,local);
    if(op.hostOperation||local.executeHostOperation&&['scene-context','reply-snapshot','prompt-source'].includes(node.operation)) {
        if(!local.root&&!isScopedSystemOperation(node)||!local.executeHostOperation)return failure('HOST_OPERATION_REQUIRED','This operation requires its owned root host adapter.',node.id);
        return local.executeHostOperation(node,inputs,{phase:local.phase,rootMode:local.rootMode,runtime:local.operationRuntime,root:local.root,address:local.address,inputStates:local.inputStates,request:local.request,getRequestBindings:local.getRequestBindings,...(local.sourceProofs?{sourceProofs:local.sourceProofs}:{}),...(local.signal?{signal:local.signal}:{})});
    }
    if(Object.hasOwn(LIFECYCLE_OPERATIONS,node.operation))return executeLifecycleNode(node,inputs,local);
    if(Object.hasOwn(FILE_OPERATIONS,node.operation))return executeFileNode(node,inputs,local);
    if(Object.hasOwn(TIME_OPERATIONS,node.operation))return executeTimeNode(node,inputs,local);
    if(Object.hasOwn(EVENT_OPERATIONS,node.operation)) {
        const result=await executeEvent(node,inputs,local);
        if(node.operation==='draft-event-source'&&result?.ok===true&&typeof local.retainDraftEventSource==='function') {
            let retained;try{retained=await local.retainDraftEventSource({draft:inputs.in,scope:inputs.scope,source:result.artifact});}catch{return failure('DRAFT_EVIDENCE_RETENTION_FAILED','The native owner could not retain final narrative evidence.',node.id);}
            if(retained?.ok!==true||retained.data?.retained!==true)return retained?.ok===false?retained:failure('DRAFT_EVIDENCE_RETENTION_FAILED','The native owner did not acknowledge final narrative evidence.',node.id);
            if(retained.data.source!==undefined){if(retained.data.source?.kind!=='data')return failure('DRAFT_EVIDENCE_RETENTION_FAILED','The native owner returned invalid narrative source metadata.',node.id);return {...result,artifact:retained.data.source};}
        }
        return result;
    }
    if(Object.hasOwn(RANDOM_OPERATIONS,node.operation))return executeRandom(node,inputs,local);
    if(Object.hasOwn(COLLECTION_OPERATIONS,node.operation))return executeCollection(node,inputs,local);
    if(Object.hasOwn(MODEL_OPERATIONS,node.operation))return executeModelNode(node,inputs,local);
    if(Object.hasOwn(DECISION_OPERATIONS,node.operation))return executeDecision(node,inputs,local);
    if(Object.hasOwn(CONTROL_OPERATIONS,node.operation))return executeControl(node,inputs,local);
    if(node.operation!=='prompt-source' && Object.hasOwn(INPUT_OPERATIONS,node.operation))return executeInput(node,{phase:local.phase});
    if(Object.hasOwn(PRIMITIVE_OPERATIONS,node.operation)) {
        // Compose's cap/report measures the same deterministic final Text rendering
        // emitted by both the root and iteration modifier pipelines. Guidance stays exact.
        const countTokens = local.countTokens && node.operation === 'compose' && node.modifiers?.length
            ? text => { const final = applyTextModifiers(text, node.modifiers); if (!final.ok) throw new Error('Invalid final Compose text.'); return local.countTokens(final.data.text); }
            : local.countTokens;
        return executePrimitive(node,inputs,{phase:local.phase,...(local.inputStates?{inputStates:local.inputStates}:{}),...(countTokens?{countTokens}:{}),...(local.signal?{signal:local.signal}:{}),...(local.createWorker?{createWorker:local.createWorker}:{}),...(local.timeoutMs!==undefined?{timeoutMs:local.timeoutMs}:{})});
    }
    if(node.operation==='context-join'){const result=executeContextJoin(node,inputs);return result.ok?result:{...result,error:{...result.error,...(typeof result.error.portId==='string'?{inputPortId:result.error.portId}:{})}};}
    if(Object.hasOwn(TRANSPOSE_OPERATIONS,node.operation))return executeTranspose(node,inputs,{phase:local.phase,request:local.request,countTokens:local.countTokens,binding:local.binding,...(local.signal?{signal:local.signal}:{})});
    if(Object.hasOwn(INTROSPECTION_NATIVE_OPERATIONS,node.operation)) {
        const projected=projectIntrospectionNode(node);if(!projected.ok)return projected;
        const capabilities={phase:local.phase,root:local.root,request:local.request,countTokens:local.countTokens,binding:local.binding,...(local.signal?{signal:local.signal}:{})};
        if(local.executeIntrospection)return local.executeIntrospection(node,inputs,{...capabilities,address:local.address,rootMode:local.rootMode,inputStates:local.inputStates});
        // Public execution can consume explicitly injected reads, but never obtains
        // the commit capability or trusted host settlement authority.
        const memory=own(local,'memory');
        if(memory)capabilities.memory=Object.fromEntries(['read','recall'].flatMap(key=>{
            const method=own(memory,key);return typeof method==='function'?[[key,options=>method.call(memory,options)]]:[];
        }));
        return executeIntrospection(projected.data,inputs,capabilities);
    }
    switch(node.operation) {
        case 'scene-context':case 'reply-snapshot':case 'prompt-source': {
            const snapshot=await local.snapshot(op.phase,node),result=snapshot?.ok===false?snapshot:success(structuredClone(snapshot?.ok===true?snapshot.artifact:snapshot));
            if(result.ok && snapshot?.report)result.reports.push(snapshot.report);
            return result.ok && result.artifact?.kind!==op.output?failure('INVALID_SNAPSHOT','The host did not provide the expected frozen source.',node.id):result;
        }
        case 'smart-compactor':return compactContext(input,node,local);
        case 'response-plan': {
            const messages=[{role:'system',content:'Write concise optional scene guidance: direction, actor intentions, constraints and possible next beats. These are proposals, not established events. Preserve user agency. Use only the supplied context and instructions.'},{role:'user',content:'Instructions: '+(node.instructions??'')+'\n\n'+formatContext(input)}];
            const response=await local.request({messages,maxTokens:node.maxTokens??768});
            return response.ok?(response.data.text.trim()?success({kind:'guidance',text:response.data.text,context:input,derived:true}):failure('EMPTY_OUTPUT','Planning returned no guidance.',node.id)):response;
        }
        case 'guidance': {
            const measured=await local.countTokens(input.text),result=measured.tokens<=(node.budgetTokens??768)?success(input):failure('GUIDANCE_OVERFLOW','Guidance exceeds its artifact token budget; nothing was published.',node.id);
            result.reports=[{code:'GUIDANCE_BUDGET',nodeId:node.id,...measured,budget:node.budgetTokens??768}];return result;
        }
        case 'filter-text': {
            const settings = filterTextSettingsForNode(node); if (!settings.ok) return settings;
            return filterPatternDraft(input, inputs.matches, settings.data, { nodeId: node.id });
        }
        case 'pattern': {
            const settings = patternSettingsForNode(node); if (!settings.ok) return settings;
            return scanPatternDraft(input, settings.data, { ...(local.signal ? { signal: local.signal } : {}), ...(local.createWorker ? { workerFactory: local.createWorker } : {}) });
        }
        case 'repair': {
            if(!CLEANUP_MODES.includes(node.mode))return repairDraft(input,node,local);
            const settings=Object.fromEntries(op.controls.filter(key=>!['policyVersion','reasoningEffort','reasoningCustom'].includes(key)).map(key=>[key,node[key]===undefined?op.defaults[key]:node[key]]));
            const result=await cleanupDraft(input,settings,{request:local.request,countTokens:local.countTokens,binding:local.binding,...(local.signal?{signal:local.signal}:{}),...(inputs.context?{context:inputs.context}:{})});
            return result.ok?{ok:true,artifact:result.data.artifact,reports:result.data.report}:result;
        }
        case 'validate-patches':return validatePatches(input,node);
        case 'review-gate':case 'apply-reply':return success({...input,reviewRequired:true});
        case 'reroute':return success(input);
        default:return failure('UNKNOWN_OPERATION','Unsupported workflow operation.',node.id);
    }
}

/** Public execution returns addressed bounded recordings. */
export async function runWorkflow(graph,ports={}) { return executeWorkflow(graph,ports); }
/** Host-only lifecycle transport; deliberately absent from the public facade. */
export async function runWorkflowForHost(graph,ports={},hooks={}) { return executeWorkflow(graph,ports,hooks); }

async function executeWorkflow(original,ports,hooks={}) {
    const diagnosticObserver=own(ports,'onDiagnostic');
    const diagnosticResponses=typeof diagnosticObserver==='function'&&own(ports,'diagnosticResponseText')!==false;
    const diagnosticResponseCurrent=own(ports,'isDiagnosticResponseCurrent');
    const mayCaptureDiagnosticResponse=()=>{
        if(!diagnosticResponses)return false;
        try{return diagnosticResponseCurrent===undefined||typeof diagnosticResponseCurrent==='function'&&diagnosticResponseCurrent()===true;}catch{return false;}
    };
    const schema=versionMetadata(own(original,'schema')),runtime=versionMetadata(own(original,'runtime')),mode=ports.target===undefined?'root':'target';
    const failurePolicy=normalizeWorkflowFailurePolicy(own(ports,'failurePolicy'));
    const failures=[],unavailableOutputs=new Set(),fatalUnits=new Map();
    const artifacts=new Map(),outputStates=new Map(),unitStates=new Map(),bindings=new Map(),requestBindings=new Map(),bindingReports=new Map(),nodeCalls=new Map(),helperPrograms=new Map(),terminals=[];
    let runId,recorder,plan,safePlan,current,callBound=0,actualCalls=0,seq=0,lastElapsed=0,cancelling=false,closed=false,removeAbort=()=>{};
    let now,monotonic,started;
    const safeFailure=result=>{const error=safeError(own(result,'error'),safePlan??{units:[],hierarchy:[]},current?.address)??{code:'WORKFLOW_FAILED',message:'Workflow preparation failed; inspect the source, connection and tokenizer.'};return {ok:false,error};};
    const emit=(type,details={})=>{
        if(closed || (cancelling && !(type==='run-settled'&&details.status==='cancelled') && !(type==='request-settled'&&details.status==='cancelled'&&details.dispatched===false)))return;
        let at=now(),elapsed=monotonic()-started;if(!Number.isFinite(at)||at<0)at=0;if(!Number.isFinite(elapsed)||elapsed<0)elapsed=lastElapsed;lastElapsed=Math.max(lastElapsed,elapsed);
        const event=freeze({runId,seq:seq+1,at,elapsedMs:lastElapsed,type,...details}),accepted=recorder.accept(event);
        if(!accepted.ok)throw new Error('Event admission failed');if(accepted.data.lastSeq!==event.seq)return;
        seq=event.seq;if(type==='run-cancelling')cancelling=true;observe(ports.onEvent,event);return event;
    };
    const cancel=()=>{if(!cancelling&&!closed&&safePlan){emit('run-cancelling',{reason:{code:'ABORTED',message:'Workflow was stopped.'}});cancelling=true;}};
    const stopped=()=>ports.signal?.aborted||cancelling;
    const finish=raw=>{
        const result=raw.ok?raw:safeFailure(raw);
        if(recorder && !closed){if(stopped())cancel();emit('run-settled',{status:stopped()?'cancelled':result.ok?(failures.length?'partial':'completed'):raw.unresolved?'unresolved':!safePlan?'invalid':/^STALE|BINDING_CHANGED/.test(result.error?.code)?'stale':'failed',...(!result.ok?{error:safeError(result.error),...(result.error?.address&&safePlan?.units.some(unit=>unit.included&&addressKey(unit.address)===addressKey(result.error.address))&&!raw.unresolved?{failedAddress:result.error.address}:{})}:{})});closed=true;}
        const recording=recorder?.finish();
        const identity=typeof runId==='string'?{runId}:{};
        return freezeArtifact({...(schema!==undefined?{schema}:{}),...(runtime!==undefined?{runtime}:{}),...identity,mode,ok:result.ok,callBound,actualCalls,...(recording?{recording}:{}),...(!result.ok?{error:result.error}:{}),...(result.preview?{preview:true}:{}),...(failures.length?{failures,...(result.ok?{recovered:true}:{})}:{})});
    };
    try {
        runId=ports.runId===undefined?(globalThis.crypto?.randomUUID?.()??'run-'+Date.now()+'-'+Math.random()):ports.runId;
        recorder=createRunRecorder({runId});if(recorder.ok===false){const error=recorder;recorder=null;runId=undefined;return finish(error);}
        now=ports.clock?.now??Date.now;monotonic=ports.clock?.monotonic??(()=>globalThis.performance?.now?.()??Date.now());
        if(typeof now!=='function'||typeof monotonic!=='function') {recorder=null;return finish(failure('INVALID_RUN_CLOCK','Provide finite nonnegative run clocks.'));}
        let initial;
        try {started=monotonic();initial=now();}catch {recorder=null;return finish(failure('INVALID_RUN_CLOCK','Provide finite nonnegative run clocks.'));}
        if(!Number.isFinite(started)||started<0||!Number.isFinite(initial)||initial<0){recorder=null;return finish(failure('INVALID_RUN_CLOCK','Provide finite nonnegative run clocks.'));}
        // After creation, a misbehaving injected clock cannot prevent safe settlement.
        const readNow=now,readMonotonic=monotonic;
        now=()=>{try{const value=readNow();return Number.isFinite(value)&&value>=0?value:initial;}catch{return initial;}};
        monotonic=()=>{try{const value=readMonotonic();return Number.isFinite(value)&&value>=0?value:started+lastElapsed;}catch{return started+lastElapsed;}};
        const prepared=planWorkflow(original,ports);if(!prepared.ok)return finish(prepared);
        const originalGraphSnapshot=structuredClone(original);
        plan=prepared.data;callBound=plan.callBound;safePlan=parseRunPlan(plan);
        if(!safePlan)return finish(failure('INVALID_RUN_PLAN','The workflow execution inventory is invalid.'));
        const admission=admitRunPlan(safePlan,{runId});if(!admission.ok){safePlan=null;return finish(admission);}
        const abort=()=>cancel();ports.signal?.addEventListener('abort',abort,{once:true});removeAbort=()=>ports.signal?.removeEventListener('abort',abort);
        emit('plan',{plan:safePlan});
        if(!prepared.preflight.ok)return finish(prepared.preflight);
        if(stopped())return finish(failure('ABORTED','Workflow was stopped.'));
        const nodes=plan.primitives.filter(unit=>unit.included);
        const workflowDataNodes=[];
        // Validate every selected real helper before any source or model effect, even for an empty collection.
        for(const unit of nodes)if(!unit.systemDisabled&&unit.node.operation==='for-each') {
            const compiled=compileIterationHelper(prepared.graph,{helper:unit.node.helper,mode:unit.node.mode??'map',phase:unit.phase,address:unit.address,requestBoundPerIteration:unit.node.requestBoundPerIteration??0});
            if(!compiled.ok)return finish(compiled);helperPrograms.set(addressKey(unit.address),compiled.data.token);workflowDataNodes.push(...compiled.data.workflowDataNodes);
        }
        if(ports.dryRun||ports.preview)return finish({ok:true,preview:true});
        const preparation=await hooks.prepare?.(plan,{cancel,originalGraphSnapshot,workflowDataNodes:freezeArtifact(workflowDataNodes)});if(preparation?.ok===false)return finish(preparation);
        const bindingGraph={...prepared.graph,roles:{}};
        const summarizeBinding=(binding,node,op)=>safeBinding(ports.bindingSummary?.(binding)??{role:node.modelRole??op.modelRole,profileId:binding?.profileId,model:binding?.model,capability:op.requestCapability});
        const bindUnit=async(unit,op,duringExecution=false)=>{
            current=unit;const node=unit.node;
            if(!duringExecution)emit('node-phase',{address:unit.address,phase:'binding'});
            const resolved=await ports.resolveBinding?.({...node,modelRole:node.modelRole??op.modelRole},bindingGraph,unit.address);
            if(stopped())return failure('ABORTED','Workflow was stopped.',node.id);
            if(!resolved?.ok){const error=resolved??failure('BINDING_MISSING','Resolve the activated model connection before running.');if(!RECOVERABLE_NODE_ERRORS.has(error.error?.code))fatalUnits.set(addressKey(unit.address),error);return error;}
            const binding=resolved.data,key=addressKey(unit.address);bindings.set(key,binding);
            requestBindings.set(JSON.stringify([key,'primary']),{address:unit.address,binding,capability:op.requestCapability??'text-completion',role:node.modelRole??op.modelRole});
            bindingReports.set(key,summarizeBinding(binding,node,op));
            emit(duringExecution?'node-binding':'node-phase',{address:unit.address,...(duringExecution?{}:{phase:'binding'}),binding:summarizeBinding(binding,node,op)});
            return resolved;
        };
        const nativeBoundary=mode==='root'&&prepared.graph.mode==='native-unified'?nodes.find(unit=>operationFor(unit.node,{phase:unit.phase,mode:prepared.graph.mode})?.nativeBoundary):undefined;
        const getRequestBindings=()=>Object.freeze([...requestBindings.values()].map(entry=>Object.freeze({...entry,address:freezeArtifact(structuredClone(entry.address))})));
        // Only explicitly admitted node-local failures may become unavailable branches.
        const recoverNode=(unit,result)=>{
            const operation=operationFor(unit.node,{phase:unit.phase,mode:prepared.graph.mode});
            if(fatalUnits.has(addressKey(unit.address))||operation?.hostOperation||operation?.nativeBoundary||failurePolicy!=='continue-available'||stopped()||!RECOVERABLE_NODE_ERRORS.has(own(own(result,'error'),'code')))return false;
            const error=safeError(result.error,safePlan,unit.address),state={status:'skipped',reason:error};
            if(failures.length<32)failures.push(error);
            for(const port of unit.outputPorts){unavailableOutputs.add(artifactKey({...unit.address,portId:port.id}));outputStates.set(artifactKey({...unit.address,portId:port.id}),state);recorder.capture({address:unit.address,direction:'output',portId:port.id,state});}
            unitStates.set(addressKey(unit.address),{status:'failed',reason:error});
            emit('node-settled',{address:unit.address,status:'failed',error,recoverable:true});
            return true;
        };
        let unresolved=false;
        for(const unit of nodes) {
            current=unit;const node=unit.node,key=addressKey(unit.address),op=operationFor(node,{phase:unit.phase,mode:prepared.graph.mode});let binding=bindings.get(key);
            if(stopped())return finish(failure('ABORTED','Workflow was stopped.',node.id));
            const inputs=Object.create(null),inputStates=Object.create(null);
            for(const edge of plan.edges)if(addressKey(edge.to)===key){const state=outputStates.get(artifactKey(edge.from))??{status:'unresolved',reason:{code:'OUTPUT_MISSING',message:'The upstream output has not resolved.'}};inputStates[edge.to.portId]=state;if(state.status==='completed')inputs[edge.to.portId]=artifacts.get(artifactKey(edge.from));}
            for(const port of unit.inputPorts)if(Object.hasOwn(inputStates,port.id))recorder.capture({address:unit.address,direction:'input',portId:port.id,state:inputStates[port.id],...(Object.hasOwn(inputs,port.id)?{artifact:inputs[port.id],source:inputs[port.id]?.source}:{})});
            // A native ordering dependency carries no artifact, but cannot grant Post
            // execution when generation was skipped or held. Unresolved preparation
            // likewise cannot release the native boundary merely through optional pins.
            let stageState;
            if(nativeBoundary&&unit!==nativeBoundary&&unit.phase==='post')stageState=unitStates.get(addressKey(nativeBoundary.address))??{status:'unresolved',reason:{code:'NATIVE_BOUNDARY_UNRESOLVED',message:'The owned native boundary has not completed.'}};
            else if(unit===nativeBoundary)stageState=unit.dependencies.map(at=>unitStates.get(addressKey(at))).find(state=>state?.status==='unresolved');
            const held=stageState?.status==='unresolved'?stageState:Object.values(inputStates).find(state=>state.status==='unresolved');
            const failedInput=plan.edges.find(edge=>addressKey(edge.to)===key&&unit.inputPorts.some(port=>port.id===edge.to.portId&&(port.required||unit===nativeBoundary))&&unavailableOutputs.has(artifactKey(edge.from)));
            const failedStage=stageState?.status==='blocked';
            const skipped=failedInput||failedStage||prepared.graph.runtime===3&&node.operation==='scene-context'&&node.activationMode==='events'&&!inputs.trigger||stageState?.status==='skipped'||unit.inputPorts.some(port=>port.required&&inputStates[port.id]?.status==='skipped');
            if(unit.systemDisabled||held||skipped){const status=unit.systemDisabled?'skipped':held?'unresolved':'skipped',state={status,reason:unit.systemDisabled?{code:'SYSTEM_DISABLED',message:'The enclosing system is disabled.'}:held?.reason??(failedInput?inputStates[failedInput.to.portId].reason:undefined)??stageState?.reason??{code:'INPUT_SKIPPED',message:'A required branch input was skipped.'}};if(held&&!unit.systemDisabled)unresolved=true;
                for(const port of unit.outputPorts){if((failedInput||failedStage)&&!held&&!unit.systemDisabled)unavailableOutputs.add(artifactKey({...unit.address,portId:port.id}));outputStates.set(artifactKey({...unit.address,portId:port.id}),state);recorder.capture({address:unit.address,direction:'output',portId:port.id,state});}
                const nodeStatus=(failedInput||failedStage)&&!held&&!unit.systemDisabled?'blocked':status;unitStates.set(key,{...state,status:nodeStatus});emit('node-settled',{address:unit.address,status:nodeStatus,reason:state.reason});continue;
            }
            const lazyBinding=(Object.hasOwn(MODEL_OPERATIONS,node.operation)||Object.hasOwn(DECISION_OPERATIONS,node.operation)||Object.hasOwn(EVENT_OPERATIONS,node.operation)||Object.hasOwn(RANDOM_OPERATIONS,node.operation));
            if(unit.requestBound&&op.modelRole&&!bindings.has(key)&&!lazyBinding){const bound=await bindUnit(unit,op);if(!bound.ok){if(recoverNode(unit,bound))continue;emit('node-settled',{address:unit.address,status:'failed',error:safeError(bound.error,safePlan,unit.address)});return finish(bound);}binding=bound.data;}
            emit('node-phase',{address:unit.address,phase:'executing'});observe(ports.onStage,freezeArtifact(structuredClone(node)),unit.address);
            const authorizeInputs=async(selectedNode,selectedInputs,address,capability)=>{
                if(prepared.graph.mode!=='native-unified'&&prepared.graph.runtime!==3||typeof hooks.authorizeModelInputs!=='function')return {ok:true};
                let checked;try{checked=await hooks.authorizeModelInputs({node:selectedNode,address,inputs:selectedInputs,capability});}catch{return failure('ACTOR_SCOPE_FAILED','The auxiliary model scope could not be authorized.',selectedNode.id);}
                if(stopped())return failure('ABORTED','Workflow was stopped.',selectedNode.id);
                if(checked?.ok!==true)fatalUnits.set(key,checked?.ok===false?checked:failure('ACTOR_SCOPE_FAILED','The auxiliary model scope was not authorized.',selectedNode.id));
                return checked?.ok===true?checked:checked?.ok===false?checked:failure('ACTOR_SCOPE_FAILED','The auxiliary model scope was not authorized.',selectedNode.id);
            };
            const retainScopedOutput=async(payload)=>{
                if(prepared.graph.mode!=='native-unified'&&prepared.graph.runtime!==3||typeof hooks.retainScopedOutput!=='function')return {ok:true,data:{retained:true}};
                let retained;try{retained=await hooks.retainScopedOutput(payload);}catch{return failure('ACTOR_SCOPE_FAILED','The private artifact scope could not be retained.',payload.node?.id??node.id);}
                if(stopped())return failure('ABORTED','Workflow was stopped.',payload.node?.id??node.id);
                if(retained?.ok!==true||retained.data?.retained!==true)fatalUnits.set(key,retained?.ok===false?retained:failure('ACTOR_SCOPE_FAILED','The private artifact scope was not retained.',node.id));
                return retained?.ok===true&&retained.data?.retained===true?retained:retained?.ok===false?retained:failure('ACTOR_SCOPE_FAILED','The private artifact scope was not retained.',payload.node?.id??node.id);
            };
            const childAuthorizers=new Map(),childDiagnosticScopes=new Map();
            let operationOpen=true,requestInFlight=false,lastDiagnosticResponse;
            const onModelValidation=error=>{
                if(typeof diagnosticObserver!=='function'||!operationOpen||closed||stopped()||!lastDiagnosticResponse?.completed)return;
                const projected=safeError(error);if(!projected)return;
                const {attempt}=lastDiagnosticResponse;lastDiagnosticResponse.completed=false;
                observe(diagnosticObserver,freeze({type:'validation',address:unit.address,attempt,error:projected}));
            };
            const requestFailure=()=>failure(closed||!operationOpen?'REQUEST_SCOPE_CLOSED':stopped()?'ABORTED':'CALL_LIMIT',closed||!operationOpen?'This operation request scope has closed.':stopped()?'Workflow was stopped.':'Workflow request limit reached.',node.id);
            const admitted=()=>!closed&&operationOpen&&!stopped()&&actualCalls<callBound&&(nodeCalls.get(key)??0)<unit.requestBound;
            const dispatchRequest=async(options)=>{
                const capability='text-completion';
                if(!admitted())return requestFailure();
                if(requestInFlight)return failure('REQUEST_IN_FLIGHT','This operation already has an active request.',node.id);
                if(own(options,'capability')!==undefined&&own(options,'capability')!==capability)return failure('REQUEST_CAPABILITY_MISMATCH','This node authorizes text completion requests only.',node.id);
                requestInFlight=true;
                try{
                    // Actual helper requests authorize their exact child inputs before forwarding here.
                    if(node.operation!=='for-each'){const authorized=await authorizeInputs(node,inputs,unit.address,capability);if(!authorized.ok)return authorized;if(!admitted())return requestFailure();}
                    if(lazyBinding&&!bindings.has(key)){
                        const bound=await bindUnit(unit,op,true);if(!admitted())return requestFailure();if(!bound.ok)return bound;binding=bound.data;
                    }
                    const requestBinding=node.operation==='for-each'?(own(options,'binding')??binding):binding;
                    if(!Array.isArray(options?.messages)||typeof ports.countTokens!=='function'||typeof ports.request!=='function')return failure('REQUEST_UNAVAILABLE','A verified completion capability and tokenizer are required.',node.id);
                    const tokenCount=await ports.countTokens(options.messages.map(item=>item.role+': '+item.content).join('\n'));
                    if(!admitted())return requestFailure();
                    if(!Number.isFinite(tokenCount?.tokens)||tokenCount.tokens<0)return failure('TOKEN_COUNT_FAILED','The tokenizer returned an invalid count.',node.id);
                    if(node.operation==='for-each'){
                        const iteration=safeIteration(own(options,'iteration')),role=own(options,'modelRole')??'iterationHelper';
                        requestBindings.set(JSON.stringify([key,'iteration',actualCalls]),{address:unit.address,binding:requestBinding,capability,role,...(iteration?{iteration}:{})});
                        const summary=requestBinding===undefined?safeBinding({role,capability}):summarizeBinding(requestBinding,{...node,modelRole:role},{...op,requestCapability:capability});
                        bindingReports.set(key,summary);emit('node-binding',{address:unit.address,binding:summary});
                    }
                    if(!admitted())return requestFailure();
                    // Resolver/tokenizer callbacks can revoke private context. Check the actual
                    // child scope again at the final transport boundary, never a portable claim.
                    const childAddress=node.operation==='for-each'?safeIteration(own(options,'iteration'))?.childAddress:undefined;
                    const finalGuard=childAddress&&childAuthorizers.get(addressKey(childAddress));
                    const authorized=await (finalGuard?finalGuard(capability):authorizeInputs(node,inputs,unit.address,capability));if(!authorized.ok)return authorized;if(!admitted())return requestFailure();
                    const attempt=(nodeCalls.get(key)??0)+1;
                    const iteration=node.operation==='for-each'?safeIteration(options.iteration):undefined;
                    emit('request-start',{address:unit.address,attempt,maxTokens:options.maxTokens,inputTokens:tokenCount.tokens,capability,...(iteration?{iteration}:{})});const requestStarted=lastElapsed;
                    // Progress and injected clock callbacks run user code. Recheck the exact
                    // request capability after all of them, immediately before dispatch.
                    let dispatchGuard=!admitted()?requestFailure():await (finalGuard?finalGuard(capability):authorizeInputs(node,inputs,unit.address,capability));
                    if(dispatchGuard.ok&&!admitted())dispatchGuard=requestFailure();
                    if(!dispatchGuard.ok){emit('request-settled',{address:unit.address,attempt,status:stopped()?'cancelled':'failed',durationMs:0,dispatched:false,error:safeError(dispatchGuard.error)});return dispatchGuard;}
                    nodeCalls.set(key,attempt);actualCalls++;
                    let response,diagnosticCompletion,diagnosticRequestOpen=true;
                    const onDiagnosticResponse=diagnosticResponses?value=>{
                        if(!diagnosticRequestOpen||closed||!operationOpen||stopped()||!mayCaptureDiagnosticResponse())return;
                        const text=own(value,'text');if(typeof text==='string')diagnosticCompletion=text;
                    }:undefined;
                    const reasoning=node.operation==='for-each'?{reasoningEffort:own(options,'reasoningEffort')??'none',reasoningCustom:own(options,'reasoningCustom')??''}:{reasoningEffort:node.reasoningEffort??'none',reasoningCustom:node.reasoningCustom??''};
                    try{response=await ports.request({...options,...reasoning,binding:requestBinding,signal:ports.signal,onDiagnosticResponse,isDiagnosticResponseCurrent:diagnosticResponses?mayCaptureDiagnosticResponse:undefined});}
                    catch(error){response=normalizeRequestFailure(error,{aborted:stopped()});}
                    finally{diagnosticRequestOpen=false;}
                    if(closed||!operationOpen)return requestFailure();
                    const diagnosticData=mayCaptureDiagnosticResponse()&&own(response,'ok')===true?own(response,'data'):undefined;
                    if(!response||typeof response.ok!=='boolean'||(!response.ok&&!response.error))response=failure('INVALID_RESPONSE','Auxiliary request returned an invalid result.',node.id);
                    if(stopped())response=failure('ABORTED','Ignore the stopped request result.',node.id);
                    else if(response.ok){
                        if(typeof response.data?.text!=='string')response=failure('INVALID_RESPONSE','Auxiliary completion returned no text.',node.id);
                        else if(cutoff(response.data.finish))response={ok:false,error:{code:'TRUNCATED_OUTPUT',message:'Auxiliary output reached its completion limit.',usage:response.data.usage,finish:response.data.finish}};
                        else if(!complete(response.data.finish))response={ok:false,error:{code:'COMPLETION_UNVERIFIED',message:'Auxiliary output has no verified completion evidence.',usage:response.data.usage,finish:response.data.finish??null}};
                    }
                    const metadata=response.ok?response.data:response.error,usage=metadata?.usage;
                    if(typeof diagnosticObserver==='function'&&!stopped()){
                        lastDiagnosticResponse={attempt,completed:response.ok};
                    }
                    if(!stopped()&&mayCaptureDiagnosticResponse()){
                        // Project diagnostic scope only after transport; no new callbacks
                        // may enter the final authorization-to-dispatch boundary.
                        const diagnosticScope=node.operation==='for-each'?childDiagnosticScopes.get(childAddress&&addressKey(childAddress)):{node,inputs};
                        const visibility=diagnosticVisibility(diagnosticScope?.node,diagnosticScope?.inputs,dispatchGuard);
                        const text=own(diagnosticData,'text')??diagnosticCompletion;
                        if(!stopped())observe(diagnosticObserver,freeze({type:'response',address:unit.address,attempt,...(typeof text==='string'?{text}:{}),visibility,...(metadata?.finish!==undefined?{finish:boundedText(metadata.finish,128)??null}:{}),...(safeUsage(usage)!==undefined?{usage:safeUsage(usage)}:{}),...(!response.ok?{error:safeError(response.error)}:{})}));
                    }
                    emit('request-settled',{address:unit.address,attempt,status:stopped()?'cancelled':response.ok?'completed':'failed',durationMs:Math.max(0,monotonic()-started-requestStarted),...(metadata?.finish!==undefined?{finish:boundedText(metadata.finish,128)??null}:{}),...(safeUsage(usage)!==undefined?{usage:safeUsage(usage)}:{}),...(!response.ok?{error:safeError(response.error)}:{})});return response;
                }finally{requestInFlight=false;}
            };
            // Preserve safety provenance even when an operation adapter normalizes
            // an unfamiliar transport error into its generic request failure.
            const trackedRequest=async options=>{
                const result=await dispatchRequest(options);
                if(result?.ok===false&&!RECOVERABLE_NODE_ERRORS.has(result.error?.code))fatalUnits.set(key,result);
                return result;
            };
            const request=trackedRequest;
            const onRetry=details=>{
                if(!admitted()||requestInFlight||(nodeCalls.get(key)??0)<1||!plain(details))return;
                const reasonCode=own(details,'reasonCode'),delayMs=own(details,'delayMs');
                if(!['INVALID_JSON','SCHEMA_MISMATCH','REQUEST_FAILED'].includes(reasonCode)||typeof delayMs!=='number'||!Number.isFinite(delayMs)||delayMs<0||delayMs>30000)return;
                emit('node-retry',{address:unit.address,reasonCode,delayMs,nextAttempt:(nodeCalls.get(key)??0)+1,maxAttempts:unit.requestBound});
            };
            const executeHelperUnit=async(child,childInputs,childLocal)=>{
                const childNode=child.node,childOp=operationFor(childNode,{phase:childLocal.phase,mode:prepared.graph.mode});
                if(!childOp||childOp.rootOnly||childOp.hostOperation||childOp.nativeBoundary||childOp.terminal||childOp.requiresStateInDefinition&&!childInputs.state)return failure('ITERATION_AUTHORITY','Helpers cannot acquire root authority.',node.id);
                let childOpen=true,childCalls=0;const childBindings=new Map(),recovered=new WeakSet();
                const childKey=addressKey(child.address);childAuthorizers.set(childKey,capability=>childOpen?authorizeInputs(childNode,childInputs,child.address,capability):failure('REQUEST_SCOPE_CLOSED','The helper request scope has closed.',childNode.id));
                if(diagnosticResponses)childDiagnosticScopes.set(childKey,{node:childNode,inputs:childInputs});
                const childIterate=childLocal.iterateHelper?async(...args)=>{const result=await childLocal.iterateHelper(...args);if(result?.ok===true)recovered.add(result);return result;}:undefined;
                const childRequest=async(options)=>{
                    const capability='text-completion';
                    if(!childOpen||closed||!operationOpen)return failure('REQUEST_SCOPE_CLOSED','The helper request scope has closed.',node.id);
                    if(stopped())return failure('ABORTED','Workflow was stopped.',node.id);
                    if(childCalls>=child.requestBound)return failure('ITERATION_CALL_LIMIT','The helper node request bound was reached.',node.id);
                    if(own(options,'capability')!==undefined&&own(options,'capability')!==capability)return failure('REQUEST_CAPABILITY_MISMATCH','The helper authorizes text completion requests only.',childNode.id);
                    if(childNode.operation==='for-each')return childLocal.request({...options,capability});
                    const authorized=await authorizeInputs(childNode,childInputs,child.address,capability);if(!authorized.ok)return authorized;
                    if(!childOpen||closed||!operationOpen||stopped())return requestFailure();
                    const role=childNode.modelRole??childOp.modelRole;
                    const selectedNode={...childNode,modelRole:role};
                    if(!childBindings.has(capability)){
                        const selected=await ports.resolveBinding?.(selectedNode,{...bindingGraph,roles:childLocal.roles},child.address);
                        if(!childOpen||closed||!operationOpen||stopped())return requestFailure();
                        if(!selected?.ok){const error=selected??failure('BINDING_MISSING','Resolve the activated helper model connection.',node.id);if(!RECOVERABLE_NODE_ERRORS.has(error.error?.code))fatalUnits.set(key,error);return error;}
                        childBindings.set(capability,selected.data);
                    }
                    if(typeof childLocal.request!=='function')return failure('REQUEST_MISSING','The helper requires its bounded per-iteration request capability.',node.id);
                    const before=nodeCalls.get(key)??0;childCalls++;
                    try{return await childLocal.request({...options,reasoningEffort:childNode.reasoningEffort??'none',reasoningCustom:childNode.reasoningCustom??'',capability,binding:childBindings.get(capability),modelRole:role,childAddress:child.address});}
                    finally{childCalls+=(nodeCalls.get(key)??0)-before-1;}
                };
                try{const result=await executeNode(childNode,childInputs,childOp,{...ports,...childLocal,iterateHelper:childIterate,isRecoveredIterationResult:result=>recovered.has(result),binding:undefined,request:childRequest,onModelValidation,onRetry:details=>{if(childOpen&&childCalls>0&&childCalls<child.requestBound)onRetry(details);},getRequestCount:()=>childCalls,executeIntrospection:hooks.executeIntrospection,executeHostOperation:undefined,sourceProofs:prepared.graph.runtime===3&&typeof hooks.getSourceProofs==='function'?hooks.getSourceProofs():undefined});if(!result?.ok)onModelValidation(result?.error);return result;}
                finally{childOpen=false;childBindings.clear();childAuthorizers.delete(childKey);childDiagnosticScopes.delete(childKey);}
            };
            // Custom adapters retain the same bounded request capability after mandatory helper preflight.
            const recovered=new WeakSet(),compiled=helperPrograms.get(key),iterateHelper=typeof ports.iterateHelper==='function'?ports.iterateHelper:compiled?async(invocation,helperPorts)=>{const result=await executeCompiledIteration(compiled,invocation,{executeUnit:executeHelperUnit,request:helperPorts.request,signal:ports.signal,retainScopedOutput:payload=>retainScopedOutput({...payload,inputs:payload.seed?inputs:payload.inputs})});if(result?.ok===true)recovered.add(result);return result;}:ports.iterateHelper;
            // Static instances inherit owned host capabilities; repeated helpers use their separate bounded adapter.
            const rawResult=await executeNode(node,inputs,op,{...ports,phase:unit.phase,operationRuntime:unit.runtime,rootMode:prepared.graph.mode,binding,request,onRetry,onModelValidation,iterateHelper,isRecoveredIterationResult:result=>recovered.has(result),getRequestCount:()=>nodeCalls.get(key)??0,inputStates:freezeArtifact(inputStates),root:unit.address.instancePath.length===0 || isScopedSystemOperation(node) && typeof hooks.executeHostOperation==='function',address:unit.address,executeIntrospection:hooks.executeIntrospection,executeHostOperation:hooks.executeHostOperation,getRequestBindings,sourceProofs:prepared.graph.runtime===3&&typeof hooks.getSourceProofs==='function'?hooks.getSourceProofs():undefined});
            if(!rawResult?.ok)onModelValidation(rawResult?.error);
            // Native generation authors the public story from scoped portrayal guidance; it never publishes guidance verbatim.
            const result=preserveArtifactPrivacy(failurePolicy==='continue-available'?(fatalUnits.get(key)??rawResult):rawResult,node.operation==='generate-reply'?{}:inputs);
            operationOpen=false;
            if(requestInFlight)return finish(failure('PENDING_REQUEST','The operation returned before its active request settled.',node.id));
            if(stopped())return finish(failure('ABORTED','Workflow was stopped.',node.id));
            if(!result?.ok){if(recoverNode(unit,result))continue;emit('node-settled',{address:unit.address,status:'failed',error:safeError(own(result,'error'),safePlan,unit.address)});return finish(result??failure('WORKFLOW_FAILED','The operation returned no result.',node.id));}
            const outputs=own(result,'outputs'),states=own(result,'outputStates');
            if(outputs!==undefined&&!plain(outputs)||states!==undefined&&!plain(states)||[...Object.keys(outputs??{}),...Object.keys(states??{})].some(id=>!unit.outputPorts.some(port=>port.id===id))){const error=failure('INVALID_OUTPUT','The operation returned undeclared output ports.',node.id);emit('node-settled',{address:unit.address,status:'failed',error:error.error});return finish(error);}
            const metadata={binding:bindingReports.get(key),reports:result.reports};
            let allSkipped=unit.outputPorts.length>0,hasUnresolved=false;
            for(const port of unit.outputPorts){let output=own(outputs,port.id);if(outputs===undefined&&port.id==='out')output=result.artifact;
                const rawState=own(states,port.id),status=rawState===undefined?(output===undefined?'unresolved':'completed'):own(rawState,'status');
                if(!['completed','skipped','unresolved'].includes(status)||status==='completed'&&(output===undefined||own(output,'kind')!==port.kind)||status!=='completed'&&output!==undefined){const error=failure('INVALID_OUTPUT','Output state and artifact must match the declared port.',node.id);emit('node-settled',{address:unit.address,status:'failed',error:error.error});return finish(error);}
                const reason=safeError(own(rawState,'reason')),state=freezeArtifact({status,...(reason?{reason}:{})});outputStates.set(artifactKey({...unit.address,portId:port.id}),state);allSkipped&&=status==='skipped';hasUnresolved||=status==='unresolved';
                if(status!=='completed'){recorder.capture({address:unit.address,direction:'output',portId:port.id,state});continue;}
                let modifierMetadata;if(node.modifiers?.length){const modified=applyTextModifiers(output?.text,node.modifiers);if(!modified.ok){emit('node-settled',{address:unit.address,status:'failed',error:safeError(modified.error)});return finish(modified);}output={...output,text:modified.data.text};modifierMetadata={rawText:modified.data.rawText,trace:modified.data.trace};}
                const artifact=freezeArtifact(output),recordedArtifact=modifierMetadata?freezeArtifact({...artifact,modifiers:modifierMetadata}):artifact;
                const scoped=await retainScopedOutput({node,address:unit.address,inputs,inputStates,artifact,portId:port.id,rawResult});if(!scoped.ok)return finish(scoped);
                if(prepared.graph.mode==='native-unified'&&mode==='root'&&typeof hooks.retainRecallProvenance==='function'){
                    let retained;try{retained=await hooks.retainRecallProvenance({node,address:unit.address,inputs,artifact,portId:port.id,rawResult});}catch{return finish(failure('RECALL_PROVENANCE_FAILED','The private recall source could not be retained.',node.id));}
                    if(stopped())return finish(failure('ABORTED','Workflow was stopped.',node.id));
                    if(retained?.ok!==true||retained.data?.retained!==true)return finish(failure('RECALL_PROVENANCE_FAILED','The private recall source could not be retained.',node.id));
                }
                artifacts.set(artifactKey({...unit.address,portId:port.id}),artifact);recorder.capture({address:unit.address,direction:'output',portId:port.id,artifact:recordedArtifact,state,source:artifact?.source,...metadata});
            }
            if(unit.terminal){const artifact=freezeArtifact(result.artifact),terminal={kind:'terminal',address:unit.address};terminals.push({terminal,artifact,...(node.operation==='review-publish'?{inputDraft:inputs.draft}:{})});recorder.capture({address:unit.address,direction:'terminal',artifact,state:{status:'completed'},source:artifact?.source,...metadata});}
            const status=hasUnresolved?'unresolved':allSkipped?'skipped':'completed';
            const reason=status==='unresolved'?{code:'OUTPUT_UNRESOLVED',message:'An operation output is unresolved.'}:status==='skipped'?{code:'OUTPUT_SKIPPED',message:'The operation produced no active output.'}:undefined;
            unitStates.set(key,{status,...(reason?{reason}:{})});if(hasUnresolved)unresolved=true;emit('node-settled',{address:unit.address,status});
        }
        current=null;
        if(unresolved)return finish({...failure('UNRESOLVED_INPUT','A selected workflow output is unresolved; dependent work is held.'),unresolved:true});
        if(failures.length){
            const selected=plan.resolvedTarget;
            const targetReady=mode==='target'&&(selected?.kind==='terminal'?terminals.some(entry=>addressKey(entry.terminal.address)===addressKey(selected.address)):selected&&outputStates.get(artifactKey(selected))?.status==='completed');
            const rootReady=mode==='root'&&terminals.length>0&&(!nativeBoundary||unitStates.get(addressKey(nativeBoundary.address))?.status==='completed');
            if(!targetReady&&!rootReady)return finish(failure('RECOVERY_OUTPUT_UNAVAILABLE','No valid selected output remains after node failures.'));
        }
        const settlement=await hooks.settle?.({mode,failures:freezeArtifact([...failures]),terminals:mode==='root'?terminals:[],bindings:plan.primitives.flatMap(unit=>[...requestBindings.values()].filter(entry=>addressKey(entry.address)===addressKey(unit.address)))});
        if(stopped())return finish(failure('ABORTED','Workflow was stopped.'));if(settlement?.ok===false)return finish(settlement);
        return finish({ok:true});
    } catch {return finish(failure(stopped()?'ABORTED':'WORKFLOW_FAILED','Workflow preparation failed; inspect the source, connection and tokenizer.',current?.node.id));}
    finally {removeAbort();artifacts.clear();outputStates.clear();unitStates.clear();bindings.clear();requestBindings.clear();bindingReports.clear();nodeCalls.clear();helperPrograms.clear();terminals.length=0;plan=null;safePlan=null;recorder=null;current=null;}
}
