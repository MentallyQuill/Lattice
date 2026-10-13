import { validVisibilityMetadata } from '../artifact-privacy.js?v=0.27.2';
import { cloneJsonValue } from '../operations/json-data.js?v=0.27.2';

export const COLLECTIONS = Object.freeze(['traits', 'beliefs', 'goals', 'relationships', 'conflicts', 'conditions', 'episodes']);
const WRITABLE = COLLECTIONS.filter(key => key !== 'traits');
const TYPES = ['actor-state', 'reflection', 'state-proposal', 'events', 'episodes', 'commit-intent'];
const PHASES = ['onset', 'peak', 'plateau', 'decline', 'aftermath', 'baseline'];
export const fail = (code, message) => ({ ok: false, error: { code, message } });
const good = data => ({ ok: true, data });
const check = (condition, message) => { if (!condition) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
const text = value => typeof value === 'string' && value.length <= 4096;
const version = value => Number.isSafeInteger(value) && value >= 0;
const exact = (value, allowed, required = allowed) => {
    check(object(value) && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key)), 'Unexpected or missing record fields.');
};
const list = (value, max = 64) => check(Array.isArray(value) && value.length <= max, 'Collection exceeds its limit.');
const unique = (values, key = value => value) => check(new Set(values.map(key)).size === values.length, 'Duplicate identities.');
const refKey = ref => JSON.stringify([ref.id, ref.revision]);
function refs(value) {
    list(value); unique(value, refKey);
    for (const ref of value) { exact(ref, ['id', 'revision']); check(id(ref.id) && id(ref.revision), 'Invalid source identity or revision.'); }
}
function rejectKeys(value) {
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
        check(!['__proto__', 'prototype', 'constructor'].includes(key), 'Unsafe data key.');
        rejectKeys(value[key]);
    }
}
export function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
}
export function ownData(value) {
    const cloned = cloneJsonValue(value);
    if (!cloned.ok) return cloned;
    try { rejectKeys(cloned.data.value); return good(cloned.data.value); }
    catch (error) { return fail('INVALID_INTROSPECTION_RECORD', error.message); }
}
/** Inspect injected capabilities without evaluating accessors or cloning host functions. */
export function inspectCapabilities(value, depth = 0) {
    try {
        check(depth <= 4, 'Nested capabilities exceed their limit.');
        check(object(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'Capabilities must be a plain own-data object.');
        const output = {}, properties = Object.getOwnPropertyDescriptors(value);
        check(Reflect.ownKeys(properties).length <= 64, 'Too many injected capabilities.');
        for (const key of Reflect.ownKeys(properties)) {
            const property = properties[key];
            check(typeof key === 'string' && !['__proto__','prototype','constructor'].includes(key) && property.enumerable && Object.hasOwn(property,'value'), 'Capabilities cannot contain accessors or inherited fields.');
            Object.defineProperty(output,key,{value:property.value,enumerable:true,writable:true,configurable:true});
        }
        if (output.signal !== undefined) {
            Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(output.signal);
            let prototype=output.signal;
            while (prototype && prototype !== AbortSignal.prototype) {
                check(!Object.hasOwn(prototype,'aborted'), 'Cancellation state cannot be shadowed.');
                prototype=Object.getPrototypeOf(prototype);
            }
        }
        for (const key of ['root','preview','dryRun']) if (output[key] !== undefined) check(typeof output[key] === 'boolean', 'Lifecycle flags must be booleans.');
        for (const key of ['request','countTokens']) if (output[key] !== undefined) check(typeof output[key] === 'function', 'Injected request/token ports must be functions.');
        if (output.phase !== undefined) check(['pre','post'].includes(output.phase), 'Invalid execution phase.');
        if (output.memory !== undefined) {
            const memory = inspectCapabilities(output.memory,depth+1); check(memory.ok, 'Memory methods must be own data properties.');
            for (const key of ['read','recall','commit']) if (memory.data[key] !== undefined) check(typeof memory.data[key] === 'function', 'Memory ports must be functions.');
            output.memory = memory.data;
        }
        if (output.bindings !== undefined) { const bindings=ownData(output.bindings);check(bindings.ok,'Bindings must be plain data.');output.bindings=bindings.data; }
        if (output.binding !== undefined) { const binding=ownData(output.binding);check(binding.ok,'Binding must be plain data.');output.binding=binding.data; }
        return good(output);
    } catch { return fail('INVALID_PORTS','Expected own injected capabilities and a valid AbortSignal.'); }
}
function membership(requested, allowed) {
    const keys = new Set(allowed.map(refKey));
    check(requested.every(ref => keys.has(refKey(ref))), 'Source evidence is missing or has changed revision.');
}
export function validateEvidence(requested, allowed) {
    const input = ownData({ requested, allowed });
    if (!input.ok) return input;
    try { refs(input.data.requested); refs(input.data.allowed); membership(input.data.requested, input.data.allowed); return good(undefined); }
    catch (error) { return fail('INVALID_INTROSPECTION_EVIDENCE', error.message); }
}
function item(value, allowed) {
    exact(value, ['id', 'text', 'classification', 'sourceRefs']);
    check(id(value.id) && text(value.text) && ['observation', 'interpretation', 'possibility'].includes(value.classification), 'Invalid actor-state item.');
    refs(value.sourceRefs); membership(value.sourceRefs, allowed);
}
function items(value, allowed) { list(value); for (const entry of value) item(entry, allowed); unique(value, entry => entry.id); }
function maps(payload) {
    for (const key of ['values', 'curves', 'tracks']) {
        check(object(payload[key]) && Object.keys(payload[key]).length <= 32 && Object.keys(payload[key]).every(id), 'Invalid state map.');
    }
    check(Object.values(payload.values).every(Number.isFinite), 'Values must be finite numbers.');
    for (const curve of Object.values(payload.curves)) {
        exact(curve, ['phase', 'value', 'elapsed']);
        check(PHASES.includes(curve.phase) && Number.isFinite(curve.value) && version(curve.elapsed), 'Invalid curve.');
    }
    for (const track of Object.values(payload.tracks)) {
        exact(track, ['eventIds', 'count']); list(track.eventIds); unique(track.eventIds);
        check(track.eventIds.every(id) && track.count === track.eventIds.length, 'Track count must match distinct event IDs.');
    }
}
function defaults(type, payload) {
    check(object(payload), 'Payload must be an object.');
    if (type === 'actor-state') return { ...Object.fromEntries(COLLECTIONS.map(key => [key, []])), values: {}, curves: {}, tracks: {}, ...payload };
    if (type === 'state-proposal') return { changes: [], values: {}, curves: {}, tracks: {}, ...payload };
    if (type === 'reflection') return { brief: '', appraisals: [], conflicts: [], recalls: [], sceneChanges: [], behaviorHints: [], attentionHints: [], recalledEpisodeIds: [], ...payload };
    return payload;
}
function record(value, expectedType) {
    exact(value, ['schemaVersion', 'recordType', 'scope', 'store', 'sourceRefs', 'payload']);
    check(value.schemaVersion === 1 && TYPES.includes(value.recordType) && (!expectedType || expectedType === value.recordType), 'Invalid record type or schema version.');
    exact(value.scope, ['chatId', 'actorId']); check(id(value.scope.chatId) && id(value.scope.actorId), 'Invalid scope.');
    exact(value.store, ['id', 'version']); check(id(value.store.id) && version(value.store.version), 'Invalid store or version.'); refs(value.sourceRefs);
    const p = value.payload;
    if (value.recordType === 'actor-state') {
        exact(p, [...COLLECTIONS, 'values', 'curves', 'tracks']);
        for (const key of COLLECTIONS) items(p[key], value.sourceRefs);
        maps(p);
    } else if (value.recordType === 'reflection') {
        const arrays = ['appraisals', 'conflicts', 'recalls', 'sceneChanges', 'behaviorHints', 'attentionHints'];
        exact(p, ['brief', ...arrays, 'recalledEpisodeIds']); check(text(p.brief), 'Invalid reflection brief.');
        for (const key of arrays) { list(p[key]); check(p[key].every(text), 'Invalid reflection text.'); }
        list(p.recalledEpisodeIds); check(p.recalledEpisodeIds.every(id), 'Invalid recalled episode identity.'); unique(p.recalledEpisodeIds);
    } else if (value.recordType === 'state-proposal') {
        exact(p, ['changes', 'values', 'curves', 'tracks']); list(p.changes, 32); maps(p);
        const changed = [];
        for (const change of p.changes) {
            check(object(change) && WRITABLE.includes(change.collection), 'Enduring traits are protected.');
            if (change.op === 'upsert') { exact(change, ['op', 'collection', 'item']); item(change.item, value.sourceRefs); changed.push(`${change.collection}:${change.item.id}`); }
            else { exact(change, ['op', 'collection', 'id']); check(change.op === 'remove' && id(change.id), 'Invalid state change.'); changed.push(`${change.collection}:${change.id}`); }
        }
        unique(changed);
    } else if (value.recordType === 'events') {
        exact(p, ['events']); list(p.events); unique(p.events, event => event.id);
        for (const event of p.events) {
            exact(event, ['id', 'revision', 'text', 'settled']);
            check(id(event.id) && id(event.revision) && text(event.text) && event.settled === true, 'Events must be settled.');
            membership([{ id: event.id, revision: event.revision }], value.sourceRefs);
        }
    } else if (value.recordType === 'episodes') { exact(p, ['episodes']); items(p.episodes, value.sourceRefs); }
    else {
        exact(p, ['proposal', 'idempotencyKey']); check(id(p.idempotencyKey), 'Invalid idempotency key.'); record(p.proposal, 'state-proposal');
        check(sameIdentity(value, p.proposal), 'Commit intent identity differs from proposal.');
        membership(p.proposal.sourceRefs, value.sourceRefs);
    }
    return value;
}
export function parseRecord(artifact, expectedType) {
    const input = ownData(artifact); if (!input.ok) return input;
    try { exact(input.data, ['kind', 'value', 'visibility'], ['kind', 'value']); check(validVisibilityMetadata(input.data), 'Invalid artifact disclosure scope.'); check(input.data.kind === 'data', 'Expected a Data artifact.'); return good(freeze(record(input.data.value, expectedType))); }
    catch (error) { return fail('INVALID_INTROSPECTION_RECORD', error.message); }
}
export function makeRecord(recordType, base, payload, sourceRefs) {
    // Validate all supplied data before inspecting fields or merging defaults.
    const input = ownData({ recordType, base, payload, ...(sourceRefs === undefined ? {} : { sourceRefs }) }); if (!input.ok) return input;
    try {
        const owned = input.data;
        check(object(owned.base), 'Invalid record base.');
        const value = { schemaVersion: 1, recordType: owned.recordType, scope: owned.base.scope, store: owned.base.store, sourceRefs: owned.sourceRefs ?? owned.base.sourceRefs ?? [], payload: defaults(owned.recordType, owned.payload) };
        const parsed = parseRecord({ kind: 'data', value });
        return parsed.ok ? good(freeze({ kind: 'data', value: parsed.data })) : parsed;
    } catch (error) { return fail('INVALID_INTROSPECTION_RECORD', error.message); }
}
export function createActorState(scope, store = { id: 'introspection', version: 0 }, initial = {}) {
    const input = ownData({ scope, store, initial }); if (!input.ok) return input;
    try {
        check(object(input.data.initial), 'Invalid initial state.');
        const evidence = new Map();
        for (const key of COLLECTIONS) for (const entry of input.data.initial[key] ?? []) for (const ref of entry.sourceRefs ?? []) evidence.set(refKey(ref), ref);
        return makeRecord('actor-state', { scope: input.data.scope, store: input.data.store }, input.data.initial, [...evidence.values()]);
    } catch (error) { return fail('INVALID_INTROSPECTION_RECORD', error.message); }
}
export function sameIdentity(a, b) {
    return a.scope.chatId === b.scope.chatId && a.scope.actorId === b.scope.actorId && a.store.id === b.store.id && a.store.version === b.store.version;
}
export function applyStateProposal(stateArtifact, proposalArtifact) {
    const state = parseRecord(stateArtifact, 'actor-state'); if (!state.ok) return state;
    const proposal = parseRecord(proposalArtifact, 'state-proposal'); if (!proposal.ok) return proposal;
    if (!sameIdentity(state.data, proposal.data)) return fail('STALE_INTROSPECTION_STATE', 'Proposal scope, store or prior version differs from state.');
    const p = structuredClone(state.data.payload), patch = proposal.data.payload;
    for (const change of patch.changes) {
        const index = p[change.collection].findIndex(entry => entry.id === (change.item?.id ?? change.id));
        if (change.op === 'remove') { if (index >= 0) p[change.collection].splice(index, 1); }
        else if (index >= 0) p[change.collection][index] = structuredClone(change.item);
        else p[change.collection].push(structuredClone(change.item));
    }
    for (const key of ['values', 'curves', 'tracks']) Object.assign(p[key], structuredClone(patch[key]));
    const evidence = new Map([...state.data.sourceRefs, ...proposal.data.sourceRefs].map(ref => [refKey(ref), ref]));
    return makeRecord('actor-state', state.data, p, [...evidence.values()]);
}
