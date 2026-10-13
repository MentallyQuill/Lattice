import { executeContextJoin } from '../operations/context-join.js?v=0.27.3';
import { parseRuntimeContext, canonicalContextData } from '../operations/context-data.js?v=0.27.3';
import { compactContext } from '../compactor.js?v=0.27.3';
import { fail, freeze, ownData, parseRecord, makeRecord, sameIdentity, validateEvidence, inspectCapabilities } from './contracts.js?v=0.27.3';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
const boundedInt = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const failure = (code, message) => freeze(fail(code, message));
const success = (artifact, reports = []) => freeze({ok:true,artifact,reports});
const contextKeys = ['mode','inputCount','actorId','method','targetTokens','maxTokens','keepRecent','pins','purpose','id','modelRole'];
const stateKeys = ['mode','actorId','updates','min','max','curveId','steps','decay','baseline','durations','trackId'];
const phases = ['onset','peak','plateau','decline','aftermath','baseline'];
const defaultDurations = {onset:1,peak:1,plateau:1,decline:1,aftermath:1};
function settingsData(settings, keys) {
    const parsed = ownData(settings);
    if (!parsed.ok || !object(parsed.data) || Object.keys(parsed.data).some(key => !keys.includes(key))) return failure('INVALID_SETTINGS','Settings must contain only supported plain data controls.');
    return parsed;
}
function contextSettings(settings) {
    const parsed = settingsData(settings, contextKeys); if (!parsed.ok) return parsed;
    const s = parsed.data;
    if (!['assemble','perspective','focus'].includes(s.mode ?? 'assemble') || !boundedInt(s.inputCount ?? 2,2,16) || (Object.hasOwn(s,'actorId') && !id(s.actorId)) || (Object.hasOwn(s,'id') && !id(s.id)) || (Object.hasOwn(s,'modelRole') && s.modelRole !== 'Analysis') || !['select','compress'].includes(s.method ?? 'select') || !boundedInt(s.targetTokens ?? 1200,1,65536) || !boundedInt(s.maxTokens ?? 1024,1,65536) || !boundedInt(s.keepRecent ?? 2,0,1000) || typeof (s.purpose ?? '') !== 'string' || (s.purpose ?? '').length > 4096 || !Array.isArray(s.pins ?? []) || (s.pins ?? []).length > 64 || (s.pins ?? []).some(pin => typeof pin !== 'string' || !pin.length || pin.length > 4096)) return failure('INVALID_SETTINGS','Context requires bounded settings for a supported mode.');
    if (s.mode === 'perspective' && !id(s.actorId)) return failure('INVALID_SETTINGS','Perspective requires an explicit actor ID.');
    return parsed;
}
const sampleIds = ids => ({ids:ids.slice(0,64),omitted:Math.max(0,ids.length-64)});

/** Shape named Context inputs without accessing a host or resolving private providers. */
export async function shapeContext(namedInputs, settings = {}, ports = {}) {
    try {
        const capabilities=inspectCapabilities(ports); if (!capabilities.ok) return freeze(capabilities);
        ports=capabilities.data;
        const parsedSettings = contextSettings(settings); if (!parsedSettings.ok) return parsedSettings;
        const s = parsedSettings.data, mode = s.mode ?? 'assemble';
        const inputs = ownData(namedInputs); if (!inputs.ok || !object(inputs.data)) return failure('INVALID_CONTEXT','Context requires a bounded plain named-input map.');
        if (ports.signal?.aborted) return failure('ABORTED','Context shaping was stopped.');
        if (mode === 'assemble') {
            return executeContextJoin({type:'workflow',operation:'context-join',operationVersion:1,
                inputs:Array.from({length:s.inputCount ?? 2},(_,index) => ({id:`in${index+1}`,label:`Context ${index+1}`}))},inputs.data);
        }
        if (Object.keys(inputs.data).some(key => key !== 'context') || !Object.hasOwn(inputs.data,'context')) return failure('MISSING_INPUT','This Context mode requires its named context input.');
        const parsed = parseRuntimeContext(inputs.data.context); if (!parsed.ok) return freeze(parsed);
        if (mode === 'focus') {
            const inputFingerprint=canonicalContextData(inputs.data);
            const {mode:unusedMode,inputCount:unusedCount,actorId:unusedActor,...compactionSettings} = s;
            let tokenResultFailure;
            const compactionPorts={...ports,...(ports.countTokens ? {countTokens:async text => {
                const result=ownData(await ports.countTokens(text));
                if (!result.ok) {tokenResultFailure=result;throw new Error('Token result must contain bounded own data.');}
                return result.data;
            }} : {}),...(ports.request ? {request:async request => {
                const result=ownData(await ports.request(request));
                return result.ok ? result.data : result;
            }} : {})};
            const compacted = await compactContext(parsed.data,compactionSettings,compactionPorts);
            if (ports.signal?.aborted) return failure('ABORTED','Context shaping was stopped; ignore its late result.');
            const currentInputs=ownData(namedInputs);
            if (!currentInputs.ok || canonicalContextData(currentInputs.data) !== inputFingerprint) return failure('STALE_INPUT','Supplied Context changed while Focus was pending.');
            if (tokenResultFailure) return freeze(tokenResultFailure);
            if (!compacted.ok) return failure(compacted.error.code,compacted.error.message);
            const output = ownData({artifact:compacted.artifact,reports:compacted.reports}); if (!output.ok) return failure('INVALID_CONTEXT','Focus produced malformed or oversized Context.');
            const artifact = parseRuntimeContext(output.data.artifact); if (!artifact.ok) return freeze(artifact);
            return success(artifact.data,output.data.reports);
        }
        const context = parsed.data;
        const material = [...context.messages,...(context.original ?? [])];
        if (material.some(message => Object.hasOwn(message,'visibleTo') && (!Array.isArray(message.visibleTo) || message.visibleTo.length > 64 || !message.visibleTo.every(id)))) return failure('INVALID_CONTEXT','Explicit visibility must be a bounded array of actor IDs.');
        if (!context.messages.some(message => Object.hasOwn(message,'visibleTo'))) return failure('VISIBILITY_REQUIRED','Perspective requires explicit visibility on supplied messages.');
        if (material.some(message => Object.hasOwn(message,'revision') && !id(message.revision))) return failure('INVALID_CONTEXT','Message evidence revisions must be bounded IDs.');
        const visible = message => Array.isArray(message.visibleTo) && message.visibleTo.includes(s.actorId);
        // Source/provenance metadata can embed complete private input Contexts.
        // Rebuild retained messages from explicit content and evidence fields only.
        const retain = message => ({id:message.id,role:message.role,text:message.text,visibleTo:[...message.visibleTo],...(Object.hasOwn(message,'revision') ? {revision:message.revision} : {})});
        const omitted = sampleIds(context.messages.filter(message => !visible(message)).map(message => message.id));
        const originalOmitted = sampleIds((context.original ?? []).filter(message => !visible(message)).map(message => message.id));
        const retained = sampleIds(context.messages.filter(visible).map(message => message.id));
        const artifact = {kind:'context',messages:context.messages.filter(visible).map(retain),
            ...(Object.hasOwn(context,'original') ? {original:context.original.filter(visible).map(retain)} : {}),
            ...(context.derived === true ? {derived:true} : {}),
            source:{operation:'introspection-context',mode:'perspective',actorId:s.actorId,
                ...(object(context.source) && id(context.source.chatId) ? {chatId:context.source.chatId} : {})},
            provenance:{operation:'introspection-context',version:1,mode:'perspective',actorId:s.actorId,retainedMessageIds:retained.ids}};
        return success(artifact,[{code:'CONTEXT_PERSPECTIVE',actorId:s.actorId,retainedMessageIds:retained.ids,omittedMessageIds:omitted.ids,originalOmittedMessageIds:originalOmitted.ids,
            retainedCount:artifact.messages.length,omittedCount:context.messages.length-artifact.messages.length,
            ...(retained.omitted ? {retainedMessageIdsOmitted:retained.omitted} : {}),...(omitted.omitted ? {omittedMessageIdsOmitted:omitted.omitted} : {}),...(originalOmitted.omitted ? {originalOmittedMessageIdsOmitted:originalOmitted.omitted} : {}),
            message:'Visibility applies to this Context artifact. Independently assembled prompts may contain other material.'}]);
    } catch { return failure('INVALID_CONTEXT','Context shaping could not consume its inputs.'); }
}

function stateSettings(settings) {
    const parsed = settingsData(settings,stateKeys); if (!parsed.ok) return parsed;
    const s = parsed.data, min = s.min ?? 0, max = s.max ?? 1;
    if (!['value','curve','track'].includes(s.mode ?? 'value') || (Object.hasOwn(s,'actorId') && !id(s.actorId)) || !Number.isFinite(min) || !Number.isFinite(max) || min > max || (Object.hasOwn(s,'updates') && (!object(s.updates) || Object.keys(s.updates).length > 32 || Object.entries(s.updates).some(([key,value]) => !id(key) || !Number.isFinite(value) || value < min || value > max))) || !id(s.curveId ?? 'emotion') || !boundedInt(s.steps ?? 1,1,64) || !Number.isFinite(s.decay ?? 0.25) || (s.decay ?? 0.25) < 0 || (s.decay ?? 0.25) > 1 || !Number.isFinite(s.baseline ?? 0) || !id(s.trackId ?? 'consequences')) return failure('INVALID_SETTINGS','State requires bounded values and supported deterministic controls.');
    if (Object.hasOwn(s,'durations') && (!object(s.durations) || Object.entries(s.durations).some(([phase,duration]) => !Object.hasOwn(defaultDurations,phase) || !boundedInt(duration,1,64)))) return failure('INVALID_SETTINGS','Curve durations must be positive bounded phase durations.');
    return parsed;
}

/** Return a detached state snapshot or proposed deterministic change; never persist. */
export function advanceState(stateData, settings = {}, eventsData) {
    try {
        const parsedSettings = stateSettings(settings); if (!parsedSettings.ok) return parsedSettings;
        const state = parseRecord(stateData,'actor-state'); if (!state.ok) return freeze(state);
        const s = parsedSettings.data, base = state.data, mode = s.mode ?? 'value';
        if (s.actorId && s.actorId !== base.scope.actorId) return failure('ACTOR_MISMATCH','State settings refer to a different actor.');
        if (mode === 'value' && !Object.hasOwn(s,'updates')) return success(freeze({kind:'data',value:base}),[{code:'STATE_VALUE',mode:'read'}]);
        let payload, evidence = base.sourceRefs, report;
        if (mode === 'value') {
            payload = {values:s.updates}; report = {code:'STATE_VALUE',mode:'proposal',valueIds:Object.keys(s.updates)};
        } else if (mode === 'curve') {
            const curveId = s.curveId ?? 'emotion', baseline = s.baseline ?? 0, decay = s.decay ?? 0.25;
            const curve = structuredClone(Object.hasOwn(base.payload.curves,curveId) ? base.payload.curves[curveId] : {phase:'onset',value:baseline,elapsed:0});
            const durations = {...defaultDurations,...(s.durations ?? {})};
            for (let tick=0;tick<(s.steps ?? 1);tick++) {
                if (curve.phase === 'baseline') { curve.value=baseline;curve.elapsed=0;break; }
                curve.value = curve.value * (1-decay) + baseline * decay;
                curve.elapsed++;
                if (curve.elapsed >= durations[curve.phase]) {
                    curve.phase=phases[phases.indexOf(curve.phase)+1];curve.elapsed=0;
                    if (curve.phase === 'baseline') curve.value=baseline;
                }
            }
            if (!Number.isFinite(curve.value)) return failure('INVALID_STATE','Curve recovery exceeded numeric limits.');
            payload={curves:{[curveId]:curve}};report={code:'STATE_CURVE',curveId,steps:s.steps ?? 1,phase:curve.phase};
        } else {
            const events = parseRecord(eventsData,'events'); if (!events.ok) return freeze(events);
            if (!sameIdentity(base,events.data)) return failure('STALE_INTROSPECTION_STATE','Events scope, store or prior version differs from state.');
            const refs = events.data.payload.events.map(event => ({id:event.id,revision:event.revision}));
            const verified = validateEvidence(refs,events.data.sourceRefs); if (!verified.ok) return freeze(verified);
            const revisions = new Map();
            for (const ref of [...base.sourceRefs,...refs]) {
                if (revisions.has(ref.id) && revisions.get(ref.id) !== ref.revision) return failure('STALE_INTROSPECTION_STATE','An event revision changed after its recorded evidence.');
                revisions.set(ref.id,ref.revision);
            }
            const trackId=s.trackId ?? 'consequences', existing=Object.hasOwn(base.payload.tracks,trackId) ? base.payload.tracks[trackId].eventIds : [];
            const eventIds=[...new Set([...existing,...events.data.payload.events.map(event => event.id)])];
            if (eventIds.length > 64) return failure('TRACK_LIMIT','Track exceeds 64 distinct settled event IDs.');
            const refsById=new Map([...base.sourceRefs,...refs].map(ref => [ref.id,ref]));
            evidence=[...refsById.values()];
            if (evidence.length > 64) return failure('EVIDENCE_LIMIT','Track evidence exceeds 64 source references.');
            payload={tracks:{[trackId]:{eventIds,count:eventIds.length}}};report={code:'STATE_TRACK',trackId,count:eventIds.length,addedCount:eventIds.length-existing.length};
        }
        const candidate=makeRecord('state-proposal',base,payload,evidence);
        return candidate.ok ? success(candidate.data,[report]) : freeze(candidate);
    } catch { return failure('INVALID_STATE','State advancement could not consume its inputs.'); }
}
