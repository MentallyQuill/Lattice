import { readDraftBody } from '../draft-revisions.js?v=0.27.3';
import { cloneJsonValue } from './json-data.js?v=0.27.3';

const failure = (code, message) => ({ ok: false, error: { code, message } });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
const id = value => typeof value === 'string' && !!value.trim() && value.length <= 256;
const semantics = ['actual', 'mention', 'planned', 'threatened', 'recalled', 'proposed', 'uncertain'];
const watches = ['player-message', 'draft', 'scene-context', 'accepted-event'];
const kinds = ['item-used', 'item-mentioned', 'item-transferred', 'actor-entered', 'actor-exited', 'scene-action'];
const checked = value => cloneJsonValue(value);
function validSource(source, text = true) {
    return exact(source, ['sourceId','revision','sceneId','watch','text','visibility','actorId'])
        && id(source.sourceId) && id(source.revision) && id(source.sceneId) && watches.includes(source.watch)
        && ['public','actor-private'].includes(source.visibility)
        && (source.visibility !== 'actor-private' || id(source.actorId))
        && (source.actorId === undefined || id(source.actorId))
        && (!text || typeof source.text === 'string' && source.text.length <= 100000);
}
function occurrenceIdentity(event) {
    return 'event:' + JSON.stringify([event.source.sourceId,event.source.revision,event.sceneId,event.eventType,event.position.start,event.position.end,event.actorId,event.itemId ?? null,event.objectId ?? null]);
}
function validOccurrence(event) {
    if (!exact(event, ['schemaVersion','recordType','eventId','eventType','sceneId','source','actorId','objectId','itemId','position','evidence','semantics','status','acceptance','holderId','confirmation'])
        || event.schemaVersion !== 1 || event.recordType !== 'occurrence' || !kinds.includes(event.eventType)
        || !id(event.actorId) || event.objectId !== undefined && !id(event.objectId) || event.itemId !== undefined && !id(event.itemId)
        || !validSource(event.source, false) || event.source.text !== undefined || event.sceneId !== event.source.sceneId
        || !exact(event.position, ['start','end']) || !Number.isSafeInteger(event.position.start) || !Number.isSafeInteger(event.position.end)
        || event.position.start < 0 || event.position.end <= event.position.start || event.position.end > 100000
        || !semantics.includes(event.semantics) || !['candidate','confirmed'].includes(event.status) || event.acceptance !== 'pending'
        || !exact(event.evidence, ['origin','sourceId','revision','position','text']) || event.evidence.origin !== event.source.watch
        || event.evidence.sourceId !== event.source.sourceId || event.evidence.revision !== event.source.revision
        || typeof event.evidence.text !== 'string' || event.evidence.text.length !== event.position.end - event.position.start
        || !exact(event.evidence.position, ['start','end']) || event.evidence.position.start !== event.position.start || event.evidence.position.end !== event.position.end
        || event.eventId !== occurrenceIdentity(event)
        || event.eventType.startsWith('item-') && !id(event.itemId)
        || event.eventType === 'item-transferred' && (!id(event.objectId) || event.objectId === event.actorId)
        || event.holderId !== undefined && !id(event.holderId)
        || event.status === 'candidate' && event.confirmation !== undefined
        || event.status === 'confirmed' && (!exact(event.confirmation, ['accepted']) || event.confirmation.accepted !== true || event.semantics !== 'actual' && !(event.eventType === 'item-mentioned' && event.semantics === 'mention'))) return false;
    return true;
}
export function validateOccurrences(raw, rawOptions = {}) {
    const options = checked(rawOptions); if (!options.ok) return options;
    if (!exact(options.data.value, ['status']) || options.data.value.status !== undefined && !['candidate','confirmed'].includes(options.data.value.status)) return failure('INVALID_EVENTS','Use a declared occurrence status.');
    const status = options.data.value.status;
    const result = checked(raw); if (!result.ok) return result;
    const events = result.data.value;
    if (!Array.isArray(events) || events.length > 256 || events.some(event => !validOccurrence(event) || status && event.status !== status)
        || new Set(events.map(event => event.eventId)).size !== events.length) return failure('INVALID_EVENTS', 'Use distinct bounded occurrence records with canonical source evidence.');
    return { ok: true, data: { events } };
}
/** Model/extractor candidates remain pending and cannot grant settlement authority. */
export function normalizeOccurrences(rawSource, rawCandidates, rawEntities) {
    const inputs = checked({ source: rawSource, candidates: rawCandidates, entities: rawEntities }); if (!inputs.ok) return inputs;
    const { source, candidates, entities } = inputs.data.value;
    if (!validSource(source) || !exact(entities,['actorIds','itemIds']) || !Array.isArray(entities.actorIds) || !Array.isArray(entities.itemIds)
        || entities.actorIds.length > 128 || entities.itemIds.length > 128 || [...entities.actorIds,...entities.itemIds].some(value => !id(value))
        || new Set(entities.actorIds).size !== entities.actorIds.length || new Set(entities.itemIds).size !== entities.itemIds.length
        || !Array.isArray(candidates) || candidates.length > 256) return failure('INVALID_EVENTS', 'Candidates require a bounded source and canonical actor/item identities.');
    const sourceRef = { ...source }; delete sourceRef.text;
    const events = [];
    for (const candidate of candidates) {
        if (!exact(candidate,['eventType','actorId','objectId','itemId','position','semantics']) || !kinds.includes(candidate.eventType)
            || !entities.actorIds.includes(candidate.actorId) || candidate.objectId !== undefined && !entities.actorIds.includes(candidate.objectId)
            || candidate.itemId !== undefined && !entities.itemIds.includes(candidate.itemId) || candidate.eventType.startsWith('item-') && !candidate.itemId
            || !exact(candidate.position,['start','end']) || !Number.isSafeInteger(candidate.position.start) || !Number.isSafeInteger(candidate.position.end)
            || candidate.position.start < 0 || candidate.position.end <= candidate.position.start || candidate.position.end > source.text.length
            || !semantics.includes(candidate.semantics)) return failure('INVALID_CANDIDATE','Candidates must retain known entities and exact source spans.');
        const event = {
            schemaVersion: 1, recordType: 'occurrence', ...candidate, sceneId: source.sceneId, source: sourceRef,
            evidence: { origin: source.watch, sourceId: source.sourceId, revision: source.revision, position: { ...candidate.position }, text: source.text.slice(candidate.position.start,candidate.position.end) },
            status: 'candidate', acceptance: 'pending',
        };
        event.eventId = occurrenceIdentity(event);
        events.push(event);
    }
    events.sort((a,b) => a.position.start - b.position.start || a.position.end - b.position.end || a.eventId.localeCompare(b.eventId));
    return validateOccurrences(events);
}
/** Affirmative/negative decisions map only to existing event IDs; uncertainty holds the collection. */
export function confirmOccurrences(rawCandidates, rawDecisions) {
    const candidates = validateOccurrences(rawCandidates, { status: 'candidate' }); if (!candidates.ok) return candidates;
    const validated = checked(rawDecisions); if (!validated.ok) return validated;
    const decisions = validated.data.value, events = candidates.data.events;
    if (!Array.isArray(decisions) || decisions.length !== events.length || new Set(decisions.map(value => value?.eventId)).size !== decisions.length
        || decisions.some(value => !exact(value,['eventId','accepted','status']) || !events.some(event => event.eventId === value.eventId)
            || value.status !== undefined && !['resolved','unresolved'].includes(value.status)
            || value.status !== 'unresolved' && typeof value.accepted !== 'boolean'
            || value.status === 'unresolved' && value.accepted !== undefined)) return failure('INVALID_CONFIRMATIONS', 'A checked decision is required for each unchanged candidate identity.');
    if (decisions.some(value => value.status === 'unresolved')) return failure('UNRESOLVED_EVENTS','At least one occurrence is uncertain; no partial confirmed collection is emitted.');
    const confirmed = [];
    for (const event of events) {
        const decision = decisions.find(value => value.eventId === event.eventId);
        if (!decision.accepted) continue;
        if (event.semantics !== 'actual' && !(event.eventType === 'item-mentioned' && event.semantics === 'mention')) return failure('INCONSISTENT_CONFIRMATION','A planned, recalled, threatened or uncertain occurrence cannot be confirmed as an actual event.');
        confirmed.push({ ...event, status: 'confirmed', confirmation: { accepted: true } });
    }
    const output = checked({ events: confirmed, rejectedIds: events.filter(event => !decisions.find(value => value.eventId === event.eventId).accepted).map(event => event.eventId), actualCalls: 0 });
    return output.ok ? { ok: true, data: output.data.value } : output;
}
/** Fold actual transfers before each later use, rather than attributing by speaker or owner. */
export function resolveItemHolders(rawHolders, rawEvents) {
    const validated = checked(rawHolders); if (!validated.ok) return validated;
    const holders = validated.data.value;
    if (!object(holders) || Object.keys(holders).some(key => !id(key) || holders[key] !== null && !id(holders[key]))) return failure('INVALID_HOLDERS','Holder state must map canonical item IDs to actor IDs or explicit unknown null.');
    const checkedEvents = validateOccurrences(rawEvents, { status: 'confirmed' }); if (!checkedEvents.ok) return checkedEvents;
    const events = checkedEvents.data.events;
    if (events.some(event => event.sceneId !== events[0]?.sceneId || event.source.sourceId !== events[0]?.source.sourceId || event.source.revision !== events[0]?.source.revision)) return failure('EVENT_ORDER','Fold one explicitly ordered source revision at a time.');
    if (events.some((event,index) => index > 0 && event.position.start < events[index - 1].position.start)) return failure('EVENT_ORDER','Events must be chronological.');
    const lastPositions = new Map();
    for (const event of events.filter(event => ['item-used','item-transferred'].includes(event.eventType))) {
        const previous = lastPositions.get(event.itemId);
        if (previous && event.position.start < previous.end) return failure('EVENT_ORDER','Overlapping use/transfer evidence cannot establish a holder sequence.');
        lastPositions.set(event.itemId,event.position);
    }
    const resolved = [];
    for (const event of events) {
        if (!event.itemId) { resolved.push(event); continue; }
        const holder = Object.hasOwn(holders,event.itemId) ? holders[event.itemId] : null;
        if (!holder) return failure('UNRESOLVED_HOLDER','The active item holder is unknown.');
        if (['item-used','item-transferred'].includes(event.eventType) && holder !== event.actorId) return failure('HOLDER_CONFLICT','The attributed actor does not hold this item at the event position.');
        resolved.push({ ...event, holderId: holder });
        if (event.eventType === 'item-transferred') Object.defineProperty(holders,event.itemId,{ value: event.objectId, enumerable: true, configurable: true, writable: true });
    }
    const output = checked({ events: resolved, holders, actualCalls: 0 });
    return output.ok ? { ok: true, data: output.data.value } : output;
}
/** Literal mention detection has no semantic model call and never claims that an item was used. */
export function matchLiteralTrigger(rawSource, rawSettings, rawEntities, rawState = { matched: false, consumedActivationIds: [] }) {
    const validated = checked({ source: rawSource, settings: rawSettings, state: rawState }); if (!validated.ok) return validated;
    const { source, settings, state } = validated.data.value;
    if (!validSource(source) || !exact(settings,['aliases','itemId','actorId','activation','watch','caseSensitive'])
        || !Array.isArray(settings.aliases) || !settings.aliases.length || settings.aliases.length > 32 || settings.aliases.some(alias => typeof alias !== 'string' || !alias.trim() || alias.length > 2048)
        || new Set(settings.aliases).size !== settings.aliases.length || !id(settings.itemId) || !id(settings.actorId)
        || !['per-occurrence','once-per-source','edge-once'].includes(settings.activation)
        || !watches.includes(settings.watch) || settings.caseSensitive !== undefined && typeof settings.caseSensitive !== 'boolean'
        || !exact(state,['matched','consumedActivationIds']) || typeof state.matched !== 'boolean' || !Array.isArray(state.consumedActivationIds)
        || state.consumedActivationIds.length > 1024 || state.consumedActivationIds.some(value => typeof value !== 'string' || value.length > 2048)
        || new Set(state.consumedActivationIds).size !== state.consumedActivationIds.length) return failure('INVALID_TRIGGER','Use an explicit watched source, canonical entities and bounded literal activation policy.');
    if (source.watch !== settings.watch) return failure('WATCH_MISMATCH','The source does not match the trigger Watch setting.');
    const matches = [];
    const startsWithWord = text => /^[\p{L}\p{N}_]/u.test(text);
    const endsWithWord = text => /[\p{L}\p{N}_]$/u.test(text);
    for (const alias of settings.aliases) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const matcher = new RegExp(escaped, settings.caseSensitive ? 'gu' : 'giu');
        for (const match of source.text.matchAll(matcher)) {
            const start = match.index, end = start + match[0].length;
            if (startsWithWord(alias) && endsWithWord(source.text.slice(0,start)) || endsWithWord(alias) && startsWithWord(source.text.slice(end))) continue;
            matches.push({ start, end });
            if (matches.length > 1024) return failure('TRIGGER_LIMIT','The watched source contains too many matches.');
        }
    }
    matches.sort((a,b) => a.start - b.start || b.end - a.end);
    const distinct = [];
    for (const match of matches) if (!distinct.length || match.start >= distinct.at(-1).end) distinct.push(match);
    if (distinct.length > 256) return failure('TRIGGER_LIMIT','The watched source contains more than 256 distinct mentions.');
    const matched = distinct.length > 0;
    const selected = settings.activation === 'per-occurrence' ? distinct : settings.activation === 'edge-once' && state.matched ? [] : distinct.slice(0,1);
    const normalized = normalizeOccurrences(source, selected.map(position => ({ eventType: 'item-mentioned', actorId: settings.actorId, itemId: settings.itemId, position, semantics: 'mention' })), rawEntities);
    if (!normalized.ok) return normalized;
    const consumed = [...state.consumedActivationIds], activationIds = [], events = [];
    for (const event of normalized.data.events) {
        const activationId = settings.activation === 'per-occurrence' ? event.eventId : 'trigger:' + JSON.stringify([source.sourceId,source.revision,source.sceneId,settings.actorId,settings.itemId,settings.activation]);
        if (consumed.includes(activationId)) continue;
        activationIds.push(activationId); consumed.push(activationId);
        events.push({ ...event, status: 'confirmed', confirmation: { accepted: true } });
    }
    if (consumed.length > 1024 || consumed.some(value => value.length > 2048)) return failure('TRIGGER_STATE_LIMIT','Trigger state must retain at most 1024 IDs of at most 2048 characters; shorten identifiers or reset/prune state.');
    const output = checked({ events, activationIds, triggerState: { matched, consumedActivationIds: consumed }, actualCalls: 0 });
    return output.ok ? { ok: true, data: output.data.value } : output;
}
/** Explicit adaptation retains the canonical occurrence tuple while giving progression a bounded event ID. */
export async function toProgressionEvents(rawEvents,rawSettings={}) {
    const validated=validateOccurrences(rawEvents,{status:'confirmed'});if(!validated.ok)return validated;
    const options=checked(rawSettings);if(!options.ok)return options;
    const settings=options.data.value;
    if(!exact(settings,['eventType','absoluteMinute'])||settings.eventType!==undefined&&!id(settings.eventType)
        ||settings.absoluteMinute!==undefined&&(!Number.isSafeInteger(settings.absoluteMinute)||settings.absoluteMinute<0))return failure('INVALID_EVENTS','Progression adaptation uses only an authored event type and explicit story minute.');
    const events=[];
    for(const event of validated.data.events) {
        const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(event.eventId));
        const eventId='event-sha256:'+Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
        events.push({eventId,eventType:settings.eventType??event.eventType,
            identity:{occurrenceId:eventId,sourceId:event.source.sourceId,sourceRevision:event.source.revision,sceneId:event.sceneId,actorId:event.actorId,...(event.itemId?{itemId:event.itemId}:{}),...(event.objectId?{objectId:event.objectId}:{}),positionStart:event.position.start,positionEnd:event.position.end},
            status:'confirmed',acceptance:'pending',evidence:{...event.evidence,occurrenceId:event.eventId},subjectId:event.actorId,...(event.objectId?{objectId:event.objectId}:{}),sceneId:event.sceneId,
            visibility:event.source.visibility,...(settings.absoluteMinute===undefined?{}:{absoluteMinute:settings.absoluteMinute}),
        });
    }
    const bounded=checked({events,actualCalls:0});return bounded.ok?{ok:true,data:bounded.data.value}:bounded;
}
/** The trusted host supplies source identity. Appended notes never become qualifying scene evidence. */
export function sourceFromDraft(draft,rawScope) {
    const checkedScope=checked(rawScope);if(!checkedScope.ok)return checkedScope;
    const scope=checkedScope.data.value;
    if(!exact(scope,['sourceId','revision','sceneId','visibility','actorId']))return failure('INVALID_EVENTS','Draft evidence requires an explicit captured source scope.');
    const body=readDraftBody(draft);if(!body.ok)return body;
    const source={...scope,revision:body.data.provenance.revisionId??scope.revision,watch:'draft',text:body.data.text};
    if(!validSource(source))return failure('INVALID_EVENTS','Draft evidence requires canonical source, scene and visibility identifiers.');
    return {ok:true,data:{source,provenance:body.data.provenance}};
}